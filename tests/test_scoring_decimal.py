"""Mốc B3: chấm câu Đúng/Sai bằng Decimal và mẫu hồ sơ dạng câu.

Quy ước tổ bộ môn xác nhận ngày 26/10/2026:
- Điểm câu Đ/S = điểm tối đa của câu × hệ số theo số ý đúng; bảng mặc định {0: 0, 1: 0,1, 2: 0,25, 3: 0,5, 4: 1}.
- Ý bỏ trống, chọn cả Đúng lẫn Sai hoặc dữ liệu lỗi tính là ý sai.
- Điểm toàn bài lấy đến chữ số thập phân thứ nhất sau khi làm tròn (TT 22/2021/TT-BGDĐT, Điều 5).
- THCS (trường hiện hành): MC, tự luận. THPT (CV 7991): MC, Đúng/Sai, trả lời ngắn, tự luận. KTTX: giáo viên chọn.
"""
import unittest
from decimal import Decimal

from bank_service import ServiceError
from domain.profiles import allowed_kinds
from domain.scoring import DEFAULT_YN_TABLE, round_total, validate_yn_table, yn_correct_count, yn_score

KEY = [True, False, True, False]


class YnScoringTests(unittest.TestCase):
    def test_default_table(self):
        self.assertEqual(DEFAULT_YN_TABLE, {0: Decimal('0'), 1: Decimal('0.1'), 2: Decimal('0.25'),
                                            3: Decimal('0.5'), 4: Decimal('1')})

    def test_score_by_correct_count(self):
        cases = [([True, False, True, False], '1'), ([True, False, True, True], '0.5'),
                 ([True, True, True, True], '0.25'), ([False, True, True, True], '0.1'), ([False, True, False, True], '0')]
        for responses, expected in cases:
            self.assertEqual(yn_score(Decimal('1'), responses, KEY), Decimal(expected), responses)

    def test_fractional_max_points_have_no_float_error(self):
        self.assertEqual(yn_score(Decimal('0.25'), [True, True, True, True], KEY), Decimal('0.0625'))
        self.assertEqual(yn_score('0.25', [False, True, True, True], KEY), Decimal('0.025'))  # 0,25 × 0,1
        self.assertEqual(yn_score(0.5, [True, False, True, True], KEY), Decimal('0.25'))      # float đầu vào đổi qua str

    def test_blank_both_or_invalid_answers_count_as_wrong(self):
        for bad in (None, '', 'both', 'Đúng', 1, 0, [True, False], {'a': True}):
            self.assertEqual(yn_correct_count([bad, False, True, False], KEY), 3, bad)
        self.assertEqual(yn_correct_count([True, False], KEY), 2)          # thiếu ý = sai
        self.assertEqual(yn_correct_count(None, KEY), 0)

    def test_custom_table_is_validated(self):
        ok = {0: '0', 1: '0.1', 2: '0.2', 3: '0.5', 4: '1'}
        self.assertEqual(validate_yn_table(ok)[2], Decimal('0.2'))
        self.assertEqual(validate_yn_table({'0': 0, '1': 0.1, '2': 0.25, '3': 0.5, '4': 1})[1], Decimal('0.1'))
        for bad in ({0: '0', 1: '0.5', 2: '0.25', 3: '0.5', 4: '1'},   # không được giảm khi đúng thêm ý
                    {0: '0', 1: '0.1', 2: '0.25', 3: '0.5', 4: '0.9'},  # đúng cả 4 ý phải được trọn điểm
                    {0: '0', 1: '0.1', 2: '0.25', 3: '0.5'},             # thiếu mức
                    {0: '0', 1: 'abc', 2: '0.25', 3: '0.5', 4: '1'},
                    {0: '0', 1: 'nan', 2: '0.25', 3: '0.5', 4: '1'},
                    {0: '-0.1', 1: '0.1', 2: '0.25', 3: '0.5', 4: '1'}):
            with self.assertRaises(ServiceError, msg=bad):
                validate_yn_table(bad)

    def test_score_uses_custom_table(self):
        table = validate_yn_table({0: '0', 1: '0', 2: '0.25', 3: '0.5', 4: '1'})
        self.assertEqual(yn_score('1', [False, True, True, True], KEY, table), Decimal('0'))


class RoundingTests(unittest.TestCase):
    def test_total_rounded_to_one_decimal_half_up(self):
        for raw, expected in [('7.25', '7.3'), ('7.24', '7.2'), ('7.35', '7.4'), ('8.05', '8.1'), ('9.95', '10.0'),
                              ('0.0625', '0.1'), ('0.049', '0.0'), ('10', '10.0')]:
            self.assertEqual(round_total(Decimal(raw)), Decimal(expected), raw)

    def test_sum_of_many_small_scores_is_exact(self):
        parts = [yn_score('0.25', [False, True, True, True], KEY)] * 40  # 40 × 0,025 = 1,0 đúng tuyệt đối
        self.assertEqual(sum(parts, Decimal(0)), Decimal('1.000'))
        self.assertEqual(round_total(sum(parts, Decimal(0))), Decimal('1.0'))


class ProfileTests(unittest.TestCase):
    def test_profile_defaults(self):
        self.assertEqual(allowed_kinds({'profile': 'THCS'}), ('MC', 'ES'))
        self.assertEqual(allowed_kinds({'profile': 'THPT'}), ('MC', 'YN', 'SHORT', 'ES'))
        self.assertEqual(allowed_kinds({'profile': 'GENERAL'}), ('MC', 'YN', 'SHORT', 'ES'))

    def test_teacher_chosen_kinds_for_kttx(self):
        self.assertEqual(allowed_kinds({'profile': 'THCS', 'allowed_kinds': ['YN', 'MC']}), ('MC', 'YN'))
        with self.assertRaises(ServiceError):
            allowed_kinds({'profile': 'THCS', 'allowed_kinds': ['TF']})
        with self.assertRaises(ServiceError):
            allowed_kinds({'profile': 'THCS', 'allowed_kinds': []})


if __name__ == '__main__':
    unittest.main()


class RoundingByExamTypeTests(unittest.TestCase):
    """Quy ước tổ (27/10/2026): GK/CK làm tròn đến 0,1 (7,25 → 7,3); KTTX làm tròn đến số nguyên (7,5 → 8)."""

    def test_rounding_mode_follows_exam_type(self):
        from domain.scoring import rounding_for
        self.assertEqual(rounding_for('TX'), 'half_up_integer')
        for t in ('GK1', 'CK1', 'GK2', 'CK2'):
            self.assertEqual(rounding_for(t), 'half_up_1dp')

    def test_integer_rounding_for_regular_assessment(self):
        for raw, expected in [('7.5', '8'), ('7.49', '7'), ('8.45', '8'), ('9.5', '10'), ('0.5', '1'), ('6.0', '6')]:
            self.assertEqual(round_total(Decimal(raw), 'half_up_integer'), Decimal(expected), raw)

    def test_periodic_rounding_unchanged(self):
        self.assertEqual(round_total(Decimal('7.25'), 'half_up_1dp'), Decimal('7.3'))
        self.assertEqual(round_total(Decimal('7.25')), Decimal('7.3'))

    def test_unknown_rounding_rejected(self):
        with self.assertRaises(ServiceError):
            round_total(Decimal('7.25'), 'banker')

    def test_default_policy_for_exam_type(self):
        from domain.scoring import default_policy
        self.assertEqual(default_policy('TX')['rounding'], 'half_up_integer')
        self.assertEqual(default_policy('CK1')['rounding'], 'half_up_1dp')
        self.assertEqual(default_policy('TX')['yn_table']['1'], '0.1')
