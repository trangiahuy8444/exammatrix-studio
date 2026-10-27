"""Mốc B6: tiêu chí đối chiếu đề cương (rules/01: 90% đề lấy từ hoặc bám sát đề cương).

T = (N trùng + N bám sát đã duyệt) / N tổng × 100%, đạt khi T ≥ 90%. "Bám sát" chỉ tính khi người có quyền duyệt
đã xác nhận (lưu người duyệt, lý do, thời điểm). Chế độ "chỉ tính câu trùng" do tổ chọn. Độ bao phủ YCCĐ phải 100%.
"""
import unittest

from domain.revision_criterion import revision_report


def q(i, lesson='B1', outcome='YCCĐ 1', points=1.0, text=None, **kw):
    out = dict(id=f'Q{i}', type='MC', lesson_code=lesson, learning_outcome=outcome, points=points,
               question=text or f'Câu đề cương số {i}?', options=['a', 'b', 'c', 'd'], correct=0, slot_number=i)
    out.update(kw)
    return out


def revision(n=10):
    return dict(id='REV1', questions=[q(i) for i in range(n)])


def exam(questions, **kw):
    e = dict(id='E1', questions=questions)
    e.update(kw)
    return e


class CriterionTests(unittest.TestCase):
    def test_all_exact_passes(self):
        r = revision_report(exam([q(i) for i in range(10)]), revision())
        self.assertTrue(r['passed'])
        self.assertEqual(r['exact'], [f'Q{i}' for i in range(10)])
        self.assertEqual(r['t_percent'], '100')

    def test_ninety_percent_boundary(self):
        qs = [q(i) for i in range(9)] + [q(99, text='Câu ngoài đề cương?')]
        r = revision_report(exam(qs), revision())
        self.assertTrue(r['passed']); self.assertEqual(r['t_percent'], '90')
        qs = [q(i) for i in range(8)] + [q(98, text='Ngoài 1?'), q(99, text='Ngoài 2?')]
        r = revision_report(exam(qs), revision())
        self.assertFalse(r['passed']); self.assertEqual(r['outside'], ['Q98', 'Q99'])

    def test_exact_match_survives_option_shuffle_and_spacing(self):
        moved = q(0, text='  câu ĐỀ CƯƠNG số 0? ', options=['d', 'c', 'b', 'a'], correct=3)
        r = revision_report(exam([moved]), revision(1))
        self.assertEqual(r['exact'], ['Q0'])

    def test_close_match_counts_only_when_approved(self):
        qs = [q(i) for i in range(8)] + [q(98, text='Bám sát 1?'), q(99, text='Bám sát 2?')]
        pending = {'Q98': dict(revision_question_id='Q8', reason='Đổi số liệu', status='pending')}
        r = revision_report(exam(qs, close_matches=pending), revision())
        self.assertFalse(r['passed'])
        self.assertEqual(r['close_pending'], ['Q98'])
        approved = {'Q98': dict(revision_question_id='Q8', reason='Đổi số liệu', status='approved', approved_by='tt',
                                approved_at='2026-10-27'),
                    'Q99': dict(revision_question_id='Q9', reason='Đổi ngữ cảnh', status='approved', approved_by='tt',
                                approved_at='2026-10-27')}
        r = revision_report(exam(qs, close_matches=approved), revision())
        self.assertTrue(r['passed'])
        self.assertEqual((r['exact_count'], r['close_count'], r['total']), (8, 2, 10))

    def test_close_match_must_point_to_a_revision_question(self):
        qs = [q(i) for i in range(9)] + [q(99, text='Bám sát?')]
        bad = {'Q99': dict(revision_question_id='KHONG_CO', reason='x', status='approved', approved_by='tt')}
        r = revision_report(exam(qs, close_matches=bad), revision())
        self.assertEqual(r['close_approved'], [])
        self.assertIn('Q99', r['outside'])

    def test_exact_only_mode(self):
        qs = [q(i) for i in range(8)] + [q(98, text='Bám sát 1?'), q(99, text='Bám sát 2?')]
        approved = {k: dict(revision_question_id=v, reason='r', status='approved', approved_by='tt')
                    for k, v in (('Q98', 'Q8'), ('Q99', 'Q9'))}
        r = revision_report(exam(qs, close_matches=approved, revision_policy='chi_trung'), revision())
        self.assertFalse(r['passed'])
        self.assertEqual(r['mode'], 'chi_trung')

    def test_points_percent_is_reference_only(self):
        qs = [q(i, points=0.25) for i in range(9)] + [q(99, text='Ngoài?', points=7.75)]
        r = revision_report(exam(qs), revision())
        self.assertTrue(r['passed'])                 # quyết định theo số câu
        self.assertEqual(r['points_percent'], '22.5')  # chỉ để tham khảo


class CoverageTests(unittest.TestCase):
    def test_full_coverage(self):
        self.assertTrue(revision_report(exam([q(0)]), revision(1))['coverage']['ok'])

    def test_question_outside_revision_outcomes_fails_coverage(self):
        r = revision_report(exam([q(0), q(1, outcome='YCCĐ không có trong đề cương', text='Khác?')]), revision(1))
        self.assertFalse(r['coverage']['ok'])
        self.assertEqual(r['coverage']['missing'][0]['question_id'], 'Q1')
        self.assertEqual(r['coverage']['percent'], '50')
        self.assertFalse(r['passed'])


if __name__ == '__main__':
    unittest.main()
