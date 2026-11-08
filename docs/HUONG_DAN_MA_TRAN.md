# Ma trận & bảng đặc tả dùng chung

Bản đầu ngày 21/10/2026, dùng riêng trên máy thầy. Nếu ứng dụng đang chạy từ trước khi cập nhật, dừng cửa sổ chạy bằng Ctrl+C rồi mở lại `MO_NGAN_HANG_DE.command`; tải lại trang để thấy tab **Ma trận & đặc tả**.

## Biên soạn khối 9

1. Chọn **+ Biên soạn khối 9**, nhập người phụ trách, cơ sở, năm học, kỳ và thời gian.
2. Thêm bài theo PPCT đúng khối. Thêm yêu cầu cần đạt cụ thể, mức độ, năng lực và chọn YCCĐ nguồn tương ứng trong PPCT. Chỉ báo được chọn thay thế phải khai báo rõ; không mặc nhiên coi mọi yêu cầu là tương đương.
3. Thêm phân bố: dạng câu, yêu cầu kiểm tra, số câu mẹ, số ý và điểm. Gán từng vị trí/ý cho đúng gạch đầu dòng. Số tiêu chí trong hướng dẫn chấm khác với số ý kiểm tra.
4. **Lưu bản nháp**, rồi **Kiểm tra hồ sơ đã lưu**. Sửa các lỗi về bài, yêu cầu, số câu/ý, mã năng lực và tổng 10 điểm. **Xem trước toàn bộ bảng** để đối chiếu.
5. Sau khi tổ thực sự thống nhất, mở phần xác nhận, ghi người xác nhận, ngày, căn cứ và chọn **Khóa phiên bản này**. Kiểm tra kỹ thuật không thay quyết định của tổ trưởng.

## Nhận ma trận của giáo viên phụ trách khối 8/10

Chọn **Nhận bản thống nhất** rồi chọn Word theo hai mẫu trường hoặc gói JSON xuất từ chức năng này. Với Word, chọn đúng khối trước khi chọn tệp. Xem kết quả nhận dạng, sau đó lưu bản nhận để đối chiếu.

Ứng dụng chỉ nhận các bảng ma trận, đặc tả, phân bố năng lực và mã chỉ báo; không đưa phần đề/đáp án kèm theo Word vào gói dùng chung. Tệp gốc được giữ riêng trong dữ liệu nội bộ. Nội dung yêu cầu, mức độ, năng lực, số lượng và điểm nguồn được bảo vệ; thầy đối chiếu bài/YCCĐ trong PPCT và gán số câu vào đúng yêu cầu. Không gán câu sang bài, mức độ hoặc năng lực khác để bù số lượng.

Hai tệp mẫu thầy cung cấp đã được dùng để kiểm chứng bộ đọc, chưa đưa hồ sơ thử vào dữ liệu làm việc thật. Thầy có thể chọn lại hai tệp trong Downloads để bắt đầu hồ sơ nhận.

**Mẫu khối 10 hiện chưa thống nhất:** bảng ma trận có 9 ý tự luận, nhưng các ô đặc tả cộng thành 12 ý; phần đặc tả chủ đề đạo đức/pháp luật ghi thêm 3 ES. Dòng tổng đặc tả cũng không khớp chi tiết. Ứng dụng giữ nguyên nguồn, báo lỗi và chặn khóa. Cần giáo viên phụ trách cung cấp bản nguồn đã xác minh; nhập bản mới để tiếp tục, không có nút bỏ qua lỗi.

## Xuất và trao đổi

- **Word trọn bộ**, **Word ma trận**, **Word đặc tả**: bảng ngang, Times New Roman, rộng tối đa 23,8 cm, tiêu đề cột lặp khi sang trang. Mẫu THPT gồm cả bảng năng lực và mã chỉ báo.
- Bảng ma trận ghi `(1, 2)` hoặc `(1a, 1b)`; bảng đặc tả gắn `(Câu 1, Câu 2).` vào cuối yêu cầu. Cột đếm không chứa số câu.
- Bản nhận chưa đối chiếu xong xuất dưới tên **NHAP**, giữ nguyên các bảng nguồn để không làm mất bất đồng. Chỉ bản đã đối chiếu mới dựng lại bảng từ phân bố và bổ sung số câu.
- **Gói dữ liệu dùng chung** lưu ma trận, đặc tả và chỉ báo dưới dạng JSON; không có câu hỏi, đáp án hay lịch sử đề riêng. Có thể gửi gói cho đồng nghiệp bằng cách thầy tự chọn kênh trao đổi. Phiên bản bên gửi được giữ trong thông tin nguồn, không gộp hai phiên bản chỉ vì cùng tệp Word.
- Bản đã khóa được giữ nguyên. Chọn **Tạo phiên bản mới** để điều chỉnh; đề đã tạo vẫn gắn phiên bản cũ. Lưu trữ hồ sơ sẽ ngừng dùng bản đó để tạo đề mới.

## Tạo đề riêng cho cơ sở

Mở bản đã khóa → **Dùng tạo đề riêng**. Nhập tên đề, cơ sở, mã đề và chọn phiên bản đề cương đúng khối. Chọn câu cho từng vị trí hoặc dùng gợi ý; xem nội dung, đáp án/hướng dẫn chấm rồi đánh dấu đã đối chiếu từng chỉ báo. Đổi câu sẽ xóa xác nhận của vị trí đó.

Máy chủ kiểm tra lại đúng dạng/bài/mức độ/YCCĐ, không trùng câu, đủ điểm và ít nhất 90% số câu khớp nội dung đề cương đã lưu. Bản đầu kiểm chứng bằng nội dung trùng chính xác; chưa tự đánh giá câu diễn đạt lại là “bám sát”. Thiếu câu phù hợp phải bổ sung ngân hàng, không chuyển sang ô khác. Có Word học sinh và Word đáp án riêng; cơ sở/mã đề được ghi trong đề riêng.

**Giới hạn bản đầu:** bộ tạo đề hỗ trợ MC và ES trong phạm vi ánh xạ đã kiểm tra. Ma trận có Đúng/Sai hoặc trả lời ngắn vẫn quản lí/xuất được, nhưng chưa tạo đề tự động; tự luận ghép nhiều bài hoặc nhiều mức độ cũng cần biên soạn riêng. Không tự đổi dạng hay bỏ phần thi. Xuất PDF chuẩn XeLaTeX và tự gom/đồng bộ đầy đủ gói nộp kỳ thi chưa thuộc chức năng này.

Dữ liệu ma trận lưu trong `data/matrices/records.json`; Word nguồn trong `data/matrices/sources/`. Sao lưu cả ngân hàng JSON và thư mục `data` khi chuyển máy. Gói JSON dùng chung không thay bản sao lưu toàn bộ ứng dụng.
