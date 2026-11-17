---
name: kiem-tra-ban-xuat
description: >-
  Sử dụng skill này khi cần kiểm tra định dạng và bố cục các bản xuất Word (DOCX), PDF, LaTeX và tệp
  trắc nghiệm LMS. Hướng dẫn quy trình xuất thử nghiệm, đo đạc độ rộng bảng (<= 24cm), kiểm tra lề
  trên/dưới (1,0cm), font Times New Roman, kiểm tra ngắt trang, kiểm tra logo trường (chỉ có ở đề cương),
  và bảo mật ngăn rò rỉ đáp án ra đề thi học sinh.
---

Đọc `docs/QUY_TRINH_AGENTS.md` và phiếu liên quan trong `docs/KE_HOACH_HOAT_DONG_AGENTS.md` để xác định phạm vi, quyền ghi và tiêu chí bàn giao trước khi áp dụng quy trình.


# Quy trình Kiểm tra Bản xuất Word / PDF / LMS (kiem-tra-ban-xuat)

Skill này cung cấp các bước hướng dẫn cụ thể để rà soát kỹ thuật bản xuất của hệ thống Ngân hàng đề, bảo đảm không bị lỗi dàn trang và tuân thủ đúng quy định `../rules/03` và `rules/06`.

## 1. Danh mục Kiểm tra Bố cục (Checklist)

1. **Khổ giấy & Căn lề:**
   - [ ] Hướng trang: Khổ ngang (Landscape), A4.
   - [ ] Căn lề: Lề trên $1,0\,\text{cm}$, lề dưới $1,0\,\text{cm}$, lề trái $1,5\,\text{cm}$, lề phải $1,0\,\text{cm}$.
   - [ ] Chiều rộng bảng biểu: Tối đa $\le 24,0\,\text{cm}$ (không tràn lề).
2. **Font chữ & Định dạng:**
   - [ ] Toàn bộ văn bản dùng font Times New Roman.
   - [ ] Có lặp lại dòng tiêu đề (Header row) khi bảng phân trang.
   - [ ] Chân trang (Footer) có đánh số `Trang X/Y` căn phải.
3. **Quy định Logo trường:**
   - [ ] **Đề cương ôn tập:** Có logo trường Asian School ở góc trên bên trái.
   - [ ] **Đề thi chính thức:** TUYỆT ĐỐI KHÔNG có logo (dùng tiêu đề 2 cột chuẩn Bộ).
   - [ ] **Ma trận & Bản đặc tả:** TUYỆT ĐỐI KHÔNG có logo.
4. **Bảo mật Đề thi:**
   - [ ] Bản đề thi cho học sinh: Không có đáp án in đậm, không có bảng đáp án cuối trang, không có lời giải hoặc dấu nhận biết đáp án đúng; điểm từng câu theo mẫu được duyệt.
   - [ ] Kiểm tra metadata tệp DOCX: Không lưu thuộc tính `is_correct` trong XML.
5. **Định dạng file LMS:**
   - [ ] Câu MC: Phương án đúng in đậm đầu mục: `[A.] `. Không có bảng đáp án.
   - [ ] Câu YN: Cuối mỗi ý có `[ĐÚNG]` hoặc `[SAI]`.
   - [ ] Câu SHORT: Có thẻ `[Đáp án: ...]`.

## 2. Quy trình Thực hiện Xuất & Kiểm tra

### Bước 1: Sinh bản xuất kiểm tra từ dữ liệu mẫu
Đọc `docs/QUY_TRINH_AGENTS.md`; dùng fixture tự soạn từ tests hoặc dựng ca giả để gọi hàm xuất hiện hành, ghi tài liệu ở thư mục tạm. Không chạy `scripts/export_and_verify_samples.py` hoặc `verify_step2_1.py` theo mặc định vì chúng đọc nguồn thật. Nhánh PDF phải chuyển từ chính DOCX bằng Word; thiếu Word ghi chưa kiểm tra, không thay bằng PDF XeLaTeX.

### Bước 2: Chuyển đổi và kiểm tra trực quan
- Đối chiếu bản xuất vừa tạo với các tệp hồ sơ gốc đã nộp tại `../06_Kiem_tra_va_Danh_gia/00_Ho_so_nop_*/`.
- Chú ý hiện tượng câu hỏi bị ngắt đôi qua trang mới (cần có `keepWithNext` và `cantSplit`).

### Bước 3: Nguyên tắc sửa lỗi
- Agent kiểm tra chỉ báo lỗi và chuyển cho backend; backend sửa bố cục Word/PDF tại mã tạo DOCX (`exports.py`, `matrices/exports.py`).
- Không sửa tệp PDF trung gian vì PDF được sinh tự động từ Word thông qua AppleScript (`pdf_build.py`).
