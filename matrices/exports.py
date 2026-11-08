from __future__ import annotations
import io
import re
from html import escape
try:
    from docx import Document
    from docx.enum.section import WD_ORIENT
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm,Pt,RGBColor
    from docx.table import Table
    from docx.text.paragraph import Paragraph
except ImportError:
    Document = WD_ORIENT = OxmlElement = qn = Cm = Pt = RGBColor = Table = Paragraph = None
from bank_service import ServiceError
from .model import LEVELS,matrix_view,validate_matrix
from .import_docx import _raw_table
from .exchange import export_package

NAMES={'MC':'TNKQ-NLC','YN':'TNKQ-ĐS','ES':'Tự luận','SHORT':'Trả lời ngắn'}


def label(value):return f'{value:g}'.replace('.',',')
LEVEL_ABBR={'Biết':'B','Hiểu':'H','Vận dụng':'VD','Vận dụng cao':'VDC'}

def _export_levels(matrix):
    # Giữ bố cục ba mức của hồ sơ cũ; VDC có cột riêng khi xuất hồ sơ bốn mức.
    return LEVELS if any(r.get('level')=='Vận dụng cao' for r in matrix.get('requirements', [])) else LEVELS[:3]


def matrix_period(exam_type):
    """Kỳ kiểm tra trong tiêu đề ma trận/đặc tả, ví dụ "GIỮA KÌ 1" (mẫu GK1 đã nộp)."""
    return dict(TX='THƯỜNG XUYÊN',GK1='GIỮA KÌ 1',CK1='CUỐI KÌ 1',GK2='GIỮA KÌ 2',CK2='CUỐI KÌ 2').get(exam_type,'')


def spec_totals(v):
    """Dòng "Tổng" của bản đặc tả: ("16 câu B, 12 câu H", "3 câu VD") cho cột TNKQ và Tự luận."""
    groups={'TNKQ':{},'TL':{}}
    for row in v['rows']:
        for key,cell in row['cells'].items():
            kind,level=key.split('|');group=groups['TL' if kind=='ES' else 'TNKQ']
            group[level]=group.get(level,0)+cell['count']
    text=lambda g:', '.join(f'{groups[g][l]} câu {LEVEL_ABBR[l]}' for l in LEVELS if groups[g].get(l))
    return text('TNKQ'),text('TL')


def spec_ratio_lines(v,total_points=10):
    """Dòng "Tỉ lệ %" và "Tỉ lệ chung" (TNKQ | Tự luận) của bản đặc tả, theo mẫu GK1 đã nộp."""
    counts={l:0 for l in LEVELS};groups={'TNKQ':{},'TL':{}}
    for row in v['rows']:
        for key,cell in row['cells'].items():
            kind,level=key.split('|');group=groups['TL' if kind=='ES' else 'TNKQ']
            counts[level]+=cell['count'];group[level]=group.get(level,0)+float(cell['points'])
    pct=lambda points:label(round(float(points)/float(total_points)*100,2))+'%'
    ratio=', '.join(f'{counts[l]} câu {LEVEL_ABBR[l]} = {pct(v["totals"]["by_level"][l]["points"])}' for l in LEVELS if counts[l])
    def share(name):
        levels=[l for l in LEVELS if groups[name].get(l)]
        return ' + '.join(LEVEL_ABBR[l] for l in levels)+' = '+pct(sum(groups[name].values())) if levels else ''
    return ratio,share('TNKQ'),share('TL')


def _document():
    d=Document();s=d.sections[0];s.orientation=WD_ORIENT.LANDSCAPE
    s.page_width=Cm(29.7);s.page_height=Cm(21);s.left_margin=Cm(1.5);s.right_margin=Cm(1);s.top_margin=s.bottom_margin=Cm(1)
    for style in d.styles:
        if style.type!=1:continue
        style.font.name='Times New Roman';style.font.size=Pt(11);style.font.color.rgb=RGBColor(0,0,0)
        fonts=style.element.get_or_add_rPr().rFonts
        for attr in list(fonts.attrib):
            if 'theme' in attr.lower():del fonts.attrib[attr]
        for attr in ('ascii','hAnsi','eastAsia','cs'):fonts.set(qn('w:'+attr),'Times New Roman')
        for border in list(style.element.iter(qn('w:pBdr'))):border.getparent().remove(border)
    d.styles['Normal'].paragraph_format.space_after=Pt(1)
    d.styles['Normal'].paragraph_format.line_spacing=1
    d.styles['Heading 1'].font.size=Pt(13)
    d.styles['Heading 1'].paragraph_format.space_after=Pt(4)
    for prop in ('author','last_modified_by','comments','subject','keywords','identifier'):
        setattr(d.core_properties,prop,'')
    f=s.footer.paragraphs[0];f.alignment=2;f.add_run('Trang ')
    for instr in ('PAGE','NUMPAGES'):
        field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),instr);f._p.append(field)
        if instr=='PAGE':f.add_run('/')
    return d


def _heading(d,title,m):
    p=d.add_paragraph();p.alignment=1;p.paragraph_format.keep_with_next=True
    r=p.add_run(title);r.bold=True;r.font.size=Pt(13)
    p=d.add_paragraph(f'MÔN: {m.get("subject_name", "Tin học").upper()} {m["grade"]} - THỜI GIAN LÀM BÀI: {m["duration"]} PHÚT');p.alignment=1;p.paragraph_format.keep_with_next=True
    for r in p.runs:r.bold=True


def _table(d,rows,widths,headers):
    widths=[23.8*w/sum(widths) for w in widths]
    t=d.add_table(rows=rows,cols=len(widths));t.autofit=False;t.style='Table Grid';t.alignment=1
    for col,w in zip(t.columns,widths):col.width=Cm(w)
    for ri,row in enumerate(t.rows):
        for c,w in zip(row.cells,widths):
            c.width=Cm(w)
            c.vertical_alignment=1
            for p in c.paragraphs:
                p.paragraph_format.space_after=Pt(1);p.paragraph_format.line_spacing=1
        if ri<headers:
            f=OxmlElement('w:tblHeader');row._tr.get_or_add_trPr().append(f)
        else:
            f=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(f)
    return t


def _text(c,text,bold=False,center=False):
    c.text=str(text)
    for p in c.paragraphs:
        p.alignment=1 if center else 0
        p.paragraph_format.space_after=Pt(1)
        for r in p.runs:r.bold=bold;r.font.size=Pt(10.5)


def _raw_cell_center(ri,headers,cols,start,span,first_text,text):
    if ri<headers:return True
    first=first_text.strip().lower()
    if first.startswith(('tổng','tỉ lệ','ti le')):
        return True
    if headers==4:return True
    if cols==3 and headers==1:return start in (0,1)
    if start==0:return True
    if cols>=10 and headers==3 and start>=3:return True
    if cols==8 and headers==3 and start>=4:return True
    return False


def _raw(d,source_table,headers):
    cols=source_table['columns'];widths=source_table.get('widths') or [1]*cols
    t=_table(d,len(source_table['rows']),widths,headers)
    for ri,row in enumerate(source_table['rows']):
        first_text=row['cells'][0]['text'] if row.get('cells') else ''
        is_total_row=ri>=headers and first_text.strip().lower().startswith(('tổng','tỉ lệ','ti le'))
        for cell in row['cells']:
            start=cell['start'];span=cell['span']
            target=t.cell(ri,start)
            if span>1:target=target.merge(t.cell(ri,start+span-1))
            center=_raw_cell_center(ri,headers,cols,start,span,first_text,cell['text'])
            bold=ri<headers or is_total_row or (cols>=8 and headers==3 and start==1 and ri>=headers)
            _text(target,cell['text'],bold,center)
            if cell.get('vmerge'):
                vm=OxmlElement('w:vMerge')
                if cell['vmerge']=='restart':vm.set(qn('w:val'),'restart')
                target._tc.get_or_add_tcPr().append(vm)
    return t


def _matrix(d,m,v):
    kinds=['MC','ES'] if m['profile']=='THCS' else ['MC','YN','ES']
    if any(s['kind']=='SHORT' for s in m.get('slots',[])) and m['profile']=='THPT':kinds=['MC','YN','SHORT','ES']
    if m['profile']=='GENERAL':kinds=[k for k in ('MC','YN','SHORT','ES') if any(s['kind']==k for s in m.get('slots',[]))] or ['MC','ES']
    levels=_export_levels(m);level_count=len(levels)
    widths=[.9,3.1,4]+[1.05]*(level_count*len(kinds))+[1.1]*level_count+[1.7]
    t=_table(d,3+len(v['rows'])+3,widths,3)
    for c,text in enumerate(['TT','Chương/\nchủ đề','Nội dung/\nđơn vị kiến thức']):_text(t.cell(0,c).merge(t.cell(2,c)),text,True,True)
    end=3+level_count*len(kinds)
    _text(t.cell(0,3).merge(t.cell(0,end-1)),'Mức độ đánh giá',True,True)
    for i,k in enumerate(kinds):
        pos=3+level_count*i;_text(t.cell(1,pos).merge(t.cell(1,pos+level_count-1)),NAMES[k],True,True)
        for j,l in enumerate(levels):_text(t.cell(2,pos+j),LEVEL_ABBR[l] if l.startswith('Vận dụng') else l,True,True)
    _text(t.cell(0,end).merge(t.cell(1,end+level_count-1)),'Tổng',True,True)
    for j,l in enumerate(levels):_text(t.cell(2,end+j),LEVEL_ABBR[l] if l.startswith('Vận dụng') else l,True,True)
    _text(t.cell(0,end+level_count).merge(t.cell(2,end+level_count)),'Tỉ lệ %\nđiểm',True,True)
    topic_start=None;last_topic=None;topic_number=0
    for i,row in enumerate(v['rows'],3):
        if row['topic']!=last_topic:
            if topic_start is not None and i-1>topic_start:
                t.cell(topic_start,0).merge(t.cell(i-1,0));t.cell(topic_start,1).merge(t.cell(i-1,1))
            topic_start=i;last_topic=row['topic'];topic_number+=1
            _text(t.cell(i,0),topic_number,False,True);_text(t.cell(i,1),row['topic'],True)
        _text(t.cell(i,2),row['title'])
        for ki,k in enumerate(kinds):
            for li,l in enumerate(levels):
                cell=row['cells'].get(k+'|'+l)
                if cell:_text(t.cell(i,3+ki*level_count+li),str(cell['count'])+(' ES' if k=='ES' else '')+'\n('+', '.join(cell['refs'])+')',False,True)
        for li,l in enumerate(levels):_text(t.cell(i,end+li),row['counts'][l] or '',False,True)
        _text(t.cell(i,end+level_count),label(row['percentage'])+'%',False,True)
    if topic_start is not None and 2+len(v['rows'])>topic_start:
        t.cell(topic_start,0).merge(t.cell(2+len(v['rows']),0));t.cell(topic_start,1).merge(t.cell(2+len(v['rows']),1))
    totals=v['totals']
    for ri,title in enumerate(('Tổng số câu và ý','Tổng số điểm','Tỉ lệ %'),3+len(v['rows'])):
        _text(t.cell(ri,0).merge(t.cell(ri,2)),title,True,True)
        for ki,k in enumerate(kinds):
            for li,l in enumerate(levels):
                values=[r['cells'].get(k+'|'+l,{}) for r in v['rows']]
                amount=sum(x.get('count',0) if title.startswith('Tổng số câu') else x.get('points',0) for x in values)
                if title=='Tỉ lệ %':amount=amount/10*100
                _text(t.cell(ri,3+ki*level_count+li),label(amount)+('%' if title=='Tỉ lệ %' else ''),True,True)
        for li,l in enumerate(levels):
            value=totals['by_level'][l]['items'] if title.startswith('Tổng số câu') else totals['by_level'][l]['points']
            if title=='Tỉ lệ %':value=value/10*100
            _text(t.cell(ri,end+li),label(value)+('%' if title=='Tỉ lệ %' else ''),True,True)
        _text(t.cell(ri,end+level_count),label(totals['items'] if title.startswith('Tổng số câu') else 10 if title=='Tổng số điểm' else 100)+('%' if title=='Tỉ lệ %' else ''),True,True)


def _spec(d,m,v):
    # Bound each physical row so a long lesson cannot clip or lose repeating headers.
    expanded=[]
    for index,row in enumerate(v['rows']):
        reqs=[r for level in LEVELS for r in v['requirements'] if r['lesson_code']==row['lesson_code'] and r['level']==level]
        chunks=[[]];size=0
        for req in reqs:
            length=len(req['text'])+len(', '.join(req['refs']))+60
            if chunks[-1] and size+length>1200:chunks.append([]);size=0
            chunks[-1].append(req);size+=length
        for ci,chunk in enumerate(chunks):expanded.append((index,row,chunk,ci))
    t=_table(d,3+len(expanded)+3,[.8,3,3.6,9.2,1.8,1.8,1.8,1.8],3)
    for c,title in enumerate(['TT','Chương/\nchủ đề','Nội dung/\nđơn vị kiến thức','Yêu cầu cần đạt']):_text(t.cell(0,c).merge(t.cell(2,c)),title,True,True)
    _text(t.cell(0,4).merge(t.cell(0,7)),'Mức độ đánh giá',True,True)
    _text(t.cell(1,4).merge(t.cell(1,6)),'Trắc nghiệm khách quan',True,True)
    _text(t.cell(1,7).merge(t.cell(2,7)),'Thực hành/\nTự luận',True,True)
    for c,title in enumerate(('MC\n(4-1)','YN\n(4-4)','Short\nAnswer'),4):_text(t.cell(2,c),title,True,True)
    for i,(index,row,reqs,continuation) in enumerate(expanded,3):
        lesson=m['lessons'][index]
        _text(t.cell(i,0),index+1,False,True);_text(t.cell(i,1),lesson.get('spec_topic') or row['topic'],True)
        _text(t.cell(i,2),(lesson.get('spec_title') or row['title'])+(' (tiếp)' if continuation else ''))
        c=t.cell(i,3);c.text=''
        for level in LEVELS:
            rs=[r for r in reqs if r['level']==level]
            if not rs:continue
            p=c.paragraphs[0] if not c.text else c.add_paragraph();p.add_run('Nhận biết' if level=='Biết' else 'Thông hiểu' if level=='Hiểu' else level).bold=True
            for r in rs:
                base=re.sub(r'\s*(?:\(\s*c[aâ]u\s+[^)]+\)|(?<=[\.\;\:])\s*c[aâ]u\s+[0-9,\s]+)\s*\.?\s*$','',r['text'],flags=re.I) if r['refs'] else r['text']
                text=base.rstrip(' .')
                if r['refs']:text+=' ('+', '.join('Câu '+ref for ref in r['refs'])+').'
                else:text+='.'
                c.add_paragraph('– '+text)
        for ki,k in enumerate(('MC','YN','SHORT','ES'),4):
            lines=[]
            if not continuation:
                for level in LEVELS:
                    value=row['cells'].get(k+'|'+level)
                    if not value:continue
                    allocated={p['requirement_id'] for slot in m['slots'] if slot['kind']==k for p in slot['parts']}
                    all_reqs=[r for r in v['requirements'] if r['lesson_code']==row['lesson_code'] and r['id'] in allocated]
                    comps=sorted({r.get('competency','') for r in all_reqs if r['level']==level and r['refs']})
                    lines.append(f'{value["count"]} {k} ({"V" if level=="Vận dụng" else LEVEL_ABBR[level]}) ('+', '.join(comps)+')')
            _text(t.cell(i,ki),'\n'.join(lines) or ('' if continuation else '0'),False,True)
    for offset,name in enumerate(('Tổng','Tỉ lệ %','Tỉ lệ chung')):
        ri=3+len(expanded)+offset;_text(t.cell(ri,0).merge(t.cell(ri,2)),name,True,True)
        if offset==0:
            for ki,k in enumerate(('MC','YN','SHORT','ES'),4):_text(t.cell(ri,ki),v['totals']['by_kind'][k]['items'],True,True)
        else:
            ratio,tnkq,tl=spec_ratio_lines(v,m.get('total_points',10))
            if offset==1:_text(t.cell(ri,4).merge(t.cell(ri,7)),ratio,True,True)
            else:
                _text(t.cell(ri,4).merge(t.cell(ri,6)),tnkq,True,True);_text(t.cell(ri,7),tl,True,True)


def _competencies(d,m,v):
    levels=_export_levels(m);level_count=len(levels);end=3+3*level_count
    t=_table(d,4+len(v['competencies']),[1.9,1.1,.7]+[1.7]*(3*level_count),4)
    _text(t.cell(0,0).merge(t.cell(3,0)),'Dạng thức',True,True)
    _text(t.cell(0,1).merge(t.cell(3,2)),'Câu hỏi',True,True)
    _text(t.cell(0,3).merge(t.cell(0,end-1)),'Năng lực tin học',True,True)
    for i,(comp,name) in enumerate([('NLa','Sử dụng và quản lí các phương tiện CNTT&TT'),('NLb','Ứng xử phù hợp trong môi trường số'),('NLc','Giải quyết vấn đề với sự trợ giúp của máy tính')]):
        start=3+level_count*i;_text(t.cell(1,start).merge(t.cell(1,start+level_count-1)),name+' ('+comp+')',True,True)
        _text(t.cell(2,start).merge(t.cell(2,start+level_count-1)),'Cấp độ tư duy',True,True)
        for j,l in enumerate(levels):_text(t.cell(3,start+j),l,True,True)
    for ri,part in enumerate(v['competencies'],4):
        _text(t.cell(ri,0),NAMES[part['kind']],False,True);_text(t.cell(ri,1),'Câu '+str(part['number']),False,True);_text(t.cell(ri,2),part['label'],False,True)
        for ci in range(3,end):_text(t.cell(ri,ci),'',False,True)
        if part['competency'] in ('NLa','NLb','NLc'):
            col=3+('NLa','NLb','NLc').index(part['competency'])*level_count+levels.index(part['level'])
            _text(t.cell(ri,col),part['indicator'],False,True)
    d.add_page_break();h=d.add_heading('Mã hóa ma trận',level=1);h.alignment=1
    raw_tables=(m.get('source') or {}).get('tables',[])
    if len(raw_tables)==4:_raw(d,raw_tables[2],1)
    else:
        codes=m.get('indicator_catalog',[]);t=_table(d,1+len(codes),[5.2,1.8,16.8],1)
        for c,x in zip(t.rows[0].cells,('Thành phần năng lực','Mã','Chỉ báo năng lực')):_text(c,x,True,True)
        for i,code in enumerate(codes,1):
            for ci,(c,x) in enumerate(zip(t.rows[i].cells,(code['competency'],code['code'],code['text']))):
                _text(c,x,ci==1,ci in (0,1))


def matrix_docx(matrix,ppct,section='all',mode='auto'):
    if section not in ('all','matrix','specification','competencies') or (section=='competencies' and matrix.get('profile')!='THPT'):raise ServiceError('Phần xuất không phù hợp mẫu.')
    if mode not in ('auto','raw','web'):raise ServiceError('Chế độ xem không hợp lệ.')
    m=matrix;d=_document();d.core_properties.title=m['title']
    period=matrix_period(m['exam_type'])
    source=(m.get('source') or {}).get('tables',[])
    report=validate_matrix(m,ppct,True)
    if mode=='raw':
        if not source:raise ServiceError('Hồ sơ không có bảng nguồn Word để dựng nguyên trạng.')
        raw_mode=True
    elif mode=='web':
        raw_mode=False
    else:
        raw_mode=bool(source) and (not report['valid'] or not m.get('reconciliation',{}).get('confirmed'))
    v=None if raw_mode else matrix_view(m)
    wrote=False
    for part,title in [('matrix','MA TRẬN ĐỀ KIỂM TRA '),('competencies','MA TRẬN PHÂN BỐ THEO DẠNG THỨC CÂU HỎI VÀ CẤP ĐỘ TƯ DUY'),('specification','BẢNG ĐẶC TẢ ĐỀ KIỂM TRA ')]:
        if section not in ('all',part) or (part=='competencies' and m['profile']!='THPT'):continue
        if wrote:d.add_page_break()
        _heading(d,title+(period if part!='competencies' else ''),m);wrote=True
        if raw_mode:
            index=0 if part=='matrix' else len(source)-1 if part=='specification' else 1
            _raw(d,source[index],4 if part=='competencies' else 3)
            if part=='competencies':d.add_page_break();h=d.add_heading('Mã hóa ma trận',level=1);h.alignment=1;_raw(d,source[2],1)
        elif part=='matrix':_matrix(d,m,v)
        elif part=='specification':_spec(d,m,v)
        else:_competencies(d,m,v)
    stream=io.BytesIO();d.save(stream);return stream.getvalue()


def _cell_html(tc,fallback_text,header=False):
    paras=[p for p in tc.paragraphs if p.text.strip()]
    if not paras:
        return escape(fallback_text).replace('\n','<br>')
    lines=[]
    for p in paras:
        txt=escape(p.text).replace('\n','<br>')
        runs=[r for r in p.runs if r.text.strip()]
        is_bold=not header and bool(runs) and all(r.bold for r in runs)
        lines.append(f'<strong>{txt}</strong>' if is_bold else txt)
    return '<br>'.join(lines)


def matrix_body_html(matrix,ppct,section='all',mode='auto'):
    doc=Document(io.BytesIO(matrix_docx(matrix,ppct,section,mode)));body=[]
    for el in doc.element.body:
        if el.tag==qn('w:p'):
            p=Paragraph(el,doc)
            if p.text:
                is_sub=p.text.strip().upper().startswith('MÔN:')
                cls='mx-doc-subhead' if is_sub else 'mx-doc-heading'
                body.append(f'<p class="{cls}" align="center"><strong>'+escape(p.text)+'</strong></p>')
        elif el.tag==qn('w:tbl'):
            t=Table(el,doc);raw=_raw_table(t,0)
            cols=raw['columns'];widths=raw.get('widths') or [1]*cols;total_w=sum(widths) or 1
            colgroup='<colgroup>'+''.join(f'<col style="width:{w/total_w*100:.2f}%">' for w in widths)+'</colgroup>'
            headers=sum(1 for r in t.rows if r._tr.trPr is not None and r._tr.trPr.find(qn('w:tblHeader')) is not None)
            body.append('<table>'+colgroup)
            for ri,row in enumerate(raw['rows']):
                header=ri<headers
                if ri==0 and header:body.append('<thead>')
                if not header and ri>0 and ri-1<headers:body.append('</thead><tbody>')
                first_text=row['cells'][0]['text'] if row.get('cells') else ''
                body.append('<tr>')
                for c in row['cells']:
                    if c.get('vmerge')=='continue':continue
                    rowspan=1
                    if c.get('vmerge')=='restart':
                        for nxt in raw['rows'][ri+1:]:
                            continuation=next((x for x in nxt['cells'] if x['start']==c['start']),None)
                            if not continuation or continuation.get('vmerge')!='continue':break
                            rowspan+=1
                    tc=t.cell(ri,c['start'])
                    is_center=header or any(p.alignment==1 for p in tc.paragraphs if p.text.strip()) or _raw_cell_center(ri,headers,cols,c['start'],c['span'],first_text,c['text'])
                    align='center' if is_center else 'left'
                    cls='mx-center' if is_center else ('mx-req-cell' if cols==8 and headers==3 and c['start']==3 and not is_center else 'mx-left')
                    tag='th' if header else 'td'
                    body.append(f'<{tag} colspan="{c["span"]}" rowspan="{rowspan}" align="{align}" class="{cls}">'+_cell_html(tc,c['text'],header)+f'</{tag}>')
                body.append('</tr>')
            body.append('</tbody></table>')
    return ''.join(body)


def matrix_html(matrix,ppct,section='all',mode='auto'):
    body=matrix_body_html(matrix,ppct,section,mode)
    css=(
        'body{font-family:"Times New Roman",Times,serif;color:#000;margin:20px auto;max-width:1440px;padding:0 16px}'
        'p.mx-doc-heading{text-align:center;font-size:14pt;font-weight:700;margin:18px 0 4px;text-transform:uppercase}'
        'p.mx-doc-subhead{text-align:center;font-size:12pt;font-weight:700;margin:0 0 14px}'
        'p{text-align:center;white-space:pre-wrap}'
        'table{border-collapse:collapse;width:100%;table-layout:fixed;margin:10px auto 26px}'
        'td,th{border:1px solid #333;padding:6px 8px;overflow-wrap:anywhere;font-size:11pt;vertical-align:middle;line-height:1.4}'
        'th,td.mx-center,[align="center"]{text-align:center}'
        'td.mx-left,[align="left"]{text-align:left}'
        'td.mx-req-cell{text-align:left;vertical-align:top;line-height:1.5}'
        'thead{display:table-header-group}'
        '@page{size:A4 landscape;margin:1cm 1cm 1cm 1.5cm}'
        '@media print{body{margin:0;max-width:none;padding:0}tr{break-inside:avoid}}'
    )
    return ('<!doctype html><html lang="vi"><meta charset="utf-8"><title>'+escape(matrix['title'])+'</title><style>'+css+'</style><body>'+body+'</body></html>').encode()


def export_matrix(matrix,ppct,fmt,section='all',mode='auto'):
    if fmt not in ('docx','html','json','tex','pdf'):raise ServiceError('Chỉ hỗ trợ Word, PDF, LaTeX, bản xem trước và gói JSON.')
    report=validate_matrix(matrix,ppct,True)
    state='THONG_NHAT' if matrix.get('status')=='locked' and report['valid'] else 'NHAP'
    name=f'TIN_{matrix["grade"]}_{matrix["exam_type"]}_MA_TRAN_V{matrix.get("version",1)}_{state}.{fmt}'
    if fmt=='pdf':
        import pdf_build  # PDF chuyển từ chính tệp Word để hai bản giống hệt nhau
        return pdf_build.docx_to_pdf(matrix_docx(matrix,ppct,section,mode)),'application/pdf',name
    if fmt=='tex':
        from latex_generator import generate_matrix_latex
        tex=generate_matrix_latex(matrix)
        return tex.encode('utf-8'),'application/x-tex; charset=utf-8',name
    if fmt=='json':
        import json
        return json.dumps(export_package(matrix),ensure_ascii=False,indent=2).encode(),'application/json; charset=utf-8',name
    if fmt=='html':return matrix_html(matrix,ppct,section,mode),'text/html; charset=utf-8',name
    return matrix_docx(matrix,ppct,section,mode),'application/vnd.openxmlformats-officedocument.wordprocessingml.document',name
