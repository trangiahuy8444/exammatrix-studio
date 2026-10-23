import copy
import unittest

from bank_service import ServiceError
from matrices.generation import generate_from_matrix
from matrix_fixtures import MatrixFixture


class PolicyInvariantTests(MatrixFixture, unittest.TestCase):
    def setUp(self):
        self.setup_services()
        self.matrix = self.locked_matrix()
        self.revision = self.bank.save_revision(dict(
            title='Đề cương gốc', grade=9, question_ids=[f'Q{i}' for i in range(16)]))
        self.request = dict(title='Đề thử', grade=9, exam_type='TX', duration=45,
            revision_id=self.revision['id'], seed='policy',
            blueprint=[dict(lesson_code='B1', type='MC', level='Biết', count=10, points_per_question=1)])
        self.placement = dict(matrix_id=self.matrix['id'], revision_id=self.revision['id'],
            title='Đề ma trận', campus='Cơ sở thử', exam_code='101',
            placements=[dict(slot_id='S1', question_id='Q0', reviewed_part_ids=['P1'])])

    def exam(self):
        return generate_from_matrix(self.bank, self.matrices, self.placement)

    def test_general_policy_uses_its_trusted_server_minimum(self):
        from domain.policies import resolve_similarity
        self.assertEqual(resolve_similarity(60, {'id': 'general', 'minimum_revision_percent': 50}), 60)
        with self.assertRaises(ServiceError):
            resolve_similarity(49, {'id': 'general', 'minimum_revision_percent': 50})

    def test_named_revision_must_match_exam_grade(self):
        from domain.policies import require_revision
        with self.assertRaisesRegex(ServiceError, 'cùng khối'):
            require_revision([self.revision], self.revision['id'], 8)

    def test_generation_rejects_low_and_nonfinite_thresholds_without_saving(self):
        for value in [0, 80, 89.99, True, float('nan'), float('inf'), 'abc', None, 101]:
            with self.subTest(value=value), self.assertRaises(ServiceError):
                self.bank.generate_exam(dict(self.request, similarity_percent=value))
        self.assertEqual(self.bank.state()['exams'], [])

    def test_matrix_generation_cannot_lower_threshold(self):
        with self.assertRaises(ServiceError):
            generate_from_matrix(self.bank, self.matrices, dict(self.placement, similarity_percent=80))
        self.assertEqual(self.bank.state()['exams'], [])

    def test_exact_mode_cannot_accept_only_eight_of_ten_revision_questions(self):
        revision = self.bank.save_revision(dict(title='Chỉ tám câu', grade=9,
                                               question_ids=[f'Q{i}' for i in range(8)]))
        with self.assertRaises(ServiceError):
            self.bank.generate_exam(dict(self.request, revision_id=revision['id'],
                                         similarity_percent=90, similarity_mode='exact'))
        self.assertEqual(self.bank.state()['exams'], [])

    def test_verify_rejects_lower_threshold_without_writing(self):
        exam = self.exam()
        before = self.bank._records('exams')
        with self.assertRaises(ServiceError):
            self.bank.verify_exam(exam['id'], self.matrices, 80)
        self.assertEqual(before, self.bank._records('exams'))

    def test_adjust_rejects_lower_threshold_without_writing(self):
        exam = self.exam()
        before = self.bank._records('exams')
        with self.assertRaises(ServiceError):
            self.bank.adjust_exam_similarity(dict(id=exam['id'], target_percent=80), self.matrices)
        self.assertEqual(before, self.bank._records('exams'))

    def test_inspect_rejects_low_threshold(self):
        with self.assertRaises(ServiceError):
            self.bank.inspect_exam_import(dict(exam=self.exam(), similarity_percent=80), self.matrices)

    def test_import_rejects_lower_threshold(self):
        exam = self.exam()
        before = self.bank._records('exams')
        with self.assertRaises(ServiceError):
            self.bank.import_verified_exams(dict(candidates=[exam], similarity_percent=80), self.matrices)
        self.assertEqual(before, self.bank._records('exams'))

    def test_missing_named_revision_is_not_silently_replaced(self):
        exam = self.exam()
        records = self.bank._records('exams')
        records[0]['revision_id'] = 'REV-MISSING'
        self.bank._atomic_save(self.bank.data_dir/'exams.json', records)
        self.bank.save_revision(dict(title='Đề cương mới nhất', grade=9, question_ids=['Q0']))
        before = copy.deepcopy(self.bank._records('exams'))
        with self.assertRaisesRegex(ServiceError, 'Đề cương'):
            self.bank.verify_exam(exam['id'], self.matrices)
        self.assertEqual(before, self.bank._records('exams'))

    def test_adjust_does_not_switch_missing_revision(self):
        exam = self.exam()
        with self.assertRaisesRegex(ServiceError, 'Đề cương'):
            self.bank.adjust_exam_similarity(dict(id=exam['id'], revision_id='REV-MISSING'), self.matrices)

    def test_import_does_not_switch_missing_revision(self):
        exam = self.exam()
        exam['revision_id'] = 'REV-MISSING'
        with self.assertRaisesRegex(ServiceError, 'Đề cương'):
            self.bank.import_verified_exams(dict(candidates=[exam]), self.matrices)

    def test_inspection_requires_explicit_revision(self):
        exam = self.exam()
        exam.pop('revision_id')
        with self.assertRaisesRegex(ServiceError, 'Đề cương'):
            self.bank.inspect_exam_import(dict(exam=exam), self.matrices)

    def test_inspection_does_not_replace_missing_named_revision(self):
        exam = self.exam()
        exam['revision_id'] = 'REV-MISSING'
        with self.assertRaisesRegex(ServiceError, 'Đề cương'):
            self.bank.inspect_exam_import(dict(exam=exam), self.matrices)

    def test_exact_verification_does_not_tolerate_coverage_below_minimum(self):
        from docx_exam_importer import verify_exam_against_matrix
        qs = copy.deepcopy(self.bank.state()['bank']['questions'][:10])
        for q in qs:
            q['points'] = 1
        qs[0]['points'] = 1.5
        qs[8]['points'] = qs[9]['points'] = .75
        revision = dict(id='REV-8', grade=9, questions=copy.deepcopy(qs[:8]))
        report = verify_exam_against_matrix(dict(grade=9, questions=qs), self.matrix, revision, 90, 'exact')
        self.assertFalse(report['revision_check']['matched'])

    def test_verification_without_revision_does_not_trust_client_flags(self):
        from docx_exam_importer import verify_exam_against_matrix
        exam = self.exam()
        for q in exam['questions']:
            q['in_revision'] = True
        report = verify_exam_against_matrix(exam, self.matrix, None, 90, 'min')
        self.assertFalse(report['revision_check']['matched'])


if __name__ == '__main__':
    unittest.main()
