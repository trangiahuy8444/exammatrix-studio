const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../public/static-api.js'),engine=require('../public/static-exam-engine.js'),workflow=require('../public/static-exam-workflow.js');
const {fixture}=require('./static_api.test.cjs');
const env={engine,workflow,subject:'Vật lí'};
const catalog=()=>({competencies:[{code:'VL',name:'Năng lực minh họa Vật lí'}],indicators:[{code:'VL.1',competency:'VL',text:'Chỉ báo minh họa'}]});
test('matrix DOCX retains imported competency names and indicators',()=>{
 const m=fixture().matrices[0];m.competency_catalog=catalog().competencies;m.indicator_catalog=catalog().indicators;
 m.requirements[0].competency='VL';m.slots.forEach(s=>s.parts.forEach(p=>p.indicator='VL.1'));
 const xml=new TextDecoder().decode(require('../public/static-exam-export.js').matrixBytes(m));
 assert.ok(xml.includes('Năng lực minh họa Vật lí'));assert.ok(xml.includes('VL.1'));assert.ok(xml.includes('Chỉ báo minh họa'));
});
test('catalogs persist per subject with conflict checks and no input mutation',async()=>{
 const input=fixture(),before=JSON.stringify(input);
 const saved=await api.handle('/api/matrices/catalog/save',{catalog:catalog(),expected_revision:0},input,env);
 assert.equal(saved.response.catalog.revision,1);assert.equal(JSON.stringify(input),before);
 assert.equal((await api.handle('/api/matrices/catalog',null,saved.data,{...env,subject:'Toán'})).response.catalog,null);
 assert.deepEqual((await api.handle('/api/matrices/catalog',null,saved.data,env)).response.catalog,saved.response.catalog);
 await assert.rejects(api.handle('/api/matrices/catalog/save',{catalog:catalog(),expected_revision:0},saved.data,env),e=>e.status===409);
 const bad=catalog();bad.indicators.push({...bad.indicators[0]});
 await assert.rejects(api.handle('/api/matrices/catalog/save',{catalog:bad,expected_revision:1},saved.data,env));
});
test('browser bridge lưu danh mục năng lực lên Cloud v2 (Firestore) theo môn',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
 const V2=require('../public/cloud-storage-v2.js'),{makeFirestoreMock}=require('./firestore_mock.cjs');
 const firestore=makeFirestoreMock();const user={uid:'catalog-test',email:'',isAnonymous:false};
 const seed=fixture();seed.matrices.forEach(m=>{m.subject_name='Vật lí';});
 await V2.firestoreWriteFullV2(user.uid,firestore.db,firestore.helpers,seed,{ownerEmail:''});
 const window={location:{hostname:'localhost',protocol:'http:'},BankStaticAPI:api,BankStaticEngine:engine,BankStaticWorkflow:workflow,
  BankCore:require('../public/core.js'),CloudStorageV2:V2,crypto:webcrypto,store:{selectedSubject:'Vật lí',bank:{}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/firebase-bridge.js'),'utf8'),{window,crypto:webcrypto,console:{...console,info(){},log(){}},setTimeout,clearTimeout,
  document:{querySelector:()=>null,getElementById:()=>null},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});
 Object.assign(window.FirebaseState,{provider:'firebase-cloud-v2',user,db:firestore.db,_firestoreHelpers:firestore.helpers});
 await window.FirebaseClient.loadFromCloudV2(user,{db:firestore.db,helpers:firestore.helpers});
 await window.FirebaseClient.handle('/api/matrices/catalog/save',{catalog:catalog(),expected_revision:0});
 const fresh=await V2.firestoreReadWorkspaceV2(user.uid,firestore.db,firestore.helpers);
 const saved=fresh.data.bank.competency_catalogs.find(c=>c.subject_name==='Vật lí');
 assert.ok(saved,'Danh mục phải nằm trên Firestore');assert.equal(saved.revision,1);
 assert.equal((await window.FirebaseClient.handle('/api/matrices/catalog')).catalog.revision,1);
});
test('matrix snapshot validates imported competencies and survives library updates',async()=>{
 const d=fixture(),m=d.matrices[0];m.subject_name='Vật lí';m.profile='THPT';m.grade=10;m.requirements[0].competency='VL';
 d.bank.ppct.lessons.forEach(l=>Object.assign(l,{subject_name:'Vật lí',grade:10}));
 m.competency_catalog=catalog().competencies;m.catalog_revision=1;m.indicator_catalog=catalog().indicators;
 m.slots.forEach(s=>s.parts.forEach(p=>p.indicator='VL.1'));
 assert.equal(engine.validateMatrix(m,d.bank.ppct).valid,true);
 const locked=await api.handle('/api/matrices/lock',{id:'M1',expected_revision:1,confirmation:{confirmed_by:'GV',external_agreement:true}},d,env);
 const prior=JSON.stringify(locked.response.matrix),digest=engine.matrixDigest(locked.response.matrix);
 const updated=await api.handle('/api/matrices/catalog/save',{catalog:catalog(),expected_revision:0},locked.data,env);
 assert.equal(JSON.stringify(updated.data.matrices[0]),prior);
 assert.equal(engine.matrixDigest(updated.data.matrices[0]),digest);
 const copy=structuredClone(m);copy.competency_catalog[0].name='Tên thay đổi';assert.notEqual(engine.matrixDigest(copy),engine.matrixDigest(m));
 copy.indicator_catalog.push({...copy.indicator_catalog[0]});assert.equal(engine.validateMatrix(copy,d.bank.ppct).valid,false);
});
test('package and draft routes cannot persist invalid imported catalog snapshots',async()=>{
 const input=fixture(),m=input.matrices[0],before=JSON.stringify(input);
 for(const bad of [{competency_catalog:[{code:'VL',name:''}],indicator_catalog:catalog().indicators,catalog_revision:1},{competency_catalog:catalog().competencies,indicator_catalog:catalog().indicators,catalog_revision:-1}]){
  const matrix={...m,...bad};
  await assert.rejects(api.handle('/api/matrices/save',{matrix,expected_revision:1},input,{...env,subject:'Tin học'}));
  await assert.rejects(api.handle('/api/matrices/import-package',{package:{format:'asian-school-matrix',schema_version:1,matrix}},input,env));
 }
 await assert.rejects(api.handle('/api/matrices/import-package',{package:{format:'asian-school-matrix',schema_version:1,matrix:m,content_sha256:'wrong'}},input,env));
 await assert.rejects(api.handle('/api/matrices/import-package',{package:{format:'wrong',schema_version:1,matrix:m}},input,env));
 assert.equal(JSON.stringify(input),before);
});
