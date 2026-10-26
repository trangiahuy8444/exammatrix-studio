import copy
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
try:
    from bank_service import BankService, ServiceError
except ImportError:
    BankService = None
    ServiceError = Exception


def fixture():
    outcomes = ['Nhận biết dữ liệu.', 'Xử lí dữ liệu.']
    lessons = [dict(grade=8, lesson_code='B1', lesson_name_source='Bài 1', topic_source='Chủ đề 1', outcomes=outcomes,
                    occurrences=[dict(periods_raw='1', week_raw='1')]),
               dict(grade=8, lesson_code='B16', lesson_name_source='Bài 16', topic_source='Chủ đề 6', outcomes=outcomes,
                    occurrences=[dict(periods_raw='17', week_raw='17')])]
    questions = []
    for i in range(16):
        questions.append(dict(id=f'Q{i}', grade=8, type='MC', lesson_code='B1', lesson_name='Bài 1',
            topic_source='Chủ đề 1', level='Biết', learning_outcome=outcomes[0], question=f'Câu độc lập {i}?',
            options=[f'Phương án {j}' for j in range(4)], correct=i%4,
            option_explanations=[f'Giải thích riêng {j}' for j in range(4)], max_score=1,
            review_status='approved', origin='expansion', semester=1, source_file='source.docx',
            source_rows=[], response_mode='Trắc nghiệm'))
    return dict(schema_version='1.0.0', metadata={}, ppct=dict(sources=[], lessons=lessons), questions=questions)


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(BankService, 'Backend service has not been implemented')
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.bank = self.root/'bank.json'
        self.bank.write_text(json.dumps(fixture(), ensure_ascii=False))
        self.templates = self.root/'templates.json'
        self.row = dict(lesson_code='B1',type='MC',level='Biết',count=10,points_per_question=1)
        self.templates.write_text(json.dumps(dict(templates=[dict(id='LOCK8',grade=8,exam_type='GK1',locked=True,
            rows=[self.row],unsupported=False,source_notes='Nguồn khóa'),dict(id='LOCK10',grade=10,exam_type='GK1',locked=True,
            rows=[],unsupported=True,source_notes='Mâu thuẫn ma trận',unsupported_sections=[dict(type='TF',reason='Chưa hỗ trợ Đúng/Sai')])]),ensure_ascii=False))
        self.svc = BankService(self.bank, self.root/'data', self.templates)

    def revision(self, ids=None):
        return self.svc.save_revision(dict(title='Đề cương kiểm chứng',grade=8,question_ids=ids or [f'Q{i}' for i in range(16)]))

    def request(self, revision=None, **kw):
        req=dict(title='Đề thử',grade=8,exam_type='TX',duration=45,blueprint=[self.row],revision_id=(revision or self.revision())['id'],seed=10)
        req.update(kw);return req

    def test_insufficient_quota_reports_cell_and_never_saves_exam(self):
        req=self.request(blueprint=[dict(self.row,count=20,points_per_question=.5)])
        with self.assertRaises(ServiceError) as ctx:self.svc.generate_exam(req)
        self.assertEqual(ctx.exception.status,400);self.assertIn('B1',str(ctx.exception.details));self.assertIn('4',str(ctx.exception.details))
        self.assertEqual(self.svc.state()['exams'],[])

    def test_total_must_be_ten_points(self):
        with self.assertRaises(ServiceError):self.svc.generate_exam(self.request(blueprint=[dict(self.row,points_per_question=.25)]))
        self.assertFalse((self.root/'data/exams.json').exists())

    def test_duplicate_blueprint_cells_do_not_repeat_questions(self):
        req=self.request(blueprint=[dict(self.row,count=5),dict(self.row,count=5)])
        e=self.svc.generate_exam(req)
        self.assertEqual(len(e['questions']),10);self.assertEqual(len({q['id'] for q in e['questions']}),10)
        self.assertEqual(e['total_points'],10)
        reloaded=BankService(self.bank,self.root/'data',self.templates)
        self.assertEqual(reloaded.state()['exams'][0]['id'],e['id'])

    def test_minimum_ninety_percent_is_enforced_and_selection_prefers_revision(self):
        rev=self.revision([f'Q{i}' for i in range(9)])
        e=self.svc.generate_exam(self.request(revision=rev))
        self.assertEqual(e['revision_match_count'],9);self.assertEqual(e['revision_required_count'],9)
        with self.assertRaises(ServiceError):self.svc.generate_exam(self.request(revision=self.revision([f'Q{i}' for i in range(8)])))

    def test_changed_content_same_id_does_not_count_as_revision_match(self):
        rev=self.revision([f'Q{i}' for i in range(9)])
        q=copy.deepcopy(self.svc.state()['bank']['questions'][0]);q['question']='Nội dung đã đổi sau phát đề cương?'
        self.svc.save_question(q)
        with self.assertRaises(ServiceError):self.svc.generate_exam(self.request(revision=rev))
        snapshot=self.svc.state()['revisions'][0]['questions'][0]
        self.assertEqual(snapshot['question'],'Câu độc lập 0?')

    def test_status_change_does_not_falsely_invalidate_snapshot_content(self):
        rev=self.revision([f'Q{i}' for i in range(9)])
        q=copy.deepcopy(self.svc.state()['bank']['questions'][0]);q['review_status']='approved'
        self.svc.save_question(q)
        self.assertEqual(self.svc.generate_exam(self.request(revision=rev))['revision_match_count'],9)

    def test_gk1_grade8_requires_locked_template(self):
        with self.assertRaises(ServiceError):self.svc.generate_exam(self.request(exam_type='GK1'))
        with self.assertRaises(ServiceError):self.svc.generate_exam(self.request(exam_type='GK1',template_id='LOCK8',blueprint=[dict(self.row,count=5,points_per_question=2)]))
        e=self.svc.generate_exam(self.request(exam_type='GK1',template_id='LOCK8',blueprint=[]))
        self.assertEqual(e['source_notes'],'Nguồn khóa')

    def test_grade10_unsupported_template_explains_tf_and_never_converts(self):
        with self.assertRaises(ServiceError) as ctx:self.svc.generate_exam(self.request(grade=10,exam_type='GK1',template_id='LOCK10'))
        self.assertIn('Đúng/Sai',str(ctx.exception.details));self.assertEqual(self.svc.state()['exams'],[])

    def test_custom_tf_row_is_explicitly_unsupported(self):
        with self.assertRaises(ServiceError) as ctx:self.svc.generate_exam(self.request(blueprint=[dict(self.row,type='TF')]))
        self.assertIn('TF',str(ctx.exception))

    def test_lesson_after_exam_is_excluded_even_if_questions_exist(self):
        bank=fixture()
        for lesson in bank['ppct']['lessons']:lesson['grade']=9
        for q in bank['questions']:q['grade']=9
        bank['questions'][0]['lesson_code']='B16'
        self.bank.write_text(json.dumps(bank,ensure_ascii=False))
        svc=BankService(self.bank,self.root/'future-data',self.templates)
        rev=svc.save_revision(dict(title='Đề cương',grade=9,question_ids=['Q0']))
        req=dict(title='Cuối HK1',grade=9,exam_type='CK1',revision_id=rev['id'],
                 blueprint=[dict(self.row,lesson_code='B16',count=1,points_per_question=10)])
        with self.assertRaises(ServiceError) as ctx:svc.generate_exam(req)
        self.assertIn('sau mốc',str(ctx.exception.details))

    def test_every_periodic_grade8_and10_exam_requires_source_locked_template(self):
        for grade in (8,10):
            for period in ('CK1','GK2','CK2'):
                with self.subTest(grade=grade,period=period):
                    with self.assertRaises(ServiceError) as ctx:
                        self.svc.generate_exam(self.request(grade=grade,exam_type=period))
                    self.assertIn('ma trận gốc',str(ctx.exception))
        data=json.loads(self.templates.read_text());data['templates'].append(dict(id='UNLOCKED',grade=8,exam_type='CK1',locked=False,rows=[self.row],unsupported=False))
        self.templates.write_text(json.dumps(data))
        with self.assertRaises(ServiceError):self.svc.generate_exam(self.request(exam_type='CK1',template_id='UNLOCKED'))

    def test_save_archive_atomic_backups_keep_previous_bank(self):
        original=self.bank.read_bytes();q=copy.deepcopy(self.svc.state()['bank']['questions'][0]);q['question']='Câu được chỉnh sửa?'
        self.svc.save_question(q)
        backups=list((self.root/'data/backups').glob('*.json'))
        self.assertTrue(backups);self.assertTrue(any(p.read_bytes()==original for p in backups))
        self.svc.archive_question('Q0')
        data=json.loads(self.bank.read_text());self.assertEqual(data['questions'][0]['review_status'],'archived')
        self.assertFalse(list(self.bank.parent.glob('*.tmp')))
        with self.assertRaises(ServiceError):self.revision(['Q0'])

    def test_import_cannot_replace_ppct_or_accept_invalid_question(self):
        data=self.svc.state()['bank'];before=self.bank.read_bytes();data['ppct']['lessons'][0]['outcomes'][0]='Nguồn bị thay'
        with self.assertRaises(ServiceError):self.svc.import_bank(data)
        self.assertEqual(self.bank.read_bytes(),before)
        data=self.svc.state()['bank'];data['questions'][0]['correct']=4
        with self.assertRaises(ServiceError):self.svc.import_bank(data)
        self.assertEqual(self.bank.read_bytes(),before)

    def test_duplicate_options_invalid_outcome_and_nonfinite_scores_rejected(self):
        q=copy.deepcopy(self.svc.state()['bank']['questions'][0]);q['options'][1]=q['options'][0]
        with self.assertRaises(ServiceError):self.svc.save_question(q)
        q=copy.deepcopy(self.svc.state()['bank']['questions'][0]);q['learning_outcome']='Ngoài nguồn'
        with self.assertRaises(ServiceError):self.svc.save_question(q)
        with self.assertRaises(ServiceError):self.svc.generate_exam(self.request(blueprint=[dict(self.row,points_per_question=float('nan'))]))

    def test_student_exports_have_no_answers_even_in_hidden_metadata(self):
        from exports import export_document
        e=self.svc.generate_exam(self.request())
        for fmt in ['json','html','docx']:
            raw,_,_=export_document(e,fmt,False)
            if fmt=='docx':
                with zipfile.ZipFile(io.BytesIO(raw)) as z:content=' '.join(z.read(n).decode('utf-8','ignore') for n in z.namelist())
            else:content=raw.decode()
            for secret in ['Giải thích riêng','option_explanations','content_hash','Q0','Đáp án:']:
                self.assertNotIn(secret,content)
        gv,_,_=export_document(e,'docx',True)
        with zipfile.ZipFile(io.BytesIO(gv)) as z:text=z.read('word/document.xml').decode()
        self.assertIn('Đáp án:',text);self.assertIn('Giải thích riêng',text)

    def test_revision_docx_uses_saved_snapshot_not_later_edit(self):
        from exports import export_document
        rev=self.revision(['Q0']);q=copy.deepcopy(self.svc.state()['bank']['questions'][0]);q['question']='Nội dung mới cần giữ ngoài đề cương cũ'
        self.svc.save_question(q)
        raw,_,_=export_document(rev,'docx',False,revision=True)
        with zipfile.ZipFile(io.BytesIO(raw)) as z:text=z.read('word/document.xml').decode()
        self.assertIn('Câu độc lập 0?',text);self.assertNotIn('Nội dung mới',text)

    def test_failed_atomic_replace_preserves_bank_and_cleans_temporary_file(self):
        from unittest.mock import patch
        before=self.bank.read_bytes()
        q=copy.deepcopy(self.svc.state()['bank']['questions'][0]);q['question']='Bản ghi chưa hoàn tất?'
        with patch('bank_service.os.replace',side_effect=OSError('simulated disk failure')):
            with self.assertRaises(OSError):self.svc.save_question(q)
        self.assertEqual(self.bank.read_bytes(),before)
        self.assertFalse(list(self.bank.parent.glob('.*.tmp')))
        self.assertTrue(list((self.root/'data/backups').glob('*.json')))

    def test_concurrent_edits_are_serialized_without_lost_questions(self):
        from concurrent.futures import ThreadPoolExecutor
        def add(i):
            q=copy.deepcopy(fixture()['questions'][0]);q.update(id='',question=f'Câu giáo viên thêm {i}?')
            return self.svc.save_question(q)['id']
        with ThreadPoolExecutor(max_workers=4) as pool:ids=list(pool.map(add,range(8)))
        saved=json.loads(self.bank.read_text())['questions']
        self.assertEqual(len(saved),24);self.assertEqual(len(set(ids)),8)
        self.assertTrue(set(ids).issubset({x['id'] for x in saved}))

    def test_essay_exports_remove_private_rubric_and_rescale_teacher_points(self):
        from exports import export_document
        q=dict(id='ES-SECRET',type='ES',question='Thực hiện nhiệm vụ riêng?',max_score=1,points=2,
               rubric=[dict(criterion=f'Tiêu chí kín {i}',points=.25) for i in range(4)],
               equivalent_answer_policy='Chấp nhận diễn đạt tương đương')
        record=dict(title='Đề kiểm tra',grade=8,questions=[q])
        for fmt in ['json','html','docx']:
            raw,_,_=export_document(record,fmt,False)
            if fmt=='docx':
                with zipfile.ZipFile(io.BytesIO(raw)) as z:text=' '.join(z.read(n).decode('utf-8','ignore') for n in z.namelist())
            else:text=raw.decode()
            for hidden in ['Tiêu chí kín','ES-SECRET','equivalent_answer_policy','rubric']:
                self.assertNotIn(hidden,text)
        raw,_,_=export_document(record,'docx',True)
        with zipfile.ZipFile(io.BytesIO(raw)) as z:text=z.read('word/document.xml').decode()
        self.assertIn('Tiêu chí kín 0',text);self.assertIn('0,5 điểm',text)

    def test_docx_school_layout_has_tnr_black_title_no_border_and_keeps_options_together(self):
        from exports import export_document
        from xml.etree import ElementTree as ET
        e=self.svc.generate_exam(self.request())
        raw,_,_=export_document(e,'docx',False)
        ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            styles=ET.fromstring(z.read('word/styles.xml'));body=ET.fromstring(z.read('word/document.xml'))
        title=styles.find("w:style[@w:styleId='Title']",ns)
        self.assertIsNone(title.find('w:pPr/w:pBdr',ns))
        fonts=title.find('w:rPr/w:rFonts',ns)
        self.assertFalse(any('theme' in key.lower() for key in fonts.attrib))
        color=title.find('w:rPr/w:color',ns)
        self.assertEqual(color.get('{'+ns['w']+'}val'),'000000')
        options=[p for p in body.findall('.//w:body/w:p',ns) if ''.join(p.itertext()).startswith(('A. ','B. ','C. '))]
        self.assertTrue(options)
        self.assertTrue(all(p.find('w:pPr/w:keepNext',ns) is not None for p in options))

    def test_lms_export_has_no_headers_footers_and_bolds_correct_answers_in_brackets(self):
        from exports import export_document
        from xml.etree import ElementTree as ET
        e = self.svc.generate_exam(self.request())
        raw, mime, filename = export_document(e, 'docx', target='lms')
        self.assertTrue(filename.startswith('lms_de_kiem_tra_'))
        self.assertEqual(mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            body = ET.fromstring(z.read('word/document.xml'))
            text = z.read('word/document.xml').decode()

        # No header/footer banner or answer rubric table
        self.assertNotIn('HƯỚNG DẪN CHẤM', text)
        self.assertNotIn('Tiêu chí kín', text)
        self.assertNotIn('Trang 1/', text)

        # Check MC correct answer formatting: bracketed and bold
        mc_q = [q for q in e.get('questions', []) if q.get('type') == 'MC'][0]
        corr_letter = chr(65 + mc_q['correct'])
        expected_tag = f'[{corr_letter}.] '
        self.assertIn(expected_tag, text)

        # Verify the bold run exists for correct option
        bold_runs = [r for r in body.findall('.//w:r', ns) if r.find('w:rPr/w:b', ns) is not None]
        bold_texts = [''.join(r.itertext()) for r in bold_runs]
        self.assertTrue(any(expected_tag in bt for bt in bold_texts))

        # Verify that for the first question, wrong options do not have square brackets
        paras = [''.join(p.itertext()) for p in body.findall('.//w:body/w:p', ns)]
        q1_p_idx = next(i for i, t in enumerate(paras) if t.startswith('Câu 1.'))
        q1_opts = paras[q1_p_idx+1:q1_p_idx+5]
        for opt_text in q1_opts:
            if not opt_text.startswith(expected_tag):
                self.assertFalse(opt_text.startswith('['), f'Wrong option should not be bracketed: {opt_text}')

        # HTML LMS export
        html_raw, html_mime, html_fn = export_document(e, 'html', target='lms')
        html_str = html_raw.decode()
        self.assertIn(f'<strong>[{corr_letter}.]</strong>', html_str)
        self.assertNotIn('BẢNG ĐÁP ÁN', html_str)

    def test_create_permuted_exams_and_master_answer_grid(self):
        from exports import export_answer_grid_docx
        e = self.svc.generate_exam(self.request())
        orig_q_map = {q['question']: q['options'][q['correct']] for q in e['questions'] if q.get('type') == 'MC'}

        res = self.svc.create_permuted_exams(e['id'], codes=['101', '102', '103', '104'])
        self.assertEqual(res['count'], 4)
        self.assertEqual(res['clean_codes'], ['101', '102', '103', '104'])

        # Verify each generated exam
        for variant in res['generated_exams']:
            self.assertIn(variant['exam_code'], ['101', '102', '103', '104'])
            self.assertEqual(variant['parent_exam_id'], e['id'])
            for q in variant['questions']:
                if q.get('type') == 'MC':
                    # Crucial test: correct answer text must remain 100% faithful to the original question!
                    orig_corr_text = orig_q_map[q['question']]
                    perm_corr_text = q['options'][q['correct']]
                    self.assertEqual(orig_corr_text, perm_corr_text,
                                     f"Code {variant['exam_code']} question '{q['question']}' shifted correct answer incorrectly!")
                    # Check option explanations sync if present
                    if q.get('option_explanations'):
                        self.assertEqual(len(q['option_explanations']), len(q['options']))

        # Verify answer grid
        grid = res['answer_grid']
        self.assertIn('mc', grid)
        self.assertTrue(len(grid['mc']) > 0)
        for slot, code_answers in grid['mc'].items():
            for code in ['101', '102', '103', '104']:
                self.assertIn(code, code_answers)
                self.assertIn(code_answers[code], ['A', 'B', 'C', 'D'])

        # Test export master answer grid docx
        grid_docx = export_answer_grid_docx(grid, meta={'subject_name': 'Tin học', 'grade': 8})
        self.assertTrue(len(grid_docx) > 1000)
        with zipfile.ZipFile(io.BytesIO(grid_docx)) as z:
            doc_xml = z.read('word/document.xml').decode()
            self.assertIn('BẢNG ĐÁP ÁN TỔNG HỢP CÁC MÃ ĐỀ', doc_xml)
            self.assertIn('Mã 101', doc_xml)
            self.assertIn('Mã 104', doc_xml)

    def test_export_exam_bundle_zip(self):
        e = self.svc.generate_exam(self.request())
        self.svc.create_permuted_exams(e['id'], codes=['101', '102'])

        # Test DOCX bundle
        zip_bytes, mime, fn = self.svc.export_exam_bundle(e['id'], fmt='docx')
        self.assertEqual(mime, 'application/zip')
        self.assertTrue(fn.endswith('.zip'))
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            names = z.namelist()
            self.assertTrue(any('01_De_thi_hoc_sinh/De_thi_Ma_101.docx' in n for n in names))
            self.assertTrue(any('01_De_thi_hoc_sinh/De_thi_Ma_102.docx' in n for n in names))
            self.assertTrue(any('02_Dap_an_va_Huong_dan_cham/Dap_an_chi_tiet_Ma_101.docx' in n for n in names))
            self.assertTrue(any('02_Dap_an_va_Huong_dan_cham/Bang_dap_an_tong_hop_cac_ma_de.docx' in n for n in names))

        # Test TeX bundle
        zip_tex, mime_tex, fn_tex = self.svc.export_exam_bundle(e['id'], fmt='tex')
        self.assertEqual(mime_tex, 'application/zip')
        with zipfile.ZipFile(io.BytesIO(zip_tex)) as z:
            names = z.namelist()
            self.assertTrue(any('01_De_thi_hoc_sinh/De_thi_Ma_101.tex' in n for n in names))
            self.assertTrue(any('02_Dap_an_va_Huong_dan_cham/Dap_an_chi_tiet_Ma_101.tex' in n for n in names))

if __name__=='__main__':unittest.main()
