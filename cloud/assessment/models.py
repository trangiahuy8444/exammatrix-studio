"""Versioned assessment records with explicit ownership and protected references."""
from django.core.exceptions import ValidationError
from django.db import models
from workspace.models import OwnedRecord, Curriculum, Lesson


def empty_legacy_documents():
    return {'bank': {'schema_version': '1.0.0', 'metadata': {},
                     'ppct': {'sources': [], 'lessons': []}, 'questions': []},
            'exams': [], 'revisions': [], 'templates': {'templates': []}, 'matrices': [], 'kttx': []}


class LegacyState(OwnedRecord):
    """Transactional compatibility storage while normalizing the existing app.

    Never seeded from the owner's private files for a new registration.
    """
    documents = models.JSONField(default=empty_legacy_documents)
    curriculum = models.ForeignKey(Curriculum, null=True, blank=True, on_delete=models.PROTECT)
    is_test_mode = models.BooleanField(default=False)
    revision = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['workspace', 'is_test_mode'], condition=models.Q(curriculum__isnull=True), name='one_original_bank_per_workspace'),
            models.UniqueConstraint(fields=['workspace', 'curriculum', 'is_test_mode'], name='one_bank_per_curriculum'),
        ]

    def clean(self):
        self.check_related_workspace('curriculum')


class LegacyStateVersion(OwnedRecord):
    state = models.ForeignKey(LegacyState, on_delete=models.PROTECT, related_name='history')
    revision = models.PositiveIntegerField()
    document = models.CharField(max_length=30)
    payload = models.JSONField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['state', 'revision'], name='unique_legacy_state_backup')]

    def clean(self):
        self.check_related_workspace('state')


class CurriculumRecord(OwnedRecord):
    curriculum = models.ForeignKey(Curriculum, on_delete=models.PROTECT, related_name='assessment_%(class)s_records')
    revision = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=[
        ('draft', 'Nháp'), ('review', 'Chờ kiểm tra'), ('approved', 'Đã kiểm tra'),
        ('locked', 'Đã khóa'), ('archived', 'Lưu trữ')], default='draft')

    class Meta:
        abstract = True

    def clean(self):
        self.check_related_workspace('curriculum')


class Question(CurriculumRecord):
    lesson = models.ForeignKey(Lesson, on_delete=models.PROTECT)
    kind = models.CharField(max_length=10, choices=[('MC', 'Trắc nghiệm'), ('YN', 'Đúng/Sai'),
                                                 ('SHORT', 'Trả lời ngắn'), ('ES', 'Tự luận')])
    level = models.CharField(max_length=30)
    source_id = models.CharField(max_length=150, blank=True)

    def clean(self):
        super().clean()
        self.check_related_workspace('lesson')
        if self.lesson_id and self.curriculum_id and self.lesson.curriculum_id != self.curriculum_id:
            raise ValidationError({'lesson': 'Bài không thuộc chương trình đã chọn.'})


class QuestionVersion(OwnedRecord):
    question = models.ForeignKey(Question, on_delete=models.PROTECT, related_name='versions')
    version = models.PositiveIntegerField()
    payload = models.JSONField()
    digest = models.CharField(max_length=64)
    hash_schema = models.CharField(max_length=30, default='question-v2')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['question', 'version'], name='unique_question_version')]

    def clean(self):
        self.check_related_workspace('question')

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError('Phiên bản câu hỏi đã lưu không được ghi đè; hãy tạo phiên bản mới.')
        return super().save(*args, **kwargs)


class Matrix(CurriculumRecord):
    title = models.CharField(max_length=250)
    family_id = models.UUIDField()
    version = models.PositiveIntegerField(default=1)
    source_core_digest = models.CharField(max_length=64, blank=True)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['workspace', 'family_id', 'version'], name='unique_matrix_version')]


class Revision(CurriculumRecord):
    title = models.CharField(max_length=250)
    payload = models.JSONField(default=dict, blank=True)


class Exam(CurriculumRecord):
    title = models.CharField(max_length=250)
    code = models.CharField(max_length=60, blank=True)
    matrix = models.ForeignKey(Matrix, on_delete=models.PROTECT)
    revision_basis = models.ForeignKey(Revision, on_delete=models.PROTECT)
    matrix_snapshot = models.JSONField()
    revision_snapshot = models.JSONField()
    payload = models.JSONField()

    def clean(self):
        super().clean()
        for field in ['matrix', 'revision_basis']:
            self.check_related_workspace(field)
            if getattr(self, field + '_id', None) and self.curriculum_id:
                if getattr(self, field).curriculum_id != self.curriculum_id:
                    raise ValidationError({field: 'Căn cứ không thuộc chương trình của đề thi.'})


class StoredSource(OwnedRecord):
    """Small private source files survive web-host restarts in the same database."""
    state = models.ForeignKey(LegacyState, on_delete=models.PROTECT, related_name='source_files')
    key = models.CharField(max_length=250)
    digest = models.CharField(max_length=64)
    size = models.PositiveBigIntegerField()
    content = models.BinaryField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['state', 'key'], name='unique_source_key_in_bank')]

    def clean(self):
        self.check_related_workspace('state')
