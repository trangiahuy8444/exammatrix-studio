"""Nhập PPCT qua API trong khóa học: đối chiếu không ghi, xác nhận mới ghi, khối ngoài khóa học bị từ chối."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from workspace.models import Workspace, Subject, Curriculum


class PpctImportApiTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user('ppct-owner')
        workspace = Workspace.objects.create(owner=self.owner)
        subject = Subject.objects.create(workspace=workspace, code='tin-hoc', name='Tin học')
        self.course = Curriculum.objects.create(workspace=workspace, subject=subject, grade=9, school_year='2026-2027', title='Tin 9 PPCT')
        self.client.force_login(self.owner)

    def post(self, path, data):
        return self.client.post(path+'?curriculum='+str(self.course.pk), data, content_type='application/json')

    def test_inspect_then_apply(self):
        data = {'json': {'lessons': [{'grade': 9, 'lesson_code': 'B1', 'lesson_name_source': 'Bài 1. Bài mẫu', 'outcomes': ['YCCĐ mẫu.']}]},
                'filename': 'ppct.json'}
        r = self.post('/api/ppct/inspect-import', data)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['summary']['new'], 1)
        state = self.client.get('/api/state?curriculum='+str(self.course.pk)).json()
        self.assertEqual(state['bank']['ppct']['lessons'], [])
        r = self.post('/api/ppct/apply-import', dict(data, expected_sha256=r.json()['sha256']))
        self.assertEqual(r.status_code, 200, r.content)
        state = self.client.get('/api/state?curriculum='+str(self.course.pk)).json()
        self.assertEqual([x['lesson_code'] for x in state['bank']['ppct']['lessons']], ['B1'])

    def test_grade_outside_course_is_refused(self):
        data = {'json': {'lessons': [{'grade': 10, 'lesson_code': 'B1', 'lesson_name_source': 'Bài 1. X', 'outcomes': ['A']}]}}
        self.assertEqual(self.post('/api/ppct/inspect-import', data).status_code, 400)
