"""Kiểm tra mã đề hoán vị và bảng đối chiếu mã đề (mốc B7).

Hoán vị chỉ được đổi thứ tự câu và thứ tự phương án; mọi mã đề phải giữ nguyên bộ câu, điểm từng câu và phiên bản nội
dung (đáp án đúng theo nội dung, giải thích, ý Đúng/Sai, đáp án trả lời ngắn, hướng dẫn chấm) của đề gốc.
"""
from collections import Counter

from domain.review import version_hash
from domain.scoring import dec
from input_schema import canonical_short_answer

KIND_ORDER = ('MC', 'YN', 'SHORT', 'ES')
KIND_LABELS = {'MC': 'Nhiều lựa chọn', 'YN': 'Đúng/Sai', 'SHORT': 'Trả lời ngắn', 'ES': 'Tự luận'}


def answer_of(q):
    kind = q.get('type')
    if kind == 'MC':
        c = q.get('correct')
        return 'ABCD'[c] if type(c) is int and 0 <= c < 4 else '?'
    if kind == 'YN':
        return ', '.join(f"{s.get('label', 'abcd'[i])}: {'Đ' if s.get('correct') else 'S'}"
                         for i, s in enumerate(q.get('statements', [])))
    if kind == 'SHORT':
        return canonical_short_answer(q)
    return 'Theo hướng dẫn chấm'


def verify_codes(parent, children):
    """Danh sách lỗi (rỗng là đạt). Mỗi lỗi ghi rõ mã đề và mã câu."""
    source = {q.get('id'): q for q in parent.get('questions', [])}
    problems = []
    for child in children:
        code = child.get('exam_code') or child.get('id')
        ids = Counter(q.get('id') for q in child.get('questions', []))
        if ids != Counter(list(source)):
            missing = sorted(set(source) - set(ids)); extra = sorted(set(ids) - set(source))
            dup = sorted(k for k, n in ids.items() if n > 1)
            problems.append(f'Mã {code}: bộ câu khác đề gốc (thiếu {missing}, thừa {extra}, lặp {dup}).')
        slots = {}
        for q in child.get('questions', []):
            src = source.get(q.get('id'))
            slots.setdefault(q.get('type'), []).append(q.get('slot_number'))
            if src is None:
                continue
            if q.get('type') != src.get('type'):
                problems.append(f"Mã {code}: câu {q.get('id')} đổi dạng câu.")
            if dec(q.get('points', 0)) != dec(src.get('points', 0)):
                problems.append(f"Mã {code}: câu {q.get('id')} có điểm {q.get('points')} khác đề gốc {src.get('points')}.")
            if version_hash(q) != version_hash(src):
                problems.append(f"Mã {code}: câu {q.get('id')} khác nội dung/đáp án của đề gốc.")
        for kind, numbers in slots.items():
            if sorted(numbers) != list(range(1, len(numbers) + 1)):
                problems.append(f"Mã {code}: số thứ tự câu {KIND_LABELS.get(kind, kind)} không liên tục.")
    return problems


def mapping_rows(parent, children):
    """Bảng đối chiếu: với mỗi mã đề và mỗi câu — vị trí mới, câu gốc, đáp án sau hoán vị, điểm."""
    source = {q.get('id'): q for q in parent.get('questions', [])}
    rows = []
    for child in children:
        ordered = sorted(child.get('questions', []), key=lambda q: (KIND_ORDER.index(q.get('type')) if q.get('type') in KIND_ORDER else 9,
                                                                    q.get('slot_number') or 0))
        for q in ordered:
            src = source.get(q.get('id'), {})
            rows.append(dict(code=child.get('exam_code'), kind=q.get('type'), slot=q.get('slot_number'),
                             source_slot=src.get('slot_number'), question_id=q.get('id'), answer=answer_of(q),
                             source_answer=answer_of(src) if src else '', points=f"{float(q.get('points', 0)):g}"))
    return rows
