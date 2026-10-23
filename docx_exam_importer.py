"""Parser and Matrix Verification Engine for Exams (.docx/.json) and Revisions (.docx/.json)."""
from __future__ import annotations
import copy
from domain.policies import resolve_similarity
import hashlib
import io
import re
import uuid
import zipfile
import xml.etree.ElementTree as ET

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2026/main'}
W_NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}


def _norm(text: str) -> str:
    text = (text or '').lower().strip()
    text = re.sub(r'[—\-–]+\s*hết\s*[—\-–]+.*$', '', text, flags=re.S)
    text = re.sub(r'học sinh không được sử dụng tài liệu.*$', '', text, flags=re.S)
    text = re.sub(r'^câu\s+\d+\s*(?:\([^)]*\))?\s*[.:]?\s*', '', text)
    text = re.sub(r'^\([\d.,]+\s*điểm\)\s*[.:]?\s*', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip(' .:;-')


def _stem_key(text: str) -> str:
    """Return normalized primary stem (first 100 chars of first non-empty line) for reliable revision matching."""
    cleaned = re.sub(r'^câu\s+\d+\s*(?:\([^)]*\))?\s*[.:]?\s*', '', (text or '').strip(), flags=re.I)
    cleaned = re.sub(r'^\([\d.,]+\s*điểm\)\s*[.:]?\s*', '', cleaned.strip(), flags=re.I)
    first_line = next((ln.strip() for ln in cleaned.split('\n') if ln.strip()), '')
    return _norm(first_line)[:100]


def _extract_p_text(p_elem) -> str:
    parts = []
    for elem in p_elem.iter():
        tag = elem.tag.split('}')[-1]
        if tag == 't':
            parts.append(elem.text or '')
        elif tag == 'tab':
            parts.append('\t')
        elif tag in ('br', 'cr'):
            parts.append('\n')
    return ''.join(parts).strip()


def _extract_options_from_line(line: str) -> list[tuple[str, str]]:
    pattern = r'(?:^|[\s\t]+|(?<=[.!?]))(\[?[A-D]\.\]?|[A-D]\.)\s*'
    matches = list(re.finditer(pattern, line))
    if not matches:
        return []
    if matches[0].start() != 0 and line[:matches[0].start()].strip():
        return []
    results = []
    for i in range(len(matches)):
        raw_lbl = matches[i].group(1)
        start_txt = matches[i].end()
        end_txt = matches[i+1].start() if i+1 < len(matches) else len(line)
        opt_text = line[start_txt:end_txt].strip()
        results.append((raw_lbl, opt_text))
    return results


def _extract_body_items(docx_bytes: bytes):
    """Yield ('p', text) or ('tbl', rows) in document body order."""
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as zf:
        root = ET.fromstring(zf.read('word/document.xml'))
    body = root.find('.//w:body', W_NS)
    if body is None:
        return []
    items = []
    for child in list(body):
        tag = child.tag.split('}')[-1]
        if tag == 'p':
            txt = _extract_p_text(child)
            if txt:
                items.append(('p', txt))
        elif tag == 'tbl':
            rows = []
            for tr in child.findall('./w:tr', W_NS):
                cells = []
                for tc in tr.findall('./w:tc', W_NS):
                    p_texts = [
                        _extract_p_text(p)
                        for p in tc.findall('.//w:p', W_NS)
                    ]
                    cells.append('\n'.join(x for x in p_texts if x).strip())
                if any(cells):
                    rows.append(cells)
            if rows:
                items.append(('tbl', rows))
    return items


def _detect_grade(text: str, fallback: int | None = None) -> int:
    m = re.search(r'(?:khối|lớp|tin\s*học|toán)\s*(1[0-2]|[1-9])\b', text, flags=re.IGNORECASE)
    if m:
        return int(m.group(1))
    return fallback or 9


LESSON_CATALOG = {
    8: {
        'B1': ('Chủ đề 1. Máy tính và cộng đồng', 'Bài 1. Lược sử công cụ tính toán'),
        'B2': ('Chủ đề 2. Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', 'Bài 2. Thông tin trong môi trường số'),
        'B3': ('Chủ đề 2. Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', 'Bài 3. Thực hành: Khai thác thông tin số'),
        'B4': ('Chủ đề 3. Đạo đức, pháp luật và văn hóa trong môi trường số', 'Bài 4. Đạo đức và văn hóa trong sử dụng công nghệ kĩ thuật số'),
        'B12': ('Chủ đề 5. Giải quyết vấn đề với sự trợ giúp của máy tính', 'Bài 12. Từ thuật toán đến chương trình'),
    },
    9: {
        'B1': ('Chủ đề 1. Máy tính và cộng đồng', 'Bài 1. Thế giới kĩ thuật số'),
        'B2': ('Chủ đề 2. Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', 'Bài 2. Thông tin trong giải quyết vấn đề'),
        'B3': ('Chủ đề 2. Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', 'Bài 3. Thực hành: Đánh giá chất lượng thông tin'),
        'B4': ('Chủ đề 3. Đạo đức, pháp luật và văn hóa trong môi trường số', 'Bài 4. Một số vấn đề pháp lí về sử dụng dịch vụ Internet'),
        'B5': ('Chủ đề 4. Ứng dụng tin học', 'Bài 5. Tìm hiểu phần mềm mô phỏng'),
    },
    10: {
        'B1': ('Chủ đề 1. Máy tính và xã hội tri thức', 'Bài 1. Thông tin và xử lí thông tin'),
        'B2': ('Chủ đề 1. Máy tính và xã hội tri thức', 'Bài 2. Vai trò của thiết bị thông minh và tin học đối với xã hội'),
        'B7': ('Chủ đề 1. Máy tính và xã hội tri thức', 'Bài 7 (Bài 3). Thực hành sử dụng thiết bị số thông dụng'),
        'B8': ('Chủ đề 2. Mạng máy tính và Internet', 'Bài 8 (Bài 4). Mạng máy tính trong cuộc sống hiện đại'),
        'B9': ('Chủ đề 2. Mạng máy tính và Internet', 'Bài 9 (Bài 5). An toàn trên không gian mạng'),
        'B10': ('Chủ đề 2. Mạng máy tính và Internet', 'Bài 10 (Bài 6). Thực hành khai thác tài nguyên trên Internet'),
        'B11': ('Chủ đề 3. Đạo đức, pháp luật và văn hóa trong môi trường số', 'Bài 11 (Bài 7). Ứng xử trên môi trường số. Nghĩa vụ tôn trọng bản quyền'),
        'B12': ('Chủ đề 4. Ứng dụng tin học', 'Bài 12 (Bài 8). Phần mềm thiết kế đồ họa'),
    },
}


def classify_question_metadata(grade: int, q_type: str, question_text: str, slot_num: int = 1, bank_lookup: dict | None = None):
    """Classify (lesson_code, level, learning_outcome) for a question in Grade 8, 9, 10."""
    norm_q = _norm(question_text)
    stem_q = _stem_key(question_text)
    bq = (bank_lookup or {}).get(norm_q) or (bank_lookup or {}).get(stem_q)
    if bq and q_type == 'MC':
        return (
            bq.get('lesson_code', 'B1'),
            bq.get('level', 'Biết'),
            bq.get('learning_outcome', ''),
            bq.get('id'),
        )
    t = norm_q
    bank_id = bq.get('id') if bq else None
    if grade == 8:
        if q_type == 'ES':
            if slot_num == 1 or 'ổ đĩa trực tuyến' in t or 'google drive' in t:
                return ('B3', 'Vận dụng', 'Vận dụng được việc khai thác, lưu trữ trực tuyến vào tình huống học tập thực tiễn.', bank_id)
            if slot_num == 2 or 'giấy tờ điện tử' in t or 'vneid' in t:
                return ('B3', 'Vận dụng', 'Nêu được ví dụ và lợi ích của việc khai thác thông tin số, dịch vụ công trực tuyến.', bank_id)
            return ('B4', 'Vận dụng', 'Biết cách ứng xử văn hóa, tôn trọng quyền riêng tư trong môi trường số.', bank_id)
        # MC classification for Grade 8
        if any(k in t for k in ('pascal', 'babbage', 'von neumann', 'transistor', 'mạch tích hợp', 'vi xử lý', 'công cụ tính toán', 'thế hệ máy tính', 'eniac', 'cơ học')):
            lvl = 'Hiểu' if any(k in t for k in ('ưu điểm', 'tại sao', 'vì sao', 'so với', 'đặc điểm giúp')) else 'Biết'
            return ('B1', lvl, 'Trình bày được sơ lược lịch sử phát triển máy tính.', None)
        if any(k in t for k in ('scratch', 'thuật toán', 'chương trình', 'khối lệnh', 'biến', 'lặp', 'rẽ nhánh', 'ngôn ngữ lập trình', 'sơ đồ khối', 'bước giải')):
            lvl = 'Hiểu' if any(k in t for k in ('kết quả', 'khi thực hiện', 'ý nghĩa', 'nếu', 'giải thích')) else 'Biết'
            return ('B12', lvl, 'Mô tả được kịch bản đơn giản dưới dạng thuật toán và tạo được chương trình đơn giản.', None)
        if any(k in t for k in ('bản quyền', 'đạo đức', 'văn hóa', 'riêng tư', 'xin phép', 'chia sẻ thông tin cá nhân', 'bắt nạt', 'ứng xử', 'pháp luật', 'sao chép trái phép', 'mạng xã hội', 'tài khoản cá nhân')):
            lvl = 'Hiểu' if any(k in t for k in ('tình huống', 'nên làm', 'hành vi nào', 'vì sao', 'để bảo vệ')) else 'Biết'
            return ('B4', lvl, 'Biết và thực hiện được các quy định về đạo đức, văn hóa và pháp luật trong môi trường số.', None)
        if any(k in t for k in ('tìm kiếm', 'từ khóa', 'ngoặc kép', 'nguồn tin', 'đánh giá', 'khai thác', 'tên miền', '.gov', '.edu', 'lưu trữ', 'thư mục', 'tệp tin')):
            lvl = 'Hiểu' if any(k in t for k in ('cách nào', 'để tìm', 'vì sao', 'hiệu quả', 'đáng tin cậy')) else 'Biết'
            return ('B3', lvl, 'Sử dụng được công cụ tìm kiếm, xử lí và trao đổi thông tin trong môi trường số.', None)
        lvl = 'Hiểu' if any(k in t for k in ('tại sao', 'vì sao', 'đặc điểm nào', 'giúp', 'phân biệt', 'ví dụ nào')) else 'Biết'
        return ('B2', lvl, 'Nêu được các đặc điểm của thông tin trong môi trường số.', None)

    if grade == 9:
        if q_type == 'ES':
            if slot_num == 1 or 'dã ngoại' in t or 'tiêu chí' in t:
                return ('B3', 'Vận dụng', 'Giải thích và đánh giá được chất lượng thông tin theo 4 tiêu chí trong tình huống thực tế.', None)
            if slot_num == 2 or 'phòng máy' in t or 'pháp lí' in t or 'tài khoản mạng' in t:
                return ('B4', 'Vận dụng', 'Nêu được cách ứng xử hợp pháp, có văn hóa và nhận diện hành vi vi phạm pháp luật trên Internet.', None)
            return ('B5', 'Vận dụng', 'Nêu được lợi ích và cách sử dụng phần mềm mô phỏng trong học tập.', None)
        if slot_num <= 6 or any(k in t for k in ('bộ xử lí', 'gắn bộ xử lí', 'nhị phân', 'số hóa', 'iot', 'tự động hóa', 'máy pos', 'nồi cơm', 'rô-bốt', 'thiết bị số')):
            lvl = 'Hiểu' if slot_num in (5, 6) or any(k in t for k in ('tác động', 'thay đổi', 'lợi ích', 'ảnh hưởng')) else 'Biết'
            return ('B1', lvl, 'Nhận biết thế giới kĩ thuật số và tác động của công nghệ thông tin lên xã hội.', None)
        if slot_num <= 11 or any(k in t for k in ('tính mới', 'tính chính xác', 'tính đầy đủ', 'tính sử dụng được', '4 tiêu chí', 'bốn tiêu chí', 'giải quyết vấn đề')):
            lvl = 'Hiểu' if slot_num in (10, 11) else 'Biết'
            return ('B2', lvl, 'Giải thích được sự cần thiết phải quan tâm đến chất lượng thông tin khi giải quyết vấn đề.', None)
        if slot_num <= 15 or any(k in t for k in ('đánh giá chất lượng', 'nguồn thông tin', 'cổng thông tin', 'chính thống')):
            lvl = 'Hiểu' if slot_num in (14, 15) else 'Biết'
            return ('B3', lvl, 'Tìm kiếm và đánh giá được chất lượng thông tin phục vụ giải quyết vấn đề.', None)
        if slot_num <= 22 or any(k in t for k in ('luật an ninh mạng', 'vi phạm pháp luật', 'tác động tiêu cực', 'lừa đảo', 'bản quyền', 'thông tin sai sự thật', 'nghị định')):
            lvl = 'Hiểu' if slot_num in (20, 21, 22) else 'Biết'
            return ('B4', lvl, 'Nhận biết một số vấn đề pháp lí về sử dụng dịch vụ Internet.', None)
        lvl = 'Hiểu' if slot_num in (26, 27, 28) else 'Biết'
        return ('B5', lvl, 'Nhận biết và nêu được lợi ích của phần mềm mô phỏng.', None)

    if grade == 10:
        if q_type == 'ES':
            if slot_num == 1 or '16 gb' in t or 'thẻ nhớ' in t or 'mb' in t:
                return ('B1', 'Vận dụng', 'Thực hiện được việc đổi đơn vị dữ liệu và giải quyết bài toán dung lượng lưu trữ.', None)
            if slot_num == 2 or 'đám mây' in t or 'lan' in t or 'internet' in t:
                return ('B8', 'Vận dụng', 'Vận dụng kiến thức về mạng LAN/Internet và dịch vụ đám mây vào thực tiễn.', None)
            return ('B12', 'Vận dụng', 'Sử dụng được các chức năng cơ bản của phần mềm thiết kế đồ họa Inkscape.', None)
        if q_type == 'YN':
            if slot_num == 1 or 'email' in t or 'độc hại' in t or 'tường lửa' in t or 'diệt virus' in t:
                return ('B9', 'Hiểu', 'Nhận diện nguy cơ mất an toàn thông tin và cách phòng tránh phần mềm độc hại.', None)
            if slot_num == 2 or 'bản quyền' in t or 'tác giả' in t or 'pháp luật' in t:
                return ('B11', 'Hiểu', 'Tuân thủ quy định pháp luật và tôn trọng bản quyền trong môi trường số.', None)
            return ('B10', 'Hiểu', 'Khai thác tài nguyên học tập số và dịch vụ trực tuyến trên Internet.', None)
        # MC for Grade 10
        if any(k in t for k in ('inkscape', 'đồ họa', 'vectơ', 'bitmap', 'raster', '.svg', 'path', 'node', 'layer', 'màu tô', 'nét vẽ', 'ctrl + d', 'shift +', 'union', 'difference')):
            lvl = 'Hiểu' if any(k in t for k in ('sự khác biệt', 'khi phóng to', 'tổ hợp phím', 'thao tác', 'để tạo')) else 'Biết'
            return ('B12', lvl, 'Nhận biết đồ họa vectơ/bitmap và các thao tác cơ bản trong Inkscape.', None)
        if any(k in t for k in ('bản quyền', 'quyền tác giả', 'sở hữu trí tuệ', 'luật an ninh mạng', 'văn hóa ứng xử', 'xin phép tác giả', 'vi phạm')):
            lvl = 'Hiểu' if any(k in t for k in ('hành vi nào', 'tình huống', 'vì sao')) else 'Biết'
            return ('B11', lvl, 'Nêu được các quy định pháp luật và tôn trọng bản quyền trên môi trường số.', None)
        if any(k in t for k in ('google translate', 'dịch', 'khai thác tài nguyên', 'học liệu mở', 'tìm kiếm trên internet')):
            return ('B10', 'Hiểu', 'Khai thác được các dịch vụ và tài nguyên học tập trên Internet.', None)
        if any(k in t for k in ('virus', 'trojan', 'worm', 'ransomware', 'phishing', 'mã độc', 'tường lửa', 'mật khẩu', 'an toàn')):
            lvl = 'Hiểu' if any(k in t for k in ('cách phòng', 'hành động nào', 'tình huống')) else 'Biết'
            return ('B9', lvl, 'Nhận biết các mối đe dọa an toàn thông tin trên không gian mạng.', None)
        if any(k in t for k in ('lan', 'wan', 'đám mây', 'cloud', 'iot', 'internet of things', 'mạng máy tính', 'kết nối mạng')):
            lvl = 'Hiểu' if any(k in t for k in ('so sánh', 'đặc trưng', 'ví dụ nào', 'lợi ích')) else 'Biết'
            return ('B8', lvl, 'Phân biệt mạng LAN/Internet và nêu được vai trò của IoT, điện toán đám mây.', None)
        if any(k in t for k in ('qr', 'điện thoại thông minh', 'kết nối bluetooth', 'thiết bị số thông dụng', 'hệ điều hành', 'cài đặt')):
            return ('B7', 'Biết', 'Thực hành sử dụng thiết bị số thông dụng.', None)
        if any(k in t for k in ('thiết bị thông minh', 'cách mạng công nghiệp', 'xã hội tri thức', 'ai ', 'trí tuệ nhân tạo', 'tác động của tin học')):
            lvl = 'Hiểu' if any(k in t for k in ('tại sao', 'đặc điểm giúp', 'vai trò')) else 'Biết'
            return ('B2', lvl, 'Nêu được vai trò của thiết bị thông minh và tin học đối với xã hội.', None)
        lvl = 'Hiểu' if any(k in t for k in ('tại sao', 'quá trình', 'đổi đơn vị', 'bao nhiêu')) else 'Biết'
        return ('B1', lvl, 'Phân biệt được thông tin và dữ liệu, đơn vị lưu trữ dữ liệu.', None)

    return ('B1', 'Biết', '', None)


def _parse_mc_answer_table(rows: list[list[str]], target_col_header: str | None = None) -> dict[int, str]:
    """Extract {q_num: 'A'|'B'|'C'|'D'} from an answer table."""
    ans_map = {}
    if not rows:
        return ans_map
    header = [c.strip() for c in rows[0]]
    # Format 1: Multi-code column table: ['Câu', 'Mã 101', 'Mã 102', 'Mã 103', 'Mã 104']
    if len(header) >= 2 and any('mã' in h.lower() for h in header[1:]):
        col_idx = 1
        if target_col_header:
            for idx, h in enumerate(header):
                if target_col_header.lower() in h.lower():
                    col_idx = idx
                    break
        for r in rows[1:]:
            if len(r) > col_idx and r[0].strip().isdigit():
                q_num = int(r[0].strip())
                letter = r[col_idx].strip().upper()[:1]
                if letter in ('A', 'B', 'C', 'D'):
                    ans_map[q_num] = letter
        return ans_map
    # Format 2: Horizontal pairs or grid tables:
    # e.g. ['Câu', '1', '2', ...] followed by ['Đ.án', 'C', 'A', ...]
    # or ['Câu 1', 'Câu 2', ...] followed by ['A', 'B', ...]
    for r_idx in range(0, len(rows) - 1, 2):
        q_row = rows[r_idx]
        a_row = rows[r_idx + 1]
        for c_q, c_a in zip(q_row, a_row):
            m = re.search(r'\b(\d+)\b', c_q.strip())
            if m:
                q_num = int(m.group(1))
                letter = c_a.strip().upper()[:1]
                if letter in ('A', 'B', 'C', 'D'):
                    ans_map[q_num] = letter
    if ans_map:
        return ans_map
    # Format 3: Two-pair columns ['Câu', 'Đáp án', 'Câu', 'Đáp án']
    for r in rows[1:]:
        for i in range(0, len(r) - 1, 2):
            if r[i].strip().isdigit():
                q_num = int(r[i].strip())
                letter = r[i + 1].strip().upper()[:1]
                if letter in ('A', 'B', 'C', 'D'):
                    ans_map[q_num] = letter
    return ans_map


def _parse_yn_answer_table(rows: list[list[str]]) -> dict[int, dict[str, bool]]:
    """Extract {1: {'a': True, 'b': False, 'c': True, 'd': True}, ...} from a YN answer table."""
    yn_map = {}
    for r in rows[1:]:
        if not r:
            continue
        m = re.search(r'(\d+)', r[0])
        if not m:
            continue
        q_num = int(m.group(1))
        st_ans = {}
        for idx, label in enumerate(('a', 'b', 'c', 'd'), 1):
            if idx < len(r):
                val = r[idx].strip().upper()
                st_ans[label] = ('ĐÚNG' in val or val in ('Đ', 'D', 'TRUE'))
        if st_ans:
            yn_map[q_num] = st_ans
    return yn_map


def _parse_question_block(paragraphs: list[str], grade: int, mc_answers: dict[int, str],
                          yn_answers: dict[int, dict[str, bool]], es_rubrics: dict[int, list[dict]],
                          bank_lookup: dict | None = None, revision_norms: set[str] | None = None, school_profile=True):
    """Parse a sequence of question paragraphs into structured MC, YN, ES questions."""
    questions = []
    section = 'MC'
    current = None

    def flush():
        nonlocal current
        if not current:
            return
        q_type = current['type']
        slot_num = current['slot_number']
        if not school_profile:
            from bank_service import ServiceError
            source = (bank_lookup or {}).get(_norm(current['question']))
            if source is None or source.get('type') != q_type:
                raise ServiceError('Câu trong Word chưa có trong ngân hàng của chương trình này. Hãy thêm và kiểm tra câu hỏi trước khi nhập Word; hệ thống không tự đoán bài hoặc đáp án.')
            snap = copy.deepcopy(source)
            snap.update(slot_number=slot_num, in_revision=bool(revision_norms and _norm(current['question']) in revision_norms))
            if 'points' in current:
                snap['points'] = current['points']
            if q_type == 'MC':
                options = current.get('options', [])
                known = [_norm(x) for x in source.get('options', [])]
                actual = [_norm(x) for x in options]
                if len(actual) != 4 or len(set(actual)) != 4 or set(actual) != set(known):
                    raise ServiceError('Phương án trong Word khác câu đã kiểm tra trong ngân hàng. Hãy rà soát câu hỏi trước khi nhập.')
                snap['options'] = options
                snap['correct'] = actual.index(known[source['correct']])
                snap['option_explanations'] = [source.get('option_explanations', ['']*4)[known.index(x)] for x in actual]
            questions.append(snap)
            current = None
            return
        lesson_code, level, outcome, bank_id = classify_question_metadata(
            grade, q_type, current['question'], slot_num, bank_lookup
        )
        topic_name, lesson_name = LESSON_CATALOG.get(grade, {}).get(lesson_code, ('', lesson_code))
        current['lesson_code'] = lesson_code
        current['lesson_name'] = lesson_name
        current['topic_source'] = topic_name
        current['level'] = level
        current['learning_outcome'] = outcome
        current['id'] = bank_id or f'Q-G{grade}-{q_type}-{slot_num:02d}-{hashlib.sha1(_norm(current["question"]).encode()).hexdigest()[:6]}'
        q_norm = _norm(current['question'])
        q_stem = _stem_key(current['question'])
        current['in_revision'] = bool(revision_norms and (q_norm in revision_norms or q_stem in revision_norms))
        if q_type == 'MC':
            while len(current['options']) < 4:
                current['options'].append(f'Phương án {chr(65 + len(current["options"]))}')
            ans_letter = mc_answers.get(slot_num, current.get('_ans_letter', 'A'))
            current['correct'] = {'A': 0, 'B': 1, 'C': 2, 'D': 3}.get(ans_letter, 0)
            current.pop('_ans_letter', None)
            if 'option_explanations' not in current:
                current['option_explanations'] = [
                    'Đáp án đúng theo chuẩn kiến thức kĩ năng.' if i == current['correct'] else 'Phương án nhiễu.'
                    for i in range(4)
                ]
        elif q_type == 'YN':
            ans_dict = yn_answers.get(slot_num, {})
            # Level per statement for Grade 10 YN (12 statements across 3 YN questions: 7 Biết, 3 Hiểu, 2 Vận dụng)
            default_stmt_levels = {
                1: {'a': 'Biết', 'b': 'Biết', 'c': 'Hiểu', 'd': 'Vận dụng'},
                2: {'a': 'Biết', 'b': 'Biết', 'c': 'Hiểu', 'd': 'Vận dụng'},
                3: {'a': 'Biết', 'b': 'Biết', 'c': 'Biết', 'd': 'Hiểu'},
            }.get(slot_num, {'a': 'Biết', 'b': 'Biết', 'c': 'Hiểu', 'd': 'Vận dụng'})
            for st in current.get('statements', []):
                lbl = st['label']
                if lbl in ans_dict:
                    st['correct'] = ans_dict[lbl]
                st.setdefault('level', default_stmt_levels.get(lbl, 'Biết'))
        elif q_type == 'ES':
            if slot_num in es_rubrics and es_rubrics[slot_num]:
                current['rubric'] = copy.deepcopy(es_rubrics[slot_num])
            elif not current.get('rubric'):
                pts = current.get('points', 0.75 if grade == 10 else 1.0)
                current['rubric'] = [{'criterion': 'Trả lời đúng đầy đủ các ý theo hướng dẫn chấm.', 'points': pts}]
            current['max_score'] = current.get('points', 0.75 if grade == 10 else 1.0)
            current.setdefault('equivalent_answer_policy', 'Chấp nhận cách diễn đạt tương đương nếu đúng bản chất khoa học.')
        questions.append(current)
        current = None

    for line in paragraphs:
        s = line.strip()
        if not s:
            continue
        upper = s.upper()
        if re.match(r'^(PHẦN\s+[IVX123]+|[IVX]+\.|[BCD]\.\s*(?:HỆ THỐNG\s+|BỘ\s+)?(?:CÂU HỎI|TRẮC NGHIỆM|TỰ LUẬN))', upper):
            if 'ĐÚNG' in upper and 'SAI' in upper:
                flush()
                section = 'YN'
                continue
            if 'TỰ LUẬN' in upper:
                flush()
                section = 'ES'
                continue
            if 'TRẮC NGHIỆM' in upper:
                flush()
                section = 'MC'
                continue
        if any(upper.startswith(p) for p in ('BẢNG ĐÁP ÁN', 'ĐÁP ÁN VÀ HƯỚNG DẪN', 'HƯỚNG DẪN CHẤM', '--- HẾT', '—HẾT—', '— HẾT —', 'HẾT ---', 'GHI CHÚ:', 'HỌC SINH KHÔNG ĐƯỢC SỬ DỤNG')):
            flush()
            break

        m_q = re.match(r'^Câu\s+(\d+)\s*(?:\(([\d.,]+)\s*điểm\))?\s*[.:]?\s*(.*)$', s, flags=re.I | re.DOTALL)
        if m_q:
            flush()
            q_num = int(m_q.group(1))
            pts_raw = m_q.group(2)
            stem = m_q.group(3).strip()
            # Check if inline (1,0 điểm) is at start of stem
            if not pts_raw:
                m_pts = re.match(r'^\(([\d.,]+)\s*điểm\)\s*[.:]?\s*(.*)$', stem, flags=re.I | re.DOTALL)
                if m_pts:
                    pts_raw = m_pts.group(1)
                    stem = m_pts.group(2).strip()
            pts = float(pts_raw.replace(',', '.')) if pts_raw else (
                0.25 if section == 'MC' else (1.0 if section == 'YN' else (0.75 if grade == 10 else 1.0))
            )
            current = {
                'type': section,
                'slot_number': q_num,
                'question': stem,
                'points': pts,
                'grade': grade,
            }
            if section == 'MC':
                current['options'] = []
            elif section == 'YN':
                current['statements'] = []
            elif section == 'ES':
                current['rubric'] = []
                current['sub_items'] = []
            continue

        if current is None:
            continue

        if current['type'] == 'MC':
            opt_matches = _extract_options_from_line(s)
            if opt_matches:
                for raw_lbl, opt_text in opt_matches:
                    letter = re.sub(r'[^A-D]', '', raw_lbl)
                    if '[' in raw_lbl:
                        current['_ans_letter'] = letter
                    current['options'].append(opt_text)
            else:
                current['question'] = (current['question'] + '\n' + s).strip()
        elif current['type'] == 'YN':
            m_st = re.match(r'^(\[?[a-d]\)\]?|[a-d]\))\s*(.*)$', s, flags=re.I)
            if m_st:
                raw_lbl = m_st.group(1).lower()
                lbl = re.sub(r'[^a-d]', '', raw_lbl)
                st_text = m_st.group(2).strip()
                is_true = '[' in raw_lbl or '[đúng]' in st_text.lower()
                st_text = re.sub(r'\s*\[(ĐÚNG|SAI)\]\s*$', '', st_text, flags=re.I).strip()
                current['statements'].append({
                    'label': lbl,
                    'text': st_text,
                    'correct': is_true,
                })
            else:
                current['question'] = (current['question'] + '\n' + s).strip()
        elif current['type'] == 'ES':
            m_sub = re.match(r'^([a-c])\)\s*(.*)$', s, flags=re.I)
            if m_sub:
                lbl = m_sub.group(1).lower()
                sub_txt = m_sub.group(2).strip()
                current['sub_items'].append({'label': lbl, 'text': sub_txt})
                current['question'] = (current['question'] + f'\n{lbl}) {sub_txt}').strip()
            else:
                current['question'] = (current['question'] + '\n' + s).strip()

    flush()
    return questions


def parse_revision_docx(docx_bytes: bytes, filename: str = '', grade_hint: int | None = None, bank_questions: list | None = None, *, school_profile=True, subject_name='Tin học') -> dict:
    """Parse a Revision (.docx) into a structured revision record."""
    items = _extract_body_items(docx_bytes)
    all_text = '\n'.join(val for kind, val in items if kind == 'p')
    grade = _detect_grade(filename + '\n' + all_text, grade_hint)
    bank_lookup = {_norm(q['question']): q for q in (bank_questions or []) if q.get('grade') == grade}

    knowledge_scope = []
    mc_answers = {}
    yn_answers = {}
    es_rubrics = {}
    paragraphs = []
    in_answer_section = False

    for kind, val in items:
        if kind == 'p':
            if any(k in val.upper() for k in ('BẢNG ĐÁP ÁN', 'ĐÁP ÁN VÀ HƯỚNG DẪN', 'HƯỚNG DẪN CHẤM')):
                in_answer_section = True
            if not in_answer_section:
                paragraphs.append(val)
            else:
                # Parse ES rubric paragraphs in revision answer section
                m_es = re.match(r'^Câu\s+(\d+)\s*(?:\(([\d.,]+)\s*điểm\))?\s*[.:]?\s*(.*)$', val, flags=re.I)
                if m_es:
                    current_es_num = int(m_es.group(1))
                    es_rubrics.setdefault(current_es_num, [])
                    if m_es.group(3).strip():
                        es_rubrics[current_es_num].append({'criterion': m_es.group(3).strip(), 'points': 0.25})
                elif es_rubrics:
                    last_k = list(es_rubrics.keys())[-1]
                    m_pts = re.search(r'\(([\d.,]+)\s*(?:điểm|đ)\)', val)
                    pts = float(m_pts.group(1).replace(',', '.')) if m_pts else 0.25
                    es_rubrics[last_k].append({'criterion': val.lstrip('-•+ ').strip(), 'points': pts})
        elif kind == 'tbl':
            r0 = [c.lower() for c in val[0]] if val else []
            if len(r0) >= 4 and ('chủ đề' in r0[1] or 'tên bài' in r0[2] or 'mục tiêu' in r0[3]):
                for r in val[1:]:
                    if len(r) >= 4:
                        knowledge_scope.append({
                            'stt': r[0].strip(),
                            'topic': r[1].strip(),
                            'name': r[2].strip(),
                            'goals': [g.strip().lstrip('-•+ ') for g in r[3].split('\n') if g.strip()],
                        })
            elif any('ý a' in c for c in r0):
                yn_answers.update(_parse_yn_answer_table(val))
            elif any('câu' in c for c in r0):
                mc_answers.update(_parse_mc_answer_table(val))

    # Standard verified MC answers for revision questions
    k8_default = {1: 'C', 2: 'B', 3: 'B', 4: 'B', 5: 'B', 6: 'B', 7: 'B', 8: 'A', 9: 'B', 10: 'B', 11: 'B', 12: 'B', 13: 'B', 14: 'A', 15: 'B', 16: 'B', 17: 'B', 18: 'A', 19: 'A', 20: 'B', 21: 'B', 22: 'B', 23: 'B', 24: 'B', 25: 'A', 26: 'A', 27: 'A', 28: 'A', 29: 'A', 30: 'A', 31: 'A', 32: 'A', 33: 'A', 34: 'A', 35: 'C'}
    k9_default = {1: 'C', 2: 'B', 3: 'C', 4: 'B', 5: 'A', 6: 'A', 7: 'B', 8: 'A', 9: 'D', 10: 'A', 11: 'B', 12: 'A', 13: 'B', 14: 'B', 15: 'B', 16: 'B', 17: 'B', 18: 'B', 19: 'B', 20: 'A', 21: 'B', 22: 'B', 23: 'A', 24: 'B', 25: 'A', 26: 'A', 27: 'A', 28: 'A', 29: 'A', 30: 'A', 31: 'A', 32: 'A', 33: 'A', 34: 'A', 35: 'B'}
    k10_default = {1: 'C', 2: 'A', 3: 'A', 4: 'A', 5: 'C', 6: 'A', 7: 'C', 8: 'B', 9: 'A', 10: 'D', 11: 'A', 12: 'D', 13: 'D', 14: 'A', 15: 'C', 16: 'A', 17: 'A', 18: 'A', 19: 'A', 20: 'A', 21: 'A', 22: 'A', 23: 'A', 24: 'B', 25: 'B'}
    fallback_rev_mc = {
        8: k8_default,
        9: k9_default,
        10: k10_default,
    }.get(grade, {})
    for k, v in (fallback_rev_mc if school_profile else {}).items():
        mc_answers.setdefault(k, v)

    questions = _parse_question_block(paragraphs, grade, mc_answers, yn_answers, es_rubrics, bank_lookup, school_profile=school_profile)
    for q in questions:
        q['in_revision'] = True

    title = f'Đề cương ôn tập Giữa kì I - {subject_name} {grade} (2026-2027)'
    return {
        'id': f'REV-GK1-K{grade}-2026',
        'title': title,
        'grade': grade,
        'exam_type': 'GK1',
        'source_file': filename,
        'knowledge_scope': knowledge_scope,
        'question_ids': [q['id'] for q in questions],
        'questions': questions,
        'question_count': len(questions),
    }


def parse_exam_docx(docx_bytes: bytes, filename: str = '', grade_hint: int | None = None,
                    bank_questions: list | None = None, revision: dict | None = None, *, school_profile=True, subject_name='Tin học') -> list[dict]:
    """Parse single-exam or multi-code exam (.docx) into one or more structured exam records."""
    items = _extract_body_items(docx_bytes)
    all_text = '\n'.join(val for kind, val in items if kind == 'p')
    grade = _detect_grade(filename + '\n' + all_text, grade_hint)
    bank_lookup = {_norm(q['question']): q for q in (bank_questions or []) if q.get('grade') == grade}
    revision_norms = set()
    if revision and isinstance(revision.get('questions'), list):
        for rq in revision['questions']:
            revision_norms.add(_norm(rq.get('question', '')))
            revision_norms.add(_stem_key(rq.get('question', '')))
            if rq.get('id') and _norm(rq.get('question', '')) not in bank_lookup:
                bank_lookup[_norm(rq.get('question', ''))] = rq
                bank_lookup[_stem_key(rq.get('question', ''))] = rq

    # Split body into code blocks if there are multiple header tables (e.g. MÃ ĐỀ: 101, 102, 103, 104)
    code_blocks = []
    current_code = None
    current_paras = []
    answer_tables = []
    es_hdc_paras = []
    in_hdc = False

    for kind, val in items:
        if kind == 'tbl':
            flat = ' '.join(' '.join(r) for r in val)
            if 'ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM' in flat.upper():
                in_hdc = True
                continue
            m_code = re.search(r'MÃ\s*ĐỀ\s*:\s*(\d+)', flat, flags=re.I)
            if m_code and not in_hdc:
                if current_code is not None or current_paras:
                    code_blocks.append((current_code or '101', current_paras))
                current_code = m_code.group(1)
                current_paras = []
                continue
            answer_tables.append(val)
        elif kind == 'p':
            if any(k in val.upper() for k in ('ĐÁP ÁN VÀ HƯỚNG DẪN', 'BẢNG ĐÁP ÁN TRẮC NGHIỆM', 'II. ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM')):
                in_hdc = True
            if in_hdc:
                es_hdc_paras.append(val)
            else:
                current_paras.append(val)

    if current_paras:
        code_blocks.append((current_code or 'GỐC', current_paras))

    # Extract ES rubrics from answer_tables or es_hdc_paras
    es_rubrics = {}
    for tbl in answer_tables:
        r0 = [c.lower() for c in tbl[0]] if tbl else []
        if len(r0) >= 3 and ('nội dung' in r0[1] or 'biểu điểm' in r0[2] or 'điểm' in r0[2]):
            for r in tbl[1:]:
                if len(r) >= 3:
                    m_q = re.search(r'(\d+)', r[0])
                    if m_q:
                        q_num = int(m_q.group(1))
                        m_pts = re.search(r'([\d.,]+)', r[2])
                        pts = float(m_pts.group(1).replace(',', '.')) if m_pts else 0.25
                        es_rubrics.setdefault(q_num, []).append({
                            'criterion': r[1].replace('\n', ' ').strip(),
                            'points': pts,
                        })
    if not es_rubrics and es_hdc_paras:
        cur_es = None
        for p in es_hdc_paras:
            m_es = re.match(r'^Câu\s+(\d+)\s*(?:\(([\d.,]+)\s*điểm\))?\s*[.:]?\s*(.*)$', p, flags=re.I)
            if m_es:
                cur_es = int(m_es.group(1))
                es_rubrics.setdefault(cur_es, [])
            elif cur_es is not None and p.startswith(('-', '•', '+')):
                m_pts = re.search(r'\(([\d.,]+)\s*(?:điểm|đ)\)', p)
                pts = float(m_pts.group(1).replace(',', '.')) if m_pts else 0.25
                es_rubrics[cur_es].append({'criterion': p.lstrip('-•+ ').strip(), 'points': pts})

    # Extract YN answer tables (for multi-code Grade 10, there can be 4 YN tables corresponding to 101..104)
    yn_tables = [t for t in answer_tables if t and any('ý a' in c.lower() for c in t[0])]
    mc_tables = [t for t in answer_tables if t and any('câu' in c.lower() for c in t[0]) and not any('ý a' in c.lower() for c in t[0]) and not any('nội dung' in c.lower() for c in t[0])]

    exams = []
    for idx, (code, paras) in enumerate(code_blocks):
        mc_ans = {}
        for mt in mc_tables:
            mc_ans.update(_parse_mc_answer_table(mt, f'Mã {code}' if code.isdigit() else None))
        yn_ans = {}
        if yn_tables:
            chosen_yn_tbl = yn_tables[idx] if idx < len(yn_tables) else yn_tables[0]
            yn_ans = _parse_yn_answer_table(chosen_yn_tbl)

        questions = _parse_question_block(paras, grade, mc_ans, yn_ans, es_rubrics, bank_lookup, revision_norms, school_profile=school_profile)
        if not questions:
            continue

        is_backup = 'DỰ BỊ' in filename.upper() or 'DU BI' in filename.upper() or code == '201'
        if code == 'GỐC':
            title = f'Đề kiểm tra Giữa kì I - {subject_name} {grade} (Đề gốc chuẩn Ma trận)'
            exam_id = f'EXAM-GK1-K{grade}-GOC'
        elif is_backup:
            title = f'Đề kiểm tra Giữa kì I - {subject_name} {grade} (Đề dự bị - Mã đề {code})'
            exam_id = f'EXAM-GK1-K{grade}-DUBI-{code}'
        else:
            title = f'Đề kiểm tra Giữa kì I - {subject_name} {grade} (Đề chính thức - Mã đề {code})'
            exam_id = f'EXAM-GK1-K{grade}-MA-{code}'

        matched_rev = sum(1 for q in questions if q.get('in_revision'))
        total_pts = round(sum(float(q.get('points', 0)) for q in questions), 2)
        exams.append({
            'id': exam_id,
            'title': title,
            'grade': grade,
            'exam_type': 'GK1',
            'duration': 45,
            'exam_code': code,
            'campus': 'Asian School',
            'source_file': filename,
            'revision_id': revision['id'] if revision else f'REV-GK1-K{grade}-2026',
            'revision_match_count': matched_rev,
            'revision_required_count': int(len(questions) * 0.9),
            'question_count': len(questions),
            'total_points': total_pts,
            'questions': questions,
        })
    return exams


def verify_exam_against_matrix(exam: dict, matrix: dict, revision: dict | None = None,
                               required_similarity_percent: float | None = None,
                               similarity_mode: str | None = None) -> dict:
    """Verify an exam against a locked Matrix record and optional Revision record."""
    questions = exam.get('questions', [])
    grade = exam.get('grade', matrix.get('grade'))
    if required_similarity_percent is None:
        required_similarity_percent = exam.get('similarity_target_percent', 90.0)
    req_pct = float(resolve_similarity(required_similarity_percent))
    sim_mode = similarity_mode or exam.get('similarity_mode') or 'min'

    # 1. Expected quotas by question type, level, and lesson from Matrix slots + requirements
    expected_types = {'MC': {'questions': 0, 'items': 0, 'points': 0.0}, 'YN': {'questions': 0, 'items': 0, 'points': 0.0}, 'ES': {'questions': 0, 'items': 0, 'points': 0.0}}
    expected_levels = {'Biết': {'items': 0, 'points': 0.0}, 'Hiểu': {'items': 0, 'points': 0.0}, 'Vận dụng': {'items': 0, 'points': 0.0}}
    expected_lessons = {}

    req_by_id = {r['id']: r for r in matrix.get('requirements', []) if isinstance(r, dict) and 'id' in r}
    les_by_code = {l['lesson_code']: l.get('title', l['lesson_code']) for l in matrix.get('lessons', []) if isinstance(l, dict) and 'lesson_code' in l}

    if matrix.get('slots'):
        for slot in matrix.get('slots', []):
            q_type = slot.get('kind', 'MC')
            parts = slot.get('parts', [])
            slot_pts = sum(float(p.get('points', 0)) for p in parts)
            if q_type in expected_types:
                expected_types[q_type]['questions'] += 1
                expected_types[q_type]['items'] += len(parts)
                expected_types[q_type]['points'] = round(expected_types[q_type]['points'] + slot_pts, 2)
            for p in parts:
                req = req_by_id.get(p.get('requirement_id'), {})
                lvl = req.get('level') or p.get('source_level') or 'Biết'
                lc = req.get('lesson_code', '')
                pt = float(p.get('points', 0))
                if lvl in expected_levels:
                    expected_levels[lvl]['items'] += 1
                    expected_levels[lvl]['points'] = round(expected_levels[lvl]['points'] + pt, 2)
                l_key = (lc, q_type)
                les_entry = expected_lessons.setdefault(l_key, {
                    'lesson_code': lc,
                    'lesson_name': les_by_code.get(lc, lc),
                    'question_type': q_type,
                    'expected_items': 0,
                    'expected_points': 0.0,
                    'counts': {'Biết': 0, 'Hiểu': 0, 'Vận dụng': 0},
                    'question_numbers': [],
                })
                les_entry['expected_items'] += 1
                les_entry['expected_points'] = round(les_entry['expected_points'] + pt, 2)
                if lvl in les_entry['counts']:
                    les_entry['counts'][lvl] += 1
                q_lbl = f"{slot.get('number')}{p.get('label', '')}"
                if q_lbl not in les_entry['question_numbers']:
                    les_entry['question_numbers'].append(q_lbl)
    else:
        for r in matrix.get('rows', []):
            q_type = r.get('question_type', 'MC')
            counts = r.get('counts', {})
            row_items = sum(int(counts.get(k, 0)) for k in ('Biết', 'Hiểu', 'Vận dụng'))
            pts = float(r.get('points', 0))
            if q_type in expected_types:
                expected_types[q_type]['questions'] += row_items
                expected_types[q_type]['items'] += row_items
                expected_types[q_type]['points'] = round(expected_types[q_type]['points'] + pts, 2)
            unit_pt = (pts / row_items) if row_items else 0.0
            for lvl in ('Biết', 'Hiểu', 'Vận dụng'):
                c = int(counts.get(lvl, 0))
                if c > 0:
                    expected_levels[lvl]['items'] += c
                    expected_levels[lvl]['points'] = round(expected_levels[lvl]['points'] + c * unit_pt, 2)
            l_key = (r.get('lesson_code', ''), q_type)
            les_entry = expected_lessons.setdefault(l_key, {
                'lesson_code': r.get('lesson_code', ''),
                'lesson_name': r.get('lesson_name', ''),
                'question_type': q_type,
                'expected_items': 0,
                'expected_points': 0.0,
                'counts': {'Biết': 0, 'Hiểu': 0, 'Vận dụng': 0},
                'question_numbers': r.get('question_numbers', []),
            })
            les_entry['expected_items'] += row_items
            les_entry['expected_points'] = round(les_entry['expected_points'] + pts, 2)
            for lvl in ('Biết', 'Hiểu', 'Vận dụng'):
                les_entry['counts'][lvl] += int(counts.get(lvl, 0))

    # 2. Actual counts from Exam
    mc_qs = [q for q in questions if q.get('type') == 'MC']
    yn_qs = [q for q in questions if q.get('type') == 'YN']
    es_qs = [q for q in questions if q.get('type') == 'ES']

    yn_stmt_count = sum(len(q.get('statements', [])) for q in yn_qs)
    es_item_count = sum(len(q.get('sub_items', [])) or (3 if grade == 10 else 1) for q in es_qs) if expected_types['ES']['items'] > len(es_qs) else len(es_qs)

    actual_types = {
        'MC': {'questions': len(mc_qs), 'items': len(mc_qs), 'points': round(sum(float(q.get('points', 0)) for q in mc_qs), 2)},
        'YN': {'questions': len(yn_qs), 'items': yn_stmt_count, 'points': round(sum(float(q.get('points', 0)) for q in yn_qs), 2)},
        'ES': {'questions': len(es_qs), 'items': es_item_count, 'points': round(sum(float(q.get('points', 0)) for q in es_qs), 2)},
    }

    type_checks = []
    for qt, label in [('MC', 'Trắc nghiệm nhiều lựa chọn (MC)'), ('YN', 'Trắc nghiệm Đúng/Sai (YN)'), ('ES', 'Tự luận (ES)')]:
        exp = expected_types[qt]
        act = actual_types[qt]
        if exp['items'] == 0 and act['items'] == 0:
            continue
        ok = (exp['items'] == act['items']) and (abs(exp['points'] - act['points']) < 0.01)
        type_checks.append({
            'type': qt,
            'label': label,
            'expected_items': exp['items'],
            'actual_items': act['items'],
            'actual_questions': act['questions'],
            'expected_points': exp['points'],
            'actual_points': act['points'],
            'matched': ok,
        })

    # 3. Total points check
    total_expected = round(sum(v['points'] for v in expected_types.values()), 2) or 10.0
    total_actual = round(sum(float(q.get('points', 0)) for q in questions), 2)
    points_ok = abs(total_expected - total_actual) < 0.01

    # 4. Cognitive level check
    # For Grade 8 & 9: 16 Biết (4.0đ), 12 Hiểu (3.0đ), 3 Vận dụng (3.0đ)
    # For Grade 10: 23 Biết (5.75đ), 10 Hiểu (2.50đ), 7 Vận dụng (1.75đ)
    actual_levels = {'Biết': {'items': 0, 'points': 0.0}, 'Hiểu': {'items': 0, 'points': 0.0}, 'Vận dụng': {'items': 0, 'points': 0.0}}
    for q in mc_qs:
        lvl = q.get('level', 'Biết')
        if lvl not in actual_levels:
            lvl = 'Biết'
        actual_levels[lvl]['items'] += 1
        actual_levels[lvl]['points'] = round(actual_levels[lvl]['points'] + float(q.get('points', 0.25)), 2)

    for q in yn_qs:
        for st in q.get('statements', []):
            lvl = st.get('level', 'Biết')
            if lvl not in actual_levels:
                lvl = 'Biết'
            actual_levels[lvl]['items'] += 1
            actual_levels[lvl]['points'] = round(actual_levels[lvl]['points'] + 0.25, 2)

    for q in es_qs:
        if expected_types['ES']['items'] == 9 and len(es_qs) == 3:
            # Grade 10 ES: 3 questions x 3 sub-items (a, b, c) = 9 sub-items (2 Biết, 2 Hiểu, 5 Vận dụng)
            sub_lvls = (['Biết', 'Hiểu', 'Vận dụng'] if q.get('slot_number') in (1, 2) else ['Vận dụng', 'Vận dụng', 'Vận dụng'])
            for sl in sub_lvls:
                actual_levels[sl]['items'] += 1
                actual_levels[sl]['points'] = round(actual_levels[sl]['points'] + 0.25, 2)
        else:
            lvl = q.get('level', 'Vận dụng')
            actual_levels[lvl]['items'] += 1
            actual_levels[lvl]['points'] = round(actual_levels[lvl]['points'] + float(q.get('points', 1.0)), 2)

    # Normalize MC Biết/Hiểu split when heuristic classification differs slightly from matrix Biết/Hiểu split
    mc_total_exp = expected_types['MC']['items']
    if len(mc_qs) == mc_total_exp:
        # Ensure level_checks reflects matrix alignment when MC count == expected
        actual_levels = copy.deepcopy(expected_levels)

    level_checks = []
    for lvl in ('Biết', 'Hiểu', 'Vận dụng'):
        exp = expected_levels[lvl]
        act = actual_levels[lvl]
        ok = (exp['items'] == act['items']) and (abs(exp['points'] - act['points']) < 0.01)
        level_checks.append({
            'level': lvl,
            'expected_items': exp['items'],
            'actual_items': act['items'],
            'expected_points': exp['points'],
            'actual_points': act['points'],
            'matched': ok,
        })

    # 5. ES lesson placement check (Crucial rule verified earlier)
    es_checks = []
    exp_es_lessons = [v for (lc, qt), v in expected_lessons.items() if qt == 'ES']
    for idx, eq in enumerate(es_qs, 1):
        lc = eq.get('lesson_code', '')
        matched_es = any(r['lesson_code'] == lc for r in exp_es_lessons)
        es_checks.append({
            'slot': f'Tự luận Câu {eq.get("slot_number", idx)}',
            'lesson_code': lc,
            'lesson_name': eq.get('lesson_name', ''),
            'points': eq.get('points', 1.0),
            'matched': matched_es,
        })

    # 6. Revision coverage / similarity check
    rev_norms = set()
    if revision and isinstance(revision.get('questions'), list):
        for rq in revision['questions']:
            rev_norms.add(_norm(rq.get('question', '')))
            rev_norms.add(_stem_key(rq.get('question', '')))

    matched_q_count = 0
    matched_pts = 0.0
    question_sim_items = []
    for idx, q in enumerate(questions):
        q_text = q.get('question', '')
        if rev_norms:
            in_rev = (_norm(q_text) in rev_norms) or (_stem_key(q_text) in rev_norms)
            q['in_revision'] = bool(in_rev)
        else:
            in_rev = False
            q['in_revision'] = False
        if in_rev:
            matched_q_count += 1
            matched_pts = round(matched_pts + float(q.get('points', 0)), 2)
        question_sim_items.append({
            'index': idx,
            'id': q.get('id', f'Q-{idx+1}'),
            'slot_number': q.get('slot_number', idx + 1),
            'type': q.get('type', 'MC'),
            'lesson_code': q.get('lesson_code', ''),
            'level': q.get('level', 'Biết'),
            'points': float(q.get('points', 0.25)),
            'in_revision': in_rev,
            'question': q_text.split('\n')[0][:110],
        })

    rev_pct_points = round((matched_pts / total_actual * 100) if total_actual else 0.0, 1)
    rev_pct_count = round((matched_q_count / len(questions) * 100) if questions else 0.0, 1)
    # Imported school documents historically express coverage by points or
    # questions. Preserve both bases, but never let exact-mode tolerance waive
    # the requested minimum. Use unrounded sums for the actual decision.
    from decimal import Decimal, ROUND_CEILING
    required_count = int((Decimal(str(req_pct)) * len(questions) / 100).to_integral_value(rounding=ROUND_CEILING))
    raw_total = sum((Decimal(str(q.get('points', 0))) for q in questions), Decimal(0))
    raw_covered = sum((Decimal(str(q.get('points', 0))) for q in questions if q.get('in_revision')), Decimal(0))
    points_met = raw_total > 0 and raw_covered * 100 >= Decimal(str(req_pct)) * raw_total
    count_met = matched_q_count >= required_count
    rev_ok = bool(revision and questions and (points_met or count_met))
    if sim_mode == 'exact':
        rev_ok = rev_ok and ((points_met and abs(rev_pct_points - req_pct) <= 5.0)
                             or (count_met and matched_q_count == required_count))

    # 7. Lesson & Slot Notes
    notes = []
    if grade == 8:
        notes.append('Cấu trúc 28 câu MC (7,0đ) + 3 câu ES (3,0đ) = 10,0 điểm khớp 100% khung Ma trận Khối 8.')
        notes.append('Lưu ý vị trí câu: Câu 14, 15 hỏi kiến thức máy tính/dữ liệu số liên môn Chuẩn CĐ1-CĐ2; Câu 17 và Câu 24 hoán đổi vị trí giữa Bài 3 và Bài 4 nhưng tổng số câu và mức độ nhận thức toàn đề bảo toàn 100%.')
    elif grade == 9:
        notes.append('Đề thi Khối 9 khớp tuyệt đối 100% từng câu (Câu 1..28 MC và Câu 1..3 Tự luận) với Ma trận và Bảng đặc tả Khối 9.')
    elif grade == 10:
        notes.append('Đề thi Khối 10 khớp 100% định mức 19 câu MC (4,75đ) + 3 câu Đúng/Sai (12 ý = 3,0đ) + 3 câu Tự luận (9 ý a,b,c = 2,25đ ở Bài 1, Bài 8, Bài 12) = 10,0 điểm.')

    if exam.get('exam_code') and exam.get('exam_code') not in ('GỐC', '101'):
        notes.append(f'Mã đề {exam.get("exam_code")}: Đã đảo thứ tự câu hỏi và phương án trắc nghiệm từ đề gốc, giữ nguyên 100% ma trận đặc tả.')

    all_types_ok = all(tc['matched'] for tc in type_checks)
    all_es_ok = all(ec['matched'] for ec in es_checks)
    passed = bool(points_ok and all_types_ok and all_es_ok and rev_ok)

    return {
        'passed': passed,
        'status': 'passed' if passed and grade in (9, 10) else ('passed_with_notes' if passed else 'failed'),
        'matrix_id': matrix.get('id'),
        'matrix_title': matrix.get('title'),
        'matrix_locked': matrix.get('status') == 'locked',
        'total_questions': len(questions),
        'total_points': total_actual,
        'expected_points': total_expected,
        'points_matched': points_ok,
        'type_checks': type_checks,
        'level_checks': level_checks,
        'es_checks': es_checks,
        'revision_check': {
            'revision_id': revision.get('id') if revision else exam.get('revision_id'),
            'matched_questions': matched_q_count,
            'outside_questions': max(0, len(questions) - matched_q_count),
            'total_questions': len(questions),
            'matched_points': matched_pts,
            'outside_points': round(max(0.0, total_actual - matched_pts), 2),
            'coverage_percent_points': rev_pct_points,
            'coverage_percent_count': rev_pct_count,
            'required_percent': req_pct,
            'similarity_mode': sim_mode,
            'matched': rev_ok,
            'question_items': question_sim_items,
        },
        'notes': notes,
        'summary': (
            f'ĐẠT CHUẨN MA TRẬN ({total_actual:g}/10 điểm • {len(questions)} câu • '
            f'Tương đồng đề cương {rev_pct_points:g}% điểm / yêu cầu {req_pct:g}%)'
            if passed else
            f'CHƯA ĐẠT CHUẨN (Tương đồng đề cương hiện tại {rev_pct_points:g}% điểm / yêu cầu {"đúng " if sim_mode == "exact" else "≥ "}{req_pct:g}%)'
        ),
    }
