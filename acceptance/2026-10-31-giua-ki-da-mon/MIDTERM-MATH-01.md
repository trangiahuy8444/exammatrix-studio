# MIDTERM-MATH-01 — Toán 10, Giữa kỳ I, dữ liệu tự soạn

Phạm vi cố định: snapshot `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`; chỉ thêm `cloud/tests/test_midterm_math_workflow.py`. Không sửa sản phẩm, không chạy seed/restore/migrate trên dữ liệu thực, không mạng, không CK1. Test runner tự dựng schema cho CSDL kiểm thử in-memory; không đọc hoặc thay CSDL thật.

Lệnh kiểm thử (từ snapshot):

```sh
env -u DATABASE_URL APP_ENV=development CLOUD_DATA_DIR=/tmp/midterm-math-01-data PYTHONDONTWRITEBYTECODE=1 /Users/huytran/.venvs/ngan-hang-de-web/bin/python cloud/manage.py test tests.test_midterm_math_workflow --noinput -v 2
```

Bằng chứng `/tmp/MIDTERM-MATH-01.log`: 6 tests, 13.912 giây; 4 PASS, 2 FAIL, 0 ERROR, 0 SKIP; exit 1. Test database `file:memorydb_default?mode=memory&cache=shared`, đã hủy sau lượt chạy. CLOUD_DATA_DIR là thư mục cách ly dưới /tmp.

## Fixture và luồng

Tài khoản giáo viên Toán tự tạo; workspace mới; chương trình Toán 10 2026-2027 và chương trình Toán 10 2025-2026 cùng tài khoản; thêm tài khoản khác để kiểm tra quyền. PPCT một bài M1, bốn YCCĐ tự soạn. Bốn câu MC/ES/YN/SHORT lưu draft → submit → approve với đủ CHECKLIST, kiểm đúng người duyệt. Ma trận GENERAL: MC 3đ, ES 3đ, YN 2đ (4 ý × 0,5), SHORT 2đ, tổng 10đ; lưu → review hợp lệ → khóa → đề cương chứa đủ 4 câu → đề GK1 từ ma trận.

| Kịch bản | Kết quả |
| --- | --- |
| Ma trận/đề 4 dạng đủ 10đ + đề cương 100% → verify | FAIL, lỗi verifier dưới đây |
| Unicode phân số/căn/mũ, hệ 2 dòng → bản học sinh DOCX | PASS bảo toàn text; tiêu đề Toán, không hardcode Tin học/Asian; không rò rubric/chính sách đáp án |
| Bản giáo viên DOCX | PASS: 4 tiêu chí chuẩn 0,25 → 4 ô barem 0,75, cộng 3đ; tiêu đề Toán đúng |
| Hoán vị 101/102/103/104 | API tạo đủ 4 bản; variant đầu giữ version_hash/10đ/GK1 nhưng verify FAIL; assertion dừng trước xuất variant đầu, các variant sau chưa được kiểm tra độc lập |
| Cách ly chương trình cùng khối + tài khoản | PASS: trạng thái trống ở chương trình khác; URL exam/matrix/revision khác chương trình 404; tài khoản khác 404 |
| Chuỗi LaTeX qua trường question hiện có → DOCX | PASS đo hiện trạng: nguyên chuỗi literal, 0 phần tử m:oMath; KHÔNG phải công thức render đạt |

## Lỗi RED giữ nguyên

`test_gk1_mixed_matrix_verifies_totals_and_coverage`: `cloud/tests/test_midterm_math_workflow.py:116`.
`test_four_permutations_preserve_questions_answers_and_point_totals`: cùng tệp dòng 159.

Tái hiện tối thiểu: chạy một test trên với fixture/luồng hiện hữu; API `/api/exams/from-matrix` thành công rồi `/api/exams/verify` trả 200 kèm `verification.passed=false` mặc dù `cells.ok=true`, tổng câu thực 10đ, đủ đề cương 100%.

Giá trị JSON thực tế: `total_points=10.0`, `expected_points=8.0`, `points_matched=false`; `type_checks` chỉ có MC/YN/ES, không SHORT; mức Biết `expected_items=7`, `actual_items=2`, `expected_points=10.0`, `actual_points=6.0`.

1. SHORT: `docx_exam_importer.py:715` khởi tạo expected_types chỉ MC/YN/ES; các đường actual/types và level cũng thiếu SHORT (khoảng dòng 784-858). Tổng expected tính từ expected_types dòng 820 bỏ 2đ SHORT. Kỳ vọng verifier tính đủ 4 dạng, gồm SHORT 1 câu/2đ/Biết.
2. YN: `matrices/generation.py:78-85` sao chép câu ngân hàng và gắn tổng điểm/các reviewed_part_ids, nhưng không materialize `level` và `points` vào từng statement theo part đã khóa. Verifier tại `docx_exam_importer.py:838-850` yêu cầu chính metadata đó; báo thiếu mức độ và tổng điểm các ý. Dữ liệu statement hợp lệ ngân hàng hiện chỉ có `{label: str, text: str, correct: bool}`; đầu ra exam cần metadata truy vết theo `statement_part_ids`/slot parts, hoặc verifier cần đọc từ snapshot ma trận, không suy giá trị tùy ý. Với fixture này mỗi ý có level Biết và 0,5đ, tổng 2đ, 4 item. Sau sửa kỳ vọng Biết tổng 7 item/10đ, total_expected=10đ; các bản hoán vị phải vẫn truy về đúng từng part khi xáo ý.

## Công thức — giới hạn được chứng minh

Trường nhập hiện có là chuỗi `question`, `options`, `rubric[].criterion`, `statements[].text`; không tạo định dạng mới cho test. Chuỗi `1/2 + √9 + 2³` và hệ dùng ngoặc Unicode/xuống dòng được giữ nguyên trong đề/DOCX. `exports.py:202-218` dùng add_run text từng dòng. LaTeX `$\frac{1}{2}+\sqrt{9}+2^{3}$` cũng được giữ literal, không có Word equation `m:oMath`. Kết quả này chứng minh bảo toàn chuỗi, không chứng minh phân số xếp tầng/căn co giãn/mũ dạng equation/hệ equation được render. Chưa chạy UI gõ liệu, nhánh xuất LaTeX, Word→PDF hoặc xem ảnh từng trang; chưa kết luận bố cục trực quan đạt.

Đã đóng băng tệp test sau lượt chạy trên để điều phối sửa và chạy hồi quy độc lập.
