"""Ma trận → Đề cương → Đề (quyết định giáo viên 29–30/10/2026).

Đề cương tự lập theo ma trận với số câu chỉnh được; bộ đề lấy 90% câu mỗi đề từ đề cương, 10% để ngoài (ưu tiên Vận dụng);
đề có thể tạo khi chưa gắn đề cương nhưng không duyệt được; ma trận ở "Ma trận & đặc tả" dùng được làm nguồn (ô có YCCĐ).
"""
import json
import tempfile
import unittest
from pathlib import Path

from bank_service import BankService, ServiceError
from domain.exam_lifecycle import exam_status

OUTCOMES = ['Nhận biết dữ liệu.', 'Xử lí dữ liệu.']


def question(i, level, outcome=0, kind='MC'):
    q = dict(id=f'{level[:1]}{i}', grade=8, type=kind, lesson_code='B1', lesson_name='Bài 1', topic_source='Chủ đề 1',
             level=level, learning_outcome=OUTCOMES[outcome], question=f'Câu {level} số {i}?', max_score=1,
             review_status='approved', origin='expansion', semester=1, source_file='source.docx', source_rows=[],
             response_mode='Trắc nghiệm')
    q.update(options=[f'Phương án {j}' for j in range(4)], correct=i % 4,
             option_explanations=[f'Giải thích {j}' for j in range(4)])
    return q


def bank(biet=30, van_dung=10):
    lessons = [dict(grade=8, lesson_code='B1', lesson_name_source='Bài 1', topic_source='Chủ đề 1', outcomes=list(OUTCOMES),
                    occurrences=[dict(periods_raw='1', week_raw='1')])]
    questions = [question(i, 'Biết', i % 2) for i in range(biet)] + [question(i, 'Vận dụng', i % 2) for i in range(van_dung)]
    return dict(schema_version='1.0.0', metadata={}, ppct=dict(sources=[], lessons=lessons), questions=questions)


BLUEPRINT = [dict(lesson_code='B1', type='MC', level='Biết', count=8, points_per_question=1),
             dict(lesson_code='B1', type='MC', level='Vận dụng', count=2, points_per_question=1)]


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.load(bank())

    def load(self, data):
        (self.root/'bank.json').write_text(json.dumps(data, ensure_ascii=False))
        (self.root/'templates.json').write_text(json.dumps(dict(templates=[])))
        self.svc = BankService(self.root/'bank.json', self.root/'data', self.root/'templates.json')

    def request(self, **kw):
        req = dict(title='CK1 Tin 8', grade=8, exam_type='TX', exam_count=3, seed=7, duration=45, blueprint=BLUEPRINT)
        req.update(kw)
        return req


class ProposeRevisionTests(Base):
    def test_default_is_one_and_a_half_times_each_cell(self):
        plan = self.svc.propose_revision(self.request())
        self.assertEqual([(c['level'], c['need'], c['revision_count']) for c in plan['cells']], [('Biết', 8, 12), ('Vận dụng', 2, 3)])
        self.assertEqual(plan['total'], 15)
        self.assertEqual(self.svc.state()['revisions'], [])  # chỉ đề xuất, không ghi

    def test_total_is_split_by_cell_share(self):
        plan = self.svc.propose_revision(self.request(total=20))
        self.assertEqual([c['revision_count'] for c in plan['cells']], [16, 4])

    def test_counts_per_cell_and_cap_at_bank(self):
        keys = [c['key'] for c in self.svc.propose_revision(self.request())['cells']]
        plan = self.svc.propose_revision(self.request(counts={keys[0]: 9, keys[1]: 50}))
        self.assertEqual([c['revision_count'] for c in plan['cells']], [9, 10])
        self.assertIn('chỉ có 10', plan['warnings'][0])

    def test_questions_spread_over_outcomes(self):
        plan = self.svc.propose_revision(self.request(total=10))
        biet = plan['cells'][0]['question_ids']
        outcomes = [int(i[1:]) % 2 for i in biet]
        self.assertEqual(sorted(outcomes), [0, 0, 0, 0, 1, 1, 1, 1])


class ExamSetTests(Base):
    def test_large_revision_gives_disjoint_exams_with_ninety_percent_inside(self):
        result = self.svc.generate_exam_set(self.request(revision_total=30))
        exams, revision = result['exams'], result['revision']
        self.assertEqual(len(exams), 3)
        ids = [{q['id'] for q in e['questions']} for e in exams]
        self.assertEqual(sum(map(len, ids)), len(set().union(*ids)))
        self.assertEqual(result['shared_questions'], 0)
        rev_ids = set(revision['question_ids'])
        for e, qs in zip(exams, ids):
            self.assertEqual(e['revision_id'], revision['id'])
            self.assertEqual((e['revision_match_count'], e['revision_required_count']), (9, 9))
            out = qs - rev_ids
            self.assertEqual(len(out), 1)
            self.assertTrue(next(iter(out)).startswith('V'))  # ưu tiên Vận dụng
            self.assertTrue(self.svc.revision_criterion(e['id'])['passed'])

    def test_small_revision_is_allowed_and_reports_shared_questions(self):
        result = self.svc.generate_exam_set(self.request(revision_total=12))
        self.assertEqual(result['revision_size'], 12)
        self.assertGreater(result['shared_questions'], 0)
        self.assertTrue(any('dùng chung' in w for w in result['warnings']))
        for e in result['exams']:
            self.assertEqual(e['revision_match_count'], 9)

    def test_revision_too_small_for_ninety_percent_is_refused_and_saves_nothing(self):
        keys = [c['key'] for c in self.svc.propose_revision(self.request())['cells']]
        with self.assertRaises(ServiceError) as ctx:
            self.svc.generate_exam_set(self.request(revision_counts={keys[0]: 5, keys[1]: 2}))
        self.assertIn('Đề cương chưa đủ câu', str(ctx.exception))
        self.assertEqual((self.svc.state()['exams'], self.svc.state()['revisions']), ([], []))

    def test_existing_revision_can_be_used(self):
        rev = self.svc.save_revision(dict(title='ĐC có sẵn', grade=8, question_ids=[f'B{i}' for i in range(20)] + ['V0', 'V1']))
        result = self.svc.generate_exam_set(self.request(exam_count=2, revision_id=rev['id']))
        self.assertEqual(result['revision']['id'], rev['id'])
        self.assertEqual(len(self.svc.state()['revisions']), 1)
        self.assertNotIn('exam_set', self.svc.state()['revisions'][0])

    def test_shortage_in_bank_reports_cells(self):
        data = bank(biet=5)
        self.load(data)
        with self.assertRaises(ServiceError) as ctx:
            self.svc.generate_exam_set(self.request())
        self.assertEqual(ctx.exception.details['shortages'][0]['missing'], 3)

    def test_outside_question_keeps_outcome_coverage(self):
        data = bank()
        for q in data['questions']:
            if q['level'] == 'Vận dụng':
                q['learning_outcome'] = 'YCCĐ chỉ có ở Vận dụng.'
        data['ppct']['lessons'][0]['outcomes'].append('YCCĐ chỉ có ở Vận dụng.')
        self.load(data)
        result = self.svc.generate_exam_set(self.request(revision_total=30))
        for e in result['exams']:
            self.assertTrue(self.svc.revision_criterion(e['id'])['coverage']['ok'])

    def test_set_links_revision_and_exams(self):
        result = self.svc.generate_exam_set(self.request(revision_total=30))
        self.assertEqual(result['revision']['exam_set']['id'], result['exam_set']['id'])
        self.assertEqual([e['exam_set']['index'] for e in result['exams']], [1, 2, 3])

    def test_invalid_count_rejected(self):
        for bad in (0, 7, '3'):
            with self.assertRaises(ServiceError):
                self.svc.generate_exam_set(self.request(exam_count=bad))

    def test_failure_while_writing_restores_previous_records(self):
        self.svc.generate_exam_set(self.request(exam_count=2, revision_total=20))
        before = self.svc.state()
        original, calls = self.svc.generate_exam, []

        def failing(req):
            calls.append(1)
            if len(calls) == 2:
                raise ServiceError('Lỗi giả lập khi ghi đề thứ hai.')
            return original(req)
        self.svc.generate_exam = failing
        with self.assertRaises(ServiceError):
            self.svc.generate_exam_set(self.request(exam_count=2, seed=99, revision_total=20))
        after = self.svc.state()
        self.assertEqual([e['id'] for e in after['exams']], [e['id'] for e in before['exams']])
        self.assertEqual([r['id'] for r in after['revisions']], [r['id'] for r in before['revisions']])


class ExamWithoutRevisionTests(Base):
    def test_exam_can_be_generated_without_revision_but_not_approved(self):
        exam = self.svc.generate_exam(dict(title='Đề nháp', grade=8, exam_type='TX', seed=1,
                                           blueprint=[dict(BLUEPRINT[0], count=10)]))
        self.assertIsNone(exam['revision_id'])
        self.assertEqual(exam['question_count'], 10)
        self.svc.exam_transition(exam['id'], 'submit')
        with self.assertRaises(ServiceError) as ctx:
            self.svc.exam_transition(exam['id'], 'approve', actor='to_truong')
        self.assertIn('chưa gắn', json.dumps(ctx.exception.details, ensure_ascii=False))


def matrix(slots):
    reqs = [dict(id='R0', lesson_code='B1', level='Biết', text='a', ppct_outcome_index=0, competency='NLa'),
            dict(id='R1', lesson_code='B1', level='Biết', text='b', ppct_outcome_index=1, competency='NLa'),
            dict(id='R2', lesson_code='B1', level='Vận dụng', text='c', ppct_outcome_index=1, competency='NLa')]
    return dict(id='MATRIX-t', grade=8, exam_type='TX', status='locked', version=1, content_sha256='x', duration=30,
                requirements=reqs, lessons=[dict(lesson_code='B1', title='Bài 1', topic='Chủ đề 1')],
                slots=[dict(id=f'S{i}', kind='MC', number=i + 1, parts=[dict(id=f'S{i}-P', requirement_id=r, points=p)])
                       for i, (r, p) in enumerate(slots)])


class MatrixSourceTests(Base):
    def test_cells_follow_matrix_outcomes(self):
        m = matrix([('R0', 1)] * 4 + [('R1', 1)] * 4 + [('R2', 1)] * 2)
        exam = self.svc.generate_exam(dict(title='Theo ma trận', grade=8, exam_type='TX', seed=3, _matrix=m))
        got = sorted((q['level'], q['learning_outcome']) for q in exam['questions'])
        self.assertEqual(got.count(('Biết', OUTCOMES[0])), 4)
        self.assertEqual(got.count(('Biết', OUTCOMES[1])), 4)
        self.assertEqual(got.count(('Vận dụng', OUTCOMES[1])), 2)
        self.assertEqual((exam['matrix_id'], exam['duration']), ('MATRIX-t', 30))
        from domain.matrix_checks import cell_check
        self.assertTrue(cell_check(exam, exam['matrix_snapshot'], self.svc.catalog)['ok'])

    def test_matrix_must_total_ten_and_match_period(self):
        with self.assertRaises(ServiceError):
            self.svc.generate_exam(dict(title='x', grade=8, exam_type='TX', _matrix=matrix([('R0', 1)] * 9)))
        with self.assertRaises(ServiceError):
            self.svc.generate_exam(dict(title='x', grade=8, exam_type='GK1', _matrix=matrix([('R0', 1)] * 10)))

    def test_revision_linked_at_verification(self):
        m = matrix([('R0', 1)] * 4 + [('R1', 1)] * 4 + [('R2', 1)] * 2)
        exam = self.svc.generate_exam(dict(title='Đề trước', grade=8, exam_type='TX', seed=3, _matrix=m))
        with self.assertRaises(ServiceError):
            self.svc.verify_exam(exam['id'], None)
        rev = self.svc.save_revision(dict(title='ĐC sau', grade=8, question_ids=[q['id'] for q in exam['questions']]))
        checked = self.svc.verify_exam(exam['id'], None, revision_id=rev['id'])
        self.assertEqual(checked['revision_id'], rev['id'])
        self.assertTrue(checked['revision_check']['passed'])
        self.svc.exam_transition(exam['id'], 'submit')
        self.svc.exam_transition(exam['id'], 'approve', actor='to_truong')
        other = self.svc.save_revision(dict(title='ĐC khác', grade=8, question_ids=['B0']))
        with self.assertRaises(ServiceError):  # đề đã khóa không đổi đề cương
            self.svc.verify_exam(exam['id'], None, revision_id=other['id'])

    def test_propose_revision_from_matrix(self):
        m = matrix([('R0', 1)] * 4 + [('R1', 1)] * 4 + [('R2', 1)] * 2)
        plan = self.svc.propose_revision(dict(grade=8, exam_type='TX', _matrix=m, total=20))
        self.assertEqual([c['need'] for c in plan['cells']], [4, 4, 2])
        self.assertEqual(plan['total'], 20)


class ForcedQuestionIdsTests(Base):
    def setUp(self):
        super().setUp()
        self.rev = self.svc.save_revision(dict(title='ĐC', grade=8, question_ids=[f'B{i}' for i in range(10)]))

    def forced(self, ids):
        return dict(title='Đề', grade=8, exam_type='TX', revision_id=self.rev['id'], seed=1, question_ids=ids,
                    blueprint=[dict(lesson_code='B1', type='MC', level='Biết', count=10, points_per_question=1)])

    def test_forced_ids_are_used_exactly(self):
        with self.assertRaises(ServiceError):
            self.svc.generate_exam(self.forced([f'B{i}' for i in range(10, 20)]))
        ids = [f'B{i}' for i in range(9)] + ['B25']
        self.assertEqual({q['id'] for q in self.svc.generate_exam(self.forced(ids))['questions']}, set(ids))

    def test_forced_ids_from_wrong_cell_rejected(self):
        with self.assertRaises(ServiceError):
            self.svc.generate_exam(self.forced([f'B{i}' for i in range(9)] + ['V0']))


class ExamSetTransitionTests(Base):
    def setUp(self):
        super().setUp()
        self.result = self.svc.generate_exam_set(self.request(revision_total=30))
        self.set_id = self.result['exam_set']['id']
        self.revision = self.result['revision']

    def test_set_transition_lifecycle(self):
        # 1. Ban đầu tất cả đề ở drafting
        exams = [e for e in self.svc.state()['exams'] if (e.get('exam_set') or {}).get('id') == self.set_id]
        self.assertEqual(len(exams), 3)
        self.assertTrue(all(exam_status(e) == 'drafting' for e in exams))

        # Đề cương chưa cho publish vì đề thi chưa khóa
        with self.assertRaises(ServiceError) as ctx:
            self.svc.revision_transition(self.revision['id'], 'publish')
        self.assertIn('chưa được khóa', str(ctx.exception))

        # 2. Gửi duyệt cả bộ đề
        res = self.svc.exam_set_transition(self.set_id, 'submit', actor='giao_vien')
        self.assertEqual(len(res['exams']), 3)
        exams = [e for e in self.svc.state()['exams'] if (e.get('exam_set') or {}).get('id') == self.set_id]
        self.assertTrue(all(e['status'] == 'pending_approval' for e in exams))

        # Vẫn chưa cho publish đề cương
        with self.assertRaises(ServiceError):
            self.svc.revision_transition(self.revision['id'], 'publish')

        # 3. Phê duyệt & khóa cả bộ đề
        res = self.svc.exam_set_transition(self.set_id, 'approve', actor='to_truong')
        self.assertEqual(len(res['exams']), 3)
        exams = [e for e in self.svc.state()['exams'] if (e.get('exam_set') or {}).get('id') == self.set_id]
        self.assertTrue(all(e['status'] == 'locked' for e in exams))
        self.assertTrue(all(e.get('approved_hash') for e in exams))

        # 4. Lúc này bộ đề đã khóa -> Cho phép phát hành đề cương cho học sinh
        rev_pub = self.svc.revision_transition(self.revision['id'], 'publish', actor='giao_vien')
        self.assertEqual(rev_pub['status'], 'published')

        # Đề cương đã gắn với đề locked thì không được unlock
        with self.assertRaises(ServiceError):
            self.svc.revision_transition(self.revision['id'], 'unlock')

        # 5. Phát hành toàn bộ đề thi
        res = self.svc.exam_set_transition(self.set_id, 'publish', actor='ban_giam_hieu')
        self.assertEqual(len(res['exams']), 3)
        exams = [e for e in self.svc.state()['exams'] if (e.get('exam_set') or {}).get('id') == self.set_id]
        self.assertTrue(all(e['status'] == 'published' for e in exams))

    def test_publish_blocked_keeps_audit_without_publishing_any_member(self):
        self.svc.exam_set_transition(self.set_id, 'submit')
        self.svc.exam_set_transition(self.set_id, 'approve')
        records = self.svc._records('exams')
        members = [e for e in records if (e.get('exam_set') or {}).get('id') == self.set_id]
        blocked = members[1]
        blocked['questions'][0]['correct'] = (blocked['questions'][0]['correct'] + 1) % 4
        self.svc._atomic_save(self.svc.data_dir/'exams.json', records)
        before = json.loads(json.dumps(records))

        with self.assertRaises(ServiceError) as ctx:
            self.svc.exam_set_transition(self.set_id, 'publish', actor='gv_chan', reason='Thử kiểm tra')
        self.assertEqual(ctx.exception.status, 409)
        after = self.svc._records('exams')
        audit = after[1]['lifecycle'].pop()
        self.assertEqual(audit['action'], 'publish_blocked')
        self.assertEqual(audit['by'], 'gv_chan')
        self.assertEqual(audit['reason'], 'Thử kiểm tra')
        self.assertEqual(audit['from_status'], 'locked')
        self.assertEqual(after, before)

    def test_set_transition_fails_atomically(self):
        # Sửa 1 đề thành có vấn đề (hoặc trạng thái sai)
        exams = self.svc._records('exams')
        first = next(e for e in exams if (e.get('exam_set') or {}).get('id') == self.set_id)
        first['status'] = 'locked'  # cố tình để 1 đề lệch trạng thái
        self.svc._atomic_save(self.svc.data_dir/'exams.json', exams)

        with self.assertRaises(ServiceError):
            self.svc.exam_set_transition(self.set_id, 'submit')

        # Toàn bộ trạng thái không bị thay đổi dở dang
        current_exams = [e for e in self.svc.state()['exams'] if (e.get('exam_set') or {}).get('id') == self.set_id]
        statuses = [exam_status(e) for e in current_exams]
        self.assertEqual(statuses.count('drafting'), 2)
        self.assertEqual(statuses.count('locked'), 1)


if __name__ == '__main__':
    unittest.main()
