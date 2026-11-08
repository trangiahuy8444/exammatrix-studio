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

# Phiếu kiểm định: mọi mục phải được người duyệt xác nhận trước khi duyệt.
CHECKLIST = (
    dict(key='accurate', label='Nội dung chính xác về kiến thức'),
    dict(key='outcome', label='Bám đúng yêu cầu cần đạt đã gắn'),
    dict(key='level', label='Mức độ nhận thức phù hợp'),
    dict(key='answer', label='Đáp án đúng và không mơ hồ'),
    dict(key='distractors', label='Phương án nhiễu hợp lý / hướng dẫn chấm đủ ý'),
    dict(key='language', label='Ngôn ngữ rõ ràng, không lỗi chính tả'),
    dict(key='informatics', label='Đoạn mã, hình, thuật ngữ, phiên bản phần mềm và kết quả chương trình đúng (nếu có)'),
)

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
