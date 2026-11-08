# Kế hoạch hoạt động của agents

**Phạm vi hiện hành — giáo viên điều chỉnh ngày 31/10/2026:** hoàn thiện chức năng ra đề giữa học kì cho nhiều môn. Chưa làm nội dung/đề/ma trận cuối HK1 và không tiếp tục đối soát CK1 thật. Dùng dữ liệu minh họa tự soạn để kiểm chức năng. Các yêu cầu CK1 còn xuất hiện trong phần kế hoạch cũ là phạm vi hoãn; chúng không được dùng để tự giao việc tiếp theo. Quyết định này ưu tiên hơn các mô tả cũ; chi tiết tại `docs/BOI_CANH.md`.


Ngày lập: 29/10/2026. Người điều phối: Codex trong chat hiện tại, tiếp quản công việc khi Claude hết hạn mức. Phạm vi lần lập này: cấu hình vai trò, sửa hướng dẫn và phân công; các phiếu dưới đây **chưa thực thi**. Không có lịch chạy nền hoặc automation được tạo.

`docs/LO_TRINH.md` vẫn là nguồn duy nhất của mốc sản phẩm. Tài liệu này chỉ phân công thực hiện/kiểm tra các mục đó, không tạo lộ trình sản phẩm thứ hai và không thay xác nhận của giáo viên.

Kế hoạch áp dụng theo giai đoạn để hoàn thiện dự án: [G0–G7: bản cục bộ và bản online](superpowers/plans/2026-10-29-hoan-thien-ngan-hang-de.md). Các phiếu vai trò dưới đây là hợp đồng giao việc dùng trong từng giai đoạn.

## 1. Điểm xuất phát cần xác minh

- Lộ trình ghi B chờ nghiệm thu, nhưng đã ghi nhiều phần C1 triển khai. Nhật ký nói C2/C3 hoàn thành; các mục C2/C3 trong lộ trình chưa tích. Giữ nguyên dấu tích, đối chiếu chứng cứ thay vì tự coi C đã xong hoặc bắt đầu lại.
- Có ghi chép khảo sát GK1 và CK1 khác nhau, có ma trận theo bài và ma trận chi tiết theo YCCĐ. Không kết luận ngân hàng đủ câu chỉ từ tổng số câu hoặc test dùng ma trận đơn giản.
- Mỗi phiếu kiểm thử phải ghi kỳ thi, khối, mã/hash ma trận, nguồn dữ liệu giả và phiên bản mã. Khi chưa chốt kỳ, dùng ca giả để kiểm tra phần mềm; chưa kết luận độ đủ cho kỳ thật.
- Các số test và biên bản cũ là đầu mối tìm bằng chứng, không phải kết quả chạy mới. Không tự chạy migrate `0005` trên dữ liệu thật để làm sạch trạng thái.

## 2. Cách điều phối trong Codex

Codex đọc định nghĩa `.agents/agents/<vai-tro>/agent.md`, sau đó giao qua công cụ subagent có sẵn trong phiên. Không cần Claude hoạt động. Các tệp vai trò và adapter Claude không phải dịch vụ chạy thường trực hay bảo đảm agent được tự đăng ký trong một runtime khác.

Một lượt tối đa ba subagent đồng thời ngoài người điều phối, phù hợp giới hạn phiên hiện tại. Chỉ chạy song song công việc đọc độc lập hoặc ghi vào các tệp được phân chia rõ. Chỉ một agent ghi mỗi tệp, kể cả test dùng chung. Khi test cần sửa sản phẩm, chuyển phát hiện sang agent kỹ sư thay vì reviewer tự sửa và tự nghiệm thu.

Người điều phối giữ `LO_TRINH.md`, `NHAT_KY.md` và tài liệu chung. Agent trả báo cáo về phiên điều phối, không gửi sang chat khác. Hết lượt phải phân biệt đã tạo định nghĩa, đã được giao chạy, đã kiểm tra và đã được giáo viên xác nhận.

## 3. Phiếu công việc từng agent

### TK-01 — thiet-ke-chuc-nang

- **Mục tiêu:** xác định khoảng trống thực sự của C1/C3, tránh xây lại phần đã có.
- **Đầu vào:** lộ trình, bối cảnh, nhật ký, đặc tả C1, `public/app.js`, README và hướng dẫn dùng hiện hành.
- **Việc làm:** lập bảng từng bước giao diện → API → trạng thái lưu → chứng cứ; tách triển khai, kiểm thử và giáo viên xác nhận. Ghi rõ đề nháp có thể chưa gắn đề cương, điều kiện duyệt chính thức; phân biệt nhiều đề khác câu với hoán vị mã.
- **Được ghi:** `acceptance/<ngày>-agents/TK-01.md`; đặc tả/hướng dẫn chỉ sửa khi có phiếu tiếp theo.
- **Tiêu chí đạt:** mọi yêu cầu đang xét truy về quyết định hoặc điều kiện cần xác minh, không tự đổi GK1/CK1 hay đánh dấu mốc. Có danh sách lỗi/tài liệu lệch để giao BE/FE.
- **Phụ thuộc:** khởi đầu; người điều phối dùng kết quả để chốt phạm vi các lượt sau.

### DL-01 — quan-tri-du-lieu

- **Mục tiêu:** kiểm tra phương pháp đối soát độ đủ câu và nhập PPCT/YCCĐ.
- **Đầu vào:** `ppct_import.py`, `tests/test_ppct_import.py`, `tests/test_shortfall.py`, `cloud/tests/test_ppct_import_api.py`; ca ma trận tự soạn có cả ô đủ/thiếu.
- **Việc làm:** kiểm tra ánh xạ theo ô bài × YCCĐ × dạng × mức, câu chưa duyệt không được đếm đủ; thử preview, hash lệch, xung đột YCCĐ đã dùng và câu Đ/S trải nhiều mức. Báo riêng trường hợp engine chưa hỗ trợ.
- **Được ghi:** `acceptance/<ngày>-agents/DL-01.md`; test mới có tên riêng sau khi điều phối phân tệp.
- **Tiêu chí đạt:** mỗi lỗi có dữ liệu giả tái hiện; phân biệt độ đủ theo bài và theo YCCĐ. Không sửa PPCT/ngân hàng thật, không duyệt câu hoặc đổi ma trận đã khóa.
- **Phụ thuộc:** TK-01 cung cấp kỳ/luồng cần xét; phần kiểm tra schema giả có thể làm song song.

### BM-01 — bao-mat-phan-quyen

- **Mục tiêu:** kiểm tra không lộ đáp án và không truy cập xuyên tài khoản/chương trình.
- **Đầu vào:** test quyền đáp án, access, AI security/routes; hai chủ tài khoản và người không có quyền đáp án đều tự tạo trên DB test.
- **Việc làm:** gọi thẳng JSON, DOCX, LMS, ZIP, bảng đối chiếu; kiểm tra trường lồng nhau và audit khi cho phép/từ chối; thử curriculum khác chủ, CSRF, AI mock/quota/draft.
- **Được ghi:** báo cáo `BM-01.md` và test bảo mật mới có phạm vi giao rõ; không sửa sản phẩm.
- **Tiêu chí đạt:** mỗi đường đã kiểm có kỳ vọng và kết quả; thiếu test hoặc route chưa bao phủ ghi riêng. Không coi ẩn nút hoặc phản hồi 403 ở một URL là toàn hệ thống an toàn.
- **Phụ thuộc:** chạy đọc/kiểm tra test độc lập; lỗi chuyển BE-01 và kiểm tra lại sau sửa.

### VH-01 — van-hanh-sao-luu

- **Mục tiêu:** có môi trường kiểm tra tái lập được và diễn tập phục hồi cách ly.
- **Đầu vào:** cấu hình đã loại bí mật, requirements lock, CI, lệnh backup/verify/restore, `cloud/tests/test_backup.py`.
- **Việc làm:** chọn Python có sẵn, kiểm tra dependencies; xác định test DB và nguồn giả; diễn tập backup → verify → restore → đối chiếu dữ liệu giả. Ghi nhánh SQLite/PostgreSQL nào thực sự được kiểm tra.
- **Được ghi:** `VH-01.md`, tài liệu/script vận hành mới khi đã được giao; không tự sửa môi trường toàn máy.
- **Tiêu chí đạt:** có lệnh tái lập và kết quả phục hồi thật trên DB thử; nếu thiếu dependency ghi đúng lỗi. Không migrate, seed, restore, restart hay deploy hệ thống thật trong phiếu này.
- **Phụ thuộc:** kiểm tra môi trường sớm; phục hồi phụ thuộc môi trường thử sẵn sàng. Cung cấp đầu vào cho QA và NT.

### QA-01 — kiem-thu-luong-giao-vien

- **Mục tiêu:** chứng minh luồng giáo viên hoạt động xuyên các bước, tách với test hàm thuần.
- **Đầu vào:** bảng TK-01, fixture DL-01, môi trường VH-01; `tests/test_exam_set.py`, `tests/test_c2_scenarios.py`, `cloud/tests/test_existing_app.py`.
- **Việc làm:** tạo ma trận → đề cương → bộ đề → kiểm tra/khóa → phát hành → xuất; thêm nhánh thiếu câu, nháp chưa đề cương, sửa câu đã duyệt, ngân hàng đổi sau khóa, thao tác lặp, quay lại bước trước và lỗi lưu. Kiểm tra KTTX riêng.
- **Được ghi:** `QA-01.md`, ảnh/log tạm và test hồi quy trong tệp riêng được phân công; không sửa sản phẩm.
- **Tiêu chí đạt:** bảng từng kịch bản có dữ liệu giả, bước, kỳ vọng, thực tế, bằng chứng; tách API/engine/UI. Chưa chạy trình duyệt thì ghi UI chưa kiểm tra. Vùng Test chép dữ liệu thật không thay thế fixture tự soạn.
- **Phụ thuộc:** TK và VH; tiếp nhận kết quả DL/BM khi liên quan; lỗi chuyển BE/FE.

### BE-01 — ky-su-backend

- **Mục tiêu:** sửa lỗi đã được tái hiện từ DL/BM/QA/NV/XU, ưu tiên lộ đáp án, mất dữ liệu, sai điểm/ma trận rồi mới lỗi thuận tiện.
- **Đầu vào:** mỗi lỗi có test/bước tái hiện, hàm nghi ngờ và điều kiện đúng.
- **Việc làm:** viết/chọn test thất bại, sửa tối thiểu, chạy test liên quan engine và Django; giữ snapshot, giao dịch, quyền answers, cảnh báo câu từng dùng. Thay đổi API phải bàn giao cho FE/QA.
- **Được ghi:** các module engine/API/export được nêu trong phiếu lỗi và test liên quan; không cùng ghi public/ với FE.
- **Tiêu chí đạt:** test tái hiện qua sau sửa, có bằng chứng không nới điều kiện nghiệp vụ. Báo phạm vi chưa chạy; không tự tuyên bố nghiệm thu mốc.
- **Phụ thuộc:** chỉ bắt đầu sửa khi đã có lỗi; không dự đoán thay đổi tính năng từ kế hoạch này.

### FE-01 — ky-su-frontend

- **Mục tiêu:** sửa lỗi giao diện/điều hướng/lưu trạng thái đã được xác nhận, không dựng lại wizard sẵn có.
- **Đầu vào:** TK/QA và hợp đồng API BE khi có thay đổi.
- **Việc làm:** sửa đúng màn hình có lỗi, giữ curriculum và CSRF; hiển thị lỗi máy chủ, ô thiếu câu và trạng thái duyệt đúng; cập nhật trợ giúp cùng màn hình.
- **Được ghi:** public/ và test Node liên quan theo phiếu lỗi.
- **Tiêu chí đạt:** hai bộ Node liên quan đạt và thao tác gây lỗi được thử lại nếu có trình duyệt; Node pass không đồng nghĩa UI đã kiểm chứng. Không tính lại quyết định duyệt/phân quyền thay máy chủ.
- **Phụ thuộc:** có lỗi từ TK/QA; có thể song song BE nếu hợp đồng API đã chốt và không ghi chung tệp.

### NV-01 — kiem-dinh-nghiep-vu

- **Mục tiêu:** kiểm tra nghiệp vụ độc lập cho phạm vi sửa.
- **Đầu vào:** quyết định đã chốt, văn bản gốc tại kho pháp lý, mã/test thay đổi.
- **Việc làm:** đối chiếu điểm và làm tròn, tiêu chí đề cương, phủ YCCĐ, vòng đời duyệt, ma trận, KTTX, hoán vị. Phân biệt quy định pháp luật, quy ước tổ và cấu hình tham khảo; không tự chốt các mục đang chờ tổ.
- **Được ghi:** `NV-01.md`, không sửa mã hoặc đọc nội dung đề thật để rà mã.
- **Tiêu chí đạt:** từng kết luận có nguồn/điều khoản hoặc quyết định nội bộ, mã và test; thiếu nguồn ghi chưa xác định. Lỗi chuyển BE, không tự sửa rồi tự xác nhận.
- **Phụ thuộc:** có thể đọc trước; kết luận cuối dựa trên bản mã sau sửa.

### XU-01 — kiem-tra-ban-xuat

- **Mục tiêu:** kiểm chứng bản xuất từ mẫu giả trên đúng nhánh hiện hành.
- **Đầu vào:** rules/ liên quan, fixture đề/đáp án/đề cương/ma trận/mã đề, test export và Word khi kiểm tra PDF.
- **Việc làm:** kiểm tra XML và ảnh từng trang; font/lề/bảng/logo/header/footer; bảng, hình, mã nguồn, công thức; bản học sinh, giáo viên, LMS, ZIP và bảng đối chiếu. Dùng Word chuyển từ chính DOCX, kiểm riêng LaTeX.
- **Được ghi:** tệp giả/ảnh ở tạm và `XU-01.md`; không sửa exports.py hay PDF.
- **Tiêu chí đạt:** mỗi loại/nhánh có bằng chứng hoặc lý do chưa kiểm. Không chạy script cũ đọc DEFAULT_BANK; không dùng PDF XeLaTeX thay nhánh Word. Bàn giao lỗi cho BE.
- **Phụ thuộc:** fixture QA/DL và bản sửa export ổn định; có thể song song NV.

### NT-01 — nghiem-thu

- **Mục tiêu:** tổng hợp bằng chứng mới, xác định phần đủ để giáo viên duyệt và phần còn thiếu.
- **Đầu vào:** toàn bộ báo cáo trên, bản mã được xác định, checklist lộ trình.
- **Việc làm:** chạy độc lập bốn nhóm engine/Django/migration check/Node theo hợp đồng; ghi riêng số đạt/lỗi/skip và log; đối chiếu lỗi đã đóng, ca UI, bản xuất, quyền, phục hồi.
- **Được ghi:** `acceptance/<ngày>-agents/BIEN_BAN.md` cùng log; điều phối tổng hợp nhật ký.
- **Tiêu chí đạt:** không còn lỗi chặn trong phạm vi bàn giao; mọi mục có bằng chứng hoặc trạng thái chưa kiểm/cần giáo viên. Không tích hoàn thành C hay cho dùng đề thật chỉ từ test tự động.
- **Phụ thuộc:** sau sửa và kiểm tra lại; nếu một bộ lỗi vẫn ghi nhận các bộ còn lại, không che kết quả.

## 4. Trình tự các lượt

| Lượt | Vai trò được giao | Điều kiện chuyển |
| :--- | :--- | :--- |
| 0 | Điều phối + TK-01 | Có bảng trạng thái và phạm vi kỳ/ma trận; điểm chưa chốt được ghi rõ |
| 1 | DL-01, BM-01, VH-01 song song | Có fixture/môi trường cách ly, báo cáo lỗi ưu tiên và các thiếu hụt |
| 2 | QA-01; BE/FE chỉ nhận lỗi đã có | Có danh sách lỗi tái hiện, tệp phụ trách và hợp đồng API khi cần |
| 3 | BE-01, FE-01; reviewer lỗi tương ứng kiểm tra lại | Test hồi quy và bước gây lỗi được thử lại; tránh hai agent ghi chung test |
| 4 | NV-01, XU-01, QA kiểm tra lại | Có bằng chứng nghiệp vụ, bản xuất và luồng; giới hạn được ghi đầy đủ |
| 5 | NT-01 + điều phối | Biên bản tổng hợp; chuyển giáo viên các mục cần xác nhận; cập nhật lộ trình khi có đủ quyền và chứng cứ |

Nếu lượt 1 chưa đủ môi trường thì tiếp tục phân tích mã, báo phần chưa chạy; không kết luận đạt hoặc chuyển sang dữ liệu thật để thay thế. Không có hạn giờ cố định hay tự chạy các lượt tương lai sau khi chat đã kết thúc.

## 5. Mẫu phiếu khi bắt đầu thực thi

```text
Vai trò / Mã phiếu:
Mục tiêu và lỗi cần xử lý:
Kỳ / khối / ma trận / phiên bản mã:
Đầu vào, phạm vi dữ liệu giả:
Tệp được đọc / tệp được ghi (chủ sở hữu duy nhất):
Tiêu chí đạt và lệnh/kịch bản kiểm tra:
Phụ thuộc cần chờ:
Nơi trả báo cáo:
Kết quả: chưa chạy / đang làm / đạt kiểm tra / còn lỗi / cần giáo viên.
```
