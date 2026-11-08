import base64
import binascii
import re
from bank_service import ServiceError
from .exports import export_matrix
from .exchange import import_package
from .generation import matrix_candidates,generate_from_matrix
from .import_docx import inspect_docx,MAX_UPLOAD_BYTES


def _upload(payload):
    name=payload.get('filename');content=payload.get('content_base64')
    if not isinstance(name,str) or not name.lower().endswith('.docx') or not isinstance(content,str):raise ServiceError('Chọn một tệp .docx hợp lệ.')
    try:raw=base64.b64decode(content,validate=True)
    except (binascii.Error,ValueError) as exc:raise ServiceError('Nội dung tệp tải lên không hợp lệ.') from exc
    if not 0<len(raw)<=MAX_UPLOAD_BYTES:raise ServiceError('Tệp tải lên phải nhỏ hơn 8 MB.')
    return raw,name,payload.get('grade')


def handle_matrix_get(handler,path,query):
    service=getattr(handler,'matrix_service',handler.server.matrix_service)
    if path=='/api/matrices':handler._json(dict(matrices=service.list()));return True
    page_match=re.fullmatch(r'/api/matrices/([A-Za-z0-9_-]+)/source-page/(\d+)',path)
    if page_match:
        ident,page_str=page_match.groups()
        raw=service.source_page_bytes(ident,int(page_str))
        handler._send(raw,'image/png')
        return True
    match=re.fullmatch(r'/api/matrices/([A-Za-z0-9_-]+)(?:/(export|candidates|compare|shortfall))?',path)
    if not match:return False
    ident,action=match.groups();m=service.get(ident)
    if action=='export':
        raw,mime,name=export_matrix(m,service.bank.catalog,query.get('format',['docx'])[0],query.get('section',['all'])[0],query.get('mode',['auto'])[0])
        handler._send(raw,mime,filename=name)
    elif action=='candidates':handler._json(matrix_candidates(service.bank,service,ident))
    elif action=='compare':handler._json(service.compare(ident))
    elif action=='shortfall':handler._json(service.shortfall(ident))
    else:handler._json(dict(matrix=m,validation=service.review(ident)))
    return True


def handle_matrix_post(handler,path,payload):
    service=getattr(handler,'matrix_service',handler.server.matrix_service)
    if path=='/api/exams/from-matrix':handler._json(dict(exam=generate_from_matrix(service.bank,service,payload)));return True
    if not path.startswith('/api/matrices/'):return False
    action=path.rsplit('/',1)[-1]
    if action=='save':result=service.save_draft(payload.get('matrix'),payload.get('expected_revision'))
    elif action=='review':handler._json(dict(validation=service.review(payload.get('id'))));return True
    elif action=='lock':result=service.lock(payload.get('id'),payload.get('expected_revision'),payload.get('confirmation'))
    elif action=='new-version':result=service.new_version(payload.get('id'))
    elif action=='archive':result=service.archive(payload.get('id'),payload.get('expected_revision'),payload.get('reason'))
    elif action=='delete':handler._json(dict(matrices=service.delete(payload.get('id'))));return True
    elif action=='duplicate':result=service.duplicate(payload.get('id'),payload.get('mode','authored'))
    elif action=='unlock':result=service.unlock(payload.get('id'),bool(payload.get('convert_to_authored')))
    elif action=='inspect-docx':
        raw,name,grade=_upload(payload)
        handler._json(inspect_docx(raw,name,grade,service.bank.catalog));return True
    elif action=='accept-import':
        raw,name,grade=_upload(payload)
        result=service.accept_import(None,{},raw,name,grade)
    elif action=='import-package':result=import_package(payload.get('package'),service)
    else:return False
    handler._json(dict(matrix=result,validation=service.review(result['id'])));return True
