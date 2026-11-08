"""Sao lưu cục bộ nhất quán (mốc A8).

Một bản sao lưu là một thư mục:
- `db.sqlite3`: bản chụp CSDL bằng SQLite Online Backup API (`sqlite3.Connection.backup`), không sao chép tệp
  khi CSDL đang chạy. Với PostgreSQL thì không có tệp này (dùng pg_dump/Neon ở mốc D).
- `states/<id>.json`: tài liệu `LegacyState` của từng ngân hàng (câu hỏi, đề, phiên bản, ma trận).
- `sources/<state id>/<key>`: tệp nguồn `StoredSource` (Word ma trận, ảnh trang).
- `disk/<state id>/<key>`: tệp nguồn cũ nằm trên đĩa (MEDIA_ROOT), mà `read_source` vẫn đọc khi CSDL không có.
- `manifest.json`: danh sách tệp kèm SHA-256, số đếm, các tham chiếu tệp nguồn.

Toàn bộ được đọc trong một transaction và cùng một kết nối, nên CSDL, JSON và tệp nguồn khớp nhau tại một thời điểm.
"""
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from django.db import connection, transaction

from .legacy_storage import state_data_dir
from .models import LegacyState, LegacyStateVersion, StoredSource

FORMAT = 'ngan-hang-de-backup-v1'


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def _safe_key(key):
    path = PurePosixPath(key)
    if path.is_absolute() or '..' in path.parts or not path.parts:
        raise ValueError(f'Khóa tệp nguồn không hợp lệ: {key!r}')
    return path


def referenced_sources(documents):
    """Khóa tệp nguồn mà dữ liệu đang tham chiếu: Word gốc của từng ma trận đã nhập."""
    keys = set()
    for record in documents.get('matrices') or []:
        digest = ((record or {}).get('source') or {}).get('sha256')
        if isinstance(digest, str) and len(digest) == 64:
            keys.add(f'matrices/sources/{digest}.docx')
    return keys


def disk_sources(state):
    """Tệp .docx/.png trong vùng matrices/sources/ của thư mục ngân hàng (cùng phạm vi với BankService.list_sources)."""
    base = state_data_dir(state)
    folder = base/'matrices'/'sources'
    if not folder.is_dir():
        return {}
    return {str(PurePosixPath(p.relative_to(base))): p for p in sorted(folder.rglob('*'))
            if p.is_file() and p.suffix.lower() in ('.docx', '.png') and not any(x.startswith('.') for x in p.relative_to(base).parts)}


def _write(root, rel, raw, files):
    target = root/rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    files[str(PurePosixPath(rel))] = dict(sha256=sha256(raw), size=len(raw))


def create_backup(out_dir):
    root = Path(out_dir)
    if root.exists() and any(root.iterdir()):
        raise FileExistsError(f'Thư mục sao lưu phải trống: {root}')
    root.mkdir(parents=True, exist_ok=True)
    files, states, missing = {}, [], []
    with transaction.atomic():
        rows = list(LegacyState.objects.select_related('workspace__owner', 'curriculum').order_by('id'))
        sources = list(StoredSource.objects.order_by('state_id', 'key'))
        database = dict(engine=connection.vendor, included=False)
        if connection.vendor == 'sqlite':
            connection.ensure_connection()
            target = sqlite3.connect(root/'db.sqlite3')
            try:
                connection.connection.backup(target)
            finally:
                target.close()
            raw = (root/'db.sqlite3').read_bytes()
            files['db.sqlite3'] = dict(sha256=sha256(raw), size=len(raw))
            database['included'] = True
        else:
            database['note'] = 'PostgreSQL: dùng pg_dump hoặc bản sao lưu Neon (mốc D).'
        by_state = {}
        for src in sources:
            raw = bytes(src.content)
            if sha256(raw) != src.digest:
                raise ValueError(f'Tệp nguồn {src.key} trong CSDL đã hỏng (hash không khớp).')
            _write(root, Path('sources')/str(src.state_id)/_safe_key(src.key), raw, files)
            by_state.setdefault(src.state_id, {})[src.key] = src.digest
        for state in rows:
            on_disk = {}
            for key, path in disk_sources(state).items():
                raw = path.read_bytes()
                _write(root, Path('disk')/str(state.id)/_safe_key(key), raw, files)
                on_disk[key] = sha256(raw)
            payload = dict(id=str(state.id), workspace=str(state.workspace_id), owner=state.workspace.owner.get_username(),
                           curriculum=str(state.curriculum_id) if state.curriculum_id else None,
                           is_test_mode=state.is_test_mode, revision=state.revision, documents=state.documents,
                           sources=by_state.get(state.id, {}), disk_sources=on_disk)
            _write(root, Path('states')/f'{state.id}.json',
                   json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=1).encode('utf-8'), files)
            for key in sorted(referenced_sources(state.documents) - set(payload['sources']) - set(on_disk)):
                missing.append(dict(state=str(state.id), key=key))
            states.append(dict(id=str(state.id), revision=state.revision, owner=payload['owner'],
                               questions=len((state.documents.get('bank') or {}).get('questions') or []),
                               exams=len(state.documents.get('exams') or []), sources=len(payload['sources']),
                               disk_sources=len(on_disk)))
    manifest = dict(format=FORMAT, created_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),
                    database=database, states=states, files=files,
                    missing_at_backup=missing, versions=LegacyStateVersion.objects.count())
    (root/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    return manifest


def verify_backup(backup_dir):
    """Trả về {'ok', 'errors', 'warnings', 'checked'}; không sửa gì."""
    root = Path(backup_dir)
    errors, warnings = [], []
    try:
        manifest = json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        return dict(ok=False, errors=[f'Không đọc được manifest.json: {exc}'], warnings=[], checked=0)
    if manifest.get('format') != FORMAT:
        errors.append('Sai định dạng bản sao lưu.')
    files = manifest.get('files') or {}
    for rel, meta in files.items():
        path = root/_safe_key(rel)
        if not path.is_file():
            errors.append(f'Thiếu tệp: {rel}'); continue
        if sha256(path.read_bytes()) != meta.get('sha256'):
            errors.append(f'Hash không khớp: {rel}')
    on_disk = {str(PurePosixPath(p.relative_to(root))) for p in root.rglob('*') if p.is_file()} - {'manifest.json'}
    for extra in sorted(on_disk - set(files)):
        warnings.append(f'Tệp không có trong manifest: {extra}')
    declared_missing = {(m['state'], m['key']) for m in manifest.get('missing_at_backup') or []}
    for m in sorted(declared_missing):
        warnings.append(f'Ngân hàng {m[0]} tham chiếu {m[1]} nhưng tệp đã không có từ trước khi sao lưu.')
    for summary in manifest.get('states') or []:
        rel = f"states/{summary['id']}.json"
        try:
            state = json.loads((root/rel).read_text(encoding='utf-8'))
        except (OSError, ValueError):
            errors.append(f'Không đọc được {rel}'); continue
        if state.get('revision') != summary.get('revision'):
            errors.append(f'{rel}: số phiên bản lệch manifest.')
        for key, digest in (state.get('sources') or {}).items():
            src_rel = str(PurePosixPath('sources', summary['id'], key))
            if files.get(src_rel, {}).get('sha256') != digest:
                errors.append(f'Tệp nguồn {key} của {summary["id"]} thiếu hoặc sai hash.')
            if key.endswith('.docx') and PurePosixPath(key).stem != digest and len(PurePosixPath(key).stem) == 64:
                errors.append(f'Tệp nguồn {key}: tên theo hash không khớp nội dung.')
        for key, digest in (state.get('disk_sources') or {}).items():
            if files.get(str(PurePosixPath('disk', summary['id'], key)), {}).get('sha256') != digest:
                errors.append(f'Tệp nguồn trên đĩa {key} của {summary["id"]} thiếu hoặc sai hash.')
        available = set(state.get('sources') or {}) | set(state.get('disk_sources') or {})
        for key in referenced_sources(state.get('documents') or {}):
            if key not in available and (summary['id'], key) not in declared_missing:
                errors.append(f'Ngân hàng {summary["id"]} tham chiếu {key} nhưng bản sao lưu không có.')
    if (manifest.get('database') or {}).get('included'):
        errors.extend(_verify_sqlite(root/'db.sqlite3', manifest))
    return dict(ok=not errors, errors=errors, warnings=warnings, checked=len(files))


def _verify_sqlite(path, manifest):
    errors = []
    try:
        db = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    except sqlite3.Error as exc:
        return [f'Không mở được db.sqlite3: {exc}']
    try:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            errors.append('db.sqlite3 không qua integrity_check.')
        table = LegacyState._meta.db_table
        rows = {str(r[0]).replace('-', ''): r[1] for r in db.execute(f'SELECT id, revision FROM "{table}"')}
        for s in manifest.get('states') or []:
            if rows.get(s['id'].replace('-', '')) != s['revision']:
                errors.append(f'db.sqlite3 và JSON lệch nhau ở ngân hàng {s["id"]}.')
        if len(rows) != len(manifest.get('states') or []):
            errors.append('db.sqlite3 và JSON có số ngân hàng khác nhau.')
    finally:
        db.close()
    return errors


def restore_backup(backup_dir, apply=False):
    """Khôi phục tài liệu và tệp nguồn của các ngân hàng còn tồn tại trong CSDL hiện tại.

    Mỗi tài liệu bị ghi đè được lưu lại trong LegacyStateVersion trước, nên chính lần khôi phục cũng hoàn tác được.
    Khôi phục toàn bộ CSDL (kể cả tài khoản) thì dừng máy chủ rồi chép `db.sqlite3` về chỗ cũ.
    """
    report = verify_backup(backup_dir)
    if not report['ok']:
        raise ValueError('Bản sao lưu không hợp lệ: ' + '; '.join(report['errors'][:5]))
    root = Path(backup_dir)
    manifest = json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    plan = []
    with transaction.atomic():
        for summary in manifest['states']:
            data = json.loads((root/'states'/f"{summary['id']}.json").read_text(encoding='utf-8'))
            state = LegacyState.objects.select_for_update().filter(pk=data['id']).first()
            if state is None:
                plan.append(dict(state=data['id'], action='bỏ qua: không có trong CSDL hiện tại')); continue
            changed = sorted(k for k, v in data['documents'].items() if state.documents.get(k) != v)
            current = {s.key: s for s in StoredSource.objects.filter(state=state)}
            wanted = data.get('sources') or {}
            source_changes = sorted(k for k, d in wanted.items() if k not in current or current[k].digest != d)
            extra = sorted(set(current) - set(wanted))
            disk_base = state_data_dir(state)
            disk_wanted = data.get('disk_sources') or {}
            disk_changes = sorted(k for k, d in disk_wanted.items()
                                  if not (disk_base/_safe_key(k)).is_file() or sha256((disk_base/_safe_key(k)).read_bytes()) != d)
            # Tệp nguồn thêm sau thời điểm sao lưu được giữ lại, chỉ báo cáo (không xóa dữ liệu).
            plan.append(dict(state=data['id'], owner=data['owner'], documents=changed, sources=source_changes, disk_sources=disk_changes,
                             kept_newer_sources=extra))
            if not apply:
                continue
            for key in changed:  # như DatabaseStorage.save: mỗi tài liệu một phiên bản lịch sử
                LegacyStateVersion.objects.create(workspace=state.workspace, state=state, revision=state.revision,
                                                  document=key, payload=state.documents.get(key))
                state.documents = dict(state.documents, **{key: data['documents'][key]})
                state.revision += 1
                state.save(update_fields=['documents', 'revision', 'updated_at'])
            for key in source_changes:
                raw = (root/'sources'/data['id']/_safe_key(key)).read_bytes()
                StoredSource.objects.update_or_create(state=state, key=key, defaults=dict(
                    workspace=state.workspace, digest=sha256(raw), size=len(raw), content=raw))
            for key in disk_changes:
                target = disk_base/_safe_key(key)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((root/'disk'/data['id']/_safe_key(key)).read_bytes())
        if not apply:
            transaction.set_rollback(True)
    return dict(applied=apply, plan=plan)
