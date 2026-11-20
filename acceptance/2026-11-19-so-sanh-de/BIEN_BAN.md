# Biên bản kỹ thuật — So sánh cấu trúc đề, 19/11/2026

## Kết quả sử dụng
Ở màn hình Đề kiểm tra, mỗi đề có nút **So sánh với đề khác**. Chọn 2–6 đề rồi bấm **So sánh các đề đã chọn**. Báo cáo từng cặp: khớp cấu trúc theo câu / có chênh lệch / chưa đủ căn cứ. Bảng chi tiết cho biết số câu và điểm để giáo viên tìm chỗ cần sửa.

Đối chiếu môn, khối, kỳ, thời lượng, số câu, điểm, dạng, mức độ, bài, YCCĐ, ô kết hợp và trọng số câu trong từng ô. Tỷ lệ dùng chung mã câu tính trên hợp mã, không khẳng định trùng nội dung; cảnh báo nếu cùng gia đình hoán vị. Không tự sửa đề hoặc duyệt/phát hành.

## Tệp thay đổi chính xác
| Tệp | Thay đổi |
|---|---|
| `domain/exam_comparison.py` (mới) | Hàm thuần thống kê và so sánh từng cặp snapshot, kiểm thiếu dữ liệu và điểm |
| `bank_service.py` | `compare_exams(ids)` chỉ lấy đề đã lưu trong storage hiện hành, giới hạn 2–6 ID khác nhau |
| `server.py` | POST `/api/exams/compare`, dùng chung legacy/Django, không nhận nội dung đề phía client |
| `public/exam-comparison.js` (mới) | Lõi báo cáo Pages và HTML escape dữ liệu; cùng hợp đồng với Python |
| `public/firebase-bridge.js` | Route so sánh chỉ đọc không gian hiện hành; ID không có báo lỗi |
| `public/index.html` | Nạp module mới trước bridge và thêm dialog riêng |
| `public/app.js` | Nút trên thẻ đề, hộp chọn, chặn chọn quá ít/nhiều, hiển thị báo cáo/lỗi |
| `tests/test_exam_comparison.py` (mới) | 8 ca lõi, gồm ô chéo, trọng số, điểm sai, dữ liệu thiếu, gia đình hoán vị, giới hạn và không biến đổi đầu vào |
| `tests/fixtures/exam_comparison.json` (mới) | Hai đề minh họa tự soạn, không phải đề/ngân hàng thật |
| `tests/exam_comparison.test.cjs` (mới) | 30 đầu vào so khớp Python/JS; escape HTML; thực thi bridge Pages và hàm submit thật trong môi trường giả |
| `tests/frontend.test.cjs` | Nối kiểm thử mới vào lệnh đã có của CI |
| `cloud/tests/test_exam_comparison.py` (mới) | 5 ca API: chỉ đọc/không đáp án; ID sai; cách ly tài khoản; chương trình; tài khoản không có quyền đáp án |
| `acceptance/2026-11-19-so-sanh-de/kiem_thu_trinh_duyet.py` (mới) | Tái chạy luồng Chromium với profile/dữ liệu giả |
| `README.md` | Hướng dẫn mở và đọc báo cáo |
| `docs/KE_HOACH_SO_SANH_DE.md` (mới) | Phân tích cấu trúc, thiết kế, các phần triển khai, tệp và rủi ro |
| `docs/BOI_CANH.md`, `docs/LO_TRINH.md`, `docs/NHAT_KY.md` | Ghi lựa chọn và mục tiêu giáo viên, trạng thái thực thi; giữ các ô nghiệm thu cũ |
| Biên bản này (mới) | Bằng chứng kiểm thử và giới hạn |

## Kiểm chứng cuối
Mã nền `935d752`, nhánh `merge-to-studio-main`. Python 3.11 trong môi trường tạm, thư viện ứng dụng đúng `cloud/requirements.lock`. CI dùng Python 3.12 nên kiểm tại máy này không thay kết quả CI.

| Kiểm tra | Kết quả |
|---|---|
| Engine: `python -m unittest discover -s tests` | 429 ca: **428 đạt, 1 bỏ qua**, 29,228 giây |
| Django: `python manage.py test --noinput` | **110/110 đạt**, 22,478 giây, SQLite thử nghiệm |
| `makemigrations --check --dry-run` | Không có thay đổi |
| Hai lệnh Node hiện có | Đạt; bao gồm 30 kịch bản đối chiếu Python/JS và kiểm handler UI mới |
| Chromium desktop 1440×1000, mobile 390×844 | Mở/chọn/giới hạn/so sánh khớp/lệch/chỉ đọc/đóng đạt |
| Cú pháp JS và `git diff --check` | Đạt |

Lượt Engine đầu bằng Python hệ thống thiếu python-docx; sau cài thư viện vào môi trường tạm có 12 lỗi do chặn mở socket. Chạy lại với quyền mở máy chủ thử nghiệm thì đạt như trên. Không gọi lỗi môi trường là lỗi sản phẩm.

Rà soát độc lập phát hiện hai lỗi đã sửa và có ca hồi quy tái hiện trước sửa: tổng điểm ô che khác trọng số câu; số `0.0001245` bị JS làm tròn khác Decimal. Tỷ lệ dùng chung cũng được chốt làm tròn nửa lên để nhất quán hai lõi.

## Giới hạn và việc còn lại
- Đây là đối chiếu cấu trúc theo câu. Chưa đo độ khó/độ phân biệt, chưa so sánh từng ý Đúng/Sai hoặc tự luận, chưa khẳng định tương đương tâm trắc.
- Không chạy PostgreSQL hoặc URL triển khai thật trong phiên này; chưa kiểm đồng bộ Firestore thật. Chromium dùng Pages/ngoại tuyến với dữ liệu giả; Django đã kiểm ở API.
- Ca chuyển Word thật sang PDF vẫn bị bỏ qua theo điều kiện có sẵn; không phải ca của chức năng mới. Chưa kiểm lại bản xuất Word/PDF bằng mắt.
- Hộp so sánh dùng được ở màn hình nhỏ; nền màn hình Đề kiểm tra hiện có tràn ngang trên viewport 390 px, chưa sửa layout toàn trang trong lượt này.
- Rủi ro cũ Pages chưa tương đương Django (sinh đề/thiếu câu/route chưa hỗ trợ), nhận diện localhost, và Pages deploy chưa chờ Tests đã được ghi trong kế hoạch; chưa sửa ngoài phạm vi.
- Chưa thêm tải báo cáo thành Word/PDF. Chưa nghiệm thu đầu ra bởi giáo viên.
- Không sửa dữ liệu thật, không migrate CSDL thật, không khôi phục lại theo hiện trạng cũ, không commit/push/triển khai. Giữ nguyên `graphify-out/` chưa theo dõi từ trước.

Log máy cục bộ: `/private/tmp/exammatrix-engine-final-20261119.log`, `/private/tmp/exammatrix-cloud-final-20261119.log`, `/private/tmp/exammatrix-node-final-20261119.log`. Ảnh dialog desktop/mobile: `/private/tmp/exammatrix-comparison-desktop.png`, `/private/tmp/exammatrix-comparison-mobile.png`. Các đường dẫn tạm không phải bằng chứng lưu trữ lâu dài; script kiểm trình duyệt và fixture được giữ trong repo để tái chạy.
