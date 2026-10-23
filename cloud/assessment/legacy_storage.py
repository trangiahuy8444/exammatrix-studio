"""Reuse the working assessment engine with teacher-scoped database storage."""
import copy
import json
from pathlib import Path
from django.conf import settings
from bank_service import BankService, ServiceError
from workspace.access import workspace_for
from .models import LegacyState, LegacyStateVersion
from .models import empty_legacy_documents
from .context import course_context

APP_DIR = Path(__file__).resolve().parents[2]


class DatabaseStorage:
    def __init__(self, state, data_dir, context=None):
        self.context = context
        self.state = state
        self.data_dir = Path(data_dir).resolve()
        self.paths = {
            self.data_dir/'bank.json': 'bank', self.data_dir/'exams.json': 'exams',
            self.data_dir/'revisions.json': 'revisions', self.data_dir/'exam_templates.json': 'templates',
            self.data_dir/'matrices/records.json': 'matrices',
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


def bank_for_user(user, curriculum=None):
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
    state, _ = LegacyState.objects.get_or_create(workspace=workspace, curriculum=curriculum,
                                                defaults={'documents': documents})
    directory = Path(settings.MEDIA_ROOT)/str(workspace.pk)/('curriculum-'+str(curriculum.pk) if curriculum else 'legacy')
    service = BankService(directory/'bank.json', directory,
                          storage=DatabaseStorage(state, directory, context if curriculum else None), context=context if curriculum else None)
    service.app_dir = APP_DIR
    return service
