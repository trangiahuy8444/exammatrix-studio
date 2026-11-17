# BE-IMPORT10-01 — Bản xem trước Word ma trận 10 cột / đặc tả 6 cột

Ngày thực hiện: 30/10/2026. Trạng thái: **đã có thay đổi trong bản sao cách ly, chờ rà soát tích hợp; chưa xác nhận nguồn CK1 và chưa đủ điều kiện sinh đề thật**.

## Phạm vi và nơi sửa

Chỉ sửa hai tệp trong bản sao `/private/var/folders/7w/6ywxhf452y10nbjyqkzcxwf40000gn/T/bank-g0-vauvf713/ngan-hang-de-web`:

- `matrices/import_docx.py`.
- `tests/test_compact_matrix_import.py` mới, toàn bộ nội dung minh họa tự soạn.

Mã nguồn ứng dụng trong thư mục Google Drive chưa bị thay bằng bản sao này. Tệp báo cáo hiện tại là phần ghi duy nhất tại dự án nguồn. Không cài gói, không truy cập mạng, không commit. Không gọi thao tác nhận nguồn, lưu hồ sơ, khóa, duyệt hay ghi ngân hàng thật.

## Hành vi đã triển khai

- Nhận đúng tiêu đề cặp ma trận 10 cột và đặc tả 6 cột THCS/THPT. THPT nhận hai hàng tiêu đề; bảng thông tin 2 cột đầu tệp được dùng kiểm tra khối/kỳ, không bị đưa vào hai bảng nguồn.
- Không chấp nhận một bảng chỉ vì có 10 cột. Thiếu/trùng/sai cặp nhận thông báo rõ mẫu `10/6` thay vì cố đọc theo các vị trí của mẫu cũ.
- Trả cùng hợp đồng `candidate`, `raw_tables`, `issues`, `comparison_notes`, `source_sha256`. Giữ nguyên bảng thô, thứ tự/vị trí bảng, mã SHA-256 và tên nguồn đã bỏ phần đường dẫn.
- Mọi hồ sơ compact đều `status=draft`, `mode=received`, `reconciliation.confirmed=False`, có issue `compact_reconciliation_required`. Không tự xác nhận ánh xạ.
- Giữ riêng Biết, Hiểu, Vận dụng, Vận dụng cao. Hiểu/VD gộp trong THPT có issue, không tự gán thành một mức.
- Không dùng độ tương đồng để chọn bài/YCCĐ trong nhánh compact. Chỉ nhận bài khớp tên chính xác duy nhất sau chuẩn hóa tiền tố số bài và dấu; YCCĐ phải khớp nguyên văn chuẩn hóa duy nhất trong PPCT. Mục chưa khớp có issue và chỉ số YCCĐ để trống.
- Dải mã, mã thiếu/không rõ, số lượng gộp và điểm chưa tường minh đều giữ để đối chiếu; không tự mở rộng dải hay chia tổng điểm. Chỉ đối chiếu số học khi đã đọc đủ thành phần, tránh báo nguồn mâu thuẫn từ dữ liệu chưa đọc được.
- Fixture rõ một bài, hai YCCĐ chính xác, MC1/ES1, hai mức Biết/Vận dụng cao và điểm nguồn 0,25/9,75 dựng đúng hai vị trí tổng 10 điểm. Vẫn phải xác nhận đối chiếu. Trường hợp có nhiều câu/ý chỉ ghi tổng điểm hoặc các ý con Đ/S chưa được tự dựng vị trí.
- Nhánh 13/16 cột cũ dùng `LEGACY_LEVELS` ba mức để không bị đọc lệch sau khi mô hình thêm mức thứ tư. Tiêu đề YCCĐ Vận dụng cao trong nhánh cũ bị từ chối rõ, không nhập thành Vận dụng. Không thay các rào kiểm tra ZIP, kích thước tệp, dữ liệu nén và khối.

## Bằng chứng kiểm thử

TDD: chạy fixture tự soạn trước khi sửa, nhận lỗi không nhận dạng mẫu và lỗi thông báo cặp thiếu. Sau đó lần lượt thêm hai ca số học và một ca nguồn chưa đọc đủ, quan sát RED trước khi sửa. Kết quả cuối:

| Lệnh | Kết quả |
| --- | --- |
| `python3 -m unittest discover -s tests -p test_compact_matrix_import.py` | 11 test đạt |
| `python3 -m unittest discover -s tests -p test_matrix_four_levels.py` | 8 test đạt, gồm hồi quy Word 3 mức do agent G1-LEVEL4 viết |
| `python3 -m unittest discover -s tests -p test_matrix_model.py` | 10 test đạt |
| `python3 -m unittest discover -s tests -p test_matrix_import.py` | 6 test bỏ qua vì không có nguồn/danh mục riêng trong bản sao |
| `python3 -m py_compile matrices/import_docx.py tests/test_compact_matrix_import.py` | Đạt |
| `python3 -m unittest discover -s tests` | 381 test; 0 failure, 18 error, 11 skip |

18 error của toàn bộ bộ kiểm thử đều dừng tại bước mở cổng nội bộ với `PermissionError: [Errno 1] Operation not permitted`; không phải assertion lỗi nhập ma trận. Chưa tuyên bố toàn bộ hệ thống đạt. Các test lỗi cụ thể:

- `test_ai_security.SaveDraftsHttpTests.test_ai_questions_are_forced_to_draft_with_ai_origin`.
- `test_ai_security.SaveDraftsHttpTests.test_save_drafts_rejects_editing_existing_question`.
- `test_ai_security.SaveDraftsHttpTests.test_status_route_reports_configuration_without_key`.
- `test_http.AnswerAuditHttpTests.test_bank_export_is_logged`.
- `test_http.AnswerAuditHttpTests.test_redaction_removes_all_answer_fields`.
- `test_http.HttpTests.test_api_archive_save_revision_generate_and_export_roundtrip`.
- `test_http.HttpTests.test_cross_origin_and_nonlocal_host_cannot_mutate`.
- `test_http.HttpTests.test_errors_have_json_details_and_no_static_directory_listing`.
- `test_http.HttpTests.test_malformed_domain_fields_are_validation_errors_not_server_failures`.
- `test_http.HttpTests.test_state_and_static_available_without_exposing_bank_file`.
- `test_matrix_http.MatrixHttpTests.test_matrix_roundtrip_and_export_over_http`.
- `test_matrix_http.MatrixHttpTests.test_unsafe_origin_bad_base64_and_source_path_cannot_be_used`.
- `test_test_mode.TestModeIsolationTests.test_empty_live_bank_gets_self_written_sample`.
- `test_test_mode.TestModeIsolationTests.test_reset_sandbox_restores_fresh_copy`.
- `test_test_mode.TestModeIsolationTests.test_sandbox_copies_live_matrices_without_touching_them`.
- `test_test_mode.TestModeIsolationTests.test_test_mode_mutations_do_not_affect_live_bank`.
- `test_test_mode.TestModeIsolationTests.test_test_mode_ppct_creation`.
- `test_test_mode.TestModeIsolationTests.test_test_mode_starts_with_copy_of_live_questions`.

## Đối soát chỉ đọc ba DOCX CK1 thật

Đọc trực tiếp ba tệp `KHOI N - MA TRAN VA DAC TA CUOI HK1 2026-2027.docx` trong các thư mục kiểm tra khối 8/9/10. Chỉ gọi hàm xem trước trong bộ nhớ. Không đưa nội dung YCCĐ/câu hỏi/đáp án thật vào fixture, log hoặc Git. Dùng PPCT trống để không đọc thêm ngân hàng thật; vì vậy các issue ánh xạ không phải kết luận danh mục PPCT thật sai.

| Khối | Mẫu / kỳ | Bảng giữ | Nhóm bài / hàng YCCĐ xem trước | Vị trí dựng | Xác nhận | SHA-256 trước và sau |
| --- | --- | --- | --- | --- | --- | --- |
| 8 | THCS / CK1 | 2 | 4 / 11 | 0 | false | `a26940335e56716c29938de32c5b6aa0705fcaf7eafce803173c80b0ed7afe9c` |
| 9 | THCS / CK1 | 2 | 4 / 11 | 0 | false | `3313c44af2698d31f50d1da00e2025f292b5c3fbbaac128bab6110ade0f7628c` |
| 10 | THPT / CK1 | 2 | 3 / 9 | 0 | false | `35f1778b9c94780797654b8686806ebfbdb4681f8157e781c5a06752d785fab0` |

Cả ba hash không đổi. Khối 8/9 có các nhóm issue đối chiếu ánh xạ, mã và số lượng chưa rõ; khối 10 thêm điểm và mức Hiểu/VD chưa rõ. Không có khẳng định mâu thuẫn số học từ phần chưa đọc đủ. Không có thao tác ghi dữ liệu thật.

## Giới hạn và phụ thuộc cần nghiệm thu tiếp

- Thay đổi này giải quyết nhận dạng/xem trước mẫu nguồn mới và một trường hợp ánh xạ hoàn toàn rõ. Chưa hoàn thành ánh xạ ba ma trận CK1 thật; không hứa tự sinh đề từ các hồ sơ đó.
- Chưa hỗ trợ tự chia một ô nhiều câu/ý thành điểm từng vị trí, tự mở rộng dải mã, suy quan hệ bài nhóm, chia YCCĐ gộp hay chia Hiểu/VD. Các trường hợp này cần thầy xác nhận tường minh qua luồng đối chiếu.
- Năng lực/chỉ báo không có cột riêng ở compact và chưa có quy trình đối chiếu bổ sung trong thay đổi này. Không coi các giá trị mặc định mô hình là xác nhận nguồn.
- Cần reviewer kiểm tra mã trước khi tích hợp hai tệp từ bản sao. Mô hình 4 mức, giao diện và bản xuất thuộc G1-LEVEL4; báo cáo này không thay kết quả nghiệm thu các phần đó.
- Cần chạy lại các kiểm thử HTTP trong môi trường cho phép mở cổng nội bộ và các ca tích hợp Word cũ khi có nguồn riêng. Không bỏ qua hạn chế này để tuyên bố toàn bộ dự án đạt.
