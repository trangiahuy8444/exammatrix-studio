# BE-VERIFY-01 — Đối soát mức độ đúng theo dữ liệu

Ngày 31/10/2026. Chỉ sửa bản sao cách ly; không đọc/ghi ngân hàng hoặc hồ sơ thật, không tích hợp vào nguồn.

## Thay đổi

- Bỏ phép thay số đo thực tế bằng chỉ tiêu ma trận khi đủ số câu MC.
- Kết luận đạt bắt buộc khớp phân bố mức độ, cùng tổng điểm/dạng câu/bài tự luận/đề cương.
- Mức thiếu hoặc không hợp lệ không được tự quy về Biết. Giữ riêng Vận dụng cao.
- Số ý tự luận lấy từ các ý được khai báo, không suy diễn ba ý từ Khối 10. Các ý cần có mức độ và điểm rõ ràng để đối soát; thiếu dữ liệu thì chưa đạt.
- Bỏ nhận xét khớp 100% và đảo đề dựa riêng vào khối/mã đề; ghi nhận kết quả thực đo.

## Kiểm chứng

- Sáu kiểm thử mới: RED có 5 lỗi khẳng định đúng nguyên nhân; GREEN đạt 6/6.
- Nhóm bốn mức đạt 13/13; nhóm policy đạt 16/16.
- Toàn engine chạy 390 ca: 361 đạt, 11 bỏ qua, 18 lỗi quyền mở cổng localhost (`PermissionError: [Errno 1] Operation not permitted`). Không có assertion failure. Đây chưa phải toàn bộ suite đạt.
- Log: `/tmp/BE-VERIFY-01-red.log`, `...-green.log`, `...-policy.log`, `...-engine.log`.

## Giới hạn

Chỉ kiểm chứng dữ liệu giả. Bộ nhập Word cũ có thể thiếu mức độ/điểm từng ý; kết quả mới sẽ yêu cầu bổ sung dữ liệu thay vì tự kết luận khớp. Kiểm tra bài tự luận hiện chỉ xác nhận bài thuộc ma trận; chưa chứng minh từng YCCĐ/slot trùng hoàn toàn. Không thay đổi các phạm vi đó trong đợt sửa này.

## Sửa sau review (R2)

- Kiểm tra tổng điểm các ý trong **từng câu** ES/YN bằng điểm câu đó; sai số giữa hai câu không được bù trừ.
- Điểm câu và điểm ý phải hữu hạn, lớn hơn 0, không chấp nhận bool/NaN/Infinity/chuỗi sai. Dữ liệu sai trả kết quả chưa đạt, không gây ngoại lệ khi cộng điểm/đối soát Decimal.
- Bỏ điểm mặc định 0,25 cho ý YN. Chính sách `domain/scoring.py` có bảng điểm phi tuyến theo số ý đúng, nên không có căn cứ suy ra phân bố điểm nhận thức của từng ý từ tổng điểm câu. Phải có điểm ý khai báo rõ.
- R2 RED: 9 ca, 2 assertion failures + 4 lỗi chuyển đổi điểm (đúng lỗi cần tái hiện). R2 GREEN: 9/9; bốn mức 13/13; policy 16/16. Log `/tmp/BE-VERIFY-01-r2-*.log`.
- Không chạy lại toàn engine trong lúc chỉnh sửa theo phân công; kết quả toàn engine 390 ở trên thuộc bản trước R2. Điều phối cần chạy suite cho bản đóng băng này.
