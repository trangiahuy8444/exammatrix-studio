## 25/11/2026 — Đề cương: sửa lỗi lưu, nhập tệp, lập theo số câu từng dạng, đối chiếu với đề

- Tái hiện trên giao diện (Firebase giả) lỗi giáo viên báo "Chọn câu hỏi cùng khối, không trùng mã để lập đề cương.": lối "📥 Import Đề cương" hỏng cả ba kiểu tệp — JSON có mã câu trùng (hay gặp ở tệp do AI soạn) ra đúng lỗi này; JSON không có mã câu ra "Không tìm thấy hồ sơ…" vì câu chỉ thêm vào màn hình, không vào ngân hàng; Markdown báo "parseQuestionsFromRawText is not defined" vì hàm đọc nằm trong phần trợ lý AI.
- Sửa: `/api/revisions/import` (một lần ghi) thêm câu mới vào Ngân hàng ở trạng thái Nháp, dùng lại câu đã có (cùng khối, cùng nội dung), rồi lập đề cương; giao diện Import dùng route này; bộ đọc Markdown dùng chung qua `window.parseQuestionsFromRawText`. `saveRevision` báo đúng điều sai (chưa có câu nào, chưa xác định khối, câu không còn trong ngân hàng kèm `missing_ids`); câu chọn trùng chỉ giữ một.
- Lập đề cương theo số câu từng dạng (VD 40 TN + 6 TL): `static-exam-engine.plan` nhận `type_counts` (trước đây bỏ qua, chỉ chế độ linh hoạt đọc), chia cho các ô cùng dạng theo tỉ lệ ô (phần dư theo phần lẻ lớn nhất), xáo câu theo mã ngẫu nhiên, báo từng ô thiếu "Ô B1 · trắc nghiệm · Biết thiếu 15 câu đã duyệt: cần 45, có 30"; nguồn mới "Toàn bộ ngân hàng Khối…" (`from_bank`) khi chưa có ma trận, chia theo bài × mức độ đang có. Hoạt động cả với ô ma trận 2D.
- Đối chiếu đề ↔ đề cương (chỉ đọc): `engine.revisionCoverage`, `/api/revisions/coverage`; thẻ "📊 Đối chiếu đề thi với đề cương" khi mở một đề cương: số câu có trong đề cương / cần (theo ngưỡng của đề), theo điểm, theo YCCĐ, bảng từng câu chưa có ("TN câu 3", bài, mức độ, điểm, nội dung, YCCĐ đã có hay chưa).
- Kiểm thử: `tests/static_de_cuong.test.cjs` (5 ca). Node 189/189, engine 458 (1 bỏ qua), mô phỏng 9 môn 18/18. Đổi `?v=20261125c` (app, core, static-api, static-exam-engine). Đã thử trên giao diện: nhập JSON trùng mã, JSON không mã, Markdown; bốc 40 TN + 6 TL từ ngân hàng (20/20/6), lưu, thẻ đối chiếu với đề.

## 25/11/2026 — Ma trận 2D → đề cương, đề → bảng đặc tả; sửa kiểm định; hộp thoại trộn đề

- Thao tác trên giao diện thật (Firebase giả, tài khoản Tin 9) tái hiện 4 lỗi: (1) bảng 2D tự gắn YCCĐ theo vị trí mức độ (Biết → YCCĐ 1, Hiểu → YCCĐ 2…) và năng lực mã đầu tiên, nên "Tạo đề thi ngay từ Ma trận 2D" báo thiếu câu, buộc dùng chế độ linh hoạt; (2) đề linh hoạt không có bản chụp câu nên kiểm định luôn "bản chụp sai", báo cáo ghi "ma trận: Bản nháp", thông báo chung chung; (3) trích đặc tả từ đề gộp nhầm "TN câu 1" với "TL câu 1" (số câu đánh lại theo phần), luôn gán YCCĐ thứ nhất; (4) trộn đề xáo lẫn tự luận vào trắc nghiệm, hộp hỏi chỉ là ô nhập số (5–10 mã vẫn chỉ tạo 4), đề linh hoạt không trộn được.
- Sửa: yêu cầu `outcome_mode: 'any'` (ô 2D chỉ ràng buộc bài × dạng × mức độ, mọi YCCĐ của bài) trong `matrices.js` (bảng 2D, thêm lựa chọn "Mọi YCCĐ của bài" ở ô YCCĐ nguồn), `static-exam-engine.js` (kiểm ma trận, chọn câu, thiếu câu, đề cương), `static-exam-workflow.js` (đối chiếu ô khi duyệt), `static-api.js` (chuẩn hóa ma trận, chế độ linh hoạt, gợi ý ô thiếu).
- `verifyExam` kiểm từng nhóm riêng, nêu rõ câu: chưa duyệt, khác khối/môn, thiếu nội dung kỹ thuật, nội dung đổi so với bản chụp (`snapshot`), trùng câu, sai ô ma trận (bài/mức/YCCĐ/điểm). Đề linh hoạt có bản chụp từng câu và cả đề. Trộn đề chỉ chặn khi bản chụp thật sự sai.
- `syncSpecFromExam`: mã vị trí, yêu cầu kèm dạng câu; YCCĐ đúng vị trí trong PPCT; năng lực của câu, không có thì lấy năng lực khai trong PPCT của bài; câu Đúng/Sai đủ 4 ý.
- Trộn đề: xáo trong từng phần (TN → Đ/S → TLN → TL), tùy chọn xáo phương án, ý a–d câu Đúng/Sai, giữ thứ tự tự luận, mã tự chọn 2–6, chặn trùng mã đã trộn; hộp thoại mới hiện bảng đáp án tổng hợp kèm số câu gốc (`core.permutationAnswerKey`).
- Mô phỏng 9 môn: 5 môn chuyển sang ma trận 2D, bước trộn kiểm thứ tự phần; tìm thêm 2 chỗ chưa hiểu ô 2D (duyệt khóa đề, gợi ý ô thiếu), đã sửa; 18/18 lượt đạt.
- Kiểm thử: `tests/static_ma_tran_2d.test.cjs` (7 ca). Node 184/184, engine 458 (1 bỏ qua). Đổi `?v=20261125b`. Đã thử trên giao diện: ma trận 2D → đề (không thiếu câu) → bộ đề + đề cương → kiểm định đạt → đặc tả theo đề đúng số câu, YCCĐ, năng lực → trộn 4 mã.
- Lưu ý: ma trận cũ tạo bằng bảng 2D trước ngày này vẫn mang YCCĐ gắn theo vị trí; muốn đổi, chọn "Mọi YCCĐ của bài" ở từng yêu cầu (ma trận đã khóa phải tạo phiên bản mới).

## 24/11/2026 — Mô phỏng giáo viên 9 môn; sửa 5 lỗi

- Kịch bản `acceptance/2026-11-24-mo-phong-9-mon/mo-phong.cjs`: 9 tài khoản (Tin 8, Toán 9, Vật lí 10, Hóa 11, Sinh 12, Ngữ văn 7, Tiếng Anh 6, Lịch sử 10, Địa lí 11) chạy qua cầu nối thật với Firestore giả. Vòng 1: 19 bước từ đăng nhập đến phát hành, xuất Word/ZIP, tải lại, hai tab. Vòng 2: 11–12 tình huống lộn xộn. Biên bản: `acceptance/2026-11-24-mo-phong-9-mon/BIEN_BAN.md`.
- Vòng 1 đạt 9/9 ngay; vòng 2 tìm ra M1 (nhập câu cho khối chưa có PPCT được chấp nhận, lệch quy tắc bản Python 23/11), M2 (xóa bài PPCT đang có câu và ma trận dùng), M3 (khôi phục tệp sao lưu rỗng xóa sạch dữ liệu trên đám mây), M4 (thông báo thiếu câu không chỉ vị trí), M5 (thông báo chặn phát hành đề cương không nói đề nào chưa khóa). Đã sửa cả 5 (`static-api.js`, `firebase-bridge.js`, `static-exam-engine.js`, `static-exam-workflow.js`); sau sửa 18/18 lượt đạt.
- Kiểm thử: `tests/static_mo_phong.test.cjs` (7 ca, CI chạy mô phỏng Tin 8 và Vật lí 10). Node 177/177, engine 458 (1 bỏ qua). Đổi `?v=20261124n` cho 4 tệp.
- Chưa kiểm: thao tác giao diện, Firebase/Drive thật, nội dung chuyên môn từng môn, bố cục Word theo mẫu trường.

## 24/11/2026 — Sửa L4, L5, L7 (tệp mẫu theo môn, Word đề, người phụ trách ma trận)

- Nhánh `fix/loi-nho-dot-2` (tách từ `fix/chan-ghi-de-hai-may`), chưa commit.
- L4: tệp mẫu Excel/JSON/Markdown (câu hỏi, PPCT, đề cương, đề thi, ma trận) theo môn đang chọn; môn khác Tin học dùng khung có ô cần điền, không tự soạn nội dung chuyên môn. L5: Word đề có chân trang "Trang X/Y", phương án cùng dòng với nhãn, điểm dùng dấu phẩy, tên tệp theo môn/khối/kì/mã đề. L7: người phụ trách ma trận mặc định theo môn.
- Node 148/148, Python 458 (1 bỏ qua); kiểm lại trên trình duyệt với tài khoản Toán 9. Chi tiết: `acceptance/2026-11-24-kiem-thu-gia-lap/BIEN_BAN.md`.

## 24/11/2026 — Sửa 3 lỗi nghiêm trọng từ kiểm thử giả lập (L1–L3)

- Giáo viên chọn sửa L1–L3. Làm trên nhánh `fix/chan-ghi-de-hai-may` (cùng thay đổi chặn ghi đè), chưa commit.
- L1: nhận diện khối từ tên tệp chặt hơn, dùng chung ở nhập PPCT/nhập đề AI/cầu nối; chặn PPCT ngoài Khối 6–12. L2: bộ đề lưu đủ thông tin như bản Python, mã 101, 102…; màn hình đọc an toàn dữ liệu cũ; lỗi vẽ màn hình không còn báo "chưa tải được dữ liệu". L3: bộ máy Pages tạo đề cương/đề với câu Đúng/Sai 4 ý cùng bài, mức độ, YCCĐ gốc; nhận đáp án Trả lời ngắn nhập từ Excel.
- Node 145/145, Python 458 (1 bỏ qua). Kiểm lại trên trình duyệt với Firebase giả: Tin 9 (bộ đề) và Vật lí 10 (Đúng/Sai) chạy hết quy trình đến xuất Word. Chi tiết: `acceptance/2026-11-24-kiem-thu-gia-lap/BIEN_BAN.md`. Chưa thử trên Firebase thật.

## 24/11/2026 — Kiểm thử giả lập 3 tài khoản giáo viên trên bản Pages

- Theo yêu cầu giáo viên: đóng vai người kiểm thử, giả lập Tin 9, Toán 9, Vật lí 10 với Firebase giả trên localhost, thao tác bằng giao diện. Mã thử là bản `main` (`cad8389`) chụp trước khi sửa; không đụng Firebase/Drive thật, không sửa mã ứng dụng.
- Phát hiện 3 lỗi nghiêm trọng: nhập PPCT đoán khối từ tên tệp ("HK1" thành Khối 1, dữ liệu bị cất mất); tạo bộ đề làm hỏng danh sách đề và lần tải sau, các đề cùng mã 101; Khối 10 không tạo được đề cương/đề từ ma trận vì chưa hỗ trợ Đúng/Sai. Cùng 5 lỗi quan trọng và 8 lỗi nhỏ.
- Biên bản, bảng lỗi và công cụ chạy lại: `acceptance/2026-11-24-kiem-thu-gia-lap/`.

## 24/11/2026 — Gỡ 3 cách lưu cũ; gợi ý câu trong báo cáo thiếu câu của ma trận

- `firebase-bridge.js` chỉ còn lưu qua Cloud-First v2. Gỡ chế độ Google Drive v1 (một tệp), Firestore v1 (một tài liệu) và phần ghi bộ nhớ trình duyệt (localStorage, IndexedDB, bản sao khẩn cấp): 20 hàm, khoảng 960 dòng. Giữ: đọc Firestore v1 / Drive v1 một lần để chuyển dữ liệu sang v2; `rescueBestCache` vẫn đọc khóa cũ và IndexedDB để cứu dữ liệu trước ngày gỡ; tải và khôi phục tệp sao lưu `.json` (khôi phục nay lưu lên đám mây qua `replaceWorkspaceData`, cần đăng nhập). `applyRescuedCache` cũng lưu lên đám mây thay vì bộ nhớ trình duyệt.
- Chưa cấu hình Firebase (kiểm thử, phát triển): dữ liệu chỉ nằm trong bộ nhớ trang; kiểm thử nạp dữ liệu mẫu qua `window.EXAMMATRIX_TEST_SEED`.
- `app.js`, hộp "Khôi phục sao lưu": bỏ nhánh ghi localStorage/Firestore v1; sửa lỗi có sẵn là lưu lên đám mây thất bại vẫn báo "Khôi phục thành công" (nay báo lỗi và nạp lại dữ liệu đang có).
- Ma trận: `/api/matrices/<id>/shortfall` gắn `suggestions` cho ô thiếu (câu đúng bài × YCCĐ × dạng × mức độ nhưng chưa duyệt, tối đa 5); bảng thiếu câu hiện "Gợi ý từ Bản đồ tri thức".
- Kiểm thử: viết lại phần nạp dữ liệu của `static_bridge`, `exam_comparison`, `static_catalog_api` (nay kiểm ghi danh mục lên Firestore v2), `static_knowledge_graph`; xóa 7 ca kiểm chế độ Drive v1 trong `static_google_drive` (giữ các ca của mô-đun Drive dùng cho chuyển dữ liệu); thêm ca gợi ý ô thiếu và ca "cứu hộ vẫn đọc bản cũ". Node 170/170, engine 458 (1 bỏ qua).
- Chưa thử với tài khoản Google thật.

## 24/11/2026 — Triển khai đồ thị tri thức và kho luật (Giai đoạn 1–5)

- Giáo viên yêu cầu triển khai kế hoạch `KE_HOACH_DO_THI_TRI_THUC.md` và tự chuyển giai đoạn. Làm dạng mô-đun mới, không đổi cách lưu dữ liệu; kho luật chạy song song, chưa thay quyết định duyệt đề.
- `public/knowledge-graph.js`: dựng đồ thị (môn, khối, chủ đề, bài, YCCĐ, năng lực, mức độ, dạng câu, câu hỏi, ma trận, đề cương, đề; cạnh thuộc, có YCCĐ, phát triển, đánh giá, nằm trong, căn cứ, tiền đề) từ PPCT và dữ liệu sẵn có; kiểm câu mồ côi; bảng phủ YCCĐ × mức độ; câu gần trùng; gợi ý câu cho ô thiếu; thứ tự ôn theo tiền đề; ngữ cảnh cho lời nhắc AI. Đọc cả `topic`/`topic_source`, `competencies`/`digital_competencies`.
- `public/knowledge-rules.js`: luật dạng dữ liệu + suy diễn tiến tới điểm bất động + giải thích (sự kiện, luật suy ra trung gian, điều kiện phủ định "không có…; chỉ có…", căn cứ). Căn cứ đã đối chiếu bản OCR: TT 22/2021 Điều 5 khoản 3 điểm b (thang điểm 10), Điều 7 khoản 1 (ma trận, đặc tả, YCCĐ; 45 phút với môn ≤ 70 tiết/năm); CV 7991 Phụ lục (dạng câu THPT); `rules/01` (90% từ đề cương); quyết định giáo viên 26/10 (câu đã duyệt, phủ YCCĐ 100%). Dạng câu THCS ghi là quy ước của tổ (còn chờ tổ xác nhận).
- `static-api.js`: `/api/knowledge/overview|rules|lesson-context|check-exam` (chỉ đọc); `/api/exams/verify` gắn thêm `verification.knowledge` (trường quản trị, ngoài hash duyệt).
- Giao diện: mục "🧠 Bản đồ tri thức" (`knowledge-ui.js`, hướng dẫn trong `core.screenGuide('knowledge')`), phần "Vì sao?" trong báo cáo kiểm định; trường "Bài tiền đề" khi sửa bài PPCT (lưu `prerequisites`, bỏ chính nó, giữ giá trị cũ khi không gửi); lời nhắc AI kèm ngữ cảnh tri thức; hộp xem trước nhập câu hỏi cảnh báo bài/YCCĐ lệch PPCT.
- Sửa trích dẫn sai có sẵn: lời nhắc AI ghi THCS không dùng Đúng/Sai "theo TT 22/2021"; TT 22/2021 không quy định điều này, nay ghi "theo quy ước của tổ chuyên môn".
- Đổi `?v=20261124k` cho các tệp đã sửa/thêm (tránh trùng số phiên cũ `d`).
- Kiểm thử: thêm 26 ca (`static_knowledge_graph`, `static_knowledge_rules`). Node 176/176, engine 458 (1 bỏ qua), Django 112/112. Đã mở màn hình mới trên trình duyệt với dữ liệu mẫu tự soạn, không lỗi console. Chưa thử với tài khoản Google và dữ liệu thật.
- Chưa làm: gỡ 3 nhánh lưu cũ (Giai đoạn 0); nối `suggestForCell` vào màn hình ma trận; cho kho luật thay mã kiểm định cũ (cần tổ xác nhận danh sách luật).

## 24/11/2026 — Gom về một nhánh, một kho ExamMatrix Studio

- Mọi nhánh đã nằm trong `main`; đóng PR #1, xóa `ck1-readiness`, `fix/chan-ghi-de-hai-may`, `fix/loi-nho-dot-2` trên máy và trên GitHub.
- Giáo viên chọn chỉ dùng kho `trangiahuy8444/exammatrix-studio`. Remote `origin` giờ trỏ về kho này (bỏ remote cũ `ngan-hang-de-web`). Kho cũ được lưu trữ (archive, chỉ đọc) trên GitHub, không xóa. Thư mục trên máy vẫn tên `ngan-hang-de-web/` để không làm hỏng đường dẫn trong workspace.
- Dịch vụ Render (bản Django, đã tạm dừng) từng nối với kho cũ: sẽ không nhận bản mới nữa; muốn chạy lại phải nối sang `exammatrix-studio` (`deploy/README.md`).
- Từ nay giáo viên cho phép làm xong là commit và push, không cần hỏi; vẫn làm trên nhánh tạm rồi gộp vào `main` và xóa nhánh.

## 24/11/2026 — Kế hoạch đồ thị tri thức (đề xuất)

- Giáo viên hỏi áp dụng kiến thức môn "Các hệ cơ sở tri thức" (đồ thị tri thức) vào dự án. Đã viết kế hoạch 6 giai đoạn (0 → 2 → 1 → 3 → 4 → 5) ở `KE_HOACH_DO_THI_TRI_THUC.md` và thêm dòng trỏ trong `LO_TRINH.md` mục D. Chưa triển khai, chưa sửa mã; mỗi giai đoạn cần giáo viên đồng ý.

## 24/11/2026 — Chặn ghi đè giữa hai máy/tab (Cloud v2), nhánh `fix/chan-ghi-de-hai-may`

- Sửa mục 3 của phiên rà soát bên dưới. `cloud-storage-v2.js`: mỗi tài liệu Firestore ghi kèm dấu phiên bản `_rev`; `firestoreReadWorkspaceV2` trả `revs` và tách `_rev` khỏi dữ liệu giáo viên; `firestoreWriteDiffV2(..., { knownRevs })` so dấu trên đám mây với dấu tab đã tải trước khi ghi (dùng `runTransaction` nếu có, nếu không thì đọc trước rồi ghi lô). Lệch dấu thì ném lỗi `CLOUD_CONFLICT` kèm danh sách mục trùng và không ghi gì trong lượt đó.
- Hồ sơ (`meta/profile`) chỉ ghi lại khi hồ sơ hoặc mục lục khối đổi, nên hai máy sửa hai tài liệu khác nhau vẫn lưu được cả hai. Sửa lỗi có sẵn: gói câu hỏi đọc về mang `updated_at` nên mỗi lần lưu ghi lại thừa mọi gói câu hỏi; nay bỏ trường này khi đọc.
- `firebase-bridge.js`: giữ `lastKnownRevsV2`, truyền vào mỗi lần lưu; gặp xung đột thì hoàn lại thay đổi trong tab, nhãn đồng bộ báo "⛔ Dữ liệu đã đổi ở máy khác" và hiện hộp thông báo kèm nút "Tải lại để lấy bản mới nhất". Không tự gộp. Thêm `runTransaction` vào bộ hàm Firestore. Đổi `?v=20261124c` cho hai tệp.
- Kiểm thử mới: `tests/static_cloud_conflict_v2.test.cjs` (17 ca, cả hai cách ghi), `tests/static_bridge_conflict.test.cjs` (3 ca qua cầu nối), Firestore giả dùng chung ở `tests/firestore_mock.cjs`. Trước khi sửa: 10 ca thất bại đúng như lỗi. Sau khi sửa: Node 141/141, engine 458 (1 bỏ qua), Django 112/112.
- Chưa kiểm trên Firestore thật và trình duyệt đã đăng nhập. Chưa commit, chưa push (push lên `main` sẽ triển khai ngay lên trang giáo viên đang dùng).
- Lưu ý: tài liệu đã có trên Firestore nhưng nằm ở khối không có trong mục lục hồ sơ (nếu có do lỗi cũ) sẽ luôn bị coi là xung đột khi ghi đè lên; chưa gặp trong kiểm thử.

## 24/11/2026 — Chốt bản Pages là bản chính; rà soát lưu trữ

- Giáo viên quyết định chỉ giữ bản GitHub Pages; Django và bản cục bộ tạm dừng phát triển. Đã ghi vào `BOI_CANH.md` (mục 4), `CLAUDE.md`, `AGENTS.md`.
- Kiểm thử trên máy: engine 458 (1 bỏ qua), Django 112/112, Node 121/121, đều đạt.
- Phát hiện khi chạy thử bản Pages trên localhost (chưa sửa):
  1. Chế độ Cloud v2 bật khi có cấu hình Firebase: chưa đăng nhập Google thì mọi thao tác ghi bị từ chối ("Vui lòng đăng nhập…") và không có bản lưu trong trình duyệt. Mô tả "Offline mode" trong `CLAUDE.md` không còn đúng với bản Pages thật.
  2. `firebase-bridge.js` còn 4 nhánh lưu (Cloud v2, Drive v1, Firestore v1, ngoại tuyến); chỉ Cloud v2 đang dùng.
  3. Ghi Firestore theo phần chênh so với lần tải của tab hiện tại, không kiểm phiên bản: hai máy/tab sửa cùng một phần thì bản ghi sau đè bản trước mà không báo.
  4. Ghi Google Drive chạy ngầm sau Firestore; lỗi chỉ hiện nhãn "Chờ đồng bộ Drive".
  5. Mỗi lần push lên `main` là tự triển khai lên trang giáo viên đang dùng, không có bước thử trước.

## 24/11/2026 — Cập nhật tài liệu theo mã nguồn mới (20–24/11)

- Đọc lại dự án sau 58 commit (`28d1c1a` đến `cad8389`): 87 tệp, khoảng +23.500/−1.900 dòng. Bản trên máy khớp `studio/main`.
- 20/11: lưu trữ Google Drive riêng cho bản Pages (`28d1c1a`, `412d269`); khung nhập PPCT lên đầu trang, bỏ nút nạp mẫu, không tự nạp bài Tin học cho tài khoản mới (`ca09f7f`, `a93ab05`).
- 21/11: PPCT chuẩn 7 cột theo CV 5512, TT 02/2025, QĐ 2422 (`36adb3d`, `6641a10`); chuẩn hóa 5 phân hệ THPT theo CV 7991 và THCS (`799ee58`); danh mục năng lực 13 môn (`961e2a1`); đánh số lại từ Câu 1 cho từng dạng câu (`19a6a3a`, `afc564c`).
- 22/11: ma trận THPT theo khung 19 trắc nghiệm (4,75 đ) + 3 Đúng/Sai (3,0 đ) + 3 tự luận (2,25 đ) (`939e020`); chỉ báo THPT không còn chặn khóa ma trận (`83a092c`); ưu tiên Excel, rồi JSON, rồi Markdown (`fc9e72f`).
- 23/11: Cloud-First v2 (Firestore cùng cây thư mục Drive, `a688daa`) và đồng bộ hai chiều (`3ec20ff`, `079261e`, `6f6b6c1`); nhập Excel/Markdown/AI thêm câu thay vì thay cả ngân hàng (`97eb7e4`); kế hoạch kiểm tra đánh giá Phụ lục 3 CV 5512 nối vào ma trận (`17f4d2d`); nhãn năng lực NLa–NLe (`7f3134c`, `5a61461`); hộp chọn khi xuất (`0fb0476`); tạo đề linh hoạt, tránh tạo trùng đề (`014a61c`, `67c90a5`, `ccd5caf`); ẩn mã kỹ thuật khỏi giao diện (`d96b146`); CI Pages tách `build` và `deploy` (`9d7c99c`).
- 24/11: gộp luồng giáo viên một cửa, duyệt hàng loạt, độ giống từ 0–100% (`473d0ca`, `cad8389`).
- Tài liệu: `CLAUDE.md` thêm mục "Pages build" (cầu nối `firebase-bridge.js`, `static-api.js`, các mô-đun `static-*`, lưu trữ Drive/Firestore, chế độ ngoại tuyến), lệnh kiểm thử Node mới và lưu ý đổi số phiên `?v=` khi sửa tệp JS. `LO_TRINH.md` ghi trạng thái hiện tại.
- Chưa làm: chạy lại toàn bộ kiểm thử sau đợt thay đổi này; kiểm các thay đổi mới có đúng quy chuẩn xuất bản của trường (khổ ngang ≤ 24 cm, Times New Roman, cách đánh số câu); các ô nghiệm thu của giáo viên vẫn chưa đổi. Thư mục `acceptance/2026-11-21-khoa-bang/` còn chưa theo dõi.

## 23/11/2026 — Nhập câu hỏi từ Excel: thêm vào, không thay ngân hàng

- Giáo viên chọn sửa đường nhập (Cách 1) để nạp ngân hàng Tin 8/9/10 cả năm. Lỗi tái hiện trên bản sao: nhập Excel thay toàn bộ ngân hàng (360 câu còn 20), mọi câu tự luận bị từ chối (hướng chấm gộp 1 tiêu chí), mã bài bị viết hoa (B8a → B8A, câu nháp gắn vào bài không có trong PPCT). Nạp câu AI cũng thay toàn bộ ngân hàng.
- `BankService.append_questions` + `/api/bank/import` với `mode: 'append'`: giữ câu cũ, bỏ qua câu trùng nguyên văn cùng khối, chuẩn hóa mã bài theo PPCT không phân biệt hoa thường, bắt buộc bài và YCCĐ thuộc PPCT khối kể cả câu nháp, câu nhập luôn là Nháp; có lỗi thì báo theo số thứ tự câu và không ghi gì. Không có `mode` thì giữ hành vi cũ (khôi phục từ JSON).
- `table-file-helper.js`: giữ chữ hoa/thường của mã bài; `parseRubricText` tách hướng chấm theo mốc "(0,25 điểm)", ghi kèm ý a)/b); thêm chính sách đáp án tương đương mặc định. `app.js`: Excel, Markdown, AI gửi `mode: 'append'`, hộp xác nhận nêu khối đích, thông báo số câu thêm/bỏ qua; hộp nhập JSON ghi rõ là thay toàn bộ.
- Kiểm thử: thêm `tests/test_append_import.py` (4) và 1 ca Node. Engine 457 (3 lỗi `test_export_roundtrip` có sẵn ở commit gốc trên máy ảo, 1 bỏ qua); Django 112/112 trên bản sao (trong thư mục Drive, `test_hosting` lỗi vì thư mục cấm xóa tệp, không do mã); 17/17 bộ Node.
- Bản Pages (`static-api.js`, giáo viên đang dùng): nhánh `mode: 'append'` cùng quy tắc (bỏ trùng, chuẩn hóa mã bài, đối chiếu PPCT nếu khối có PPCT, kiểm tra kỹ thuật, lỗi thì không ghi). Thêm `tests/static_append_import.test.cjs`. Lưu ý: bản sao Firestore là một tài liệu (giới hạn 1 MB) nên với ngân hàng lớn chỉ còn Google Drive là nơi lưu chính.
- Chạy thử trên bản sao CSDL thật (không ghi CSDL thật): 360 → 1 251 câu sau khi nạp Tin 8 (432) và Tin 9 (459); nạp lại bị báo trùng; nạp tệp Khối 8 khi chọn Khối 9 bị chặn toàn bộ. Giáo viên đồng ý push lên main (ngan-hang-de-web và exammatrix-studio); bản Django cục bộ cần khởi động lại để dùng mã mới.

## 19/11/2026 — Nạp danh mục năng lực và chỉ báo theo môn

- Thêm đọc XLSX/CSV/TSV và bảng dán Word/Excel, xem trước/kiểm lỗi, lưu theo môn với kiểm phiên bản. Có mẫu CSV minh họa, không tự tạo mã chuẩn.
- Áp dụng riêng vào bản nháp, chọn năng lực YCCĐ và chỉ báo theo danh mục. Snapshot được lưu/băm/xuất cùng ma trận; thư viện cập nhật không đổi bản khóa. Đồng bộ cache/Firestore giữ danh mục.
- Rà soát và sửa nhập câu hỏi làm mất danh mục, bảo vệ snapshot nguồn nhận, kiểm lại snapshot qua đường nhập/lưu; hiển thị nội dung nhập như văn bản. Không ghi dữ liệu thật.
- Python 445 (1 bỏ qua), Django 112/112, migration không đổi; kiểm frontend và Chromium/File đạt. Hướng dẫn và phạm vi: `acceptance/2026-11-19-vat-li/NAP_DANH_MUC.md`. Chưa commit/push hoặc nghiệm thu dữ liệu thật.

## 19/11/2026 — Sửa lỗi chỉ báo chặn ma trận Vật lí THPT

- Tái hiện quy tắc chỉ báo Tin học bị áp dụng sang môn khác. Sửa đồng bộ JavaScript/Python: môn khác không có danh mục được để trống; mã/danh mục đã khai vẫn kiểm năng lực YCCĐ. Giữ kiểm điểm và PPCT.
- Lỗi khóa trả báo cáo chi tiết, chỉ rõ câu/ý và mã. Thêm hướng dẫn trên giao diện; không chỉnh dữ liệu đã lưu.
- Kiểm thử mới Node 4/4, Python 3/3; toàn bộ kiểm thử tĩnh 57/57; kiểm giao diện hiện có đạt. Chromium mở File với dữ liệu minh họa khóa được Vật lí, tải lại giữ nguyên, mã sai bị chặn đúng. Biên bản: `acceptance/2026-11-19-vat-li/BIEN_BAN.md`. Chưa push; chưa nghiệm thu dữ liệu thật.

## 19/11/2026 — Sửa luồng ra đề Pages sau kiểm tra thực tế

- Thêm module engine, workflow, export, API và download tách riêng; bỏ phản hồi đạt/đủ/thành công mặc định, kiểm lại tệp nhập thay vì tin cờ client.
- Sinh đề/bộ đề từ câu approved theo ma trận/YCCĐ, snapshot độc lập, duyệt với checklist, hash khóa và thứ tự phát hành. Thêm hoán vị bảo toàn đáp án, chuyển cả bộ nguyên tử và chặn sửa/xóa hồ sơ khóa.
- DOCX/ZIP thực, tách đề học sinh/đáp án, quy đổi điểm rubric; xuất ma trận DOCX; cảnh báo cụ thể các thành phần thiếu. Không coi HTML `.doc` là DOCX.
- Sửa nhận diện Python/Django trên localhost; tuần tự hóa và tách phản hồi, báo hết bộ nhớ/đồng bộ lỗi, giữ cache chưa đồng bộ khi mở lại. Bỏ fallback giao diện tự duyệt/ghi ngân hàng sau lỗi.
- Kiểm trình duyệt bắt và sửa lỗi mặc định khối làm mất ma trận trong lựa chọn, tỷ lệ/điểm ma trận tùy biến dùng giả định cố định. Đã kiểm đường dẫn con kiểu Pages và tải tệp thật.
- Bổ sung CI Node cho các module mới; workflow Pages phụ thuộc kiểm thử tĩnh. Chưa push/triển khai, chưa kiểm Firestore/PostgreSQL thật hoặc nghiệm thu Word/PDF; câu nhiều ý chưa hỗ trợ đầy đủ bị chặn. Chi tiết: `acceptance/2026-11-19-pages/BIEN_BAN.md`.

## 19/11/2026 — Báo cáo so sánh cấu trúc các đề

- Người dùng chọn báo cáo độ tương đương giữa các đề; mục tiêu giảm thời gian soạn và sai sót của giáo viên. Triển khai đối chiếu cấu trúc theo câu, không suy ra độ khó thực nghiệm.
- Thêm lõi Python/JavaScript, API chỉ đọc và hộp chọn 2–6 đề trên Django/legacy/Pages. Đối chiếu bối cảnh, phân bố, ô kết hợp và trọng số từng câu; thiếu dữ liệu báo chưa đủ căn cứ. Không trả đáp án.
- Rà soát độc lập phát hiện hai thiếu sót: tổng điểm ô che trọng số câu khác nhau và phép làm tròn JS lệch Python. Đã tái hiện bằng kiểm thử lỗi rồi sửa; kiểm đầu ra chéo 30 kịch bản.
- Kế hoạch, cấu trúc và rủi ro: `docs/KE_HOACH_SO_SANH_DE.md`; kết quả cuối phiên: `acceptance/2026-11-19-so-sanh-de/BIEN_BAN.md`.
- Dữ liệu thử tự soạn và CSDL thử trong thư mục tạm; không khôi phục hoặc migrate dữ liệu thật, không commit/push/triển khai. Chưa tự đánh dấu nghiệm thu giáo viên trong lộ trình.

## 17–18/11/2026 — Gỡ Chế độ Test, chế độ ngoại tuyến, gộp lịch sử Pages

- Gỡ hoàn toàn Chế độ Test (vùng Test) theo yêu cầu: giao diện, `server.py` (`/api/test/*`), lớp Django, `domain/test_seed.py` và test liên quan. Migration `0006` xóa dữ liệu các vùng Test, `0007` bỏ cột `is_test_mode` và đưa ràng buộc về mỗi tài khoản/khóa học một ngân hàng (`45f4657`).
- Bản Pages: chế độ ngoại tuyến lưu `localStorage`, banner kèm tải bản sao lưu và khôi phục từ tệp `.json`; không tự bật hộp đăng nhập; đăng xuất quay về dữ liệu ngoại tuyến; mở `window.store` để cầu nối cập nhật giao diện sau đăng nhập/đăng xuất.
- Lỗi đăng nhập Google: miền `trangiahuy8444.github.io` chưa nằm trong Firebase Authorized domains (việc của quản trị viên trong Firebase Console). Thông báo lỗi tiếng Việt cho `unauthorized-domain`, mất mạng, khóa API không hợp lệ.
- Ma trận: khung "Hướng dẫn nhập số liệu" và thanh thu phóng khung xem trước (chỉ đổi cỡ hiển thị, không đổi định dạng xuất); chỉnh nhẹ CSS (`5fe0ad9`).
- Gộp lịch sử `ck1-readiness` vào `main` của `exammatrix-studio` giữ cả hai lịch sử, không ghi đè (`8daed14`). Sửa hai ca lỗi CI: danh mục 9 môn và sao lưu trên Postgres (`935d752`).
- Kiểm thử lúc đó: Django 105 ca đạt, Node đạt, `makemigrations --check` sạch; Tests và Deploy trên GitHub Actions đạt.

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
