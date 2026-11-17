# G4 — Bản sửa bố cục Word đã tích hợp

Sáu biến thể Word dùng A4 ngang, top/bottom1cm, trái1.5/phải1cm, bảng không quá24cm. Footer xóa tab kiểu mẫu dọc và đặt số trang phía phải. Banner vẫn chỉ ở đề cương, đưa vào đầu thân trang đầu để không cắt/lặp trên các trang sau; giữ nguyên ảnh và văn bản.

Test mới6subtest ban đầu đều fail, sau sửa đạt; test phát hiện banner/footer đã FAIL→PASS. ReviewR2 xem đủ3trang đề cương mẫu, kiểm merged/grid/cellwidth và nội dung/ảnh bảo toàn. Đã tích hợp exports.py, test_word_layout.py và test_export_page_rules.py sau kiểm hashnguồn. Không đổiPDFengine/quyềnđápán. Render phụ bằng LibreOffice không chứng minh nhánh WordPDF; ca Word thật còn bị macOSchặn quyềnnhư G4-WORD-PROBE.
