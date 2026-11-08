# Bối cảnh dự án Ngân hàng đề

> Tệp trạng thái sống. Đọc đầu tiên ở mỗi phiên. Cập nhật khi mục tiêu, căn cứ hoặc quyết định của giáo viên thay đổi.
> Cập nhật: 31/10/2026 — điều chỉnh phạm vi theo giáo viên.

## 1. Mục tiêu

**Chuỗi nghiệp vụ:** Ngân hàng câu hỏi → Kiểm duyệt → Ma trận → Tạo đề → Kiểm tra → Khóa đề → Phát hành → Lưu vết.

**Tiêu chí thành công trước mắt:** hoàn thiện các chức năng để giáo viên **nhiều môn học** tự biên soạn, kiểm định và xuất đề **giữa học kì**, từ thiết lập môn/chương trình, PPCT/YCCĐ, ngân hàng câu hỏi, ma trận, đề cương đến bộ đề và mã đề. Mọi đáp án truy vết được về câu hỏi đã duyệt. Kiểm thử bằng dữ liệu minh họa tự soạn; không yêu cầu có đề hoặc ma trận cuối kì thật.

**Giới hạn hiện tại do giáo viên chốt ngày 31/10/2026:** chưa có đề và ma trận cuối kì; không tiếp tục đối soát, biên soạn, bổ sung ngân hàng hoặc hoàn thiện nội dung CK1. Các đợt đối soát trước là lịch sử, không phải đầu việc tiếp theo. Giữ những bản sửa chức năng dùng chung đã được kiểm thử. Chỉ mở rộng phạm vi sau khi chức năng hiện tại ổn định và giáo viên chốt bước tiếp theo; không tự suy diễn kỳ mở rộng từ câu nhắc cuối.

**Ưu tiên môn đã chốt ngày 31/10/2026:** Tin học → Toán → Vật lí. Chưa đưa Ngữ văn vào lượt triển khai hiện tại.

**Nguyên tắc hoàn thành:** một chức năng chỉ được coi là xong khi có kiểm thử đạt **và** giáo viên xác nhận đầu ra đúng nghiệp vụ.

## 2. Người dùng

- Thầy Trần Gia Huy (Tin học 8, 9, 10, Asian School cơ sở Cao Thắng): người dùng chính, người duyệt.
- Giáo viên môn khác (Toán, Vật lí…): tài khoản riêng trên bản Django, dữ liệu tách theo chương trình.

## 3. Căn cứ pháp lý chi phối

Bản chuẩn chỉ nằm trong `../01_Van_ban_phap_ly_va_Quy_dinh/` (tra `DANH_MUC_VAN_BAN_PHAP_LY.md`). Không chép PDF vào repo.

| Nội dung trong ứng dụng | Căn cứ |
| :--- | :--- |
| Điểm lấy đến 1 chữ số thập phân (GK/CK) | TT 22/2021/TT-BGDĐT, Điều 5 |
| Số ĐĐGtx mỗi học kì 2/3/4 theo số tiết/năm; cụm chuyên đề học tập | TT 22/2021, Điều 6 (khoản 6.1, 6.3) |
| Câu Đ/S 4 ý; tỉ lệ dạng câu và mức độ "khoảng", phụ lục "tham khảo" | CV 7991/BGDĐT-GDTrH |
| Số tiết Tin học (THCS 35, THPT 70) | TT 32/2018/TT-BGDĐT |
| 90% đề lấy từ hoặc bám sát đề cương | Quy định nội bộ `../rules/01` (bổ sung, không thay văn bản Bộ) |
| Dữ liệu tài khoản giáo viên, học sinh | Luật 91/2025/QH15; NĐ 356/2025/NĐ-CP |

## 4. Quyết định đã chốt của giáo viên

| Ngày | Quyết định |
| :--- | :--- |
| 31/10/2026 | Ưu tiên hoàn thiện chức năng hỗ trợ giáo viên nhiều môn làm đề giữa học kì; chưa làm nội dung/đề/ma trận cuối HK1. Kiểm thử bằng dữ liệu tự soạn. |
| 26/10/2026 | Giữ trợ lý Gemini nhưng làm an toàn (khóa chỉ ở biến môi trường, câu AI là nháp) |
| 26/10/2026 | Bản đặc tả theo `rules/02`. Đề chính thức chỉ dùng câu `approved` |
| 26/10/2026 | Cách chấm Đ/S là thiết lập của ma trận. Mặc định hệ số 0 / 0,1 / 0,25 / 0,5 / 1 |
| 26/10/2026 | Tiêu chí đề cương T = (trùng + bám sát đã duyệt) / tổng ≥ 90%, phủ YCCĐ 100% |
| 26/10/2026 | PDF xuất từ chính tệp Word bằng Microsoft Word. Đề cương 3 cột |
| 27/10/2026 | Làm tròn: GK/CK đến 0,1; KTTX đến số nguyên (quy ước tổ 27/10/2026) |
| 26/10/2026 | KTTX dạng câu linh hoạt, vẫn áp tiêu chí đề cương; tên ghi số bài và học kì |

**Còn chờ tổ xác nhận:** bảng hệ số Đ/S; phép đo quyết định của tiêu chí đề cương; danh sách dạng câu cho profile THCS; quy cách câu SHORT trong tệp LMS.

## 5. Ràng buộc

- Dữ liệu thật (ngân hàng, đề, nguồn Word/PDF) không bao giờ vào git. Fixture phải là nội dung tự soạn.
- Ngân hàng thật cục bộ: `../06_Kiem_tra_va_Danh_gia/01_Ngan_hang_cau_hoi/03_Ngan_hang_mo_rong_HK1_2026_10_21/NGAN_HANG_CAU_HOI_HK1_V1.json`. Không đổi tên, không di chuyển.
- Hạ tầng miễn phí: Render free + Neon. Không đề xuất dịch vụ trả phí.
- Repo GitHub riêng tư.

## 6. Thuật ngữ

| Viết tắt | Nghĩa | Trong mã |
| :--- | :--- | :--- |
| PPCT | Phân phối chương trình (KHDH Phụ lục 1) | `ppct` |
| YCCĐ | Yêu cầu cần đạt | `outcomes` |
| MC / ĐS / TLN / TL | Nhiều lựa chọn / Đúng-Sai / Trả lời ngắn / Tự luận | `MC` / `YN` / `SHORT` / `ES` |
| GK, CK | Giữa kì, cuối kì (định kì) | `GK1`, `CK1`… |
| KTTX, ĐĐGtx | Kiểm tra thường xuyên, đầu điểm đánh giá thường xuyên | `kttx` |
| Đề cương | Đề cương ôn tập, phiên bản dùng đối chiếu 90% | `revisions` |
| Mã đề | Bản hoán vị của một đề (101, 102…) | `permutation` |
