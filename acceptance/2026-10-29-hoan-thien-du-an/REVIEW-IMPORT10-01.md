# Review mẫu ma trận 10/6 cột

Ngày 31/10/2026. Phạm vi: bản sao cách ly `bank-g0-vauvf713/ngan-hang-de-web`, `matrices/import_docx.py`, kiểm thử compact và tương tác mô hình bốn mức. Chỉ dùng dữ liệu tự tạo; không đọc ngân hàng hoặc hồ sơ thật.

**Kết luận: cần sửa một lỗi P2 trước tích hợp.**

## P2 — Không được bỏ số bài khác nhau khi ánh xạ PPCT

Tại `matrices/import_docx.py:168–171`, `_compact_exact_lesson` xóa số bài của cả tiêu đề nguồn và PPCT trước khi so sánh. Vì vậy một số bài tường minh khác nhau vẫn được xem là khớp chính xác. Trường hợp có tiêu đề chưa đánh số có thể cần đối chiếu theo tên, nhưng khi cả hai đã ghi số bài thì số khác nhau phải chặn ánh xạ.

Tái hiện bằng hàm fixture `compact` trong `tests/test_compact_matrix_import.py`:

- PPCT: grade 8, lesson_code `B1`, lesson_name_source `Bài 1. Bài học minh họa`, outcomes `Nhận diện thành phần.` và `Đề xuất phương án.`.
- Ma trận: title `Bài 2. Bài học minh họa`, MC Biết `1 (MC1; 0,25đ)`, ES Vận dụng cao `1 (ES1; 9,75đ)`, hai cột khác `0`, tổng câu `2`, điểm `10`, tỉ lệ `100`.
- Đặc tả: cùng title `Bài 2. Bài học minh họa`, lần lượt Biết/outcome thứ nhất/`1 câu`/`MC1` và Vận dụng cao/outcome thứ hai/`1 câu`/`ES1`.

Thực tế: lesson_code trở thành `B1`, tạo hai slots, danh sách issues chỉ có `compact_reconciliation_required`.

Kỳ vọng: giữ nguồn Bài 2, không tự gán B1, có issue **`source_mapping_ambiguous`**, slots rỗng, `reconciliation.confirmed == False`. Cần thêm ca hồi quy đồng thời giữ fixture Bài 1 khớp Bài 1 tiếp tục tạo hai slots.

## Các kiểm tra đạt

Lệnh `PYTHONPATH=.:tests /Users/huytran/.venvs/ngan-hang-de-web/bin/python -m unittest test_compact_matrix_import test_matrix_four_levels test_matrix_model -v` chạy **34 ca, tất cả đạt**, gồm 11 compact, mô hình bốn mức, dữ liệu khóa cũ và fixture Word 13 cột không đọc nhầm cột thứ tư. Không có ca bỏ qua trong lượt này.

Mã dùng `LEGACY_LEVELS` ba mức cho các vòng đọc 13/16 cột; gặp tiêu đề Vận dụng cao trong phần yêu cầu legacy báo lỗi rõ thay vì gộp thành Vận dụng. Compact nhận dạng tiêu đề độc lập; lưu bảng gốc và SHA-256; luôn draft/chưa xác nhận; dữ liệu mơ hồ không tạo slots. Fixture rõ ràng hiện tạo hai slots với tổng 10 điểm như yêu cầu. Chưa xác nhận các hồ sơ Word thật hoặc đường xử lý lưu/khóa của service trong lượt review này.

Một lệnh ban đầu gọi nhầm module `tests.test_matrices` không tồn tại đã lỗi ImportError; không tính lần đó là kiểm thử đạt. Lệnh đúng phía trên đã chạy lại đủ 34 ca.
