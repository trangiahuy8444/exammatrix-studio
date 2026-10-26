# Kiểm chứng bản đầu — 21/10/2026

## Kết quả

- 30 kiểm tra Python đạt: lưu/sửa/lưu trữ mềm, sao lưu và ghi nguyên tử, thao tác đồng thời, dữ liệu nhập không hợp lệ, PPCT chỉ đọc, ma trận khóa, tổng điểm, thiếu câu, không trùng, tỷ lệ đề cương, phiên bản sau khi sửa, đảo phương án, thang điểm xuất, bảo vệ đáp án học sinh và yêu cầu HTTP cục bộ.
- Kiểm tra giao diện JavaScript đạt: tìm không dấu, lọc, tính điểm, trạng thái mẫu, yêu cầu ma trận nguồn cho các kỳ định kỳ khối 8/10, đề cương cùng khối và hiển thị văn bản an toàn.
- Kiểm tra trên trình duyệt với bản sao dữ liệu: lọc khối 8 (120 câu), xem đáp án/YCCĐ, sửa trạng thái và lưu, lưu đề cương, tạo đề GK1 khối 8 (31 câu, 10 điểm, khớp 31/31), đọc PPCT khối 9, xác nhận khóa GK1 khối 10 và CK1 khối 8 khi chưa có nguồn.
- Chạy trực tiếp với dữ liệu thật nhưng lưu kết quả vào thư mục thử: GK1 khối 8 và 9 đều đủ 31 câu, 10 điểm, khớp 31/31 với đề cương.
- Ngân hàng 360 câu vượt kiểm tra cấu trúc ứng dụng. Các dấu kiểm tra tệp nguồn PPCT còn khớp. Thư mục lịch sử thật chưa có đề hoặc đề cương thử.
- 6 Word ngân hàng đã chuyển thành 155 trang để kiểm tra bố cục; 3 Word xuất từ web thành 51 trang. Đã xem toàn bộ trang qua ảnh tổng hợp, kiểm tra thêm trang đại diện ở kích thước đọc, sửa chiều rộng cột STT, kiểm tra lại đề cương. Bảng đề cương 23,8 cm, có 4 cột và lặp tiêu đề; logo riêng trên đề cương, đề kiểm tra không có logo.
- 13 kiểm tra dữ liệu và 15 kiểm tra bản xuất ngân hàng đã đạt; báo cáo nằm cùng JSON. Tệp Aiken và Moodle XML đã kiểm tra cấu trúc/đáp án, chưa nhập thử lên LMS của trường.

## Giới hạn sử dụng

- 36 câu mẫu đã được thầy duyệt; 324 câu mở rộng mang trạng thái đã tự kiểm tra nội dung, cần giáo viên xem lại trước khi dùng chính thức.
- Đối chiếu tự động bảo đảm bài, dạng câu, mức độ, số lượng và điểm từng ô. Giáo viên vẫn cần đối chiếu chi tiết từng yêu cầu cần đạt trong bảng đặc tả; không gắn nhãn đã duyệt chuyên môn chỉ dựa vào kiểm tra kỹ thuật.
- GK1 khối 10 có mâu thuẫn giữa các bảng nguồn, và bản đầu chưa tạo đề dạng Đúng/Sai. Ứng dụng chặn mẫu này, giữ nguyên nguồn.
- Ngân hàng mở rộng hiện phục vụ các bài học kỳ I. Chưa coi là đủ cho học kỳ II.
- Excel/Word/LMS ngân hàng là bản xuất tại ngày phát hành, không tự đồng bộ khi sửa JSON trên web. PPCT nguồn chỉ đọc; JSON và lịch sử được sao lưu trước khi sửa.
- Đây là ứng dụng một người dùng trên máy này. Không mở dịch vụ ra Internet hoặc chạy đồng thời hai máy ghi cùng tệp Drive.

Máy chủ kiểm chứng đã dừng sau khi thử. Dùng MO_NGAN_HANG_DE.command để mở phiên làm việc thật.

## Bổ sung Ma trận & đặc tả — 21/10/2026

- 69 kiểm tra Python và 2 tệp kiểm tra JavaScript: model, vòng đời, nhập Word thật, trao đổi JSON, xuất Word, tạo đề theo vị trí, API và chức năng cũ.
- Rà soát độc lập đã chỉ ra bốn lỗi: bảo vệ ánh xạ của gói nhận, phân biệt phiên bản cùng nguồn, xuất cột trả lời ngắn và đối chiếu các ô/tổng nguồn. Đã sửa và bổ sung kiểm tra hồi quy; sửa thêm đóng hồ sơ và giữ lựa chọn khi chuyển tab.
- Kiểm tra giao diện trên bản sao riêng tại cổng 8877: tạo/lưu nháp, đóng hồ sơ, tạo phiên bản mới, xác nhận/khóa; chọn 31 câu, giữ các đánh dấu khi chuyển tab, tạo đề mã 909 đạt 10 điểm và khớp đề cương 31/31. Dữ liệu thử không nằm trong lịch sử thật.
- Word thực: khối 8 đọc 31 câu, không có bất đồng số lượng; khối 10 phát hiện 9/12 ý tự luận và tổng đặc tả không khớp. Không sửa nguồn để khớp.
- Đã kết xuất và xem toàn bộ trang Word ba khối: 3 trang K8, 9 trang K10 và 5 trang K9 nhiều yêu cầu dài. Điều chỉnh chia hàng đặc tả dài để tránh cắt nội dung; kiểm lại tiêu đề lặp. Bảng tối đa 23,8 cm, ngang, Times New Roman. Ảnh giao diện dùng dữ liệu kiểm chứng.
- Các tình huống sửa bản khóa, lưu phiên bản cũ, nhập gói sửa nội dung/hỏng hash, truy cập khác nguồn, rò đáp án qua gói/đề học sinh, câu không đúng YCCĐ và thiếu tỷ lệ đề cương được kiểm bằng bộ kiểm tra tự động.
- Giới hạn: tạo đề tự động MC/ES; YN/SHORT và tự luận ghép nhiều bài/mức độ bị chặn rõ. Tỷ lệ đề cương xét nội dung trùng, chưa tự xác nhận “bám sát” câu diễn đạt lại. Không gọi bản kiểm chứng là bản tổ đã duyệt; không bàn giao PDF dựng qua LibreOffice như PDF chuẩn XeLaTeX.

Kết quả cuối: 69/69 Python và 2/2 tệp JavaScript đạt; kiểm cú pháp hai mô-đun giao diện đạt. So SHA-256 cuối xác nhận 4/4 tệp ngân hàng, mẫu đề, đề cương và lịch sử đề thật không thay đổi. Máy chủ thử được dừng sau nghiệm thu.
