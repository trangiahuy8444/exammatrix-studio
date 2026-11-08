# BÁO CÁO RÀ SOÁT NGHIỆP VỤ & ĐỘ ĐỦ CÂU HỎI CUỐI KỲ 1 (KHỐI 8, 9, 10)

> Người thực hiện: Agent `kiem-dinh-nghiep-vu` (Chuyên viên Khảo thí & Nghiệp vụ Sư phạm)  
> Ngày thực hiện: 29/10/2026  
> Căn cứ pháp lý & hồ sơ: Thông tư 22/2021/TT-BGDĐT, Công văn 7991/BGDĐT-GDTrH, Thông tư 32/2018/TT-BGDĐT, Quy chế Asian School (`../rules/`), Hồ sơ Ma trận & Đặc tả CK1 tại `../06_Kiem_tra_va_Danh_gia/`.

---

## 1. Tổng quan Hiện trạng Ngân hàng Số hóa (`NGAN_HANG_CAU_HOI_HK1_V1.json`)

Hệ thống web hiện đang nạp trực tiếp dữ liệu từ `NGAN_HANG_CAU_HOI_HK1_V1.json` với tổng cộng **360 câu hỏi**:
- **Khối 8:** 120 câu (100 MC, 20 ES) — 118 câu `approved`, 2 câu `needs_review`.
- **Khối 9:** 120 câu (100 MC, 20 ES) — 120 câu `approved`.
- **Khối 10:** 120 câu (100 MC, 20 ES) — 120 câu `approved`.

> [!IMPORTANT]
> **Phát hiện quan trọng:** Trong tệp JSON hiện hành, **100% câu hỏi là dạng MC (nhiều lựa chọn) và ES (tự luận)**, hoàn toàn **CHƯA CÓ câu hỏi dạng YN (Đúng/Sai)**. Trong khi đó, các câu hỏi Đúng/Sai của Khối 8 và Khối 9 đã được thầy biên soạn hoàn chỉnh trong các tệp Word `NganHang_Khoi_8_DungSai.docx` và `NganHang_Khoi_9_DungSai.docx`.

---

## 2. Đối chiếu Chi tiết Từng Khối Lớp với Ma trận Cuối Kỳ 1 (CK1)

### 2.1. KHỐI 9 — Đạt $\approx 90\%$ Chuẩn Ma trận CK1

Ma trận chính thức tại `Tin 9_Cuối kỳ I_Ma trận.docx` yêu cầu cấu trúc chuẩn:
- **Phần 1: 12 câu MC** (8 Biết + 4 Hiểu) = 3,0 điểm.
- **Phần 2: 4 câu YN (Đúng/Sai)** gồm 16 ý (8 Biết + 4 Hiểu + 4 Vận dụng) = 4,0 điểm.
- **Phần 3: 3 câu ES (Tự luận)** (1 Hiểu + 2 Vận dụng) = 3,0 điểm.
- **Tỉ lệ mức độ nhận thức:** Biết $40\%$ ($4,0$ đ), Hiểu $30\%$ ($3,0$ đ), Vận dụng $30\%$ ($3,0$ đ).

#### Bảng đối chiếu từng ô kiến thức:
| Nội dung kiến thức | Dạng câu | Mức độ | Số câu Ma trận cần | Số câu Approved hiện có | Đánh giá & Khuyến nghị |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Chủ đề A (Bài 1):** Thế giới kỹ thuật số | MC | Biết | 1 câu | 4 câu | **ĐỦ** (Dư 3 câu dự phòng) |
| **Chủ đề C (Bài 2, 3):** Thông tin giải quyết vấn đề | MC | Biết | 1 câu | 7 câu (B2: 4, B3: 3) | **ĐỦ** |
| | MC | Hiểu | 1 câu | 8 câu (B2: 4, B3: 4) | **ĐỦ** |
| **Chủ đề D (Bài 4):** Pháp lý sử dụng Internet | MC | Hiểu | 1 câu | 6 câu | **ĐỦ** |
| **Chủ đề E (Bài 5, 6):** Phần mềm mô phỏng | MC | Biết | **6 câu** | **4 câu** (Bài 5: 4, Bài 6: 0) | ⚠️ **THIẾU 2 CÂU BIẾT** (cần bổ sung hoặc duyệt thêm 2 câu Biết) |
| | MC | Hiểu | 2 câu | 6 câu (B5: 4, B6: 2) | **ĐỦ** |
| **Phần Đúng - Sai (4 câu chùm):**<br>- Câu 1: Chủ đề A (Bài 1)<br>- Câu 2: Chủ đề C (Bài 2)<br>- Câu 3: Chủ đề E (Bài 5/6)<br>- Câu 4: Chủ đề E (Bài 7/8) | YN | Biết: 8<br>Hiểu: 4<br>VD: 4 | 4 câu chùm (16 ý) | **0 câu** trong JSON web | ⚠️ **ĐÃ CÓ SẴN** trong file `NganHang_Khoi_9_DungSai.docx` (đúng 4 câu này luôn), chỉ cần nạp vào hệ thống web. |
| **Phần Tự luận (3 câu):**<br>- Câu 1: Chủ đề D (Bài 4)<br>- Câu 2: Chủ đề E (Bài 7/8)<br>- Câu 3: Chủ đề E (Bài 7/8) | ES | Hiểu: 1<br>VD: 2 | 3 câu (3,0 đ) | Bài 4: 2 câu VD<br>Bài 7: 2 câu VD<br>Bài 8: 3 câu VD | ⚠️ **THIẾU 1 CÂU ES MỨC HIỂU** ở Bài 7/8 (hiện toàn bộ câu tự luận đều gán mức Vận dụng). |

---

### 2.2. KHỐI 8 — Lệch Định hướng Phân phối Chương trình Giữa Ma trận & Ngân hàng

Ma trận tại `Tin 8_Cuối kỳ I_Ma trận.docx` yêu cầu cấu trúc:
- **Phần 1: 12 câu MC** (8 Biết + 4 Hiểu) = 3,0 điểm.
- **Phần 2: 4 câu YN (Đúng/Sai)** (16 ý) = 4,0 điểm.
- **Phần 3: 3 câu ES (Tự luận)** (1 Hiểu + 2 Vận dụng) = 3,0 điểm.

#### Vấn đề không đồng nhất giữa Ma trận và Ngân hàng số hóa:
1. **Trong Ma trận CK1 (`Tin 8_Cuối kỳ I_Ma trận.docx`):**
   - Chủ đề 4: Xử lí dữ liệu bằng bảng tính điện tử (Bài 5, 6, 7) $\rightarrow$ chiếm $40\%$ ($4,0$ điểm).
   - Chủ đề 4: Soạn thảo văn bản và trình chiếu nâng cao (Bài 8a, 9a, 10a, 11a) $\rightarrow$ chiếm $20\%$ ($2,0$ điểm).
2. **Trong Ngân hàng số hóa hiện tại (`NGAN_HANG_CAU_HOI_HK1_V1.json`):**
   - Không chứa câu hỏi về Bảng tính hay Soạn thảo nâng cao.
   - Thay vào đó, ngân hàng chứa 73 câu hỏi về **Chủ đề F: Lập trình trực quan Scratch (Bài 12, 13, 14, 15, 16)**!
3. **Nguồn dữ liệu thực tế ngoài thư mục:**
   - Trong `Khoi_8/Theo_Bai/`, thầy ĐÃ BIÊN SOẠN sẵn 2 tệp:
     * `Chủ_đề_4__Xử_lí_dữ_liệu_bằng_bảng_tính.docx` (8 câu chuẩn LMS)
     * `Chủ_đề_5__Soạn_thảo_văn_bản__Trình_chiếu_nâng_cao.docx` (12 câu chuẩn LMS)
     * `NganHang_Khoi_8_DungSai.docx` (đủ các câu Đúng/Sai cho CK1).

> [!TIP]
> **Quyết định chuyên môn cần thầy xác nhận:**
> - **Phương án A (Theo Ma trận đã nộp):** Chuyển câu hỏi từ `Chủ_đề_4_bảng_tính.docx` và `Chủ_đề_5_soạn_thảo.docx` vào ngân hàng câu hỏi để tạo đề theo đúng ma trận `Tin 8_Cuối kỳ I_Ma trận.docx`.
> - **Phương án B (Theo Ngân hàng Scratch hiện có):** Hiệu chỉnh Ma trận CK1 Khối 8 chuyển sang kiểm tra phần Lập trình trực quan Scratch (Bài 12–16) phù hợp với thực tế giảng dạy của tổ.

---

### 2.3. KHỐI 10 — Cần Thống nhất Khung Ma trận CK1 Chính thức

- **Hiện trạng Ngân hàng:** Đang có **120 câu hỏi** chất lượng cao (100 MC, 20 ES) phủ đều 3 mảng kiến thức lớn:
  1. *Chủ đề A, B, D (Tin học & Xã hội, Mạng, Pháp luật số - Bài 1, 2, 7, 8, 9, 10, 11):* 49 câu.
  2. *Chủ đề E (Thiết kế đồ họa Inkscape - Bài 12, 13, 14, 15):* 35 câu.
  3. *Chủ đề F (Lập trình Python - Bài 16, 17, 18, 19, 20):* 36 câu.
- **Tình trạng Hồ sơ Khảo thí:** Chưa có tệp Ma trận CK1 chính thức trong thư mục `04_De_kiem_tra_Khoi_10/` (hiện mới có hồ sơ Giữa kỳ I và KTTX).
- **Kiến nghị:** Thầy và tổ bộ môn cần chốt khung Ma trận CK1 Khối 10 (tỉ lệ điểm giữa Đồ họa Inkscape và Lập trình Python) để hệ thống tạo ma trận chuẩn và sinh đề tự động.

---

## 3. Danh mục 2 Câu hỏi Trạng thái `needs_review` ở Khối 8

Trong `NGAN_HANG_CAU_HOI_HK1_V1.json`, có đúng 2 câu bị đánh dấu `needs_review` cần thầy bấm phê duyệt trên giao diện:
1. `B1_MC_...`: Bài 1 Khối 8, mức Hiểu (do nội dung câu hỏi có chỉnh sửa phiên bản).
2. `B16_MC_...`: Bài 16 Khối 8, mức Biết.

Sau khi thầy duyệt 2 câu này, ngân hàng Khối 8 sẽ đạt $100\%$ `approved` (120/120 câu).

---

## 4. Kế hoạch Hành động Đề xuất (Action Plan)

1. **Bước 1 (Ưu tiên cao nhất - Khối 9):**
   - Bổ sung 2 câu MC mức Biết cho Bài 5/6 (Phần mềm mô phỏng).
   - Nạp 4 câu Đúng/Sai từ `NganHang_Khoi_9_DungSai.docx` vào hệ thống.
   - $\rightarrow$ **Khối 9 hoàn toàn đủ $100\%$ điều kiện sinh trọn bộ đề CK1 ngay lập tức.**
2. **Bước 2 (Khối 8):**
   - Thầy xác nhận chọn Phương án A (Bảng tính + Soạn thảo) hay Phương án B (Lập trình Scratch).
   - Đồng bộ dữ liệu câu hỏi tương ứng vào hệ thống web.
3. **Bước 3 (Khối 10):**
   - Thiết lập Ma trận CK1 Khối 10 trên hệ thống (dựa trên 35 câu Đồ họa và 36 câu Python đã có sẵn).
