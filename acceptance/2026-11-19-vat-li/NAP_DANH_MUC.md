# Nạp danh mục năng lực và chỉ báo — 19/11/2026

## Kết quả và cách dùng

Trong **Ma trận & đặc tả**, mở **Danh mục năng lực & chỉ báo · [môn đang chọn]**:

1. Chọn Excel `.xlsx`, CSV/TSV hoặc dán bảng từ Word/Excel có hàng tiêu đề.
2. Bảng gồm bốn cột: **Mã năng lực | Tên thành phần năng lực | Mã chỉ báo | Mô tả chỉ báo**. Có nút tải mẫu CSV minh họa; thay nội dung bằng tài liệu thật của tổ bộ môn.
3. Xem trước, sửa các dòng thiếu/trùng/mâu thuẫn rồi bấm **Lưu danh mục cho môn…**.
4. Mở ma trận nháp và bấm **Áp dụng danh mục đã lưu vào ma trận đang mở**. Không tự đổi năng lực YCCĐ hoặc mã đã nhập.
5. Trong phần tùy chỉnh câu hỏi/chỉ báo nâng cao, chọn năng lực của YCCĐ và mã chỉ báo theo năng lực, rồi lưu/chốt ma trận.

Ma trận lưu bản sao danh mục và số phiên bản. Cập nhật thư viện không đổi hồ sơ đã khóa; cần phiên bản nháp để áp dụng lại.

## Thay đổi mã nguồn của tính năng

- Mới: `public/competency-catalog.js` đọc/kiểm dữ liệu; `public/competency-catalog-ui.js` xem trước/lưu/áp dụng; `matrices/competency_catalog.py` kiểm phía máy chủ.
- `public/index.html`, `public/matrices.js`: nạp module, danh mục theo môn thay danh sách Tin học cố định, lọc chỉ báo theo năng lực, giữ lựa chọn sai để đối chiếu, giữ phần biên tập mở khi đổi năng lực, hiển thị nội dung nhập như văn bản.
- `public/static-api.js`, `public/static-exam-engine.js`: API danh mục theo môn, kiểm phiên bản, kiểm snapshot khi lưu/nhập, băm tính trường mới khi có. Gói có dấu kiểm tra sai bị chặn; gói nháp cũ không có dấu vẫn chỉ nhập bản nháp và phải kiểm định trước khóa.
- `public/firebase-bridge.js`: giữ danh mục trong cache ngoại tuyến và payload đồng bộ; `bank_service.py`: nhập câu hỏi không làm mất hoặc thay danh mục đang lưu.
- `matrices/model.py`, `service.py`, `http.py`: snapshot và kiểm định theo danh mục môn, bảo vệ snapshot nguồn nhận, API chung cho Python/Django. `exchange.py` hiện có đã giữ trường mới qua danh sách trường tùy chọn, không cần sửa trực tiếp.
- `matrices/exports.py`, `public/static-exam-export.js`, bản xem trước trong `matrices.js`: giữ năng lực/tên/chỉ báo/mô tả trong bản xuất khi có snapshot. Bản xuất custom không dùng các cột Tin học cố định.
- Thêm kiểm thử Node/Python/Django và kịch bản Chromium `kiem_thu_nap_danh_muc.py`.

## Kiểm chứng

- Tái hiện các ca thiếu chức năng trước sửa bằng kiểm thử thất bại. Kiểm parser gồm Unicode, CSV dấu phẩy/chấm phẩy, TSV, ô xuống dòng, mã trùng, thiếu/mâu thuẫn năng lực, tham chiếu sai, XLSX shared strings/inline strings, sheet thưa, nhiều sheet, công thức và tệp lỗi.
- Chromium thực mở `file://`, chặn mạng ngoài, profile riêng: nạp XLSX nén, xem trước, chặn trùng mã, gắn năng lực/chỉ báo, chốt, tải lại, cập nhật danh mục phiên bản 2 nhưng ma trận khóa vẫn nguyên bản 1; chặn áp dụng vào bản khóa. Không có lỗi JavaScript chưa xử lý. Đã xem ảnh giao diện.
- Node: 74/74. Python: 445 ca, 444 đạt, 1 bỏ qua (nhánh Word/PDF thật). Django SQLite: 112/112. Kiểm migration: không thay đổi. Hai bộ kiểm thử frontend hiện có đạt; kiểm cú pháp và khoảng trắng đạt.
- Rà soát độc lập phát hiện và đã sửa mất danh mục khi nhập câu hỏi, thiếu bảo vệ snapshot nguồn và bỏ kiểm snapshot ở đường nhập gói/lưu nháp. Kiểm lại bằng fixture minh họa.

## Giới hạn

- Tối đa 5 MB/tệp và 2000 dòng dữ liệu. XLSX cần ô mã là văn bản; không hỗ trợ `.xls`, công thức hoặc nhiều sheet cùng chứa dữ liệu. Hãy giữ một sheet danh mục hoặc chuyển sang CSV/TSV.
- Đây là bảng do giáo viên cung cấp, chưa có thẩm định nội dung theo tài liệu chuyên môn thật. Không tự tạo mã chuẩn Vật lí.
- Đã kiểm nội dung DOCX tự động; chưa nghiệm thu dàn trang Word/PDF thật của danh mục mới, chưa dùng Firestore/PostgreSQL thật.
- Không ghi dữ liệu thật của giáo viên; không commit/push/triển khai. Các thay đổi trước của phiên được giữ nguyên.
