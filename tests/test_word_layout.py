"""Góp ý nghiệm thu mốc A (26/10/2026):
- PDF xuất từ chính tệp Word (Microsoft Word), để PDF và Word giống nhau.
- Logo đề cương nhỏ hơn; bảng giới hạn kiến thức bỏ cột "Mục tiêu bài học".
- Câu tự luận: ý a), b) thụt treo; hướng dẫn chấm tách gạch đầu dòng, thụt hàng.
"""
import io
import os
import unittest
from unittest.mock import patch

import docx
from docx.shared import Emu

import pdf_build
from bank_service import ServiceError
from exports import export_document, rubric_lines

ES_TEXT = ('Một thẻ nhớ có dung lượng 16 GB.\n'
           'a) Đổi 16 GB sang MB.\n'
           'b) Thẻ nhớ lưu được bao nhiêu ảnh 8 MB?')
RUBRIC = ('Hai loại giấy tờ điện tử và lợi ích:- Hai loại giấy tờ: Căn cước gắn chip; Bảo hiểm y tế điện tử. (0,5 đ)'
          '- Lợi ích: thuận tiện khi làm thủ tục. (0,5 đ)')
NESTED = ('Ứng xử văn hóa:- a) Hành động của Hùng: + Từ chối lời xúi giục. (0,25 đ) + Báo cho An biết. (0,25 đ)'
          '- b) Vi phạm quy định: + Xâm phạm quyền riêng tư. (0,5 đ)')


def record(**kw):
    qs = [dict(id='M1', type='MC', slot_number=1, points=0.25, lesson_code='B1', lesson_name='Bài 1', topic_source='Chủ đề 1',
               learning_outcome='Biết dữ liệu.', question='Câu hỏi?', options=['Một', 'Hai', 'Ba', 'Bốn'], correct=1,
               option_explanations=['a', 'b', 'c', 'd']),
          dict(id='E1', type='ES', slot_number=1, points=1.0, max_score=1.0, lesson_code='B1', lesson_name='Bài 1',
               topic_source='Chủ đề 1', learning_outcome='Vận dụng.', question=ES_TEXT,
               rubric=[dict(criterion=RUBRIC, points=1.0)])]
    base = dict(title='Đề', grade=8, exam_type='GK1', duration=45, total_points=10, school_year='2026 - 2027',
                exam_code='101', questions=qs)
    base.update(kw)
    return base


def paragraphs(raw):
    d = docx.Document(io.BytesIO(raw))
    out = list(d.paragraphs)
    for t in d.tables:
        for row in t.rows:
            for c in row.cells:
                out.extend(c.paragraphs)
    return d, out


class RubricLinesTests(unittest.TestCase):
    def test_flat_rubric_is_split_into_heading_and_bullets(self):
        self.assertEqual(rubric_lines(RUBRIC), [
            (0, 'Hai loại giấy tờ điện tử và lợi ích:'),
            (1, 'Hai loại giấy tờ: Căn cước gắn chip; Bảo hiểm y tế điện tử. (0,5 đ)'),
            (1, 'Lợi ích: thuận tiện khi làm thủ tục. (0,5 đ)')])

    def test_nested_plus_items(self):
        self.assertEqual(rubric_lines(NESTED), [
            (0, 'Ứng xử văn hóa:'),
            (1, 'a) Hành động của Hùng:'), (2, 'Từ chối lời xúi giục. (0,25 đ)'), (2, 'Báo cho An biết. (0,25 đ)'),
            (1, 'b) Vi phạm quy định:'), (2, 'Xâm phạm quyền riêng tư. (0,5 đ)')])

    def test_plain_text_and_math_plus_untouched(self):
        self.assertEqual(rubric_lines('Tính đúng 1 + 2 = 3 và in kết quả.'), [(0, 'Tính đúng 1 + 2 = 3 và in kết quả.')])
        self.assertEqual(rubric_lines('Dùng C++ - viết đúng.'), [(0, 'Dùng C++ - viết đúng.')])


class EssayLayoutTests(unittest.TestCase):
    def test_subparts_are_own_paragraphs_with_hanging_indent(self):
        _, ps = paragraphs(export_document(record(), 'docx')[0])
        sub = [p for p in ps if p.text.startswith('a) Đổi 16 GB')]
        self.assertEqual(len(sub), 1)
        fmt = sub[0].paragraph_format
        self.assertGreater(fmt.left_indent, 0)
        self.assertLess(fmt.first_line_indent, 0)  # thụt treo: chữ dòng 2 thẳng sau "a) "
        self.assertTrue(any(p.text.startswith('b) Thẻ nhớ') for p in ps))
        self.assertFalse(any('\na)' in p.text for p in ps))

    def test_teacher_answer_rubric_bullets_are_separate_indented_lines(self):
        _, ps = paragraphs(export_document(record(), 'docx', answers=True)[0])
        bullets = [p for p in ps if p.text.startswith('– Lợi ích: thuận tiện')]
        self.assertTrue(bullets)
        self.assertTrue(all(p.paragraph_format.first_line_indent is not None and p.paragraph_format.first_line_indent < 0
                            for p in bullets))
        self.assertFalse(any(':- ' in p.text or ')- ' in p.text for p in ps))


class ReviewGuideTests(unittest.TestCase):
    def test_scope_table_has_three_columns_without_goals(self):
        d, ps = paragraphs(export_document(record(), 'docx', revision=True)[0])
        scope = next(t for t in d.tables if t.rows[0].cells[0].text == 'STT')
        self.assertEqual([c.text for c in scope.rows[0].cells], ['STT', 'Tên chủ đề', 'Tên bài'])
        self.assertNotIn('Mục tiêu', '\n'.join(p.text for p in ps))

    def test_logo_is_smaller(self):
        d = docx.Document(io.BytesIO(export_document(record(), 'docx', revision=True)[0]))
        shapes = d.element.xpath('.//wp:extent')
        self.assertTrue(shapes)
        width_cm = Emu(int(shapes[0].get('cx'))).cm
        self.assertLess(width_cm, 16.0)
        self.assertGreater(width_cm, 10.0)

    def test_html_scope_table_has_no_goals_column(self):
        html = export_document(record(), 'html', revision=True)[0].decode()
        self.assertNotIn('Mục tiêu bài học', html)


class PdfFromWordTests(unittest.TestCase):
    def test_pdf_is_converted_from_the_same_docx(self):
        with patch('pdf_build.docx_to_pdf', return_value=b'%PDF-fake') as conv:
            raw, mime, name = export_document(record(), 'pdf', answers=True)
        self.assertEqual(raw, b'%PDF-fake')
        self.assertEqual(mime, 'application/pdf')
        self.assertTrue(name.endswith('.pdf'))
        sent = conv.call_args[0][0]
        self.assertEqual(sent[:2], b'PK')  # chính là tệp Word
        self.assertIn('Lợi ích: thuận tiện', '\n'.join(p.text for p in paragraphs(sent)[1]))

    def test_no_word_means_clear_400(self):
        with patch('pdf_build.find_word', return_value=None):
            with self.assertRaises(ServiceError) as ctx:
                pdf_build.docx_to_pdf(b'PK')
        self.assertEqual(ctx.exception.status, 400)
        self.assertIn('Microsoft Word', str(ctx.exception))


@unittest.skipUnless(os.environ.get('WORD_PDF_TESTS') == '1' and pdf_build.find_word(),
                     'đặt WORD_PDF_TESTS=1 trên máy có Microsoft Word để chạy')
class RealWordConversionTests(unittest.TestCase):
    def test_converts_with_vietnamese_text(self):
        import subprocess
        import tempfile
        pdf = pdf_build.docx_to_pdf(export_document(record(), 'docx')[0])
        self.assertTrue(pdf.startswith(b'%PDF'))
        with tempfile.NamedTemporaryFile(suffix='.pdf') as f:
            f.write(pdf); f.flush()
            text = subprocess.run(['pdftotext', f.name, '-'], capture_output=True, text=True).stdout
        self.assertIn('Đổi 16 GB sang MB', text)


if __name__ == '__main__':
    unittest.main()


class AnswerPartNumberingTests(unittest.TestCase):
    def test_parts_numbered_by_present_kinds(self):
        _, ps = paragraphs(export_document(record(), 'docx', answers=True)[0])
        texts = [p.text for p in ps]
        self.assertIn('PHẦN I. ĐÁP ÁN TRẮC NGHIỆM KHÁCH QUAN', texts)
        self.assertIn('PHẦN II. HƯỚNG DẪN CHẤM VÀ THANG ĐIỂM TỰ LUẬN', texts)
        self.assertNotIn('PHẦN IV. HƯỚNG DẪN CHẤM VÀ THANG ĐIỂM TỰ LUẬN', texts)

    def test_review_banner_not_followed_by_repeated_school_name(self):
        _, ps = paragraphs(export_document(record(), 'docx', revision=True)[0])
        self.assertFalse(any(p.text.startswith('TRƯỜNG TH, THCS VÀ THPT QUỐC TẾ Á CHÂU') for p in ps))
