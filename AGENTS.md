# QUY TẮC & HƯỚNG DẪN DỰ ÁN NGÂN HÀNG ĐỀ (AGENTS.md)

Tệp quy tắc này áp dụng bắt buộc cho mọi tác tử AI (Codex, Antigravity, Gemini, Claude) và lập trình viên khi làm việc trong thư mục `ngan-hang-de-web/`.

---

## 1. Tổng quan dự án

- **Tên dự án:** Ngân hàng đề và Ma trận kiểm tra đánh giá (`ngan-hang-de-web`).
- **Mục tiêu:** Ứng dụng Web dành cho giáo viên: quản lý môn học, chương trình, bài học/YCCĐ, ngân hàng câu hỏi, đề cương ôn tập, ma trận/đặc tả và sinh đề kiểm tra tự động. Hỗ trợ xuất file Word (DOCX), PDF chuẩn in ấn, LaTeX và file trắc nghiệm LMS.
- **Người dùng chính:** Thầy Trần Gia Huy (bộ môn Tin học Khối 8, 9, 10, Asian School cơ sở Cao Thắng) cùng các giáo viên các bộ môn khác.
- **Ngôn ngữ bắt buộc:** Toàn bộ giao diện người dùng (UI), thông báo lỗi nghiệp vụ (`ServiceError`), log hệ thống và tài liệu kỹ thuật đều viết bằng **Tiếng Việt**.

---

## 2. Căn cứ pháp lý & Quy chế nội bộ

Mọi quyết định về mặt nghiệp vụ sư phạm và khảo thí phải bám sát các văn bản:
1. **Thông tư 22/2021/TT-BGDĐT:** Quy định đánh giá học sinh THCS/THPT (Điểm ĐĐGđk lấy đến 1 chữ số thập phân; Điều 6 quy định số đầu điểm ĐĐGtx).
2. **Công văn 7991/BGDĐT-GDTrH:** Cấu trúc định dạng đề kiểm tra đánh giá (câu hỏi Đúng/Sai 4 ý, tỉ lệ phân bổ các mức độ nhận thức).
3. **Thông tư 32/2018/TT-BGDĐT:** Chương trình giáo dục phổ thông 2018 (môn Tin học và các môn học).
4. **Quy định nội bộ Asian School:** Bắt buộc tuân thủ 6 file quy tắc tại thư mục cha `../rules/`:
   - `../rules/01_phan_cong_va_bien_soan_de.md` (Tỉ lệ 90% đề thi từ đề cương, nguyên tắc biên soạn).
   - `../rules/02_danh_so_cau_hoi.md` (Quy chuẩn đánh số câu hỏi, liên kết YCCĐ).
   - `../rules/03_tieu_de_va_dinh_dang.md` (Quy chuẩn khổ ngang, bảng $\le$ 24cm, Times New Roman, logo chỉ có ở đề cương).
   - `../rules/04_luu_tru_va_dong_bo.md` (Đồng bộ và quản lý phiên bản hồ sơ).
   - `../rules/05_de_cuong_on_tap.md` (Cấu trúc bảng A Giới hạn kiến thức 3 cột).
   - `../rules/06_trac_nghiem_lms.md` (Định dạng file trắc nghiệm tải lên LMS Asian).

---

## 3. Kiến trúc kỹ thuật: "One Engine, Two Hosts"

Toàn bộ nghiệp vụ được thiết kế theo mô hình tách biệt giữa Lõi tính toán (Engine) và Máy chủ phục vụ (Hosts):

### 3.1. Lõi Engine (Nghiệp vụ dùng chung)
- `bank_service.py` (`BankService`): Quản lý câu hỏi (MC, YN, SHORT, ES), trạng thái duyệt (`draft`, `approved`, `needs_review`), phân phối chương trình (PPCT), tạo đề ngẫu nhiên theo ma trận, đối chiếu đề cương, thuật toán xáo trộn hoán vị mã đề và sinh bảng đối chiếu.
- `matrices/` (`MatrixService`): Mô hình ma trận và bảng đặc tả, nhập xuất ma trận từ Word, sinh khung đề.
- `exports.py`: Xuất đề thi, đáp án, đề cương ra định dạng DOCX, HTML, tệp LMS.
- `pdf_build.py`: Chuyển đổi DOCX sang PDF bằng chính Microsoft Word cục bộ qua AppleScript (bảo đảm PDF và Word giống nhau 100%). **Lưu ý:** Chỉ sửa lỗi bố cục trong mã tạo DOCX, không sửa PDF.
- `latex_generator.py` & `latex_layout.py`: Xuất đề thi định dạng LaTeX khi cần in ấn toán học phức tạp.
- `domain/policies.py`: Các ràng buộc nghiệp vụ, quy tắc làm tròn điểm (GK/CK làm tròn đến 0,1; KTTX làm tròn đến số nguyên).
- `ai_assistant.py`: Trợ lý Gemini hỗ trợ giáo viên soạn thảo; khóa bảo mật lấy từ biến môi trường `GEMINI_API_KEY`, các câu tạo ra luôn ở trạng thái `draft`.

### 3.2. Hai môi trường chạy (Two Hosts)
1. **Django Host (`cloud/`):**
   - Ứng dụng chính cho môi trường đa tài khoản và triển khai trên Render / máy cục bộ.
   - `cloud/assessment/legacy_views.py`: `original_api` bọc các request trong giao dịch `transaction.atomic()` với khóa `select_for_update` trên `Workspace`.
   - `DjangoHandler` kế thừa từ `Handler` trong `server.py`. Mọi endpoint API nghiệp vụ bổ sung phải viết trong `server.py` để dùng chung.
   - `legacy_storage.py` (`DatabaseStorage`): Ánh xạ 6 tệp JSON cấu trúc (`bank.json`, `exams.json`, `revisions.json`, `exam_templates.json`, `matrices/records.json`, `kttx.json`) vào bảng `LegacyState.documents`, tự động lưu `LegacyStateVersion` trước mỗi thao tác ghi.
2. **Legacy Host (`server.py`, `start.py`, `MO_NGAN_HANG_DE.command`):**
   - Phục vụ môi trường chạy đơn lẻ cục bộ trực tiếp trên tệp JSON trong `data/` hoặc `DEFAULT_BANK`.

### 3.3. Frontend (Vanilla JS Buildless)
- Nằm trong `public/`: `index.html`, `app.js`, `matrices.js`, `curricula.js`, `core.js`.
- Không sử dụng bundler/build tool phức tạp.
- Toàn bộ hàm tính toán thuần túy (pure helpers) được tổ chức trong `public/core.js` (chuẩn UMD) để vừa chạy được trên trình duyệt vừa kiểm thử được với Node.js qua `require('../public/core.js')`.

---

## 4. Các nguyên tắc bất di bất dịch (Invariants & Safety)

1. **Tuyệt đối không commit dữ liệu nhạy cảm vào Git:**
   - Thư mục `data/` thật, tệp cơ sở dữ liệu SQLite, bản sao lưu, ngân hàng câu hỏi thật `NGAN_HANG_CAU_HOI_HK1_V1.json` và hồ sơ nộp trong `../06_Kiem_tra_va_Danh_gia/` KHÔNG ĐƯỢC PHÉP commit vào Git.
   - Dữ liệu mẫu dùng cho test hoặc demo phải là dữ liệu tự biên soạn minh họa (`domain/test_seed.py`, `seed_subject_samples`).
2. **Quyền riêng tư và bảo mật đề thi:**
   - Học sinh và tài khoản không có quyền `answers` tuyệt đối không được xem đáp án, rubric hoặc metadata đánh dấu đáp án đúng trong file Word/PDF/Zip.
   - Đề thi chính thức chỉ được sử dụng các câu hỏi đã được phê duyệt (`status == 'approved'`).
   - Đề thi đã khóa / đã phát hành phải giữ nguyên vẹn nội dung, không được tự ý biến đổi khi ngân hàng câu hỏi thay đổi.
3. **Quy chuẩn bố cục bản xuất (Strict Export Layout):**
   - Khổ giấy nằm ngang (Landscape), độ rộng bảng $\le 24\,\text{cm}$, font Times New Roman, lề trên/dưới $1,0\,\text{cm}$.
   - Logo trường: **Chỉ xuất hiện trên Đề cương ôn tập**. Đề thi chính thức và Ma trận/Bảng đặc tả **tuyệt đối không có logo**.
   - Đánh số câu trong ma trận dùng `(1, 2, 3, 4)` hoặc `(1a, 1b)`, không dùng `(C1 - C4)`.
   - File trắc nghiệm LMS không có bảng đáp án cuối trang; đáp án đúng bôi đậm dạng `[A.] `; câu Đ/S dùng `[a)] … [ĐÚNG]`; trả lời ngắn dùng `[Đáp án: …]`.

---

## 5. Danh mục lệnh vận hành & Kiểm thử

Các lệnh chạy từ thư mục gốc của repository (`ngan-hang-de-web/`):

```sh
# 1. Thiết lập môi trường và chạy máy chủ Django
python3 -m venv .venv && .venv/bin/python -m pip install -r cloud/requirements.lock
(cd cloud && ../.venv/bin/python manage.py migrate)
(cd cloud && ../.venv/bin/python manage.py runserver 127.0.0.1:8877)

# 2. Chạy toàn bộ 4 bộ kiểm thử hệ thống
(cd cloud && ../.venv/bin/python manage.py test --noinput) # Bộ 1: Django cloud tests
(cd cloud && ../.venv/bin/python manage.py makemigrations --check --dry-run) # Bộ 2: Kiểm tra tính toàn vẹn Migration
.venv/bin/python -m unittest discover -s tests                            # Bộ 3: Engine core tests
node tests/frontend.test.cjs && node tests/matrices_frontend.test.cjs     # Bộ 4: Frontend logic tests

# 3. Quản lý dữ liệu mẫu, sao lưu và khôi phục
(cd cloud && ../.venv/bin/python manage.py seed_subject_samples --owner USER --apply)
(cd cloud && ../.venv/bin/python manage.py backup_local --out DIR)
(cd cloud && ../.venv/bin/python manage.py verify_backup DIR)
(cd cloud && ../.venv/bin/python manage.py restore_local DIR --dry-run)
```

---

## 6. Đội ngũ Tác tử Chuyên trách (Specialized Agents)

Mười vai trò được định nghĩa trong `.agents/agents/`; adapter Claude tại `.claude/agents/`. Đọc `docs/QUY_TRINH_AGENTS.md` để phân công, bàn giao và xác minh môi trường có hỗ trợ chạy subagent. Các tệp này không tự chứng minh agent đã được đăng ký hay kích hoạt:

| Tác tử (Agent) | Vai trò chính | Thao tác ghi mã |
| :--- | :--- | :---: |
| `thiet-ke-chuc-nang` | Thấu hiểu sâu sắc tâm lý & áp lực thực tế của giáo viên đứng lớp. Thiết kế luồng nghiệp vụ sư phạm (User Flow), giao diện (UI/UX), kịch bản (User Story) và đặc tả tính năng. | Lập đặc tả |
| `kiem-dinh-nghiep-vu` | Kiểm định tính chuẩn xác pháp lý theo TT 22, CV 7991, TT 32 và `rules/`. Thẩm định ma trận, tiêu chí đề cương $T \ge 90\%$, thang điểm làm tròn. | Không |
| `kiem-tra-ban-xuat` | Xuất kiểm tra DOCX, PDF, LaTeX, LMS. Đối chiếu với mẫu hồ sơ đã nộp của trường. Rà soát lề, bảng $\le 24\,\text{cm}$, font chữ, logo và bảo mật đáp án. | Không |
| `nghiem-thu` | Thanh tra độc lập: Chạy toàn bộ 4 bộ test, đo lường tỷ lệ pass/skip, kiểm tra mã SHA-256 dữ liệu và lập biên bản `BIEN_BAN.md` tại `acceptance/`. | Lập biên bản |
| `ky-su-backend` | Chuyên trách phát triển và tối ưu lõi `bank_service.py`, `matrices/`, `server.py`, `exports.py`, cơ chế lưu trữ `DatabaseStorage` và các API. | Có |
| `ky-su-frontend` | Chuyên trách `public/`, logic Node và sửa khoảng trống giao diện đã tái hiện; không mặc định xây lại C1. | Có |

---

Bốn vai trò bổ sung:

| Tác tử | Vai trò chính | Phạm vi ghi |
| :--- | :--- | :--- |
| `kiem-thu-luong-giao-vien` | Kiểm tra xuyên suốt C1/C2 bằng tài khoản và dữ liệu giả | Test/kịch bản/báo cáo được giao |
| `bao-mat-phan-quyen` | Kiểm tra quyền answers, owner/curriculum, tải tệp, CSRF và AI mock | Test bảo mật/báo cáo được giao |
| `quan-tri-du-lieu` | Đối soát PPCT/YCCĐ, nhập thử và độ đủ câu theo ô | Fixture/test/báo cáo được giao |
| `van-hanh-sao-luu` | Kiểm tra môi trường, diễn tập backup/restore cách ly | Script/test/tài liệu vận hành được giao |

Codex điều phối các vai trò bằng công cụ subagent của phiên; không cần Claude còn hạn mức. Đọc `docs/KE_HOACH_HOAT_DONG_AGENTS.md` để giao phiếu và xác định phụ thuộc. Reviewer không sửa sản phẩm; điều phối giữ tài liệu chung. Các bản ghi vai trò không phải tác vụ chạy nền.

## 7. Tài liệu trạng thái sống (Living Documents)

Mỗi phiên làm việc cần đọc và đối chiếu 3 tệp tài liệu trong `docs/`:
- `docs/BOI_CANH.md`: Bối cảnh, mục tiêu, quyết định đã chốt của giáo viên, thuật ngữ nghiệp vụ.
- `docs/LO_TRINH.md`: Bản kế hoạch công việc duy nhất (Kế hoạch V2.1, các Mốc A $\rightarrow$ D).
- `docs/NHAT_KY.md`: Nhật ký phiên làm việc (luôn thêm nội dung mới nhất lên đầu tệp sau mỗi phiên hoàn thành công việc).
