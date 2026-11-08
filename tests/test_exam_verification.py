import base64
import json
import tempfile
import unittest
from pathlib import Path
from bank_service import BankService, ServiceError
from matrices.service import MatrixService

APP_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_DIR = APP_DIR.parent
BANK_PATH = WORKSPACE_DIR / '06_Kiem_tra_va_Danh_gia/01_Ngan_hang_cau_hoi/03_Ngan_hang_mo_rong_HK1_2026_10_21/NGAN_HANG_CAU_HOI_HK1_V1.json'


class ExamVerificationAndImportTest(unittest.TestCase):
    def setUp(self):
        if not BANK_PATH.is_file() or not (APP_DIR/'data/matrices/records.json').is_file():
            self.skipTest('Ca tích hợp dùng hồ sơ riêng tại máy dự án, không lưu trên GitHub.')
        self.tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmp.name)
        (self.data_dir / 'matrices').mkdir(parents=True, exist_ok=True)
        src_matrices = (APP_DIR / 'data/matrices/records.json').read_text(encoding='utf-8')
        (self.data_dir / 'matrices/records.json').write_text(src_matrices, encoding='utf-8')
        src_templates = (APP_DIR / 'data/exam_templates.json').read_text(encoding='utf-8')
        (self.data_dir / 'exam_templates.json').write_text(src_templates, encoding='utf-8')
        self.service = BankService(BANK_PATH, self.data_dir, self.data_dir / 'exam_templates.json')
        self.matrix_service = MatrixService(self.service)

    def tearDown(self):
        self.tmp.cleanup()

    def test_import_revisions_and_verify_exams_all_grades(self):
        for g in (8, 9, 10):
            folder = WORKSPACE_DIR / f'06_Kiem_tra_va_Danh_gia/00_Ho_so_nop_Giua_HK1/0{g-7}_Khoi_{g}'
            rev_path = folder / f'KHOI {g} - ON TAP GIUA HK1 2026-2027.docx'
            rev = self.service.import_revision_file({
                'filename': rev_path.name,
                'grade': g,
                'content_base64': base64.b64encode(rev_path.read_bytes()).decode('ascii'),
            })
            self.assertEqual(rev['grade'], g)
            self.assertGreaterEqual(rev['question_count'], 34)

            ex_path = folder / f'KHOI {g} - DE THI GIUA HK1 2026-2027.docx'
            inspected = self.service.inspect_exam_import({
                'filename': ex_path.name,
                'grade': g,
                'exam_type': 'GK1',
                'revision_id': rev['id'],
                'content_base64': base64.b64encode(ex_path.read_bytes()).decode('ascii'),
            }, self.matrix_service)
            self.assertTrue(inspected['all_passed'])
            res = self.service.import_verified_exams({'candidates': inspected['candidates']}, self.matrix_service)
            self.assertEqual(res['imported_count'], 1)
            self.assertTrue(res['imported'][0]['verification']['passed'])
            self.assertEqual(res['imported'][0]['total_points'], 10.0)

    def test_reject_invalid_exam_on_import(self):
        bad_exam = {
            'title': 'Đề lỗi thiếu câu',
            'grade': 9,
            'exam_type': 'GK1',
            'questions': [
                {'type': 'MC', 'slot_number': 1, 'question': 'Câu 1?', 'options': ['A', 'B', 'C', 'D'], 'correct': 0, 'points': 0.25}
            ],
        }
        with self.assertRaises(ServiceError):
            self.service.import_verified_exams({'candidates': [bad_exam]}, self.matrix_service)

    def test_adjust_similarity_threshold_and_auto_swap(self):
        folder = WORKSPACE_DIR / '06_Kiem_tra_va_Danh_gia/00_Ho_so_nop_Giua_HK1/01_Khoi_8'
        rev_path = folder / 'KHOI 8 - ON TAP GIUA HK1 2026-2027.docx'
        rev = self.service.import_revision_file({
            'filename': rev_path.name,
            'grade': 8,
            'content_base64': base64.b64encode(rev_path.read_bytes()).decode('ascii'),
        })
        ex_path = folder / 'KHOI 8 - DE THI GIUA HK1 2026-2027.docx'
        inspected = self.service.inspect_exam_import({
            'filename': ex_path.name,
            'grade': 8,
            'exam_type': 'GK1',
            'revision_id': rev['id'],
            'content_base64': base64.b64encode(ex_path.read_bytes()).decode('ascii'),
        }, self.matrix_service)
        imported = self.service.import_verified_exams({'candidates': inspected['candidates']}, self.matrix_service)
        exam_id = imported['imported'][0]['id']

        # 1. Test update_threshold
        with self.assertRaises(ServiceError):
            self.service.adjust_exam_similarity({
                'id': exam_id, 'action': 'update_threshold',
                'target_percent': 80.0, 'similarity_mode': 'min',
            }, self.matrix_service)
        self.assertEqual(self.service.get_record('exams', exam_id)['similarity_target_percent'], 90.0)

        # 2. Test auto_adjust_questions to 100%
        res2 = self.service.adjust_exam_similarity({
            'id': exam_id,
            'action': 'auto_adjust_questions',
            'target_percent': 100.0,
            'similarity_mode': 'min',
        }, self.matrix_service)
        ex2 = res2['exam']
        rc2 = ex2['verification']['revision_check']
        self.assertEqual(rc2['outside_questions'], 0)
        self.assertEqual(rc2['coverage_percent_points'], 100.0)
        self.assertTrue(rc2['matched'])

        # 3. Test toggle_question: swap_from_bank / remove_from_revision
        first_q = ex2['questions'][0]
        res3 = self.service.adjust_exam_similarity({
            'id': exam_id,
            'action': 'toggle_question',
            'sub_action': 'remove_from_revision',
            'question_id': first_q['id'],
        }, self.matrix_service)
        ex3 = res3['exam']
        rc3 = ex3['verification']['revision_check']
        self.assertGreater(rc3['outside_questions'], 0)

        # 4. Test toggle_question: add_to_revision
        res4 = self.service.adjust_exam_similarity({
            'id': exam_id,
            'action': 'toggle_question',
            'sub_action': 'add_to_revision',
            'question_id': first_q['id'],
        }, self.matrix_service)
        ex4 = res4['exam']
        rc4 = ex4['verification']['revision_check']
        self.assertEqual(rc4['outside_questions'], 0)


if __name__ == '__main__':
    unittest.main()
