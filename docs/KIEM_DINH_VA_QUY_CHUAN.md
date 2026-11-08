# QUY CHUẨN ĐỊNH DẠNG & TIÊU CHUẨN KIỂM ĐỊNH

> Tài liệu tổng hợp các quy chuẩn khảo thí, yêu cầu bố cục bản xuất và tiêu chí kiểm thử áp dụng cho toàn bộ dự án `ngan-hang-de-web`.

---

## 1. Tiêu chuẩn Bố cục Tệp Word (DOCX) & PDF

Căn cứ theo `rules/03_tieu_de_va_dinh_dang.md` và các bộ hồ sơ mẫu đã nộp (`06_Kiem_tra_va_Danh_gia/00_Ho_so_nop_*/`):

| Hạng mục | Quy chuẩn bắt buộc | Lưu ý kỹ thuật |
| :--- | :--- | :--- |
| **Hướng trang** | Khổ ngang (Landscape), khổ A4 | Cố định cho Ma trận, Đặc tả, Đề thi, Đề cương |
| **Căn lề (Margins)** | Lề trên: $1,0\,\text{cm}$; Lề dưới: $1,0\,\text{cm}$<br>Lề trái: $1,5\,\text{cm}$; Lề phải: $1,0\,\text{cm}$ | Không để lề vượt quá giới hạn gây tràn bảng |
| **Độ rộng bảng** | Tối đa $\le 24,0\,\text{cm}$ | Tuyệt đối không để bảng tràn lề trang in ngang |
| **Phông chữ** | Times New Roman, cỡ chữ $11 - 12\,\text{pt}$ | Bảng ma trận có thể dùng $10 - 11\,\text{pt}$ |
| **Đánh số trang** | `Trang X/Y` căn phải ở phần chân trang (Footer) | Tính toán chính xác tổng số trang |
| **Lặp tiêu đề bảng** | Có lặp lại dòng tiêu đề (Header row) khi sang trang | Thuộc tính `tblHeader` trong XML bảng Word |
| **Logo trường** | **Chỉ xuất hiện trên Đề cương ôn tập**<br>(Góc trên bên trái header).<br>**Đề thi và Ma trận TUYỆT ĐỐI KHÔNG có logo**. | Đề thi dùng tiêu đề hành chính 2 cột chuẩn Bộ |
| **Ngắt trang câu hỏi** | Toàn bộ câu hỏi và 4 phương án $A, B, C, D$ nằm trọn vẹn trên cùng 1 trang | Sử dụng thuộc tính `cantSplit` và `keepWithNext` |
| **Xuất PDF** | PDF phải được xuất trực tiếp từ file DOCX thông qua Microsoft Word | Sửa lỗi giao diện trực tiếp tại mã sinh DOCX trong `exports.py` |

---

## 2. Tiêu chuẩn Đánh số & Ký hiệu trong Ma trận và Bản đặc tả

Căn cứ theo `rules/02_danh_so_cau_hoi.md`:

1. **Trong bảng Ma trận:**
   - Số câu hỏi ở các ô phải được ghi rõ ràng dưới dạng danh sách câu: `(1, 2, 3, 4)` hoặc `(1a, 1b)`.
   - **Tuyệt đối không dùng ký hiệu dải câu** như `(C1 - C4)` hay `(Câu 1 đến Câu 4)`.
   - Phân biệt rõ loại câu hỏi: Trắc nghiệm nhiều lựa chọn (MC), Trắc nghiệm Đúng/Sai (Đ/S hoặc YN), Trả lời ngắn (TLN hoặc SHORT), Tự luận (TL hoặc ES).
2. **Trong Bảng đặc tả:**
   - Mỗi YCCĐ phải ghi rõ các câu hỏi tương ứng ở cuối nội dung YCCĐ theo định dạng: `(Câu 1, Câu 2)` hoặc `(Câu 3a, Câu 3b)`.
   - Tổng số lượng câu hỏi và tổng số điểm trong Bản đặc tả phải khớp $100\%$ với từng ô trong Bảng ma trận.

---

## 3. Tiêu chuẩn Đề cương Ôn tập

Căn cứ theo `rules/05_de_cuong_on_tap.md`:

- **Phần mở đầu:** Có logo trường Asian School, tiêu đề "ĐỀ CƯƠNG ÔN TẬP KIỂM TRA...".
- **Bảng mục A "GIỚI HẠN KIẾN THỨC ÔN TẬP":**
  - Bắt buộc cấu trúc đúng **3 cột**:
    1. `STT` (Số thứ tự chủ đề)
    2. `Tên chủ đề` (Chủ đề theo phân phối chương trình)
    3. `Tên bài` (Danh sách các bài học tương ứng trong chủ đề)
  - Không tự ý thêm bớt cột làm sai lệch quy chuẩn của tổ bộ môn.
- **Phần B "CÂU HỎI ÔN TẬP":**
  - Chứa tập câu hỏi ôn tập bám sát toàn bộ YCCĐ trong ma trận.

---

## 4. Tiêu chuẩn File Trắc nghiệm tải lên LMS Asian School

Căn cứ theo `rules/06_trac_nghiem_lms.md`:

1. **Cấu trúc câu hỏi trắc nghiệm nhiều lựa chọn (MC):**
   - Nội dung câu hỏi bắt đầu bằng: `Câu X: ...`
   - Bốn phương án trả lời nằm trên các dòng riêng biệt:
     ```
     A. Phương án 1
     B. Phương án 2
     C. Phương án 3
     D. Phương án 4
     ```
   - **Đánh dấu đáp án đúng:** Phương án đúng được bôi đậm ngay tại đầu mục: `[A.] ` (hoặc in đậm cả chữ cái và dấu chấm).
   - **Tuyệt đối không có Bảng đáp án** ở cuối file.
2. **Cấu trúc câu hỏi Đúng/Sai (YN):**
   - Đặt thẻ `[ĐÚNG]` hoặc `[SAI]` ở cuối mỗi ý con:
     ```
     a) Ý kiến thứ nhất [ĐÚNG]
     b) Ý kiến thứ hai [SAI]
     ```
3. **Cấu trúc câu hỏi Trả lời ngắn (SHORT):**
   - Đặt đáp án ở dòng tiếp theo: `[Đáp án: <giá_trị>]`.

---

## 5. Quy tắc Làm tròn Điểm số & Chấm điểm

Căn cứ Thông tư 22/2021/TT-BGDĐT và Quy ước tổ bộ môn:

- **Kiểm tra định kỳ (Giữa kỳ GK, Cuối kỳ CK):**
  - Điểm tổng của đề là $10,0$ điểm.
  - Điểm thành phần và điểm tổng được làm tròn đến **1 chữ số thập phân** ($0,1$).
- **Kiểm tra thường xuyên (KTTX):**
  - Điểm số làm tròn đến **số nguyên** ($0, 1, 2, ..., 10$).
- **Thang điểm câu hỏi Đúng/Sai (YN):**
  - Một câu hỏi Đúng/Sai chuẩn gồm 4 ý $a, b, c, d$.
  - Mặc định áp dụng thang điểm bậc thang (Công văn 7991):
    - Đúng 1 ý: $0,1$ điểm (hoặc $10\%$ tổng điểm câu)
    - Đúng 2 ý: $0,25$ điểm (hoặc $25\%$ tổng điểm câu)
    - Đúng 3 ý: $0,5$ điểm (hoặc $50\%$ tổng điểm câu)
    - Đúng cả 4 ý: $1,0$ điểm ($100\%$ tổng điểm câu)

---

## 6. Bảo mật & Phòng chống rò rỉ đề thi

1. **Bản in phát cho học sinh:**
   - Không chứa bất kỳ ký hiệu đánh dấu đáp án đúng nào (không bôi đậm đáp án, không có dấu tích, không có đáp án cuối trang).
   - Loại bỏ hoàn toàn ma trận điểm chi tiết, rubric chấm điểm tự luận.
   - Kiểm tra kỹ metadata trong file `.docx` (XML nội bộ `word/document.xml`) để đảm bảo không lưu thuộc tính `is_correct` hoặc `rubric` trong bản xuất học sinh.
2. **Kiểm soát quyền truy cập API:**
   - Các API xuất file kèm đáp án (`/api/exams/export` có đáp án) yêu cầu phiên đăng nhập có quyền `answers`.
   - Nếu người dùng không có quyền hoặc gọi thẳng URL trái phép: Máy chủ trả về lỗi `HTTP 403 Forbidden` và ghi lại nhật ký cảnh báo an ninh.
