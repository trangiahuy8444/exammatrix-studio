#!/usr/bin/env python3
"""Run the local bank UI: use the bundled Python runtime, no installation needed."""
from __future__ import annotations
import argparse
import json
import mimetypes
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
from bank_service import BankService, ServiceError
from exports import export_document
from matrices.service import MatrixService
from matrices.http import handle_matrix_get,handle_matrix_post

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

    def do_GET(self):
        try:
            self._local_request()
            url = urlsplit(self.path)
            path = unquote(url.path)
            service = self.server.service
            if path == '/api/state':
                state=service.state();state['matrices']=self.server.matrix_service.list()
                return self._json(state)
            if handle_matrix_get(self,path,parse_qs(url.query)):
                return
            if path == '/api/bank/export':
                raw = json.dumps(service.state()['bank'], ensure_ascii=False, indent=2, allow_nan=False).encode()
                return self._send(raw, filename='ngan_hang_cau_hoi.json')
            if path == '/api/bank/export-lms':
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
                raw, mime, filename = export_document(record, fmt, answer_value == '1', revision=name == 'revisions', target=target)
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
            service = self.server.service
            if handle_matrix_post(self,path,payload):
                return
            if path == '/api/questions/save':
                question = service.save_question(payload.get('question'))
                return self._json({'question': question, 'bank': service.state()['bank']})
            if path == '/api/questions/archive':
                return self._json({'bank': service.archive_question(payload.get('id'))})
            if path == '/api/questions/restore':
                return self._json({'bank': service.restore_question(payload.get('id'), payload.get('status', 'approved'))})
            if path == '/api/questions/delete':
                return self._json({'bank': service.delete_question(payload.get('id'))})
            if path == '/api/questions/bulk':
                return self._json({'bank': service.bulk_questions(payload.get('ids'), payload.get('action'), payload.get('status'))})
            if path == '/api/ppct/save-lesson':
                return self._json({'bank': service.save_ppct_lesson(payload.get('lesson') or payload)})
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
            if path == '/api/exams/generate':
                return self._json({'exam': service.generate_exam(payload)})
            if path == '/api/exams/update':
                return self._json({'exam': service.update_exam(payload), 'exams': service.state()['exams']})
            if path == '/api/exams/delete':
                return self._json({'exams': service.delete_exam(payload.get('id'))})
            if path == '/api/exams/duplicate':
                return self._json({'exam': service.duplicate_exam(payload.get('id')), 'exams': service.state()['exams']})
            if path == '/api/exams/verify':
                return self._json({'exam': service.verify_exam(payload.get('id'), self.server.matrix_service, payload.get('similarity_percent'), payload.get('similarity_mode')), 'exams': service.state()['exams']})
            if path == '/api/exams/adjust-similarity':
                return self._json(service.adjust_exam_similarity(payload, self.server.matrix_service))
            if path == '/api/exams/inspect-import':
                return self._json(service.inspect_exam_import(payload, self.server.matrix_service))
            if path == '/api/exams/import-verified':
                return self._json(service.import_verified_exams(payload, self.server.matrix_service))
            raise ServiceError('Không có API này.', status=404)
        except ServiceError as exc:
            self._error(exc)
        except (OSError, ValueError, TypeError, KeyError) as exc:
            self._error(ServiceError('Không thể lưu dữ liệu; bản đang dùng được giữ nguyên nếu ghi chưa hoàn tất.', {'reason': type(exc).__name__}, 409))


def create_server(bank_path=DEFAULT_BANK, data_dir=None, templates_path=None, public_dir=None, port=8765):
    service = BankService(bank_path, data_dir or APP_DIR/'data', templates_path)
    public = Path(public_dir or APP_DIR/'public').resolve()
    if service.bank_path.is_relative_to(public) or service.data_dir.is_relative_to(public):
        raise ServiceError('Ngân hàng và lịch sử phải nằm ngoài thư mục public.')
    server = LocalServer(('127.0.0.1', port), Handler)
    server.service = service
    server.matrix_service = MatrixService(service)
    server.public_dir = public
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
