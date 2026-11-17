---
name: kiem-dinh-nghiep-vu
description: >-
  Sử dụng skill này khi cần kiểm định và đối chiếu tính chuẩn xác nghiệp vụ sư phạm và pháp lý
  của ngân hàng đề theo Thông tư 22/2021/TT-BGDĐT, Công văn 7991/BGDĐT-GDTrH, Thông tư 32/2018/TT-BGDĐT
  và quy định nội bộ Asian School (rules/). Áp dụng cho kiểm tra tỉ lệ ma trận, tiêu chí đề cương
  T >= 90%, phủ YCCĐ 100%, quy tắc làm tròn điểm GK/CK (0,1) và KTTX (số nguyên).
---

Đọc `docs/QUY_TRINH_AGENTS.md` và phiếu liên quan trong `docs/KE_HOACH_HOAT_DONG_AGENTS.md` để xác định phạm vi, quyền ghi và tiêu chí bàn giao trước khi áp dụng quy trình.


# Quy trình Kiểm định Nghiệp vụ Khảo thí (kiem-dinh-nghiep-vu)

Skill này cung cấp các bước chi tiết để chuyên viên hoặc agent khảo thí thực hiện việc kiểm định logic nghiệp vụ trong dự án `ngan-hang-de-web`.

## 1. Căn cứ Pháp lý & Quy chuẩn

1. **Thông tư 22/2021/TT-BGDĐT:**
   - Điều 5: Điểm đánh giá định kỳ (Giữa kỳ, Cuối kỳ) làm tròn đến $0,1$ điểm.
   - Điều 6: Số đầu điểm ĐĐGtx (2 đầu điểm cho môn $\le 35$ tiết/năm; 3 đầu điểm cho môn $36 - 70$ tiết/năm; 4 đầu điểm cho môn $> 70$ tiết/năm).
2. **Công văn 7991/BGDĐT-GDTrH:**
   - Đối chiếu cấu trúc câu Đúng/Sai với bản gốc. Hệ số 0 / 0,1 / 0,25 / 0,5 / 1 là cấu hình mặc định đã ghi trong `docs/BOI_CANH.md`, chưa được quy thành yêu cầu pháp lý bắt buộc nếu thiếu căn cứ.
   - Không gán một tỉ lệ bốn mức cố định cho CV 7991. Tra bản gốc và phạm vi THCS/THPT trước khi kết luận; phân biệt tỉ lệ tham khảo của Bộ với ma trận nội bộ đã khóa. Xem `docs/BOI_CANH.md`, `domain/profiles.py`, `domain/matrix_checks.py`.
3. **Quy định nội bộ Asian School (`../rules/`):**
   - Tiêu chí đề cương: $T = \frac{\text{trùng} + \text{bám sát}}{\text{tổng}} \ge 90\%$.
   - Độ phủ YCCĐ ma trận: $100\%$.
   - Làm tròn điểm KTTX: Đến số nguyên ($0 \rightarrow 10$).

## 2. Các bước Thực hiện Kiểm tra

### Bước 1: Tra cứu mã nguồn nghiệp vụ
- Kiểm tra chính sách và ràng buộc tại:
  - `domain/policies.py`, `domain/scoring.py`: Chính sách và quy tắc làm tròn; `domain/matrix_checks.py`: tỷ lệ dung sai (`ratio_tolerance`).
  - `bank_service.py`: Hàm `BankService.generate_exam()`, `BankService.verify_exam()`; tiêu chí đề cương tại `domain/revision_criterion.py`. Dùng tìm kiếm mã để xác nhận chữ ký trước khi gọi.
  - `matrices/`: Logic ánh xạ ô ma trận và YCCĐ.

### Bước 2: Chạy kiểm thử tự động
Chạy các bài kiểm tra chuyên sâu về logic nghiệp vụ:
```sh
.venv/bin/python -m unittest tests/test_backend.py
.venv/bin/python -m unittest tests/test_exam_verification.py
```
> [!NOTE]
> Nếu test bị `skipTest` do thiếu file mật cá nhân, phải ghi nhận rõ trong báo cáo, không được tự ý kết luận là đã đạt.

### Bước 3: Lập bảng đối chiếu pháp lý
Soạn bảng đối chiếu:
```
| Quy định | Loại văn bản | Hàm thực thi (tệp:dòng) | Test chứng minh | Đánh giá |
```
- Phân định rõ 3 cấp độ: Bắt buộc của Bộ, Quy định của trường/tổ, Ngưỡng kỹ thuật nội bộ.
