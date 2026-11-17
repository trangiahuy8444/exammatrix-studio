# MIDTERM-TIN-01 — Kiểm thử luồng giáo viên GK1 Tin 9

Ngày: 31/10/2026. Phạm vi duy nhất: snapshot cách ly `bank-g0-vauvf713/ngan-hang-de-web`.

## Kết quả đã chạy

**9 kiểm thử: 7 đạt, 2 thất bại, 0 bỏ qua, 0 lỗi chạy.** Thời gian Django báo 29.957 giây. Log: `/tmp/MIDTERM-TIN-01.log`. File mới duy nhất do vai trò này ghi: `cloud/tests/test_midterm_tin_workflow.py` (242 dòng).

Không sửa sản phẩm, baseline, cấu hình hay dữ liệu thật. Không commit, cài đặt, mạng, triển khai. Chỉ chạy test file riêng; không chạy lại 403 engine / 89 Django baseline. DATABASE_URL bị loại khỏi môi trường con; APP_ENV=development; CLOUD_DATA_DIR là TemporaryDirectory riêng; Django xác nhận `file:memorydb_default?mode=memory&cache=shared`. Migration tự động của runner chỉ áp dụng lên DB test bộ nhớ; không migrate/seed/reset DB thật.

## Fixture và bằng chứng đạt

Tài khoản, workspace, subject Tin học, curriculum lớp 9 năm 2026–2027 và policy Asian School tự tạo. 2 bài PPCT / 2 YCCĐ; 8 câu tự soạn: 4 MC bảo vệ tài khoản và 4 tự luận mô phỏng thuật toán (mỗi câu có đủ 4 tiêu chí chấm). Mỗi câu đi qua draft → submit → approve với đủ checklist và ghi actor. Không đọc dữ liệu ngân hàng thật hay nguồn hồ sơ thật. Không thử nội dung cuối kì.

Ma trận authored THCS 4 vị trí: MC 2 câu × 2 điểm, tự luận 2 câu × 3 điểm, tổng 10 điểm; 2 YCCĐ, Biết/Vận dụng, NLa/NLc. Đã lưu → review hợp lệ → khóa có xác nhận.

7 test đạt:

1. `test_teacher_course_and_ppct_outcomes_start_empty`: ngân hàng mới rỗng, subject/grade đúng, PPCT/YCCĐ và 8 câu tồn tại, màn hình app có tab ma trận.
2. `test_complete_gk1_set_verification_lock_publish_and_docx`: tạo 2 đề GK1 khác câu từ ma trận đã khóa, đề cương 8 câu, mỗi đề 4 câu đủ approved và 10 điểm, verification cells/revision đều đạt, DOCX học sinh không chứa marker lời giải trong mọi XML, DOCX giáo viên có rubric. Phát đề cương trước khóa bị chặn 409; cả bộ submit → approve/locked → phát đề cương → publish thành công.
3. `test_manual_placements_preserve_selected_questions_and_parts`: lưu đề cương chọn 4 câu; chọn tay đủ vị trí và xác nhận từng ý; đúng bộ ID, đủ 10 điểm, cell verification đạt.
4. `test_approval_requires_checklist_and_edit_invalidates_approval`: sửa câu approved thành needs_review; submit lại; duyệt với checklist rỗng bị 400 và trạng thái còn pending_review.
5. `test_insufficient_approved_cell_does_not_write_exam_or_revision`: sửa toàn bộ câu ở YCCĐ B2 làm mất approved; sinh bộ bị 400 nêu B2; không ghi dở đề/đề cương.
6. `test_locked_exam_snapshot_survives_bank_edit`: khóa cả bộ; sửa ngân hàng; hash và snapshot câu của đề khóa giữ nguyên; xuất DOCX được.
7. `test_reject_other_grade_in_tin_nine`: PPCT lớp 10 vào curriculum lớp 9 bị 400 và không ghi bài.

## Hai lỗi tái hiện, không hạ yêu cầu để xanh

### P1 — Bộ đề sinh theo ma trận không tạo được mã hoán vị

Test `test_permutations_keep_content_answers_and_matrix_cells`, dòng 173–187; failure tại dòng 176.

Tái hiện tối thiểu qua helper có trong test:

1. `generate_set()` tạo 8 câu hợp lệ, ma trận khóa 2MC+2ES và bộ 2 đề GK1, tất cả verification / xuất DOCX đạt ở test trọn luồng.
2. POST `/api/exams/permute?curriculum=<id>` với `id=exams[0].id`, `codes=['101','102','103','104']`, `shuffle_questions=true`, `shuffle_options=true`, `seed='TIN-PERM'`.
3. Mong đợi 200 với 4 mã đề giữ đúng câu/đáp án và ma trận. Thực tế **400**: `Thiếu ánh xạ vị trí nguồn để xuất bảng đặc tả của mã đề này.`

Điểm phát lỗi: `bank_service.py:1941`, trong `_exam_matrix`; chuỗi gọi `create_permuted_exams` ở `bank_service.py:1792`. Gốc dữ liệu: `generate_exam` snapshot câu tại `bank_service.py:1077` có điểm/content hash nhưng không đặt slot_number/slot_id. `create_permuted_exams` chỉ suy slot_id từ slot_number hiện có tại `bank_service.py:1718–1723`; câu của generate-set không có ánh xạ đó trước xáo trộn. Đây là khác biệt thực tế giữa chọn tay từ ma trận (có slot_id) và sinh tự động/bộ đề. Các kiểm tra content hash, mapping, verification và DOCX của 4 mã bị chặn ngay tại API nên chưa có bằng chứng đạt.

### P1 — DOCX làm mất thụt dòng mã Python, đổi nghĩa nhiệm vụ Tin

Test `test_rich_code_is_preserved_and_markdown_table_becomes_word_table`, failure tại `cloud/tests/test_midterm_tin_workflow.py:237`.

Tái hiện: lưu câu tự luận bằng textarea plain text có:

```
s = 0
for i in range(1, 4):
    s += i
print(s)
```

Duyệt → đưa vào đề → GET `/api/exams/<id>/export?format=docx&answers=0`. Văn bản Word có `s += i` sát lề, mất 4 khoảng trắng. Không yêu cầu fenced Markdown hoặc cú pháp mới để tái hiện. XML text không còn chuỗi `    s += i`.

Nguyên nhân tại `exports.py:218`: `p.add_run(line.strip())` loại khoảng trắng đầu mỗi dòng. `exports.py:207` cũng strip dòng đầu. Đây là lỗi bảo toàn nội dung có ý nghĩa, không chỉ phông chữ.

## Giới hạn và khoảng trống

- Câu chứa bảng pipe Markdown được lưu/xuất nguyên các dấu `|`; chưa có native Word table từ câu. Đây là **khoảng trống năng lực** vì UI cũ không tuyên bố parser Markdown, không gọi đây là regression. Assertion native table trong test rich nằm sau assertion code đang fail nên chưa chạy tới; không tính là lỗi thứ ba độc lập.
- Không dùng fenced code trong fixture cuối cùng. Assertion không có ```python không có giá trị xác nhận parser fences.
- Không tìm thấy đường authoring nhúng hình trong schema câu; không tự bịa định dạng asset. Chưa kiểm tra đề có hình. Không chạm logo/hình sản phẩm.
- MC/ES là hai dạng được policy THCS hiện tại cho phép (`domain/profiles.py:11`); không giả định test này chứng nhận YN/SHORT. Chưa chạy lớp 8/10 hoặc môn Toán/Vật lí.
- Kiểm tra DOCX dựa trên XML và khả năng mở ZIP, chưa render Word/PDF hay xác nhận trực quan giáo viên.
- Không đo coverage phần trăm công cụ; báo cáo này liệt kê đường nghiệp vụ đã thực thi, không suy từ một câu đơn lẻ.

Đã đóng băng: không có thay đổi sản phẩm, chỉ test và biên bản/log được giao.
