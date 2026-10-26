"""Mốc B1: quy trình duyệt câu hỏi.

draft → (kiểm tra kỹ thuật) → pending_review → approved; needs_review khi bị trả lại hoặc khi câu đã duyệt bị sửa.
Duyệt bắt buộc đủ phiếu kiểm định; trả lại bắt buộc lý do; mọi lần chuyển đều ghi lịch sử.
Không có đường tắt lên approved: lưu câu, thao tác hàng loạt, câu AI đều không tự duyệt được.
"""
import json
import tempfile
import unittest
from pathlib import Path

from bank_service import BankService, ServiceError
from domain.review import CHECKLIST, normalize_status, technical_problems
from test_backend import fixture

FULL = {item['key']: True for item in CHECKLIST}


def mc(**kw):
    q = dict(grade=8, type='MC', lesson_code='B1', level='Biết', learning_outcome='Nhận biết dữ liệu.',
             question='Câu hỏi duyệt hoàn toàn mới?', options=['Một', 'Hai', 'Ba', 'Bốn'], correct=1,
             option_explanations=['a', 'b', 'c', 'd'], max_score=1, review_status='draft')
    q.update(kw)
    return q


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name); bank = root/'bank.json'
        bank.write_text(json.dumps(fixture(), ensure_ascii=False))
        self.svc = BankService(bank, root/'data')

    def new(self, **kw):
        return self.svc.save_question(mc(**kw))

    def review(self, q, action, **kw):
        return self.svc.review_question(q['id'], action, actor=kw.pop('actor', 'gv_a'), **kw)

    def approved(self, **kw):
        q = self.new(**kw)
        q = self.review(q, 'submit')
        return self.review(q, 'approve', checklist=FULL)


class StatusTests(Base):
    def test_legacy_content_checked_reads_as_pending_review(self):
        self.assertEqual(normalize_status('content_checked'), 'pending_review')
        q = self.new(review_status='content_checked')
        self.assertEqual(q['review_status'], 'pending_review')

    def test_new_question_cannot_be_saved_as_approved(self):
        q = self.new(review_status='approved')
        self.assertEqual(q['review_status'], 'pending_review')

    def test_bulk_cannot_approve(self):
        q = self.new()
        with self.assertRaises(ServiceError):
            self.svc.bulk_questions([q['id']], 'status', 'approved')


class TransitionTests(Base):
    def test_submit_runs_technical_checks(self):
        q = self.new(option_explanations=['a', 'b', 'c', 'd'])
        self.assertEqual(self.review(q, 'submit')['review_status'], 'pending_review')

    def test_technical_problems_block_submit(self):
        self.assertIn('Có phương án trùng nhau.', technical_problems(mc(options=['Một', 'một ', 'Ba', 'Bốn'])))
        q = self.new(learning_outcome=None)  # nháp được lưu khi chưa gắn YCCĐ, nhưng không gửi duyệt được
        with self.assertRaises(ServiceError) as ctx:
            self.review(q, 'submit')
        self.assertEqual(ctx.exception.status, 400)
        self.assertIn('problems', ctx.exception.details)

    def test_approve_requires_pending_and_full_checklist(self):
        q = self.new()
        with self.assertRaises(ServiceError):
            self.review(q, 'approve', checklist=FULL)  # còn là nháp
        q = self.review(q, 'submit')
        partial = dict(FULL); partial[CHECKLIST[0]['key']] = False
        with self.assertRaises(ServiceError) as ctx:
            self.review(q, 'approve', checklist=partial)
        self.assertIn(CHECKLIST[0]['key'], ctx.exception.details['missing'])
        q = self.review(q, 'approve', checklist=FULL, actor='to_truong')
        self.assertEqual(q['review_status'], 'approved')
        last = q['review_history'][-1]
        self.assertEqual((last['action'], last['by']), ('approve', 'to_truong'))
        self.assertEqual(last['checklist'], FULL)
        self.assertTrue(last['at'])
        self.assertEqual(last['content_hash'], q['review_hash'])

    def test_return_requires_reason(self):
        q = self.review(self.new(), 'submit')
        with self.assertRaises(ServiceError):
            self.review(q, 'return', reason='  ')
        q = self.review(q, 'return', reason='Phương án C cũng đúng.')
        self.assertEqual(q['review_status'], 'needs_review')
        self.assertEqual(q['review_history'][-1]['reason'], 'Phương án C cũng đúng.')
        self.assertEqual(self.review(q, 'submit')['review_status'], 'pending_review')

    def test_unknown_action(self):
        with self.assertRaises(ServiceError):
            self.review(self.new(), 'auto_approve')


class EditInvalidatesApprovalTests(Base):
    def test_editing_approved_content_moves_to_needs_review(self):
        q = self.approved()
        edited = dict(q, correct=2, review_status='approved')
        saved = self.svc.save_question(edited)
        self.assertEqual(saved['review_status'], 'needs_review')
        self.assertEqual(saved['review_history'][-1]['action'], 'edit_after_approval')

    def test_each_content_field_counts(self):
        for field, value in [('question', 'Đổi lời câu hỏi?'), ('level', 'Hiểu'), ('options', ['Một', 'Hai', 'Ba', 'Năm'])]:
            q = self.approved(question=f'Câu gốc để thử trường {field}?')
            saved = self.svc.save_question(dict(q, **{field: value}))
            self.assertEqual(saved['review_status'], 'needs_review', field)

    def test_admin_edit_keeps_approval(self):
        q = self.approved()
        saved = self.svc.save_question(dict(q, tags=['ôn tập']))
        self.assertEqual(saved['review_status'], 'approved')

    def test_save_cannot_reapprove_after_edit(self):
        q = self.approved()
        saved = self.svc.save_question(dict(q, correct=3))
        again = self.svc.save_question(dict(saved, review_status='approved'))
        self.assertEqual(again['review_status'], 'needs_review')


class AiAndGenerationTests(Base):
    def test_ai_draft_needs_full_review(self):
        q = self.svc.save_question(mc(review_status='approved'), origin='ai_gemini')
        self.assertEqual(q['review_status'], 'draft')
        q = self.review(q, 'submit')
        q = self.review(q, 'approve', checklist=FULL)
        self.assertEqual(q['review_status'], 'approved')
        self.assertEqual(q['origin'], 'ai_gemini')

    def test_pending_questions_are_not_eligible_for_official_exams(self):
        from domain.review import EXAM_ELIGIBLE
        self.assertEqual(EXAM_ELIGIBLE, ('approved',))


if __name__ == '__main__':
    unittest.main()
