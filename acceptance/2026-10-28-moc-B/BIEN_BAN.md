# Biên bản nghiệm thu mốc B (B1–B9) và hai mục ngoài kế hoạch

- Ngày chạy: 28/10/2026, 22:06–22:15 (giờ máy).
- Người nghiệm thu: agent `nghiem-thu` (chỉ chạy lệnh, không sửa mã, không commit, không chạy migrate trên CSDL thật).
- Mã nguồn: HEAD `8b89825`. Cây làm việc chỉ có các tệp docs/.claude chưa commit (`CLAUDE.md` sửa, `.claude/`, `docs/BOI_CANH.md`, `docs/LO_TRINH.md`, `docs/NHAT_KY.md` mới). `git status` trước và sau khi chạy test giống nhau.
- Môi trường: không có `.venv` trong repo, dùng `~/.venvs/ngan-hang-de-web/bin/python` (Python 3.11.15). Node v26.7.0. Lưu ý: CI và `CLAUDE.md` ghi Python 3.12, lần chạy này là 3.11.
- Bộ Django chạy trên SQLite trong bộ nhớ (`file:memorydb_default`), không chạy bản Postgres 16 như CI.

## 1. Lệnh đã chạy

```sh
PY=~/.venvs/ngan-hang-de-web/bin/python
$PY -m unittest discover -s tests -v                      # engine.log
cd cloud && $PY manage.py test --noinput -v 2             # django.log
cd cloud && $PY manage.py makemigrations --check --dry-run # migrations.log
node tests/frontend.test.cjs                              # frontend.log
node tests/matrices_frontend.test.cjs                     # matrices_frontend.log
```

Nhật ký đầy đủ nằm cùng thư mục (không vào git theo `.gitignore`). Nhật ký chỉ chứa tên test và mô tả test, không có nội dung câu hỏi hay đáp án thật.

## 2. Kết quả từng bộ

| Bộ | Mã thoát | Thời gian | Chạy | Đạt | Lỗi | Bỏ qua |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Engine (`tests/`) | 0 | 166 s (58,6 s chạy test) | 322 | 321 | 0 | 1 |
| Django (`cloud/tests/`) | 0 | 258 s (172,2 s chạy test) | 86 | 86 | 0 | 0 |
| `makemigrations --check --dry-run` | 0 | 1 s | – | `No changes detected` | 0 | – |
| `frontend.test.cjs` | 0 | < 1 s | 7 khối | 7 `PASS` | 0 | – |
| `matrices_frontend.test.cjs` | 0 | < 1 s | 2 khối | 2 dòng đạt | 0 | – |

Không có FAIL, ERROR hay traceback nào trong các nhật ký.

### Test bị bỏ qua

| Test | Lý do (nguyên văn) | Nhận xét |
| :--- | :--- | :--- |
| `test_word_layout.RealWordConversionTests.test_converts_with_vietnamese_text` | `đặt WORD_PDF_TESTS=1 trên máy có Microsoft Word để chạy` | Test chuyển PDF bằng Microsoft Word thật (mục A6, không thuộc mốc B). Chỉ chạy khi bật biến môi trường, vì nó mở Word qua AppleScript. Không tính là đạt. Muốn kiểm, chạy `WORD_PDF_TESTS=1 ~/.venvs/ngan-hang-de-web/bin/python -m unittest tests.test_word_layout` khi thầy đang ở máy có Word. |

Các test dùng nguồn riêng của giáo viên **đều chạy, không bỏ qua** ở máy này: `test_exam_verification` (3/3), `test_matrix_import` (6/6), `test_matrix_exports` (6/6). Các test cần XeLaTeX cũng chạy: `test_export_roundtrip` (8/8), `test_pdf_build` (6/6).

### Ghi nhận nhỏ (không phải lỗi)

`test_shortfall.ShortfallRouteTests.test_service_route` tự chạy một `TextTestRunner` lồng bên trong, nên nhật ký engine có thêm một dòng `Ran 1 test … OK` chen giữa dòng kết quả của test này (dòng 293–297 trong `engine.log`). Test vẫn đạt. Nên đổi sang gọi trực tiếp fixture để nhật ký gọn hơn, nhưng không ảnh hưởng kết luận.

## 3. SHA-256 dữ liệu thật trước và sau khi chạy test

Đã băm 383 tệp: ngân hàng `DEFAULT_BANK`, `cloud/var/development.sqlite3` và toàn bộ 381 tệp `*.json` trong `data/` (kể cả `data/backups/`, `data/matrices/`, `data/test_sandbox/`). Danh sách đầy đủ: `sha_truoc.txt`, `sha_sau.txt`.

**Kết quả: `diff sha_truoc.txt sha_sau.txt` không có khác biệt, khớp hoàn toàn 383/383 tệp.** Test không ghi vào dữ liệu thật.

| Tệp | SHA-256 (trước = sau) |
| :--- | :--- |
| `../06_Kiem_tra_va_Danh_gia/01_Ngan_hang_cau_hoi/03_Ngan_hang_mo_rong_HK1_2026_10_21/NGAN_HANG_CAU_HOI_HK1_V1.json` | `21c155bd4ab77913a59d0dcccc686608c72dc1fc7d39d9394bd8acd54f1f5a6d` |
| `cloud/var/development.sqlite3` | `25baa82bdc62ba81c857c0d78a91549950d9b2da8fca0c2af926d08092fe171d` |
| `data/curricula.json` | `8a4649d369b656d8dc032a2c384d491c1f1ba30042a9aa5a102d9f046a62a7d0` |
| `data/exam_templates.json` | `d5d49abf8cf6d0e6a21877c3c73983e9b5443424ab1a5c19b918ec374803f930` |
| `data/exams.json` (lịch sử đề) | `e4e33b33e0d0545285a7c68a532507470977cea8023852a46a68985a4af109a8` |
| `data/matrices/records.json` | `b7fca1e615645aab130b05b4a9372d3d6520fd7281b57165a9a333f9c0d1eced` |
| `data/revisions.json` | `75ccedd5cdcd569514b3821d2cba6f9792536d66f4e28444eeef13f2d8204dc9` |
| `data/test_sandbox/bank.json` | `a3209f707e84d1c00b1c04c83625943904417181c32377ba9e740d679044f240` |
| `data/test_sandbox/curricula.json` | `8a4649d369b656d8dc032a2c384d491c1f1ba30042a9aa5a102d9f046a62a7d0` |
| `data/test_sandbox/matrices/records.json` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| `data/test_sandbox/records.json` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| 372 tệp `data/backups/*.json` | khớp từng tệp (xem `sha_truoc.txt`) |

## 4. Đối chiếu checklist mốc B

Phân loại: **Đạt** = có test chạy và đạt; **Cần giáo viên** = phải xác nhận đầu ra bằng mắt hoặc theo nghiệp vụ; **Chưa có bằng chứng** = không tìm thấy test. Theo `docs/BOI_CANH.md` mục 1, chức năng chỉ coi là xong khi có test đạt **và** giáo viên xác nhận, nên mọi mục đều còn phần "Cần giáo viên".

| Mục | Test chứng minh (đã chạy, đạt) | Kết luận | Phần giáo viên cần xác nhận |
| :--- | :--- | :--- | :--- |
| B1. Duyệt câu, duyệt hàng loạt (`a6bef67`, `9f5d052`) | `test_review_workflow` 14/14 (không lưu thẳng thành approved, hàng loạt không duyệt được, đủ phiếu 7 mục, trả lại phải có lý do, sửa câu đã duyệt về `needs_review`, câu AI là nháp, câu chờ duyệt không vào đề chính thức); `frontend.test.cjs` "hàng đợi duyệt, phím tắt, phiếu kiểm định, tiến độ" | Đạt + Cần giáo viên | Dùng thử màn hình "Duyệt câu hỏi" (lọc, phím A/R/J/K/E, lịch sử); nội dung 7 mục phiếu kiểm định có đúng yêu cầu của tổ |
| B2. Vòng đời đề, hash, quyền xem đáp án (`292426d`, `48db621`) | `test_exam_lifecycle` 11/11 (đường đi đủ, chặn phát hành khi hash đổi, đề khóa không sửa/xóa, `new_revision`); `test_http` 7/7 (xóa trường đáp án, ghi nhật ký tải ngân hàng); Django `test_answer_access` 5/5 (403 trên mọi đường đáp án, nhật ký từ chối, HS vẫn tải đề); Django `test_backup…test_published_exam_and_page_image_restore_to_approved_hash`; `frontend.test.cjs` "vòng đời đề" | Đạt + Cần giáo viên | Thử nút vòng đời trên giao diện; xác nhận tài khoản nhóm `khong_xem_dap_an` không thấy liên kết đáp án |
| B3. Chấm theo hồ sơ dạng câu, làm tròn theo loại bài (`123510e`, `6f88fd1`) | `test_scoring_decimal` 15/15 (bảng hệ số mặc định, Decimal, ý trống/cả hai là sai, GK/CK đến 0,1, TX đến số nguyên); `test_profiles_integration` 7/7 (THCS từ chối Đ/S trừ khi cho phép, khối 10 nhận Đ/S, hash ma trận cũ không đổi, đề TX làm tròn số nguyên); `matrices_frontend.test.cjs` "mẫu hồ sơ và hệ số Đúng/Sai" | Đạt + Cần giáo viên | Bảng hệ số Đ/S và danh sách dạng câu THCS **còn chờ tổ xác nhận** (BOI_CANH mục 4); xem hướng dẫn chấm Đ/S trong bản xuất |
| B4. Đối chiếu đề với ma trận từng ô (`df8ffc1`) | `test_matrix_checks` 8/8 (ô khớp, lệch mức độ/YCCĐ/điểm, thiếu câu, cảnh báo tỉ lệ CV 7991, TLN dồn sang ĐS, chỉ THPT định kì, ngưỡng biên); `test_b4_integration` 5/5 (ô lệch chặn duyệt, ngưỡng thuộc nội dung khóa) | Đạt + Cần giáo viên | Ngưỡng 0,5 là ngưỡng nội bộ, cần tổ chấp nhận; xem bảng đối chiếu từng ô trong báo cáo kiểm định |
| B5. Cảnh báo trùng nguyên văn, câu vừa dùng (`8611466`) | `test_reuse_warnings` 6/6; `test_b5_integration` 3/3 (cảnh báo không đổi hash, không chặn duyệt; ứng viên đánh dấu câu vừa dùng) | Đạt + Cần giáo viên | Xem nhãn "câu vừa dùng" và ⚠ trên giao diện có dễ hiểu không |
| B6. Tiêu chí đề cương T ≥ 90% (`98514bc`) | `test_revision_criterion` 9/9 (biên 90%, trùng vẫn nhận khi hoán vị, bám sát chỉ tính khi duyệt, chế độ chỉ trùng, điểm % chỉ tham khảo, phủ YCCĐ 100%); `test_b6_integration` 8/8 (dưới 90% chặn duyệt, bám sát cần lý do, đề khóa thì đóng băng); `test_policy_invariants` (đạt) | Đạt + Cần giáo viên | Phép đo quyết định (theo số câu) **còn chờ tổ xác nhận**; thử đánh dấu và duyệt bám sát trên đề mẫu |
| B7. Mã đề hoán vị, bảng đối chiếu (`f1f49f1`) | `test_permutation_mapping` 7/7 (đủ mapping mọi mã đề, 25 hạt giống, phát hiện đổi đáp án/điểm/thiếu câu/Đ/S, không lưu mã đề lỗi, docx và gói ZIP, tải riêng có kiểm quyền); `test_permutations_property` 1/1 (20 hạt giống) | Đạt + Cần giáo viên | Mở `Bang_doi_chieu_ma_de.docx` kiểm khổ ngang, bảng ≤ 24 cm, lặp tiêu đề (nên giao `kiem-tra-ban-xuat`) |
| B8. KTTX theo TT 22 Điều 6, cụm chuyên đề Điều 6.3 (`f7a90cc`, `85e08d1`) | `test_kttx` 15/15 (số ĐĐGtx 2/3/4 theo số tiết, hình thức Điều 6.1, mẫu tên, quy đổi thang 10, chỉ cảnh báo, gắn đề TX cùng khối, cụm chuyên đề tính riêng, hơn 1 cụm thì cảnh báo, cụm chỉ THPT); Django `test_kttx_api` 2/2; `frontend.test.cjs` "số thứ tự KTTX" | Đạt + Cần giáo viên | Đối chiếu tên hồ sơ "Tin {N}_Kiểm tra thường xuyên {k} - HK {I|II}" và bảng tổng quan với sổ thực tế |
| B9. Báo cáo thiếu câu theo ô ma trận (`85e08d1`) | `test_shortfall` 3/3 (đếm theo trạng thái, đủ câu, route dịch vụ); `frontend.test.cjs` "lọc duyệt theo ô ma trận" | Đạt + Cần giáo viên | Bấm "Báo cáo thiếu câu theo ô" trên ma trận thật, kiểm nút mở màn hình Duyệt đúng bộ lọc |
| Ngoài kế hoạch: vùng Test (`9f46aac`) | `test_test_mode` 5/5 (bản sao câu thật, ngân hàng trống thì có câu mẫu tự soạn, sửa trong Test không ảnh hưởng ngân hàng thật, đặt lại, tạo PPCT); Django `test_sandbox` 5/5 (không đụng ngân hàng thường, phạm vi theo giáo viên và khóa học) | Đạt + Cần giáo viên | Thử bật/tắt chế độ Test trên giao diện |
| Ngoài kế hoạch: nhập PPCT từ Word (`8b89825`) | `test_ppct_import` 8/8 (hàng Word thành bài, học kì, chủ đề, lần dạy lặp; bảng không phải PPCT bị từ chối; inspect không ghi; sai sha bị từ chối; YCCĐ đang dùng là xung đột và được giữ; JSON); Django `test_ppct_import_api` 2/2; `frontend.test.cjs` "hướng dẫn theo màn hình" | Đạt + Cần giáo viên | Test chỉ dùng tệp Word **tự tạo** (`sample_docx()`). Cần thầy thử "Kiểm tra" (inspect) với tệp KHDH Phụ lục 1 thật của Tin 8/9/10 và đọc báo cáo trước khi "Áp dụng" |

Không có mục nào ở trạng thái "Chưa có bằng chứng".

## 5. Lỗi

Không có lỗi. Không có đầu ra lỗi để ghi nguyên văn.

## 6. Việc còn lại trước khi đánh dấu mốc B

1. Thầy xác nhận các ô "Cần giáo viên" ở mục 4.
2. Tổ chuyên môn xác nhận: bảng hệ số Đ/S, phép đo quyết định của tiêu chí đề cương, danh sách dạng câu THCS, ngưỡng tỉ lệ 0,5.
3. Nếu muốn, chạy test Word thật (`WORD_PDF_TESTS=1`) trên máy có Microsoft Word.
4. Migrate `0005` trên CSDL cục bộ thật vẫn chờ thầy đồng ý (lần nghiệm thu này không chạy). `makemigrations --check` cho thấy mã và migration đã khớp.
5. Không đánh dấu `[x]` trong `docs/LO_TRINH.md` từ biên bản này. Thầy quyết định sau khi đọc.
