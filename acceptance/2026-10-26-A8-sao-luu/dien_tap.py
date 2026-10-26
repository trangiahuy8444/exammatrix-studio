"""Diễn tập sao lưu/khôi phục mốc A8 trên BẢN SAO dữ liệu thật (không ghi vào cloud/var).

Cách chạy:  ~/.venvs/ngan-hang-de-web/bin/python acceptance/2026-10-26-A8-sao-luu/dien_tap.py <thư mục tạm>

1. Chụp CSDL thật bằng SQLite Online Backup API (chỉ đọc) và chép private-media sang thư mục tạm.
2. Migrate bản sao, chạy backup_local + verify_backup.
3. Giả lập sự cố: xóa một nửa câu hỏi và toàn bộ đề của mỗi ngân hàng, xóa tệp nguồn trong CSDL và trên đĩa.
4. restore_local --apply, sao lưu lại lần 2 và so hash từng tài liệu, từng tệp nguồn với lần 1.
Chỉ in số đếm và hash, không in nội dung câu hỏi.
"""
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CLOUD = REPO/'cloud'
PY = sys.executable


def manage(data_dir, *args):
    env = dict(os.environ, CLOUD_DATA_DIR=str(data_dir))
    out = subprocess.run([PY, 'manage.py', *args], cwd=CLOUD, env=env, capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f'manage.py {args[0]} lỗi:\n{out.stderr[-3000:]}')
    return out.stdout


def fingerprint(backup):
    """Hash từng tài liệu của từng ngân hàng (bỏ số revision) và từng tệp nguồn."""
    result = {}
    for path in sorted((backup/'states').glob('*.json')):
        state = json.loads(path.read_text(encoding='utf-8'))
        for name, doc in state['documents'].items():
            result[f'{path.stem}/{name}'] = hashlib.sha256(json.dumps(doc, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        for kind in ('sources', 'disk_sources'):
            for key, digest in state.get(kind, {}).items():
                result[f'{path.stem}/{kind}/{key}'] = digest
    return result


def main(work):
    work = Path(work).resolve()
    if work.exists():
        raise SystemExit('Thư mục tạm phải chưa tồn tại.')
    data = work/'data'; data.mkdir(parents=True)
    src = sqlite3.connect(f'file:{CLOUD/"var"/"development.sqlite3"}?mode=ro', uri=True)
    dst = sqlite3.connect(data/'development.sqlite3')
    src.backup(dst); src.close(); dst.close()
    if (CLOUD/'var'/'private-media').is_dir():
        shutil.copytree(CLOUD/'var'/'private-media', data/'private-media')
    manage(data, 'migrate', '--noinput')

    first = json.loads(manage(data, 'backup_local', '--out', str(work/'bk1')))
    print('Lần 1:', dict(states=first['states'], files=first['files'], verify_ok=first['verify']['ok'],
                         errors=len(first['verify']['errors']), warnings=len(first['verify']['warnings'])))

    incident = '''
from assessment.models import LegacyState, StoredSource
from assessment.legacy_storage import state_data_dir
n_q = n_src = n_disk = 0
for s in LegacyState.objects.all():
    docs = dict(s.documents)
    qs = (docs.get('bank') or {}).get('questions') or []
    if qs:
        docs['bank'] = dict(docs['bank'], questions=qs[: len(qs)//2]); n_q += len(qs) - len(qs)//2
    docs['exams'] = []
    s.documents = docs; s.revision += 1; s.save()
    n_src += StoredSource.objects.filter(state=s).delete()[0]
    folder = state_data_dir(s)/'matrices'/'sources'
    for p in sorted(folder.rglob('*.png'))[:5] if folder.is_dir() else []:
        p.unlink(); n_disk += 1
print(n_q, n_src, n_disk)
'''
    lost = manage(data, 'shell', '-c', incident).strip().splitlines()[-1].split()
    print('Sự cố giả lập: mất', lost[0], 'câu hỏi, toàn bộ đề,', lost[1], 'tệp nguồn CSDL,', lost[2], 'ảnh trang trên đĩa')

    dry = json.loads(manage(data, 'restore_local', str(work/'bk1'), '--dry-run'))
    print('Dry-run: ngân hàng cần khôi phục =', sum(1 for p in dry['plan'] if p.get('documents') or p.get('sources') or p.get('disk_sources')))
    manage(data, 'restore_local', str(work/'bk1'), '--apply')
    second = json.loads(manage(data, 'backup_local', '--out', str(work/'bk2')))
    a, b = fingerprint(work/'bk1'), fingerprint(work/'bk2')
    diff = sorted(k for k in a.keys() | b.keys() if a.get(k) != b.get(k))
    print('Lần 2 verify_ok:', second['verify']['ok'], '| mục so khớp:', len(a), '| lệch:', len(diff))
    for k in diff[:10]:
        print('  lệch:', k)
    return 0 if first['verify']['ok'] and second['verify']['ok'] and not diff else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
