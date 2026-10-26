"""Probe test-mode separation on the isolated DB; remove the probe question afterwards."""
import copy
import json
import os
from pathlib import Path
import sys
OUT=Path(__file__).resolve().parent
APP=OUT.parents[1]
sys.path[:0]=[str(APP/'cloud'),str(APP)]
os.environ.update(CLOUD_DATA_DIR='/private/tmp/exammatrix-vatly10-db-20261025',
 DJANGO_SETTINGS_MODULE='config.settings',DJANGO_SECRET_KEY='acceptance-only-isolated-local-test-not-for-production')
os.environ.pop('DATABASE_URL',None)
import django
django.setup()
from django.test import Client
s=json.loads(Path('/private/tmp/exammatrix-vatly10-session.json').read_text())
c=Client(raise_request_exception=False);c.cookies['sessionid']=s['sessionid']
def url(p,test=False):return p+('?curriculum='+s['curriculum'])+('&test_mode=1' if test else '')
before=c.get(url('/api/state')).json()
test=c.get(url('/api/state',True),HTTP_X_TEST_MODE='1').json()
q=copy.deepcopy(before['bank']['questions'][0]);q.pop('id',None)
q.update(question='[PROBE DELETE AFTER TEST] Kiểm tra cách li dữ liệu Django.',review_status='draft')
lesson=copy.deepcopy(before['bank']['ppct']['lessons'][0])
c.post(url('/api/ppct/save-lesson',True),lesson,content_type='application/json',HTTP_X_TEST_MODE='1')
r=c.post(url('/api/questions/save',True),{'question':q},content_type='application/json',HTTP_X_TEST_MODE='1')
created=r.json().get('question',{}).get('id')
after=c.get(url('/api/state')).json()
visible=bool(created and any(q['id']==created for q in after['bank']['questions']))
if created:
    clean=c.post(url('/api/questions/delete',True),{'id':created},content_type='application/json',HTTP_X_TEST_MODE='1')
    assert clean.status_code==200
reset=c.post(url('/api/test/reset',True),{},content_type='application/json',HTTP_X_TEST_MODE='1')
result={'test_header_reports_test_mode':test.get('is_test_mode'),
 'normal_count':len(before['bank']['questions']),'test_count':len(test['bank']['questions']),
 'test_state_should_be_empty':len(test['bank']['questions'])==0,
 'test_mutation_should_not_reach_normal_bank':not visible,
 'test_reset_status':reset.status_code,
 'cleanup_question_count':len(c.get(url('/api/state')).json()['bank']['questions']),
 'notice':'Probe ran only in /private/tmp isolated acceptance DB. Temporary question removed.'}
alignment=[]
for exam in before['exams']:
    if not exam.get('parent_exam_id'):continue
    matrix=exam['matrix_snapshot']
    requirements={r['id']:r for r in matrix['requirements']}
    slots={(slot['kind'],slot['number']):slot for slot in matrix['slots']}
    mismatches=[]
    for q in exam['questions']:
        slot=slots[(q['type'],q['slot_number'])]
        req=requirements[slot['parts'][0]['requirement_id']]
        if req['lesson_code']!=q['lesson_code'] or req['text']!=q['learning_outcome'] or req['level']!=q['level']:
            mismatches.append({'number':q['slot_number'],'type':q['type'],'matrix_lesson':req['lesson_code'],
                'exam_lesson':q['lesson_code'],'matrix_outcome':req['text'],'exam_outcome':q['learning_outcome']})
    alignment.append({'code':exam['exam_code'],'mismatched_positions':len(mismatches),'examples':mismatches[:2]})
result['permutation_matrix_alignment']=alignment
(OUT/'isolation_results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
