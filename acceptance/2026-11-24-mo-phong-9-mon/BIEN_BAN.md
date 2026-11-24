# Biên bản mô phỏng giáo viên 9 môn — bản Pages (24/11/2026)

## Phạm vi và cách làm

- Bản được thử: `public/` trên `main` sau commit `713b30f` (đã gỡ 3 cách lưu cũ, đã có Bản đồ tri thức).
- Chạy bằng Node, qua **cầu nối thật** `public/firebase-bridge.js` và Cloud-First v2 với **Firestore giả trong bộ nhớ** (`tests/firestore_mock.cjs`, có giao dịch). Đăng nhập giả theo tài khoản. Không gọi mạng, không dùng ngân hàng hay đề thật: dữ liệu tự sinh trong `mo-phong.cjs`.
- Đây là kiểm thử theo luồng nghiệp vụ (API trong trình duyệt), **không bấm giao diện**. Lần kiểm thử giao diện gần nhất: `../2026-11-24-kiem-thu-gia-lap/BIEN_BAN.md`.
- Chạy lại: `node acceptance/2026-11-24-mo-phong-9-mon/mo-phong.cjs` (ghi `KET_QUA.json`). CI chạy bản rút gọn (Tin học 8, Vật lí 10) trong `tests/static_mo_phong.test.cjs`.

## Tài khoản

| Tài khoản | Môn, khối | Cấp | Câu hỏi | Ma trận |
| :--- | :--- | :--- | :--- | :--- |
| Cô Lan | Tin học 8 | THCS | 20 (TN, TL) | 8 TN × 0,5 + 2 TL × 3 |
| Thầy Minh | Toán học 9 | THCS | 20 | như trên |
| Cô Hoa | Vật lí 10 | THPT | 30 (TN, Đ/S, TLN, TL) | 8 TN × 0,25 + 2 Đ/S × 2 + 2 TLN × 0,5 + 1 TL × 3 |
| Thầy Phúc | Hóa học 11 | THPT | 30 | như trên |
| Cô Mai | Sinh học 12 | THPT | 30 | như trên |
| Cô Thu | Ngữ văn 7 | THCS | 20 | 8 TN + 2 TL |
| Thầy David | Tiếng Anh 6 | THCS | 20 | 8 TN + 2 TL |
| Thầy Nam | Lịch sử 10 | THPT | 30 | như Vật lí |
| Cô Vân | Địa lí 11 | THPT | 30 | như Vật lí |

Mã năng lực trong ma trận lấy theo danh mục từng môn (`competency-catalog.js`), ví dụ Toán TDLL/MHH/GQVĐ, Ngữ văn ĐỌC/VIẾT/NÓI_NGHE.

## Vòng 1 — quy trình chuẩn (19 bước mỗi tài khoản)

Đăng nhập tài khoản mới (rỗng) → nhập PPCT 3 bài có bài tiền đề → nhập ngân hàng (thêm vào) → duyệt nhanh → lập và khóa ma trận → báo cáo thiếu câu → Bản đồ tri thức → đề cương theo ma trận → bộ 2 đề (101, 102) → kiểm định (mã cũ và kho luật) → hoán vị mã 201, 202 → duyệt khóa cả bộ → phát hành đề cương khi mã hoán vị chưa duyệt (phải bị chặn) → duyệt 2 mã hoán vị → phát hành đề cương và bộ đề → xuất Word học sinh, đáp án, gói ZIP → kho luật kiểm phạm vi tuần → tải lại trang → hai tab cùng sửa.

**Kết quả: 9/9 tài khoản đạt 19/19 bước.** Một số điểm đáng ghi:

- Kho luật và kiểm định cũ cho cùng kết luận trên cả 18 đề.
- Đề học sinh không chứa giải thích đáp án hay hướng dẫn chấm; bản đáp án có hướng dẫn chấm; gói ZIP có ma trận, đặc tả và đề cương.
- Tải lại trang: câu, PPCT, ma trận, đề cương, đề và trạng thái phát hành còn đủ; không ghi gì vào bộ nhớ trình duyệt.
- Hai tab cùng sửa một câu: tab sau bị chặn (`CLOUD_CONFLICT`).
- Tách dữ liệu: 18 tài khoản (cả vòng 2), không tài khoản nào thấy câu hay đề của môn khác.

## Vòng 2 — tình huống lộn xộn (11–12 bước mỗi tài khoản)

| Tình huống | Hành vi mong đợi | Kết quả |
| :--- | :--- | :--- |
| Nhập lại đúng tệp cũ | Không thêm câu trùng, báo rõ | Đạt ("cả 20 câu đều đã có") |
| Mã bài "b1", YCCĐ thừa dấu cách | Chuẩn hóa về B1, khớp YCCĐ | Đạt |
| Nhập câu cho khối chưa có PPCT | Chặn, không ghi | **Lỗi M1**, đã sửa |
| Câu có YCCĐ không thuộc PPCT | Chặn | Đạt |
| Ma trận tổng 9,5 điểm | Không khóa được, nói rõ 10 điểm | Đạt (chi tiết trong phần hiển thị bên dưới) |
| THCS dùng câu Đúng/Sai trong ma trận | Không khóa được | Đạt |
| Sửa câu đã duyệt | Về "cần duyệt lại"; ô thiếu có gợi ý đúng câu đó | Đạt |
| Xóa bài PPCT đang có câu và ma trận dùng | Chặn | **Lỗi M2**, đã sửa |
| Tạo bộ 6 đề khi ô tự luận hết câu đã duyệt | Chặn rõ ràng, không ghi dở | Chặn đúng, **thông báo chung chung (M4)**, đã sửa |
| Chưa đăng nhập mà lưu | Từ chối | Đạt |
| Khôi phục tệp sao lưu hỏng | Từ chối, giữ dữ liệu | Đạt |
| Khôi phục tệp sao lưu rỗng | Không xóa sạch dữ liệu trên đám mây | **Lỗi M3**, đã sửa |

Sau khi sửa: **9/9 tài khoản đạt toàn bộ vòng 2.**

## Lỗi tìm được và cách sửa

- **M1. Nhập câu cho khối chưa có PPCT được chấp nhận** (`static-api.js`, nhập thêm). Bản Pages chỉ đối chiếu PPCT khi khối đã có PPCT, nên câu nhập vào thành "mồ côi", ma trận không dùng được; bản Python (giáo viên duyệt 23/11/2026) thì bắt buộc. **Sửa:** chặn với thông báo "Khối N chưa có Phân phối chương trình môn …. Hãy nhập PPCT của khối này trước khi nhập câu hỏi"; lỗi thì không ghi câu nào.
- **M2. Xóa bài PPCT đang được dùng** (`firebase-bridge.js`, `/api/ppct/delete-lesson`): xóa ngay dù còn 9–11 câu hỏi và một ma trận đã khóa dùng bài. **Sửa:** chặn và nêu số câu hỏi, số ma trận đang dùng; bài không còn ai dùng vẫn xóa được.
- **M3. Khôi phục tệp sao lưu rỗng xóa sạch dữ liệu trên đám mây** (`replaceWorkspaceData`): Firestore không có thùng rác nên mất hẳn. **Sửa:** không cho khôi phục tệp không có câu hỏi, PPCT, ma trận, đề cương hay đề nào đè lên dữ liệu đang có.
- **M4. Thông báo thiếu câu khi tạo đề không chỉ vị trí** (`static-exam-engine.js`). **Sửa:** thêm "Vị trí thiếu: Tự luận câu 1, Tự luận câu 2: cần 2, có 0 câu đã duyệt trong phạm vi đề cương" và `details.short_slots`.
- **M5. Thông báo chặn phát hành đề cương không nói đề nào chưa khóa** (`static-exam-workflow.js`). Quy tắc đúng: mọi đề dùng đề cương (kể cả mã hoán vị, vốn không thừa hưởng việc duyệt) phải khóa. Nhưng giáo viên vừa khóa bộ đề sẽ không hiểu vì sao còn bị chặn. **Sửa:** liệt kê "mã 201 “…”; mã 202 “…”" và cách xử lý.

Kiểm thử chống tái phát: `tests/static_mo_phong.test.cjs` (7 ca, gồm chạy mô phỏng Tin học 8 và Vật lí 10).

## Chưa kiểm trong đợt này

- Thao tác bằng giao diện (bấm nút, nhập tệp Excel/Word thật); Firebase và Google Drive thật; đồng bộ cây thư mục Drive.
- Nội dung chuyên môn của từng môn (câu hỏi là dữ liệu minh họa). Ma trận THPT theo khung 19 TN + 3 Đ/S + 3 TL của CV 7991 chưa dựng lại trong mô phỏng (dùng khung rút gọn 10 điểm).
- Bố cục Word so với mẫu trường (khổ ngang, Times New Roman, đánh số câu).
