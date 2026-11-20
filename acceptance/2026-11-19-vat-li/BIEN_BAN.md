# Sửa lỗi khóa ma trận Vật lí THPT — 19/11/2026

## Nguyên nhân và phạm vi

Quy tắc chỉ báo THPT được áp dụng vô điều kiện cho mọi môn, trong khi ma trận Vật lí tạo từ bảng nhanh không khai danh mục chỉ báo. Do đó mỗi ý bị báo “Mã chỉ báo không thuộc thành phần năng lực”.

- `public/static-exam-engine.js` và `matrices/model.py`: giữ yêu cầu chỉ báo với Tin học THPT; môn khác được để trống khi không có danh mục. Nếu có danh mục hoặc mã được khai thì vẫn kiểm mã và năng lực của YCCĐ.
- `public/static-api.js`: trả chi tiết kiểm định khi khóa thất bại để giao diện hiện đầy đủ lỗi.
- `public/matrices.js`: giải thích điều kiện chỉ báo; lỗi có vị trí câu/ý và mã cần sửa.
- Không sửa ma trận đã lưu, không xóa bộ nhớ trình duyệt, không bỏ kiểm điểm/YCCĐ/PPCT. Không tự gán mã Tin học cho Vật lí.

## Kiểm chứng

- Tái hiện lỗi bằng kiểm thử thất bại trước sửa, sau sửa 4 kiểm thử Node và 3 kiểm thử Python mới đạt.
- Toàn bộ kiểm thử tĩnh Node: 57/57 đạt. Hai bộ kiểm thử giao diện hiện có đạt.
- Hồi quy Python: 433 kiểm thử, 432 đạt, 1 bỏ qua; Django SQLite: 110/110 đạt. `git diff --check` đạt.
- `kiem_thu_khoa_ma_tran.py`: Chromium mở `file://` trong profile riêng với dữ liệu minh họa; khóa được ma trận Vật lí THPT, tải lại vẫn khóa, điểm/YCCĐ giữ nguyên; mã sai vẫn bị chặn và hiện rõ câu/mã. Không có lỗi JavaScript chưa xử lý trong lần chạy đạt.
- Không thao tác dữ liệu thật của giáo viên. Chưa push/triển khai GitHub; đây là bản sửa cục bộ. Nghiệm thu ma trận thật còn chờ người dùng.

## Sử dụng

Tải lại trang bằng ⌘R, chọn Vật lí, mở ma trận đã lưu và bấm “Lưu & Chốt phiên bản này”. Không cần xóa dữ liệu hay nhập lại. Nếu còn lỗi, đọc từng dòng cụ thể; danh mục đã khai phải được liên kết đúng.
