# Biên bản kiểm tra giao diện giữa học kì I — dữ liệu giả

**Thời điểm:** 31/10/2026. **Phạm vi:** Django cục bộ `127.0.0.1:8897`, cơ sở dữ liệu SQLite cách ly trong `/tmp`, Chromium chạy không giao diện. Không dùng dữ liệu ngân hàng đề, tài khoản hoặc máy chủ thật.

## Kết quả

- **13/13** kiểm tra luồng lưu/tải lại và cách ly môn học (Tin học 9, Toán 10, Vật lí 10) đạt. Các lựa chọn biểu mẫu GK1 giữ nguyên sau tải lại; câu hỏi và biểu mẫu không lẫn giữa ba môn.
- **7/7** kiểm tra hiển thị đề Tin học và đề cương có nội dung phong phú đạt. Đề đã sinh được lưu, tải lại, hiển thị bản học sinh và đáp án; đề cương giữ đoạn mã, bảng ba cột và dữ liệu nguồn sau tải lại.
- **11/11** kiểm tra Chromium cuối đạt. Đề Toán giả lập hiển thị bốn dạng MC, Đúng/Sai, SHORT, Tự luận. Câu SHORT trong bản học sinh có số câu, nội dung và điểm nhưng không có đáp án; bản giáo viên hiển thị đáp án chuẩn `7`. Đề cương cũng phân tách đáp án đúng cách và nhãn thống kê đã tính một câu Trả lời ngắn. Bảng A có đúng ba cột `STT | Tên chủ đề | Tên bài`.
- Bộ định dạng bản xem sử dụng khóa lưu mới `tin_doc_fmt_v2`. Dữ liệu thử có dấu `ANSWER-MARKER-OLD-CACHE` ở khóa v1 không thay thế nội dung đề. Trên bảng thường, thêm dòng, xóa dòng và chỉnh độ rộng cột hoạt động; bảng nằm trong nội dung câu hỏi phong phú không bị các lệnh này thay đổi.
- Đề Tin học nguồn giữ thụt đầu dòng Python thường và bảng hai cột. Đề cương phong phú đã lưu giữ khối mã có fence và bảng ba cột. Nội dung nguồn phong phú vẫn khóa chỉnh trực tiếp, hướng người dùng về cửa sổ sửa câu hỏi.

**Kỹ thuật kiểm chứng:** 31/31 mục đạt trong ba lượt báo cáo cuối; không có lỗi JavaScript được ghi nhận và các API quan sát đều trả HTTP 200. Nhật ký tự động: `/tmp/midterm-ui-qa/results.json`, `/tmp/midterm-ui-qa/display-results.json`, `/tmp/midterm-ui-qa/final-results.json`. Ảnh chụp kiểm chứng ở `/tmp/midterm-ui-qa/`, đặc biệt `11-mixed-exam-student.png` đến `14-mixed-revision-answers.png`.

## Ghi nhận để xử lý sau

- Thanh định dạng hiện hỗ trợ tăng/giảm độ rộng cột, thêm/xóa dòng; chưa có nút thêm/xóa cột hay gộp ô. Các thao tác này chưa thuộc lượt kiểm tra hiện tại.

**Lưu ý về lượt thử ban đầu:** Một lần kiểm tra chờ thẻ `<pre>` trong đề Tin học đã sai giả định về fixture: câu trong đề là Python thụt đầu dòng thường, không có fence; bảng nguồn có hai cột. Kịch bản cuối đối chiếu đúng dữ liệu nguồn và thêm kiểm tra riêng đề cương có fence/bảng ba cột. Không có thay đổi sản phẩm để làm qua kiểm tra.
