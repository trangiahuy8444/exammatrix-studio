"""Hồi quy đề GK1 hỗn hợp; chỉ dùng dữ liệu minh họa cách ly."""
import copy
import unittest

from bank_service import ServiceError
from docx_exam_importer import verify_exam_against_matrix
from domain.review import CHECKLIST, version_hash
from matrices.generation import generate_from_matrix
from matrix_fixtures import MatrixFixture, confirmation, minimal_matrix


class MixedVerificationTests(MatrixFixture, unittest.TestCase):
    def setUp(self):
        self.setup_services()
        self.ids = {'MC': 'Q0'}
        for kind, fields in [('YN', dict(statements=[dict(label=l, text='Nhận định ' + l, correct=l in 'ac') for l in 'abcd'])),
                             ('SHORT', dict(short_answer='7')),
                             ('ES', dict(rubric=[dict(criterion='Lập luận minh họa ' + str(i), points=.25) for i in range(4)]))]:
            q = self.bank.save_question(dict(grade=9, type=kind, lesson_code='B1', level='Biết',
                learning_outcome='Nhận biết dữ liệu.', question='Câu minh họa ' + kind,
                max_score=1, review_status='draft', equivalent_answer_policy='Chấp nhận lập luận tương đương.', **fields))
            self.bank.review_question(q['id'], 'submit')
            self.bank.review_question(q['id'], 'approve', checklist={c['key']: True for c in CHECKLIST})
            self.ids[kind] = q['id']
        m = minimal_matrix()
        m['allowed_kinds'] = ['MC', 'YN', 'SHORT', 'ES']
        m['slots'] = [dict(id=kind, kind=kind, number=1, scoring=dict(mode='sum_parts'),
            parts=[dict(id=kind + l, label=l if kind == 'YN' else '', requirement_id='R1', points=p, indicator='')
                   for l, p in (zip('abcd', [.2, .4, .6, .8]) if kind == 'YN' else [('', points)])])
            for kind, points in [('MC', 3), ('YN', 2), ('SHORT', 2), ('ES', 3)]]
        draft = self.matrices.save_draft(m, 0)
        self.matrix = self.matrices.lock(draft['id'], draft['revision'], confirmation())
        self.revision = self.bank.save_revision(dict(title='Ôn tập minh họa', grade=9, question_ids=list(self.ids.values())))
        self.payload = dict(matrix_id=self.matrix['id'], revision_id=self.revision['id'], title='GK1 minh họa',
            campus='Cao Thắng', exam_code='101', placements=[dict(slot_id=s['id'], question_id=self.ids[s['kind']],
            reviewed_part_ids=[p['id'] for p in s['parts']]) for s in self.matrix['slots']])

    def generate(self):
        return generate_from_matrix(self.bank, self.matrices, self.payload)

    def verify(self, exam, matrix=None):
        return verify_exam_against_matrix(exam, matrix or self.matrix, self.revision)

    def test_reviewed_mixed_exam_measures_all_seven_items_and_ten_points(self):
        before = copy.deepcopy(self.bank._load_bank())
        exam = self.generate()
        report = self.verify(exam)
        self.assertTrue(report['passed'], report)
        self.assertEqual((report['expected_points'], report['total_points']), (10, 10))
        short = next(c for c in report['type_checks'] if c['type'] == 'SHORT')
        self.assertEqual((short['expected_items'], short['actual_items'], short['actual_points']), (1, 1, 2))
        level = next(c for c in report['level_checks'] if c['level'] == 'Biết')
        self.assertEqual((level['actual_items'], level['actual_points']), (7, 10))
        self.assertEqual(self.bank._load_bank(), before)

    def test_short_wrong_level_missing_and_wrong_points_fail_truthfully(self):
        original = self.generate()
        for change in ('level', 'missing', 'points'):
            exam = copy.deepcopy(original)
            short = next(q for q in exam['questions'] if q['type'] == 'SHORT')
            if change == 'missing':
                exam['questions'].remove(short)
            else:
                short[change] = 'Hiểu' if change == 'level' else 1
            self.assertFalse(self.verify(exam)['passed'], change)
        changed = copy.deepcopy(original)
        next(q for q in changed['questions'] if q['type'] == 'SHORT')['level'] = 'Hiểu'
        measured = {c['level']: c for c in self.verify(changed)['level_checks']}
        self.assertEqual(measured['Hiểu']['actual_items'], 1)

    def test_yn_binding_and_unequal_points_follow_statements_through_permutation(self):
        exam = self.generate()
        yn = next(q for q in exam['questions'] if q['type'] == 'YN')
        self.assertEqual(yn.get('statement_part_ids'), ['YNa', 'YNb', 'YNc', 'YNd'])
        expected = {'Nhận định a': ('YNa', .2), 'Nhận định b': ('YNb', .4),
                    'Nhận định c': ('YNc', .6), 'Nhận định d': ('YNd', .8)}
        variants = self.bank.create_permuted_exams(exam['id'], codes=['101', '102', '103', '104'],
            shuffle_statements=True, seed='mixed')['generated_exams']
        for variant in variants:
            q = next(q for q in variant['questions'] if q['type'] == 'YN')
            self.assertEqual(version_hash(q), version_hash(yn))
            self.assertEqual({st['text']: (pid, st['points']) for st, pid in zip(q['statements'], q['statement_part_ids'])}, expected)
            self.assertTrue(self.verify(variant, variant['matrix_snapshot'])['passed'])

    def test_bad_or_partial_review_mapping_saves_nothing(self):
        for ids in ([], ['YNa'], ['YNa', 'YNb', 'YNc', 'YNd', 'YNd'], ['YNa', 'YNb', 'YNc', 'unknown']):
            payload = copy.deepcopy(self.payload)
            next(p for p in payload['placements'] if p['slot_id'] == 'YN')['reviewed_part_ids'] = ids
            with self.assertRaises(ServiceError):
                generate_from_matrix(self.bank, self.matrices, payload)
            self.assertEqual(self.bank._records('exams'), [])

    def test_statement_points_cannot_be_swapped_while_preserving_total(self):
        exam = self.generate()
        yn = next(q for q in exam['questions'] if q['type'] == 'YN')
        self.assertTrue(self.verify(exam)['passed'])
        yn['statements'][0]['points'], yn['statements'][1]['points'] = .4, .2
        self.assertFalse(self.verify(exam)['passed'])

    def test_unreviewed_auto_yn_does_not_invent_statement_classification(self):
        exam = self.bank.generate_exam(dict(grade=9, exam_type='GK1', title='Tự động minh họa', _matrix=self.matrix))
        yn = next(q for q in exam['questions'] if q['type'] == 'YN')
        self.assertNotIn('reviewed_part_ids', yn)
        self.assertTrue(all('points' not in st and 'level' not in st for st in yn['statements']))
        self.assertFalse(self.verify(exam)['passed'])

    def test_auto_matrix_slot_binding_survives_permutations_without_review_claim(self):
        exam = self.bank.generate_exam(dict(grade=9, exam_type='GK1', title='Tự động minh họa', _matrix=self.matrix))
        self.assertEqual({q['type']: q.get('slot_id') for q in exam['questions']},
                         {'MC': 'MC', 'YN': 'YN', 'SHORT': 'SHORT', 'ES': 'ES'})
        self.assertTrue(all(q.get('slot_number') == 1 and 'reviewed_part_ids' not in q for q in exam['questions']))
        result = self.bank.create_permuted_exams(exam['id'], codes=['101', '102'], shuffle_statements=True)
        self.assertEqual(result['count'], 2)

    def test_missing_or_mismatched_matrix_slot_fails_without_partial_write(self):
        for change in ('missing', 'mismatch'):
            matrix = copy.deepcopy(self.matrix)
            if change == 'missing':
                matrix['slots'][0].pop('id')
            else:
                matrix['slots'][1]['id'] = matrix['slots'][0]['id']
            with self.assertRaises(ServiceError):
                self.bank.generate_exam(dict(grade=9, exam_type='GK1', title='Ma trận lỗi minh họa', _matrix=matrix))
            self.assertEqual(self.bank._records('exams'), [])

    def test_invalid_stored_slot_binding_cannot_be_repaired_by_question_position(self):
        exam = self.generate()
        records = self.bank._records('exams')
        records[0]['questions'][0]['slot_id'] = 'không tồn tại'
        self.bank._atomic_save(self.bank.data_dir / 'exams.json', records)
        before = copy.deepcopy(self.bank._records('exams'))
        with self.assertRaises(ServiceError):
            self.bank.create_permuted_exams(exam['id'], codes=['101', '102'])
        self.assertEqual(self.bank._records('exams'), before)

    def test_same_cell_slots_keep_their_unequal_points_after_shuffle(self):
        matrix = copy.deepcopy(self.matrix)
        matrix['slots'] = [dict(id='M1', kind='MC', number=1, scoring=dict(mode='sum_parts'),
            parts=[dict(id='MP1', label='', requirement_id='R1', points=4)]),
            dict(id='M2', kind='MC', number=2, scoring=dict(mode='sum_parts'),
            parts=[dict(id='MP2', label='', requirement_id='R1', points=6)])]
        exam = self.bank.generate_exam(dict(grade=9, exam_type='GK1', title='Hai vị trí minh họa', _matrix=matrix))
        self.assertEqual({q['slot_id']: q['points'] for q in exam['questions']}, {'M1': 4, 'M2': 6})
        result = self.bank.create_permuted_exams(exam['id'], codes=['101', '102', '103', '104'], seed='different-points')
        for variant in result['generated_exams']:
            source = {s['id']: (s['number'], s['parts'][0]['points']) for s in variant['matrix_snapshot']['slots']}
            for q in variant['questions']:
                self.assertEqual(source[q['slot_id']], (q['slot_number'], q['points']))

    def test_known_but_wrong_source_slot_is_rejected_without_saving_variants(self):
        matrix = copy.deepcopy(self.matrix)
        matrix['slots'] = [dict(id='M1', kind='MC', number=1, scoring=dict(mode='sum_parts'),
            parts=[dict(id='MP1', label='', requirement_id='R1', points=4)]),
            dict(id='M2', kind='MC', number=2, scoring=dict(mode='sum_parts'),
            parts=[dict(id='MP2', label='', requirement_id='R1', points=6)])]
        exam = self.bank.generate_exam(dict(grade=9, exam_type='GK1', title='Liên kết sai minh họa', _matrix=matrix))
        records = self.bank._records('exams')
        first, second = records[0]['questions']
        first['slot_id'], second['slot_id'] = second['slot_id'], first['slot_id']
        self.bank._atomic_save(self.bank.data_dir / 'exams.json', records)
        before = copy.deepcopy(self.bank._records('exams'))
        with self.assertRaises(ServiceError):
            self.bank.create_permuted_exams(exam['id'], codes=['101', '102'])
        self.assertEqual(self.bank._records('exams'), before)

    def test_reviewed_statement_outcome_missing_or_changed_fails_service_verification(self):
        exam = self.generate()
        original = self.bank._records('exams')
        for outcome in (None, 'SAI NGUỒN YCCĐ'):
            with self.subTest(outcome=outcome):
                records = copy.deepcopy(original)
                yn = next(q for q in records[0]['questions'] if q['type'] == 'YN')
                if outcome is None:
                    yn['statements'][0].pop('learning_outcome')
                else:
                    yn['statements'][0]['learning_outcome'] = outcome
                self.bank._atomic_save(self.bank.data_dir / 'exams.json', records)
                checked = self.bank.verify_exam(exam['id'], self.matrices)
                self.assertFalse(checked['verification']['passed'], checked['verification'])

    def test_reviewed_outcomes_use_frozen_ppct_not_freeform_requirement_text(self):
        matrix = minimal_matrix()
        matrix['requirements'][0]['text'] = 'Chỉ báo riêng: lựa chọn dữ liệu đúng theo tình huống.'
        matrix['allowed_kinds'] = ['MC', 'YN', 'SHORT', 'ES']
        matrix['slots'] = copy.deepcopy(self.matrix['slots'])
        draft = self.matrices.save_draft(matrix, 0)
        locked = self.matrices.lock(draft['id'], draft['revision'], confirmation())
        before = copy.deepcopy(locked)
        payload = dict(self.payload, matrix_id=locked['id'])
        exam = generate_from_matrix(self.bank, self.matrices, payload)
        self.assertTrue(self.verify(exam, locked)['passed'])
        self.assertEqual(self.matrices.get(locked['id']), before)
        self.bank.lessons.clear()
        variants = self.bank.create_permuted_exams(exam['id'], codes=['101', '102'],
            shuffle_statements=True)['generated_exams']
        for variant in variants:
            self.assertTrue(self.verify(variant, variant['matrix_snapshot'])['passed'])
            self.assertTrue(all(st['learning_outcome'] == 'Nhận biết dữ liệu.'
                for q in variant['questions'] if q['type'] == 'YN' for st in q['statements']))

    def test_missing_frozen_outcome_evidence_cannot_certify_reviewed_statements(self):
        exam = self.generate()
        exam.pop('matrix_requirement_outcomes', None)
        self.assertFalse(self.verify(exam)['passed'])

    def test_variant_classification_must_match_frozen_parent_even_if_matrix_allows_it(self):
        exam = self.generate()
        variant = self.bank.create_permuted_exams(exam['id'], codes=['101'])['generated_exams'][0]
        records = self.bank._records('exams')
        next(q for q in records[0]['questions'] if q['type'] == 'MC')['level'] = 'Hiểu'
        self.bank._atomic_save(self.bank.data_dir / 'exams.json', records)
        with self.assertRaises(ServiceError):
            self.bank._exam_matrix(variant, None)

    def test_tampered_parent_outcome_cannot_override_frozen_requirement_evidence(self):
        exam = self.generate()
        records = self.bank._records('exams')
        next(q for q in records[0]['questions'] if q['type'] == 'MC')['learning_outcome'] = 'Nguồn đã bị đổi'
        self.bank._atomic_save(self.bank.data_dir / 'exams.json', records)
        before = copy.deepcopy(records)
        with self.assertRaises(ServiceError):
            self.bank.create_permuted_exams(exam['id'], codes=['101', '102'])
        self.assertEqual(self.bank._records('exams'), before)

    def test_equal_point_same_cell_child_cannot_switch_frozen_parent_slots(self):
        matrix = copy.deepcopy(self.matrix)
        matrix['slots'] = [dict(id='M' + str(i), kind='MC', number=i, scoring=dict(mode='sum_parts'),
            parts=[dict(id='MP' + str(i), label='', requirement_id='R1', points=5)]) for i in (1, 2)]
        exam = self.bank.generate_exam(dict(grade=9, exam_type='GK1', title='Nguồn cùng điểm', _matrix=matrix))
        variant = self.bank.create_permuted_exams(exam['id'], codes=['101'])['generated_exams'][0]
        first, second = variant['questions']
        first['slot_id'], second['slot_id'] = second['slot_id'], first['slot_id']
        with self.assertRaises(ServiceError):
            self.bank._exam_matrix(variant, None)
