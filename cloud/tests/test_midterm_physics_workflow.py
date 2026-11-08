"""MIDTERM-PHYSICS-01: dữ liệu tự soạn; chỉ thử chức năng GK1, không chứng nhận PPCT."""
import io
import zipfile
from xml.etree import ElementTree as ET

from django.contrib.auth import get_user_model
from django.test import TestCase
from workspace.models import Workspace, Subject, Curriculum
from domain.review import CHECKLIST, version_hash

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


class MidtermPhysicsWorkflowTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('gv_vat_li_gk1_gia')
        workspace = Workspace.objects.create(owner=self.user)
        self.courses = {}
        for code, name in [('vat-li', 'Vật lí'), ('toan', 'Toán'), ('tin', 'Tin học')]:
            subject = Subject.objects.create(workspace=workspace, code=code, name=name)
            self.courses[code] = Curriculum.objects.create(workspace=workspace, subject=subject,
                grade=10, school_year='2026-2027', title=f'{name} 10 minh họa GK1')
        self.course = self.courses['vat-li']
        self.client.force_login(self.user)
        self.outcomes = ['Nhận biết đơn vị SI của gia tốc.',
            'Tính gia tốc từ số liệu vận tốc và thời gian.',
            'Vận dụng định luật II Newton và kiểm tra đơn vị.']
        self.post('/api/ppct/save-lesson', dict(grade=10, lesson_code='VL-GK1',
            lesson_name_source='Động học và lực — dữ liệu tự soạn', topic_source='Vật lí minh họa',
            outcomes=self.outcomes, week_raw='1–3 (minh họa)', periods_raw='3'))
        common = dict(grade=10, lesson_code='VL-GK1', review_status='draft', max_score=1)
        raws = [dict(type='MC', level='Biết', learning_outcome=self.outcomes[0],
            question='Gia tốc a = Δv/Δt có đơn vị SI nào?',
            options=['m/s²', 'm/s', 'N', 'kg'], correct=0,
            option_explanations=['(m/s)/s = m/s².', 'Đây là đơn vị vận tốc.',
                'Đây là đơn vị lực.', 'Đây là đơn vị khối lượng.']),
            dict(type='SHORT', level='Hiểu', learning_outcome=self.outcomes[1],
                question='Bảng đo tự soạn:\nt (s) | 0 | 2\nv (m/s) | 1 | 5\nTính a = Δv/Δt, ghi đơn vị m/s².',
                short_answer='2 m/s²'),
            dict(type='ES', level='Vận dụng', learning_outcome=self.outcomes[2],
                question='Vật có m = 2 kg, lực kéo 8 N và lực cản 2 N ngược chiều. Dùng F⃗ = ma⃗ để tính a; lấy α = 0°.',
                rubric=[dict(criterion=x, points=.25) for x in [
                    'BAREM_KIN_1: F = 8 − 2 = 6 N.', 'BAREM_KIN_2: a = F/m.',
                    'BAREM_KIN_3: a = 3 m/s².', 'BAREM_KIN_4: 1 N = 1 kg·m/s²; α = 0°.']],
                equivalent_answer_policy='CHINH_SACH_KIN: chấp nhận cách giải tương đương, tối đa 1 điểm.')]
        self.questions = [self.post('/api/questions/save', {'question': dict(common, **q)})['question'] for q in raws]

    def url(self, path, course=None):
        return path + ('&' if '?' in path else '?') + f'curriculum={(course or self.course).pk}'

    def post(self, path, payload):
        response = self.client.post(self.url(path), payload, content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content[:2000])
        return response.json()

    def approve(self):
        result = []
        for q in self.questions:
            self.post('/api/questions/review', dict(id=q['id'], action='submit'))
            approved = self.post('/api/questions/review', dict(id=q['id'], action='approve',
                checklist={c['key']: True for c in CHECKLIST}))['question']
            self.assertEqual(approved['review_status'], 'approved')
            self.assertEqual(approved['review_history'][-1]['by'], self.user.username)
            result.append(approved)
        self.questions = result

    def matrix(self):
        matrix = dict(title='Ma trận Vật lí GK1 minh họa', profile='GENERAL', grade=10,
            mode='authored', school_year='2026-2027', exam_type='GK1', duration=45,
            owner_name='Giáo viên giả', campus='Lớp minh họa', total_points=10,
            lessons=[dict(lesson_code='VL-GK1', title='Động học và lực', topic='Vật lí minh họa')],
            requirements=[dict(id=f'R{i}', lesson_code='VL-GK1', text=self.outcomes[i],
                level=q['level'], competency='NL_CHUNG', ppct_outcome_index=i)
                for i, q in enumerate(self.questions)],
            slots=[dict(id=f'S{i}', kind=q['type'], number=1, scoring={'mode':'sum_parts'},
                parts=[dict(id=f'P{i}', label='', requirement_id=f'R{i}', points=points, indicator='')])
                for i, (q, points) in enumerate(zip(self.questions, [2, 2, 6]))],
            indicator_catalog=[], reconciliation=dict(confirmed=True, issues=[]))
        saved = self.post('/api/matrices/save', dict(matrix=matrix, expected_revision=0))['matrix']
        report = self.post('/api/matrices/review', dict(id=saved['id']))['validation']
        self.assertTrue(report['valid'], report)
        return self.post('/api/matrices/lock', dict(id=saved['id'], expected_revision=saved['revision'],
            confirmation=dict(confirmed_by='Giáo viên giả', confirmed_at='2026-10-31',
                basis='Dữ liệu kiểm thử tự biên soạn', external_agreement=True)))['matrix']

    def ready(self):
        self.approve()
        matrix = self.matrix()
        revision = self.post('/api/revisions/save', dict(title='Ôn tập Vật lí 10 GK1 minh họa',
            grade=10, question_ids=[q['id'] for q in self.questions]))['revision']
        return matrix, revision

    def exam(self):
        matrix, revision = self.ready()
        exam = self.post('/api/exams/from-matrix', dict(matrix_id=matrix['id'], revision_id=revision['id'],
            title='Giữa học kì I Vật lí 10 minh họa', campus='Lớp minh họa', exam_code='101',
            placements=[dict(slot_id=f'S{i}', question_id=q['id'], reviewed_part_ids=[f'P{i}'])
                for i, q in enumerate(self.questions)]))['exam']
        return exam, matrix, revision

    def docx(self, path):
        response = self.client.get(self.url(path))
        self.assertEqual(response.status_code, 200, response.content[:500])
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            xml = archive.read('word/document.xml')
            names = archive.namelist()
        root = ET.fromstring(xml)
        text = '\n'.join(''.join(p.itertext()) for p in root.iter(W+'p'))
        return text, root, names

    def test_ppct_and_course_state_keep_physics_separate_from_math_and_tin(self):
        state = self.client.get(self.url('/api/state')).json()
        self.assertEqual(state['context']['subject_name'], 'Vật lí')
        self.assertEqual(state['context']['allowed_grades'], [10])
        self.assertEqual(len(state['bank']['questions']), 3)
        self.assertTrue(all(q['review_status'] == 'draft' for q in state['bank']['questions']))
        for key in ['tin', 'toan']:
            other = self.client.get(self.url('/api/state', self.courses[key])).json()
            self.assertEqual(other['bank']['questions'], [])
            self.assertEqual(other['bank']['ppct']['lessons'], [])

    def test_draft_questions_cannot_make_a_formal_gk1_exam(self):
        response = self.client.post(self.url('/api/exams/generate'), dict(title='Không dùng câu nháp',
            grade=10, exam_type='GK1', duration=45, blueprint=[dict(lesson_code='VL-GK1',
                type='MC', level='Biết', count=1, points_per_question=10)]), content_type='application/json')
        self.assertEqual(response.status_code, 400, response.content[:1000])
        self.assertEqual(self.client.get(self.url('/api/state')).json()['exams'], [])

    def test_gk1_matrix_revision_exam_can_be_verified(self):
        exam, matrix, revision = self.exam()
        self.assertEqual(exam['subject_name'], 'Vật lí')
        self.assertEqual(exam['exam_type'], 'GK1')
        verified = self.post('/api/exams/verify', dict(id=exam['id']))['exam']
        self.assertTrue(verified['verification']['passed'], verified['verification'])
        self.assertTrue(verified['verification']['cells']['ok'])
        self.assertEqual(verified['revision_match_count'], 3)

    def test_gk1_permutation_preserves_content_answers_points_and_course_separation(self):
        exam, matrix, revision = self.exam()
        variants = self.post('/api/exams/permute', dict(id=exam['id'], codes=['101','102','103','104'],
            seed='VL-GK1-tusoan'))['result']
        self.assertEqual(variants['count'], 4)
        expected = {q['id']: version_hash(q) for q in exam['questions']}
        for child in variants['generated_exams']:
            self.assertEqual(child['subject_name'], 'Vật lí')
            self.assertEqual(child['exam_type'], 'GK1')
            self.assertEqual(sum(q['points'] for q in child['questions']), 10)
            self.assertEqual({q['id']: version_hash(q) for q in child['questions']}, expected)
            text, _, _ = self.docx(f'/api/exams/{child["id"]}/export?format=docx&answers=0')
            self.assertIn('F⃗ = ma⃗', text)
            self.assertNotIn('BAREM_KIN_', text)
        for key in ['tin','toan']:
            for path in [f'/api/exams/{exam["id"]}/export?format=json&answers=1',
                         f'/api/matrices/{matrix["id"]}/export?format=docx',
                         f'/api/revisions/{revision["id"]}/export?format=docx']:
                response = self.client.get(self.url(path, self.courses[key]))
                self.assertEqual(response.status_code, 404, response.content[:300])

    def test_student_teacher_docx_preserve_units_unicode_formula_and_table_text(self):
        exam, matrix, revision = self.exam()
        student, root, names = self.docx(f'/api/exams/{exam["id"]}/export?format=docx&answers=0')
        teacher, _, _ = self.docx(f'/api/exams/{exam["id"]}/export?format=docx&answers=1')
        for text in [student, teacher]:
            for token in ['VẬT LÍ', 'm/s²', 'Δv/Δt', 'F⃗ = ma⃗', 'α = 0°', 't (s) | 0 | 2', 'v (m/s) | 1 | 5', '8 N']:
                self.assertIn(token, text)
            self.assertNotIn('TIN HỌC', text)
            self.assertNotIn('TOÁN', text)
        for hidden in ['BAREM_KIN_', 'CHINH_SACH_KIN']:
            self.assertNotIn(hidden, student)
            self.assertIn(hidden, teacher)
        self.assertIn('1 N = 1 kg·m/s²', teacher)
        self.assertFalse(any(n.startswith('word/media/') for n in names), 'Đề thi không có logo.')
        # Đây là công thức Unicode, không tuyên bố đã xuất phương trình OMML của Word.
        self.assertFalse(root.findall('.//{http://schemas.openxmlformats.org/officeDocument/2006/math}oMath'))
        for path in [f'/api/matrices/{matrix["id"]}/export?format=docx',
                     f'/api/revisions/{revision["id"]}/export?format=docx&answers=0']:
            text, _, _ = self.docx(path)
            self.assertIn('VẬT LÍ', text.upper())
            self.assertNotIn('TIN HỌC', text)

    def test_gk1_exam_set_from_locked_general_matrix_can_be_verified(self):
        matrix, revision = self.ready()
        result = self.post('/api/exams/generate-set', dict(title='Bộ đề GK1 Vật lí minh họa', grade=10,
            exam_type='GK1', duration=45, exam_count=2, matrix_id=matrix['id'],
            revision_id=revision['id'], similarity_percent=100, seed='VL-set'))
        self.assertEqual(len(result['exams']), 2)
        self.assertEqual(result['revision']['id'], revision['id'])
        self.assertEqual(result['outside_per_exam'], 0)
        for exam in result['exams']:
            self.assertEqual(exam['subject_name'], 'Vật lí')
            self.assertEqual(exam['exam_type'], 'GK1')
            verified = self.post('/api/exams/verify', dict(id=exam['id']))['exam']
            self.assertTrue(verified['verification']['passed'], verified['verification'])
