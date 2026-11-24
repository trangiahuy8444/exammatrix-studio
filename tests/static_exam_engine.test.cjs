'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const file = '../public/static-exam-engine.js';
const engine = fs.existsSync(require('node:path').join(__dirname,file)) ? require(file) : {};
const clone = x => JSON.parse(JSON.stringify(x));
test('Pages validates Tin/Toán/Vật lí with the right competency catalog',()=>{
 for(const [name,competency] of [['Tin học','NLa'],['Toán học','TDLL'],['Vật lí','NL_CHUNG']]){
  const d=require('./static_api.test.cjs').fixture();
  d.matrices[0].subject_name=name;d.matrices[0].requirements[0].competency=competency;
  d.bank.ppct.lessons[0].subject_name=name;d.bank.questions.forEach(q=>q.subject_name=name);
  assert.equal(engine.validateMatrix(d.matrices[0],d.bank.ppct).valid,true,name);
 }
});
function fixture() {
 const ppct={lessons:[{grade:9,subject_name:'Tin học',lesson_code:'B1',outcomes:['Dữ liệu','Xử lí']}]};
 const questions=Array.from({length:16},(_,i)=>({id:'Q'+i,grade:9,subject_name:'Tin học',lesson_code:'B1',type:'MC',level:'Biết',learning_outcome:'Dữ liệu',question:'Câu minh họa '+i,options:['A','B','C','D'],correct:0,review_status:'approved'}));
 const matrix={id:'M1',version:1,revision:1,status:'locked',mode:'authored',profile:'THCS',grade:9,subject_name:'Tin học',title:'Ma trận',school_year:'2026-2027',owner_name:'GV',campus:'Cao Thắng',duration:45,exam_type:'GK1',total_points:10,lessons:[{lesson_code:'B1',title:'Bài 1',topic:'Dữ liệu'}],requirements:[{id:'R1',lesson_code:'B1',level:'Biết',text:'Dữ liệu',ppct_outcome_index:0,competency:'NLa'}],slots:Array.from({length:10},(_,i)=>({id:'S'+i,kind:'MC',number:i+1,parts:[{id:'P'+i,label:'',requirement_id:'R1',points:1}],scoring:{mode:'sum_parts'}})),indicator_catalog:[],reconciliation:{confirmed:true,issues:[]}};
 return {bank:{ppct,questions},matrices:[matrix],revisions:[],exams:[]};
}
const payload={title:'Đề minh họa',grade:9,subject_name:'Tin học',exam_type:'GK1',matrix_id:'M1',seed:'demo'};
function revision(d,n=9){return {id:'R',grade:9,subject_name:'Tin học',title:'Ôn tập',questions:clone(d.bank.questions.slice(0,n))};}
test('exports browser UMD and all synchronous interfaces',()=>{
 for(const n of ['validateMatrix','shortfall','candidates','plan','generateExam','proposeRevision','generateSet','verifyExam'])assert.equal(typeof engine[n],'function',n);
 const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve(file),'utf8'),context);assert.equal(typeof context.window.BankStaticEngine.generateExam,'function');
});
test('empty matrix cannot validate or report complete shortfall',()=>{const d=fixture(),m={...d.matrices[0],slots:[]};assert.equal(engine.validateMatrix(m,d.bank.ppct).valid,false);const r=engine.shortfall(m,[],d.bank.ppct);assert.equal(r.complete,false);assert.equal(r.ok,false);});
test('approved technical candidates only, honest shortages and plan UI fields',()=>{const d=fixture();d.bank.questions.forEach((q,i)=>{if(i<8)q.review_status='draft';});d.bank.questions[8].correct=8;
 const c=engine.candidates(d.matrices[0],d.bank.questions,d.bank.ppct);assert.equal(c.slots[0].candidates.length,7);
 const r=engine.shortfall(d.matrices[0],d.bank.questions,d.bank.ppct);assert.equal(r.total_shortfall,3);assert.equal(r.ok,false);
 const p=engine.proposeRevision(d,payload);assert.equal(p.cells[0].available,7);assert.equal(p.cells[0].need,10);assert.equal(p.cells[0].points.length,10);assert.deepEqual(p.cells[0].outcomes,['Dữ liệu']);assert.equal(p.total,7);
 assert.throws(()=>engine.generateExam(d,payload),/thiếu|đủ/i);
});
test('generates ten-point immutable snapshot with exact >=90% revision and YCCD report',()=>{const d=fixture();d.revisions=[revision(d)];const before=clone(d);const e=engine.generateExam(d,{...payload,revision_id:'R'});assert.equal(e.total_points,10);assert.equal(e.questions.length,10);assert.ok(e.revision_match_count>=9);assert.equal(e.status,'drafting');assert.equal(engine.verifyExam(d,e).passed,true);assert.deepEqual(d,before);d.bank.questions[0].options[0]='Sửa';d.matrices[0].slots[0].parts[0].points=2;assert.equal(e.matrix_snapshot.slots[0].parts[0].points,1);assert.ok(Object.isFrozen(e.questions[0].options));assert.ok(e.questions.every(q=>q.review_status==='approved'));});
test('revision eight of ten and modified approved content fail exact trace',()=>{const d=fixture();d.revisions=[revision(d,8)];assert.throws(()=>engine.generateExam(d,{...payload,revision_id:'R'}),/90|đề cương/i);d.revisions=[revision(d,9)];d.bank.questions[0].correct=1;assert.throws(()=>engine.generateExam(d,{...payload,revision_id:'R'}),/90|đề cương/i);});
test('rejects wrong context, stale or missing matrix and client injection',()=>{for(const changes of [{grade:8},{subject_name:'Toán'},{exam_type:'CK1'},{matrix_id:'missing'},{matrix_version:9},{title:'  '}])assert.throws(()=>engine.generateExam(fixture(),{...payload,...changes}));const d=fixture();assert.throws(()=>engine.generateExam(d,{...payload,matrix_id:undefined,_matrix:d.matrices[0]}));d.matrices[0].status='draft';assert.throws(()=>engine.generateExam(d,payload),/khóa/i);});
test('subject/grade/outcome mapping never falls back to another PPCT',()=>{const d=fixture();d.bank.ppct.lessons[0].subject_name='Toán';assert.equal(engine.validateMatrix(d.matrices[0],d.bank.ppct).valid,false);for(const change of [{grade:8},{subject_name:'Toán'},{learning_outcome:'Không thuộc PPCT'},{level:'Hiểu'}]){const b=fixture();b.bank.questions.forEach(q=>Object.assign(q,change));assert.throws(()=>engine.generateExam(b,payload),/đủ|thiếu/i);}});
test('explicit placements must be complete unique matching and reviewed',()=>{const d=fixture();const placements=d.matrices[0].slots.map((s,i)=>({slot_id:s.id,question_id:'Q'+i,reviewed_part_ids:[s.parts[0].id]}));assert.equal(engine.generateExam(d,{...payload,placements}).questions.length,10);for(const p of [placements.slice(1),placements.map(x=>({...x,question_id:'Q0'})),placements.map(x=>({...x,reviewed_part_ids:[]})),placements.map(x=>({...x,slot_id:'wrong'}))])assert.throws(()=>engine.generateExam(d,{...payload,placements:p}));});
test('matching reserves scarce candidates for restrictive cells',()=>{const d=fixture();d.bank.questions=d.bank.questions.slice(0,2);d.bank.questions[1].learning_outcome='Xử lí';const p={...payload,matrix_id:undefined,exam_type:'TX',blueprint:[{lesson_code:'B1',type:'MC',level:'Biết',count:1,points_per_question:5},{lesson_code:'B1',type:'MC',level:'Biết',count:1,points_per_question:5,outcomes:['Dữ liệu']}]};const e=engine.generateExam(d,p);assert.equal(e.questions[1].id,'Q0');assert.equal(new Set(e.questions.map(q=>q.id)).size,2);});
test('multipart YN and ES are blocked truthfully and shortfall incomplete',()=>{for(const kind of ['YN','ES']){const d=fixture(),m=d.matrices[0];m.slots=[{id:'S',kind,number:1,parts:[{id:'a',label:'a',requirement_id:'R1',points:5},{id:'b',label:'b',requirement_id:'R1',points:5}],scoring:{mode:'sum_parts'}}];m.allowed_kinds=['MC','YN','ES'];assert.equal(engine.shortfall(m,d.bank.questions,d.bank.ppct).complete,false);assert.throws(()=>engine.generateExam(d,payload),/nhiều ý|nhiều phần|Đúng\/Sai|chưa hỗ trợ/i);}});
test('revision coverage is required even with nine exact matches',()=>{const d=fixture();d.matrices[0].requirements.push({...d.matrices[0].requirements[0],id:'R2',ppct_outcome_index:1,text:'Xử lí'});d.matrices[0].slots[9].parts[0].requirement_id='R2';d.bank.questions[15].learning_outcome='Xử lí';d.revisions=[revision(d,9)];assert.throws(()=>engine.generateExam(d,{...payload,revision_id:'R'}),/YCCĐ|đề cương/i);});
test('set is all-or-error and pure; proposals preserve snapshot provenance',()=>{const d=fixture(),before=clone(d);const r=engine.proposeRevision(d,payload);assert.ok(r.question_ids.length);const s=engine.generateSet(d,{...payload,exam_count:2});assert.equal(s.exams.length,2);assert.ok(s.exams.every(e=>e.total_points===10));assert.equal(new Set(s.exams.map(e=>e.id)).size,2);assert.deepEqual(d,before);assert.throws(()=>engine.generateSet(d,{...payload,exam_count:0}));d.bank.questions=[];assert.throws(()=>engine.generateSet(d,{...payload,exam_count:2}));});
test('verification does not claim success for tampered frozen evidence or absent revision',()=>{const d=fixture();const e=engine.generateExam(d,payload);assert.equal(engine.verifyExam(d,e).passed,false);d.revisions=[revision(d,16)];const good=engine.generateExam(d,{...payload,revision_id:'R'});for(const mutate of [e=>e.questions[0].correct=3,e=>e.questions.pop(),e=>e.matrix_snapshot.slots[0].parts[0].points=8,e=>e.questions[0].grade=8]){const bad=clone(good);mutate(bad);assert.equal(engine.verifyExam(d,bad).passed,false);}});
test('content hash matches Python canonical UTF-8 SHA256; stale locked hash is rejected',()=>{const d=fixture(),e=engine.generateExam(d,payload),q=e.questions[0];const fields=['grade','type','lesson_code','level','learning_outcome','question','options','correct','option_explanations','rubric','max_score','equivalent_answer_policy','response_mode'];const selected={};fields.filter(k=>k in q).sort().forEach(k=>selected[k]=q[k]);assert.equal(q.source_content_hash,crypto.createHash('sha256').update(JSON.stringify(selected)).digest('hex'));d.matrices[0].content_sha256='bad';assert.throws(()=>engine.generateExam(d,payload),/thay đổi|khóa/i);});
test('malformed matrix produces useful validation errors rather than crashing',()=>{const d=fixture();for(const field of ['requirements','slots','lessons','indicator_catalog']){const m=clone(d.matrices[0]);m[field]=[null];assert.equal(engine.validateMatrix(m,d.bank.ppct).valid,false);}for(const m of [null,{}, {slots:[]}]){const r=engine.shortfall(m,[],null);assert.equal(r.ok,false);assert.equal(r.complete,false);}});
test('immutable verification uses frozen PPCT and bank-independent exam evidence',()=>{const d=fixture();d.revisions=[revision(d,16)];const e=engine.generateExam(d,{...payload,revision_id:'R'});d.bank.questions=[];d.bank.ppct.lessons=[];d.matrices=[];assert.equal(engine.verifyExam(d,e).passed,true);});
test('SHORT string answer is supported, object semantics blocked, and edits invalidate trace',()=>{const d=fixture();d.matrices[0].allowed_kinds=['SHORT'];d.matrices[0].slots.forEach(s=>s.kind='SHORT');d.bank.questions.forEach((q,i)=>{q.type='SHORT';q.short_answer={value:String(i),accepted:[String(i)],match_mode:'exact'};});assert.throws(()=>engine.generateExam(d,payload),/đủ|thiếu/i);d.bank.questions.forEach((q,i)=>q.short_answer=String(i));d.revisions=[revision(d,16)];const e=engine.generateExam(d,{...payload,revision_id:'R'});assert.equal(e.questions.length,10);d.revisions[0].questions.forEach(q=>q.short_answer='sửa');assert.equal(engine.verifyExam(d,e).passed,false);});
test('nonblank revision title and unsupported options cannot silently succeed',()=>{assert.throws(()=>engine.proposeRevision(fixture(),{...payload,title:' '}),/tên|tiêu đề/i);assert.throws(()=>engine.plan(fixture(),{...payload,lesson_counts:{B1:{MC:10}}}),/chưa hỗ trợ/i);assert.throws(()=>engine.plan(fixture(),{...payload,counts:{unknown:10}}),/ô|khóa/i);});
test('ambiguous bank IDs cannot leak a draft into a revision snapshot',()=>{const d=fixture();d.bank.questions.unshift({...clone(d.bank.questions[0]),review_status:'draft'});assert.throws(()=>engine.proposeRevision(d,payload),/trùng|mã/i);});
test('proportional total allocation never requests negative cell counts',()=>{const d=fixture();const rows=Array.from({length:4},(_,i)=>({lesson_code:'B1',type:'MC',level:['Biết','Hiểu','Vận dụng','Vận dụng cao'][i],count:1,points_per_question:2.5,outcomes:['Dữ liệu']}));d.bank.questions.forEach((q,i)=>q.level=['Biết','Hiểu','Vận dụng','Vận dụng cao'][i%4]);const p=engine.plan(d,{...payload,matrix_id:undefined,blueprint:rows,total:2});assert.equal(p.cells.reduce((n,c)=>n+c.requested,0),2);assert.ok(p.cells.every(c=>c.requested>=0));});
test('freezing output never freezes caller arrays; reports own their returned arrays',()=>{const d=fixture();d.matrices[0].allowed_kinds=['MC'];engine.generateExam(d,payload);assert.equal(Object.isFrozen(d.matrices[0].allowed_kinds),false);const p={...payload,matrix_id:undefined,blueprint:[{lesson_code:'B1',type:'MC',level:'Biết',count:10,points_per_question:1,outcomes:['Dữ liệu']}]};const plan=engine.plan(d,p);plan.cells[0].outcomes.push('Sửa');assert.deepEqual(p.blueprint[0].outcomes,['Dữ liệu']);});

function ynFixture(){
 const d=fixture(),m=d.matrices[0];m.profile='THPT';m.grade=10;m.allowed_kinds=['MC','YN'];
 d.bank.ppct.lessons[0].grade=10;m.requirements.push({id:'R2',lesson_code:'B1',level:'Hiểu',text:'Xử lí',ppct_outcome_index:1,competency:'NLa'});
 m.indicator_catalog=[{code:'NLa.1',competency:'NLa',text:'Chỉ báo minh họa'}];
 m.slots=[...Array.from({length:6},(_,i)=>({id:'S'+i,kind:'MC',number:i+1,parts:[{id:'P'+i,label:'',requirement_id:'R1',points:1,indicator:'NLa.1'}],scoring:{mode:'sum_parts'}})),
  ...Array.from({length:4},(_,i)=>({id:'Y'+i,kind:'YN',number:i+1,parts:['a','b','c','d'].map(l=>({id:'Y'+i+l,label:l,requirement_id:'R2',points:0.25,indicator:'NLa.1'})),scoring:{mode:'sum_parts'}}))];
 d.bank.questions.forEach(q=>q.grade=10);
 for(let i=0;i<6;i++)d.bank.questions.push({id:'YN'+i,grade:10,subject_name:'Tin học',lesson_code:'B1',type:'YN',level:'Hiểu',learning_outcome:'Xử lí',question:'Đúng/Sai minh họa '+i,statements:['a','b','c','d'].map((l,k)=>({label:l,text:'Ý '+l+' câu '+i,correct:k%2===0})),review_status:'approved'});
 return d;
}
const ynPayload={...payload,grade:10};
test('THPT Đúng/Sai 4 ý cùng một YCCĐ tạo được đề cương và đề đủ 10 điểm',()=>{const d=ynFixture();
 assert.equal(engine.validateMatrix(d.matrices[0],d.bank.ppct).exam_supported,true);
 const sf=engine.shortfall(d.matrices[0],d.bank.questions,d.bank.ppct);assert.equal(sf.complete,true);assert.equal(sf.ok,true);
 const p=engine.proposeRevision(d,ynPayload);assert.ok(p.cells.some(c=>c.type==='YN'&&c.revision_count>=4));
 const e=engine.generateExam(d,ynPayload);assert.equal(e.total_points,10);assert.equal(e.questions.filter(q=>q.type==='YN').length,4);assert.ok(e.questions.filter(q=>q.type==='YN').every(q=>q.points===1));
 d.revisions=[{id:'R',grade:10,subject_name:'Tin học',title:'Ôn tập',questions:clone(d.bank.questions)}];const ok=engine.generateExam(d,{...ynPayload,revision_id:'R'});assert.equal(engine.verifyExam(d,ok).passed,true);
});
test('Đúng/Sai trải trên nhiều YCCĐ vẫn bị chặn với thông báo rõ',()=>{const d=ynFixture();d.matrices[0].slots[6].parts[3].requirement_id='R1';
 assert.equal(engine.validateMatrix(d.matrices[0],d.bank.ppct).exam_supported,false);assert.throws(()=>engine.generateExam(d,ynPayload),/nhiều YCCĐ/);});
test('câu Đúng/Sai thiếu ý hoặc thiếu đáp án không đủ điều kiện kỹ thuật',()=>{const d=ynFixture();d.bank.questions.filter(q=>q.type==='YN').forEach((q,i)=>{if(i<3)q.statements.pop();else delete q.statements[0].correct;});assert.throws(()=>engine.generateExam(d,ynPayload),/đủ|thiếu/i);});
test('câu Trả lời ngắn nhập từ Excel (trường answer) được nhận như short_answer',()=>{const d=fixture();d.matrices[0].allowed_kinds=['SHORT'];d.matrices[0].slots.forEach(s=>s.kind='SHORT');d.bank.questions.forEach((q,i)=>{q.type='SHORT';delete q.options;delete q.correct;q.answer=String(10+i);});assert.equal(engine.generateExam(d,payload).questions.length,10);});

test('Đúng/Sai sau khi "Tách mục tiêu theo từng câu hỏi" (mỗi ý một mã YCCĐ, cùng bài/mức/YCCĐ gốc) vẫn tạo được đề',()=>{const d=ynFixture(),m=d.matrices[0];
 for(const s of m.slots.filter(s=>s.kind==='YN'))for(const p of s.parts){const r={...m.requirements.find(r=>r.id==='R2'),id:'R2-'+p.id,text:'Xử lí (Mục tiêu ý '+p.label+')'};m.requirements.push(r);p.requirement_id=r.id;}
 assert.equal(engine.validateMatrix(m,d.bank.ppct).exam_supported,true);
 const e=engine.generateExam(d,ynPayload);assert.equal(e.questions.filter(q=>q.type==='YN').length,4);assert.equal(e.total_points,10);
 m.requirements.find(r=>r.id==='R2-Y0d').level='Vận dụng';assert.equal(engine.validateMatrix(m,d.bank.ppct).exam_supported,false);
});
