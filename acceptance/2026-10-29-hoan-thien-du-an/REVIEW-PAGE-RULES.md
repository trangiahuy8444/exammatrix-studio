# Rà soát ứng viên G4 — quy tắc trang Word

Ngày rà soát: 30/10/2026. Kết luận vòng 1: **cần sửa trước khi nhận ứng viên bố cục**.

## Phạm vi và phương pháp

- Ứng viên đọc tại `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`; đối chiếu với nguồn workspace chưa tích hợp helper.
- Chỉ rà soát diff `exports.py` và test mới `tests/test_export_page_rules.py`; không sửa mã, không đọc dữ liệu thật, không dùng mạng hoặc commit.
- Căn cứ: AGENTS.md dự án và `../rules/03_tieu_de_va_dinh_dang.md`: khổ A4 ngang, lề trên/dưới 1 cm, bảng không quá 24 cm, logo chỉ trên đề cương; phiếu giao việc quy định thêm lề trái 1,5 cm, phải 1 cm.
- Đọc XML của DOCX minh họa và xem ảnh render phụ `/tmp/bank-g4-candidate/de_cuong/page-1.png`, `page-2.png`. Render phụ không thay thế nghiệm thu bằng Microsoft Word.

## Phát hiện phải xử lý

### [P1] Header đề cương bị cắt khi đặt lề trên 1 cm

`exports.py:466–468` ép lề trên 1 cm và khoảng cách header xấp xỉ 0,2 cm cho cả nhánh đề cương, trong khi nhánh `revision` vẫn đặt banner rộng 13,5 cm trong Word header. DOCX minh họa thực tế có ảnh header cao **3,53125 cm** (`wp:extent cy=1271250`). Trang 2 của render phụ cho thấy phần header bị cắt ở mép trên, nội dung câu hỏi bắt đầu sát mép trên. Trang 1 không bộc lộ lỗi tương tự nên chỉ xem trang đầu sẽ bỏ sót.

Cần bố trí banner phù hợp với lề 1 cm và kiểm tra lại đề cương nhiều trang. Có thể dùng phần đầu thân tài liệu trên trang đầu, hoặc bố cục khác giữ được logo và không che/cắt nội dung. Giữ logo chỉ ở đề cương và không đổi câu hỏi/đáp án. Test mới hiện chỉ kiểm tra số đo trang/bảng nên không phát hiện lỗi này.

### [P2] Tab kế thừa từ style Footer giữ số trang ở giữa

Footer trong ảnh trang 1 và 2 đặt `Trang X/Y` ngay sau dòng bên trái, chưa ở mép phải vùng in. XML đoạn footer hiện tại **đã có đúng một right tab tại pos=15421**, và AST helper xác nhận điều kiện kiểm tra ký tự tab thật `\t`, không phải hai ký tự backslash và t. Tuy nhiên kiểm tra độc lập style `Footer` của chính DOCX cho thấy vẫn có hai tab kế thừa: `center pos=4680` (8,255 cm) và `right pos=9360` (16,51 cm). `clear_all()` trên đoạn văn ở `exports.py:471` không loại bỏ các stop kế thừa này, nên tab đầu gặp stop trung tâm trước custom right stop 27,2 cm. Cần loại bỏ/ghi đè stop của style Footer rồi render lại. Thay riêng điều kiện bằng `chr(9)` tương đương với mã hiện có. Word thật chưa chạy được do môi trường hệ điều hành; vẫn cần giữ phân biệt bằng chứng render phụ với nghiệm thu Microsoft Word.

## Các điểm đạt trong phạm vi rà soát

- Helper chạy trước tất cả bốn điểm lưu DOCX trong file: `_docx`, `_docx_lms`, `export_mapping_docx`, `export_answer_grid_docx`; bao phủ đủ sáu biến thể học sinh, giáo viên, đề cương, LMS, đối chiếu mã đề và bảng đáp án tổng hợp.
- Độc lập chạy `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.:tests python3 -B -m unittest test_export_page_rules test_word_layout`: **14 test, 13 đạt, 1 bỏ qua** (test Microsoft Word thật). Test quy tắc trang có sáu subtest.
- Kiểm tra trong bộ nhớ cả sáu biến thể với dữ liệu tự soạn: số đo trang/lề đạt; grid cột và độ rộng ô `tcW` nhất quán trong sai số làm tròn twip; tổng grid không vượt 24 cm.
- Đã thêm tình huống tự luận có `equivalent_answer_policy` để xuất hàng gộp ba cột: `gridSpan=3` nhận tổng độ rộng ba cột đúng. Thử thêm bảng tổng rộng 36 cm với ô đầu gộp hai cột: grid được thu về khoảng 24 cm và ô gộp nhận tổng hai cột đúng.
- Duyệt `tc_lst` theo ô XML thật tránh ghi đè lặp ô gộp do `row.cells` trả ô trùng. Không phát hiện lỗi merged-cell ở các cấu trúc export đang có.
- `doc.tables` không bao gồm bảng lồng và bảng header/footer. Đây chưa phải lỗi trong diff này vì các nhánh DOCX hiện tại không tạo các loại bảng đó; nếu bổ sung về sau phải mở rộng duyệt và test.
- Helper chỉ chỉnh thuộc tính trang, tab footer, autofit và độ rộng grid/ô; không thay văn bản, field PAGE/NUMPAGES, thông tin đáp án, public whitelist hoặc kiểm soát quyền. Logo vẫn chỉ được tạo ở nhánh đề cương. Không thay PDF engine.

## Giới hạn và bước tiếp theo

Chưa chạy full suite trong lần review hẹp này; điều phối thực hiện các kiểm tra chung sau sửa. Không coi kết quả test XML là xác nhận bố cục Microsoft Word/PDF đạt. Sau khi sửa banner, cần review vòng 2 diff, test logo theo vị trí mới nếu có, footer và render nhiều trang trước khi chấp nhận ứng viên.
