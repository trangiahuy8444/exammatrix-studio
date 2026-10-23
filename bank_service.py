"""Local question-bank persistence and constrained exam generation.

PPCT and source templates are read-only. An exam is a snapshot, never a live
view of the bank. All mutation methods serialize validation and atomic writes.
"""
from __future__ import annotations
import copy
import hashlib
import json
import math
import os
import random
import re
import shutil
import tempfile
import threading
import unicodedata
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from domain.policies import resolve_similarity, require_revision


class ServiceError(Exception):
    def __init__(self, error, details=None, status=400):
        super().__init__(error)
        self.error, self.details, self.status = error, details, status


def now():
    return datetime.now(timezone.utc).isoformat()


def normalized(value):
    return ' '.join(unicodedata.normalize('NFC', value).casefold().split())


def content_hash(question):
    # Ignore administrative edits, but include every field affecting the task,
    # accepted answer, scoring rubric, or its pedagogical scope.
    keys = ('grade', 'type', 'lesson_code', 'level', 'learning_outcome', 'question',
            'options', 'correct', 'option_explanations', 'rubric', 'max_score',
            'equivalent_answer_policy', 'response_mode')
    payload = {k: question[k] for k in keys if k in question}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def read_json(path, default=None):
    path = Path(path)
    if not path.exists() and default is not None:
        return copy.deepcopy(default)
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, OSError) as exc:
        raise ServiceError('Không đọc được dữ liệu JSON.', {'file': path.name, 'reason': str(exc)}, 409) from exc


def number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        raise ServiceError(f'{label} phải là số hữu hạn.')
    try:
        result = Decimal(str(value))
    except InvalidOperation as exc:
        raise ServiceError(f'{label} phải là số hữu hạn.') from exc
    if not result.is_finite():
        raise ServiceError(f'{label} phải là số hữu hạn.')
    return result


class BankService:
    def __init__(self, bank_path, data_dir, templates_path=None, storage=None, context=None):
        self.bank_path = Path(bank_path).resolve()
        self.data_dir = Path(data_dir).resolve()
        self.templates_path = Path(templates_path or self.data_dir/'exam_templates.json').resolve()
        self.lock = threading.RLock()
        self.storage = storage
        self.context = copy.deepcopy(context or {})
        self.school_profile = self.context.get('school_profile', True)
        # The catalog is retained separately so even a bank import cannot change it.
        initial = self._read_data(self.bank_path)
        if not isinstance(initial, dict) or not isinstance(initial.get('ppct'), dict):
            raise ServiceError('Ngân hàng thiếu danh mục PPCT.', status=409)
        self.catalog = copy.deepcopy(initial['ppct'])
        self.lessons = {(x['grade'], x['lesson_code']): x for x in self.catalog.get('lessons', [])}

    def _load_bank(self):
        return self._read_data(self.bank_path)

    def _read_data(self, path, default=None):
        return self.storage.read(path, default) if self.storage is not None else read_json(path, default)

    def _source_key(self, key, directory=False):
        from pathlib import PurePosixPath
        if not isinstance(key, str) or '\\' in key or len(key) > 250:
            raise ServiceError('Đường dẫn tệp nguồn không hợp lệ.', status=403)
        path = PurePosixPath(key)
        if path.is_absolute() or '..' in path.parts or any(p.startswith('.') for p in path.parts):
            raise ServiceError('Không được truy cập ngoài vùng tệp nguồn.', status=403)
        if path.parts[:2] != ('matrices', 'sources') or (not directory and (len(path.parts) < 3 or path.suffix.lower() not in ('.docx', '.png'))):
            raise ServiceError('Chỉ lưu Word và ảnh trang trong vùng tệp nguồn.', status=403)
        target = (self.data_dir/str(path)).resolve()
        if not target.is_relative_to(self.data_dir):
            raise ServiceError('Không được truy cập ngoài vùng tệp nguồn.', status=403)
        return str(path)

    def write_source(self, key, raw):
        key = self._source_key(key)
        if not isinstance(raw, bytes):
            raise ServiceError('Nội dung tệp nguồn phải là dữ liệu nhị phân.')
        if self.storage is not None:
            return self.storage.write_source(key, raw)
        target = self.data_dir/key
        if target.is_file():
            if target.read_bytes() != raw:
                raise ServiceError('Tệp nguồn đã tồn tại với nội dung khác.', status=409)
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(dir=target.parent, suffix='.tmp')
        try:
            with os.fdopen(fd, 'wb') as handle:
                handle.write(raw); handle.flush(); os.fsync(handle.fileno())
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)

    def read_source(self, key):
        key = self._source_key(key)
        if self.storage is not None:
            raw = self.storage.read_source(key)
            if raw is not None: return raw
        target = self.data_dir/key
        if not target.is_file():
            raise ServiceError('Không tìm thấy tệp nguồn.', status=404)
        return target.read_bytes()

    def source_exists(self, key):
        try:
            self.read_source(key)
            return True
        except ServiceError as exc:
            if exc.status == 404: return False
            raise

    def list_sources(self, prefix):
        prefix = self._source_key(prefix, directory=True).rstrip('/')+'/'
        keys = set(self.storage.list_sources(prefix) if self.storage is not None else [])
        directory = self.data_dir/prefix
        if directory.is_dir():
            keys.update(str(p.relative_to(self.data_dir)) for p in directory.glob('*') if p.is_file() and p.suffix.lower() in ('.png', '.docx'))
        return sorted(keys)

    def _records(self, name):
        data = self._read_data(self.data_dir/f'{name}.json', [])
        if not isinstance(data, list):
            raise ServiceError('Lịch sử lưu không đúng định dạng.', {'file': f'{name}.json'}, 409)
        return data

    def templates(self):
        data = self._read_data(self.templates_path, {'templates': []})
        return data.get('templates', []) if isinstance(data, dict) else data

    def state(self):
        with self.lock:
            return copy.deepcopy(dict(bank=self._load_bank(), exams=self._records('exams'),
                                      revisions=self._records('revisions'), templates=self.templates()))

    def _atomic_save(self, path, value):
        if self.context and Path(path).name in ('exams.json', 'revisions.json', 'records.json') and isinstance(value, list):
            for record in value:
                for key in ('subject_name', 'school_year', 'school_profile'):
                    if key in self.context:
                        record[key] = self.context[key]
        if self.storage is not None:
            return self.storage.save(path, value)
        raw = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).encode('utf-8')
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        backup_dir = self.data_dir/'backups'
        backup_dir.mkdir(parents=True, exist_ok=True)
        if path.exists():
            backup = backup_dir/f'{path.stem}_{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")}_{uuid.uuid4().hex[:8]}.json'
            shutil.copy2(path, backup)
        name = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f'.{path.name}.', suffix='.tmp', delete=False) as stream:
                name = stream.name
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, path)
            name = None
        finally:
            if name and Path(name).exists():
                Path(name).unlink()

    def _grade(self, value):
        allowed = self.context.get('allowed_grades', (8, 9, 10))
        if type(value) is not int or value not in allowed:
            raise ServiceError('Khối phải thuộc chương trình đã chọn: '+', '.join(map(str, allowed))+'.')
        return value

    @staticmethod
    def _text(value, label):
        if not isinstance(value, str) or not value.strip():
            raise ServiceError(f'{label} không được để trống.')
        return value.strip()

    def _validate_question(self, raw):
        if not isinstance(raw, dict):
            raise ServiceError('Câu hỏi phải là một đối tượng JSON.')
        q = copy.deepcopy(raw)
        grade = self._grade(q.get('grade'))
        if q.get('type') not in ('MC', 'ES'):
            raise ServiceError('Chỉ hỗ trợ câu MC và ES; chưa hỗ trợ TF/Đúng/Sai.')
        lesson_code = self._text(q.get('lesson_code'), 'Mã bài')
        lesson = self.lessons.get((grade, lesson_code))
        if not lesson:
            raise ServiceError('Bài học không thuộc PPCT của khối.', {'lesson_code': q.get('lesson_code')})
        if q.get('learning_outcome') not in lesson.get('outcomes', []):
            raise ServiceError('Yêu cầu cần đạt phải thuộc bài học trong PPCT.')
        if q.get('level') not in ('Biết', 'Hiểu', 'Vận dụng'):
            raise ServiceError('Mức độ câu hỏi không hợp lệ.')
        q['question'] = self._text(q.get('question'), 'Nội dung câu hỏi')
        status = q.get('review_status', 'draft')
        if status not in ('draft', 'content_checked', 'approved', 'archived'):
            raise ServiceError('Trạng thái câu hỏi không hợp lệ.')
        q['review_status'] = status
        if number(q.get('max_score', 1), 'Điểm tối đa') != 1:
            raise ServiceError('Ngân hàng dùng thang điểm chuẩn 1 cho mỗi câu; điểm đề do ma trận quy định.')
        q['max_score'] = 1
        if q['type'] == 'MC':
            options = q.get('options')
            if not isinstance(options, list) or len(options) != 4:
                raise ServiceError('Câu MC cần đúng 4 phương án.')
            options = [self._text(x, 'Phương án') for x in options]
            if len({normalized(x) for x in options}) != 4:
                raise ServiceError('Bốn phương án không được trùng nội dung.')
            q['options'] = options
            if type(q.get('correct')) is not int or q['correct'] not in range(4):
                raise ServiceError('Đáp án đúng phải là một chỉ số từ 0 đến 3.')
            exp = q.get('option_explanations')
            if not isinstance(exp, list) or len(exp) != 4:
                raise ServiceError('Cần giải thích riêng cho cả 4 phương án.')
            q['option_explanations'] = [self._text(x, 'Giải thích phương án') for x in exp]
        else:
            rubric = q.get('rubric')
            if not isinstance(rubric, list) or len(rubric) != 4:
                raise ServiceError('Câu ES cần 4 tiêu chí chấm.')
            total = Decimal(0)
            for item in rubric:
                if not isinstance(item, dict):
                    raise ServiceError('Tiêu chí chấm không đúng định dạng.')
                self._text(item.get('criterion'), 'Tiêu chí chấm')
                points = number(item.get('points'), 'Điểm tiêu chí')
                if points <= 0:
                    raise ServiceError('Điểm tiêu chí phải lớn hơn 0.')
                item['criterion'] = self._text(item.get('criterion'), 'Tiêu chí chấm')
                item['points'] = float(points)
                total += points
            if total != 1:
                raise ServiceError('Tổng điểm 4 tiêu chí phải bằng 1.')
            self._text(q.get('equivalent_answer_policy'), 'Chính sách chấp nhận đáp án tương đương')
        q.setdefault('lesson_name', lesson.get('lesson_name_source', q['lesson_code']))
        q.setdefault('topic_source', lesson.get('topic_source', ''))
        q.setdefault('source_file', lesson.get('source_file', ''))
        q.setdefault('source_rows', [])
        q.setdefault('semester', 1)
        q.setdefault('response_mode', 'Trắc nghiệm' if q['type'] == 'MC' else 'Tự luận')
        q['outcome_index'] = lesson['outcomes'].index(q['learning_outcome'])
        return q

    def _validate_bank(self, bank):
        if not isinstance(bank, dict) or not isinstance(bank.get('questions'), list):
            raise ServiceError('Ngân hàng cần có mảng questions.')
        if bank.get('ppct') != self.catalog:
            raise ServiceError('PPCT chỉ đọc; không được thay nguồn qua nhập ngân hàng.')
        result = copy.deepcopy(bank)
        ids, texts = set(), set()
        checked = []
        for raw in bank['questions']:
            q = self._validate_question(raw)
            ident = self._text(q.get('id'), 'Mã câu')
            if ident in ids:
                raise ServiceError('Mã câu bị trùng.', {'id': ident})
            fingerprint = (q['grade'], normalized(q['question']))
            if fingerprint in texts:
                raise ServiceError('Nội dung câu hỏi bị trùng trong cùng khối.', {'id': ident})
            ids.add(ident); texts.add(fingerprint); checked.append(q)
        result['questions'] = checked
        return result

    def save_question(self, raw):
        with self.lock:
            q = self._validate_question(raw)
            bank = self._load_bank()
            ident = q.get('id')
            if ident:
                if not any(x['id'] == ident for x in bank['questions']):
                    raise ServiceError('Không tìm thấy mã câu để sửa.', {'id': ident}, 404)
            else:
                q['id'] = f'K{q["grade"]}-GV-{uuid.uuid4().hex[:12]}'
            q['origin'] = 'teacher'
            q['updated_at'] = now()
            replaced = False
            for i, old in enumerate(bank['questions']):
                if old['id'] == q['id']:
                    bank['questions'][i] = q; replaced = True; break
            if not replaced:
                bank['questions'].append(q)
            checked = self._validate_bank(bank)
            self._atomic_save(self.bank_path, checked)
            return copy.deepcopy(next(x for x in checked['questions'] if x['id'] == q['id']))

    def archive_question(self, ident):
        with self.lock:
            bank = self._load_bank()
            q = next((x for x in bank['questions'] if x['id'] == ident), None)
            if q is None:
                raise ServiceError('Không tìm thấy câu hỏi.', {'id': ident}, 404)
            q['review_status'] = 'archived'; q['archived_at'] = now()
            self._atomic_save(self.bank_path, bank)
            return copy.deepcopy(bank)

    def restore_question(self, ident, status='approved'):
        with self.lock:
            if status not in ('draft', 'content_checked', 'approved'):
                status = 'approved'
            bank = self._load_bank()
            q = next((x for x in bank['questions'] if x['id'] == ident), None)
            if q is None:
                raise ServiceError('Không tìm thấy câu hỏi.', {'id': ident}, 404)
            q['review_status'] = status
            q.pop('archived_at', None)
            q['updated_at'] = now()
            self._atomic_save(self.bank_path, bank)
            return copy.deepcopy(bank)

    def delete_question(self, ident):
        with self.lock:
            bank = self._load_bank()
            before = len(bank['questions'])
            bank['questions'] = [x for x in bank['questions'] if x.get('id') != ident]
            if len(bank['questions']) == before:
                raise ServiceError('Không tìm thấy câu hỏi để xóa.', {'id': ident}, 404)
            self._atomic_save(self.bank_path, bank)
            return copy.deepcopy(bank)

    def bulk_questions(self, ids, action, status=None):
        with self.lock:
            if not isinstance(ids, list) or not ids:
                raise ServiceError('Chọn ít nhất một câu hỏi để thao tác hàng loạt.')
            target_ids = set(ids)
            bank = self._load_bank()
            if action == 'delete':
                bank['questions'] = [x for x in bank['questions'] if x.get('id') not in target_ids]
            elif action == 'status':
                if status not in ('draft', 'content_checked', 'approved', 'archived'):
                    raise ServiceError('Trạng thái hàng loạt không hợp lệ.')
                for q in bank['questions']:
                    if q.get('id') in target_ids:
                        q['review_status'] = status
                        q['updated_at'] = now()
                        if status == 'archived':
                            q['archived_at'] = now()
                        else:
                            q.pop('archived_at', None)
            else:
                raise ServiceError('Thao tác hàng loạt không hợp lệ.')
            self._atomic_save(self.bank_path, bank)
            return copy.deepcopy(bank)

    def import_bank(self, bank):
        with self.lock:
            checked = self._validate_bank(bank)
            self._atomic_save(self.bank_path, checked)
            return copy.deepcopy(checked)

    def save_ppct_lesson(self, payload):
        with self.lock:
            if not isinstance(payload, dict):
                raise ServiceError('Dữ liệu bài học không hợp lệ.')
            grade = self._grade(payload.get('grade'))
            code = self._text(payload.get('lesson_code'), 'Mã bài học')
            name = self._text(payload.get('lesson_name_source'), 'Tên bài học')
            topic = self._text(payload.get('topic_source'), 'Tên chủ đề')
            outcomes = payload.get('outcomes') or []
            if isinstance(outcomes, str):
                outcomes = [x.strip() for x in outcomes.splitlines() if x.strip()]
            outcomes = [self._text(x, 'Yêu cầu cần đạt') for x in outcomes if str(x).strip()]
            if not outcomes:
                raise ServiceError('Cần ít nhất một yêu cầu cần đạt cho bài học.')
            week_raw = str(payload.get('week_raw') or 'Tuần 1').strip()
            periods_raw = str(payload.get('periods_raw') or '1').strip()
            bank = self._load_bank()
            lessons = bank.setdefault('ppct', {}).setdefault('lessons', [])
            existing = next((x for x in lessons if x.get('grade') == grade and x.get('lesson_code') == code), None)
            if existing:
                old_outcomes = existing.get('outcomes', [])
                used = {q.get('learning_outcome') for q in bank.get('questions', [])
                        if q.get('grade') == grade and q.get('lesson_code') == code}
                if used - set(outcomes):
                    raise ServiceError('Yêu cầu cần đạt đang có câu hỏi sử dụng. Hãy cập nhật các câu hỏi liên quan trước khi bỏ hoặc thay yêu cầu này.', status=409)
                if outcomes != old_outcomes and any(
                    m.get('grade') == grade and any(r.get('lesson_code') == code for r in m.get('requirements', []))
                    for m in self._read_data(self.data_dir/'matrices/records.json', [])):
                    raise ServiceError('Bài đã được liên kết trong ma trận. Giữ nguyên danh sách và thứ tự YCCĐ hoặc điều chỉnh ma trận trước.', status=409)
                for q in bank.get('questions', []):
                    if q.get('grade') == grade and q.get('lesson_code') == code:
                        q['lesson_name'] = name
                        q['topic_source'] = topic
                        q['outcome_index'] = outcomes.index(q['learning_outcome'])
                existing['lesson_name_source'] = name
                existing['topic_source'] = topic
                existing['outcomes'] = outcomes
                if payload.get('week_raw') or payload.get('periods_raw'):
                    existing['occurrences'] = [dict(table_index=0, row_index=0, week_raw=week_raw, periods_raw=periods_raw)]
            else:
                entry = dict(
                    grade=grade,
                    lesson_code=code,
                    lesson_name_source=name,
                    topic_source=topic,
                    outcomes=outcomes,
                    source_file='Cập nhật trực tiếp trên ứng dụng',
                    occurrences=[dict(table_index=0, row_index=0, week_raw=week_raw, periods_raw=periods_raw)],
                )
                lessons.append(entry)
            self.catalog = copy.deepcopy(bank['ppct'])
            self.lessons = {(x['grade'], x['lesson_code']): x for x in self.catalog.get('lessons', [])}
            self._atomic_save(self.bank_path, bank)
            return copy.deepcopy(bank)

    def delete_ppct_lesson(self, grade, lesson_code):
        with self.lock:
            grade = self._grade(grade)
            code = self._text(lesson_code, 'Mã bài học')
            bank = self._load_bank()
            if any(q.get('grade') == grade and q.get('lesson_code') == code for q in bank.get('questions', [])):
                raise ServiceError('Không thể xóa bài học đang có câu hỏi gắn kèm trong ngân hàng.')
            if any(m.get('grade') == grade and any(l.get('lesson_code') == code for l in m.get('lessons', []))
                   for m in self._read_data(self.data_dir/'matrices/records.json', [])):
                raise ServiceError('Không thể xóa bài học đang được dùng trong ma trận.', status=409)
            lessons = bank.setdefault('ppct', {}).setdefault('lessons', [])
            before = len(lessons)
            bank['ppct']['lessons'] = [x for x in lessons if not (x.get('grade') == grade and x.get('lesson_code') == code)]
            if len(bank['ppct']['lessons']) == before:
                raise ServiceError('Không tìm thấy bài học cần xóa.', status=404)
            self.catalog = copy.deepcopy(bank['ppct'])
            self.lessons = {(x['grade'], x['lesson_code']): x for x in self.catalog.get('lessons', [])}
            self._atomic_save(self.bank_path, bank)
            return copy.deepcopy(bank)

    def save_revision(self, payload):
        with self.lock:
            title = self._text(payload.get('title'), 'Tên đề cương')
            grade = self._grade(payload.get('grade'))
            ids = payload.get('question_ids')
            if not isinstance(ids, list) or not ids or not all(isinstance(x, str) for x in ids) or len(ids) != len(set(ids)):
                raise ServiceError('Chọn ít nhất một câu, không trùng mã trong đề cương.')
            bank = {x['id']: x for x in self._load_bank()['questions']}
            questions = []
            for ident in ids:
                q = bank.get(ident)
                if not q or q['grade'] != grade or q.get('review_status') == 'archived':
                    raise ServiceError('Câu không tồn tại, đã lưu trữ hoặc khác khối.', {'id': ident})
                snapshot = copy.deepcopy(q); snapshot['content_hash'] = content_hash(q)
                questions.append(snapshot)
            revision = dict(id=f'REV-{uuid.uuid4().hex[:12]}', title=title, grade=grade,
                            created_at=now(), question_ids=ids, questions=questions, question_count=len(questions))
            records = self._records('revisions'); records.append(revision)
            self._atomic_save(self.data_dir/'revisions.json', records)
            return copy.deepcopy(revision)

    def _snapshot_questions(self, questions, grade, exam=False):
        if not isinstance(questions, list) or not questions:
            raise ServiceError('Hồ sơ cần ít nhất một câu hỏi.')
        checked = copy.deepcopy(questions)
        ids = set()
        total = Decimal(0)
        for q in checked:
            if not isinstance(q, dict) or type(q.get('grade')) is not int or q.get('grade') != grade:
                raise ServiceError('Câu hỏi phải cùng khối với hồ sơ đang sửa.')
            ident = self._text(q.get('id'), 'Mã câu hỏi')
            if ident in ids:
                raise ServiceError('Không được trùng mã câu trong hồ sơ.')
            ids.add(ident)
            self._text(q.get('question'), 'Nội dung câu hỏi')
            if q.get('type') not in ('MC', 'ES', 'YN', 'SHORT'):
                raise ServiceError('Dạng câu không hợp lệ.')
            if q['type'] == 'MC':
                options = q.get('options')
                if not isinstance(options, list) or len(options) != 4 or any(not isinstance(x, str) or not x.strip() for x in options):
                    raise ServiceError('Câu trắc nghiệm cần đủ bốn phương án.')
                if len({normalized(x) for x in options}) != 4 or type(q.get('correct')) is not int or q['correct'] not in range(4):
                    raise ServiceError('Phương án bị trùng hoặc đáp án không hợp lệ.')
            if exam:
                points = number(q.get('points'), 'Điểm câu hỏi')
                if points <= 0:
                    raise ServiceError('Điểm câu hỏi phải lớn hơn 0.')
                total += points
            if q['type'] == 'ES':
                rubric = q.get('rubric')
                if not isinstance(rubric, list) or not rubric:
                    raise ServiceError('Câu tự luận cần có hướng dẫn chấm.')
                for item in rubric:
                    if not isinstance(item, dict) or number(item.get('points'), 'Điểm tiêu chí') <= 0:
                        raise ServiceError('Tiêu chí chấm không hợp lệ.')
                    self._text(item.get('criterion'), 'Tiêu chí chấm')
            q['content_hash'] = content_hash(q)
        if exam and total != Decimal('10'):
            raise ServiceError('Tổng điểm đề sau khi sửa phải bằng 10.')
        return checked

    def update_revision(self, payload):
        with self.lock:
            ident = self._text(payload.get('id'), 'Mã đề cương')
            records = self._records('revisions')
            idx = next((i for i, x in enumerate(records) if x.get('id') == ident), None)
            if idx is None:
                raise ServiceError('Không tìm thấy phiên bản đề cương để cập nhật.', {'id': ident}, 404)
            old = records[idx]
            title = self._text(payload.get('title', old.get('title')), 'Tên đề cương')
            grade = self._grade(payload.get('grade', old.get('grade')))
            ids = payload.get('question_ids')
            if ids is not None:
                if not isinstance(ids, list) or not ids or not all(isinstance(x, str) for x in ids) or len(ids) != len(set(ids)):
                    raise ServiceError('Chọn ít nhất một câu, không trùng mã trong đề cương.')
                bank = {x['id']: x for x in self._load_bank()['questions']}
                questions = []
                for qid in ids:
                    q = bank.get(qid) or next((oq for oq in old.get('questions', []) if oq.get('id') == qid), None)
                    if not q or q['grade'] != grade:
                        raise ServiceError('Câu không tồn tại hoặc khác khối.', {'id': qid})
                    snapshot = copy.deepcopy(q); snapshot['content_hash'] = content_hash(q)
                    questions.append(snapshot)
                old['question_ids'] = ids
                old['questions'] = questions
                old['question_count'] = len(questions)
            elif 'questions' in payload:
                old['questions'] = self._snapshot_questions(payload['questions'], grade)
                old['question_count'] = len(old['questions'])
                old['question_ids'] = [q.get('id', f'Q-{i+1}') for i, q in enumerate(old['questions'])]
            if isinstance(payload.get('knowledge_scope'), list):
                old['knowledge_scope'] = copy.deepcopy(payload['knowledge_scope'])
            old['questions'] = self._snapshot_questions(old['questions'], grade)
            old['title'] = title
            old['grade'] = grade
            old['updated_at'] = now()
            records[idx] = old
            self._atomic_save(self.data_dir/'revisions.json', records)
            return copy.deepcopy(old)

    def delete_revision(self, ident):
        with self.lock:
            ident = self._text(ident, 'Mã đề cương')
            if any(e.get('revision_id') == ident for e in self._records('exams')):
                raise ServiceError('Đề cương đang được dùng làm căn cứ cho đề thi. Hãy xóa các đề liên quan trước.', status=409)
            records = self._records('revisions')
            before = len(records)
            records = [x for x in records if x.get('id') != ident]
            if len(records) == before:
                raise ServiceError('Không tìm thấy phiên bản đề cương để xóa.', {'id': ident}, 404)
            self._atomic_save(self.data_dir/'revisions.json', records)
            return copy.deepcopy(records)

    def duplicate_revision(self, ident):
        with self.lock:
            old = self.get_record('revisions', ident)
            copy_rev = copy.deepcopy(old)
            copy_rev['id'] = f'REV-{uuid.uuid4().hex[:12]}'
            copy_rev['title'] = f'{old.get("title", "Đề cương")} (Bản sao)'
            copy_rev['created_at'] = now()
            records = self._records('revisions'); records.append(copy_rev)
            self._atomic_save(self.data_dir/'revisions.json', records)
            return copy.deepcopy(copy_rev)

    def get_record(self, name, ident):
        with self.lock:
            value = next((x for x in self._records(name) if x['id'] == ident), None)
            if value is None:
                raise ServiceError('Không tìm thấy bản đã lưu.', {'id': ident}, 404)
            return copy.deepcopy(value)

    def _first_period(self, grade, lesson_code):
        periods = []
        for occurrence in self.lessons.get((grade, lesson_code), {}).get('occurrences', []):
            periods.extend(int(x) for x in re.findall(r'\d+', str(occurrence.get('periods_raw', ''))))
        return min(periods) if periods else math.inf

    def generate_exam(self, payload):
        with self.lock:
            grade = self._grade(payload.get('grade'))
            exam_type = payload.get('exam_type')
            if exam_type not in ('TX', 'GK1', 'CK1', 'GK2', 'CK2'):
                raise ServiceError('Loại kiểm tra không hợp lệ.')
            title = self._text(payload.get('title'), 'Tên đề kiểm tra')
            duration = payload.get('duration', 45)
            if type(duration) is not int or not 1 <= duration <= 300:
                raise ServiceError('Thời lượng phải là số nguyên từ 1 đến 300 phút.')
            template = None
            if payload.get('template_id'):
                template = next((t for t in self.templates() if t['id'] == payload['template_id']), None)
                if not template or template.get('grade') != grade or template.get('exam_type') != exam_type:
                    raise ServiceError('Ma trận nguồn không phù hợp khối hoặc kì kiểm tra.')
                if self.school_profile and grade in (8, 10) and exam_type != 'TX' and not template.get('locked'):
                    raise ServiceError('Chưa có ma trận gốc đã khóa phù hợp khối và kì kiểm tra; không dùng ma trận tùy chỉnh thay thế.')
                if template.get('unsupported'):
                    raise ServiceError('Ma trận nguồn chưa được hỗ trợ; không tự chuyển dạng câu.',
                                       {'source_notes': template.get('source_notes'), 'unsupported_sections': template.get('unsupported_sections', [])})
                if payload.get('blueprint') and payload['blueprint'] != template['rows']:
                    raise ServiceError('Ma trận nguồn đã khóa; không được thay số câu, điểm, bài hoặc mức độ.')
                rows = copy.deepcopy(template['rows'])
            else:
                if self.school_profile and exam_type != 'TX' and grade in (8, 10):
                    raise ServiceError('Chưa có ma trận gốc được chọn cho khối và kì kiểm tra; khối 8/10 phải dùng ma trận nguồn đã khóa.')
                rows = payload.get('blueprint')
            if not isinstance(rows, list) or not rows:
                raise ServiceError('Cần khai báo ít nhất một dòng ma trận.')
            total = Decimal(0)
            cells = {}
            for row in rows:
                if not isinstance(row, dict):
                    raise ServiceError('Dòng ma trận không đúng định dạng.')
                if row.get('type') not in ('MC', 'ES'):
                    raise ServiceError(f'Chưa hỗ trợ loại {row.get("type")}; TF/Đúng/Sai không được đổi thành MC.')
                if not isinstance(row.get('lesson_code'), str) or (grade, row.get('lesson_code')) not in self.lessons or row.get('level') not in ('Biết', 'Hiểu', 'Vận dụng'):
                    raise ServiceError('Bài hoặc mức độ ma trận không thuộc danh mục.')
                count = row.get('count')
                if type(count) is not int or not 1 <= count <= 500:
                    raise ServiceError('Số câu phải là số nguyên từ 1 đến 500.')
                points = number(row.get('points_per_question'), 'Điểm mỗi câu')
                if points <= 0:
                    raise ServiceError('Điểm mỗi câu phải lớn hơn 0.')
                total += count * points
                key = (row['lesson_code'], row['type'], row['level'])
                cell = cells.setdefault(key, {'count': 0, 'points': []})
                cell['count'] += count; cell['points'].extend([float(points)] * count)
            if total != 10:
                raise ServiceError('Tổng điểm ma trận phải bằng 10.', {'total_points': str(total)})
            revision = self.get_record('revisions', payload.get('revision_id'))
            if revision['grade'] != grade:
                raise ServiceError('Đề cương đối chiếu phải cùng khối với đề kiểm tra.')
            sim_pct = float(resolve_similarity(payload.get('similarity_percent', 90)))
            sim_mode = payload.get('similarity_mode', 'min')
            if sim_mode not in ('min', 'exact'):
                sim_mode = 'min'
            revision_hashes = {content_hash(q) for q in revision['questions']}
            bank = self._load_bank()['questions']
            limits = {'GK1': 20 if grade == 10 else 10, 'CK1': 32 if grade == 10 else 16,
                      'GK2': 52 if grade == 10 else 26, 'CK2': 62 if grade == 10 else 31}
            rng = random.Random(str(payload.get('seed', '')))
            total_needed = sum(c['count'] for c in cells.values())
            target_covered_total = math.ceil(Decimal(str(sim_pct)) / Decimal('100') * total_needed)
            outside_budget = max(0, total_needed - target_covered_total) if sim_mode == 'exact' else 0
            selected, missing, matched = [], [], 0
            for key, cell in cells.items():
                lesson, kind, level = key
                after_exam = self.school_profile and exam_type in limits and self._first_period(grade, lesson) >= limits[exam_type]
                eligible = [q for q in bank if q['grade'] == grade and q['lesson_code'] == lesson and
                            q['type'] == kind and q['level'] == level and q.get('review_status') in ('approved', 'content_checked') and
                            (template is not None or not after_exam)]
                # Never choose duplicate IDs or duplicate prompt text, even from a manually edited file.
                seen_ids, seen_text, unique = set(), set(), []
                for q in eligible:
                    marker = normalized(q['question'])
                    if q['id'] not in seen_ids and marker not in seen_text:
                        seen_ids.add(q['id']); seen_text.add(marker); unique.append(q)
                if len(unique) < cell['count']:
                    missing.append(dict(lesson_code=lesson, type=kind, level=level, requested=cell['count'],
                                        available=len(unique), missing=cell['count']-len(unique),
                                        reason='Bài học sau mốc kiểm tra.' if after_exam and template is None else 'Không đủ câu trong đúng ô.'))
                    continue
                covered = [q for q in unique if content_hash(q) in revision_hashes]
                outside = [q for q in unique if content_hash(q) not in revision_hashes]
                rng.shuffle(covered); rng.shuffle(outside)
                if sim_mode == 'exact' and outside_budget > 0 and outside:
                    take_out = min(len(outside), outside_budget, cell['count'])
                    take_cov = cell['count'] - take_out
                    if len(covered) < take_cov:
                        take_cov = len(covered)
                        take_out = min(len(outside), cell['count'] - take_cov)
                    chosen = covered[:take_cov] + outside[:take_out]
                    outside_budget -= take_out
                else:
                    chosen = (covered + outside)[:cell['count']]
                for q, points in zip(chosen, cell['points']):
                    snap = copy.deepcopy(q); snap['content_hash'] = content_hash(q); snap['points'] = points
                    in_rev = snap['content_hash'] in revision_hashes
                    snap['in_revision'] = in_rev
                    matched += int(in_rev)
                    snap['source_content_hash'] = snap['content_hash']
                    if snap['type'] == 'MC':
                        order = list(range(4)); rng.shuffle(order)
                        snap['options'] = [q['options'][i] for i in order]
                        snap['option_explanations'] = [q['option_explanations'][i] for i in order]
                        snap['correct'] = order.index(q['correct'])
                        snap['option_order'] = order
                        snap['content_hash'] = content_hash(snap)
                    selected.append(snap)
            if missing:
                raise ServiceError('Ngân hàng chưa đủ câu theo ma trận.', {'shortages': missing})
            required = math.ceil((Decimal(str(sim_pct)) / Decimal('100')) * len(selected))
            if matched < required:
                msg = 'Chưa đạt ít nhất 90% nội dung từ phiên bản đề cương.' if sim_pct == 90 else f'Chưa đạt ít nhất {sim_pct:g}% nội dung từ phiên bản đề cương.'
                raise ServiceError(msg,
                                   {'matched': matched, 'required': required, 'total': len(selected),
                                    'similarity_percent': sim_pct,
                                    'revision_id': revision['id'], 'reason': 'Câu sửa nội dung sau khi lưu đề cương không được tính trùng phiên bản.'})
            exam = dict(id=f'EXAM-{uuid.uuid4().hex[:12]}', title=title, grade=grade, exam_type=exam_type,
                        duration=duration, created_at=now(), seed=payload.get('seed'), blueprint=rows,
                        template_id=template['id'] if template else None,
                        source_notes=template.get('source_notes', '') if template else '',
                        source_file=template.get('source_file', '') if template else '',
                        source_sha256=template.get('source_sha256', '') if template else '',
                        revision_id=revision['id'], revision_match_count=matched, revision_required_count=required,
                        similarity_target_percent=sim_pct, similarity_mode=sim_mode,
                        question_count=len(selected), total_points=10, questions=selected,
                        validation_note='Đã kiểm tra theo bài, dạng và mức độ; giáo viên cần đối chiếu chi tiết từng YCCĐ của bảng đặc tả trước khi phát hành.')
            records = self._records('exams'); records.append(exam)
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(exam)

    def update_exam(self, payload):
        with self.lock:
            ident = self._text(payload.get('id'), 'Mã đề kiểm tra')
            records = self._records('exams')
            idx = next((i for i, x in enumerate(records) if x.get('id') == ident), None)
            if idx is None:
                raise ServiceError('Không tìm thấy đề kiểm tra để cập nhật.', {'id': ident}, 404)
            old = records[idx]
            if 'title' in payload:
                old['title'] = self._text(payload.get('title'), 'Tên đề kiểm tra')
            if 'duration' in payload and payload.get('duration') is not None:
                dur = payload.get('duration')
                if type(dur) is not int or not 1 <= dur <= 300:
                    raise ServiceError('Thời lượng phải từ 1 đến 300 phút.')
                old['duration'] = dur
            if 'campus' in payload:
                old['campus'] = str(payload.get('campus') or '').strip()
            if 'exam_code' in payload:
                old['exam_code'] = str(payload.get('exam_code') or '').strip()
            if 'questions' in payload:
                old['questions'] = self._snapshot_questions(payload['questions'], old['grade'], exam=True)
                old.pop('verification', None)
                old.pop('revision_match_count', None)
                old['needs_verification'] = True
                old['question_count'] = len(old['questions'])
            old['updated_at'] = now()
            records[idx] = old
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(old)

    def delete_exam(self, ident):
        with self.lock:
            ident = self._text(ident, 'Mã đề kiểm tra')
            records = self._records('exams')
            before = len(records)
            records = [x for x in records if x.get('id') != ident]
            if len(records) == before:
                raise ServiceError('Không tìm thấy đề kiểm tra để xóa.', {'id': ident}, 404)
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(records)

    def duplicate_exam(self, ident):
        with self.lock:
            old = self.get_record('exams', ident)
            copy_ex = copy.deepcopy(old)
            copy_ex['id'] = f'EXAM-{uuid.uuid4().hex[:12]}'
            copy_ex['title'] = f'{old.get("title", "Đề kiểm tra")} (Bản sao)'
            copy_ex['created_at'] = now()
            records = self._records('exams'); records.append(copy_ex)
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(copy_ex)

    def _find_matrix_for_exam(self, grade, exam_type, matrix_service, matrix_id=None):
        records = (matrix_service.list() if hasattr(matrix_service, 'list') else matrix_service.list_records()) if matrix_service else []
        if matrix_id:
            m = next((x for x in records if x.get('id') == matrix_id), None)
            if m:
                return m
        locked = next((x for x in records if x.get('grade') == grade and x.get('exam_type') == exam_type and x.get('status') == 'locked'), None)
        if locked:
            return locked
        return next((x for x in records if x.get('grade') == grade and x.get('exam_type') == exam_type), None)

    def verify_exam(self, ident, matrix_service, similarity_percent=None, similarity_mode=None):
        from docx_exam_importer import verify_exam_against_matrix
        with self.lock:
            records = self._records('exams')
            idx = next((i for i, x in enumerate(records) if x.get('id') == ident), None)
            if idx is None:
                raise ServiceError('Không tìm thấy đề kiểm tra để kiểm định.', {'id': ident}, 404)
            exam = records[idx]
            grade = exam.get('grade', 9)
            exam_type = exam.get('exam_type', 'GK1')
            matrix = self._find_matrix_for_exam(grade, exam_type, matrix_service, exam.get('matrix_id'))
            if not matrix:
                raise ServiceError(f'Chưa có ma trận cho Khối {grade} ({exam_type}) để đối chiếu.')
            exam['similarity_target_percent'] = float(resolve_similarity(similarity_percent if similarity_percent is not None else exam.get('similarity_target_percent', 90)))
            if similarity_mode in ('min', 'exact'):
                exam['similarity_mode'] = similarity_mode
            revs = self._records('revisions')
            revision = require_revision(revs, exam.get('revision_id'), grade)
            report = verify_exam_against_matrix(
                exam, matrix, revision,
                exam.get('similarity_target_percent', 90.0),
                exam.get('similarity_mode', 'min'),
            )
            exam['verification'] = report
            exam['matrix_id'] = matrix.get('id')
            exam['revision_match_count'] = report['revision_check']['matched_questions']
            exam['revision_required_count'] = math.ceil((report['revision_check']['required_percent'] / 100.0) * len(exam.get('questions', [])))
            exam['updated_at'] = now()
            records[idx] = exam
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(exam)

    def adjust_exam_similarity(self, payload, matrix_service):
        from docx_exam_importer import verify_exam_against_matrix, _norm, _stem_key
        with self.lock:
            ident = self._text(payload.get('exam_id') or payload.get('id'), 'Mã đề kiểm tra')
            action = str(payload.get('action') or 'update_threshold').strip()
            records = self._records('exams')
            idx = next((i for i, x in enumerate(records) if x.get('id') == ident), None)
            if idx is None:
                raise ServiceError('Không tìm thấy đề kiểm tra.', {'id': ident}, 404)
            exam = records[idx]
            grade = exam.get('grade', 9)
            exam_type = exam.get('exam_type', 'GK1')
            matrix = self._find_matrix_for_exam(grade, exam_type, matrix_service, exam.get('matrix_id'))
            if not matrix:
                raise ServiceError(f'Chưa có Ma trận Khối {grade} ({exam_type}).')

            revs = self._records('revisions')
            rev_id = payload.get('revision_id') or exam.get('revision_id')
            revision = require_revision(revs, rev_id, grade)
            rev_idx = next(i for i, r in enumerate(revs) if r['id'] == revision['id'])
            exam['revision_id'] = revision.get('id')

            exam['similarity_target_percent'] = float(resolve_similarity(payload.get('target_percent', exam.get('similarity_target_percent', 90))))
            if payload.get('similarity_mode') in ('min', 'exact'):
                exam['similarity_mode'] = payload['similarity_mode']

            target_pct = float(exam.get('similarity_target_percent', 90.0))
            bank_qs = [q for q in self._load_bank()['questions'] if q.get('grade') == grade and q.get('review_status') != 'archived']

            def get_rev_norms(rev_obj):
                s = set()
                for rq in rev_obj.get('questions', []):
                    s.add(_norm(rq.get('question', '')))
                    s.add(_stem_key(rq.get('question', '')))
                return s

            rev_norms = get_rev_norms(revision)
            questions = exam.get('questions', [])
            for q in questions:
                qt = q.get('question', '')
                q['in_revision'] = (_norm(qt) in rev_norms) or (_stem_key(qt) in rev_norms)

            changed_msg = 'Đã cập nhật cấu hình mức độ tương đồng.'
            revision_modified = False

            if action == 'toggle_question':
                q_idx = payload.get('question_index')
                if q_idx is None:
                    target_qid = str(payload.get('question_id') or payload.get('qid') or '')
                    if target_qid:
                        q_idx = next((i for i, x in enumerate(questions) if str(x.get('id', '')) == target_qid), None)
                sub_action = str(payload.get('sub_action') or '').strip()
                if type(q_idx) is not int or not (0 <= q_idx < len(questions)):
                    raise ServiceError('Vị trí câu hỏi không hợp lệ.')
                cur_q = questions[q_idx]
                cur_norm = _norm(cur_q.get('question', ''))
                cur_stem = _stem_key(cur_q.get('question', ''))
                used_norms = {_norm(x.get('question', '')) for x in questions} | {_stem_key(x.get('question', '')) for x in questions}

                if sub_action == 'add_to_revision':
                    if not cur_q.get('in_revision'):
                        new_rq = copy.deepcopy(cur_q)
                        new_rq['in_revision'] = True
                        new_rq['slot_number'] = len([x for x in revision['questions'] if x.get('type') == cur_q.get('type')]) + 1
                        revision['questions'].append(new_rq)
                        revision['question_count'] = len(revision['questions'])
                        revision['question_ids'] = [x.get('id', f'Q-{i+1}') for i, x in enumerate(revision['questions'])]
                        revision['updated_at'] = now()
                        cur_q['in_revision'] = True
                        revision_modified = True
                        changed_msg = f'Đã bổ sung Câu {cur_q.get("slot_number", q_idx+1)} ({cur_q.get("type")}) vào Đề cương để tăng độ tương đồng.'
                elif sub_action == 'remove_from_revision':
                    before = len(revision['questions'])
                    revision['questions'] = [
                        rq for rq in revision['questions']
                        if _norm(rq.get('question', '')) != cur_norm and _stem_key(rq.get('question', '')) != cur_stem
                    ]
                    if len(revision['questions']) < before:
                        revision['question_count'] = len(revision['questions'])
                        revision['question_ids'] = [x.get('id', f'Q-{i+1}') for i, x in enumerate(revision['questions'])]
                        revision['updated_at'] = now()
                        cur_q['in_revision'] = False
                        revision_modified = True
                        changed_msg = f'Đã tách Câu {cur_q.get("slot_number", q_idx+1)} khỏi Đề cương (trở thành câu phân hóa ngoài đề cương).'
                elif sub_action == 'swap_from_revision':
                    candidates = [
                        rq for rq in revision.get('questions', [])
                        if rq.get('type') == cur_q.get('type')
                        and rq.get('lesson_code') == cur_q.get('lesson_code')
                        and _norm(rq.get('question', '')) not in used_norms
                        and _stem_key(rq.get('question', '')) not in used_norms
                    ]
                    if not candidates:
                        candidates = [
                            rq for rq in revision.get('questions', [])
                            if rq.get('type') == cur_q.get('type')
                            and _norm(rq.get('question', '')) not in used_norms
                            and _stem_key(rq.get('question', '')) not in used_norms
                        ]
                    if not candidates:
                        raise ServiceError('Không còn câu hỏi dự phòng nào trong Đề cương chưa xuất hiện trong Đề thi; bạn có thể chọn "Thêm câu này vào Đề cương".')
                    chosen = copy.deepcopy(candidates[0])
                    chosen['slot_number'] = cur_q.get('slot_number', q_idx + 1)
                    chosen['points'] = cur_q.get('points', 0.25)
                    chosen['in_revision'] = True
                    questions[q_idx] = chosen
                    changed_msg = f'Đã đổi Câu {chosen["slot_number"]} sang câu hỏi nằm trong Đề cương.'
                elif sub_action == 'swap_from_bank':
                    candidates = [
                        bq for bq in bank_qs
                        if bq.get('type') == cur_q.get('type')
                        and bq.get('lesson_code') == cur_q.get('lesson_code')
                        and _norm(bq.get('question', '')) not in rev_norms
                        and _stem_key(bq.get('question', '')) not in rev_norms
                        and _norm(bq.get('question', '')) not in used_norms
                    ]
                    if not candidates:
                        candidates = [
                            bq for bq in bank_qs
                            if bq.get('type') == cur_q.get('type')
                            and _norm(bq.get('question', '')) not in rev_norms
                            and _stem_key(bq.get('question', '')) not in rev_norms
                            and _norm(bq.get('question', '')) not in used_norms
                        ]
                    if candidates:
                        chosen = copy.deepcopy(candidates[0])
                        chosen['slot_number'] = cur_q.get('slot_number', q_idx + 1)
                        chosen['points'] = cur_q.get('points', 0.25)
                        chosen['in_revision'] = False
                        questions[q_idx] = chosen
                        changed_msg = f'Đã đổi Câu {chosen["slot_number"]} sang câu phân hóa ngoài Đề cương (từ Ngân hàng câu hỏi).'
                    else:
                        # Fallback: remove from revision to make it an outside differentiation question
                        revision['questions'] = [
                            rq for rq in revision['questions']
                            if _norm(rq.get('question', '')) != cur_norm and _stem_key(rq.get('question', '')) != cur_stem
                        ]
                        revision['question_count'] = len(revision['questions'])
                        revision['updated_at'] = now()
                        cur_q['in_revision'] = False
                        revision_modified = True
                        changed_msg = f'Đã chuyển Câu {cur_q.get("slot_number", q_idx+1)} thành câu phân hóa ngoài Đề cương.'

            elif action == 'auto_adjust_questions':
                total_pts = sum(float(q.get('points', 0)) for q in questions) or 10.0
                cur_matched_pts = sum(float(q.get('points', 0)) for q in questions if q.get('in_revision'))
                target_pts = round((target_pct / 100.0) * total_pts, 2)
                used_norms = {_norm(x.get('question', '')) for x in questions} | {_stem_key(x.get('question', '')) for x in questions}
                swapped_count = 0
                synced_count = 0

                if cur_matched_pts < target_pts - 0.01:
                    # Need to INCREASE similarity: convert outside MC questions to in-revision
                    for i, q in enumerate(questions):
                        if cur_matched_pts >= target_pts - 0.01:
                            break
                        if q.get('in_revision'):
                            continue
                        pts = float(q.get('points', 0.25))
                        candidates = [
                            rq for rq in revision.get('questions', [])
                            if rq.get('type') == q.get('type')
                            and rq.get('lesson_code') == q.get('lesson_code')
                            and _norm(rq.get('question', '')) not in used_norms
                            and _stem_key(rq.get('question', '')) not in used_norms
                        ]
                        if candidates:
                            chosen = copy.deepcopy(candidates[0])
                            chosen['slot_number'] = q.get('slot_number', i + 1)
                            chosen['points'] = pts
                            chosen['in_revision'] = True
                            questions[i] = chosen
                            used_norms.add(_norm(chosen.get('question', '')))
                            used_norms.add(_stem_key(chosen.get('question', '')))
                            cur_matched_pts = round(cur_matched_pts + pts, 2)
                            swapped_count += 1
                        else:
                            new_rq = copy.deepcopy(q)
                            new_rq['in_revision'] = True
                            revision['questions'].append(new_rq)
                            revision['question_count'] = len(revision['questions'])
                            revision['updated_at'] = now()
                            q['in_revision'] = True
                            revision_modified = True
                            cur_matched_pts = round(cur_matched_pts + pts, 2)
                            synced_count += 1
                    changed_msg = f'Đã nâng độ tương đồng Đề cương – Đề thi lên {round(cur_matched_pts/total_pts*100, 1)}% (đổi {swapped_count} câu từ đề cương, đồng bộ {synced_count} câu vào đề cương).'
                elif cur_matched_pts > target_pts + 0.01:
                    # Need to DECREASE similarity: convert in-revision MC questions to outside differentiation questions
                    mc_indices = [i for i, q in enumerate(questions) if q.get('type') == 'MC' and q.get('in_revision')]
                    for i in reversed(mc_indices):
                        if cur_matched_pts <= target_pts + 0.01:
                            break
                        q = questions[i]
                        pts = float(q.get('points', 0.25))
                        if cur_matched_pts - pts < target_pts - 0.15:
                            continue
                        candidates = [
                            bq for bq in bank_qs
                            if bq.get('type') == 'MC'
                            and bq.get('lesson_code') == q.get('lesson_code')
                            and _norm(bq.get('question', '')) not in rev_norms
                            and _stem_key(bq.get('question', '')) not in rev_norms
                            and _norm(bq.get('question', '')) not in used_norms
                        ]
                        if candidates:
                            chosen = copy.deepcopy(candidates[0])
                            chosen['slot_number'] = q.get('slot_number', i + 1)
                            chosen['points'] = pts
                            chosen['in_revision'] = False
                            questions[i] = chosen
                            used_norms.add(_norm(chosen.get('question', '')))
                            cur_matched_pts = round(cur_matched_pts - pts, 2)
                            swapped_count += 1
                        else:
                            q_norm = _norm(q.get('question', ''))
                            q_stem = _stem_key(q.get('question', ''))
                            revision['questions'] = [
                                rq for rq in revision['questions']
                                if _norm(rq.get('question', '')) != q_norm and _stem_key(rq.get('question', '')) != q_stem
                            ]
                            revision['question_count'] = len(revision['questions'])
                            revision['updated_at'] = now()
                            q['in_revision'] = False
                            revision_modified = True
                            cur_matched_pts = round(cur_matched_pts - pts, 2)
                            synced_count += 1
                    changed_msg = f'Đã điều chỉnh độ tương đồng Đề cương – Đề thi về {round(cur_matched_pts/total_pts*100, 1)}% (đổi {swapped_count} câu từ ngân hàng, tách {synced_count} câu phân hóa).'
                else:
                    changed_msg = f'Đề thi hiện đã đạt đúng mức tương đồng mục tiêu ({round(cur_matched_pts/total_pts*100, 1)}%).'

            if revision_modified:
                revs[rev_idx] = revision
                self._atomic_save(self.data_dir/'revisions.json', revs)

            report = verify_exam_against_matrix(
                exam, matrix, revision,
                exam.get('similarity_target_percent', 90.0),
                exam.get('similarity_mode', 'min'),
            )
            exam['verification'] = report
            exam['matrix_id'] = matrix.get('id')
            exam['revision_match_count'] = report['revision_check']['matched_questions']
            exam['revision_required_count'] = math.ceil((report['revision_check']['required_percent'] / 100.0) * len(questions))
            exam['updated_at'] = now()
            records[idx] = exam
            self._atomic_save(self.data_dir/'exams.json', records)
            return {
                'message': changed_msg,
                'exam': copy.deepcopy(exam),
                'revision': copy.deepcopy(revision),
                'exams': copy.deepcopy(records),
                'revisions': copy.deepcopy(revs),
            }

    def _import_grade_hint(self, payload):
        value = payload.get('grade')
        if value is None:
            allowed = self.context.get('allowed_grades', [])
            return allowed[0] if len(allowed) == 1 else None
        try:
            grade = int(value)
        except (ValueError, TypeError):
            raise ServiceError('Khối không hợp lệ.')
        return self._grade(grade)

    def inspect_exam_import(self, payload, matrix_service):
        import base64 as _b64
        from docx_exam_importer import parse_exam_docx, verify_exam_against_matrix
        with self.lock:
            filename = str(payload.get('filename') or 'de_kiem_tra.docx').strip()
            grade_hint = self._import_grade_hint(payload)
            exam_type = str(payload.get('exam_type') or 'GK1').strip()
            sim_pct = float(resolve_similarity(payload.get('similarity_percent', 90.0)))
            sim_mode = payload.get('similarity_mode', 'min')
            bank_qs = self._load_bank()['questions']
            revs = self._records('revisions')

            if filename.lower().endswith('.json') or isinstance(payload.get('exam'), dict):
                raw_exam = payload.get('exam')
                if not raw_exam and payload.get('content_base64'):
                    raw_exam = json.loads(_b64.b64decode(payload['content_base64']).decode('utf-8'))
                candidates = [raw_exam] if isinstance(raw_exam, dict) else (raw_exam if isinstance(raw_exam, list) else [])
            else:
                b64 = payload.get('content_base64', '')
                if not b64:
                    raise ServiceError('Thiếu nội dung tệp .docx (content_base64).')
                docx_bytes = _b64.b64decode(b64)
                rev_for_hint = next((r for r in revs if r.get('id') == payload.get('revision_id')), None)
                if rev_for_hint is None:
                    raise ServiceError('Đề cương: hãy chọn phiên bản dùng đối chiếu trước khi nhập đề.')
                if grade_hint is None:
                    grade_hint = rev_for_hint['grade']
                candidates = parse_exam_docx(docx_bytes, filename, grade_hint, bank_qs, rev_for_hint, school_profile=self.school_profile, subject_name=self.context.get('subject_name', 'Tin học'))

            if not candidates:
                raise ServiceError('Không trích xuất được câu hỏi nào từ tệp tải lên.')

            inspected = []
            for ex in candidates:
                g = self._grade(ex.get('grade') or grade_hint or 9)
                ex['grade'] = g
                ex['exam_type'] = ex.get('exam_type') or exam_type
                ex['similarity_target_percent'] = float(sim_pct)
                ex['similarity_mode'] = sim_mode
                rev = require_revision(revs, payload.get('revision_id') or ex.get('revision_id'), g)
                matrix = self._find_matrix_for_exam(g, ex['exam_type'], matrix_service, payload.get('matrix_id'))
                if not matrix:
                    raise ServiceError(f'Không tìm thấy Ma trận Khối {g} ({ex["exam_type"]}) để kiểm định đề thi.')
                report = verify_exam_against_matrix(ex, matrix, rev, sim_pct, sim_mode)
                ex['verification'] = report
                ex['matrix_id'] = matrix.get('id')
                if rev:
                    ex['revision_id'] = rev.get('id')
                    ex['revision_match_count'] = report['revision_check']['matched_questions']
                inspected.append(ex)
            return {
                'filename': filename,
                'candidate_count': len(inspected),
                'all_passed': all(c['verification']['passed'] for c in inspected),
                'candidates': inspected,
            }

    def import_verified_exams(self, payload, matrix_service):
        from docx_exam_importer import verify_exam_against_matrix
        with self.lock:
            candidates = payload.get('candidates')
            if not isinstance(candidates, list) or not candidates:
                raise ServiceError('Cần ít nhất 1 đề thi đã kiểm định để import.')
            sim_pct_override = payload.get('similarity_percent')
            sim_mode_override = payload.get('similarity_mode')
            revs = self._records('revisions')
            records = self._records('exams')
            imported = []
            for ex in candidates:
                g = self._grade(ex.get('grade'))
                exam_type = ex.get('exam_type') or 'GK1'
                matrix = self._find_matrix_for_exam(g, exam_type, matrix_service, ex.get('matrix_id'))
                if not matrix:
                    raise ServiceError(f'Chưa có Ma trận Khối {g} ({exam_type}).')
                rev = require_revision(revs, ex.get('revision_id'), g)
                req_pct = float(resolve_similarity(sim_pct_override if sim_pct_override is not None else ex.get('similarity_target_percent', 90.0)))
                s_mode = sim_mode_override or ex.get('similarity_mode', 'min')
                report = verify_exam_against_matrix(ex, matrix, rev, req_pct, s_mode)
                if not report.get('passed'):
                    raise ServiceError('Đề thi chưa đạt yêu cầu đối chiếu Ma trận; không thể import.', {'verification': report, 'title': ex.get('title')})
                ex['verification'] = report
                ex['similarity_target_percent'] = report['revision_check']['required_percent']
                ex['similarity_mode'] = s_mode
                ex['matrix_id'] = matrix.get('id')
                ex.setdefault('id', f'EXAM-{uuid.uuid4().hex[:12]}')
                ex.setdefault('created_at', now())
                ex['updated_at'] = now()
                ex['question_count'] = len(ex.get('questions', []))
                ex['total_points'] = report['total_points']
                existing_idx = next((i for i, r in enumerate(records) if r.get('id') == ex['id']), None)
                if existing_idx is not None:
                    records[existing_idx] = ex
                else:
                    records.append(ex)
                imported.append(ex)
            self._atomic_save(self.data_dir/'exams.json', records)
            return {'imported_count': len(imported), 'imported': copy.deepcopy(imported), 'exams': copy.deepcopy(records)}

    def import_revision_file(self, payload):
        import base64 as _b64
        from docx_exam_importer import parse_revision_docx
        with self.lock:
            filename = str(payload.get('filename') or 'de_cuong.docx').strip()
            grade_hint = self._import_grade_hint(payload)
            bank_qs = self._load_bank()['questions']
            if filename.lower().endswith('.json') or isinstance(payload.get('revision'), dict):
                rev = payload.get('revision')
                if not rev and payload.get('content_base64'):
                    rev = json.loads(_b64.b64decode(payload['content_base64']).decode('utf-8'))
            else:
                b64 = payload.get('content_base64', '')
                if not b64:
                    raise ServiceError('Thiếu nội dung tệp đề cương (.docx).')
                rev = parse_revision_docx(_b64.b64decode(b64), filename, grade_hint, bank_qs, school_profile=self.school_profile, subject_name=self.context.get('subject_name', 'Tin học'))
            if not isinstance(rev, dict) or not rev.get('questions'):
                raise ServiceError('Không đọc được danh sách câu hỏi từ tệp đề cương.')
            self._grade(rev.get('grade'))
            for question in rev['questions']:
                if not isinstance(question, dict) or question.get('grade') != rev['grade']:
                    raise ServiceError('Câu hỏi phải cùng khối với đề cương đang nhập.')
            if not self.school_profile and not filename.lower().endswith('.json') and not isinstance(payload.get('revision'), dict):
                rev['id'] = f'REV-{uuid.uuid4().hex[:12]}'
            rev.setdefault('id', f'REV-{uuid.uuid4().hex[:12]}')
            rev.setdefault('created_at', now())
            rev['updated_at'] = now()
            rev['question_count'] = len(rev['questions'])
            records = self._records('revisions')
            existing_idx = next((i for i, r in enumerate(records) if r.get('id') == rev['id']), None)
            if existing_idx is not None:
                records[existing_idx] = rev
            else:
                records.append(rev)
            self._atomic_save(self.data_dir/'revisions.json', records)
            return copy.deepcopy(rev)
