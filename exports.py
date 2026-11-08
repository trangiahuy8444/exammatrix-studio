"""Safe exports: student artifacts are rebuilt from an explicit public whitelist."""
from __future__ import annotations
import copy
import io
import json
import re
import base64
from pathlib import Path
from html import escape
from bank_service import ServiceError
from input_schema import canonical_short_answer
from latex_generator import _format_exam_term, exam_heading


def public_record(record):
    result = {k: record[k] for k in ('title', 'grade', 'exam_type', 'duration', 'total_points','campus','exam_code','subject_name','school_year') if k in record}
    result['questions'] = []
    for q in record.get('questions', []):
        item = {k: copy.deepcopy(q[k]) for k in ('type', 'question', 'options', 'points', 'slot_number') if k in q}
        if q.get('type') == 'YN' and isinstance(q.get('statements'), list):
            item['statements'] = [{'label': s.get('label', ''), 'text': s.get('text', '')} for s in q['statements']]
        result['questions'].append(item)
    return result


def point_label(value):
    return f'{value:g}'.replace('.', ',') if isinstance(value, (int, float)) else str(value)


def _add_numpages_field(paragraph, font_size):
    """Trường NUMPAGES của Word, hiển thị 2 chữ số như mẫu "(Đề thi có 04 trang)"."""
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Pt
    def run_with(child):
        run = paragraph.add_run(); run.italic = True; run.font.size = Pt(font_size)
        run._r.append(child); return run
    begin = OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'), 'begin'); run_with(begin)
    instr = OxmlElement('w:instrText'); instr.set(qn('xml:space'), 'preserve')
    instr.text = ' NUMPAGES \\# "00" '; run_with(instr)
    sep = OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'), 'separate'); run_with(sep)
    shown = paragraph.add_run('01'); shown.italic = True; shown.font.size = Pt(font_size)
    end = OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'), 'end'); run_with(end)


def _scaled_policy(question):
    policy = question.get('equivalent_answer_policy', '')
    scale = question.get('points', question.get('max_score', 1)) / question.get('max_score', 1)
    if scale == 1:
        return policy
    # Scale only explicit scoring amounts; preserve procedural and equivalence guidance.
    pattern = r'(?P<prefix>tổng điểm không vượt|không vượt|tối đa)\s+(?P<cap>\d+(?:[.,]\d+)?)|(?P<amount>\d+(?:[.,]\d+)?)\s*điểm'
    def substitute(match):
        value = float((match.group('cap') or match.group('amount')).replace(',', '.'))
        label = point_label(value * scale)
        return f"{match.group('prefix')} {label}" if match.group('prefix') else f'{label} điểm'
    return re.sub(pattern, substitute, policy, flags=re.IGNORECASE)


def _goals(record):
    if isinstance(record.get('knowledge_scope'), list) and record['knowledge_scope']:
        rows = []
        for item in record['knowledge_scope']:
            goals = item.get('goals', [])
            if isinstance(goals, str):
                goals = [goals]
            rows.append(dict(
                topic=item.get('topic', ''),
                name=item.get('name') or item.get('lesson', ''),
                goals=goals,
            ))
        return rows
    lessons = {}
    for q in record.get('questions', []):
        key = q.get('lesson_code', '') or q.get('lesson_name', '')
        row = lessons.setdefault(key, dict(topic=q.get('topic_source', ''), name=q.get('lesson_name', key), goals=[]))
        goal = q.get('learning_outcome', '')
        if goal and goal not in row['goals']:
            row['goals'].append(goal)
    return list(lessons.values())


SECTION_TITLES = (
    ('MC', 'TRẮC NGHIỆM NHIỀU LỰA CHỌN'),
    ('YN', 'TRẮC NGHIỆM ĐÚNG / SAI'),
    ('SHORT', 'TRẮC NGHIỆM TRẢ LỜI NGẮN'),
    ('ES', 'TỰ LUẬN'),
)
ROMAN = ('I', 'II', 'III', 'IV')


def yn_points_note(record, max_points):
    """Câu hướng dẫn chấm Đ/S theo bảng hệ số lưu trong đề (B3), ví dụ "Đúng 1 ý: 0,1 điểm; …; 4 ý: 1 điểm"."""
    from domain.scoring import dec, policy_table
    table = policy_table(record.get('scoring_policy'))
    def fmt(v):
        text = format(v.normalize(), 'f') if v != 0 else '0'
        return text.replace('.', ',')
    parts = [f'{n} ý: {fmt(dec(max_points) * table[n])} điểm' for n in range(1, 5)]
    return 'Đúng ' + '; '.join(parts)


def _section_defs(record):
    present = {q.get('type') for q in record.get('questions', [])}
    if present <= {'MC', 'ES'}:
        # Giữ đúng tiêu đề của mẫu đề THCS đã duyệt (chỉ có trắc nghiệm và tự luận).
        return [('MC', 'I. TRẮC NGHIỆM'), ('ES', 'II. TỰ LUẬN')]
    kinds = [(kind, title) for kind, title in SECTION_TITLES if kind in present]
    return [(kind, f'{ROMAN[i]}. {title}') for i, (kind, title) in enumerate(kinds)]


LOGO_PATH = Path(__file__).resolve().parent / 'assets' / 'logo_asian_school.png'
BANNER_PATH = Path(__file__).resolve().parent / 'assets' / 'logo_asian_banner.png'


def _set_table_borders(table, val="single", sz="4", color="000000"):
    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls
    tblPr = table._tbl.tblPr
    borders = parse_xml(f"""
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideV w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
        </w:tblBorders>
    """)
    tblPr.append(borders)


def _set_cell_bg(cell, fill_hex):
    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)


def _set_cell_margins(cell, top=50, bottom=50, left=80, right=80):
    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f"""
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    """)
    tcPr.append(tcMar)


def _clean_question_text(text):
    if not text:
        return ''
    lines = [
        line for line in str(text).splitlines()
        if not re.match(r'^\s*(?:Mã\s+câu(?:\s+gốc)?|Mã\s+ID|Đáp\s+án)\s*:', line, flags=re.IGNORECASE)
    ]
    return '\n'.join(lines).strip('\r\n')


# Góp ý nghiệm thu 26/10/2026: ý a), b) của câu tự luận và gạch đầu dòng hướng dẫn chấm phải thụt hàng.
SUBPART_RE = re.compile(r'^\s*(?:[a-zđ]\)|[-–•+])\s+')
_LEVEL1_SPLIT = re.compile(r'(?<=[:.)…;])\s*[-–]\s+(?=\S)')
_LEVEL2_SPLIT = re.compile(r'(?<=[:.)…;])\s+\+\s+(?=\S)')
_LEADING_MARK = re.compile(r'^[-–•]\s+')


def rubric_lines(text):
    """Tách tiêu chí chấm thành [(cấp, dòng)].

    Nhiều tiêu chí nhập từ Word bị dồn thành một dòng ("Ý chính:- ý 1 (0,5 đ)- ý 2 + ý con"). Chỉ tách ở
    dấu "-"/"+" đứng ngay sau dấu câu (":", ".", ")", ";"), nên biểu thức như "1 + 2" hay "C++" không bị tách.
    Cấp 0 là dòng tiêu đề, cấp 1 là gạch đầu dòng "–", cấp 2 là ý con "+". Không sửa dữ liệu gốc.
    """
    lines = []
    for raw in str(text or '').splitlines():
        raw = raw.strip()
        if not raw:
            continue
        level = 0
        if _LEADING_MARK.match(raw):
            raw, level = _LEADING_MARK.sub('', raw), 1
        for i, part in enumerate(_LEVEL1_SPLIT.split(raw)):
            part_level = level if i == 0 else 1
            for j, item in enumerate(_LEVEL2_SPLIT.split(part)):
                if item.strip():
                    lines.append((part_level if j == 0 else part_level + 1, item.strip()))
    return lines


def _hanging(paragraph, left_cm, hang_cm=0.5):
    from docx.shared import Cm
    paragraph.paragraph_format.left_indent = Cm(left_cm)
    paragraph.paragraph_format.first_line_indent = Cm(-hang_cm)


def _pipe_cells(line):
    """Chỉ nhận dòng có ít nhất hai ô, cho phép bỏ dấu | ở hai đầu."""
    line = line.strip()
    if '|' not in line:
        return None
    if line.startswith('|'):
        line = line[1:]
    if line.endswith('|'):
        line = line[:-1]
    cells = [cell.strip() for cell in line.split('|')]
    return cells if len(cells) >= 2 else None


def _question_text_blocks(text):
    """Đọc văn bản, hàng rào ``` và bảng pipe; cú pháp chưa đủ giữ nguyên văn.

    Không diễn giải Markdown nội dòng hay HTML. Bảng cần tiêu đề, hàng phân cách
    (ít nhất ba dấu - mỗi ô) và ít nhất một hàng dữ liệu có cùng số cột.
    """
    lines = str(text).split('\n')
    blocks, plain = [], []

    def flush():
        if plain:
            blocks.append(('text', plain[:]))
            plain.clear()

    i = 0
    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith('```'):
            closing = next((j for j in range(i + 1, len(lines)) if lines[j].strip() == '```'), None)
            valid = re.fullmatch(r'\s*```[\w.+-]*\s*', line)
            if valid and closing is not None:
                flush()
                blocks.append(('code', lines[i + 1:closing]))
                i = closing + 1
            else:
                # Không diễn giải bảng nằm trong một khối mã chưa nhận diện được.
                stop = len(lines) if closing is None else closing + 1
                plain.extend(lines[i:stop])
                i = stop
            continue
        header = _pipe_cells(line)
        separator = _pipe_cells(lines[i + 1]) if i + 1 < len(lines) else None
        if (header and separator and len(header) == len(separator)
                and all(re.fullmatch(r':?-{3,}:?', cell) for cell in separator)):
            stop, rows, valid = i + 2, [header], True
            while stop < len(lines) and '|' in lines[stop]:
                cells = _pipe_cells(lines[stop])
                if cells is None or len(cells) != len(header):
                    valid = False
                rows.append(cells)
                stop += 1
            if valid and len(rows) > 1:
                flush()
                blocks.append(('table', rows))
            else:
                plain.extend(lines[i:stop])
            i = stop
            continue
        plain.append(line)
        i += 1
    flush()
    return blocks


def _add_question_table(doc, rows, size):
    from docx.shared import Cm, Pt
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml import OxmlElement
    table = doc.add_table(rows=0, cols=len(rows[0]))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    width = Cm(24) // len(rows[0])
    for column in table.columns:
        column.width = width
    for index, values in enumerate(rows):
        row = table.add_row()
        row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for cell, value in zip(row.cells, values):
            cell.width = width
            run = cell.paragraphs[0].add_run(value)
            run.font.name = 'Times New Roman'
            run.font.size = Pt(size)
            run.bold = index == 0
        if index == 0:
            row._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
    return table


def _add_text_lines(doc, first_paragraph, text, size=11, keep_with_next=True):
    """Giữ thụt dòng; mã có hàng rào dùng font đơn cách, bảng pipe thành bảng Word."""
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    first = True
    for kind, content in _question_text_blocks(text):
        if kind == 'table':
            _add_question_table(doc, content, size)
            first = False
            continue
        if kind == 'code':
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.keep_with_next = keep_with_next
            run = p.add_run('\n'.join(content))
            run.font.name = 'Courier New'
            run.font.size = Pt(size)
            first = False
            continue
        for line in content:
            if first:
                p = first_paragraph
                first = False
            else:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
                p.paragraph_format.space_before = Pt(0)
                p.paragraph_format.space_after = Pt(2)
                p.paragraph_format.keep_with_next = keep_with_next
                if SUBPART_RE.match(line):
                    _hanging(p, 1.0)
            p.add_run(line).font.size = Pt(size)


def _add_rubric(new_paragraph, criterion, suffix='', marker='– ', base_cm=0.0, size=10.5):
    """Ghi một tiêu chí chấm: một dòng thì "– nội dung (điểm)", nhiều dòng thì tiêu đề in đậm + các ý thụt treo."""
    from docx.shared import Pt
    lines = rubric_lines(criterion) or [(0, '')]
    if len(lines) == 1:
        p = new_paragraph()
        _hanging(p, base_cm + 0.5, 0.5)
        p.add_run(f'{marker}{lines[0][1]}{suffix}').font.size = Pt(size)
        return
    for i, (level, line) in enumerate(lines):
        p = new_paragraph()
        p.paragraph_format.space_after = Pt(1)
        if level == 0:
            _hanging(p, base_cm, 0)
            run = p.add_run(line + (suffix if i == 0 else ''))
            run.bold = True
        else:
            _hanging(p, base_cm + 0.5 * level, 0.4)
            run = p.add_run(('– ' if level == 1 else '+ ') + line)
        run.font.size = Pt(size)


def _cell_paragraphs(cell):
    """Hàm tạo đoạn lần lượt trong một ô bảng: dùng đoạn trống sẵn có trước, rồi thêm đoạn mới."""
    state = {'first': True}

    def new():
        if state['first']:
            state['first'] = False
            return cell.paragraphs[0]
        return cell.add_paragraph()
    return new


def _rubric_html(esc, criterion, suffix='', marker='– ', base_em=0.0):
    lines = rubric_lines(criterion) or [(0, '')]
    if len(lines) == 1:
        return f'<p style="margin-left:{base_em+1.2}em;text-indent:-1.2em">{marker}{esc(lines[0][1])}{esc(suffix)}</p>'
    out = []
    for i, (level, line) in enumerate(lines):
        if level == 0:
            out.append(f'<p style="margin-left:{base_em}em"><strong>{esc(line)}{esc(suffix) if i == 0 else ""}</strong></p>')
        else:
            mark = '– ' if level == 1 else '+ '
            out.append(f'<p style="margin-left:{base_em+1.2*level}em;text-indent:-1em">{mark}{esc(line)}</p>')
    return ''.join(out)


def _question_html(esc, text):
    head, rest, first = '', [], True
    for kind, content in _question_text_blocks(text):
        if kind == 'code':
            rest.append('<pre><code>' + esc('\n'.join(content)) + '</code></pre>')
            first = False
        elif kind == 'table':
            rest.append('<table class="question-table"><thead><tr>'
                        + ''.join('<th>' + esc(cell) + '</th>' for cell in content[0])
                        + '</tr></thead><tbody>'
                        + ''.join('<tr>' + ''.join('<td>' + esc(cell) + '</td>' for cell in row) + '</tr>'
                                  for row in content[1:]) + '</tbody></table>')
            first = False
        else:
            for line in content:
                if first:
                    head, first = esc(line), False
                else:
                    style = ' style="margin-left:2em;text-indent:-1.3em"' if SUBPART_RE.match(line) else ''
                    rest.append(f'<p{style}>{esc(line)}</p>')
    return head, ''.join(rest)


def _format_mc_docx(doc, options, keep_with_next=True):
    from docx.shared import Cm, Pt
    from docx.enum.text import WD_TAB_ALIGNMENT
    opts = [_clean_question_text(x) for x in options]
    if not opts:
        return []
    lengths = [len(x) for x in opts]
    max_len = max(lengths) if lengths else 0
    total_len = sum(lengths)
    created = []

    # 1 line (4 options on 1 line):
    if len(opts) == 4 and max_len <= 16 and total_len <= 65:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.5)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.keep_with_next = True
        p.paragraph_format.tab_stops.add_tab_stop(Cm(4.25), WD_TAB_ALIGNMENT.LEFT)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(8.5), WD_TAB_ALIGNMENT.LEFT)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(12.75), WD_TAB_ALIGNMENT.LEFT)
        for i, opt in enumerate(opts):
            if i > 0:
                p.add_run('\t')
            r_lbl = p.add_run(f'{chr(65+i)}. ')
            r_lbl.bold = True
            p.add_run(opt)
        created.append(p)
    # 2 lines (2 options per line):
    elif len(opts) == 4 and max_len <= 38:
        p1 = doc.add_paragraph()
        p1.paragraph_format.left_indent = Cm(0.5)
        p1.paragraph_format.space_before = Pt(0)
        p1.paragraph_format.space_after = Pt(1.5)
        p1.paragraph_format.keep_with_next = True
        p1.paragraph_format.tab_stops.add_tab_stop(Cm(8.5), WD_TAB_ALIGNMENT.LEFT)
        r_l1 = p1.add_run('A. '); r_l1.bold = True
        p1.add_run(opts[0])
        p1.add_run('\t')
        r_l2 = p1.add_run('B. '); r_l2.bold = True
        p1.add_run(opts[1])
        created.append(p1)

        p2 = doc.add_paragraph()
        p2.paragraph_format.left_indent = Cm(0.5)
        p2.paragraph_format.space_before = Pt(0)
        p2.paragraph_format.space_after = Pt(2)
        p2.paragraph_format.keep_with_next = True
        p2.paragraph_format.tab_stops.add_tab_stop(Cm(8.5), WD_TAB_ALIGNMENT.LEFT)
        r_l3 = p2.add_run('C. '); r_l3.bold = True
        p2.add_run(opts[2])
        p2.add_run('\t')
        r_l4 = p2.add_run('D. '); r_l4.bold = True
        p2.add_run(opts[3])
        created.append(p2)
    # 4 lines (1 option per line):
    else:
        for i, text in enumerate(opts):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.5)
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(1.5)
            p.paragraph_format.keep_with_next = True if i < len(opts) - 1 else False
            r_lbl = p.add_run(f'{chr(65+i)}. ')
            r_lbl.bold = True
            p.add_run(text)
            created.append(p)
    if created:
        # Keep a stem with its own choices, never chain it to the next question.
        created[-1].paragraph_format.keep_with_next = False
    return created


def _format_mc_html(options):
    opts = [escape(str(x).strip(), quote=True) for x in options]
    if not opts:
        return ''
    lengths = [len(x) for x in opts]
    max_len = max(lengths) if lengths else 0
    total_len = sum(lengths)
    if len(opts) == 4 and max_len <= 16 and total_len <= 65:
        return '<div class="options-grid cols-4">' + ''.join(f'<p class="option"><strong>{chr(65+i)}.</strong> {v}</p>' for i, v in enumerate(opts)) + '</div>'
    elif len(opts) == 4 and max_len <= 38:
        return '<div class="options-grid cols-2">' + ''.join(f'<p class="option"><strong>{chr(65+i)}.</strong> {v}</p>' for i, v in enumerate(opts)) + '</div>'
    return ''.join(f'<p class="option"><strong>{chr(65+i)}.</strong> {v}</p>' for i, v in enumerate(opts))


def _html(record, answers, revision):
    esc = lambda x: escape(str(x), quote=True)
    body = [f'<header class="doc-head" align="center"><h1>{esc(record.get("title", ""))}</h1>', f'<p align="center"><strong>{esc(record.get("subject_name", "Tin học"))} {esc(record["grade"])}</strong></p>']
    if record.get('campus'):
        body.append(f'<p align="center">Cơ sở: {esc(record["campus"])} — Mã đề: {esc(record.get("exam_code",""))}</p>')
    if revision and record.get('school_profile', True):
        banner_file = BANNER_PATH if BANNER_PATH.exists() else LOGO_PATH
        encoded = base64.b64encode(banner_file.read_bytes()).decode('ascii')
        body.insert(0, f'<div class="doc-logo-wrap" align="center"><img alt="Asian School" src="data:image/png;base64,{encoded}" style="max-height:2.2cm;display:block;margin:0 auto 10px"></div>')
    if not revision:
        if answers:
            body[0] = f'<header class="doc-head" align="center"><h1>ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM</h1>'
            body.append(f'<p align="center"><strong>{esc(record.get("title","ĐỀ KIỂM TRA"))}</strong>' + (f' — Mã đề: {esc(record.get("exam_code","GỐC"))}' if record.get("exam_code") else '') + '</p></header>')
        else:
            body.append(f'<p align="center">Thời gian: {esc(record.get("duration",45))} phút — Tổng điểm: 10</p>')
            body.append('<p align="center">Họ và tên: ................................................ Lớp: ................</p></header>')
    else:
        body.append('</header><h2>A. GIỚI HẠN KIẾN THỨC ÔN TẬP</h2><table><thead><tr><th align="center">STT</th><th align="center">Tên chủ đề</th><th align="center">Tên bài</th></tr></thead><tbody>')
        for n, row in enumerate(_goals(record), 1):
            body.append(f'<tr><td align="center">{n}</td><td>{esc(row["topic"])}</td><td>{esc(row["name"])}</td></tr>')
        body.append('</tbody></table><h2>B. CÂU HỎI ÔN TẬP</h2>')

    for kind, label in _section_defs(record):
        questions = [q for q in record['questions'] if q['type'] == kind]
        if not questions:
            continue
        body.append(f'<h2>{label}</h2>')
        for n, q in enumerate(questions, 1):
            n = q.get('slot_number', n)
            points = f' ({point_label(q["points"])} điểm)' if 'points' in q else ''
            head, rest = _question_html(esc, q["question"])
            body.append(f'<section class="question"><p><strong>Câu {n}{esc(points)}.</strong> {head}</p>{rest}')
            if kind == 'MC':
                body.append(_format_mc_html(q.get('options', [])))
            elif kind == 'YN':
                for st in q.get('statements', []):
                    body.append(f'<p class="option">{esc(st.get("label", ""))} ) {esc(st.get("text", ""))}</p>')
            if not revision and answers:
                if kind == 'MC':
                    body.append(f'<p><strong>Đáp án: {chr(65+q["correct"])}</strong></p>')
                    body.extend(f'<p>{chr(65+i)}. {esc(v)}</p>' for i, v in enumerate(q.get('option_explanations', [])))
                elif kind == 'YN':
                    ans_parts = [f'{st.get("label", "")}: {"Đúng" if st.get("correct") else "Sai"}' for st in q.get('statements', [])]
                    body.append(f'<p><strong>Đáp án: {", ".join(ans_parts)}</strong></p>')
                elif kind == 'SHORT':
                    body.append(f'<p><strong>Đáp án: {esc(canonical_short_answer(q))}</strong></p>')
                else:
                    max_score = q.get('max_score', 1) or 1
                    scale = q.get('points', max_score) / max_score
                    body.extend(_rubric_html(esc, c["criterion"], f' ({point_label(c["points"]*scale)} điểm)') for c in q.get('rubric', []))
                    if q.get('equivalent_answer_policy'):
                        body.append(f'<p>{esc(_scaled_policy(q))}</p>')
            body.append('</section>')

    if revision:
        body.append('<div style="page-break-before:always"><h2>C. BẢNG ĐÁP ÁN GỢI Ý VÀ HƯỚNG DẪN CHẤM</h2>')
        mc_questions = [q for q in record.get('questions', []) if q.get('type') == 'MC']
        if mc_questions:
            body.append(f'<h3>I. BẢNG ĐÁP ÁN TRẮC NGHIỆM ({len(mc_questions)} CÂU)</h3>')
            chunk_size = 18
            for chunk_idx in range(0, len(mc_questions), chunk_size):
                chunk = mc_questions[chunk_idx:chunk_idx + chunk_size]
                body.append('<table class="answer-table"><thead><tr><th>Câu</th>' + ''.join(f'<th>{q.get("slot_number", chunk_idx + ci + 1)}</th>' for ci, q in enumerate(chunk)) + '</tr></thead><tbody>')
                body.append('<tr><td><strong>Đ/A</strong></td>' + ''.join(f'<td><strong>{chr(65 + q["correct"]) if "correct" in q and isinstance(q["correct"], int) else "—"}</strong></td>' for q in chunk) + '</tr></tbody></table>')

        yn_questions = [q for q in record.get('questions', []) if q.get('type') == 'YN']
        if yn_questions:
            body.append(f'<h3>II. BẢNG ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI ({len(yn_questions)} CÂU)</h3><table class="answer-table"><thead><tr><th>Câu hỏi</th><th>Ý a)</th><th>Ý b)</th><th>Ý c)</th><th>Ý d)</th></tr></thead><tbody>')
            for n, q in enumerate(yn_questions, 1):
                slot = q.get('slot_number', n)
                stmts = q.get('statements', [])
                body.append(f'<tr><td><strong>Câu {slot}</strong></td>' + ''.join(f'<td><strong>{"ĐÚNG" if stmts[si].get("correct") else "SAI"}</strong></td>' if si < len(stmts) else '<td>—</td>' for si in range(4)) + '</tr>')
            body.append('</tbody></table>')

        es_questions = [q for q in record.get('questions', []) if q.get('type') == 'ES']
        if es_questions:
            body.append(f'<h3>III. HƯỚNG DẪN CHẤM VÀ GỢI Ý TỰ LUẬN ({len(es_questions)} CÂU)</h3>')
            for n, q in enumerate(es_questions, 1):
                slot = q.get('slot_number', n)
                pts = f' ({point_label(q["points"])} điểm)' if 'points' in q else ''
                body.append(f'<p><strong>Câu {slot}{pts}</strong></p>')
                for c in q.get('rubric', []):
                    body.append(_rubric_html(esc, c.get("criterion", ""), f' ({point_label(c.get("points", 0.25))} điểm)', '• ', 1.5))
                if q.get('equivalent_answer_policy'):
                    body.append(f'<p style="margin-left:1.5em"><em>Quy tắc chấm tương đương: {esc(_scaled_policy(q))}</em></p>')
        body.append('</div>')

    return ('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>'+esc(record.get('title',''))+'</title><style>body{font-family:"Times New Roman",serif;font-size:12pt;max-width:21cm;margin:1.5cm auto;line-height:1.4;color:#000}header.doc-head{text-align:center;margin-bottom:1em}h1{font-size:16pt;text-align:center;margin:.2em 0}h2{font-size:13pt;margin-top:1.2em;border-bottom:1px solid #444;padding-bottom:4px}h3{font-size:12pt;margin-top:1em}.question{margin-bottom:1em}.option{margin:.2em 0 .2em .5em}.options-grid.cols-4{display:grid;grid-template-columns:repeat(4,1fr);gap:4px 10px;margin:.2em 0 .4em .5em}.options-grid.cols-2{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 16px;margin:.2em 0 .4em .5em}table{border-collapse:collapse;width:100%;table-layout:fixed;margin:0 auto}th,td{border:1px solid #444;padding:6px;overflow-wrap:anywhere;vertical-align:middle}th,[align="center"]{text-align:center}th:first-child{width:6%}thead{display:table-header-group}p{white-space:pre-wrap}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:"Courier New",monospace}.question-table{max-width:24cm}.question-table th:first-child{width:auto}.question-table th,.question-table td{white-space:pre-wrap}.answer-table{margin:8px auto 14px}.answer-table th,.answer-table td{padding:4px 6px;text-align:center;font-size:11pt}@page{size:A4 portrait;margin:1.5cm 2cm}@media print{body{margin:0;max-width:none}.question>p:first-child{break-after:avoid}.option{break-inside:avoid}h2{break-after:avoid}tr{break-inside:avoid}}</style><body>' + ''.join(body) + '</body></html>').encode()


def _apply_school_page_rules(doc):
    """Một chuẩn trang cho các bản Word; không đổi nội dung hoặc nhánh chuyển PDF."""
    from docx.shared import Cm
    from docx.enum.section import WD_ORIENT
    from docx.enum.text import WD_TAB_ALIGNMENT
    from docx.table import _Cell
    # Bỏ các điểm tab giữa/phải kế thừa từ mẫu Footer dọc.
    doc.styles['Footer'].paragraph_format.tab_stops.clear_all()
    for section in doc.sections:
        section.orientation = WD_ORIENT.LANDSCAPE
        section.page_width, section.page_height = Cm(29.7), Cm(21)
        section.top_margin = section.bottom_margin = Cm(1)
        section.left_margin, section.right_margin = Cm(1.5), Cm(1)
        section.header_distance, section.footer_distance = Cm(.2), Cm(.3)
        for paragraph in section.footer.paragraphs:
            if '\t' in paragraph.text:
                paragraph.paragraph_format.tab_stops.clear_all()
                paragraph.paragraph_format.tab_stops.add_tab_stop(
                    section.page_width-section.left_margin-section.right_margin, WD_TAB_ALIGNMENT.RIGHT)
    for table in doc.tables:
        columns = list(table.columns)
        if not columns:
            continue
        widths = [int(column.width or Cm(1)) for column in columns]
        first = list(table.rows[0].cells) if table.rows else []
        if len(first) == len(columns) and len({id(cell._tc) for cell in first}) == len(columns):
            declared = [int(cell.width or 0) for cell in first]
            if all(declared):
                widths = declared
        total = sum(widths)
        limit = min(int(Cm(24)), total)
        scaled = [max(1, int(width*limit/total)) for width in widths]
        scaled[-1] = limit-sum(scaled[:-1])
        table.autofit = False
        for column, width in zip(columns, scaled):
            column.width = width
        for row in table.rows:
            start = 0
            for tc in row._tr.tc_lst:
                span = tc.grid_span
                _Cell(tc, table).width = sum(scaled[start:start+span])
                start += span


def _docx(record, answers, revision):
    try:
        from docx import Document
        from docx.shared import Cm, Pt, RGBColor
        from docx.enum.section import WD_ORIENT
        from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
        from docx.enum.table import WD_TABLE_ALIGNMENT
        from docx.oxml import OxmlElement, parse_xml
        from docx.oxml.ns import qn, nsdecls
    except ImportError as exc:
        raise ServiceError('Chưa tìm thấy python-docx. Hãy chạy máy chủ bằng Python trong bộ công cụ Codex.', status=409) from exc
    doc = Document()
    section = doc.sections[0]
    section.orientation = WD_ORIENT.PORTRAIT
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.0)
    section.header_distance = Cm(0.8)
    section.footer_distance = Cm(1.0)

    _times_new_roman_styles(doc, 12)
    normal = doc.styles['Normal']
    normal.paragraph_format.space_after = Pt(2.5)
    normal.paragraph_format.line_spacing = 1.12
    for prop in ('author', 'last_modified_by', 'comments', 'subject', 'keywords', 'category', 'identifier'):
        setattr(doc.core_properties, prop, '')
    doc.core_properties.title = record.get('title', '')

    if revision and record.get('school_profile', True):
        # Banner là đầu trang trực quan của trang đầu, không lặp/cắt ở các trang sau.
        for paragraph in section.header.paragraphs:
            paragraph.text = ''
        header = doc.add_paragraph()
        header.alignment = WD_ALIGN_PARAGRAPH.CENTER
        banner_file = BANNER_PATH if BANNER_PATH.exists() else LOGO_PATH
        img_w = Cm(13.5) if BANNER_PATH.exists() else Cm(4.0)  # góp ý 26/10/2026: logo nhỏ hơn
        header.add_run().add_picture(str(banner_file), width=img_w)
        section.top_margin = Cm(2.6) if BANNER_PATH.exists() else Cm(2.0)
    else:
        for p in section.header.paragraphs:
            p.text = ''

    if not record.get('school_profile', True):
        subject = record.get('subject_name', 'Môn học').upper()
        heading = ('ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM — ' if answers and not revision else '') + record.get('title', 'ĐỀ KIỂM TRA')
        doc.add_heading(heading, level=1).alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.add_paragraph(f'MÔN: {subject} — KHỐI {record["grade"]}').alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.add_paragraph('Năm học: '+record.get('school_year', '')).alignment = WD_ALIGN_PARAGRAPH.CENTER
        if not revision:
            doc.add_paragraph(f'Thời gian: {record.get("duration", 45)} phút — Tổng điểm: {record.get("total_points", 10)}')
            if not answers:
                doc.add_paragraph('Họ và tên: ........................................ Lớp: ................')
        else:
            doc.add_heading('A. GIỚI HẠN KIẾN THỨC ÔN TẬP', level=2)
            table = doc.add_table(rows=1, cols=3)
            table.style = 'Table Grid'
            for cell, text in zip(table.rows[0].cells, ['STT', 'Tên chủ đề', 'Tên bài']):
                cell.text = text
            repeat = OxmlElement('w:tblHeader'); table.rows[0]._tr.get_or_add_trPr().append(repeat)
            for n, row in enumerate(_goals(record), 1):
                for cell, text in zip(table.add_row().cells, [str(n), row['topic'], row['name']]):
                    cell.text = text
            doc.add_heading('B. HỆ THỐNG CÂU HỎI ÔN TẬP', level=2)
    elif not revision:
        subj_name = str(record.get('subject_name') or 'Tin học').upper()
        term_name = _format_exam_term(record.get('exam_type', 'GK1'))
        s_year = str(record.get('school_year') or '2026 - 2027')
        dur = record.get('duration', 45)
        grd = record.get('grade', 10)
        ex_code = record.get('exam_code', '')

        if answers:
            t_hdr = doc.add_table(rows=1, cols=2)
            t_hdr.alignment = WD_TABLE_ALIGNMENT.CENTER
            t_hdr.autofit = False
            _set_table_borders(t_hdr, val="none")
            c_left, c_right = t_hdr.rows[0].cells
            c_left.width = Cm(7.5); c_right.width = Cm(9.0)

            p_l = c_left.paragraphs[0]; p_l.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_l.paragraph_format.line_spacing = 1.05
            r_l = p_l.add_run(f"TRƯỜNG TH, THCS VÀ THPT\nQUỐC TẾ Á CHÂU\nTỔ BỘ MÔN: {subj_name}")
            r_l.bold = True; r_l.font.size = Pt(10)

            p_r = c_right.paragraphs[0]; p_r.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_r.paragraph_format.line_spacing = 1.05
            r_ans = p_r.add_run("ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM\n")
            r_ans.bold = True; r_ans.font.size = Pt(11); r_ans.font.color.rgb = RGBColor(180, 20, 20)
            r_sub = p_r.add_run(f"{exam_heading(record.get('exam_type', 'GK1'))} — {subj_name} {grd}\nNĂM HỌC {s_year}")
            r_sub.bold = True; r_sub.font.size = Pt(10)

            p_meta = doc.add_paragraph(); p_meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_meta.paragraph_format.space_before = Pt(4); p_meta.paragraph_format.space_after = Pt(8)
            exam_code_str = f" — Mã đề: {ex_code}" if ex_code else ""
            r_m = p_meta.add_run(f"Kèm theo đề kiểm tra: {record.get('title', 'ĐỀ CHÍNH THỨC')}{exam_code_str} — Tổng điểm: 10,0 điểm")
            r_m.italic = True; r_m.font.size = Pt(10.5)
        else:
            t_hdr = doc.add_table(rows=1, cols=2)
            t_hdr.alignment = WD_TABLE_ALIGNMENT.CENTER
            t_hdr.autofit = False
            _set_table_borders(t_hdr, val="none")
            c_left, c_right = t_hdr.rows[0].cells
            c_left.width = Cm(7.5); c_right.width = Cm(9.0)

            p_l = c_left.paragraphs[0]; p_l.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_l.paragraph_format.line_spacing = 1.05
            r_l = p_l.add_run("SỞ GIÁO DỤC VÀ ĐÀO TẠO\nTHÀNH PHỐ HỒ CHÍ MINH\nTRƯỜNG TH, THCS VÀ THPT\nQUỐC TẾ Á CHÂU\nĐỀ CHÍNH THỨC")
            r_l.bold = True; r_l.font.size = Pt(10)
            if ex_code:
                r_code = p_l.add_run(f"\n(MÃ ĐỀ: {ex_code})"); r_code.bold = True; r_code.font.size = Pt(10)

            p_r = c_right.paragraphs[0]; p_r.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_r.paragraph_format.line_spacing = 1.05
            r_r = p_r.add_run(f"{exam_heading(record.get('exam_type', 'GK1'))}\nNĂM HỌC {s_year}\n")
            r_r.bold = True; r_r.font.size = Pt(11)
            r_r_sub = p_r.add_run("(Đề thi có "); r_r_sub.italic = True; r_r_sub.font.size = Pt(9.5)
            _add_numpages_field(p_r, 9.5)
            r_r_end = p_r.add_run(" trang)"); r_r_end.italic = True; r_r_end.font.size = Pt(9.5)

            p_sub = doc.add_paragraph(); p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_sub.paragraph_format.space_before = Pt(4); p_sub.paragraph_format.space_after = Pt(2)
            r_m = p_sub.add_run(f"MÔN: {subj_name} - KHỐI {grd}\n")
            r_m.bold = True; r_m.font.size = Pt(12)
            r_t = p_sub.add_run(f"(Thời gian làm bài: {dur} phút, không tính thời gian giao đề)")
            r_t.italic = True; r_t.font.size = Pt(10.5)

            p_stu = doc.add_paragraph(); p_stu.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_stu.paragraph_format.space_before = Pt(4); p_stu.paragraph_format.space_after = Pt(2)
            p_stu.add_run("Họ tên học sinh: .............................................................. Lớp: ................ SBD: ................").font.size = Pt(11)

            p_not = doc.add_paragraph(); p_not.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_not.paragraph_format.space_before = Pt(0); p_not.paragraph_format.space_after = Pt(8)
            r_not = p_not.add_run("(Học sinh lưu ý làm bài trên giấy thi, không làm trên đề)")
            r_not.italic = True; r_not.font.size = Pt(10)
    else:
        subj_name = str(record.get('subject_name') or 'Tin học').upper()
        term_name = _format_exam_term(record.get('exam_type', 'GK1'))
        s_year = str(record.get('school_year') or '2026 - 2027')
        grd = record.get('grade', 10)

        p_sch = doc.add_paragraph(); p_sch.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_sch.paragraph_format.space_before = Pt(4); p_sch.paragraph_format.space_after = Pt(2)
        if not BANNER_PATH.exists():  # banner logo đã có tên trường, không lặp lại
            r1 = p_sch.add_run("TRƯỜNG TH, THCS VÀ THPT QUỐC TẾ Á CHÂU\n")
            r1.bold = True; r1.font.size = Pt(12)
        r2 = p_sch.add_run(f"ĐỀ CƯƠNG ÔN TẬP KIỂM TRA {term_name} — NĂM HỌC {s_year}\n")
        r2.bold = True; r2.font.size = Pt(13); r2.font.color.rgb = RGBColor(180, 20, 20)
        r3 = p_sch.add_run(f"MÔN: {subj_name} — KHỐI {grd}")
        r3.bold = True; r3.font.size = Pt(12)

        t_box = doc.add_table(rows=1, cols=1)
        t_box.alignment = WD_TABLE_ALIGNMENT.CENTER
        t_box.autofit = False
        t_box.rows[0].cells[0].width = Cm(16.5)
        _set_cell_bg(t_box.rows[0].cells[0], 'EBF0FA')
        _set_table_borders(t_box, val='single', sz='4', color='B0C0D0')
        _set_cell_margins(t_box.rows[0].cells[0], top=60, bottom=60, left=80, right=80)
        p_box = t_box.rows[0].cells[0].paragraphs[0]
        p_box.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_box.paragraph_format.space_before = Pt(2); p_box.paragraph_format.space_after = Pt(2)
        r_box = p_box.add_run("Họ và tên học sinh: ............................................................................ Lớp: ....................   SBD: ....................")
        r_box.bold = True; r_box.font.size = Pt(10.5)

        p_hdA = doc.add_paragraph()
        p_hdA.paragraph_format.space_before = Pt(8); p_hdA.paragraph_format.space_after = Pt(4)
        r_hdA = p_hdA.add_run('A. GIỚI HẠN KIẾN THỨC ÔN TẬP')
        r_hdA.bold = True; r_hdA.font.size = Pt(12); r_hdA.font.color.rgb = RGBColor(180, 20, 20)

        # Góp ý 26/10/2026: bỏ cột "Mục tiêu bài học"; bảng còn 3 cột.
        table = doc.add_table(rows=1, cols=3); table.alignment = WD_TABLE_ALIGNMENT.CENTER; table.autofit = False
        _set_table_borders(table, val='single', sz='4', color='B0C0D0')
        widths = [1.2, 7.0, 8.3]
        for cell, w, text in zip(table.rows[0].cells, widths, ['STT', 'Tên chủ đề', 'Tên bài']):
            cell.width = Cm(w); cell.text = text
            _set_cell_bg(cell, 'EBF0FA')
            _set_cell_margins(cell, top=60, bottom=60, left=60, right=60)
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            if cell.paragraphs[0].runs:
                cell.paragraphs[0].runs[0].bold = True; cell.paragraphs[0].runs[0].font.size = Pt(10)
        repeat = OxmlElement('w:tblHeader'); table.rows[0]._tr.get_or_add_trPr().append(repeat)

        for n, row in enumerate(_goals(record), 1):
            r_cells = table.add_row().cells
            for c_idx, (cell, w, text) in enumerate(zip(r_cells, widths, [str(n), row['topic'], row['name']])):
                cell.width = Cm(w); cell.text = text
                _set_cell_margins(cell, top=40, bottom=40, left=60, right=60)
                if c_idx == 0:
                    cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in cell.paragraphs[0].runs:
                    r.font.size = Pt(10)
        for col, w in zip(table.columns, widths): col.width = Cm(w)

        p_hdB = doc.add_paragraph()
        p_hdB.paragraph_format.space_before = Pt(8); p_hdB.paragraph_format.space_after = Pt(4)
        r_hdB = p_hdB.add_run('B. HỆ THỐNG CÂU HỎI ÔN TẬP')
        r_hdB.bold = True; r_hdB.font.size = Pt(12); r_hdB.font.color.rgb = RGBColor(180, 20, 20)

    if not revision and answers:
        part_numbers = iter(ROMAN)  # đánh số PHẦN theo các dạng câu có trong đề
        mc_questions = [q for q in record.get('questions', []) if q.get('type') == 'MC']
        if mc_questions:
            p_sec = doc.add_paragraph()
            p_sec.paragraph_format.space_before = Pt(8); p_sec.paragraph_format.space_after = Pt(4)
            p_sec.paragraph_format.keep_with_next = True
            r_sec = p_sec.add_run(f"PHẦN {next(part_numbers)}. ĐÁP ÁN TRẮC NGHIỆM KHÁCH QUAN")
            r_sec.bold = True; r_sec.font.size = Pt(12)

            for start_idx in range(0, len(mc_questions), 10):
                chunk = mc_questions[start_idx:start_idx + 10]
                t_mc = doc.add_table(rows=2, cols=len(chunk) + 1)
                t_mc.alignment = WD_TABLE_ALIGNMENT.CENTER; t_mc.autofit = False
                _set_table_borders(t_mc, val='single', sz='4', color='B0C0D0')
                t_mc.rows[0].cells[0].width = Cm(1.6); t_mc.rows[1].cells[0].width = Cm(1.6)
                t_mc.rows[0].cells[0].text = "Câu"; t_mc.rows[1].cells[0].text = "Đ/A"
                _set_cell_bg(t_mc.rows[0].cells[0], 'EBF0FA')
                _set_cell_bg(t_mc.rows[1].cells[0], 'F5F7FA')
                for r_idx in (0, 1):
                    t_mc.rows[r_idx].cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    if t_mc.rows[r_idx].cells[0].paragraphs[0].runs:
                        t_mc.rows[r_idx].cells[0].paragraphs[0].runs[0].bold = True
                for ci, q in enumerate(chunk, 1):
                    c0 = t_mc.rows[0].cells[ci]; c1 = t_mc.rows[1].cells[ci]
                    c0.width = Cm(1.4); c1.width = Cm(1.4)
                    c0.text = str(q.get('slot_number', start_idx + ci))
                    corr = chr(65 + q['correct']) if 'correct' in q and isinstance(q['correct'], int) and 0 <= q['correct'] <= 25 else 'A'
                    c1.text = corr
                    _set_cell_bg(c0, 'EBF0FA')
                    c0.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    c1.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    if c0.paragraphs[0].runs: c0.paragraphs[0].runs[0].bold = True
                    if c1.paragraphs[0].runs: c1.paragraphs[0].runs[0].bold = True
                p_sp = doc.add_paragraph()
                p_sp.paragraph_format.space_before = Pt(0); p_sp.paragraph_format.space_after = Pt(2)

        yn_questions = [q for q in record.get('questions', []) if q.get('type') == 'YN']
        if yn_questions:
            p_sec = doc.add_paragraph()
            p_sec.paragraph_format.space_before = Pt(8); p_sec.paragraph_format.space_after = Pt(4)
            p_sec.paragraph_format.keep_with_next = True
            r_sec = p_sec.add_run(f"PHẦN {next(part_numbers)}. ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI")
            r_sec.bold = True; r_sec.font.size = Pt(12)

            t_yn = doc.add_table(rows=1 + len(yn_questions), cols=6)
            t_yn.alignment = WD_TABLE_ALIGNMENT.CENTER; t_yn.autofit = False
            _set_table_borders(t_yn, val='single', sz='4', color='B0C0D0')
            widths_yn = [2.0, 2.8, 2.8, 2.8, 2.8, 2.5]
            for c, text, w in zip(t_yn.rows[0].cells, ['Câu', 'Ý a)', 'Ý b)', 'Ý c)', 'Ý d)', 'Điểm'], widths_yn):
                c.width = Cm(w); c.text = text; _set_cell_bg(c, 'EBF0FA')
                c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                if c.paragraphs[0].runs: c.paragraphs[0].runs[0].bold = True
            repeat_yn = OxmlElement('w:tblHeader'); t_yn.rows[0]._tr.get_or_add_trPr().append(repeat_yn)

            for ri, q in enumerate(yn_questions, 1):
                row_cells = t_yn.rows[ri].cells
                for c, w in zip(row_cells, widths_yn): c.width = Cm(w)
                row_cells[0].text = f"Câu {q.get('slot_number', ri)}"
                row_cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                if row_cells[0].paragraphs[0].runs: row_cells[0].paragraphs[0].runs[0].bold = True
                stmts = q.get('statements', [])
                for si in range(4):
                    st = stmts[si] if si < len(stmts) else {}
                    val = "Đúng" if st.get('correct') else "Sai"
                    row_cells[si + 1].text = val
                    row_cells[si + 1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                row_cells[5].text = f"{point_label(q.get('points', 1.0))} đ"
                row_cells[5].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            for max_points in sorted({q.get('points', 1.0) for q in yn_questions}):
                p_note = doc.add_paragraph()
                p_note.paragraph_format.space_before = Pt(3)
                r_note = p_note.add_run(f'Cách tính điểm câu Đúng/Sai ({point_label(max_points)} điểm/câu): '
                                        f'{yn_points_note(record, max_points)}.')
                r_note.italic = True; r_note.font.size = Pt(10.5)
            p_sp = doc.add_paragraph()
            p_sp.paragraph_format.space_before = Pt(0); p_sp.paragraph_format.space_after = Pt(2)

        short_questions = [q for q in record.get('questions', []) if q.get('type') == 'SHORT']
        if short_questions:
            p_sec = doc.add_paragraph()
            p_sec.paragraph_format.space_before = Pt(8); p_sec.paragraph_format.space_after = Pt(4)
            p_sec.paragraph_format.keep_with_next = True
            r_sec = p_sec.add_run(f"PHẦN {next(part_numbers)}. ĐÁP ÁN TRẢ LỜI NGẮN")
            r_sec.bold = True; r_sec.font.size = Pt(12)

            t_sh = doc.add_table(rows=1 + len(short_questions), cols=3)
            t_sh.alignment = WD_TABLE_ALIGNMENT.CENTER; t_sh.autofit = False
            _set_table_borders(t_sh, val='single', sz='4', color='B0C0D0')
            widths_sh = [2.5, 11.5, 2.0]
            for c, text, w in zip(t_sh.rows[0].cells, ['Câu', 'Đáp án chấp nhận', 'Điểm'], widths_sh):
                c.width = Cm(w); c.text = text; _set_cell_bg(c, 'EBF0FA')
                c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                if c.paragraphs[0].runs: c.paragraphs[0].runs[0].bold = True
            for ri, q in enumerate(short_questions, 1):
                row_cells = t_sh.rows[ri].cells
                for c, w in zip(row_cells, widths_sh): c.width = Cm(w)
                row_cells[0].text = f"Câu {q.get('slot_number', ri)}"
                row_cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                if row_cells[0].paragraphs[0].runs: row_cells[0].paragraphs[0].runs[0].bold = True
                row_cells[1].text = canonical_short_answer(q)
                row_cells[2].text = f"{point_label(q.get('points', 0.5))} đ"
                row_cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_sp = doc.add_paragraph()
            p_sp.paragraph_format.space_before = Pt(0); p_sp.paragraph_format.space_after = Pt(2)

        es_questions = [q for q in record.get('questions', []) if q.get('type') == 'ES']
        if es_questions:
            p_sec = doc.add_paragraph()
            p_sec.paragraph_format.space_before = Pt(10); p_sec.paragraph_format.space_after = Pt(4)
            p_sec.paragraph_format.keep_with_next = True
            r_sec = p_sec.add_run(f"PHẦN {next(part_numbers)}. HƯỚNG DẪN CHẤM VÀ THANG ĐIỂM TỰ LUẬN")
            r_sec.bold = True; r_sec.font.size = Pt(12)

            t_es = doc.add_table(rows=1, cols=3)
            t_es.alignment = WD_TABLE_ALIGNMENT.CENTER; t_es.autofit = False
            _set_table_borders(t_es, val='single', sz='4', color='B0C0D0')
            widths_es = [2.5, 11.5, 2.0]
            for c, text, w in zip(t_es.rows[0].cells, ['Câu / Ý', 'Nội dung yêu cầu / Tiêu chí chấm', 'Điểm'], widths_es):
                c.width = Cm(w); c.text = text; _set_cell_bg(c, 'EBF0FA')
                c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                if c.paragraphs[0].runs: c.paragraphs[0].runs[0].bold = True
            repeat_es = OxmlElement('w:tblHeader'); t_es.rows[0]._tr.get_or_add_trPr().append(repeat_es)

            for q in es_questions:
                group_start = len(t_es.rows)
                slot = q.get('slot_number', '')
                q_pts = q.get('points', 1.0)
                max_score = q.get('max_score', 1.0) or 1.0
                scale = q_pts / max_score
                rubrics = q.get('rubric', [])

                if rubrics:
                    for idx, rub in enumerate(rubrics):
                        r_cells = t_es.add_row().cells
                        for c, w in zip(r_cells, widths_es): c.width = Cm(w)
                        if idx == 0:
                            r_cells[0].text = f"Câu {slot}\n({point_label(q_pts)} đ)"
                            r_cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                            if r_cells[0].paragraphs[0].runs: r_cells[0].paragraphs[0].runs[0].bold = True
                        else:
                            r_cells[0].text = ""
                        _add_rubric(_cell_paragraphs(r_cells[1]), rub.get('criterion', ''), size=11)
                        r_cells[2].text = f"{point_label(rub.get('points', 0.25) * scale)} điểm"
                        r_cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                else:
                    r_cells = t_es.add_row().cells
                    for c, w in zip(r_cells, widths_es): c.width = Cm(w)
                    r_cells[0].text = f"Câu {slot}\n({point_label(q_pts)} đ)"
                    r_cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    if r_cells[0].paragraphs[0].runs: r_cells[0].paragraphs[0].runs[0].bold = True
                    ans_text = q.get('sample_answer') or q.get('answer') or 'Học sinh trình bày đúng nội dung bài học.'
                    r_cells[1].text = ans_text
                    r_cells[2].text = f"{point_label(q_pts)} điểm"
                    r_cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

                if q.get('equivalent_answer_policy'):
                    r_cells = t_es.add_row().cells
                    r_cells[0].merge(r_cells[2])
                    r_cells[0].width = Cm(16.0)
                    r_cells[0].text = f"Lưu ý: {_scaled_policy(q)}"
                    r_cells[0].paragraphs[0].runs[0].italic = True
                    _set_cell_bg(r_cells[0], 'F9FAFC')
                for ri in range(group_start, len(t_es.rows)):
                    row = t_es.rows[ri]
                    row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
                    for cell in row.cells:
                        for paragraph in cell.paragraphs:
                            paragraph.paragraph_format.keep_with_next = ri < len(t_es.rows)-1
            p_sp = doc.add_paragraph()
            p_sp.paragraph_format.space_before = Pt(0); p_sp.paragraph_format.space_after = Pt(2)

        p_det = doc.add_paragraph()
        p_det.paragraph_format.space_before = Pt(14); p_det.paragraph_format.space_after = Pt(4)
        p_det.paragraph_format.keep_with_next = True
        r_det = p_det.add_run("BẢN ĐỀ THI VÀ ĐÁP ÁN CHI TIẾT TỪNG CÂU")
        r_det.bold = True; r_det.font.size = Pt(12)
        r_det.font.color.rgb = RGBColor(180, 20, 20)

    for kind, label in _section_defs(record):
        questions = [q for q in record['questions'] if q['type'] == kind]
        if not questions:
            continue
        p_sec = doc.add_paragraph()
        p_sec.paragraph_format.space_before = Pt(8)
        p_sec.paragraph_format.space_after = Pt(4)
        p_sec.paragraph_format.keep_with_next = True
        r_sec = p_sec.add_run(label)
        r_sec.bold = True
        r_sec.font.size = Pt(12)
        if revision:
            r_sec.font.color.rgb = RGBColor(180, 20, 20)

        for n, q in enumerate(questions, 1):
            slot = q.get('slot_number', n)
            points = f' ({point_label(q["points"])} điểm)' if 'points' in q else ''
            p = doc.add_paragraph()
            p.paragraph_format.keep_with_next = True
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.12
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

            r_q = p.add_run(f'Câu {slot}{points}. ')
            r_q.bold = True
            r_q.font.size = Pt(11)
            _add_text_lines(doc, p, _clean_question_text(q['question']), size=11)

            if kind == 'MC':
                _format_mc_docx(doc, q.get('options', []), keep_with_next=True)
            elif kind == 'YN':
                p_prompt = doc.add_paragraph()
                p_prompt.paragraph_format.left_indent = Cm(0.5)
                p_prompt.paragraph_format.space_before = Pt(0)
                p_prompt.paragraph_format.space_after = Pt(2)
                p_prompt.paragraph_format.keep_with_next = True
                r_n = p_prompt.add_run("Hãy xác định các nhận định sau là đúng hay sai:")
                r_n.italic = True
                r_n.font.size = Pt(10.5)

                stmts = q.get('statements', [])
                for i, st in enumerate(stmts):
                    p = doc.add_paragraph()
                    p.paragraph_format.left_indent = Cm(0.8)
                    p.paragraph_format.space_before = Pt(0)
                    p.paragraph_format.space_after = Pt(2)
                    p.paragraph_format.line_spacing = 1.1
                    p.paragraph_format.keep_with_next = i < len(stmts) - 1
                    lbl = st.get('label', chr(97 + i))
                    r_lbl = p.add_run(f'{lbl}) ')
                    r_lbl.bold = True
                    r_lbl.font.size = Pt(11)
                    p.add_run(st.get('text', '')).font.size = Pt(11)

            if not revision and answers:
                if kind == 'MC':
                    p = doc.add_paragraph()
                    p.paragraph_format.left_indent = Cm(0.5)
                    p.paragraph_format.space_before = Pt(2)
                    p.paragraph_format.space_after = Pt(2)
                    p.add_run(f'Đáp án: {chr(65+q["correct"])}').bold = True
                    for i, text in enumerate(q.get('option_explanations', [])):
                        p_exp = doc.add_paragraph()
                        p_exp.paragraph_format.left_indent = Cm(0.8)
                        p_exp.paragraph_format.space_before = Pt(0)
                        p_exp.paragraph_format.space_after = Pt(1)
                        p_exp.add_run(f'{chr(65+i)}. {text}').font.size = Pt(10.5)
                elif kind == 'YN':
                    ans_parts = [f'{st.get("label", chr(97+si))}: {"Đúng" if st.get("correct") else "Sai"}' for si, st in enumerate(q.get('statements', []))]
                    p = doc.add_paragraph()
                    p.paragraph_format.left_indent = Cm(0.5)
                    p.paragraph_format.space_before = Pt(2)
                    p.paragraph_format.space_after = Pt(2)
                    p.add_run(f'Đáp án: {", ".join(ans_parts)}').bold = True
                elif kind == 'SHORT':
                    p = doc.add_paragraph()
                    p.paragraph_format.left_indent = Cm(0.5)
                    p.paragraph_format.space_before = Pt(2)
                    p.paragraph_format.space_after = Pt(2)
                    p.add_run(f'Đáp án: {canonical_short_answer(q)}').bold = True
                else:
                    max_score = q.get('max_score', 1) or 1
                    scale = q.get('points', max_score) / max_score
                    for c in q.get('rubric', []):
                        _add_rubric(doc.add_paragraph, c['criterion'], f' ({point_label(c["points"]*scale)} điểm)', base_cm=0.5)
                    if q.get('equivalent_answer_policy'):
                        p_pol = doc.add_paragraph()
                        p_pol.paragraph_format.left_indent = Cm(0.5)
                        p_pol.paragraph_format.space_before = Pt(0)
                        p_pol.paragraph_format.space_after = Pt(2)
                        r_pol = p_pol.add_run(_scaled_policy(q))
                        r_pol.italic = True
                        r_pol.font.size = Pt(10)

    p_end = doc.add_paragraph()
    p_end.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_end.paragraph_format.space_before = Pt(12)
    p_end.paragraph_format.space_after = Pt(6)
    if revision:
        r_end = p_end.add_run("— HẾT —\nChúc các em ôn tập tốt và đạt kết quả cao!")
    elif answers:
        r_end = p_end.add_run("— HẾT HƯỚNG DẪN CHẤM —")
    else:
        r_end = p_end.add_run("— HẾT —\nHọc sinh không được sử dụng tài liệu. Giám thị không giải thích gì thêm.")
    r_end.bold = True
    r_end.italic = True

    if revision:
        doc.add_page_break()
        p_c = doc.add_paragraph()
        p_c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_c.paragraph_format.space_before = Pt(8)
        p_c.paragraph_format.space_after = Pt(6)
        r_c = p_c.add_run("C. BẢNG ĐÁP ÁN GỢI Ý VÀ HƯỚNG DẪN CHẤM")
        r_c.bold = True
        r_c.font.size = Pt(13)
        r_c.font.color.rgb = RGBColor(180, 20, 20)

        mc_questions = [q for q in record.get('questions', []) if q.get('type') == 'MC']
        if mc_questions:
            p_sub = doc.add_paragraph()
            p_sub.paragraph_format.space_before = Pt(6)
            p_sub.paragraph_format.space_after = Pt(3)
            r_sub = p_sub.add_run(f'I. BẢNG ĐÁP ÁN TRẮC NGHIỆM ({len(mc_questions)} CÂU)')
            r_sub.bold = True
            r_sub.font.size = Pt(11.5)

            chunk_size = 18
            for chunk_idx in range(0, len(mc_questions), chunk_size):
                chunk = mc_questions[chunk_idx:chunk_idx + chunk_size]
                t = doc.add_table(rows=2, cols=len(chunk) + 1)
                t.alignment = WD_TABLE_ALIGNMENT.CENTER
                t.autofit = False
                _set_table_borders(t, val="single", sz="4", color="B0C0D0")

                col_w = Cm((16.5 - 1.2) / len(chunk))
                c_lbl0 = t.rows[0].cells[0]; c_lbl0.width = Cm(1.2); c_lbl0.text = 'Câu'
                c_lbl1 = t.rows[1].cells[0]; c_lbl1.width = Cm(1.2); c_lbl1.text = 'Đ/A'
                for r_i in (0, 1):
                    cell = t.rows[r_i].cells[0]
                    _set_cell_bg(cell, 'EBF0FA')
                    _set_cell_margins(cell, top=40, bottom=40, left=40, right=40)
                    cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    if cell.paragraphs[0].runs:
                        cell.paragraphs[0].runs[0].bold = True
                        cell.paragraphs[0].runs[0].font.size = Pt(9.5)

                for ci, q in enumerate(chunk):
                    slot = q.get('slot_number', chunk_idx + ci + 1)
                    corr = chr(65 + q['correct']) if 'correct' in q and isinstance(q['correct'], int) else '—'

                    c0 = t.rows[0].cells[ci + 1]; c0.width = col_w; c0.text = str(slot)
                    _set_cell_bg(c0, 'EBF0FA')
                    _set_cell_margins(c0, top=40, bottom=40, left=40, right=40)
                    c0.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    if c0.paragraphs[0].runs:
                        c0.paragraphs[0].runs[0].bold = True
                        c0.paragraphs[0].runs[0].font.size = Pt(9.5)

                    c1 = t.rows[1].cells[ci + 1]; c1.width = col_w; c1.text = corr
                    _set_cell_margins(c1, top=40, bottom=40, left=40, right=40)
                    c1.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    if c1.paragraphs[0].runs:
                        c1.paragraphs[0].runs[0].bold = True
                        c1.paragraphs[0].runs[0].font.size = Pt(9.5)
                p_sp = doc.add_paragraph()
                p_sp.paragraph_format.space_before = Pt(0)
                p_sp.paragraph_format.space_after = Pt(4)

        yn_questions = [q for q in record.get('questions', []) if q.get('type') == 'YN']
        if yn_questions:
            p_sub = doc.add_paragraph()
            p_sub.paragraph_format.space_before = Pt(6)
            p_sub.paragraph_format.space_after = Pt(3)
            r_sub = p_sub.add_run(f'II. BẢNG ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI ({len(yn_questions)} CÂU)')
            r_sub.bold = True
            r_sub.font.size = Pt(11.5)

            t = doc.add_table(rows=1, cols=5)
            t.alignment = WD_TABLE_ALIGNMENT.CENTER
            t.autofit = False
            _set_table_borders(t, val="single", sz="4", color="B0C0D0")

            widths_yn = [2.5, 3.5, 3.5, 3.5, 3.5]
            for cell, w, text in zip(t.rows[0].cells, widths_yn, ['Câu hỏi', 'Ý a)', 'Ý b)', 'Ý c)', 'Ý d)']):
                cell.width = Cm(w); cell.text = text
                _set_cell_bg(cell, 'EBF0FA')
                _set_cell_margins(cell, top=60, bottom=60, left=60, right=60)
                cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                if cell.paragraphs[0].runs:
                    cell.paragraphs[0].runs[0].bold = True
                    cell.paragraphs[0].runs[0].font.size = Pt(10)
            repeat_yn = OxmlElement('w:tblHeader'); t.rows[0]._tr.get_or_add_trPr().append(repeat_yn)

            for n, q in enumerate(yn_questions, 1):
                slot = q.get('slot_number', n)
                row = t.add_row()
                row_trPr = row._tr.get_or_add_trPr()
                row_trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))

                c0 = row.cells[0]; c0.width = Cm(widths_yn[0]); c0.text = f'Câu {slot}'
                _set_cell_margins(c0, top=50, bottom=50, left=50, right=50)
                c0.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                if c0.paragraphs[0].runs:
                    c0.paragraphs[0].runs[0].bold = True
                    c0.paragraphs[0].runs[0].font.size = Pt(10)

                stmts = q.get('statements', [])
                for si in range(4):
                    st = stmts[si] if si < len(stmts) else {}
                    val = 'ĐÚNG' if st.get('correct') else 'SAI'
                    c = row.cells[si + 1]; c.width = Cm(widths_yn[si + 1]); c.text = val
                    _set_cell_margins(c, top=50, bottom=50, left=50, right=50)
                    c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    if c.paragraphs[0].runs:
                        c.paragraphs[0].runs[0].bold = True
                        c.paragraphs[0].runs[0].font.size = Pt(10)
            p_sp = doc.add_paragraph()
            p_sp.paragraph_format.space_before = Pt(0)
            p_sp.paragraph_format.space_after = Pt(4)

        es_questions = [q for q in record.get('questions', []) if q.get('type') == 'ES']
        if es_questions:
            p_sub = doc.add_paragraph()
            p_sub.paragraph_format.space_before = Pt(6)
            p_sub.paragraph_format.space_after = Pt(3)
            r_sub = p_sub.add_run(f'III. HƯỚNG DẪN CHẤM VÀ GỢI Ý TỰ LUẬN ({len(es_questions)} CÂU)')
            r_sub.bold = True
            r_sub.font.size = Pt(11.5)

            for n, q in enumerate(es_questions, 1):
                slot = q.get('slot_number', n)
                pts = f' ({point_label(q["points"])} điểm)' if 'points' in q else ''
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(2)
                r_q = p.add_run(f'Câu {slot}{pts}: ')
                r_q.bold = True
                r_q.font.size = Pt(11)
                _add_text_lines(doc, p, _clean_question_text(q.get('question', '')), size=11, keep_with_next=False)

                for c in q.get('rubric', []):
                    _add_rubric(doc.add_paragraph, c.get('criterion', ''), f' ({point_label(c.get("points", 0.25))} điểm)', '• ', base_cm=0.6)
                if q.get('equivalent_answer_policy'):
                    p_pol = doc.add_paragraph()
                    p_pol.paragraph_format.left_indent = Cm(0.6)
                    p_pol.paragraph_format.space_before = Pt(0)
                    p_pol.paragraph_format.space_after = Pt(2)
                    r_p = p_pol.add_run(f'Quy tắc chấm tương đương: {_scaled_policy(q)}')
                    r_p.italic = True
                    r_p.font.size = Pt(10)

    foot = section.footer.paragraphs[0]
    foot.text = ''
    foot.paragraph_format.tab_stops.add_tab_stop(Cm(16.5), WD_TAB_ALIGNMENT.RIGHT)
    if not record.get('school_profile', True):
        r_left = foot.add_run(record.get('subject_name', '')+' — '+record.get('school_year', ''))
    elif revision:
        r_left = foot.add_run("Trường Quốc tế Á Châu — Tài liệu lưu hành nội bộ")
    else:
        r_left = foot.add_run("Trường TH, THCS & THPT Quốc Tế Á Châu — Đề thi chính thức" if not answers else "Trường TH, THCS & THPT Quốc Tế Á Châu — Đáp án & Hướng dẫn chấm")
    r_left.italic = True
    r_left.font.size = Pt(9.5)
    r_left.font.color.rgb = RGBColor(100, 100, 100)

    foot.add_run("\t")
    r_pg = foot.add_run("Trang ")
    r_pg.italic = True
    r_pg.font.size = Pt(9.5)
    r_pg.font.color.rgb = RGBColor(100, 100, 100)

    fld1 = OxmlElement('w:fldSimple')
    fld1.set(qn('w:instr'), 'PAGE')
    foot._p.append(fld1)

    r_slash = foot.add_run('/')
    r_slash.italic = True
    r_slash.font.size = Pt(9.5)
    r_slash.font.color.rgb = RGBColor(100, 100, 100)

    fld2 = OxmlElement('w:fldSimple')
    fld2.set(qn('w:instr'), 'NUMPAGES')
    foot._p.append(fld2)

    _apply_school_page_rules(doc)
    stream = io.BytesIO(); doc.save(stream); return stream.getvalue()


def _times_new_roman_styles(doc, size):
    """Mọi kiểu chữ đoạn văn dùng Times New Roman cho cả chữ Latinh, Đông Á và phức hợp; bỏ font theo theme."""
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Pt
    for style in doc.styles:
        if style.type == 1:
            style.font.name = 'Times New Roman'
            style.font.size = Pt(size)
            rpr = style.element.get_or_add_rPr()
            fonts = rpr.find(qn('w:rFonts'))
            if fonts is None:
                fonts = OxmlElement('w:rFonts'); rpr.insert(0, fonts)
            for attr in list(fonts.attrib):
                if 'theme' in attr.lower():
                    del fonts.attrib[attr]
            color = rpr.find(qn('w:color'))
            if color is None:
                color = OxmlElement('w:color'); rpr.append(color)
            color.attrib.clear(); color.set(qn('w:val'), '000000')
            ppr = style.element.find(qn('w:pPr'))
            if ppr is not None:
                for border in list(ppr.findall(qn('w:pBdr'))):
                    ppr.remove(border)
            for attr in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
                fonts.set(qn('w:'+attr), 'Times New Roman')


def _docx_lms(record):
    try:
        from docx import Document
        from docx.shared import Cm, Pt, RGBColor
        from docx.enum.section import WD_ORIENT
    except ImportError:
        raise ServiceError('Không có thư viện python-docx.')

    doc = Document()
    _times_new_roman_styles(doc, 12)

    section = doc.sections[0]
    section.orientation = WD_ORIENT.PORTRAIT
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)

    # Empty header and footer - no lines, no instructions, no page numbers
    section.header.is_linked_to_previous = False
    for p in section.header.paragraphs:
        p.text = ''
    section.footer.is_linked_to_previous = False
    for p in section.footer.paragraphs:
        p.text = ''

    questions = record.get('questions', [])
    for i, q in enumerate(questions, 1):
        slot = q.get('slot_number', i)
        q_type = q.get('type', 'MC')
        q_text = str(q.get('question', '')).strip()

        if q_type == 'MC':
            p_q = doc.add_paragraph()
            p_q.paragraph_format.space_before = Pt(6)
            p_q.paragraph_format.space_after = Pt(2)
            p_q.paragraph_format.keep_with_next = True
            r_num = p_q.add_run(f'Câu {slot}. ')
            r_num.bold = True
            p_q.add_run(q_text)

            opts = q.get('options', [])
            corr_idx = q.get('correct')
            for oi, opt in enumerate(opts):
                p_opt = doc.add_paragraph()
                p_opt.paragraph_format.space_before = Pt(0)
                p_opt.paragraph_format.space_after = Pt(6 if oi == len(opts) - 1 else 2)
                p_opt.paragraph_format.keep_with_next = (oi < len(opts) - 1)
                letter = chr(65 + oi)
                if oi == corr_idx:
                    r_lbl = p_opt.add_run(f'[{letter}.] ')
                    r_lbl.bold = True
                else:
                    r_lbl = p_opt.add_run(f'{letter}. ')
                    r_lbl.bold = False
                p_opt.add_run(str(opt).strip())

        elif q_type == 'YN':
            p_q = doc.add_paragraph()
            p_q.paragraph_format.space_before = Pt(6)
            p_q.paragraph_format.space_after = Pt(2)
            p_q.paragraph_format.keep_with_next = True
            r_num = p_q.add_run(f'Câu {slot}. ')
            r_num.bold = True
            p_q.add_run(q_text)

            p_sub = doc.add_paragraph()
            p_sub.paragraph_format.space_before = Pt(0)
            p_sub.paragraph_format.space_after = Pt(2)
            p_sub.paragraph_format.keep_with_next = True
            p_sub.add_run('Xác định tính Đúng / Sai của các khẳng định sau:')

            stmts = q.get('statements', [])
            for si, st in enumerate(stmts):
                p_st = doc.add_paragraph()
                p_st.paragraph_format.space_before = Pt(0)
                p_st.paragraph_format.space_after = Pt(6 if si == len(stmts) - 1 else 2)
                p_st.paragraph_format.keep_with_next = (si < len(stmts) - 1)
                raw_lbl = st.get('label') or ('abcd'[si] + ')')
                letter_only = raw_lbl.strip().rstrip(').')
                lbl_str = f'{letter_only})'
                is_correct = bool(st.get('correct'))
                if is_correct:
                    r_lbl = p_st.add_run(f'[{lbl_str}] ')
                    r_lbl.bold = True
                else:
                    r_lbl = p_st.add_run(f'{lbl_str} ')
                    r_lbl.bold = False
                p_st.add_run(str(st.get('text', '')).strip() + '  ')
                r_tag = p_st.add_run('[ĐÚNG]' if is_correct else '[SAI]')
                r_tag.bold = True

        elif q_type == 'SHORT':
            p_q = doc.add_paragraph()
            p_q.paragraph_format.space_before = Pt(6)
            p_q.paragraph_format.space_after = Pt(2)
            r_num = p_q.add_run(f'Câu {slot}. ')
            r_num.bold = True
            p_q.add_run(q_text)
            # Rule 06: đáp án TLN dạng [Đáp án: …], in đậm, dòng riêng (giáo viên xác nhận 26/10/2026).
            p_ans = doc.add_paragraph()
            p_ans.paragraph_format.space_after = Pt(6)
            p_ans.add_run(f'[Đáp án: {canonical_short_answer(q)}]').bold = True
        elif q_type == 'ES':
            p_q = doc.add_paragraph()
            p_q.paragraph_format.space_before = Pt(6)
            p_q.paragraph_format.space_after = Pt(6)
            r_num = p_q.add_run(f'Câu {slot}. ')
            r_num.bold = True
            p_q.add_run(q_text)

    _apply_school_page_rules(doc)
    stream = io.BytesIO()
    doc.save(stream)
    return stream.getvalue()


def _html_lms(record):
    body = []
    questions = record.get('questions', [])
    for i, q in enumerate(questions, 1):
        slot = q.get('slot_number', i)
        q_type = q.get('type', 'MC')
        q_text = escape(str(q.get('question', '')).strip(), quote=True)

        if q_type == 'MC':
            body.append(f'<p><strong>Câu {slot}.</strong> {q_text}</p>')
            opts = q.get('options', [])
            corr_idx = q.get('correct')
            for oi, opt in enumerate(opts):
                letter = chr(65 + oi)
                opt_str = escape(str(opt).strip(), quote=True)
                if oi == corr_idx:
                    body.append(f'<p><strong>[{letter}.]</strong> {opt_str}</p>')
                else:
                    body.append(f'<p>{letter}. {opt_str}</p>')
        elif q_type == 'YN':
            body.append(f'<p><strong>Câu {slot}.</strong> {q_text}</p>')
            body.append('<p>Xác định tính Đúng / Sai của các khẳng định sau:</p>')
            stmts = q.get('statements', [])
            for si, st in enumerate(stmts):
                raw_lbl = st.get('label') or ('abcd'[si] + ')')
                letter_only = raw_lbl.strip().rstrip(').')
                lbl_str = f'{letter_only})'
                is_correct = bool(st.get('correct'))
                st_text = escape(str(st.get('text', '')).strip(), quote=True)
                tag = '<strong>[ĐÚNG]</strong>' if is_correct else '<strong>[SAI]</strong>'
                if is_correct:
                    body.append(f'<p><strong>[{lbl_str}]</strong> {st_text}  {tag}</p>')
                else:
                    body.append(f'<p>{lbl_str} {st_text}  {tag}</p>')
        elif q_type == 'SHORT':
            body.append(f'<p><strong>Câu {slot}.</strong> {q_text}</p>')
            body.append(f'<p><strong>[Đáp án: {escape(canonical_short_answer(q), quote=True)}]</strong></p>')
        elif q_type == 'ES':
            body.append(f'<p><strong>Câu {slot}.</strong> {q_text}</p>')

    return ('<!doctype html><html lang="vi"><meta charset="utf-8">'
            '<title>Học liệu LMS</title><style>body{font-family:"Times New Roman",serif;font-size:12pt;max-width:21cm;margin:2cm auto;line-height:1.35;color:#000}p{margin:3px 0}</style><body>'
            + ''.join(body) + '</body></html>').encode('utf-8')


def export_document(record, fmt='docx', answers=False, revision=False, target=''):
    if target == 'lms' or fmt == 'lms':
        stem = 'lms_' + ('de_cuong' if revision else 'de_kiem_tra') + f'_tin_{record.get("grade", "")}'
        if not revision and record.get('exam_code'):
            stem += f'_{record.get("exam_code")}'
        if fmt == 'html':
            return _html_lms(record), 'text/html; charset=utf-8', stem + '.html'
        return _docx_lms(record), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', stem + '.docx'

    if fmt not in ('docx','html','json','tex','pdf') or (revision and fmt=='json'):
        raise ServiceError('Định dạng xuất chưa được hỗ trợ.')
    stem=('de_cuong' if revision else 'de_kiem_tra')+('_giao_vien' if answers else '_hoc_sinh')
    if fmt=='pdf':
        # PDF chuyển từ chính tệp Word để hai bản giống hệt nhau (giáo viên chọn 26/10/2026).
        import pdf_build
        return pdf_build.docx_to_pdf(_docx(record,answers,revision)), 'application/pdf', stem+'.pdf'
    if fmt=='tex':
        from latex_generator import generate_exam_latex, generate_review_latex
        tex_content = generate_review_latex(record) if revision else generate_exam_latex(record, answers=answers)
        return tex_content.encode('utf-8'), 'application/x-tex; charset=utf-8', stem+'.tex'
    if fmt=='json':
        value=record if answers else public_record(record)
        return json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False).encode(),'application/json; charset=utf-8',stem+'.json'
    if fmt=='html':return _html(record,answers,revision),'text/html; charset=utf-8',stem+'.html'
    return _docx(record,answers,revision),'application/vnd.openxmlformats-officedocument.wordprocessingml.document',stem+'.docx'


def _answer_grid_table(doc, title, rows, codes):
    """Một bảng đáp án: mỗi dòng một câu, mỗi cột một mã đề."""
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml import OxmlElement
    p_sec = doc.add_paragraph()
    p_sec.paragraph_format.space_before = Pt(8); p_sec.paragraph_format.space_after = Pt(4)
    r = p_sec.add_run(title)
    r.bold = True; r.font.size = Pt(11.5)
    tbl = doc.add_table(rows=1 + len(rows), cols=1 + len(codes))
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER; tbl.autofit = False
    _set_table_borders(tbl, val='single', sz='4', color='B0C0D0')
    for ci, text in enumerate(['Câu'] + [f'Mã {code}' for code in codes]):
        cell = tbl.rows[0].cells[ci]
        cell.text = text; _set_cell_bg(cell, 'EBF0FA')
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        if cell.paragraphs[0].runs: cell.paragraphs[0].runs[0].bold = True
    tbl.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
    slots = sorted(rows.keys(), key=lambda x: int(x) if str(x).isdigit() else 999)
    for ri, slot in enumerate(slots, 1):
        cells = tbl.rows[ri].cells
        cells[0].text = f'{slot}'
        cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        if cells[0].paragraphs[0].runs: cells[0].paragraphs[0].runs[0].bold = True
        for ci, code in enumerate(codes, 1):
            cells[ci].text = str(rows[slot].get(code, '-'))
            cells[ci].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER


def export_mapping_docx(rows, codes, meta=None, problems=None):
    """B7: bảng đối chiếu mã đề — mỗi mã đề một bảng: vị trí, câu gốc, mã câu, đáp án sau hoán vị, điểm."""
    from docx import Document
    from docx.enum.section import WD_ORIENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.shared import Cm, Pt
    doc = Document()
    _times_new_roman_styles(doc, 11)
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = Cm(29.7), Cm(21.0)
    for side in ('left_margin', 'right_margin'):
        setattr(section, side, Cm(2.0))
    section.top_margin = section.bottom_margin = Cm(1.0)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('BẢNG ĐỐI CHIẾU MÃ ĐỀ VỚI ĐỀ GỐC'); r.bold = True; r.font.size = Pt(14)
    if meta:
        p2 = doc.add_paragraph(); p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p2.add_run(f"{meta.get('title', '')} — Khối {meta.get('grade', '')}").italic = True
    p3 = doc.add_paragraph()
    p3.add_run('Kết quả tự kiểm tra: ' + ('mọi mã đề giữ đúng bộ câu, điểm và đáp án của đề gốc.' if not problems
                                          else f'{len(problems)} lỗi — ' + '; '.join(problems))).bold = True
    kinds = {'MC': 'Nhiều lựa chọn', 'YN': 'Đúng/Sai', 'SHORT': 'Trả lời ngắn', 'ES': 'Tự luận'}
    headers = ['Phần', 'Câu trong mã đề', 'Câu gốc', 'Mã câu hỏi', 'Đáp án mã đề', 'Đáp án đề gốc', 'Điểm']
    widths = [3.2, 2.6, 2.2, 4.0, 5.2, 5.2, 1.6]  # tổng 24 cm (rules/03: bảng ≤ 24 cm)
    for code in codes:
        h = doc.add_paragraph(); h.paragraph_format.space_before = Pt(8)
        hr = h.add_run(f'Mã đề {code}'); hr.bold = True
        table = doc.add_table(rows=1, cols=len(headers)); table.style = 'Table Grid'
        for cell, text, w in zip(table.rows[0].cells, headers, widths):
            cell.text = text; cell.width = Cm(w)
            cell.paragraphs[0].runs[0].bold = True
        table.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
        for row in [r for r in rows if r['code'] == code]:
            cells = table.add_row().cells
            values = [kinds.get(row['kind'], row['kind']), str(row['slot']), str(row['source_slot'] or ''),
                      str(row['question_id']), row['answer'], row['source_answer'], row['points'].replace('.', ',')]
            for cell, text, w in zip(cells, values, widths):
                cell.text = text; cell.width = Cm(w)
    _apply_school_page_rules(doc)
    stream = io.BytesIO(); doc.save(stream); return stream.getvalue()


def export_answer_grid_docx(answer_grid: dict, title: str = "BẢNG ĐÁP ÁN TỔNG HỢP CÁC MÃ ĐỀ", meta: dict = None) -> bytes:
    try:
        from docx import Document
        from docx.shared import Cm, Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.enum.table import WD_TABLE_ALIGNMENT
        from docx.oxml import OxmlElement
        from docx.oxml.ns import qn
    except ImportError as exc:
        raise ServiceError('Chưa tìm thấy python-docx.', status=409) from exc

    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Cm(21); sec.page_height = Cm(29.7)
    sec.top_margin = Cm(2.0); sec.bottom_margin = Cm(2.0)
    sec.left_margin = Cm(2.5); sec.right_margin = Cm(2.0)

    for style in doc.styles:
        if style.type == 1:
            style.font.name = 'Times New Roman'
            rpr = style.element.get_or_add_rPr()
            fonts = rpr.find(qn('w:rFonts'))
            if fonts is None:
                fonts = OxmlElement('w:rFonts'); rpr.insert(0, fonts)
            for attr in list(fonts.attrib):
                if 'theme' in attr.lower(): del fonts.attrib[attr]
            for attr in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
                fonts.set(qn('w:'+attr), 'Times New Roman')

    p_hdr = doc.add_paragraph()
    p_hdr.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if (meta or {}).get('school_profile', True):
        r_h = p_hdr.add_run("TRƯỜNG TH, THCS VÀ THPT QUỐC TẾ Á CHÂU\n")
        r_h.bold = True; r_h.font.size = Pt(11)
    r_t = p_hdr.add_run(title.upper() + "\n")
    r_t.bold = True; r_t.font.size = Pt(13); r_t.font.color.rgb = RGBColor(180, 20, 20)
    if meta:
        subj = str(meta.get('subject_name', 'TIN HỌC')).upper()
        grd = meta.get('grade', '')
        s_yr = meta.get('school_year', '2026 - 2027')
        r_sub = p_hdr.add_run(f"MÔN: {subj} {grd} — NĂM HỌC {s_yr}")
        r_sub.bold = True; r_sub.font.size = Pt(10.5)

    codes = answer_grid.get('codes', [])
    sections = [(key, title) for key, title in (
        ('mc', 'BẢNG ĐÁP ÁN TRẮC NGHIỆM NHIỀU LỰA CHỌN'),
        ('yn', 'BẢNG ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI'),
        ('short', 'BẢNG ĐÁP ÁN TRẢ LỜI NGẮN'),
    ) if answer_grid.get(key) and codes]
    for index, (key, title) in enumerate(sections):
        _answer_grid_table(doc, f'{ROMAN[index]}. {title}', answer_grid[key], codes)

    # Grid widths and cell widths must both fit the actual printable area.
    available = sec.page_width-sec.left_margin-sec.right_margin
    for table in doc.tables:
        first = Cm(1.4)
        widths = [first]+[(available-first)//(len(table.columns)-1)]*(len(table.columns)-1)
        for col, width in zip(table.columns, widths): col.width = width
        for row in table.rows:
            for cell, width in zip(row.cells, widths):
                cell.width = width
                for paragraph in cell.paragraphs:
                    paragraph.paragraph_format.space_after = Pt(2)
                    paragraph.paragraph_format.line_spacing = 1
    _apply_school_page_rules(doc)
    bio = io.BytesIO()
    doc.save(bio)
    return bio.getvalue()
