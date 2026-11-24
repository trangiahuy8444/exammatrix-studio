const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {webcrypto}=require('node:crypto');globalThis.crypto=webcrypto;
const api=require('../public/static-api.js'),engine=require('../public/static-exam-engine.js'),workflow=require('../public/static-exam-workflow.js');
const {fixture}=require('./static_api.test.cjs');
function harness({server=false}={}){
 // Ba cách lưu cũ (Drive v1, Firestore v1, bộ nhớ trình duyệt) đã gỡ 24/11/2026: dữ liệu mẫu nạp qua EXAMMATRIX_TEST_SEED,
 // chưa cấu hình Firebase thì chỉ nằm trong bộ nhớ trang; không ghi localStorage.
 const values=new Map(),status={hidden:true,textContent:''};
 const window={location:{hostname:'localhost',protocol:'http:'},BankStaticAPI:api,BankStaticEngine:engine,BankStaticWorkflow:workflow,
  BankExamComparison:require('../public/exam-comparison.js'),BankCore:require('../public/core.js'),crypto:webcrypto,EXAMMATRIX_TEST_SEED:fixture()};
 const context={window,crypto:webcrypto,console,setTimeout,clearTimeout,document:{querySelector:()=>server?{}:null,getElementById:k=>k==='static-sync-status'?status:null},
  localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/firebase-bridge.js'),'utf8'),context);
 return {window,values,status};
}
async function main(){
 const server=harness({server:true});assert.equal(server.window.FirebaseClient.canHandle('/api/state'),false);
 const h=harness();assert.equal(h.window.FirebaseClient.canHandle('/api/state'),true);
 await assert.rejects(h.window.FirebaseClient.handle('/api/unknown',{}));
 await assert.rejects(h.window.FirebaseClient.handle('/api/test/reset',{}));
 const kttxH=harness();
 kttxH.window.FirebaseState.currentData.bank.ppct.lessons.push({
  grade:10,subject_name:'Tin học',section:'elective_topic',orientation:'ICT',
  lesson_code:'CD1',lesson_name_source:'Chuyên đề 1: Quản trị dự án',
  occurrences:[{duration_raw:'10'}],outcomes:['Lập kế hoạch dự án']
 });
 const kt0=await kttxH.window.FirebaseClient.handle('/api/kttx');
 assert.ok(Array.isArray(kt0.activities)&&Array.isArray(kt0.overview));
 assert.equal(kt0.elective_topics_by_grade['10'][0].lesson_code,'CD1');
 await assert.rejects(kttxH.window.FirebaseClient.handle('/api/kttx/save',{activity:{grade:8,semester:1,k:1,form:'cum_chuyen_de',max_score:'10',recorded:true}}));
 const ktSaved=await kttxH.window.FirebaseClient.handle('/api/kttx/save',{activity:{grade:10,semester:1,k:1,form:'cum_chuyen_de',max_score:'20',recorded:true,lesson_codes:['CD1'],orientation:'ICT'}});
 assert.equal(ktSaved.activity.orientation,'ICT');
 assert.deepEqual([...ktSaved.activity.lesson_codes],['CD1']);
 const kt1=await kttxH.window.FirebaseClient.handle('/api/kttx');
 const row10=kt1.overview.find(r=>r.grade===10&&r.semester===1);
 assert.equal(row10.cluster_recorded,1);
 await kttxH.window.FirebaseClient.handle('/api/kttx/delete',{id:ktSaved.activity.id});
 assert.equal((await kttxH.window.FirebaseClient.handle('/api/kttx')).activities.length,0);
 const inspected=await h.window.FirebaseClient.handle('/api/exams/inspect-import',{candidates:[{verification:{passed:true}}]});
 assert.equal(inspected.all_passed,false);
 await assert.rejects(h.window.FirebaseClient.handle('/api/exams/import-verified',{candidates:inspected.candidates}));
 const state=await h.window.FirebaseClient.handle('/api/state');state.bank.questions[0].question='Sửa phía trình bày';
 assert.notEqual((await h.window.FirebaseClient.handle('/api/state')).bank.questions[0].question,'Sửa phía trình bày');
 // Không còn ghi dữ liệu học vụ vào bộ nhớ trình duyệt.
 const q=fixture().bank.questions[0];
 await h.window.FirebaseClient.handle('/api/questions/save',{question:{...q,question:'Chỉ trong bộ nhớ trang'}});
 assert.equal(h.window.FirebaseState.currentData.bank.questions[0].question,'Chỉ trong bộ nhớ trang');
 assert.equal([...h.values.keys()].filter(k=>k.startsWith('exammatrix_teacher_cache_')).length,0,'Không ghi cache workspace');
 assert.equal(h.values.has('exammatrix_emergency_backup'),false);
 assert.equal(typeof h.window.FirebaseClient.loadFromGoogleDrive,'undefined','Đã gỡ chế độ Google Drive v1');
 // Không có dữ liệu mẫu: bắt đầu rỗng, không nạp bản cũ trong trình duyệt.
 const emptyH=(()=>{const w={location:{hostname:'localhost',protocol:'http:'},BankStaticAPI:api,BankStaticEngine:engine,BankStaticWorkflow:workflow,BankCore:require('../public/core.js'),crypto:webcrypto};
  const old=new Map([['exammatrix_teacher_cache_offline',JSON.stringify(fixture())]]);
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/firebase-bridge.js'),'utf8'),{window:w,crypto:webcrypto,console,setTimeout,clearTimeout,document:{querySelector:()=>null,getElementById:()=>null},localStorage:{getItem:k=>old.get(k),setItem:()=>{},key:i=>[...old.keys()][i],get length(){return old.size;}}});return w;})();
 assert.equal(emptyH.FirebaseState.currentData.bank.questions.length,0,'Bản cũ trong trình duyệt không tự nạp');
 const rescue=await emptyH.FirebaseClient.rescueBestCache();
 assert.equal(rescue.found,true,'Công cụ cứu hộ vẫn đọc được bản cũ');assert.equal(rescue.questionsCount,fixture().bank.questions.length);
 const allGrades=harness();allGrades.window.FirebaseState.currentData.bank.ppct.lessons.push({grade:11,subject_name:'Tin học',lesson_code:'B11',outcomes:['YCCĐ minh họa']});
 await allGrades.window.FirebaseClient.handle('/api/state');
 assert.ok(allGrades.window.FirebaseState.currentData.bank.ppct.lessons.some(l=>l.grade===11));
 const concurrent=harness();
 await Promise.all([0,1].map(n=>concurrent.window.FirebaseClient.handle('/api/questions/save',{question:{...fixture().bank.questions[n],question:'Ghi đồng thời '+n}})));
 assert.equal(concurrent.window.FirebaseState.currentData.bank.questions[0].question,'Ghi đồng thời 0');
 assert.equal(concurrent.window.FirebaseState.currentData.bank.questions[1].question,'Ghi đồng thời 1');
 console.log('PASS bridge: không chặn Django, cô lập phản hồi, không ghi cache trình duyệt, cứu hộ vẫn đọc bản cũ');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={harness,main};
