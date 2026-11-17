# Danh sách vấn đề — thực thi G0–G7

| Mã | Phạm vi | Bằng chứng | Trạng thái / chủ trì |
|---|---|---|---|
| BM-01 | Lộ rubric/solution/answer trong statements lồng | 2 test mới FAIL trước sửa; probe reviewer xác nhận đường Handler._json | Ứng viên sửa qua test, chờ tích hợp / backend |
| BE-AUDIT-01 | Chặn publish khi hash đổi nhưng không lưu publish_blocked | test_exam_lifecycle thất bại thật; Django rollback cần audit ngoài giao dịch | Đang sửa ứng viên / backend |
| QA-FIXTURE-01 | Test vùng Test đọc DEFAULT_BANK thật | 6 errors trên snapshot không chứa ngân hàng thật | Fixture tự soạn + cổng 0 qua 6/6, chờ review |
| QA-FIXTURE-02 | C2 shortfall đọc ma trận thật không được tạo trong setup | FAIL test_c2_scenario_2 trên fixture sạch | Ma trận/YCCĐ giả và kiểm số đếm qua 6/6, chờ review |
| FE-DRAFT-01 | Chưa có bằng chứng giữ nháp khi reload | Đối chiếu tĩnh G0: examDraft trong bộ nhớ | Cần tái hiện UI ở G3 / frontend + QA |
| DOC-01 | Hướng dẫn nhầm nhiều đề với hoán vị, cố định 12 tệp, lệnh activate sai | DOI_CHIEU_HIEN_TRANG.md | Chưa sửa, thuộc G5/C3 |
| DATA-CK1-01 | Chưa xác nhận ma trận/độ đủ CK1 thật từng khối | Log GK1/CK1 không đồng nhất, không dùng dữ liệu thật trong test | G1 chờ đối soát phạm vi được giao |
| ONLINE-01 | Chưa kiểm PostgreSQL/restore online, Word→PDF thật | VH-01.md | Chưa kiểm G4/G6 |
