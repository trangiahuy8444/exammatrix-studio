"""Mốc A7: Gemini an toàn.

- Khóa chỉ lấy từ biến môi trường GEMINI_API_KEY, gửi qua header, không nằm trên URL.
- Giới hạn số lượt gọi mỗi ngày theo phạm vi (tài khoản / máy cục bộ).
- Nhật ký sử dụng chỉ ghi số lượt và token, không ghi nội dung prompt.
- Câu do AI tạo chỉ lưu được ở trạng thái nháp, nguồn `ai_gemini`.
"""
import json
import os
import unittest
from unittest.mock import MagicMock, patch

import ai_assistant
from ai_assistant import AiQuotaError, call_gemini, get_effective_api_key


def gemini_response(text='[]', usage=None):
    payload = {'candidates': [{'content': {'parts': [{'text': text}]}}]}
    if usage:
        payload['usageMetadata'] = usage
    resp = MagicMock()
    resp.read.return_value = json.dumps(payload).encode('utf-8')
    resp.__enter__.return_value = resp
    return resp


class EnvKeyTests(unittest.TestCase):
    def setUp(self):
        patcher = patch.dict(os.environ, {'GEMINI_API_KEY': 'env-key-123', 'AI_DAILY_LIMIT': '50'})
        patcher.start(); self.addCleanup(patcher.stop)
        ai_assistant.reset_usage()

    def test_key_from_browser_is_ignored(self):
        self.assertEqual(get_effective_api_key('browser-key'), 'env-key-123')

    def test_no_env_key_means_not_configured(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': ''}):
            self.assertIsNone(get_effective_api_key('browser-key'))
            self.assertFalse(ai_assistant.ai_status()['configured'])
            with self.assertRaises(ValueError) as ctx:
                call_gemini('x')
            self.assertIn('chưa được cấu hình', str(ctx.exception))

    @patch('urllib.request.urlopen')
    def test_key_is_sent_in_header_not_url(self, urlopen):
        urlopen.return_value = gemini_response()
        call_gemini('Đề bài bí mật')
        req = urlopen.call_args[0][0]
        self.assertNotIn('key=', req.full_url)
        self.assertNotIn('env-key-123', req.full_url)
        self.assertEqual(req.get_header('X-goog-api-key'), 'env-key-123')

    @patch('urllib.request.urlopen')
    def test_daily_limit_per_scope(self, urlopen):
        urlopen.return_value = gemini_response()
        with patch.dict(os.environ, {'AI_DAILY_LIMIT': '2'}):
            call_gemini('a', scope='ws1'); call_gemini('b', scope='ws1')
            with self.assertRaises(AiQuotaError):
                call_gemini('c', scope='ws1')
            call_gemini('d', scope='ws2')  # tài khoản khác không bị ảnh hưởng
        self.assertEqual(urlopen.call_count, 3)

    @patch('urllib.request.urlopen')
    def test_usage_log_has_tokens_but_no_prompt(self, urlopen):
        urlopen.return_value = gemini_response(usage={'promptTokenCount': 11, 'candidatesTokenCount': 7})
        with self.assertLogs('ai_assistant.usage', level='INFO') as logs:
            call_gemini('Nội dung đề riêng tư', scope='ws9')
        line = '\n'.join(logs.output)
        self.assertIn('ws9', line)
        self.assertIn('11', line); self.assertIn('7', line)
        self.assertNotIn('Nội dung đề riêng tư', line)
        self.assertNotIn('env-key-123', line)
        self.assertEqual(ai_assistant.ai_status('ws9')['used_today'], 1)

    @patch('urllib.request.urlopen')
    def test_timeout_is_bounded(self, urlopen):
        urlopen.return_value = gemini_response()
        call_gemini('x')
        self.assertLessEqual(urlopen.call_args.kwargs['timeout'], 45)


class SaveDraftsHttpTests(unittest.TestCase):
    def setUp(self):
        from test_http import HttpTests
        self.http = HttpTests('test_state_and_static_available_without_exposing_bank_file')
        self.http.setUp()
        self.addCleanup(self.http.doCleanups)

    def test_ai_questions_are_forced_to_draft_with_ai_origin(self):
        q = dict(grade=8, type='MC', lesson_code='B1', level='Biết', learning_outcome='Nhận biết dữ liệu.',
                 question='Câu AI mới hoàn toàn?', options=['Một', 'Hai', 'Ba', 'Bốn'], correct=1,
                 option_explanations=['a', 'b', 'c', 'd'], max_score=1, review_status='approved', origin='teacher')
        status, body, _ = self.http.call('/api/ai/save-drafts', 'POST', {'questions': [q]})
        self.assertEqual(status, 200, body)
        data = json.loads(body)
        saved = data['saved'][0]
        self.assertEqual(saved['review_status'], 'draft')
        self.assertEqual(saved['origin'], 'ai_gemini')
        self.assertTrue(any(x['id'] == saved['id'] for x in data['bank']['questions']))

    def test_save_drafts_rejects_editing_existing_question(self):
        status, _, _ = self.http.call('/api/ai/save-drafts', 'POST', {'questions': [dict(id='Q1', question='x')]})
        self.assertEqual(status, 400)

    def test_status_route_reports_configuration_without_key(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': 'secret-value-xyz'}):
            status, body, _ = self.http.call('/api/ai/status')
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)['configured'])
        self.assertNotIn(b'secret-value-xyz', body)


if __name__ == '__main__':
    unittest.main()
