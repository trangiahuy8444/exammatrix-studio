"""Mốc B4: đối chiếu đề với ma trận theo từng ô và cảnh báo tỉ lệ theo CV 7991.

CV 7991/BGDĐT-GDTrH (Phụ lục, tham khảo, cấp THPT, đề định kì): nhiều lựa chọn khoảng 3,0 điểm; Đúng – Sai 2,0;
trả lời ngắn 2,0; tự luận 3,0 (môn không dùng trả lời ngắn thì chuyển điểm sang Đúng – Sai); mức độ Biết 4,0,
Hiểu 3,0, Vận dụng 3,0. Ngưỡng lệch ±0,5 là ngưỡng nội bộ, chỉ cảnh báo.
"""
import copy
import unittest
from decimal import Decimal

from bank_service import ServiceError
from domain.matrix_checks import cell_check, ratio_warnings

PPCT = {'lessons': [dict(grade=10, lesson_code='B1', outcomes=['YCCĐ một', 'YCCĐ hai']),
                    dict(grade=10, lesson_code='B2', outcomes=['YCCĐ ba'])]}


def req(i, lesson, level, outcome):
    return dict(id=f'R{i}', lesson_code=lesson, level=level, ppct_outcome_index=outcome, text=f'YCCĐ cụ thể {i}')


def slot(sid, kind, number, parts):
    return dict(id=sid, kind=kind, number=number, scoring=dict(mode='sum_parts'),
                parts=[dict(id=f'{sid}-{i}', label=l, requirement_id=r, points=p) for i, (l, r, p) in enumerate(parts)])


def thpt_matrix(**kw):
    """Đúng tỉ lệ CV 7991: MC 3, ĐS 2, TLN 2, TL 3; Biết 4, Hiểu 3, Vận dụng 3."""
    m = dict(profile='THPT', grade=10, exam_type='CK1',
             requirements=[req(1, 'B1', 'Biết', 0), req(2, 'B1', 'Hiểu', 1), req(3, 'B2', 'Vận dụng', 0)],
             slots=[slot(f'M{i}', 'MC', i, [('', 'R1', 0.25)]) for i in range(1, 13)] +
                   [slot('Y1', 'YN', 1, [(l, 'R1', 0.25) for l in 'abcd']), slot('Y2', 'YN', 2, [(l, 'R2', 0.25) for l in 'abcd'])] +
                   [slot(f'S{i}', 'SHORT', i, [('', 'R2', 0.5)]) for i in range(1, 5)] +
                   [slot('E1', 'ES', 1, [('a', 'R3', 1.5), ('b', 'R3', 1.5)])])
    m.update(kw)
    return m


def exam_from(m):
    reqs = {r['id']: r for r in m['requirements']}
    outcomes = {(l['lesson_code'], i): o for l in PPCT['lessons'] for i, o in enumerate(l['outcomes'])}
    qs = []
    for s in m['slots']:
        r = reqs[s['parts'][0]['requirement_id']]
        qs.append(dict(id='Q' + s['id'], type=s['kind'], slot_id=s['id'], slot_number=s['number'], lesson_code=r['lesson_code'],
                       level=r['level'], learning_outcome=outcomes[(r['lesson_code'], r['ppct_outcome_index'])],
                       points=float(sum(Decimal(str(p['points'])) for p in s['parts']))))
    return dict(questions=qs)


class CellCheckTests(unittest.TestCase):
    def test_matching_exam_passes_every_cell(self):
        m = thpt_matrix()
        report = cell_check(exam_from(m), m, PPCT)
        self.assertTrue(report['ok'], report)
        cell = next(c for c in report['cells'] if c['kind'] == 'MC')
        self.assertEqual((cell['expected_questions'], cell['actual_questions']), (12, 12))
        self.assertEqual(cell['expected_points'], '3')

    def test_wrong_level_or_outcome_or_points_is_reported_per_cell(self):
        m = thpt_matrix()
        for change in ({'level': 'Hiểu'}, {'learning_outcome': 'YCCĐ hai'}, {'points': 0.5}, {'lesson_code': 'B2'}):
            exam = exam_from(m)
            exam['questions'][0].update(change)
            report = cell_check(exam, m, PPCT)
            self.assertFalse(report['ok'], change)
            self.assertTrue(any(not c['ok'] for c in report['cells']), change)

    def test_missing_question_reported(self):
        m = thpt_matrix()
        exam = exam_from(m); exam['questions'].pop()
        report = cell_check(exam, m, PPCT)
        bad = [c for c in report['cells'] if not c['ok']]
        self.assertEqual([(c['kind'], c['expected_questions'], c['actual_questions']) for c in bad], [('ES', 1, 0)])


class RatioWarningTests(unittest.TestCase):
    def test_cv7991_distribution_has_no_warning(self):
        self.assertEqual(ratio_warnings(thpt_matrix()), [])

    def test_deviation_above_tolerance_warns_and_says_internal_threshold(self):
        m = thpt_matrix()
        m['slots'] = [s for s in m['slots'] if s['kind'] != 'SHORT'] + [slot(f'M{i}', 'MC', i, [('', 'R2', 0.5)]) for i in range(13, 17)]
        warnings = ratio_warnings(m)
        codes = {w['code'] for w in warnings}
        self.assertIn('ratio_kind', codes)
        self.assertTrue(all('ngưỡng nội bộ' in w['message'] for w in warnings))
        self.assertTrue(all(w['severity'] == 'warning' for w in warnings))

    def test_no_short_answer_moves_points_to_true_false(self):
        m = thpt_matrix()
        m['slots'] = [s for s in m['slots'] if s['kind'] != 'SHORT'] + [
            slot('Y3', 'YN', 3, [(l, 'R2', 0.25) for l in 'abcd']), slot('Y4', 'YN', 4, [(l, 'R2', 0.25) for l in 'abcd'])]
        self.assertEqual(ratio_warnings(m), [])  # ĐS 4,0 điểm đúng như chú thích 3 của CV 7991

    def test_tolerance_is_configurable_and_boundary_is_inclusive(self):
        m = thpt_matrix()
        m['slots'][0]['parts'][0]['points'] = 0.75  # MC 3,5 (lệch 0,5) và Biết 4,5
        m['slots'][-1]['parts'][0]['points'] = 1.0  # TL 2,5 để tổng vẫn 10
        self.assertEqual(ratio_warnings(m), [])     # lệch đúng 0,5 chưa vượt ngưỡng
        self.assertTrue(ratio_warnings(dict(m, ratio_tolerance='0.25')))
        with self.assertRaises(ServiceError):
            ratio_warnings(dict(m, ratio_tolerance='-1'))

    def test_only_thpt_periodic(self):
        self.assertEqual(ratio_warnings(dict(thpt_matrix(), profile='THCS')), [])
        unbalanced = thpt_matrix(); unbalanced['slots'][0]['parts'][0]['points'] = 2
        self.assertEqual(ratio_warnings(dict(unbalanced, exam_type='TX')), [])
        self.assertTrue(ratio_warnings(unbalanced))


if __name__ == '__main__':
    unittest.main()
