# Biên bản kiểm thử giả lập giáo viên — bản Pages (24/11/2026)

## Phạm vi và cách làm

- Bản được thử: mã `public/` của nhánh `main` lúc 24/11/2026 (commit `cad8389`), chụp lại trước khi phiên khác sửa mã.
- Chạy trên máy (localhost) với **Firebase giả** (`cong-cu/fake-firebase/`): đăng nhập giả theo tài khoản, Firestore giả lưu trong trình duyệt và kiểm các giới hạn thật (giá trị `undefined`, mảng lồng, tài liệu > 1 MB, lô > 500 thao tác, chỉ ghi vào `workspaces/<uid của mình>`). Không đụng vào Firebase hay Google Drive thật.
- Thao tác như giáo viên: chọn tệp CSV qua ô chọn tệp, bấm nút trên giao diện (`cong-cu/tester-flow.js`). Dữ liệu tự soạn, không lấy từ đề thật (`cong-cu/tester-data.js`).
- 3 tài khoản giáo viên:

| Tài khoản | Môn, khối | Dữ liệu |
| :--- | :--- | :--- |
| Cô Lan | Tin học 9 (THCS) | 3 bài PPCT, 51 câu (42 TN, 9 TL) |
| Thầy Minh | Toán học 9 (THCS) | 3 bài PPCT, 51 câu (42 TN, 9 TL) |
| Cô Hoa | Vật lí 10 (THPT) | 3 bài PPCT, 69 câu (42 TN, 9 Đ/S, 9 TLN, 9 TL) |

## Kết quả theo bước

| Bước | Tin 9 | Toán 9 | Vật lí 10 |
| :--- | :--- | :--- | :--- |
| Nhập PPCT (CSV) | Lỗi L1 khi tên tệp có "HK1"; đạt khi đổi tên | Đạt | Đạt |
| Nhập ngân hàng (CSV) | Đạt | Đạt | Đạt (Đ/S tách đủ 4 ý, TLN có đáp án) |
| Duyệt nhanh | Đạt | Đạt | Đạt |
| Ma trận + đặc tả, khóa | Đạt (10 điểm) | Đạt, lỗi L7 | Đạt (10 điểm) |
| Đề cương theo ma trận | Đạt, lỗi L9 | Đạt | **Không làm được (L3)** |
| Tạo bộ 2 đề | **Lỗi L2** | Chưa thử | Không làm được (L3) |
| Tạo 1 đề | Chưa thử | Đạt: đúng ma trận 16B/12H/3VD, 10 điểm, 31/31 câu thuộc đề cương | Không làm được (L3) |
| Gửi duyệt, duyệt và khóa | — | Đạt, lỗi L11 | — |
| Xuất Word học sinh | — | Có tệp, lỗi L5 | — |
| Tách dữ liệu giữa tài khoản | Đạt: mỗi tài khoản chỉ thấy dữ liệu của mình | Đạt | Đạt |

## Danh sách lỗi

### Nghiêm trọng (chặn công việc hoặc làm mất dữ liệu)

- **L1. Nhập PPCT đoán sai khối từ tên tệp.** `public/app.js` (`bindPpctImport`) dùng mẫu `(TIN|KHỐI|KHOI|LỚP|LOP|K)\s*(\d+)` và ghi đè khối đang chọn. Tệp `PPCT HK1 Tin 9.csv` thành **Khối 1**; bấm Xác nhận thì PPCT lưu vào khối 1, không mở lại được từ giao diện (chỉ có Khối 8/9/10), trong khi màn hình vẫn hiện Khối 9 với PPCT mẫu có sẵn nên giáo viên tưởng đã nhập xong. Cùng mẫu này có trong `firebase-bridge.js` (`/api/ppct/inspect-import`, `/api/ppct/apply-import`). Hàm đúng hơn đã có sẵn: `TableFileHelper.detectGradeFromFilename` (màn hình nhập câu hỏi đang dùng).
- **L2. Tạo bộ đề làm hỏng danh sách đề và cả lần tải dữ liệu sau.** `static-api.js` lưu `exam_set = {id, index, count}`, còn `app.js` `examLifecycle` đọc `exam_set.title` và `exam_set.exam_ids.length`. Hậu quả: thông báo lỗi tiếng Anh "Cannot read properties of undefined (reading 'length')"; tab "Đề đã lưu" ghi (0) và không mở được; tải lại trang thì báo "Chưa tải được dữ liệu trực tuyến" và nhãn "⚠ Lỗi tải dữ liệu" cho tài khoản đó. Giáo viên không xem, duyệt, trộn mã hay xuất được đề trong bộ. Thêm nữa, nhánh tạo bộ đề thường (không linh hoạt) không gán `exam_code`, nên cả 2 đề đều mang **mã 101** (nhánh linh hoạt thì gán 101, 102…).
- **L3. Khối 10 (THPT) không tạo được đề cương và đề từ ma trận.** Khung ma trận THPT bắt buộc 3 câu Đúng/Sai, nhưng bộ máy tạo đề của bản Pages báo "Chưa hỗ trợ câu Đúng/Sai hoặc câu nhiều ý, nhiều phần" (kèm ký tự thừa `{}`); màn hình Đề cương báo 0 ô. Đây là giới hạn đã ghi trong README, nhưng với bản chính duy nhất thì nghĩa là **mọi môn Khối 10 không ra đề được theo ma trận**.

### Quan trọng (sai nghiệp vụ hoặc sai mẫu)

- **L4. Tệp mẫu tải về của Toán, Vật lí, Ngữ văn… chứa câu hỏi Tin học** (ví dụ "Thiết bị nào sau đây là thiết bị vào cơ bản của máy tính trong môn Vật lí?"). `table-file-helper.js` `getSampleBankRows` / `getSamplePpctRows` bỏ qua tham số môn.
- **L5. Tệp Word đề học sinh của bản Pages chưa đạt quy chuẩn:** không có "Trang X/Y"; chữ cái phương án ("A.") và nội dung nằm hai đoạn riêng (đề dài gấp đôi); điểm ghi "0.25" thay vì "0,25"; tên tệp chứa mã kỹ thuật (`De_hoc_sinh_EXAM-8a64a20f0fac.docx`). Đạt: Times New Roman, khổ ngang, lề trên/dưới 1,0 cm, không lộ đáp án.
- **L6. PPCT mẫu có sẵn gộp "Kiểm tra giữa HK2" vào "Kiểm tra giữa HK1"** vì cả hai cùng mã `KTGK1` (`curricula.js`, nhiều khối: tiết 10 và tiết 26 cùng một bài). Tài khoản mới chưa nhập PPCT vẫn thấy danh sách mẫu này như PPCT thật ("21 bài PPCT").
- **L7. Ma trận mọi môn tự điền "Tổ Tin học Á Châu"** ở ô người phụ trách (thấy ở tài khoản Toán) và cơ sở "Cao Thắng".
- **L8. "Chế độ linh hoạt" tự bật** ở màn hình Tạo đề khi chưa chọn ma trận (nhận cả câu nháp, bỏ qua sai khác YCCĐ). Chọn ma trận thì tự tắt. Cần thầy quyết định có giữ hành vi này không.

### Nhỏ (giao diện, câu chữ)

- **L9.** Nút "Bốc ngẫu nhiên 47 câu" nhưng thực tế bốc 48 câu (6 tự luận, ô nhập ghi 5). Ô "Trắc nghiệm (tối đa 62)" trong khi ngân hàng chỉ có 42 câu trắc nghiệm.
- **L10.** Màn hình Duyệt câu hỏi mặc định lọc "Chờ duyệt" nên câu mới nhập (Nháp) không hiện, báo "Không còn câu nào".
- **L11.** "Duyệt & khóa đề" khóa ngay sau một cú bấm, không hỏi lại.
- **L12.** Ô "Tên đề kiểm tra" hiện chữ gợi ý giống như đã điền, nhưng thực ra trống và bắt buộc: bấm "Tạo và lưu đề" không có gì xảy ra ngoài một nhắc nhỏ của trình duyệt.
- **L13.** Danh sách câu đã chọn trong đề cương hiện mã kỹ thuật (`Q-IMPORT-…`) thay vì nội dung câu.
- **L14.** Tài khoản mới, 0 câu: thẻ thống kê ghi "Câu hỏi môn Tin học (Lưu trữ) · 0 câu đang lưu trữ — Bấm nút bên dưới để khôi phục".
- **L15.** Dòng trạng thái "Đang mở ngân hàng câu hỏi…" không tắt.
- **L16.** Bảng đặc tả lấy cột "Ghi chú" của PPCT ("Nội dung cốt lõi") làm "Chủ đề" vì tệp mẫu PPCT 7 cột không có cột chủ đề.

### Cần thầy xác nhận (không chắc là lỗi)

- Bảng đặc tả THCS có cột "Đúng/Sai" và "Trả lời ngắn" (để trống), trong khi bảng ma trận THCS chỉ có trắc nghiệm và tự luận. Cần đối chiếu với mẫu ma trận/đặc tả trong CV 7991/BGDĐT-GDTrH đang lưu ở `01_Van_ban_phap_ly_va_Quy_dinh/` trước khi sửa.

## Đợt sửa L1–L3 (24/11/2026, chưa commit, cùng nhánh `fix/chan-ghi-de-hai-may`)

| Lỗi | Sửa | Kiểm lại trên trình duyệt (Firebase giả) |
| :--- | :--- | :--- |
| L1 | `table-file-helper.js` `detectGradeFromFilename` chỉ nhận từ khóa đứng đầu từ ("HK1", "GK1" không còn thành Khối 1); `app.js` (nhập PPCT, nhập đề AI) và `firebase-bridge.js` dùng chung hàm này; báo khi tên tệp ghi khối khác khối đang chọn; chặn lưu PPCT vào khối ngoài 6–12. | `PPCT HK1 Tin 9.csv` khi chọn Khối 9 → đọc Khối 9, lưu `9:B1–B3`. |
| L2 | `static-api.js`: bộ đề lưu `exam_set` đủ `id, title, revision_id, exam_ids, created_at, index, count` như bản Python; nhánh thường gán mã 101, 102…; `app.js` đọc an toàn cả dữ liệu bộ đề dạng cũ; `firebase-bridge.js` không báo lỗi vẽ màn hình thành "Chưa tải được dữ liệu". | Bộ 2 đề Tin 9: mã 101/102, tab "Đề đã lưu (2)" mở được, tải lại không lỗi, gửi duyệt và khóa cả bộ đạt; dữ liệu dạng cũ hiển thị "(1/2)", "(2/2)". |
| L3 | `static-exam-engine.js`: nhận câu Đúng/Sai 4 ý khi cả 4 ý cùng bài, mức độ và YCCĐ gốc (kể cả sau "Tách mục tiêu theo từng câu hỏi"), giống quy tắc bản Python; kiểm tra kỹ thuật câu Đúng/Sai; câu Trả lời ngắn nhập từ Excel (trường `answer`) được nhận. Đúng/Sai trải trên nhiều bài/mức và tự luận nhiều ý vẫn chặn, thông báo rõ hơn; bỏ ký tự thừa `{}` trong thông báo lỗi. | Vật lí 10: đề cương 12 ô, 43 câu (có 6 Đ/S); bộ 2 đề mã 101/102, mỗi đề 19 TN + 3 Đ/S + 3 TL = 10 điểm, 25/25 câu thuộc đề cương; duyệt và khóa đạt; Word học sinh không lộ đáp án, Word giáo viên ghi Đúng/Sai từng ý. |

Kiểm thử tự động sau khi sửa: Node 145/145 (thêm 5 ca bộ máy, 1 ca bộ đề, 4 khẳng định nhận diện khối), Python 458 (1 bỏ qua). Không sửa mã Python/Django nên không chạy lại bộ Django.

Còn lại (chưa sửa): L4–L16; nguyên nhân L9 là ô "Trắc nghiệm / Tự luận" (`type_counts`) ở màn hình đề cương bị `engine.plan` bỏ qua, nên số câu bốc theo mặc định ceil(1,5 × số câu cần).

## Đợt sửa L4, L5, L7 (24/11/2026, nhánh `fix/loi-nho-dot-2`, chưa commit)

| Lỗi | Sửa | Kiểm lại trên trình duyệt (Firebase giả, tài khoản Toán 9) |
| :--- | :--- | :--- |
| L4 | `table-file-helper.js`: mẫu Excel câu hỏi/PPCT/ma trận theo môn; Tin học giữ mẫu cũ, môn khác dùng khung đúng cột và dạng câu theo cấp (THCS: TN, TL; THPT: TN, Đ/S, TLN, TL) với ô cần điền như `[Tên bài 1 – Toán học lớp 9]`, không tự soạn nội dung chuyên môn. `app.js`: mẫu JSON/Markdown câu hỏi, đề cương, đề thi dùng cùng khung. `matrices.js`: mẫu ma trận Excel/JSON/Markdown theo môn đang chọn, tên tệp theo môn. | Tải mẫu PPCT và câu hỏi từ giao diện: không còn nội dung Tin học; mẫu nhập lại được (Đ/S 4 ý, TLN có đáp án). |
| L5 | `static-exam-export.js`: chân trang "Trang X/Y" (trường PAGE/NUMPAGES, Word tính khi mở); "A. nội dung", "a) nội dung" cùng một dòng khi nội dung là một dòng văn bản; điểm viết dấu phẩy (0,25). `static-download.js`: tên tệp theo môn, khối, kì, mã đề. | `De_hoc_sinh_Toan_hoc_Khoi_9_GK1_Ma_101.docx`; "Câu 1. (0,25 điểm)", "A. …" cùng dòng; có chân trang; đề ngắn hơn (182 so với 293 đoạn). Mở bằng python-docx: khổ ngang, chân trang "Trang 1/1" (số chỗ giữ, Word cập nhật). |
| L7 | `matrices.js`: người phụ trách mặc định "Tổ {môn đang chọn}" (thay "Tổ Tin học Á Châu"), kể cả khi dùng mẫu ma trận chuẩn theo khối. Giữ cơ sở "Cao Thắng". | Ma trận mới ở tài khoản Toán: "Tổ Toán học". |

Kiểm thử tự động: Node 148/148 (thêm ca tệp mẫu theo môn, chân trang/phương án/dấu phẩy, tên tệp; sửa 2 ca cũ chờ "1.25" thành "1,25"), Python 458 (1 bỏ qua). Chưa kiểm bằng Microsoft Word thật (số trang hiển thị khi Word mở tệp).

## Chưa kiểm tra trong đợt này

Trộn mã đề 101–104, xuất ZIP trọn bộ, xuất Word ma trận/đặc tả/đề cương, Word đáp án, tệp LMS, đồng bộ Google Drive, hai máy cùng sửa (đang làm ở phiên riêng), màn hình Kế hoạch KTĐG và KTTX, nhập Word/Markdown/JSON, trợ lý AI.

## Cách chạy lại

1. Chép `public/` ra thư mục tạm, chép `cong-cu/*` vào đó, thay `https://www.gstatic.com/firebasejs/${firebaseVersion}/` bằng `./fake-firebase/` trong `firebase-bridge.js` (chỉ ở bản chép).
2. Chạy `python3 -m http.server 8790` trong thư mục tạm, mở `http://localhost:8790/`.
3. Trong console: `localStorage.FAKE_USER = JSON.stringify({uid:'gv-tin', email:'gv.tin@truong.test', displayName:'Cô Lan'})`, tải lại trang, nạp `tester-data.js` và `tester-flow.js`, rồi gọi `TFLOW.ppct(...)`, `TFLOW.bank(...)`, `TFLOW.approve(...)`, `TFLOW.matrix(...)`, `TFLOW.revision(...)`, `TFLOW.singleExam(...)`.
