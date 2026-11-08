"""
Unit tests for Test Mode (Sandbox Isolation).
Test mode starts with a COPY of the live PPCT and questions (giáo viên yêu cầu 28/10/2026: "chức năng test cần có sẵn
câu hỏi"), a copy of the live matrices, 0 exams, 0 revisions; operations in test mode NEVER affect the live exam bank.
"""

import json
import tempfile
import unittest
from pathlib import Path
from bank_service import BankService
from matrices.service import MatrixService
from server import setup_test_sandbox, create_server
from test_backend import fixture


class TestModeIsolationTests(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name)
        # Create a mock live bank
        self.live_bank_file = self.data_dir / 'live_bank.json'
        # Dữ liệu tự soạn: test không phụ thuộc kho câu hỏi riêng của giáo viên.
        live_data = fixture()
        self.live_bank_file.write_text(json.dumps(live_data, ensure_ascii=False), encoding='utf-8')
        (self.data_dir / 'records.json').write_text('[]', encoding='utf-8')
        (self.data_dir / 'matrices').mkdir(parents=True, exist_ok=True)
        (self.data_dir / 'matrices' / 'records.json').write_text('[]', encoding='utf-8')

        self.server = create_server(
            bank_path=self.live_bank_file,
            data_dir=self.data_dir,
            port=0
        )

    def tearDown(self):
        self.server.server_close()
        self.temp_dir.cleanup()

    def test_test_mode_starts_with_copy_of_live_questions(self):
        live_state = self.server.service.state()
        test_state = self.server.test_service.state()
        self.assertGreater(len(live_state['bank']['questions']), 0)
        self.assertEqual([q['id'] for q in test_state['bank']['questions']], [q['id'] for q in live_state['bank']['questions']])
        self.assertEqual(len(test_state['bank']['ppct']['lessons']), len(live_state['bank']['ppct']['lessons']))
        self.assertEqual(len(test_state['exams']), 0, 'Test mode must start with 0 exams')
        self.assertEqual(len(test_state['revisions']), 0, 'Test mode must start with 0 revisions')
        self.assertEqual(len(self.server.test_matrix_service.list()), 0, 'Test mode copies the live matrices (none here)')
        self.assertNotEqual(self.server.test_service.bank_path, self.server.service.bank_path)

    def test_empty_live_bank_gets_self_written_sample(self):
        import json
        from domain.test_seed import SAMPLE_SOURCE
        empty = self.data_dir / 'empty_live.json'
        empty.write_text(json.dumps({'schema_version': '1.0.0', 'metadata': {}, 'ppct': {'sources': [], 'lessons': []},
                                     'questions': []}), encoding='utf-8')
        other = self.data_dir / 'other'
        t_bank, t_dir = setup_test_sandbox(other, bank_source=empty, clean=True)
        questions = BankService(t_bank, t_dir).state()['bank']['questions']
        self.assertGreaterEqual(len(questions), 12)
        self.assertEqual({q['type'] for q in questions}, {'MC', 'YN', 'SHORT', 'ES'})
        self.assertTrue(all(q['source_file'] == SAMPLE_SOURCE and q['review_status'] == 'approved' for q in questions))

    def test_test_mode_mutations_do_not_affect_live_bank(self):
        initial_live_count = len(self.server.service.state()['bank']['questions'])

        # Add a question in test mode (draft with 0 initial PPCT)
        test_q = {
            'subject_name': 'Tin học',
            'grade': 8,
            'lesson_code': 'B1',
            'type': 'MC',
            'level': 'Biết',
            'learning_outcome': 'YCCĐ thử nghiệm trong chế độ Test',
            'question': 'Câu hỏi thử nghiệm trong Sandbox?',
            'options': ['Phương án 1', 'Phương án 2', 'Phương án 3', 'Phương án 4'],
            'correct': 0,
            'review_status': 'draft'
        }
        saved = self.server.test_service.save_question(test_q)
        self.assertIsNotNone(saved.get('id'))

        # Check test mode has one more question than the copied live bank
        test_qs = self.server.test_service.state()['bank']['questions']
        self.assertEqual(len(test_qs), initial_live_count + 1)

        # Check live bank is COMPLETELY UNTOUCHED
        live_qs = self.server.service.state()['bank']['questions']
        self.assertEqual(len(live_qs), initial_live_count, 'Live bank question count must remain identical!')
        self.assertNotIn(saved['id'], [q['id'] for q in live_qs])

    def test_reset_sandbox_restores_fresh_copy(self):
        # Add question in test mode
        test_q = {
            'subject_name': 'Toán học',
            'grade': 8,
            'lesson_code': 'B1',
            'type': 'MC',
            'level': 'Biết',
            'learning_outcome': 'YCCĐ môn Toán',
            'question': 'Câu hỏi thử nghiệm 2?',
            'options': ['A', 'B', 'C', 'D'],
            'correct': 1,
            'review_status': 'draft'
        }
        live_count = len(self.server.service.state()['bank']['questions'])
        self.server.test_service.save_question(test_q)
        self.assertEqual(len(self.server.test_service.state()['bank']['questions']), live_count + 1)

        # Reset sandbox
        self.server.reset_test_sandbox()

        # Check reset restored a fresh copy of the live questions
        self.assertEqual(len(self.server.test_service.state()['bank']['questions']), live_count)
        self.assertEqual(len(self.server.test_service.state()['exams']), 0)
        self.assertEqual(len(self.server.test_matrix_service.list()), 0)

    def test_sandbox_copies_live_matrices_without_touching_them(self):
        live = self.data_dir / 'matrices' / 'records.json'
        live.write_text(json.dumps([dict(id='MATRIX-live', grade=9, exam_type='GK1', status='locked', title='Ma trận thật')]),
                        encoding='utf-8')
        self.server.reset_test_sandbox()
        self.assertEqual([m['id'] for m in self.server.test_matrix_service.list()], ['MATRIX-live'])
        sandbox = self.data_dir / 'test_sandbox' / 'matrices' / 'records.json'
        sandbox.write_text('[]', encoding='utf-8')
        self.assertEqual(json.loads(live.read_text(encoding='utf-8'))[0]['id'], 'MATRIX-live')

    def test_test_mode_ppct_creation(self):
        before = len(self.server.test_service.state()['bank']['ppct']['lessons'])
        # Add a custom PPCT lesson in test mode
        lesson_payload = {
            'subject_name': 'Vật lí',
            'grade': 8,
            'lesson_code': 'VL8_B1',
            'lesson_name': 'Chuyển động cơ học',
            'periods': 2,
            'outcomes': ['Nêu được dấu hiệu nhận biết chuyển động cơ học']
        }
        saved_bank = self.server.test_service.save_ppct_lesson(lesson_payload)
        lessons = saved_bank.get('ppct', {}).get('lessons', [])
        self.assertEqual(len(lessons), before + 1)
        added = next(x for x in lessons if x['lesson_code'] == 'VL8_B1')
        self.assertEqual(added['lesson_name_source'], 'Chuyển động cơ học')


if __name__ == '__main__':
    unittest.main()
