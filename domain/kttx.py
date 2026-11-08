"""Kiểm tra thường xuyên (mốc B8) theo TT 22/2021/TT-BGDĐT, Điều 6.

- Khoản 1: đánh giá thường xuyên qua hỏi – đáp, viết, thuyết trình, thực hành, thí nghiệm, sản phẩm học tập.
- Khoản 2 điểm b: số điểm đánh giá thường xuyên (ĐĐGtx) mỗi học kì: môn 35 tiết/năm học → 02; trên 35 đến 70 tiết →
  03; trên 70 tiết → 04. Đây là số đầu điểm **ghi vào sổ**; học sinh có thể được kiểm tra nhiều lần hơn.
- TT 32/2018 (Chương trình môn Tin học): THCS 35 tiết/lớp/năm học; THPT 70 tiết/lớp/năm học (chưa kể cụm chuyên đề;
  cụm chuyên đề học tập tính là 01 lần đánh giá thường xuyên theo khoản 3).
Tổng quan "đã chọn ghi sổ / cần có" chỉ cảnh báo, không chặn.
"""
from decimal import Decimal

from domain.errors import ServiceError
from domain.scoring import dec, round_total, rounding_for

FORMS = (
    dict(key='hoi_dap', label='Hỏi – đáp'), dict(key='viet', label='Viết'),
    dict(key='thuyet_trinh', label='Thuyết trình'), dict(key='thuc_hanh', label='Thực hành'),
    dict(key='thi_nghiem', label='Thí nghiệm'), dict(key='san_pham', label='Sản phẩm học tập'),
)
# Điều 6, khoản 3: kết quả cụm chuyên đề học tập (chỉ cấp THPT) tính là 01 lần ĐGtx, ngoài số ĐĐGtx ở khoản 2.
CLUSTER_FORM = dict(key='cum_chuyen_de', label='Kết quả cụm chuyên đề học tập (THPT)', min_grade=10)
FORM_KEYS = tuple(f['key'] for f in FORMS) + (CLUSTER_FORM['key'],)
ROMAN = {1: 'I', 2: 'II'}
TIN_HOC_PERIODS = {6: 35, 7: 35, 8: 35, 9: 35, 10: 70, 11: 70, 12: 70}  # TT 32/2018, Chương trình môn Tin học


def tx_count_per_semester(periods_per_year):
    if type(periods_per_year) is not int or periods_per_year <= 0:
        raise ServiceError('Số tiết/năm học của môn phải là số nguyên dương.')
    if periods_per_year <= 35:
        return 2
    if periods_per_year <= 70:
        return 3
    return 4


def short_subject(subject_name):
    return 'Tin' if (subject_name or 'Tin học') == 'Tin học' else subject_name


def activity_title(subject_name, grade, k, semester):
    return f'{short_subject(subject_name)} {grade}_Kiểm tra thường xuyên {k} - HK {ROMAN[semester]}'


def convert_to_10(score, max_score):
    """Quy đổi điểm theo thang tối đa của hoạt động về thang 10, làm tròn như bài thường xuyên (đến số nguyên)."""
    s, m = dec(score), dec(max_score)
    if m <= 0:
        raise ServiceError('Thang điểm tối đa phải lớn hơn 0.')
    if s < 0 or s > m:
        raise ServiceError('Điểm phải từ 0 đến thang điểm tối đa của hoạt động.')
    return round_total(s * Decimal(10) / m, rounding_for('TX'))


def kttx_overview(activities, periods, grades, semesters=(1, 2)):
    rows = []
    for grade in grades:
        for semester in semesters:
            mine = [a for a in activities if a.get('grade') == grade and a.get('semester') == semester]
            classes = sorted({a.get('class_name') or '' for a in mine}) or ['']
            for class_name in classes:
                acts = [a for a in mine if (a.get('class_name') or '') == class_name]
                recorded = sum(1 for a in acts if a.get('recorded') and a.get('form') != CLUSTER_FORM['key'])
                cluster = sum(1 for a in acts if a.get('recorded') and a.get('form') == CLUSTER_FORM['key'])
                per_year = periods.get(grade)
                required = tx_count_per_semester(per_year) if per_year else None
                if required is None:
                    message = 'Môn chưa khai báo số tiết/năm học nên chưa tính được số ĐĐGtx cần có.'
                elif recorded == required:
                    message = f'Đủ {required} ĐĐGtx (TT 22/2021, Điều 6).'
                elif recorded < required:
                    message = f'Đã chọn {recorded}/{required} ĐĐGtx — thiếu {required - recorded}. Chỉ là cảnh báo.'
                else:
                    message = f'Đã chọn {recorded} ĐĐGtx, nhiều hơn {required} cần ghi sổ. Chỉ là cảnh báo.'
                if cluster == 1:
                    message += ' Thêm 01 lần ĐGtx từ kết quả cụm chuyên đề học tập (Điều 6, khoản 3).'
                elif cluster > 1:
                    message += f' Đang chọn {cluster} kết quả cụm chuyên đề; chỉ ghi 01 kết quả cụm chuyên đề (Điều 6, khoản 3).'
                rows.append(dict(grade=grade, semester=semester, class_name=class_name, periods_per_year=per_year,
                                 required=required, recorded=recorded, cluster_recorded=cluster, activities=len(acts),
                                 ok=required is not None and recorded == required and cluster <= 1, message=message))
    return rows
