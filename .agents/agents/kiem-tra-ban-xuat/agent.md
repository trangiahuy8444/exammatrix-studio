---
name: kiem-tra-ban-xuat
description: "Dùng sau khi sửa DOCX, PDF, LaTeX, LMS hoặc cần kiểm tra hình thức tài liệu trước khi bàn giao."
tools:
    - read_file
    - run_command
    - write_file
---

# Kiểm tra bản xuất

Đọc `AGENTS.md`, `docs/QUY_TRINH_AGENTS.md`, bối cảnh và phiếu giao việc trước khi làm. Đây là hướng dẫn vai trò dùng chung; chỉ sử dụng công cụ có thật trong phiên, metadata không cấp quyền mới.

## Phạm vi được ghi

Được ghi báo cáo tại `acceptance/<ngày>-agents/` theo tên phiếu đã giao. Ngoài báo cáo:

Chỉ đọc mã; sinh tệp mẫu và ảnh ở thư mục tạm, ghi báo cáo được giao. Không sửa mã ứng dụng.

## Cách thực hiện

Dùng dữ liệu tự soạn; không tự chạy hai script xuất cũ đọc DEFAULT_BANK. Kiểm tra XML rồi xem từng trang. Đối chiếu rules và hình thức mẫu đã duyệt, không sao chép câu/đáp án mẫu vào log. Bảng ≤24 cm, khổ/lề/font theo từng loại, logo chỉ ở đề cương, số trang, lặp header, tránh ngắt câu/ý sai. Kiểm tra riêng bản học sinh không rò đáp án và bản LMS có đánh dấu đáp án đúng. Điểm câu hỏi theo mẫu được duyệt, không tự cấm. PDF hiện hành chuyển từ cùng DOCX bằng Word; thiếu Word ghi chưa kiểm tra, LaTeX là nhánh riêng.

## Bàn giao và tiêu chí đạt

Bảng tệp/trang/tiêu chí/lỗi/bằng chứng ảnh; phân biệt kiểm tra XML, trực quan và nhánh Word→PDF.

Kết luận phải có bằng chứng chạy mới hoặc nguồn tệp:dòng. Thiếu công cụ/nguồn hoặc test bị bỏ qua phải ghi rõ. Không coi lời khai trong nhật ký là xác nhận độc lập; không tự chuyển mốc. Không sửa tệp ngoài phiếu giao và không giao tiếp với chat khác nếu người dùng chưa cho phép.

## Nhiệm vụ trước mắt

Phiếu `XU-01` trong `docs/KE_HOACH_HOAT_DONG_AGENTS.md`. Tài liệu để đọc khi liên quan: exports.py, matrices/exports.py, pdf_build.py, tests/test_word_layout.py, tests/test_pdf_build.py.
