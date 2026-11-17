---
name: nghiem-thu-he-thong
description: >-
  Sử dụng skill này khi cần thực hiện quy trình nghiệm thu độc lập một mốc phát triển trong docs/LO_TRINH.md.
  Hướng dẫn chạy 4 bộ kiểm thử (Engine unittest, Django suite, makemigrations check, Node frontend),
  kiểm tra tính toàn vẹn SHA-256 dữ liệu thật, thống kê test skip và lập biên bản nghiệm thu mốc
  tại acceptance/<YYYY-MM-DD>-<moc>/BIEN_BAN.md.
---

Đọc `docs/QUY_TRINH_AGENTS.md` và phiếu liên quan trong `docs/KE_HOACH_HOAT_DONG_AGENTS.md` để xác định phạm vi, quyền ghi và tiêu chí bàn giao trước khi áp dụng quy trình.


# Quy trình Nghiệm thu Hệ thống & Lập Biên bản (nghiem-thu-he-thong)

Skill này hướng dẫn quy trình nghiệm thu tiêu chuẩn trước khi chuyển giao một mốc tính năng trong lộ trình phát triển.

Đọc `docs/QUY_TRINH_AGENTS.md` trước khi chạy: xác định Python, thư mục làm việc và đường dẫn dữ liệu thực.

## 1. Các Lệnh Kiểm thử Bắt buộc

Phải chạy đầy đủ 4 bộ kiểm thử theo thứ tự và ghi nhận log đầu ra:

```sh
# Bộ 1: Kiểm thử toàn bộ Lõi Engine
.venv/bin/python -m unittest discover -s tests

# Bộ 2: Kiểm thử Ứng dụng Web Django (cloud)
(cd cloud && ../.venv/bin/python manage.py test --noinput)

# Bộ 3: Kiểm tra tính toàn vẹn và đồng bộ CSDL (Migrations)
(cd cloud && ../.venv/bin/python manage.py makemigrations --check --dry-run)

# Bộ 4: Kiểm thử Logic Frontend (Node.js)
node tests/frontend.test.cjs && node tests/matrices_frontend.test.cjs
```

## 2. Kiểm tra Tính toàn vẹn Dữ liệu Thật

Trước và sau khi chạy kiểm thử, phải đo mã băm SHA-256 của các tệp dữ liệu thật để bảo đảm không xảy ra tình trạng test tự ý ghi đè vào dữ liệu cá nhân của giáo viên:

```sh
# Kiểm tra mã băm ngân hàng câu hỏi gốc
shasum -a 256 "../06_Kiem_tra_va_Danh_gia/01_Ngan_hang_cau_hoi/03_Ngan_hang_mo_rong_HK1_2026_10_21/NGAN_HANG_CAU_HOI_HK1_V1.json"

# Kiểm tra cơ sở dữ liệu SQLite cục bộ (nếu có)
shasum -a 256 cloud/var/development.sqlite3
```

## 3. Lập Biên bản Nghiệm thu (`BIEN_BAN.md`)

1. Tạo thư mục nghiệm thu theo ngày và tên mốc: `acceptance/<YYYY-MM-DD>-<ten_moc>/`.
2. Soạn thảo tệp `BIEN_BAN.md` dựa theo mẫu chuẩn tại `acceptance/README.md`.
3. Bảng phân tích phải chỉ rõ:
   - Tổng số test, số test Đạt, Thất bại, Bị lỗi.
   - Danh sách chi tiết các ca test bị BỎ QUA (`skipTest`) kèm nguyên nhân.
   - Bảng đối chiếu từng tiêu chí trong `docs/LO_TRINH.md`.
4. Cập nhật 1 dòng tóm tắt vào đầu file `docs/NHAT_KY.md`.
5. **Cảnh báo:** Tuyệt đối không tự ý tích chọn `[x]` vào `docs/LO_TRINH.md`. Quyết định đánh dấu hoàn thành thuộc về giáo viên sau khi phê duyệt biên bản.
