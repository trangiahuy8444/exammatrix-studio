import hashlib
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from .models import AttemptBucket


def consume_attempt(namespace, value, limit, seconds=900):
    key = hashlib.sha256(f'{settings.SECRET_KEY}:{namespace}:{value}'.encode()).hexdigest()
    now = timezone.now()
    with transaction.atomic():
        AttemptBucket.objects.get_or_create(key=key, defaults={'started_at': now})
        bucket = AttemptBucket.objects.select_for_update().get(key=key)
        if now - bucket.started_at >= timedelta(seconds=seconds):
            bucket.started_at, bucket.count = now, 0
        if bucket.count >= limit:
            return False
        bucket.count += 1
        bucket.save(update_fields=['count', 'started_at'])
    return True
