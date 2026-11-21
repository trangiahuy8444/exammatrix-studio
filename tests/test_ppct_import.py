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


class FiveModulesUpgradeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def test_validate_matrix_blocks_elective_in_thcs_periodic_and_non_instructional_lessons(self):
        from matrices.model import validate_matrix

        ppct = {
            '_context': {'allowed_grades': (6, 7, 8, 9, 10, 11, 12)},
            'lessons': [
                {'grade': 8, 'lesson_code': 'CD1', 'section': 'elective_topic', 'lesson_name_source': 'Chuyên đề 1', 'topic_source': 'Chuyên đề', 'outcomes': ['YCCĐ CD1']},
                {'grade': 10, 'lesson_code': 'CD1', 'section': 'elective_topic', 'orientation': 'ICT', 'lesson_name_source': 'Chuyên đề 1', 'topic_source': 'Chuyên đề lựa chọn', 'outcomes': ['YCCĐ CD1']},
                {'grade': 10, 'lesson_code': 'KTGK1', 'section': 'assessment', 'lesson_name_source': 'Kiểm tra giữa HK1', 'topic_source': 'Đánh giá', 'outcomes': ['Kiểm tra']},
            ],
        }
        base = {
            'grade': 8, 'profile': 'THCS', 'mode': 'authored', 'exam_type': 'GK1', 'duration': 45,
            'title': 'Ma trận thử nghiệm', 'school_year': '2026-2027', 'total_points': 10,
            'indicator_catalog': [],
            'lessons': [{'lesson_code': 'CD1', 'title': 'Chuyên đề 1', 'topic': 'Chuyên đề'}],
            'requirements': [{'id': 'r1', 'lesson_code': 'CD1', 'level': 'Biết', 'ppct_outcome_index': 0, 'competency': 'NLa', 'text': 'YCCĐ CD1'}],
            'slots': [{'id': 's1', 'requirement_id': 'r1', 'kind': 'MC', 'points': 10}],
        }
        res_thcs = validate_matrix(base, ppct)
        self.assertIn('elective_in_thcs', [e['code'] for e in res_thcs['errors']])

        res_thpt_gk = validate_matrix({**base, 'grade': 10, 'profile': 'THPT', 'exam_type': 'GK1', 'indicator_catalog': [{'code': 'NLa.1', 'competency': 'NLa', 'description': 'YCCĐ'}]}, ppct)
        self.assertIn('elective_in_periodic', [e['code'] for e in res_thpt_gk['errors']])

        res_thpt_tx = validate_matrix({**base, 'grade': 10, 'profile': 'THPT', 'exam_type': 'TX', 'indicator_catalog': [{'code': 'NLa.1', 'competency': 'NLa', 'description': 'YCCĐ'}]}, ppct)
        self.assertNotIn('elective_in_periodic', [e['code'] for e in res_thpt_tx['errors']])

        res_assess = validate_matrix({
            **base, 'grade': 10, 'profile': 'THPT', 'exam_type': 'GK1', 'indicator_catalog': [],
            'lessons': [{'lesson_code': 'KTGK1', 'title': 'Kiểm tra giữa HK1', 'topic': 'Đánh giá'}],
            'requirements': [{'id': 'r1', 'lesson_code': 'KTGK1', 'level': 'Biết', 'ppct_outcome_index': 0, 'competency': 'NLa', 'text': 'Kiểm tra'}],
        }, ppct)
        self.assertIn('lesson_non_instructional', [e['code'] for e in res_assess['errors']])

    def test_import_docx_accepts_grades_11_and_12_and_save_revision_rejects_elective(self):
        from matrices.import_docx import inspect_docx
        from tests.test_compact_matrix_import import THPT_MATRIX, THPT_SPEC, add_table

        for grade in (11, 12):
            doc = docx.Document()
            add_table(doc, [[f'Tin học {grade}', 'CUỐI HỌC KỲ I 2026-2027']])
            add_table(doc, [
                THPT_MATRIX,
                ['', '', 'Biết', 'Hiểu', 'Biết (a,b)', 'Hiểu/VD (c,d)', 'Vận dụng', 'Vận dụng cao', '', ''],
                ['1', 'Bài học minh họa', '1 (1)', '1 (2)', '2 (1a, 1b)', '2 (1c, 1d)', '1 (1)', '1 (2)', '3.50', '35'],
            ])
            add_table(doc, [
                THPT_SPEC,
                ['1', 'Bài học minh họa', 'MC - Biết', 'Nhận diện thành phần minh họa.', '1 câu', 'MC-1'],
                ['', '', 'ES - Vận dụng cao', 'Đề xuất cách xử lý minh họa.', '1 câu', 'ES-2'],
            ])
            buf = io.BytesIO()
            doc.save(buf)
            ppct = {'lessons': [{'grade': grade, 'lesson_code': 'B1', 'lesson_name_source': 'Bài 1. Bài học minh họa', 'outcomes': ['Nhận diện thành phần minh họa.', 'Đề xuất cách xử lý minh họa.']}]}
            report = inspect_docx(buf.getvalue(), f'Ma_tran_{grade}.docx', grade, ppct)
            self.assertEqual(report['candidate']['profile'], 'THPT')
            self.assertEqual(report['candidate']['grade'], grade)
            self.assertIn('matrix_counts', report['candidate']['source']['compact'])

        bank_data = empty_bank(
            lessons=[
                {'grade': 10, 'section': 'elective_topic', 'orientation': 'ICT', 'lesson_code': 'CD1', 'lesson_name_source': 'Chuyên đề 1', 'topic_source': 'Chuyên đề', 'outcomes': ['YCCĐ CD1'], 'occurrences': []},
            ],
            questions=[
                {
                    'id': 'K10-CD1-MC-01', 'grade': 10, 'lesson_code': 'CD1', 'ppct_section': 'elective_topic',
                    'type': 'MC', 'level': 'Biết', 'review_status': 'approved',
                    'question': 'Câu hỏi chuyên đề minh họa?', 'options': ['A', 'B', 'C', 'D'], 'correct': 0,
                    'option_explanations': ['Đúng', 'Sai', 'Sai', 'Sai'],
                    'learning_outcome': 'YCCĐ CD1',
                }
            ],
        )
        path = self.dir / 'bank.json'
        path.write_text(json.dumps(bank_data, ensure_ascii=False))
        svc = BankService(path, self.dir, context={'allowed_grades': (10, 11, 12), 'school_profile': False})
        with self.assertRaises(ServiceError):
            svc.save_revision({'title': 'Đề cương GK1', 'grade': 10, 'exam_type': 'GK1', 'question_ids': ['K10-CD1-MC-01']})

    def test_cv7991_quality_warnings_all_nine_rules_and_clean_questions(self):
        from domain.review import quality_warnings

        clean_mc = {
            'type': 'MC',
            'question': 'Trong bảng tính Excel, kí hiệu $A$1 biểu diễn loại địa chỉ ô nào?',
            'options': ['Địa chỉ tương đối', 'Địa chỉ tuyệt đối', 'Địa chỉ hỗn hợp cột', 'Địa chỉ hỗn hợp hàng'],
            'correct': 1,
        }
        self.assertEqual(quality_warnings(clean_mc), [])
        # Nhấn mạnh phủ định bằng IN HOA hoặc **in đậm** không bị cảnh báo giả
        self.assertEqual(quality_warnings({**clean_mc, 'question': 'Phát biểu nào sau đây KHÔNG đúng về RAM?'}), [])
        self.assertEqual(quality_warnings({**clean_mc, 'question': 'Phát biểu nào sau đây **không đúng** về RAM?'}), [])

        codes_Of = lambda q: {w['code'] for w in quality_warnings(q)}
        self.assertIn('mc_banned_option', codes_Of({**clean_mc, 'options': ['A', 'B', 'C', 'Tất cả các đáp án trên đều đúng']}))
        self.assertIn('mc_unemphasized_negation', codes_Of({**clean_mc, 'question': 'Phát biểu nào sau đây không đúng về bộ nhớ RAM?'}))
        self.assertIn('mc_double_negation', codes_Of({**clean_mc, 'question': 'Phát biểu nào sau đây KHÔNG đúng?', 'options': ['Không thể ghi dữ liệu', 'B', 'C', 'D']}))
        self.assertIn('mc_inline_blank', codes_Of({**clean_mc, 'question': 'Bộ nhớ ____ dùng để lưu dữ liệu tạm thời khi máy tính hoạt động.'}))
        self.assertIn('mc_length_imbalance', codes_Of({**clean_mc, 'options': ['RAM', 'ROM', 'CPU', 'Thiết bị lưu trữ dữ liệu tạm thời tốc độ cao phục vụ trực tiếp cho vi xử lí trung tâm']}))
        self.assertIn('mc_vague_or_absolute', codes_Of({**clean_mc, 'options': ['Luôn luôn an toàn trong mọi hệ thống', 'Phương án B', 'Phương án C', 'Phương án D']}))

        clean_yn = {
            'type': 'YN',
            'question': 'Khi sử dụng dịch vụ thư điện tử (Email) trong học tập và công việc:',
            'statements': [
                {'label': 'a', 'text': 'Có thể đính kèm tệp văn bản.', 'correct': True},
                {'label': 'b', 'text': 'Chỉ gửi được cho tối đa một người.', 'correct': False},
                {'label': 'c', 'text': 'Tiêu đề thư nên ngắn gọn, rõ ràng.', 'correct': True},
                {'label': 'd', 'text': 'Tệp lạ luôn an toàn.', 'correct': False},
            ],
        }
        self.assertEqual(quality_warnings(clean_yn), [])
        self.assertIn('yn_context_or_balance', codes_Of({
            **clean_yn,
            'statements': [{**s, 'correct': True} for s in clean_yn['statements']],
        }))

        clean_short = {'type': 'SHORT', 'question': 'Tính giá trị biểu thức (làm tròn đến hàng phần mười):', 'short_answer': '-2,5'}
        self.assertEqual(quality_warnings(clean_short), [])
        self.assertIn('short_answer_format', codes_Of({**clean_short, 'short_answer': '12 cm'}))
        self.assertIn('short_answer_format', codes_Of({**clean_short, 'short_answer': '12345'}))

        clean_es = {
            'type': 'ES',
            'question': 'Nêu hai biện pháp bảo vệ tài khoản cá nhân trên mạng và giải thích lí do.',
            'rubric': [{'criterion': 'Nêu đúng biện pháp 1', 'points': 0.5}, {'criterion': 'Nêu đúng biện pháp 2', 'points': 0.5}],
        }
        self.assertEqual(quality_warnings(clean_es), [])
        self.assertIn('es_rubric_or_prompt', codes_Of({'type': 'ES', 'question': 'Ngắn?', 'rubric': []}))

    def test_subject_catalogs_13_subjects_and_dynamic_competency_word_export(self):
        from docx.shared import Cm
        from matrices.competency_catalog import (
            SUBJECT_CATALOGS, default_competencies_for_subject, preset_catalog_for_subject, validate_catalog
        )
        from matrices.exports import matrix_docx
        from tests.matrix_fixtures import minimal_matrix

        self.assertEqual(len(SUBJECT_CATALOGS), 13)
        for key, entry in SUBJECT_CATALOGS.items():
            validated = validate_catalog({'competencies': entry['competencies'], 'indicators': entry['indicators']})
            self.assertGreaterEqual(len(validated['competencies']), 2, key)
            self.assertGreaterEqual(len(validated['indicators']), 4, key)

        self.assertEqual(preset_catalog_for_subject('Ngữ văn')['key'], 'ngu_van')
        self.assertEqual(preset_catalog_for_subject('GDKT&PL')['key'], 'gdktpl')
        self.assertIn('NL_CHUNG', default_competencies_for_subject('Vật lí'))

        # Kiểm định bảng năng lực Word mở rộng động cho NLd, NLe mà vẫn <= 24cm
        ppct_10 = {'lessons': [{'grade': 10, 'lesson_code': 'B1', 'lesson_name_source': 'Bài 1', 'topic_source': 'Chủ đề 1', 'outcomes': ['Nhận biết dữ liệu.']}]}
        m_tin = minimal_matrix()
        m_tin['profile'] = 'THPT'
        m_tin['grade'] = 10
        m_tin['indicator_catalog'] = SUBJECT_CATALOGS['tin_hoc']['indicators']
        m_tin['requirements'] = [
            dict(id='R1', lesson_code='B1', level='Biết', text='Nhận biết dữ liệu.', ppct_outcome_index=0, competency='NLd', choice_group=None),
            dict(id='R2', lesson_code='B1', level='Hiểu', text='Nhận biết dữ liệu.', ppct_outcome_index=0, competency='NLe', choice_group=None),
        ]
        m_tin['slots'] = [
            dict(id='S1', kind='MC', number=1, parts=[dict(id='P1', label='', requirement_id='R1', points=5, indicator='NLd.1')], scoring=dict(mode='sum_parts')),
            dict(id='S2', kind='MC', number=2, parts=[dict(id='P2', label='', requirement_id='R2', points=5, indicator='NLe.1')], scoring=dict(mode='sum_parts')),
        ]
        doc_tin = docx.Document(io.BytesIO(matrix_docx(m_tin, ppct_10, 'competencies', 'web')))
        comp_table_tin = doc_tin.tables[0]
        self.assertEqual(len(comp_table_tin.columns), 3 + 5 * 3)
        self.assertLessEqual(sum(col.width for col in comp_table_tin.columns), Cm(24))
        header_texts_tin = ' '.join(c.text for c in comp_table_tin.rows[1].cells)
        self.assertIn('NLd', header_texts_tin)
        self.assertIn('NLe', header_texts_tin)

        # Kiểm định xuất bảng năng lực cho môn Toán hiển thị đầy đủ tên năng lực
        m_math = minimal_matrix()
        m_math['profile'] = 'THPT'
        m_math['grade'] = 10
        m_math['subject_name'] = 'Toán'
        m_math['indicator_catalog'] = SUBJECT_CATALOGS['toan_hoc']['indicators']
        m_math['requirements'] = [
            dict(id='R1', lesson_code='B1', level='Biết', text='Nhận biết dữ liệu.', ppct_outcome_index=0, competency='TDLL', choice_group=None),
            dict(id='R2', lesson_code='B1', level='Hiểu', text='Nhận biết dữ liệu.', ppct_outcome_index=0, competency='MHH', choice_group=None),
        ]
        m_math['slots'] = [
            dict(id='S1', kind='MC', number=1, parts=[dict(id='P1', label='', requirement_id='R1', points=5, indicator='TD1.1')], scoring=dict(mode='sum_parts')),
            dict(id='S2', kind='MC', number=2, parts=[dict(id='P2', label='', requirement_id='R2', points=5, indicator='MH1.1')], scoring=dict(mode='sum_parts')),
        ]
        doc_math = docx.Document(io.BytesIO(matrix_docx(m_math, ppct_10, 'competencies', 'web')))
        comp_table_math = doc_math.tables[0]
        self.assertIn('Năng lực đặc thù — Toán', comp_table_math.cell(0, 3).text)
        header_texts_math = ' '.join(c.text for c in comp_table_math.rows[1].cells)
        self.assertIn('Tư duy và lập luận toán học (TDLL)', header_texts_math)
        self.assertIn('Mô hình hóa toán học (MHH)', header_texts_math)


if __name__ == '__main__':
    unittest.main()
