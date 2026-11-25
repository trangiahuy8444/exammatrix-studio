# Kế hoạch giao việc cho Antigravity — Bản đồ tri thức và kho luật (25/11/2026)

Người viết: Claude Code (phiên "Exammatrix-studio setup và lỗi"). Tài liệu này thay cho việc trao đổi miệng: đọc hết trước khi sửa mã.

## 0. Đọc trước, làm theo

- Quy tắc workspace: `../AGENTS.md`, toàn bộ `../rules/`, `../.claude/rules/00_tuan_thu_quy_dinh_phap_luat.md`. Mọi căn cứ pháp lý ghi số hiệu, điều, khoản đã đối chiếu bản gốc trong `../01_Van_ban_phap_ly_va_Quy_dinh/`; không trích theo trí nhớ.
- Dự án: `CLAUDE.md` của thư mục này. Bản chính là GitHub Pages (`public/`, JS thuần không build). Django và bản legacy đã đóng băng nhưng bộ kiểm thử của chúng phải xanh.
- Giao diện giữ kiểu cũ: xanh Á Châu `#0267B1`, thanh bên tối, emoji (giáo viên đã từ chối giao diện tím, 25/11/2026). Mọi chữ hiển thị bằng tiếng Việt.
- Mỗi khi sửa `public/*.js|css`: tăng thẻ `?v=` của đúng tệp đó trong `public/index.html`. Thêm tệp JS/CSS mới thì thêm vào danh sách cho phép trong `cloud/assessment/legacy_views.py` (`source_asset`) và `cloud/config/urls.py`.
- Quy trình: làm xong thì commit và push lên `main` (giáo viên đã cho phép), rồi chờ hai lượt CI "Tests" và "Deploy to GitHub Pages" xanh (`gh run watch <id> --exit-status`). Việc không hoàn tác được (xóa dữ liệu, xóa kho) phải hỏi trước.
- **Chỉ commit tệp/đoạn mình sửa.** Trong ngày 25/11 đã hai lần một commit gộp nhầm việc đang dở của phiên khác (1e240e4, e610494). Trước khi commit: `git diff` từng tệp, `git add` đúng tệp; tệp có cả việc của người khác thì tách đoạn.

Lệnh kiểm thử (chạy từ thư mục này):

```bash
node --test tests/*.test.cjs
```

```bash
node acceptance/2026-11-24-mo-phong-9-mon/mo-phong.cjs
```

```bash
(cd cloud && ~/.venvs/ngan-hang-de-web/bin/python manage.py test --noinput)
```

```bash
~/.venvs/ngan-hang-de-web/bin/python -m unittest discover -s tests
```

Kiểm tra trên trình duyệt bằng Firebase giả: chép `public/` sang thư mục tạm, chép `acceptance/2026-11-24-kiem-thu-gia-lap/cong-cu/*` vào đó, thay `https://www.gstatic.com/firebasejs/${firebaseVersion}/` bằng `./fake-firebase/` trong `firebase-bridge.js` của bản chép, đặt `localStorage.FAKE_USER`.

## 1. Trạng thái lúc giao (main = 03b8828)

| Commit | Nội dung |
| :--- | :--- |
| 1e240e4 | Nền móng tri thức: mã YCCĐ cố định (`core.assignOutcomeIds`, `syncOutcomeIds`, `resolveOutcome`, `normalizeOutcomeIds`), nối câu/ma trận theo mã, một định nghĩa câu trùng (`core.questionKeys`, `questionRelation`), ô ma trận 2D trong đồ thị (`KG.matrixCells`), khu "Mã yêu cầu cần đạt" ở Bản đồ tri thức |
| e610494 | Tỉ lệ đề cương theo từng dạng `coverage_targets`; kèm một nửa việc "kho luật nắm quyền chặn" (`verification()` trong `static-api.js`, `/api/knowledge/parity`, ô "Kiểm tra đến hết tuần") |
| 03b8828 | Nửa còn lại của "kho luật nắm quyền chặn": luật cho lỗi tính bằng thủ tục (R-BAN-CHUP, R-KY-THUAT, R-O-MA-TRAN…), ngưỡng của tổ (`profile.rule_config`), phân tầng phủ định, cảnh báo giới hạn suy diễn, khu đối chiếu kiểm định cũ. Node 216/216, Django 112/112, mô phỏng 9 môn đạt; 36 đề mô phỏng: 0 đề lệch giữa kho luật và kiểm định cũ |

Mục 1–4 và 8 của bản đánh giá hệ cơ sở tri thức đã xong. Còn lại: Việc 1 (nối kho luật với tỉ lệ theo dạng) và các mục 5, 6, 7, 9, 10 (Việc 2–6).

## 2. Việc 1 — Nối kho luật với tỉ lệ theo dạng (`coverage_targets`)

e610494 thêm tỉ lệ riêng theo dạng câu cho đề cương (`revision.coverage_targets`, engine `revisionCoverage`, `assignFlexibleSlots`). Kho luật chưa biết điều này: luật `R-TI-LE-DE-CUONG` chỉ đếm tỉ lệ chung (`so_cau_can_tu_de_cuong`).

- Trong `examFacts` (`knowledge-rules.js`): khi đề cương có `coverage_targets`, sinh sự kiện theo dạng: `[d,'can_tu_de_cuong_dang',x]`, `[x,'dang',t]`, `[x,'can',n]`, `[x,'co',m]`; thêm luật `R-TI-LE-DANG` (chặn khi `co < can`) với căn cứ "Quyết định giáo viên 25/11/2026: tỉ lệ đề cương theo từng dạng" và vẫn giữ sàn tỉ lệ chung 90% (rules/01).
- Khớp với cách engine tính `required` theo dạng (`Math.ceil(total*target/100)`), để `/api/knowledge/parity` không lệch.
- Kiểm thử: đề có TN 85%, TL 100% → đủ thì đạt, thiếu một câu TL thì chặn bằng `R-TI-LE-DANG`; đối chiếu `parity` khớp.

## 3. Việc 2 — Lược đồ (ontology) khai báo bằng dữ liệu (mục 5 của đánh giá)

- Tệp `public/knowledge-graph.js`: thêm `SCHEMA` = danh sách loại nút, vị từ, loại nút đầu/cuối, số lượng (1, 0..1, 0..n).
- Tách vị từ `thuoc` dùng chung thành `thuoc_mon`, `thuoc_khoi`, `thuoc_chu_de`, `kiem_tra_bai` (câu → bài); cập nhật mọi chỗ gọi `outgoing/incoming(…,'thuoc')` trong `knowledge-graph.js`, `static-api.js`, kiểm thử `tests/static_knowledge_graph.test.cjs`, `tests/static_nen_mong_tri_thuc.test.cjs`.
- Hàm `checkSchema(g)` trả vi phạm lược đồ (cạnh sai loại nút, thiếu cạnh bắt buộc); hiện ở mục "Lỗi và chỗ thiếu" của Bản đồ tri thức.
- Xong khi: đồ thị dựng từ dữ liệu mẫu không có vi phạm lược đồ; một cạnh sai loại bị báo.

## 4. Việc 3 — Năng lực và chỉ báo (mục 6)

- Không gán năng lực của cả bài cho mọi YCCĐ nữa (`knowledge-graph.js`, vòng PPCT, `lessonComps.forEach`): chỉ gán khi PPCT ghi năng lực theo từng YCCĐ hoặc ma trận/đặc tả ghi năng lực cho yêu cầu đó; năng lực cấp bài để ở nút bài.
- Nút `chibao` từ `matrix.indicator_catalog`; quan hệ YCCĐ → chỉ báo → thành phần năng lực.
- Năng lực số (TT 02/2025/TT-BGDĐT) và giáo dục AI (QĐ 2422/QĐ-BGDĐT, CV 5588/BGDĐT-GDPT): đọc mã từ `digital_competencies` của PPCT thành loại nút riêng. Trước khi đặt mã, đọc văn bản trong `../01_Van_ban_phap_ly_va_Quy_dinh/` để lấy đúng bảng mã; không tự đặt.
- Xong khi: bảng phủ có thêm cột năng lực theo YCCĐ; kiểm thử chứng minh hai YCCĐ cùng bài có năng lực khác nhau.

## 5. Việc 4 — Thời gian và bản chụp trong đồ thị (mục 7)

- `KG.buildGraphForExam(exam)`: dựng đồ thị từ bản chụp của đề (`ppct_snapshot`, `matrix_snapshot`, `revision_snapshot`) thay cho PPCT hiện tại, dùng trong `/api/knowledge/check-exam` và báo cáo kiểm định đề đã khóa.
- Ghi `nguon` (ppct/matran/decuong/de) và `phien_ban` (thời điểm cập nhật hồ sơ nguồn) vào thuộc tính cạnh.
- Xong khi: sửa PPCT sau khi khóa đề không làm báo cáo của đề đã khóa thay đổi.

## 6. Việc 5 — Giải thích kèm cách sửa (mục 9)

- Mỗi luật chặn có thêm `cach_sua`: mô tả và hành động trong ứng dụng. Ví dụ R-TI-LE-DE-CUONG → mở khung "Điều chỉnh tỉ lệ câu của đề có trong đề cương" (đã có ở màn Đề cương); R-CHUA-DUYET → mở màn Duyệt câu hỏi lọc đúng các câu; R-O-MA-TRAN → gợi ý câu thay thế bằng `KG.suggestForCell`; R-BAN-CHUP → "Kiểm định lại" hoặc tạo lại đề.
- `knowledge-ui.js` hiện nút hành động dưới mỗi vi phạm.
- Xong khi: mỗi vi phạm chặn trong báo cáo có ít nhất một nút sửa dẫn tới đúng chỗ.

## 7. Việc 6 — Độ giống văn bản và tiền đề liên khối (mục 10)

- `KG.similarQuestions`/`nearDuplicateGroups`: dùng `core.textSimilarity` (cụm 2 từ, đã có) và danh sách từ dừng tiếng Việt; lập chỉ mục theo cụm từ để không so từng cặp trên cả ngân hàng.
- Tiền đề liên khối: `lesson.prerequisites` nhận mã dạng `8:B12` (khối:bài); đồ thị nối sang bài khối khác; chặn vòng lặp khi lưu PPCT (trả lỗi rõ bài nào tạo vòng).
- Gợi ý tiền đề theo thứ tự tuần để giáo viên xác nhận (không tự ghi).
- Xong khi: kiểm thử có cặp "máy tính"/"tính máy" không còn bị coi là giống nhau; nhập tiền đề tạo vòng bị từ chối.

## 8. Kiểm tra chung trước mỗi lần push

- Bốn bộ kiểm thử ở mục 0 đều xanh; mô phỏng 9 môn đạt.
- `/api/knowledge/parity` trên dữ liệu mô phỏng: 0 đề lệch (cách chạy: xem `acceptance/2026-11-24-mo-phong-9-mon/mo-phong.cjs`, đọc từng tài khoản bằng `CloudStorageV2.firestoreReadWorkspaceV2` rồi gọi `/api/knowledge/parity`).
- Kiểm tra trên trình duyệt phần giao diện đã sửa; không có lỗi trong bảng điều khiển.
- Ghi nhật ký `docs/NHAT_KY.md`; cập nhật `docs/KE_HOACH_DO_THI_TRI_THUC.md` khi xong một việc.
