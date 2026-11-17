---
name: thiet-ke-chuc-nang
description: >-
  Sử dụng skill này khi cần phân tích yêu cầu, thiết kế luồng người dùng (User Flow), xây dựng wireframe
  hoặc viết tài liệu đặc tả chức năng (PRD / Functional Spec) cho ứng dụng Ngân hàng đề. Skill này
  hướng dẫn phương pháp thiết kế lấy giáo viên làm trung tâm, gắn liền với chu trình kiểm tra đánh giá
  thực tế (TT 22, CV 7991, TT 32, quy định Asian School) và bảo đảm tính khả thi kỹ thuật.
---

Đọc `docs/QUY_TRINH_AGENTS.md` và phiếu liên quan trong `docs/KE_HOACH_HOAT_DONG_AGENTS.md` để xác định phạm vi, quyền ghi và tiêu chí bàn giao trước khi áp dụng quy trình.


# Quy trình Thiết kế Chức năng Nghiệp vụ Sư phạm (thiet-ke-chuc-nang)

Skill này cung cấp phương pháp luận và biểu mẫu chuẩn để phân tích, thiết kế các tính năng mới trong dự án `ngan-hang-de-web`.

## 1. Phương pháp Thiết kế Lấy Giáo viên Làm Trung tâm

Trước khi bắt tay vào thiết kế bất kỳ tính năng nào, bắt buộc trả lời bộ câu hỏi 4T:
1. **Thời điểm (When):** Tính năng này giáo viên dùng khi nào? (Đầu năm chuẩn bị PPCT, trước kỳ thi 2 tuần soạn đề cương, hay đêm trước ngày nộp đề in ấn?)
2. **Tâm trạng (State of mind):** Giáo viên đang chịu áp lực gì? (Sợ trễ hạn, sợ sai đáp án, sợ học sinh khiếu nại đề ra ngoài đề cương, sợ bảng in bị vỡ hạt/tràn viền?)
3. **Thao tác (Action):** Thao tác nào tốn nhiều thời gian nhất? Làm thế nào để giảm từ 10 cú click chuột xuống còn 2-3 thao tác trực quan?
4. **Tình huống biên (What if):** Nếu mạng chập chờn, nếu ngân hàng câu hỏi thiếu câu, nếu giáo viên vô tình click xóa nhầm thì hệ thống cứu vãn ra sao?

## 2. Cấu trúc Tài liệu Đặc tả Chức năng Chuẩn (`docs/THIET_KE_<CHUC_NANG>.md`)

Mỗi bản thiết kế chức năng cần tuân thủ cấu trúc 5 phần sau:

```markdown
# ĐẶC TẢ THIẾT KẾ CHỨC NĂNG: <TÊN CHỨC NĂNG>

## 1. Bối cảnh & Mục tiêu Nghiệp vụ
- **Đối tượng sử dụng:** Giáo viên môn ... (Khối 8, 9, 10).
- **Vấn đề cần giải quyết:** ...
- **Căn cứ pháp lý & Quy định:** TT 22, CV 7991, rules/01 - 06...

## 2. Luồng Trải nghiệm Người dùng (User Flow)
- Sơ đồ tuần tự các bước giáo viên thao tác.
- Phạm vi lưu nháp hiện có, yêu cầu đã được chốt và hành vi khi lưu lỗi; không coi tự động lưu mọi bước là chức năng đã có.

## 3. Đặc tả Chi tiết Giao diện & Tương tác (UI/UX)
- Bố cục màn hình (Layout wireframe dạng ASCII hoặc mô tả khối).
- Danh sách các trường nhập liệu, nút bấm, thông báo cảnh báo (bằng tiếng Việt sư phạm).
- Bảng hiển thị thông tin song song (ví dụ: Ma trận cạnh danh sách câu hỏi).

## 4. Xử lý Tình huống Ngoại lệ & An toàn (Edge Cases)
- Thiếu câu hỏi approved trong ngân hàng: Hiển thị gợi ý gì?
- Thay đổi ngân hàng sau khi đã khóa đề: snapshot đề phải giữ nguyên; thay đổi đề khóa cần tạo bản nháp mới.
- Bảo mật quyền xem đáp án: Ứng xử với người dùng không có quyền `answers`.

## 5. Hợp đồng Dữ liệu & Kế hoạch Triển khai (Data Contract & Implementation)
- Cấu trúc JSON gửi/nhận qua API (`server.py`).
- Lưu trữ trong `DatabaseStorage` (`legacy_storage.py`).
- Phân công nhiệm vụ: Backend (`ky-su-backend`) vs Frontend (`ky-su-frontend`).
```

## 3. Các Nguyên tắc Thiết kế Bắt buộc trong Dự án

1. **Nguyên tắc "An toàn là trên hết":**
   - Đề thi chính thức chỉ dùng câu hỏi `approved`.
   - Đề phát cho học sinh tuyệt đối không lộ đáp án trong nội dung hay metadata file Word.
2. **Nguyên tắc "Tự động nhưng cho phép can thiệp":**
   - Hỗ trợ tạo đề/đề cương tự động, nhưng giáo viên luôn có quyền chỉnh sửa số câu từng ô hoặc tự tay chọn câu hỏi nếu muốn.
3. **Nguyên tắc "Không để mất công sức":**
   - Kiểm tra lưu nháp theo quyết định đã chốt; không tuyên bố không mất dữ liệu khi chưa thử reload, lỗi mạng và lưu thất bại. Phát hiện khoảng trống thì lập yêu cầu sửa cụ thể.
