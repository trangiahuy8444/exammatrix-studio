"""CRUD through HTTP, with recovery and existing assessment data protected."""
import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from workspace.models import Workspace, Subject, Curriculum
from assessment.legacy_storage import bank_for_user


class WorkspaceCRUDTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('crud_teacher')
        self.other = get_user_model().objects.create_user('crud_other')
        self.workspace = Workspace.objects.create(owner=self.user)
        self.subject = Subject.objects.create(workspace=self.workspace, code='toan', name='Toán')
        self.course = Curriculum.objects.create(workspace=self.workspace, subject=self.subject, title='Toán 10',
            grade=10, school_year='2026-2027')
        self.client.force_login(self.user)

    def api(self, method, url, data=None):
        return getattr(self.client, method)(url, data=json.dumps(data or {}), content_type='application/json')

    def test_subject_read_update_delete_restore(self):
        url = f'/api/subjects/{self.subject.pk}/'
        self.assertEqual(self.client.get(url).status_code, 200)
        r = self.api('patch', url, {'name':'Toán học', 'code':'toan-hoc', 'expected_revision':1})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['subject']['name'], 'Toán học')
        self.assertEqual(self.api('delete', url).status_code, 409)  # live course still uses subject
        self.api('delete', f'/api/curricula/{self.course.pk}/')
        self.assertEqual(self.api('delete', url).status_code, 200)
        self.assertEqual(self.client.get('/api/subjects/').json()['subjects'], [])
        self.assertEqual(self.api('post', url+'restore/').status_code, 200)
        self.assertEqual(len(self.client.get('/api/subjects/').json()['subjects']), 1)

    def test_course_crud_keeps_bank_and_restores_access(self):
        url = f'/api/curricula/{self.course.pk}/'
        self.assertEqual(self.client.get(url).json()['curriculum']['book'], '')
        bank = bank_for_user(self.user, self.course)
        bank.save_ppct_lesson(dict(grade=10, lesson_code='B1', lesson_name_source='Tập hợp',
            topic_source='Tập hợp', outcomes=['Xác định tập hợp.']))
        before = bank.state()
        updated = self.api('patch', url, {'title':'Toán 10 đã sửa','book':'Tài liệu của tôi','expected_revision':1})
        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertEqual(updated.json()['curriculum']['revision'], 2)
        self.assertEqual(self.client.get(f'/api/state?curriculum={self.course.pk}').json()['bank']['ppct']['_context']['title'], 'Toán 10 đã sửa')
        self.assertEqual(self.api('delete', url, {'expected_revision':2}).status_code, 200)
        self.assertEqual(self.client.get(f'/api/state?curriculum={self.course.pk}').status_code, 404)
        self.assertEqual(self.client.get('/api/curricula/').json()['curricula'], [])
        self.assertContains(self.client.get('/workspace/'), 'Thùng rác')
        self.assertEqual(self.api('post', url+'restore/').status_code, 200)
        self.assertEqual(bank_for_user(self.user, self.course).state(), before)

    def test_identity_change_is_blocked_with_content_but_allowed_when_empty(self):
        bank_for_user(self.user, self.course)  # empty storage still exists
        url = f'/api/curricula/{self.course.pk}/'
        self.assertEqual(self.api('patch', url, {'grade':11}).status_code, 200)
        state = self.client.get(f'/api/state?curriculum={self.course.pk}').json()
        self.assertEqual(state['context']['allowed_grades'], [11])
        bank = bank_for_user(self.user, Curriculum.objects.get(pk=self.course.pk))
        bank.save_ppct_lesson(dict(grade=11, lesson_code='B1', lesson_name_source='Bài học',
            topic_source='Chủ đề', outcomes=['Mục tiêu.']))
        for data in [{'grade':12}, {'school_year':'2027-2028'}]:
            self.assertEqual(self.api('patch', url, data).status_code, 409)
        self.course.refresh_from_db()
        self.assertEqual(self.course.grade, 11)
        self.assertEqual(self.course.school_year, '2026-2027')

    def test_stale_updates_and_foreign_owner_are_rejected(self):
        url = f'/api/curricula/{self.course.pk}/'
        self.assertEqual(self.api('patch', url, {'title':'Đổi tên','expected_revision':99}).status_code, 409)
        self.client.force_login(self.other)
        for url in [url, f'/api/subjects/{self.subject.pk}/']:
            for method in ['patch', 'delete']:
                self.assertEqual(self.api(method, url, {'title':'Sai chủ','name':'Sai chủ'}).status_code, 404)
            self.assertEqual(self.api('post', url+'restore/').status_code, 404)

    def test_html_edit_and_delete_confirmation(self):
        url = f'/workspace/curricula/{self.course.pk}/'
        self.assertContains(self.client.get(url), 'Sửa chương trình')
        data = dict(title='Toán 10 mới', subject=self.subject.pk, grade=10,
                    school_year='2026-2027', book='', expected_revision=1)
        response = self.client.post(url+'edit/', data)
        self.assertRedirects(response, url)
        self.course.refresh_from_db()
        self.assertEqual(self.course.title, 'Toán 10 mới')
        delete_url = url+'delete/'
        self.assertContains(self.client.get(delete_url), 'Xác nhận xóa')
        self.course.refresh_from_db()
        self.assertFalse(self.course.archived)  # GET cannot delete
        self.assertRedirects(self.client.post(delete_url, {'expected_revision':2}), '/workspace/')
        self.course.refresh_from_db()
        self.assertTrue(self.course.archived)

    def test_csrf_covers_patch_delete_and_restore(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        url = f'/api/curricula/{self.course.pk}/'
        for method in ['patch', 'delete']:
            self.assertEqual(getattr(client, method)(url, '{}', content_type='application/json').status_code, 403)
        self.assertEqual(client.post(url+'restore/', '{}', content_type='application/json').status_code, 403)

    def test_quick_start_with_deleted_subject_shows_recovery_message(self):
        self.api('delete', f'/api/curricula/{self.course.pk}/')
        self.api('delete', f'/api/subjects/{self.subject.pk}/')
        response = self.client.post('/workspace/', dict(action='quickstart', subject='toan', grade=10,
            school_year='2026-2027', book=''))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Hãy khôi phục môn')
        self.assertEqual(Curriculum.objects.count(), 1)

    def test_subject_html_edit_and_foreign_form_are_checked(self):
        url = f'/workspace/subjects/{self.subject.pk}/'
        self.assertContains(self.client.get(url), 'Sửa môn học')
        response = self.client.post(url+'edit/', {'name':'Toán học', 'code':'toan', 'expected_revision':1})
        self.assertRedirects(response, url)
        self.subject.refresh_from_db()
        self.assertEqual(self.subject.name, 'Toán học')
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(url+'edit/').status_code, 404)
        self.assertEqual(self.client.post(url+'delete/', {'expected_revision':2}).status_code, 404)

    def test_subject_labels_can_change_without_changing_competencies(self):
        from assessment.context import course_context
        before = course_context(self.course)['competencies']
        response = self.api('patch', f'/api/subjects/{self.subject.pk}/',
            {'name':'Toán học', 'code':'toan-hoc', 'expected_revision':1})
        self.assertEqual(response.status_code, 200)
        self.course.refresh_from_db()
        self.assertEqual(course_context(self.course)['competencies'], before)


class AssessmentCRUDTests(TestCase):
    def setUp(self):
        from django.core.management import call_command
        import io
        self.user = get_user_model().objects.create_user('crud_assessment')
        call_command('seed_subject_samples', owner=self.user.username, apply=True, stdout=io.StringIO())
        self.course = Curriculum.objects.get(workspace__owner=self.user, subject__code='toan')
        self.client.force_login(self.user)
        self.state = self.client.get(self.url('/api/state')).json()

    def url(self, path):
        return path+'?curriculum='+str(self.course.pk)

    def post(self, path, data):
        return self.client.post(self.url(path), data, content_type='application/json')

    def test_question_update_and_delete_preserve_saved_snapshots(self):
        q = self.state['bank']['questions'][0]
        original = self.state['revisions'][0]['questions'][0]['question']
        q['question'] += ' (đã sửa)'
        self.assertEqual(self.post('/api/questions/save', {'question':q}).status_code, 200)
        self.assertEqual(self.post('/api/questions/delete', {'id':q['id']}).status_code, 200)
        state = self.client.get(self.url('/api/state')).json()
        self.assertEqual(len(state['bank']['questions']), 23)
        self.assertEqual(state['revisions'][0]['questions'][0]['question'], original)

    def test_used_outcomes_cannot_be_removed_and_matrix_lessons_cannot_be_deleted(self):
        lesson = self.state['bank']['ppct']['lessons'][0]
        before = self.state['bank']
        response = self.post('/api/ppct/save-lesson', {'lesson':dict(lesson, outcomes=['Mục tiêu thay thế.'])})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.get(self.url('/api/state')).json()['bank'], before)
        for q in self.state['bank']['questions']:
            if q['lesson_code'] == lesson['lesson_code']:
                self.post('/api/questions/delete', {'id':q['id']})
        self.assertEqual(self.post('/api/ppct/delete-lesson', {'grade':10,'lesson_code':lesson['lesson_code']}).status_code, 409)

    def test_exam_edit_rejects_wrong_grade_and_invalid_points(self):
        import copy
        exam = self.state['exams'][0]
        for field, value in [('grade', 9), ('points', -1)]:
            qs = copy.deepcopy(exam['questions'])
            qs[0][field] = value
            self.assertEqual(self.post('/api/exams/update', {'id':exam['id'], 'questions':qs}).status_code, 400)
        self.assertEqual(self.post('/api/exams/update', {'id':exam['id'], 'title':''}).status_code, 400)
        self.assertEqual(self.post('/api/exams/update', {'id':exam['id'], 'duration':True}).status_code, 400)

    def test_revision_edit_rejects_wrong_grade_and_used_basis_cannot_be_deleted(self):
        import copy
        rev = self.state['revisions'][0]
        qs = copy.deepcopy(rev['questions']); qs[0]['grade'] = 9
        self.assertEqual(self.post('/api/revisions/update', {'id':rev['id'], 'questions':qs}).status_code, 400)
        self.assertEqual(self.post('/api/revisions/delete', {'id':rev['id']}).status_code, 409)
        self.assertEqual(self.post('/api/exams/delete', {'id':self.state['exams'][0]['id']}).status_code, 200)
        self.assertEqual(self.post('/api/revisions/delete', {'id':rev['id']}).status_code, 200)

    def test_exam_and_revision_can_be_edited_and_copied(self):
        exam = self.state['exams'][0]
        exam['questions'][0]['question'] += ' (bản đề đã chỉnh)'
        response = self.post('/api/exams/update', {'id':exam['id'], 'title':'Đề đã sửa', 'questions':exam['questions']})
        self.assertEqual(response.status_code, 200, response.content)
        duplicate = self.post('/api/exams/duplicate', {'id':exam['id']})
        self.assertEqual(duplicate.status_code, 200)
        rev = self.state['revisions'][0]
        self.assertEqual(self.post('/api/revisions/update', {'id':rev['id'], 'title':'Đề cương đã sửa'}).status_code, 200)
        self.assertEqual(self.post('/api/revisions/duplicate', {'id':rev['id']}).status_code, 200)
