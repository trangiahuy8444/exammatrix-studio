"""Đối chiếu đề với ma trận theo từng ô và cảnh báo tỉ lệ (mốc B4).

Ô = (bài, YCCĐ trong PPCT, dạng câu, mức độ). Số câu tính theo vị trí (câu Đ/S 4 ý vẫn là 1 câu), điểm tính theo ý.

Cảnh báo tỉ lệ chỉ áp dụng cho ma trận THPT của đề định kì, theo Phụ lục CV 7991/BGDĐT-GDTrH (ghi "tham khảo",
các mức đều là "khoảng"): nhiều lựa chọn 3,0; Đúng – Sai 2,0; trả lời ngắn 2,0; tự luận 3,0 (môn không dùng trả lời
ngắn thì chuyển toàn bộ điểm sang Đúng – Sai); Biết 4,0; Hiểu 3,0; Vận dụng 3,0. Ngưỡng lệch (mặc định ±0,5 điểm)
là ngưỡng nội bộ, chỉnh được bằng `ratio_tolerance`, và chỉ sinh cảnh báo, không chặn.
Hồ sơ bốn mức giữ riêng Vận dụng cao; chỉ khi so tham khảo ba mức mới cộng Vận dụng + Vận dụng cao
bằng quy đổi kỹ thuật, không sửa mức độ hay điểm trong hồ sơ.
"""
from collections import OrderedDict
from decimal import Decimal

from domain.errors import ServiceError
from domain.scoring import dec

KIND_TARGETS = {'MC': Decimal('3'), 'YN': Decimal('2'), 'SHORT': Decimal('2'), 'ES': Decimal('3')}
LEVEL_TARGETS = {'Biết': Decimal('4'), 'Hiểu': Decimal('3'), 'Vận dụng': Decimal('3')}
DEFAULT_TOLERANCE = Decimal('0.5')
KIND_NAMES = {'MC': 'Nhiều lựa chọn', 'YN': 'Đúng – Sai', 'SHORT': 'Trả lời ngắn', 'ES': 'Tự luận'}
PERIODIC = ('GK1', 'CK1', 'GK2', 'CK2')


def fmt(value):
    text = format(dec(value).normalize(), 'f')
    return '0' if text in ('-0', '') else text


def _outcomes(ppct, grade=None):
    out = {}
    for lesson in (ppct or {}).get('lessons', []):
        if grade is not None and lesson.get('grade') not in (None, grade):
            continue
        for i, text in enumerate(lesson.get('outcomes', [])):
            out[(lesson.get('lesson_code'), i)] = text
    return out


def cell_check(exam, matrix, ppct=None):
    """So số câu và điểm của đề với ma trận ở từng ô. Trả về {'ok', 'cells': [...]} (điểm ghi dạng chuỗi Decimal)."""
    outcomes = _outcomes(ppct, matrix.get('grade'))
    reqs = {r.get('id'): r for r in matrix.get('requirements', []) if isinstance(r, dict)}
    cells = OrderedDict()

    def cell(lesson, outcome, kind, level):
        key = (lesson, outcome, kind, level)
        if key not in cells:
            cells[key] = dict(lesson_code=lesson, outcome=outcome, kind=kind, level=level, expected_questions=0,
                              actual_questions=0, expected_points=Decimal(0), actual_points=Decimal(0))
        return cells[key]

    for s in matrix.get('slots', []):
        for i, part in enumerate(s.get('parts', [])):
            r = reqs.get(part.get('requirement_id')) or {}
            outcome = outcomes.get((r.get('lesson_code'), r.get('ppct_outcome_index')), r.get('text', ''))
            c = cell(r.get('lesson_code'), outcome, s.get('kind'), r.get('level'))
            c['expected_points'] += dec(part.get('points', 0))
            if i == 0:
                c['expected_questions'] += 1
    for q in exam.get('questions', []):
        c = cell(q.get('lesson_code'), q.get('learning_outcome'), q.get('type'), q.get('level'))
        c['actual_questions'] += 1
        c['actual_points'] += dec(q.get('points', 0))
    rows = []
    for c in cells.values():
        c['ok'] = c['expected_questions'] == c['actual_questions'] and c['expected_points'] == c['actual_points']
        c['expected_points'], c['actual_points'] = fmt(c['expected_points']), fmt(c['actual_points'])
        rows.append(c)
    return dict(ok=all(c['ok'] for c in rows), cells=rows)


def tolerance_of(matrix):
    raw = matrix.get('ratio_tolerance')
    value = DEFAULT_TOLERANCE if raw in (None, '') else dec(raw)
    if value < 0 or value > 10:
        raise ServiceError('Ngưỡng cảnh báo tỉ lệ phải từ 0 đến 10 điểm.', {'ratio_tolerance': str(raw)})
    return value


def ratio_warnings(matrix):
    """Cảnh báo (không chặn) khi điểm theo dạng câu hoặc mức độ lệch mức tham khảo của CV 7991 quá ngưỡng nội bộ."""
    tolerance = tolerance_of(matrix)
    if matrix.get('profile') != 'THPT' or matrix.get('exam_type') not in PERIODIC:
        return []
    reqs = {r.get('id'): r for r in matrix.get('requirements', []) if isinstance(r, dict)}
    by_kind = {k: Decimal(0) for k in KIND_TARGETS}
    by_level = {k: Decimal(0) for k in LEVEL_TARGETS}
    has_vdc = False
    for s in matrix.get('slots', []):
        for part in s.get('parts', []):
            points = dec(part.get('points', 0))
            if s.get('kind') in by_kind:
                by_kind[s['kind']] += points
            level = (reqs.get(part.get('requirement_id')) or {}).get('level')
            # Chỉ quy đổi để so với tham khảo ba mức; không đổi YCCĐ hay ô ma trận.
            if level == 'Vận dụng cao':
                has_vdc = True
                by_level['Vận dụng'] += points
            elif level in by_level:
                by_level[level] += points
    targets = dict(KIND_TARGETS)
    if by_kind['SHORT'] == 0:  # CV 7991, chú thích 3
        targets['YN'] += targets.pop('SHORT')
        by_kind.pop('SHORT')
    warnings = []
    for code, actual, target, name in ([('ratio_kind', by_kind[k], t, KIND_NAMES[k]) for k, t in targets.items()] +
                                       [('ratio_level', by_level[k], t, ('Mức Vận dụng + Vận dụng cao (quy đổi kỹ thuật để so tham khảo ba mức)' if k == 'Vận dụng' and has_vdc else 'Mức ' + k)) for k, t in LEVEL_TARGETS.items()]):
        diff = actual - target
        if abs(diff) > tolerance:
            warnings.append(dict(code=code, severity='warning', path='slots', actual=fmt(actual), target=fmt(target),
                                 message=f'{name}: {fmt(actual).replace(".", ",")} điểm; CV 7991 tham khảo khoảng '
                                         f'{fmt(target).replace(".", ",")} điểm (lệch {fmt(abs(diff)).replace(".", ",")}, '
                                         f'vượt ngưỡng nội bộ ±{fmt(tolerance).replace(".", ",")}). Chỉ là cảnh báo.'))
    return warnings


def shortfall_report(matrix, questions, ppct=None):
    """B9: đếm câu nguyên vẹn ở ô đã xác định, tách vị trí chưa thể kết luận.

    Một vị trí nhiều ý cùng ô vẫn cần một câu ngân hàng. Nếu các ý khác ô,
    metadata của câu mẹ chưa chứng minh được từng ý; liệt kê đủ các ý để đối
    chiếu thay vì chỉ đếm ý đầu hoặc coi mỗi ý là một câu độc lập. Tổng thiếu
    chỉ bao gồm các ô đã xác định; ``complete`` mới cho biết phạm vi đã đủ.
    """
    from domain.review import normalize_status
    from input_schema import ALLOWED_LEVELS
    outcomes = _outcomes(ppct, matrix.get('grade'))
    reqs = {r.get('id'): r for r in matrix.get('requirements', []) if isinstance(r, dict)}
    cells = OrderedDict()
    unresolved_slots, issues = [], []

    def issue(code, message):
        item = dict(code=code, message=message)
        if item not in issues:
            issues.append(item)

    slots = matrix.get('slots') or []
    if not slots:
        issue('no_slots', 'Ma trận chưa có vị trí câu hỏi để đối chiếu; chưa thể kết luận đủ câu.')
    if matrix.get('mode') == 'received':
        reconciliation = matrix.get('reconciliation') or {}
        if reconciliation.get('confirmed') is not True:
            issue('source_unconfirmed', 'Bản nhận từ nguồn chưa được xác nhận đối chiếu.')
        if reconciliation.get('issues'):
            issue('source_issues', 'Bản nhận từ nguồn còn vấn đề đối chiếu chưa được giải quyết.')

    for slot in slots:
        parts = slot.get('parts') or []
        details, identities = [], set()
        reason = None
        if not parts:
            reason = 'Vị trí chưa có ý hoặc yêu cầu để đối chiếu.'
            issue('no_parts', reason)
        for part in parts:
            req = reqs.get(part.get('requirement_id')) or {}
            lesson, index = req.get('lesson_code'), req.get('ppct_outcome_index')
            mapped_outcome = outcomes.get((lesson, index)) if type(index) is int else None
            outcome = mapped_outcome if mapped_outcome is not None else req.get('text', '')
            valid_outcome = bool(isinstance(outcome, str) and outcome.strip())
            if ppct is not None:
                valid_outcome = valid_outcome and mapped_outcome is not None
            level, kind = req.get('level'), slot.get('kind')
            if not (isinstance(lesson, str) and lesson.strip() and valid_outcome
                    and level in ALLOWED_LEVELS and kind in KIND_NAMES):
                reason = 'Có ý chưa ánh xạ bài, YCCĐ, dạng câu hoặc mức độ hợp lệ.'
                issue('requirement_unmapped', reason)
            details.append(dict(part_id=part.get('id'), label=part.get('label', ''),
                                requirement_id=part.get('requirement_id'), lesson_code=lesson,
                                outcome=outcome, level=level, points=part.get('points')))
            identities.add((lesson, outcome, kind, level))
        if not reason and len(identities) != 1:
            reason = 'Các ý thuộc nhiều ô; cần đối chiếu từng ý của câu nguyên vẹn, không suy từ câu mẹ.'
            issue('mixed_slot', reason)
        if reason:
            unresolved_slots.append(dict(slot_id=slot.get('id'), kind=slot.get('kind'),
                                         number=slot.get('number'), reason=reason, parts=details))
            continue
        key = next(iter(identities))
        cell = cells.setdefault(key, dict(grade=matrix.get('grade'), lesson_code=key[0], outcome=key[1], kind=key[2],
                                          level=key[3], needed=0, slots=[], approved=0, pending_review=0,
                                          needs_review=0, draft=0))
        cell['needed'] += 1
        cell['slots'].append(f"{slot.get('kind')} {slot.get('number')}")
    for q in questions:
        if q.get('grade') != matrix.get('grade'):
            continue
        cell = cells.get((q.get('lesson_code'), q.get('learning_outcome'), q.get('type'), q.get('level')))
        status = normalize_status(q.get('review_status'))
        if cell is not None and status in ('approved', 'pending_review', 'needs_review', 'draft'):
            cell[status] += 1
    rows = []
    for cell in cells.values():
        cell['shortfall'] = max(0, cell['needed'] - cell['approved'])
        rows.append(cell)
    total = sum(c['shortfall'] for c in rows)
    complete = not issues and not unresolved_slots
    return dict(matrix_id=matrix.get('id'), ok=complete and total == 0, complete=complete,
                total_shortfall=total, cells=rows, unresolved_slots=unresolved_slots, issues=issues)
