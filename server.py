#!/usr/bin/env python3
"""Run the local bank UI: use the bundled Python runtime, no installation needed."""
from __future__ import annotations
import argparse
import json
import mimetypes
import re
import shutil
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
from bank_service import BankService, ServiceError
from domain.answer_access import redact_answers
from domain.test_seed import seed_bank, install_sample
from exports import export_document
from matrices.service import MatrixService
from matrices.http import handle_matrix_get,handle_matrix_post
from matrices.generation import _usable as usable_matrix

APP_DIR = Path(__file__).resolve().parent
DEFAULT_BANK = APP_DIR.parent/'06_Kiem_tra_va_Danh_gia/01_Ngan_hang_cau_hoi/03_Ngan_hang_mo_rong_HK1_2026_10_21/NGAN_HANG_CAU_HOI_HK1_V1.json'
MAX_BODY = 16 * 1024 * 1024


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(BaseHTTPRequestHandler):
    server_version = 'NganHangLocal/1.0'

    def log_message(self, fmt, *args):
        # Request paths and user question text do not enter access logs.
        pass

    def _actor(self):
        # Người thực hiện ghi vào lịch sử duyệt; Django ghi đè bằng tên tài khoản.
        return 'local'

    def _can_view_answers(self):
        # Máy cục bộ chỉ có một giáo viên; Django ghi đè theo tài khoản (B2).
        return True

    def _audit(self, action, object_id, details=None):
        # Nhật ký xem/tải đáp án của máy cục bộ: một dòng JSON mỗi lần, trong thư mục dữ liệu (không vào git).
        try:
            service = self.server.service
            path = Path(service.data_dir)/'nhat_ky_dap_an.jsonl'
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('a', encoding='utf-8') as handle:
                handle.write(json.dumps(dict(at=datetime.now(timezone.utc).isoformat(), by=self._actor(), action=action,
                                             object_id=object_id, details=details or {}), ensure_ascii=False) + '\n')
        except OSError:
            pass

    def _require_answers(self, object_id, kind):
        """Mọi đường lấy đáp án đều đi qua đây: không có quyền thì 403; được phép hay bị từ chối đều ghi nhật ký."""
        if not self._can_view_answers():
            self._audit('answers_denied', object_id, {'kind': kind})
            raise ServiceError('Tài khoản này không có quyền xem đáp án và hướng dẫn chấm.', status=403)
        self._audit('answers_access', object_id, {'kind': kind})

    def _ai_scope(self):
        # Phạm vi đếm lượt AI; Django ghi đè theo tài khoản.
        return 'local'

    def _local_request(self, mutation=False):
        port = self.server.server_address[1]
        hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
        host = self.headers.get('Host', '').lower()
        if host not in hosts:
            raise ServiceError('Chỉ chấp nhận Host cục bộ của ứng dụng.')
        if mutation:
            if self.headers.get('Origin') != f'http://{host}':
                raise ServiceError('Yêu cầu ghi phải đến từ cùng trang ứng dụng cục bộ.')
            fetch_site = self.headers.get('Sec-Fetch-Site')
            if fetch_site and fetch_site not in ('same-origin', 'none'):
                raise ServiceError('Không nhận yêu cầu ghi từ trang ngoài ứng dụng.')
            if self.headers.get_content_type() != 'application/json':
                raise ServiceError('Nội dung gửi phải là JSON.')

    def _send(self, raw, content_type='application/json; charset=utf-8', status=200, filename=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        if filename:
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(raw)

    def _json(self, value, status=200):
        if not self._can_view_answers():
            value = redact_answers(value)
        self._send(json.dumps(value, ensure_ascii=False, allow_nan=False).encode(), status=status)

    def _error(self, exc):
        body = {'error': exc.error}
        if exc.details is not None:
            body['details'] = exc.details
        self._json(body, exc.status)

    def _body(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError as exc:
            raise ServiceError('Content-Length không hợp lệ.') from exc
        if not 0 < length <= MAX_BODY:
            raise ServiceError('Nội dung JSON trống hoặc vượt quá giới hạn 16 MB.')
        try:
            value = json.loads(self.rfile.read(length).decode('utf-8'), parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
        except (ValueError, UnicodeDecodeError) as exc:
            raise ServiceError('Không đọc được nội dung JSON hợp lệ.') from exc
        if not isinstance(value, dict):
            raise ServiceError('Nội dung gửi phải là một đối tượng JSON.')
        return value

    def do_HEAD(self):
        self.do_GET()

    def _get_services(self):
        query = parse_qs(urlsplit(self.path).query)
        is_test = self.headers.get('X-Test-Mode') == '1' or any(query.get(k) == ['1'] for k in ('test_mode', 'test'))
        if is_test:
            if not hasattr(self.server, 'test_service'):
                raise ServiceError('Môi trường thử chưa được thiết lập; không ghi vào ngân hàng thật.', status=400)
            return self.server.test_service, self.server.test_matrix_service
        return self.server.service, self.server.matrix_service

    def do_GET(self):
        try:
            self._local_request()
            url = urlsplit(self.path)
            path = unquote(url.path)
            service, self.matrix_service = self._get_services()
            if path == '/api/state':
                state=service.state();state['matrices']=self.matrix_service.list()
                from domain.review import CHECKLIST
                state['review_checklist']=[dict(item) for item in CHECKLIST]
                state['is_test_mode'] = (service == getattr(self.server, 'test_service', None))
                state['can_view_answers'] = self._can_view_answers()
                return self._json(state)
            if path == '/api/kttx':
                return self._json(service.kttx_state())
            if path == '/api/ai/status':
                from ai_assistant import ai_status
                return self._json(ai_status(self._ai_scope()))
            if path == '/api/test/status':
                return self._json({
                    'test_mode_available': True,
                    'is_test_active': (service == getattr(self.server, 'test_service', None)),
                    'test_questions': len(self.server.test_service.state()['bank']['questions']) if hasattr(self.server, 'test_service') else 0
                })
            if handle_matrix_get(self,path,parse_qs(url.query)):
                return
            if path == '/api/bank/export':
                self._require_answers('bank', 'bank_json')
                raw = json.dumps(service.state()['bank'], ensure_ascii=False, indent=2, allow_nan=False).encode()
                return self._send(raw, filename='ngan_hang_cau_hoi.json')
            if path == '/api/bank/export-lms':
                self._require_answers('bank', 'bank_lms')
                query = parse_qs(url.query)
                grade = query.get('grade', [None])[0]
                raw_ids = query.get('ids', [None])[0]
                fmt = query.get('format', ['docx'])[0]
                all_qs = service.state()['bank'].get('questions', [])
                if raw_ids:
                    id_set = set(raw_ids.split(','))
                    qs = [q for q in all_qs if q.get('id') in id_set]
                elif grade:
                    qs = [q for q in all_qs if str(q.get('grade')) == str(grade)]
                else:
                    qs = all_qs
                tmp_record = {
                    'title': f'Ngân hàng câu hỏi Tin {grade or ""}',
                    'grade': grade or 'all',
                    'questions': qs
                }
                raw, mime, filename = export_document(tmp_record, fmt, answers=True, revision=True, target='lms')
                return self._send(raw, mime, filename=filename)
            match = re.fullmatch(r'/api/(exams|revisions)/([A-Za-z0-9_-]+)/export', path)
            if match:
                name, ident = match.groups()
                query = parse_qs(url.query)
                fmt = query.get('format', ['docx'])[0]
                answer_value = query.get('answers', ['0'])[0]
                target = query.get('target', [''])[0]
                if answer_value not in ('0', '1'):
                    raise ServiceError('Tham số answers chỉ nhận 0 hoặc 1.')
                record = service.get_record(name, ident)
                # Bản giáo viên, tệp LMS (đánh dấu đáp án) và đề cương (có bảng đáp án) đều chứa đáp án.
                if name == 'revisions' or answer_value == '1' or target == 'lms' or fmt == 'lms':
                    self._require_answers(ident, f'{name}:{fmt}:{"lms" if target == "lms" else "answers"}')
                raw, mime, filename = export_document(record, fmt, answer_value == '1', revision=name == 'revisions', target=target)
                return self._send(raw, mime, filename=filename)
            match_map = re.fullmatch(r'/api/exams/([A-Za-z0-9_-]+)/mapping\.docx', path)
            if match_map:
                # B7: bảng đối chiếu mã đề có đáp án nên cũng phải qua quyền xem đáp án.
                ident = match_map.group(1)
                self._require_answers(ident, 'mapping')
                raw, filename = service.export_permutation_mapping(ident)
                return self._send(raw, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename=filename)
            match_bundle = re.fullmatch(r'/api/exams/([A-Za-z0-9_-]+)/bundle\.zip', path)
            if match_bundle:
                ident = match_bundle.group(1)
                self._require_answers(ident, 'bundle')
                query = parse_qs(url.query)
                fmt = query.get('format', ['docx'])[0]
                raw, mime, filename = service.export_exam_bundle(ident, self.matrix_service, fmt=fmt)
                return self._send(raw, mime, filename=filename)
            if path.startswith('/api/'):
                raise ServiceError('Không có API này.', status=404)
            # Public assets only. No directory listings, dotfiles, parent segments,
            # or symlinks that resolve into canonical data or application source.
            parts = Path(path.lstrip('/')).parts
            if any(part in ('..', '.') or part.startswith('.') for part in parts) or '\\' in path:
                raise ServiceError('Không tìm thấy tài nguyên.', status=404)
            public = self.server.public_dir
            target = (public/('index.html' if path == '/' else path.lstrip('/'))).resolve()
            if not target.is_relative_to(public) or not target.is_file():
                raise ServiceError('Không tìm thấy tài nguyên.', status=404)
            mime = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
            if mime.startswith('text/') or mime in ('application/javascript', 'application/json'):
                mime += '; charset=utf-8'
            return self._send(target.read_bytes(), mime)
        except ServiceError as exc:
            self._error(exc)
        except (OSError, ValueError, TypeError, KeyError) as exc:
            self._error(ServiceError('Không thể đọc hoặc xuất dữ liệu. Vui lòng kiểm tra tệp nguồn.', {'reason': type(exc).__name__}, 409))

    def do_POST(self):
        try:
            self._local_request(mutation=True)
            payload = self._body()
            path = urlsplit(self.path).path
            service, self.matrix_service = self._get_services()
            service.actor = self._actor()
            if path == '/api/test/reset':
                if service is not getattr(self.server, 'test_service', None):
                    raise ServiceError('Chỉ được làm sạch dữ liệu khi đang ở chế độ Test.', status=400)
                if hasattr(self.server, 'reset_test_sandbox'):
                    self.server.reset_test_sandbox()
                clean_state = self.server.test_service.state()
                clean_state['matrices'] = self.server.test_matrix_service.list()
                clean_state['is_test_mode'] = True
                return self._json({'ok': True, 'state': clean_state})
            if handle_matrix_post(self,path,payload):
                return
            if path == '/api/questions/save':
                question = service.save_question(payload.get('question'))
                from domain.reuse import bank_duplicates
                bank = service.state()['bank']
                # B5: chỉ cảnh báo câu trùng nguyên văn (kể cả khác khối), không chặn lưu.
                return self._json({'question': question, 'bank': bank,
                                   'duplicates': bank_duplicates(question, bank.get('questions', []))})
            if path == '/api/questions/review':
                question = service.review_question(payload.get('id'), payload.get('action'), actor=self._actor(),
                                                   checklist=payload.get('checklist'), reason=payload.get('reason', ''))
                return self._json({'question': question, 'bank': service.state()['bank']})
            if path == '/api/questions/archive':
                return self._json({'bank': service.archive_question(payload.get('id'))})
            if path == '/api/questions/restore':
                return self._json({'bank': service.restore_question(payload.get('id'), payload.get('status'))})
            if path == '/api/questions/delete':
                return self._json({'bank': service.delete_question(payload.get('id'))})
            if path == '/api/questions/bulk':
                return self._json({'bank': service.bulk_questions(payload.get('ids'), payload.get('action'), payload.get('status'))})
            if path == '/api/ppct/save-lesson':
                return self._json({'bank': service.save_ppct_lesson(payload.get('lesson') or payload)})
            if path == '/api/ppct/inspect-import':
                return self._json(service.inspect_ppct_import(payload))
            if path == '/api/ppct/apply-import':
                return self._json(service.apply_ppct_import(payload))
            if path == '/api/ppct/delete-lesson':
                return self._json({'bank': service.delete_ppct_lesson(payload.get('grade'), payload.get('lesson_code'))})
            if path == '/api/bank/import':
                return self._json({'bank': service.import_bank(payload.get('bank'))})
            if path == '/api/revisions/save':
                return self._json({'revision': service.save_revision(payload)})
            if path == '/api/revisions/update':
                return self._json({'revision': service.update_revision(payload), 'revisions': service.state()['revisions']})
            if path == '/api/revisions/delete':
                return self._json({'revisions': service.delete_revision(payload.get('id'))})
            if path == '/api/revisions/duplicate':
                return self._json({'revision': service.duplicate_revision(payload.get('id')), 'revisions': service.state()['revisions']})
            if path == '/api/revisions/import-file':
                return self._json({'revision': service.import_revision_file(payload), 'revisions': service.state()['revisions']})
            if path in ('/api/exams/generate', '/api/exams/generate-set', '/api/revisions/propose'):
                # Ma trận ở "Ma trận & đặc tả" chỉ do máy chủ nạp (đã khóa, không lỗi đối chiếu); không tin bản gửi lên.
                payload.pop('_matrix', None)
                if payload.get('matrix_id'):
                    payload['_matrix'] = usable_matrix(service, self.matrix_service, payload['matrix_id'])
            if path == '/api/revisions/propose':
                return self._json(service.propose_revision(payload))
            if path == '/api/exams/generate':
                return self._json({'exam': service.generate_exam(payload)})
            if path == '/api/exams/generate-set':
                result = service.generate_exam_set(payload)
                state = service.state()
                return self._json(dict(result, exams_all=state['exams'], revisions=state['revisions']))
            if path == '/api/exams/update':
                return self._json({'exam': service.update_exam(payload), 'exams': service.state()['exams']})
            if path == '/api/exams/delete':
                return self._json({'exams': service.delete_exam(payload.get('id'))})
            if path == '/api/exams/duplicate':
                return self._json({'exam': service.duplicate_exam(payload.get('id')), 'exams': service.state()['exams']})
            if path == '/api/exams/permute':
                result = service.create_permuted_exams(
                    ident=payload.get('id'),
                    codes=payload.get('codes'),
                    num_variants=payload.get('num_variants', 4),
                    shuffle_questions=payload.get('shuffle_questions', True),
                    shuffle_options=payload.get('shuffle_options', True),
                    shuffle_statements=payload.get('shuffle_statements', False),
                    seed=payload.get('seed')
                )
                return self._json({'result': result, 'exams': service.state()['exams']})
            if path == '/api/exams/transition':
                exam = service.exam_transition(payload.get('id'), payload.get('action'), actor=self._actor(),
                                               reason=payload.get('reason', ''), matrix_service=self.matrix_service)
                return self._json({'exam': exam, 'exams': service.state()['exams']})
            if path == '/api/exams/set/transition':
                result = service.exam_set_transition(payload.get('set_id'), payload.get('action'), actor=self._actor(),
                                                   reason=payload.get('reason', ''), matrix_service=self.matrix_service)
                state = service.state()
                return self._json(dict(result, exams_all=state['exams']))
            if path == '/api/revisions/transition':
                rev = service.revision_transition(payload.get('id'), payload.get('action'), actor=self._actor(),
                                                 reason=payload.get('reason', ''))
                return self._json({'revision': rev, 'revisions': service.state()['revisions']})
            if path == '/api/kttx/save':
                activity = service.save_kttx(payload.get('activity') or payload, actor=self._actor())
                return self._json({'activity': activity, **service.kttx_state()})
            if path == '/api/kttx/delete':
                service.delete_kttx(payload.get('id'))
                return self._json(service.kttx_state())
            if path == '/api/exams/close-match':
                mark = service.mark_close_match(payload.get('id'), payload.get('question_id'), payload.get('revision_question_id'),
                                                payload.get('reason', ''), actor=self._actor())
                return self._json({'mark': mark, 'exams': service.state()['exams']})
            if path == '/api/exams/close-match/review':
                mark = service.review_close_match(payload.get('id'), payload.get('question_id'), payload.get('action'),
                                                  actor=self._actor(), reason=payload.get('reason', ''))
                return self._json({'mark': mark, 'exams': service.state()['exams']})
            if path == '/api/exams/verify':
                return self._json({'exam': service.verify_exam(payload.get('id'), self.matrix_service, payload.get('similarity_percent'), payload.get('similarity_mode'), payload.get('revision_id')), 'exams': service.state()['exams']})
            if path == '/api/exams/adjust-similarity':
                return self._json(service.adjust_exam_similarity(payload, self.matrix_service))
            if path == '/api/exams/inspect-import':
                return self._json(service.inspect_exam_import(payload, self.matrix_service))
            if path == '/api/exams/import-verified':
                return self._json(service.import_verified_exams(payload, self.matrix_service))
            if path == '/api/ai/save-drafts':
                # Câu AI luôn vào ngân hàng ở trạng thái nháp, không bao giờ tự lên approved.
                items = payload.get('questions')
                if not isinstance(items, list) or not items:
                    raise ServiceError('Chưa có câu hỏi nào để lưu.', status=400)
                if any(not isinstance(q, dict) or q.get('id') for q in items):
                    raise ServiceError('Chỉ lưu câu AI mới; không sửa câu đã có qua đường này.', status=400)
                saved = [service.save_question(dict(q, review_status='draft'), origin='ai_gemini') for q in items]
                return self._json({'saved': saved, 'bank': service.state()['bank']})
            if path == '/api/ai/generate-by-outcome':
                from ai_assistant import generate_questions_by_outcome, AiValidationError, AiQuotaError
                try:
                    questions = generate_questions_by_outcome(
                        grade=payload.get('grade', 10),
                        subject=payload.get('subject', 'Tin học'),
                        lesson_name=payload.get('lesson_name', ''),
                        learning_outcome=payload.get('learning_outcome', ''),
                        level=payload.get('level', 'Biết'),
                        count=payload.get('count', 3),
                        question_type=payload.get('question_type', 'MC'),
                        scope=self._ai_scope()
                    )
                    return self._json({'questions': questions})
                except AiQuotaError as exc:
                    raise ServiceError(str(exc), status=429)
                except (AiValidationError, ValueError, RuntimeError) as exc:
                    raise ServiceError(str(exc), status=400)
            if path == '/api/ai/parse-raw':
                from ai_assistant import parse_raw_exam_text, AiValidationError, AiQuotaError
                try:
                    questions = parse_raw_exam_text(
                        raw_text=payload.get('raw_text', ''),
                        grade=payload.get('grade', 10),
                        subject=payload.get('subject', 'Tin học'),
                        scope=self._ai_scope()
                    )
                    return self._json({'questions': questions})
                except AiQuotaError as exc:
                    raise ServiceError(str(exc), status=429)
                except (AiValidationError, ValueError, RuntimeError) as exc:
                    raise ServiceError(str(exc), status=400)
            if path == '/api/ai/generate-variants':
                from ai_assistant import generate_question_variants, AiValidationError, AiQuotaError
                try:
                    variants = generate_question_variants(
                        question_obj=payload.get('question', {}),
                        count=payload.get('count', 2),
                        scope=self._ai_scope()
                    )
                    return self._json({'variants': variants})
                except AiQuotaError as exc:
                    raise ServiceError(str(exc), status=429)
                except (AiValidationError, ValueError, RuntimeError) as exc:
                    raise ServiceError(str(exc), status=400)
            raise ServiceError('Không có API này.', status=404)
        except ServiceError as exc:
            self._error(exc)
        except (OSError, ValueError, TypeError, KeyError) as exc:
            self._error(ServiceError('Không thể lưu dữ liệu; bản đang dùng được giữ nguyên nếu ghi chưa hoàn tất.', {'reason': type(exc).__name__}, 409))


def setup_test_sandbox(base_dir, bank_source=DEFAULT_BANK, clean=False):
    sandbox_dir = Path(base_dir) / 'test_sandbox'
    sandbox_bank = sandbox_dir / 'bank.json'
    if clean or not sandbox_bank.exists():
        if sandbox_dir.exists() and clean:
            shutil.rmtree(sandbox_dir)
        sandbox_dir.mkdir(parents=True, exist_ok=True)
        (sandbox_dir / 'matrices').mkdir(parents=True, exist_ok=True)
        # Vùng Test bắt đầu bằng BẢN SAO PPCT, câu hỏi và ma trận của ngân hàng thật (đề, đề cương trống).
        try:
            live = json.loads(Path(bank_source).read_text(encoding='utf-8'))
        except (OSError, ValueError):
            live = {}
        sandbox_bank.write_text(json.dumps(seed_bank(live), ensure_ascii=False, indent=2), encoding='utf-8')
        (sandbox_dir / 'records.json').write_text('[]', encoding='utf-8')
        (sandbox_dir / 'matrices' / 'records.json').write_text('[]', encoding='utf-8')
        live_matrices = Path(base_dir) / 'matrices'
        if (live_matrices / 'records.json').exists():  # ma trận cần có để thử tạo đề cương và đề theo ma trận
            shutil.copytree(live_matrices, sandbox_dir / 'matrices', dirs_exist_ok=True)
        curr_file = Path(base_dir) / 'curricula.json'
        if curr_file.exists():
            shutil.copy2(curr_file, sandbox_dir / 'curricula.json')
        if not live.get('questions'):
            install_sample(BankService(sandbox_bank, sandbox_dir))
    return sandbox_bank, sandbox_dir


def create_server(bank_path=DEFAULT_BANK, data_dir=None, templates_path=None, public_dir=None, port=8765):
    data_directory = Path(data_dir or APP_DIR/'data').resolve()
    service = BankService(bank_path, data_directory, templates_path)
    public = Path(public_dir or APP_DIR/'public').resolve()
    if service.bank_path.is_relative_to(public) or service.data_dir.is_relative_to(public):
        raise ServiceError('Ngân hàng và lịch sử phải nằm ngoài thư mục public.')
    server = LocalServer(('127.0.0.1', port), Handler)
    server.service = service
    server.matrix_service = MatrixService(service)
    server.public_dir = public

    def reset_sandbox():
        t_bank, t_dir = setup_test_sandbox(data_directory, bank_source=bank_path, clean=True)
        server.test_service = BankService(t_bank, t_dir, templates_path)
        server.test_matrix_service = MatrixService(server.test_service)

    t_bank, t_dir = setup_test_sandbox(data_directory, bank_source=bank_path, clean=False)
    server.test_service = BankService(t_bank, t_dir, templates_path)
    server.test_matrix_service = MatrixService(server.test_service)
    server.reset_test_sandbox = reset_sandbox
    return server


def main():
    parser = argparse.ArgumentParser(description='Ngân hàng đề Tin học — chỉ dùng trên máy này')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--bank', type=Path, default=DEFAULT_BANK)
    parser.add_argument('--data-dir', type=Path, default=APP_DIR/'data')
    parser.add_argument('--templates', type=Path, default=APP_DIR/'data/exam_templates.json')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('Cổng phải nằm trong khoảng 1–65535.')
    try:
        server = create_server(args.bank, args.data_dir, args.templates, port=args.port)
    except (ServiceError, OSError) as exc:
        print(f'Không khởi động được ứng dụng: {exc}', file=sys.stderr)
        return 1
    print(f'Mở http://127.0.0.1:{args.port} — Nhấn Ctrl+C để dừng.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nĐã dừng ứng dụng.', flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
