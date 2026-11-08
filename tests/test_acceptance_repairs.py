"""Regressions exposed by the real Physics 10 acceptance run."""
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from docx import Document
from bank_service import BankService
from latex_generator import generate_matrix_latex, generate_exam_latex, generate_review_latex, tex_escape
from exports import export_document, export_answer_grid_docx


def canonical_matrix():
    return dict(id='MATRIX-TEST', title='Ma trận Vật lí', subject_name='Vật lí', school_profile=False,
        grade=10,profile='GENERAL',exam_type='GK1',duration=45,school_year='2026-2027',
        lessons=[dict(lesson_code='B1',title='Vận tốc',topic='Động học')],
        requirements=[dict(id='R1',lesson_code='B1',text='Tính vận tốc trung bình.',level='Hiểu',competency='NL_CHUNG')],
        slots=[dict(id='S1',kind='MC',number=1,parts=[dict(id='P1',label='',requirement_id='R1',points=10)])])


class ExportRepairTests(unittest.TestCase):
    def test_matrix_tex_uses_canonical_requirements_and_slots(self):
        tex=generate_matrix_latex(canonical_matrix())
        self.assertIn('Tính vận tốc trung bình.',tex)
        self.assertIn('Câu 1',tex)
        self.assertIn('10',tex)
        self.assertIn('Tổng số điểm',tex)
        self.assertIn('longtable',tex)

    def test_scientific_unicode_subscripts_become_math(self):
        self.assertIn('_{0}',tex_escape('v₀'))
        self.assertNotIn('₀',tex_escape('v₀'))
        self.assertEqual(tex_escape('$v_0^2$'),'$v_0^2$')

    def test_matrix_tex_keeps_requirements_without_allocated_questions(self):
        matrix=canonical_matrix()
        matrix['requirements'].append(dict(id='R2',lesson_code='B1',text='YCCĐ chưa phân bổ câu hỏi.',level='Biết',competency='NL_CHUNG'))
        self.assertIn('YCCĐ chưa phân bổ câu hỏi.',generate_matrix_latex(matrix))

    def test_review_and_rubric_are_pageable_and_not_school_branded(self):
        record=dict(title='Ôn tập Vật lí',subject_name='Vật lí',grade=10,school_profile=False,
            questions=[dict(type='ES',slot_number=1,question='Tính vận tốc.',points=1,
                lesson_code='B1',lesson_name='Vận tốc',topic_source='Động học',learning_outcome='Tính vận tốc trung bình.',
                rubric=[dict(criterion='v₀ = 0',points=.25)]*4,max_score=1)])
        for tex in (generate_exam_latex(record,answers=True),generate_review_latex(record)):
            self.assertIn('longtable',tex)
            self.assertIn('endhead',tex)
            self.assertNotIn('Quốc Tế Á Châu',tex)
            self.assertNotIn('₀',tex)

    def test_mc_word_does_not_keep_entire_exam_together(self):
        record=dict(title='Đề thử',grade=10,subject_name='Vật lí',school_profile=False,
            questions=[dict(type='MC',slot_number=i+1,question=f'Câu vật lí {i}?',
                options=['Một','Hai','Ba','Bốn'],correct=0,points=.25) for i in range(28)])
        raw,_,_=export_document(record,fmt='docx')
        doc=Document(io.BytesIO(raw))
        choices=[p for p in doc.paragraphs if 'A.' in p.text and 'D.' in p.text]
        self.assertEqual(len(choices),28)
        self.assertTrue(all(not p.paragraph_format.keep_with_next for p in choices))

    def test_answer_grid_fits_actual_page_and_respects_school_profile(self):
        raw=export_answer_grid_docx({'codes':['101','102','103','104'],'mc':{1:dict.fromkeys(['101','102','103','104'],'A')}},
            meta={'subject_name':'Vật lí','grade':10,'school_profile':False})
        doc=Document(io.BytesIO(raw)); section=doc.sections[0]
        for table in doc.tables:
            self.assertLessEqual(sum(col.width for col in table.columns), section.page_width-section.left_margin-section.right_margin+1000)
        self.assertNotIn('QUỐC TẾ Á CHÂU','\n'.join(p.text for p in doc.paragraphs))


class PermutationMatrixRepairTests(unittest.TestCase):
    def test_variant_snapshot_uses_actual_question_numbers_without_changing_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);bank=root/'bank.json'
            bank.write_text(json.dumps({'ppct':{'lessons':[]},'questions':[]}))
            svc=BankService(bank,root)
            matrix=canonical_matrix()
            matrix['slots']=[dict(id=f'S{i}',kind='MC',number=i,parts=[dict(id=f'P{i}',label='',requirement_id='R1',points=1)]) for i in range(1,11)]
            exam=dict(id='EXAM-SOURCE',title='Đề thử',grade=10,exam_type='GK1',subject_name='Vật lí',
                matrix_id=matrix['id'],matrix_snapshot=matrix,questions=[dict(id=f'Q{i}',type='MC',slot_id=f'S{i}',
                    slot_number=i,reviewed_part_ids=[f'P{i}'],question=f'Câu {i}',options=['A','B','C','D'],correct=0,points=1)
                    for i in range(1,11)])
            svc._atomic_save(root/'exams.json',[exam]); original=copy.deepcopy(exam)
            variants=svc.create_permuted_exams(exam['id'],codes=['101','102'],seed='matrix-repair')['generated_exams']
            for variant in variants:
                numbers={s['id']:s['number'] for s in variant['matrix_snapshot']['slots']}
                self.assertEqual([(q['slot_number'],numbers[q['slot_id']]) for q in variant['questions']],[(i,i) for i in range(1,11)])
            self.assertEqual(svc.get_record('exams',exam['id']),original)
            # Existing persisted variants may still carry the old source numbering.
            legacy=copy.deepcopy(variants[0]);legacy['matrix_snapshot']=copy.deepcopy(matrix)
            numbered=svc._exam_matrix(legacy,None)
            numbers={s['id']:s['number'] for s in numbered['slots']}
            self.assertTrue(all(numbers[q['slot_id']]==q['slot_number'] for q in legacy['questions']))
            self.assertEqual(legacy['matrix_snapshot'],matrix)
            for q in legacy['questions']: q.pop('slot_id')
            numbered=svc._exam_matrix(legacy,None)
            self.assertEqual({s['id']:s['number'] for s in numbered['slots']},numbers)
            raw,_,_=svc.export_exam_bundle(exam['id'],fmt='tex')
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                self.assertTrue(any('Ma_tran_va_Bang_dac_ta_Ma_101.tex' in n for n in z.namelist()))
                self.assertTrue(any('Ma_tran_va_Bang_dac_ta_Ma_102.tex' in n for n in z.namelist()))

    def test_shuffled_statement_parts_keep_their_requirements(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);bank=root/'bank.json';bank.write_text(json.dumps({'ppct':{'lessons':[]},'questions':[]}))
            svc=BankService(bank,root)
            m=canonical_matrix()
            m['requirements']=[dict(id=f'R{i}',lesson_code='B1',text=f'Ý nguồn {i}',level='Biết',competency='NL_CHUNG') for i in range(4)]
            m['slots']=[dict(id='S1',kind='YN',number=1,parts=[dict(id=f'P{i}',label=chr(97+i),requirement_id=f'R{i}',points=.25) for i in range(4)])]
            q=dict(id='Q',type='YN',slot_id='S1',slot_number=1,points=1,question='Nhận định',
                statements=[dict(label=chr(97+i),text=f'Ý nguồn {i}',correct=i%2==0) for i in range(4)])
            svc._atomic_save(root/'exams.json',[dict(id='EXAM',grade=10,exam_type='TX',matrix_snapshot=m,questions=[q])])
            v=svc.create_permuted_exams('EXAM',codes=['101'],shuffle_statements=True,seed='yn-parts')['generated_exams'][0]
            derived=svc._exam_matrix(v,None)
            reqs={r['id']:r for r in derived['requirements']}
            self.assertEqual([s['text'] for s in v['questions'][0]['statements']],
                [reqs[p['requirement_id']]['text'] for p in derived['slots'][0]['parts']])
            self.assertEqual(svc._exam_matrix(v,None),derived)
