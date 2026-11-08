"""Đối soát dùng mức độ thực đo; fixture minh họa, không đọc hồ sơ thật."""
import copy
import unittest
from docx_exam_importer import verify_exam_against_matrix


class MatrixVerificationTruthTests(unittest.TestCase):
    def fixture(self, level='Biết', kind='MC', grade=9, parts=None):
        parts = parts or [dict(id='P1', requirement_id='R1', points=10)]
        matrix = dict(id='M-FAKE', title='Ma trận minh họa', status='locked', grade=grade,
                      requirements=[dict(id='R1', lesson_code='B1', level=level)],
                      slots=[dict(id='S1', number=1, kind=kind, parts=parts)])
        exam = dict(grade=grade, exam_code='102', questions=[dict(id='Q-FAKE', question='Nội dung minh họa?',
                    type=kind, level=level, lesson_code='B1', slot_number=1, points=10)])
        revision = dict(id='REV-FAKE', questions=copy.deepcopy(exam['questions']))
        return matrix, exam, revision

    def verify(self, matrix, exam, revision):
        return verify_exam_against_matrix(exam, matrix, revision)

    def test_same_mc_count_with_wrong_level_fails(self):
        matrix, exam, revision = self.fixture()
        exam['questions'][0]['level'] = 'Hiểu'
        result = self.verify(matrix, exam, revision)
        self.assertFalse(result['passed'])
        measured = {c['level']: c for c in result['level_checks']}
        self.assertEqual(measured['Hiểu']['actual_items'], 1)
        self.assertEqual(measured['Biết']['actual_items'], 0)
        self.assertFalse(any('100%' in note for note in result['notes']))

    def test_matching_measured_levels_passes_including_vdc(self):
        for level in ('Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'):
            with self.subTest(level=level):
                matrix, exam, revision = self.fixture(level)
                result = self.verify(matrix, exam, revision)
                self.assertTrue(result['passed'])
                self.assertTrue(all(c['matched'] for c in result['level_checks']))

    def test_missing_or_unknown_level_cannot_be_assumed_biet(self):
        for level in (None, 'Không rõ'):
            matrix, exam, revision = self.fixture()
            if level is None:
                exam['questions'][0].pop('level')
            else:
                exam['questions'][0]['level'] = level
            self.assertFalse(self.verify(matrix, exam, revision)['passed'])

    def test_grade_ten_es_does_not_invent_three_sub_items(self):
        matrix, exam, revision = self.fixture('Vận dụng', 'ES', 10,
            [dict(id=f'P{i}', requirement_id='R1', points=10/3) for i in range(3)])
        result = self.verify(matrix, exam, revision)
        check = next(c for c in result['type_checks'] if c['type'] == 'ES')
        self.assertEqual(check['actual_items'], 1)
        self.assertFalse(result['passed'])

    def test_explicit_es_sub_items_are_measured(self):
        matrix, exam, revision = self.fixture('Vận dụng cao', 'ES', 10,
            [dict(id='P1', requirement_id='R1', points=4), dict(id='P2', requirement_id='R1', points=6)])
        exam['questions'][0]['sub_items'] = [dict(label='a', level='Vận dụng cao', points=4),
                                             dict(label='b', level='Vận dụng cao', points=6)]
        result = self.verify(matrix, exam, revision)
        self.assertTrue(result['passed'])
        vdc = next(c for c in result['level_checks'] if c['level'] == 'Vận dụng cao')
        self.assertEqual((vdc['actual_items'], vdc['actual_points']), (2, 10))

    def test_unclassified_es_sub_items_fail_without_guessing(self):
        matrix, exam, revision = self.fixture('Vận dụng', 'ES', 10,
            [dict(id='P1', requirement_id='R1', points=4), dict(id='P2', requirement_id='R1', points=6)])
        exam['questions'][0]['sub_items'] = [dict(label='a', text='Ý minh họa a'), dict(label='b', text='Ý minh họa b')]
        result = self.verify(matrix, exam, revision)
        self.assertFalse(result['passed'])
        self.assertFalse(any('100%' in note for note in result['notes']))

    def test_subpoint_errors_cannot_cancel_between_questions(self):
        matrix, exam, revision = self.fixture('Vận dụng', 'ES', 10)
        matrix['slots'] = [dict(id=f'S{i}', number=i, kind='ES',
            parts=[dict(id=f'P{i}', requirement_id='R1', points=5)]) for i in (1, 2)]
        first = exam['questions'][0]
        first['points'] = 5
        first['sub_items'] = [dict(label='a', level='Vận dụng', points=10)]
        second = copy.deepcopy(first); second['id'] = 'Q2'; second['question'] = 'Ý minh họa thứ hai?'
        second['sub_items'][0]['points'] = 0
        exam['questions'].append(second)
        revision['questions'] = copy.deepcopy(exam['questions'])
        result = self.verify(matrix, exam, revision)
        self.assertFalse(result['passed'])
        self.assertTrue(any('tổng điểm các ý' in n for n in result['notes']))

    def test_yn_statement_points_require_explicit_evidence(self):
        matrix, exam, revision = self.fixture('Biết', 'YN', 10,
            [dict(id=f'P{i}', requirement_id='R1', points=.25) for i in range(4)])
        exam['questions'][0]['points'] = 1
        exam['questions'][0]['statements'] = [dict(label=str(i), level='Biết') for i in range(4)]
        self.assertFalse(self.verify(matrix, exam, revision)['passed'])
        for st in exam['questions'][0]['statements']:
            st['points'] = .25
        self.assertTrue(self.verify(matrix, exam, revision)['passed'])

    def test_invalid_parent_or_subitem_points_fail_without_exception(self):
        for value in (0, -1, float('nan'), float('inf'), 'không rõ', True):
            for position in ('parent', 'sub'):
                with self.subTest(value=value, position=position):
                    matrix, exam, revision = self.fixture('Vận dụng', 'ES', 10)
                    exam['questions'][0]['sub_items'] = [dict(label='a', level='Vận dụng', points=10)]
                    if position == 'parent':
                        exam['questions'][0]['points'] = value
                    else:
                        exam['questions'][0]['sub_items'][0]['points'] = value
                    self.assertFalse(self.verify(matrix, exam, revision)['passed'])

if __name__ == '__main__':
    unittest.main()
