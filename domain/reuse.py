"""Cảnh báo trùng nguyên văn và câu vừa dùng (mốc B5). Chỉ cảnh báo, không chặn.

- Trùng nguyên văn: so hash nội dung sau chuẩn hóa (NFC, bỏ khoảng trắng thừa, không phân biệt hoa thường);
  phương án/ý được sắp xếp nên đổi thứ tự (đề hoán vị) vẫn nhận ra là trùng.
- Câu vừa dùng: câu (cùng mã hoặc cùng nội dung) đã có trong đề **đã phát hành** trong N ngày gần đây
  (mặc định 365 ngày, một năm học). Bỏ qua chính đề đó và các mã đề hoán vị cùng bộ.
"""
import hashlib
import json
import unicodedata
from datetime import datetime, timedelta, timezone

from input_schema import canonical_short_answer

DEFAULT_RECENT_DAYS = 365


def norm(text):
    return ' '.join(unicodedata.normalize('NFC', str(text or '')).casefold().split())


def exact_hash(q):
    body = [q.get('type'), norm(q.get('question'))]
    if q.get('type') == 'MC':
        body.append(sorted(norm(o) for o in q.get('options') or []))
    elif q.get('type') == 'YN':
        body.append(sorted(norm(s.get('text')) for s in q.get('statements') or [] if isinstance(s, dict)))
    elif q.get('type') == 'SHORT':
        body.append(norm(canonical_short_answer(q)))
    return hashlib.sha256(json.dumps(body, ensure_ascii=False).encode()).hexdigest()


def bank_duplicates(question, questions):
    """Câu khác trong ngân hàng (kể cả khác khối) trùng nguyên văn với câu đang lưu."""
    target = exact_hash(question)
    return [dict(id=q.get('id'), grade=q.get('grade'), review_status=q.get('review_status'))
            for q in questions if q.get('id') != question.get('id') and q.get('review_status') != 'archived'
            and exact_hash(q) == target]


def _parse(ts):
    try:
        value = datetime.fromisoformat(str(ts))
    except (TypeError, ValueError):
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _family(exam):
    return {x for x in (exam.get('id'), exam.get('parent_exam_id')) if x}


def recent_uses(exam, exams, now=None, days=DEFAULT_RECENT_DAYS):
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    family = _family(exam)
    seen = []
    for other in exams:
        if other.get('status') != 'published' or _family(other) & family:
            continue
        when = _parse(other.get('published_at') or (other.get('usage') or {}).get('published_at'))
        if when is None or when < since:
            continue
        by_id = {q.get('id') for q in other.get('questions', [])}
        by_hash = {exact_hash(q) for q in other.get('questions', [])}
        for q in exam.get('questions', []):
            match = 'id' if q.get('id') in by_id else 'content' if exact_hash(q) in by_hash else None
            if match:
                seen.append(dict(question_id=q.get('id'), slot_number=q.get('slot_number'), type=q.get('type'),
                                 other_exam_id=other.get('id'), other_title=other.get('title'),
                                 other_exam_type=other.get('exam_type'), published_at=when.isoformat(), match=match))
    return seen
