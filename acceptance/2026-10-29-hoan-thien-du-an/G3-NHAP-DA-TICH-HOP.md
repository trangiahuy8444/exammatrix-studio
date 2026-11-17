# G3 — Bản sửa lưu nháp đã tích hợp

Giữ 14 trường biểu mẫu khi reload, giữ cả ký tự cuối khi gõ thật; tách nháp workspace/curriculum/môn/Test. Giữ outcomes của blueprint và loại dòng có YCCĐ không còn hợp lệ thay vì làm rộng bộ lọc. Trang có curriculum mà thiếu owner không đọc/ghi nháp. Không lưu bank, câu hỏi, đáp án hoặc CSRF; xử lý JSON/quota/storage lỗi và báo đúng giới hạn lưu trên trình duyệt.

Đã tích hợp 4 tệp sau kiểm hash nguồn trước sửa. Hai bộ Node chạy từ mã dự án đạt; reviewR2 độc lập kiểm Chromium gõ XYZ trước blur, reload, scope, outcomes, owner; QA chạy full fixture reload/source/môn/Test, 0 page errors. Xem QA-DRAFT-01, FE-DRAFT-01 và REVIEW-SCOPED-DRAFTS-R2. Chưa thay nghiệm thu CK1 thật/đa tab hoặc chứng minh nháp đồng bộ thiết bị.
