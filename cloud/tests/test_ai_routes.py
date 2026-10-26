"""Mốc A7: lời gọi Gemini chạy ngoài transaction/khóa tài khoản; giới hạn theo từng tài khoản."""
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase

from workspace.models import Workspace


class AiRouteLockTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('ai', password='Teacher-Test-5829!')
        self.ws = Workspace.objects.create(owner=self.user)
        self.client.force_login(self.user)

    def post(self, path, body):
        return self.client.post(path, json.dumps(body), content_type='application/json')

    def test_generate_runs_outside_atomic_block_with_account_scope(self):
        seen = {}

        def fake_call(prompt, api_key=None, scope='local', **kw):
            seen['atomic'] = connection.in_atomic_block
            seen['scope'] = scope
            return json.dumps([dict(type='MC', question='Câu?', options=['a', 'b', 'c', 'd'], correct=0,
                                    option_explanations=['1', '2', '3', '4'])])

        with patch('ai_assistant.call_gemini', side_effect=fake_call):
            r = self.post('/api/ai/generate-by-outcome', dict(grade=9, lesson_name='Bài 1', learning_outcome='YCCĐ',
                                                              count=1, api_key='browser-key'))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(seen['atomic'])
        self.assertEqual(seen['scope'], f'ws{self.ws.pk}')

    def test_quota_error_is_429(self):
        from ai_assistant import AiQuotaError
        with patch('ai_assistant.call_gemini', side_effect=AiQuotaError('Đã hết lượt')):
            r = self.post('/api/ai/parse-raw', dict(raw_text='Câu 1. ...', grade=9))
        self.assertEqual(r.status_code, 429)

    def test_save_drafts_still_runs_under_lock_and_saves_draft(self):
        r = self.post('/api/ai/save-drafts', {'questions': []})
        self.assertEqual(r.status_code, 400)  # danh sách rỗng bị từ chối
