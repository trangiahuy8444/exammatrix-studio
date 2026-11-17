# Các phát hiện của lượt giữa kì đa môn

Ngày 31/10/2026. Chỉ dùng dữ liệu minh họa tự soạn. Ba module mới: Tin 9 (7 đạt/2 FAIL), Toán 10 (4 đạt/2 FAIL), Vật lí 10 (4 đạt/2 FAIL); tổng 21 test, 15 đạt/6 FAIL, chưa phải kết quả sau sửa.

| Mã | Phát hiện | Môn tái hiện | Chủ sửa | Trạng thái |
|---|---|---|---|---|
| MT-01 | Kiểm định bỏ SHORT khỏi tổng điểm, dạng và mức độ | Toán, Vật lí | Backend — mixed verifier | Đã sửa, tích hợp và kiểm lại |
| MT-02 | Đề YN từ ma trận có xác nhận từng ý nhưng snapshot thiếu mức/điểm/ánh xạ từng ý | Toán | Backend — mixed verifier | Đã sửa, tích hợp và kiểm lại |
| MT-03 | Bộ đề tự sinh thiếu slot_id/slot_number; tạo mã hoán vị trả 400 | Tin học | Backend — mixed verifier | Đã sửa, tích hợp và kiểm lại |
| MT-04 | Xuất DOCX strip khoảng trắng, làm mất thụt dòng Python | Tin học | Backend — code/tables | Đã sửa, tích hợp và kiểm lại |
| MT-05 | Thân câu chưa có bảng Word từ bảng nhập văn bản | Tin học | Backend — code/tables | Đã bổ sung mã/bảng văn bản cơ bản và kiểm lại |
| MT-06 | Chuỗi LaTeX vẫn literal, chưa có công thức Word gốc | Toán, Vật lí | Chưa giao sửa | Còn thiếu, không báo đã render |
| MT-07 | Chưa có luồng nhúng ảnh/đồ thị vào câu hỏi được xác minh | Tin học, Vật lí | Chưa giao sửa | Còn thiếu, không bịa API đầu vào |

Phát hiện chưa hỗ trợ khác với regression: MT-05/06/07 không phải bằng chứng nội dung bị mất qua một API đã công bố. Ưu tiên sửa MT-01–04 để hoàn tất đường giữa kì đang có; ghi rõ phần còn thiếu khi bàn giao, không tuyên bố toàn bộ đa môn hoàn thiện.

Kiểm thử trình duyệt thật trên DB tạm đang thực hiện độc lập. Các bản sửa phải giữ approved-only, dữ liệu tách theo tài khoản/chương trình, đề đã khóa bất biến, kiểm thiếu ánh xạ không báo đủ, và lề/bố cục đã sửa trước đó.

## Kết quả sau sửa

Bản cuối xem BAN_GIAO.md. Đã sửa thêm: tương thích snapshot cũ, chặn sửa YCCĐ từng ý YN, hiển thị SHORT trong bốn bản xem và dòng tóm tắt, bảo vệ thao tác bảng, tách đáp án bản học sinh, cache HTML cũ và bảng A ba cột. Các MT-06/07 vẫn còn mở; mẫu GV có một trang cuối chỉ dòng kết thúc là điểm phân trang cần cải thiện.
