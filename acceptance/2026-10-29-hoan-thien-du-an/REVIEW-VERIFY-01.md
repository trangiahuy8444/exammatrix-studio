# REVIEW-VERIFY-01 — 31/10/2026

## Kết luận

Chưa thông qua bản đóng băng đầu tiên. Hai trường hợp vẫn có thể kết luận đạt khi bằng chứng điểm từng ý không đúng hoặc còn thiếu. Đã báo trực tiếp điều phối và tác giả; reviewer không sửa mã.

## Phát hiện cần sửa

### [P1] Tổng điểm từng câu không đối chiếu với các ý — docx_exam_importer.py:822–826

Hai câu ES có điểm câu lần lượt 5/5; mỗi câu một ý cùng mức Vận dụng, nhưng điểm ý lần lượt 10/0. Ma trận có hai slot ES, mỗi slot một ý 5 điểm. Đề cương chứa đúng hai câu. Kết quả hiện tại `passed=True` và nhận xét mọi kiểm tra đạt vì tổng toàn đề theo câu và theo ý đều bằng 10. Điểm từng câu mâu thuẫn với cấu trúc ý nhưng bù trừ nhau. Cần kiểm tổng điểm ý bằng điểm câu cho từng câu trước khi chấp nhận phân bố mức độ; đồng thời từ chối điểm âm/không hữu hạn thay vì cộng vào tổng.

### [P2] Thiếu điểm ý Đ/S vẫn tự gán 0,25 — docx_exam_importer.py:819–821

Một slot YN gồm bốn ý × 0,25; câu YN điểm 1 có bốn statements với mức Biết nhưng không có trường điểm. Kết quả vẫn `passed=True` nhờ `st.get('points', 0.25)`. Chưa có bằng chứng điểm từng ý; hàm tiếp tục suy định mặc định thay vì yêu cầu bổ sung. Cần dùng điểm được khai báo hoặc cách phân bổ được chính sách chấm của hồ sơ chứng minh; nếu thiếu thì ghi vấn đề và chưa đạt.

## Phần đã kiểm đúng

Bản sửa bỏ phép thay actual bằng expected khi đủ số MC; mức thiếu/không rõ không tự thành Biết; VDC tách riêng; phân bố mức độ tham gia điều kiện `passed`; không còn nhận xét 100% theo khối/mã đề. ES không tự sinh ba ý cho Khối 10 và ES có ý thiếu mức/điểm bị từ chối. Sáu test mới bao phủ các trường hợp này.

## Kiểm thử và giới hạn

Đã chạy bộ `test_matrix_verification_truth`, `test_matrix_four_levels`, `test_policy_invariants`: 35/35 đạt (3,024 giây). Một lệnh trước đó gọi nhầm module không tồn tại `test_policy_gates`, bị loại khỏi bằng chứng đạt. Hai probe độc lập trên dữ liệu giả tái hiện được `passed=True` cho phát hiện trên. Không đọc/ghi dữ liệu thật. Không mở rộng kết luận sang đối chiếu từng YCCĐ/slot, phần này vẫn là giới hạn đã ghi rõ của tác giả.

## Bổ sung review R2 — 31/10/2026

Thông qua riêng hai lỗi chặn đã nêu: tổng điểm ý ES/YN hiện được kiểm với điểm của chính câu hỏi; điểm thiếu, bool, âm, 0 hoặc không hữu hạn bị từ chối. Điểm mặc định 0,25 của ý YN đã được bỏ; thiếu bằng chứng không còn được kết luận đạt.

Đã đọc lại hai tệp đóng băng và chạy `PYTHONPATH=tests python -m unittest test_matrix_verification_truth -v`: **9/9 đạt**, 0,035 giây. Probe độc lập dùng điểm ý **9/1**, điểm câu **5/5** (tất cả đều dương, tổng toàn đề vẫn 10) cũng bị từ chối đúng với vấn đề tổng từng câu, xác nhận không chỉ dựa vào chặn điểm 0 của fixture.

Không còn lỗi chặn từ hai phát hiện của reviewer. Giới hạn đối chiếu YCCĐ/slot và hồ sơ Word thiếu dữ liệu vẫn giữ nguyên; review này không thay toàn bộ kiểm thử của điều phối. Không sửa mã sản phẩm hoặc đọc dữ liệu thật.

SHA-256 bản R2:

- `docx_exam_importer.py`: `e6359d7b44320939c9faca9f8030043ebd755db748f76f14f52832012137075b`
- `tests/test_matrix_verification_truth.py`: `8b69ae42c5466a1c89ff8132f56caf3e286938fb36f954af83e9f061e54c3fe7`
