# Review publish/audit — 29/10/2026

**Kết luận: chấp nhận trong phạm vi 5 tệp được giao; không tìm thấy blocker.**

Đối chiếu bản nguồn `ngan-hang-de-web` với snapshot `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`. Review chỉ đọc mã, chạy kiểm thử dữ liệu giả và ghi báo cáo này; không sửa mã, đọc `.env`, sử dụng dữ liệu thật hoặc gọi mạng.

## Phạm vi

- `bank_service.py`
- `cloud/assessment/legacy_views.py`
- `tests/test_exam_lifecycle.py`
- `tests/test_exam_set.py`
- `cloud/tests/test_exam_lifecycle_audit.py` (mới)

## Correctness và giao dịch

- Publish khi nội dung khác `approved_hash` vẫn trả 409. Nhánh single lưu phần lifecycle `publish_blocked` mới trước khi ném lại `ServiceError`; trạng thái, usage và nội dung không bị sửa trong nhánh từ chối này.
- Nhánh set khôi phục `backup` của toàn bộ đề, chỉ ghép thêm sự kiện `publish_blocked` mới. Thành viên đầu đã publish trong bộ nhớ không để lại status, usage, published_at hay lịch sử publish khi thành viên kế tiếp sai hash.
- Django chụp chiều dài lịch sử trước request, chỉ chuyển sự kiện từ chối vừa thêm thành danh sách audit. Response lỗi vẫn kích hoạt rollback ở `original_api`, nên cả `LegacyState.documents`, revision và `LegacyStateVersion` được khôi phục; `AuditEvent` được ghi sau khối giao dịch này.
- Actor của `AuditEvent` lấy từ `request.user`; actor của engine lấy từ `DjangoHandler._actor()`. Giá trị actor giả trong payload không được dùng. Sự kiện trong lịch sử cũ bị loại bằng mốc chiều dài, bao gồm trường hợp 409 do sai trạng thái.
- Thay đổi tập trung vào đường đi publish/audit và kiểm thử tương ứng; không đổi schema, quyền truy cập, câu hỏi hay nội dung đề.

## Kiểm thử đã chạy trong snapshot

Python: `/Users/huytran/.venvs/ngan-hang-de-web/bin/python`. Mỗi lệnh bỏ `DATABASE_URL`, đặt `APP_ENV=development`, `CLOUD_DATA_DIR=/private/tmp/publish-audit-review-data` và `PYTHONDONTWRITEBYTECODE=1`.

1. `PYTHONPATH=.:tests python -m unittest test_exam_lifecycle test_exam_set -q`: **34 tests, OK**.
2. `python cloud/manage.py test cloud.tests.test_exam_lifecycle_audit --verbosity 1`: **3 tests, OK**, system check không có lỗi; Django tạo và hủy cơ sở dữ liệu kiểm thử riêng.

Các assertion mới kiểm tra trạng thái sau lỗi bằng so sánh toàn bộ records/documents, kiểm tra version history không tăng, audit đúng actor/scope/object, request lỗi lặp lại và không phát sinh audit giả từ lịch sử cũ.

## Hiệu năng và giới hạn

Không thấy thay đổi độ phức tạp thành bậc hai hay thêm truy vấn theo từng đề. Có chi phí tuyến tính bổ sung: `legacy_views.py:155–167` đọc/sao chép danh sách đề để lấy mốc lịch sử cho mọi transition, và đọc lại khi 409, trong lúc giữ khóa workspace. Đây là lưu ý tối ưu khi ngân hàng lớn, không phải blocker của bản sửa hẹp này; chưa benchmark tải lớn.

Kết quả này xác nhận 37 kiểm thử mục tiêu trên SQLite development và rà soát tĩnh 5 tệp. Không khẳng định đã chạy toàn bộ bộ kiểm thử, đo hiệu năng hoặc kiểm chứng PostgreSQL/triển khai thực tế.
