# FIX-MIDTERM-FE-FINAL — đóng băng giao diện bản sao

**Trạng thái:** Hoàn tất hai lỗi còn lại; `public/` đã đóng băng để QA Chromium trên dữ liệu giả. Bản sao duy nhất: `/private/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`.

## Sửa đổi

1. Đổi riêng tiền tố lưu HTML định dạng của `DocFormatter` từ `tin_doc_fmt_v1:` sang `tin_doc_fmt_v2:` trong `public/core.js`. Các khóa xem thực tế giữ nguyên dạng `exam:<id>:student|answers|verify` và `revision:<id>:0|1`, vẫn gắn phạm vi workspace. Bản HTML v1 cũ được giữ nguyên trong localStorage để khôi phục thủ công; bản xem hiện hành không tự nạp lại HTML cũ có thể thiếu SHORT hoặc chứa phần đáp án trong bản đề cương học sinh. Chi phí: các chỉnh sửa trình bày chỉ lưu cục bộ ở v1 không tự xuất hiện trong bản xem v2. Nguồn câu hỏi, bản nháp đề (`examDraftKey`), ngân hàng câu hỏi và phạm vi xác thực không đổi.
2. Bảng A của bản xem đề cương trong `public/app.js` còn đúng ba cột `STT | Tên chủ đề | Tên bài`, gồm ba phần tử `col`, ba ô dữ liệu mỗi hàng và `colspan="3"` khi rỗng. Không hiển thị cột Mục tiêu bài học. YCCĐ vẫn thuộc dữ liệu ngân hàng/ma trận, không bị sửa. Phù hợp `rules/05_de_cuong_on_tap.md` và định dạng DOCX hiện có.
3. Sau QA Chromium, dòng tóm tắt của bản xem đề cương được bổ sung số câu `Trả lời ngắn` khi có SHORT. Với bộ giả bốn dạng, dòng này hiện ghi `4 câu (1 trắc nghiệm NLC, 1 câu Đúng/Sai, 1 câu Trả lời ngắn, 1 tự luận)`.

## Kiểm tra

- Đã quan sát RED trước sửa: tiền tố còn v1; bản xem đề cương tạo bốn tiêu đề, gồm `Mục tiêu bài học`.
- `/tmp/FIX-MIDTERM-FE-FINAL-header-red.log`: RED cho dòng tóm tắt đề cương thiếu SHORT trước sửa cuối.
- `/tmp/FIX-MIDTERM-FE-FINAL-frontend.log`: `node tests/frontend.test.cjs`, exit 0. Bao gồm builder thực tế với MC/YN/SHORT/ES ở cả bốn bản xem, điểm/thứ tự/đánh số SHORT, đáp án chỉ trên bản giáo viên, bảo vệ nguồn câu hỏi rich, lệnh thêm/xóa dòng và các lệnh định dạng trên bảng được khóa, cùng khả năng sửa bảng thường. Kiểm tra mới bao gồm bảng A ba cột cả khi có bài và khi trống, khóa bản xem thực tế, bỏ qua HTML v1 và khôi phục HTML v2.
- `/tmp/FIX-MIDTERM-FE-FINAL-matrices.log`: `node tests/matrices_frontend.test.cjs`, exit 0.
- `/tmp/FIX-MIDTERM-FE-FINAL-app-syntax.log` và `/tmp/FIX-MIDTERM-FE-FINAL-core-syntax.log`: `node --check`, đều exit 0.
- `/tmp/FIX-MIDTERM-FE-FINAL.sha256`: SHA-256 của cả bốn tệp thuộc phạm vi chỉnh sửa.

## SHA-256

```text
ea1f0a3b22e1c714ad096296e50684070d18f8247127289d220faded9c55d5ca  public/app.js
6008a8a156f77ac7f557bc477c3daa956a4e1af3f6a087db60447fa4288bb9c8  public/core.js
f232b98ef790f919425c2e6f46f146b3fc43e8ef313f0bb6cdcda1392344f59c  tests/frontend.test.cjs
c51921be5a8b54ad3afbfc5d352f1a294d06b2a4912983f5829571032b5dd6f0  tests/question_text_frontend.test.cjs
```

Chỉ chỉnh sửa bốn tệp được giao. Không dùng dữ liệu thật, không chỉnh CK1, backend, commit, gói cài đặt hay mạng. QA trình duyệt được giao riêng sau khi đóng băng.
