# G1-SHORTFALL-02 — Độ đầy đủ của báo cáo thiếu câu

Ngày 31/10/2026. Chỉ sửa bản sao cách ly, không đọc/ghi ngân hàng hoặc hồ sơ thật; chưa tích hợp vào repository nguồn.

## Lỗi và kết quả sửa

Báo cáo cũ chỉ xét ý đầu của một câu nhiều ý. Một câu Đ/S mà ý đầu có câu approved nhưng các ý sau thuộc bài/YCCĐ/mức khác vẫn có thể báo đủ. Ma trận rỗng vị trí cũng trả `ok=True`.

Bản sửa chỉ đếm câu nguyên vẹn ở vị trí có tất cả các ý cùng một ô (bài × YCCĐ × dạng × mức). Bốn ý cùng ô cần một câu ngân hàng, không phải bốn câu. Vị trí đa ô chưa thể chứng minh bằng metadata câu mẹ được đưa vào danh sách cần đối chiếu, giữ đủ mọi ý và điểm. Không giả định số thiếu cho phần này.

## Hợp đồng trả về

Giữ nguyên `matrix_id`, `ok`, `total_shortfall`, `cells` và các trường mỗi ô.

- `complete`: chỉ true khi không có vị trí chưa giải quyết hoặc vấn đề nguồn.
- `ok`: `complete` và tổng thiếu ở các ô đã xác định bằng 0.
- `issues`: danh sách `{code, message}` bằng tiếng Việt; các mã `no_slots`, `no_parts`, `requirement_unmapped`, `mixed_slot`, `source_unconfirmed`, `source_issues`.
- `unresolved_slots`: `{slot_id, kind, number, reason, parts}`; mỗi part giữ `{part_id, label, requirement_id, lesson_code, outcome, level, points}`. Không kèm câu hỏi/đáp án hoặc ID câu ngân hàng.

Khi có PPCT, chỉ số YCCĐ phải là số nguyên thực sự (không bool), trong nguồn đúng khối và có nội dung. Thiếu bài/YCCĐ/mức/dạng hợp lệ làm vị trí chưa giải quyết. Trường hợp gọi cũ không truyền PPCT vẫn chấp nhận nội dung YCCĐ tường minh của requirement. Ma trận received chưa xác nhận hoặc còn reconciliation issues không được báo đủ; các ô rõ vẫn được tính để thấy phần thiếu đã biết.

`total_shortfall=0` khi `complete=False` chỉ có nghĩa phần đã tính chưa ghi nhận thiếu, không chứng minh đủ câu. Giao diện cần dùng `complete` và liệt kê `issues`/`unresolved_slots`.

## Kiểm chứng

- RED: 12 test, 5 assertion failures và 9 errors (gồm các subtest), tái hiện `ok=True` sai và hợp đồng completeness chưa có. Log `/tmp/G1-SHORTFALL-02-red.log`.
- GREEN: 12/12 shortfall đạt. Log `/tmp/G1-SHORTFALL-02-green.log`.
- Hồi quy mục tiêu: shortfall, bốn mức, kiểm ô, C2 và MatrixService chạy 45/45 đạt. Log `/tmp/G1-SHORTFALL-02-targets.log`.
- Có kiểm dữ liệu đầu vào không đổi; ca Đ/S đa bài/YCCĐ/mức gồm Vận dụng cao; ca cùng ô giữ needed=1; ô rõ vẫn báo thiếu bên cạnh vị trí chưa xác định.
- Chưa chạy lại toàn engine/Django trong lượt này; điều phối giữ lần xác minh cuối sau khi giao diện và review đóng băng.

## Phạm vi và giới hạn

Chỉ hai tệp dưới đây được sửa. Không nới điều kiện approved; không tự chuyển mức, thay câu hoặc ánh xạ nguồn. Báo cáo mới không chứng nhận câu đa ô có đủ ý đúng từ metadata câu mẹ; việc kiểm/chọn từng ý vẫn cần đối chiếu riêng. Không thay luồng sinh đề hoặc cell_check trong đợt này.

SHA-256 bản đóng băng:

```json
{
  "domain/matrix_checks.py": "38a32dd571d63807f1e5b6dcb5a7adc81a92ad81bc8d0cbddb5167131531960d",
  "tests/test_shortfall.py": "3210c5edb5f3b205b380712260f2e6f539d9268980e9e481487ca4069b141bd4"
}
```
