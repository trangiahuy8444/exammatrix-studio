const assert=require('node:assert/strict');
const core=require('../public/core.js');
const source='Đọc chương trình:\n```python\nif x < 2:\n    print("<img src=x onerror=alert(1)>")\n```\nCho bảng:\n| t (s) | s (m) |\n| :--- | ---: |\n| 1 | 2 |\n| 2 | 4 |';
assert.deepEqual(core.questionTextBlocks(source),[
 ['text',['Đọc chương trình:']],['code',['if x < 2:','    print("<img src=x onerror=alert(1)>")']],
 ['text',['Cho bảng:']],['table',[['t (s)','s (m)'],['1','2'],['2','4']]]
]);
const rendered=core.questionTextHtml(source,{editable:true});
assert.match(rendered,/<pre[^>]*><code>if x &lt; 2:\n    print\(&quot;&lt;img/);
assert.match(rendered,/<table[^>]*class="question-table"/);
assert.match(rendered,/<th[^>]*>t \(s\)<\/th>/);
assert.match(rendered,/contenteditable="false"/);
assert.match(rendered,/data-edit-field="question"/);
assert.ok(!rendered.includes('<img'));
assert.ok(!rendered.includes('<script'));
for(const malformed of [
 'a | b',
 'a | b\n-- | ---\n1 | 2',
 'a | b\n--- | ---',
 'a | b\n--- | ---\n1 | 2\n3 | 4 | 5',
 '```python\n a | b\n--- | ---\n1 | 2',
 '```bad language\na | b\n--- | ---\n1 | 2\n```'
]){
 assert.deepEqual(core.questionTextBlocks(malformed),[['text',malformed.split('\n')]],malformed);
 const html=core.questionTextHtml(malformed,{editable:true});
 assert.ok(!html.includes('<table')&&!html.includes('<pre'),malformed);
 assert.ok(!html.includes('contenteditable="false"'),malformed);
}
assert.deepEqual(core.questionTextBlocks('```\n```'),[['code',[]]]);
assert.deepEqual(core.questionTextBlocks('```Vật_lí\n    x\n```'),[['code',['    x']]]);
assert.deepEqual(core.questionTextBlocks(' a | b \n --- | :---: \n 1 | 2 '),[['table',[['a','b'],['1','2']]]]);
assert.match(core.questionTextHtml('  x < y\n    z'),/  x &lt; y\n    z/);
assert.match(core.questionTextHtml('<script>x</script>'),/&lt;script&gt;x&lt;\/script&gt;/);
assert.ok(!core.questionTextHtml('[x](javascript:alert(1)) ![x](file:///tmp/x)').includes('<a'));
for(const kind of ['code','table']){
 const added=core.insertQuestionTemplate('TrướcSAUSau',5,8,kind);
 assert.equal(added.text.slice(0,5),'Trước');
 assert.ok(added.text.endsWith('SAUSau')); 
 assert.equal(added.text.slice(added.selectionStart,added.selectionEnd),kind==='code'?'    # Viết mã tại đây':'Giá trị 1');
 assert.ok(core.questionTextBlocks(added.text).some(b=>b[0]===kind));
}
const empty=core.insertQuestionTemplate('',0,0,'code');
assert.ok(empty.text.startsWith('```'));
assert.deepEqual(core.insertQuestionTemplate('Giữ',1,2,'other'),{text:'Giữ',selectionStart:1,selectionEnd:2});
// Even a restored pre-upgrade formatter copy without a lock marker cannot flatten rich source.
for(const marked of [true,false]){
 const q={id:'rich',question:source,type:'MC',options:['a','b','c','d']};
 const body={textContent:'Đọc chương trình:if x < 2:t (s)s (m)12',dataset:marked?{questionSourcePreserved:'true'}:{}};
 const article={dataset:{editQid:q.id},querySelector:()=>body,querySelectorAll:s=>s==='[data-edit-opt]'?[{dataset:{editOpt:'0'},textContent:'Phương án mới'}]:[]};
 core.syncEditedQuestionsFromSheet({querySelectorAll:()=>[article]},{questions:[q]});
 assert.equal(q.question,source);
 assert.equal(q.options[0],'Phương án mới');
}
console.log('PASS frontend rich question: parse/render, escaped HTML, malformed fallback, templates, source-preserving sync');
// Exercise the actual document builders, not a parallel rendering implementation.
{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const builders=app.slice(app.indexOf('function mcColsClass('),app.indexOf('function mountExamViewerContent('));
 const make=new Function('C','esc','subject','fmtPts','scaledPolicy','countRecord','revisionGoals','schoolProfile','store',builders+'; return {buildExamSheetHtml,buildRevisionSheetHtml};');
 const ui=make(core,core.escapeHtml,()=> 'Vật lí',String,()=>'',r=>r.questions.length,()=>[],()=>false,{context:{}});
 const record={grade:10,questions:['MC','YN','ES'].map((type,i)=>({id:'q'+i,type,question:source,options:['A','B','C','D'],statements:[{text:'Đúng',correct:true}],rubric:[{criterion:'Chấm',points:1}]}))};
 for(const html of [ui.buildExamSheetHtml(record,'student'),ui.buildExamSheetHtml(record,'answers'),ui.buildRevisionSheetHtml(record,false),ui.buildRevisionSheetHtml(record,true)]){
  assert.ok((html.match(/<pre /g)||[]).length>=3);
  assert.ok((html.match(/class="question-table"/g)||[]).length>=3);
  assert.equal((html.match(/data-edit-field="question" data-question-source-preserved="true" contenteditable="false"/g)||[]).length,3);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!/<p><strong>Câu[^<]*<\/strong> <div/.test(html),'block bodies must not be placed inside p tags');
 }
 console.log('PASS actual exam/revision builders: MC, YN and ES student/answer rich bodies');
}
// R2: SHORT is present in all four actual builders; answers stay teacher-only.
{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const make=new Function('C','esc','subject','fmtPts','scaledPolicy','countRecord','revisionGoals','schoolProfile','store',app.slice(app.indexOf('function mcColsClass('),app.indexOf('function mountExamViewerContent('))+'; return {buildExamSheetHtml,buildRevisionSheetHtml};');
 const ui=make(core,core.escapeHtml,()=> 'Toán',String,()=>'',r=>r.questions.length,()=>[],()=>false,{context:{}});
 const record={grade:10,questions:['MC','YN','SHORT','ES'].map((type,i)=>({id:'all'+i,type,slot_number:10+i,points:0.5,question:'VISIBLE_'+type+'\n'+source,short_answer:'ANSWER_<SHORT>',options:['KEY_MC','B','C','D'],correct:0,statements:[{text:'Mệnh đề',correct:true}],rubric:[]}))};
 const results=[ui.buildExamSheetHtml(record,'student'),ui.buildExamSheetHtml(record,'answers'),ui.buildRevisionSheetHtml(record,false),ui.buildRevisionSheetHtml(record,true)];
 results.forEach((html,i)=>{
  for(const kind of ['MC','YN','SHORT','ES'])assert.ok(html.includes('VISIBLE_'+kind),kind+' surface '+i);
  assert.match(html,/Câu 12 \(0.5 điểm\)/);
  assert.match(html,/III\. [^<]*TRẢ LỜI NGẮN/);
  assert.match(html,/IV\. [^<]*TỰ LUẬN/);
  assert.equal(html.includes('ANSWER_&lt;SHORT&gt;'),[1,3].includes(i),'SHORT teacher-only answer surface '+i);
  assert.ok(!html.includes('ANSWER_<SHORT>'));
  assert.equal((html.match(/data-edit-field="question" data-question-source-preserved="true" contenteditable="false"/g)||[]).length,4);
  if(i===2)assert.ok(!html.includes('C. BẢNG ĐÁP ÁN'),'student revision must not expose answer section');
 });
 console.log('PASS R2 actual builders: all four question types, SHORT points/order/numbering and teacher-only answer');
}
// R2: invoke real formatter attach handlers with locked/ordinary cells and mixed selections.
{
 const previousDocument=global.document,previousWindow=global.window;
 const classes=()=>({add(){},remove(){},toggle(){}});
 const probe=(locked,mixed=false)=>{
  const calls={added:0,removed:0,exec:0,selected:0,styled:0};const listeners={},barListeners={};
  const originalSource='```python\n    preserved < source\n```';
  const question={id:'formatter-source',type:'ES',question:originalSource};
  const article={dataset:{editQid:question.id},querySelector:()=>({textContent:'flattened source',dataset:{questionSourcePreserved:'true'}}),querySelectorAll:()=>[]};
  const wrapper={};
  const style={width:'50%',setProperty(){calls.styled++;}};
  const cell={style,classList:{...classes(),add(){calls.selected++;}},getAttribute:()=>null,setAttribute(){calls.styled++;},removeAttribute(){},innerHTML:'CELL',
   closest(s){if(s.includes('data-question-source-preserved'))return locked?wrapper:null;if(s==='td,th'||s.includes('td,th,p'))return cell;if(s==='tr')return row;if(s==='table')return table;return null;},querySelector:()=>null};
  const row={children:[cell],parentElement:{insertBefore(){calls.added++;}},cloneNode(){return {querySelectorAll:()=>[{removeAttribute(){},classList:classes(),innerHTML:''}]};},remove(){calls.removed++;}};
  cell.parentElement=row;
  const table={querySelectorAll:s=>s==='tr'?[row]:s==='colgroup col'?[{style}]:[]};
  const sheet={innerHTML:'ORIGINAL',classList:classes(),contains:()=>true,focus(){},addEventListener:(k,f)=>listeners[k]=f,
   querySelectorAll(s){if(s==='[data-edit-qid]')return [article];if(s==='[data-question-source-preserved="true"]')return locked||mixed?[wrapper]:[];if(s==='td,th,p,h1,h2,h3,h4,h5,li'||s==='td,th'||s==='th')return [cell];return [];}};
  const bar={addEventListener:(k,f)=>barListeners[k]=f};
  const host={querySelector:s=>s==='.doc-sheet'?sheet:s==='[data-fmt-bar]'?bar:null};
  const range={intersectsNode:n=>n===wrapper||n===cell};
  global.document={execCommand(){calls.exec++;}};
  global.window={getSelection:()=>mixed?{rangeCount:1,isCollapsed:false,getRangeAt:()=>range}:null};
  core.DocFormatter.attach(host,'.doc-sheet',{skipRestore:true,onSave:sheet=>core.syncEditedQuestionsFromSheet(sheet,{questions:[question]})});
  listeners.click({target:cell});
  const click=(key,value)=>{const button={dataset:{[key]:value}};return barListeners.click({preventDefault(){},target:{closest:s=>s==='[data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+']'?button:null}});};
  return {calls,style,click,question,originalSource};
 };
 try{
  for(const mixed of [false,true])for(const [key,value] of [['fmtCmd','row-del'],['fmtCmd','row-add'],['fmtCol','1.5'],['fmtExec','mergeCells'],['fmtExec','bold'],['fmtAlign','center'],['fmtCmd','auto-center-table']]){
   const p=probe(!mixed,mixed);p.click(key,value);
   assert.equal(p.calls.removed,0,'locked/mixed row deletion');assert.equal(p.calls.added,0,'locked/mixed row addition');
   assert.equal(p.style.width,'50%','locked/mixed column width');assert.equal(p.calls.exec,0,'locked/mixed selected content');
   assert.equal(p.calls.styled,0,'locked/mixed cell styles');
   if(!mixed)assert.equal(p.calls.selected,0,'locked cell must not become active');
   p.click('fmtCmd','save');assert.equal(p.question.question,p.originalSource,'formatter save retains canonical source bytes');
  }
  for(const [key,value,expected] of [['fmtCmd','row-del','removed'],['fmtCmd','row-add','added'],['fmtExec','bold','exec']]){
   const p=probe(false);p.click(key,value);assert.equal(p.calls[expected],1,'ordinary editable table '+value);
  }
  const ordinary=probe(false);ordinary.click('fmtCol','1.5');assert.equal(ordinary.style.width,'51.50%');
 }finally{global.document=previousDocument;global.window=previousWindow;}
 console.log('PASS R2 real formatter handlers: locked/mixed row, column, style and exec guarded; ordinary tables remain editable');
}
// R2 privacy regression: student revisions contain question content, never answer material.
{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const make=new Function('C','esc','subject','fmtPts','scaledPolicy','countRecord','revisionGoals','schoolProfile','store',app.slice(app.indexOf('function mcColsClass('),app.indexOf('function mountExamViewerContent('))+'; return {buildExamSheetHtml,buildRevisionSheetHtml};');
 const ui=make(core,core.escapeHtml,()=> 'Toán',String,()=>'',r=>r.questions.length,()=>[],()=>false,{context:{}});
 const record={title:'TIÊU ĐỀ GIỮ NGUYÊN',grade:10,questions:[
  {id:'mc-private',type:'MC',question:'VISIBLE_MC',options:['A','B','C','D'],correct:2,option_explanations:['PRIVATE_MC_EXPLANATION','','',''],points:.5},
  {id:'yn-private',type:'YN',question:'VISIBLE_YN',statements:[{text:'Mệnh đề công khai',correct:true},{text:'Mệnh đề khác',correct:false}],points:1},
  {id:'short-private',type:'SHORT',question:'VISIBLE_SHORT',short_answer:'PRIVATE_SHORT_ANSWER',points:.5},
  {id:'es-private',type:'ES',question:'VISIBLE_ES',rubric:[{criterion:'PRIVATE_ES_RUBRIC',points:1}],equivalent_answer_policy:'PRIVATE_ES_POLICY',points:1}
 ]};
 const student=ui.buildRevisionSheetHtml(record,false),teacher=ui.buildRevisionSheetHtml(record,true);
 for(const kind of ['MC','YN','SHORT','ES'])assert.ok(student.includes('VISIBLE_'+kind));
 for(const privateText of ['PRIVATE_MC_EXPLANATION','PRIVATE_SHORT_ANSWER','PRIVATE_ES_RUBRIC','PRIVATE_ES_POLICY']){
  assert.ok(!student.includes(privateText),'student revision privacy: '+privateText);
  assert.ok(teacher.includes(privateText),'teacher revision retains: '+privateText);
 }
 assert.ok(!student.includes('>ĐÚNG<')&&!student.includes('>SAI<'),'student revision omits YN truth values');
 assert.ok(teacher.includes('>ĐÚNG<')&&teacher.includes('>SAI<'),'teacher revision retains YN truth values');
 for(const html of [student,teacher])assert.ok(html.includes(record.title));
 console.log('PASS R2 revision privacy: MC explanations, YN truth values, SHORT answer, ES rubric/policy teacher-only');
}

// The actual revision builder follows the three-column worksheet rule in both populated and empty states.
{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const make=new Function('C','esc','subject','fmtPts','scaledPolicy','countRecord','revisionGoals','schoolProfile','store',app.slice(app.indexOf('function mcColsClass('),app.indexOf('function mountExamViewerContent('))+'; return {buildRevisionSheetHtml};');
 const ui=make(core,core.escapeHtml,()=> 'Tin học',String,()=>'',r=>r.questions.length,record=>record.goals||[],()=>false,{context:{}});
 for(const goals of [[{topic:'Chủ đề 1',name:'Bài 1',goals:['YCCĐ riêng']}],[]]){
  const html=ui.buildRevisionSheetHtml({title:'Đề cương',grade:9,questions:[],goals},false);
  const section=html.match(/<h4>A\. GIỚI HẠN KIẾN THỨC ÔN TẬP<\/h4>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(section,'actual revision knowledge section');
  assert.deepEqual([...section.matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)].map(m=>m[1]),['STT','Tên chủ đề','Tên bài']);
  assert.equal((section.match(/<col\b/g)||[]).length,3);
  assert.equal((section.match(/<td\b/g)||[]).length,goals.length?3:1);
  assert.ok(!section.includes('Mục tiêu bài học'));
  assert.ok(!section.includes('YCCĐ riêng'));
  if(!goals.length)assert.match(section,/colspan="3"/);
 }
 console.log('PASS revision A actual builder: three columns and empty colspan');
}

// Exercise the real viewer entry points and formatter restore path with a legacy full-HTML snapshot.
{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const source=app.slice(app.indexOf('function mcColsClass('),app.indexOf('function openExamViewerModal('))+app.slice(app.indexOf('function mountRevisionViewerContent('),app.indexOf('function openRevisionViewerModal('));
 const saved=new Map(),localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
 const previousDocument=global.document,previousWindow=global.window;
 const attached=[],previousPrefix=core.DocFormatter.storagePrefix;
 const fmt={toolbarHtml:()=>'',attach(_host,_selector,opts){attached.push(opts.storageKey);}};
 const host={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
 const record={id:'cache-record',title:'Đề có SHORT',grade:10,duration:45,questions:[
  {id:'m',type:'MC',question:'VISIBLE_MC',options:['A','B','C','D'],correct:0,points:1},
  {id:'y',type:'YN',question:'VISIBLE_YN',statements:[{text:'Ý a',correct:true}],points:1},
  {id:'s',type:'SHORT',question:'VISIBLE_SHORT',short_answer:'PRIVATE_SHORT',points:1},
  {id:'e',type:'ES',question:'VISIBLE_ES',rubric:[],points:1}
 ]};
 try{
  global.window={localStorage,DocFormatter:fmt};
  global.document={querySelector:()=>({content:'scope-a'})};
  core.DocFormatter.storagePrefix=core.formatStoragePrefix('scope-a');
  const ui=new Function('C','esc','subject','fmtPts','scaledPolicy','countRecord','revisionGoals','schoolProfile','store','window','notify','opt',source+'; return {mountExamViewerContent,mountRevisionViewerContent};')(
   {...core,examEditable:()=>false},core.escapeHtml,()=> 'Toán',String,()=>'',r=>r.questions.length,()=>[],()=>false,{context:{},canViewAnswers:true},global.window,()=>{},()=>''
  );
  for(const [kind,open] of [
   ['exam:cache-record:student',()=>ui.mountExamViewerContent(host,record,'student')],
   ['exam:cache-record:answers',()=>ui.mountExamViewerContent(host,record,'answers')],
   ['revision:cache-record:0',()=>ui.mountRevisionViewerContent(host,record,false)],
   ['revision:cache-record:1',()=>ui.mountRevisionViewerContent(host,record,true)]
  ]){
   const legacy='tin_doc_fmt_v1:scope-a:'+kind;
   saved.set(legacy,'<div class="doc-sheet">LEGACY_FULL_HTML</div>');
   open();assert.equal(attached.at(-1),kind,'actual viewer key');
   assert.ok(host.innerHTML.includes('VISIBLE_SHORT'),'new source view '+kind);
   if(kind.startsWith('revision:'))assert.ok(host.innerHTML.includes('4 câu (1 trắc nghiệm NLC, 1 câu Đúng/Sai, 1 câu Trả lời ngắn, 1 tự luận)'),'actual revision viewer subtitle counts all four kinds');
   assert.equal(core.DocFormatter.loadSaved(kind),null,'legacy full HTML must not restore '+kind);
   assert.equal(saved.get(legacy),'<div class="doc-sheet">LEGACY_FULL_HTML</div>','legacy recovery copy kept');
  }
  const sheet={innerHTML:'FRESH_SHORT',classList:{toggle(){}},addEventListener(){},querySelectorAll:()=>[]};
  const bar={addEventListener(){}};
  const attachHost={querySelector:s=>s==='.doc-sheet'?sheet:s==='[data-fmt-bar]'?bar:null};
  core.DocFormatter.attach(attachHost,'.doc-sheet',{storageKey:'revision:cache-record:0'});
  assert.equal(sheet.innerHTML,'FRESH_SHORT','real attach ignores old full HTML');
  core.DocFormatter.saveHtml('revision:cache-record:0','CURRENT_FULL_HTML');
  core.DocFormatter.attach(attachHost,'.doc-sheet',{storageKey:'revision:cache-record:0'});
  assert.equal(sheet.innerHTML,'CURRENT_FULL_HTML','current formatter edits still restore');
  assert.equal(saved.get('tin_doc_fmt_v1:scope-a:revision:cache-record:0'),'<div class="doc-sheet">LEGACY_FULL_HTML</div>');
 }finally{core.DocFormatter.storagePrefix=previousPrefix;global.document=previousDocument;global.window=previousWindow;}
 console.log('PASS actual viewer formatter keys: legacy full HTML bypassed and retained for recovery');
}
