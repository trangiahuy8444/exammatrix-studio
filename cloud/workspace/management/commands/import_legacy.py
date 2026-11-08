"""Copy an existing local bank into one explicit account, never every signup."""
import copy
import hashlib
import json
from pathlib import Path
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from assessment.legacy_storage import APP_DIR, bank_for_user
from assessment.models import LegacyState, LegacyStateVersion, empty_legacy_documents
from server import DEFAULT_BANK
from workspace.access import workspace_for
from workspace.models import Workspace


def load(path, default):
    if not path.is_file():
        return copy.deepcopy(default)
    try:
        return json.loads(path.read_text(), parse_constant=lambda v: (_ for _ in ()).throw(ValueError(v)))
    except (OSError, ValueError) as exc:
        raise CommandError(f'Không đọc được JSON hợp lệ: {path.name}') from exc


class Command(BaseCommand):
    help = 'Sao chép dữ liệu web hiện có vào đúng một tài khoản; nguồn được giữ nguyên.'

    def add_arguments(self, parser):
        parser.add_argument('--source', default=str(APP_DIR))
        parser.add_argument('--bank', default=str(DEFAULT_BANK))
        parser.add_argument('--owner', required=True)
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument('--dry-run', action='store_true')
        group.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        user = get_user_model().objects.filter(username=options['owner'], is_active=True).first()
        if user is None:
            raise CommandError('Tài khoản nhận dữ liệu không tồn tại hoặc đã bị khóa.')
        source, bank_path = Path(options['source']).resolve(), Path(options['bank']).resolve()
        if not bank_path.is_file():
            raise CommandError('Không tìm thấy ngân hàng JSON nguồn.')
        documents = empty_legacy_documents()
        documents['bank'] = load(bank_path, None)
        if not isinstance(documents['bank'], dict) or not isinstance(documents['bank'].get('ppct'), dict):
            raise CommandError('Ngân hàng nguồn thiếu PPCT hợp lệ.')
        for key, filename in [('exams', 'exams.json'), ('revisions', 'revisions.json'),
                              ('templates', 'exam_templates.json'), ('matrices', 'matrices/records.json')]:
            documents[key] = load(source/'data'/filename, documents[key])
        for key in ['exams', 'revisions', 'matrices']:
            if not isinstance(documents[key], list) or any(not isinstance(r, dict) for r in documents[key]):
                raise CommandError(f'Danh sách {key} không hợp lệ.')
        questions = documents['bank'].get('questions')
        if not isinstance(questions, list) or any(not isinstance(q, dict) for q in questions):
            raise CommandError('Danh sách câu hỏi không hợp lệ.')
        for key, records in [('questions', questions)] + [(k, documents[k]) for k in ['exams', 'revisions', 'matrices']]:
            ids = [r.get('id') for r in records]
            if any(not isinstance(i, str) or not i for i in ids) or len(ids) != len(set(ids)):
                raise CommandError(f'Mã định danh trống hoặc trùng trong {key}.')
        revision_ids = {r['id'] for r in documents['revisions']}
        missing = [e['id'] for e in documents['exams'] if e.get('revision_id') not in revision_ids]
        digest = hashlib.sha256(json.dumps(documents, sort_keys=True, ensure_ascii=False,
                                          allow_nan=False).encode()).hexdigest()
        source_files = []
        source_root = source/'data/matrices/sources'
        if source_root.is_dir():
            for path in source_root.rglob('*'):
                if path.is_file():
                    if not path.resolve().is_relative_to(source_root.resolve()) or path.is_symlink():
                        raise CommandError('Tệp nguồn liên kết ra ngoài thư mục không được nhập.')
                    if path.suffix.lower() not in {'.docx', '.png'}:
                        continue
                    source_files.append((path, path.relative_to(source_root)))
            if sum(p.stat().st_size for p, _ in source_files) > 128 * 1024 * 1024:
                raise CommandError('Tổng tệp nguồn vượt giới hạn 128 MB của lần nhập này.')
        report = {'counts': {'questions': len(questions), **{k: len(documents[k]) for k in ['exams', 'revisions', 'matrices']}},
                  'source_digest': digest, 'source_files': len(source_files),
                  'missing_revision_exams': missing, 'can_apply': not missing, 'applied': False}
        if not options['dry_run']:
            if missing:
                raise CommandError('Một số đề thiếu phiên bản đề cương nguồn; chạy --dry-run để xem mã cần đối chiếu.')
            with transaction.atomic():
                workspace = workspace_for(user)
                Workspace.objects.select_for_update().get(pk=workspace.pk)
                service = bank_for_user(user)
                state = service.storage.state
                existing_digest = state.documents.get('_import_digest')
                if existing_digest == digest:
                    report['unchanged'] = True
                elif state.documents != empty_legacy_documents():
                    raise CommandError('Tài khoản đã có dữ liệu; không ghi đè công việc hiện có.')
                else:
                    # Store source files durably with the same teacher-owned bank.
                    for path, relative in source_files:
                        service.write_source('matrices/sources/'+relative.as_posix(), path.read_bytes())
                    LegacyStateVersion.objects.create(workspace=workspace, state=state,
                        revision=state.revision, document='all', payload=copy.deepcopy(state.documents))
                    state.documents = copy.deepcopy(documents)
                    state.documents['_import_digest'] = digest
                    state.revision += 1
                    state.save(update_fields=['documents', 'revision', 'updated_at'])
                    report['applied'] = True
        self.stdout.write(json.dumps(report, ensure_ascii=False))
