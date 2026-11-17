# Bàn giao đợt hoàn thiện chức năng giữa học kì đa môn

Ngày 31/10/2026. Ưu tiên Tin học → Toán → Vật lí. Đã tích hợp 13 tệp mã/kiểm thử sau rà soát độc lập, kiểm mã trước sửa và lưu bản dự phòng. Không commit, triển khai hoặc thay dữ liệu thật. Toàn bộ dữ liệu kiểm thử tự biên soạn; không làm nội dung CK1.

## Chức năng đã sửa

- Kiểm định tính đủ MC, Đúng/Sai, trả lời ngắn và tự luận, gồm tổng điểm và mức độ. Đề có SHORT không còn bị tính thiếu 2 điểm.
- Câu Đúng/Sai được chọn tay từ ma trận với xác nhận đủ từng ý giữ liên kết, điểm, mức và YCCĐ theo bằng chứng đóng băng. Thiếu hoặc bị sửa metadata không được kết luận đạt. Không tự bịa xác nhận cho câu nhập hoặc sinh tự động chưa có bằng chứng.
- Bộ đề tự động giữ vị trí nguồn để tạo mã 101–104. Bản chụp lịch sử thiếu metadata cũ vẫn dùng được theo liên kết đóng băng; không phụ thuộc PPCT hiện hành và không nới kiểm tra sai slot/điểm.
- Xuất Word/HTML giữ thụt dòng mã nguồn. Khối mã có dấu hàng rào được trình bày đơn cách; bảng văn bản hợp lệ thành bảng Word. Nội dung hoặc cú pháp chưa nhận diện giữ nguyên văn và HTML được escape.
- Cửa sổ biên soạn có Chèn mã, Chèn bảng và xem trước. Bản đề/đề cương hiện đủ bốn dạng câu cùng số câu, điểm và đáp án theo chế độ HS/GV. Bản học sinh không dựng phần đáp án, rubric hay chính sách chấm.
- Nội dung mã/bảng nguồn được bảo vệ khỏi các lệnh định dạng làm đổi dữ liệu; bảng thường vẫn chỉnh được. Bảng A của đề cương có đúng ba cột STT, Tên chủ đề, Tên bài.
- Bộ nhớ HTML định dạng chuyển sang phiên bản mới để không khôi phục bản xem cũ thiếu SHORT hoặc chứa đáp án. Khóa cũ được giữ; các chỉnh trình bày cục bộ cũ không tự hiện ở bản mới. Không đổi câu hỏi hoặc nháp máy chủ.

## Kiểm chứng cuối

| Nhóm | Kết quả |
|---|---|
| Engine | 428 ca: 417 đạt, 11 bỏ qua; không lỗi/thất bại |
| Django | 110/110 đạt, gồm 21 ca mới cho Tin/Toán/Vật lí |
| Giao diện | Hai bộ Node và kiểm cú pháp đạt |
| Trình duyệt thật | 31/31 mục đạt; ba môn lưu/tải lại/tách dữ liệu, tạo đề GK1, bốn dạng câu, bảo mật đáp án, mã/bảng và cache |
| Migration | Không phát sinh thay đổi; không migrate dữ liệu thật |
| Review | Bản cuối và phụ lục dòng tóm tắt SHORT được thông qua; mã băm lưu ở integrated-files.json |

11 ca bỏ qua gồm 10 ca cần hồ sơ riêng không có trong snapshot và 1 ca chuyển PDF bằng Word chưa được bật. Không tính skip là đạt. Các lượt RED ban đầu có 6 thất bại trên 21 ca giữa kì và hai lỗi tương thích được reviewer phát hiện; đã giữ báo cáo ban đầu, sửa và chạy lại. Không bỏ qua lỗi để báo đạt.

Bốn DOCX giả đã được render phụ và xem đủ năm trang. Mã/bảng, tên môn và ký hiệu Unicode đọc được; không có nội dung bị cắt trong các mẫu này. Một mẫu GV còn trang cuối chỉ chứa dòng kết thúc, cần tinh chỉnh phân trang. Render phụ không thay bằng chứng chuyển PDF bằng Microsoft Word.

## Giới hạn và bước tiếp

Chưa chứng nhận toàn bộ ứng dụng đa môn hoàn thiện hoặc thay nghiệm thu của giáo viên. Công thức Word gốc/LaTeX render và nhúng ảnh, đồ thị câu hỏi còn thiếu; việc giữ Unicode không đồng nghĩa đã hỗ trợ phương trình Word. Cần tiếp tục kiểm luồng tự thiết lập phân bố chưa dùng ma trận, các khối ngoài fixture Tin 9/Toán 10/Vật lí 10, bản xuất Word→PDF và diễn tập phục hồi.

Ứng dụng đang mở từ trước có thể cần khởi động lại để nạp backend mới. Không tự dừng máy chủ thật. Máy chủ QA đã được dừng sau kiểm tra; DB và bằng chứng giả nằm riêng trong /tmp. Không tự tích các mốc C/G5 hoặc triển khai thật.

## Hồ sơ bằng chứng

- KET_QUA.json, integrated-files.json: kết quả và SHA-256 mã tích hợp.
- final-engine.log, final-django.log, final-migrations.log, final-frontend.log, final-matrices.log: kiểm thử.
- MIDTERM-UI-01.md và browser-*.json: 31 mục trình duyệt; visual-qa chứa ảnh dữ liệu giả.
- REVIEW-MIDTERM-FINAL.md và REVIEW-MIDTERM-FINAL-HEADER.md: verdict và phạm vi review.
- MIDTERM-TIN/MATH/PHYSICS-01.md: khảo sát ban đầu, dữ liệu và lỗi RED; đây là lịch sử trước sửa.
