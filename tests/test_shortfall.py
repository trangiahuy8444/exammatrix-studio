"""Mốc B9: báo cáo thiếu câu theo từng ô ma trận (bài × YCCĐ × dạng × mức độ).

Chỉ câu đã duyệt mới tính là đủ; báo cáo kèm số câu chờ duyệt / cần sửa / nháp để biết duyệt thêm có bù được không.
"""
import unittest

from domain.matrix_checks import shortfall_report

PPCT = {'lessons': [dict(grade=9, lesson_code='B1', outcomes=['YCCĐ một', 'YCCĐ hai'])]}


def q(i, status, outcome='YCCĐ một', kind='MC', level='Biết', grade=9):
    return dict(id=f'Q{i}', grade=grade, type=kind, lesson_code='B1', level=level, learning_outcome=outcome,
                review_status=status)


MATRIX = dict(id='M1', grade=9,
              requirements=[dict(id='R1', lesson_code='B1', level='Biết', ppct_outcome_index=0),
                            dict(id='R2', lesson_code='B1', level='Hiểu', ppct_outcome_index=1)],
              slots=[dict(id=f'S{i}', kind='MC', number=i, parts=[dict(id=f'P{i}', requirement_id='R1', points=1)])
                     for i in range(1, 4)] +
                    [dict(id='E1', kind='ES', number=1, parts=[dict(id='EA', requirement_id='R2', points=7)])])


class ShortfallTests(unittest.TestCase):
    def test_counts_by_status_and_shortfall(self):
        bank = [q(1, 'approved'), q(2, 'pending_review'), q(3, 'content_checked'), q(4, 'needs_review'),
                q(5, 'draft'), q(6, 'archived'), q(7, 'approved', grade=8), q(8, 'approved', outcome='YCCĐ hai'),
                q(9, 'approved', kind='ES', level='Hiểu', outcome='YCCĐ hai')]
        report = shortfall_report(MATRIX, bank, PPCT)
        mc = next(c for c in report['cells'] if c['kind'] == 'MC')
        self.assertEqual((mc['needed'], mc['approved'], mc['pending_review'], mc['needs_review'], mc['draft']), (3, 1, 2, 1, 1))
        self.assertEqual(mc['shortfall'], 2)
        self.assertEqual(mc['outcome'], 'YCCĐ một')
        es = next(c for c in report['cells'] if c['kind'] == 'ES')
        self.assertEqual((es['needed'], es['approved'], es['shortfall']), (1, 1, 0))
        self.assertFalse(report['ok'])
        self.assertEqual(report['total_shortfall'], 2)

    def test_all_covered(self):
        bank = [q(i, 'approved', outcome='YCCĐ một') for i in range(3)] + [q(9, 'approved', kind='ES', level='Hiểu', outcome='YCCĐ hai')]
        report = shortfall_report(MATRIX, bank, PPCT)
        self.assertTrue(report['ok'])
        self.assertEqual(report['total_shortfall'], 0)


class ShortfallRouteTests(unittest.TestCase):
    def test_service_route(self):
        from matrix_fixtures import MatrixFixture

        class Case(MatrixFixture, unittest.TestCase):
            def runTest(inner):
                inner.setup_services()
                m = inner.locked_matrix()
                report = inner.matrices.shortfall(m['id'])
                inner.assertEqual(report['cells'][0]['needed'], 1)
                inner.assertEqual(report['cells'][0]['approved'], 16)  # 16 câu mẫu đã duyệt khớp ô

        result = unittest.TextTestRunner(verbosity=0).run(Case())
        self.assertTrue(result.wasSuccessful(), result.failures + result.errors)


if __name__ == '__main__':
    unittest.main()
