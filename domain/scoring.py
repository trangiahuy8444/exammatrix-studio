"""Chấm điểm bằng Decimal (mốc B3).

- Câu Đúng/Sai: điểm = điểm tối đa của câu × hệ số theo số ý trả lời đúng. Ý bỏ trống, chọn cả hai hoặc dữ liệu lỗi
  là ý sai (quy ước tổ bộ môn xác nhận 26/10/2026; CV 7991 không quy định cách tính điểm từng ý).
- Điểm đánh giá là số nguyên hoặc số thập phân lấy đến chữ số thập phân thứ nhất sau khi làm tròn
  (TT 22/2021/TT-BGDĐT, Điều 5). Quy ước tổ (27/10/2026): bài định kì (GK/CK) làm tròn đến 0,1 (7,25 → 7,3);
  bài kiểm tra thường xuyên (TX) làm tròn đến số nguyên (7,5 → 8). Cả hai làm tròn thông thường (từ 5 trở lên lên).
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


ROUNDING_STEPS = {'half_up_1dp': Decimal('0.1'), 'half_up_integer': Decimal('1')}


def rounding_for(exam_type):
    """Cách làm tròn theo loại bài, không chỉnh tay: TX đến số nguyên, GK/CK đến 0,1."""
    return 'half_up_integer' if exam_type == 'TX' else 'half_up_1dp'


def round_total(total, rounding='half_up_1dp'):
    if rounding not in ROUNDING_STEPS:
        raise ServiceError('Cách làm tròn điểm không hợp lệ.', {'rounding': rounding})
    return dec(total).quantize(ROUNDING_STEPS[rounding], rounding=ROUND_HALF_UP)


def default_policy(exam_type):
    return dict(DEFAULT_POLICY, rounding=rounding_for(exam_type))


def exam_policy(policy, exam_type):
    """Chính sách chấm chép vào đề: bảng hệ số Đ/S của ma trận (nếu có), cách làm tròn luôn theo loại bài."""
    out = dict(default_policy(exam_type))
    if policy and policy.get('yn_table') is not None:
        out['yn_table'] = {str(k): str(v) for k, v in validate_yn_table(policy['yn_table']).items()}
    return out


def policy_table(policy):
    """Bảng hệ số của một chính sách chấm (lưu trong ma trận/đề); không có thì dùng bảng mặc định."""
    return validate_yn_table((policy or {}).get('yn_table') or DEFAULT_POLICY['yn_table'])
