"""Mốc A3: câu nháp không làm crash; bảng đáp án không tự điền đáp án sai."""
import json
import tempfile
import unittest
from pathlib import Path

from bank_service import BankService, ServiceError, mc_answer_letter
from test_backend import fixture


def mc(**kw):
    q = dict(grade=8, type='MC', lesson_code='B1', level='Biết', learning_outcome='Nhận biết dữ liệu.',
             question='Câu mới hoàn toàn?', options=['Một', 'Hai', 'Ba', 'Bốn'], correct=1,
             option_explanations=['a', 'b', 'c', 'd'], max_score=1, review_status='content_checked')
    q.update(kw)
    return q


class DraftOutcomeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name); bank = root / 'bank.json'
        bank.write_text(json.dumps(fixture(), ensure_ascii=False))
        self.svc = BankService(bank, root / 'data')

    def test_draft_with_outcome_outside_ppct_saves_without_index(self):
        saved = self.svc.save_question(mc(review_status='draft', learning_outcome='YCCĐ do AI đề xuất'))
        self.assertIsNone(saved['outcome_index'])

    def test_draft_with_unknown_lesson_and_no_outcome_saves(self):
        saved = self.svc.save_question(mc(review_status='draft', lesson_code='B99', learning_outcome=None))
        self.assertIsNone(saved['outcome_index'])

    def test_non_draft_outcome_outside_ppct_is_400(self):
        with self.assertRaises(ServiceError) as ctx:
            self.svc.save_question(mc(learning_outcome='Không có trong PPCT'))
        self.assertEqual(ctx.exception.status, 400)

    def test_valid_outcome_gets_index(self):
        self.assertEqual(self.svc.save_question(mc(learning_outcome='Xử lí dữ liệu.'))['outcome_index'], 1)


class CurriculaSingleSourceTests(unittest.TestCase):
    def test_service_without_data_catalog_uses_public_curricula(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); bank = root / 'bank.json'
            bank.write_text(json.dumps(fixture(), ensure_ascii=False))
            svc = BankService(bank, root / 'data')  # không có data/curricula.json (như tài khoản Django)
            self.assertIn('Vật lí', svc.subject_curricula)
            self.assertTrue(svc.subject_curricula['Toán học'])

    def test_public_catalog_is_valid_json_payload(self):
        from bank_service import load_default_curricula
        catalog = load_default_curricula()
        self.assertEqual(len(catalog), 8)


class AnswerLetterTests(unittest.TestCase):
    def test_valid_indexes(self):
        self.assertEqual([mc_answer_letter(dict(correct=i)) for i in range(4)], ['A', 'B', 'C', 'D'])

    def test_invalid_correct_raises_instead_of_guessing_A(self):
        for bad in (None, -1, 4, '1', 1.0, True):
            with self.assertRaises(ServiceError):
                mc_answer_letter(dict(id='Q1', correct=bad))


class AnswerGridTests(unittest.TestCase):
    def grid_text(self, grid):
        import io, zipfile
        from exports import export_answer_grid_docx
        with zipfile.ZipFile(io.BytesIO(export_answer_grid_docx(grid))) as z:
            return z.read('word/document.xml').decode('utf-8')

    def test_grid_has_mc_yn_and_short_sections(self):
        text = self.grid_text({'codes': ['101', '102'], 'mc': {1: {'101': 'A', '102': 'C'}},
                               'yn': {1: {'101': 'a: Đ', '102': 'a: S'}},
                               'short': {1: {'101': 'Hai', '102': 'Hai'}}})
        for needle in ('I. BẢNG ĐÁP ÁN TRẮC NGHIỆM NHIỀU LỰA CHỌN', 'II. BẢNG ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI',
                       'III. BẢNG ĐÁP ÁN TRẢ LỜI NGẮN', 'Mã 102', 'Hai'):
            self.assertIn(needle, text)

    def test_section_numbers_follow_present_kinds(self):
        text = self.grid_text({'codes': ['101'], 'short': {1: {'101': '42'}}})
        self.assertIn('I. BẢNG ĐÁP ÁN TRẢ LỜI NGẮN', text)


class LmsShortAnswerTests(unittest.TestCase):
    record = dict(grade=10, questions=[dict(type='SHORT', id='S1', slot_number=3, question='Hệ nhị phân dùng mấy chữ số?',
                                            short_answer='2')])

    def test_docx_lms_includes_short_question_and_bracketed_answer(self):
        import io, zipfile
        from exports import export_document
        raw, _, _ = export_document(self.record, 'docx', target='lms')
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            text = z.read('word/document.xml').decode('utf-8')
        self.assertIn('Hệ nhị phân dùng mấy chữ số?', text)
        self.assertIn('[Đáp án: 2]', text)

    def test_html_lms_includes_short_answer(self):
        from exports import export_document
        raw, _, _ = export_document(self.record, 'html', target='lms')
        self.assertIn('[Đáp án: 2]', raw.decode('utf-8'))


if __name__ == '__main__':
    unittest.main()


class LmsFontTests(unittest.TestCase):
    def test_lms_docx_uses_times_new_roman_for_all_scripts(self):
        import io, re, zipfile
        from exports import export_document
        raw, _, _ = export_document(dict(grade=8, questions=[dict(type='MC', question='Câu?', options=['a', 'b', 'c', 'd'], correct=0)]), 'docx', target='lms')
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            styles = z.read('word/styles.xml').decode('utf-8')
        normal = re.search(r'<w:style [^>]*w:styleId="Normal".*?</w:style>', styles, re.S).group(0)
        for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
            self.assertIn(f'{attr}="Times New Roman"', normal)
        self.assertNotIn('Theme', normal)
