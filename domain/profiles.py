"""Mẫu hồ sơ kiểm tra (mốc B3): dạng câu được phép theo mẫu, thay cho việc khóa cứng theo cấp học.

- THCS: mẫu hiện hành của trường cho Khối 8, 9 — trắc nghiệm nhiều lựa chọn và tự luận (tổ xác nhận 26/10/2026).
- THPT: theo CV 7991/BGDĐT-GDTrH — nhiều lựa chọn, Đúng/Sai, trả lời ngắn, tự luận.
- GENERAL: môn khác ngoài mẫu trường — mọi dạng.
Hồ sơ KTTX hoặc tùy chỉnh ghi `allowed_kinds` do giáo viên chọn; danh sách này lưu cùng ma trận và đề.
"""
from domain.errors import ServiceError

KINDS = ('MC', 'YN', 'SHORT', 'ES')
PROFILE_KINDS = {'THCS': ('MC', 'ES'), 'THPT': KINDS, 'GENERAL': KINDS}
KIND_LABELS = {'MC': 'nhiều lựa chọn', 'YN': 'Đúng/Sai', 'SHORT': 'trả lời ngắn', 'ES': 'tự luận'}


def allowed_kinds(record):
    chosen = (record or {}).get('allowed_kinds')
    if chosen is None:
        return PROFILE_KINDS.get((record or {}).get('profile'), KINDS)
    if not isinstance(chosen, list) or not chosen or any(k not in KINDS for k in chosen):
        raise ServiceError('Danh sách dạng câu được phép không hợp lệ (chỉ gồm MC, YN, SHORT, ES).')
    return tuple(k for k in KINDS if k in chosen)


def default_profile_for_grade(grade):
    return 'THPT' if isinstance(grade, int) and grade >= 10 else 'THCS'
