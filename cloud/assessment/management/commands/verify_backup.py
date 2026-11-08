import json

from django.core.management.base import BaseCommand, CommandError

from assessment.backup import verify_backup


class Command(BaseCommand):
    help = 'Kiểm tra bản sao lưu: đủ tệp, hash khớp, tệp nguồn được tham chiếu có mặt, CSDL khớp JSON.'

    def add_arguments(self, parser):
        parser.add_argument('backup')

    def handle(self, *args, **opts):
        report = verify_backup(opts['backup'])
        self.stdout.write(json.dumps(report, ensure_ascii=False, indent=1))
        if not report['ok']:
            raise CommandError('Bản sao lưu không hợp lệ.')
