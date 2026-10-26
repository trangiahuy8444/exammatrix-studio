"""Pageable tables fed by the same canonical records as the Word exporter."""
from collections import Counter
from latex_generator import tex_escape as esc, point_label as label


def table(weights, headers, rows, *, size=10):
    """Fixed total width, repeatable headings and ordinary breakable table rows."""
    total=sum(weights)
    spec='|'+'|'.join(r'>{\raggedright\arraybackslash}p{\dimexpr'+f'{w/total:.6f}'+
        r'\linewidth-2\tabcolsep-1.5\arrayrulewidth\relax}' for w in weights)+'|'
    head=r'\rowcolor{tableheader} '+' & '.join(r'\textbf{'+h+'}' for h in headers)+r' \\ \hline'+'\n'
    return (r'\par\begingroup'+f'\\fontsize{{{size}}}{{{size+2}}}\\selectfont\n'+
        r'\setlength{\tabcolsep}{3pt}\renewcommand{\arraystretch}{1.12}'+'\n'+
        r'\begin{longtable}{'+spec+r'}\hline'+'\n'+head+r'\endfirsthead'+'\n'+head+r'\endhead'+'\n'+
        ''.join(' & '.join(row)+r' \\ \hline'+'\n' for row in rows)+
        r'\end{longtable}\endgroup\par'+'\n')


def heading(text):
    return r'\par\medskip\noindent\textbf{'+text+r'}\par\smallskip'+'\n'


def header(record,title,code=''):
    school=(r'\textbf{TRƯỜNG TH, THCS VÀ THPT QUỐC TẾ Á CHÂU}\\[3pt]' if record.get('school_profile',True) else '')
    return (r'\begin{center}'+school+r'\textbf{'+esc(title)+r'}\\[3pt]'+
        r'\textbf{MÔN: '+esc(str(record.get('subject_name','Tin học')).upper())+' -- KHỐI '+str(record.get('grade',10))+r'}\\'+
        'Năm học '+esc(record.get('school_year','2026-2027'))+
        (r' -- Mã đề: \textbf{'+esc(code)+'}' if code else '')+r'\end{center}'+'\n')


def preamble(record,landscape=False):
    from latex_generator import LATEX_PORTRAIT_PREAMBLE, LATEX_LANDSCAPE_PREAMBLE
    text=LATEX_LANDSCAPE_PREAMBLE if landscape else LATEX_PORTRAIT_PREAMBLE
    if not record.get('school_profile',True):
        text=text.replace(r'\lfoot{\textit{Trường TH, THCS \& THPT Quốc Tế Á Châu}}',r'\lfoot{}')
    return text+'\n'+r'\begin{document}'+'\n'


def answer_sections(record):
    out=[]
    mc=[q for q in record.get('questions',[]) if q['type']=='MC']
    if mc:
        out.append(heading('PHẦN I. ĐÁP ÁN TRẮC NGHIỆM KHÁCH QUAN'))
        for start in range(0,len(mc),10):
            chunk=mc[start:start+10]
            letters=[chr(65+q['correct']) if type(q.get('correct')) is int and q['correct'] in range(4) else '--' for q in chunk]
            out.append(table([1]*(len(chunk)+1),['Câu']+[str(q.get('slot_number',start+i+1)) for i,q in enumerate(chunk)],
                [[r'\textbf{Đ/A}']+[r'\textbf{'+letter+'}' for letter in letters]]))
    yn=[q for q in record.get('questions',[]) if q['type']=='YN']
    if yn:
        out.append(heading('PHẦN II. ĐÁP ÁN ĐÚNG / SAI'))
        out.append(table([1,4],['Câu','Đáp án'],[[str(q.get('slot_number',i+1)),
            esc('; '.join(f"{s.get('label',chr(97+j))}) {'Đúng' if s.get('correct') else 'Sai'}" for j,s in enumerate(q.get('statements',[]))))] for i,q in enumerate(yn)]))
    short=[q for q in record.get('questions',[]) if q['type']=='SHORT']
    if short:
        out.append(heading('PHẦN III. ĐÁP ÁN TRẢ LỜI NGẮN'))
        out.append(table([1,5,1],['Câu','Đáp án chấp nhận','Điểm'],[[str(q.get('slot_number',i+1)),
            esc(q.get('short_answer') or q.get('correct_answer') or q.get('answer','')),label(q.get('points',1))] for i,q in enumerate(short)]))
    es=[q for q in record.get('questions',[]) if q['type']=='ES']
    if es:
        from exports import _scaled_policy
        out.append(heading('PHẦN IV. HƯỚNG DẪN CHẤM VÀ THANG ĐIỂM TỰ LUẬN'))
        rows=[]
        for i,q in enumerate(es):
            number=q.get('slot_number',i+1)
            scale=q.get('points',1)/(q.get('max_score',1) or 1)
            for ri,rub in enumerate(q.get('rubric',[])):
                rows.append([f'Câu {number} / {ri+1}',esc(rub.get('criterion','')),label(rub.get('points',0)*scale)])
            if not q.get('rubric'):
                rows.append([f'Câu {number}',esc(q.get('sample_answer') or q.get('answer','')),label(q.get('points',1))])
            if q.get('equivalent_answer_policy'):
                rows.append(['Lưu ý',esc(_scaled_policy(q)),''])
        out.append(table([1.7,12.8,2],['Câu / Ý','Nội dung yêu cầu / Tiêu chí chấm','Điểm'],rows))
    return '\n'.join(out)


def answers(record,code=''):
    return preamble(record)+header(record,'ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM',code)+answer_sections(record)+heading('--- HẾT HƯỚNG DẪN CHẤM ---')+r'\end{document}'


def review(record):
    from exports import _goals
    out=[preamble(record),header(record,'ĐỀ CƯƠNG ÔN TẬP KIỂM TRA'),heading('A. GIỚI HẠN KIẾN THỨC ÔN TẬP')]
    rows=[]
    for i,lesson in enumerate(_goals(record),1):
        for goal in lesson['goals'] or ['']:
            rows.append([str(i),esc(lesson['topic']),esc(lesson['name']),esc(goal)])
    out.append(table([1,2.5,3.8,9.2],['STT','Tên chủ đề','Tên bài','Mục tiêu bài học'],rows))
    out.append(heading('B. HỆ THỐNG CÂU HỎI ÔN TẬP'))
    kinds=[('MC','I. TRẮC NGHIỆM'),('YN','II. ĐÚNG / SAI'),('SHORT','III. TRẢ LỜI NGẮN'),('ES','IV. TỰ LUẬN')]
    for kind,title in kinds:
        qs=[q for q in record.get('questions',[]) if q['type']==kind]
        if not qs:continue
        out.append(heading(title))
        for i,q in enumerate(qs,1):
            out.append(r'\par\noindent\textbf{Câu '+str(q.get('slot_number',i))+'.} '+esc(q['question'])+r'\par')
            if kind=='MC':out.append(r'\choices' + ''.join('{'+esc(o)+'}' for o in q['options']))
            if kind=='YN':
                out.append(r'\begin{enumerate}[label=\alph*)]')
                out.extend(r'\item '+esc(s['text']) for s in q['statements'])
                out.append(r'\end{enumerate}')
            out.append(r'\smallskip')
    out.append(r'\clearpage')
    out.append(heading('C. BẢNG ĐÁP ÁN GỢI Ý VÀ HƯỚNG DẪN ÔN TẬP'))
    out.append(answer_sections(record));out.append(r'\end{document}')
    return '\n'.join(out)


def matrix(record):
    from matrices.model import matrix_view, LEVELS
    v=matrix_view(record)
    kinds=[kind for kind in ('MC','YN','SHORT','ES') if any(s['kind']==kind for s in record['slots'])]
    headers=['TT','Chủ đề','Nội dung / bài']+[kind+r'\newline '+esc(level) for kind in kinds for level in LEVELS]+['Tổng Biết','Tổng Hiểu','Tổng VD','Tỉ lệ điểm']
    rows=[]
    for i,row in enumerate(v['rows'],1):
        cells=[str(i),esc(row['topic']),esc(row['title'])]
        for kind in kinds:
            for level in LEVELS:
                cell=row['cells'].get(kind+'|'+level)
                cells.append((str(cell['count'])+r'\newline ('+', '.join(cell['refs'])+')') if cell else '')
        cells.extend(str(row['counts'][level]) for level in LEVELS)
        cells.append(label(row['percentage'])+r'\%');rows.append(cells)
    for title,metric in [('Tổng số câu và ý','count'),('Tổng số điểm','points'),('Tỉ lệ phần trăm','percentage')]:
        cells=['',esc(title),'']
        for kind in kinds:
            for level in LEVELS:
                amount=sum(row['cells'].get(kind+'|'+level,{}).get('count' if metric=='count' else 'points',0) for row in v['rows'])
                cells.append(label(amount if metric!='percentage' else amount*10)+(r'\%' if metric=='percentage' else ''))
        cells.extend(label(v['totals']['by_level'][level]['items' if metric=='count' else 'points']*(10 if metric=='percentage' else 1)) for level in LEVELS)
        cells.append(label(v['totals']['items'] if metric=='count' else v['totals']['points'] if metric=='points' else 100))
        rows.append(cells)
    code=record.get('exam_code','')
    out=[preamble(record,True),header(record,'KHUNG MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ',code),
        table([.7,2.3,3.7]+[1]*(len(headers)-3),headers,rows,size=8.5),
        r'\clearpage',header(record,'BẢNG ĐẶC TẢ ĐỀ KIỂM TRA',code)]
    lesson_map={l['lesson_code']:l for l in record['lessons']}
    counts=Counter((p['requirement_id'],s['kind']) for s in record['slots'] for p in s['parts'])
    rows=[]
    for i,req in enumerate(v['requirements'],1):
        lesson=lesson_map[req['lesson_code']]
        text=esc(req['level']+': '+req['text'])
        if req['refs']: text+=' ('+', '.join('Câu '+r for r in req['refs'])+').'
        cells=[str(i),esc(lesson['topic']),esc(lesson['title']),text]
        for kind in ('MC','YN','SHORT','ES'):
            count=counts[(req['id'],kind)]
            comp=esc(req.get('competency','')).replace(r'\_',r'\_\allowbreak ')
            cells.append(f'{count} {kind}'+r'\newline ('+{'Biết':'B','Hiểu':'H','Vận dụng':'V'}[req['level']]+') ('+comp+')' if count else '0')
        rows.append(cells)
    out.append(table([.6,2,3,10,1.7,1.7,1.7,1.7],['TT','Chủ đề','Nội dung / bài','Yêu cầu cần đạt','MC','YN','Short','Tự luận'],rows,size=9))
    out.append(r'\end{document}')
    return '\n'.join(out)
