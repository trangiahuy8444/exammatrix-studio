"""Đáp án lồng trong ý Đ/S phải bị loại ở mọi độ sâu, không đổi bản gốc."""
import copy
import unittest
from domain.answer_access import redact_answers, ANSWER_KEYS

class NestedAnswerRedactionTests(unittest.TestCase):
    def test_statements_redact_nested_answers_and_preserve_public_structure(self):
        payload = {'id': 'sample', 'statements': [
            {'text': 'Ý giả một', 'correct': True, 'rubric': 'barem giả',
             'metadata': {'answer': 'đáp án giả', 'label': 'giữ nhãn'},
             'children': [{'solution': 'lời giải giả', 'text': 'giữ ý'}]},
            {'text': 'Ý giả hai', 'option_explanations': ['giải thích giả']},
            'nhãn công khai']}
        before = copy.deepcopy(payload)
        clean = redact_answers(payload)
        self.assertEqual(clean, {'id': 'sample', 'statements': [
            {'text': 'Ý giả một', 'metadata': {'label': 'giữ nhãn'}, 'children': [{'text': 'giữ ý'}]},
            {'text': 'Ý giả hai'}, 'nhãn công khai']})
        self.assertEqual(payload, before)

    def test_every_answer_field_is_removed_inside_nested_statement_lists(self):
        fields = {key: 'bí mật giả' for key in ANSWER_KEYS}
        payload = {'statements': [{'statements': [dict(fields, text='giữ')]}]}
        self.assertEqual(redact_answers(payload), {'statements': [{'statements': [{'text': 'giữ'}]}]})
