import json
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from assessment.backup import create_backup, verify_backup


class Command(BaseCommand):
    help = 'Sao lưu nhất quán CSDL, dữ liệu ngân hàng và tệp nguồn vào một thư mục mới, rồi kiểm tra bản sao lưu.'

    def add_arguments(self, parser):
        parser.add_argument('--out', help='Thư mục đích (phải trống). Mặc định: var/backups/<thời điểm>.')

    def handle(self, *args, **opts):
        out = Path(opts['out'] or Path(getattr(settings, 'DATA_DIR', Path(settings.BASE_DIR)/'var'))/'backups'/datetime.now().strftime('%Y%m%d-%H%M%S'))
        try:
            manifest = create_backup(out)
        except (FileExistsError, ValueError) as exc:
            raise CommandError(str(exc))
        report = verify_backup(out)
        self.stdout.write(json.dumps(dict(backup=str(out), states=len(manifest['states']), files=len(manifest['files']),
                                          database=manifest['database'], verify=report), ensure_ascii=False, indent=1))
        if not report['ok']:
            raise CommandError('Bản sao lưu không qua kiểm tra.')
