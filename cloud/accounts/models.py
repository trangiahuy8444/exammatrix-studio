from django.db import models


class AttemptBucket(models.Model):
    key = models.CharField(primary_key=True, max_length=64)
    started_at = models.DateTimeField()
    count = models.PositiveIntegerField(default=0)
