"""Mốc B7: hoán vị cùng bộ câu, bảng đối chiếu mã đề và tự kiểm tra trước khi lưu.

Mỗi mã đề phải có đúng bộ câu của đề gốc, cùng điểm và cùng phiên bản nội dung (đáp án, giải thích, ý Đ/S,
đáp án trả lời ngắn, hướng dẫn chấm); chỉ đổi thứ tự câu và phương án. Ý a–d của câu Đ/S giữ nguyên theo mặc định.
"""
import copy
import io
import json
import random
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import docx

from bank_service import BankService, ServiceError
from domain.permutation import mapping_rows, verify_codes


def parent_exam():
    qs = []
    for i in range(8):
        qs.append(dict(id=f'M{i}', type='MC', slot_number=i + 1, points=0.25, question=f'Câu trắc nghiệm {i}?',
                       options=[f'Phương án {i}-{j}' for j in range(4)], correct=i % 4,
                       option_explanations=[f'Giải thích {i}-{j}' for j in range(4)]))
    qs.append(dict(id='Y1', type='YN', slot_number=1, points=1.0, question='Xét các nhận định:',
                   statements=[dict(label=l, text=f'Ý {l}', correct=l in 'ad') for l in 'abcd']))
    qs.append(dict(id='S1', type='SHORT', slot_number=1, points=0.5, question='Kết quả là?', short_answer='42'))
    qs.append(dict(id='E1', type='ES', slot_number=1, points=6.5, question='Viết chương trình.',
                   rubric=[dict(criterion='Đúng cú pháp', points=0.5), dict(criterion='Đúng kết quả', points=0.5)]))
    return dict(id='GOC', title='Đề gốc', grade=10, exam_type='CK1', questions=qs)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name); bank = root/'bank.json'
        bank.write_text(json.dumps({'ppct': {'lessons': []}, 'questions': []}))
        self.svc = BankService(bank, root)
        self.root = root
        self.svc._atomic_save(root/'exams.json', [parent_exam()])

    def permute(self, seed='b7', codes=('101', '102', '103', '104')):
        return self.svc.create_permuted_exams('GOC', codes=list(codes), seed=seed)


class MappingTests(Base):
    def test_result_has_mapping_for_every_code_and_question(self):
        res = self.permute()
        rows = res['mapping']
        self.assertEqual(len(rows), 4 * len(parent_exam()['questions']))
        parent = {q['id']: q for q in parent_exam()['questions']}
        children = {e['exam_code']: {q['id']: q for q in e['questions']} for e in res['generated_exams']}
        for r in rows:
            src, child = parent[r['question_id']], children[r['code']][r['question_id']]
            self.assertEqual(r['source_slot'], src['slot_number'])
            self.assertEqual(r['slot'], child['slot_number'])
            self.assertEqual(r['points'], format(child['points'], 'g'))
            if r['kind'] == 'MC':
                self.assertEqual(r['answer'], 'ABCD'[child['correct']])
                self.assertEqual(r['source_answer'], 'ABCD'[src['correct']])
        yn = next(r for r in rows if r['kind'] == 'YN')
        self.assertEqual(yn['answer'], 'a: Đ, b: S, c: S, d: Đ')  # ý a–d giữ nguyên
        self.assertEqual(next(r for r in rows if r['kind'] == 'SHORT')['answer'], '42')

    def test_property_many_seeds_answers_and_points_follow_source(self):
        for i in range(25):
            res = self.permute(seed=f'p{i}-{random.random()}')
            self.assertEqual(verify_codes(parent_exam(), res['generated_exams']), [])


class VerifyTests(Base):
    def children(self):
        return copy.deepcopy(self.permute()['generated_exams'])

    def test_detects_changed_answer(self):
        ch = self.children()
        mc = next(q for q in ch[0]['questions'] if q['type'] == 'MC')
        mc['correct'] = (mc['correct'] + 1) % 4
        self.assertTrue(any(ch[0]['exam_code'] in p and mc['id'] in p for p in verify_codes(parent_exam(), ch)))

    def test_detects_changed_points_missing_question_and_yn(self):
        ch = self.children()
        ch[0]['questions'][0]['points'] = 1
        ch[1]['questions'].pop()
        yn = next(q for q in ch[2]['questions'] if q['type'] == 'YN'); yn['statements'][0]['correct'] = False
        problems = ' '.join(verify_codes(parent_exam(), ch))
        for code in (ch[0]['exam_code'], ch[1]['exam_code'], ch[2]['exam_code']):
            self.assertIn(code, problems)

    def test_inconsistent_codes_are_never_saved(self):
        with patch('bank_service.verify_codes', return_value=['Mã 101: lỗi giả lập']):
            with self.assertRaises(ServiceError) as ctx:
                self.permute()
        self.assertEqual(ctx.exception.status, 409)
        self.assertEqual(len(json.loads((self.root/'exams.json').read_text(encoding='utf-8'))), 1)


class ExportTests(Base):
    def test_mapping_docx_and_bundle(self):
        from exports import export_mapping_docx
        res = self.permute()
        d = docx.Document(io.BytesIO(export_mapping_docx(res['mapping'], res['clean_codes'], dict(title='Đề gốc'))))
        text = '\n'.join([p.text for p in d.paragraphs] + [c.text for t in d.tables for r in t.rows for c in r.cells])
        self.assertIn('Câu gốc', text)
        self.assertIn('Mã đề 101', text)
        self.assertIn('mọi mã đề giữ đúng bộ câu', text)
        raw, _, _ = self.svc.export_exam_bundle('GOC', None, fmt='docx')
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            self.assertTrue(any(n.endswith('Bang_doi_chieu_ma_de.docx') for n in z.namelist()))


if __name__ == '__main__':
    unittest.main()


class MappingRouteTests(Base):
    def test_mapping_file_for_parent_and_child_and_error_without_codes(self):
        with self.assertRaises(ServiceError):
            self.svc.export_permutation_mapping('GOC')
        res = self.permute()
        raw, name = self.svc.export_permutation_mapping('GOC')
        self.assertTrue(raw.startswith(b'PK')); self.assertIn('GOC', name)
        child = res['generated_exams'][0]['id']
        self.assertTrue(self.svc.export_permutation_mapping(child)[0].startswith(b'PK'))
