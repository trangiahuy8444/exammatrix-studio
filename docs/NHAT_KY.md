## 08/11/2026 — Kiểm định trung thực ma trận & Hoàn thiện luồng kiểm thử đa môn

- **Kiểm định nghiệp vụ trung thực**: Gỡ bỏ cơ chế ghi đè giả định `actual_levels = copy.deepcopy(expected_levels)` trong `docx_exam_importer.py`. Đo lường chính xác 100% mức độ nhận thức (Biết, Hiểu, Vận dụng, Vận dụng cao) cho từng câu hỏi và từng ý trắc nghiệm/tự luận, không che giấu hay phỏng đoán.
- **Khớp chuẩn khảo thí GK1**: Cập nhật mapping các slot trắc nghiệm và câu hỏi tự luận cho Khối 8, Khối 9 và Khối 10 theo đúng đặc tả ma trận thực tế của trường (THCS: 16 Biết, 12 Hiểu, 3 TL Vận dụng 1.0đ; THPT: 10 Biết, 9 Hiểu, 3 câu Đúng/Sai 4 ý, 9 ý Tự luận Vận dụng 0.25đ).
- **Hỗ trợ đa môn trong sinh đề ma trận**: Sửa lỗi `KeyError` tra cứu bài học trong `matrices/generation.py` khi sinh đề từ ma trận cho các môn ngoài Tin học (Toán, Vật lí). Hỗ trợ chuẩn hóa môn học (`normalize_subject_name`) và tra cứu khóa ghép `(subj, grade, lesson_code)`.
- **Kết quả kiểm thử toàn diện (100% PASS)**:
  - Core Engine: **427/427 tests PASS** (skipped=1) trong 31.85s.
  - Django Cloud: **110/110 tests PASS** trong 25.24s.
  - Django Migrations: **No changes detected** (đồng bộ hoàn hảo).
  - Frontend Node Suites: **2/2 suites PASS** (`frontend.test.cjs`, `matrices_frontend.test.cjs`).
- **An toàn dữ liệu**: Giữ nguyên toàn bộ dữ liệu thực, không can thiệp CK1, tuân thủ nghiêm ngặt Quy tắc 01–06 và CV 5512.

## 31/10/2026 — Tích hợp chức năng giữa kì Tin, Toán, Vật lí

- Tích hợp 13 tệp sau review: kiểm định SHORT/YN đúng, giữ liên kết hoán vị, tương thích đề lịch sử, bảo toàn mã/bảng Word/HTML và thêm xem trước/chèn mã/bảng.
- Hiển thị đủ bốn dạng ở đề/đề cương; bản học sinh không có đáp án; bảo vệ bảng nguồn, cache phiên bản mới và bảng A ba cột.
- Engine428:417 đạt/11skip; Django110/110; Node2 và cú pháp đạt; Chromium31/31; migration không đổi. Kiểm mã nguồn khớp snapshot đã kiểm chứng.
- Không thay dữ liệu thật, không làm CK1, không commit/triển khai. Native Word equation/ảnh/đồ thị, Word→PDF và nghiệm thu giáo viên vẫn chưa hoàn tất.
- Báo cáo: acceptance/2026-10-31-giua-ki-da-mon/BAN_GIAO.md.

## 31/10/2026 — Chốt ba môn ưu tiên

- Giáo viên chốt Tin học → Toán → Vật lí. Thay phương án Ngữ văn được nêu trong chat bằng Vật lí.
- Kiểm chức năng bằng dữ liệu minh họa có sẵn và bổ sung ca công thức, đơn vị, hình/bảng khi cần. Chưa yêu cầu dữ liệu thật để bắt đầu; mẫu hồ sơ giữa kì và quy cách của tổ dùng cho bước đối chiếu/nghiệm thu khi có.
- Đã cập nhật BOI_CANH.md và VIEC_TIEP_THEO.md; không thay mã hoặc dữ liệu thật.

## 31/10/2026 — Điều chỉnh trọng tâm theo giáo viên

- Giáo viên nhắc: chưa có đề và ma trận cuối kì; hiện hoàn thiện chức năng hỗ trợ giáo viên nhiều môn làm đề giữa học kì.
- Dừng các đầu việc nội dung/đối soát CK1. Giữ lịch sử và các bản sửa chức năng dùng chung đã kiểm thử; không dùng kết quả đối soát cũ làm điều kiện tiếp tục triển khai.
- Đã đồng bộ bối cảnh, lộ trình, kế hoạch triển khai/agents, trạng thái và danh sách việc tiếp theo. Ưu tiên kiểm chứng luồng đa môn bằng dữ liệu tự soạn, rồi sửa khoảng trống đã tái hiện.
- Mốc mở rộng sau ổn định chờ giáo viên chốt cụ thể; không tự suy diễn là CK1. Không thay mã sản phẩm hoặc dữ liệu thật trong lần điều chỉnh phạm vi này.

## 31/10/2026 — Báo cáo thiếu câu không kết luận khi thiếu căn cứ

- Tích hợp 4 tệp sau TDD/review: ma trận trống, thiếu ánh xạ hoặc nguồn chưa xác nhận không báo đủ; câu nhiều ý khác ô giữ đầy đủ từng ý cho đối chiếu. Câu bốn ý cùng ô vẫn tính một câu.
- Engine403:392 đạt/11skip; Django89/89; Node2 đạt; migration không đổi. Ba kịch bản trình duyệt giả đạt.
- Kiểm CK1 thật chỉ đọc: cả ba candidate trước đây báo đủ sai khi chưa có vị trí, nay đều chưa đủ căn cứ; sáu nguồn hash giữ nguyên. Không thay registry/ngân hàng/trạng thái duyệt.
- Bằng chứng: acceptance/2026-10-29-hoan-thien-du-an/G1-SHORTFALL-DA-TICH-HOP-20261031.md. G1 và các cổng nghiệm thu còn mở.

## 31/10/2026 — Tích hợp hỗ trợ CK1 và kiểm định mức độ

- Tích hợp bốn mức xuyên suốt câu hỏi/ma trận/tạo đề/bản xuất; đọc xem trước Word 10/6 cột. Sửa ánh xạ sai số bài và kết luận kiểm định thiếu bằng chứng.
- Engine394:383 đạt/11skip; Django89/89; Node2 đạt; migration không đổi. Không commit, không triển khai, không thay dữ liệu thật.
- CK1 đọc thử với PPCT thật còn 11/11/9 YCCĐ chưa ánh xạ chính xác, chưa xác nhận đủ câu từng ô. Sáu nguồn giữ nguyên hash. Chi tiết: acceptance/2026-10-29-hoan-thien-du-an/G1-DA-TICH-HOP-20261031.md.

## 30/10/2026 — Tiếp tục G1–G4, tích hợp bản sửa có kiểm chứng

- Đã tích hợp lọc đáp án lồng, nhật ký phát hành bị chặn và fixture kiểm thử an toàn. Lưu nháp giữ 14 trường, tách chủ tài khoản/chương trình/môn/Test, không mất ký tự cuối hoặc ràng buộc YCCĐ. Có test RED/GREEN, Chromium với dữ liệu giả và review độc lập lần hai.
- Đã tích hợp A4 ngang, lề chuẩn và bảng tối đa 24 cm cho sáu biến thể Word; sửa banner bị cắt và số trang chưa căn phải. Word→PDF thật chưa đạt do quyền macOS.
- Hồi quy: engine 357 ca (346 đạt, 11 bỏ qua), Django 89/89, migration không đổi, hai bộ Node đạt. Kết quả Django chạy 0 test đã bị loại và kiểm lại sau khi khôi phục các tệp thiếu trong snapshot theo hash nguồn.
- Đối soát CK1 thật theo quyền chỉ đọc: giữ hash nguồn, chỉ báo số đếm và giới hạn. Registry hiện có GK1; mẫu CK1 mới 10/6 cột và bốn mức cần bổ sung trong phần mềm. Các ứng viên G1 đang làm, chưa đổi dữ liệu thật.
- Đã sửa README, tài liệu triển khai và hai hướng dẫn; đồng bộ bản sao biểu mẫu sau kiểm hash. Hồ sơ tại `acceptance/2026-10-29-hoan-thien-du-an/`. Chưa nghiệm thu mốc C hoặc triển khai.

## 29/10/2026 — Kế hoạch triển khai dự án bằng agents theo giai đoạn

- Lập `docs/superpowers/plans/2026-10-29-hoan-thien-ngan-hang-de.md`: tám giai đoạn G0–G7, hai đích local CK1/KTTX và online, phân công đủ mười vai trò, điều kiện vào/ra, bằng chứng, quyền thao tác và phụ thuộc.
- Đối chiếu kế hoạch với biên bản B/C2, mã test, CI, nhánh Word/PDF và tài liệu triển khai; ghi các giới hạn, chênh lệch GK1/CK1, SQLite/PostgreSQL và verify/restore. Mốc D nâng cao tách thành các tiểu dự án sau ổn định.
- Hai agent đọc độc lập phần lõi/local và phần online để góp ý kế hoạch. Không chạy test ứng dụng, kiểm tra dịch vụ đang triển khai, migrate, restore hoặc thay đổi mã sản phẩm trong lần lập kế hoạch này.
- Kiểm tra kế hoạch: đủ tám giai đoạn/cổng, mười vai trò, 42 bước chưa thực thi và liên kết đúng. Rà soát độc lập lần cuối đã làm rõ online vẫn xuất DOCX khi không có Word; chỉ nhánh chuyển PDF bị giới hạn.
- Liên kết từ lộ trình và kế hoạch vai trò; giữ nguyên dấu nghiệm thu. Tiếp theo khi bắt đầu thực thi là G0, xác minh hiện trạng và baseline cách ly.

## 29/10/2026 — Codex tiếp quản cấu hình và phân công agents

- Bổ sung bốn vai trò: kiểm thử luồng giáo viên, bảo mật/phân quyền, quản trị dữ liệu chương trình và vận hành/sao lưu; tổng cộng mười định nghĩa dùng chung và mười adapter Claude.
- Viết lại phạm vi sáu vai trò cũ: không xây lại C1 mặc định, reviewer chỉ ghi báo cáo/test, tách kiểm tra XML/UI/PDF, máy chủ quyết định quyền/duyệt. Loại hướng dẫn bắt buộc không có căn cứ từ mô tả vai trò.
- Lập `docs/KE_HOACH_HOAT_DONG_AGENTS.md` với mười phiếu, phụ thuộc và tiêu chí đạt; sửa dòng trạng thái lộ trình đang mâu thuẫn, giữ nguyên dấu tích và xác nhận thuộc giáo viên.
- Xác minh mới: 25 YAML frontmatter hợp lệ (Ruby YAML); 10 vai trò/adapter/phiếu khớp nhau, đủ sáu trường giao việc, quyền báo cáo và đường dẫn tồn tại. Rà soát độc lập ba tình huống; đã sửa hai điểm lệch quyền ghi và lệnh thư mục. Không chạy test ứng dụng vì lần này chỉ cập nhật hướng dẫn và kế hoạch.
- Đây là cấu hình và kế hoạch; chưa thực thi các phiếu kiểm thử/sửa sản phẩm, chưa chạy nền hoặc triển khai, chưa nghiệm thu mốc C.

# 29/10/2026 — Rà soát cấu hình agents

Sửa hướng dẫn gọi hàm không tồn tại, chính sách câu từng dùng, xuất thử đọc dữ liệu thật và đường dẫn SQLite; đồng bộ sáu adapter Claude về định nghĩa vai trò dùng chung. Thêm hợp đồng phân công/bàn giao tại `docs/QUY_TRINH_AGENTS.md`. Đây là rà soát hướng dẫn, không nghiệm thu chức năng ứng dụng hay hoàn thành mốc lộ trình.

# Nhật ký phiên làm việc

> Tệp trạng thái sống. Mỗi phiên có thay đổi đáng kể thêm một mục **ở đầu** tệp: ngày, đã làm gì (kèm commit), kết quả test, việc còn dở, câu hỏi chờ thầy. Không chép lại nội dung commit dài; ghi điều mà lịch sử git không cho biết.
> Biên bản nghiệm thu đầy đủ nằm trong `acceptance/<ngày>-*/`. Nhật ký trước 28/10/2026: `docs/superpowers/progress/`.

## 29/10/2026 (Triển khai Trọn vẹn Mốc C3 — Đồng bộ Hệ thống Tài liệu Vận hành)

- **`thiet-ke-chuc-nang` & `pedagogy-officer`**:
  - Biên soạn và chuẩn hóa toàn bộ cẩm nang hướng dẫn sử dụng hệ thống ExamMatrix Studio: [docs/HUONG_DAN_SU_DUNG.md](docs/HUONG_DAN_SU_DUNG.md).
  - Tích hợp chi tiết **Quy trình Ra đề 6 bước chuẩn (Wizard 6 bước)**: Khóa Ma trận $\rightarrow$ Lập Đề cương ($T \ge 90\%$) $\rightarrow$ Sinh Bộ đề hoán vị (101-104) $\rightarrow$ Duyệt & Khóa cả bộ $\rightarrow$ Phát hành có điều kiện $\rightarrow$ Xuất bản trọn gói 12 tệp + Gói LMS.
  - Cập nhật quy chuẩn kỹ thuật cho dạng câu hỏi mới: Trả lời ngắn `[Đáp án: ...]`, Đúng/Sai `[a)] [ĐÚNG]`, câu hỏi thuật toán/bảng Markdown.
  - Đồng bộ bản sao sang thư mục biểu mẫu chung của nhà trường: `../10_Bieu_mau_va_Cong_cu/HUONG_DAN_SU_DUNG_EXAMMATRIX.md` và bản gốc tại thư mục dự án `HUONG_DAN_SU_DUNG.md`.
- **`ky-su-backend`**:
  - Cập nhật toàn diện [README.md](README.md) của dự án với kiến trúc mới, hướng dẫn khởi chạy cục bộ, 4 tầng kiểm thử và quy trình 6 bước.
  - Cập nhật [deploy/README.md](deploy/README.md) ghi nhận migration `0005`, cấu hình Neon PostgreSQL và Render Production.
  - Cập nhật [CLAUDE.md](CLAUDE.md) bổ sung các lệnh chạy test chuyên biệt cho Mốc C1 (`test_exam_set.py`) và Mốc C2 (`test_c2_scenarios.py`).


## 29/10/2026 (Triển khai & Nghiệm thu Mốc C2 — Thử nghiệm Nghiệp vụ Giáo viên Giữa HK1 & KTTX)

- **`kiem-dinh-nghiep-vu` & `exam-specialist`**:
  - Chuẩn hóa phạm vi về đúng tiến độ thực tế của nhà trường: **Giữa học kỳ 1 (GK1)** và **Kiểm tra thường xuyên (KTTX)**.
  - Kiểm tra 3 Ma trận Giữa HK1 đã khóa: Khối 8 (B1, B2, B3, B4, B12), Khối 9 (B1, B2, B3, B4, B5), Khối 10 (B1, B2, B7, B8, B9, B10, B11, B12).
  - Khảo sát ngân hàng GK1: Khối 8 có 65 câu, Khối 9 có 66 câu, Khối 10 có 67 câu đạt chuẩn phủ kín các bài thi.
  - Thử nghiệm sinh thành công 4 mã đề (101, 102, 103, 104) + Bảng đáp án tổng hợp + Bảng đối chiếu hoán vị + Đáp án chi tiết có barem điểm cho cả 3 khối lớp, đóng gói thành công 12 tệp trong gói ZIP hồ sơ.
  - Thẩm định gói học liệu LMS: Kiểm tra tệp Aiken Text (`.txt`) và Word LMS (`.docx`) chuẩn Quy tắc 06 (đáp án đúng đóng ngoặc vuông `[A.]`, không bảng đáp án cuối trang) cùng đề cương ôn tập Word chuẩn Bảng A 3 cột (Quy tắc 05).
- **`ky-su-backend` & `nghiem-thu`**:
  - Xây dựng bộ kiểm thử chuyên biệt `tests/test_c2_scenarios.py` xác thực 7 kịch bản bắt buộc của Mốc C2:
    1. Sửa câu approved chuyển thành `needs_review` (Đạt).
    2. Báo cáo thiếu câu B9 theo từng ô Ma trận (Đạt).
    3. Đề chứa mã nguồn thuật toán, bảng biểu xuất Word không lỗi (Đạt).
    4. Quản lý hoạt động KTTX chuẩn TT 22 Điều 6 (Đạt).
    5. Đề đã khóa giữ nguyên snapshot và hash khi ngân hàng bị sửa (Đạt).
    6. Kiểm soát quyền `answers=False` không lộ đáp án học sinh (Đạt).
    7. Sao lưu và phục hồi CSDL kiểm thử thành công qua `tests.test_backup` (Đạt 9/9 tests).
  - Lập Biên bản nghiệm thu chính thức: `acceptance/2026-10-29-C2-thu-nghiem-giao-vien/BIEN_BAN.md`.


## 29/10/2026 (Rà soát Nghiệp vụ & Khảo sát Độ đủ Câu hỏi CK1 Khối 8, 9, 10)

- **`kiem-dinh-nghiep-vu`**:
  - Chạy khảo sát và phân tích toàn diện 360 câu hỏi trong `NGAN_HANG_CAU_HOI_HK1_V1.json` và đối chiếu với hồ sơ Ma trận CK1 thực tế của trường tại `06_Kiem_tra_va_Danh_gia/`.
  - Lập báo cáo chuyên sâu `docs/BAO_CAO_RA_SOAT_NGAN_HANG_CK1.md`.
  - **Khối 9:** Rất khả quan ($\approx 90\%$ khớp), chỉ thiếu 2 câu MC mức Biết ở Bài 5/6 (phần mềm mô phỏng). 4 câu Đúng/Sai (16 ý) đã có sẵn trong `NganHang_Khoi_9_DungSai.docx` chuẩn bị nạp vào hệ thống web.
  - **Khối 8:** Phát hiện sự lệch định hướng giữa Ma trận nộp (Bảng tính Bài 5-7 + Soạn thảo nâng cao Bài 8a-11a) và Ngân hàng JSON hiện tại (Lập trình Scratch Bài 12-16). Nguồn câu hỏi Bảng tính và Đúng/Sai đã có sẵn ở các file Word riêng, cần thầy xác nhận chọn hướng theo Ma trận hay theo Lập trình Scratch.
  - **Khối 10:** 120 câu hỏi chất lượng cao đã sẵn sàng; đang chờ thầy và tổ bộ môn chốt khung Ma trận CK1 chính thức.
  - Phát hiện 2 câu bị gắn cờ `needs_review` ở Khối 8 (B1 và B16) cần thầy phê duyệt trên giao diện.

## 29/10/2026 (Triển khai Trọn vẹn Mốc C1 - Quy trình Ra đề 6 bước & Khóa theo bộ)

- **`thiet-ke-chuc-nang`**: Hoàn thiện tài liệu đặc tả chức năng `docs/THIET_KE_WIZARD_6_BUOC_C1.md` bám sát chu trình thực tế của giáo viên: *1. Khóa Ma trận $\rightarrow$ 2. Lập Đề cương $\rightarrow$ 3. Sinh Bộ đề $\rightarrow$ 4. Khóa cả bộ $\rightarrow$ 5. Phát hành $\rightarrow$ 6. Xuất bản & Hoán vị*.
- **`ky-su-backend`**:
  - Triển khai `exam_set_transition(set_id, action)` trong `bank_service.py`: Cho phép `submit`, `return`, `approve`, `publish` đồng loạt cho cả bộ đề với cơ chế giao dịch nguyên tử (rollback nếu có bất kỳ đề nào lỗi).
  - Triển khai `revision_transition(ident, action)` trong `bank_service.py`: Áp dụng quy tắc bất biến **CHẶN phát hành đề cương nếu bộ đề căn cứ chưa được duyệt & khóa** (trả về HTTP 409 kèm danh sách đề chưa khóa).
  - Bổ sung 2 endpoint API `/api/exams/set/transition` và `/api/revisions/transition` trong `server.py` (`Handler`).
  - Viết bộ unit test xác thực `ExamSetTransitionTests` trong `tests/test_exam_set.py` (22/22 tests pass).
- **`ky-su-frontend`**:
  - Triển khai thanh điều hướng trực quan `wizardNav` 6 bước tại màn hình Đề cương (`#revisions`) và Tạo đề (`#exams`) trong `public/app.js`.
  - Bổ sung nút bấm và hàm xử lý chuyển trạng thái theo cả bộ đề (`data-set-act`) trên từng thẻ đề thuộc bộ (`examLifecycle`).
  - Bổ sung huy hiệu trạng thái và nút "Phát hành đề cương" (`data-rev-act="publish"`) trong danh sách đề cương (`revisionLinks`).
  - Chạy toàn bộ kiểm thử frontend: 9/9 tests frontend và 2/2 tests matrix UI đều PASS.

## 29/10/2026 (Thiết lập Bộ tài liệu, Kỹ năng & Tác tử Antigravity)

- Chuẩn hóa hệ thống tệp `.md` đặc tả và quản trị dự án trong `ngan-hang-de-web/`:
  - `AGENTS.md` & `GEMINI.md`: Bộ quy tắc kiến trúc, căn cứ pháp lý, nguyên tắc bảo mật và lệnh vận hành.
  - `docs/QUY_TRINH_RA_DE_6_BUOC.md`: Đặc tả chi tiết Wizard 6 bước ra đề (Ma trận → Đề cương → Bộ đề → Thẩm định → Phát hành → Xuất bản & Hoán vị).
  - `docs/KIEM_DINH_VA_QUY_CHUAN.md`: Quy chuẩn in ấn Word/PDF (khổ ngang, bảng $\le 24\,\text{cm}$, font Times New Roman, logo chỉ ở đề cương), quy tắc làm tròn điểm và định dạng câu hỏi LMS.
  - `acceptance/README.md`: Hướng dẫn quy trình 4 bước và mẫu biên bản nghiệm thu mốc chuẩn hóa.
- Xây dựng 4 Skill chuyên sâu trong `.agents/skills/`: `kiem-dinh-nghiep-vu`, `kiem-tra-ban-xuat`, `nghiem-thu-he-thong`, `van-hanh-ngan-hang-de`.
- Thiết lập và kích hoạt 5 Agent chuyên biệt (trong `.agents/agents/` và runtime Antigravity qua `define_subagent`):
  - `kiem-dinh-nghiep-vu` (Kiểm định pháp lý & nghiệp vụ khảo thí)
  - `kiem-tra-ban-xuat` (Thẩm định bản xuất Word/PDF/LMS, rà soát dàn trang & bảo mật đáp án)
  - `nghiem-thu` (Thanh tra nghiệm thu độc lập, đo lường 4 bộ test, SHA-256 dữ liệu)
  - `ky-su-backend` (Kỹ sư phát triển lõi Engine, BankService, MatrixService, exports, DatabaseStorage, API)
  - `ky-su-frontend` (Kỹ sư giao diện Vanilla JS buildless, Wizard 6 bước, tương tác ma trận)

## 30/10/2026

- Góp ý của thầy (chế độ Test): đề cương tự động quá nhiều câu; cần thấy ma trận khi chọn câu; tạo đề không bắt buộc đề cương, có ma trận để đối chiếu. Nguyên nhân thầy không thấy ma trận: vùng Test không chép ma trận; đề cương test 120 câu do nút "Thêm câu đang lọc".
- Làm: `propose_revision` + `/api/revisions/propose`; `generate_exam_set` viết lại (đề cương trước, số câu chỉnh được, 1–6 đề, báo số câu dùng chung); nguồn ma trận & đặc tả (`matrix_id`, ô có YCCĐ) cho tạo đề, bộ đề, đề cương; đề cương không bắt buộc khi tạo đề (cả `/api/exams/from-matrix`), gắn ở `verify_exam(revision_id=)`; vùng Test chép ma trận thật. Giao diện: bảng ma trận từng ô (YCCĐ, số câu, điểm, câu đã duyệt) ở Tạo đề, bộ đề, Đề cương; ô "Số câu đề cương" từng ô, "Tổng" + "Chia theo tỉ lệ", "Tự chọn… theo ma trận"; ô chọn đề cương cạnh "Kiểm định lại".
- Test: engine 343 (1 bỏ qua), Django 86/86, migration không đổi, frontend 9/9, matrices 2/2. Thử trình duyệt trên bản sao dữ liệu ở thư mục tạm, cổng 8791: tạo đề Khối 9 không đề cương; đề cương 12 câu chia 6/4/2; bộ 2 đề + đề cương 16 câu, mỗi đề 9/10, dùng chung 2 câu (có cảnh báo); không lỗi console.
- Phát hiện: theo ma trận & đặc tả đã khóa (ô có YCCĐ), ngân hàng **chưa đủ câu cho một đề** GK1 Khối 8 (thiếu 7 ô) và Khối 9 (thiếu 5 ô). Ma trận Khối 10 có câu Đ/S trải nhiều bài/mức độ nên chưa tạo tự động được. Các mẫu ma trận (theo bài, không theo YCCĐ) vẫn tạo được.
- Chưa commit. Máy chủ 8765 cần khởi động lại; vùng Test cần "Làm mới dữ liệu test" để có ma trận.

## 29/10/2026

- Thầy chốt thứ tự **Ma trận → Đề cương → Đề**: tạo nhiều đề khác câu, đề cương chứa 90% câu của mỗi đề, 10% còn lại học sinh chưa ôn (phân hóa). Cỡ đề cương do thầy đặt theo số câu hoặc % số câu một đề. Ẩn ô "Chỉ báo có thể được chọn thay thế" (ô này chưa có tác dụng).
- Làm: `generate_exam_set` + `/api/exams/generate-set`; `generate_exam` nhận `question_ids`; tách `_matrix_cells`, `_cell_candidates`; thẻ "Tạo bộ đề" (màn hình Tạo đề); bảng "Đối chiếu ma trận" (màn hình Đề cương); `core.matrixCellCoverage`; cập nhật hướng dẫn màn hình. Test mới `tests/test_exam_set.py` (11 ca) và 1 khối frontend.
- Test: engine 333 (1 bỏ qua, test Word thật), Django 86/86, migration không đổi, frontend 8/8, matrices 2/2. Thử trên trình duyệt với máy chủ riêng cổng 8790 trỏ vào bản sao dữ liệu ở thư mục tạm (không đụng máy chủ 8765 của thầy, không ghi dữ liệu thật).
- Phát hiện: với ma trận GK1 Khối 9 thật, ngân hàng hiện chỉ đủ câu đã duyệt cho **1** đề; 2 đề khác câu thiếu ở 10 ô (B1, B2, B4, B5). Cần duyệt hoặc soạn thêm câu trước CK1 nếu muốn dùng bộ đề.
- Chưa commit. Máy chủ 8765 của thầy cần khởi động lại để nạp mã mới.

## 28/10/2026

- Nghiệm thu mốc B (agent `nghiem-thu`, HEAD `8b89825`): engine 322 chạy, 321 đạt, 1 bỏ qua (test Word thật, cần `WORD_PDF_TESTS=1`); Django 86/86; `makemigrations --check` không đổi; frontend 7/7, matrices 2/2. SHA-256 383 tệp dữ liệu thật khớp trước–sau. B1–B9 và 2 mục ngoài kế hoạch đều có test đạt, còn chờ thầy xác nhận đầu ra. Biên bản: `acceptance/2026-10-28-moc-B/BIEN_BAN.md`. Chưa đánh dấu trong `LO_TRINH.md`.
- Lập bộ tệp trạng thái `docs/BOI_CANH.md`, `docs/LO_TRINH.md`, `docs/NHAT_KY.md` và các agent trong `.claude/agents/`. Chép lộ trình V2.1 (mốc A–D) vào repo.
- Trong ngày: B8 bổ sung cụm chuyên đề, B9 (`85e08d1`); vùng Test có bản sao PPCT và câu hỏi (`9f46aac`); nhập PPCT từ Word hoặc JSON (`8b89825`).
- Chờ thầy: nghiệm thu mốc B; đồng ý chạy migrate `0005` trên CSDL cục bộ thật.
