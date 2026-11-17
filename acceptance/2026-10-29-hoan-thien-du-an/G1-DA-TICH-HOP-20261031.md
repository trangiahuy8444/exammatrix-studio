# G1 — Bản sửa đã tích hợp ngày 31/10/2026

Đã tích hợp 18 tệp mã/kiểm thử sau kiểm tra mã nguồn trước sửa, lưu bản dự phòng và rà soát độc lập. Chưa commit hoặc triển khai. Không sửa dữ liệu thật.

## Hành vi đã có

- Vận dụng cao được giữ riêng xuyên suốt lưu/duyệt câu, lọc/chọn, ma trận, tạo đề và bộ đề, Word/HTML/LaTeX. Hồ sơ cũ vẫn xuất ba mức; digest fixture khóa cũ không đổi. Bảng ma trận giữ rộng tối đa 24 cm, lề theo quy chuẩn.
- Bộ đọc nhận mẫu Word ma trận 10 cột / đặc tả 6 cột THCS và THPT. Bản xem trước luôn nháp/chưa xác nhận. Nguồn rõ bài, YCCĐ, mã và điểm dựng được ô; phần mơ hồ để đối chiếu. Parser 13/16 cột dùng riêng ba cột cũ.
- Đã sửa phát hiện review: nguồn Bài 2 không được gán sang Bài 1 dù cùng tên. Test mới RED → GREEN; 12 ca compact đạt.
- Kiểm định đề đo mức độ thực tế; không thay số đo bằng định mức khi đủ số MC, không nhận xét khớp 100% dựa trên khối. Tổng điểm từng câu ES/YN phải khớp các ý; thiếu mức/điểm hoặc điểm không hợp lệ thì chưa đạt. Review R2 xác nhận hai lỗi điểm đã được sửa.
- Fixture nhập PPCT dùng lại đúng byte tệp khi đối soát/xác nhận; chốt chặn SHA sản phẩm giữ nguyên.

## Kiểm chứng

Engine chạy 394 ca: 383 đạt, 11 bỏ qua; Django 89/89; hai bộ Node đạt; kiểm migration không đổi. Bằng chứng: `verification5-engine-r2.log`, `verification5-django.log`, `verification5-frontend.log`, `verification5-matrices_frontend.log`, `verification5-migrations.log`.

Lượt engine trước đó có một lỗi fixture Word tạo lại ZIP với timestamp khác (`verification5-engine.log`); đã tái hiện, sửa fixture và chạy lại đủ 394 ca. Không bỏ qua lỗi này để báo đạt. Lượt Django 0 ca đã bị loại; khôi phục package/template thiếu của snapshot theo hash rồi chạy lại đủ 89 ca. Kết quả 11 skip không được tính là đạt.

## CK1 thật — chỉ đọc

Sáu nguồn trong phạm vi đối soát giữ nguyên hash. Đọc thử ba ma trận với PPCT thật bằng parser mới, chỉ giữ số đếm:

| Khối | Hàng YCCĐ | Nhóm bài chưa ánh xạ | YCCĐ chưa ánh xạ | Ô dựng được | Xác nhận |
|---|---:|---:|---:|---:|---|
| 8 | 11 | 4 | 11 | 0 | Chưa |
| 9 | 11 | 3 | 11 | 0 | Chưa |
| 10 | 9 | 3 | 9 | 0 | Chưa |

Đây là số mục chưa ánh xạ chính xác, không phải số câu thiếu và không chứng minh PPCT sai. Không coi 0 ô dựng được là đủ câu. Nhóm bài, dải mã, điểm và mức Hiểu/VD gộp cần đối chiếu tường minh trước khi kết luận thiếu theo từng ô. Chi tiết chỉ gồm số lượng và mã cảnh báo tại `g1-ck1-preview-20261031.json`; không đưa nội dung câu/đáp án vào báo cáo.

## Công việc tiếp

G1 còn ánh xạ và xác nhận từng ô CK1; ngân hàng hiện chưa có YN/VDC nên chưa đủ chứng cứ tạo đề thật. Bộ nhập đề Word có ý thiếu mức/điểm sẽ yêu cầu bổ sung thay vì kết luận đạt. Kiểm bài tự luận của hàm nhập hiện mới kiểm thuộc bài, chưa chứng nhận từng YCCĐ/slot.

Bản xuất bốn mức đã kiểm cấu trúc, chưa thay thế nghiệm thu trực quan và chuyển Word→PDF. G5 còn nghiệm thu cùng giáo viên; G6/G7 còn môi trường PostgreSQL, diễn tập phục hồi và triển khai. Không tự đánh dấu hoàn thành các cổng này.
