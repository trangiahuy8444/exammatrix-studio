# ĐẶC TẢ THIẾT KẾ CHỨC NĂNG: WIZARD RA ĐỀ 6 BƯỚC & KHÓA THEO BỘ (MỐC C1)

> Tác giả: Agent `thiet-ke-chuc-nang` (Chuyên gia Thiết kế Chức năng & Nghiệp vụ Sư phạm)  
> Ngày: 29/10/2026 (Cập nhật phản hồi thực tế của giáo viên ngày 30/10/2026)  
> Mục tiêu: Hiện thực hóa trọn vẹn Mốc C1 trong `docs/LO_TRINH.md`.

---

## 1. Bối cảnh & Giá trị Nghiệp vụ

### 1.1. Thực tế giảng dạy & kiểm tra của giáo viên
- **Thứ tự nghiệp vụ chuẩn:** Giáo viên không bao giờ làm đề trước rồi mới làm đề cương. Thứ tự thực tế bắt buộc: **Ma trận $\rightarrow$ Đề cương $\rightarrow$ Bộ đề**.
- **Tính công bằng & Chống lộ đề:**
  - Để học sinh không học tủ hoặc đoán đề, giáo viên lập đề cương rộng hơn đề thi (đề thi chỉ lấy $\ge 90\%$ từ đề cương, $10\%$ là câu phân hóa ngoài đề cương nhưng cùng YCCĐ).
  - Khi tổ chức thi tại các lớp, giáo viên cần một **bộ đề gồm 2 đến 6 đề khác hẳn câu nhau** (cho các ca thi hoặc các lớp khác nhau), sau đó mỗi đề lại được xáo thành 4 mã đề hoán vị (101, 102, 103, 104).
- **Ràng buộc an toàn sinh tử (Crucial Safety Rule):**
  - **Chặn phát đề cương khi bộ đề chưa khóa:** Nếu giáo viên phát đề cương cho học sinh ôn tập trong khi bộ đề thi chính thức chưa được chốt và khóa, giáo viên có thể vô tình sửa đề thi dẫn đến tỷ lệ trùng rơi xuống dưới $90\%$ hoặc ra vào câu học sinh chưa được ôn. Do đó: **Bộ đề phải được khóa trước, sau đó mới cho phép phát hành đề cương**.
  - **Duyệt và khóa theo cả bộ:** Giáo viên không muốn phải bấm duyệt/khóa lẻ tẻ từng đề trong bộ 4 đề (4 lần thao tác lặp lại). Hệ thống cần hỗ trợ duyệt, khóa và phát hành đồng loạt cho toàn bộ đề trong 1 lần bấm, với cơ chế rollback an toàn nếu có bất kỳ đề nào không đạt chuẩn.

---

## 2. Luồng Trải nghiệm Người dùng (User Flow 6 Bước)

```
[B1: Chọn kỳ & Khóa Ma trận]
           ↓
[B2: Lập Đề cương ôn tập] (Tự động theo ma trận / Thủ công đối chiếu ô ma trận)
           ↓
[B3: Sinh Bộ đề song song] (1 - 6 đề, tỷ lệ bám sát >= 90%, phủ YCCĐ 100%)
           ↓
[B4: Thẩm định & Khóa cả bộ] (Kiểm tra từng đề, Khóa đồng thời cả bộ đề)
           ↓
[B5: Phát hành chính thức] (Phát hành Đề cương -> Phát hành Bộ đề)
           ↓
[B6: Xuất bản & Hoán vị mã đề] (Xuất Word/PDF/LMS, sinh mã hoán vị 101-104)
```

---

## 3. Đặc tả Kỹ thuật & API (Data Contract)

### 3.1. API Chuyển trạng thái theo Bộ đề (`/api/exams/set/transition`)
- **Đầu vào (Request Payload):**
  ```json
  {
    "set_id": "SET-abc123def456",
    "action": "submit | return | approve | publish",
    "reason": "Lý do (bắt buộc khi action là return)"
  }
  ```
- **Xử lý Backend (`bank_service.py`):**
  - Tìm toàn bộ các đề thuộc `set_id` (`e.get('exam_set', {}).get('id') == set_id`).
  - Duyệt qua từng đề và thực hiện chuyển trạng thái nguyên tử (`exam_transition`):
    * `submit`: chuyển tất cả đề từ `drafting` $\rightarrow$ `pending_approval`.
    * `approve`: kiểm tra `_exam_question_problems`, `cell_check` ma trận, `revision_report` của từng đề. Nếu mọi đề đạt $\rightarrow$ tính `approved_hash`, chuyển sang `locked`. Nếu có bất kỳ đề nào lỗi $\rightarrow$ hủy toàn bộ giao dịch và báo lỗi chi tiết của đề đó.
    * `publish`: kiểm tra mã băm hiện tại có khớp `approved_hash` của từng đề $\rightarrow$ chuyển sang `published`.
- **Đầu ra (Response):**
  ```json
  {
    "set_id": "SET-abc123def456",
    "status": "locked | published | pending_approval | drafting",
    "exams": [ ... danh sách các đề đã cập nhật ... ],
    "exams_all": [ ... toàn bộ đề trong ngân hàng ... ]
  }
  ```

### 3.2. API Khóa & Phát hành Đề cương (`/api/revisions/transition`)
- **Đầu vào (Request Payload):**
  ```json
  {
    "id": "REV-xxx",
    "action": "lock | publish | unlock"
  }
  ```
- **Ràng buộc kiểm tra an toàn (Safety Guard):**
  - Khi `action == 'publish'`:
    * Hệ thống quét các đề hoặc bộ đề có `revision_id == id`.
    * Nếu tồn tại đề thi hoặc bộ đề đang ở trạng thái `drafting` hoặc `pending_approval` (chưa `locked` hoặc `published`):
      $\rightarrow$ **Ném lỗi `ServiceError` (409 Conflict):** *"Chưa thể phát hành đề cương vì bộ đề căn cứ (hoặc đề thi) chưa được khóa. Hãy thẩm định và khóa bộ đề trước khi phát hành đề cương cho học sinh."*
  - Nếu tất cả các đề liên quan đã `locked` hoặc `published` (hoặc đề cương độc lập chưa gắn đề):
    $\rightarrow$ Cho phép chuyển `revision['status'] = 'published'`, ghi nhận `published_at = now()`.

---

## 4. Đặc tả Giao diện Người dùng (UI Specification)

### 4.1. Thanh tiến trình Wizard (Wizard Progress Bar)
Đặt trên đầu màn hình chính khi đang trong quy trình ra đề:
- Hiển thị 6 bước trực quan với các trạng thái: `completed` (xanh lục), `active` (xanh dương sáng), `upcoming` (xám mờ).
- Cho phép bấm chuyển lại các bước trước để xem lại thông tin mà không mất trạng thái đang soạn.

### 4.2. Khối điều khiển tại Bước 4 (Thẩm định & Khóa cả bộ)
- Danh sách tóm tắt từng đề trong bộ: Tên đề, Số câu, Điểm tổng, Tỷ lệ trùng đề cương $T$, Trạng thái kiểm tra ma trận (Đạt/Lệch).
- Nút bấm chính: **"Khóa cả bộ đề"** (`approve` set).
- Cảnh báo rõ ràng nếu có đề chưa đủ điều kiện khóa.

### 4.3. Khối điều khiển tại Bước 5 (Phát hành)
- Nút 1: **"Phát hành Đề cương"** (nút này chỉ sáng lên sau khi Bộ đề đã ở trạng thái `locked`).
- Nút 2: **"Phát hành Bộ đề thi"** (chuyển toàn bộ đề sang `published`).

---

## 5. Phân công Thực hiện cho Nhóm Tác tử

1. **`ky-su-backend`**:
   - Viết hàm `exam_set_transition` trong `bank_service.py`.
   - Viết cơ chế kiểm tra `can_publish_revision` và hàm `revision_transition` trong `bank_service.py`.
   - Bổ sung 2 route API vào `server.py`: `/api/exams/set/transition` và `/api/revisions/transition`.
   - Viết unit test xác thực trong `tests/test_exam_set.py`.
2. **`ky-su-frontend`**:
   - Bổ sung giao diện Wizard 6 bước và các nút bấm Khóa/Phát hành theo bộ trong `public/app.js` và `public/index.html`.
   - Bổ sung kiểm thử logic frontend trong `tests/frontend.test.cjs`.
3. **`kiem-dinh-nghiep-vu` & `nghiem-thu`**:
   - Kiểm tra đối chiếu tính hợp lệ và chạy toàn bộ 4 bộ test tự động.
