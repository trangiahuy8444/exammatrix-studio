const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const comparison = require('../public/exam-comparison.js');
const examples = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/exam_comparison.json')));
const cases = [examples()];
{const e=examples();e[0].questions[0].points='0.0001245';e[1].questions[0].points='0.000125';cases.push(e);}
{const e=examples();e.forEach((ex,i)=>ex.questions.forEach((q,j)=>Object.assign(q,{type:'MC',level:'Biết',lesson_code:'B1',learning_outcome:'Cùng YCCĐ',points:(i?[5,5]:[1,9])[j]})));cases.push(e);}
for (const key of ['grade', 'subject_name', 'exam_type', 'duration']) {
  const e = examples(); delete e[1][key]; cases.push(e);
}
for (const value of [null, '', true, -1, 'NaN', 'Infinity', [], {}, '0.125', 0.1, '1.0000005', '1_0']) {
  const e = examples(); e[1].questions[0].points = value; cases.push(e);
}
for (const field of ['type', 'level', 'lesson_code', 'learning_outcome', 'id']) {
  const e = examples(); delete e[1].questions[0][field]; cases.push(e);
}
{const e=examples();e[1].questions=[];cases.push(e);}
{const e=examples();e[1].questions[0]=null;cases.push(e);}
{const e=examples();e[1].grade=10;cases.push(e);}
{const e=examples();e[1].questions[0].id='Q1';e[1].parent_exam_id='E1';cases.push(e);}
{const e=examples();e[1].questions[0].level='Hiểu';e[1].questions[1].level='Biết';cases.push(e);}
{const e=examples();e.forEach((ex,i)=>{ex.questions=Array.from({length:i?17:16},(_,n)=>({...ex.questions[0],id:n===0?'shared':`${i}-${n}`}));});cases.push(e);}
const python = spawnSync(process.env.EXAM_COMPARISON_PYTHON || 'python3', ['-c',
  'import json,sys;from domain.exam_comparison import compare_exams;print(json.dumps([compare_exams(e) for e in json.load(sys.stdin)],ensure_ascii=False))'],
  {cwd:path.join(__dirname,'..'), input:JSON.stringify(cases), encoding:'utf8'});
assert.equal(python.status, 0, python.stderr);
const before = JSON.stringify(cases);
assert.deepEqual(cases.map(comparison.compareExams), JSON.parse(python.stdout));
assert.equal(JSON.stringify(cases), before);
for(const value of [null, {}, [], examples().slice(0,1), [examples()[0], examples()[0]]]) {
  assert.throws(()=>comparison.compareExams(value));
}
const evil=examples();evil[0].title='<img src=x onerror=alert(1)>';
const html=comparison.reportHtml(comparison.compareExams(evil));
assert.ok(!html.includes('<img'));
assert.ok(html.includes('&lt;img'));
assert.ok(!html.includes('rubric'));
// Thực thi cầu nối Pages thật, không tải Firebase hoặc dùng dữ liệu giáo viên.
const values=new Map([['exammatrix_teacher_cache_offline',JSON.stringify({bank:{questions:[],ppct:{lessons:[]}},exams:examples(),revisions:[],matrices:[]})]]);
const window={location:{hostname:'teacher.github.io',protocol:'https:'},BankExamComparison:comparison,
 BankStaticAPI:require('../public/static-api.js'),BankStaticEngine:require('../public/static-exam-engine.js'),BankStaticWorkflow:require('../public/static-exam-workflow.js')};
const context={window,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},document:{getElementById:()=>null},console};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/firebase-bridge.js'),'utf8'),context);
(async()=>{
 const before=JSON.stringify([...values]);
 const report=await window.FirebaseClient.handle('/api/exams/compare',{ids:['E1','E2']});
 assert.equal(report.pairs[0].same_structure,true);
 assert.equal(JSON.stringify([...values]),before);
 await assert.rejects(window.FirebaseClient.handle('/api/exams/compare',{ids:['E1','missing']}));
 await assert.rejects(window.FirebaseClient.handle('/api/exams/compare',{ids:['E1','E1']}));
 // Kiểm chính hàm mở hộp thoại và submit đang dùng trong app.js.
 const selected=[],error={hidden:true,textContent:''},button={disabled:false,textContent:''},result={innerHTML:''};
 const form={innerHTML:'',querySelectorAll:()=>selected.map(value=>({value})),querySelector:()=>button};
 const dialog={showModal(){this.open=true;}};
 const elements={'#exam-comparison-dialog':dialog,'#exam-comparison-form':form,'#exam-comparison-result':result,'#exam-comparison-error':error};
 let calls=0,fail=false;
 const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const code=source.slice(source.indexOf('function openExamComparison('),source.indexOf('function renderExams('));
 const ui={$:k=>elements[k],currentExams:()=>evil,esc:require('../public/core.js').escapeHtml,window:{BankExamComparison:comparison},
   detailError:e=>e.message,request:async(route,payload)=>{calls++;assert.equal(route,'/api/exams/compare');if(fail)throw Error('Không tìm thấy đề.');return comparison.compareExams(examples());}};
 vm.runInNewContext(code,ui);ui.openExamComparison('E1');
 assert.equal(dialog.open,true);assert.ok(!form.innerHTML.includes('<img'));
 await form.onsubmit({preventDefault(){}});assert.equal(calls,0);assert.equal(error.hidden,false);
 selected.push('E1','E2');await form.onsubmit({preventDefault(){}});
 assert.equal(calls,1);assert.ok(result.innerHTML.includes('Khớp cấu trúc'));assert.equal(button.disabled,false);
 fail=true;await form.onsubmit({preventDefault(){}});assert.equal(error.textContent,'Không tìm thấy đề.');assert.equal(result.innerHTML,'');
 selected.push('3','4','5','6','7');await form.onsubmit({preventDefault(){}});assert.equal(calls,2);
 console.log(`PASS so sánh đề: ${cases.length} kịch bản Python/JS, escape HTML, Pages thật và chỉ đọc`);
})().catch(e=>{console.error(e);process.exitCode=1;});
