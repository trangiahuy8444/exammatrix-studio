/* Saved records live on the server; unfinished exam form choices stay in this browser. */
'use strict';
const C=window.BankCore,$=s=>document.querySelector(s),esc=C.escapeHtml;

function renderLatex(element) {
  if (typeof renderMathInElement === 'function') {
    try {
      renderMathInElement(element || document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option']
      });
    } catch (err) {
      console.warn('[KaTeX] Error rendering math:', err);
    }
  }
}
window.addEventListener('load', () => setTimeout(() => renderLatex(), 100));

const statusNames={draft:'Bản nháp',pending_review:'Chờ duyệt',needs_review:'Cần sửa lại',approved:'Đã duyệt',archived:'Đã lưu trữ'};
const typeNames={MC:'Trắc nghiệm 4 lựa chọn',YN:'Đúng/Sai (4 ý)',SHORT:'Trả lời ngắn',ES:'Tự luận / thực hành'};
const periodNames={TX:'Thường xuyên',GK1:'Giữa học kì I',CK1:'Cuối học kì I',GK2:'Giữa học kì II',CK2:'Cuối học kì II'};
function browserValue(storage,key){try{return window[storage].getItem(key);}catch{return null;}}
function setBrowserValue(storage,key,value){try{window[storage].setItem(key,value);}catch{}}
function loadInitialActiveGrades(){
 try{
  const raw=browserValue('localStorage','exammatrix_active_grades');
  if(raw){
   const arr=JSON.parse(raw);
   if(Array.isArray(arr)){
    const clean=[...new Set(arr.map(Number).filter(g=>g>=6&&g<=12))].sort((a,b)=>a-b);
    if(clean.length)return clean;
   }
  }
 }catch{}
 return [8,9,10];
}
function loadInitialActiveGrade(activeList){
 try{
  const raw=browserValue('localStorage','exammatrix_active_grade');
  if(raw==='all')return 'all';
  const num=Number(raw);
  if(num>=6&&num<=12&&(activeList||[]).includes(num))return num;
 }catch{}
 return (activeList||[]).includes(8)?8:((activeList||[])[0]||8);
}
const _initActiveGrades=loadInitialActiveGrades();
const _initActiveGrade=loadInitialActiveGrade(_initActiveGrades);
const _initNumGrade=typeof _initActiveGrade==='number'?_initActiveGrade:(_initActiveGrades.includes(8)?8:(_initActiveGrades[0]||8));
const store={context:{},bank:null,exams:[],revisions:[],matrices:[],assessmentPlans:[],profile:{active_grades:_initActiveGrades.slice(),default_grade:_initNumGrade},activeGrades:_initActiveGrades.slice(),activeGrade:_initActiveGrade,overviewGradeFilter:String(_initActiveGrade),assessmentPlanGrade:_initNumGrade,assessmentPlanSubject:'Tin học',templates:[],tab:'overview',selected:new Set(),selectedSubject:browserValue('localStorage','exammatrix_active_subject')||(typeof location!=='undefined'&&new URLSearchParams(location.search).get('subject'))||'Tin học',filters:{grade:_initActiveGrade==='all'?'':String(_initActiveGrade),lesson:'',type:'',level:'',section:'',status:'active',search:'',subject:''},page:1,ppctGrade:_initNumGrade,ppctSubject:'Tin học',revisionGrade:_initNumGrade,revisionFilterGrade:String(_initActiveGrade),examFilterGrade:String(_initActiveGrade),examDraft:{grade:_initNumGrade,exam_type:'GK1',template_id:'',revision_id:'',title:'',duration:45,seed:'2026',similarity_percent:90,similarity_mode:'min',blueprint:[]},editing:null,busy:false,testPpctLoaded:false};
window.store=store; // firebase-bridge.js cần đọc/ghi store để cập nhật giao diện sau khi đăng nhập, đăng xuất hoặc khôi phục tệp
const opt=(value,label,selected=false)=>`<option value="${esc(value)}"${selected?' selected':''}>${esc(label)}</option>`;
const badge=q=>{const s=C.reviewStatusOf(q);return `<span class="badge ${esc(s)}">${esc(statusNames[s]||s)}</span>`;};
const courseID=document.querySelector('meta[name="curriculum-id"]')?.content||'';
const apiUrl=path=>C.scopedUrl(path,courseID);
const subject=record=>record?.subject_name||(store.context.curriculum_id?store.context.subject_name:null)||store.selectedSubject||store.context.subject_name||'Tin học';
const grades=()=>C.contextGrades(store.context);
const availableGrades=()=>{
 const ctx=grades();
 const active=Array.isArray(store.activeGrades)&&store.activeGrades.length?store.activeGrades:[8,9,10];
 const filtered=ctx.filter(g=>active.includes(Number(g)));
 return filtered.length?filtered:ctx;
};
const effectiveGrade=()=>{
 const avail=availableGrades();
 if(store.activeGrade!=='all'&&store.activeGrade!==''&&Number(store.activeGrade))return Number(store.activeGrade);
 const cur=Number(store.ppctGrade);
 if(cur&&avail.includes(cur))return cur;
 return avail.includes(8)?8:(avail[0]||grades()[0]||8);
};
const schoolProfile=()=>store.context.school_profile!==false;
const needsSource=(grade,period)=>schoolProfile()&&C.sourceTemplateRequired(grade,period);
const activeGradeOptions=g=>{
 const avail=availableGrades().slice();
 const n=Number(g);
 if(n&&!avail.includes(n)&&grades().includes(n))avail.push(n);
 avail.sort((a,b)=>a-b);
 return avail.map(v=>opt(v,`Khối ${v}`,n===v)).join('');
};
const gradeOptions=g=>activeGradeOptions(g);
const isTechId=id=>/^[A-Z]{1,6}-[0-9a-f-]{12,}$/i.test(String(id||'').trim());
const matrixDisplayName=(v,r)=>{const mid=v?.matrix_id||r?.matrix_id;const rec=mid?(store.matrixRecords||[]).find(m=>m.id===mid):null;return v?.matrix_title||rec?.title||(mid?'Ma trận chuẩn':'Phân bố tự thiết lập');};
function renderSidebarGradeSwitcher(){
 const sel=document.getElementById('sidebar-grade-select');
 const badgeEl=document.getElementById('current-grade-badge');
 const cfgBtn=document.getElementById('btn-config-active-grades');
 if(cfgBtn)cfgBtn.onclick=()=>openGradeConfigDialog();
 const activeVal=store.activeGrade===undefined?'all':store.activeGrade;
 const avail=availableGrades().slice();
 const activeNum=activeVal!=='all'?Number(activeVal):0;
 if(activeNum&&!avail.includes(activeNum)&&grades().includes(activeNum)){
  avail.push(activeNum);
  avail.sort((a,b)=>a-b);
 }
 if(badgeEl){
  badgeEl.textContent=activeVal==='all'?'Tất cả khối':('Khối '+activeVal);
 }
 if(!sel)return;
 sel.innerHTML=avail.map(g=>opt(g,`Khối ${g}`,String(activeVal)===String(g))).join('')+opt('all','Tất cả khối',activeVal==='all');
 sel.value=String(activeVal);
 sel.onchange=e=>{
  const raw=e.target.value;
  setActiveGrade(raw==='all'?'all':Number(raw));
 };
}
function setActiveGrade(nextGrade,opts={}){
 const raw=(nextGrade===''||nextGrade===null||nextGrade===undefined)?'all':nextGrade;
 let next=raw==='all'?'all':Number(raw);
 if(next!=='all'&&(!Number.isFinite(next)||!grades().includes(next)))next=effectiveGrade();
 store.activeGrade=next;
 setBrowserValue('localStorage','exammatrix_active_grade',String(next));
 if(next==='all'){
  store.overviewGradeFilter='all';
  if(store.filters.grade!==''){store.filters.grade='';store.filters.lesson='';store.page=1;}
  if(store.reviewFilters&&store.reviewFilters.grade!==''){store.reviewFilters.grade='';store.reviewFilters.lesson='';store.reviewIndex=0;}
  store.revisionFilterGrade='all';
  store.examFilterGrade='all';
 }else{
  store.overviewGradeFilter=String(next);
  if(String(store.filters.grade)!==String(next)){store.filters.grade=String(next);store.filters.lesson='';store.page=1;}
  if(store.reviewFilters&&String(store.reviewFilters.grade)!==String(next)){store.reviewFilters.grade=String(next);store.reviewFilters.lesson='';store.reviewIndex=0;}
  if(store.ppctGrade!==next)store.ppctGrade=next;
  if(store.assessmentPlanGrade!==next)store.assessmentPlanGrade=next;
  if(store.revisionGrade!==next)store.revisionGrade=next;
  store.revisionFilterGrade=String(next);
  store.examFilterGrade=String(next);
  if(!store.examDraft)store.examDraft={};
  if(Number(store.examDraft.grade)!==next){
   store.examDraft.grade=next;
   store.examDraft.revision_id='';
   store.examDraft.matrix_id='';
   store.examDraft.template_id='';
   store.examDraft.set_counts={};
   store.examDraft.title='';
   if(typeof chooseExamTemplate==='function'&&store.bank)chooseExamTemplate();
  }
  if(store.kttxDraft&&!store.kttxDraft.id)store.kttxDraft.grade=next;
 }
 renderSidebarGradeSwitcher();
 if(!opts.skipRender&&store.bank)renderCurrent();
}
function openGradeConfigDialog(){
 const dlg=document.getElementById('grade-config-dialog');
 const box=document.getElementById('grade-config-checkboxes');
 const form=document.getElementById('grade-config-form');
 if(!dlg||!box||!form)return;
 const current=new Set(availableGrades().map(Number));
 box.innerHTML=grades().map(g=>`<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #D5D9E4;border-radius:8px;cursor:pointer;font-weight:600;background:#fff"><input type="checkbox" name="active-grade" value="${g}"${current.has(g)?' checked':''}><span>Khối ${g}</span></label>`).join('');
 dlg.querySelectorAll('[data-close="grade-config-dialog"]').forEach(b=>{b.onclick=()=>{if(typeof dlg.close==='function')dlg.close();};});
 form.onsubmit=async ev=>{
  ev.preventDefault();
  const picked=[...form.querySelectorAll('input[name="active-grade"]:checked')].map(el=>Number(el.value)).filter(g=>g>=6&&g<=12).sort((a,b)=>a-b);
  if(!picked.length){if(typeof notify==='function')notify('Chọn ít nhất 1 khối lớp đang giảng dạy.',true);return;}
  store.activeGrades=picked;
  setBrowserValue('localStorage','exammatrix_active_grades',JSON.stringify(picked));
  if(store.activeGrade!=='all'&&!picked.includes(Number(store.activeGrade))){
   setActiveGrade(picked[0],{skipRender:true});
  }else if(store.activeGrade==='all'&&!picked.includes(Number(store.ppctGrade))){
   store.ppctGrade=picked[0];store.revisionGrade=picked[0];store.assessmentPlanGrade=picked[0];
   if(store.examDraft)store.examDraft.grade=picked[0];
  }
  const nextProfile={...(store.profile||{}),active_grades:picked.slice(),active_grade:store.activeGrade==='all'?'all':effectiveGrade(),updated_at:new Date().toISOString()};
  store.profile=nextProfile;
  if(typeof dlg.close==='function')dlg.close();
  renderSidebarGradeSwitcher();
  if(store.bank)renderCurrent();
  try{await request('/api/profile/save',{profile:nextProfile});if(typeof notify==='function')notify(`Đã lưu không gian khối: ${picked.map(g=>'Khối '+g).join(', ')}.`);}catch{}
 };
 if(typeof dlg.showModal==='function')dlg.showModal();
}
window.syncProfileFromWorkspace=function(profile){
 if(!profile||typeof profile!=='object')return;
 store.profile=profile;
 if(Array.isArray(profile.active_grades)){
  const clean=[...new Set(profile.active_grades.map(Number).filter(g=>g>=6&&g<=12))].sort((a,b)=>a-b);
  if(clean.length){
   store.activeGrades=clean;
   setBrowserValue('localStorage','exammatrix_active_grades',JSON.stringify(clean));
  }
 }
 const savedLocal=browserValue('localStorage','exammatrix_active_grade');
 const avail=availableGrades();
 const profGrade=profile.active_grade==='all'?'all':Number(profile.active_grade||profile.default_grade);
 if(store.activeGrade!=='all'&&!avail.includes(Number(store.activeGrade))){
  const next=(profGrade&&profGrade!=='all'&&avail.includes(profGrade))?profGrade:avail[0];
  if(next)setActiveGrade(next,{skipRender:true,silent:true});
 }else if(!savedLocal&&(profGrade==='all'||(profGrade&&avail.includes(profGrade)))){
  setActiveGrade(profGrade,{skipRender:true,silent:true});
 }
 renderSidebarGradeSwitcher();
};
function safeLessonOccurrences(occ) {
  if (Array.isArray(occ) && occ.length > 0) {
    return occ.map(o => (typeof o === 'object' && o !== null) ? o : { week_raw: 'Tuần 1', periods_raw: String(o || '1') });
  }
  if (occ && typeof occ === 'object') return [occ];
  if (typeof occ === 'number' || typeof occ === 'string') {
    return [{ week_raw: 'Tuần 1', periods_raw: String(occ || '1') }];
  }
  return [{ week_raw: 'Tuần 1', periods_raw: '1' }];
}
function calcOccurrencesPeriods(occ) {
  const arr = safeLessonOccurrences(occ);
  const matched = arr.flatMap(r => String(r?.periods_raw || '').match(/\d+/g) || []);
  return matched.length || arr.length || 1;
}
function ppctNormalizeTextList(value) {
  const rawItems = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
  const seen = new Set();
  const out = [];
  for (const entry of rawItems) {
    for (const line of String(entry || '').split(/\r?\n/)) {
      const clean = line.trim().replace(/^[-–*•+]\s*/, '').trim();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
    }
  }
  return out;
}
function ppctLessonFields(l) {
  const occArr = Array.isArray(l?.occurrences)
    ? l.occurrences.map(o => (typeof o === 'object' && o !== null) ? o : { week_raw: 'Tuần 1', periods_raw: String(o || '1') })
    : (l?.occurrences && typeof l.occurrences === 'object' ? [l.occurrences] : []);
  const weeks = [];
  const seenW = new Set();
  const pushWeek = (v) => {
    const s = String(v || '').trim();
    if (s && !seenW.has(s)) { seenW.add(s); weeks.push(s); }
  };
  if (l?.week_raw) pushWeek(l.week_raw);
  occArr.forEach(o => pushWeek(o.week_raw));

  let duration = '';
  const topDur = l?.duration_raw ?? l?.num_periods ?? l?.so_tiet;
  if (topDur != null && String(topDur).trim() !== '') {
    duration = String(topDur).trim();
  } else {
    const occDurs = occArr.map(o => String(o?.duration_raw ?? o?.num_periods ?? o?.so_tiet ?? '').trim()).filter(Boolean);
    if (occDurs.length > 0) {
      if (occDurs.every(d => /^\d+$/.test(d))) {
        duration = String(occDurs.reduce((s, d) => s + Number(d), 0));
      } else {
        duration = [...new Set(occDurs)].join(', ');
      }
    } else if (typeof l?.occurrences === 'number') {
      duration = String(l.occurrences);
    } else if (occArr.length > 0) {
      duration = String(calcOccurrencesPeriods(occArr));
    } else {
      duration = '—';
    }
  }

  let ppct = '';
  if (l?.ppct_raw != null && String(l.ppct_raw).trim() !== '') {
    ppct = String(l.ppct_raw).trim();
  } else {
    const explicitPpct = [...new Set(occArr.map(o => String(o?.ppct_raw || '').trim()).filter(Boolean))];
    if (explicitPpct.length > 0) {
      ppct = explicitPpct.join(', ');
    } else {
      const fallbackPeriods = [...new Set(occArr.map(o => String(o?.periods_raw || '').trim()).filter(Boolean))];
      ppct = fallbackPeriods.length ? fallbackPeriods.join(', ') : '—';
    }
  }

  const outcomes = Array.isArray(l?.outcomes)
    ? l.outcomes.map(o => String(o || '').trim()).filter(Boolean)
    : ppctNormalizeTextList(l?.outcomes);

  const compSource = l?.digital_competencies ?? l?.competencies ?? l?.competencies_raw ?? l?.nls_ai ?? [];
  const competencies = ppctNormalizeTextList(compSource);
  for (const o of occArr) {
    for (const c of ppctNormalizeTextList(o?.competencies_raw || '')) {
      if (!competencies.includes(c)) competencies.push(c);
    }
  }

  const rawNotes = l?.notes ?? l?.note ?? l?.notes_raw ?? l?.ghi_chu ?? '';
  let notes = [];
  if (Array.isArray(rawNotes)) {
    notes = rawNotes.map(x => String(x || '').trim()).filter(Boolean);
  } else if (String(rawNotes || '').trim() !== '') {
    notes = String(rawNotes).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  }
  if (!notes.length) {
    for (const o of occArr) {
      const n = String(o?.notes_raw || '').trim();
      if (n && !notes.includes(n)) notes.push(n);
    }
  }

  return {
    weeks,
    weeksHtml: weeks.length ? weeks.map(esc).join('<br>') : '—',
    duration,
    ppct,
    outcomes,
    competencies,
    notes,
    notesText: notes.join('\n')
  };
}
function normalizePpctSection(lessonOrSection, lessonCode = '', lessonName = '', topic = '') {
  const isObj = lessonOrSection && typeof lessonOrSection === 'object';
  const raw = String(isObj ? (lessonOrSection.section || '') : (lessonOrSection || '')).trim().toLowerCase();
  if (['core', 'elective_topic', 'review', 'assessment'].includes(raw)) return raw;
  if (['chuyen_de', 'chuyên đề', 'special_topic', 'elective', 'chuyen_de_hoc_tap', 'cdht'].includes(raw)) return 'elective_topic';
  if (['on_tap', 'ôn tập', 'luyen_tap', 'luyện tập'].includes(raw)) return 'review';
  if (['kiem_tra', 'kiểm tra', 'danh_gia', 'đánh giá', 'periodic'].includes(raw)) return 'assessment';
  const code = String(isObj ? (lessonOrSection.lesson_code || '') : lessonCode).trim();
  const name = String(isObj ? (lessonOrSection.lesson_name_source || lessonOrSection.lesson_name || lessonOrSection.name || '') : lessonName).trim();
  const tp = String(isObj ? (lessonOrSection.topic_source || lessonOrSection.topic || '') : topic).trim();
  if (/^(?:CD|CĐ)\d/i.test(code) || /^\s*Chuyên\s*đề\b/i.test(name) || /chuyên\s*đề\s*học\s*tập|chuyên\s*đề\s*lựa\s*chọn/i.test(tp)) {
    return 'elective_topic';
  }
  if (/^KT(?:GK|CK)[12]$/i.test(code) || /^\s*Kiểm\s*tra\s*(?:giữa|cuối)?\s*h?[kìỳ]/i.test(name)) {
    return 'assessment';
  }
  if (/^(?:OT|LT)(?:_HK[12])?(?:_\d+)?$/i.test(code) || /^\s*(?:Ôn\s*tập|Luyện\s*tập)\b/i.test(name)) {
    return 'review';
  }
  return 'core';
}
function detectPpctOrientation(text = '') {
  const low = String(text || '').trim().toLowerCase().replace(/_/g, ' ');
  if (!low) return '';
  if (low.includes('tin học ứng dụng') || /\bict\b/.test(low)) return 'ICT';
  if (low.includes('khoa học máy tính') || /\bcs\b/.test(low)) return 'CS';
  return '';
}
function expectedNlsLevelForGrade(grade) {
  const g = Number(grade) || 0;
  if (g >= 1 && g <= 5) return g <= 3 ? 'CB1' : 'CB2';
  if (g <= 7) return 'TC1';
  if (g <= 9) return 'TC2';
  return 'NC1';
}
function ppctNumericPeriods(lesson) {
  const occs = Array.isArray(lesson?.occurrences) ? lesson.occurrences : [];
  if (occs.length) {
    let sum = 0;
    let hasExplicitDur = false;
    for (const o of occs) {
      const d = String(o?.duration_raw ?? o?.num_periods ?? o?.so_tiet ?? '').trim();
      if (/^\d+$/.test(d)) {
        sum += Number(d);
        hasExplicitDur = true;
      }
    }
    if (hasExplicitDur) return sum;
  }
  const f = ppctLessonFields(lesson);
  if (/^\d+$/.test(String(f.duration || '').trim())) return Number(f.duration);
  return 0;
}
function validatePpctCompliance(grade, subjectName, items) {
  const g = Number(grade) || 0;
  const subj = String(subjectName || 'Tin học').trim() || 'Tin học';
  const isTin = subj.toLowerCase().includes('tin');
  const list = Array.isArray(items) ? items : [];
  const coreItems = list.filter(l => normalizePpctSection(l) !== 'elective_topic');
  const electiveItems = list.filter(l => normalizePpctSection(l) === 'elective_topic');
  const assessmentItems = list.filter(l => normalizePpctSection(l) === 'assessment');
  const corePeriods = coreItems.reduce((s, l) => s + ppctNumericPeriods(l), 0);
  const electivePeriods = electiveItems.reduce((s, l) => s + ppctNumericPeriods(l), 0);
  const orientations = [...new Set(electiveItems.map(l => {
    const o = String(l.orientation || '').trim();
    return detectPpctOrientation(o) || o || detectPpctOrientation(`${l.topic_source || ''} ${l.lesson_name_source || ''}`);
  }).filter(Boolean))];
  const expectedNls = expectedNlsLevelForGrade(g);
  const wrongNls = [];
  const wrongAi = [];
  for (const l of list) {
    const text = ppctLessonFields(l).competencies.join('\n');
    const nlsMatches = text.match(/\b\d+\.\d+\.(CB\d|TC\d|NC\d)[a-z]?\b/gi) || [];
    for (const m of nlsMatches) {
      const lv = m.split('.')[2]?.slice(0, 3).toUpperCase();
      if (lv && lv !== expectedNls && !wrongNls.includes(m)) wrongNls.push(m);
    }
    const aiMatches = text.match(/\b(\d{1,2})\.[A-D][1-5]\.(?:MR)?\d+\b/g) || [];
    for (const m of aiMatches) {
      const aiGrade = Number(m.split('.')[0]);
      if (g > 0 && aiGrade !== g && !wrongAi.includes(m)) wrongAi.push(m);
    }
  }
  const alerts = [];
  if (list.length > 0) {
    if (isTin && g >= 6 && g <= 9) {
      if (corePeriods === 35) {
        alerts.push({ level: 'ok', text: 'Tổng thời lượng cốt lõi đạt chuẩn 35 tiết/năm (TT 32/2018/TT-BGDĐT Mục VII.2).' });
      } else {
        alerts.push({ level: 'warn', text: `Tổng tiết cốt lõi hiện là ${corePeriods} tiết (chuẩn THCS Tin học: 35 tiết/năm theo TT 32/2018 Mục VII.2 — kiểm tra cột Số tiết kể cả tiết Ôn tập & Kiểm tra định kỳ).` });
      }
    } else if (isTin && g >= 10 && g <= 12) {
      if (corePeriods === 70) {
        alerts.push({ level: 'ok', text: 'Tổng thời lượng cốt lõi đạt chuẩn 70 tiết/năm (TT 32/2018/TT-BGDĐT Mục VII.2).' });
      } else {
        alerts.push({ level: 'warn', text: `Tổng tiết cốt lõi hiện là ${corePeriods} tiết (chuẩn THPT Tin học: 70 tiết/năm theo TT 32/2018 Mục VII.2).` });
      }
    }
    if (g >= 10 && g <= 12) {
      if (!electiveItems.length) {
        alerts.push({ level: 'info', text: `Chưa có Mục II.2 Chuyên đề lựa chọn (Phụ lục I CV 5512). Nếu trường tổ chức cụm Chuyên đề học tập Tin học Khối ${g}, cần đủ 3 chuyên đề = 35 tiết (10–10–15 tiết) theo TT 32/2018.` });
      } else if (electivePeriods === 35) {
        alerts.push({ level: 'ok', text: `Cụm Chuyên đề học tập: ${electiveItems.length} chuyên đề · 35 tiết (đạt chuẩn TT 32/2018; đánh giá theo ĐĐGtx — TT 22/2021 Điều 6.3, không KTĐK GK/CK theo Điều 7.1).` });
      } else {
        alerts.push({ level: 'warn', text: `Chuyên đề học tập hiện có ${electiveItems.length} chuyên đề · ${electivePeriods} tiết. Theo TT 32/2018 (Mục IV.2.1 & VII.2.d), cụm CĐHT trọn vẹn ở THPT gồm 3 chuyên đề = 35 tiết (10–10–15 tiết); nếu chỉ trích dạy tăng cường, giữ ghi chú rõ nguồn.` });
      }
    } else if (g >= 6 && g <= 9 && electiveItems.length > 0) {
      alerts.push({ level: 'warn', text: `Phát hiện ${electiveItems.length} dòng Chuyên đề học tập ở Khối ${g}. Theo Phụ lục I (Mục II.2) CV 5512 và TT 32/2018, cấp THCS không có Chuyên đề học tập lựa chọn.` });
    }
    if (wrongNls.length) {
      alerts.push({ level: 'warn', text: `Mã Năng lực số chưa đúng bậc chuẩn Khối ${g} (${expectedNls} theo Phụ lục CV 3456/BGDĐT-GDPT): ${wrongNls.slice(0, 6).join(', ')}.` });
    }
    if (wrongAi.length) {
      alerts.push({ level: 'warn', text: `Mã Giáo dục AI khác Khối ${g} (Phụ lục QĐ 2422/QĐ-BGDĐT): ${wrongAi.slice(0, 6).join(', ')}.` });
    }
  }
  return {
    grade: g,
    subjectName: subj,
    coreCount: coreItems.length,
    electiveCount: electiveItems.length,
    assessmentCount: assessmentItems.length,
    corePeriods,
    electivePeriods,
    orientations,
    expectedNls,
    alerts
  };
}
function renderPpctComplianceBanner(summary) {
  if (!summary) return '';
  const g = summary.grade;
  const orientLabel = summary.orientations?.length ? summary.orientations.join(', ') : '';
  const badges = [
    `Cấp ${g >= 10 ? 'THPT' : 'THCS'} · Chuẩn NLS: ${summary.expectedNls}`,
    `Cốt lõi: ${summary.coreCount} mục (${summary.corePeriods} tiết)`,
    ...(g >= 10 || summary.electiveCount > 0 ? [`Chuyên đề: ${summary.electiveCount} mục (${summary.electivePeriods} tiết)${orientLabel ? ' · ' + orientLabel : ''}`] : [])
  ];
  const alertsHtml = (summary.alerts || []).length
    ? `<ul class="ppct-compliance-list">${summary.alerts.map(a => `<li class="ppct-alert-${esc(a.level)}">${a.level === 'ok' ? '✓ ' : (a.level === 'warn' ? 'Lưu ý: ' : '')}${esc(a.text)}</li>`).join('')}</ul>`
    : '';
  return `<div class="ppct-compliance-box"><div class="ppct-compliance-chips">${badges.map(b => `<span class="badge">${esc(b)}</span>`).join('')}</div>${alertsHtml}</div>`;
}
const lessons=(g,subj)=>{
  const s=subj||store.selectedSubject||subject();
  let list = [];
  if(store.context.curriculum_id) {
    list = C.courseLessons(store.bank?.ppct?.lessons||[],store.context,g,s);
  } else {
    list = (store.bank?.ppct?.lessons||[]).filter(l=>(!g||Number(l.grade)===Number(g))&&((l.subject_name===s)||(!l.subject_name&&s==='Tin học')));
  }

  // Kiểm tra xem khối này đã bị giáo viên chủ động xóa / tắt không
  const clearedGrades = store.bank?.ppct?.cleared_grades || [];
  const isCleared = (gradeNum) => clearedGrades.includes(Number(gradeNum)) || clearedGrades.includes(`${s}:${gradeNum}`);

  if (g && isCleared(g)) {
    return []; // Khối này đã được giáo viên xóa, không tự động fallback về curricula.js!
  }

  // Tự động kết nối PPCT chuẩn GDPT 2018 nếu ngân hàng chưa nạp PPCT riêng và giáo viên chưa xóa khối này
  if (!list.length && typeof window !== 'undefined' && window.SUBJECT_CURRICULA) {
    const defaultData = window.SUBJECT_CURRICULA[s] || window.SUBJECT_CURRICULA['Tin học'] || {};
    if (g) {
      if (!isCleared(g)) {
        const rawLessons = defaultData[g] || defaultData[String(g)] || [];
        list = rawLessons.map(l => ({
          ...l,
          grade: Number(l.grade || g),
          subject_name: s,
          occurrences: safeLessonOccurrences(l.occurrences)
        }));
      }
    } else {
      const allGrades = Object.keys(defaultData);
      const rawLessons = [];
      for (const gr of allGrades) {
        if (!isCleared(gr)) {
          rawLessons.push(...(defaultData[gr] || []));
        }
      }
      list = rawLessons.map(l => ({
        ...l,
        grade: Number(l.grade),
        subject_name: s,
        occurrences: safeLessonOccurrences(l.occurrences)
      }));
    }
  }
  return list.map(l => ({ ...l, section: normalizePpctSection(l), occurrences: safeLessonOccurrences(l.occurrences) }));
};
function instructionalLessons(g, subj, { includeElective = true } = {}) {
  return lessons(g, subj).filter(l => {
    const sec = normalizePpctSection(l);
    if (sec === 'assessment' || sec === 'review') return false;
    if (!includeElective && sec === 'elective_topic') return false;
    return true;
  });
}
function lessonOptionLabel(l) {
  const sec = normalizePpctSection(l);
  const name = l.lesson_name_source || l.lesson_name || l.name || '';
  return (sec === 'elective_topic' ? '[CĐHT] ' : '') + `${l.lesson_code} · ${name}`;
}
function questionSectionOf(q) {
  const matched = lessons(q?.grade, q?.subject_name).find(l => l.lesson_code === q?.lesson_code);
  return normalizePpctSection(
    q?.ppct_section || matched?.section || '',
    q?.lesson_code || '',
    matched?.lesson_name_source || q?.lesson_name || '',
    matched?.topic_source || q?.topic_source || ''
  );
}
function questionSectionBadge(q) {
  if (questionSectionOf(q) !== 'elective_topic') return '';
  const matched = lessons(q?.grade, q?.subject_name).find(l => l.lesson_code === q?.lesson_code);
  const ori = q?.orientation || matched?.orientation || '';
  return `<span class="badge ppct-tag-elective">CĐHT${ori ? ' · ' + esc(ori) : ''} · chỉ KTTX</span>`;
}
const questions=()=>{
  const all=store.bank?.questions||[];
  const s=subject();
  return all.filter(q=>(q.subject_name===s)||(!q.subject_name&&s==='Tin học'));
};
const inDraftSubject=r=>r.subject_name===subject()||(!r.subject_name&&(Boolean(store.context.curriculum_id)||subject()==='Tin học'));
const currentRevisions=()=>store.revisions.filter(r=>(r.subject_name===subject())||(!r.subject_name&&subject()==='Tin học'));
const currentExams=()=>store.exams.filter(e=>(e.subject_name===subject())||(!e.subject_name&&subject()==='Tin học'));
const filtered=()=>C.filterQuestions(questions(),store.filters);
const countRecord=r=>r.question_count??r.questions?.length??0;
function date(v){if(!v)return 'Chưa ghi thời điểm';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'});}
function title(k,h,p,actions=''){return `<div class="page-head"><div><p class="eyebrow">${esc(k)}</p><h1>${esc(h)}</h1><p>${esc(p)}</p></div>${actions?`<div class="actions">${actions}</div>`:''}</div>`;}
function empty(h,p){return `<div class="empty"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;}
function notify(message,error=false){const el=$('#notice');el.hidden=false;el.className=error?'error':'';el.textContent=message;el.setAttribute('role',error?'alert':'status');if(error)el.scrollIntoView({block:'nearest',behavior:'smooth'});}
function clearNotice(){$('#notice').hidden=true;}
function detailError(e){const details=e.details;if(!details||(typeof details==='object'&&!Array.isArray(details)&&!Object.keys(details).length)||(Array.isArray(details)&&!details.length))return e.message;return e.message+'\n'+(typeof details==='string'?details:JSON.stringify(details,null,2));}
async function request(path,body){
 if (typeof window !== 'undefined' && window.FirebaseClient && window.FirebaseClient.canHandle(path)) {
   return await window.FirebaseClient.handle(path, body);
 }
 const h=body===undefined?{}:C.jsonHeaders(document.querySelector('meta[name="csrf-token"]')?.content);
 const response=await fetch(apiUrl(path),{method:body===undefined?'GET':'POST',headers:h,body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await response.json();}catch{throw new Error('Không đọc được phản hồi từ ứng dụng. Hãy kiểm tra máy chủ cục bộ.');}
 if(!response.ok){const error=new Error(data.error||'Không thực hiện được yêu cầu.');error.details=data.details;throw error;}return data;
}
document.addEventListener('click',async event=>{
 const link=event.target.closest?.('a[href]');
 if(!link||!window.FirebaseClient?.canHandle('/api/state'))return;
 const url=new URL(link.href,location.href);
 if(!/^\/api\/(exams|revisions|matrices)\/.*\/(export|bundle\.zip|mapping\.docx)$/.test(url.pathname)&&!url.pathname.startsWith('/api/bank/export'))return;
 event.preventDefault();event.stopImmediatePropagation();
 try{
  const state=await request('/api/state');
  if(url.pathname==='/api/bank/export'){
   if(store.canViewAnswers===false)throw Error('Tài khoản này không có quyền tải ngân hàng có đáp án.');
   saveStaticFile({bytes:new TextEncoder().encode(JSON.stringify(state.bank,null,2)),mime:'application/json',filename:'Ngan_hang_cau_hoi.json',warnings:[]});return;
  }
  const file=await window.BankStaticDownload.createDownload(url.pathname+url.search,state,{canViewAnswers:store.canViewAnswers,subject:subject()});
  saveStaticFile(file);
 }catch(error){notify(detailError(error),true);}
},true);
function saveStaticFile(file){
 const blob=new Blob([file.bytes],{type:file.mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=file.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 notify('Đã tạo tệp '+file.filename+'.'+(file.warnings?.length?'\n'+file.warnings.join('\n'):''),Boolean(file.warnings?.length));
}
async function mutate(path,body,onSuccess){
 if(store.busy)return;store.busy=true;
 document.querySelectorAll('dialog form button[type=submit],#save-revision,#generate-exam').forEach(b=>b.disabled=true);
 try{const result=await request(path,body);if(result.bank)store.bank=result.bank;if(Array.isArray(result.assessment_plans))store.assessmentPlans=result.assessment_plans;await onSuccess?.(result);return result;}
 catch(e){notify(detailError(e),true);const form=$('#edit-dialog[open] #form-error');if(form){form.hidden=false;form.textContent=detailError(e);}return null;}
 finally{store.busy=false;document.querySelectorAll('dialog form button[type=submit],#save-revision').forEach(b=>b.disabled=false);updateGenerationState();}
}
function examDraftScope(){return {workspace:document.querySelector('meta[name="workspace-scope"]')?.content||(window.FirebaseClient?.canHandle('/api/state')?(window.FirebaseState.user?.uid||'offline'):''),curriculum:store.context.curriculum_id||courseID,subject:subject()};}
function examDraftContext(){const own=inDraftSubject;const allowElective=store.examDraft.exam_type==='TX';return {grades:grades(),lessons:instructionalLessons(store.examDraft.grade,undefined,{includeElective:allowElective}),revisions:store.revisions.filter(own),matrices:(store.matrixRecords||[]).filter(own),templates:store.templates.filter(own)};}
function restoreExamDraft(){
 const scope=examDraftScope();let saved=null;
 try{saved=C.loadExamDraft(window.localStorage,scope,{...examDraftContext(),lessons:grades().flatMap(g=>instructionalLessons(g,undefined,{includeElective:true}))});}catch{}
 store.examDraft=saved||C.cleanExamDraft({grade:store.examDraft.grade},examDraftContext());
 if(!saved)chooseExamTemplate();
 // Validate lesson references against the restored grade, not the previous form's grade.
 store.examDraft=C.cleanExamDraft(store.examDraft,examDraftContext());
 store.examDraftScopeKey=C.examDraftKey(scope);
}
function saveBrowserExamDraft(){
 if(!store.bank)return;
 const scope=examDraftScope(),key=C.examDraftKey(scope);
 if(!key)store.examDraftSaved=false;
 else{
  if(store.examDraftScopeKey!==key)return;
  try{store.examDraftSaved=C.saveExamDraft(window.localStorage,scope,store.examDraft);}catch{store.examDraftSaved=false;}
 }
 const hint=$('#browser-exam-draft');if(hint)hint.textContent=store.examDraftSaved?'Nháp biểu mẫu được lưu trên trình duyệt này.':'Không thể lưu nháp trên trình duyệt này; hãy giữ trang đang mở.';
}
// Save after individual handlers update state, including controls which render the form again.
document.addEventListener('input',event=>{if(event.target.closest?.('#exam-form'))saveBrowserExamDraft();});
document.addEventListener('change',event=>{if(event.target.closest?.('#exam-form'))saveBrowserExamDraft();});
async function load(initial=false){
 $('#refresh').disabled=true;if(initial)$('#loading').hidden=false;
 try{const data=await request('/api/state');store.context=data.context||{};store.bank=data.bank;store.reviewChecklist=data.review_checklist||[];store.canViewAnswers=data.can_view_answers!==false;
 if(Array.isArray(data.assessment_plans))store.assessmentPlans=data.assessment_plans;
 if(data.profile)window.syncProfileFromWorkspace(data.profile);
 if(store.context.curriculum_id){store.selectedSubject=store.context.subject_name;store.ppctSubject=store.context.subject_name;}
 const picker=$('#global-subject-select');if(picker){picker.value=subject();picker.disabled=Boolean(store.context.curriculum_id);}
 if(initial){
  const savedGrade=browserValue('localStorage','exammatrix_active_grade');
  if(!savedGrade&&!data.profile?.active_grade&&!data.profile?.default_grade){
   const uploadedGrades=(store.bank?.ppct?.lessons||[]).map(l=>Number(l.grade)).filter(Boolean);
   const avail=availableGrades();
   const g=uploadedGrades.includes(8)?8:(uploadedGrades.find(x=>avail.includes(x))||effectiveGrade());
   setActiveGrade(g,{skipRender:true,silent:true});
  }else if(typeof store.activeGrade==='number'){
   setActiveGrade(store.activeGrade,{skipRender:true,silent:true});
  }
 }
 store.exams=data.exams||[];store.revisions=data.revisions||[];store.matrixRecords=Array.isArray(data.matrices)?data.matrices:[];store.templates=Array.isArray(data.templates)?data.templates:data.templates?.templates||[];store.selected=new Set([...store.selected].filter(id=>questions().some(q=>q.id===id)));if(initial||store.examDraftScopeKey!==C.examDraftKey(examDraftScope()))restoreExamDraft();else store.examDraft=C.cleanExamDraft(store.examDraft,examDraftContext());if(typeof store.activeGrade==='number'&&store.examDraft&&Number(store.examDraft.grade)!==store.activeGrade){store.examDraft.grade=store.activeGrade;store.examDraft.revision_id='';store.examDraft.matrix_id='';store.examDraft.template_id='';}$('#loading').hidden=true;initGlobalSubject();renderSidebarGradeSwitcher();render();}
 catch(e){$('#loading').hidden=true;notify(e.message,true);if(!store.bank)$('#overview').innerHTML=empty('Chưa mở được ngân hàng','Kiểm tra ứng dụng đang chạy rồi bấm Tải lại dữ liệu.');if(!store.bank)$('#overview').hidden=false;}
 finally{$('#refresh').disabled=false;}
}
function switchTab(tab){
 store.tab=['overview','bank','review','ppct','assessment-plans','revisions','matrices','exams','kttx','knowledge'].includes(tab)?tab:'overview';
 document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==store.tab);
 document.querySelectorAll('[data-tab]').forEach(a=>{if(a.dataset.tab===store.tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 const tabLabels={knowledge:'Bản đồ tri thức',overview:'Hồ sơ kiểm tra',bank:'Ngân hàng câu hỏi',review:'Duyệt câu hỏi',ppct:'Chương trình (PPCT)','assessment-plans':'Kế hoạch kiểm tra, đánh giá',revisions:'Đề cương ôn tập',matrices:'Ma trận và đặc tả',exams:'Đề kiểm tra và mã đề',kttx:'Kiểm tra thường xuyên'};
 const curEl=document.getElementById('current-tab-label');if(curEl)curEl.textContent=tabLabels[store.tab]||'Khảo thí';
 renderKyStepper();
 if(store.bank)renderCurrent();
}
// Thanh 6 bước của kỳ kiểm tra (thiết kế duyệt 25/11/2026), hiện ở màn hình Ma trận, Đề cương, Đề.
function renderKyStepper(){
 const el=document.getElementById('ky-stepper');if(!el)return;
 const show=['matrices','revisions','exams'].includes(store.tab)&&store.bank&&typeof store.activeGrade==='number';
 el.hidden=!show;if(!show){el.innerHTML='';return;}
 const period=store.dossierPeriod||store.examDraft?.exam_type||'GK1';
 const model=C.kyStepperModel({matrices:store.matrixRecords||[],exams:store.exams||[],revisions:store.revisions||[],ppct:store.bank?.ppct},{grade:store.activeGrade,subject:subject(),period,tab:store.tab});
 const periods=[['GK1','Giữa học kì I'],['CK1','Cuối học kì I'],['GK2','Giữa học kì II'],['CK2','Cuối học kì II']];
 el.innerHTML=`<div class="ky-stepper-head"><label for="ky-period">Kỳ kiểm tra</label><select id="ky-period">${periods.map(([c,l])=>`<option value="${c}"${c===model.period?' selected':''}>${l}, ${esc(subject())} ${store.activeGrade}</option>`).join('')}</select></div>
  <ol>${model.steps.map(s=>`<li class="ky-step ky-${s.state}${s.current?' ky-current':''}"><a href="#${s.tab}"${s.current?' aria-current="step"':''}><span class="ky-badge" aria-hidden="true">${s.state==='done'?'✓':s.n}</span><span>${esc(s.label)}</span><span class="ky-sr">${s.state==='done'?' (đã xong)':s.state==='fix'?' (cần sửa)':s.state==='doing'?' (đang làm)':''}</span></a></li>`).join('')}</ol>`;
 const sel=document.getElementById('ky-period');
 if(sel)sel.onchange=()=>{store.dossierPeriod=sel.value;if(store.examDraft)store.examDraft.exam_type=sel.value;if(store.tab==='exams'&&typeof chooseExamTemplate==='function')chooseExamTemplate();renderCurrent();renderKyStepper();};
}
function render(){switchTab(location.hash.slice(1)||store.tab);}
function renderCurrent(){
 ({overview:renderOverview,bank:renderBank,review:renderReview,ppct:renderPPCT,'assessment-plans':renderAssessmentPlans,revisions:renderRevisions,exams:renderExams,kttx:renderKttx,matrices:renderMatrices,knowledge:()=>{if(typeof window.renderKnowledge==='function')window.renderKnowledge();}}[store.tab])();
 setTimeout(() => renderLatex(), 40);
}
function renderReview(){
 const f=store.reviewFilters||(store.reviewFilters={status:'pending_review',grade:store.activeGrade==='all'?'':String(store.activeGrade),lesson:'',level:'',type:'',section:'',origin:''});
 if(f.section===undefined)f.section='';
 const rvGrades=[...new Set([...availableGrades(),...(Number(f.grade)?[Number(f.grade)]:[])])].sort((a,b)=>a-b);
 const all=questions(),queue=C.reviewQueue(all,f);store.reviewIndex=C.stepIndex(store.reviewIndex||0,0,queue.length);
 const unapprovedInScope=C.reviewQueue(all,{...f,status:'all'}).filter(x=>!['approved','archived'].includes(C.reviewStatusOf(x)));
 const q=queue[store.reviewIndex],p=C.reviewProgress(all),items=store.reviewChecklist||[];
 const sel=(id,label,opts,val)=>`<div class="field"><label for="${id}">${label}</label><select id="${id}">${opts.map(([v,t])=>opt(v,t,String(v)===String(val))).join('')}</select></div>`;
 const lessonOpts=[['','Tất cả bài'],...[...new Set(all.filter(x=>!f.grade||String(x.grade)===String(f.grade)).map(x=>x.lesson_code))].sort().map(c=>[c,c])];
 const answer=!q?'':q.type==='MC'?`<ol class="options">${(q.options||[]).map((v,i)=>`<li class="${i===q.correct?'correct':''}">${i===q.correct?'<span class="answer-label">ĐÁP ÁN ĐÚNG</span>':''}<strong>${'ABCD'[i]}.</strong> ${esc(v)}<span class="explanation">${esc(q.option_explanations?.[i]||'Chưa có giải thích.')}</span></li>`).join('')}</ol>`
  :q.type==='YN'?`<ol class="options">${(q.statements||[]).map((st,i)=>`<li class="${st.correct?'correct':''}"><strong>${esc(st.label||'abcd'[i])})</strong> ${esc(st.text)}<span class="answer-label">${st.correct?'ĐÚNG':'SAI'}</span></li>`).join('')}</ol>`
  :q.type==='SHORT'?`<div class="callout"><strong>Đáp án:</strong> ${esc(C.shortAnswerOf(q)||'Chưa có đáp án')}</div>`
  :`<h3>Hướng dẫn chấm</h3><ol class="rubric">${(q.rubric||[]).map(r=>`<li style="white-space:pre-wrap">${esc(r.criterion)} <strong>(${r.points} điểm)</strong></li>`).join('')}</ol><p class="muted">${esc(q.equivalent_answer_policy||'')}</p>`;
 const status=q?C.reviewStatusOf(q):'';
 const history=q&&(q.review_history||[]).length?`<details class="detail-source"><summary>Lịch sử duyệt (${q.review_history.length})</summary>${q.review_history.map(h=>`<p>${esc(h.at?.slice(0,16).replace('T',' ')||'')} · <strong>${esc(h.by||'')}</strong> · ${esc({submit:'Gửi duyệt',approve:'Duyệt',return:'Trả lại',edit_after_approval:'Sửa sau khi duyệt'}[h.action]||h.action)}${h.reason?` — ${esc(h.reason)}`:''}</p>`).join('')}</details>`:'';
 const actions=!q?'':status==='pending_review'?`<fieldset class="review-checklist"><legend>Phiếu kiểm định (bắt buộc xác nhận đủ để duyệt)</legend>${items.map(it=>`<label class="inline-check"><input type="checkbox" data-check-item="${esc(it.key)}"> ${esc(it.label)}</label>`).join('')}</fieldset>
   <div class="field"><label for="review-reason">Lý do trả lại / yêu cầu sửa (bắt buộc khi trả lại)</label><textarea id="review-reason" rows="2"></textarea></div>
   <div class="actions"><button type="button" class="primary" data-review-act="approve">Duyệt (A)</button><button type="button" data-review-act="return">Trả lại (R)</button><button type="button" data-review-act="edit">Sửa (E)</button></div>`
  :['draft','needs_review'].includes(status)?`<div class="actions"><button type="button" class="primary" data-review-act="submit">Gửi duyệt</button><button type="button" data-review-act="edit">Sửa (E)</button></div>`
  :status==='approved'?`<div class="field"><label for="review-reason">Lý do thu hồi duyệt (bắt buộc)</label><textarea id="review-reason" rows="2"></textarea></div><div class="actions"><button type="button" data-review-act="return">Thu hồi duyệt, trả lại (R)</button></div>`:'';
 $('#review').innerHTML=(f.outcome?`<div class="callout">Đang lọc theo YCCĐ: <strong>${esc(f.outcome)}</strong> <button type="button" class="export-link" id="rv-clear-outcome">Bỏ lọc YCCĐ</button></div>`:'')+`<div class="page-head"><div><p class="eyebrow">Kiểm duyệt</p><h1>Duyệt câu hỏi</h1><p>Đã duyệt <strong>${p.approved}</strong>/${p.total} câu · chờ duyệt ${p.pending_review} · cần sửa lại ${p.needs_review} · nháp ${p.draft}</p></div><div class="actions"><button type="button" class="primary" id="rv-bulk-approve"${unapprovedInScope.length?'':' disabled'}>Duyệt nhanh ${unapprovedInScope.length} câu chưa duyệt</button></div></div>
 <div class="card"><div class="filters">${sel('rv-status','Trạng thái',[['pending_review','Chờ duyệt'],['needs_review','Cần sửa lại'],['draft','Bản nháp'],['approved','Đã duyệt'],['all','Tất cả']],f.status)}${sel('rv-grade','Khối',[['','Tất cả'],...rvGrades.map(g=>[g,'Khối '+g])],f.grade)}${sel('rv-lesson','Bài',lessonOpts,f.lesson)}${sel('rv-level','Mức độ',[['','Tất cả'],...C.cognitiveLevels().map(level=>[level,level])],f.level)}${sel('rv-type','Dạng câu',[['','Tất cả'],['MC','Nhiều lựa chọn'],['YN','Đúng/Sai'],['SHORT','Trả lời ngắn'],['ES','Tự luận']],f.type)}${sel('rv-section','Mạch PPCT',[['','Tất cả mạch'],['core','Nội dung cốt lõi (Mục II.1)'],['elective_topic','Chuyên đề học tập (Mục II.2)']],f.section||'')}${sel('rv-origin','Nguồn',[['','Tất cả'],['teacher','Giáo viên'],['ai_gemini','AI (Gemini)'],['expansion','Ngân hàng mở rộng']],f.origin)}</div></div>
 ${q?`<div class="card review-card"><div class="list-toolbar"><span>Câu <strong>${store.reviewIndex+1}</strong>/${queue.length} trong danh sách lọc</span><span class="actions"><button type="button" data-review-act="prev">‹ Trước (K)</button><button type="button" data-review-act="next">Sau (J) ›</button></span></div>
 <div class="q-meta"><span class="badge">Khối ${q.grade} · ${esc(q.lesson_code)} · ${esc(q.level)}</span><span class="badge">${esc(typeNames[q.type]||q.type)}</span>${q.competency ? `<span class="badge" style="background:#FBF4E4;color:#8A5A00;font-weight:700">NL: ${esc(q.competency)}</span>` : ''}${badge(q)}${questionSectionBadge(q)}${String(q.origin||'').startsWith('ai')?'<span class="badge draft">Do AI tạo</span>':''}${isTechId(q.id)?'':`<span class="q-id">${esc(q.id)}</span>`}</div>
 <div class="review-grid"><div><div class="question-text" style="white-space:normal">${C.questionTextHtml(q.question)}</div>${answer}</div><div><div class="callout"><strong>Yêu cầu cần đạt &amp; Năng lực</strong><br>${esc(q.learning_outcome||'Chưa gắn YCCĐ')}${q.competency ? `<br><span class="badge" style="background:#FBF4E4;color:#8A5A00;font-weight:700;margin-top:6px;display:inline-block">NL: ${esc(q.competency)}</span>` : ''}</div>${qualityWarningsHtml(q)}${actions}${history}</div></div></div>`
 :empty('Không còn câu nào trong danh sách này','Đổi bộ lọc hoặc trạng thái để xem các câu khác.')}`;
 [['rv-status','status'],['rv-grade','grade'],['rv-lesson','lesson'],['rv-level','level'],['rv-type','type'],['rv-section','section'],['rv-origin','origin']].forEach(([id,key])=>{$('#'+id).onchange=e=>{f[key]=e.target.value;if(key==='grade'){f.lesson='';store.reviewIndex=0;setActiveGrade(e.target.value||'all');return;}store.reviewIndex=0;renderReview();};});
 $('#review').querySelectorAll('[data-review-act]').forEach(b=>b.onclick=()=>reviewAct(b.dataset.reviewAct));
 const clearOutcome=$('#rv-clear-outcome');if(clearOutcome)clearOutcome.onclick=()=>{f.outcome='';store.reviewIndex=0;renderReview();};
 const bulkApproveBtn=$('#rv-bulk-approve');
 if(bulkApproveBtn)bulkApproveBtn.onclick=async()=>{
  if(!unapprovedInScope.length)return;
  const scopeDesc=f.grade?`Khối ${f.grade}${f.lesson?' · '+f.lesson:''}`:(f.lesson||'tất cả các khối đang lọc');
  if(!confirm(`Xác nhận duyệt nhanh ${unapprovedInScope.length} câu hỏi chưa duyệt (${scopeDesc})?\n\nHệ thống sẽ tự kiểm tra điều kiện kỹ thuật của từng câu trước khi chuyển sang Đã duyệt.`))return;
  await mutate('/api/questions/bulk',{ids:unapprovedInScope.map(x=>x.id),action:'bulk_approve',confirmed:true},res=>{
   const approvedCnt=Number(res.approved_count||0),skippedCnt=Number(res.skipped_count||0);
   const skipNote=skippedCnt?` Bỏ qua ${skippedCnt} câu chưa đủ nội dung kỹ thuật${res.skipped?.[0]?.reason?' ('+res.skipped[0].reason+')':''}.`:'';
   store.reviewIndex=0;
   renderReview();
   notify(`Đã duyệt nhanh ${approvedCnt} câu hỏi (${scopeDesc}).${skipNote}`,approvedCnt===0&&skippedCnt>0);
  });
 };
}
async function reviewAct(action){
 const queue=C.reviewQueue(questions(),store.reviewFilters||{}),q=queue[store.reviewIndex||0];if(!q&&!['next','prev'].includes(action))return;
 if(action==='next'||action==='prev'){store.reviewIndex=C.stepIndex(store.reviewIndex||0,action==='next'?1:-1,queue.length);return renderReview();}
 if(action==='edit')return openEditor(q.id,false);
 const payload={id:q.id,action};
 if(action==='approve'){
  const checklist={};document.querySelectorAll('[data-check-item]').forEach(c=>{checklist[c.dataset.checkItem]=c.checked;});
  const missing=C.checklistMissing(checklist,store.reviewChecklist);
  if(missing.length)return notify(`Chưa xác nhận đủ phiếu kiểm định (${missing.length} mục còn trống).`,true);
  payload.checklist=checklist;
 }
 if(action==='return'){
  payload.reason=($('#review-reason')?.value||'').trim();
  if(!payload.reason)return notify('Khi trả lại phải ghi lý do cần sửa.',true);
 }
 const done=await mutate('/api/questions/review',payload);
 if(done){notify({approve:'Đã duyệt câu.',return:'Đã trả lại câu kèm lý do.',submit:'Đã gửi duyệt.'}[action]||'Đã cập nhật.');renderReview();}
}
document.addEventListener('keydown',e=>{
 if(store.tab!=='review'||e.metaKey||e.ctrlKey||e.altKey||document.querySelector('dialog[open]'))return;
 if(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]'))return;
 const act=C.reviewKeyAction(e.key);if(!act)return;
 const btn=document.querySelector(`#review [data-review-act="${act}"]`);
 if(btn||act==='next'||act==='prev'){e.preventDefault();reviewAct(act);}
});
// B8: kiểm tra thường xuyên theo TT 22/2021, Điều 6 — đầu điểm ghi sổ / cần có (chỉ cảnh báo).
async function renderKttx(){
 const el=$('#kttx');
 try{store.kttx=await request('/api/kttx');}catch(e){el.innerHTML=`<div class="callout error">${esc(e.message)}</div>`;return;}
 const st=store.kttx,forms=Object.fromEntries(st.forms.map(f=>[f.key,f.label])),d=store.kttxDraft||(store.kttxDraft={grade:effectiveGrade(),semester:1,class_name:'',form:'viet',max_score:'10',recorded:true,exam_id:'',lesson_codes:[],orientation:'',note:''});
 const ktOverview=store.activeGrade==='all'?st.overview.filter(r=>availableGrades().includes(Number(r.grade))):st.overview.filter(r=>Number(r.grade)===Number(store.activeGrade));
 const ktActivities=store.activeGrade==='all'?st.activities:st.activities.filter(a=>Number(a.grade)===Number(store.activeGrade));
 d.lesson_codes=Array.isArray(d.lesson_codes)?d.lesson_codes:[];
 d.orientation=d.orientation||'';
 if(Number(d.grade)<10&&d.form==='cum_chuyen_de'){d.form='viet';d.lesson_codes=[];d.orientation='';}
 const k=d.id?d.k:C.nextKttxNumber(st.activities,Number(d.grade),Number(d.semester),d.class_name);
 const txExams=store.exams.filter(e=>e.exam_type==='TX'&&Number(e.grade)===Number(d.grade));
 const electiveList=(st.elective_topics_by_grade&&st.elective_topics_by_grade[String(d.grade)])||[];
 const shownElectives=electiveList.filter(t=>!d.orientation||!t.orientation||t.orientation===d.orientation);
 const chosenCodes=new Set(d.lesson_codes);
 const clusterHtml=Number(d.grade)>=10&&d.form==='cum_chuyen_de'
  ?`<div class="field full kttx-cluster-box">
     <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <strong>Cụm Chuyên đề học tập THPT (TT 22/2021 · Điều 6.3)</strong>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
       <label for="kt-orientation" class="small">Định hướng:</label>
       <select id="kt-orientation" style="min-width:165px">${opt('','Tất cả / dùng chung',!d.orientation)}${opt('ICT','Tin học ứng dụng (ICT)',d.orientation==='ICT')}${opt('CS','Khoa học máy tính (CS)',d.orientation==='CS')}</select>
       ${shownElectives.length?`<button type="button" class="export-link" id="kt-select-all-cd">Chọn cả cụm chuyên đề</button>`:''}
      </div>
     </div>
     ${shownElectives.length
      ?`<div class="kttx-lesson-chips">${shownElectives.map(t=>`<label class="kttx-lesson-chip"><input type="checkbox" data-kt-lesson="${esc(t.lesson_code)}"${chosenCodes.has(t.lesson_code)?' checked':''}> <span><strong>${esc(t.lesson_code)}</strong> · ${esc(t.lesson_name_source||t.lesson_code)}${t.orientation?` (${esc(t.orientation)})`:''}${t.duration_raw?` · ${esc(t.duration_raw)} tiết`:''}</span></label>`).join('')}</div>`
      :`<p class="small muted" style="margin:4px 0 0">Chưa có bài Chuyên đề học tập trong PPCT Khối ${d.grade}. Thầy/Cô có thể mở mục <a href="#ppct">PPCT</a> để nạp Mục II.2 trước.</p>`}
    </div>`
  :`<div class="field full"><details><summary class="small" style="cursor:pointer;font-weight:600">Gắn bài học PPCT liên quan (${chosenCodes.size} bài đang chọn · tùy chọn)</summary><div class="kttx-lesson-chips" style="margin-top:8px">${instructionalLessons(d.grade,undefined,{includeElective:Number(d.grade)>=10}).map(l=>`<label class="kttx-lesson-chip"><input type="checkbox" data-kt-lesson="${esc(l.lesson_code)}"${chosenCodes.has(l.lesson_code)?' checked':''}> <span>${esc(lessonOptionLabel(l))}</span></label>`).join('')||'<span class="small muted">Chưa có bài PPCT khối này.</span>'}</div></details></div>`;
 el.innerHTML=`<div class="page-head"><div><p class="eyebrow">TT 22/2021 · Điều 6</p><h1>Kiểm tra thường xuyên</h1><p>Số điểm đánh giá thường xuyên (ĐĐGtx) cần ghi sổ mỗi học kì theo số tiết/năm của môn: 35 tiết → 2; trên 35 đến 70 → 3; trên 70 → 4. Hoạt động KTTX không giới hạn; thầy/cô chọn hoạt động nào ghi sổ. Ở THPT, kết quả cụm chuyên đề học tập tính thêm 01 lần ĐGtx (khoản 3).</p></div></div>
 <div class="card"><h2>Tổng quan đầu điểm</h2><div class="table-wrap"><table><thead><tr><th>Khối</th><th>Lớp</th><th>Học kì</th><th>Số tiết/năm</th><th>Chọn ghi sổ / cần có</th><th>Cụm chuyên đề</th><th>Hoạt động</th><th>Ghi chú</th></tr></thead><tbody>${ktOverview.map(r=>`<tr><td>${r.grade}</td><td>${esc(r.class_name||'Tất cả lớp')}</td><td>HK ${r.semester===1?'I':'II'}</td><td>${r.periods_per_year??'—'}</td><td><span class="badge ${r.ok?'approved':'draft'}">${r.recorded} / ${r.required??'?'}</span></td><td>${r.grade>=10?(r.cluster_recorded||0):'—'}</td><td>${r.activities}</td><td class="small">${esc(r.message)}</td></tr>`).join('')}</tbody></table></div><p class="small muted">Bảng chỉ cảnh báo, không chặn việc tạo đề hay lưu hoạt động.</p></div>
 <div class="two-col"><div class="card"><h2>${d.id?'Sửa':'Thêm'} hoạt động ${esc(`TX${k}-HK${d.semester}`)}</h2><div class="form-grid">
  <div class="field"><label for="kt-grade">Khối</label><select id="kt-grade"${d.id?' disabled':''}>${gradeOptions(d.grade)}</select></div>
  <div class="field"><label for="kt-sem">Học kì</label><select id="kt-sem"${d.id?' disabled':''}>${opt(1,'HK I',Number(d.semester)===1)}${opt(2,'HK II',Number(d.semester)===2)}</select></div>
  <div class="field"><label for="kt-class">Lớp (để trống = tất cả lớp)</label><input id="kt-class" value="${esc(d.class_name)}"${d.id?' disabled':''}></div>
  <div class="field"><label for="kt-form">Hình thức</label><select id="kt-form">${st.forms.filter(f=>!f.min_grade||Number(d.grade)>=f.min_grade).map(f=>opt(f.key,f.label,f.key===d.form)).join('')}</select></div>
  <div class="field"><label for="kt-max">Thang điểm tối đa</label><input id="kt-max" inputmode="decimal" value="${esc(String(d.max_score).replace('.',','))}"></div>
  <div class="field"><label for="kt-exam">Đề TX gắn kèm (nếu có)</label><select id="kt-exam">${opt('','— Không gắn đề —',!d.exam_id)}${txExams.map(e=>opt(e.id,e.title,e.id===d.exam_id)).join('')}</select></div>
  <div class="field"><label for="kt-raw-score">Quy đổi nhanh về thang 10</label><input id="kt-raw-score" inputmode="decimal" placeholder="Nhập điểm đạt được…"></div>
  <div class="field"><label>Điểm ghi sổ (làm tròn nguyên)</label><div id="kt-converted-score" class="small muted" style="padding:8px 0">Nhập điểm đạt để quy đổi</div></div>
  ${clusterHtml}
  <div class="field full"><label class="inline-check"><input type="checkbox" id="kt-recorded"${d.recorded?' checked':''}> Chọn kết quả hoạt động này làm ĐĐGtx ghi vào sổ</label></div>
  <div class="field full"><label for="kt-note">Ghi chú</label><input id="kt-note" value="${esc(d.note||'')}"></div></div>
  <p class="small muted">Tên hồ sơ: <strong>${esc(st.activities.find(a=>a.id===d.id)?.title||`${(store.context.subject_name||'Tin học')==='Tin học'?'Tin':store.context.subject_name} ${d.grade}_Kiểm tra thường xuyên ${k} - HK ${Number(d.semester)===1?'I':'II'}`)}</strong>. Điểm quy đổi về thang 10 và làm tròn đến số nguyên (quy ước tổ cho bài thường xuyên).</p>
  <div class="actions"><button type="button" class="primary" id="kt-save">${d.id?'Lưu thay đổi':'Thêm hoạt động'}</button>${d.id?'<button type="button" id="kt-cancel">Hủy sửa</button>':''}</div></div>
 <div class="card"><h2>Hoạt động đã lên kế hoạch (${ktActivities.length})</h2>${ktActivities.length?ktActivities.map(a=>`<article class="saved-item"><div><h3>${esc(a.title)}${a.class_name?' · '+esc(a.class_name):''}</h3><p>${esc(a.code)} · ${esc(forms[a.form]||a.form)} · thang ${esc(String(a.max_score).replace('.',','))} điểm · ${a.recorded?'<strong>ghi sổ</strong>':'không ghi sổ'}${a.exam_id?' · có đề gắn kèm':''}</p>${(Array.isArray(a.lesson_codes)&&a.lesson_codes.length)||a.orientation?`<div class="kttx-lesson-chips" style="margin:6px 0">${a.orientation?`<span class="badge ppct-tag-elective">${esc(a.orientation)}</span>`:''}${(a.lesson_codes||[]).map(c=>`<span class="badge">${esc(c)}</span>`).join('')}</div>`:''}${a.note?`<p class="small muted">${esc(a.note)}</p>`:''}</div><div class="actions"><button type="button" class="export-link" data-kt-edit="${esc(a.id)}">Sửa</button><button type="button" class="export-link danger" data-kt-del="${esc(a.id)}">Xóa</button></div></article>`).join(''):empty('Chưa có hoạt động KTTX','Thêm hoạt động đầu tiên ở khung bên trái.')}</div></div>`;
 const read=()=>{
  const checkedLessons=[...el.querySelectorAll('[data-kt-lesson]:checked')].map(c=>c.dataset.ktLesson);
  const oriEl=$('#kt-orientation');
  Object.assign(d,{grade:Number($('#kt-grade').value),semester:Number($('#kt-sem').value),class_name:$('#kt-class').value.trim(),form:$('#kt-form').value,max_score:$('#kt-max').value.trim().replace(',','.'),exam_id:$('#kt-exam').value,recorded:$('#kt-recorded').checked,note:$('#kt-note').value,orientation:oriEl?oriEl.value:(d.orientation||''),lesson_codes:checkedLessons});
 };
 const updateScorePreview=()=>{
  const rawEl=$('#kt-raw-score'),outEl=$('#kt-converted-score');
  if(!rawEl||!outEl)return;
  const raw=rawEl.value.trim();
  if(!raw){outEl.className='small muted';outEl.textContent='Nhập điểm đạt để quy đổi';return;}
  try{
   const val=C.convertKttxScoreTo10(raw,$('#kt-max').value.trim()||'10');
   outEl.className='small';outEl.innerHTML=`<strong>${val} / 10</strong> điểm ĐĐGtx`;
  }catch(err){outEl.className='small';outEl.style.color='#C62828';outEl.textContent=err.message;}
 };
 if($('#kt-raw-score'))$('#kt-raw-score').oninput=updateScorePreview;
 if($('#kt-max'))$('#kt-max').oninput=updateScorePreview;
 ['kt-grade','kt-sem','kt-class','kt-form','kt-orientation'].forEach(id=>{if($('#'+id))$('#'+id).onchange=()=>{read();if(id==='kt-grade'&&!d.id){setActiveGrade(Number(d.grade));return;}renderKttx();};});
 el.querySelectorAll('[data-kt-lesson]').forEach(c=>{c.onchange=()=>{read();};});
 if($('#kt-select-all-cd'))$('#kt-select-all-cd').onclick=()=>{el.querySelectorAll('.kttx-cluster-box [data-kt-lesson]').forEach(c=>{c.checked=true;});read();renderKttx();};
 $('#kt-save').onclick=async()=>{read();const payload={...d,k:d.id?d.k:C.nextKttxNumber(st.activities,d.grade,d.semester,d.class_name),exam_id:d.exam_id||null,lesson_codes:d.lesson_codes||[],orientation:d.orientation||''};
  const done=await mutate('/api/kttx/save',{activity:payload});if(done){store.kttxDraft=null;notify(`Đã lưu ${done.activity.title}.`);renderKttx();}};
 const cancel=$('#kt-cancel');if(cancel)cancel.onclick=()=>{store.kttxDraft=null;renderKttx();};
 el.querySelectorAll('[data-kt-edit]').forEach(b=>b.onclick=()=>{const act=st.activities.find(a=>a.id===b.dataset.ktEdit);if(!act)return;store.kttxDraft={...act,lesson_codes:[...(act.lesson_codes||[])],orientation:act.orientation||'',exam_id:act.exam_id||''};renderKttx();});
 el.querySelectorAll('[data-kt-del]').forEach(b=>b.onclick=async()=>{const a=st.activities.find(x=>x.id===b.dataset.ktDel);if(!a||!confirm(`Xóa ${a.title}?`))return;const done=await mutate('/api/kttx/delete',{id:a.id});if(done){notify('Đã xóa hoạt động KTTX.');renderKttx();}});
}
function renderOverview(){
 const s=subject();
 const qs=questions(),active=qs.filter(q=>q.review_status!=='archived'),ready=active.filter(q=>q.review_status==='approved');
 const revs=currentRevisions(), exms=currentExams();
 const ovGrade=store.activeGrade==='all'?'all':String(store.activeGrade||store.overviewGradeFilter||'all');
 const shownGrades=ovGrade==='all'?availableGrades():grades().filter(g=>String(g)===String(ovGrade));
 const ovQs=ovGrade==='all'?qs:qs.filter(q=>Number(q.grade)===Number(ovGrade));
 const ovActive=ovQs.filter(q=>q.review_status!=='archived');
 const ovReady=ovActive.filter(q=>q.review_status==='approved');
 const ovRevs=ovGrade==='all'?revs:revs.filter(r=>Number(r.grade)===Number(ovGrade));
 const ovExms=ovGrade==='all'?exms:exms.filter(e=>Number(e.grade)===Number(ovGrade));
 const archivedCount = ovQs.filter(q => q.review_status === 'archived').length;
 const showArchivedBanner = ovActive.length === 0 && archivedCount > 0;

 const bannerHtml = showArchivedBanner ? `
  <div class="card" style="background:#F2F0FB;border:2px solid #A99FE0;border-radius:12px;padding:16px 20px;margin-bottom:18px;box-shadow:0 4px 14px rgba(59,130,246,0.12)">
    <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">
      
      <div style="flex:1;min-width:280px">
        <h3 style="margin:0 0 6px;color:#3A2D8A;font-size:16px;font-weight:700">
          Dữ liệu của Thầy/Cô vẫn an toàn 100%! Có ${archivedCount} câu hỏi môn ${esc(s)} đang ở mục "Lưu trữ"
        </h3>
        <p style="margin:0 0 12px;font-size:13px;color:#4A3AA8;line-height:1.5">
          Toàn bộ <strong>${archivedCount} câu hỏi</strong> không hề bị mất, chỉ là đang được gắn trạng thái <em>Lưu trữ (Archived)</em> nên bộ lọc mặc định trên trang Tổng quan tạm thời chưa hiển thị. Thầy/Cô có thể bấm nút dưới đây để khôi phục đưa vào sử dụng ngay:
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <button type="button" class="button primary" id="btn-unarchive-all-questions" style="background:#4A3AA8;border-color:#4A3AA8;color:#fff;font-weight:700;padding:8px 18px">
            Khôi phục toàn bộ ${archivedCount} câu hỏi đưa vào sử dụng
          </button>
          <a class="button" href="#bank" id="btn-go-archived-bank" style="font-weight:600;background:#fff;border:1px solid #D5D9E4">
            Mở Ngân hàng xem danh sách câu hỏi lưu trữ →
          </a>
        </div>
      </div>
    </div>
  </div>
 ` : '';

 const displayQCount = ovActive.length > 0 ? ovActive.length : archivedCount;
 const qCountLabel = ovActive.length > 0 ? `Câu hỏi môn ${esc(s)}` : `Câu hỏi môn ${esc(s)} (Lưu trữ)`;
 const qCountDetail = ovActive.length > 0
   ? `${ovActive.filter(q=>q.type==='MC').length} trắc nghiệm · ${ovActive.filter(q=>q.type==='ES').length} tự luận`
   : `${archivedCount} câu đang lưu trữ — Bấm nút bên dưới để khôi phục`;

 // Trang chủ "Hồ sơ kiểm tra" (thiết kế duyệt 25/11/2026): bìa hồ sơ 6 thành phần cho từng kỳ, việc cần xử lí, ngân hàng.
 const tick='<svg class="pen-tick" viewBox="0 0 40 34" role="img" aria-label="Đã xong"><path d="M6 19c3 2.5 6 5.5 8.5 9 5-10 11.5-18 20-24" transform="rotate(-4 20 17)"></path></svg>';
 const slotHtml=x=>x.state==='done'?tick
  :x.state==='fix'?`<span class="dossier-fix" title="${esc(x.note)}"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M12 7v6M12 16.5v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path></svg><span>${esc(x.note||'Cần sửa')}</span></span>`
  :x.state==='doing'?`<span class="dossier-doing" role="img" aria-label="Đang làm${x.note?': '+esc(x.note):''}"></span>${x.note?`<span class="dossier-note">${esc(x.note)}</span>`:''}`
  :'<span class="dossier-todo" role="img" aria-label="Chưa làm"></span>';
 const dataForDossier={matrices:store.matrixRecords||[],exams:store.exams||[],revisions:store.revisions||[]};
 const dossierGrades=ovGrade==='all'?shownGrades:[Number(ovGrade)];
 const dossiers=dossierGrades.map(g=>({grade:g,periods:C.dossierStatus(dataForDossier,{grade:g,subject:s})}));
 const dossierHtml=dossiers.map(d=>`<section class="dossier" aria-labelledby="dossier-${d.grade}">
   <h2 id="dossier-${d.grade}">Kiểm tra định kì, ${esc(s)} ${d.grade}</h2>
   <div class="table-wrap"><table class="dossier-table"><thead><tr><th scope="col">Kỳ kiểm tra</th>${d.periods[0].slots.map(x=>`<th scope="col">${esc(x.label)}</th>`).join('')}<th scope="col" class="dossier-next-h">Việc tiếp theo</th></tr></thead>
   <tbody>${d.periods.map(p=>`<tr><th scope="row"><span class="dossier-period">${esc(p.label)}</span>${p.meta?`<span class="dossier-meta">${esc(p.meta)}</span>`:''}</th>${p.slots.map(x=>`<td>${slotHtml(x)}</td>`).join('')}<td class="dossier-next">${p.next?`<a class="button${p.slots.some(x=>x.state==='fix')||p.slots.some(x=>x.state!=='todo')?' primary':''}" href="#${p.next.tab}" data-dossier-grade="${d.grade}" data-dossier-period="${p.code}">${esc(p.next.label)}</a>`:'<span class="dossier-complete">Đủ hồ sơ</span>'}</td></tr>`).join('')}</tbody></table></div>
  </section>`).join('');
 const issues=dossiers.flatMap(d=>d.periods.flatMap(p=>p.issues.map(i=>({...i,label:p.label,grade:d.grade}))));
 const reviewWaiting=ovActive.filter(q=>['pending_review','content_checked','draft','needs_review'].includes(q.review_status)).length;
 $('#overview').innerHTML=(!qs.length?`<div class="card"><h2>Bắt đầu với môn ${esc(s)}</h2><p class="muted">Ba bước đầu tiên: nhập phân phối chương trình, đưa câu hỏi vào ngân hàng, rồi mở kỳ kiểm tra để lập ma trận.</p><div class="actions"><a class="button primary" href="#ppct">Nhập phân phối chương trình</a><a class="button" href="#bank">Nhập câu hỏi</a></div></div>`:'')+
 `<div class="page-head"><div><h1>Hồ sơ kiểm tra</h1><p>Mỗi kỳ kiểm tra cần đủ sáu thành phần để nộp tổ. Dấu tích đỏ là phần đã xong.</p></div></div>`+
 bannerHtml+dossierHtml+
 `<div class="two-col dossier-side">
   <section class="card"><h2>Cần xử lí trước khi duyệt</h2>${issues.length?`<ul class="dossier-issues">${issues.slice(0,8).map(i=>`<li><span><strong>${esc(i.label)}, khối ${i.grade}.</strong> ${esc(i.text)}</span><a href="#exams" data-open-exam="${esc(i.exam_id)}">Mở đề</a></li>`).join('')}</ul>`:'<p class="muted">Chưa có đề nào cần sửa. Kết quả kiểm định của từng đề hiện ở đây.</p>'}</section>
   <section class="card"><h2>Ngân hàng câu hỏi ${ovGrade==='all'?'':'khối '+esc(ovGrade)}</h2><p class="muted">Chỉ câu đã duyệt mới được dùng cho đề chính thức.</p>
    <div class="dossier-stats"><div><strong>${ovReady.length}</strong><span>câu đã duyệt</span></div><div><strong class="${reviewWaiting?'dossier-alert':''}">${reviewWaiting}</strong><span>câu chưa duyệt</span></div><div><strong>${ovRevs.length}</strong><span>đề cương</span></div><div><strong>${ovExms.length}</strong><span>đề kiểm tra</span></div></div>
    <div class="actions">${reviewWaiting?`<a class="button primary" href="#review">Duyệt ${reviewWaiting} câu</a>`:''}<a class="button" href="#bank">Mở ngân hàng</a></div>
   </section>
  </div>`;
 document.querySelectorAll('#overview [data-dossier-period]').forEach(a=>a.addEventListener('click',()=>{const g=Number(a.dataset.dossierGrade);if(g&&g!==Number(store.activeGrade))setActiveGrade(g,{skipRender:true,silent:true});store.examDraft.exam_type=a.dataset.dossierPeriod;store.dossierPeriod=a.dataset.dossierPeriod;}));
 document.querySelectorAll('#overview [data-open-exam]').forEach(a=>a.addEventListener('click',()=>{store.examSubTab='saved';store.activeExamViewId=a.dataset.openExam;}));
 const ovSel=$('#overview-grade-select');
 if(ovSel)ovSel.onchange=e=>{setActiveGrade(e.target.value||'all');};

 const btnUnarchive = $('#btn-unarchive-all-questions');
 if (btnUnarchive) {
   btnUnarchive.onclick = async () => {
     btnUnarchive.disabled = true;
     btnUnarchive.textContent = '⏳ Đang khôi phục...';
     const targetIds = ovQs.filter(q => q.review_status === 'archived').map(q => q.id);
     try {
       await mutate('/api/questions/bulk', { ids: targetIds, action: 'restore_all', status: 'approved' }, () => {
         notify(`Đã khôi phục thành công toàn bộ ${targetIds.length} câu hỏi đưa vào sử dụng!`);
         render();
       });
     } catch (err) {
       for (const q of qs) {
         if (q.review_status === 'archived') {
           q.review_status = 'approved';
           delete q.archived_at;
         }
       }
       if (store.bank) store.bank.questions = qs;
       notify(`Đã khôi phục thành công toàn bộ ${targetIds.length} câu hỏi đưa vào sử dụng!`);
       render();
     }
   };
 }
 const btnGoArchived = $('#btn-go-archived-bank');
 if (btnGoArchived) {
   btnGoArchived.onclick = () => {
     store.filters.status = 'archived';
   };
 }
}
  function nlsCodeForGrade(g) {
    return g >= 10 ? 'NC1 (TT 02/2025 · THPT)' : (g >= 8 ? 'TC2 (TT 02/2025 · THCS 8–9)' : 'TC1 (TT 02/2025 · THCS 6–7)');
  }
  function triggerTextDownload(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function copyTextWithFallback(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => alert(okMsg)).catch(() => window.prompt('Sao chép Prompt AI dưới đây:', text));
    } else {
      window.prompt('Sao chép Prompt AI dưới đây:', text);
    }
  }
  function qualityWarningsHtml(q) {
    const list = (C && typeof C.questionQualityWarnings === 'function') ? C.questionQualityWarnings(q) : [];
    if (!list.length) return '';
    return `<div class="callout warning" data-quality-warnings="${list.length}" style="margin-top:10px;border-left:4px solid #8A5A00;background:#F3F4F8;color:#8A5A00"><strong>Gợi ý chất lượng câu hỏi (CV 7991/6569 — chỉ cảnh báo, không chặn lưu/duyệt)</strong><ul style="margin:6px 0 0 18px;padding:0">${list.map(w => `<li>${esc(w.message)}</li>`).join('')}</ul></div>`;
  }
  function subjectCompetencyGuideText(subjName) {
    const s = String(subjName || subject() || 'Tin học').trim();
    const catApi = (typeof window !== 'undefined' && window.BankCompetencyCatalog) ? window.BankCompetencyCatalog : null;
    const preset = catApi && typeof catApi.presetCatalogForSubject === 'function' ? catApi.presetCatalogForSubject(s) : null;
    if (!preset) {
      return `BẢNG THÀNH PHẦN NĂNG LỰC & CHỈ BÁO MÔN ${s.toLocaleUpperCase('vi')} (GDPT 2018 — TT 32/2018/TT-BGDĐT):\n- Bám sát các thành phần năng lực đặc thù và yêu cầu cần đạt của môn ${s} theo Chương trình GDPT 2018 (hoặc bảng mã hóa chỉ báo riêng của tổ chuyên môn đã nạp trong mục Ma trận & đặc tả).`;
    }
    const compLines = (preset.competencies || []).map(c => `  * ${c.code}: ${c.name}`).join('\n');
    const indLines = (preset.indicators || []).slice(0, 8).map(i => `  * ${i.code} (${i.competency}): ${i.text}`).join('\n');
    return `BẢNG THÀNH PHẦN NĂNG LỰC & CHỈ BÁO MÔN ${s.toLocaleUpperCase('vi')} (${preset.label}):\n- Thành phần năng lực đặc thù:\n${compLines}\n- Chỉ báo hành vi tiêu biểu (ưu tiên bảng riêng của Tổ chuyên môn nếu đã nạp trên hệ thống):\n${indLines}`;
  }
  function cv7991QuestionRulesBlock(grade = 9, subjName, examType = 'GK1') {
    const g = Number(grade) || 9;
    const isThpt = g >= 10;
    const s = String(subjName || subject() || 'Tin học').trim();
    const isInformatics = /tin\s*h[oọ]c/i.test(s);
    const thptFormats = isThpt ? `
4. CÂU TRẮC NGHIỆM ĐÚNG/SAI (YN — 4 ý a, b, c, d theo CV 7991 & QĐ 764/QĐ-BGDĐT):
   - Mỗi câu gồm 01 đoạn dẫn/ngữ liệu chung rõ ràng (>= 25 kí tự) và 04 mệnh đề đơn độc lập a), b), c), d) sắp xếp tăng dần mức độ nhận thức (Biết -> Hiểu -> Vận dụng).
   - Không để cả 4 mệnh đề cùng Đúng hoặc cùng Sai; các mệnh đề không trùng lặp hoặc gợi ý đáp án cho nhau.
   - Quy tắc chấm QĐ 764: đúng 1 ý = 0,1đ; đúng 2 ý = 0,25đ; đúng 3 ý = 0,5đ; đúng 4 ý = 1,0đ.
5. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN (SHORT — CV 7991 & QĐ 764/QĐ-BGDĐT):
   - Đáp án phải là giá trị duy nhất, gọn nhẹ, KHÔNG ghi kèm đơn vị tính hay câu văn dài trong ô đáp án.
   - Câu dẫn phải ghi rõ đơn vị tính và quy ước làm tròn số (ví dụ: làm tròn đến hàng phần mười); với chuẩn phiếu THPT QĐ 764, đáp án số tối đa 4 kí tự (gồm chữ số, dấu "-", dấu ",").` : '';
    const informaticsNote = isInformatics
      ? `\n- Tích hợp Năng lực số (Thông tư 02/2025/TT-BGDĐT): bậc ${nlsCodeForGrade(g)}; lồng ghép Giáo dục AI (QĐ 2422/QĐ-BGDĐT) ở các bài phù hợp.${isThpt ? ' Với Tin học THPT, phân biệt rõ định hướng Tin học ứng dụng (ICT) và Khoa học máy tính (CS).' : ''}`
      : `\n- Tích hợp năng lực số (TT 02/2025 bậc ${nlsCodeForGrade(g)}) phù hợp đặc thù môn ${s}.`;
    return `QUY CHUẨN NGHIÊM NGẶT VỀ CÂU HỎI KIỂM TRA ĐÁNH GIÁ (CV 7991/BGDĐT-GDTrH ngày 17/12/2024 & Bảng yêu cầu kĩ thuật tập huấn CV 6569/BGDĐT-GDTrH):
1. YÊU CẦU CHUNG ĐỐI VỚI CÂU HỎI TNKQ (1.a — 11 tiêu chí):
   - Đánh giá nội dung và kết quả học tập quan trọng theo đúng mục tiêu KTĐG và Yêu cầu cần đạt (YCCĐ) của chương trình GDPT 2018.
   - Mỗi câu chỉ tập trung vào 01 vấn đề duy nhất; các câu hỏi hoàn toàn độc lập, không lộ gợi ý đáp án giữa các câu trong đề.
   - Tuyệt đối không có sai sót chuyên môn; phù hợp thuần phong mỹ tục; thống nhất kí hiệu, đơn vị và thuật ngữ khoa học.
   - Câu hỏi phải mới, không sử dụng lại nguyên câu đã thi, KHÔNG sao chép nguyên dạng câu/đoạn từ SGK, tài liệu tham khảo hay nguồn đã công bố.
   - Khai thác tối đa câu hỏi vận dụng kiến thức giải quyết tình huống thực tiễn; tránh câu hỏi khôi hài hoặc tình huống phi thực tế.
2. YÊU CẦU ĐỐI VỚI CÂU DẪN TNKQ (1.b — 9 tiêu chí):
   - Đặt câu hỏi trực tiếp hoặc nêu vấn đề cụ thể, không trích nguyên văn câu trong SGK; từ ngữ, cấu trúc rõ ràng, dễ hiểu, đơn nghĩa để học sinh biết chính xác nhiệm vụ cần làm; tránh dài dòng.
   - Ưu tiên dạng câu hỏi trực tiếp hơn dạng câu hoàn chỉnh/điền khuyết; nếu dùng câu hoàn chỉnh thì TUYỆT ĐỐI KHÔNG đặt chỗ trống (____ / ...) ở đầu hoặc giữa câu dẫn.
   - Ưu tiên trình bày ở thể khẳng định; nếu buộc phải dùng thể phủ định thì BẮT BUỘC nhấn mạnh từ phủ định bằng **IN HOA / IN ĐẬM** (ví dụ: **KHÔNG**, **NGOẠI TRỪ**) và TUYỆT ĐỐI tránh phủ định kép.
   - Đúng mức độ nhận thức ma trận quy định theo CV 7991 (3 mức chuẩn: Biết – Hiểu – Vận dụng; chỉ tách Vận dụng cao khi hồ sơ riêng của tổ yêu cầu).
3. YÊU CẦU ĐỐI VỚI PHƯƠNG ÁN LỰA CHỌN MC (1.c — 16 tiêu chí):
   - Duy nhất 01 phương án đúng hoặc chính xác nhất, độc lập giữa các câu; cân nhắc kỹ khi dùng cặp phương án trái ngược/phủ định nhau.
   - Bốn phương án A, B, C, D phải đồng nhất về nội dung, ý nghĩa với câu dẫn và đồng nhất về hình thức, cấu trúc ngữ pháp, độ dài tương đương nhau (không viết phương án đúng dài hoặc chi tiết vượt trội làm lộ đáp án); tránh lặp lại cùng một cụm từ ở đầu cả 4 phương án.
   - TUYỆT ĐỐI KHÔNG dùng các phương án: "Tất cả các đáp án trên đều đúng", "Không có phương án nào đúng", "Cả A và B đều đúng", "Cả A, B, C...".
   - Tránh từ ngữ mơ hồ ("thông thường", "phần lớn", "hầu hết"…) hoặc từ tuyệt đối hóa ("luôn luôn", "không bao giờ", "tuyệt đối"… trừ thuật ngữ chuyên môn như "địa chỉ tuyệt đối", "giá trị tuyệt đối").
   - Viết phương án nhiễu ở thể khẳng định; nhiễu phải hợp lí, dựa trên lỗi nhận thức hoặc sai lầm tính toán phổ biến của học sinh, không sai lộ liễu và không chứa cụm từ sai ngữ pháp/kiến thức vô nghĩa (nên viết nhiễu như phát biểu có vẻ đúng nhưng không trả lời đúng câu hỏi).${thptFormats}
${isThpt ? '6' : '4'}. YÊU CẦU ĐỐI VỚI CÂU HỎI TỰ LUẬN (ES — Mục 2, 10 tiêu chí):
   - Đánh giá nội dung quan trọng, đòi hỏi sự am hiểu và vận dụng kiến thức vào tình huống mới hơn là chỉ ghi nhớ máy móc; phù hợp trình độ nhận thức học sinh và quỹ thời gian/điểm số.
   - Câu dẫn diễn đạt rõ nội dung, cấp độ tư duy, yêu cầu thực hiện cụ thể, phạm vi/độ dài và tiêu chí cần đạt; nếu yêu cầu nêu quan điểm thì phải ghi rõ việc chấm điểm dựa trên lập luận logic chứng minh chứ không chỉ nêu quan điểm đơn thuần.
   - Bắt buộc đi kèm Hướng dẫn chấm (Rubric) đủ ý, phân chia biểu điểm chi tiết (chuẩn hệ thống: 4 tiêu chí × 0,25 điểm = 1,0 điểm) và chính sách chấp nhận đáp án tương đương.${informaticsNote}

${subjectCompetencyGuideText(s)}`;
  }
  function sampleQuestionsByGrade(g, subjName) {
    const subj = String(subjName || subject() || 'Tin học').trim();
    // Môn khác Tin học: dùng khung mẫu có ô cần điền, không đưa câu Tin học vào tệp mẫu (lỗi L4, kiểm thử 24/11/2026).
    if (!/^tin\s*h[oọ]c$/i.test(subj) && typeof TableFileHelper !== 'undefined') {
      return TableFileHelper.parseQuestionsFromRows(TableFileHelper.getSampleBankRows(g, subj), g, subj)
        .map((q, i) => ({ ...q, id: `K${g}-GV-sample${i + 1}`, subject_name: subj }));
    }
    const baseMc = {
      id: `K${g}-GV-sample1`, grade: g, subject_name: subj, lesson_code: 'B1',
      ppct_section: 'core', type: 'MC', level: 'Biết', response_mode: 'Trắc nghiệm',
      learning_outcome: 'Nhận biết được các thiết bị vào - ra cơ bản của hệ thống máy tính.',
      competency: 'NLa',
      question: 'Thiết bị nào sau đây là thiết bị vào của máy tính?',
      options: ['Màn hình', 'Chuột máy tính', 'Máy in', 'Loa'],
      correct: 1,
      option_explanations: [
        'Sai: Màn hình là thiết bị ra hiển thị thông tin.',
        'Đúng: Chuột máy tính dùng để nhập lệnh và thao tác điều khiển.',
        'Sai: Máy in là thiết bị ra trên giấy.',
        'Sai: Loa là thiết bị ra âm thanh.'
      ],
      review_status: 'draft'
    };
    const baseEs = {
      id: `K${g}-GV-sample-es`, grade: g, subject_name: subj, lesson_code: 'B2',
      ppct_section: 'core', type: 'ES', level: 'Vận dụng', response_mode: 'Tự luận',
      learning_outcome: 'Thực hiện được các quy tắc bảo vệ dữ liệu và an toàn thông tin cá nhân trong môi trường số.',
      competency: 'NLb',
      question: 'Nêu hai biện pháp bảo vệ an toàn tài khoản số cá nhân khi tham gia môi trường mạng và giải thích vì sao cần thực hiện.',
      max_score: 1,
      rubric: [
        { criterion: 'Nêu đúng biện pháp 1 (đặt mật khẩu mạnh, không dùng chung).', points: 0.25 },
        { criterion: 'Nêu đúng biện pháp 2 (bật xác thực hai yếu tố / không bấm liên kết lạ).', points: 0.25 },
        { criterion: 'Giải thích hợp lí nguy cơ lộ lọt dữ liệu cá nhân.', points: 0.25 },
        { criterion: 'Trình bày mạch lạc, đúng thuật ngữ chuyên môn.', points: 0.25 }
      ],
      equivalent_answer_policy: 'Chấp nhận các biện pháp an toàn số hợp lí tương đương; chấm độc lập từng tiêu chí.',
      review_status: 'draft'
    };
    if (g < 10) return [baseMc, baseEs];
    const thptYn = {
      id: `K${g}-GV-sample2`, grade: g, subject_name: subj, lesson_code: 'B1',
      ppct_section: 'core', type: 'YN', level: 'Hiểu', response_mode: 'Trắc nghiệm',
      learning_outcome: 'Sử dụng được các dịch vụ mạng thông dụng để học tập và giao tiếp số an toàn.',
      competency: 'NLb',
      question: 'Khi sử dụng thư điện tử (Email) trong học tập và công việc:',
      statements: [
        { label: 'a', text: 'Có thể đính kèm tệp văn bản và hình ảnh phục vụ học tập.', correct: true },
        { label: 'b', text: 'Không thể gửi một bức thư cùng lúc cho nhiều người nhận.', correct: false },
        { label: 'c', text: 'Tiêu đề thư nên viết ngắn gọn, rõ ràng, phản ánh đúng nội dung.', correct: true },
        { label: 'd', text: 'Mọi tệp đính kèm nhận từ người lạ đều an toàn tuyệt đối.', correct: false }
      ],
      review_status: 'draft'
    };
    const thptShort = {
      id: `K${g}-GV-sample3`, grade: g, subject_name: subj, lesson_code: 'B2',
      ppct_section: 'core', type: 'SHORT', level: 'Vận dụng', response_mode: 'Trắc nghiệm',
      learning_outcome: 'Hiểu và vận dụng đúng các chuẩn năng lực số GDPT 2018 môn Tin học.',
      competency: 'NLd',
      question: 'Theo chương trình GDPT 2018 môn Tin học, viết tắt của thành phần năng lực "Ứng dụng công nghệ thông tin và truyền thông trong học và tự học" là gì?',
      short_answer: 'NLd',
      review_status: 'draft'
    };
    return [baseMc, thptYn, thptShort, baseEs];
  }
  function sampleMdBodyByGrade(g, subjName) {
    const subj = String(subjName || subject() || 'Tin học').trim();
    if (!/^tin\s*h[oọ]c$/i.test(subj)) {
      const L = `${subj} lớp ${g}`;
      const mc = `### Câu 1:\n[Câu trắc nghiệm mức Biết – Bài 1 – ${L}]\nA. [Phương án sai 1]\nB. [Phương án đúng]\nC. [Phương án sai 2]\nD. [Phương án sai 3]\n*Đáp án:* B\n*Mức độ:* Biết\n*Bài học:* B1\n*Yêu cầu cần đạt:* [Yêu cầu cần đạt mức Biết của Bài 1 – ${L}]\n*Lời giải:* [Giải thích vì sao phương án B đúng]`;
      const es = (n) => `### Câu ${n}:\n[Câu tự luận mức Vận dụng – Bài 2 – ${L}]\n*Mức độ:* Vận dụng\n*Bài học:* B2\n*Yêu cầu cần đạt:* [Yêu cầu cần đạt mức Vận dụng của Bài 2 – ${L}]`;
      if (g < 10) return `${mc}\n\n${es(2)}`;
      const yn = `### Câu 2:\n[Câu Đúng/Sai – Bài 1 – ${L}: xét tính đúng sai của các nhận định sau]\na) [Đúng] [Nhận định a]\nb) [Sai] [Nhận định b]\nc) [Đúng] [Nhận định c]\nd) [Sai] [Nhận định d]\n*Mức độ:* Hiểu\n*Bài học:* B1\n*Yêu cầu cần đạt:* [Yêu cầu cần đạt mức Hiểu của Bài 1 – ${L}]`;
      const sh = `### Câu 3:\n[Câu trả lời ngắn – Bài 2 – ${L}]\n*Đáp án:* [Đáp án ngắn, ví dụ 12,5]\n*Mức độ:* Vận dụng\n*Bài học:* B2\n*Yêu cầu cần đạt:* [Yêu cầu cần đạt mức Vận dụng của Bài 2 – ${L}]`;
      return `${mc}\n\n${yn}\n\n${sh}\n\n${es(4)}`;
    }
    const commonMc = `### Câu 1:
Thiết bị nào sau đây là thiết bị vào của máy tính?
A. Màn hình
B. Chuột máy tính
C. Máy in
D. Loa
*Đáp án:* B
*Mức độ:* Biết
*Bài học:* B1
*Yêu cầu cần đạt:* Nhận biết được các thiết bị vào - ra cơ bản của hệ thống máy tính.
*Năng lực:* NLa
*Lời giải:* Chuột máy tính là thiết bị đưa dữ liệu đầu vào cho hệ thống.`;
    const commonEs = `### Câu ${g >= 10 ? 4 : 2}:
Nêu hai biện pháp bảo vệ an toàn thông tin cá nhân trên môi trường mạng và giải thích ngắn gọn tác dụng của từng biện pháp.
*Mức độ:* Vận dụng
*Bài học:* B2
*Yêu cầu cần đạt:* Thực hiện được các quy tắc bảo vệ dữ liệu và an toàn thông tin cá nhân trong môi trường số.
*Năng lực:* NLb`;
    if (g < 10) return `${commonMc}\n\n${commonEs}`;
    return `${commonMc}

### Câu 2:
Khi sử dụng thư điện tử (Email) trong học tập và giao tiếp số:
a) [Đúng] Có thể đính kèm tệp văn bản và hình ảnh phục vụ học tập.
b) [Sai] Không thể gửi một bức thư cùng lúc cho nhiều người nhận.
c) [Đúng] Tiêu đề thư nên viết ngắn gọn, rõ ràng, phản ánh đúng nội dung chính.
d) [Sai] Mọi tệp đính kèm trong thư nhận từ người lạ đều an toàn tuyệt đối.
*Mức độ:* Hiểu
*Bài học:* B1
*Yêu cầu cần đạt:* Sử dụng được các dịch vụ mạng thông dụng để học tập và giao tiếp số an toàn.
*Năng lực:* NLb
*Lời giải:* Thư điện tử cho phép gửi đồng thời nhiều người; tệp lạ có thể chứa mã độc.

### Câu 3:
Theo chương trình GDPT 2018 môn Tin học, viết tắt của thành phần năng lực "Ứng dụng công nghệ thông tin và truyền thông trong học và tự học" là gì?
*Đáp án:* NLd
*Mức độ:* Vận dụng
*Bài học:* B2
*Yêu cầu cần đạt:* Hiểu và vận dụng đúng các chuẩn năng lực số GDPT 2018 môn Tin học.
*Năng lực:* NLd

${commonEs}`;
  }

  function downloadBankExcelSample(grade = 9) {
    const g = Number(grade) || 9;
    const subj = subject();
    if (typeof TableFileHelper !== 'undefined') {
      const rows = TableFileHelper.getSampleBankRows(g, subj);
      TableFileHelper.downloadCsv(rows, `Mau_Cau_hoi_Excel_${C.normalize(subj).replace(/\s+/g, '_')}_${g}_2026-2027.csv`);
    } else {
      notify('Bộ công cụ bảng tính đang được khởi tạo, vui lòng thử lại sau giây lát.', true);
    }
  }

  function openBankAiPromptDialog(initialGrade = 9) {
    const dlg = $('#ai-prompt-lesson-dialog');
    if (!dlg) return;
    const container = $('#ai-prompt-lesson-content');
    if (!container) return;

    let curGrade = Number(initialGrade) || Number(store.filters.grade) || effectiveGrade();
    const subj = subject();
    let selectedPart = 'MC';
    let selectedFormat = 'EXCEL';
    let selectedCount = 4;

    const renderDialogContent = () => {
      const isThpt = curGrade >= 10;
      if (!isThpt && selectedPart === 'YN') {
        selectedPart = 'MC';
      }

      const ls = lessons(curGrade, subj);
      const uniqueLessons = [];
      const seenCodes = new Set();
      ls.forEach(l => {
        if (!seenCodes.has(l.lesson_code)) {
          seenCodes.add(l.lesson_code);
          uniqueLessons.push(l);
        }
      });
      if (!uniqueLessons.length) {
        uniqueLessons.push({ lesson_code: 'B1', lesson_name: 'Bài học 1', outcomes: ['Nắm vững kiến thức trọng tâm của bài'] });
      }

      let selectedLessonCode = uniqueLessons[0].lesson_code;

      const getCurLesson = () => uniqueLessons.find(l => l.lesson_code === selectedLessonCode) || uniqueLessons[0];

      const getCurOutcomes = () => {
        const l = getCurLesson();
        if (l.outcomes && l.outcomes.length) return l.outcomes;
        return [l.lesson_name_source || l.lesson_name || l.name || 'Yêu cầu cần đạt theo chương trình'];
      };

      const updatePromptPreview = () => {
        const l = getCurLesson();
        const outcomes = getCurOutcomes();
        if (typeof TableFileHelper !== 'undefined') {
          const prompt = TableFileHelper.buildAiPromptByLesson({
            grade: curGrade,
            subject: subj,
            lessonCode: l.lesson_code,
            lessonName: l.lesson_name_source || l.lesson_name || l.name || 'Bài học',
            outcomes: outcomes,
            part: selectedPart,
            outputFormat: selectedFormat,
            count: Number(selectedCount) || 4,
            knowledge: (() => { try { const KG = window.BankKnowledgeGraph; return KG ? KG.lessonContext(KG.buildGraph({ bank: store.bank }, { subject: subj }), subj, curGrade, l.lesson_code) : null; } catch (e) { return null; } })()
          });
          const previewEl = $('#ai-prompt-preview-text');
          if (previewEl) previewEl.value = prompt;
        }
      };

      container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:14px">
          <div>
            <div style="background:#F7F8FB;border:1px solid #E4E7F0;border-radius:8px;padding:12px;margin-bottom:12px">
              <h4 style="margin:0 0 8px;color:#4A3AA8;font-size:13px">1. Chọn Khối &amp; Bài học từ PPCT</h4>
              <div style="display:flex;gap:10px;margin-bottom:8px">
                <div style="flex:1">
                  <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:3px">Khối lớp</label>
                  <select id="ai-prompt-select-grade" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #D5D9E4;font-size:12px">
                    ${grades().map(g => `<option value="${g}" ${g === curGrade ? 'selected' : ''}>Khối ${g}</option>`).join('')}
                  </select>
                </div>
                <div style="flex:2">
                  <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:3px">Bài học (PPCT)</label>
                  <select id="ai-prompt-select-lesson" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #D5D9E4;font-size:12px">
                    ${uniqueLessons.map(l => `<option value="${esc(l.lesson_code)}">${esc(l.lesson_code)} · ${esc(l.lesson_name_source || l.lesson_name || l.name)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div>
                <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:3px">Mục tiêu &amp; YCCĐ của bài học đã chọn:</label>
                <div id="ai-prompt-outcomes-box" style="background:#fff;border:1px solid #E4E7F0;border-radius:6px;padding:8px;font-size:12px;max-height:85px;overflow-y:auto;line-height:1.4">
                  ${getCurOutcomes().map(o => `<div>• ${esc(o)}</div>`).join('')}
                </div>
              </div>
            </div>

            <div style="background:#F7F8FB;border:1px solid #E4E7F0;border-radius:8px;padding:12px">
              <h4 style="margin:0 0 8px;color:#4A3AA8;font-size:13px">2. Chọn Phần câu hỏi &amp; Định dạng</h4>
              <div style="margin-bottom:10px">
                <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:4px">Phần muốn tạo (Nạp từng phần):</label>
                <div style="display:flex;flex-direction:column;gap:5px;font-size:12px">
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="radio" name="ai_part" value="MC" ${selectedPart === 'MC' ? 'checked' : ''}>
                    <strong>Phần 1: Trắc nghiệm 4 lựa chọn (MC)</strong>
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;cursor:${isThpt ? 'pointer' : 'not-allowed'};opacity:${isThpt ? '1' : '0.55'}">
                    <input type="radio" name="ai_part" value="YN" ${selectedPart === 'YN' ? 'checked' : ''} ${isThpt ? '' : 'disabled'}>
                    <strong>Phần 2: Đúng/Sai 4 ý a-d (YN · CV 7991)</strong>
                    ${isThpt ? '' : '<span style="color:#C62828;font-size:11px;font-weight:600">(Không áp dụng cho THCS - TT 22/2021)</span>'}
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="radio" name="ai_part" value="SHORT_ES" ${selectedPart === 'SHORT_ES' ? 'checked' : ''}>
                    <strong>${isThpt ? 'Phần 3: Trả lời ngắn (SHORT) &amp; Tự luận (ES)' : 'Phần 2: Tự luận / Thực hành (ES)'}</strong>
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="radio" name="ai_part" value="ALL" ${selectedPart === 'ALL' ? 'checked' : ''}>
                    <span>${isThpt ? 'Trọn gói cả 3 phần cho bài học này (MC + YN + Tự luận/SHORT)' : 'Trọn gói 2 phần chuẩn THCS (Trắc nghiệm MC + Tự luận ES)'}</span>
                  </label>
                </div>
              </div>

              <div style="display:flex;gap:10px;align-items:center">
                <div style="flex:2">
                  <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:4px">Định dạng đầu ra:</label>
                  <select id="ai-prompt-select-format" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #D5D9E4;font-size:12px;font-weight:600">
                    <option value="EXCEL" ${selectedFormat === 'EXCEL' ? 'selected' : ''}>Bảng Excel / TSV (Khuyên dùng #1)</option>
                    <option value="JSON" ${selectedFormat === 'JSON' ? 'selected' : ''}>JSON chuẩn hệ thống (#2)</option>
                    <option value="MARKDOWN" ${selectedFormat === 'MARKDOWN' ? 'selected' : ''}>Markdown văn bản (#3)</option>
                  </select>
                </div>
                <div style="flex:1">
                  <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:4px">Số lượng câu:</label>
                  <input type="number" id="ai-prompt-count" value="${selectedCount}" min="1" max="20" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #D5D9E4;font-size:12px">
                </div>
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column">
            <label style="font-size:11px;font-weight:700;color:#5B6475;margin-bottom:4px;display:flex;justify-content:space-between">
              <span>Nội dung Prompt AI được tạo tự động:</span>
              <span style="color:#4A3AA8;font-size:11px">Có thể chỉnh sửa thêm bên dưới</span>
            </label>
            <textarea id="ai-prompt-preview-text" rows="12" style="flex:1;width:100%;padding:10px;border-radius:8px;border:1px solid #D5D9E4;font-family:monospace;font-size:12px;line-height:1.45;resize:vertical;background:#fff"></textarea>
          </div>
        </div>

        <div style="background:#F3F4F8;border:1px solid #D6D1F2;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#1C2333;line-height:1.5">
          <strong>Quy trình 3 bước dành cho Thầy/Cô:</strong>
          <ol style="margin:4px 0 0;padding-left:18px">
            <li>Bấm nút <strong>"Chép Prompt AI vào bộ nhớ tạm"</strong> bên dưới. Mở <strong>ChatGPT</strong> hoặc <strong>Gemini</strong>, dán vào khung chat và gửi đi.</li>
            <li>Copy bảng kết quả mà AI trả về, dán vào phần mềm <strong>Microsoft Excel</strong> rồi bấm <strong>File &rarr; Save As</strong> lưu thành tệp <code>.xlsx</code> hoặc <code>.csv</code>.</li>
            <li>Tại giao diện Ngân hàng câu hỏi, bấm nút <strong>"Nhập câu hỏi (Excel / JSON / Markdown)"</strong> để tải tệp lên hệ thống!</li>
          </ol>
        </div>

        <div class="actions" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="display:flex;gap:8px">
            <button type="button" class="button" id="ai-prompt-btn-download-excel" style="background:#1F6B52;color:#fff;border-color:#1F6B52;font-weight:600;font-size:12px;padding:7px 14px">Tải file mẫu Excel (.csv)</button>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="button primary" id="ai-prompt-btn-copy" style="background:#4A3AA8;border-color:#4A3AA8;font-weight:700;font-size:13px;padding:8px 20px">Chép Prompt AI vào bộ nhớ tạm</button>
            <button type="button" class="button quiet" data-close="ai-prompt-lesson-dialog">Đóng</button>
          </div>
        </div>
      `;

      $('#ai-prompt-select-grade').onchange = ev => {
        curGrade = Number(ev.target.value) || 9;
        renderDialogContent();
      };
      $('#ai-prompt-select-lesson').onchange = ev => {
        selectedLessonCode = ev.target.value;
        const box = $('#ai-prompt-outcomes-box');
        if (box) box.innerHTML = getCurOutcomes().map(o => `<div>• ${esc(o)}</div>`).join('');
        updatePromptPreview();
      };
      container.querySelectorAll('input[name="ai_part"]').forEach(radio => {
        radio.onchange = ev => {
          selectedPart = ev.target.value;
          if (selectedPart === 'MC') selectedCount = 4;
          else if (selectedPart === 'YN') selectedCount = 2;
          else if (selectedPart === 'SHORT_ES') selectedCount = 2;
          else selectedCount = 5;
          const countEl = $('#ai-prompt-count');
          if (countEl) countEl.value = selectedCount;
          updatePromptPreview();
        };
      });
      $('#ai-prompt-select-format').onchange = ev => {
        selectedFormat = ev.target.value;
        updatePromptPreview();
      };
      $('#ai-prompt-count').oninput = ev => {
        selectedCount = ev.target.value;
        updatePromptPreview();
      };
      $('#ai-prompt-btn-copy').onclick = () => {
        const text = $('#ai-prompt-preview-text')?.value || '';
        copyTextWithFallback(text, 'Đã chép Prompt AI theo bài học vào bộ nhớ tạm! Thầy/cô chỉ việc dán vào ChatGPT / Gemini.');
      };
      $('#ai-prompt-btn-download-excel').onclick = () => {
        downloadBankExcelSample(curGrade);
      };

      updatePromptPreview();
    };

    renderDialogContent();
    dlg.showModal();
  }

  function downloadBankJsonSample(grade = 9) {
    const g = Number(grade) || 9;
    const subj = subject();
    const sample = { bank: { questions: sampleQuestionsByGrade(g, subj) } };
    triggerTextDownload(JSON.stringify(sample, null, 2), 'application/json;charset=utf-8', `Mau_Cau_hoi_${C.normalize(subj).replace(/\s+/g, '_')}_${g}_2026-2027.json`);
  }

  function downloadBankMdSample(grade = 9) {
    const g = Number(grade) || 9;
    const subj = subject();
    const cap = g >= 10 ? 'THPT (CV 7991)' : 'THCS';
    const sampleMd = `# BỘ CÂU HỎI MÔN ${subj.toLocaleUpperCase('vi')} KHỐI ${g} · ${cap}\nNăm học: 2026-2027\n\n${sampleMdBodyByGrade(g, subj)}\n`;
    triggerTextDownload(sampleMd, 'text/markdown;charset=utf-8', `Mau_Cau_hoi_${C.normalize(subj).replace(/\s+/g, '_')}_${g}_2026-2027.md`);
  }

  function copyBankAiPrompt(grade = 9) {
    const g = Number(grade) || 9;
    const isThpt = g >= 10;
    const subj = subject();
    const isInformatics = /tin\s*h[oọ]c/i.test(subj);
    const prompt = `Bạn là chuyên gia khảo thí môn ${subj} chương trình GDPT 2018 tại Trường Quốc tế Á Châu.
Hãy giúp tôi biên soạn bộ câu hỏi ngân hàng đề môn ${subj} Khối ${g} (${isThpt ? 'THPT · chuẩn Công văn 7991/BGDĐT-GDTrH' : 'THCS'}) dưới dạng Markdown (.md) chuẩn để nhập trực tiếp vào hệ thống ExamMatrix Studio.

Phân mạch PPCT (TT 32/2018 & TT 22/2021):
${isThpt
  ? `* Nội dung cốt lõi (Mục II.1, mã bài B1, B2...): dùng cho Kiểm tra thường xuyên, Đề cương, Giữa kì và Cuối kì${isInformatics ? '; gắn định hướng ICT hoặc CS khi phù hợp' : ''}.\n* Chuyên đề học tập (Mục II.2, mã CD1, CD2..., ppct_section: "elective_topic"): CHỈ dùng cho Đánh giá thường xuyên (Điều 6.3 TT 22/2021), KHÔNG đưa vào Đề cương hay đề Kiểm tra định kì (Điều 7.1).`
  : '* Cấp THCS (Khối 6–9) KHÔNG có Chuyên đề học tập lựa chọn; toàn bộ câu hỏi thuộc Nội dung cốt lõi (mã bài B1, B2...).'}

${cv7991QuestionRulesBlock(g, subj, 'BANK')}

Yêu cầu định dạng Markdown từng câu (kèm đầy đủ YCCĐ và Năng lực GDPT 2018: NLa, NLb, NLc, NLd, NLe):
1. Đánh số câu: ### Câu 1:, ### Câu 2:...
2. Câu trắc nghiệm nhiều lựa chọn (MC):
   - Đặt 4 phương án A., B., C., D. trên 4 dòng riêng (độ dài và cấu trúc đồng nhất, không dùng "Tất cả đều đúng" / "Không có phương án nào đúng")
   - *Đáp án:* [A/B/C/D]
   - *Mức độ:* [Biết/Hiểu/Vận dụng]
   - *Bài học:* [${isThpt ? 'B1/B2... hoặc CD1/CD2... nếu là KTTX chuyên đề' : 'B1/B2/B3...'}]
   - *Yêu cầu cần đạt:* [Gắn đúng YCCĐ theo PPCT của bài học]
   - *Năng lực:* [Gắn đúng 1 mã: NLa/NLb/NLc/NLd/NLe]
   - *Lời giải:* [Giải thích rõ vì sao phương án đúng là đúng và vì sao các phương án nhiễu sai]${isThpt ? `
3. Câu trắc nghiệm Đúng/Sai (YN - 4 ý a–d):
   - Mỗi câu gồm đoạn dẫn ngữ liệu chung (>= 25 kí tự) + 4 mệnh đề đơn độc lập tăng dần nhận thức (không để cả 4 ý cùng Đúng hoặc cùng Sai):
     a) [Đúng] Nội dung ý a (mức Biết)
     b) [Sai] Nội dung ý b (mức Biết/Hiểu)
     c) [Đúng] Nội dung ý c (mức Hiểu)
     d) [Sai] Nội dung ý d (mức Vận dụng)
   - Ghi rõ *Mức độ:*, *Bài học:*, *Yêu cầu cần đạt:* và *Năng lực:* (NLa/NLb/NLc/NLd/NLe)
4. Câu trắc nghiệm Trả lời ngắn (SHORT):
   - Câu dẫn nêu rõ đơn vị tính và quy ước làm tròn; đáp án gọn duy nhất không kèm đơn vị (tối đa 4 kí tự nếu là số theo QĐ 764)
   - *Đáp án:* [Đáp án ngắn gọn]
   - Ghi rõ *Mức độ:*, *Bài học:*, *Yêu cầu cần đạt:* và *Năng lực:* (NLa/NLb/NLc/NLd/NLe)
5. Câu Tự luận (ES):` : `
3. Câu Tự luận (ES):`}
   - Ghi đề bài rõ tình huống, yêu cầu thực hiện và tiêu chí đánh giá; không viết dòng *Đáp án:* để hệ thống nhận diện câu Tự luận (ES), ghi rõ *Mức độ:*, *Bài học:*, *Yêu cầu cần đạt:* và *Năng lực:*.
Chỉ xuất trực tiếp nội dung Markdown, không kèm lời bình bên ngoài.`;
    copyTextWithFallback(prompt, 'Đã chép Prompt AI soạn câu hỏi (chuẩn CV 7991/6569) vào bộ nhớ tạm!');
  }

  function downloadRevisionJsonSample(grade = 9) {
    const g = Number(grade) || 9;
    const subj = subject();
    const sample = {
      revision: {
        id: `REV-SAMPLE-${g}`,
        title: `Đề cương ôn tập Giữa HK1 · ${subj} ${g}`,
        grade: g,
        subject_name: subj,
        questions: sampleQuestionsByGrade(g, subj)
      }
    };
    triggerTextDownload(JSON.stringify(sample, null, 2), 'application/json;charset=utf-8', `Mau_De_cuong_${C.normalize(subj).replace(/\s+/g, '_')}_${g}_2026-2027.json`);
  }

  function downloadRevisionMdSample(grade = 9) {
    const g = Number(grade) || 9;
    const subj = subject();
    const sampleMd = `# ĐỀ CƯƠNG ÔN TẬP GIỮA HỌC KỲ 1\nMôn: ${subj} - Khối: ${g} - Năm học: 2026-2027\n\n${sampleMdBodyByGrade(g, subj)}\n`;
    triggerTextDownload(sampleMd, 'text/markdown;charset=utf-8', `Mau_De_cuong_${C.normalize(subj).replace(/\s+/g, '_')}_${g}_2026-2027.md`);
  }

  function copyRevisionAiPrompt(grade = 9) {
    const g = Number(grade) || 9;
    const isThpt = g >= 10;
    const subj = subject();
    const prompt = `Bạn là chuyên gia khảo thí môn ${subj} chương trình GDPT 2018 tại Trường Quốc tế Á Châu.
Hãy biên soạn Đề cương ôn tập kiểm tra định kì môn ${subj} Khối ${g} (${isThpt ? 'THPT · chuẩn CV 7991/BGDĐT-GDTrH' : 'THCS'}) dưới dạng Markdown (.md) chuẩn để nạp vào hệ thống ExamMatrix Studio:

Ràng buộc pháp lý (TT 22/2021 Điều 7.1 & CV 7991/BGDĐT-GDTrH):
- Chỉ sử dụng các bài thuộc Nội dung cốt lõi (Mục II.1: B1, B2...). ${isThpt ? 'TUYỆT ĐỐI KHÔNG đưa bài Chuyên đề học tập (CD1, CD2...) vào đề cương ôn tập kiểm tra định kì.' : 'Cấp THCS không có Chuyên đề học tập.'}
- Dạng câu sử dụng: ${isThpt ? 'đủ 4 dạng CV 7991 (MC, YN 4 ý a–d, SHORT trả lời ngắn, ES tự luận).' : 'MC (4 lựa chọn) và ES (tự luận).'}

${cv7991QuestionRulesBlock(g, subj, 'REVISION')}

Yêu cầu định dạng (kèm đầy đủ YCCĐ và Năng lực Tin học GDPT 2018 NLa-NLe):
# ĐỀ CƯƠNG ÔN TẬP KIỂM TRA MÔN ${subj.toLocaleUpperCase('vi')} KHỐI ${g}
Môn: ${subj} - Khối: ${g} - Năm học: 2026-2027

### Câu 1:
[Câu hỏi MC tuân thủ mục 1.a, 1.b, 1.c]
A. [Phương án A]
B. [Phương án B]
C. [Phương án C]
D. [Phương án D]
*Đáp án:* [A/B/C/D]
*Mức độ:* [Biết/Hiểu/Vận dụng]
*Bài học:* [B1/B2...]
*Yêu cầu cần đạt:* [Gắn YCCĐ tương ứng của bài học]
*Năng lực:* [NLa/NLb/NLc/NLd/NLe]
*Lời giải:* [Giải thích ngắn]
${isThpt ? `
### Câu 2:
[Câu dẫn ngữ liệu chung câu Đúng/Sai >= 25 kí tự]
a) [Đúng] [Mệnh đề a]
b) [Sai] [Mệnh đề b]
c) [Đúng] [Mệnh đề c]
d) [Sai] [Mệnh đề d]
*Mức độ:* [Biết/Hiểu/Vận dụng]
*Bài học:* [B1/B2...]
*Yêu cầu cần đạt:* [Gắn YCCĐ tương ứng]
*Năng lực:* [NLa/NLb/NLc/NLd/NLe]

### Câu 3:
[Câu hỏi Trả lời ngắn ghi rõ đơn vị và quy ước làm tròn]
*Đáp án:* [Đáp án ngắn không kèm đơn vị, <= 4 kí tự nếu là số]
*Mức độ:* [Hiểu/Vận dụng]
*Bài học:* [B1/B2...]
*Yêu cầu cần đạt:* [Gắn YCCĐ tương ứng]
*Năng lực:* [NLa/NLb/NLc/NLd/NLe]

### Câu 4:` : `
### Câu 2:`}
[Câu hỏi Tự luận nêu rõ tình huống, yêu cầu và tiêu chí đánh giá — không đặt dòng *Đáp án:*]
*Mức độ:* [Vận dụng]
*Bài học:* [B1/B2...]
*Yêu cầu cần đạt:* [Gắn YCCĐ tương ứng]
*Năng lực:* [NLa/NLb/NLc/NLd/NLe]

Chỉ xuất trực tiếp nội dung Markdown, không kèm bình luận.`;
    copyTextWithFallback(prompt, 'Đã chép Prompt AI tạo Đề cương (chuẩn CV 7991/6569) vào bộ nhớ tạm!');
  }

  function downloadExamJsonSample(grade = 9, examType = 'GK1') {
    const g = Number(grade) || 9;
    const subj = subject();
    const label = periodNames[examType] || 'Giữa HK1';
    const dur = examType === 'TX' ? 15 : 45;
    const sample = {
      exams: [{
        id: `EXAM-SAMPLE-${g}`,
        title: `Đề kiểm tra ${label} · ${subj} ${g}`,
        exam_type: examType,
        exam_code: '101',
        grade: g,
        subject_name: subj,
        duration: dur,
        total_points: 10,
        questions: sampleQuestionsByGrade(g, subj)
      }]
    };
    triggerTextDownload(JSON.stringify(sample, null, 2), 'application/json;charset=utf-8', `Mau_De_thi_${C.normalize(subj).replace(/\s+/g, '_')}_${g}_${examType}_2026-2027.json`);
  }

  function downloadExamMdSample(grade = 9, examType = 'GK1') {
    const g = Number(grade) || 9;
    const subj = subject();
    const label = (periodNames[examType] || 'GIỮA HỌC KỲ 1').toLocaleUpperCase('vi');
    const dur = examType === 'TX' ? 15 : 45;
    const sampleMd = `# ĐỀ KIỂM TRA ${label} - MÃ ĐỀ 101\nMôn: ${subj} - Khối: ${g} - Thời gian làm bài: ${dur} phút - Năm học: 2026-2027\n\n${sampleMdBodyByGrade(g, subj)}\n`;
    triggerTextDownload(sampleMd, 'text/markdown;charset=utf-8', `Mau_De_thi_${C.normalize(subj).replace(/\s+/g, '_')}_${g}_${examType}_2026-2027.md`);
  }

  function copyExamAiPrompt(grade = 9, examType = 'GK1') {
    const g = Number(grade) || 9;
    const isThpt = g >= 10;
    const isTx = examType === 'TX';
    const subj = subject();
    const label = periodNames[examType] || 'Giữa HK1';
    const dur = isTx ? 15 : 45;
    const scopeRule = isTx && isThpt
      ? '- Kì Kiểm tra thường xuyên (TX · TT 22/2021 Điều 6): có thể dùng bài Nội dung cốt lõi (B1...) hoặc bài Chuyên đề học tập (CD1...).'
      : isThpt
        ? '- Kì Kiểm tra định kì THPT (TT 22/2021 Điều 7.1): CHỈ dùng bài Nội dung cốt lõi (Mục II.1: B1, B2...), TUYỆT ĐỐI KHÔNG đưa Chuyên đề học tập (CD1...) vào đề.'
        : '- Cấp THCS (TT 22/2021): chỉ dùng bài Nội dung cốt lõi (B1, B2...), không có Chuyên đề học tập.';
    const prompt = `Bạn là chuyên gia khảo thí môn ${subj} chương trình GDPT 2018 tại Trường Quốc tế Á Châu.
Hãy biên soạn 01 Đề kiểm tra ${label} môn ${subj} Khối ${g} (${isThpt ? 'THPT · chuẩn CV 7991/BGDĐT-GDTrH' : 'THCS'}) dưới dạng Markdown (.md) chuẩn để kiểm định và import vào ExamMatrix Studio:

Quy chuẩn cấu trúc đề:
- Thời gian làm bài: ${dur} phút · Thang điểm 10.
${scopeRule}
- Cấu trúc dạng câu: ${isThpt ? 'MC (Nhiều lựa chọn ~3,0đ) + YN (Đúng/Sai 4 ý ~2,0đ) + SHORT (Trả lời ngắn ~2,0đ; nếu môn không dùng SHORT thì chuyển sang YN = 4,0đ) + ES (Tự luận ~3,0đ), tỉ lệ 3 mức độ Biết 40% – Hiểu 30% – Vận dụng 30% theo CV 7991.' : 'MC (Nhiều lựa chọn) + ES (Tự luận).'}

${cv7991QuestionRulesBlock(g, subj, examType)}

Yêu cầu định dạng (kèm đầy đủ YCCĐ và Năng lực Tin học GDPT 2018 NLa-NLe):
# ĐỀ KIỂM TRA ${label.toLocaleUpperCase('vi')} - MÃ ĐỀ 101
Môn: ${subj} - Khối: ${g} - Thời gian: ${dur} phút - Năm học: 2026-2027

### Câu 1:
[Nội dung câu MC tuân thủ mục 1.a, 1.b, 1.c]
A. [Phương án A]
B. [Phương án B]
C. [Phương án C]
D. [Phương án D]
*Đáp án:* [A/B/C/D]
*Mức độ:* [Biết/Hiểu/Vận dụng]
*Bài học:* [B1/B2...]
*Yêu cầu cần đạt:* [Gắn YCCĐ tương ứng của bài học]
*Năng lực:* [NLa/NLb/NLc/NLd/NLe]
*Lời giải:* [Giải thích ngắn]
${isThpt ? `
### Câu 2:
[Ngữ liệu câu Đúng/Sai >= 25 kí tự]
a) [Đúng] [Mệnh đề a]
b) [Sai] [Mệnh đề b]
c) [Đúng] [Mệnh đề c]
d) [Sai] [Mệnh đề d]
*Mức độ:* [Biết/Hiểu/Vận dụng]
*Bài học:* [B1/B2...]
*Yêu cầu cần đạt:* [Gắn YCCĐ tương ứng]
*Năng lực:* [NLa/NLb/NLc/NLd/NLe]

### Câu 3:
[Nội dung câu Trả lời ngắn ghi rõ đơn vị tính và làm tròn]
*Đáp án:* [Đáp án ngắn không kèm đơn vị, <= 4 kí tự nếu là số]
*Mức độ:* [Hiểu/Vận dụng]
*Bài học:* [B1/B2...]
*Yêu cầu cần đạt:* [Gắn YCCĐ tương ứng]
*Năng lực:* [NLa/NLb/NLc/NLd/NLe]

### Câu 4:` : `
### Câu 2:`}
[Nội dung câu Tự luận nêu rõ yêu cầu và tiêu chí — không đặt dòng *Đáp án:*]
*Mức độ:* [Vận dụng]
*Bài học:* [B1/B2...]
*Yêu cầu cần đạt:* [Gắn YCCĐ tương ứng]
*Năng lực:* [NLa/NLb/NLc/NLd/NLe]

Chỉ xuất trực tiếp nội dung Markdown, không kèm bình luận.`;
    copyTextWithFallback(prompt, 'Đã chép Prompt AI tạo Đề thi (chuẩn CV 7991/6569) vào bộ nhớ tạm!');
  }

  // =========================================================================
  // HỘP THOẠI TÙY BIẾN XUẤT HỒ SƠ KHẢO THÍ & ĐỀ THI (HỘP TÍCH CHỌN)
  // =========================================================================
  function openCustomExportDialog(examId) {
    const dlg = $('#custom-export-dialog');
    if (!dlg) return;
    const container = $('#custom-export-content');
    if (!container) return;

    const list = currentExams();
    const record = list.find(e => e.id === examId) || store.exams.find(e => e.id === examId) || list[0];
    if (!record) {
      notify('Không tìm thấy thông tin đề kiểm tra.', true);
      return;
    }

    const base = '/api/exams/' + encodeURIComponent(record.id) + '/export';
    const hasVariants = Boolean(record.parent_exam_id || store.exams.some(x => x.parent_exam_id === record.id));
    const isThpt = Number(record.grade) >= 10;

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
        <div style="background:#F3F4F8;border:1px solid #D5D9E4;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <strong style="color:#4A3AA8;font-size:14px">${esc(record.title || 'Đề kiểm tra')}</strong>
            <div style="font-size:12px;color:#5B6475;margin-top:2px">
              Khối ${esc(record.grade)} · Môn: ${esc(record.subject_name || subject())} · Thời gian: ${esc(record.duration || 45)} phút · Mã đề gốc: <strong>${esc(record.exam_code || 'GỐC')}</strong> · Tổng điểm: <strong>${fmtPts(record.total_points ?? 10)} điểm</strong>
            </div>
          </div>
          <span class="badge ${record.status === 'published' ? 'approved' : record.status === 'locked' ? '' : 'draft'}">
            ${record.status === 'published' ? 'Đã phát hành' : record.status === 'locked' ? 'Đã khóa' : 'Bản nháp'}
          </span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <!-- Cột trái: Thành phần hồ sơ cần xuất -->
          <div style="background:#fff;border:1px solid #E4E7F0;border-radius:8px;padding:14px">
            <h4 style="margin:0 0 10px;color:#4A3AA8;font-size:13px;border-bottom:1px solid #F3F4F8;padding-bottom:6px">
              1. Thành phần hồ sơ cần xuất (Tích chọn):
            </h4>
            <div style="display:flex;flex-direction:column;gap:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cexp-chk-student" checked>
                <span><strong>Đề kiểm tra học sinh</strong> (Ẩn đáp án &amp; HDC)</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cexp-chk-answers" checked>
                <span><strong>Bản Đáp án &amp; Hướng dẫn chấm</strong> (Dành riêng cho GV)</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cexp-chk-matrix" checked>
                <span><strong>Khung Ma trận 2D &amp; Bản đặc tả</strong> (Word không tràn viền)</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cexp-chk-mapping" ${hasVariants ? 'checked' : ''}>
                <span><strong>Bảng đối chiếu hoán vị 4 mã đề</strong> (Mapping matrix)</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cexp-chk-omr">
                <span><strong>Phiếu trả lời trắc nghiệm</strong> (Tô tròn A B C D / Đúng Sai)</span>
              </label>
            </div>
          </div>

          <!-- Cột phải: Cấu hình mã đề & Trình bày -->
          <div style="background:#fff;border:1px solid #E4E7F0;border-radius:8px;padding:14px">
            <h4 style="margin:0 0 10px;color:#4A3AA8;font-size:13px;border-bottom:1px solid #F3F4F8;padding-bottom:6px">
              2. Cấu hình Mã đề &amp; Trình bày trang in:
            </h4>
            <div style="margin-bottom:10px">
              <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:4px">Số lượng mã đề hoán vị:</label>
              <div style="display:flex;gap:12px;font-size:12px">
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
                  <input type="radio" name="cexp_variants_count" value="1" checked> 1 mã gốc
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
                  <input type="radio" name="cexp_variants_count" value="2"> 2 mã (101, 102)
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
                  <input type="radio" name="cexp_variants_count" value="4"> 4 mã (101 - 104)
                </label>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:7px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cexp-chk-show-points" checked>
                <span>Hiển thị điểm từng câu trên đề (VD: <em>[0,25 điểm]</em>)</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cexp-chk-pagebreak" checked>
                <span>Ngắt trang sạch (Page-break) giữa Trắc nghiệm &amp; Tự luận</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cexp-chk-rubric-detail" checked>
                <span>Kèm Barem tiêu chí chấm Tự luận chi tiết (Rubric)</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Hàng thông tin nhận diện trường -->
        <div style="background:#F7F8FB;border:1px solid #E4E7F0;border-radius:8px;padding:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:3px">Cơ sở Trường Quốc tế Á Châu</label>
            <select id="cexp-select-campus" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #D5D9E4;font-size:12px">
              <option value="Cao Thắng">Cơ sở Cao Thắng (Q.3)</option>
              <option value="Pasteur">Cơ sở Pasteur (Q.3)</option>
              <option value="Cộng Hòa">Cơ sở Cộng Hòa (Tân Bình)</option>
              <option value="Trần Nhật Duật">Cơ sở Trần Nhật Duật (Q.1)</option>
              <option value="Thái Văn Lung">Cơ sở Thái Văn Lung (Q.1)</option>
              <option value="Văn Thánh">Cơ sở Văn Thánh (Bình Thạnh)</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:3px">Năm học</label>
            <input type="text" id="cexp-school-year" value="2026-2027" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #D5D9E4;font-size:12px">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:3px">Định dạng lề trang in</label>
            <select id="cexp-margin" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #D5D9E4;font-size:12px">
              <option value="standard">Chuẩn A4 không tràn viền (Trái 3cm, Phải 2cm)</option>
              <option value="compact">A4 tiết kiệm giấy (Trái 2cm, Phải 1.5cm)</option>
            </select>
          </div>
        </div>

        <!-- Nút hành động -->
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E4E7F0;padding-top:14px;margin-top:6px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;gap:8px">
            <button type="button" class="button primary" id="cexp-btn-download-bundle" style="background:#4A3AA8;border-color:#4A3AA8;font-weight:700;padding:8px 18px">
              Tải trọn bộ Hồ sơ theo tùy chọn (.zip)
            </button>
            <button type="button" class="button" id="cexp-btn-download-student" style="font-weight:600">
              Word Đề thi (.docx)
            </button>
            <button type="button" class="button" id="cexp-btn-download-answers" style="font-weight:600">
              Word Đáp án &amp; HDC (.docx)
            </button>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="button" id="cexp-btn-print" style="font-weight:600">
              Mở trang in
            </button>
            <button type="button" class="button quiet" data-close="custom-export-dialog">Đóng</button>
          </div>
        </div>
      </div>
    `;

    const bundleBtn = $('#cexp-btn-download-bundle');
    if (bundleBtn) {
      bundleBtn.onclick = () => {
        window.location.href = apiUrl(`/api/exams/${encodeURIComponent(record.id)}/bundle.zip?format=docx`);
        notify('Đang tải trọn bộ hồ sơ đề thi theo tùy chọn của Thầy/Cô...');
      };
    }
    const stuBtn = $('#cexp-btn-download-student');
    if (stuBtn) {
      stuBtn.onclick = () => {
        window.location.href = apiUrl(`${base}?format=docx&answers=0`);
      };
    }
    const ansBtn = $('#cexp-btn-download-answers');
    if (ansBtn) {
      ansBtn.onclick = () => {
        window.location.href = apiUrl(`${base}?format=docx&answers=1`);
      };
    }
    const printBtn = $('#cexp-btn-print');
    if (printBtn) {
      printBtn.onclick = () => {
        const isAns = $('#cexp-chk-answers')?.checked;
        window.open(apiUrl(`${base}?format=html&answers=${isAns ? 1 : 0}`), '_blank');
      };
    }

    dlg.showModal();
  }

  // =========================================================================
  // HỘP THOẠI TÙY BIẾN XUẤT ĐỀ CƯƠNG ÔN TẬP (HỘP TÍCH CHỌN)
  // =========================================================================
  function openCustomRevExportDialog(revId) {
    const dlg = $('#custom-rev-export-dialog');
    if (!dlg) return;
    const container = $('#custom-rev-export-content');
    if (!container) return;

    const list = store.revisions || [];
    const record = list.find(r => r.id === revId) || list[0];
    if (!record) {
      notify('Không tìm thấy thông tin đề cương ôn tập.', true);
      return;
    }

    const base = '/api/revisions/' + encodeURIComponent(record.id) + '/export';

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
        <div style="background:#F3F4F8;border:1px solid #D5D9E4;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <strong style="color:#4A3AA8;font-size:14px">${esc(record.title || 'Đề cương ôn tập')}</strong>
            <div style="font-size:12px;color:#5B6475;margin-top:2px">
              Khối ${esc(record.grade)} · ${countRecord(record)} câu hỏi ôn tập · Ngày tạo: ${esc(date(record.created_at))}
            </div>
          </div>
          <span class="badge ${record.status === 'published' ? 'approved' : record.status === 'locked' ? '' : 'draft'}">
            ${record.status === 'published' ? 'Đã phát hành' : record.status === 'locked' ? 'Đã khóa' : 'Đang soạn'}
          </span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div style="background:#fff;border:1px solid #E4E7F0;border-radius:8px;padding:14px">
            <h4 style="margin:0 0 10px;color:#4A3AA8;font-size:13px;border-bottom:1px solid #F3F4F8;padding-bottom:6px">
              1. Cấu trúc nội dung đề cương:
            </h4>
            <div style="display:flex;flex-direction:column;gap:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="crev-chk-table-a" checked>
                <span><strong>Bảng A: Giới hạn kiến thức ôn tập</strong> (Tên bài, số tiết, YCCĐ)</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="crev-chk-student-doc" checked>
                <span><strong>Bản đề cương học sinh</strong> (Ẩn đáp án, chừa dòng kẻ ghi chú)</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="crev-chk-teacher-doc" checked>
                <span><strong>Bản giáo viên</strong> (In đậm đáp án, kèm lời giải &amp; rubric)</span>
              </label>
            </div>
          </div>

          <div style="background:#fff;border:1px solid #E4E7F0;border-radius:8px;padding:14px">
            <h4 style="margin:0 0 10px;color:#4A3AA8;font-size:13px;border-bottom:1px solid #F3F4F8;padding-bottom:6px">
              2. Sắp xếp &amp; Phân nhóm câu hỏi:
            </h4>
            <div style="margin-bottom:10px">
              <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:4px">Quy cách gom nhóm câu hỏi:</label>
              <div style="display:flex;flex-direction:column;gap:6px;font-size:12px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input type="radio" name="crev_grouping" value="lesson" checked>
                  <strong>Gom theo Bài học (PPCT)</strong> (Học sinh ôn tập cuốn chiếu từng bài)
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input type="radio" name="crev_grouping" value="type">
                  <strong>Gom theo Dạng câu</strong> (Trắc nghiệm NLC, Đúng/Sai, Tự luận)
                </label>
              </div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="crev-chk-school-header" checked>
              <span>Tiêu đề nhận diện Trường Quốc tế Á Châu (Năm học 2026-2027)</span>
            </label>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E4E7F0;padding-top:14px;margin-top:6px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;gap:8px">
            <button type="button" class="button primary" id="crev-btn-download-student" style="background:#4A3AA8;border-color:#4A3AA8;font-weight:700">
              Word Đề cương học sinh (.docx)
            </button>
            <button type="button" class="button" id="crev-btn-download-teacher" style="font-weight:600">
              Word Đề cương giáo viên (.docx)
            </button>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="button" id="crev-btn-print" style="font-weight:600">
              Mở trang in
            </button>
            <button type="button" class="button quiet" data-close="custom-rev-export-dialog">Đóng</button>
          </div>
        </div>
      </div>
    `;

    const stuBtn = $('#crev-btn-download-student');
    if (stuBtn) stuBtn.onclick = () => { window.location.href = apiUrl(`${base}?format=docx&answers=0`); };
    const teaBtn = $('#crev-btn-download-teacher');
    if (teaBtn) teaBtn.onclick = () => { window.location.href = apiUrl(`${base}?format=docx&answers=1`); };
    const printBtn = $('#crev-btn-print');
    if (printBtn) printBtn.onclick = () => { window.open(apiUrl(`${base}?format=html`), '_blank'); };

    dlg.showModal();
  }

  // =========================================================================
  // HỘP THOẠI TÙY BIẾN XUẤT NGÂN HÀNG CÂU HỎI (HỘP TÍCH CHỌN)
  // =========================================================================
  function openCustomBankExportDialog() {
    const dlg = $('#custom-bank-export-dialog');
    if (!dlg) return;
    const container = $('#custom-bank-export-content');
    if (!container) return;

    const curGrade = Number(store.filters.grade) || effectiveGrade();
    const isThpt = curGrade >= 10;
    const countTotal = (store.bank?.questions || []).length;
    const countFiltered = filtered().length;
    const countSelected = store.selected ? store.selected.size : 0;

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
        <div style="background:#F3F4F8;border:1px solid #D5D9E4;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <strong style="color:#4A3AA8;font-size:14px">Ngân hàng câu hỏi: Môn ${esc(subject())}</strong>
            <div style="font-size:12px;color:#5B6475;margin-top:2px">
              Tổng số: <strong>${countTotal}</strong> câu · Đang lọc: <strong>${countFiltered}</strong> câu · Đang tích chọn: <strong>${countSelected}</strong> câu
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div style="background:#fff;border:1px solid #E4E7F0;border-radius:8px;padding:14px">
            <h4 style="margin:0 0 10px;color:#4A3AA8;font-size:13px;border-bottom:1px solid #F3F4F8;padding-bottom:6px">
              1. Phạm vi &amp; Trạng thái câu hỏi (Hộp chọn):
            </h4>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${countSelected > 0 ? `
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;color:#4A3AA8;font-weight:600">
                <input type="radio" name="cbank_scope" value="selected" checked>
                <span>Chỉ xuất các câu <strong>ĐÃ TÍCH CHỌN (${countSelected} câu)</strong></span>
              </label>` : ''}
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="radio" name="cbank_scope" value="filtered" ${countSelected === 0 ? 'checked' : ''}>
                <span>Chỉ xuất danh sách câu <strong>đang khớp bộ lọc (${countFiltered} câu)</strong></span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="radio" name="cbank_scope" value="all">
                <span>Xuất <strong>toàn bộ ngân hàng câu hỏi (${countTotal} câu)</strong></span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px">
                <input type="checkbox" id="cbank-chk-approved-only">
                <span>Chỉ lấy câu <strong>đã kiểm duyệt (Approved)</strong></span>
              </label>
            </div>
          </div>

          <div style="background:#fff;border:1px solid #E4E7F0;border-radius:8px;padding:14px">
            <h4 style="margin:0 0 10px;color:#4A3AA8;font-size:13px;border-bottom:1px solid #F3F4F8;padding-bottom:6px">
              2. Các dạng câu cần xuất (Tích chọn):
            </h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="cbank-type-mc" checked>
                <span>Trắc nghiệm (MC)</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:${isThpt ? 'pointer' : 'not-allowed'};opacity:${isThpt ? '1' : '0.55'}">
                <input type="checkbox" id="cbank-type-yn" ${isThpt ? 'checked' : 'disabled'}>
                <span>Đúng/Sai (YN)</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:${isThpt ? 'pointer' : 'not-allowed'};opacity:${isThpt ? '1' : '0.55'}">
                <input type="checkbox" id="cbank-type-short" ${isThpt ? 'checked' : 'disabled'}>
                <span>Trả lời ngắn (SHORT)</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="cbank-type-es" checked>
                <span>Tự luận (ES)</span>
              </label>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E4E7F0;padding-top:14px;margin-top:6px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;gap:8px">
            <button type="button" class="button primary" id="cbank-btn-export-excel" style="background:#1F6B52;border-color:#1F6B52;color:#fff;font-weight:700">
              Xuất Bảng tính Excel (.csv)
            </button>
            <button type="button" class="button" id="cbank-btn-export-json" style="font-weight:600">
              Xuất tệp JSON
            </button>
            <button type="button" class="button" id="cbank-btn-export-md" style="font-weight:600">
              Xuất Markdown (.md)
            </button>
          </div>
          <button type="button" class="button quiet" data-close="custom-bank-export-dialog">Đóng</button>
        </div>
      </div>
    `;

    function getTargetQuestions() {
      const scope = document.querySelector('input[name="cbank_scope"]:checked')?.value || 'filtered';
      let pool = [];
      if (scope === 'selected') {
        pool = questions().filter(q => store.selected.has(q.id));
      } else if (scope === 'filtered') {
        pool = filtered();
      } else {
        pool = questions();
      }

      if ($('#cbank-chk-approved-only')?.checked) {
        pool = pool.filter(q => q.review_status === 'approved');
      }

      const mc = $('#cbank-type-mc')?.checked;
      const yn = $('#cbank-type-yn')?.checked;
      const sh = $('#cbank-type-short')?.checked;
      const es = $('#cbank-type-es')?.checked;

      return pool.filter(q => {
        if (q.type === 'MC' && !mc) return false;
        if (q.type === 'YN' && !yn) return false;
        if (q.type === 'SHORT' && !sh) return false;
        if (q.type === 'ES' && !es) return false;
        return true;
      });
    }

    $('#cbank-btn-export-excel').onclick = () => {
      const qList = getTargetQuestions();
      const g = curGrade;
      const subj = subject();
      if (typeof TableFileHelper !== 'undefined') {
        if (!qList.length) {
          const sample = TableFileHelper.getSampleBankRows(g, subj);
          TableFileHelper.downloadCsv(sample, `Mau_cau_hoi_${C.normalize(subj).replace(/\\s+/g, '_')}_K${g}.csv`);
          notify('Không có câu hỏi phù hợp với bộ lọc đã chọn; đã xuất file mẫu.');
          return;
        }
        const headers = ['Ma_cau', 'Dang_cau', 'Khoi', 'Ma_bai', 'Ten_bai', 'Muc_do', 'Noi_dung_cau_hoi', 'Dap_an', 'Y_dung_sai', 'Loi_giai', 'Yeu_cau_can_dat', 'Nang_luc', 'Thang_diem'];
        const rows = [headers];
        for (const q of qList) {
          let ansStr = '';
          let ynStr = '';
          if (q.type === 'MC') {
            ansStr = String.fromCharCode(65 + (Number(q.correct) || 0));
          } else if (q.type === 'YN' && Array.isArray(q.branches)) {
            ynStr = q.branches.map(b => (b.correct ? 'Đ' : 'S')).join(';');
          } else if (q.type === 'SHORT') {
            ansStr = q.answer || '';
          }
          rows.push([
            q.id || '',
            q.type || 'MC',
            q.grade || g,
            q.lesson_code || '',
            q.lesson_title || '',
            q.level || 'Biết',
            q.question || '',
            ansStr,
            ynStr,
            q.explanation || '',
            q.learning_outcome || '',
            q.competency || '',
            q.points ?? (q.type === 'MC' ? 0.25 : q.type === 'YN' ? 1.0 : q.type === 'SHORT' ? 0.5 : 1.0)
          ]);
        }
        TableFileHelper.downloadCsv(rows, `Ngan_hang_cau_hoi_${C.normalize(subj).replace(/\\s+/g, '_')}_K${g}_${qList.length}cau.csv`);
        notify(`Đã xuất ${qList.length} câu hỏi ra bảng tính Excel.`);
      }
    };

    $('#cbank-btn-export-json').onclick = () => {
      const qList = getTargetQuestions();
      const g = curGrade;
      const subj = subject();
      const payload = {
        subject: subj,
        grade: g,
        exported_at: new Date().toISOString(),
        total_questions: qList.length,
        questions: qList
      };
      triggerTextDownload(JSON.stringify(payload, null, 2), 'application/json;charset=utf-8', `Ngan_hang_cau_hoi_${C.normalize(subj).replace(/\\s+/g, '_')}_K${g}_${qList.length}cau.json`);
      notify(`Đã xuất ${qList.length} câu hỏi ra tệp JSON.`);
    };

    $('#cbank-btn-export-md').onclick = () => {
      const qList = getTargetQuestions();
      const g = curGrade;
      const subj = subject();
      if (!qList.length) {
        downloadBankMdSample(curGrade);
        return;
      }
      let md = `# NGÂN HÀNG CÂU HỎI MÔN ${subj.toUpperCase()} - KHỐI ${g}\n\n`;
      qList.forEach((q, idx) => {
        md += `### Câu ${idx + 1} (${q.type}):\n${q.question}\n`;
        if (q.type === 'MC' && Array.isArray(q.options)) {
          q.options.forEach((opt, oIdx) => {
            md += `${String.fromCharCode(65 + oIdx)}. ${opt}\n`;
          });
          md += `*Đáp án:* ${String.fromCharCode(65 + (Number(q.correct) || 0))}\n`;
        } else if (q.type === 'YN' && Array.isArray(q.branches)) {
          q.branches.forEach((b, bIdx) => {
            md += `${String.fromCharCode(97 + bIdx)}) [${b.correct ? 'Đúng' : 'Sai'}] ${b.content}\n`;
          });
        } else if (q.type === 'SHORT') {
          md += `*Đáp án:* ${q.answer || ''}\n`;
        }
        md += `*Mức độ:* ${q.level || 'Biết'}\n`;
        md += `*Bài học:* ${q.lesson_code || ''}\n`;
        if (q.explanation) md += `*Lời giải:* ${q.explanation}\n`;
        md += `\n`;
      });
      triggerTextDownload(md, 'text/markdown;charset=utf-8', `Ngan_hang_cau_hoi_${C.normalize(subj).replace(/\\s+/g, '_')}_K${g}_${qList.length}cau.md`);
      notify(`Đã xuất ${qList.length} câu hỏi ra file Markdown.`);
    };

    dlg.showModal();
  }

function renderBank(){
 const f=store.filters;
 const bankGradeForSample=()=>Number(store.filters.grade)||effectiveGrade();
 $('#bank').innerHTML=title('Biên soạn & tra cứu','Ngân hàng câu hỏi','Lọc theo chương trình, xem đáp án và lưu những câu cần dùng.',`<button class="primary" id="add-question">+ Thêm câu hỏi</button><button type="button" class="button" id="bank-custom-export-btn" style="background:#4A3AA8;color:#fff;border-color:#4A3AA8;font-weight:700">Tùy biến xuất Ngân hàng</button><button type="button" class="button" id="export-bank-lms">Xuất Word LMS</button><a class="button" href="/api/bank/export">Xuất JSON</a><button id="import-bank" style="font-weight:700">Nhập câu hỏi (Excel / JSON / Markdown)</button><input class="json-import" id="import-file" type="file" accept=".xlsx,.xls,.csv,.tsv,.json,.md,.txt">`)+
 `<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
   <button type="button" class="button" id="bank-download-excel-sample" style="background:#1F6B52;color:#fff;border-color:#1F6B52;padding:6px 12px;font-size:12px;font-weight:700">Tải mẫu câu hỏi (Excel)</button>
   <button type="button" class="button quiet" id="bank-download-json-sample" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Tải mẫu câu hỏi (JSON)</button>
   <button type="button" class="button quiet" id="bank-download-md-sample" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Tải mẫu câu hỏi (Markdown)</button>
   <button type="button" class="button primary" id="bank-open-ai-prompt-dialog" style="background:#4A3AA8;border-color:#4A3AA8;padding:6px 14px;font-size:12px;font-weight:700">Hướng dẫn &amp; Chép Prompt AI theo bài (3 phần)</button>
 </div>`+
 `<div class="card"><div class="filters"><div class="field"><label for="filter-grade">Khối lớp</label><select id="filter-grade">${opt('','Tất cả khối',!f.grade)}${gradeOptions(f.grade)}</select></div><div class="field"><label for="filter-lesson">Bài học</label><select id="filter-lesson">${lessonFilterOptions()}</select></div><div class="field"><label for="filter-type">Dạng câu</label><select id="filter-type">${opt('','Tất cả dạng',!f.type)}${Object.entries(typeNames).map(([k,v])=>opt(k,v,f.type===k)).join('')}</select></div><div class="field"><label for="filter-level">Mức độ</label><select id="filter-level">${opt('','Tất cả mức độ',!f.level)}${C.levelOptions(f.level)}</select></div><div class="field"><label for="filter-competency">Năng lực</label><select id="filter-competency">${opt('','Tất cả NL',!f.competency)}${['NLa','NLb','NLc','NLd','NLe'].map(c=>opt(c,c,f.competency===c)).join('')}</select></div><div class="field"><label for="filter-section">Mạch PPCT</label><select id="filter-section">${opt('','Tất cả mạch',!f.section)}${opt('core','Nội dung cốt lõi (Mục II.1)',f.section==='core')}${opt('elective_topic','Chuyên đề học tập (Mục II.2)',f.section==='elective_topic')}</select></div><div class="field"><label for="filter-status">Trạng thái</label><select id="filter-status">${opt('active','Đang sử dụng',f.status==='active')}${Object.entries(statusNames).map(([k,v])=>opt(k,v,k===f.status)).join('')}${opt('all','Tất cả trạng thái',f.status==='all')}</select></div><div class="field search"><label for="filter-search">Tìm trong câu hỏi, mã câu, phương án hoặc YCCĐ</label><input id="filter-search" type="search" placeholder="Tìm nội dung, mã câu hoặc yêu cầu cần đạt…" value="${esc(f.search)}"></div></div></div>`+
 `<div class="bank-layout"><div><div id="bank-toolbar"></div><div id="bank-list" class="question-list"></div><div id="bank-pagination"></div></div><aside class="bank-aside card"><h2>Câu đã chọn</h2><div id="selection-summary"></div><div class="callout">Lựa chọn được giữ khi đổi bộ lọc. Khi lưu đề cương, ứng dụng chỉ lấy câu thuộc khối đã chọn.</div><div class="actions" style="margin-bottom:10px"><a class="button primary" href="#revisions">Tạo đề cương từ lựa chọn</a><button class="quiet" id="clear-selection">Bỏ chọn tất cả</button></div><div class="bulk-box"><label for="bulk-status-select">Thao tác hàng loạt với câu đã chọn</label><div class="actions" style="margin-top:6px"><button type="button" class="primary" id="bulk-approve-selected">Duyệt nhanh đã chọn</button><button type="button" class="danger" id="bulk-delete-selected">Xóa câu đã chọn</button></div><div class="actions" style="margin-top:6px"><select id="bulk-status-select" style="flex:1;min-width:140px">${Object.entries(statusNames).filter(([k])=>['pending_review','archived'].includes(k)).map(([k,v])=>opt(k,`Đổi thành: ${v}`)).join('')}</select><button type="button" id="bulk-apply-status">Áp dụng</button></div><div style="display:flex;gap:6px;align-items:center;margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);flex-wrap:wrap"><select id="bulk-grade-select" style="flex:1;min-width:130px;padding:5px 8px;font-size:12px;border-radius:4px;border:1px solid #D5D9E4">${[6,7,8,9,10,11,12].map(gr=>`<option value="${gr}">Chuyển sang Khối ${gr}</option>`).join('')}</select><button type="button" id="bulk-apply-grade" style="background:#4A3AA8;color:#fff;border-color:#4A3AA8;font-weight:700;font-size:12px;padding:5px 12px">Chuyển Khối</button></div><div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)"><button type="button" id="bank-auto-split-grades" style="background:#F2F0FB;border:1px solid #4A3AA8;color:#4A3AA8;padding:6px 12px;border-radius:4px;font-size:12px;font-weight:700;width:100%;cursor:pointer;text-align:center">Tự động quét &amp; phân tách câu hỏi Khối 8 / Khối 9</button></div></div><hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><p class="small muted">Bấm nội dung câu để xem đáp án, giải thích, thang điểm và yêu cầu cần đạt. Dùng các nút bên phải mỗi câu để Sửa, Nhân bản, Lưu trữ/Khôi phục hoặc Xóa.</p></aside></div>`;
 $('#add-question').onclick=()=>openEditor();$('#import-bank').onclick=()=>$('#import-file').click();$('#import-file').onchange=importBank;
 const btnBankCustomExp = $('#bank-custom-export-btn');
 if (btnBankCustomExp) btnBankCustomExp.onclick = () => openCustomBankExportDialog();
 const btnBankExcel = $('#bank-download-excel-sample');
 if (btnBankExcel) btnBankExcel.onclick = () => downloadBankExcelSample(bankGradeForSample());
 const btnBankJson = $('#bank-download-json-sample');
 if (btnBankJson) btnBankJson.onclick = () => downloadBankJsonSample(bankGradeForSample());
 const btnBankMd = $('#bank-download-md-sample');
 if (btnBankMd) btnBankMd.onclick = () => downloadBankMdSample(bankGradeForSample());
 const btnBankPrompt = $('#bank-open-ai-prompt-dialog');
 if (btnBankPrompt) btnBankPrompt.onclick = () => openBankAiPromptDialog(bankGradeForSample());
 $('#export-bank-lms').onclick=()=>{const ids=[...store.selected];const g=store.filters.grade;const url='/api/bank/export-lms?'+(ids.length?'ids='+ids.join(','):(g?'grade='+g:''));window.open(apiUrl(url),'_blank');};
 ['grade','lesson','type','level','section','status','competency'].forEach(k=>$('#filter-'+k).onchange=ev=>{store.filters[k]=ev.target.value;store.page=1;if(k==='grade'){store.filters.lesson='';setActiveGrade(ev.target.value||'all');return;}renderBankList();});
 $('#filter-search').oninput=ev=>{store.filters.search=ev.target.value;store.page=1;renderBankList();};$('#clear-selection').onclick=()=>{store.selected.clear();renderBankList();};
 $('#bulk-approve-selected').onclick=()=>bulkUpdateSelected('bulk_approve');
 $('#bulk-apply-status').onclick=()=>bulkUpdateSelected('status',$('#bulk-status-select').value);
 $('#bulk-delete-selected').onclick=()=>bulkUpdateSelected('delete');
 const btnBulkGrade = $('#bulk-apply-grade');
 if (btnBulkGrade) btnBulkGrade.onclick = () => bulkUpdateSelected('grade', Number($('#bulk-grade-select').value) || 9);
 const btnAutoSplit = $('#bank-auto-split-grades');
 if (btnAutoSplit) btnAutoSplit.onclick = autoSplitK8K9Questions;
 renderBankList();
}
function lessonFilterOptions(){const f=store.filters;const unique=new Map(instructionalLessons(f.grade,undefined,{includeElective:true}).map(l=>[l.lesson_code,l]));return opt('','Tất cả bài',!f.lesson)+[...unique.values()].map(l=>opt(l.lesson_code,lessonOptionLabel(l),f.lesson===l.lesson_code)).join('');}
function renderBankList(){
 const result=filtered(),size=15,pages=Math.max(1,Math.ceil(result.length/size));store.page=Math.min(store.page,pages);const slice=result.slice((store.page-1)*size,store.page*size);
 $('#bank-toolbar').innerHTML=`<div class="list-toolbar"><span><strong>${result.length}</strong> câu khớp bộ lọc</span><div class="actions"><button id="select-filter" class="quiet">Chọn tất cả câu đang lọc</button><button id="reset-filter" class="quiet">Đặt lại bộ lọc</button></div></div>`;
 $('#bank-list').innerHTML=slice.length?slice.map(q=>`<article class="q-card"><input type="checkbox" aria-label="Chọn câu hỏi" data-check="${esc(q.id)}"${store.selected.has(q.id)?' checked':''}><div class="q-card-body"><button class="q-open" data-detail="${esc(q.id)}"><span class="q-meta"><span class="badge">Khối ${q.grade} · ${esc(q.lesson_code)}</span><span class="badge">${esc(typeNames[q.type]||q.type)} · ${esc(q.level)}</span>${q.competency ? `<span class="badge" style="background:#FBF4E4;color:#8A5A00;font-weight:700">NL: ${esc(q.competency)}</span>` : ''}${badge(q)}${questionSectionBadge(q)}${isTechId(q.id)?'':`<span class="q-id">${esc(q.id)}</span>`}</span><div class="q-text">${esc(q.question)}</div><div class="small muted" style="margin-top:4px"><em>YCCĐ:</em> ${esc(q.learning_outcome || 'Chưa gắn YCCĐ')}${q.competency ? ` · <strong style="color:#8A5A00">NL: ${esc(q.competency)}</strong>` : ' · <span class="muted">(Chưa gắn NL)</span>'}</div></button><div class="q-row-actions"><button type="button" class="export-link" data-detail="${esc(q.id)}">Xem</button><button type="button" class="export-link" data-edit="${esc(q.id)}">Sửa</button><button type="button" class="export-link" data-dup-q="${esc(q.id)}">Nhân bản</button>${q.review_status==='archived'?`<button type="button" class="export-link" data-restore-q="${esc(q.id)}">Khôi phục</button>`:`<button type="button" class="export-link" data-archive="${esc(q.id)}">Lưu trữ</button>`}<button type="button" class="export-link danger" data-del-q="${esc(q.id)}">Xóa</button></div></div></article>`).join(''):empty('Không có câu phù hợp','Thử đổi bài, mức độ hoặc từ khóa tìm kiếm.');
 $('#bank-pagination').innerHTML=`<div class="pagination"><button id="prev-page"${store.page<=1?' disabled':''}>← Trước</button><span>Trang ${store.page} / ${pages}</span><button id="next-page"${store.page>=pages?' disabled':''}>Sau →</button></div>`;
 $('#select-filter').onclick=()=>{result.filter(q=>q.review_status!=='archived').forEach(q=>store.selected.add(q.id));renderBankList();};$('#reset-filter').onclick=()=>{store.filters={grade:'',lesson:'',type:'',level:'',section:'',status:'active',search:'',competency:''};store.page=1;renderBank();};$('#prev-page').onclick=()=>{store.page--;renderBankList();};$('#next-page').onclick=()=>{store.page++;renderBankList();};
  setTimeout(() => renderLatex($('#bank-list')), 40);
 $('#selection-summary').innerHTML=`<strong style="font-size:28px;color:var(--navy)">${store.selected.size}</strong><span class="muted"> câu được chọn</span><p class="small muted">${grades().map(g=>`Khối ${g}: ${C.revisionIds(questions(),[...store.selected],g).length}`).join(' · ')}</p>`;
}
function showDetail(id){
 const q=questions().find(q=>q.id===id);if(!q)return;$('#detail-dialog').classList.remove('wide-dialog');
 const answer=q.type==='MC'
  ?`<ol class="options">${(q.options||[]).map((v,i)=>`<li class="${i===q.correct?'correct':''}">${i===q.correct?'<span class="answer-label">ĐÁP ÁN ĐÚNG</span>':''}<strong>${'ABCD'[i]}.</strong> ${esc(v)}<span class="explanation">${esc(q.option_explanations?.[i]||'Chưa có giải thích.')}</span></li>`).join('')}</ol>`
  :q.type==='YN'
   ?`<ol class="options">${(q.statements||[]).map((st,i)=>`<li class="${st.correct?'correct':''}"><strong>${esc(st.label||'abcd'[i])})</strong> ${esc(st.text)} <span class="answer-label">${st.correct?'ĐÚNG':'SAI'}</span></li>`).join('')}</ol>`
   :q.type==='SHORT'
    ?`<div class="callout"><strong>Đáp án trả lời ngắn:</strong> ${esc(C.shortAnswerOf(q)||'Chưa có đáp án')}</div>`
    :`<h3>Thang điểm · ${q.max_score||1} điểm</h3><ol class="rubric">${(q.rubric||[]).map(r=>`<li>${esc(r.criterion)} <strong>(${r.points} điểm)</strong></li>`).join('')}</ol><p class="muted">${esc(q.equivalent_answer_policy||'')}</p>`;
 $('#detail-content').innerHTML=`<div class="dialog-heading"><h2 id="detail-title">Chi tiết câu hỏi</h2><button data-close="detail-dialog" class="quiet">Đóng</button></div><div class="q-meta"><span class="badge">Khối ${q.grade} · ${esc(q.lesson_code)} · ${esc(q.level)}</span><span class="badge">${esc(typeNames[q.type]||q.type)}</span>${q.competency ? `<span class="badge" style="background:#FBF4E4;color:#8A5A00;font-weight:700">NL: ${esc(q.competency)}</span>` : ''}${badge(q)}${questionSectionBadge(q)}${isTechId(q.id)?'':`<span class="q-id">${esc(q.id)}</span>`}</div><div class="question-text" style="white-space:normal">${C.questionTextHtml(q.question)}</div>${answer}<div class="callout"><strong>Yêu cầu cần đạt &amp; Năng lực</strong><br>${esc(q.learning_outcome||'Chưa gắn YCCĐ')}${q.competency ? `<br><span class="badge" style="background:#FBF4E4;color:#8A5A00;font-weight:700;margin-top:6px;display:inline-block">Năng lực: ${esc(q.competency)}</span>` : '<br><span class="small muted" style="margin-top:4px;display:inline-block">(Chưa gắn NL — có thể bấm "Sửa câu hỏi" để bổ sung)</span>'}</div><p class="small muted">${esc(q.lesson_name||'')} · ${esc(q.response_mode||typeNames[q.type])}</p><details class="detail-source"><summary>Nguồn đối chiếu PPCT</summary><p>${esc(q.source_file||'Theo danh mục PPCT')}</p><p>${(q.source_rows||[]).map(r=>`Tuần ${esc(r.week_raw)} · Tiết ${esc(r.periods_raw)}`).join('<br>')}</p></details><div class="dialog-bottom"><button data-edit="${esc(q.id)}" class="primary">Sửa câu hỏi</button><button data-dup-q="${esc(q.id)}">Nhân bản câu</button>${q.review_status==='archived'?`<button data-restore-q="${esc(q.id)}">Khôi phục sử dụng</button>`:`<button data-archive="${esc(q.id)}">Lưu trữ tạm</button>`}<button data-del-q="${esc(q.id)}" class="danger">Xóa vĩnh viễn</button></div>`;
 $('#detail-dialog').showModal(); setTimeout(() => renderLatex($('#detail-dialog')), 40);
}
function fmtPts(v){return typeof v==='number'?String(Math.round(v*1000)/1000).replace('.',','):String(v??'');}
function scaledPolicy(q){
 const policy=q.equivalent_answer_policy||'';const scale=(q.points??q.max_score??1)/(q.max_score||1);if(scale===1)return policy;
 return policy.replace(/(tổng điểm không vượt|không vượt|tối đa)\s+(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*điểm/gi,(m,pfx,cap,amt)=>{const val=parseFloat((cap||amt).replace(',','.'))*scale;return pfx?`${pfx} ${fmtPts(val)}`:`${fmtPts(val)} điểm`;});
}
function revisionGoals(record){
 if(Array.isArray(record.knowledge_scope)&&record.knowledge_scope.length){
  return record.knowledge_scope.map(r=>({
   topic:r.topic||'',
   name:r.name||r.lesson||'',
   goals:Array.isArray(r.goals)?r.goals:[String(r.goals||'')]
  }));
 }
 const map=new Map();
 const ppctList=lessons(record.grade,record.subject_name);
 for(const q of record.questions||[]){
  const key=q.lesson_code||q.lesson_name||'';
  const matched=ppctList.find(l=>l.lesson_code===q.lesson_code);
  if(!map.has(key))map.set(key,{topic:q.topic_source||matched?.topic_source||'',name:q.lesson_name||matched?.lesson_name_source||key,goals:[]});
  const row=map.get(key);if(q.learning_outcome&&!row.goals.includes(q.learning_outcome))row.goals.push(q.learning_outcome);
 }
 return [...map.values()];
}
const syncEditedQuestionsFromSheet=C.syncEditedQuestionsFromSheet;
// B6: tiêu chí đề cương T = (trùng + bám sát đã duyệt) / tổng ≥ 90%, độ bao phủ YCCĐ 100%.
function revisionCriterionHtml(record){
 const c=record.revision_check||(record.verification&&record.verification.revision_criterion);if(!c)return '';
 const rev=store.revisions.find(r=>r.id===record.revision_id),revQs=rev?.questions||[],marks=record.close_matches||{},editable=C.examEditable(record);
 const qById=Object.fromEntries((record.questions||[]).map(q=>[q.id,q]));
 const statusName={pending:'Chờ duyệt',approved:'Đã duyệt',rejected:'Không công nhận'};
 const row=qid=>{const q=qById[qid]||{},m=marks[qid],same=revQs.filter(r=>r.lesson_code===q.lesson_code),choices=(same.length?same:revQs);
  return `<tr><td>Câu ${esc(q.slot_number??'')}</td><td>${esc((q.question||'').slice(0,140))}</td><td>${m?`<span class="badge ${m.status==='approved'?'approved':m.status==='pending'?'pending_review':'needs_review'}">${esc(statusName[m.status]||m.status)}</span><br><span class="small muted">Gốc: ${esc(m.revision_question_id)} · ${esc(m.reason)}${m.approved_by?' · duyệt: '+esc(m.approved_by):''}${m.review_reason?' · '+esc(m.review_reason):''}</span>`:'<span class="small muted">Ngoài đề cương</span>'}</td><td>${!editable?'':
   (m&&m.status==='pending'?`<button type="button" class="export-link primary" data-close-review="approve" data-qid="${esc(qid)}">Duyệt bám sát</button> <button type="button" class="export-link" data-close-review="reject" data-qid="${esc(qid)}">Không công nhận</button>`:
   `<select data-close-rev="${esc(qid)}" aria-label="Câu gốc trong đề cương cho câu ${esc(q.slot_number??'')}">${choices.map(r=>opt(r.id,`${r.id} · ${(r.question||'').slice(0,80)}`,m?.revision_question_id===r.id)).join('')}</select><input data-close-reason="${esc(qid)}" placeholder="Lý do bám sát (bắt buộc)" aria-label="Lý do bám sát"><button type="button" class="export-link" data-close-mark="${esc(qid)}">Đánh dấu bám sát</button>`)}</td></tr>`;};
 const listed=[...c.close_approved,...c.outside];
 return `<div class="doc-sheet"><h4>TIÊU CHÍ ĐỀ CƯƠNG ${c.passed?'<span class="badge approved">Đạt</span>':'<span class="badge needs_review">Chưa đạt</span>'}</h4>
  <p><strong>T = ${esc(String(c.t_percent).replace('.',','))}%</strong> = (${c.exact_count} câu trùng + ${c.close_count} câu bám sát đã duyệt) / ${c.total} câu · cần ≥ ${esc(c.threshold)}% (${c.required} câu).
  Tỉ lệ theo điểm (tham khảo): ${esc(String(c.points_percent).replace('.',','))}%. Độ bao phủ YCCĐ: <strong>${esc(String(c.coverage.percent).replace('.',','))}%</strong> điểm (cần 100%).</p>
  ${c.coverage.missing.length?`<div class="callout error">YCCĐ không có trong đề cương: ${c.coverage.missing.map(m=>`Câu ${esc(m.slot_number??'')} (${esc(m.lesson_code||'')} · ${esc(m.learning_outcome||'')})`).join('; ')}</div>`:''}
  <p class="small">Cách tính: <select data-rev-policy aria-label="Cách tính tiêu chí đề cương"${editable?'':' disabled'}>${opt('trung_va_bam_sat','Trùng + bám sát đã duyệt',c.mode==='trung_va_bam_sat')}${opt('chi_trung','Chỉ tính câu trùng',c.mode==='chi_trung')}</select>${editable?' <button type="button" class="export-link" data-rev-policy-save>Lưu cách tính</button>':''}</p>
  ${listed.length?`<div class="table-wrap"><table><thead><tr><th>Câu</th><th>Nội dung</th><th>Bám sát</th><th></th></tr></thead><tbody>${listed.map(row).join('')}</tbody></table></div>`:'<p class="small muted">Tất cả câu đều trùng với đề cương.</p>'}
  <p class="small muted">Câu bám sát chỉ được tính sau khi được duyệt. Đề đã khóa không đổi được câu bám sát.</p></div>`;
}
async function closeMatchAct(hostEl,record,isInline,el){
 const refresh=async()=>{const updated=store.exams.find(x=>x.id===record.id)||record;mountExamViewerContent(hostEl,updated,'verify',isInline);};
 let done=null;
 if(el.dataset.closeMark){const qid=el.dataset.closeMark,reason=(hostEl.querySelector(`[data-close-reason="${CSS.escape(qid)}"]`)?.value||'').trim(),rid=hostEl.querySelector(`[data-close-rev="${CSS.escape(qid)}"]`)?.value;
  if(!reason)return notify('Cần ghi lý do câu bám sát đề cương.',true);
  done=await mutate('/api/exams/close-match',{id:record.id,question_id:qid,revision_question_id:rid,reason},r=>{if(r.exams)store.exams=r.exams;});}
 else if(el.dataset.closeReview){const payload={id:record.id,question_id:el.dataset.qid,action:el.dataset.closeReview};
  if(payload.action==='reject'){const reason=prompt('Lý do không công nhận bám sát (bắt buộc):');if(!reason||!reason.trim())return notify('Cần ghi lý do.',true);payload.reason=reason.trim();}
  done=await mutate('/api/exams/close-match/review',payload,r=>{if(r.exams)store.exams=r.exams;});}
 else if(el.dataset.revPolicySave!==undefined){done=await mutate('/api/exams/update',{id:record.id,revision_policy:hostEl.querySelector('[data-rev-policy]').value},r=>{if(r.exams)store.exams=r.exams;else if(r.exam)store.exams=store.exams.map(x=>x.id===r.exam.id?r.exam:x);});}
 if(done){await refresh();notify('Đã cập nhật tiêu chí đề cương.');}
}
// B4: bảng đối chiếu từng ô (bài × YCCĐ × dạng × mức độ) và cảnh báo tỉ lệ CV 7991 (chỉ cảnh báo).
function cellReportHtml(v){
 if(!v||(!v.cells&&!(v.ratio_warnings||[]).length&&!(v.reuse_warnings||[]).length))return '';
 const kindName={MC:'Nhiều lựa chọn',YN:'Đúng/Sai',SHORT:'Trả lời ngắn',ES:'Tự luận'};
 const bad=(v.cells?.cells||[]).filter(c=>!c.ok).length;
 return `<div class="doc-sheet"><h4>ĐỐI CHIẾU TỪNG Ô MA TRẬN ${v.cells?(v.cells.ok?'<span class="badge approved">Khớp tất cả ô</span>':`<span class="badge needs_review">${bad} ô lệch</span>`):''}</h4>`+
  (v.cells?`<div class="table-wrap"><table><thead><tr><th>Bài</th><th>YCCĐ</th><th>Dạng</th><th>Mức độ</th><th>Số câu (ma trận / đề)</th><th>Điểm (ma trận / đề)</th><th></th></tr></thead><tbody>${v.cells.cells.map(c=>`<tr${c.ok?'':' style="background:#FDEEEE"'}><td>${esc(c.lesson_code||'')}</td><td>${esc(c.outcome||'')}</td><td>${esc(kindName[c.kind]||c.kind||'')}</td><td>${esc(c.level||'')}</td><td>${c.expected_questions} / ${c.actual_questions}</td><td>${esc(String(c.expected_points).replace('.',','))} / ${esc(String(c.actual_points).replace('.',','))}</td><td>${c.ok?'✓':'Lệch'}</td></tr>`).join('')}</tbody></table></div>`:'')+
  ((v.ratio_warnings||[]).length?`<div class="callout warning"><strong>Cảnh báo tỉ lệ (ngưỡng nội bộ, không bắt buộc theo CV 7991)</strong><ul>${v.ratio_warnings.map(w=>`<li>${esc(w.message)}</li>`).join('')}</ul></div>`:'')+
  ((v.reuse_warnings||[]).length?`<div class="callout warning"><strong>Câu đã dùng trong đề phát hành gần đây (chỉ cảnh báo)</strong><ul>${v.reuse_warnings.map(w=>`<li>Câu ${esc(w.slot_number??'')} (${esc(w.question_id)}) ${w.match==='id'?'cùng mã':'trùng nội dung'} với “${esc(w.other_title||w.other_exam_id)}”, phát hành ${esc(String(w.published_at||'').slice(0,10))}</li>`).join('')}</ul></div>`:'')+`</div>`;
}
function buildVerificationReportHtml(record){
 const v=record.verification;
 if(!v){
  return `<div class="doc-sheet"><header class="doc-sheet-head" align="center"><h3>BÁO CÁO KIỂM ĐỊNH ĐỀ THI VỚI MA TRẬN</h3><p><strong>${esc(record.title||'Đề kiểm tra')} · Khối ${esc(record.grade)}</strong></p></header><div class="callout warning">Đề thi này chưa có báo cáo kiểm định ma trận đính kèm. Bấm nút <strong>"Kiểm định lại với Ma trận"</strong> phía trên để chạy kiểm định.</div></div>`;
 }
 const badgeCls=v.passed?'approved':'draft';
 const rc=v.revision_check||{};
 const curTarget=rc.required_percent??record.similarity_target_percent??90;
 const curMode=rc.similarity_mode??record.similarity_mode??'exact';
 const outsideCount=rc.outside_questions??Math.max(0,(rc.total_questions??v.total_questions??0)-(rc.matched_questions??0));
 const outsidePts=rc.outside_points??Math.max(0,Math.round(((rc.total_points??10)-(rc.matched_points??0))*100)/100);
 const qItems=rc.question_items||(record.questions||[]).map((q,i)=>({index:i,slot_number:q.slot_number||(i+1),id:q.id,type:q.type,lesson_code:q.lesson_code,level:q.level,points:q.points??(q.type==='MC'?0.25:1),in_revision:Boolean(q.in_revision??true),question:q.question}));

 const simControlHtml=`<div class="sim-control-card" data-exam-id="${esc(record.id||'')}">`+
  `<h5>Điều chỉnh Mức độ tương đồng giữa Đề cương & Đề thi</h5>`+
  `<div class="sim-row">`+
   `<div class="sim-field"><label>Tỉ lệ tương đồng mong muốn (%):</label><div class="sim-slider-wrap"><input type="range" class="sim-range" min="90" max="100" step="5" value="${curTarget}"><input type="number" class="sim-number" min="90" max="100" step="1" value="${curTarget}"><span>%</span></div></div>`+
   `<div class="sim-field"><label>Chế độ kiểm định & điều chỉnh:</label><select class="sim-mode-select"><option value="min"${curMode==='min'?' selected':''}>Tối thiểu (≥ X% thuộc đề cương)</option><option value="exact"${curMode==='exact'?' selected':''}>Bám sát tỉ lệ (X% đề cương, (100-X)% ngoài đề cương)</option></select></div>`+
  `</div>`+
  `<div class="sim-presets"><span class="muted small">Chọn nhanh:</span>`+
   `<button type="button" class="sim-preset-pill${curTarget===90?' primary':''}" data-pct="90">90% (Quy chuẩn)</button>`+
   `<button type="button" class="sim-preset-pill${curTarget===95?' primary':''}" data-pct="95">95%</button>`+
   `<button type="button" class="sim-preset-pill${curTarget===100?' primary':''}" data-pct="100">100% (Trọn vẹn đề cương)</button>`+
  `</div>`+
  (record.id?`<div class="sim-actions"><button type="button" class="export-link primary btn-update-sim">Cập nhật ngưỡng & kiểm định lại</button><button type="button" class="export-link btn-auto-adjust">Tự động điều chỉnh câu hỏi để đạt tỉ lệ này</button></div>`:'')+
 `</div>`;

 const qDetailsHtml=`<details class="doc-details" open style="margin-top:14px">`+
  `<summary contenteditable="false">Danh sách chi tiết câu hỏi: Thuộc Đề cương (${rc.matched_questions??(qItems.filter(q=>q.in_revision).length)} câu · ${fmtPts(rc.matched_points??0)} điểm) vs Ngoài Đề cương (${outsideCount} câu · ${fmtPts(outsidePts)} điểm)</summary>`+
  `<div class="table-wrap"><table class="doc-table sim-q-table"><thead><tr><th align="center" style="width:46px">Câu</th><th align="center" style="width:60px">Dạng</th><th align="center" style="width:60px">Bài</th><th align="center" style="width:75px">Mức độ</th><th align="center" style="width:65px">Điểm</th><th>Trích yếu câu hỏi</th><th align="center" style="width:130px">Phân loại</th>${record.id?'<th align="center" style="width:160px">Điều chỉnh</th>':''}</tr></thead><tbody>`+
  qItems.map(qi=>{
   const inRev=Boolean(qi.in_revision);
   const qSnippet=qi.question?(qi.question.length>90?qi.question.slice(0,90)+'…':qi.question):'';
   const actionButtons=record.id?(inRev?
    `<div class="sim-q-actions"><button type="button" class="export-link" data-adj-sub="swap_from_bank" data-adj-qid="${esc(qi.id||'')}" data-adj-idx="${qi.index}" title="Đổi câu này lấy câu khác cùng bài/mức độ nhưng nằm ngoài đề cương">Đổi câu ngoài ĐC</button><button type="button" class="export-link danger" data-adj-sub="remove_from_revision" data-adj-qid="${esc(qi.id||'')}" data-adj-idx="${qi.index}" title="Tách câu này khỏi đề cương để trở thành câu phân hóa ngoài đề cương">Tách khỏi ĐC</button></div>`:
    `<div class="sim-q-actions"><button type="button" class="export-link" data-adj-sub="swap_from_revision" data-adj-qid="${esc(qi.id||'')}" data-adj-idx="${qi.index}" title="Đổi câu này lấy câu có sẵn trong đề cương">Đổi câu từ ĐC</button><button type="button" class="export-link primary" data-adj-sub="add_to_revision" data-adj-qid="${esc(qi.id||'')}" data-adj-idx="${qi.index}" title="Thêm câu này vào đề cương để nâng tỉ lệ tương đồng">Đưa vào ĐC</button></div>`):'';
   return `<tr><td align="center"><strong>${qi.slot_number}</strong></td><td align="center"><span class="badge">${esc(qi.type||'')}</span></td><td align="center"><strong>${esc(qi.lesson_code||'')}</strong></td><td align="center">${esc(qi.level||'')}</td><td align="center">${fmtPts(qi.points)}đ</td><td><div class="q-snippet">${esc(qSnippet)}</div></td><td align="center"><span class="badge ${inRev?'approved':'draft'}">${inRev?'Thuộc Đề cương':'Ngoài Đề cương'}</span></td>${record.id?`<td>${actionButtons}</td>`:''}</tr>`;
  }).join('')+
  `</tbody></table></div></details>`;

 return `<div class="doc-sheet"><header class="doc-sheet-head" align="center"><h3>BÁO CÁO ĐỐI CHIẾU & KIỂM ĐỊNH ĐỀ THI THEO MA TRẬN ĐẶC TẢ</h3><p><strong>${esc(record.title||'ĐỀ KIỂM TRA')} · KHỐI ${esc(record.grade)}</strong></p><p>Ma trận đối chiếu: <strong>${esc(v.matrix_title||matrixDisplayName(v,record))}</strong> · Trạng thái ma trận: <strong>${!v.matrix_id?'Không gắn ma trận (phân bố tự thiết lập)':v.matrix_locked?'Đã duyệt & Khóa':'Chưa khóa'}</strong></p></header>`+
 `<div class="callout ${v.passed?'':'warning'}" style="margin-bottom:16px"><strong>Kết luận kiểm định: <span class="badge ${badgeCls}">${v.passed?'ĐẠT YÊU CẦU CHUẨN MA TRẬN':'CHƯA ĐẠT YÊU CẦU'}</span></strong><br>${esc(v.summary||'')}</div>`+
 `<section class="doc-section"><h4>1. Đối chiếu Cấu trúc Dạng thức Câu hỏi & Tổng điểm</h4><div class="table-wrap"><table class="doc-table"><thead><tr><th align="center">Dạng câu hỏi</th><th align="center">Số câu / lệnh hỏi theo Ma trận</th><th align="center">Số câu / lệnh hỏi trong Đề thi</th><th align="center">Điểm Ma trận</th><th align="center">Điểm Đề thi</th><th align="center">Kết quả</th></tr></thead><tbody>${(v.type_checks||[]).map(tc=>`<tr><td><strong>${esc(tc.label)}</strong></td><td align="center">${tc.expected_items}</td><td align="center">${tc.actual_items}${tc.actual_questions&&tc.actual_questions!==tc.actual_items?` (${tc.actual_questions} câu lớn)`:''}</td><td align="center">${fmtPts(tc.expected_points)} điểm</td><td align="center"><strong>${fmtPts(tc.actual_points)} điểm</strong></td><td align="center"><span class="badge ${tc.matched?'approved':'draft'}">${tc.matched?'Khớp 100%':'Lệch'}</span></td></tr>`).join('')}<tr><td><strong>TỔNG CỘNG TOÀN ĐỀ</strong></td><td align="center" colspan="2"><strong>${v.total_questions} câu hỏi chính thức</strong></td><td align="center"><strong>${fmtPts(v.expected_points)} điểm</strong></td><td align="center"><strong>${fmtPts(v.total_points)} điểm</strong></td><td align="center"><span class="badge ${v.points_matched?'approved':'draft'}">${v.points_matched?'Đủ 10,0 điểm':'Lệch điểm'}</span></td></tr></tbody></table></div></section>`+
 `<section class="doc-section"><h4>2. Đối chiếu Mức độ Nhận thức (Biết · Hiểu · Vận dụng · Vận dụng cao)</h4><div class="table-wrap"><table class="doc-table"><thead><tr><th align="center">Mức độ nhận thức</th><th align="center">Số lệnh hỏi (Ma trận)</th><th align="center">Số lệnh hỏi (Đề thi)</th><th align="center">Điểm số (Ma trận)</th><th align="center">Điểm số (Đề thi)</th><th align="center">Đánh giá</th></tr></thead><tbody>${(v.level_checks||[]).map(lc=>`<tr><td align="center"><strong>${esc(lc.level)}</strong></td><td align="center">${lc.expected_items}</td><td align="center">${lc.actual_items}</td><td align="center">${fmtPts(lc.expected_points)} điểm</td><td align="center"><strong>${fmtPts(lc.actual_points)} điểm</strong></td><td align="center"><span class="badge ${lc.matched?'approved':'draft'}">${lc.matched?'Đúng tỉ lệ':'Cần kiểm tra'}</span></td></tr>`).join('')}</tbody></table></div></section>`+
 `<section class="doc-section"><h4>3. Kiểm tra Vị trí Bài học của Câu hỏi Tự luận (ES)</h4><div class="table-wrap"><table class="doc-table"><thead><tr><th align="center">Câu tự luận</th><th align="center">Mã bài</th><th>Tên bài học trong chương trình</th><th align="center">Điểm số</th><th align="center">Đối chiếu Đặc tả</th></tr></thead><tbody>${(v.es_checks||[]).map(ec=>`<tr><td align="center"><strong>${esc(ec.slot)}</strong></td><td align="center">${esc(ec.lesson_code)}</td><td>${esc(ec.lesson_name)}</td><td align="center">${fmtPts(ec.points)} điểm</td><td align="center"><span class="badge ${ec.matched?'approved':'draft'}">${ec.matched?'Đúng bài quy định':'Sai bài'}</span></td></tr>`).join('')}</tbody></table></div></section>`+
 `<section class="doc-section"><h4>4. Đối chiếu & Điều chỉnh Độ phủ Đề cương Ôn tập</h4><div class="table-wrap"><table class="doc-table"><thead><tr><th>Phiên bản Đề cương đối chiếu</th><th align="center">Số câu thuộc Đề cương</th><th align="center">Điểm số thuộc Đề cương</th><th align="center">Tỉ lệ độ phủ điểm</th><th align="center">Yêu cầu cài đặt</th><th align="center">Kết quả</th></tr></thead><tbody><tr><td><strong>${esc(rc.revision_id||'Đề cương cùng khối')}</strong></td><td align="center">${rc.matched_questions??0} / ${rc.total_questions??v.total_questions} câu (${fmtPts(rc.coverage_percent_count??0)}%)</td><td align="center"><strong>${fmtPts(rc.matched_points??0)} / 10 điểm</strong></td><td align="center"><strong>${fmtPts(rc.coverage_percent_points??0)}%</strong></td><td align="center">${curMode==='exact'?'Bám sát: ':'≥ '}${fmtPts(curTarget)}%</td><td align="center"><span class="badge ${rc.matched?'approved':'draft'}">${rc.matched?'Đạt yêu cầu':'Chưa đạt'}</span></td></tr></tbody></table></div><details class="sim-details-toggle"><summary>Tùy chỉnh mức độ tương đồng & hoán đổi câu hỏi (Nâng cao)</summary>${simControlHtml}${qDetailsHtml}</details></section>`+
 ((v.notes&&v.notes.length)?`<section class="doc-section"><h4>5. Ghi chú Chuyên môn & Nhận xét chi tiết</h4><ul>${v.notes.map(n=>`<li style="margin-bottom:6px">${esc(n)}</li>`).join('')}</ul></section>`:'')+
 `</div>`;
}
function mcColsClass(options){
 const opts=options||[];
 const maxLen=Math.max(...opts.map(o=>String(o||'').length),0);
 const sumLen=opts.reduce((s,o)=>s+String(o||'').length,0);
 if(opts.length===4&&maxLen<=16&&sumLen<=65) return 'cols-4';
 if(opts.length===4&&maxLen<=38) return 'cols-2';
 return 'cols-1';
}
function questionSectionNumbers(record){
 return Object.fromEntries(['MC','YN','SHORT','ES'].filter(kind=>(record.questions||[]).some(q=>q.type===kind)).map((kind,i)=>[kind,['I','II','III','IV'][i]]));
}
function shortQuestionHtml(q,index,showAnswer=false){
 const number=q.slot_number||(index+1),points=q.points??q.max_score??1;
 return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${number} (${fmtPts(points)} điểm).</strong> ${C.questionTextHtml(q.question,{editable:true})}</div>${showAnswer?`<p contenteditable="false"><strong>Đáp án:</strong> ${esc(C.shortAnswerOf(q)||'Chưa có đáp án')}</p>`:'<p contenteditable="false">Trả lời: ................................................................</p>'}</article>`;
}
function buildExamSheetHtml(record,mode='student'){
 if(mode==='verify')return buildVerificationReportHtml(record)+revisionCriterionHtml(record)+cellReportHtml(record.verification)+(window.BankKnowledgeUI?window.BankKnowledgeUI.verificationHtml(record):'');
 const mcs=(record.questions||[]).filter(q=>q.type==='MC');
 const yns=(record.questions||[]).filter(q=>q.type==='YN');
 const shorts=(record.questions||[]).filter(q=>q.type==='SHORT');
 const ess=(record.questions||[]).filter(q=>q.type==='ES');
 const part=questionSectionNumbers(record);
 const hasYn=yns.length>0;
 const secLabels={mc:part.MC+'. TRẮC NGHIỆM NHIỀU LỰA CHỌN',yn:part.YN+'. TRẮC NGHIỆM ĐÚNG / SAI',es:part.ES+'. TỰ LUẬN'};
 if(mode==='student'){
  return `<div class="doc-sheet"><header class="doc-sheet-head" align="center"><h3>${esc(record.title||'ĐỀ KIỂM TRA GIỮA HỌC KÌ I')}</h3><p><strong>MÔN: ${esc(subject(record).toLocaleUpperCase('vi'))} ${esc(record.grade)}</strong></p>${record.campus||record.exam_code?`<p>Đơn vị: ${esc(record.campus||'Asian School')} — <strong>Mã đề: ${esc(record.exam_code||'GỐC')}</strong></p>`:''}<p>Thời gian làm bài: ${esc(record.duration||45)} phút — Tổng điểm: ${fmtPts(record.total_points??10)} điểm</p><p class="doc-student-line">Họ và tên học sinh: ........................................................................ Lớp: ....................</p></header>`+
  (mcs.length?`<section class="doc-section"><h4>${secLabels.mc} (${mcs.length} câu · ${fmtPts(mcs.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4>${mcs.map((q,i)=>{const num=q.slot_number||(i+1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${num}${esc(pts)}.</strong> ${C.questionTextHtml(q.question,{editable:true})}</div><div class="doc-options ${mcColsClass(q.options)}">${(q.options||[]).map((o,oi)=>`<p class="doc-option"><strong>${'ABCD'[oi]}.</strong> <span data-edit-opt="${oi}">${esc(o)}</span></p>`).join('')}</div></article>`;}).join('')}</section>`:'')+
  (yns.length?`<section class="doc-section"><h4>${secLabels.yn} (${yns.length} câu · ${fmtPts(yns.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4><p class="small muted" style="margin-bottom:10px">Trong mỗi ý <strong>a), b), c), d)</strong> ở mỗi câu, học sinh chọn <strong>Đúng</strong> hoặc <strong>Sai</strong>.</p>${yns.map((q,i)=>{const num=q.slot_number||(i+1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${num}${esc(pts)}.</strong> ${C.questionTextHtml(q.question,{editable:true})}</div><div class="doc-options">${(q.statements||[]).map((st,si)=>`<p class="doc-option"><strong>${esc(st.label||('abcd'[si]))})</strong> <span data-edit-stmt="${si}">${esc(st.text)}</span></p>`).join('')}</div></article>`;}).join('')}</section>`:'')+
  (shorts.length?`<section class="doc-section"><h4>${part.SHORT}. TRẮC NGHIỆM TRẢ LỜI NGẮN (${shorts.length} câu · ${fmtPts(shorts.reduce((sum,q)=>sum+Number(q.points??q.max_score??1),0))} điểm)</h4>${shorts.map((q,i)=>shortQuestionHtml(q,i,false)).join('')}</section>`:'')+
  (ess.length?`<section class="doc-section"><h4>${secLabels.es} (${ess.length} câu · ${fmtPts(ess.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4>${ess.map((q,i)=>{const num=q.slot_number||(i+1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${num}${esc(pts)}.</strong> ${C.questionTextHtml(q.question,{editable:true})}</div></article>`;}).join('')}</section>`:'')+
  `<p align="center" style="margin-top:20px"><strong>— HẾT —</strong></p></div>`;
 }
 return `<div class="doc-sheet"><header class="doc-sheet-head" align="center"><h3>ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM</h3><p><strong>${esc(record.title||'ĐỀ KIỂM TRA')} · ${esc(subject(record).toLocaleUpperCase('vi'))} ${esc(record.grade)}</strong></p>${record.campus||record.exam_code?`<p>Đơn vị: ${esc(record.campus||'Asian School')} — <strong>Mã đề: ${esc(record.exam_code||'GỐC')}</strong></p>`:''}</header>`+
 (mcs.length?`<section class="doc-section"><h4>${part.MC}. BẢNG ĐÁP ÁN TRẮC NGHIỆM NHIỀU LỰA CHỌN (${mcs.length} câu · ${fmtPts(mcs.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4><div class="answer-grid">${mcs.map((q,i)=>{const num=q.slot_number||(i+1);return `<div class="answer-cell" align="center"><span>Câu ${num}</span><strong>${'ABCD'[q.correct]||'—'}</strong><small>${fmtPts(q.points??0.25)}đ</small></div>`;}).join('')}</div><details class="doc-details" open><summary contenteditable="false">Chi tiết câu hỏi, đáp án đúng và giải thích từng phương án</summary>${mcs.map((q,i)=>{const num=q.slot_number||(i+1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${num}${esc(pts)}.</strong> ${C.questionTextHtml(q.question,{editable:true})} <span class="badge" contenteditable="false">${esc(q.lesson_code||'')} · ${esc(q.level||'')}</span></div><ol class="options">${(q.options||[]).map((o,oi)=>`<li class="${oi===q.correct?'correct':''}">${oi===q.correct?'<span class="answer-label" contenteditable="false">ĐÁP ÁN ĐÚNG</span>':''}<strong>${'ABCD'[oi]}.</strong> <span data-edit-opt="${oi}">${esc(o)}</span><span class="explanation" data-edit-exp="${oi}">${esc(q.option_explanations?.[oi]||'')}</span></li>`).join('')}</ol></article>`;}).join('')}</details></section>`:'')+
 (yns.length?`<section class="doc-section"><h4>${part.YN}. BẢNG ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI (${yns.length} câu · ${fmtPts(yns.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4><div class="table-wrap"><table class="doc-table"><thead><tr><th align="center">Câu hỏi</th><th align="center">Ý a)</th><th align="center">Ý b)</th><th align="center">Ý c)</th><th align="center">Ý d)</th></tr></thead><tbody>${yns.map((q,i)=>{const num=q.slot_number||(i+1);const sts=q.statements||[];return `<tr><td align="center"><strong>Câu ${num}</strong></td>${[0,1,2,3].map(si=>`<td align="center"><strong>${sts[si]?.correct?'ĐÚNG':'SAI'}</strong></td>`).join('')}</tr>`;}).join('')}</tbody></table></div><details class="doc-details" open style="margin-top:10px"><summary contenteditable="false">Chi tiết từng mệnh đề Đúng / Sai</summary>${yns.map((q,i)=>{const num=q.slot_number||(i+1);return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${num} (${fmtPts(q.points??1)} điểm).</strong> ${C.questionTextHtml(q.question,{editable:true})} <span class="badge" contenteditable="false">${esc(q.lesson_code||'')}</span></div><ol class="options">${(q.statements||[]).map((st,si)=>`<li class="${st.correct?'correct':''}"><span class="answer-label" contenteditable="false">${st.correct?'ĐÚNG':'SAI'}</span><strong>${esc(st.label||('abcd'[si]))})</strong> <span data-edit-stmt="${si}">${esc(st.text)}</span></li>`).join('')}</ol></article>`;}).join('')}</details></section>`:'')+
  (shorts.length?`<section class="doc-section"><h4>${part.SHORT}. TRẮC NGHIỆM TRẢ LỜI NGẮN (${shorts.length} câu · ${fmtPts(shorts.reduce((sum,q)=>sum+Number(q.points??q.max_score??1),0))} điểm)</h4>${shorts.map((q,i)=>shortQuestionHtml(q,i,true)).join('')}</section>`:'')+
 (ess.length?`<section class="doc-section"><h4>${part.ES}. HƯỚNG DẪN CHẤM TỰ LUẬN (${ess.length} câu · ${fmtPts(ess.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4>${ess.map((q,i)=>{const num=q.slot_number||(i+1);const scale=(q.points??q.max_score??1)/(q.max_score||1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${num}${esc(pts)}.</strong> ${C.questionTextHtml(q.question,{editable:true})} <span class="badge" contenteditable="false">${esc(q.lesson_code||'')} · ${esc(q.level||'')}</span></div><table class="rubric-table"><thead><tr><th align="center">Tiêu chí & Nội dung hướng dẫn chấm</th><th align="center" style="width:110px">Điểm</th></tr></thead><tbody>${(q.rubric||[]).map((c,ri)=>`<tr><td data-edit-rubric="${ri}">${esc(c.criterion)}</td><td align="center"><strong>${fmtPts(c.points*scale)} điểm</strong></td></tr>`).join('')}</tbody></table><p class="small muted" style="margin-top:8px"><strong>Quy tắc chấm tương đương:</strong> ${esc(scaledPolicy(q))}</p></article>`;}).join('')}</section>`:'')+
 `</div>`;
}
function buildRevisionSheetHtml(record,showAnswers=false){
 const goals=revisionGoals(record);
 const mcs=(record.questions||[]).filter(q=>q.type==='MC');
 const yns=(record.questions||[]).filter(q=>q.type==='YN');
 const shorts=(record.questions||[]).filter(q=>q.type==='SHORT');
 const ess=(record.questions||[]).filter(q=>q.type==='ES');
 const part=questionSectionNumbers(record);
 const hasYn=yns.length>0;
 return `<div class="doc-sheet"><header class="doc-sheet-head"><div style="display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:12px;border-bottom:2px solid var(--line);padding-bottom:12px;text-align:center">${schoolProfile()?'<img src="./assets/logo_asian_school.png" alt="Asian School Logo" style="max-height:60px;max-width:100px;object-fit:contain;flex-shrink:0">':''}<div style="flex:1">${schoolProfile()?'<p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">TRƯỜNG TH, THCS & THPT QUỐC TẾ Á CHÂU</p>':''}<h3 style="margin:4px 0 2px 0">${esc(record.title||'ĐỀ CƯƠNG ÔN TẬP KIỂM TRA GIỮA HỌC KÌ I')}</h3><p style="margin:0"><strong>MÔN: ${esc(subject(record).toLocaleUpperCase('vi'))} ${esc(record.grade)} · NĂM HỌC ${esc(record.school_year||store.context.school_year||'2026-2027')}</strong> (${countRecord(record)} câu hỏi ôn tập)</p></div></div></header>`+
 `<section class="doc-section"><h4>A. GIỚI HẠN KIẾN THỨC ÔN TẬP</h4><div class="table-wrap"><table class="doc-table"><colgroup><col style="width:6%"><col style="width:44%"><col style="width:50%"></colgroup><thead><tr><th align="center" style="width:56px">STT</th><th align="center">Tên chủ đề</th><th align="center">Tên bài</th></tr></thead><tbody>${goals.length?goals.map((r,i)=>`<tr><td align="center">${i+1}</td><td>${esc(r.topic)}</td><td><strong>${esc(r.name)}</strong></td></tr>`).join(''):'<tr><td colspan="3" align="center">Chưa có câu hỏi trong đề cương.</td></tr>'}</tbody></table></div></section>`+
 `<section class="doc-section"><h4>B. HỆ THỐNG CÂU HỎI ÔN TẬP</h4>`+
 (mcs.length?`<h5>${part.MC}. TRẮC NGHIỆM NHIỀU LỰA CHỌN (${mcs.length} câu)</h5>${mcs.map((q,i)=>`<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${q.slot_number||(i+1)}.</strong> ${C.questionTextHtml(q.question,{editable:true})} ${showAnswers?`<span class="badge" contenteditable="false">${esc(q.lesson_code||'')} · ${esc(q.level||'')}</span>`:''}</div>${showAnswers?`<ol class="options">${(q.options||[]).map((o,oi)=>`<li class="${oi===q.correct?'correct':''}">${oi===q.correct?'<span class="answer-label" contenteditable="false">ĐÁP ÁN ĐÚNG</span>':''}<strong>${'ABCD'[oi]}.</strong> <span data-edit-opt="${oi}">${esc(o)}</span><span class="explanation" data-edit-exp="${oi}">${esc(q.option_explanations?.[oi]||'')}</span></li>`).join('')}</ol>`:`<div class="doc-options ${mcColsClass(q.options)}">${(q.options||[]).map((o,oi)=>`<p class="doc-option"><strong>${'ABCD'[oi]}.</strong> <span data-edit-opt="${oi}">${esc(o)}</span></p>`).join('')}</div>`}</article>`).join('')}`:'')+
 (yns.length?`<h5>${part.YN}. TRẮC NGHIỆM ĐÚNG / SAI (${yns.length} câu · ${yns.reduce((s,q)=>s+(q.statements||[]).length,0)} mệnh đề)</h5>${yns.map((q,i)=>`<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${q.slot_number||(i+1)}.</strong> ${C.questionTextHtml(q.question,{editable:true})} ${showAnswers?`<span class="badge" contenteditable="false">${esc(q.lesson_code||'')}</span>`:''}</div>${showAnswers?`<ol class="options">${(q.statements||[]).map((st,si)=>`<li class="${st.correct?'correct':''}"><span class="answer-label" contenteditable="false">${st.correct?'ĐÚNG':'SAI'}</span><strong>${esc(st.label||('abcd'[si]))})</strong> <span data-edit-stmt="${si}">${esc(st.text)}</span></li>`).join('')}</ol>`:`<div class="doc-options">${(q.statements||[]).map((st,si)=>`<p class="doc-option"><strong>${esc(st.label||('abcd'[si]))})</strong> <span data-edit-stmt="${si}">${esc(st.text)}</span></p>`).join('')}</div>`}</article>`).join('')}`:'')+
 (shorts.length?`<h5>${part.SHORT}. TRẮC NGHIỆM TRẢ LỜI NGẮN (${shorts.length} câu · ${fmtPts(shorts.reduce((sum,q)=>sum+Number(q.points??q.max_score??1),0))} điểm)</h5>${shorts.map((q,i)=>shortQuestionHtml(q,i,showAnswers)).join('')}`:'')+
 (ess.length?`<h5>${part.ES}. TỰ LUẬN & BÀI TẬP THỰC TẾ (${ess.length} câu)</h5>${ess.map((q,i)=>`<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${q.slot_number||(i+1)}.</strong> ${C.questionTextHtml(q.question,{editable:true})} ${showAnswers?`<span class="badge" contenteditable="false">${esc(q.lesson_code||'')} · ${esc(q.level||'')}</span>`:''}</div>${showAnswers?`<table class="rubric-table"><thead><tr><th align="center">Tiêu chí hướng dẫn chấm</th><th align="center" style="width:110px">Điểm</th></tr></thead><tbody>${(q.rubric||[]).map((c,ri)=>`<tr><td data-edit-rubric="${ri}">${esc(c.criterion)}</td><td align="center"><strong>${fmtPts(c.points)} điểm</strong></td></tr>`).join('')}</tbody></table>`:''}</article>`).join('')}`:'')+
 `</section>`+
 (showAnswers?`<section class="doc-section" style="page-break-before:always;margin-top:28px;border-top:2px solid var(--line);padding-top:16px"><h4>C. BẢNG ĐÁP ÁN GỢI Ý VÀ HƯỚNG DẪN CHẤM</h4>`+
 (mcs.length?`<h5>${part.MC}. BẢNG ĐÁP ÁN TRẮC NGHIỆM (${mcs.length} câu)</h5><div class="answer-grid">${mcs.map((q,i)=>{const num=q.slot_number||(i+1);const corr=q.correct!==undefined&&'ABCD'[q.correct]?'ABCD'[q.correct]:'—';return `<div class="answer-cell" align="center"><span>Câu ${num}</span><strong>${corr}</strong></div>`;}).join('')}</div>`:'')+
 (yns.length?`<h5>${part.YN}. BẢNG ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI (${yns.length} câu)</h5><div class="table-wrap"><table class="doc-table"><thead><tr><th align="center">Câu hỏi</th><th align="center">Ý a)</th><th align="center">Ý b)</th><th align="center">Ý c)</th><th align="center">Ý d)</th></tr></thead><tbody>${yns.map((q,i)=>{const num=q.slot_number||(i+1);const sts=q.statements||[];return `<tr><td align="center"><strong>Câu ${num}</strong></td>${[0,1,2,3].map(si=>`<td align="center"><strong>${sts[si]?.correct?'ĐÚNG':'SAI'}</strong></td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`:'')+
 (shorts.length?`<h5>${part.SHORT}. BẢNG ĐÁP ÁN TRẢ LỜI NGẮN (${shorts.length} câu)</h5><div class="answer-grid">${shorts.map((q,i)=>{const num=q.slot_number||(i+1);return `<div class="answer-cell" align="center"><span>Câu ${num}</span><strong>${esc(C.shortAnswerOf(q)||'—')}</strong></div>`;}).join('')}</div>`:'')+
 (ess.length?`<h5>${part.ES}. HƯỚNG DẪN CHẤM VÀ GỢI Ý TỰ LUẬN (${ess.length} câu)</h5>${ess.map((q,i)=>{const num=q.slot_number||(i+1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question"><div class="doc-question-heading" style="margin:0 0 8px;font-size:17px"><strong>Câu ${num}${esc(pts)}.</strong> ${C.questionTextHtml(q.question)}</div>${(q.rubric||[]).length?`<table class="rubric-table"><thead><tr><th align="center">Tiêu chí hướng dẫn chấm</th><th align="center" style="width:110px">Điểm</th></tr></thead><tbody>${(q.rubric||[]).map(c=>`<tr><td>${esc(c.criterion)}</td><td align="center"><strong>${fmtPts(c.points)} điểm</strong></td></tr>`).join('')}</tbody></table>`:''}${q.equivalent_answer_policy?`<p class="small muted" style="margin-top:6px"><em>Quy tắc chấm tương đương: ${esc(q.equivalent_answer_policy)}</em></p>`:''}</article>`;}).join('')}`:'')+
 `</section>`:'')+`</div>`;
}
function mountExamViewerContent(hostEl,record,mode='student',isInline=false){
 const base=record.id?'/api/exams/'+encodeURIComponent(record.id)+'/export':'';
 const meta=`${esc(subject(record))} ${esc(record.grade)} · Thời gian: ${esc(record.duration||45)} phút · Tổng điểm: ${fmtPts(record.total_points??10)} · Mã đề: ${esc(record.exam_code||'GỐC')}${record.verification?.passed?' · Đạt chuẩn Ma trận':''}`;
 const fmtKey=`exam:${record.id||record.title||'draft'}:${mode}`;
 const fmt=window.DocFormatter||C.DocFormatter;
 const body=buildExamSheetHtml(record,mode);
 hostEl.innerHTML=`<div class="dialog-heading"><div><p class="eyebrow">XEM TOÀN BỘ ĐỀ KIỂM TRA & ĐỐI CHIẾU MA TRẬN</p><h2 id="${isInline?'inline-exam-title':'detail-title'}">${esc(record.title||'Đề kiểm tra')}</h2><p class="small muted">${meta}</p></div><div class="actions">${isInline?`<button type="button" class="export-link" data-modal-exam="${esc(record.id)}" data-mode="${esc(mode)}">⤢ Mở rộng toàn màn hình</button><button type="button" class="quiet" id="close-inline-exam">Đóng khung xem</button>`:`<button data-close="detail-dialog" class="quiet">Đóng</button>`}</div></div>`+
 `<div class="viewer-toolbar"><div class="viewer-tabs"><button type="button" class="${mode==='student'?'primary':''}" data-switch-exam-mode="student">Xem đề học sinh</button>${store.canViewAnswers!==false?`<button type="button" class="${mode==='answers'?'primary':''}" data-switch-exam-mode="answers">Xem đáp án & HDC</button>`:''}<button type="button" class="${mode==='verify'?'primary':''}" data-switch-exam-mode="verify">Báo cáo Kiểm định Ma trận</button></div><div class="actions">${record.id&&C.examEditable(record)?`<select data-verify-revision aria-label="Đề cương đối chiếu">${opt('',record.revision_id?'Giữ đề cương đã gắn':'Chọn đề cương để gắn…',true)}${store.revisions.filter(r=>Number(r.grade)===Number(record.grade)).map(r=>opt(r.id,(r.id===record.revision_id?'✓ ':'')+r.title+' · '+countRecord(r)+' câu',false)).join('')}</select>`:''}${record.id?`<button type="button" class="export-link" data-reverify-exam="${esc(record.id)}">Kiểm định lại với Ma trận</button>`:''}${base?`<button type="button" class="button export-link primary" data-open-custom-export="${esc(record.id)}" style="background:#4A3AA8;border-color:#4A3AA8;font-weight:700">Tùy biến xuất hồ sơ (.docx / ZIP)</button><a class="button export-link" href="${base}?format=docx&answers=0">Word học sinh</a><a class="button export-link" href="${base}?format=tex&answers=0" title="Xuất mã nguồn XeLaTeX chuẩn">LaTeX đề thi</a>${store.canViewAnswers!==false?`<a class="button export-link" href="${base}?format=docx&answers=1">Word đáp án</a><a class="button export-link" href="${base}?format=tex&answers=1" title="Xuất mã nguồn XeLaTeX Đáp án & HDC">LaTeX đáp án</a><a class="button export-link" href="${base}?format=docx&target=lms">Tải tệp LMS</a>`:''}<a class="button export-link" href="${base}?format=html&answers=${mode==='answers'?1:0}" target="_blank" rel="noopener">Mở trang in</a>`:''}</div></div>`+
 (fmt?fmt.toolbarHtml(fmtKey,false):'')+body;
 hostEl.querySelectorAll('[data-switch-exam-mode]').forEach(btn=>{
  btn.onclick=()=>mountExamViewerContent(hostEl,record,btn.dataset.switchExamMode,isInline);
 });
 const closeInlineBtn=hostEl.querySelector('#close-inline-exam');
 if(closeInlineBtn)closeInlineBtn.onclick=()=>{store.activeExamViewId=null;hostEl.hidden=true;hostEl.innerHTML='';};
 const modalBtn=hostEl.querySelector('[data-modal-exam]');
 if(modalBtn)modalBtn.onclick=()=>openExamViewerModal(record,mode);
 hostEl.querySelectorAll('[data-close-mark],[data-close-review],[data-rev-policy-save]').forEach(el=>{el.onclick=()=>closeMatchAct(hostEl,record,isInline,el);});
 const reverifyBtn=hostEl.querySelector('[data-reverify-exam]');
 if(reverifyBtn)reverifyBtn.onclick=async()=>{
  const rid=hostEl.querySelector('[data-verify-revision]')?.value||undefined;
  await mutate('/api/exams/verify',{id:record.id,revision_id:rid},res=>{
   if(res.exams)store.exams=res.exams;
   const updated=res.exam||store.exams.find(x=>x.id===record.id)||record;
   mountExamViewerContent(hostEl,updated,'verify',isInline);
   notify('Đã kiểm định đề kiểm tra với Ma trận đã duyệt.');
  });
 };
 const simCard=hostEl.querySelector('.sim-control-card');
 if(simCard){
  const rangeEl=simCard.querySelector('.sim-range');
  const numEl=simCard.querySelector('.sim-number');
  const modeSelect=simCard.querySelector('.sim-mode-select');
  if(rangeEl&&numEl){
   rangeEl.oninput=()=>{numEl.value=rangeEl.value;};
   numEl.oninput=()=>{rangeEl.value=numEl.value;};
  }
  simCard.querySelectorAll('.sim-preset-pill').forEach(pill=>{
   pill.onclick=()=>{
    const p=Number(pill.dataset.pct);
    if(rangeEl)rangeEl.value=p;
    if(numEl)numEl.value=p;
    simCard.querySelectorAll('.sim-preset-pill').forEach(b=>b.classList.remove('primary'));
    pill.classList.add('primary');
   };
  });
  const updateBtn=simCard.querySelector('.btn-update-sim');
  if(updateBtn)updateBtn.onclick=async()=>{
   const pct=Number(numEl?.value??90);
   const smode=modeSelect?.value??'min';
   await mutate('/api/exams/adjust-similarity',{id:record.id,action:'update_threshold',target_percent:pct,similarity_mode:smode},res=>{
    if(res.exams)store.exams=res.exams;
    const updated=res.exam||store.exams.find(x=>x.id===record.id)||record;
    mountExamViewerContent(hostEl,updated,'verify',isInline);
    notify(res.message||'Đã cập nhật ngưỡng tương đồng đề cương.');
   });
  };
  const autoBtn=simCard.querySelector('.btn-auto-adjust');
  if(autoBtn)autoBtn.onclick=async()=>{
   const pct=Number(numEl?.value??90);
   const smode=modeSelect?.value??'min';
   await mutate('/api/exams/adjust-similarity',{id:record.id,action:'auto_adjust_questions',target_percent:pct,similarity_mode:smode},res=>{
    if(res.exams)store.exams=res.exams;
    if(res.revisions)store.revisions=res.revisions;
    const updated=res.exam||store.exams.find(x=>x.id===record.id)||record;
    mountExamViewerContent(hostEl,updated,'verify',isInline);
    notify(res.message||'Đã tự động điều chỉnh câu hỏi để đạt tỉ lệ tương đồng.');
   });
  };
 }
 hostEl.querySelectorAll('[data-adj-sub]').forEach(btn=>{
  btn.onclick=async()=>{
   const sub=btn.dataset.adjSub;
   const qid=btn.dataset.adjQid;
   const idx=btn.dataset.adjIdx?Number(btn.dataset.adjIdx):undefined;
   const numEl=hostEl.querySelector('.sim-number');
   const modeSelect=hostEl.querySelector('.sim-mode-select');
   const pct=Number(numEl?.value??90);
   const smode=modeSelect?.value??'min';
   await mutate('/api/exams/adjust-similarity',{id:record.id,action:'toggle_question',sub_action:sub,question_id:qid,question_index:idx,target_percent:pct,similarity_mode:smode},res=>{
    if(res.exams)store.exams=res.exams;
    if(res.revisions)store.revisions=res.revisions;
    const updated=res.exam||store.exams.find(x=>x.id===record.id)||record;
    mountExamViewerContent(hostEl,updated,'verify',isInline);
    notify(res.message||'Đã điều chỉnh câu hỏi.');
   });
  };
 });
 if(fmt){
  fmt.attach(hostEl,'.doc-sheet',{
   storageKey:fmtKey,
   title:record.title||'Đề kiểm tra',
   filename:`de_kiem_tra_tin_${record.grade}_${record.exam_code||'goc'}_${mode}.doc`,
   landscape:false,
   notify,
   onSave:async sheet=>{
    try{
     syncEditedQuestionsFromSheet(sheet,record);
     if(record.id){const result=await request('/api/exams/update',{id:record.id,questions:record.questions});Object.assign(record,result.exam);}
     notify('Đã lưu nội dung đề kiểm tra. Định dạng được giữ trong trình duyệt này.');return true;
    }catch(error){notify('Chưa lưu được đề kiểm tra: '+detailError(error),true);return false;}
   }
  });
 }
}
function openExamViewerModal(record,mode='student'){
 if(!record)return;
 const dlg=$('#detail-dialog');dlg.classList.add('wide-dialog');
 mountExamViewerContent($('#detail-content'),record,mode,false);
 if(!dlg.open)dlg.showModal();
}
function openExamViewer(record,mode='student'){
 if(!record)return;
 store.activeExamViewId=record.id;
 store.activeExamViewMode=mode;
 const inlineHost=$('#exam-inline-viewer');
 if(inlineHost&&store.tab==='exams'){
  inlineHost.hidden=false;
  mountExamViewerContent(inlineHost,record,mode,true);
  inlineHost.scrollIntoView({behavior:'smooth',block:'start'});
  return;
 }
 openExamViewerModal(record,mode);
}
window.openExamViewer=openExamViewer;
function mountRevisionViewerContent(hostEl,record,showAnswers=false,isInline=false){
 const base=record.id?'/api/revisions/'+encodeURIComponent(record.id)+'/export':'';
 const mcs=(record.questions||[]).filter(q=>q.type==='MC');
 const yns=(record.questions||[]).filter(q=>q.type==='YN');
 const shorts=(record.questions||[]).filter(q=>q.type==='SHORT');
 const ess=(record.questions||[]).filter(q=>q.type==='ES');
 const fmtKey=`revision:${record.id||record.title||'draft'}:${showAnswers?1:0}`;
 const fmt=window.DocFormatter||C.DocFormatter;
 const body=buildRevisionSheetHtml(record,showAnswers);
 hostEl.innerHTML=`<div class="dialog-heading"><div><p class="eyebrow">XEM TOÀN BỘ ĐỀ CƯƠNG ÔN TẬP</p><h2 id="${isInline?'inline-rev-title':'detail-title'}">${esc(record.title||'Đề cương ôn tập')}</h2><p class="small muted">Khối ${esc(record.grade)} · ${countRecord(record)} câu (${mcs.length} trắc nghiệm NLC${yns.length?`, ${yns.length} câu Đúng/Sai`:''}${shorts.length?`, ${shorts.length} câu Trả lời ngắn`:''}, ${ess.length} tự luận)</p></div><div class="actions">${isInline?`<button type="button" class="export-link" id="open-modal-rev">⤢ Mở rộng toàn màn hình</button><button type="button" class="quiet" id="close-inline-rev">Đóng khung xem</button>`:`<button data-close="detail-dialog" class="quiet">Đóng</button>`}</div></div>`+
 `<div class="viewer-toolbar"><div class="viewer-tabs"><button type="button" class="${!showAnswers?'primary':''}" data-switch-rev-ans="0">Bản đề cương học sinh</button><button type="button" class="${showAnswers?'primary':''}" data-switch-rev-ans="1">Xem kèm đáp án & HDC</button></div>${base?`<div class="actions"><button type="button" class="button export-link primary" data-open-custom-rev-export="${esc(record.id)}" style="background:#4A3AA8;border-color:#4A3AA8;font-weight:700">Tùy biến xuất đề cương (.docx)</button><a class="button export-link" href="${base}?format=docx&answers=0">Word đề cương</a><a class="button export-link" href="${base}?format=docx&answers=1">Word kèm đáp án</a><a class="button export-link" href="${base}?format=tex&answers=0" title="Xuất mã nguồn XeLaTeX chuẩn">LaTeX đề cương</a><a class="button export-link" href="${base}?format=docx&target=lms">Tải tệp LMS</a><a class="button export-link" href="${base}?format=html&answers=${showAnswers?1:0}" target="_blank" rel="noopener">Bản in</a></div>`:''}</div>`+
 (fmt?fmt.toolbarHtml(fmtKey,false):'')+body;
 hostEl.querySelectorAll('[data-switch-rev-ans]').forEach(btn=>{
  btn.onclick=()=>mountRevisionViewerContent(hostEl,record,btn.dataset.switchRevAns==='1',isInline);
 });
 const closeInlineBtn=hostEl.querySelector('#close-inline-rev');
 if(closeInlineBtn)closeInlineBtn.onclick=()=>{store.activeRevisionViewId=null;hostEl.hidden=true;hostEl.innerHTML='';};
 const modalBtn=hostEl.querySelector('#open-modal-rev');
 if(modalBtn)modalBtn.onclick=()=>openRevisionViewerModal(record,showAnswers);
 if(fmt){
  fmt.attach(hostEl,'.doc-sheet',{
   storageKey:fmtKey,
   title:record.title||'Đề cương ôn tập',
   filename:`de_cuong_tin_${record.grade}_${showAnswers?'dap_an':'hoc_sinh'}.doc`,
   landscape:false,
   notify,
   onSave:async sheet=>{
    try{
     syncEditedQuestionsFromSheet(sheet,record);
     if(record.id){const result=await request('/api/revisions/update',{id:record.id,title:record.title,grade:record.grade,questions:record.questions,knowledge_scope:record.knowledge_scope});Object.assign(record,result.revision);}
     notify('Đã lưu nội dung đề cương. Định dạng được giữ trong trình duyệt này.');return true;
    }catch(error){notify('Chưa lưu được đề cương: '+detailError(error),true);return false;}
   }
  });
 }
}
function openRevisionViewerModal(record,showAnswers=false){
 if(!record)return;
 const dlg=$('#detail-dialog');dlg.classList.add('wide-dialog');
 mountRevisionViewerContent($('#detail-content'),record,showAnswers,false);
 if(!dlg.open)dlg.showModal();
}
function openRevisionViewer(record,showAnswers=false){
 if(!record)return;
 store.activeRevisionViewId=record.id;
 store.activeRevisionShowAnswers=showAnswers;
 const inlineHost=$('#revision-inline-viewer');
 if(inlineHost&&store.tab==='revisions'){
  inlineHost.hidden=false;
  mountRevisionViewerContent(inlineHost,record,showAnswers,true);
  inlineHost.scrollIntoView({behavior:'smooth',block:'start'});
  return;
 }
 openRevisionViewerModal(record,showAnswers);
}
function editorStatusOptions(q){
 const s=C.reviewStatusOf(q);
 const keep=['approved','needs_review'].includes(s)?opt(s,`${statusNames[s]} (giữ nguyên nếu không sửa nội dung)`,true):'';
 return keep+opt('draft',statusNames.draft,s==='draft')+opt('pending_review','Gửi duyệt (chờ duyệt)',s==='pending_review');
}
function openEditor(id,duplicate=false){
 const old=id?questions().find(q=>q.id===id):null;
 if(old&&duplicate){
  const copy=structuredClone(old);
  delete copy.id;
  copy.question=copy.question+' (Bản sao)';
  copy.review_status='draft';
  store.editing=copy;
 }else{
  store.editing=old?structuredClone(old):{grade:Number(store.filters.grade)||effectiveGrade(),type:'MC',level:'Biết',lesson_code:store.filters.lesson||'',review_status:'draft',response_mode:'Trắc nghiệm',question:'',options:['','','',''],correct:0,option_explanations:['','','',''],max_score:1};
 }
 const q=store.editing;$('#edit-title').textContent=duplicate?'Nhân bản câu hỏi':old?'Sửa câu hỏi':'Thêm câu hỏi';
 $('#question-form').innerHTML=`<div id="form-error" class="callout error" role="alert" hidden></div><div class="form-grid"><div class="field"><label for="edit-grade">Khối lớp</label><select id="edit-grade" name="grade">${gradeOptions(q.grade)}</select></div><div class="field"><label for="edit-type">Dạng câu</label><select id="edit-type" name="type">${Object.entries(typeNames).map(([k,v])=>opt(k,v,k===q.type)).join('')}</select></div><div class="field"><label for="edit-level">Mức độ</label><select id="edit-level" name="level">${C.levelOptions(q.level)}</select></div><div class="field full"><label for="edit-lesson">Bài theo PPCT</label><select id="edit-lesson" name="lesson_code" required></select><p id="edit-lesson-hint" class="small muted" style="margin-top:4px"></p></div><div class="field full"><label for="edit-outcome">Yêu cầu cần đạt</label><select id="edit-outcome" name="outcome_index" required></select></div><div class="field span2"><label for="edit-competency">Thành phần Năng lực (NLa, NLb, NLc, NLd, NLe)</label><div style="display:flex;gap:8px;align-items:center"><input id="edit-competency" name="competency" value="${esc(q.competency||'')}" placeholder="VD: NLa hoặc chọn nhanh..." style="flex:1"><select id="quick-comp-select" style="max-width:145px" onchange="if(this.value){$('#edit-competency').value=this.value;}"><option value="">-- Chọn nhanh --</option><option value="NLa"${q.competency==='NLa'?' selected':''}>NLa (Phương tiện CNTT)</option><option value="NLb"${q.competency==='NLb'?' selected':''}>NLb (Môi trường số)</option><option value="NLc"${q.competency==='NLc'?' selected':''}>NLc (Giải quyết vấn đề)</option><option value="NLd"${q.competency==='NLd'?' selected':''}>NLd (Học &amp; tự học)</option><option value="NLe"${q.competency==='NLe'?' selected':''}>NLe (Hợp tác)</option></select></div><p class="small muted" style="margin-top:2px">NLa: Sử dụng &amp; QL phương tiện CNTT · NLb: Môi trường số · NLc: Giải quyết vấn đề · NLd: Học &amp; tự học · NLe: Hợp tác</p></div><div class="field span2"><label for="edit-status">Trạng thái sau khi lưu</label><select id="edit-status" name="review_status">${editorStatusOptions(q)}</select></div><div class="field"><label for="edit-mode">Cách trả lời</label><select id="edit-mode" name="response_mode">${['Trắc nghiệm','Tự luận','Thực hành'].map(v=>opt(v,v,v===q.response_mode)).join('')}</select></div><div class="field full"><label for="edit-question">Nội dung câu hỏi</label><textarea id="edit-question" name="question" rows="5" required aria-describedby="question-edit-help">${esc(q.question)}</textarea><div class="actions" style="margin-top:8px"><button type="button" data-question-template="code">Chèn mã</button><button type="button" data-question-template="table">Chèn bảng</button></div><p id="question-edit-help" class="editor-note">Chèn mẫu tại con trỏ rồi thay nội dung trong mẫu. Giữ dòng đầu và cuối của đoạn mã; giữ dòng gạch ngang và số cột của bảng. Xem kết quả bên dưới. Câu có mã hoặc bảng được sửa đầy đủ tại cửa sổ này.</p><div style="margin-top:12px"><strong>Xem trước nội dung câu hỏi</strong><div id="question-live-preview" style="margin-top:8px;padding:12px;border:1px solid #D5D9E4;border-radius:6px;min-height:48px"></div></div></div></div><div id="answer-editor" style="margin-top:20px"></div><div id="question-quality-warnings" aria-live="polite" style="margin-top:12px"></div><p class="editor-note">Câu mới mặc định là bản nháp. Câu chỉ được <strong>duyệt</strong> ở màn hình “Duyệt câu hỏi” với phiếu kiểm định. Sửa nội dung câu đã duyệt sẽ đưa câu về “Cần sửa lại”.</p><div class="dialog-bottom"><button type="button" data-close="edit-dialog">Hủy</button><button type="submit" class="primary">Lưu câu hỏi</button></div>`;
 const questionInput=$('#edit-question'),preview=$('#question-live-preview'),warnBox=$('#question-quality-warnings');
 const updateQualityWarnings=()=>{
  if(!warnBox)return;
  const curType=$('#edit-type')?.value||q.type||'MC';
  const draft={type:curType,question:questionInput?.value||''};
  if(curType==='MC'){
   draft.options=[0,1,2,3].map(i=>($(`#option-${i}`)?.value||'').trim());
  }else if(curType==='YN'){
   draft.statements=[0,1,2,3].map(i=>({label:'abcd'[i],text:($(`#stmt-${i}`)?.value||'').trim(),correct:$(`#stmt-ok-${i}`)?.value==='true'}));
  }else if(curType==='SHORT'){
   draft.short_answer=($('#edit-short-answer')?.value||'').trim();
  }else{
   draft.rubric=[0,1,2,3].map(i=>({criterion:($(`#rubric-${i}`)?.value||'').trim(),points:0.25}));
  }
  warnBox.innerHTML=qualityWarningsHtml(draft);
 };
 const updatePreview=()=>{preview.innerHTML=C.questionTextHtml(questionInput.value);updateQualityWarnings();};
 questionInput.oninput=updatePreview;updatePreview();
 $('#question-form').querySelectorAll('[data-question-template]').forEach(button=>{
  button.onclick=()=>{
   const inserted=C.insertQuestionTemplate(questionInput.value,questionInput.selectionStart,questionInput.selectionEnd,button.dataset.questionTemplate);
   questionInput.value=inserted.text;questionInput.focus();questionInput.setSelectionRange(inserted.selectionStart,inserted.selectionEnd);updatePreview();
  };
 });
 editorLessons(q.lesson_code,q.outcome_index,q.learning_outcome);renderAnswerEditor(q.type);updateQualityWarnings();
 $('#question-form').addEventListener('input',updateQualityWarnings);
 $('#question-form').addEventListener('change',updateQualityWarnings);
 $('#edit-grade').onchange=()=>editorLessons('',0);$('#edit-lesson').onchange=()=>editorOutcomes(0);$('#edit-type').onchange=()=>{const t=$('#edit-type').value;renderAnswerEditor(t);$('#edit-mode').value=['MC','YN','SHORT'].includes(t)?'Trắc nghiệm':'Tự luận';$('#edit-level').value=C.levelAfterTypeChange($('#edit-level').value,t);updateQualityWarnings();};$('#question-form').onsubmit=saveQuestion;
 $('#detail-dialog').close();$('#edit-dialog').showModal();
}
function editorLessons(code,index,outcome){const ls=instructionalLessons($('#edit-grade').value,undefined,{includeElective:true});$('#edit-lesson').innerHTML=ls.map(l=>opt(l.lesson_code,lessonOptionLabel(l),l.lesson_code===code)).join('');editorOutcomes(index,outcome);}
function editorOutcomes(index=0,outcome){
 const l=lessons($('#edit-grade').value).find(l=>l.lesson_code===$('#edit-lesson').value);
 const hintEl=$('#edit-lesson-hint');
 if(hintEl){
  if(l&&normalizePpctSection(l)==='elective_topic'){
   hintEl.style.color='#8A5A00';
   hintEl.textContent=`Chuyên đề học tập (Mục II.2${l.orientation?' · '+l.orientation:''} · TT 22/2021 Điều 6.3 & 7.1): chỉ dùng cho Kiểm tra thường xuyên (KTTX), KHÔNG đưa vào Đề cương hay Đề kiểm tra định kì (GK/CK).`;
  }else{
   hintEl.style.color='';
   hintEl.textContent='';
  }
 }
 const outcomes=l?.outcomes||[];let n=Number.isInteger(index)?index:outcomes.indexOf(outcome);if(n<0)n=0;$('#edit-outcome').innerHTML=outcomes.map((s,i)=>opt(i,s,i===n)).join('');
}
function renderAnswerEditor(type){
 const q=store.editing;
 if(type==='MC')$('#answer-editor').innerHTML=`<h3>Phương án và giải thích</h3><p class="muted small">Chọn đúng một phương án bằng nút tròn. Giải thích vì sao từng phương án đúng hoặc sai.</p><div class="edit-options">${[0,1,2,3].map(i=>`<div class="option-editor"><div class="option-radio"><input type="radio" name="correct" value="${i}" aria-label="${'ABCD'[i]} là đáp án đúng"${(q.correct??0)===i?' checked':''}></div><div class="field"><label for="option-${i}">Phương án ${'ABCD'[i]}</label><input id="option-${i}" name="option${i}" value="${esc(q.options?.[i]||'')}" required><label for="explanation-${i}">Giải thích phương án ${'ABCD'[i]}</label><textarea id="explanation-${i}" name="explanation${i}" rows="2" required>${esc(q.option_explanations?.[i]||'')}</textarea></div></div>`).join('')}</div>`;
 else if(type==='YN')$('#answer-editor').innerHTML=`<h3>4 mệnh đề Đúng / Sai (chuẩn THPT CV 7991)</h3><p class="muted small">Nhập đủ 4 ý a, b, c, d và chọn đáp án Đúng/Sai cho từng ý.</p><div class="yn-edit-grid">${[0,1,2,3].map(i=>`<div class="yn-edit-row"><div class="field"><label for="stmt-${i}">Ý ${'abcd'[i]})</label><input id="stmt-${i}" name="stmt${i}" value="${esc(q.statements?.[i]?.text||'')}" required></div><div class="field"><label for="stmt-ok-${i}">Đáp án</label><select id="stmt-ok-${i}" name="stmt_ok_${i}">${opt('true','Đúng',Boolean(q.statements?.[i]?.correct))}${opt('false','Sai',!q.statements?.[i]?.correct)}</select></div></div>`).join('')}</div>`;
 else if(type==='SHORT')$('#answer-editor').innerHTML=`<h3>Đáp án Trả lời ngắn (chuẩn THPT CV 7991)</h3><p class="muted small">Đáp án ngắn gọn (con số, cụm từ khóa Tin học hoặc biểu thức).</p><div class="field"><label for="edit-short-answer">Đáp án đúng</label><input id="edit-short-answer" name="short_answer" value="${esc(C.shortAnswerOf(q))}" required placeholder="Ví dụ: 42 hoặc NLd"></div>`;
 else $('#answer-editor').innerHTML=`<h3>Hướng dẫn chấm · 1 điểm</h3><p class="muted small">Bốn tiêu chí, mỗi tiêu chí 0,25 điểm. Nêu rõ sản phẩm hoặc minh chứng nếu là bài thực hành.</p>${[0,1,2,3].map(i=>`<div class="field" style="margin-bottom:12px"><label for="rubric-${i}">Tiêu chí ${i+1} · 0,25 điểm</label><textarea id="rubric-${i}" name="rubric${i}" rows="2" required>${esc(q.rubric?.[i]?.criterion||'')}</textarea></div>`).join('')}<div class="field"><label for="equivalent-policy">Chấp nhận đáp án tương đương</label><textarea id="equivalent-policy" name="equivalent_answer_policy" required>${esc(q.equivalent_answer_policy||'Chấp nhận cách diễn đạt và giải pháp tương đương nếu đúng dữ kiện, phù hợp yêu cầu và có giải thích hợp lí; chấm từng tiêu chí độc lập.')}</textarea></div>`;
}
async function saveQuestion(event){
 event.preventDefault();const f=new FormData(event.target),q={...store.editing,grade:Number(f.get('grade')),type:f.get('type'),lesson_code:f.get('lesson_code'),outcome_index:Number(f.get('outcome_index')),competency:(f.get('competency')||'').trim(),level:f.get('level'),review_status:f.get('review_status'),response_mode:f.get('response_mode'),question:f.get('question').trim(),max_score:1};
 const lesson=lessons(q.grade).find(l=>l.lesson_code===q.lesson_code);q.learning_outcome=lesson?.outcomes?.[q.outcome_index]||'';q.lesson_name=lesson?.lesson_name_source||'';q.topic_source=lesson?.topic_source||'';
 q.ppct_section=normalizePpctSection(lesson);
 if(lesson?.orientation)q.orientation=lesson.orientation;else delete q.orientation;
 const occ=safeLessonOccurrences(lesson?.occurrences);
 q.source_file=lesson?.source_file||'';q.source_rows=occ.map(r=>({table_index:r.table_index,row_index:r.row_index,week_raw:r.week_raw,periods_raw:r.periods_raw}));q.semester=1;
 const lessonPeriods=occ.flatMap(r=>String(r.ppct_raw||r.periods_raw||'').match(/\d+/g)||[]).map(Number);
 const ck1Lesson=lessons(q.grade).find(l=>l.lesson_code==='KTCK1');
 const ck1Periods=safeLessonOccurrences(ck1Lesson?.occurrences||[]).flatMap(r=>String(r.ppct_raw||r.periods_raw||'').match(/\d+/g)||[]).map(Number).filter(n=>n>0);
 const ck1Limit=ck1Periods.length?Math.min(...ck1Periods):(q.grade>=10?32:16);
 if(lessonPeriods.length){q.first_ppct_period=Math.min(...lessonPeriods);q.after_hk1_exam=q.first_ppct_period>=ck1Limit;}

 if(q.type==='MC'){
  q.options=[0,1,2,3].map(i=>f.get('option'+i).trim());q.correct=Number(f.get('correct'));q.option_explanations=[0,1,2,3].map(i=>f.get('explanation'+i).trim());
  delete q.statements;delete q.short_answer;delete q.rubric;delete q.equivalent_answer_policy;
 }else if(q.type==='YN'){
  q.statements=[0,1,2,3].map(i=>({label:'abcd'[i],text:f.get('stmt'+i).trim(),correct:f.get('stmt_ok_'+i)==='true'}));
  delete q.options;delete q.correct;delete q.option_explanations;delete q.short_answer;delete q.rubric;delete q.equivalent_answer_policy;
 }else if(q.type==='SHORT'){
  q.short_answer=f.get('short_answer').trim();
  delete q.options;delete q.correct;delete q.option_explanations;delete q.statements;delete q.rubric;delete q.equivalent_answer_policy;
 }else{
  q.rubric=[0,1,2,3].map(i=>({criterion:f.get('rubric'+i).trim(),points:.25}));q.equivalent_answer_policy=f.get('equivalent_answer_policy').trim();
  delete q.options;delete q.correct;delete q.option_explanations;delete q.statements;delete q.short_answer;
 }
 const result=await mutate('/api/questions/save',{question:q},res=>{$('#edit-dialog').close();render();
  const dup=res.duplicates||[];
  notify(dup.length?`Đã lưu câu hỏi. Lưu ý: nội dung trùng nguyên văn với ${dup.map(d=>isTechId(d.id)?`1 câu khác (Khối ${d.grade})`:`${d.id} (Khối ${d.grade})`).join(', ')}. Chỉ là cảnh báo.`:'Đã lưu câu hỏi vào ngân hàng.');});return result;
}
async function archiveQuestion(id){const q=questions().find(q=>q.id===id);const lbl=isTechId(id)?'câu hỏi này':`câu ${id}`;if(!q||!confirm(`Lưu trữ ${lbl}? Câu sẽ ngừng được chọn tạo đề; nội dung và lịch sử vẫn được giữ.`))return;await mutate('/api/questions/archive',{id},()=>{store.selected.delete(id);$('#detail-dialog').close();render();notify('Đã lưu trữ câu hỏi. Có thể tìm lại qua bộ lọc “Đã lưu trữ”.');});}
async function restoreQuestion(id){
 const q=questions().find(q=>q.id===id);if(!q)return;
 const lbl=isTechId(id)?'câu hỏi':`câu hỏi ${id}`;
 await mutate('/api/questions/restore',{id},()=>{$('#detail-dialog').close();render();notify(`Đã khôi phục ${lbl}. Hãy kiểm tra trạng thái duyệt trước khi sử dụng.`);});
}
async function deleteQuestion(id){
 const q=questions().find(q=>q.id===id);const lbl=isTechId(id)?'câu hỏi này':`câu hỏi ${id}`;if(!q||!confirm(`Xóa vĩnh viễn ${lbl}? Hãy tải bản sao lưu trước nếu cần khôi phục.`))return;
 await mutate('/api/questions/delete',{id},()=>{store.selected.delete(id);$('#detail-dialog').close();render();notify('Đã xóa câu hỏi khỏi ngân hàng.');});
}
async function bulkUpdateSelected(action,status='pending_review'){
 const ids=[...store.selected];
 if(!ids.length){notify('Hãy đánh dấu chọn ít nhất một câu hỏi trước.',true);return;}
 if(action==='bulk_approve'){
  if(!confirm(`Xác nhận duyệt nhanh ${ids.length} câu hỏi đã chọn?\n\nHệ thống sẽ tự kiểm tra điều kiện kỹ thuật của từng câu trước khi chuyển sang Đã duyệt.`))return;
  await mutate('/api/questions/bulk',{ids,action:'bulk_approve',confirmed:true},res=>{
   const approvedCnt=Number(res.approved_count||0),alreadyCnt=Number(res.already_approved_count||0),skippedCnt=Number(res.skipped_count||0);
   store.selected.clear();render();
   const parts=[`Đã duyệt nhanh ${approvedCnt} câu hỏi.`];
   if(alreadyCnt)parts.push(`${alreadyCnt} câu đã duyệt trước đó.`);
   if(skippedCnt)parts.push(`Bỏ qua ${skippedCnt} câu chưa đủ nội dung kỹ thuật${res.skipped?.[0]?.reason?' ('+res.skipped[0].reason+')':''}.`);
   notify(parts.join(' '),approvedCnt===0&&skippedCnt>0);
  });
  return;
 }
 if(action==='status'&&status==='approved'){notify('Hãy bấm nút "Duyệt nhanh đã chọn" hoặc mở màn hình Duyệt câu hỏi để kiểm định.',true);return;}
 let confirmMsg = `Chuyển trạng thái ${ids.length} câu hỏi?`;
 if (action === 'delete') confirmMsg = `Xóa vĩnh viễn ${ids.length} câu hỏi?`;
 else if (action === 'grade') confirmMsg = `Chuyển ${ids.length} câu hỏi đã chọn sang Khối ${status}?`;
 if(!confirm(confirmMsg))return;
 await mutate('/api/questions/bulk',{ids,action,status},()=>{store.selected.clear();render();notify('Đã cập nhật các câu hỏi đã chọn.');});
}

async function autoSplitK8K9Questions() {
  const allQs = questions();
  // Lọc các câu hỏi hiện đang ở Khối 8 và không ở trạng thái lưu trữ
  const k8Qs = allQs.filter(q => Number(q.grade) === 8 && q.review_status !== 'archived');
  if (!k8Qs.length) {
    notify('Không có câu hỏi Khối 8 nào đang hoạt động để rà soát.');
    return;
  }

  // Danh mục từ khóa / đặc trưng nội dung môn Tin học Khối 9 (GDPT 2018)
  const k9Keywords = [
    'router', 'switch', 'access point', 'modem', 'cap mang', 'cáp mạng', 'thiet bi mang', 'mang khong day', 'mang co day',
    'so do tu duy', 'mindmap', 'phan mem mo phong', 'mo phong', 'simulation', 'phet', 'solar system',
    'countif', 'sumif', 'ham if', 'hàm if', 'xac thuc du lieu', 'data validation', 'tai chinh gia dinh',
    'dich vu internet', 'the gioi ki thuat so', 'van de phap ly', 'chat luong thong tin'
  ];

  const strip = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const candidatesForK9 = k8Qs.filter(q => {
    const text = strip(`${q.question || ''} ${(q.options || []).join(' ')} ${q.learning_outcome || ''} ${q.lesson_name || ''} ${q.explanation || ''}`);
    return k9Keywords.some(kw => text.includes(kw));
  });

  if (!candidatesForK9.length) {
    notify(`Đã rà soát ${k8Qs.length} câu hỏi Khối 8: Toàn bộ nội dung đều thuộc chuẩn Khối 8, không phát hiện câu Tin 9 bị lẫn vào.`);
    return;
  }

  const ok = confirm(`Hệ thống phân tích và phát hiện ${candidatesForK9.length} / ${k8Qs.length} câu hỏi có nội dung đặc trưng Tin học Khối 9 (thiết bị mạng, mô phỏng, hàm IF/COUNTIF/SUMIF, v.v...) nhưng đang bị gán Khối 8.\n\nThầy/Cô có muốn tự động chuyển ${candidatesForK9.length} câu này sang Khối 9 không?`);
  if (!ok) return;

  const idsToMove = candidatesForK9.map(q => q.id);
  await mutate('/api/questions/bulk', { ids: idsToMove, action: 'grade', status: 9 }, () => {
    render();
    notify(`Đã chuyển thành công ${idsToMove.length} câu hỏi về đúng Khối 9.`);
  });
}

function importReportText(result,fileName){
  const r=result&&result.import_report;
  if(!r)return `Đã nạp câu hỏi từ ${fileName}. Câu mới ở trạng thái Nháp, cần kiểm định trước khi ra đề.`;
  return `Đã thêm ${r.added} câu mới từ ${fileName}`+(r.skipped?`; bỏ qua ${r.skipped} câu đã có trong ngân hàng`:'')+'. Câu mới ở trạng thái Nháp, cần kiểm định trước khi ra đề.';
}

function openImportDedupDialog({ filename, questions, grade, subjectName, detectedGrade }) {
  const dlg = $('#import-dedup-dialog');
  if (!dlg) return;
  const container = $('#import-dedup-content');
  if (!container) return;
  const titleEl = $('#import-dedup-title');
  if (titleEl) {
    titleEl.textContent = `Xem trước & Kiểm soát trùng lặp: ${filename}`;
  }

  let currentTargetGrade = Number(grade) || Number(store.filters?.grade) || effectiveGrade();
  const effectiveSubject = subjectName || store.selectedSubject || store.ppctSubject || subject() || 'Tin học';
  const currentBankQs = store.bank?.questions || [];

  let currentTab = 'all';
  let classified;

  function runClassification(targetGrade) {
    currentTargetGrade = targetGrade;
    // Cập nhật khối cho các câu hỏi không có cột khối riêng từ từng dòng Excel
    questions.forEach(q => {
      if (!q._hasExplicitRowGrade) {
        q.grade = currentTargetGrade;
      }
    });

    if (typeof TableFileHelper !== 'undefined' && typeof TableFileHelper.classifyQuestionsForImport === 'function') {
      classified = TableFileHelper.classifyQuestionsForImport(questions, currentBankQs, currentTargetGrade);
    } else {
      const norm = x => String(x == null ? '' : x).normalize('NFC').toLowerCase().trim().replace(/\s+/gu, ' ');
      const existingMap = new Map();
      for (const q of currentBankQs) {
        if (!q) continue;
        const g = Number(q.grade) || currentTargetGrade;
        const key = `${g}|${norm(q.question)}`;
        if (!existingMap.has(key)) existingMap.set(key, q);
      }
      const seenInBatch = new Map();
      const items = (questions || []).map((rawQ, idx) => {
        const q = { ...rawQ };
        q.grade = Number(q.grade) || currentTargetGrade;
        q.type = q.type || 'MC';
        const key = `${q.grade}|${norm(q.question)}`;
        if (existingMap.has(key)) {
          const matched = existingMap.get(key);
          return { status: 'bank_dup', matchedId: matched.id || '', matchedLesson: matched.lesson_code || '', matchedOutcome: matched.learning_outcome || '', question: q, index: idx };
        } else if (seenInBatch.has(key)) {
          return { status: 'internal_dup', firstIndex: seenInBatch.get(key), question: q, index: idx };
        } else {
          seenInBatch.set(key, idx);
          return { status: 'new', question: q, index: idx };
        }
      });
      classified = {
        items,
        counts: {
          total: items.length,
          new: items.filter(x => x.status === 'new').length,
          bank_dup: items.filter(x => x.status === 'bank_dup').length,
          internal_dup: items.filter(x => x.status === 'internal_dup').length
        },
        validNewQuestions: items.filter(x => x.status === 'new').map(x => x.question),
        nonInternalDupQuestions: items.filter(x => x.status !== 'internal_dup').map(x => x.question)
      };
    }
  }

  runClassification(currentTargetGrade);

  function renderDialogView() {
    const { items: itemsInfo, counts } = classified;
    const totalCount = counts.total;
    const newCount = counts.new;
    const bankDupCount = counts.bank_dup;
    const internalDupCount = counts.internal_dup;

    const filteredItems = itemsInfo.filter(item => {
      if (currentTab === 'new') return item.status === 'new';
      if (currentTab === 'bank_dup') return item.status === 'bank_dup';
      if (currentTab === 'internal_dup') return item.status === 'internal_dup';
      return true;
    });

    const kgWarnings = (typeof TableFileHelper !== 'undefined' && typeof TableFileHelper.knowledgeImportWarnings === 'function')
      ? TableFileHelper.knowledgeImportWarnings(questions, store.bank?.ppct, { subject: effectiveSubject }) : [];
    const kgWarningHtml = kgWarnings.length ? `<details class="callout warning" style="margin:0"><summary><strong>Bản đồ tri thức: ${kgWarnings.length} câu cần xem lại</strong> (bài/YCCĐ không khớp PPCT hoặc dạng câu không hợp cấp học; không chặn nhập)</summary><ul style="margin:6px 0 0">${kgWarnings.slice(0, 50).map(w => `<li>${esc(w.message)}</li>`).join('')}${kgWarnings.length > 50 ? `<li>… và ${kgWarnings.length - 50} cảnh báo khác</li>` : ''}</ul></details>` : '';
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        ${kgWarningHtml}
        <!-- Hộp chọn Khối lớp áp dụng & thông báo nhận diện -->
        <div style="display:flex;align-items:center;justify-content:space-between;background:#F2F0FB;border:1px solid #D6D1F2;border-radius:8px;padding:10px 16px;flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <label for="import-dedup-grade-select" style="font-weight:700;color:#4A3AA8;font-size:13px">Khối lớp áp dụng cho tệp này:</label>
            <select id="import-dedup-grade-select" style="font-weight:700;color:#4A3AA8;padding:5px 12px;border-radius:6px;border:1px solid #4A3AA8;background:#fff;font-size:13px;cursor:pointer">
              ${[6, 7, 8, 9, 10, 11, 12].map(gr => `<option value="${gr}" ${gr === currentTargetGrade ? 'selected' : ''}>Khối ${gr}</option>`).join('')}
            </select>
          </div>
          <div style="font-size:12px;color:#4A3AA8">
            ${detectedGrade ? `Đã tự động nhận diện <strong>Khối ${detectedGrade}</strong> từ tên tệp` : `(Đang lấy theo bộ lọc: Khối ${currentTargetGrade})`}
            — <em>Thầy/Cô có thể đổi khối trên nếu cần</em>
          </div>
        </div>

        <!-- Thống kê 4 khối KPI -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px">
          <div style="background:#F7F8FB;border:1px solid #D5D9E4;border-radius:8px;padding:10px 14px">
            <div style="color:#5B6475;font-size:11px;font-weight:600;text-transform:uppercase">Tổng số câu trong tệp</div>
            <div style="font-size:22px;font-weight:700;color:#1C2333;margin-top:2px">${totalCount} <span style="font-size:12px;font-weight:400;color:#5B6475">câu</span></div>
          </div>
          <div style="background:#EEF6F2;border:1px solid #A9D3C1;border-radius:8px;padding:10px 14px">
            <div style="color:#1F6B52;font-size:11px;font-weight:600;text-transform:uppercase">Câu mới sẵn sàng nạp</div>
            <div style="font-size:22px;font-weight:700;color:#1F6B52;margin-top:2px">${newCount} <span style="font-size:12px;font-weight:400;color:#1F6B52">câu</span></div>
          </div>
          <div style="background:#F3F4F8;border:1px solid #D4A84A;border-radius:8px;padding:10px 14px">
            <div style="color:#8A5A00;font-size:11px;font-weight:600;text-transform:uppercase">Trùng lặp Ngân hàng</div>
            <div style="font-size:22px;font-weight:700;color:#8A5A00;margin-top:2px">${bankDupCount} <span style="font-size:12px;font-weight:400;color:#8A5A00">câu</span></div>
          </div>
          <div style="background:${internalDupCount > 0 ? '#FDEEEE' : '#F7F8FB'};border:1px solid ${internalDupCount > 0 ? '#F4C7C7' : '#D5D9E4'};border-radius:8px;padding:10px 14px">
            <div style="color:${internalDupCount > 0 ? '#A32020' : '#5B6475'};font-size:11px;font-weight:600;text-transform:uppercase">Trùng nội bộ trong tệp</div>
            <div style="font-size:22px;font-weight:700;color:${internalDupCount > 0 ? '#C62828' : '#5B6475'};margin-top:2px">${internalDupCount} <span style="font-size:12px;font-weight:400;color:#5B6475">câu</span></div>
          </div>
        </div>

        <!-- Thanh Tab lọc câu hỏi -->
        <div style="display:flex;gap:8px;border-bottom:1px solid #E4E7F0;padding-bottom:8px;margin-top:4px;flex-wrap:wrap">
          <button type="button" class="button ${currentTab === 'all' ? 'primary' : 'quiet'}" id="import-tab-all" style="font-size:12px;padding:5px 12px;border-radius:20px">
            Tất cả (${totalCount})
          </button>
          <button type="button" class="button ${currentTab === 'new' ? 'primary' : 'quiet'}" id="import-tab-new" style="font-size:12px;padding:5px 12px;border-radius:20px;color:${currentTab === 'new' ? '#fff' : '#1F6B52'}">
            Câu mới (${newCount})
          </button>
          <button type="button" class="button ${currentTab === 'bank_dup' ? 'primary' : 'quiet'}" id="import-tab-bank-dup" style="font-size:12px;padding:5px 12px;border-radius:20px;color:${currentTab === 'bank_dup' ? '#fff' : '#8A5A00'}">
            Trùng Ngân hàng (${bankDupCount})
          </button>
          ${internalDupCount > 0 ? `
          <button type="button" class="button ${currentTab === 'internal_dup' ? 'primary' : 'quiet'}" id="import-tab-internal-dup" style="font-size:12px;padding:5px 12px;border-radius:20px;color:${currentTab === 'internal_dup' ? '#fff' : '#C62828'}">
            Trùng nội bộ (${internalDupCount})
          </button>` : ''}
        </div>

        <!-- Danh sách câu hỏi cuộn dọc -->
        <div style="max-height:46vh;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:2px 6px 6px 2px">
          ${filteredItems.length === 0 ? `
            <div style="text-align:center;padding:30px;color:#8F97A8;font-style:italic;background:#fff;border-radius:8px;border:1px dashed #D5D9E4">
              Không có câu hỏi nào trong danh mục này.
            </div>
          ` : filteredItems.map(item => {
            const q = item.question;
            const idx = item.index;
            let statusBadge = '';
            let cardBorder = '#E4E7F0';
            let cardBg = '#fff';

            if (item.status === 'new') {
              statusBadge = `<span style="background:#E1EFE8;color:#1F6B52;border:1px solid #A9D3C1;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">Câu mới</span>`;
              cardBorder = '#CFE5DB';
            } else if (item.status === 'bank_dup') {
              statusBadge = `<span style="background:#FBF4E4;color:#8A5A00;border:1px solid #D4A84A;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">Trùng Ngân hàng: ${esc(item.matchedId)}${item.matchedLesson ? ' · Bài ' + esc(item.matchedLesson) : ''}</span>`;
              cardBorder = '#EBD7A6';
              cardBg = '#F7F8FB';
            } else if (item.status === 'internal_dup') {
              statusBadge = `<span style="background:#F3F4F8;color:#C62828;border:1px solid #F4C7C7;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">Trùng lặp với câu #${item.firstIndex + 1}</span>`;
              cardBorder = '#F4C7C7';
              cardBg = '#F7F8FB';
            }

            const typeLabel = (typeof typeNames !== 'undefined' && typeNames[q.type]) || q.type || 'MC';
            const levelLabel = q.level || 'Biết';
            const lessonLabel = q.lesson_code ? `Bài ${esc(q.lesson_code)}` : 'Chưa gắn mã bài';

            let answerHtml = '';
            if (q.type === 'MC' && Array.isArray(q.options)) {
              answerHtml = `
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:6px;margin-top:6px">
                  ${q.options.map((opt, oIdx) => {
                    const isCorrect = Number(q.correct) === oIdx;
                    return `
                      <div style="padding:4px 8px;border-radius:4px;font-size:12px;border:1px solid ${isCorrect ? '#A9D3C1' : '#E4E7F0'};background:${isCorrect ? '#E1EFE8' : '#F7F8FB'};color:${isCorrect ? '#1F6B52' : '#2E3646'};font-weight:${isCorrect ? '600' : '400'}">
                        <strong>${String.fromCharCode(65 + oIdx)}.</strong> ${esc(opt)} ${isCorrect ? '✓' : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              `;
            } else if (q.type === 'YN' && Array.isArray(q.branches)) {
              answerHtml = `
                <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
                  ${q.branches.map((b, bIdx) => `
                    <div style="padding:4px 8px;border-radius:4px;font-size:12px;background:#F7F8FB;border:1px solid #E4E7F0;display:flex;align-items:center;gap:8px">
                      <strong style="min-width:18px">${String.fromCharCode(97 + bIdx)})</strong>
                      <span style="padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;background:${b.correct ? '#E1EFE8' : '#F3F4F8'};color:${b.correct ? '#1F6B52' : '#C62828'}">
                        ${b.correct ? 'ĐÚNG' : 'SAI'}
                      </span>
                      <span>${esc(b.content || '')}</span>
                    </div>
                  `).join('')}
                </div>
              `;
            } else if (q.type === 'SHORT') {
              answerHtml = `
                <div style="margin-top:6px;padding:6px 10px;background:#EEF6F2;border-radius:4px;border:1px solid #CFE5DB;font-size:12px;color:#1F6B52">
                  <strong>Đáp án ngắn:</strong> ${esc(q.answer || '(Trống)')}
                </div>
              `;
            } else if (q.type === 'ES') {
              answerHtml = `
                <div style="margin-top:6px;padding:6px 10px;background:#F7F8FB;border-radius:4px;border:1px solid #E4E7F0;font-size:12px;color:#2E3646">
                  <strong>Hướng dẫn chấm / Lời giải:</strong> ${esc(q.explanation || (Array.isArray(q.rubric) ? q.rubric.map(r=>r.criterion + ': ' + r.points + 'đ').join('; ') : '—'))}
                </div>
              `;
            }

            return `
              <div style="background:${cardBg};border:1px solid ${cardBorder};border-radius:8px;padding:10px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.02)">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span style="font-weight:700;color:#4A3AA8">#${idx + 1}</span>
                    <span style="background:#F3F4F8;color:#4A3AA8;border:1px solid #ECE9F9;border-radius:3px;padding:1px 6px;font-size:11px;font-weight:700">Khối ${q.grade}</span>
                    ${statusBadge}
                    <span style="background:#ECE9F9;color:#4A3AA8;border-radius:3px;padding:1px 6px;font-size:11px;font-weight:600">${esc(typeLabel)}</span>
                    <span style="background:#F3F4F8;color:#4A5263;border-radius:3px;padding:1px 6px;font-size:11px">${esc(levelLabel)}</span>
                    <span style="background:#F3F4F8;color:#4A5263;border-radius:3px;padding:1px 6px;font-size:11px">${esc(lessonLabel)}</span>
                  </div>
                </div>
                <div style="font-size:13px;color:#1C2333;line-height:1.5;margin:4px 0">
                  ${(typeof C !== 'undefined' && C.questionTextHtml) ? C.questionTextHtml(q.question) : esc(q.question)}
                </div>
                ${answerHtml}
                ${q.learning_outcome ? `
                  <div style="margin-top:6px;font-size:11px;color:#5B6475">
                    <em>YCCĐ:</em> ${esc(q.learning_outcome)}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Thanh điều khiển và xác nhận nhập -->
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E4E7F0;padding-top:12px;margin-top:4px;flex-wrap:wrap;gap:10px">
          <div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;color:#1C2333">
              <input type="checkbox" id="import-dedup-skip-dups" checked>
              <span>Chỉ nạp các câu hỏi mới hợp lệ (Tự động bỏ qua <strong>${bankDupCount}</strong> câu trùng ngân hàng &amp; loại trừ trùng nội bộ)</span>
            </label>
            ${newCount === 0 ? `
              <div style="color:#C62828;font-size:12px;font-weight:600;margin-top:3px">
                Tất cả ${totalCount} câu trong tệp đều đã có trong Ngân hàng hoặc bị trùng lặp. Không có câu mới nào cần nạp!
              </div>
            ` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" class="button quiet" data-close="import-dedup-dialog">Hủy</button>
            <button type="button" class="button primary" id="import-dedup-btn-submit"
              ${newCount === 0 ? 'disabled' : ''}
              style="background:#4A3AA8;border-color:#4A3AA8;color:#fff;font-weight:700;padding:7px 18px;${newCount === 0 ? 'opacity:0.5;cursor:not-allowed;' : ''}">
              ${newCount > 0 ? `Nạp ${newCount} câu mới vào Ngân hàng` : 'Không có câu mới'}
            </button>
          </div>
        </div>
      </div>
    `;

    // Gắn sự kiện chọn khối lớp
    const gradeSelect = $('#import-dedup-grade-select');
    if (gradeSelect) {
      gradeSelect.onchange = (e) => {
        runClassification(Number(e.target.value));
        renderDialogView();
      };
    }

    // Gắn sự kiện tab
    const tabAll = $('#import-tab-all');
    if (tabAll) tabAll.onclick = () => { currentTab = 'all'; renderDialogView(); };
    const tabNew = $('#import-tab-new');
    if (tabNew) tabNew.onclick = () => { currentTab = 'new'; renderDialogView(); };
    const tabBankDup = $('#import-tab-bank-dup');
    if (tabBankDup) tabBankDup.onclick = () => { currentTab = 'bank_dup'; renderDialogView(); };
    const tabInternalDup = $('#import-tab-internal-dup');
    if (tabInternalDup) tabInternalDup.onclick = () => { currentTab = 'internal_dup'; renderDialogView(); };

    // Gắn sự kiện nạp
    const submitBtn = $('#import-dedup-btn-submit');
    if (submitBtn && newCount > 0) {
      submitBtn.onclick = async () => {
        const skipDups = $('#import-dedup-skip-dups')?.checked;
        let toImport = [];
        if (skipDups) {
          toImport = itemsInfo.filter(x => x.status === 'new').map(x => x.question);
        } else {
          toImport = itemsInfo.filter(x => x.status !== 'internal_dup').map(x => x.question);
        }

        if (!toImport.length) {
          notify('Không có câu hỏi hợp lệ nào được chọn để nạp.', true);
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Đang nạp dữ liệu...';

        try {
          await mutate('/api/bank/import', { bank: { questions: toImport }, mode: 'append' }, result => {
            dlg.close();
            render();
            notify(importReportText(result, filename));
          });
        } catch (err) {
          notify('Lỗi nạp câu hỏi: ' + (err.message || err), true);
          submitBtn.disabled = false;
          submitBtn.textContent = `Nạp ${newCount} câu mới vào Ngân hàng`;
        }
      };
    }
  }

  renderDialogView();
  dlg.showModal();
}

async function importBank(event){
  const file=event.target.files[0];
  if(!file)return;
  const ext=file.name.toLowerCase().split('.').pop();
  try{
    let detectedGrade = null;
    if (typeof TableFileHelper !== 'undefined' && typeof TableFileHelper.detectGradeFromFilename === 'function') {
      detectedGrade = TableFileHelper.detectGradeFromFilename(file.name);
    } else {
      const clean = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const m = clean.match(/(?:khoi|k|lop|grade|tin(?:[_\s\-]*hoc)?)[_\s\-]*([6-9]|1[0-2])(?:[_\s\-\.]|$)/i);
      if (m) detectedGrade = Number(m[1]);
    }
    const g = detectedGrade || Number(store.filters?.grade) || effectiveGrade();
    const s = store.selectedSubject || store.ppctSubject || subject() || 'Tin học';

    if(typeof TableFileHelper !== 'undefined') {
      const res = await TableFileHelper.readTableFile(file);
      if(res.type === 'table') {
        const parsed = TableFileHelper.parseQuestionsFromRows(res.rows, g, s);
        if(!parsed.length){
          notify('Không tìm thấy câu hỏi hợp lệ trong bảng tính. Hãy bấm "Tải mẫu câu hỏi (Excel)" để xem mẫu 11 cột chuẩn.', true);
          return;
        }
        openImportDedupDialog({ filename: file.name, questions: parsed, grade: g, subjectName: s, detectedGrade });
        return;
      } else if(res.type === 'json') {
        let bank = res.data;
        if(Array.isArray(bank)) bank = { questions: bank };
        else if(bank && bank.bank) bank = bank.bank;
        
        // Nếu file JSON chứa danh sách câu hỏi: mở hộp thoại đối chiếu trùng lặp
        if (bank && Array.isArray(bank.questions) && (!bank.revisions || !bank.revisions.length) && (!bank.exams || !bank.exams.length) && (!bank.matrices || !bank.matrices.length)) {
          openImportDedupDialog({ filename: file.name, questions: bank.questions, grade: g, subjectName: s, detectedGrade });
          return;
        }

        if(!confirm('Khôi phục ngân hàng từ tệp JSON này? Toàn bộ câu hỏi hiện có sẽ được THAY bằng câu trong tệp. Ứng dụng kiểm tra dữ liệu và sao lưu trước khi ghi; PPCT gốc được giữ nguyên.')) return;
        await mutate('/api/bank/import', { bank }, () => {
          render();
          notify('Đã nhập ngân hàng từ JSON thành công và lưu bản sao trước thay đổi.');
        });
        return;
      } else if(res.type === 'markdown' || res.type === 'text') {
        const text = res.text;
        const parsed = parseQuestionsFromRawText(text, g, s);
        if(!parsed.length){
          notify('Không tìm thấy câu hỏi hợp lệ trong tệp Markdown. Bấm "Tải mẫu câu hỏi (Markdown)" để xem định dạng chuẩn.', true);
          return;
        }
        openImportDedupDialog({ filename: file.name, questions: parsed, grade: g, subjectName: s, detectedGrade });
        return;
      }
    }

    // Fallback nếu chưa load được TableFileHelper
    if(ext==='md'||ext==='txt'){
      const text=await file.text();
      const parsed=parseQuestionsFromRawText(text,g,s);
      if(!parsed.length){
        notify('Không tìm thấy câu hỏi hợp lệ trong tệp Markdown. Bấm "Tải mẫu câu hỏi (Markdown)" để xem định dạng chuẩn.',true);
        return;
      }
      openImportDedupDialog({ filename: file.name, questions: parsed, grade: g, subjectName: s, detectedGrade });
    }else{
      const text=await file.text();
      let bank=JSON.parse(text);
      if(Array.isArray(bank))bank={questions:bank};
      else if(bank.bank)bank=bank.bank;
      if (bank && Array.isArray(bank.questions) && (!bank.revisions || !bank.revisions.length) && (!bank.exams || !bank.exams.length) && (!bank.matrices || !bank.matrices.length)) {
        openImportDedupDialog({ filename: file.name, questions: bank.questions, grade: g, subjectName: s, detectedGrade });
        return;
      }
      if(!confirm('Khôi phục ngân hàng từ tệp JSON này? Toàn bộ câu hỏi hiện có sẽ được THAY bằng câu trong tệp. Ứng dụng kiểm tra dữ liệu và sao lưu trước khi ghi; PPCT gốc được giữ nguyên.'))return;
      await mutate('/api/bank/import',{bank},()=>{render();notify('Đã nhập ngân hàng và lưu bản sao trước thay đổi.');});
    }
  }catch(e){
    notify('Không đọc được tệp: '+e.message,true);
  }finally{
    event.target.value='';
  }
}
function renderPpctListCell(items, emptyText = '—') {
  if (!items || !items.length) return `<span class="muted">${emptyText}</span>`;
  if (items.length === 1) return esc(items[0]);
  return `<ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
}
function ppctSectionTagHtml(l) {
  const sec = normalizePpctSection(l);
  if (sec === 'elective_topic') {
    const orient = l.orientation ? ` · ${l.orientation}` : '';
    return `<span class="ppct-tag ppct-tag-elective">CĐHT${esc(orient)}</span>`;
  }
  if (sec === 'assessment') return '<span class="ppct-tag ppct-tag-assessment">KT định kỳ</span>';
  if (sec === 'review') return '<span class="ppct-tag ppct-tag-review">Ôn tập</span>';
  return '';
}
function renderPPCT(){
 const g=effectiveGrade();
 store.ppctGrade=g;
 const s=store.selectedSubject || store.ppctSubject || 'Tin học';
 store.ppctSubject = s;
 const allSubjects=['Tin học', 'Toán học', 'Vật lí', 'Hóa học', 'Sinh học', 'Ngữ văn', 'Tiếng Anh', 'Lịch sử', 'Địa lí'];
 const ls=lessons(g, s);
 const coreRows = ls.filter(l => normalizePpctSection(l) !== 'elective_topic');
 const electiveRows = ls.filter(l => normalizePpctSection(l) === 'elective_topic');
 const assessmentRows = ls.filter(l => normalizePpctSection(l) === 'assessment');
 const compliance = validatePpctCompliance(g, s, ls);
 const isTHPT = Number(g) >= 10;
 const isTin = s.toLowerCase().includes('tin');

 const renderCoreRowHtml = l => {
   const f = ppctLessonFields(l);
   const notesHtml = f.notes.length ? f.notes.map(esc).join('<br>') : '<span class="muted">—</span>';
   const tagHtml = ppctSectionTagHtml(l);
   return `<tr><td class="ppct-col-week">${f.weeksHtml}</td><td class="ppct-col-lesson"><strong>${esc(l.lesson_code)}</strong> ${tagHtml} <strong>· ${esc(l.lesson_name_source || l.lesson_name || l.name)}</strong><p class="small muted">${esc(l.topic_source || '')}</p></td><td class="ppct-col-duration">${esc(f.duration)}</td><td class="ppct-col-ppct">${esc(f.ppct)}</td><td class="ppct-col-outcomes">${f.outcomes.length ? `<ul>${f.outcomes.map(o=>`<li>${esc(o)}</li>`).join('')}</ul>` : '<span class="muted">—</span>'}</td><td class="ppct-col-nls">${renderPpctListCell(f.competencies)}</td><td class="ppct-col-notes">${notesHtml}</td><td class="ppct-col-actions"><div class="actions"><button type="button" class="export-link" data-edit-ppct="${esc(l.lesson_code)}" data-grade="${g}">Sửa</button><button type="button" class="export-link danger" data-del-ppct="${esc(l.lesson_code)}" data-grade="${g}">Xóa</button></div></td></tr>`;
 };

 const renderElectiveRowHtml = (l, idx) => {
   const f = ppctLessonFields(l);
   const sttOrWeek = f.weeksHtml !== '—' ? f.weeksHtml : String(idx + 1);
   const notesHtml = f.notes.length ? f.notes.map(esc).join('<br>') : '<span class="muted">—</span>';
   const tagHtml = ppctSectionTagHtml(l);
   return `<tr><td class="ppct-col-week">${sttOrWeek}</td><td class="ppct-col-lesson"><strong>${esc(l.lesson_code)}</strong> ${tagHtml} <strong>· ${esc(l.lesson_name_source || l.lesson_name || l.name)}</strong><p class="small muted">${esc(l.topic_source || 'Chuyên đề học tập lựa chọn')}</p></td><td class="ppct-col-duration">${esc(f.duration)}</td><td class="ppct-col-outcomes">${f.outcomes.length ? `<ul>${f.outcomes.map(o=>`<li>${esc(o)}</li>`).join('')}</ul>` : '<span class="muted">—</span>'}</td><td class="ppct-col-nls">${renderPpctListCell(f.competencies)}</td><td class="ppct-col-notes">${notesHtml}</td><td class="ppct-col-actions"><div class="actions"><button type="button" class="export-link" data-edit-ppct="${esc(l.lesson_code)}" data-grade="${g}">Sửa</button><button type="button" class="export-link danger" data-del-ppct="${esc(l.lesson_code)}" data-grade="${g}">Xóa</button></div></td></tr>`;
 };

 const periodicSlots = [
   { code: 'KTGK1', title: 'Kiểm tra giữa học kì I', defaultWeek: 'Tuần 10' },
   { code: 'KTCK1', title: 'Kiểm tra cuối học kì I', defaultWeek: 'Tuần 16' },
   { code: 'KTGK2', title: 'Kiểm tra giữa học kì II', defaultWeek: 'Tuần 26' },
   { code: 'KTCK2', title: 'Kiểm tra cuối học kì II', defaultWeek: 'Tuần 31' }
 ];
 const defaultTestDuration = (isTin || (compliance.corePeriods > 0 && compliance.corePeriods <= 70))
   ? '45 phút'
   : (compliance.corePeriods > 70 ? '60–90 phút' : '45–90 phút (TT 22/2021 Điều 7.1)');
 const periodicRowsHtml = periodicSlots.map(slot => {
   const found = assessmentRows.find(x => String(x.lesson_code || '').toUpperCase() === slot.code);
   const f = found ? ppctLessonFields(found) : null;
   const timeAt = found
     ? `${f.weeksHtml !== '—' ? f.weeksHtml : slot.defaultWeek}${f.ppct && f.ppct !== '—' ? `<br><span class="small muted">Tiết PPCT: ${esc(f.ppct)}</span>` : ''}`
     : `<span class="muted">${esc(slot.defaultWeek)} (dự kiến)</span>`;
   const yccdHtml = (found && f.outcomes.length)
     ? `<ul>${f.outcomes.map(o => `<li>${esc(o)}</li>`).join('')}</ul>`
     : '<span class="muted">Đánh giá các YCCĐ tính đến thời điểm kiểm tra theo ma trận &amp; bản đặc tả (CV 7991/BGDĐT-GDTrH).</span>';
   const formText = (found && f.notes.length)
     ? f.notes.map(esc).join('<br>')
     : (isTHPT
       ? 'Viết / Thực hành trên máy (TNKQ + Đúng/Sai + Tự luận theo CV 7991)'
       : 'Viết / Thực hành trên máy (TNKQ + Tự luận theo TT 22/2021)');
   return `<tr><td><strong>${esc(found?.lesson_name_source || slot.title)}</strong></td><td class="ppct-col-duration">${esc(defaultTestDuration)}</td><td class="ppct-col-week">${timeAt}</td><td>${yccdHtml}</td><td>${formText}</td></tr>`;
 }).join('');

 const electiveCardHtml = (isTHPT || electiveRows.length > 0) ? `
 <div class="card">
   <div class="ppct-section-header">
     <div>
       <h2>Mục II.2 · Chuyên đề học tập lựa chọn ${compliance.orientations.length ? `<span class="ppct-tag ppct-tag-orient">Định hướng ${esc(compliance.orientations.join(', '))}</span>` : ''}</h2>
       <p class="small muted" style="margin:4px 0 0">Phụ lục I (Mục II.2) CV 5512 &amp; TT 32/2018 (35 tiết/cụm = 3 chuyên đề 10–10–15 tiết). Theo TT 22/2021: cụm CĐHT tính <strong>01 ĐĐGtx</strong> (Điều 6.3), <strong>không kiểm tra định kỳ</strong> (Điều 7.1).</p>
     </div>
     <div class="actions">
       <span class="badge">${electiveRows.length} chuyên đề · ${compliance.electivePeriods} tiết</span>
       <button type="button" class="primary" id="add-ppct-elective">+ Thêm chuyên đề THPT</button>
     </div>
   </div>
   <div class="table-wrap">
     <table class="ppct-table ppct-khdh-table ppct-elective-table">
       <thead><tr><th class="ppct-col-week">STT / Tuần</th><th class="ppct-col-lesson">Chuyên đề học tập</th><th class="ppct-col-duration">Số tiết</th><th class="ppct-col-outcomes">Yêu cầu cần đạt</th><th class="ppct-col-nls">Phát triển năng lực số &amp; AI</th><th class="ppct-col-notes">Ghi chú</th><th class="ppct-col-actions">Thao tác</th></tr></thead>
       <tbody>${electiveRows.length ? electiveRows.map(renderElectiveRowHtml).join('') : '<tr><td colspan="7" class="empty" style="text-align:center;padding:18px">Chưa có chuyên đề học tập lựa chọn cho Khối ' + esc(g) + '. Nếu trường dạy cụm Chuyên đề Tin học (Tin học ứng dụng ICT hoặc Khoa học máy tính CS), bấm "+ Thêm chuyên đề THPT" hoặc nhập tệp Word/JSON có Bảng Chuyên đề lựa chọn.</td></tr>'}</tbody>
     </table>
   </div>
 </div>` : '';

 const periodicCardHtml = `
 <div class="card">
   <div class="ppct-section-header">
     <div>
       <h2>Mục II.3 · Kiểm tra, đánh giá định kỳ (Phụ lục I CV 5512 &amp; TT 22/2021 Điều 7)</h2>
       <p class="small muted" style="margin:4px 0 0">Tổng hợp mốc kiểm tra định kỳ trong học kì. Không tổ chức kiểm tra định kỳ riêng đối với Cụm chuyên đề học tập (Điều 7.1 TT 22/2021) và Giáo dục AI (Mục VI.1 QĐ 2422).</p>
     </div>
     <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
       <span class="badge">${assessmentRows.length}/4 mốc đã nạp từ PPCT</span>
       <a href="#assessment-plans" class="button primary" style="font-size:12px;padding:5px 12px;background:#4A3AA8;border-color:#4A3AA8;color:#fff;font-weight:700">Quản lý KHKTĐG &amp; Liên kết Ma trận →</a>
     </div>
   </div>
   <div class="table-wrap">
     <table class="ppct-table ppct-periodic-table">
       <thead><tr><th>Bài kiểm tra, đánh giá</th><th class="ppct-col-duration">Thời gian</th><th class="ppct-col-week">Thời điểm</th><th>Yêu cầu cần đạt</th><th>Hình thức</th></tr></thead>
       <tbody>${periodicRowsHtml}</tbody>
     </table>
   </div>
 </div>`;

 const isGradeCleared = Boolean(
   (store.bank?.ppct?.cleared_grades || []).includes(g) ||
   (store.bank?.ppct?.cleared_grades || []).includes(`${s}:${g}`)
 );

 $('#ppct').innerHTML=title(`Chương trình môn ${s}`,'Phân phối chương trình',`Kế hoạch dạy học (Phụ lục I — CV 5512/BGDĐT-GDTrH, TT 32/2018, TT 22/2021, TT 02/2025 &amp; CV 3456 về Năng lực số, QĐ 2422 &amp; CV 5588 về Giáo dục AI) môn ${s} Khối ${g}.`,
   `<div style="display:flex;gap:8px;flex-wrap:wrap">` +
   (ls.length ? `<button type="button" class="button danger quiet" id="btn-clear-grade-ppct">Xóa PPCT Khối ${g}</button>` : '') +
   (!ls.length && isGradeCleared ? `<button type="button" class="button quiet" id="btn-restore-default-ppct" style="color:#4A3AA8;border-color:#4A3AA8;font-weight:700">Khôi phục PPCT mẫu GDPT 2018</button>` : '') +
   `<button type="button" class="primary" id="add-ppct-lesson">+ Thêm bài học PPCT</button></div>`)+
 `${ppctImportCard(g)}
 <div class="card">
   <div style="display:flex;gap:14px;margin-bottom:14px;flex-wrap:wrap">
     <div class="field" style="min-width:200px">
       <label for="ppct-subject" style="display:block;font-weight:600;margin-bottom:4px">Môn học</label>
       <select id="ppct-subject" ${store.context.curriculum_id?'disabled':''} style="width:100%;padding:8px">${allSubjects.map(sub=>opt(sub,sub,sub===s)).join('')}</select>
     </div>
     <div class="field" style="min-width:180px">
       <label for="ppct-grade" style="display:block;font-weight:600;margin-bottom:4px">Khối lớp</label>
       <select id="ppct-grade" style="width:100%;padding:8px">${gradeOptions(g)}</select>
     </div>
   </div>
   ${renderPpctComplianceBanner(compliance)}
   <div class="ppct-section-header" style="margin-top:14px">
     <h2>Mục II.1 · Phân phối chương trình cốt lõi</h2>
     <span class="badge">${coreRows.length} mục · ${compliance.corePeriods} tiết</span>
   </div>
   <div class="table-wrap">
     <table class="ppct-table ppct-khdh-table">
       <thead><tr><th class="ppct-col-week">Tuần</th><th class="ppct-col-lesson">Bài học</th><th class="ppct-col-duration">Số tiết</th><th class="ppct-col-ppct">PPCT</th><th class="ppct-col-outcomes">Yêu cầu cần đạt</th><th class="ppct-col-nls">Phát triển năng lực số &amp; AI</th><th class="ppct-col-notes">Ghi chú</th><th class="ppct-col-actions">Thao tác</th></tr></thead>
       <tbody>${coreRows.length ? coreRows.map(renderCoreRowHtml).join('') : '<tr><td colspan="8" class="empty" style="text-align:center;padding:24px">Chưa có bài học PPCT cho môn và khối này. Bấm "+ Thêm bài học PPCT" hoặc nhập tệp PPCT (JSON, Markdown, Word) ở khung phía trên.</td></tr>'}</tbody>
     </table>
   </div>
 </div>
 ${electiveCardHtml}
 ${periodicCardHtml}
 <div class="card"><h2>Hồ sơ nguồn</h2>${(store.bank.ppct?.sources||[]).filter(src=>Number(src.grade)===g && s==='Tin học').map(src=>`<p class="small">${esc(src.path||src.source_file||'')}</p><p class="muted">${esc(src.approval_status||'Đối chiếu bản KHDH trong thư mục chuyên môn.')}</p>`).join('') || `<p class="muted">Chưa có hồ sơ nguồn PPCT được tải lên cho môn ${esc(s)} Khối ${g}.</p>`}</div>`;
 $('#ppct-grade').onchange=e=>{setActiveGrade(Number(e.target.value));};
 $('#ppct-subject').onchange=e=>setGlobalSubject(e.target.value);
 $('#add-ppct-lesson').onclick=()=>openPPCTEditor(g,'',s,'core');
 const addElectiveBtn=$('#add-ppct-elective');
 if(addElectiveBtn)addElectiveBtn.onclick=()=>openPPCTEditor(g,'',s,'elective_topic');
 const clearGradeBtn=$('#btn-clear-grade-ppct');
 if(clearGradeBtn)clearGradeBtn.onclick=async()=>{
   if(!confirm(`Bạn có chắc chắn muốn xóa toàn bộ mục PPCT môn ${s} Khối ${g} (không dạy khối này)?\n\nDữ liệu PPCT Khối ${g} sẽ được làm trống hoàn toàn.`))return;
   if(store.bank?.ppct?.lessons){
     store.bank.ppct.lessons=store.bank.ppct.lessons.filter(l=>!(((l.subject_name||'Tin học')===s)&&Number(l.grade)===g));
   }
   store.bank.ppct = store.bank.ppct || { lessons: [], cleared_grades: [] };
   store.bank.ppct.cleared_grades = store.bank.ppct.cleared_grades || [];
   if (!store.bank.ppct.cleared_grades.includes(g)) store.bank.ppct.cleared_grades.push(g);
   if (!store.bank.ppct.cleared_grades.includes(`${s}:${g}`)) store.bank.ppct.cleared_grades.push(`${s}:${g}`);
   await mutate('/api/ppct/clear-grade',{grade:g,subject_name:s},()=>{
     render();
     notify(`Đã xóa hoàn toàn PPCT môn ${s} Khối ${g}. Khối này hiện để trống.`);
   });
 };
 const restoreDefaultBtn=$('#btn-restore-default-ppct');
 if(restoreDefaultBtn)restoreDefaultBtn.onclick=async()=>{
   if(!confirm(`Khôi phục lại phân phối chương trình mẫu GDPT 2018 cho môn ${s} Khối ${g}?`))return;
   if(store.bank?.ppct?.cleared_grades){
     store.bank.ppct.cleared_grades = store.bank.ppct.cleared_grades.filter(x => Number(x) !== g && x !== `${s}:${g}`);
   }
   await mutate('/api/ppct/restore-grade',{grade:g,subject_name:s},()=>{
     render();
     notify(`Đã khôi phục PPCT mẫu GDPT 2018 cho môn ${s} Khối ${g}.`);
   });
 };
 bindPpctImport(g);
}
// Nhập PPCT từ JSON, Markdown (.md) hoặc Word (Phụ lục I CV 5512: Bảng II.1 cốt lõi 7 cột + Bảng II.2 Chuyên đề THPT)
function parsePpctFromMarkdown(text, defaultGrade) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  const lessonsMap = new Map();
  let currentTopic = 'Chương trình GDPT';
  let currentOrientation = '';
  let currentSemester = 1;

  const splitCellItems = (raw, minLen = 2) => String(raw || '')
    .split(/(?:<br\s*\/?>|\n|\r)\s*(?:[-–*•+]\s*)?|\.\s*[-–*•+]\s*/)
    .map(o => o.replace(/<[^>]*>/g, '').trim().replace(/^[-–*•+]\s*/, '').trim())
    .filter(o => o.length >= minLen);

  const cleanTitle = (s) => String(s || '')
    .replace(/\s*\((?:tt|tiếp(?:\s*theo)?|t|tiết\s*\d+)\)?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const parseMdRowCells = (line) => line.trim().split('|').slice(1, -1).map(c => c.trim());

  let inAnyTable = false;
  let tableMode = 'core'; // 'core' | 'elective'
  let colMap = null;
  let sectionHeading = '';

  const buildColMap = (cells) => {
    const map = { stt: -1, week: -1, lesson: -1, duration: -1, ppct: -1, outcomes: -1, nls: -1, notes: -1, equipment: -1 };
    cells.forEach((h, idx) => {
      const low = h.toLowerCase();
      if (map.stt < 0 && /^(?:stt|tt|st)$/.test(low)) map.stt = idx;
      else if (map.ppct < 0 && /\bppct\b/i.test(low)) map.ppct = idx;
      else if (map.week < 0 && /(?:tuần|thời\s*điểm|week)/i.test(low)) map.week = idx;
      else if (map.duration < 0 && /(?:số\s*tiết|thời\s*lượng|duration|^tiết$)/i.test(low)) map.duration = idx;
      else if (map.outcomes < 0 && /(?:yêu\s*cầu\s*cần\s*đạt|yccđ|yccd|outcomes|mục\s*tiêu)/i.test(low)) map.outcomes = idx;
      else if (map.nls < 0 && /(?:năng\s*lực\s*số|nls|\bai\b)/i.test(low)) map.nls = idx;
      else if (map.equipment < 0 && /(?:thiết\s*bị|đồ\s*dùng\s*dạy\s*học)/i.test(low)) map.equipment = idx;
      else if (map.notes < 0 && /(?:ghi\s*chú|note)/i.test(low)) map.notes = idx;
      else if (map.lesson < 0 && /(?:chuyên\s*đề|bài\s*học|tên\s*bài|bài\s*dạy|nội\s*dung|lesson)/i.test(low)) map.lesson = idx;
    });
    return map;
  };

  const hasPipeTable = lines.some(l => { const t = l.trim(); return t.startsWith('|') && t.endsWith('|'); });
  if (hasPipeTable) {
    for (const rawLine of lines) {
      const t = rawLine.trim();
      if (!t) continue;
      if (!(t.startsWith('|') && t.endsWith('|'))) {
        inAnyTable = false;
        colMap = null;
        if (/^#{1,4}\s*/.test(t) || /chuyên\s*đề\s*(?:học\s*tập|lựa\s*chọn)/i.test(t)) {
          sectionHeading = t.replace(/^#{1,4}\s*/, '').trim();
          const hOrient = detectPpctOrientation(sectionHeading);
          if (hOrient) currentOrientation = hOrient;
          if (/chuyên\s*đề\s*(?:học\s*tập|lựa\s*chọn)/i.test(sectionHeading)) {
            currentTopic = sectionHeading;
          }
        }
        continue;
      }

      const cells = parseMdRowCells(t);
      if (!cells.length) continue;
      if (cells.every(c => !c || /^:?-+:?$/.test(c))) continue;

      const isElectiveHdr = cells.some(c => /(?:chuyên\s*đề|tên\s*bài\s*dạy)/i.test(c))
        && cells.some(c => /(?:số\s*tiết|thời\s*lượng)/i.test(c))
        && cells.some(c => /(?:yêu\s*cầu\s*cần\s*đạt|yccđ|yccd)/i.test(c))
        && !cells.some(c => /(?:tuần|week)/i.test(c));
      const isCoreHdr = cells.some(c => /(?:bài\s*học|tên\s*bài|bài\s*dạy)/i.test(c))
        && cells.some(c => /(?:tuần|yêu\s*cầu\s*cần\s*đạt|yccđ|ppct|số\s*tiết)/i.test(c));

      if (isElectiveHdr || isCoreHdr) {
        inAnyTable = true;
        tableMode = isElectiveHdr ? 'elective' : 'core';
        colMap = buildColMap(cells);
        if (tableMode === 'elective' && !/chuyên\s*đề/i.test(currentTopic)) {
          currentTopic = sectionHeading || 'Chuyên đề học tập lựa chọn';
        }
        continue;
      }

      const distinctNonEmpty = [...new Set(cells.filter(Boolean))];
      if (!distinctNonEmpty.length) continue;
      const mSem = distinctNonEmpty[0].match(/^\s*Học\s*k[ìỳ]\s*(I{1,2}|[12])\b/i);
      if (distinctNonEmpty.length <= 2 && mSem) {
        currentSemester = (mSem[1].toUpperCase() === 'II' || mSem[1] === '2') ? 2 : 1;
        continue;
      }
      if (distinctNonEmpty.length <= 2 && /chuyên\s*đề\s*(?:học\s*tập|lựa\s*chọn)/i.test(distinctNonEmpty[0])) {
        currentTopic = distinctNonEmpty[0];
        currentOrientation = detectPpctOrientation(currentTopic) || currentOrientation;
        continue;
      }
      if (distinctNonEmpty.length <= 2 && /^Chủ\s*đề/i.test(distinctNonEmpty[0])) {
        currentTopic = distinctNonEmpty[0];
        continue;
      }

      let stt = '', weekRaw = '', lessonRaw = '', durationRaw = '', ppctRaw = '', outcomesRaw = '', competenciesRaw = '', notesRaw = '';
      if (colMap && colMap.lesson >= 0) {
        stt = colMap.stt >= 0 ? (cells[colMap.stt] || '') : '';
        weekRaw = colMap.week >= 0 ? (cells[colMap.week] || '') : '';
        lessonRaw = cells[colMap.lesson] || '';
        durationRaw = colMap.duration >= 0 ? (cells[colMap.duration] || '') : '';
        ppctRaw = colMap.ppct >= 0 ? (cells[colMap.ppct] || '') : '';
        outcomesRaw = colMap.outcomes >= 0 ? (cells[colMap.outcomes] || '') : '';
        competenciesRaw = colMap.nls >= 0 ? (cells[colMap.nls] || '') : '';
        notesRaw = colMap.notes >= 0 ? (cells[colMap.notes] || '') : '';
        const equipRaw = colMap.equipment >= 0 ? (cells[colMap.equipment] || '').trim() : '';
        if (equipRaw) notesRaw = [notesRaw.trim(), 'Thiết bị: ' + equipRaw].filter(Boolean).join('; ');
      } else if (tableMode === 'elective' || (cells.length >= 4 && /^\d+$/.test(cells[0]) && /^Chuyên\s*đề/i.test(cells[1] || ''))) {
        stt = cells[0] || '';
        lessonRaw = cells[1] || '';
        durationRaw = cells[2] || '';
        outcomesRaw = cells[3] || '';
        competenciesRaw = cells[4] || '';
        notesRaw = cells[5] || '';
      } else if (cells.length >= 6) {
        weekRaw = cells[0] || '';
        lessonRaw = cells[1] || '';
        durationRaw = cells[2] || '';
        ppctRaw = cells[3] || '';
        outcomesRaw = cells[4] || '';
        competenciesRaw = cells[5] || '';
        notesRaw = cells[6] || '';
      } else if (cells.length >= 4) {
        if (/^\d+/.test(cells[0])) {
          weekRaw = cells[0];
          if (/^\d+/.test(cells[1]) && cells[2].length > cells[1].length) {
            ppctRaw = cells[1];
            lessonRaw = cells[2];
            outcomesRaw = cells[3] || '';
          } else {
            lessonRaw = cells[1];
            ppctRaw = cells[2];
            outcomesRaw = cells[3] || '';
          }
        } else {
          lessonRaw = cells[0];
          outcomesRaw = cells[1] || '';
        }
      } else if (cells.length >= 2) {
        lessonRaw = cells[0];
        outcomesRaw = cells[1];
      }
      if (!lessonRaw) continue;

      let lessonCode = '';
      let cleanName = '';
      let section = 'core';
      let orientation = '';
      let topicForRow = currentTopic;

      const mElective = lessonRaw.match(/^\s*Chuyên\s*đề\s*(\d+[a-zA-Z]?)\s*[-–.:]?\s*(.+)$/i);
      const mBai = lessonRaw.match(/^\s*(?:(?:Bài|Bải)|Chủ\s*đề\s*[0-9]+\s*[-–.:]\s*(?:Bài|Bải))\s*([0-9]+[a-zA-Z]?)\s*[-–.:]?\s*(.+)$/i);

      if (tableMode === 'elective' || mElective) {
        section = 'elective_topic';
        if (mElective) {
          lessonCode = 'CD' + mElective[1].toLowerCase();
          cleanName = cleanTitle(`Chuyên đề ${mElective[1]}: ${mElective[2]}`);
        } else if (stt && /^\d+[a-zA-Z]?$/.test(stt.trim())) {
          lessonCode = 'CD' + stt.trim().toLowerCase();
          cleanName = cleanTitle(lessonRaw);
        } else {
          const nextIdx = Array.from(lessonsMap.keys()).filter(k => /^CD\d/i.test(k)).length + 1;
          lessonCode = 'CD' + nextIdx;
          cleanName = cleanTitle(lessonRaw);
        }
        orientation = currentOrientation || detectPpctOrientation(currentTopic) || detectPpctOrientation(sectionHeading) || detectPpctOrientation(lessonRaw);
        topicForRow = (/chuyên\s*đề/i.test(currentTopic) ? currentTopic : '') || sectionHeading || 'Chuyên đề học tập lựa chọn';
      } else if (mBai) {
        section = 'core';
        lessonCode = 'B' + mBai[1];
        cleanName = lessonRaw.replace(/^(?:Bài|Bải|Chủ\s*đề)\s*[0-9]+[a-zA-Z]?[:.]?\s*/i, '').replace(/\s*\((?:tt|tiếp(?:\s*theo)?|t|tiết\s*\d+)\)?\s*$/i, '').trim() || cleanTitle(lessonRaw);
      } else if (/Kiểm\s*tra\b/i.test(lessonRaw)) {
        section = 'assessment';
        const lowL = lessonRaw.toLowerCase();
        let semNum = currentSemester;
        if (/(?:hk|học\s*k[ìỳ])\s*(?:ii|2)\b|\b(?:hk)?2\b/.test(lowL)) semNum = 2;
        else if (/(?:hk|học\s*k[ìỳ])\s*(?:i|1)\b|\b(?:hk)?1\b/.test(lowL)) semNum = 1;
        lessonCode = (lowL.includes('giữa') ? 'KTGK' : 'KTCK') + semNum;
        cleanName = cleanTitle(lessonRaw);
        topicForRow = 'Đánh giá định kỳ';
      } else if (/^(?:Ôn\s*tập|Luyện\s*tập)\b/i.test(lessonRaw)) {
        section = 'review';
        const isCont = /\s*\((?:tt|tiếp(?:\s*theo)?|t|tiết\s*\d+)\)?\s*$/i.test(lessonRaw);
        const prefix = /^Luyện\s*tập\b/i.test(lessonRaw) ? 'LT' : 'OT';
        const baseCode = `${prefix}_HK${currentSemester}`;
        if (lessonsMap.has(baseCode) && !isCont) {
          let suffix = 2;
          while (lessonsMap.has(`${baseCode}_${suffix}`)) suffix += 1;
          lessonCode = `${baseCode}_${suffix}`;
        } else {
          lessonCode = baseCode;
        }
        cleanName = cleanTitle(lessonRaw);
        topicForRow = currentTopic || 'Ôn tập, củng cố';
      } else {
        const mChude = lessonRaw.match(/^Chủ\s*đề\s*([0-9]+[a-zA-Z]?)[:.]?\s*(.+)$/i);
        if (mChude) {
          lessonCode = 'B' + mChude[1];
          cleanName = cleanTitle(mChude[2]) || cleanTitle(lessonRaw);
        } else {
          lessonCode = 'B' + (lessonsMap.size + 1);
          cleanName = cleanTitle(lessonRaw);
        }
      }

      let outcomes = splitCellItems(outcomesRaw, 4);
      if (!outcomes.length) {
        if (section === 'assessment') outcomes = ['Kiểm tra, đánh giá định kỳ theo ma trận và bản đặc tả.'];
        else if (section === 'review') outcomes = ['Hệ thống hóa, củng cố kiến thức và kĩ năng đã học.'];
      }
      const comps = splitCellItems(competenciesRaw, 2);
      const cleanNote = notesRaw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const periodsRaw = ppctRaw || durationRaw || '1';
      const occEntry = {
        semester: currentSemester,
        week_raw: weekRaw,
        duration_raw: durationRaw,
        ppct_raw: ppctRaw,
        periods_raw: periodsRaw,
        competencies_raw: competenciesRaw.replace(/<br\s*\/?>/gi, '\n'),
        notes_raw: cleanNote
      };

      if (lessonsMap.has(lessonCode)) {
        const ex = lessonsMap.get(lessonCode);
        ex.occurrences.push(occEntry);
        for (const o of outcomes) {
          if (!ex.outcomes.includes(o)) ex.outcomes.push(o);
        }
        for (const c of comps) {
          if (!ex.digital_competencies.includes(c)) ex.digital_competencies.push(c);
        }
        if (cleanNote) {
          const prevNotes = ex.notes ? ex.notes.split('; ').map(x => x.trim()).filter(Boolean) : [];
          if (!prevNotes.includes(cleanNote)) {
            prevNotes.push(cleanNote);
            ex.notes = prevNotes.join('; ');
          }
        }
        if (orientation && !ex.orientation) ex.orientation = orientation;
      } else {
        lessonsMap.set(lessonCode, {
          grade: Number(defaultGrade),
          lesson_code: lessonCode,
          lesson_name_source: cleanName,
          topic_source: topicForRow,
          section,
          orientation,
          occurrences: [occEntry],
          outcomes,
          digital_competencies: comps,
          notes: cleanNote
        });
      }
    }
  } else {
    const blocks = text.split(/\n(?=#{1,3}\s*|\*\*(?:Bài|Chuyên\s*đề))/i);
    for (const b of blocks) {
      const bTrim = b.trim();
      if (!bTrim) continue;
      const mElectiveHdr = bTrim.match(/^(?:#{1,3}\s*|\*\*)?Chuyên\s*đề\s*([0-9]+[a-zA-Z]?)[:.]?\s*([^\n*]+)/i);
      const mHeader = bTrim.match(/^(?:#{1,3}\s*|\*\*)?(?:(?:Bài|Bải)\s*([0-9]+[a-zA-Z]?)|KTGK1|KTCK1|KTGK2|KTCK2|Ôn tập)[:.]?\s*([^\n*]+)/i);
      if (!mElectiveHdr && !mHeader) continue;
      let lessonCode, cleanName, section, defaultTopic;
      if (mElectiveHdr) {
        lessonCode = 'CD' + mElectiveHdr[1];
        cleanName = `Chuyên đề ${mElectiveHdr[1]}: ${mElectiveHdr[2].trim().replace(/\*\*$/, '')}`;
        section = 'elective_topic';
        defaultTopic = 'Chuyên đề học tập lựa chọn';
      } else {
        const codeNum = mHeader[1];
        lessonCode = codeNum ? ('B' + codeNum) : (bTrim.includes('KTGK1') ? 'KTGK1' : bTrim.includes('KTCK1') ? 'KTCK1' : bTrim.includes('KTGK2') ? 'KTGK2' : bTrim.includes('KTCK2') ? 'KTCK2' : 'OT_HK1');
        cleanName = mHeader[2].trim().replace(/\*\*$/, '');
        section = normalizePpctSection('', lessonCode, cleanName, '');
        defaultTopic = 'Chương trình GDPT';
      }
      const mTopic = bTrim.match(/(?:Chủ đề|Topic)\s*[:=]\s*([^\n]+)/i);
      const topic = mTopic ? mTopic[1].trim() : defaultTopic;
      const mOrient = bTrim.match(/(?:Định hướng|Orientation)\s*[:=]\s*([^\n]+)/i);
      const orientation = detectPpctOrientation(mOrient ? mOrient[1] : topic) || (mOrient ? mOrient[1].trim() : '');
      const mWeek = bTrim.match(/(?:Tuần|Week)\s*[:=]\s*([^\n,]+)/i);
      const mDuration = bTrim.match(/(?:Số tiết|Duration)\s*[:=]\s*([^\n,]+)/i);
      const mPpct = bTrim.match(/(?:PPCT)\s*[:=]\s*([^\n,]+)/i);
      const mPeriods = bTrim.match(/(?:Tiết|Periods)\s*[:=]\s*([^\n]+)/i);
      const mNls = bTrim.match(/(?:Phát triển năng lực số(?:\s*&\s*AI)?|Năng lực số|NLS)\s*[:=]\s*([^\n]+)/i);
      const mNote = bTrim.match(/(?:Ghi chú|Notes?)\s*[:=]\s*([^\n]+)/i);
      const outcomeMatches = [...bTrim.matchAll(/(?:^|\n)\s*[-*]\s*(?:YCCĐ|Yêu cầu cần đạt)?[:.]?\s*([^\n]+)/gi)];
      const outcomes = outcomeMatches.map(m => m[1].trim()).filter(o => o.length > 5 && !/^(?:Mã bài|Chủ đề|Tuần|Số tiết|PPCT|Tiết|Định hướng|Năng lực số|Phát triển năng lực số|Ghi chú)/i.test(o));
      const durationRaw = mDuration ? mDuration[1].trim() : '';
      const ppctRaw = mPpct ? mPpct[1].trim() : (mPeriods ? mPeriods[1].trim() : '');
      const comps = mNls ? ppctNormalizeTextList(mNls[1]) : [];
      const noteStr = mNote ? mNote[1].trim() : '';

      lessonsMap.set(lessonCode, {
        grade: Number(defaultGrade),
        lesson_code: lessonCode,
        lesson_name_source: cleanName,
        topic_source: topic,
        section,
        orientation,
        occurrences: [{
          week_raw: mWeek ? mWeek[1].trim() : (section === 'elective_topic' ? '' : '1'),
          duration_raw: durationRaw,
          ppct_raw: ppctRaw,
          periods_raw: ppctRaw || durationRaw || '1',
          competencies_raw: comps.join('\n'),
          notes_raw: noteStr
        }],
        outcomes,
        digital_competencies: comps,
        notes: noteStr
      });
    }
  }
  return Array.from(lessonsMap.values());
}

function ppctImportCard(g){
 const imp=store.ppctImport, r=imp&&imp.report;
 const lessonsList=(r&&Array.isArray(r.lessons))?r.lessons:[];
 const sm=(r&&r.summary)?r.summary:{new:0,changed:0,unchanged:0,conflict:0};
 const gradesList=(r&&Array.isArray(r.grades))?r.grades:[g];
 const issuesList=(r&&Array.isArray(r.issues))?r.issues:[];
 const curSubject = r?.subject_name || store?.selectedSubject || store?.ppctSubject || 'Tin học';
 const previewGrade = Number(gradesList[0] || g || 9);
 const previewCompliance = r ? validatePpctCompliance(previewGrade, curSubject, lessonsList) : null;
 const corePreviewList = lessonsList.filter(x => normalizePpctSection(x) !== 'elective_topic');
 const electivePreviewList = lessonsList.filter(x => normalizePpctSection(x) === 'elective_topic');
 const isHighSchoolView = Number(g) >= 10 || previewGrade >= 10;

 const buildPreviewCells = (x) => {
   const f = ppctLessonFields(x);
   const outcomesHtml = f.outcomes.length
     ? `<ul>${f.outcomes.map(o => `<li>${esc(o)}</li>`).join('')}</ul>`
     : `<p style="margin:4px 0 0;color:#8A5A00">Chưa có yêu cầu cần đạt (YCCĐ).</p>`;
   const changes = Array.isArray(x.changes) ? x.changes : [];
   const changeByField = (fieldName) => changes.find(c => c.field === fieldName);

   const nameChange = changeByField('Tên bài');
   const topicChange = changeByField('Chủ đề');
   const lessonCellHtml = `Khối ${esc(x.grade)} · <strong>${esc(x.lesson_code)}</strong><br><strong>${esc(x.lesson_name || x.lesson_name_source)}</strong>`
     + (x.topic ? `<p class="small muted">${esc(x.topic)}</p>` : '')
     + (nameChange ? `<div class="small" style="margin-top:4px"><strong>Tên bài:</strong> ${esc(nameChange.old)} → ${esc(nameChange.new)}</div>` : '')
     + (topicChange ? `<div class="small" style="margin-top:2px"><strong>Chủ đề:</strong> ${esc(topicChange.old)} → ${esc(topicChange.new)}</div>` : '');

   let outcomeCellHtml = '';
   const outcomeChange = changeByField('Yêu cầu cần đạt');
   if (x.status === 'conflict') {
     outcomeCellHtml = `<div style="color:#C62828;font-weight:600">${esc(x.conflict?.reason || '')}</div>`
       + (Array.isArray(x.conflict?.outcomes) && x.conflict.outcomes.length
         ? `<ul style="color:#C62828">${x.conflict.outcomes.map(o => `<li>${esc(o)}</li>`).join('')}</ul>`
         : '')
       + (f.outcomes.length ? `<details style="margin-top:6px"><summary style="cursor:pointer;color:#4A3AA8;font-size:12px">Xem ${f.outcomes.length} YCCĐ trong tệp tải lên</summary>${outcomesHtml}</details>` : '');
   } else if (x.status === 'changed' && outcomeChange) {
     const oldArr = Array.isArray(outcomeChange.old) ? outcomeChange.old : [];
     const newArr = Array.isArray(outcomeChange.new) ? outcomeChange.new : [];
     outcomeCellHtml = `<div><strong>Thay đổi YCCĐ:</strong> ${oldArr.length} → ${newArr.length} YCCĐ<ul>`
       + newArr.filter(o => !oldArr.includes(o)).map(o => `<li style="color:#1F6B52">+ ${esc(o)}</li>`).join('')
       + oldArr.filter(o => !newArr.includes(o)).map(o => `<li style="color:#C62828">− ${esc(o)}</li>`).join('')
       + `</ul></div>`
       + (f.outcomes.length ? `<details style="margin-top:6px"><summary style="cursor:pointer;color:#4A3AA8;font-size:12px">Xem đủ ${f.outcomes.length} YCCĐ sau khi cập nhật</summary>${outcomesHtml}</details>` : '');
   } else {
     outcomeCellHtml = `<div class="muted" style="font-size:12px;margin-bottom:4px"><strong>${f.outcomes.length} YCCĐ</strong></div>${outcomesHtml}`;
   }

   const nlsChange = changeByField('Phát triển năng lực số & AI');
   let nlsCellHtml = renderPpctListCell(f.competencies);
   if (nlsChange && Array.isArray(nlsChange.new)) {
     const oldC = Array.isArray(nlsChange.old) ? nlsChange.old : [];
     nlsCellHtml += `<div class="small" style="margin-top:4px;color:#4A3AA8">Cập nhật: ${oldC.length} → ${nlsChange.new.length} mục</div>`;
   }

   const notesChange = changeByField('Ghi chú');
   let notesCellHtml = f.notes.length ? f.notes.map(esc).join('<br>') : '<span class="muted">—</span>';
   if (notesChange) {
     notesCellHtml += `<div class="small" style="margin-top:4px;color:#4A3AA8">${esc(notesChange.old || '(trống)')} → ${esc(notesChange.new || '(trống)')}</div>`;
   }

   return { f, lessonCellHtml, outcomeCellHtml, nlsCellHtml, notesCellHtml };
 };

 const coreRowsHtml = corePreviewList.map(x => {
   const c = buildPreviewCells(x);
   return `<tr><td class="ppct-col-week">${c.f.weeksHtml}</td><td class="ppct-col-lesson">${c.lessonCellHtml}</td><td class="ppct-col-duration">${esc(c.f.duration)}</td><td class="ppct-col-ppct">${esc(c.f.ppct)}</td><td class="ppct-col-outcomes">${c.outcomeCellHtml}</td><td class="ppct-col-nls">${c.nlsCellHtml}</td><td class="ppct-col-notes">${c.notesCellHtml}</td></tr>`;
 }).join('');

 const electiveRowsHtml = electivePreviewList.map((x, idx) => {
   const c = buildPreviewCells(x);
   const sttOrWeek = c.f.weeksHtml !== '—' ? c.f.weeksHtml : String(idx + 1);
   return `<tr><td class="ppct-col-week">${sttOrWeek}</td><td class="ppct-col-lesson">${c.lessonCellHtml}</td><td class="ppct-col-duration">${esc(c.f.duration)}</td><td class="ppct-col-outcomes">${c.outcomeCellHtml}</td><td class="ppct-col-nls">${c.nlsCellHtml}</td><td class="ppct-col-notes">${c.notesCellHtml}</td></tr>`;
 }).join('');

 const electivePreviewBlock = electivePreviewList.length
   ? `<div class="ppct-section-header" style="margin-top:16px"><h3>Mục II.2 · Chuyên đề học tập lựa chọn THPT (${electivePreviewList.length} chuyên đề · ${previewCompliance?.electivePeriods || 0} tiết${previewCompliance?.orientations?.length ? ' · ' + esc(previewCompliance.orientations.join(', ')) : ''})</h3></div><div class="table-wrap"><table class="ppct-table ppct-khdh-table ppct-elective-table"><thead><tr><th class="ppct-col-week">STT / Tuần</th><th class="ppct-col-lesson">Chuyên đề học tập</th><th class="ppct-col-duration">Số tiết</th><th class="ppct-col-outcomes">Yêu cầu cần đạt</th><th class="ppct-col-nls">Phát triển năng lực số &amp; AI</th><th class="ppct-col-notes">Ghi chú</th></tr></thead><tbody>${electiveRowsHtml}</tbody></table></div>`
   : '';

 return `<div class="card"><h2>Nhập PPCT từ Excel, JSON, Markdown hoặc Word</h2>
  <p class="muted">Khuyên dùng <strong>Excel (.xlsx / .csv)</strong> (phổ biến và thuận tiện nhất cho giáo viên mọi bộ môn) hoặc <strong>JSON / Markdown</strong> đủ <strong>7 cột chuẩn Phụ lục I (CV 5512, TT 02/2025 &amp; QĐ 2422)</strong>${isHighSchoolView ? ' kèm <strong>Bảng II.2 Chuyên đề lựa chọn THPT</strong> (TT 32/2018 &amp; TT 22/2021)' : ''} để nạp tức thì và bảo đảm chính xác 100%. Vẫn hỗ trợ tệp Word KHDH Phụ lục 1 (.docx). Khối lớp tự động nhận diện theo tên tệp hoặc theo Khối ${esc(g)} đang chọn.</p>
  <div style="background:#F3F4F8;border:1px solid #D6D1F2;border-radius:8px;padding:12px 16px;margin:12px 0;color:#1C2333;font-size:13px;line-height:1.6">
    <strong>Hướng dẫn thầy/cô dùng AI (Gemini / ChatGPT / Claude) chuyển Word sang Excel / JSON để tải lên:</strong>
    <ol style="margin:6px 0 0;padding-left:20px">
      <li>Bấm nút <strong>Chép Prompt AI chuyển Word → Excel/JSON</strong> bên dưới.</li>
      <li>Mở <strong>Gemini</strong> hoặc <strong>ChatGPT</strong>, dán câu lệnh (Prompt) vào khung chat rồi <strong>đính kèm tệp Word KHDH Phụ lục 1 (<code>.docx</code>)</strong> (hoặc copy bảng PPCT trong Word dán vào) và gửi.</li>
      <li>Sao chép bảng kết quả AI trả về dán vào Excel rồi lưu thành tệp <strong><code>.xlsx</code> / <code>.csv</code></strong> (hoặc lưu mã JSON thành tệp <code>.json</code>).</li>
      <li>Bấm <strong>Choose File</strong> bên dưới để chọn tệp vừa lưu → bấm <strong>Đọc và đối chiếu</strong> → kiểm tra bảng xem trước rồi bấm <strong>Xác nhận nhập</strong>.</li>
    </ol>
  </div>
  <div style="display:flex;gap:10px;margin:10px 0 14px;flex-wrap:wrap;align-items:center">
    <button type="button" class="button" id="ppct-download-excel-sample" style="background:#1F6B52;color:#fff;border-color:#1F6B52;padding:6px 12px;font-size:12px;font-weight:700">Tải mẫu PPCT (Excel)</button>
    <button type="button" class="button quiet" id="ppct-download-json-sample" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Tải mẫu PPCT (JSON)</button>
    <button type="button" class="button quiet" id="ppct-download-md-sample" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Tải mẫu PPCT (Markdown)</button>
    <button type="button" class="button quiet" id="ppct-copy-prompt" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Chép Prompt AI chuyển Word → Excel/JSON</button>
  </div>
  <div class="actions"><input type="file" id="ppct-import-file" accept=".xlsx,.xls,.csv,.tsv,.docx,.json,.md,.txt"><button type="button" class="button" id="ppct-import-inspect">Đọc và đối chiếu</button>
  ${r?`<button type="button" class="primary" id="ppct-import-apply" ${sm.new+sm.changed?'':'disabled'}>Xác nhận nhập (${sm.new+sm.changed} mục)</button><button type="button" class="quiet" id="ppct-import-cancel">Hủy</button>`:''}</div>
  ${r?`<p class="callout">Tệp ${esc(r.filename||'Đã nạp')} · Khối ${gradesList.map(esc).join(', ')} · Đọc được ${corePreviewList.length} mục cốt lõi${electivePreviewList.length ? ` và ${electivePreviewList.length} chuyên đề lựa chọn` : ''} (tổng ${lessonsList.length} mục). Hãy kiểm tra lại nội dung bên dưới trước khi bấm Xác nhận nhập.${sm.conflict ? ` Có ${sm.conflict} mục xung đột sẽ bị bỏ qua.` : ''}</p>
  ${renderPpctComplianceBanner(previewCompliance)}
  ${issuesList.length?`<ul class="mx-errors">${issuesList.map(i=>`<li>${esc(i.message||i)}</li>`).join('')}</ul>`:''}
  <div class="table-wrap"><table class="ppct-table ppct-khdh-table"><thead><tr><th class="ppct-col-week">Tuần</th><th class="ppct-col-lesson">Bài học</th><th class="ppct-col-duration">Số tiết</th><th class="ppct-col-ppct">PPCT</th><th class="ppct-col-outcomes">Yêu cầu cần đạt</th><th class="ppct-col-nls">Phát triển năng lực số &amp; AI</th><th class="ppct-col-notes">Ghi chú</th></tr></thead><tbody>${coreRowsHtml || '<tr><td colspan="7" class="empty" style="text-align:center;padding:16px">Không tìm thấy danh mục bài học PPCT trong tệp này. Nếu đây là tệp Đề thi / Ma trận, thầy/cô vui lòng dùng nút "AI Nhập đề" trên thanh trên cùng để nạp câu hỏi vào ngân hàng.</td></tr>'}</tbody></table></div>${electivePreviewBlock}`:""}
 </div>`;
}
function bindPpctImport(g){
 const read=async()=>{
   const file=$('#ppct-import-file')?.files?.[0];
   if(!file)throw new Error('Chọn tệp Excel (.xlsx, .csv), JSON, Markdown (.md) hoặc Word (.docx) trước.');

   // Nhận diện Khối lớp tự động từ tên tệp (ví dụ: TIN 9, KHOI 9, LOP 9, K9)
   let detectedGrade = Number(g || store.ppctGrade || 9);
   const fileGrade = (typeof TableFileHelper !== 'undefined') ? TableFileHelper.detectGradeFromFilename(file.name) : null;
   const mGrade = fileGrade ? [String(fileGrade), String(fileGrade)] : null;
   if (fileGrade) {
     if (fileGrade !== detectedGrade) notify(`Tên tệp ${file.name} ghi Khối ${fileGrade}, khác Khối ${detectedGrade} đang chọn. Ứng dụng đọc theo Khối ${fileGrade}; hãy kiểm tra lại trước khi bấm Xác nhận nhập.`, true);
     detectedGrade = fileGrade;
   }

   const ext = file.name.toLowerCase().split('.').pop();

   // Ưu tiên số 1: Excel (.xlsx, .csv, .tsv)
   if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'tsv') {
     if (typeof TableFileHelper !== 'undefined') {
       const res = await TableFileHelper.readTableFile(file);
       if (res.type === 'table') {
         const parsedLessons = TableFileHelper.parsePpctFromRows(res.rows, detectedGrade, subject());
         if (!parsedLessons.length) {
           throw new Error(`Không tìm thấy cấu trúc bảng PPCT 7 cột hợp lệ trong tệp ${file.name}. Bấm nút "Tải mẫu PPCT (Excel)" để xem mẫu chuẩn.`);
         }
         return { filename: file.name, grade: detectedGrade, subject_name: subject(), json: { lessons: parsedLessons } };
       }
     }
   }

   if(file.name.toLowerCase().endsWith('.json')) {
     return {filename:file.name,grade:detectedGrade,subject_name:subject(),json:JSON.parse(await file.text())};
   }

   if(file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.txt')) {
     const text = await file.text();
     const parsedLessons = parsePpctFromMarkdown(text, detectedGrade);
     if (!parsedLessons.length) {
       throw new Error(`Không tìm thấy cấu trúc bảng hoặc danh sách bài học Markdown hợp lệ trong tệp ${file.name}.`);
     }
     return {filename:file.name,grade:detectedGrade,subject_name:subject(),json:{lessons:parsedLessons}};
   }

   if(file.size>8*1024*1024)throw new Error('Tệp Word phải nhỏ hơn 8 MB.');

   let extractedText = '';
   let extractedHtml = '';
   if (typeof mammoth !== 'undefined' && file.name.toLowerCase().endsWith('.docx')) {
     try {
       const ab = await file.arrayBuffer();
       const resText = await mammoth.extractRawText({ arrayBuffer: ab });
       extractedText = resText.value || '';
       const resHtml = await mammoth.convertToHtml({ arrayBuffer: ab });
       extractedHtml = resHtml.value || '';
     } catch (e) {
       console.warn('Lỗi mammoth:', e);
     }
   }

   // Nếu tên tệp chưa có, kiểm tra trong nội dung văn bản
   if (!mGrade && extractedText) {
     const mTextGrade = extractedText.match(/(?:KHỐI\s*LỚP|KHỐI|LỚP)\s*(\d+)/i);
     if (mTextGrade && Number(mTextGrade[1]) >= 6 && Number(mTextGrade[1]) <= 12) detectedGrade = Number(mTextGrade[1]);
   }

   const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
   return {
     filename: file.name,
     content_base64: base64,
     extracted_text: extractedText,
     extracted_html: extractedHtml,
     grade: detectedGrade,
     subject_name: subject()
   };
 };
 const inspect=$('#ppct-import-inspect');
 if(inspect)inspect.onclick=async()=>{try{const payload=await read();const report=await request('/api/ppct/inspect-import',payload);store.ppctImport={payload,report};renderPPCT();}catch(err){notify(err.message,true);}};
 const apply=$('#ppct-import-apply');
 if(apply)apply.onclick=async()=>{
   const imp=store.ppctImport;
   try{
     const result=await request('/api/ppct/apply-import',{
       ...imp.payload,
       lessons: imp.report.lessons,
       expected_sha256: imp.report.sha256
     });
     if (result.bank && result.bank.ppct && Array.isArray(result.bank.ppct.lessons)) {
       result.bank.ppct.lessons = result.bank.ppct.lessons.map(l => ({ ...l, occurrences: safeLessonOccurrences(l.occurrences) }));
     }
     store.bank=result.bank;
     store.ppctImport=null;
     setActiveGrade(Number(imp.payload.grade || imp.report.grades?.[0] || effectiveGrade()), { skipRender: true });
     if (store.bank?.ppct?.cleared_grades) {
       store.bank.ppct.cleared_grades = store.bank.ppct.cleared_grades.filter(x => Number(x) !== store.ppctGrade && x !== `${subject()}:${store.ppctGrade}`);
     }
     renderPPCT();
     notify(`Đã nhập thành công PPCT Khối ${store.ppctGrade} (${imp.report.lessons.length} bài học)!`);
   }catch(err){
     notify(err.message,true);
   }
 };
 const cancel=$('#ppct-import-cancel');
 if(cancel)cancel.onclick=()=>{store.ppctImport=null;renderPPCT();};

 const dlExcel = $('#ppct-download-excel-sample');
 if (dlExcel) {
   dlExcel.onclick = () => {
     const curGrade = Number(g || store.ppctGrade || 9);
     if (typeof TableFileHelper !== 'undefined') {
       const rows = TableFileHelper.getSamplePpctRows(curGrade, subject());
       TableFileHelper.downloadCsv(rows, `Mau_PPCT_Excel_KHDH_${C.normalize(subject()).replace(/\s+/g, '_')}_${curGrade}_2026-2027.csv`);
     } else {
       notify('Bộ công cụ bảng tính đang nạp, vui lòng thử lại sau giây lát.', true);
     }
   };
 }

 const dlJson = $('#ppct-download-json-sample');
 if (dlJson) {
   dlJson.onclick = () => {
     const curGrade = Number(g || store.ppctGrade || 9);
     const nlsLvl = expectedNlsLevelForGrade(curGrade);
     const aiCode = `${curGrade}.A1.1`;
     const isThpt = curGrade >= 10;
     const sample = {
       grade: curGrade,
       subject_name: subject(),
       ...(isThpt ? { orientation: 'ICT' } : {}),
       lessons: [
         {
           grade: curGrade,
           section: "core",
           ...(isThpt ? { orientation: 'ICT' } : {}),
           lesson_code: "B1",
           lesson_name_source: "Thế giới kĩ thuật số",
           topic_source: "Chủ đề 1: Máy tính và cộng đồng",
           occurrences: [{ week_raw: "1", duration_raw: "2", ppct_raw: "1, 2", periods_raw: "1, 2" }],
           outcomes: [
             "Nhận biết được một số thiết bị số thông dụng.",
             "Nêu được ví dụ về thông tin trong môi trường số.",
             "Giải thích được ích lợi của việc sử dụng thiết bị số trong học tập và đời sống."
           ],
           digital_competencies: [
             `1.1.${nlsLvl}a: Nhận diện và khai thác thiết bị số thông dụng an toàn (TT 02/2025).`,
             `${aiCode}: Đánh giá tác động và giới hạn của công nghệ số và AI (QĐ 2422).`
           ],
           notes: "Khai thác học liệu trực quan"
         },
         {
           grade: curGrade,
           section: "core",
           ...(isThpt ? { orientation: 'ICT' } : {}),
           lesson_code: "B2",
           lesson_name_source: "Thông tin trong giải quyết vấn đề",
           topic_source: "Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin",
           occurrences: [{ week_raw: "2", duration_raw: "2", ppct_raw: "3, 4", periods_raw: "3, 4" }],
           outcomes: [
             "Sử dụng được các công cụ tìm kiếm nâng cao trên Internet.",
             "Đánh giá được độ tin cậy của thông tin tìm kiếm được."
           ],
           digital_competencies: [
             `1.2.${nlsLvl}b: Đánh giá độ tin cậy của nguồn tin và kết quả do AI gợi ý.`
           ],
           notes: "Thực hành phòng máy"
         },
         {
           grade: curGrade,
           section: "assessment",
           lesson_code: "KTGK1",
           lesson_name_source: "Kiểm tra giữa học kì 1",
           topic_source: "Đánh giá định kỳ",
           occurrences: [{ week_raw: "9", duration_raw: "1", ppct_raw: "18", periods_raw: "18" }],
           outcomes: [
             "Đánh giá năng lực học sinh nửa đầu học kì 1 theo ma trận và bảng đặc tả (TT 22/2021)."
           ],
           digital_competencies: [],
           notes: "Theo kế hoạch khảo thí"
         }
       ],
       ...(isThpt ? {
         elective_topics: [
           {
             grade: curGrade,
             section: "elective_topic",
             orientation: "ICT",
             lesson_code: "CD1",
             lesson_name_source: "Chuyên đề 1: Thực hành sử dụng phần mềm quản trị dự án",
             topic_source: "Chuyên đề lựa chọn",
             occurrences: [{ week_raw: "", duration_raw: "10", ppct_raw: "", periods_raw: "10" }],
             outcomes: [
               "Sử dụng được phần mềm lập kế hoạch, phân công nhiệm vụ và theo dõi tiến độ dự án."
             ],
             digital_competencies: [
               `2.2.${nlsLvl}a: Hợp tác nhóm trực tuyến qua công cụ quản trị dự án số.`
             ],
             notes: "Máy tính kết nối Internet (TT 32/2018 & TT 13/2022)"
           },
           {
             grade: curGrade,
             section: "elective_topic",
             orientation: "ICT",
             lesson_code: "CD2",
             lesson_name_source: "Chuyên đề 2: Thực hành bảo vệ dữ liệu và quản trị cơ sở dữ liệu",
             topic_source: "Chuyên đề lựa chọn",
             occurrences: [{ week_raw: "", duration_raw: "10", ppct_raw: "", periods_raw: "10" }],
             outcomes: [
               "Thực hiện được sao lưu, khôi phục và phân quyền an toàn dữ liệu trên hệ quản trị CSDL."
             ],
             digital_competencies: [
               `4.2.${nlsLvl}a: Bảo vệ dữ liệu cá nhân và phòng tránh rủi ro an toàn thông tin.`
             ],
             notes: "Thực hành phòng máy"
           },
           {
             grade: curGrade,
             section: "elective_topic",
             orientation: "ICT",
             lesson_code: "CD3",
             lesson_name_source: "Chuyên đề 3: Thực hành thiết kế sản phẩm số đa phương tiện",
             topic_source: "Chuyên đề lựa chọn",
             occurrences: [{ week_raw: "", duration_raw: "15", ppct_raw: "", periods_raw: "15" }],
             outcomes: [
               "Thiết kế và xuất bản được sản phẩm số hoàn chỉnh đáp ứng yêu cầu thực tiễn."
             ],
             digital_competencies: [
               `3.1.${nlsLvl}b: Sáng tạo nội dung số đa phương tiện có trách nhiệm bản quyền.`
             ],
             notes: "Tổng 35 tiết chuyên đề/năm"
           }
         ]
       } : {})
     };
     const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `mau_ppct_khoi_${curGrade}.json`;
     a.click();
     URL.revokeObjectURL(url);
     notify(`Đã tải xuống tệp mẫu mau_ppct_khoi_${curGrade}.json (bậc NLS ${nlsLvl}${isThpt ? ' + 3 Chuyên đề 35 tiết' : ''})!`);
   };
 }

 const dlMd = $('#ppct-download-md-sample');
 if (dlMd) {
   dlMd.onclick = () => {
     const curGrade = Number(g || store.ppctGrade || 9);
     const nlsLvl = expectedNlsLevelForGrade(curGrade);
     const aiCode = `${curGrade}.A1.1`;
     const isThpt = curGrade >= 10;
     const thptElectiveMd = isThpt
       ? `\n## II.2. Chuyên đề học tập lựa chọn (35 tiết/năm — TT 32/2018 & TT 13/2022)\n\n| Chuyên đề | Số tiết | Thiết bị dạy học | Yêu cầu cần đạt | Phát triển năng lực số & AI | Ghi chú |\n|---|:---:|---|---|---|---|\n| Chuyên đề 1: Thực hành sử dụng phần mềm quản trị dự án | 10 | Máy tính kết nối Internet | - Sử dụng được phần mềm lập kế hoạch và theo dõi tiến độ dự án. | - 2.2.${nlsLvl}a: Hợp tác nhóm qua công cụ quản trị dự án số. | Định hướng ICT |\n| Chuyên đề 2: Thực hành bảo vệ dữ liệu và quản trị cơ sở dữ liệu | 10 | Phòng máy thực hành | - Thực hiện được sao lưu, khôi phục và phân quyền an toàn dữ liệu. | - 4.2.${nlsLvl}a: Bảo vệ dữ liệu và an toàn thông tin. | Định hướng ICT |\n| Chuyên đề 3: Thực hành thiết kế sản phẩm số đa phương tiện | 15 | Máy tính, phần mềm đồ họa | - Thiết kế và xuất bản được sản phẩm số hoàn chỉnh. | - 3.1.${nlsLvl}b: Sáng tạo nội dung số tuân thủ bản quyền. | Tổng 35 tiết chuyên đề |\n`
       : '';
     const sampleMd = `# Kế hoạch dạy học & PPCT môn ${subject()} Khối ${curGrade} (CV 5512, TT 02/2025 & QĐ 2422)\n\n${isThpt ? '## II.1. Phần cốt lõi (Định hướng Tin học ứng dụng — ICT)\n\n' : ''}| Tuần | Bài học | Số tiết | PPCT | Yêu cầu cần đạt | Phát triển năng lực số & AI | Ghi chú |\n|:---:|---|:---:|:---:|---|---|---|\n| 1 | Bài 1: Thế giới kĩ thuật số | 2 | 1, 2 | - Nhận biết được một số thiết bị số thông dụng.<br>- Nêu được ví dụ về thông tin trong môi trường số.<br>- Giải thích được ích lợi của việc sử dụng thiết bị số trong học tập và đời sống. | - 1.1.${nlsLvl}a: Khai thác thiết bị số thông dụng (TT 02/2025).<br>- ${aiCode}: Đánh giá tác động của công nghệ số và AI (QĐ 2422). | Học liệu trực quan |\n| 2 | Bài 2: Thông tin trong giải quyết vấn đề | 2 | 3, 4 | - Sử dụng được các công cụ tìm kiếm nâng cao trên Internet.<br>- Đánh giá được độ tin cậy của thông tin tìm kiếm được. | - 1.2.${nlsLvl}b: Kiểm chứng độ tin cậy nguồn tin và nội dung AI tạo. | Thực hành phòng máy |\n| 9 | Kiểm tra giữa học kì 1 | 1 | 18 | - Đánh giá năng lực học sinh nửa đầu học kì 1 theo ma trận và bảng đặc tả (TT 22/2021). | | Theo lịch khảo thí |\n${thptElectiveMd}`;
     const blob = new Blob([sampleMd], { type: 'text/markdown;charset=utf-8' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `mau_ppct_khoi_${curGrade}.md`;
     a.click();
     URL.revokeObjectURL(url);
     notify(`Đã tải xuống tệp mẫu mau_ppct_khoi_${curGrade}.md!`);
   };
 }

 const copyPrompt = $('#ppct-copy-prompt');
 if (copyPrompt) {
   copyPrompt.onclick = async () => {
     const curGrade = Number(g || store.ppctGrade || 9);
     const nlsLvl = expectedNlsLevelForGrade(curGrade);
     const isThpt = curGrade >= 10;
     const levelRangeHint = curGrade <= 7 ? 'Khối 6–7: bậc TC1' : (curGrade <= 9 ? 'Khối 8–9: bậc TC2' : 'Khối 10–12: bậc NC1');
     const electiveInstruction = isThpt
       ? `\n3. Nếu tệp Word có bảng **Mục II.2. Chuyên đề học tập lựa chọn** (THPT theo TT 32/2018 & TT 13/2022, tổng 35 tiết/năm), hãy bóc tách riêng vào mảng "elective_topics" (mã "CD1", "CD2", "CD3", "section": "elective_topic", đúng "orientation": "ICT" hoặc "CS" theo tài liệu; nếu chưa chia tuần thì để "week_raw": "", "ppct_raw": "", "duration_raw": "<số tiết>").`
       : '';
     const electiveSchemaSnippet = isThpt
       ? `,\n  "elective_topics": [\n    {\n      "grade": ${curGrade},\n      "section": "elective_topic",\n      "orientation": "ICT",\n      "lesson_code": "CD1",\n      "lesson_name_source": "Chuyên đề 1: Tên chuyên đề lựa chọn",\n      "topic_source": "Chuyên đề lựa chọn",\n      "occurrences": [{ "week_raw": "", "duration_raw": "10", "ppct_raw": "", "periods_raw": "10" }],\n      "outcomes": ["Yêu cầu cần đạt chuyên đề 1"],\n      "digital_competencies": ["2.2.${nlsLvl}a: Nội dung NLS chuyên đề (mảng rỗng [] nếu trống)"],\n      "notes": "Thiết bị dạy học / Ghi chú chuyên đề"\n    }\n  ]`
       : '';
     const promptText = `Hãy đọc tệp Word Kế hoạch dạy học (KHDH Phụ lục I theo Công văn 5512/BGDĐT-GDTrH, Thông tư 32/2018/TT-BGDĐT${isThpt ? ' & TT 13/2022/TT-BGDĐT' : ''}, Thông tư 22/2021/TT-BGDĐT, Thông tư 02/2025/TT-BGDĐT về Năng lực số [${levelRangeHint}] và Quyết định 2422/QĐ-BGDĐT về Giáo dục AI [${curGrade}.A1.x]) đính kèm hoặc bảng nội dung môn ${subject()} Khối ${curGrade} dưới đây và chuyển đổi sang định dạng JSON chuẩn UTF-8 cho hệ thống ExamMatrix Studio.

Yêu cầu bắt buộc:
1. Bóc tách ĐỦ 100% số bài học phần cốt lõi (Mục II.1) và ĐỦ cả 7 cột chuẩn KHDH Phụ lục I: Tuần | Bài học | Số tiết | PPCT | Yêu cầu cần đạt | Phát triển năng lực số & AI | Ghi chú. Riêng tiết Ôn tập đặt mã "OT_HK1", "OT_HK2" với "section": "review"; tiết Kiểm tra định kỳ đặt mã "KTGK1", "KTCK1", "KTGK2", "KTCK2" với "section": "assessment".
2. Giữ nguyên văn từng Yêu cầu cần đạt (outcomes) và từng nội dung Phát triển năng lực số & AI (digital_competencies, giữ nguyên mã bậc ${nlsLvl} và mã AI ${curGrade}.A1.x nếu có), không tóm tắt hay bỏ sót ý nào. Nếu một bài dạy qua nhiều tuần/tiết (dòng "(tt)"), giữ đủ các tuần/tiết trong mảng occurrences.${electiveInstruction}
${isThpt ? '4' : '3'}. Ghi đúng schema JSON sau:
{
  "grade": ${curGrade},
  "subject_name": "${subject()}",${isThpt ? '\n  "orientation": "ICT",' : ''}
  "lessons": [
    {
      "grade": ${curGrade},
      "section": "core",${isThpt ? '\n      "orientation": "ICT",' : ''}
      "lesson_code": "B1",
      "lesson_name_source": "Tên bài học",
      "topic_source": "Tên chủ đề",
      "occurrences": [
        {
          "week_raw": "1",
          "duration_raw": "2",
          "ppct_raw": "1, 2",
          "periods_raw": "1, 2"
        }
      ],
      "outcomes": [
        "Yêu cầu cần đạt 1",
        "Yêu cầu cần đạt 2"
      ],
      "digital_competencies": [
        "1.1.${nlsLvl}a: Nội dung phát triển năng lực số & AI (mảng rỗng [] nếu cột này trống)"
      ],
      "notes": "Ghi chú của bài (chuỗi rỗng \"\" nếu không có)"
    }
  ]${electiveSchemaSnippet}
}
${isThpt ? '5' : '4'}. Chỉ xuất ra DUY NHẤT một khối mã JSON hợp lệ, không kèm lời giải thích ngoài khối JSON. Nếu công cụ có hỗ trợ tạo tệp tải về, hãy xuất giúp tôi thành tệp tên ppct_khoi_${curGrade}.json.

(Nếu không đính kèm tệp .docx, hãy dán bảng KHDH vào bên dưới dòng này):`;
     try {
       await navigator.clipboard.writeText(promptText);
       notify(`Đã sao chép Prompt AI chuyển Word → JSON chuẩn KHDH Khối ${curGrade} (NLS ${nlsLvl}${isThpt ? ' + CĐHT THPT' : ''})!`);
     } catch (e) {
       notify('Không thể sao chép tự động: ' + e.message, true);
     }
   };
 }
}
function openPPCTEditor(grade,code='',subj='',defaultSection=''){
 const curGrade = Number(grade || store.ppctGrade || 9);
 const s = subj || store.ppctSubject || 'Tin học';
 const nextCdForGrade = gNum => {
  let maxCd = 0;
  for (const x of lessons(gNum, s)) {
   const m = /^(?:CD|CĐ)(\d+)$/i.exec(String(x.lesson_code || '').trim());
   if (m) maxCd = Math.max(maxCd, Number(m[1]));
  }
  return `CD${maxCd + 1}`;
 };
 const existing=code?lessons(curGrade, s).find(l=>l.lesson_code===code):null;
 const inferredSection = existing?.section || defaultSection || (/^(?:CD|CĐ)\d/i.test(existing?.lesson_code || '') ? 'elective_topic' : (/^(?:OT|LT)/i.test(existing?.lesson_code || '') ? 'review' : (/^KT/i.test(existing?.lesson_code || '') ? 'assessment' : 'core')));
 const curSection = normalizePpctSection(curGrade < 10 && inferredSection === 'elective_topic' ? 'core' : inferredSection);
 const isElectiveInit = curSection === 'elective_topic';
 const curOrientation = existing?.orientation || detectPpctOrientation(existing?.topic_source || '', s) || (curGrade >= 10 && isElectiveInit ? 'ICT' : '');
 const fields=existing?ppctLessonFields(existing):{weeks:isElectiveInit?[]:['Tuần 1'],duration:isElectiveInit?'10':'2',ppct:isElectiveInit?'':'1, 2',outcomes:[],competencies:[],notesText:''};
 const occ=(existing?.occurrences||[])[0]||{};
 const weekVal=isElectiveInit?(fields.weeks.length?fields.weeks.join(', '):(occ.week_raw||'')):(fields.weeks.length?fields.weeks.join(', '):(occ.week_raw||'Tuần 1'));
 const durationVal=fields.duration!=='—'?fields.duration:(occ.duration_raw||(isElectiveInit?'10':'1'));
 const ppctVal=isElectiveInit?(fields.ppct!=='—'?fields.ppct:(occ.ppct_raw||occ.periods_raw||'')):(fields.ppct!=='—'?fields.ppct:(occ.ppct_raw||occ.periods_raw||'1'));
 const initialCode = existing ? existing.lesson_code : (isElectiveInit ? nextCdForGrade(curGrade) : '');
 const initialTopic = existing?.topic_source || (isElectiveInit ? 'Chuyên đề lựa chọn' : '');
 $('#edit-title').textContent=existing?`Sửa bài học PPCT · ${existing.lesson_code}`:(isElectiveInit?'Thêm chuyên đề lựa chọn THPT':'Thêm bài học vào PPCT');
 $('#question-form').innerHTML=`<div id="form-error" class="callout error" role="alert" hidden></div><div class="form-grid"><div class="field"><label for="ppct-edit-grade">Khối lớp</label><select id="ppct-edit-grade" name="grade"${existing?' disabled':''}>${gradeOptions(curGrade)}</select></div><div class="field"><label for="ppct-edit-section">Phân mục PPCT (CV 5512)</label><select id="ppct-edit-section" name="section"><option value="core"${curSection==='core'?' selected':''}>Phần cốt lõi (Mục II.1)</option><option value="elective_topic"${curSection==='elective_topic'?' selected':''}${curGrade<10?' disabled':''}>Chuyên đề lựa chọn THPT (Mục II.2)</option><option value="review"${curSection==='review'?' selected':''}>Ôn tập học kì</option><option value="assessment"${curSection==='assessment'?' selected':''}>Kiểm tra định kì (GK/CK)</option></select></div><div class="field"><label for="ppct-edit-orientation">Định hướng THPT (TT 32/2018)</label><select id="ppct-edit-orientation" name="orientation"${curGrade<10?' disabled':''}><option value=""${curOrientation===''?' selected':''}>Chung / Chưa phân định hướng</option><option value="ICT"${curOrientation==='ICT'?' selected':''}>ICT — Tin học ứng dụng</option><option value="CS"${curOrientation==='CS'?' selected':''}>CS — Khoa học máy tính</option></select></div><div class="field"><label for="ppct-edit-code">Mã bài / Chuyên đề (B1, CD1, KTGK1...)</label><input id="ppct-edit-code" name="lesson_code" value="${esc(initialCode)}" ${existing?'readonly':''} required></div><div class="field"><label for="ppct-edit-week">Tuần <span class="small muted" id="ppct-week-hint">${isElectiveInit?'(Không bắt buộc với CĐHT)':''}</span></label><input id="ppct-edit-week" name="week_raw" value="${esc(weekVal)}" placeholder="${isElectiveInit?'Để trống nếu chưa chia tuần':''}"${isElectiveInit?'':' required'}></div><div class="field"><label for="ppct-edit-duration">Số tiết</label><input id="ppct-edit-duration" name="duration_raw" value="${esc(durationVal)}" required></div><div class="field"><label for="ppct-edit-ppct">PPCT <span class="small muted" id="ppct-ppct-hint">${isElectiveInit?'(Không bắt buộc với CĐHT)':''}</span></label><input id="ppct-edit-ppct" name="ppct_raw" value="${esc(ppctVal)}" placeholder="${isElectiveInit?'Để trống nếu chưa đánh tiết PPCT':''}"${isElectiveInit?'':' required'}></div><div class="field"><label for="ppct-edit-topic">Chủ đề</label><input id="ppct-edit-topic" name="topic_source" value="${esc(initialTopic)}" required></div><div class="field full"><label for="ppct-edit-name">Bài học / Tên chuyên đề</label><input id="ppct-edit-name" name="lesson_name_source" value="${esc(existing?.lesson_name_source||'')}" required></div><div class="field full"><label for="ppct-edit-outcomes">Yêu cầu cần đạt (mỗi dòng 1 yêu cầu)</label><textarea id="ppct-edit-outcomes" name="outcomes" rows="5" required>${esc((existing?.outcomes||[]).join('\n'))}</textarea></div><div class="field full"><label for="ppct-edit-nls">Phát triển năng lực số &amp; AI (mỗi dòng 1 nội dung — TT 02/2025 &amp; QĐ 2422)</label><textarea id="ppct-edit-nls" name="digital_competencies" rows="3">${esc(fields.competencies.join('\n'))}</textarea></div><div class="field full"><label for="ppct-edit-notes">Ghi chú / Thiết bị dạy học</label><textarea id="ppct-edit-notes" name="notes" rows="2">${esc(fields.notesText)}</textarea></div><div class="field"><label for="ppct-edit-prereq">Bài tiền đề (mã bài cần học trước, cách nhau dấu phẩy; không bắt buộc)</label><input id="ppct-edit-prereq" name="prerequisites" type="text" placeholder="VD: B1, B2" value="${esc((existing?.prerequisites||[]).join(', '))}"><p class="muted small">Dùng cho Bản đồ tri thức: sắp thứ tự ôn tập và cảnh báo câu thuộc bài chưa học.</p></div></div><div class="dialog-bottom"><button type="button" data-close="edit-dialog">Hủy</button><button type="submit" class="primary">Lưu bài học PPCT</button></div>`;
 const gradeEl = $('#ppct-edit-grade');
 const sectionEl = $('#ppct-edit-section');
 const orientationEl = $('#ppct-edit-orientation');
 const codeEl = $('#ppct-edit-code');
 const weekEl = $('#ppct-edit-week');
 const durationEl = $('#ppct-edit-duration');
 const ppctEl = $('#ppct-edit-ppct');
 const topicEl = $('#ppct-edit-topic');
 const weekHintEl = $('#ppct-week-hint');
 const ppctHintEl = $('#ppct-ppct-hint');
 const syncPpctEditorMode = () => {
  const gNow = Number(existing ? curGrade : (gradeEl?.value || curGrade));
  const isThptNow = gNow >= 10;
  const electiveOpt = sectionEl?.querySelector('option[value="elective_topic"]');
  if (electiveOpt) electiveOpt.disabled = !isThptNow;
  if (!isThptNow && sectionEl?.value === 'elective_topic') sectionEl.value = 'core';
  if (orientationEl) {
   orientationEl.disabled = !isThptNow;
   if (!isThptNow) orientationEl.value = '';
  }
  const secNow = normalizePpctSection(sectionEl?.value || 'core');
  const isEl = secNow === 'elective_topic';
  if (weekEl) {
   weekEl.required = !isEl;
   weekEl.placeholder = isEl ? 'Để trống nếu chưa chia tuần' : '';
  }
  if (ppctEl) {
   ppctEl.required = !isEl;
   ppctEl.placeholder = isEl ? 'Để trống nếu chưa đánh tiết PPCT' : '';
  }
  if (weekHintEl) weekHintEl.textContent = isEl ? '(Không bắt buộc với CĐHT)' : '';
  if (ppctHintEl) ppctHintEl.textContent = isEl ? '(Không bắt buộc với CĐHT)' : '';
  if (!existing) {
   if (isEl) {
    if (codeEl && (!codeEl.value.trim() || /^CD\d+$/i.test(codeEl.value.trim()))) codeEl.value = nextCdForGrade(gNow);
    if (topicEl && !topicEl.value.trim()) topicEl.value = 'Chuyên đề lựa chọn';
    if (weekEl && weekEl.value.trim() === 'Tuần 1') weekEl.value = '';
    if (ppctEl && ppctEl.value.trim() === '1, 2') ppctEl.value = '';
    if (durationEl && durationEl.value.trim() === '2') durationEl.value = '10';
    if (orientationEl && !orientationEl.value) orientationEl.value = 'ICT';
   } else {
    if (codeEl && /^CD\d+$/i.test(codeEl.value.trim())) codeEl.value = '';
    if (topicEl && topicEl.value.trim() === 'Chuyên đề lựa chọn') topicEl.value = '';
    if (weekEl && !weekEl.value.trim()) weekEl.value = 'Tuần 1';
    if (ppctEl && !ppctEl.value.trim()) ppctEl.value = '1, 2';
    if (durationEl && durationEl.value.trim() === '10') durationEl.value = '2';
   }
  }
 };
 gradeEl?.addEventListener('change', syncPpctEditorMode);
 sectionEl?.addEventListener('change', syncPpctEditorMode);
 $('#question-form').onsubmit=async ev=>{
  ev.preventDefault();
  const f=new FormData(ev.target);
  const gVal=Number(existing?curGrade:f.get('grade'));
  const secVal=normalizePpctSection(f.get('section')||'core');
  const oriVal=gVal>=10?String(f.get('orientation')||'').trim():'';
  const weekRaw=String(f.get('week_raw')||'').trim();
  const durationRaw=String(f.get('duration_raw')||'').trim();
  const ppctRaw=String(f.get('ppct_raw')||'').trim();
  const payload={
   grade:gVal,
   subject_name:s,
   section:secVal,
   orientation:oriVal,
   lesson_code:(existing?existing.lesson_code:String(f.get('lesson_code')||'')).trim(),
   lesson_name_source:String(f.get('lesson_name_source')||'').trim(),
   topic_source:String(f.get('topic_source')||'').trim(),
   week_raw:weekRaw,
   duration_raw:durationRaw,
   ppct_raw:ppctRaw,
   periods_raw:ppctRaw || durationRaw || (secVal==='elective_topic'?'10':'1'),
   outcomes:String(f.get('outcomes')||'').split('\n').map(x=>x.trim()).filter(Boolean),
   digital_competencies:String(f.get('digital_competencies')||'').split('\n').map(x=>x.trim()).filter(Boolean),
   notes:String(f.get('notes')||'').trim(),
   prerequisites:String(f.get('prerequisites')||'').split(/[,;\n]/).map(x=>x.trim()).filter(Boolean)
  };
  await mutate('/api/ppct/save-lesson',{lesson:payload},()=>{
   $('#edit-dialog').close();renderPPCT();notify(`Đã lưu đầy đủ thông tin ${secVal==='elective_topic'?'chuyên đề lựa chọn':'bài học'} vào PPCT.`);
  });
 };
 $('#edit-dialog').showModal();
}
async function deletePPCTLesson(grade,code){
 if(!confirm(`Xóa bài ${code} (Khối ${grade}) khỏi Phân phối chương trình?`))return;
 await mutate('/api/ppct/delete-lesson',{grade:Number(grade),lesson_code:code},()=>{
  renderPPCT();notify(`Đã xóa bài ${code} khỏi PPCT.`);
 });
}
function fileToBase64(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>{const res=String(reader.result||'');resolve(res.includes(',')?res.split(',')[1]:res);};
  reader.onerror=()=>reject(new Error('Không đọc được tệp.'));
  reader.readAsDataURL(file);
 });
}
function revisionLinks(r){
 const base='/api/revisions/'+encodeURIComponent(r.id)+'/export';
 const isPub=r.status==='published';
 const isLock=r.status==='locked';
 const statusBadge=isPub?'<span class="badge approved">Đã phát hành</span>':(isLock?'<span class="badge">Đã khóa</span>':'<span class="badge draft">Đang soạn</span>');
 const pubBtn=!isPub?`<button type="button" class="export-link${isLock?' primary':''}" data-rev-act="publish" data-rev-id="${esc(r.id)}" title="Phát hành đề cương cho học sinh sau khi bộ đề căn cứ đã khóa">Phát hành đề cương</button>`:'';
 return `<div class="card-actions">`+
  statusBadge+
  `<button type="button" class="export-link primary" data-view-revision="${esc(r.id)}">Xem toàn bộ đề cương</button>`+
  `<button type="button" class="button" data-open-custom-rev-export="${esc(r.id)}" style="background:#4A3AA8;color:#fff;border-color:#4A3AA8;font-weight:700">Tùy biến xuất đề cương</button>`+
  pubBtn+
  `<details class="dropdown-menu"><summary>Tải về ▾</summary><div class="dropdown-content">`+
   `<a href="${base}?format=docx">Word đề cương</a>`+
   `<a href="${base}?format=docx&answers=1">Word kèm đáp án</a>`+
   `<a href="${base}?format=pdf&answers=0">PDF đề cương</a>`+
   `<a href="${base}?format=tex&answers=0">LaTeX đề cương (.tex)</a>`+
   `<a href="${base}?format=docx&target=lms">Tệp upload LMS (.docx)</a>`+
   `<a href="${base}?format=html" target="_blank" rel="noopener">Mở bản in</a>`+
  `</div></details>`+
  `<details class="dropdown-menu"><summary>Thao tác ▾</summary><div class="dropdown-content">`+
   `<button type="button" data-view-revision="${esc(r.id)}" data-answers="1">Xem kèm đáp án & HDC</button>`+
   `<button type="button" data-use-revision="${esc(r.id)}">Dùng tạo đề kiểm tra</button>`+
   `<button type="button" data-edit-revision="${esc(r.id)}">Sửa đề cương</button>`+
   `<button type="button" data-dup-revision="${esc(r.id)}">Nhân bản</button>`+
   `<hr>`+
   `<button type="button" class="danger" data-del-revision="${esc(r.id)}">Xóa đề cương</button>`+
  `</div></details>`+
 `</div>`;
}
function revisionMatrixSources(g){const d=store.examDraft,list=[];usableMatrices(g).forEach(m=>list.push({id:'mx:'+m.id,label:`Ma trận & đặc tả · ${m.title} · V${m.version}`,payload:{grade:g,exam_type:m.exam_type,matrix_id:m.id}}));store.templates.filter(t=>Number(t.grade)===Number(g)&&!t.unsupported).forEach(t=>list.push({id:t.id,label:`Mẫu ma trận · ${t.title||t.id} · ${periodNames[t.exam_type]||t.exam_type}`,payload:{grade:g,exam_type:t.exam_type,template_id:t.id,blueprint:t.rows||[]}}));if(Number(d.grade)===Number(g)&&!d.template_id&&!d.matrix_id&&d.blueprint?.length&&C.blueprintSummary(d.blueprint).points===10)list.push({id:'draft',label:'Phân bố đang thiết lập ở màn hình Tạo đề',payload:{grade:g,exam_type:d.exam_type,blueprint:d.blueprint}});list.push({id:'bank',label:`Toàn bộ ngân hàng Khối ${g} (chưa cần ma trận · chia theo bài và mức độ)`,payload:{grade:g,subject_name:subject(),from_bank:true}});return list;}

function lessonPickerTable(cells, prefix, countsState) {
  if (!cells || !cells.length) return '';
  const hasYn = cells.some(c => c.type === 'YN');
  const hasShort = cells.some(c => c.type === 'SHORT');
  const lessonsMap = {};
  cells.forEach(c => {
    if (!lessonsMap[c.lesson_code]) {
      lessonsMap[c.lesson_code] = {
        lesson_code: c.lesson_code,
        MC: { need: 0, avail: 0 },
        YN: { need: 0, avail: 0 },
        SHORT: { need: 0, avail: 0 },
        ES: { need: 0, avail: 0 }
      };
    }
    const bucket = lessonsMap[c.lesson_code][c.type];
    if (bucket) {
      bucket.need += Number(c.need || 0);
      bucket.avail += Number(c.available || 0);
    }
  });
  const activeTypes = ['MC', ...(hasYn ? ['YN'] : []), ...(hasShort ? ['SHORT'] : []), 'ES'];
  const typeHeaders = {
    MC: 'Số câu Trắc nghiệm',
    YN: 'Số câu Đúng/Sai',
    SHORT: 'Số câu Trả lời ngắn',
    ES: 'Số câu Tự luận'
  };
  const rows = Object.values(lessonsMap).map(l => {
    const cols = activeTypes.map(t => {
      const info = l[t];
      const val = countsState[l.lesson_code]?.[t] ?? '';
      return `<td>${info.need ? `<input type="number" class="small-input" min="0" max="${info.avail}" step="1" placeholder="cần ${info.need}" data-${prefix}-lesson-${t.toLowerCase()}="${esc(l.lesson_code)}" value="${esc(val)}"> <span class="small muted">/ có ${info.avail}</span>` : '<span class="muted">—</span>'}</td>`;
    }).join('');
    return `<tr><td><strong>${esc(l.lesson_code)}</strong></td>${cols}</tr>`;
  }).join('');

  return `<details class="lesson-count-details" style="margin: 0.75rem 0; padding: 0.5rem; background: var(--bg-subtle, #F7F8FB); border: 1px solid var(--border, #E4E7F0); border-radius: 4px;">
    <summary style="font-weight: 600; cursor: pointer; color: var(--accent, #4A3AA8);">Tự chọn số câu theo từng bài & dạng câu</summary>
    <div style="margin-top: 0.5rem;">
      <table class="plan-table" style="font-size: 0.85rem; width: 100%;">
        <thead><tr><th>Bài học</th>${activeTypes.map(t => `<th>${typeHeaders[t]}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="actions" style="margin-top: 0.5rem;">
        <button type="button" id="${prefix}-apply-lesson-split" class="button">Áp dụng số câu theo bài vào ma trận</button>
      </div>
    </div>
  </details>`;
}

function bindLessonPickerInputs(prefix, targetObj) {
  ['MC', 'YN', 'SHORT', 'ES'].forEach(t => {
    const low = t.toLowerCase();
    const attr = `data-${prefix}-lesson-${low}`;
    document.querySelectorAll(`[${attr}]`).forEach(inp => {
      inp.onchange = () => {
        const code = inp.getAttribute(attr);
        targetObj[code] = targetObj[code] || {};
        targetObj[code][t] = inp.value === '' ? '' : Math.max(0, Math.floor(Number(inp.value) || 0));
      };
    });
  });
}

function revAvailByType(g,cells,tp,flex){
 const targetCells=cells.filter(c=>String(c.type||'').toUpperCase()===tp);
 if(!targetCells.length)return 0;
 const seen=new Set();let total=0;
 questions().forEach(q=>{
  if(!q||q.review_status==='archived'||!String(q.question||'').trim()||Number(q.grade)!==Number(g))return;
  if(String(q.type||'').trim().toUpperCase()!==tp)return;
  if(!flex&&q.review_status!=='approved')return;
  const matches=targetCells.some(c=>flex
   ?(examNormLesson(q.lesson_code)===examNormLesson(c.lesson_code)&&examNormLevel(q.level)===examNormLevel(c.level))
   :C.cellMatches(c,q));
  if(!matches)return;
  const qt=String(q.question||'').normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ');
  if(seen.has(qt))return;
  seen.add(qt);total++;
 });
 return total;
}
function revCellPickedCount(g,c,qs,flex){
 return qs.filter(q=>flex
  ?(Number(q.grade)===Number(g)&&examNormLesson(q.lesson_code)===examNormLesson(c.lesson_code)&&String(q.type||'').toUpperCase()===String(c.type||'').toUpperCase()&&examNormLevel(q.level)===examNormLevel(c.level))
  :C.cellMatches(c,q)).length;
}
function revisionMatrixPanel(g,qs){
 const sources=revisionMatrixSources(g);
 if(!sources.length)return `<p class="small muted">Chưa có ma trận của khối ${g} để đối chiếu. Khóa ma trận ở Ma trận & đặc tả, hoặc thiết lập phân bố đủ 10 điểm ở màn hình Tạo đề kiểm tra.</p>`;
 if(store.revPanelGrade!==Number(g)){store.revPanelGrade=Number(g);store.revCounts={};store.revTypeCounts={};store.revLessonCounts={};store.revFlexibleUserSet=false;}
 const src=sources.find(x=>x.id===store.revisionMatrixId)||sources[0];
 const plan=ensurePlan('rev',src.payload,()=>{if(store.tab==='revisions')renderRevisions();});
 store.revCounts=store.revCounts||{};
 store.revTypeCounts=store.revTypeCounts||{};
 const cells=plan.data?.cells||[];
 const gradeQs=questions().filter(q=>q&&q.review_status!=='archived'&&Number(q.grade)===Number(g));
 const approvedGradeQs=gradeQs.filter(q=>q.review_status==='approved').length;
 const strictShort=cells.some(c=>c.available<c.need);
 if(!store.revFlexibleUserSet){
  store.revFlexibleMode=Boolean(strictShort&&gradeQs.length>0);
 }
 const flex=Boolean(store.revFlexibleMode);
 const capOf=c=>flex?flexCountForCell(g,c.lesson_code,c.type,c.level):c.available;
 const count=c=>store.revCounts[c.key]??defaultRevCount(c,capOf(c));
 const total=cells.reduce((n,c)=>n+count(c),0);
 const picked=c=>revCellPickedCount(g,c,qs,flex);
 const inMatrix=qs.filter(q=>cells.some(c=>flex?(Number(q.grade)===Number(g)&&examNormLesson(q.lesson_code)===examNormLesson(c.lesson_code)&&String(q.type||'').toUpperCase()===String(c.type||'').toUpperCase()&&examNormLevel(q.level)===examNormLevel(c.level)):C.cellMatches(c,q))).length;
 const displayCells=flex?cells.map(c=>({...c,available:capOf(c)})):cells;
 const isBankSrc=Boolean(src.payload?.from_bank);
 const activeTypes=['MC','YN','SHORT','ES'].filter(tp=>cells.some(c=>String(c.type||'').toUpperCase()===tp));
 const typeEntries=activeTypes.map(tp=>{
  const needByType=cells.filter(c=>String(c.type||'').toUpperCase()===tp).reduce((n,c)=>n+Number(c.need||0),0);
  const availByType=revAvailByType(g,cells,tp,flex);
  const val=store.revTypeCounts[tp]!==undefined?Math.max(0,Math.floor(Number(store.revTypeCounts[tp])||0)):isBankSrc?0:Math.min(availByType,Math.ceil(needByType*1.5));
  return {tp,label:examTypeLabel(tp),needByType,availByType,val};
 });
 const totalTypeCount=typeEntries.reduce((n,x)=>n+x.val,0);
 const flexSwitchHtml=`<div class="exam-flex-switch${flex?' is-on':''}" style="margin:10px 0">`+
  `<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-weight:600;color:var(--navy)">`+
   `<input type="checkbox" id="rev-flexible-mode"${flex?' checked':''} style="margin-top:3px">`+
   `<span>Chế độ linh hoạt (dùng cả câu Nháp / Chờ duyệt và khớp theo Bài + Dạng + Mức độ, bỏ qua sai khác câu chữ YCCĐ)</span>`+
  `</label>`+
  (strictShort&&gradeQs.length>0?`<p class="small muted" style="margin:6px 0 0 25px">Ngân hàng Khối ${g} hiện có <strong>${gradeQs.length} câu</strong> (${approvedGradeQs} câu đã duyệt). ${flex?'Đã tự bật chế độ linh hoạt để chọn số câu đề cương từ toàn bộ ngân hàng khối.':'Đang tắt: chỉ lấy câu đã duyệt khớp 100% YCCĐ.'}</p>`:'')+
 `</div>`;
 const randomByTypeBox=cells.length?`<div class="callout" style="margin:12px 0;background:#F7F6FD;border-color:#B9B0EA">`+
  `<strong style="display:block;color:var(--navy);margin-bottom:8px">Tạo đề cương theo số câu từng dạng (VD: 40 câu trắc nghiệm, 6 câu tự luận)</strong>`+
  `<p class="small muted" style="margin:0 0 8px">${isBankSrc?'Số câu mỗi dạng được chia cho các bài và mức độ theo tỉ lệ câu đã duyệt đang có trong ngân hàng.':'Nhập số câu tùy ý cho từng dạng. Tỉ lệ ma trận chỉ dùng để chia số câu đó cho các bài và mức độ; ô nào hết câu thì phần còn lại chuyển sang ô khác cùng dạng. Giới hạn duy nhất là số câu đang có trong ngân hàng: thiếu bao nhiêu, ứng dụng báo rõ.'}</p>`+
  `<div class="form-grid" style="margin-bottom:10px">${typeEntries.map(x=>`<div class="field"><label for="rev-type-${esc(x.tp)}">${esc(x.label)} <span class="muted">(${isBankSrc?`ngân hàng có ${x.availByType}`:`đề ${x.needByType} · ngân hàng có ${x.availByType}`})</span></label><input id="rev-type-${esc(x.tp)}" type="number" min="0" step="1" data-rev-type-count="${esc(x.tp)}" value="${esc(x.val)}"></div>`).join('')}</div>`+
  `<div class="actions"><button type="button" id="rev-random-by-type" class="primary"${totalTypeCount<1?' disabled':''}>Bốc ngẫu nhiên ${totalTypeCount} câu${isBankSrc?'':' theo ma trận'}</button><span class="small muted">Mỗi lần bấm sẽ bốc một bộ ngẫu nhiên mới đúng tỉ lệ bài &amp; mức độ trong ma trận.</span></div>`+
 `</div>`:'';
 return `<div class="field"><label for="revision-matrix">Tạo đề cương theo ma trận</label><select id="revision-matrix">${sources.map(x=>opt(x.id,x.label,x.id===src.id)).join('')}</select></div>${flexSwitchHtml}${randomByTypeBox}<details style="margin:12px 0"><summary style="cursor:pointer;font-weight:600;color:var(--blue)">Tùy chỉnh chi tiết theo từng bài / ô ma trận (${cells.length} ô)</summary><div style="margin-top:10px">${planTable(plan,'<th>Số câu đề cương</th><th>Đã chọn</th>',c=>{const cap=capOf(c);return `<td><input type="number" class="small-input" min="0" max="${cap}" step="1" data-rev-count="${esc(c.key)}" value="${esc(count(c))}" aria-label="Số câu đề cương ô ${esc(c.lesson_code)} ${esc(examTypeLabel(c.type))} ${esc(c.level)}"></td><td><span class="badge${picked(c)<count(c)?' draft':' approved'}">${picked(c)}</span></td>`;},{flexible:flex,grade:Number(g)})}${lessonPickerTable(displayCells,'rev',store.revLessonCounts||{})}${cells.length?`<div class="actions" style="margin-top:10px"><label for="rev-total" class="small">Tổng số câu</label><input id="rev-total" type="number" class="small-input" min="1" step="1" value="${total}"><button type="button" id="rev-split">Chia theo tỉ lệ</button><button type="button" class="primary" id="rev-auto">Tự chọn ${total} câu theo từng ô</button></div><p class="small muted">Đang chọn ${qs.length} câu (${inMatrix} câu thuộc ô ma trận${qs.length-inMatrix?`, ${qs.length-inMatrix} câu ngoài ma trận`:''}). Sửa số từng ô rồi bấm "Tự chọn theo từng ô", hoặc dùng khung bốc ngẫu nhiên theo dạng ở trên.</p>`:''}</div></details>`;
}
function bindRevisionMatrixPanel(g){
 const el=$('#revision-matrix');if(!el)return;
 el.onchange=e=>{store.revisionMatrixId=e.target.value;store.revCounts={};store.revTypeCounts={};store.revFlexibleUserSet=false;renderRevisions();};
 if($('#rev-flexible-mode'))$('#rev-flexible-mode').onchange=e=>{store.revFlexibleMode=e.target.checked;store.revFlexibleUserSet=true;store.revCounts={};store.revTypeCounts={};renderRevisions();};
 document.querySelectorAll('[data-rev-type-count]').forEach(inp=>{
  inp.oninput=()=>{
   store.revTypeCounts=store.revTypeCounts||{};
   store.revTypeCounts[inp.dataset.revTypeCount]=Math.max(0,Math.floor(Number(inp.value)||0));
   const btn=$('#rev-random-by-type');
   if(btn){
    const sum=[...document.querySelectorAll('[data-rev-type-count]')].reduce((n,i)=>n+Math.max(0,Math.floor(Number(i.value)||0)),0);
    btn.textContent=`Bốc ngẫu nhiên ${sum} câu${src().payload?.from_bank?'':' theo ma trận'}`;
    btn.disabled=sum<1;
   }
  };
 });
 document.querySelectorAll('[data-rev-count]').forEach(inp=>{inp.onchange=()=>{store.revCounts[inp.dataset.revCount]=Math.max(0,Math.floor(Number(inp.value)||0));renderRevisions();};});
 const src=()=>{const list=revisionMatrixSources(g);return list.find(x=>x.id===store.revisionMatrixId)||list[0];};
 const getFlexCells=()=>{
  const raw=store.plans?.rev?.data?.cells||[];
  return store.revFlexibleMode?raw.map(c=>({...c,available:flexCountForCell(g,c.lesson_code,c.type,c.level)})):raw;
 };
 store.revLessonCounts = store.revLessonCounts || {};
 bindLessonPickerInputs('rev', store.revLessonCounts);
 if($('#rev-random-by-type'))$('#rev-random-by-type').onclick=async()=>{
  const typeCounts={};
  document.querySelectorAll('[data-rev-type-count]').forEach(inp=>{
   typeCounts[inp.dataset.revTypeCount]=Math.max(0,Math.floor(Number(inp.value)||0));
  });
  const sum=Object.values(typeCounts).reduce((a,b)=>a+b,0);
  if(sum<1){notify('Hãy nhập ít nhất 1 câu hỏi cho một dạng câu.',true);return;}
  try{
   const res=await request('/api/revisions/propose',{...src().payload,flexible:Boolean(store.revFlexibleMode)&&!src().payload?.from_bank,type_counts:typeCounts,seed:String(Date.now())+'-'+Math.random().toString(36).slice(2)});
   questions().filter(q=>Number(q.grade)===Number(g)).forEach(q=>store.selected.delete(q.id));
   res.question_ids.forEach(id=>store.selected.add(id));
   store.revCounts=store.revCounts||{};
   (res.cells||[]).forEach(c=>{store.revCounts[c.key]=c.revision_count;});
   const countsByType={};
   (res.cells||[]).forEach(c=>{countsByType[c.type]=(countsByType[c.type]||0)+Number(c.revision_count||0);});
   const summaryStr=Object.entries(countsByType).filter(([,v])=>v>0).map(([tp,v])=>`${v} ${examTypeLabel(tp)}`).join(', ');
   renderRevisions();
   notify(`Đã bốc ngẫu nhiên ${res.total} câu ${res.source==='bank'?'từ ngân hàng':'theo ma trận'} cho Khối ${g}${summaryStr?` (${summaryStr})`:''}. Bấm "Lưu phiên bản đề cương" bên dưới để lưu.`+(res.warnings?.length?'\nLưu ý: '+res.warnings.join(' '):''),Boolean(res.warnings?.length));
  }catch(err){notify(detailError(err),true);}
 };
 if($('#rev-apply-lesson-split'))$('#rev-apply-lesson-split').onclick=()=>{
   const cells=getFlexCells();
   const distributed = C.distributeCountsByLesson(cells, store.revLessonCounts);
   Object.assign(store.revCounts, distributed);
   renderRevisions();
 };
 if($('#rev-split'))$('#rev-split').onclick=()=>{const cells=getFlexCells();Object.assign(store.revCounts,C.distributeCounts(cells,Math.max(1,Math.floor(Number($('#rev-total').value)||0))));renderRevisions();};
 if($('#rev-auto'))$('#rev-auto').onclick=async()=>{const cells=getFlexCells(),counts={};cells.forEach(c=>{counts[c.key]=store.revCounts[c.key]??defaultRevCount(c,c.available);});
  try{const res=await request('/api/revisions/propose',{...src().payload,flexible:Boolean(store.revFlexibleMode),counts,seed:String(Date.now())+'-'+Math.random().toString(36).slice(2)});questions().filter(q=>Number(q.grade)===Number(g)).forEach(q=>store.selected.delete(q.id));res.question_ids.forEach(id=>store.selected.add(id));renderRevisions();notify(`Đã chọn ${res.total} câu theo ma trận cho khối ${g}. Xem lại danh sách, chỉnh ở Ngân hàng nếu cần, rồi bấm "Lưu phiên bản đề cương".`+(res.warnings?.length?'\nLưu ý: '+res.warnings.join(' '):''),Boolean(res.warnings?.length));}catch(err){notify(detailError(err),true);}};
}
function getAssessmentPlans(grade, subj) {
  const s = subj || store.selectedSubject || 'Tin học';
  const g = grade ? Number(grade) : effectiveGrade();
  const cleared = store.apClearedKeys || (store.apClearedKeys = new Set());
  const all = Array.isArray(store.assessmentPlans) ? store.assessmentPlans : [];
  let list = all.filter(p => (p.subject_name || 'Tin học') === s && Number(p.grade) === g);
  if (list.length === 0 && !cleared.has(`${g}|${s}`) && window.BankAssessmentPlan) {
    list = window.BankAssessmentPlan.buildDefaultAssessmentPlans(g, s).map(p => ({ ...p, _virtual: true }));
    if (!Array.isArray(store.assessmentPlans)) store.assessmentPlans = [];
    store.assessmentPlans.push(...list);
  }
  return list;
}

async function ensurePersistedAssessmentPlans(g, s) {
  const current = getAssessmentPlans(g, s);
  if (!current.some(p => p._virtual)) return;
  const cleanPlans = current.map(({ _virtual, ...rest }) => rest);
  const res = await request('/api/assessment-plans/import', {
    grade: g,
    subject_name: s,
    plans: cleanPlans,
    replace_grade: true
  });
  if (Array.isArray(res?.assessment_plans)) store.assessmentPlans = res.assessment_plans;
  else current.forEach(p => { delete p._virtual; });
}

function buildAssessmentPlanSampleRows(g, s) {
  const defaults = window.BankAssessmentPlan
    ? window.BankAssessmentPlan.buildDefaultAssessmentPlans(g, s)
    : [];
  const header = ['STT', 'Bài kiểm tra, đánh giá', 'Kỳ', 'Thời gian (phút)', 'Thời điểm (Tuần)', 'Tiết PPCT', 'Hệ số', 'Hình thức', 'Phạm vi bài học', 'Yêu cầu cần đạt tóm tắt', 'Ghi chú'];
  const body = defaults.map((p, i) => [
    String(i + 1),
    p.name || '',
    p.exam_type || '',
    String(p.duration || 45),
    p.week || '',
    p.period || '',
    String(p.coefficient || 2),
    p.form || '',
    (p.scope_lessons || []).join('; '),
    p.scope_description || '',
    p.notes || ''
  ]);
  return [header, ...body];
}

function parseAssessmentPlanMarkdownTable(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const tableLines = lines.filter(l => l.includes('|'));
  if (tableLines.length < 2) return [];
  return tableLines
    .map(line => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()))
    .filter(cells => cells.length >= 2 && !cells.every(c => /^[:\s-]+$/.test(c)));
}

function extractAssessmentPlanRowsFromHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = [...doc.querySelectorAll('table')];
  let bestRows = [];
  let bestScore = -1;
  tables.forEach(tbl => {
    const rows = [...tbl.querySelectorAll('tr')]
      .map(tr => [...tr.querySelectorAll('th,td')].map(td => td.textContent.replace(/\s+/g, ' ').trim()))
      .filter(r => r.some(Boolean));
    if (rows.length < 2) return;
    const textNorm = rows.slice(0, 3).flat().join(' ').toLowerCase();
    let score = rows.length;
    if (/kiểm tra|đánh giá|giữa h[ọo]c|cuối h[ọo]c|hệ số|thời gian/.test(textNorm)) score += 50;
    if (/tuần|tiết|hình thức|phạm vi/.test(textNorm)) score += 20;
    if (score > bestScore) { bestScore = score; bestRows = rows; }
  });
  return bestRows;
}

function looksLikeAssessmentPlanTable(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const sampleText = rows.slice(0, 6).flat().join(' ').toLowerCase();
  return /kiểm tra|đánh giá|kiem tra|danh gia|giữa kỳ|giữa kì|cuối kỳ|cuối kì|gk1|ck1|gk2|ck2|hệ số|thời lượng/.test(sampleText);
}

async function readAssessmentPlanImportInput(g, s) {
  const file = $('#ap-import-file')?.files?.[0];
  const pasteText = ($('#ap-import-paste')?.value || '').trim();
  const replace = $('#ap-import-replace') ? Boolean($('#ap-import-replace').checked) : true;
  if (!file && !pasteText) {
    throw new Error('Hãy chọn tệp (.xlsx, .csv, .json, .md, .docx) hoặc dán nội dung bảng KHKTĐG vào ô bên dưới.');
  }
  const model = window.BankAssessmentPlan;
  if (!model) throw new Error('Bộ phân tích KHKTĐG chưa nạp xong, vui lòng tải lại trang.');

  if (file) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'json') {
      const parsed = JSON.parse(await file.text());
      const rawList = Array.isArray(parsed) ? parsed : (parsed.assessment_plans || parsed.plans || []);
      const plans = rawList.map(x => model.normalizePlan(x, g, s)).filter(Boolean);
      if (!plans.length) throw new Error('Tệp JSON chưa có danh sách kế hoạch kiểm tra (assessment_plans hoặc plans).');
      return { grade: g, subject_name: s, filename: file.name, plans, replace };
    }
    if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
      if (typeof TableFileHelper === 'undefined') throw new Error('Bộ đọc Excel/CSV đang nạp, vui lòng thử lại.');
      const res = await TableFileHelper.readTableFile(file);
      const rows = res.rows || [];
      if (!looksLikeAssessmentPlanTable(rows)) {
        throw new Error(`Không tìm thấy bảng Kế hoạch KTĐG hợp lệ trong tệp ${file.name}. Bấm "Tải mẫu KHKTĐG (Excel)" để xem mẫu chuẩn.`);
      }
      const plans = model.parseAssessmentPlansFromRows(rows, g, s);
      return { grade: g, subject_name: s, filename: file.name, plans, replace };
    }
    if (['md', 'txt'].includes(ext)) {
      const txt = (await file.text()).trim();
      if (txt.startsWith('[') || txt.startsWith('{')) {
        const parsed = JSON.parse(txt);
        const rawList = Array.isArray(parsed) ? parsed : (parsed.assessment_plans || parsed.plans || []);
        const plans = rawList.map(x => model.normalizePlan(x, g, s)).filter(Boolean);
        if (!plans.length) throw new Error('Nội dung JSON chưa có đợt kiểm tra hợp lệ.');
        return { grade: g, subject_name: s, filename: file.name, plans, replace };
      }
      const mdRows = parseAssessmentPlanMarkdownTable(txt);
      const rows = mdRows.length ? mdRows : (typeof TableFileHelper !== 'undefined' ? TableFileHelper.parseCsvText(txt) : []);
      if (!looksLikeAssessmentPlanTable(rows)) {
        throw new Error(`Không nhận diện được bảng KHKTĐG trong tệp ${file.name}.`);
      }
      const plans = model.parseAssessmentPlansFromRows(rows, g, s);
      return { grade: g, subject_name: s, filename: file.name, plans, replace };
    }
    if (ext === 'docx') {
      if (typeof mammoth === 'undefined') throw new Error('Trình đọc Word (.docx) chưa sẵn sàng, hãy thử tải mẫu Excel hoặc dán bảng trực tiếp.');
      const htmlRes = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      const rows = extractAssessmentPlanRowsFromHtml(htmlRes.value || '');
      if (!looksLikeAssessmentPlanTable(rows)) {
        throw new Error(`Không tìm thấy bảng Kế hoạch KTĐG (Phụ lục 3) trong tệp Word ${file.name}. Thầy/Cô có thể dùng nút "Chép Prompt AI" để chuyển bảng Word sang Excel/JSON.`);
      }
      const plans = model.parseAssessmentPlansFromRows(rows, g, s);
      return { grade: g, subject_name: s, filename: file.name, plans, replace };
    }
    throw new Error('Định dạng tệp chưa hỗ trợ. Hãy chọn .xlsx, .csv, .json, .md hoặc .docx.');
  }

  if (pasteText.startsWith('[') || pasteText.startsWith('{')) {
    const parsed = JSON.parse(pasteText);
    const rawList = Array.isArray(parsed) ? parsed : (parsed.assessment_plans || parsed.plans || []);
    const plans = rawList.map(x => model.normalizePlan(x, g, s)).filter(Boolean);
    if (!plans.length) throw new Error('Dữ liệu JSON chưa có đợt kiểm tra hợp lệ.');
    return { grade: g, subject_name: s, filename: 'Dữ liệu JSON đã dán', plans, replace };
  }
  const mdRows = parseAssessmentPlanMarkdownTable(pasteText);
  const rows = mdRows.length ? mdRows : (typeof TableFileHelper !== 'undefined' ? TableFileHelper.parseCsvText(pasteText) : pasteText.split(/\r?\n/).map(l => l.split('\t').map(c => c.trim())));
  if (!looksLikeAssessmentPlanTable(rows)) {
    throw new Error('Không nhận diện được bảng KHKTĐG từ nội dung đã dán. Hãy dán đủ dòng tiêu đề (Bài kiểm tra, Thời gian, Thời điểm, Hệ số, Phạm vi bài học...).');
  }
  const plans = model.parseAssessmentPlansFromRows(rows, g, s);
  return { grade: g, subject_name: s, filename: 'Dữ liệu bảng đã dán', plans, replace };
}

function assessmentPlanImportCard(g, s) {
  const preview = store.apImportPreview;
  const previewRowsHtml = preview?.plans?.length ? preview.plans.map((p, i) => `
    <tr>
      <td style="text-align:center"><strong>${i + 1}</strong></td>
      <td><strong>${esc(p.name)}</strong><div class="small muted">${esc(periodNames[p.exam_type] || p.exam_type)}</div></td>
      <td style="text-align:center"><span class="badge">${esc(p.duration || 45)} phút</span></td>
      <td><strong>${esc(p.week || '—')}</strong>${p.period ? `<div class="small muted">${esc(p.period)}</div>` : ''}</td>
      <td style="text-align:center"><strong>x${esc(p.coefficient || 2)}</strong></td>
      <td class="small">${esc(p.form || '—')}</td>
      <td>${(p.scope_lessons || []).map(c => `<span class="badge" style="margin:2px 0">${esc(c)}</span>`).join(' ') || '<span class="muted small">Toàn bộ</span>'}</td>
      <td class="small">${esc(p.scope_description || '—')}</td>
    </tr>
  `).join('') : '';

  return `<div id="ap-import-card" class="card" style="margin-top:20px">
    <h2>Nhập Kế hoạch kiểm tra, đánh giá từ Excel, JSON, Markdown hoặc Word</h2>
    <p class="muted">Khuyên dùng <strong>Excel (.xlsx / .csv)</strong> hoặc <strong>JSON / Markdown</strong> chuẩn <strong>Phụ lục 3 (CV 5512/BGDĐT-GDTrH &amp; TT 22/2021)</strong> để nạp tức thì 4 mốc ĐĐGđk cho môn ${esc(s)} Khối ${esc(g)}. Vẫn hỗ trợ đọc trực tiếp bảng KHKTĐG từ tệp Word (<code>.docx</code>).</p>
    <div style="background:#F3F4F8;border:1px solid #D6D1F2;border-radius:8px;padding:12px 16px;margin:12px 0;color:#1C2333;font-size:13px;line-height:1.6">
      <strong>Hướng dẫn thầy/cô dùng AI (Gemini / ChatGPT / Claude) chuyển Word sang Excel / JSON để tải lên:</strong>
      <ol style="margin:6px 0 0;padding-left:20px">
        <li>Bấm nút <strong>Chép Prompt AI chuyển Word → Excel/JSON</strong> bên dưới.</li>
        <li>Mở <strong>Gemini</strong> hoặc <strong>ChatGPT</strong>, dán câu lệnh (Prompt) vào khung chat rồi <strong>đính kèm tệp Word KHDH Phụ lục 3 (<code>.docx</code>)</strong> (hoặc copy bảng KHKTĐG trong Word dán vào) và gửi.</li>
        <li>Sao chép bảng kết quả AI trả về dán vào Excel lưu thành <strong><code>.xlsx</code> / <code>.csv</code></strong> (hoặc dán thẳng bảng đó vào khung bên dưới).</li>
        <li>Chọn tệp (hoặc dán) → bấm <strong>Đọc và đối chiếu</strong> → xem trước bảng bên dưới rồi bấm <strong>Xác nhận nhập</strong>.</li>
      </ol>
    </div>
    <div style="display:flex;gap:10px;margin:10px 0 14px;flex-wrap:wrap;align-items:center">
      <button type="button" class="button" id="ap-download-excel-sample" style="background:#1F6B52;color:#fff;border-color:#1F6B52;padding:6px 12px;font-size:12px;font-weight:700">Tải mẫu KHKTĐG (Excel)</button>
      <button type="button" class="button quiet" id="ap-download-json-sample" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Tải mẫu KHKTĐG (JSON)</button>
      <button type="button" class="button quiet" id="ap-download-md-sample" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Tải mẫu KHKTĐG (Markdown)</button>
      <button type="button" class="button quiet" id="ap-copy-prompt" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Chép Prompt AI chuyển Word → Excel/JSON</button>
    </div>
    <div class="form-grid" style="align-items:end;margin-bottom:10px">
      <div class="field span2">
        <label for="ap-import-file">Chọn tệp dữ liệu (.xlsx, .xls, .csv, .tsv, .json, .md, .docx)</label>
        <input type="file" id="ap-import-file" accept=".xlsx,.xls,.csv,.tsv,.docx,.json,.md,.txt">
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">
          <input type="checkbox" id="ap-import-replace"${preview ? (preview.replace ? ' checked' : '') : ' checked'}>
          <span>Thay thế KHKTĐG Khối ${esc(g)} hiện tại</span>
        </label>
      </div>
      <div class="field full">
        <label for="ap-import-paste">Hoặc dán trực tiếp bảng từ Excel / Word / Markdown / JSON:</label>
        <textarea id="ap-import-paste" rows="4" placeholder="Bài kiểm tra, đánh giá | Thời gian | Thời điểm | Tiết PPCT | Hệ số | Hình thức | Phạm vi bài học&#10;Kiểm tra Đánh giá Giữa Học kỳ 1 | 45 phút | Tuần 9 | Tiết 9 | 2 | Trắc nghiệm (70%) + Tự luận (30%) | B1; B2; B3; B4"></textarea>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="button" id="ap-import-inspect">Đọc và đối chiếu</button>
      ${preview ? `<button type="button" class="primary" id="ap-import-apply">Xác nhận nhập (${preview.plans.length} đợt kiểm tra)</button><button type="button" class="quiet" id="ap-import-cancel">Hủy xem trước</button>` : ''}
    </div>
    ${preview ? `
      <p class="callout" style="margin-top:12px">Đã đọc từ <strong>${esc(preview.filename)}</strong> · Môn ${esc(preview.subject_name)} Khối ${esc(preview.grade)} · <strong>${preview.plans.length} đợt kiểm tra</strong> (${preview.replace ? 'sẽ thay thế KHKTĐG khối này' : 'sẽ thêm vào KHKTĐG khối này'}). Kiểm tra lại bảng bên dưới rồi bấm <strong>Xác nhận nhập</strong>.</p>
      <div class="table-wrap">
        <table class="ppct-table">
          <thead>
            <tr>
              <th style="width:40px;text-align:center">TT</th>
              <th>Bài kiểm tra, đánh giá</th>
              <th style="width:90px;text-align:center">Thời gian</th>
              <th style="width:120px">Thời điểm</th>
              <th style="width:70px;text-align:center">Hệ số</th>
              <th>Hình thức</th>
              <th>Phạm vi bài học</th>
              <th>Yêu cầu cần đạt tóm tắt</th>
            </tr>
          </thead>
          <tbody>${previewRowsHtml}</tbody>
        </table>
      </div>
    ` : ''}
  </div>`;
}

function renderAssessmentPlans() {
  const g = effectiveGrade();
  store.assessmentPlanGrade = g;
  const s = store.assessmentPlanSubject || store.selectedSubject || 'Tin học';
  const plans = getAssessmentPlans(g, s);
  const ppctLs = lessons(g, s);

  const plansHtml = plans.length ? plans.map((p, idx) => {
    const scopeBadges = (p.scope_lessons || []).map(code => {
      const match = ppctLs.find(l => l.lesson_code === code);
      const title = match ? (match.lesson_name_source || match.lesson_name || match.title || code) : code;
      return `<span class="badge" title="${esc(title)}" style="margin:2px 0">${esc(code)}</span>`;
    }).join(' ') || '<span class="muted small">Tất cả bài học</span>';

    return `<tr>
      <td style="text-align:center"><strong>${idx + 1}</strong></td>
      <td>
        <strong>${esc(p.name)}</strong>
        <div class="muted small">${esc(p.exam_type ? (periodNames[p.exam_type] || p.exam_type) : '')}</div>
      </td>
      <td style="text-align:center"><span class="badge" style="font-weight:700">${esc(p.duration || 45)} phút</span></td>
      <td>
        <div><strong>${esc(p.week || 'Chưa định')}</strong></div>
        <div class="small muted">${esc(p.period || '')}</div>
      </td>
      <td style="text-align:center"><strong style="color:var(--navy);font-size:13px">x${esc(p.coefficient || (['CK1','CK2'].includes(p.exam_type) ? 3 : 2))}</strong></td>
      <td><span class="small">${esc(p.form || 'Viết / Máy tính')}</span></td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap">${scopeBadges}</div></td>
      <td style="text-align:right">
        <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" class="primary" style="padding:4px 10px;font-size:12px;background:#4A3AA8;border-color:#4A3AA8" data-plan-make-matrix="${esc(p.id)}">Lập ma trận</button>
          <button type="button" class="export-link" style="padding:4px 8px;font-size:12px" data-plan-edit="${esc(p.id)}">Sửa</button>
          <button type="button" class="export-link danger" style="padding:4px 8px;font-size:12px" data-plan-delete="${esc(p.id)}">Xóa</button>
        </div>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="8" class="empty" style="text-align:center;padding:24px">Chưa có kế hoạch kiểm tra cho môn ${esc(s)} Khối ${g}. Bấm nút "Khôi phục 4 mốc GDPT 2018", "+ Thêm đợt kiểm tra" hoặc nạp tệp bên dưới để bắt đầu.</td></tr>`;

  $('#assessment-plans').innerHTML = `
    ${title(`Kế hoạch môn ${s}`, 'Kế hoạch kiểm tra, đánh giá định kỳ', `Kế hoạch kiểm tra định kỳ (Phụ lục 3 CV 5512/BGDĐT-GDTrH & TT 22/2021) môn ${s} Khối ${g}. Mọi Ma trận và Bảng đặc tả sẽ tự động liên kết - tham chiếu đến các thông số và phạm vi bài học tại đây.`,
    `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <label for="ap-grade-select" class="small muted" style="font-weight:600">Khối:</label>
      <select id="ap-grade-select" style="min-height:36px;padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:#fff;font-weight:600">${gradeOptions(g)}</select>
      <label for="ap-subject-select" class="small muted" style="font-weight:600">Môn:</label>
      <select id="ap-subject-select" style="min-height:36px;padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:#fff;font-weight:600">${['Tin học','Toán','Ngữ văn','Tiếng Anh','Khoa học tự nhiên','Lịch sử và Địa lí','Công nghệ','Giáo dục công dân'].map(subj=>opt(subj,subj,subj===s)).join('')}</select>
    </div>`)}

    <div class="card" style="margin-bottom:16px;background:#F7F8FB;border:1px solid #D5D9E4">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <h3 style="margin:0 0 4px;font-size:15px;color:#4A3AA8">Nguyên tắc kiểm tra định kỳ chuẩn Bộ GD&amp;ĐT (TT 22/2021 &amp; CV 5512)</h3>
          <p class="small muted" style="margin:0">Môn ${esc(s)}: 04 bài ĐĐGđk/năm học (Giữa HK1: hệ số 2; Cuối HK1: hệ số 3; Giữa HK2: hệ số 2; Cuối HK2: hệ số 3). Cụm Chuyên đề học tập chỉ tính 01 điểm ĐĐGtx (Điều 7.1).</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="primary" id="btn-add-assessment-plan">+ Thêm đợt kiểm tra</button>
          <button type="button" class="button" id="btn-import-assessment-plan">Nạp KHKTĐG từ tệp</button>
          <button type="button" class="button quiet" id="btn-reset-default-assessment-plan">Khôi phục 4 mốc GDPT 2018</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="ppct-table">
          <thead>
            <tr>
              <th style="width:40px;text-align:center">TT</th>
              <th>Bài kiểm tra, đánh giá</th>
              <th style="width:90px;text-align:center">Thời gian</th>
              <th style="width:130px">Thời điểm / Tiết</th>
              <th style="width:80px;text-align:center">Hệ số</th>
              <th style="width:160px">Hình thức</th>
              <th>Phạm vi bài học (CV 5512)</th>
              <th style="width:200px;text-align:right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${plansHtml}
          </tbody>
        </table>
      </div>
    </div>
    ${assessmentPlanImportCard(g, s)}
  `;

  const gSel = $('#ap-grade-select');
  if (gSel) gSel.onchange = e => { store.apImportPreview = null; setActiveGrade(Number(e.target.value)); };
  const sSel = $('#ap-subject-select');
  if (sSel) sSel.onchange = e => { store.apImportPreview = null; store.assessmentPlanSubject = e.target.value; setGlobalSubject(e.target.value); };

  const btnAdd = $('#btn-add-assessment-plan');
  if (btnAdd) btnAdd.onclick = () => openAssessmentPlanEditor(g, s, null);

  const btnReset = $('#btn-reset-default-assessment-plan');
  if (btnReset) btnReset.onclick = async () => {
    if (!confirm(`Khôi phục 4 đợt kiểm tra định kỳ (GK1, CK1, GK2, CK2) chuẩn GDPT 2018 cho môn ${s} Khối ${g}?`)) return;
    if (store.apClearedKeys) store.apClearedKeys.delete(`${g}|${s}`);
    await mutate('/api/assessment-plans/reset-defaults', { grade: g, subject_name: s }, () => {
      notify(`Đã khôi phục kế hoạch KTĐG chuẩn GDPT 2018 cho Khối ${g}.`);
      renderAssessmentPlans();
    });
  };

  const btnImport = $('#btn-import-assessment-plan');
  if (btnImport) btnImport.onclick = () => {
    const card = $('#ap-import-card');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.style.boxShadow = '0 0 0 3px #B9B0EA';
      setTimeout(() => { if (card) card.style.boxShadow = ''; }, 1400);
    }
    $('#ap-import-file')?.focus();
  };

  document.querySelectorAll('#assessment-plans [data-plan-edit]').forEach(btn => {
    btn.onclick = () => {
      const p = plans.find(x => x.id === btn.dataset.planEdit);
      if (p) openAssessmentPlanEditor(g, s, p);
    };
  });

  document.querySelectorAll('#assessment-plans [data-plan-delete]').forEach(btn => {
    btn.onclick = async () => {
      const pid = btn.dataset.planDelete;
      if (!confirm('Xóa đợt kiểm tra đánh giá này khỏi kế hoạch?')) return;
      try {
        await ensurePersistedAssessmentPlans(g, s);
      } catch (err) {
        notify(detailError(err), true);
        return;
      }
      await mutate('/api/assessment-plans/delete', { id: pid }, () => {
        const remaining = (store.assessmentPlans || []).filter(p => (p.subject_name || 'Tin học') === s && Number(p.grade) === g);
        if (remaining.length === 0) {
          store.apClearedKeys = store.apClearedKeys || new Set();
          store.apClearedKeys.add(`${g}|${s}`);
        }
        notify('Đã xóa đợt kiểm tra khỏi KHKTĐG.');
        renderAssessmentPlans();
      });
    };
  });

  document.querySelectorAll('#assessment-plans [data-plan-make-matrix]').forEach(btn => {
    btn.onclick = () => {
      const p = plans.find(x => x.id === btn.dataset.planMakeMatrix);
      if (!p) return;
      createMatrixFromAssessmentPlan(p);
    };
  });

  bindAssessmentPlanImport(g, s);
}

function bindAssessmentPlanImport(g, s) {
  const dlExcel = $('#ap-download-excel-sample');
  if (dlExcel) dlExcel.onclick = () => {
    const rows = buildAssessmentPlanSampleRows(g, s);
    const filename = `Mau_KHKTDG_Excel_${C.normalize(s).replace(/\s+/g, '_')}_Khoi_${g}_CV5512.csv`;
    if (typeof TableFileHelper !== 'undefined' && typeof TableFileHelper.downloadCsv === 'function') {
      TableFileHelper.downloadCsv(rows, filename);
    } else {
      const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      triggerTextDownload(csv, 'text/csv;charset=utf-8', filename);
    }
    notify(`Đã tải mẫu Excel KHKTĐG Khối ${g}.`);
  };

  const dlJson = $('#ap-download-json-sample');
  if (dlJson) dlJson.onclick = () => {
    const defaults = window.BankAssessmentPlan
      ? window.BankAssessmentPlan.buildDefaultAssessmentPlans(g, s)
      : [];
    const payload = { grade: g, subject_name: s, school_year: '2026-2027', assessment_plans: defaults };
    triggerTextDownload(JSON.stringify(payload, null, 2), 'application/json;charset=utf-8', `Mau_KHKTDG_${C.normalize(s).replace(/\s+/g, '_')}_Khoi_${g}.json`);
    notify(`Đã tải mẫu JSON KHKTĐG Khối ${g}.`);
  };

  const dlMd = $('#ap-download-md-sample');
  if (dlMd) dlMd.onclick = () => {
    const rows = buildAssessmentPlanSampleRows(g, s);
    const header = '| ' + rows[0].join(' | ') + ' |';
    const sep = '| ' + rows[0].map(() => '---').join(' | ') + ' |';
    const body = rows.slice(1).map(r => '| ' + r.join(' | ') + ' |').join('\n');
    const md = `# KẾ HOẠCH KIỂM TRA, ĐÁNH GIÁ ĐỊNH KỲ MÔN ${s.toLocaleUpperCase('vi')} - KHỐI ${g}\nChuẩn Phụ lục 3 CV 5512/BGDĐT-GDTrH & TT 22/2021\n\n${header}\n${sep}\n${body}\n`;
    triggerTextDownload(md, 'text/markdown;charset=utf-8', `Mau_KHKTDG_${C.normalize(s).replace(/\s+/g, '_')}_Khoi_${g}.md`);
    notify(`Đã tải mẫu Markdown KHKTĐG Khối ${g}.`);
  };

  const copyPromptBtn = $('#ap-copy-prompt');
  if (copyPromptBtn) copyPromptBtn.onclick = () => {
    const prompt = `Bạn là chuyên gia giáo vụ chuẩn Công văn 5512/BGDĐT-GDTrH và Thông tư 22/2021/TT-BGDĐT.
Hãy trích xuất bảng Kế hoạch kiểm tra, đánh giá định kỳ (Phụ lục 3) môn ${s} Khối ${g} từ tệp Word/nội dung tôi đính kèm sang bảng Markdown (hoặc JSON) chuẩn gồm đúng các cột sau để tôi nhập vào ExamMatrix Studio:

| STT | Bài kiểm tra, đánh giá | Kỳ | Thời gian (phút) | Thời điểm (Tuần) | Tiết PPCT | Hệ số | Hình thức | Phạm vi bài học | Yêu cầu cần đạt tóm tắt | Ghi chú |

Quy ước bắt buộc:
- Cột Kỳ: dùng đúng một trong các mã GK1, CK1, GK2, CK2, TX.
- Cột Thời gian (phút): chỉ ghi số phút (ví dụ: 45 hoặc 60 hoặc 90).
- Cột Hệ số: Giữa kì ghi 2, Cuối kì ghi 3, Thường xuyên ghi 1.
- Cột Phạm vi bài học: liệt kê các mã bài cách nhau bằng dấu chấm phẩy (ví dụ: B1; B2; B3; B4).
- Không bỏ sót dòng nào; giữ nguyên tên bài kiểm tra, tuần, tiết PPCT theo KHDH của tổ chuyên môn.`;
    copyTextWithFallback(prompt, 'Đã chép Prompt AI chuyển KHKTĐG (Phụ lục 3) vào bộ nhớ tạm!');
  };

  const inspectBtn = $('#ap-import-inspect');
  if (inspectBtn) inspectBtn.onclick = async () => {
    try {
      store.apImportPreview = await readAssessmentPlanImportInput(g, s);
      renderAssessmentPlans();
      $('#ap-import-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      notify(`Đã đọc ${store.apImportPreview.plans.length} đợt kiểm tra từ "${store.apImportPreview.filename}". Bấm "Xác nhận nhập" để lưu.`);
    } catch (err) {
      notify(err.message, true);
    }
  };

  const applyBtn = $('#ap-import-apply');
  if (applyBtn) applyBtn.onclick = async () => {
    const preview = store.apImportPreview;
    if (!preview?.plans?.length) return;
    if (store.apClearedKeys) store.apClearedKeys.delete(`${g}|${s}`);
    await mutate('/api/assessment-plans/import', {
      grade: g,
      subject_name: s,
      plans: preview.plans,
      replace_grade: Boolean(preview.replace)
    }, res => {
      const cnt = (res.imported || preview.plans).length;
      store.apImportPreview = null;
      renderAssessmentPlans();
      notify(`Đã nạp thành công ${cnt} đợt kiểm tra vào Kế hoạch KTĐG môn ${s} Khối ${g}!`);
    });
  };

  const cancelBtn = $('#ap-import-cancel');
  if (cancelBtn) cancelBtn.onclick = () => {
    store.apImportPreview = null;
    renderAssessmentPlans();
  };
}

function openAssessmentPlanEditor(grade, subj, existing) {
  const g = Number(grade || effectiveGrade());
  const s = subj || store.assessmentPlanSubject || 'Tin học';
  const ppctLs = lessons(g, s);
  const p = existing || {
    id: '',
    name: 'Kiểm tra Đánh giá Giữa Học kỳ 1',
    exam_type: 'GK1',
    semester: 1,
    grade: g,
    subject_name: s,
    duration: 45,
    week: 'Tuần 9',
    period: 'Tiết 9',
    coefficient: 2,
    form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
    scope_lessons: [],
    scope_description: '',
    notes: 'Đánh giá định kỳ hệ số 2 theo TT 22/2021.'
  };

  const currentScope = new Set(p.scope_lessons || []);

  const lessonCheckboxesHtml = ppctLs.length ? ppctLs.map(l => {
    const isChecked = currentScope.has(l.lesson_code);
    const label = `${esc(l.lesson_code)}: ${esc(l.lesson_name_source || l.lesson_name || l.title || '')}`;
    return `<label style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:4px;cursor:pointer;background:${isChecked?'#F2F0FB':'transparent'}">
      <input type="checkbox" name="scope_lesson" value="${esc(l.lesson_code)}"${isChecked?' checked':''}>
      <span class="small" style="font-weight:${isChecked?'600':'400'}">${label}</span>
    </label>`;
  }).join('') : '<p class="small muted">Chưa có bài học PPCT cho khối này. Thầy/Cô có thể nhập phạm vi bài học thủ công ở ô mô tả bên dưới.</p>';

  $('#edit-title').textContent = `${existing ? 'Sửa đợt kiểm tra đánh giá' : 'Thêm đợt kiểm tra đánh giá mới'} (Khối ${g})`;
  $('#question-form').innerHTML = `
    <div id="form-error" class="callout error" role="alert" hidden></div>
    <div class="form-grid">
      <div class="field span2">
        <label for="ap-form-name">Tên bài kiểm tra, đánh giá *</label>
        <input type="text" id="ap-form-name" name="name" value="${esc(p.name)}" required placeholder="Ví dụ: Kiểm tra Đánh giá Giữa Học kỳ 1">
      </div>
      <div class="field">
        <label for="ap-form-type">Kỳ kiểm tra *</label>
        <select id="ap-form-type" name="exam_type">
          ${Object.entries(periodNames).map(([k, v]) => opt(k, `${k} - ${v}`, k === p.exam_type)).join('')}
        </select>
      </div>
      <div class="field">
        <label for="ap-form-duration">Thời gian (phút) *</label>
        <input type="number" id="ap-form-duration" name="duration" min="10" max="180" value="${esc(p.duration || 45)}" required>
      </div>
      <div class="field">
        <label for="ap-form-week">Thời điểm (Tuần)</label>
        <input type="text" id="ap-form-week" name="week" value="${esc(p.week || '')}" placeholder="Ví dụ: Tuần 9">
      </div>
      <div class="field">
        <label for="ap-form-period">Tiết PPCT</label>
        <input type="text" id="ap-form-period" name="period" value="${esc(p.period || '')}" placeholder="Ví dụ: Tiết 9 hoặc Tiết 18">
      </div>
      <div class="field">
        <label for="ap-form-coef">Hệ số điểm (TT 22/2021) *</label>
        <select id="ap-form-coef" name="coefficient">
          <option value="2"${Number(p.coefficient) === 2 ? ' selected' : ''}>Hệ số 2 (ĐĐGđk Giữa kì)</option>
          <option value="3"${Number(p.coefficient) === 3 ? ' selected' : ''}>Hệ số 3 (ĐĐGđk Cuối kì)</option>
          <option value="1"${Number(p.coefficient) === 1 ? ' selected' : ''}>Hệ số 1 (ĐĐGtx Thường xuyên)</option>
        </select>
      </div>
      <div class="field span2">
        <label for="ap-form-format">Hình thức kiểm tra</label>
        <input type="text" id="ap-form-format" name="form" value="${esc(p.form || 'Trắc nghiệm khách quan + Tự luận')}" placeholder="Ví dụ: TNKQ kết hợp TL trên máy tính">
      </div>
      <div class="field full">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <label style="margin:0;font-weight:600">Phạm vi bài học PPCT kiểm tra (Phụ lục 3 CV 5512)</label>
          <div style="display:flex;gap:6px">
            <button type="button" class="quiet small" id="btn-select-all-scope" style="font-size:11px;padding:2px 8px">Chọn tất cả</button>
            <button type="button" class="quiet small" id="btn-clear-all-scope" style="font-size:11px;padding:2px 8px">Bỏ chọn</button>
          </div>
        </div>
        <div style="max-height:160px;overflow-y:auto;border:1px solid var(--line);border-radius:6px;padding:8px;background:#fff;display:flex;flex-direction:column;gap:3px">
          ${lessonCheckboxesHtml}
        </div>
      </div>
      <div class="field full">
        <label for="ap-form-scope-desc">Tóm tắt nội dung / Yêu cầu cần đạt kiểm tra</label>
        <textarea id="ap-form-scope-desc" name="scope_description" rows="2" placeholder="Ví dụ: Chủ đề 1, 2, 3: Lịch sử máy tính, Thông tin số & Đạo đức môi trường số">${esc(p.scope_description || '')}</textarea>
      </div>
      <div class="field full">
        <label for="ap-form-notes">Ghi chú</label>
        <input type="text" id="ap-form-notes" name="notes" value="${esc(p.notes || '')}" placeholder="Ghi chú thêm (khung ma trận, hình thức nộp bài...)">
      </div>
    </div>
    <div class="dialog-bottom">
      <button type="button" class="quiet" data-close="edit-dialog">Hủy</button>
      <button type="submit" class="primary">${existing ? 'Lưu cập nhật' : 'Thêm vào KHKTĐG'}</button>
    </div>
  `;

  $('#btn-select-all-scope')?.addEventListener('click', () => {
    document.querySelectorAll('#question-form input[name="scope_lesson"]').forEach(cb => { cb.checked = true; cb.closest('label').style.background = '#F2F0FB'; });
  });
  $('#btn-clear-all-scope')?.addEventListener('click', () => {
    document.querySelectorAll('#question-form input[name="scope_lesson"]').forEach(cb => { cb.checked = false; cb.closest('label').style.background = 'transparent'; });
  });
  document.querySelectorAll('#question-form input[name="scope_lesson"]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('label').style.background = cb.checked ? '#F2F0FB' : 'transparent';
    });
  });

  $('#question-form').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const selectedLessons = [...fd.getAll('scope_lesson')];
    const payload = {
      id: existing ? existing.id : '',
      grade: g,
      subject_name: s,
      name: String(fd.get('name') || '').trim(),
      exam_type: String(fd.get('exam_type') || 'GK1'),
      duration: Number(fd.get('duration') || 45),
      week: String(fd.get('week') || '').trim(),
      period: String(fd.get('period') || '').trim(),
      coefficient: Number(fd.get('coefficient') || 2),
      form: String(fd.get('form') || '').trim(),
      scope_lessons: selectedLessons,
      scope_description: String(fd.get('scope_description') || '').trim(),
      notes: String(fd.get('notes') || '').trim()
    };

    try {
      await ensurePersistedAssessmentPlans(g, s);
    } catch (err) {
      notify(detailError(err), true);
      return;
    }
    if (store.apClearedKeys) store.apClearedKeys.delete(`${g}|${s}`);
    await mutate('/api/assessment-plans/save', { plan: payload }, () => {
      $('#edit-dialog').close();
      renderAssessmentPlans();
      notify(`Đã lưu đợt kiểm tra "${payload.name}" vào KHKTĐG.`);
    });
  };

  $('#edit-dialog').showModal();
}

function createMatrixFromAssessmentPlan(plan) {
  if (!plan) return;
  location.hash = '#matrices';
  if (store.tab !== 'matrices') switchTab('matrices');

  setTimeout(() => {
    if (window.MatrixUI && typeof window.MatrixUI.createFromPlan === 'function') {
      window.MatrixUI.createFromPlan(plan);
      notify(`Đã tạo bản nháp ma trận liên kết KHKTĐG "${plan.name}"!`);
    }
  }, 120);
}

function renderRevisions(){
 const g=effectiveGrade();store.revisionGrade=g;
 const ids=C.revisionIds(questions(),[...store.selected],g),qs=questions().filter(q=>ids.includes(q.id));
 const electiveQs=qs.filter(q=>questionSectionOf(q)==='elective_topic');
 const editingRev=store.editingRevisionId?store.revisions.find(r=>r.id===store.editingRevisionId):null;
 const revFilterG=store.activeGrade==='all'?'all':String(store.activeGrade);
 const revGrades=[...new Set([...availableGrades(),...store.revisions.map(x=>Number(x.grade)).filter(Boolean)])].sort((a,b)=>a-b);
 const shownRevs=store.revisions.filter(r=>revFilterG==='all'||Number(r.grade)===Number(revFilterG));
 const revSummaryText=r=>{
  const list=r.questions||[];
  const mc=list.filter(q=>q.type==='MC').length,yn=list.filter(q=>q.type==='YN').length,sh=list.filter(q=>q.type==='SHORT').length,es=list.filter(q=>q.type==='ES').length;
  return `${mc} Trắc nghiệm${yn?`, ${yn} Đúng/Sai`:''}${sh?`, ${sh} Trả lời ngắn`:''}, ${es} Tự luận`;
 };
 const revSimPct=Math.max(0,Math.min(100,Math.round(Number(store.revisionSimDraft??editingRev?.similarity_target_percent??90))));
 $('#revisions').innerHTML=title('Chuẩn bị ôn tập','Đề cương ôn tập','Lưu một phiên bản nội dung để đối chiếu khi tạo đề. Hỗ trợ Xem toàn bộ trên trang, Import (.docx/.json/.md), Tạo mới, Sửa, Nhân bản và Xóa.',`<button type="button" class="primary" id="import-revision-btn">Import Đề cương (.docx / .json / .md)</button><input type="file" id="import-revision-file" class="json-import" accept=".docx,.json,.md,.txt"><a class="button" href="#bank">Chọn câu trong ngân hàng</a>`)+
 `<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
   <button type="button" class="button quiet" id="rev-download-json-sample" style="color:#4A3AA8;padding:4px 8px;font-size:12px;font-weight:600">Tải mẫu Đề cương (JSON)</button>
   <button type="button" class="button quiet" id="rev-download-md-sample" style="color:#4A3AA8;padding:4px 8px;font-size:12px;font-weight:600">Tải mẫu Đề cương (Markdown)</button>
   <button type="button" class="button quiet" id="rev-copy-prompt" style="color:#4A3AA8;padding:4px 8px;font-size:12px;font-weight:600">Chép Prompt AI tạo Đề cương</button>
 </div>`+
 `<div class="card"><div class="list-toolbar" style="margin-top:0"><h2 style="margin:0">Các phiên bản đề cương đã lưu (${shownRevs.length} / ${store.revisions.length})</h2><div class="actions" style="display:flex;align-items:center;gap:8px"><label for="rev-list-grade-filter" class="small muted" style="font-weight:600">Khối lớp:</label><select id="rev-list-grade-filter" style="min-width:150px;padding:7px 12px;border:1px solid var(--line);border-radius:7px;font-weight:600;background:#fff">${opt('all',`Tất cả khối (${store.revisions.length})`,revFilterG==='all')}${revGrades.map(gr=>opt(gr,`Khối ${gr} (${store.revisions.filter(x=>Number(x.grade)===gr).length})`,String(revFilterG)===String(gr))).join('')}</select></div></div>${shownRevs.length?[...shownRevs].reverse().map(r=>`<article class="saved-item"><div><h3>${esc(r.title)}</h3><p><strong>Khối ${r.grade}</strong> · ${countRecord(r)} câu hỏi (${revSummaryText(r)})${r.similarity_target_percent!=null?` · Tương đồng đề thi: <strong>${r.similarity_target_percent}%</strong>`:''} · ${esc(date(r.updated_at||r.created_at))}</p>${r.source_file?`<p class="q-id">Nguồn: ${esc(r.source_file)}</p>`:''}</div><div class="actions">${revisionLinks(r)}</div></article>`).join(''):empty('Chưa có phiên bản đề cương','Chọn câu ở ngân hàng hoặc Import tệp .docx đề cương.')}</div>`+
 `<div id="revision-coverage" class="card" hidden></div>`+`<div id="revision-inline-viewer" class="card" hidden></div>`+
 `<div class="two-col"><div class="card"><h2>${editingRev?`Sửa phiên bản đề cương: ${esc(editingRev.title||'')}`:'Lưu đề cương mới từ Ngân hàng'}</h2><form id="revision-form"><div class="form-grid"><div class="field"><label for="revision-grade">Khối lớp</label><select id="revision-grade">${gradeOptions(g)}</select></div><div class="field span2"><label for="revision-title">Tên phiên bản</label><input id="revision-title" value="${esc(store.revisionTitleDraft||(editingRev?.title||''))}" placeholder="Ví dụ: Đề cương Giữa HK1 · Khối ${g} · bản 1" required></div></div><div class="callout" style="margin:10px 0;background:#F7F8FB;border-color:var(--line)"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px"><label for="revision-sim-pct" style="font-weight:650;color:var(--navy);margin:0">Mức độ tương đồng mục tiêu với Đề thi (%)</label><div class="actions" style="gap:4px">${[70,80,90,100].map(v=>`<button type="button" class="export-link${revSimPct===v?' primary':''}" data-rev-sim-preset="${v}">${v}%</button>`).join('')}</div></div><div class="sim-slider-wrap"><input id="revision-sim-pct" type="range" min="0" max="100" step="5" value="${esc(revSimPct)}"><input id="revision-sim-pct-num" type="number" min="0" max="100" step="1" value="${esc(revSimPct)}" style="width:74px"><span>%</span><span id="revision-sim-desc" class="small muted">(${revSimPct}% trong đề cương · ${100-revSimPct}% câu mới)</span></div></div><div class="selection-tray"><span><strong>${ids.length}</strong> câu khối ${g} đang được chọn</span><a href="#bank">Điều chỉnh lựa chọn</a></div>${electiveQs.length?`<div class="callout warning" style="margin-bottom:10px">Đang có <strong>${electiveQs.length}</strong> câu thuộc <strong>Chuyên đề học tập (Mục II.2)</strong>. Theo Thông tư 22/2021/TT-BGDĐT Điều 7.1, câu Chuyên đề không dùng trong Đề cương ôn tập kiểm tra định kì. <button type="button" class="export-link" id="revision-remove-elective">Loại câu Chuyên đề khỏi lựa chọn</button></div>`:''}${revisionMatrixPanel(g,qs)}<div class="actions"><button type="button" id="revision-add-filter">Thêm câu đang lọc của khối ${g}</button><button type="button" id="revision-preview-draft"${!ids.length?' disabled':''}>Xem toàn bộ đang chọn</button><button type="button" id="revision-clear" class="quiet">Bỏ chọn khối ${g}</button></div><div class="revision-ids">${qs.length?qs.map(q=>`${isTechId(q.id)?'':`${esc(q.id)} · `}${esc(q.lesson_code)} · ${esc(q.level)} · ${esc(statusNames[q.review_status])}${questionSectionOf(q)==='elective_topic'?' · [CĐHT]':''}`).join('<br>'):'Chưa chọn câu. Dùng khung bốc ngẫu nhiên theo ma trận ở trên hoặc chọn thêm từ Ngân hàng.'}</div><div class="actions"><button type="submit" id="save-revision" class="primary"${!ids.length?' disabled':''}>${editingRev?'Cập nhật đề cương đang sửa':'Lưu phiên bản đề cương'}</button>${editingRev?`<button type="button" id="save-revision-as-new"${!ids.length?' disabled':''}>Lưu thành bản mới</button><button type="button" class="quiet" id="cancel-edit-revision">Hủy sửa</button>`:''}</div></form></div><div class="card"><h2>Giữ đúng nội dung đã chuẩn bị</h2><p class="muted">Phiên bản lưu giữ nội dung câu hỏi tại thời điểm tạo. Nếu sửa một câu trong ngân hàng sau đó, phiên bản cũ vẫn giữ nguyên.</p><div class="callout">Thầy/Cô có thể chọn số câu từng dạng (Trắc nghiệm, Đúng/Sai, Trả lời ngắn, Tự luận), bấm <strong>Bốc ngẫu nhiên</strong> đúng tỉ lệ ma trận rồi thiết lập <strong>mức tương đồng (%)</strong> mong muốn trước khi lưu. ${Number(g)>=10?'Đề cương định kì THPT chỉ lấy câu từ Nội dung cốt lõi (Mục II.1), không đưa bài Chuyên đề học tập.':''}</div><p class="small muted">Bấm <strong>Xem toàn bộ</strong> ở bất kì đề cương nào phía trên để xem đầy đủ bảng giới hạn kiến thức, toàn bộ câu hỏi và chỉnh sửa trực tiếp ngay trên trang web.</p></div></div>`;
 const btnRevJson = $('#rev-download-json-sample');
 if (btnRevJson) btnRevJson.onclick = () => downloadRevisionJsonSample(effectiveGrade());
 const btnRevMd = $('#rev-download-md-sample');
 if (btnRevMd) btnRevMd.onclick = () => downloadRevisionMdSample(effectiveGrade());
 const btnRevPrompt = $('#rev-copy-prompt');
 if (btnRevPrompt) btnRevPrompt.onclick = () => copyRevisionAiPrompt(effectiveGrade());

 $('#import-revision-btn').onclick=()=>$('#import-revision-file').click();
 $('#import-revision-file').onchange=async ev=>{
  const file=ev.target.files?.[0];if(!file)return;
  const ext=file.name.toLowerCase().split('.').pop();
  try{
   if(ext==='md'||ext==='txt'||ext==='json'){
     // Thêm câu của tệp vào Ngân hàng (Nháp; câu đã có thì dùng lại) rồi lập đề cương — một lần ghi.
     const text=await file.text();
     const s=store.selectedSubject||store.ppctSubject||'Tin học';
     let g=effectiveGrade(),title=file.name.replace(/\.[^/.]+$/, '').replace(/^[_-]+/, ''),qs=[];
     if(ext==='json'){
       const data=JSON.parse(text);const revData=data.revision||data;
       g=Number(revData.grade)||g;title=revData.title||title;
       qs=Array.isArray(revData.questions)?revData.questions:(Array.isArray(data)?data:[]);
     }else{
       qs=(typeof window.parseQuestionsFromRawText==='function'?window.parseQuestionsFromRawText(text,g,s):[]);
     }
     if(!qs.length){notify('Không tìm thấy câu hỏi hợp lệ trong tệp. Bấm "Tải mẫu Đề cương (JSON / Markdown)" để xem định dạng.',true);return;}
     await mutate('/api/revisions/import',{title:title||`Đề cương ôn tập Khối ${g}`,grade:g,questions:qs.map(q=>({...q,grade:Number(q.grade)||g,subject_name:s}))},async res=>{
       await load();
       store.activeRevisionViewId=res.revision?.id;
       renderRevisions();
       const rep=res.import_report||{};
       notify(`Đã nhập đề cương "${res.revision?.title}" (${res.revision?.question_count||0} câu): ${rep.added||0} câu mới thêm vào Ngân hàng ở trạng thái Nháp, ${rep.reused||0} câu đã có sẵn.${rep.added?' Hãy duyệt các câu mới trước khi tạo đề chính thức.':''}`);
     });
   }else{
     const b64=await fileToBase64(file);
     await mutate('/api/revisions/import-file',{filename:file.name,content_base64:b64},res=>{
      if(res.revisions)store.revisions=res.revisions;else if(res.revision)store.revisions.push(res.revision);
      store.activeRevisionViewId=res.revision?.id;
      renderRevisions();
      notify(`Đã import đề cương "${res.revision?.title||file.name}" (${res.revision?.question_count||0} câu).`);
     });
   }
  }catch(err){notify(err.message,true);}finally{ev.target.value='';}
 };
 $('#revision-grade').onchange=e=>{store.revCounts={};store.revTypeCounts={};store.revFlexibleUserSet=false;setActiveGrade(Number(e.target.value));};
 const revFilterSel=$('#rev-list-grade-filter');
 if(revFilterSel)revFilterSel.onchange=e=>{setActiveGrade(e.target.value||'all');};
 bindRevisionMatrixPanel(g);
 if($('#revision-remove-elective'))$('#revision-remove-elective').onclick=()=>{electiveQs.forEach(q=>store.selected.delete(q.id));renderRevisions();notify(`Đã loại ${electiveQs.length} câu Chuyên đề học tập khỏi lựa chọn đề cương.`);};
 $('#revision-title').oninput=e=>{store.revisionTitleDraft=e.target.value;};
 const revSimRange=$('#revision-sim-pct'),revSimNum=$('#revision-sim-pct-num');
 const applyRevSim=v=>{
  const pct=Math.max(0,Math.min(100,Math.round(Number(v)||0)));
  store.revisionSimDraft=pct;
  if(revSimRange)revSimRange.value=pct;
  if(revSimNum)revSimNum.value=pct;
  if($('#revision-sim-desc'))$('#revision-sim-desc').textContent=`(${pct}% trong đề cương · ${100-pct}% câu mới)`;
  document.querySelectorAll('[data-rev-sim-preset]').forEach(btn=>btn.classList.toggle('primary',Number(btn.dataset.revSimPreset)===pct));
 };
 if(revSimRange)revSimRange.oninput=()=>applyRevSim(revSimRange.value);
 if(revSimNum)revSimNum.oninput=()=>applyRevSim(revSimNum.value);
 document.querySelectorAll('[data-rev-sim-preset]').forEach(btn=>{btn.onclick=()=>applyRevSim(btn.dataset.revSimPreset);});
 $('#revision-add-filter').onclick=()=>{const list=filtered().filter(q=>q.grade===g&&q.review_status!=='archived');const coreList=list.filter(q=>questionSectionOf(q)!=='elective_topic');const skipped=list.length-coreList.length;coreList.forEach(q=>store.selected.add(q.id));renderRevisions();if(skipped)notify(`Đã thêm ${coreList.length} câu cốt lõi; bỏ qua ${skipped} câu Chuyên đề học tập (TT 22/2021 Điều 7.1).`,true);};
 $('#revision-preview-draft').onclick=()=>openRevisionViewer({title:$('#revision-title').value.trim()||`Đề cương dự kiến · Khối ${g}`,grade:g,questions:qs},false);
 $('#revision-clear').onclick=()=>{questions().filter(q=>q.grade===g).forEach(q=>store.selected.delete(q.id));renderRevisions();};
 if($('#cancel-edit-revision'))$('#cancel-edit-revision').onclick=()=>{store.editingRevisionId=null;store.revisionTitleDraft='';store.revisionSimDraft=undefined;renderRevisions();};
 const getRevSim=()=>Math.max(0,Math.min(100,Math.round(Number(store.revisionSimDraft??editingRev?.similarity_target_percent??90))));
 if($('#save-revision-as-new'))$('#save-revision-as-new').onclick=async()=>{
  const title=$('#revision-title').value.trim();if(!title)return;
  await mutate('/api/revisions/save',{title,grade:g,question_ids:ids,similarity_target_percent:getRevSim()},async result=>{store.revisions=result.revisions||[...store.revisions,result.revision];store.editingRevisionId=null;store.revisionTitleDraft='';store.revisionSimDraft=undefined;renderRevisions();notify('Đã lưu thành phiên bản đề cương mới.');});
 };
 $('#revision-form').onsubmit=async e=>{
  e.preventDefault();const title=$('#revision-title').value.trim();if(!title)return;
  const similarity_target_percent=getRevSim();
  if(editingRev){
   await mutate('/api/revisions/update',{id:editingRev.id,title,grade:g,question_ids:ids,similarity_target_percent},async result=>{
    if(result.revisions)store.revisions=result.revisions;
    else{const idx=store.revisions.findIndex(x=>x.id===editingRev.id);if(idx>=0)store.revisions[idx]=result.revision;}
    store.editingRevisionId=null;store.revisionTitleDraft='';store.revisionSimDraft=undefined;renderRevisions();notify('Đã cập nhật phiên bản đề cương.');
   });
  }else{
   await mutate('/api/revisions/save',{title,grade:g,question_ids:ids,similarity_target_percent},async result=>{store.revisions=result.revisions||[...store.revisions,result.revision];store.revisionTitleDraft='';store.revisionSimDraft=undefined;renderRevisions();notify('Đã lưu phiên bản đề cương. Có thể xuất Word hoặc dùng khi tạo đề.');});
  }
 };
 const activeRev=store.revisions.find(r=>r.id===store.activeRevisionViewId)||store.revisions[0];
 if(activeRev)renderRevisionCoverage(activeRev);
 if(activeRev&&$('#revision-inline-viewer')){
  $('#revision-inline-viewer').hidden=false;
  mountRevisionViewerContent($('#revision-inline-viewer'),activeRev,Boolean(store.activeRevisionShowAnswers),true);
 }
}
// Đối chiếu đề thi ↔ đề cương (chỉ đọc): câu nào của đề đã có trong đề cương, câu nào chưa, tỉ lệ theo câu và điểm, phủ YCCĐ.
async function renderRevisionCoverage(rev){
 const box=$('#revision-coverage');if(!box)return;
 const exams=store.exams.filter(e=>(e.subject_name||'Tin học')===subject()&&Number(e.grade)===Number(rev.grade)&&(e.questions||[]).length);
 if(!exams.length){box.hidden=false;box.innerHTML=`<h3 style="margin-top:0">Đối chiếu đề thi với đề cương "${esc(rev.title)}"</h3><p class="muted">Khối ${esc(rev.grade)} chưa có đề thi nào để đối chiếu. Tạo đề ở màn hình "Tạo đề kiểm tra" rồi quay lại đây.</p>`;return;}
 const linked=exams.filter(e=>e.revision_id===rev.id);
 const chosen=exams.find(e=>e.id===store.revCoverageExamId)||linked[0]||exams[0];
 box.hidden=false;box.innerHTML=`<h3 style="margin-top:0">Đối chiếu đề thi với đề cương "${esc(rev.title)}"</h3><p class="muted">Đang đối chiếu…</p>`;
 let rep;try{rep=(await request('/api/revisions/coverage',{revision_id:rev.id,exam_id:chosen.id})).reports[0];}catch(err){box.innerHTML=`<div class="callout warning">${esc(detailError(err))}</div>`;return;}
 if(store.activeRevisionViewId&&store.activeRevisionViewId!==rev.id)return;
 const ok=rep.in_revision>=rep.required;
 const missing=rep.items.filter(x=>!x.in_revision),present=rep.items.filter(x=>x.in_revision);
 const row=x=>`<tr><td><strong>${esc(x.label)}</strong></td><td>${esc(x.lesson_code)}</td><td>${esc(x.level)}</td><td style="text-align:right">${esc(String(x.points).replace('.',','))}</td><td>${esc(x.question)}</td><td>${x.in_revision?'✓ có trong đề cương':x.similar_text?'Gần giống (nội dung lời dẫn trùng, phương án/đáp án khác)':x.outcome_in_revision?'Chưa có câu này; YCCĐ đã có trong đề cương':'<strong>Chưa có câu và YCCĐ</strong>'}</td></tr>`;
 const table=list=>`<div class="table-wrap"><table class="small"><thead><tr><th>Câu</th><th>Bài</th><th>Mức độ</th><th>Điểm</th><th>Nội dung</th><th>Đề cương</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`;
 box.innerHTML=`<h3 style="margin-top:0">Đối chiếu đề thi với đề cương "${esc(rev.title)}"</h3>
  <div class="field" style="max-width:520px"><label for="rev-cov-exam">Đề thi</label><select id="rev-cov-exam">${exams.map(e=>`<option value="${esc(e.id)}"${e.id===chosen.id?' selected':''}>${esc(e.title||e.id)}${e.exam_code?' · Mã '+esc(e.exam_code):''}${e.revision_id===rev.id?' (gắn với đề cương này)':''}</option>`).join('')}</select></div>
  <div class="kg-stats" style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0">
   <div class="callout ${ok?'':'warning'}" style="margin:0"><strong>${rep.in_revision}/${rep.total} câu</strong> có trong đề cương (${String(rep.count_percent).replace('.',',')}%) · cần ít nhất ${rep.required} câu (${rep.threshold}%)</div>
   <div class="callout" style="margin:0">Theo điểm: <strong>${String(rep.points_percent).replace('.',',')}%</strong></div>
   <div class="callout ${rep.outcome_percent<100?'warning':''}" style="margin:0">Câu có YCCĐ trong đề cương: <strong>${String(rep.outcome_percent).replace('.',',')}%</strong></div>
  </div>
  ${rep.in_revision>rep.required?`<div class="callout" style="margin:10px 0"><strong>Đề cương đang chứa ${rep.in_revision}/${rep.total} câu của đề (${String(rep.count_percent).replace('.',',')}%).</strong> Quy định yêu cầu ít nhất ${rep.threshold}% (${rep.required} câu). Muốn đề cương chỉ chứa đúng ${rep.required} câu của đề, bấm nút dưới: ứng dụng bớt ${rep.in_revision-rep.required} câu của đề khỏi đề cương, ưu tiên câu mà YCCĐ vẫn còn câu khác trong đề cương.<div class="actions" style="margin-top:8px"><button type="button" class="primary" id="rev-trim-to-exam">Bớt ${rep.in_revision-rep.required} câu để đề cương còn ${rep.threshold}% nội dung đề</button></div></div>`:''}
  ${missing.length?`<h4>Câu của đề CHƯA có trong đề cương (${missing.length})</h4>${table(missing)}`:'<p class="badge approved">Mọi câu của đề đều có trong đề cương.</p>'}
  ${rep.missing_outcomes.length?`<p class="small"><strong>YCCĐ của đề chưa có trong đề cương:</strong> ${rep.missing_outcomes.map(esc).join('; ')}</p>`:''}
  ${present.length?`<details><summary>Câu đã có trong đề cương (${present.length})</summary>${table(present)}</details>`:''}
  <p class="small muted">Chỉ xem, không thay đổi dữ liệu. "Có trong đề cương" nghĩa là trùng nội dung câu hỏi, phương án và đáp án (kể cả khi đã trộn mã đề).</p>`;
 $('#rev-cov-exam').onchange=e=>{store.revCoverageExamId=e.target.value;renderRevisionCoverage(rev);};
 if($('#rev-trim-to-exam'))$('#rev-trim-to-exam').onclick=async()=>{
  const n=rep.in_revision-rep.required;
  if(!confirm(`Bớt ${n} câu của đề "${chosen.title||chosen.id}" khỏi đề cương "${rev.title}" để đề cương còn ${rep.threshold}% nội dung đề?\nCác câu bị bớt vẫn còn trong Ngân hàng; có thể thêm lại sau.`))return;
  await mutate('/api/revisions/trim-to-exam',{revision_id:rev.id,exam_id:chosen.id,percent:rep.threshold},res=>{
   if(res.revisions)store.revisions=res.revisions;
   store.activeRevisionViewId=res.revision.id;store.revCoverageExamId=chosen.id;
   renderRevisions();
   const list=(res.removed||[]).map(q=>`- ${q.lesson_code} · ${q.level} · ${q.question}${q.outcome_still_covered?'':' (YCCĐ này không còn câu nào trong đề cương)'}`).join('\n');
   notify(`${res.new_version?`Đề cương cũ đã khóa nên đã lưu phiên bản mới "${res.revision.title}". `:''}Đã bớt ${res.removed.length} câu; đề cương giờ chứa ${res.kept}/${res.total} câu của đề.\n${list}`);
  });
 };
}
function startEditRevision(id){
 const r=store.revisions.find(x=>x.id===id);if(!r)return;
 store.editingRevisionId=r.id;
 setActiveGrade(Number(r.grade),{skipRender:true});
 store.revisionTitleDraft=r.title;
 store.revisionSimDraft=r.similarity_target_percent??90;
 questions().filter(q=>q.grade===Number(r.grade)).forEach(q=>store.selected.delete(q.id));
 (r.question_ids||(r.questions||[]).map(q=>q.id)).forEach(qid=>{if(qid)store.selected.add(qid);});
 renderRevisions();
 $('#revision-form')?.scrollIntoView({behavior:'smooth',block:'start'});
 notify(`Đã nạp ${countRecord(r)} câu hỏi của đề cương "${r.title}" lên khung chỉnh sửa.`);
}
async function duplicateRevision(id){
 const r=store.revisions.find(x=>x.id===id);if(!r)return;
 try{
  const res=await request('/api/revisions/duplicate',{id});
  if(res.revisions)store.revisions=res.revisions;else if(res.revision)store.revisions.push(res.revision);
 }catch{
  const qids=r.question_ids||(r.questions||[]).map(q=>q.id);
  const res=await request('/api/revisions/save',{title:`${r.title} (Bản sao)`,grade:Number(r.grade),question_ids:qids});
  if(res.revision)store.revisions.push(res.revision);
 }
 renderRevisions();notify('Đã nhân bản phiên bản đề cương.');
}
async function deleteRevision(id){
 const r=store.revisions.find(x=>x.id===id);if(!r||!confirm(`Xóa phiên bản đề cương "${r.title}"?`))return;
 await mutate('/api/revisions/delete',{id},result=>{
  store.revisions=result.revisions||store.revisions.filter(x=>x.id!==id);
  if(store.editingRevisionId===id){store.editingRevisionId=null;store.revisionTitleDraft='';}
  renderRevisions();notify('Đã xóa phiên bản đề cương.');
 });
}
function usableMatrices(grade,period){return (store.matrixRecords||[]).filter(m=>inDraftSubject(m)&&m.status==='locked'&&Number(m.grade)===Number(grade)&&(!period||m.exam_type===period));}
function examSourcePayload(){const d=store.examDraft;return d.matrix_id?{matrix_id:d.matrix_id}:d.template_id?{template_id:d.template_id,blueprint:selectedTemplate()?.rows||[]}:{blueprint:d.blueprint};}
function examNormLesson(c){return String(c||'').trim().toUpperCase().replace(/^BÀI\s*/i,'B').replace(/\s+/g,'').replace(/^B0+(\d)/,'B$1');}
function examNormLevel(lv){return ({'nhận biết':'Biết','biết':'Biết','thông hiểu':'Hiểu','hiểu':'Hiểu','vận dụng':'Vận dụng','vận dụng thấp':'Vận dụng','vd':'Vận dụng','vận dụng cao':'Vận dụng cao','vdc':'Vận dụng cao'}[String(lv||'').trim().toLowerCase()]||String(lv||'').trim());}
function examTypeLabel(t){return ({MC:'Trắc nghiệm',YN:'Đúng/Sai',SHORT:'Trả lời ngắn',ES:'Tự luận'}[String(t||'').toUpperCase()]||t);}
function flexCountForCell(grade,lessonCode,type,level){
 const g=Number(grade),lc=examNormLesson(lessonCode),tp=String(type||'').trim().toUpperCase(),lv=examNormLevel(level);
 const seen=new Set();let count=0;
 questions().forEach(q=>{
  if(!q||q.review_status==='archived'||!String(q.question||'').trim())return;
  if(Number(q.grade)!==g||examNormLesson(q.lesson_code)!==lc||String(q.type||'').trim().toUpperCase()!==tp||examNormLevel(q.level)!==lv)return;
  if(tp==='MC'&&!(Array.isArray(q.options)&&q.options.length>=2&&Number.isInteger(Number(q.correct))&&Number(q.correct)>=0&&Number(q.correct)<q.options.length))return;
  const qt=String(q.question||'').normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ');
  if(seen.has(qt))return;
  seen.add(qt);count++;
 });
 return count;
}
// Ô ma trận do máy chủ tính (đúng nguồn, có YCCĐ và số câu đã duyệt); lưu đệm theo nội dung yêu cầu.
function ensurePlan(name,payload,rerender){store.plans=store.plans||{};const sig=JSON.stringify(payload),cur=store.plans[name];if(cur&&cur.sig===sig)return cur;store.plans[name]={sig,loading:true};request('/api/revisions/propose',payload).then(data=>{if(store.plans[name]?.sig===sig){store.plans[name]={sig,data};rerender();}}).catch(err=>{if(store.plans[name]?.sig===sig){store.plans[name]={sig,error:detailError(err)};rerender();}});return store.plans[name];}
function examPlan(){const d=store.examDraft;if(!d.matrix_id)return null;return ensurePlan('exam',{grade:Number(d.grade),exam_type:d.exam_type,matrix_id:d.matrix_id},()=>{if(store.tab==='exams')renderExams();});}
function planRows(plan){const rows=[];(plan?.cells||[]).forEach(c=>{const by={};(c.points||[]).forEach(v=>{by[v]=(by[v]||0)+1;});Object.entries(by).forEach(([v,n])=>rows.push({lesson_code:c.lesson_code,type:c.type,level:c.level,count:n,points_per_question:Number(v),outcomes:c.outcomes}));});return rows;}
function cellPoints(c){return Math.round((c.points||[]).reduce((n,v)=>n+Number(v),0)*100)/100;}
// Bảng ma trận để đối chiếu: mỗi dòng một ô (bài · dạng · mức độ · YCCĐ). extra(c) thêm các cột riêng của từng màn hình.
function planTable(plan,head,extra,opts){if(!plan)return '';if(plan.loading)return '<p class="small muted">Đang đọc ma trận…</p>';if(plan.error)return `<div class="callout warning">${esc(plan.error)}</div>`;const flex=Boolean(opts?.flexible),g=opts?.grade??store.examDraft?.grade;const cells=plan.data.cells;return `<div class="table-wrap"><table class="plan-table"><thead><tr><th>Bài</th><th>Dạng</th><th>Mức độ</th><th>YCCĐ</th><th>Số câu / đề</th><th>Điểm</th><th>${flex?'Câu khả dụng (linh hoạt)':'Câu đã duyệt'}</th>${head||''}</tr></thead><tbody>${cells.map(c=>{const avail=flex?flexCountForCell(g,c.lesson_code,c.type,c.level):c.available;const badgeTxt=flex?(avail<c.need?`${avail} · thiếu ${c.need-avail}`:`${avail} (đã duyệt: ${c.available})`):`${c.available}${c.available<c.need?` · thiếu ${c.need-c.available}`:''}`;return `<tr><td>${esc(c.lesson_code)}</td><td>${esc(examTypeLabel(c.type))}</td><td>${esc(c.level)}</td><td class="small">${c.outcomes.length?c.outcomes.map(esc).join('<br>'):'<span class="muted">Mọi YCCĐ của bài</span>'}</td><td>${c.need}</td><td>${cellPoints(c)}</td><td><span class="badge${avail<c.need?' draft':(flex?' approved':'')}">${badgeTxt}</span></td>${extra?extra(c):''}</tr>`;}).join('')}</tbody><tfoot><tr><th colspan="4">Tổng</th><th>${cells.reduce((n,c)=>n+c.need,0)}</th><th>${Math.round(cells.reduce((n,c)=>n+cellPoints(c),0)*100)/100}</th><th></th>${head?'<th colspan="9"></th>':''}</tr></tfoot></table></div>`;}
function defaultRevCount(c,maxAvail){const cap=maxAvail!==undefined?maxAvail:c.available;return Math.min(cap,Math.ceil(c.need*1.5));}
function matchingTemplates(){const d=store.examDraft;return store.templates.filter(t=>inDraftSubject(t)&&Number(t.grade)===Number(d.grade)&&t.exam_type===d.exam_type);}
function chooseExamTemplate(){const d=store.examDraft;d.matrix_id=usableMatrices(d.grade,d.exam_type)[0]?.id||'';d.template_id=d.matrix_id?'':matchingTemplates()[0]?.id||'';const avail=instructionalLessons(d.grade,undefined,{includeElective:d.exam_type==='TX'});d.blueprint=d.template_id?[]:[{lesson_code:avail[0]?.lesson_code||'',type:'MC',level:'Biết',count:10,points_per_question:1}];}
function selectedTemplate(){return store.templates.find(t=>t.id===store.examDraft.template_id);}
function examRows(){if(store.examDraft.matrix_id)return planRows(examPlan()?.data);return selectedTemplate()?.rows||store.examDraft.blueprint;}
const examStatusNames={drafting:'Đang soạn',pending_approval:'Chờ duyệt',locked:'Đã duyệt & khóa',published:'Đã phát hành'};
const examActionNames={submit:'Gửi duyệt đề',approve:'Duyệt & khóa đề',return:'Trả lại đề',publish:'Phát hành đề',new_revision:'Tạo bản chỉnh sửa mới'};
function wizardNav(activeStep=3){
 const steps=[
  {n:1,title:'1. Khóa Ma trận',tab:'matrices',desc:'Khóa số câu & YCCĐ'},
  {n:2,title:'2. Lập Đề cương',tab:'revisions',desc:'Phủ 100% YCCĐ'},
  {n:3,title:'3. Tạo Bộ đề',tab:'exams',desc:'Tỷ lệ bám sát ≥ 90%'},
  {n:4,title:'4. Khóa cả bộ',tab:'exams',desc:'Khóa đồng thời bộ đề'},
  {n:5,title:'5. Phát hành',tab:'exams',desc:'Đề cương → Bộ đề'},
  {n:6,title:'6. Xuất bản & Hoán vị',tab:'exams',desc:'Mã 101–104 & Word/PDF'}
 ];
 return `<div class="card wizard-nav-card" style="margin-bottom:16px;padding:12px 16px;background:#F7F8FB;border:1px solid #D5D9E4;border-radius:8px">`+
  `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">`+
   `<strong style="color:var(--navy,#1C2333);font-size:13px">QUY TRÌNH RA ĐỀ CHUẨN 6 BƯỚC (MỐC C1)</strong>`+
   `<span class="small muted">Trình tự nghiệp vụ: Ma trận → Đề cương → Bộ đề → Khóa cả bộ → Phát hành → Xuất bản</span>`+
  `</div>`+
  `<div class="wizard-steps-grid" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">`+
   steps.map(s=>{
    const isActive=s.n===activeStep;
    const isPast=s.n<activeStep;
    const bg=isActive?'var(--brand,#4A3AA8)':(isPast?'#E4E7F0':'#F3F4F8');
    const color=isActive?'#fff':(isPast?'#2E3646':'#5B6475');
    const border=isActive?'var(--brand,#4A3AA8)':'#D5D9E4';
    return `<a href="#${s.tab}" class="wizard-step-pill" style="display:block;text-decoration:none;padding:6px 8px;border-radius:6px;background:${bg};color:${color};border:1px solid ${border};text-align:center;font-size:12px;transition:all .15s">`+
     `<div style="font-weight:700;white-space:nowrap">${esc(s.title)}</div>`+
     `<div style="font-size:10px;opacity:.9;margin-top:2px">${esc(s.desc)}</div>`+
    `</a>`;
   }).join('')+
  `</div></div>`;
}

function examLifecycle(r){
 const s=C.examStatusOf(r),last=(r.lifecycle||[]).slice(-1)[0],reused=(r.reuse_check?.warnings||[]).length;
 const isSet=Boolean(r.exam_set?.id);
 let setBtns='';
 if(isSet){
  const setExams=store.exams.filter(x=>x.exam_set?.id===r.exam_set.id);
  const allStatus=new Set(setExams.map(x=>C.examStatusOf(x)));
  if(allStatus.size===1){
   const commonSt=[...allStatus][0];
   if(commonSt==='pending_approval')setBtns=`<button type="button" class="export-link primary" data-set-act="approve" data-set-id="${esc(r.exam_set.id)}" title="Khóa đồng thời tất cả ${setExams.length} đề trong bộ">Khóa cả bộ (${setExams.length} đề)</button>`;
   else if(commonSt==='drafting')setBtns=`<button type="button" class="export-link" data-set-act="submit" data-set-id="${esc(r.exam_set.id)}" title="Gửi duyệt tất cả ${setExams.length} đề trong bộ">Gửi duyệt cả bộ</button>`;
   else if(commonSt==='locked')setBtns=`<button type="button" class="export-link primary" data-set-act="publish" data-set-id="${esc(r.exam_set.id)}" title="Phát hành tất cả ${setExams.length} đề trong bộ">Phát hành cả bộ</button>`;
  }
 }
 return `<div class="exam-lifecycle">`+
  (isSet?`<span class="badge" style="background:#ECE9F9;color:#4A3AA8;border:1px solid #D6D1F2">Bộ đề: ${esc(r.exam_set.title||String(r.title||'').replace(/\s*—\s*Đề\s*\d+$/,''))} (${r.exam_set.index||'?'}/${r.exam_set.exam_ids?.length||r.exam_set.count||store.exams.filter(x=>x.exam_set?.id===r.exam_set.id).length})</span>`:'')+
  `<span class="badge exam-${s}">${esc(examStatusNames[s])}</span>`+
  (reused?`<span class="badge draft" title="Câu đã có trong đề phát hành ${esc(r.reuse_check.days)} ngày gần đây; chỉ là cảnh báo">${reused} câu vừa dùng</span>`:'')+
  (last?`<span class="small muted">${esc(last.at?.slice(0,16).replace('T',' ')||'')} · ${esc(last.by||'')}${last.reason?' — '+esc(last.reason):''}</span>`:'')+
  C.examActions(r).map(a=>`<button type="button" class="export-link${a==='approve'||a==='publish'?' primary':''}" data-exam-act="${a}" data-exam-id="${esc(r.id)}">${esc(examActionNames[a])}</button>`).join('')+
  setBtns+
 `</div>`;
}
async function examAct(id,action){
 const payload={id,action};
 if(action==='return'){const reason=prompt('Lý do trả lại đề (bắt buộc):');if(!reason||!reason.trim())return notify('Khi trả lại đề phải ghi lý do.',true);payload.reason=reason.trim();}
 if(action==='publish'&&!confirm('Phát hành đề? Sau khi phát hành, đề được giữ nguyên và ghi nhận lịch sử sử dụng câu hỏi.'))return;
 const done=await mutate('/api/exams/transition',payload,result=>{store.exams=result.exams||store.exams;});
 if(done){notify({submit:'Đã gửi duyệt đề.',approve:'Đã duyệt và khóa đề.',return:'Đã trả lại đề.',publish:'Đã phát hành đề.',new_revision:'Đã tạo bản chỉnh sửa mới (đang soạn).'}[action]);renderExams();}
}
async function examSetAct(setId,action){
 const payload={set_id:setId,action};
 if(action==='return'){const reason=prompt('Lý do trả lại toàn bộ đề trong bộ (bắt buộc):');if(!reason||!reason.trim())return notify('Khi trả lại đề phải ghi lý do.',true);payload.reason=reason.trim();}
 if(action==='publish'&&!confirm('Phát hành toàn bộ các đề trong bộ đề này? Sau khi phát hành, đề được giữ nguyên nội dung và ghi nhận lịch sử câu hỏi.'))return;
 const done=await mutate('/api/exams/set/transition',payload,result=>{store.exams=result.exams_all||store.exams;});
 if(done){notify({submit:'Đã gửi duyệt toàn bộ các đề trong bộ.',approve:'Đã duyệt và khóa toàn bộ các đề trong bộ đề.',return:'Đã trả lại toàn bộ các đề trong bộ.',publish:'Đã phát hành toàn bộ các đề trong bộ đề.'}[action]);renderExams();}
}
async function revisionAct(id,action){
 const payload={id,action};
 if(action==='publish'&&!confirm('Phát hành đề cương ôn tập cho học sinh? Đề cương chỉ nên phát hành sau khi các đề kiểm tra căn cứ đã được duyệt và khóa.'))return;
 const done=await mutate('/api/revisions/transition',payload,result=>{store.revisions=result.revisions||store.revisions;});
 if(done){notify({publish:'Đã phát hành đề cương ôn tập cho học sinh.',lock:'Đã khóa đề cương ôn tập.',unlock:'Đã mở khóa đề cương.'}[action]);renderRevisions();}
}
function examLinks(r){
 const base='/api/exams/'+encodeURIComponent(r.id)+'/export',ans=store.canViewAnswers!==false,editable=C.examEditable(r);
 return examLifecycle(r)+`<div class="card-actions">`+
  `<button type="button" class="export-link primary" data-view-exam="${esc(r.id)}" data-mode="student">Xem toàn bộ đề</button>`+
  `<button type="button" class="button" data-export-spec-to-matrix="${esc(r.id)}" style="background:#4A3AA8;color:#fff;border-color:#4A3AA8;font-weight:700">Trích xuất sang Bảng 2 Đặc tả</button>`+
  `<button type="button" class="button" data-open-custom-export="${esc(r.id)}" style="background:#4A3AA8;color:#fff;border-color:#4A3AA8;font-weight:700">Tùy biến xuất hồ sơ</button>`+
  `<button type="button" data-compare-exam="${esc(r.id)}">So sánh với đề khác</button>`+
  `<details class="dropdown-menu"><summary>Tải về ▾</summary><div class="dropdown-content">`+
   (ans?`<a href="/api/exams/${esc(r.id)}/bundle.zip?format=docx" style="font-weight:bold;color:var(--brand,#4A3AA8)">Tải trọn bộ Hồ sơ Word (.zip)</a>`+
   `<a href="/api/exams/${esc(r.id)}/bundle.zip?format=pdf">Tải trọn bộ Hồ sơ PDF (.zip)</a>`+
   `<hr>`:'')+
   `<a href="${base}?format=docx&answers=0">Word học sinh</a>`+
   `<a href="${base}?format=pdf&answers=0">PDF học sinh</a>`+
   `<a href="${base}?format=tex&answers=0">LaTeX đề thi (.tex)</a>`+
   `<a href="${base}?format=html&answers=0" target="_blank" rel="noopener">Trang in đề thi</a>`+
   (ans&&(r.parent_exam_id||store.exams.some(x=>x.parent_exam_id===r.id))?`<a href="/api/exams/${esc(r.id)}/mapping.docx">Bảng đối chiếu mã đề (.docx)</a>`:'')+
   (ans?`<hr><a href="${base}?format=docx&answers=1">Word đáp án & HDC</a>`+
   `<a href="${base}?format=pdf&answers=1">PDF đáp án & HDC</a>`+
   `<a href="${base}?format=tex&answers=1">LaTeX đáp án (.tex)</a>`+
   `<a href="${base}?format=docx&target=lms">Tệp upload LMS (.docx)</a>`+
   `<a href="${base}?format=html&answers=1" target="_blank" rel="noopener">Trang in đáp án</a>`+
   `<a href="${base}?format=json&answers=1">Tải tệp JSON</a>`:'<p class="small muted">Tài khoản này không có quyền tải đáp án.</p>')+
  `</div></details>`+
  `<details class="dropdown-menu"><summary>Thao tác ▾</summary><div class="dropdown-content">`+
   `<button type="button" data-view-exam="${esc(r.id)}" data-mode="verify">Đối chiếu Ma trận</button>`+
   (ans?`<button type="button" data-view-exam="${esc(r.id)}" data-mode="answers">Xem đáp án & HDC</button>`:'')+
   (editable?`<button type="button" data-edit-exam="${esc(r.id)}">Sửa thông tin đề</button>`:'')+
   `<button type="button" data-dup-exam="${esc(r.id)}">Nhân bản đề</button>`+
   `<button type="button" data-permute-exam="${esc(r.id)}">Trộn mã đề (2–6 mã)</button>`+
   `<button type="button" data-load-exam="${esc(r.id)}">Nạp cấu hình tạo đề</button>`+
   (editable?`<hr><button type="button" class="danger" data-del-exam="${esc(r.id)}">Xóa đề kiểm tra</button>`:'<p class="small muted">Đề đã khóa: không sửa, không xóa. Muốn sửa hãy tạo bản chỉnh sửa mới.</p>')+
  `</div></details>`+
  (editable?`<button type="button" class="export-link danger" data-del-exam="${esc(r.id)}" title="Xóa đề nháp này">Xóa</button>`:'')+
 `</div>`;
}
function openExamComparison(id){
 const dialog=$('#exam-comparison-dialog'),form=$('#exam-comparison-form'),result=$('#exam-comparison-result');
 const exams=currentExams();
 form.innerHTML='<p>Chọn 2–6 đề đã lưu. Báo cáo chỉ đối chiếu cấu trúc theo câu, chưa đánh giá độ khó thực nghiệm.</p>'+
  '<fieldset><legend>Các đề cần so sánh</legend>'+exams.map(e=>`<label style="display:block"><input type="checkbox" name="comparison-exam" value="${esc(e.id)}" ${e.id===id?'checked':''}> ${esc(e.title||e.id)} · Khối ${esc(e.grade)} · ${esc(e.exam_code||e.id)}</label>`).join('')+
  '</fieldset><p id="exam-comparison-error" role="alert" class="error" hidden></p><button type="submit" class="primary">So sánh các đề đã chọn</button>';
 result.innerHTML='';
 form.onsubmit=async event=>{
  event.preventDefault();
  const ids=[...form.querySelectorAll('input[name="comparison-exam"]:checked')].map(el=>el.value);
  const error=$('#exam-comparison-error'),button=form.querySelector('button[type="submit"]');
  error.hidden=true;result.innerHTML='';
  if(ids.length<2||ids.length>6){error.textContent='Chọn từ 2 đến 6 đề khác nhau để so sánh.';error.hidden=false;return;}
  button.disabled=true;button.textContent='Đang đối chiếu…';
  try{const report=await request('/api/exams/compare',{ids});result.innerHTML=window.BankExamComparison.reportHtml(report);}
  catch(e){error.textContent=detailError(e);error.hidden=false;}
  finally{button.disabled=false;button.textContent='So sánh các đề đã chọn';}
 };
 dialog.showModal();
}
function renderExams(){
 // A newly added first lesson must also become the value behind the visible selector.
 if(typeof store.activeGrade==='number'&&store.examDraft&&Number(store.examDraft.grade)!==store.activeGrade){
  store.examDraft.grade=store.activeGrade;
  store.examDraft.revision_id='';
  store.examDraft.matrix_id='';
  store.examDraft.template_id='';
  store.examDraft.flexible_mode=false;
  store.examDraft.flexible_mode_user_set=false;
  chooseExamTemplate();
 }
 const availExamLessons=instructionalLessons(store.examDraft.grade,undefined,{includeElective:store.examDraft.exam_type==='TX'});
 store.examDraft.blueprint.forEach(row=>{if(!row.lesson_code)row.lesson_code=availExamLessons[0]?.lesson_code||'';});
 const d=store.examDraft,t=selectedTemplate(),locked=Boolean(t?.locked)||Boolean(d.matrix_id),required=needsSource(d.grade,d.exam_type),templates=matchingTemplates(),mxs=usableMatrices(d.grade,d.exam_type),plan=examPlan(),rows=examRows(),summary=C.blueprintSummary(rows);
 const gradeQs=questions().filter(q=>q&&q.review_status!=='archived'&&Number(q.grade)===Number(d.grade));
 const approvedGradeQs=gradeQs.filter(q=>q.review_status==='approved').length;
 const unapprovedGradeQs=gradeQs.length-approvedGradeQs;
 const strictCellCount=r=>questions().filter(q=>q&&q.review_status==='approved'&&Number(q.grade)===Number(d.grade)&&q.lesson_code===r.lesson_code&&q.type===r.type&&q.level===r.level).length;
 const strictShort=d.matrix_id?Boolean(plan?.data?.cells?.some(c=>c.available<c.need)):rows.some(r=>strictCellCount(r)<Number(r.count||0));
 if(!d.flexible_mode_user_set){
  d.flexible_mode=Boolean(strictShort&&gradeQs.length>0);
 }
 let totalNeed=0,readyCount=0;const missingItems=[];
 if(d.matrix_id){
  (plan?.data?.cells||[]).forEach(c=>{
   const need=Number(c.need||0);totalNeed+=need;
   const avail=d.flexible_mode?flexCountForCell(d.grade,c.lesson_code,c.type,c.level):Number(c.available||0);
   readyCount+=Math.min(need,avail);
   if(avail<need)missingItems.push(`${c.lesson_code} · ${examTypeLabel(c.type)} · ${c.level} thiếu ${need-avail}`);
  });
 }else{
  rows.forEach(r=>{
   const need=Number(r.count||0);totalNeed+=need;
   const avail=d.flexible_mode?flexCountForCell(d.grade,r.lesson_code,r.type,r.level):strictCellCount(r);
   readyCount+=Math.min(need,avail);
   if(avail<need)missingItems.push(`${r.lesson_code} · ${examTypeLabel(r.type)} · ${r.level} thiếu ${need-avail}`);
  });
 }
 const checkingPlan=Boolean(d.matrix_id&&(!plan||plan.loading));
 const pct=totalNeed?Math.min(100,Math.round((readyCount/totalNeed)*100)):0;
 const isReady=!checkingPlan&&!plan?.error&&totalNeed>0&&missingItems.length===0&&(Boolean(d.matrix_id)||summary.points===10);
 const readinessHtml=checkingPlan
  ?`<div class="exam-readiness"><div class="exam-readiness-top"><strong>⏳ Đang kiểm tra độ phủ ngân hàng câu hỏi…</strong></div></div>`
  :plan?.error
   ?`<div class="exam-readiness is-warn"><div class="exam-readiness-top"><strong>Không đọc được ma trận</strong></div><p class="small muted" style="margin:6px 0 0">${esc(plan.error)}</p></div>`
   :`<div class="exam-readiness ${isReady?'is-ready':'is-warn'}">`+
     `<div class="exam-readiness-top"><strong>${isReady?`Ngân hàng đã đủ ${readyCount}/${totalNeed} câu hỏi để tạo đề`:`Đang đáp ứng ${readyCount}/${totalNeed} câu hỏi (${missingItems.length} ô còn thiếu)`}</strong><span class="exam-readiness-pct">${pct}%</span></div>`+
     `<div class="exam-readiness-bar"><div class="exam-readiness-fill" style="width:${pct}%"></div></div>`+
     `<p class="small muted" style="margin:0">Ngân hàng Khối ${esc(d.grade)} hiện có <strong>${gradeQs.length} câu</strong> (${approvedGradeQs} đã duyệt · ${unapprovedGradeQs} Nháp/Chờ duyệt).</p>`+
     (missingItems.length?`<p class="small" style="margin:6px 0 0;color:#C62828">Còn thiếu: ${esc(missingItems.slice(0,5).join('; '))}${missingItems.length>5?` và ${missingItems.length-5} mục khác`:''}.</p>`:'')+
    `</div>`;
 const flexBoxHtml=`<div class="exam-flex-switch${d.flexible_mode?' is-on':''}">`+
  `<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-weight:600;color:var(--navy)">`+
   `<input type="checkbox" id="exam-flexible-mode"${d.flexible_mode?' checked':''} style="margin-top:3px">`+
   `<span>Chế độ linh hoạt (dùng cả câu Nháp / Chờ duyệt và khớp theo Bài + Dạng + Mức độ, bỏ qua sai khác câu chữ YCCĐ)</span>`+
  `</label>`+
  (strictShort&&gradeQs.length>0?`<p class="small muted" style="margin:6px 0 0 25px">${d.flexible_mode?'Hệ thống đã tự bật chế độ linh hoạt vì ngân hàng chưa đủ câu đã duyệt khớp 100% câu chữ YCCĐ nghiêm ngặt.':'Đang tắt chế độ linh hoạt: chỉ dùng câu đã duyệt khớp 100% YCCĐ.'}</p>`:'')+
 `</div>`;
 const subTab=store.examSubTab||'create';
 const createMode=d.create_mode||'single';
 const filterG=store.activeGrade==='all'?'all':String(store.activeGrade);
 const examFilterGrades=[...new Set([...availableGrades(),...store.exams.map(x=>Number(x.grade)).filter(Boolean)])].sort((a,b)=>a-b);
 const shownExams=store.exams.filter(r=>filterG==='all'||Number(r.grade)===Number(filterG));
 const inspected=store.inspectedExamImport;
 const subTabsHtml=`<div class="exam-subtabs" role="tablist">`+
  `<button type="button" role="tab" aria-selected="${subTab==='create'}" class="exam-subtab${subTab==='create'?' is-active':''}" data-exam-subtab="create">Tạo đề mới</button>`+
  `<button type="button" role="tab" aria-selected="${subTab==='saved'}" class="exam-subtab${subTab==='saved'?' is-active':''}" data-exam-subtab="saved">Đề đã lưu (${shownExams.length})</button>`+
 `</div>`;
 const simVal=Math.max(0,Math.min(100,Math.round(Number(d.similarity_percent??90))));
 const simPresets=[70,80,90,100];
 const createViewHtml=`<form id="exam-form"><span id="browser-exam-draft" hidden></span>`+
  `<div class="card exam-step-card"><div class="exam-step-head"><span class="exam-step-num">1</span><div><h2>Thông tin đề & Ma trận</h2><p>Chọn khối lớp, kì kiểm tra, ma trận nguồn và mức tương đồng với đề cương.</p></div></div>`+
   `<div class="form-grid">`+
    `<div class="field"><label for="exam-grade">Khối lớp</label><select id="exam-grade">${gradeOptions(d.grade)}</select></div>`+
    `<div class="field"><label for="exam-period">Kì kiểm tra</label><select id="exam-period">${Object.entries(periodNames).map(([k,v])=>opt(k,v,k===d.exam_type)).join('')}</select></div>`+
    `<div class="field"><label for="exam-duration">Thời gian (phút)</label><input id="exam-duration" type="number" min="1" max="240" value="${esc(d.duration)}" required></div>`+
    `<div class="field span2"><label for="exam-title">Tên đề kiểm tra</label><input id="exam-title" value="${esc(d.title)}" placeholder="${esc(periodNames[d.exam_type])} · ${esc(subject())} ${d.grade}" required></div>`+
    `<div class="field full"><label for="exam-template">Ma trận áp dụng</label><select id="exam-template">${mxs.map(m=>opt('mx:'+m.id,`Ma trận & đặc tả · ${m.title} · V${m.version}`,m.id===d.matrix_id)).join('')}${!required?opt('','Tự thiết lập phân bố câu hỏi',!d.template_id&&!d.matrix_id):''}${templates.map(t=>opt(t.id,'Mẫu ma trận · '+t.title+(t.unsupported?' · Chưa hỗ trợ đầy đủ':''),t.id===d.template_id&&!d.matrix_id)).join('')}${required&&!templates.length&&!mxs.length?opt('','Chưa có ma trận đã khóa phù hợp',true):''}</select>${(!mxs.length&&!templates.length)?`<a href="#matrices" class="button export-link" style="margin-top:6px;width:fit-content">Mở Ma trận & đặc tả để khóa ma trận</a>`:''}</div>`+
    `<div class="field full"><label for="exam-revision">Phiên bản đề cương dùng đối chiếu</label><select id="exam-revision">${opt('','Chưa gắn đề cương (có thể gắn sau khi kiểm định)',!d.revision_id)}${currentRevisions().filter(r=>Number(r.grade)===Number(d.grade)).map(r=>opt(r.id,`${r.title} · ${countRecord(r)} câu${r.similarity_target_percent!=null?` · mục tiêu ${r.similarity_target_percent}%`:''} · ${date(r.created_at)}`,r.id===d.revision_id)).join('')}</select></div>`+
    `<div class="callout" style="grid-column:1/-1;margin:4px 0;background:#F7F6FD;border-color:#B9B0EA">`+
     `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">`+
      `<strong id="exam-sim-label" style="color:var(--navy)">Mức độ tương đồng giữa Đề cương và Đề thi (${simVal}%)</strong>`+
      `<div class="actions" style="gap:4px">${simPresets.map(v=>`<button type="button" class="export-link${simVal===v?' primary':''}" data-exam-sim-preset="${v}">${v}%</button>`).join('')}</div>`+
     `</div>`+
     `<div class="form-grid">`+
      `<div class="field span2"><label for="exam-sim-pct">Tỉ lệ câu trùng Đề cương (%)</label><div class="sim-slider-wrap"><input id="exam-sim-pct" type="range" min="0" max="100" step="5" value="${esc(simVal)}"><input id="exam-sim-pct-num" type="number" min="0" max="100" step="1" value="${esc(simVal)}" style="width:74px"><span>%</span><span id="exam-sim-desc" class="small muted">(${simVal}% từ đề cương · ${100-simVal}% câu mới)</span></div></div>`+
      `<div class="field"><label for="exam-sim-mode">Chế độ áp dụng</label><select id="exam-sim-mode"><option value="exact"${(d.similarity_mode||'exact')==='exact'?' selected':''}>Bám sát (${simVal}% đề cương, ${100-simVal}% ngoài)</option><option value="min"${d.similarity_mode==='min'?' selected':''}>Tối thiểu (≥ ${simVal}%, thường ra 100%)</option></select></div>`+
     `</div>`+
     `<p id="exam-sim-note" class="small" style="margin:8px 0 0;color:#8A5A00"${simVal>=90?' hidden':''}>Lưu ý: Quy chuẩn kiểm định chính thức khuyến nghị ≥ 90%. Mức dưới 90% vẫn tạo đề bình thường ở chế độ linh hoạt.</p>`+
    `</div>`+
    `<details class="sim-details-toggle" style="grid-column:1/-1;margin-top:2px"><summary>Tùy chọn nâng cao (Mã xáo trộn)</summary>`+
     `<div class="form-grid" style="margin-top:10px">`+
      `<div class="field"><label for="exam-seed">Mã xáo trộn</label><input id="exam-seed" value="${esc(d.seed)}" required></div>`+
     `</div>`+
    `</details>`+
   `</div>`+
  `</div>`+
  `<div class="card exam-step-card"><div class="exam-step-head"><span class="exam-step-num">2</span><div><h2>Kiểm tra ngân hàng câu hỏi</h2><p>Đối chiếu số câu khả dụng theo từng bài học, dạng câu và mức độ của ma trận.</p></div></div>`+
   readinessHtml+
   flexBoxHtml+
   `<details${(!d.matrix_id||missingItems.length>0||summary.points!==10)?' open':''} style="margin-top:10px"><summary style="cursor:pointer;font-weight:600;color:var(--blue)">Xem bảng chi tiết phân bố (${summary.count} câu · ${summary.points} điểm)</summary>`+
    `<div style="margin-top:12px">`+
     (t?`<details class="callout ${t.unsupported?'warning':''}"${t.unsupported?' open':''}><summary><strong>${t.unsupported?'Ma trận chưa đủ điều kiện tạo đề':'Căn cứ và lưu ý của ma trận nguồn'}</strong></summary><p class="source-note">${esc(t.source_notes||'')}</p><p class="small">Nguồn: ${esc((t.source_file||'').split('/').pop())}</p></details>`:'')+
     (d.matrix_id?planTable(plan,undefined,undefined,{flexible:Boolean(d.flexible_mode),grade:Number(d.grade)}):'')+
     `<div class="table-wrap"${d.matrix_id?' hidden':''}><table id="matrix-table"><thead><tr><th>Bài học</th><th>Dạng</th><th>Mức độ</th><th>Số câu</th><th>Điểm / câu</th><th>${d.flexible_mode?'Khả dụng (linh hoạt)':'Có thể chọn'}</th>${!locked?'<th>Thao tác</th>':''}</tr></thead><tbody>${rows.map((r,i)=>matrixRow(r,i,locked)).join('')}</tbody></table>${(!locked&&!d.matrix_id)?'<button type="button" id="add-matrix-row" style="margin-top:10px">+ Thêm dòng</button>':''}</div>`+
     `<div class="score-summary"><span><strong id="matrix-count">${summary.count}</strong> câu</span><span><strong id="matrix-points" class="${summary.points!==10?'invalid':''}">${summary.points}</strong> / 10 điểm</span><span class="small muted">Phải đủ đúng 10 điểm</span></div>`+
    `</div>`+
   `</details>`+
  `</div>`+
  `<div class="card exam-step-card"><div class="exam-step-head"><span class="exam-step-num">3</span><div><h2>Chọn hình thức & Tạo đề</h2><p>Chọn tạo nhanh 1 đề hoặc tạo trọn bộ đề thi kèm đề cương ôn tập.</p></div></div>`+
   `<div class="exam-mode-grid">`+
    `<button type="button" class="exam-mode-card${createMode==='single'?' is-active':''}" data-exam-create-mode="single"><strong>Tạo 1 đề kiểm tra</strong><span>Tạo nhanh 1 đề để xem trước, trộn mã đề 101–104 và xuất Word/PDF.</span></button>`+
    `<button type="button" class="exam-mode-card${createMode==='set'?' is-active':''}" data-exam-create-mode="set"><strong>Tạo bộ đề + Đề cương</strong><span>Tạo đồng bộ đề cương ôn tập và 1–6 đề thi theo tỉ lệ tương đồng đã chọn.</span></button>`+
   `</div>`+
   (createMode==='single'
    ?`<div id="generation-warning" class="callout warning" hidden></div><button type="submit" id="generate-exam" class="primary exam-primary-cta">Tạo và lưu đề kiểm tra</button>`
    :examSetCard())+
  `</div>`+
 `</form>`;
 const dupGroups=new Map();
 shownExams.forEach((r,idx)=>{
  if(!C.examEditable(r))return;
  const dk=[Number(r.grade),String(r.title||'').trim(),String(r.exam_code||'101').trim(),countRecord(r)].join('|');
  if(!dupGroups.has(dk))dupGroups.set(dk,[]);
  dupGroups.get(dk).push({id:r.id,t:Date.parse(r.created_at||'')||0,idx});
 });
 const dupExamIds=[];
 dupGroups.forEach(list=>{
  if(list.length>1){
   list.sort((a,b)=>(a.t-b.t)||(a.idx-b.idx));
   list.slice(0,-1).forEach(x=>dupExamIds.push(x.id));
  }
 });
 const savedViewHtml=`<div class="card"><div class="list-toolbar" style="margin-top:0"><h2 style="margin:0">Đề kiểm tra đã lưu & kiểm định (${shownExams.length} / ${store.exams.length})</h2><div class="actions" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><label for="exam-grade-filter-select" class="small muted" style="font-weight:600">Khối lớp:</label><select id="exam-grade-filter-select" style="min-width:160px;padding:7px 12px;border:1px solid var(--line);border-radius:7px;font-weight:600;background:#fff">${opt('all',`Tất cả khối (${store.exams.length})`,String(filterG)==='all')}${examFilterGrades.map(g=>opt(g,`Khối ${g} (${store.exams.filter(x=>Number(x.grade)===g).length})`,String(filterG)===String(g))).join('')}</select>${dupExamIds.length?`<button type="button" class="danger" id="dedupe-exams-btn">Xóa ${dupExamIds.length} đề trùng</button>`:''}<button type="button" class="primary" data-exam-subtab="create">Tạo đề mới</button></div></div>${shownExams.length?shownExams.map(r=>{const v=r.verification;const revPct=v?.revision_check?.coverage_percent_points??null;return `<article class="saved-item"><div><h3>${esc(r.title)} ${v?.passed?'<span class="badge approved">Đạt chuẩn Ma trận</span>':'<span class="badge draft">Cần kiểm định</span>'}</h3><p><strong>Khối ${r.grade}</strong> · Mã đề: <strong>${esc(r.exam_code||'GỐC')}</strong> · ${countRecord(r)} câu · ${r.total_points??'Chưa xác định'} điểm · Thời gian: ${r.duration||45} phút${r.campus?` · Cơ sở: ${esc(r.campus)}`:''}</p><p class="small muted">Độ phủ đề cương: <strong>${revPct===null?'Chưa kiểm định':fmtPts(revPct)+'% điểm'}</strong> (${r.revision_match_count??'—'}/${countRecord(r)} câu) · Ma trận: <strong>${esc(matrixDisplayName(v,r))}</strong></p></div><div class="actions">${examLinks(r)}</div></article>`;}).join(''):empty('Chưa có đề kiểm tra','Bấm "Tạo đề mới" để lập đề từ ngân hàng câu hỏi, hoặc nhập đề từ tệp bên dưới.')}</div>`+
 `<div id="exam-inline-viewer" class="card" hidden></div>`+
 `<details class="card"${inspected?' open':''}><summary style="cursor:pointer;font-weight:700;color:var(--navy)">Nhập đề thi từ tệp (.docx / .json / .md) & Tải mẫu</summary>`+
  `<div style="margin-top:14px">`+
   `<div class="form-grid" style="align-items:end">`+
    `<div class="field span2"><label for="exam-import-revision">Đề cương đối chiếu khi nhập</label><select id="exam-import-revision">${opt('','Chọn phiên bản đề cương…',!store.importRevisionId)}${store.revisions.map(r=>opt(r.id,`Khối ${r.grade} · ${r.title} · ${date(r.created_at)}`,r.id===store.importRevisionId)).join('')}</select></div>`+
    `<div class="field"><button type="button" class="primary" id="import-exam-btn">Chọn tệp Đề thi (.docx / .json / .md)</button><input type="file" id="import-exam-file" class="json-import" accept=".docx,.json,.md,.txt"></div>`+
   `</div>`+
   `<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">`+
    `<button type="button" class="button quiet" id="exam-download-json-sample" style="color:#4A3AA8;padding:4px 8px;font-size:12px;font-weight:600">Tải mẫu Đề thi (JSON)</button>`+
    `<button type="button" class="button quiet" id="exam-download-md-sample" style="color:#4A3AA8;padding:4px 8px;font-size:12px;font-weight:600">Tải mẫu Đề thi (Markdown)</button>`+
    `<button type="button" class="button quiet" id="exam-copy-prompt" style="color:#4A3AA8;padding:4px 8px;font-size:12px;font-weight:600">Chép Prompt AI tạo Đề thi</button>`+
   `</div>`+
   (inspected?`<div id="exam-import-inspection-box" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--line)"><div class="dialog-heading"><div><p class="eyebrow">KẾT QUẢ KIỂM ĐỊNH TRƯỚC KHI IMPORT</p><h2>Tệp: ${esc(inspected.filename)} (${inspected.candidate_count} đề)</h2></div><div class="actions"><button type="button" class="primary" id="confirm-import-exams"${!inspected.all_passed?' disabled':''}>Xác nhận Import (${inspected.candidate_count} đề đạt chuẩn)</button><button type="button" class="quiet" id="cancel-import-exams">Đóng</button></div></div>${inspected.candidates.map(c=>`<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">${buildVerificationReportHtml(c)}</div>`).join('')}</div>`:'')+
  `</div>`+
 `</details>`;
 $('#exams').innerHTML=title('Khảo thí & Ngân hàng đề','Tạo đề kiểm tra',subTab==='create'?'Thiết lập thông tin, kiểm tra độ phủ ngân hàng và tạo đề kiểm tra theo 3 bước đơn giản.':'Xem, kiểm định, trộn mã đề và xuất bản Word/PDF cho các đề đã tạo.')+subTabsHtml+(subTab==='create'?createViewHtml:savedViewHtml);

 document.querySelectorAll('[data-exam-subtab]').forEach(btn=>{
  btn.onclick=()=>{if($('#exam-title'))readExamInputs();store.examSubTab=btn.dataset.examSubtab||'create';renderExams();};
 });
 document.querySelectorAll('[data-exam-create-mode]').forEach(btn=>{
  btn.onclick=()=>{readExamInputs();d.create_mode=btn.dataset.examCreateMode||'single';renderExams();};
 });
 if($('#dedupe-exams-btn'))$('#dedupe-exams-btn').onclick=async()=>{
  if(!dupExamIds.length||!confirm(`Xóa ${dupExamIds.length} bản đề nháp bị trùng lặp (giữ lại 1 bản mới nhất cho mỗi đề)?`))return;
  await mutate('/api/exams/delete',{ids:dupExamIds},res=>{
   if(dupExamIds.includes(store.activeExamViewId))store.activeExamViewId=null;
   store.exams=res.exams||store.exams.filter(x=>!dupExamIds.includes(x.id));
   renderExams();notify(`Đã xóa ${res.deleted_count||dupExamIds.length} đề trùng.`);
  });
 };
 const btnExamJson = $('#exam-download-json-sample');
 if (btnExamJson) btnExamJson.onclick = () => downloadExamJsonSample(Number(store.examDraft.grade) || effectiveGrade(), store.examDraft.exam_type || 'GK1');
 const btnExamMd = $('#exam-download-md-sample');
 if (btnExamMd) btnExamMd.onclick = () => downloadExamMdSample(Number(store.examDraft.grade) || effectiveGrade(), store.examDraft.exam_type || 'GK1');
 const btnExamPrompt = $('#exam-copy-prompt');
 if (btnExamPrompt) btnExamPrompt.onclick = () => copyExamAiPrompt(Number(store.examDraft.grade) || effectiveGrade(), store.examDraft.exam_type || 'GK1');

 if($('#exam-import-revision'))$('#exam-import-revision').onchange=()=>{store.importRevisionId=$('#exam-import-revision').value;store.inspectedExamImport=null;renderExams();};
 if($('#import-exam-btn'))$('#import-exam-btn').onclick=()=>$('#import-exam-file')?.click();
 if($('#import-exam-file'))$('#import-exam-file').onchange=async ev=>{
  const file=ev.target.files?.[0];if(!file)return;
  const ext=file.name.toLowerCase().split('.').pop();
  try{
   if(['md','txt','json'].includes(ext)){
    let candidates;
    if(ext==='json'){const raw=JSON.parse(await file.text());candidates=Array.isArray(raw)?raw:(raw.exams||[raw.exam||raw]);}
    else{
     const parsed=parseQuestionsFromRawText(await file.text(),Number(store.examDraft.grade)||effectiveGrade(),subject());
     if(!parsed.length)throw Error('Không tìm thấy câu hỏi hợp lệ. Hãy kiểm tra định dạng tệp.');
     candidates=[{title:file.name,grade:Number(store.examDraft.grade)||effectiveGrade(),subject_name:subject(),exam_type:store.examDraft.exam_type,duration:Number(store.examDraft.duration)||45,questions:parsed,question_count:parsed.length}];
    }
    const normalized=new Blob([JSON.stringify(candidates)],{type:'application/json'});
    store.inspectedExamImport=await request('/api/exams/inspect-import',{filename:file.name+'.json',content_base64:await fileToBase64(normalized),candidates,revision_id:store.importRevisionId});
   }else{
    store.inspectedExamImport=await request('/api/exams/inspect-import',{filename:file.name,content_base64:await fileToBase64(file),revision_id:store.importRevisionId});
   }
   store.examSubTab='saved';renderExams();$('#exam-import-inspection-box')?.scrollIntoView({behavior:'smooth',block:'start'});
   notify(store.inspectedExamImport.all_passed?'Các đề nhập đã qua đối chiếu kỹ thuật. Hãy xem báo cáo trước khi xác nhận.':'Đề nhập chưa đủ căn cứ kiểm định. Hãy nhập câu vào ngân hàng, kiểm duyệt và tạo lại theo ma trận đã khóa.',!store.inspectedExamImport.all_passed);
  }catch(err){notify(detailError(err),true);}finally{ev.target.value='';}
 };
 if($('#confirm-import-exams'))$('#confirm-import-exams').onclick=async()=>{
  if(!store.inspectedExamImport?.candidates?.length)return;
  await mutate('/api/exams/import-verified',{candidates:store.inspectedExamImport.candidates},res=>{
   if(res.exams)store.exams=res.exams;
   const firstId=res.imported?.[0]?.id;
   store.inspectedExamImport=null;
   store.examSubTab='saved';
   if(firstId){store.activeExamViewId=firstId;store.activeExamViewMode='student';}
   renderExams();
   notify(`Đã import thành công ${res.imported_count||1} đề thi đã kiểm định ma trận.`);
  });
 };
 if($('#cancel-import-exams'))$('#cancel-import-exams').onclick=()=>{store.inspectedExamImport=null;renderExams();};
 const examFilterSel=$('#exam-grade-filter-select');
 if(examFilterSel)examFilterSel.onchange=e=>{const val=e.target.value||'all';if(val!=='all'){d.grade=Number(val);d.revision_id='';d.matrix_id='';d.template_id='';d.flexible_mode=false;d.flexible_mode_user_set=false;chooseExamTemplate();}setActiveGrade(val);};
 document.querySelectorAll('[data-exam-grade-filter]').forEach(btn=>{
  btn.onclick=()=>{setActiveGrade(btn.dataset.examGradeFilter||'all');};
 });
 if($('#exam-grade'))$('#exam-grade').onchange=()=>{readExamInputs();const nextG=Number($('#exam-grade').value);d.grade=nextG;d.revision_id='';d.matrix_id='';d.template_id='';d.flexible_mode=false;d.flexible_mode_user_set=false;d.set_rev='auto';d.set_counts={};d.title='';chooseExamTemplate();setActiveGrade(nextG);};
 if($('#exam-period'))$('#exam-period').onchange=()=>{readExamInputs();d.exam_type=$('#exam-period').value;if(d.exam_type==='TX'&&Number(d.duration)===45)d.duration=15;else if(d.exam_type!=='TX'&&Number(d.duration)===15)d.duration=45;d.flexible_mode=false;d.flexible_mode_user_set=false;d.set_counts={};d.title='';chooseExamTemplate();if(d.exam_type!=='TX'){const coreAvail=instructionalLessons(d.grade,undefined,{includeElective:false});const fallbackCode=coreAvail[0]?.lesson_code||'';d.blueprint=(d.blueprint||[]).map(row=>{const matched=lessons(d.grade).find(l=>l.lesson_code===row.lesson_code);return matched&&normalizePpctSection(matched)==='elective_topic'?{...row,lesson_code:fallbackCode}:row;});}renderExams();};
 if($('#exam-template'))$('#exam-template').onchange=()=>{readExamInputs();const v=$('#exam-template').value;d.matrix_id=v.startsWith('mx:')?v.slice(3):'';d.template_id=d.matrix_id?'':v;d.flexible_mode=false;d.flexible_mode_user_set=false;if(!d.template_id&&!d.matrix_id&&!d.blueprint.length){const avail=instructionalLessons(d.grade,undefined,{includeElective:d.exam_type==='TX'});d.blueprint=[{lesson_code:avail[0]?.lesson_code||'',type:'MC',level:'Biết',count:10,points_per_question:1}];}renderExams();};
 if($('#exam-revision'))$('#exam-revision').onchange=()=>{readExamInputs();d.revision_id=$('#exam-revision').value;const rev=store.revisions.find(r=>r.id===d.revision_id);if(rev&&rev.similarity_target_percent!=null){d.similarity_percent=Math.max(0,Math.min(100,Number(rev.similarity_target_percent)));renderExams();return;}updateGenerationState();};
 if($('#exam-flexible-mode'))$('#exam-flexible-mode').onchange=e=>{d.flexible_mode=e.target.checked;d.flexible_mode_user_set=true;renderExams();};
 const simRange=$('#exam-sim-pct');const simNum=$('#exam-sim-pct-num');
 const applyExamSim=v=>{
  const pct=Math.max(0,Math.min(100,Math.round(Number(v)||0)));
  d.similarity_percent=pct;
  if(simRange)simRange.value=pct;
  if(simNum)simNum.value=pct;
  if($('#exam-sim-label'))$('#exam-sim-label').textContent=`Mức độ tương đồng giữa Đề cương và Đề thi (${pct}%)`;
  if($('#exam-sim-desc'))$('#exam-sim-desc').textContent=`(${pct}% từ đề cương · ${100-pct}% câu mới)`;
  if($('#exam-sim-note'))$('#exam-sim-note').hidden=pct>=90;
  document.querySelectorAll('[data-exam-sim-preset]').forEach(btn=>btn.classList.toggle('primary',Number(btn.dataset.examSimPreset)===pct));
  const modeSel=$('#exam-sim-mode');
  if(modeSel&&modeSel.options.length>=2){
   modeSel.options[0].textContent=`Tối thiểu (≥ ${pct}%)`;
   modeSel.options[1].textContent=`Bám sát (${pct}% đề cương, ${100-pct}% ngoài)`;
  }
  if($('#exam-set-card'))renderExams();
 };
 if(simRange&&simNum){
  simRange.oninput=()=>applyExamSim(simRange.value);
  simNum.oninput=()=>applyExamSim(simNum.value);
 }
 document.querySelectorAll('[data-exam-sim-preset]').forEach(btn=>{btn.onclick=()=>applyExamSim(btn.dataset.examSimPreset);});
 if($('#exam-sim-mode'))$('#exam-sim-mode').onchange=e=>{d.similarity_mode=e.target.value;};
 ['title','duration','seed'].forEach(k=>{const el=$('#exam-'+k);if(el)el.oninput=()=>{readExamInputs();updateGenerationState();};});
 if($('#add-matrix-row'))$('#add-matrix-row').onclick=()=>{readExamInputs();const avail=instructionalLessons(d.grade,undefined,{includeElective:d.exam_type==='TX'});d.blueprint.push({lesson_code:avail[0]?.lesson_code||'',type:'MC',level:'Biết',count:1,points_per_question:.25});renderExams();};
 if($('#matrix-table'))$('#matrix-table').onchange=event=>{const el=event.target;if(!el.dataset.row||locked)return;const i=Number(el.dataset.row),key=el.dataset.key;d.blueprint[i][key]=['count','points_per_question'].includes(key)?Number(el.value):el.value;if(key==='type')d.blueprint[i].level=C.levelAfterTypeChange(d.blueprint[i].level,el.value);readExamInputs();renderExams();};
 if($('#exam-form'))$('#exam-form').onsubmit=generateExam;
 updateGenerationState();bindExamSetCard();saveBrowserExamDraft();
 const activeExam=shownExams.find(r=>r.id===store.activeExamViewId)||shownExams[0];
 if(subTab==='saved'&&activeExam&&$('#exam-inline-viewer')){
  $('#exam-inline-viewer').hidden=false;
  mountExamViewerContent($('#exam-inline-viewer'),activeExam,store.activeExamViewMode||'student',true);
 }
}
function openExamMetaEditor(id){
 const ex=store.exams.find(x=>x.id===id);if(!ex)return;
 $('#edit-title').textContent='Sửa thông tin đề kiểm tra';
 $('#question-form').innerHTML=`<div id="form-error" class="callout error" role="alert" hidden></div><div class="form-grid"><div class="field span2"><label for="ex-edit-title">Tên đề kiểm tra</label><input id="ex-edit-title" name="title" value="${esc(ex.title||'')}" required></div><div class="field"><label for="ex-edit-duration">Thời gian làm bài (phút)</label><input id="ex-edit-duration" name="duration" type="number" min="1" max="300" value="${esc(ex.duration||45)}" required></div><div class="field span2"><label for="ex-edit-campus">Cơ sở</label><input id="ex-edit-campus" name="campus" value="${esc(ex.campus||'Cao Thắng')}"></div><div class="field"><label for="ex-edit-code">Mã đề</label><input id="ex-edit-code" name="exam_code" value="${esc(ex.exam_code||'101')}"></div></div><p class="editor-note">Để sửa trực tiếp nội dung câu hỏi/phương án trong đề, bạn cũng có thể mở "Xem đề học sinh" hoặc "Xem đáp án & HDC" rồi bấm "Chỉnh sửa nội dung & định dạng".</p><div class="dialog-bottom"><button type="button" data-close="edit-dialog">Hủy</button><button type="submit" class="primary">Lưu thay đổi</button></div>`;
 $('#question-form').onsubmit=async ev=>{
  ev.preventDefault();const f=new FormData(ev.target);
  const payload={id:ex.id,title:f.get('title').trim(),duration:Number(f.get('duration')),campus:f.get('campus').trim(),exam_code:f.get('exam_code').trim()};
  await mutate('/api/exams/update',payload,res=>{
   if(res.exams)store.exams=res.exams;else{const idx=store.exams.findIndex(x=>x.id===ex.id);if(idx>=0)store.exams[idx]=res.exam;}
   $('#edit-dialog').close();renderExams();notify('Đã cập nhật thông tin đề kiểm tra.');
  });
 };
 $('#edit-dialog').showModal();
}
async function duplicateExam(id){
 const ex=store.exams.find(x=>x.id===id);if(!ex)return;
 await mutate('/api/exams/duplicate',{id},res=>{
  if(res.exams)store.exams=res.exams;else if(res.exam)store.exams.push(res.exam);
  renderExams();notify('Đã nhân bản đề kiểm tra.');
 });
}
// Trộn đề: hộp thoại tùy chỉnh (số mã, tên mã, xáo câu trong từng phần, xáo phương án, ý Đúng/Sai, giữ thứ tự tự luận).
async function promptPermuteExam(id){
 const ex=store.exams.find(x=>x.id===id);if(!ex)return;
 let dlg=document.getElementById('permute-dialog');
 if(!dlg){dlg=document.createElement('dialog');dlg.id='permute-dialog';dlg.style.cssText='max-width:900px;width:95vw;border-radius:14px;padding:22px';document.body.appendChild(dlg);}
 const family=ex.parent_exam_id||ex.id;
 const takenCodes=new Set(store.exams.filter(x=>x.id!==ex.id&&(x.parent_exam_id===family||x.id===family)).map(x=>String(x.exam_code||'')));
 const suggest=n=>{const out=[];for(let c=101;out.length<n&&c<999;c++){const s=String(c);if(!takenCodes.has(s))out.push(s);}return out;};
 const parts=['MC','YN','SHORT','ES'].map(t=>[t,ex.questions.filter(q=>q.type===t).length]).filter(([,n])=>n);
 const partNames={MC:'Trắc nghiệm',YN:'Đúng/Sai',SHORT:'Trả lời ngắn',ES:'Tự luận'};
 const hasYN=parts.some(([t])=>t==='YN'),hasES=parts.some(([t])=>t==='ES');
 dlg.innerHTML=`<div class="dialog-heading"><h2 style="margin:0">Trộn mã đề</h2><button type="button" class="quiet" data-close-permute>Đóng</button></div>
  <p class="muted">Từ đề <strong>${esc(ex.title)}</strong> (${ex.questions.length} câu: ${parts.map(([t,n])=>`${partNames[t]} ${n}`).join(', ')}). Mỗi mã chỉ xáo <strong>thứ tự câu trong từng phần</strong> và <strong>thứ tự phương án</strong>; nội dung, điểm và đáp án đúng giữ nguyên. Thứ tự các phần giữ nguyên.</p>
  <div class="form-grid">
   <div class="field"><label for="perm-count">Số mã đề</label><select id="perm-count">${[2,3,4,5,6].map(n=>`<option value="${n}"${n===4?' selected':''}>${n} mã</option>`).join('')}</select></div>
   <div class="field span2"><label for="perm-codes">Các mã đề (cách nhau dấu phẩy, 3–6 chữ số)</label><input id="perm-codes" value="${suggest(4).join(', ')}"></div>
   <div class="field"><label for="perm-seed">Mã ngẫu nhiên (để tạo lại y hệt)</label><input id="perm-seed" value="${esc(String(Date.now()).slice(-6))}"></div>
  </div>
  <fieldset style="margin-top:10px"><legend>Cách xáo trộn</legend>
   <label class="inline-check"><input type="checkbox" id="perm-q" checked> Xáo thứ tự câu trong từng phần</label><br>
   <label class="inline-check"><input type="checkbox" id="perm-o" checked> Xáo thứ tự phương án A, B, C, D (bỏ qua câu có phương án "Tất cả các ý trên", "Cả A và B"…)</label><br>
   ${hasYN?'<label class="inline-check"><input type="checkbox" id="perm-s"> Xáo thứ tự ý a), b), c), d) của câu Đúng/Sai</label><br>':''}
   ${hasES?'<label class="inline-check"><input type="checkbox" id="perm-es" checked> Giữ nguyên thứ tự câu tự luận (thường xếp từ dễ đến khó)</label>':''}
  </fieldset>
  <p class="small muted" id="perm-note"></p>
  <div id="perm-error" class="callout error" hidden></div>
  <div class="actions" style="margin-top:12px"><button type="button" class="primary" id="perm-run">Trộn và lưu các mã đề</button><button type="button" data-close-permute>Hủy</button></div>
  <div id="perm-result"></div>`;
 const $d=s=>dlg.querySelector(s);
 const updateNote=()=>{const codes=$d('#perm-codes').value.split(/[,;\s]+/).filter(Boolean);
  $d('#perm-note').textContent=(ex.exam_code&&codes.includes(String(ex.exam_code))?`Đề gốc cũng đang mang mã ${ex.exam_code}: khi in và nộp hồ sơ chỉ dùng các mã đã trộn, không dùng đề gốc. `:'')+'Các mã mới là bản nháp riêng, cần gửi duyệt và khóa trước khi phát hành đề cương.';};
 $d('#perm-codes').oninput=updateNote;updateNote();
 dlg.querySelectorAll('[data-close-permute]').forEach(b=>b.onclick=()=>dlg.close());
 $d('#perm-count').onchange=()=>{$d('#perm-codes').value=suggest(Number($d('#perm-count').value)).join(', ');updateNote();};
 $d('#perm-run').onclick=async()=>{
  const err=$d('#perm-error');err.hidden=true;
  const codes=$d('#perm-codes').value.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);
  const problem=codes.length<2||codes.length>6?'Chọn từ 2 đến 6 mã đề.':codes.some(c=>!/^\d{3,6}$/.test(c))?'Mỗi mã đề gồm 3–6 chữ số.':new Set(codes).size!==codes.length?'Các mã đề không được trùng nhau.':codes.find(c=>takenCodes.has(c))?`Mã ${codes.find(c=>takenCodes.has(c))} đã có trong các mã đã trộn từ đề này.`:'';
  if(problem){err.textContent=problem;err.hidden=false;return;}
  $d('#perm-run').disabled=true;
  const body={id,codes,num_variants:codes.length,shuffle_questions:$d('#perm-q').checked,shuffle_options:$d('#perm-o').checked,shuffle_statements:Boolean($d('#perm-s')?.checked),keep_es_order:$d('#perm-es')?$d('#perm-es').checked:true,seed:$d('#perm-seed').value};
  try{
   const res=await request('/api/exams/permute',body);
   if(res.exams)store.exams=res.exams;
   const made=res.result?.exams||[];
   const key=C.permutationAnswerKey([ex,...made]);
   $d('#perm-result').innerHTML=`<div class="callout" style="margin-top:12px"><strong>Đã tạo ${made.length} mã đề: ${made.map(e=>esc(e.exam_code)).join(', ')}.</strong> Bảng đáp án tổng hợp (dòng đầu là đề gốc; số nhỏ là số câu gốc):</div>
    <div class="table-wrap"><table class="small"><thead><tr><th>Mã</th>${key.columns.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${key.rows.map((r,i)=>`<tr><td><strong>${esc(i===0?'Đề gốc':r.code)}</strong></td>${r.cells.map(c=>`<td style="text-align:center">${esc(c.answer)}${i>0?`<br><span class="muted" style="font-size:10px">câu ${esc(c.source)}</span>`:''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
   renderExams();
   notify(`Đã trộn ${made.length} mã đề từ "${ex.title}". Các mã là bản nháp: hãy gửi duyệt và khóa từng mã.`);
  }catch(e2){err.textContent=e2.message;err.hidden=false;}
  finally{$d('#perm-run').disabled=false;}
 };
 dlg.showModal();
}
function loadExamConfig(id){
 const ex=store.exams.find(x=>x.id===id);if(!ex)return;
 setActiveGrade(Number(ex.grade),{skipRender:true});
 store.examSubTab='create';
 store.examDraft={
  grade:Number(ex.grade),
  exam_type:ex.exam_type||'GK1',
  matrix_id:ex.matrix_id||'',
  template_id:ex.template_id||'',
  revision_id:ex.revision_id||'',
  title:`${ex.title||'Đề kiểm tra'} (Mã mới)`,
  duration:Number(ex.duration||45),
  seed:String(Number(ex.seed||2026)+1),
  flexible_mode:false,
  flexible_mode_user_set:false,
  blueprint:structuredClone(ex.blueprint||[])
 };
 renderExams();
 $('#exam-form')?.scrollIntoView({behavior:'smooth',block:'start'});
 notify('Đã nạp cấu hình đề lên biểu mẫu. Bạn có thể đổi Mã xáo trộn để tạo đề mới.');
}
async function deleteExam(id){
 const ex=store.exams.find(x=>x.id===id);if(!ex||!confirm(`Xóa đề kiểm tra "${ex.title}" (Khối ${ex.grade} · Mã đề ${ex.exam_code||'101'})?`))return;
 await mutate('/api/exams/delete',{id},res=>{
  if(store.activeExamViewId===id)store.activeExamViewId=null;
  store.exams=res.exams||store.exams.filter(x=>x.id!==id);
  renderExams();notify('Đã xóa đề kiểm tra.');
 });
}
function examSetDefaults(){const d=store.examDraft;if(d.set_count===undefined)d.set_count=2;if(!d.set_rev)d.set_rev='auto';if(!d.set_counts)d.set_counts={};return d;}
// Ô ma trận của bộ đề: cùng nguồn với màn hình Tạo đề (ma trận & đặc tả, mẫu ma trận hoặc phân bố tự thiết lập).
function setPlan(){const d=store.examDraft;if(d.matrix_id)return examPlan();const src=examSourcePayload();if(!src.matrix_id&&!(src.blueprint||[]).length)return null;if(!src.matrix_id&&C.blueprintSummary(src.blueprint).points!==10)return null;return ensurePlan('set',{grade:Number(d.grade),exam_type:d.exam_type,...src},()=>{if(store.tab==='exams')renderExams();});}
function setCellAvail(d,c){return d.flexible_mode?flexCountForCell(d.grade,c.lesson_code,c.type,c.level):c.available;}
function setCounts(cells){const d=examSetDefaults(),out={};cells.forEach(c=>{out[c.key]=d.set_counts[c.key]??defaultRevCount(c,setCellAvail(d,c));});return out;}
function examSetProblems(){const d=examSetDefaults(),t=selectedTemplate(),p=[],plan=setPlan();if(C.templateBlocked(t))p.push('Ma trận này chưa đủ điều kiện tạo đề.');if(needsSource(d.grade,d.exam_type)&&!t&&!d.matrix_id)p.push('Kì kiểm tra này cần ma trận nguồn đã xác minh.');if(!plan)p.push('Chọn ma trận hoặc thiết lập phân bố đủ 10 điểm ở trên.');else if(plan.loading)p.push('Đang đọc ma trận…');else if(plan.error)p.push(plan.error);else{const short=plan.data.cells.filter(c=>setCellAvail(d,c)<c.need);if(short.length)p.push((d.flexible_mode?'Ngân hàng chưa đủ câu khả dụng cho một đề: ':'Ngân hàng chưa đủ câu đã duyệt cho một đề: ')+short.map(c=>`${c.lesson_code} · ${examTypeLabel(c.type)} · ${c.level} thiếu ${c.need-setCellAvail(d,c)}`).join('; ')+'.');}if(!Number.isInteger(Number(d.set_count))||d.set_count<1||d.set_count>6)p.push('Số đề trong bộ từ 1 đến 6.');if(d.set_rev!=='auto'&&!store.revisions.some(r=>r.id===d.set_rev))p.push('Chọn đề cương.');return p;}
function examSetCard(){const d=examSetDefaults(),plan=setPlan(),cells=plan?.data?.cells||[],displayCells=d.flexible_mode?cells.map(c=>({...c,available:setCellAvail(d,c)})):cells,counts=setCounts(cells),per=cells.reduce((n,c)=>n+c.need,0),setSimPct=Math.max(0,Math.min(100,Math.round(Number(d.similarity_percent??90)))),keep=(d.similarity_mode==='exact'?Math.round:Math.ceil)(setSimPct/100*per),total=Object.values(counts).reduce((n,v)=>n+Number(v||0),0),auto=d.set_rev==='auto',M=Number(d.set_count)||1;
 const head=auto?'<th>Số câu đề cương</th><th>Để các đề khác câu</th>':'';
 const extra=auto?c=>{const cap=setCellAvail(d,c);return `<td><input type="number" class="small-input" min="0" max="${cap}" step="1" data-set-count="${esc(c.key)}" value="${esc(counts[c.key])}" aria-label="Số câu đề cương ô ${esc(c.lesson_code)} ${esc(examTypeLabel(c.type))} ${esc(c.level)}"></td><td class="small muted">≥ ${Math.min(cap,Math.ceil(c.need*M*0.9))}</td>`;}:null;
 return `<div id="exam-set-card" style="padding-top:12px;border-top:1px solid var(--line)">`+
  `<div class="form-grid">`+
   `<div class="field"><label for="set-count">Số lượng đề cần tạo (1–6)</label><input id="set-count" type="number" min="1" max="6" step="1" value="${esc(d.set_count)}"></div>`+
   `<div class="field span2"><label for="set-rev">Đề cương ôn tập</label><select id="set-rev">${opt('auto','Tự lập đề cương mới theo ma trận bên trên',auto)}${currentRevisions().filter(r=>Number(r.grade)===Number(d.grade)).map(r=>opt(r.id,`Dùng đề cương đã lưu · ${r.title} · ${countRecord(r)} câu${r.similarity_target_percent!=null?` · mục tiêu ${r.similarity_target_percent}%`:''}`,r.id===d.set_rev)).join('')}</select></div>`+
   (auto?`<div class="field"><label for="set-total">Tổng số câu đề cương</label><div class="sim-slider-wrap"><input id="set-total" type="number" min="1" step="1" value="${total}"><button type="button" id="set-split">Chia theo tỉ lệ</button></div></div>`:'')+
  `</div>`+
  `<p class="small muted" style="margin:10px 0 0">Mỗi đề có <strong>${keep}/${per||'—'} câu</strong> lấy từ đề cương (${(d.similarity_mode||'exact')==='exact'?'bám sát ':'≥ '}${setSimPct}%); ${Math.max(0,(per||0)-keep)} câu còn lại dùng để phân hóa.</p>`+
  `<details style="margin:12px 0"><summary style="cursor:pointer;font-weight:600;color:var(--blue)">Tùy chỉnh số câu đề cương theo từng bài / ô ma trận</summary><div style="margin-top:10px">${auto?lessonPickerTable(displayCells,'set',d.set_lesson_counts||{}):''}${planTable(plan,head,extra,{flexible:Boolean(d.flexible_mode),grade:Number(d.grade)})}${auto&&cells.length?`<p class="small muted" style="margin-top:8px">Đề cương hiện có ${total} câu. Để ${M} đề ít trùng câu, mỗi ô nên có khoảng gấp ${(M*0.9).toFixed(1).replace('.',',')} lần số câu một đề.</p>`:''}</div></details>`+
  `<div id="set-warning" class="callout warning" hidden></div>`+
  `<button type="button" id="generate-set" class="primary exam-primary-cta">Tạo ${auto?'đề cương + ':''}${esc(M)} đề kiểm tra</button>`+
 `</div>`;}
function bindExamSetCard(){if(!$('#exam-set-card'))return;const d=examSetDefaults(),rerender=()=>{readExamInputs();renderExams();$('#exam-set-card')?.scrollIntoView({block:'nearest'});};
 if($('#set-count'))$('#set-count').onchange=e=>{d.set_count=Number(e.target.value);rerender();};
 if($('#set-rev'))$('#set-rev').onchange=e=>{
  d.set_rev=e.target.value;
  const rev=store.revisions.find(r=>r.id===d.set_rev);
  if(rev&&rev.similarity_target_percent!=null){
   d.similarity_percent=Math.max(0,Math.min(100,Number(rev.similarity_target_percent)));
  }
  rerender();
 };
 document.querySelectorAll('[data-set-count]').forEach(el=>{el.onchange=()=>{d.set_counts[el.dataset.setCount]=Math.max(0,Math.floor(Number(el.value)||0));rerender();};});
 d.set_lesson_counts = d.set_lesson_counts || {};
 bindLessonPickerInputs('set', d.set_lesson_counts);
 const getSetCells=()=>(setPlan()?.data?.cells||[]).map(c=>({...c,available:setCellAvail(d,c)}));
 if($('#set-apply-lesson-split'))$('#set-apply-lesson-split').onclick=()=>{
   const cells=getSetCells();
   const distributed = C.distributeCountsByLesson(cells, d.set_lesson_counts);
   Object.assign(d.set_counts, distributed);
   rerender();
 };
 if($('#set-split'))$('#set-split').onclick=()=>{const cells=getSetCells();Object.assign(d.set_counts,C.distributeCounts(cells,Math.max(1,Math.floor(Number($('#set-total')?.value)||0))));rerender();};
 const p=examSetProblems();
 if($('#generate-set'))$('#generate-set').disabled=store.busy||Boolean(p.length);
 if($('#set-warning')){$('#set-warning').hidden=!p.length;$('#set-warning').textContent=p.join('\n');}
 if($('#generate-set'))$('#generate-set').onclick=generateExamSet;}
async function generateExamSet(){readExamInputs();const d=examSetDefaults(),p=examSetProblems();if(p.length){notify(p.join('\n'),true);return;}const name=d.title.trim()||`${periodNames[d.exam_type]} · ${subject()} ${d.grade}`,cells=setPlan().data.cells;const simPct=Math.max(0,Math.min(100,Math.round(Number(d.similarity_percent??90))));const payload={title:name,grade:Number(d.grade),exam_type:d.exam_type,duration:Number(d.duration),...examSourcePayload(),seed:d.seed,exam_count:Number(d.set_count),similarity_percent:simPct,similarity_mode:d.similarity_mode||'exact',flexible:Boolean(d.flexible_mode||simPct<90),...(d.set_rev==='auto'?{revision_counts:setCounts(cells)}:{revision_id:d.set_rev})};
 await mutate('/api/exams/generate-set',payload,res=>{store.exams=res.exams_all||store.exams;store.revisions=res.revisions||store.revisions;store.activeExamViewId=res.exams?.[0]?.id;store.examSubTab='saved';renderExams();notify(`Đã tạo ${res.exams.length} đề${d.set_rev==='auto'?` và đề cương "${res.revision.title}" (${res.revision_size} câu)`:''}. Mỗi đề để ${res.outside_per_exam} câu ngoài đề cương.`+(res.warnings?.length?'\nLưu ý: '+res.warnings.join(' '):''),Boolean(res.warnings?.length));});}
function matrixRow(r,i,locked){const d=store.examDraft;const key=`data-row="${i}"`,disabled=locked?' disabled':'';const count=d.flexible_mode?flexCountForCell(d.grade,r.lesson_code,r.type,r.level):questions().filter(q=>q.grade===Number(d.grade)&&q.lesson_code===r.lesson_code&&q.type===r.type&&q.level===r.level&&q.review_status==='approved').length;const optsList=instructionalLessons(d.grade,undefined,{includeElective:d.exam_type==='TX'});const shownOpts=r.lesson_code&&!optsList.some(l=>l.lesson_code===r.lesson_code)?[...optsList,...lessons(d.grade).filter(l=>l.lesson_code===r.lesson_code)]:optsList;const allowedTypes=Number(d.grade)>=10?['MC','SHORT','ES']:['MC','ES'];const typeOpts=allowedTypes.includes(r.type)?allowedTypes:[...allowedTypes,r.type];return `<tr><td><select aria-label="Bài học dòng ${i+1}" ${key} data-key="lesson_code"${disabled}>${shownOpts.map(l=>opt(l.lesson_code,lessonOptionLabel(l),l.lesson_code===r.lesson_code)).join('')}</select></td><td><select aria-label="Dạng câu dòng ${i+1}" ${key} data-key="type"${disabled}>${typeOpts.map(v=>opt(v,examTypeLabel(v),v===r.type)).join('')}</select></td><td><select aria-label="Mức độ dòng ${i+1}" ${key} data-key="level"${disabled}>${C.levelOptions(r.level)}</select></td><td><input aria-label="Số câu dòng ${i+1}" ${key} data-key="count" type="number" min="1" step="1" value="${esc(r.count)}"${disabled}></td><td><input aria-label="Điểm mỗi câu dòng ${i+1}" ${key} data-key="points_per_question" type="number" min="0.01" step="0.01" value="${esc(r.points_per_question)}"${disabled}></td><td><span class="badge${count<r.count?' draft':(d.flexible_mode?' approved':'')}">${count} câu</span></td>${!locked?`<td><button type="button" class="quiet danger" data-remove-row="${i}" aria-label="Bỏ dòng ${i+1}">Bỏ</button></td>`:''}</tr>`;}
function readExamInputs(){const d=store.examDraft;if(!$('#exam-title'))return;d.title=$('#exam-title').value;d.duration=Number($('#exam-duration').value);d.seed=$('#exam-seed').value;d.revision_id=$('#exam-revision').value;if($('#exam-sim-pct-num'))d.similarity_percent=Number($('#exam-sim-pct-num').value);if($('#exam-sim-mode'))d.similarity_mode=$('#exam-sim-mode').value;}
function generationProblems(){const d=store.examDraft,t=selectedTemplate(),rows=examRows(),summary=C.blueprintSummary(rows),p=[];if(C.templateBlocked(t))p.push('Chưa thể tạo đề từ ma trận này: các phần Đúng/Sai hoặc tự luận còn cần xác minh. Xem căn cứ ma trận phía trên. Có thể chọn kiểm tra Thường xuyên để tự thiết lập.');if(needsSource(d.grade,d.exam_type)&&!t&&!d.matrix_id)p.push('Kì kiểm tra này cần ma trận nguồn đã xác minh.');if(d.matrix_id){const pl=examPlan();if(!pl||pl.loading)p.push('Đang đọc ma trận…');else if(pl.error)p.push(pl.error);}if(!rows.length)p.push('Thêm ít nhất một dòng phân bố câu hỏi.');if(summary.points!==10)p.push(`Tổng hiện tại ${summary.points} điểm; cần đúng 10 điểm.`);if(rows.some(r=>!Number.isInteger(Number(r.count))||Number(r.count)<1||Number(r.points_per_question)<=0))p.push('Số câu phải là số nguyên dương và điểm mỗi câu phải lớn hơn 0.');return p;}
function updateGenerationState(){if(!$('#generate-exam'))return;const p=generationProblems();$('#generate-exam').disabled=store.busy||Boolean(p.length);$('#generation-warning').hidden=!p.length;$('#generation-warning').textContent=p.join('\n');}
async function generateExam(event){
 event.preventDefault();readExamInputs();
 const d=store.examDraft,p=generationProblems();
 if(p.length){notify(p.join('\n'),true);return;}
 const simPct=Math.max(0,Math.min(100,Math.round(Number(d.similarity_percent??90))));
 const payload={title:d.title.trim(),grade:Number(d.grade),exam_type:d.exam_type,duration:Number(d.duration),...examSourcePayload(),revision_id:d.revision_id||null,seed:d.seed,similarity_percent:simPct,similarity_mode:d.similarity_mode||'min',flexible:Boolean(d.flexible_mode||simPct<90)};
 if(!payload.title){notify('Nhập tên đề kiểm tra trước khi tạo.',true);return;}
 const genBtn=$('#generate-exam'),origTxt=genBtn?.textContent;
 if(genBtn){genBtn.disabled=true;genBtn.textContent='⏳ Đang tạo đề…';}
 try{
  await mutate('/api/exams/generate',payload,result=>{
   store.exams=Array.isArray(result.exams)?result.exams:[...store.exams.filter(x=>x.id!==result.exam.id),result.exam];
   store.activeExamViewId=result.exam.id;store.examSubTab='saved';renderExams();
   const msg=result.exam?.flexible_draft?'Đã tạo đề kiểm tra nháp (Chế độ linh hoạt). Thầy/Cô có thể xem, xuất Word/PDF ngay hoặc duyệt câu hỏi trước khi khóa đề.':(result.exam.revision_id?'Đã tạo và lưu đề kiểm tra. Chọn bản học sinh hoặc bản giáo viên bên dưới để xuất.':'Đã tạo đề theo ma trận (chưa gắn đề cương). Mở Kiểm định để gắn đề cương trước khi gửi duyệt.');
   notify(msg);
  });
 }finally{
  if(genBtn&&document.body.contains(genBtn)){genBtn.textContent=origTxt||'Tạo và lưu đề kiểm tra';updateGenerationState();}
 }
}
// Delegate controls that are re-rendered as the filter, list or matrix changes.
document.addEventListener('click',event=>{
 const menuItem=event.target.closest('.dropdown-menu .dropdown-content button, .dropdown-menu .dropdown-content a');
 if(menuItem)menuItem.closest('.dropdown-menu')?.removeAttribute('open');
 const close=event.target.closest('[data-close]');if(close){$('#'+close.dataset.close).close();return;}
 const openCustomExport=event.target.closest('[data-open-custom-export]');if(openCustomExport){openCustomExportDialog(openCustomExport.dataset.openCustomExport);return;}
 const openCustomRevExport=event.target.closest('[data-open-custom-rev-export]');if(openCustomRevExport){openCustomRevExportDialog(openCustomRevExport.dataset.openCustomRevExport);return;}
 const openCustomBankExport=event.target.closest('[data-open-custom-bank-export]');if(openCustomBankExport){openCustomBankExportDialog();return;}
 const compareExam=event.target.closest('[data-compare-exam]');if(compareExam){openExamComparison(compareExam.dataset.compareExam);return;}
 const viewExam=event.target.closest('[data-view-exam]');if(viewExam){const ex=store.exams.find(r=>r.id===viewExam.dataset.viewExam);if(ex)openExamViewer(ex,viewExam.dataset.mode||'student');return;}
 const editExam=event.target.closest('[data-edit-exam]');if(editExam){openExamMetaEditor(editExam.dataset.editExam);return;}
 const dupExam=event.target.closest('[data-dup-exam]');if(dupExam){duplicateExam(dupExam.dataset.dupExam);return;}
 const permExam=event.target.closest('[data-permute-exam]');if(permExam){promptPermuteExam(permExam.dataset.permuteExam);return;}
 const loadExam=event.target.closest('[data-load-exam]');if(loadExam){loadExamConfig(loadExam.dataset.loadExam);return;}
 const examActBtn=event.target.closest('[data-exam-act]');if(examActBtn){examAct(examActBtn.dataset.examId,examActBtn.dataset.examAct);return;}
 const setActBtn=event.target.closest('[data-set-act]');if(setActBtn){examSetAct(setActBtn.dataset.setId,setActBtn.dataset.setAct);return;}
 const revActBtn=event.target.closest('[data-rev-act]');if(revActBtn){revisionAct(revActBtn.dataset.revId,revActBtn.dataset.revAct);return;}
 const delExam=event.target.closest('[data-del-exam]');if(delExam){deleteExam(delExam.dataset.delExam);return;}
 const viewRev=event.target.closest('[data-view-revision]');if(viewRev){const rev=store.revisions.find(r=>r.id===viewRev.dataset.viewRevision);if(rev)openRevisionViewer(rev,viewRev.dataset.answers==='1');return;}
 const editRev=event.target.closest('[data-edit-revision]');if(editRev){startEditRevision(editRev.dataset.editRevision);return;}
 const dupRev=event.target.closest('[data-dup-revision]');if(dupRev){duplicateRevision(dupRev.dataset.dupRevision);return;}
 const delRev=event.target.closest('[data-del-revision]');if(delRev){deleteRevision(delRev.dataset.delRevision);return;}
 const editPPCT=event.target.closest('[data-edit-ppct]');if(editPPCT){openPPCTEditor(Number(editPPCT.dataset.grade),editPPCT.dataset.editPpct,store.ppctSubject||'Tin học');return;}
 const delPPCT=event.target.closest('[data-del-ppct]');if(delPPCT){deletePPCTLesson(Number(delPPCT.dataset.grade),delPPCT.dataset.delPpct);return;}
 const grade=event.target.closest('[data-open-grade]');if(grade){setActiveGrade(Number(grade.dataset.openGrade),{skipRender:true});store.filters.lesson='';store.page=1;return;}
 const detail=event.target.closest('[data-detail]');if(detail){showDetail(detail.dataset.detail);return;}
 const edit=event.target.closest('[data-edit]');if(edit){openEditor(edit.dataset.edit,false);return;}
 const dupQ=event.target.closest('[data-dup-q]');if(dupQ){openEditor(dupQ.dataset.dupQ,true);return;}
 const restoreQ=event.target.closest('[data-restore-q]');if(restoreQ){restoreQuestion(restoreQ.dataset.restoreQ);return;}
 const delQ=event.target.closest('[data-del-q]');if(delQ){deleteQuestion(delQ.dataset.delQ);return;}
 const archive=event.target.closest('[data-archive]');if(archive){archiveQuestion(archive.dataset.archive);return;}
 const remove=event.target.closest('[data-remove-row]');if(remove){readExamInputs();store.examDraft.blueprint.splice(Number(remove.dataset.removeRow),1);renderExams();return;}
 const exportSpec=event.target.closest('[data-export-spec-to-matrix]');
 if(exportSpec){
   const ex=store.exams.find(e=>e.id===exportSpec.dataset.exportSpecToMatrix);
   if(ex){
     location.hash='matrices';
     setTimeout(()=>{
       if(window.MatrixUI&&typeof window.MatrixUI.openEditorWithExamSpec==='function'){
         window.MatrixUI.openEditorWithExamSpec(ex);
       }
     },150);
   }
   return;
 }
 const use=event.target.closest('[data-use-revision]');if(use){const r=store.revisions.find(r=>r.id===use.dataset.useRevision);if(r){store.examDraft.grade=Number(r.grade);chooseExamTemplate();store.examDraft.revision_id=r.id;if(r.similarity_target_percent!=null)store.examDraft.similarity_percent=Math.max(0,Math.min(100,Number(r.similarity_target_percent)));store.examSubTab='create';location.hash='exams';if(store.tab==='exams')renderExams();}}
});
document.addEventListener('change',event=>{if(event.target.matches('[data-check]')){const id=event.target.dataset.check;if(event.target.checked)store.selected.add(id);else store.selected.delete(id);renderBankList();}});
window.addEventListener('hashchange',()=>{clearNotice();switchTab(location.hash.slice(1));});
$('#refresh').onclick=()=>load();
{const more=$('#topbar-more');if(more){more.addEventListener('click',e=>{if(e.target.closest('.topbar-menu button'))more.open=false;});document.addEventListener('click',e=>{if(more.open&&!more.contains(e.target))more.open=false;});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&more.open){more.open=false;more.querySelector('summary').focus();}});}}
load(true);

function openMatrixInExamCreator(m){
 if(!m||!m.id)return;
 if(!Array.isArray(store.matrixRecords))store.matrixRecords=[];
 const idx=store.matrixRecords.findIndex(x=>x.id===m.id);
 if(idx>=0)store.matrixRecords[idx]=m;else store.matrixRecords.push(m);
 const g=Number(m.grade)||effectiveGrade();
 setActiveGrade(g,{skipRender:true});
 store.examDraft={
  ...(store.examDraft||{}),
  grade:g,
  exam_type:m.exam_type||'GK1',
  matrix_id:m.id,
  template_id:'',
  duration:Number(m.duration||45),
  title:'',
  flexible_mode:false,
  flexible_mode_user_set:false
 };
 store.examSubTab='create';
 const msg=`Đã nạp ma trận "${m.title||'Ma trận'}" sang màn hình Tạo đề kiểm tra.`;
 if(location.hash!=='#exams'){
  location.hash='#exams';
  setTimeout(()=>notify(msg),30);
 }else{
  switchTab('exams');
  notify(msg);
 }
}
function renderMatrices(){window.MatrixUI.mount($("#matrices"),{request,notify,context:store.context,ppct:store.bank.ppct,questions:store.bank?.questions||[],revisions:store.revisions,exams:store.exams,assessmentPlans:store.assessmentPlans||[],activeGrade:store.activeGrade,activeGrades:availableGrades(),onGradeChange:g=>setActiveGrade(g,{skipRender:true}),onExamCreated:e=>{if(e&&!store.exams.some(x=>x.id===e.id))store.exams.push(e);},onMatricesChanged:list=>{if(Array.isArray(list))store.matrixRecords=list;},onOpenInExamCreator:openMatrixInExamCreator,
 openReview:cell=>{if(cell?.grade)setActiveGrade(Number(cell.grade),{skipRender:true});store.reviewFilters=C.reviewFiltersForCell(cell);store.reviewIndex=0;location.hash='#review';}});}

// Keep download URLs tied to this tab's course, including newly rendered links.
function scopeDownloads(){document.querySelectorAll('a[href^="/api/"]').forEach(a=>{const href=apiUrl(a.getAttribute('href'));if(href!==a.getAttribute('href'))a.setAttribute('href',href);});}
new MutationObserver(scopeDownloads).observe(document.body,{childList:true,subtree:true});
scopeDownloads();
const coursePicker=document.getElementById('workspace-curriculum');
if(coursePicker)coursePicker.onchange=()=>{location.href='/app/?curriculum='+encodeURIComponent(coursePicker.value);};

// AI Assistant (Google Gemini) UI Integration
function initAiAssistant() {
  // Bộ đọc câu hỏi từ văn bản (Markdown, Word đã chuyển chữ) dùng chung cho Ngân hàng, Đề cương, Tạo đề (trước đây chỉ gọi được trong trợ lý AI).
  window.parseQuestionsFromRawText = parseQuestionsFromRawText;
  const btn = $('#btn-ai-assistant');
  const dialog = $('#ai-dialog');
  if (!btn || !dialog) return;

  const keyStatus = $('#gemini-key-status');
  const keyInput = $('#gemini-user-key');
  const saveKeyBtn = $('#btn-save-gemini-key');
  const clearKeyBtn = $('#btn-clear-gemini-key');

  const DEFAULT_GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-1.5-flash-8b',
    'gemini-2.0-flash-lite-preview-02-05'
  ];

  async function discoverAvailableGeminiModels(apiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error?.message || `HTTP ${res.status}`;
        if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
          throw new Error('Chìa khóa Google AI không hợp lệ hoặc đã hết hạn. Thầy/Cô vui lòng lấy chìa khóa mới trên aistudio.google.com.');
        }
        throw new Error(msg);
      }
      const data = await res.json();
      const list = (data.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''));

      // Sắp xếp ưu tiên các dòng Flash thế hệ mới
      const preferred = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-1.5-flash-8b',
        'gemini-2.5-pro'
      ];
      const result = [];
      for (const p of preferred) {
        if (list.includes(p)) result.push(p);
      }
      for (const m of list) {
        if (!result.includes(m) && (m.includes('flash') || m.includes('pro') || m.includes('gemini'))) {
          result.push(m);
        }
      }
      return result.length ? result : DEFAULT_GEMINI_MODELS;
    } catch (err) {
      console.warn('Lỗi khi truy vấn danh sách models:', err.message);
      return DEFAULT_GEMINI_MODELS;
    }
  }

  async function callGeminiWithAutoFallback(apiKey, requestPayload, onStatusUpdate) {
    let savedModels = [];
    try {
      savedModels = JSON.parse(localStorage.getItem('gemini_available_models') || '[]');
    } catch(e) {}
    if (!savedModels.length) {
      savedModels = await discoverAvailableGeminiModels(apiKey);
      localStorage.setItem('gemini_available_models', JSON.stringify(savedModels));
    }

    let lastError = null;
    const attempted = [];

    for (const modelId of savedModels) {
      attempted.push(modelId);
      if (typeof onStatusUpdate === 'function') {
        onStatusUpdate({ id: modelId, name: modelId });
      }
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData?.error?.message || `HTTP ${res.status}`;
          throw new Error(`[${modelId}] ${errMsg}`);
        }

        const data = await res.json();
        return { data, model: modelId, modelName: modelId, fallbackTriggered: attempted.length > 1 };
      } catch (err) {
        console.warn(`[Gemini Auto-Fallback] ${modelId} lỗi:`, err.message);
        lastError = err;
      }
    }
    throw lastError || new Error(`Đã thử các mô hình (${attempted.join(', ')}) nhưng đều gặp sự cố.`);
  }

  function checkStoredKey() {
    const key = localStorage.getItem('gemini_user_api_key');
    const quickStatus = $('#ai-quick-status-text');
    if (key && keyInput) {
      keyInput.value = key;
      if (keyStatus) {
        keyStatus.innerHTML = '<span style="color:#1F6B52">✓ Đã kết nối chìa khóa Google AI an toàn trên máy Thầy/Cô.</span><br><small style="color:#2E3646;">Tự động chuyển đổi thông minh: <code>gemini-1.5-flash</code> → <code>gemini-2.0-flash</code> → <code>gemini-1.5-pro</code></small>';
      }
      if (quickStatus) {
        quickStatus.innerHTML = '<span style="color:#1F6B52;font-weight:600">Đã kết nối và sẵn sàng nhận diện đề thi </span>';
      }
    } else {
      if (keyStatus) {
        keyStatus.innerHTML = '<span style="color:#8A5A00">Chưa cài đặt chìa khóa. Thầy/Cô làm theo 3 bước hướng dẫn bên dưới để nhận miễn phí nhé.</span>';
      }
      if (quickStatus) {
        quickStatus.innerHTML = '<span style="color:#8A5A00;font-weight:600">Chưa gắn chìa khóa AI (Bấm "Đổi chìa khóa AI" bên phải để kết nối trong 1 phút) </span>';
      }
    }
  }

  // Nút chuyển nhanh sang cài đặt chìa khóa
  const quickKeyBtn = $('#btn-quick-setup-key');
  if (quickKeyBtn) {
    quickKeyBtn.onclick = () => {
      dialog.querySelector('[data-ai-tab="key"]')?.click();
    };
  }

  // Nút Dán câu hỏi mẫu cho giáo viên thử ngay lập tức (kèm công thức LaTeX)
  const sampleRawBtn = $('#btn-fill-sample-raw');
  if (sampleRawBtn) {
    sampleRawBtn.onclick = () => {
      const rawTextarea = $('#ai-parse-raw-text');
      if (rawTextarea) {
        rawTextarea.value = `Câu 1: Phương trình bậc hai $x^2 - 3x + 2 = 0$ có tập nghiệm là:
A. $\\{1; 2\\}$
B. $\\{-1; -2\\}$
C. $\\{1; -2\\}$
D. $\\{-1; 2\\}$
Đáp án: A

Câu 2: Cho các phát biểu sau về an toàn thông tin trên mạng Internet:
a) Cần đặt mật khẩu mạnh gồm chữ hoa, chữ thường, số và ký tự đặc biệt. [Đúng]
b) Có thể chia sẻ mật khẩu tài khoản học tập cho bạn bè khi cần nhờ làm bài giúp. [Sai]
c) Không nên nhấp vào các đường liên kết lạ được gửi qua email hoặc tin nhắn. [Đúng]
d) Mọi thông tin chia sẻ trên mạng xã hội đều hoàn toàn chính xác và đáng tin cậy. [Sai]

Câu 3: Đơn vị đo lượng thông tin cơ bản trong máy tính là gì?
Đáp án: Byte`;
        notify('Đã dán câu hỏi mẫu (kèm công thức toán LaTeX)! Thầy/Cô bấm "Bắt đầu nhận diện & Xếp câu hỏi" để thử nhé.');
      }
    };
  }

  // Nút Xóa khung soạn thảo
  const clearRawBtn = $('#btn-clear-raw-text');
  if (clearRawBtn) {
    clearRawBtn.onclick = () => {
      const rawTextarea = $('#ai-parse-raw-text');
      if (rawTextarea) {
        rawTextarea.value = '';
        rawTextarea.focus();
      }
    };
  }

  // Xử lý Tải tệp lên (.json, .md, .txt) & Kéo thả
  const dropZone = $('#ai-file-dropzone');
  const fileInput = $('#ai-file-input');
  const downloadSampleBtn = $('#btn-download-ai-sample');
  const downloadSampleJsonBtn = $('#btn-download-sample-json');
  const downloadSampleMdBtn = $('#btn-download-sample-md');
  const copyPromptBtn = $('#btn-copy-ai-prompt');

  if (dropZone && fileInput) {
    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#1F6B52';
      dropZone.style.background = '#EEF6F2';
    };
    dropZone.ondragleave = () => {
      dropZone.style.borderColor = '#4A3AA8';
      dropZone.style.background = '#F2F0FB';
    };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#4A3AA8';
      dropZone.style.background = '#F2F0FB';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processUploadedAiFile(e.dataTransfer.files[0]);
      }
    };
    fileInput.onchange = () => {
      if (fileInput.files && fileInput.files[0]) {
        processUploadedAiFile(fileInput.files[0]);
      }
    };
  }

  function normalizeImportedQuestions(rawItems, grade, subj) {
    if (!Array.isArray(rawItems)) return [];
    return rawItems.map((raw) => {
      const q = { ...raw };
      q.id = q.id || `K${grade}-GV-${Math.random().toString(36).slice(2, 9)}`;
      q.grade = Number(q.grade || grade);
      q.subject_name = q.subject_name || subj;
      q.lesson_code = q.lesson_code || 'B1';
      q.review_status = 'draft';

      if (!q.type) {
        if (q.options && q.options.length) q.type = 'MC';
        else if (q.statements && q.statements.length) q.type = 'YN';
        else if (q.short_answer || q.answer) q.type = 'SHORT';
        else if (q.rubric) q.type = 'ES';
        else q.type = 'MC';
      }

      const lvlMap = {
        'nhận biết': 'Biết', 'b': 'Biết', 'biết': 'Biết', 'knowledge': 'Biết', 'remember': 'Biết',
        'thông hiểu': 'Hiểu', 'h': 'Hiểu', 'hiểu': 'Hiểu', 'comprehension': 'Hiểu', 'understand': 'Hiểu',
        'vận dụng': 'Vận dụng', 'vd': 'Vận dụng', 'apply': 'Vận dụng', 'application': 'Vận dụng',
        'vận dụng cao': 'Vận dụng cao', 'vdc': 'Vận dụng cao', 'analysis': 'Vận dụng cao', 'create': 'Vận dụng cao'
      };
      if (q.level) {
        const lowerLvl = String(q.level).trim().toLowerCase();
        q.level = lvlMap[lowerLvl] || q.level;
      } else {
        q.level = 'Biết';
      }

      if (q.type === 'MC') {
        if (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) {
          q.options = [q.options.A || q.options.a || '', q.options.B || q.options.b || '', q.options.C || q.options.c || '', q.options.D || q.options.d || ''];
        }
        if (typeof q.correct === 'string') {
          const cUpper = q.correct.trim().toUpperCase();
          q.correct = 'ABCD'.indexOf(cUpper) >= 0 ? 'ABCD'.indexOf(cUpper) : 0;
        }
      }

      if (q.type === 'YN' && Array.isArray(q.statements)) {
        q.statements = q.statements.map((st, si) => ({
          label: st.label || 'abcd'[si] || 'a',
          text: st.text || st.content || '',
          correct: Boolean(st.correct || st.answer === true || String(st.correct).toLowerCase() === 'đúng' || String(st.correct).toLowerCase() === 'true')
        }));
      }

      if (q.type === 'SHORT' && !q.short_answer && q.answer) {
        q.short_answer = String(q.answer);
      }

      return q;
    }).filter(q => q && q.question);
  }

  function extractAnswersFromDocText(text) {
    const ansMap = {};
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(?:Câu\s*)?(\d+)[\s.:\-_]+([A-D])$/i);
      if (m) ansMap[Number(m[1])] = 'ABCD'.indexOf(m[2].toUpperCase());
      if (lines[i] === 'Câu') {
        let j = i + 1;
        const nums = [];
        while (j < lines.length && /^\d+$/.test(lines[j])) {
          nums.push(Number(lines[j]));
          j++;
        }
        if (j < lines.length && /^(?:Đáp án|Đáp án đúng)$/i.test(lines[j])) {
          j++;
          let k = 0;
          while (j < lines.length && /^[A-D]$/i.test(lines[j]) && k < nums.length) {
            ansMap[nums[k]] = 'ABCD'.indexOf(lines[j].toUpperCase());
            j++;
            k++;
          }
        }
      }
    }
    return ansMap;
  }

  function parseQuestionsFromRawText(rawText, defaultGrade, defaultSubject) {
    if (!rawText || typeof rawText !== 'string') return [];
    const questions = [];
    const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const ansMap = extractAnswersFromDocText(text);
    // Hỗ trợ tách câu dạng "Câu 1:", "### Câu 1:", "**Câu 1:**", "- Câu 1:"
    const qSplits = text.split(/\n(?=(?:[#*\s-]*)(?:Câu|Question)\s*[\d]+[:.])/i);

    for (const block of qSplits) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      if (/MA TRẬN|BẢNG ĐẶC TẢ|HƯỚNG DẪN CHẤM|Tỉ lệ % điểm/i.test(trimmed) && !trimmed.includes('A.') && !trimmed.includes('a)')) continue;

      const cleanHeading = trimmed.replace(/^[#*\s-]+/, '');
      const mHeading = cleanHeading.match(/^(?:Câu|Question)\s*([\d]+)[:.]\s*(.*)/i);
      if (!mHeading) continue;
      const qNum = Number(mHeading[1]);

      // Trích xuất Mức độ nếu có trong Markdown (ví dụ: *Mức độ:* Thông hiểu, [Mức độ: Vận dụng]...)
      let extractedLevel = '';
      const mLevel = trimmed.match(/(?:Mức độ|Level)\s*[:=]?\s*[*_`\[]?\s*(Biết|Hiểu|Thông hiểu|Nhận biết|Vận dụng cao|Vận dụng)/i);
      if (mLevel) {
        const lStr = mLevel[1].toLowerCase();
        if (lStr.includes('cao')) extractedLevel = 'Vận dụng cao';
        else if (lStr.includes('vận dụng') || lStr.includes('van dung')) extractedLevel = 'Vận dụng';
        else if (lStr.includes('hiểu') || lStr.includes('hieu')) extractedLevel = 'Hiểu';
        else if (lStr.includes('biết') || lStr.includes('biet')) extractedLevel = 'Biết';
      }

      // Trích xuất Bài học nếu có (ví dụ: *Bài học:* B2, *Bài:* 2, [Bài 1]...)
      let extractedLesson = '';
      const mLesson = trimmed.match(/(?:Bài học|Bài|Lesson)\s*[:=]?\s*[*_`\[]?\s*(?:B\s*)?(\d+[a-zA-Z]?)/i);
      if (mLesson) {
        extractedLesson = 'B' + mLesson[1];
      }

      // Trích xuất Lời giải / Giải thích nếu có
      let extractedExplanation = '';
      const mExp = trimmed.match(/(?:Lời giải|Giải thích|Explanation|Hướng dẫn giải)\s*[:=]?\s*[*_`]?\s*(.*?)(?=\n\s*(?:[*_`]*(?:Mức độ|Bài|YCCĐ|Năng lực|NL)|$))/is);
      if (mExp) {
        extractedExplanation = mExp[1].trim();
      }

      // Trích xuất YCCĐ nếu có
      let extractedOutcome = '';
      const mOutcome = trimmed.match(/(?:Yêu cầu cần đạt|YCCĐ|Mục tiêu|Outcome)\s*[:=]?\s*[*_`\[]?\s*(.*?)(?=\n|$)/i);
      if (mOutcome) extractedOutcome = mOutcome[1].trim().replace(/[*_`\]]+$/, '');

      // Trích xuất Năng lực nếu có (ví dụ: *Năng lực:* NLa, [NLb]...)
      let extractedCompetency = '';
      const mComp = trimmed.match(/(?:Thành phần năng lực|Năng lực|Competency|\bNL)\s*[:=]?\s*[*_`\[]?\s*(NL[a-e]|NL[A-E])/i);
      if (mComp) extractedCompetency = 'NL' + mComp[1].slice(2).toLowerCase();

      const optMatches = [...trimmed.matchAll(/(?:^|\n)\s*(?:[-*]\s*)?([A-D])[\.\)]\s*(.*?)(?=(?:\n\s*(?:[-*]\s*)?[A-D][\.\)]|\n\s*(?:[-*]\s*)?[*_`]*(?:Đáp án|Đáp án đúng|Answer|Chọn|Lời giải|Giải thích|Mức độ|Bài)|\s*$))/gs)];
      // Hỗ trợ cả 2 dạng Đúng/Sai: "a) [Đúng] Nội dung" và "a) Nội dung [Đúng]"
      const ynMatches = [...trimmed.matchAll(/(?:^|\n)\s*(?:[-*]\s*)?([a-d])[\.\)]\s*(?:(?:\[|\()([*_`]*)(Đúng|Sai|True|False)([*_`]*)(?:\]|\))\s*(.*?)|(.*?)\s*(?:\[|\()([*_`]*)(Đúng|Sai|True|False)([*_`]*)(?:\]|\)))(?=(?:\n\s*(?:[-*]\s*)?[a-d][\.\)]|\n\s*(?:[-*]\s*)?[*_`]*(?:Đáp án|Mức độ|Bài|Lời giải)|\s*$))/gis)];

      if (ynMatches.length >= 2) {
        const qText = trimmed.split(/(?:^|\n)\s*(?:[-*]\s*)?[a-d][\.\)]/i)[0]
          .replace(/^[#*\s-]+/, '')
          .replace(/^(?:Câu|Question)\s*[\d]+[:.]\s*/i, '')
          .replace(/\*\*$/, '')
          .trim();
        questions.push({
          id: `K${defaultGrade}-GV-${Math.random().toString(36).slice(2, 9)}`,
          grade: defaultGrade,
          subject_name: defaultSubject,
          lesson_code: extractedLesson || 'B1',
          type: 'YN',
          level: extractedLevel || 'Hiểu',
          learning_outcome: extractedOutcome,
          competency: extractedCompetency,
          question: qText || 'Cho các mệnh đề sau:',
          statements: ynMatches.map(m => {
            const isPrefix = Boolean(m[3]);
            const tfStr = isPrefix ? m[3] : (m[8] || '');
            const statementText = (isPrefix ? m[5] : (m[6] || '')).trim().replace(/\*\*$/, '');
            return {
              label: m[1].toLowerCase(),
              text: statementText,
              correct: /Đúng|True/i.test(tfStr)
            };
          }),
          review_status: 'draft'
        });
      } else if (optMatches.length >= 2) {
        const firstOptIndex = trimmed.search(/(?:^|\n)\s*(?:[-*]\s*)?[A-D][\.\)]/);
        const qText = trimmed.slice(0, firstOptIndex)
          .replace(/^[#*\s-]+/, '')
          .replace(/^(?:Câu|Question)\s*[\d]+[:.]\s*/i, '')
          .replace(/\*\*$/, '')
          .trim();
        const options = optMatches.slice(0, 4).map(m => m[2].trim().replace(/\*\*$/, ''));
        while (options.length < 4) options.push('');

        let correct = 0;
        const ansMatch = trimmed.match(/(?:Đáp án|Đáp án đúng|Answer|Chọn)\s*[:=]?\s*[*_`\[\s]*([A-D])[*_`\]\s]*/i);
        if (ansMatch) {
          correct = 'ABCD'.indexOf(ansMatch[1].toUpperCase());
          if (correct < 0) correct = 0;
        } else if (ansMap[qNum] !== undefined) {
          correct = ansMap[qNum];
        }

        const expList = ['', '', '', ''];
        if (extractedExplanation) {
          expList[correct] = extractedExplanation;
        }

        questions.push({
          id: `K${defaultGrade}-GV-${Math.random().toString(36).slice(2, 9)}`,
          grade: defaultGrade,
          subject_name: defaultSubject,
          lesson_code: extractedLesson || 'B1',
          type: 'MC',
          level: extractedLevel || 'Biết',
          learning_outcome: extractedOutcome,
          competency: extractedCompetency,
          question: qText,
          options,
          correct,
          option_explanations: expList,
          review_status: 'draft'
        });
      } else {
        const ansMatch = trimmed.match(/(?:[*_`\s]*)(?:Đáp án|Đáp án đúng|Answer|Trả lời)\s*[:=]\s*[*_`]?([^\n*_`]+)/i);
        if (ansMatch) {
          const qText = trimmed.slice(0, ansMatch.index)
            .replace(/^[#*\s-]+/, '')
            .replace(/^(?:Câu|Question)\s*[\d]+[:.]\s*/i, '')
            .replace(/\*\*$/, '')
            .trim();
          questions.push({
            id: `K${defaultGrade}-GV-${Math.random().toString(36).slice(2, 9)}`,
            grade: defaultGrade,
            subject_name: defaultSubject,
            lesson_code: extractedLesson || 'B1',
            type: 'SHORT',
            level: extractedLevel || 'Vận dụng',
            learning_outcome: extractedOutcome,
            competency: extractedCompetency,
            question: qText,
            short_answer: ansMatch[1].trim(),
            review_status: 'draft'
          });
        } else {
          const qText = trimmed
            .replace(/^[#*\s-]+/, '')
            .replace(/^(?:Câu|Question)\s*[\d]+[:.]\s*/i, '')
            .trim();
          if (qText.length > 15) {
            questions.push({
              id: `K${defaultGrade}-GV-${Math.random().toString(36).slice(2, 9)}`,
              grade: defaultGrade,
              subject_name: defaultSubject,
              lesson_code: extractedLesson || 'B1',
              type: 'ES',
              level: extractedLevel || 'Vận dụng',
              learning_outcome: extractedOutcome,
              competency: extractedCompetency,
              question: qText,
              max_score: 1,
              review_status: 'draft'
            });
          }
        }
      }
    }
    return questions;
  }

  function displayParsedQuestions(questionsList, grade, subj) {
    window._aiParsedQuestions = questionsList;
    const reviewCount = $('#ai-review-count');
    if (reviewCount) reviewCount.textContent = questionsList.length;
    const foundCount = $('#ai-found-count');
    if (foundCount) foundCount.textContent = questionsList.length;

    const resContainer = $('#ai-parsed-results-container');
    if (resContainer) {
      resContainer.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:#F3F4F8;border-radius:6px;">
          <span style="font-size:13px;"><strong>Đã nhận diện thành công ${questionsList.length} câu hỏi.</strong></span>
          <div style="display:flex;gap:6px;">
            <button type="button" class="quiet" id="btn-ai-select-all" style="font-size:11px;">Chọn tất cả</button>
            <button type="button" class="quiet" id="btn-ai-deselect-all" style="font-size:11px;">Bỏ chọn tất cả</button>
          </div>
        </div>
        ${questionsList.map((q, idx) => buildQuestionCardHtml(q, idx, 'aiparse')).join('')}
      `;

      bindCardEvents(resContainer, questionsList, 'aiparse', grade, questionsList[0]?.lesson_code || 'B1', subj);

      const selAll = $('#btn-ai-select-all');
      const deselAll = $('#btn-ai-deselect-all');
      if (selAll) selAll.onclick = () => resContainer.querySelectorAll('.aiparse-select-chk').forEach(c => c.checked = true);
      if (deselAll) deselAll.onclick = () => resContainer.querySelectorAll('.aiparse-select-chk').forEach(c => c.checked = false);

      setTimeout(() => renderLatex(resContainer), 50);
    }

    dialog.querySelector('[data-ai-tab="results"]')?.click();
  }

  async function processUploadedAiFile(file) {
    if (!file) return;
    const grade = Number($('#ai-parse-grade')?.value || 10);
    const subj = $('#ai-parse-subject')?.value || 'Tin học';
    const filename = file.name.toLowerCase();

    // Tự động nhận diện khối từ tên tệp (ví dụ: TIN 9, KHOI 9, K9)
    const fileGrade = (typeof TableFileHelper !== 'undefined') ? TableFileHelper.detectGradeFromFilename(file.name) : null;
    const mGrade = fileGrade ? [String(fileGrade), String(fileGrade)] : null;
    const effectiveGrade = fileGrade || grade;
    if (mGrade && $('#ai-parse-grade')) {
      $('#ai-parse-grade').value = String(effectiveGrade);
    }

    try {
      let text = '';
      if (filename.endsWith('.docx')) {
        if (typeof mammoth !== 'undefined') {
          const ab = await file.arrayBuffer();
          const res = await mammoth.extractRawText({ arrayBuffer: ab });
          text = res.value || '';
        } else {
          throw new Error('Thư viện đọc Word (.docx) đang nạp, thầy/cô vui lòng thử lại sau 2 giây.');
        }
      } else {
        text = await file.text();
      }

      if (filename.endsWith('.json')) {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          throw new Error('Tệp JSON không hợp lệ hoặc bị lỗi cú pháp: ' + e.message);
        }
        const rawItems = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.bank?.questions || parsed.items || []);
        if (!rawItems.length) {
          throw new Error('Tệp JSON không chứa danh sách câu hỏi hợp lệ.');
        }
        const questionsList = normalizeImportedQuestions(rawItems, effectiveGrade, subj);
        displayParsedQuestions(questionsList, effectiveGrade, subj);
        notify(`Đã đọc thành công ${questionsList.length} câu hỏi từ tệp JSON! Thầy/Cô kiểm tra lại rồi bấm nút Lưu nhé.`);
      } else {
        const rawTextarea = $('#ai-parse-raw-text');
        if (rawTextarea) rawTextarea.value = text;

        const localParsed = parseQuestionsFromRawText(text, effectiveGrade, subj);
        if (localParsed.length >= 1) {
          displayParsedQuestions(localParsed, effectiveGrade, subj);
          notify(`Đã tự động nhận diện thành công ${localParsed.length} câu hỏi từ tệp ${file.name}! Thầy/Cô có thể Lưu ngay hoặc bấm "Bắt đầu nhận diện bằng AI" nếu muốn ánh xạ sâu.`);
        } else {
          notify(`Đã nạp nội dung tệp ${file.name} vào khung soạn thảo. Thầy/Cô bấm nút "Bắt đầu nhận diện & Xếp câu hỏi" bên dưới nhé.`);
        }
      }
    } catch (err) {
      notify('Lỗi khi đọc tệp: ' + err.message, true);
    }
  }

  // Tải mẫu JSON câu hỏi
  const triggerDownloadSampleJson = () => {
    const curGrade = Number($('#ai-parse-grade')?.value || 9);
    const curSubj = $('#ai-parse-subject')?.value || subject();
    const sampleData = sampleQuestionsByGrade(curGrade, curSubj);
    triggerTextDownload(JSON.stringify(sampleData, null, 2), 'application/json;charset=utf-8', `exammatrix_mau_cau_hoi_khoi_${curGrade}.json`);
    notify(`Đã tải xuống tệp mẫu exammatrix_mau_cau_hoi_khoi_${curGrade}.json!`);
  };

  if (downloadSampleBtn) downloadSampleBtn.onclick = triggerDownloadSampleJson;
  if (downloadSampleJsonBtn) downloadSampleJsonBtn.onclick = triggerDownloadSampleJson;

  // Tải mẫu Markdown (.md) câu hỏi
  if (downloadSampleMdBtn) {
    downloadSampleMdBtn.onclick = () => {
      const curGrade = Number($('#ai-parse-grade')?.value || 9);
      const curSubj = $('#ai-parse-subject')?.value || subject();
      const cap = curGrade >= 10 ? 'THPT (CV 7991)' : 'THCS';
      const sampleMd = `# Ngân hàng câu hỏi ${curSubj} Khối ${curGrade} · ${cap}\n\n${sampleMdBodyByGrade(curGrade)}\n`;
      triggerTextDownload(sampleMd, 'text/markdown;charset=utf-8', `exammatrix_mau_cau_hoi_khoi_${curGrade}.md`);
      notify(`Đã tải xuống tệp mẫu exammatrix_mau_cau_hoi_khoi_${curGrade}.md!`);
    };
  }

  // Chép Prompt AI
  if (copyPromptBtn) {
    copyPromptBtn.onclick = async () => {
      const curGrade = Number($('#ai-parse-grade')?.value || 9);
      const curSubj = $('#ai-parse-subject')?.value || subject();
      const isThpt = curGrade >= 10;
      const isInformatics = /tin\s*h[oọ]c/i.test(curSubj);
      const scopeRule = isThpt
        ? `- Cấp THPT (${nlsCodeForGrade(curGrade)} · CV 7991): hỗ trợ đủ 4 dạng MC, YN, SHORT, ES.\n- Gắn "ppct_section": "core" cho Nội dung cốt lõi (Mục II.1: B1, B2...) và "ppct_section": "elective_topic"${isInformatics ? ' (kèm "orientation": "ICT" hoặc "CS")' : ''} cho Chuyên đề học tập (Mục II.2: CD1, CD2..., chỉ dùng KTTX theo Điều 6.3 TT 22/2021).`
        : `- Cấp THCS (${nlsCodeForGrade(curGrade)}): KHÔNG có Chuyên đề học tập (toàn bộ "ppct_section": "core"); ưu tiên dạng MC và ES.`;
      const thptSchemas = isThpt ? `,
  {
    "type": "YN",
    "level": "Hiểu",
    "lesson_code": "B1",
    "ppct_section": "core",
    "learning_outcome": "Gắn đúng Yêu cầu cần đạt...",
    "competency": "NLb",
    "question": "Câu dẫn ngữ liệu chung của câu Đúng/Sai (>= 25 kí tự)...",
    "statements": [
      {"label": "a", "text": "Nội dung ý a (Biết)", "correct": true},
      {"label": "b", "text": "Nội dung ý b (Biết/Hiểu)", "correct": false},
      {"label": "c", "text": "Nội dung ý c (Hiểu)", "correct": true},
      {"label": "d", "text": "Nội dung ý d (Vận dụng)", "correct": false}
    ]
  },
  {
    "type": "SHORT",
    "level": "Vận dụng",
    "lesson_code": "B1",
    "ppct_section": "core",
    "learning_outcome": "Gắn đúng Yêu cầu cần đạt...",
    "competency": "NLc",
    "question": "Câu hỏi trả lời ngắn (ghi rõ đơn vị tính và quy ước làm tròn trong câu dẫn)...",
    "short_answer": "42"
  }` : '';
      const promptContent = `Hãy biên soạn hoặc chuyển đổi toàn bộ câu hỏi trong đề thi / tài liệu sau thành định dạng JSON chuẩn cho hệ thống ExamMatrix Studio môn ${curSubj} Khối ${curGrade}:
${scopeRule}

QUY CHUẨN GÁN NHÃN BẮT BUỘC (GDPT 2018 MÔN TIN HỌC):
- "learning_outcome": Gắn Yêu cầu cần đạt tương ứng theo PPCT của bài học.
- "competency": Gắn đúng 01 mã thành phần năng lực Tin học GDPT 2018: "NLa" (Sử dụng CNTT), "NLb" (Ứng xử số/Bản quyền/An toàn), "NLc" (Giải quyết vấn đề/Lập trình/Dữ liệu), "NLd" (Ứng dụng/Tự học), hoặc "NLe" (Hợp tác trong MT số).

${cv7991QuestionRulesBlock(curGrade, curSubj, 'IMPORT')}

[
  {
    "type": "MC",
    "level": "Biết",
    "lesson_code": "B1",
    "ppct_section": "core",
    "learning_outcome": "Yêu cầu cần đạt của bài học...",
    "competency": "NLa",
    "question": "Nội dung câu hỏi (chấp nhận công thức LaTeX $...$ nếu có)",
    "options": ["Phương án A", "Phương án B", "Phương án C", "Phương án D"],
    "correct": 0,
    "option_explanations": ["Giải thích phương án A", "Giải thích B", "Giải thích C", "Giải thích D"]
  }${thptSchemas},
  {
    "type": "ES",
    "level": "Vận dụng",
    "lesson_code": "B2",
    "ppct_section": "core",
    "learning_outcome": "Yêu cầu cần đạt của bài học...",
    "competency": "NLc",
    "question": "Nội dung câu tự luận (nêu rõ tình huống, yêu cầu thực hiện và tiêu chí cần đạt)...",
    "rubric": [
      {"criterion": "Tiêu chí 1", "points": 0.25},
      {"criterion": "Tiêu chí 2", "points": 0.25},
      {"criterion": "Tiêu chí 3", "points": 0.25},
      {"criterion": "Tiêu chí 4", "points": 0.25}
    ],
    "equivalent_answer_policy": "Chấp nhận đáp án tương đương hợp lí."
  }
]
Dưới đây là đề thi / yêu cầu cần chuyển đổi:
[DÁN ĐỀ THI HOẶC YÊU CẦU CỦA THẦY/CÔ VÀO ĐÂY]`;
      try {
        await navigator.clipboard.writeText(promptContent);
        notify('Đã sao chép câu lệnh mẫu (Prompt) cho ChatGPT/Gemini vào bộ nhớ đệm!');
      } catch (e) {
        notify('Không thể sao chép tự động: ' + e.message, true);
      }
    };
  }

  if (saveKeyBtn) {
    saveKeyBtn.onclick = async () => {
      const key = (keyInput ? keyInput.value : '').trim();
      if (!key) {
        if (keyStatus) keyStatus.innerHTML = '<span style="color:#C62828">Vui lòng nhập Chìa khóa Google AI.</span>';
        return;
      }
      if (keyStatus) keyStatus.textContent = '⏳ Đang kiểm tra chìa khóa và tìm kiếm mô hình khả dụng...';
      saveKeyBtn.disabled = true;
      try {
        const models = await discoverAvailableGeminiModels(key);
        if (!models || !models.length) {
          throw new Error('Không tìm thấy mô hình generateContent nào được bật cho tài khoản này.');
        }

        // Thử ping model đầu tiên
        const topModel = models[0];
        if (keyStatus) keyStatus.textContent = `⏳ Đang thử kết nối mô hình: ${topModel}...`;
        const pingUrl = `https://generativelanguage.googleapis.com/v1beta/models/${topModel}:generateContent?key=${key}`;
        const pingRes = await fetch(pingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: '1+1=' }] }] })
        });
        if (!pingRes.ok) {
          const errData = await pingRes.json().catch(() => ({}));
          throw new Error(`[${topModel}] ${errData?.error?.message || 'Không thể tạo nội dung'}`);
        }

        localStorage.setItem('gemini_user_api_key', key);
        localStorage.setItem('gemini_available_models', JSON.stringify(models));

        if (keyStatus) {
          keyStatus.innerHTML = `<span style="color:#1F6B52;font-weight:700">✓ Kết nối thành công với Google Gemini!</span><br><small style="color:#1F6B52;">Mô hình tối ưu: <strong>${esc(topModel)}</strong> (Đã kích hoạt tự động chuyển đổi giữa ${models.length} mô hình của tài khoản).</small>`;
        }
        checkStoredKey();
        notify(`Đã lưu chìa khóa Google AI thành công! Mô hình đang dùng: ${topModel}`);
        setTimeout(() => {
          dialog.querySelector('[data-ai-tab="parse"]')?.click();
        }, 1200);
      } catch(err) {
        if (keyStatus) keyStatus.innerHTML = `<span style="color:#C62828">Không thể kết nối Gemini: ${esc(err.message)}</span>`;
      } finally {
        saveKeyBtn.disabled = false;
      }
    };
  }

  if (clearKeyBtn) {
    clearKeyBtn.onclick = () => {
      localStorage.removeItem('gemini_user_api_key');
      if (keyInput) keyInput.value = '';
      if (keyStatus) keyStatus.innerHTML = '<span style="color:#5B6475">Đã xóa chìa khóa.</span>';
      checkStoredKey();
      notify('Đã xóa chìa khóa Google AI.');
    };
  }

  // Switch tabs in AI modal
  dialog.querySelectorAll('[data-ai-tab]').forEach(tabBtn => {
    tabBtn.onclick = () => {
      dialog.querySelectorAll('[data-ai-tab]').forEach(b => {
        b.classList.remove('active');
        b.style.background = '#F7F8FB';
        b.style.color = '#1C2333';
        b.style.borderColor = '#E4E7F0';
      });
      tabBtn.classList.add('active');
      tabBtn.style.background = '#4A3AA8';
      tabBtn.style.borderColor = '#4A3AA8';
      tabBtn.style.color = '#fff';

      const tabId = tabBtn.dataset.aiTab;
      dialog.querySelectorAll('.ai-pane').forEach(p => p.hidden = true);
      const pane = $(`#ai-pane-${tabId}`);
      if (pane) pane.hidden = false;
    };
  });

  btn.onclick = () => {
    checkStoredKey();
    const curSubj = store.selectedSubject || 'Tin học';
    if ($('#ai-parse-subject')) $('#ai-parse-subject').value = curSubj;
    // Luôn ưu tiên mở thẳng Bước 1: Dán đề thi
    dialog.querySelector('[data-ai-tab="parse"]')?.click();
    dialog.showModal();
  };

  function buildQuestionCardHtml(q, idx, prefix) {
    const cid = `${prefix}-${idx}`;
    const isMc = (q.type || 'MC') === 'MC';
    const isYn = q.type === 'YN';
    const opts = q.options || ['', '', '', ''];
    const corr = q.correct;

    const friendlyTypes = {
      MC: 'Trắc nghiệm 4 lựa chọn (A-B-C-D)',
      YN: 'Trắc nghiệm Đúng / Sai (4 ý)',
      SHORT: 'Trả lời ngắn / Điền khuyết',
      ES: 'Tự luận'
    };
    const friendlyLevels = {
      'Biết': 'Nhận biết',
      'Hiểu': 'Thông hiểu',
      'Vận dụng': 'Vận dụng',
      'Vận dụng cao': 'Vận dụng cao'
    };

    return `
      <div class="card" id="card-${cid}" style="margin-bottom:14px;padding:16px;background:#ffffff;border:1px solid #E4E7F0;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.03)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <label style="font-weight:700;color:var(--navy,#1C2333);font-size:15px;display:flex;align-items:center;gap:6px">
            <input type="checkbox" class="${prefix}-select-chk" data-idx="${idx}" checked>
            <span>Câu ${idx + 1}</span>
            <span class="badge" style="background:#F2F0FB;color:#4A3AA8;font-size:11px;padding:3px 8px">${esc(friendlyTypes[q.type || 'MC'] || q.type)}</span>
            <span class="badge" style="background:#F3F4F8;color:#4A5263;font-size:11px;padding:3px 8px">${esc(friendlyLevels[q.level || 'Biết'] || q.level)}</span>
            ${q.competency ? `<span class="badge" style="background:#FBF4E4;color:#8A5A00;font-size:11px;padding:3px 8px;font-weight:700">${esc(q.competency.toUpperCase())}</span>` : ''}
          </label>
          <button type="button" class="quiet" data-toggle-edit="${cid}" style="font-size:12.5px;cursor:pointer;color:#4A3AA8;font-weight:600">Xem chi tiết & Sửa</button>
        </div>

        <!-- Preview block -->
        <div id="${cid}-preview">
          <p style="margin:0 0 8px;font-size:15px;white-space:pre-wrap" id="${cid}-prev-q">${esc(q.question || '')}</p>
          ${isMc ? `
            <div id="${cid}-prev-opts" style="padding-left:8px">
              ${opts.map((opt, oi) => `
                <p style="margin:3px 0;color:${oi === corr ? 'green;font-weight:bold' : '#333'}">
                  ${String.fromCharCode(65 + oi)}. ${esc(opt)} ${oi === corr ? '✓ (Đáp án đúng)' : ''}
                </p>
              `).join('')}
            </div>
          ` : ''}
          ${isYn && q.statements ? `
            <div id="${cid}-prev-stmts" style="padding-left:8px">
              ${q.statements.map(st => `
                <p style="margin:3px 0"><b>${esc(st.label)})</b> ${esc(st.text)} <i>[${st.correct ? 'ĐÚNG' : 'SAI'}]</i></p>
              `).join('')}
            </div>
          ` : ''}
          ${q.type === 'SHORT' && C.shortAnswerOf(q) ? `
            <p style="margin:4px 0;font-size:13px"><strong>Đáp án trả lời ngắn:</strong> ${esc(C.shortAnswerOf(q))}</p>
          ` : ''}
          ${q.option_explanations && q.option_explanations.length ? `
            <p style="margin-top:8px;font-size:13px;color:#555;border-top:1px dashed #E4E7F0;padding-top:6px">
              <em>Lời giải: ${esc(q.option_explanations[corr] || q.option_explanations.join('; '))}</em>
            </p>
          ` : ''}
          ${qualityWarningsHtml(q)}
        </div>

        <!-- Edit block (hidden by default) -->
        <div id="${cid}-editor" hidden style="margin-top:10px;padding-top:10px;border-top:1px dashed #D5D9E4;background:#F3F4F8;padding:10px;border-radius:6px">
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Nội dung câu hỏi:</label>
          <textarea id="${cid}-edit-q" rows="3" style="width:100%;padding:6px;box-sizing:border-box;margin-bottom:8px;font-family:inherit">${esc(q.question || '')}</textarea>

          ${isMc ? `
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Phương án & Chọn đáp án đúng:</label>
            ${opts.map((opt, oi) => `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <input type="radio" name="${cid}-correct-radio" value="${oi}" ${oi === corr ? 'checked' : ''}>
                <span style="font-weight:bold;width:18px">${String.fromCharCode(65 + oi)}.</span>
                <input type="text" id="${cid}-opt-${oi}" value="${esc(opt)}" style="flex:1;padding:5px;box-sizing:border-box">
              </div>
            `).join('')}
          ` : ''}
          ${isYn ? `
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">4 mệnh đề Đúng / Sai (chuẩn CV 7991):</label>
            <div class="yn-edit-grid">
              ${[0, 1, 2, 3].map(si => {
                const st = (q.statements && q.statements[si]) || { label: 'abcd'[si], text: '', correct: false };
                return `<div class="yn-edit-row">
                  <div class="field">
                    <label for="${cid}-yn-text-${si}">Ý ${esc(st.label || 'abcd'[si])})</label>
                    <input type="text" id="${cid}-yn-text-${si}" value="${esc(st.text || '')}" style="width:100%;padding:5px;box-sizing:border-box">
                  </div>
                  <div class="field">
                    <label for="${cid}-yn-ok-${si}">Đáp án</label>
                    <select id="${cid}-yn-ok-${si}" style="width:100%;padding:5px">
                      ${opt('true', 'Đúng', Boolean(st.correct))}
                      ${opt('false', 'Sai', !st.correct)}
                    </select>
                  </div>
                </div>`;
              }).join('')}
            </div>
          ` : ''}
          ${q.type === 'SHORT' ? `
            <label for="${cid}-edit-short" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Đáp án trả lời ngắn:</label>
            <input type="text" id="${cid}-edit-short" value="${esc(C.shortAnswerOf(q))}" style="width:100%;padding:5px;box-sizing:border-box;margin-bottom:8px">
          ` : ''}

          <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:8px;margin-top:8px">
            <div>
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:2px">Mức độ:</label>
              <select id="${cid}-edit-lvl" style="width:100%;padding:4px">
                ${C.levelOptions(q.level)}
              </select>
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:2px">Năng lực (NL):</label>
              <select id="${cid}-edit-competency" style="width:100%;padding:4px">
                <option value="">-- Chọn NL --</option>
                <option value="NLa" ${(q.competency || '').toLowerCase() === 'nla' ? 'selected' : ''}>NLa (Sử dụng CNTT)</option>
                <option value="NLb" ${(q.competency || '').toLowerCase() === 'nlb' ? 'selected' : ''}>NLb (Ứng xử số/Bản quyền)</option>
                <option value="NLc" ${(q.competency || '').toLowerCase() === 'nlc' ? 'selected' : ''}>NLc (Giải quyết vấn đề)</option>
                <option value="NLd" ${(q.competency || '').toLowerCase() === 'nld' ? 'selected' : ''}>NLd (Ứng dụng/Tự học)</option>
                <option value="NLe" ${(q.competency || '').toLowerCase() === 'nle' ? 'selected' : ''}>NLe (Hợp tác trong MT số)</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:2px">Yêu cầu cần đạt (YCCĐ):</label>
              <input type="text" id="${cid}-edit-yccd" value="${esc(q.learning_outcome || '')}" style="width:100%;padding:4px;box-sizing:border-box">
            </div>
          </div>

          <div style="margin-top:8px">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:2px">Lời giải / Hướng dẫn chấm:</label>
            <textarea id="${cid}-edit-exp" rows="2" style="width:100%;padding:5px;box-sizing:border-box">${esc(q.option_explanations ? (q.option_explanations[corr] || q.option_explanations.join('\n')) : '')}</textarea>
          </div>
        </div>

        <div style="margin-top:10px;display:flex;gap:10px;align-items:center">
          <button type="button" class="primary quiet" data-save-q="${cid}" style="font-size:13px">Thêm vào Ngân hàng (Chờ duyệt)</button>
          <span id="${cid}-save-msg" style="font-size:12px;color:green"></span>
        </div>
      </div>
    `;
  }

  function getQuestionFromCard(cid, origQ) {
    const qText = ($(`#${cid}-edit-q`) ? $(`#${cid}-edit-q`).value : origQ.question || '').trim();
    if (!qText) throw new Error('Nội dung câu hỏi không được để trống.');

    const qType = origQ.type || 'MC';
    const lvl = $(`#${cid}-edit-lvl`) ? $(`#${cid}-edit-lvl`).value : (origQ.level || 'Biết');
    const yccd = ($(`#${cid}-edit-yccd`) ? $(`#${cid}-edit-yccd`).value : (origQ.learning_outcome || '')).trim();
    const compSel = $(`#${cid}-edit-competency`);
    const compVal = compSel ? compSel.value.trim() : (origQ.competency || '').trim();

    const result = {
      type: qType,
      level: lvl,
      learning_outcome: yccd,
      competency: compVal,
      question: qText,
      review_status: 'draft' // Strictly draft / pending review!
    };

    if (qType === 'MC') {
      const opts = [];
      for (let i = 0; i < 4; i++) {
        const inp = $(`#${cid}-opt-${i}`);
        const val = inp ? inp.value.trim() : (origQ.options ? origQ.options[i] : '');
        if (!val) throw new Error(`Phương án ${String.fromCharCode(65 + i)} không được để trống.`);
        opts.push(val);
      }
      result.options = opts;

      let checkedIdx = null;
      const radios = document.getElementsByName(`${cid}-correct-radio`);
      for (const r of radios) {
        if (r.checked) { checkedIdx = Number(r.value); break; }
      }
      if (checkedIdx === null && origQ.correct !== undefined) {
        checkedIdx = Number(origQ.correct);
      }
      if (checkedIdx === null || isNaN(checkedIdx) || checkedIdx < 0 || checkedIdx > 3) {
        throw new Error('Vui lòng chọn đáp án đúng (A, B, C hoặc D) cho câu hỏi trắc nghiệm.');
      }
      result.correct = checkedIdx;

      const expVal = ($(`#${cid}-edit-exp`) ? $(`#${cid}-edit-exp`).value : '').trim();
      result.option_explanations = C.mcExplanations(origQ.option_explanations, checkedIdx, expVal);
    } else if (qType === 'YN') {
      const statements = [];
      for (let i = 0; i < 4; i++) {
        const textInp = $(`#${cid}-yn-text-${i}`);
        const okSel = $(`#${cid}-yn-ok-${i}`);
        const origSt = (origQ.statements && origQ.statements[i]) || {};
        const stmtText = textInp ? textInp.value.trim() : String(origSt.text || '').trim();
        if (!stmtText) throw new Error(`Nội dung ý ${'abcd'[i]}) không được để trống.`);
        const stmtCorrect = okSel ? (okSel.value === 'true') : Boolean(origSt.correct);
        statements.push({ label: origSt.label || 'abcd'[i], text: stmtText, correct: stmtCorrect });
      }
      result.statements = statements;
    } else if (qType === 'SHORT') {
      const inp = $(`#${cid}-edit-short`);
      result.short_answer = inp ? inp.value.trim() : C.shortAnswerOf(origQ);
    } else if (qType === 'ES') {
      if (Array.isArray(origQ.rubric)) result.rubric = origQ.rubric;
      if (origQ.equivalent_answer_policy) result.equivalent_answer_policy = origQ.equivalent_answer_policy;
    }

    return result;
  }

  function bindCardEvents(container, questionsList, prefix, grade, lessonCode, subject) {
    container.querySelectorAll('[data-toggle-edit]').forEach(btn => {
      btn.onclick = () => {
        const cid = btn.dataset.toggleEdit;
        const editor = $(`#${cid}-editor`);
        if (editor) {
          editor.hidden = !editor.hidden;
          btn.textContent = editor.hidden ? 'Chỉnh sửa / Xem lại' : '▲ Thu gọn chỉnh sửa';
        }
      };
    });

    container.querySelectorAll('[data-save-q]').forEach(btn => {
      btn.onclick = async () => {
        const cid = btn.dataset.saveQ;
        const idx = Number(cid.split('-').pop());
        const origQ = questionsList[idx];

        try {
          const qData = getQuestionFromCard(cid, origQ);
          const bankPayload = {
            id: '',
            grade: Number(grade),
            subject_name: subject || 'Tin học',
            lesson_code: lessonCode,
            review_status: 'draft',
            ...qData
          };

          await mutate('/api/ai/save-drafts', { questions: [bankPayload] }, () => {
            btn.textContent = 'Đã thêm vào Ngân hàng (Chờ duyệt)';
            btn.disabled = true;
            const msg = $(`#${cid}-save-msg`);
            if (msg) msg.textContent = `✓ Đã lưu bài [${lessonCode}]`;
            notify(`Đã lưu câu hỏi vào bài [${lessonCode}] ở trạng thái Chờ duyệt.`);
          });
        } catch (err) {
          notify(err.message || 'Lỗi khi lưu câu hỏi', true);
        }
      };
    });
  }

  // Bóc tách & Chuẩn hóa đề thô trực tiếp bằng Gemini Flash
  const parseBtn = $('#btn-start-ai-parse');
  if (parseBtn) {
    parseBtn.onclick = async () => {
      const rawText = ($('#ai-parse-raw-text')?.value || '').trim();
      if (!rawText) {
        notify('Thầy/Cô vui lòng dán câu hỏi hoặc chọn tệp Word/JSON trước nhé.', true);
        return;
      }

      const subj = $('#ai-parse-subject')?.value || 'Tin học';
      const grade = Number($('#ai-parse-grade')?.value || 10);
      const msg = $('#ai-parse-msg');
      const resContainer = $('#ai-parsed-results-container');

      let apiKey = localStorage.getItem('gemini_user_api_key');
      if (!apiKey) {
        apiKey = ($('#gemini-user-key')?.value || '').trim();
        if (apiKey) localStorage.setItem('gemini_user_api_key', apiKey);
      }

      // Nếu không có API Key, tự động nhận diện ngoại tuyến bằng Regex
      if (!apiKey) {
        const localParsed = parseQuestionsFromRawText(rawText, grade, subj);
        if (localParsed.length >= 1) {
          displayParsedQuestions(localParsed, grade, subj);
          notify(`Đã nhận diện thành công ${localParsed.length} câu hỏi bằng thuật toán thông minh (Không cần Chìa khóa AI)!`);
          return;
        }
        notify('Không tìm thấy Chìa khóa AI và chưa thể nhận diện định dạng câu hỏi thô. Thầy/Cô vui lòng kết nối Chìa khóa Google AI hoặc nạp tệp Word/JSON nhé.', true);
        dialog.querySelector('[data-ai-tab="key"]')?.click();
        return;
      }


      if (msg) msg.textContent = '⏳ AI đang đọc câu hỏi của Thầy/Cô và nhận diện đáp án...';
      parseBtn.disabled = true;

      try {
        const listLessons = instructionalLessons(grade, subj, { includeElective: true }) || [];
        const lessonInfo = listLessons.map(l => `${l.lesson_code}: ${l.lesson_name_source || l.lesson_name || l.name}`).join('; ');

        const promptText = `Bạn là Trợ lý Khảo thí & Chuẩn hóa Ngân hàng đề của Trường Quốc tế Á Châu (Asian School), bám sát chương trình GDPT 2018 và Công văn 7991/BGDĐT-GDTrH & CV 6569/BGDĐT-GDTrH.
Nhiệm vụ của bạn là: Đọc văn bản đề thi thô của môn ${subj} Khối ${grade}, bóc tách và chuẩn hóa từng câu hỏi thành mảng đối tượng JSON chuẩn xác.

Danh mục bài học phân phối chương trình của môn ${subj} Khối ${grade}:
${lessonInfo || 'B1, B2, B3...'}

${subjectCompetencyGuideText(subj)}

Yêu cầu phân loại và chuẩn hóa kĩ thuật câu hỏi (CV 7991/BGDĐT-GDTrH & QĐ 764/QĐ-BGDĐT):
1. Dạng câu hỏi (type):
   - "MC": Trắc nghiệm nhiều lựa chọn (4 phương án). Trả về:
     question: nội dung câu hỏi (đã bỏ chữ "Câu 1:"; nếu câu dẫn ở thể phủ định như không phải/không đúng/ngoại trừ thì giữ hoặc nhấn mạnh IN HOA/IN ĐẬM từ phủ định; không đặt chỗ trống ở đầu/giữa câu dẫn).
     options: mảng 4 chuỗi phương án [A, B, C, D] (đã bỏ tiền tố "A. ", "B. ", "C. ", "D. "; đồng nhất hình thức, tránh "Tất cả đều đúng" / "Không có phương án nào đúng").
     correct: số nguyên chỉ số phương án đúng (0 cho A, 1 cho B, 2 cho C, 3 cho D).
     option_explanations: mảng 4 chuỗi giải thích cho từng phương án nếu có.
   - "YN": Trắc nghiệm Đúng/Sai (4 ý a, b, c, d). Trả về:
     question: câu dẫn ngữ cảnh chung (>= 25 kí tự).
     statements: mảng 4 đối tượng [{label: "a", text: "nội dung ý a", correct: true/false}, {label: "b", text: "nội dung ý b", correct: true/false}, ...].
   - "SHORT": Trả lời ngắn / Điền khuyết. Trả về:
     question: nội dung câu hỏi (ghi rõ đơn vị tính và quy ước làm tròn trong câu dẫn).
     short_answer: đáp án gọn duy nhất KHÔNG kèm đơn vị (tối đa 4 kí tự nếu là số theo chuẩn THPT QĐ 764).
   - "ES": Tự luận. Trả về:
     question: đề bài tự luận (rõ yêu cầu thực hiện và tiêu chí đánh giá).
     rubric: mảng 4 tiêu chí chấm điểm [{"criterion": "...", "points": 0.25}, ...] (tổng 1.0 điểm).

2. Mức độ nhận thức (level):
   - "Biết": Nhận diện, định nghĩa, nhớ lại kiến thức cơ bản.
   - "Hiểu": Giải thích, phân biệt, so sánh, minh họa.
   - "Vận dụng": Áp dụng kiến thức/công thức giải bài toán cụ thể hoặc tình huống thực tiễn.
   - "Vận dụng cao": Chỉ gắn khi câu hỏi thuộc mức nâng cao theo hồ sơ riêng của tổ.

3. Ánh xạ Bài học (lesson_code) và mạch PPCT (ppct_section):
   - Hãy chọn mã bài học (lesson_code) phù hợp nhất từ danh mục bài học ở trên.
   - Gắn "ppct_section": "elective_topic" nếu mã bài thuộc Chuyên đề học tập THPT (CD1, CD2...), ngược lại gắn "ppct_section": "core".

4. Yêu cầu cần đạt (learning_outcome) & Thành phần Năng lực (competency):
   - "learning_outcome": Gắn Yêu cầu cần đạt tương ứng theo PPCT của bài học cho câu hỏi.
   - "competency": Gắn đúng 01 mã thành phần năng lực Tin học GDPT 2018: "NLa" (Sử dụng CNTT), "NLb" (Ứng xử số/Bản quyền/An toàn), "NLc" (Giải quyết vấn đề/Lập trình/Dữ liệu), "NLd" (Ứng dụng/Tự học), hoặc "NLe" (Hợp tác trong MT số).

Văn bản đề thi thô cần bóc tách:
${rawText}

Hãy trả về duy nhất mảng JSON các câu hỏi (không thêm bất kỳ lời dẫn nào ngoài JSON):
[
  {
    "type": "MC",
    "level": "Biết",
    "lesson_code": "B1",
    "learning_outcome": "...",
    "competency": "NLa",
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correct": 0
  }
]`;

        const { data, model: activeModel, fallbackTriggered } = await callGeminiWithAutoFallback(apiKey, {
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        }, (m) => {
          if (msg) msg.textContent = `⏳ Đang bóc tách dữ liệu với mô hình: ${m.name}...`;
        });

        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        let questionsList = JSON.parse(content);
        if (!Array.isArray(questionsList) && questionsList.questions) {
          questionsList = questionsList.questions;
        }
        if (!Array.isArray(questionsList) || !questionsList.length) {
          throw new Error('Gemini không bóc tách được câu hỏi nào từ nội dung được cung cấp.');
        }

        displayParsedQuestions(questionsList, grade, subj);
        const fallbackNote = fallbackTriggered ? ` (Đã tự động đổi sang mô hình ${activeModel})` : '';
        if (msg) msg.textContent = `✓ Đã tìm thấy ${questionsList.length} câu hỏi${fallbackNote}. Mời Thầy/Cô xem lại ở Bước 2.`;
        notify(`AI đã nhận diện xong ${questionsList.length} câu hỏi! Thầy/Cô kiểm tra lại rồi bấm nút Lưu nhé.`);
      } catch(err) {
        console.warn('Lỗi khi gọi Gemini AI, chuyển sang giải thuật ngoại tuyến:', err);
        const localParsed = parseQuestionsFromRawText(rawText, grade, subj);
        if (localParsed.length >= 1) {
          displayParsedQuestions(localParsed, grade, subj);
          if (msg) msg.innerHTML = `<span style="color:#1F6B52">✓ Đã nhận diện ngoại tuyến ${localParsed.length} câu hỏi (Google AI bận: ${esc(err.message)})</span>`;
          notify(`Google AI phản hồi: ${err.message}. Hệ thống đã tự động chuyển sang chế độ Ngoại tuyến và lấy được ${localParsed.length} câu hỏi!`);
        } else {
          if (msg) msg.innerHTML = `<span style="color:#C62828">Lỗi: ${esc(err.message)}</span>`;
          notify('Lỗi nhận diện: ' + err.message, true);
        }
      } finally {
        parseBtn.disabled = false;
      }
    };
  }

  // Nạp câu hỏi đã bóc tách vào Ngân hàng
  const importBtn = $('#btn-import-ai-to-bank');
  if (importBtn) {
    importBtn.onclick = async () => {
      const resContainer = $('#ai-parsed-results-container');
      const selectedChks = Array.from(resContainer ? resContainer.querySelectorAll('.aiparse-select-chk:checked') : []);
      if (!selectedChks.length) {
        notify('Chưa chọn câu hỏi nào để nạp.', true);
        return;
      }
      const questionsList = window._aiParsedQuestions || [];
      const grade = Number($('#ai-parse-grade')?.value || 10);
      const subj = $('#ai-parse-subject')?.value || 'Tin học';

      const batch = [];
      for (const chk of selectedChks) {
        const idx = Number(chk.dataset.idx);
        const orig = questionsList[idx];
        if (!orig) continue;
        try {
          const qData = getQuestionFromCard(`aiparse-${idx}`, orig);
          batch.push({
            id: `K${grade}-GV-${Math.random().toString(36).slice(2, 10)}`,
            grade: grade,
            subject_name: subj,
            lesson_code: orig.lesson_code || 'B1',
            review_status: 'draft',
            origin: 'ai_gemini',
            ...qData
          });
        } catch(e) {
          notify(`Lỗi ở Câu ${idx + 1}: ${e.message}`, true);
          return;
        }
      }

      importBtn.disabled = true;
      importBtn.textContent = '⏳ Đang nạp...';
      try {
        await mutate('/api/bank/import', { bank: { questions: batch }, mode: 'append' });
        notify(`Đã nạp thành công ${batch.length} câu hỏi vào Ngân hàng!`);
        dialog.close();
      } catch(err) {
        notify('Lỗi nạp câu hỏi: ' + err.message, true);
      } finally {
        importBtn.disabled = false;
        importBtn.textContent = 'Nạp vào Ngân hàng câu hỏi';
      }
    };
  }

  // Xuất file JSON (dành cho lưu Google Drive)
  const exportJsonBtn = $('#btn-export-ai-json');
  if (exportJsonBtn) {
    exportJsonBtn.onclick = () => {
      const qs = window._aiParsedQuestions || [];
      if (!qs.length) {
        notify('Chưa có câu hỏi nào để xuất.', true);
        return;
      }
      const blob = new Blob([JSON.stringify({ questions: qs }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ExamMatrix_AI_Questions_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      notify('Đã tải tệp JSON thành công! Thầy/Cô có thể cất file này lên Google Drive.');
    };
  }
}
initAiAssistant();

// Quản lý Sao lưu & Khôi phục Dữ liệu (Google Drive / JSON Backup)
function initBackupManager() {
  const btn = $('#btn-backup-data');
  const dialog = $('#backup-dialog');
  if (!btn || !dialog) return;

  btn.onclick = () => dialog.showModal();

  // Xuất toàn bộ dữ liệu ra tệp JSON
  const exportBtn = $('#btn-export-full-backup');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const exportData = {
        app: 'ExamMatrix Studio',
        version: '2.0',
        exported_at: new Date().toISOString(),
        owner_email: (window.FirebaseState?.user?.email) || 'offline_teacher',
        bank: store.bank || { questions: [] },
        revisions: store.revisions || [],
        exams: store.exams || [],
        matrices: store.matrixRecords || [],
        kttx: Array.isArray(store.kttx?.activities) ? store.kttx.activities : (window.FirebaseState?.currentData?.kttx || [])
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const dStr = new Date().toISOString().slice(0, 10);
      a.href = URL.createObjectURL(blob);
      a.download = `ExamMatrix_Backup_${dStr}.json`;
      a.click();
      notify('Đã xuất toàn bộ dữ liệu ra tệp JSON thành công! Thầy/Cô có thể cất file này lên Google Drive cá nhân.');
    };
  }

  // Khôi phục từ tệp JSON
  const triggerBtn = $('#btn-trigger-restore');
  const fileInput = $('#input-restore-backup');
  const statusDiv = $('#restore-status');

  if (triggerBtn && fileInput) {
    triggerBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          const payload = (data && data.data && typeof data.data === 'object') ? data.data : data;
          const bankQs = payload.bank?.questions || (Array.isArray(payload.bank) ? payload.bank : (payload.questions || []));
          const revs = payload.revisions || [];
          const exams = payload.exams || [];
          const mats = payload.matrices || [];
          const kttxs = Array.isArray(payload.kttx) ? payload.kttx : [];

          if (!bankQs.length && !revs.length && !exams.length && !mats.length && !kttxs.length) {
            alert('Tệp sao lưu rỗng hoặc không đúng định dạng của ExamMatrix Studio.');
            return;
          }

          const msg = `Thầy/Cô có muốn khôi phục dữ liệu từ tệp này không?\n\n• ${bankQs.length} câu hỏi ngân hàng\n• ${revs.length} đề cương ôn tập\n• ${exams.length} đề kiểm tra\n• ${mats.length} ma trận & đặc tả\n• ${kttxs.length} hoạt động KTTX\n\nDữ liệu hiện tại sẽ được cập nhật đồng bộ.`;
          if (!confirm(msg)) return;

          const restoredPpct = (payload.bank?.ppct && Array.isArray(payload.bank.ppct.lessons))
            ? payload.bank.ppct
            : (store.bank?.ppct || { lessons: [], cleared_grades: [] });
          const restoredCatalogs = Array.isArray(payload.bank?.competency_catalogs)
            ? payload.bank.competency_catalogs
            : (store.bank?.competency_catalogs || []);

          if (store) {
            store.bank = {
              ...(store.bank || {}),
              questions: bankQs,
              ppct: restoredPpct,
              competency_catalogs: restoredCatalogs
            };
            store.revisions = revs;
            store.exams = exams;
            store.matrixRecords = mats;
            store.kttx = null;
          }

          if (window.FirebaseClient?.replaceWorkspaceData) {
            try {
              await window.FirebaseClient.replaceWorkspaceData({
                bank: {
                  questions: bankQs,
                  ppct: restoredPpct,
                  competency_catalogs: restoredCatalogs
                },
                revisions: revs,
                exams: exams,
                matrices: mats,
                kttx: kttxs
              });
            } catch (syncErr) {
              // Chưa lưu được lên đám mây (chưa đăng nhập, mất mạng, xung đột): không báo thành công.
              throw syncErr;
            }
          } else {
            throw new Error('Chưa nạp được bộ lưu trữ đám mây. Hãy tải lại trang rồi khôi phục lại.');
          }

          if (typeof render === 'function') render();
          if (statusDiv) {
            statusDiv.textContent = `✓ Đã khôi phục thành công: ${bankQs.length} câu hỏi, ${revs.length} đề cương, ${exams.length} đề kiểm tra, ${kttxs.length} hoạt động KTTX.`;
            statusDiv.style.display = 'block';
          }
          notify('Khôi phục dữ liệu từ bản sao lưu thành công!');
          setTimeout(() => dialog.close(), 1200);
        } catch(err) {
          // Không lưu được thì nạp lại dữ liệu đang có để màn hình không hiện bản chưa lưu.
          if (typeof load === 'function') load().catch(() => {});
          alert('Chưa khôi phục được dữ liệu: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
  }
}
initBackupManager();

// User Guide & Data Specifications Dialog Integration
function renderScreenGuide() {
  const pane = $('#help-pane-current');
  if (!pane) return;
  const g = C.screenGuide(store.tab);
  pane.innerHTML = `<div class="callout"><strong>${esc(g.title)}</strong><p>${esc(g.purpose)}</p></div>
    <h3>Các bước thực hiện</h3><ol>${g.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    ${g.tips.length ? `<h3>Lưu ý</h3><ul>${g.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <p class="muted">Chuyển sang màn hình khác rồi mở lại Hướng dẫn để xem hướng dẫn của màn hình đó. Các thẻ bên cạnh là cẩm nang chung.</p>`;
}

function initUserGuide() {
  const guideBtn = $('#btn-user-guide');
  const dialog = $('#help-dialog');
  if (!guideBtn || !dialog) return;

  guideBtn.onclick = () => {
    renderScreenGuide();
    dialog.querySelector('[data-help-tab="current"]').click();
    dialog.showModal();
  };

  // Switch tabs in Help modal
  dialog.querySelectorAll('[data-help-tab]').forEach(tabBtn => {
    tabBtn.onclick = () => {
      dialog.querySelectorAll('[data-help-tab]').forEach(b => {
        b.classList.remove('active');
        b.style.background = '#F3F4F8';
        b.style.color = '#333';
      });
      tabBtn.classList.add('active');
      tabBtn.style.background = 'var(--navy, #1C2333)';
      tabBtn.style.color = '#fff';

      const tabId = tabBtn.dataset.helpTab;
      dialog.querySelectorAll('.help-pane').forEach(p => p.hidden = true);
      const pane = $(`#help-pane-${tabId}`);
      if (pane) pane.hidden = false;
    };
  });

  // Copy sample raw text button
  const copyBtn = $('#btn-copy-sample-raw');
  const sampleBlock = $('#sample-raw-text-block');
  if (copyBtn && sampleBlock) {
    copyBtn.onclick = async () => {
      try {
        const textToCopy = sampleBlock.textContent;
        await navigator.clipboard.writeText(textToCopy);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ Đã sao chép vào bộ nhớ đệm!';
        copyBtn.style.background = 'var(--green, #1F6B52)';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
        }, 2500);
        notify('Đã sao chép mẫu đề thô chuẩn vào bộ nhớ đệm.');
      } catch (e) {
        notify('Không thể sao chép tự động: ' + e.message, true);
      }
    };
  }
}
initUserGuide();
function setGlobalSubject(subj) {
  if (!subj) return;
  saveBrowserExamDraft();
  store.selectedSubject = subj;
  if(window.FirebaseClient?.canHandle('/api/state'))store.context={...store.context,...window.BankStaticEngine.subjectContext(subj)};
  store.ppctSubject = subj;
  store.filters.subject = subj;
  try { localStorage.setItem('exammatrix_active_subject', subj); } catch(e) {}

  const gSel = $('#global-subject-select');
  if (gSel && gSel.value !== subj) gSel.value = subj;
  const pSel = $('#ppct-subject');
  if (pSel && pSel.value !== subj) pSel.value = subj;

  const sideCaption = $('#sidebar-subject-caption');
  if (sideCaption) sideCaption.textContent = `Khảo thí & Đánh giá · Môn ${subj}`;
  const footSubj = $('#footer-subject-name');
  if (footSubj) footSubj.textContent = subj;

  // Sync AI modal inputs
  const m1Subj = $('#ai-m1-subject');
  if (m1Subj) m1Subj.value = subj;
  const m2Subj = $('#ai-m2-subject');
  if (m2Subj) m2Subj.value = subj;

  restoreExamDraft();
  render();
  notify(`Đã chuyển không gian làm việc sang môn: ${subj}`);
}

function initGlobalSubject() {
  const gSel = $('#global-subject-select');
  if (gSel) {
    gSel.value = store.selectedSubject || 'Tin học';
    gSel.onchange = e => setGlobalSubject(e.target.value);
  }
  const sideCaption = $('#sidebar-subject-caption');
  if (sideCaption) sideCaption.textContent = `Khảo thí & Đánh giá · Môn ${store.selectedSubject || 'Tin học'}`;
  const footSubj = $('#footer-subject-name');
  if (footSubj) footSubj.textContent = store.selectedSubject || 'Tin học';
}
initGlobalSubject();
renderSidebarGradeSwitcher();

function initSidebarToggle() {
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!toggleBtn) return;

  // Restore collapsed state on desktop
  try {
    const isCollapsed = localStorage.getItem('exammatrix_sidebar_collapsed') === '1';
    if (isCollapsed && window.innerWidth > 768) {
      document.body.classList.add('sidebar-collapsed');
      toggleBtn.setAttribute('aria-expanded', 'false');
    } else {
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
  } catch (e) {}

  const toggle = () => {
    if (window.innerWidth <= 768) {
      const open = document.body.classList.toggle('sidebar-mobile-open');
      toggleBtn.setAttribute('aria-expanded', String(open));
    } else {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      try {
        localStorage.setItem('exammatrix_sidebar_collapsed', collapsed ? '1' : '0');
      } catch (e) {}
      toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    }
  };

  toggleBtn.onclick = (e) => {
    e.preventDefault();
    toggle();
  };

  if (backdrop) {
    backdrop.onclick = () => {
      document.body.classList.remove('sidebar-mobile-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    };
  }

  // Close mobile drawer when clicking any nav item
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        document.body.classList.remove('sidebar-mobile-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // Keyboard shortcut: Ctrl + B or Cmd + B
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggle();
    } else if (e.key === 'Escape' && document.body.classList.contains('sidebar-mobile-open')) {
      document.body.classList.remove('sidebar-mobile-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });
}
initSidebarToggle();
