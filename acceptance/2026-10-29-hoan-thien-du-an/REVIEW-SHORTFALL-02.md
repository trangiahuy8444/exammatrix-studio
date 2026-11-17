# Review G1-SHORTFALL-02

Ngày 31/10/2026. Rà soát độc lập, chỉ đọc bản sao cách ly; không dùng dữ liệu thật, không sửa sản phẩm.

**Kết luận: không phát hiện lỗi chặn trong phạm vi thay đổi.**

- Vị trí có nhiều ý khác bài/YCCĐ/mức được đưa vào `unresolved_slots`; giữ đủ mọi ý, nhãn, mức, điểm và yêu cầu. Không còn lấy riêng ý đầu để báo đủ.
- Bốn ý cùng ô vẫn cần một câu nguyên vẹn, không bị tính thành bốn câu. Tổng thiếu chỉ tính các ô đã xác định.
- Ma trận rỗng, thiếu phần/yêu cầu, ánh xạ PPCT không hợp lệ, hoặc bản nhận chưa xác nhận/còn issue trả `complete=false` và `ok=false`.
- UI ưu tiên trạng thái chưa đủ căn cứ kể cả đầu vào có `ok=true` nhưng `complete=false`; không hiển thị kết luận đủ hoặc thiếu 0 câu. Bảng riêng liệt kê cả bốn tham chiếu a–d; các trường metadata, cảnh báo và lý do được escape HTML. Liên kết duyệt vẫn dùng chỉ số của `cells` đã xác định.
- Hàm không ghi hoặc sửa dữ liệu đầu vào. Các giá trị trước đó ở báo cáo ô thông thường giữ nguyên.

## Kiểm chứng

`PYTHONPATH=tests python -m unittest test_shortfall test_matrix_four_levels test_matrix_checks test_c2_scenarios test_matrix_service -v`: 45 ca đạt. `node tests/matrices_frontend.test.cjs`: đạt, gồm ca dữ liệu không đủ và chuỗi HTML nguy hiểm. Log Python `/tmp/review-shortfall-tests.log`.

## Giới hạn

Rà soát này không xác nhận từng ô CK1 thật hoặc chứng minh đủ ngân hàng. Câu nhiều ý khác ô vẫn cần đối chiếu riêng; bản sửa trình bày phần chưa thể kết luận, chưa tự suy diễn nội dung/điểm từng ý từ câu mẹ. Không kiểm PDF, không chạy toàn bộ suite hoặc trình duyệt thật trong lượt review này. Bộ khung cũ `cell_check` và chọn câu tự động không nằm trong phạm vi sửa; không suy kết quả của báo cáo thiếu câu thành chứng nhận khóa/phát hành đề.

## Hash bản rà soát

```json
{
  "domain/matrix_checks.py": "38a32dd571d63807f1e5b6dcb5a7adc81a92ad81bc8d0cbddb5167131531960d",
  "tests/test_shortfall.py": "3210c5edb5f3b205b380712260f2e6f539d9268980e9e481487ca4069b141bd4",
  "public/matrices.js": "1c9a0f1628fb55b2c67eee89cd368ab6a5b0dee1426f29a09d0edf0048e17ae2",
  "tests/matrices_frontend.test.cjs": "742654a0aa38b559a69bbd1ff435720e3304832d607f2bfc23a53d3cdb038465"
}
```
