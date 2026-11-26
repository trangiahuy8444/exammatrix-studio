/* Điều phối nghiệp vụ Pages trên bản sao: caller chỉ lưu khi toàn bộ thao tác đạt. */
(function(root){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x)),now=()=>new Date().toISOString();
 const id=p=>p+'-'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
 function fail(message,status=400,details){const e=new Error(message);e.status=status;if(details)e.details=details;throw e;}
 function find(list,key){if(typeof key!=='string'||!key)fail('Thiếu mã hồ sơ.');const r=list.find(x=>x.id===key);if(!r)fail('Không tìm thấy hồ sơ trong không gian hiện tại.',404);return r;}
 function put(list,value){const i=list.findIndex(x=>x.id===value.id);if(i<0)list.push(value);else list[i]=value;return value;}
 function draft(record,prefix){const r=clone(record);for(const k of ['approved_hash','approved_by','approved_at','locked_at','published_at','published_by','locked_by','usage','lifecycle','verification','exam_set','parent_exam_id'])delete r[k];r.id=id(prefix);r.status='drafting';r.created_at=now();return r;}
 // Thông tin bộ đề giống bản Python (bank_service.generate_exam_set): id, title, revision_id, exam_ids, created_at, index, count.
 function stampExamSet(exams,{id,title,revision_id}){const exam_ids=exams.map(e=>e.id),created_at=new Date().toISOString();exams.forEach((e,i)=>{e.exam_set={id,title,revision_id,exam_ids,created_at,index:i+1,count:exams.length};});}
 function canHandle(path){return /^\/api\/(exams|revisions|questions|matrices|assessment-plans|knowledge)(\/|$)/.test(path)||['/api/bank/import','/api/bank/save','/api/bank/save-question','/api/bank/delete-question','/api/ppct/clear-grade','/api/ppct/restore-grade'].includes(path);}
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
   const grade=Number(payload.grade??existing?.grade),rawIds=payload.question_ids??payload.questions?.map(q=>q.id);
   // Thông báo đúng điều sai (trước đây gộp chung: "Chọn câu hỏi cùng khối, không trùng mã…").
   if(!Number.isInteger(grade))fail('Chưa xác định khối của đề cương. Hãy chọn khối lớp rồi lưu lại.');
   if(!Array.isArray(rawIds)||!rawIds.length)fail('Đề cương chưa có câu hỏi nào. Hãy bốc câu theo số lượng từng dạng (hoặc theo ma trận) hoặc chọn câu từ Ngân hàng trước khi lưu.');
   if(rawIds.some(x=>typeof x!=='string'||!x.trim()))fail('Có câu trong đề cương chưa có mã câu hỏi. Hãy nhập câu vào Ngân hàng trước (hoặc dùng "Import Đề cương" để ứng dụng tự thêm).');
   const ids=[...new Set(rawIds)]; // câu bị chọn hai lần chỉ giữ một lần
   const missing=ids.filter(key=>!bank.some(q=>q.id===key));
   if(missing.length)fail(`Có ${missing.length} câu không còn trong Ngân hàng (đã xóa hoặc nhập lại với mã mới). Hãy chọn lại câu từ Ngân hàng hoặc dùng "Import Đề cương" để ứng dụng tự thêm câu.`,400,{missing_ids:missing.slice(0,50)});
   const contentFields=['grade','type','lesson_code','level','learning_outcome','question','options','correct','option_explanations','statements','short_answer','rubric','max_score','equivalent_answer_policy','competency'];
   const questions=ids.map(key=>{const q=own(find(bank,key));if(q.grade!==grade||q.review_status==='archived')fail('Câu hỏi khác khối hoặc đã lưu trữ.');
    const incoming=payload.questions?.find(x=>x.id===key);
    if(incoming&&contentFields.some(k=>JSON.stringify(incoming[k]??null)!==JSON.stringify(q[k]??null)))fail('Nội dung câu trong đề cương khác ngân hàng. Hãy sửa và duyệt lại câu trong ngân hàng trước khi lập phiên bản đề cương mới.');
    return clone(q);});
   const codes=new Set(questions.map(q=>q.lesson_code));
   const scope=(ppct.lessons||[]).filter(l=>l.grade===grade&&(l.subject_name||'Tin học')===subject&&codes.has(l.lesson_code)).map(l=>({lesson_code:l.lesson_code,title:l.title||l.lesson_name_source||l.lesson_name||l.lesson_code,topic:l.topic||l.topic_source||l.topic_name||''}));
   const simRaw=payload.similarity_target_percent;
   const simPct=simRaw!==undefined&&simRaw!==null&&simRaw!==''&&Number.isFinite(Number(simRaw))?Math.max(0,Math.min(100,Math.round(Number(simRaw)))):(existing?.similarity_target_percent??90);
   const rawOverall=payload.overall_target_percent!==undefined?payload.overall_target_percent:existing?.overall_target_percent;
   const overallTarget=(rawOverall!==undefined&&rawOverall!==null&&rawOverall!==''&&Number.isFinite(Number(rawOverall)))?Math.max(0,Math.min(100,Math.round(Number(rawOverall)))):null;
   const rawTargets=payload.coverage_targets!==undefined?payload.coverage_targets:existing?.coverage_targets;
   let coverageTargets=null;
   if(rawTargets&&typeof rawTargets==='object'&&!Array.isArray(rawTargets)){
    const cleaned={};
    ['MC','YN','SHORT','ES'].forEach(t=>{if(rawTargets[t]!=null&&rawTargets[t]!==''&&Number.isFinite(Number(rawTargets[t])))cleaned[t]=Math.max(0,Math.min(100,Math.round(Number(rawTargets[t]))));});
    if(Object.keys(cleaned).length)coverageTargets=cleaned;
   }
   const rawCovCounts=payload.coverage_counts!==undefined?payload.coverage_counts:existing?.coverage_counts;
   let coverageCounts=null;
   if(rawCovCounts&&typeof rawCovCounts==='object'&&!Array.isArray(rawCovCounts)){
    const cleanedC={};
    ['MC','YN','SHORT','ES'].forEach(t=>{if(rawCovCounts[t]!=null&&rawCovCounts[t]!==''&&Number.isFinite(Number(rawCovCounts[t])))cleanedC[t]=Math.max(0,Math.floor(Number(rawCovCounts[t])));});
    if(Object.keys(cleanedC).length)coverageCounts=cleanedC;
   }
   const nextRev={...(existing||{}),id:existing?.id||id('REV'),title:payload.title.trim(),grade,subject_name:subject,lessons:scope,
    status:existing?.status||'drafting',similarity_target_percent:simPct,created_at:existing?.created_at||now(),updated_at:now(),question_ids:ids,questions,question_count:questions.length};
   if(overallTarget!=null)nextRev.overall_target_percent=overallTarget;else delete nextRev.overall_target_percent;
   if(coverageTargets)nextRev.coverage_targets=coverageTargets;else delete nextRev.coverage_targets;
   if(coverageCounts)nextRev.coverage_counts=coverageCounts;else delete nextRev.coverage_counts;
   return put(data.revisions,nextRev);
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
     if(r.outcome_mode==='any')r.ppct_outcome_index=null; // ô ma trận 2D: mọi YCCĐ của bài
     else if(!Number.isInteger(r.ppct_outcome_index)||r.ppct_outcome_index<0||r.ppct_outcome_index>=outLen)r.ppct_outcome_index=0;
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
     if(r.outcome_mode==='any'){(les?.outcomes||[]).forEach(o=>o&&expectedOutcomes.add(normText(o)));return;}
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
   // Cùng định nghĩa "có trong đề cương" với khung đối chiếu (core.questionKeys): trùng nội dung, kể cả đã trộn phương án.
   const mkey=engine.questionMatchKey,revKeys=new Set(revQs.map(q=>mkey?mkey(q):q.id));
   const inRev=q=>(mkey?revKeys.has(mkey(q)):(revIds.has(q.id)||(normText(q.question)&&revTexts.has(normText(q.question)))))?1:0;
   const isApp=q=>q.review_status==='approved'?1:0;
   const seedStr=String(opts.seed??'');
   const seedKey=q=>String(engine?.jsonDigest?engine.jsonDigest(seedStr+':'+q.id):q.id);
   const pct=Number.isFinite(Number(opts.percent))?Math.max(0,Math.min(100,Number(opts.percent))):90;
   const simMode=opts.similarity_mode==='exact'?'exact':'min';
   const typeTargets=opts.type_targets||opts.revision?.coverage_targets||null;
   const typeCounts=opts.type_counts||opts.revision?.coverage_counts||null;
   const overallOpt=opts.revision?.overall_target_percent??null;
   const hasTypeTargets=Boolean(typeTargets&&typeof typeTargets==='object'&&['MC','YN','SHORT','ES'].some(t=>typeTargets[t]!=null&&typeTargets[t]!==''&&Number.isFinite(Number(typeTargets[t]))));
   const countsByType={};
   ['MC','YN','SHORT','ES'].forEach(t=>{const n=flexSlots.filter(e=>String(e.slot?.kind||'').toUpperCase()===t).length;if(n)countsByType[t]=n;});
   const usableTypeCounts=(typeCounts&&typeof typeCounts==='object'&&Object.keys(countsByType).some(t=>typeCounts[t]!=null&&Number.isFinite(Number(typeCounts[t]))&&Number(typeCounts[t])<=countsByType[t]))?typeCounts:null;
   const outsideIdxSet=new Set();
   const coreLib=root.BankCore||(typeof require==='function'?require('./core.js'):null);
   if(revQs.length&&(usableTypeCounts||hasTypeTargets||overallOpt!=null)&&coreLib&&typeof coreLib.computeRevisionPlan==='function'){
    const lvRank=lv=>({'Vận dụng cao':4,'Vận dụng':3,'Hiểu':2,'Biết':1}[normLevel(lv)]||0);
    const plan=coreLib.computeRevisionPlan(countsByType,{typeCounts:usableTypeCounts,overallPercent:overallOpt!=null?overallOpt:(hasTypeTargets||usableTypeCounts?null:pct),typeTargets});
    ['MC','YN','SHORT','ES'].forEach(t=>{
     const slotsT=flexSlots.map((entry,idx)=>({entry,idx})).filter(x=>String(x.entry.slot?.kind||'').toUpperCase()===t);
     if(!slotsT.length)return;
     const wantT=plan.by_type[t]?.want??slotsT.length;
     const diffT=Math.max(0,slotsT.length-wantT);
     if(!diffT)return;
     const outCandidatesT=slotsT.map(({entry,idx})=>{
      const cands=entry.candidates||[];
      if(!cands.some(q=>!inRev(q)))return null;
      const srcCell=(entry.requirements&&entry.requirements[0])||entry.cell||{};
      return {idx,lv:lvRank(srcCell.level)};
     }).filter(Boolean).sort((a,b)=>(b.lv-a.lv)||(b.idx-a.idx));
     outCandidatesT.slice(0,diffT).forEach(x=>outsideIdxSet.add(x.idx));
    });
   }else{
    const targetInRev=revQs.length?(simMode==='min'?Math.ceil(flexSlots.length*pct/100):Math.round(flexSlots.length*pct/100)):0;
    const diffCount=revQs.length?Math.max(0,flexSlots.length-targetInRev):0;
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
  // Kho luật tri thức (Giai đoạn 2) chạy song song mã kiểm định cũ: chỉ bổ sung giải thích, chưa thay quyết định duyệt.
  function knowledgeLibs(){const g=env.knowledgeGraph||root.BankKnowledgeGraph||(typeof require==='function'?require('./knowledge-graph.js'):null);const r=env.knowledgeRules||root.BankKnowledgeRules||(typeof require==='function'?require('./knowledge-rules.js'):null);return {g,r};}
  // Kiểm định đề: kho luật QUYẾT ĐỊNH (25/11/2026). Các phép tính khó viết thành luật (mã băm bản chụp, đủ nội dung kỹ thuật,
  // khớp từng vị trí ma trận) vẫn do engine.verifyExam tính rồi đưa vào kho luật thành sự kiện. Kết quả cũ giữ ở `legacy`
  // để đối chiếu (`parity`). Kho luật không chạy được thì dùng kiểm định cũ và báo rõ.
  function verification(exam){
   // Tuần kiểm tra gửi kèm khi tạo/kiểm định lại đề: ghi vào đề chưa khóa (không thuộc bản chụp nội dung).
   const w=Number(p.scope_week);if(Number.isInteger(w)&&w>0&&w<=40&&!['locked','published'].includes(exam.status))exam.scope_week=w;
   const legacy=engine.verifyExam(data,exam);const {r}=knowledgeLibs();
   if(!r)return {...legacy,decision:'kiem_dinh_cu'};
   let k;
   try{k=r.checkExam(data,exam,{scopeWeek:exam.scope_week,procedural:legacy.errors,config:data.profile?.rule_config});}
   catch(err){return {...legacy,decision:'kiem_dinh_cu',knowledge:{error:'Chưa chạy được kho luật, dùng kiểm định cũ: '+(err&&err.message||err)}};}
   return {...legacy,passed:k.passed,valid:k.passed,errors:k.errors,warnings:[...(legacy.warnings||[]),...k.warnings],knowledge:k,decision:'kho_luat',
    legacy:{passed:legacy.passed,errors:legacy.errors},parity:legacy.passed===k.passed};
  }
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
   // Mã YCCĐ: giáo viên chọn YCCĐ theo câu chữ trong biểu mẫu; lưu kèm mã cố định của YCCĐ đó (không khớp thì bỏ mã cũ).
   const C=root.BankCore||(typeof require==='function'?require('./core.js'):null);
   const lessonOfQ=(ppct.lessons||[]).find(l=>Number(l.grade)===Number(saved.grade)&&(l.subject_name||'Tin học')===(saved.subject_name||subject)&&String(l.lesson_code).trim().toLowerCase()===String(saved.lesson_code||'').trim().toLowerCase());
   if(C&&C.resolveOutcome&&lessonOfQ){const hit=C.resolveOutcome(lessonOfQ,{text:saved.learning_outcome});if(hit)saved.learning_outcome_id=hit.id;else delete saved.learning_outcome_id;}
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
     // Bài và YCCĐ phải thuộc PPCT của khối (cùng quy tắc bản Python, giáo viên duyệt 23/11/2026); khối chưa có PPCT thì chặn,
     // tránh câu "mồ côi" không dùng được cho ma trận (phát hiện khi mô phỏng 9 môn, 24/11/2026).
     if(!lessons.length)fail(`Khối ${q.grade} chưa có Phân phối chương trình môn ${subject}. Hãy nhập PPCT của khối này trước khi nhập câu hỏi.`);
     {
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
      outcomes=firstReq.outcome_mode==='any'?(les?.outcomes||[]).filter(Boolean):(o?[o]:(firstReq.text?[firstReq.text]:[]));
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
  if(path==='/api/revisions/coverage'){
   // Chỉ đọc: đề nào đã có bao nhiêu câu trong đề cương, câu nào chưa có, tỉ lệ theo câu/điểm và phủ YCCĐ.
   const rev=own(find(data.revisions,p.revision_id));
   if(typeof engine.revisionCoverage!=='function')fail('Bộ xử lý chưa hỗ trợ đối chiếu đề cương. Vui lòng tải lại trang.',503);
   const sameSubject=e=>(e.subject_name||'Tin học')===subject;
   let exams=p.exam_id?[own(find(data.exams,p.exam_id))]:data.exams.filter(e=>sameSubject(e)&&e.revision_id===rev.id);
   if(!p.exam_id&&!exams.length)exams=data.exams.filter(e=>sameSubject(e)&&Number(e.grade)===Number(rev.grade));
   return result({revision:{id:rev.id,title:rev.title,grade:rev.grade,question_count:(rev.questions||[]).length},reports:exams.map(e=>engine.revisionCoverage(e,rev,data.bank.ppct))});
  }
  if(path==='/api/revisions/from-exam'){
   const primaryExam=own(find(data.exams,p.exam_id));
   const primaryQs=primaryExam.questions||[];
   if(!primaryQs.length)fail('Đề kiểm tra chưa có câu hỏi nào để lập đề cương.');
   const sameSubj=e=>(e.subject_name||'Tin học')===(primaryExam.subject_name||subject);
   const setPeers=(primaryExam.exam_set?.id&&p.include_set!==false)
    ?data.exams.filter(e=>sameSubj(e)&&e.exam_set?.id===primaryExam.exam_set.id&&!['locked','published'].includes(e.status)&&!e.revision_id&&(e.questions||[]).length)
    :[];
   const targetExams=[primaryExam,...setPeers.filter(e=>e.id!==primaryExam.id)];
   const pct=Math.max(0,Math.min(100,Math.round(Number(p.percent??90))));
   const mk=engine.questionMatchKey||engine.fingerprint;
   const coreLib=root.BankCore||(typeof require==='function'?require('./core.js'):null);
   const computePlan=(countsByType,opts)=>coreLib&&typeof coreLib.computeRevisionPlan==='function'?coreLib.computeRevisionPlan(countsByType,opts):null;
   const TYPES=['MC','YN','SHORT','ES'];
   const eGrade=Number(primaryExam.grade),eSubj=primaryExam.subject_name||subject;
   const normSubjCmp=s=>String(s||'Tin học').normalize('NFC').trim().toLowerCase();
   const bankGradeQs=bank.filter(q=>q&&q.review_status!=='archived'&&Number(q.grade)===eGrade&&normSubjCmp(q.subject_name)===normSubjCmp(eSubj));
   const bankByFp=new Map(),bankById=new Map();
   bankGradeQs.forEach(q=>{
    bankById.set(q.id,q);
    const k=mk(q);
    const prev=bankByFp.get(k);
    if(!prev||(prev.review_status!=='approved'&&q.review_status==='approved'))bankByFp.set(k,q);
   });
   const resolveBankOrigin=q=>bankByFp.get(mk(q))||bankById.get(q.id)||q;
   const outcomeKeyOf=(q,examCtx)=>{
    const ppctSrc=examCtx?.ppct_snapshot||data.bank.ppct;
    if(coreLib&&typeof coreLib.resolveOutcome==='function'){
     const les=(ppctSrc?.lessons||[]).find(l=>Number(l.grade)===eGrade&&normSubjCmp(l.subject_name)===normSubjCmp(eSubj)&&normLesson(l.lesson_code)===normLesson(q.lesson_code));
     const hit=coreLib.resolveOutcome(les,{id:q.learning_outcome_id,text:q.learning_outcome});
     if(hit?.id)return 'id:'+hit.id;
    }
    return normLesson(q.lesson_code)+'|'+normText(q.learning_outcome||'');
   };
   const chosenByFp=new Map();
   const addChoice=(q)=>{
    const origin=resolveBankOrigin(q);
    const k=mk(origin);
    if(!chosenByFp.has(k))chosenByFp.set(k,{origin,fp:k});
    return chosenByFp.get(k);
   };
   const coverageCounts={},coverageTargets={};
   for(const ex of targetExams){
    const exQs=ex.questions||[];
    const countsByType={};
    TYPES.forEach(t=>{const n=exQs.filter(q=>q.type===t).length;if(n)countsByType[t]=n;});
    const plan=computePlan(countsByType,{overallPercent:pct,typeTargets:countsByType.ES?{ES:100}:null});
    const wantByType={};
    TYPES.forEach(t=>{
     if(!countsByType[t])return;
     const want=plan?.by_type?.[t]?.want??Math.ceil(countsByType[t]*pct/100);
     wantByType[t]=want;
     if(ex.id===primaryExam.id){
      coverageCounts[t]=want;
      coverageTargets[t]=plan?.by_type?.[t]?.target_percent??(countsByType[t]?Math.round(100*want/countsByType[t]):pct);
     }
    });
    const pickedExFps=new Set();
    const keptOutcomes=new Set();
    for(const t of TYPES){
     const ofType=exQs.filter(q=>q.type===t);
     if(!ofType.length)continue;
     const want=wantByType[t]||0;
     // Ưu tiên chọn các câu giúp phủ đa dạng YCCĐ trước, rồi lấp đủ số lượng want
     const seenOc=new Set();
     const priority=[],rest=[];
     ofType.forEach(q=>{
      const k=mk(q);
      if(chosenByFp.has(k)){priority.push(q);return;}
      const oc=outcomeKeyOf(q,ex);
      if(!seenOc.has(oc)){seenOc.add(oc);priority.push(q);}
      else rest.push(q);
     });
     const ordered=[...priority,...rest];
     let have=0;
     for(const q of ordered){
      const k=mk(q);
      if(chosenByFp.has(k)&&!pickedExFps.has(k)){
       pickedExFps.add(k);keptOutcomes.add(outcomeKeyOf(q,ex));have++;
      }
     }
     for(const q of ordered){
      if(have>=want)break;
      const k=mk(q);
      if(pickedExFps.has(k))continue;
      addChoice(q);pickedExFps.add(k);keptOutcomes.add(outcomeKeyOf(q,ex));have++;
     }
    }
    // Bảo đảm phủ 100% YCCĐ: nếu có câu ngoài đề cương mang YCCĐ chưa có trong đề cương,
    // ưu tiên lấy 1 câu cùng YCCĐ khác trong ngân hàng; nếu không có thì giữ chính câu đó.
    const examFpSet=new Set(exQs.map(q=>mk(q)));
    for(const q of exQs){
     const oc=outcomeKeyOf(q,ex);
     if(keptOutcomes.has(oc))continue;
     const alt=bankGradeQs.find(bq=>!examFpSet.has(mk(bq))&&!chosenByFp.has(mk(bq))&&outcomeKeyOf(bq,ex)===oc)
      ||bankGradeQs.find(bq=>!chosenByFp.has(mk(bq))&&outcomeKeyOf(bq,ex)===oc);
     if(alt){addChoice(alt);keptOutcomes.add(oc);}
     else{addChoice(q);keptOutcomes.add(oc);}
    }
   }
   const chosenList=[...chosenByFp.values()].map(x=>x.origin);
   const revTitle=String(p.title||'').trim()||`Đề cương ôn tập · ${primaryExam.title||`Khối ${eGrade}`}`;
   const allInBank=chosenList.every(q=>bankById.has(q.id));
   let revision;
   if(allInBank){
    revision=saveRevision({
     title:revTitle,
     grade:eGrade,
     exam_type:primaryExam.exam_type||'GK1',
     question_ids:chosenList.map(q=>q.id),
     similarity_target_percent:pct,
     overall_target_percent:pct,
     coverage_counts:coverageCounts,
     coverage_targets:coverageTargets
    });
    revision.source_exam_id=primaryExam.id;
    put(data.revisions,revision);
   }else{
    const revQs=chosenList.map(q=>({...clone(q),content_hash:engine.contentHash(q),source_snapshot_hash:engine.fingerprint(q)}));
    const codes=new Set(revQs.map(q=>q.lesson_code));
    const scope=(ppct.lessons||[]).filter(l=>Number(l.grade)===eGrade&&(l.subject_name||'Tin học')===eSubj&&codes.has(l.lesson_code)).map(l=>({lesson_code:l.lesson_code,title:l.title||l.lesson_name_source||l.lesson_name||l.lesson_code,topic:l.topic||l.topic_source||l.topic_name||''}));
    revision=put(data.revisions,{
     id:id('REV'),
     title:revTitle,
     grade:eGrade,
     subject_name:eSubj,
     exam_type:primaryExam.exam_type||'GK1',
     lessons:scope,
     status:'drafting',
     source_exam_id:primaryExam.id,
     similarity_target_percent:pct,
     overall_target_percent:pct,
     coverage_counts:clone(coverageCounts),
     coverage_targets:clone(coverageTargets),
     created_at:now(),
     updated_at:now(),
     question_ids:revQs.map(q=>q.id),
     questions:revQs,
     question_count:revQs.length
    });
   }
   const revFpSet=new Set((revision.questions||[]).map(rq=>mk(rq)));
   for(const ex of targetExams){
    ex.revision_id=revision.id;
    ex.revision_snapshot=clone(revision);
    ex.similarity_target_percent=Math.max(90,pct);
    ex.overall_target_percent=pct;
    ex.coverage_counts=clone(coverageCounts);
    ex.coverage_targets=clone(coverageTargets);
    ex.updated_at=now();
    (ex.questions||[]).forEach(q=>{q.in_revision=revFpSet.has(mk(q));});
    if(globalThis.crypto&&globalThis.crypto.subtle){await refreshIntegrity(ex);}
    else if(typeof engine.jsonDigest==='function'){
     ex.snapshot_integrity=engine.jsonDigest({questions:ex.questions,matrix:ex.matrix_snapshot||null,blueprint:ex.blueprint,revision:ex.revision_snapshot,ppct:ex.ppct_snapshot});
    }
    ex.verification=verification(ex);
    if(ex.verification?.revision_criterion){
     ex.revision_check=ex.verification.revision_criterion;
     ex.revision_match_count=ex.verification.revision_criterion.exact_count;
     ex.revision_required_count=ex.verification.revision_criterion.required;
    }
    put(data.exams,ex);
   }
   return result({revision,exam:primaryExam,exams:data.exams,revisions:data.revisions,linked_count:targetExams.length},true);
  }
  if(path==='/api/revisions/trim-to-exam'||path==='/api/revisions/align-to-exam'){
   // Cân chỉnh đề cương theo tỉ lệ câu của một đề hoặc toàn bộ các đề liên kết với đề cương, riêng từng dạng (VD: TN 85%, TL 100%).
   // Thiếu thì THÊM câu của đề (lấy câu gốc trong Ngân hàng, kể cả bản đã trộn phương án); dư thì BỚT câu của đề,
   // ưu tiên câu mà YCCĐ vẫn còn câu khác trong đề cương, và không làm tụt đề liên kết khác xuống dưới tỉ lệ mục tiêu.
   const rev=own(find(data.revisions,p.revision_id));
   if(typeof engine.questionMatchKey!=='function')fail('Bộ xử lý chưa hỗ trợ đối chiếu đề cương. Vui lòng tải lại trang.',503);
   const fp=engine.questionMatchKey,TYPES=['MC','YN','SHORT','ES'],NAME={MC:'trắc nghiệm',YN:'Đúng/Sai',SHORT:'trả lời ngắn',ES:'tự luận'};
   const clampPct=v=>Math.max(0,Math.min(100,Math.round(Number(v))));
   const base=p.percent!=null&&Number.isFinite(Number(p.percent))?clampPct(p.percent):90;
   const targets={};TYPES.forEach(t=>{const v=p.targets&&p.targets[t];targets[t]=v!=null&&v!==''&&Number.isFinite(Number(v))?clampPct(v):base;});
   const revQs=rev.questions||[];
   const okey=q=>q.lesson_code+'|'+q.learning_outcome,count=new Map();revQs.forEach(q=>count.set(okey(q),(count.get(okey(q))||0)+1));
   const lv={'Vận dụng cao':4,'Vận dụng':3,'Hiểu':2,'Biết':1},kd={ES:4,SHORT:3,YN:2,MC:1};
   const bankByFp=new Map();bank.forEach(q=>{if(q.review_status!=='archived'&&Number(q.grade)===Number(rev.grade)){const k=fp(q);if(!bankByFp.has(k))bankByFp.set(k,q);}});
   const removed=[],added=[],missingInBank=[],byType={},warnings=[];

   const coreLib=root.BankCore||(typeof require==='function'?require('./core.js'):null);
   const computePlan=(countsByType,opts)=>{
    if(coreLib&&typeof coreLib.computeRevisionPlan==='function')return coreLib.computeRevisionPlan(countsByType,opts);
    return null;
   };
   const reqRevCount=(n,pct)=>coreLib&&typeof coreLib.requiredRevisionCount==='function'
    ?coreLib.requiredRevisionCount(n,pct)
    :(n<=0||pct<=0?0:(pct>=100?n:Math.min(n,Math.ceil(n*pct/100-1e-9))));
   const rawOverall=p.overall_percent!==undefined&&p.overall_percent!==null&&p.overall_percent!==''&&Number.isFinite(Number(p.overall_percent))?clampPct(p.overall_percent):null;
   const rawTypeCounts=(p.type_counts&&typeof p.type_counts==='object'&&!Array.isArray(p.type_counts))?p.type_counts:null;
   const hasRawCounts=Boolean(rawTypeCounts&&TYPES.some(t=>rawTypeCounts[t]!=null&&rawTypeCounts[t]!==''&&Number.isFinite(Number(rawTypeCounts[t]))));

   if(p.apply_to_linked===true){
    const sameSubj=e=>(e.subject_name||'Tin học')===subject;
    const linkedExams=data.exams.filter(e=>sameSubj(e)&&e.revision_id===rev.id&&(e.questions||[]).length);
    const primaryExam=p.exam_id?own(find(data.exams,p.exam_id)):(linkedExams[0]||fail('Chưa có đề thi nào để đối chiếu.'));
    const targetExams=linkedExams.length?(linkedExams.some(e=>e.id===primaryExam.id)?linkedExams:[primaryExam,...linkedExams]):[primaryExam];
    const primaryEqs=primaryExam.questions||[],total=primaryEqs.length;if(!total)fail('Đề chưa có câu hỏi.');
    const primaryCounts={};
    TYPES.forEach(t=>{const n=primaryEqs.filter(q=>q.type===t).length;if(n)primaryCounts[t]=n;});
    const curMap=new Map(revQs.map(q=>[fp(q),q]));
    const planByExam=new Map();
    targetExams.forEach(ex=>{
     const countsByType={};
     TYPES.forEach(t=>{const n=(ex.questions||[]).filter(q=>q.type===t).length;if(n)countsByType[t]=n;});
     let exTypeCounts=null;
     if(hasRawCounts){
      exTypeCounts={};
      TYPES.forEach(t=>{
       const nEx=countsByType[t]||0;
       if(!nEx||rawTypeCounts[t]==null||rawTypeCounts[t]===''||!Number.isFinite(Number(rawTypeCounts[t])))return;
       const cRaw=Math.max(0,Math.floor(Number(rawTypeCounts[t])));
       const nPrim=primaryCounts[t]||0;
       exTypeCounts[t]=nPrim===nEx?Math.min(nEx,cRaw):(nPrim>0?Math.min(nEx,Math.round(nEx*cRaw/nPrim)):Math.min(nEx,cRaw));
      });
     }
     const plan=computePlan(countsByType,{typeCounts:exTypeCounts,overallPercent:exTypeCounts?null:rawOverall,typeTargets:p.targets||(rawOverall==null?targets:null)});
     planByExam.set(ex.id,plan);
    });
    const primaryPlan=planByExam.get(primaryExam.id);
    const savedTargets={};
    const savedCounts={};
    TYPES.forEach(t=>{
     if(primaryPlan?.by_type?.[t]){
      savedTargets[t]=primaryPlan.by_type[t].target_percent;
      if(hasRawCounts)savedCounts[t]=primaryPlan.by_type[t].want;
     }else if(p.targets&&p.targets[t]!=null&&targetExams.some(ex=>(ex.questions||[]).some(q=>q.type===t)))savedTargets[t]=targets[t];
    });
    let sharedTrimBlocked=false;
    const solveLinkedType=(t,exList)=>{
     const m=exList.length;
     const fixedOut=new Array(m).fill(0);
     const selectableByKey=new Map();
     exList.forEach((it,ei)=>{
      const seenInEx=new Set();
      for(const q of it.eT){
       const k=fp(q);
       if(seenInEx.has(k))continue;
       seenInEx.add(k);
       const inCur=curMap.has(k);
       const src=inCur?curMap.get(k):(bankByFp.get(k)||bank.find(b=>b.id===q.id&&b.review_status!=='archived'&&Number(b.grade)===Number(rev.grade)));
       if(!src){
        fixedOut[ei]++;
        if(!missingInBank.some(mQ=>fp(mQ)===k))missingInBank.push(q);
        continue;
       }
       if(!selectableByKey.has(k))selectableByKey.set(k,{k,src,inCur,exams:[]});
       selectableByKey.get(k).exams.push(ei);
      }
     });
     const outNeed=exList.map((it,i)=>{
      const selectableCount=selectableByKey.size?exList[i].eT.length-fixedOut[i]:0;
      return Math.max(0,selectableCount-it.want);
     });
     const bucketMap=new Map();
     for(const item of selectableByKey.values()){
      const bKey=item.exams.join(',');
      if(!bucketMap.has(bKey))bucketMap.set(bKey,{exams:item.exams,items:[]});
      bucketMap.get(bKey).items.push(item);
     }
     const buckets=[...bucketMap.values()].sort((a,b)=>(b.exams.length-a.exams.length)||(b.items.length-a.items.length));
     const B=buckets.length;
     const curOut=buckets.map(b=>b.items.filter(it=>!it.inCur).length);
     const remCap=Array.from({length:B+1},()=>new Array(m).fill(0));
     for(let b=B-1;b>=0;b--){
      for(let i=0;i<m;i++)remCap[b][i]=remCap[b+1][i];
      for(const ei of buckets[b].exams)remCap[b][ei]+=buckets[b].items.length;
     }
     let bestX=null,bestCost=Infinity,steps=0;
     const curX=new Array(B).fill(0),need=[...outNeed];
     function dfs(b,cost){
      if(cost>=bestCost||++steps>40000)return;
      if(b===B){
       if(need.every(v=>v===0)){bestCost=cost;bestX=curX.slice();}
       return;
      }
      const bkt=buckets[b],N=bkt.items.length,inB=new Set(bkt.exams);
      for(let i=0;i<m;i++){if(!inB.has(i)&&need[i]>remCap[b+1][i])return;}
      let minX=0,maxX=N;
      for(const ei of bkt.exams){
       maxX=Math.min(maxX,need[ei]);
       minX=Math.max(minX,need[ei]-remCap[b+1][ei]);
      }
      if(minX>maxX)return;
      const cands=[];
      for(let x=minX;x<=maxX;x++)cands.push(x);
      cands.sort((a,b2)=>Math.abs(a-curOut[b])-Math.abs(b2-curOut[b])||a-b2);
      for(const x of cands){
       if(cost+Math.abs(x-curOut[b])>=bestCost)continue;
       curX[b]=x;
       for(const ei of bkt.exams)need[ei]-=x;
       dfs(b+1,cost+Math.abs(x-curOut[b]));
       for(const ei of bkt.exams)need[ei]+=x;
       if(bestCost===0)return;
      }
     }
     dfs(0,0);
     if(!bestX)return false;
     for(let b=0;b<B;b++){
      const x=bestX[b],items=buckets[b].items;
      const outNow=items.filter(it=>!it.inCur);
      const inNow=items.filter(it=>it.inCur);
      if(x<outNow.length){
       const addNeeded=outNow.length-x;
       outNow.sort((a,b2)=>(count.get(okey(a.src))||0)-(count.get(okey(b2.src))||0)||(lv[a.src.level]||0)-(lv[b2.src.level]||0)||String(a.src.id).localeCompare(String(b2.src.id)));
       for(const it of outNow.slice(0,addNeeded)){
        curMap.set(it.k,it.src);added.push(it.src);count.set(okey(it.src),(count.get(okey(it.src))||0)+1);
       }
      }else if(x>outNow.length){
       let dropCount=x-outNow.length;
       const pool=inNow.slice();
       while(dropCount>0&&pool.length){
        pool.sort((a,b2)=>Number((count.get(okey(b2.src))||0)>1)-Number((count.get(okey(a.src))||0)>1)||(lv[b2.src.level]||0)-(lv[a.src.level]||0)||(kd[b2.src.type]||0)-(kd[a.src.type]||0)||String(a.src.id).localeCompare(String(b2.src.id)));
        const it=pool.shift();
        curMap.delete(it.k);removed.push(it.src);count.set(okey(it.src),(count.get(okey(it.src))||0)-1);
        dropCount--;
       }
      }
     }
     return true;
    };

    for(const t of TYPES){
     const exList=targetExams.map(ex=>{
      const eT=(ex.questions||[]).filter(q=>q.type===t);
      const plan=planByExam.get(ex.id);
      const want=plan?.by_type?.[t]?.want??Math.ceil(eT.length*targets[t]/100);
      return {ex,eT,want};
     }).filter(x=>x.eT.length>0);
     if(!exList.length)continue;
     const inCount=it=>it.eT.filter(q=>curMap.has(fp(q))).length;
     const solvedExact=solveLinkedType(t,exList);
     if(!solvedExact){
      while(exList.some(it=>inCount(it)<it.want)){
       const candMap=new Map();
       for(const it of exList){
        if(inCount(it)>=it.want)continue;
        for(const q of it.eT){
         const k=fp(q);if(curMap.has(k)||candMap.has(k))continue;
         const src=bankByFp.get(k)||bank.find(b=>b.id===q.id&&b.review_status!=='archived'&&Number(b.grade)===Number(rev.grade));
         if(!src){if(!missingInBank.some(m=>fp(m)===k))missingInBank.push(q);continue;}
         let deficitHits=0,overOrExactHits=0;
         exList.forEach(other=>{if(other.eT.some(x=>fp(x)===k)){if(inCount(other)<other.want)deficitHits++;else overOrExactHits++;}});
         candMap.set(k,{src,score:100*deficitHits-25*overOrExactHits});
        }
       }
       if(!candMap.size)break;
       const best=[...candMap.values()].sort((a,b)=>(b.score-a.score)||String(a.src.id).localeCompare(String(b.src.id)))[0];
       curMap.set(fp(best.src),best.src);
       added.push(best.src);
       count.set(okey(best.src),(count.get(okey(best.src))||0)+1);
      }
      while(exList.some(it=>inCount(it)>it.want)){
       const curTypeQs=[...curMap.values()].filter(q=>q.type===t);
       const removable=curTypeQs.filter(q=>{
        const k=fp(q);
        const inOver=exList.some(it=>inCount(it)>it.want&&it.eT.some(x=>fp(x)===k));
        if(!inOver)return false;
        return exList.every(it=>!it.eT.some(x=>fp(x)===k)||inCount(it)>it.want);
       });
       if(!removable.length){sharedTrimBlocked=true;break;}
       const overHitsOf=q=>{const k=fp(q);return exList.filter(it=>inCount(it)>it.want&&it.eT.some(x=>fp(x)===k)).length;};
       removable.sort((a,b)=>Number((count.get(okey(b))||0)>1)-Number((count.get(okey(a))||0)>1)||(overHitsOf(b)-overHitsOf(a))||(lv[b.level]||0)-(lv[a.level]||0)||(kd[b.type]||0)-(kd[a.type]||0)||String(a.id).localeCompare(String(b.id)));
       const drop=removable[0];
       curMap.delete(fp(drop));
       removed.push(drop);
       count.set(okey(drop),(count.get(okey(drop))||0)-1);
      }
     }
     const primItem=exList.find(it=>it.ex.id===primaryExam.id);
     if(primItem){
      const before=primItem.eT.filter(q=>revQs.some(rq=>fp(rq)===fp(q))).length;
      const afterT=inCount(primItem);
      byType[t]={total:primItem.eT.length,target:savedTargets[t]??targets[t],wanted:primItem.want,before,after:afterT};
     }
    }
    const removedIds=new Set(removed.map(q=>q.id)),ids=[...revQs.filter(q=>!removedIds.has(q.id)).map(q=>q.id),...added.map(q=>q.id)];
    let locked=false;try{checkRevision(rev);}catch(e){locked=true;}
    const after=Object.values(byType).reduce((n,x)=>n+x.after,0),overall=Math.round(1000*after/total)/10;
    const savedSimPct=rawOverall!=null?rawOverall:(rev.similarity_target_percent??90);
    const label=hasRawCounts?Object.entries(savedCounts).map(([t,v])=>`${NAME[t]||t} ${v}/${primaryCounts[t]||v}`).join(', '):(Object.keys(savedTargets).length?Object.entries(savedTargets).map(([t,v])=>`${NAME[t]||t} ${v}%`).join(', '):`${savedSimPct}% đề`);
    const revPayload={
     title:(locked&&(removed.length||added.length))?(rev.title+` (${label})`):rev.title,
     grade:rev.grade,
     question_ids:ids,
     similarity_target_percent:savedSimPct,
     overall_target_percent:hasRawCounts?null:rawOverall,
     coverage_counts:Object.keys(savedCounts).length?savedCounts:null,
     ...(Object.keys(savedTargets).length?{coverage_targets:savedTargets}:{})
    };
    const nextLockedRev={...rev,similarity_target_percent:savedSimPct,...(Object.keys(savedTargets).length?{coverage_targets:savedTargets}:{}),updated_at:now()};
    if(!hasRawCounts&&rawOverall!=null)nextLockedRev.overall_target_percent=rawOverall;else delete nextLockedRev.overall_target_percent;
    if(Object.keys(savedCounts).length)nextLockedRev.coverage_counts=savedCounts;else delete nextLockedRev.coverage_counts;
    const revision=(locked&&(removed.length||added.length))
     ?saveRevision(revPayload)
     :(locked?put(data.revisions,nextLockedRev):saveRevision(revPayload,rev));
    if(Object.keys(savedTargets).length||Object.keys(savedCounts).length||rawOverall!=null){
     targetExams.forEach(ex=>{
      if(Object.keys(savedTargets).length)ex.coverage_targets=clone(savedTargets);
      if(!hasRawCounts&&rawOverall!=null)ex.overall_target_percent=rawOverall;else delete ex.overall_target_percent;
      if(Object.keys(savedCounts).length)ex.coverage_counts=clone(savedCounts);else delete ex.coverage_counts;
      ex.similarity_target_percent=savedSimPct;
      if(revision.id&&ex.revision_id===rev.id&&revision.id!==rev.id)ex.revision_id=revision.id;
     });
    }
    const examReports=targetExams.map(ex=>engine.revisionCoverage(ex,revision,data.bank.ppct));
    const brief=q=>({id:q.id,type:q.type,lesson_code:q.lesson_code,level:q.level,question:String(q.question||'').replace(/\s+/g,' ').slice(0,120)});
    const underFloor=after<reqRevCount(total,90);
    if(underFloor)warnings.push(`Tỉ lệ chung còn ${String(overall).replace('.',',')}% (${after}/${total} câu), dưới mức quy định tối thiểu 90% (${reqRevCount(total,90)}/${total} câu) khi duyệt đề chính thức.`);
    if(sharedTrimBlocked)warnings.push('Một số câu dùng chung giữa các đề liên kết được giữ lại để không làm đề khác bị thiếu.');
    if(missingInBank.length)warnings.push(`${missingInBank.length} câu của đề không còn trong Ngân hàng nên không thêm được vào đề cương.`);
    return result({revision,revisions:data.revisions,exams:data.exams,new_version:Boolean(locked&&(removed.length||added.length)),total,kept:after,overall_percent:overall,overall_target_percent:hasRawCounts?null:rawOverall,by_type:byType,
     coverage_counts:Object.keys(savedCounts).length?savedCounts:null,coverage_targets:Object.keys(savedTargets).length?savedTargets:null,linked_count:targetExams.length,exam_reports:examReports,
     added:added.map(brief),removed:removed.map(q=>({...brief(q),outcome_still_covered:(count.get(okey(q))||0)>0})),warnings},true);
   }

   const exam=own(find(data.exams,p.exam_id));
   const eqs=exam.questions||[],total=eqs.length;if(!total)fail('Đề chưa có câu hỏi.');
   const revFps=new Map(revQs.map(q=>[fp(q),q]));
   const singleCounts={};
   TYPES.forEach(t=>{const n=eqs.filter(q=>q.type===t).length;if(n)singleCounts[t]=n;});
   const sharedWant={};
   const singlePlan=(hasRawCounts||rawOverall!=null||p.targets)?computePlan(singleCounts,{typeCounts:hasRawCounts?rawTypeCounts:null,overallPercent:hasRawCounts?null:rawOverall,typeTargets:p.targets||null}):null;
   if(singlePlan){
    TYPES.forEach(t=>{if(singlePlan?.by_type?.[t])sharedWant[t]=singlePlan.by_type[t].want;});
   }else{
    const present=TYPES.filter(t=>eqs.some(q=>q.type===t)),need=Math.ceil(total*base/100);
    const exact=present.map(t=>eqs.filter(q=>q.type===t).length*base/100),fl=exact.map(Math.floor);
    let extra=need-fl.reduce((a,b)=>a+b,0);
    present.map((t,i)=>({i,f:exact[i]-fl[i]})).sort((a,b)=>b.f-a.f||a.i-b.i).forEach(x=>{if(extra>0){fl[x.i]++;extra--;}});
    present.forEach((t,i)=>{sharedWant[t]=fl[i];});
   }
   for(const t of TYPES){
    const eT=eqs.filter(q=>q.type===t);if(!eT.length)continue;
    const want=sharedWant[t]??Math.ceil(eT.length*targets[t]/100);
    const inside=eT.filter(q=>revFps.has(fp(q))).map(q=>revFps.get(fp(q)));
    const outside=eT.filter(q=>!revFps.has(fp(q)));
    if(inside.length>want){
     let pool=inside.slice();
     for(let k=inside.length-want;k>0;k--){
      pool.sort((a,b)=>Number((count.get(okey(b))||0)>1)-Number((count.get(okey(a))||0)>1)||(lv[b.level]||0)-(lv[a.level]||0)||(kd[b.type]||0)-(kd[a.type]||0)||String(a.id).localeCompare(String(b.id)));
      const q=pool.shift();removed.push(q);count.set(okey(q),(count.get(okey(q))||0)-1);
     }
    }else if(inside.length<want){
     for(const q of outside){
      if(added.filter(x=>x.type===t).length>=want-inside.length)break;
      const src=bankByFp.get(fp(q))||bank.find(b=>b.id===q.id&&b.review_status!=='archived'&&Number(b.grade)===Number(rev.grade));
      if(!src){missingInBank.push(q);continue;}
      if(!added.some(x=>x.id===src.id)&&!revQs.some(x=>x.id===src.id))added.push(src);
     }
    }
    const now=inside.length-removed.filter(q=>q.type===t).length+added.filter(q=>q.type===t).length;
    byType[t]={total:eT.length,target:singlePlan?.by_type?.[t]?.target_percent??targets[t],wanted:want,before:inside.length,after:now};
   }
   if(!removed.length&&!added.length)fail(missingInBank.length?`Không thêm được: ${missingInBank.length} câu của đề không còn trong Ngân hàng (đã xóa hoặc lưu trữ).`:'Đề cương đã đúng tỉ lệ đặt ra; không cần thay đổi.');
   const gone=new Set(removed.map(q=>q.id)),ids=[...revQs.filter(q=>!gone.has(q.id)).map(q=>q.id),...added.map(q=>q.id)];
   let locked=false;try{checkRevision(rev);}catch(e){locked=true;}
   const after=Object.values(byType).reduce((n,x)=>n+x.after,0),overall=Math.round(1000*after/total)/10;
   const label=p.targets?Object.entries(byType).map(([t,x])=>`${NAME[t]} ${x.target}%`).join(', '):`${base}% đề`;
   const savedTargets=p.targets?Object.fromEntries(Object.entries(byType).map(([t,x])=>[t,x.target])):undefined;
   const savedSingleCounts=hasRawCounts?Object.fromEntries(Object.entries(byType).map(([t,x])=>[t,x.wanted])):null;
   const revision=locked
    ?saveRevision({title:rev.title+` (${label})`,grade:rev.grade,question_ids:ids,similarity_target_percent:rev.similarity_target_percent,overall_target_percent:hasRawCounts?null:rawOverall,coverage_counts:savedSingleCounts,...(savedTargets?{coverage_targets:savedTargets}:{})})
    :saveRevision({title:rev.title,grade:rev.grade,question_ids:ids,similarity_target_percent:rev.similarity_target_percent,overall_target_percent:hasRawCounts?null:rawOverall,coverage_counts:savedSingleCounts,...(savedTargets?{coverage_targets:savedTargets}:{})},rev);
   const brief=q=>({id:q.id,type:q.type,lesson_code:q.lesson_code,level:q.level,question:String(q.question||'').replace(/\s+/g,' ').slice(0,120)});
   const singleUnderFloor=after<reqRevCount(total,90);
   if(singleUnderFloor)warnings.push(`Tỉ lệ chung còn ${String(overall).replace('.',',')}% câu của đề có trong đề cương, dưới mức 90% theo quy định của tổ (AGENTS.md, rules/01).`);
   if(missingInBank.length)warnings.push(`${missingInBank.length} câu của đề không còn trong Ngân hàng nên không thêm được vào đề cương.`);
   return result({revision,revisions:data.revisions,new_version:locked,total,kept:after,overall_percent:overall,by_type:byType,
    added:added.map(brief),removed:removed.map(q=>({...brief(q),outcome_still_covered:(count.get(okey(q))||0)>0})),warnings},true);
  }
  if(path==='/api/revisions/import'){
   // Nhập đề cương từ tệp (Markdown/JSON đã đọc ở trình duyệt): thêm câu mới vào Ngân hàng (Nháp), dùng lại câu đã có
   // (cùng khối, cùng nội dung), rồi lập đề cương từ đúng các câu trong Ngân hàng. Một lần ghi; lỗi thì không ghi gì.
   const grade=Number(p.grade);
   if(!Number.isInteger(grade))fail('Chưa xác định khối của đề cương. Hãy chọn khối lớp trước khi nhập tệp.');
   const incoming=(Array.isArray(p.questions)?p.questions:[]).filter(q=>q&&typeof q==='object'&&String(q.question||'').trim());
   if(!incoming.length)fail('Tệp không có câu hỏi hợp lệ. Hãy tải tệp mẫu Đề cương (JSON hoặc Markdown) để xem định dạng.');
   const keyOf=q=>Number(q.grade??grade)+'|'+String(q.question||'').normalize('NFC').toLowerCase().trim().replace(/\s+/gu,' ');
   let work=data,added=0;
   const fresh=incoming.map(q=>{const c={...clone(q),grade:Number(q.grade??grade)};delete c.id;delete c.review_status;return c;});
   try{const r=await handle('/api/bank/import',{mode:'append',questions:fresh,grade},work,env);work=r.data;added=r.response?.import_report?.added||0;}
   catch(err){if(!/^Không có câu mới/.test(String(err.message)))throw err;}
   const byKey=new Map(work.bank.questions.filter(q=>q.review_status!=='archived').map(q=>[keyOf(q),q.id]));
   const ids=[...new Set(incoming.map(q=>byKey.get(keyOf(q))).filter(Boolean))];
   if(!ids.length)fail('Chưa đưa được câu nào của tệp vào Ngân hàng.');
   const saved=await handle('/api/revisions/save',{title:String(p.title||'').trim()||`Đề cương ôn tập Khối ${grade}`,grade,question_ids:ids,similarity_target_percent:p.similarity_target_percent},work,env);
   return {response:{...saved.response,import_report:{file_questions:incoming.length,added,reused:ids.length-added}},data:saved.data,changed:true};
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
    const ppctOutcome=(req&&req.outcome_mode!=='any'&&ppctLes&&Array.isArray(ppctLes.outcomes)&&req.ppct_outcome_index!=null)?ppctLes.outcomes[req.ppct_outcome_index]:'';
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
    ...(rev?.overall_target_percent!=null?{overall_target_percent:Number(rev.overall_target_percent)}:{}),
    ...(rev?.coverage_counts?{coverage_counts:clone(rev.coverage_counts)}:{}),
    ...(rev?.coverage_targets?{coverage_targets:clone(rev.coverage_targets)}:{}),
    similarity_target_percent:Number(genPayload.similarity_percent??rev?.overall_target_percent??90),
    similarity_mode:genPayload.similarity_mode||'exact',
    scoring_policy:clone(targetMatrix?.scoring_policy||{yn_table:{'0':'0','1':'0.1','2':'0.25','3':'0.5','4':'1'},rounding:mType==='TX'?'half_up_integer':'half_up_1dp',blank_counts_as:'wrong'}),
    allowed_kinds:clone(targetMatrix?.allowed_kinds||[...new Set(selectedQuestions.map(q=>q.type))]),
    validation_note:note
   };
   // Bản chụp từng câu và cả đề (trước đây đề linh hoạt thiếu nên kiểm định luôn báo "bản chụp sai").
   if(typeof engine.fingerprint==='function'){
    const mk=engine.questionMatchKey||engine.fingerprint,revFps=new Set((rev?.questions||[]).map(rq=>mk(rq)));
    exam.questions.forEach(q=>{q.content_hash=engine.contentHash(q);q.source_content_hash=q.content_hash;q.source_snapshot_hash=engine.fingerprint(q);q.in_revision=Boolean(rev)&&revFps.has(mk(q));});
    exam.snapshot_integrity=engine.jsonDigest({questions:exam.questions,matrix:exam.matrix_snapshot||null,blueprint:exam.blueprint,revision:exam.revision_snapshot,ppct:exam.ppct_snapshot});
   }
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
    const pickedQuestions=assignFlexibleSlots(flexSlots,{revision:rev,seed:genPayload.seed,percent:genPayload.similarity_percent??rev?.similarity_target_percent??90,type_targets:genPayload.type_targets||rev?.coverage_targets||null,similarity_mode:genPayload.similarity_mode||'exact'});
    const dup=findRecentDuplicateExam(data.exams,genPayload,targetMatrix,pickedQuestions.map(q=>q.id));
    if(dup)return result({exam:dup,exams:data.exams},false);
    const exam=assembleFlexibleExam({targetMatrix,blueprint:p.blueprint,flexSlots,pickedQuestions,genPayload,rev});
    put(data.exams,exam);return result({exam,exams:data.exams},true);
   }
   // "Bám sát" (mặc định): đúng tỉ lệ đề cương, phần còn lại lấy ngoài đề cương. Ngân hàng không đủ câu ngoài đề cương thì tạo theo "tối thiểu" và báo rõ.
   let exam,simWarn=[];
   try{exam=clone(engine.generateExam(data,{...genPayload,similarity_mode:genPayload.similarity_mode||'exact'}));}
   catch(err){if((genPayload.similarity_mode||'exact')!=='exact'||!genPayload.revision_id)throw err;exam=clone(engine.generateExam(data,{...genPayload,similarity_mode:'min'}));simWarn=['Ngân hàng không đủ câu ngoài đề cương để bám sát tỉ lệ; đề được tạo với tỉ lệ đề cương tối thiểu (có thể cao hơn).'];}
   exam.created_at=now();exam.verification=verification(exam);put(data.exams,exam);return result({exam,exams:data.exams,warnings:simWarn},true);
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
     const pickedQuestions=assignFlexibleSlots(flexSlots,{revision,seed:examSeed,percent:genPayload.similarity_percent??revision?.similarity_target_percent??90,type_targets:genPayload.type_targets||revision?.coverage_targets||null,similarity_mode:genPayload.similarity_mode||'exact'});
     const exam=assembleFlexibleExam({targetMatrix,blueprint:p.blueprint,flexSlots,pickedQuestions,genPayload:{...genPayload,title:genPayload.title.trim()+` — Đề ${n+1}`,exam_code:String(101+n),seed:examSeed},rev:revision});
     exam.exam_set={id:setId,index:n+1,count};
     exams.push(exam);
    }
    stampExamSet(exams,{id:setId,title:genPayload.title.trim(),revision_id:revision?.id||null});
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
    const exam=clone(engine.generateExam(data,{...p,title:p.title+` — Đề ${n+1}`,subject_name:subject,revision_id:revision.id,exam_code:String(101+n),seed:String(p.seed||'')+':'+n}));
    exam.exam_set={id:setId,index:n+1,count};exams.push(exam);
   }
   stampExamSet(exams,{id:setId,title:String(p.title||'').trim(),revision_id:revision.id});
   for(const exam of exams)put(data.exams,exam);
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
  if(path==='/api/knowledge/parity'){
   // Đối chiếu kho luật với kiểm định cũ trên mọi đề (chỉ đọc): đề nào hai bên kết luận khác nhau, lỗi nào chỉ một bên thấy.
   const g=p.grade===undefined||p.grade===null||p.grade===''?null:Number(p.grade);
   const rows=data.exams.filter(e=>(e.subject_name||'Tin học')===subject&&(g===null||Number(e.grade)===g)).map(e=>{
    const v=verification(clone(e)),codes=x=>[...new Set((x||[]).map(er=>er.code))];
    const lc=codes(v.legacy?.errors||v.errors),rc=v.decision==='kho_luat'?codes(v.errors):lc;
    return {id:e.id,title:e.title||e.id,exam_code:e.exam_code||'',status:e.status||'drafting',decision:v.decision,legacy_passed:v.legacy?v.legacy.passed:v.passed,rules_passed:v.passed,
     same:(v.legacy?v.legacy.passed:v.passed)===v.passed,only_legacy:lc.filter(c=>!rc.includes(c)),only_rules:rc.filter(c=>!lc.includes(c))};
   });
   return result({rows,total:rows.length,mismatched:rows.filter(r=>!r.same).length});
  }
  if(path==='/api/knowledge/normalize-outcomes'){
   // Chuẩn hóa mã YCCĐ (một lần cho dữ liệu cũ). apply=false: chỉ xem trước, không ghi.
   const C=root.BankCore||(typeof require==='function'?require('./core.js'):null);
   if(!C||!C.normalizeOutcomeIds)fail('Bộ xử lý chưa hỗ trợ mã YCCĐ. Vui lòng tải lại trang.',503);
   const g=p.grade===undefined||p.grade===null||p.grade===''?null:Number(p.grade);
   const report=C.normalizeOutcomeIds(data,{grade:g,subject,mappings:p.mappings||{},apply:p.apply===true});
   return result({report,bank:p.apply===true?data.bank:undefined,matrices:p.apply===true?data.matrices:undefined},p.apply===true&&report.changed);
  }
  if(path==='/api/knowledge/overview'||path==='/api/knowledge/lesson-context'||path==='/api/knowledge/rules'||path==='/api/knowledge/check-exam'){
   const {g:KG,r:KR}=knowledgeLibs();if(!KG||!KR)fail('Chưa nạp mô-đun đồ thị tri thức. Vui lòng tải lại trang.',503);
   if(path==='/api/knowledge/rules')return result({rules:KR.describeRules()});
   if(path==='/api/knowledge/check-exam'){
    const exam=own(find(data.exams,p.id)),w=Number(p.scope_week);
    const examGraph=typeof KG.buildGraphForExam==='function'?KG.buildGraphForExam(exam,data):KG.buildGraph(data,{subject:exam.subject_name||subject});
    const proc=engine.verifyExam(data,exam).errors;
    const report=KR.checkExam(data,exam,{...(Number.isInteger(w)&&w>0?{scopeWeek:w}:{}),procedural:proc,config:data.profile?.rule_config});
    return result({report:{...report,snapshot_used:Boolean(exam.ppct_snapshot||exam.matrix_snapshot||exam.revision_snapshot),graph_summary:KG.summary(examGraph)}});
   }
   const graph=KG.buildGraph(data,{subject});
   if(path==='/api/knowledge/lesson-context'){const ctx=KG.lessonContext(graph,subject,p.grade,p.lesson_code);if(!ctx)fail('Không tìm thấy bài trong PPCT.',404);return result({context:ctx});}
   const grade=p.grade===undefined||p.grade===null||p.grade===''?undefined:Number(p.grade);
   const opt=grade===undefined?{}:{grade};const qs=bank.filter(q=>q&&(grade===undefined||Number(q.grade)===grade)&&String(q.subject_name||'Tin học').normalize('NFC').trim().toLowerCase()===String(subject).normalize('NFC').trim().toLowerCase());
   const week=Number(p.scope_week);
   const schemaIssues=typeof KG.checkSchema==='function'?KG.checkSchema(graph):[];
   const prereqSuggestions=typeof KG.suggestPrerequisites==='function'?KG.suggestPrerequisites(graph,opt):[];
   return result({summary:KG.summary(graph),issues:KG.validateGraph(graph,opt),schema_issues:schemaIssues,coverage:KG.coverage(graph,opt),duplicates:KG.nearDuplicateGroups(graph,qs,{...opt,threshold:p.threshold??0.8}),study_order:KG.studyOrder(graph,opt),prerequisite_suggestions:prereqSuggestions,id_audit:KG.outcomeIdAudit?KG.outcomeIdAudit(graph,opt):null,matrix_cells:KG.matrixCells?(data.matrices||[]).filter(m=>m&&m.status!=='archived'&&(grade===undefined||Number(m.grade)===grade)).map(m=>({id:m.id,title:m.title||m.id,cells:KG.matrixCells(graph,m.id)})).filter(x=>x.cells.length):[],after_week:grade!==undefined&&Number.isInteger(week)&&week>0?KG.lessonsAfterWeek(graph,grade,week,subject):[]});
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
   const snap=report.errors.find(e=>e.code==='snapshot');
   if(!source.questions?.length||snap)fail('Đề gốc chưa có bản chụp hợp lệ nên không trộn được: '+(snap?snap.message:'đề chưa có câu hỏi.'),409);
   if(['locked','published'].includes(source.status)&&await workflow.contentHash(source)!==source.approved_hash)fail('Đề gốc đã thay đổi sau khi khóa.',409);
   const codes=p.codes||Array.from({length:p.num_variants??4},(_,i)=>String(101+i));
   if(!Array.isArray(codes)||codes.length<2||codes.length>6||codes.some(c=>typeof c!=='string'||!/^\d{3,6}$/.test(c))||new Set(codes).size!==codes.length)fail('Chọn 2–6 mã đề khác nhau, mỗi mã có 3–6 chữ số.');
   const family=source.parent_exam_id||source.id;
   const taken=new Set(data.exams.filter(x=>x.id!==source.id&&(x.parent_exam_id===family||x.id===family)).map(x=>String(x.exam_code||'')));
   const clash=codes.filter(c=>taken.has(c));
   if(clash.length)fail('Mã '+clash.join(', ')+' đã có trong các mã đã trộn từ đề này. Hãy chọn mã khác hoặc xóa mã cũ trước.',409);
   let randomSeed=Array.from(String(p.seed??now())).reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,1);
   const shuffle=values=>{const a=values.slice();for(let i=a.length-1;i>0;i--){randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;const j=randomSeed%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
   // Trộn đề: chỉ xáo trong TỪNG PHẦN (TN → Đ/S → TLN → TL giữ nguyên thứ tự phần), đánh số lại từ Câu 1 mỗi phần.
   // Tùy chọn: xáo phương án A–D, xáo ý a–d câu Đúng/Sai, giữ nguyên thứ tự câu tự luận. Mã hoán vị là bản nháp, cần duyệt riêng.
   const PART_ORDER=['MC','YN','SHORT','ES'];
   const keepEsOrder=p.keep_es_order!==false,shuffleQuestions=p.shuffle_questions!==false,shuffleOptions=p.shuffle_options!==false,shuffleStatements=p.shuffle_statements===true;
   const lockedOption=o=>/tất cả|cả\s+[ABCD]\s+(và|hoặc)|all of|both\s+[ABCD]|không có phương án nào|none of/i.test(String(o||''));
   const exams=[];
   for(const code of codes){
    const exam=draft(source,'EXAM');exam.parent_exam_id=source.parent_exam_id||source.id;exam.exam_code=code;exam.title=source.title+' — Mã '+code;
    exam.questions.forEach(q=>{if(q.source_slot_number===undefined)q.source_slot_number=q.slot_number;});
    const types=[...new Set([...PART_ORDER,...exam.questions.map(q=>q.type)])].filter(t=>exam.questions.some(q=>q.type===t));
    exam.questions=types.flatMap(t=>{const part=exam.questions.filter(q=>q.type===t);return shuffleQuestions&&!(t==='ES'&&keepEsOrder)?shuffle(part):part;});
    const counters={};
    for(const q of exam.questions){q.slot_number=(counters[q.type]=(counters[q.type]||0)+1);
     if(q.type==='MC'&&shuffleOptions&&Array.isArray(q.options)&&q.options.length===4&&!q.options.some(lockedOption)){
      const order=shuffle([0,1,2,3]),old=q.options,exps=q.option_explanations; q.options=order.map(i=>old[i]);q.correct=order.indexOf(q.correct);if(exps)q.option_explanations=order.map(i=>exps[i]||'');
     }
     if(q.type==='YN'&&shuffleStatements&&Array.isArray(q.statements)&&q.statements.length===4){
      const order=shuffle([0,1,2,3]),old=q.statements;q.statements=order.map((i,k)=>({...old[i],label:'abcd'[k]}));
     }
    }
    exam.shuffle_options_used={shuffle_questions:shuffleQuestions,shuffle_options:shuffleOptions,shuffle_statements:shuffleStatements,keep_es_order:keepEsOrder,seed:String(p.seed??'')};
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
   const old=checkedMatrix(p.id);
   const usedBy=data.exams.filter(e=>e.matrix_id===old.id);
   if(usedBy.length){
    const names=usedBy.slice(0,3).map(e=>e.title||(e.exam_code?`Mã ${e.exam_code}`:e.id)).join(', ');
    fail(`Ma trận đang được liên kết với ${usedBy.length} đề kiểm tra (${names}${usedBy.length>3?'…':''}); cần xóa các đề liên kết trước khi xóa ma trận.`,409);
   }
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
   if(match[2]==='shortfall'){
    const report=engine.shortfall(matrix,bank,ppct);
    // Bản đồ tri thức (Giai đoạn 4): gợi ý câu đúng ô (bài × YCCĐ × dạng × mức độ) cho ô còn thiếu. Không hạ mức độ, không đổi dạng.
    const {g:KG}=knowledgeLibs();
    if(KG&&Array.isArray(report.cells)){
     const ms=String(matrix.subject_name||subject).normalize('NFC').trim().toLowerCase();
     const pool=bank.filter(q=>q&&q.review_status!=='archived'&&String(q.subject_name||'Tin học').normalize('NFC').trim().toLowerCase()===ms);
     const graph=KG.buildGraph({bank:{questions:pool,ppct}},{subject:matrix.subject_name||subject});
     for(const c of report.cells){if(!c.shortfall)continue;
      c.suggestions=KG.suggestForCell(graph,pool,{grade:matrix.grade,lesson_code:c.lesson_code,type:c.kind,level:c.level,learning_outcome:c.any_outcome?'':c.outcome})
       .filter(x=>x.action!=='dung_ngay').slice(0,5)
       .map(x=>{const q=pool.find(q=>q.id===x.question_id);return {...x,question:String(q?.question||'').replace(/\s+/g,' ').slice(0,120)};});
     }
    }
    return result(report);
   }
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
   const g=p.grade?Number(p.grade):null,targetSubj=String(p.subject_name||subject||'Tin học').trim();
   let list=(data.assessment_plans||[]).filter(plan=>(plan.subject_name||'Tin học')===targetSubj);
   if(g)list=list.filter(plan=>Number(plan.grade)===g);
   return result({assessment_plans:list});
  }
  if(path==='/api/assessment-plans/save'){
   const raw=clone(p.plan||{});
   if(!raw.name?.trim())fail('Tên đợt kiểm tra đánh giá không được để trống.');
   const grade=Number(raw.grade||p.grade||8),targetSubj=String(raw.subject_name||p.subject_name||subject||'Tin học').trim();
   const planModel=root.BankAssessmentPlan||(typeof require==='function'?require('./assessment-plan-model.js'):null);
   const normalized=planModel?planModel.normalizePlan(raw,grade,targetSubj):{id:raw.id||id('AP'),grade,subject_name:targetSubj,...raw};
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
   const grade=Number(p.grade||8),targetSubj=String(p.subject_name||subject||'Tin học').trim();
   const planModel=root.BankAssessmentPlan||(typeof require==='function'?require('./assessment-plan-model.js'):null);
   if(!planModel)fail('Chưa nạp bộ định nghĩa KHKTĐG.',503);
   const defaults=planModel.buildDefaultAssessmentPlans(grade,targetSubj);
   data.assessment_plans=[...(data.assessment_plans||[]).filter(ap=>Number(ap.grade)!==grade||(ap.subject_name||'Tin học')!==targetSubj),...defaults];
   return result({success:true,assessment_plans:data.assessment_plans,defaults},true);
  }
  if(path==='/api/assessment-plans/import'){
   const planModel=root.BankAssessmentPlan||(typeof require==='function'?require('./assessment-plan-model.js'):null);
   if(!planModel)fail('Chưa nạp bộ định nghĩa KHKTĐG.',503);
   const grade=Number(p.grade||8),targetSubj=String(p.subject_name||subject||'Tin học').trim();
   let imported=[];
   if(Array.isArray(p.plans)){imported=p.plans.map(raw=>planModel.normalizePlan(raw,grade,targetSubj)).filter(Boolean);}
   else if(Array.isArray(p.rows)){imported=planModel.parseAssessmentPlansFromRows(p.rows,grade,targetSubj).filter(Boolean);}
   else{fail('Thiếu danh sách kế hoạch (plans hoặc rows).');}
   if(!imported.length)fail('Không tìm thấy đợt kiểm tra hợp lệ trong dữ liệu nạp.');
   if(p.replace_grade===true){
    data.assessment_plans=(data.assessment_plans||[]).filter(ap=>!(Number(ap.grade)===grade&&(ap.subject_name||'Tin học')===targetSubj));
   }
   imported.forEach(plan=>put(data.assessment_plans,plan));
   return result({success:true,imported,assessment_plans:data.assessment_plans},true);
  }
  fail('Thao tác này chưa được hỗ trợ trên bản Pages. Không có dữ liệu nào được thay đổi.',501);
 }
 const api={canHandle,handle};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BankStaticAPI=api;
})(typeof window!=='undefined'?window:globalThis);
