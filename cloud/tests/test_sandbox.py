"""Django must never route test-mode operations into a teacher's normal bank."""
import copy
from django.contrib.auth import get_user_model
from django.test import TestCase
from workspace.models import Workspace, Subject, Curriculum
from .test_existing_app import legacy_fixture
from assessment.legacy_storage import bank_for_user


class SandboxIsolationTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user('sandbox-owner')
        self.workspace = Workspace.objects.create(owner=self.owner)
        subject = Subject.objects.create(workspace=self.workspace, code='vat-li', name='Vật lí')
        self.course = Curriculum.objects.create(workspace=self.workspace, subject=subject,
            grade=9, school_year='2026-2027', title='Physics sandbox isolation')
        bank = bank_for_user(self.owner, self.course)
        bank._atomic_save(bank.bank_path, legacy_fixture())
        self.client.force_login(self.owner)

    def url(self, path, test=False):
        return path+'?curriculum='+str(self.course.pk)+('&test_mode=1' if test else '')

    def test_test_mode_starts_with_copy_and_does_not_mutate_normal_bank(self):
        before = self.client.get(self.url('/api/state')).json()
        state = self.client.get(self.url('/api/state', True)).json()
        self.assertTrue(state['is_test_mode'])
        self.assertEqual([q['id'] for q in state['bank']['questions']], [q['id'] for q in before['bank']['questions']])
        self.assertEqual(len(state['bank']['ppct']['lessons']), len(before['bank']['ppct']['lessons']))
        self.assertEqual(state['exams'], [])
        lesson = before['bank']['ppct']['lessons'][0]
        r = self.client.post(self.url('/api/ppct/save-lesson', True), lesson, content_type='application/json')
        self.assertEqual(r.status_code, 200, r.content)
        q = copy.deepcopy(before['bank']['questions'][0]); q.pop('id'); q['question'] += ' (câu thử trong vùng Test)'
        r = self.client.post(self.url('/api/questions/save', True), {'question':q}, content_type='application/json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(self.client.get(self.url('/api/state', True)).json()['bank']['questions']), 13)
        self.assertEqual(self.client.get(self.url('/api/state')).json()['bank'], before['bank'])
        r = self.client.post(self.url('/api/test/reset', True), {}, content_type='application/json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['state']['is_test_mode'])
        self.assertEqual(len(r.json()['state']['bank']['questions']), 12)  # làm sạch = chép lại bản sao mới
        self.assertEqual(self.client.get(self.url('/api/state')).json()['bank'], before['bank'])

    def test_reset_requires_explicit_test_mode(self):
        r = self.client.post(self.url('/api/test/reset'), {}, content_type='application/json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(len(self.client.get(self.url('/api/state')).json()['bank']['questions']), 12)

    def test_header_and_query_select_the_same_sandbox(self):
        a = self.client.get(self.url('/api/state'), HTTP_X_TEST_MODE='1').json()
        b = self.client.get(self.url('/api/state', True)).json()
        self.assertTrue(a['is_test_mode'])
        self.assertEqual(a['bank'], b['bank'])
        # A substring like test_mode=10 must not accidentally select test mode.
        c = self.client.get(self.url('/api/state')+'&test_mode=10').json()
        self.assertFalse(c['is_test_mode'])

    def test_sandbox_is_scoped_to_both_teacher_and_course(self):
        self.client.get(self.url('/api/state', True))
        second = Curriculum.objects.create(workspace=self.workspace, subject=self.course.subject,
            grade=10, school_year='2026-2027', title='Other physics course')
        # Khóa học mới chưa có câu thật: vùng thử chỉ có câu mẫu tự soạn khi là môn Tin học; môn khác để trống.
        self.assertEqual(self.client.get('/api/state?test_mode=1&curriculum='+str(second.pk)).json()['bank']['questions'], [])
        other = get_user_model().objects.create_user('other-sandbox-owner')
        self.client.force_login(other)
        self.assertEqual(self.client.get(self.url('/api/state', True)).status_code, 404)

    def test_curriculum_script_is_served(self):
        self.assertEqual(self.client.get('/curricula.js').status_code, 200)
