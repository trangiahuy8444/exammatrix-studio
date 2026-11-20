"""Dữ liệu minh họa tự soạn; báo cáo cấu trúc không thay kết luận chuyên môn."""
import copy
import json
import unittest
from pathlib import Path
from domain.exam_comparison import compare_exams
from domain.errors import ServiceError


def examples():
    return json.loads((Path(__file__).parent / 'fixtures/exam_comparison.json').read_text())


class ComparisonTests(unittest.TestCase):
    def test_same_cell_total_does_not_hide_different_question_weights(self):
        exams = examples()
        for ex, weights in zip(exams, ([1, 9], [5, 5])):
            for q, points in zip(ex['questions'], weights):
                q.update(type='MC', level='Biết', lesson_code='B1', learning_outcome='Cùng YCCĐ', points=points)
        pair = compare_exams(exams)['pairs'][0]
        self.assertFalse(pair['same_structure'])
        self.assertIn('question_weights', pair['differences'])

    def test_equal_structure_is_not_claim_of_equal_difficulty(self):
        exams = examples()
        before = copy.deepcopy(exams)
        report = compare_exams(exams)
        self.assertTrue(report['pairs'][0]['same_structure'])
        self.assertEqual(report['pairs'][0]['overlap_percent'], 0)
        self.assertEqual(exams, before)
        self.assertNotIn('correct', json.dumps(report))
        self.assertIn('độ khó', report['limitation'])

    def test_crossed_cells_detected_even_when_marginals_match(self):
        exams = examples()
        exams[1]['questions'][0]['level'], exams[1]['questions'][1]['level'] = 'Hiểu', 'Biết'
        # Giữ điểm từng câu bằng nhau để các tổng riêng theo mức độ đều bằng nhau.
        for ex in exams:
            for q in ex['questions']:
                q['points'] = 5
        pair = compare_exams(exams)['pairs'][0]
        self.assertFalse(pair['same_structure'])
        self.assertIn('cells', pair['differences'])

    def test_incomplete_invalid_points_and_empty_exam_are_inconclusive(self):
        for value in (None, '', True, -1, 'NaN', 'Infinity', [], {}):
            exams = examples()
            exams[1]['questions'][0]['points'] = value
            self.assertIsNone(compare_exams(exams)['pairs'][0]['same_structure'])
        exams = examples()
        exams[1]['questions'] = []
        self.assertIsNone(compare_exams(exams)['pairs'][0]['same_structure'])

    def test_context_missing_metadata_and_duplicate_question_ids(self):
        for key in ('grade', 'subject_name', 'exam_type', 'duration'):
            exams = examples()
            del exams[1][key]
            self.assertIsNone(compare_exams(exams)['pairs'][0]['same_structure'])
        exams = examples()
        exams[1]['grade'] = 10
        self.assertFalse(compare_exams(exams)['pairs'][0]['same_structure'])
        exams = examples()
        exams[1]['questions'][1]['id'] = exams[1]['questions'][0]['id']
        self.assertIsNone(compare_exams(exams)['pairs'][0]['same_structure'])

    def test_shared_ids_and_family_are_explicit(self):
        exams = examples()
        exams[1]['questions'][0]['id'] = exams[0]['questions'][0]['id']
        exams[1]['parent_exam_id'] = exams[0]['id']
        pair = compare_exams(exams)['pairs'][0]
        self.assertEqual(pair['shared_question_ids'], 1)
        self.assertEqual(pair['overlap_percent'], 33.33)
        self.assertTrue(pair['same_family'])

    def test_bounds_and_decimal_accumulation(self):
        for value in (None, {}, [], examples()[:1], examples() * 4, [examples()[0]] * 2):
            with self.assertRaises(ServiceError):
                compare_exams(value)
        exams = examples()
        for ex in exams:
            ex['questions'][0]['points'], ex['questions'][1]['points'] = 0.1, 0.2
        self.assertEqual(compare_exams(exams)['summaries'][0]['total_points'], 0.3)

    def test_three_exams_generate_all_pairs(self):
        exams = examples()
        third = copy.deepcopy(exams[0])
        third['id'] = 'E3'
        self.assertEqual(len(compare_exams(exams + [third])['pairs']), 3)
