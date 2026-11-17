# G1 — Đối soát CK1 chỉ đọc ngày 30/10/2026

Quyền từ giáo viên: “Đối soát ma trận CK1 đã nộp, chỉ đọc”. Không tạo BankService, không nhập/duyệt/ghi kho thật. Chỉ lưu số đếm và hash; không đưa câu/đáp án vào báo cáo.

## Kết quả ngân hàng hiện tại

- Khối 8: 120 câu; trạng thái {'approved': 118, 'needs_review': 2}; dạng {'MC': 100, 'ES': 20}.
- Khối 9: 120 câu; trạng thái {'approved': 120}; dạng {'MC': 100, 'ES': 20}.
- Khối 10: 120 câu; trạng thái {'approved': 120}; dạng {'MC': 100, 'ES': 20}.

## Ma trận CK1 tìm thấy và đối chiếu parser

Registry hiện chỉ có ba bản locked GK1, chưa có CK1 locked. Đã tìm tệp KHOI N - MA TRAN VA DAC TA CUOI HK1 2026-2027.docx tại hồ sơ từng khối. Không tự coi bản inspect là ma trận đã duyệt; tồn tại bản tên cũ cùng kỳ cần xác nhận phiên bản dùng.

| Khối | Số slot theo dạng | Số yêu cầu | Bài chưa ánh xạ | YCCĐ chưa ánh xạ | Ô/slot nhiều phần cần thẩm định | Thiếu theo parser | Kết luận |
|---|---|---|---|---|---|---|---|
| 8 | {} | — | — | — | 0 | — | parser_error |
| 9 | {} | — | — | — | 0 | — | parser_error |
| 10 | {} | — | — | — | 0 | — | parser_error |

## Giới hạn quyết định

Số thiếu là kết quả tính trên candidate do parser đọc, không là chứng nhận đủ câu cho kỳ thật. Parser đang gợi ý lesson/YCCĐ bằng độ giống từ; chưa được giáo viên xác nhận. Với slot đa bài/mức/YCCĐ, shortfall_report lấy phần đầu nên số thiếu có thể bỏ sót các phần sau; mọi slot kiểu này phải kiểm riêng trước duyệt. Không nới điều kiện hoặc tự gán YCCĐ để đủ câu.

Chi tiết số đếm từng ô và hash ở g1-ck1-counts.json. Hash trước/sau của toàn bộ nguồn được đọc khớp: True. Các tệp ngân hàng, registry và DOCX thật không thay đổi.

## Phát hiện chặn đã xác minh thêm

- Các tệp CK1 mới có bảng ma trận 10 cột và đặc tả 6 cột, khác cặp bảng 13/16 cột mà importer hiện hỗ trợ. Parser trả lỗi không nhận dạng cặp bảng; không phải đã chứng minh ma trận thiếu dữ liệu.
- Tổng cấu trúc ghi trên mẫu mới: Khối 8/9 mỗi khối 28 MC + 3 ES; Khối 10 có 19 MC + 3 YN + 3 ES. Bản tên cũ cùng kỳ có cấu trúc khác, không dùng lẫn để báo đủ.
- Mẫu mới có Vận dụng cao; matrices/model.py hiện chỉ nhận Biết/Hiểu/Vận dụng. Ngân hàng approved hiện không có ES ở mức Vận dụng cao của cả ba khối. Đây là thiếu tối thiểu theo dạng/mức, chưa phải số thiếu chính xác theo từng YCCĐ.
- Khối 10 cần 3 YN theo mẫu mới, trong JSON hiện có 0 YN: thiếu tối thiểu 3 câu loại này trước khi xét bài/YCCĐ. Khối 8 còn 2 needs_review, không tự duyệt hoặc đổi mức để bù.
- Cần bổ sung hỗ trợ mẫu mới và bốn mức ở phần mềm, kiểm chứng ánh xạ, rồi mới có thể đối soát từng ô chính xác và trình giáo viên nhập/duyệt dữ liệu. Không tự nhập các bản CK1 vào registry thật trong lượt đối soát chỉ đọc.

Số approved theo dạng/mức được lưu trong g1-ck1-counts.json; không có câu hỏi/đáp án trong báo cáo.
