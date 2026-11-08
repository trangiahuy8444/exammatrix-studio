"""
input_schema.py - Input Data Type Specifications and Validators for ExamMatrix Studio.
Ensures strict compliance with Asian School Testing Rules (Rules 1-6) and GDPT 2018 Standards.
"""

from decimal import Decimal
import re


ALLOWED_SUBJECTS = [
    'Tin học', 'Toán học', 'Vật lí', 'Hóa học', 'Sinh học',
    'Ngữ văn', 'Tiếng Anh', 'Lịch sử', 'Địa lí'
]

ALLOWED_GRADES = [8, 9, 10, 11, 12]
ALLOWED_QUESTION_TYPES = ['MC', 'YN', 'SHORT', 'ES']
ALLOWED_LEVELS = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao']
ALLOWED_REVIEW_STATUSES = ['draft', 'pending_review', 'needs_review', 'approved', 'archived', 'content_checked']


SHORT_ANSWER_ALIASES = ('short_answer', 'correct_answer', 'answer')


def canonical_short_answer(q: dict) -> str:
    """Đáp án câu SHORT theo tên trường chuẩn `short_answer`; đọc được tên cũ."""
    for key in SHORT_ANSWER_ALIASES:
        value = q.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ''


class ValidationError(ValueError):
    """Raised when an input payload violates the data specifications."""
    def __init__(self, message, field=None, details=None):
        super().__init__(message)
        self.message = message
        self.field = field
        self.details = details or {}


def validate_question_input(q: dict) -> dict:
    """
    Validates a question object against the official Question Schema.
    Returns cleaned question dictionary or raises ValidationError.
    """
    if not isinstance(q, dict):
        raise ValidationError('Câu hỏi phải là một đối tượng dữ liệu JSON (dict).')

    res = dict(q)

    # 1. Subject & Grade
    subject = str(res.get('subject_name') or 'Tin học').strip()
    if not subject:
        raise ValidationError('Tên môn học không được để trống.', field='subject_name')
    res['subject_name'] = subject

    grade = res.get('grade')
    try:
        grade = int(grade)
    except (TypeError, ValueError):
        raise ValidationError('Khối lớp phải là một số nguyên (8, 9, 10, 11, 12).', field='grade')
    if grade not in ALLOWED_GRADES:
        raise ValidationError(f'Khối lớp {grade} không thuộc phạm vi hỗ trợ (8 - 12).', field='grade')
    res['grade'] = grade

    # 2. Lesson code & Level
    lesson_code = str(res.get('lesson_code') or '').strip()
    if not lesson_code:
        raise ValidationError('Mã bài học không được để trống.', field='lesson_code')
    res['lesson_code'] = lesson_code

    level = str(res.get('level') or 'Biết').strip()
    if level not in ALLOWED_LEVELS:
        raise ValidationError(f'Mức độ nhận thức "{level}" không hợp lệ. Phải là một trong: {ALLOWED_LEVELS}.', field='level')
    res['level'] = level

    # 3. Question type
    qtype = str(res.get('type') or 'MC').strip().upper()
    if qtype not in ALLOWED_QUESTION_TYPES:
        raise ValidationError(f'Dạng câu hỏi "{qtype}" không hợp lệ. Phải là một trong: {ALLOWED_QUESTION_TYPES}.', field='type')
    res['type'] = qtype

    # 4. Question content
    qtext = str(res.get('question') or '').strip()
    if not qtext:
        raise ValidationError('Nội dung câu hỏi không được để trống.', field='question')
    res['question'] = qtext

    # 5. Review Status
    status = str(res.get('review_status') or 'draft').strip()
    status = 'pending_review' if status == 'content_checked' else status  # tên cũ của "chờ duyệt"
    if status not in ALLOWED_REVIEW_STATUSES:
        raise ValidationError(f'Trạng thái kiểm duyệt "{status}" không hợp lệ.', field='review_status')
    res['review_status'] = status

    # 6. Type-specific validations
    if qtype == 'MC':
        options = res.get('options')
        if not isinstance(options, list) or len(options) != 4:
            raise ValidationError('Câu hỏi nhiều lựa chọn (MC) bắt buộc phải có đúng 4 phương án.', field='options')
        cleaned_opts = [str(o).strip() for o in options]
        for i, opt in enumerate(cleaned_opts):
            if not opt:
                raise ValidationError(f'Phương án {chr(65 + i)} không được để trống.', field=f'options[{i}]')
        if len(set(cleaned_opts)) != 4:
            raise ValidationError('Bốn phương án không được trùng lặp nội dung.', field='options')
        res['options'] = cleaned_opts

        correct = res.get('correct')
        if correct is None or not isinstance(correct, int) or correct not in range(4):
            raise ValidationError('Đáp án đúng cho câu MC phải là chỉ số nguyên từ 0 đến 3 (tương ứng A, B, C, D).', field='correct')
        res['correct'] = correct

    elif qtype == 'YN':
        statements = res.get('statements')
        if not isinstance(statements, list) or len(statements) != 4:
            raise ValidationError('Câu hỏi Đúng/Sai (YN) bắt buộc phải có đúng 4 nhận định (a, b, c, d).', field='statements')
        cleaned_stmts = []
        expected_labels = ['a', 'b', 'c', 'd']
        for i, s in enumerate(statements):
            if not isinstance(s, dict):
                raise ValidationError(f'Mệnh đề thứ {i+1} không đúng định dạng.', field=f'statements[{i}]')
            lbl = str(s.get('label') or expected_labels[i]).strip().lower()
            text = str(s.get('text') or '').strip()
            if not text:
                raise ValidationError(f'Nội dung nhận định {lbl}) không được để trống.', field=f'statements[{i}].text')
            corr = bool(s.get('correct', False))
            cleaned_stmts.append({'label': lbl, 'text': text, 'correct': corr})
        res['statements'] = cleaned_stmts

    elif qtype == 'SHORT':
        short_ans = canonical_short_answer(res)
        res.pop('correct_answer', None); res.pop('answer', None)
        if not short_ans and status != 'draft':
            raise ValidationError('Câu hỏi trả lời ngắn (SHORT) phải có đáp án ngắn.', field='short_answer')
        res['short_answer'] = short_ans

    elif qtype == 'ES':
        rubric = res.get('rubric')
        if not isinstance(rubric, list) or len(rubric) == 0:
            if status != 'draft':
                raise ValidationError('Câu tự luận (ES) cần có ít nhất một tiêu chí chấm (Barem).', field='rubric')
        else:
            total_pts = Decimal(0)
            cleaned_rubric = []
            for i, r in enumerate(rubric):
                if not isinstance(r, dict):
                    raise ValidationError(f'Tiêu chí chấm {i+1} không đúng định dạng.', field=f'rubric[{i}]')
                crit = str(r.get('criterion') or r.get('step') or '').strip()
                if not crit:
                    raise ValidationError(f'Nội dung tiêu chí chấm {i+1} không được để trống.', field=f'rubric[{i}].criterion')
                try:
                    pts = Decimal(str(r.get('points', 0.25)))
                except Exception:
                    raise ValidationError(f'Điểm tiêu chí chấm {i+1} không hợp lệ.', field=f'rubric[{i}].points')
                if pts <= Decimal(0):
                    raise ValidationError(f'Điểm tiêu chí chấm {i+1} phải lớn hơn 0.', field=f'rubric[{i}].points')
                total_pts += pts
                cleaned_rubric.append({'criterion': crit, 'points': float(pts)})
            res['rubric'] = cleaned_rubric

    return res


def validate_raw_exam_text(raw_text: str) -> dict:
    """
    Analyzes raw exam text pasted into AI Mode 2.
    Detects question counts, formats, and returns diagnostics or warnings.
    """
    if not isinstance(raw_text, str) or not raw_text.strip():
        raise ValidationError('Văn bản đề thô không được để trống.')

    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    question_pattern = re.compile(r'^(Câu|Bài|Question)\s+(\d+)\s*[:.-]', re.IGNORECASE)
    option_pattern = re.compile(r'^[A-D][.)]\s+')
    yn_pattern = re.compile(r'^[a-d][.)]\s+')

    q_count = 0
    opt_count = 0
    yn_stmt_count = 0

    for ln in lines:
        if question_pattern.match(ln):
            q_count += 1
        elif option_pattern.match(ln):
            opt_count += 1
        elif yn_pattern.match(ln):
            yn_stmt_count += 1

    warnings = []
    if q_count == 0:
        warnings.append('Không tìm thấy dòng mở đầu câu hỏi dạng "Câu 1:", "Câu 2:"...')
    if opt_count > 0 and q_count > 0 and opt_count < q_count * 2:
        warnings.append('Số lượng phương án A, B, C, D ít hơn dự kiến so với số câu hỏi.')

    return {
        'total_lines': len(lines),
        'detected_questions': q_count,
        'detected_options': opt_count,
        'detected_yn_statements': yn_stmt_count,
        'warnings': warnings,
        'is_parseable': q_count > 0 or len(lines) >= 3
    }
