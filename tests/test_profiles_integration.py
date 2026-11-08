"""Mốc B3: mẫu hồ sơ và chính sách chấm gắn vào ma trận, bộ tạo đề, đề đã lưu và hướng dẫn chấm."""
import copy
import hashlib
import io
import json
import unittest

import docx

from bank_service import ServiceError
from domain.review import CHECKLIST
from domain.scoring import DEFAULT_POLICY
from matrices import model
from matrices.generation import generate_from_matrix
from matrix_fixtures import MatrixFixture, confirmation, minimal_matrix


def yn_matrix(**kw):
    m = minimal_matrix()
    m['slots'] = [dict(id='S1', kind='MC', number=1, scoring=dict(mode='sum_parts'),
                       parts=[dict(id='P1', label='', requirement_id='R1', points=9, indicator='')]),
                  dict(id='Y1', kind='YN', number=1, scoring=dict(mode='sum_parts'),
                       parts=[dict(id=f'Y{l}', label=l, requirement_id='R1', points=0.25, indicator='') for l in 'abcd'])]
    m.update(kw)
    return m


class MatrixProfileTests(MatrixFixture, unittest.TestCase):
    def setUp(self):
        self.setup_services()

    def codes(self, m):
        return {e['code'] for e in model.validate_matrix(m, self.ppct, True)['errors']}

    def test_thcs_default_rejects_yn_but_teacher_can_allow_it(self):
        self.assertIn('profile_kind', self.codes(yn_matrix()))
        self.assertNotIn('profile_kind', self.codes(yn_matrix(allowed_kinds=['MC', 'YN'])))
        self.assertIn('allowed_kinds', self.codes(yn_matrix(allowed_kinds=['TF'])))

    def test_invalid_scoring_policy_rejected(self):
        bad = dict(DEFAULT_POLICY, yn_table={'0': '0', '1': '0.5', '2': '0.25', '3': '0.5', '4': '1'})
        self.assertIn('scoring_policy', self.codes(yn_matrix(allowed_kinds=['MC', 'YN'], scoring_policy=bad)))

    def test_digest_of_existing_matrices_unchanged(self):
        m = minimal_matrix()
        body = {k: m.get(k) for k in model.CONTENT_FIELDS}
        legacy = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False, allow_nan=False,
                                           separators=(',', ':')).encode()).hexdigest()
        self.assertEqual(model.matrix_digest(m), legacy)
        self.assertNotEqual(model.matrix_digest(dict(m, scoring_policy=DEFAULT_POLICY)), legacy)
        self.assertNotEqual(model.matrix_digest(dict(m, allowed_kinds=['MC', 'ES'])), legacy)


class YnGenerationTests(MatrixFixture, unittest.TestCase):
    def setUp(self):
        self.setup_services()
        yn = dict(grade=9, type='YN', lesson_code='B1', level='Biết', learning_outcome='Nhận biết dữ liệu.',
                  question='Xét các nhận định về dữ liệu:', max_score=1, review_status='draft',
                  statements=[dict(label=l, text=f'Nhận định {l}', correct=l in 'ac') for l in 'abcd'])
        saved = self.bank.save_question(yn)
        self.bank.review_question(saved['id'], 'submit')
        self.bank.review_question(saved['id'], 'approve', checklist={c['key']: True for c in CHECKLIST})
        self.yn_id = saved['id']
        policy = dict(DEFAULT_POLICY, yn_table={'0': '0', '1': '0', '2': '0.25', '3': '0.5', '4': '1'})
        draft = self.matrices.save_draft(yn_matrix(allowed_kinds=['MC', 'YN'], scoring_policy=policy), 0)
        self.matrix = self.matrices.lock(draft['id'], draft['revision'], confirmation())
        self.revision = self.bank.save_revision(dict(title='Đề cương', grade=9, question_ids=['Q0', self.yn_id]))

    def generate(self):
        return generate_from_matrix(self.bank, self.matrices, dict(
            matrix_id=self.matrix['id'], revision_id=self.revision['id'], title='Đề có Đ/S', campus='Cao Thắng',
            exam_code='101', seed=1, placements=[dict(slot_id='S1', question_id='Q0', reviewed_part_ids=['P1']),
                                                 dict(slot_id='Y1', question_id=self.yn_id,
                                                      reviewed_part_ids=[f'Y{l}' for l in 'abcd'])]))

    def test_yn_slot_generates_and_exam_keeps_policy(self):
        exam = self.generate()
        yn = next(q for q in exam['questions'] if q['type'] == 'YN')
        self.assertEqual(yn['points'], 1.0)
        self.assertEqual(exam['scoring_policy']['yn_table']['1'], '0')
        self.assertEqual(exam['allowed_kinds'], ['MC', 'YN'])

    def test_answer_key_explains_yn_points(self):
        from exports import export_document
        exam = self.generate()
        d = docx.Document(io.BytesIO(export_document(exam, 'docx', answers=True)[0]))
        text = '\n'.join(p.text for p in d.paragraphs)
        self.assertIn('Đúng 1 ý: 0 điểm; 2 ý: 0,25 điểm; 3 ý: 0,5 điểm; 4 ý: 1 điểm', text)


class BlueprintProfileTests(unittest.TestCase):
    def test_grade10_blueprint_accepts_yn_grade8_rejects(self):
        from test_backend import BackendTests
        case = BackendTests('test_total_must_be_ten_points'); case.setUp(); self.addCleanup(case.doCleanups)
        row = dict(case.row, type='YN', count=1, points_per_question=1)
        with self.assertRaises(ServiceError) as ctx:
            case.svc.generate_exam(case.request(blueprint=[row]))
        self.assertIn('Đúng/Sai', ctx.exception.error)
        self.assertIn('THCS', ctx.exception.error)


if __name__ == '__main__':
    unittest.main()


class ExamRoundingPolicyTests(unittest.TestCase):
    def test_tx_exam_rounds_to_integer_and_matrix_policy_cannot_override(self):
        from test_backend import BackendTests
        case = BackendTests('test_total_must_be_ten_points'); case.setUp(); self.addCleanup(case.doCleanups)
        tx = case.svc.generate_exam(case.request())  # exam_type TX
        self.assertEqual(tx['scoring_policy']['rounding'], 'half_up_integer')
        forced = case.svc.generate_exam(case.request(scoring_policy=dict(DEFAULT_POLICY, rounding='half_up_1dp'), seed=11))
        self.assertEqual(forced['scoring_policy']['rounding'], 'half_up_integer')
