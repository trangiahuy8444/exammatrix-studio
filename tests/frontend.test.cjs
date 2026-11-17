const assert=require('node:assert/strict');
const core=require('../public/core.js');
const qs=[{id:'a',grade:9,lesson_code:'B1',type:'MC',level:'Biết',review_status:'approved',question:'Thế giới kĩ thuật số'},{id:'b',grade:9,lesson_code:'B2',type:'ES',level:'Vận dụng',review_status:'draft',question:'Đánh giá thông tin'},{id:'c',grade:8,lesson_code:'B1',type:'MC',level:'Biết',review_status:'archived',question:'Lược sử'}];
assert.deepEqual(core.filterQuestions(qs,{search:'the gioi',status:'active'}).map(q=>q.id),['a']);
assert.deepEqual(core.filterQuestions(qs,{grade:'9',type:'ES',status:'all'}).map(q=>q.id),['b']);
assert.equal(core.blueprintSummary([{count:28,points_per_question:.25},{count:3,points_per_question:1}]).points,10);
assert.equal(core.blueprintSummary([{count:3,points_per_question:.1}]).points,.3);
assert.equal(core.templateBlocked({unsupported:true}),true);
assert.equal(core.templateBlocked({unsupported:false}),false);
assert.deepEqual(core.revisionIds(qs,['a','b','c'],9),['a','b']);
assert.equal(core.escapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
console.log('PASS frontend: accents, filters, points, unsupported templates, revision grade, HTML safety');
{
  const rows=[{lesson_code:'B1',type:'MC',level:'Biết',count:2},{lesson_code:'B1',type:'MC',level:'Biết',count:1},{lesson_code:'B2',type:'ES',level:'Vận dụng',count:1}];
  const bank=[{id:'x',lesson_code:'B1',type:'MC',level:'Biết',review_status:'approved'},{id:'y',lesson_code:'B1',type:'MC',level:'Biết',review_status:'draft'},{id:'z',lesson_code:'B3',type:'MC',level:'Biết',review_status:'approved'}];
  const cov=core.matrixCellCoverage(rows,[bank[0],bank[2]],bank,3);
  assert.equal(cov.cells.length,2);
  assert.deepEqual(cov.cells[0],{lesson_code:'B1',type:'MC',level:'Biết',need:9,selected:1,available:1,short:8,bankShort:8});
  assert.equal(cov.outside,1);assert.equal(cov.need,12);
  console.log('PASS frontend: matrix cell coverage while choosing revision questions');
}
{
  const cells=[{key:'a',need:8,available:30},{key:'b',need:2,available:3}];
  assert.deepEqual(core.distributeCounts(cells,20),{a:16,b:3});
  assert.deepEqual(core.distributeCounts(cells,7),{a:6,b:1});
  assert.deepEqual(core.distributeCounts(cells,0),{});
  const cell={lesson_code:'B1',type:'MC',level:'Biết',outcomes:['Y1']};
  assert.equal(core.cellMatches(cell,{lesson_code:'B1',type:'MC',level:'Biết',learning_outcome:'Y1'}),true);
  assert.equal(core.cellMatches(cell,{lesson_code:'B1',type:'MC',level:'Biết',learning_outcome:'Y2'}),false);
  assert.equal(core.cellMatches({...cell,outcomes:[]},{lesson_code:'B1',type:'MC',level:'Biết',learning_outcome:'Y2'}),true);
  console.log('PASS frontend: chia số câu đề cương theo ô, khớp câu với ô có YCCĐ');
}


for (const grade of [8, 10]) for (const period of ['GK1', 'CK1', 'GK2', 'CK2']) assert.equal(core.sourceTemplateRequired(grade, period), true);
assert.equal(core.sourceTemplateRequired(9, 'GK1'), false);
assert.equal(core.sourceTemplateRequired(8, 'TX'), false);
assert.ok(core.DocFormatter.toolbarHtml('test-key', true).includes('data-fmt-align="center"'));
assert.ok(core.DocFormatter.toolbarHtml('test-key', false).includes('data-fmt-cmd="export-word"'));

assert.deepEqual(core.jsonHeaders(''), {'Content-Type':'application/json'});
assert.deepEqual(core.jsonHeaders('test-csrf-token'), {'Content-Type':'application/json','X-CSRFToken':'test-csrf-token'});
assert.notEqual(core.formatStoragePrefix('teacher-a'), core.formatStoragePrefix('teacher-b'));
assert.equal(core.formatStoragePrefix(''), 'tin_doc_fmt_v2:');
assert.equal(core.scopedUrl('/api/state','course-a'), '/api/state?curriculum=course-a');
assert.equal(core.scopedUrl('/api/exams/a/export?format=docx','course-a'), '/api/exams/a/export?format=docx&curriculum=course-a');
assert.equal(core.scopedUrl('/api/state',''), '/api/state');
assert.equal(core.scopedUrl('https://example.test/path','course-a'), 'https://example.test/path');
assert.deepEqual(core.contextGrades({allowed_grades:[12]}), [12]);
assert.deepEqual(core.contextGrades({}), [6,7,8,9,10,11,12]);
const physicsContext={curriculum_id:'physics-course',subject_name:'Vật lí',allowed_grades:[10]};
const physicsLessons=[{grade:10,lesson_code:'VL01',lesson_name_source:'Làm quen với Vật lí học'}];
const samples={'Vật lí':{10:[{grade:10,lesson_code:'STATIC01'}]}};
assert.deepEqual(core.courseLessons(physicsLessons,physicsContext,10,'Vật lí',samples),physicsLessons);
assert.deepEqual(core.courseLessons([],physicsContext,10,'Vật lí',samples),[]);
assert.deepEqual(core.courseLessons(physicsLessons,physicsContext,9,'Vật lí',samples),[]);
assert.deepEqual(core.courseLessons(physicsLessons,physicsContext,10,'Tin học',samples),[]);
// Saved-document edits affect its snapshot, including shuffled choices, not the bank.
const originalQuestion={id:'q1',type:'MC',question:'Câu gốc',options:['A gốc','B gốc','C gốc','D gốc'],correct:0};
const snapshot={questions:[structuredClone(originalQuestion)]};
snapshot.questions[0].options.reverse();snapshot.questions[0].correct=3;
const article={dataset:{editQid:'q1'},querySelector:()=>({textContent:'Câu trong bản đề'}),querySelectorAll:selector=>selector==='[data-edit-opt]'?[{dataset:{editOpt:'0'},textContent:'Phương án trong đề'}]:[]};
const sheet={querySelectorAll:()=>[article]};
core.syncEditedQuestionsFromSheet(sheet,snapshot);
assert.equal(snapshot.questions[0].question,'Câu trong bản đề');
assert.equal(snapshot.questions[0].options[0],'Phương án trong đề');
assert.equal(originalQuestion.question,'Câu gốc');
assert.deepEqual(originalQuestion.options,['A gốc','B gốc','C gốc','D gốc']);

// Mốc A3: dữ liệu câu do AI đề xuất gửi đủ trường khi lưu vào ngân hàng.
assert.deepEqual(core.mcExplanations(['a','b','c','d'],2,'Giải thích mới'),['a','b','Giải thích mới','d']);
assert.deepEqual(core.mcExplanations(undefined,1,'X'),['','X','','']);
assert.deepEqual(core.mcExplanations(['chỉ một'],0,''),['chỉ một','','','']);
assert.equal(core.shortAnswerOf({short_answer:' 2 '}),'2');
assert.equal(core.shortAnswerOf({correct_answer:'2'}),'2');
assert.equal(core.shortAnswerOf({answer:'2'}),'2');
assert.equal(core.shortAnswerOf({}),'');
console.log('PASS frontend: giải thích 4 phương án, đáp án trả lời ngắn');

// B1: hàng đợi duyệt câu hỏi
{
  const rq=[
    {id:'p2',grade:9,lesson_code:'B2',type:'MC',level:'Hiểu',review_status:'pending_review',origin:'ai_gemini'},
    {id:'p1',grade:9,lesson_code:'B1',type:'ES',level:'Vận dụng',review_status:'pending_review',origin:'teacher'},
    {id:'p0',grade:9,lesson_code:'B1',type:'MC',level:'Biết',review_status:'content_checked',origin:'teacher'},
    {id:'n1',grade:9,lesson_code:'B1',type:'MC',level:'Biết',review_status:'needs_review'},
    {id:'a1',grade:9,lesson_code:'B1',type:'MC',level:'Biết',review_status:'approved'},
    {id:'x1',grade:8,lesson_code:'B1',type:'MC',level:'Biết',review_status:'archived'}];
  assert.deepEqual(core.reviewQueue(rq,{}).map(q=>q.id),['p0','p1','p2']);  // mặc định: chờ duyệt, theo bài rồi mức độ
  assert.deepEqual(core.reviewQueue(rq,{origin:'ai_gemini'}).map(q=>q.id),['p2']);
  assert.deepEqual(core.reviewQueue(rq,{status:'needs_review'}).map(q=>q.id),['n1']);
  assert.deepEqual(core.reviewQueue(rq,{status:'pending_review',type:'ES'}).map(q=>q.id),['p1']);
  assert.deepEqual(core.reviewQueue(rq,{grade:'8',status:'all'}).map(q=>q.id),[]);  // "tất cả" vẫn bỏ câu lưu trữ
  assert.equal(core.reviewKeyAction('a'),'approve');assert.equal(core.reviewKeyAction('R'),'return');
  assert.equal(core.reviewKeyAction('j'),'next');assert.equal(core.reviewKeyAction('k'),'prev');
  assert.equal(core.reviewKeyAction('e'),'edit');assert.equal(core.reviewKeyAction('x'),null);
  assert.equal(core.stepIndex(0,-1,3),0);assert.equal(core.stepIndex(2,1,3),2);assert.equal(core.stepIndex(1,1,3),2);assert.equal(core.stepIndex(0,1,0),0);
  const items=[{key:'accurate'},{key:'answer'}];
  assert.deepEqual(core.checklistMissing({accurate:true},items),['answer']);
  assert.deepEqual(core.checklistMissing({accurate:true,answer:true},items),[]);
  assert.deepEqual(core.checklistMissing({accurate:'true',answer:1},items),['accurate','answer']);  // chỉ nhận đúng true
  assert.deepEqual(core.reviewProgress(rq),{draft:0,pending_review:3,needs_review:1,approved:1,total:5});
  console.log('PASS frontend: hàng đợi duyệt, phím tắt, phiếu kiểm định, tiến độ');
}

// B2: vòng đời đề — nút được phép theo trạng thái
{
  assert.equal(core.examStatusOf({}),'drafting');
  assert.deepEqual(core.examActions({status:'drafting'}),['submit']);
  assert.deepEqual(core.examActions({status:'pending_approval'}),['approve','return']);
  assert.deepEqual(core.examActions({status:'locked'}),['publish','new_revision']);
  assert.deepEqual(core.examActions({status:'published'}),['new_revision']);
  assert.equal(core.examEditable({status:'locked'}),false);assert.equal(core.examEditable({status:'pending_approval'}),true);
  console.log('PASS frontend: vòng đời đề');
}

// B8: gợi ý số thứ tự bài KTTX tiếp theo
{
  const acts=[{grade:8,semester:1,k:1,class_name:''},{grade:8,semester:1,k:3,class_name:''},{grade:8,semester:2,k:1,class_name:''},{grade:8,semester:1,k:1,class_name:'8A1'}];
  assert.equal(core.nextKttxNumber(acts,8,1,''),4);
  assert.equal(core.nextKttxNumber(acts,8,2,''),2);
  assert.equal(core.nextKttxNumber(acts,8,1,'8A1'),2);
  assert.equal(core.nextKttxNumber(acts,9,1,''),1);
  console.log('PASS frontend: số thứ tự KTTX');
}

// B9: lọc màn hình duyệt theo đúng ô ma trận (cả YCCĐ)
{
  const qs=[{id:'a',grade:9,lesson_code:'B1',type:'MC',level:'Biết',learning_outcome:'YCCĐ một',review_status:'pending_review'},
            {id:'b',grade:9,lesson_code:'B1',type:'MC',level:'Biết',learning_outcome:'YCCĐ hai',review_status:'pending_review'}];
  assert.deepEqual(core.reviewQueue(qs,{outcome:'YCCĐ hai'}).map(q=>q.id),['b']);
  assert.deepEqual(core.reviewFiltersForCell({grade:9,lesson_code:'B1',kind:'MC',level:'Biết',outcome:'YCCĐ hai'}),
    {status:'pending_review',grade:'9',lesson:'B1',type:'MC',level:'Biết',origin:'',outcome:'YCCĐ hai'});
  console.log('PASS frontend: lọc duyệt theo ô ma trận');
}

// Hướng dẫn theo màn hình đang mở: mỗi thẻ chính có hướng dẫn riêng, chi tiết
{
  const tabs=['overview','bank','review','ppct','revisions','matrices','exams','kttx'];
  tabs.forEach(t=>{const g=core.screenGuide(t);assert.ok(g.title&&g.purpose,t);assert.ok(g.steps.length>=3,t);});
  assert.equal(new Set(tabs.map(t=>core.screenGuide(t).title)).size,tabs.length);
  assert.equal(core.screenGuide('khong-co').title,'Tổng quan');
  assert.match(core.screenGuide('bank',{testMode:true}).tips[0],/Chế độ Test/);
  assert.ok(!core.screenGuide('bank').tips.some(x=>/Chế độ Test/.test(x)));
  assert.ok(core.screenGuide('ppct').steps.some(x=>/Word hoặc JSON/.test(x)));
  console.log('PASS frontend: hướng dẫn theo màn hình');
}

// Included in the established frontend validation command.
require('./exam_drafts.test.cjs');

// G1-LEVEL4: giữ VDC trong lựa chọn, lọc đúng ô và thứ tự duyệt.
{
 const options=core.levelOptions('Vận dụng cao');
 assert.match(options,/<option value="Vận dụng cao" selected>Vận dụng cao<\/option>/);
 assert.equal((options.match(/<option /g)||[]).length,4);
 const questions=[{id:'a',grade:9,lesson_code:'B1',level:'Chưa xác định',review_status:'pending_review'},
  {id:'z',grade:9,lesson_code:'B1',level:'Vận dụng cao',review_status:'pending_review'},
  {id:'v',grade:9,lesson_code:'B1',level:'Vận dụng',review_status:'pending_review'}];
 assert.deepEqual(core.reviewQueue(questions).map(q=>q.id),['v','z','a']);
 assert.deepEqual(core.filterQuestions(questions,{level:'Vận dụng cao'}).map(q=>q.id),['z']);
 assert.deepEqual(core.reviewQueue(questions,core.reviewFiltersForCell({grade:9,lesson_code:'B1',level:'Vận dụng cao'})).map(q=>q.id),['z']);
}
console.log('PASS ngân hàng bốn mức: lựa chọn, lọc và thứ tự duyệt');
assert.equal(core.levelAfterTypeChange('Vận dụng cao','ES'),'Vận dụng cao');
assert.equal(core.levelAfterTypeChange('Biết','ES'),'Vận dụng');
assert.equal(core.levelAfterTypeChange('Vận dụng cao','MC'),'Vận dụng cao');

// Rich question checks run with the established frontend validation command.
require('./question_text_frontend.test.cjs');
