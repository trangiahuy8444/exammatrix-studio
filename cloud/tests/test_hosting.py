"""Production configuration and persistence on an ephemeral web host."""
import json
import os
import subprocess
import sys
from pathlib import Path
from django.contrib.auth import get_user_model
from django.test import TestCase, SimpleTestCase, override_settings
from assessment.legacy_storage import bank_for_user
from workspace.models import Workspace, Subject, Curriculum
from bank_service import ServiceError
from matrices.service import MatrixService


class PersistentSourceTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('hosting_teacher')
        self.other = get_user_model().objects.create_user('hosting_other')
        workspace = Workspace.objects.create(owner=self.user)
        subject = Subject.objects.create(workspace=workspace, code='toan', name='Toán')
        self.course = Curriculum.objects.create(workspace=workspace, subject=subject,
            title='Toán 10', grade=10, school_year='2026-2027')
        self.bank = bank_for_user(self.user, self.course)

    def test_sources_survive_a_new_service_without_any_local_file(self):
        key = 'matrices/sources/'+'a'*64+'.docx'
        raw = b'private-docx-bytes'
        self.bank.write_source(key, raw)
        self.assertFalse((self.bank.data_dir/key).exists())
        fresh = bank_for_user(self.user, self.course)
        self.assertEqual(fresh.read_source(key), raw)
        self.assertTrue(fresh.source_exists(key))
        with self.assertRaises(ServiceError):
            bank_for_user(self.other).read_source(key)
        with self.assertRaises(ServiceError):
            bank_for_user(self.user).read_source(key)  # another bank of the same owner

    def test_source_pages_are_read_from_database(self):
        digest = 'b'*64
        m = {'id':'MATRIX-TEST', 'source':{'sha256':digest}}
        self.bank._atomic_save(self.bank.data_dir/'matrices/records.json', [m])
        self.bank.write_source(f'matrices/sources/{digest}_pages/page-2.png', b'png-2')
        self.bank.write_source(f'matrices/sources/{digest}_pages/page-1.png', b'png-1')
        service = MatrixService(bank_for_user(self.user, self.course))
        self.assertEqual([p['page'] for p in service.source_pages(m['id'])], [1,2])
        self.assertEqual(service.source_page_bytes(m['id'], 1), b'png-1')
        with self.assertRaises(ServiceError):service.source_page_bytes(m['id'], 3)

    def test_source_keys_and_limits_are_enforced(self):
        for key in ['../secret.docx', '/tmp/secret.docx', 'bank.json', 'matrices/sources/a.exe']:
            with self.assertRaises(ServiceError):self.bank.write_source(key, b'x')
        with override_settings(PRIVATE_SOURCE_MAX_BYTES=3):
            with self.assertRaises(ServiceError):self.bank.write_source('matrices/sources/a.docx', b'four')
        self.bank.write_source('matrices/sources/a.docx', b'first')
        with self.assertRaises(ServiceError):self.bank.write_source('matrices/sources/a.docx', b'changed')
        self.assertEqual(self.bank.read_source('matrices/sources/a.docx'), b'first')


class ProductionConfigurationTests(SimpleTestCase):
    def config(self, code=None, **changes):
        env = dict(os.environ)
        for key in ['DJANGO_ALLOWED_HOSTS','DJANGO_CSRF_TRUSTED_ORIGINS','DATABASE_URL','RENDER_EXTERNAL_HOSTNAME']:
            env.pop(key, None)
        env.update(APP_ENV='production', DJANGO_SECRET_KEY='test-secret-'*8,
            DATABASE_URL='postgresql://example:example@db.example.test/exams?sslmode=require',
            RENDER_EXTERNAL_HOSTNAME='exam-pilot.onrender.com')
        env.update(changes)
        code = code or "from config import settings as s; import json; print(json.dumps(dict(debug=s.DEBUG, hosts=s.ALLOWED_HOSTS, csrf=s.CSRF_TRUSTED_ORIGINS, middleware=s.MIDDLEWARE, static=str(s.STATIC_ROOT), engine=s.DATABASES['default']['ENGINE'], ssl=s.DATABASES['default']['OPTIONS']['sslmode'])))"
        return subprocess.run([sys.executable, '-c', code], env=env, text=True, capture_output=True,
            cwd=Path(__file__).resolve().parents[1])

    def test_render_hostname_is_explicitly_allowed_with_https_csrf(self):
        result = self.config()
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads(result.stdout)
        self.assertFalse(config['debug'])
        self.assertIn('exam-pilot.onrender.com', config['hosts'])
        self.assertNotIn('*', config['hosts'])
        self.assertIn('https://exam-pilot.onrender.com', config['csrf'])
        self.assertIn('whitenoise.middleware.WhiteNoiseMiddleware', config['middleware'])
        self.assertTrue(config['static'].endswith('/staticfiles'))
        self.assertEqual(config['ssl'], 'require')

    def test_production_refuses_unencrypted_database_connections(self):
        result = self.config(DATABASE_URL='postgresql://example:example@db.example.test/exams?sslmode=disable')
        self.assertNotEqual(result.returncode, 0)

    def test_free_render_blueprint_and_boot_scripts_exist(self):
        root = Path(__file__).resolve().parents[2]
        blueprint = (root/'render.yaml').read_text()
        self.assertIn('plan: free', blueprint)
        self.assertIn('DATABASE_URL', blueprint)
        self.assertNotIn('databases:', blueprint)
        self.assertIn('collectstatic', (root/'deploy/build.sh').read_text())
        start = (root/'deploy/start.sh').read_text()
        self.assertIn('migrate --noinput', start)
        self.assertIn('gunicorn', start)

    def test_generated_render_secret_parts_and_production_static_pages(self):
        code = """import os; os.environ['DJANGO_SETTINGS_MODULE']='config.settings'
from config.wsgi import application
from django.core.management import call_command
from django.test import Client
import json
call_command('collectstatic', interactive=False, verbosity=0)
client=Client(HTTP_HOST='exam-pilot.onrender.com')
print(json.dumps(dict(static=client.get('/static/workspace.css', secure=True).status_code,
                     login=client.get('/accounts/login/', secure=True).status_code,
                     health=client.get('/healthz').status_code)))
"""
        result = self.config(code=code, DJANGO_SECRET_KEY='aBC123!@'*5+'part', DJANGO_SECRET_KEY_EXTRA='dEF456$%'*5+'part')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {'static':200,'login':200,'health':200})
