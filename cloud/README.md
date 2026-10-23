# Bản web nhiều tài khoản — đang phát triển

Bản này phục vụ trực tiếp giao diện và các script gốc trong `../public/` tại `/app/`: Tổng quan, Ngân hàng, PPCT, Đề cương, Ma trận và Tạo đề. Đã ghép đăng ký/đăng nhập/đăng xuất, đổi mật khẩu và lớp lưu database theo tài khoản. Không sao chép giao diện thành một sản phẩm thay thế.

Các chức năng cũ chạy qua cùng `BankService`, `MatrixService` và bộ xuất tài liệu. Lớp database tương thích (`LegacyState`) giữ nguyên cấu trúc hồ sơ trong giai đoạn chuyển đổi, có lịch sử trước ghi và giao dịch theo tài khoản; các bảng quan hệ nhiều môn còn cần được nối vào toàn bộ nghiệp vụ. Luồng nhiều môn MC/ES đã nối vào giao diện gốc, gồm dữ liệu mẫu Toán10/Vật lí10; bốn dạng câu và công thức nâng cao còn đang phát triển. Chưa triển khai public hoặc kiểm chứng PostgreSQL thật.

Đăng nhập đi thẳng vào `/app/`. Mục **Môn học & tài khoản** trong giao diện gốc dẫn đến phần thiết lập. Tài khoản mới có ngân hàng trống, không tự nhận dữ liệu hoặc đề thi của chủ website.

## Chạy phát triển

Từ thư mục `cloud/`, dùng môi trường Python riêng:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver 127.0.0.1:8877
```

Mở `/app/` và đăng nhập hoặc đăng ký. Không có mật khẩu quản trị mặc định. Cơ sở dữ liệu phát triển nằm trong `var/development.sqlite3`. Sau chuyển đổi, bản web dùng database; JSON nguồn được giữ để đối chiếu, không tự đồng bộ hai chiều.

## Chuyển dữ liệu web hiện tại

Chỉ sao chép vào tài khoản đã xác định, kiểm tra trước rồi áp dụng:

```sh
.venv/bin/python manage.py import_legacy --owner TEN_TAI_KHOAN --dry-run
.venv/bin/python manage.py import_legacy --owner TEN_TAI_KHOAN --apply
```

Lệnh giữ nguyên JSON nguồn và sao chép tệp ma trận vào vùng riêng của tài khoản. Nhập lặp cùng dữ liệu không tạo bản sao; tài khoản đã có công việc khác sẽ bị từ chối ghi đè. Báo cáo có số lượng, digest và đề thiếu căn cứ. Có thể dùng `--source` và `--bank` để chỉ định nguồn khác.

Kiểm tra:

```sh
.venv/bin/python manage.py test --noinput
.venv/bin/python manage.py makemigrations --check --dry-run
```

## Cấu hình PostgreSQL và production

`DATABASE_URL` nhận PostgreSQL; có thể chỉ định `sslmode` trong query string. Không có URL thì chỉ dùng SQLite cho phát triển. Các kiểm tra SQLite chưa chứng minh khả năng ghi đồng thời PostgreSQL.

Khi `APP_ENV=production`, bắt buộc có `DJANGO_SECRET_KEY` tối thiểu 50 ký tự, `DJANGO_ALLOWED_HOSTS` là các host cụ thể và `DATABASE_URL`. HTTPS và cookie secure được bật. Chỉ đặt `TRUST_HTTPS_PROXY=1` khi máy chủ đứng sau reverse proxy tin cậy đã loại bỏ header giả từ client. Khóa bí mật không được ghi vào tài liệu hoặc source code.

Thư mục `var/private-media` không được phục vụ như static. Bản production còn cần cấu hình triển khai, email phục hồi tài khoản, tác vụ xuất tài liệu, sao lưu/khôi phục, kiểm thử nhiều môn từ đầu đến cuối và nghiệm thu hai tài khoản trên URL thật trước khi bàn giao.

Môn học/chương trình có CRUD, thùng rác và khôi phục tại `/workspace/`. REST hỗ trợ GET/PATCH/DELETE cho `/api/subjects/<id>/` và `/api/curricula/<id>/`, POST tới `.../restore/`. Có thể gửi `expected_revision` để phát hiện thay đổi đồng thời. Chỉ chủ tài khoản được thao tác.
