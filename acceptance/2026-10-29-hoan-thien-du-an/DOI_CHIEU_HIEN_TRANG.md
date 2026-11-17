# G0 — Đối chiếu hiện trạng C1/C2/C3

- Ngày: 29/10/2026. Vai trò: `thiet-ke-chuc-nang`.
- Nguồn: mã và tài liệu đang có trên đĩa; HEAD tham chiếu `8b89825b9d9d351705ead33f5d1553e668043331`. HEAD không đại diện toàn bộ nội dung chưa commit hiện tại.
- Phạm vi: chỉ đọc mã/tài liệu và ghi báo cáo này; không đọc ngân hàng, đề thật, DB hoặc nguồn tài liệu thi; không gọi mạng, sửa sản phẩm, commit, migrate hay phục hồi dữ liệu.
- Phương pháp: đọc nguồn bằng `rg`, `sed`, `nl`; đối chiếu hợp đồng vai trò, `AGENTS.md`, `docs/QUY_TRINH_AGENTS.md`, BOI_CANH, LO_TRINH, NHAT_KY và kế hoạch G0–G7. Không dùng nhật ký làm bằng chứng chạy độc lập.
- **Không chạy test, UI/trình duyệt, xuất DOCX/PDF hoặc xem trang in trong phiếu này.** Cột “có test” dưới đây nghĩa là đọc được mã ca kiểm thử, không có nghĩa ca đó đã đạt trên phiên bản bàn giao.
- Chưa có xác nhận giáo viên mới trong phiếu này; không thay dấu nghiệm thu C1/C2/C3.

## 1. Kết luận hiện trạng

C1 có mã lõi, API và giao diện cho chuỗi ma trận → đề cương → bộ đề → khóa/phát hành → xuất. Còn thiếu chứng cứ xuyên bước bằng trình duyệt, lưu nháp/reload và xác nhận giáo viên. C2 có các ca kỹ thuật nhưng biên bản cũ dùng phạm vi GK1/KTTX; không thay yêu cầu CK1 ba khối và một KTTX mỗi khối. C3 đã có ba bản hướng dẫn cùng nội dung nhưng nội dung còn sai/lệch chức năng, vì vậy đồng bộ tệp chưa đồng nghĩa đồng bộ nghiệp vụ.

Yêu cầu gốc vẫn là `docs/LO_TRINH.md:42`, `:48`, `:55`; tiêu chí thành công CK1 và giáo viên tự thực hiện ở `docs/BOI_CANH.md:9`. Các mục chờ thầy/tổ xác nhận không được agent tự chốt.

## 2. Bảng bằng chứng C1

| Phần | Đã có mã/API | Đã có mã test | Bằng chứng UI | Giáo viên xác nhận |
| :--- | :--- | :--- | :--- | :--- |
| Chọn ma trận khóa đúng kỳ, hiển thị ô/YCCĐ | `public/app.js:844`, `:848`, `:852`; máy chủ nạp ma trận, bỏ `_matrix` từ client ở `server.py:296` | `tests/test_exam_set.py:187`, `:198` | Có hàm dựng giao diện; chưa chạy UI mới | Chưa có trong phiếu |
| Tự lập đề cương theo từng ô/tổng | `public/app.js:757`, `:763`; `bank_service.py:1169`; `/api/revisions/propose` ở `server.py:301` | `tests/test_exam_set.py:56`, `:62`, `:66`, `:72`, `:219` | Chưa thao tác chia tỉ lệ, đổi ô và lưu/reload | Chưa có trong phiếu |
| Tạo bộ đề lựa chọn câu theo ma trận | `bank_service.py:1185`; `/api/exams/generate-set` ở `server.py:305`; UI `public/app.js:1089`, `:1096` | `tests/test_exam_set.py:80`, `:96`, `:104`, `:118`, `:146` | Chưa tạo bộ trên trình duyệt trong G0 | Chưa có trong phiếu |
| Tạo nháp chưa có đề cương, gắn khi kiểm định | `public/app.js:974`, `:1102`; `bank_service.py:2106`; duyệt bị chặn nếu thiếu đề cương ở `bank_service.py:1499` | `tests/test_exam_set.py:165`, `:204` | Chưa thử nhánh thiếu đề cương → gắn → gửi duyệt | Chưa có trong phiếu |
| Duyệt, khóa, phát hành cả bộ nguyên tử | `bank_service.py:1558`; `server.py:330`; nút/hàm `public/app.js:889`, `:919` | `tests/test_exam_set.py:253`, `:295` | Có UI trong mã; chưa thử rollback, lỗi và thao tác lặp | Chưa có trong phiếu |
| Chặn phát đề cương nếu đề liên kết chưa khóa | `bank_service.py:1596`; `public/app.js:926`; `server.py:335` | Trong `tests/test_exam_set.py:253` có ca chặn rồi phát sau khóa | Chưa thử URL/UI thực tế | Chưa có trong phiếu |
| Sáu bước điều hướng | `public/app.js:860`; được gọi cho đề cương ở `:767` và đề ở `:970` | Node chủ yếu kiểm helper `tests/frontend.test.cjs`, không thay E2E sáu bước | Chưa có bằng chứng UI mới; bước 4–6 cùng trỏ `#exams` | Chưa có trong phiếu |
| Hoán vị mã đề và mapping | API riêng `/api/exams/permute` ở `server.py:315`; mapping xuất ở `server.py:209`; link ZIP `public/app.js:937` | `tests/test_permutation_mapping.py:50`, `:68`, `:102`, `:120` | Chưa tải và đối chiếu mapping qua UI | Chưa có trong phiếu |
| Lưu nháp từng bước/quay lại/reload | Có lưu đề cương rõ ràng `public/app.js:804`, tạo đề có lưu qua API `:1102`; cấu hình đang điền nằm trong `store.examDraft` ở `:7` | Chưa xác định ca lưu nháp toàn wizard qua reload trong các tệp đã đọc | Chưa kiểm; không được khẳng định đã có auto-save | Chưa có trong phiếu |

### Phân biệt bắt buộc: bộ đề khác câu và mã hoán vị

- Bộ đề sinh từ `/api/exams/generate-set`: từng đề được chọn câu từ ô ma trận, ưu tiên câu ít dùng; số đề hiện cho phép **1–6**, không phải cố định 4 (`bank_service.py:1200`).
- Không có bảo đảm mọi bộ đều khác câu hoàn toàn: nguồn nhỏ vẫn tạo và báo `shared_questions`, cảnh báo dùng chung (`bank_service.py:1254`, `:1295`). Có ca test riêng chấp nhận dùng chung ở `tests/test_exam_set.py:96`.
- Hoán vị `/api/exams/permute` là thao tác riêng với một đề nguồn, mặc định bốn biến thể (`server.py:315`). Việc tạo bốn mã 101–104 không chứng minh đã có 2–6 đề khác câu.
- Lộ trình C1 nói 2–6 đề; mã cho 1–6 và cho dùng chung. Đây là chênh lệch cần điều phối ghi rõ phạm vi/đối chiếu quyết định, không tự sửa thành bắt buộc không trùng hoặc nới yêu cầu nghiệm thu.

## 3. Bảng bằng chứng C2

| Kịch bản | Mã/test thực tế đã đọc | Điều còn thiếu cho nghiệm thu |
| :--- | :--- | :--- |
| Sửa câu approved thành needs_review | `tests/test_c2_scenarios.py:36`; lõi có thao tác save qua BankService | Chưa chạy mới, chưa giáo viên thử trên UI |
| Hết câu approved theo ô | `tests/test_c2_scenarios.py:48`; tạo bộ chặn thiếu đúng ô/YCCĐ ở `bank_service.py:1206` | Chưa khảo sát độ đủ CK1 ba khối theo ma trận/hash, chưa thử mở bộ lọc để duyệt/bổ sung qua UI |
| Hình, bảng, mã nguồn, công thức | `tests/test_c2_scenarios.py:68` chỉ thêm câu mẫu có code/bảng, rồi kiểm DOCX lớn hơn 1000 byte ở `:100`, `:104`; có suite bổ trợ `test_word_layout.py`, `test_export_roundtrip.py` | Ca C2 này không chứa hình/công thức và không xem trang. Cần bộ giả đủ dạng, Word→PDF và xem từng trang; không suy từ kích thước DOCX |
| KTTX mỗi khối | `tests/test_c2_scenarios.py:108` kiểm số đầu điểm và lưu hoạt động **khối 8**, không phải ba hồ sơ KTTX đầy đủ | Cần TX khối 8/9/10 xuyên luồng, hồ sơ xuất và xác nhận thầy |
| Snapshot đề phát hành | C2 ở `tests/test_c2_scenarios.py:138` kiểm đề **locked**. Có ca published riêng `tests/test_exam_lifecycle.py:121` | Chưa chạy mới, chưa chứng minh toàn bộ ảnh/tài sản nguồn sau đổi ngân hàng qua luồng giáo viên |
| Không có quyền answers | C2 ở `tests/test_c2_scenarios.py:163` chỉ xuất student DOCX và kiểm ba chuỗi trong `word/document.xml`. Django có URL trực tiếp DOCX/JSON/LMS/ZIP, kiểm 403/audit ở `cloud/tests/test_answer_access.py:52`, `:67`, trạng thái JSON ở `:79` | Chưa chạy mới; cần rà mapping/JSON lồng nhau/curriculum và các định dạng theo ma trận quyền, không coi `answers=False` là test tài khoản |
| Khôi phục | Có ca restore giả và đọc ảnh `cloud/tests/test_backup.py:83`; ca CK1 giả published/hash/ảnh `:155` | Chưa chạy mới, chưa diễn tập G5 bản sao cách ly rồi đăng nhập/đọc/xuất; verify_backup cũ không chứng minh restore dữ liệu thật |

**Điểm dễ nhầm về kỳ:** phần đầu `tests/test_c2_scenarios.py:3` ghi GK1/KTTX nhưng `setUp` ở `:29` gọi `self.request()` kế thừa. Hàm thật `tests/test_backend.py:48` dùng `grade=8, exam_type='TX'`. Vì vậy sáu ca C2 này không phải ba luồng CK1, cũng không phải chứng cứ mới cho ba luồng GK1. Tên đề `CK1 Tin 8` trong helper bộ đề ở `tests/test_exam_set.py:50` cũng đi kèm `exam_type='TX'`; phải nhìn trường kỳ, không nhìn tiêu đề.

Biên bản `acceptance/2026-10-29-C2-thu-nghiem-giao-vien/BIEN_BAN.md` tự ghi GK1/KTTX và agent thực hiện. Nội dung đó là hồ sơ lịch sử, chưa phải xác nhận giáo viên CK1. Không đọc dữ liệu thật trong G0 nên không xác minh lại các số lượng câu/khối được ghi trong nhật ký; các con số ấy không được dùng làm baseline CK1 ở báo cáo này.

Tất cả hàng C2 trên: có nguồn mã test, **chưa có kết quả chạy mới/UI mới/xác nhận giáo viên mới** trong phiếu này.

## 4. C3 — Đồng bộ tệp và độ đúng hướng dẫn

Đã đọc và băm ba tệp hướng dẫn:

| Tệp | SHA-256 |
| :--- | :--- |
| `HUONG_DAN_SU_DUNG.md` | `f8512743203b844f2426e3ac2416463411a8354d8972747b88e50ca07c1db286` |
| `docs/HUONG_DAN_SU_DUNG.md` | `f8512743203b844f2426e3ac2416463411a8354d8972747b88e50ca07c1db286` |
| `../10_Bieu_mau_va_Cong_cu/HUONG_DAN_SU_DUNG_EXAMMATRIX.md` | `f8512743203b844f2426e3ac2416463411a8354d8972747b88e50ca07c1db286` |

Bản sao có tồn tại, ba hàm băm trùng. Các lỗi nội dung vẫn đồng bộ cùng nhau:

| Khoảng trống có nguồn tệp:dòng | Hệ quả / việc cần làm |
| :--- | :--- |
| `README.md:17`: `source .venv/bin/python` | Hướng dẫn kích hoạt môi trường sai đối tượng; sửa tại G5 theo môi trường đã xác minh |
| `README.md:49`, `HUONG_DAN_SU_DUNG.md:27`, `docs/HUONG_DAN_SU_DUNG.md:27` gọi bước tạo bộ là hoán vị 4 mã | Đánh đồng hai thao tác/API; viết rõ số đề khác câu, số mã hoán vị và cảnh báo dùng chung |
| `README.md:50` mô tả chuỗi submit → approve → lock | API chuyển trạng thái có `approve` đưa trực tiếp vào locked (`bank_service.py:1524`), không có action lock cho đề; cần chỉnh hướng dẫn |
| `HUONG_DAN_SU_DUNG.md:30` và bản docs cùng dòng khẳng định trọn bộ 12 tệp Word/PDF, không tràn viền, lề 2 cm | Số tệp tùy cấu hình/biến thể; chưa có bằng chứng xem trang và nội dung lề cần đối chiếu rules. Không nhận là bố cục đã đạt |
| `deploy/README.md:5` khẳng định đầy đủ tính năng Mốc B/C, migration thành công | Vượt kết luận LO_TRINH đang để C1–C3 chưa xác nhận; phải tách môi trường/phiên bản và kết quả kiểm thử, không dùng tài liệu làm chứng cứ DB hiện tại |
| `README.md:6`, hướng dẫn B6 nói Word/PDF nhưng chưa làm rõ giới hạn host tại chỗ thao tác | `pdf_build.py:90` trả lỗi nếu thiếu Word; nhánh online không được hứa xuất PDF sẵn trên máy chủ thiếu Word |
| `CLAUDE.md:37`, `:38` và `README.md:80` ghi cách gọi test theo module/tệp trong khi repo hướng dẫn discover | Chưa chạy các lệnh đó, không kết luận lỗi môi trường. Đồng bộ lệnh được xác minh ở G5 theo `docs/QUY_TRINH_AGENTS.md` |

## 5. Khoảng trống chức năng cần kiểm tra trước khi quyết định sửa

1. **Lưu nháp toàn quy trình:** `store.examDraft` ở `public/app.js:7` khởi tạo lại khi tải trang; các lần dùng localStorage thấy trong app là môn hiện hành, sessionStorage là Test mode. Có lưu bản ghi đề/đề cương nhưng chưa thấy cơ chế lưu tất cả thông số đang điền và vị trí sáu bước. Cần QA thử quay lại/reload, lỗi lưu và kết quả máy chủ; không tự buộc thiết kế wizard mới.
2. **Chỉ báo bước theo dữ liệu:** `wizardNav` tô “đã qua” bằng chỉ số `activeStep` (`public/app.js:875`), gọi cố định 2/3 ở hai màn hình. Chưa chứng minh trạng thái phản ánh ma trận/bộ đề đã lưu; bước 4–6 cùng về `#exams`. Cần kiểm khả năng giáo viên tìm được thao tác và hiểu trạng thái trước khi coi đây là lỗi chặn.
3. **Thứ tự phát hành đề cương rồi đề:** nhãn ở `public/app.js:866` nói thứ tự đó; nút cả bộ ở `:900` xuất hiện khi các đề locked. Nhánh publish đề tại `bank_service.py:1525` kiểm locked/hash, chưa thấy kiểm trạng thái đề cương đã published trong nhánh này. Đây là chênh lệch tĩnh cần test tái hiện và chốt tính bắt buộc, chưa tuyên bố lỗi chạy thực tế.
4. **Đề cương không có đề liên kết:** `bank_service.py:1598` chỉ chặn nếu tìm thấy đề đang drafting/pending; danh sách rỗng đi tiếp published. Cần chốt kỳ vọng cho đề cương độc lập, tránh diễn giải tài liệu “bộ đề căn cứ đã khóa” thành bảo đảm mà mã chưa kiểm trong trường hợp này.
5. **CK1/YCCĐ ba khối và KTTX:** chưa xác minh độ đủ, ma trận khóa/hash và dữ liệu được thầy duyệt. Không thể giải quyết bằng cách đổi nhãn GK1 sang CK1, nới ô ma trận hay tự approved.

## 6. Bàn giao cho điều phối

- G1: xác lập phạm vi CK1, ma trận/hash, độ đủ từng ô và nội dung chờ thầy/tổ; thao tác dữ liệu thật cần phiếu phù hợp.
- G2/G3: test tái hiện tối thiểu cho lưu/reload, nhánh phát hành, atomic/error và quyền; reviewer xác minh trước khi nhận bản sửa. Không suy lỗi từ riêng tài liệu hoặc chạy UI trên dữ liệu thật.
- G4: bộ giả đủ hình/bảng/code/công thức, mapping và bản học sinh; xem từng trang DOCX→PDF; ghi riêng nhánh Word thiếu công cụ.
- G5: giáo viên tự hoàn thành CK1 + KTTX từng khối, sửa nội dung hướng dẫn rồi mới đồng bộ lại ba bản, lập xác nhận riêng.

**Tệp duy nhất ghi:** `acceptance/2026-10-29-hoan-thien-du-an/DOI_CHIEU_HIEN_TRANG.md`. Chưa chạy test/UI; các nhận định là đối chiếu nguồn tĩnh và băm tài liệu, không phải nghiệm thu mốc.
