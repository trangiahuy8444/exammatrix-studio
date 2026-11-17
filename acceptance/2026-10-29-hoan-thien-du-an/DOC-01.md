# DOC-01 — Hiệu chỉnh hướng dẫn vận hành đã đối chiếu mã

Ngày: 29/10/2026. Vai trò: `thiet-ke-chuc-nang`. Phạm vi: phần tài liệu C3/G5 không phụ thuộc UAT; không xác nhận hoàn thành các mốc.

## Kết quả

Chỉ sửa `README.md`, `deploy/README.md`, `HUONG_DAN_SU_DUNG.md`, `docs/HUONG_DAN_SU_DUNG.md` và báo cáo này. Đã giữ nguyên phần hướng dẫn không thuộc lỗi được giao; không sửa mã, dữ liệu hoặc tài liệu trạng thái chung; không chạy mạng, migrate, restore hoặc commit.

- Sửa kích hoạt môi trường ảo thành `source .venv/bin/activate`; bỏ bước `cd ngan-hang-de-web` dư trong khối lệnh test vốn bắt đầu ở gốc repo.
- Tách bộ 1–6 đề theo ma trận và thao tác hoán vị 101–104 của từng đề. Nêu rõ hệ thống ưu tiên khác câu nhưng có thể dùng chung câu kèm cảnh báo.
- Nêu đúng `submit` → chờ duyệt; `approve` → `locked`; không có action `lock` riêng cho đề. Giữ phân biệt với thao tác `lock` của đề cương.
- Bỏ cam kết ZIP luôn 12 tệp hoặc luôn có cả Word/PDF; hướng dẫn xem báo cáo thành phần thiếu/lỗi và xuất LMS riêng.
- Sửa câu `verify_backup` hứa phục hồi 100%: chỉ xác nhận kiểm tra tính toàn vẹn; cần diễn tập restore riêng trong môi trường cách ly. Sửa nhãn “4 bước” không khớp ba trạng thái liệt kê trong README, giữ `pending_review` đúng mô hình hiện hành.
- Nêu PDF từ Word cần môi trường cục bộ có Microsoft Word và quyền phù hợp; online vẫn xuất DOCX.
- Hạ tuyên bố deploy về trạng thái cần kiểm tra tại môi trường đích: không dùng test migration cục bộ để kết luận DB thật đã cập nhật; không khẳng định nghiệm thu toàn bộ B/C. Email mặc định console chưa gửi thư khôi phục thật.

## Bằng chứng nguồn

| Nội dung | Nguồn mã được đọc |
| :--- | :--- |
| Số đề 1–6; đề cương có sẵn/tự lập; cảnh báo dùng chung câu | `bank_service.py:1185`, `bank_service.py:1201`, `bank_service.py:1256` |
| Duyệt chốt hash và trực tiếp khóa; vòng đời đề/bộ | `bank_service.py:1522`, `bank_service.py:1546`, `bank_service.py:1565` |
| Chặn phát đề cương có đề liên kết chưa khóa | `bank_service.py:1594` |
| Hoán vị riêng, mặc định 101–104 | `bank_service.py:1650`, `bank_service.py:1664`; route `server.py:314` |
| Các route bộ đề, duyệt đề/bộ | `server.py:305`, `server.py:326`, `server.py:330` |
| ZIP phụ thuộc family/định dạng/thành phần, có báo cáo | `bank_service.py:1955`, `bank_service.py:1987`, `bank_service.py:2034`, `bank_service.py:2115` |
| Microsoft Word và osascript; thông báo khi thiếu Word | `pdf_build.py:86`, `pdf_build.py:90` |
| Verify kiểm tệp/hash/đối chiếu dữ liệu; restore là thao tác riêng | `cloud/assessment/backup.py:119`, `cloud/assessment/backup.py:189`; `cloud/assessment/management/commands/verify_backup.py:9` |
| `pending_review` là trạng thái hiện hành, `content_checked` là alias cũ; chỉ số đáp án MC 0–3 hợp lệ | `domain/review.py:13`, `domain/review.py:14`, `domain/review.py:69` |
| Console email mặc định | `cloud/config/settings.py:101` |

Đã đọc log `verification1` do phiên điều phối cung cấp: engine chạy 354 test, `OK (skipped=11)`; Django 89 test `OK` trên DB kiểm thử trong bộ nhớ; migration `No changes detected`; frontend/matrices và `verification1-results.json` ghi mã thoát 0. Đây là bằng chứng kiểm thử đã có trong phiên, không phải test do DOC-01 chạy lại, không phải bằng chứng DB thật/online/Word-PDF trực tiếp hay nghiệm thu của thầy.

## Xác minh mới cho thay đổi tài liệu

Trước sửa đã sao chép đầy đủ 4 tệp vào `/tmp/bank-docs-before/`, giữ thư mục con `deploy/` và `docs/`. Đã xem diff so với bản sao trước phiên; diff lưu tại `/tmp/bank-docs-before/DOC-01.diff`. Kiểm tra trực tiếp xác nhận cả 4 tệp có thay đổi; hai bản hướng dẫn trong repo giống hệt; không còn lệnh `source .venv/bin/python` hoặc cam kết “Trọn bộ 12 tệp”. Không viết/chạy test ứng dụng cho thay đổi Markdown này. `git diff --check` so HEAD báo khoảng trắng cuối dòng tại README dòng 3; dòng này đã có nguyên vẹn trong bản sao trước phiên và không thuộc sửa DOC-01. Kiểm tra riêng các dòng thêm/sửa so bản sao trước phiên không phát hiện khoảng trắng cuối dòng mới.

## Giới hạn và việc còn lại

- Các sửa này **chưa thay nghiệm thu của thầy** về CK1/KTTX, luồng 6 bước hoặc bản xuất.
- **Chưa đồng bộ bản sao ngoài repo** `../10_Bieu_mau_va_Cong_cu/HUONG_DAN_SU_DUNG_EXAMMATRIX.md`; phiếu hiện tại không cho ghi ngoài repo. Cần điều phối giao bước sync riêng sau khi review.
- Chưa kiểm tra migration trên DB thật, môi trường Render/Neon hiện tại, mail thật hoặc nhánh Word/PDF trực tiếp.
- Đã đối chiếu lại trạng thái câu hỏi và chỉ số đáp án MC theo góp ý điều phối: giữ `pending_review` và chỉ số MC 0–3; chưa mở rộng sửa schema JSON. Hai cẩm nang còn dùng tên trạng thái legacy `content_checked`; mã hiện hành chuẩn hóa nó thành `pending_review`.
