"""Đọc PPCT từ Word (bảng KHDH Phụ lục 1 của tổ) hoặc JSON thành danh sách bài học; không ghi gì vào ngân hàng.

Hỗ trợ cả 2 cấu trúc của Phụ lục I (Công văn 5512/BGDĐT-GDTrH):
- Mục II.1 Phân phối chương trình cốt lõi (`Tuần | Bài học | Số tiết | PPCT | Yêu cầu cần đạt | Phát triển năng lực số & AI | Ghi chú`), giữ cả dòng Ôn tập / Kiểm tra định kỳ (phân loại rõ qua `section`) để đối soát đủ tổng số tiết theo TT 32/2018 (35 tiết THCS / 70 tiết THPT).
- Mục II.2 Chuyên đề lựa chọn đối với cấp THPT (`STT | Chuyên đề / Tên bài dạy | Số tiết | Yêu cầu cần đạt | Phát triển năng lực số`), gắn `section='elective_topic'` và `orientation` (`ICT` | `CS`) theo TT 32/2018 & TT 22/2021.
"""
import io
import re
import unicodedata
import zipfile

from domain.errors import ServiceError

VALID_SECTIONS = ('core', 'elective_topic', 'review', 'assessment')

LESSON_RE = re.compile(
    r'^\s*(?:(?:Bài|Bải|Tiết)|Chủ\s*đề\s*\d+\s*[-–.:]\s*(?:Bài|Bải))?\s*(?:Bài|Bải)\s+(\d+[a-zA-Z]?)\s*[-–.:]\s*(.+)$',
    re.S | re.I,
)
ELECTIVE_RE = re.compile(r'^\s*Chuyên\s*đề\s*(\d+[a-zA-Z]?)\s*[-–.:]?\s*(.+)$', re.S | re.I)
ASSESSMENT_RE = re.compile(r'^\s*Kiểm\s*tra\b', re.I)
REVIEW_RE = re.compile(r'^\s*(?:Ôn\s*tập|Luyện\s*tập)\b', re.I)
SEMESTER_RE = re.compile(r'^\s*Học\s*k[ìỳ]\s*(I{1,2}|[12])\b', re.I)
TOPIC_RE = re.compile(r'^\s*Chủ\s*đề\b', re.I)
ELECTIVE_BANNER_RE = re.compile(r'chuyên\s*đề\s*học\s*tập|chuyên\s*đề\s*lựa\s*chọn', re.I)
CONTINUATION_RE = re.compile(r'\s*\((?:tt|tiếp(?: theo)?|t|tiết\s*\d+)\)?\s*$', re.I)
WEEK_SYNONYMS = ('tuần', 'tiết theo tuần', 'thời điểm', 'week', 'tuần/tháng', 'tuần / tháng')
LESSON_SYNONYMS = ('bài học', 'tên bài', 'bài dạy', 'nội dung bài dạy', 'chủ đề / bài học', 'chủ đề/bài học', 'chủ đề', 'nội dung', 'lesson')
ELECTIVE_SYNONYMS = ('chuyên đề', 'tên chuyên đề', 'chuyên đề học tập', 'tên bài dạy')
DURATION_SYNONYMS = ('số tiết', 'thời lượng', 'duration')
OUTCOME_SYNONYMS = ('yêu cầu cần đạt', 'yccđ', 'yccd', 'mục tiêu', 'chuẩn kiến thức', 'learning outcome')


def normalize_section(raw_section='', lesson_code='', lesson_name='', topic=''):
    """Chuẩn hóa phân loại mục PPCT: core | elective_topic | review | assessment."""
    raw = _nfc(raw_section).strip().lower()
    if raw in VALID_SECTIONS:
        return raw
    if raw in ('chuyen_de', 'chuyên đề', 'special_topic', 'elective', 'chuyen_de_hoc_tap', 'cdht'):
        return 'elective_topic'
    if raw in ('on_tap', 'ôn tập', 'luyen_tap', 'luyện tập'):
        return 'review'
    if raw in ('kiem_tra', 'kiểm tra', 'danh_gia', 'đánh giá', 'periodic', 'assessment'):
        return 'assessment'
    code = _nfc(lesson_code).strip()
    name = _nfc(lesson_name).strip()
    tp = _nfc(topic).strip()
    if re.match(r'^(?:CD|CĐ)\d', code, re.I) or re.match(r'^\s*Chuyên\s*đề\b', name, re.I) or ELECTIVE_BANNER_RE.search(tp):
        return 'elective_topic'
    if re.match(r'^KT(?:GK|CK)[12]$', code, re.I) or re.match(r'^\s*Kiểm\s*tra\s*(?:giữa|cuối)?\s*h?[kìỳ]', name, re.I):
        return 'assessment'
    if re.match(r'^(?:OT|LT)(?:_HK[12])?(?:_\d+)?$', code, re.I) or REVIEW_RE.match(name):
        return 'review'
    return 'core'


def detect_orientation(text=''):
    """Nhận diện định hướng THPT từ tên chuyên đề/banner/tệp: ICT (Tin học ứng dụng) hoặc CS (Khoa học máy tính)."""
    s = _nfc(text).strip()
    if not s:
        return ''
    low = s.lower().replace('_', ' ')
    if 'tin học ứng dụng' in low or re.search(r'\bict\b', low):
        return 'ICT'
    if 'khoa học máy tính' in low or re.search(r'\bcs\b', low):
        return 'CS'
    return ''


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


def _is_elective_header(texts):
    """Nhận diện bảng Chuyên đề lựa chọn (Phụ lục I Mục II.2 CV 5512) — không bắt buộc cột Tuần, cho phép kèm cột Thiết bị dạy học."""
    low = [x.lower() for x in texts]
    has_title = any(any(key in x for key in ELECTIVE_SYNONYMS) for x in low)
    has_duration = any(any(key in x for key in DURATION_SYNONYMS) or x.strip() == 'tiết' for x in low)
    has_outcome = any(any(key in x for key in OUTCOME_SYNONYMS) for x in low)
    return has_title and has_duration and has_outcome


def _map_columns(texts):
    cols = dict(stt=-1, week=-1, lesson=-1, duration=-1, ppct=-1, outcomes=-1, nls=-1, notes=-1, equipment=-1)
    for idx, raw in enumerate(texts):
        low = _nfc(raw).strip().lower()
        if not low:
            continue
        if cols['stt'] < 0 and low in ('stt', 'tt', 'st'):
            cols['stt'] = idx
        elif cols['ppct'] < 0 and ('ppct' in low):
            cols['ppct'] = idx
        elif cols['week'] < 0 and any(key in low for key in WEEK_SYNONYMS):
            cols['week'] = idx
        elif cols['duration'] < 0 and (any(key in low for key in DURATION_SYNONYMS) or low == 'tiết'):
            cols['duration'] = idx
        elif cols['outcomes'] < 0 and any(key in low for key in OUTCOME_SYNONYMS):
            cols['outcomes'] = idx
        elif cols['nls'] < 0 and ('năng lực số' in low or 'nls' in low or re.search(r'\bai\b', low)):
            cols['nls'] = idx
        elif cols['equipment'] < 0 and ('thiết bị' in low or 'đồ dùng dạy học' in low):
            cols['equipment'] = idx
        elif cols['notes'] < 0 and ('ghi chú' in low or 'note' in low):
            cols['notes'] = idx
        elif cols['lesson'] < 0 and (any(key in x for key in ELECTIVE_SYNONYMS for x in (low,)) or any(key in low for key in LESSON_SYNONYMS)):
            cols['lesson'] = idx
    return cols


def _assessment_code(lesson_raw, current_semester):
    low = _nfc(lesson_raw).lower()
    if re.search(r'(?:hk|học\s*k[ìỳ])\s*(?:ii|2)\b|\b(?:hk)?2\b', low):
        sem = 2
    elif re.search(r'(?:hk|học\s*k[ìỳ])\s*(?:i|1)\b|\b(?:hk)?1\b', low):
        sem = 1
    else:
        sem = current_semester
    prefix = 'KTGK' if 'giữa' in low else 'KTCK'
    return f'{prefix}{sem}'


def _merge_lesson_entry(lessons, order, entry_meta, occurrence, outcomes, competencies, notes):
    code = entry_meta['lesson_code']
    if code not in lessons:
        lessons[code] = dict(
            grade=entry_meta['grade'],
            lesson_code=code,
            lesson_name_source=entry_meta['lesson_name_source'],
            topic_source=entry_meta['topic_source'],
            section=entry_meta['section'],
            orientation=entry_meta.get('orientation', ''),
            outcomes=[],
            occurrences=[],
            digital_competencies=[],
            notes='',
            source_file=entry_meta['source_file'],
        )
        order.append(code)
    lesson = lessons[code]
    if entry_meta.get('orientation') and not lesson.get('orientation'):
        lesson['orientation'] = entry_meta['orientation']
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


def parse_docx(raw, grade, source_file=''):
    """Trả về (lessons, issues). Đọc cả Bảng II.1 (PPCT cốt lõi) và Bảng II.2 (Chuyên đề lựa chọn THPT)."""
    try:
        import docx
        document = docx.Document(io.BytesIO(raw))
    except (zipfile.BadZipFile, KeyError, ValueError) as exc:
        raise ServiceError('Không đọc được tệp Word. Hãy lưu lại dưới dạng .docx rồi thử lại.') from exc
    tables = []
    for i, t in enumerate(document.tables):
        if not t.rows:
            continue
        hdr = _row_texts(t.rows[0])
        if _is_header(hdr):
            tables.append((i, 'core', _map_columns(hdr), t))
        elif _is_elective_header(hdr):
            tables.append((i, 'elective', _map_columns(hdr), t))
    if not tables:
        raise ServiceError('Không tìm thấy bảng PPCT có cột "Tuần", "Bài học", "Yêu cầu cần đạt" hoặc bảng Chuyên đề lựa chọn.')

    def cell_at(texts, idx, fallback=''):
        return texts[idx] if idx is not None and 0 <= idx < len(texts) else fallback

    doc_orientation = detect_orientation(source_file)
    lessons, order, issues = {}, [], []
    for table_index, table_kind, cols, table in tables:
        semester = 1
        topic = 'Chuyên đề học tập lựa chọn' if table_kind == 'elective' else ''
        orientation = ''
        for row_index, row in enumerate(table.rows[1:], 1):
            texts = _row_texts(row)
            first = next((x for x in texts if x), '')
            if not first:
                continue
            distinct = list(dict.fromkeys(x for x in texts if x))
            if SEMESTER_RE.match(first) and len(distinct) == 1:
                semester = 2 if SEMESTER_RE.match(first).group(1).upper() in ('II', '2') else 1
                continue
            elective_banner = next((x for x in distinct if ELECTIVE_BANNER_RE.search(x)), None)
            if elective_banner and len(distinct) <= 2:
                topic = re.sub(r'\s+', ' ', elective_banner).strip()
                orientation = detect_orientation(topic) or orientation
                continue
            topic_cell = next((x for x in distinct if TOPIC_RE.match(x)), None)
            if topic_cell and len(distinct) <= 2:
                topic = re.sub(r'\s+', ' ', topic_cell).strip()
                continue

            padded = (texts + [''] * 7)[:7]
            if table_kind == 'core' and cols['lesson'] < 0:
                week, lesson_raw, periods, ppct_no, outcomes_raw, competencies, notes = padded
                stt = ''
                equipment = ''
            else:
                stt = cell_at(texts, cols['stt'])
                week = cell_at(texts, cols['week'])
                lesson_raw = cell_at(texts, cols['lesson'])
                periods = cell_at(texts, cols['duration'])
                ppct_no = cell_at(texts, cols['ppct'])
                outcomes_raw = cell_at(texts, cols['outcomes'])
                competencies = cell_at(texts, cols['nls'])
                notes = cell_at(texts, cols['notes'])
                equipment = cell_at(texts, cols.get('equipment', -1))
            if equipment.strip():
                eq_note = f'Thiết bị: {equipment.strip()}'
                notes = f'{notes.strip()}; {eq_note}' if notes.strip() else eq_note
            if not lesson_raw.strip():
                continue

            outcomes = outcome_lines(outcomes_raw)
            if table_kind == 'elective':
                e_match = ELECTIVE_RE.match(lesson_raw)
                if e_match:
                    code = 'CD' + e_match.group(1).lower()
                    name = clean_name(f'Chuyên đề {e_match.group(1)}: {e_match.group(2)}')
                elif stt and re.match(r'^\d+[a-zA-Z]?$', stt.strip()):
                    code = 'CD' + stt.strip().lower()
                    name = clean_name(lesson_raw)
                else:
                    code = f'CD{sum(1 for c in order if c.startswith("CD")) + 1}'
                    name = clean_name(lesson_raw)
                section = 'elective_topic'
                row_orientation = orientation or detect_orientation(topic) or detect_orientation(lesson_raw) or doc_orientation
                default_topic = topic or 'Chuyên đề học tập lựa chọn'
            else:
                e_match = ELECTIVE_RE.match(lesson_raw)
                l_match = LESSON_RE.match(lesson_raw)
                if e_match:
                    code = 'CD' + e_match.group(1).lower()
                    name = clean_name(f'Chuyên đề {e_match.group(1)}: {e_match.group(2)}')
                    section = 'elective_topic'
                    row_orientation = orientation or detect_orientation(topic) or detect_orientation(lesson_raw) or doc_orientation
                    default_topic = topic or 'Chuyên đề học tập lựa chọn'
                elif l_match:
                    code = 'B' + l_match.group(1).lower()
                    name = clean_name(f'Bài {l_match.group(1)}. {l_match.group(2)}')
                    section = 'core'
                    row_orientation = ''
                    default_topic = topic or 'Chủ đề chung'
                elif ASSESSMENT_RE.match(lesson_raw):
                    code = _assessment_code(lesson_raw, semester)
                    name = clean_name(lesson_raw)
                    section = 'assessment'
                    row_orientation = ''
                    default_topic = 'Kiểm tra, đánh giá định kỳ'
                    if not outcomes:
                        outcomes = ['Kiểm tra, đánh giá định kỳ theo ma trận và bản đặc tả.']
                elif REVIEW_RE.match(lesson_raw):
                    prefix = 'LT' if re.match(r'^\s*Luyện\s*tập\b', lesson_raw, re.I) else 'OT'
                    base_code = f'{prefix}_HK{semester}'
                    if base_code in lessons and not CONTINUATION_RE.search(lesson_raw):
                        idx_s = 2
                        while f'{base_code}_{idx_s}' in lessons:
                            idx_s += 1
                        code = f'{base_code}_{idx_s}'
                    else:
                        code = base_code
                    name = clean_name(lesson_raw)
                    section = 'review'
                    row_orientation = ''
                    default_topic = topic or 'Ôn tập, củng cố'
                    if not outcomes:
                        outcomes = ['Hệ thống hóa, củng cố kiến thức và kĩ năng đã học.']
                else:
                    continue

            occurrence = dict(
                grade=grade,
                semester=semester,
                week_raw=week,
                lesson_raw=lesson_raw,
                periods_raw=ppct_no or periods or '1',
                duration_raw=periods,
                ppct_raw=ppct_no,
                outcomes_raw=outcomes_raw,
                competencies_raw=competencies,
                notes_raw=notes,
                source_file=source_file,
                table_index=table_index,
                row_index=row_index,
                lesson_code=code,
                topic_raw=topic,
            )
            _merge_lesson_entry(
                lessons,
                order,
                dict(
                    grade=grade,
                    lesson_code=code,
                    lesson_name_source=name,
                    topic_source=default_topic,
                    section=section,
                    orientation=row_orientation,
                    source_file=source_file,
                ),
                occurrence,
                outcomes,
                competencies,
                notes,
            )

    for code in order:
        if lessons[code].get('section') in ('assessment', 'review'):
            continue
        if not lessons[code]['outcomes']:
            issues.append(dict(lesson_code=code, message=f'{lessons[code]["lesson_name_source"]}: chưa có yêu cầu cần đạt.'))
    if not order:
        raise ServiceError('Bảng PPCT không có dòng bài học hoặc chuyên đề hợp lệ nào.')
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
    """Nhận {lessons:[…], elective_topics:[…]}, {ppct:{lessons:[…]}} hoặc một mảng bài học."""
    if isinstance(data, dict) and isinstance(data.get('ppct'), dict):
        data = data['ppct']
    top_grade = data.get('grade', grade) if isinstance(data, dict) else grade
    top_subj = (data.get('subject_name') or subject_name) if isinstance(data, dict) else subject_name
    top_orientation_raw = _nfc(data.get('orientation') or '').strip() if isinstance(data, dict) else ''
    top_orientation = detect_orientation(top_orientation_raw) or top_orientation_raw

    core_items = data.get('lessons') if isinstance(data, dict) else data
    elective_items = []
    if isinstance(data, dict):
        for key in ('elective_topics', 'special_topics', 'chuyen_de', 'chuyen_de_hoc_tap'):
            val = data.get(key)
            if isinstance(val, list) and val:
                elective_items.extend((idx + 1, item) for idx, item in enumerate(val))

    if core_items is not None and not isinstance(core_items, list):
        raise ServiceError('JSON cần có mảng "lessons" gồm các bài học.')
    core_list = core_items if isinstance(core_items, list) else []
    if not core_list and not elective_items:
        raise ServiceError('JSON cần có mảng "lessons" gồm các bài học.')

    tagged_items = [(item, False, idx + 1) for idx, item in enumerate(core_list)] + [
        (item, True, cd_idx) for cd_idx, item in elective_items
    ]
    lessons, issues = [], []
    for index, (raw, is_elective_item, cd_seq) in enumerate(tagged_items, 1):
        if not isinstance(raw, dict):
            raise ServiceError(f'Bài thứ {index} không đúng định dạng.')
        item_grade = raw.get('grade', top_grade)
        item_subj = raw.get('subject_name') or top_subj
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

        raw_code = _nfc(raw.get('lesson_code') or ('CD' + str(cd_seq) if is_elective_item else '')).strip()
        raw_name = clean_name(raw.get('lesson_name_source') or raw.get('lesson_name') or raw.get('name') or raw.get('title') or '')
        default_topic = 'Chuyên đề học tập lựa chọn' if is_elective_item else 'Chủ đề chung'
        raw_topic = _nfc(raw.get('topic_source') or raw.get('topic') or default_topic).strip()
        raw_section = raw.get('section') or ('elective_topic' if is_elective_item else '')
        section = normalize_section(raw_section, raw_code, raw_name, raw_topic)
        raw_orient = _nfc(raw.get('orientation') or '').strip()
        orientation = detect_orientation(raw_orient) or raw_orient or (top_orientation if section == 'elective_topic' else '')
        clean_outcomes = [_nfc(x).strip() for x in outcomes if _nfc(x).strip()]
        if not clean_outcomes:
            if section == 'assessment':
                clean_outcomes = ['Kiểm tra, đánh giá định kỳ theo ma trận và bản đặc tả.']
            elif section == 'review':
                clean_outcomes = ['Hệ thống hóa, củng cố kiến thức và kĩ năng đã học.']

        lesson = dict(grade=item_grade, lesson_code=raw_code,
                      lesson_name_source=raw_name,
                      topic_source=raw_topic,
                      section=section,
                      orientation=orientation,
                      outcomes=clean_outcomes,
                      occurrences=occurrences,
                      digital_competencies=digital_competencies,
                      notes=notes,
                      source_file=_nfc(raw.get('source_file') or '').strip(),
                      subject_name=_nfc(item_subj).strip() if item_subj else '')
        if not lesson['lesson_code'] or not lesson['lesson_name_source']:
            raise ServiceError(f'Bài thứ {index} thiếu mã bài hoặc tên bài.')
        if not lesson['outcomes'] and section not in ('assessment', 'review'):
            issues.append(dict(lesson_code=lesson['lesson_code'], message=f'{lesson["lesson_name_source"]}: chưa có yêu cầu cần đạt.'))
        lessons.append(lesson)
    return lessons, issues
