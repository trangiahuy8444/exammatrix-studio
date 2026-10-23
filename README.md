# Ngân hàng đề và ma trận kiểm tra

Web Django dành cho giáo viên: quản lý môn học, chương trình, bài học/YCCĐ, ngân hàng câu hỏi, đề cương, ma trận và đề kiểm tra. Mỗi tài khoản và mỗi chương trình có ngân hàng riêng. Giao diện được phát triển tiếp từ ứng dụng Tin học hiện có.

## Chạy trên máy

Cần Python 3.12 trở lên. Từ thư mục dự án:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r cloud/requirements.lock
cd cloud
../.venv/bin/python manage.py migrate
../.venv/bin/python manage.py runserver 127.0.0.1:8877
```

Mở `http://127.0.0.1:8877/accounts/signup/` để tạo tài khoản. Không có mật khẩu mặc định. Tại **Môn học & tài khoản**, tạo chương trình rồi mở ngân hàng. Dữ liệu phát triển nằm trong `cloud/var/`, được loại khỏi Git.

## Chức năng

- Tạo, xem chi tiết, sửa, xóa và khôi phục môn/chương trình. Xóa chương trình chuyển vào thùng rác, giữ nội dung bên trong. Chương trình đã có nội dung giữ nguyên môn, khối và năm học; có thể sửa tên và bộ sách.
- Thêm/sửa/xóa bài và YCCĐ, bảo vệ liên kết đang có câu hỏi hoặc ma trận.
- Soạn, xem, sửa, nhân bản, lưu trữ/khôi phục và xóa câu MC/ES.
- Lưu, xem, sửa, nhân bản và xóa đề cương/đề thi. Hồ sơ dùng làm căn cứ cho đề đang lưu được bảo vệ khỏi xóa.
- Soạn, xem, sửa, nhân bản, khóa, tạo phiên bản và xóa ma trận; xuất Word, HTML và tệp LMS.
- Tạo đề theo bài/dạng/mức độ, tổng 10 điểm và đối chiếu một phiên bản đề cương xác định. Hồ sơ đã lưu giữ nội dung riêng, không tự đổi theo câu hỏi trong ngân hàng.

## Dữ liệu mẫu

Sau khi tạo tài khoản, từ thư mục `cloud/`:

```sh
../.venv/bin/python manage.py seed_subject_samples --owner TEN_TAI_KHOAN --dry-run
../.venv/bin/python manage.py seed_subject_samples --owner TEN_TAI_KHOAN --apply
```

Hai bộ Toán10 và Vật lí10, mỗi bộ có 3 bài, 24 câu có đáp án (18MC/6ES), một đề cương, một ma trận nháp và một đề mẫu 10 điểm. Chạy lại giữ nguyên các bộ và chỉnh sửa đã có. Nội dung tự biên soạn minh họa; giáo viên rà soát trước khi dùng chính thức.

## Kiểm tra

```sh
cd cloud
../.venv/bin/python manage.py test --noinput
../.venv/bin/python manage.py makemigrations --check --dry-run
cd ..
.venv/bin/python -m unittest discover -s tests
node tests/frontend.test.cjs
node tests/matrices_frontend.test.cjs
```

Các ca tích hợp cần hồ sơ riêng của giáo viên tự bỏ qua khi không có dữ liệu nguồn. Kho này chỉ chứa mã nguồn và dữ liệu mẫu; không chứa ngân hàng thật, database, tệp tải lên, bản sao lưu hoặc thông tin đăng nhập.

## Đưa web lên mạng

GitHub lưu mã nguồn. GitHub Pages không chạy Django hoặc PostgreSQL; cần thêm dịch vụ chạy máy chủ, PostgreSQL và lưu trữ tệp bền vững. Chưa có bản triển khai công khai trong kho này.

Cấu hình production đọc từ biến môi trường: `APP_ENV=production`, `DJANGO_SECRET_KEY` (ít nhất 50 ký tự ngẫu nhiên), `DJANGO_ALLOWED_HOSTS`, `DATABASE_URL`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `CLOUD_DATA_DIR`. Xem [hướng dẫn cấu hình](cloud/README.md). Không ghi khóa bí mật vào Git. Không chạy máy chủ phát triển cho bản public.

Bộ lưu hiện dùng lớp tương thích JSON có giao dịch trong database; việc nối toàn bộ các bảng quan hệ còn đang tiếp tục. GENERAL hỗ trợ tạo đề MC/ES; Đúng/Sai, trả lời ngắn và soạn công thức nâng cao chưa hoàn tất. Định dạng chỉnh trên bản xem hiện lưu theo trình duyệt/tài khoản, chưa đồng bộ định dạng lên máy chủ. PostgreSQL production và sao lưu/khôi phục cần kiểm tra trước khi mở cho giáo viên dùng thử.

`start.py` và `MO_NGAN_HANG_DE.command` là công cụ chạy phiên bản localhost cũ; chỉ hoạt động khi có nguồn ngân hàng riêng trên máy, không cần cho bản Django mới.
