const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const D=require('../public/static-download.js'),api=require('../public/static-api.js'),{fixture}=require('./static_api.test.cjs');
const env={engine:require('../public/static-exam-engine.js'),workflow:require('../public/static-exam-workflow.js'),subject:'Tin học'};
async function makeData(){let d=fixture();d.matrices[0].status='locked';let r=await api.handle('/api/revisions/save',{title:'Ôn tập',grade:9,question_ids:d.bank.questions.map(q=>q.id)},d,env);d=r.data;
 r=await api.handle('/api/exams/generate',{title:'Đề minh họa',grade:9,exam_type:'GK1',matrix_id:'M1',revision_id:r.response.revision.id},d,env);return r.data;}
function inspect(bytes,nested=false){const p=spawnSync('python3',['-c',`import sys,io,zipfile,json,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.testzip() is None
out={}
for n in z.namelist():
 b=z.read(n)
 if n.endswith('.docx'):
  d=zipfile.ZipFile(io.BytesIO(b));assert d.testzip() is None;out[n]=d.read('word/document.xml').decode()
 else:out[n]=b.decode() if not n.endswith('.png') else 'image'
print(json.dumps(out,ensure_ascii=False))`],{input:bytes,encoding:null});assert.equal(p.status,0,p.stderr.toString());return JSON.parse(p.stdout.toString());}
test('Pages downloads true DOCX, safe student JSON and genuine bundle',async()=>{
 const d=await makeData(),e=d.exams[0],url=`/api/exams/${e.id}`;
 const doc=await D.createDownload(url+'/export?format=docx&answers=0',d);assert.match(doc.filename,/\.docx$/);
 const xml=inspect(doc.bytes)['word/document.xml'];assert.ok(!xml.includes('Đáp án đúng'));assert.ok(xml.includes('BẢN NHÁP'));
 const json=JSON.parse(new TextDecoder().decode((await D.createDownload(url+'/export?format=json&answers=0',d)).bytes));
 assert.equal(json.questions[0].correct,undefined);assert.equal(json.matrix_snapshot,undefined);assert.equal(json.revision_snapshot,undefined);
 const before=JSON.stringify(d),bundle=await D.createDownload(url+'/bundle.zip?format=docx',d);const files=inspect(bundle.bytes);
 assert.ok(Object.keys(files).some(n=>n.startsWith('De_hoc_sinh_')));assert.ok(Object.keys(files).some(n=>n.startsWith('Dap_an_')));assert.ok(files['Ma_tran_va_dac_ta.docx']);
 assert.match(files['Bao_cao_dong_goi_ho_so.txt'],/PDF|logo/);assert.equal(JSON.stringify(d),before);
});
test('unsupported formats, missing IDs and answer permissions fail explicitly',async()=>{
 const d=await makeData(),base=`/api/exams/${d.exams[0].id}`;
 await assert.rejects(D.createDownload(base+'/export?format=pdf',d),/Word|PDF/);
 await assert.rejects(D.createDownload(base+'/export?format=docx&answers=1',d,{canViewAnswers:false}),/quyền/);
 await assert.rejects(D.createDownload(base+'/bundle.zip?format=docx',d,{canViewAnswers:false}),/quyền/);
 await assert.rejects(D.createDownload('/api/exams/missing/export?format=docx',d),/tìm thấy/);
 await assert.rejects(D.createDownload(base+'/export?format=docx&target=lms',d),/LMS/);
});
