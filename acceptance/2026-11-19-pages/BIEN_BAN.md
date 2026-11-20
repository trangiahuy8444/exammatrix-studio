# Kiểm chứng kỹ thuật luồng Pages — 19/11/2026

## Kết quả và phạm vi
Đã sửa mã và kiểm thử luồng ma trận → đề cương → sinh đề thật → gửi duyệt → duyệt/khóa → phát hành đề cương rồi đề → tải DOCX/ZIP, bằng dữ liệu minh họa tự soạn. Chromium kiểm cả đường dẫn gốc và đường dẫn con `/exammatrix-studio/` như Pages. Đây là kết quả trên mã cục bộ; chưa phải kiểm trực tiếp URL triển khai hoặc nghiệm thu đề thật.

Luồng chính đạt trong phạm vi MC, SHORT và tự luận một phần. Các nhánh chưa đủ hỗ trợ trả lỗi cụ thể. Không kết luận toàn bộ ứng dụng đã sẵn sàng dùng chính thức.

## Thay đổi từng phần

### 1. Ma trận, ngân hàng và sinh đề
- Bỏ ma trận trống mặc định hợp lệ, thiếu câu mặc định bằng 0 và ứng viên chỉ lọc theo khối/dạng.
- Kiểm bài/YCCĐ từ PPCT đúng môn và khối, số câu, điểm, kiểu câu, mức độ, năng lực, trạng thái duyệt và phiên bản ma trận. Có báo cáo thiếu thực tế; không đếm câu nháp, câu lỗi kỹ thuật hoặc trùng như nguồn đủ độc lập.
- Sinh đề/bộ đề từ câu thật, không lưu payload thay cho đề. Tạo snapshot câu/ma trận/PPCT/đề cương, tổng 10 điểm và tiêu chí đề cương. Các đề có thể dùng chung câu; báo cảnh báo thay vì khẳng định độc lập.
- Đề cương lưu nội dung câu và giới hạn bài, không chỉ lưu ID. Chặn lưu nội dung câu đã sửa trong đề cương như thể còn trùng ngân hàng.
- Bảng nhập nhanh không áp điểm 0,25 hoặc phần điểm còn lại cho ma trận có phân bố riêng. Những hồ sơ này hiển thị điểm từng vị trí thật, giữ phần chỉnh chi tiết để tránh tái tạo sai khung nguồn.
- Danh mục năng lực phù hợp Tin/Toán/Vật lí được kiểm; không áp mã Toán cho câu Tin hoặc mã Tin cho môn khác. Chromium trọn luồng dùng fixture Tin 9; chưa nghiệm thu nội dung chuyên môn ba môn.

### 2. Duyệt, khóa và phát hành
- Câu mới là nháp; sửa nội dung hoặc thang điểm câu approved làm mất hiệu lực duyệt. Sửa câu approved đang lưu trữ cũng không được khôi phục thẳng về approved.
- Duyệt câu bắt buộc đủ bảy mục checklist và câu trả lời hợp lệ. Bỏ fallback giao diện tự đặt approved hoặc nhập lại cả ngân hàng khi thao tác bị từ chối.
- Đề không rỗng, đủ điểm, truy vết được về câu approved hiện hành, khớp ma trận và đề cương mới được gửi/duyệt. Khóa bằng SHA-256; sửa/xóa đề khóa bị chặn. Muốn sửa phải tạo phiên bản mới.
- Chuyển cả bộ trên bản sao; một thành viên lỗi thì không ghi phần đã chuyển trước đó.
- Chỉ phát hành đề cương khi có các đề căn cứ khóa hợp lệ; chỉ phát hành đề khi đề cương đã phát hành và nội dung khóa còn khớp hash.
- Hoán vị trả về đề mới ở trạng thái đang soạn, giữ đúng đáp án khi đảo phương án và tránh đảo phương án cố định. Không kế thừa phê duyệt đề gốc.
- Tệp nhập được kiểm lại; không tin `verification.passed` hoặc phần trăm tự khai. Đề thiếu bằng chứng không được xác nhận nhập đạt.

### 3. Lưu trữ và tách môi trường
- HTML do Python phục vụ có marker riêng; Django đã có marker workspace. Cầu nối Pages không chiếm API localhost của hai máy chủ này.
- API tĩnh làm việc trên bản sao và tuần tự hóa thao tác. Phản hồi, PPCT và danh sách giao diện tách khỏi dữ liệu gốc; lỗi bộ nhớ không để trạng thái ghi nửa chừng trong phiên.
- Báo đúng lưu cục bộ/chưa đồng bộ; chờ ghi Firestore có giới hạn thời gian. Cache chưa đồng bộ được giữ khi mở lại, không bị bản đám mây cũ ghi đè tự động.
- Đăng nhập mới chỉ nạp cache của UID đó hoặc workspace trống, không nhận ngân hàng của chế độ ngoại tuyến. Đọc đám mây không tự dọn/ghi lại nội dung. Có kiểm thay đổi tài khoản và ghi cục bộ trong lúc đang đọc từ xa.
- Nháp biểu mẫu và định dạng xem trước được tách theo UID/ngoại tuyến. Không ghi email giáo viên vào thông báo đăng nhập console.
- PPCT khối khác không bị lọc bỏ chỉ vì đang đọc/lưu khối đang làm.
- KTTX và reset test chưa hỗ trợ trên Pages không còn trả số 0/thành công giả. Bản Python/Django không bị thay nghiệp vụ này.

### 4. Tệp tải và kiểm thử trước triển khai
- Các liên kết Word và ZIP được xử lý trên Pages bằng tệp OOXML/ZIP thật, kiểm CRC32, XML và dữ liệu đầu vào; không đổi HTML thành `.docx`.
- DOCX học sinh không chứa trường đáp án/rubric/giải thích. JSON học sinh dùng whitelist, không kéo theo snapshot đề cương có đáp án. Hướng dẫn chấm quy đổi điểm theo số điểm thực của câu, chặn thang điểm gốc không khớp rubric.
- A4 ngang, Times New Roman, lề trên/dưới 1 cm, bảng không quá 24 cm được kiểm ở XML. Đề/matrix không chèn logo. Chưa kiểm ngắt trang/hiển thị bằng Word.
- ZIP có đề, đáp án, đề cương, ma trận/đặc tả và báo cáo chỉ rõ thành phần thiếu; đề nháp được đánh dấu. Cảnh báo khi đề cương chưa có logo/banner, không coi đây là hồ sơ hoàn chỉnh theo mẫu trường.
- Workflow Pages thêm job `verify-static`; job xuất bản phụ thuộc kết quả này. Workflow Tests cũng chạy toàn bộ test Pages mới. Chưa chạy Actions trên GitHub trong phiên này.

## Danh sách tệp của đợt Pages
| Tệp | Vai trò/thay đổi |
|---|---|
| `public/static-exam-engine.js` (mới) | Kiểm ma trận, ứng viên, thiếu câu, kế hoạch đề cương, sinh đề/bộ và kiểm snapshot |
| `public/static-exam-workflow.js` (mới) | Checklist, duyệt câu, hash, vòng đời đề/đề cương và bảo vệ khóa |
| `public/static-api.js` (mới) | Điều phối route trên bản sao, lấy bản lưu, commit cả thao tác, hoán vị |
| `public/static-exam-export.js` (mới) | DOCX/ZIP thực, bảng, nội dung/câu hỏi, rubric và tách đáp án |
| `public/static-download.js` (mới) | Xuất học sinh/giáo viên, JSON whitelist và gói hồ sơ, lỗi định dạng rõ |
| `public/firebase-bridge.js` | Nối module, bỏ nhánh giả, marker host, lưu/cảnh báo, cache theo UID, đọc đám mây an toàn |
| `public/app.js` | Nối tải tệp, kiểm nhập thật, bỏ fallback duyệt/ghi lại ngân hàng, đúng khối nháp và scope UID |
| `public/matrices.js` | DOCX Pages, điểm thực của ma trận riêng, năng lực mặc định đúng môn |
| `public/index.html` | Thứ tự nạp module, khu vực trạng thái đồng bộ |
| `server.py` | Marker nhận diện host Python khi phục vụ index |
| `tests/static_api.test.cjs`, `tests/static_bridge.test.cjs` (mới) | Tích hợp, rollback, khóa/phát hành, hoán vị, cách ly, bộ nhớ/đồng bộ, đăng nhập mới |
| `tests/static_exam_engine.test.cjs`, `tests/static_exam_workflow.test.cjs` (mới) | Engine và bất biến vòng đời |
| `tests/static_exam_export.test.cjs`, `tests/static_download.test.cjs` (mới) | OOXML/CRC32, bảng/điểm/privacy, gói và lỗi tải |
| `tests/matrices_frontend.test.cjs` | Hồi quy phân bố riêng không hiện điểm giả định |
| `tests/exam_comparison.test.cjs` | Cập nhật môi trường giả theo cầu nối mới, giữ kiểm so sánh đề đã làm |
| `tests/test_http.py`, `cloud/tests/test_existing_app.py` | Hồi quy marker Python/Django |
| `.github/workflows/tests.yml`, `.github/workflows/deploy-pages.yml` | Nối test Pages và chặn xuất artifact khi test tĩnh lỗi |
| `README.md`, `docs/BOI_CANH.md`, `docs/LO_TRINH.md`, `docs/NHAT_KY.md` | Hướng dẫn, phạm vi, trạng thái và giới hạn |
| `docs/KE_HOACH_ON_DINH_PAGES.md` (mới) | Kế hoạch, rủi ro và phân công |
| `acceptance/2026-11-19-pages/kiem_thu_pages.py` và biên bản này (mới) | Tái chạy trình duyệt và bằng chứng |

Các thay đổi so sánh đề của lượt trước được giữ, gồm `bank_service.py`, `domain/exam_comparison.py`, `public/exam-comparison.js` và các test/tài liệu liên quan. Không reset chúng hoặc `graphify-out/` vốn có trước phiên. Chưa commit nên Git diff đang gồm cả hai đợt.

## Bằng chứng kiểm thử
Nền `935d752`, nhánh `merge-to-studio-main`. Python 3.11, thư viện đúng `cloud/requirements.lock`, CSDL thử trong `/private/tmp/`; không migrate CSDL thật. Không đổi dependencies của ứng dụng.

| Kiểm tra | Kết quả |
|---|---|
| Toàn bộ engine Python | **430 ca: 429 đạt, 1 bỏ qua**, 33,470 giây |
| Toàn bộ Django/SQLite | **110/110 đạt**, 19,040 giây |
| Migration | `No changes detected` |
| Hai bộ Node hiện có | Đạt, giữ cả các ca so sánh đề trước đó |
| `node --test tests/static_*.test.cjs` | **53/53 đạt**: engine 22, workflow 16, export 11, download 2, API 1, bridge 1 |
| Chromium | Luồng thật bằng nút giao diện, tải DOCX/ZIP và mở ZIP/XML; chặn phát hành sớm, thiếu approved và nhập tự khai đạt; snapshot không đổi khi sửa ngân hàng |
| Đường dẫn kiểu Pages | Luồng trên chạy đạt tại `/exammatrix-studio/`; chỉ tài nguyên cục bộ, chặn mạng ngoài |
| Cú pháp JS, `git diff --check` | Đạt |

Các bài API/bridge là kịch bản gồm nhiều kiểm tra, không được cộng số assertion thành số test. Ca Python bị bỏ qua là chuyển Word thật sang PDF theo điều kiện môi trường; không coi là đạt. Các lỗi kiểm thử trước khi sửa (nhánh chưa có, điểm rubric, cache tài khoản mới, khối mặc định, nút ẩn trong kịch bản) đã được tái hiện và xử lý; biên bản chỉ dùng kết quả lượt cuối.

Log cục bộ: `/private/tmp/pages-python-final-20261119.log`, `/private/tmp/pages-django-final-20261119.log`, `/private/tmp/pages-front-final-20261119.log`, `/private/tmp/pages-all-static-20261119.log`. Tệp minh họa: `/private/tmp/exammatrix-pages-20261119/de_hoc_sinh.docx`, `ho_so.zip`, `luong-pages.png`. Đường dẫn tạm có thể bị dọn; kịch bản và fixture trong repo dùng để tái tạo.

## Chưa hoàn thành hoặc chưa kiểm trên dịch vụ thật
- Chưa push/triển khai lên `studio`; chưa kiểm trực tiếp web công khai hoặc kết quả GitHub Actions mới.
- Chưa kiểm Firestore thật, Firestore Rules, ghi nhiều thiết bị đồng thời, phân quyền tổ trưởng độc lập hoặc PostgreSQL. Kiểm lưu/đồng bộ/tài khoản dùng mock.
- Để duyệt/phát hành Pages phải chọn ma trận đã khóa; phân bố tự thiết lập chỉ dùng bản nháp. Chưa sinh đầy đủ YN/câu nhiều phần, close-match bám sát ngữ nghĩa hoặc nội dung có hình/phương trình native; trường hợp chưa đủ bằng chứng bị chặn.
- Chưa có PDF Word, LMS, LaTeX, bảng đối chiếu hoán vị trong ZIP. Không thay bản Python cho các chức năng này hoặc KTTX.
- DOCX từ snapshot không giữ toàn bộ định dạng chỉnh tay trong khung xem trước. Nút `.doc` HTML/Print cũ không phải nghiệm thu DOCX/PDF theo mẫu trường.
- Chưa render/xem từng trang DOCX trong Word; đề cương chưa có logo/banner. Giáo viên cần duyệt mẫu xuất trước khi dùng để nộp/in chính thức.
- Không nhập, sửa, duyệt ngân hàng/đề thật hoặc tự tích nghiệm thu mốc C/D.
