"""Teacher-owned catalogue CRUD with reversible deletion and conflict checks."""
from django.core.exceptions import ValidationError
from django.db import transaction
from .access import get_owned, workspace_for
from .models import Workspace, Subject, Curriculum, AuditEvent, subject_competencies


class Conflict(Exception):
    pass


def has_content(course):
    from assessment.models import LegacyState
    state = LegacyState.objects.filter(curriculum=course, workspace=course.workspace).first()
    if state:
        docs = state.documents
        bank = docs.get('bank', {})
        if bank.get('questions') or bank.get('ppct', {}).get('lessons') or any(
                docs.get(key) for key in ['exams', 'revisions', 'matrices']):
            return True
    return course.lessons.exists() or any(getattr(course, name).exists() for name in (
        'assessment_question_records', 'assessment_matrix_records', 'assessment_revision_records', 'assessment_exam_records'))


def _version(record, data):
    expected = data.get('expected_revision')
    if expected is not None and str(expected) != str(record.revision):
        raise Conflict('Nội dung đã được thay đổi ở nơi khác. Tải lại trang trước khi lưu.')


@transaction.atomic
def change_record(user, kind, pk, action, data=None):
    data = data or {}
    workspace = workspace_for(user)
    Workspace.objects.select_for_update().get(pk=workspace.pk)
    model = Subject if kind == 'subjects' else Curriculum
    record = get_owned(model.objects.select_for_update(), user, pk)
    _version(record, data)
    if action == 'delete':
        if kind == 'subjects' and Curriculum.objects.filter(subject=record, archived=False).exists():
            raise Conflict('Môn học còn chương trình đang sử dụng. Hãy xóa các chương trình đó trước.')
        record.archived = True
    elif action == 'restore':
        if kind == 'curricula' and record.subject.archived:
            raise Conflict('Hãy khôi phục môn học trước khi khôi phục chương trình.')
        record.archived = False
    else:
        if record.archived:
            raise Conflict('Khôi phục mục trong thùng rác trước khi sửa.')
        if kind == 'subjects':
            if not record.competencies:
                record.competencies = subject_competencies(record.name, record.code)
            for field in ['name', 'code']:
                if field in data:
                    setattr(record, field, data[field])
        else:
            subject = record.subject
            if 'subject_id' in data:
                subject = get_owned(Subject.objects.filter(archived=False), user, data['subject_id'])
            changes_identity = (subject.pk != record.subject_id or any(
                field in data and data[field] != getattr(record, field) for field in ['grade', 'school_year']))
            if changes_identity and has_content(record):
                raise Conflict('Chương trình đã có nội dung. Giữ nguyên môn, khối và năm học để bảo toàn hồ sơ; hãy tạo chương trình mới cho lớp hoặc năm khác.')
            record.subject = subject
            for field in ['title', 'grade', 'school_year', 'book']:
                if field in data:
                    setattr(record, field, data[field])
    record.revision += 1
    record.save()
    AuditEvent.objects.create(workspace=workspace, actor=user, action=f'{kind}_{action}',
        object_id=str(record.pk), details={'revision':record.revision})
    return record
