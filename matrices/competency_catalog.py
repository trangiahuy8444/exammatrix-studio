"""Kiểm tra danh mục năng lực và chỉ báo do giáo viên cung cấp."""
import copy
import unicodedata
from bank_service import ServiceError


def validate_rows(rows, fields, label):
    if not isinstance(rows, list) or len(rows) > 2000:
        raise ServiceError(f'{label} phải là danh sách có tối đa 2000 dòng.')
    result, codes = [], set()
    for row in rows:
        if not isinstance(row, dict) or any(not isinstance(row.get(k), str) or not unicodedata.normalize('NFC', row[k]).strip() for k in fields):
            raise ServiceError(f'{label} cần mã và nội dung đầy đủ.')
        item = {k: unicodedata.normalize('NFC', row[k]).strip() for k in fields}
        if item['code'] in codes:
            raise ServiceError(f'{label} có mã trùng: {item["code"]}.')
        codes.add(item['code'])
        result.append(item)
    return result


def validate_indicators(rows, competencies):
    result = validate_rows(rows, ('code', 'competency', 'text'), 'Danh mục chỉ báo')
    for row in result:
        if row['competency'] not in competencies:
            raise ServiceError(f'Chỉ báo {row["code"]} không thuộc năng lực đã khai báo.')
    return result


def validate_catalog(value):
    if not isinstance(value, dict):
        raise ServiceError('Danh mục phải là một đối tượng.')
    competencies = validate_rows(value.get('competencies'), ('code', 'name'), 'Danh mục năng lực')
    if not competencies or not value.get('indicators'):
        raise ServiceError('Danh mục cần ít nhất một năng lực và một chỉ báo.')
    indicators = validate_indicators(value.get('indicators'), {r['code'] for r in competencies})
    return copy.deepcopy(dict(competencies=competencies, indicators=indicators))


def _strip_subject(text):
    import re
    raw = str(text or '').replace('đ', 'd').replace('Đ', 'D')
    s = ''.join(ch for ch in unicodedata.normalize('NFD', raw) if unicodedata.category(ch) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()


SUBJECT_CATALOGS = {
    'tin_hoc': {
        'key': 'tin_hoc',
        'label': 'Tin học (TT 32/2018 & TT 02/2025)',
        'aliases': ('tin hoc', 'tin', 'informatics'),
        'competencies': [
            {'code': 'NLa', 'name': 'Sử dụng và quản lí các phương tiện công nghệ thông tin và truyền thông'},
            {'code': 'NLb', 'name': 'Ứng xử phù hợp trong môi trường số'},
            {'code': 'NLc', 'name': 'Giải quyết vấn đề với sự hỗ trợ của công nghệ thông tin và truyền thông'},
            {'code': 'NLd', 'name': 'Ứng dụng công nghệ thông tin và truyền thông trong học và tự học'},
            {'code': 'NLe', 'name': 'Hợp tác trong môi trường số'},
        ],
        'indicators': [
            {'code': 'NLa.1', 'competency': 'NLa', 'text': 'Nhận diện, phân biệt cấu tạo, chức năng của thiết bị số, phần mềm hệ thống và phần mềm ứng dụng.'},
            {'code': 'NLa.2', 'competency': 'NLa', 'text': 'Thực hiện thao tác quản lí dữ liệu, tệp, thư mục và khai thác tài nguyên mạng máy tính an toàn.'},
            {'code': 'NLa.3', 'competency': 'NLa', 'text': 'Thiết lập, vận hành cơ bản các thiết bị ngoại vi, kết nối mạng hoặc hệ cơ sở dữ liệu đúng quy trình.'},
            {'code': 'NLa.4', 'competency': 'NLa', 'text': 'Phân tích thông số kĩ thuật phần cứng, mạng hoặc cấu trúc dữ liệu để lựa chọn phương án phù hợp.'},
            {'code': 'NLb.1', 'competency': 'NLb', 'text': 'Nhận biết các quy định pháp luật, bản quyền số, quy tắc an toàn và văn hoá giao tiếp trên mạng.'},
            {'code': 'NLb.2', 'competency': 'NLb', 'text': 'Giải thích nguy cơ mất an toàn thông tin, vi phạm bản quyền và tác động của công nghệ số/AI tới xã hội.'},
            {'code': 'NLb.3', 'competency': 'NLb', 'text': 'Đề xuất và thực hành ứng xử có đạo đức, trách nhiệm, bảo vệ dữ liệu cá nhân trong tình huống thực tế.'},
            {'code': 'NLc.1', 'competency': 'NLc', 'text': 'Nhận diện bài toán, thuật toán, cấu trúc điều khiển hoặc thành phần chương trình, bảng/truy vấn CSDL.'},
            {'code': 'NLc.2', 'competency': 'NLc', 'text': 'Theo dõi vết thuật toán, kiểm thử, phát hiện lỗi và giải thích kết quả thực thi chương trình/truy vấn.'},
            {'code': 'NLc.3', 'competency': 'NLc', 'text': 'Thiết kế thuật toán, viết chương trình, tạo sản phẩm số hoặc thiết kế CSDL giải quyết vấn đề cụ thể.'},
            {'code': 'NLc.4', 'competency': 'NLc', 'text': 'Đánh giá độ phức tạp, tối ưu thuật toán hoặc cải tiến giải pháp tin học cho bài toán thực tiễn.'},
            {'code': 'NLd.1', 'competency': 'NLd', 'text': 'Khai thác học liệu số, phần mềm mô phỏng, công cụ tìm kiếm để tìm hiểu tri thức môn học.'},
            {'code': 'NLd.2', 'competency': 'NLd', 'text': 'Đánh giá độ tin cậy của nguồn thông tin/công cụ AI và tự học, mở rộng kiến thức bằng CNTT.'},
            {'code': 'NLe.1', 'competency': 'NLe', 'text': 'Sử dụng công cụ trực tuyến để trao đổi, chia sẻ thông tin và phản hồi văn minh.'},
            {'code': 'NLe.2', 'competency': 'NLe', 'text': 'Tổ chức cộng tác, phân công và đồng tạo lập sản phẩm số qua nền tảng làm việc nhóm.'},
        ],
    },
    'toan_hoc': {
        'key': 'toan_hoc',
        'label': 'Toán học (TT 32/2018 & CV 6569/7991)',
        'aliases': ('toan', 'toan hoc', 'math', 'mathematics'),
        'competencies': [
            {'code': 'TDLL', 'name': 'Tư duy và lập luận toán học'},
            {'code': 'MHH', 'name': 'Mô hình hóa toán học'},
            {'code': 'GQVĐ', 'name': 'Giải quyết vấn đề toán học'},
            {'code': 'GT', 'name': 'Giao tiếp toán học'},
            {'code': 'SDCC', 'name': 'Sử dụng công cụ, phương tiện học toán'},
        ],
        'indicators': [
            {'code': 'TD1.1', 'competency': 'TDLL', 'text': 'Thực hiện các thao tác tư duy cơ bản: so sánh, phân tích, tổng hợp, đặc biệt hóa, khái quát hóa, quy nạp, diễn dịch.'},
            {'code': 'TD1.2', 'competency': 'TDLL', 'text': 'Phát hiện sự tương đồng, khác biệt và mối liên hệ lôgic trong các đối tượng, tính chất toán học.'},
            {'code': 'TD2.1', 'competency': 'TDLL', 'text': 'Chỉ ra chứng cứ, lí lẽ và lập luận chặt chẽ, hợp lí để chứng minh khẳng định toán học.'},
            {'code': 'MH1.1', 'competency': 'MHH', 'text': 'Xác định và thiết lập mô hình toán học (biểu thức, phương trình, hàm số, đồ thị, hình vẽ) cho tình huống thực tiễn.'},
            {'code': 'MH2.1', 'competency': 'MHH', 'text': 'Giải quyết vấn đề trong mô hình đã lập, lí giải kết quả và đánh giá tính phù hợp với thực tiễn.'},
            {'code': 'GQ1.1', 'competency': 'GQVĐ', 'text': 'Nhận biết, phát hiện được vấn đề cần giải quyết bằng kiến thức toán học.'},
            {'code': 'GQ2.1', 'competency': 'GQVĐ', 'text': 'Đề xuất và lựa chọn chiến lược, thuật toán thích hợp để giải quyết bài toán.'},
            {'code': 'GQ3.1', 'competency': 'GQVĐ', 'text': 'Thực hiện giải pháp toán học chính xác và đánh giá, mở rộng lời giải.'},
            {'code': 'GT1.1', 'competency': 'GT', 'text': 'Đọc, hiểu văn bản toán học, công thức, kí hiệu, bảng số liệu và đồ thị.'},
            {'code': 'GT2.1', 'competency': 'GT', 'text': 'Diễn đạt, trình bày rõ ràng, chính xác ý tưởng và lời giải bằng ngôn ngữ toán học kết hợp ngôn ngữ thông thường.'},
            {'code': 'CC1.1', 'competency': 'SDCC', 'text': 'Sử dụng đúng công cụ đo vẽ hình học, máy tính cầm tay để tính toán và kiểm tra kết quả.'},
            {'code': 'CC2.1', 'competency': 'SDCC', 'text': 'Khai thác phần mềm toán học/bảng tính hỗ trợ biểu diễn hình ảnh, đồ thị và xử lí số liệu.'},
        ],
    },
    'vat_li': {
        'key': 'vat_li',
        'label': 'Vật lí (TT 32/2018 & CV 6569/7991)',
        'aliases': ('vat li', 'vat ly', 'physics'),
        'competencies': [
            {'code': 'NT', 'name': 'Nhận thức vật lí'},
            {'code': 'TH', 'name': 'Tìm hiểu thế giới tự nhiên dưới góc độ vật lí'},
            {'code': 'VD', 'name': 'Vận dụng kiến thức, kĩ năng đã học'},
        ],
        'indicators': [
            {'code': 'NT1', 'competency': 'NT', 'text': 'Nhận biết, nêu được tên đối tượng, khái niệm, đại lượng, đơn vị và hiện tượng vật lí.'},
            {'code': 'NT2', 'competency': 'NT', 'text': 'Trình bày các định luật, nguyên lí, mô hình vật lí bằng ngôn ngữ, công thức và đồ thị.'},
            {'code': 'NT3', 'competency': 'NT', 'text': 'Phân loại các sự vật, hiện tượng và quá trình vật lí theo tiêu chí xác định.'},
            {'code': 'NT4', 'competency': 'NT', 'text': 'Phân tích đặc điểm của đối tượng, quá trình vật lí theo lôgic khoa học.'},
            {'code': 'NT5', 'competency': 'NT', 'text': 'So sánh, giải thích mối quan hệ nhân quả giữa các đại lượng và hiện tượng vật lí.'},
            {'code': 'NT6', 'competency': 'NT', 'text': 'Nhận xét, phản biện và tính toán các đại lượng dựa trên định luật vật lí.'},
            {'code': 'TH1', 'competency': 'TH', 'text': 'Đề xuất vấn đề, đặt câu hỏi về hiện tượng vật lí từ quan sát hoặc bảng số liệu.'},
            {'code': 'TH2', 'competency': 'TH', 'text': 'Đưa ra phán đoán và xây dựng giả thuyết về quy luật vật lí.'},
            {'code': 'TH3', 'competency': 'TH', 'text': 'Lập kế hoạch, lựa chọn dụng cụ và thiết kế phương án thí nghiệm vật lí.'},
            {'code': 'TH4', 'competency': 'TH', 'text': 'Đọc dụng cụ đo, thu thập, xử lí số liệu thực nghiệm, đồ thị và đánh giá sai số.'},
            {'code': 'TH5', 'competency': 'TH', 'text': 'Rút ra kết luận khoa học và trình bày kết quả nghiên cứu.'},
            {'code': 'VD1', 'competency': 'VD', 'text': 'Giải thích hiện tượng tự nhiên và giải bài toán vật lí gắn bối cảnh quen thuộc.'},
            {'code': 'VD2', 'competency': 'VD', 'text': 'Đề xuất giải pháp kĩ thuật, sử dụng thiết bị điện/năng lượng an toàn, hiệu quả trong thực tiễn.'},
        ],
    },
    'hoa_hoc': {
        'key': 'hoa_hoc',
        'label': 'Hóa học (TT 32/2018 & CV 6569/7991)',
        'aliases': ('hoa hoc', 'hoa', 'chemistry'),
        'competencies': [
            {'code': 'NT', 'name': 'Nhận thức hóa học'},
            {'code': 'TH', 'name': 'Tìm hiểu thế giới tự nhiên dưới góc độ hóa học'},
            {'code': 'VD', 'name': 'Vận dụng kiến thức, kĩ năng đã học'},
        ],
        'indicators': [
            {'code': 'NT1', 'competency': 'NT', 'text': 'Nhận biết, gọi tên chất, công thức hóa học, kí hiệu và khái niệm hóa học.'},
            {'code': 'NT2', 'competency': 'NT', 'text': 'Trình bày cấu tạo nguyên tử/phân tử, tính chất vật lí – hóa học và viết phương trình phản ứng.'},
            {'code': 'NT3', 'competency': 'NT', 'text': 'Phân loại các chất và loại phản ứng hóa học theo tiêu chí đặc trưng.'},
            {'code': 'NT4', 'competency': 'NT', 'text': 'So sánh, giải thích mối quan hệ giữa cấu tạo chất với tính chất và chiều hướng phản ứng.'},
            {'code': 'NT5', 'competency': 'NT', 'text': 'Tính toán thành phần, nồng độ, hiệu suất và năng lượng phản ứng hóa học.'},
            {'code': 'TH1', 'competency': 'TH', 'text': 'Đặt câu hỏi và nêu giả thuyết về tính chất hoặc cơ chế biến đổi của chất.'},
            {'code': 'TH2', 'competency': 'TH', 'text': 'Đề xuất phương án nhận biết, tách chất hoặc thiết kế thí nghiệm hóa học an toàn.'},
            {'code': 'TH3', 'competency': 'TH', 'text': 'Quan sát hiện tượng, xử lí số liệu thực nghiệm và rút ra kết luận hóa học.'},
            {'code': 'VD1', 'competency': 'VD', 'text': 'Giải thích các hiện tượng hóa học trong đời sống, sản xuất và y tế.'},
            {'code': 'VD2', 'competency': 'VD', 'text': 'Đề xuất biện pháp sử dụng hóa chất an toàn, xử lí ô nhiễm và phát triển bền vững.'},
        ],
    },
    'sinh_hoc': {
        'key': 'sinh_hoc',
        'label': 'Sinh học (TT 32/2018 & CV 6569/7991)',
        'aliases': ('sinh hoc', 'sinh', 'biology'),
        'competencies': [
            {'code': 'NT', 'name': 'Nhận thức sinh học'},
            {'code': 'TH', 'name': 'Tìm hiểu thế giới sống'},
            {'code': 'VD', 'name': 'Vận dụng kiến thức, kĩ năng đã học'},
        ],
        'indicators': [
            {'code': 'NT1', 'competency': 'NT', 'text': 'Nhận biết, kể tên, phát biểu đối tượng, khái niệm và quy luật sinh học.'},
            {'code': 'NT2', 'competency': 'NT', 'text': 'Trình bày đặc điểm cấu tạo, vai trò sinh học bằng ngôn ngữ, sơ đồ, biểu đồ.'},
            {'code': 'NT3', 'competency': 'NT', 'text': 'Phân loại đối tượng và hiện tượng sống theo tiêu chí khoa học.'},
            {'code': 'NT4', 'competency': 'NT', 'text': 'Phân tích đặc điểm cấu trúc – quá trình sinh lí, di truyền, tiến hóa theo trình tự lôgic.'},
            {'code': 'NT5', 'competency': 'NT', 'text': 'So sánh, lựa chọn đặc điểm cấu tạo, cơ chế và quá trình sinh học dựa trên tiêu chí.'},
            {'code': 'NT6', 'competency': 'NT', 'text': 'Giải thích mối quan hệ giữa cấu tạo với chức năng và nguyên nhân – kết quả ở các cấp độ tổ chức sống.'},
            {'code': 'NT7', 'competency': 'NT', 'text': 'Nhận ra điểm sai trong nhận định sinh học và đưa ra lập luận phản biện có căn cứ.'},
            {'code': 'TH1', 'competency': 'TH', 'text': 'Đề xuất vấn đề, đặt câu hỏi nghiên cứu và nêu giả thuyết về hiện tượng sống.'},
            {'code': 'TH2', 'competency': 'TH', 'text': 'Lập kế hoạch quan sát, điều tra hoặc thiết kế thí nghiệm sinh học kiểm chứng giả thuyết.'},
            {'code': 'TH3', 'competency': 'TH', 'text': 'Thu thập, xử lí số liệu thực nghiệm/biểu đồ sinh học và rút ra kết luận.'},
            {'code': 'VD1', 'competency': 'VD', 'text': 'Giải thích hiện tượng sức khỏe, nông nghiệp, sinh thái quen thuộc bằng kiến thức sinh học.'},
            {'code': 'VD2', 'competency': 'VD', 'text': 'Đề xuất biện pháp bảo vệ sức khỏe, đa dạng sinh học và môi trường sống.'},
        ],
    },
    'khtn': {
        'key': 'khtn',
        'label': 'Khoa học tự nhiên THCS (TT 32/2018)',
        'aliases': ('khoa hoc tu nhien', 'khtn', 'natural science'),
        'competencies': [
            {'code': 'NT', 'name': 'Nhận thức khoa học tự nhiên'},
            {'code': 'TH', 'name': 'Tìm hiểu tự nhiên'},
            {'code': 'VD', 'name': 'Vận dụng kiến thức, kĩ năng đã học'},
        ],
        'indicators': [
            {'code': 'NT1', 'competency': 'NT', 'text': 'Nhận biết, nêu tên sự vật, hiện tượng, đại lượng và khái niệm KHTN.'},
            {'code': 'NT2', 'competency': 'NT', 'text': 'Trình bày quy luật, mối quan hệ bằng lời, sơ đồ hoặc công thức đơn giản.'},
            {'code': 'NT3', 'competency': 'NT', 'text': 'So sánh, phân loại và giải thích nguyên nhân của các hiện tượng tự nhiên.'},
            {'code': 'TH1', 'competency': 'TH', 'text': 'Đặt câu hỏi tìm hiểu tự nhiên và đưa ra dự đoán ban đầu.'},
            {'code': 'TH2', 'competency': 'TH', 'text': 'Lựa chọn dụng cụ, đề xuất phương án thí nghiệm/quan sát đơn giản.'},
            {'code': 'TH3', 'competency': 'TH', 'text': 'Đọc số liệu, xử lí bảng biểu thí nghiệm và rút ra kết luận.'},
            {'code': 'VD1', 'competency': 'VD', 'text': 'Giải thích các hiện tượng tự nhiên thường gặp trong đời sống.'},
            {'code': 'VD2', 'competency': 'VD', 'text': 'Ứng xử phù hợp với tự nhiên, tiết kiệm năng lượng và bảo vệ môi trường.'},
        ],
    },
    'ngu_van': {
        'key': 'ngu_van',
        'label': 'Ngữ văn (TT 32/2018 & CV 7991)',
        'aliases': ('ngu van', 'van', 'literature'),
        'competencies': [
            {'code': 'ĐỌC', 'name': 'Năng lực đọc hiểu văn bản'},
            {'code': 'VIẾT', 'name': 'Năng lực tạo lập văn bản (Viết)'},
            {'code': 'NÓI_NGHE', 'name': 'Năng lực nói và nghe'},
            {'code': 'VH', 'name': 'Năng lực văn học'},
        ],
        'indicators': [
            {'code': 'DOC.1', 'competency': 'ĐỌC', 'text': 'Nhận biết phương thức biểu đạt, thể loại, ngôi kể, đề tài và chi tiết tiêu biểu của văn bản (ưu tiên ngữ liệu ngoài SGK).'},
            {'code': 'DOC.2', 'competency': 'ĐỌC', 'text': 'Hiểu và phân tích đặc điểm ngôn ngữ, biện pháp tu từ, kết cấu và thông điệp của văn bản.'},
            {'code': 'DOC.3', 'competency': 'ĐỌC', 'text': 'Đánh giá giá trị tư tưởng, văn hóa và liên hệ, rút ra bài học cho bản thân.'},
            {'code': 'VIET.1', 'competency': 'VIẾT', 'text': 'Xác định đúng kiểu văn bản, yêu cầu đề bài và lập dàn ý mạch lạc.'},
            {'code': 'VIET.2', 'competency': 'VIẾT', 'text': 'Viết đoạn văn hoặc bài văn nghị luận xã hội có lí lẽ, bằng chứng thuyết phục.'},
            {'code': 'VIET.3', 'competency': 'VIẾT', 'text': 'Viết bài văn nghị luận văn học phân tích, đánh giá tác phẩm bảo đảm chuẩn tiếng Việt và sáng tạo.'},
            {'code': 'VH.1', 'competency': 'VH', 'text': 'Cảm thụ, phân tích nhân vật, hình tượng nghệ thuật và giá trị thẩm mĩ của tác phẩm văn học.'},
            {'code': 'NN.1', 'competency': 'NÓI_NGHE', 'text': 'Trình bày, trao đổi ý kiến rõ ràng và lắng nghe, phản hồi đúng trọng tâm.'},
        ],
    },
    'tieng_anh': {
        'key': 'tieng_anh',
        'label': 'Tiếng Anh (TT 32/2018 & CEFR)',
        'aliases': ('tieng anh', 'anh van', 'ngoai ngu', 'english'),
        'competencies': [
            {'code': 'LANG', 'name': 'Kiến thức ngôn ngữ (Ngữ âm, Từ vựng, Ngữ pháp)'},
            {'code': 'READ', 'name': 'Năng lực Đọc hiểu (Reading)'},
            {'code': 'WRITE', 'name': 'Năng lực Viết (Writing)'},
            {'code': 'LISTEN', 'name': 'Năng lực Nghe hiểu (Listening)'},
            {'code': 'SPEAK', 'name': 'Năng lực Nói (Speaking)'},
        ],
        'indicators': [
            {'code': 'LANG.1', 'competency': 'LANG', 'text': 'Nhận diện và phân biệt phát âm, trọng âm từ và ngữ điệu trong giao tiếp.'},
            {'code': 'LANG.2', 'competency': 'LANG', 'text': 'Vận dụng từ vựng và cấu trúc ngữ pháp chính xác trong ngữ cảnh.'},
            {'code': 'READ.1', 'competency': 'READ', 'text': 'Đọc lấy ý chính (skimming) và nắm bố cục đoạn văn/thông báo.'},
            {'code': 'READ.2', 'competency': 'READ', 'text': 'Đọc tìm thông tin chi tiết (scanning), tham chiếu từ và đoán nghĩa từ ngữ cảnh.'},
            {'code': 'READ.3', 'competency': 'READ', 'text': 'Suy luận thái độ tác giả và thông tin hàm ý trong văn bản.'},
            {'code': 'WRITE.1', 'competency': 'WRITE', 'text': 'Sắp xếp, chuyển đổi câu giữ nguyên nghĩa và cấu trúc chuẩn mực.'},
            {'code': 'WRITE.2', 'competency': 'WRITE', 'text': 'Viết đoạn văn, thư điện tử hoặc bài luận ngắn mạch lạc đúng văn phong.'},
            {'code': 'LISTEN.1', 'competency': 'LISTEN', 'text': 'Nghe hiểu ý chính và thông tin cụ thể từ hội thoại, thông báo quen thuộc.'},
            {'code': 'SPEAK.1', 'competency': 'SPEAK', 'text': 'Trình bày ý kiến, miêu tả và tương tác giao tiếp theo chủ đề chuẩn CEFR A2/B1.'},
        ],
    },
    'lich_su': {
        'key': 'lich_su',
        'label': 'Lịch sử (TT 32/2018 & CV 6569/7991)',
        'aliases': ('lich su', 'su', 'history'),
        'competencies': [
            {'code': 'THLS', 'name': 'Tìm hiểu lịch sử'},
            {'code': 'NTLS', 'name': 'Nhận thức và tư duy lịch sử'},
            {'code': 'VDLS', 'name': 'Vận dụng kiến thức, kĩ năng đã học'},
        ],
        'indicators': [
            {'code': 'THLS.1', 'competency': 'THLS', 'text': 'Nhận diện và phân loại được các nguồn sử liệu (chữ viết, hiện vật, tranh ảnh, lược đồ).'},
            {'code': 'THLS.2', 'competency': 'THLS', 'text': 'Khai thác thông tin, trích dẫn dữ kiện chính xác từ sử liệu được cung cấp.'},
            {'code': 'NTLS.1', 'competency': 'NTLS', 'text': 'Xác định thời gian, không gian, trình bày diễn biến sự kiện và quá trình lịch sử.'},
            {'code': 'NTLS.2', 'competency': 'NTLS', 'text': 'Giải thích nguyên nhân, hệ quả, ý nghĩa và mối liên hệ giữa các sự kiện lịch sử.'},
            {'code': 'NTLS.3', 'competency': 'NTLS', 'text': 'So sánh, nhận xét, đánh giá khách quan sự kiện và vai trò nhân vật lịch sử.'},
            {'code': 'VDLS.1', 'competency': 'VDLS', 'text': 'Liên hệ bài học lịch sử để giải thích vấn đề hiện tại và bảo tồn di sản văn hóa.'},
        ],
    },
    'dia_li': {
        'key': 'dia_li',
        'label': 'Địa lí (TT 32/2018 & CV 6569/7991)',
        'aliases': ('dia li', 'dia ly', 'dia', 'geography'),
        'competencies': [
            {'code': 'NTĐL', 'name': 'Nhận thức khoa học địa lí'},
            {'code': 'THĐL', 'name': 'Tìm hiểu địa lí'},
            {'code': 'VDĐL', 'name': 'Vận dụng kiến thức, kĩ năng đã học'},
        ],
        'indicators': [
            {'code': 'NTDL.1', 'competency': 'NTĐL', 'text': 'Nhận biết, mô tả đối tượng, hiện tượng địa lí tự nhiên và kinh tế – xã hội.'},
            {'code': 'NTDL.2', 'competency': 'NTĐL', 'text': 'Giải thích cơ chế, mối quan hệ giữa các yếu tố tự nhiên và dân cư – kinh tế.'},
            {'code': 'THDL.1', 'competency': 'THĐL', 'text': 'Khai thác thông tin từ bản đồ, Atlat, lược đồ địa lí.'},
            {'code': 'THDL.2', 'competency': 'THĐL', 'text': 'Tính toán, xử lí bảng số liệu thống kê, đọc và nhận xét biểu đồ địa lí.'},
            {'code': 'VDDL.1', 'competency': 'VDĐL', 'text': 'Vận dụng kiến thức giải thích vấn đề kinh tế địa phương, ứng phó biến đổi khí hậu và thiên tai.'},
        ],
    },
    'lich_su_dia_li': {
        'key': 'lich_su_dia_li',
        'label': 'Lịch sử và Địa lí THCS (TT 32/2018)',
        'aliases': ('lich su va dia li', 'lich su va dia ly', 'lich su dia li', 'su dia', 'su va dia'),
        'competencies': [
            {'code': 'THLS', 'name': 'Tìm hiểu lịch sử'},
            {'code': 'NTLS', 'name': 'Nhận thức và tư duy lịch sử'},
            {'code': 'VDLS', 'name': 'Vận dụng kiến thức lịch sử'},
            {'code': 'NTĐL', 'name': 'Nhận thức khoa học địa lí'},
            {'code': 'THĐL', 'name': 'Tìm hiểu địa lí'},
            {'code': 'VDĐL', 'name': 'Vận dụng kiến thức địa lí'},
        ],
        'indicators': [
            {'code': 'THLS.1', 'competency': 'THLS', 'text': 'Khai thác thông tin từ tư liệu chữ viết, hiện vật, tranh ảnh lịch sử.'},
            {'code': 'NTLS.1', 'competency': 'NTLS', 'text': 'Trình bày, giải thích nguyên nhân, diễn biến và ý nghĩa sự kiện lịch sử.'},
            {'code': 'VDLS.1', 'competency': 'VDLS', 'text': 'Rút ra bài học lịch sử gắn với thực tiễn địa phương và hiện tại.'},
            {'code': 'NTDL.1', 'competency': 'NTĐL', 'text': 'Mô tả, giải thích đặc điểm và mối liên hệ các hiện tượng địa lí tự nhiên – KT–XH.'},
            {'code': 'THDL.1', 'competency': 'THĐL', 'text': 'Đọc bản đồ, lược đồ, biểu đồ và xử lí bảng số liệu địa lí.'},
            {'code': 'VDDL.1', 'competency': 'VDĐL', 'text': 'Liên hệ giải quyết vấn đề môi trường, dân cư và thiên tai thực tế.'},
        ],
    },
    'gdktpl': {
        'key': 'gdktpl',
        'label': 'GDCD (THCS) & GDKT&PL (THPT · TT 32/2018)',
        'aliases': ('gdcd', 'giao duc cong dan', 'gdktpl', 'gdkt pl', 'giao duc kinh te va phap luat', 'kinh te va phap luat'),
        'competencies': [
            {'code': 'ĐCHV', 'name': 'Năng lực điều chỉnh hành vi'},
            {'code': 'PTBT', 'name': 'Năng lực phát triển bản thân'},
            {'code': 'THKTXH', 'name': 'Năng lực tìm hiểu và tham gia hoạt động kinh tế – xã hội'},
        ],
        'indicators': [
            {'code': 'DCHV.1', 'competency': 'ĐCHV', 'text': 'Nhận biết chuẩn mực đạo đức, quy định pháp luật và quyền, nghĩa vụ của công dân.'},
            {'code': 'DCHV.2', 'competency': 'ĐCHV', 'text': 'Phân tích, đánh giá hành vi đúng/sai của bản thân và người khác trong tình huống thực tế.'},
            {'code': 'DCHV.3', 'competency': 'ĐCHV', 'text': 'Đề xuất cách ứng xử, giải quyết tình huống phù hợp chuẩn mực đạo đức và pháp luật.'},
            {'code': 'PTBT.1', 'competency': 'PTBT', 'text': 'Lập kế hoạch tài chính cá nhân, quản lí thời gian và mục tiêu phát triển bản thân.'},
            {'code': 'THKTXH.1', 'competency': 'THKTXH', 'text': 'Hiểu các hiện tượng kinh tế (thị trường, thuế, lạm phát, tín dụng) và vai trò chủ thể kinh tế.'},
            {'code': 'THKTXH.2', 'competency': 'THKTXH', 'text': 'Khai thác thông tin văn bản pháp luật/kinh tế để giải quyết tình huống đời sống.'},
        ],
    },
    'cong_nghe': {
        'key': 'cong_nghe',
        'label': 'Công nghệ (TT 32/2018)',
        'aliases': ('cong nghe', 'ktcn', 'technology'),
        'competencies': [
            {'code': 'NTCN', 'name': 'Nhận thức công nghệ'},
            {'code': 'GTCN', 'name': 'Giao tiếp công nghệ'},
            {'code': 'SDCN', 'name': 'Sử dụng công nghệ'},
            {'code': 'ĐGCN', 'name': 'Đánh giá công nghệ'},
            {'code': 'TKKT', 'name': 'Thiết kế kĩ thuật'},
        ],
        'indicators': [
            {'code': 'NTCN.1', 'competency': 'NTCN', 'text': 'Nhận biết đối tượng, nguyên lí hoạt động và vai trò của hệ thống/sản phẩm công nghệ.'},
            {'code': 'NTCN.2', 'competency': 'NTCN', 'text': 'Giải thích cấu tạo, quy trình công nghệ hoặc tác động môi trường trong sản xuất.'},
            {'code': 'GTCN.1', 'competency': 'GTCN', 'text': 'Đọc, lập và sử dụng bản vẽ kĩ thuật, sơ đồ mạch điện/sơ đồ khối đúng tiêu chuẩn.'},
            {'code': 'SDCN.1', 'competency': 'SDCN', 'text': 'Lựa chọn, vận hành thiết bị, quy trình công nghệ đúng kĩ thuật và an toàn.'},
            {'code': 'DGCN.1', 'competency': 'ĐGCN', 'text': 'Đánh giá sản phẩm/giải pháp công nghệ trên tiêu chí hiệu quả, kinh tế và an toàn sinh thái.'},
            {'code': 'TKKT.1', 'competency': 'TKKT', 'text': 'Đề xuất ý tưởng, phác thảo bản thiết kế giải pháp kĩ thuật giải quyết nhu cầu thực tiễn.'},
        ],
    },
}


def preset_catalog_for_subject(subject_name):
    key = _strip_subject(subject_name or 'Tin học')
    if not key:
        return copy.deepcopy(SUBJECT_CATALOGS['tin_hoc'])
    if subject_name in SUBJECT_CATALOGS:
        return copy.deepcopy(SUBJECT_CATALOGS[subject_name])
    for entry in SUBJECT_CATALOGS.values():
        if key in entry['aliases']:
            return copy.deepcopy(entry)
    for entry in SUBJECT_CATALOGS.values():
        if any(len(a) >= 4 and a in key for a in entry['aliases']):
            return copy.deepcopy(entry)
    return None


def default_competencies_for_subject(subject_name):
    entry = preset_catalog_for_subject(subject_name)
    if not entry:
        return ('NL_CHUNG',)
    codes = [c['code'] for c in entry['competencies']]
    if entry['key'] in ('tin_hoc', 'toan_hoc'):
        return tuple(codes)
    if 'NL_CHUNG' not in codes:
        codes.append('NL_CHUNG')
    return tuple(codes)
