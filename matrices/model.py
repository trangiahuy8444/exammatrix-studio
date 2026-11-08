from __future__ import annotations
import copy
import hashlib
import json
import re
from collections import defaultdict
from decimal import Decimal
from bank_service import ServiceError, number

LEVELS = ('Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao')
KINDS = ('MC', 'YN', 'SHORT', 'ES')
from domain.profiles import KIND_LABELS, allowed_kinds
from domain.scoring import policy_table
from domain.matrix_checks import ratio_warnings

CONTENT_FIELDS = ('profile', 'grade', 'school_year', 'exam_type', 'duration', 'title',
                  'owner_name', 'campus', 'total_points', 'lessons', 'requirements',
                  'slots', 'indicator_catalog', 'source', 'reconciliation', 'mode')


# B3: chỉ tính vào hash khi có mặt, để hash của các ma trận đã khóa trước đây không đổi.
OPTIONAL_CONTENT_FIELDS = ('allowed_kinds', 'scoring_policy', 'ratio_tolerance')


def matrix_digest(matrix):
    body = {k: matrix.get(k) for k in CONTENT_FIELDS}
    body.update({k: matrix[k] for k in OPTIONAL_CONTENT_FIELDS if k in matrix})
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False,
                                    allow_nan=False, separators=(',', ':')).encode()).hexdigest()


def normalize_matrix(payload, ppct):
    if not isinstance(payload, dict):
        raise ServiceError('Hồ sơ ma trận phải là một đối tượng.')
    m = copy.deepcopy(payload)
    for key, value in dict(id='', family_id='', version=1, revision=0, status='draft',
                          mode='authored', profile='THCS', school_year='2026-2027',
                          exam_type='GK1', duration=45, total_points=10, campus='Cao Thắng',
                          owner_name='', title='', lessons=[], requirements=[], slots=[],
                          indicator_catalog=[], source=None, audit=[],
                          reconciliation=dict(confirmed=True, issues=[])).items():
        m.setdefault(key, copy.deepcopy(value))
    return m


def _points(part):
    try:
        return number(part.get('points'), 'Điểm')
    except ServiceError:
        return Decimal(0)


def matrix_view(matrix):
    requirements = {r['id']: copy.deepcopy(r) for r in matrix.get('requirements', [])}
    for r in requirements.values():
        r['refs'] = []
    rows = []
    lookup = {}
    for lesson in matrix.get('lessons', []):
        row = dict(lesson_code=lesson['lesson_code'], title=lesson['title'], topic=lesson['topic'],
                   cells={}, points=Decimal(0), counts={level: 0 for level in LEVELS})
        lookup[row['lesson_code']] = row; rows.append(row)
    totals = dict(points=Decimal(0), questions=0, items=0,
                  by_kind={k: dict(questions=0, items=0, points=Decimal(0)) for k in KINDS},
                  by_level={k: dict(items=0, points=Decimal(0)) for k in LEVELS})
    competencies = []
    for slot in matrix.get('slots', []):
        kind = slot['kind']
        if kind not in KINDS:
            continue
        totals['questions'] += 1; totals['by_kind'][kind]['questions'] += 1
        for part in slot.get('parts', []):
            req = requirements.get(part.get('requirement_id'))
            if req is None or req.get('lesson_code') not in lookup or req.get('level') not in LEVELS:
                continue
            label = str(slot['number']) + str(part.get('label', ''))
            if label not in req['refs']:
                req['refs'].append(label)
            row = lookup[req['lesson_code']]; points = _points(part); level = req['level']
            cell = row['cells'].setdefault(kind+'|'+level, dict(count=0, refs=[], points=Decimal(0)))
            cell['count'] += 1; cell['refs'].append(label); cell['points'] += points
            row['counts'][level] += 1; row['points'] += points
            totals['items'] += 1; totals['points'] += points
            totals['by_kind'][kind]['items'] += 1; totals['by_kind'][kind]['points'] += points
            totals['by_level'][level]['items'] += 1; totals['by_level'][level]['points'] += points
            competencies.append(dict(kind=kind, number=slot['number'], label=part.get('label',''),
                level=level, competency=req.get('competency',''), indicator=part.get('indicator','')))
    denominator = number(matrix.get('total_points', 10), 'Tổng điểm')
    for row in rows:
        row['percentage'] = float(row['points'] / denominator * 100) if denominator else 0
    def serial(value):
        if isinstance(value, Decimal): return float(value)
        if isinstance(value, dict): return {k: serial(v) for k,v in value.items()}
        if isinstance(value, list): return [serial(v) for v in value]
        return value
    return serial(dict(rows=rows, requirements=list(requirements.values()), totals=totals,
                       competencies=competencies, indicator_catalog=matrix.get('indicator_catalog', [])))


def validate_matrix(matrix, ppct, for_lock=False):
    errors, warnings = [], []
    def error(code, path, message): errors.append(dict(code=code, path=path, message=message))
    if not isinstance(matrix, dict):
        return dict(valid=False, errors=[dict(code='shape', path='', message='Hồ sơ không đúng định dạng.')], warnings=[], totals={}, exam_supported=False)
    m = matrix
    arrays = {}
    for key in ('lessons','requirements','slots','indicator_catalog'):
        value=m.get(key)
        if not isinstance(value,list) or any(not isinstance(v,dict) for v in value):
            error('shape',key,'Danh sách không đúng định dạng.');arrays[key]=[]
        else: arrays[key]=value
    subj = m.get('subject_name') or 'Tin học'
    catalog = {}
    for x in ppct.get('lessons', []):
        x_subj = x.get('subject_name') or 'Tin học'
        if x_subj == subj or (subj == 'Tin học' and 'subject_name' not in x):
            catalog[(x['grade'], x['lesson_code'])] = x
        if (x['grade'], x['lesson_code']) not in catalog:
            catalog[(x['grade'], x['lesson_code'])] = x
    grade=m.get('grade') if type(m.get('grade')) is int else None
    context = ppct.get('_context', {})
    if type(m.get('grade')) is not int or m['grade'] not in context.get('allowed_grades', (8,9,10)): error('grade','grade','Khối không thuộc chương trình đã chọn.')
    if m.get('profile') not in (('GENERAL',) if context and not context.get('school_profile', True) else ('THCS','THPT')): error('profile','profile','Chọn mẫu THCS hoặc THPT.')
    if m.get('mode') not in ('authored','received'): error('mode','mode','Chọn biên soạn hoặc nhận nguồn.')
    if m.get('exam_type') not in ('TX','GK1','CK1','GK2','CK2'):error('exam_type','exam_type','Kỳ kiểm tra không hợp lệ.')
    if type(m.get('duration')) is not int or not 1<=m['duration']<=300:error('duration','duration','Thời gian phải từ 1 đến 300 phút.')
    for key in ('title','school_year'):
        if not isinstance(m.get(key),str) or not m[key].strip():error('required',key,'Cần nhập '+key+'.')
    try:
        if number(m.get('total_points'),'Tổng điểm') != 10:error('total','total_points','Tổng điểm phải bằng 10.')
    except ServiceError:error('points','total_points','Tổng điểm không hợp lệ.')
    lessons = {}
    for l in arrays['lessons']:
        code=l.get('lesson_code')
        if not isinstance(code,str) or code in lessons or (grade,code) not in catalog:
            error('lesson','lessons','Bài học trùng hoặc không thuộc PPCT của khối.');continue
        if not all(isinstance(l.get(k),str) and l[k].strip() for k in ('title','topic')):error('lesson_title','lessons','Cần tên bài và chủ đề.')
        lessons[code]=l
    reqs={}
    for r in arrays['requirements']:
        ident=r.get('id');code=r.get('lesson_code');i=r.get('ppct_outcome_index')
        if not isinstance(ident,str) or not ident or ident in reqs:error('requirement_id','requirements','Mã YCCĐ trống hoặc trùng.');continue
        reqs[ident]=r
        if not isinstance(code,str) or code not in lessons:error('lesson','requirements.'+ident,'YCCĐ chưa gắn bài hợp lệ.');continue
        if m.get('mode')=='received' and 'source_index' in r:
            linked=next((l for l in arrays['lessons'] if l.get('source_index')==r['source_index']),None)
            if not linked or linked.get('lesson_code')!=code:error('received_scope','requirements.'+ident,'YCCĐ phải giữ bài nguồn đã đối chiếu.')
        if not isinstance(r.get('text'),str) or not r['text'].strip():error('requirement_text','requirements.'+ident,'Cần nội dung YCCĐ.')
        if r.get('level') not in LEVELS:error('level','requirements.'+ident,'Mức độ không hợp lệ.')
        source=catalog.get((grade,code),{})
        if type(i) is not int or not 0<=i<len(source.get('outcomes',[])):error('outcome','requirements.'+ident,'Chọn YCCĐ nguồn trong PPCT đúng khối.')
        if r.get('competency') not in context.get('competencies', ('NLa','NLb','NLc','NLd','NLe')):error('competency','requirements.'+ident,'Chọn thành phần năng lực hợp lệ.')
    indicators={r.get('code'):r for r in arrays['indicator_catalog'] if isinstance(r.get('code'),str)}
    ids=set(); numbers=defaultdict(list);total=Decimal(0);exam_supported=True
    try:
        kinds_allowed=allowed_kinds(m)
    except ServiceError as exc:
        error('allowed_kinds','allowed_kinds',exc.error);kinds_allowed=KINDS
    try:
        warnings.extend(ratio_warnings(m))  # B4: cảnh báo tỉ lệ CV 7991, không chặn
    except ServiceError as exc:
        error('ratio_tolerance','ratio_tolerance',exc.error)
    if 'scoring_policy' in m:
        try:policy_table(m['scoring_policy'])
        except ServiceError as exc:error('scoring_policy','scoring_policy',exc.error)
    req_scope={r.get('id'):(r.get('lesson_code'),r.get('level')) for r in arrays['requirements'] if isinstance(r,dict)}
    for s in arrays['slots']:
        sid=s.get('id');kind=s.get('kind');n=s.get('number');parts=s.get('parts')
        if not isinstance(sid,str) or not sid or sid in ids:error('slot_id','slots','Mã vị trí trống hoặc trùng.')
        else:ids.add(sid)
        if kind not in KINDS:error('kind','slots','Dạng câu không hợp lệ.');continue
        if type(n) is not int or n<1:error('number','slots','Số câu phải là số nguyên dương.')
        else:numbers[kind].append(n)
        if not isinstance(parts,list) or not parts or any(not isinstance(p,dict) for p in parts):error('parts','slots','Câu cần danh sách yêu cầu con.');continue
        if kind in ('MC','SHORT') and len(parts)!=1:error('parts','slots','MC/trả lời ngắn chỉ có một vị trí.')
        labels=[p.get('label','') for p in parts]
        if kind=='YN' and labels!=list('abcd'):error('yn_labels','slots','Đúng/Sai phải có đủ ý a, b, c, d theo thứ tự.')
        if len(labels)!=len(set(str(x) for x in labels)):error('labels','slots','Nhãn ý bị trùng.')
        # B3: Đ/S và trả lời ngắn tạo đề tự động được khi cả câu thuộc một bài, một mức độ.
        if kind in ('YN','SHORT') and len({req_scope.get(p.get('requirement_id')) for p in parts})!=1:exam_supported=False
        if kind not in kinds_allowed:error('profile_kind','slots',f'Mẫu hồ sơ này không có dạng {KIND_LABELS[kind]}; chọn mẫu khác hoặc khai báo dạng câu được phép (KTTX).')
        if not isinstance(s.get('scoring'),dict) or s['scoring'].get('mode')!='sum_parts':error('scoring','slots','Cần xác nhận cách tính điểm theo từng ý.')
        partids=set()
        for p in parts:
            pid=p.get('id')
            if not isinstance(pid,str) or not pid or pid in partids:error('part_id','slots','Mã ý trống hoặc trùng.')
            else:partids.add(pid)
            if not isinstance(p.get('label',''),str) or not re.fullmatch('[a-z]?',p.get('label','')):error('labels','slots','Nhãn ý phải là một chữ cái a–z hoặc để trống cho câu đơn.')
            rid=p.get('requirement_id');r=reqs.get(rid) if isinstance(rid,str) else None
            if r is None:error('unknown_requirement','slots.'+str(sid),'Vị trí chưa gắn YCCĐ hợp lệ.')
            elif m.get('mode')=='received' and 'source_index' in p and (r.get('source_index')!=p['source_index'] or r.get('level')!=p.get('source_level') or ('source_competency' in p and r.get('competency')!=p['source_competency'])):error('received_scope','slots.'+str(sid),'Không được chuyển câu sang bài, mức độ hoặc năng lực khác với nguồn.')
            try:
                points=number(p.get('points'),'Điểm');total+=points
                if points<=0:error('points','slots','Điểm mỗi ý phải lớn hơn 0.')
            except ServiceError:error('points','slots','Điểm mỗi ý phải là số hữu hạn.')
            if m.get('profile')=='THPT':
                ind=indicators.get(p.get('indicator')) if isinstance(p.get('indicator'),str) else None
                if not ind or (r and ind.get('competency')!=r.get('competency')):error('indicator','slots','Mã chỉ báo không thuộc thành phần năng lực đã chọn.')
    for kind,ns in numbers.items():
        if sorted(ns)!=list(range(1,len(ns)+1)):error('number_sequence','slots','Số câu trong mỗi dạng phải liên tục và không trùng.')
    if total!=10:error('total','slots','Phân bố hiện tại chưa đủ đúng 10 điểm.')
    rec=m.get('reconciliation',{})
    if not isinstance(rec,dict):error('shape','reconciliation','Dữ liệu đối chiếu không hợp lệ.');rec={}
    for issue in rec.get('issues',[]) if isinstance(rec.get('issues',[]),list) else []:
        if isinstance(issue,dict):error(issue.get('code','source_issue'),'source',issue.get('message','Nguồn cần đối chiếu.'))
    if for_lock:
        if not rec.get('confirmed'):error('unconfirmed','reconciliation','Chưa xác nhận việc đối chiếu dữ liệu nguồn.')
        for key in ('owner_name','campus'):
            if not isinstance(m.get(key),str) or not m[key].strip():error('required',key,'Cần người phụ trách và cơ sở.')
        if not arrays['slots']:error('empty','slots','Chưa có vị trí câu hỏi.')
    if not errors:
        totals=matrix_view(m)['totals']
    else:totals=dict(points=float(total),questions=len(arrays['slots']),items=sum(len(s.get('parts',[])) for s in arrays['slots'] if isinstance(s.get('parts'),list)))
    return dict(valid=not errors,errors=errors,warnings=warnings,totals=totals,exam_supported=exam_supported)
