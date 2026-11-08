"""Read the two school table layouts without taking exam/answer content."""
from __future__ import annotations
import copy
import hashlib
import io
import re
import unicodedata
import zipfile
from pathlib import PurePosixPath
try:
    from docx import Document
    from docx.table import _Cell
    from docx.oxml.ns import qn
except ImportError:
    Document = _Cell = qn = None
from bank_service import ServiceError
from .model import normalize_matrix

# The received 13/16-column layouts have exactly three source columns per kind.
# Do not use the model's four levels to index those legacy tables.
LEGACY_LEVELS = ('Biết', 'Hiểu', 'Vận dụng')

MAX_UPLOAD_BYTES=8*1024*1024
MAX_UNCOMPRESSED_BYTES=64*1024*1024
MAX_ENTRIES=2000


def plain(value):
    return ' '.join(unicodedata.normalize('NFD',str(value).replace('đ','d').replace('Đ','D')).encode('ascii','ignore').decode().lower().replace('đ','d').split())


def _raw_table(table, index):
    rows=[]
    for ri,row in enumerate(table.rows):
        cells=[];start=0
        for tc in row._tr.tc_lst:
            cell=_Cell(tc,table)
            span=tc.tcPr.find(qn('w:gridSpan'))
            n=int(span.get(qn('w:val'))) if span is not None else 1
            vm=tc.tcPr.find(qn('w:vMerge'))
            cells.append(dict(text=cell.text,start=start,span=n,
                              vmerge=vm.get(qn('w:val'),'continue') if vm is not None else None))
            start+=n
        rows.append(dict(index=ri,cells=cells))
    return dict(index=index,columns=len(table.columns),widths=[int(c.w) for c in table._tbl.tblGrid.gridCol_lst],rows=rows)


def _lesson_match(title,grade,ppct):
    def words(v):
        v=re.sub(r'^(bai\s*)?\d+[a-z]?\s*[.:]?\s*','',plain(v))
        v=re.sub(r'[^a-z0-9\s]',' ',v)
        return set(v.split())
    wanted=words(title);ranked=[]
    for lesson in ppct.get('lessons',[]):
        if lesson['grade']!=grade:continue
        have=words(lesson['lesson_name_source'])
        score=len(wanted&have)/max(1,len(wanted|have))
        ranked.append((score,lesson['lesson_code']))
    ranked.sort(reverse=True)
    return ranked[0][1] if ranked and ranked[0][0]>.5 and (len(ranked)==1 or ranked[0][0]>ranked[1][0]) else ''


def _outcome_match(text,grade,code,ppct):
    if not ppct or not code:return None
    lesson=next((l for l in ppct.get('lessons',[]) if l.get('grade')==grade and l.get('lesson_code')==code),None)
    outcomes=(lesson or {}).get('outcomes',[])
    if not outcomes:return None
    def words(v):return set(re.sub(r'[^a-z0-9\s]',' ',plain(v)).split())
    wanted=words(text)
    best=max(range(len(outcomes)),key=lambda i:len(wanted&words(outcomes[i]))/max(1,len(wanted|words(outcomes[i]))))
    return best


def _bullet_refs(text):
    m=re.search(r'(?:\(\s*c[aâ]u\s+([^)]+)\)|(?<=[\.\;\:])\s*c[aâ]u\s+([0-9,\s]+))\s*\.?\s*$',text,re.I)
    if not m:return set()
    raw=m.group(1) or m.group(2)
    kind='ES' if 'tu luan' in plain(raw) else 'YN' if 'dung/sai' in plain(raw) else 'MC'
    return {f'{kind}-{n}' for n in re.findall(r'\d+',raw)}


def _requirements_split_heading(stripped,p,prefix):
    if re.fullmatch(prefix+r'(?:\s*\([^)]*\))?\s*[:.-]*',p):return ''
    return re.sub(r'^\s*\S+\s+\S+(?:\s*\([^)]*\))?\s*[:.-]+\s*','',stripped).strip()


def _requirements(text,source_index,code,grade=None,ppct=None):
    level=None;result=[];bullet_map={}
    for line in text.splitlines():
        stripped=line.strip();p=plain(stripped)
        if p.startswith('nhan biet'):
            level='Biết';stripped=_requirements_split_heading(stripped,p,r'nhan\s+biet')
        elif p.startswith('thong hieu'):
            level='Hiểu';stripped=_requirements_split_heading(stripped,p,r'thong\s+hieu')
        elif p.startswith('van dung cao'):
            raise ServiceError('Mẫu 13/16 cột chưa hỗ trợ Vận dụng cao; cần đối chiếu nguồn bốn mức độ trước khi nhập.')
        elif p.startswith('van dung'):
            level='Vận dụng';stripped=_requirements_split_heading(stripped,p,r'van\s+dung')
        if not stripped or level is None:continue
        stripped=re.sub(r'^[-–—•]\s*','',stripped)
        rid=f'R{source_index}-{len(result)}'
        for ref in _bullet_refs(stripped):bullet_map[(level,ref)]=rid
        result.append(dict(id=rid,source_index=source_index,
            lesson_code=code,level=level,text=stripped,
            ppct_outcome_index=_outcome_match(stripped,grade,code,ppct),
            competency='NLa',choice_group=None))
    return result,bullet_map


def _header(value):
    return ' '.join(re.sub(r'[^a-z0-9 ]', ' ', plain(value)).split())


def _compact_layout(table):
    """Recognize headers, never a data table merely because it has ten columns."""
    if not table.rows:return None
    head=[_header(c.text) for c in table.rows[0].cells]
    thcs=['TT','Chủ đề / Mạch kiến thức','Đơn vị kiến thức / Bài học',
          'Nhận biết (TNKQ)','Thông hiểu (TNKQ)','Vận dụng (Tự luận)',
          'Vận dụng cao (Tự luận)','Tổng số câu','Tổng điểm','Tỉ lệ %']
    if len(table.columns)==10 and head==list(map(_header,thcs)):return 'THCS'
    if len(table.columns)==10 and len(table.rows)>1:
        sub=[_header(c.text) for c in table.rows[1].cells]
        groups=['phan i tn nhieu lua chon','phan ii tn dung sai','phan iii tu luan']
        if (head[:2]==['tt','chu de don vi kien thuc'] and head[8:]==['tong diem','ti le']
            and all(head[2+j*2].startswith(prefix) and head[2+j*2]==head[3+j*2] for j,prefix in enumerate(groups))
            and sub==['','','biet','hieu','biet a b','hieu vd c d','van dung','van dung cao','','']):return 'THPT'
    if len(table.columns)==6:
        common=head[:2]==['tt','chu de don vi kien thuc'] and head[5]=='ma cau hoi trong de'
        if common and head[2]=='muc do danh gia' and head[3]=='yeu cau can dat chuan ct gdpt 2018' and head[4]=='so cau hoi theo muc do':return 'THCS-spec'
        if common and head[2]=='dang thuc cau hoi' and head[3]=='yeu cau can dat chuong trinh gdpt 2018' and head[4]=='so luong cau y':return 'THPT-spec'
    return None


def _compact_level(value):
    labels={'nhan biet':'Biết','biet':'Biết','thong hieu':'Hiểu','hieu':'Hiểu',
            'van dung':'Vận dụng','vd':'Vận dụng','van dung cao':'Vận dụng cao','vdc':'Vận dụng cao'}
    found=re.findall(r'\b(?:van dung cao|van dung|nhan biet|thong hieu|biet|hieu|vdc|vd)\b',plain(value))
    levels={labels[v] for v in found}
    return next(iter(levels)) if len(levels)==1 else None


def _compact_count(value):
    value=plain(value)
    if value in ('','-','–','—'):return 0
    found=re.match(r'^(\d+)(?![\d.,])(?:\s|\(|$)',value)
    return int(found.group(1)) if found else None


def _compact_refs(value,kind=None):
    """Only explicit individual references; ranges are not expanded or counted."""
    value=plain(value).strip()
    value=re.sub(r'\b(?:cau|y)\s*','',value)
    if not value:return []
    refs=[]
    for token in re.split(r'[,;\n]+',value):
        match=re.fullmatch(r'\s*(?:(MC|TN|YN|DS|ES|TL)\s*-?\s*)?(\d+)([a-d]?)\s*',token,re.I)
        if not match:return None
        prefix,number,label=match.groups()
        actual={'TN':'MC','DS':'YN','TL':'ES'}.get((prefix or '').upper(),(prefix or kind or '').upper())
        if actual not in ('MC','YN','ES') or (kind and actual!=kind) or int(number)<1:return None
        ref=(actual,int(number),label)
        if ref in refs:return None
        refs.append(ref)
    return refs


def _compact_exact_lesson(title,grade,ppct):
    def parts(value):
        value=plain(value)
        prefix=re.match(r'^(?:bai\s*)?(\d+[a-z]?)\s*[.:]?\s*',value)
        return (prefix.group(1),value[prefix.end():]) if prefix else (None,value)
    number,wanted=parts(title)
    matches=[]
    for lesson in ppct.get('lessons',[]):
        source_number,name=parts(lesson.get('lesson_name_source',''))
        code_number=re.fullmatch(r'b(\d+[a-z]?)',plain(lesson.get('lesson_code','')))
        known_numbers={n for n in (source_number,code_number.group(1) if code_number else None) if n}
        if number and any(number!=known for known in known_numbers):continue
        if lesson.get('grade')==grade and name==wanted:matches.append(lesson)
    return matches[0] if title and len(matches)==1 else None


def _inspect_compact(raw,filename,grade,ppct,pair,header):
    mi,mt,profile=pair[0];si,st,_=pair[1]
    if (grade==10)!=(profile=='THPT'):raise ServiceError('Khối đã chọn khác mẫu ma trận 10/6 cột.')
    exam_type='CK1' if re.search(r'cuoi\s+(?:hoc\s+)?(?:ky|ki)\s*(?:i|1)\b|cuoi\s+hk\s*1',plain(header+' '+filename)) else 'GK1'
    m=normalize_matrix(dict(grade=grade,mode='received',profile=profile,
        title=f'Ma trận {"Cuối" if exam_type=="CK1" else "Giữa"} HK1 Tin học {grade}',
        school_year='2026-2027',exam_type=exam_type,owner_name='',lessons=[],requirements=[],slots=[]),ppct)
    issues=[dict(code='compact_reconciliation_required',message='Bản xem trước mẫu 10/6 cột chưa được xác nhận. Cần đối chiếu bài, YCCĐ, mã câu và điểm trước khi lưu/khóa hoặc sinh đề.')]
    def issue(code,message):
        if not any(i['code']==code and i['message']==message for i in issues):issues.append(dict(code=code,message=message))
    matrix_counts={};matrix_cells=[];matrix_rows=[]
    columns=[(3,'MC','Biết'),(4,'MC','Hiểu'),(5,'ES','Vận dụng'),(6,'ES','Vận dụng cao')] if profile=='THCS' else [(2,'MC','Biết'),(3,'MC','Hiểu'),(4,'YN','Biết'),(5,'YN',None),(6,'ES','Vận dụng'),(7,'ES','Vận dụng cao')]
    for ri,row in enumerate(mt.rows[1 if profile=='THCS' else 2:],start=1 if profile=='THCS' else 2):
        values=[c.text.strip() for c in row.cells]
        if not re.fullmatch(r'\d+',values[0]):continue
        title=values[2 if profile=='THCS' else 1];topic=values[1]
        lesson=_compact_exact_lesson(title,grade,ppct)
        source_index=len(m['lessons'])
        m['lessons'].append(dict(source_index=source_index,lesson_code=(lesson or {}).get('lesson_code',''),title=title,topic=topic,spec_title='',spec_topic=''))
        if not lesson:issue('source_mapping_ambiguous',f'Hàng ma trận {ri+1}: chưa có đối chiếu bài học chính xác với PPCT; không tự chọn bài gần nhất.')
        row_count=0;row_counts_complete=True
        for ci,kind,level in columns:
            text=values[ci];count=_compact_count(text)
            if count is None or count>500:
                row_counts_complete=False;issue('source_count_ambiguous',f'Hàng ma trận {ri+1}, cột {ci+1}: số câu/ý chưa rõ hoặc vượt giới hạn.');continue
            row_count+=count
            if level is not None:matrix_counts.setdefault(kind,{}).setdefault(level,0);matrix_counts[kind][level]+=count
            elif count:issue('source_level_ambiguous',f'Hàng ma trận {ri+1}, cột {ci+1}: nguồn gộp Hiểu/VD; cần phân mức từng ý, không tự gán mức.')
            if not count:continue
            groups=re.findall(r'\(([^)]+)\)',text)
            ref_text=';'.join(groups)
            ref_text=re.sub(r'\s*[,;]?\s*\d+(?:[.,]\d+)?\s*(?:điểm|đ)\s*','',ref_text,flags=re.I)
            refs=_compact_refs(ref_text,kind)
            points_match=re.findall(r'(\d+(?:[.,]\d+)?)\s*(?:điểm|đ)(?!\w)',text,re.I)
            point=float(points_match[0].replace(',','.')) if len(points_match)==1 else None
            if refs is None or not refs:issue('source_refs_ambiguous',f'Hàng ma trận {ri+1}, cột {ci+1}: mã câu chưa liệt kê riêng hoặc có dải mã; không tự mở rộng dải.')
            elif len(refs)!=count:issue('source_count_disagreement',f'Hàng ma trận {ri+1}, cột {ci+1}: số mã câu không bằng số câu/ý đã ghi.')
            if point is None:issue('source_points_ambiguous',f'Hàng ma trận {ri+1}, cột {ci+1}: cần xác nhận điểm cho từng vị trí, không tự chia tổng điểm.')
            matrix_cells.append(dict(source_index=source_index,kind=kind,level=level,count=count,refs=refs,points=point))
        if profile=='THCS' and row_counts_complete and _compact_count(values[7])!=row_count:issue('source_count_disagreement',f'Hàng ma trận {ri+1}: tổng số câu không bằng các ô phân bố.')
        row_cells=[cell for cell in matrix_cells if cell['source_index']==source_index]
        if row_counts_complete and row_cells and all(cell['points'] is not None for cell in row_cells):
            declared=plain(values[8]).replace(',','.')
            if re.fullmatch(r'\d+(?:\.\d+)?(?:\s*d)?',declared):
                declared_points=float(re.match(r'\d+(?:\.\d+)?',declared).group())
                if abs(declared_points-sum(cell['points'] for cell in row_cells))>.0001:
                    issue('source_points_disagreement',f'Hàng ma trận {ri+1}: tổng điểm nguồn khác tổng điểm tường minh trong các ô; giữ nguyên để đối chiếu.')
            else:issue('source_points_ambiguous',f'Hàng ma trận {ri+1}: tổng điểm nguồn chưa rõ; cần đối chiếu.')
        matrix_rows.append(dict(source_index=source_index,source_row=ri,declared_total=values[7] if profile=='THCS' else None,declared_points=values[8],declared_ratio=values[9]))
    if not matrix_rows:issue('source_rows_missing','Bảng ma trận chưa có hàng dữ liệu được nhận dạng; cần đối chiếu thủ công.')
    spec_counts={};spec_refs={};spec_counts_complete=True;current_title='';current_lesson=None;current_index=None
    for ri,row in enumerate(st.rows[1:],start=1):
        values=[c.text.strip() for c in row.cells]
        if plain(values[0]).startswith(('tong','ti le')):continue
        if values[1]:
            current_title=values[1];current_lesson=_compact_exact_lesson(current_title,grade,ppct)
            candidates=[l for l in m['lessons'] if plain(l['title'])==plain(current_title)]
            current_index=candidates[0]['source_index'] if len(candidates)==1 else None
        if not values[3]:continue
        level=_compact_level(values[2]);code=(current_lesson or {}).get('lesson_code','')
        if not level:issue('source_level_ambiguous',f'Hàng đặc tả {ri+1}: mức độ chưa rõ hoặc gộp nhiều mức; cần đối chiếu.')
        if current_index is None or not code:issue('source_mapping_ambiguous',f'Hàng đặc tả {ri+1}: bài/nhóm bài chưa khớp duy nhất với ma trận và PPCT.')
        outcomes=(current_lesson or {}).get('outcomes',[])
        outcome_indices=[i for i,v in enumerate(outcomes) if plain(v)==plain(values[3])]
        outcome=outcome_indices[0] if len(outcome_indices)==1 else None
        if outcome is None:issue('source_mapping_ambiguous',f'Hàng đặc tả {ri+1}: YCCĐ chưa khớp chính xác duy nhất với PPCT; cần chọn tường minh.')
        rid=f'RC{ri}'
        m['requirements'].append(dict(id=rid,source_index=current_index,lesson_code=code if current_index is not None else '',level=level or '',text=values[3],ppct_outcome_index=outcome,competency='NLa',choice_group=None))
        refs=_compact_refs(values[5]);count=_compact_count(values[4])
        if not refs or count!=len(refs) or not level:spec_counts_complete=False
        if count is None or count>500:issue('source_count_ambiguous',f'Hàng đặc tả {ri+1}: số câu/ý chưa rõ hoặc vượt giới hạn.')
        if refs is None or not refs:issue('source_refs_ambiguous',f'Hàng đặc tả {ri+1}: mã câu chưa rõ, có dải mã hoặc trộn dạng; không tự suy số câu.')
        elif count!=len(refs):issue('source_count_disagreement',f'Hàng đặc tả {ri+1}: số mã câu không bằng số câu/ý đã ghi.')
        if refs and level:
            for ref in refs:
                kind=ref[0];spec_counts.setdefault(kind,{}).setdefault(level,0);spec_counts[kind][level]+=1
                if ref in spec_refs:issue('source_mapping_ambiguous',f'Hàng đặc tả {ri+1}: mã câu lặp, cần đối chiếu YCCĐ tường minh.')
                else:spec_refs[ref]=(rid,current_index,level)
    for kind in sorted(matrix_counts.keys()|spec_counts.keys()) if spec_counts_complete else []:
        levels=matrix_counts.get(kind,{})
        for level in sorted(levels.keys()|spec_counts.get(kind,{}).keys()):
            count=levels.get(level,0)
            if count!=spec_counts.get(kind,{}).get(level,0):issue('source_count_disagreement',f'{kind}, {level}: phân bố ma trận khác các mã câu đã đọc rõ trong đặc tả.')
    # Slots require exact identity on both tables, exact PPCT outcomes and explicit
    # source points. A partial/ambiguous source stays a preview, never a guess.
    proposed=[];seen=set()
    for cell in matrix_cells:
        refs=cell['refs'] or []
        if cell['count']!=len(refs) or cell['points'] is None:continue
        if cell['count']!=1:
            issue('source_points_ambiguous','Ô nguồn có nhiều câu/ý và chỉ có tổng điểm; cần xác nhận điểm từng vị trí.');continue
        for ref in refs:
            mapped=spec_refs.get(ref)
            if ref in seen or not mapped or mapped[1:]!=(cell['source_index'],cell['level']):
                issue('source_mapping_ambiguous','Mã câu giữa ma trận và đặc tả chưa khớp duy nhất theo bài và mức độ.');continue
            seen.add(ref);kind,number,label=ref
            if kind=='YN' or label:
                issue('source_mapping_ambiguous','Các ý con cần đối chiếu nhóm câu và điểm từng ý trước khi dựng vị trí.');continue
            ident=f'{kind}-{number}'
            proposed.append(dict(id=ident,kind=kind,number=number,scoring=dict(mode='sum_parts'),parts=[dict(id=ident+'-P',label='',requirement_id=mapped[0],points=cell['points'],indicator='',source_index=cell['source_index'],source_level=cell['level'])]))
    if len(issues)==1:
        total=sum(p['parts'][0]['points'] for p in proposed)
        if abs(total-10)>.0001:issue('source_points_disagreement','Tổng điểm các vị trí nguồn đọc rõ chưa bằng 10; cần đối chiếu trước khi dựng vị trí.')
        else:m['slots']=sorted(proposed,key=lambda s:(('MC','YN','ES').index(s['kind']),s['number']))
    raw_tables=[_raw_table(mt,mi),_raw_table(st,si)];digest=hashlib.sha256(raw).hexdigest()
    notes=['Mẫu 10/6 cột: mọi ánh xạ chưa rõ được giữ để đối chiếu; bản xem trước không xác nhận nguồn và không cho phép suy ra khả năng sinh đề.']
    m['source']=dict(name=PurePosixPath(filename.replace('\\','/')).name,sha256=digest,tables=raw_tables,notes=[],comparison_notes=notes,
        compact=dict(layout='10/6',matrix_counts=matrix_counts,matrix_rows=matrix_rows))
    m['reconciliation']=dict(confirmed=False,issues=issues)
    return dict(candidate=m,raw_tables=raw_tables,issues=issues,comparison_notes=notes,source_sha256=digest)


def inspect_docx(raw,filename,grade,ppct):
    if type(grade) is not int or grade not in (8,9,10):raise ServiceError('Chọn khối trước khi nhập mẫu.')
    if not isinstance(raw,bytes) or not 0<len(raw)<=MAX_UPLOAD_BYTES:raise ServiceError('Tệp Word trống hoặc lớn hơn 8 MB.')
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            entries=z.infolist()
            if len(entries)>MAX_ENTRIES or sum(x.file_size for x in entries)>MAX_UNCOMPRESSED_BYTES:raise ServiceError('Tệp Word chứa quá nhiều dữ liệu nén.')
            for e in entries:
                if '..' in PurePosixPath(e.filename).parts or e.filename.startswith('/') or '\\' in e.filename or (e.file_size and e.file_size/max(1,e.compress_size)>1000):
                    raise ServiceError('Cấu trúc tệp Word không an toàn.')
            xml=z.read('word/document.xml')
            if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():raise ServiceError('Không nhận Word có khai báo thực thể ngoài.')
        doc=Document(io.BytesIO(raw))
    except ServiceError:raise
    except Exception as exc:raise ServiceError('Không đọc được tệp DOCX hợp lệ.') from exc
    header=' '.join(p.text for p in doc.paragraphs[:6])
    if doc.tables and len(doc.tables[0].columns)==2:
        header+=' '+' '.join(c.text for r in doc.tables[0].rows[:2] for c in r.cells)
    found=re.search(r'tin\s+hoc\s*(\d+)',plain(header))
    if found and int(found.group(1))!=grade:raise ServiceError('Khối đã chọn khác khối ghi trong mẫu.')
    compact=[(i,t,_compact_layout(t)) for i,t in enumerate(doc.tables)]
    compact_m=[v for v in compact if v[2] in ('THCS','THPT')]
    compact_s=[v for v in compact if v[2] in ('THCS-spec','THPT-spec')]
    if compact_m or compact_s:
        if len(compact_m)!=1 or len(compact_s)!=1 or compact_s[0][2]!=compact_m[0][2]+'-spec':
            raise ServiceError('Mẫu 10/6 cột cần đúng một cặp ma trận/đặc tả cùng cấp học, đủ tiêu đề cột. Hãy đối chiếu nguồn.')
        return _inspect_compact(raw,filename,grade,ppct,(compact_m[0],compact_s[0]),header)
    matrices=[];specs=[]
    for i,t in enumerate(doc.tables):
        head=plain(' '.join(c.text for r in t.rows[:3] for c in r.cells))
        if 'muc' in head and ('danh gia' in head or 'nhan thuc' in head):
            if 'yeu' in head:specs.append((i,t))
            elif 'tnkq' in head:matrices.append((i,t))
    if len(matrices)!=1 or len(specs)!=1:raise ServiceError('Chưa nhận dạng được cặp ma trận/đặc tả theo hai mẫu trường. Hãy kiểm tra mẫu hoặc nhập tay.')
    mi,mt=matrices[0];si,st=specs[0]
    profile='THPT' if len(mt.columns)==16 else 'THCS' if len(mt.columns)==13 else None
    if profile is None:raise ServiceError('Số nhóm cột chưa thuộc mẫu THCS/THPT đã hỗ trợ.')
    selected=[(mi,mt),(si,st)] if profile=='THCS' else [(i,t) for i,t in enumerate(doc.tables) if i<=si]
    if profile=='THPT' and len(selected)!=4:raise ServiceError('Mẫu THPT cần đủ bốn bảng ma trận, phân bố năng lực, chỉ báo và đặc tả.')
    raw_tables=[_raw_table(t,i) for i,t in selected]
    data_rows=[]
    for row in mt.rows[3:]:
        vals=[c.text.strip() for c in row.cells]
        if len(vals)>3 and vals[2] and not plain(vals[0]).startswith(('tong','ti le')) and not plain(vals[2]).startswith(('tong','ti le')):
            data_rows.append(vals)
    spec_rows=[]
    for row in st.rows[3:]:
        vals=[c.text.strip() for c in row.cells]
        if len(vals)>4 and vals[2] and re.search(r'nhan biet|thong hieu|van dung',plain(vals[3])):spec_rows.append(vals)
    if len(data_rows)!=len(spec_rows):raise ServiceError('Số bài giữa ma trận và đặc tả khác nhau; cần đối chiếu thủ công trước khi nhập.')
    m=normalize_matrix(dict(grade=grade,mode='received',profile=profile,
        title=f'Ma trận Giữa HK1 Tin học {grade}',school_year='2026-2027',exam_type='GK1',
        owner_name='',lessons=[],requirements=[],slots=[]),ppct)
    issues=[];comparison_notes=[];bullet_refs={}
    spec_head=plain(' '.join(c.text for r in st.rows[:1] for c in r.cells))
    if 'nhan thuc' in spec_head and 'danh gia' not in spec_head:
        comparison_notes.append('Bảng đặc tả dùng tiêu đề nhóm cột “Số câu hỏi theo mức độ nhận thức”; bảng ma trận dùng “Mức độ đánh giá”.')
    for index,(row,spec) in enumerate(zip(data_rows,spec_rows)):
        code=_lesson_match(row[2],grade,ppct)
        m['lessons'].append(dict(source_index=index,lesson_code=code,title=row[2],topic=row[1],spec_title=spec[2],spec_topic=spec[1]))
        if plain(row[1])!=plain(spec[1]):
            comparison_notes.append(f'Bài {index+1}: Ma trận ghi “{row[1]}”, Bảng đặc tả ghi “{spec[1]}”.')
        reqs,bmap=_requirements(spec[3],index,code,grade,ppct)
        for (lvl,ref),rid in bmap.items():bullet_refs[(index,lvl,ref)]=rid
        comp=re.search(r'NL[abcde]',spec[4]+' '+spec[-1])
        for r in reqs:r['competency']=comp.group(0) if comp else 'NLa'
        m['requirements'].extend(reqs)
    if profile=='THPT':
        seen=set()
        for row in selected[2][1].rows[1:]:
            vals=[c.text.strip() for c in row.cells]
            for j,v in enumerate(vals[:-1]):
                if re.fullmatch(r'[ABC][CIS]\d+',v) and v not in seen:
                    seen.add(v);m['indicator_catalog'].append(dict(code=v,competency='NL'+dict(A='a',B='b',C='c')[v[0]],text=vals[j+1]))
    counters=dict(MC=0,YN=0,ES=0);groups={}
    for index,row in enumerate(data_rows):
        for kind,start in ([('MC',3),('ES',6)] if profile=='THCS' else [('MC',3),('YN',6),('ES',9)]):
            for li,level in enumerate(LEGACY_LEVELS):
                cell=row[start+li];match=re.match(r'\s*(\d+)',cell)
                count=int(match.group(1)) if match else 0
                if not count:continue
                if count>500 or (kind=='ES' and profile=='THPT' and count>26) or len(m['slots'])+count>500:raise ServiceError('Số câu/ý vượt giới hạn đọc mẫu (500 vị trí, tối đa 26 ý tự luận/câu).')
                refs=re.findall(r'(\d+)([a-d]?)',' '.join(re.findall(r'\(([^)]+)\)',cell)))
                available=[r for r in m['requirements'] if r['source_index']==index and r['level']==level]
                default_rid=available[0]['id'] if available else ''
                if kind=='MC':
                    for j in range(count):
                        counters[kind]+=1;n=int(refs[j][0]) if j<len(refs) else counters[kind]
                        rid=bullet_refs.get((index,level,f'MC-{n}'),default_rid)
                        m['slots'].append(dict(id=f'MC-{n}',kind=kind,number=n,scoring=dict(mode='sum_parts'),
                            parts=[dict(id=f'MC-{n}-P',label='',requirement_id=rid,points=.25,indicator='',source_index=index,source_level=level)]))
                elif kind=='ES':
                    if profile=='THCS':
                        for j in range(count):
                            counters[kind]+=1;n=counters[kind]
                            rid=bullet_refs.get((index,level,f'ES-{n}'),default_rid)
                            m['slots'].append(dict(id=f'ES-{n}',kind=kind,number=n,scoring=dict(mode='sum_parts'),
                                parts=[dict(id=f'ES-{n}-P',label='',requirement_id=rid,points=1,indicator='',source_index=index,source_level=level)]))
                    else:
                        counters[kind]+=1;n=int(refs[0][0]) if refs else counters[kind]
                        rid=bullet_refs.get((index,level,f'ES-{n}'),default_rid)
                        m['slots'].append(dict(id=f'ES-{n}',kind=kind,number=n,scoring=dict(mode='sum_parts'),
                            parts=[dict(id=f'ES-{n}-{j}',label=chr(97+j),requirement_id=rid,points=.25,indicator='',source_index=index,source_level=level) for j in range(count)]))
                else:
                    if len(refs)!=count:
                        issues.append(dict(code='source_yn_refs',message='Chưa đọc đủ số câu/ý Đúng/Sai từ ô nguồn.'));continue
                    for n,label in refs:
                        key=int(n)
                        rid=bullet_refs.get((index,level,f'YN-{key}'),default_rid)
                        if key not in groups:groups[key]=dict(id=f'YN-{key}',kind='YN',number=key,parts=[],scoring=dict(mode='sum_parts'))
                        groups[key]['parts'].append(dict(id=f'YN-{key}-{label}',label=label,requirement_id=rid,points=.25,indicator='',source_index=index,source_level=level))
    for g in groups.values():g['parts'].sort(key=lambda p:p['label']);m['slots'].append(g)
    m['slots'].sort(key=lambda s:('MC','YN','SHORT','ES').index(s['kind'])*10000+s['number'])
    def leading(text):
        found=re.match(r'\s*(\d+(?:[.,]\d+)?)',text)
        return float(found.group(1).replace(',','.')) if found else 0
    spec_counts={k:[0,0,0] for k in ('MC','YN','ES','SHORT')}
    matrix_counts={k:[0,0,0] for k in ('MC','YN','ES','SHORT')}
    for index,(row,spec) in enumerate(zip(data_rows,spec_rows)):
        expected={k:[0,0,0] for k in matrix_counts};actual={k:[0,0,0] for k in matrix_counts}
        for kind,start in ([('MC',3),('ES',6)] if profile=='THCS' else [('MC',3),('YN',6),('ES',9)]):
            expected[kind]=[int(leading(row[start+j])) for j in range(3)]
        for n,level in re.findall(r'(\d+)\s*MC\s*\(\s*(B|H|VD|V)\s*\)',spec[4],re.I):
            actual['MC'][{'B':0,'H':1,'VD':2,'V':2}[level.upper()]]+=int(n)
        for n,labels in re.findall(r'(\d+)\s*YN\s*\(([^)]+)\)',spec[5],re.I):
            for level in re.findall(r'\b(B|H|VD|V)\b',labels,re.I):actual['YN'][{'B':0,'H':1,'VD':2,'V':2}[level.upper()]]+=int(n)
        actual['ES'][2]=sum(int(n) for n in re.findall(r'(\d+)\s*ES',spec[-1],re.I))
        actual['SHORT'][0]=int(leading(spec[-2]))
        for kind in expected:
            for j,level in enumerate(LEGACY_LEVELS):
                matrix_counts[kind][j]+=expected[kind][j];spec_counts[kind][j]+=actual[kind][j]
                if expected[kind][j]!=actual[kind][j]:issues.append(dict(code='source_count_disagreement',message=f'Bài {index+1}, {kind}, {level}: ma trận ghi {expected[kind][j]}, đặc tả ghi {actual[kind][j]}. Cần xác minh nguồn.'))
    # Reconcile explicit summary rows, rather than replacing declared values.
    starts={'MC':3,'ES':6} if profile=='THCS' else {'MC':3,'YN':6,'ES':9}
    end=9 if profile=='THCS' else 12
    for source_row in mt.rows[3:]:
        vals=[c.text.strip() for c in source_row.cells];name=plain(vals[0])
        if name.startswith('tong so cau') or name.startswith('tong so diem'):
            is_points=name.startswith('tong so diem');expected_levels=[0,0,0]
            for kind,start in starts.items():
                factor=(1 if profile=='THCS' and kind=='ES' else .25) if is_points else 1
                for j in range(3):
                    value=matrix_counts[kind][j]*factor;expected_levels[j]+=value
                    if abs(leading(vals[start+j])-value)>.0001:issues.append(dict(code='source_count_disagreement',message=f'Dòng tổng {"điểm" if is_points else "câu/ý"} của {kind}, {LEGACY_LEVELS[j]} không khớp các ô phân bố.'))
            for j,value in enumerate(expected_levels):
                if abs(leading(vals[end+j])-value)>.0001:issues.append(dict(code='source_count_disagreement',message=f'Tổng chung mức {LEGACY_LEVELS[j]} trong nguồn không khớp các ô phân bố.'))
            if profile=='THPT' and abs(leading(vals[-1])-sum(expected_levels))>.0001:issues.append(dict(code='source_count_disagreement',message='Tổng toàn đề trong nguồn không khớp các ô phân bố.'))
        elif name.startswith('ti le'):
            for kind,start in starts.items():
                factor=1 if profile=='THCS' and kind=='ES' else .25
                value=sum(matrix_counts[kind])*factor*10
                if abs(leading(vals[start])-value)>.0001:issues.append(dict(code='source_count_disagreement',message=f'Tỉ lệ {kind} trong nguồn không khớp điểm phân bố.'))
    for source_row in st.rows[3:]:
        vals=[c.text.strip() for c in source_row.cells]
        row_name=plain(vals[0])
        if row_name=='tong':
            for kind,pos in [('MC',4),('YN',5),('ES',len(vals)-1)]:
                for n,level in re.findall(r'(\d+)\s*(?:cau|lenh|y)?\s*(B|H|VD|V)\b',plain(vals[pos]),re.I):
                    li={'B':0,'H':1,'VD':2,'V':2}[level.upper()]
                    if int(n)!=spec_counts[kind][li]:issues.append(dict(code='source_count_disagreement',message=f'Dòng tổng đặc tả {kind}, {LEGACY_LEVELS[li]} không khớp các ô chi tiết.'))
        elif row_name.startswith('ti le %'):
            for n,level in re.findall(r'(\d+)\s*(B|H|VD|V)\s*=',plain(vals[4]),re.I):
                li={'B':0,'H':1,'VD':2,'V':2}[level.upper()]
                total_level=sum(spec_counts[k][li] for k in spec_counts)
                if int(n)!=total_level:
                    comparison_notes.append(f'Dòng tỉ lệ % bảng đặc tả ghi “{n}{level.upper()}”, trong khi dòng Tổng đặc tả ghi {total_level} câu/ý mức {LEGACY_LEVELS[li]}.')
    matrix_es=sum(len(s['parts']) for s in m['slots'] if s['kind']=='ES')
    spec_es=sum(int(x.group(1)) for r in spec_rows for x in re.finditer(r'(\d+)\s*ES',r[-1]))
    if matrix_es!=spec_es:issues.append(dict(code='source_essay_disagreement',message=f'Tự luận: ma trận có {matrix_es} ý, các ô đặc tả cộng thành {spec_es} ý. Cần người phụ trách xác minh, không tự sửa nguồn.'))
    # Match source competency entries to slots; a missing mapping stays visible.
    if profile=='THPT':
        mode=None;current_number=None
        for row in selected[1][1].rows[4:]:
            vals=[c.text.strip() for c in row.cells]
            label=plain(vals[0])
            if 'nlc' in label:mode='MC'
            elif 's' in label and 'tnkq' in label:mode='YN'
            elif 'tu luan' in label:mode='ES'
            match=re.search(r'(\d+)',vals[1])
            if match:current_number=int(match.group(1))
            labels=[v for v in vals[2:3] if v in list('abcd')]
            code=next((v for v in vals[2:] if re.fullmatch(r'[ABC][CIS]\d+',v)),None)
            target=next((s for s in m['slots'] if s['kind']==mode and s['number']==current_number),None)
            if target and code:
                for part in target['parts']:
                    if mode!='YN' or (labels and part['label']==labels[0]):part['indicator']=code
    if len(doc.tables)>len(selected):
        comparison_notes.append(f'Tệp gốc có {len(doc.tables)} bảng; ứng dụng chỉ lấy {len(selected)} bảng ma trận/đặc tả và bỏ qua phần khung đề/hướng dẫn chấm đi kèm.')
    notes=[p.text for p in doc.paragraphs if plain(p.text).startswith(('luu y','cac cau hoi','- o muc','- cac cau hoi'))]
    digest=hashlib.sha256(raw).hexdigest()
    m['source']=dict(name=PurePosixPath(filename.replace('\\','/')).name,sha256=digest,tables=raw_tables,notes=notes,comparison_notes=comparison_notes)
    m['reconciliation']=dict(confirmed=False,issues=issues)
    return dict(candidate=m,raw_tables=raw_tables,issues=issues,comparison_notes=comparison_notes,source_sha256=digest)
