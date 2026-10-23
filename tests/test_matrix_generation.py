import copy
import unittest
from matrix_fixtures import MatrixFixture,minimal_matrix,confirmation
from bank_service import ServiceError
try:
    from matrices.generation import generate_from_matrix,matrix_candidates
except ImportError:
    generate_from_matrix=matrix_candidates=None


class MatrixGenerationTests(MatrixFixture,unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(generate_from_matrix,'Matrix exam generation must be implemented')
        self.setup_services();self.matrix=self.locked_matrix()
        self.revision=self.bank.save_revision(dict(title='Đề cương',grade=9,question_ids=['Q0']))
        self.payload=dict(matrix_id=self.matrix['id'],revision_id=self.revision['id'],title='Đề cơ sở',
            campus='Cao Thắng',exam_code='101',seed=12,
            placements=[dict(slot_id='S1',question_id='Q0',reviewed_part_ids=['P1'])])

    def test_explicit_placement_creates_immutable_matrix_snapshot(self):
        candidates=matrix_candidates(self.bank,self.matrices,self.matrix['id'])
        self.assertIn('Q0',[q['id'] for q in candidates['slots'][0]['candidates']])
        q0=next(q for q in candidates['slots'][0]['candidates'] if q['id']=='Q0')
        self.assertEqual(q0['options'][q0['correct']],'Phương án 0')
        self.assertTrue(q0['content_hash'])
        exam=generate_from_matrix(self.bank,self.matrices,self.payload)
        self.assertEqual(exam['questions'][0]['id'],'Q0');self.assertEqual(exam['questions'][0]['slot_number'],1)
        self.assertEqual(exam['questions'][0]['points'],10)
        self.assertEqual(exam['campus'],'Cao Thắng');self.assertEqual(exam['revision_match_count'],1)
        self.matrices.new_version(self.matrix['id'])
        self.assertEqual(self.bank.state()['exams'][0]['matrix_snapshot']['version'],1)

    def test_changed_content_same_id_fails_revision_match(self):
        q=copy.deepcopy(self.bank.state()['bank']['questions'][0]);q['question']='Đã sửa câu sau phát đề cương?'
        self.bank.save_question(q)
        with self.assertRaises(ServiceError):generate_from_matrix(self.bank,self.matrices,self.payload)
        self.assertEqual(self.bank.state()['exams'],[])

    def test_missing_confirmation_or_placement_does_not_save(self):
        for placements in ([],[dict(slot_id='S1',question_id='Q0',reviewed_part_ids=[])],
                           [dict(slot_id='unknown',question_id='Q0',reviewed_part_ids=['P1'])]):
            with self.assertRaises(ServiceError):generate_from_matrix(self.bank,self.matrices,dict(self.payload,placements=placements))
        self.assertEqual(self.bank.state()['exams'],[])

    def test_archived_or_draft_question_rejected(self):
        q=copy.deepcopy(self.bank.state()['bank']['questions'][0]);q['review_status']='draft';self.bank.save_question(q)
        with self.assertRaises(ServiceError):generate_from_matrix(self.bank,self.matrices,self.payload)
        self.matrices.archive(self.matrix['id'],self.matrix['revision'],'Bản cũ')
        with self.assertRaises(ServiceError):generate_from_matrix(self.bank,self.matrices,self.payload)

    def test_answer_feedback_tracks_shuffled_options(self):
        first=generate_from_matrix(self.bank,self.matrices,self.payload)
        second=generate_from_matrix(self.bank,self.matrices,self.payload)
        q=first['questions'][0]
        self.assertEqual(q['options'],second['questions'][0]['options'])
        self.assertEqual(q['options'][q['correct']],'Phương án 0')
        for opt,feedback in zip(q['options'],q['option_explanations']):
            self.assertEqual(opt[-1],feedback[-1])
