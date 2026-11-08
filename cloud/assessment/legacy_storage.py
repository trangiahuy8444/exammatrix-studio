"""Reuse the working assessment engine with teacher-scoped database storage."""
import copy
import json
from pathlib import Path
from django.conf import settings
from bank_service import BankService, ServiceError
from workspace.access import workspace_for
from .models import LegacyState, LegacyStateVersion, StoredSource
from django.db.models import Sum
import hashlib
from .models import empty_legacy_documents
from .context import course_context
from domain.test_seed import seed_bank, install_sample, SAMPLE_GRADE

APP_DIR = Path(__file__).resolve().parents[2]


class DatabaseStorage:
    def __init__(self, state, data_dir, context=None):
        self.context = context
        self.state = state
        self.data_dir = Path(data_dir).resolve()
        self.paths = {
            self.data_dir/'bank.json': 'bank', self.data_dir/'exams.json': 'exams',
            self.data_dir/'revisions.json': 'revisions', self.data_dir/'exam_templates.json': 'templates',
            self.data_dir/'matrices/records.json': 'matrices', self.data_dir/'kttx.json': 'kttx',
        }

    def key(self, path):
        key = self.paths.get(Path(path).resolve())
        if key is None:
            raise ServiceError('Không được đọc hoặc ghi ngoài vùng dữ liệu của tài khoản.', status=403)
        return key

    def read(self, path, default=None):
        key = self.key(path)
        value = copy.deepcopy(self.state.documents.get(key, default))
        if key == 'bank' and self.context and isinstance(value, dict):
            value.setdefault('ppct', {})['_context'] = copy.deepcopy(self.context)
            value.setdefault('metadata', {}).update({k:self.context[k] for k in ('subject_name', 'school_year') if k in self.context})
        return value

    def save(self, path, value):
        key = self.key(path)
        # Validate serialization before storing the recovery version.
        json.dumps(value, ensure_ascii=False, allow_nan=False)
        LegacyStateVersion.objects.create(workspace=self.state.workspace, state=self.state,
            revision=self.state.revision, document=key, payload=copy.deepcopy(self.state.documents.get(key)))
        documents = copy.deepcopy(self.state.documents)
        documents[key] = copy.deepcopy(value)
        self.state.documents = documents
        self.state.revision += 1
        self.state.save(update_fields=['documents', 'revision', 'updated_at'])


    def write_source(self, key, raw):
        if len(raw) > getattr(settings, 'PRIVATE_SOURCE_MAX_BYTES', 8*1024*1024):
            raise ServiceError('Tệp nguồn vượt giới hạn 8 MB.')
        existing = StoredSource.objects.filter(state=self.state, key=key).first()
        digest = hashlib.sha256(raw).hexdigest()
        if existing:
            if existing.digest != digest:
                raise ServiceError('Tệp nguồn đã tồn tại với nội dung khác.', status=409)
            return
        total = StoredSource.objects.filter(workspace=self.state.workspace).aggregate(total=Sum('size'))['total'] or 0
        if total + len(raw) > getattr(settings, 'PRIVATE_SOURCE_WORKSPACE_BYTES', 128*1024*1024):
            raise ServiceError('Không gian tệp nguồn của tài khoản đã đạt giới hạn thử nghiệm 128 MB.')
        StoredSource.objects.create(workspace=self.state.workspace, state=self.state, key=key,
            digest=digest, size=len(raw), content=raw)

    def read_source(self, key):
        row = StoredSource.objects.filter(state=self.state, key=key).only('content').first()
        return bytes(row.content) if row is not None else None

    def list_sources(self, prefix):
        return list(StoredSource.objects.filter(state=self.state, key__startswith=prefix).values_list('key', flat=True))


def state_data_dir(state):
    """Thư mục riêng của một ngân hàng; read_source còn đọc tệp nguồn cũ nằm ở đây."""
    directory = Path(settings.MEDIA_ROOT)/str(state.workspace_id)/(
        'curriculum-'+str(state.curriculum_id) if state.curriculum_id else 'legacy')
    return directory/'sandbox' if state.is_test_mode else directory


def bank_for_user(user, curriculum=None, *, test_mode=False):
    """Call inside an atomic transaction with the workspace row locked for writes."""
    workspace = workspace_for(user)
    if curriculum is not None and curriculum.workspace_id != workspace.pk:
        from django.http import Http404
        raise Http404()
    context = course_context(curriculum)
    documents = empty_legacy_documents()
    if curriculum is not None:
        documents['bank']['metadata'].update(subject_name=curriculum.subject.name, school_year=curriculum.school_year)
        documents['bank']['ppct']['_context'] = context
    if test_mode:
        documents = _test_documents(workspace, curriculum, documents)
    state, created = LegacyState.objects.get_or_create(workspace=workspace, curriculum=curriculum, is_test_mode=test_mode,
                                                defaults={'documents': documents})
    directory = state_data_dir(state)
    service = BankService(directory/'bank.json', directory,
                          storage=DatabaseStorage(state, directory, context if curriculum else None), context=context if curriculum else None)
    service.app_dir = APP_DIR
    if test_mode and created:
        _maybe_install_sample(service, context)
    return service


def _test_documents(workspace, curriculum, documents):
    """Vùng Test = bản sao PPCT, câu hỏi và ma trận của ngân hàng thật cùng khóa học; đề, đề cương để trống."""
    normal = LegacyState.objects.filter(workspace=workspace, curriculum=curriculum, is_test_mode=False).only('documents').first()
    if normal is not None and (normal.documents or {}).get('bank'):
        documents = copy.deepcopy(documents)
        documents['bank'] = seed_bank(normal.documents['bank'])
        if (normal.documents or {}).get('matrices'):
            documents['matrices'] = copy.deepcopy(normal.documents['matrices'])
    return documents


def _maybe_install_sample(service, context):
    """Chưa có câu thật: nạp bộ câu mẫu Tin học 10 (chỉ khi khóa học là Tin học và có Khối 10)."""
    if service._load_bank().get('questions'):
        return
    grades = context.get('allowed_grades') if context else None
    if (context or {}).get('subject_name', 'Tin học') != 'Tin học' or (grades and SAMPLE_GRADE not in grades):
        return
    install_sample(service)


def reset_test_bank(user, curriculum=None):
    """Reset only the isolated state, keeping its version history for recovery."""
    service = bank_for_user(user, curriculum, test_mode=True)
    state = service.storage.state
    documents = _test_documents(state.workspace, curriculum, empty_legacy_documents())
    if curriculum is not None:
        documents['bank'].setdefault('ppct', {})['_context'] = course_context(curriculum)
    for key, value in documents.items():
        path = next(p for p, name in service.storage.paths.items() if name == key)
        service.storage.save(path, value)
    StoredSource.objects.filter(state=state).delete()
    service = bank_for_user(user, curriculum, test_mode=True)
    _maybe_install_sample(service, course_context(curriculum) if curriculum else None)
    return service
