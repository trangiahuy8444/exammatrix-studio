"""Dữ liệu ban đầu cho vùng Test: bản sao PPCT và câu hỏi thật, hoặc bộ câu mẫu tự soạn khi chưa có câu thật.

Giáo viên yêu cầu (28/10/2026): "Chức năng test cần có sẵn câu hỏi trong ngân hàng câu hỏi để test."
Vùng Test chỉ là bản sao: đề, đề cương, ma trận trong vùng Test luôn bắt đầu trống và không ghi ngược về ngân hàng thật.
"""
import copy

SAMPLE_SOURCE = 'Câu mẫu tự soạn cho vùng Test — không dùng cho kiểm tra chính thức'
SAMPLE_REVIEWER = 'Dữ liệu mẫu vùng Test (tự động)'
SAMPLE_GRADE = 10

SAMPLE_LESSONS = [
    dict(lesson_code='MAU1', lesson_name_source='Bài mẫu 1. Thông tin và dữ liệu', topic_source='Chủ đề mẫu: Máy tính và xã hội tri thức',
         outcomes=['Phân biệt được thông tin và dữ liệu.', 'Giải thích được vì sao dữ liệu cần được xử lí để có thông tin.',
                   'Đổi được giữa các đơn vị đo dung lượng dữ liệu.']),
    dict(lesson_code='MAU2', lesson_name_source='Bài mẫu 2. Biến và lệnh gán trong Python', topic_source='Chủ đề mẫu: Lập trình cơ bản',
         outcomes=['Nêu được cách khai báo biến và lệnh gán trong Python.', 'Giải thích được kết quả của một đoạn lệnh gán đơn giản.',
                   'Viết được chương trình ngắn dùng biến, lệnh gán, input và print.']),
    dict(lesson_code='MAU3', lesson_name_source='Bài mẫu 3. Câu lệnh rẽ nhánh if', topic_source='Chủ đề mẫu: Lập trình cơ bản',
         outcomes=['Nêu được cú pháp câu lệnh if và if-else.', 'Xác định được kết quả của câu lệnh rẽ nhánh với dữ liệu cho trước.',
                   'Viết được chương trình dùng câu lệnh rẽ nhánh để giải bài toán đơn giản.']),
]


def _mc(lesson, level, outcome, question, options, correct, explanations):
    return dict(type='MC', lesson_code=lesson, level=level, learning_outcome=outcome, question=question,
                options=options, correct=correct, option_explanations=explanations)


def _yn(lesson, level, outcome, question, statements):
    return dict(type='YN', lesson_code=lesson, level=level, learning_outcome=outcome, question=question,
                statements=[dict(label=chr(97+i), text=t, correct=c) for i, (t, c) in enumerate(statements)])


def _short(lesson, level, outcome, question, answer):
    return dict(type='SHORT', lesson_code=lesson, level=level, learning_outcome=outcome, question=question, short_answer=answer)


def _es(lesson, level, outcome, question, rubric):
    return dict(type='ES', lesson_code=lesson, level=level, learning_outcome=outcome, question=question,
                rubric=[dict(criterion=c, points=p) for c, p in rubric],
                equivalent_answer_policy='Chấp nhận cách làm khác cho kết quả đúng; chấm theo từng tiêu chí.')


def _o(index, k):
    return SAMPLE_LESSONS[index]['outcomes'][k]


SAMPLE_QUESTIONS = [
    _mc('MAU1', 'Biết', _o(0, 0), 'Phát biểu nào sau đây đúng về dữ liệu?',
        ['Dữ liệu là thông tin đã được con người hiểu và sử dụng.', 'Dữ liệu là thông tin được biểu diễn để máy tính lưu trữ và xử lí.',
         'Dữ liệu chỉ gồm các con số.', 'Dữ liệu không thể chuyển thành thông tin.'], 1,
        ['Đây là mô tả thông tin, không phải dữ liệu.', 'Đúng: dữ liệu là dạng biểu diễn của thông tin để lưu trữ, xử lí.',
         'Dữ liệu còn có văn bản, hình ảnh, âm thanh.', 'Xử lí dữ liệu chính là để thu được thông tin.']),
    _yn('MAU1', 'Hiểu', _o(0, 1), 'Xét quá trình giáo viên tổng hợp bảng điểm của lớp. Mỗi ý sau đúng hay sai?',
        [('Bảng điểm chưa sắp xếp là dữ liệu.', True), ('Điểm trung bình của lớp là thông tin rút ra từ dữ liệu.', True),
         ('Dữ liệu sau khi xử lí luôn giữ nguyên ý nghĩa ban đầu, không tạo ra thông tin mới.', False),
         ('Máy tính có thể hiểu ý nghĩa của điểm số như con người.', False)]),
    _short('MAU1', 'Vận dụng', _o(0, 2), 'Một tệp có dung lượng 3 MB. Dung lượng tệp là bao nhiêu KB?', '3072'),
    _es('MAU1', 'Vận dụng', _o(0, 2), 'Một USB 16 GB đã dùng 12 GB. Mỗi bức ảnh có dung lượng 4 MB. '
        'Hỏi USB còn lưu thêm được tối đa bao nhiêu bức ảnh? Trình bày cách tính.',
        [('Tính đúng dung lượng còn trống: 16 − 12 = 4 GB.', 0.25), ('Đổi đúng 4 GB = 4096 MB.', 0.25),
         ('Lập phép chia 4096 : 4.', 0.25), ('Kết luận đúng: lưu thêm tối đa 1024 bức ảnh.', 0.25)]),
    _mc('MAU2', 'Biết', _o(1, 0), 'Trong Python, lệnh nào gán giá trị 5 cho biến x?',
        ['x == 5', '5 = x', 'x = 5', 'x := 5 :'], 2,
        ['== là phép so sánh, không phải lệnh gán.', 'Vế trái của lệnh gán phải là tên biến.',
         'Đúng: cú pháp lệnh gán là <tên biến> = <giá trị>.', 'Cú pháp này không hợp lệ trong Python.']),
    _yn('MAU2', 'Hiểu', _o(1, 1), 'Cho đoạn lệnh Python: a = 4; b = a + 2; a = b * 2. Mỗi ý sau đúng hay sai?',
        [('Sau lệnh thứ hai, b có giá trị 6.', True), ('Sau cả ba lệnh, a có giá trị 12.', True),
         ('Sau cả ba lệnh, b có giá trị 12.', False), ('Lệnh a = b * 2 làm thay đổi giá trị của b.', False)]),
    _short('MAU2', 'Hiểu', _o(1, 1), 'Sau khi thực hiện x = 7; x = x + 3; x = x * 2, biến x có giá trị bao nhiêu?', '20'),
    _es('MAU2', 'Vận dụng', _o(1, 2), 'Viết chương trình Python nhập vào chiều dài và chiều rộng của hình chữ nhật (số thực), '
        'rồi in ra chu vi và diện tích.',
        [('Nhập đúng hai giá trị bằng float(input()).', 0.25), ('Tính đúng chu vi (d + r) * 2.', 0.25),
         ('Tính đúng diện tích d * r.', 0.25), ('In kết quả rõ ràng bằng print.', 0.25)]),
    _mc('MAU3', 'Biết', _o(2, 0), 'Câu lệnh if trong Python viết đúng là:',
        ['if x > 0 then:', 'if (x > 0)', 'if x > 0:', 'if x > 0;'], 2,
        ['Python không dùng từ khóa then.', 'Thiếu dấu hai chấm sau điều kiện.',
         'Đúng: if <điều kiện>: rồi khối lệnh thụt vào.', 'Python dùng dấu hai chấm, không dùng dấu chấm phẩy.']),
    _yn('MAU3', 'Hiểu', _o(2, 1), 'Cho đoạn lệnh: n = 15; if n % 2 == 0: print("chẵn") else: print("lẻ"). Mỗi ý sau đúng hay sai?',
        [('Biểu thức n % 2 có giá trị 1.', True), ('Chương trình in ra "lẻ".', True),
         ('Khối lệnh sau else luôn được thực hiện.', False), ('Nếu n = 10 thì chương trình in ra "lẻ".', False)]),
    _short('MAU3', 'Hiểu', _o(2, 1), 'Cho a = 8, b = 3. Sau lệnh: if a > b: c = a - b else: c = b - a, biến c có giá trị bao nhiêu?', '5'),
    _es('MAU3', 'Vận dụng', _o(2, 2), 'Viết chương trình Python nhập một số nguyên n và in ra "Số dương", "Số âm" hoặc "Bằng 0".',
        [('Nhập đúng n bằng int(input()).', 0.25), ('Dùng đúng if cho trường hợp n > 0.', 0.25),
         ('Dùng đúng elif cho trường hợp n < 0.', 0.25), ('Dùng else cho trường hợp còn lại và in đúng thông báo.', 0.25)]),
]


def seed_bank(source_bank, title='Vùng Test — bản sao ngân hàng câu hỏi'):
    """Bản sao PPCT và câu hỏi của ngân hàng thật; không chép đề, đề cương, ma trận."""
    source = source_bank or {}
    return {
        'schema_version': source.get('schema_version', '1.0.0'),
        'metadata': {**copy.deepcopy(source.get('metadata') or {}), 'title': title, 'test_copy': True},
        'ppct': copy.deepcopy(source.get('ppct') or {'sources': [], 'lessons': []}),
        'questions': copy.deepcopy(source.get('questions') or []),
    }


def install_sample(service):
    """Nạp bộ câu mẫu (Tin học 10) qua đúng API của ngân hàng, đi qua quy trình duyệt B1 với người duyệt ghi rõ là tự động."""
    from domain.review import CHECKLIST
    for lesson in SAMPLE_LESSONS:
        service.save_ppct_lesson(dict(lesson, grade=SAMPLE_GRADE, week_raw='Bài mẫu', periods_raw='Không ấn định'))
    for raw in SAMPLE_QUESTIONS:
        question = dict(copy.deepcopy(raw), grade=SAMPLE_GRADE, max_score=1, review_status='draft', source_file=SAMPLE_SOURCE)
        saved = service.save_question(question)
        service.review_question(saved['id'], 'submit', actor=SAMPLE_REVIEWER)
        service.review_question(saved['id'], 'approve', actor=SAMPLE_REVIEWER,
                                checklist={item['key']: True for item in CHECKLIST},
                                reason='Câu mẫu vùng Test; không dùng cho kiểm tra chính thức.')
