"""Mốc B5: cảnh báo trùng nguyên văn và câu vừa dùng (chỉ cảnh báo, không chặn)."""
import unittest
from datetime import datetime, timedelta, timezone

from domain.reuse import bank_duplicates, exact_hash, recent_uses

NOW = datetime(2026, 12, 20, tzinfo=timezone.utc)


def mc(ident, text='Máy tính đầu tiên ra đời năm nào?', options=('1946', '1950', '1960', '1970'), **kw):
    q = dict(id=ident, type='MC', question=text, options=list(options), correct=0)
    q.update(kw)
    return q


def published(ident, questions, days_ago, **kw):
    e = dict(id=ident, title=f'Đề {ident}', status='published', questions=questions,
             published_at=(NOW - timedelta(days=days_ago)).isoformat())
    e.update(kw)
    return e


class ExactHashTests(unittest.TestCase):
    def test_normalization_spaces_case_unicode_and_option_order(self):
        a = mc('A')
        b = mc('B', text='  máy TÍNH đầu tiên   ra đời năm nào? ', options=('1970', '1960', '1950', '1946'))
        decomposed = mc('C', text='Máy tính đầu tiên ra đời năm nào?')  # dấu tổ hợp (NFD)
        self.assertEqual(exact_hash(a), exact_hash(b))
        self.assertEqual(exact_hash(a), exact_hash(decomposed))

    def test_different_content_differs(self):
        self.assertNotEqual(exact_hash(mc('A')), exact_hash(mc('B', options=('1946', '1950', '1960', '1980'))))
        self.assertNotEqual(exact_hash(mc('A')), exact_hash(mc('B', text='Máy tính đầu tiên ra đời ở đâu?')))


class BankDuplicateTests(unittest.TestCase):
    def test_duplicate_in_another_grade_is_reported(self):
        bank = [mc('K8-1', grade=8), mc('K9-1', grade=9, text='Câu khác hẳn?')]
        self.assertEqual([d['id'] for d in bank_duplicates(mc('K10-1', grade=10), bank)], ['K8-1'])
        self.assertEqual(bank_duplicates(mc('K8-1', grade=8), bank), [])  # không tự trùng với chính nó


class RecentUseTests(unittest.TestCase):
    def test_same_id_or_same_content_in_recent_published_exam(self):
        exam = dict(id='NEW', questions=[mc('Q1', slot_number=1), mc('Q2', text='Câu mới?', slot_number=2)])
        exams = [published('OLD', [mc('X9', text='MÁY TÍNH đầu tiên ra đời năm nào?')], 30),
                 published('OLDER', [mc('Q2', text='Câu mới?')], 400),
                 dict(published('DRAFT', [mc('Q1')], 5), status='locked')]
        uses = recent_uses(exam, exams, now=NOW, days=365)
        self.assertEqual([(u['question_id'], u['other_exam_id'], u['match']) for u in uses], [('Q1', 'OLD', 'content')])
        self.assertEqual(uses[0]['slot_number'], 1)

    def test_window_is_configurable(self):
        exam = dict(id='NEW', questions=[mc('Q2', text='Câu mới?')])
        exams = [published('OLDER', [mc('Q2', text='Câu mới?')], 400)]
        self.assertEqual(recent_uses(exam, exams, now=NOW, days=365), [])
        self.assertEqual(recent_uses(exam, exams, now=NOW, days=500)[0]['match'], 'id')

    def test_sibling_codes_and_self_are_ignored(self):
        exam = dict(id='CODE-101', parent_exam_id='BASE', questions=[mc('Q1')])
        exams = [published('BASE', [mc('Q1')], 1), published('CODE-102', [mc('Q1')], 1, parent_exam_id='BASE'),
                 published('CODE-101', [mc('Q1')], 1, parent_exam_id='BASE')]
        self.assertEqual(recent_uses(exam, exams, now=NOW), [])


if __name__ == '__main__':
    unittest.main()
