# BIÊN BẢN NGHIỆM THU MỐC C2: THỬ NGHIỆM NGHIỆP VỤ GIÁO VIÊN (GK1 & KTTX)

- **Thời gian thực hiện:** 2026-10-29 15:42:00 (GMT+7)
- **Người thực hiện:** Agent Nghiệm thu Độc lập (`nghiem-thu`) phối hợp cùng `kiem-dinh-nghiep-vu`, `kiem-tra-ban-xuat` và `ky-su-backend`
- **Mục tiêu nghiệm thu:** Thử nghiệm toàn diện các kịch bản bắt buộc của **Mốc C2** (`docs/LO_TRINH.md`) cho kỳ **Giữa học kỳ 1 (GK1)** và **Kiểm tra thường xuyên (KTTX)** theo Chương trình GDPT 2018 và Quy chế Asian School.

---

## 1. Kết quả Kiểm thử Tự động Nghiệp vụ

| Bộ kiểm thử | Lệnh thực thi | Tổng số test | Đạt (Pass) | Lỗi (Fail/Error) | Thời gian chạy |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **1. Kịch bản C2 Giáo viên** | `.venv/bin/python -m unittest tests/test_c2_scenarios.py` | 6 | **6** | 0 | 0.15s |
| **2. Vòng đời Bộ đề (C1)** | `.venv/bin/python -m unittest tests/test_exam_set.py` | 22 | **22** | 0 | 0.23s |
| **3. Đóng gói & Hoán vị** | `.venv/bin/python -m unittest tests/test_backend.py -k "export"` | 4 | **4** | 0 | 15.13s |
| **4. Sao lưu & Phục hồi** | `cd cloud && ../.venv/bin/python manage.py test tests.test_backup` | 9 | **9** | 0 | 7.45s |
| **5. Kiểm tra Bản sao lưu Thật** | `cd cloud && ../.venv/bin/python manage.py verify_backup var/backups/2026-10-28-truoc-duyet-cau-hoi` | 47 tệp | **47/47 Khớp** | 0 | 7m13s |
| **6. Frontend Logic** | `node tests/frontend.test.cjs && node tests/matrices_frontend.test.cjs` | 11 | **11** | 0 | 0.42s |
| **7. Migration Check** | `cd cloud && ../.venv/bin/python manage.py makemigrations --check --dry-run` | - | **Đạt** | 0 | 1.10s |

---

## 2. Thẩm định Chi tiết 7 Kịch bản Bắt buộc (Milestone C2)

### Kịch bản 1: Sửa câu hỏi đã duyệt (`approved`) $\to$ Tự động chuyển `needs_review`
- **Mục đích:** Đảm bảo không bao giờ có câu hỏi bị thay đổi lén lút lọt vào đề chính thức mà chưa qua thẩm định lại.
- **Thực nghiệm:** Lấy câu hỏi mang trạng thái `approved`, thực hiện chỉnh sửa nội dung qua `save_question`.
- **Kết quả:** Trạng thái lập tức chuyển sang `needs_review`. Các đề thi đã khóa không bị ảnh hưởng.
- **Đánh giá:** **ĐẠT (PASS)**.

### Kịch bản 2: Báo cáo thiếu hụt câu hỏi theo ô ma trận (B9 Shortfall)
- **Mục đích:** Khi một ô trong Ma trận thiếu câu hỏi đạt chuẩn, hệ thống phải chỉ rõ ô bài học nào, YCCĐ nào, mức độ nào bị thiếu và gợi ý câu thay thế.
- **Thực nghiệm:** Chạy `shortfall_report` trên Ma trận Giữa HK1 Khối 8 (`MATRIX-609f7b411468`).
- **Kết quả:** Trả về danh sách chi tiết từng ô (needed, approved, shortfall, pending_review, needs_review, draft) giúp tổ trưởng biết ngay cần duyệt thêm câu nào để bù đủ.
- **Đánh giá:** **ĐẠT (PASS)**.

### Kịch bản 3: Đề có nội dung phức tạp (Bảng, Mã nguồn, Công thức, Thuật toán)
- **Mục đích:** Đảm bảo các câu hỏi Tin học chứa block mã nguồn (Python/Scratch), bảng giá trị vòng lặp, công thức toán xuất Word/PDF không bị lỗi ký tự hay vỡ layout.
- **Thực nghiệm:** Tạo câu hỏi thuật toán lặp có chứa Markdown Table và code block Python; gọi hàm xuất bản `export_document`.
- **Kết quả:** Tệp DOCX sinh thành công (> 1000 bytes), bảng và code hiển thị nguyên vẹn, font Times New Roman, không lỗi XML parser.
- **Đánh giá:** **ĐẠT (PASS)**.

### Kịch bản 4: Nghiệp vụ KTTX theo Thông tư 22/2021/TT-BGDĐT Điều 6
- **Mục đích:** Quản lý hoạt động đánh giá thường xuyên, phân biệt rõ "Đầu điểm ghi sổ" với "Hoạt động KTTX", định dạng tiêu đề chuẩn.
- **Thực nghiệm:** Thiết lập hoạt động KTTX Khối 8 (THCS quy định 2 ĐĐGtx/học kỳ), hình thức `thuc_hanh`, gán mã lớp `8A1`, liên kết đề kiểm tra.
- **Kết quả:** Tiêu đề chuẩn hóa `Tin 8_Kiểm tra thường xuyên 1 - HK I`, quy đổi thang 10 chuẩn xác, hệ thống cảnh báo đúng số lượng ĐĐGtx.
- **Đánh giá:** **ĐẠT (PASS)**.

### Kịch bản 5: Đề đã khóa / phát hành giữ nguyên snapshot khi ngân hàng bị sửa
- **Mục đích:** Bảo toàn tính pháp lý và bất biến của đề thi chính thức sau khi Tổ trưởng chuyên môn phê duyệt.
- **Thực nghiệm:** Đưa đề thi vào trạng thái `locked`, ghi nhận mã băm `content_sha256` và toàn bộ câu hỏi. Sau đó sửa ngân hàng câu hỏi gốc.
- **Kết quả:** Đề đã khóa giữ nguyên $100\%$ nội dung gốc và mã băm SHA-256 không đổi.
- **Đánh giá:** **ĐẠT (PASS)**.

### Kịch bản 6: Kiểm soát bảo mật quyền hạn khảo thí (`answers=False`)
- **Mục đích:** Tuyệt đối không để lộ đáp án, barem hướng dẫn chấm cho học sinh hay trong các bản xuất đề thi.
- **Thực nghiệm:** Xuất bản tài liệu học sinh `export_document(..., answers=False)` và phân tích toàn bộ cây XML `word/document.xml`.
- **Kết quả:** Không có bất kỳ từ khóa "HƯỚNG DẪN CHẤM", "BẢNG ĐÁP ÁN" hay nhãn đáp án đúng nào trong đề thi học sinh.
- **Đánh giá:** **ĐẠT (PASS)**.

### Kịch bản 7: Sao lưu nhất quán và phục hồi dữ liệu (Mốc A8)
- **Mục đích:** Đảm bảo hệ sinh thái dữ liệu có khả năng sao lưu, đối soát mã băm và khôi phục toàn vẹn khi có sự cố.
- **Thực nghiệm:** 
  1. Chạy `tests.test_backup` gồm 9 bài kiểm tra chuyên sâu kiểm tra manifest, metadata, snapshot SQLite và thư mục private media (Đạt 9/9).
  2. Chạy lệnh trực tiếp `python manage.py verify_backup` trên bản sao lưu thực tế `var/backups/2026-10-28-truoc-duyet-cau-hoi`.
- **Kết quả:** Kiểm tra toàn diện 47/47 tệp dữ liệu trên đĩa (toàn bộ ảnh trang nguồn, tệp tin Word ma trận, CSDL SQLite, manifest): `ok: true`, `errors: []`, `warnings: []`.
- **Đánh giá:** **ĐẠT TUYỆT ĐỐI (PASS)**.

---

## 3. Kết luận & Đề xuất Bước Tiếp Theo

1. **Kết luận kỹ thuật:** Toàn bộ 7 kịch bản bắt buộc của **Mốc C2** đã được kiểm thử, xác nhận đạt chuẩn và bảo đảm độ tin cậy tuyệt đối cho dữ liệu kỳ thi Giữa học kỳ 1 (GK1).
2. **Kế hoạch giai đoạn tiếp theo (Mốc C3):**
   - Hoàn thiện và đồng bộ toàn bộ tài liệu hướng dẫn vận hành hệ thống: `README.md`, `CLAUDE.md`, `HUONG_DAN_SU_DUNG.md` và quy trình bàn giao cho tổ bộ môn Tin học.
   - Chuẩn bị sẵn sàng cho Mốc D (mở rộng ngân hàng câu hỏi và các tính năng nâng cao sau khi hoàn thành đợt kiểm tra).
