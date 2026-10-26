"""A mathematics teacher uses the existing app, not only the account screen."""
import io
import zipfile
from django.contrib.auth import get_user_model
from django.test import TestCase
from workspace.models import Workspace, Subject, Curriculum


class MathWorkflowTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('math_teacher')
        self.workspace = Workspace.objects.create(owner=self.user)
        subject = Subject.objects.create(workspace=self.workspace, code='toan', name='Toán')
        self.math = Curriculum.objects.create(workspace=self.workspace, subject=subject, grade=12,
            school_year='2026-2027', title='Toán 12 của tôi')
        cs = Subject.objects.create(workspace=self.workspace, code='tin', name='Tin học')
        self.cs = Curriculum.objects.create(workspace=self.workspace, subject=cs, grade=9,
            school_year='2026-2027', title='Tin học 9')
        self.client.force_login(self.user)

    def url(self, path, course=None):
        return path + ('&' if '?' in path else '?') + 'curriculum=' + str((course or self.math).pk)

    def post(self, path, data, course=None):
        response = self.client.post(self.url(path, course), data, content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content[:500])
        return response.json()

    def seed_question(self):
        self.post('/api/ppct/save-lesson', dict(grade=12, lesson_code='B1',
            lesson_name_source='Tính đơn điệu của hàm số', topic_source='Ứng dụng đạo hàm',
            outcomes=['Xét tính đồng biến của hàm số.'], week_raw='1', periods_raw='1'))
        q = self.post('/api/questions/save', {'question': dict(grade=12, type='MC', lesson_code='B1',
            learning_outcome='Xét tính đồng biến của hàm số.', level='Biết',
            question='Đạo hàm của hàm số y = x² là gì?', options=['2x', 'x', 'x²', '2'], correct=0,
            option_explanations=['Theo quy tắc đạo hàm lũy thừa.', 'Sai bậc.', 'Chưa lấy đạo hàm.', 'Thiếu biến.'],
            review_status='draft', max_score=1)})['question']
        # Đề chính thức chỉ dùng câu đã duyệt (B1): gửi duyệt rồi duyệt kèm đủ phiếu kiểm định.
        from domain.review import CHECKLIST
        self.post('/api/questions/review', dict(id=q['id'], action='submit'))
        approved = self.post('/api/questions/review', dict(id=q['id'], action='approve',
                             checklist={item['key']: True for item in CHECKLIST}))['question']
        self.assertEqual(approved['review_history'][-1]['by'], self.user.get_username())
        return approved

    def test_course_context_changes_actual_app_not_only_settings(self):
        response = self.client.get(self.url('/app/'))
        self.assertContains(response, 'name="curriculum-id"')
        self.assertContains(response, 'Toán 12')
        self.assertContains(response, 'data-tab="matrices"')
        state = self.client.get(self.url('/api/state')).json()
        self.assertEqual(state['context']['subject_name'], 'Toán')
        self.assertEqual(state['context']['allowed_grades'], [12])

    def test_math_teacher_can_save_generate_and_export_own_exam(self):
        q = self.seed_question()
        revision = self.post('/api/revisions/save', dict(title='Ôn tập Toán 12', grade=12,
            question_ids=[q['id']]))['revision']
        result = self.post('/api/exams/generate', dict(title='Kiểm tra Toán 12', grade=12,
            exam_type='GK1', duration=45, revision_id=revision['id'], seed='101',
            blueprint=[dict(lesson_code='B1', type='MC', level='Biết', count=1, points_per_question=10)]))
        exam = result['exam']
        self.assertEqual(exam['subject_name'], 'Toán')
        response = self.client.get(self.url(f'/api/exams/{exam["id"]}/export?format=docx&answers=0'))
        self.assertEqual(response.status_code, 200, response.content[:100])
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            text = archive.read('word/document.xml').decode()
        self.assertIn('TOÁN', text.upper())
        self.assertNotIn('TIN HỌC', text)
        self.assertNotIn('QUỐC TẾ Á CHÂU', text)
        for path in ['/api/state', f'/api/exams/{exam["id"]}/export?format=json&answers=1']:
            response = self.client.get(self.url(path, self.cs))
            if '/export' in path:
                self.assertEqual(response.status_code, 404)
            else:
                self.assertEqual(response.json()['bank']['questions'], [])

    def test_math_matrix_uses_math_competencies_and_grade_twelve(self):
        q = self.seed_question()
        matrix = dict(title='Ma trận Toán 12', profile='GENERAL', grade=12,
            mode='authored', school_year='2026-2027', exam_type='GK1', duration=45,
            owner_name='Giáo viên Toán', campus='Trường của tôi', total_points=10,
            lessons=[dict(lesson_code='B1', title='Tính đơn điệu', topic='Ứng dụng đạo hàm')],
            requirements=[dict(id='R1', lesson_code='B1', text='Xét tính đồng biến của hàm số.',
                level='Biết', competency='TDLL', ppct_outcome_index=0)],
            slots=[dict(id='S1', kind='MC', number=1, scoring={'mode': 'sum_parts'},
                parts=[dict(id='P1', label='', requirement_id='R1', points=10, indicator='')])],
            indicator_catalog=[], reconciliation=dict(confirmed=True, issues=[]))
        saved = self.post('/api/matrices/save', dict(matrix=matrix, expected_revision=0))['matrix']
        self.assertEqual(saved['subject_name'], 'Toán')
        report = self.post('/api/matrices/review', {'id': saved['id']})['validation']
        self.assertTrue(report['valid'], report)
        locked = self.post('/api/matrices/lock', dict(id=saved['id'], expected_revision=saved['revision'],
            confirmation=dict(confirmed_by='Giáo viên Toán', confirmed_at='2026-10-22',
                              basis='Ma trận đã kiểm tra', external_agreement=True)))['matrix']
        rev = self.post('/api/revisions/save', dict(title='Ôn tập Toán', grade=12, question_ids=[q['id']]))['revision']
        exam = self.post('/api/exams/from-matrix', dict(matrix_id=locked['id'], revision_id=rev['id'],
            title='Đề Toán từ ma trận', campus='Trường của tôi', exam_code='101',
            placements=[dict(slot_id='S1', question_id=q['id'], reviewed_part_ids=['P1'])]))['exam']
        self.assertEqual(exam['subject_name'], 'Toán')
        response = self.client.get(self.url(f'/api/matrices/{locked["id"]}/export?format=docx'))
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            text = archive.read('word/document.xml').decode()
        self.assertIn('TOÁN', text.upper())
        self.assertNotIn('TIN HỌC', text)

    def test_other_teachers_curriculum_cannot_be_selected(self):
        other = get_user_model().objects.create_user('other_math_teacher')
        self.client.force_login(other)
        self.assertEqual(self.client.get(self.url('/api/state')).status_code, 404)
        self.assertEqual(self.client.get(self.url('/app/')).status_code, 404)

    def test_tabs_keep_their_own_course_context(self):
        self.seed_question()
        self.client.get(self.url('/app/', self.cs))
        math_state = self.client.get(self.url('/api/state')).json()
        self.assertEqual(len(math_state['bank']['questions']), 1)
        self.assertEqual(self.client.get(self.url('/api/state', self.cs)).json()['bank']['questions'], [])

    def test_quick_start_opens_own_math_bank(self):
        response = self.client.post('/workspace/', dict(action='quickstart', subject='toan',
            grade=11, school_year='2026-2027', book='Kết nối tri thức'))
        course = Curriculum.objects.get(workspace=self.workspace, grade=11)
        self.assertRedirects(response, f'/app/?curriculum={course.pk}')
        self.assertEqual(course.subject.name, 'Toán')
        self.assertEqual(self.client.get(self.url('/api/state', course)).json()['bank']['questions'], [])

    def test_math_revision_exports_have_subject_without_school_banner(self):
        q = self.seed_question()
        rev = self.post('/api/revisions/save', dict(title='Ôn tập Toán 12', grade=12,
            question_ids=[q['id']]))['revision']
        for fmt in ['html', 'docx']:
            response = self.client.get(self.url(f'/api/revisions/{rev["id"]}/export?format={fmt}'))
            self.assertEqual(response.status_code, 200)
            if fmt == 'docx':
                with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
                    text = archive.read('word/document.xml').decode()
            else:
                text = response.content.decode()
            self.assertIn('TOÁN', text.upper())
            self.assertNotIn('TIN HỌC', text)
            self.assertNotIn('QUỐC TẾ Á CHÂU', text)

    def test_math_docx_revision_roundtrip_preserves_grade_answer_and_outcome(self):
        import base64
        q = self.seed_question()
        rev = self.post('/api/revisions/save', dict(title='Ôn tập Toán 12', grade=12, question_ids=[q['id']]))['revision']
        exported = self.client.get(self.url(f'/api/revisions/{rev["id"]}/export?format=docx&answers=1'))
        imported = self.post('/api/revisions/import-file', dict(filename='on_tap.docx',
            content_base64=base64.b64encode(exported.content).decode()))['revision']
        self.assertEqual(imported['grade'], 12)
        self.assertIn('Toán', imported['title'])
        self.assertEqual(imported['questions'][0]['correct'], q['correct'])
        self.assertEqual(imported['questions'][0]['learning_outcome'], q['learning_outcome'])

    def test_import_revision_cannot_insert_other_grade(self):
        q = self.seed_question()
        response = self.client.post(self.url('/api/revisions/import-file'),
            {'revision': {'grade':9, 'title':'Sai khối', 'questions':[q]}}, content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_math_docx_unknown_question_does_not_guess_answers(self):
        import base64
        from docx import Document
        doc = Document()
        for line in ['ĐỀ CƯƠNG TOÁN KHỐI 12', 'I. TRẮC NGHIỆM',
                     'Câu 1. Đạo hàm của y = x² là gì?', 'A. 2x', 'B. x', 'C. 2', 'D. 0']:
            doc.add_paragraph(line)
        output = io.BytesIO()
        doc.save(output)
        response = self.client.post(self.url('/api/revisions/import-file'), dict(filename='toan12.docx',
            content_base64=base64.b64encode(output.getvalue()).decode()), content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('không tự đoán', response.json()['error'])
        self.assertEqual(self.client.get(self.url('/api/state')).json()['revisions'], [])
