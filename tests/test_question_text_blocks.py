"""Bảo toàn mã nguồn và bảng dữ liệu tự soạn trong thân câu hỏi."""
import copy
import io
import unittest
from html.parser import HTMLParser
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from docx import Document
from docx.shared import Cm

from exports import export_document

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
RICH = ('Đọc đoạn mã và bảng:\n```python\ns = 0\nfor i in range(3):\n    s += i\n\nprint(s)\n```\n'
        '| i | s |\n| --- | :---: |\n| 0 | 0 |\n| 1 | 1 |\n'
        'a) Giải thích kết quả.')


def record(text):
    return dict(title='Đề giữa kỳ tự soạn', subject_name='Tin học', grade=9, duration=45,
                exam_type='GK1', school_profile=False, questions=[dict(type='ES', question=text,
                slot_number=3, points=1, max_score=1, rubric=[dict(criterion='BÍ MẬT RUBRIC', points=1)],
                equivalent_answer_policy='BÍ MẬT CHẤM')])


def document(text, **flags):
    return Document(io.BytesIO(export_document(record(text), 'docx', **flags)[0]))


class QuestionTextBlockTests(unittest.TestCase):
    def test_plain_code_indentation_and_blank_lines_survive_without_monospace(self):
        text = '    s = 0\nfor i in range(3):\n    s += i\n\n\tprint(s)'
        doc = document(text)
        paragraphs = doc.paragraphs
        self.assertTrue(any(p.text == 'Câu 3 (1 điểm).     s = 0' for p in paragraphs))
        self.assertIn('    s += i', [p.text for p in paragraphs])
        self.assertIn('\tprint(s)', [p.text for p in paragraphs])
        self.assertTrue(any(p.text == '' for p in paragraphs))
        self.assertFalse(any(r.font.name == 'Courier New' for p in paragraphs for r in p.runs))
        html = export_document(record(text), 'html')[0].decode()
        self.assertIn('    s += i', html)
        self.assertIn('\tprint(s)', html)

    def test_fenced_code_and_native_table_in_student_teacher_and_revision_word(self):
        for flags in ({}, {'answers': True}, {'revision': True}):
            with self.subTest(flags=flags):
                doc = document(RICH, **flags)
                text = '\n'.join(p.text for p in doc.paragraphs)
                self.assertIn('Câu 3 (1 điểm). Đọc đoạn mã và bảng:', text)
                self.assertNotIn('```', text)
                code = next(p for p in doc.paragraphs if p.text.startswith('s = 0\n'))
                self.assertEqual(code.text, 's = 0\nfor i in range(3):\n    s += i\n\nprint(s)')
                self.assertTrue(all(r.font.name == 'Courier New' for r in code.runs))
                table = next(t for t in doc.tables if [c.text for c in t.rows[0].cells] == ['i', 's'])
                self.assertEqual([[c.text for c in row.cells] for row in table.rows], [['i','s'], ['0','0'], ['1','1']])
                self.assertLessEqual(sum(c.width for c in table.columns), Cm(24))
                self.assertTrue(table.rows[0]._tr.xpath('./w:trPr/w:tblHeader'))
                self.assertTrue(all(r.font.name == 'Times New Roman' for row in table.rows for c in row.cells for p in c.paragraphs for r in p.runs))
                self.assertIn('a) Giải thích kết quả.', text)
        raw = export_document(record(RICH), 'docx')[0]
        with ZipFile(io.BytesIO(raw)) as archive:
            root = ET.fromstring(archive.read('word/document.xml'))
        self.assertTrue(any(t.text == '    s += i' and t.get('{http://www.w3.org/XML/1998/namespace}space') == 'preserve' for t in root.findall('.//w:t', NS)))

    def test_html_uses_safe_code_and_table_for_each_artifact(self):
        for flags in ({}, {'answers': True}, {'revision': True}):
            with self.subTest(flags=flags):
                html = export_document(record(RICH), 'html', **flags)[0].decode()
                self.assertIn('<pre><code>s = 0\nfor i in range(3):\n    s += i\n\nprint(s)</code></pre>', html)
                self.assertIn('<table class="question-table"><thead><tr><th>i</th><th>s</th></tr></thead>', html)
                self.assertIn('<td>1</td><td>1</td>', html)
                self.assertNotIn('```', html)
                self.assertIn('Câu 3', html)

    def test_html_payload_never_becomes_markup(self):
        payload = '<script>alert("x")</script>'
        rich = f'{payload}\n```html\n{payload}\n```\n| A | B |\n| --- | --- |\n| {payload} | & |'
        html = export_document(record(rich), 'html')[0].decode()
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)
        self.assertIn('<pre><code>&lt;script&gt;', html)
        self.assertIn('<td>&lt;script&gt;', html)
        self.assertIn('<td>&amp;</td>', html)

    def test_incomplete_or_unrecognized_blocks_remain_literal(self):
        cases = ['A | B\nvaleur | texte', '| A | B |\n| -- | --- |\n| 1 | 2 |',
                 '| A | B |\n| --- | --- |', '| A | B |\n| --- | --- |\n| 1 | 2 | 3 |',
                 '```python\n    x = 1\n| A | B |\n| --- | --- |\n| 1 | 2 |',
                 '```language with spaces\n    x = 1\n```']
        for text in cases:
            with self.subTest(text=text):
                doc = document(text)
                self.assertFalse(doc.tables)
                visible = '\n'.join(p.text for p in doc.paragraphs)
                for line in text.splitlines():
                    self.assertIn(line, visible)
                html = export_document(record(text), 'html')[0].decode()
                self.assertNotIn('<pre>', html)
                self.assertNotIn('class="question-table"', html)
                for line in text.splitlines():
                    self.assertIn(line, html)

    def test_code_or_table_as_first_block_keeps_question_number(self):
        for text in ('```python\n    x = 1\n```', '| A | B |\n| --- | --- |\n| 1 | 2 |'):
            with self.subTest(text=text):
                self.assertTrue(any(p.text == 'Câu 3 (1 điểm). ' for p in document(text).paragraphs))
                html = export_document(record(text), 'html')[0].decode()
                self.assertIn('<strong>Câu 3 (1 điểm).</strong>', html)
                self.assertNotIn('<p><pre>', html)

    def test_student_redaction_and_source_are_unchanged(self):
        source = record(RICH)
        before = copy.deepcopy(source)
        for fmt in ('docx', 'html'):
            raw = export_document(source, fmt)[0]
            if fmt == 'docx':
                with ZipFile(io.BytesIO(raw)) as archive:
                    visible = '\n'.join(archive.read(name).decode('utf-8', 'ignore') for name in archive.namelist() if name.endswith('.xml'))
            else:
                visible = raw.decode()
            self.assertNotIn('BÍ MẬT', visible)
        self.assertEqual(source, before)

    def test_three_ordinary_text_lines_and_hanging_subparts_keep_existing_layout(self):
        text = 'Câu hỏi thường.\na) Ý một.\nb) Ý hai.'
        doc = document(text)
        self.assertIn('Câu 3 (1 điểm). Câu hỏi thường.', [p.text for p in doc.paragraphs])
        for prefix in ('a)', 'b)'):
            p = next(p for p in doc.paragraphs if p.text.startswith(prefix))
            self.assertGreater(p.paragraph_format.left_indent, 0)
            self.assertLess(p.paragraph_format.first_line_indent, 0)
        html = export_document(record(text), 'html')[0].decode()
        self.assertIn('margin-left:2em;text-indent:-1.3em">a) Ý một.', html)
