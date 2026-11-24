# Kế hoạch áp dụng đồ thị tri thức và hệ cơ sở tri thức — 24/11/2026

> Trạng thái (24/11/2026): giáo viên yêu cầu triển khai và tự chuyển giai đoạn. **Đã triển khai Giai đoạn 1–5 dạng mô-đun mới, chỉ đọc hoặc chạy song song**, không đổi cách lưu dữ liệu và chưa thay quyết định duyệt đề của mã cũ. Giai đoạn 0 làm một phần (xem bảng dưới).
>
> | Giai đoạn | Trạng thái | Tệp |
> | :--- | :--- | :--- |
> | 0 | Một phần: đã chặn ghi đè hai máy (`4ec7e56`), gom về một nhánh, một kho. **Chưa** gỡ 3 nhánh lưu cũ (nhiều bộ kiểm thử còn dựa vào chúng; trang thật không dùng), **chưa** thử bằng tài khoản Google thật | — |
> | 1 | Đã làm: dựng đồ thị tự động, kiểm câu mồ côi | `public/knowledge-graph.js` |
> | 2 | Đã làm: 23 luật (6 suy ra, 12 chặn, 5 cảnh báo) có căn cứ; chạy song song `verifyExam`, khớp kết luận trên 9 kịch bản | `public/knowledge-rules.js` |
> | 3 | Đã làm: trường "Bài tiền đề" trong PPCT, thứ tự ôn, cảnh báo bài chưa học theo tuần | `knowledge-graph.js`, `knowledge-rules.js`, `app.js`, `firebase-bridge.js` |
> | 4 | Đã làm: bảng phủ YCCĐ × mức độ, nhóm câu gần trùng, gợi ý câu cho ô thiếu (hàm `suggestForCell`, chưa nối vào màn hình ma trận) | `knowledge-graph.js`, `knowledge-ui.js` |
> | 5 | Đã làm: lời nhắc AI kèm ngữ cảnh tri thức; cảnh báo câu nhập lệch PPCT trong hộp xem trước | `table-file-helper.js`, `app.js` |
>
> Giao diện: mục **"🧠 Bản đồ tri thức"** (chỉ đọc) và phần **"Vì sao?"** trong báo cáo kiểm định đề. Kiểm thử: `tests/static_knowledge_graph.test.cjs`, `tests/static_knowledge_rules.test.cjs`.
> Bước tiếp theo cần giáo viên: dùng thử trên dữ liệu thật, tổ xác nhận danh sách luật và căn cứ; sau đó mới cho kho luật thay mã kiểm định cũ.
> Phạm vi: chỉ bản GitHub Pages (quyết định 24/11/2026, `BOI_CANH.md` mục 4). Mọi thứ chạy trong trình duyệt và lưu cùng chỗ với dữ liệu hiện có (Firestore + Google Drive của giáo viên). Không dùng máy chủ đồ thị (Neo4j…).
> Phân biệt: thư mục `graphify-out/` là đồ thị **mã nguồn** cho lập trình. Tài liệu này nói về đồ thị tri thức **môn học và quy tắc kiểm tra đánh giá**.

## 1. Vì sao phù hợp

Dữ liệu của ứng dụng vốn đã là một mạng quan hệ, chỉ đang nằm rải rác trong nhiều bảng:

```
Môn → Khối → Chủ đề → Bài → Yêu cầu cần đạt (YCCĐ) → Năng lực / Chỉ báo
Câu hỏi → (YCCĐ, Mức độ, Dạng câu) → Ô ma trận → Đề cương → Đề → Mã đề
```

Một hệ cơ sở tri thức gồm ba phần: **kho tri thức**, **bộ máy suy diễn**, **phần giải thích**. Ứng dụng hiện có kho tri thức (PPCT, YCCĐ, danh mục năng lực) nhưng quy tắc nghiệp vụ viết cứng trong mã, lại viết hai lần (Python trong `domain/`, `bank_service.py` và JavaScript trong `public/static-*.js`). Lệch giữa hai bản là một nguồn lỗi đã gặp nhiều lần (xem `NHAT_KY.md`).

## 2. Căn cứ

| Nội dung | Văn bản (đã có trong `01_Van_ban_phap_ly_va_Quy_dinh/`) |
| :--- | :--- |
| Chủ đề, bài, yêu cầu cần đạt môn Tin học | TT 32/2018/TT-BGDĐT |
| Khung năng lực số | TT 02/2025/TT-BGDĐT; CV 3456/BGDĐT-GDPT |
| Kiểm tra, đánh giá; KTTX | TT 22/2021/TT-BGDĐT; CV 7991/BGDĐT-GDTrH |
| PPCT, kế hoạch kiểm tra đánh giá | CV 5512/BGDĐT-GDTrH (Phụ lục 1, 3) |
| Quy tắc riêng của trường | `../AGENTS.md`, `../rules/01`–`06` |

Khi đưa một quy tắc vào kho luật (Giai đoạn 2), mỗi luật phải ghi số hiệu và điều, khoản đã đối chiếu trong văn bản gốc. Không ghi theo trí nhớ.

## 3. Thứ tự đề xuất

**0 → 2 → 1 → 3 → 4 → 5.** Giai đoạn 2 giải quyết thẳng gốc lỗi "một quy tắc viết hai lần", nên làm sớm. Giai đoạn 1 có thể làm song song từng phần, vì luật ở Giai đoạn 2 chỉ cần các nút đã có (Bài, YCCĐ, Mức độ, Dạng câu).

---

## Giai đoạn 0 — Điều kiện trước (bắt buộc)

- Sửa xong các lỗi giáo viên đang gặp khi dùng thật.
- Dọn 3 nhánh lưu cũ trong `firebase-bridge.js` (Drive v1, Firestore v1, ngoại tuyến), chỉ giữ Cloud v2.
- Thử chặn ghi đè hai máy (`4ec7e56`) bằng tài khoản Google thật.
- Từ nay sửa trên nhánh riêng, giáo viên thử xong mới gộp vào `main` (push `main` là triển khai ngay).

**Xong khi:** giáo viên xác nhận ba việc chính (ma trận, đề cương, đề) chạy ổn trên dữ liệu thật.

## Giai đoạn 1 — Bản thể học chương trình (ontology)

**Mục tiêu:** một nguồn duy nhất, có định danh ổn định, mô tả chương trình và quan hệ giữa các khái niệm.

- **Loại nút:** `Mon`, `Khoi`, `ChuDe`, `Bai`, `YCCD`, `NangLuc`, `ChiBao`, `MucDo` (Biết, Hiểu, Vận dụng, Vận dụng cao), `DangCau` (MC, YN, SHORT, ES), `CauHoi`, `MaTran`, `DeCuong`, `De`.
- **Loại cạnh:** `thuoc` (Bài thuộc Chủ đề…), `co_yccd`, `phat_trien` (YCCĐ phát triển Năng lực/Chỉ báo), `danh_gia` (Câu hỏi đánh giá YCCĐ), `o_muc_do`, `la_dang`, `nam_trong` (Câu hỏi nằm trong Đề cương/Đề), `can_cu` (Ma trận căn cứ PPCT).
- **Định dạng đề xuất:** JSON bộ ba `{s, p, o}` kèm `id` ổn định (ví dụ `tin:k8:B1:yc2`). Dựng từ PPCT và danh mục năng lực đã nhập, không nhập tay lại.
- **Lưu trữ đề xuất:** thêm một mô-đun mới trong cây Cloud v2 (`cloud-storage-v2.js`, `MODULE_NAMES`), theo khối, chịu cơ chế chặn ghi đè như các mô-đun khác.
- **Công cụ kiểm:** báo câu hỏi "mồ côi" (gắn YCCĐ không có trong đồ thị), YCCĐ không có câu nào, bài không có YCCĐ.

**Xong khi:** đồ thị Tin 8–10 dựng được từ dữ liệu thật; mọi câu đã duyệt đều gắn YCCĐ có trong đồ thị; có `tests/static_*` kiểm.

## Giai đoạn 2 — Kho luật, suy diễn và giải thích (giá trị lớn nhất)

**Mục tiêu:** quy tắc nghiệp vụ thành **dữ liệu**, một bộ máy suy diễn nhỏ chạy chúng, và mỗi lần chặn đều trả lời được "vì sao".

- **Dạng luật** (ví dụ):
  ```json
  {
    "id": "R-THCS-KHONG-DS",
    "neu": [["De", "cap_hoc", "THCS"], ["De", "co_cau", "?c"], ["?c", "la_dang", "YN"]],
    "thi": {"vi_pham": "Đề THCS không dùng câu Đúng/Sai", "muc": "chan"},
    "can_cu": "rules/… (ghi điều, khoản sau khi đối chiếu)"
  }
  ```
- **Bộ máy suy diễn tiến** (forward chaining) viết trong một tệp `public/static-*.js` thuần, không I/O, chạy được cả trong Node để kiểm thử.
- **Phần giải thích:** kết quả gồm luật nào, áp vào câu/ô nào, căn cứ văn bản nào. Giao diện hiện đúng câu tiếng Việt đó thay cho thông báo chung.
- **Thứ tự chuyển luật** (từ dễ, ít rủi ro đến khó): dạng câu theo cấp học → tổng 10 điểm, không trùng câu → phủ YCCĐ 100% → T ≥ 90% từ đề cương → đối chiếu từng ô ma trận.
- **Cách chuyển an toàn:** mỗi luật chạy song song với mã cũ, so kết quả trên dữ liệu mẫu tự soạn và trên bản sao dữ liệu thật; chỉ bỏ mã cũ khi kết quả khớp hoàn toàn.

**Xong khi:** các luật trên nằm trong kho luật; mã cũ tương ứng trong `static-exam-workflow.js` / `static-exam-engine.js` / `static-api.js` đã gỡ; tổ chuyên môn đọc được danh sách luật kèm căn cứ.

## Giai đoạn 3 — Quan hệ tiên quyết và phạm vi kiểm tra

- Thêm cạnh `tien_de` (Bài A là tiền đề của Bài B) và nối Bài với tuần học trong PPCT.
- Suy ra phạm vi từng kỳ (GK1, CK1…): cảnh báo câu thuộc bài chưa học tới kỳ kiểm tra.
- Gợi ý thứ tự ôn trong đề cương theo quan hệ tiền đề.
- Quan hệ tiền đề do giáo viên/tổ xác nhận, ứng dụng không tự suy ra.

**Xong khi:** giáo viên xác nhận quan hệ tiền đề Tin 8–10 và cảnh báo phạm vi đúng với một kỳ thật.

## Giai đoạn 4 — Truy vấn và gợi ý

- Tìm câu tương tự (cùng YCCĐ, cùng khái niệm) để tránh trùng giữa các đề.
- Bản đồ phủ: YCCĐ nào còn thiếu câu ở mức Hiểu, Vận dụng.
- Gợi ý câu thay thế khi ngân hàng thiếu, đúng ô (bài × YCCĐ × dạng × mức độ). Không bao giờ hạ mức độ hay đổi dạng câu để lấp chỗ thiếu.

## Giai đoạn 5 (tùy chọn) — AI soạn câu có căn cứ tri thức (GraphRAG)

- Khi nhờ AI soạn câu nháp, đưa kèm YCCĐ, mức độ, khái niệm lấy từ đồ thị.
- Dùng kho luật Giai đoạn 2 kiểm lại câu AI (đúng YCCĐ, đúng dạng theo cấp học).
- Câu AI luôn là nháp, chỉ vào đề khi giáo viên duyệt. Không gửi dữ liệu học sinh ra ngoài (Luật 91/2025/QH15; NĐ 356/2025/NĐ-CP).

---

## 4. Rủi ro

| Rủi ro | Cách giảm |
| :--- | :--- |
| Thêm một tầng mới khi ứng dụng chưa ổn định | Bắt buộc xong Giai đoạn 0 |
| Kho luật cho kết quả khác mã cũ | Chạy song song, so kết quả, chỉ gỡ mã cũ khi khớp |
| Dữ liệu đồ thị lệch với PPCT/ngân hàng | Đồ thị dựng tự động từ PPCT và câu hỏi, không nhập tay |
| Đồ thị lớn làm chậm trình duyệt | Chia theo khối như cây Cloud v2 hiện có |
| Ghi sai căn cứ pháp lý vào luật | Mỗi luật phải có số hiệu và điều, khoản đã đối chiếu văn bản gốc |

## 5. Gợi ý dùng cho môn học

Giai đoạn 1 + 2 có thể làm bài tập lớn môn "Các hệ cơ sở tri thức": ontology chương trình Tin học, biểu diễn luật, suy diễn tiến, phần giải thích, đánh giá bằng bộ kiểm thử có sẵn của dự án.
