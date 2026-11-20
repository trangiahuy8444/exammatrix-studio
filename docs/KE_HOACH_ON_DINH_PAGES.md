# Ổn định luồng ra đề trên Pages — 19/11/2026

Người dùng đã yêu cầu thực hiện đề nghị kiểm tra/sửa trọn luồng ma trận → đề cương → tạo đề → duyệt → xuất hồ sơ. Mục tiêu: giáo viên tiết kiệm thời gian và không bị phần mềm báo đạt sai. Phạm vi là mã nguồn của bản Pages đang dùng; kiểm bằng dữ liệu minh họa. Không tự sửa dữ liệu thật hoặc triển khai lên URL công khai.

## Lỗi đã đọc được trong mã nền
- Cầu nối nhận cả localhost là host tĩnh, có thể bỏ qua Python/Django.
- Ma trận trống vẫn được coi hợp lệ; thiếu câu trả đủ mặc định, ứng viên không lọc đúng ô/trạng thái duyệt.
- Sinh đề chỉ lưu payload; lưu đề cương từ ID không tạo snapshot câu.
- Route chưa hỗ trợ trả thành công; nhập đề tự ghi kiểm định đạt; duyệt/phát hành chưa được thực thi.
- Ghi localStorage và Firestore nuốt lỗi, không phân biệt lưu trên máy và đồng bộ.
- Liên kết API tải hồ sơ không tồn tại trên Pages. Bản Word trình bày HTML `.doc` hiện có không thay tệp DOCX chuẩn.

## Thứ tự và phân công tệp
1. `public/static-exam-engine.js`, `tests/static_exam_engine.test.cjs`: kiểm ma trận, ứng viên, thiếu câu, kế hoạch đề cương, sinh đề/snapshot và đối chiếu thật. Worker sinh đề sở hữu hai tệp này.
2. `public/static-exam-workflow.js`, `tests/static_exam_workflow.test.cjs`: duyệt câu, hash SHA-256, chuyển trạng thái đề/đề cương và khóa bất biến. Worker vòng đời sở hữu hai tệp này.
3. `public/static-exam-export.js`, `tests/static_exam_export.test.cjs`: DOCX thật và ZIP không phụ thuộc CDN; kiểm layout và bảo mật đáp án. Worker xuất bản sở hữu hai tệp này.
4. Điều phối sửa `public/firebase-bridge.js`, thêm `public/static-api.js`, sửa `server.py`/`public/index.html` để định tuyến đúng môi trường; thực thi giao dịch trên bản sao và chỉ commit sau lưu thành công. Nối các module vào `public/app.js`, bảo vệ thao tác còn thiếu, xử lý tải hồ sơ và báo đồng bộ.
5. `tests/static_api.test.cjs`, `tests/static_bridge.test.cjs`, kịch bản Chromium: ma trận trống, thiếu câu approved, sửa câu đã duyệt, đề cương đúng snapshot, sinh thật, gửi/duyệt/khóa/phát hành, tệp Word/ZIP không lộ đáp án. Nối test vào CI hiện có, chạy hồi quy Python/Django/Node.

## Hợp đồng
Engine nhận dữ liệu `{bank:{questions,ppct},matrices,revisions,exams}` và payload; không ghi trực tiếp. Workflow trả bản sao sau kiểm tra; hash không phụ thuộc trường quản trị. API tĩnh làm việc trên bản sao toàn bộ workspace, trả lỗi rõ và không commit khi một bước thất bại. Báo cáo so sánh đề đã làm được giữ nguyên.

## Rủi ro và giới hạn cần báo chính xác
- Hai lõi Python/JS có thể lệch; kiểm fixture định lượng và các bất biến, không khẳng định tương đương toàn bộ API.
- Câu nhiều ý, công thức/hình và quy cách bản xuất: chỉ cho qua phạm vi đã có đối chiếu; thiếu hỗ trợ phải báo lỗi cụ thể.
- Pages chạy trên máy người dùng; kiểm tra JavaScript không thay quyền tin cậy của máy chủ hoặc Firestore Rules. Không coi bản local là hệ thống tổ trưởng phê duyệt độc lập.
- Cloud đồng bộ lỗi phải hiển thị đang lưu cục bộ/chờ đồng bộ; bộ nhớ đầy phải báo chưa lưu và giữ bản trước.
- PDF đúng quy trình của trường cần Word cục bộ. Không đổi tên HTML thành DOCX hoặc coi in trình duyệt là PDF đã nghiệm thu.
- Chưa triển khai, chưa kiểm Firestore thật và không tự đánh dấu nghiệm thu giáo viên. Kết quả cuối ghi trong biên bản riêng.

## Thực thi
Đã tích hợp năm module riêng (engine, workflow, export, API, download), sáu tệp test Pages, kiểm trình duyệt và cổng CI. Kiểm thực tế còn tìm thấy lỗi khối mặc định, số điểm ma trận tùy biến, dữ liệu cache theo tài khoản và thang rubric; đã có kiểm hồi quy. Bằng chứng, tệp thay đổi và phần chưa hỗ trợ: `../acceptance/2026-11-19-pages/BIEN_BAN.md`. Chưa triển khai hay nghiệm thu toàn bộ web.
