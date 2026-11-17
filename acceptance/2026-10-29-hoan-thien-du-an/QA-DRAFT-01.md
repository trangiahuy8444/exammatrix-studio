# QA-DRAFT-01 — G3: Mất cấu hình tạo đề khi tải lại

Ngày: 29/10/2026. Vai trò: kiem-thu-luong-giao-vien. Kết luận: **Đã tái hiện lỗi trên Chromium thật; chưa đạt tiêu chí lưu nháp.** Đây là bằng chứng RED trước sửa, không phải nghiệm thu bản sửa hoặc toàn bộ C1/C2.

## Môi trường và phạm vi

- Chạy assets nguyên bản từ snapshot `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web/public`.
- Playwright đã có trong bundled runtime; Chromium cache `chromium-1248` đã có. Không cài gói, không tải browser, không mở hồ sơ browser cá nhân.
- Trang giả `http://qa-draft.test/app/#exams`; mọi request được route vào assets/fixture trong tiến trình kiểm thử. Không chạy Django/Legacy Host, không dùng .env, không đọc DB hoặc ngân hàng thật, không seed/test-reset.
- Fixture tự soạn: môn Tin học; các khối 8/9/10; bài `QA01`; đề cương `qa-rev`; hai ma trận khóa `qa-m1/qa-m2` khối 9 CK1; hai template `qa-t1/qa-t2` khối 9 CK2; plan giả 10 câu MC, 30 câu khả dụng, không nội dung câu hay đáp án.
- Chromium bị SIGABRT khi khởi chạy trong môi trường hạn chế; chạy lại cùng lệnh với quyền thực thi mở rộng được auto-review cho phép. Browser mở được, `pageerror=[]` trên lượt cuối.
- Không sửa mã sản phẩm/tests; chỉ ghi báo cáo được giao. Bộ test tổng do điều phối chạy độc lập.

## Bằng chứng tái hiện

Probe bảo toàn: `/tmp/g3-draft-probe/probe.cjs`. Kết quả: `/tmp/g3-draft-probe/result.json`. Ảnh: `/tmp/g3-draft-probe/before.png`, `/tmp/g3-draft-probe/after.png`. Lệnh: `node /tmp/g3-draft-probe/probe.cjs` (cần quyền khởi chạy Chromium). Probe xác nhận **hành vi lỗi** bằng assert và exit 0; exit 0 này không có nghĩa tính năng đạt. Khi kiểm bản sửa cần sao chép probe và đổi assertion thành giữ nguyên nháp.

Các bước UI: mở Tạo đề → khối 9 → TX → chỉnh dòng ma trận, số câu đề cương, tên/thời gian/mã xáo trộn/đề cương/mức tương đồng/số đề → tải lại trang → đọc lại store và giá trị biểu mẫu. Chọn riêng nguồn ma trận/template ở hai lượt khác rồi tải lại. Không gán trực tiếp examDraft để tạo đầu vào; nhập bằng điều khiển UI.

| Trường | Trước tải lại | Sau tải lại | Kết quả |
| --- | --- | --- | --- |
| grade | 9 | 8 | Mất lựa chọn |
| exam_type | TX | GK1 | Mất lựa chọn |
| title | Bản nháp QA tự soạn | rỗng | Mất nội dung |
| duration | 70 | 45 | Mất nội dung |
| seed | QA-999 | 2026 | Mất nội dung |
| revision_id | qa-rev | rỗng | Mất nguồn đối chiếu |
| similarity_percent | 95 | 90 | Mất lựa chọn |
| similarity_mode | exact | min | Mất lựa chọn |
| blueprint | QA01 / MC / Biết / 8 × 1.25 | QA01 / MC / Biết / 10 × 1 | Mất phân bố tùy chỉnh |
| set_count | 4 | 2 | Mất lựa chọn |
| set_rev | qa-rev | auto | Mất lựa chọn |
| set_counts | QA01\|MC\|Biết: 23 | {} | Mất số câu tùy chỉnh |
| matrix_id (lượt CK1 riêng) | qa-m2 | rỗng | Mất ma trận nguồn |
| template_id (lượt CK2 riêng) | qa-t2 | rỗng | Mất mẫu nguồn |

Hai kiểm tra UI bổ sung:

1. Nhập tên “Nháp môn Tin QA”, đổi global subject Tin học → Vật lí: tên vẫn “Nháp môn Tin QA”, grade vẫn 9. **Rò trạng thái nháp giữa môn trong cùng trang đã tái hiện**, chưa phải rò giữa tài khoản.
2. Từ trạng thái đó bấm Chế độ Test, fixture trả `is_test_mode=true`: session flag = 1, grade bị reset về 8, tên vẫn “Nháp môn Tin QA”. **Nháp cũ trộn với mặc định mới giữa vùng dữ liệu đã tái hiện**.

Network quan sát: chỉ GET state, POST propose và asset/config giả; không request lưu draft. `localStorage` sau nhập chưa có nháp; `sessionStorage` chỉ có flag Test. Không xác minh thao tác tạo đề thật; API propose dùng fixture nên bằng chứng này chỉ xác nhận frontend.

## Nguyên nhân và ranh giới sửa tối thiểu

- `public/app.js:7`: examDraft khởi tạo trong bộ nhớ; không có đọc nháp từ storage.
- `public/app.js:62–73`: load(true) nạp state, ghi đè grade bằng khối đầu tiên rồi chooseExamTemplate(); state API không khôi phục form.
- `public/app.js:855`: chooseExamTemplate chọn nguồn đầu tiên và tái tạo blueprint. Restore quá sớm sẽ lại bị ghi đè tại đây.
- `public/app.js:1007–1020` và `1081–1099`: các handler/readExamInputs chỉ cập nhật object đang sống; set_count/set_rev/set_counts cũng thuộc examDraft.
- `public/app.js:1790`: setGlobalSubject thay môn và render, không tách examDraft.
- `public/app.js:1748–1752`: setTestMode đổi flag rồi load(true), không tách nháp.
- `public/core.js:5,55–70`: DocFormatter đã có storage prefix theo meta nhưng chỉ lưu HTML tài liệu đã mở, không phải form tạo đề. Không dùng chung payload/kho HTML để lưu form.

Chỉ cần lưu whitelist 14 trường examDraft ở bảng trên, có schema version và kiểm tra cấu trúc/giá trị khi đọc; giữ số liệu kiểu số, cắt bỏ trường lạ. Không serialize store, bank, câu hỏi, đáp án/rubric, context nguyên khối, API plan/cache, kết quả import hoặc dữ liệu người dùng khác. Dòng blueprint cần whitelist lesson_code/type/level/count/points_per_question và outcomes nếu luồng có dùng. Khi nguồn ma trận/template biến mất hoặc không còn phù hợp, bỏ tham chiếu không hợp lệ và thông báo nhẹ, không tự sinh đề từ nháp cũ.

Restore sau khi state/context/templates/matrices hợp lệ đã nạp và sau khi biết chế độ Test thực tế; tránh chooseExamTemplate()/default grade đè nháp. Save khi điều khiển thay đổi, loadExamConfig(), dùng đề cương từ tab khác, thêm/bỏ dòng, thay số câu từng ô; chuyển scope phải lưu scope cũ rồi đọc scope mới. Không chỉ dựa vào beforeunload.

## Scope bắt buộc và giới hạn bằng chứng

| Thành phần scope | Bằng chứng mã hiện hành | Yêu cầu hồi quy |
| --- | --- | --- |
| workspace/owner | `cloud/assessment/legacy_views.py:36–38` chèn meta workspace-scope = workspace UUID (+ curriculum UUID) | Hai tài khoản dùng cùng browser origin không thấy nháp nhau |
| curriculum | `cloud/assessment/context.py:9–15`: URL chọn khóa học, kiểm owned/archive; `legacy_views.py:38` và `public/app.js:10` | Cùng owner, hai curriculum cùng môn/khối vẫn có nháp riêng; legacy riêng |
| subject | Legacy có nhiều môn qua selectedSubject; course context khóa subject | Tin học/Vật lí không trộn; quay lại lấy đúng nháp cũ |
| test/official | `public/app.js:65`, `1748–1752` xác nhận flag từ state | Cùng owner/course/môn nhưng Test riêng vùng chính thức |
| schema | Hiện chưa có draft storage | JSON lỗi, dữ liệu cũ, storage bị chặn không làm chết trang |

Đề xuất key mới có namespace/version + workspace-scope + curriculum-id + subject + test/official. workspace-scope đã bao gồm curriculum trên Django nhưng giữ curriculum rõ ràng giúp kiểm tra contract và Legacy Host. Meta thiếu trên Legacy Host: dùng namespace local rõ ràng, **không** fallback một khóa chung trên trang Django xác thực nếu thiếu workspace-scope. Phải fail closed hoặc bỏ restore khi không biết owner. `exammatrix_active_subject` hiện là khóa chung origin; không dùng nó làm chứng cứ identity. Không đưa title/seed hoặc nội dung đề vào key.

Chưa chạy chuyển tài khoản hoặc curriculum bằng backend auth thật; yêu cầu cách ly trên là suy từ contract mã nguồn và phải được kiểm hồi quy. Chưa kiểm danh sách nguồn bị xóa trong một session đang mở, đa tab ghi đè hoặc JSON/storage lỗi. Các trường DOM chưa được commit thành examDraft (ví dụ set-total trước bấm Chia theo tỉ lệ) chưa kiểm; phạm vi tối thiểu ở trên chỉ khẳng định cấu hình examDraft đã commit qua UI, không tuyên bố mọi form ứng dụng đều lưu nháp.

## Tệp đề nghị sửa và bộ hồi quy

- `public/core.js`: helpers thuần cho key/validate/load/save whitelist; test Node với storage giả.
- `public/app.js`: vòng đời load/restore, chụp thay đổi, chuyển subject/Test, các entry point thay examDraft; không cần thay server API cho bản vá form cục bộ tối thiểu.
- `tests/frontend.test.cjs` hoặc một file Node chuyên biệt: whitelist/khóa scope/JSON lỗi/storage lỗi/id nguồn không hợp lệ.
- Probe UI mới độc lập: deepEqual các trường trước/sau reload; matrix/template source giữ đúng; vào/ra Test; đổi môn rồi quay lại; hai workspace và hai curriculum trong cùng browser context. Giữ snapshot JSON/ảnh trước và sau bản sửa, kiểm payload storage không có bank/questions/answers.

SHA-256 mã nguồn đối chiếu khi lập báo cáo:

- public/app.js: `a263baa05881e340698d008ca779eddb965c91cb6e94a0fd698bddecd8aa5b86`
- public/core.js: `614d9fccf632ac3e7e6c976cdbc7cf0d4458db844fe99254fba9a6a9ae3532d6`
- cloud/assessment/context.py: `ee3c38d18e83cd7c1d2d30c6d72473eae948c1792be5dbef5426c95bf5311513`
- cloud/assessment/legacy_views.py: `40f915011d032bdf251607742eaf1a0a09f6f8cee44cdc52c75c57cdf6ccdab8`

Bàn giao G3: lỗi tái hiện đủ để sửa tối thiểu; chưa xác nhận bản sửa, chưa đánh dấu hoàn thành mốc giáo viên.

## Kiểm ứng viên lần 1 (sau bàn giao RED)

Điều phối giao frontend sửa snapshot. Probe riêng `/tmp/g3-draft-probe/probe-green.cjs` đảo assertion sang bảo toàn nháp, không thay probe RED. Chạy trên ứng viên: deepEqual examDraft trước/sau reload đạt; giữ matrix_id/template_id đạt; đổi Tin học → Vật lí không hiện nháp Tin và quay lại Tin phục hồi tên đạt. **Chưa đạt vòng Test → chính thức:** vào Test tên nháp trống đúng, thoát Test tên chính thức vẫn rỗng thay vì “Nháp môn Tin QA” (AssertionError dòng 14, exit 1). Đã gửi frontend tái hiện. Chưa kết luận sửa xong; script chưa ghi result-green.json do dừng tại assertion, ảnh before-green/after-green chỉ chứng minh bước reload trước đó.


## Kiểm GREEN sau chờ đúng vòng đời UI

**Đính chính kiểm ứng viên lần 1:** `waitForLoadState('networkidle')` riêng lẻ có thể trả về trước khi event đổi Test chạy xong load/restore. Kết luận “Test → chính thức mất tên nháp” ở lượt đó chưa đủ bằng chứng về lỗi sản phẩm; không còn tái hiện khi chờ đúng tín hiệu kết thúc. Probe GREEN hiện chờ đồng thời nút Tải lại dữ liệu enabled, banner đúng mode và thông báo “Đã chuyển sang Chế độ Test” hoặc “Đã quay về”. Probe RED không thay.

Kết quả chạy mới với các assertion bảo toàn dữ liệu, exit 0:

- `changed=[]`: examDraft sau reload bằng toàn bộ object trước reload, kể cả blueprint và set_counts.
- `matrix_id`: qa-m2 → qa-m2; `template_id`: qa-t2 → qa-t2.
- Tin học → Vật lí: tên nháp trống đúng; quay lại Tin học phục hồi “Nháp môn Tin QA”.
- Vào Test: nháp chính thức không hiện. Nhập “Nháp Test QA riêng” rồi quay chính thức: phục hồi “Nháp môn Tin QA”. Vào Test lần nữa: phục hồi “Nháp Test QA riêng”.
- localStorage có các key riêng `bank_exam_draft_v1:["qa-owner-a","legacy","Tin học",false]`, cùng scope `true`, và môn Vật lí riêng. Payload quan sát là cấu hình nháp; fixture không chứa bank/answers trong payload này.
- `pageerror=[]`. Chỉ assets và API fixture, không DB/backend thật.

Bằng chứng mới: `/tmp/g3-draft-probe/probe-green.cjs`, `/tmp/g3-draft-probe/result-green.json`, `/tmp/g3-draft-probe/mode-debug-green.json`, `/tmp/g3-draft-probe/green-run.log`; ảnh `/tmp/g3-draft-probe/before-green.png`, `/tmp/g3-draft-probe/after-green.png`, `/tmp/g3-draft-probe/official-return-green.png`. Trong quá trình bổ sung debug có một lượt script ReferenceError do tham chiếu biến trước khai báo; đã sửa riêng script, lượt cuối exit 0. Không sửa sản phẩm.

Kết luận cập nhật: bản ứng viên **đạt các kịch bản UI fixture đã chạy** về reload, nguồn ma trận/template, đổi môn và vòng Test/chính thức. Vẫn chưa kiểm backend auth/chuyển owner hoặc curriculum thật; chưa nghiệm thu toàn bộ C1/C2 hoặc dữ liệu thật.
