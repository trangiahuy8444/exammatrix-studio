/* Đồng bộ, không I/O. Chỉ tạo bản nháp; chủ ứng dụng lưu, duyệt và xuất hồ sơ.
 * Câu nhiều ý: chỉ hỗ trợ câu Đúng/Sai 4 ý cùng một YCCĐ (bảng ma trận 2D tạo ra), giống quy tắc bản Python.
 * Đúng/Sai trải trên nhiều YCCĐ và tự luận nhiều ý vẫn bị chặn.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BankStaticEngine = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const LEVELS = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
  const KINDS = ['MC', 'YN', 'SHORT', 'ES'];
  const PERIODS = ['TX', 'GK1', 'CK1', 'GK2', 'CK2'];
  const MATRIX_FIELDS = ['profile','grade','school_year','exam_type','duration','title','owner_name','campus','total_points','lessons','requirements','slots','indicator_catalog','source','reconciliation','mode'];
  const OPTIONAL_MATRIX_FIELDS = ['allowed_kinds','scoring_policy','ratio_tolerance','competency_catalog','catalog_revision'];
  const CONTENT_FIELDS = ['grade','type','lesson_code','level','learning_outcome','question','options','correct','option_explanations','rubric','max_score','equivalent_answer_policy','response_mode'];
  const clone = x => JSON.parse(JSON.stringify(x));
  const text = x => typeof x === 'string' && !!x.trim();
  const norm = x => String(x || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const subject = x => norm(x || 'Tin học');
  function competencyCatalogLib(){
    if(typeof BankCompetencyCatalog!=='undefined'&&BankCompetencyCatalog)return BankCompetencyCatalog;
    if(typeof globalThis!=='undefined'&&globalThis.BankCompetencyCatalog)return globalThis.BankCompetencyCatalog;
    if(typeof require==='function'){try{return require('./competency-catalog.js');}catch(_){}}
    return null;
  }
  function subjectContext(name){
    const s=subject(name),math=['toán','toán học','mathematics','math'].includes(s),tin=s==='tin học';
    const lib=competencyCatalogLib();
    const comps=lib&&typeof lib.defaultCompetenciesForSubject==='function'
      ?lib.defaultCompetenciesForSubject(name||'Tin học')
      :(tin?['NLa','NLb','NLc','NLd','NLe']:math?['TDLL','MHH','GQVĐ','GT','SDCC']:['NL_CHUNG']);
    return {subject_name:name||'Tin học',allowed_grades:[6,7,8,9,10,11,12],school_profile:true,minimum_revision_percent:90,competencies:comps};
  }
  function lessonSection(ppctLesson, code=''){
    const raw=String(ppctLesson?.section||'').trim().toLowerCase();
    if(['core','elective_topic','review','assessment'].includes(raw))return raw;
    const c=String(code||ppctLesson?.lesson_code||'').trim();
    const n=String(ppctLesson?.lesson_name_source||ppctLesson?.lesson_name||'').trim();
    const t=String(ppctLesson?.topic_source||ppctLesson?.topic||'').trim();
    if(/^(?:CD|CĐ)\d/i.test(c)||/^\s*Chuyên\s*đề\b/i.test(n)||/chuyên\s*đề\s*học\s*tập|chuyên\s*đề\s*lựa\s*chọn/i.test(t))return 'elective_topic';
    if(/^KT(?:GK|CK)[12]$/i.test(c)||/^\s*Kiểm\s*tra\b/i.test(n))return 'assessment';
    if(/^(?:OT|LT)(?:_HK[12])?(?:_\d+)?$/i.test(c)||/^\s*(?:Ôn\s*tập|Luyện\s*tập)\b/i.test(n))return 'review';
    return 'core';
  }
  const obj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const list = x => Array.isArray(x) ? x : [];
  const positive = x => (typeof x === 'number' || text(x)) && Number.isFinite(Number(x)) && Number(x) > 0;
  const near = (a,b) => Math.abs(a-b) < 1e-8;
  function fail(message, details) { const e = new Error(message); e.details = details || {}; e.status = 400; throw e; }
  function freeze(x) { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; }
  function canonical(x) {
    if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
    if (obj(x)) return '{' + Object.keys(x).sort().map(k => JSON.stringify(k)+':'+canonical(x[k])).join(',') + '}';
    if (typeof x === 'number' && !Number.isFinite(x)) fail('Dữ liệu chứa số không hữu hạn.');
    return JSON.stringify(x === undefined ? null : x);
  }
  // SHA-256 đồng bộ, UTF-8: dùng được trên Pages và Node, không cần WebCrypto async.
  function sha256(value) {
    const bytes = unescape(encodeURIComponent(value)), words = [], length = bytes.length;
    for (let i=0;i<length;i++) words[i>>2] = (words[i>>2] || 0) | bytes.charCodeAt(i) << (24-(i%4)*8);
    words[length>>2] = (words[length>>2] || 0) | 0x80 << (24-(length%4)*8);
    const end = (((length+8)>>6)+1)*16; words[end-1] = length*8;
    const h=[], k=[]; let n=2;
    while(k.length<64) { let prime=true; for(let d=2;d*d<=n;d++) if(n%d===0){prime=false;break;} if(prime){if(h.length<8)h.push((Math.sqrt(n)%1)*0x100000000|0);k.push((Math.cbrt(n)%1)*0x100000000|0);} n++; }
    const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let offset=0;offset<end;offset+=16){ const w=[]; for(let i=0;i<64;i++){ if(i<16)w[i]=words[offset+i]|0;else {const a=w[i-15],b=w[i-2]; w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10)))|0;} }
      let [a,b,c,d,e,f,g,j]=h;
      for(let i=0;i<64;i++){const t1=(j+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0; const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;j=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
      [a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)|0);
    }
    return h.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
  }
  function pick(x,fields,missing) { const r={}; fields.forEach(k=>{if(k in x)r[k]=x[k];else if(missing)r[k]=null;});return r; }
  const digest = m => sha256(canonical({...pick(m,MATRIX_FIELDS,true),...pick(m,OPTIONAL_MATRIX_FIELDS)}));
  // SHORT answer is included additionally: legacy content_hash omitted it.
  const fingerprint = q => {
    const c=pick(q,[...CONTENT_FIELDS,'subject_name','short_answer','statements']);
    if(q.type==='MC'&&Array.isArray(q.options)){
      c.options=q.options.map((o,i)=>[o,i===q.correct,(q.option_explanations||[])[i]||'']).sort((a,b)=>canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0);
      delete c.correct;delete c.option_explanations;
    }
    return sha256(canonical(c));
  };
  const contentHash = q => sha256(canonical(pick(q,CONTENT_FIELDS)));
  const lessons = ppct => list(ppct && ppct.lessons);
  const lesson = (ppct,m,code) => lessons(ppct).find(l=>l.grade===m.grade && subject(l.subject_name)===subject(m.subject_name) && l.lesson_code===code);
  function kinds(m) { return m.allowed_kinds || (m.profile==='THCS' ? ['MC','ES'] : KINDS); }
  // Vị trí ra đề được: một ý, hoặc câu Đúng/Sai 4 ý cùng bài, mức độ và YCCĐ gốc. Tự luận nhiều ý vẫn chặn.
  // Hai YCCĐ được coi là một khi cùng bài, mức độ và YCCĐ gốc trong PPCT (bảng đặc tả có thể tách mỗi ý thành một mục tiêu riêng).
  // Ô ma trận 2D: chỉ ràng buộc bài × dạng câu × mức độ, nhận MỌI YCCĐ của bài (YCCĐ, năng lực cụ thể có sau khi có đề).
  const anyOutcome = r => obj(r) && r.outcome_mode === 'any';
  const outcomeLabel = (r,l) => anyOutcome(r) ? '(Mọi YCCĐ của bài)' : list(l?.outcomes)[r?.ppct_outcome_index];
  const outcomeOk = (q,r,l) => anyOutcome(r) ? list(l?.outcomes).some(o=>norm(o)===norm(q.learning_outcome)) : q.learning_outcome===list(l?.outcomes)[r.ppct_outcome_index];
  function singleRequirement(s,m) {
    if(!obj(s)||!Array.isArray(s.parts)||!s.parts.length||!s.parts.every(p=>obj(p)))return false;
    if(s.parts.length===1)return true;
    if(s.kind!=='YN'||s.parts.length!==4)return false;
    const reqs=s.parts.map(p=>list(m?.requirements).find(r=>obj(r)&&r.id===p.requirement_id));
    if(reqs.some(r=>!r))return false;
    const key=r=>[r.lesson_code,r.level,anyOutcome(r)?'*':r.ppct_outcome_index].join('|');
    return reqs.every(r=>key(r)===key(reqs[0]));
  }
  function technical(q) {
    if(!obj(q)||!text(q.id)||!text(q.question)||!text(q.learning_outcome)||!LEVELS.includes(q.level))return false;
    if(q.type==='MC')return Array.isArray(q.options)&&q.options.length===4&&q.options.every(text)&&new Set(q.options.map(norm)).size===4&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4;
    if(q.type==='SHORT')return ['short_answer','correct_answer','answer'].some(k=>text(q[k])||typeof q[k]==='number'&&Number.isFinite(q[k]));
    if(q.type==='YN')return Array.isArray(q.statements)&&q.statements.length===4&&q.statements.every(st=>obj(st)&&text(st.text)&&typeof st.correct==='boolean')&&new Set(q.statements.map(st=>norm(st.text))).size===4;
    if(q.type==='ES')return Array.isArray(q.rubric)&&q.rubric.length>0&&q.rubric.every(r=>obj(r)&&text(r.criterion)&&positive(r.points));
    return false;
  }
  function validateMatrix(matrix,ppct) {
    const errors=[],warnings=[];let total=0;let supported=true;
    const error=(code,path,message)=>errors.push({code,path,message});
    if(!obj(matrix))return {valid:false,errors:[{code:'shape',path:'',message:'Hồ sơ ma trận không hợp lệ.'}],warnings,totals:{},total_points:0,exam_supported:false};
    const m=matrix, arrays={};
    for(const key of ['lessons','requirements','slots','indicator_catalog']){arrays[key]=list(m[key]).filter(obj);if(!Array.isArray(m[key])||arrays[key].length!==m[key].length)error('shape',key,'Danh sách '+key+' không hợp lệ.');}
    const ctx={...subjectContext(m.subject_name),...(ppct?._context||{})};
    if(Object.prototype.hasOwnProperty.call(m,'competency_catalog')){
      const parser=typeof BankCompetencyCatalog!=='undefined'?BankCompetencyCatalog:(typeof require==='function'?require('./competency-catalog.js'):null);
      const report=parser?.validate({competencies:m.competency_catalog,indicators:m.indicator_catalog});
      if(!report?.valid)for(const e of report?.errors||[{message:'Chưa nạp bộ kiểm tra danh mục.'}])error('catalog','competency_catalog',e.message);
      ctx.competencies=Array.isArray(m.competency_catalog)?m.competency_catalog.filter(obj).map(c=>c.code):[];
    }
    if(Object.prototype.hasOwnProperty.call(m,'catalog_revision')&&(!Number.isInteger(m.catalog_revision)||m.catalog_revision<1))error('catalog','catalog_revision','Phiên bản danh mục phải là số nguyên dương.');
    const indicatorsRequired=m.profile==='THPT'&&(subject(ctx.subject_name||m.subject_name)==='tin học'||arrays.indicator_catalog.length>0);
    if(!Number.isInteger(m.grade)||!(ctx.allowed_grades||[6,7,8,9,10,11,12]).includes(m.grade))error('grade','grade','Khối không thuộc chương trình.');
    if(!PERIODS.includes(m.exam_type))error('exam_type','exam_type','Kì kiểm tra không hợp lệ.');
    if(!['THCS','THPT','GENERAL'].includes(m.profile))error('profile','profile','Mẫu hồ sơ không hợp lệ.');
    if(!['authored','received'].includes(m.mode))error('mode','mode','Chế độ ma trận không hợp lệ.');
    if(!Number.isInteger(m.duration)||m.duration<1||m.duration>300)error('duration','duration','Thời gian phải từ 1 đến 300 phút.');
    for(const k of ['title','school_year','owner_name','campus'])if(!text(m[k]))error('required',k,'Cần nhập '+k+'.');
    if(Number(m.total_points)!==10)error('total','total_points','Tổng điểm phải bằng 10.');
    if(!Array.isArray(kinds(m))||!kinds(m).length||kinds(m).some(k=>!KINDS.includes(k)))error('allowed_kinds','allowed_kinds','Danh sách dạng câu không hợp lệ.');
    const ls=new Set(),rs=new Map(),ids=new Set(),partids=new Set(),numbers={};
    for(const l of arrays.lessons){
      const ppctLesson=lesson(ppct,m,l.lesson_code);
      if(!text(l.lesson_code)||ls.has(l.lesson_code)||!ppctLesson)error('lesson','lessons','Bài học trùng hoặc không thuộc PPCT đúng môn, khối.');
      if(ppctLesson){
        const sec=lessonSection(ppctLesson,l.lesson_code);
        if(sec==='elective_topic'){
          if(Number.isInteger(m.grade)&&m.grade<10)error('elective_in_thcs','lessons','Cấp THCS không có cụm Chuyên đề học tập lựa chọn (TT 32/2018 & Phụ lục I CV 5512).');
          else if(m.exam_type!=='TX')error('elective_in_periodic','lessons','Cụm chuyên đề học tập không thuộc phạm vi đánh giá định kỳ (TT 22/2021, Điều 7, khoản 1). Chỉ sử dụng cho kiểm tra thường xuyên (TX).');
        }else if(sec==='assessment'||sec==='review'){
          error('lesson_non_instructional','lessons','Dòng Ôn tập / Kiểm tra định kỳ không dùng làm đơn vị kiến thức ra đề trong ma trận.');
        }
      }
      ls.add(l.lesson_code);
      if(!text(l.title)||!text(l.topic))error('lesson_title','lessons','Cần tên bài và chủ đề.');
    }
    for(const r of arrays.requirements){if(!text(r.id)||rs.has(r.id))error('requirement_id','requirements','Mã YCCĐ trống hoặc trùng.');rs.set(r.id,r);const l=lesson(ppct,m,r.lesson_code);
      if(!ls.has(r.lesson_code)||!l)error('lesson','requirements','YCCĐ chưa gắn bài đúng môn, khối.');
      if(anyOutcome(r)){if(!list(l?.outcomes).some(text))error('outcome','requirements','Bài '+r.lesson_code+' chưa có YCCĐ trong PPCT.');}
      else if(!Number.isInteger(r.ppct_outcome_index)||!text(list(l?.outcomes)[r.ppct_outcome_index]))error('outcome','requirements','Chọn YCCĐ nguồn trong PPCT.');
      if(!LEVELS.includes(r.level)||!text(r.text))error('requirement','requirements','Nội dung hoặc mức độ YCCĐ không hợp lệ.');
      if(!(ctx.competencies||['NLa','NLb','NLc','NLd','NLe']).includes(r.competency))error('competency','requirements','Thành phần năng lực không hợp lệ.');
    }
    for(const s of arrays.slots){if(!text(s.id)||ids.has(s.id))error('slot_id','slots','Mã vị trí trống hoặc trùng.');ids.add(s.id);
      if(!KINDS.includes(s.kind)||!list(kinds(m)).includes(s.kind))error('kind','slots','Dạng câu không thuộc mẫu hồ sơ.');
      (numbers[s.kind] ||= []).push(s.number);
      if(!obj(s.scoring)||s.scoring.mode!=='sum_parts')error('scoring','slots','Cần tính điểm theo từng ý.');
      if(!Array.isArray(s.parts)||!s.parts.length||s.parts.some(p=>!obj(p))){error('parts','slots','Câu cần danh sách yêu cầu con.');supported=false;continue;}
      if(!singleRequirement(s,m))supported=false;
      if(['MC','SHORT'].includes(s.kind)&&s.parts.length!==1)error('parts','slots','Câu đơn phải có đúng một phần.');
      const labels=s.parts.map(p=>p.label||'');
      if(s.kind==='YN'&&labels.join('')!=='abcd')error('yn_labels','slots','Đúng/Sai phải đủ ý a, b, c, d.');
      if(new Set(labels).size!==labels.length)error('labels','slots','Nhãn ý bị trùng.');
      for(const p of s.parts){if(!text(p.id)||partids.has(p.id))error('part_id','slots','Mã ý trống hoặc trùng.');partids.add(p.id);const r=rs.get(p.requirement_id);
        if(!r)error('unknown_requirement','slots','Vị trí chưa gắn YCCĐ hợp lệ.');
        if(!/^[a-z]?$/.test(p.label||''))error('labels','slots','Nhãn ý không hợp lệ.');
        if(!positive(p.points))error('points','slots','Điểm mỗi ý phải hữu hạn và lớn hơn 0.');else total+=Number(p.points);
        const indicator=typeof p.indicator==='string'?p.indicator.trim():p.indicator;
        if((m.profile==='THPT'||m.competency_catalog?.length)&&(indicatorsRequired||arrays.indicator_catalog.length>0||indicator!==undefined&&indicator!==null&&indicator!=='')){
          const location=`Câu ${s.number} (${s.kind})${p.label?' · ý '+p.label:''}`;
          const path=`slots.${s.id}.parts.${p.id}.indicator`;
          const match=typeof indicator==='string'&&arrays.indicator_catalog.find(i=>typeof i.code==='string'&&i.code.trim()===indicator);
          if(!indicator)error('indicator',path,`${location}: chưa chọn mã chỉ báo trong danh mục.`);
          else if(!match)error('indicator',path,`${location}: mã chỉ báo “${String(indicator)}” không có trong danh mục.`);
          else if(r&&match.competency!==r.competency)error('indicator',path,`${location}: mã “${indicator}” thuộc năng lực ${match.competency}, không khớp năng lực ${r.competency} của YCCĐ ${r.id}.`);
        }
        if(m.mode==='received'&&'source_index' in p&&(!r||r.source_index!==p.source_index||r.level!==p.source_level||('source_competency' in p&&r.competency!==p.source_competency)))error('received_scope','slots','Phạm vi khác nguồn đã đối chiếu.');
      }
    }
    for(const ns of Object.values(numbers))if(ns.some(n=>!Number.isInteger(n))||ns.sort((a,b)=>a-b).some((n,i)=>n!==i+1))error('number_sequence','slots','Số câu trong mỗi dạng phải liên tục, không trùng.');
    if(!arrays.slots.length)error('empty','slots','Chưa có vị trí câu hỏi.');
    if(!near(total,10))error('total','slots','Phân bố phải đủ đúng 10 điểm.');
    if(!m.reconciliation?.confirmed)error('unconfirmed','reconciliation','Chưa xác nhận đối chiếu nguồn.');
    for(const i of list(m.reconciliation?.issues))error(i.code||'source_issue','source',i.message||'Nguồn cần đối chiếu.');
    if(m.scoring_policy?.yn_table){const t=m.scoring_policy.yn_table,vs=['0','1','2','3','4'].map(k=>Number(t[k]));if(Object.keys(t).length!==5||vs.some((v,i)=>!Number.isFinite(v)||v<0||v>1||(i&&v<vs[i-1]))||vs[4]!==1)error('scoring_policy','scoring_policy','Bảng hệ số Đúng/Sai không hợp lệ.');}
    return {valid:!errors.length,errors,warnings,totals:{points:total,questions:arrays.slots.length,items:partids.size},total_points:total,exam_supported:supported&&!errors.length};
  }
  function usable(m,ppct) {
    const report=validateMatrix(m,ppct);
    if(!report.valid)fail('Ma trận chưa hợp lệ: '+report.errors.map(e=>e.message).join(' '),report);
    if(m.status!=='locked')fail('Chọn phiên bản ma trận đã khóa.');
    if(m.content_sha256 && m.content_sha256!==digest(m))fail('Nội dung ma trận đã thay đổi so với bản khóa; cần khóa lại.');
    if(!report.exam_supported)fail('Ma trận có câu nhiều ý gắn với nhiều YCCĐ khác nhau. Bản trên trình duyệt chỉ tạo đề với câu một ý, hoặc câu Đúng/Sai có 4 ý cùng một YCCĐ; hãy sửa các ý về cùng một YCCĐ hoặc tách thành câu riêng.');
    return m;
  }
  function eligible(q,m,s,ppct,approved=true) {
    if(!technical(q)||(approved&&q.review_status!=='approved')||q.grade!==m.grade||subject(q.subject_name)!==subject(m.subject_name)||q.type!==s.kind)return false;
    return s.parts.every(p=>{const r=m.requirements.find(r=>r.id===p.requirement_id),l=r&&lesson(ppct,m,r.lesson_code);return r&&l&&q.lesson_code===r.lesson_code&&q.level===r.level&&outcomeOk(q,r,l);});
  }
  function unique(qs) { const ids=new Set(),texts=new Set();return qs.filter(q=>{const t=norm(q.question);if(ids.has(q.id)||texts.has(t))return false;ids.add(q.id);texts.add(t);return true;}); }
  function candidates(matrix,questions,ppct) {
    usable(matrix,ppct);
    return clone({matrix,slots:matrix.slots.map(slot=>({slot,requirements:slot.parts.map(p=>matrix.requirements.find(r=>r.id===p.requirement_id)),candidates:unique(list(questions).filter(q=>eligible(q,matrix,slot,ppct))).map(q=>({...q,content_hash:contentHash(q),source_snapshot_hash:fingerprint(q),recently_used:[]}))}))});
  }
  function shortfall(matrix,questions,ppct) {
    const v=validateMatrix(matrix,ppct),cells=[],unresolved_slots=[],groups=new Map();
    for(const s of list(matrix?.slots)){if(!singleRequirement(s,matrix)){unresolved_slots.push({slot_id:s?.id,kind:s?.kind,number:s?.number,parts:s?.parts||[],reason:'Chưa hỗ trợ câu nhiều ý gắn với nhiều YCCĐ khác nhau.'});continue;}
      const r=list(matrix.requirements).find(r=>r.id===s.parts[0]?.requirement_id),l=r&&lesson(ppct,matrix,r.lesson_code);if(!r||!l){unresolved_slots.push({slot_id:s.id,reason:'Chưa xác định YCCĐ trong PPCT.'});continue;}
      const outcome=outcomeLabel(r,l),key=[r.lesson_code,s.kind,r.level,outcome].join('|');
      if(!groups.has(key))groups.set(key,{lesson_code:r.lesson_code,outcome,any_outcome:anyOutcome(r),kind:s.kind,level:r.level,needed:0,approved:0,pending_review:0,needs_review:0,draft:0,shortfall:0,slot:s});groups.get(key).needed++;
    }
    for(const c of groups.values()){for(const status of ['approved','pending_review','needs_review','draft'])c[status]=unique(list(questions).filter(q=>q.review_status===status&&eligible(q,matrix,c.slot,ppct,false))).length;c.shortfall=Math.max(0,c.needed-c.approved);delete c.slot;cells.push(c);}
    const complete=v.valid&&v.exam_supported&&!unresolved_slots.length, total_shortfall=cells.reduce((s,c)=>s+c.shortfall,0);
    // A cross-cell matching check catches the same content claimed by multiple cells.
    let feasible=true;
    if(complete&&total_shortfall===0){try{assign(matrix.slots.map(s=>({slot:s,candidates:unique(list(questions).filter(q=>eligible(q,matrix,s,ppct)))})),{});}catch(_){feasible=false;}}
    return clone({ok:complete&&total_shortfall===0&&feasible,complete,total_shortfall,cells,issues:[...v.errors,...(!feasible?[{code:'overlap',message:'Câu ứng viên trùng nhau giữa các ô; chưa đủ câu độc lập.'}]:[])],unresolved_slots});
  }
  function source(data,payload) {
    if(!obj(data)||!obj(data.bank)||!Array.isArray(data.bank.questions)||!obj(data.bank.ppct))fail('Thiếu dữ liệu ngân hàng hoặc PPCT.');
    if(data.bank.questions.some(q=>!obj(q)||!text(q.id))||new Set(data.bank.questions.map(q=>q.id)).size!==data.bank.questions.length)fail('Ngân hàng có mã câu trống hoặc trùng; cần đối soát trước khi tạo hồ sơ.');
    const p=payload||{};if(p._matrix)fail('Không nhận ma trận từ máy khách; chọn mã ma trận đã lưu.');
    if(!Number.isInteger(p.grade)||!PERIODS.includes(p.exam_type)||!text(p.subject_name||p.subject))fail('Cần khối, môn học và kì kiểm tra hợp lệ.');
    const subj=p.subject_name||p.subject;
    if(p.matrix_id){const matches=list(data.matrices).filter(m=>m.id===p.matrix_id);if(matches.length!==1)fail('Không tìm thấy duy nhất phiên bản ma trận đã lưu.');const m=usable(matches[0],data.bank.ppct);
      if(m.grade!==p.grade||subject(m.subject_name)!==subject(subj)||m.exam_type!==p.exam_type)fail('Ma trận không khớp khối, môn hoặc kì kiểm tra.');
      if((p.matrix_version!=null&&p.matrix_version!==m.version)||(p.matrix_revision!=null&&p.matrix_revision!==m.revision)||(p.matrix_digest&&p.matrix_digest!==(m.content_sha256||digest(m))))fail('Phiên bản ma trận đã thay đổi; tải lại ma trận.');
      return {matrix:m,slots:candidates(m,data.bank.questions,data.bank.ppct).slots,blueprint:null};
    }
    if(p.template_id)fail('Chưa hỗ trợ mẫu ma trận trên máy khách; chọn ma trận đã khóa.');
    if(!Array.isArray(p.blueprint)||!p.blueprint.length)fail('Cần ma trận đã lưu hoặc phân bố đủ 10 điểm.');
    const m={grade:p.grade,subject_name:subj,requirements:[]},slots=[];let total=0;
    p.blueprint.forEach((r,index)=>{if(!obj(r)||!Number.isInteger(r.count)||r.count<1||r.count>500||!positive(r.points_per_question)||!LEVELS.includes(r.level)||!['MC','SHORT','ES'].includes(r.type))fail('Phân bố không hợp lệ hoặc dạng nhiều phần chưa hỗ trợ.');
      const l=lesson(data.bank.ppct,m,r.lesson_code);if(!l)fail('Bài học không thuộc PPCT đúng khối và môn.');
      const sec=lessonSection(l,r.lesson_code);
      if(sec==='elective_topic'){
        if(p.grade<10)fail('Cấp THCS không có cụm Chuyên đề học tập lựa chọn (TT 32/2018 & Phụ lục I CV 5512).');
        if(p.exam_type!=='TX')fail('Cụm chuyên đề học tập không thuộc phạm vi đánh giá định kỳ (TT 22/2021, Điều 7, khoản 1). Chỉ sử dụng cho kiểm tra thường xuyên (TX).');
      }else if(sec==='assessment'||sec==='review'){
        fail('Dòng Ôn tập / Kiểm tra định kỳ không dùng làm đơn vị kiến thức ra đề.');
      }
      const outcomes=r.outcomes===undefined?list(l.outcomes):r.outcomes;if(!Array.isArray(outcomes)||!outcomes.length||outcomes.some(o=>!text(o)||!list(l.outcomes).includes(o)))fail('YCCĐ phân bố không thuộc PPCT.');
      const pool=unique(data.bank.questions.filter(q=>technical(q)&&q.review_status==='approved'&&q.grade===p.grade&&subject(q.subject_name)===subject(subj)&&q.lesson_code===r.lesson_code&&q.type===r.type&&q.level===r.level&&outcomes.includes(q.learning_outcome)));
      for(let i=0;i<r.count;i++)slots.push({slot:{id:'BP-'+index+'-'+i,kind:r.type,number:slots.filter(s=>s.slot.kind===r.type).length+1,parts:[{id:'BP-P-'+index+'-'+i,points:Number(r.points_per_question)}]},candidates:pool,cell:{lesson_code:r.lesson_code,type:r.type,level:r.level,outcomes:r.outcomes||[]}});
      total+=r.count*Number(r.points_per_question);
    });if(!near(total,10))fail('Tổng điểm phân bố phải bằng 10.');
    if(slots.length>500)fail('Phân bố vượt giới hạn 500 câu.');return {matrix:null,slots,blueprint:clone(p.blueprint)};
  }
  function cellGroups(src,ppct) {
    const groups=new Map();
    for(const s of src.slots){let c=s.cell;if(!c){const r=s.requirements[0],l=lesson(ppct,src.matrix,r.lesson_code);c={lesson_code:r.lesson_code,type:s.slot.kind,level:r.level,outcomes:anyOutcome(r)?list(l.outcomes).filter(text):[l.outcomes[r.ppct_outcome_index]]};}
      const key=[c.lesson_code,c.type,c.level,...c.outcomes].join('|');if(!groups.has(key))groups.set(key,{...c,key,need:0,points:[],pool:[]});const g=groups.get(key);g.need++;g.points.push(s.slot.parts.reduce((sum,p)=>sum+Number(p.points),0));g.pool=unique([...g.pool,...s.candidates]);
    }return [...groups.values()];
  }
  function plan(data,payload) {
    const src=source(data,payload),groups=cellGroups(src,data.bank.ppct);const p=payload||{},counts=p.counts;let remaining=p.total;
    if(p.lesson_counts!=null)fail('Chưa hỗ trợ chia câu theo bài; hãy dùng số câu theo ô.');
    if(obj(counts)&&Object.keys(counts).some(key=>!groups.some(g=>g.key===key)))fail('Khóa ô đề cương không thuộc ma trận.');
    if(counts!=null&&(!obj(counts)||Object.values(counts).some(n=>!Number.isInteger(n)||n<0)))fail('Số câu đề cương phải là số nguyên không âm.');
    if(remaining!=null&&(!Number.isInteger(remaining)||remaining<1))fail('Tổng số câu đề cương phải là số nguyên dương.');
    const per=src.slots.length,chosen=new Set();
    const allocation=groups.map(g=>remaining==null?0:Math.floor(p.total*g.need/per));
    if(remaining!=null){let extra=p.total-allocation.reduce((a,b)=>a+b,0);const order=groups.map((g,i)=>({i,fraction:p.total*g.need/per-allocation[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);for(let i=0;i<extra;i++)allocation[order[i].i]++;}
    const cells=groups.map((g,i)=>{let requested=counts?counts[g.key]||0:p.total!=null?allocation[i]:Math.min(g.pool.length,Math.ceil(g.need*1.5));
      const qs=g.pool.filter(q=>!chosen.has(q.id)).slice(0,requested);qs.forEach(q=>chosen.add(q.id));const {pool,...c}=g;return {...c,available:pool.length,requested,revision_count:qs.length,question_ids:qs.map(q=>q.id)};});
    return clone({cells,question_ids:[...chosen],total:chosen.size,exam_question_count:per,warnings:cells.filter(c=>c.revision_count<c.requested).map(c=>'Ô '+c.lesson_code+' thiếu câu đã duyệt: cần '+c.requested+', có '+c.available+'.')});
  }
  function proposeRevision(data,payload){if(payload&&'title' in payload&&!text(payload.title))fail('Cần nhập tên đề cương.');const p=plan(data,payload);let revision;
    if(text(payload?.title)){const qs=p.question_ids.map(id=>data.bank.questions.find(q=>q.id===id));revision=freeze({id:ident('REV',data.revisions,payload,qs),title:payload.title.trim(),grade:payload.grade,subject_name:payload.subject_name||payload.subject,exam_type:payload.exam_type,created_at:payload.created_at||null,question_count:qs.length,questions:qs.map(q=>({...clone(q),content_hash:contentHash(q),source_snapshot_hash:fingerprint(q)}))});}
    return {...p,...(revision?{revision}:{})};
  }
  function ident(prefix,records,p,qs){const base=prefix+'-'+sha256(canonical([p,list(qs).map(q=>q.id)])).slice(0,12);let id=base,i=1;while(list(records).some(r=>r.id===id))id=base+'-'+i++;return id;}
  function revisionFor(data,p,m) {if(!p.revision_id)return null;const r=list(data.revisions).find(r=>r.id===p.revision_id);if(!r)fail('Không tìm thấy phiên bản đề cương.');if(r.grade!==p.grade||subject(r.subject_name)!==subject(p.subject_name||p.subject)||(r.exam_type&&r.exam_type!==p.exam_type))fail('Đề cương phải cùng khối, môn và kì kiểm tra.');if(!text(r.title)||!list(r.questions).length||r.questions.some(q=>!technical(q)||q.review_status!=='approved'||q.grade!==p.grade||subject(q.subject_name)!==subject(p.subject_name||p.subject)))fail('Đề cương chứa câu chưa duyệt hoặc dữ liệu kỹ thuật không hợp lệ.');return r;}
  function similarity(p) {const n=p.similarity_percent??p.similarity_target_percent??90;if(!Number.isFinite(Number(n))||Number(n)<90||Number(n)>100)fail('Tỉ lệ đề cương phải từ 90% đến 100%.');if(p.similarity_mode&&!['min','exact'].includes(p.similarity_mode))fail('Chế độ tương đồng không hợp lệ.');return Number(n);}
  function assign(slots,opts) {
    if(slots.length>500)fail('Vượt giới hạn 500 vị trí câu hỏi.');
    const hashes=new Set(list(opts.revision?.questions).map(fingerprint)),coverage=new Set(list(opts.revision?.questions).map(q=>q.lesson_code+'|'+q.learning_outcome));
    const need=opts.revision?Math.ceil(slots.length*(opts.percent||90)/100):0;
    const ordered=slots.map((s,i)=>({i,slot:s.slot,pool:s.candidates.filter(q=>!opts.revision||coverage.has(q.lesson_code+'|'+q.learning_outcome)).sort((a,b)=>Number(hashes.has(fingerprint(b)))-Number(hashes.has(fingerprint(a)))||sha256(String(opts.seed||'')+a.id).localeCompare(sha256(String(opts.seed||'')+b.id)))})).sort((a,b)=>a.pool.length-b.pool.length);
    const ids=new Set(),texts=new Set(),result=[];let attempts=0;
    function search(index,matched){const remaining=ordered.slice(index);const available=remaining.flatMap(s=>s.pool).filter(q=>!ids.has(q.id)&&!texts.has(norm(q.question)));if(new Set(available.map(q=>q.id)).size<remaining.length||new Set(available.map(q=>norm(q.question))).size<remaining.length||matched+new Set(available.filter(q=>hashes.has(fingerprint(q))).map(q=>q.id)).size<need)return false;if(++attempts>200000)fail('Không thể hoàn tất ghép câu trong giới hạn; hãy chọn câu cụ thể theo từng vị trí.');if(matched+ordered.length-index<need)return false;if(index===ordered.length)return matched>=need&&(!opts.exact||matched===need);
      const s=ordered[index];for(const q of s.pool){const marker=norm(q.question),hit=Number(hashes.has(fingerprint(q)));if(ids.has(q.id)||texts.has(marker)||(opts.exact&&matched+hit>need))continue;ids.add(q.id);texts.add(marker);result[s.i]=q;if(search(index+1,matched+hit))return true;ids.delete(q.id);texts.delete(marker);}return false;}
    if(!search(0,0)){
      // Chỉ rõ vị trí thiếu (mô phỏng 9 môn, 24/11/2026): nhóm các vị trí dùng chung một tập câu ứng viên.
      const KIND_NAME={MC:'Trắc nghiệm',YN:'Đúng/Sai',SHORT:'Trả lời ngắn',ES:'Tự luận'},groups=new Map();
      for(const s of ordered){const key=[...new Set(s.pool.map(q=>q.id))].sort().join('|');if(!groups.has(key))groups.set(key,{slots:[],available:new Set(s.pool.map(q=>q.id)).size});groups.get(key).slots.push(s.slot);}
      const short=[...groups.values()].filter(g=>g.available<g.slots.length).map(g=>({slots:g.slots.map(sl=>(KIND_NAME[sl?.kind]||sl?.kind)+' câu '+(sl?.number??'?')),needed:g.slots.length,available:g.available}));
      const where=short.slice(0,5).map(g=>`${g.slots.join(', ')}: cần ${g.needed}, có ${g.available} câu đã duyệt${opts.revision?' trong phạm vi đề cương':''}`).join('; ');
      fail((opts.revision?'Không đủ câu khớp ma trận, YCCĐ và tỉ lệ đề cương ít nhất 90%.':'Ngân hàng thiếu câu đã duyệt độc lập theo đúng ô ma trận.')+(where?' Vị trí thiếu: '+where+'.':''),{short_slots:short});
    }
    return result;
  }
  function revisionReport(exam,rev) {
    const qs=list(exam.questions),rs=list(rev?.questions),hashes=new Set(rs.map(fingerprint)),outcomes=new Set(rs.map(q=>q.lesson_code+'|'+q.learning_outcome));const exact=[],outside=[],missing=[];let matchedPoints=0,coveredPoints=0,total=0;
    qs.forEach(q=>{const points=Number(q.points)||0;total+=points;if(outcomes.has(q.lesson_code+'|'+q.learning_outcome))coveredPoints+=points;else missing.push({question_id:q.id,lesson_code:q.lesson_code,learning_outcome:q.learning_outcome});if(hashes.has(fingerprint(q))){exact.push(q.id);matchedPoints+=points;}else outside.push(q.id);});
    const threshold=exam.similarity_target_percent||90,required=Math.ceil(qs.length*threshold/100),count=exact.length,coverage={ok:!!qs.length&&!missing.length,percent:total?100*coveredPoints/total:0,missing};
    return {mode:'chi_trung',threshold,total:qs.length,required,exact,exact_count:count,close_approved:[],close_pending:[],close_count:0,outside,t_percent:qs.length?100*count/qs.length:0,points_percent:total?100*matchedPoints/total:0,coverage,passed:!!rev&&!!qs.length&&coverage.ok&&count>=required&&(exam.similarity_mode!=='exact'||count===required)};
  }
  function generateExam(data,payload) {
    const p=payload||{};if(!text(p.title))fail('Cần nhập tên đề kiểm tra.');const src=source(data,p),percent=similarity(p),rev=revisionFor(data,p,src.matrix);
    const duration=p.duration??src.matrix?.duration??45;if(!Number.isInteger(duration)||duration<1||duration>300)fail('Thời gian phải từ 1 đến 300 phút.');
    let slots=src.slots;
    if(p.placements!==undefined){if(!Array.isArray(p.placements)||p.placements.length!==slots.length||new Set(p.placements.map(x=>x?.slot_id)).size!==slots.length)fail('Phải chọn đủ đúng một câu cho mỗi vị trí, không trùng.');slots=slots.map(s=>{const x=p.placements.find(x=>x?.slot_id===s.slot.id);if(!x)fail('Vị trí chọn không khớp ma trận.');const expected=s.slot.parts.map(p=>p.id);if(!Array.isArray(x.reviewed_part_ids)||x.reviewed_part_ids.length!==expected.length||new Set(x.reviewed_part_ids).size!==expected.length||expected.some(id=>!x.reviewed_part_ids.includes(id)))fail('Cần xác nhận đối chiếu từng chỉ báo của vị trí.');const qs=s.candidates.filter(q=>q.id===x.question_id);if(!qs.length)fail('Câu được chọn không khớp khối, môn, dạng, mức độ, YCCĐ hoặc trạng thái duyệt.');return {...s,candidates:qs};});}
    if(p.question_ids!==undefined){if(!Array.isArray(p.question_ids)||p.question_ids.length!==slots.length||new Set(p.question_ids).size!==slots.length)fail('Danh sách câu chỉ định phải đủ và không trùng.');slots=slots.map(s=>({...s,candidates:s.candidates.filter(q=>p.question_ids.includes(q.id))}));}
    const selected=assign(slots,{revision:rev,percent,exact:!!rev&&p.similarity_mode==='exact',seed:p.seed});
    const questions=selected.map((q,i)=>({...clone(q),points:slots[i].slot.parts.reduce((sum,p)=>sum+Number(p.points),0),slot_id:slots[i].slot.id,slot_number:slots[i].slot.number,reviewed_part_ids:p.placements?clone(p.placements.find(x=>x.slot_id===slots[i].slot.id).reviewed_part_ids):[],content_hash:contentHash(q),source_content_hash:contentHash(q),source_snapshot_hash:fingerprint(q),in_revision:!!rev&&rev.questions.some(r=>fingerprint(r)===fingerprint(q))}));
    const e={id:ident('EXAM',data.exams,p,questions),title:p.title.trim(),grade:p.grade,subject_name:p.subject_name||p.subject,exam_type:p.exam_type,duration,campus:p.campus||src.matrix?.campus||'',exam_code:p.exam_code||'101',created_at:p.created_at||null,seed:p.seed??'',status:'drafting',question_count:questions.length,total_points:10,questions,blueprint:src.blueprint||cellGroups(src,data.bank.ppct).flatMap(c=>c.points.map(points=>({lesson_code:c.lesson_code,type:c.type,level:c.level,outcomes:c.outcomes,count:1,points_per_question:points}))),profile:src.matrix?.profile||p.profile||'GENERAL',allowed_kinds:src.matrix?clone(kinds(src.matrix)):[...new Set(questions.map(q=>q.type))],template_id:null,revision_id:rev?.id||null,revision_snapshot:rev?clone(rev):null,similarity_target_percent:percent,similarity_mode:p.similarity_mode||'min',scoring_policy:{yn_table:clone(src.matrix?.scoring_policy?.yn_table||{'0':'0','1':'0.1','2':'0.25','3':'0.5','4':'1'}),rounding:p.exam_type==='TX'?'half_up_integer':'half_up_1dp',blank_counts_as:'wrong'},validation_note:'Bản nháp đã kiểm tra kỹ thuật; cần giáo viên duyệt chuyên môn và chỉ báo trước khi phát hành.'};
    if(src.matrix)Object.assign(e,{matrix_id:src.matrix.id,matrix_version:src.matrix.version,matrix_digest:src.matrix.content_sha256||digest(src.matrix),matrix_snapshot:clone(src.matrix),matrix_requirement_outcomes:Object.fromEntries(src.matrix.requirements.map(r=>[r.id,anyOutcome(r)?null:lesson(data.bank.ppct,src.matrix,r.lesson_code).outcomes[r.ppct_outcome_index]]))});
    e.revision_check=revisionReport(e,rev);e.revision_match_count=rev?e.revision_check.exact_count:null;e.revision_required_count=rev?e.revision_check.required:null;
    if(rev&&!e.revision_check.passed)fail('Đề chưa đạt YCCĐ hoặc tỉ lệ đề cương ít nhất 90%.');
    e.ppct_snapshot=clone(data.bank.ppct);
    e.snapshot_integrity=sha256(canonical({questions:e.questions,matrix:e.matrix_snapshot||null,blueprint:e.blueprint,revision:e.revision_snapshot,ppct:e.ppct_snapshot}));
    return freeze(clone(e));
  }
  // Nhãn câu theo phần (đánh số lại từ Câu 1 cho từng dạng): "TN câu 3", "TL câu 1".
  const PART_LABEL={MC:'TN',YN:'Đ/S',SHORT:'TLN',ES:'TL'};
  const qLabel=(q,i)=>(PART_LABEL[q?.type]||q?.type||'Câu')+' câu '+(q?.slot_number??(i+1));
  const listLabels=xs=>{const shown=xs.slice(0,12).join(', ');return xs.length>12?shown+` và ${xs.length-12} câu khác`:shown;};
  function verifyExam(data,exam) {
    // Kiểm từng nhóm điều kiện riêng và nêu rõ câu nào sai (trước đây dừng ở lỗi đầu tiên, câu thông báo chung chung).
    const errors=[];const e=exam||{},qs=list(e.questions);let matrix=null;
    const add=(code,message,extra)=>errors.push({code,message,...(extra||{})});
    if(!text(e.title))add('title','Thiếu tên đề.');
    try{similarity(e);}catch(err){add('similarity',err.message);}
    const total=qs.reduce((n,q)=>n+Number(q.points||0),0);
    if(!qs.length)add('points','Đề chưa có câu hỏi.');
    else if(qs.length!==e.question_count||!near(total,10)||e.total_points!==10)add('points',`Đề có ${qs.length} câu, tổng ${Math.round(total*100)/100} điểm; cần đúng 10 điểm và khớp số câu khai báo (${e.question_count}).`);
    const group=(pred)=>qs.map((q,i)=>pred(q)?qLabel(q,i):null).filter(Boolean);
    const notApproved=group(q=>q.review_status!=='approved');
    if(notApproved.length)add('questions_not_approved',`Câu chưa duyệt: ${listLabels(notApproved)}. Đề chính thức chỉ dùng câu đã duyệt.`,{questions:notApproved});
    const wrongScope=group(q=>q.grade!==e.grade||subject(q.subject_name)!==subject(e.subject_name));
    if(wrongScope.length)add('scope',`Câu khác khối hoặc khác môn với đề: ${listLabels(wrongScope)}.`,{questions:wrongScope});
    const badTech=group(q=>!technical(q)||!positive(q.points));
    if(badTech.length)add('technical',`Câu thiếu nội dung kỹ thuật (phương án, đáp án, hướng dẫn chấm) hoặc điểm: ${listLabels(badTech)}.`,{questions:badTech});
    const changed=group(q=>q.source_snapshot_hash!==fingerprint(q));
    if(changed.length)add('snapshot',`Nội dung câu đã thay đổi so với bản chụp lúc tạo đề (hoặc đề tạo bằng bản cũ chưa có bản chụp): ${listLabels(changed)}. Hãy tạo lại đề hoặc dùng "Kiểm định lại" sau khi sửa.`,{questions:changed});
    const seenId=new Map(),seenText=new Map(),dups=[];
    qs.forEach((q,i)=>{const t=norm(q.question);if(seenId.has(q.id)||seenText.has(t))dups.push(qLabel(q,i)+' trùng '+(seenId.get(q.id)||seenText.get(t)));seenId.set(q.id,qLabel(q,i));seenText.set(t,qLabel(q,i));});
    if(dups.length)add('duplicate','Đề bị trùng câu: '+listLabels(dups)+'.');
    if(!changed.length&&e.snapshot_integrity!==sha256(canonical({questions:e.questions,matrix:e.matrix_snapshot||null,blueprint:e.blueprint,revision:e.revision_snapshot,ppct:e.ppct_snapshot})))add('snapshot','Bản chụp đề (ma trận, đề cương, PPCT đi kèm) đã bị thay đổi sau khi tạo.');
    try{
      const evidence={...data,bank:{questions:qs,ppct:e.ppct_snapshot||data.bank.ppct},matrices:e.matrix_snapshot?[e.matrix_snapshot]:[]};
      const src=source(evidence,{grade:e.grade,subject_name:e.subject_name,exam_type:e.exam_type,matrix_id:e.matrix_id,blueprint:e.blueprint});matrix=src.matrix;
      if(matrix){
        if(e.matrix_digest!==(matrix.content_sha256||digest(matrix)))add('matrix','Ma trận gắn với đề đã thay đổi sau khi tạo đề.');
        if(matrix.grade!==e.grade)add('matrix','Ma trận khác khối với đề.');
        if(matrix.slots.length!==qs.length)add('matrix',`Ma trận có ${matrix.slots.length} vị trí, đề có ${qs.length} câu.`);
        const ppctE=evidence.bank.ppct,bad=[];
        for(const s of matrix.slots){
          const q=qs.find(q=>q.slot_id===s.id);const pts=s.parts.reduce((n,p)=>n+Number(p.points),0);
          const label=(PART_LABEL[s.kind]||s.kind)+' câu '+(s.number??'?');
          if(!q){bad.push(label+': chưa có câu');continue;}
          if(q.type!==s.kind){bad.push(label+': sai dạng câu');continue;}
          const r=list(matrix.requirements).find(r=>r.id===s.parts[0]?.requirement_id),l=r&&lesson(ppctE,matrix,r.lesson_code);
          if(r&&q.lesson_code!==r.lesson_code)bad.push(`${label}: câu thuộc bài ${q.lesson_code}, ô cần bài ${r.lesson_code}`);
          else if(r&&q.level!==r.level)bad.push(`${label}: câu mức ${q.level}, ô cần mức ${r.level}`);
          else if(r&&l&&!outcomeOk(q,r,l))bad.push(`${label}: YCCĐ của câu không khớp ${anyOutcome(r)?'YCCĐ nào của bài trong PPCT':'YCCĐ của ô'}`);
          else if(!near(Number(q.points),pts))bad.push(`${label}: câu ${q.points} điểm, ô ${pts} điểm`);
        }
        if(bad.length)add('matrix_cell','Câu không khớp vị trí ma trận: '+listLabels(bad)+'.',{cells:bad});
      }else{const matching=src.slots.map(s=>({...s,candidates:qs.filter(q=>s.candidates.some(c=>fingerprint(c)===fingerprint(q)))}));assign(matching,{});}
    }catch(err){add('matrix',err.message);}
    let rev=null;try{rev=revisionFor(data,{...e,revision_id:e.revision_id});if(!rev)fail('Chưa gắn đề cương; chưa đủ điều kiện duyệt.');}catch(err){errors.push({code:'revision',message:err.message});}
    const rc=revisionReport(e,rev);if(!rc.passed)errors.push({code:'revision_criterion',message:'Chưa đạt 100% YCCĐ và tỉ lệ đề cương ít nhất 90%.'});
    if(!e.matrix_id)errors.push({code:'matrix_required',message:'Phân bố tự thiết lập chỉ dùng bản nháp. Chọn ma trận đã khóa để duyệt và phát hành trên Pages.'});
    return {passed:!errors.length,valid:!errors.length,errors,warnings:[],matrix_id:e.matrix_id||null,matrix_title:matrix?.title||'',matrix_locked:matrix?.status==='locked',total_questions:qs.length,total_points:qs.reduce((n,q)=>n+Number(q.points||0),0),revision_criterion:rc,revision_check:{revision_id:e.revision_id,total_questions:qs.length,matched_questions:rc.exact_count,matched_points:rc.points_percent/10,coverage_percent_count:rc.t_percent,coverage_percent_points:rc.points_percent,matched:rc.passed},summary:errors.length?'Chưa đủ điều kiện duyệt: '+errors.map(x=>x.message).join(' '):'Đạt kiểm tra kỹ thuật ma trận và đề cương; cần duyệt chuyên môn.'};
  }
  function generateSet(data,payload) {
    const p=payload||{};if(!Number.isInteger(p.exam_count)||p.exam_count<1||p.exam_count>6)fail('Số đề trong bộ phải từ 1 đến 6.');if(!text(p.title))fail('Cần nhập tên bộ đề.');
    let revision=null,work=data;
    if(!p.revision_id){const proposal=proposeRevision(data,{...p,title:'Đề cương · '+p.title,counts:p.revision_counts,total:p.revision_total});revision=proposal.revision;if(!revision?.questions.length)fail('Chưa đủ câu đã duyệt để lập đề cương.');work={...data,revisions:[...list(data.revisions),revision]};}
    const exams=[];for(let i=0;i<p.exam_count;i++){const e=generateExam({...work,exams:[...list(data.exams),...exams]},{...p,title:p.title+' · '+(i+1),exam_code:String(101+i),seed:String(p.seed||'')+':'+i,revision_id:p.revision_id||revision.id});exams.push(e);}
    const actualRevision=revision||work.revisions.find(r=>r.id===p.revision_id);
    return freeze({exams,exams_all:[...clone(list(data.exams)),...exams],revision:clone(actualRevision),revisions:clone(work.revisions),revision_size:actualRevision.questions.length,outside_per_exam:exams[0].question_count-exams[0].revision_match_count,warnings:['Các đề có thể dùng chung câu; không bảo đảm bộ đề không trùng câu.']});
  }
  return {validateMatrix,shortfall,candidates,plan,generateExam,proposeRevision,generateSet,verifyExam,subjectContext,matrixDigest:digest,jsonDigest:value=>sha256(canonical(value)),fingerprint,contentHash};
});
