# Biên bản diễn tập sao lưu và khôi phục (mốc A8)

**Ngày:** 26/10/2026
**Script:** `dien_tap.py`, cùng thư mục với biên bản này.
**Phạm vi:** CSDL cục bộ `cloud/var/development.sqlite3` và tệp nguồn trong `cloud/var/private-media/`. Diễn tập chạy trên **bản sao** đặt trong thư mục tạm, nên dữ liệu thật không bị ghi.

## Cách làm
1. Chụp CSDL thật bằng SQLite Online Backup API, mở ở chế độ chỉ đọc. Chép `private-media` sang thư mục tạm.
2. Chạy migrate trên bản sao, sau đó chạy `backup_local`. Lệnh này tự chạy `verify_backup` sau khi sao lưu.
3. Giả lập sự cố:
   - Xóa một nửa câu hỏi của mỗi ngân hàng.
   - Xóa toàn bộ đề.
   - Xóa tệp nguồn trong CSDL.
   - Xóa 5 ảnh trang trên đĩa.
4. Chạy `restore_local --dry-run` để xem kế hoạch, rồi chạy `--apply`.
5. Sao lưu lần 2. So hash từng tài liệu (câu hỏi, đề, phiên bản, mẫu, ma trận) và từng tệp nguồn với lần 1.

## Kết quả

| Bước | Kết quả |
| :--- | :--- |
| Sao lưu lần 1 | 8 ngân hàng, 47 tệp, `verify_backup` đạt (0 lỗi, 0 cảnh báo) |
| Sự cố giả lập | Mất 211 câu hỏi, toàn bộ đề, 5 ảnh trang trên đĩa (CSDL không có tệp nguồn nào) |
| Dry-run | 5 ngân hàng cần khôi phục; dữ liệu chưa bị ghi |
| Khôi phục và sao lưu lần 2 | `verify_backup` đạt; 79/79 mục khớp hash với lần 1, 0 mục lệch |

**Kết luận:** đạt. Bản sao lưu đầy đủ và nhất quán, khôi phục đúng nguyên trạng.

## Phát hiện trong khi diễn tập
- Mọi tệp Word ma trận và ảnh trang hiện đều nằm **trên đĩa** (`private-media`), không nằm trong CSDL. `read_source` vẫn đọc các tệp này, nên bản sao lưu phải chép cả thư mục đĩa. Đã bổ sung (`disk/<id>/…` trong bản sao lưu) và có test.
- CSDL cục bộ thật **chưa chạy migration `0005_legacystate_test_mode`**. Bản Django hiện tại không chạy được trên CSDL này cho đến khi migrate. Chưa tự migrate dữ liệu thật; việc này cần giáo viên đồng ý (xem mục dưới).

## Giới hạn
- Vòng đời "đề đã phát hành" kèm snapshot hình ảnh thuộc mốc B2, chưa có. Diễn tập dùng các đề đã lưu cùng ảnh trang ma trận. Khi làm xong B2, phải chạy lại diễn tập cho đề đã phát hành.
- Với PostgreSQL (Render/Neon), `backup_local` chỉ xuất JSON và tệp nguồn; bản chụp CSDL dùng pg_dump/Neon (mốc D).
- Chế độ localhost cũ (`start.py`) đọc tệp JSON trong `data/` và ngân hàng thật `DEFAULT_BANK`. Các tệp này nằm trên Google Drive, chưa được `backup_local` bao gồm.

## Việc cần giáo viên xác nhận
- [ ] Đồng ý chạy `manage.py migrate` trên CSDL thật, sau khi chạy `backup_local` trước đó.
- [ ] Xác nhận kết quả diễn tập đúng nghiệp vụ.
