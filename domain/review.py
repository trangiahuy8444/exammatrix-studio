"""Quy trình duyệt câu hỏi (mốc B1).

draft → pending_review → approved; needs_review khi bị trả lại hoặc khi câu đã duyệt bị sửa nội dung;
archived để cất đi. Chỉ `review_question` (thao tác "approve" kèm đủ phiếu kiểm định) mới đưa câu lên approved.
"""
import hashlib
import json
import unicodedata

from input_schema import canonical_short_answer

STATUSES = ('draft', 'pending_review', 'needs_review', 'approved', 'archived')
LEGACY_ALIASES = {'content_checked': 'pending_review'}  # "đã tự kiểm tra" cũ = chờ duyệt
EXAM_ELIGIBLE = ('approved',)  # đề chính thức chỉ dùng câu đã duyệt (quyết định của giáo viên)
STATUS_LABELS = {'draft': 'Bản nháp', 'pending_review': 'Chờ duyệt', 'needs_review': 'Cần sửa lại',
                 'approved': 'Đã duyệt', 'archived': 'Đã lưu trữ'}

import re
import unicodedata

# Phiếu kiểm định: mọi mục phải được người duyệt xác nhận trước khi duyệt.
CHECKLIST = (
    dict(key='accurate', label='Nội dung chính xác về kiến thức'),
    dict(key='outcome', label='Bám đúng yêu cầu cần đạt đã gắn'),
    dict(key='level', label='Mức độ nhận thức phù hợp'),
    dict(key='answer', label='Đáp án đúng và không mơ hồ'),
    dict(key='distractors', label='Phương án nhiễu hợp lý, đồng nhất / hướng dẫn chấm đủ ý, rõ biểu điểm'),
    dict(key='language', label='Ngôn ngữ rõ ràng, đơn nghĩa, thống nhất kí hiệu, không lỗi chính tả'),
    dict(key='informatics', label='Đoạn mã, hình, thuật ngữ, phiên bản phần mềm và kết quả chương trình đúng (nếu có)'),
)


def _strip_code(text):
    s = re.sub(r'```[\s\S]*?```', ' ', str(text or ''))
    return re.sub(r'`[^`]*`', ' ', s)


def _strip_emphasis(text):
    s = re.sub(r'\*\*[\s\S]*?\*\*', ' ', text)
    s = re.sub(r'<b\b[^>]*>[\s\S]*?</b>', ' ', s, flags=re.IGNORECASE)
    return re.sub(r'<strong\b[^>]*>[\s\S]*?</strong>', ' ', s, flags=re.IGNORECASE)


def _norm_ascii(text):
    raw = _strip_code(text).replace('đ', 'd').replace('Đ', 'D')
    s = ''.join(ch for ch in unicodedata.normalize('NFD', raw) if unicodedata.category(ch) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip().lower()


def _warn(code, message):
    return dict(code=code, severity='warning', message=message)


_RE_BANNED_OPTION = re.compile(
    r'\b(?:'
    r'tat ca(?: cac)? (?:dap an|phuong an|cau|y|phuong an tra loi)(?: tren| duoi day)?(?: deu)? (?:dung|sai)'
    r'|tat ca deu (?:dung|sai)'
    r'|khong co (?:phuong an|dap an|y|cau) nao(?: tren)? (?:dung|sai)'
    r'|khong (?:phuong an|dap an) nao dung'
    r'|ca (?:hai|ba|bon|2|3|4) (?:dap an|phuong an|y)(?: tren)? deu (?:dung|sai)'
    r'|ca [a-d](?:,\s*[a-d])+(?: va [a-d])? deu (?:dung|sai)'
    r'|[a-d] va [a-d] deu (?:dung|sai)'
    r')\b'
)
_RE_UNEMPH_NEG = re.compile(
    r'(?:(?:nào|gì|đáp án|phương án|phát biểu|nhận định|khẳng định|câu|ý|mệnh đề|đặc điểm|thiết bị|hàm|lệnh|thao tác|ví dụ|trường hợp)(?: sau đây| dưới đây| bên dưới| nào)?\s+'
    r'(?:không (?:phải|đúng|thuộc|bao gồm|phù hợp|hợp lệ|tồn tại|có tác dụng|có chức năng)|là sai|sai)'
    r'|(?:chọn|tìm|chỉ ra|xác định)\s+(?:phương án|đáp án|phát biểu|nhận định|câu|ý)\s+(?:không (?:đúng|phải)|sai)'
    r'|(?:^|[\s,.;:!?("\'“‘])ngoại trừ(?=$|[\s,.;:!?)"\'”’]))'
)
_RE_NEG_STEM = re.compile(r'\b(?:khong (?:phai|dung|thuoc|bao gom)|ngoai tru)\b|(?:nao(?: sau day| duoi day)? sai)\b')
_RE_DOUBLE_NEG_STEM = re.compile(
    r'\b(?:khong (?:the|phai|bao gio|he) khong|chua (?:tung|bao gio) khong|'
    r'khong (?:phai|dung|thuoc|co).*?\bngoai tru\b|\bngoai tru\b.*?\bkhong\b)\b'
)
_RE_NEG_OPT = re.compile(r'^(?:khong|chua|chang)\b|\bkhong (?:the|bao gio|duoc|co|phai|dung)\b')
_RE_INLINE_BLANK = re.compile(r'(?:_{3,}|\.{4,}|…{2,}|\(\s*\.{3,}\s*\)|\[\s*\.{3,}\s*\])\s+[A-Za-zÀ-ỹ0-9]')
_RE_VAGUE_ABS = re.compile(r'(?:^|\b)(?:luon luon|khong bao gio|chi duy nhat|tat thay|hau het|phan lon|thong thuong|bat ki luc nao|moi truong hop)(?:\b|$)')
_RE_TUYET_DOI = re.compile(r'\btuyet doi\b')
_RE_TUYET_DOI_SAFE_PREFIX = re.compile(r'(?:dia chi|duong dan|gia tri|sai so|tham chieu)\s+$')
_RE_NUM_WITH_UNIT = re.compile(r'^-?\d+(?:[.,]\d+)?\s*(?:%|cm|mm|km|m|kg|g|gb|mb|kb|tb|hz|khz|mhz|ghz|bit|byte|giay|phut|gio|phan tram)$', re.IGNORECASE)
_RE_PURE_NUM = re.compile(r'^-?\d+(?:[.,]\d+)?$')


def quality_warnings(q):
    """Kiểm tra phi kỹ thuật không chặn theo bảng CV 7991/BGDĐT-GDTrH & CV 6569/QĐ 764."""
    q = q or {}
    qtype = str(q.get('type') or '').upper()
    stem = str(q.get('question') or q.get('stem') or '').strip()
    stem_prose = _strip_code(stem)
    stem_unemph = _strip_emphasis(stem_prose)
    stem_norm = _norm_ascii(stem)
    out = []

    if _RE_INLINE_BLANK.search(stem_prose):
        out.append(_warn('mc_inline_blank', 'CV 7991/6569 (1.b.5–6): Ưu tiên câu hỏi trực tiếp; nếu hoàn chỉnh câu thì không đặt chỗ trống ở đầu hoặc giữa câu dẫn.'))

    if qtype == 'MC':
        raw_opts = q.get('options') or []
        opts = [str(o.get('text', '') if isinstance(o, dict) else o or '').strip() for o in raw_opts]
        opts_norm = [_norm_ascii(o) for o in opts]

        if any(_RE_BANNED_OPTION.search(o) for o in opts_norm if o):
            out.append(_warn('mc_banned_option', 'CV 7991/6569 (1.c.7): Tránh phương án gộp hoặc loại trừ kiểu "Tất cả đều đúng", "Không có phương án nào đúng", "Cả A và B...".'))

        if _RE_UNEMPH_NEG.search(stem_unemph):
            out.append(_warn('mc_unemphasized_negation', 'CV 7991/6569 (1.b.8): Câu dẫn dạng phủ định/loại trừ nên chuyển sang thể khẳng định hoặc nhấn mạnh từ phủ định bằng IN HOA/IN ĐẬM.'))

        has_double_neg = bool(_RE_DOUBLE_NEG_STEM.search(stem_norm)) or (
            bool(_RE_NEG_STEM.search(stem_norm)) and any(_RE_NEG_OPT.search(o) for o in opts_norm if o)
        )
        if has_double_neg:
            out.append(_warn('mc_double_negation', 'CV 7991/6569 (1.b.8 & 1.c.9): Tránh phủ định kép (câu dẫn phủ định đi kèm phương án phủ định); nên viết phương án nhiễu ở thể khẳng định.'))

        non_empty_lens = [len(o) for o in opts if o]
        if len(non_empty_lens) == 4:
            sorted_lens = sorted(non_empty_lens)
            avg_short3 = sum(sorted_lens[:3]) / 3.0
            if sorted_lens[3] >= 45 and sorted_lens[0] > 0 and sorted_lens[3] >= 2.5 * avg_short3:
                out.append(_warn('mc_length_imbalance', 'CV 7991/6569 (1.c.5 & 1.c.14): Độ dài các phương án lựa chọn chênh lệch quá lớn, dễ làm lộ đáp án.'))

        vague_hit = False
        for o in opts_norm:
            if not o:
                continue
            if _RE_VAGUE_ABS.search(o):
                vague_hit = True
                break
            for m in _RE_TUYET_DOI.finditer(o):
                if not _RE_TUYET_DOI_SAFE_PREFIX.search(o[:m.start()]):
                    vague_hit = True
                    break
            if vague_hit:
                break
        if vague_hit:
            out.append(_warn('mc_vague_or_absolute', 'CV 7991/6569 (1.c.8): Phương án chứa từ ngữ mơ hồ ("thông thường", "hầu hết", "phần lớn"…) hoặc tuyệt đối hóa ("luôn luôn", "không bao giờ", "tuyệt đối"…).'))

    elif qtype == 'YN':
        stmts = q.get('statements') or []
        texts = [str((s.get('text') if isinstance(s, dict) else s) or '').strip() for s in stmts]
        non_empty = [t for t in texts if t]
        norm_texts = [_norm_ascii(t) for t in non_empty]
        bools = []
        for s in stmts:
            if isinstance(s, dict):
                val = s.get('correct') if 'correct' in s else (s.get('answer') if 'answer' in s else s.get('is_true'))
                if isinstance(val, bool):
                    bools.append(val)
                elif val is not None:
                    bools.append(_norm_ascii(val) in ('true', '1', 'd', 'dung'))
        if len(stem) < 25 or len(non_empty) < 4 or len(set(norm_texts)) < len(norm_texts) or (len(bools) == 4 and len(set(bools)) == 1):
            out.append(_warn('yn_context_or_balance', 'CV 7991 & QĐ 764 (Đúng/Sai): Cần có ngữ liệu/câu dẫn rõ ràng (>= 25 kí tự), đủ 4 ý a–d không trùng lặp và tránh cả 4 ý cùng Đúng hoặc cùng Sai.'))

    elif qtype == 'SHORT':
        ans = ''
        for k in ('short_answer', 'correct_answer', 'answer'):
            v = q.get(k)
            if v is not None and str(v).strip():
                ans = str(v).strip()
                break
        ans_norm = _norm_ascii(ans)
        if (not ans) or len(ans) > 20 or len(ans.split()) >= 3 or bool(_RE_NUM_WITH_UNIT.match(ans_norm)) or (bool(_RE_PURE_NUM.match(ans)) and len(ans) > 4):
            out.append(_warn('short_answer_format', 'CV 7991 & QĐ 764 (Trả lời ngắn): Đáp án cần gọn, duy nhất (không kèm đơn vị hoặc cụm từ dài; chuẩn THPT tối đa 4 kí tự gồm chữ số, dấu "-", ",").'))

    elif qtype == 'ES':
        rubric = q.get('rubric') or []
        guide = str(q.get('marking_guide') or q.get('sample_answer') or '').strip()
        bad_rubric = False
        if isinstance(rubric, list) and rubric:
            for item in rubric:
                if isinstance(item, dict):
                    crit = str(item.get('criterion') or item.get('text') or '').strip()
                    pts = item.get('points')
                    try:
                        pts_ok = float(pts) > 0
                    except (TypeError, ValueError):
                        pts_ok = False
                    if len(crit) < 5 or not pts_ok:
                        bad_rubric = True
                        break
                elif len(str(item or '').strip()) < 5:
                    bad_rubric = True
                    break
        elif not guide:
            bad_rubric = True
        if len(stem) < 20 or bad_rubric:
            out.append(_warn('es_rubric_or_prompt', 'CV 7991/6569 (Tự luận): Câu dẫn cần rõ yêu cầu thực hiện, tiêu chí cần đạt; hướng dẫn chấm phải có ít nhất 1 ý và ghi rõ biểu điểm.'))

    return out

# Trường ảnh hưởng tới nhiệm vụ, đáp án, cách chấm hoặc phạm vi; sửa các trường này làm mất hiệu lực duyệt.
REVIEW_FIELDS = ('grade', 'type', 'lesson_code', 'level', 'learning_outcome', 'question', 'options', 'correct',
                 'option_explanations', 'statements', 'short_answer', 'rubric', 'equivalent_answer_policy',
                 'response_mode')


def normalize_status(status):
    status = str(status or 'draft').strip()
    return LEGACY_ALIASES.get(status, status)


def review_hash(q):
    payload = {k: q[k] for k in REVIEW_FIELDS if k in q and q[k] not in (None, '')}
    if q.get('type') == 'SHORT':
        payload['short_answer'] = canonical_short_answer(q)
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    return hashlib.sha256(raw.encode()).hexdigest()


def _norm(text):
    return ' '.join(unicodedata.normalize('NFC', str(text)).casefold().split())


def technical_problems(q):
    """Kiểm tra kỹ thuật tự động trước khi gửi duyệt. Trả về danh sách lỗi (rỗng là đạt)."""
    problems = []
    if not str(q.get('question') or '').strip():
        problems.append('Thiếu nội dung câu hỏi.')
    if not q.get('learning_outcome'):
        problems.append('Chưa gắn yêu cầu cần đạt.')
    kind = q.get('type')
    if kind == 'MC':
        options = q.get('options') or []
        if len(options) != 4 or any(not str(o).strip() for o in options):
            problems.append('Câu nhiều lựa chọn phải có đủ 4 phương án.')
        elif len({_norm(o) for o in options}) != 4:
            problems.append('Có phương án trùng nhau.')
        if type(q.get('correct')) is not int or not 0 <= q['correct'] < 4:
            problems.append('Chưa chọn đáp án đúng.')
    elif kind == 'YN':
        statements = q.get('statements') or []
        if len(statements) != 4:
            problems.append('Câu Đúng/Sai phải có đúng 4 ý.')
        elif any(not str(s.get('text') or '').strip() or not isinstance(s.get('correct'), bool) for s in statements):
            problems.append('Mỗi ý Đúng/Sai cần nội dung và đáp án Đúng hoặc Sai.')
    elif kind == 'SHORT':
        if not canonical_short_answer(q):
            problems.append('Câu trả lời ngắn chưa có đáp án.')
    elif kind == 'ES':
        if not q.get('rubric'):
            problems.append('Câu tự luận chưa có hướng dẫn chấm.')
    return problems


def version_hash(q):
    """Hash phiên bản không phụ thuộc thứ tự phương án/ý: dùng để so câu trong đề (kể cả đề hoán vị) với câu đã duyệt.

    Đổi đáp án, nội dung phương án, giải thích hay ý Đúng/Sai đều làm hash đổi; chỉ đổi thứ tự thì không.
    """
    c = dict(q)
    if c.get('type') == 'MC' and isinstance(c.get('options'), list):
        exps = c.get('option_explanations') or [''] * len(c['options'])
        c['options'] = sorted([str(o), i == c.get('correct'), str(exps[i]) if i < len(exps) else '']
                              for i, o in enumerate(c['options']))
        c.pop('correct', None); c.pop('option_explanations', None)
    if c.get('type') == 'YN' and isinstance(c.get('statements'), list):
        c['statements'] = sorted([str(s.get('text', '')), bool(s.get('correct'))] for s in c['statements'])
    return review_hash(c)
