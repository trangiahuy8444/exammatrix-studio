# FE-DRAFT-01 — Nháp biểu mẫu lập đề / bộ đề trên trình duyệt

Ngày: 2026-10-29. Vai trò: kỹ sư frontend G3. Phạm vi triển khai chỉ bản sao `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`; không sửa sản phẩm trong repo nguồn, không commit.

## Thay đổi

- `public/core.js`: helper lưu/khôi phục nháp theo whitelist, xác thực kiểu/range/enum, giới hạn số phần tử và độ dài, bắt lỗi JSON/storage.
- `public/app.js`: lưu các lựa chọn biểu mẫu bằng localStorage khi nhập/chọn và sau render; khôi phục sau khi API context/catalog đã tải nhưng trước render. Không ghi đè grade khôi phục. Scope gồm workspace-scope, curriculum, subject và test mode. sessionStorage hiện có chỉ giữ cờ test mode; đọc/ghi storage được bảo vệ khi trình duyệt chặn storage.
- `tests/exam_drafts.test.cjs`: roundtrip, cô lập bốn chiều scope, dữ liệu sai, ID mất hiệu lực, storage lỗi/quota/private. `tests/frontend.test.cjs` require test này để lệnh kiểm tra frontend sẵn có luôn chạy hồi quy.
- UI ghi rõ “Nháp biểu mẫu được lưu trên trình duyệt này”; nếu ghi thất bại sẽ báo không thể lưu trên trình duyệt. Không tuyên bố nháp đã lưu máy chủ.

Whitelist gồm grade, exam_type, title, duration, seed, revision_id, matrix_id, template_id, similarity_percent/mode, set_count/rev/counts và blueprint (chỉ lesson_code/type/level/count/points_per_question). Không ghi bank, nội dung câu hỏi, đáp án hoặc CSRF. Không thêm endpoint, package, framework, inline JavaScript hay thay CSP.

ID đề cương phải còn trong catalog đúng môn/ngữ cảnh và grade; ID ma trận phải còn tồn tại, locked, đúng grade/kì; template phải đúng grade/kì và không đồng thời chọn matrix. Bài học blueprint phải thuộc môn và grade hiện tại. Scope mới không có nháp dùng defaults, không mang title/ID từ scope trước. Khi đổi grade xóa lựa chọn đề cương/bộ đếm ô không còn phù hợp. Nguồn hiển thị cũng được lọc môn để không tự chọn lại nguồn môn trước.

## RED / GREEN và kiểm chứng

- RED hành vi trước sửa: QA Playwright fixture `/tmp/g3-draft-probe/probe.cjs`, `/tmp/g3-draft-probe/result.json`: reload mất lựa chọn biểu mẫu; đổi môn giữ title môn trước. Chi tiết QA-DRAFT-01.
- RED helper: chạy `node tests/exam_drafts.test.cjs` trước implementation thất bại vì `C.saveExamDraft` chưa tồn tại.
- GREEN: `node tests/frontend.test.cjs` (bao gồm test draft mới), `node tests/matrices_frontend.test.cjs`; `node --check public/app.js`, `node --check public/core.js` đều pass.
- Full Python: lượt giới hạn ban đầu 354 tests có 18 lỗi bind socket do quyền môi trường; chạy lại với quyền mở server cục bộ: **354 tests OK, 11 skipped**, log `/tmp/fe-draft-full-suite-escalated.log`. Không thay Python/backend.
- Browser GREEN: `/tmp/g3-draft-probe/probe-ready.cjs` exit 0, output `/tmp/g3-draft-probe/ready-output.json`: deepEqual toàn bộ examDraft trước/sau reload; giữ matrix_id/template_id; đổi môn ra default rồi quay lại phục hồi title; vào Test ra default rồi quay lại dữ liệu thật phục hồi title. `networkidle` riêng lẻ có thể trả về trước khi async load/render hoàn tất nên probe chờ thông báo UI hoàn thành đổi mode trước khi chụp/assert. Không thay sản phẩm để chữa false positive do chờ sai. Browser page errors: 0. QA độc lập sau đó cũng xác nhận `/tmp/g3-draft-probe/probe-green.cjs` exit 0, `result-green.json` có `changed=[]`, hai nháp title riêng official/Test phục hồi hai chiều; xem QA-DRAFT-01.

## Giới hạn

Nháp chỉ trên profile trình duyệt hiện tại, không đồng bộ thiết bị và mất nếu xóa dữ liệu trình duyệt. Khi localStorage bị chặn/đầy, biểu mẫu vẫn chạy trong bộ nhớ và UI báo không lưu được nháp. Khôi phục chỉ giữ tham chiếu còn hợp lệ theo catalog hiện tại. Đây là bản sửa nháp biểu mẫu, không xây wizard hay đổi logic lưu máy chủ.
