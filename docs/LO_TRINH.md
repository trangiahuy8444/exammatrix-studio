# Lộ trình Ngân hàng đề (kế hoạch V2.1)

> Tệp trạng thái sống, nguồn duy nhất cho việc cần làm. Đánh dấu `[x]` kèm commit khi xong. Chi tiết từng mốc nằm trong kế hoạch V2.1 (đã chép vào đây ngày 28/10/2026, trước đó chỉ nằm ngoài repo).
> Điểm dừng để giáo viên duyệt: cuối mốc A, cuối mốc B, cuối mốc C (trước khi dùng đề thật), trước mốc D.

## Hiện tại

Đợt chức năng giữa kì Tin/Toán/Vật lí ngày 31/10 đã tích hợp và qua kiểm thử phần mềm; xem `../acceptance/2026-10-31-giua-ki-da-mon/BAN_GIAO.md`. Chưa thay các ô nghiệm thu giáo viên.

**Phạm vi hiện hành — giáo viên điều chỉnh ngày 31/10/2026:** hoàn thiện chức năng ra đề giữa học kì cho nhiều môn. Chưa làm nội dung/đề/ma trận cuối HK1 và không tiếp tục đối soát CK1 thật. Dùng dữ liệu minh họa tự soạn để kiểm chức năng. Các yêu cầu CK1 còn xuất hiện trong phần kế hoạch cũ là phạm vi hoãn; chúng không được dùng để tự giao việc tiếp theo. Quyết định này ưu tiên hơn các mô tả cũ; chi tiết tại `docs/BOI_CANH.md`.


**Mốc B được ghi đã triển khai, chờ xác nhận nghiệm thu. Mốc C đã có các phần triển khai và biên bản trong nhật ký, chưa xác nhận toàn bộ mốc.** Phần “chưa sang C” trước đây đã không còn khớp với các mục C1 bên dưới. Các tuyên bố hoàn thành C2/C3 trong nhật ký cần đối chiếu bằng chứng và xác nhận giáo viên; không tự tích các mục còn trống.

Phân công kiểm chứng tại `docs/KE_HOACH_HOAT_DONG_AGENTS.md`; tài liệu đó không thay lộ trình này. Phạm vi GK1/CK1 và độ đủ theo ma trận YCCĐ cần được ghi riêng, không suy từ các lần thử khác kỳ.

Việc cần thầy đồng ý: chạy migrate `0005` trên CSDL cục bộ thật.

Kế hoạch thực thi có phân công agents và cổng nghiệm thu: [Hoàn thiện dự án qua G0–G7](superpowers/plans/2026-10-29-hoan-thien-ngan-hang-de.md). Đã thực thi và tích hợp một phần G1–G4 qua các đợt 30–31/10/2026; chưa thay các dấu xác nhận nghiệm thu của giáo viên. Trạng thái và bằng chứng hiện tại: `acceptance/2026-10-29-hoan-thien-du-an/TRANG_THAI.md`.

## Mốc A — Ổn định nền tảng ✅ (nghiệm thu 26/10/2026)

- [x] A1. Chốt nền, 4 bộ test, không commit dữ liệu thật
- [x] A2. Thống nhất `short_answer`
- [x] A3. Sửa lỗi route, crash, câu SHORT khi xuất
- [x] A4. Xuất đúng mẫu GK1 đã nộp và `rules/`
- [x] A5. Kiểm thử bản xuất 3 tầng (`16a2255`)
- [x] A6. PDF an toàn, xuất từ Word (`a4afc78`, `751bb91`)
- [x] A7. Gemini an toàn (`8a6aef4`)
- [x] A8. Sao lưu cục bộ nhất quán (`b0e0757`, biên bản `acceptance/2026-10-26-A8-sao-luu/`)

## Mốc B — Bảo đảm đề đúng ✅ (chờ nghiệm thu)

- [x] B1. Duyệt câu và duyệt hàng loạt (`a6bef67`, `9f5d052`)
- [x] B2. Vòng đời đề, hash, quyền xem đáp án (`292426d`, `48db621`)
- [x] B3. Chấm điểm theo hồ sơ dạng câu, làm tròn theo loại bài (`123510e`, `6f88fd1`)
- [x] B4. Đối chiếu đề với ma trận từng ô (`df8ffc1`)
- [x] B5. Cảnh báo trùng nguyên văn, câu vừa dùng (`8611466`)
- [x] B6. Tiêu chí đề cương T ≥ 90% (`98514bc`)
- [x] B7. Mã đề hoán vị, bảng đối chiếu (`f1f49f1`)
- [x] B8. KTTX theo TT 22 Điều 6, cụm chuyên đề Điều 6.3 (`f7a90cc`, `85e08d1`)
- [x] B9. Báo cáo thiếu câu theo ô ma trận (`85e08d1`)
- [x] Ngoài kế hoạch: vùng Test (`9f46aac`), nhập PPCT từ Word (`8b89825`)

## Mốc C — Nghiệm thu nghiệp vụ (bắt buộc trước khi dùng đề thật)

- [ ] C1. Quy trình ra đề 6 bước (wizard trong `public/app.js`, dùng lại API). **Sửa theo quyết định của thầy ngày 29/10/2026: thứ tự Ma trận → Đề cương → Đề.** Chọn kỳ → ma trận đã khóa (hoặc chép kỳ trước) → tạo bộ 2–6 đề khác câu, đề cương tự lập = 90% câu của mỗi đề (+ câu bổ sung theo số câu hoặc %) → kiểm duyệt, khóa cả bộ → phát hành đề cương rồi đề → xuất, mã đề. Lưu nháp từng bước.
  - [x] Lõi "Tạo bộ đề" + API `/api/exams/generate-set` + thẻ trên màn hình Tạo đề (29/10/2026, chưa commit)
  - [x] Bảng "Đối chiếu ma trận" khi tự chọn câu đề cương (29/10/2026, chưa commit)
  - [x] Góp ý 30/10: đề cương tự động chỉnh được số câu từng ô / tổng; ma trận & đặc tả dùng được ở màn hình Tạo đề và Đề cương (bảng ô kèm YCCĐ); tạo đề không cần đề cương, gắn đề cương ở bước Kiểm định; vùng Test có ma trận (chưa commit)
  - [x] Duyệt, khóa và phát hành theo cả bộ (`/api/exams/set/transition`); chặn phát đề cương khi bộ đề chưa khóa (`/api/revisions/transition`) (29/10/2026)
  - [x] Wizard 6 bước nối các phần trên (`wizardNav` trong `public/app.js` và điều hướng trực quan) (29/10/2026)
- [ ] C2. Thử chức năng ra đề giữa học kì cho nhiều môn bằng dữ liệu minh họa tự soạn: tạo môn/chương trình, ma trận, ngân hàng, đề cương, đề/bộ đề, mã đề và bản xuất. Bao gồm Tin học và các môn có công thức, hình/bảng hoặc câu tự luận. Không dùng nội dung CK1 làm điều kiện nghiệm thu hiện tại. Kịch bản bắt buộc:
  - [ ] Sửa câu đã duyệt → `needs_review`
  - [ ] Ô ma trận hết câu approved → báo cáo B9 và câu thay thế
  - [ ] Đề có hình, bảng, mã nguồn, công thức
  - [ ] Khôi phục từ bản sao lưu A8
  - [ ] Đề đã phát hành giữ nguyên khi sửa ngân hàng
  - [ ] Tài khoản không có quyền `answers` không xem được đáp án
- [ ] C3. Đồng bộ tài liệu: README, `deploy/README`, `CLAUDE.md`, `HUONG_DAN_SU_DUNG.md` và bản sao trong `../10_Bieu_mau…`

**Phụ thuộc vào giáo viên:** xác nhận quy trình giữa học kì và đầu ra của các môn cần hỗ trợ; các mục "chờ tổ xác nhận" trong `BOI_CANH.md`. Chưa yêu cầu nộp hoặc hoàn thiện nội dung CK1. Kiểm thử phần mềm dùng dữ liệu minh họa, không tự duyệt ngân hàng thật.

**Checklist nghiệm thu mốc C** (ghi biên bản trong `acceptance/`):
- [ ] Mọi câu trong đề chính thức đều approved, đúng phiên bản, truy vết được
- [ ] YCCĐ, dạng, mức độ, điểm khớp ma trận từng ô; phủ YCCĐ 100%
- [ ] Tiêu chí đề cương báo cáo tách "trùng" và "bám sát đã duyệt"
- [ ] Không đáp án trống hay sai cấu trúc; đạt 3 tầng kiểm thử bản xuất
- [ ] Mã đề có bảng đối chiếu chính xác
- [ ] KTTX phân biệt đầu điểm ghi nhận với hoạt động
- [ ] Đề khóa/phát hành giữ nguyên khi ngân hàng đổi, kể cả hình ảnh
- [ ] Gọi thẳng URL/ZIP đáp án khi không có quyền nhận 403 và có nhật ký
- [ ] Sửa đề đã khóa thì mất phê duyệt; phát hành chỉ khi hash khớp
- [ ] Giáo viên tự làm xong 6 bước
- [ ] Sao lưu, khôi phục dữ liệu thật đạt; `verify_backup` đạt

## Mốc D — Sau khi chức năng hiện tại ổn định

**Nghiệp vụ:** trùng ngữ nghĩa; đề song song kèm báo cáo tương đương; thống kê lịch sử dùng câu; độ khó, độ phân biệt từ kết quả học sinh; câu lập trình có chạy test mẫu; kiểm chứng câu AI theo nguồn giáo viên đưa; vòng đời chương trình học.

**Nền tảng online:** dọn lịch sử phiên bản nháp; migrate `0005` trên nhánh Neon; test ghi đồng thời PostgreSQL; sao lưu, khôi phục Neon có diễn tập; khôi phục mật khẩu qua email; phân quyền giáo viên / tổ trưởng / quản trị kèm nhật ký truy cập đáp án (Luật 91/2025, NĐ 356/2025), E2E Playwright trên URL thật; chuyển dần sang mô hình quan hệ; lưu định dạng ở máy chủ, hàng đợi xuất.
