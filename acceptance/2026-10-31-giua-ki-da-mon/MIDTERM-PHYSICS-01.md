# MIDTERM-PHYSICS-01 — Kiểm thử luồng giáo viên Vật lí GK1

Snapshot duy nhất: `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`.
Phạm vi ghi: chỉ `cloud/tests/test_midterm_physics_workflow.py` và báo cáo/log `/tmp/MIDTERM-PHYSICS-01.*`.
Dữ liệu: tự biên soạn, 1 PPCT minh họa/3 YCCĐ/3 câu (MC, SHORT, ES), Vật lí 10, GK1. Đây là phép thử chức năng đại diện; không chứng nhận phù hợp chương trình chính thức hay tỷ lệ sư phạm. Không dùng CK1/dữ liệu thật, không seed/install/reset/migrate CSDL thật/commit/network.

## Kết quả chạy

6 test, **4 PASS, 2 FAIL (RED giữ nguyên)**, 0 skip, 17.082 s. Log: `/tmp/MIDTERM-PHYSICS-01.log`.
Django tạo và hủy CSDL test `file:memorydb_default?mode=memory&cache=shared`; migrations trong log chỉ áp vào CSDL test bộ nhớ. `DATABASE_URL` được bỏ, `APP_ENV=development`, `CLOUD_DATA_DIR` là thư mục tạm mới.

Lệnh chạy từ snapshot:

```sh
TASK_DATA_DIR=$(mktemp -d /tmp/physics-midterm-data.XXXXXX)
env -u DATABASE_URL APP_ENV=development CLOUD_DATA_DIR="$TASK_DATA_DIR" /Users/huytran/.venvs/ngan-hang-de-web/bin/python cloud/manage.py test tests.test_midterm_physics_workflow --noinput -v 2
```

PASS:

- Trạng thái môn Vật lí 10 có đúng PPCT/câu hỏi riêng; chương trình Tin học và Toán cùng tài khoản vẫn trống.
- Câu nháp không được dùng tạo đề GK1 chính thức (400, không ghi đề).
- Ma trận GENERAL kiểm tra hợp lệ, khóa được; đề cương và đề từ ma trận tạo được. Hoán vị 101–104 giữ bộ câu, đáp án/nội dung theo `version_hash`, điểm 10 và tên môn; cả 4 bản HS xuất DOCX được. Đề/ma trận/đề cương Vật lí không thể tải bằng chương trình Tin/Toán (404).
- DOCX HS/GV giữ đơn vị m/s², N, kg·m/s²; Δv/Δt, α = 0°, vectơ Unicode F⃗ = ma⃗; giữ hai dòng số liệu `t (s) | 0 | 2` và `v (m/s) | 1 | 5`. Barem/chính sách đáp án chỉ trong bản GV. Tên VẬT LÍ đúng, không có TIN HỌC/TOÁN; đề không có media logo. Ma trận/đề cương xuất DOCX có tên môn đúng.

## Lỗi tái hiện: kiểm định bỏ sót dạng SHORT

**Mức ảnh hưởng:** ngăn đề/ bộ đề GK1 hợp lệ đi tiếp bước kiểm định/duyệt nếu có câu trả lời ngắn. Không riêng Vật lí.

Tối thiểu: ma trận GENERAL đã khóa gồm MC 2 điểm (Biết), SHORT 2 điểm (Hiểu), ES 6 điểm (Vận dụng), cả 3 câu đã duyệt và nằm trong đề cương. Tạo qua `POST /api/exams/from-matrix`, hoặc `POST /api/exams/generate-set` với `matrix_id`, sau đó `POST /api/exams/verify {id}`.

Thực tế: HTTP 200 nhưng `verification.passed=false`, `total_points=10`, `expected_points=8`, Hiểu `actual_items=0`, `type_checks` chỉ MC/ES. Đồng thời `verification.cells.ok=true`, đủ chính xác 3/3 câu trong đề cương và `revision_criterion.passed=true`.

Nguyên nhân theo mã hiện tại:

- `docx_exam_importer.py:713`: expected_types chỉ khởi tạo MC/YN/ES.
- `docx_exam_importer.py:788–802`: tách câu, actual_types và type_checks chỉ có MC/YN/ES.
- `docx_exam_importer.py:820`: tổng expected cộng từ tập loại thiếu SHORT nên thành 8.
- `docx_exam_importer.py:844–858`: tính actual_levels chỉ MC/YN/ES nên bỏ câu SHORT ở mức Hiểu.

Test RED: `cloud/tests/test_midterm_physics_workflow.py:129` và `:181`. Các test mong kết quả đúng là kiểm định PASS, không sửa kỳ vọng theo lỗi hiện tại. Chưa sửa mã sản phẩm.

## Giới hạn và phần còn chưa xác minh

- Đồ thị/sơ đồ dạng ảnh câu hỏi: chưa thấy schema/UI/API xuất media câu hỏi được hỗ trợ. `exports.py:537` chỉ add_picture cho banner, `exports.py:202–218` xử lý nội dung câu bằng văn bản nhiều dòng. Tìm `image/assets/media/content_blocks` trong BankService/domain/schema/UI không thấy cơ chế ảnh câu hỏi. Không gửi metadata tự nghĩ ra rồi kết luận mất ảnh; đây là khả năng chưa được chứng minh/hỗ trợ, không phải lỗi discard API đã công bố.
- Bảng dữ liệu ở đây là văn bản nhiều dòng phân tách `|`, không phải bảng Word có ô gộp/định dạng rich text.
- Công thức/vectơ là chuỗi Unicode trong XML DOCX; xác nhận không có OMML `oMath`. Không tuyên bố hỗ trợ phương trình Word gốc/LaTeX render.
- Kiểm tra DOCX theo cấu trúc ZIP/XML và chữ; chưa render bằng Word/PDF để đánh giá chữ vector ghép dấu, xuống trang, lề hoặc tràn ô khi in.
- Không kiểm định YN/biểu đồ, không đo độ đủ ngân hàng theo chương trình chính thức. Bộ đề dùng lại 3 câu vì fixture cố ý nhỏ (có cảnh báo dùng chung); chưa chứng minh các đề có bộ câu khác nhau.
- Do lỗi SHORT, chưa chứng minh giai đoạn kiểm định PASS hoặc duyệt/khóa/phát hành đề trong chuỗi GK1 này. Hoán vị/export vẫn chạy và được kiểm tra độc lập với test RED.
