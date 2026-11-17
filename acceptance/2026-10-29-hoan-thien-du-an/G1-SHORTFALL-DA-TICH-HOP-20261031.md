# G1 — Sửa kết luận báo cáo thiếu câu

Ngày 31/10/2026. Đã tích hợp bốn tệp sau kiểm thử, rà soát độc lập và kiểm mã trước/sau. Không commit, triển khai hoặc thay dữ liệu thật.

## Kết quả

Báo cáo không còn kết luận đủ câu khi ma trận chưa có vị trí, thiếu ánh xạ hoặc bản nhận nguồn chưa xác nhận. Một câu nhiều ý thuộc các bài/YCCĐ/mức khác nhau được giữ đủ từng ý để đối chiếu; không chỉ tính ý đầu và không coi bốn ý là bốn câu ngân hàng độc lập.

Các câu nhiều ý cùng một ô vẫn cần một câu nguyên vẹn. Số thiếu ở ô đã xác định giữ cách đếm cũ. Phần chưa đủ căn cứ có trạng thái riêng, không cộng giả vào số thiếu và không bị coi là đủ vì tổng thiếu bằng 0.

Giao diện ghi “Chưa thể kết luận đủ câu”, hiển thị từng ý kèm bài, YCCĐ, mức và điểm; vẫn mở được màn hình duyệt đúng ô đã xác định. Nội dung được escape HTML.

## Bằng chứng

- TDD backend: 12 ca shortfall đạt; 45 ca hồi quy mục tiêu đạt. TDD giao diện có RED thiếu helper trước khi sửa.
- Toàn engine: 403 ca, 392 đạt, 11 bỏ qua; Django 89/89; hai bộ Node đạt; migration không đổi. Log `verification6-*`.
- Reviewer không phát hiện lỗi chặn trong bốn tệp; hash tại `REVIEW-SHORTFALL-02.md`.
- Trình duyệt thật với dữ liệu giả: câu Đ/S bốn ý + hai câu MC thiếu, ma trận trống chưa xác nhận, và ô đủ câu đều đạt. Bốn ý 1a–1d có mặt, nút mở duyệt đúng ô, không có lỗi JavaScript. Xem `QA-SHORTFALL-UI.md`.

## Kiểm lại CK1 thật chỉ đọc

Đọc lại ba ma trận với PPCT/ngân hàng hiện có, không tạo BankService hoặc lưu vào registry. Candidate cả ba khối vẫn chưa có vị trí dựng được và chưa xác nhận ánh xạ. Hàm cũ trả `ok=true` cho cả ba vì số thiếu bằng 0; hàm mới trả `ok=false`, `complete=false` với các lý do thiếu vị trí/chưa xác nhận/còn vấn đề nguồn.

Đây là lỗi kết luận đã tái hiện trên nguồn CK1 thật và được chặn. Không suy từ 0 vị trí thành đủ hoặc thiếu 0 câu. Sáu nguồn đối soát giữ nguyên hash; JSON bằng chứng chỉ có số đếm/trạng thái: `g1-ck1-shortfall-readonly-20261031.json`.

## Còn lại

G1 vẫn cần đối chiếu bài/YCCĐ, dải mã, mức và điểm của CK1 để lập các vị trí có căn cứ rồi mới tính thiếu chính xác. Bản sửa chưa tự ghép câu nhiều ý từ các câu độc lập và chưa chứng nhận khả năng khóa/phát hành. Hàm kiểm định từng ô và bộ chọn câu tự động ngoài phạm vi phiếu này.

G4 còn kiểm PDF bằng Word; G5 còn nghiệm thu cùng giáo viên; G6/G7 chưa qua cổng. Không tự tích các mốc này.
