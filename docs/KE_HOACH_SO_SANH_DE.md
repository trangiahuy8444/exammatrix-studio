# Phân tích cấu trúc và kế hoạch so sánh đề — 19/11/2026

## Mục tiêu
Giảm thời gian soạn đề và phát hiện sai sót trước phát hành. Giáo viên chọn 2–6 đề đã lưu và đọc chênh lệch cụ thể. Không tự thay câu, điểm hoặc trạng thái duyệt. Người dùng đã chọn chức năng báo cáo độ tương đương giữa các đề.

## Cấu trúc đã kiểm tra
- `bank_service.py`: lưu trữ và điều phối nghiệp vụ; `domain/`: quy tắc thuần; `matrices/`: mô hình, kiểm định, nhập/xuất ma trận.
- `server.py`: API cục bộ và API dùng chung với Django.
- `cloud/assessment/legacy_views.py`: chuyển request Django sang Handler; `legacy_storage.py`: dữ liệu riêng tài khoản/chương trình trong CSDL. `cloud/workspace/`: tài khoản và chương trình.
- `exports.py`, `latex_generator.py`, `pdf_build.py`: bản xuất; PDF qua Word cục bộ.
- `public/app.js`, `core.js`, `curricula.js`, `matrices.js`: giao diện không cần build.
- `public/firebase-bridge.js`: đường xử lý dữ liệu riêng cho Pages/ngoại tuyến và đồng bộ Firestore. Không thực thi lõi Python.
- `.github/workflows/tests.yml`: kiểm Python, Django/SQLite và PostgreSQL, Node. `deploy-pages.yml`: đưa `public/` lên Pages khi main thay đổi; chưa phụ thuộc kết quả job Tests.
- `tests/`, `cloud/tests/`: kiểm thử lõi/giao diện và Django. `docs/`, `acceptance/`: bối cảnh, lộ trình, bằng chứng.

Nền phiên: nhánh `merge-to-studio-main`, commit `935d752`; chỉ `graphify-out/` chưa được theo dõi. `bank_service.py` đã có nội dung, ba tài liệu trạng thái đã hiện hữu; không áp lại thao tác khôi phục dựa trên hiện trạng cũ. Bản sao lưu ngoài Drive hiện hữu nhưng phiên này chưa kiểm chứng toàn bộ bản sao.

## Thiết kế và giới hạn
- Đối chiếu khối, môn, kỳ và thời lượng; thống kê số câu, điểm theo dạng, mức độ, bài và YCCĐ của từng câu.
- So sánh từng cặp; chỉ kết luận khớp cấu trúc khi dữ liệu đầy đủ và mọi phân bố đều khớp. Thiếu trường, điểm sai hoặc đề rỗng phải báo chưa đủ căn cứ.
- Tỷ lệ dùng chung **mã câu** = số mã chung / số mã hợp của hai đề; không coi đây là tỷ lệ trùng nguyên văn. Mã trùng nhưng nội dung sửa không chứng minh cùng phiên bản.
- Đơn vị thống kê là câu hỏi; chưa đo mức độ từng ý Đúng/Sai/tự luận. Không suy ra độ khó, độ phân biệt hay tương đương tâm trắc. Đề cùng gia đình hoán vị phải có ghi chú.
- Báo cáo chỉ có dữ liệu tổng hợp và mã đề; không trả nội dung câu, đáp án hoặc rubric. Chỉ đọc snapshot đã lưu, giữ phân quyền tài khoản/chương trình hiện có.
- Điểm cộng ở độ chính xác 6 chữ số thập phân; không áp quy tắc làm tròn điểm học sinh vào thống kê cấu trúc.

## Các phần triển khai
1. Lõi báo cáo: thêm `domain/exam_comparison.py`, kiểm thử `tests/test_exam_comparison.py`; thống kê và các kết luận bảo thủ, không thay dữ liệu.
2. API Python: sửa `bank_service.py`, `server.py`; chỉ nhận danh sách ID và lấy bản lưu của tài khoản. Thêm kiểm thử Django cho quyền, chương trình và không ghi dữ liệu.
3. Pages và giao diện: thêm `public/exam-comparison.js` (hàm thuần và trình bày an toàn); sửa `firebase-bridge.js`, `index.html`, `app.js`; nút so sánh trong danh sách đề, hộp chọn và báo cáo. Kiểm Node đối chiếu đầu ra JavaScript/Python bằng dữ liệu minh họa chung.
4. Kiểm hồi quy, cập nhật README, nhật ký và báo cáo thực thi trong tài liệu này. Không triển khai công khai hoặc migrate dữ liệu thật.

## Rủi ro và cách xử lý
| Rủi ro | Xử lý trong chức năng |
|---|---|
| Hai lõi Python/JavaScript lệch nhau | Cùng hợp đồng JSON; kiểm đầu ra chéo bằng fixture tự soạn |
| Cùng số câu nhưng khác điểm/bài/mức độ | So sánh cả số câu và điểm của từng phân bố |
| Thiếu dữ liệu vẫn báo tương đương | Kết luận ba trạng thái: khớp, lệch, chưa đủ căn cứ |
| Thống kê theo từng trục che mất lệch ô kết hợp | So sánh thêm ô bài × YCCĐ × dạng × mức độ |
| Trộn môn/khối/kỳ/thời lượng | Nêu chênh lệch bối cảnh, không kết luận khớp |
| Rò đáp án hoặc dữ liệu tài khoản khác | Chỉ lấy ID trong storage hiện hành; đầu ra chỉ tổng hợp |
| Tiêu đề/YCCĐ có HTML | Escape mọi dữ liệu khi hiển thị |
| Mã câu lặp/khuyết hoặc đề chưa sinh câu trên Pages | Cảnh báo dữ liệu, không kết luận khớp |

## Phát hiện ngoài phạm vi sửa
Pages có route sinh đề chỉ lưu payload, route thiếu câu trả đủ mặc định và route chưa hỗ trợ có thể trả thành công. `localhost` cũng được nhận diện là host tĩnh, có thể bỏ qua Django khi dùng hostname này. Đây là rủi ro cần xử lý riêng; không mặc nhiên coi Pages ngang chức năng Django. Các tệp giao diện lớn (app ~3.741, curricula ~4.818, matrices ~2.787 dòng) nên tách dần khi sửa đúng phạm vi, không di chuyển hàng loạt trong phiên này.

## Kiểm chứng
Môi trường tách biệt `/private/tmp/exammatrix-audit-20261119`, thư viện từ `cloud/requirements.lock`. Dữ liệu Django thử nghiệm nằm trong `/private/tmp/`; không migrate CSDL thật. Kết quả thực thi được ghi sau khi chạy, không dùng số liệu lịch sử làm bằng chứng phiên này.

## Kết quả thực thi
Đã triển khai cả bốn phần. Bổ sung phân bố **điểm từng câu trong từng ô** để không coi 1+9 điểm tương đương cấu trúc 5+5 điểm. Python dùng Decimal và JavaScript dùng số nguyên thập phân để thống nhất làm tròn. Biên bản chi tiết: `../acceptance/2026-11-19-so-sanh-de/BIEN_BAN.md`. Chưa nghiệm thu giáo viên hoặc triển khai công khai.
