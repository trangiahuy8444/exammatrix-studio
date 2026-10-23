from __future__ import annotations
import copy
import math
import random
import uuid
from decimal import Decimal
from bank_service import ServiceError,content_hash,now,normalized
from .model import matrix_digest,validate_matrix
from domain.policies import resolve_similarity


def _usable(bank,service,ident):
    m=service.get(ident);report=validate_matrix(m,bank.catalog,True)
    if m['status']!='locked' or not report['valid']:raise ServiceError('Chọn phiên bản ma trận đã khóa, không còn lỗi đối chiếu.',report)
    if m.get('content_sha256')!=matrix_digest(m):raise ServiceError('Nội dung phiên bản ma trận không còn khớp bản đã khóa.',status=409)
    if not report['exam_supported']:raise ServiceError('Ma trận có dạng Đúng/Sai hoặc trả lời ngắn; bộ tạo đề hiện chưa hỗ trợ. Không đổi dạng hoặc bỏ phần thi.')
    return m


def _eligible(bank,m,slot):
    requirements={r['id']:r for r in m['requirements']}
    reqs=[requirements[p['requirement_id']] for p in slot['parts']]
    lessons={r['lesson_code'] for r in reqs};levels={r['level'] for r in reqs}
    if len(lessons)!=1 or len(levels)!=1:raise ServiceError('Tự luận gồm nhiều bài/mức độ chưa được chọn tự động; cần biên soạn và đối chiếu riêng.')
    lesson=next(iter(lessons));level=next(iter(levels))
    catalog=bank.lessons[(m['grade'],lesson)]
    outcomes={catalog['outcomes'][r['ppct_outcome_index']] for r in reqs}
    return [q for q in bank._load_bank()['questions'] if q['grade']==m['grade'] and
            q['type']==slot['kind'] and q['lesson_code']==lesson and q['level']==level and
            q.get('review_status') in ('approved','content_checked') and q.get('learning_outcome') in outcomes]


def matrix_candidates(bank_service,matrix_service,matrix_id):
    with bank_service.lock:
        m=_usable(bank_service,matrix_service,matrix_id)
        slots=[]
        reqs={r['id']:r for r in m['requirements']}
        for s in m['slots']:
            qs=_eligible(bank_service,m,s)
            slots.append(dict(slot=copy.deepcopy(s),requirements=[copy.deepcopy(reqs[p['requirement_id']]) for p in s['parts']],
                candidates=[dict({k:copy.deepcopy(q[k]) for k in ('id','question','learning_outcome','type','level','lesson_code','review_status','options','correct','rubric') if k in q},content_hash=content_hash(q)) for q in qs]))
        return dict(matrix=m,slots=slots)


def generate_from_matrix(bank_service,matrix_service,payload):
    with bank_service.lock:
        b=bank_service;m=_usable(b,matrix_service,payload.get('matrix_id'))
        for key in ('title','campus','exam_code'):
            if not isinstance(payload.get(key),str) or not payload[key].strip():raise ServiceError('Cần tên đề, cơ sở và mã đề.')
        revision=b.get_record('revisions',payload.get('revision_id'))
        if revision['grade']!=m['grade']:raise ServiceError('Đề cương phải cùng khối với ma trận.')
        placements=payload.get('placements')
        if not isinstance(placements,list) or any(not isinstance(p,dict) for p in placements):raise ServiceError('Danh sách chọn câu không đúng định dạng.')
        expected={s['id'] for s in m['slots']}
        if len(placements)!=len(expected) or {p.get('slot_id') for p in placements}!=expected:raise ServiceError('Phải chọn đủ đúng một câu cho mỗi vị trí ma trận.')
        placement={p['slot_id']:p for p in placements}
        ids=set();texts=set();selected=[];rng=random.Random(str(payload.get('seed','')))
        hashes={content_hash(q) for q in revision['questions']};matched=0
        for slot in sorted(m['slots'],key=lambda s:(('MC','YN','SHORT','ES').index(s['kind']),s['number'])):
            p=placement[slot['id']];reviewed=p.get('reviewed_part_ids')
            if not isinstance(reviewed,list) or not all(isinstance(x,str) for x in reviewed) or set(reviewed)!={x['id'] for x in slot['parts']}:
                raise ServiceError('Cần xác nhận đối chiếu từng chỉ báo của vị trí '+str(slot['number'])+'.')
            q=next((q for q in _eligible(b,m,slot) if q['id']==p.get('question_id')),None)
            if q is None:raise ServiceError('Câu được chọn không khớp khối, bài, dạng, mức độ, YCCĐ nguồn hoặc trạng thái.',dict(slot_id=slot['id']))
            marker=normalized(q['question'])
            if q['id'] in ids or marker in texts:raise ServiceError('Không được lặp câu trong một đề.')
            ids.add(q['id']);texts.add(marker)
            source_hash=content_hash(q);matched+=int(source_hash in hashes)
            snap=copy.deepcopy(q);snap.update(slot_id=slot['id'],slot_number=slot['number'],
                reviewed_part_ids=copy.deepcopy(reviewed),source_content_hash=source_hash,
                points=float(sum(Decimal(str(x['points'])) for x in slot['parts'])))
            if q['type']=='MC':
                order=list(range(4));rng.shuffle(order)
                snap.update(options=[q['options'][i] for i in order],correct=order.index(q['correct']),
                    option_explanations=[q['option_explanations'][i] for i in order],option_order=order)
            snap['content_hash']=content_hash(snap);selected.append(snap)
        sim_pct=float(resolve_similarity(payload.get('similarity_percent',90)))
        required=math.ceil((Decimal(str(sim_pct))/Decimal('100'))*len(selected))
        if matched<required:
            msg='Chưa đạt 90% nội dung của phiên bản đề cương.' if sim_pct==90 else f'Chưa đạt {sim_pct:g}% nội dung của phiên bản đề cương.'
            raise ServiceError(msg,dict(matched=matched,required=required,total=len(selected),similarity_percent=sim_pct))
        exam=dict(id='EXAM-'+uuid.uuid4().hex[:12],title=payload['title'].strip(),grade=m['grade'],
            exam_type=m['exam_type'],duration=m['duration'],campus=payload['campus'].strip(),exam_code=payload['exam_code'].strip(),
            created_at=now(),seed=payload.get('seed'),matrix_id=m['id'],matrix_version=m['version'],
            matrix_digest=m['content_sha256'],matrix_snapshot=copy.deepcopy(m),template_id=None,
            revision_id=revision['id'],revision_match_count=matched,revision_required_count=required,
            similarity_target_percent=sim_pct,
            question_count=len(selected),total_points=10,questions=selected,
            validation_note='Vị trí câu gắn với phiên bản ma trận; giáo viên đã xác nhận từng chỉ báo. Kiểm tra tự động không thay duyệt chuyên môn.')
        records=b._records('exams');records.append(exam);b._atomic_save(b.data_dir/'exams.json',records)
        return copy.deepcopy(exam)
