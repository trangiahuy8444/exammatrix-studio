"""LaTeX generator: High-precision XeLaTeX source generation for Exams, Answer Keys, Matrices & Review Guides.
Standardized according to Asian School & MOET guidelines.
"""
from __future__ import annotations
import re
from decimal import Decimal


def point_label(value):
    if isinstance(value, (int, float, Decimal)):
        val_float = float(value)
        return f"{val_float:g}".replace('.', ',')
    return str(value)


TEX_SPECIALS = {'\\': r'\textbackslash{}', '{': r'\{', '}': r'\}', '&': r'\&', '%': r'\%', '_': r'\_',
                '#': r'\#', '$': r'\$', '~': r'\textasciitilde{}', '^': r'\textasciicircum{}'}
# Chỉ các thẻ định dạng đã biết được hiểu là HTML; "a < b > c" hay "vector<int>" giữ nguyên.
HTML_TAG = re.compile(r'<(/?)(b|strong|i|em|u|br)\s*/?>'
                      r'|<(/?)(p|span|div)(?:\s+[a-zA-Z-]+="[^"]*")*\s*>', re.IGNORECASE)
_BOLD, _ITALIC, _CLOSE, _NEWLINE = '\x01', '\x02', '\x03', '\x04'


def _html_to_markers(s: str) -> str:
    """Thẻ định dạng → ký hiệu tạm; thẻ đóng không có thẻ mở tương ứng bị bỏ, thẻ mở thiếu đóng được đóng ở cuối."""
    out, stack, pos = [], [], 0
    for m in HTML_TAG.finditer(s):
        out.append(s[pos:m.start()]); pos = m.end()
        closing = (m.group(1) or m.group(3)) == '/'
        tag = (m.group(2) or m.group(4)).lower()
        if tag in ('br', 'p', 'div'):
            if tag == 'br' or closing:
                out.append(_NEWLINE)
            continue
        kind = {'b': _BOLD, 'strong': _BOLD, 'i': _ITALIC, 'em': _ITALIC}.get(tag)
        if kind is None:
            continue  # u, span: bỏ thẻ, giữ chữ
        if not closing:
            out.append(kind); stack.append(kind)
        elif kind in stack:
            while stack:
                top = stack.pop(); out.append(_CLOSE)
                if top == kind:
                    break
    out.append(s[pos:])
    out.extend(_CLOSE for _ in stack)
    return ''.join(out)


def tex_escape(text: str) -> str:
    """Escape văn bản cho XeLaTeX, giữ nguyên công thức $...$ / $$...$$ và không làm mất nội dung."""
    if not text:
        return ""
    s = str(text).replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    s = _html_to_markers(s)
    tokens = re.split(r'(\$\$[^\$]+\$\$|\$[^\$]+\$)', s)
    out = []
    for token in tokens:
        if len(token) > 1 and token.startswith('$') and token.endswith('$'):
            out.append(token.replace(_BOLD, '').replace(_ITALIC, '').replace(_CLOSE, '').replace(_NEWLINE, ' '))
            continue
        t = re.sub(r"\([BHV],\s*[^)]+\)\s*", "", token)
        t = re.sub(r'[\\{}&%_#$~^]', lambda m: TEX_SPECIALS[m.group()], t)
        t = t.replace(_BOLD, r'\textbf{').replace(_ITALIC, r'\textit{').replace(_CLOSE, '}').replace(_NEWLINE, '\n')
        subs = str.maketrans('₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎', '0123456789+-=()')
        supers = str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹', '0123456789')
        t = re.sub('[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]+', lambda m: '$_{'+m[0].translate(subs)+'}$', t)
        t = re.sub('[⁰¹²³⁴⁵⁶⁷⁸⁹]+', lambda m: '$^{'+m[0].translate(supers)+'}$', t)
        out.append(t)
    return "".join(out)


def _format_exam_term(exam_type: str) -> str:
    """Kỳ kiểm tra theo cách ghi của mẫu đề đã duyệt: "GIỮA HỌC KÌ 1"."""
    mapping = {
        'GK1': 'GIỮA HỌC KÌ 1',
        'CK1': 'CUỐI HỌC KÌ 1',
        'GK2': 'GIỮA HỌC KÌ 2',
        'CK2': 'CUỐI HỌC KÌ 2'
    }
    value = str(exam_type or 'GK1').strip().upper()
    if value.startswith('TX'):
        return 'THƯỜNG XUYÊN'
    return mapping.get(value, value)


def exam_heading(exam_type: str) -> str:
    """Dòng tiêu đề đề thi, ví dụ "ĐỀ KIỂM TRA ĐỊNH KÌ GIỮA HỌC KÌ 1" (mẫu GK1 2026–2027)."""
    if str(exam_type or '').strip().upper().startswith('TX'):
        return 'ĐỀ KIỂM TRA THƯỜNG XUYÊN'
    return f'ĐỀ KIỂM TRA ĐỊNH KÌ {_format_exam_term(exam_type)}'


def _clean_q_text(text: str) -> str:
    t = re.sub(r'^\s*Câu\s+\d+[\s\.:\)]*', '', text, flags=re.IGNORECASE)
    return t.strip()


LATEX_PORTRAIT_PREAMBLE = r"""\documentclass[11pt,a4paper]{article}
\usepackage{fontspec}
\setmainfont{Times New Roman}
\usepackage[top=1.0cm, bottom=1.0cm, left=2.5cm, right=2.0cm, headheight=0.4cm, headsep=0.2cm,footskip=0.5cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{tabularx,array,longtable,multirow,colortbl,booktabs,enumitem,fancyhdr,lastpage,xcolor,graphicx}
\usepackage{needspace}
\setlength{\parindent}{0pt}

\definecolor{headerred}{RGB}{180, 20, 20}
\definecolor{tableheader}{RGB}{235, 240, 250}

\pagestyle{fancy}
\fancyhf{}
\lfoot{\textit{Trường TH, THCS \& THPT Quốc Tế Á Châu}}
\rfoot{\textit{Trang \thepage/\pageref{LastPage}}}
\renewcommand{\headrulewidth}{0pt}

\newcommand{\fourchoices}[4]{%
  \par\noindent\hspace*{0.5cm}%
  \makebox[0.24\dimexpr\textwidth-0.5cm\relax][l]{\textbf{A.} #1}%
  \makebox[0.24\dimexpr\textwidth-0.5cm\relax][l]{\textbf{B.} #2}%
  \makebox[0.24\dimexpr\textwidth-0.5cm\relax][l]{\textbf{C.} #3}%
  \makebox[0.24\dimexpr\textwidth-0.5cm\relax][l]{\textbf{D.} #4}\par\vspace{2.5pt}%
}

\newcommand{\twochoices}[4]{%
  \par\noindent\hspace*{0.5cm}%
  \makebox[0.48\dimexpr\textwidth-0.5cm\relax][l]{\textbf{A.} #1}%
  \makebox[0.48\dimexpr\textwidth-0.5cm\relax][l]{\textbf{B.} #2}\par\vspace{2pt}%
  \noindent\hspace*{0.5cm}%
  \makebox[0.48\dimexpr\textwidth-0.5cm\relax][l]{\textbf{C.} #3}%
  \makebox[0.48\dimexpr\textwidth-0.5cm\relax][l]{\textbf{D.} #4}\par\vspace{2.5pt}%
}

\newcommand{\onechoice}[4]{%
  \par
  {\hangindent=1.1cm\hangafter=1\noindent\hspace*{0.5cm}\textbf{A.} #1\par\vspace{2pt}}%
  {\hangindent=1.1cm\hangafter=1\noindent\hspace*{0.5cm}\textbf{B.} #2\par\vspace{2pt}}%
  {\hangindent=1.1cm\hangafter=1\noindent\hspace*{0.5cm}\textbf{C.} #3\par\vspace{2pt}}%
  {\hangindent=1.1cm\hangafter=1\noindent\hspace*{0.5cm}\textbf{D.} #4\par\vspace{3pt}}%
}

\newlength{\choiceawidth}\newlength{\choicebwidth}\newlength{\choicecwidth}\newlength{\choicedwidth}\newlength{\maxchoicewidth}
\newcommand{\choices}[4]{%
  \settowidth{\choiceawidth}{\textbf{A.} #1}%
  \settowidth{\choicebwidth}{\textbf{B.} #2}%
  \settowidth{\choicecwidth}{\textbf{C.} #3}%
  \settowidth{\choicedwidth}{\textbf{D.} #4}%
  \setlength{\maxchoicewidth}{\choiceawidth}%
  \ifdim\choicebwidth>\maxchoicewidth \setlength{\maxchoicewidth}{\choicebwidth}\fi
  \ifdim\choicecwidth>\maxchoicewidth \setlength{\maxchoicewidth}{\choicecwidth}\fi
  \ifdim\choicedwidth>\maxchoicewidth \setlength{\maxchoicewidth}{\choicedwidth}\fi
  \ifdim\maxchoicewidth<0.22\textwidth
    \fourchoices{#1}{#2}{#3}{#4}%
  \else
    \ifdim\maxchoicewidth<0.46\textwidth
      \twochoices{#1}{#2}{#3}{#4}%
    \else
      \onechoice{#1}{#2}{#3}{#4}%
    \fi
  \fi
}
"""

LATEX_LANDSCAPE_PREAMBLE = r"""\documentclass[11pt,a4paper]{article}
\usepackage{fontspec}
\setmainfont{Times New Roman}
\usepackage[a4paper,landscape,top=1.0cm,bottom=1.0cm,left=1.2cm,right=1.2cm,footskip=0.5cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{tabularx,array,multirow,multicol,booktabs}
\usepackage{longtable}
\usepackage{fancyhdr}
\usepackage{lastpage}
\usepackage{xcolor,colortbl}

\definecolor{tableheader}{RGB}{235, 240, 250}

\pagestyle{fancy}
\fancyhf{}
\rfoot{\textit{Trang \thepage/\pageref{LastPage}}}
\renewcommand{\headrulewidth}{0pt}
"""


def generate_exam_latex(record: dict, answers: bool = False, exam_code: str | None = None) -> str:
    """Generates standardized XeLaTeX source code for Student Exam or Teacher Answer & Marking Guide."""
    grade = record.get('grade', 10)
    subject = str(record.get('subject_name') or 'TIN HỌC').upper()
    school_year = str(record.get('school_year') or '2026 - 2027')
    term = _format_exam_term(record.get('exam_type', 'GK1'))
    duration = record.get('duration', 45)
    code = exam_code or record.get('exam_code', '')
    title = str(record.get('title') or 'ĐỀ KIỂM TRA ĐỊNH KÌ').upper()

    questions = record.get('questions', [])
    mc_questions = [q for q in questions if q.get('type') == 'MC']
    yn_questions = [q for q in questions if q.get('type') == 'YN']
    short_questions = [q for q in questions if q.get('type') == 'SHORT']
    es_questions = [q for q in questions if q.get('type') == 'ES']

    total_points = record.get('total_points', 10)
    mc_pts = sum(q.get('points', 0.25) for q in mc_questions)
    yn_pts = sum(q.get('points', 1.0) for q in yn_questions)
    short_pts = sum(q.get('points', 0.5) for q in short_questions)
    es_pts = sum(q.get('points', 1.0) for q in es_questions)

    parts = [LATEX_PORTRAIT_PREAMBLE, r"\begin{document}"]

    if answers:
        from latex_layout import answers as answer_layout
        return answer_layout(record, code)

    # STUDENT EXAM
    code_str = r"\\\textbf{(MÃ ĐỀ: " + tex_escape(code) + ")}" if code else ""
    header_tex = r"""
\noindent
\begin{minipage}[t]{0.48\textwidth}
\centering
{\fontsize{10pt}{12pt}\selectfont \textbf{SỞ GIÁO DỤC VÀ ĐÀO TẠO}\\\textbf{THÀNH PHỐ HỒ CHÍ MINH}\\\textbf{TRƯỜNG TH, THCS VÀ THPT}\\\textbf{QUỐC TẾ Á CHÂU}\\\textbf{ĐỀ CHÍNH THỨC}__CODE__}
\end{minipage}
\hfill
\begin{minipage}[t]{0.48\textwidth}
\centering
{\fontsize{10.5pt}{12.5pt}\selectfont \textbf{__HEADING__}\\\textbf{NĂM HỌC __YEAR__}\\\textit{(Đề thi có \pageref{LastPage} trang)}}
\end{minipage}

\vspace{0.2cm}
\begin{center}
  {\fontsize{12pt}{14pt}\selectfont\textbf{MÔN: __SUBJECT__ -- KHỐI __GRADE__}}\\[2pt]
  {\fontsize{10pt}{12pt}\selectfont\textit{(Thời gian làm bài: __DURATION__ phút, không tính thời gian phát đề)}}
\end{center}

\vspace{0.15cm}
\noindent\begin{tabularx}{\textwidth}{|X|}
\hline
\rowcolor{tableheader}
Họ và tên học sinh: \dotfill Lớp: \dots\dots\dots\dots\dots   SBD: \dots\dots\dots\dots\\
\hline
\end{tabularx}

\vspace{0.12cm}
\begin{center}
  \textit{(Học sinh lưu ý làm bài trên giấy kiểm tra, không làm trực tiếp vào đề)}
\end{center}
\vspace{0.2cm}
""".replace('__HEADING__', tex_escape(exam_heading(record.get('exam_type', 'GK1')))) \
   .replace('__TERM__', tex_escape(term)) \
   .replace('__YEAR__', tex_escape(school_year)) \
   .replace('__CODE__', code_str) \
   .replace('__SUBJECT__', tex_escape(subject)) \
   .replace('__GRADE__', str(grade)) \
   .replace('__DURATION__', str(duration))

    parts.append(header_tex)

    # PART I: TRẮC NGHIỆM
    if mc_questions:
        pts_label = f" ({point_label(mc_pts)} ĐIỂM -- gồm {len(mc_questions)} câu, mỗi câu {point_label(mc_pts/len(mc_questions))} điểm)"
        parts.append(f"\\noindent\\textbf{{\\large PHẦN I. TRẮC NGHIỆM KHÁCH QUAN{pts_label}}}\n\\vspace{{0.2cm}}\n")
        for q in mc_questions:
            slot = q.get('slot_number', '')
            q_text = tex_escape(_clean_q_text(q.get('question', '')))
            opts = q.get('options', ['', '', '', ''])
            while len(opts) < 4:
                opts.append('')
            o1, o2, o3, o4 = [tex_escape(str(o)) for o in opts[:4]]
            parts.append(f"""\\needspace{{6\\baselineskip}}\\noindent\\textbf{{Câu {slot}.}} {q_text}
\\choices{{{o1}}}{{{o2}}}{{{o3}}}{{{o4}}}
""")

    # PART II: TRẮC NGHIỆM ĐÚNG/SAI
    if yn_questions:
        pts_label = f" ({point_label(yn_pts)} ĐIỂM -- gồm {len(yn_questions)} câu)"
        parts.append(f"""\\vspace{{0.3cm}}
\\noindent\\textbf{{\\large PHẦN II. TRẮC NGHIỆM ĐÚNG / SAI{pts_label}}}
\\vspace{{0.1cm}}
\\noindent\\textit{{Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.}}
\\vspace{{0.2cm}}
""")
        for q in yn_questions:
            slot = q.get('slot_number', '')
            q_text = tex_escape(_clean_q_text(q.get('question', '')))
            stmts = q.get('statements', [])
            parts.append(f"\\needspace{{8\\baselineskip}}\\noindent\\textbf{{Câu {slot}.}} {q_text}\n\\begin{{enumerate}}[label=\\alph*), itemsep=1pt, topsep=2pt, leftmargin=0.8cm]\n")
            for st in stmts:
                parts.append(f"  \\item {tex_escape(st.get('text', ''))}\n")
            parts.append("\\end{enumerate}\n\\vspace{0.15cm}\n")

    # PART III: TRẢ LỜI NGẮN
    if short_questions:
        pts_label = f" ({point_label(short_pts)} ĐIỂM -- gồm {len(short_questions)} câu)"
        parts.append(f"""\\vspace{{0.3cm}}
\\noindent\\textbf{{\\large PHẦN III. TRẢ LỜI NGẮN{pts_label}}}
\\vspace{{0.2cm}}
""")
        for q in short_questions:
            slot = q.get('slot_number', '')
            q_text = tex_escape(_clean_q_text(q.get('question', '')))
            parts.append(f"\\needspace{{4\\baselineskip}}\\noindent\\textbf{{Câu {slot}.}} {q_text}\n\\vspace{{0.2cm}}\n")

    # PART IV: TỰ LUẬN
    if es_questions:
        pts_label = f" ({point_label(es_pts)} ĐIỂM -- gồm {len(es_questions)} câu)"
        parts.append(f"""\\vspace{{0.3cm}}
\\noindent\\textbf{{\\large PHẦN IV. TỰ LUẬN{pts_label}}}
\\vspace{{0.2cm}}
""")
        for q in es_questions:
            slot = q.get('slot_number', '')
            pts = point_label(q.get('points', 1.0))
            q_text = tex_escape(_clean_q_text(q.get('question', '')))
            parts.append(f"\\needspace{{4\\baselineskip}}\\noindent\\textbf{{Câu {slot} ({pts} điểm):}} {q_text}\n\\vspace{{0.25cm}}\n")

    parts.append(r"""\vspace{0.4cm}
\begin{center}
  \textbf{--- HẾT ---}\\
  \textit{Học sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm.}
\end{center}
""")

    parts.append(r"\end{document}")
    tex = "\n".join(parts)
    if not record.get('school_profile', True):
        tex = re.sub(r'\\begin\{minipage\}\[t\]\{0\.48\\textwidth\}.*?\\end\{minipage\}\s*\\hfill', '', tex, count=1, flags=re.S)
        tex = tex.replace(r'\begin{minipage}[t]{0.48\textwidth}', r'\begin{minipage}[t]{\textwidth}')
        tex = tex.replace(r'\lfoot{\textit{Trường TH, THCS \& THPT Quốc Tế Á Châu}}', r'\lfoot{}')
    return tex


def generate_review_latex(record: dict) -> str:
    from latex_layout import review
    return review(record)


def generate_matrix_latex(matrix: dict, catalog: dict | None = None) -> str:
    """Generates standardized XeLaTeX source code for Matrix & Specification tables in Landscape format."""
    if 'slots' in matrix and 'requirements' in matrix:
        from latex_layout import matrix as matrix_layout
        return matrix_layout(matrix)
    grade = matrix.get('grade', 10)
    subject = str(matrix.get('subject_name') or 'TIN HỌC').upper()
    duration = matrix.get('duration', 45)
    term = _format_exam_term(matrix.get('exam_type', 'GK1'))

    parts = [LATEX_LANDSCAPE_PREAMBLE, r"\begin{document}"]

    matrix_heading = r"""
\begin{center}
  {\fontsize{13pt}{15pt}\selectfont\textbf{KHUNG MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ -- __TERM__}}\\[3pt]
  {\fontsize{12pt}{14pt}\selectfont\textbf{MÔN: __SUBJECT__ __GRADE__ - THỜI GIAN: __DURATION__ PHÚT}}
\end{center}

\vspace{0.15cm}
\begin{center}
\fontsize{8.5pt}{10.8pt}\selectfont
\renewcommand{\arraystretch}{1.15}
\setlength{\tabcolsep}{2pt}
\begin{tabularx}{\linewidth}{|>{\centering\arraybackslash}m{0.6cm}|>{\centering\arraybackslash}m{3.6cm}|X|*{9}{>{\centering\arraybackslash}m{1.05cm}|}*{3}{>{\centering\arraybackslash}m{0.9cm}|}>{\centering\arraybackslash}m{1.5cm}|}
\hline
\rowcolor{tableheader}
\multirow{3}{*}{\textbf{TT}} & \multicolumn{1}{c|}{\multirow{3}{*}{\textbf{Chương/ chủ đề}}} & \multicolumn{1}{c|}{\multirow{3}{*}{\textbf{Nội dung/đơn vị kiến thức}}} & \multicolumn{9}{c|}{\textbf{Mức độ đánh giá}} & \multicolumn{3}{c|}{\textbf{Tổng}} & \multirow{3}{*}{\textbf{\shortstack{Tỉ lệ\\\% điểm}}} \\
\cline{4-15}
\rowcolor{tableheader}
& & & \multicolumn{3}{c|}{\textbf{TNKQ-NLC}} & \multicolumn{3}{c|}{\textbf{TNKQ-ĐS}} & \multicolumn{3}{c|}{\textbf{Tự luận}} & \multirow{2}{*}{\textbf{Biết}} & \multirow{2}{*}{\textbf{Hiểu}} & \multirow{2}{*}{\textbf{VD}} & \\
\cline{4-12}
\rowcolor{tableheader}
& & & \textbf{Biết} & \textbf{Hiểu} & \textbf{VD} & \textbf{Biết} & \textbf{Hiểu} & \textbf{VD} & \textbf{Biết} & \textbf{Hiểu} & \textbf{VD} & & & & \\
\hline
""".replace('__TERM__', tex_escape(term)) \
   .replace('__SUBJECT__', tex_escape(subject)) \
   .replace('__GRADE__', str(grade)) \
   .replace('__DURATION__', str(duration))

    parts.append(matrix_heading)

    lessons = matrix.get('lessons', [])
    for idx, les in enumerate(lessons, 1):
        topic_txt = tex_escape(les.get('topic') or les.get('spec_topic', ''))
        title_txt = tex_escape(les.get('title') or les.get('spec_title', ''))
        c_mc_b = les.get('mc_b', '')
        c_mc_h = les.get('mc_h', '')
        c_mc_v = les.get('mc_v', '')
        c_yn_b = les.get('yn_b', '')
        c_yn_h = les.get('yn_h', '')
        c_yn_v = les.get('yn_v', '')
        c_es_b = les.get('es_b', '')
        c_es_h = les.get('es_h', '')
        c_es_v = les.get('es_v', '')
        tot_b = les.get('tot_b', '')
        tot_h = les.get('tot_h', '')
        tot_v = les.get('tot_v', '')
        pct = les.get('pct', '')
        parts.append(f"{idx} & {topic_txt} & {title_txt} & {c_mc_b} & {c_mc_h} & {c_mc_v} & {c_yn_b} & {c_yn_h} & {c_yn_v} & {c_es_b} & {c_es_h} & {c_es_v} & {tot_b} & {tot_h} & {tot_v} & {pct} \\\\\n\\hline\n")

    parts.append(r"""\end{tabularx}
\end{center}

\newpage
% 2. BẢNG ĐẶC TẢ ĐỀ KIỂM TRA
\begin{center}
  {\fontsize{13pt}{15pt}\selectfont\textbf{BẢNG ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ -- __TERM__}}\\[3pt]
  {\fontsize{11pt}{13pt}\selectfont\textbf{MÔN: __SUBJECT__ __GRADE__ - THỜI GIAN LÀM BÀI: __DURATION__ PHÚT}}
\end{center}

\vspace{0.1cm}
\noindent\fontsize{8.5pt}{10.5pt}\selectfont\textit{\textbf{Lưu ý:}} Ở mức độ nhận biết và thông hiểu thì có thể ra câu hỏi ở một chỉ báo của mức độ kiến thức, kĩ năng cần kiểm tra, đánh giá tương ứng. Ở mức độ vận dụng có thể xây dựng câu hỏi vào một trong các đơn vị kiến thức.

\vspace{0.12cm}
\begin{center}
\fontsize{8.5pt}{10.5pt}\selectfont
\renewcommand{\arraystretch}{1.1}
\setlength{\tabcolsep}{2.5pt}
\begin{tabularx}{\linewidth}{|>{\centering\arraybackslash}m{0.5cm}|>{\centering\arraybackslash}m{2.5cm}|m{3.2cm}|X|>{\centering\arraybackslash}m{2.2cm}|>{\centering\arraybackslash}m{2.2cm}|>{\centering\arraybackslash}m{1.4cm}|>{\centering\arraybackslash}m{1.8cm}|}
\hline
\rowcolor{tableheader}
\multirow{3}{*}{\textbf{TT}} & \multicolumn{1}{c|}{\multirow{3}{*}{\textbf{\shortstack{Chương/\\chủ đề}}}} & \multicolumn{1}{c|}{\multirow{3}{*}{\textbf{\shortstack{Nội dung/\\đơn vị kiến thức}}}} & \multicolumn{1}{c|}{\multirow{3}{*}{\textbf{Yêu cầu cần đạt}}} & \multicolumn{4}{c|}{\textbf{Mức độ đánh giá}} \\
\cline{5-8}
\rowcolor{tableheader}
& & & & \multicolumn{3}{c|}{\textbf{Trắc nghiệm khách quan}} & \multirow{2}{*}{\textbf{\shortstack{Thực hành/\\Tự luận}}} \\
\cline{5-7}
\rowcolor{tableheader}
& & & & \textbf{MC (4-1)} & \textbf{YN (4-4)} & \textbf{\shortstack{Short\\Answer}} & \\
\hline
""".replace('__TERM__', tex_escape(term)) \
   .replace('__SUBJECT__', tex_escape(subject)) \
   .replace('__GRADE__', str(grade)) \
   .replace('__DURATION__', str(duration)))

    for idx, les in enumerate(lessons, 1):
        topic_txt = tex_escape(les.get('topic') or les.get('spec_topic', ''))
        title_txt = tex_escape(les.get('title') or les.get('spec_title', ''))
        outcomes = les.get('outcomes', [])
        outcome_lines = []
        for oc in outcomes:
            oc_text = tex_escape(oc.get('text', ''))
            refs = oc.get('refs', [])
            if refs:
                ref_str = ", ".join([f"Câu {r}" for r in refs])
                outcome_lines.append(f"-- {oc_text} ({ref_str}).")
            else:
                outcome_lines.append(f"-- {oc_text}.")
        outcomes_formatted = r"\newline ".join(outcome_lines) if outcome_lines else "Nắm vững yêu cầu cần đạt theo chương trình."

        mc_spec = tex_escape(les.get('mc_spec', '0'))
        yn_spec = tex_escape(les.get('yn_spec', '0'))
        short_spec = tex_escape(les.get('short_spec', '0'))
        es_spec = tex_escape(les.get('es_spec', '0'))
        parts.append(f"{idx} & {topic_txt} & {title_txt} & {outcomes_formatted} & {mc_spec} & {yn_spec} & {short_spec} & {es_spec} \\\\\n\\hline\n")

    parts.append(r"""\end{tabularx}
\end{center}
\end{document}
""")
    return "\n".join(parts)
