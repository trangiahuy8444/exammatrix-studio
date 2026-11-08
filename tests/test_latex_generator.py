"""Unit tests for LaTeX Generator module."""
import unittest
from latex_generator import (
    tex_escape,
    generate_exam_latex,
    generate_review_latex,
    generate_matrix_latex,
)
from exports import export_document


class LatexGeneratorTests(unittest.TestCase):
    def test_tex_escape_plain_and_math(self):
        # Plain text specials
        s = "Toán & Tin học _ lớp 10 #1 100% ~ 2^3"
        escaped = tex_escape(s)
        self.assertIn(r"\&", escaped)
        self.assertIn(r"\_", escaped)
        self.assertIn(r"\#", escaped)
        self.assertIn(r"\%", escaped)
        self.assertIn(r"\textasciitilde{}", escaped)
        self.assertIn(r"\textasciicircum{}", escaped)

        # Math formula preservation
        s_math = "Tính giá trị của $x^2 + \\frac{a}{b} = 10$ với $y \\le 5$."
        esc_math = tex_escape(s_math)
        self.assertIn("$x^2 + \\frac{a}{b} = 10$", esc_math)
        self.assertIn("$y \\le 5$", esc_math)

    def test_generate_student_exam_latex(self):
        record = {
            'title': 'Đề kiểm tra giữa học kỳ 1',
            'subject_name': 'Toán',
            'grade': 10,
            'duration': 60,
            'school_year': '2026 - 2027',
            'exam_code': '101',
            'total_points': 10,
            'questions': [
                {
                    'slot_number': 1,
                    'type': 'MC',
                    'question': 'Hàm số $y = x^2$ đồng biến trên khoảng nào?',
                    'options': ['$(0; +\\infty)$', '$(-\\infty; 0)$', '$\\mathbb{R}$', '$(-\\infty; +\\infty)$'],
                    'correct': 0,
                    'points': 0.25,
                },
                {
                    'slot_number': 2,
                    'type': 'YN',
                    'question': 'Xét tính đúng sai của các mệnh đề sau:',
                    'statements': [
                        {'text': 'Số 7 là số nguyên tố.', 'correct': True},
                        {'text': 'Số 4 là số vô tỉ.', 'correct': False},
                        {'text': 'Tam giác đều có 3 góc bằng nhau.', 'correct': True},
                        {'text': 'Phương trình $x^2 + 1 = 0$ có nghiệm thực.', 'correct': False},
                    ],
                    'points': 1.0,
                },
                {
                    'slot_number': 3,
                    'type': 'SHORT',
                    'question': 'Tìm nghiệm nguyên dương của $2x = 8$.',
                    'answer': '4',
                    'points': 0.5,
                },
                {
                    'slot_number': 4,
                    'type': 'ES',
                    'question': 'Giải phương trình $x^2 - 4x + 3 = 0$.',
                    'points': 1.0,
                    'rubric': [
                        {'criterion': 'Xác định hệ số $a=1, b=-4, c=3$', 'points': 0.25},
                        {'criterion': 'Tính $\\Delta = 4 > 0$', 'points': 0.25},
                        {'criterion': 'Tính nghiệm $x_1 = 1$', 'points': 0.25},
                        {'criterion': 'Tính nghiệm $x_2 = 3$', 'points': 0.25},
                    ],
                    'equivalent_answer_policy': 'Học sinh phân tích thành nhân tử $(x-1)(x-3)=0$ vẫn cho trọn điểm.',
                }
            ]
        }
        tex = generate_exam_latex(record, answers=False, exam_code='101')
        self.assertIn(r"\documentclass[11pt,a4paper]{article}", tex)
        self.assertIn("Times New Roman", tex)
        self.assertIn("MÔN: TOÁN -- KHỐI 10", tex)
        self.assertIn("(MÃ ĐỀ: 101)", tex)  # theo mẫu GK1 đã nộp
        self.assertIn(r"PHẦN I. TRẮC NGHIỆM KHÁCH QUAN", tex)
        self.assertIn(r"\choices", tex)
        self.assertIn(r"PHẦN II. TRẮC NGHIỆM ĐÚNG / SAI", tex)
        self.assertIn(r"PHẦN III. TRẢ LỜI NGẮN", tex)
        self.assertIn(r"PHẦN IV. TỰ LUẬN", tex)
        self.assertIn("HẾT", tex)

    def test_generate_teacher_answer_latex(self):
        record = {
            'title': 'Đề kiểm tra giữa học kỳ 1',
            'subject_name': 'Tin học',
            'grade': 10,
            'duration': 45,
            'school_year': '2026 - 2027',
            'exam_code': '102',
            'total_points': 10,
            'questions': [
                {
                    'slot_number': 1,
                    'type': 'MC',
                    'question': 'Thiết bị nào sau đây là thiết bị vào?',
                    'options': ['Bàn phím', 'Màn hình', 'Máy in', 'Loa'],
                    'correct': 0,
                    'points': 0.25,
                },
                {
                    'slot_number': 2,
                    'type': 'MC',
                    'question': 'Đơn vị đo dung lượng thông tin nhỏ nhất là gì?',
                    'options': ['Byte', 'Bit', 'KB', 'MB'],
                    'correct': 1,
                    'points': 0.25,
                },
                {
                    'slot_number': 3,
                    'type': 'ES',
                    'question': 'Nêu ưu điểm của lưu trữ đám mây.',
                    'points': 1.0,
                    'max_score': 1.0,
                    'rubric': [
                        {'criterion': 'Truy cập mọi lúc mọi nơi có Internet', 'points': 0.5},
                        {'criterion': 'Khả năng sao lưu an toàn và chia sẻ tiện lợi', 'points': 0.5},
                    ],
                    'equivalent_answer_policy': 'Nêu đúng 2 ý rõ ràng cho trọn điểm.',
                }
            ]
        }
        tex = generate_exam_latex(record, answers=True, exam_code='102')
        self.assertIn("ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM", tex)
        # Check compact grid table for MC answers
        self.assertIn(r"\rowcolor{tableheader}", tex)
        self.assertIn(r"\textbf{Câu}", tex)
        self.assertIn(r"\textbf{Đ/A}", tex)
        self.assertIn(r"\textbf{A}", tex)
        self.assertIn(r"\textbf{B}", tex)
        # Check rubric table 3 columns
        self.assertIn(r"\textbf{Câu / Ý} & \textbf{Nội dung yêu cầu / Tiêu chí chấm} & \textbf{Điểm}", tex)
        self.assertIn("Truy cập mọi lúc mọi nơi có Internet", tex)
        self.assertIn("HẾT HƯỚNG DẪN CHẤM", tex)

    def test_generate_review_guide_latex(self):
        record = {
            'title': 'Đề cương ôn tập HK1',
            'subject_name': 'Tin học',
            'grade': 8,
            'school_year': '2026 - 2027',
            'questions': [
                {
                    'slot_number': 1,
                    'type': 'MC',
                    'question': 'Chiếc máy tính điện tử đầu tiên tên là gì?',
                    'options': ['ENIAC', 'UNIVAC', 'EDVAC', 'IBM'],
                    'correct': 0,
                    'topic_source': 'Chủ đề 1. Máy tính và cộng đồng',
                    'lesson_name': 'Bài 1. Lược sử công cụ tính toán',
                    'learning_outcome': 'Biết được sự ra đời của máy tính điện tử.',
                }
            ]
        }
        tex = generate_review_latex(record)
        self.assertIn("ĐỀ CƯƠNG ÔN TẬP KIỂM TRA", tex)
        self.assertIn("A. GIỚI HẠN KIẾN THỨC ÔN TẬP", tex)
        self.assertIn(r"\textbf{STT} & \textbf{Tên chủ đề} & \textbf{Tên bài} \\", tex)
        self.assertNotIn("Mục tiêu bài học", tex)
        self.assertIn("Chủ đề 1. Máy tính và cộng đồng", tex)
        self.assertIn("B. HỆ THỐNG CÂU HỎI ÔN TẬP", tex)
        self.assertIn("C. BẢNG ĐÁP ÁN GỢI Ý VÀ HƯỚNG DẪN ÔN TẬP", tex)

    def test_generate_matrix_latex(self):
        matrix = {
            'title': 'Ma trận kiểm tra giữa kì 1',
            'subject_name': 'Tin học',
            'grade': 10,
            'duration': 45,
            'exam_type': 'GK1',
            'lessons': [
                {
                    'topic': 'Chủ đề 1. Máy tính và xã hội tri thức',
                    'title': 'Bài 1. Thông tin và xử lí thông tin',
                    'mc_b': '2 (1, 2)',
                    'mc_h': '1 (3)',
                    'tot_b': '2',
                    'tot_h': '1',
                    'pct': '15%',
                    'outcomes': [
                        {'text': 'Biết được thông tin và dữ liệu là gì', 'refs': ['1', '2']},
                        {'text': 'Hiểu được ưu điểm của thiết bị số', 'refs': ['3']}
                    ],
                    'mc_spec': '2 MC (B)',
                }
            ]
        }
        tex = generate_matrix_latex(matrix)
        self.assertIn("landscape", tex)
        self.assertIn("KHUNG MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ", tex)
        self.assertIn("BẢNG ĐẶC TẢ ĐỀ KIỂM TRA", tex)
        self.assertIn("Câu 1, Câu 2", tex)

    def test_four_level_matrix_latex_preserves_vdc_column_points_and_requirement(self):
        from test_matrix_four_levels import four_level_matrix
        m = four_level_matrix()
        tex = generate_matrix_latex(m)
        first = tex.split(r'\begin{longtable}', 1)[1].split(r'\end{longtable}', 1)[0]
        self.assertIn(r'ES\newline Vận dụng cao', first)
        self.assertIn('Tổng VDC', first)
        lines = [line for line in first.splitlines() if ' & ' in line]
        self.assertTrue(all(line.count(' & ')==11 for line in lines), lines)
        self.assertIn('4 & 3 & 2 & 1 & 10', next(line for line in lines if 'Tổng số điểm' in line))
        self.assertIn('Vận dụng cao: Yêu cầu minh họa 4.', tex)
        self.assertIn('(Câu 4).', tex)
        self.assertIn('1 câu VDC = 10', tex)

    def test_old_three_level_matrix_latex_keeps_matching_column_counts(self):
        from matrix_fixtures import minimal_matrix
        tex = generate_matrix_latex(minimal_matrix())
        first = tex.split(r'\begin{longtable}', 1)[1].split(r'\end{longtable}', 1)[0]
        self.assertNotIn('Vận dụng cao', first)
        self.assertNotIn('VDC', first)
        lines = [line for line in first.splitlines() if ' & ' in line]
        self.assertTrue(all(line.count(' & ')==9 for line in lines), lines)
        self.assertIn('10 & 0 & 0 & 10', next(line for line in lines if 'Tổng số điểm' in line))

    def test_export_document_tex_integration(self):
        record = {
            'title': 'Kiểm tra 15 phút',
            'subject_name': 'Vật lí',
            'grade': 10,
            'duration': 15,
            'questions': [
                {
                    'slot_number': 1,
                    'type': 'MC',
                    'question': 'Đơn vị của gia tốc là gì?',
                    'options': ['m/s', '$m/s^2$', 'km/h', 'N'],
                    'correct': 1,
                    'points': 1.0,
                }
            ]
        }
        raw, mime, filename = export_document(record, fmt='tex', answers=False)
        self.assertEqual(mime, 'application/x-tex; charset=utf-8')
        self.assertTrue(filename.endswith('.tex'))
        self.assertIn('MÔN: VẬT LÍ -- KHỐI 10', raw.decode('utf-8'))


if __name__ == '__main__':
    unittest.main()
