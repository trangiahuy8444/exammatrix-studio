"""Mốc B8: kiểm tra thường xuyên theo TT 22/2021/TT-BGDĐT, Điều 6.

- Khoản 1: hình thức hỏi – đáp, viết, thuyết trình, thực hành, thí nghiệm, sản phẩm học tập.
- Khoản 2 điểm b: số ĐĐGtx mỗi học kì — 35 tiết/năm: 2; trên 35 đến 70: 3; trên 70: 4.
- TT 32/2018 (Chương trình môn Tin học): THCS 35 tiết/lớp/năm học, THPT 70 tiết/lớp/năm học.
Hoạt động KTTX không giới hạn số lượng; giáo viên chọn hoạt động nào ghi vào sổ. Tổng quan chỉ cảnh báo.
"""
import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from bank_service import BankService, ServiceError
from domain.kttx import FORMS, activity_title, convert_to_10, kttx_overview, tx_count_per_semester
from test_backend import fixture


class RuleTests(unittest.TestCase):
    def test_tx_count_per_semester(self):
        for periods, expected in [(35, 2), (36, 3), (70, 3), (71, 4), (105, 4), (17, 2)]:
            self.assertEqual(tx_count_per_semester(periods), expected, periods)
        with self.assertRaises(ServiceError):
            tx_count_per_semester(0)

    def test_forms_follow_article_6(self):
        self.assertEqual([f['label'] for f in FORMS], ['Hỏi – đáp', 'Viết', 'Thuyết trình', 'Thực hành', 'Thí nghiệm',
                                                       'Sản phẩm học tập'])

    def test_title_pattern(self):
        self.assertEqual(activity_title('Tin học', 8, 2, 1), 'Tin 8_Kiểm tra thường xuyên 2 - HK I')
        self.assertEqual(activity_title('Tin học', 10, 1, 2), 'Tin 10_Kiểm tra thường xuyên 1 - HK II')
        self.assertEqual(activity_title('Vật lí', 10, 1, 2), 'Vật lí 10_Kiểm tra thường xuyên 1 - HK II')

    def test_convert_to_scale_10_and_round_like_regular_assessment(self):
        self.assertEqual(convert_to_10('15', '20'), Decimal('8'))     # 7,5 → 8 (quy ước tổ cho bài thường xuyên)
        self.assertEqual(convert_to_10('7', '10'), Decimal('7'))
        self.assertEqual(convert_to_10('29', '40'), Decimal('7'))     # 7,25 → 7
        with self.assertRaises(ServiceError):
            convert_to_10('21', '20')
        with self.assertRaises(ServiceError):
            convert_to_10('5', '0')

    def test_overview_warns_but_never_blocks(self):
        acts = [dict(grade=8, semester=1, k=1, recorded=True), dict(grade=8, semester=1, k=2, recorded=False),
                dict(grade=8, semester=1, k=3, recorded=True), dict(grade=10, semester=1, k=1, recorded=True)]
        rows = {(r['grade'], r['semester']): r for r in kttx_overview(acts, {8: 35, 10: 70}, grades=[8, 10], semesters=[1])}
        self.assertEqual((rows[(8, 1)]['required'], rows[(8, 1)]['recorded'], rows[(8, 1)]['activities']), (2, 2, 3))
        self.assertTrue(rows[(8, 1)]['ok'])
        self.assertEqual((rows[(10, 1)]['required'], rows[(10, 1)]['recorded']), (3, 1))
        self.assertFalse(rows[(10, 1)]['ok'])
        self.assertIn('thiếu 2', rows[(10, 1)]['message'])

    def test_overview_without_periods_says_so(self):
        row = kttx_overview([], {}, grades=[9], semesters=[1])[0]
        self.assertIsNone(row['required'])
        self.assertIn('chưa khai báo số tiết', row['message'])


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name); bank = root/'bank.json'
        bank.write_text(json.dumps(fixture(), ensure_ascii=False))
        self.svc = BankService(bank, root/'data')

    def save(self, **kw):
        a = dict(grade=8, semester=1, k=1, form='viet', max_score='10', recorded=True)
        a.update(kw)
        return self.svc.save_kttx(a, actor='gv_a')

    def test_save_assigns_code_title_and_periods(self):
        a = self.save()
        self.assertEqual((a['code'], a['title']), ('TX1-HK1', 'Tin 8_Kiểm tra thường xuyên 1 - HK I'))
        state = self.svc.kttx_state()
        row = next(r for r in state['overview'] if r['grade'] == 8 and r['semester'] == 1)
        self.assertEqual((row['periods_per_year'], row['required'], row['recorded']), (35, 2, 1))

    def test_validation(self):
        for bad in (dict(form='hat'), dict(max_score='0'), dict(semester=3), dict(k=0), dict(grade=11)):
            with self.assertRaises(ServiceError, msg=bad):
                self.save(**bad)

    def test_duplicate_slot_rejected_but_other_class_allowed(self):
        self.save()
        with self.assertRaises(ServiceError):
            self.save()
        self.assertEqual(self.save(class_name='8A1')['class_name'], '8A1')

    def test_update_and_delete(self):
        a = self.save()
        b = self.svc.save_kttx(dict(a, recorded=False, max_score='20'))
        self.assertEqual((b['id'], b['recorded'], b['max_score']), (a['id'], False, '20'))
        self.svc.delete_kttx(a['id'])
        self.assertEqual(self.svc.kttx_state()['activities'], [])

    def test_link_must_be_tx_exam_of_same_grade(self):
        with self.assertRaises(ServiceError):
            self.save(exam_id='KHONG_CO')


if __name__ == '__main__':
    unittest.main()


class BundleNameTests(unittest.TestCase):
    def test_linked_tx_exam_bundle_uses_activity_title(self):
        import io, zipfile
        import test_backend
        case = test_backend.BackendTests('test_total_must_be_ten_points'); case.setUp(); self.addCleanup(case.doCleanups)
        exam = case.svc.generate_exam(case.request())  # exam_type TX, khối 8
        case.svc.save_kttx(dict(grade=8, semester=1, k=2, form='viet', max_score='10', recorded=True, exam_id=exam['id']))
        raw, _, _ = case.svc.export_exam_bundle(exam['id'], None, fmt='docx')
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            self.assertTrue(all(n.startswith('Tin 8_Kiểm tra thường xuyên 2 - HK I/') for n in z.namelist()), z.namelist()[:3])


class StudyTopicClusterTests(unittest.TestCase):
    """TT 22/2021, Điều 6, khoản 3: kết quả cụm chuyên đề học tập (THPT) tính là 01 lần ĐGtx, ngoài số ở khoản 2."""

    def test_cluster_counted_separately_from_regular_count(self):
        acts = [dict(grade=10, semester=1, k=1, recorded=True, form='viet'),
                dict(grade=10, semester=1, k=2, recorded=True, form='thuc_hanh'),
                dict(grade=10, semester=1, k=3, recorded=True, form='viet'),
                dict(grade=10, semester=1, k=4, recorded=True, form='cum_chuyen_de')]
        row = kttx_overview(acts, {10: 70}, grades=[10], semesters=[1])[0]
        self.assertEqual((row['required'], row['recorded'], row['cluster_recorded']), (3, 3, 1))
        self.assertTrue(row['ok'])
        self.assertIn('cụm chuyên đề', row['message'])

    def test_more_than_one_cluster_result_warns(self):
        acts = [dict(grade=10, semester=1, k=i, recorded=True, form='viet') for i in (1, 2, 3)] + \
               [dict(grade=10, semester=1, k=4, recorded=True, form='cum_chuyen_de'),
                dict(grade=10, semester=1, k=5, recorded=True, form='cum_chuyen_de')]
        row = kttx_overview(acts, {10: 70}, grades=[10], semesters=[1])[0]
        self.assertFalse(row['ok'])
        self.assertIn('01 kết quả cụm chuyên đề', row['message'])

    def test_cluster_form_only_for_upper_secondary(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); bank = root/'bank.json'; bank.write_text(json.dumps(fixture(), ensure_ascii=False))
            svc = BankService(bank, root/'data')
            with self.assertRaises(ServiceError):
                svc.save_kttx(dict(grade=8, semester=1, k=1, form='cum_chuyen_de', max_score='10', recorded=True))
            a = svc.save_kttx(dict(grade=10, semester=1, k=1, form='cum_chuyen_de', max_score='10', recorded=True))
            self.assertEqual(a['form'], 'cum_chuyen_de')
            self.assertIn('cum_chuyen_de', [f['key'] for f in svc.kttx_state()['forms']])
