"""Mốc B4: cảnh báo tỉ lệ trong kiểm tra ma trận; đối chiếu từng ô khi kiểm định và khi duyệt đề."""
import json
import unittest

from matrices import model
from matrices.generation import generate_from_matrix
from matrix_fixtures import MatrixFixture, minimal_matrix


class MatrixWarningTests(MatrixFixture, unittest.TestCase):
    def setUp(self):
        self.setup_services()

    def test_invalid_tolerance_is_an_error(self):
        report = model.validate_matrix(dict(minimal_matrix(), ratio_tolerance='abc'), self.ppct, True)
        self.assertIn('ratio_tolerance', {e['code'] for e in report['errors']})

    def test_tolerance_is_part_of_locked_content(self):
        m = minimal_matrix()
        self.assertNotEqual(model.matrix_digest(m), model.matrix_digest(dict(m, ratio_tolerance='0.25')))


class ExamCellGateTests(MatrixFixture, unittest.TestCase):
    def setUp(self):
        self.setup_services()
        self.matrix = self.locked_matrix()
        revision = self.bank.save_revision(dict(title='Đề cương', grade=9, question_ids=['Q0']))
        self.exam = generate_from_matrix(self.bank, self.matrices, dict(
            matrix_id=self.matrix['id'], revision_id=revision['id'], title='Đề', campus='Cao Thắng', exam_code='101',
            seed=1, placements=[dict(slot_id='S1', question_id='Q0', reviewed_part_ids=['P1'])]))

    def test_verification_reports_cells(self):
        v = self.bank.verify_exam(self.exam['id'], self.matrices)['verification']
        self.assertTrue(v['cells']['ok'])
        self.assertEqual(v['cells']['cells'][0]['expected_points'], '10')
        self.assertEqual(v['ratio_warnings'], [])

    def test_approval_blocked_when_cell_points_differ(self):
        path = self.root/'data'/'exams.json'
        records = json.loads(path.read_text(encoding='utf-8'))
        records[0]['questions'][0]['points'] = 9
        path.write_text(json.dumps(records, ensure_ascii=False), encoding='utf-8')
        self.bank.exam_transition(self.exam['id'], 'submit')
        from bank_service import ServiceError
        with self.assertRaises(ServiceError) as ctx:
            self.bank.exam_transition(self.exam['id'], 'approve', matrix_service=self.matrices)
        self.assertIn('ma trận', json.dumps(ctx.exception.details, ensure_ascii=False))

    def test_matching_exam_can_be_approved(self):
        self.bank.exam_transition(self.exam['id'], 'submit')
        locked = self.bank.exam_transition(self.exam['id'], 'approve', matrix_service=self.matrices)
        self.assertEqual(locked['status'], 'locked')


if __name__ == '__main__':
    unittest.main()
