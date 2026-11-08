"""Nhập PPCT từ Word (bảng KHDH Phụ lục 1) hoặc JSON: đối chiếu trước, ghi khi xác nhận, giữ các quy tắc an toàn."""
import base64
import io
import json
import tempfile
import unittest
from pathlib import Path

import docx

from bank_service import BankService, ServiceError
from ppct_import import clean_name, outcome_lines, parse_docx, parse_json

HEADER = ['Tuần', 'Bài học', 'Số tiết', 'PPCT', 'Yêu cầu cần đạt', 'Phát triển năng lực số & AI', 'Ghi chú']


def sample_docx():
    """Bảng mẫu tự soạn theo đúng cấu trúc KHDH: dòng học kì, dòng chủ đề, dòng bài, dòng (tt), dòng kiểm tra."""
    document = docx.Document()
    document.add_paragraph('KẾ HOẠCH DẠY HỌC MẪU')
    rows = [
        ['Học kì 1: 18 tuần']*7,
        ['Chủ đề A. Máy tính mẫu']*7,
        ['1\n(01/09-12/09)', 'Bài 1. Bài mẫu thứ nhất', '1', '1', '- YCCĐ một.\n- YCCĐ hai bị ngắt\ndòng.', '1.1.TC2a', ''],
        ['2\n(14/09-19/09)', 'Bài 1. Bài mẫu thứ nhất (tt)', '1', '2', '- YCCĐ một.\n- YCCĐ hai bị ngắt\ndòng.', '1.1.TC2a', ''],
        ['3', 'Kiểm tra giữa HK1', '1', '3', 'Hệ thống kiến thức', '', ''],
        ['Học kì 2: 17 tuần']*7,
        ['4', 'Chủ đề B. Lập trình mẫu', 'Chủ đề B. Lập trình mẫu', 'Chủ đề B. Lập trình mẫu', 'Chủ đề B. Lập trình mẫu',
         'Chủ đề B. Lập trình mẫu', 'Chủ đề B. Lập trình mẫu'],
        ['5', 'Bài 8a. Bài mẫu lựa chọn (tiết 1)', '1', '5', '- YCCĐ ba.', '', ''],
    ]
    table = document.add_table(rows=1+len(rows), cols=7)
    for i, text in enumerate(HEADER):
        table.rows[0].cells[i].text = text
    for r, values in enumerate(rows, 1):
        for c, text in enumerate(values):
            table.rows[r].cells[c].text = text
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def empty_bank(lessons=None, questions=None):
    return {'schema_version': '1.0.0', 'metadata': {}, 'ppct': {'sources': [], 'lessons': lessons or []}, 'questions': questions or []}


class ParserTests(unittest.TestCase):
    def test_docx_rows_become_lessons_with_semester_topic_and_occurrences(self):
        lessons, issues = parse_docx(sample_docx(), 8, 'TIN 8 - mau.docx')
        self.assertEqual(issues, [])
        self.assertEqual([x['lesson_code'] for x in lessons], ['B1', 'B8a'])
        first, second = lessons
        self.assertEqual(first['lesson_name_source'], 'Bài 1. Bài mẫu thứ nhất')
        self.assertEqual(first['topic_source'], 'Chủ đề A. Máy tính mẫu')
        self.assertEqual(first['outcomes'], ['YCCĐ một.', 'YCCĐ hai bị ngắt dòng.'])
        self.assertEqual([o['semester'] for o in first['occurrences']], [1, 1])
        self.assertEqual(second['lesson_name_source'], 'Bài 8a. Bài mẫu lựa chọn')
        self.assertEqual(second['topic_source'], 'Chủ đề B. Lập trình mẫu')
        self.assertEqual(second['occurrences'][0]['semester'], 2)

    def test_helpers(self):
        self.assertEqual(clean_name('Bài 3. X (tt)'), 'Bài 3. X')
        self.assertEqual(outcome_lines('- A\n- B\nC'), ['A', 'B C'])
        lessons, issues = parse_json({'lessons': [{'lesson_code': 'B1', 'lesson_name': 'Bài 1. X', 'outcomes': '- A\n- B'}]}, 9)
        self.assertEqual((lessons[0]['grade'], lessons[0]['outcomes']), (9, ['A', 'B']))
        with self.assertRaises(ServiceError):
            parse_json({'lessons': []})

    def test_not_a_ppct_table(self):
        document = docx.Document(); document.add_table(rows=1, cols=2)
        buffer = io.BytesIO(); document.save(buffer)
        with self.assertRaises(ServiceError):
            parse_docx(buffer.getvalue(), 8)


class ImportFlowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def service(self, bank):
        path = self.dir/'bank.json'
        path.write_text(json.dumps(bank, ensure_ascii=False), encoding='utf-8')
        return BankService(path, self.dir)

    def payload(self):
        return dict(filename='TIN 8 - mau.docx', content_base64=base64.b64encode(sample_docx()).decode())

    def test_inspect_does_not_write_then_apply_adds_lessons_and_source(self):
        service = self.service(empty_bank())
        before = (self.dir/'bank.json').read_bytes()
        # Đối soát và xác nhận cùng một tệp, không tạo lại ZIP có timestamp mới.
        payload = self.payload()
        report = service.inspect_ppct_import(payload)
        self.assertEqual(report['summary'], {'new': 2, 'changed': 0, 'unchanged': 0, 'conflict': 0})
        self.assertEqual(report['grades'], [8])
        self.assertEqual((self.dir/'bank.json').read_bytes(), before)
        result = service.apply_ppct_import(dict(payload, expected_sha256=report['sha256']))
        lessons = result['bank']['ppct']['lessons']
        self.assertEqual([x['lesson_code'] for x in lessons], ['B1', 'B8a'])
        self.assertEqual(result['bank']['ppct']['sources'][0]['sha256'], report['sha256'])
        saved_source = self.dir/'matrices/sources'/('ppct-'+report['sha256']+'.docx')
        self.assertEqual(saved_source.read_bytes(), base64.b64decode(payload['content_base64']))
        again = service.inspect_ppct_import(payload)
        self.assertEqual(again['summary']['unchanged'], 2)
        with self.assertRaises(ServiceError) as ctx:
            service.apply_ppct_import(payload)
        self.assertEqual(ctx.exception.status, 409)

    def test_changed_sha_is_refused(self):
        service = self.service(empty_bank())
        with self.assertRaises(ServiceError) as ctx:
            service.apply_ppct_import(dict(self.payload(), expected_sha256='0'*64))
        self.assertEqual(ctx.exception.status, 409)

    def test_used_outcome_is_conflict_and_kept(self):
        old = dict(grade=8, lesson_code='B1', lesson_name_source='Bài 1: Bài mẫu thứ nhất', topic_source='Chủ đề A. Máy tính mẫu',
                   outcomes=['YCCĐ một.', 'YCCĐ cũ.'], occurrences=[])
        service = self.service(empty_bank([old]))
        service.save_question(dict(grade=8, lesson_code='B1', type='MC', level='Biết', learning_outcome='YCCĐ cũ.',
                                   question='Câu mẫu dùng YCCĐ cũ?', options=['A', 'B', 'C', 'D'], correct=0,
                                   option_explanations=['a', 'b', 'c', 'd'], review_status='draft', max_score=1))
        report = service.inspect_ppct_import(self.payload())
        b1 = next(x for x in report['lessons'] if x['lesson_code'] == 'B1')
        self.assertEqual(b1['status'], 'conflict')
        self.assertEqual(b1['conflict']['outcomes'], ['YCCĐ cũ.'])
        result = service.apply_ppct_import(self.payload())
        kept = next(x for x in result['bank']['ppct']['lessons'] if x['lesson_code'] == 'B1')
        self.assertEqual(kept['outcomes'], ['YCCĐ một.', 'YCCĐ cũ.'])
        self.assertIn('B8a', [x['lesson_code'] for x in result['bank']['ppct']['lessons']])

    def test_changed_outcomes_update_question_index_and_keep_name_format(self):
        old = dict(grade=8, lesson_code='B1', lesson_name_source='Bài 1: Bài mẫu thứ nhất', topic_source='Chủ đề cũ',
                   outcomes=['YCCĐ hai bị ngắt dòng.'], occurrences=[])
        service = self.service(empty_bank([old]))
        q = service.save_question(dict(grade=8, lesson_code='B1', type='MC', level='Biết', learning_outcome='YCCĐ hai bị ngắt dòng.',
                                       question='Câu mẫu?', options=['A', 'B', 'C', 'D'], correct=0,
                                       option_explanations=['a', 'b', 'c', 'd'], review_status='draft', max_score=1))
        report = service.inspect_ppct_import(self.payload())
        b1 = next(x for x in report['lessons'] if x['lesson_code'] == 'B1')
        self.assertEqual(b1['status'], 'changed')
        self.assertEqual({c['field'] for c in b1['changes']}, {'Chủ đề', 'Yêu cầu cần đạt'})
        result = service.apply_ppct_import(self.payload())
        lesson = next(x for x in result['bank']['ppct']['lessons'] if x['lesson_code'] == 'B1')
        self.assertEqual(lesson['lesson_name_source'], 'Bài 1: Bài mẫu thứ nhất')
        saved = next(x for x in result['bank']['questions'] if x['id'] == q['id'])
        self.assertEqual((saved['outcome_index'], saved['topic_source']), (1, 'Chủ đề A. Máy tính mẫu'))

    def test_json_import_and_grade_scope(self):
        service = self.service(empty_bank())
        data = {'lessons': [{'grade': 9, 'lesson_code': 'B2', 'lesson_name_source': 'Bài 2. JSON mẫu', 'outcomes': ['A']}]}
        result = service.apply_ppct_import({'json': data, 'filename': 'ppct.json'})
        self.assertEqual(result['bank']['ppct']['lessons'][0]['grade'], 9)
        with self.assertRaises(ServiceError):
            service.inspect_ppct_import({'json': {'lessons': [dict(data['lessons'][0], grade=12)]}})


if __name__ == '__main__':
    unittest.main()
