"""Mốc B2: quyền xem đáp án kiểm tra tại máy chủ, không chỉ ẩn nút trên giao diện.

Tài khoản thuộc nhóm "khong_xem_dap_an" gọi thẳng URL bản giáo viên, LMS, gói ZIP, đề cương hoặc tệp ngân hàng thì nhận
403; dữ liệu JSON trả về không chứa đáp án; mọi lần truy cập (được phép hay bị từ chối) đều ghi nhật ký.
"""
import io
import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import TestCase

from assessment.answer_access import ANSWERS_DENIED_GROUP
from workspace.models import AuditEvent, Curriculum

ANSWER_KEYS = ('correct', 'option_explanations', 'rubric', 'short_answer', 'answer_grid')


def leaked_keys(value, found=None):
    found = set() if found is None else found
    if isinstance(value, dict):
        for k, v in value.items():
            if k in ANSWER_KEYS:
                found.add(k)
            if k == 'statements' and isinstance(v, list) and any(isinstance(s, dict) and 'correct' in s for s in v):
                found.add('statements.correct')
            leaked_keys(v, found)
    elif isinstance(value, list):
        for v in value:
            leaked_keys(v, found)
    return found


class AnswerAccessTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('gv_dap_an')
        call_command('seed_subject_samples', owner=self.user.username, apply=True, stdout=io.StringIO())
        self.course = Curriculum.objects.get(workspace__owner=self.user, subject__code='toan')
        self.client.force_login(self.user)
        state = self.client.get(self.url('/api/state')).json()
        self.exam_id = state['exams'][0]['id']
        self.revision_id = state['revisions'][0]['id']

    def url(self, path):
        return path + ('&' if '?' in path else '?') + 'curriculum=' + str(self.course.pk)

    def deny(self):
        group, _ = Group.objects.get_or_create(name=ANSWERS_DENIED_GROUP)
        self.user.groups.add(group)

    def answer_urls(self):
        return [f'/api/exams/{self.exam_id}/export?format=docx&answers=1',
                f'/api/exams/{self.exam_id}/export?format=json&answers=1',
                f'/api/exams/{self.exam_id}/export?format=docx&target=lms',
                f'/api/exams/{self.exam_id}/bundle.zip?format=docx',
                f'/api/revisions/{self.revision_id}/export?format=docx',
                '/api/bank/export', '/api/bank/export-lms?format=docx']

    def test_owner_can_download_answers_and_access_is_logged(self):
        for path in self.answer_urls()[:2]:
            self.assertEqual(self.client.get(self.url(path)).status_code, 200, path)
        events = AuditEvent.objects.filter(actor=self.user, action='answers_access')
        self.assertEqual(events.count(), 2)
        self.assertEqual(events.first().object_id, self.exam_id)

    def test_denied_account_gets_403_on_every_answer_route_and_denials_are_logged(self):
        self.deny()
        for path in self.answer_urls():
            response = self.client.get(self.url(path))
            self.assertEqual(response.status_code, 403, path)
        self.assertEqual(AuditEvent.objects.filter(actor=self.user, action='answers_denied').count(), len(self.answer_urls()))

    def test_denied_account_can_still_get_student_exam(self):
        self.deny()
        response = self.client.get(self.url(f'/api/exams/{self.exam_id}/export?format=docx&answers=0'))
        self.assertEqual(response.status_code, 200)

    def test_json_state_has_no_answers_for_denied_account(self):
        self.deny()
        state = self.client.get(self.url('/api/state')).json()
        self.assertEqual(leaked_keys(state), set())
        self.assertTrue(state['exams'][0]['questions'])  # vẫn thấy đề, chỉ không thấy đáp án
        self.assertFalse(state['can_view_answers'])

    def test_owner_state_reports_permission(self):
        self.assertTrue(self.client.get(self.url('/api/state')).json()['can_view_answers'])
