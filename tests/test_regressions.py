import copy
import io
import unittest
import zipfile
import test_backend as fixtures
from bank_service import ServiceError
from exports import export_document


class ReviewRegressions(unittest.TestCase):
    setUp = fixtures.BackendTests.setUp
    revision = fixtures.BackendTests.revision
    request = fixtures.BackendTests.request

    def test_draft_questions_are_not_eligible_for_exam(self):
        bank = self.svc.state()['bank']
        for q in bank['questions']:
            q['review_status'] = 'draft'
        self.svc.import_bank(bank)
        with self.assertRaises(ServiceError) as ctx:
            self.svc.generate_exam(self.request())
        self.assertIn('shortages', ctx.exception.details)
        self.assertEqual(self.svc.state()['exams'], [])

    def test_rubric_numeric_strings_are_normalized_before_export(self):
        q = copy.deepcopy(fixtures.fixture()['questions'][0])
        for field in ('options', 'correct', 'option_explanations'):
            q.pop(field)
        q.update(id='', type='ES', question='Nhiệm vụ kiểm tra thang điểm?',
                 rubric=[dict(criterion=f'Tiêu chí {i}', points='0.25') for i in range(4)],
                 equivalent_answer_policy='Chấp nhận cách giải tương đương.')
        saved = self.svc.save_question(q)
        self.assertTrue(all(isinstance(x['points'], (int, float)) for x in saved['rubric']))
        for fmt in ('html', 'docx'):
            self.assertTrue(export_document(dict(title='Đề', grade=8, questions=[saved]), fmt, True)[0])

    def test_scaled_teacher_policy_uses_same_scale_as_rubric(self):
        q = dict(type='ES', question='Bài tính?', max_score=1, points=2,
                 rubric=[dict(criterion=f'Ý {i}', points=.25) for i in range(4)],
                 equivalent_answer_policy='Mỗi ý đủ được 0,25 điểm. Chấp nhận cách khác; tổng điểm không vượt 1,0.')
        for fmt in ('html', 'docx'):
            raw = export_document(dict(title='Đề', grade=8, questions=[q]), fmt, True)[0]
            if fmt == 'docx':
                with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                    text = archive.read('word/document.xml').decode()
            else:
                text = raw.decode()
            self.assertNotIn('0,25 điểm', text)
            self.assertIn('0,5 điểm', text)
            self.assertNotIn('không vượt 1,0', text)
            self.assertIn('không vượt 2', text)

    def test_option_shuffle_preserves_answer_feedback_and_seed(self):
        req = self.request()
        first = self.svc.generate_exam(req)
        second = self.svc.generate_exam(req)
        source = {q['id']:q for q in fixtures.fixture()['questions']}
        self.assertTrue(any(q['options'] != source[q['id']]['options'] for q in first['questions']))
        self.assertEqual([(q['id'],q['options'],q['correct']) for q in first['questions']],
                         [(q['id'],q['options'],q['correct']) for q in second['questions']])
        for q in first['questions']:
            old = source[q['id']]
            self.assertEqual(q['options'][q['correct']], old['options'][old['correct']])
            for option, reason in zip(q['options'], q['option_explanations']):
                self.assertEqual(reason, old['option_explanations'][old['options'].index(option)])
        self.assertGreaterEqual(first['revision_match_count'], first['revision_required_count'])

    def test_revision_has_school_logo_but_exam_does_not(self):
        record = dict(title='Ôn tập', grade=8, questions=[])
        for revision in (True, False):
            raw = export_document(record, 'docx', revision=revision)[0]
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                media = [name for name in archive.namelist() if name.startswith('word/media/')]
            self.assertEqual(bool(media), revision)
            html = export_document(record, 'html', revision=revision)[0].decode()
            self.assertEqual('data:image/png;base64,' in html, revision)
