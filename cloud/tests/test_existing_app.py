import copy
import json
import tempfile
from io import StringIO
from pathlib import Path
from django.core.management import call_command
from django.core.management.base import CommandError
from django.contrib.auth import get_user_model
from django.test import TestCase, Client
from workspace.models import Workspace
from assessment.legacy_storage import bank_for_user
from assessment.models import LegacyState


def legacy_fixture():
    lesson = dict(grade=9, lesson_code='B1', lesson_name_source='Bài gốc', topic_source='Chủ đề gốc',
                  outcomes=['Nhận biết dữ liệu.'], occurrences=[dict(periods_raw='1', week_raw='1')])
    qs = [dict(id=f'Q{i}', grade=9, type='MC', lesson_code='B1', lesson_name='Bài gốc',
               topic_source='Chủ đề gốc', level='Biết', learning_outcome='Nhận biết dữ liệu.',
               question=f'Câu hỏi riêng {i}?', options=['Một', 'Hai', 'Ba', 'Bốn'], correct=0,
               option_explanations=['Đúng', 'Sai', 'Sai', 'Sai'], max_score=1,
               review_status='approved', origin='teacher', response_mode='Trắc nghiệm')
          for i in range(12)]
    return dict(schema_version='1.0.0', metadata={}, ppct=dict(sources=[], lessons=[lesson]), questions=qs)


class ExistingAppTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = get_user_model().objects.create_user('a', password='Teacher-Test-5829!')
        cls.b = get_user_model().objects.create_user('b', password='Teacher-Test-5829!')
        for user in [cls.a, cls.b]:
            Workspace.objects.create(owner=user)

    def seed(self):
        service = bank_for_user(self.a)
        service._atomic_save(service.bank_path, legacy_fixture())

    def test_original_navigation_and_assets_are_used(self):
        self.client.force_login(self.a)
        response = self.client.get('/app/')
        self.assertContains(response, 'Ngân hàng câu hỏi')
        self.assertContains(response, 'data-tab="matrices"')
        self.assertContains(response, 'id="question-form"')
        self.assertContains(response, '/core.js')
        self.assertContains(response, 'name="csrf-token"')
        self.assertEqual(b''.join(self.client.get('/app.js').streaming_content),
                         (bank_for_user(self.a).app_dir/'public/app.js').read_bytes())

    def test_app_and_data_require_login(self):
        self.assertEqual(self.client.get('/app/').status_code, 302)
        self.assertEqual(self.client.get('/api/state').status_code, 401)

    def test_existing_bank_is_isolated_between_accounts(self):
        self.seed()
        self.client.force_login(self.a)
        state = self.client.get('/api/state').json()
        self.assertEqual(len(state['bank']['questions']), 12)
        self.client.force_login(self.b)
        self.assertEqual(self.client.get('/api/state').json()['bank']['questions'], [])

    def test_existing_revision_generation_and_word_export_roundtrip(self):
        self.seed()
        self.client.force_login(self.a)
        response = self.client.post('/api/revisions/save', dict(title='Đề cương cũ', grade=9,
                    question_ids=[f'Q{i}' for i in range(12)]), content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content)
        revision = response.json()['revision']
        response = self.client.post('/api/exams/generate', dict(title='Đề trên giao diện gốc', grade=9,
            exam_type='TX', duration=45, revision_id=revision['id'], seed='101',
            blueprint=[dict(lesson_code='B1', type='MC', level='Biết', count=10, points_per_question=1)]),
            content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content)
        exam_id = response.json()['exam']['id']
        response = self.client.get(f'/api/exams/{exam_id}/export?format=docx&answers=0')
        self.assertEqual(response.status_code, 200, response.content[:200])
        self.assertTrue(response.content.startswith(b'PK'))
        self.client.force_login(self.b)
        self.assertEqual(self.client.get(f'/api/exams/{exam_id}/export?format=json&answers=1').status_code, 404)

    def test_original_matrix_service_uses_database(self):
        service = bank_for_user(self.a)
        service._atomic_save(service.data_dir/'matrices/records.json', [dict(id='MATRIX-PRIVATE')])
        self.client.force_login(self.a)
        self.assertEqual(self.client.get('/api/matrices').json()['matrices'][0]['id'], 'MATRIX-PRIVATE')
        self.client.force_login(self.b)
        self.assertEqual(self.client.get('/api/matrices').json()['matrices'], [])

    def test_original_api_still_requires_csrf(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.a)
        self.assertEqual(client.post('/api/questions/archive', {'id': 'Q0'}, content_type='application/json').status_code, 403)

    def test_original_api_accepts_real_csrf_token(self):
        self.seed()
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.a)
        client.get('/app/')
        response = client.post('/api/questions/archive', {'id': 'Q0'}, content_type='application/json',
                               HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)
        self.assertEqual(response.status_code, 200, response.content)

    def test_legacy_import_dry_run_and_repeat(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            (source/'data/matrices').mkdir(parents=True)
            bank = source/'bank.json'
            bank.write_text(json.dumps(legacy_fixture()))
            call_command('import_legacy', source=tmp, bank=str(bank), owner='a', dry_run=True, stdout=StringIO())
            self.assertFalse(LegacyState.objects.filter(workspace=self.wa()).exists())
            for _ in range(2):
                call_command('import_legacy', source=tmp, bank=str(bank), owner='a', apply=True, stdout=StringIO())
            state = LegacyState.objects.get(workspace=self.wa())
            self.assertEqual(len(state.documents['bank']['questions']), 12)
            self.assertEqual(state.revision, 1)
            self.assertFalse(LegacyState.objects.filter(workspace__owner=self.b).exists())

    def wa(self):
        return Workspace.objects.get(owner=self.a)

    def test_import_never_overwrites_existing_work(self):
        self.seed()
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            (source/'bank.json').write_text(json.dumps(legacy_fixture()))
            with self.assertRaises(CommandError):
                call_command('import_legacy', source=tmp, bank=str(source/'bank.json'), owner='a', apply=True, stdout=StringIO())

    def test_private_files_cannot_be_served_as_assets(self):
        for path in ['/bank.json', '/data/exams.json', '/cloud/config/settings.py', '/assets/../bank.json']:
            self.assertEqual(self.client.get(path).status_code, 404)
