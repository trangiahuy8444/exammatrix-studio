const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {webcrypto}=require('node:crypto');globalThis.crypto=webcrypto;
const api=require('../public/static-api.js'),engine=require('../public/static-exam-engine.js'),workflow=require('../public/static-exam-workflow.js');
const {fixture}=require('./static_api.test.cjs');
function harness({server=false,quota=false,cloudFail=false}={}){
 const values=new Map([['exammatrix_teacher_cache_offline',JSON.stringify(fixture())]]),status={hidden:true,textContent:''};
 const window={location:{hostname:'localhost',protocol:'http:'},BankStaticAPI:api,BankStaticEngine:engine,BankStaticWorkflow:workflow,
  BankExamComparison:require('../public/exam-comparison.js'),BankCore:require('../public/core.js'),crypto:webcrypto};
 const context={window,crypto:webcrypto,console,setTimeout,clearTimeout,document:{querySelector:()=>server?{}:null,getElementById:k=>k==='static-sync-status'?status:null},
  localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>{if(quota)throw Error('quota');values.set(k,v);}}};
 const source=fs.readFileSync(require.resolve('../public/firebase-bridge.js'),'utf8').replace('  setupOfflineBanner();','  window.testLoadFromFirestore = loadFromFirestore;\n  setupOfflineBanner();');
 vm.runInNewContext(source,context);
 if(cloudFail){window.FirebaseState.user={uid:'test-user'};window.FirebaseState.db={};window.FirebaseState._firestoreHelpers={doc:()=>({}),setDoc:async()=>{throw Error('offline');}};}
 return {window,values,status};
}
async function main(){
 const server=harness({server:true});assert.equal(server.window.FirebaseClient.canHandle('/api/state'),false);
 const h=harness();assert.equal(h.window.FirebaseClient.canHandle('/api/state'),true);
 await assert.rejects(h.window.FirebaseClient.handle('/api/unknown',{}));
 await assert.rejects(h.window.FirebaseClient.handle('/api/test/reset',{}));
 await assert.rejects(h.window.FirebaseClient.handle('/api/kttx'));
 const inspected=await h.window.FirebaseClient.handle('/api/exams/inspect-import',{candidates:[{verification:{passed:true}}]});
 assert.equal(inspected.all_passed,false);
 await assert.rejects(h.window.FirebaseClient.handle('/api/exams/import-verified',{candidates:inspected.candidates}));
 const state=await h.window.FirebaseClient.handle('/api/state');state.bank.questions[0].question='Sửa phía trình bày';
 assert.notEqual((await h.window.FirebaseClient.handle('/api/state')).bank.questions[0].question,'Sửa phía trình bày');
 const before=h.values.get('exammatrix_teacher_cache_offline');
 const q=fixture().bank.questions[0];const quota=harness({quota:true});
 await assert.rejects(quota.window.FirebaseClient.handle('/api/questions/save',{question:{...q,question:'Sửa thử'}}));
 assert.equal(quota.values.get('exammatrix_teacher_cache_offline'),before);
 assert.equal((await quota.window.FirebaseClient.handle('/api/state')).bank.questions[0].question,q.question);
 const cloud=harness({cloudFail:true});
 await cloud.window.FirebaseClient.handle('/api/questions/save',{question:{...q,question:'Đã lưu cục bộ'}});
 assert.ok(cloud.values.get('exammatrix_teacher_cache_test-user').includes('Đã lưu cục bộ'));
 assert.equal(JSON.parse(cloud.values.get('exammatrix_teacher_cache_test-user'))._sync.pending,true);
 assert.equal(cloud.status.hidden,false);assert.match(cloud.status.textContent,/chưa đồng bộ/i);
 let remoteReads=0;
 cloud.window.store={bank:{}};
 await cloud.window.testLoadFromFirestore({uid:'test-user'},{},{doc:()=>({}),getDoc:async()=>{remoteReads++;return {exists:()=>true,data:()=>fixture()};}});
 assert.equal(remoteReads,0);assert.equal(cloud.window.FirebaseState.currentData.bank.questions[0].question,'Đã lưu cục bộ');
 cloud.window.store.bank.questions[0].question='Sửa trong giao diện';
 assert.equal(cloud.window.FirebaseState.currentData.bank.questions[0].question,'Đã lưu cục bộ');
 assert.match(cloud.window.BankCore.DocFormatter.storagePrefix,/test-user/);
 const newUser=harness();newUser.window.FirebaseState.user={uid:'new-user'};newUser.window.store={bank:{}};
 await newUser.window.testLoadFromFirestore({uid:'new-user'},{},{doc:()=>({}),getDoc:async()=>({exists:()=>false}),setDoc:async()=>{}});
 assert.equal(newUser.window.FirebaseState.currentData.bank.questions.length,0);
 assert.equal(newUser.window.store.bank.questions.length,0);
 const allGrades=harness();allGrades.window.FirebaseState.currentData.bank.ppct.lessons.push({grade:11,subject_name:'Tin học',lesson_code:'B11',outcomes:['YCCĐ minh họa']});
 await allGrades.window.FirebaseClient.handle('/api/state');
 assert.ok(allGrades.window.FirebaseState.currentData.bank.ppct.lessons.some(l=>l.grade===11));
 const concurrent=harness();
 await Promise.all([0,1].map(n=>concurrent.window.FirebaseClient.handle('/api/questions/save',{question:{...fixture().bank.questions[n],question:'Ghi đồng thời '+n}})));
 assert.equal(concurrent.window.FirebaseState.currentData.bank.questions[0].question,'Ghi đồng thời 0');
 assert.equal(concurrent.window.FirebaseState.currentData.bank.questions[1].question,'Ghi đồng thời 1');
 console.log('PASS bridge: không chặn Django, không thành công giả, cô lập phản hồi, rollback khi hết bộ nhớ và cảnh báo đồng bộ');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={harness,main};
