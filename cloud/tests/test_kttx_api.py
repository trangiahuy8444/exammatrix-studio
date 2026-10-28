"""Mốc B8: hoạt động KTTX lưu theo tài khoản (LegacyState 'kttx') và có bảng tổng quan theo TT 22/2021, Điều 6."""
import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from workspace.models import Workspace


class KttxApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('gv_kttx')
        Workspace.objects.create(owner=self.user)
        self.client.force_login(self.user)

    def post(self, path, body):
        return self.client.post(path, json.dumps(body), content_type='application/json')

    def test_save_list_and_overview(self):
        r = self.post('/api/kttx/save', {'activity': dict(grade=10, semester=1, k=1, form='thuc_hanh', max_score='20',
                                                          recorded=True)})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['activity']['title'], 'Tin 10_Kiểm tra thường xuyên 1 - HK I')
        state = self.client.get('/api/kttx').json()
        row = next(x for x in state['overview'] if x['grade'] == 10 and x['semester'] == 1)
        self.assertEqual((row['periods_per_year'], row['required'], row['recorded']), (70, 3, 1))
        self.assertEqual(len(state['activities']), 1)

    def test_invalid_form_is_400(self):
        r = self.post('/api/kttx/save', {'activity': dict(grade=8, semester=1, k=1, form='hat', max_score='10')})
        self.assertEqual(r.status_code, 400)
