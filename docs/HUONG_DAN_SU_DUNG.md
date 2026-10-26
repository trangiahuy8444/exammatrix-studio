# 📖 CẨM NANG HƯỚNG DẪN SỬ DỤNG HỆ THỐNG EXAMMATRIX STUDIO
### VÀ QUY CHUẨN LOẠI & ĐỊNH DẠNG DỮ LIỆU ĐẦU VÀO
**Đơn vị:** Trường Tiểu học, THCS & THPT Quốc tế Á Châu (Asian School)  
**Phạm vi áp dụng:** Giáo viên các bộ môn (Tin học, Toán học, Vật lí, Hóa học, Sinh học, Ngữ văn, Lịch sử, Địa lí, Tiếng Anh) và Tổ chuyên môn Khối 8, 9, 10, 11, 12.

---

## PHẦN 1. BẢNG TRA CỨU NHANH 7 LUỒNG CÔNG TÁC (QUICK REFERENCE CHEAT SHEET)

| STT | Luồng công tác | Vị trí trên web | Các bước thực hiện chính | Kết quả đầu ra | Lưu ý tuân thủ |
|:---:|:---|:---|:---|:---|:---|
| **1** | **Tra cứu & Quản lý PPCT** | Tab `Phân phối chương trình` | 1. Chọn Môn học và Khối lớp.<br>2. Xem bảng danh mục bài, tuần, tiết, YCCĐ chuẩn GDPT 2018.<br>3. Bấm `+ Thêm bài học PPCT` hoặc `Sửa`/`Xóa` nếu cần. | Danh mục bài học và YCCĐ chuẩn của môn học. | Số bài và YCCĐ tuân thủ KHDH và Quy tắc 5 (Rule 5). |
| **2** | **Quản lý Ngân hàng câu hỏi** | Tab `Ngân hàng câu hỏi` | 1. Lọc theo Môn, Khối, Bài học, Mức độ nhận thức.<br>2. Bấm `+ Thêm câu hỏi` để nhập câu hỏi mới.<br>3. Chỉnh sửa nội dung, phương án, đáp án đúng, lời giải.<br>4. Thẩm định và duyệt câu hỏi (`Duyệt nội dung` / `Phê duyệt`). | Kho câu hỏi đạt chuẩn thẩm định, sẵn sàng đưa vào đề thi. | Câu mới tạo ở trạng thái `Chờ duyệt` (Draft), chỉ câu đã duyệt mới được đưa vào đề thi. |
| **3** | **Sử dụng Trợ lý AI (Gemini)** | Nút `✨ Trợ lý AI (Gemini)` | 1. Cấu hình API Key tại tab `Cấu hình API Key`.<br>2. **Mode 1 (Theo YCCĐ):** Chọn Môn, Khối, Bài, mức độ $\rightarrow$ Chọn gợi ý YCCĐ $\rightarrow$ Bấm `Tạo câu hỏi`.<br>3. **Mode 2 (Bóc tách đề thô):** Chọn Môn & Khối $\rightarrow$ Dán văn bản $\rightarrow$ Bấm `Bóc tách`.<br>4. **Mode 3 (Sinh biến thể):** Chọn câu có sẵn $\rightarrow$ Bấm `Sinh biến thể`.<br>5. Xem trước, chỉnh sửa trực tiếp và bấm lưu (Chờ duyệt). | Bộ câu hỏi mới kèm đáp án và lời giải chi tiết. | API Key lưu cục bộ an toàn trên trình duyệt cá nhân. Không phát sinh chi phí khi chưa cho phép. |
| **4** | **Thiết lập Ma trận & Bảng đặc tả** | Tab `Ma trận & Đặc tả` | 1. Chọn Khối lớp, Đợt kiểm tra (Giữa kỳ / Cuối kỳ).<br>2. Phân bổ số câu MC, YN, SHORT, ES vào từng dòng YCCĐ.<br>3. Hệ thống tự động tính toán tổng điểm cân bằng $10.0$ điểm. | Bảng Ma trận (Table 0) và Bảng đặc tả chuẩn. | Số câu dạng thuần số `(1, 2, 3)` (Rule 2). Ghi số câu ở cuối YCCĐ (Rule 2). Khổ ngang $\le 24\text{ cm}$ (Rule 3). |
| **5** | **Trộn đề thi & Sinh mã đề hoán vị** | Tab `Đề thi & Đề cương` | 1. Chọn Ma trận nguồn.<br>2. Chọn số lượng mã đề hoán vị (**2 hoặc 4 mã đề**).<br>3. Bấm `Sinh đề thi hoán vị`.<br>4. Hệ thống xáo trộn độc lập câu hỏi và các phương án A, B, C, D. | - Các mã đề thi học sinh.<br>- Các bản Hướng dẫn chấm tương ứng.<br>- **Bảng đáp án tổng hợp (Master Answer Grid)**. | 90% câu hỏi bám sát Đề cương ôn tập (Rule 1). Bảo toàn nhóm câu chung ngữ liệu và phương án cố định. |
| **6** | **Xuất bản & Tải Hồ sơ (.zip)** | Nút tải tại trang chi tiết Đề thi / Ma trận | 1. Bấm `Tải gói hồ sơ (.zip)` để tải 1-click trọn bộ.<br>2. Hoặc tải lẻ từng file Word (`.docx`) hoặc PDF (`.pdf`). | Gói ZIP gồm đủ: Đề thi các mã, Đáp án các mã, Master Answer Grid, Ma trận, Bảng đặc tả, Đề cương. | Đủ cả 2 định dạng Word và PDF (Rule 4). Font Times New Roman, lề chuẩn, không tràn viền (Rule 3). |
| **7** | **Xuất file Trắc nghiệm LMS** | Tab `Đề thi & Đề cương` $\rightarrow$ `Xuất LMS` | 1. Chọn đề thi hoặc đề cương cần đưa lên LMS.<br>2. Bấm `Xuất file LMS`. | File văn bản chuẩn định dạng import LMS Canvas/Moodle/Google Form. | **Không có bảng đáp án ở cuối file** (Rule 6). Nhãn đúng đặt trong ngoặc vuông **`[A.] `** hoặc **`[a)] [ĐÚNG]`** (Rule 6). |

---

## PHẦN 2. QUY CHUẨN LOẠI DỮ LIỆU & ĐỊNH DẠNG ĐẦU VÀO (INPUT SPECIFICATIONS)

Nhằm đảm bảo hệ thống vận hành chính xác, render công thức mượt mà và biên dịch Word/PDF chuẩn mực, toàn bộ dữ liệu nhập vào hệ thống cần tuân thủ các quy chuẩn sau:

### 2.1. Cấu trúc câu hỏi ngân hàng (Question JSON Schema)

| Tên trường | Kiểu dữ liệu | Bắt buộc | Mô tả & Quy cách định dạng |
|:---|:---|:---:|:---|
| `subject_name` | String | **Có** | Tên môn học chính xác: `"Tin học"`, `"Toán học"`, `"Vật lí"`, `"Hóa học"`, `"Sinh học"`, `"Ngữ văn"`, `"Lịch sử"`, `"Địa lí"`, `"Tiếng Anh"`. |
| `grade` | Integer | **Có** | Khối lớp: `8`, `9`, `10`, `11`, hoặc `12`. |
| `lesson_code` | String | **Có** | Mã bài học trong PPCT (ví dụ: `"B1"`, `"B2"`, `"B12"`, `"U1"`). |
| `type` | String | **Có** | Dạng câu hỏi: `"MC"` (Nhiều lựa chọn), `"YN"` (Đúng/Sai), `"SHORT"` (Trả lời ngắn), `"ES"` (Tự luận). |
| `level` | String | **Có** | Mức độ nhận thức: `"Biết"`, `"Hiểu"`, hoặc `"Vận dụng"`. |
| `learning_outcome` | String | **Có** | Yêu cầu cần đạt chuẩn GDPT 2018 (lấy từ PPCT môn học). |
| `question` | String | **Có** | Nội dung câu hỏi (chấp nhận văn bản thường, công thức $\LaTeX$, khối code, bảng markdown). |
| `options` | Array[4] | Với MC | Mảng đúng 4 chuỗi phương án `[A, B, C, D]`. Không được để trống phương án nào. |
| `correct` | Integer | Với MC | Chỉ số đáp án đúng: `0` (tương ứng A), `1` (tương ứng B), `2` (tương ứng C), `3` (tương ứng D). |
| `statements` | Array[4] | Với YN | Mảng 4 mệnh đề `[ {label: "a", text: "...", correct: true/false}, ... ]`. |
| `rubric` | Array | Với ES | Mảng các bước chấm `[ {step: "...", points: 0.5}, ... ]` với tổng điểm khớp câu hỏi. |
| `option_explanations`| Array/Str | Không | Hướng dẫn giải chi tiết cho câu hỏi hoặc từng phương án. |
| `shared_context` | String | Không | Đoạn văn / ngữ cảnh dùng chung cho chùm câu (giữ liền kề khi trộn đề). |
| `fixed_order_options`| Boolean | Không | Đặt `true` nếu các phương án không được đảo thứ tự (ví dụ: phương án chứa "Cả A và B đều đúng"). |
| `review_status` | String | **Có** | Trạng thái thẩm định: `"draft"` (Chờ duyệt), `"content_checked"` (Đã kiểm tra), `"approved"` (Đã phê duyệt). |

---

### 2.2. Quy chuẩn Công thức Toán học & Ký hiệu Khoa học ($\LaTeX$)

Hệ thống tích hợp bộ xử lý công thức toán học chuyên sâu. Mọi công thức toán, lý, hóa phải được định dạng bằng cú pháp $\LaTeX$:

1. **Công thức cùng dòng (Inline Math):**
   - Đặt giữa cặp dấu dollar đơn: `$ ... $`.
   - *Ví dụ đúng:* 
     - Nghiệm của phương trình là `$x = \frac{-b \pm \sqrt{\Delta}}{2a}$`.
     - Cho tam giác vuông có cạnh góc vuông `$a = 3\text{ cm}$` và góc `$\alpha = 45^\circ$`.
   - *Không nên viết:* `x = (-b +- sqrt(delta))/(2a)` (sẽ không render đẹp chuẩn sách giáo khoa).

2. **Công thức khối biệt lập (Display Math):**
   - Đặt giữa cặp dấu dollar kép: `$$ ... $$`.
   - *Ví dụ đúng:*
     $$S = \int_{a}^{b} f(x) \, dx$$

3. **Lưu ý dấu dollar trong văn bản thường:**
   - Khi viết về giá tiền (dollar), bắt buộc phải gõ `\$` (ví dụ: `Giá của thiết bị là \$250`), để tránh hệ thống hiểu nhầm là mở thẻ công thức toán.

---

### 2.3. Quy chuẩn Khối Mã Nguồn Lập trình (Code Snippets)

Dành cho môn Tin học (Python, C++, Scratch, Pascal, SQL, HTML/CSS):

1. **Cú pháp khối code:**
   ````text
   ```python
   def kiem_tra_so_nguyen_to(n):
       if n < 2:
           return False
       for i in range(2, int(n**0.5) + 1):
           if n % i == 0:
               return False
       return True
   ```
   ````

2. **Quy định bảo toàn khoảng trắng:**
   - Giữ nguyên thụt lề (Indentation) chuẩn mực của ngôn ngữ lập trình (4 spaces cho Python).
   - Hệ thống tự động chuyển đổi thành font `Consolas` trong bản Word và khối `lstlisting` / `Verbatim` trong bản XeLaTeX.

---

### 2.4. Quy chuẩn Định dạng Văn bản thô cho AI Bóc tách (Mode 2)

Khi sử dụng tính năng **✨ Trợ lý AI $\rightarrow$ Chế độ 2: Bóc tách & Cấu trúc hóa đề thô**, giáo viên cần chuẩn bị văn bản theo các cấu trúc nhận diện dưới đây để AI trích xuất chính xác 100%:

#### Mẫu 1: Câu hỏi Trắc nghiệm 4 lựa chọn (MC)
```text
Câu 1: Thiết bị nào sau đây là thiết bị vào của máy tính?
A. Màn hình
B. Máy in
C. Bàn phím
D. Loa
Đáp án: C
Lời giải: Bàn phím là thiết bị vào dùng để nhập dữ liệu ký tự vào máy tính.
```

#### Mẫu 2: Câu hỏi Trắc nghiệm Đúng / Sai (YN)
```text
Câu 2: Cho các nhận định sau về an toàn thông tin và văn hóa mạng:
a) Không chia sẻ mật khẩu tài khoản cá nhân cho người lạ. [ĐÚNG]
b) Mọi thông tin trên mạng xã hội đều được kiểm duyệt chính xác 100%. [SAI]
c) Cần bật tính năng xác thực hai yếu tố (2FA) cho email. [ĐÚNG]
d) Được phép sử dụng hình ảnh của người khác khi chưa có sự đồng ý. [SAI]
Lời giải: Các thông tin trên mạng xã hội chưa được kiểm chứng có thể là tin giả.
```

#### Mẫu 3: Câu hỏi Trả lời ngắn (SHORT)
```text
Câu 3: Kết quả của biểu thức (17 MOD 5) + (17 DIV 5) trong Pascal bằng bao nhiêu?
Đáp án: 5
Lời giải: 17 MOD 5 = 2; 17 DIV 5 = 3. Tổng 2 + 3 = 5.
```

#### Mẫu 4: Câu hỏi Tự luận có Barem điểm (ES)
```text
Câu 4: Em hãy nêu hai biện pháp phòng chống mã độc bảo vệ máy tính cá nhân.
Barem:
- Biện pháp 1: Cài đặt và cập nhật thường xuyên phần mềm diệt virus uy tín (0.5 điểm).
- Biện pháp 2: Không mở tệp đính kèm hoặc đường link đáng ngờ từ người lạ (0.5 điểm).
```

---

### 2.5. Quy chuẩn Định dạng File Trắc nghiệm Upload lên LMS (Rule 6)

Tuân thủ nghiêm ngặt **Quy tắc 06 của Nhà trường**:
1. **Không để bảng đáp án** ở cuối file.
2. **Đáp án đúng:** Nhãn phương án được in đậm và đặt trong dấu ngoặc vuông: **`[A.] `**, **`[B.] `**, **`[C.] `**, **`[D.] `** (nội dung phương án viết bình thường, không chèn các nhãn thừa như `[ĐÁP ÁN ĐÚNG]`).
3. **Phương án sai:** Nhãn phương án viết bình thường không ngoặc vuông: `A. `, `B. `, `C. `, `D. `.
4. **Dạng thức Đúng/Sai:** 
   - Ý đúng: **`[a)] `** `Nội dung nhận định [ĐÚNG]`
   - Ý sai: `b) ` `Nội dung nhận định [SAI]`

*Ví dụ trích đoạn file LMS chuẩn:*
```text
Câu 1: RAM là loại bộ nhớ gì trong máy tính?
[A.] Bộ nhớ truy cập ngẫu nhiên, dữ liệu bị mất khi mất điện.
B. Bộ nhớ chỉ đọc, dữ liệu không bị mất khi mất điện.
C. Bộ nhớ ngoài dung lượng lớn.
D. Bộ nhớ đệm tốc độ cao nằm trong CPU.

Câu 2: Các nhận định sau về mạng máy tính:
[a)] Internet là mạng toàn cầu kết nối hàng triệu máy tính. [ĐÚNG]
b) Mạng LAN chỉ kết nối được tối đa 2 máy tính. [SAI]
[c)] Switch là thiết bị chuyển mạch kết nối các thiết bị trong mạng cục bộ. [ĐÚNG]
d) Mạng không dây (Wi-Fi) có tốc độ truyền tải nhanh hơn cáp quang. [SAI]
```

---

## PHẦN 3. CÁC CÂU HỎI THƯỜNG GẶP (FAQ) & XỬ LÝ SỰ CỐ

1. **Câu hỏi:** *Tại sao khi trộn đề, các phương án "Cả A và B đều đúng" lại bị đảo lên đầu thành phương án A?*  
   **Trả lời:** Với những câu hỏi có phương án phụ thuộc thứ tự, giáo viên cần tích chọn tùy chọn **"Giữ nguyên thứ tự phương án (Không đảo A, B, C, D)"** (`fixed_order_options: true`) trong trình chỉnh sửa câu hỏi.

2. **Câu hỏi:** *Khóa Gemini API Key có bị lộ ra ngoài hoặc chia sẻ cho người khác không?*  
   **Trả lời:** Không. Khóa API Key được mã hóa và lưu trực tiếp trong Local Storage trên trình duyệt của máy tính Thầy/Cô, hệ thống không gửi hay lưu khóa trên bất kỳ máy chủ công cộng nào.

3. **Câu hỏi:** *Bảng đặc tả và Ma trận tải về mở trong Word có bị vỡ viền hay tràn trang không?*  
   **Trả lời:** Không. Pipeline xuất Word của hệ thống được lập trình trực tiếp qua OpenXML Native với độ rộng cố định $\le 24\text{ cm}$ (khổ giấy ngang Landscape), đảm bảo vừa khít 100% lề trang và tự động lặp lại tiêu đề bảng khi sang trang mới.
