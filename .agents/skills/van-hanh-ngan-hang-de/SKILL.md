---
name: van-hanh-ngan-hang-de
description: >-
  Sử dụng skill này khi cần khởi động máy chủ (Django / legacy server), chạy migration cơ sở dữ liệu,
  nạp dữ liệu mẫu minh họa (Toán 10, Vật lí 10), thực hiện sao lưu (backup_local) và khôi phục
  (restore_local), hoặc xác thực tính toàn vẹn của bản sao lưu (verify_backup).
---

Đọc `docs/QUY_TRINH_AGENTS.md` và phiếu liên quan trong `docs/KE_HOACH_HOAT_DONG_AGENTS.md` để xác định phạm vi, quyền ghi và tiêu chí bàn giao trước khi áp dụng quy trình.


# Hướng dẫn Vận hành Môi trường Ngân hàng đề (van-hanh-ngan-hang-de)

Skill này cung cấp các lệnh chuẩn để quản trị, vận hành và sao lưu phục hồi hệ thống ngân hàng đề trên máy cục bộ hoặc máy chủ.

## 1. Khởi động Máy chủ

### Máy chủ Django (Khuyên dùng)
```sh
# Cài đặt thư viện môi trường ảo
python3 -m venv .venv
.venv/bin/python -m pip install -r cloud/requirements.lock

# Chạy di chuyển cấu trúc CSDL
cd cloud
../.venv/bin/python manage.py migrate

# Khởi động máy chủ phát triển
../.venv/bin/python manage.py runserver 127.0.0.1:8877
```
Mở trình duyệt: `http://127.0.0.1:8877/accounts/signup/` để đăng ký tài khoản và truy cập hệ thống.

### Máy chủ Legacy Localhost (Nếu sử dụng kho dữ liệu cũ)
```sh
python3 start.py
# Hoặc click đúp file MO_NGAN_HANG_DE.command trên macOS
```

## 2. Nạp Dữ liệu Mẫu (Seed Samples)

Dữ liệu mẫu giúp khởi tạo nhanh 2 chương trình Toán 10 và Vật lí 10 với 24 câu hỏi mẫu, đề cương, ma trận và đề thi minh họa mà không làm lộ dữ liệu thật:

```sh
cd cloud
# Chạy thử nghiệm để kiểm tra (dry-run)
../.venv/bin/python manage.py seed_subject_samples --owner <TEN_TAI_KHOAN> --dry-run

# Áp dụng nạp dữ liệu chính thức
../.venv/bin/python manage.py seed_subject_samples --owner <TEN_TAI_KHOAN> --apply
```

## 3. Sao lưu & Khôi phục Dữ liệu Cục bộ

Quy trình sao lưu snapshot cơ sở dữ liệu SQLite, tài liệu JSON `LegacyState` và các tệp nguồn:

```sh
cd cloud
# 1. Thực hiện sao lưu
../.venv/bin/python manage.py backup_local --out /duong/dan/thu_muc_backup

# 2. Kiểm tra tính toàn vẹn của bản sao lưu
../.venv/bin/python manage.py verify_backup /duong/dan/thu_muc_backup

# 3. Khôi phục dữ liệu từ bản sao lưu (chạy thử nghiệm trước)
../.venv/bin/python manage.py restore_local /duong/dan/thu_muc_backup --dry-run

# 4. Áp dụng khôi phục chính thức
../.venv/bin/python manage.py restore_local /duong/dan/thu_muc_backup --apply
```
