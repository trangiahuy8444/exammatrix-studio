"""Kiểm định GK1 Tin 9 bằng nội dung tự soạn; không nạp ngân hàng thật."""
import copy
import io
import zipfile
from xml.etree import ElementTree as ET

from django.contrib.auth import get_user_model
from django.test import TestCase
from workspace.models import Workspace, Subject, Curriculum
from domain.review import CHECKLIST, version_hash

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
OUTCOMES = ['Nhận biết hành vi bảo vệ tài khoản.', 'Mô phỏng thuật toán cộng số.']
SECRET = 'HƯỚNG DẪN RIÊNG TIN 9'


class MidtermTinWorkflowTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('gk1_tin_teacher')
        self.workspace = Workspace.objects.create(owner=self.user)
        subject = Subject.objects.create(workspace=self.workspace, code='tin', name='Tin học', competencies=['NLa', 'NLb', 'NLc', 'NLd', 'NLe'])
        self.course = Curriculum.objects.create(workspace=self.workspace, subject=subject, grade=9,
            school_year='2026-2027', title='Tin học 9 tự soạn GK1', policy={'id': 'asian-school', 'minimum_revision_percent': 90, 'total_points': 10})
        self.client.force_login(self.user)

    def url(self, path):
        return path + ('&' if '?' in path else '?') + 'curriculum=' + str(self.course.pk)

    def post(self, path, payload, status=200):
        response = self.client.post(self.url(path), payload, content_type='application/json')
        self.assertEqual(response.status_code, status, response.content[:1600])
        return response.json()

    def state(self):
        response = self.client.get(self.url('/api/state'))
        self.assertEqual(response.status_code, 200)
        return response.json()

    def seed(self):
        for i, outcome in enumerate(OUTCOMES, 1):
            self.post('/api/ppct/save-lesson', dict(grade=9, lesson_code=f'B{i}',
                lesson_name_source=['Bảo vệ tài khoản', 'Mô phỏng thuật toán'][i-1],
                topic_source='Dữ liệu minh họa tự soạn', outcomes=[outcome],
                week_raw=str(i), periods_raw='1'))
        questions = []
        for kind, code, outcome, level in [('MC', 'B1', OUTCOMES[0], 'Biết'),
                                           ('ES', 'B2', OUTCOMES[1], 'Vận dụng')]:
            for i in range(4):
                q = dict(grade=9, type=kind, lesson_code=code, learning_outcome=outcome,
                    level=level, review_status='draft', max_score=1)
                if kind == 'MC':
                    q.update(question=f'Tình huống tự soạn {i+1}: hành vi nào bảo vệ tài khoản?',
                        options=['Dùng mật khẩu riêng', 'Chia sẻ mật khẩu', 'Đăng mật khẩu công khai', 'Tắt xác thực'],
                        correct=0, option_explanations=[SECRET + f' {i}', 'Lộ thông tin.', 'Lộ tài khoản.', 'Giảm bảo vệ.'])
                else:
                    q.update(question=f'Tự soạn {i+1}: Mô phỏng đoạn mã và hoàn thành bảng.\n'
                        's = 0\nfor i in range(1, 4):\n    s += i\nprint(s)\n'
                        '| i | s |\n| --- | --- |\n| 1 | 1 |\n| 2 | 3 |\nTính giá trị cuối của s.',
                        rubric=[dict(criterion=SECRET + ': ' + criterion, points=.25) for criterion in
                            ['Khởi tạo s bằng 0.', 'Duyệt i từ 1 tới 3.', 'Cộng đúng mỗi lượt.', 's cuối bằng 6.']],
                        equivalent_answer_policy='Chấp nhận bảng mô phỏng đúng.')
                draft = self.post('/api/questions/save', {'question': q})['question']
                self.assertEqual(draft['review_status'], 'draft')
                self.post('/api/questions/review', dict(id=draft['id'], action='submit'))
                approved = self.post('/api/questions/review', dict(id=draft['id'], action='approve',
                    checklist={item['key']: True for item in CHECKLIST}))['question']
                self.assertEqual(approved['review_status'], 'approved')
                self.assertEqual(approved['review_history'][-1]['by'], self.user.username)
                questions.append(approved)
        return questions

    def locked_matrix(self):
        requirements = [dict(id=f'R{i}', lesson_code=f'B{i}', text=outcome,
            level=['Biết', 'Vận dụng'][i-1], competency='NLa' if i == 1 else 'NLc',
            ppct_outcome_index=0) for i, outcome in enumerate(OUTCOMES, 1)]
        slots = []
        for kind, rid, points in [('MC', 'R1', 2), ('ES', 'R2', 3)]:
            for n in (1, 2):
                sid = f'{kind}{n}'
                slots.append(dict(id=sid, kind=kind, number=n, scoring=dict(mode='sum_parts'),
                    parts=[dict(id=sid+'P', label='', requirement_id=rid, points=points, indicator='')]))
        matrix = dict(title='Ma trận tự soạn GK1 Tin 9', profile='THCS', mode='authored', grade=9,
            school_year='2026-2027', exam_type='GK1', duration=45, owner_name='Giáo viên thử',
            campus='Cơ sở thử', total_points=10,
            lessons=[dict(lesson_code=f'B{i}', title=f'Bài {i}', topic='Tự soạn') for i in (1, 2)],
            requirements=requirements, slots=slots, indicator_catalog=[],
            reconciliation=dict(confirmed=True, issues=[]))
        saved = self.post('/api/matrices/save', dict(matrix=matrix, expected_revision=0))['matrix']
        checked = self.post('/api/matrices/review', {'id': saved['id']})['validation']
        self.assertTrue(checked['valid'], checked)
        return self.post('/api/matrices/lock', dict(id=saved['id'], expected_revision=saved['revision'],
            confirmation=dict(confirmed_by='Giáo viên thử', confirmed_at='2026-10-31',
                basis='Ma trận tự soạn chỉ dùng thử GK1', external_agreement=True)))['matrix']

    def generate_set(self):
        self.seed()
        matrix = self.locked_matrix()
        result = self.post('/api/exams/generate-set', dict(title='GK1 Tin 9 minh họa', grade=9,
            exam_type='GK1', duration=45, matrix_id=matrix['id'], exam_count=2,
            revision_total=8, seed='TIN-GK1-TEST'))
        return matrix, result

    def document(self, exam, answers=False):
        response = self.client.get(self.url(f'/api/exams/{exam["id"]}/export?format=docx&answers={int(answers)}'))
        self.assertEqual(response.status_code, 200, response.content[:200])
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            root = ET.fromstring(z.read('word/document.xml'))
            package = '\n'.join(z.read(n).decode('utf-8', 'ignore') for n in z.namelist() if n.endswith('.xml'))
        text = '\n'.join(t.text or '' for t in root.findall('.//w:t', NS))
        return root, text, package

    def test_teacher_course_and_ppct_outcomes_start_empty(self):
        state = self.state()
        self.assertEqual(state['bank']['questions'], [])
        self.assertEqual(state['context']['subject_name'], 'Tin học')
        self.assertEqual(state['context']['allowed_grades'], [9])
        self.seed()
        state = self.state()
        self.assertEqual(len(state['bank']['questions']), 8)
        self.assertEqual({q['learning_outcome'] for q in state['bank']['questions']}, set(OUTCOMES))
        response = self.client.get(self.url('/app/'))
        self.assertContains(response, 'data-tab="matrices"')

    def test_complete_gk1_set_verification_lock_publish_and_docx(self):
        matrix, result = self.generate_set()
        exams, revision = result['exams'], result['revision']
        self.assertEqual(len(exams), 2)
        self.assertEqual(result['shared_questions'], 0)
        ids = [{q['id'] for q in e['questions']} for e in exams]
        self.assertFalse(ids[0] & ids[1])
        self.assertEqual(len(revision['question_ids']), 8)
        for exam in exams:
            self.assertEqual(exam['grade'], 9)
            self.assertEqual(exam['exam_type'], 'GK1')
            self.assertEqual(exam['matrix_id'], matrix['id'])
            self.assertEqual(exam['subject_name'], 'Tin học')
            self.assertEqual(exam['total_points'], 10)
            self.assertEqual(sorted(q['type'] for q in exam['questions']), ['ES', 'ES', 'MC', 'MC'])
            self.assertTrue(all(q['review_status'] == 'approved' for q in exam['questions']))
            verified = self.post('/api/exams/verify', {'id': exam['id']})['exam']
            self.assertTrue(verified['revision_check']['passed'], verified['revision_check'])
            self.assertTrue(verified['verification']['cells']['ok'], verified['verification'])
            _, student, package = self.document(exam)
            self.assertIn('TIN', student.upper())
            self.assertIn('9', student)
            self.assertNotIn(SECRET, package)
            _, teacher, _ = self.document(exam, True)
            self.assertIn(SECRET, teacher)
        set_id = result['exam_set']['id']
        self.post('/api/revisions/transition', {'id': revision['id'], 'action': 'publish'}, 409)
        for action in ('submit', 'approve'):
            transitioned = self.post('/api/exams/set/transition', dict(set_id=set_id, action=action))
        self.assertTrue(all(e['status'] == 'locked' for e in transitioned['exams']))
        self.post('/api/revisions/transition', {'id': revision['id'], 'action': 'publish'})
        published = self.post('/api/exams/set/transition', dict(set_id=set_id, action='publish'))
        self.assertTrue(all(e['status'] == 'published' for e in published['exams']))

    def test_manual_placements_preserve_selected_questions_and_parts(self):
        questions = self.seed()
        matrix = self.locked_matrix()
        selected = questions[:2] + questions[4:6]
        rev = self.post('/api/revisions/save', dict(title='Đề cương tự soạn GK1 Tin', grade=9,
            question_ids=[q['id'] for q in selected]))['revision']
        placements = [dict(slot_id=s['id'], question_id=q['id'],
            reviewed_part_ids=[p['id'] for p in s['parts']]) for s, q in zip(matrix['slots'], selected)]
        exam = self.post('/api/exams/from-matrix', dict(matrix_id=matrix['id'], revision_id=rev['id'],
            title='GK1 Tin 9 chọn tay', campus='Cơ sở thử', exam_code='101', placements=placements))['exam']
        self.assertEqual({q['id'] for q in exam['questions']}, {q['id'] for q in selected})
        self.assertEqual(sum(q['points'] for q in exam['questions']), 10)
        checked = self.post('/api/exams/verify', {'id': exam['id']})['exam']
        self.assertTrue(checked['verification']['cells']['ok'])

    def test_permutations_keep_content_answers_and_matrix_cells(self):
        _, result = self.generate_set()
        source = result['exams'][0]
        permuted = self.post('/api/exams/permute', dict(id=source['id'], codes=['101', '102', '103', '104'],
            shuffle_questions=True, shuffle_options=True, seed='TIN-PERM'))['result']
        variants = permuted['generated_exams']
        self.assertEqual({e['exam_code'] for e in variants}, {'101', '102', '103', '104'})
        original = {q['id']: version_hash(q) for q in source['questions']}
        for exam in variants:
            self.assertEqual({q['id']: version_hash(q) for q in exam['questions']}, original)
            self.assertEqual(exam['status'], 'drafting')
            checked = self.post('/api/exams/verify', {'id': exam['id']})['exam']
            self.assertTrue(checked['verification']['cells']['ok'])
            self.document(exam)
            self.document(exam, True)

    def test_approval_requires_checklist_and_edit_invalidates_approval(self):
        questions = self.seed()
        q = copy.deepcopy(questions[0])
        q['question'] += ' Đã sửa tự soạn.'
        saved = self.post('/api/questions/save', {'question': q})['question']
        self.assertEqual(saved['review_status'], 'needs_review')
        self.post('/api/questions/review', {'id': q['id'], 'action': 'submit'})
        self.post('/api/questions/review', {'id': q['id'], 'action': 'approve', 'checklist': {}}, 400)
        self.assertEqual(next(x for x in self.state()['bank']['questions'] if x['id'] == q['id'])['review_status'], 'pending_review')

    def test_insufficient_approved_cell_does_not_write_exam_or_revision(self):
        questions = self.seed()
        matrix = self.locked_matrix()
        for q in questions[4:]:
            q = copy.deepcopy(q)
            q['question'] += ' Chưa duyệt bản sửa.'
            self.post('/api/questions/save', {'question': q})
        result = self.post('/api/exams/generate-set', dict(title='GK1 thiếu câu', grade=9,
            exam_type='GK1', matrix_id=matrix['id'], exam_count=2, revision_total=8), 400)
        self.assertIn('B2', str(result))
        state = self.state()
        self.assertEqual(state['exams'], [])
        self.assertEqual(state['revisions'], [])

    def test_locked_exam_snapshot_survives_bank_edit(self):
        _, result = self.generate_set()
        exam = result['exams'][0]
        set_id = result['exam_set']['id']
        for action in ('submit', 'approve'):
            self.post('/api/exams/set/transition', dict(set_id=set_id, action=action))
        before = next(e for e in self.state()['exams'] if e['id'] == exam['id'])
        edited = copy.deepcopy(before['questions'][0])
        edited['question'] = 'Nội dung tự soạn đã thay đổi sau khi khóa.'
        self.post('/api/questions/save', {'question': edited})
        after = next(e for e in self.state()['exams'] if e['id'] == exam['id'])
        self.assertEqual(after['approved_hash'], before['approved_hash'])
        self.assertEqual(after['questions'], before['questions'])
        self.document(after)

    def test_reject_other_grade_in_tin_nine(self):
        self.post('/api/ppct/save-lesson', dict(grade=10, lesson_code='B1',
            lesson_name_source='Sai khối tự soạn', outcomes=['Không thuộc lớp 9.']), 400)
        self.assertEqual(self.state()['bank']['ppct']['lessons'], [])

    def test_rich_code_is_preserved_and_markdown_table_becomes_word_table(self):
        _, result = self.generate_set()
        root, text, _ = self.document(result['exams'][0])
        self.assertIn('s = 0', text)
        self.assertIn('    s += i', text)
        # Bảng dữ liệu trong câu phải là bảng Word thực, không chỉ là các dấu gạch dọc.
        tables = root.findall('.//w:tbl', NS)
        texts = [' '.join(t.text or '' for t in table.findall('.//w:t', NS)) for table in tables]
        self.assertTrue(any('i' in t.split() and 's' in t.split() for t in texts), texts)
        self.assertNotIn('```python', text)
