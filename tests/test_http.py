import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from test_backend import fixture
try:
    from server import create_server
except ImportError:
    create_server=None


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(create_server,'HTTP server has not been implemented')
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.public=self.root/'public';self.public.mkdir()
        (self.public/'index.html').write_text('<h1>Local bank</h1>')
        self.bank=self.root/'canonical.json';self.bank.write_text(json.dumps(fixture()))
        self.templates=self.root/'templates.json';self.templates.write_text('{"templates":[]}')
        (self.public/'leak.json').symlink_to(self.bank)
        self.server=create_server(self.bank,self.root/'data',self.templates,self.public,port=0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.addCleanup(self.stop)
        self.port=self.server.server_address[1];self.origin=f'http://127.0.0.1:{self.port}'

    def stop(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=3)

    def call(self,path,method='GET',body=None,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
        h={'Origin':self.origin,'Content-Type':'application/json'};h.update(headers or {})
        c.request(method,path,json.dumps(body) if body is not None else None,h)
        r=c.getresponse();data=r.read();status=r.status;rh=dict(r.getheaders());c.close();return status,data,rh

    def test_state_and_static_available_without_exposing_bank_file(self):
        status,body,_=self.call('/api/state');self.assertEqual(status,200);self.assertEqual(len(json.loads(body)['bank']['questions']),16)
        self.assertEqual(self.call('/')[0],200)
        for path in ['/canonical.json','/data/bank.json','/../canonical.json','/%2e%2e/canonical.json','/leak.json','/tests/test_http.py']:
            self.assertEqual(self.call(path)[0],404,path)

    def test_cross_origin_and_nonlocal_host_cannot_mutate(self):
        before=self.bank.read_bytes()
        for headers in [{'Origin':'https://evil.example'},{'Origin':'null'},{'Host':'evil.example'},{'Origin':'http://localhost:9999'}]:
            status,body,_=self.call('/api/questions/archive','POST',{'id':'Q0'},headers)
            self.assertEqual(status,400);self.assertIn('error',json.loads(body))
        self.assertEqual(self.bank.read_bytes(),before)

    def test_api_archive_save_revision_generate_and_export_roundtrip(self):
        status,body,_=self.call('/api/revisions/save','POST',{'title':'Đề cương','grade':8,'question_ids':[f'Q{i}' for i in range(16)]})
        self.assertEqual(status,200);rev=json.loads(body)['revision']
        req=dict(title='Đề',grade=8,exam_type='TX',duration=45,revision_id=rev['id'],seed='a',blueprint=[dict(lesson_code='B1',type='MC',level='Biết',count=10,points_per_question=1)])
        status,body,_=self.call('/api/exams/generate','POST',req);self.assertEqual(status,200);exam=json.loads(body)['exam']
        for suffix in ['docx','html','json']:
            status,body,headers=self.call(f'/api/exams/{exam["id"]}/export?format={suffix}&answers=0')
            self.assertEqual(status,200);self.assertIn('attachment',headers['Content-Disposition']);self.assertNotIn(b'option_explanations',body)
        status,body,_=self.call(f'/api/revisions/{rev["id"]}/export?format=docx');self.assertEqual(status,200);self.assertTrue(body.startswith(b'PK'))
        status,body,_=self.call('/api/questions/archive','POST',{'id':'Q0'});self.assertEqual(status,200);self.assertEqual(json.loads(body)['bank']['questions'][0]['review_status'],'archived')

    def test_errors_have_json_details_and_no_static_directory_listing(self):
        status,body,_=self.call('/api/exams/generate','POST',{})
        self.assertEqual(status,400);self.assertIn('error',json.loads(body))
        status,body,_=self.call('/api/missing');self.assertEqual(status,404);self.assertIn('error',json.loads(body))
        (self.public/'empty').mkdir();self.assertEqual(self.call('/empty/')[0],404)

    def test_malformed_domain_fields_are_validation_errors_not_server_failures(self):
        q=fixture()['questions'][0];q['lesson_code']=[]
        status,body,_=self.call('/api/questions/save','POST',{'question':q})
        self.assertEqual(status,400);self.assertIn('error',json.loads(body))

if __name__=='__main__':unittest.main()


class AnswerAuditHttpTests(unittest.TestCase):
    """B2 trên máy cục bộ: tải đáp án được phép nhưng luôn ghi nhật ký; tài khoản không có quyền thì bị xóa đáp án."""

    def setUp(self):
        self.http = HttpTests('test_state_and_static_available_without_exposing_bank_file')
        self.http.setUp(); self.addCleanup(self.http.doCleanups)

    def test_bank_export_is_logged(self):
        status, _, _ = self.http.call('/api/bank/export')
        self.assertEqual(status, 200)
        log = (self.http.root/'data'/'nhat_ky_dap_an.jsonl').read_text(encoding='utf-8').strip().splitlines()
        self.assertEqual(json.loads(log[-1])['action'], 'answers_access')

    def test_redaction_removes_all_answer_fields(self):
        from domain.answer_access import redact_answers
        value = {'exams': [{'questions': [{'id': 'Q', 'options': ['a'], 'correct': 1, 'option_explanations': ['x'],
                                           'statements': [{'text': 't', 'correct': True}], 'rubric': [1], 'short_answer': '2'}]}],
                 'result': {'answer_grid': {'mc': {}}}}
        out = redact_answers(value)
        q = out['exams'][0]['questions'][0]
        self.assertEqual(q, {'id': 'Q', 'options': ['a'], 'statements': [{'text': 't'}]})
        self.assertEqual(out['result'], {})
