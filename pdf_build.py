"""Biên dịch LaTeX → PDF an toàn (mốc A6).

- Thư mục tạm cô lập, xóa sau khi xong; không bao giờ nằm trong public/.
- `-no-shell-escape` và `openout_any=p`: tài liệu không chạy lệnh hệ thống, không ghi tệp ra ngoài thư mục tạm.
- Chạy 2 lượt để "Trang X/Y" đúng (rule 03); mỗi lượt giới hạn thời gian.
- Máy chủ không có XeLaTeX thì báo lỗi rõ ràng (Render không có XeLaTeX).
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from bank_service import ServiceError

TIMEOUT_SECONDS = 60
FALLBACK_PATHS = ('/Library/TeX/texbin/xelatex', '/usr/bin/xelatex', '/usr/local/bin/xelatex')


def find_xelatex():
    found = shutil.which('xelatex')
    if found:
        return found
    return next((p for p in FALLBACK_PATHS if Path(p).exists()), None)


def compile_latex(tex: str, passes: int = 2) -> bytes:
    xelatex = find_xelatex()
    if not xelatex:
        raise ServiceError('Máy chủ không có XeLaTeX nên chưa xuất được PDF. Hãy tải tệp LaTeX (.tex) '
                           'hoặc xuất PDF trên máy có cài TeX.', status=400)
    env = dict(os.environ, openout_any='p', shell_escape='f')
    with tempfile.TemporaryDirectory(prefix='ngan_hang_pdf_') as tmp:
        work = Path(tmp)
        (work / 'tai_lieu.tex').write_text(tex, encoding='utf-8')
        for _ in range(passes):
            try:
                proc = subprocess.run([xelatex, '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error',
                                       'tai_lieu.tex'], cwd=work, env=env, capture_output=True,
                                      timeout=TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired as exc:
                raise ServiceError('Biên dịch PDF quá thời gian cho phép.', status=422) from exc
            if proc.returncode != 0:
                log = (work / 'tai_lieu.log').read_text(encoding='utf-8', errors='replace') \
                    if (work / 'tai_lieu.log').exists() else ''
                errors = [line.strip() for line in log.splitlines() if line.startswith('!')][:3]
                errors = [re.sub(r'/\S+', '…', e) for e in errors]  # không lộ đường dẫn máy chủ
                raise ServiceError('Không biên dịch được PDF.', {'loi': errors}, 422)
        pdf = work / 'tai_lieu.pdf'
        if not pdf.exists():
            raise ServiceError('Không tạo được tệp PDF.', status=422)
        return pdf.read_bytes()
