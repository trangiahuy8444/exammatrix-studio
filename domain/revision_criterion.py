"""Tiêu chí đối chiếu đề cương (mốc B6).

Căn cứ: quy tắc nội bộ của trường (rules/01): "90% đề thi phải lấy từ (hoặc bám sát) bộ câu hỏi trong Đề cương ôn tập".
- (a) Độ bao phủ YCCĐ (bắt buộc): 100% điểm của đề thuộc YCCĐ có trong phiên bản đề cương đã chọn.
- (b) T = (N trùng + N bám sát đã duyệt) / N tổng × 100%, đạt khi T ≥ 90% (phép đo quyết định theo số câu).
  "Trùng": cùng nội dung sau chuẩn hóa với một câu của đề cương (đề hoán vị vẫn tính). "Bám sát": giáo viên đánh
  dấu kèm câu gốc và lý do; chỉ tính khi đã được duyệt. Chế độ "chi_trung" (tổ chọn) chỉ tính câu trùng.
- Tỉ lệ theo điểm luôn hiển thị nhưng chỉ để tham khảo.
"""
import math
from decimal import Decimal

from domain.reuse import exact_hash
from domain.scoring import dec

MODES = ('trung_va_bam_sat', 'chi_trung')
DEFAULT_THRESHOLD = Decimal('90')


def _pct(part, whole):
    if not whole:
        return '0'
    value = (Decimal(part) * 100 / Decimal(whole)).quantize(Decimal('0.1'))
    return format(value.normalize(), 'f')


def revision_report(exam, revision, threshold=DEFAULT_THRESHOLD):
    mode = exam.get('revision_policy') or 'trung_va_bam_sat'
    if mode not in MODES:
        mode = 'trung_va_bam_sat'
    rev_questions = (revision or {}).get('questions', [])
    rev_hashes = {exact_hash(r) for r in rev_questions}
    rev_content = {r.get('content_hash') for r in rev_questions if r.get('content_hash')}
    rev_ids = {r.get('id') for r in rev_questions}
    rev_outcomes = {(r.get('lesson_code'), r.get('learning_outcome')) for r in rev_questions}
    close = exam.get('close_matches') or {}
    exact, close_ok, close_pending, outside = [], [], [], []
    matched_points = Decimal(0)
    total_points = Decimal(0)
    missing = []
    covered_points = Decimal(0)
    for q in exam.get('questions', []):
        qid, points = q.get('id'), dec(q.get('points', 0))
        total_points += points
        if (q.get('lesson_code'), q.get('learning_outcome')) in rev_outcomes:
            covered_points += points
        else:
            missing.append(dict(question_id=qid, slot_number=q.get('slot_number'), lesson_code=q.get('lesson_code'),
                                learning_outcome=q.get('learning_outcome')))
        is_exact = exact_hash(q) in rev_hashes or bool({q.get('content_hash'), q.get('source_content_hash')} & rev_content - {None})
        mark = close.get(qid) if isinstance(close.get(qid), dict) else None
        if is_exact:
            exact.append(qid); matched_points += points
        elif mark and mark.get('revision_question_id') in rev_ids and mark.get('status') == 'approved' \
                and mark.get('approved_by') and mode == 'trung_va_bam_sat':
            close_ok.append(qid); matched_points += points
        else:
            if mark and mark.get('status') == 'pending' and mark.get('revision_question_id') in rev_ids:
                close_pending.append(qid)
            outside.append(qid)
    total = len(exam.get('questions', []))
    counted = len(exact) + len(close_ok)
    required = math.ceil(threshold / 100 * total) if total else 0
    coverage_ok = not missing and total > 0
    return dict(
        mode=mode, threshold=format(threshold.normalize(), 'f'), total=total, required=required,
        exact=exact, close_approved=close_ok, close_pending=close_pending, outside=outside,
        exact_count=len(exact), close_count=len(close_ok), t_percent=_pct(counted, total),
        points_percent=_pct(matched_points, total_points) if total_points else '0',
        coverage=dict(ok=coverage_ok, percent=_pct(covered_points, total_points) if total_points else '0', missing=missing),
        passed=bool(total) and counted >= required and coverage_ok,
    )
