/* Điều phối nghiệp vụ Pages trên bản sao: caller chỉ lưu khi toàn bộ thao tác đạt. */
(function(root){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x)),now=()=>new Date().toISOString();
 const id=p=>p+'-'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
 function fail(message,status=400,details){const e=new Error(message);e.status=status;if(details)e.details=details;throw e;}
 function find(list,key){if(typeof key!=='string'||!key)fail('Thiếu mã hồ sơ.');const r=list.find(x=>x.id===key);if(!r)fail('Không tìm thấy hồ sơ trong không gian hiện tại.',404);return r;}
 function put(list,value){const i=list.findIndex(x=>x.id===value.id);if(i<0)list.push(value);else list[i]=value;return value;}
 function draft(record,prefix){const r=clone(record);for(const k of ['approved_hash','approved_by','approved_at','locked_at','published_at','published_by','locked_by','usage','lifecycle','verification','exam_set','parent_exam_id'])delete r[k];r.id=id(prefix);r.status='drafting';r.created_at=now();return r;}
 function canHandle(path){return /^\/api\/(exams|revisions|questions|matrices)(\/|$)/.test(path)||['/api/bank/import','/api/bank/save','/api/bank/save-question','/api/bank/delete-question'].includes(path);}
 async function handle(path,body,input,env={}){
  const data=clone(input),p=body||{},engine=env.engine||root.BankStaticEngine,workflow=env.workflow||root.BankStaticWorkflow;
  if(!engine||!workflow)fail('Bộ xử lý ra đề chưa nạp xong. Vui lòng tải lại trang.',503);
  const subject=env.subject||'Tin học',actor=env.actor||'Giáo viên trên trình duyệt';
  const options={actor,reason:p.reason,checklist:p.checklist};
  data.bank=data.bank||{questions:[],ppct:{lessons:[]}};
  for(const k of ['exams','revisions','matrices'])if(!Array.isArray(data[k]))fail('Dữ liệu hồ sơ không đúng định dạng. Hãy khôi phục bản sao lưu hợp lệ.');
  const result=(response,changed=false)=>({response,data,changed});
  if(path==='/api/matrices/catalog'||path==='/api/matrices/catalog/save'){
   const catalogs=data.bank.competency_catalogs||[];
   if(!Array.isArray(catalogs))fail('Kho danh mục năng lực không hợp lệ.');
   const key=x=>String(x||'').normalize('NFC').trim().toLowerCase();
   const old=catalogs.find(c=>key(c.subject_name)===key(subject));
   if(path==='/api/matrices/catalog')return result({catalog:old||null});
   if(!Number.isInteger(p.expected_revision)||p.expected_revision!==(old?.revision||0))fail('Danh mục đã thay đổi ở cửa sổ khác. Hãy mở lại danh mục trước khi lưu.',409);
   const parser=root.BankCompetencyCatalog||(typeof require==='function'?require('./competency-catalog.js'):null);
   if(!parser)fail('Chưa nạp bộ đọc danh mục. Vui lòng tải lại trang.',503);
   const report=parser.validate(p.catalog);
   if(!report.valid)fail('Danh mục chưa hợp lệ. Hãy sửa các dòng được chỉ rõ.',400,{errors:report.errors});
   const catalog={...report.catalog,subject_name:subject,revision:(old?.revision||0)+1};
   data.bank.competency_catalogs=[...catalogs.filter(c=>key(c.subject_name)!==key(subject)),catalog];
   return result({catalog},true);
  }
  const ppct=data.bank.ppct||{lessons:[]},bank=data.bank.questions;
  if(!Array.isArray(bank))fail('Ngân hàng câu hỏi không đúng định dạng.');
  function own(record){if((record.subject_name||'Tin học')!==subject)fail('Hồ sơ thuộc môn khác. Hãy chuyển đúng môn học.',403);return record;}
  function checkRevision(r){if(r?.status==='published'||r?.status==='locked'||data.exams.some(e=>e.revision_id===r.id&&['locked','published'].includes(e.status)))fail('Đề cương đã khóa hoặc gắn với đề đã khóa; hãy tạo phiên bản mới.',409);}
  function saveRevision(payload,existing){
   if(existing)checkRevision(existing);
   if(typeof payload.title!=='string'||!payload.title.trim())fail('Nhập tên đề cương.');
   const grade=Number(payload.grade??existing?.grade),ids=payload.question_ids??payload.questions?.map(q=>q.id);
   if(!Number.isInteger(grade)||!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)fail('Chọn câu hỏi cùng khối, không trùng mã để lập đề cương.');
   const contentFields=['grade','type','lesson_code','level','learning_outcome','question','options','correct','option_explanations','statements','short_answer','rubric','max_score','equivalent_answer_policy'];
   const questions=ids.map(key=>{const q=own(find(bank,key));if(q.grade!==grade||q.review_status==='archived')fail('Câu hỏi khác khối hoặc đã lưu trữ.');
    const incoming=payload.questions?.find(x=>x.id===key);
    if(incoming&&contentFields.some(k=>JSON.stringify(incoming[k]??null)!==JSON.stringify(q[k]??null)))fail('Nội dung câu trong đề cương khác ngân hàng. Hãy sửa và duyệt lại câu trong ngân hàng trước khi lập phiên bản đề cương mới.');
    return clone(q);});
   const codes=new Set(questions.map(q=>q.lesson_code));
   const scope=(ppct.lessons||[]).filter(l=>l.grade===grade&&(l.subject_name||'Tin học')===subject&&codes.has(l.lesson_code)).map(l=>({lesson_code:l.lesson_code,title:l.title||l.lesson_name_source||l.lesson_name||l.lesson_code,topic:l.topic||l.topic_source||l.topic_name||''}));
   return put(data.revisions,{...(existing||{}),id:existing?.id||id('REV'),title:payload.title.trim(),grade,subject_name:subject,lessons:scope,
    status:existing?.status||'drafting',created_at:existing?.created_at||now(),updated_at:now(),question_ids:ids,questions,question_count:questions.length});
  }
  function normalizeMatrixSlots(m){
   if(!m||typeof m!=='object'||m.status==='locked'||m.status==='archived')return m;
   if(!Number.isInteger(m.grade)&&Number.isInteger(Number(m.grade)))m.grade=Number(m.grade);
   if(!['THCS','THPT','GENERAL'].includes(m.profile))m.profile=Number(m.grade)>=10?'THPT':'THCS';
   if(!['authored','received'].includes(m.mode))m.mode='authored';
   if(!m.exam_type||!['TX','GK1','CK1','GK2','CK2'].includes(m.exam_type))m.exam_type='GK1';
   if(!Number.isInteger(m.duration)||m.duration<1||m.duration>300)m.duration=Number(m.duration)>=1&&Number(m.duration)<=300?Math.round(Number(m.duration)):45;
   if(m.total_points===undefined||m.total_points===null||m.total_points==='')m.total_points=10;
   if(!m.school_year||!String(m.school_year).trim())m.school_year='2026-2027';
   if(!m.title||!String(m.title).trim())m.title='Ma trận & đặc tả '+m.exam_type+' - Khối '+(m.grade||9);
   if(!m.owner_name||!String(m.owner_name).trim())m.owner_name='Giáo viên phụ trách';
   if(!m.campus||!String(m.campus).trim())m.campus='Cao Thắng';
   if(!Array.isArray(m.indicator_catalog))m.indicator_catalog=[];
   if(!m.reconciliation||typeof m.reconciliation!=='object'||Array.isArray(m.reconciliation))m.reconciliation={confirmed:true,issues:[]};
   if(m.reconciliation.confirmed===undefined||m.reconciliation.confirmed===null)m.reconciliation.confirmed=true;
   if(!Array.isArray(m.reconciliation.issues))m.reconciliation.issues=[];
   const mSubj=m.subject_name||subject;
   if(Array.isArray(m.lessons)){
    m.lessons.forEach(l=>{
     if(!l||typeof l!=='object')return;
     if(!l.title||!String(l.title).trim())l.title=String(l.lesson_name_source||l.lesson_name||l.lesson_code||'Bài học').trim();
     if(!l.topic||!String(l.topic).trim())l.topic=String(l.topic_source||l.topic_name||'Chương trình GDPT').trim();
     if(ppct&&Array.isArray(ppct.lessons)&&l.lesson_code){
      let pl=ppct.lessons.find(x=>Number(x.grade)===Number(m.grade)&&(x.subject_name||'Tin học')===mSubj&&x.lesson_code===l.lesson_code);
      if(!pl){
       pl={grade:Number(m.grade),subject_name:mSubj,lesson_code:l.lesson_code,lesson_name:l.title,lesson_name_source:l.title,topic:l.topic,topic_source:l.topic,outcomes:[l.title]};
       ppct.lessons.push(pl);
      }else if(!Array.isArray(pl.outcomes)||!pl.outcomes.filter(Boolean).length){
       pl.outcomes=[l.title||pl.lesson_name_source||pl.lesson_name||l.lesson_code];
      }
     }
    });
   }
   if(Array.isArray(m.requirements)){
    m.requirements.forEach((r,idx)=>{
     if(!r||typeof r!=='object')return;
     if(!r.id||!String(r.id).trim())r.id='R'+(idx+1);
     const lv=String(r.level||'').trim();
     if(/nhận\s*biết|^biết$/i.test(lv))r.level='Biết';
     else if(/thông\s*hiểu|^hiểu$/i.test(lv))r.level='Hiểu';
     else if(/vận\s*dụng\s*cao|^vdc$/i.test(lv))r.level='Vận dụng cao';
     else if(/vận\s*dụng|^vd$/i.test(lv))r.level='Vận dụng';
     const pl=ppct&&Array.isArray(ppct.lessons)?ppct.lessons.find(x=>Number(x.grade)===Number(m.grade)&&(x.subject_name||'Tin học')===mSubj&&x.lesson_code===r.lesson_code):null;
     const outLen=Array.isArray(pl?.outcomes)&&pl.outcomes.length?pl.outcomes.length:1;
     if(!Number.isInteger(r.ppct_outcome_index)||r.ppct_outcome_index<0||r.ppct_outcome_index>=outLen)r.ppct_outcome_index=0;
    });
   }
   if(!Array.isArray(m.slots))return m;
   const groups={};
   m.slots.forEach((s,idx)=>{
    if(!s||typeof s!=='object')return;
    if(!s.id||!String(s.id).trim())s.id='S'+(idx+1);
    if(!s.scoring||typeof s.scoring!=='object'||s.scoring.mode!=='sum_parts')s.scoring={mode:'sum_parts'};
    if(Array.isArray(s.parts)){
     s.parts.forEach((p,pIdx)=>{
      if(!p||typeof p!=='object')return;
      if(!p.id||!String(p.id).trim())p.id='P'+(idx+1)+(s.parts.length>1?String.fromCharCode(97+pIdx):'');
     });
    }
    (groups[s.kind]||(groups[s.kind]=[])).push(s);
   });
   Object.values(groups).forEach(list=>{
    const ordered=list.map((s,i)=>[s,i]).sort((a,b)=>(Number(a[0].number)||0)-(Number(b[0].number)||0)||a[1]-b[1]).map(x=>x[0]);
    ordered.forEach((s,i)=>{s.number=i+1;});
   });
   return m;
  }
  function checkedMatrix(key){return normalizeMatrixSlots(own(find(data.matrices,key)));}
  function revisionFor(exam){return exam.revision_id?own(find(data.revisions,exam.revision_id)):null;}
  function verification(exam){return engine.verifyExam(data,exam);}
  async function refreshIntegrity(exam){exam.snapshot_integrity=await workflow.contentHash({questions:exam.questions,matrix:exam.matrix_snapshot||null,blueprint:exam.blueprint,revision:exam.revision_snapshot,ppct:exam.ppct_snapshot});}
  async function transition(exam,action){
   own(exam);
   if(['submit','approve'].includes(action)){
    const report=verification(exam);
    if(!report.passed)fail('Đề chưa đạt kiểm định ma trận/đề cương. Hãy kiểm tra báo cáo trước khi duyệt.',409);
    exam.verification=report;
   }
   return workflow.transitionExam(exam,action,{...options,questions:bank,revision:revisionFor(exam),matrix:exam.matrix_id?checkedMatrix(exam.matrix_id):null,ppct});
  }
  if(path==='/api/exams/compare'){
   if(!Array.isArray(p.ids)||p.ids.length<2||p.ids.length>6||new Set(p.ids).size!==p.ids.length)fail('Chọn từ 2 đến 6 đề khác nhau.');
   return result((env.comparison||root.BankExamComparison).compareExams(p.ids.map(key=>own(find(data.exams,key)))));
  }
  if(['/api/questions/save','/api/bank/save-question'].includes(path)){
   const q=p.question||p,existing=q.id?bank.find(x=>x.id===q.id):null;
   if(existing)own(existing);
   const saved=workflow.saveQuestion(existing,{...q,subject_name:subject});if(!saved.id)saved.id=id('Q');
   put(bank,saved);return result({question:saved,bank:data.bank},true);
  }
  if(path==='/api/bank/import'&&p.mode==='append'){
   // Nhập thêm từ Excel/Markdown/AI: giữ câu cũ, bỏ qua câu trùng, đối chiếu PPCT; lỗi thì không ghi gì.
   const incoming=Array.isArray(p.bank)?p.bank:p.bank?.questions||p.questions;
   if(!Array.isArray(incoming)||!incoming.length)fail('Tệp nhập chưa có câu hỏi hợp lệ.');
   const norm=x=>String(x==null?'':x).normalize('NFC').toLowerCase().trim().replace(/\s+/gu,' ');
   const subj=l=>l.subject_name||'Tin học';
   const existingText=new Set(bank.map(q=>Number(q.grade)+'|'+norm(q.question)));
   const existingIds=new Set(bank.map(q=>q.id));
   const added=[],skipped=[],errors=[],seen=new Set();
   incoming.forEach((raw,i)=>{
    const stt=i+1,cau=String(raw?.question||'').slice(0,80);
    try{
     if(!raw||typeof raw!=='object')fail('Câu hỏi không đúng định dạng.');
     const q=clone(raw);q.grade=Number(q.grade);
     const code=String(q.lesson_code||'').trim();
     const lessons=(ppct.lessons||[]).filter(l=>Number(l.grade)===q.grade&&subj(l)===subject);
     if(lessons.length){
      const lesson=lessons.find(l=>l.lesson_code===code)||lessons.find(l=>String(l.lesson_code).toLowerCase()===code.toLowerCase());
      if(!lesson)fail(`Bài ${code||'(trống)'} không có trong PPCT khối ${q.grade}. Kiểm tra mã bài hoặc khối đang chọn.`);
      q.lesson_code=lesson.lesson_code;
      if(q.learning_outcome&&!(lesson.outcomes||[]).includes(q.learning_outcome))fail(`Yêu cầu cần đạt không khớp với PPCT của bài ${lesson.lesson_code}, khối ${q.grade}.`);
     }
     const problems=workflow.technicalProblems?workflow.technicalProblems({...q,learning_outcome:q.learning_outcome||'-'}):[];
     if(problems.length)fail(problems.join(' '));
     const key=q.grade+'|'+norm(q.question);
     if(existingText.has(key)){skipped.push({stt,cau});return;}
     if(seen.has(key))fail('Nội dung trùng với một câu khác trong cùng tệp.');
     seen.add(key);
     if(!q.id||existingIds.has(q.id))delete q.id;
     const saved=workflow.saveQuestion(null,{...q,subject_name:subject,review_status:'draft'});
     if(!saved.id)saved.id=id('Q');existingIds.add(saved.id);added.push(saved);
    }catch(e){errors.push({stt,cau,loi:e.message});}
   });
   if(errors.length)fail(`Có ${errors.length} câu chưa hợp lệ nên chưa ghi câu nào vào ngân hàng.`,400,{so_cau_loi:errors.length,loi:errors.slice(0,30)});
   if(!added.length)fail(`Không có câu mới: cả ${skipped.length} câu đều đã có trong ngân hàng.`);
   added.forEach(q=>bank.push(q));
   return result({bank:data.bank,import_report:{added:added.length,skipped:skipped.length,skipped_items:skipped.slice(0,30)}},true);
  }
  if(['/api/bank/import','/api/bank/save'].includes(path)){
   const incoming=p.questions||(Array.isArray(p.bank)?p.bank:p.bank?.questions);
   if(!Array.isArray(incoming)||!incoming.length)fail('Tệp nhập chưa có câu hỏi hợp lệ.');
   const seen=new Set();
   for(const q of incoming){if(!q||typeof q!=='object')fail('Câu hỏi nhập không đúng định dạng.');if(q.id&&seen.has(q.id))fail('Tệp nhập chứa mã câu trùng.');seen.add(q.id);
    const existing=q.id?bank.find(x=>x.id===q.id):null;if(existing)own(existing);
    const saved=workflow.saveQuestion(existing,{...q,subject_name:subject});if(!saved.id)saved.id=id('Q');put(bank,saved);}
   return result({bank:data.bank},true);
  }
  if(['/api/questions/review','/api/questions/archive','/api/questions/restore'].includes(path)){
   const q=own(find(bank,p.id)),action=path.endsWith('/review')?p.action:path.endsWith('/archive')?'archive':'restore';
   const saved=workflow.reviewQuestion(q,action,options);put(bank,saved);return result({question:saved,bank:data.bank},true);
  }
  if(['/api/questions/delete','/api/bank/delete-question'].includes(path)){
   own(find(bank,p.id));data.bank.questions=bank.filter(q=>q.id!==p.id);return result({bank:data.bank},true);
  }
  if(path==='/api/questions/bulk'){
   if(!Array.isArray(p.ids)||!p.ids.length||new Set(p.ids).size!==p.ids.length)fail('Chọn danh sách mã câu khác nhau.');
   const qs=p.ids.map(key=>own(find(bank,key)));
   if(p.action==='delete')data.bank.questions=bank.filter(q=>!p.ids.includes(q.id));
   else if(p.action==='restore_all'||p.action==='unarchive_all'){
    qs.forEach(q=>{
      q.review_status = p.status || 'approved';
      delete q.archived_at;
      delete q.status_before_archive;
      put(bank, q);
    });
   }
   else{
    const action=p.action==='status'?{pending_review:'submit',archived:'archive',restore:'restore'}[p.status]||p.action:p.action;
    if(!action||action==='approve')fail('Muốn duyệt câu phải mở phiếu kiểm định và xác nhận đủ từng mục.');
    qs.forEach(q=>put(bank,workflow.reviewQuestion(q,action,options)));
   }
   return result({bank:data.bank},true);
  }
  if(path==='/api/revisions/propose')return result(engine.proposeRevision(data,{...p,subject_name:subject}));
  if(path==='/api/revisions/save'||path==='/api/revisions/update'){
   const old=path.endsWith('/update')?own(find(data.revisions,p.id)):null;
   const revision=saveRevision(p,old);return result({revision,revisions:data.revisions},true);
  }
  if(path==='/api/revisions/duplicate'){
   const old=own(find(data.revisions,p.id)),revision=saveRevision({...old,title:old.title+' (Bản sao)',question_ids:old.question_ids||old.questions.map(q=>q.id)});
   return result({revision,revisions:data.revisions},true);
  }
  if(path==='/api/revisions/delete'){
   const old=own(find(data.revisions,p.id));checkRevision(old);if(data.exams.some(e=>e.revision_id===old.id))fail('Đề cương còn liên kết với đề kiểm tra.');
   data.revisions=data.revisions.filter(r=>r.id!==old.id);return result({revisions:data.revisions},true);
  }
  if(path==='/api/revisions/transition'){
   const old=own(find(data.revisions,p.id)),revision=await workflow.transitionRevision(old,p.action,{...options,exams:data.exams});
   put(data.revisions,revision);return result({revision,revisions:data.revisions},true);
  }
  if(path==='/api/exams/generate'||path==='/api/exams/from-matrix'){
   const exam=clone(engine.generateExam(data,{...p,subject_name:subject}));exam.created_at=now();exam.verification=verification(exam);put(data.exams,exam);return result({exam,exams:data.exams},true);
  }
  if(path==='/api/exams/generate-set'){
   const count=Number(p.exam_count);if(!Number.isInteger(count)||count<1||count>6)fail('Số đề trong bộ phải từ 1 đến 6.');
   let revision=p.revision_id?own(find(data.revisions,p.revision_id)):null;
   if(!revision){const plan=engine.proposeRevision(data,{...p,subject_name:subject,counts:p.revision_counts,total:p.revision_total});revision=saveRevision({title:p.title+' — Đề cương',grade:p.grade,question_ids:plan.question_ids});}
   const setId=id('SET'),exams=[];
   for(let n=0;n<count;n++){
    const exam=clone(engine.generateExam(data,{...p,title:p.title+` — Đề ${n+1}`,subject_name:subject,revision_id:revision.id,seed:String(p.seed||'')+':'+n}));
    exam.exam_set={id:setId,index:n+1,count};exams.push(exam);put(data.exams,exam);
   }
   const shared=exams.some((e,i)=>exams.slice(i+1).some(other=>e.questions.some(q=>other.questions.some(x=>x.id===q.id))));
   return result({exams,exams_all:data.exams,revisions:data.revisions,revision,revision_size:revision.questions.length,
    outside_per_exam:exams[0].questions.filter(q=>!revision.question_ids.includes(q.id)).length,
    warnings:shared?['Các đề trong bộ có dùng chung câu; hãy xem báo cáo so sánh trước khi chọn dùng.']:[]},true);
  }
  if(path==='/api/exams/transition'){
   const old=own(find(data.exams,p.id)),exam=await transition(old,p.action);put(data.exams,exam);return result({exam,exams:data.exams},true);
  }
  if(path==='/api/exams/set/transition'){
   const members=data.exams.filter(e=>e.exam_set?.id===p.set_id);if(!members.length)fail('Không tìm thấy bộ đề.',404);
   if(members.length!==members[0].exam_set.count)fail('Bộ đề thiếu thành viên; không chuyển trạng thái một phần.',409);
   const changed=[];for(const e of members)changed.push(await transition(e,p.action));changed.forEach(e=>put(data.exams,e));
   return result({exams:changed,exams_all:data.exams},true);
  }
  if(path==='/api/exams/verify'){
   const exam=own(find(data.exams,p.id));workflow.assertEditable(exam);
   if(p.revision_id!==undefined&&p.revision_id!==exam.revision_id){
    const before=verification(exam);if(before.errors.some(e=>e.code==='snapshot'))fail('Bản chụp đề đã bị thay đổi; không thể gắn lại đề cương để bỏ qua kiểm định.',409);
    exam.revision_id=p.revision_id;exam.revision_snapshot=exam.revision_id?clone(revisionFor(exam)):null;await refreshIntegrity(exam);
   }
   exam.verification=verification(exam);
   return result({exam,exams:data.exams,verification:exam.verification},true);
  }
  if(path==='/api/exams/update'){
   const old=own(find(data.exams,p.id));workflow.assertEditable(old);
   const fields=['title','duration','campus','exam_code','questions','revision_id'];
   for(const key of fields)if(Object.prototype.hasOwnProperty.call(p,key))old[key]=clone(p[key]);
   old.status='drafting';old.updated_at=now();old.verification=verification(old);
   return result({exam:old,exams:data.exams},true);
  }
  if(path==='/api/exams/duplicate'){
   const old=own(find(data.exams,p.id)),exam=draft(old,'EXAM');exam.title=old.title+' (Bản sao)';put(data.exams,exam);return result({exam,exams:data.exams},true);
  }
  if(path==='/api/exams/permute'){
   const source=own(find(data.exams,p.id)),report=verification(source);
   if(!source.questions?.length||report.errors.some(e=>e.code==='snapshot'))fail('Đề gốc chưa có bản chụp hợp lệ; không thể hoán vị.',409);
   if(['locked','published'].includes(source.status)&&await workflow.contentHash(source)!==source.approved_hash)fail('Đề gốc đã thay đổi sau khi khóa.',409);
   const codes=p.codes||Array.from({length:p.num_variants??4},(_,i)=>String(101+i));
   if(!Array.isArray(codes)||codes.length<2||codes.length>6||codes.some(c=>typeof c!=='string'||!/^\d{3,6}$/.test(c))||new Set(codes).size!==codes.length)fail('Chọn 2–6 mã đề khác nhau, mỗi mã có 3–6 chữ số.');
   let randomSeed=Array.from(String(p.seed??now())).reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,1);
   const shuffle=values=>{const a=values.slice();for(let i=a.length-1;i>0;i--){randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;const j=randomSeed%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
   const exams=[];
   for(const code of codes){
    const exam=draft(source,'EXAM');exam.parent_exam_id=source.parent_exam_id||source.id;exam.exam_code=code;exam.title=source.title+' — Mã '+code;
    if(p.shuffle_questions!==false)exam.questions=shuffle(exam.questions);
    const counters={};
    for(const q of exam.questions){q.slot_number=(counters[q.type]=(counters[q.type]||0)+1);
     if(q.type==='MC'&&p.shuffle_options!==false&&!q.options.some(o=>/tất cả|cả\s+[ABCD]\s+(và|hoặc)|all of|both\s+[ABCD]/i.test(o))){
      const order=shuffle([0,1,2,3]),old=q.options,exps=q.option_explanations; q.options=order.map(i=>old[i]);q.correct=order.indexOf(q.correct);if(exps)q.option_explanations=order.map(i=>exps[i]||'');
     }
    }
    await refreshIntegrity(exam);exam.verification=verification(exam);put(data.exams,exam);exams.push(exam);
   }
   return result({result:{exams,codes},exams:data.exams},true);
  }
  if(path==='/api/exams/delete'){
   const old=own(find(data.exams,p.id));workflow.assertEditable(old);data.exams=data.exams.filter(e=>e.id!==old.id);return result({exams:data.exams},true);
  }
  if(path==='/api/exams/inspect-import'||path==='/api/exams/import-verified'){
   if(!Array.isArray(p.candidates)||!p.candidates.length)fail('Bản Pages hiện cần câu hỏi JSON đã ánh xạ với ngân hàng và ma trận. Không thể tự xác nhận tệp Word đã đạt.');
   const candidates=p.candidates.map(raw=>{
    const exam=draft({...raw,subject_name:subject},'EXAM');if(p.revision_id)exam.revision_id=p.revision_id;
    exam.verification=verification(exam);return exam;
   });
   const all_passed=candidates.every(e=>e.verification.passed);
   if(path.endsWith('/inspect-import'))return result({filename:p.filename||'Đề JSON',candidates,candidate_count:candidates.length,all_passed});
   if(!all_passed)fail('Đề nhập chưa đạt đối chiếu thực tế với ngân hàng, ma trận và đề cương; không thể xác nhận đạt.',409);
   candidates.forEach(e=>put(data.exams,e));return result({exams:data.exams,imported:candidates},true);
  }
  if(path==='/api/matrices'){data.matrices.forEach(normalizeMatrixSlots);return result({matrices:data.matrices});}
  if(path==='/api/matrices/save'){
   const raw=clone(p.matrix||{}),old=raw.id?data.matrices.find(m=>m.id===raw.id):null;
   if(old){own(old);if(old.status==='locked'||old.status==='archived')fail('Ma trận đã khóa/lưu trữ. Hãy mở khóa hoặc tạo phiên bản mới.',409);
    if(p.expected_revision!==old.revision)fail('Ma trận đã đổi phiên bản; hãy tải lại trước khi lưu.',409);}
   const matrix={...raw,id:old?.id||id('MX'),family_id:old?.family_id||id('FAM'),subject_name:subject,status:'draft',version:old?.version||1,revision:(old?.revision||0)+1,updated_at:now()};
   delete matrix.content_sha256;
   normalizeMatrixSlots(matrix);
   const validation=engine.validateMatrix(matrix,ppct);
   if(validation.errors.some(e=>e.code==='catalog'))fail('Danh mục trong ma trận chưa hợp lệ.',400,validation);
   put(data.matrices,matrix);return result({matrix,validation},true);
  }
  if(path==='/api/matrices/review'){const matrix=checkedMatrix(p.id);return result({matrix,validation:engine.validateMatrix(matrix,ppct)});}
  if(path==='/api/matrices/lock'||path==='/api/matrices/unlock'){
   const matrix=checkedMatrix(p.id);if(p.expected_revision!==undefined&&p.expected_revision!==matrix.revision)fail('Ma trận đã đổi phiên bản; hãy tải lại.',409);
   if(path.endsWith('/lock'))normalizeMatrixSlots(matrix);
   const validation=engine.validateMatrix(matrix,ppct);
   if(path.endsWith('/lock')){if(!validation.valid)fail('Chưa thể khóa ma trận. Hãy sửa các mục được chỉ rõ bên dưới.',409,validation);
    if(!p.confirmation?.confirmed_by||p.confirmation.external_agreement!==true)fail('Cần xác nhận của giáo viên trước khi khóa ma trận.');matrix.status='locked';matrix.confirmation=clone(p.confirmation);matrix.content_sha256=engine.matrixDigest(matrix);}
   else {if(matrix.status!=='locked')fail('Ma trận chưa ở trạng thái khóa.');matrix.status='draft';delete matrix.content_sha256;normalizeMatrixSlots(matrix);}
   matrix.revision=(matrix.revision||0)+1;matrix.updated_at=now();return result({matrix,validation},true);
  }
  if(path==='/api/matrices/duplicate'||path==='/api/matrices/new-version'){
   const old=checkedMatrix(p.id),matrix=clone(old);matrix.id=id('MX');matrix.status='draft';matrix.revision=0;delete matrix.confirmation;delete matrix.content_sha256;
   normalizeMatrixSlots(matrix);
   if(path.endsWith('/new-version')){matrix.previous_id=old.id;matrix.version=(old.version||1)+1;}else{matrix.family_id=id('FAM');matrix.version=1;matrix.title=old.title+' (Bản sao)';}
   put(data.matrices,matrix);return result({matrix,validation:engine.validateMatrix(matrix,ppct)},true);
  }
  if(path==='/api/matrices/delete'){
   const old=checkedMatrix(p.id);if(old.status==='locked'||data.exams.some(e=>e.matrix_id===old.id))fail('Ma trận đã khóa hoặc đã dùng tạo đề; không thể xóa.',409);
   data.matrices=data.matrices.filter(m=>m.id!==old.id);return result({success:true,matrices:data.matrices},true);
  }
  if(path==='/api/matrices/archive'){
   const matrix=checkedMatrix(p.id);if(!p.reason?.trim())fail('Cần lý do lưu trữ.');matrix.status='archived';matrix.archive_reason=p.reason;matrix.revision++;return result({matrix,validation:engine.validateMatrix(matrix,ppct)},true);
  }
  if(path==='/api/matrices/import-package'){
   if(p.package?.format!=='asian-school-matrix'||p.package.schema_version!==1)fail('Gói ma trận không đúng định dạng hoặc phiên bản hỗ trợ.');
   const raw=p.package?.matrix;if(!raw)fail('Gói nhập chưa có ma trận.');
   if(p.package.content_sha256!==undefined&&p.package.content_sha256!==engine.jsonDigest(raw))fail('Nội dung gói đã thay đổi hoặc dấu kiểm tra không còn khớp.');
   const matrix={...clone(raw),id:id('MX'),family_id:id('FAM'),subject_name:subject,status:'draft',revision:1,version:1};delete matrix.confirmation;delete matrix.content_sha256;
   normalizeMatrixSlots(matrix);
   const validation=engine.validateMatrix(matrix,ppct);
   if(validation.errors.some(e=>e.code==='catalog'))fail('Danh mục trong gói ma trận chưa hợp lệ.',400,validation);
   put(data.matrices,matrix);return result({matrix,validation},true);
  }
  const match=/^\/api\/matrices\/([^/]+)(?:\/(candidates|shortfall|compare))?$/.exec(path);
  if(match){const matrix=checkedMatrix(decodeURIComponent(match[1]));
   if(match[2]==='shortfall')return result(engine.shortfall(matrix,bank,ppct));
   if(match[2]==='candidates')return result(engine.candidates(matrix,bank,ppct));
   const validation=engine.validateMatrix(matrix,ppct);return result({matrix,validation,ppct_differences:validation.errors||[]});}
  fail('Thao tác này chưa được hỗ trợ trên bản Pages. Không có dữ liệu nào được thay đổi.',501);
 }
 const api={canHandle,handle};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BankStaticAPI=api;
})(typeof window!=='undefined'?window:globalThis);
