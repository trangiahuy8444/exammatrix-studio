"""Tạo PDF: chuyển từ tệp Word bằng Microsoft Word (mặc định), hoặc biên dịch LaTeX an toàn (mốc A6).

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


# --- PDF từ chính tệp Word (giáo viên chọn ngày 26/10/2026) ---------------------------------
# Bản PDF đã nộp được xuất thẳng từ Word; để PDF giống hệt Word, ứng dụng nhờ Microsoft Word trên
# máy chuyển .docx sang .pdf. Tệp tạm đặt trong vùng chứa (sandbox) của Word nên Word mở được mà
# không hỏi quyền, và bị xóa ngay sau khi chuyển. Máy không có Word (ví dụ Render) thì báo lỗi rõ.
import threading

WORD_APP = Path('/Applications/Microsoft Word.app')
WORD_CONTAINER = Path.home()/'Library'/'Containers'/'com.microsoft.Word'/'Data'
WORD_TIMEOUT_SECONDS = 120
_word_lock = threading.Lock()  # Word chỉ chuyển từng tệp một

_APPLESCRIPT = '''on run argv
    set src to item 1 of argv
    set dst to item 2 of argv
    tell application "Microsoft Word"
        open (POSIX file src)
        set d to active document
        try
            save as d file name dst file format format PDF
        on error msg
            close d saving no
            error msg
        end try
        close d saving no
    end tell
end run'''


def find_word():
    return WORD_APP if WORD_APP.exists() and shutil.which('osascript') else None


def docx_to_pdf(raw: bytes) -> bytes:
    if not find_word():
        raise ServiceError('Máy chủ không có Microsoft Word nên chưa xuất được PDF. Hãy tải bản Word (.docx) '
                           'rồi lưu thành PDF, hoặc xuất PDF trên máy có cài Word.', status=400)
    WORD_CONTAINER.mkdir(parents=True, exist_ok=True)
    with _word_lock, tempfile.TemporaryDirectory(prefix='ngan_hang_pdf_', dir=WORD_CONTAINER) as tmp:
        src, dst = Path(tmp)/'tai_lieu.docx', Path(tmp)/'tai_lieu.pdf'
        src.write_bytes(raw)
        try:
            proc = subprocess.run(['osascript', '-e', _APPLESCRIPT, str(src), str(dst)], capture_output=True,
                                  text=True, timeout=WORD_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired as exc:
            raise ServiceError('Microsoft Word chuyển PDF quá thời gian cho phép.', status=422) from exc
        if proc.returncode != 0 or not dst.exists():
            detail = re.sub(r'/\S+', '…', (proc.stderr or '').strip())[:300]
            raise ServiceError('Microsoft Word không chuyển được tệp sang PDF.', {'loi': detail}, 422)
        return dst.read_bytes()
