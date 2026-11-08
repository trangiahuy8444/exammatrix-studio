"""
ExamMatrix Studio - AI Assistant Module
Powered by Google Gemini API (server-side key: env GEMINI_API_KEY)
Supports 3 intelligent modes:
1. Generate questions by Learning Outcome (YCCĐ) and cognitive level
2. Parse and structure raw exam text
3. Generate equivalent variants with altered parameters/context
"""
from __future__ import annotations
import json
import logging
import os
import re
import threading
import urllib.request
import urllib.error
from datetime import date
from typing import Any, Dict, List, Optional
from input_schema import canonical_short_answer

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
MAX_RAW_TEXT_LENGTH = 100000

SYSTEM_PROMPT = """Bạn là chuyên gia khảo thí và biên soạn học liệu giáo dục phổ thông Việt Nam (Chương trình GDPT 2018).
Nhiệm vụ của bạn là hỗ trợ giáo viên tạo câu hỏi kiểm tra đánh giá chuẩn mực sư phạm, chính xác về kiến thức khoa học và định dạng.
Nếu có công thức toán học hoặc ký hiệu khoa học, hãy đặt trong cặp dấu $ ... $ (ví dụ: $x^2 + y = 5$, $\\le$, $\\ge$).
Mọi phản hồi BẮT BUỘC trả về định dạng JSON thuần túy (không bọc trong markdown ```json)."""


class AiValidationError(ValueError):
    """Raised when AI output does not conform to the expected exam schema."""
    pass


def _sanitize_error_message(msg: str) -> str:
    if not msg:
        return msg
    # Redact any API key query parameters or raw key strings
    msg = re.sub(r'key=[A-Za-z0-9_-]+', 'key=[REDACTED]', msg)
    msg = re.sub(r'AIza[0-9A-Za-z-_]{35}', '[REDACTED_API_KEY]', msg)
    return msg


class AiQuotaError(RuntimeError):
    """Raised when an account has used up its daily Gemini quota."""
    pass


# Mốc A7: khóa chỉ nằm ở máy chủ (biến môi trường), không nhận từ trình duyệt.
# Đếm lượt theo (phạm vi, ngày) trong bộ nhớ tiến trình; đủ cho chạy cục bộ và 1 worker Render.
usage_log = logging.getLogger("ai_assistant.usage")
_usage: Dict[tuple, int] = {}
_usage_lock = threading.Lock()
DEFAULT_DAILY_LIMIT = 50
TIMEOUT_SECONDS = 45


def reset_usage() -> None:
    with _usage_lock:
        _usage.clear()


def daily_limit() -> int:
    try:
        return max(0, int(os.environ.get("AI_DAILY_LIMIT", DEFAULT_DAILY_LIMIT)))
    except ValueError:
        return DEFAULT_DAILY_LIMIT


def ai_status(scope: str = "local") -> Dict[str, Any]:
    with _usage_lock:
        used = _usage.get((scope, date.today().isoformat()), 0)
    return {"configured": get_effective_api_key() is not None, "daily_limit": daily_limit(), "used_today": used}


def _take_quota(scope: str) -> None:
    key = (scope, date.today().isoformat())
    with _usage_lock:
        if _usage.get(key, 0) >= daily_limit():
            raise AiQuotaError(f"Đã dùng hết {daily_limit()} lượt gọi AI trong ngày. Vui lòng thử lại vào ngày mai.")
        _usage[key] = _usage.get(key, 0) + 1


def get_effective_api_key(provided_key: Optional[str] = None) -> Optional[str]:
    # provided_key bị bỏ qua có chủ đích: khóa từ trình duyệt không bao giờ được dùng.
    return os.environ.get("GEMINI_API_KEY", "").strip() or None


def call_gemini(prompt: str, model: str = DEFAULT_GEMINI_MODEL, scope: str = "local") -> str:
    key = get_effective_api_key()
    if not key:
        raise ValueError("AI chưa được cấu hình trên máy chủ (thiếu biến môi trường GEMINI_API_KEY).")
    _take_quota(scope)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"{SYSTEM_PROMPT}\n\n{prompt}"}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json"
        }
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err_msg = _sanitize_error_message(exc.read().decode("utf-8", "ignore"))
        raise RuntimeError(f"Lỗi kết nối Gemini API (HTTP {exc.code}): {err_msg}") from None
    except Exception as exc:
        clean_err = _sanitize_error_message(str(exc))
        raise RuntimeError(f"Không thể kết nối đến Gemini API: {clean_err}") from None
    usage = data.get("usageMetadata") or {}
    # Chỉ ghi phạm vi, mô hình và số token; không ghi prompt hay khóa.
    usage_log.info("scope=%s model=%s prompt_tokens=%s output_tokens=%s", scope, model,
                   usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0))
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini không trả về kết quả.")
    return candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")


def _clean_json_text(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def validate_and_sanitize_question(raw_q: Any, expected_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Strict validation of AI-generated question structure.
    Never fabricates default answers or options when missing or invalid.
    """
    if not isinstance(raw_q, dict):
        raise AiValidationError("Cấu trúc câu hỏi phải là một đối tượng JSON (dictionary).")

    q_type = str(raw_q.get("type", expected_type or "MC")).strip().upper()
    if q_type not in ("MC", "YN", "SHORT", "ES"):
        raise AiValidationError(f"Dạng câu hỏi không hợp lệ: '{q_type}'. Chỉ chấp nhận MC, YN, SHORT, ES.")

    question_text = str(raw_q.get("question", "")).strip()
    if not question_text:
        raise AiValidationError("Nội dung câu hỏi ('question') không được để trống.")

    level = str(raw_q.get("level", "Biết")).strip()
    if level not in ("Biết", "Hiểu", "Vận dụng", "Vận dụng cao"):
        level = "Biết"

    sanitized: Dict[str, Any] = {
        "type": q_type,
        "question": question_text,
        "level": level,
        "learning_outcome": str(raw_q.get("learning_outcome", "")).strip(),
    }

    if q_type == "MC":
        options = raw_q.get("options")
        if not isinstance(options, list) or len(options) != 4:
            raise AiValidationError(
                f"Câu hỏi trắc nghiệm MC phải có đúng 4 phương án lựa chọn, hiện có: {len(options) if isinstance(options, list) else 0}."
            )
        cleaned_options = [str(opt).strip() for opt in options]
        if any(not opt for opt in cleaned_options):
            raise AiValidationError("Không được để trống bất kỳ phương án lựa chọn nào trong 4 đáp án.")
        sanitized["options"] = cleaned_options

        correct_val = raw_q.get("correct")
        if correct_val is None:
            raise AiValidationError("Câu hỏi trắc nghiệm MC thiếu trường đáp án đúng ('correct'). Không tự tạo đáp án mặc định.")

        if isinstance(correct_val, str) and correct_val.strip().upper() in ("A", "B", "C", "D"):
            correct_idx = ord(correct_val.strip().upper()) - ord("A")
        else:
            try:
                correct_idx = int(correct_val)
            except (ValueError, TypeError):
                raise AiValidationError(f"Giá trị đáp án đúng không hợp lệ: '{correct_val}'. Phải là số từ 0 đến 3 hoặc chữ cái A-D.")

        if not (0 <= correct_idx <= 3):
            raise AiValidationError(f"Chỉ số đáp án đúng phải từ 0 đến 3 (tương ứng A-D), hiện là: {correct_idx}.")
        sanitized["correct"] = correct_idx

        exps = raw_q.get("option_explanations")
        if isinstance(exps, list):
            sanitized["option_explanations"] = [str(e).strip() for e in exps]
        elif isinstance(exps, str) and exps.strip():
            sanitized["option_explanations"] = [exps.strip()]

    elif q_type == "YN":
        stmts = raw_q.get("statements")
        if not isinstance(stmts, list) or len(stmts) != 4:
            raise AiValidationError(
                f"Dạng Đúng/Sai (YN) phải có đúng 4 nhận định (a, b, c, d), hiện có: {len(stmts) if isinstance(stmts, list) else 0}."
            )
        cleaned_stmts = []
        expected_labels = ("a", "b", "c", "d")
        for i, st in enumerate(stmts):
            if not isinstance(st, dict):
                raise AiValidationError(f"Nhận định thứ {i+1} phải là một object chứa label, text và correct.")
            text = str(st.get("text", "")).strip()
            if not text:
                raise AiValidationError(f"Nhận định {expected_labels[i]}) không được để trống nội dung.")
            corr = st.get("correct")
            if corr is None or not isinstance(corr, bool):
                if isinstance(corr, str) and corr.strip().lower() in ("true", "đúng", "d"):
                    corr_bool = True
                elif isinstance(corr, str) and corr.strip().lower() in ("false", "sai", "s"):
                    corr_bool = False
                else:
                    raise AiValidationError(f"Nhận định {expected_labels[i]}) thiếu hoặc sai giá trị Đúng/Sai ('correct' phải là boolean True/False).")
            else:
                corr_bool = corr
            cleaned_stmts.append({
                "label": expected_labels[i],
                "text": text,
                "correct": corr_bool
            })
        sanitized["statements"] = cleaned_stmts

    elif q_type == "SHORT":
        ans = canonical_short_answer(raw_q)
        if not ans:
            raise AiValidationError("Câu hỏi trả lời ngắn SHORT thiếu đáp án đúng ('short_answer').")
        sanitized["short_answer"] = ans

    elif q_type == "ES":
        if raw_q.get("rubric"):
            sanitized["rubric"] = raw_q.get("rubric")
        if raw_q.get("solution"):
            sanitized["solution"] = str(raw_q.get("solution")).strip()

    return sanitized


# Mode 1: Generate by Learning Outcome
def generate_questions_by_outcome(
    grade: int,
    subject: str,
    lesson_name: str,
    learning_outcome: str,
    level: str = "Biết",
    count: int = 3,
    question_type: str = "MC",
    scope: str = "local"
) -> List[Dict[str, Any]]:
    prompt = f"""[CHẾ ĐỘ 1: SINH CÂU HỎI THEO YÊU CẦU CẦN ĐẠT]
Môn học: {subject} - Khối {grade}
Tên bài học: {lesson_name}
Yêu cầu cần đạt (YCCĐ): "{learning_outcome}"
Mức độ nhận thức: {level} (Biết / Hiểu / Vận dụng)
Dạng câu hỏi: {question_type} (MC: trắc nghiệm 4 lựa chọn, YN: trắc nghiệm Đúng/Sai 4 ý, SHORT: trả lời ngắn, ES: tự luận)
Số lượng câu cần sinh: {count}

Yêu cầu định dạng JSON đầu ra là một danh sách (Array) các Object:
Với dạng MC:
{{
  "type": "MC",
  "question": "Nội dung câu hỏi...",
  "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
  "correct": 0,
  "option_explanations": ["Giải thích A", "Giải thích B", "Giải thích C", "Giải thích D"],
  "level": "{level}",
  "learning_outcome": "{learning_outcome}"
}}
Với dạng YN:
{{
  "type": "YN",
  "question": "Đoạn ngữ cảnh / dẫn dắt...",
  "statements": [
    {{"label": "a", "text": "Ý a...", "correct": true}},
    {{"label": "b", "text": "Ý b...", "correct": false}},
    {{"label": "c", "text": "Ý c...", "correct": true}},
    {{"label": "d", "text": "Ý d...", "correct": false}}
  ],
  "level": "{level}",
  "learning_outcome": "{learning_outcome}"
}}
"""
    raw_res = call_gemini(prompt, scope=scope)
    parsed = json.loads(_clean_json_text(raw_res))
    raw_list = parsed if isinstance(parsed, list) else [parsed]
    validated = []
    for item in raw_list:
        validated.append(validate_and_sanitize_question(item, expected_type=question_type))
    return validated


# Mode 2: Parse Raw Exam Text
def parse_raw_exam_text(
    raw_text: str,
    grade: int = 10,
    subject: str = "Tin học",
    scope: str = "local"
) -> List[Dict[str, Any]]:
    cleaned_raw = (raw_text or "").strip()
    if not cleaned_raw:
        raise ValueError("Văn bản đề thô không được để trống.")
    if len(cleaned_raw) > MAX_RAW_TEXT_LENGTH:
        raise ValueError(f"Văn bản đề thô vượt quá giới hạn tối đa {MAX_RAW_TEXT_LENGTH} ký tự (hiện có {len(cleaned_raw)} ký tự).")

    prompt = f"""[CHẾ ĐỘ 2: BÓC TÁCH VÀ PHÂN LOẠI ĐỀ THÔ]
Dưới đây là văn bản đề thi thô do giáo viên cung cấp. Hãy bóc tách đầy đủ thành danh sách câu hỏi có cấu trúc.
Môn: {subject} - Khối {grade}

Văn bản thô:
\"\"\"
{cleaned_raw}
\"\"\"

Yêu cầu nghiêm ngặt:
1. Nhận diện dạng câu: MC (nhiều lựa chọn), YN (Đúng/Sai), SHORT (trả lời ngắn), ES (tự luận).
2. Tách rõ phần dẫn (`question`), các lựa chọn (`options`), nhận định (`statements`), đáp án đúng (`correct` từ 0-3 cho MC, boolean cho YN).
3. Tuyệt đối không tự bịa đáp án nếu trong đề thô không có hoặc không suy luận được.
4. Trả về JSON là danh sách (Array) các Object câu hỏi.
"""
    raw_res = call_gemini(prompt, scope=scope)
    parsed = json.loads(_clean_json_text(raw_res))
    raw_list = parsed if isinstance(parsed, list) else [parsed]
    validated = []
    for item in raw_list:
        validated.append(validate_and_sanitize_question(item))
    return validated


# Mode 3: Generate Question Variants
def generate_question_variants(
    question_obj: Dict[str, Any],
    count: int = 2,
    scope: str = "local"
) -> List[Dict[str, Any]]:
    if not isinstance(question_obj, dict) or not question_obj.get("question"):
        raise ValueError("Câu hỏi gốc không hợp lệ.")

    prompt = f"""[CHẾ ĐỘ 3: SINH BIẾN THỂ CÂU HỎI TƯƠNG ĐƯƠNG]
Hãy sinh {count} biến thể tương đương từ câu hỏi gốc dưới đây.
Đổi số liệu, tham số, ngữ cảnh thực tế nhưng giữ nguyên bản chất kiến thức và mức độ nhận thức.
Tính toán lại đáp án đúng và lời giải chi tiết chính xác 100%.

Câu hỏi gốc:
{json.dumps(question_obj, ensure_ascii=False, indent=2)}

Trả về JSON danh sách {count} câu hỏi biến thể tương đương."""
    raw_res = call_gemini(prompt, scope=scope)
    parsed = json.loads(_clean_json_text(raw_res))
    raw_list = parsed if isinstance(parsed, list) else [parsed]
    validated = []
    for item in raw_list:
        validated.append(validate_and_sanitize_question(item, expected_type=question_obj.get("type")))
    return validated
