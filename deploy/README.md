# Triển khai thử nghiệm: Render + Neon PostgreSQL

Địa chỉ bản dùng thử đã ghi nhận: [Ngân hàng đề](https://ngan-hang-de-web.onrender.com/).

Cấu hình triển khai hướng tới Render Free và Neon Free. Trạng thái hiện tại của dịch vụ, migration trên database thật và các luồng nghiệp vụ online cần kiểm tra tại môi trường đích; tài liệu này không xác nhận đã nghiệm thu toàn bộ Mốc B/C. Log kiểm thử cục bộ ngày 29/10/2026 có `No changes detected` khi kiểm tra migration; kết quả đó không chứng minh migration đã áp dụng trên Neon hay CSDL cục bộ thật.

Mã nguồn nằm trong repository GitHub riêng tư. Render chạy Django; Neon giữ tài khoản, dữ liệu của từng giáo viên và tệp nguồn Word/ảnh. Không dùng GitHub Pages cho ứng dụng Django này.

## 1. Tạo cơ sở dữ liệu Neon

1. Đăng nhập Neon, tạo project ở gói **Free** và chọn vùng gần Singapore nếu có.
2. Lấy connection string PostgreSQL cho nhánh chính, dùng kết nối trực tiếp (không bật pooling cho cấu hình này).
3. Giữ `sslmode=require` hoặc chế độ kiểm tra TLS mạnh hơn trong URL. Không đưa URL chứa mật khẩu vào GitHub, ảnh chụp hay tin nhắn.

## 2. Tạo web trên Render

1. Đăng nhập Render và kết nối đúng repository `trangiahuy8444/ngan-hang-de-web`. Khi cấp quyền GitHub, chỉ chọn repository cần thiết.
2. Tạo **Blueprint** từ nhánh `main`. Render đọc `render.yaml` ở thư mục gốc.
3. Xác nhận web service là gói **Free**. Không thêm database Render hay persistent disk trả phí.
4. Điền connection string của Neon vào biến bí mật `DATABASE_URL` khi Render yêu cầu.
5. Triển khai. Hai phần khóa Django được Render tự tạo; giữ nguyên cả hai qua các lần triển khai. Hostname Render được tự thêm vào cấu hình HTTPS và CSRF.

Build cài thư viện, thu thập static và kiểm tra production. Khởi động áp dụng migration trước khi chạy Gunicorn. GitHub Actions phải đạt trước khi tự động triển khai bản cập nhật.

Nếu thêm tên miền riêng, đặt `DJANGO_ALLOWED_HOSTS` là danh sách hostname phân cách bằng dấu phẩy và `DJANGO_CSRF_TRUSTED_ORIGINS` là các địa chỉ `https://...` tương ứng. Không dùng wildcard.

## 3. Kiểm tra sau triển khai

- `/healthz` trả 200 (kiểm tra tiến trình, không truy vấn database).
- Trang đăng nhập có giao diện đầy đủ và dùng HTTPS.
- Đăng ký tài khoản thử, tạo môn học/chương trình, thêm và sửa một câu hỏi, tải đề Word.
- Đăng nhập bằng tài khoản thứ hai: không truy cập được dữ liệu tài khoản thứ nhất.
- Nhập một ma trận Word, khởi động lại service rồi kiểm tra lại dữ liệu và tệp nguồn.

Bản trên mạng bắt đầu với database mới. Tài khoản, đề thi thật và dữ liệu local không tự được tải lên. Mỗi giáo viên tự đăng ký và dùng không gian riêng. Việc chuyển dữ liệu local cần thực hiện riêng, có bản sao lưu và chọn đúng chủ sở hữu.

Dữ liệu mẫu Toán/Vật lí có thể nạp cho một tài khoản cụ thể bằng lệnh quản trị `python cloud/manage.py seed_subject_samples --owner TEN_TAI_KHOAN --apply` trong môi trường có cùng `DATABASE_URL`. Không nạp dữ liệu thật qua Git.

## Giới hạn thử nghiệm

- Render Free có thể ngủ khi không dùng; lần mở tiếp theo có thể chờ khởi động. Ổ đĩa web là tạm thời.
- Tệp nguồn được lưu trong PostgreSQL: tối đa 8 MB/tệp và 128 MB/tài khoản. Cần theo dõi dung lượng tổng theo hạn mức Neon trước khi mời thêm người dùng.
- Cấu hình định dạng lưu trong trình duyệt chưa đồng bộ giữa thiết bị. Dữ liệu câu hỏi, đề và ma trận được lưu trên server.
- Email mặc định dùng console: thư chỉ ghi ra đầu ra máy chủ, chưa gửi thư khôi phục mật khẩu thật. Cần cấu hình nhà cung cấp và kiểm thử riêng trước khi sử dụng.
- Bản online vẫn xuất DOCX. Nhánh chuyển Word sang PDF cần máy cục bộ có Microsoft Word, `osascript` và quyền tự động hóa phù hợp; chưa xác nhận chạy được trên Render.
- Bộ 1–6 đề theo ma trận và các mã hoán vị 101–104 của từng đề là hai thao tác riêng. ZIP có số tệp thay đổi theo số mã, định dạng và thành phần xuất được; xem báo cáo đóng gói trong ZIP.
- Cần xuất bản sao lưu PostgreSQL định kỳ và thử phục hồi trước khi dùng cho dữ liệu quan trọng.

Tài liệu nhà cung cấp: [Render Blueprint](https://render.com/docs/blueprint-spec), [Render Free](https://render.com/docs/free), [Neon connections](https://neon.com/docs/connect/connect-from-any-app).
