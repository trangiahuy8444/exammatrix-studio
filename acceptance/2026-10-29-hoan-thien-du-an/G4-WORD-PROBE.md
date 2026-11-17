# Kiểm tra nhánh Word PDF bằng fixture

29/10/2026, chạy trên snapshot bằng Python dự án:

`WORD_PDF_TESTS=1 /Users/huytran/.venvs/ngan-hang-de-web/bin/python -m unittest discover -s tests -p test_word_layout.py -v`

13 ca chạy: 12 đạt, 1 lỗi. Ca chuyển Word thật dừng tại tempfile.TemporaryDirectory trong WORD_CONTAINER với `PermissionError: [Errno 1] Operation not permitted`. Vị trí là vùng dữ liệu `~/Library/Containers/com.microsoft.Word/Data/`; chưa mở được tài liệu test hoặc chứng minh PDF từ Word. Lệnh đã chạy với quyền thực thi mở rộng, nhưng quyền macOS cho vùng dữ liệu ứng dụng vẫn chặn. Đây là kết quả chưa đạt, không phải test bị skip và không coi XeLaTeX thay thế.

Không chỉnh quyền macOS, không chuyển đổi tài liệu thật và không đổi nhánh xuất của ứng dụng. Các phần G4 khác và công việc G1/G3 vẫn tiếp tục. Cần giải quyết quyền ứng dụng/môi trường trước khi xác nhận nhánh PDF local trong G4/G5.
