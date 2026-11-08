"""Django auth and CSRF around the original, fully working application routes."""
from pathlib import Path
from types import SimpleNamespace
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import Http404, HttpResponse, FileResponse, JsonResponse
from django.middleware.csrf import get_token
from django.utils.html import escape, format_html
from django.utils.safestring import mark_safe
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods
from bank_service import ServiceError
from server import Handler
from matrices.service import MatrixService
from workspace.access import workspace_for
from workspace.models import AuditEvent, Workspace
from .answer_access import can_view_answers
from workspace.views import api_view, payload
from .legacy_storage import APP_DIR, bank_for_user, reset_test_bank
from .context import selected_course, course_context
from workspace.models import Curriculum

PUBLIC = APP_DIR/'public'


@never_cache
@login_required
@require_http_methods(['GET'])
def application(request):
    # The original shell and all original JS/CSS remain the single source.
    html = (PUBLIC/'index.html').read_text()
    course = selected_course(request)
    context = course_context(course)
    token = get_token(request)
    html = html.replace('</head>', str(format_html('<meta name="csrf-token" content="{}">'
        '<meta name="workspace-scope" content="{}"><meta name="curriculum-id" content="{}"></head>',
        token, str(workspace_for(request.user).pk)+(':'+str(course.pk) if course else ''), str(course.pk) if course else 'legacy')), 1)
    courses = Curriculum.objects.filter(workspace__owner=request.user, archived=False).select_related('subject')
    options = [str(format_html('<option value="legacy"{}>Tin học 8–10 hiện có</option>', ' selected' if course is None else ''))]
    for item in courses:
        options.append(str(format_html('<option value="{}"{}>{} {} · {}</option>', item.pk,
            ' selected' if course and item.pk == course.pk else '', item.subject.name, item.grade, item.title)))
    selector = format_html('<label for="workspace-curriculum">Môn / chương trình</label>'
        '<select id="workspace-curriculum" aria-label="Môn / chương trình">{}</select>',
        mark_safe(''.join(options)))
    account = format_html('<span class="teacher">{}</span> <a href="/workspace/">Môn học &amp; tài khoản</a> '
                          '<form action="/accounts/logout/" method="post" style="display:inline">'
                          '<input type="hidden" name="csrfmiddlewaretoken" value="{}">'
                          '<button type="submit" class="quiet">Đăng xuất</button></form>', request.user.username, token)
    html = html.replace('<span class="teacher">Không gian giáo viên</span>', str(account), 1)
    html = html.replace('<p class="nav-caption">', str(selector)+'<p class="nav-caption">', 1)
    if course is not None:
        html = html.replace('<title>Ngân hàng đề · Tin học Asian School</title>',
                            str(format_html('<title>Ngân hàng đề · {} {}</title>', course.subject.name, course.grade)))
        html = html.replace('<span class="brand-mark">AS</span><span>ASIAN SCHOOL<small>Tin học · 2026–2027</small></span>',
                            str(format_html('<span class="brand-mark">GV</span><span>{}<small>{} {} · {}</small></span>',
                                request.user.username, course.subject.name, course.grade, course.school_year)))
        html = html.replace('Ngân hàng Tin học 8 · 9 · 10 <span>Asian School · Năm học 2026–2027</span>',
                            str(format_html('Ngân hàng {} {} <span>Năm học {}</span>', course.subject.name, course.grade, course.school_year)))
    html = html.replace('Làm việc trên máy này', 'Không gian riêng của tài khoản', 1)
    html = html.replace('Nội dung được lưu tại thư mục ứng dụng. Chỉ truy cập cục bộ.',
                        'Dữ liệu được lưu riêng. Giữ nguyên các công cụ biên soạn đang dùng.', 1)
    response = HttpResponse(html)
    response['X-Content-Type-Options'] = 'nosniff'
    return response


@require_http_methods(['GET'])
def source_asset(request, asset):
    if asset not in {'app.js', 'core.js', 'matrices.js', 'curricula.js', 'styles.css', 'matrices.css'}:
        # Assets are limited to the exact bundled image files; no user uploads.
        if not asset.startswith('assets/') or Path(asset).suffix.lower() not in {'.png', '.jpg', '.jpeg', '.svg'}:
            raise Http404()
    target = (PUBLIC/asset).resolve()
    if not target.is_relative_to(PUBLIC.resolve()) or not target.is_file() or any(p.startswith('.') for p in Path(asset).parts):
        raise Http404()
    return FileResponse(target.open('rb'))


class DjangoHandler(Handler):
    def __init__(self, request, service, test_mode=False, course=None):
        self.request = request
        self.command = request.method
        self.path = request.get_full_path()
        self.headers = request.headers
        self.server = SimpleNamespace(service=service, matrix_service=MatrixService(service,
            authored_grades=tuple(service.context.get('allowed_grades', [9])) if not service.school_profile else (9,)), public_dir=PUBLIC)
        self.response = None
        if test_mode:
            self.server.test_service = service
            self.server.test_matrix_service = self.server.matrix_service
            def reset():
                fresh = reset_test_bank(request.user, course)
                self.server.test_service = fresh
                self.server.test_matrix_service = MatrixService(fresh,
                    authored_grades=tuple(fresh.context.get('allowed_grades', [9])) if not fresh.school_profile else (9,))
            self.server.reset_test_sandbox = reset

    def _json(self, value, status=200):
        if self.request.path == '/api/state' and isinstance(value, dict):
            value['context'] = self.server.service.context or course_context(None)
        return super()._json(value, status)

    def _actor(self):
        return self.request.user.get_username()

    def _can_view_answers(self):
        if not hasattr(self, '_answers_allowed'):
            self._answers_allowed = can_view_answers(self.request.user)
        return self._answers_allowed

    def _audit(self, action, object_id, details=None):
        # Lượt bị từ chối trả về 403 nên transaction bị hoàn tác; ghi lại sau transaction (xem original_api).
        self.audit_events.append(dict(action=action, object_id=str(object_id)[:100], details=details or {}))

    def _ai_scope(self):
        return getattr(self, 'ai_scope', 'local')

    def _local_request(self, mutation=False):
        # Host validation and sessions are Django's; CSRF middleware checks all
        # mutation routes. Do not use the old localhost-only transport checks.
        self.request.get_host()
        if mutation and self.request.content_type != 'application/json':
            raise ServiceError('Nội dung gửi phải là JSON.')

    def _body(self):
        if len(self.request.body) > 16 * 1024 * 1024:
            raise ServiceError('Nội dung gửi vượt giới hạn 16 MB.', status=413)
        return payload(self.request)

    def _send(self, raw, content_type='application/json; charset=utf-8', status=200, filename=None):
        self.response = HttpResponse(b'' if self.command == 'HEAD' else raw, content_type=content_type, status=status)
        self.response['Cache-Control'] = 'no-store'
        self.response['X-Content-Type-Options'] = 'nosniff'
        self.response['Referrer-Policy'] = 'same-origin'
        if filename:
            self.response['Content-Disposition'] = f'attachment; filename="{filename}"'


# Lời gọi Gemini có thể mất tới 45 giây và không ghi dữ liệu: chạy ngoài transaction và
# ngoài khóa tài khoản để không chặn các thao tác khác của giáo viên (mốc A7).
UNLOCKED_ROUTES = {'ai/status', 'ai/generate-by-outcome', 'ai/parse-raw', 'ai/generate-variants'}


def _run_handler(request, workspace):
    course = selected_course(request)
    test_mode = request.headers.get('X-Test-Mode') == '1' or any(
        request.GET.get(key) == '1' for key in ('test_mode', 'test'))
    service = bank_for_user(request.user, course, test_mode=test_mode)
    handler = DjangoHandler(request, service, test_mode=test_mode, course=course)
    handler.ai_scope = f'ws{workspace.pk}'
    handler.audit_events = []
    request._audit_events = handler.audit_events
    transition_scope = {'/api/exams/transition': 'exam', '/api/exams/set/transition': 'exam_set'}.get(request.path)
    history_sizes = {e['id']: len(e.get('lifecycle', [])) for e in service._records('exams')} if transition_scope else {}
    if request.method == 'POST':
        handler.do_POST()
    else:
        handler.do_GET()
    if handler.response is None:
        raise Http404()
    if transition_scope and handler.response.status_code == 409:
        # Engine đã lưu nhật ký từ chối. Lấy sự kiện trước khi giao dịch hoàn tác,
        # không giữ bất kỳ thay đổi tài liệu/trạng thái phát hành nào của request lỗi.
        for exam in service._records('exams'):
            for entry in exam.get('lifecycle', [])[history_sizes.get(exam['id'], 0):]:
                if entry.get('action') == 'publish_blocked':
                    object_id = (exam.get('exam_set') or {}).get('id') if transition_scope == 'exam_set' else exam['id']
                    handler.audit_events.append(dict(action='publish_blocked', object_id=object_id,
                        details=dict(scope=transition_scope, exam_id=exam['id'],
                                     content_hash=entry.get('content_hash'), from_status=entry.get('from_status'))))
    return handler.response


@api_view
@require_http_methods(['GET', 'POST', 'HEAD'])
def original_api(request, route):
    if route in UNLOCKED_ROUTES:
        return _run_handler(request, workspace_for(request.user))
    # Serialize by teacher, not by one global in-process lock. A failed request
    # rolls back both documents and their recovery history.
    with transaction.atomic():
        workspace = workspace_for(request.user)
        Workspace.objects.select_for_update().get(pk=workspace.pk)
        response = _run_handler(request, workspace)
        if response.status_code >= 400:
            transaction.set_rollback(True)
    # Nhật ký xem/tải đáp án ghi ngoài transaction để lượt bị từ chối (403) không bị hoàn tác.
    for event in getattr(request, '_audit_events', []):
        AuditEvent.objects.create(workspace=workspace, actor=request.user, **event)
    return response
