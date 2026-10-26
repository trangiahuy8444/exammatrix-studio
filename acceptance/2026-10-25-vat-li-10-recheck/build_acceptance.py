"""Real curriculum acceptance via Django routes; isolated DB only, no live data writes."""
import collections
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import sys
import zipfile

OUT = Path(__file__).resolve().parent
APP = OUT.parents[1]
sys.path[:0] = [str(APP / 'cloud'), str(APP)]
os.environ['CLOUD_DATA_DIR'] = '/private/tmp/exammatrix-vatly10-db-20261025'
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
os.environ['DJANGO_SECRET_KEY'] = 'acceptance-only-isolated-local-test-not-for-production'
os.environ.pop('DATABASE_URL', None)
import django
django.setup()
from django.contrib.auth import get_user_model
from django.test import Client
from workspace.models import Workspace, Subject, Curriculum

report = {'scope': 'Functional acceptance, not pedagogical approval', 'checks': []}
def save_report():
    (OUT/'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
def check(name, ok, detail=''):
    report['checks'].append(dict(name=name, passed=bool(ok), detail=detail))
    print(('PASS ' if ok else 'FAIL ')+name, flush=True)
    save_report()
def dump(name, value):
    (OUT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2))

src = json.loads((OUT/'source_extracted.json').read_text())
ast = json.loads((OUT/'source_pandoc.json').read_text())
# Pandoc retains Office Math as LaTeX. Plain python-docx text omits these runs.
def text(node):
    if isinstance(node, list): return ''.join(text(x) for x in node)
    if not isinstance(node, dict): return ''
    kind, c = node['t'], node.get('c')
    if kind == 'Str': return c
    if kind in ('Space', 'SoftBreak'): return ' '
    if kind == 'LineBreak': return '\n'
    if kind == 'Math': return '$'+c[1]+'$'
    if kind in ('Para','Plain'): return text(c)+'\n'
    if kind in ('Span','Link'): return text(c[1])
    if kind == 'Code': return c[1]
    return text(c)
tables = [b['c'] for b in ast['blocks'] if b['t']=='Table']
lessons=[]
for ti, prefix, topic in [(2,'VL','Chương trình chính khóa — nguồn không chia chương'),
                          (3,'CD','Chuyên đề lựa chọn — nguồn không chia nhóm')]:
    rows=[r for body in tables[ti][4] for r in body[3]]
    for ri,row in enumerate(rows,1):
        cells=[text(c[4]).strip() for c in row[1]]
        # Preserve every source outcome, not only the ones selected for the test.
        outcomes=[re.sub(r'^[-–]\s*','',line).strip() for line in cells[3].splitlines()
                  if re.match(r'^[-–]\s*',line)]
        lessons.append(dict(grade=10,lesson_code=f'{prefix}{ri:02}',lesson_name_source=cells[1],
            topic_source=topic,outcomes=outcomes or [cells[3]],week_raw='Chưa nêu trong nguồn',
            periods_raw=cells[2],source_table=ti,source_row=ri,source_stt=cells[0],
            source_cells=cells))
dump('curriculum_mapped.json', lessons)
report['source'] = dict(path=src['source_path'],sha256=src['sha256'],main_rows=38,
    main_periods=70,special_rows=10,special_periods=35,assessment=src['tables'][4][1:],
    date_note='Nguồn ký 16/11/2025; năm học 2026-2027 chỉ là cấu hình môi trường thử.',
    numbering_note='Dòng 17 có STT 18; dòng 18 trống STT. Mã VLxx là chỉ số dòng, không sửa STT nguồn.')

User=get_user_model()
user=User.objects.create_user('acceptance_vatly10_'+secrets.token_hex(3),password=secrets.token_urlsafe(24))
ws=Workspace.objects.create(owner=user)
sub=Subject.objects.create(workspace=ws,code='vat-li',name='Vật lí')
course=Curriculum.objects.create(workspace=ws,subject=sub,grade=10,school_year='2026-2027',
    title='[NGHIỆM THU] PPCT Vật lí 10 từ Phụ lục I',book='Nguồn giáo viên — kiểm thử riêng',
    policy={'id':'general','minimum_revision_percent':90,'total_points':10,'competencies':['NL_CHUNG']})
client=Client(); client.force_login(user)
cid=str(course.pk)
def url(path): return path+('&' if '?' in path else '?')+'curriculum='+cid
def post(path,payload,expect=200):
    r=client.post(url(path),payload,content_type='application/json')
    if r.status_code != expect:
        dump('last_failed_response.json',dict(path=path,status=r.status_code,body=r.content.decode(errors='replace')[:5000]))
        raise RuntimeError(f'{path}: {r.status_code}: {r.content[:1000]!r}')
    return r.json()
for lesson in lessons: post('/api/ppct/save-lesson',lesson)
state=client.get(url('/api/state')).json()
check('Import 48 rows and exact lesson titles',len(state['bank']['ppct']['lessons'])==48 and
      [l['lesson_name_source'] for l in state['bank']['ppct']['lessons']]==[l['lesson_name_source'] for l in lessons])
check('Preserve all source outcomes including Office Math',all(
    a['outcomes']==b['outcomes'] for a,b in zip(lessons,state['bank']['ppct']['lessons'])))
report['outcome_count']=sum(len(l['outcomes']) for l in lessons)

# Two questions per first 12 rows, plus four numerical applications: 28 MC.
# Correct option initially A, to test whether the permutation follows the content.
items=[
(1,0,'Biết','Đối tượng nghiên cứu của Vật lí học là gì?', ['Các dạng vận động của vật chất và năng lượng','Chỉ cấu tạo của sinh vật','Chỉ ngôn ngữ lập trình','Chỉ niên đại lịch sử'],'Vật lí nghiên cứu vật chất, vận động và năng lượng.'),
(1,4,'Hiểu','Đo thời gian rơi của viên bi để kiểm tra giả thuyết là sử dụng phương pháp nào?', ['Thực nghiệm','Chỉ suy đoán','Bình chọn ý kiến','Tra cứu từ điển'],'Phép đo thực tế để kiểm tra giả thuyết thuộc phương pháp thực nghiệm.'),
(2,0,'Biết','Trước khi lắp mạch điện thí nghiệm, thao tác nào phù hợp?', ['Ngắt nguồn điện','Giữ nguồn đang cấp điện','Chạm tay vào dây trần','Bỏ qua hướng dẫn thiết bị'],'Ngắt nguồn trước khi lắp mạch giúp giảm nguy cơ điện giật.'),
(2,1,'Hiểu','Vì sao phải chọn thang đo phù hợp trước khi đo bằng đồng hồ điện?', ['Tránh quá tải và hỏng thiết bị','Để luôn thu được giá trị lớn nhất','Để bỏ qua sai số','Để không cần đọc đơn vị'],'Thang đo không phù hợp có thể làm quá tải dụng cụ.'),
(3,0,'Biết','Dùng thước đọc trực tiếp chiều dài một thanh là phép đo nào?', ['Đo trực tiếp','Đo gián tiếp','Ước lượng không có dụng cụ','Đếm sự kiện'],'Đại lượng chiều dài được đọc trực tiếp từ thước.'),
(3,1,'Hiểu','Chiều dài đo được là 100 cm, sai số tuyệt đối là 1 cm. Sai số tỉ đối bằng bao nhiêu?', ['1%','10%','0,01%','100%'],'Sai số tỉ đối bằng 1/100 × 100% = 1%.'),
(4,1,'Hiểu','Đi 30 m về phía đông rồi 10 m về phía tây. Quãng đường và độ dịch chuyển theo chiều đông lần lượt là bao nhiêu?', ['40 m và 20 m','20 m và 40 m','40 m và 40 m','20 m và 20 m'],'Quãng đường 30 + 10 = 40 m; độ dịch chuyển 30 − 10 = 20 m.'),
(4,0,'Biết','Vật trở về đúng vị trí xuất phát có độ dịch chuyển bằng bao nhiêu?', ['0','Bằng mọi quãng đường đã đi','Luôn dương','Luôn âm'],'Độ dịch chuyển từ vị trí đầu tới vị trí cuối bằng 0 khi hai vị trí trùng nhau.'),
(5,1,'Hiểu','Một xe đi được 120 m trong 20 s. Tốc độ trung bình là bao nhiêu?', ['6 m/s','2400 m/s','0,167 m/s','100 m/s'],'Tốc độ trung bình bằng 120/20 = 6 m/s.'),
(5,3,'Biết','Đại lượng nào là đại lượng vectơ?', ['Vận tốc','Quãng đường','Thời gian','Tốc độ'],'Vận tốc có độ lớn, phương và chiều.'),
(6,1,'Biết','Cổng quang điện kết hợp đồng hồ hiện số dùng để đo đại lượng nào trong thí nghiệm đo tốc độ?', ['Khoảng thời gian vật chắn cổng','Khối lượng của vật','Nhiệt độ môi trường','Điện trở vật'],'Đồng hồ ghi khoảng thời gian vật chắn tia sáng.'),
(6,0,'Hiểu','Viên bi có đường kính 0,02 m chắn cổng quang trong 0,01 s. Tốc độ xấp xỉ tại cổng là bao nhiêu?', ['2 m/s','0,0002 m/s','0,5 m/s','20 m/s'],'Tốc độ xấp xỉ bằng đường kính chia thời gian chắn cổng: 0,02/0,01 = 2 m/s.'),
(7,1,'Hiểu','Đồ thị độ dịch chuyển–thời gian là đoạn thẳng nằm ngang. Vật có trạng thái nào?', ['Đứng yên','Nhanh dần đều','Chậm dần đều','Chuyển động với vận tốc dương'],'Độ dịch chuyển không đổi theo thời gian nên vận tốc bằng 0.'),
(7,3,'Hiểu','Độ dịch chuyển tăng từ 2 m lên 14 m trong khoảng thời gian từ 0 s đến 4 s, đồ thị là đường thẳng. Vận tốc bằng bao nhiêu?', ['3 m/s','4 m/s','12 m/s','0,333 m/s'],'Độ dốc đồ thị bằng (14 − 2)/4 = 3 m/s.'),
(8,1,'Biết','Đơn vị SI của gia tốc là gì?', ['m/s²','m/s','m·s','s/m'],'Gia tốc là độ biến thiên vận tốc trong một đơn vị thời gian.'),
(8,1,'Hiểu','Vận tốc tăng từ 2 m/s lên 10 m/s trong 4 s. Gia tốc trung bình bằng bao nhiêu?', ['2 m/s²','3 m/s²','8 m/s²','32 m/s²'],'Gia tốc bằng (10 − 2)/4 = 2 m/s².'),
(9,3,'Vận dụng','Xe xuất phát từ nghỉ, chuyển động thẳng nhanh dần đều với gia tốc 2 m/s² trong 3 s. Vận tốc cuối bằng bao nhiêu?', ['6 m/s','9 m/s','3 m/s','18 m/s'],'Vận tốc cuối bằng 0 + 2 × 3 = 6 m/s.'),
(9,3,'Vận dụng','Vật bắt đầu từ nghỉ, gia tốc 2 m/s² không đổi. Quãng đường sau 3 s là bao nhiêu?', ['9 m','6 m','18 m','3 m'],'Quãng đường bằng 1/2 × 2 × 3² = 9 m.'),
(10,0,'Biết','Trong mô hình rơi tự do, vật chỉ chịu tác dụng của lực nào?', ['Trọng lực','Lực kéo của dây','Lực ma sát trượt','Lực đẩy của động cơ'],'Rơi tự do là chuyển động chỉ dưới tác dụng của trọng lực.'),
(10,2,'Vận dụng','Vật thả rơi từ nghỉ, lấy g = 10 m/s² và bỏ qua sức cản. Sau 2 s, vật rơi được bao nhiêu mét?', ['20 m','10 m','40 m','5 m'],'Quãng đường bằng 1/2 × 10 × 2² = 20 m.'),
(11,0,'Biết','Thiết bị nào thích hợp để đo chính xác thời gian rơi trong phòng thí nghiệm?', ['Đồng hồ hiện số và cổng quang điện','Cân khối lượng','Nhiệt kế','Lực kế lò xo'],'Bộ đồng hồ hiện số và cổng quang hỗ trợ đo thời gian rơi.'),
(11,2,'Vận dụng','Vật rơi từ nghỉ được 0,80 m trong 0,40 s. Bỏ qua sức cản, giá trị g tính được là bao nhiêu?', ['10 m/s²','5 m/s²','2 m/s²','20 m/s²'],'Từ h = gt²/2 suy ra g = 2 × 0,80/0,40² = 10 m/s².'),
(12,1,'Biết','Khi ném ngang và bỏ qua sức cản, chuyển động thành phần theo phương ngang là gì?', ['Thẳng đều','Rơi tự do','Nhanh dần đều với gia tốc g','Chuyển động tròn đều'],'Không có gia tốc theo phương ngang nên vận tốc ngang không đổi.'),
(12,3,'Vận dụng','Vật được ném ngang từ độ cao 20 m với tốc độ 5 m/s. Lấy g = 10 m/s². Tầm xa là bao nhiêu?', ['10 m','20 m','5 m','40 m'],'Thời gian rơi bằng căn(2 × 20/10) = 2 s; tầm xa 5 × 2 = 10 m.'),
(4,2,'Vận dụng','Vật dịch chuyển 3 m về phía đông rồi 4 m về phía bắc. Độ lớn độ dịch chuyển tổng hợp bằng bao nhiêu?', ['5 m','7 m','1 m','12 m'],'Hai vectơ vuông góc nên độ lớn tổng hợp bằng căn(3² + 4²) = 5 m.'),
(5,5,'Vận dụng','Một xe đi 60 km trong 1 giờ rồi đi 40 km trong 1 giờ. Tốc độ trung bình toàn hành trình là bao nhiêu?', ['50 km/h','100 km/h','20 km/h','60 km/h'],'Tổng quãng đường 100 km chia tổng thời gian 2 giờ bằng 50 km/h.'),
(9,5,'Vận dụng','Xe bắt đầu từ nghỉ, gia tốc không đổi 2 m/s², đi được 16 m. Tốc độ cuối bằng bao nhiêu?', ['8 m/s','4 m/s','16 m/s','32 m/s'],'Từ v² = 2as = 64 suy ra v = 8 m/s.'),
(12,3,'Vận dụng','Vật ném ngang với tốc độ 8 m/s, thời gian bay 3 s. Tầm xa là bao nhiêu?', ['24 m','11 m','2,67 m','48 m'],'Tầm xa bằng tốc độ ngang nhân thời gian: 8 × 3 = 24 m.'),
]
questions=[]
for row,oi,level,prompt,options,explanation in items:
    lesson=lessons[row-1]
    questions.append(dict(grade=10,subject_name='Vật lí',lesson_code=lesson['lesson_code'],type='MC',
        level=level,learning_outcome=lesson['outcomes'][oi],question=prompt,options=options,correct=0,
        option_explanations=[explanation]+['Không phù hợp với kết quả hoặc định nghĩa: '+explanation]*3,
        max_score=1,review_status='content_checked',source_file='[NGHIỆM THU] Câu tự biên soạn, chưa duyệt sư phạm'))
essays=[
(4,1,'Vật đi 60 m về phía đông rồi quay lại 20 m về phía tây. Tính quãng đường và độ dịch chuyển theo chiều đông.',
 ['Chọn chiều dương về phía đông.','Quãng đường s = 60 + 20.','Quãng đường bằng 80 m.','Độ dịch chuyển d = 60 − 20 = 40 m về phía đông.']),
(5,5,'Một xe đi 150 m trong 30 s, sau đó đi 50 m trong 20 s. Tính tốc độ trung bình cả hành trình.',
 ['Tổng quãng đường s = 150 + 50.','Tổng thời gian t = 30 + 20.','Áp dụng tốc độ trung bình bằng tổng quãng đường chia tổng thời gian.','Kết quả 200/50 = 4 m/s.']),
(9,3,'Xe xuất phát từ nghỉ, gia tốc 2 m/s² không đổi trong 5 s. Tính vận tốc cuối và quãng đường đi được.',
 ['Xác định vận tốc đầu bằng 0.','Vận tốc cuối v = 0 + 2 × 5 = 10 m/s.','Áp dụng s = v₀t + at²/2.','Quãng đường s = 0 + 2 × 5²/2 = 25 m.'])]
for row,oi,prompt,rubric in essays:
    lesson=lessons[row-1]
    questions.append(dict(grade=10,subject_name='Vật lí',lesson_code=lesson['lesson_code'],type='ES',level='Vận dụng',
        learning_outcome=lesson['outcomes'][oi],question=prompt,max_score=1,review_status='content_checked',
        rubric=[dict(criterion=c,points=.25) for c in rubric],
        equivalent_answer_policy='Chấp nhận cách giải tương đương đúng; tổng điểm không vượt 1.',
        source_file='[NGHIỆM THU] Câu tự biên soạn, chưa duyệt sư phạm'))
dump('questions_fixture.json', questions)
saved=[]
for q in questions: saved.append(post('/api/questions/save',{'question':q})['question'])
check('Save 28 MC and 3 ES using exact source outcomes',len(saved)==31)
rev=post('/api/revisions/save',dict(title='[NGHIỆM THU] Đề cương Vật lí 10 — 12 bài đầu',grade=10,
    question_ids=[q['id'] for q in saved]))['revision']
requirements=[]; slots=[]; placements=[];numbers=collections.Counter(); reqmap={}
for q in saved:
    key=(q['lesson_code'],q['learning_outcome'],q['level'])
    if key not in reqmap:
        rid='R'+str(len(reqmap)+1);reqmap[key]=rid
        requirements.append(dict(id=rid,lesson_code=q['lesson_code'],text=q['learning_outcome'],
            level=q['level'],competency='NL_CHUNG',ppct_outcome_index=q['outcome_index']))
    numbers[q['type']]+=1; sid=q['type']+str(numbers[q['type']]);pid=sid+'P'
    slots.append(dict(id=sid,kind=q['type'],number=numbers[q['type']],scoring={'mode':'sum_parts'},
        parts=[dict(id=pid,label='',requirement_id=reqmap[key],points=.25 if q['type']=='MC' else 1,indicator='')]))
    placements.append(dict(slot_id=sid,question_id=q['id'],reviewed_part_ids=[pid]))
matrix=dict(title='[NGHIỆM THU] Ma trận Vật lí 10 — TN 70%, TL 30%',profile='GENERAL',grade=10,
    mode='authored',school_year='2026-2027',exam_type='GK1',duration=45,total_points=10,
    owner_name='Tài khoản nghiệm thu kỹ thuật',campus='MÔI TRƯỜNG THỬ — CHƯA DUYỆT CHUYÊN MÔN',
    lessons=[dict(lesson_code=l['lesson_code'],title=l['lesson_name_source'],topic=l['topic_source']) for l in lessons[:12]],
    requirements=requirements,slots=slots,indicator_catalog=[],reconciliation={'confirmed':True,'issues':[]})
m=post('/api/matrices/save',{'matrix':matrix,'expected_revision':0})['matrix']
validation=post('/api/matrices/review',{'id':m['id']})['validation']
check('Matrix validates with 31 positions and 10 points',validation['valid'],validation)
m=post('/api/matrices/lock',dict(id=m['id'],expected_revision=m['revision'],
    confirmation=dict(confirmed_by='Tài khoản thử kỹ thuật — không thay duyệt giáo viên',confirmed_at='2026-10-25',
                      basis='Chỉ xác nhận ánh xạ fixture phục vụ nghiệm thu',external_agreement=True)))['matrix']
exam_payload=dict(matrix_id=m['id'],revision_id=rev['id'],title='[NGHIỆM THU] Đề Vật lí 10 — không dùng thi chính thức',
    campus='MÔI TRƯỜNG THỬ — CHƯA DUYỆT CHUYÊN MÔN',exam_code='101',seed='physics-20261025',placements=placements)
exam=post('/api/exams/from-matrix',exam_payload)['exam']
check('Exam generated from matrix: 31 questions, 10 points, 100% revision match',
      exam['question_count']==31 and sum(q['points'] for q in exam['questions'])==10 and exam['revision_match_count']==31)
check('Source assessment weighting 70% MC / 30% ES',sum(q['points'] for q in exam['questions'] if q['type']=='MC')==7)
draft=copy.deepcopy(saved[0]);draft['review_status']='draft'
post('/api/questions/save',{'question':draft})
r=client.post(url('/api/exams/from-matrix'),exam_payload,content_type='application/json')
check('Draft questions blocked from matrix exam',r.status_code==400, r.content.decode()[:500])
post('/api/questions/save',{'question':saved[0]})
permuted=post('/api/exams/permute',dict(id=exam['id'],codes=['101','102','103','104'],seed='physics-20261025'))['result']
original={q['id']:q for q in exam['questions']}
variants=permuted['generated_exams']
check('Four variants preserve correct content and scoring',len(variants)==4 and all(
    len(v['questions'])==31 and sum(q['points'] for q in v['questions'])==10 and all(
    q['type']!='MC' or q['options'][q['correct']]==original[q['id']]['options'][original[q['id']]['correct']]
    for q in v['questions']) for v in variants))
export_dir=OUT/'exports';export_dir.mkdir(exist_ok=True)
for fmt in ('docx','tex'):
    r=client.get(url(f'/api/exams/{exam["id"]}/bundle.zip?format={fmt}'))
    check('Bundle '+fmt+' HTTP succeeds',r.status_code==200)
    (export_dir/f'Ho_so_Vat_li_10_{fmt}.zip').write_bytes(r.content)
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        names=z.namelist()
        check('Bundle '+fmt+' contains all four components',all(any('/'+part+'/' in n for n in names)
            for part in ['01_De_thi_hoc_sinh','02_Dap_an_va_Huong_dan_cham','03_Ma_tran_va_Bang_dac_ta','04_De_cuong_on_tap']))
        check('Bundle '+fmt+' has no duplicate file names',len(names)==len(set(names)))
        for n in names:
            if n.endswith('.'+fmt) or n.endswith('.txt'):
                target=export_dir/fmt/Path(n).relative_to(Path(n).parts[0]);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(n))
        report['bundle_'+fmt]={'names':names,'manifest':z.read(next(n for n in names if n.endswith('.txt'))).decode()}
        check('Bundle '+fmt+' manifest reports no missing component','[!]' not in report['bundle_'+fmt]['manifest'])
public=client.get(url(f'/api/exams/{exam["id"]}/export?format=json&answers=0')).json()
check('Student JSON has no answer keys or rubric',all(not(set(q)&{'correct','rubric','option_explanations','reviewed_part_ids'}) for q in public['questions']))
other=User.objects.create_user('acceptance_other_'+secrets.token_hex(3))
client.force_login(other)
check('Other account cannot access curriculum',client.get(url('/api/state')).status_code==404)
client.force_login(user)
for name in ('app.js','core.js','matrices.js','styles.css','curricula.js'):
    r=client.get('/'+name);check('Django serves asset '+name,r.status_code==200,{'http':r.status_code})
client.get(url('/app/'))
session={'sessionid':client.cookies['sessionid'].value,'curriculum':cid,'exam':exam['id'],'revision':rev['id'],'matrix':m['id']}
p=Path('/private/tmp/exammatrix-vatly10-session.json');p.write_text(json.dumps(session));p.chmod(0o600)
report['ids']={k:v for k,v in session.items() if k!='sessionid'}
report['question_distribution']=dict(collections.Counter(q['level'] for q in saved))
save_report()
print('Acceptance API complete.',flush=True)
