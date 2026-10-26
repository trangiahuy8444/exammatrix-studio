"""Compare delivered Word/PDF content with the isolated saved records, not just templates."""
import io
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
import zipfile
from lxml import etree
import pymupdf

OUT=Path(__file__).resolve().parent
APP=OUT.parents[1]
sys.path[:0]=[str(APP/'cloud'),str(APP)]
os.environ.update(CLOUD_DATA_DIR='/private/tmp/exammatrix-vatly10-db-20261025',
    DJANGO_SETTINGS_MODULE='config.settings',DJANGO_SECRET_KEY='acceptance-only-isolated-local-test-not-for-production')
os.environ.pop('DATABASE_URL',None)
import django
django.setup()
from django.test import Client
from matrices.model import matrix_view
from exports import _goals

def norm(value):
    return ''.join(c for c in unicodedata.normalize('NFKC',value).casefold() if c.isalnum())
def word_text(path):
    with zipfile.ZipFile(path) as z: root=etree.fromstring(z.read('word/document.xml'))
    return ' '.join(root.xpath('//*[local-name()="t"]/text()'))
def pdf_text(path):
    with pymupdf.open(path) as doc: return '\n'.join(p.get_text() for p in doc)

s=json.loads(Path('/private/tmp/exammatrix-vatly10-session.json').read_text())
client=Client();client.cookies['sessionid']=s['sessionid']
state=client.get('/api/state?curriculum='+s['curriculum']).json()
results=[]
def check(name,ok,detail=''):
    results.append(dict(name=name,passed=bool(ok),detail=detail))
    print(('PASS ' if ok else 'FAIL ')+name)
for exam in state['exams']:
    if not exam.get('parent_exam_id'):continue
    code=exam['exam_code']
    for fmt,folder,read in [('docx',OUT/'exports/docx',word_text),('pdf',OUT/'exports/pdf_from_xelatex',pdf_text)]:
        student=next(folder.rglob('De_thi_Ma_'+code+'.'+fmt))
        teacher=next(folder.rglob('Dap_an_chi_tiet_Ma_'+code+'.'+fmt))
        matrix=next(folder.rglob('Ma_tran_va_Bang_dac_ta_Ma_'+code+'.'+fmt))
        st=norm(read(student));tt=norm(read(teacher));mt=norm(read(matrix))
        missing=[q['id'] for q in exam['questions'] if norm(q['question']) not in st]
        check(f'{fmt} {code}: all 31 question stems',not missing,missing)
        missing=[r['criterion'] for q in exam['questions'] for r in q.get('rubric',[]) if norm(r['criterion']) not in tt]
        check(f'{fmt} {code}: complete essay criteria',not missing,missing)
        missing=[]
        for req in matrix_view(exam['matrix_snapshot'])['requirements']:
            text=req['text']
            if req['refs']:text+=' ('+', '.join('Câu '+r for r in req['refs'])+').'
            if norm(text) not in mt:missing.append(text)
        check(f'{fmt} {code}: correct YCCD and question references',not missing,missing)
        check(f'{fmt} {code}: no hardcoded school identity','quốctếáchâu' not in st and 'quốctếáchâu' not in tt)

rev=next(r for r in state['revisions'] if r['id']==s['revision'])
for fmt,folder,read in [('docx',OUT/'exports/docx',word_text),('pdf',OUT/'exports/pdf_from_xelatex',pdf_text)]:
    text=norm(read(next(folder.rglob('De_cuong_on_tap.'+fmt))))
    missing=[q['question'] for q in rev['questions'] if norm(q['question']) not in text]
    check(f'{fmt} review: all question stems',not missing,missing)
    missing=[g for lesson in _goals(rev) for g in lesson['goals'] if norm(g) not in text]
    check(f'{fmt} review: complete knowledge scope',not missing,missing)
(OUT/'content_audit.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
if not all(r['passed'] for r in results):raise SystemExit(1)
