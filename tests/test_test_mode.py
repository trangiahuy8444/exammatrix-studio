"""
Unit tests for Clean-Slate Test Mode (Sandbox Isolation).
Ensures test mode has 0 questions, 0 exams, 0 revisions, 0 matrices,
and operations in test mode NEVER affect the live exam bank.
"""

import tempfile
import unittest
from pathlib import Path
from bank_service import BankService
from matrices.service import MatrixService
from server import setup_test_sandbox, create_server, DEFAULT_BANK


class TestModeIsolationTests(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name)
        # Create a mock live bank
        self.live_bank_file = self.data_dir / 'live_bank.json'
        # Copy PPCT from DEFAULT_BANK
        import json
        live_data = json.loads(Path(DEFAULT_BANK).read_text(encoding='utf-8'))
        self.live_bank_file.write_text(json.dumps(live_data, ensure_ascii=False), encoding='utf-8')
        (self.data_dir / 'records.json').write_text('[]', encoding='utf-8')
        (self.data_dir / 'matrices').mkdir(parents=True, exist_ok=True)
        (self.data_dir / 'matrices' / 'records.json').write_text('[]', encoding='utf-8')

        self.server = create_server(
            bank_path=self.live_bank_file,
            data_dir=self.data_dir,
            port=8799
        )

    def tearDown(self):
        self.server.server_close()
        self.temp_dir.cleanup()

    def test_test_mode_starts_with_zero_data(self):
        # 1. Verify test service state has ZERO questions and ZERO PPCT lessons
        test_state = self.server.test_service.state()
        self.assertEqual(len(test_state['bank']['questions']), 0, 'Test mode must start with 0 questions')
        self.assertEqual(len(test_state['bank']['ppct']['lessons']), 0, 'Test mode must start with 0 PPCT lessons')
        self.assertEqual(len(test_state['exams']), 0, 'Test mode must start with 0 exams')
        self.assertEqual(len(test_state['revisions']), 0, 'Test mode must start with 0 revisions')
        self.assertEqual(len(self.server.test_matrix_service.list()), 0, 'Test mode must start with 0 matrices')

        # 2. Verify live service still has its data
        live_state = self.server.service.state()
        self.assertGreater(len(live_state['bank']['questions']), 0, 'Live bank must preserve existing questions')

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

        # Check test mode has 1 question
        test_qs = self.server.test_service.state()['bank']['questions']
        self.assertEqual(len(test_qs), 1)

        # Check live bank is COMPLETELY UNTOUCHED
        live_qs = self.server.service.state()['bank']['questions']
        self.assertEqual(len(live_qs), initial_live_count, 'Live bank question count must remain identical!')
        self.assertNotIn(saved['id'], [q['id'] for q in live_qs])

    def test_reset_sandbox_restores_zero_data(self):
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
        self.server.test_service.save_question(test_q)
        self.assertEqual(len(self.server.test_service.state()['bank']['questions']), 1)

        # Reset sandbox
        self.server.reset_test_sandbox()

        # Check reset restored clean-slate
        self.assertEqual(len(self.server.test_service.state()['bank']['questions']), 0)
        self.assertEqual(len(self.server.test_service.state()['bank']['ppct']['lessons']), 0)
        self.assertEqual(len(self.server.test_service.state()['exams']), 0)
        self.assertEqual(len(self.server.test_matrix_service.list()), 0)

    def test_test_mode_ppct_creation(self):
        # PPCT starts empty
        self.assertEqual(len(self.server.test_service.state()['bank']['ppct']['lessons']), 0)
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
        self.assertEqual(len(lessons), 1)
        self.assertEqual(lessons[0]['lesson_code'], 'VL8_B1')
        self.assertEqual(lessons[0]['lesson_name_source'], 'Chuyển động cơ học')


if __name__ == '__main__':
    unittest.main()
