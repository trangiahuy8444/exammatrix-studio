"""Đối chiếu snapshot đề theo cấu trúc, không suy diễn độ khó."""
import json
import re
from decimal import Decimal, InvalidOperation
from itertools import combinations
from domain.errors import ServiceError

LIMITATION = ('Đối chiếu theo từng câu hỏi, chưa đo mức độ từng ý hoặc độ khó, độ phân biệt. '
              'Khớp cấu trúc không chứng minh tương đương tâm trắc. '
              'Tỷ lệ dùng chung mã câu không chứng minh nội dung hoặc phiên bản giống nhau.')
CONTEXT = ('subject_name', 'grade', 'exam_type', 'duration')
FIELDS = ('type', 'level', 'lesson_code', 'learning_outcome')
DIMENSIONS = FIELDS + ('cells', 'question_weights')
SCALE = 1000000


def _text(value):
    return value.strip() if isinstance(value, str) else ''


def _points(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)) or value == '':
        return None
    if isinstance(value, str) and not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', value.strip()):
        return None
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number < 0 or number > 10000:
            return None
        return int((number * SCALE).quantize(Decimal('1'), rounding='ROUND_HALF_UP'))
    except (InvalidOperation, ValueError):
        return None


def _summary(exam):
    issues, ids, buckets = [], set(), {d: {} for d in DIMENSIONS}
    context = {k: exam.get(k) for k in CONTEXT}
    if (not _text(context['subject_name']) or not _text(context['exam_type']) or
            type(context['grade']) is not int or not 1 <= context['grade'] <= 12 or
            type(context['duration']) is not int or not 1 <= context['duration'] <= 300):
        issues.append('Thiếu hoặc sai thông tin môn, khối, kỳ hoặc thời lượng.')
    questions = exam.get('questions')
    if not isinstance(questions, list) or not questions:
        questions = []
        issues.append('Đề chưa có danh sách câu hỏi đầy đủ.')
    total = 0
    for question in questions:
        if not isinstance(question, dict):
            issues.append('Có câu hỏi sai định dạng.')
            continue
        ident = _text(question.get('id'))
        if not ident or ident in ids:
            issues.append('Có mã câu bị thiếu hoặc lặp trong đề.')
        if ident:
            ids.add(ident)
        values = {k: _text(question.get(k)) for k in FIELDS}
        if (not all(values.values()) or values['type'] not in ('MC', 'YN', 'SHORT', 'ES') or
                values['level'] not in ('Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao')):
            issues.append('Có câu thiếu hoặc sai dạng, mức độ, bài hoặc YCCĐ.')
        units = _points(question.get('points'))
        if units is None:
            issues.append('Có câu thiếu điểm hoặc điểm không hợp lệ.')
            units = 0
        total += units
        cell = [values[k] for k in FIELDS]
        values['cells'] = json.dumps(cell, ensure_ascii=False, separators=(',', ':'))
        values['question_weights'] = json.dumps(cell + [units], ensure_ascii=False, separators=(',', ':'))
        for dimension, key in values.items():
            row = buckets[dimension].setdefault(key, [0, 0])
            row[0] += 1
            row[1] += units
    return dict(id=exam['id'], title=_text(exam.get('title')) or exam['id'], context=context,
                question_count=len(questions), total_points=total / SCALE,
                dimensions={d: [dict(key=k, count=v[0], points=v[1] / SCALE)
                                for k, v in sorted(rows.items())] for d, rows in buckets.items()},
                issues=list(dict.fromkeys(issues))), ids


def compare_exams(exams):
    if not isinstance(exams, list) or not 2 <= len(exams) <= 6:
        raise ServiceError('Chọn từ 2 đến 6 đề đã lưu để so sánh.')
    ids = [e.get('id') if isinstance(e, dict) else None for e in exams]
    if any(not _text(i) for i in ids) or len(set(ids)) != len(ids):
        raise ServiceError('Mỗi đề phải có mã riêng, không để trống hoặc chọn lặp.')
    data, pairs = [_summary(e) for e in exams], []
    for i, j in combinations(range(len(exams)), 2):
        left, li = data[i]
        right, ri = data[j]
        differences = [k for k in CONTEXT if left['context'][k] != right['context'][k]]
        differences.extend(k for k in ('question_count', 'total_points') if left[k] != right[k])
        differences.extend(d for d in DIMENSIONS if left['dimensions'][d] != right['dimensions'][d])
        complete = not left['issues'] and not right['issues']
        family = lambda e: e.get('parent_exam_id') or e['id']
        pairs.append(dict(left_id=left['id'], right_id=right['id'],
                          same_structure=not differences if complete else None, differences=differences,
                          shared_question_ids=len(li & ri),
                          overlap_percent=float((Decimal(100) * len(li & ri) / len(li | ri)).quantize(
                              Decimal('0.01'), rounding='ROUND_HALF_UP')) if complete else None,
                          same_family=family(exams[i]) == family(exams[j])))
    return dict(summaries=[s for s, _ in data], pairs=pairs, limitation=LIMITATION)
