import io
import zipfile
import unittest
from pathlib import Path
from matrix_fixtures import MatrixFixture
from bank_service import ServiceError
try:
    from matrices.import_docx import inspect_docx
except ImportError:
    inspect_docx=None


class MatrixImportTests(MatrixFixture,unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(inspect_docx,'DOCX import must be implemented')
        self.setup_services()
        from server import DEFAULT_BANK
        import json
        if not DEFAULT_BANK.is_file():
            self.skipTest('Cần danh mục và tệp nguồn riêng ở máy chủ dự án; không đưa dữ liệu giáo viên lên GitHub.')
        self.catalog=json.loads(DEFAULT_BANK.read_text())['ppct']

    def source(self,grade):
        name=f'KHOI {grade} - MA TRAN DE KIEM TRA GIUA KI 1- 2026-2027.docx'
        local=Path(__file__).resolve().parents[1]/'data/matrices/sources'/name
        if local.is_file():return local
        fallback=Path.home()/'Downloads'/name
        if not fallback.is_file():self.skipTest('Không có tệp Word nguồn riêng cho ca tích hợp này.')
        return fallback

    def test_grade9_recognizes_cognitive_level_specification_header(self):
        p=self.source(9);r=inspect_docx(p.read_bytes(),p.name,9,self.catalog)
        m=r['candidate']
        self.assertEqual(len(r['raw_tables']),2)
        self.assertEqual(sum(s['kind']=='MC' for s in m['slots']),28)
        self.assertEqual(sum(s['kind']=='ES' for s in m['slots']),3)
        self.assertFalse(r['issues'])
        self.assertTrue(all(l['lesson_code'] for l in m['lessons']))

    def test_grade8_extracts_only_matrix_and_specification(self):
        p=self.source(8);r=inspect_docx(p.read_bytes(),p.name,8,self.catalog)
        m=r['candidate']
        self.assertEqual(len(r['raw_tables']),2)
        self.assertEqual(sum(s['kind']=='MC' for s in m['slots']),28)
        self.assertEqual(sum(s['kind']=='ES' for s in m['slots']),3)
        self.assertFalse(m['reconciliation']['confirmed'])
        self.assertNotIn('ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM',str(r['raw_tables']))
        self.assertTrue(any(c['vmerge']=='continue' for t in r['raw_tables'] for row in t['rows'] for c in row['cells']))

    def test_grade10_verified_three_essay_lessons_and_detects_9_vs_12_conflict(self):
        from docx import Document
        p=self.source(10);r=inspect_docx(p.read_bytes(),p.name,10,self.catalog)
        self.assertEqual(len(r['raw_tables']),4)
        self.assertFalse(r['issues'])
        self.assertEqual(sum(s['kind']=='YN' for s in r['candidate']['slots']),3)
        es_slots=[s for s in r['candidate']['slots'] if s['kind']=='ES']
        self.assertEqual(len(es_slots),3)
        self.assertEqual(sum(len(s['parts']) for s in es_slots),9)
        req_by_id={req['id']:req for req in r['candidate']['requirements']}
        es_lessons=[req_by_id[s['parts'][0]['requirement_id']]['lesson_code'] for s in es_slots]
        self.assertEqual(es_lessons,['B1','B8','B12'])
        self.assertTrue(any(i['code']=='CI1' for i in r['candidate']['indicator_catalog']))
        d=Document(p);d.tables[3].cell(9,8).text='3 ES (NLb)'
        buf=io.BytesIO();d.save(buf)
        r_conflict=inspect_docx(buf.getvalue(),p.name,10,self.catalog)
        self.assertIn('source_essay_disagreement',[i['code'] for i in r_conflict['issues']])

    def test_bad_zip_wrong_grade_and_zip_bomb_rejected(self):
        with self.assertRaises(ServiceError):inspect_docx(b'broken','a.docx',8,self.catalog)
        p=self.source(8)
        with self.assertRaises(ServiceError):inspect_docx(p.read_bytes(),p.name,10,self.catalog)
        raw=io.BytesIO()
        with zipfile.ZipFile(raw,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('../word/document.xml','x')
        with self.assertRaises(ServiceError):inspect_docx(raw.getvalue(),'bad.docx',8,self.catalog)

    def test_accept_reparses_and_source_content_cannot_be_overwritten(self):
        p=self.source(8);raw=p.read_bytes();r=inspect_docx(raw,p.name,8,self.catalog)
        received=self.matrices.accept_import(r['candidate'],{},raw,p.name,8,ppct=self.catalog)
        self.assertEqual(received['mode'],'received')
        changed=dict(received);import copy;changed=copy.deepcopy(received)
        changed['requirements'][0]['text']='Thay chuẩn cần đạt'
        with self.assertRaises(ServiceError):self.matrices.save_draft(changed,received['revision'])

    def test_mc_count_and_declared_totals_disagreements_are_detected(self):
        from docx import Document
        for spec_count in (True,False):
            d=Document(self.source(8))
            if spec_count:d.tables[1].cell(3,4).text='5 MC (B) (NLa)\n3 MC (H) (NLa)'
            else:d.tables[0].cell(8,3).text='17'
            buf=io.BytesIO();d.save(buf)
            r=inspect_docx(buf.getvalue(),'modified.docx',8,self.catalog)
            self.assertTrue(r['issues'])
            self.assertIn('source_count_disagreement',[i['code'] for i in r['issues']])
