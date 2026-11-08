"""Mốc A5: kiểm thử bản xuất theo 3 tầng.

Tầng 1 (dữ liệu) nằm ở các test bank_service. File này kiểm:
- Tầng 2 (cấu trúc): đọc ngược Word, LMS, LaTeX; đủ câu, đủ phương án, đúng thứ tự, đúng đáp án.
- Tầng 3 (hiển thị): biên dịch PDF thật (nếu máy có XeLaTeX), font nhúng, chữ tiếng Việt có dấu, log sạch.
Bộ mẫu có ký tự đặc biệt LaTeX/HTML, mã Python/C++ và công thức.
"""
import io
import re
import shutil
import subprocess
import tempfile
import unicodedata
import unittest
import zipfile
from pathlib import Path

import docx

from exports import export_document
from latex_generator import generate_exam_latex

SPECIAL = 'Tính 50% & lợi nhuận $x_1 + y_2 = {3}#; so sánh a < b > c ~ ^ \\ hết.'
CODE = 'for i in range(3): print(i)  # Python; C++: cout << i << endl;'
FORMULA = 'Giá trị của $x^2$ khi $x = 3$ là bao nhiêu?'


def exam():
    qs = [
        dict(id='M1', type='MC', slot_number=1, points=0.25, level='Biết', lesson_code='B1',
             question=SPECIAL, options=['Lựa chọn một', 'Lựa chọn hai', 'Lựa chọn ba', 'Lựa chọn bốn'], correct=2,
             option_explanations=['g1', 'g2', 'g3', 'g4']),
        dict(id='M2', type='MC', slot_number=2, points=0.25, level='Hiểu', lesson_code='B1',
             question='Đoạn mã sau in ra gì? ' + CODE, options=['0 1 2', '1 2 3', '0 1', 'Lỗi'], correct=0,
             option_explanations=['h1', 'h2', 'h3', 'h4']),
        dict(id='Y1', type='YN', slot_number=1, points=1.0, level='Hiểu', lesson_code='B1',
             question='Xét các nhận định về dữ liệu:', statements=[
                 dict(label='a', text='Ý thứ nhất đúng', correct=True), dict(label='b', text='Ý thứ hai sai', correct=False),
                 dict(label='c', text='Ý thứ ba đúng', correct=True), dict(label='d', text='Ý thứ tư sai', correct=False)]),
        dict(id='S1', type='SHORT', slot_number=1, points=0.5, level='Vận dụng', lesson_code='B1',
             question=FORMULA, short_answer='9'),
        dict(id='E1', type='ES', slot_number=1, points=1.0, level='Vận dụng', lesson_code='B1',
             question='Viết chương trình tính tổng 1 + 2 + … + n.',
             rubric=[dict(criterion='Khai báo đúng', points=0.25), dict(criterion='Vòng lặp đúng', points=0.25),
                     dict(criterion='Cộng dồn đúng', points=0.25), dict(criterion='In kết quả', points=0.25)],
             equivalent_answer_policy='Chấp nhận cách giải tương đương.', max_score=1),
    ]
    return dict(title='Đề kiểm thử', grade=10, exam_type='CK1', duration=45, total_points=10,
                school_year='2026 - 2027', exam_code='101', questions=qs)


def docx_text(raw):
    d = docx.Document(io.BytesIO(raw))
    parts = [p.text for p in d.paragraphs]
    parts += [c.text for t in d.tables for r in t.rows for c in r.cells]
    return '\n'.join(parts)


class StructureRoundTripTests(unittest.TestCase):
    """Tầng 2: nội dung đọc ngược từ tệp xuất phải khớp bản ghi đề."""

    def setUp(self):
        self.e = exam()

    def assert_in_order(self, text, needles):
        pos = -1
        for n in needles:
            nxt = text.find(n, pos + 1)
            self.assertGreater(nxt, pos, f'thiếu hoặc sai thứ tự: {n!r}')
            pos = nxt

    def test_student_docx_has_every_question_and_option_but_no_answers(self):
        text = docx_text(export_document(self.e, 'docx')[0])
        for q in self.e['questions']:
            self.assertIn(q['question'], text)
        self.assert_in_order(text, self.e['questions'][0]['options'])
        self.assertNotIn('Đáp án:', text)
        self.assertNotIn('Khai báo đúng', text)

    def test_teacher_docx_answers_match_record(self):
        text = docx_text(export_document(self.e, 'docx', answers=True)[0])
        self.assertIn('Đáp án: C', text)  # M1 correct=2
        self.assertIn('Đáp án: A', text)  # M2 correct=0
        self.assertIn('a: Đúng, b: Sai, c: Đúng, d: Sai', text)
        self.assertIn('9', text)
        for c in self.e['questions'][4]['rubric']:
            self.assertIn(c['criterion'], text)

    def test_lms_docx_marks_exactly_the_correct_options(self):
        d = docx.Document(io.BytesIO(export_document(self.e, 'docx', target='lms')[0]))
        bracketed = [p.text for p in d.paragraphs if p.runs and p.runs[0].bold and p.text.startswith('[')]
        self.assertIn('[C.] Lựa chọn ba', bracketed)
        self.assertIn('[A.] 0 1 2', bracketed)
        self.assertIn('[Đáp án: 9]', bracketed)
        plain = [p.text for p in d.paragraphs]
        self.assertIn('A. Lựa chọn một', plain)
        self.assertFalse(any('BẢNG ĐÁP ÁN' in t.upper() for t in plain), 'rule 06: không có bảng đáp án')

    def test_latex_contains_every_question_escaped(self):
        tex = generate_exam_latex(self.e)
        self.assertIn(r'50\% \& lợi nhuận', tex)
        self.assertNotIn(SPECIAL, tex)  # phải được escape, không chèn nguyên văn
        for q in self.e['questions'][1:]:
            self.assertIn(q['question'].split(' ')[0], tex)


@unittest.skipUnless(shutil.which('xelatex') or Path('/Library/TeX/texbin/xelatex').exists(), 'máy không có XeLaTeX')
class RenderTests(unittest.TestCase):
    """Tầng 3: PDF biên dịch thật."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        tex = Path(cls.tmp.name) / 'de.tex'
        tex.write_text(generate_exam_latex(exam()), encoding='utf-8')
        xelatex = shutil.which('xelatex') or '/Library/TeX/texbin/xelatex'
        for _ in range(2):
            cls.proc = subprocess.run([xelatex, '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'de.tex'],
                                      cwd=cls.tmp.name, capture_output=True, text=True, timeout=120)
        cls.pdf = Path(cls.tmp.name) / 'de.pdf'
        cls.log = (Path(cls.tmp.name) / 'de.log').read_text(encoding='utf-8', errors='replace')

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_compiles(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stdout[-2000:])
        self.assertTrue(self.pdf.exists())

    def test_no_missing_glyphs(self):
        self.assertNotIn('Missing character', self.log)

    def test_fonts_embedded_times_new_roman(self):
        fonts = subprocess.run(['pdffonts', str(self.pdf)], capture_output=True, text=True).stdout
        self.assertIn('TimesNewRoman', fonts.replace(' ', ''))
        for line in fonts.splitlines()[2:]:
            self.assertIn(' yes ', line, f'font chưa nhúng: {line}')

    def test_vietnamese_text_and_page_numbers(self):
        text = unicodedata.normalize('NFC', subprocess.run(['pdftotext', str(self.pdf), '-'], capture_output=True, text=True).stdout)
        self.assertIn('ĐỀ KIỂM TRA ĐỊNH KÌ CUỐI HỌC KÌ 1', text)
        self.assertIn('Lựa chọn ba', text)
        self.assertRegex(text, r'Trang 1/\d')


if __name__ == '__main__':
    unittest.main()
