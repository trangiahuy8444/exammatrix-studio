"""Quy tắc trang chung áp dụng cho mọi bản Word của hồ sơ giả."""
import io
import unittest
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.shared import Cm
from exports import export_document, export_mapping_docx, export_answer_grid_docx
from test_word_layout import record

class ExportPageRulesTests(unittest.TestCase):
    def test_all_word_variants_use_landscape_and_school_margins(self):
        variants = {
            'student': export_document(record(), 'docx')[0],
            'teacher': export_document(record(), 'docx', answers=True)[0],
            'revision': export_document(record(), 'docx', revision=True)[0],
            'lms': export_document(record(), 'docx', target='lms')[0],
            'mapping': export_mapping_docx([], ['101']),
            'grid': export_answer_grid_docx({'codes':['101'], 'mc': {'1': {'101':'A'}}}),
        }
        for kind, raw in variants.items():
            with self.subTest(kind=kind):
                doc=Document(io.BytesIO(raw))
                for section in doc.sections:
                    self.assertEqual(section.orientation, WD_ORIENT.LANDSCAPE)
                    self.assertAlmostEqual(section.page_width.cm, 29.7, places=2)
                    self.assertAlmostEqual(section.page_height.cm, 21, places=2)
                    self.assertAlmostEqual(section.top_margin.cm, 1, places=2)
                    self.assertAlmostEqual(section.bottom_margin.cm, 1, places=2)
                    self.assertAlmostEqual(section.left_margin.cm, 1.5, places=2)
                    self.assertAlmostEqual(section.right_margin.cm, 1, places=2)
                for table in doc.tables:
                    self.assertLessEqual(sum(col.width for col in table.columns), Cm(24)+Cm(.01))

    def test_revision_banner_does_not_repeat_as_tall_word_header(self):
        doc=Document(io.BytesIO(export_document(record(), 'docx', revision=True)[0]))
        self.assertTrue(doc.inline_shapes)
        self.assertFalse(doc.sections[0].header._element.xpath('.//wp:extent'))

    def test_footer_has_no_inherited_stop_before_page_right_edge(self):
        doc=Document(io.BytesIO(export_document(record(), 'docx')[0]))
        paragraph=doc.sections[0].footer.paragraphs[0]
        self.assertFalse(list(paragraph.style.paragraph_format.tab_stops))
        right=doc.sections[0].page_width-doc.sections[0].left_margin-doc.sections[0].right_margin
        self.assertAlmostEqual(list(paragraph.paragraph_format.tab_stops)[0].position.cm, right/360000, places=2)
