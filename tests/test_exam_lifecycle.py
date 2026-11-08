"""Mốc B2: vòng đời đề, snapshot có hash, sửa đề đã khóa làm mất phê duyệt.

Đang soạn (drafting) → Chờ duyệt (pending_approval) → Đã duyệt & khóa (locked) → Đã phát hành (published).
"""
import json
import unittest

from bank_service import ServiceError
from domain.exam_lifecycle import exam_hash, exam_status
import test_backend


class LifecycleBase(test_backend.BackendTests):
    """Dùng lại môi trường của BackendTests (ngân hàng mẫu 16 câu đã duyệt) nhưng không chạy lại các test của nó."""

    def setUp(self):
        super().setUp()
        self.exam = self.svc.generate_exam(self.request())

    def act(self, action, ident=None, **kw):
        return self.svc.exam_transition(ident or self.exam['id'], action, actor=kw.pop('actor', 'gv_a'), **kw)

    def locked(self):
        self.act('submit')
        return self.act('approve', actor='to_truong')

    def raw_exams(self):
        return json.loads((self.root/'data'/'exams.json').read_text(encoding='utf-8'))

    def write_raw(self, records):
        (self.root/'data'/'exams.json').write_text(json.dumps(records, ensure_ascii=False), encoding='utf-8')


# Không chạy lại toàn bộ test của BackendTests trong lớp con.
for name in [n for n in dir(test_backend.BackendTests) if n.startswith('test_')]:
    setattr(LifecycleBase, name, None)


class ExamLifecycleTests(LifecycleBase):
    def test_new_exam_is_drafting(self):
        self.assertEqual(exam_status(self.exam), 'drafting')
        self.assertEqual(exam_status({}), 'drafting')  # đề cũ chưa có trạng thái

    def test_full_path_records_hash_and_history(self):
        pending = self.act('submit')
        self.assertEqual(pending['status'], 'pending_approval')
        locked = self.act('approve', actor='to_truong')
        self.assertEqual(locked['status'], 'locked')
        self.assertEqual(locked['approved_hash'], exam_hash(locked))
        published = self.act('publish')
        self.assertEqual(published['status'], 'published')
        self.assertEqual([h['action'] for h in published['lifecycle']], ['submit', 'approve', 'publish'])
        self.assertEqual(published['lifecycle'][1]['by'], 'to_truong')
        usage = published['usage']
        self.assertEqual(sorted(u['id'] for u in usage['questions']), sorted(q['id'] for q in published['questions']))
        self.assertEqual(usage['exam_type'], 'TX')
        self.assertTrue(usage['published_at'])

    def test_return_requires_reason(self):
        self.act('submit')
        with self.assertRaises(ServiceError):
            self.act('return', reason='')
        back = self.act('return', reason='Câu 3 trùng đề năm trước.')
        self.assertEqual(back['status'], 'drafting')

    def test_approve_blocked_when_question_no_longer_approved(self):
        q = self.exam['questions'][0]
        self.svc.review_question(q['id'], 'return', actor='to_truong', reason='Sai đáp án.')
        self.act('submit')
        with self.assertRaises(ServiceError) as ctx:
            self.act('approve')
        self.assertIn(q['id'], json.dumps(ctx.exception.details, ensure_ascii=False))

    def test_approve_blocked_when_exam_copy_differs_from_approved_version(self):
        records = self.raw_exams()
        records[0]['questions'][0]['options'][0] = 'Phương án bị sửa trong đề'
        self.write_raw(records)
        self.act('submit')
        with self.assertRaises(ServiceError) as ctx:
            self.act('approve')
        self.assertIn('phiên bản', ctx.exception.message if hasattr(ctx.exception, 'message') else str(ctx.exception))


class LockedExamTests(LifecycleBase):
    def test_locked_exam_cannot_be_edited_verified_or_deleted(self):
        self.locked()
        for call in (lambda: self.svc.update_exam(dict(id=self.exam['id'], title='Đổi tên')),
                     lambda: self.svc.delete_exam(self.exam['id'])):
            with self.assertRaises(ServiceError) as ctx:
                call()
            self.assertEqual(ctx.exception.status, 409)

    def test_editing_pending_exam_sends_it_back_to_drafting(self):
        self.act('submit')
        updated = self.svc.update_exam(dict(id=self.exam['id'], title='Tên mới'))
        self.assertEqual(updated['status'], 'drafting')

    def test_publish_blocked_when_content_changed_after_approval(self):
        """Đổi đáp án câu 1 trực tiếp trong dữ liệu sau khi duyệt: phát hành phải bị chặn và ghi nhật ký."""
        self.locked()
        records = self.raw_exams()
        q = records[0]['questions'][0]
        q['correct'] = (q['correct'] + 1) % 4
        self.write_raw(records)
        with self.assertRaises(ServiceError) as ctx:
            self.act('publish')
        self.assertEqual(ctx.exception.status, 409)
        after = self.svc.get_record('exams', self.exam['id'])
        self.assertEqual(after['status'], 'locked')
        audit = after['lifecycle'].pop()
        self.assertEqual(audit['action'], 'publish_blocked')
        self.assertEqual(audit['by'], 'gv_a')
        self.assertEqual(audit['from_status'], 'locked')
        self.assertEqual(audit['content_hash'], exam_hash(after))
        self.assertTrue(audit['at'])
        self.assertEqual(after, records[0])

    def test_new_revision_starts_unapproved_and_keeps_original(self):
        locked = self.locked()
        rev = self.act('new_revision')
        self.assertNotEqual(rev['id'], locked['id'])
        self.assertEqual(rev['status'], 'drafting')
        self.assertEqual(rev['previous_exam_id'], locked['id'])
        self.assertNotIn('approved_hash', rev)
        self.assertEqual(self.svc.get_record('exams', locked['id'])['status'], 'locked')

    def test_bank_edit_does_not_change_published_exam(self):
        self.locked(); published = self.act('publish')
        q = self.svc.state()['bank']['questions']
        target = next(x for x in q if x['id'] == published['questions'][0]['id'])
        self.svc.save_question(dict(target, question='Nội dung đã sửa sau khi phát hành?'))
        again = self.svc.get_record('exams', published['id'])
        self.assertEqual(exam_hash(again), published['approved_hash'])

    def test_unknown_action(self):
        with self.assertRaises(ServiceError):
            self.act('force_publish')


if __name__ == '__main__':
    unittest.main()
