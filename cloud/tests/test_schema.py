from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from workspace.models import Workspace, Subject, Curriculum, Lesson


class SchemaTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(username='teacher')
        self.workspace = Workspace.objects.create(owner=user)
        self.math = Subject.objects.create(workspace=self.workspace, code='math', name='Toán')
        self.cs = Subject.objects.create(workspace=self.workspace, code='cs', name='Tin học')

    def curriculum(self, subject, **kwargs):
        return Curriculum.objects.create(workspace=self.workspace, subject=subject, grade=9,
                                         school_year='2026-2027', title='Chương trình riêng', **kwargs)

    def test_same_lesson_code_in_different_subjects(self):
        for subject in [self.math, self.cs]:
            Lesson.objects.create(workspace=self.workspace, curriculum=self.curriculum(subject),
                                  code='B1', title='Bài 1', topic='Chủ đề 1')
        self.assertEqual(Lesson.objects.filter(code='B1').count(), 2)

    def test_duplicate_subject_code_in_one_workspace_rejected(self):
        with self.assertRaises((ValidationError, IntegrityError)), transaction.atomic():
            Subject.objects.create(workspace=self.workspace, code='math', name='Trùng')

    def test_cannot_link_other_teachers_subject(self):
        user = get_user_model().objects.create_user(username='other')
        other = Workspace.objects.create(owner=user)
        with self.assertRaises(ValidationError):
            Curriculum.objects.create(workspace=other, subject=self.math, grade=10,
                                      title='Sai chủ sở hữu', school_year='2026-2027')

    def test_subject_owner_is_required(self):
        with self.assertRaises((ValidationError, IntegrityError)), transaction.atomic():
            Subject.objects.create(code='unowned', name='Không có chủ')

    def test_grade_is_not_hardcoded_to_eight_nine_ten(self):
        c = Curriculum.objects.create(workspace=self.workspace, subject=self.math, grade=12,
                                      title='Toán 12', school_year='2026-2027')
        self.assertEqual(c.grade, 12)

    def test_health_does_not_expose_data(self):
        self.assertEqual(self.client.get('/healthz').json(), {'status': 'ok'})
