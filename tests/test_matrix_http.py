import json
import tempfile
import threading
import unittest
from pathlib import Path
from server import create_server
from matrix_fixtures import bank_fixture,minimal_matrix,confirmation
import test_http as http_helpers


class MatrixHttpTests(unittest.TestCase):
    call=http_helpers.HttpTests.call
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        bank=self.root/'bank.json';bank.write_text(json.dumps(bank_fixture()))
        public=self.root/'public';public.mkdir();(public/'index.html').write_text('Local')
        self.server=create_server(bank,self.root/'data',public_dir=public,port=0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.addCleanup(self.stop);self.port=self.server.server_address[1];self.origin=f'http://127.0.0.1:{self.port}'

    def stop(self):self.server.shutdown();self.server.server_close();self.thread.join(timeout=2)

    def test_matrix_roundtrip_and_export_over_http(self):
        status,body,_=self.call('/api/matrices/save','POST',dict(matrix=minimal_matrix(),expected_revision=0))
        self.assertEqual(status,200);m=json.loads(body)['matrix']
        status,body,_=self.call('/api/matrices/lock','POST',dict(id=m['id'],expected_revision=m['revision'],confirmation=confirmation()))
        self.assertEqual(status,200)
        for fmt in ('html','docx','json'):
            status,body,headers=self.call(f'/api/matrices/{m["id"]}/export?format={fmt}')
            self.assertEqual(status,200);self.assertIn('attachment',headers['Content-Disposition'])
        status,body,_=self.call('/api/state');self.assertEqual(len(json.loads(body)['matrices']),1)

    def test_unsafe_origin_bad_base64_and_source_path_cannot_be_used(self):
        self.assertEqual(self.call('/api/matrices/save','POST',dict(matrix=minimal_matrix(),expected_revision=0),{'Origin':'https://evil.example'})[0],400)
        self.assertEqual(self.call('/api/matrices/inspect-docx','POST',dict(filename='a.docx',grade=9,content_base64='wrong!'))[0],400)
        self.assertEqual(self.call('/data/matrices/sources/private.docx')[0],404)
        self.assertEqual(self.call('/api/matrices/missing')[0],404)
