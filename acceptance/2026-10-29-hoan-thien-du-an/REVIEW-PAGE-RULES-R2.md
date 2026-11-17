# Rà soát lại ứng viên G4 — vòng 2

Ngày: 30/10/2026. **Chấp nhận hai sửa đổi trong phạm vi review hẹp; không còn blocker mới được phát hiện.** Đây không phải nghiệm thu toàn bộ G4 hoặc PDF bằng Microsoft Word.

## Phạm vi

Đọc ứng viên đóng băng tại `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`: sửa hai phát hiện trong `REVIEW-PAGE-RULES.md`, test mới và thay test vị trí logo. Không sửa mã sản phẩm, không đọc dữ liệu thật, không mạng/commit và không chạy full suite.

## Hai phát hiện đã được xử lý

1. **P1 — banner bị cắt:** nhánh đề cương đặt nguyên ảnh vào đoạn đầu thân tài liệu, giữ chiều rộng 13,5 cm; Word header rỗng. Đã xem đủ ba ảnh `/tmp/bank-g4-candidate-r2/de_cuong/page-1.png` đến `page-3.png`: banner đầy đủ ở trang 1, trang 2 và 3 không lặp hoặc cắt banner; phần câu hỏi không bị header che. Khổ ngang và lề trên/dưới 1 cm vẫn giữ.
2. **P2 — số trang dừng ở tab giữa:** helper xóa tab stop trong style `Footer` trước khi đặt custom right stop trên đoạn. Test kiểm tra không còn tab kế thừa trước mép phải; render cả ba trang cho thấy `Trang 1/3`, `Trang 2/3`, `Trang 3/3` đều nằm ở phía phải, dòng lưu hành nội bộ ở phía trái.

## Bằng chứng kiểm tra bảo toàn

- Chạy độc lập `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.:tests python3 -B -m unittest test_export_page_rules test_word_layout`: **16 test, 15 đạt, 1 bỏ qua** (Microsoft Word thật). Trong đó `test_export_page_rules` có 3 test, test đầu gồm 6 subtest cho sáu biến thể.
- Test logo cũ kiểm kích thước `wp:extent` trong thân tài liệu phù hợp vị trí mới; test bổ sung xác nhận có ảnh inline và Word header không chứa ảnh. Không phát hiện việc giảm yêu cầu về kích thước logo.
- Kiểm tra sáu biến thể trong bộ nhớ với fixture tự soạn: student, teacher có hàng gộp ba cột, revision, LMS, mapping và answer grid. Tổng grid không quá 24 cm; độ rộng `tcW` nhất quán với tổng cột theo `gridSpan`, trong sai số làm tròn twip.
- Chỉ biến thể đề cương có một ảnh inline; năm biến thể còn lại không có logo trong body hoặc Word header. Nhánh đề cương không có logo lặp trong Word header.
- Đối chiếu ba cặp DOCX minh họa vòng 1/vòng 2 (`de_cuong`, `hoc_sinh`, `giao_vien`): tập đa hợp toàn bộ `w:t` và field `w:fldSimple/@w:instr` trong body/header/footer bằng nhau; SHA-256 từng ảnh media bằng nhau. Không thấy mất/thay nội dung văn bản, đáp án, field số trang hoặc ảnh do hai sửa đổi.
- Review mã không phát hiện thay đổi public whitelist, nhánh quyền đáp án, dữ liệu đầu vào hoặc PDF engine. Helper tiếp tục được gọi đủ ở bốn điểm lưu tạo sáu biến thể.

## Giới hạn

Các ảnh trên là render phụ; số trang thay từ 4 xuống 3 phù hợp việc bỏ banner lặp. Chưa xác nhận đầu ra Microsoft Word thật do giới hạn môi trường đã ghi ở vòng 1. Điều phối tiếp tục kiểm tra chung và giữ cổng xác nhận Word/PDF theo kế hoạch; kết luận vòng 2 chỉ đóng hai phát hiện cụ thể và bảo toàn cấu trúc trong phạm vi được giao.
