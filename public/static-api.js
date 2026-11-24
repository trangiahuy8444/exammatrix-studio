/* Điều phối nghiệp vụ Pages trên bản sao: caller chỉ lưu khi toàn bộ thao tác đạt. */
(function(root){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x)),now=()=>new Date().toISOString();
 const id=p=>p+'-'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
 function fail(message,status=400,details){const e=new Error(message);e.status=status;if(details)e.details=details;throw e;}
 function find(list,key){if(typeof key!=='string'||!key)fail('Thiếu mã hồ sơ.');const r=list.find(x=>x.id===key);if(!r)fail('Không tìm thấy hồ sơ trong không gian hiện tại.',404);return r;}
 function put(list,value){const i=list.findIndex(x=>x.id===value.id);if(i<0)list.push(value);else list[i]=value;return value;}
 function draft(record,prefix){const r=clone(record);for(const k of ['approved_hash','approved_by','approved_at','locked_at','published_at','published_by','locked_by','usage','lifecycle','verification','exam_set','parent_exam_id'])delete r[k];r.id=id(prefix);r.status='drafting';r.created_at=now();return r;}
 function canHandle(path){return /^\/api\/(exams|revisions|questions|matrices|assessment-plans)(\/|$)/.test(path)||['/api/bank/import','/api/bank/save','/api/bank/save-question','/api/bank/delete-question','/api/ppct/clear-grade','/api/ppct/restore-grade'].includes(path);}
 async function handle(path,body,input,env={}){
  const data=clone(input),p=body||{},engine=env.engine||root.BankStaticEngine,workflow=env.workflow||root.BankStaticWorkflow;
  if(!engine||!workflow)fail('Bộ xử lý ra đề chưa nạp xong. Vui lòng tải lại trang.',503);
  const subject=env.subject||'Tin học',actor=env.actor||'Giáo viên trên trình duyệt';
  const options={actor,reason:p.reason,checklist:p.checklist};
  data.bank=data.bank||{questions:[],ppct:{lessons:[]}};
  data.assessment_plans=Array.isArray(data.assessment_plans)?data.assessment_plans:[];
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
   const contentFields=['grade','type','lesson_code','level','learning_outcome','question','options','correct','option_explanations','statements','short_answer','rubric','max_score','equivalent_answer_policy','competency'];
   const questions=ids.map(key=>{const q=own(find(bank,key));if(q.grade!==grade||q.review_status==='archived')fail('Câu hỏi khác khối hoặc đã lưu trữ.');
    const incoming=payload.questions?.find(x=>x.id===key);
    if(incoming&&contentFields.some(k=>JSON.stringify(incoming[k]??null)!==JSON.stringify(q[k]??null)))fail('Nội dung câu trong đề cương khác ngân hàng. Hãy sửa và duyệt lại câu trong ngân hàng trước khi lập phiên bản đề cương mới.');
    return clone(q);});
   const codes=new Set(questions.map(q=>q.lesson_code));
   const scope=(ppct.lessons||[]).filter(l=>l.grade===grade&&(l.subject_name||'Tin học')===subject&&codes.has(l.lesson_code)).map(l=>({lesson_code:l.lesson_code,title:l.title||l.lesson_name_source||l.lesson_name||l.lesson_code,topic:l.topic||l.topic_source||l.topic_name||''}));
   const simRaw=payload.similarity_target_percent;
   const simPct=simRaw!==undefined&&simRaw!==null&&simRaw!==''&&Number.isFinite(Number(simRaw))?Math.max(0,Math.min(100,Math.round(Number(simRaw)))):(existing?.similarity_target_percent??90);
   return put(data.revisions,{...(existing||{}),id:existing?.id||id('REV'),title:payload.title.trim(),grade,subject_name:subject,lessons:scope,
    status:existing?.status||'drafting',similarity_target_percent:simPct,created_at:existing?.created_at||now(),updated_at:now(),question_ids:ids,questions,question_count:questions.length});
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
  const normSubj=x=>String(x||'Tin học').normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ');
  const normLesson=c=>String(c||'').trim().toUpperCase().replace(/^BÀI\s*/i,'B').replace(/\s+/g,'').replace(/^B0+(\d)/,'B$1');
  const normLevel=lv=>({'nhận biết':'Biết','biết':'Biết','thông hiểu':'Hiểu','hiểu':'Hiểu','vận dụng':'Vận dụng','vận dụng thấp':'Vận dụng','vd':'Vận dụng','vận dụng cao':'Vận dụng cao','vdc':'Vận dụng cao'}[String(lv||'').trim().toLowerCase()]||String(lv||'').trim());
  const normText=s=>String(s||'').normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ');
  const flexTechnical=q=>{
   if(!q||typeof q!=='object'||q.review_status==='archived'||!String(q.id||'').trim()||!String(q.question||'').trim())return false;
   const t=String(q.type||'').trim().toUpperCase();
   if(t==='MC'){const corr=Number(q.correct);return Array.isArray(q.options)&&q.options.length>=2&&Number.isInteger(corr)&&corr>=0&&corr<q.options.length;}
   if(t==='SHORT')return String(q.short_answer??'').trim().length>0||String(q.question||'').trim().length>0;
   return t==='ES'||t==='YN';
  };
  const buildFlexibleSlots=(matrix,bankQuestions,ppctData)=>clone({
   matrix,
   slots:(matrix.slots||[]).map(slot=>{
    const reqs=(slot.parts||[]).map(pt=>(matrix.requirements||[]).find(r=>r.id===pt.requirement_id)).filter(Boolean);
    const mSubj=normSubj(matrix.subject_name||subject);
    const slotKind=String(slot.kind||'').trim().toUpperCase();
    const baseMatches=(bankQuestions||[]).filter(q=>flexTechnical(q)&&Number(q.grade)===Number(matrix.grade)&&normSubj(q.subject_name)===mSubj&&String(q.type||'').trim().toUpperCase()===slotKind);
    const matchesPart=(q,pt)=>{
     const r=(matrix.requirements||[]).find(x=>x.id===pt.requirement_id);
     return r&&normLesson(q.lesson_code)===normLesson(r.lesson_code)&&normLevel(q.level)===normLevel(r.level);
    };
    const parts=slot.parts||[];
    let matches=baseMatches.filter(q=>parts.every(pt=>matchesPart(q,pt)));
    if(!matches.length&&parts.length>1){
     matches=baseMatches.filter(q=>parts.some(pt=>matchesPart(q,pt)));
    }
    const expectedOutcomes=new Set();
    reqs.forEach(r=>{
     const les=(ppctData?.lessons||[]).find(l=>Number(l.grade)===Number(matrix.grade)&&normSubj(l.subject_name)===mSubj&&normLesson(l.lesson_code)===normLesson(r.lesson_code));
     const out=les&&Array.isArray(les.outcomes)&&r.ppct_outcome_index!=null?les.outcomes[r.ppct_outcome_index]:'';
     if(out)expectedOutcomes.add(normText(out));
    });
    const rankOf=q=>{
     const app=q.review_status==='approved'?2:0;
     const outOk=expectedOutcomes.has(normText(q.learning_outcome))?1:0;
     return app+outOk;
    };
    const sorted=matches.slice().sort((a,b)=>rankOf(b)-rankOf(a));
    const seenIds=new Set(),seenTexts=new Set(),candidates=[];
    for(const q of sorted){
     const qt=normText(q.question);
     if(seenIds.has(q.id)||seenTexts.has(qt))continue;
     seenIds.add(q.id);seenTexts.add(qt);
     candidates.push({
      ...clone(q),
      content_hash:q.content_hash||engine.jsonDigest?.({question:q.question,options:q.options,correct:q.correct,rubric:q.rubric})||q.id,
      recently_used:Array.isArray(q.recently_used)?clone(q.recently_used):[]
     });
    }
    return {slot:clone(slot),requirements:clone(reqs),candidates};
   })
  }).slots;
  const assignFlexibleSlots=(flexSlots,opts={})=>{
   if(flexSlots.length>500)fail('Vượt giới hạn 500 vị trí câu hỏi.');
   const revQs=Array.isArray(opts.revision?.questions)?opts.revision.questions:[];
   const revIds=new Set(revQs.map(q=>q.id).filter(Boolean));
   const revTexts=new Set(revQs.map(q=>normText(q.question)).filter(Boolean));
   const inRev=q=>(revIds.has(q.id)||(normText(q.question)&&revTexts.has(normText(q.question))))?1:0;
   const isApp=q=>q.review_status==='approved'?1:0;
   const seedStr=String(opts.seed??'');
   const seedKey=q=>String(engine?.jsonDigest?engine.jsonDigest(seedStr+':'+q.id):q.id);
   const pct=Number.isFinite(Number(opts.percent))?Math.max(0,Math.min(100,Number(opts.percent))):90;
   const simMode=opts.similarity_mode==='exact'?'exact':'min';
   const targetInRev=revQs.length?(simMode==='min'?Math.ceil(flexSlots.length*pct/100):Math.round(flexSlots.length*pct/100)):0;
   const diffCount=revQs.length?Math.max(0,flexSlots.length-targetInRev):0;
   const outsideIdxSet=new Set();
   if(diffCount>0){
    const lvRank=lv=>({'Vận dụng cao':4,'Vận dụng':3,'Hiểu':2,'Biết':1}[normLevel(lv)]||0);
    const kindRank=k=>({ES:4,SHORT:3,YN:2,MC:1}[String(k||'').trim().toUpperCase()]||0);
    const outCandidates=flexSlots.map((entry,idx)=>{
     const cands=entry.candidates||[];
     if(!cands.some(q=>!inRev(q)))return null;
     const srcCell=(entry.requirements&&entry.requirements[0])||entry.cell||{};
     return {idx,lv:lvRank(srcCell.level),kr:kindRank(entry.slot?.kind)};
    }).filter(Boolean).sort((a,b)=>(b.lv-a.lv)||(b.kr-a.kr)||(b.idx-a.idx));
    outCandidates.slice(0,diffCount).forEach(x=>outsideIdxSet.add(x.idx));
   }
   const ordered=flexSlots.map((entry,idx)=>({
    idx,
    slot:entry.slot,
    requirements:entry.requirements||[],
    cell:entry.cell||null,
    pool:[...(entry.candidates||[])].sort((a,b)=>{
     const revCmp=outsideIdxSet.has(idx)?(inRev(a)-inRev(b)):(inRev(b)-inRev(a));
     return revCmp||(isApp(b)-isApp(a))||seedKey(a).localeCompare(seedKey(b));
    })
   })).sort((a,b)=>a.pool.length-b.pool.length||a.idx-b.idx);
   const usedIds=new Set(),usedTexts=new Set(),chosen=new Array(flexSlots.length);
   let attempts=0;
   function backtrack(pos){
    if(pos>=ordered.length)return true;
    if(++attempts>100000)return false;
    const item=ordered[pos];
    for(const q of item.pool){
     const qt=normText(q.question);
     if(usedIds.has(q.id)||(qt&&usedTexts.has(qt)))continue;
     usedIds.add(q.id);
     if(qt)usedTexts.add(qt);
     chosen[item.idx]=q;
     if(backtrack(pos+1))return true;
     usedIds.delete(q.id);
     if(qt)usedTexts.delete(qt);
     chosen[item.idx]=undefined;
    }
    return false;
   }
   if(ordered.every(item=>item.pool.length>0)&&backtrack(0))return chosen;
   const gIds=new Set(),gTexts=new Set(),gAssigned=new Array(flexSlots.length);
   for(const item of ordered){
    const found=item.pool.find(q=>{const qt=normText(q.question);return !gIds.has(q.id)&&!(qt&&gTexts.has(qt));});
    if(found){gIds.add(found.id);const qt=normText(found.question);if(qt)gTexts.add(qt);gAssigned[item.idx]=found;}
   }
   const kindLabels={MC:'TN',YN:'Đ/S',SHORT:'TLN',ES:'TL'};
   const missing=[];
   flexSlots.forEach((entry,i)=>{
    if(!gAssigned[i]){
     const srcCell=(entry.requirements&&entry.requirements[0])||entry.cell||{};
     const kindName=kindLabels[String(entry.slot?.kind||'').toUpperCase()]||entry.slot?.kind||'';
     const meta=[kindName,srcCell.lesson_code,srcCell.level].filter(Boolean).join(' · ');
     missing.push(`Câu ${entry.slot?.number||(i+1)}${meta?` (${meta})`:''}`);
    }
   });
   fail(`Chưa đủ câu hỏi trong ngân hàng cho ${missing.length} vị trí: ${missing.slice(0,5).join(', ')}${missing.length>5?'…':''}. Vui lòng bổ sung câu hỏi cho các bài/mức độ này.`);
  };
  const buildFlexibleBlueprintSlots=(blueprint,grade,subj,bankQuestions)=>{
   if(!Array.isArray(blueprint)||!blueprint.length)fail('Cần ma trận đã lưu hoặc phân bố đủ 10 điểm.');
   const slots=[];let total=0;
   const mSubj=normSubj(subj||subject);
   blueprint.forEach((r,index)=>{
    const cnt=Number(r?.count),pts=Number(r?.points_per_question);
    const kind=String(r?.type||'').trim().toUpperCase();
    const lv=normLevel(r?.level);
    if(!r||!Number.isInteger(cnt)||cnt<1||cnt>500||!(pts>0)||!['MC','YN','SHORT','ES'].includes(kind)||!lv){
     fail('Phân bố câu hỏi không hợp lệ.');
    }
    const matches=(bankQuestions||[]).filter(q=>
     flexTechnical(q)&&Number(q.grade)===Number(grade)&&normSubj(q.subject_name)===mSubj&&
     normLesson(q.lesson_code)===normLesson(r.lesson_code)&&String(q.type||'').trim().toUpperCase()===kind&&
     normLevel(q.level)===lv
    ).sort((a,b)=>(b.review_status==='approved'?1:0)-(a.review_status==='approved'?1:0));
    const seenIds=new Set(),seenTexts=new Set(),candidates=[];
    for(const q of matches){
     const qt=normText(q.question);
     if(seenIds.has(q.id)||seenTexts.has(qt))continue;
     seenIds.add(q.id);seenTexts.add(qt);
     candidates.push({
      ...clone(q),
      content_hash:q.content_hash||engine.jsonDigest?.({question:q.question,options:q.options,correct:q.correct,rubric:q.rubric})||q.id,
      recently_used:Array.isArray(q.recently_used)?clone(q.recently_used):[]
     });
    }
    for(let i=0;i<cnt;i++){
     const num=slots.filter(s=>s.slot.kind===kind).length+1;
     slots.push({
      slot:{id:'BP-'+index+'-'+i,kind,number:num,parts:[{id:'BP-P-'+index+'-'+i,points:pts}]},
      requirements:[],
      candidates,
      cell:{lesson_code:r.lesson_code,type:kind,level:lv,outcomes:Array.isArray(r.outcomes)?clone(r.outcomes):[]}
     });
    }
    total+=cnt*pts;
   });
   if(Math.abs(total-10)>1e-4)fail('Tổng điểm phân bố phải bằng 10.');
   if(slots.length>500)fail('Phân bố vượt giới hạn 500 câu.');
   return slots;
  };
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
   const cleanText=s=>String(s||'').normalize('NFC').toLowerCase().replace(/[\s\p{P}]+/gu,' ').trim();
   const matchOutcome=(target,outcomes)=>{
    if(!target||!Array.isArray(outcomes)||!outcomes.length)return null;
    if(outcomes.includes(target))return target;
    const cleanTarget=cleanText(target);
    if(!cleanTarget)return null;
    const exactClean=outcomes.find(o=>cleanText(o)===cleanTarget);
    if(exactClean)return exactClean;
    if(cleanTarget.length>=15){
     const subClean=outcomes.find(o=>{
      const co=cleanText(o);
      return co.includes(cleanTarget)||cleanTarget.includes(co);
     });
     if(subClean)return subClean;
    }
    const targetTokens=new Set(cleanTarget.split(' ').filter(w=>w.length>2));
    let best=null,bestScore=0;
    for(const o of outcomes){
     const oTokens=new Set(cleanText(o).split(' ').filter(w=>w.length>2));
     let common=0;
     for(const t of targetTokens){if(oTokens.has(t))common++;}
     const score=common/Math.max(1,targetTokens.size);
     if(score>bestScore&&common>=2&&score>=0.35){bestScore=score;best=o;}
    }
    return best;
   };
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
      const outcomes=lesson.outcomes||[];
      if(outcomes.length&&q.learning_outcome){
       const matched=matchOutcome(q.learning_outcome,outcomes);
       if(matched)q.learning_outcome=matched;
       else fail(`Yêu cầu cần đạt không khớp với PPCT của bài ${lesson.lesson_code}, khối ${q.grade}.`);
      }
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
   else if(p.action==='grade'||p.action==='move_grade'){
    const newGrade = Number(p.status || p.grade) || 9;
    qs.forEach(q=>{
      q.grade = newGrade;
      put(bank, q);
    });
   }
   else if(p.action==='bulk_approve'){
    if(p.confirmed!==true)fail('Cần xác nhận trước khi duyệt nhanh hàng loạt.');
    const at=now();
    let approved_count=0,already_approved_count=0;
    const skipped=[];
    qs.forEach(orig=>{
     const q=clone(orig);
     const st=q.review_status||'draft';
     if(st==='archived'){skipped.push({id:q.id,reason:'Câu đã lưu trữ.'});return;}
     if(st==='approved'){already_approved_count++;return;}
     const probs=workflow.technicalProblems?workflow.technicalProblems(q):[];
     if(probs.length){skipped.push({id:q.id,reason:probs[0]});return;}
     q.review_status='approved';
     q.approved_at=at;
     q.approved_by=actor;
     q.updated_at=at;
     delete q.archived_at;
     delete q.status_before_archive;
     q.review_history=Array.isArray(q.review_history)?q.review_history:[];
     q.review_history.push({action:'approve',at,by:actor,from_status:st,reason:'Duyệt nhanh hàng loạt'});
     put(bank,q);
     approved_count++;
    });
    return result({bank:data.bank,approved_count,already_approved_count,skipped_count:skipped.length,skipped},true);
   }
   else{
    const action=p.action==='status'?{pending_review:'submit',archived:'archive',restore:'restore'}[p.status]||p.action:p.action;
    if(!action||action==='approve')fail('Muốn duyệt câu phải mở phiếu kiểm định và xác nhận đủ từng mục.');
    qs.forEach(q=>put(bank,workflow.reviewQuestion(q,action,options)));
   }
   return result({bank:data.bank},true);
  }
  if(path==='/api/ppct/clear-grade'){
   const grade=Number(p.grade||0),targetSubject=p.subject_name||subject;
   data.bank.ppct=data.bank.ppct||{lessons:[],cleared_grades:[]};
   const cleared=new Set(data.bank.ppct.cleared_grades||[]);
   cleared.add(grade);
   data.bank.ppct.cleared_grades=[...cleared];
   data.bank.ppct.lessons=(data.bank.ppct.lessons||[]).filter(l=>!(((l.subject_name||'Tin học')===targetSubject)&&Number(l.grade)===grade));
   return result({bank:data.bank},true);
  }
  if(path==='/api/ppct/restore-grade'){
   const grade=Number(p.grade||0),targetSubject=p.subject_name||subject;
   data.bank.ppct=data.bank.ppct||{lessons:[],cleared_grades:[]};
   data.bank.ppct.cleared_grades=(data.bank.ppct.cleared_grades||[]).filter(x=>Number(x)!==grade&&x!==`${targetSubject}:${grade}`);
   return result({bank:data.bank},true);
  }
  if(path==='/api/revisions/propose'){
   if(p.flexible!==true)return result(engine.proposeRevision(data,{...p,subject_name:subject}));
   const targetMatrix=p.matrix_id?(data.matrices.find(m=>m.id===p.matrix_id)||null):null;
   if(p.matrix_id&&!targetMatrix)fail('Không tìm thấy phiên bản ma trận đã lưu.');
   const mGrade=Number(targetMatrix?targetMatrix.grade:p.grade);
   const mSubj=(targetMatrix&&targetMatrix.subject_name)||p.subject_name||subject;
   const flexSlots=targetMatrix
    ?buildFlexibleSlots(targetMatrix,bank,ppct)
    :buildFlexibleBlueprintSlots(p.blueprint,mGrade,mSubj,bank);
   const groupMap=new Map();
   for(const entry of flexSlots){
    const s=entry.slot;
    const firstReq=(entry.requirements&&entry.requirements[0])||null;
    const srcCell=firstReq||entry.cell||{};
    const lessonCode=srcCell.lesson_code||'';
    const kind=String(s?.kind||'MC').trim().toUpperCase();
    const level=normLevel(srcCell.level||'Biết');
    const key=[normLesson(lessonCode),kind,level].join('|');
    let g=groupMap.get(key);
    if(!g){
     let outcomes=[];
     if(firstReq){
      const les=(ppct.lessons||[]).find(l=>Number(l.grade)===mGrade&&normSubj(l.subject_name)===normSubj(mSubj)&&normLesson(l.lesson_code)===normLesson(lessonCode));
      const o=les&&Array.isArray(les.outcomes)&&firstReq.ppct_outcome_index!=null?les.outcomes[firstReq.ppct_outcome_index]:'';
      outcomes=o?[o]:(firstReq.text?[firstReq.text]:[]);
     }else if(Array.isArray(srcCell.outcomes)){
      outcomes=clone(srcCell.outcomes);
     }
     g={key,lesson_code:lessonCode,type:kind,level,outcomes,need:0,points:[],pool:[],seenPool:new Set(),seenText:new Set()};
     groupMap.set(key,g);
    }
    g.need++;
    g.points.push((s?.parts||[]).reduce((sum,pt)=>sum+Number(pt.points||0),0));
    for(const q of (entry.candidates||[])){
     const qt=normText(q.question);
     if(!g.seenPool.has(q.id)&&!(qt&&g.seenText.has(qt))){
      g.seenPool.add(q.id);if(qt)g.seenText.add(qt);
      g.pool.push(q);
     }
    }
   }
   const groups=[...groupMap.values()];
   const allocateWithCap=(items,target)=>{
    const out=new Map(items.map(it=>[it.key,0]));
    let left=Math.max(0,Math.floor(Number(target)||0));
    let active=items.filter(it=>it.pool.length>0);
    while(left>0&&active.length){
     const sumNeed=active.reduce((s,it)=>s+Math.max(1,it.need),0);
     let givenRound=0;
     const rems=[];
     for(const it of active){
      const capLeft=it.pool.length-out.get(it.key);
      const exact=left*(Math.max(1,it.need)/sumNeed);
      const add=Math.min(capLeft,Math.floor(exact));
      if(add>0){out.set(it.key,out.get(it.key)+add);givenRound+=add;}
      if(capLeft>add)rems.push({it,frac:exact-Math.floor(exact)});
     }
     left-=givenRound;
     if(left>0&&rems.length){
      rems.sort((a,b)=>b.frac-a.frac||b.it.need-a.it.need||a.it.key.localeCompare(b.it.key));
      let remGiven=0;
      for(const r of rems){
       if(left<=0)break;
       const cur=out.get(r.it.key);
       if(cur<r.it.pool.length){out.set(r.it.key,cur+1);left--;remGiven++;}
      }
      if(!givenRound&&!remGiven)break;
     }else if(!givenRound){
      break;
     }
     active=active.filter(it=>out.get(it.key)<it.pool.length);
    }
    return out;
   };
   const warnings=[];
   const reqMap=new Map();
   const typeLabels={MC:'Trắc nghiệm',YN:'Đúng/Sai',SHORT:'Trả lời ngắn',ES:'Tự luận'};
   if(p.type_counts&&typeof p.type_counts==='object'){
    for(const tp of ['MC','YN','SHORT','ES']){
     const typeGroups=groups.filter(g=>g.type===tp);
     if(!typeGroups.length)continue;
     const want=Math.max(0,Math.floor(Number(p.type_counts[tp])||0));
     const availSum=typeGroups.reduce((n,g)=>n+g.pool.length,0);
     if(want>availSum)warnings.push(`Dạng ${typeLabels[tp]||tp} yêu cầu ${want} câu nhưng ngân hàng chỉ có ${availSum} câu.`);
     const alloc=allocateWithCap(typeGroups,Math.min(want,availSum));
     alloc.forEach((v,k)=>reqMap.set(k,v));
    }
   }else if(p.counts&&typeof p.counts==='object'){
    const normCounts=new Map();
    Object.entries(p.counts).forEach(([k,v])=>{
     const parts=String(k).split('|');
     const nk=parts.length>=3?[normLesson(parts[0]),String(parts[1]||'').trim().toUpperCase(),normLevel(parts[2])].join('|'):k;
     normCounts.set(nk,(normCounts.get(nk)||0)+Math.max(0,Math.floor(Number(v)||0)));
    });
    for(const g of groups){
     const rawWant=p.counts[g.key]!==undefined?Math.max(0,Math.floor(Number(p.counts[g.key])||0)):(normCounts.get(g.key)||0);
     reqMap.set(g.key,rawWant);
    }
   }else if(p.total!=null){
    const alloc=allocateWithCap(groups,Math.max(1,Math.floor(Number(p.total)||1)));
    alloc.forEach((v,k)=>reqMap.set(k,v));
   }else{
    for(const g of groups)reqMap.set(g.key,Math.min(g.pool.length,Math.ceil(g.need*1.5)));
   }
   const seed=String(p.seed||Date.now());
   const hashPick=(q,keyStr)=>String(engine?.jsonDigest?engine.jsonDigest(seed+':'+keyStr+':'+q.id):q.id);
   const chosenIds=[],chosenSet=new Set(),chosenTexts=new Set();
   const cellsOut=groups.map(g=>{
    const req=reqMap.get(g.key)||0;
    const sortedPool=[...g.pool].sort((a,b)=>hashPick(a,g.key).localeCompare(hashPick(b,g.key)));
    const picked=[];
    for(const q of sortedPool){
     if(picked.length>=req)break;
     const qt=normText(q.question);
     if(chosenSet.has(q.id)||(qt&&chosenTexts.has(qt)))continue;
     chosenSet.add(q.id);if(qt)chosenTexts.add(qt);
     chosenIds.push(q.id);picked.push(q.id);
    }
    if(picked.length<req)warnings.push(`Ô ${g.lesson_code} · ${typeLabels[g.type]||g.type} · ${g.level} thiếu câu: cần ${req}, có ${g.pool.length}.`);
    const {seenPool,seenText,pool,...rest}=g;
    return {...rest,available:pool.length,requested:req,revision_count:picked.length,question_ids:picked};
   });
   return result({cells:cellsOut,question_ids:chosenIds,total:chosenIds.length,exam_question_count:flexSlots.length,warnings});
  }
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
  const enrichExamPayload=rawP=>{
   const gp={...rawP,subject_name:rawP.subject_name||subject};
   let tm=null;
   if(gp.matrix_id){
    tm=data.matrices.find(m=>m.id===gp.matrix_id)||null;
    if(tm){
     if(gp.grade===undefined||gp.grade===null||gp.grade==='')gp.grade=Number(tm.grade);
     if(!gp.exam_type)gp.exam_type=tm.exam_type;
     if(gp.duration===undefined||gp.duration===null||gp.duration==='')gp.duration=Number(tm.duration||45);
     if(!rawP.subject_name&&tm.subject_name)gp.subject_name=tm.subject_name;
    }
   }
   if(gp.grade!==undefined&&gp.grade!==null&&gp.grade!=='')gp.grade=Number(gp.grade);
   if(gp.duration!==undefined&&gp.duration!==null&&gp.duration!=='')gp.duration=Number(gp.duration);
   return {genPayload:gp,targetMatrix:tm};
  };
  const resolveFlexSource=(genPayload,rawP,targetMatrix)=>{
   if(typeof genPayload.title!=='string'||!genPayload.title.trim())fail('Cần nhập tên đề kiểm tra.');
   if(!Number.isInteger(genPayload.grade)||!['TX','GK1','CK1','GK2','CK2'].includes(genPayload.exam_type)||!String(genPayload.subject_name||'').trim()){
    fail('Cần khối, môn học và kì kiểm tra hợp lệ.');
   }
   const dur=genPayload.duration??45;
   if(!Number.isInteger(dur)||dur<1||dur>300)fail('Thời gian phải từ 1 đến 300 phút.');
   if(targetMatrix){
    if(targetMatrix.status!=='locked')fail('Chọn phiên bản ma trận đã khóa.');
    if(Number(targetMatrix.grade)!==Number(genPayload.grade)||normSubj(targetMatrix.subject_name||subject)!==normSubj(genPayload.subject_name||subject)||targetMatrix.exam_type!==genPayload.exam_type){
     fail('Ma trận không khớp khối, môn hoặc kì kiểm tra.');
    }
    return buildFlexibleSlots(targetMatrix,bank,ppct);
   }
   if(Array.isArray(rawP.blueprint)&&rawP.blueprint.length){
    return buildFlexibleBlueprintSlots(rawP.blueprint,genPayload.grade,genPayload.subject_name||subject,bank);
   }
   fail('Cần ma trận đã lưu hoặc phân bố đủ 10 điểm.');
  };
  const assembleFlexibleExam=({targetMatrix,blueprint,flexSlots,pickedQuestions,genPayload,rev,reviewedPartsMap})=>{
   let totalPts=0;
   const mGrade=Number(targetMatrix?targetMatrix.grade:genPayload.grade);
   const mSubj=(targetMatrix&&targetMatrix.subject_name)||genPayload.subject_name||subject;
   const mType=(targetMatrix&&targetMatrix.exam_type)||genPayload.exam_type;
   const selectedQuestions=flexSlots.map((entry,i)=>{
    const s=entry.slot;
    const cand=pickedQuestions[i];
    const slotPts=(s.parts||[]).reduce((sum,pt)=>sum+Number(pt.points||0),0);
    totalPts+=slotPts;
    const firstPart=s.parts&&s.parts[0];
    const req=targetMatrix&&firstPart?(targetMatrix.requirements||[]).find(r=>r.id===firstPart.requirement_id):null;
    const ppctLes=req?(ppct.lessons||[]).find(l=>Number(l.grade)===mGrade&&normSubj(l.subject_name)===normSubj(mSubj)&&normLesson(l.lesson_code)===normLesson(req.lesson_code)):null;
    const ppctOutcome=(ppctLes&&Array.isArray(ppctLes.outcomes)&&req.ppct_outcome_index!=null)?ppctLes.outcomes[req.ppct_outcome_index]:'';
    const fallbackOutcome=ppctOutcome||req?.text||(entry.cell?.outcomes?.[0]||'');
    return {
     ...clone(cand),
     points:slotPts,
     slot_id:s.id,
     slot_number:s.number,
     reviewed_part_ids:reviewedPartsMap?clone(reviewedPartsMap.get(s.id)||[]):[],
     learning_outcome:(cand.learning_outcome&&String(cand.learning_outcome).trim())?cand.learning_outcome:fallbackOutcome,
     competency:cand.competency||req?.competency||'',
     level:normLevel(cand.level)||req?.level||entry.cell?.level||''
    };
   });
   const revHashes=new Set((rev?.questions||[]).map(rq=>rq.content_hash).filter(Boolean));
   const revMatched=rev?selectedQuestions.filter(q=>revHashes.has(q.content_hash)||rev.questions.some(rq=>rq.id===q.id||normText(rq.question)===normText(q.question))).length:null;
   const note=targetMatrix
    ?'Bản nháp tạo từ Ma trận 2D (Chế độ linh hoạt). Cần duyệt các câu hỏi Nháp/Chờ duyệt và gắn đề cương trước khi khóa/phát hành.'
    :'Bản nháp tạo theo phân bố linh hoạt. Cần duyệt câu hỏi Nháp/Chờ duyệt và chọn ma trận đã khóa/đề cương trước khi khóa/phát hành.';
   const exam={
    id:id('EXAM'),
    title:genPayload.title.trim(),
    grade:mGrade,
    subject_name:mSubj,
    exam_type:mType,
    duration:Number(genPayload.duration||targetMatrix?.duration||45),
    campus:genPayload.campus||targetMatrix?.campus||'',
    exam_code:genPayload.exam_code||'101',
    created_at:now(),
    seed:genPayload.seed??'',
    status:'drafting',
    flexible_draft:true,
    question_count:selectedQuestions.length,
    total_points:Number(totalPts.toFixed(4)),
    questions:selectedQuestions,
    ...(targetMatrix?{
     matrix_id:targetMatrix.id,
     matrix_version:targetMatrix.version,
     matrix_digest:targetMatrix.content_sha256||engine.matrixDigest?.(targetMatrix)||null,
     matrix_snapshot:clone(targetMatrix)
    }:{
     blueprint:clone(blueprint||[])
    }),
    ppct_snapshot:clone(ppct),
    revision_id:rev?.id||null,
    revision_snapshot:rev?clone(rev):null,
    revision_match_count:revMatched,
    similarity_target_percent:Number(genPayload.similarity_percent??90),
    similarity_mode:genPayload.similarity_mode||'min',
    scoring_policy:clone(targetMatrix?.scoring_policy||{yn_table:{'0':'0','1':'0.1','2':'0.25','3':'0.5','4':'1'},rounding:mType==='TX'?'half_up_integer':'half_up_1dp',blank_counts_as:'wrong'}),
    allowed_kinds:clone(targetMatrix?.allowed_kinds||[...new Set(selectedQuestions.map(q=>q.type))]),
    validation_note:note
   };
   exam.verification=verification(exam);
   return exam;
  };
  const findRecentDuplicateExam=(exams,genPayload,targetMatrix,expectedIds)=>{
   const nowMs=Date.now();
   const targetTitle=String(genPayload.title||'').trim();
   const targetGrade=Number(targetMatrix?targetMatrix.grade:genPayload.grade);
   const targetSubj=normSubj((targetMatrix&&targetMatrix.subject_name)||genPayload.subject_name||subject);
   const targetType=(targetMatrix&&targetMatrix.exam_type)||genPayload.exam_type;
   const targetMxId=targetMatrix?targetMatrix.id:null;
   const targetCode=String(genPayload.exam_code||'101');
   const targetSeed=String(genPayload.seed??'');
   const idSig=JSON.stringify(expectedIds||[]);
   return (exams||[]).find(ex=>{
    if(!ex||ex.status!=='drafting')return false;
    const t=Date.parse(ex.created_at||'');
    if(!Number.isFinite(t)||Math.abs(nowMs-t)>=15000)return false;
    return Number(ex.grade)===targetGrade
     &&normSubj(ex.subject_name)===targetSubj
     &&ex.exam_type===targetType
     &&String(ex.title||'').trim()===targetTitle
     &&(ex.matrix_id||null)===targetMxId
     &&String(ex.exam_code||'101')===targetCode
     &&String(ex.seed??'')===targetSeed
     &&JSON.stringify((ex.questions||[]).map(q=>q.id))===idSig;
   })||null;
  };
  if(path==='/api/exams/generate'||path==='/api/exams/from-matrix'){
   const {genPayload,targetMatrix}=enrichExamPayload(p);
   if(path==='/api/exams/from-matrix'&&p.flexible===true&&targetMatrix){
    if(typeof genPayload.title!=='string'||!genPayload.title.trim())fail('Cần nhập tên đề kiểm tra.');
    if(targetMatrix.status!=='locked')fail('Chọn phiên bản ma trận đã khóa.');
    if(Number(targetMatrix.grade)!==Number(genPayload.grade)||normSubj(targetMatrix.subject_name||subject)!==normSubj(genPayload.subject_name||subject)||targetMatrix.exam_type!==genPayload.exam_type){
     fail('Ma trận không khớp khối, môn hoặc kì kiểm tra.');
    }
    const flexSlots=buildFlexibleSlots(targetMatrix,bank,ppct);
    if(!Array.isArray(p.placements)||p.placements.length!==flexSlots.length||new Set(p.placements.map(x=>x&&x.slot_id)).size!==flexSlots.length){
     fail('Phải chọn đủ đúng một câu cho mỗi vị trí, không trùng.');
    }
    const seenIds=new Set(),seenTexts=new Set(),pickedQuestions=[];
    const reviewedPartsMap=new Map();
    for(const entry of flexSlots){
     const s=entry.slot;
     const pl=p.placements.find(x=>x&&x.slot_id===s.id);
     if(!pl)fail('Vị trí chọn không khớp ma trận.');
     const expectedParts=(s.parts||[]).map(pt=>pt.id);
     if(!Array.isArray(pl.reviewed_part_ids)||pl.reviewed_part_ids.length!==expectedParts.length||new Set(pl.reviewed_part_ids).size!==expectedParts.length||expectedParts.some(pid=>!pl.reviewed_part_ids.includes(pid))){
      fail('Cần xác nhận đối chiếu từng chỉ báo của vị trí.');
     }
     const cand=(entry.candidates||[]).find(q=>q.id===pl.question_id);
     if(!cand)fail('Câu được chọn không khớp khối, môn, bài, dạng hoặc mức độ trong ma trận.');
     const qt=normText(cand.question);
     if(seenIds.has(cand.id)||(qt&&seenTexts.has(qt)))fail('Không được lặp câu trong một đề.');
     seenIds.add(cand.id);if(qt)seenTexts.add(qt);
     pickedQuestions.push(cand);
     reviewedPartsMap.set(s.id,pl.reviewed_part_ids);
    }
    const dup=findRecentDuplicateExam(data.exams,genPayload,targetMatrix,pickedQuestions.map(q=>q.id));
    if(dup)return result({exam:dup,exams:data.exams},false);
    const rev=genPayload.revision_id?own(find(data.revisions,genPayload.revision_id)):null;
    const exam=assembleFlexibleExam({targetMatrix,flexSlots,pickedQuestions,genPayload,rev,reviewedPartsMap});
    put(data.exams,exam);return result({exam,exams:data.exams},true);
   }
   if(path==='/api/exams/generate'&&p.flexible===true){
    const flexSlots=resolveFlexSource(genPayload,p,targetMatrix);
    const rev=genPayload.revision_id?own(find(data.revisions,genPayload.revision_id)):null;
    if(rev&&Number(rev.grade)!==Number(genPayload.grade))fail('Đề cương phải cùng khối, môn và kì kiểm tra.');
    const pickedQuestions=assignFlexibleSlots(flexSlots,{revision:rev,seed:genPayload.seed,percent:genPayload.similarity_percent??rev?.similarity_target_percent??90,similarity_mode:genPayload.similarity_mode||'min'});
    const dup=findRecentDuplicateExam(data.exams,genPayload,targetMatrix,pickedQuestions.map(q=>q.id));
    if(dup)return result({exam:dup,exams:data.exams},false);
    const exam=assembleFlexibleExam({targetMatrix,blueprint:p.blueprint,flexSlots,pickedQuestions,genPayload,rev});
    put(data.exams,exam);return result({exam,exams:data.exams},true);
   }
   const exam=clone(engine.generateExam(data,genPayload));exam.created_at=now();exam.verification=verification(exam);put(data.exams,exam);return result({exam,exams:data.exams},true);
  }
  if(path==='/api/exams/generate-set'){
   const count=Number(p.exam_count);if(!Number.isInteger(count)||count<1||count>6)fail('Số đề trong bộ phải từ 1 đến 6.');
   if(p.flexible===true){
    const {genPayload,targetMatrix}=enrichExamPayload(p);
    const flexSlots=resolveFlexSource(genPayload,p,targetMatrix);
    let revision=genPayload.revision_id?own(find(data.revisions,genPayload.revision_id)):null;
    if(revision&&Number(revision.grade)!==Number(genPayload.grade))fail('Đề cương phải cùng khối, môn và kì kiểm tra.');
    let createdRev=null;
    if(!revision){
     const revSet=new Set();
     if(p.revision_counts&&typeof p.revision_counts==='object'&&Object.values(p.revision_counts).some(v=>Number(v)>0)){
      const wantByGroup=new Map();
      Object.entries(p.revision_counts).forEach(([k,v])=>{
       const parts=String(k).split('|');
       const gk=[normLesson(parts[0]),String(parts[1]||'').toUpperCase(),normLevel(parts[2])].join('|');
       wantByGroup.set(gk,(wantByGroup.get(gk)||0)+Math.max(0,Math.floor(Number(v)||0)));
      });
      const takenByGroup=new Map();
      for(const entry of flexSlots){
       const srcCell=(entry.requirements&&entry.requirements[0])||entry.cell||{};
       const gk=[normLesson(srcCell.lesson_code),String(entry.slot?.kind||'').toUpperCase(),normLevel(srcCell.level)].join('|');
       const limit=wantByGroup.get(gk)||0;
       if((takenByGroup.get(gk)||0)<limit){
        for(const q of (entry.candidates||[])){
         if((takenByGroup.get(gk)||0)>=limit)break;
         if(!revSet.has(q.id)){revSet.add(q.id);takenByGroup.set(gk,(takenByGroup.get(gk)||0)+1);}
        }
       }
      }
     }
     if(!revSet.size){
      for(const entry of flexSlots){
       for(const q of (entry.candidates||[]))revSet.add(q.id);
      }
     }
     const revIds=[...revSet];
     const revQs=revIds.map(qid=>clone(bank.find(q=>q.id===qid))).filter(Boolean);
     const codes=new Set(revQs.map(q=>normLesson(q.lesson_code)));
     const mSubj=normSubj(genPayload.subject_name||subject);
     const scope=(ppct.lessons||[]).filter(l=>Number(l.grade)===Number(genPayload.grade)&&normSubj(l.subject_name)===mSubj&&codes.has(normLesson(l.lesson_code))).map(l=>({lesson_code:l.lesson_code,title:l.title||l.lesson_name_source||l.lesson_name||l.lesson_code,topic:l.topic||l.topic_source||l.topic_name||''}));
     createdRev={id:id('REV'),title:genPayload.title.trim()+' — Đề cương',grade:Number(genPayload.grade),subject_name:genPayload.subject_name||subject,exam_type:genPayload.exam_type,lessons:scope,status:'drafting',similarity_target_percent:genPayload.similarity_percent??90,created_at:now(),updated_at:now(),question_ids:revIds,questions:revQs,question_count:revQs.length};
     revision=createdRev;
    }
    const setId=id('SET'),exams=[];
    for(let n=0;n<count;n++){
     const examSeed=String(genPayload.seed??'')+':'+n;
     const pickedQuestions=assignFlexibleSlots(flexSlots,{revision,seed:examSeed,percent:genPayload.similarity_percent??revision?.similarity_target_percent??90,similarity_mode:genPayload.similarity_mode||'min'});
     const exam=assembleFlexibleExam({targetMatrix,blueprint:p.blueprint,flexSlots,pickedQuestions,genPayload:{...genPayload,title:genPayload.title.trim()+` — Đề ${n+1}`,exam_code:String(101+n),seed:examSeed},rev:revision});
     exam.exam_set={id:setId,index:n+1,count};
     exams.push(exam);
    }
    if(createdRev)put(data.revisions,createdRev);
    exams.forEach(ex=>put(data.exams,ex));
    const revIdSet=new Set(revision.question_ids||(revision.questions||[]).map(q=>q.id));
    const shared=exams.some((e,i)=>exams.slice(i+1).some(other=>e.questions.some(q=>other.questions.some(x=>x.id===q.id))));
    return result({exams,exams_all:data.exams,revisions:data.revisions,revision,revision_size:revision.questions.length,
     outside_per_exam:exams[0].questions.filter(q=>!revIdSet.has(q.id)).length,
     warnings:shared?['Các đề trong bộ có dùng chung câu; hãy xem báo cáo so sánh trước khi chọn dùng.']:[]},true);
   }
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
   if(Array.isArray(p.ids)&&p.ids.length){
    const idSet=new Set();
    for(const key of p.ids){
     const old=own(find(data.exams,key));
     workflow.assertEditable(old);
     idSet.add(old.id);
    }
    data.exams=data.exams.filter(e=>!idSet.has(e.id));
    return result({exams:data.exams,deleted_count:idSet.size},true);
   }
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
   if(match[2]==='candidates'){
    const strictRes=engine.candidates(matrix,bank,ppct);
    const flexible_slots=buildFlexibleSlots(matrix,bank,ppct);
    const mSubj=normSubj(matrix.subject_name||subject);
    const gradeQuestions=bank.filter(q=>q&&q.review_status!=='archived'&&Number(q.grade)===Number(matrix.grade)&&normSubj(q.subject_name)===mSubj);
    const approvedInGrade=gradeQuestions.filter(q=>q.review_status==='approved').length;
    const bank_diagnostics={
     total_in_grade:gradeQuestions.length,
     approved_in_grade:approvedInGrade,
     unapproved_in_grade:gradeQuestions.length-approvedInGrade,
     strict_empty_slots:(strictRes.slots||[]).filter(s=>!(s.candidates&&s.candidates.length)).length,
     flexible_empty_slots:flexible_slots.filter(s=>!(s.candidates&&s.candidates.length)).length
    };
    return result({...strictRes,flexible_slots,bank_diagnostics});
   }
   const validation=engine.validateMatrix(matrix,ppct);return result({matrix,validation,ppct_differences:validation.errors||[]});}
  if(path==='/api/assessment-plans'||path==='/api/assessment-plans/list'){
   const g=p.grade?Number(p.grade):null;
   let list=(data.assessment_plans||[]).filter(plan=>(plan.subject_name||'Tin học')===subject);
   if(g)list=list.filter(plan=>Number(plan.grade)===g);
   return result({assessment_plans:list});
  }
  if(path==='/api/assessment-plans/save'){
   const raw=clone(p.plan||{});
   if(!raw.name?.trim())fail('Tên đợt kiểm tra đánh giá không được để trống.');
   const grade=Number(raw.grade||p.grade||8);
   const planModel=root.BankAssessmentPlan||(typeof require==='function'?require('./assessment-plan-model.js'):null);
   const normalized=planModel?planModel.normalizePlan(raw,grade,subject):{id:raw.id||id('AP'),grade,subject_name:subject,...raw};
   put(data.assessment_plans,normalized);
   return result({plan:normalized,assessment_plans:data.assessment_plans},true);
  }
  if(path==='/api/assessment-plans/delete'){
   const targetId=p.id;
   if(!targetId)fail('Thiếu mã kế hoạch kiểm tra đánh giá.');
   data.assessment_plans=(data.assessment_plans||[]).filter(ap=>ap.id!==targetId);
   return result({success:true,assessment_plans:data.assessment_plans},true);
  }
  if(path==='/api/assessment-plans/reset-defaults'){
   const grade=Number(p.grade||8);
   const planModel=root.BankAssessmentPlan||(typeof require==='function'?require('./assessment-plan-model.js'):null);
   if(!planModel)fail('Chưa nạp bộ định nghĩa KHKTĐG.',503);
   const defaults=planModel.buildDefaultAssessmentPlans(grade,subject);
   data.assessment_plans=[...(data.assessment_plans||[]).filter(ap=>Number(ap.grade)!==grade||(ap.subject_name||'Tin học')!==subject),...defaults];
   return result({success:true,assessment_plans:data.assessment_plans,defaults},true);
  }
  if(path==='/api/assessment-plans/import'){
   const planModel=root.BankAssessmentPlan||(typeof require==='function'?require('./assessment-plan-model.js'):null);
   if(!planModel)fail('Chưa nạp bộ định nghĩa KHKTĐG.',503);
   const grade=Number(p.grade||8);
   let imported=[];
   if(Array.isArray(p.plans)){imported=p.plans.map(raw=>planModel.normalizePlan(raw,grade,subject));}
   else if(Array.isArray(p.rows)){imported=planModel.parseAssessmentPlansFromRows(p.rows,grade,subject);}
   else{fail('Thiếu danh sách kế hoạch (plans hoặc rows).');}
   imported.forEach(plan=>put(data.assessment_plans,plan));
   return result({success:true,imported,assessment_plans:data.assessment_plans},true);
  }
  fail('Thao tác này chưa được hỗ trợ trên bản Pages. Không có dữ liệu nào được thay đổi.',501);
 }
 const api={canHandle,handle};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BankStaticAPI=api;
})(typeof window!=='undefined'?window:globalThis);
