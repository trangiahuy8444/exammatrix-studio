"""Mốc B6: tiêu chí đề cương chặn duyệt đề; đánh dấu và duyệt câu "bám sát"."""
import json

import test_backend
from bank_service import ServiceError


class RevisionGateTests(test_backend.BackendTests):
    def setUp(self):
        super().setUp()
        self.exam = self.svc.generate_exam(self.request())
        ids = [q['id'] for q in self.exam['questions']]
        self.inside, self.outside = ids[:8], ids[8:]
        narrow = self.svc.save_revision(dict(title='Đề cương hẹp', grade=8, question_ids=self.inside))
        path = self.root/'data'/'exams.json'
        records = json.loads(path.read_text(encoding='utf-8'))
        records[0]['revision_id'] = narrow['id']  # đề chỉ còn 8/10 câu trùng đề cương → T = 80%
        path.write_text(json.dumps(records, ensure_ascii=False), encoding='utf-8')

    def approve(self):
        self.svc.exam_transition(self.exam['id'], 'submit')
        return self.svc.exam_transition(self.exam['id'], 'approve', actor='to_truong')

    def test_below_ninety_percent_blocks_approval(self):
        with self.assertRaises(ServiceError) as ctx:
            self.approve()
        self.assertIn('đề cương', json.dumps(ctx.exception.details, ensure_ascii=False))

    def test_close_matches_count_only_after_approval(self):
        for qid, rid in zip(self.outside, self.inside):
            self.svc.mark_close_match(self.exam['id'], qid, rid, 'Cùng YCCĐ, đổi số liệu.', actor='gv_a')
        with self.assertRaises(ServiceError):
            self.approve()
        self.svc.exam_transition(self.exam['id'], 'return', reason='Chờ duyệt câu bám sát')
        for qid in self.outside:
            mark = self.svc.review_close_match(self.exam['id'], qid, 'approve', actor='to_truong')
            self.assertEqual((mark['status'], mark['approved_by']), ('approved', 'to_truong'))
        locked = self.approve()
        self.assertEqual(locked['status'], 'locked')
        crit = locked['lifecycle'][-1]['revision_criterion']
        self.assertEqual((crit['exact_count'], crit['close_count'], crit['t_percent']), (8, 2, '100'))

    def test_close_match_requires_reason_and_known_revision_question(self):
        with self.assertRaises(ServiceError):
            self.svc.mark_close_match(self.exam['id'], self.outside[0], self.inside[0], '  ')
        with self.assertRaises(ServiceError):
            self.svc.mark_close_match(self.exam['id'], self.outside[0], 'KHONG_CO', 'lý do')
        with self.assertRaises(ServiceError):
            self.svc.mark_close_match(self.exam['id'], 'KHONG_CO', self.inside[0], 'lý do')

    def test_reject_requires_reason(self):
        self.svc.mark_close_match(self.exam['id'], self.outside[0], self.inside[0], 'Đổi số liệu.')
        with self.assertRaises(ServiceError):
            self.svc.review_close_match(self.exam['id'], self.outside[0], 'reject')
        mark = self.svc.review_close_match(self.exam['id'], self.outside[0], 'reject', reason='Khác YCCĐ.')
        self.assertEqual(mark['status'], 'rejected')

    def test_exact_only_mode_set_by_team_blocks_close_matches(self):
        for qid, rid in zip(self.outside, self.inside):
            self.svc.mark_close_match(self.exam['id'], qid, rid, 'Đổi số liệu.')
            self.svc.review_close_match(self.exam['id'], qid, 'approve', actor='to_truong')
        self.svc.update_exam(dict(id=self.exam['id'], revision_policy='chi_trung'))
        with self.assertRaises(ServiceError):
            self.approve()

    def test_locked_exam_close_matches_frozen(self):
        for qid, rid in zip(self.outside, self.inside):
            self.svc.mark_close_match(self.exam['id'], qid, rid, 'Đổi số liệu.')
            self.svc.review_close_match(self.exam['id'], qid, 'approve', actor='to_truong')
        self.approve()
        with self.assertRaises(ServiceError) as ctx:
            self.svc.review_close_match(self.exam['id'], self.outside[0], 'reject', reason='x')
        self.assertEqual(ctx.exception.status, 409)

    def test_verification_reports_criterion(self):
        from matrices.service import MatrixService
        report = self.svc.revision_criterion(self.exam['id'])
        self.assertEqual((report['exact_count'], report['t_percent'], report['passed']), (8, '80', False))


for name in [n for n in dir(test_backend.BackendTests) if n.startswith('test_')]:
    setattr(RevisionGateTests, name, None)


class RevisionCheckStoredTests(test_backend.BackendTests):
    def test_generated_exam_carries_revision_check_outside_hash(self):
        from domain.exam_lifecycle import exam_hash
        exam = self.svc.generate_exam(self.request())
        self.assertTrue(exam['revision_check']['passed'])
        self.assertEqual(exam['revision_check']['t_percent'], '100')
        before = exam_hash(exam)
        self.assertEqual(exam_hash(dict(exam, revision_check={'t_percent': '0'})), before)


for name in [n for n in dir(test_backend.BackendTests) if n.startswith('test_')]:
    setattr(RevisionCheckStoredTests, name, None)
