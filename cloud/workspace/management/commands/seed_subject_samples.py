"""Explicit, additive installation into one teacher account."""
import json
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from assessment.sample_packs.seed import seed_samples


class Command(BaseCommand):
    help = 'Thêm hai bộ mẫu Toán 10 và Vật lí 10 vào một tài khoản; chạy lại không ghi đè.'

    def add_arguments(self, parser):
        parser.add_argument('--owner', required=True)
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument('--dry-run', action='store_true')
        group.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        user = get_user_model().objects.filter(username=options['owner'], is_active=True).first()
        if user is None:
            raise CommandError('Tài khoản nhận không tồn tại hoặc đã bị khóa.')
        if options['dry_run']:
            result = dict(owner=user.username, mode='dry-run', packs=['Toán 10', 'Vật lí 10'],
                per_pack=dict(lessons=3, questions=24, MC=18, ES=6, revisions=1, draft_matrices=1, exams=1))
        else:
            result = dict(owner=user.username, mode='apply', packs=seed_samples(user))
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
