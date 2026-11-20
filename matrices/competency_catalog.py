"""Kiểm tra danh mục năng lực và chỉ báo do giáo viên cung cấp."""
import copy
import unicodedata
from bank_service import ServiceError


def validate_rows(rows, fields, label):
    if not isinstance(rows, list) or len(rows) > 2000:
        raise ServiceError(f'{label} phải là danh sách có tối đa 2000 dòng.')
    result, codes = [], set()
    for row in rows:
        if not isinstance(row, dict) or any(not isinstance(row.get(k), str) or not unicodedata.normalize('NFC', row[k]).strip() for k in fields):
            raise ServiceError(f'{label} cần mã và nội dung đầy đủ.')
        item = {k: unicodedata.normalize('NFC', row[k]).strip() for k in fields}
        if item['code'] in codes:
            raise ServiceError(f'{label} có mã trùng: {item["code"]}.')
        codes.add(item['code'])
        result.append(item)
    return result


def validate_indicators(rows, competencies):
    result = validate_rows(rows, ('code', 'competency', 'text'), 'Danh mục chỉ báo')
    for row in result:
        if row['competency'] not in competencies:
            raise ServiceError(f'Chỉ báo {row["code"]} không thuộc năng lực đã khai báo.')
    return result


def validate_catalog(value):
    if not isinstance(value, dict):
        raise ServiceError('Danh mục phải là một đối tượng.')
    competencies = validate_rows(value.get('competencies'), ('code', 'name'), 'Danh mục năng lực')
    if not competencies or not value.get('indicators'):
        raise ServiceError('Danh mục cần ít nhất một năng lực và một chỉ báo.')
    indicators = validate_indicators(value.get('indicators'), {r['code'] for r in competencies})
    return copy.deepcopy(dict(competencies=competencies, indicators=indicators))
