from django.db import models
from workspace.models import OwnedRecord


class Attachment(OwnedRecord):
    storage_key = models.CharField(max_length=250)
    digest = models.CharField(max_length=64)
    name = models.CharField(max_length=250)
    content_type = models.CharField(max_length=150)
    size = models.PositiveBigIntegerField()


class ExportJob(OwnedRecord):
    status = models.CharField(max_length=20, choices=[('queued', 'Đang chờ'), ('running', 'Đang xuất'),
                                                    ('succeeded', 'Hoàn tất'), ('failed', 'Lỗi')], default='queued')
    request = models.JSONField()
    output = models.ForeignKey(Attachment, null=True, blank=True, on_delete=models.PROTECT)
    error = models.CharField(max_length=500, blank=True)

    def clean(self):
        self.check_related_workspace('output')


class DocumentTemplate(OwnedRecord):
    name = models.CharField(max_length=250)
    public = models.BooleanField(default=False)
    payload = models.JSONField()
