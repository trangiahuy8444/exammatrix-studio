"""Đọc PPCT từ Word (bảng KHDH Phụ lục 1 của tổ) hoặc JSON thành danh sách bài học; không ghi gì vào ngân hàng.

Bảng chính có tiêu đề `Tuần | Bài học | Số tiết | PPCT | Yêu cầu cần đạt | Phát triển năng lực số… | Ghi chú`:
dòng gộp "Học kì N: …" đổi học kì, dòng gộp "Chủ đề …" đổi chủ đề, dòng "Bài N. …" là một lần dạy của bài
(dòng "(tt)" là lần dạy tiếp theo). Dòng Kiểm tra / Ôn tập / Luyện tập không phải bài học nên bỏ qua.
"""
import io
import re
import unicodedata
import zipfile

from domain.errors import ServiceError

LESSON_RE = re.compile(r'^\s*(?:Bài|Tiết|Chủ đề\s*\d+\s*[-–.:]\s*Bài)?\s*Bài\s+(\d+[a-zA-Z]?)\s*[-–.:]\s*(.+)$', re.S | re.I)
SEMESTER_RE = re.compile(r'^\s*Học\s*kì\s*(I{1,2}|[12])\b', re.I)
TOPIC_RE = re.compile(r'^\s*Chủ\s*đề\b', re.I)
CONTINUATION_RE = re.compile(r'\s*\((?:tt|tiếp(?: theo)?|t|tiết\s*\d+)\)?\s*$', re.I)
WEEK_SYNONYMS = ('tuần', 'tiết theo tuần', 'thời điểm', 'week', 'tuần/tháng', 'tuần / tháng')
LESSON_SYNONYMS = ('bài học', 'tên bài', 'bài dạy', 'nội dung bài dạy', 'chủ đề / bài học', 'chủ đề/bài học', 'chủ đề', 'nội dung', 'lesson')
OUTCOME_SYNONYMS = ('yêu cầu cần đạt', 'yccđ', 'yccd', 'mục tiêu', 'chuẩn kiến thức', 'learning outcome')


def _nfc(text):
    return unicodedata.normalize('NFC', str(text or ''))


def clean_name(raw):
    """Tên bài không kèm "(tt)", "(tiết 1)" và khoảng trắng thừa."""
    text = _nfc(raw)
    while CONTINUATION_RE.search(text):
        text = CONTINUATION_RE.sub('', text)
    return re.sub(r'\s+', ' ', text).strip()


def same_name(a, b):
    """Coi "Bài 2: X" và "Bài 2. X" là một tên (chỉ khác dấu sau số bài, hoa thường, khoảng trắng)."""
    key = lambda x: re.sub(r'^(bài\s*\d+[a-z]?)\s*[.:]\s*', r'\1 ', clean_name(x).casefold())
    return key(a) == key(b)


def outcome_lines(raw):
    """YCCĐ: mỗi dòng bắt đầu bằng "-" là một yêu cầu; dòng không có gạch nối vào yêu cầu trước."""
    items = []
    for line in _nfc(raw).splitlines():
        line = line.strip()
        if not line:
            continue
        if re.match(r'^[-–•+]\s*', line):
            items.append(re.sub(r'^[-–•+]\s*', '', line).strip())
        elif items:
            items[-1] = (items[-1]+' '+line).strip()
        else:
            items.append(line)
    return [x for x in items if x]


def _normalize_text_list(value):
    """Chuẩn hóa danh sách văn bản (mảng hoặc chuỗi nhiều dòng), bỏ gạch đầu dòng và loại trùng giữ thứ tự."""
    raw_items = value if isinstance(value, (list, tuple)) else ([value] if isinstance(value, str) else [])
    seen, result = set(), []
    for entry in raw_items:
        for line in _nfc(entry).splitlines():
            clean = re.sub(r'^[-–*•+]\s*', '', line.strip()).strip()
            if clean and clean not in seen:
                seen.add(clean)
                result.append(clean)
    return result


def grade_from_filename(name):
    clean = _nfc(name)
    match = re.search(r'(?:TIN|VẬT\s*L[ÍÝ]|VAT\s*L[IY]|TOÁN|TOAN|HÓA|HOA|SINH|VĂN|VAN|ANH|SỬ|SU|ĐỊA|DIA|KHTN|KHỐI|KHOI|K|LỚP|LOP)\s*(\d{1,2})\b', clean, re.I)
    if match:
        return int(match.group(1))
    for m in re.finditer(r'\b(\d{1,2})\b', clean):
        val = int(m.group(1))
        if 6 <= val <= 12:
            return val
    return None


def _row_texts(row):
    return [_nfc(cell.text).strip() for cell in row.cells]


def _is_header(texts):
    low = [x.lower() for x in texts]
    has_week = any(any(key in x for key in WEEK_SYNONYMS) for x in low)
    has_lesson = any(any(key in x for key in LESSON_SYNONYMS) for x in low)
    has_outcome = any(any(key in x for key in OUTCOME_SYNONYMS) for x in low)
    return has_week and has_lesson and has_outcome


def parse_docx(raw, grade, source_file=''):
    """Trả về (lessons, issues). Mỗi bài có grade, lesson_code (B + số bài), tên, chủ đề, YCCĐ và occurrences."""
    try:
        import docx
        document = docx.Document(io.BytesIO(raw))
    except (zipfile.BadZipFile, KeyError, ValueError) as exc:
        raise ServiceError('Không đọc được tệp Word. Hãy lưu lại dưới dạng .docx rồi thử lại.') from exc
    tables = [(i, t) for i, t in enumerate(document.tables) if t.rows and _is_header(_row_texts(t.rows[0]))]
    if not tables:
        raise ServiceError('Không tìm thấy bảng PPCT có cột "Tuần", "Bài học", "Yêu cầu cần đạt".')
    lessons, order, issues = {}, [], []
    for table_index, table in tables:
        semester, topic = 1, ''
        for row_index, row in enumerate(table.rows[1:], 1):
            texts = _row_texts(row)
            first = next((x for x in texts if x), '')
            if not first:
                continue
            distinct = list(dict.fromkeys(x for x in texts if x))
            if SEMESTER_RE.match(first) and len(distinct) == 1:
                semester = 2 if SEMESTER_RE.match(first).group(1).upper() in ('II', '2') else 1
                continue
            topic_cell = next((x for x in distinct if TOPIC_RE.match(x)), None)
            if topic_cell and (len(distinct) <= 2):
                topic = re.sub(r'\s+', ' ', topic_cell).strip()
                continue
            cells = (texts+['']*7)[:7]
            week, lesson_raw, periods, ppct_no, outcomes_raw, competencies, notes = cells
            match = LESSON_RE.match(lesson_raw)
            if not match:
                continue  # Kiểm tra, Ôn tập, Luyện tập…
            code = 'B'+match.group(1).lower()
            name = clean_name('Bài '+match.group(1)+'. '+match.group(2))
            outcomes = outcome_lines(outcomes_raw)
            occurrence = dict(grade=grade, semester=semester, week_raw=week, lesson_raw=lesson_raw, periods_raw=periods,
                              duration_raw=periods, ppct_raw=ppct_no, outcomes_raw=outcomes_raw, competencies_raw=competencies,
                              notes_raw=notes, source_file=source_file, table_index=table_index, row_index=row_index,
                              lesson_code=code, topic_raw=topic)
            if code not in lessons:
                lessons[code] = dict(grade=grade, lesson_code=code, lesson_name_source=name, topic_source=topic or 'Chủ đề chung',
                                     outcomes=[], occurrences=[], digital_competencies=[], notes='', source_file=source_file)
                order.append(code)
            lesson = lessons[code]
            for item in outcomes:
                if item not in lesson['outcomes']:
                    lesson['outcomes'].append(item)
            for comp in _normalize_text_list(competencies):
                if comp not in lesson['digital_competencies']:
                    lesson['digital_competencies'].append(comp)
            clean_note = re.sub(r'\s+', ' ', _nfc(notes)).strip()
            if clean_note:
                existing_notes = [x.strip() for x in lesson['notes'].split('; ') if x.strip()]
                if clean_note not in existing_notes:
                    existing_notes.append(clean_note)
                    lesson['notes'] = '; '.join(existing_notes)
            lesson['occurrences'].append(occurrence)
    for code in order:
        if not lessons[code]['outcomes']:
            issues.append(dict(lesson_code=code, message=f'{lessons[code]["lesson_name_source"]}: chưa có yêu cầu cần đạt.'))
    if not order:
        raise ServiceError('Bảng PPCT không có dòng "Bài N. …" nào.')
    return [lessons[c] for c in order], issues


def _normalize_json_occurrences(raw):
    occ_list = raw.get('occurrences') if isinstance(raw.get('occurrences'), list) else []
    normalized = []
    for item in occ_list:
        if not isinstance(item, dict):
            continue
        entry = {}
        for key in ('week_raw', 'duration_raw', 'ppct_raw', 'periods_raw', 'competencies_raw', 'notes_raw'):
            val = item.get(key)
            if val is not None and str(val).strip() != '':
                entry[key] = _nfc(val).strip()
        if not entry.get('duration_raw'):
            alt_dur = item.get('num_periods') if item.get('num_periods') is not None else item.get('so_tiet')
            if alt_dur is not None and str(alt_dur).strip() != '':
                entry['duration_raw'] = _nfc(alt_dur).strip()
        if not entry.get('periods_raw'):
            fallback_p = entry.get('ppct_raw') or entry.get('duration_raw')
            if fallback_p:
                entry['periods_raw'] = fallback_p
        for int_key in ('semester', 'table_index', 'row_index'):
            if item.get(int_key) is not None:
                entry[int_key] = item.get(int_key)
        if entry:
            normalized.append(entry)
    if not normalized:
        top_week = _nfc(raw.get('week_raw') or '').strip()
        top_dur = _nfc(raw.get('duration_raw') or raw.get('num_periods') or raw.get('so_tiet') or '').strip()
        top_ppct = _nfc(raw.get('ppct_raw') or '').strip()
        top_periods = _nfc(raw.get('periods_raw') or top_ppct or top_dur or '').strip()
        top_comp = _nfc(raw.get('competencies_raw') or '').strip()
        top_notes = _nfc(raw.get('notes_raw') or '').strip()
        if any((top_week, top_dur, top_ppct, top_periods, top_comp, top_notes)):
            top_entry = {}
            if top_week:
                top_entry['week_raw'] = top_week
            if top_dur:
                top_entry['duration_raw'] = top_dur
            if top_ppct:
                top_entry['ppct_raw'] = top_ppct
            if top_periods:
                top_entry['periods_raw'] = top_periods
            if top_comp:
                top_entry['competencies_raw'] = top_comp
            if top_notes:
                top_entry['notes_raw'] = top_notes
            normalized.append(top_entry)
    return normalized


def parse_json(data, grade=None, subject_name=None):
    """Nhận {lessons:[…]}, {ppct:{lessons:[…]}} (tệp xuất ngân hàng) hoặc một mảng bài học."""
    if isinstance(data, dict) and isinstance(data.get('ppct'), dict):
        data = data['ppct']
    items = data.get('lessons') if isinstance(data, dict) else data
    if not isinstance(items, list) or not items:
        raise ServiceError('JSON cần có mảng "lessons" gồm các bài học.')
    lessons, issues = [], []
    for index, raw in enumerate(items, 1):
        if not isinstance(raw, dict):
            raise ServiceError(f'Bài thứ {index} không đúng định dạng.')
        item_grade = raw.get('grade', grade)
        item_subj = raw.get('subject_name') or subject_name
        if isinstance(item_grade, str) and item_grade.strip().isdigit():
            item_grade = int(item_grade)
        outcomes = raw.get('outcomes') or []
        if isinstance(outcomes, str):
            outcomes = outcome_lines(outcomes)
        occurrences = _normalize_json_occurrences(raw)
        comp_source = (raw.get('digital_competencies') or raw.get('competencies')
                       or raw.get('competencies_raw') or raw.get('nls_ai') or [])
        digital_competencies = _normalize_text_list(comp_source)
        for occ in occurrences:
            for c in _normalize_text_list(occ.get('competencies_raw') or ''):
                if c not in digital_competencies:
                    digital_competencies.append(c)
        raw_notes = raw.get('notes') if raw.get('notes') is not None else (
            raw.get('note') or raw.get('notes_raw') or raw.get('ghi_chu') or ''
        )
        if isinstance(raw_notes, (list, tuple)):
            notes = '\n'.join(_nfc(x).strip() for x in raw_notes if _nfc(x).strip())
        else:
            notes = _nfc(raw_notes).strip()
        if not notes:
            occ_notes = []
            for occ in occurrences:
                n = _nfc(occ.get('notes_raw') or '').strip()
                if n and n not in occ_notes:
                    occ_notes.append(n)
            notes = '; '.join(occ_notes)
        lesson = dict(grade=item_grade, lesson_code=_nfc(raw.get('lesson_code')).strip(),
                      lesson_name_source=clean_name(raw.get('lesson_name_source') or raw.get('lesson_name') or ''),
                      topic_source=_nfc(raw.get('topic_source') or raw.get('topic') or 'Chủ đề chung').strip(),
                      outcomes=[_nfc(x).strip() for x in outcomes if _nfc(x).strip()],
                      occurrences=occurrences,
                      digital_competencies=digital_competencies,
                      notes=notes,
                      source_file=_nfc(raw.get('source_file') or '').strip(),
                      subject_name=_nfc(item_subj).strip() if item_subj else '')
        if not lesson['lesson_code'] or not lesson['lesson_name_source']:
            raise ServiceError(f'Bài thứ {index} thiếu mã bài hoặc tên bài.')
        if not lesson['outcomes']:
            issues.append(dict(lesson_code=lesson['lesson_code'], message=f'{lesson["lesson_name_source"]}: chưa có yêu cầu cần đạt.'))
        lessons.append(lesson)
    return lessons, issues
