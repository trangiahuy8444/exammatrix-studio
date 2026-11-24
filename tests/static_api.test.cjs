const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
globalThis.crypto=webcrypto;
const api=require('../public/static-api.js');
const engine=require('../public/static-exam-engine.js');
const workflow=require('../public/static-exam-workflow.js');
const env={engine,workflow,subject:'Tin học',actor:'Giáo viên minh họa'};
function fixture(){
 const questions=Array.from({length:4},(_,i)=>({id:`Q${i+1}`,grade:9,subject_name:'Tin học',type:'MC',level:'Biết',lesson_code:'B1',learning_outcome:'Nhận biết dữ liệu',question:`Câu minh họa ${i+1}?`,options:['A','B','C','D'],correct:0,review_status:'approved'}));
 const matrix={id:'M1',family_id:'F1',title:'Ma trận minh họa',grade:9,subject_name:'Tin học',exam_type:'GK1',status:'draft',revision:1,version:1,
  mode:'authored',profile:'THCS',school_year:'2026-2027',owner_name:'GV',campus:'Cao Thắng',duration:45,total_points:10,indicator_catalog:[],reconciliation:{confirmed:true,issues:[]},
  lessons:[{lesson_code:'B1',title:'Dữ liệu',topic:'Dữ liệu'}],requirements:[{id:'R1',lesson_code:'B1',level:'Biết',text:'Nhận biết dữ liệu',ppct_outcome_index:0,competency:'NLa'}],
  slots:[{id:'S1',kind:'MC',number:1,scoring:{mode:'sum_parts'},parts:[{id:'P1',requirement_id:'R1',points:5}]},{id:'S2',kind:'MC',number:2,scoring:{mode:'sum_parts'},parts:[{id:'P2',requirement_id:'R1',points:5}]}]};
 return {bank:{questions,ppct:{lessons:[{grade:9,subject_name:'Tin học',lesson_code:'B1',lesson_name:'Dữ liệu',outcomes:['Nhận biết dữ liệu']}]}},matrices:[matrix],revisions:[],exams:[]};
}
async function main(){
 let data=fixture();const initial=JSON.stringify(data);
 await assert.rejects(api.handle('/api/not-supported',{},data,env));
 await assert.rejects(api.handle('/api/exams/generate',{title:'Đề',grade:9,exam_type:'GK1',matrix_id:'M1'},data,env));
 assert.equal(JSON.stringify(data),initial);
 const empty=fixture();empty.matrices[0].slots=[];
 const report=await api.handle('/api/matrices/M1/shortfall',undefined,empty,env);
 assert.equal(report.response.complete,false);assert.equal(report.changed,false);
 await assert.rejects(api.handle('/api/matrices/lock',{id:'M1',expected_revision:1,confirmation:{confirmed_by:'GV',confirmed_at:'2026-11-19',external_agreement:true}},empty,env));
 let result=await api.handle('/api/matrices/lock',{id:'M1',expected_revision:1,confirmation:{confirmed_by:'GV',confirmed_at:'2026-11-19',external_agreement:true}},data,env);data=result.data;
 assert.equal(result.response.matrix.status,'locked');
 await assert.rejects(api.handle('/api/matrices/save',{matrix:{...data.matrices[0],status:'draft',slots:[]},expected_revision:2},data,env));
 result=await api.handle('/api/revisions/save',{title:'Đề cương minh họa',grade:9,question_ids:['Q1','Q2','Q3','Q4']},data,env);data=result.data;
 const revision=result.response.revision;assert.equal(revision.questions.length,4);
 result=await api.handle('/api/exams/generate',{title:'Đề minh họa',grade:9,subject_name:'Tin học',exam_type:'GK1',duration:45,matrix_id:'M1',revision_id:revision.id,seed:'demo'},data,env);data=result.data;
 const exam=result.response.exam;assert.equal(exam.questions.length,2);assert.equal(exam.total_points,10);
 assert.equal(data.exams.length,1);assert.equal(JSON.stringify(fixture()),initial);
 await assert.rejects(api.handle('/api/exams/transition',{id:exam.id,action:'publish'},data,env));
 for(const action of ['submit','approve']){result=await api.handle('/api/exams/transition',{id:exam.id,action},data,env);data=result.data;}
 assert.equal(result.response.exam.status,'locked');
 await assert.rejects(api.handle('/api/exams/update',{id:exam.id,title:'Sửa lén'},data,env));
 result=await api.handle('/api/revisions/transition',{id:revision.id,action:'publish'},data,env);data=result.data;
 result=await api.handle('/api/exams/transition',{id:exam.id,action:'publish'},data,env);data=result.data;
 assert.equal(result.response.exam.status,'published');
 const frozen=JSON.stringify(data.exams[0].questions);
 const bankQ=data.bank.questions[0];result=await api.handle('/api/questions/save',{question:{...bankQ,question:'Nội dung đã sửa',review_status:'approved'}},data,env);data=result.data;
 assert.equal(result.response.question.review_status,'needs_review');assert.equal(JSON.stringify(data.exams[0].questions),frozen);
 const missing=fixture();missing.matrices[0].status='locked';missing.bank.questions.forEach(q=>q.review_status='draft');
 const before=JSON.stringify(missing);
 await assert.rejects(api.handle('/api/exams/generate',{title:'Không đủ câu',grade:9,exam_type:'GK1',matrix_id:'M1'},missing,env));
 assert.equal(JSON.stringify(missing),before);
 const staged=fixture();staged.matrices[0].status='locked';
 let stagedResult=await api.handle('/api/exams/generate',{title:'Tạo trước, gắn đề cương sau',grade:9,exam_type:'GK1',matrix_id:'M1'},staged,env);
 let work=stagedResult.data;const unbound=stagedResult.response.exam.id;
 stagedResult=await api.handle('/api/revisions/save',{title:'Đề cương sau',grade:9,question_ids:['Q1','Q2','Q3','Q4']},work,env);work=stagedResult.data;
 stagedResult=await api.handle('/api/exams/verify',{id:unbound,revision_id:stagedResult.response.revision.id},work,env);work=stagedResult.data;
 assert.equal(stagedResult.response.exam.verification.passed,true);
 assert.equal(engine.verifyExam(work,work.exams[0]).passed,true);
 const originalCorrect=Object.fromEntries(work.exams[0].questions.map(q=>[q.id,q.options[q.correct]]));
 stagedResult=await api.handle('/api/exams/permute',{id:unbound,codes:['101','102'],num_variants:2,shuffle_questions:true,shuffle_options:true,seed:'test'},work,env);
 work=stagedResult.data;assert.equal(stagedResult.response.result.exams.length,2);
 for(const variant of stagedResult.response.result.exams){
  assert.equal(variant.status,'drafting');assert.equal(engine.verifyExam(work,variant).passed,true);
  for(const q of variant.questions)assert.equal(q.options[q.correct],originalCorrect[q.id]);
  for(const action of ['submit','approve']){stagedResult=await api.handle('/api/exams/transition',{id:variant.id,action},work,env);work=stagedResult.data;}
 }
 let sets=fixture();sets.matrices[0].status='locked';
 const setPayload={title:'Bộ đề minh họa',grade:9,exam_type:'GK1',matrix_id:'M1',exam_count:2,seed:'set'};
 stagedResult=await api.handle('/api/exams/generate-set',setPayload,sets,env);sets=stagedResult.data;
 assert.equal(stagedResult.response.exams.length,2);const setId=sets.exams[0].exam_set.id;
 sets.exams[1].questions[0].question='Sửa để tái hiện lỗi';const savedSet=JSON.stringify(sets);
 await assert.rejects(api.handle('/api/exams/set/transition',{set_id:setId,action:'submit'},sets,env));assert.equal(JSON.stringify(sets),savedSet);
 const legacyEs=fixture();
 legacyEs.matrices[0].matrix_locked=true;
 legacyEs.matrices[0].spec_locked=true;
 legacyEs.matrices[0].slots=[
  {id:'S1',kind:'MC',number:1,scoring:{mode:'sum_parts'},parts:[{id:'P1',requirement_id:'R1',points:4}]},
  {id:'S29',kind:'ES',number:29,scoring:{mode:'sum_parts'},parts:[{id:'P29',requirement_id:'R1',points:3}]},
  {id:'S30',kind:'ES',number:30,scoring:{mode:'sum_parts'},parts:[{id:'P30',requirement_id:'R1',points:3}]}
 ];
 const lockedLegacy=await api.handle('/api/matrices/lock',{id:'M1',expected_revision:1,confirmation:{confirmed_by:'GV',confirmed_at:'2026-11-22',external_agreement:true}},legacyEs,env);
 assert.equal(lockedLegacy.response.matrix.status,'locked');
 assert.deepEqual(lockedLegacy.response.matrix.slots.filter(s=>s.kind==='ES').map(s=>s.number),[1,2]);

 // Kiểm thử import JSON ma trận Khối 9 từ AI (thiếu indicator_catalog, mode, owner_name, campus, ppct_outcome_index, scoring, reconciliation)
 const aiJsonPkg={
  format:'asian-school-matrix',
  schema_version:1,
  matrix:{
   profile:'THCS',
   grade:9,
   subject_name:'Tin học',
   exam_type:'GK1',
   duration:45,
   school_year:'2026-2027',
   title:'Ma trận & đặc tả Kiểm tra Giữa HK1 Tin học 9',
   total_points:10,
   lessons:[{lesson_code:'B1',title:'Thế giới kĩ thuật số',topic:'Chủ đề 1'}],
   requirements:[
    {id:'R1',lesson_code:'B1',level:'Biết',text:'Mục tiêu câu 1: Nhận biết thiết bị số.',competency:'NLa'},
    {id:'R2',lesson_code:'B1',level:'Vận dụng',text:'Mục tiêu câu 1 TL: Giải quyết tình huống thực tế.',competency:'NLc'}
   ],
   slots:[
    {id:'S1',kind:'MC',number:1,parts:[{id:'P1',label:'',requirement_id:'R1',points:7}]},
    {id:'S2',kind:'ES',number:2,parts:[{id:'P2',label:'',requirement_id:'R2',points:3}]}
   ]
  }
 };
 const importedAi=await api.handle('/api/matrices/import-package',{package:aiJsonPkg},fixture(),env);
 assert.equal(importedAi.response.validation.valid,true,JSON.stringify(importedAi.response.validation.errors));
 assert.equal(importedAi.response.matrix.slots.find(s=>s.kind==='ES').number,1);
 const lockedAi=await api.handle('/api/matrices/lock',{id:importedAi.response.matrix.id,expected_revision:importedAi.response.matrix.revision,confirmation:{confirmed_by:'GV',confirmed_at:'2026-11-22',external_agreement:true}},importedAi.data,env);
 assert.equal(lockedAi.response.matrix.status,'locked');

 // Hồi quy: /api/exams/from-matrix phải tự điền grade/exam_type/subject_name từ matrix_id nếu máy khách bỏ qua, nhưng vẫn chặn nếu truyền sai khối
 const fmData=fixture();
 fmData.matrices[0].status='locked';
 const fmRes=await api.handle('/api/exams/from-matrix',{
  matrix_id:'M1',
  title:'Đề từ Ma trận 2D thiếu grade',
  campus:'Cao Thắng',
  exam_code:'101',
  seed:'2026',
  placements:[
   {slot_id:'S1',question_id:'Q1',reviewed_part_ids:['P1']},
   {slot_id:'S2',question_id:'Q2',reviewed_part_ids:['P2']}
  ]
 },fmData,env);
 assert.equal(fmRes.response.exam.grade,9);
 assert.equal(fmRes.response.exam.exam_type,'GK1');
 assert.equal(fmRes.response.exam.subject_name,'Tin học');
 assert.equal(fmRes.response.exam.total_points,10);
 await assert.rejects(api.handle('/api/exams/from-matrix',{
  matrix_id:'M1',
  grade:8,
  title:'Đề sai khối',
  campus:'Cao Thắng',
  exam_code:'101',
  placements:[
   {slot_id:'S1',question_id:'Q1',reviewed_part_ids:['P1']},
   {slot_id:'S2',question_id:'Q2',reviewed_part_ids:['P2']}
  ]
 },fmData,env));

 // Hồi quy: Chế độ linh hoạt Ma trận 2D khi câu hỏi ở trạng thái Nháp và lệch YCCĐ / nhãn "Nhận biết"
 const flexData=fixture();
 flexData.matrices[0].status='locked';
 flexData.bank.questions=flexData.bank.questions.map((q,i)=>({
  ...q,
  lesson_code:i===0?'b1':'B1',
  level:'Nhận biết',
  learning_outcome:'YCCĐ khác trong cùng Bài 1',
  review_status:'draft'
 }));
 const candRes=await api.handle('/api/matrices/M1/candidates',undefined,flexData,env);
 assert.equal(candRes.response.bank_diagnostics.total_in_grade,4);
 assert.equal(candRes.response.bank_diagnostics.approved_in_grade,0);
 assert.equal(candRes.response.bank_diagnostics.strict_empty_slots,2);
 assert.equal(candRes.response.bank_diagnostics.flexible_empty_slots,0);
 assert.equal(candRes.response.flexible_slots.length,2);
 assert.ok(candRes.response.flexible_slots[0].candidates.length>=2);
 await assert.rejects(api.handle('/api/exams/from-matrix',{
  matrix_id:'M1',
  title:'Chế độ chặt vẫn chặn',
  campus:'Cao Thắng',
  exam_code:'101',
  placements:[
   {slot_id:'S1',question_id:'Q1',reviewed_part_ids:['P1']},
   {slot_id:'S2',question_id:'Q2',reviewed_part_ids:['P2']}
  ]
 },flexData,env));
 const flexExamRes=await api.handle('/api/exams/from-matrix',{
  matrix_id:'M1',
  flexible:true,
  title:'Đề nháp Khối 9 linh hoạt',
  campus:'Cao Thắng',
  exam_code:'101',
  seed:'2026',
  placements:[
   {slot_id:'S1',question_id:'Q1',reviewed_part_ids:['P1']},
   {slot_id:'S2',question_id:'Q2',reviewed_part_ids:['P2']}
  ]
 },flexData,env);
 assert.equal(flexExamRes.response.exam.flexible_draft,true);
 assert.equal(flexExamRes.response.exam.status,'drafting');
 assert.equal(flexExamRes.response.exam.total_points,10);
 assert.equal(flexExamRes.response.exam.questions.length,2);
 assert.equal(flexExamRes.response.exam.questions[0].level,'Biết');

 // Tạo đề tự động từ tab Tạo đề kiểm tra (/api/exams/generate và /api/exams/generate-set) ở chế độ linh hoạt
 const flexLessonData=JSON.parse(JSON.stringify(flexData));
 flexLessonData.bank.questions[1].lesson_code='Bài 1';
 flexLessonData.bank.questions[2].lesson_code='B01';
 await assert.rejects(api.handle('/api/exams/generate',{
  matrix_id:'M1',grade:9,exam_type:'GK1',duration:45,title:'Chế độ chặt vẫn chặn',flexible:false
 },flexLessonData,env));
 const autoFlexRes=await api.handle('/api/exams/generate',{
  matrix_id:'M1',grade:9,exam_type:'GK1',duration:45,seed:'2026',
  title:'Đề tự động K9 linh hoạt',flexible:true
 },flexLessonData,env);
 assert.equal(autoFlexRes.response.exam.flexible_draft,true);
 assert.equal(autoFlexRes.response.exam.status,'drafting');
 assert.equal(autoFlexRes.response.exam.total_points,10);
 assert.equal(autoFlexRes.response.exam.questions.length,2);
 assert.notEqual(autoFlexRes.response.exam.questions[0].id,autoFlexRes.response.exam.questions[1].id);

 const bpFlexRes=await api.handle('/api/exams/generate',{
  grade:9,exam_type:'TX',duration:15,seed:'2026',title:'Đề tự thiết lập linh hoạt',flexible:true,
  blueprint:[{lesson_code:'B1',type:'MC',level:'Biết',count:2,points_per_question:5}]
 },flexLessonData,env);
 assert.equal(bpFlexRes.response.exam.flexible_draft,true);
 assert.equal(bpFlexRes.response.exam.questions.length,2);
 assert.equal(bpFlexRes.response.exam.total_points,10);

 const setFlexRes=await api.handle('/api/exams/generate-set',{
  matrix_id:'M1',grade:9,exam_type:'GK1',duration:45,exam_count:2,seed:'2026',
  title:'Bộ đề K9 linh hoạt',flexible:true,revision_counts:{}
 },flexLessonData,env);
 assert.equal(setFlexRes.response.exams.length,2);
 assert.ok(setFlexRes.response.revision.questions.length>=2);
 assert.equal(setFlexRes.response.exams[0].flexible_draft,true);
 assert.equal(setFlexRes.response.exams[1].exam_code,'102');

 const emptyFlex=JSON.parse(JSON.stringify(flexData));
 emptyFlex.bank.questions=[];
 await assert.rejects(
  api.handle('/api/exams/generate',{matrix_id:'M1',grade:9,exam_type:'GK1',duration:45,title:'Đề rỗng',flexible:true},emptyFlex,env),
  err=>err.message.includes('Chưa đủ câu hỏi trong ngân hàng cho')&&!err.message.includes('S1')&&!err.message.includes('MX-')
 );

 // Chống tạo trùng khi bấm đúp trong 15 giây & hỗ trợ xóa nhiều đề nháp cùng lúc
 const dupRes=await api.handle('/api/exams/generate',{
  matrix_id:'M1',grade:9,exam_type:'GK1',duration:45,seed:'2026',
  title:'Đề tự động K9 linh hoạt',flexible:true
 },autoFlexRes.data,env);
 assert.equal(dupRes.changed,false);
 assert.equal(dupRes.response.exams.length,1);
 assert.equal(dupRes.response.exam.id,autoFlexRes.response.exam.id);

 const delSingle=await api.handle('/api/exams/delete',{id:autoFlexRes.response.exam.id},dupRes.data,env);
 assert.equal(delSingle.changed,true);
 assert.equal(delSingle.response.exams.length,0);

 const bulkDelRes=await api.handle('/api/exams/delete',{ids:setFlexRes.response.exams.map(e=>e.id)},setFlexRes.data,env);
 assert.equal(bulkDelRes.changed,true);
 assert.equal(bulkDelRes.response.deleted_count,2);
 assert.equal(bulkDelRes.response.exams.length,0);

 // Đề xuất đề cương linh hoạt theo type_counts (bốc ngẫu nhiên theo seed) & tỉ lệ tương đồng 50% khi tạo đề
 const revPropose1=await api.handle('/api/revisions/propose',{
  matrix_id:'M1',grade:9,exam_type:'GK1',flexible:true,type_counts:{MC:3},seed:'seed-rev-a'
 },flexLessonData,env);
 assert.equal(revPropose1.response.total,3);
 assert.equal(new Set(revPropose1.response.question_ids).size,3);
 const revPropose2=await api.handle('/api/revisions/propose',{
  matrix_id:'M1',grade:9,exam_type:'GK1',flexible:true,type_counts:{MC:3},seed:'seed-rev-b'
 },flexLessonData,env);
 assert.equal(revPropose2.response.total,3);

 const twoIds=revPropose1.response.question_ids.slice(0,2);
 const savedSimRev=await api.handle('/api/revisions/save',{
  title:'Đề cương 50 phần trăm',grade:9,question_ids:twoIds,similarity_target_percent:50
 },flexLessonData,env);
 assert.equal(savedSimRev.response.revision.similarity_target_percent,50);

 const sim50Exam=await api.handle('/api/exams/generate',{
  matrix_id:'M1',grade:9,exam_type:'GK1',duration:45,seed:'sim50-test',
  title:'Đề đối chiếu 50 phần trăm',flexible:true,
  revision_id:savedSimRev.response.revision.id,
  similarity_percent:50,similarity_mode:'exact'
 },savedSimRev.data,env);
 assert.equal(sim50Exam.response.exam.questions.length,2);
 assert.equal(sim50Exam.response.exam.revision_match_count,1);

 console.log('PASS static API: ma trận → đề cương → sinh thật → khóa → phát hành; lỗi nguyên tử, bất biến snapshot và không tự duyệt câu');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture,main};
