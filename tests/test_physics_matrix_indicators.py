import copy
import unittest
from matrix_fixtures import minimal_matrix
from matrices.model import validate_matrix


class PhysicsIndicatorTests(unittest.TestCase):
    def fixture(self, subject='Vật lí'):
        m = minimal_matrix()
        m.update(profile='THPT', grade=10, subject_name=subject)
        m['requirements'][0]['competency'] = 'TDLL' if subject.startswith('Toán') else 'NL_CHUNG'
        ppct = {'_context': {'subject_name':subject, 'allowed_grades':[10], 'school_profile':True,
                            'competencies':[m['requirements'][0]['competency']]},
                'lessons':[{'grade':10, 'subject_name':subject, 'lesson_code':'B1', 'outcomes':['Nhận biết dữ liệu.']}]}
        return m, ppct

    def test_non_tin_thpt_without_catalog_can_lock(self):
        for subject in ('Vật lí', 'Vật lý', 'Toán học'):
            m, ppct = self.fixture(subject)
            before = copy.deepcopy(m)
            report = validate_matrix(m, ppct, True)
            self.assertTrue(report['valid'], report)
            self.assertEqual(m, before)

    def test_explicit_indicator_must_exist_and_match_competency(self):
        m, ppct = self.fixture()
        m['slots'][0]['parts'][0]['indicator'] = 'VL1'
        report = validate_matrix(m, ppct, True)
        error = next(e for e in report['errors'] if e['code']=='indicator')
        self.assertIn('Câu 1', error['message'])
        self.assertIn('VL1', error['message'])
        self.assertIn('S1', error['path'])
        m['indicator_catalog'] = [dict(code='VL1', competency='NLa', text='Sai nhóm')]
        self.assertFalse(validate_matrix(m, ppct, True)['valid'])
        m['indicator_catalog'][0]['competency'] = 'NL_CHUNG'
        self.assertTrue(validate_matrix(m, ppct, True)['valid'])

    def test_real_point_and_outcome_errors_are_not_bypassed(self):
        m, ppct = self.fixture()
        m['slots'][0]['parts'][0]['points'] = 9
        self.assertFalse(validate_matrix(m, ppct, True)['valid'])
        m['slots'][0]['parts'][0]['points'] = 10
        m['requirements'][0]['ppct_outcome_index'] = 99
        self.assertFalse(validate_matrix(m, ppct, True)['valid'])
