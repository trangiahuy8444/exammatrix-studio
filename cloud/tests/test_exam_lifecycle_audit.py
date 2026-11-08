"""Nhật ký từ chối phát hành tồn tại ngoài giao dịch bị hoàn tác; chỉ dùng đề giả."""
import copy
import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from assessment.legacy_storage import bank_for_user
from assessment.models import LegacyState, LegacyStateVersion
from domain.exam_lifecycle import exam_hash
from workspace.models import AuditEvent


class PublishBlockedAuditTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('gv_audit_gia')
        self.client.force_login(self.user)
        self.service = bank_for_user(self.user)
        self.exams = []
        for ident in ('GIA-1', 'GIA-2', 'GIA-3'):
            exam = dict(id=ident, title='Đề giả', status='locked', exam_set={'id': 'BO-GIA'},
                        questions=[dict(id='CAU-GIA', question='Dữ liệu giả?', options=['A', 'B'], correct=0)],
                        lifecycle=[dict(action='approve', by='to_truong_gia')])
            exam['approved_hash'] = exam_hash(exam)
            self.exams.append(exam)

    def save(self):
        self.service._atomic_save(self.service.data_dir/'exams.json', self.exams)
        self.state = LegacyState.objects.get(pk=self.service.storage.state.pk)
        self.before = copy.deepcopy(self.state.documents)
        self.revision = self.state.revision
        self.versions = LegacyStateVersion.objects.count()

    def post(self, path, **payload):
        return self.client.post(path, json.dumps(payload), content_type='application/json')

    def assert_rolled_back(self):
        self.state.refresh_from_db()
        self.assertEqual(self.state.documents, self.before)
        self.assertEqual(self.state.revision, self.revision)
        self.assertEqual(LegacyStateVersion.objects.count(), self.versions)

    def test_single_block_is_audited_after_document_rollback(self):
        self.exams[0]['questions'][0]['correct'] = 1
        self.save()
        response = self.post('/api/exams/transition', id='GIA-1', action='publish', actor='gia_mao')
        self.assertEqual(response.status_code, 409)
        self.assert_rolled_back()
        event = AuditEvent.objects.get(action='publish_blocked')
        self.assertEqual(event.actor_id, self.user.pk)
        self.assertEqual(event.object_id, 'GIA-1')
        self.assertEqual(event.details['scope'], 'exam')
        self.assertEqual(event.details['exam_id'], 'GIA-1')
        response = self.post('/api/exams/transition', id='GIA-1', action='publish')
        self.assertEqual(response.status_code, 409)
        self.assert_rolled_back()
        self.assertEqual(AuditEvent.objects.filter(action='publish_blocked').count(), 2)

    def test_set_block_rolls_back_first_publish_but_keeps_only_denial_audit(self):
        self.exams[1]['questions'][0]['correct'] = 1
        self.save()
        response = self.post('/api/exams/set/transition', set_id='BO-GIA', action='publish')
        self.assertEqual(response.status_code, 409)
        self.assert_rolled_back()
        event = AuditEvent.objects.get(action='publish_blocked')
        self.assertEqual(event.object_id, 'BO-GIA')
        self.assertEqual(event.details['scope'], 'exam_set')
        self.assertEqual(event.details['exam_id'], 'GIA-2')
        self.assertEqual(event.actor_id, self.user.pk)

    def test_wrong_status_does_not_create_hash_mismatch_audit(self):
        self.exams[0]['status'] = 'drafting'
        self.exams[0]['lifecycle'].append(dict(action='publish_blocked', by='lan_truoc'))
        self.save()
        response = self.post('/api/exams/transition', id='GIA-1', action='publish')
        self.assertEqual(response.status_code, 409)
        self.assert_rolled_back()
        self.assertFalse(AuditEvent.objects.filter(action='publish_blocked').exists())
