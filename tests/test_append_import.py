"""Nhập thêm câu hỏi (Excel/Markdown/AI) không được xóa câu đang có."""
import json
import tempfile
import unittest
from pathlib import Path

from bank_service import BankService, ServiceError
from test_backend import fixture


def es(question, code='B1', outcome='Nhận biết dữ liệu.'):
    return dict(grade=8, type='ES', level='Vận dụng', lesson_code=code, learning_outcome=outcome, question=question,
                rubric=[dict(criterion=f'Ý {i}', points=0.25) for i in range(4)], max_score=1,
                equivalent_answer_policy='Chấp nhận cách làm tương đương.', review_status='approved')


def mc(question, code='B1'):
    return dict(grade=8, type='MC', level='Biết', lesson_code=code, learning_outcome='Xử lí dữ liệu.', question=question,
                options=['Một', 'Hai', 'Ba', 'Bốn'], correct=2, review_status='draft')


class AppendImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        data = fixture()
        data['ppct']['lessons'].append(dict(grade=8, lesson_code='B8a', lesson_name_source='Bài 8a', topic_source='Chủ đề 4',
                                            outcomes=['Nhận biết dữ liệu.', 'Xử lí dữ liệu.'], occurrences=[dict(periods_raw='9', week_raw='9')]))
        self.bank = Path(self.tmp.name) / 'bank.json'
        self.bank.write_text(json.dumps(data, ensure_ascii=False))
        self.svc = BankService(self.bank, Path(self.tmp.name))

    def test_append_keeps_existing_and_skips_duplicates(self):
        before = self.svc.state()['bank']['questions']
        res = self.svc.append_questions([mc('Câu mới thứ nhất?'), es('Tự luận mới?'), mc(before[0]['question'])])
        qs = res['bank']['questions']
        self.assertEqual(len(qs), len(before) + 2)
        self.assertEqual([q['id'] for q in qs[:len(before)]], [q['id'] for q in before])
        self.assertEqual(res['report'], dict(added=2, skipped=1, skipped_items=res['report']['skipped_items']))
        self.assertTrue(all(q['review_status'] == 'draft' for q in qs[len(before):]))

    def test_append_fixes_lesson_code_case(self):
        res = self.svc.append_questions([mc('Câu thuộc bài 8a?', code='B8A')])
        self.assertEqual(res['bank']['questions'][-1]['lesson_code'], 'B8a')

    def test_append_rejects_whole_file_and_writes_nothing(self):
        original = self.bank.read_bytes()
        bad = es('Tự luận thiếu tiêu chí?'); bad['rubric'] = bad['rubric'][:1]
        cases = [[mc('Câu hợp lệ?'), mc('Câu sai bài?', code='B99')],
                 [mc('Câu hợp lệ?'), dict(mc('Câu sai YCCĐ?'), learning_outcome='Không có trong PPCT')],
                 [mc('Câu hợp lệ?'), bad],
                 [mc('Câu lặp trong tệp?'), mc('Câu lặp trong tệp?')]]
        for items in cases:
            with self.assertRaises(ServiceError) as ctx:
                self.svc.append_questions(items)
            self.assertEqual(ctx.exception.details['loi'][0]['stt'], 2)
            self.assertEqual(self.bank.read_bytes(), original)

    def test_append_only_duplicates_is_reported(self):
        q = self.svc.state()['bank']['questions'][0]
        with self.assertRaises(ServiceError):
            self.svc.append_questions([mc(q['question'])])

    def test_append_fuzzy_outcome_normalization(self):
        res = self.svc.append_questions([
            mc('Câu với dấu chấm và chữ thường?', code='B8a'),
            dict(mc('Câu chứa cụm từ chính?', code='B8a'), learning_outcome='Học sinh nhận biết dữ liệu trong bài học')
        ])
        qs = res['bank']['questions']
        self.assertEqual(qs[-2]['learning_outcome'], 'Xử lí dữ liệu.')
        self.assertEqual(qs[-1]['learning_outcome'], 'Nhận biết dữ liệu.')


if __name__ == '__main__':
    unittest.main()
