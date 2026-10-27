"""Chấm điểm bằng Decimal (mốc B3).

- Câu Đúng/Sai: điểm = điểm tối đa của câu × hệ số theo số ý trả lời đúng. Ý bỏ trống, chọn cả hai hoặc dữ liệu lỗi
  là ý sai (quy ước tổ bộ môn xác nhận 26/10/2026; CV 7991 không quy định cách tính điểm từng ý).
- Điểm toàn bài lấy đến chữ số thập phân thứ nhất sau khi làm tròn (TT 22/2021/TT-BGDĐT, Điều 5). Văn bản không nói
  cách làm tròn; dùng làm tròn thông thường (từ 5 trở lên làm tròn lên).
"""
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from domain.errors import ServiceError

DEFAULT_YN_TABLE = {0: Decimal('0'), 1: Decimal('0.1'), 2: Decimal('0.25'), 3: Decimal('0.5'), 4: Decimal('1')}
DEFAULT_POLICY = dict(yn_table={str(k): str(v) for k, v in DEFAULT_YN_TABLE.items()}, rounding='half_up_1dp',
                      blank_counts_as='wrong')


def dec(value):
    """Đổi sang Decimal qua chuỗi để 0.1 (float) thành đúng 0,1; từ chối NaN/vô cực."""
    try:
        out = Decimal(str(value).strip().replace(',', '.'))
    except (InvalidOperation, ValueError):
        raise ServiceError('Giá trị điểm không hợp lệ.', {'value': str(value)})
    if not out.is_finite():
        raise ServiceError('Giá trị điểm không hợp lệ.', {'value': str(value)})
    return out


def validate_yn_table(table):
    if not isinstance(table, dict):
        raise ServiceError('Bảng hệ số Đúng/Sai phải là bảng số ý đúng → hệ số.')
    try:
        parsed = {int(k): dec(v) for k, v in table.items()}
    except (TypeError, ValueError):
        raise ServiceError('Bảng hệ số Đúng/Sai có số ý không hợp lệ.')
    if sorted(parsed) != [0, 1, 2, 3, 4]:
        raise ServiceError('Bảng hệ số Đúng/Sai cần đủ các mức 0, 1, 2, 3, 4 ý đúng.')
    values = [parsed[k] for k in range(5)]
    if any(v < 0 or v > 1 for v in values):
        raise ServiceError('Hệ số phải nằm trong khoảng 0 đến 1.')
    if any(a > b for a, b in zip(values, values[1:])):
        raise ServiceError('Hệ số không được giảm khi học sinh đúng thêm ý.')
    if values[4] != 1:
        raise ServiceError('Đúng cả 4 ý phải được trọn điểm câu (hệ số 1).')
    return parsed


def yn_correct_count(responses, key):
    """Số ý đúng; chỉ True/False khớp đáp án mới tính, mọi giá trị khác (trống, cả hai, lỗi) là sai."""
    responses = list(responses) if isinstance(responses, (list, tuple)) else []
    return sum(1 for i, k in enumerate(key) if i < len(responses) and type(responses[i]) is bool and responses[i] == k)


def yn_score(max_points, responses, key, table=None):
    table = DEFAULT_YN_TABLE if table is None else table
    return dec(max_points) * table[yn_correct_count(responses, key)]


def round_total(total):
    return dec(total).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)


def policy_table(policy):
    """Bảng hệ số của một chính sách chấm (lưu trong ma trận/đề); không có thì dùng bảng mặc định."""
    return validate_yn_table((policy or {}).get('yn_table') or DEFAULT_POLICY['yn_table'])
