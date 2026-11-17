# REVIEW-SCOPED-DRAFTS — G3 ứng viên lần 1

Ngày: 29/10/2026. Review độc lập, không sửa code. Kết luận: **REQUEST CHANGES** do blocker nhập liệu thật chưa lưu trạng thái cuối.

## Phạm vi và bằng chứng

Ứng viên: `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`. Nguồn workspace chỉ nhận báo cáo. Đối chiếu bốn tệp `public/app.js`, `public/core.js`, `tests/frontend.test.cjs`, `tests/exam_drafts.test.cjs` với nguồn trước sửa. Đã đọc QA-DRAFT-01. FE-DRAFT-01 chưa tồn tại ở source hoặc snapshot tại thời điểm review; không suy diễn nội dung bàn giao.

Chạy `node tests/frontend.test.cjs` tại snapshot: exit 0, bao gồm dòng PASS browser exam drafts. Tệp mới đã được require ở cuối frontend.test.cjs nên có chạy theo lệnh CI hiện hữu. Không chạy mạng hoặc DB thật. Kiểm Chromium dùng phần khởi tạo fixture của `/tmp/g3-draft-probe/probe-green.cjs`, route toàn bộ request vào assets/JSON tự soạn; không thay probe gốc, không ghi thêm tệp. Chromium chỉ mở sau lần gọi quyền mở rộng được auto-review chấp thuận.

## Findings

### [P1] Blocker: microtask ở capture listener lưu trước handler nhập liệu

Vị trí ứng viên: `public/app.js:81–82`; các oninput ở khoảng 1025–1032. Tái hiện bằng thao tác bàn phím thật: mở form với fixture, click `#exam-title`, gọi Playwright `pressSequentially('XYZ')`, rồi đọc memory/storage ngay sau nhập. Kết quả trực tiếp: `{"memory":"XYZ","saved":"XY"}`. Browser chạy microtask khi capture callback trả về, trước target oninput cập nhật examDraft. Hint vẫn khẳng định đã lưu. Reload lúc còn focus ô sẽ mất ký tự cuối; duration/seed/similarity cũng dùng cơ chế này. Các probe fill/select nhiều bước sau đó có thể được sự kiện kế tiếp hoặc render cứu lại, nên GREEN roundtrip trước không phủ tình huống này.

Cần bảo đảm save xảy ra sau mutation handler theo thứ tự sự kiện thật, và hồi quy nhập ký tự cuối → reload không blur/không sự kiện sửa tiếp. Không chỉ assert helper Node hoặc dispatchEvent trong evaluate vì thứ tự microtask có thể khác thao tác người dùng.

### [P2] Chưa bảo toàn YCCĐ của blueprint được nạp từ đề đã lưu

Vị trí: `public/core.js:67,75`. save và clean đều bỏ `outcomes`. Luồng hiện hữu `loadExamConfig()` sao chép ex.blueprint nguyên khối; `examSourcePayload()` chuyển blueprint đó vào API; planRows tạo các dòng có outcomes. Khi nạp cấu hình có blueprint chứa YCCĐ cụ thể, reload làm rơi bộ lọc này. Probe Node tự soạn một dòng B1/MC/Biết/count 10/points 1/outcomes [YCCĐ A], save rồi load trả dòng không còn outcomes. Đây là đổi đầu vào chọn câu dù server không đổi. QA-DRAFT-01 đã yêu cầu whitelist outcomes nếu luồng dùng. Cần whitelist mảng chuỗi outcomes và kiểm hồi quy nạp cấu hình → reload giữ tương đương payload.

### [P2] Chưa fail closed khi Django thiếu workspace identity

Vị trí: `public/app.js:64`; `public/core.js:55,71–79`. Workspace thiếu được chuyển thành chuỗi rỗng và vẫn load/save bình thường, không phân biệt Legacy Host và trang curriculum/authenticated. Hai phiên thiếu meta nhưng có cùng curriculum/subject/mode dùng đúng một key. Contract QA-DRAFT-01 yêu cầu không fallback kho dùng chung trên Django khi thiếu owner. Điều kiện trigger: meta workspace-scope bị thiếu hoặc rỗng trên trang Django; bản vá hiện không chặn restore. Đây là thiếu nhánh bảo vệ identity, chưa có bằng chứng rò giữa hai tài khoản được backend render đúng meta. Nên ngừng restore/save khi không xác định owner trên Django và dùng namespace Legacy rõ ràng.

## Những phần đã kiểm đạt và giới hạn

- Key có version namespace và phân biệt workspace/curriculum/môn/Test khi đầy đủ identity.
- Helper loại bank/questions/CSRF ở root và trường lạ blueprint; JSON lỗi/quota/storage throw được catch; Node kiểm đầy đủ các nhánh này.
- ID nguồn được kiểm grade/period/locked và lọc theo môn trước restore. Nguồn mất bị loại, nhưng chưa có thông báo nhẹ riêng về tham chiếu đã bỏ.
- save trước setTestMode, guard examDraftScopeKey, restore sau state xác nhận mode khắc phục vòng Test thường; QA độc lập đã báo GREEN hai chiều. Review này chưa kết luận đầy đủ về hai lần toggle chồng hoặc lỗi request giữa chuyển mode; cần tránh tuyên bố đã kiểm hết race.
- Không đổi server/API nghiệp vụ trong bốn tệp được review.
- Report này phản ánh ứng viên trước lần author sửa blocker nhập ký tự. Cần re-review bản sau sửa và rerun probe bàn phím thật.
