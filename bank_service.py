from __future__ import annotations
"""Local question-bank persistence and constrained exam generation.

PPCT and source templates are read-only. An exam is a snapshot, never a live
view of the bank. All mutation methods serialize validation and atomic writes.
"""
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
from domain.errors import ServiceError
from domain.review import (CHECKLIST, EXAM_ELIGIBLE, STATUSES, normalize_status, review_hash,
                           technical_problems, version_hash)
from domain.exam_lifecycle import FROZEN, exam_hash, exam_status
from domain.profiles import KIND_LABELS, PROFILE_KINDS, allowed_kinds, default_profile_for_grade
from domain.scoring import exam_policy, policy_table
from domain.matrix_checks import cell_check, ratio_warnings
from domain.reuse import DEFAULT_RECENT_DAYS, bank_duplicates, recent_uses
from domain.permutation import mapping_rows, verify_codes
from domain.kttx import CLUSTER_FORM, FORM_KEYS, FORMS, TIN_HOC_PERIODS, activity_title, kttx_overview
from domain.revision_criterion import MODES as REVISION_MODES, revision_report
from input_schema import ALLOWED_LEVELS, canonical_short_answer
from pathlib import Path
from domain.policies import resolve_similarity, require_revision


def normalize_subject_name(name):
    if not name or not isinstance(name, str):
        return 'Tin học'
    s = str(name).strip()
    low = s.lower()
    if 'vật lý' in low or 'vật lí' in low:
        return 'Vật lí'
    if 'địa lý' in low or 'địa lí' in low:
        return 'Địa lí'
    if 'toán' in low:
        return 'Toán học'
    if 'hóa' in low:
        return 'Hóa học'
    if 'sinh' in low:
        return 'Sinh học'
    if 'văn' in low:
        return 'Ngữ văn'
    if 'anh' in low:
        return 'Tiếng Anh'
    if 'sử' in low:
        return 'Lịch sử'
    if 'tin' in low:
        return 'Tin học'
    return s


def _without_approval(exam):
    """Bản sao/mã đề mới của một đề: bắt đầu lại ở trạng thái đang soạn, không kế thừa phê duyệt (B2)."""
    out = copy.deepcopy(exam)
    for key in ('status', 'lifecycle', 'approved_hash', 'approved_by', 'approved_at', 'locked_at', 'published_at', 'usage',
                'reuse_check', 'revision_check'):
        out.pop(key, None)
    out['status'] = 'drafting'
    return out




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


PUBLIC_CURRICULA = Path(__file__).resolve().parent / 'public' / 'curricula.js'


def load_default_curricula():
    """Đọc danh mục môn từ public/curricula.js (phần sau `window.SUBJECT_CURRICULA =` là JSON)."""
    try:
        text = PUBLIC_CURRICULA.read_text(encoding='utf-8')
        payload = text.split('window.SUBJECT_CURRICULA =', 1)[1].strip().rstrip(';')
        return json.loads(payload)
    except (OSError, IndexError, ValueError):
        return {}


def mc_answer_letter(q):
    """Chữ cái đáp án đúng của câu MC; báo lỗi thay vì đoán khi dữ liệu hỏng."""
    correct = q.get('correct')
    if type(correct) is not int or correct not in range(len(q.get('options') or 'ABCD')):
        raise ServiceError('Câu trắc nghiệm có đáp án đúng không hợp lệ; không thể lập bảng đáp án.',
                           {'id': q.get('id'), 'correct': correct}, 409)
    return chr(65 + correct)


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
        self.lessons = {}
        for x in self.catalog.get('lessons', []):
            subj = normalize_subject_name(x.get('subject_name') or 'Tin học')
            self.lessons[(subj, x['grade'], x['lesson_code'])] = x
            if subj == 'Tin học':
                self.lessons[(x['grade'], x['lesson_code'])] = x
        # Danh mục nhiều môn: nguồn duy nhất là public/curricula.js; data_dir/curricula.json (nếu có) ghi đè.
        curricula_path = self.data_dir / 'curricula.json'
        try:
            self.subject_curricula = read_json(curricula_path, {}) if curricula_path.exists() else load_default_curricula()
        except Exception:
            self.subject_curricula = load_default_curricula()

    def _load_bank(self):
        bank = self._read_data(self.bank_path)
        for q in (bank or {}).get('questions') or []:
            if isinstance(q, dict) and 'review_status' in q:
                q['review_status'] = normalize_status(q['review_status'])
        return bank

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
                                      revisions=self._records('revisions'), templates=self.templates(),
                                      subject_curricula=getattr(self, 'subject_curricula', {})))

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
        if self.context.get('curriculum_id'):
            expected_subject = self.context['subject_name']
            if q.get('subject_name') and q['subject_name'] != expected_subject:
                raise ServiceError('Môn của câu hỏi không thuộc chương trình đã chọn.')
            q['subject_name'] = expected_subject
        grade = self._grade(q.get('grade'))
        if q.get('type') not in ('MC', 'ES', 'YN', 'SHORT'):
            raise ServiceError('Chỉ hỗ trợ các dạng câu MC, ES, YN, SHORT.')
        lesson_code = self._text(q.get('lesson_code'), 'Mã bài')
        subj = normalize_subject_name(q.get('subject_name') or self.context.get('subject_name') or 'Tin học')
        lesson = self.lessons.get((subj, grade, lesson_code)) or self.lessons.get((grade, lesson_code))
        if not lesson and subj != 'Tin học':
            subj_dict = getattr(self, 'subject_curricula', {}).get(subj, {})
            subj_list = subj_dict.get(str(grade), []) or subj_dict.get(grade, [])
            lesson = next((l for l in subj_list if l.get('lesson_code') == lesson_code), None)

        q['review_status'] = normalize_status(q.get('review_status'))
        if not lesson and q.get('review_status') == 'draft':
            lesson = {'lesson_code': lesson_code, 'outcomes': [q.get('learning_outcome')] if q.get('learning_outcome') else []}

        if not lesson:
            raise ServiceError('Bài học không thuộc PPCT của khối.', {'lesson_code': q.get('lesson_code')})
        if lesson.get('outcomes') and q.get('learning_outcome') and q.get('learning_outcome') not in lesson.get('outcomes', []):
            if q.get('review_status') != 'draft':
                raise ServiceError('Yêu cầu cần đạt phải thuộc bài học trong PPCT.')
        if q.get('level') not in ALLOWED_LEVELS:
            raise ServiceError('Mức độ câu hỏi không hợp lệ.')
        q['question'] = self._text(q.get('question'), 'Nội dung câu hỏi')
        if q['review_status'] not in STATUSES:
            raise ServiceError('Trạng thái câu hỏi không hợp lệ.')
        status = q['review_status']
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
                if status == 'draft':
                    exp = [f'Giải thích phương án {chr(65+i)}' for i in range(4)]
                else:
                    raise ServiceError('Cần giải thích riêng cho cả 4 phương án.')
            if status == 'draft':
                q['option_explanations'] = [str(x).strip() or f'Giải thích phương án {chr(65+i)}' for i, x in enumerate(exp)]
            else:
                q['option_explanations'] = [self._text(x, 'Giải thích phương án') for x in exp]
        elif q['type'] == 'YN':
            stmts = q.get('statements')
            if not isinstance(stmts, list) or len(stmts) != 4:
                raise ServiceError('Câu Đúng/Sai (YN) cần đúng 4 mệnh đề a, b, c, d.')
            cleaned_stmts = []
            for i, st in enumerate(stmts):
                if not isinstance(st, dict):
                    raise ServiceError(f'Mệnh đề thứ {i+1} không đúng định dạng.')
                lbl = str(st.get('label') or chr(97 + i)).strip()
                txt = self._text(st.get('text'), f'Nội dung mệnh đề {lbl}')
                cleaned_stmts.append({'label': lbl, 'text': txt, 'correct': bool(st.get('correct', False))})
            q['statements'] = cleaned_stmts
        elif q['type'] == 'SHORT':
            answer = canonical_short_answer(q)
            q.pop('correct_answer', None); q.pop('answer', None)
            if status != 'draft':
                self._text(answer, 'Đáp án câu trả lời ngắn')
            q['short_answer'] = answer
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
        outcomes = lesson.get('outcomes') or []
        if q.get('learning_outcome') in outcomes:
            q['outcome_index'] = outcomes.index(q['learning_outcome'])
        elif status == 'draft':
            q['outcome_index'] = None  # Câu nháp (ví dụ do AI đề xuất) chưa gắn YCCĐ trong PPCT.
        else:
            raise ServiceError('Yêu cầu cần đạt phải thuộc bài học trong PPCT.',
                               {'lesson_code': lesson_code, 'learning_outcome': q.get('learning_outcome')})
        return q

    def _validate_bank(self, bank):
        if isinstance(bank, list):
            bank = {'questions': bank, 'ppct': copy.deepcopy(self.catalog)}
        if not isinstance(bank, dict) or not isinstance(bank.get('questions'), list):
            raise ServiceError('Ngân hàng cần có mảng questions.')
        if 'ppct' not in bank or bank.get('ppct') is None:
            bank['ppct'] = copy.deepcopy(self.catalog)
        elif bank.get('ppct') != self.catalog:
            raise ServiceError('PPCT chỉ đọc; không được thay nguồn qua nhập ngân hàng.')
        result = copy.deepcopy(bank)
        ids, texts = set(), set()
        checked = []
        for raw in bank['questions']:
            if not isinstance(raw, dict):
                raise ServiceError('Câu hỏi phải là một đối tượng JSON.')
            if not raw.get('id'):
                raw['id'] = f"K{raw.get('grade', 10)}-GV-{uuid.uuid4().hex[:12]}"
            if not raw.get('origin'):
                raw['origin'] = 'teacher'
            if not raw.get('review_status'):
                raw['review_status'] = 'draft'
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

    def save_question(self, raw, origin='teacher'):
        with self.lock:
            q = self._validate_question(raw)
            bank = self._load_bank()
            ident = q.get('id')
            old = None
            if ident:
                old = next((x for x in bank['questions'] if x['id'] == ident), None)
                if old is None:
                    raise ServiceError('Không tìm thấy mã câu để sửa.', {'id': ident}, 404)
            else:
                q['id'] = f'K{q["grade"]}-GV-{uuid.uuid4().hex[:12]}'
            q['origin'] = old.get('origin', origin) if old else origin
            self._apply_review_rules(q, old)
            q['updated_at'] = now()
            replaced = False
            for i, existing in enumerate(bank['questions']):
                if existing['id'] == q['id']:
                    bank['questions'][i] = q; replaced = True; break
            if not replaced:
                bank['questions'].append(q)
            checked = self._validate_bank(bank)
            self._atomic_save(self.bank_path, checked)
            return copy.deepcopy(next(x for x in checked['questions'] if x['id'] == q['id']))

    def _apply_review_rules(self, q, old):
        """Lưu câu không bao giờ đưa câu lên approved; sửa nội dung câu đã duyệt thì về needs_review (B1)."""
        q['review_history'] = copy.deepcopy(old.get('review_history', [])) if old else []
        q['review_hash'] = review_hash(q)
        requested = q['review_status']
        if str(q.get('origin', '')).startswith('ai'):
            if old is None or requested == 'approved':
                q['review_status'] = 'draft' if old is None else normalize_status(old.get('review_status'))
            if old is None:
                return
        old_status = normalize_status(old.get('review_status')) if old else None
        if old_status == 'approved' and q['review_hash'] != old.get('review_hash', review_hash(old)):
            q['review_status'] = 'needs_review'
            q['review_history'].append(dict(action='edit_after_approval', at=now(), by=getattr(self, 'actor', 'local'),
                                            content_hash=q['review_hash']))
        elif requested == 'approved' and old_status != 'approved':
            q['review_status'] = old_status if old_status in ('draft', 'needs_review') else 'pending_review'

    def review_question(self, ident, action, actor='local', checklist=None, reason=''):
        """Chuyển trạng thái duyệt: submit | approve | return | reopen. Ghi lịch sử mỗi lần chuyển."""
        with self.lock:
            bank = self._load_bank()
            q = next((x for x in bank['questions'] if x.get('id') == ident), None)
            if q is None:
                raise ServiceError('Không tìm thấy câu hỏi.', {'id': ident}, 404)
            status = normalize_status(q.get('review_status'))
            reason = str(reason or '').strip()
            entry = dict(action=action, at=now(), by=str(actor or 'local'), from_status=status)
            if action == 'submit':
                if status not in ('draft', 'needs_review'):
                    raise ServiceError('Chỉ gửi duyệt được câu nháp hoặc câu cần sửa lại.', {'status': status}, 409)
                problems = technical_problems(q)
                if problems:
                    raise ServiceError('Câu hỏi chưa qua kiểm tra kỹ thuật.', {'problems': problems})
                new_status = 'pending_review'
            elif action == 'approve':
                if status != 'pending_review':
                    raise ServiceError('Chỉ duyệt được câu đang chờ duyệt.', {'status': status}, 409)
                checklist = checklist if isinstance(checklist, dict) else {}
                missing = [item['key'] for item in CHECKLIST if checklist.get(item['key']) is not True]
                if missing:
                    raise ServiceError('Phiếu kiểm định chưa được xác nhận đủ.', {'missing': missing})
                problems = technical_problems(q)
                if problems:
                    raise ServiceError('Câu hỏi chưa qua kiểm tra kỹ thuật.', {'problems': problems})
                entry['checklist'] = {item['key']: True for item in CHECKLIST}
                new_status = 'approved'
            elif action == 'return':
                if status not in ('pending_review', 'approved'):
                    raise ServiceError('Chỉ trả lại được câu đang chờ duyệt hoặc đã duyệt.', {'status': status}, 409)
                if not reason:
                    raise ServiceError('Khi trả lại phải ghi lý do cần sửa.')
                new_status = 'needs_review'
            else:
                raise ServiceError('Thao tác duyệt không hợp lệ.', {'action': action})
            if reason:
                entry['reason'] = reason[:1000]
            q['review_hash'] = review_hash(q)
            entry['content_hash'] = q['review_hash']
            q['review_status'] = new_status
            q.setdefault('review_history', []).append(entry)
            q['updated_at'] = now()
            self._atomic_save(self.bank_path, bank)
            return copy.deepcopy(q)

    def archive_question(self, ident):
        with self.lock:
            bank = self._load_bank()
            q = next((x for x in bank['questions'] if x['id'] == ident), None)
            if q is None:
                raise ServiceError('Không tìm thấy câu hỏi.', {'id': ident}, 404)
            if q.get('review_status') != 'archived':
                q['status_before_archive'] = q.get('review_status', 'draft')
            q['review_status'] = 'archived'; q['archived_at'] = now()
            self._atomic_save(self.bank_path, bank)
            return copy.deepcopy(bank)

    def restore_question(self, ident, status=None):
        with self.lock:
            bank = self._load_bank()
            q = next((x for x in bank['questions'] if x['id'] == ident), None)
            if q is None:
                raise ServiceError('Không tìm thấy câu hỏi.', {'id': ident}, 404)
            # Khôi phục về đúng trạng thái trước khi lưu trữ; không dùng khôi phục để nâng lên approved.
            previous = normalize_status(q.pop('status_before_archive', None) or 'draft')
            status = normalize_status(status) if status else previous
            if status == 'approved' and previous != 'approved':
                status = 'pending_review'
            if status not in STATUSES or status == 'archived':
                status = previous
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
                status = normalize_status(status)
                if status not in ('draft', 'archived', 'pending_review'):
                    raise ServiceError('Thao tác hàng loạt chỉ chuyển về nháp, gửi duyệt hoặc lưu trữ; '
                                       'duyệt câu phải làm từng câu với phiếu kiểm định.')
                if status == 'pending_review':
                    failing = {q['id']: technical_problems(q) for q in bank['questions']
                               if q.get('id') in target_ids and technical_problems(q)}
                    if failing:
                        raise ServiceError('Có câu chưa qua kiểm tra kỹ thuật.', {'problems': failing})
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
            if isinstance(payload.get('lesson'), dict):
                payload = dict(payload, **payload['lesson'])
            grade = self._grade(payload.get('grade'))
            subj = normalize_subject_name(payload.get('subject_name') or payload.get('subject') or self.context.get('subject_name') or 'Tin học')
            code = self._text(payload.get('lesson_code'), 'Mã bài học')
            name = self._text(payload.get('lesson_name_source') or payload.get('lesson_name'), 'Tên bài học')
            topic = self._text(payload.get('topic_source') or payload.get('topic') or 'Chủ đề chung', 'Tên chủ đề')
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
            existing = next((x for x in lessons
                             if normalize_subject_name(x.get('subject_name') or 'Tin học') == subj
                             and x.get('grade') == grade and x.get('lesson_code') == code), None)
            if existing:
                old_outcomes = existing.get('outcomes', [])
                used = {q.get('learning_outcome') for q in bank.get('questions', [])
                        if normalize_subject_name(q.get('subject_name') or 'Tin học') == subj
                        and q.get('grade') == grade and q.get('lesson_code') == code}
                if used - set(outcomes):
                    raise ServiceError('Yêu cầu cần đạt đang có câu hỏi sử dụng. Hãy cập nhật các câu hỏi liên quan trước khi bỏ hoặc thay yêu cầu này.', status=409)
                if outcomes != old_outcomes and any(
                    normalize_subject_name(m.get('subject_name') or 'Tin học') == subj
                    and m.get('grade') == grade and any(r.get('lesson_code') == code for r in m.get('requirements', []))
                    for m in self._read_data(self.data_dir/'matrices/records.json', [])):
                    raise ServiceError('Bài đã được liên kết trong ma trận. Giữ nguyên danh sách và thứ tự YCCĐ hoặc điều chỉnh ma trận trước.', status=409)
                for q in bank.get('questions', []):
                    if normalize_subject_name(q.get('subject_name') or 'Tin học') == subj and q.get('grade') == grade and q.get('lesson_code') == code:
                        q['lesson_name'] = name
                        q['topic_source'] = topic
                        if q.get('learning_outcome') in outcomes:
                            q['outcome_index'] = outcomes.index(q['learning_outcome'])
                existing['subject_name'] = subj
                existing['lesson_name_source'] = name
                existing['topic_source'] = topic
                existing['outcomes'] = outcomes
                if payload.get('week_raw') or payload.get('periods_raw'):
                    existing['occurrences'] = [dict(table_index=0, row_index=0, week_raw=week_raw, periods_raw=periods_raw)]
            else:
                entry = dict(
                    grade=grade,
                    subject_name=subj,
                    lesson_code=code,
                    lesson_name_source=name,
                    topic_source=topic,
                    outcomes=outcomes,
                    source_file='Cập nhật trực tiếp trên ứng dụng',
                    occurrences=[dict(table_index=0, row_index=0, week_raw=week_raw, periods_raw=periods_raw)],
                )
                lessons.append(entry)
            self.catalog = copy.deepcopy(bank['ppct'])
            self.lessons = {}
            for x in self.catalog.get('lessons', []):
                s = normalize_subject_name(x.get('subject_name') or 'Tin học')
                self.lessons[(s, x['grade'], x['lesson_code'])] = x
                if s == 'Tin học':
                    self.lessons[(x['grade'], x['lesson_code'])] = x
            self._atomic_save(self.bank_path, bank)
            return copy.deepcopy(bank)

    def delete_ppct_lesson(self, grade, lesson_code, subject_name='Tin học'):
        with self.lock:
            grade = self._grade(grade)
            code = self._text(lesson_code, 'Mã bài học')
            if subject_name == 'Tin học' and self.context.get('subject_name'):
                subj = normalize_subject_name(self.context.get('subject_name'))
            else:
                subj = normalize_subject_name(subject_name)
            bank = self._load_bank()
            if any(normalize_subject_name(q.get('subject_name') or 'Tin học') == subj
                   and q.get('grade') == grade and q.get('lesson_code') == code for q in bank.get('questions', [])):
                raise ServiceError('Không thể xóa bài học đang có câu hỏi gắn kèm trong ngân hàng.')
            if any(normalize_subject_name(m.get('subject_name') or 'Tin học') == subj
                   and m.get('grade') == grade and any(l.get('lesson_code') == code for l in m.get('lessons', []))
                   for m in self._read_data(self.data_dir/'matrices/records.json', [])):
                raise ServiceError('Không thể xóa bài học đang được dùng trong ma trận.', status=409)
            lessons = bank.setdefault('ppct', {}).setdefault('lessons', [])
            before = len(lessons)
            bank['ppct']['lessons'] = [x for x in lessons if not (normalize_subject_name(x.get('subject_name') or 'Tin học') == subj and x.get('grade') == grade and x.get('lesson_code') == code)]
            if len(bank['ppct']['lessons']) == before:
                raise ServiceError('Không tìm thấy bài học cần xóa.', status=404)
            self.catalog = copy.deepcopy(bank['ppct'])
            self.lessons = {}
            for x in self.catalog.get('lessons', []):
                s = normalize_subject_name(x.get('subject_name') or 'Tin học')
                self.lessons[(s, x['grade'], x['lesson_code'])] = x
                if s == 'Tin học':
                    self.lessons[(x['grade'], x['lesson_code'])] = x
            self._atomic_save(self.bank_path, bank)
            return copy.deepcopy(bank)

    # Nhập PPCT từ Word (bảng KHDH Phụ lục 1) hoặc JSON: đối chiếu trước, chỉ ghi khi giáo viên xác nhận.
    def _read_ppct_payload(self, payload):
        import base64
        import binascii
        from ppct_import import grade_from_filename, parse_docx, parse_json
        if not isinstance(payload, dict):
            raise ServiceError('Dữ liệu nhập PPCT không hợp lệ.')
        name = str(payload.get('filename') or '').strip()
        subj = normalize_subject_name(payload.get('subject_name') or payload.get('subject') or self.context.get('subject_name') or 'Tin học')
        grade = payload.get('grade')
        if isinstance(grade, str) and grade.strip().isdigit():
            grade = int(grade)
        if payload.get('content_base64') is not None:
            if not name.lower().endswith('.docx') or not isinstance(payload['content_base64'], str):
                raise ServiceError('Chọn một tệp .docx hợp lệ.')
            try:
                raw = base64.b64decode(payload['content_base64'], validate=True)
            except (binascii.Error, ValueError) as exc:
                raise ServiceError('Nội dung tệp tải lên không hợp lệ.') from exc
            if not 0 < len(raw) <= 8*1024*1024:
                raise ServiceError('Tệp Word phải nhỏ hơn 8 MB.')
            grade = self._grade(grade if grade not in (None, '') else grade_from_filename(name))
            lessons, issues = parse_docx(raw, grade, name)
        elif payload.get('json') is not None:
            raw = json.dumps(payload['json'], ensure_ascii=False, sort_keys=True).encode('utf-8')
            lessons, issues = parse_json(payload['json'], grade if grade not in (None, '') else None, subject_name=subj)
            name = name or 'PPCT.json'
        else:
            raise ServiceError('Chọn tệp Word (.docx) hoặc JSON chứa PPCT.')
        for lesson in lessons:
            lesson['grade'] = self._grade(lesson['grade'])
            lesson['subject_name'] = normalize_subject_name(lesson.get('subject_name') or subj)
            for occurrence in lesson.get('occurrences') or []:
                occurrence.setdefault('grade', lesson['grade'])
            lesson['source_file'] = lesson.get('source_file') or name
        return lessons, issues, name, raw, subj

    def _ppct_conflict(self, bank, grade, code, outcomes, subject_name='Tin học'):
        """Cùng quy tắc với save_ppct_lesson: không bỏ YCCĐ đang có câu dùng; không đổi YCCĐ của bài đã gắn ma trận."""
        subj = normalize_subject_name(subject_name)
        existing = next((x for x in bank['ppct'].get('lessons', [])
                         if normalize_subject_name(x.get('subject_name') or 'Tin học') == subj
                         and x.get('grade') == grade and x.get('lesson_code') == code), None)
        if existing is None or existing.get('outcomes', []) == outcomes:
            return None
        used = {q.get('learning_outcome') for q in bank.get('questions', [])
                if normalize_subject_name(q.get('subject_name') or 'Tin học') == subj
                and q.get('grade') == grade and q.get('lesson_code') == code}
        missing = sorted(x for x in used - set(outcomes) if x)
        if missing:
            return dict(reason='Yêu cầu cần đạt đang có câu hỏi sử dụng sẽ bị bỏ hoặc thay.', outcomes=missing)
        if any(normalize_subject_name(m.get('subject_name') or 'Tin học') == subj
               and m.get('grade') == grade and any(r.get('lesson_code') == code for r in m.get('requirements', []))
               for m in self._read_data(self.data_dir/'matrices/records.json', [])):
            return dict(reason='Bài đã được liên kết trong ma trận; YCCĐ phải giữ nguyên danh sách và thứ tự.')
        return None

    def _ppct_diff(self, bank, lessons, subject_name='Tin học'):
        from ppct_import import same_name
        current = {(normalize_subject_name(x.get('subject_name') or 'Tin học'), x.get('grade'), x.get('lesson_code')): x
                   for x in bank['ppct'].get('lessons', [])}
        rows = []
        for lesson in lessons:
            subj = normalize_subject_name(lesson.get('subject_name') or subject_name)
            key = (subj, lesson['grade'], lesson['lesson_code'])
            old = current.get(key)
            row = dict(grade=lesson['grade'], lesson_code=lesson['lesson_code'], subject_name=subj,
                       lesson_name=lesson['lesson_name_source'],
                       topic=lesson['topic_source'], outcomes=lesson['outcomes'], occurrences=len(lesson.get('occurrences') or []))
            if not lesson['outcomes']:
                row.update(status='conflict', conflict=dict(reason='Bài chưa có yêu cầu cần đạt.'))
            elif old is None:
                row['status'] = 'new'
            else:
                changes = []
                if not same_name(old.get('lesson_name_source', ''), lesson['lesson_name_source']):
                    changes.append(dict(field='Tên bài', old=old.get('lesson_name_source', ''), new=lesson['lesson_name_source']))
                if (old.get('topic_source') or '') != lesson['topic_source']:
                    changes.append(dict(field='Chủ đề', old=old.get('topic_source', ''), new=lesson['topic_source']))
                if old.get('outcomes', []) != lesson['outcomes']:
                    changes.append(dict(field='Yêu cầu cần đạt', old=old.get('outcomes', []), new=lesson['outcomes']))
                conflict = self._ppct_conflict(bank, lesson['grade'], lesson['lesson_code'], lesson['outcomes'], subject_name=subj)
                row.update(status='conflict' if conflict else ('changed' if changes else 'unchanged'), changes=changes)
                if conflict:
                    row['conflict'] = conflict
            rows.append(row)
        summary = {k: sum(r['status'] == k for r in rows) for k in ('new', 'changed', 'unchanged', 'conflict')}
        return rows, summary

    def inspect_ppct_import(self, payload):
        with self.lock:
            lessons, issues, name, raw, subj = self._read_ppct_payload(payload)
            rows, summary = self._ppct_diff(self._load_bank(), lessons, subject_name=subj)
            return dict(filename=name, sha256=hashlib.sha256(raw).hexdigest(), lessons=rows, summary=summary, issues=issues,
                        grades=sorted({x['grade'] for x in lessons}), subject_name=subj)

    def apply_ppct_import(self, payload):
        """Thêm bài mới, cập nhật bài thay đổi; bỏ qua bài xung đột. Bài đang có mà tệp không nhắc tới được giữ nguyên."""
        from ppct_import import same_name
        with self.lock:
            lessons, issues, name, raw, subj = self._read_ppct_payload(payload)
            sha = hashlib.sha256(raw).hexdigest()
            if payload.get('expected_sha256') and payload['expected_sha256'] != sha:
                raise ServiceError('Tệp đã thay đổi so với lúc đối chiếu. Hãy đọc và đối chiếu lại.', status=409)
            bank = self._load_bank()
            rows, summary = self._ppct_diff(bank, lessons, subject_name=subj)
            status = {(normalize_subject_name(r.get('subject_name') or subj), r['grade'], r['lesson_code']): r['status'] for r in rows}
            if not summary['new'] and not summary['changed']:
                raise ServiceError('Không có bài mới hoặc bài thay đổi để nhập.', dict(summary=summary), 409)
            catalog = bank.setdefault('ppct', {})
            current = catalog.setdefault('lessons', [])
            for lesson in lessons:
                key = (normalize_subject_name(lesson.get('subject_name') or subj), lesson['grade'], lesson['lesson_code'])
                entry = dict(grade=lesson['grade'], lesson_code=lesson['lesson_code'], subject_name=key[0],
                             lesson_name_source=lesson['lesson_name_source'],
                             topic_source=lesson['topic_source'], outcomes=lesson['outcomes'], source_file=lesson['source_file'],
                             occurrences=lesson.get('occurrences') or [dict(table_index=0, row_index=0, week_raw='', periods_raw='')])
                if status[key] == 'new':
                    current.append(entry)
                elif status[key] == 'changed':
                    old = next(x for x in current
                               if (normalize_subject_name(x.get('subject_name') or 'Tin học'), x.get('grade'), x.get('lesson_code')) == key)
                    if same_name(old.get('lesson_name_source', ''), entry['lesson_name_source']):
                        entry['lesson_name_source'] = old['lesson_name_source']
                    old.update(entry)
                    for q in bank.get('questions', []):
                        if (normalize_subject_name(q.get('subject_name') or 'Tin học'), q.get('grade'), q.get('lesson_code')) == key:
                            q['lesson_name'] = entry['lesson_name_source']
                            q['topic_source'] = entry['topic_source']
                            if q.get('learning_outcome') in entry['outcomes']:
                                q['outcome_index'] = entry['outcomes'].index(q['learning_outcome'])
            sources = catalog.setdefault('sources', [])
            for grade in sorted({x['grade'] for x in lessons}):
                if not any(x.get('grade') == grade and normalize_subject_name(x.get('subject_name') or 'Tin học') == subj and x.get('sha256') == sha for x in sources):
                    sources.append(dict(grade=grade, subject_name=subj, path=name, sha256=sha, imported_at=now(),
                                        approval_status='Nhập qua ứng dụng; giáo viên đối chiếu với bản KHDH đã duyệt.'))
            if name.lower().endswith('.docx'):
                self.write_source('matrices/sources/ppct-'+sha+'.docx', raw)
            self.catalog = copy.deepcopy(bank['ppct'])
            self.lessons = {}
            for x in self.catalog.get('lessons', []):
                s = normalize_subject_name(x.get('subject_name') or 'Tin học')
                self.lessons[(s, x['grade'], x['lesson_code'])] = x
                if s == 'Tin học':
                    self.lessons[(x['grade'], x['lesson_code'])] = x
            self._atomic_save(self.bank_path, bank)
            return dict(bank=copy.deepcopy(bank), summary=summary, lessons=rows, issues=issues)

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

    def _first_period(self, grade, lesson_code, subject_name='Tin học'):
        subj = normalize_subject_name(subject_name)
        lesson = self.lessons.get((subj, grade, lesson_code)) or self.lessons.get((grade, lesson_code), {})
        periods = []
        for occurrence in lesson.get('occurrences', []):
            periods.extend(int(x) for x in re.findall(r'\d+', str(occurrence.get('periods_raw', ''))))
        return min(periods) if periods else math.inf

    def _cells_from_matrix(self, m, grade, exam_type):
        if m.get('grade') != grade or m.get('exam_type') != exam_type:
            raise ServiceError('Ma trận đã chọn khác khối hoặc kì kiểm tra.', {'matrix_id': m.get('id')})
        subj = normalize_subject_name(m.get('subject_name') or 'Tin học')
        reqs = {r['id']: r for r in m.get('requirements', [])}
        cells, total = {}, Decimal(0)
        slot_ids = set()
        for slot in m.get('slots', []):
            sid = slot.get('id')
            if not isinstance(sid, str) or not sid or sid in slot_ids or type(slot.get('number')) is not int:
                raise ServiceError('Ma trận thiếu hoặc trùng mã vị trí nguồn.', {'slot': slot.get('number')})
            slot_ids.add(sid)
            parts = [reqs.get(p.get('requirement_id')) for p in slot.get('parts', [])]
            if not parts or None in parts:
                raise ServiceError('Ma trận có vị trí câu chưa gắn yêu cầu cần đạt.', {'slot': slot.get('number')})
            lessons = {r['lesson_code'] for r in parts}; levels = {r['level'] for r in parts}
            if len(lessons) != 1 or len(levels) != 1:
                if len(lessons) != 1:
                    raise ServiceError('Câu gồm nhiều bài chưa tạo tự động được; dùng "Tạo đề riêng" ở Ma trận & đặc tả.',
                                       {'slot': slot.get('number'), 'kind': slot.get('kind')})
            lesson = next(iter(lessons))
            catalog = self.lessons.get((subj, grade, lesson)) or self.lessons.get((grade, lesson)) or {}
            outcomes = []
            for r in parts:
                idx = r.get('ppct_outcome_index')
                text = catalog.get('outcomes', [])[idx] if isinstance(idx, int) and idx < len(catalog.get('outcomes', [])) else None
                if text is None:
                    if catalog.get('outcomes'):
                        text = catalog['outcomes'][0]
                    else:
                        raise ServiceError('Yêu cầu trong ma trận chưa gắn YCCĐ của PPCT.', {'slot': slot.get('number'), 'requirement': r.get('id')})
                if text not in outcomes:
                    outcomes.append(text)
            points = sum((number(p.get('points'), 'Điểm') for p in slot['parts']), Decimal(0))
            total += points
            key = (lesson, slot['kind'], next(iter(levels)), tuple(sorted(outcomes)))
            cell = cells.setdefault(key, {'count': 0, 'points': [], 'source_slots': []})
            cell['count'] += 1; cell['points'].append(float(points))
            cell['source_slots'].append(dict(id=sid, number=slot['number']))
        if total != 10:
            raise ServiceError('Tổng điểm ma trận phải bằng 10.', {'total_points': str(total)})
        rows = [dict(lesson_code=k[0], type=k[1], level=k[2], count=c['count'], outcomes=list(k[3]),
                     points_per_question=c['points'][0] if len(set(c['points'])) == 1 else None, points=c['points'])
                for k, c in cells.items()]
        profile = m.get('profile') or (default_profile_for_grade(grade) if self.school_profile else 'GENERAL')
        return rows, None, cells, profile, allowed_kinds(m)

    def _matrix_cells(self, payload, grade, exam_type):
        """Đọc ma trận thành các ô đã kiểm tra; dùng chung cho đề, bộ đề và đề cương tự động.

        Nguồn: ma trận đã khóa ở "Ma trận & đặc tả" (`_matrix`, do máy chủ nạp từ `matrix_id`; ô gồm cả YCCĐ),
        mẫu ma trận khóa (`template_id`) hoặc phân bố tự thiết lập (`blueprint`). Ô = (bài, dạng, mức độ[, YCCĐ]).
        """
        if payload.get('_matrix'):
            return self._cells_from_matrix(payload['_matrix'], grade, exam_type)
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
        # B3: dạng câu theo mẫu hồ sơ (THCS: MC, tự luận; THPT theo CV 7991: thêm Đ/S, trả lời ngắn; KTTX: tự chọn).
        profile = payload.get('profile') or (default_profile_for_grade(grade) if self.school_profile else 'GENERAL')
        if profile not in PROFILE_KINDS:
            raise ServiceError('Mẫu hồ sơ kiểm tra không hợp lệ.', {'profile': profile})
        if payload.get('scoring_policy') is not None:
            policy_table(payload['scoring_policy'])
        kinds_allowed = allowed_kinds(dict(profile=profile, **({'allowed_kinds': payload['allowed_kinds']}
                                                                if payload.get('allowed_kinds') is not None else {})))
        subj = normalize_subject_name(payload.get('subject_name') or payload.get('subject') or (payload.get('_matrix') or {}).get('subject_name') or self.context.get('subject_name') or 'Tin học')
        total = Decimal(0)
        cells = {}
        for row in rows:
            if not isinstance(row, dict):
                raise ServiceError('Dòng ma trận không đúng định dạng.')
            if row.get('type') not in kinds_allowed:
                label = KIND_LABELS.get(row.get('type'))
                raise ServiceError(f'Mẫu hồ sơ {profile} không có dạng {label}.' if label else
                                   f'Không có dạng câu {row.get("type")}; Đúng/Sai không được đổi thành MC.',
                                   {'type': row.get('type'), 'allowed_kinds': list(kinds_allowed)})
            l_code = row.get('lesson_code')
            has_lesson = (grade, l_code) in self.lessons or (subj, grade, l_code) in self.lessons
            if not isinstance(l_code, str) or not has_lesson or row.get('level') not in ALLOWED_LEVELS:
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
        return rows, template, cells, profile, kinds_allowed

    def _cell_candidates(self, bank, grade, exam_type, template, key, subject_name='Tin học'):
        """Câu approved đúng ô (bài, dạng, mức độ), không trùng mã hay nội dung; kèm cờ bài sau mốc kiểm tra."""
        lesson, kind, level = key[:3]
        outcomes = set(key[3]) if len(key) > 3 else None
        subj = normalize_subject_name(subject_name)
        limits = {'GK1': 20 if grade == 10 else 10, 'CK1': 32 if grade == 10 else 16,
                  'GK2': 52 if grade == 10 else 26, 'CK2': 62 if grade == 10 else 31}
        after_exam = self.school_profile and subj == 'Tin học' and exam_type in limits and self._first_period(grade, lesson, subj) >= limits[exam_type]
        strict = [q for q in bank if normalize_subject_name(q.get('subject_name') or 'Tin học') == subj and
                  q['grade'] == grade and q['lesson_code'] == lesson and
                  q['type'] == kind and q['level'] == level and q.get('review_status') in EXAM_ELIGIBLE and
                  (outcomes is None or q.get('learning_outcome') in outcomes) and
                  (template is not None or outcomes is not None or not after_exam)]
        seen_ids, seen_text, unique = set(), set(), []
        for q in strict:
            marker = normalized(q['question'])
            if q['id'] not in seen_ids and marker not in seen_text:
                seen_ids.add(q['id']); seen_text.add(marker); unique.append(q)
        return unique, after_exam

    def generate_exam(self, payload):
        with self.lock:
            grade = self._grade(payload.get('grade'))
            exam_type = payload.get('exam_type')
            if exam_type not in ('TX', 'GK1', 'CK1', 'GK2', 'CK2'):
                raise ServiceError('Loại kiểm tra không hợp lệ.')
            title = self._text(payload.get('title'), 'Tên đề kiểm tra')
            matrix = payload.get('_matrix')
            subj = normalize_subject_name((matrix or {}).get('subject_name') or payload.get('subject_name') or self.context.get('subject_name') or 'Tin học')
            duration = payload.get('duration', (matrix or {}).get('duration') or 45)
            if type(duration) is not int or not 1 <= duration <= 300:
                raise ServiceError('Thời lượng phải là số nguyên từ 1 đến 300 phút.')
            rows, template, cells, profile, kinds_allowed = self._matrix_cells(payload, grade, exam_type)
            # Đề cương không bắt buộc khi tạo: đề chưa gắn đề cương vẫn bị chặn ở bước duyệt (rules/01, B6).
            revision = self.get_record('revisions', payload['revision_id']) if payload.get('revision_id') else None
            if revision and revision['grade'] != grade:
                raise ServiceError('Đề cương đối chiếu phải cùng khối với đề kiểm tra.')
            sim_pct = float(resolve_similarity(payload.get('similarity_percent', 90)))
            sim_mode = payload.get('similarity_mode', 'min')
            if sim_mode not in ('min', 'exact'):
                sim_mode = 'min'
            revision_hashes = {content_hash(q) for q in revision['questions']} if revision else set()
            bank = self._load_bank()['questions']
            rng = random.Random(str(payload.get('seed', '')))
            total_needed = sum(c['count'] for c in cells.values())
            target_covered_total = math.ceil(Decimal(str(sim_pct)) / Decimal('100') * total_needed)
            outside_budget = max(0, total_needed - target_covered_total) if sim_mode == 'exact' else 0
            forced = payload.get('question_ids')  # bộ đề: câu đã chia sẵn cho từng ô
            if forced is not None and (not isinstance(forced, list) or not all(isinstance(x, str) for x in forced)
                                       or len(forced) != len(set(forced)) or len(forced) != total_needed):
                raise ServiceError('Danh sách câu chỉ định phải đủ số câu của ma trận, không trùng mã.')
            selected, missing, matched = [], [], 0
            used_forced_ids = set()
            for key, cell in cells.items():
                lesson, kind, level = key[:3]
                unique, after_exam = self._cell_candidates(bank, grade, exam_type, template, key, subject_name=subj)
                if forced is not None:
                    chosen = [q for q in unique if q['id'] in forced and q['id'] not in used_forced_ids][:cell['count']]
                    used_forced_ids.update(q['id'] for q in chosen)
                    if len(chosen) != cell['count']:
                        raise ServiceError('Câu chỉ định không khớp ô ma trận hoặc chưa được duyệt.',
                                           {'lesson_code': lesson, 'type': kind, 'level': level,
                                             'requested': cell['count'], 'matched': len(chosen)})
                elif len(unique) < cell['count']:
                    missing.append(dict(lesson_code=lesson, type=kind, level=level, requested=cell['count'],
                                        available=len(unique), missing=cell['count']-len(unique),
                                        reason='Bài học sau mốc kiểm tra.' if after_exam and template is None else 'Không đủ câu trong đúng ô.'))
                    continue
                if forced is None:
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
                for index, (q, points) in enumerate(zip(chosen, cell['points'])):
                    snap = copy.deepcopy(q); snap['content_hash'] = content_hash(q); snap['points'] = points
                    if 'source_slots' in cell:
                        source_slot = cell['source_slots'][index]
                        snap.update(slot_id=source_slot['id'], slot_number=source_slot['number'])
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
            required = math.ceil((Decimal(str(sim_pct)) / Decimal('100')) * len(selected)) if revision else None
            if revision and matched < required:
                msg = 'Chưa đạt ít nhất 90% nội dung từ phiên bản đề cương.' if sim_pct == 90 else f'Chưa đạt ít nhất {sim_pct:g}% nội dung từ phiên bản đề cương.'
                raise ServiceError(msg,
                                   {'matched': matched, 'required': required, 'total': len(selected),
                                    'similarity_percent': sim_pct,
                                    'revision_id': revision['id'], 'reason': 'Câu sửa nội dung sau khi lưu đề cương không được tính trùng phiên bản.'})
            exam = dict(id=f'EXAM-{uuid.uuid4().hex[:12]}', title=title, grade=grade, exam_type=exam_type,
                        subject_name=subj,
                        duration=duration, created_at=now(), seed=payload.get('seed'), blueprint=rows,
                        status='drafting',
                        template_id=template['id'] if template else None,
                        source_notes=template.get('source_notes', '') if template else '',
                        source_file=template.get('source_file', '') if template else '',
                        source_sha256=template.get('source_sha256', '') if template else '',
                        revision_id=revision['id'] if revision else None,
                        revision_match_count=matched if revision else None, revision_required_count=required,
                        similarity_target_percent=sim_pct, similarity_mode=sim_mode,
                        question_count=len(selected), total_points=10, questions=selected,
                        profile=profile, allowed_kinds=list(kinds_allowed),
                        scoring_policy=exam_policy(payload.get('scoring_policy', (matrix or {}).get('scoring_policy')), exam_type),
                        validation_note='Đã kiểm tra theo bài, dạng và mức độ; giáo viên cần đối chiếu chi tiết từng YCCĐ của bảng đặc tả trước khi phát hành.'
                                        + ('' if revision else ' Đề chưa gắn đề cương: chưa duyệt được cho đến khi gắn đề cương đạt T ≥ 90%.'))
            if matrix:  # ô ma trận gồm cả YCCĐ; chụp ma trận để bước duyệt đối chiếu từng ô (B4)
                exam.update(matrix_id=matrix['id'], matrix_version=matrix.get('version'),
                            matrix_digest=matrix.get('content_sha256'), matrix_snapshot=copy.deepcopy(matrix),
                            duration=duration)
            records = self._records('exams'); exam['reuse_check'] = self.reuse_check(exam, records)
            self._refresh_revision_check(exam); records.append(exam)
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(exam)

    @staticmethod
    def _cell_key(key):
        return '|'.join(list(key[:3]) + list(key[3] if len(key) > 3 else ()))

    def _revision_plan(self, cells, candidates, counts=None, total=None, rng=None, lesson_counts=None):
        """Số câu đề cương từng ô: theo `counts` (khóa ô → số câu), `lesson_counts` (bài → {MC, ES}), hoặc chia `total` theo tỉ lệ số câu của ô,
        mặc định gấp 1,5 lần số câu một đề; không vượt số câu đã duyệt. Chọn rải đều các YCCĐ trong ô."""
        rng = rng or random.Random('')
        keys = list(cells)
        need = {k: cells[k]['count'] for k in keys}
        if lesson_counts is not None and isinstance(lesson_counts, dict) and counts is None:
            counts = {}
            groups = {}
            for k in keys:
                groups.setdefault((k[0], k[1]), []).append(k)
            for (l_code, q_type), group_keys in groups.items():
                cfg = lesson_counts.get(l_code, {})
                target = cfg.get(q_type, 0) if isinstance(cfg, dict) else (cfg if isinstance(cfg, int) else 0)
                if target > 0:
                    group_need = sum(need[k] for k in group_keys) or len(group_keys)
                    raw = {k: Decimal(target) * (need[k] or 1) / group_need for k in group_keys}
                    want_part = {k: int(raw[k]) for k in group_keys}
                    for k in sorted(group_keys, key=lambda k: raw[k] - want_part[k], reverse=True)[:target - sum(want_part.values())]:
                        want_part[k] += 1
                    for k in group_keys:
                        counts[self._cell_key(k)] = want_part[k]
                else:
                    for k in group_keys:
                        counts[self._cell_key(k)] = 0

        if counts is not None:
            if not isinstance(counts, dict) or any(type(v) is not int or v < 0 for v in counts.values()):
                raise ServiceError('Số câu đề cương từng ô phải là số nguyên không âm.')
            want = {k: counts.get(self._cell_key(k), 0) for k in keys}
        elif total is not None:
            if type(total) is not int or total < 1:
                raise ServiceError('Tổng số câu đề cương phải là số nguyên dương.')
            whole = sum(need.values())
            raw = {k: Decimal(total) * need[k] / whole for k in keys}
            want = {k: int(raw[k]) for k in keys}
            for k in sorted(keys, key=lambda k: raw[k] - want[k], reverse=True)[:total - sum(want.values())]:
                want[k] += 1
        else:
            want = {k: math.ceil(Decimal(need[k]) * Decimal('1.5')) for k in keys}
        plan = []
        for k in keys:
            pool = list(candidates[k]); rng.shuffle(pool)
            by_outcome = {}
            for q in pool:
                by_outcome.setdefault(q.get('learning_outcome'), []).append(q)
            picked, groups = [], list(by_outcome.values())
            while len(picked) < min(want[k], len(pool)):
                for g in groups:
                    if g and len(picked) < want[k]:
                        picked.append(g.pop(0))
            plan.append(dict(key=self._cell_key(k), lesson_code=k[0], type=k[1], level=k[2],
                             outcomes=list(k[3]) if len(k) > 3 else [], need=need[k], points=cells[k]['points'], available=len(pool),
                             requested=want[k], revision_count=len(picked), question_ids=[q['id'] for q in picked]))
        return plan

    def _cells_with_candidates(self, payload, grade, exam_type):
        rows, template, cells, profile, kinds = self._matrix_cells(payload, grade, exam_type)
        bank = self._load_bank()['questions']
        subj = normalize_subject_name(payload.get('subject_name') or payload.get('subject') or (payload.get('_matrix') or {}).get('subject_name') or self.context.get('subject_name') or 'Tin học')
        candidates = {k: self._cell_candidates(bank, grade, exam_type, template, k, subject_name=subj)[0] for k in cells}
        return rows, template, cells, candidates

    def propose_revision(self, payload):
        """Đề xuất đề cương theo ma trận (không ghi): số câu từng ô chỉnh được; giáo viên xem, sửa rồi mới lưu."""
        with self.lock:
            grade = self._grade(payload.get('grade'))
            exam_type = payload.get('exam_type')
            if exam_type not in ('TX', 'GK1', 'CK1', 'GK2', 'CK2'):
                raise ServiceError('Loại kiểm tra không hợp lệ.')
            rows, _t, cells, candidates = self._cells_with_candidates(payload, grade, exam_type)
            plan = self._revision_plan(cells, candidates, payload.get('counts'), payload.get('total'),
                                       random.Random(str(payload.get('seed', ''))),
                                       lesson_counts=payload.get('lesson_counts'))
            ids = [i for c in plan for i in c['question_ids']]
            short = [c for c in plan if c['revision_count'] < c['requested']]
            return dict(cells=plan, question_ids=ids, total=len(ids), exam_question_count=sum(c['count'] for c in cells.values()),
                        warnings=[f"Ô {c['lesson_code']} · {c['type']} · {c['level']}: ngân hàng chỉ có {c['available']} câu đã duyệt "
                                  f"(muốn {c['requested']})." for c in short])

    def generate_exam_set(self, payload):
        """Bộ đề: Ma trận → Đề cương → các đề (quyết định của giáo viên 29–30/10/2026).

        Đề cương: dùng bản đã lưu (`revision_id`) hoặc tự lập theo ma trận (`revision_counts` / `revision_total`).
        Mỗi đề lấy ceil(ngưỡng × N) câu trong đề cương và để ngoài phần còn lại, ưu tiên Vận dụng cao → Vận dụng → Hiểu → Biết,
        câu không tự luận trước; câu ngoài phải cùng YCCĐ với ít nhất một câu của đề cương (độ phủ 100%, B6).
        Câu được dùng ít nhất được chọn trước, nên đề cương đủ lớn thì các đề khác câu nhau; nhỏ hơn thì báo số câu dùng chung.
        Kiểm tra đủ câu cho mọi đề trước khi ghi; ghi lỗi giữa chừng thì khôi phục đề cương và đề như cũ.
        """
        with self.lock:
            grade = self._grade(payload.get('grade'))
            exam_type = payload.get('exam_type')
            if exam_type not in ('TX', 'GK1', 'CK1', 'GK2', 'CK2'):
                raise ServiceError('Loại kiểm tra không hợp lệ.')
            title = self._text(payload.get('title'), 'Tên bộ đề')
            count = payload.get('exam_count', 2)
            if type(count) is not int or not 1 <= count <= 6:
                raise ServiceError('Số đề trong bộ phải là số nguyên từ 1 đến 6.')
            sim_pct = Decimal(str(resolve_similarity(payload.get('similarity_percent', 90))))
            rows, template, cells, candidates = self._cells_with_candidates(payload, grade, exam_type)
            rng = random.Random(str(payload.get('seed', '')))
            missing = [dict(lesson_code=k[0], type=k[1], level=k[2], outcomes=list(k[3]) if len(k) > 3 else [],
                            requested=c['count'], available=len(candidates[k]), missing=c['count'] - len(candidates[k]),
                            reason='Không đủ câu đã duyệt trong đúng ô.')
                       for k, c in cells.items() if len(candidates[k]) < c['count']]
            if missing:
                raise ServiceError('Ngân hàng chưa đủ câu đã duyệt theo ma trận.', {'shortages': missing})
            existing = None
            if payload.get('revision_id'):
                existing = self.get_record('revisions', payload['revision_id'])
                if existing['grade'] != grade:
                    raise ServiceError('Đề cương phải cùng khối với bộ đề.')
                hashes = {content_hash(q) for q in existing['questions']}
                rev_ids = {q['id'] for k in cells for q in candidates[k] if content_hash(q) in hashes}
            else:
                plan = self._revision_plan(cells, candidates, payload.get('revision_counts'), payload.get('revision_total'), rng)
                rev_ids = {i for c in plan for i in c['question_ids']}
            pool = [q for k in cells for q in candidates[k]]
            rev_outcomes = {(q['lesson_code'], q.get('learning_outcome')) for q in pool if q['id'] in rev_ids}
            per_exam = sum(c['count'] for c in cells.values())
            out_quota = per_exam - math.ceil(sim_pct / 100 * per_exam)
            order = {'Vận dụng cao': -1, 'Vận dụng': 0, 'Hiểu': 1, 'Biết': 2}
            ranked_cells = sorted(cells, key=lambda k: (order[k[2]], k[1] == 'ES'))
            usage, exams, warnings = {}, [], []
            for i in range(count):
                inside = {k: [q for q in candidates[k] if q['id'] in rev_ids] for k in cells}
                outside = {k: [q for q in candidates[k] if q['id'] not in rev_ids and
                               (q['lesson_code'], q.get('learning_outcome')) in rev_outcomes] for k in cells}
                out_n = {k: max(0, cells[k]['count'] - len(inside[k])) for k in cells}
                lacking = [k for k in cells if out_n[k] > len(outside[k])]
                if lacking or sum(out_n.values()) > out_quota:
                    raise ServiceError('Đề cương chưa đủ câu ở một số ô để mỗi đề có ít nhất '
                                       f'{math.ceil(sim_pct / 100 * per_exam)}/{per_exam} câu trong đề cương.',
                                       {'cells': [dict(lesson_code=k[0], type=k[1], level=k[2], need=cells[k]['count'],
                                                       in_revision=len(inside[k])) for k in cells if out_n[k]]})
                extra = out_quota - sum(out_n.values())
                for k in ranked_cells:
                    take = min(extra, cells[k]['count'] - out_n[k], len(outside[k]) - out_n[k])
                    if take > 0:
                        out_n[k] += take; extra -= take
                if extra:
                    warnings.append(f'Đề {i + 1}: chỉ để được {out_quota - extra}/{out_quota} câu ngoài đề cương mà vẫn phủ đủ YCCĐ.')
                chosen = []
                used_in_exam = set()
                for k in cells:
                    least = lambda qs: sorted([q for q in qs if q['id'] not in used_in_exam], key=lambda q: (usage.get(q['id'], 0), rng.random()))
                    picked_out = least(outside[k])[:out_n[k]]
                    used_in_exam.update(q['id'] for q in picked_out)
                    picked_in = least(inside[k])[:cells[k]['count'] - len(picked_out)]
                    used_in_exam.update(q['id'] for q in picked_in)
                    chosen += picked_out + picked_in
                for q in chosen:
                    usage[q['id']] = usage.get(q['id'], 0) + 1
                exams.append(chosen)
            shared = sum(1 for n in usage.values() if n > 1)
            if shared:
                warnings.append(f'Các đề dùng chung {shared} câu vì đề cương nhỏ hơn mức cần để các đề khác câu hoàn toàn. '
                                'Tăng số câu đề cương nếu muốn các đề không trùng câu.')
            set_id = f'SET-{uuid.uuid4().hex[:12]}'
            backup = {name: copy.deepcopy(self._records(name)) for name in ('revisions', 'exams')}
            try:
                if existing:
                    revision = existing
                else:
                    ordered = list(dict.fromkeys(q['id'] for k in cells for q in candidates[k] if q['id'] in rev_ids))
                    revision = self.save_revision(dict(title=self._text(payload.get('revision_title') or f'Đề cương {title}', 'Tên đề cương'),
                                                       grade=grade, question_ids=ordered))
                made = []
                for i, questions in enumerate(exams):
                    req = {k: payload[k] for k in ('template_id', 'blueprint', '_matrix', 'profile', 'allowed_kinds',
                                                   'scoring_policy', 'duration') if k in payload}
                    req.update(grade=grade, exam_type=exam_type, title=f'{title} - Đề {i + 1}' if count > 1 else title,
                               revision_id=revision['id'], similarity_percent=payload.get('similarity_percent', 90),
                               similarity_mode='exact', seed=f"{payload.get('seed', '')}-{i + 1}",
                               question_ids=[q['id'] for q in questions])
                    made.append(self.generate_exam(req))
                members = [e['id'] for e in made]
                info = dict(id=set_id, title=title, revision_id=revision['id'], exam_ids=members, created_at=now())
                records = self._records('exams')
                for e in records:
                    if e.get('id') in members:
                        e['exam_set'] = dict(info, index=members.index(e['id']) + 1)
                self._atomic_save(self.data_dir/'exams.json', records)
                if not existing:
                    revs = self._records('revisions')
                    for r in revs:
                        if r.get('id') == revision['id']:
                            r['exam_set'] = info
                    self._atomic_save(self.data_dir/'revisions.json', revs)
            except Exception:
                self._atomic_save(self.data_dir/'revisions.json', backup['revisions'])
                self._atomic_save(self.data_dir/'exams.json', backup['exams'])
                raise
            return dict(exam_set=info, revision=self.get_record('revisions', revision['id']),
                        exams=[e for e in self._records('exams') if e.get('id') in members],
                        outside_per_exam=out_quota, revision_size=len(rev_ids), shared_questions=shared, warnings=warnings)

    def update_exam(self, payload):
        with self.lock:
            ident = self._text(payload.get('id'), 'Mã đề kiểm tra')
            records = self._records('exams')
            idx = next((i for i, x in enumerate(records) if x.get('id') == ident), None)
            if idx is None:
                raise ServiceError('Không tìm thấy đề kiểm tra để cập nhật.', {'id': ident}, 404)
            old = records[idx]
            self._assert_exam_editable(old)
            if exam_status(old) == 'pending_approval':
                old['status'] = 'drafting'  # sửa đề đang chờ duyệt thì phải gửi duyệt lại
                old.setdefault('lifecycle', []).append(dict(action='edit_while_pending', at=now(),
                                                            by=getattr(self, 'actor', 'local')))
            if 'title' in payload:
                old['title'] = self._text(payload.get('title'), 'Tên đề kiểm tra')
            if 'duration' in payload and payload.get('duration') is not None:
                dur = payload.get('duration')
                if type(dur) is not int or not 1 <= dur <= 300:
                    raise ServiceError('Thời lượng phải từ 1 đến 300 phút.')
                old['duration'] = dur
            if 'campus' in payload:
                old['campus'] = str(payload.get('campus') or '').strip()
            if 'revision_policy' in payload:  # B6: tổ chọn "trùng + bám sát đã duyệt" hoặc "chỉ tính câu trùng"
                if payload['revision_policy'] not in REVISION_MODES:
                    raise ServiceError('Cách tính tiêu chí đề cương không hợp lệ.', {'revision_policy': payload['revision_policy']})
                old['revision_policy'] = payload['revision_policy']
                self._refresh_revision_check(old)
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
            for x in records:
                if x.get('id') == ident:
                    self._assert_exam_editable(x, 'Đề đã duyệt hoặc đã phát hành không được xóa.')
            before = len(records)
            records = [x for x in records if x.get('id') != ident]
            if len(records) == before:
                raise ServiceError('Không tìm thấy đề kiểm tra để xóa.', {'id': ident}, 404)
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(records)

    def _revision_for(self, exam):
        if not exam.get('revision_id'):
            return None
        return next((r for r in self._records('revisions') if r.get('id') == exam['revision_id']), None)

    def revision_criterion(self, ident):
        """B6: báo cáo tiêu chí đề cương của một đề (T, nhóm trùng/bám sát, độ bao phủ YCCĐ)."""
        exam = self.get_record('exams', ident)
        revision = self._revision_for(exam)
        if revision is None:
            raise ServiceError('Đề chưa gắn phiên bản đề cương còn tồn tại để đối chiếu.', {'id': ident})
        return revision_report(exam, revision)

    def _refresh_revision_check(self, exam):
        revision = self._revision_for(exam)
        if revision is not None:
            exam['revision_check'] = revision_report(exam, revision)
        else:
            exam.pop('revision_check', None)

    def _close_match_target(self, ident, question_id):
        records = self._records('exams')
        exam = next((x for x in records if x.get('id') == ident), None)
        if exam is None:
            raise ServiceError('Không tìm thấy đề kiểm tra.', {'id': ident}, 404)
        self._assert_exam_editable(exam, 'Đề đã duyệt & khóa hoặc đã phát hành; không đổi được câu bám sát.')
        if not any(q.get('id') == question_id for q in exam.get('questions', [])):
            raise ServiceError('Câu không có trong đề.', {'question_id': question_id})
        return records, exam

    def mark_close_match(self, ident, question_id, revision_question_id, reason, actor='local'):
        """Đánh dấu câu trong đề "bám sát" một câu của đề cương; chỉ được tính sau khi được duyệt (B6)."""
        with self.lock:
            records, exam = self._close_match_target(ident, question_id)
            reason = str(reason or '').strip()
            if not reason:
                raise ServiceError('Cần ghi lý do câu bám sát đề cương (ví dụ: cùng YCCĐ, đổi số liệu).')
            revision = self._revision_for(exam)
            if revision is None or not any(r.get('id') == revision_question_id for r in revision.get('questions', [])):
                raise ServiceError('Câu gốc phải thuộc phiên bản đề cương của đề.', {'revision_question_id': revision_question_id})
            mark = dict(revision_question_id=revision_question_id, reason=reason[:1000], status='pending',
                        marked_by=str(actor or 'local'), marked_at=now())
            exam.setdefault('close_matches', {})[question_id] = mark
            self._refresh_revision_check(exam)
            exam['updated_at'] = now()
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(mark)

    def review_close_match(self, ident, question_id, action, actor='local', reason=''):
        with self.lock:
            records, exam = self._close_match_target(ident, question_id)
            mark = (exam.get('close_matches') or {}).get(question_id)
            if not mark:
                raise ServiceError('Câu này chưa được đánh dấu bám sát.', {'question_id': question_id}, 404)
            reason = str(reason or '').strip()
            if action == 'approve':
                mark.update(status='approved', approved_by=str(actor or 'local'), approved_at=now())
                if reason:
                    mark['review_reason'] = reason[:1000]
            elif action == 'reject':
                if not reason:
                    raise ServiceError('Khi không công nhận bám sát phải ghi lý do.')
                mark.update(status='rejected', rejected_by=str(actor or 'local'), rejected_at=now(), review_reason=reason[:1000])
                mark.pop('approved_by', None); mark.pop('approved_at', None)
            else:
                raise ServiceError('Thao tác không hợp lệ.', {'action': action})
            self._refresh_revision_check(exam)
            exam['updated_at'] = now()
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(mark)

    def reuse_check(self, exam, records=None, days=DEFAULT_RECENT_DAYS):
        """B5: câu đã có trong đề phát hành gần đây (chỉ cảnh báo). Lưu ở trường quản trị, không vào hash đề."""
        records = self._records('exams') if records is None else records
        return dict(checked_at=now(), days=days, warnings=recent_uses(exam, records, days=days))

    def _attach_cell_report(self, report, exam, matrix):
        if matrix.get('slots'):
            report['cells'] = cell_check(exam, matrix, self.catalog)
            if not report['cells']['ok']:
                report['passed'] = False
                report['status'] = 'failed'
        report['ratio_warnings'] = ratio_warnings(matrix)
        report['reuse_warnings'] = recent_uses(exam, self._records('exams'))
        self._refresh_revision_check(exam)
        if exam.get('revision_check'):
            report['revision_criterion'] = exam['revision_check']

    @staticmethod
    def _assert_exam_editable(exam, message='Đề đã duyệt & khóa hoặc đã phát hành; hãy tạo bản chỉnh sửa mới để sửa.'):
        if exam_status(exam) in FROZEN:
            raise ServiceError(message, {'id': exam.get('id'), 'status': exam_status(exam)}, 409)

    def _exam_question_problems(self, exam):
        """Mọi câu trong đề phải đang approved và trùng đúng phiên bản đã duyệt (cho phép đổi thứ tự phương án)."""
        bank = {q.get('id'): q for q in self._load_bank()['questions']}
        problems = []
        for eq in exam.get('questions', []):
            label = f"Câu {eq.get('slot_number', '?')} ({eq.get('id')})"
            bq = bank.get(eq.get('id'))
            if bq is None:
                problems.append(f'{label}: không còn trong ngân hàng.')
            elif bq.get('review_status') != 'approved':
                problems.append(f'{label}: câu trong ngân hàng chưa ở trạng thái đã duyệt.')
            elif version_hash(eq) != version_hash(bq):
                problems.append(f'{label}: nội dung trong đề khác phiên bản đã duyệt.')
        return problems

    def _apply_exam_transition(self, exam, records, action, actor='local', reason='', matrix_service=None):
        status = exam_status(exam)
        reason = str(reason or '').strip()
        entry = dict(action=action, at=now(), by=str(actor or 'local'), from_status=status)
        if reason:
            entry['reason'] = reason[:1000]
        if action == 'new_revision':
            if status not in FROZEN:
                raise ServiceError('Chỉ tạo bản chỉnh sửa mới từ đề đã duyệt hoặc đã phát hành.', status=409)
            rev = {k: copy.deepcopy(v) for k, v in exam.items()
                   if k not in ('status', 'lifecycle', 'approved_hash', 'approved_by', 'approved_at', 'locked_at',
                                'published_at', 'usage', 'reuse_check', 'revision_check')}
            rev.update(id=f'EXAM-{uuid.uuid4().hex[:12]}', status='drafting', previous_exam_id=exam['id'],
                       created_at=now(), lifecycle=[dict(entry, action='new_revision_from', source=exam['id'])])
            records.append(rev)
            exam.setdefault('lifecycle', []).append(dict(entry, new_exam_id=rev['id']))
            return rev
        if action == 'submit':
            if status != 'drafting':
                raise ServiceError(f"Chỉ gửi duyệt được đề đang soạn ({exam.get('title', exam.get('id'))}).",
                                   {'status': status, 'id': exam.get('id')}, 409)
            new_status = 'pending_approval'
        elif action == 'return':
            if status != 'pending_approval':
                raise ServiceError(f"Chỉ trả lại được đề đang chờ duyệt ({exam.get('title', exam.get('id'))}).",
                                   {'status': status, 'id': exam.get('id')}, 409)
            if not reason:
                raise ServiceError('Khi trả lại đề phải ghi lý do.')
            new_status = 'drafting'
        elif action == 'approve':
            if status != 'pending_approval':
                raise ServiceError(f"Chỉ duyệt được đề đang chờ duyệt ({exam.get('title', exam.get('id'))}).",
                                   {'status': status, 'id': exam.get('id')}, 409)
            problems = self._exam_question_problems(exam)
            snapshot = exam.get('matrix_snapshot') or {}
            if snapshot.get('slots'):
                cells = cell_check(exam, snapshot, self.catalog)
                problems += [f"Ô ma trận {c['lesson_code']} · {c['kind']} · {c['level']}: cần {c['expected_questions']} câu/"
                             f"{c['expected_points']} điểm, đề có {c['actual_questions']} câu/{c['actual_points']} điểm."
                             for c in cells['cells'] if not c['ok']]
            revision = self._revision_for(exam)
            if revision is None:
                problems.append('Đề chưa gắn phiên bản đề cương còn tồn tại để đối chiếu.')
            else:
                crit = revision_report(exam, revision)
                entry['revision_criterion'] = {k: crit[k] for k in ('mode', 't_percent', 'exact_count', 'close_count',
                                                                    'total', 'required', 'points_percent')}
                if not crit['coverage']['ok']:
                    problems.append(f"Độ bao phủ YCCĐ của đề cương mới {crit['coverage']['percent']}% điểm (cần 100%): "
                                    + ', '.join(f"câu {m['slot_number']}" for m in crit['coverage']['missing']) + '.')
                if crit['exact_count'] + crit['close_count'] < crit['required']:
                    problems.append(f"Tiêu chí đề cương T = {crit['t_percent']}% ({crit['exact_count']} câu trùng + "
                                    f"{crit['close_count']} câu bám sát đã duyệt / {crit['total']} câu), cần ≥ 90%.")
            if problems:
                label = exam.get('title') or exam.get('id')
                raise ServiceError(f"Đề '{label}' có câu chưa duyệt, khác phiên bản đã duyệt, lệch ma trận hoặc chưa đạt tiêu chí đề cương.",
                                   {'problems': problems, 'id': exam.get('id')})
            if matrix_service is not None and not exam.get('matrix_snapshot'):
                matrix = self._exam_matrix(exam, matrix_service)
                if matrix:
                    exam['matrix_snapshot'] = copy.deepcopy(matrix)  # chụp ma trận cùng đề, không tham chiếu
            exam['reuse_check'] = self.reuse_check(exam, records)
            exam['approved_hash'] = exam_hash(exam)
            exam['approved_by'], exam['approved_at'] = entry['by'], entry['at']
            entry['content_hash'] = exam['approved_hash']
            new_status = 'locked'
        elif action == 'publish':
            if status != 'locked':
                raise ServiceError(f"Chỉ phát hành được đề đã duyệt & khóa ({exam.get('title', exam.get('id'))}).",
                                   {'status': status, 'id': exam.get('id')}, 409)
            current = exam_hash(exam)
            if current != exam.get('approved_hash'):
                exam.setdefault('lifecycle', []).append(dict(entry, action='publish_blocked', content_hash=current))
                raise ServiceError(f"Nội dung đề '{exam.get('title')}' đã thay đổi sau khi duyệt; không được phát hành. "
                                   'Hãy tạo bản chỉnh sửa mới và duyệt lại.', {'id': exam.get('id')}, 409)
            exam['published_at'] = entry['at']
            exam['usage'] = dict(published_at=entry['at'], by=entry['by'], exam_type=exam.get('exam_type'),
                                 grade=exam.get('grade'), exam_code=exam.get('exam_code'),
                                 questions=[dict(id=q.get('id'), version=version_hash(q)) for q in exam.get('questions', [])])
            entry['content_hash'] = current
            new_status = 'published'
        else:
            raise ServiceError('Thao tác với đề không hợp lệ.', {'action': action})
        exam['status'] = new_status
        exam.setdefault('lifecycle', []).append(entry)
        return exam

    def exam_transition(self, ident, action, actor='local', reason='', matrix_service=None):
        """submit | approve | return | publish | new_revision. Ghi người thực hiện cho mọi lần chuyển (B2)."""
        with self.lock:
            records = self._records('exams')
            idx = next((i for i, x in enumerate(records) if x.get('id') == ident), None)
            if idx is None:
                raise ServiceError('Không tìm thấy đề kiểm tra.', {'id': ident}, 404)
            exam = records[idx]
            history_size = len(exam.get('lifecycle', []))
            try:
                result = self._apply_exam_transition(exam, records, action, actor=actor, reason=reason, matrix_service=matrix_service)
            except ServiceError:
                added = exam.get('lifecycle', [])[history_size:]
                if action == 'publish' and added and all(e.get('action') == 'publish_blocked' for e in added):
                    self._atomic_save(self.data_dir/'exams.json', records)
                raise
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(result)

    def exam_set_transition(self, set_id, action, actor='local', reason='', matrix_service=None):
        """submit | return | approve | publish cho toàn bộ các đề trong một bộ đề (Mốc C1).

        Giao dịch nguyên tử: nếu một đề bị lỗi thì khôi phục toàn bộ trạng thái ban đầu và báo lỗi.
        """
        with self.lock:
            records = self._records('exams')
            members = [e for e in records if (e.get('exam_set') or {}).get('id') == set_id]
            if not members:
                raise ServiceError('Không tìm thấy bộ đề kiểm tra.', {'set_id': set_id}, 404)
            backup = copy.deepcopy(records)
            try:
                updated = []
                for exam in members:
                    res = self._apply_exam_transition(exam, records, action, actor=actor, reason=reason, matrix_service=matrix_service)
                    updated.append(copy.deepcopy(res))
                self._atomic_save(self.data_dir/'exams.json', records)
                return {'set_id': set_id, 'action': action, 'exams': updated}
            except Exception as exc:
                # Hoàn tác cả bộ, chỉ giữ nhật ký từ chối; không giữ publish/usage dở dang.
                if action == 'publish' and isinstance(exc, ServiceError):
                    for original, changed in zip(backup, records):
                        added = changed.get('lifecycle', [])[len(original.get('lifecycle', [])):]
                        blocked = [e for e in added if e.get('action') == 'publish_blocked']
                        if blocked:
                            original.setdefault('lifecycle', []).extend(copy.deepcopy(blocked))
                self._atomic_save(self.data_dir/'exams.json', backup)
                raise

    def revision_transition(self, ident, action, actor='local', reason=''):
        """publish | lock | unlock | drafting cho đề cương (Mốc C1).

        Quy tắc bất biến: CHẶN phát hành đề cương nếu bộ đề (hoặc đề) căn cứ chưa được khóa.
        """
        with self.lock:
            records = self._records('revisions')
            idx = next((i for i, x in enumerate(records) if x.get('id') == ident), None)
            if idx is None:
                raise ServiceError('Không tìm thấy đề cương ôn tập.', {'id': ident}, 404)
            rev = records[idx]
            status = rev.get('status', 'drafting')
            entry = dict(action=action, at=now(), by=str(actor or 'local'), from_status=status)
            if reason:
                entry['reason'] = str(reason).strip()[:1000]

            if action == 'publish':
                exams = self._records('exams')
                unlocked_exams = [e for e in exams if e.get('revision_id') == ident and exam_status(e) in ('drafting', 'pending_approval')]
                if unlocked_exams:
                    titles = ', '.join(f"'{e.get('title') or e.get('id')}'" for e in unlocked_exams[:3])
                    raise ServiceError('Chưa thể phát hành đề cương vì bộ đề căn cứ (hoặc đề thi) chưa được khóa. '
                                       f'Các đề chưa khóa: {titles}. Hãy thẩm định và khóa bộ đề trước khi phát hành đề cương cho học sinh.',
                                       {'unlocked_exams': [e.get('id') for e in unlocked_exams]}, 409)
                rev['status'] = 'published'
                rev['published_at'] = entry['at']
                rev['published_by'] = entry['by']
            elif action == 'lock':
                rev['status'] = 'locked'
                rev['locked_at'] = entry['at']
                rev['locked_by'] = entry['by']
            elif action == 'unlock':
                exams = self._records('exams')
                frozen_exams = [e for e in exams if e.get('revision_id') == ident and exam_status(e) in FROZEN]
                if frozen_exams:
                    raise ServiceError('Không thể mở khóa đề cương vì đã có đề thi được khóa hoặc phát hành căn cứ vào đề cương này.',
                                       {'frozen_exams': [e.get('id') for e in frozen_exams]}, 409)
                rev['status'] = 'drafting'
            else:
                raise ServiceError('Thao tác với đề cương không hợp lệ.', {'action': action})

            rev.setdefault('lifecycle', []).append(entry)
            self._atomic_save(self.data_dir/'revisions.json', records)
            return copy.deepcopy(rev)

    def duplicate_exam(self, ident):
        with self.lock:
            old = self.get_record('exams', ident)
            copy_ex = _without_approval(old)
            copy_ex['id'] = f'EXAM-{uuid.uuid4().hex[:12]}'
            copy_ex['title'] = f'{old.get("title", "Đề kiểm tra")} (Bản sao)'
            copy_ex['created_at'] = now()
            records = self._records('exams'); records.append(copy_ex)
            self._atomic_save(self.data_dir/'exams.json', records)
            return copy.deepcopy(copy_ex)

    def create_permuted_exams(self, ident, codes=None, num_variants=4, shuffle_questions=True,
                              shuffle_options=True, shuffle_statements=False, seed=None, replace_existing=True):
        with self.lock:
            old = self.get_record('exams', ident)
            if not old.get('questions'):
                raise ServiceError('Đề kiểm tra không có câu hỏi để xáo trộn.')

            if codes and isinstance(codes, (list, tuple)):
                clean_codes = [str(c).strip() for c in codes if str(c).strip()]
            else:
                n = max(2, min(int(num_variants or 4), 10))
                clean_codes = [f"10{i+1}" for i in range(n)]

            if not clean_codes:
                clean_codes = ['101', '102', '103', '104']

            def _can_shuffle_mc_options(q):
                if q.get('shuffle_options') is False or q.get('keep_order') is True:
                    return False
                options = q.get('options', [])
                fixed_patterns = [
                    'tất cả', 'cả a và b', 'cả a, b', 'cả b và c', 'cả a và c', 'cả a, b, c',
                    'cả 3', 'cả ba', 'cả hai', 'cả 4', 'cả bốn',
                    'không có đáp án nào', 'không có câu nào', 'không có phương án nào',
                    'không phương án nào đúng', 'không đáp án nào đúng',
                    'các phương án trên', 'các đáp án trên', 'các câu trên',
                    'đáp án a và b', 'phương án a và b'
                ]
                pos_regex = re.compile(r'\b(cả\s+[a-d]|chỉ\s+[a-d]|đáp án\s+[a-d]|phương án\s+[a-d])\b', re.IGNORECASE)
                for opt in options:
                    opt_lower = str(opt).lower().strip()
                    if any(pat in opt_lower for pat in fixed_patterns) or pos_regex.search(opt_lower):
                        return False
                return True

            def _group_and_shuffle(qs_list, rng):
                if not qs_list:
                    return []
                clusters = []
                group_map = {}
                for q in qs_list:
                    gid = q.get('stimulus_id') or q.get('group_id') or q.get('passage_id') or q.get('context_id')
                    if gid:
                        if gid in group_map:
                            group_map[gid].append(q)
                        else:
                            cl = [q]
                            group_map[gid] = cl
                            clusters.append(cl)
                    else:
                        clusters.append([q])
                rng.shuffle(clusters)
                return [q for cl in clusters for q in cl]

            generated_exams = []
            answer_grid = {'codes': clean_codes, 'mc': {}, 'yn': {}, 'short': {}, 'es': {}}

            for idx, code in enumerate(clean_codes):
                sub_seed = f"{seed or old['id']}_{code}_{idx}"
                rng = random.Random(sub_seed)

                new_ex = _without_approval(old)  # mã đề mới phải được duyệt riêng
                new_ex['id'] = f'EXAM-{uuid.uuid4().hex[:12]}'
                new_ex['exam_code'] = code
                new_ex['parent_exam_id'] = ident
                base_title = re.sub(r'\s*-\s*Mã đề\s+.*$', '', old.get('title', 'Đề kiểm tra')).strip()
                new_ex['title'] = f"{base_title} - Mã đề {code}"
                new_ex['created_at'] = now()
                source_slots = {(s['kind'], s['number']): s for s in (new_ex.get('matrix_snapshot') or {}).get('slots', [])}
                for q in new_ex['questions']:
                    if not q.get('slot_id') and source_slots:
                        source_slot = source_slots.get((q['type'], q.get('slot_number')))
                        if source_slot:
                            q['slot_id'] = source_slot['id']

                # Separate questions by type
                mc_qs = [q for q in new_ex['questions'] if q.get('type') == 'MC']
                yn_qs = [q for q in new_ex['questions'] if q.get('type') == 'YN']
                short_qs = [q for q in new_ex['questions'] if q.get('type') == 'SHORT']
                es_qs = [q for q in new_ex['questions'] if q.get('type') == 'ES']

                if shuffle_questions:
                    mc_qs = _group_and_shuffle(mc_qs, rng)
                    yn_qs = _group_and_shuffle(yn_qs, rng)
                    short_qs = _group_and_shuffle(short_qs, rng)

                # Process MC questions (shuffle options & reassign slots)
                for slot, q in enumerate(mc_qs, 1):
                    q['slot_number'] = slot
                    opts = q.get('options', [])
                    if shuffle_options and len(opts) >= 2 and _can_shuffle_mc_options(q):
                        orig_correct = q.get('correct', 0)
                        orig_opts = list(opts)
                        orig_exps = q.get('option_explanations', [])

                        perm = list(range(len(orig_opts)))
                        rng.shuffle(perm)

                        q['options'] = [orig_opts[i] for i in perm]
                        if orig_correct in perm:
                            q['correct'] = perm.index(orig_correct)
                        if orig_exps and len(orig_exps) == len(orig_opts):
                            q['option_explanations'] = [orig_exps[i] for i in perm]

                    ans_letter = mc_answer_letter(q)
                    answer_grid['mc'].setdefault(slot, {})[code] = ans_letter

                # Process YN questions
                for slot, q in enumerate(yn_qs, 1):
                    q['slot_number'] = slot
                    stmts = q.get('statements', [])
                    if shuffle_statements and len(stmts) >= 2:
                        perm = list(range(len(stmts)))
                        rng.shuffle(perm)
                        shuffled_stmts = [copy.deepcopy(stmts[i]) for i in perm]
                        source_slot = source_slots.get(('YN', q.get('slot_number')))
                        # Prefer stable slot identity if the question number has changed.
                        source_slot = next((s for s in source_slots.values() if s['id'] == q.get('slot_id')), source_slot)
                        if source_slot:
                            parts_by_id = {p['id']: p for p in source_slot['parts']}
                            part_ids = q.get('statement_part_ids') or [p['id'] for p in source_slot['parts']]
                            if len(part_ids) != len(stmts) or set(part_ids) != set(parts_by_id):
                                raise ServiceError('Không khớp các ý Đúng/Sai với bảng đặc tả nguồn.')
                            q['statement_part_ids'] = [part_ids[i] for i in perm]
                        for si, st in enumerate(shuffled_stmts):
                            st['label'] = chr(97 + si)
                        q['statements'] = shuffled_stmts

                    yn_ans = ", ".join(f"{st.get('label', chr(97+si))}: {'Đ' if st.get('correct') else 'S'}" for si, st in enumerate(q.get('statements', [])))
                    answer_grid['yn'].setdefault(slot, {})[code] = yn_ans

                # Process Short answer questions
                for slot, q in enumerate(short_qs, 1):
                    q['slot_number'] = slot
                    answer_grid['short'].setdefault(slot, {})[code] = canonical_short_answer(q)

                # Process Essay questions
                for slot, q in enumerate(es_qs, 1):
                    q['slot_number'] = slot
                    answer_grid['es'].setdefault(slot, {})[code] = f"{q.get('points', 1.0):g} đ"

                new_ex['questions'] = mc_qs + yn_qs + short_qs + es_qs
                if new_ex.get('matrix_snapshot'):
                    new_ex['matrix_snapshot'] = self._exam_matrix(new_ex, None)
                    new_ex['matrix_digest'] = new_ex['matrix_snapshot']['content_sha256']
                generated_exams.append(new_ex)

            # B7: tự kiểm tra trước khi lưu — mọi mã đề giữ đúng bộ câu, điểm và nội dung/đáp án của đề gốc.
            problems = verify_codes(old, generated_exams)
            if problems:
                raise ServiceError('Mã đề hoán vị không khớp đề gốc; không lưu mã đề nào.', {'problems': problems}, 409)
            records = self._records('exams')
            if replace_existing:
                records = [x for x in records if x.get('parent_exam_id') != ident]
            records.extend(generated_exams)
            self._atomic_save(self.data_dir/'exams.json', records)

            return {
                'parent_exam_id': ident,
                'clean_codes': clean_codes,
                'count': len(generated_exams),
                'generated_exams': [copy.deepcopy(e) for e in generated_exams],
                'answer_grid': answer_grid,
                'mapping': mapping_rows(old, generated_exams)
            }

    # --- B8: kiểm tra thường xuyên (TT 22/2021, Điều 6) ---------------------------------------------------
    def _kttx_grades(self):
        return list(self.context.get('allowed_grades') or (8, 9, 10))

    def periods_per_year(self, grade):
        """Số tiết/năm học của môn: khai báo trong chương trình; môn Tin học mặc định theo TT 32/2018."""
        declared = (self.context.get('policy') or {}).get('periods_per_year')
        if isinstance(declared, dict):
            declared = declared.get(str(grade))
        if type(declared) is int and declared > 0:
            return declared
        if (self.context.get('subject_name') or 'Tin học') == 'Tin học':
            return TIN_HOC_PERIODS.get(grade)
        return None

    def kttx_state(self):
        activities = self._read_data(self.data_dir/'kttx.json', [])
        grades = self._kttx_grades()
        forms = [dict(f) for f in FORMS]
        if any(g >= CLUSTER_FORM['min_grade'] for g in grades):
            forms.append(dict(CLUSTER_FORM))
        return dict(activities=copy.deepcopy(activities), forms=forms,
                    overview=kttx_overview(activities, {g: self.periods_per_year(g) for g in grades}, grades))

    def save_kttx(self, payload, actor='local'):
        with self.lock:
            if not isinstance(payload, dict):
                raise ServiceError('Dữ liệu hoạt động KTTX không hợp lệ.')
            grade, semester, k = payload.get('grade'), payload.get('semester'), payload.get('k')
            if type(grade) is not int or grade not in self._kttx_grades():
                raise ServiceError('Khối không thuộc chương trình đang chọn.', {'grade': grade})
            if semester not in (1, 2):
                raise ServiceError('Học kì phải là 1 hoặc 2.')
            if type(k) is not int or not 1 <= k <= 20:
                raise ServiceError('Số thứ tự bài KTTX phải từ 1 đến 20.')
            if payload.get('form') not in FORM_KEYS:
                raise ServiceError('Hình thức phải theo TT 22/2021, Điều 6, khoản 1.', {'form': payload.get('form')})
            if payload['form'] == CLUSTER_FORM['key'] and grade < CLUSTER_FORM['min_grade']:
                raise ServiceError('Cụm chuyên đề học tập chỉ có ở cấp THPT (TT 22/2021, Điều 6, khoản 3).')
            try:
                max_score = Decimal(str(payload.get('max_score', '10')).replace(',', '.'))
            except Exception:
                raise ServiceError('Thang điểm tối đa không hợp lệ.')
            if not max_score.is_finite() or max_score <= 0 or max_score > 1000:
                raise ServiceError('Thang điểm tối đa phải lớn hơn 0 và không quá 1000.')
            class_name = str(payload.get('class_name') or '').strip()[:30]
            exam_id = payload.get('exam_id') or None
            if exam_id:
                exam = next((e for e in self._records('exams') if e.get('id') == exam_id), None)
                if exam is None or exam.get('exam_type') != 'TX' or exam.get('grade') != grade:
                    raise ServiceError('Chỉ gắn được đề kiểm tra thường xuyên (TX) cùng khối.', {'exam_id': exam_id})
            records = self._read_data(self.data_dir/'kttx.json', [])
            ident = payload.get('id')
            old = next((a for a in records if a.get('id') == ident), None) if ident else None
            if ident and old is None:
                raise ServiceError('Không tìm thấy hoạt động KTTX.', {'id': ident}, 404)
            for a in records:
                if a.get('id') != ident and (a.get('grade'), a.get('class_name') or '', a.get('semester'), a.get('k')) == (grade, class_name, semester, k):
                    raise ServiceError(f'Đã có TX{k}-HK{semester} cho khối {grade}{" lớp " + class_name if class_name else ""}.', status=409)
            activity = dict(id=ident or f'KTTX-{uuid.uuid4().hex[:12]}', code=f'TX{k}-HK{semester}', grade=grade,
                            semester=semester, k=k, class_name=class_name, form=payload['form'],
                            max_score=format(max_score.normalize(), 'f'), recorded=payload.get('recorded') is True,
                            exam_id=exam_id, note=str(payload.get('note') or '').strip()[:500],
                            title=activity_title(self.context.get('subject_name'), grade, k, semester),
                            created_at=(old or {}).get('created_at') or now(), updated_at=now(),
                            updated_by=str(actor or 'local'))
            records = [a for a in records if a.get('id') != activity['id']] + [activity]
            records.sort(key=lambda a: (a['grade'], a['class_name'], a['semester'], a['k']))
            self._atomic_save(self.data_dir/'kttx.json', records)
            return copy.deepcopy(activity)

    def delete_kttx(self, ident):
        with self.lock:
            records = self._read_data(self.data_dir/'kttx.json', [])
            remaining = [a for a in records if a.get('id') != ident]
            if len(remaining) == len(records):
                raise ServiceError('Không tìm thấy hoạt động KTTX.', {'id': ident}, 404)
            self._atomic_save(self.data_dir/'kttx.json', remaining)
            return copy.deepcopy(remaining)

    def export_permutation_mapping(self, ident):
        """B7: tệp Word bảng đối chiếu mã đề của một đề gốc (hoặc của bộ chứa mã đề đang chọn)."""
        from exports import export_mapping_docx
        exam = self.get_record('exams', ident)
        parent_id = exam.get('parent_exam_id') or ident
        records = self._records('exams')
        parent = next((x for x in records if x.get('id') == parent_id), None)
        children = [x for x in records if x.get('parent_exam_id') == parent_id]
        if parent is None or not children:
            raise ServiceError('Đề này chưa có các mã đề hoán vị để đối chiếu.', {'id': ident})
        codes = [c.get('exam_code') for c in children]
        raw = export_mapping_docx(mapping_rows(parent, children), codes, meta=parent, problems=verify_codes(parent, children))
        return raw, f'bang_doi_chieu_ma_de_{parent_id}.docx'

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

    def _exam_matrix(self, exam, matrix_service):
        snapshot = exam.get('matrix_snapshot')
        if not (snapshot and snapshot.get('slots') and snapshot.get('requirements')):
            snapshot = self._find_matrix_for_exam(exam.get('grade'), exam.get('exam_type'), matrix_service, exam.get('matrix_id'))
        if not snapshot:
            return None
        snapshot = copy.deepcopy(snapshot)
        if exam.get('parent_exam_id'):
            from matrices.model import matrix_digest
            slots_by_id = {s['id']: s for s in snapshot['slots']}
            parent = self.get_record('exams', exam['parent_exam_id'])
            parent_questions = {p['id']: p for p in parent.get('questions', [])}
            source_matrix = parent.get('matrix_snapshot') or {}
            source_slots = {s['id']: s for s in source_matrix.get('slots', [])}
            source_numbers = {(s['kind'], s['number']): s for s in source_matrix.get('slots', [])}
            source_requirements = {r['id']: r for r in source_matrix.get('requirements', [])}
            source_outcomes = parent.get('matrix_requirement_outcomes')
            used_slots = set()
            requirements = {r['id']: r for r in snapshot['requirements']}
            for q in exam.get('questions', []):
                parent_q = parent_questions.get(q.get('id'), {})
                # Resolve old missing IDs only from the frozen parent number, never child position.
                source_slot = (source_slots.get(parent_q.get('slot_id')) if parent_q.get('slot_id')
                               else source_numbers.get((parent_q.get('type'), parent_q.get('slot_number'))))
                slot = slots_by_id.get(q.get('slot_id'))
                if slot is None and not q.get('slot_id'):
                    slot = slots_by_id.get(source_slot['id']) if source_slot else None
                if (slot is None or source_slot is None or slot.get('kind') != q.get('type')
                        or source_slot.get('kind') != parent_q.get('type') or slot['id'] != source_slot['id']
                        or source_slot.get('number') != parent_q.get('slot_number')):
                    raise ServiceError('Thiếu ánh xạ vị trí nguồn để xuất bảng đặc tả của mã đề này.')
                reqs = [requirements[p['requirement_id']] for p in slot['parts']]
                source_parts = {p['id']: (p['requirement_id'], number(p['points'], 'Điểm ý')) for p in source_slot['parts']}
                parts = {p['id']: (p['requirement_id'], number(p['points'], 'Điểm ý')) for p in slot['parts']}
                # Missing historical classification stays missing; present fields must agree with both
                # parent and frozen matrix. The live PPCT is not evidence for a persisted variant.
                if (slot['id'] in used_slots
                        or parts != source_parts or len(parts) != len(slot['parts'])
                        or any(r != source_requirements.get(r['id']) for r in reqs)
                        or number(q.get('points'), 'Điểm câu') != sum((number(p['points'], 'Điểm ý') for p in slot['parts']), Decimal(0))
                        or number(q.get('points'), 'Điểm câu') != number(parent_q.get('points'), 'Điểm câu nguồn')
                        or any((field in q) != (field in parent_q) or q.get(field) != parent_q.get(field)
                               for field in ('lesson_code', 'level', 'learning_outcome'))
                        or ('lesson_code' in q and q['lesson_code'] not in {r['lesson_code'] for r in reqs})
                        or ('level' in q and q['level'] not in {r['level'] for r in reqs})
                        or (isinstance(source_outcomes, dict)
                            and q.get('learning_outcome') not in {source_outcomes.get(r['id']) for r in reqs})
                        or exam.get('matrix_requirement_outcomes') != parent.get('matrix_requirement_outcomes')):
                    raise ServiceError('Câu hỏi không khớp điểm hoặc ô của vị trí ma trận nguồn.')
                used_slots.add(slot['id'])
                slot['number'] = q['slot_number']
                if q['type'] == 'YN' and q.get('statement_part_ids'):
                    parts = {p['id']: p for p in slot['parts']}
                    slot['parts'] = [parts[pid] for pid in q['statement_part_ids']]
                    for i, part in enumerate(slot['parts']):
                        part['label'] = chr(97+i)
            snapshot.setdefault('source_matrix_digest', exam.get('matrix_digest') or snapshot.get('content_sha256'))
            snapshot['exam_code'] = exam.get('exam_code', '')
            title = re.sub(r'\s*-\s*Mã đề\s+.*$', '', snapshot.get('title', 'Ma trận')).strip()
            snapshot['title'] = f"{title} - Mã đề {snapshot['exam_code']}"
            snapshot['content_sha256'] = matrix_digest(snapshot)
        return snapshot

    def export_exam_bundle(self, ident, matrix_service=None, fmt='docx'):
        import zipfile
        import io
        from exports import export_document, export_answer_grid_docx
        from matrices.exports import export_matrix

        with self.lock:
            exam = self.get_record('exams', ident)
            grade = exam.get('grade', 10)
            exam_type = exam.get('exam_type', 'GK1')
            subj_name = str(exam.get('subject_name') or 'Tin học')
            s_year = str(exam.get('school_year', '2026-2027')).replace(' ', '')
            folder_root = f"Ho_so_kiem_tra_Khoi_{grade}_{exam_type}_{s_year}"
            # B8: đề gắn với hoạt động KTTX thì gói mang tên "Tin {N}_Kiểm tra thường xuyên {k} - HK {I|II}".
            linked = next((a for a in self._read_data(self.data_dir/'kttx.json', [])
                           if a.get('exam_id') in (ident, exam.get('parent_exam_id'))), None)
            if linked:
                folder_root = linked['title'] + (f" {linked['class_name']}" if linked.get('class_name') else '')

            all_exams = self._records('exams')
            family = [x for x in all_exams if x.get('parent_exam_id') == ident]
            if not family:
                if exam.get('parent_exam_id'):
                    parent_id = exam['parent_exam_id']
                    family = [x for x in all_exams if x.get('parent_exam_id') == parent_id]
                else:
                    family = [exam]

            included_components = []
            missing_or_failed_components = []

            bio = io.BytesIO()
            with zipfile.ZipFile(bio, 'w', compression=zipfile.ZIP_DEFLATED) as z:
                answer_grid_mc = {}
                answer_grid_yn = {}
                answer_grid_short = {}
                codes = []
                seen_codes = {}

                for ex in family:
                    raw_code = str(ex.get('exam_code') or 'GOC').strip()
                    if raw_code in seen_codes:
                        seen_codes[raw_code] += 1
                        code = f"{raw_code}_{seen_codes[raw_code]}"
                    else:
                        seen_codes[raw_code] = 1
                        code = raw_code
                    codes.append(code)

                    # Student exam
                    raw_stu, _, fn_stu = export_document(ex, fmt=fmt, answers=False, revision=False)
                    z.writestr(f"{folder_root}/01_De_thi_hoc_sinh/De_thi_Ma_{code}.{fmt}", raw_stu)
                    included_components.append(f"Đề thi học sinh - Mã {code} ({fmt.upper()})")

                    # Teacher answer key
                    raw_tch, _, fn_tch = export_document(ex, fmt=fmt, answers=True, revision=False)
                    z.writestr(f"{folder_root}/02_Dap_an_va_Huong_dan_cham/Dap_an_chi_tiet_Ma_{code}.{fmt}", raw_tch)
                    included_components.append(f"Đáp án & HDC chi tiết - Mã {code} ({fmt.upper()})")

                    if len(family) > 1:
                        matrix = self._exam_matrix(ex, matrix_service)
                        if matrix:
                            try:
                                raw_mat, _, _ = export_matrix(matrix, self.catalog, fmt=fmt)
                                z.writestr(f"{folder_root}/03_Ma_tran_va_Bang_dac_ta/Ma_tran_va_Bang_dac_ta_Ma_{code}.{fmt}", raw_mat)
                                included_components.append(f"Ma trận & Bảng đặc tả theo số câu mã {code} ({fmt.upper()})")
                            except Exception as exc:
                                missing_or_failed_components.append(f"Ma trận mã {code}: {type(exc).__name__} - {exc}")
                        else:
                            missing_or_failed_components.append(f"Không tìm thấy ma trận cho mã {code}.")

                    for q in ex.get('questions', []):
                        slot = q.get('slot_number', 1)
                        if q.get('type') == 'MC':
                            ans_letter = mc_answer_letter(q)
                            answer_grid_mc.setdefault(slot, {})[code] = ans_letter
                        elif q.get('type') == 'YN':
                            yn_ans = ", ".join(f"{st.get('label', chr(97+si))}: {'Đ' if st.get('correct') else 'S'}" for si, st in enumerate(q.get('statements', [])))
                            answer_grid_yn.setdefault(slot, {})[code] = yn_ans
                        elif q.get('type') == 'SHORT':
                            answer_grid_short.setdefault(slot, {})[code] = canonical_short_answer(q)

                # Master Answer Grid
                if len(family) > 1 and fmt == 'docx':
                    grid_payload = {'codes': codes, 'mc': answer_grid_mc, 'yn': answer_grid_yn, 'short': answer_grid_short}
                    raw_grid = export_answer_grid_docx(grid_payload, meta=exam)
                    z.writestr(f"{folder_root}/02_Dap_an_va_Huong_dan_cham/Bang_dap_an_tong_hop_cac_ma_de.docx", raw_grid)
                    included_components.append("Bảng ma trận đáp án tổng hợp các mã đề (DOCX)")
                # B7: bảng đối chiếu mã đề (câu gốc, vị trí, đáp án sau hoán vị, điểm) và kết quả tự kiểm tra.
                if len(family) > 1:
                    parent = exam if not exam.get('parent_exam_id') else next(
                        (x for x in all_exams if x.get('id') == exam['parent_exam_id']), None)
                    if parent is not None:
                        from exports import export_mapping_docx
                        problems = verify_codes(parent, family)
                        z.writestr(f"{folder_root}/02_Dap_an_va_Huong_dan_cham/Bang_doi_chieu_ma_de.docx",
                                   export_mapping_docx(mapping_rows(parent, family), codes, meta=parent, problems=problems))
                        included_components.append("Bảng đối chiếu mã đề với đề gốc (DOCX)")
                        missing_or_failed_components.extend(f"Đối chiếu mã đề: {p}" for p in problems)
                    else:
                        missing_or_failed_components.append("Bảng đối chiếu mã đề: không còn đề gốc để đối chiếu.")

                # Matrix and Specification
                matrix = self._exam_matrix(exam, matrix_service)
                if len(family) > 1:
                    pass  # Each variant already carries its own numbered specification above.
                elif matrix:
                    try:
                        raw_mat, _, fn_mat = export_matrix(matrix, self.catalog, fmt=fmt)
                        z.writestr(f"{folder_root}/03_Ma_tran_va_Bang_dac_ta/Ma_tran_va_Bang_dac_ta.{fmt}", raw_mat)
                        included_components.append(f"Khung Ma trận & Bảng đặc tả: {matrix.get('title', 'Chuẩn')} ({fmt.upper()})")
                    except Exception as exc:
                        missing_or_failed_components.append(f"Ma trận & Bảng đặc tả ({matrix.get('title', '')}): {type(exc).__name__} - {str(exc)}")
                else:
                    missing_or_failed_components.append(f"Ma trận & Bảng đặc tả: Không tìm thấy bản ma trận phù hợp Khối {grade} kì {exam_type} trong cơ sở dữ liệu.")

                # Revision Guide
                rev_id = exam.get('revision_id')
                if rev_id:
                    try:
                        rev = self.get_record('revisions', rev_id)
                        raw_rev, _, fn_rev = export_document(rev, fmt=fmt, answers=False, revision=True)
                        z.writestr(f"{folder_root}/04_De_cuong_on_tap/De_cuong_on_tap.{fmt}", raw_rev)
                        included_components.append(f"Đề cương ôn tập: {rev.get('title', 'Đề cương')} ({fmt.upper()})")
                    except Exception as exc:
                        missing_or_failed_components.append(f"Đề cương ôn tập (ID {rev_id}): {type(exc).__name__} - {str(exc)}")
                else:
                    missing_or_failed_components.append("Đề cương ôn tập: Đề kiểm tra chưa liên kết Đề cương ôn tập (trường revision_id trống).")

                # Generate Manifest Report
                report_lines = [
                    "BÁO CÁO ĐÓNG GÓI HỒ SƠ KIỂM TRA ĐÁNH GIÁ (EXAMMATRIX STUDIO)",
                    "===========================================================",
                    f"Môn học: {subj_name} — Khối: {grade} — Kì kiểm tra: {exam_type}",
                    f"Đề gốc: {exam.get('title', 'Đề kiểm tra')} (ID: {ident})",
                    f"Thời gian tạo gói: {now()}",
                    f"Định dạng tệp trong gói: {fmt.upper()}",
                    f"Tổng số mã đề hoán vị: {len(family)} mã ({', '.join(codes)})",
                    "",
                    "1. CÁC THÀNH PHẦN ĐÃ ĐÓNG GÓI THÀNH CÔNG:",
                ]
                for inc in included_components:
                    report_lines.append(f"   [✓] {inc}")

                report_lines.append("\n2. CẢNH BÁO THÀNH PHẦN CHƯA HOÀN TẤT HOẶC CÒN THIẾU:")
                if missing_or_failed_components:
                    for mis in missing_or_failed_components:
                        report_lines.append(f"   [!] {mis}")
                else:
                    report_lines.append("   (Không có - Bộ hồ sơ đạt chuẩn đầy đủ 100%)")

                report_lines.extend([
                    "",
                    "3. GHI CHÚ VỀ ĐỊNH DẠNG PDF KHẢO THÍ:",
                    f"- Gói hồ sơ này được xuất dưới định dạng {fmt.upper()}.",
                    "- Tính năng tự động biên dịch trực tiếp sang PDF qua XeLaTeX trong gói ZIP web",
                    "  hiện chưa được tích hợp trên máy chủ (chưa kiểm chứng XeLaTeX runtime tự động).",
                    "- Giáo viên có thể tải gói mã nguồn LaTeX (.tex) và biên dịch bằng XeLaTeX cục bộ",
                    "  hoặc lưu trực tiếp từ file Word (.docx) sang PDF khi cần."
                ])

                z.writestr(f"{folder_root}/Bao_cao_dong_goi_ho_so.txt", "\n".join(report_lines))

            return bio.getvalue(), 'application/zip', f"{folder_root}.zip"

    def verify_exam(self, ident, matrix_service, similarity_percent=None, similarity_mode=None, revision_id=None):
        from docx_exam_importer import verify_exam_against_matrix
        with self.lock:
            records = self._records('exams')
            idx = next((i for i, x in enumerate(records) if x.get('id') == ident), None)
            if idx is None:
                raise ServiceError('Không tìm thấy đề kiểm tra để kiểm định.', {'id': ident}, 404)
            exam = records[idx]
            if revision_id and revision_id != exam.get('revision_id'):  # gắn đề cương cho đề tạo trước
                self._assert_exam_editable(exam, 'Đề đã duyệt & khóa hoặc đã phát hành; không đổi được đề cương.')
                linked = self.get_record('revisions', revision_id)
                if linked['grade'] != exam.get('grade'):
                    raise ServiceError('Đề cương phải cùng khối với đề kiểm tra.')
                exam['revision_id'] = linked['id']
            if not exam.get('revision_id'):
                raise ServiceError('Đề chưa gắn đề cương. Chọn đề cương cùng khối rồi bấm Kiểm định.')
            grade = exam.get('grade', 9)
            exam_type = exam.get('exam_type', 'GK1')
            matrix = self._exam_matrix(exam, matrix_service)
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
            # B4: đối chiếu từng ô (bài × YCCĐ × dạng × mức độ) và cảnh báo tỉ lệ CV 7991 (chỉ cảnh báo).
            self._attach_cell_report(report, exam, matrix)
            self._refresh_revision_check(exam)
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
            self._assert_exam_editable(exam)
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
            # B4: đối chiếu từng ô (bài × YCCĐ × dạng × mức độ) và cảnh báo tỉ lệ CV 7991 (chỉ cảnh báo).
            self._attach_cell_report(report, exam, matrix)
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
