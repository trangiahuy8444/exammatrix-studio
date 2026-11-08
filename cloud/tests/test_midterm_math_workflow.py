"""MIDTERM-MATH-01: dữ liệu Toán 10 GK1 tự soạn, chỉ API và XML DOCX."""
import io
import zipfile
from decimal import Decimal
from xml.etree import ElementTree as ET

from django.contrib.auth import get_user_model
from django.test import TestCase
from workspace.models import Curriculum, Subject, Workspace
from domain.review import CHECKLIST, version_hash

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
M = '{http://schemas.openxmlformats.org/officeDocument/2006/math}'


class MidtermMathWorkflowTests(TestCase):
    outcomes = ['Tính biểu thức phân số, căn và lũy thừa.', 'Giải hệ phương trình hai ẩn.',
                'Kiểm tra tính đúng của đẳng thức.', 'Tính nghiệm của phương trình.']
    expressions = ['1/2 + √9 + 2³', '⎧ x + y = 5\n⎩ x − y = 1']

    def setUp(self):
        self.user = get_user_model().objects.create_user('synthetic_midterm_math')
        self.workspace = Workspace.objects.create(owner=self.user)
        subject = Subject.objects.create(workspace=self.workspace, code='toan', name='Toán')
        self.math = Curriculum.objects.create(workspace=self.workspace, subject=subject, grade=10,
            school_year='2026-2027', title='Toán 10 GK1 minh họa')
        self.other_course = Curriculum.objects.create(workspace=self.workspace, subject=subject, grade=10,
            school_year='2025-2026', title='Toán 10 chương trình khác')
        self.client.force_login(self.user)
        self.post('/api/ppct/save-lesson', dict(grade=10, lesson_code='M1',
            lesson_name_source='Biểu thức và phương trình minh họa', topic_source='Đại số minh họa',
            outcomes=self.outcomes, week_raw='1-8', periods_raw='1-16'))

    def url(self, path, course=None):
        return path + ('&' if '?' in path else '?') + f'curriculum={(course or self.math).pk}'

    def post(self, path, data, course=None):
        response = self.client.post(self.url(path, course), data, content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content[:1500])
        return response.json()

    def question(self, kind, index, **fields):
        raw = dict(grade=10, type=kind, lesson_code='M1', learning_outcome=self.outcomes[index],
                   level='Biết', review_status='draft', max_score=1, **fields)
        saved = self.post('/api/questions/save', {'question': raw})['question']
        self.assertEqual(saved['review_status'], 'draft')
        self.post('/api/questions/review', dict(id=saved['id'], action='submit'))
        approved = self.post('/api/questions/review', dict(id=saved['id'], action='approve',
            checklist={item['key']: True for item in CHECKLIST}))['question']
        self.assertEqual(approved['review_status'], 'approved')
        self.assertEqual(approved['review_history'][-1]['by'], self.user.username)
        return approved

    def workflow(self):
        questions = [
            self.question('MC', 0, question='Tính ' + self.expressions[0] + '.',
                options=['23/2', '17/2', '9/2', '21/2'], correct=0,
                option_explanations=['Đúng: 0,5 + 3 + 8.', 'Thiếu số hạng.', 'Sai lũy thừa.', 'Sai căn.']),
            self.question('ES', 1, question='Giải hệ:\n' + self.expressions[1],
                rubric=[dict(criterion=t, points=0.25) for t in
                    ['RUBRIC_PRIVATE_1: cộng hai phương trình.', 'RUBRIC_PRIVATE_2: suy ra x = 3.',
                     'RUBRIC_PRIVATE_3: thay vào tìm y = 2.', 'RUBRIC_PRIVATE_4: kết luận nghiệm.']],
                equivalent_answer_policy='Chấp nhận phương pháp thế tương đương.'),
            self.question('YN', 2, question='Đánh giá các đẳng thức sau.',
                statements=[dict(label=chr(97+i), text=t, correct=answer) for i, (t, answer) in enumerate(
                    [('√16 = 4', True), ('2³ = 6', False), ('1/2 = 0,5', True), ('3² = 6', False)])]),
            self.question('SHORT', 3, question='Tìm x biết x + 1 = 8.', short_answer='7'),
        ]
        slots = []
        for i, (kind, points) in enumerate([('MC', 3), ('ES', 3), ('YN', 2), ('SHORT', 2)], 1):
            parts = [dict(id=f'P{i}{j}', label=chr(97+j) if kind == 'YN' else '',
                          requirement_id=f'R{i}', points=points / (4 if kind == 'YN' else 1), indicator='')
                     for j in range(4 if kind == 'YN' else 1)]
            slots.append(dict(id=f'S{i}', kind=kind, number=1, scoring=dict(mode='sum_parts'), parts=parts))
        matrix = dict(title='Ma trận Toán 10 GK1 minh họa', profile='GENERAL', grade=10,
            mode='authored', school_year='2026-2027', exam_type='GK1', duration=45,
            owner_name='Giáo viên Toán minh họa', campus='Trường minh họa', total_points=10,
            lessons=[dict(lesson_code='M1', title='Biểu thức và phương trình minh họa', topic='Đại số minh họa')],
            requirements=[dict(id=f'R{i+1}', lesson_code='M1', text=text, level='Biết',
                               competency='TDLL', ppct_outcome_index=i) for i, text in enumerate(self.outcomes)],
            slots=slots, indicator_catalog=[], reconciliation=dict(confirmed=True, issues=[]))
        draft = self.post('/api/matrices/save', dict(matrix=matrix, expected_revision=0))['matrix']
        report = self.post('/api/matrices/review', {'id': draft['id']})['validation']
        self.assertTrue(report['valid'], report)
        locked = self.post('/api/matrices/lock', dict(id=draft['id'], expected_revision=draft['revision'],
            confirmation=dict(confirmed_by='Giáo viên minh họa', confirmed_at='2026-10-31',
                              basis='Fixture GK1 tự soạn', external_agreement=True)))['matrix']
        revision = self.post('/api/revisions/save', dict(title='Ôn tập Toán 10 GK1 minh họa', grade=10,
            question_ids=[q['id'] for q in questions]))['revision']
        placements = [dict(slot_id=s['id'], question_id=q['id'], reviewed_part_ids=[p['id'] for p in s['parts']])
                      for s, q in zip(slots, questions)]
        exam = self.post('/api/exams/from-matrix', dict(matrix_id=locked['id'], revision_id=revision['id'],
            title='Giữa kỳ I Toán 10 minh họa', campus='Trường minh họa', exam_code='101',
            placements=placements))['exam']
        return questions, locked, revision, exam

    def document(self, exam, answers):
        response = self.client.get(self.url(f'/api/exams/{exam["id"]}/export?format=docx&answers={int(answers)}'))
        self.assertEqual(response.status_code, 200, response.content[:200])
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            return ET.fromstring(archive.read('word/document.xml'))

    def text(self, root):
        return '\n'.join(''.join(p.itertext()) for p in root.iter(W + 'p'))

    def test_gk1_mixed_matrix_verifies_totals_and_coverage(self):
        questions, matrix, revision, exam = self.workflow()
        self.assertEqual(exam['exam_type'], 'GK1')
        self.assertEqual(exam['subject_name'], 'Toán')
        self.assertEqual({q['type'] for q in exam['questions']}, {'MC', 'ES', 'YN', 'SHORT'})
        self.assertEqual(sum(Decimal(str(q['points'])) for q in exam['questions']), Decimal('10'))
        essay = next(q for q in exam['questions'] if q['type'] == 'ES')
        self.assertEqual(sum(Decimal(str(r['points'])) for r in essay['rubric']), Decimal('1'))
        self.assertEqual(essay['points'], 3)
        checked = self.post('/api/exams/verify', dict(id=exam['id']))['exam']
        self.assertTrue(checked['verification']['passed'], checked['verification'])
        self.assertEqual(checked['verification']['revision_check']['coverage_percent_count'], 100)
        self.assertEqual(checked['verification']['total_points'], 10)

    def test_unicode_formula_and_system_text_survive_student_docx(self):
        questions, matrix, revision, exam = self.workflow()
        source = {q['id']: q['question'] for q in questions}
        self.assertEqual({q['id']: q['question'] for q in exam['questions']}, source)
        root = self.document(exam, False)
        text = self.text(root)
        self.assertIn(self.expressions[0], text)
        for line in self.expressions[1].splitlines():
            self.assertIn(line, text)
        self.assertNotIn('RUBRIC_PRIVATE_', text)
        self.assertNotIn('Chấp nhận phương pháp thế tương đương.', text)
        self.assertIn('TOÁN', text.upper())
        self.assertNotIn('TIN HỌC', text.upper())
        self.assertNotIn('QUỐC TẾ Á CHÂU', text.upper())
        # Kiểm chứng bảo toàn chuỗi Unicode; không tuyên bố chuỗi này là phương trình Word.

    def test_teacher_docx_rubric_scales_to_matrix_points(self):
        questions, matrix, revision, exam = self.workflow()
        root = self.document(exam, True)
        text = self.text(root)
        for i in range(1, 5):
            self.assertIn(f'RUBRIC_PRIVATE_{i}', text)
        score_cells = [''.join(cell.itertext()) for cell in root.iter(W + 'tc')]
        self.assertEqual(score_cells.count('0,75 điểm'), 4, score_cells)
        self.assertIn('TOÁN', text.upper())
        self.assertNotIn('TIN HỌC', text.upper())
        self.assertNotIn('QUỐC TẾ Á CHÂU', text.upper())

    def test_four_permutations_preserve_questions_answers_and_point_totals(self):
        questions, matrix, revision, exam = self.workflow()
        result = self.post('/api/exams/permute', dict(id=exam['id'], codes=['101', '102', '103', '104'],
            shuffle_options=True, shuffle_statements=True, seed='math-midterm'))['result']
        self.assertEqual(result['count'], 4)
        expected = {q['id']: version_hash(q) for q in exam['questions']}
        for variant in result['generated_exams']:
            self.assertEqual({q['id']: version_hash(q) for q in variant['questions']}, expected)
            self.assertEqual(sum(Decimal(str(q['points'])) for q in variant['questions']), Decimal('10'))
            self.assertEqual(variant['exam_type'], 'GK1')
            checked = self.post('/api/exams/verify', dict(id=variant['id']))['exam']
            self.assertTrue(checked['verification']['passed'], checked['verification'])
            self.document(variant, False)
            self.document(variant, True)
        self.assertTrue(result['mapping'])

    def test_account_and_same_grade_curriculum_isolation(self):
        questions, matrix, revision, exam = self.workflow()
        state = self.client.get(self.url('/api/state', self.other_course)).json()
        for key in ['exams', 'revisions', 'matrices']:
            self.assertFalse(state.get(key), (key, state.get(key)))
        self.assertEqual(state['bank']['questions'], [])
        for course in [self.other_course]:
            for path in [f'/api/exams/{exam["id"]}/export?format=docx&answers=1',
                         f'/api/matrices/{matrix["id"]}/export?format=docx',
                         f'/api/revisions/{revision["id"]}/export?format=docx']:
                self.assertEqual(self.client.get(self.url(path, course)).status_code, 404, path)
        other = get_user_model().objects.create_user('synthetic_unrelated_math')
        self.client.force_login(other)
        self.assertEqual(self.client.get(self.url('/api/state')).status_code, 404)
        self.assertEqual(self.client.get(self.url(f'/api/exams/{exam["id"]}/export?format=docx&answers=1')).status_code, 404)

    def test_existing_string_input_keeps_latex_literal_not_native_word_equation(self):
        # Đây là phép đo khả năng hiện có, không coi raw LaTeX là công thức đã render.
        source = r'Tính $\frac{1}{2}+\sqrt{9}+2^{3}$.'
        q = self.question('MC', 0, question=source, options=['23/2', '1', '2', '3'], correct=0,
            option_explanations=['Đúng.', 'Sai.', 'Sai.', 'Sai.'])
        rev = self.post('/api/revisions/save', dict(title='Ôn tập công thức minh họa', grade=10,
            question_ids=[q['id']]))['revision']
        exam = self.post('/api/exams/generate', dict(title='GK1 công thức minh họa', grade=10,
            exam_type='GK1', duration=45, revision_id=rev['id'], seed='formula',
            blueprint=[dict(lesson_code='M1', type='MC', level='Biết', count=1, points_per_question=10)]))['exam']
        self.assertEqual(exam['questions'][0]['question'], source)
        root = self.document(exam, False)
        self.assertIn(source, self.text(root))
        self.assertEqual(list(root.iter(M + 'oMath')), [])
