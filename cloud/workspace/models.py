"""Teacher-owned curriculum data. Codes are unique within their own scope."""
import uuid
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Workspace(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='workspace')
    created_at = models.DateTimeField(auto_now_add=True)


class OwnedRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def check_related_workspace(self, field):
        if getattr(self, field + '_id', None) and self.workspace_id:
            if getattr(self, field).workspace_id != self.workspace_id:
                raise ValidationError({field: 'Dữ liệu liên kết không thuộc không gian của giáo viên này.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


def subject_competencies(name, code):
    math = str(name).casefold() in ('toán', 'toán học', 'mathematics', 'math') or code in ('toan', 'toan-hoc', 'math')
    return ['TDLL', 'MHH', 'GQVĐ', 'GT', 'SDCC'] if math else ['NL_CHUNG']


class Subject(OwnedRecord):
    code = models.SlugField(max_length=60)
    name = models.CharField(max_length=150)
    competencies = models.JSONField(default=list, blank=True)
    archived = models.BooleanField(default=False)
    revision = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['workspace', 'code'], name='unique_subject_in_workspace')]
        ordering = ['name']

    def save(self, *args, **kwargs):
        if self._state.adding and not self.competencies:
            self.competencies = subject_competencies(self.name, self.code)
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.name


def default_policy():
    return {'id': 'general', 'minimum_revision_percent': 90, 'total_points': 10}


class Curriculum(OwnedRecord):
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT)
    title = models.CharField(max_length=200)
    grade = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    school_year = models.CharField(max_length=9)
    book = models.CharField(max_length=150, blank=True)
    policy = models.JSONField(default=default_policy)
    revision = models.PositiveIntegerField(default=1)
    archived = models.BooleanField(default=False)

    def clean(self):
        import re
        self.check_related_workspace('subject')
        if self.subject_id and self.subject.archived and not self.archived:
            raise ValidationError({'subject': 'Môn học đã ở trong thùng rác. Hãy khôi phục môn trước.'})
        if not re.fullmatch(r'\d{4}-\d{4}', self.school_year or ''):
            raise ValidationError({'school_year': 'Nhập năm học dạng 2026-2027.'})
        start, end = map(int, self.school_year.split('-'))
        if end != start + 1:
            raise ValidationError({'school_year': 'Hai năm học phải liên tiếp.'})
        from domain.policies import resolve_similarity
        from bank_service import ServiceError
        try:
            if not isinstance(self.policy, dict):
                raise ValueError()
            minimum = self.policy['minimum_revision_percent']
            resolve_similarity(minimum, self.policy)
            if self.policy.get('id') == 'asian-school':
                resolve_similarity(minimum)
        except (KeyError, ValueError, TypeError, ServiceError) as exc:
            raise ValidationError({'policy': 'Chính sách đánh giá không hợp lệ.'}) from exc

    def __str__(self):
        return f'{self.subject.name} {self.grade} — {self.title}'


class Lesson(OwnedRecord):
    curriculum = models.ForeignKey(Curriculum, on_delete=models.PROTECT, related_name='lessons')
    code = models.CharField(max_length=60)
    topic = models.CharField(max_length=300)
    title = models.CharField(max_length=300)
    order = models.PositiveIntegerField(default=0)
    occurrences = models.JSONField(default=list, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['curriculum', 'code'], name='unique_lesson_in_curriculum')]
        ordering = ['order', 'code']

    def clean(self):
        self.check_related_workspace('curriculum')

    def __str__(self):
        return f'{self.code}. {self.title}'


class Outcome(OwnedRecord):
    lesson = models.ForeignKey(Lesson, on_delete=models.PROTECT, related_name='outcomes')
    text = models.TextField()
    level = models.CharField(max_length=30, blank=True)
    competency = models.CharField(max_length=100, blank=True)
    order = models.PositiveIntegerField(default=0)

    def clean(self):
        self.check_related_workspace('lesson')


class AuditEvent(OwnedRecord):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=60)
    object_id = models.CharField(max_length=100)
    details = models.JSONField(default=dict, blank=True)

    def clean(self):
        if self.workspace_id and self.actor_id != self.workspace.owner_id:
            if not self.actor.is_staff:
                raise ValidationError({'actor': 'Không được ghi hoạt động của giáo viên khác.'})
