# Kế hoạch triển khai web quản lí ngân hàng đề cục bộ

**Mục tiêu:** Quản lí câu hỏi theo PPCT và tạo đề có kiểm tra ma trận, điểm, độ phủ đề cương; dùng riêng trên máy thầy Huy.

**Kiến trúc:** Một ứng dụng riêng trong `ngan-hang-de-web`, không sửa cổng học liệu học sinh. Máy chủ Python chỉ nhận kết nối tại `127.0.0.1:8765`; giao diện HTML/CSS/JS chạy trong trình duyệt. JSON là dữ liệu gốc trong workspace; Excel, Word và tệp nhập LMS là bản xuất.

**Thiết kế và API:** [THIET_KE.md](THIET_KE.md).

## Phạm vi bản đầu

- Ngân hàng 360 câu mới theo ba khối, bao gồm 36 câu mẫu đã được thầy duyệt.
- Tìm kiếm, lọc, xem đáp án và YCCĐ; thêm, sửa, lưu trữ mềm câu hỏi.
- PPCT chỉ đọc và hiển thị theo từng khối, tuần, tiết, bài, YCCĐ.
- Tạo đề cương từ danh sách câu đã chọn; lưu phiên bản nội dung được dùng để đối chiếu.
- Tạo đề theo bài, loại câu, mức độ và điểm; ma trận gốc 8/10 không được sửa qua giao diện.
- Nếu nguồn ma trận mâu thuẫn hoặc loại câu chưa được hỗ trợ thì báo rõ và dừng tạo đề đó, không tự thay số liệu.
- Kiểm tra tổng 10 điểm, số câu từng ô, không trùng câu và ít nhất 90% câu trùng nội dung phiên bản đề cương đã lưu.
- Lưu lịch sử đề; xuất Word đề học sinh, Word đáp án, JSON và bản in.
- Sao lưu trước thay đổi, ghi dữ liệu nguyên tử; không lưu duy nhất trong bộ nhớ trình duyệt.

## Thứ tự thực hiện và kiểm chứng

1. Hoàn tất ngân hàng JSON và kiểm tra nguồn PPCT, số lượng theo bài, đáp án, thang điểm; giữ bản gốc cũ.
2. Trích ma trận gốc thành cấu hình có nguồn, mã kiểm tra tệp và trạng thái sử dụng; ghi rõ những trường hợp mâu thuẫn.
3. Viết kiểm tra hành vi trước khi làm máy chủ: thiếu câu, sai điểm, trùng, không đạt 90%, câu bị sửa sau đề cương, ghi/lưu trữ mềm và sao lưu.
4. Làm máy chủ và các chức năng xuất; chạy lại toàn bộ kiểm tra đến khi đạt.
5. Làm giao diện theo hợp đồng API; kiểm tra bộ lọc, nhập câu, lưu đề cương, tạo đề và thông báo lỗi.
6. Kiểm tra xuyên suốt bằng bản dữ liệu sao chép; không tạo các đề thử vào lịch sử làm việc thật.
7. Kiểm tra giao diện trong trình duyệt, đọc lại Word xuất, hướng dẫn mở ứng dụng và sao lưu.

## Năm trường hợp cần kiểm tra kỹ

1. Không đủ câu ở một bài/mức độ: báo đúng phần thiếu, không bù sang ô khác.
2. Đủ 90% theo số mã nhưng nội dung đã thay đổi: mã không đủ, phải đối chiếu dấu vết nội dung phiên bản đề cương.
3. Đảo phương án: đáp án và giải thích đi theo đúng phương án; đề học sinh không lộ đáp án.
4. Nhập JSON hoặc lưu thất bại: không mất ngân hàng đang dùng, có bản sao lưu và thông báo rõ.
5. Ma trận có nội dung mâu thuẫn hoặc dạng Đúng/Sai chưa hỗ trợ: không xuất một đề được gắn nhãn đạt ma trận.

## Trạng thái ngày 21/10/2026

Thầy đã duyệt thiết kế và cho triển khai bản đầu. Các bước 1–7 đã thực hiện; kết quả và giới hạn được ghi tại [KIEM_TRA.md](KIEM_TRA.md). Mở ứng dụng bằng `MO_NGAN_HANG_DE.command`; hướng dẫn tại `../README.md`.
