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
        self.assertEqual([x['lesson_code'] for x in lessons], ['B1', 'KTGK1', 'B8a'])
        first, mid_kt, second = lessons
        self.assertEqual(first['section'], 'core')
        self.assertEqual(first['lesson_name_source'], 'Bài 1. Bài mẫu thứ nhất')
        self.assertEqual(first['topic_source'], 'Chủ đề A. Máy tính mẫu')
        self.assertEqual(first['outcomes'], ['YCCĐ một.', 'YCCĐ hai bị ngắt dòng.'])
        self.assertEqual([o['semester'] for o in first['occurrences']], [1, 1])
        self.assertEqual(mid_kt['section'], 'assessment')
        self.assertEqual(mid_kt['occurrences'][0]['periods_raw'], '3')
        self.assertEqual(second['section'], 'core')
        self.assertEqual(second['lesson_name_source'], 'Bài 8a. Bài mẫu lựa chọn')
        self.assertEqual(second['topic_source'], 'Chủ đề B. Lập trình mẫu')
        self.assertEqual(second['occurrences'][0]['semester'], 2)

    def test_thpt_docx_parses_both_core_and_elective_table_and_typos(self):
        document = docx.Document()
        document.add_paragraph('II.1. Phần cốt lõi (Định hướng Tin học ứng dụng - ICT)')
        core_rows = [
            ['Học kì 1'] * 7,
            ['Chủ đề 1. Máy tính và xã hội tri thức'] * 7,
            ['1', 'Bài 1. Hệ điều hành', '2', '1, 2', '- Nêu được chức năng hệ điều hành.', '1.1.NC1a: Khai thác HĐH.', ''],
            ['5', 'Bải 13. Cơ sở dữ liệu', '2', '9, 10', '- Hiểu được CSDL quan hệ.', '1.2.NC1b', 'Sửa lỗi Bải'],
            ['8', 'Ôn tập học kì 1', '1', '15', '- Hệ thống kiến thức HK1.', '', ''],
            ['9', 'Kiểm tra giữa HK1', '1', '16', '- Đánh giá giữa kì 1.', '', ''],
        ]
        t_core = document.add_table(rows=1 + len(core_rows), cols=7)
        for c, text in enumerate(HEADER):
            t_core.rows[0].cells[c].text = text
        for r, values in enumerate(core_rows, 1):
            for c, text in enumerate(values):
                t_core.rows[r].cells[c].text = text

        document.add_paragraph('II.2. Chuyên đề học tập lựa chọn (Định hướng ICT)')
        elective_header = ['Chuyên đề', 'Số tiết', 'Thiết bị dạy học', 'Yêu cầu cần đạt', 'Phát triển năng lực số & AI', 'Ghi chú']
        elective_rows = [
            ['Chuyên đề 1: Thực hành quản trị dự án', '10', 'Máy tính, mạng LAN', '- Lập được kế hoạch dự án.', '2.2.NC1a', ''],
            ['Chuyên đề 2: Bảo vệ dữ liệu', '10', 'Phòng máy', '- Sao lưu được dữ liệu.', '4.2.NC1a', ''],
            ['Chuyên đề 3: Thiết kế ấn phẩm số', '15', 'Máy tính', '- Xuất bản được ấn phẩm.', '3.1.NC1b', 'Tổng 35 tiết'],
        ]
        t_el = document.add_table(rows=1 + len(elective_rows), cols=6)
        for c, text in enumerate(elective_header):
            t_el.rows[0].cells[c].text = text
        for r, values in enumerate(elective_rows, 1):
            for c, text in enumerate(values):
                t_el.rows[r].cells[c].text = text

        buf = io.BytesIO()
        document.save(buf)
        lessons, issues = parse_docx(buf.getvalue(), 11, 'KHDH Tin 11 ICT.docx')
        self.assertEqual(issues, [])
        self.assertEqual([x['lesson_code'] for x in lessons], ['B1', 'B13', 'OT_HK1', 'KTGK1', 'CD1', 'CD2', 'CD3'])
        by_code = {x['lesson_code']: x for x in lessons}
        self.assertEqual(by_code['B1']['section'], 'core')
        self.assertEqual(by_code['B13']['section'], 'core')
        self.assertEqual(by_code['OT_HK1']['section'], 'review')
        self.assertEqual(by_code['KTGK1']['section'], 'assessment')
        self.assertEqual([by_code[f'CD{i}']['section'] for i in (1, 2, 3)], ['elective_topic'] * 3)
        self.assertEqual(by_code['CD1']['orientation'], 'ICT')
        self.assertIn('Máy tính, mạng LAN', by_code['CD1']['notes'])
        self.assertEqual(sum(int(by_code[f'CD{i}']['occurrences'][0]['duration_raw']) for i in (1, 2, 3)), 35)

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
        self.assertEqual(report['summary'], {'new': 3, 'changed': 0, 'unchanged': 0, 'conflict': 0})
        self.assertEqual(report['grades'], [8])
        self.assertEqual((self.dir/'bank.json').read_bytes(), before)
        result = service.apply_ppct_import(dict(payload, expected_sha256=report['sha256']))
        lessons = result['bank']['ppct']['lessons']
        self.assertEqual([x['lesson_code'] for x in lessons], ['B1', 'KTGK1', 'B8a'])
        self.assertEqual(result['bank']['ppct']['sources'][0]['sha256'], report['sha256'])
        saved_source = self.dir/'matrices/sources'/('ppct-'+report['sha256']+'.docx')
        self.assertEqual(saved_source.read_bytes(), base64.b64decode(payload['content_base64']))
        again = service.inspect_ppct_import(payload)
        self.assertEqual(again['summary']['unchanged'], 3)
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

    def test_seven_columns_preserved_across_docx_json_and_save(self):
        docx_lessons, _ = parse_docx(sample_docx(), 8, 'TIN 8 - mau.docx')
        b1_docx = next(x for x in docx_lessons if x['lesson_code'] == 'B1')
        self.assertEqual(b1_docx['digital_competencies'], ['1.1.TC2a'])
        self.assertEqual(b1_docx['occurrences'][0]['duration_raw'], '1')
        self.assertEqual(b1_docx['occurrences'][0]['ppct_raw'], '1')
        self.assertEqual(b1_docx['occurrences'][1]['ppct_raw'], '2')

        service = self.service(empty_bank())
        payload = {
            'filename': 'ppct_khoi_8.json',
            'json': {
                'lessons': [
                    {
                        'grade': 8,
                        'lesson_code': 'B1',
                        'lesson_name_source': 'Bài 1. Chuẩn 7 cột',
                        'topic_source': 'Chủ đề 1',
                        'occurrences': [{'week_raw': '1', 'duration_raw': '2', 'ppct_raw': '1, 2', 'periods_raw': '1, 2'}],
                        'outcomes': ['Nêu được ví dụ'],
                        'digital_competencies': ['1.1.TC2a: Khai thác học liệu số'],
                        'notes': 'Phòng máy',
                    }
                ]
            },
        }
        report = service.inspect_ppct_import(payload)
        row = report['lessons'][0]
        self.assertEqual(row['digital_competencies'], ['1.1.TC2a: Khai thác học liệu số'])
        self.assertEqual(row['notes'], 'Phòng máy')
        self.assertEqual(row['occurrences'][0]['duration_raw'], '2')
        self.assertEqual(row['occurrences'][0]['ppct_raw'], '1, 2')

        applied = service.apply_ppct_import(dict(payload, expected_sha256=report['sha256']))
        saved_b1 = applied['bank']['ppct']['lessons'][0]
        self.assertEqual(saved_b1['digital_competencies'], ['1.1.TC2a: Khai thác học liệu số'])
        self.assertEqual(saved_b1['notes'], 'Phòng máy')

        # Chỉ cập nhật NLS & AI và Ghi chú qua JSON
        payload_update = {
            'filename': 'ppct_khoi_8.json',
            'json': {
                'lessons': [
                    {
                        'grade': 8,
                        'lesson_code': 'B1',
                        'lesson_name_source': 'Bài 1. Chuẩn 7 cột',
                        'topic_source': 'Chủ đề 1',
                        'occurrences': [{'week_raw': '1', 'duration_raw': '2', 'ppct_raw': '1, 2'}],
                        'outcomes': ['Nêu được ví dụ'],
                        'digital_competencies': ['1.1.TC2a: Khai thác học liệu số', '5.1.TC2a: Tích hợp AI'],
                        'notes': 'Phòng máy 2',
                    }
                ]
            },
        }
        diff_update = service.inspect_ppct_import(payload_update)
        self.assertEqual(diff_update['lessons'][0]['status'], 'changed')
        self.assertEqual({c['field'] for c in diff_update['lessons'][0]['changes']}, {'Phát triển năng lực số & AI', 'Ghi chú'})

        # Lưu trực tiếp từ modal 7 cột
        bank_after = service.save_ppct_lesson({
            'grade': 8,
            'lesson_code': 'B2',
            'lesson_name_source': 'Bài 2. Lưu thủ công',
            'topic_source': 'Chủ đề 2',
            'week_raw': '2',
            'duration_raw': '2',
            'ppct_raw': '3, 4',
            'outcomes': ['Hiểu thông tin số'],
            'digital_competencies': ['1.2.TC2a: Đánh giá thông tin'],
            'notes': 'Theo QĐ 2422',
        })
        b2 = next(x for x in bank_after['ppct']['lessons'] if x['lesson_code'] == 'B2')
        self.assertEqual(b2['occurrences'][0]['duration_raw'], '2')
        self.assertEqual(b2['occurrences'][0]['ppct_raw'], '3, 4')
        self.assertEqual(b2['digital_competencies'], ['1.2.TC2a: Đánh giá thông tin'])
        self.assertEqual(b2['notes'], 'Theo QĐ 2422')

    def test_thpt_json_with_elective_topics_and_periodic_guard(self):
        path = self.dir / 'bank_thpt.json'
        path.write_text(json.dumps(empty_bank(), ensure_ascii=False), encoding='utf-8')
        service = BankService(path, self.dir, context={'allowed_grades': (10, 11, 12), 'school_profile': False})
        payload = {
            'filename': 'ppct_khoi_10_ict.json',
            'json': {
                'grade': 10,
                'subject_name': 'Tin học',
                'orientation': 'ICT',
                'lessons': [
                    {
                        'grade': 10,
                        'section': 'core',
                        'orientation': 'ICT',
                        'lesson_code': 'B1',
                        'lesson_name_source': 'Bài 1. Thông tin và xử lí thông tin',
                        'topic_source': 'Chủ đề 1',
                        'occurrences': [{'week_raw': '1', 'duration_raw': '2', 'ppct_raw': '1, 2'}],
                        'outcomes': ['Phân biệt được thông tin với dữ liệu.'],
                        'digital_competencies': ['1.1.NC1a: Tìm kiếm dữ liệu số.'],
                        'notes': '',
                    },
                    {
                        'grade': 10,
                        'section': 'assessment',
                        'lesson_code': 'KTGK1',
                        'lesson_name_source': 'Kiểm tra giữa HK1',
                        'topic_source': 'Đánh giá định kỳ',
                        'occurrences': [{'week_raw': '9', 'duration_raw': '1', 'ppct_raw': '18'}],
                        'outcomes': ['Đánh giá giữa học kì 1.'],
                        'digital_competencies': [],
                        'notes': '',
                    },
                ],
                'elective_topics': [
                    {
                        'grade': 10,
                        'section': 'elective_topic',
                        'orientation': 'ICT',
                        'lesson_code': 'CD1',
                        'lesson_name_source': 'Chuyên đề 1: Quản trị dự án',
                        'topic_source': 'Chuyên đề lựa chọn',
                        'occurrences': [{'week_raw': '', 'duration_raw': '10', 'ppct_raw': ''}],
                        'outcomes': ['Lập kế hoạch dự án trên phần mềm.'],
                        'digital_competencies': ['2.2.NC1a'],
                        'notes': 'Phòng máy',
                    },
                    {
                        'grade': 10,
                        'section': 'elective_topic',
                        'orientation': 'ICT',
                        'lesson_code': 'CD2',
                        'lesson_name_source': 'Chuyên đề 2: Bảng tính nâng cao',
                        'topic_source': 'Chuyên đề lựa chọn',
                        'occurrences': [{'week_raw': '', 'duration_raw': '10', 'ppct_raw': ''}],
                        'outcomes': ['Phân tích dữ liệu bảng tính.'],
                        'digital_competencies': [],
                        'notes': '',
                    },
                    {
                        'grade': 10,
                        'section': 'elective_topic',
                        'orientation': 'ICT',
                        'lesson_code': 'CD3',
                        'lesson_name_source': 'Chuyên đề 3: Soạn thảo nâng cao',
                        'topic_source': 'Chuyên đề lựa chọn',
                        'occurrences': [{'week_raw': '', 'duration_raw': '15', 'ppct_raw': ''}],
                        'outcomes': ['Trình bày tài liệu chuyên nghiệp.'],
                        'digital_competencies': [],
                        'notes': '',
                    },
                ],
            },
        }
        report = service.inspect_ppct_import(payload)
        self.assertEqual(report['summary']['new'], 5)
        result = service.apply_ppct_import(dict(payload, expected_sha256=report['sha256']))
        stored = {x['lesson_code']: x for x in result['bank']['ppct']['lessons']}
        self.assertEqual(set(stored), {'B1', 'KTGK1', 'CD1', 'CD2', 'CD3'})
        self.assertEqual(stored['CD1']['section'], 'elective_topic')
        self.assertEqual(stored['CD1']['orientation'], 'ICT')

        reloaded = BankService(path, self.dir, context={'allowed_grades': (10, 11, 12), 'school_profile': False})
        # Kiểm định mốc tiết KTĐK động theo PPCT và fallback >= 10 cho Khối 11-12
        self.assertEqual(reloaded._exam_period_limit(10, 'GK1'), 18)
        self.assertEqual(reloaded._exam_period_limit(11, 'CK1'), 32)
        self.assertEqual(reloaded._exam_period_limit(12, 'GK2'), 52)
        self.assertEqual(reloaded._exam_period_limit(8, 'CK1'), 16)

        # Chuyên đề lựa chọn chỉ dùng cho TX, bị chặn ở kiểm tra định kỳ (TT 22/2021 Điều 7.1)
        reloaded._reject_elective_in_periodic(10, 'TX', ['CD1'])
        with self.assertRaises(ServiceError) as err_ctx:
            reloaded._reject_elective_in_periodic(10, 'GK1', ['CD1'])
        self.assertIn('TT 22/2021', str(err_ctx.exception))

        bad_matrix = {
            'id': 'M_THPT_CD1',
            'grade': 10,
            'exam_type': 'CK1',
            'requirements': [{'id': 'r1', 'lesson_code': 'CD1', 'level': 'Biết', 'question_type': 'mcq', 'points': 1}],
            'slots': [],
        }
        with self.assertRaises(ServiceError):
            reloaded._cells_from_matrix(bad_matrix, 10, 'CK1')


if __name__ == '__main__':
    unittest.main()
