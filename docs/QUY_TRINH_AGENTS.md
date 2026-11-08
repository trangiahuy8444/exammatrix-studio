# Hợp đồng làm việc của agents

Áp dụng từ 29/10/2026 cho mười vai trò của dự án. Mọi đường dẫn dưới đây tính từ gốc `ngan-hang-de-web/`.

## Phân công và bàn giao

- Người điều phối đọc yêu cầu, `AGENTS.md`, `docs/BOI_CANH.md`, phần liên quan trong `docs/LO_TRINH.md` và nhật ký gần nhất. Xác định lỗi tái hiện được trước khi sửa. Không mặc định công việc là Wizard C1 chỉ vì tên mốc xuất hiện trong mô tả vai trò.
- Thiết kế luồng mới: `thiet-ke-chuc-nang`; sửa engine/API: `ky-su-backend`; sửa giao diện: `ky-su-frontend`; đối chiếu nghiệp vụ: `kiem-dinh-nghiep-vu`; kiểm tra tài liệu xuất: `kiem-tra-ban-xuat`; nghiệm thu mốc: `nghiem-thu`.
- Chỉ giao vai trò cần thiết. Tác vụ nhỏ có thể thực hiện trực tiếp. Các tệp định nghĩa vai trò là hướng dẫn; sự tồn tại của chúng không chứng minh môi trường đã đăng ký hay chạy agent. Nếu phiên có công cụ tạo subagent, truyền nội dung vai trò và nhiệm vụ cụ thể cho subagent; nếu không, đọc vai trò và thực hiện trực tiếp, nói rõ giới hạn.
- Mỗi nhiệm vụ cần: mục tiêu, lỗi/kịch bản cụ thể, phạm vi tệp được sửa, đầu vào, tiêu chí đạt, kiểm thử cần chạy, nơi ghi kết quả. Hai agent không cùng ghi một tệp. Người điều phối tổng hợp và xác minh kết quả trước khi báo người dùng.
- `kiem-dinh-nghiep-vu` và `kiem-tra-ban-xuat` không sửa mã. `nghiem-thu` chỉ ghi biên bản/log; thiết kế chỉ ghi đặc tả/hướng dẫn và báo cáo acceptance được giao. Backend/frontend sửa trong phạm vi được giao; thay đổi hợp đồng API phải thống nhất trước.
- Báo cáo bàn giao: kết luận; bằng chứng tệp:dòng hoặc lệnh/kết quả; tệp đã sửa; vấn đề còn lại. Lệnh không chạy, thiếu công cụ và test bỏ qua ghi riêng, không coi là đạt. Không tự đánh dấu hoàn thành mốc cần giáo viên xác nhận.

## Vai trò bổ sung và cách dùng trong Codex

Bốn vai trò mới: `kiem-thu-luong-giao-vien` (test luồng, không vá sản phẩm), `bao-mat-phan-quyen` (review/test quyền và AI, không vá sản phẩm), `quan-tri-du-lieu` (đối soát cấu trúc/YCCĐ, không nhập hoặc duyệt dữ liệu thật), `van-hanh-sao-luu` (diễn tập cách ly và chuẩn bị vận hành).

Codex là người điều phối trong phiên này, đọc định nghĩa vai trò rồi giao qua công cụ subagent đang có; không phụ thuộc Claude hoặc giả định file vai trò tự đăng ký runtime. Phiếu từng vai trò và thứ tự các lượt tại `docs/KE_HOACH_HOAT_DONG_AGENTS.md`. Chỉ giao tối đa ba subagent cùng lúc trong phiên hiện tại; mỗi tệp có một người ghi. Quyền Write của reviewer chỉ dành cho báo cáo/fixture/test được giao, không dành cho mã sản phẩm. Không tự thêm model, lịch nền hay dịch vụ mới.

Nhật ký và lộ trình có thể lệch nhau: đối chiếu bằng chứng và phân biệt đã triển khai, đã kiểm thử, đã được giáo viên xác nhận; không tự xác nhận lại mốc hoặc chọn kỳ GK1/CK1. Kế hoạch phân công không thay nguồn lộ trình sản phẩm. Người điều phối cập nhật tài liệu chung sau khi nhận kết quả, tránh nhiều agent ghi nhật ký.

## Công cụ và môi trường

`.agents/agents/<vai-tro>/agent.md` là nội dung vai trò dùng chung. `.claude/agents/*.md` là adapter Claude đọc nội dung đó; tránh duy trì hai bản nghiệp vụ độc lập. Metadata tools của một nền tảng không cấp thêm quyền trên nền tảng khác. Không bắt buộc agent gửi tin sang chat khác; tổng hợp qua kết quả trả về trong phiên.

Ưu tiên Python sẵn có tại `.venv/bin/python`, sau đó `~/.venvs/ngan-hang-de-web/bin/python`. Xác minh executable và thư viện trước khi chạy; không tự tạo lại môi trường đã có. Chạy từng lệnh từ gốc repo, dùng nhóm lệnh để không giữ nhầm thư mục:

```sh
.venv/bin/python -m unittest discover -s tests
(cd cloud && ../.venv/bin/python manage.py test --noinput)
(cd cloud && ../.venv/bin/python manage.py makemigrations --check --dry-run)
node tests/frontend.test.cjs
node tests/matrices_frontend.test.cjs
```

Nếu dùng Python dự phòng, thay bằng đường dẫn tuyệt đối trong cả các nhóm lệnh. Với sửa nhỏ chỉ chạy test liên quan; nghiệm thu mốc chạy đủ các bộ. Không chạy migration/seed/restore chỉ để kiểm tra agent.

## An toàn bản xuất và nghiệm thu

- `scripts/export_and_verify_samples.py` đọc `DEFAULT_BANK`, dùng `data/`, ghi `sample_exports` và tạo PDF bằng XeLaTeX; `verify_step2_1.py` cũng đọc nguồn thật và ghi `sample_outputs`. Chúng là script cũ, không phải bộ xuất thử cách ly. Không chạy tự động theo hướng dẫn kiểm tra bản xuất.
- Dùng fixture tự soạn trong tests hoặc tự dựng dữ liệu giả, ghi kết quả vào thư mục tạm. Đọc mã script để xác minh nguồn và nơi ghi trước khi thực thi. Không xuất nội dung/đáp án thật vào log hay dịch vụ ngoài.
- PDF hiện hành phải qua `pdf_build.docx_to_pdf` từ chính DOCX; PDF XeLaTeX chỉ chứng minh nhánh LaTeX. Thiếu Microsoft Word thì ghi chưa kiểm tra nhánh Word/PDF. Chưa xem ảnh từng trang thì chưa được kết luận bố cục đạt.
- Xác định đường dẫn dữ liệu thực từ cấu hình đang dùng (`CLOUD_DATA_DIR`, `DATABASE_URL`, `DEFAULT_BANK`), không in thông tin đăng nhập. SQLite mặc định là `cloud/var/development.sqlite3`; không mặc định mọi môi trường dùng SQLite.
- Băm dữ liệu trước và sau khi chạy test. Tệp không tồn tại hoặc lỗi đọc phải ghi rõ, không dùng `2>/dev/null` để che lỗi rồi kết luận dữ liệu nguyên vẹn. Với DB đang hoạt động, phân biệt thay đổi do phiên làm việc khác; hash file không đủ chứng minh an toàn PostgreSQL.
- Đối chiếu pháp lý bằng văn bản gốc trong kho. Không khẳng định hệ số Đ/S hoặc tỉ lệ nhận thức mặc định của phần mềm là quy định bắt buộc của Bộ nếu chưa tìm thấy điều khoản. Phân biệt cấu hình tham khảo, ma trận nội bộ đã khóa và quy định pháp luật.

Vùng Test có thể chép câu hỏi và ma trận thật; không mặc định sandbox Test là fixture tự soạn. Kiểm tra nguồn trước khi dùng cho báo cáo, ảnh hoặc bản xuất. Quyền yêu cầu kiểm tra agents không đồng nghĩa quyền phê duyệt câu hỏi, thay ma trận đã khóa, migrate/restore dữ liệu thật hay triển khai.
