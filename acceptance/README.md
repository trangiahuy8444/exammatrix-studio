# HƯỚNG DẪN & QUY TRÌNH NGHIỆM THU (ACCEPTANCE)

Thư mục này lưu trữ các Biên bản nghiệm thu chính thức cho từng mốc phát triển của dự án Ngân hàng đề (theo `docs/LO_TRINH.md`).

---

## 1. Cấu trúc thư mục nghiệm thu

Mỗi mốc nghiệm thu được lưu trữ trong một thư mục riêng theo quy ước đặt tên:

```
acceptance/
├── README.md
├── 2026-10-26-A8-sao-luu/
│   └── BIEN_BAN.md
└── <YYYY-MM-DD>-<ten_moc>/
    ├── BIEN_BAN.md
    └── [cac_bang_chung_kem_theo] (ảnh chụp màn hình, log kiểm thử...)
```

---

## 2. Quy trình 4 bước lập biên bản nghiệm thu

1. **Bước 1: Chạy kiểm thử tự động toàn diện:**
   - Chạy đủ 4 bộ test (Engine unittest, Django suite, Makemigrations check, Node frontend).
   - Ghi nhận chính xác số test Đạt (Pass), Lỗi (Fail), Lỗi hệ thống (Error) và Bị bỏ qua (Skip).
   - Lưu ý: Các test bị `skipTest` do thiếu dữ liệu mật của giáo viên không được xem là Đạt.
2. **Bước 2: Kiểm tra tính toàn vẹn dữ liệu (Data Integrity):**
   - Đo mã băm SHA-256 của các tệp dữ liệu thật trước và sau khi chạy test để cam kết quá trình kiểm thử không làm biến đổi dữ liệu thật.
3. **Bước 3: Rà soát checklist mốc trong `docs/LO_TRINH.md`:**
   - Đánh giá từng mục: Đã có test chứng minh, Cần giáo viên kiểm tra trực quan, hay Chưa hoàn thiện.
4. **Bước 4: Soạn thảo biên bản & Cập nhật nhật ký:**
   - Tạo tệp `BIEN_BAN.md` theo mẫu bên dưới.
   - Thêm 1 dòng ghi nhận vào đầu tệp `docs/NHAT_KY.md`.
   - **Lưu ý:** Quyền đánh dấu `[x]` vào `docs/LO_TRINH.md` thuộc về giáo viên sau khi xem xét biên bản.

---

## 3. Mẫu Biên bản nghiệm thu chuẩn (`BIEN_BAN.md`)

```markdown
# BIÊN BẢN NGHIỆM THU MỐC: <TÊN_MỐC>

- **Thời gian thực hiện:** <YYYY-MM-DD HH:MM:SS>
- **Người thực hiện:** Agent Nghiệm thu Độc lập (`nghiem-thu`)
- **Mục tiêu nghiệm thu:** Nghiệm thu các hạng mục thuộc Mốc <TÊN_MỐC> trong `docs/LO_TRINH.md`.

---

## 1. Kết quả Kiểm thử Tự động

| Bộ kiểm thử | Lệnh thực thi | Tổng số test | Đạt (Pass) | Lỗi (Fail/Error) | Bỏ qua (Skip) | Thời gian chạy |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| 1. Engine Core | `.venv/bin/python -m unittest discover -s tests` | ... | ... | ... | ... | ...s |
| 2. Django Cloud | `cd cloud && ../.venv/bin/python manage.py test --noinput` | ... | ... | ... | ... | ...s |
| 3. Migration Check | `cd cloud && ../.venv/bin/python manage.py makemigrations --check --dry-run` | - | Đạt | 0 | 0 | ...s |
| 4. Frontend Logic | `node tests/frontend.test.cjs && node tests/matrices_frontend.test.cjs` | ... | ... | ... | ... | ...s |

### Danh sách các test bị bỏ qua (SkipTest) và nguyên nhân:
- `test_exam_verification`: Thiếu tệp hồ sơ gốc bảo mật tại `../06_Kiem_tra_va_Danh_gia/`.
- ...

---

## 2. Kiểm tra An toàn & Toàn vẹn Dữ liệu

| Tệp dữ liệu kiểm tra | SHA-256 Trước kiểm thử | SHA-256 Sau kiểm thử | Kết luận |
| :--- | :--- | :--- | :---: |
| `NGAN_HANG_CAU_HOI_HK1_V1.json` | `...` | `...` | Khớp $100\%$ |
| `cloud/var/assessment.sqlite3` | `...` | `...` | Khớp $100\%$ |

---

## 3. Đánh giá Checklist Hạng mục Mốc

| STT | Tiêu chí nghiệm thu | Bằng chứng / Test chứng minh | Đánh giá | Ghi chú |
| :---: | :--- | :--- | :---: | :--- |
| 1 | Tiêu chí 1... | `tests.test_xyz.TestCase.test_abc` | **ĐẠT** | Đã qua test tự động |
| 2 | Tiêu chí 2... | Kiểm tra trực quan bản xuất DOCX/PDF | **CẦN THẦY DUYỆT** | Bố cục đã khớp mẫu |

---

## 4. Kết luận & Đề xuất

- **Đánh giá chung:** Đạt / Chưa đạt yêu cầu nghiệm thu kỹ thuật.
- **Vấn đề còn tồn đọng (nếu có):** ...
- **Kiến nghị với giáo viên:** Đề xuất giáo viên nghiệm thu thực tế hoặc cho phép chuyển tiếp sang mốc tiếp theo.
```
