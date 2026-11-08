import io
import json
import unittest
from pathlib import Path
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.shared import Cm
from matrix_fixtures import bank_fixture,minimal_matrix
try:
    from matrices.exports import matrix_docx,matrix_html,export_matrix
except ImportError:
    matrix_docx=matrix_html=export_matrix=None


class MatrixExportsTests(unittest.TestCase):
    def setUp(self):self.assertIsNotNone(matrix_docx,'Matrix exports must be implemented')

    def test_specification_references_and_landscape_width(self):
        raw=matrix_docx(minimal_matrix(),bank_fixture()['ppct'],'specification')
        doc=Document(io.BytesIO(raw));row=doc.tables[0].rows[3]
        self.assertIn('(Câu 1).',row.cells[3].text)
        self.assertNotIn('Câu 1',' '.join(c.text for c in row.cells[4:]))
        self.assertEqual(doc.sections[0].orientation,WD_ORIENT.LANDSCAPE)
        self.assertLessEqual(sum(c.width for c in doc.tables[0].columns),Cm(24))
        self.assertTrue(all(r._tr.trPr.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tblHeader') is not None for r in doc.tables[0].rows[:3]))
        self.assertNotIn('S1',doc.tables[0].cell(3,3).text)
        self.assertIsNotNone(row._tr.trPr.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}cantSplit'))

    def test_matrix_numbers_and_html_are_escaped(self):
        m=minimal_matrix();m['requirements'][0]['text']='<img onerror=bad>'
        html=matrix_html(m,bank_fixture()['ppct']).decode()
        self.assertIn('&lt;img',html);self.assertNotIn('<img',html)
        self.assertIn('align="center"',html);self.assertIn('<colgroup>',html)
        doc=Document(io.BytesIO(matrix_docx(m,bank_fixture()['ppct'])))
        self.assertIn('(1)',doc.tables[0].cell(3,3).text)
        self.assertNotIn('(C1',str([c.text for t in doc.tables for r in t.rows for c in r.cells]))

    def test_received_thpt_draft_preserves_conflicting_source_tables(self):
        from matrices.import_docx import inspect_docx
        from server import DEFAULT_BANK
        if not DEFAULT_BANK.is_file():self.skipTest('Không có danh mục nguồn riêng của giáo viên.')
        ppct=json.loads(DEFAULT_BANK.read_text())['ppct']
        name='KHOI 10 - MA TRAN DE KIEM TRA GIUA KI 1- 2026-2027.docx'
        p=Path(__file__).resolve().parents[1]/'data/matrices/sources'/name
        if not p.is_file():
            p=Path.home()/'Downloads'/name
        if not p.is_file():self.skipTest('Không có Word nguồn riêng của giáo viên.')
        src_doc=Document(p);src_doc.tables[3].cell(9,8).text='3 ES (NLb)'
        buf=io.BytesIO();src_doc.save(buf)
        m=inspect_docx(buf.getvalue(),p.name,10,ppct)['candidate']
        raw,_,name=export_matrix(m,ppct,'docx')
        self.assertIn('NHAP',name)
        d=Document(io.BytesIO(raw));self.assertEqual(len(d.tables),4)
        self.assertIn('3 ES',d.tables[-1].cell(9,8).text)
        self.assertTrue(all(sum(c.width for c in t.columns)<=Cm(24) for t in d.tables))
        raw_html,_,_=export_matrix(m,ppct,'html','all','raw')
        web_html,_,_=export_matrix(m,ppct,'html','all','web')
        self.assertIn('3 ES',raw_html.decode())
        self.assertIn('(Câu 1a, Câu 1b, Câu 1c).',web_html.decode())

    def test_section_and_format_validation(self):
        from bank_service import ServiceError
        for fmt,section in [('xlsx','all'),('docx','bad'),('docx','competencies')]:
            with self.assertRaises(ServiceError):export_matrix(minimal_matrix(),bank_fixture()['ppct'],fmt,section)

    def test_short_allocation_is_visible_in_matrix_columns(self):
        m=minimal_matrix();m['profile']='THPT';m['slots'][0]['kind']='SHORT';m['slots'][0]['parts'][0]['indicator']='AC1'
        m['indicator_catalog']=[dict(code='AC1',competency='NLa',text='Dữ liệu')]
        doc=Document(io.BytesIO(matrix_docx(m,bank_fixture()['ppct'],'matrix')))
        t=doc.tables[0];self.assertEqual(len(t.columns),19)
        self.assertIn('Trả lời ngắn',' '.join(c.text for c in t.rows[1].cells))
        self.assertIn('(1)',t.cell(3,9).text)

    def test_long_specification_keeps_all_references_without_recounting_continuations(self):
        import copy
        m=minimal_matrix();m['requirements']=[];m['slots']=[]
        for i in range(1,26):
            r=dict(id=f'R{i}',lesson_code='B1',level='Biết',text=('Nhận biết các thành phần dữ liệu và giải thích ví dụ tương ứng. '*3)+str(i),ppct_outcome_index=0,competency='NLa',choice_group=None)
            m['requirements'].append(r)
            m['slots'].append(dict(id=f'S{i}',kind='MC',number=i,parts=[dict(id=f'P{i}',label='',requirement_id=r['id'],points=.4,indicator='')],scoring=dict(mode='sum_parts')))
        t=Document(io.BytesIO(matrix_docx(m,bank_fixture()['ppct'],'specification'))).tables[0]
        text=' '.join(c.text for row in t.rows for c in row.cells)
        for i in range(1,26):self.assertEqual(text.count(f'(Câu {i}).'),1)
        self.assertEqual(text.count('25 MC'),1)
        self.assertGreater(len(t.rows),7)
        self.assertTrue(all(row._tr.trPr.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}cantSplit') is not None for row in t.rows[3:]))
