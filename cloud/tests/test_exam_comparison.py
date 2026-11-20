"""Báo cáo chỉ đọc qua API dùng chung; không vượt tài khoản/chương trình."""
import copy
import json
from pathlib import Path
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from assessment.legacy_storage import bank_for_user
from assessment.models import LegacyStateVersion
from assessment.answer_access import ANSWERS_DENIED_GROUP
from workspace.models import Workspace, Subject, Curriculum


class ComparisonAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('comparison_teacher')
        self.client.force_login(self.user)
        self.service = bank_for_user(self.user)
        self.exams = json.loads((Path(__file__).resolve().parents[2] / 'tests/fixtures/exam_comparison.json').read_text())
        self.service.storage.state.documents['exams'] = copy.deepcopy(self.exams)
        self.service.storage.state.save()

    def post(self, payload, query=''):
        return self.client.post('/api/exams/compare'+query, json.dumps(payload), content_type='application/json')

    def test_report_has_no_answers_and_does_not_write_versions(self):
        versions = LegacyStateVersion.objects.count()
        before = copy.deepcopy(self.service.storage.state.documents)
        response = self.post({'ids':['E1','E2'], 'exams':[]})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()['pairs'][0]['same_structure'])
        self.assertNotIn('rubric', response.content.decode())
        self.assertNotIn('correct', response.content.decode())
        self.service.storage.state.refresh_from_db()
        self.assertEqual(self.service.storage.state.documents, before)
        self.assertEqual(LegacyStateVersion.objects.count(), versions)

    def test_invalid_ids_and_missing_record(self):
        for ids in (None, [], ['E1'], ['E1','E1'], ['E1',{}], ['E1']*7):
            self.assertEqual(self.post({'ids':ids}).status_code, 400)
        self.assertEqual(self.post({'ids':['E1','missing']}).status_code, 404)

    def test_other_account_cannot_read_exams(self):
        other = get_user_model().objects.create_user('comparison_other')
        self.client.force_login(other)
        self.assertEqual(self.post({'ids':['E1','E2']}).status_code, 404)
        self.client.logout()
        self.assertNotEqual(self.post({'ids':['E1','E2']}).status_code, 200)

    def test_teacher_without_answer_permission_can_read_only_aggregates(self):
        self.user.groups.add(Group.objects.create(name=ANSWERS_DENIED_GROUP))
        response = self.post({'ids':['E1','E2']})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['pairs'][0]['same_structure'])
        self.assertNotIn('rubric', response.content.decode())
        self.assertNotIn('correct', response.content.decode())

    def test_selected_curriculum_does_not_fall_back_to_legacy_exams(self):
        workspace = Workspace.objects.get(owner=self.user)
        subject = Subject.objects.create(workspace=workspace, code='tin', name='Tin học')
        course = Curriculum.objects.create(workspace=workspace, subject=subject, title='Tin 9', grade=9, school_year='2026-2027')
        self.assertEqual(self.post({'ids':['E1','E2']}, '?curriculum='+str(course.pk)).status_code, 404)
