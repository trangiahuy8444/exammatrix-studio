# Review bảo mật đáp án và fixture kiểm thử

Ngày: 29/10/2026. Vai trò: reviewer độc lập, chỉ đọc mã sản phẩm; chỉ tạo báo cáo này trong repo nguồn.

## Kết luận

**Chấp nhận trong phạm vi bản sửa được giao; không phát hiện lỗi chặn tích hợp.** Kết luận này không xác nhận nghiệm thu C2, CK1 ba khối, tính an toàn toàn bộ API/bản xuất, hoặc các phần `bank_service`/bridge đang do tác tử khác xử lý.

## Phạm vi và căn cứ

- Nguồn: repo `ngan-hang-de-web` trong workspace; ứng viên: `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`.
- Phiếu giao nói “5 tệp” nhưng chỉ liệt kê **4 đường dẫn**: `domain/answer_access.py`, `tests/test_answer_redaction.py` (mới), `tests/test_test_mode.py`, `tests/test_c2_scenarios.py`. Review giới hạn ở 4 đường dẫn này; chưa suy đoán tệp thứ năm.
- Đã đọc `AGENTS.md`, quy tắc riêng của repo và các tài liệu trạng thái `docs/BOI_CANH.md`, `docs/LO_TRINH.md`, `docs/NHAT_KY.md`. Dùng hướng dẫn `code-review-skill` để rà logic, bảo mật và mức bao phủ.
- Chỉ đọc thêm fixture và helper liên quan để hiểu hợp đồng; không review hoặc sửa `bank_service`/bridge; không chạy ứng dụng hay CSDL thật.

## Kết quả đối chiếu

| Yêu cầu | Bằng chứng | Đánh giá |
| --- | --- | --- |
| Xóa đáp án lồng trong `statements` ở mọi độ sâu JSON | Bỏ nhánh chỉ xóa `correct` ở cấp đầu; mọi giá trị dict/list đều gọi lại `redact_answers`. Hai test mới kiểm tra nested metadata, children, nested statements và toàn bộ `ANSWER_KEYS`. | Đạt |
| Giữ dữ liệu công khai, không đổi đầu vào | Test so sánh toàn bộ cấu trúc đầu ra và bản sao đầu vào; helper tạo dict/list mới. Thử độc lập ở 9 độ sâu kiểm tra thêm idempotence và chỉnh root kết quả không đổi nguồn. | Đạt |
| Sandbox dùng dữ liệu tự soạn, không đọc `DEFAULT_BANK` | `setUp` dùng `test_backend.fixture()`, ghi vào `TemporaryDirectory`; truyền rõ `bank_path` và `data_dir`. Không còn import/đọc `DEFAULT_BANK` trong test. | Đạt |
| Tránh tranh cổng cố định | `create_server(..., port=0)` để hệ điều hành chọn cổng; `tearDown` đóng socket. | Đạt |
| B9 thiếu theo YCCĐ dù tổng ngân hàng đủ lớn | `minimal_matrix()` được đổi sang TX Khối 8, YCCĐ thứ hai của B1; fixture gốc có 16 câu MC approved thuộc YCCĐ thứ nhất. Ba câu tự tạo ở ô thiếu có ba trạng thái chưa duyệt. | Đạt |
| Xác nhận số đếm từng trạng thái | Kiểm tra chính xác `(needed, approved, shortfall) == (1, 0, 1)`, ba số đếm pending/needs/draft đều là 1; báo cáo có đúng một ô và tổng thiếu 1. | Đạt |
| Không đánh đồng hồi quy với nghiệm thu CK1 | Docstring đã ghi rõ dữ liệu tự soạn TX Khối 8, không thay nghiệm thu GK1/CK1 ba khối. | Đạt |

## Kiểm chứng thực hiện bởi reviewer

- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_answer_redaction.py -v` trong snapshot: **2/2 PASS**.
- Probe thuần trực tiếp `redact_answers` trên 9 độ sâu từ 0 đến 8: **PASS**; lọc mọi khóa trong `ANSWER_KEYS`, giữ chuỗi/None/bool/số/list rỗng, không đổi nguồn, lặp lọc ổn định.
- Không chạy lại sandbox/C2 để tránh mở server hoặc chạy công việc ngoài phần kiểm chứng thuần. Kết quả **sandbox 6 PASS, C2 6 PASS**, cùng bằng chứng redaction **2 FAIL → PASS**, là thông tin điều phối đã cung cấp, không phải lần chạy độc lập của reviewer.

## Góp ý không chặn

Ở `tests/test_c2_scenarios.py:55`, `len(bank) >= 16` hiện đúng vì fixture có 16 MC approved. Có thể tăng độ tự bảo vệ của test bằng cách đếm trực tiếp các câu `type == 'MC'` và `review_status == 'approved'` thuộc YCCĐ khác, để thay đổi fixture sau này không làm mất tiền đề “tổng câu đã duyệt đủ nhiều”. Không cần thay đổi để xử lý hồi quy hiện tại.

Các kiểm thử hiện tại chứng minh hợp đồng dict/list của dữ liệu JSON; không có kết luận mở rộng sang object Python tùy ý, tất cả endpoint, các định dạng xuất, hoặc nghiệm thu nghiệp vụ với giáo viên.
