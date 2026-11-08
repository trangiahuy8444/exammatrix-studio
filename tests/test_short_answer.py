"""Một tên trường duy nhất cho đáp án câu trả lời ngắn: `short_answer` (mốc A2)."""
import copy
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from input_schema import canonical_short_answer
from bank_service import BankService
from exports import export_document
from ai_assistant import validate_and_sanitize_question
from test_backend import fixture


def short_q(**kw):
    q = dict(grade=8, type='SHORT', lesson_code='B1', lesson_name='Bài 1', topic_source='Chủ đề 1', level='Hiểu',
             learning_outcome='Nhận biết dữ liệu.', question='Hệ nhị phân dùng mấy chữ số?', max_score=1,
             review_status='content_checked', semester=1, response_mode='Trả lời ngắn')
    q.update(kw)
    return q


class CanonicalShortAnswerTests(unittest.TestCase):
    def test_reads_canonical_then_legacy_aliases(self):
        self.assertEqual(canonical_short_answer({'short_answer': ' 2 '}), '2')
        self.assertEqual(canonical_short_answer({'correct_answer': '2'}), '2')
        self.assertEqual(canonical_short_answer({'answer': '2'}), '2')
        self.assertEqual(canonical_short_answer({'short_answer': '2', 'correct_answer': '3'}), '2')
        self.assertEqual(canonical_short_answer({}), '')


class BankShortAnswerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name); bank = root / 'bank.json'
        bank.write_text(json.dumps(fixture(), ensure_ascii=False))
        self.svc = BankService(bank, root / 'data')

    def test_legacy_alias_is_stored_as_short_answer_only(self):
        saved = self.svc.save_question(short_q(correct_answer='2'))
        self.assertEqual(saved['short_answer'], '2')
        self.assertNotIn('correct_answer', saved)
        self.assertNotIn('answer', saved)

    def test_missing_answer_rejected_unless_draft(self):
        with self.assertRaises(Exception):
            self.svc.save_question(short_q())
        draft = self.svc.save_question(short_q(review_status='draft'))
        self.assertEqual(draft['short_answer'], '')


class ExportShortAnswerTests(unittest.TestCase):
    def record(self):
        return dict(title='Đề thử', grade=10, exam_type='CK1', duration=45, total_points=10,
                    questions=[dict(short_q(grade=10, short_answer='Hai'), id='S1', points=0.5, slot_number=1)])

    def docx_text(self, raw):
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            return z.read('word/document.xml').decode('utf-8')

    def test_teacher_key_contains_short_answer(self):
        raw, _, _ = export_document(self.record(), 'docx', answers=True)
        self.assertIn('Hai', self.docx_text(raw))

    def test_student_paper_contains_question_but_not_answer(self):
        raw, _, _ = export_document(self.record(), 'docx', answers=False)
        text = self.docx_text(raw)
        self.assertIn('Hệ nhị phân dùng mấy chữ số?', text)
        self.assertNotIn('Hai', text)


class AiShortAnswerTests(unittest.TestCase):
    def test_ai_output_uses_canonical_field(self):
        raw = dict(type='SHORT', question='Hệ nhị phân dùng mấy chữ số?', level='Hiểu', correct_answer='2')
        out = validate_and_sanitize_question(raw, 'SHORT')
        self.assertEqual(out['short_answer'], '2')
        self.assertNotIn('correct_answer', out)


if __name__ == '__main__':
    unittest.main()
