import json
from functools import wraps
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.http import Http404
from django.contrib import messages
from .services import change_record, has_content, Conflict
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods
from .access import owned, get_owned, workspace_for
from .forms import SubjectForm, CurriculumForm, QuickStartForm
from .models import Subject, Curriculum


def home(request):
    if request.user.is_authenticated:
        return redirect('assessment_app')
    return render(request, 'home.html')


@never_cache
@login_required
@require_http_methods(['GET', 'POST'])
def dashboard(request):
    workspace = workspace_for(request.user)
    quick_start_form = QuickStartForm(auto_id='quick_%s')
    subject_form = SubjectForm(instance=Subject(workspace=workspace))
    curriculum_form = CurriculumForm(user=request.user, instance=Curriculum(workspace=workspace),
                                     initial={'school_year': '2026-2027'})
    if request.method == 'POST':
        if request.POST.get('action') == 'quickstart':
            quick_start_form = QuickStartForm(request.POST, auto_id='quick_%s')
            if quick_start_form.is_valid():
                try:
                    with transaction.atomic():
                        course = quick_start_form.save(workspace)
                    return redirect(f'/app/?curriculum={course.pk}')
                except (ValidationError, IntegrityError) as exc:
                    quick_start_form.add_error(None, ' '.join(exc.messages) if isinstance(exc, ValidationError) else 'Không lưu được chương trình. Hãy tải lại trang.')
            form = quick_start_form
        elif request.POST.get('action') == 'subject':
            subject_form = SubjectForm(request.POST, instance=Subject(workspace=workspace))
            form = subject_form
        else:
            curriculum_form = CurriculumForm(request.POST, user=request.user, instance=Curriculum(workspace=workspace))
            form = curriculum_form
        if request.POST.get('action') != 'quickstart' and form.is_valid():
            try:
                with transaction.atomic():
                    saved = form.save()
                if isinstance(saved, Curriculum):
                    return redirect(f'/app/?curriculum={saved.pk}')
                return redirect('workspace')
            except (ValidationError, IntegrityError):
                form.add_error(None, 'Không lưu được vì dữ liệu trùng hoặc đã thay đổi. Hãy kiểm tra lại.')
    return render(request, 'workspace.html', {
        'quick_start_form': quick_start_form, 'subject_form': subject_form, 'curriculum_form': curriculum_form,
        'subjects': owned(Subject.objects.filter(archived=False), request.user),
        'curricula': owned(Curriculum.objects.filter(archived=False).select_related('subject'), request.user),
        'deleted_curricula': owned(Curriculum.objects.filter(archived=True).select_related('subject'), request.user),
        'deleted_subjects': owned(Subject.objects.filter(archived=True), request.user),
    })


def api_view(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated or not request.user.is_active:
            return JsonResponse({'error': 'Vui lòng đăng nhập.', 'code': 'login_required'}, status=401)
        try:
            return view(request, *args, **kwargs)
        except (ValueError, UnicodeDecodeError, TypeError) as exc:
            return JsonResponse({'error': 'Nội dung gửi không hợp lệ.', 'code': 'invalid_payload'}, status=400)
        except ValidationError as exc:
            return JsonResponse({'error': 'Vui lòng kiểm tra dữ liệu.', 'code': 'validation',
                                 'details': exc.message_dict if hasattr(exc, 'message_dict') else exc.messages}, status=400)
        except Conflict as exc:
            return JsonResponse({'error': str(exc), 'code': 'conflict'}, status=409)
        except IntegrityError:
            return JsonResponse({'error': 'Dữ liệu đã tồn tại hoặc vừa thay đổi.', 'code': 'conflict'}, status=409)
    return never_cache(wrapped)


def payload(request):
    if request.content_type != 'application/json':
        raise ValueError()
    data = json.loads(request.body, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
    if not isinstance(data, dict):
        raise ValueError()
    return data


def subject_json(subject):
    return {'id': str(subject.pk), 'code': subject.code, 'name': subject.name, 'archived':subject.archived, 'revision':subject.revision}


@api_view
@require_http_methods(['GET', 'POST'])
def subjects(request):
    if request.method == 'GET':
        return JsonResponse({'subjects': [subject_json(s) for s in owned(Subject.objects.filter(archived=False), request.user)]})
    data = payload(request)
    with transaction.atomic():
        subject = Subject.objects.create(workspace=workspace_for(request.user), code=data.get('code'), name=data.get('name'))
    return JsonResponse({'subject': subject_json(subject)}, status=201)


@api_view
@require_http_methods(['GET', 'PATCH', 'DELETE'])
def subject_detail(request, pk):
    if request.method == 'GET':
        record = get_owned(Subject.objects.all(), request.user, pk)
    else:
        record = change_record(request.user, 'subjects', pk,
            'delete' if request.method == 'DELETE' else 'update', payload(request))
    return JsonResponse({'subject': subject_json(record)})


def curriculum_json(c):
    return dict(id=str(c.pk), title=c.title, grade=c.grade, subject_id=str(c.subject_id),
                subject_name=c.subject.name, school_year=c.school_year, book=c.book,
                archived=c.archived, revision=c.revision)


@api_view
@require_http_methods(['GET', 'POST'])
def curricula(request):
    if request.method == 'GET':
        return JsonResponse({'curricula': [curriculum_json(c) for c in owned(Curriculum.objects.filter(archived=False).select_related('subject'), request.user)]})
    data = payload(request)
    subject = get_owned(Subject.objects.filter(archived=False), request.user, data.get('subject_id'))
    with transaction.atomic():
        c = Curriculum.objects.create(workspace=workspace_for(request.user), subject=subject,
            title=data.get('title'), grade=data.get('grade'), school_year=data.get('school_year'), book=data.get('book', ''))
    return JsonResponse({'curriculum': curriculum_json(c)}, status=201)


@api_view
@require_http_methods(['GET', 'PATCH', 'DELETE'])
def curriculum_detail(request, pk):
    if request.method == 'GET':
        record = get_owned(Curriculum.objects.select_related('subject'), request.user, pk)
    else:
        record = change_record(request.user, 'curricula', pk,
            'delete' if request.method == 'DELETE' else 'update', payload(request))
    return JsonResponse({'curriculum': curriculum_json(record)})


@api_view
@require_http_methods(['POST'])
def restore_record(request, kind, pk):
    if kind not in ('subjects', 'curricula'):
        raise Http404()
    record = change_record(request.user, kind, pk, 'restore', payload(request))
    return JsonResponse({'subject' if kind == 'subjects' else 'curriculum':
                         subject_json(record) if kind == 'subjects' else curriculum_json(record)})


@never_cache
@login_required
@require_http_methods(['GET', 'POST'])
def record_page(request, kind, pk, action='detail'):
    if kind not in ('subjects', 'curricula') or action not in ('detail', 'edit', 'delete', 'restore'):
        raise Http404()
    model = Subject if kind == 'subjects' else Curriculum
    record = get_owned(model.objects.all(), request.user, pk)
    is_course = kind == 'curricula'
    label = 'chương trình' if is_course else 'môn học'
    base = f'/workspace/{kind}/{record.pk}/'
    locked = is_course and has_content(record)
    form = None
    error = None
    status = 200
    if action == 'edit':
        if is_course:
            form = CurriculumForm(request.POST if request.method == 'POST' else None, instance=record, user=request.user)
            if locked:
                for field in ['subject', 'grade', 'school_year']:
                    form.fields[field].disabled = True
        else:
            form = SubjectForm(request.POST if request.method == 'POST' else None, instance=record)
    if request.method == 'POST':
        if action == 'detail':
            raise Http404()
        try:
            data = {'expected_revision': request.POST.get('expected_revision')}
            if action == 'edit':
                if not form.is_valid():
                    raise ValidationError('Vui lòng kiểm tra các mục bên dưới.')
                data.update(form.cleaned_data)
                if is_course:
                    data['subject_id'] = str(data.pop('subject').pk)
            change_record(request.user, kind, pk, 'update' if action == 'edit' else action, data)
            messages.success(request, {'edit':'Đã lưu thay đổi.', 'delete':'Đã chuyển vào thùng rác. Bạn có thể khôi phục.', 'restore':'Đã khôi phục.'}[action])
            return redirect(base if action == 'edit' else '/workspace/')
        except (ValidationError, IntegrityError, Conflict) as exc:
            error = str(exc) if isinstance(exc, Conflict) else (' '.join(exc.messages) if isinstance(exc, ValidationError) else 'Dữ liệu bị trùng. Hãy kiểm tra lại.')
            status = 409 if isinstance(exc, Conflict) else 400
    stats = {}
    if is_course:
        from assessment.models import LegacyState
        state = LegacyState.objects.filter(curriculum=record).first()
        docs = state.documents if state else {}
        bank = docs.get('bank', {})
        stats = {'Bài học':len(bank.get('ppct', {}).get('lessons', [])), 'Câu hỏi':len(bank.get('questions', [])),
                 'Đề cương':len(docs.get('revisions', [])), 'Ma trận':len(docs.get('matrices', [])), 'Đề thi':len(docs.get('exams', []))}
    return render(request, 'record_detail.html', dict(record=record, kind=kind, is_course=is_course,
        label=label, base=base, action=action, form=form, error=error, locked=locked, stats=stats,
        related_courses=owned(Curriculum.objects.filter(subject=record), request.user) if not is_course else []), status=status)
