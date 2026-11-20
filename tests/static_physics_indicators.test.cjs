const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../public/static-exam-engine.js'),api=require('../public/static-api.js'),workflow=require('../public/static-exam-workflow.js');
const {fixture}=require('./static_api.test.cjs');
function physics(name='Vật lí'){
 const d=fixture(),m=d.matrices[0];m.profile='THPT';m.grade=10;m.subject_name=name;m.requirements[0].competency=name.startsWith('Toán')?'TDLL':'NL_CHUNG';
 d.bank.ppct.lessons.forEach(l=>{l.grade=10;l.subject_name=name;});d.bank.questions.forEach(q=>{q.grade=10;q.subject_name=name;});
 return d;
}
test('Physics and Math THPT without an indicator catalog can validate and lock',async()=>{
 for(const name of ['Vật lí','Vật lý','Toán học']){
  const d=physics(name),m=d.matrices[0],before=JSON.stringify(d);
  assert.equal(engine.validateMatrix(m,d.bank.ppct).valid,true,name);
  const r=await api.handle('/api/matrices/lock',{id:m.id,expected_revision:m.revision,confirmation:{confirmed_by:'GV thử',external_agreement:true}},d,{engine,workflow,subject:name});
  assert.equal(r.response.matrix.status,'locked');assert.equal(JSON.stringify(d),before);
  assert.deepEqual(r.response.matrix.slots,m.slots);assert.deepEqual(r.response.matrix.requirements,m.requirements);
 }
});
test('explicit indicators still must exist and match the requirement competency',()=>{
 const d=physics(),m=d.matrices[0];m.slots[0].parts[0].indicator='VL1';
 let report=engine.validateMatrix(m,d.bank.ppct);let error=report.errors.find(e=>e.code==='indicator');
 assert.equal(report.valid,false);assert.match(error.message,/Câu 1/);assert.match(error.message,/VL1/);assert.match(error.path,/S1.*P1/);
 m.indicator_catalog=[{code:'VL1',competency:'NLa',text:'Minh họa sai nhóm'}];
 report=engine.validateMatrix(m,d.bank.ppct);assert.equal(report.valid,false);assert.match(report.errors.find(e=>e.code==='indicator').message,/NL_CHUNG/);
 m.indicator_catalog[0].competency='NL_CHUNG';m.slots.forEach(s=>s.parts.forEach(p=>p.indicator='VL1'));
 assert.equal(engine.validateMatrix(m,d.bank.ppct).valid,true);
 delete m.slots[1].parts[0].indicator;
 assert.equal(engine.validateMatrix(m,d.bank.ppct).valid,false,'Catalog đã khai báo cần ánh xạ đủ từng vị trí');
});
test('Tin THPT keeps required indicators and Physics keeps real point/outcome checks',()=>{
 const tin=fixture();tin.matrices[0].profile='THPT';
 assert.ok(engine.validateMatrix(tin.matrices[0],tin.bank.ppct).errors.some(e=>e.code==='indicator'));
 for(const mutate of [m=>m.slots[0].parts[0].points=4,m=>m.requirements[0].ppct_outcome_index=99]){
  const d=physics();mutate(d.matrices[0]);assert.equal(engine.validateMatrix(d.matrices[0],d.bank.ppct).valid,false);
 }
});
test('failed lock returns the structured validation so UI can identify each error',async()=>{
 const d=physics();d.matrices[0].slots[0].parts[0].indicator='VL_MISSING';
 await assert.rejects(api.handle('/api/matrices/lock',{id:'M1',expected_revision:1,confirmation:{confirmed_by:'GV thử',external_agreement:true}},d,{engine,workflow,subject:'Vật lí'}),error=>{
  assert.equal(error.status,409);assert.ok(error.details?.errors?.length);assert.match(error.details.errors.find(e=>e.code==='indicator').message,/Câu 1/);return true;
 });
});
