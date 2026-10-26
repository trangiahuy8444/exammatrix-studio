# Kết quả sửa lỗi và nghiệm thu lại Vật lí 10

Hoàn tất rà soát và đóng gói: 26/10/2026. **Các lỗi đã xác nhận trong lượt nghiệm thu Vật lí 10 đã được sửa và kiểm chứng lại.** Bản nghiệm thu lỗi ban đầu được giữ nguyên ở thư mục `../2026-10-25-vat-li-10/` để đối chiếu.

## Kết quả từng hạng mục

| Lỗi trước sửa | Thay đổi | Bằng chứng sau sửa |
|---|---|---|
| Test của Django dùng chung ngân hàng thường | Mỗi tài khoản/chương trình có trạng thái Test riêng trong database; reset chỉ xóa tài liệu và nguồn của kho Test; yêu cầu Test chưa được thiết lập không được rơi về kho thường | `isolation_results.json`: kho Test 0 câu, kho thường 31 câu; thêm câu thử không xuất hiện trong kho thường; reset HTTP 200; trở về ngân hàng thường vẫn đủ 31 câu |
| Banner Test hiện sai trạng thái | Quy tắc CSS `hidden` được ưu tiên; trạng thái Test được đồng bộ từ máy chủ | Kiểm thử trình duyệt: banner ẩn khi làm việc thường, hiện khi vào Test, ẩn khi thoát Test |
| Mở Vật lí 10 nhưng hiện Tin học/khối 8 | Môn và khối lấy từ chương trình hiện tại; ưu tiên PPCT riêng thay cho mẫu; phục vụ đúng `curricula.js`; backend gắn môn vào câu mới theo chương trình | 15/15 kiểm tra trình duyệt đạt, bao gồm chọn bài/YCCĐ và lưu câu hỏi trực tiếp từ form |
| Bảng đặc tả sai số câu sau hoán vị | Cập nhật số câu trên bản sao ma trận của từng mã đề; ZIP xuất riêng bảng đặc tả mã 101–104; khi xuất hồ sơ cũ cũng dựng lại ánh xạ, không sửa ma trận nguồn | Cả 4 mã đều có **0 vị trí lệch** bài/YCCĐ/mức độ; hồi quy giữ nguyên đề gốc và ma trận nguồn |
| Ý Đúng/Sai có thể không đi cùng chỉ báo khi đảo ý | Dùng mã ý ổn định để đưa thứ tự/nhãn ý ma trận theo thứ tự phát biểu sau trộn | Kiểm thử hồi quy đối chiếu từng phát biểu với YCCĐ tương ứng, gồm xuất lại nhiều lần |
| Ma trận LaTeX trống số liệu/YCCĐ | Dùng `matrix_view()` từ hồ sơ canonical như Word; giữ cả YCCĐ chưa phân bổ câu hỏi | 36/36 kiểm tra đối chiếu nội dung bản xuất đạt; kiểm thử riêng giữ YCCĐ có số lượng 0 |
| Barem/đề cương PDF tràn hoặc mất nội dung | Bảng `longtable` có tiêu đề lặp; độ rộng theo vùng in; tách phần đáp án; chuẩn hóa chỉ số Unicode sang công thức | 13/13 TeX biên dịch thành công hai lượt, **0 cảnh báo tràn khung/thiếu ký tự**; kiểm tra 27 PDF, 105 trang, không có từ vượt khỏi khổ trang |
| Word bị nối cả loạt câu, đẩy trang tiêu đề riêng | Ngắt chuỗi giữ-đoạn ở cuối phương án của từng câu; giữ các dòng barem của cùng câu | Các đề Word từ 3–4 trang với trang tiêu đề riêng còn 3 trang có câu hỏi bắt đầu ngay trang đầu; barem không bị tách giữa các dòng của cùng câu |
| Bảng đáp án tổng hợp Word vượt vùng nội dung | Đồng bộ độ rộng cột lưới và từng ô với khổ A4, vùng in 16,5 cm | Bảng 28 câu/4 mã nằm trong vùng in, gọn một trang |
| Tên trường Á Châu bị gắn cứng trong hồ sơ môn chung | Bản LaTeX và Word bảng đáp án tôn trọng `school_profile` | Hồ sơ chương trình Vật lí thử không có tên trường gắn cứng; kiểm tra nội dung cả hai định dạng đạt |

## Kiểm thử đã chạy trên bản sửa cuối

- **128/128 kiểm tra Python của ứng dụng cục bộ đạt** (`local_tests.log`). Bao gồm 8 kiểm thử hồi quy mới cho các lỗi xuất tài liệu, ma trận hoán vị, hồ sơ cũ và ánh xạ ý Đúng/Sai.
- **65/65 kiểm tra Django đạt** (`django_tests.log`), bao gồm 5 kiểm thử mới về cách ly Test, reset, phân quyền chương trình, tham số Test và tài nguyên giao diện.
- Hai bộ JavaScript đạt: `node tests/frontend.test.cjs`, `node tests/matrices_frontend.test.cjs`. Có kiểm thử ưu tiên đúng PPCT riêng của chương trình.
- Kiểm cú pháp giao diện và `git diff --check` đạt. `makemigrations --check --dry-run` trả `No changes detected`.
- **23/23 kiểm tra API** trên nguồn PPCT Vật lí mới đạt (`results.json`).
- **15/15 kiểm tra trình duyệt thật** đạt (`browser_results.json`): mở đúng Vật lí 10, đủ danh sách bài, tìm câu, soạn/lưu/xóa câu thử, xem ma trận/mã đề, tải ZIP và chuyển Test/thật.
- **36/36 kiểm tra nội dung** bản Word/PDF đạt (`content_audit.json`): đủ 31 đề bài, đủ tiêu chí chấm tự luận, đúng YCCĐ và số câu theo từng mã, đủ giới hạn kiến thức trong đề cương, không gắn nhầm tên trường.
- **14 Word và 13 TeX** được xuất qua API; Word chuyển PDF bằng LibreOffice, TeX biên dịch XeLaTeX hai lượt. Các bản PDF được kết xuất thành ảnh để kiểm tra bố cục. Bản PDF từ Word dùng để kiểm tra Word, không được trình bày là PDF do XeLaTeX tạo.
- Rà soát mã độc lập phát hiện hai trường hợp bổ sung: mã đề cũ và YCCĐ chưa phân bổ. Cả hai đã có kiểm thử tái hiện thất bại trước sửa và đạt sau sửa; lượt rà soát lại không còn phát hiện cần xử lý trong các thay đổi đó.

## Những tệp chính đã sửa

- `cloud/assessment/models.py`, `migrations/0005_legacystate_test_mode.py`: trạng thái Test riêng, giữ nguyên trạng thái thường đang có.
- `cloud/assessment/legacy_storage.py`, `legacy_views.py`, `cloud/config/urls.py`, `server.py`: định tuyến và reset kho Test; phục vụ tài nguyên giao diện.
- `public/app.js`, `core.js`, `styles.css`: môn/khối/PPCT theo chương trình, trạng thái Test và quy tắc ẩn banner.
- `bank_service.py`: môn của câu theo chương trình; ánh xạ ma trận từng mã, hồ sơ hoán vị cũ, thứ tự các ý và xuất ZIP.
- `latex_generator.py`, `latex_layout.py`: chuẩn hóa ký hiệu, bảng nhiều trang, ma trận có số liệu thật và nhận diện trường theo hồ sơ.
- `exports.py`: phân trang câu hỏi/barem Word và độ rộng bảng đáp án tổng hợp.
- `cloud/tests/test_sandbox.py`, `tests/test_acceptance_repairs.py`, `tests/frontend.test.cjs`: kiểm thử hồi quy.

## Dữ liệu và phạm vi nghiệm thu

Tiếp tục dùng 48 dòng PPCT/chuyên đề, 464 gạch đầu dòng YCCĐ trích từ tệp giáo viên cung cấp. Bộ câu hỏi thử gồm 28 MC và 3 tự luận cho 12 bài đầu, đề 45 phút, tổng 10 điểm với tỷ lệ 70%/30%. Đây là bộ câu hỏi minh họa phục vụ nghiệm thu, cần giáo viên Vật lí duyệt kiến thức và mức độ trước khi dùng thi thật.

Tệp nguồn có SHA-256 `3dd4e0aea320db0df1c3f52abe27d31a99c94ce6fad79e1ae741380164c8bf69`; kiểm tra lại cho thấy không thay đổi. Không ghi dữ liệu thử vào ngân hàng thật. Toàn bộ thử nghiệm database, migration và trình duyệt dùng thư mục `/private/tmp/exammatrix-vatly10-db-20261025`; máy chủ thử đã dừng.

Các điểm không phải lỗi phần mềm trong nguồn vẫn cần giáo viên xác nhận: STT khuyết/lệch, lịch tuần/tiết cụ thể, ngày ký nguồn 16/11/2025 và sự phù hợp với năm học 2026-2027. Lượt này không bổ sung chức năng nhập trực tiếp DOCX PPCT, không gọi Gemini có phí, không kiểm chứng PostgreSQL hay triển khai public.

## Điểm trình bày còn cần cân nhắc trước khi in

Rà ảnh toàn bộ bản xuất cho thấy một số câu ở cuối trang PDF XeLaTeX vẫn có phần phương án nằm ở đầu trang kế tiếp (ví dụ câu 16 mã 103 và 104). Nội dung và đáp án vẫn đầy đủ; đây là hạn chế phân trang còn lại, nên xem trước hoặc chỉnh ngắt trang trước khi in đề chính thức. Kết quả đạt ở trên xác nhận các lỗi chức năng và mất/tràn nội dung đã ghi nhận, không có nghĩa mọi vị trí ngắt trang đã tối ưu.

## Khi cập nhật bản Django đang sử dụng

Bản sửa có migration mới. Trước khi khởi động máy chủ với mã mới, sao lưu database của bản đang sử dụng và chạy bằng môi trường Python của bản đó, từ thư mục `cloud/`:

```sh
python manage.py migrate --noinput
```

Lượt này đã áp dụng và kiểm chứng migration trong database thử riêng; chưa áp dụng lên database làm việc thật hoặc máy chủ public. Các dòng dữ liệu đang có được mặc định giữ ở chế độ thường (`is_test_mode=False`), không tự di chuyển sang Test.

## Hồ sơ bàn giao sau sửa

- `Ho_so_Vat_li_10_sau_sua.zip`: 14 Word và 13 PDF XeLaTeX, gồm đề/đáp án 4 mã, ma trận/bảng đặc tả riêng từng mã, đề cương và bảng đáp án tổng hợp Word. Cấu trúc dữ liệu thử, không phải hồ sơ đã duyệt chuyên môn.
- `Bang_chung_nghiem_thu_lai.zip`: báo cáo này, kết quả kiểm tra, ảnh giao diện và bản xem PDF, cùng hồ sơ sau sửa.
- Bằng chứng chi tiết đầy đủ được giữ trong thư mục nghiệm thu lại này. Phạm vi kỹ thuật ở trên đã đạt; việc duyệt nội dung đề và triển khai môi trường thật là các bước tiếp theo riêng biệt.
