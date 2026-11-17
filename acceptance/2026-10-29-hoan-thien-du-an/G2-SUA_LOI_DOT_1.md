# G2 — Đợt sửa lỗi thứ nhất

Đã tích hợp 9 tệp sau khi kiểm hash nguồn để giữ nguyên các sửa đã có.

- Lọc đệ quy mọi trường đáp án lồng trong ý Đ/S; giữ cấu trúc công khai và không sửa input. Hai test mới đã FAIL trước sửa, PASS sau sửa; review độc lập chấp nhận.
- Lưu publish_blocked khi hash đổi trên legacy single/set, không phát hành nửa bộ. Django vẫn rollback tài liệu/revision/version-history, nhưng AuditEvent tồn tại ngoài giao dịch với actor từ request. Review độc lập 37 test mục tiêu đạt.
- Test vùng Test dùng fixture tự soạn và cổng tạm, không đọc DEFAULT_BANK. Test C2 thiếu YCCĐ dùng ma trận giả, kiểm chính xác approved/pending/needs/draft và không tự nhận nghiệm thu CK1.

## Xác minh tổng thể trên snapshot cách ly cùng mã đã tích hợp

Engine 354 ca: 343 đạt, 11 bỏ qua, không lỗi. Django 89/89 đạt. Migration check không đổi. Hai bộ Node mã thoát 0. Log verification1-*.log và verification1-results.json; hash 9 tệp tích hợp trong integrated-files.json.

11 skip là nguồn riêng không chép và Word thật chưa chạy; không tính đạt. Chưa nghiệm thu toàn G2/CK1 hoặc online; G3/UI, G4 Word/PDF, G1 dữ liệu thật và G6 PostgreSQL còn việc.
