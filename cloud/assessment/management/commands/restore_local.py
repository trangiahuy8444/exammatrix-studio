import json

from django.core.management.base import BaseCommand, CommandError

from assessment.backup import restore_backup


class Command(BaseCommand):
    help = ('Khôi phục dữ liệu ngân hàng và tệp nguồn từ bản sao lưu. Mặc định chỉ in kế hoạch (--dry-run); '
            'thêm --apply để ghi. Bản đang dùng được lưu vào lịch sử phiên bản trước khi ghi đè.')

    def add_arguments(self, parser):
        parser.add_argument('backup')
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument('--dry-run', action='store_true')
        mode.add_argument('--apply', action='store_true')

    def handle(self, *args, **opts):
        try:
            result = restore_backup(opts['backup'], apply=opts['apply'])
        except ValueError as exc:
            raise CommandError(str(exc))
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=1))
