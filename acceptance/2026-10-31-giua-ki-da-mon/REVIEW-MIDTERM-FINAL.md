# REVIEW-MIDTERM-FINAL

Ngày 31/10/2026. Rà soát độc lập, chỉ đọc sản phẩm, theo skill `code-review-skill` và các quy chuẩn workspace liên quan. Bản duy nhất được xem: `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`. Căn cứ diff `/tmp/MIDTERM-FINAL-REVIEW.diff` và manifest `/tmp/MIDTERM-FINAL-HASHES.json` (13 tệp); kiểm tra trực tiếp nguồn giao diện cuối và đối chiếu kết luận backend R2 không thay đổi.

**Tuân thủ đặc tả trong phạm vi diff: APPROVE.**

**Chất lượng mã và tích hợp trong phạm vi diff: APPROVE.**

Không còn phát hiện cần chặn bản sửa này. Hai phát hiện của `/tmp/REVIEW-MIDTERM-FE-01.md` đã được xử lý. Kết luận này duyệt mã và các kiểm tra nêu dưới; không thay thế nghiệm thu thao tác trình duyệt riêng hoặc phê duyệt triển khai.

## Những điều đã xác minh

1. **SHORT ở đủ bốn bản xem.** `public/app.js:341–396` có nhóm SHORT trong đề học sinh, đáp án, đề cương học sinh và đề cương giáo viên; dùng chung `shortQuestionHtml` và renderer an toàn. Số thứ tự theo `slot_number`, điểm theo `points/max_score`, số La Mã theo các phần thực sự hiện diện. Các tổ hợp chỉ một dạng, thiếu dạng và đủ bốn dạng đều không sinh tiêu đề `undefined` hoặc bỏ câu. Nội dung đáp án SHORT chỉ có ở hai bản giáo viên.
2. **Đề cương học sinh không dựng đáp án.** Toàn bộ phần C phụ thuộc `showAnswers`. Các giải thích MC, nhãn đúng/sai, đáp án SHORT, rubric và chính sách chấm ES không xuất hiện trong HTML học sinh; bản giáo viên vẫn có chúng. Đây là kiểm tra bản tài liệu hiển thị/xuất từ viewer của giáo viên; không suy rộng thành một thay đổi mới về quyền truy cập API.
3. **Khóa nguồn có chặn lệnh thực tế.** `public/core.js:237–454` xóa ô/khối hoạt động khi bấm vào nguồn được bảo vệ; chặn lệnh sửa cấu trúc, exec và định dạng khi con trỏ nằm trong nguồn hoặc vùng chọn giao nguồn. Thêm/xóa dòng và đổi cột còn kiểm tra trực tiếp ô hoạt động. Probe gọi handler thật xác nhận lệnh không tác động bảng bị khóa; các lệnh tương ứng trên bảng thường vẫn hoạt động. Các lớp bảo vệ bổ sung không dựa riêng vào thuộc tính `contenteditable`.
4. **Không làm phẳng nguồn khi lưu.** `syncEditedQuestionsFromSheet` giữ nguyên chuỗi rich source dựa cả vào marker lẫn phân tích nguồn gốc, kể cả bản HTML cũ thiếu marker. Probe xác nhận nguyên byte mã/bảng; câu văn thường và phương án MC vẫn cập nhật. Các builder không làm biến đổi record đầu vào.
5. **Cache v1 không ghi đè bản xem mới.** Chỉ tiền tố formatter chuyển thành `tin_doc_fmt_v2:`; key bản xem và scope được giữ nguyên. Đường `loadSaved/attach` không tải v1, v1 vẫn còn trong storage, v2 vẫn lưu/khôi phục được. Không có thao tác xóa hàng loạt khóa cũ. `examDraftKey`, CSRF, URL theo scope và mã xác thực không thay đổi trong diff. Đánh đổi đã ghi rõ: bố cục chỉ lưu tại v1 không tự xuất hiện trong bản v2.
6. **Bảng A đúng ba cột.** Cả trạng thái có bài và rỗng dùng `STT | Tên chủ đề | Tên bài`, ba cột định nghĩa và `colspan="3"`, phù hợp `rules/05_de_cuong_on_tap.md`. Không xóa YCCĐ khỏi dữ liệu nguồn.
7. **Cú pháp và escaping được giới hạn.** Code fence phải đóng, bảng pipe phải có phân cách và số cột đồng nhất. Cú pháp không đạt giữ nguyên văn. Chuỗi câu hỏi, mã và ô bảng được escape; không thêm diễn giải HTML/Markdown nội dòng tùy ý. Cấu trúc khối dùng div/article, không lồng pre/table vào p. Phần xuất Word/HTML dùng grammar tương ứng và giữ thụt dòng.
8. **Backend R2 giữ nguyên.** Hash `bank_service.py`, `docx_exam_importer.py`, `matrices/generation.py` và `exports.py` khớp bản đã rà soát. Hai vấn đề về tương thích đề hoán vị cũ và chứng cứ YCCĐ từng ý YN đã có kết luận APPROVE R2 trong `/tmp/REVIEW-MIDTERM-BACKEND-R2.md`; không có thay đổi backend sau đó để làm mất giá trị kết luận.

## Bằng chứng kiểm tra

Tự chạy trong lần rà soát này, đều exit 0:

- `node tests/question_text_frontend.test.cjs`: renderer/escape/fallback, builder thực tế, quyền riêng tư đáp án, handler toolbar thật, bảng A và đường khôi phục cache thực tế.
- Probe độc lập `/tmp/review_midterm_final_probe.cjs`: 16 tổ hợp dạng câu × 4 bản xem = **64 bản dựng**, kiểm tra đủ nội dung, thứ tự các phần, tách đáp án, record không bị sửa; thêm đối chiếu nguồn rich/nguồn thường, chỉnh phương án, key bản nháp và scope cache.
- Đối chiếu SHA-256 toàn bộ **13/13 tệp khớp** manifest cuối.

Log: `/tmp/REVIEW-MIDTERM-FINAL-targeted.log`. Hash: `/tmp/REVIEW-MIDTERM-FINAL.sha256`.

Đã đọc và sử dụng, không chạy trùng toàn bộ: `/tmp/FIX-MIDTERM-FE-FINAL-frontend.log`, `/tmp/FIX-MIDTERM-FE-FINAL-matrices.log`, `/tmp/midterm-final-r2/backend-results.json` (engine 428 chạy, 417 đạt và 11 skip theo báo cáo nhóm; Django 110 đạt; kiểm tra migrations đạt), cùng 19 test độc lập của review backend R2. Không sửa sản phẩm/test trong bản sao, không dữ liệu thật, cài gói, commit hay triển khai.

## Giới hạn nghiệm thu

QA trình duyệt dữ liệu giả được giao riêng; báo cáo này không tự nhận đã hoàn tất QA đó. Theo cập nhật của điều phối, bốn DOCX giả đã được dựng qua trình render phụ, mã/bảng đọc được; một trang cuối bản giáo viên chỉ chứa dấu kết thúc được ghi nhận DEFERRED, không có nội dung bị cắt. Đây là bằng chứng do điều phối cung cấp, không phải phép kiểm tra hình ảnh độc lập của reviewer này.

Không có tính năng OMML hoặc ảnh mới trong diff; các hạng mục đó vẫn ngoài phạm vi và chưa được nghiệm thu. Không mở rộng phạm vi thay đổi để xử lý chúng.

## SHA-256 chính xác đã duyệt

```text
32bef5830fc036796edd5a3a6fc9c6e7716610921d1fed58dd9d07be7ccd270f  bank_service.py
75cba8b2c63f5fb5ffc660b16dbc33b9c41288e7fb177425af227ed2e161b535  docx_exam_importer.py
08f506eb2455abea8fb6ccd091c1f0b026d02535b25468cdb80eb1b44d05e10c  matrices/generation.py
45b6130835ef42d385f5a81d8dafac55ff6d04fc37b4f980f5ee3ef5786a5e11  exports.py
6008a8a156f77ac7f557bc477c3daa956a4e1af3f6a087db60447fa4288bb9c8  public/core.js
e38b75dec0d6df3d0faa78abc729977edc08a4f3f61fd8fb5d28856acbca6fe4  public/app.js
c1218587ccf1d020701daf966e26f01731b19f16c71978c3f706d2d722e2f942  tests/test_midterm_mixed_verification.py
f0a6b13d2d1cc8f99ab5461f2158fab51ed7d1fe2761ee1e36754334883829d2  tests/test_question_text_blocks.py
f232b98ef790f919425c2e6f46f146b3fc43e8ef313f0bb6cdcda1392344f59c  tests/frontend.test.cjs
f54dda891f9bcab54853ba6cd5ace77c55fc51eaf11f1b2258d8e48cf1345466  tests/question_text_frontend.test.cjs
ad2341e21b39d24c98ac0f20c0bffe300078231997620d9091e41b1f0c1dfe39  cloud/tests/test_midterm_tin_workflow.py
4536f24436ab0d9c138984ba46f7997def922f6989d228b524de3d3a576484e9  cloud/tests/test_midterm_math_workflow.py
be49dd13ce1e4cf85e8a6f694e28b4806d6eae632eaa2fb345ed0766a2a31032  cloud/tests/test_midterm_physics_workflow.py
```
