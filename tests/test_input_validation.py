"""
Unit tests for Input Data Specifications and Validation (ExamMatrix Studio).
"""

import unittest
from input_schema import (
    validate_question_input,
    validate_raw_exam_text,
    ValidationError
)


class InputValidationTests(unittest.TestCase):

    def test_valid_mc_question_passes(self):
        q = {
            'subject_name': 'Tin học',
            'grade': 10,
            'lesson_code': 'B1',
            'type': 'MC',
            'level': 'Biết',
            'learning_outcome': 'Nhận biết được thông tin và dữ liệu.',
            'question': 'Thiết bị nào sau đây là thiết bị vào của máy tính?',
            'options': ['Màn hình', 'Máy in', 'Bàn phím', 'Loa'],
            'correct': 2,
            'review_status': 'draft'
        }
        res = validate_question_input(q)
        self.assertEqual(res['grade'], 10)
        self.assertEqual(res['type'], 'MC')
        self.assertEqual(len(res['options']), 4)
        self.assertEqual(res['correct'], 2)

    def test_mc_duplicate_options_rejected(self):
        q = {
            'subject_name': 'Toán học',
            'grade': 10,
            'lesson_code': 'B1',
            'type': 'MC',
            'level': 'Biết',
            'learning_outcome': 'Mệnh đề toán học',
            'question': 'Chọn khẳng định đúng?',
            'options': ['A', 'B', 'A', 'D'],
            'correct': 0,
            'review_status': 'draft'
        }
        with self.assertRaises(ValidationError) as ctx:
            validate_question_input(q)
        self.assertIn('không được trùng lặp', str(ctx.exception))

    def test_mc_invalid_correct_index_rejected(self):
        q = {
            'subject_name': 'Tin học',
            'grade': 8,
            'lesson_code': 'B1',
            'type': 'MC',
            'level': 'Biết',
            'learning_outcome': 'Lược sử công cụ tính toán',
            'question': 'Câu hỏi?',
            'options': ['A', 'B', 'C', 'D'],
            'correct': 4, # Out of range 0..3
            'review_status': 'draft'
        }
        with self.assertRaises(ValidationError) as ctx:
            validate_question_input(q)
        self.assertIn('từ 0 đến 3', str(ctx.exception))

    def test_valid_yn_question_passes(self):
        q = {
            'subject_name': 'Tin học',
            'grade': 10,
            'lesson_code': 'B2',
            'type': 'YN',
            'level': 'Hiểu',
            'learning_outcome': 'An toàn thông tin',
            'question': 'Các nhận định sau về an toàn mạng:',
            'statements': [
                {'label': 'a', 'text': 'Không chia sẻ mật khẩu.', 'correct': True},
                {'label': 'b', 'text': 'Mọi thông tin trên mạng đều đúng.', 'correct': False},
                {'label': 'c', 'text': 'Cần cập nhật phần mềm diệt virus.', 'correct': True},
                {'label': 'd', 'text': 'Tự ý đăng ảnh người khác.', 'correct': False}
            ],
            'review_status': 'draft'
        }
        res = validate_question_input(q)
        self.assertEqual(res['type'], 'YN')
        self.assertEqual(len(res['statements']), 4)
        self.assertTrue(res['statements'][0]['correct'])
        self.assertFalse(res['statements'][1]['correct'])

    def test_invalid_grade_rejected(self):
        q = {
            'subject_name': 'Tin học',
            'grade': 7, # Out of 8..12
            'lesson_code': 'B1',
            'type': 'MC',
            'level': 'Biết',
            'question': 'Test?',
            'options': ['A', 'B', 'C', 'D'],
            'correct': 0
        }
        with self.assertRaises(ValidationError) as ctx:
            validate_question_input(q)
        self.assertIn('không thuộc phạm vi hỗ trợ', str(ctx.exception))

    def test_raw_exam_text_detection(self):
        raw = """
Câu 1: Thiết bị nào là thiết bị vào?
A. Màn hình
B. Máy in
C. Bàn phím
D. Loa
Đáp án: C

Câu 2: Các nhận định sau:
a) Mệnh đề 1 [ĐÚNG]
b) Mệnh đề 2 [SAI]
c) Mệnh đề 3 [ĐÚNG]
d) Mệnh đề 4 [SAI]
"""
        diag = validate_raw_exam_text(raw)
        self.assertEqual(diag['detected_questions'], 2)
        self.assertEqual(diag['detected_options'], 4)
        self.assertEqual(diag['detected_yn_statements'], 4)
        self.assertTrue(diag['is_parseable'])
        self.assertEqual(len(diag['warnings']), 0)

    def test_empty_raw_text_rejected(self):
        with self.assertRaises(ValidationError):
            validate_raw_exam_text("   \n  \n")


if __name__ == '__main__':
    unittest.main()
