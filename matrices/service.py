from __future__ import annotations
import copy
import hashlib
import json
import uuid
from bank_service import ServiceError, now, read_json
from .exports import matrix_body_html
from .model import CONTENT_FIELDS, OPTIONAL_CONTENT_FIELDS, normalize_matrix, validate_matrix, matrix_digest


def received_core(m):
    """Fields in a received source that local mapping must never rewrite."""
    return dict(profile=m.get('profile'),grade=m.get('grade'),exam_type=m.get('exam_type'),
        total_points=m.get('total_points'),duration=m.get('duration'),source=m.get('source'),
        lessons=[{k:l.get(k) for k in ('source_index','title','topic','spec_title','spec_topic')} for l in m.get('lessons',[])],
        requirements=[{k:r.get(k) for k in ('id','source_index','text','level','competency')} for r in m.get('requirements',[])],
        slots=[dict(id=s.get('id'),kind=s.get('kind'),scoring=s.get('scoring'),
                    parts=[{k:p.get(k) for k in ('id','label','points','indicator','source_index','source_level','source_competency')} for p in s.get('parts',[])]) for s in m.get('slots',[])],
        indicator_catalog=m.get('indicator_catalog'),issues=m.get('reconciliation',{}).get('issues'))


class MatrixService:
    def __init__(self,bank_service,authored_grades=(9,)):
        self.bank=bank_service;self.path=self.bank.data_dir/'matrices/records.json'
        self.authored_grades=tuple(authored_grades)

    def list(self):
        with self.bank.lock:
            rows=self.bank._read_data(self.path,[])
            if not isinstance(rows,list):raise ServiceError('Danh sách ma trận bị lỗi.',status=409)
            return copy.deepcopy(rows)

    def get(self,ident):
        if not isinstance(ident,str):raise ServiceError('Mã hồ sơ không hợp lệ.')
        record=next((m for m in self.list() if m['id']==ident),None)
        if record is None:raise ServiceError('Không tìm thấy hồ sơ ma trận.',status=404)
        return record

    @staticmethod
    def _revision(m,expected):
        if type(expected) is not int or m['revision']!=expected:
            raise ServiceError('Hồ sơ đã thay đổi ở cửa sổ khác. Hãy tải lại trước khi lưu.',status=409)

    def _write(self,m,action,details=None):
        rows=self.list();m=copy.deepcopy(m)
        m['revision']+=1;m['updated_at']=now()
        m.setdefault('audit',[]).append(dict(action=action,at=now(),details=details or {}))
        found=next((i for i,r in enumerate(rows) if r['id']==m['id']),None)
        if found is None:rows.append(m)
        else:rows[found]=m
        self.bank._atomic_save(self.path,rows)
        return copy.deepcopy(m)

    def _shape(self,m):
        report=validate_matrix(m,self.bank.catalog)
        structural={'shape','grade','profile','mode','exam_type','duration','points','slot_id','part_id','requirement_id','received_scope'}
        if any(e['code'] in structural for e in report['errors']):
            raise ServiceError('Hồ sơ chứa dữ liệu không hợp lệ.',report)
        try:json.dumps(m,allow_nan=False)
        except (ValueError,TypeError) as exc:raise ServiceError('Dữ liệu phải gồm các giá trị JSON hữu hạn.') from exc

    def save_draft(self,payload,expected_revision):
        with self.bank.lock:
            override=isinstance(payload,dict) and payload.get('allow_custom_override') is True
            m=normalize_matrix(payload,self.bank.catalog);self._shape(m)
            ident=m.get('id')
            if ident:
                old=self.get(ident);self._revision(old,expected_revision)
                if not override and old['status'] not in ('draft','review'):raise ServiceError('Bản đã khóa/lưu trữ không được sửa; hãy tạo phiên bản mới.',status=409)
                if not override and (m['mode']!=old['mode'] or m['grade']!=old['grade']):raise ServiceError('Không được đổi phân công hoặc khối của hồ sơ.')
                if not override and old['mode']=='received' and received_core(m)!=received_core(old):
                    raise ServiceError('Không được thay nội dung, chỉ tiêu hoặc điểm của ma trận nhận từ nguồn.',status=409)
                updated=copy.deepcopy(old)
                for k in CONTENT_FIELDS:updated[k]=copy.deepcopy(m.get(k))
                for k in OPTIONAL_CONTENT_FIELDS:  # B3: dạng câu được phép, chính sách chấm
                    if k in m:updated[k]=copy.deepcopy(m[k])
                    else:updated.pop(k,None)
                if override:updated['mode']=m.get('mode','authored')
                m=updated;m['status']='draft'
            else:
                if expected_revision!=0:raise ServiceError('Phiên bản nháp mới không hợp lệ.')
                if not override and m['mode']!='authored':raise ServiceError('Bản nhận phải được nhập và đối chiếu nguồn trước.')
                if not override and m['grade'] not in self.authored_grades:raise ServiceError('Theo phân công hiện tại, thầy biên soạn ma trận khối 9; khối 8/10 nhận bản của giáo viên phụ trách.')
                m={**{k:copy.deepcopy(m.get(k)) for k in CONTENT_FIELDS},**{k:copy.deepcopy(m[k]) for k in OPTIONAL_CONTENT_FIELDS if k in m}}
                m.update(id='MATRIX-'+uuid.uuid4().hex[:12],family_id='FAMILY-'+uuid.uuid4().hex[:12],version=1,
                         previous_id=None,revision=0,status='draft',audit=[],created_at=now())
                m['source']=None
            return self._write(m,'save')

    def shortfall(self,ident):
        """B9: báo cáo thiếu câu đã duyệt theo từng ô của ma trận."""
        from domain.matrix_checks import shortfall_report
        return shortfall_report(self.get(ident),self.bank._load_bank()['questions'],self.bank.catalog)

    def review(self,ident):
        return validate_matrix(self.get(ident),self.bank.catalog,True)

    def _source_pages_prefix(self, m):
        import re
        digest = (m.get('source') or {}).get('sha256')
        if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest): return None
        return f'matrices/sources/{digest}_pages/'

    def source_pages(self, ident):
        import re
        m = self.get(ident); prefix = self._source_pages_prefix(m)
        if not prefix: return []
        pages = []
        for key in self.bank.list_sources(prefix):
            match = re.fullmatch(r'page-([1-9][0-9]*)\.png', key[len(prefix):])
            if match:
                number = int(match.group(1))
                pages.append(dict(page=number, url=f'/api/matrices/{ident}/source-page/{number}'))
        return sorted(pages, key=lambda p:p['page'])

    def source_page_bytes(self, ident, page_number):
        prefix = self._source_pages_prefix(self.get(ident))
        if not prefix or type(page_number) is not int or page_number < 1:
            raise ServiceError('Không tìm thấy trang ảnh bản gốc.', status=404)
        return self.bank.read_source(prefix+f'page-{page_number}.png')

    def compare(self,ident):
        m=self.get(ident);src=m.get('source') or {}
        has_raw=bool(src.get('tables'))
        return dict(
            matrix=m,
            validation=self.review(ident),
            pages=self.source_pages(ident),
            has_raw_tables=has_raw,
            raw_html=matrix_body_html(m,self.bank.catalog,'all','raw') if has_raw else '',
            web_html=matrix_body_html(m,self.bank.catalog,'all','web'),
            comparison_notes=src.get('comparison_notes',[]),
            issues=(m.get('reconciliation') or {}).get('issues',[]),
        )

    def lock(self,ident,expected_revision,confirmation):
        with self.bank.lock:
            m=self.get(ident);self._revision(m,expected_revision)
            if m['status'] not in ('draft','review'):raise ServiceError('Trạng thái không cho phép khóa.',status=409)
            if not isinstance(confirmation,dict) or confirmation.get('external_agreement') is not True or not all(isinstance(confirmation.get(k),str) and confirmation[k].strip() for k in ('confirmed_by','confirmed_at','basis')):
                raise ServiceError('Cần người xác nhận, ngày và căn cứ bản đã thống nhất; kiểm tra kỹ thuật không thay xác nhận của tổ.')
            report=self.review(ident)
            if not report['valid']:raise ServiceError('Ma trận còn nội dung cần đối chiếu.',report)
            m['status']='locked';m['content_sha256']=matrix_digest(m);m['confirmation']=copy.deepcopy(confirmation)
            return self._write(m,'lock',confirmation)

    def new_version(self,ident):
        with self.bank.lock:
            old=self.get(ident)
            if old['status'] not in ('locked','archived'):raise ServiceError('Chỉ tạo phiên bản mới từ bản đã khóa hoặc lưu trữ.')
            m=copy.deepcopy(old);m.update(id='MATRIX-'+uuid.uuid4().hex[:12],previous_id=ident,
                version=max(x['version'] for x in self.list() if x['family_id']==old['family_id'])+1,
                status='draft',revision=0,audit=[],created_at=now())
            m.pop('confirmation',None);m.pop('content_sha256',None)
            return self._write(m,'new_version',dict(previous_id=ident))

    def archive(self,ident,expected_revision,reason):
        with self.bank.lock:
            m=self.get(ident);self._revision(m,expected_revision)
            if not isinstance(reason,str) or not reason.strip():raise ServiceError('Cần lý do lưu trữ.')
            m['status']='archived';return self._write(m,'archive',dict(reason=reason))

    def delete(self,ident):
        with self.bank.lock:
            if not isinstance(ident,str) or not ident.strip():raise ServiceError('Mã hồ sơ không hợp lệ.')
            if any(e.get('matrix_id') == ident for e in self.bank._records('exams')):
                raise ServiceError('Ma trận đang được dùng làm căn cứ cho đề thi. Hãy xóa các đề liên quan trước.', status=409)
            rows=self.list();before=len(rows)
            rows=[x for x in rows if x.get('id')!=ident]
            if len(rows)==before:raise ServiceError('Không tìm thấy hồ sơ ma trận để xóa.',status=404)
            self.bank._atomic_save(self.path,rows)
            return copy.deepcopy(rows)

    def duplicate(self,ident,custom_mode='authored'):
        with self.bank.lock:
            old=self.get(ident)
            m=copy.deepcopy(old)
            m.update(
                id='MATRIX-'+uuid.uuid4().hex[:12],
                family_id='FAMILY-'+uuid.uuid4().hex[:12],
                previous_id=ident,
                version=1,
                status='draft',
                mode='authored' if custom_mode=='authored' else old.get('mode','authored'),
                title=f'{old.get("title","Ma trận")} (Bản sao)',
                revision=0,
                audit=[],
                created_at=now(),
            )
            m.pop('confirmation',None);m.pop('content_sha256',None)
            return self._write(m,'duplicate',dict(from_id=ident))

    def unlock(self,ident,convert_to_authored=False):
        with self.bank.lock:
            m=self.get(ident)
            m['status']='draft'
            if convert_to_authored:
                m['mode']='authored'
            m.pop('confirmation',None);m.pop('content_sha256',None)
            return self._write(m,'unlock',dict(convert_to_authored=bool(convert_to_authored)))

    def insert_received(self,m):
        """Internal import boundary; HTTP accepts only reparsed source or checked packages."""
        with self.bank.lock:
            m=normalize_matrix(m,self.bank.catalog);m['mode']='received'
            for i,l in enumerate(m.get('lessons',[])):l.setdefault('source_index',i)
            source_indices={l.get('lesson_code'):l.get('source_index') for l in m.get('lessons',[])}
            for r in m.get('requirements',[]):r.setdefault('source_index',source_indices.get(r.get('lesson_code')))
            reqs={r['id']:r for r in m.get('requirements',[])}
            for slot in m.get('slots',[]):
                for part in slot['parts']:
                    r=reqs.get(part.get('requirement_id'),{})
                    part.setdefault('source_index',r.get('source_index'))
                    part.setdefault('source_level',r.get('level'))
                    part.setdefault('source_competency',r.get('competency'))
            self._shape(m)
            digest=m.get('source',{}).get('sha256')
            rows=self.list();origin=m.get('import_origin')
            if not origin:
                existing=next((x for x in rows if not x.get('import_origin') and x.get('source') and x['source'].get('sha256')==digest),None)
                if existing:return existing
            family=next((x for x in rows if origin and x.get('import_origin',{}).get('external_family_id')==origin.get('external_family_id')),None)
            previous=next((x for x in rows if origin and x.get('import_origin',{}).get('external_id')==origin.get('external_previous_id')),None)
            m.update(id='MATRIX-'+uuid.uuid4().hex[:12],family_id=family['family_id'] if family else 'FAMILY-'+uuid.uuid4().hex[:12],
                     version=origin['external_version'] if origin else 1,previous_id=previous['id'] if previous else None,
                     revision=0,status='draft',audit=[],created_at=now())
            return self._write(m,'import_source')

    def accept_import(self,candidate,annotations,raw,filename,grade,ppct=None):
        from .import_docx import inspect_docx
        with self.bank.lock:
            parsed=inspect_docx(raw,filename,grade,ppct or self.bank.catalog)['candidate']
            self.bank.write_source('matrices/sources/'+parsed['source']['sha256']+'.docx', raw)
            return self.insert_received(parsed)
