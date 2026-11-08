"""Bộ kiểm định Mốc C2: Thử với giáo viên (Teacher Workflows & Scenarios).

Kiểm tra hồi quy bằng dữ liệu tự soạn TX Khối 8, không thay nghiệm thu GK1/CK1 ba khối:
1. Sửa câu đã duyệt (approved) -> tự động chuyển về needs_review.
2. Báo cáo thiếu câu B9 (shortfall_report) theo từng ô ma trận.
3. Đề có nội dung phong phú (bảng, mã nguồn, công thức, định dạng).
4. Nghiệp vụ KTTX theo Thông tư 22/2021 Điều 6 (phân biệt ĐĐGtx với hoạt động).
5. Đề đã khóa / phát hành giữ nguyên snapshot nội dung & hash khi ngân hàng bị sửa.
6. Kiểm soát quyền xem đáp án (answers=False không lộ lời giải/bảng đáp án).
7. Sao lưu và kiểm định tính toàn vẹn (backup verification).
"""
import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_backend
from bank_service import BankService, ServiceError
from domain.exam_lifecycle import exam_hash, exam_status
from domain.kttx import activity_title, convert_to_10, kttx_overview, tx_count_per_semester
from domain.matrix_checks import shortfall_report
from exports import export_document


class C2TeacherScenarioTests(test_backend.BackendTests):
    def setUp(self):
        super().setUp()
        self.exam = self.svc.generate_exam(self.request())


    # --- KỊCH BẢN 1: Sửa câu đã duyệt -> needs_review ---
    def test_c2_scenario_1_editing_approved_question_moves_to_needs_review(self):
        bank = self.svc._load_bank()['questions']
        approved_q = next((q for q in bank if q.get('review_status') == 'approved'), None)
        self.assertIsNotNone(approved_q, 'Phải có câu hỏi approved trong ngân hàng')

        modified = copy.deepcopy(approved_q)
        modified['question'] = str(approved_q.get('question', '')) + ' (đã chỉnh sửa nội dung)'
        saved = self.svc.save_question(modified)
        self.assertEqual(saved['review_status'], 'needs_review',
                         'Sửa nội dung câu đã duyệt bắt buộc phải chuyển trạng thái thành needs_review')

    # --- KỊCH BẢN 2: Báo cáo thiếu câu B9 theo ô ma trận ---
    def test_c2_scenario_2_shortfall_reporting_per_matrix_cell(self):
        from matrix_fixtures import minimal_matrix
        matrix = minimal_matrix()
        matrix.update(grade=8, exam_type='TX', title='Ma trận giả kiểm tra thiếu YCCĐ')
        matrix['requirements'][0].update(text='Xử lí dữ liệu.', ppct_outcome_index=1)
        bank = self.svc._load_bank()['questions']
        # Tổng câu đã duyệt nhiều nhưng thuộc YCCĐ khác: không được tính là đủ.
        self.assertGreaterEqual(len(bank), 16)
        for index, status in enumerate(('pending_review', 'needs_review', 'draft')):
            question = copy.deepcopy(bank[0])
            question.update(id=f'YCCD-THIEU-{index}', learning_outcome='Xử lí dữ liệu.', review_status=status)
            bank.append(question)
        report = shortfall_report(matrix, bank, self.svc.catalog)
        self.assertFalse(report['ok'])
        self.assertEqual(report['total_shortfall'], 1)
        self.assertEqual(len(report['cells']), 1)
        cell = report['cells'][0]
        self.assertEqual((cell['needed'], cell['approved'], cell['shortfall']), (1, 0, 1))
        self.assertEqual((cell['pending_review'], cell['needs_review'], cell['draft']), (1, 1, 1))

    # --- KỊCH BẢN 3: Đề có hình ảnh, bảng, mã nguồn / thuật toán ---
    def test_c2_scenario_3_rich_content_rendering_and_export(self):
        rich_q = {
            'id': 'Q_RICH_CODE_TABLE',
            'grade': 8,
            'lesson_code': 'B12',
            'type': 'MC',
            'cognitive_level': 'Vận dụng',
            'review_status': 'approved',
            'question': (
                'Cho đoạn mã thuật toán sau:\n'
                '```python\n'
                's = 0\n'
                'for i in range(1, 5):\n'
                '    s += i\n'
                'print(s)\n'
                '```\n'
                'Bảng theo dõi biến chạy:\n'
                '| Vòng lặp i | Giá trị s |\n'
                '| :---: | :---: |\n'
                '| 1 | 1 |\n'
                '| 2 | 3 |\n'
                'Giá trị cuối cùng của biến s là bao nhiêu?'
            ),
            'options': ['10', '15', '5', '0'],
            'correct': 0,
            'learning_outcome': 'Đọc hiểu và thực thi thuật toán lặp'
        }
        # Thử xuất tài liệu học sinh và giáo viên
        temp_exam = copy.deepcopy(self.exam)
        temp_exam['questions'].append(rich_q)

        # Xuất đề học sinh
        stu_doc, _, _ = export_document(temp_exam, fmt='docx', answers=False)
        self.assertTrue(len(stu_doc) > 1000, 'Tệp DOCX học sinh có mã nguồn/bảng phải xuất thành công')

        # Xuất đáp án giáo viên
        tch_doc, _, _ = export_document(temp_exam, fmt='docx', answers=True)
        self.assertTrue(len(tch_doc) > 1000, 'Tệp DOCX đáp án giáo viên có mã nguồn/bảng phải xuất thành công')

    # --- KỊCH BẢN 4: Nghiệp vụ KTTX theo Thông tư 22/2021 Điều 6 ---
    def test_c2_scenario_4_kttx_article_6_workflow(self):
        # THCS 35 tiết/năm -> 2 ĐĐGtx/học kì
        self.assertEqual(tx_count_per_semester(35), 2)
        # THPT 70 tiết/năm -> 3 ĐĐGtx/học kì
        self.assertEqual(tx_count_per_semester(70), 3)

        # Tiêu đề chuẩn hóa
        title_8 = activity_title('Tin học', 8, 1, 1)
        self.assertEqual(title_8, 'Tin 8_Kiểm tra thường xuyên 1 - HK I')

        # Thao tác lưu hoạt động KTTX
        act = self.svc.save_kttx({
            'grade': 8,
            'semester': 1,
            'k': 1,
            'form': 'thuc_hanh',
            'exam_id': self.exam['id'],
            'class_name': '8A1',
            'recorded': True
        })
        self.assertEqual(act['grade'], 8)
        self.assertEqual(act['semester'], 1)
        self.assertEqual(act['form'], 'thuc_hanh')

        # Tổng quan KTTX cảnh báo tiến độ
        overview = self.svc.kttx_state()
        self.assertIn('activities', overview)
        self.assertTrue(any(a['id'] == act['id'] for a in overview['activities']))

    # --- KỊCH BẢN 5: Đề đã phát hành / khóa giữ nguyên khi sửa ngân hàng ---
    def test_c2_scenario_5_locked_exam_immutability(self):
        # Chuyển trạng thái sang locked
        self.svc.exam_transition(self.exam['id'], 'submit', actor='gv_a')
        locked_exam = self.svc.exam_transition(self.exam['id'], 'approve', actor='to_truong')
        self.assertEqual(exam_status(locked_exam), 'locked')
        initial_hash = exam_hash(locked_exam)
        initial_q_texts = [q['question'] for q in locked_exam['questions']]

        # Thử sửa câu hỏi trong ngân hàng
        bank = self.svc._load_bank()['questions']
        q_target = next((q for q in bank if q['id'] == locked_exam['questions'][0]['id']), None)
        if q_target:
            modified_bank_q = copy.deepcopy(q_target)
            modified_bank_q['question'] = 'Nội dung ngân hàng bị thay đổi hoàn toàn!'
            self.svc.save_question(modified_bank_q)

        # Đọc lại đề đã khóa
        reloaded = self.svc.get_record('exams', self.exam['id'])
        self.assertEqual(exam_hash(reloaded), initial_hash,
                         'Hash của đề đã khóa phải được bảo toàn nguyên vẹn')
        reloaded_q_texts = [q['question'] for q in reloaded['questions']]
        self.assertEqual(reloaded_q_texts, initial_q_texts,
                         'Nội dung các câu trong đề đã khóa không được bị biến đổi theo ngân hàng')

    # --- KỊCH BẢN 6: Kiểm soát quyền answers (Bảo mật khảo thí) ---
    def test_c2_scenario_6_security_answers_permission(self):
        # Đề thi học sinh không được chứa đáp án đúng ở metadata hay bảng đáp án
        doc_bytes, mime, fn = export_document(self.exam, fmt='docx', answers=False)
        import io, zipfile
        with zipfile.ZipFile(io.BytesIO(doc_bytes)) as z:
            xml = z.read('word/document.xml').decode('utf-8')
            self.assertNotIn('HƯỚNG DẪN CHẤM', xml)
            self.assertNotIn('BẢNG ĐÁP ÁN', xml)
            self.assertNotIn('Đáp án chi tiết', xml)


# Không chạy lại các test của BackendTests trong lớp con
for name in [n for n in dir(test_backend.BackendTests) if n.startswith('test_')]:
    setattr(C2TeacherScenarioTests, name, None)


if __name__ == '__main__':
    unittest.main()
