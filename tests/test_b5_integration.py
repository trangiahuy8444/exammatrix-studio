"""Mốc B5: cảnh báo câu vừa dùng gắn vào tạo đề, kiểm định, duyệt đề và danh sách câu ứng viên; không chặn."""
import json
import unittest

import test_backend
from domain.exam_lifecycle import exam_hash
from matrices.generation import generate_from_matrix, matrix_candidates
from matrix_fixtures import MatrixFixture


class ReuseOnBlueprintExamTests(test_backend.BackendTests):
    def publish(self, exam):
        self.svc.exam_transition(exam['id'], 'submit')
        self.svc.exam_transition(exam['id'], 'approve')
        return self.svc.exam_transition(exam['id'], 'publish')

    def test_second_exam_warns_about_questions_of_published_exam(self):
        first = self.publish(self.svc.generate_exam(self.request()))
        second = self.svc.generate_exam(self.request(seed=99))
        warnings = second['reuse_check']['warnings']
        self.assertTrue(warnings)
        self.assertTrue(all(w['other_exam_id'] == first['id'] for w in warnings))
        self.assertEqual(second['reuse_check']['days'], 365)

    def test_reuse_check_does_not_change_hash_or_block_approval(self):
        self.publish(self.svc.generate_exam(self.request()))
        second = self.svc.generate_exam(self.request(seed=99))
        before = exam_hash(second)
        self.svc.exam_transition(second['id'], 'submit')
        locked = self.svc.exam_transition(second['id'], 'approve')
        self.assertEqual(locked['status'], 'locked')
        self.assertTrue(locked['reuse_check']['warnings'])
        self.assertEqual(exam_hash(locked), before)


for name in [n for n in dir(test_backend.BackendTests) if n.startswith('test_')]:
    setattr(ReuseOnBlueprintExamTests, name, None)


class ReuseOnMatrixTests(MatrixFixture, unittest.TestCase):
    def setUp(self):
        self.setup_services()
        self.matrix = self.locked_matrix()
        self.revision = self.bank.save_revision(dict(title='Đề cương', grade=9, question_ids=['Q0']))

    def generate(self, code):
        return generate_from_matrix(self.bank, self.matrices, dict(
            matrix_id=self.matrix['id'], revision_id=self.revision['id'], title='Đề ' + code, campus='Cao Thắng',
            exam_code=code, seed=1, placements=[dict(slot_id='S1', question_id='Q0', reviewed_part_ids=['P1'])]))

    def test_candidates_mark_recently_used_and_verification_reports_it(self):
        first = self.generate('101')
        for action in ('submit', 'approve', 'publish'):
            self.bank.exam_transition(first['id'], action, matrix_service=self.matrices)
        q0 = next(c for c in matrix_candidates(self.bank, self.matrices, self.matrix['id'])['slots'][0]['candidates']
                  if c['id'] == 'Q0')
        self.assertEqual(q0['recently_used'][0]['exam_id'], first['id'])
        second = self.generate('102')
        verification = self.bank.verify_exam(second['id'], self.matrices)['verification']
        self.assertEqual(verification['reuse_warnings'][0]['question_id'], 'Q0')


if __name__ == '__main__':
    unittest.main()
