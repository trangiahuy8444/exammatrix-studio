# QUY TRÌNH RA ĐỀ KIỂM TRA 6 BƯỚC (WIZARD C1)

> Tài liệu hướng dẫn nghiệp vụ và đặc tả giao diện theo quyết định của giáo viên ngày 29/10/2026 (Mốc C1 trong `docs/LO_TRINH.md`).
> Trình tự bắt buộc: **Ma trận $\rightarrow$ Đề cương $\rightarrow$ Bộ đề**.

---

## 1. Tổng quan quy trình

Quy trình ra đề định kỳ (Giữa kỳ, Cuối kỳ) và Kiểm tra thường xuyên (KTTX) được chuẩn hóa thành 6 bước tuần tự, có lưu nháp tự động ở từng bước:

```
[Bước 1: Chọn kỳ & Khóa Ma trận]
           ↓
[Bước 2: Lập Đề cương ôn tập]
           ↓
[Bước 3: Tạo Bộ đề thi song song]
           ↓
[Bước 4: Thẩm định & Khóa cả bộ]
           ↓
[Bước 5: Phát hành chính thức]
           ↓
[Bước 6: Xuất bản & Hoán vị mã đề]
```

---

## 2. Chi tiết từng bước thực hiện

### Bước 1: Chọn kỳ thi & Khóa Ma trận kiểm tra
- **Thao tác:** Giáo viên chọn Học kỳ (`GK1`, `CK1`, `GK2`, `CK2`) hoặc đợt `KTTX`.
- **Nguồn Ma trận:**
  - Chọn ma trận đã được khóa (`locked == true`) của kỳ này.
  - Hoặc sao chép từ ma trận của kỳ trước để hiệu chỉnh và khóa lại.
- **Ràng buộc:** Ma trận phải được khóa trước khi chuyển sang Bước 2 nhằm cố định số lượng câu hỏi, dạng câu (MC, YN, SHORT, ES), mức độ nhận thức (Biết, Hiểu, Vận dụng, Vận dụng cao) và YCCĐ cho từng ô.

### Bước 2: Lập Đề cương ôn tập
- **Nguyên tắc:** Đề cương phải bảo đảm độ phủ YCCĐ 100% so với ma trận đã chọn.
- **Hai hình thức tạo đề cương:**
  - **Tự động:** Hệ thống tự động chọn tập câu hỏi thỏa mãn ma trận, cho phép giáo viên tùy chỉnh số lượng câu của từng ô hoặc tổng số câu (tối thiểu đủ số lượng câu cho 1 đề chuẩn).
  - **Thủ công:** Giáo viên tự chọn câu hỏi từ ngân hàng câu hỏi đã duyệt (`approved`), hệ thống hiển thị bảng "Đối chiếu ma trận" theo thời gian thực để cảnh báo thiếu/thừa câu ở từng ô.
- **Tiêu chuẩn xuất bản đề cương:** Bảng A "Giới hạn kiến thức ôn tập" chuẩn 3 cột (`STT | Tên chủ đề | Tên bài`) theo đúng quy chuẩn `rules/05`.

### Bước 3: Tạo Bộ đề thi song song
- **Mục tiêu:** Tạo ra một bộ gồm từ 2 đến 6 đề thi chính thức (`generate-set`) hoàn toàn khác câu hỏi nhau.
- **Tiêu chí đề cương (T $\ge$ 90%):**
  - Mỗi đề trong bộ đề phải có tỷ lệ $T = \frac{\text{Số câu trùng hoặc bám sát đề cương}}{\text{Tổng số câu của đề}} \ge 90\%$.
  - 10% câu còn lại có thể là câu mở rộng hoặc câu vận dụng phân hóa.
- **Cơ chế chống trùng câu:** Hệ thống tự động loại trừ các câu hỏi vừa được sử dụng trong các đề thi gần nhất hoặc giữa các đề trong cùng một bộ.
- **Lưu nháp:** Mọi đề trong bộ được lưu nháp (`draft`) kèm liên kết chặt chẽ với phiên bản đề cương và ma trận căn cứ.

### Bước 4: Thẩm định & Khóa cả bộ đề
- **Rà soát chất lượng:**
  - 100% câu hỏi trong đề chính thức bắt buộc phải ở trạng thái đã phê duyệt (`approved`). Nếu có câu bị sửa đổi sau khi duyệt, hệ thống tự động gắn cờ `needs_review` và chặn khóa đề.
  - Kiểm tra độ khớp từng ô ma trận: dạng câu, mức độ, YCCĐ, thang điểm.
  - Kiểm tra làm tròn điểm: GK/CK làm tròn đến 0,1; KTTX làm tròn đến số nguyên.
- **Hành động Khóa (Lock):** Khóa đồng thời cả bộ đề thi và đề cương căn cứ. Đề đã khóa sẽ sinh mã băm SHA-256 nội dung. Nếu sửa đổi bất kỳ nội dung nào, đề sẽ tự động mất trạng thái khóa và phải duyệt lại từ đầu.

### Bước 5: Phát hành chính thức (Release)
- **Quy tắc phát hành:**
  - Đề cương ôn tập được phát hành trước cho học sinh.
  - Hệ thống CHẶN phát hành đề cương nếu bộ đề thi tương ứng chưa được khóa hoàn tất (để đảm bảo tính ổn định và tính toàn vẹn của tiêu chí 90%).
  - Đề thi chính thức được phát hành khi mã băm hash khớp tuyệt đối với bản đã khóa.
- **Bảo toàn nội dung:** Đề đã phát hành giữ nguyên nội dung độc lập, không tự động cập nhật khi câu hỏi trong ngân hàng gốc có chỉnh sửa.

### Bước 6: Xuất bản & Hoán vị mã đề
- **Hoán vị mã đề (Permutation):**
  - Tự động sinh các mã đề con (ví dụ: 101, 102, 103, 104) từ mỗi đề gốc bằng thuật toán xáo trộn câu và xáo trộn các phương án trả lời.
  - Tự động sinh Bảng đối chiếu đáp án hoán vị (Ma trận đáp án đối chiếu giữa các mã đề).
- **Xuất tệp đa định dạng:**
  - **Tệp Word (.docx) & PDF:** Khổ ngang, bảng $\le 24\,\text{cm}$, font Times New Roman, lề $1,0\,\text{cm}$, không có logo trường trên đề thi.
  - **Tệp LMS:** Định dạng trắc nghiệm chuẩn để tải lên hệ thống LMS Asian School (đáp án đúng bôi đậm, không có bảng đáp án cuối trang).
  - **Bản dành cho học sinh:** Tuyệt đối loại bỏ toàn bộ đáp án, thang điểm chi tiết, gợi ý chấm và metadata đáp án đúng.
