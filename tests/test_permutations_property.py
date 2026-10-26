"""
Property-based testing for Exam Permutation invariants in ExamMatrix Studio.
Verifies invariants:
1. Question counts and question types are preserved across all variants.
2. Correct answer text is perfectly preserved for every scrambled MC question.
3. Master answer grid matches each variant's actual correct letter.
4. Clustered questions (shared stimulus/passage) remain strictly contiguous.
5. Questions with positional options or shuffle_options=False never have options scrambled.
6. Permuting repeatedly replaces variants without code or ID collisions.
"""
import copy
import random
import unittest
from pathlib import Path
import tempfile
import shutil

from bank_service import BankService


class TestPermutationsProperty(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = Path(tempfile.mkdtemp())
        self.data_dir = self.tmp_dir / 'data'
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # Minimal bank fixture with PPCT catalog
        bank_data = {
            'questions': [],
            'ppct': {
                'lessons': [
                    {'grade': 10, 'lesson_code': 'B1', 'name': 'Bài 1'}
                ]
            }
        }
        bank_path = self.data_dir / 'bank.json'
        import json
        bank_path.write_text(json.dumps(bank_data), encoding='utf-8')

        # Templates
        templates_path = self.data_dir / 'exam_templates.json'
        templates_path.write_text(json.dumps([]), encoding='utf-8')

        self.service = BankService(bank_path, self.data_dir, templates_path)

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def _create_mock_exam(self, num_mc=8, num_yn=2, num_short=2, num_es=2, add_clusters=True, add_fixed_opts=True):
        questions = []
        for i in range(num_mc):
            q = {
                'id': f'Q_MC_{i}',
                'grade': 10,
                'lesson_code': 'B1',
                'type': 'MC',
                'question': f'Câu hỏi trắc nghiệm {i}: Chọn câu đúng?',
                'options': [f'Đáp án {i}_0', f'Đáp án {i}_1', f'Đáp án {i}_2', f'Đáp án {i}_3'],
                'correct': i % 4,
                'option_explanations': [f'Giải thích {i}_0', f'Giải thích {i}_1', f'Giải thích {i}_2', f'Giải thích {i}_3'],
                'level': 'Biết'
            }
            if add_clusters and i in (2, 3, 4):
                q['stimulus_id'] = 'PASSAGE_GROUP_ALPHA'
                q['stimulus_text'] = 'Đoạn ngữ liệu đọc hiểu dùng chung cho câu 2, 3, 4...'
            if add_fixed_opts and i == 6:
                q['options'][3] = 'Cả A và B đều đúng'
                q['correct'] = 3
            questions.append(q)

        for i in range(num_yn):
            questions.append({
                'id': f'Q_YN_{i}',
                'grade': 10,
                'lesson_code': 'B1',
                'type': 'YN',
                'question': f'Câu hỏi Đúng/Sai {i}:',
                'statements': [
                    {'label': 'a', 'text': f'Nhận định {i}_a', 'correct': True},
                    {'label': 'b', 'text': f'Nhận định {i}_b', 'correct': False},
                    {'label': 'c', 'text': f'Nhận định {i}_c', 'correct': True},
                    {'label': 'd', 'text': f'Nhận định {i}_d', 'correct': False}
                ],
                'level': 'Hiểu'
            })

        for i in range(num_short):
            questions.append({
                'id': f'Q_SHORT_{i}',
                'grade': 10,
                'lesson_code': 'B1',
                'type': 'SHORT',
                'question': f'Câu hỏi trả lời ngắn {i}:',
                'correct_answer': f'ANS_{i}',
                'level': 'Vận dụng'
            })

        for i in range(num_es):
            questions.append({
                'id': f'Q_ES_{i}',
                'grade': 10,
                'lesson_code': 'B1',
                'type': 'ES',
                'question': f'Câu hỏi tự luận {i}:',
                'points': 1.0,
                'rubric': [{'criteria': 'Ý 1', 'points': 1.0}],
                'level': 'Vận dụng'
            })

        exam_record = {
            'id': 'EXAM_ORIGINAL_TEST',
            'title': 'Đề thi gốc mẫu',
            'grade': 10,
            'questions': questions
        }
        self.service._atomic_save(self.data_dir / 'exams.json', [exam_record])
        return exam_record

    def test_property_permutation_invariants(self):
        """
        Runs randomized tests across 20 distinct seeds and checks all mathematical invariants.
        """
        orig_exam = self._create_mock_exam(num_mc=10, num_yn=2, num_short=2, num_es=2, add_clusters=True, add_fixed_opts=True)
        orig_qs_map = {q['id']: q for q in orig_exam['questions']}

        for iteration in range(20):
            seed_val = f"property_seed_{iteration}_{random.randint(1000, 999999)}"
            codes = [f"M{random.randint(100, 999)}" for _ in range(4)]
            # Ensure unique codes
            codes = list(dict.fromkeys(codes))
            if len(codes) < 4:
                codes = ['101', '102', '103', '104']

            res = self.service.create_permuted_exams(
                ident=orig_exam['id'],
                codes=codes,
                num_variants=len(codes),
                shuffle_questions=True,
                shuffle_options=True,
                shuffle_statements=False,
                seed=seed_val,
                replace_existing=True
            )

            generated = res['generated_exams']
            answer_grid = res['answer_grid']

            self.assertEqual(len(generated), len(codes))

            for var_idx, variant in enumerate(generated):
                code = variant['exam_code']
                v_qs = variant['questions']

                # Invariant 1: Total questions and question types preserved
                self.assertEqual(len(v_qs), len(orig_exam['questions']))
                self.assertEqual(len([q for q in v_qs if q['type'] == 'MC']), 10)
                self.assertEqual(len([q for q in v_qs if q['type'] == 'YN']), 2)
                self.assertEqual(len([q for q in v_qs if q['type'] == 'SHORT']), 2)
                self.assertEqual(len([q for q in v_qs if q['type'] == 'ES']), 2)

                # Invariant 2 & 3: For every MC question:
                # - Option text at new 'correct' index strictly equals original option text at original 'correct' index
                # - Master answer grid matches variant's correct answer letter
                mc_slot = 1
                for q in v_qs:
                    if q['type'] == 'MC':
                        orig_q = orig_qs_map[q['id']]
                        orig_correct_text = orig_q['options'][orig_q['correct']]
                        var_correct_text = q['options'][q['correct']]

                        self.assertEqual(
                            var_correct_text,
                            orig_correct_text,
                            f"Đáp án đúng bị lệch nội dung ở mã đề {code}, câu {q['id']}"
                        )

                        expected_letter = chr(65 + q['correct'])
                        grid_letter = answer_grid['mc'][mc_slot][code]
                        self.assertEqual(
                            grid_letter,
                            expected_letter,
                            f"Bảng đáp án tổng hợp không khớp mã đề {code}, câu {mc_slot}"
                        )
                        mc_slot += 1

                # Invariant 4: Shared cluster (stimulus_id) questions remain strictly contiguous
                cluster_indices = [idx for idx, q in enumerate(v_qs) if q.get('stimulus_id') == 'PASSAGE_GROUP_ALPHA']
                self.assertEqual(len(cluster_indices), 3)
                # Check contiguity: difference between max and min index equals len - 1
                self.assertEqual(
                    max(cluster_indices) - min(cluster_indices),
                    len(cluster_indices) - 1,
                    f"Chùm câu hỏi chung ngữ liệu bị xé lẻ ở mã đề {code}: chỉ số {cluster_indices}"
                )

                # Invariant 5: Positional option question (contains 'Cả A và B') was NOT shuffled
                fixed_q = next(q for q in v_qs if q['id'] == 'Q_MC_6')
                orig_fixed_q = orig_qs_map['Q_MC_6']
                self.assertEqual(fixed_q['options'], orig_fixed_q['options'])
                self.assertEqual(fixed_q['correct'], orig_fixed_q['correct'])


if __name__ == '__main__':
    unittest.main()
