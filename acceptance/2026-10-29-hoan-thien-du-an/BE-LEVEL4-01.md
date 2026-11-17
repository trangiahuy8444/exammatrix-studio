# BE-LEVEL4-01 — Hỗ trợ bốn mức nhận thức

Ngày kiểm chứng: 30/10/2026. Phạm vi triển khai: snapshot cách ly `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`; chưa tích hợp mã vào repository nguồn. Áp dụng vai trò `ky-su-backend`, hợp đồng `docs/QUY_TRINH_AGENTS.md`, TDD và verification-before-completion. Phạm vi UI và LaTeX do điều phối cho phép rõ trong phiếu.

## Kết quả triển khai

- `matrices/model.py:10`: schema/validation và view/totals/ref nhận riêng Biết, Hiểu, Vận dụng, Vận dụng cao. Không đổi cấu trúc tính digest, YCCĐ, điểm, yêu cầu approved hoặc quy tắc khóa.
- `matrices/exports.py:26`: chọn số mức xuất theo nội dung hồ sơ. Có YCCĐ VDC thì mỗi dạng và nhóm tổng có bốn cột; hồ sơ cũ không VDC vẫn ba cột. Bảng năng lực THPT tăng từ 12 lên 15 cột khi có VDC. Tổng đặc tả, tỉ lệ và nhãn VDC được giữ riêng. Hàm bảng cũ vẫn chuẩn hóa tổng chiều rộng 23,8 cm.
- `public/matrices.js:30`: trình chọn YCCĐ có đủ bốn mức; khi chọn VDC không tự chuyển sang VD. Hướng dẫn cảnh báo nêu rõ phép quy đổi kỹ thuật khi so với tham khảo ba mức.
- `domain/matrix_checks.py:87`: chỉ khi so tham khảo CV 7991 ba mức mới cộng VD + VDC. Cảnh báo độ lệch ghi rõ đây là quy đổi kỹ thuật; không thêm ngưỡng pháp lý hoặc quy tắc chặn mới. So ô và báo thiếu câu vẫn phân biệt VD/VDC, chỉ câu approved tính là đủ.
- `latex_layout.py:118`: nhánh `generate_matrix_latex` cho hồ sơ canonical có cột VDC, tổng điểm và YCCĐ đúng mức; số cột header và mọi dòng khớp nhau. Hồ sơ ba mức giữ ba cột. Không cần sửa `latex_generator.py`.

## Các tệp do phiếu này sửa

Mã snapshot: `matrices/model.py`, `matrices/exports.py`, `domain/matrix_checks.py`, `public/matrices.js`, `latex_layout.py`.

Test snapshot: tạo `tests/test_matrix_four_levels.py`; sửa `tests/test_latex_generator.py`, `tests/matrices_frontend.test.cjs`.

Ngoài snapshot chỉ ghi báo cáo này. Không sửa `exports.py` gốc, `public/app.js`, `public/core.js`, package/HTML, dữ liệu riêng, hoặc tệp do agent khác sở hữu. Không commit, cài gói, truy cập mạng, chạy engine/Django toàn bộ hoặc triển khai.

## Bằng chứng RED → GREEN

1. Trước sửa mã: `PYTHONPATH=tests /Users/huytran/.venvs/ngan-hang-de-web/bin/python -m unittest test_matrix_four_levels` chạy 7 test: 5 FAIL. Lỗi đúng phạm vi: VDC không hợp lệ; tổng/view không nhận VDC; thiếu cột DOCX/năng lực; so tham khảo ba mức bỏ điểm VDC. Hai test đã đạt trước là digest cũ và so ô/báo thiếu câu vốn đã phân biệt chuỗi mức.
2. Node trước sửa: test mới không thể dựng lựa chọn VDC vì chưa có helper phục vụ trình chọn (`requirementLevelOptions`). Sau nối helper vào editor thật: Node đạt.
3. Sau sửa model/export/warning/UI: 7/7 test mới đạt. LaTeX kiểm chứng bổ sung RED: hồ sơ VDC gây `KeyError: Vận dụng cao` tại nhãn đặc tả; hồ sơ cũ có header/dòng sai số cột do dùng global LEVELS. Sau sửa `latex_layout.py`: hai test đó đạt.
4. Hồi quy mục tiêu trước bổ sung ca importer: `PYTHONPATH=tests /Users/huytran/.venvs/ngan-hang-de-web/bin/python -m unittest test_matrix_model test_matrix_checks test_matrix_four_levels test_matrix_exports test_matrix_service test_matrix_exchange test_matrix_generation test_latex_generator`: **55 test, OK, skipped=1**. Skip là ca cần Word/ngân hàng riêng không có trong snapshot. `node tests/matrices_frontend.test.cjs`: đạt.
5. Ca importer cũ bổ sung đã RED với fixture giả Word ba mức: `test_matrix_four_levels.FourLevelMatrixTests.test_old_three_level_word_import_does_not_read_a_fourth_source_column` gây IndexError tại `matrices/import_docx.py:225`, vì parser cũ dùng global LEVELS nhưng arrays chỉ có ba phần tử. Đã báo điều phối và agent sở hữu parser; chưa tự sửa tệp đó.

## Bảo toàn và giới hạn

- Digest fixture ma trận ba mức khóa cũ giữ nguyên SHA-256 `d079dfe96146185fdb944421847c54eb9cdfb78c5a86fdb009879e22bb94733c`; test giữ nguyên nội dung đầu vào và chặn đổi nhãn YCCĐ VDC nhận nguồn sang VD.
- Snapshot không có `data/` hoặc `cloud/var`; baseline hash riêng có **0 tệp**, nên không dùng kết quả này để tuyên bố hash dữ liệu thật an toàn. Điều phối giữ việc đối chiếu hash repository nguồn/dữ liệu thật.
- Đã kiểm tra cấu trúc DOCX/HTML/LaTeX bằng fixture giả: tổng điểm, ref, nhãn, số cột, độ rộng XML ≤24 cm. Chưa render/xem ảnh mọi trang, chưa chạy chuyển Word→PDF hoặc biên dịch XeLaTeX; chưa kết luận nghiệm thu bố cục in.
- **Phụ thuộc trước tích hợp:** agent `g1_compact_matrix_import` sở hữu `matrices/import_docx.py` phải giới hạn parser Word ba mức theo cột nguồn và chạy hồi quy nêu trên. Parser không được tự đổi VDC thành VD; Word bốn mức cần nhánh đọc phù hợp hoặc báo chưa hỗ trợ rõ ràng. JSON/biên soạn trên web đã dùng schema bốn mức.
- API view/totals bổ sung khóa `Vận dụng cao`; digest và dữ liệu lưu không thêm trường mới. Khả năng tạo đề/câu vẫn phải khớp ô thật; không lấy VD bù VDC, không nới approved/khóa.
- Rà soát ngoài phạm vi để báo điều phối: `bank_service.py:290` và `input_schema.py:17` vẫn chỉ cho ba mức khi lưu câu ngân hàng; `public/app.js` (bộ lọc/editor/matrixRow) và `public/core.js:473` còn ba mức. Phiếu này không sửa các tệp đó. Vì vậy kết quả hiện tại xác nhận hỗ trợ bốn mức **của hồ sơ ma trận**, chưa đủ để tuyên bố toàn bộ chuỗi biên soạn câu và sinh đề có VDC đã hoàn thiện. Không đổi câu thật để vượt qua giới hạn.
