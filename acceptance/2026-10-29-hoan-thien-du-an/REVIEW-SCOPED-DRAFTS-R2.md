# REVIEW-SCOPED-DRAFTS-R2 — G3 sau sửa review

Ngày: 29/10/2026. Vai trò: review độc lập; không sửa code sản phẩm hoặc tests. Kết luận: **APPROVE trong phạm vi ba findings của vòng 1; không còn blocker đã xác nhận trong phạm vi này.**

## Phạm vi

Ứng viên tại `/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`. Đọc lại phần thay đổi trong `public/app.js`, `public/core.js`, `tests/exam_drafts.test.cjs` và điểm require trong `tests/frontend.test.cjs`. Nguồn workspace chỉ nhận báo cáo này. Không chạy Python, không truy cập mạng/DB/ngân hàng thật.

## Xác minh độc lập

1. **P1 thứ tự lưu nhập liệu: đã khắc phục.** Listener input/change chuyển sang bubble và save đồng bộ sau handler cập nhật dữ liệu. Chromium thật, fixture của probe GREEN, click title rồi `pressSequentially('XYZ')`, đọc storage trước blur và reload trực tiếp. Kết quả: `{"typed":{"memory":"XYZ","saved":"XYZ"},"reloaded":"XYZ","errors":[]}`. Không cần thao tác tiếp để cứu lần save cuối. Probe được chạy bằng code trong bộ nhớ, không sửa probe cũ hoặc tạo thêm file.
2. **P2 YCCĐ blueprint: đã khắc phục.** save giữ outcomes; clean kiểm mảng chuỗi theo lesson catalog và không biến outcome hết hiệu lực thành lọc mọi YCCĐ. Probe Node độc lập roundtrip dòng B1/MC/Biết/10×1/outcomes [YCCĐ A] deepEqual đạt; đổi catalog để YCCĐ A mất thì toàn dòng bị vô hiệu. Không làm rộng tập câu hợp lệ. Tests mới cũng kiểm đúng hai nhánh này.
3. **P2 thiếu owner với curriculum: đã khắc phục.** Key null khi curriculum có nhưng workspace trống; save false/load null trước truy cập storage. Probe Node độc lập đếm số lần truy cập kho không tăng. Probe Chromium gỡ workspace meta khỏi fixture có curriculum, restore rồi render: `{"key":null,"saved":false,"hint":"Không thể lưu nháp trên trình duyệt này; hãy giữ trang đang mở."}`. Không thông báo lưu thành công sai. Legacy không có curriculum vẫn được namespace cục bộ như dự kiến; không khẳng định phân biệt được một trang thiếu đồng thời cả hai meta và context identity.
4. **Whitelist lồng set_counts: đạt.** Probe riêng cho `{ok:3,answers:{secret:true}}` chỉ persist `{ok:3}`. JSON lỗi/quota/storage throw tiếp tục được catch theo bộ Node.

Hai lệnh Node chạy tại ứng viên đều exit 0: `node tests/frontend.test.cjs`, `node tests/matrices_frontend.test.cjs`. Tệp exam_drafts vẫn được require bởi lệnh frontend chuẩn. Chromium mở với profile tạm; toàn bộ request route thành assets/JSON fixture, không có dữ liệu thật.

## Giới hạn và quyết định

Các thay đổi R2 giải quyết trực tiếp ba findings vòng trước. Không đổi server/API nghiệp vụ. Vòng official/Test, đổi môn, matrix/template và bảo toàn 14 trường đã có GREEN fixture của QA; review này không chạy lặp toàn bộ probe đó. Không xác minh backend auth thật, thao tác toggle chồng nhau, lỗi request giữa chuyển mode hoặc đa tab ghi đồng thời. Không suy diễn các giới hạn đó thành blocker mới khi chưa có triệu chứng xác nhận. Có thể đưa ứng viên này sang bước nghiệm thu tích hợp của điều phối.
