from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from workspace.models import Workspace, Subject, Curriculum


class AccessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = get_user_model().objects.create_user('teacher_a', password='Teaching-Example-572!')
        cls.b = get_user_model().objects.create_user('teacher_b', password='Teaching-Example-572!')
        cls.wa = Workspace.objects.create(owner=cls.a)
        cls.wb = Workspace.objects.create(owner=cls.b)
        cls.subject = Subject.objects.create(workspace=cls.wa, code='math', name='Toán')

    def test_home_and_signup_work(self):
        self.assertEqual(self.client.get('/').status_code, 200)
        response = self.client.post('/accounts/signup/', {
            'username': 'new_teacher', 'email': 'teacher@example.test',
            'password1': 'Lesson-Ready-5928!', 'password2': 'Lesson-Ready-5928!',
        })
        self.assertRedirects(response, '/workspace/')
        user = get_user_model().objects.get(username='new_teacher')
        self.assertTrue(Workspace.objects.filter(owner=user).exists())

    def test_workspace_requires_login(self):
        self.assertEqual(self.client.get('/workspace/').status_code, 302)
        self.assertEqual(self.client.get('/api/subjects/').status_code, 401)

    def test_teacher_cannot_read_other_subject(self):
        self.client.force_login(self.b)
        self.assertEqual(self.client.get(f'/api/subjects/{self.subject.pk}/').status_code, 404)
        self.assertEqual(self.client.get('/api/subjects/').json()['subjects'], [])

    def test_subject_creation_ignores_supplied_owner(self):
        self.client.force_login(self.b)
        response = self.client.post('/api/subjects/', {
            'code': 'cs', 'name': 'Tin học', 'workspace': str(self.wa.pk),
        }, content_type='application/json')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Subject.objects.filter(code='cs', workspace=self.wb).exists())

    def test_cannot_create_curriculum_for_other_subject(self):
        self.client.force_login(self.b)
        response = self.client.post('/api/curricula/', {'subject_id': str(self.subject.pk),
            'title': 'Chương trình khác', 'grade': 12, 'school_year': '2026-2027'}, content_type='application/json')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Curriculum.objects.count(), 0)

    def test_logged_out_client_cannot_read_cached_page(self):
        self.client.force_login(self.a)
        response = self.client.get('/workspace/')
        self.assertIn('no-store', response.headers['Cache-Control'])
        self.client.post('/accounts/logout/')
        self.assertEqual(self.client.get('/api/subjects/').status_code, 401)

    def test_csrf_is_required_for_writes(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.a)
        response = client.post('/api/subjects/', {'code': 'cs', 'name': 'Tin'}, content_type='application/json')
        self.assertEqual(response.status_code, 403)

    def test_inactive_teacher_cannot_use_old_session(self):
        self.client.force_login(self.a)
        self.a.is_active = False
        self.a.save()
        self.assertEqual(self.client.get('/api/subjects/').status_code, 401)

    def test_json_array_is_rejected_as_bad_request(self):
        self.client.force_login(self.b)
        self.assertEqual(self.client.post('/api/subjects/', [], content_type='application/json').status_code, 400)

    @override_settings(LOGIN_ATTEMPTS=3)
    def test_login_attempt_limit_is_persistent(self):
        for _ in range(3):
            response = self.client.post('/accounts/login/', {'username': 'teacher_a', 'password': 'wrong'})
            self.assertNotEqual(response.status_code, 429)
        self.assertEqual(self.client.post('/accounts/login/', {'username': 'teacher_a', 'password': 'wrong'}).status_code, 429)
