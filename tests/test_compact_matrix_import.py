"""Synthetic compact Word layouts; no school source text belongs in fixtures."""
import hashlib
import io
import unittest
import zipfile

from docx import Document
from bank_service import ServiceError
from matrices.import_docx import inspect_docx


THCS_MATRIX = ['TT', 'Chủ đề / Mạch kiến thức', 'Đơn vị kiến thức / Bài học',
               'Nhận biết (TNKQ)', 'Thông hiểu (TNKQ)', 'Vận dụng (Tự luận)',
               'Vận dụng cao (Tự luận)', 'Tổng số câu', 'Tổng điểm', 'Tỉ lệ %']
THCS_SPEC = ['TT', 'Chủ đề / Đơn vị kiến thức', 'Mức độ đánh giá',
             'Yêu cầu cần đạt (Chuẩn CT GDPT 2018)', 'Số câu hỏi theo mức độ', 'Mã câu hỏi trong đề']
THPT_MATRIX = ['TT', 'Chủ đề / Đơn vị kiến thức',
               'Phần I: TN Nhiều lựa chọn (2 câu - 0.5đ)', 'Phần I: TN Nhiều lựa chọn (2 câu - 0.5đ)',
               'Phần II: TN Đúng / Sai (1 câu - 1.00đ)', 'Phần II: TN Đúng / Sai (1 câu - 1.00đ)',
               'Phần III: Tự luận (2 câu - 2.00đ)', 'Phần III: Tự luận (2 câu - 2.00đ)', 'Tổng điểm', 'Tỉ lệ %']
THPT_SPEC = ['TT', 'Chủ đề / Đơn vị kiến thức', 'Dạng thức câu hỏi',
             'Yêu cầu cần đạt (Chương trình GDPT 2018)', 'Số lượng câu / ý', 'Mã câu hỏi trong đề']
PPCT = {'lessons': [{'grade': 8, 'lesson_code': 'B1', 'lesson_name_source': 'Bài 1. Bài học minh họa',
                     'outcomes': ['Nhận diện một thành phần minh họa.']} ]}


def add_table(doc, rows):
    table = doc.add_table(rows=0, cols=len(rows[0]))
    for values in rows:
        for cell, value in zip(table.add_row().cells, values):
            cell.text = value
    return table


def compact(grade=8, spec_rows=None, matrix_rows=None, omit_spec=False):
    doc = Document()
    add_table(doc, [[f'Tin học {grade}', 'CUỐI HỌC KỲ I 2026-2027']])
    if grade == 10:
        add_table(doc, [THPT_MATRIX,
            ['', '', 'Biết', 'Hiểu', 'Biết (a,b)', 'Hiểu/VD (c,d)', 'Vận dụng', 'Vận dụng cao', '', ''],
            *(matrix_rows or [['1', 'Bài học minh họa', '1 (1)', '1 (2)', '2 (1a, 1b)', '2 (1c, 1d)', '1 (1)', '1 (2)', '3.50', '35']])])
        spec_rows = spec_rows or [['1', 'Bài học minh họa', 'MC - Biết', 'Nhận diện một thành phần minh họa.', '1 câu', 'MC-1'],
                                  ['', '', 'ES - Vận dụng cao', 'Đề xuất một cách xử lý minh họa.', '1 câu', 'ES-2']]
        headers = THPT_SPEC
    else:
        add_table(doc, [THCS_MATRIX, *(matrix_rows or [['1', 'Chủ đề minh họa', 'Bài học minh họa', '1 (1)', '1 (2)', '1 (1)', '1 (2)', '4', '2.50', '25']])])
        spec_rows = spec_rows or [['1', 'Bài học minh họa', 'Nhận biết', 'Nhận diện một thành phần minh họa.', '1 câu', 'TN1'],
                                  ['', '', 'Thông hiểu', 'Giải thích một thao tác minh họa.', '1 câu', 'TN2'],
                                  ['', '', 'Vận dụng', 'Thực hiện một thao tác minh họa.', '1 câu', 'TL1'],
                                  ['', '', 'Vận dụng cao', 'Đề xuất một cách xử lý minh họa.', '1 câu', 'TL2']]
        headers = THCS_SPEC
    if not omit_spec:
        add_table(doc, [headers, *spec_rows])
    buf = io.BytesIO(); doc.save(buf)
    return buf.getvalue()


class CompactMatrixImportTests(unittest.TestCase):
    def test_exact_lesson_outcomes_refs_and_source_points_build_reviewable_slots(self):
        ppct = {'lessons': [{'grade': 8, 'lesson_code': 'B1', 'lesson_name_source': 'Bài 1. Bài học minh họa',
                            'outcomes': ['Nhận diện thành phần.', 'Đề xuất phương án.']}]}
        raw = compact(matrix_rows=[['1', 'Chủ đề minh họa', 'Bài 1. Bài học minh họa',
            '1 (MC1; 0,25đ)', '0', '0', '1 (ES1; 9,75đ)', '2', '10', '100']],
            spec_rows=[['1', 'Bài 1. Bài học minh họa', 'Biết', 'Nhận diện thành phần.', '1 câu', 'MC1'],
                       ['', '', 'Vận dụng cao', 'Đề xuất phương án.', '1 câu', 'ES1']])
        result = inspect_docx(raw, 'compact.docx', 8, ppct)
        m = result['candidate']
        self.assertEqual([(s['id'], s['parts'][0]['points']) for s in m['slots']], [('MC-1', .25), ('ES-1', 9.75)])
        self.assertEqual([r['ppct_outcome_index'] for r in m['requirements']], [0, 1])
        self.assertEqual([r['lesson_code'] for r in m['requirements']], ['B1', 'B1'])
        self.assertFalse(m['reconciliation']['confirmed'])
        self.assertEqual([i['code'] for i in result['issues']], ['compact_reconciliation_required'])

    def test_explicit_lesson_number_conflict_is_not_mapped_by_title(self):
        raw = compact(matrix_rows=[['1', 'Chủ đề minh họa', 'Bài 2. Bài học minh họa',
            '1 (MC1; 10đ)', '0', '0', '0', '1', '10', '100']],
            spec_rows=[['1', 'Bài 2. Bài học minh họa', 'Biết',
                        'Nhận diện một thành phần minh họa.', '1 câu', 'MC1']])
        result = inspect_docx(raw, 'compact.docx', 8, PPCT)
        self.assertIn('source_mapping_ambiguous', [i['code'] for i in result['issues']])
        self.assertTrue(all(not r['lesson_code'] for r in result['candidate']['requirements']))
        self.assertEqual(result['candidate']['slots'], [])

    def test_thcs_preview_keeps_source_and_four_levels_without_approving_mapping(self):
        raw = compact(); result = inspect_docx(raw, '../../compact.docx', 8, PPCT)
        m = result['candidate']
        self.assertEqual(m['status'], 'draft')
        self.assertEqual(m['exam_type'], 'CK1')
        self.assertFalse(m['reconciliation']['confirmed'])
        self.assertIn('compact_reconciliation_required', [i['code'] for i in result['issues']])
        self.assertEqual(len(result['raw_tables']), 2)
        self.assertEqual([t['index'] for t in result['raw_tables']], [1, 2])
        self.assertEqual(m['source']['sha256'], hashlib.sha256(raw).hexdigest())
        self.assertEqual(m['source']['name'], 'compact.docx')
        self.assertEqual({r['level'] for r in m['requirements']}, {'Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'})
        self.assertEqual(m['slots'], [])
        self.assertEqual(m['source']['compact']['matrix_counts'], {'MC': {'Biết': 1, 'Hiểu': 1}, 'ES': {'Vận dụng': 1, 'Vận dụng cao': 1}})

    def test_thpt_two_header_rows_preview_has_mixed_level_issue(self):
        result = inspect_docx(compact(10), 'compact.docx', 10, {})
        self.assertEqual(result['candidate']['profile'], 'THPT')
        self.assertEqual(result['raw_tables'][0]['columns'], 10)
        self.assertIn('source_level_ambiguous', [i['code'] for i in result['issues']])
        self.assertTrue(any(r['level'] == 'Vận dụng cao' for r in result['candidate']['requirements']))
        self.assertEqual(result['candidate']['slots'], [])

    def test_missing_pair_and_duplicate_pair_are_explicit(self):
        with self.assertRaisesRegex(ServiceError, '10/6'):
            inspect_docx(compact(omit_spec=True), 'compact.docx', 8, {})
        doc = Document(io.BytesIO(compact()))
        add_table(doc, [THCS_SPEC, ['1', 'Minh họa', 'Biết', 'Minh họa.', '1', 'TN1']])
        buf = io.BytesIO(); doc.save(buf)
        with self.assertRaisesRegex(ServiceError, '10/6'):
            inspect_docx(buf.getvalue(), 'compact.docx', 8, {})

    def test_unknown_ten_column_header_is_not_accepted_by_column_count(self):
        doc = Document(io.BytesIO(compact())); doc.tables[1].cell(0, 6).text = 'Không phải mức độ'
        buf = io.BytesIO(); doc.save(buf)
        with self.assertRaises(ServiceError):
            inspect_docx(buf.getvalue(), 'compact.docx', 8, {})

    def test_tampered_specification_count_and_matrix_totals_raise_issues(self):
        raw = compact(spec_rows=[['1', 'Bài học minh họa', 'Biết', 'Minh họa.', '2 câu', 'TN1']])
        result = inspect_docx(raw, 'compact.docx', 8, PPCT)
        self.assertIn('source_count_disagreement', [i['code'] for i in result['issues']])

    def test_explicit_cell_points_do_not_replace_declared_row_points(self):
        ppct = {'lessons': [{'grade': 8, 'lesson_code': 'B1', 'lesson_name_source': 'Bài học minh họa',
                            'outcomes': ['Một yêu cầu.']}]}
        raw = compact(matrix_rows=[['1', 'Minh họa', 'Bài học minh họa', '1 (MC1; 10đ)', '0', '0', '0', '1', '9', '90']],
                      spec_rows=[['1', 'Bài học minh họa', 'Biết', 'Một yêu cầu.', '1 câu', 'MC1']])
        result = inspect_docx(raw, 'compact.docx', 8, ppct)
        self.assertIn('source_points_disagreement', [i['code'] for i in result['issues']])
        self.assertEqual(result['candidate']['slots'], [])
        self.assertEqual(result['candidate']['source']['compact']['matrix_rows'][0]['declared_points'], '9')

    def test_additional_spec_level_is_not_silently_ignored(self):
        raw = compact(spec_rows=[['1', 'Bài học minh họa', 'Vận dụng', 'Một yêu cầu.', '1 câu', 'MC3']])
        result = inspect_docx(raw, 'compact.docx', 8, PPCT)
        self.assertTrue(any(i['code']=='source_count_disagreement' and 'MC, Vận dụng:' in i['message'] for i in result['issues']))

    def test_unread_cells_and_ranges_do_not_create_false_numeric_conflicts(self):
        raw = compact(matrix_rows=[['1', 'Minh họa', 'Bài học minh họa', '1 (MC1; 1đ)', 'chưa rõ', '0', '0', '2', '2', '20']],
                      spec_rows=[['1', 'Bài học minh họa', 'Biết', 'Một yêu cầu.', '2 câu', 'MC1-MC2']])
        result = inspect_docx(raw, 'compact.docx', 8, PPCT)
        self.assertNotIn('source_points_disagreement', [i['code'] for i in result['issues']])
        self.assertFalse(any('phân bố ma trận khác' in i['message'] for i in result['issues']))
        raw = compact(matrix_rows=[['1', 'Minh họa', 'Bài học minh họa', '1 (1)', '1 (2)', '1 (1)', '1 (2)', '5', '2.50', '25']])
        result = inspect_docx(raw, 'compact.docx', 8, PPCT)
        self.assertIn('source_count_disagreement', [i['code'] for i in result['issues']])

    def test_ranges_grouped_lessons_and_outcome_similarity_are_not_guessed(self):
        raw = compact(spec_rows=[['1', 'Bài 1 và Bài 2', 'Biết', 'Nhận diện một thành phần khác.', '2 câu', 'TN1-TN2']])
        result = inspect_docx(raw, 'compact.docx', 8, PPCT)
        self.assertIn('source_refs_ambiguous', [i['code'] for i in result['issues']])
        self.assertIn('source_mapping_ambiguous', [i['code'] for i in result['issues']])
        self.assertTrue(all(r['ppct_outcome_index'] is None for r in result['candidate']['requirements']))
        self.assertTrue(all(not r['lesson_code'] for r in result['candidate']['requirements']))

    def test_grade_header_and_archive_guards_still_apply(self):
        for grade in (True, 7, 10):
            with self.assertRaises(ServiceError): inspect_docx(compact(), 'compact.docx', grade, {})
        for raw in (b'bad', b''):
            with self.assertRaises(ServiceError): inspect_docx(raw, 'compact.docx', 8, {})
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as archive: archive.writestr('../word/document.xml', 'bad')
        with self.assertRaises(ServiceError): inspect_docx(buf.getvalue(), 'compact.docx', 8, {})


if __name__ == '__main__':
    unittest.main()
