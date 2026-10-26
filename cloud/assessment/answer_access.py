"""Quyền xem đáp án trên bản Django (mốc B2).

Mặc định chủ tài khoản xem được đáp án của mình. Thêm tài khoản vào nhóm ANSWERS_DENIED_GROUP (trong trang quản trị)
để chặn mọi đường lấy đáp án và hướng dẫn chấm của tài khoản đó.
"""
ANSWERS_DENIED_GROUP = 'khong_xem_dap_an'


def can_view_answers(user):
    return bool(user and user.is_authenticated and user.is_active
                and not user.groups.filter(name=ANSWERS_DENIED_GROUP).exists())
