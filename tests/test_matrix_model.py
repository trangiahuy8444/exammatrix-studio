import copy
import unittest
from matrix_fixtures import bank_fixture, minimal_matrix
try:
    from matrices import model
except ImportError:
    model = None


class MatrixModelTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(model, 'Matrix model must be implemented')
        self.ppct = bank_fixture()['ppct']

    def test_totals_and_refs_derive_from_same_slots(self):
        m = minimal_matrix()
        r = model.validate_matrix(m, self.ppct, True)
        self.assertTrue(r['valid'], r)
        self.assertEqual(r['totals']['points'], 10)
        self.assertEqual(r['totals']['questions'], 1)
        view = model.matrix_view(m)
        self.assertEqual(view['requirements'][0]['refs'], ['1'])
        self.assertEqual(view['rows'][0]['points'], 10)

    def test_missing_reference_is_reported_without_crash(self):
        m = minimal_matrix(); m['slots'][0]['parts'][0]['requirement_id']='bad'
        r = model.validate_matrix(m, self.ppct, True)
        self.assertIn('unknown_requirement', [e['code'] for e in r['errors']])

    def test_invalid_points_outcome_and_numbers_are_rejected(self):
        for value in [float('nan'),float('inf'),-1,True,'not a number']:
            m = minimal_matrix();m['slots'][0]['parts'][0]['points']=value
            self.assertFalse(model.validate_matrix(m,self.ppct,True)['valid'])
        m=minimal_matrix();m['requirements'][0]['ppct_outcome_index']=99
        self.assertFalse(model.validate_matrix(m,self.ppct,True)['valid'])
        m=minimal_matrix();m['slots'][0]['number']=2
        self.assertFalse(model.validate_matrix(m,self.ppct,True)['valid'])

    def test_yn_counts_one_question_and_four_parts(self):
        m=minimal_matrix();m['profile']='THPT'
        m['indicator_catalog']=[dict(code='AC1',competency='NLa',text='Dữ liệu')]
        m['slots']=[dict(id='Y1',kind='YN',number=1,scoring=dict(mode='sum_parts'),
            parts=[dict(id=f'P{i}',label=label,requirement_id='R1',points=2.5,indicator='AC1') for i,label in enumerate('abcd')])]
        r=model.validate_matrix(m,self.ppct,True)
        self.assertTrue(r['valid'],r);self.assertTrue(r['exam_supported'])  # B3: Đ/S một bài, một mức độ tạo đề tự động được
        self.assertEqual(r['totals']['questions'],1);self.assertEqual(r['totals']['items'],4)
        m['slots'][0]['parts'][3]['label']='c'
        self.assertFalse(model.validate_matrix(m,self.ppct,True)['valid'])

    def test_essay_parts_not_rubric_and_unused_choice_indicators_allowed(self):
        m=minimal_matrix();m['requirements'].append(dict(m['requirements'][0],id='R2',choice_group='choose'))
        m['slots'][0]['kind']='ES';m['slots'][0]['parts']=[dict(id='E1',label='a',requirement_id='R1',points=4,indicator=''),dict(id='E2',label='b',requirement_id='R1',points=3,indicator=''),dict(id='E3',label='c',requirement_id='R1',points=3,indicator='')]
        r=model.validate_matrix(m,self.ppct,True)
        self.assertTrue(r['valid'],r);self.assertEqual(r['totals']['items'],3)

    def test_unknown_indicator_and_source_disagreement_block_lock(self):
        m=minimal_matrix();m['profile']='THPT';m['slots'][0]['parts'][0]['indicator']='missing'
        self.assertFalse(model.validate_matrix(m,self.ppct,True)['valid'])
        m=minimal_matrix();m['reconciliation']['issues']=[dict(code='source_essay_disagreement',message='9 khác 12')]
        self.assertFalse(model.validate_matrix(m,self.ppct,True)['valid'])

    def test_digest_ignores_audit_but_not_educational_content(self):
        m=minimal_matrix();a=model.matrix_digest(m);m['audit']=[dict(action='review')];m['status']='locked';m['revision']=9
        self.assertEqual(a,model.matrix_digest(m))
        m['requirements'][0]['text']='Nội dung khác'
        self.assertNotEqual(a,model.matrix_digest(m))

    def test_bad_nested_payload_has_useful_validation(self):
        for field,value in [('slots',None),('requirements',[None]),('lessons','wrong')]:
            m=minimal_matrix();m[field]=value
            self.assertFalse(model.validate_matrix(m,self.ppct,True)['valid'])

    def test_received_assignment_cannot_move_items_to_another_source_row(self):
        m=minimal_matrix();m['mode']='received';m['requirements'][0]['source_index']=0
        m['slots'][0]['parts'][0].update(source_index=1,source_level='Biết')
        self.assertFalse(model.validate_matrix(m,self.ppct,True)['valid'])

    def test_non_scalar_grade_and_labels_are_validation_failures(self):
        m=minimal_matrix();m['grade']=[]
        self.assertFalse(model.validate_matrix(m,self.ppct,True)['valid'])
        m=minimal_matrix();m['slots'][0]['parts'][0]['label']='<bad>'
        self.assertFalse(model.validate_matrix(m,self.ppct,True)['valid'])
