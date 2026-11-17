# QA-PPCT-FIXTURE — Tái sử dụng đúng tệp khi đối soát và xác nhận

Ngày 31/10/2026. Chỉ sửa `tests/test_ppct_import.py` trong bản sao cách ly.

## Nguyên nhân và bằng chứng

Ca `test_inspect_does_not_write_then_apply_adds_lessons_and_source` gọi `self.payload()` lần nữa khi xác nhận; mỗi lần helper sinh một DOCX mới. DOCX là ZIP có timestamp, nên cùng nội dung vẫn có thể khác SHA-256 sau ranh giới thời gian. Chốt chặn SHA của sản phẩm từ chối đúng tệp mới; đây là fixture không ổn định.

Harness `/tmp/repro_ppct_fixture.py` bọc bộ tạo DOCX thật, chỉ thay timestamp ZIP giữa hai lần sinh. RED: ca cũ lỗi 409; hai DOCX có toàn bộ tên entry và nội dung entry giống nhau nhưng SHA khác. Không giả lập BankService hay tắt chốt chặn hash.

## Sửa và kiểm chứng

- Ca kiểm thử tạo `payload` một lần và dùng lại trong đối soát/xác nhận/kiểm tra trùng lặp.
- Thêm kiểm chứng byte của tệp nguồn đã lưu đúng byte tệp đối soát.
- Harness sau sửa GREEN 1/1, chỉ sinh một DOCX; nhóm PPCT đạt 8/8, gồm ca từ chối SHA sai.
- Log `/tmp/QA-PPCT-FIXTURE-red.log`, `/tmp/QA-PPCT-FIXTURE-green.log`, `/tmp/QA-PPCT-FIXTURE-targets.log`.

Không thay mã sản phẩm hoặc ngân hàng thật. Không chạy toàn bộ suite theo phân công; điều phối sở hữu lần chạy đó. Hai tệp sửa BE-VERIFY vẫn giữ nguyên trạng thái đóng băng.
