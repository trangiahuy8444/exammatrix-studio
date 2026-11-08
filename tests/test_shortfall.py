"""Mốc B9: báo cáo thiếu câu theo từng ô ma trận (bài × YCCĐ × dạng × mức độ).

Chỉ câu đã duyệt mới tính là đủ; báo cáo kèm số câu chờ duyệt / cần sửa / nháp để biết duyệt thêm có bù được không.
"""
import unittest
import copy

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


class ShortfallCompletenessTests(unittest.TestCase):
    def matrix(self, req_ids=('R1', 'R2', 'R3', 'R4')):
        ppct = {'lessons': [dict(grade=10, lesson_code='B1', outcomes=['Yêu cầu một', 'Yêu cầu hai']),
                            dict(grade=10, lesson_code='B2', outcomes=['Yêu cầu ba', 'Yêu cầu bốn'])]}
        m = dict(id='M-MULTI', grade=10, requirements=[
            dict(id='R1', lesson_code='B1', level='Biết', ppct_outcome_index=0),
            dict(id='R2', lesson_code='B1', level='Hiểu', ppct_outcome_index=1),
            dict(id='R3', lesson_code='B2', level='Vận dụng', ppct_outcome_index=0),
            dict(id='R4', lesson_code='B2', level='Vận dụng cao', ppct_outcome_index=1)],
            slots=[dict(id='YN-1', kind='YN', number=1, parts=[
                dict(id='P'+str(i+1), label=chr(97+i), requirement_id=r, points=.25)
                for i, r in enumerate(req_ids)])])
        return m, ppct

    def test_mixed_four_part_slot_is_unresolved_and_keeps_every_part(self):
        m, ppct = self.matrix()
        before = copy.deepcopy((m, ppct))
        bank = [dict(id='Q1', grade=10, lesson_code='B1', learning_outcome='Yêu cầu một',
                     type='YN', level='Biết', review_status='approved')]
        report = shortfall_report(m, bank, ppct)
        self.assertFalse(report['ok'])
        self.assertFalse(report['complete'])
        self.assertEqual(report['cells'], [])
        self.assertEqual(report['total_shortfall'], 0)  # Chỉ tổng thiếu ở phần đã xác định.
        slot = report['unresolved_slots'][0]
        self.assertEqual((slot['slot_id'], slot['kind'], slot['number']), ('YN-1', 'YN', 1))
        self.assertEqual([p['label'] for p in slot['parts']], list('abcd'))
        self.assertEqual([p['level'] for p in slot['parts']], ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'])
        self.assertEqual([p['outcome'] for p in slot['parts']], ['Yêu cầu một', 'Yêu cầu hai', 'Yêu cầu ba', 'Yêu cầu bốn'])
        self.assertEqual([p['points'] for p in slot['parts']], [.25]*4)
        self.assertEqual((m, ppct), before)

    def test_homogeneous_four_parts_need_one_whole_question(self):
        m, ppct = self.matrix(('R1',)*4)
        bank = [dict(id='Q1', grade=10, lesson_code='B1', learning_outcome='Yêu cầu một',
                     type='YN', level='Biết', review_status='approved')]
        report = shortfall_report(m, bank, ppct)
        self.assertTrue(report['ok'])
        self.assertTrue(report['complete'])
        self.assertEqual(report['unresolved_slots'], [])
        self.assertEqual((report['cells'][0]['needed'], report['cells'][0]['approved']), (1, 1))

    def test_empty_compact_candidate_cannot_be_reported_sufficient(self):
        m, ppct = self.matrix(); m['slots'] = []
        m.update(mode='received', reconciliation={'confirmed': False})
        report = shortfall_report(m, [], ppct)
        self.assertFalse(report['ok'])
        self.assertFalse(report['complete'])
        self.assertIn('no_slots', [i['code'] for i in report['issues']])

    def test_unknown_requirement_keeps_all_parts_and_is_incomplete(self):
        m, ppct = self.matrix(('R1', 'UNKNOWN', 'R1', 'R1'))
        report = shortfall_report(m, [], ppct)
        self.assertFalse(report['ok'])
        self.assertFalse(report['complete'])
        self.assertEqual(len(report['unresolved_slots'][0]['parts']), 4)
        self.assertEqual(report['unresolved_slots'][0]['parts'][1]['requirement_id'], 'UNKNOWN')
        self.assertIn('requirement_unmapped', [i['code'] for i in report['issues']])

    def test_missing_lesson_or_outcome_mapping_does_not_count_parent_match(self):
        for changes in ({'lesson_code': ''}, {'ppct_outcome_index': None}, {'ppct_outcome_index': 99},
                        {'ppct_outcome_index': True}, {'level': ''}):
            with self.subTest(changes=changes):
                m, ppct = self.matrix(('R1',)*4)
                m['requirements'][0].update(changes)
                report = shortfall_report(m, [], ppct)
                self.assertFalse(report['ok'])
                self.assertFalse(report['complete'])
                self.assertEqual(len(report['unresolved_slots'][0]['parts']), 4)

    def test_known_cells_still_report_shortfall_next_to_unresolved_slots(self):
        m, ppct = self.matrix()
        m['slots'].append(dict(id='MC-1', kind='MC', number=1,
                              parts=[dict(id='MC-P1', requirement_id='R1', points=.25)]))
        report = shortfall_report(m, [], ppct)
        self.assertFalse(report['ok'])
        self.assertFalse(report['complete'])
        self.assertEqual(len(report['cells']), 1)
        self.assertEqual(report['total_shortfall'], 1)
        self.assertEqual(report['cells'][0]['slots'], ['MC 1'])

    def test_unconfirmed_or_issues_in_received_source_prevents_sufficient(self):
        for reconciliation in ({'confirmed': False, 'issues': []},
                               {'confirmed': True, 'issues': [{'code': 'unmapped', 'message': 'Cần đối chiếu'}]}):
            with self.subTest(reconciliation=reconciliation):
                m, ppct = self.matrix(('R1',)*4)
                m.update(mode='received', reconciliation=reconciliation)
                bank = [dict(id='Q1', grade=10, lesson_code='B1', learning_outcome='Yêu cầu một',
                             type='YN', level='Biết', review_status='approved')]
                report = shortfall_report(m, bank, ppct)
                self.assertFalse(report['ok'])
                self.assertFalse(report['complete'])
                self.assertEqual(report['cells'][0]['shortfall'], 0)

    def test_legacy_without_catalog_uses_explicit_requirement_text(self):
        m, _ = self.matrix(('R1',)*4)
        m['requirements'][0]['text'] = 'Yêu cầu một'
        report = shortfall_report(m, [], None)
        self.assertTrue(report['complete'])
        self.assertEqual(report['cells'][0]['needed'], 1)

    def test_empty_part_list_is_unresolved(self):
        m, ppct = self.matrix(); m['slots'][0]['parts'] = []
        report = shortfall_report(m, [], ppct)
        self.assertFalse(report['ok'])
        self.assertFalse(report['complete'])
        self.assertEqual(report['unresolved_slots'][0]['parts'], [])


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
