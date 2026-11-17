# QA giao diện báo thiếu câu — 31/10/2026

Kết luận: ba kịch bản trình duyệt đạt trên dữ liệu giả, không phát hiện lỗi chặn trong phạm vi kiểm.

## Phạm vi

Chạy Chromium thật ở 1440 × 1000 bằng Playwright. Đã gắn `MatrixUI.mount`, mở hồ sơ qua nút có `data-open`, bấm nút **Báo cáo thiếu câu theo ô**; kiểm báo cáo xuất hiện bằng luồng sự kiện của giao diện. `core.js`, `matrices.js` và CSS lấy từ snapshot cách ly. Phản hồi báo cáo được tạo bằng chính `domain.matrix_checks.shortfall_report` trên fixture tự soạn; mọi API còn lại là hàm mô phỏng trong bộ nhớ. Không đọc ngân hàng, không gọi máy chủ thật, không sửa sản phẩm.

Môi trường Python của dự án không có Playwright; dùng gói Node Playwright đã có của runtime. Lần tạo fixture đầu thiếu PYTHONPATH đã lỗi import và bị loại khỏi kết quả. Chạy lại với PYTHONPATH đúng mới sinh fixture và thực hiện đủ ba kịch bản dưới đây.

## Kết quả

1. **YN bốn ý thuộc bốn ô + hai MC thiếu:** tiêu đề “Chưa thể kết luận đủ câu”; số hai câu thiếu được ghi riêng là số đã xác định; hiện đủ Đ/S 1a, 1b, 1c, 1d, gồm mức Vận dụng cao và B4. Chuỗi HTML thử trong YCCĐ được hiện nguyên văn, không tạo phần tử img và không chạy alert.
2. **Nhận nguồn chưa xác nhận, chưa có vị trí:** hiện “Chưa thể kết luận đủ câu” cùng hai lý do; không có “Đủ câu…” hoặc “Còn thiếu 0 câu”.
3. **Một ô MC đủ câu approved:** hiện “Đủ câu đã duyệt cho mọi ô”; số cần/đã duyệt đều là 1.

Nút **Mở duyệt ô này** trong kịch bản 1 gọi callback đúng một lần với ô MC/B1. Không có thông báo lỗi hoặc lỗi JavaScript. Không có request mạng nào (mọi request ngoài bị chặn).

Đã xem trực tiếp cả ba ảnh chụp: bố cục đọc được, đủ bốn ý và không mất nội dung trong vùng báo cáo. Đây không phải thử luồng tài khoản, backend/HTTP hoặc CK1 thật; chưa kiểm màn hình di động.

## Bằng chứng

- Script fixture: `/tmp/shortfall-ui-qa/fixtures.py`.
- Script trình duyệt: `/tmp/shortfall-ui-qa/probe.cjs`.
- Kết quả JSON: `/tmp/shortfall-ui-qa/results.json`.
- Ảnh: `/tmp/shortfall-ui-qa/mixed.png`, `empty.png`, `normal.png`.
