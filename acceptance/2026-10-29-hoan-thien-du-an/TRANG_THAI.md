# Trạng thái thực thi G0–G7

**Phạm vi hiện hành — giáo viên điều chỉnh ngày 31/10/2026:** hoàn thiện chức năng ra đề giữa học kì cho nhiều môn. Chưa làm nội dung/đề/ma trận cuối HK1 và không tiếp tục đối soát CK1 thật. Dùng dữ liệu minh họa tự soạn để kiểm chức năng. Các yêu cầu CK1 còn xuất hiện trong phần kế hoạch cũ là phạm vi hoãn; chúng không được dùng để tự giao việc tiếp theo. Quyết định này ưu tiên hơn các mô tả cũ; chi tiết tại `docs/BOI_CANH.md`.

**Ưu tiên kế tiếp:** kiểm chứng quy trình giữa học kì đa môn bằng dữ liệu minh họa; xem `VIEC_TIEP_THEO.md`. Các kết quả CK1 bên dưới là lịch sử đối soát, không phải nhiệm vụ đang tiếp tục.


Cập nhật ngày 31/10/2026. Nhánh `ck1-readiness`; các thay đổi có sẵn trước phiên được giữ nguyên.

| Giai đoạn | Kết quả hiện tại | Phần còn lại |
|---|---|---|
| G0 | Đã khảo sát, chạy baseline và đối chiếu hiện trạng | Các phát hiện đã chuyển thành công việc cụ thể |
| G1 | Đã đối soát CK1 thật chỉ đọc theo xác nhận của thầy; 360 câu, Khối 8 có 2 câu cần duyệt lại; nguồn giữ nguyên hash | Đã tích hợp bốn mức và mẫu Word 10/6 cột; xem G1-DA-TICH-HOP-20261031.md. Chưa xác nhận ánh xạ/đủ câu từng ô |
| G2 | Đã tích hợp lọc đáp án lồng, ghi nhật ký phát hành bị chặn và fixture kiểm thử an toàn | Chưa đóng toàn bộ cổng bảo mật/nghiệp vụ |
| G3 | Đã tích hợp lưu 14 trường nháp, tách chủ tài khoản/chương trình/môn/Test; giữ ký tự cuối và YCCĐ sau reload | Chưa thử CK1 thật cùng giáo viên; chưa kiểm đa tab/đồng bộ thiết bị |
| G4 | Đã tích hợp A4 ngang, lề chuẩn, bảng tối đa 24 cm, sửa banner và căn phải số trang; review lần hai đạt | Chuyển Word→PDF thật còn bị quyền macOS chặn; render phụ không thay bằng chứng này |
| G5/C3 | Đã sửa bốn tài liệu và đồng bộ bản sao hướng dẫn sau kiểm hash | Chưa nghiệm thu cùng giáo viên, chưa đóng mốc C |
| G6/G7 | Chưa qua cổng | PostgreSQL, phục hồi staging và triển khai còn phải thực hiện |

## Bằng chứng kiểm thử

Bản mã đã tích hợp trước các ứng viên G1 mới: engine **357 ca**, gồm **346 đạt và 11 bỏ qua**; Django **89/89 đạt**; migration không thay đổi; hai bộ Node đạt. Xem `verification3-engine.log`, `verification4-django.log` và `verification3-migrations/frontend/matrices_frontend.log`.

Một lần Django báo OK nhưng chạy 0 test do snapshot thiếu các tệp package và template. Kết quả đó đã bị loại; các tệp được khôi phục từ nguồn theo hash và Django đã được chạy lại đủ 89 ca. Không tính 0 test hoặc skip là đạt.

## Giới hạn thao tác

Chưa commit hoặc triển khai. Không migrate/restore cơ sở dữ liệu thật, không thay ngân hàng, trạng thái duyệt hoặc ma trận thật. Các bản sửa G1 đã được phát triển trong bản sao cách ly, review và tích hợp ngày 31/10. Ma trận CK1 thật vẫn chưa được nhập/khóa.

## Kiểm chứng mới ngày 31/10

Bản G1 tích hợp: engine 394 ca (383 đạt, 11 bỏ qua), Django 89/89, hai bộ Node đạt, migration không đổi. Sáu nguồn thật giữ nguyên hash. Báo cáo và phần còn lại: `G1-DA-TICH-HOP-20261031.md`. Các số 357 ca phía trên là bản trước G1.

## G1 bổ sung — báo cáo thiếu câu

Đã tích hợp sửa kết luận đủ câu khi chưa đủ căn cứ, liệt kê mọi ý của vị trí nhiều ô. Engine403:392 đạt/11skip, Django89/89, Node2 đạt; migration không đổi. Ba kịch bản trình duyệt giả đạt. Đối soát chỉ đọc CK1 thật tái hiện cả ba candidate trước đây báo đủ sai; nay đều trả chưa đủ căn cứ. Sáu nguồn hash không đổi. Chi tiết `G1-SHORTFALL-DA-TICH-HOP-20261031.md`. Các số engine trước đó là các đợt cũ.

## Đợt giữa kì đa môn đã tích hợp

Báo cáo hiện hành: `../2026-10-31-giua-ki-da-mon/BAN_GIAO.md`. Engine417 đạt/11skip, Django110, browser31 mục đạt. Đây là chức năng dùng chung cho Tin/Toán/Vật lí, không phải tiếp tục nội dung CK1.
