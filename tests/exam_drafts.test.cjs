const assert=require('node:assert/strict');
const C=require('../public/core.js');
const scope={workspace:'teacher-a',curriculum:'c1',subject:'Tin học',test:false};
const context={grades:[8,9,10],lessons:[{lesson_code:'B1'}],revisions:[{id:'r1',grade:9}],matrices:[{id:'m1',grade:9,exam_type:'TX',status:'locked'}],templates:[]};
const draft={grade:9,exam_type:'TX',title:'Nháp',duration:60,seed:'abc',revision_id:'r1',matrix_id:'m1',template_id:'',similarity_percent:95,similarity_mode:'exact',set_count:3,set_rev:'r1',set_counts:{cell:12},blueprint:[{lesson_code:'B1',type:'MC',level:'Biết',count:10,points_per_question:1}],questions:['secret'],csrf:'secret'};
const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
assert.equal(C.saveExamDraft(storage,scope,draft),true);
const restored=C.loadExamDraft(storage,scope,context);
assert.equal(restored.title,'Nháp');assert.equal(restored.grade,9);assert.equal(restored.matrix_id,'m1');assert.equal(restored.set_rev,'r1');assert.equal(restored.set_counts.cell,12);assert.deepEqual(restored.blueprint,draft.blueprint);
assert.ok(!JSON.stringify([...values.values()]).includes('secret'));
for(const other of [{workspace:'b'},{curriculum:'c2'},{subject:'Vật lí'},{test:true}])assert.equal(C.loadExamDraft(storage,{...scope,...other},context),null);
const stale=C.loadExamDraft(storage,scope,{...context,revisions:[],matrices:[],lessons:[]});assert.equal(stale.matrix_id,'');assert.equal(stale.revision_id,'');assert.equal(stale.set_rev,'auto');assert.deepEqual(stale.blueprint,[]);
const bad={getItem:()=>'{broken',setItem:()=>{throw Error('quota');}};assert.equal(C.loadExamDraft(bad,scope,context),null);assert.equal(C.saveExamDraft(bad,scope,draft),false);
assert.equal(C.loadExamDraft({getItem:()=>{throw Error('private');}},scope,context),null);
C.saveExamDraft(storage,scope,{grade:99,exam_type:'BAD',duration:-1,title:{x:1},blueprint:[null],set_counts:{bad:-1},set_count:99});const invalid=C.loadExamDraft(storage,scope,context);assert.equal(invalid.grade,8);assert.equal(invalid.exam_type,'GK1');assert.equal(invalid.duration,45);assert.equal(invalid.title,'');assert.deepEqual(invalid.blueprint,[]);assert.deepEqual(invalid.set_counts,{});
console.log('PASS browser exam drafts: reload, scope isolation, whitelist, stale IDs and unavailable storage');

// Ràng buộc YCCĐ là một phần của phân bố, không được mất sau tải lại.
{
 const c={...context,lessons:[{lesson_code:'B1',outcomes:['YCCĐ A','YCCĐ B']}]};
 const row={...draft.blueprint[0],outcomes:['YCCĐ A']};
 C.saveExamDraft(storage,scope,{...draft,blueprint:[row]});
 assert.deepEqual(C.loadExamDraft(storage,scope,c).blueprint,[row]);
 const staleOutcome=C.loadExamDraft(storage,scope,{...c,lessons:[{lesson_code:'B1',outcomes:['YCCĐ B']}]});
 assert.deepEqual(staleOutcome.blueprint,[],'YCCĐ đã mất phải vô hiệu dòng, không nới thành mọi YCCĐ');
}

{
 const noOwner={...scope,workspace:''};
 const before=values.size;
 assert.equal(C.loadExamDraft(storage,noOwner,context),null);
 assert.equal(C.saveExamDraft(storage,noOwner,draft),false);
 assert.equal(values.size,before);
 assert.equal(C.examDraftKey(noOwner),null);
 assert.equal(C.examDraftKey(null),null);
}
