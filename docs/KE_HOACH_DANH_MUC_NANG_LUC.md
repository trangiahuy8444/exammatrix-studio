# Nạp danh mục thành phần năng lực và chỉ báo theo môn

Thiết kế được người dùng đồng ý ngày 19/11/2026: nạp Excel/CSV hoặc dán bảng Word/Excel; xem trước và kiểm lỗi; lưu theo môn; chọn năng lực cho YCCĐ và chỉ báo cho câu; phiên bản đã khóa giữ danh mục riêng.

## Cấu trúc và thay đổi

- Frontend không dùng bộ đóng gói. Thêm `competency-catalog.js` đọc/kiểm bảng và `competency-catalog-ui.js` phục vụ xem trước, lưu, áp dụng. `matrices.js` dùng danh mục trong lựa chọn, không cố định mã Tin học.
- `bank.json` chứa `competency_catalogs` theo môn và phiên bản; GET `/api/matrices/catalog`, POST `/api/matrices/catalog/save`. Triển khai cả bộ xử lý tĩnh và `MatrixService`/HTTP để Django và máy chủ cục bộ dùng chung.
- Ma trận lưu `competency_catalog` và `catalog_revision` tùy chọn cùng `indicator_catalog`. Băm tính các trường mới chỉ khi có; không đổi mã băm cũ chỉ vì cập nhật phần mềm. Gói trao đổi và bản xuất giữ thông tin đã chọn.
- Cầu lưu trình duyệt/Firestore giữ trường danh mục khi tải lại và đồng bộ.

## Thực hiện và rủi ro cần kiểm

1. Kiểm thử lỗi trước, thêm parser bảng: Unicode, dấu phân cách, ô có xuống dòng, thiếu/trùng mã, XLSX nhiều sheet/công thức/tệp lỗi. Chỉ nhận bảng có tiêu đề bốn cột và nội dung văn bản; không suy diễn mã chuẩn của môn.
2. Lưu theo môn, kiểm phiên bản tránh ghi đè cửa sổ khác; kiểm phía xử lý lại cả khi bỏ qua giao diện xem trước. Tệp tối đa 5 MB, 2000 dòng dữ liệu.
3. Áp dụng danh mục qua thao tác riêng vào nháp; không tự chuyển mã cũ, không sửa điểm/YCCĐ, không cập nhật ma trận khóa khi thư viện đổi. Dữ liệu cũ có mã cần đối chiếu vẫn hiển thị rõ.
4. Kiểm hồi quy Node/Python/Django và Chromium mở File bằng dữ liệu minh họa, kiểm tải lại/snapshot, cập nhật danh mục và lỗi nhập.

Đây là dữ liệu do giáo viên cung cấp; mẫu CSV chỉ minh họa định dạng. Không xem dữ liệu nhập là văn bản chuẩn đã thẩm định. Không push hay triển khai ở bước này.
