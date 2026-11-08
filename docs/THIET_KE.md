# Giao diện chung cho ứng dụng ngân hàng đề cục bộ

Thư mục ứng dụng mới: `ngan-hang-de-web/` trong workspace. Frontend buildless HTML CSS JS, backend Python thư viện chuẩn và python-docx (runtime đã có). Không chỉnh web-portal hiện có. Bind 127.0.0.1:8765. Dữ liệu gốc do root cung cấp tại `06_Kiem_tra_va_Danh_gia/01_Ngan_hang_cau_hoi/03_Ngan_hang_mo_rong_HK1_2026_10_21/NGAN_HANG_CAU_HOI_HK1_V1.json`.

Bank object: `{schema_version:"1.0.0",metadata:{...},ppct:{sources:[...],lessons:[{grade,lesson_code,lesson_name_source,topic_source,outcomes:[string],occurrences:[{week_raw,periods_raw,...}]}],assessment_and_review_rows:[...]},questions:[...]}`.

Question fields: id, grade(number 8/9/10), type("MC"/"ES"), lesson_code, lesson_name, topic_source, level("Biết"/"Hiểu"/"Vận dụng"), learning_outcome, outcome_index(optional), source_file, source_rows[{table_index,row_index,week_raw,periods_raw}], semester=1, question, review_status("approved"/"content_checked"/"draft"/"archived"), origin("approved_pilot"/"expansion"/"teacher"), response_mode("Trắc nghiệm"/"Tự luận"/"Thực hành"). MC: options[4],correct(integer0..3),option_explanations[4],max_score=1. ES: rubric[{criterion,points}x4],max_score=1,equivalent_answer_policy. Các thuộc tính bổ sung được giữ. Bank không được đặt trong static webroot. PPCT chỉ đọc.

## API
- GET /api/state -> `{bank,exams:[],revisions:[],templates:[]}`. exams/revisions danh sách có id/title/grade/created_at và số lượng, có thể chứa snapshots. templates là nguồn JSON trích từ ma trận gốc, root sẽ cung cấp path `ngan-hang-de-web/data/exam_templates.json`.
- POST /api/questions/save `{question: {...}}` -> `{question,bank}`. ID trống tạo mới. Kiểm tra loại, bài, YCCĐ thuộc nguồn, options đúng4,đápán duy nhất về chỉsố và nội dung khôngtrùng. Tạo/sửa câu của giáo viên thì gắn review_status do họ chọn; mặc định draft.
- POST /api/questions/archive `{id}` -> `{bank}`; archive mềm, không xóa vĩnhviễn.
- POST /api/bank/import `{bank:...}` -> `{bank}`. Validate và sao lưu trước ghi; không cho thay PPCT qua import, chỉ dùng catalog đang có.
- GET /api/bank/export -> JSON attachment.
- POST /api/revisions/save `{title,grade,question_ids:[id]}` -> `{revision}`. Snapshot câu và hash, ID, thờiđiểm. Cần đủ nội dungtrước khi thi; không tựđánhđồng mọi câu bank làđãphát đềcương.
- POST /api/exams/generate `{title,grade,exam_type:"TX"|"GK1"|"CK1"|"GK2"|"CK2",duration,template_id,blueprint:[{lesson_code,type,level,count,points_per_question}],revision_id,seed}` -> `{exam}`. template_id có thì dùng đúng rows locked từ nguồn, không nhận sửa; K8/K10 GK1 bắtbuộc template. TX/custom cho chỉnh rows. Đủ đúng10đ, chọn khôngtrùng, so90%theo hash snapshotđềcương (ít nhất ceil(.9*tổngsốcâu)). Mọi sốkhông đủ phải trả400vớichi tiếtthiếu. Không tựnới mức/bài. Lọc lịch PPCT: GK1 firstperiod<10 (8/9),<20(10); CK1 firstperiod<16(8/9),<32(10); GK2<26/<52,CK2<31/<62. Riêng lockedmatrix đượcchấpnhận bài theo rowsmatrix, kểcả khác mô tảKHDH; kèm notes nguồn. ChỉtạoGK1 K8/K10 khi template supported MC/ES. TF unsupported báo rõ, không tựđổi thànhMC.
- GET /api/exams/{id}/export?format=docx|html|json&answers=0|1 -> attachment. Đề HS khôngchứađápán,rubric,correct,feedbackẩn. BảnGV cóđápán+thangđiểm, mãcâugốc. Word ngang TNR11/12, maxwidth24cm. HTML in qua browser có printstyle.
- GET /api/revisions/{id}/export?format=docx|html -> đềcương từsnapshots, câu hỏi khôngđápán mặcđịnh, mãIDthamchiếu trongGV.

Errors JSON `{error:string,details?:...}`, HTTP400/404/409 đúngngữcảnh. Frontend fetch báo lỗi đẹpngắn. Request mutation check same Origin/local Host chống trangngoài ghi dữliệu. Backup JSON vào `data/backups` trước thay đổi; save bằng atomic temp+replace, khóa ghi. Exam/revision snapshots persist riêng `data/exams.json`, `data/revisions.json`. Không sinh/cài thưviện mới. UI khôngngụytrang PIN là bảo mật mạng; userchọn chỉlocalhost.

## Màn hình
Thanh điều hướng 4/5mục: Tổng quan, Ngân hàng, PPCT, Đề cương, Tạo đề. Ngân hàng cólọcgrade,bài,type,level,status,search; detail panel đápán/rubric/YCCĐ; thêm/sửa/archive; import/exportJSON. PPCT hiển thịtuần,tiết,YCCĐ. Đềcương chọncâu từfilter hoặccheckbox rồi lưu/xuất. Tạođề chọngrade,kỳ,ma trận,đềcương,duration,seed; bảngrows và tổngđiểm; báo thiếu; savedexams,exportHS/GV. KhôngtựđăngLMS/khôngpublish. Responsive desktop/mobile, accessible labels, normalVietnamese, brand #0267B1 and redaccent minimal, readableTNRquestiontext.
