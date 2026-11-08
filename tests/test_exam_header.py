"""Mốc A4: tiêu đề đề thi khớp mẫu GK1 đã nộp (06_Kiem_tra_va_Danh_gia/00_Ho_so_nop_Giua_HK1)."""
import io
import unittest
import zipfile

from exports import export_document
from latex_generator import exam_heading, generate_exam_latex


def record(**kw):
    r = dict(title='Đề thử', grade=9, exam_type='GK1', duration=45, total_points=10, school_year='2026 - 2027',
             questions=[dict(id='Q1', type='MC', question='Câu một?', options=['A1', 'B1', 'C1', 'D1'], correct=0,
                             option_explanations=['', '', '', ''], points=10, slot_number=1, lesson_code='B1',
                             level='Biết')])
    r.update(kw)
    return r


def docx_xml(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        return z.read('word/document.xml').decode('utf-8')


class ExamHeadingTests(unittest.TestCase):
    def test_periodic_heading_matches_approved_template(self):
        self.assertEqual(exam_heading('GK1'), 'ĐỀ KIỂM TRA ĐỊNH KÌ GIỮA HỌC KÌ 1')
        self.assertEqual(exam_heading('CK1'), 'ĐỀ KIỂM TRA ĐỊNH KÌ CUỐI HỌC KÌ 1')
        self.assertEqual(exam_heading('CK2'), 'ĐỀ KIỂM TRA ĐỊNH KÌ CUỐI HỌC KÌ 2')

    def test_regular_assessment_heading(self):
        self.assertEqual(exam_heading('TX'), 'ĐỀ KIỂM TRA THƯỜNG XUYÊN')


class StudentDocxHeaderTests(unittest.TestCase):
    def test_header_block_like_approved_exam(self):
        xml = docx_xml(export_document(record(exam_code='101'), 'docx')[0])
        for needle in ('SỞ GIÁO DỤC VÀ ĐÀO TẠO', 'TRƯỜNG TH, THCS VÀ THPT', 'ĐỀ CHÍNH THỨC', '(MÃ ĐỀ: 101)',
                       'ĐỀ KIỂM TRA ĐỊNH KÌ GIỮA HỌC KÌ 1', 'NĂM HỌC 2026 - 2027', 'Đề thi có', 'NUMPAGES',
                       'MÔN: TIN HỌC - KHỐI 9'):
            self.assertIn(needle, xml)
        self.assertNotIn('HỌC KỲ', xml)

    def test_no_exam_code_line_without_code(self):
        self.assertNotIn('MÃ ĐỀ', docx_xml(export_document(record(), 'docx')[0]))


class LatexHeaderTests(unittest.TestCase):
    def test_latex_uses_same_heading_and_code(self):
        tex = generate_exam_latex(record(exam_code='102'))
        self.assertIn('ĐỀ KIỂM TRA ĐỊNH KÌ GIỮA HỌC KÌ 1', tex)
        self.assertIn('(MÃ ĐỀ: 102)', tex)
        self.assertIn(r'Đề thi có \pageref{LastPage} trang', tex)


    def test_each_question_reserves_space_for_its_options(self):
        import re
        tex = generate_exam_latex(record(questions=[
            dict(id=f'Q{i}', type='MC', question=f'Câu số {i}?', options=['A', 'B', 'C', 'D'], correct=0,
                 option_explanations=['', '', '', ''], points=0.25, slot_number=i) for i in range(1, 4)]))
        self.assertIn(r'\usepackage{needspace}', tex)
        blocks = re.findall(r'(\\needspace\{\d+\\baselineskip\}\s*)?\\noindent\\textbf\{Câu \d', tex)
        self.assertEqual(len(blocks), 3)
        self.assertTrue(all(blocks), 'mỗi câu phải có \\needspace ngay trước')


if __name__ == '__main__':
    unittest.main()
