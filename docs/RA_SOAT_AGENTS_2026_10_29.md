# Kết quả rà soát agents — 29/10/2026

Đã sửa: ba tham chiếu hàm sai; yêu cầu tự loại câu từng dùng; hướng dẫn chạy script xuất cũ đọc dữ liệu thật; đường dẫn SQLite sai và che lỗi băm; thiếu ba adapter Claude; mô tả kích hoạt và hợp đồng phân công/bàn giao. Sáu adapter dùng nội dung vai trò chung. Điều chỉnh hướng dẫn phân biệt cấu hình chấm/tỉ lệ tham khảo với căn cứ pháp lý cần tra bản gốc.

Xác minh: kiểm tra sáu tham chiếu vai trò/adapter và hợp đồng bằng script; đối chiếu tên API qua AST; kiểm tra độc lập hai tình huống thiếu Word và câu đã dùng. Các điểm bổ sung từ lượt kiểm tra độc lập đã sửa: mô tả kích hoạt, vị trí ratio_tolerance, nhóm lệnh cd.

Giới hạn: quick_validate.py không chạy được do thiếu PyYAML ở cả Python hệ thống và môi trường dự án; đã kiểm tra cấu trúc cơ bản thay thế nhưng không coi là đã qua validator YAML. Chưa chạy phiên Claude thật để chứng minh tự chọn agent; chưa chạy toàn bộ test ứng dụng vì chỉ sửa hướng dẫn. Không chạy script xuất dữ liệu thật, không nghiệm thu mốc hay triển khai.

## Bổ sung theo yêu cầu tiếp quản của Codex

Đã tăng từ sáu lên mười vai trò, bổ sung kiểm thử luồng giáo viên, bảo mật/phân quyền, quản trị dữ liệu và vận hành/sao lưu. Viết lại phạm vi sáu vai trò cũ, đồng bộ mười adapter và năm skill liên quan. Kế hoạch phân công từng vai trò tại `docs/KE_HOACH_HOAT_DONG_AGENTS.md`.

Kết quả mới: 25 YAML frontmatter được parse thành công bằng Ruby YAML có sẵn; mười bộ vai trò/adapter/phiếu khớp, đủ mục tiêu/đầu vào/việc làm/quyền ghi/tiêu chí/phụ thuộc và các tham chiếu vai trò tồn tại. Đã kiểm tra độc lập bằng ba tình huống phân công, sửa các mâu thuẫn phát hiện. Vì vậy giới hạn thiếu PyYAML của lượt trước đã có cách kiểm tra cú pháp YAML thay thế; không cài thêm thư viện.

Chưa thực thi các phiếu sản phẩm, chạy toàn bộ test ứng dụng, kiểm thử UI hay nghiệm thu mốc. Agent chạy trong Codex khi được điều phối trong phiên, không phải tự đăng ký dịch vụ hay lịch nền.
