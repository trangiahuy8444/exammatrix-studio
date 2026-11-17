# REVIEW-LEVEL4-FINAL — 31/10/2026

## Kết luận

Không phát hiện lỗi chặn tích hợp trong phạm vi bốn mức được giao. Kết luận này áp dụng cho các tệp và mã SHA-256 bên dưới, chưa phải nghiệm thu dự án hoặc hồ sơ CK1 thật.

## Kiểm tra độc lập

- Python: `PYTHONPATH=tests python -m unittest test_matrix_four_levels test_matrix_model test_matrix_exports test_matrix_checks test_exam_set -v`: 60 ca chạy, 59 đạt, 1 bỏ qua do không có nguồn riêng của giáo viên.
- Python: `PYTHONPATH=tests python -m unittest test_input_validation test_latex_generator -v`: 16/16 đạt.
- Node: `node tests/frontend.test.cjs` và `node tests/matrices_frontend.test.cjs`: đều đạt, gồm kiểm tra lưu nháp theo phạm vi, lọc/chọn Vận dụng cao, giữ mức khi đổi dạng câu và thứ tự duyệt.
- Probe dữ liệu giả THPT với bốn dạng câu × bốn mức: xuất được bảng 24 cột, tham chiếu đúng vị trí, tổng độ rộng không quá 24 cm; LaTeX sinh được và có VDC. Probe chỉ kiểm hình dạng đầu ra, không dùng làm bằng chứng hợp lệ nghiệp vụ của YN một ý.
- Test hash ma trận cũ vẫn khớp `d079dfe96146185fdb944421847c54eb9cdfb78c5a86fdb009879e22bb94733c`. Hồ sơ không có VDC vẫn dùng ba cột mức; không có thay đổi hàm digest.

## Nội dung đã rà soát

Mức VDC được giữ riêng trong tổng hợp, ô ma trận, yêu cầu và bảng năng lực; cột VDC không đè năng lực tiếp theo. Xuất Word/HTML/LaTeX dùng bốn mức khi có yêu cầu VDC. Tham khảo ba mức chỉ cộng VD + VDC để cảnh báo và ghi rõ đây là quy đổi kỹ thuật, không đổi mức trong dữ liệu.

Lưu câu, duyệt đủ checklist, chọn ứng viên, tạo đề và bộ đề giữ đúng VDC; câu chưa duyệt không được chọn và sửa câu đã duyệt không sửa snapshot đề. Giao diện ngân hàng, biểu mẫu, lọc và nháp chấp nhận VDC. Lưu nháp vẫn theo danh sách cho phép, tách phạm vi và xử lý storage lỗi.

## Giới hạn

Không đọc hoặc thay dữ liệu thật. Không kiểm tra PDF bằng Microsoft Word, không kiểm giao diện trình duyệt thật trong lần review này. Không chứng minh bố cục cũ giống byte toàn bộ vì không dùng bản nguồn cũ để so sánh; chỉ kiểm hash nội dung và cấu trúc ba mức. `docx_exam_importer.py` đang được agent khác sửa tính trung thực của kiểm định và không nằm trong kết luận này. Import ma trận 10/6 cột do reviewer khác phụ trách. Cần chạy đầy đủ engine/Django sau khi các thay đổi cùng được đóng băng.

## SHA-256 phạm vi rà soát

```json
{
  "matrices/model.py": "5953ed642ab0d6c40c228ad24213f50eb1544fb7b8ba09b7e2b02e38a49122dc",
  "matrices/exports.py": "93f43d2a99fdf5bc046c4c34dc23885d88c98ec3179fb103012877d0ab71c24a",
  "public/matrices.js": "a265ecfd3b7756b8e4e37c2a715239605bbc96ebac879da79718a6242cdfa9a5",
  "domain/matrix_checks.py": "08e4bf78ff3c3850f1eac59a2810e9f99eaebe99e5ab681b1efa756e42cf2bf0",
  "latex_layout.py": "88c561631d368469a453ffb3055a667abab11343591d2b6d80ac6cef3d3b0d6c",
  "input_schema.py": "837dc372b7e7a0f3a8e9ae34922243e215c6e25b5efd57663a56befc7c456b9c",
  "bank_service.py": "dc615c03525b61844c4fa769b2f0e2524285d843914fb39a1ac27c4be62e206f",
  "public/app.js": "0c11b1a534754be95944c2c3bd9d1a2551784a0964185ba867711442d96b1864",
  "public/core.js": "b37fcea72ab99d81d75096e675b29f7ab4976d752b599523463de37f2995b3be",
  "tests/test_matrix_four_levels.py": "13555e8ecd7379e06d8826ac0399034f2e4ec5201ff0377ff061c49b7da117bb"
}
```
