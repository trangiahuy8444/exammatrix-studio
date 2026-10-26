# Biên bản nghiệm thu ExamMatrix Studio với PPCT Vật lí 10

Ngày thực hiện: 25/10/2026. **Kết luận: CHƯA ĐẠT để sử dụng chính thức trên bản Django nhiều tài khoản.**

Đây là nghiệm thu kỹ thuật trên dữ liệu mới, không phải xác nhận chuyên môn của giáo viên Vật lí. Không có thay đổi mã nguồn ứng dụng trong lượt này; các tệp mới chỉ thuộc thư mục nghiệm thu.

## 1. Dữ liệu và giới hạn

- Nguồn: `/Users/huytran/Downloads/PHU LUC 1 - VAT LI 10.docx`.
- SHA-256 trước và sau trích xuất: `3dd4e0aea320db0df1c3f52abe27d31a99c94ce6fad79e1ae741380164c8bf69`. Tệp nguồn không thay đổi.
- Trích 38 dòng chương trình chính khóa, tổng 70 tiết; 10 bài chuyên đề lựa chọn, tổng 35 tiết; giữ riêng 4 mốc kiểm tra. Bốn dòng chính khóa là ôn tập/kiểm tra, không coi cả 38 dòng là 38 bài lý thuyết.
- Nhập qua API 48 dòng bài/chuyên đề và 464 gạch đầu dòng YCCĐ, gồm cả kiến thức, năng lực, phẩm chất. Đây là phép ánh xạ phục vụ nghiệm thu; chưa phân loại sư phạm lại các gạch đầu dòng. Các cột năng lực số, mục tiêu AI, khung 3439 được giữ trong bản trích nguồn, chưa có trường chuyên biệt được nghiệm thu trên ứng dụng.
- Dùng Pandoc để giữ công thức Office Math dưới dạng LaTeX. Không chỉ dùng `python-docx.cell.text`, vì cách đó bỏ sót các đối tượng công thức.
- Nguồn có STT lệch/khuyết ở hai dòng Định luật III Newton và Trọng lực. Mã `VL01`–`VL38`, `CD01`–`CD10` là mã dòng thử, không phải số bài chính thức suy đoán lại.
- Tài liệu ký ngày 16/11/2025. Năm học 2026-2027 là cấu hình thử, không phải xác nhận nguồn được phê duyệt cho năm học này.
- Nguồn có số tiết mỗi bài nhưng không có lịch tuần/tiết chi tiết từng bài. Không xác nhận khả năng chặn nội dung sau mốc thi trên nguồn này. Không coi số tiết thời lượng là số thứ tự tiết đã học.
- Tự biên soạn 28 câu MC và 3 câu tự luận cho 12 dòng bài đầu, gắn YCCĐ nguyên văn được trích từ nguồn. Đề thử 45 phút, 7 điểm MC và 3 điểm tự luận theo tỷ lệ ghi trong nguồn. Phân bố nhận thức chỉ là fixture kỹ thuật, chưa có ma trận chuyên môn do giáo viên duyệt.
- Các câu được đặt trạng thái `content_checked` trong **tài khoản thử riêng** để kiểm tra tạo đề; không gắn nhãn đã được giáo viên phê duyệt. Việc khóa ma trận trong tài khoản thử chỉ để đi qua quy trình kỹ thuật.

## 2. Cách ly dữ liệu của lượt nghiệm thu

- Dùng Python 3.12.14 và phụ thuộc theo `cloud/requirements.lock`, trong môi trường `/private/tmp/exammatrix-vatly10-acceptance-20261025`.
- Cơ sở dữ liệu riêng tại `/private/tmp/exammatrix-vatly10-db-20261025`; không dùng chức năng Test của sản phẩm để cách ly, vì chức năng này có lỗi trên Django.
- Tạo tài khoản giáo viên thử và tài khoản thứ hai trong database riêng. Không nhập vào ngân hàng Tin học thật hay tài khoản đang làm việc.
- Máy chủ chỉ chạy tại `127.0.0.1:8893` trong lúc thử trình duyệt và đã dừng sau lượt thử.
- Không gọi Gemini, không dùng API Key thật hoặc phát sinh phí Gemini.

## 3. Các phần đã xác nhận hoạt động

| Kiểm tra | Kết quả |
|---|---|
| Bộ kiểm thử Django riêng | 60/60 đạt; 6,112 giây; xem `django_tests.log` |
| Bộ kiểm thử cục bộ trước bàn giao | 120/120 đạt; hai bộ JavaScript đạt trong lượt tiếp nhận trước |
| Nhập bài học, giữ tên bài và YCCĐ | Đạt qua API, 48 dòng và 464 YCCĐ |
| Lưu 31 câu với liên kết bài/YCCĐ | Đạt qua API |
| Tạo đề cương và ma trận 31 vị trí | Đạt qua API; ma trận kiểm tra hợp lệ, đủ 10 điểm |
| Tạo đề từ ma trận và đề cương | Đạt; 31/31 câu khớp đề cương, 7 điểm MC + 3 điểm ES |
| Chặn câu nháp | Đạt; đưa một câu về draft thì không thể tạo đề theo ma trận |
| Hoán vị 4 mã 101–104 | Giữ đúng nội dung phương án đúng, số câu và tổng điểm |
| ZIP Word/TeX | Có đủ 4 nhóm tài liệu và bản kê; không trùng tên file |
| Đề JSON dành cho học sinh | Không chứa trường đáp án, rubric, giải thích phương án |
| Phân quyền chương trình | Tài khoản khác truy cập chương trình thử nhận 404 |
| Trình duyệt sau khi chọn thủ công môn Vật lí | Xem/tìm câu, xem ma trận, xem mã đề và tải ZIP được |
| Render Word | 11/11 file chuyển PDF thành công bằng LibreOffice |
| Biên dịch XeLaTeX | 10/10 file ra PDF sau 2 lượt; **ra PDF không đồng nghĩa bố cục/nội dung đạt** |

Lượt kiểm tra API có 22/23 điều kiện đạt; điều kiện không đạt là tệp `curricula.js` trả 404. Trình duyệt có 6/11 điều kiện đạt. Các phép thử bổ sung bên dưới chỉ ra lỗi cách ly, ánh xạ và bố cục chưa nằm trong các bộ kiểm thử sẵn có.

## 4. Các lỗi chặn nghiệm thu

### P1 — Chế độ Test của Django ghi vào cùng ngân hàng chương trình

Gửi `/api/state` với `test_mode=1` và `X-Test-Mode: 1` vẫn nhận 31 câu của chương trình thường và `is_test_mode: false`. Lưu một câu nháp bằng yêu cầu Test khiến câu đó xuất hiện trong ngân hàng thường. Câu thăm dò đã được xóa sau kiểm tra, số câu trở về 31.

`/api/test/reset` trả HTTP 500 vì `DjangoHandler.server` không có `test_service`. Nguyên nhân: `_get_services()` chỉ tách khi có dịch vụ thử, còn lớp nối Django chưa cung cấp dịch vụ này và rơi về dịch vụ thường.

Ngoài ra, banner vàng “ĐANG Ở CHẾ ĐỘ TEST… KHÔNG ảnh hưởng dữ liệu thật” vẫn hiện khi `store.isTestMode` bằng false. Phần tử có `hidden` nhưng đồng thời có `style="display:flex"`, làm thông báo an toàn hiển thị sai.

**Yêu cầu sửa:** Tách kho Test thật sự theo tài khoản/chương trình, hoặc chặn rõ các yêu cầu Test trên Django khi chưa hỗ trợ; đồng bộ trạng thái từ máy chủ; sửa banner và thêm kiểm thử đọc/ghi/cách ly trên Django. Không chỉ sửa chữ thông báo.

Bằng chứng: `isolation_results.json`, `isolation_run.log`, `browser_results.json`, `screenshots/01_initial_course.png`. Mã liên quan: `server.py:92`, `server.py:187`, `cloud/assessment/legacy_views.py` (`DjangoHandler`), `public/index.html:41`.

### P1 — Hoán vị không cập nhật số câu trong ma trận/bảng đặc tả

Đáp án A–D theo nội dung vẫn đúng, nhưng hoán vị đổi `slot_number` trong khi giữ ma trận gốc và ánh xạ cũ. ZIP chỉ có một ma trận/bảng đặc tả theo số câu gốc.

| Mã đề | Số vị trí không còn khớp bài/YCCĐ/mức độ với ma trận đóng kèm |
|---|---:|
| 101 | 26 |
| 102 | 28 |
| 103 | 26 |
| 104 | 27 |

Ví dụ: câu MC số 1 của mã 101 là nội dung rơi tự do (`VL10`), trong khi bảng đặc tả số 1 trỏ vào “Làm quen với Vật lí học” (`VL01`). Đây là lỗi đánh số/đối chiếu, không phải đổi tổng số câu hay tổng điểm.

**Yêu cầu sửa:** Dựng ánh xạ số câu riêng cho từng mã và xuất bảng đặc tả/bảng đối chiếu tương ứng, hoặc ràng buộc phép trộn để giữ các vị trí theo YCCĐ khi dùng chung một bảng đặc tả. Kiểm tra lại `slot_id`, `reviewed_part_ids`, `matrix_snapshot` sau hoán vị.

Bằng chứng: `isolation_results.json` → `permutation_matrix_alignment`. Mã liên quan: `bank_service.py` → `create_permuted_exams()` và `export_exam_bundle()`.

### P1 — Ma trận LaTeX không thể hiện dữ liệu ma trận thật

Ma trận Word có các vị trí, số lượng và YCCĐ. Bản TeX/PDF cùng hồ sơ chỉ có tên 12 bài; các ô số lượng trống, bảng đặc tả thay YCCĐ bằng câu chung và các số 0.

Nguyên nhân: `generate_matrix_latex()` đọc các trường dựng sẵn như `mc_b`, `mc_spec`, `lessons[].outcomes`, còn ma trận ứng dụng lưu số liệu trong `slots` và `requirements`. Chưa có lớp chuyển đổi tương đương bộ xuất Word.

**Yêu cầu sửa:** Dùng cùng `matrix_view()` hoặc một mô hình xuất chung để tính tổng, refs và YCCĐ cho cả Word và LaTeX. Thêm kiểm thử nội dung, không chỉ kiểm tra chuỗi tiêu đề hay mã biên dịch thành công.

Bằng chứng: `exports/pdf_from_xelatex/Ma_tran_va_Bang_dac_ta.pdf`, `previews/pdf_from_xelatex_Ma_tran_va_Bang_dac_ta_ALL.png`; đối chiếu file Word/PDF cùng tên. Mã liên quan: `latex_generator.py:583`.

### P1 — PDF hướng dẫn chấm và đề cương bị tràn/cắt nội dung

- Cả 4 hướng dẫn chấm XeLaTeX có bảng tự luận tràn sang phải, ra ngoài trang; compiler báo `Overfull hbox` khoảng 324 pt.
- Bảng giới hạn kiến thức đề cương được dựng bằng `tabularx` không chia trang; trang 2 bị cắt ở phần bài 8, thiếu phần tiếp theo của bảng. Compiler báo `Overfull vbox` khoảng 466 pt.
- Phần đáp án tự luận trong đề cương cũng tràn ngang khoảng 202 pt.
- Ký tự chỉ số dưới Unicode `₀` bị thiếu trong font Times New Roman ở bản XeLaTeX. Cần chuẩn hóa ký hiệu sang công thức hoặc hỗ trợ font thích hợp.
- TeX còn gắn cứng tên trường Á Châu trong header/footer dù chương trình thử có `school_profile: false`, khác bản Word.

Đã render 21 PDF, tổng 83 trang, và xem ảnh tổng hợp toàn bộ trang của từng tài liệu, kiểm tra thêm trang đại diện. Không coi các file lỗi trong gói bằng chứng là hồ sơ đã sẵn sàng nộp.

**Yêu cầu sửa:** Bảng nhiều trang phải có cơ chế ngắt trang/lặp header; bố trí barem trong chiều rộng thực tế; bảo toàn ký hiệu; kiểm tra trực quan lại sau khi sửa.

Bằng chứng: `render_results.json`, `previews/pdf_from_xelatex_Dap_an_chi_tiet_Ma_101_ALL.png`, `previews/pdf_from_xelatex_De_cuong_on_tap_ALL.png` và log biên dịch trong `exports/_latex_build/`.

### P1 — Giao diện không dùng đúng chương trình Vật lí đã chọn

- Trình duyệt mới mở URL chương trình Vật lí 10 nhưng thanh môn vẫn là Tin học; tổng quan hiển thị 0 câu dù API có 31 câu.
- Mặc định khối 8 trong khi chương trình chỉ cho phép khối 10.
- Chọn thủ công Vật lí thì câu hỏi hiện, nhưng bộ lọc bài, PPCT và trường bài trong form soạn câu vẫn trống, kể cả sau khi chọn khối 10.
- Django trả 404 cho `/curricula.js` vì danh sách tài nguyên được phép phục vụ chưa thêm tệp này.
- `lessons()` lọc các bài thiếu `subject_name` thành Tin học, trong khi API của chương trình lưu bài theo phạm vi chương trình và không gắn trường đó vào từng bài. Với dữ liệu mẫu tĩnh, hàm còn ưu tiên mẫu hơn PPCT riêng.

**Yêu cầu sửa:** Dùng `context.subject_name` và `allowed_grades` của chương trình làm căn cứ; ưu tiên PPCT riêng của chương trình; phục vụ đúng tài nguyên; nghiệm thu tạo câu trực tiếp từ UI thay vì chỉ qua API.

Bằng chứng: `browser_results.json`, `screenshots/01_initial_course.png`, `03_question_editor.png`, `04_physics_curriculum.png`. Mã liên quan: `public/app.js:7`–`public/app.js:34`, `cloud/assessment/legacy_views.py` → `source_asset()`.

## 5. Các điểm cần cải thiện tiếp

- Bản Word một số mã tách riêng trang tiêu đề và ngắt khối câu hỏi tạo khoảng trắng lớn. Barem có thể bị tách sang trang kế tiếp. Chưa đạt chất lượng dàn trang để phát hành, dù không có từ nằm ngoài kích thước trang trong phép đo.
- Bảng đáp án tổng hợp Word rộng khoảng 17,586 cm trong trang có vùng nội dung 16,5 cm; cần căn lại theo vùng in thực tế.
- Không có nút nhập trực tiếp PPCT DOCX được nghiệm thu. Lượt này dùng công cụ trích xuất riêng rồi gọi các API lưu bài có sẵn; không tuyên bố sản phẩm đã hỗ trợ tự động đọc DOCX PPCT.
- Chưa thử Gemini thật, dạng Đúng/Sai/trả lời ngắn trong luồng môn Vật lí, PostgreSQL, khôi phục backup hay triển khai public. Các nội dung này nằm ngoài bằng chứng đạt của lượt này.

## 6. Trình tự sửa và nghiệm thu lại

1. Cách ly Test trên Django và sửa banner an toàn.
2. Đồng bộ môn/khối/PPCT theo chương trình trên UI.
3. Sửa ánh xạ số câu từng mã đề và dữ liệu ma trận LaTeX.
4. Sửa dàn trang Word/PDF và ký hiệu; xuất lại chính fixture này, đối chiếu nội dung hai định dạng.
5. Chạy lại 60 kiểm thử Django, các bộ cục bộ và toàn bộ phép thử trong thư mục nghiệm thu. Các lỗi vừa phát hiện cần thành kiểm thử hồi quy chính thức trước khi coi đã sửa.
6. Khi kỹ thuật đạt, gửi giáo viên Vật lí duyệt chuyên môn câu hỏi, phân bố nhận thức, mốc chương trình và mẫu hồ sơ.

## 7. Tệp bằng chứng

- `source_extracted.json`, `source_pandoc.json`: bản trích dữ liệu gốc; không phải bộ câu hỏi có sẵn trong nguồn.
- `curriculum_mapped.json`: mã dòng, tên bài, YCCĐ, số tiết và vị trí nguồn để kiểm tra lại.
- `questions_fixture.json`: 31 câu minh họa do Codex biên soạn phục vụ kiểm thử.
- `results.json`, `browser_results.json`, `isolation_results.json`, `render_results.json`: kết quả máy đọc được.
- `exports/`: 11 Word, 10 TeX, hai gói ZIP của ứng dụng, 21 PDF được kết xuất và log biên dịch.
- `screenshots/`, `previews/`: ảnh giao diện và bản xem mọi trang PDF.
- `build_acceptance.py`, `browser_acceptance.py`, `probe_isolation.py`, `render_acceptance.py`: công cụ tái hiện, chỉ dùng với database riêng như cấu hình trong tệp.

**Kết luận cuối:** Phần lõi đã thực hiện được nhiều thao tác, nhưng bộ dữ liệu Vật lí mới đã làm lộ các lỗi tích hợp và xuất hồ sơ quan trọng. Chưa khuyến nghị dùng bản Django này cho kỳ kiểm tra thật, và không nên dùng nút Test để bảo vệ dữ liệu thật cho đến khi sửa và kiểm chứng cách ly.
