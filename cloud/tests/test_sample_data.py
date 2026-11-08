"""Sample packs use the same service validation and stay in one chosen account."""
import copy
import io
import zipfile
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from assessment.legacy_storage import bank_for_user
from assessment.models import LegacyState
from workspace.models import Curriculum
from matrices.model import validate_matrix


class SampleDataTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user('sample_owner')
        self.other = get_user_model().objects.create_user('other_teacher')

    def seed(self, mode='apply'):
        call_command('seed_subject_samples', owner=self.owner.username, **{mode: True}, stdout=io.StringIO())

    def test_dry_run_does_not_create_any_data(self):
        self.seed('dry_run')
        self.assertEqual(Curriculum.objects.count(), 0)
        self.assertEqual(LegacyState.objects.count(), 0)

    def test_two_packs_have_questions_revision_exam_and_valid_draft_matrix(self):
        self.seed()
        courses = Curriculum.objects.filter(workspace__owner=self.owner)
        self.assertEqual(set(c.subject.name for c in courses), {'Toán', 'Vật lí'})
        for course in courses:
            state = bank_for_user(self.owner, course).state()
            qs = state['bank']['questions']
            self.assertEqual(len(state['bank']['ppct']['lessons']), 3)
            self.assertEqual(len(qs), 24)
            self.assertEqual(sum(q['type']=='MC' for q in qs), 18)
            self.assertEqual(sum(q['type']=='ES' for q in qs), 6)
            self.assertEqual(len({q['question'] for q in qs}), 24)
            self.assertTrue(all(q['grade']==10 for q in qs))
            self.assertEqual(len(state['revisions']), 1)
            self.assertEqual(state['revisions'][0]['question_count'], 24)
            self.assertEqual(len(state['exams']), 1)
            exam = state['exams'][0]
            self.assertEqual(exam['total_points'], 10)
            self.assertEqual(exam['question_count'], 14)
            self.assertEqual(exam['revision_match_count'], 14)
            self.assertEqual(exam['subject_name'], course.subject.name)
            self.assertEqual(sum(q['points'] for q in exam['questions']), 10)
            matrices = bank_for_user(self.owner, course)._records('matrices/records')
            self.assertEqual(len(matrices), 1)
            self.assertEqual(matrices[0]['status'], 'draft')
            report = validate_matrix(matrices[0], state['bank']['ppct'])
            self.assertTrue(report['valid'], report)
            self.client.force_login(self.owner)
            url = f'/api/exams/{exam["id"]}/export?format=docx&answers=1&curriculum={course.pk}'
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
                text = archive.read('word/document.xml').decode()
            self.assertIn(course.subject.name.upper(), text)
            self.assertNotIn('TIN HỌC', text)
            self.client.force_login(self.other)
            self.assertEqual(self.client.get(url).status_code, 404)
        self.assertFalse(Curriculum.objects.filter(workspace__owner=self.other).exists())

    def test_repeat_preserves_edits_and_original_bank(self):
        original = bank_for_user(self.owner)
        original_before = copy.deepcopy(original.state())
        self.seed()
        course = Curriculum.objects.filter(workspace__owner=self.owner).first()
        bank = bank_for_user(self.owner, course)
        q = bank.state()['bank']['questions'][0]
        q['question'] += ' (Giáo viên đã chỉnh sửa)'
        bank.save_question(q)
        before = copy.deepcopy(bank.state())
        self.seed()
        self.assertEqual(bank_for_user(self.owner, course).state(), before)
        self.assertEqual(bank_for_user(self.owner).state(), original_before)
        self.assertEqual(Curriculum.objects.count(), 2)
