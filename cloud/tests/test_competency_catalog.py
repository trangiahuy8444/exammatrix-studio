"""Danh mục qua API dùng chung và kho Django."""
import copy
from django.contrib.auth import get_user_model
from django.test import TestCase
from workspace.models import Workspace, Subject, Curriculum
from assessment.legacy_storage import bank_for_user


class CompetencyCatalogAPITests(TestCase):
    def test_scoped_persistence_and_rejection(self):
        user = get_user_model().objects.create_user('catalog_teacher')
        workspace = Workspace.objects.create(owner=user)
        subject = Subject.objects.create(workspace=workspace, code='demo', name='Môn minh họa')
        course = Curriculum.objects.create(workspace=workspace, subject=subject, title='Minh họa 10', grade=10, school_year='2026-2027')
        self.client.force_login(user)
        query = f'?curriculum={course.pk}'
        self.assertEqual(self.client.get('/api/matrices/catalog'+query).json(), {'catalog':None})
        payload = dict(catalog=dict(competencies=[dict(code='DEMO',name='Năng lực minh họa')], indicators=[dict(code='I1',competency='DEMO',text='Chỉ báo minh họa')]), expected_revision=0)
        result = self.client.post('/api/matrices/catalog/save'+query, payload, content_type='application/json')
        self.assertEqual(result.status_code, 200, result.content)
        record = result.json()['catalog']
        self.assertEqual(record['subject_name'], subject.name)
        self.assertEqual(record['revision'], 1)
        self.assertEqual(self.client.get('/api/matrices/catalog'+query).json()['catalog'], record)
        before = copy.deepcopy(bank_for_user(user, course)._load_bank())
        self.assertEqual(self.client.post('/api/matrices/catalog/save'+query, payload, content_type='application/json').status_code,409)
        payload['expected_revision'] = 1
        payload['catalog']['indicators'][0]['competency'] = 'UNKNOWN'
        self.assertEqual(self.client.post('/api/matrices/catalog/save'+query, payload, content_type='application/json').status_code,400)
        self.assertEqual(bank_for_user(user, course)._load_bank(), before)
        self.assertEqual(self.client.get('/api/matrices/catalog').json(), {'catalog':None})

    def test_question_import_cannot_replace_database_catalog(self):
        from matrices.service import MatrixService
        user=get_user_model().objects.create_user('catalog_import_teacher')
        Workspace.objects.create(owner=user)
        self.client.force_login(user)
        bank=bank_for_user(user)
        saved=MatrixService(bank).save_catalog(dict(competencies=[dict(code='DEMO',name='Năng lực minh họa')],indicators=[dict(code='I1',competency='DEMO',text='Chỉ báo minh họa')]),0)
        for incoming in ({'questions':[]},{'questions':[],'competency_catalogs':[]}):
            response=self.client.post('/api/bank/import',dict(bank=incoming),content_type='application/json')
            self.assertEqual(response.status_code,200,response.content)
            self.assertEqual(self.client.get('/api/matrices/catalog').json()['catalog'],saved)
            self.assertEqual(bank_for_user(user)._load_bank()['competency_catalogs'],[saved])
