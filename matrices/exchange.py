from __future__ import annotations
import copy
import hashlib
import json
from bank_service import ServiceError
from .model import CONTENT_FIELDS, OPTIONAL_CONTENT_FIELDS, normalize_matrix

def _projection(matrix):
    result={k:copy.deepcopy(matrix.get(k)) for k in CONTENT_FIELDS if k!='source'}
    for k in OPTIONAL_CONTENT_FIELDS:  # B3: chỉ có trong gói khi ma trận có, để gói cũ vẫn khớp hash
        if k in matrix:result[k]=copy.deepcopy(matrix[k])
    for k in ('id','family_id','version','previous_id','status','confirmation'):
        if k in matrix:result[k]=copy.deepcopy(matrix[k])
    src=matrix.get('source')
    result['source']={k:copy.deepcopy(src[k]) for k in ('name','sha256','tables','notes') if k in src} if isinstance(src,dict) else None
    def pick(obj,keys):return {k:copy.deepcopy(obj[k]) for k in keys if k in obj}
    result['lessons']=[pick(l,('lesson_code','title','topic','spec_title','spec_topic','source_index')) for l in matrix.get('lessons',[])]
    result['requirements']=[pick(r,('id','lesson_code','level','text','ppct_outcome_index','competency','choice_group','source_index')) for r in matrix.get('requirements',[])]
    result['slots']=[]
    for slot in matrix.get('slots',[]):
        s=pick(slot,('id','kind','number','scoring'))
        s['parts']=[pick(p,('id','label','requirement_id','points','indicator','source_index','source_level','source_competency')) for p in slot.get('parts',[])]
        result['slots'].append(s)
    result['indicator_catalog']=[pick(i,('code','competency','text')) for i in matrix.get('indicator_catalog',[])]
    return result

def _hash(body):
    return hashlib.sha256(json.dumps(body,sort_keys=True,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode()).hexdigest()

def export_package(matrix):
    body=_projection(matrix)
    return dict(format='asian-school-matrix',schema_version=1,matrix=body,content_sha256=_hash(body))

def import_package(package,service):
    if not isinstance(package,dict) or package.get('format')!='asian-school-matrix' or type(package.get('schema_version')) is not int or package['schema_version']!=1 or not isinstance(package.get('matrix'),dict):
        raise ServiceError('Gói ma trận không đúng định dạng/phiên bản hỗ trợ.')
    body=package['matrix']
    try:actual=_hash(body)
    except (TypeError,ValueError) as exc:raise ServiceError('Gói chứa dữ liệu không hợp lệ.') from exc
    if package.get('content_sha256')!=actual:raise ServiceError('Nội dung gói đã thay đổi, dấu kiểm tra không còn khớp.')
    if _projection(body)!=body:raise ServiceError('Gói chứa các trường không thuộc nội dung ma trận dùng chung.')
    if not all(isinstance(body.get(k),str) and body[k] for k in ('id','family_id')) or type(body.get('version')) is not int or body['version']<1:raise ServiceError('Gói cần mã hồ sơ, nhóm phiên bản và số phiên bản hợp lệ.')
    for current in service.list():
        origin=current.get('import_origin',{})
        if origin.get('external_id')==body.get('id') or (origin.get('external_family_id')==body.get('family_id') and origin.get('external_version')==body.get('version')):
            if origin.get('content_sha256')==actual:return current
            raise ServiceError('Mã phiên bản của nguồn đã tồn tại với nội dung khác.',status=409)
        if current['id']==body.get('id'):
            if _hash(_projection(current))==actual:return current
            raise ServiceError('Mã phiên bản đã tồn tại với nội dung khác; không ghi đè.',status=409)
    m=normalize_matrix(body,service.bank.catalog)
    if not m.get('source'):m['source']=dict(name='ma_tran_dung_chung.json',sha256=actual,tables=[],notes=[])
    m['mode']='received'
    m['import_origin']=dict(external_id=body['id'],external_family_id=body['family_id'],external_version=body['version'],external_previous_id=body.get('previous_id'),content_sha256=actual)
    record=service.insert_received(m)
    return record
