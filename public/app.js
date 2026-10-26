/* Local data is persisted by the server. The browser only holds the current view. */
'use strict';
const C=window.BankCore,$=s=>document.querySelector(s),esc=C.escapeHtml;
const statusNames={approved:'Mẫu đã duyệt',content_checked:'Đã tự kiểm tra nội dung',draft:'Bản nháp',archived:'Đã lưu trữ'};
const typeNames={MC:'Trắc nghiệm',ES:'Tự luận / thực hành'};
const periodNames={TX:'Thường xuyên',GK1:'Giữa học kì I',CK1:'Cuối học kì I',GK2:'Giữa học kì II',CK2:'Cuối học kì II'};
const store={context:{},bank:null,exams:[],revisions:[],templates:[],tab:'overview',selected:new Set(),selectedSubject:(typeof localStorage!=='undefined'&&localStorage.getItem('exammatrix_active_subject'))||(typeof location!=='undefined'&&new URLSearchParams(location.search).get('subject'))||'Tin học',filters:{grade:'',lesson:'',type:'',level:'',status:'active',search:'',subject:''},page:1,ppctGrade:10,ppctSubject:'Tin học',revisionGrade:10,examDraft:{grade:10,exam_type:'GK1',template_id:'',revision_id:'',title:'',duration:45,seed:'2026',similarity_percent:90,similarity_mode:'min',blueprint:[]},editing:null,busy:false,testPpctLoaded:false,isTestMode:Boolean(typeof sessionStorage!=='undefined'&&sessionStorage.getItem('exammatrix_test_mode')==='1'||typeof location!=='undefined'&&new URLSearchParams(location.search).get('test')==='1')};
const opt=(value,label,selected=false)=>`<option value="${esc(value)}"${selected?' selected':''}>${esc(label)}</option>`;
const badge=q=>`<span class="badge ${esc(q.review_status||'draft')}">${esc(statusNames[q.review_status]||q.review_status||'Bản nháp')}</span>`;
const courseID=document.querySelector('meta[name="curriculum-id"]')?.content||'';
const apiUrl=path=>{let p=C.scopedUrl(path,courseID);if(store.isTestMode){const sep=p.includes('?')?'&':'?';p=p+sep+'test_mode=1';}return p;};
const subject=record=>record?.subject_name||(store.context.curriculum_id?store.context.subject_name:null)||store.selectedSubject||store.context.subject_name||'Tin học';
const grades=()=>C.contextGrades(store.context);
const schoolProfile=()=>store.context.school_profile!==false;
const needsSource=(grade,period)=>schoolProfile()&&C.sourceTemplateRequired(grade,period);
const gradeOptions=g=>grades().map(v=>opt(v,`Khối ${v}`,Number(g)===v)).join('');
const lessons=(g,subj)=>{
  const s=subj||store.selectedSubject||subject();
  if(store.context.curriculum_id)return C.courseLessons(store.bank?.ppct?.lessons||[],store.context,g,s);
  if(store.isTestMode && !store.testPpctLoaded){
    const stored=(store.bank?.ppct?.lessons||[]).filter(l=>(!g||Number(l.grade)===Number(g))&&((l.subject_name===s)||(!l.subject_name&&s==='Tin học')));
    return stored;
  }
  const multiCatalog=(typeof window!=='undefined'&&window.SUBJECT_CURRICULA)||(store.subject_curricula||{});
  if(s&&s!=='Tin học'){
    const list=multiCatalog[s]?.[Number(g)]||multiCatalog[s]?.[String(g)]||[];
    if(list.length)return list;
  }
  const stored=(store.bank?.ppct?.lessons||[]).filter(l=>(!g||Number(l.grade)===Number(g))&&((l.subject_name===s)||(!l.subject_name&&s==='Tin học')));
  if(stored.length&&(!s||s==='Tin học'))return stored;
  return multiCatalog[s]?.[Number(g)]||multiCatalog[s]?.[String(g)]||stored;
};
const questions=()=>{
  const all=store.bank?.questions||[];
  const s=subject();
  return all.filter(q=>(q.subject_name===s)||(!q.subject_name&&s==='Tin học'));
};
const currentRevisions=()=>store.revisions.filter(r=>(r.subject_name===subject())||(!r.subject_name&&subject()==='Tin học'));
const currentExams=()=>store.exams.filter(e=>(e.subject_name===subject())||(!e.subject_name&&subject()==='Tin học'));
const filtered=()=>C.filterQuestions(questions(),store.filters);
const countRecord=r=>r.question_count??r.questions?.length??0;
function date(v){if(!v)return 'Chưa ghi thời điểm';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'});}
function title(k,h,p,actions=''){return `<div class="page-head"><div><p class="eyebrow">${esc(k)}</p><h1>${esc(h)}</h1><p>${esc(p)}</p></div>${actions?`<div class="actions">${actions}</div>`:''}</div>`;}
function empty(h,p){return `<div class="empty"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;}
function notify(message,error=false){const el=$('#notice');el.hidden=false;el.className=error?'error':'';el.textContent=message;el.setAttribute('role',error?'alert':'status');if(error)el.scrollIntoView({block:'nearest',behavior:'smooth'});}
function clearNotice(){$('#notice').hidden=true;}
function detailError(e){const details=e.details;if(!details)return e.message;return e.message+'\n'+(typeof details==='string'?details:JSON.stringify(details,null,2));}
async function request(path,body){
 const h=body===undefined?{}:C.jsonHeaders(document.querySelector('meta[name="csrf-token"]')?.content);
 if(store.isTestMode)h['X-Test-Mode']='1';
 const response=await fetch(apiUrl(path),{method:body===undefined?'GET':'POST',headers:h,body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await response.json();}catch{throw new Error('Không đọc được phản hồi từ ứng dụng. Hãy kiểm tra máy chủ cục bộ.');}
 if(!response.ok){const error=new Error(data.error||'Không thực hiện được yêu cầu.');error.details=data.details;throw error;}return data;
}
async function mutate(path,body,onSuccess){
 if(store.busy)return;store.busy=true;
 document.querySelectorAll('dialog form button[type=submit],#save-revision,#generate-exam').forEach(b=>b.disabled=true);
 try{const result=await request(path,body);if(result.bank)store.bank=result.bank;await onSuccess?.(result);return result;}
 catch(e){notify(detailError(e),true);const form=$('#edit-dialog[open] #form-error');if(form){form.hidden=false;form.textContent=detailError(e);}return null;}
 finally{store.busy=false;document.querySelectorAll('dialog form button[type=submit],#save-revision').forEach(b=>b.disabled=false);updateGenerationState();}
}
async function load(initial=false){
 $('#refresh').disabled=true;if(initial)$('#loading').hidden=false;
 try{const data=await request('/api/state');store.context=data.context||{};store.bank=data.bank;
 store.isTestMode=Boolean(data.is_test_mode);sessionStorage.setItem('exammatrix_test_mode',store.isTestMode?'1':'0');
 if(store.context.curriculum_id){store.selectedSubject=store.context.subject_name;store.ppctSubject=store.context.subject_name;}
 const picker=$('#global-subject-select');if(picker){picker.value=subject();picker.disabled=Boolean(store.context.curriculum_id);}
 $('#test-mode-banner').hidden=!store.isTestMode;
 if(initial){const g=grades()[0];store.ppctGrade=g;store.revisionGrade=g;store.examDraft.grade=g;}
 store.exams=data.exams||[];store.revisions=data.revisions||[];store.templates=Array.isArray(data.templates)?data.templates:data.templates?.templates||[];store.selected=new Set([...store.selected].filter(id=>questions().some(q=>q.id===id)));if(initial)chooseExamTemplate();$('#loading').hidden=true;initGlobalSubject();render();}
 catch(e){$('#loading').hidden=true;notify(e.message,true);if(!store.bank)$('#overview').innerHTML=empty('Chưa mở được ngân hàng','Kiểm tra ứng dụng đang chạy rồi bấm Tải lại dữ liệu.');if(!store.bank)$('#overview').hidden=false;}
 finally{$('#refresh').disabled=false;}
}
function switchTab(tab){store.tab=['overview','bank','ppct','revisions','matrices','exams'].includes(tab)?tab:'overview';document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==store.tab);document.querySelectorAll('[data-tab]').forEach(a=>{if(a.dataset.tab===store.tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});if(store.bank)renderCurrent();}
function render(){switchTab(location.hash.slice(1)||store.tab);}
function renderCurrent(){({overview:renderOverview,bank:renderBank,ppct:renderPPCT,revisions:renderRevisions,exams:renderExams,matrices:renderMatrices}[store.tab])();}
function renderOverview(){
 const s=subject();
 const qs=questions(),active=qs.filter(q=>q.review_status!=='archived'),ready=active.filter(q=>['approved','content_checked'].includes(q.review_status));
 const revs=currentRevisions(), exms=currentExams();
 $('#overview').innerHTML=(!qs.length?`<div class="card"><h2>Bắt đầu ngân hàng môn ${esc(s)} của bạn</h2><p>1. Thiết lập phân phối chương trình môn ${esc(s)}. 2. Soạn câu hỏi. 3. Chuẩn bị đề cương, lập ma trận và tạo đề.</p><a class="button primary" href="#ppct">Quản lý PPCT ${esc(s)}</a> <a class="button" href="#bank">Soạn câu hỏi mới</a></div>`:'')+title(`Không gian chuyên môn · ${s}`,'Mỗi câu hỏi, một căn cứ rõ ràng',`Quản lí nội dung môn ${s} theo chương trình GDPT 2018. Chuẩn bị đề cương và tạo đề có kiểm tra ma trận.`,`<a class="button primary" href="#bank">Mở ngân hàng ${esc(s)}</a>`)+
 `<div class="stats"><div class="stat"><strong>${active.length}</strong><span>Câu hỏi môn ${esc(s)}</span><small>${active.filter(q=>q.type==='MC').length} trắc nghiệm · ${active.filter(q=>q.type==='ES').length} tự luận</small></div><div class="stat"><strong>${ready.length}</strong><span>Câu đủ điều kiện tạo đề</span><small>Mẫu đã duyệt hoặc tự kiểm tra</small></div><div class="stat"><strong>${revs.length}</strong><span>Phiên bản đề cương</span><small>Môn ${esc(s)}</small></div><div class="stat"><strong>${exms.length}</strong><span>Đề kiểm tra đã lưu</span><small>Môn ${esc(s)}</small></div></div>`+
 `<div class="grade-grid">${grades().map(g=>{const a=active.filter(q=>q.grade===g);return `<a class="grade-card" href="#bank" data-open-grade="${g}"><h3>${esc(s)} ${g}</h3><p>${lessons(g, s).filter(l=>a.some(q=>q.lesson_code===l.lesson_code)).length} bài có câu hỏi</p><div class="bar"><span style="width:${a.length?100:0}%"></span></div><strong>${a.length} câu hỏi</strong><span class="muted"> · Xem ngân hàng →</span></a>`;}).join('')}</div>`+
 `<div class="two-col" style="margin-top:22px"><div class="card"><h2>Chuẩn bị một đề kiểm tra</h2><ol class="muted"><li>Lọc và rà soát câu hỏi môn ${esc(s)} theo bài, YCCĐ và mức độ.</li><li>Chọn câu, lưu một phiên bản đề cương đã chuẩn bị phát.</li><li>Chọn ma trận, kiểm tra phân bố và tạo đề.</li></ol><a href="#revisions">Chuẩn bị đề cương →</a></div><div class="card"><h2>Trạng thái nội dung môn ${esc(s)}</h2><p class="muted">${qs.filter(q=>q.review_status==='approved').length} câu mẫu đã duyệt · ${qs.filter(q=>q.review_status==='content_checked').length} câu đã tự kiểm tra · ${qs.filter(q=>q.review_status==='draft').length} bản nháp · ${qs.filter(q=>q.review_status==='archived').length} câu lưu trữ.</p><div class="callout">Câu đã tự kiểm tra nội dung vẫn cần giáo viên xem lại trước khi sử dụng. Bản nháp và câu lưu trữ được loại khỏi quá trình tạo đề.</div></div></div>`;
}
function renderBank(){
 const f=store.filters;
 $('#bank').innerHTML=title('Biên soạn & tra cứu','Ngân hàng câu hỏi','Lọc theo chương trình, xem đáp án và lưu những câu cần dùng.',`<button class="primary" id="add-question">+ Thêm câu hỏi</button><button type="button" class="button" id="export-bank-lms">📤 Xuất Word LMS</button><a class="button" href="/api/bank/export">Xuất JSON</a><button id="import-bank">Nhập JSON</button><input class="json-import" id="import-file" type="file" accept=".json,application/json">`)+
 `<div class="card"><div class="filters"><div class="field"><label for="filter-grade">Khối lớp</label><select id="filter-grade">${opt('','Tất cả khối',!f.grade)}${gradeOptions(f.grade)}</select></div><div class="field"><label for="filter-lesson">Bài học</label><select id="filter-lesson">${lessonFilterOptions()}</select></div><div class="field"><label for="filter-type">Dạng câu</label><select id="filter-type">${opt('','Tất cả dạng',!f.type)}${Object.entries(typeNames).map(([k,v])=>opt(k,v,f.type===k)).join('')}</select></div><div class="field"><label for="filter-level">Mức độ</label><select id="filter-level">${opt('','Tất cả mức độ',!f.level)}${['Biết','Hiểu','Vận dụng'].map(l=>opt(l,l,f.level===l)).join('')}</select></div><div class="field"><label for="filter-status">Trạng thái</label><select id="filter-status">${opt('active','Đang sử dụng',f.status==='active')}${Object.entries(statusNames).map(([k,v])=>opt(k,v,k===f.status)).join('')}${opt('all','Tất cả trạng thái',f.status==='all')}</select></div><div class="field search"><label for="filter-search">Tìm trong câu hỏi, mã câu, phương án hoặc YCCĐ</label><input id="filter-search" type="search" placeholder="Tìm nội dung, mã câu hoặc yêu cầu cần đạt…" value="${esc(f.search)}"></div></div></div>`+
 `<div class="bank-layout"><div><div id="bank-toolbar"></div><div id="bank-list" class="question-list"></div><div id="bank-pagination"></div></div><aside class="bank-aside card"><h2>Câu đã chọn</h2><div id="selection-summary"></div><div class="callout">Lựa chọn được giữ khi đổi bộ lọc. Khi lưu đề cương, ứng dụng chỉ lấy câu thuộc khối đã chọn.</div><div class="actions" style="margin-bottom:10px"><a class="button primary" href="#revisions">Tạo đề cương từ lựa chọn</a><button class="quiet" id="clear-selection">Bỏ chọn tất cả</button></div><div class="bulk-box"><label for="bulk-status-select">Thao tác hàng loạt với câu đã chọn</label><div class="actions" style="margin-top:6px"><select id="bulk-status-select" style="flex:1;min-width:140px">${Object.entries(statusNames).map(([k,v])=>opt(k,`Đổi thành: ${v}`)).join('')}</select><button type="button" id="bulk-apply-status">Áp dụng</button><button type="button" class="danger" id="bulk-delete-selected">Xóa câu đã chọn</button></div></div><hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><p class="small muted">Bấm nội dung câu để xem đáp án, giải thích, thang điểm và yêu cầu cần đạt. Dùng các nút bên phải mỗi câu để Sửa, Nhân bản, Lưu trữ/Khôi phục hoặc Xóa.</p></aside></div>`;
 $('#add-question').onclick=()=>openEditor();$('#import-bank').onclick=()=>$('#import-file').click();$('#import-file').onchange=importBank;
 $('#export-bank-lms').onclick=()=>{const ids=[...store.selected];const g=store.filters.grade;const url='/api/bank/export-lms?'+(ids.length?'ids='+ids.join(','):(g?'grade='+g:''));window.open(apiUrl(url),'_blank');};
 ['grade','lesson','type','level','status'].forEach(k=>$('#filter-'+k).onchange=ev=>{store.filters[k]=ev.target.value;store.page=1;if(k==='grade'){store.filters.lesson='';$('#filter-lesson').innerHTML=lessonFilterOptions();}renderBankList();});
 $('#filter-search').oninput=ev=>{store.filters.search=ev.target.value;store.page=1;renderBankList();};$('#clear-selection').onclick=()=>{store.selected.clear();renderBankList();};
 $('#bulk-apply-status').onclick=()=>bulkUpdateSelected('status',$('#bulk-status-select').value);
 $('#bulk-delete-selected').onclick=()=>bulkUpdateSelected('delete');
 renderBankList();
}
function lessonFilterOptions(){const f=store.filters;const unique=new Map(lessons(f.grade).map(l=>[l.lesson_code,l]));return opt('','Tất cả bài',!f.lesson)+[...unique.values()].map(l=>opt(l.lesson_code,`${l.lesson_code} · ${l.lesson_name_source}`,f.lesson===l.lesson_code)).join('');}
function renderBankList(){
 const result=filtered(),size=15,pages=Math.max(1,Math.ceil(result.length/size));store.page=Math.min(store.page,pages);const slice=result.slice((store.page-1)*size,store.page*size);
 $('#bank-toolbar').innerHTML=`<div class="list-toolbar"><span><strong>${result.length}</strong> câu khớp bộ lọc</span><div class="actions"><button id="select-filter" class="quiet">Chọn tất cả câu đang lọc</button><button id="reset-filter" class="quiet">Đặt lại bộ lọc</button></div></div>`;
 $('#bank-list').innerHTML=slice.length?slice.map(q=>`<article class="q-card"><input type="checkbox" aria-label="Chọn câu ${esc(q.id)}" data-check="${esc(q.id)}"${store.selected.has(q.id)?' checked':''}><div class="q-card-body"><button class="q-open" data-detail="${esc(q.id)}"><span class="q-meta"><span class="badge">Khối ${q.grade} · ${esc(q.lesson_code)}</span><span class="badge">${esc(q.type)} · ${esc(q.level)}</span>${badge(q)}<span class="q-id">${esc(q.id)}</span></span><div class="q-text">${esc(q.question)}</div></button><div class="q-row-actions"><button type="button" class="export-link" data-detail="${esc(q.id)}">Xem</button><button type="button" class="export-link" data-edit="${esc(q.id)}">Sửa</button><button type="button" class="export-link" data-dup-q="${esc(q.id)}">Nhân bản</button>${q.review_status==='archived'?`<button type="button" class="export-link" data-restore-q="${esc(q.id)}">Khôi phục</button>`:`<button type="button" class="export-link" data-archive="${esc(q.id)}">Lưu trữ</button>`}<button type="button" class="export-link danger" data-del-q="${esc(q.id)}">Xóa</button></div></div></article>`).join(''):empty('Không có câu phù hợp','Thử đổi bài, mức độ hoặc từ khóa tìm kiếm.');
 $('#bank-pagination').innerHTML=`<div class="pagination"><button id="prev-page"${store.page<=1?' disabled':''}>← Trước</button><span>Trang ${store.page} / ${pages}</span><button id="next-page"${store.page>=pages?' disabled':''}>Sau →</button></div>`;
 $('#select-filter').onclick=()=>{result.filter(q=>q.review_status!=='archived').forEach(q=>store.selected.add(q.id));renderBankList();};$('#reset-filter').onclick=()=>{store.filters={grade:'',lesson:'',type:'',level:'',status:'active',search:''};store.page=1;renderBank();};$('#prev-page').onclick=()=>{store.page--;renderBankList();};$('#next-page').onclick=()=>{store.page++;renderBankList();};
 $('#selection-summary').innerHTML=`<strong style="font-size:28px;color:var(--navy)">${store.selected.size}</strong><span class="muted"> câu được chọn</span><p class="small muted">${grades().map(g=>`Khối ${g}: ${C.revisionIds(questions(),[...store.selected],g).length}`).join(' · ')}</p>`;
}
function showDetail(id){
 const q=questions().find(q=>q.id===id);if(!q)return;$('#detail-dialog').classList.remove('wide-dialog');const answer=q.type==='MC'?`<ol class="options">${q.options.map((v,i)=>`<li class="${i===q.correct?'correct':''}">${i===q.correct?'<span class="answer-label">ĐÁP ÁN ĐÚNG</span>':''}<strong>${'ABCD'[i]}.</strong> ${esc(v)}<span class="explanation">${esc(q.option_explanations?.[i]||'Chưa có giải thích.')}</span></li>`).join('')}</ol>`:`<h3>Thang điểm · ${q.max_score||1} điểm</h3><ol class="rubric">${(q.rubric||[]).map(r=>`<li>${esc(r.criterion)} <strong>(${r.points} điểm)</strong></li>`).join('')}</ol><p class="muted">${esc(q.equivalent_answer_policy||'')}</p>`;
 $('#detail-content').innerHTML=`<div class="dialog-heading"><h2 id="detail-title">Chi tiết câu hỏi</h2><button data-close="detail-dialog" class="quiet">Đóng</button></div><div class="q-meta"><span class="badge">Khối ${q.grade} · ${esc(q.lesson_code)} · ${esc(q.level)}</span>${badge(q)}<span class="q-id">${esc(q.id)}</span></div><p class="question-text">${esc(q.question)}</p>${answer}<div class="callout"><strong>Yêu cầu cần đạt</strong><br>${esc(q.learning_outcome||'Chưa gắn YCCĐ')}</div><p class="small muted">${esc(q.lesson_name||'')} · ${esc(q.response_mode||typeNames[q.type])}</p><details class="detail-source"><summary>Nguồn đối chiếu PPCT</summary><p>${esc(q.source_file||'Theo danh mục PPCT')}</p><p>${(q.source_rows||[]).map(r=>`Tuần ${esc(r.week_raw)} · Tiết ${esc(r.periods_raw)}`).join('<br>')}</p></details><div class="dialog-bottom"><button data-edit="${esc(q.id)}" class="primary">Sửa câu hỏi</button><button data-dup-q="${esc(q.id)}">Nhân bản câu</button>${q.review_status==='archived'?`<button data-restore-q="${esc(q.id)}">Khôi phục sử dụng</button>`:`<button data-archive="${esc(q.id)}">Lưu trữ tạm</button>`}<button data-del-q="${esc(q.id)}" class="danger">Xóa vĩnh viễn</button></div>`;
 $('#detail-dialog').showModal();
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
 for(const q of record.questions||[]){
  const key=q.lesson_code||q.lesson_name||'';
  if(!map.has(key))map.set(key,{topic:q.topic_source||'',name:q.lesson_name||key,goals:[]});
  const row=map.get(key);if(q.learning_outcome&&!row.goals.includes(q.learning_outcome))row.goals.push(q.learning_outcome);
 }
 return [...map.values()];
}
const syncEditedQuestionsFromSheet=C.syncEditedQuestionsFromSheet;
function buildVerificationReportHtml(record){
 const v=record.verification;
 if(!v){
  return `<div class="doc-sheet"><header class="doc-sheet-head" align="center"><h3>BÁO CÁO KIỂM ĐỊNH ĐỀ THI VỚI MA TRẬN</h3><p><strong>${esc(record.title||'Đề kiểm tra')} · Khối ${esc(record.grade)}</strong></p></header><div class="callout warning">Đề thi này chưa có báo cáo kiểm định ma trận đính kèm. Bấm nút <strong>"🔄 Kiểm định lại với Ma trận"</strong> phía trên để chạy kiểm định.</div></div>`;
 }
 const badgeCls=v.passed?'approved':'draft';
 const rc=v.revision_check||{};
 const curTarget=rc.required_percent??record.similarity_target_percent??90;
 const curMode=rc.similarity_mode??record.similarity_mode??'min';
 const outsideCount=rc.outside_questions??Math.max(0,(rc.total_questions??v.total_questions??0)-(rc.matched_questions??0));
 const outsidePts=rc.outside_points??Math.max(0,Math.round(((rc.total_points??10)-(rc.matched_points??0))*100)/100);
 const qItems=rc.question_items||(record.questions||[]).map((q,i)=>({index:i,slot_number:q.slot_number||(i+1),id:q.id,type:q.type,lesson_code:q.lesson_code,level:q.level,points:q.points??(q.type==='MC'?0.25:1),in_revision:Boolean(q.in_revision??true),question:q.question}));

 const simControlHtml=`<div class="sim-control-card" data-exam-id="${esc(record.id||'')}">`+
  `<h5>⚖️ Điều chỉnh Mức độ tương đồng giữa Đề cương & Đề thi</h5>`+
  `<div class="sim-row">`+
   `<div class="sim-field"><label>Tỉ lệ tương đồng mong muốn (%):</label><div class="sim-slider-wrap"><input type="range" class="sim-range" min="90" max="100" step="5" value="${curTarget}"><input type="number" class="sim-number" min="90" max="100" step="1" value="${curTarget}"><span>%</span></div></div>`+
   `<div class="sim-field"><label>Chế độ kiểm định & điều chỉnh:</label><select class="sim-mode-select"><option value="min"${curMode==='min'?' selected':''}>Tối thiểu (≥ X% thuộc đề cương)</option><option value="exact"${curMode==='exact'?' selected':''}>Bám sát tỉ lệ (X% đề cương, (100-X)% ngoài đề cương)</option></select></div>`+
  `</div>`+
  `<div class="sim-presets"><span class="muted small">Chọn nhanh:</span>`+
   `<button type="button" class="sim-preset-pill${curTarget===90?' primary':''}" data-pct="90">90% (Quy chuẩn)</button>`+
   `<button type="button" class="sim-preset-pill${curTarget===95?' primary':''}" data-pct="95">95%</button>`+
   `<button type="button" class="sim-preset-pill${curTarget===100?' primary':''}" data-pct="100">100% (Trọn vẹn đề cương)</button>`+
  `</div>`+
  (record.id?`<div class="sim-actions"><button type="button" class="export-link primary btn-update-sim">🎯 Cập nhật ngưỡng & kiểm định lại</button><button type="button" class="export-link btn-auto-adjust">⚡ Tự động điều chỉnh câu hỏi để đạt tỉ lệ này</button></div>`:'')+
 `</div>`;

 const qDetailsHtml=`<details class="doc-details" open style="margin-top:14px">`+
  `<summary contenteditable="false">Danh sách chi tiết câu hỏi: Thuộc Đề cương (${rc.matched_questions??(qItems.filter(q=>q.in_revision).length)} câu · ${fmtPts(rc.matched_points??0)} điểm) vs Ngoài Đề cương (${outsideCount} câu · ${fmtPts(outsidePts)} điểm)</summary>`+
  `<div class="table-wrap"><table class="doc-table sim-q-table"><thead><tr><th align="center" style="width:46px">Câu</th><th align="center" style="width:60px">Dạng</th><th align="center" style="width:60px">Bài</th><th align="center" style="width:75px">Mức độ</th><th align="center" style="width:65px">Điểm</th><th>Trích yếu câu hỏi</th><th align="center" style="width:130px">Phân loại</th>${record.id?'<th align="center" style="width:160px">Điều chỉnh</th>':''}</tr></thead><tbody>`+
  qItems.map(qi=>{
   const inRev=Boolean(qi.in_revision);
   const qSnippet=qi.question?(qi.question.length>90?qi.question.slice(0,90)+'…':qi.question):'';
   const actionButtons=record.id?(inRev?
    `<div class="sim-q-actions"><button type="button" class="export-link" data-adj-sub="swap_from_bank" data-adj-qid="${esc(qi.id||'')}" data-adj-idx="${qi.index}" title="Đổi câu này lấy câu khác cùng bài/mức độ nhưng nằm ngoài đề cương">🔀 Đổi câu ngoài ĐC</button><button type="button" class="export-link danger" data-adj-sub="remove_from_revision" data-adj-qid="${esc(qi.id||'')}" data-adj-idx="${qi.index}" title="Tách câu này khỏi đề cương để trở thành câu phân hóa ngoài đề cương">➖ Tách khỏi ĐC</button></div>`:
    `<div class="sim-q-actions"><button type="button" class="export-link" data-adj-sub="swap_from_revision" data-adj-qid="${esc(qi.id||'')}" data-adj-idx="${qi.index}" title="Đổi câu này lấy câu có sẵn trong đề cương">🔄 Đổi câu từ ĐC</button><button type="button" class="export-link primary" data-adj-sub="add_to_revision" data-adj-qid="${esc(qi.id||'')}" data-adj-idx="${qi.index}" title="Thêm câu này vào đề cương để nâng tỉ lệ tương đồng">➕ Đưa vào ĐC</button></div>`):'';
   return `<tr><td align="center"><strong>${qi.slot_number}</strong></td><td align="center"><span class="badge">${esc(qi.type||'')}</span></td><td align="center"><strong>${esc(qi.lesson_code||'')}</strong></td><td align="center">${esc(qi.level||'')}</td><td align="center">${fmtPts(qi.points)}đ</td><td><div class="q-snippet">${esc(qSnippet)}</div></td><td align="center"><span class="badge ${inRev?'approved':'draft'}">${inRev?'Thuộc Đề cương':'Ngoài Đề cương'}</span></td>${record.id?`<td>${actionButtons}</td>`:''}</tr>`;
  }).join('')+
  `</tbody></table></div></details>`;

 return `<div class="doc-sheet"><header class="doc-sheet-head" align="center"><h3>BÁO CÁO ĐỐI CHIẾU & KIỂM ĐỊNH ĐỀ THI THEO MA TRẬN ĐẶC TẢ</h3><p><strong>${esc(record.title||'ĐỀ KIỂM TRA')} · KHỐI ${esc(record.grade)}</strong></p><p>Ma trận đối chiếu: <strong>${esc(v.matrix_title||v.matrix_id||'')}</strong> (${esc(v.matrix_id||'')}) · Trạng thái ma trận: <strong>${v.matrix_locked?'Đã duyệt & Khóa':'Bản nháp'}</strong></p></header>`+
 `<div class="callout ${v.passed?'':'warning'}" style="margin-bottom:16px"><strong>Kết luận kiểm định: <span class="badge ${badgeCls}">${v.passed?'ĐẠT YÊU CẦU CHUẨN MA TRẬN':'CHƯA ĐẠT YÊU CẦU'}</span></strong><br>${esc(v.summary||'')}</div>`+
 `<section class="doc-section"><h4>1. Đối chiếu Cấu trúc Dạng thức Câu hỏi & Tổng điểm</h4><div class="table-wrap"><table class="doc-table"><thead><tr><th align="center">Dạng câu hỏi</th><th align="center">Số câu / lệnh hỏi theo Ma trận</th><th align="center">Số câu / lệnh hỏi trong Đề thi</th><th align="center">Điểm Ma trận</th><th align="center">Điểm Đề thi</th><th align="center">Kết quả</th></tr></thead><tbody>${(v.type_checks||[]).map(tc=>`<tr><td><strong>${esc(tc.label)}</strong></td><td align="center">${tc.expected_items}</td><td align="center">${tc.actual_items}${tc.actual_questions&&tc.actual_questions!==tc.actual_items?` (${tc.actual_questions} câu lớn)`:''}</td><td align="center">${fmtPts(tc.expected_points)} điểm</td><td align="center"><strong>${fmtPts(tc.actual_points)} điểm</strong></td><td align="center"><span class="badge ${tc.matched?'approved':'draft'}">${tc.matched?'Khớp 100%':'Lệch'}</span></td></tr>`).join('')}<tr><td><strong>TỔNG CỘNG TOÀN ĐỀ</strong></td><td align="center" colspan="2"><strong>${v.total_questions} câu hỏi chính thức</strong></td><td align="center"><strong>${fmtPts(v.expected_points)} điểm</strong></td><td align="center"><strong>${fmtPts(v.total_points)} điểm</strong></td><td align="center"><span class="badge ${v.points_matched?'approved':'draft'}">${v.points_matched?'Đủ 10,0 điểm':'Lệch điểm'}</span></td></tr></tbody></table></div></section>`+
 `<section class="doc-section"><h4>2. Đối chiếu Mức độ Nhận thức (Biết · Hiểu · Vận dụng)</h4><div class="table-wrap"><table class="doc-table"><thead><tr><th align="center">Mức độ nhận thức</th><th align="center">Số lệnh hỏi (Ma trận)</th><th align="center">Số lệnh hỏi (Đề thi)</th><th align="center">Điểm số (Ma trận)</th><th align="center">Điểm số (Đề thi)</th><th align="center">Đánh giá</th></tr></thead><tbody>${(v.level_checks||[]).map(lc=>`<tr><td align="center"><strong>${esc(lc.level)}</strong></td><td align="center">${lc.expected_items}</td><td align="center">${lc.actual_items}</td><td align="center">${fmtPts(lc.expected_points)} điểm</td><td align="center"><strong>${fmtPts(lc.actual_points)} điểm</strong></td><td align="center"><span class="badge ${lc.matched?'approved':'draft'}">${lc.matched?'Đúng tỉ lệ':'Cần kiểm tra'}</span></td></tr>`).join('')}</tbody></table></div></section>`+
 `<section class="doc-section"><h4>3. Kiểm tra Vị trí Bài học của Câu hỏi Tự luận (ES)</h4><div class="table-wrap"><table class="doc-table"><thead><tr><th align="center">Câu tự luận</th><th align="center">Mã bài</th><th>Tên bài học trong chương trình</th><th align="center">Điểm số</th><th align="center">Đối chiếu Đặc tả</th></tr></thead><tbody>${(v.es_checks||[]).map(ec=>`<tr><td align="center"><strong>${esc(ec.slot)}</strong></td><td align="center">${esc(ec.lesson_code)}</td><td>${esc(ec.lesson_name)}</td><td align="center">${fmtPts(ec.points)} điểm</td><td align="center"><span class="badge ${ec.matched?'approved':'draft'}">${ec.matched?'Đúng bài quy định':'Sai bài'}</span></td></tr>`).join('')}</tbody></table></div></section>`+
 `<section class="doc-section"><h4>4. Đối chiếu & Điều chỉnh Độ phủ Đề cương Ôn tập</h4><div class="table-wrap"><table class="doc-table"><thead><tr><th>Phiên bản Đề cương đối chiếu</th><th align="center">Số câu thuộc Đề cương</th><th align="center">Điểm số thuộc Đề cương</th><th align="center">Tỉ lệ độ phủ điểm</th><th align="center">Yêu cầu cài đặt</th><th align="center">Kết quả</th></tr></thead><tbody><tr><td><strong>${esc(rc.revision_id||'Đề cương cùng khối')}</strong></td><td align="center">${rc.matched_questions??0} / ${rc.total_questions??v.total_questions} câu (${fmtPts(rc.coverage_percent_count??0)}%)</td><td align="center"><strong>${fmtPts(rc.matched_points??0)} / 10 điểm</strong></td><td align="center"><strong>${fmtPts(rc.coverage_percent_points??0)}%</strong></td><td align="center">${curMode==='exact'?'Bám sát: ':'≥ '}${fmtPts(curTarget)}%</td><td align="center"><span class="badge ${rc.matched?'approved':'draft'}">${rc.matched?'Đạt yêu cầu':'Chưa đạt'}</span></td></tr></tbody></table></div><details class="sim-details-toggle"><summary>⚙️ Tùy chỉnh mức độ tương đồng & hoán đổi câu hỏi (Nâng cao)</summary>${simControlHtml}${qDetailsHtml}</details></section>`+
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
function buildExamSheetHtml(record,mode='student'){
 if(mode==='verify')return buildVerificationReportHtml(record);
 const mcs=(record.questions||[]).filter(q=>q.type==='MC');
 const yns=(record.questions||[]).filter(q=>q.type==='YN');
 const ess=(record.questions||[]).filter(q=>q.type==='ES');
 const hasYn=yns.length>0;
 const secLabels=hasYn?{mc:'PHẦN I. TRẮC NGHIỆM NHIỀU LỰA CHỌN',yn:'PHẦN II. TRẮC NGHIỆM ĐÚNG / SAI',es:'PHẦN III. TỰ LUẬN'}:{mc:'I. TRẮC NGHIỆM',es:'II. TỰ LUẬN'};
 if(mode==='student'){
  return `<div class="doc-sheet"><header class="doc-sheet-head" align="center"><h3>${esc(record.title||'ĐỀ KIỂM TRA GIỮA HỌC KÌ I')}</h3><p><strong>MÔN: ${esc(subject(record).toLocaleUpperCase('vi'))} ${esc(record.grade)}</strong></p>${record.campus||record.exam_code?`<p>Đơn vị: ${esc(record.campus||'Asian School')} — <strong>Mã đề: ${esc(record.exam_code||'GỐC')}</strong></p>`:''}<p>Thời gian làm bài: ${esc(record.duration||45)} phút — Tổng điểm: ${fmtPts(record.total_points??10)} điểm</p><p class="doc-student-line">Họ và tên học sinh: ........................................................................ Lớp: ....................</p></header>`+
  (mcs.length?`<section class="doc-section"><h4>${secLabels.mc} (${mcs.length} câu · ${fmtPts(mcs.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4>${mcs.map((q,i)=>{const num=q.slot_number||(i+1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><p><strong>Câu ${num}${esc(pts)}.</strong> <span data-edit-field="question">${esc(q.question)}</span></p><div class="doc-options ${mcColsClass(q.options)}">${(q.options||[]).map((o,oi)=>`<p class="doc-option"><strong>${'ABCD'[oi]}.</strong> <span data-edit-opt="${oi}">${esc(o)}</span></p>`).join('')}</div></article>`;}).join('')}</section>`:'')+
  (yns.length?`<section class="doc-section"><h4>${secLabels.yn} (${yns.length} câu · ${fmtPts(yns.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4><p class="small muted" style="margin-bottom:10px">Trong mỗi ý <strong>a), b), c), d)</strong> ở mỗi câu, học sinh chọn <strong>Đúng</strong> hoặc <strong>Sai</strong>.</p>${yns.map((q,i)=>{const num=q.slot_number||(i+1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><p><strong>Câu ${num}${esc(pts)}.</strong> <span data-edit-field="question">${esc(q.question)}</span></p><div class="doc-options">${(q.statements||[]).map((st,si)=>`<p class="doc-option"><strong>${esc(st.label||('abcd'[si]))})</strong> <span data-edit-stmt="${si}">${esc(st.text)}</span></p>`).join('')}</div></article>`;}).join('')}</section>`:'')+
  (ess.length?`<section class="doc-section"><h4>${secLabels.es} (${ess.length} câu · ${fmtPts(ess.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4>${ess.map((q,i)=>{const num=q.slot_number||(i+1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><p><strong>Câu ${num}${esc(pts)}.</strong> <span data-edit-field="question">${esc(q.question)}</span></p></article>`;}).join('')}</section>`:'')+
  `<p align="center" style="margin-top:20px"><strong>— HẾT —</strong></p></div>`;
 }
 return `<div class="doc-sheet"><header class="doc-sheet-head" align="center"><h3>ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM</h3><p><strong>${esc(record.title||'ĐỀ KIỂM TRA')} · ${esc(subject(record).toLocaleUpperCase('vi'))} ${esc(record.grade)}</strong></p>${record.campus||record.exam_code?`<p>Đơn vị: ${esc(record.campus||'Asian School')} — <strong>Mã đề: ${esc(record.exam_code||'GỐC')}</strong></p>`:''}</header>`+
 (mcs.length?`<section class="doc-section"><h4>I. BẢNG ĐÁP ÁN TRẮC NGHIỆM NHIỀU LỰA CHỌN (${mcs.length} câu · ${fmtPts(mcs.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4><div class="answer-grid">${mcs.map((q,i)=>{const num=q.slot_number||(i+1);return `<div class="answer-cell" align="center"><span>Câu ${num}</span><strong>${'ABCD'[q.correct]||'—'}</strong><small>${fmtPts(q.points??0.25)}đ</small></div>`;}).join('')}</div><details class="doc-details" open><summary contenteditable="false">Chi tiết câu hỏi, đáp án đúng và giải thích từng phương án</summary>${mcs.map((q,i)=>{const num=q.slot_number||(i+1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><p><strong>Câu ${num}${esc(pts)}.</strong> <span data-edit-field="question">${esc(q.question)}</span> <span class="badge" contenteditable="false">${esc(q.lesson_code||'')} · ${esc(q.level||'')}</span></p><ol class="options">${(q.options||[]).map((o,oi)=>`<li class="${oi===q.correct?'correct':''}">${oi===q.correct?'<span class="answer-label" contenteditable="false">ĐÁP ÁN ĐÚNG</span>':''}<strong>${'ABCD'[oi]}.</strong> <span data-edit-opt="${oi}">${esc(o)}</span><span class="explanation" data-edit-exp="${oi}">${esc(q.option_explanations?.[oi]||'')}</span></li>`).join('')}</ol></article>`;}).join('')}</details></section>`:'')+
 (yns.length?`<section class="doc-section"><h4>II. BẢNG ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI (${yns.length} câu · ${fmtPts(yns.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4><div class="table-wrap"><table class="doc-table"><thead><tr><th align="center">Câu hỏi</th><th align="center">Ý a)</th><th align="center">Ý b)</th><th align="center">Ý c)</th><th align="center">Ý d)</th></tr></thead><tbody>${yns.map((q,i)=>{const num=q.slot_number||(i+1);const sts=q.statements||[];return `<tr><td align="center"><strong>Câu ${num}</strong></td>${[0,1,2,3].map(si=>`<td align="center"><strong>${sts[si]?.correct?'ĐÚNG':'SAI'}</strong></td>`).join('')}</tr>`;}).join('')}</tbody></table></div><details class="doc-details" open style="margin-top:10px"><summary contenteditable="false">Chi tiết từng mệnh đề Đúng / Sai</summary>${yns.map((q,i)=>{const num=q.slot_number||(i+1);return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><p><strong>Câu ${num} (${fmtPts(q.points??1)} điểm).</strong> <span data-edit-field="question">${esc(q.question)}</span> <span class="badge" contenteditable="false">${esc(q.lesson_code||'')}</span></p><ol class="options">${(q.statements||[]).map((st,si)=>`<li class="${st.correct?'correct':''}"><span class="answer-label" contenteditable="false">${st.correct?'ĐÚNG':'SAI'}</span><strong>${esc(st.label||('abcd'[si]))})</strong> <span data-edit-stmt="${si}">${esc(st.text)}</span></li>`).join('')}</ol></article>`;}).join('')}</details></section>`:'')+
 (ess.length?`<section class="doc-section"><h4>${hasYn?'III':'II'}. HƯỚNG DẪN CHẤM TỰ LUẬN (${ess.length} câu · ${fmtPts(ess.reduce((s,q)=>s+Number(q.points||0),0))} điểm)</h4>${ess.map((q,i)=>{const num=q.slot_number||(i+1);const scale=(q.points??q.max_score??1)/(q.max_score||1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><p><strong>Câu ${num}${esc(pts)}.</strong> <span data-edit-field="question">${esc(q.question)}</span> <span class="badge" contenteditable="false">${esc(q.lesson_code||'')} · ${esc(q.level||'')}</span></p><table class="rubric-table"><thead><tr><th align="center">Tiêu chí & Nội dung hướng dẫn chấm</th><th align="center" style="width:110px">Điểm</th></tr></thead><tbody>${(q.rubric||[]).map((c,ri)=>`<tr><td data-edit-rubric="${ri}">${esc(c.criterion)}</td><td align="center"><strong>${fmtPts(c.points*scale)} điểm</strong></td></tr>`).join('')}</tbody></table><p class="small muted" style="margin-top:8px"><strong>Quy tắc chấm tương đương:</strong> ${esc(scaledPolicy(q))}</p></article>`;}).join('')}</section>`:'')+
 `</div>`;
}
function buildRevisionSheetHtml(record,showAnswers=false){
 const goals=revisionGoals(record);
 const mcs=(record.questions||[]).filter(q=>q.type==='MC');
 const yns=(record.questions||[]).filter(q=>q.type==='YN');
 const ess=(record.questions||[]).filter(q=>q.type==='ES');
 const hasYn=yns.length>0;
 return `<div class="doc-sheet"><header class="doc-sheet-head"><div style="display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:12px;border-bottom:2px solid var(--line);padding-bottom:12px;text-align:center">${schoolProfile()?'<img src="/assets/logo_asian_school.png" alt="Asian School Logo" style="max-height:60px;max-width:100px;object-fit:contain;flex-shrink:0">':''}<div style="flex:1">${schoolProfile()?'<p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">TRƯỜNG TH, THCS & THPT QUỐC TẾ Á CHÂU</p>':''}<h3 style="margin:4px 0 2px 0">${esc(record.title||'ĐỀ CƯƠNG ÔN TẬP KIỂM TRA GIỮA HỌC KÌ I')}</h3><p style="margin:0"><strong>MÔN: ${esc(subject(record).toLocaleUpperCase('vi'))} ${esc(record.grade)} · NĂM HỌC ${esc(record.school_year||store.context.school_year||'2026-2027')}</strong> (${countRecord(record)} câu hỏi ôn tập)</p></div></div></header>`+
 `<section class="doc-section"><h4>A. GIỚI HẠN KIẾN THỨC ÔN TẬP</h4><div class="table-wrap"><table class="doc-table"><colgroup><col style="width:6%"><col style="width:24%"><col style="width:24%"><col style="width:46%"></colgroup><thead><tr><th align="center" style="width:56px">STT</th><th align="center" style="width:24%">Tên chủ đề</th><th align="center" style="width:24%">Tên bài</th><th align="center">Mục tiêu bài học</th></tr></thead><tbody>${goals.length?goals.map((r,i)=>`<tr><td align="center">${i+1}</td><td>${esc(r.topic)}</td><td><strong>${esc(r.name)}</strong></td><td>${esc(r.goals.join('; '))}</td></tr>`).join(''):'<tr><td colspan="4" align="center">Chưa có câu hỏi trong đề cương.</td></tr>'}</tbody></table></div></section>`+
 `<section class="doc-section"><h4>B. HỆ THỐNG CÂU HỎI ÔN TẬP</h4>`+
 (mcs.length?`<h5>I. TRẮC NGHIỆM NHIỀU LỰA CHỌN (${mcs.length} câu)</h5>${mcs.map((q,i)=>`<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><p><strong>Câu ${q.slot_number||(i+1)}.</strong> <span data-edit-field="question">${esc(q.question)}</span> ${showAnswers?`<span class="badge" contenteditable="false">${esc(q.lesson_code||'')} · ${esc(q.level||'')}</span>`:''}</p>${showAnswers?`<ol class="options">${(q.options||[]).map((o,oi)=>`<li class="${oi===q.correct?'correct':''}">${oi===q.correct?'<span class="answer-label" contenteditable="false">ĐÁP ÁN ĐÚNG</span>':''}<strong>${'ABCD'[oi]}.</strong> <span data-edit-opt="${oi}">${esc(o)}</span></li>`).join('')}</ol>`:`<div class="doc-options ${mcColsClass(q.options)}">${(q.options||[]).map((o,oi)=>`<p class="doc-option"><strong>${'ABCD'[oi]}.</strong> <span data-edit-opt="${oi}">${esc(o)}</span></p>`).join('')}</div>`}</article>`).join('')}`:'')+
 (yns.length?`<h5>II. TRẮC NGHIỆM ĐÚNG / SAI (${yns.length} câu · ${yns.reduce((s,q)=>s+(q.statements||[]).length,0)} mệnh đề)</h5>${yns.map((q,i)=>`<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><p><strong>Câu ${q.slot_number||(i+1)}.</strong> <span data-edit-field="question">${esc(q.question)}</span> ${showAnswers?`<span class="badge" contenteditable="false">${esc(q.lesson_code||'')}</span>`:''}</p>${showAnswers?`<ol class="options">${(q.statements||[]).map((st,si)=>`<li class="${st.correct?'correct':''}"><span class="answer-label" contenteditable="false">${st.correct?'ĐÚNG':'SAI'}</span><strong>${esc(st.label||('abcd'[si]))})</strong> <span data-edit-stmt="${si}">${esc(st.text)}</span></li>`).join('')}</ol>`:`<div class="doc-options">${(q.statements||[]).map((st,si)=>`<p class="doc-option"><strong>${esc(st.label||('abcd'[si]))})</strong> <span data-edit-stmt="${si}">${esc(st.text)}</span></p>`).join('')}</div>`}</article>`).join('')}`:'')+
 (ess.length?`<h5>${hasYn?'III':'II'}. TỰ LUẬN & BÀI TẬP THỰC TẾ (${ess.length} câu)</h5>${ess.map((q,i)=>`<article class="doc-question" data-edit-qid="${esc(q.id||'')}"><p><strong>Câu ${q.slot_number||(i+1)}.</strong> <span data-edit-field="question">${esc(q.question)}</span> ${showAnswers?`<span class="badge" contenteditable="false">${esc(q.lesson_code||'')} · ${esc(q.level||'')}</span>`:''}</p>${showAnswers?`<table class="rubric-table"><thead><tr><th align="center">Tiêu chí hướng dẫn chấm</th><th align="center" style="width:110px">Điểm</th></tr></thead><tbody>${(q.rubric||[]).map((c,ri)=>`<tr><td data-edit-rubric="${ri}">${esc(c.criterion)}</td><td align="center"><strong>${fmtPts(c.points)} điểm</strong></td></tr>`).join('')}</tbody></table>`:''}</article>`).join('')}`:'')+
 `</section>`+
 `<section class="doc-section" style="page-break-before:always;margin-top:28px;border-top:2px solid var(--line);padding-top:16px"><h4>C. BẢNG ĐÁP ÁN GỢI Ý VÀ HƯỚNG DẪN CHẤM</h4>`+
 (mcs.length?`<h5>I. BẢNG ĐÁP ÁN TRẮC NGHIỆM (${mcs.length} câu)</h5><div class="answer-grid">${mcs.map((q,i)=>{const num=q.slot_number||(i+1);const corr=q.correct!==undefined&&'ABCD'[q.correct]?'ABCD'[q.correct]:'—';return `<div class="answer-cell" align="center"><span>Câu ${num}</span><strong>${corr}</strong></div>`;}).join('')}</div>`:'')+
 (yns.length?`<h5>II. BẢNG ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI (${yns.length} câu)</h5><div class="table-wrap"><table class="doc-table"><thead><tr><th align="center">Câu hỏi</th><th align="center">Ý a)</th><th align="center">Ý b)</th><th align="center">Ý c)</th><th align="center">Ý d)</th></tr></thead><tbody>${yns.map((q,i)=>{const num=q.slot_number||(i+1);const sts=q.statements||[];return `<tr><td align="center"><strong>Câu ${num}</strong></td>${[0,1,2,3].map(si=>`<td align="center"><strong>${sts[si]?.correct?'ĐÚNG':'SAI'}</strong></td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`:'')+
 (ess.length?`<h5>${hasYn?'III':'II'}. HƯỚNG DẪN CHẤM VÀ GỢI Ý TỰ LUẬN (${ess.length} câu)</h5>${ess.map((q,i)=>{const num=q.slot_number||(i+1);const pts=q.points!==undefined?` (${fmtPts(q.points)} điểm)`:'';return `<article class="doc-question"><p><strong>Câu ${num}${esc(pts)}.</strong> ${esc(q.question)}</p>${(q.rubric||[]).length?`<table class="rubric-table"><thead><tr><th align="center">Tiêu chí hướng dẫn chấm</th><th align="center" style="width:110px">Điểm</th></tr></thead><tbody>${(q.rubric||[]).map(c=>`<tr><td>${esc(c.criterion)}</td><td align="center"><strong>${fmtPts(c.points)} điểm</strong></td></tr>`).join('')}</tbody></table>`:''}${q.equivalent_answer_policy?`<p class="small muted" style="margin-top:6px"><em>Quy tắc chấm tương đương: ${esc(q.equivalent_answer_policy)}</em></p>`:''}</article>`;}).join('')}`:'')+
 `</section></div>`;
}
function mountExamViewerContent(hostEl,record,mode='student',isInline=false){
 const base=record.id?'/api/exams/'+encodeURIComponent(record.id)+'/export':'';
 const meta=`${esc(subject(record))} ${esc(record.grade)} · Thời gian: ${esc(record.duration||45)} phút · Tổng điểm: ${fmtPts(record.total_points??10)} · Mã đề: ${esc(record.exam_code||'GỐC')}${record.verification?.passed?' · ✅ Đạt chuẩn Ma trận':''}`;
 const fmtKey=`exam:${record.id||record.title||'draft'}:${mode}`;
 const fmt=window.DocFormatter||C.DocFormatter;
 const body=buildExamSheetHtml(record,mode);
 hostEl.innerHTML=`<div class="dialog-heading"><div><p class="eyebrow">XEM TOÀN BỘ ĐỀ KIỂM TRA & ĐỐI CHIẾU MA TRẬN</p><h2 id="${isInline?'inline-exam-title':'detail-title'}">${esc(record.title||'Đề kiểm tra')}</h2><p class="small muted">${meta}</p></div><div class="actions">${isInline?`<button type="button" class="export-link" data-modal-exam="${esc(record.id)}" data-mode="${esc(mode)}">⤢ Mở rộng toàn màn hình</button><button type="button" class="quiet" id="close-inline-exam">Đóng khung xem</button>`:`<button data-close="detail-dialog" class="quiet">Đóng</button>`}</div></div>`+
 `<div class="viewer-toolbar"><div class="viewer-tabs"><button type="button" class="${mode==='student'?'primary':''}" data-switch-exam-mode="student">📄 Xem đề học sinh</button><button type="button" class="${mode==='answers'?'primary':''}" data-switch-exam-mode="answers">🔑 Xem đáp án & HDC</button><button type="button" class="${mode==='verify'?'primary':''}" data-switch-exam-mode="verify">🛡️ Báo cáo Kiểm định Ma trận</button></div><div class="actions">${record.id?`<button type="button" class="export-link" data-reverify-exam="${esc(record.id)}">🔄 Kiểm định lại với Ma trận</button>`:''}${base?`<a class="button export-link" href="${base}?format=docx&answers=0">Word học sinh</a><a class="button export-link" href="${base}?format=docx&answers=1">Word đáp án</a><a class="button export-link" href="${base}?format=tex&answers=0" title="Xuất mã nguồn XeLaTeX chuẩn">LaTeX đề thi</a><a class="button export-link" href="${base}?format=tex&answers=1" title="Xuất mã nguồn XeLaTeX Đáp án & HDC">LaTeX đáp án</a><a class="button export-link" href="${base}?format=docx&target=lms">📤 Tải tệp LMS</a><a class="button export-link" href="${base}?format=html&answers=${mode==='answers'?1:0}" target="_blank" rel="noopener">Mở trang in</a>`:''}</div></div>`+
 (fmt?fmt.toolbarHtml(fmtKey,false):'')+body;
 hostEl.querySelectorAll('[data-switch-exam-mode]').forEach(btn=>{
  btn.onclick=()=>mountExamViewerContent(hostEl,record,btn.dataset.switchExamMode,isInline);
 });
 const closeInlineBtn=hostEl.querySelector('#close-inline-exam');
 if(closeInlineBtn)closeInlineBtn.onclick=()=>{store.activeExamViewId=null;hostEl.hidden=true;hostEl.innerHTML='';};
 const modalBtn=hostEl.querySelector('[data-modal-exam]');
 if(modalBtn)modalBtn.onclick=()=>openExamViewerModal(record,mode);
 const reverifyBtn=hostEl.querySelector('[data-reverify-exam]');
 if(reverifyBtn)reverifyBtn.onclick=async()=>{
  await mutate('/api/exams/verify',{id:record.id},res=>{
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
 const ess=(record.questions||[]).filter(q=>q.type==='ES');
 const fmtKey=`revision:${record.id||record.title||'draft'}:${showAnswers?1:0}`;
 const fmt=window.DocFormatter||C.DocFormatter;
 const body=buildRevisionSheetHtml(record,showAnswers);
 hostEl.innerHTML=`<div class="dialog-heading"><div><p class="eyebrow">XEM TOÀN BỘ ĐỀ CƯƠNG ÔN TẬP</p><h2 id="${isInline?'inline-rev-title':'detail-title'}">${esc(record.title||'Đề cương ôn tập')}</h2><p class="small muted">Khối ${esc(record.grade)} · ${countRecord(record)} câu (${mcs.length} trắc nghiệm NLC${yns.length?`, ${yns.length} câu Đúng/Sai`:''}, ${ess.length} tự luận)</p></div><div class="actions">${isInline?`<button type="button" class="export-link" id="open-modal-rev">⤢ Mở rộng toàn màn hình</button><button type="button" class="quiet" id="close-inline-rev">Đóng khung xem</button>`:`<button data-close="detail-dialog" class="quiet">Đóng</button>`}</div></div>`+
 `<div class="viewer-toolbar"><div class="viewer-tabs"><button type="button" class="${!showAnswers?'primary':''}" data-switch-rev-ans="0">📄 Bản đề cương học sinh</button><button type="button" class="${showAnswers?'primary':''}" data-switch-rev-ans="1">🔑 Xem kèm đáp án & HDC</button></div>${base?`<div class="actions"><a class="button export-link" href="${base}?format=docx&answers=0">Word đề cương</a><a class="button export-link" href="${base}?format=docx&answers=1">Word kèm đáp án</a><a class="button export-link" href="${base}?format=tex&answers=0" title="Xuất mã nguồn XeLaTeX chuẩn">LaTeX đề cương</a><a class="button export-link" href="${base}?format=docx&target=lms">📤 Tải tệp LMS</a><a class="button export-link" href="${base}?format=html&answers=${showAnswers?1:0}" target="_blank" rel="noopener">Bản in</a></div>`:''}</div>`+
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
function openEditor(id,duplicate=false){
 const old=id?questions().find(q=>q.id===id):null;
 if(old&&duplicate){
  const copy=structuredClone(old);
  delete copy.id;
  copy.question=copy.question+' (Bản sao)';
  copy.review_status='draft';
  store.editing=copy;
 }else{
  store.editing=old?structuredClone(old):{grade:Number(store.filters.grade)||grades()[0],type:'MC',level:'Biết',lesson_code:store.filters.lesson||'',review_status:'draft',response_mode:'Trắc nghiệm',question:'',options:['','','',''],correct:0,option_explanations:['','','',''],max_score:1};
 }
 const q=store.editing;$('#edit-title').textContent=duplicate?'Nhân bản câu hỏi':old?'Sửa câu hỏi':'Thêm câu hỏi';
 $('#question-form').innerHTML=`<div id="form-error" class="callout error" role="alert" hidden></div><div class="form-grid"><div class="field"><label for="edit-grade">Khối lớp</label><select id="edit-grade" name="grade">${gradeOptions(q.grade)}</select></div><div class="field"><label for="edit-type">Dạng câu</label><select id="edit-type" name="type">${Object.entries(typeNames).map(([k,v])=>opt(k,v,k===q.type)).join('')}</select></div><div class="field"><label for="edit-level">Mức độ</label><select id="edit-level" name="level">${['Biết','Hiểu','Vận dụng'].map(v=>opt(v,v,v===q.level)).join('')}</select></div><div class="field full"><label for="edit-lesson">Bài theo PPCT</label><select id="edit-lesson" name="lesson_code" required></select></div><div class="field full"><label for="edit-outcome">Yêu cầu cần đạt</label><select id="edit-outcome" name="outcome_index" required></select></div><div class="field span2"><label for="edit-status">Trạng thái sau khi lưu</label><select id="edit-status" name="review_status">${Object.entries(statusNames).map(([k,v])=>opt(k,v,k===q.review_status)).join('')}</select></div><div class="field"><label for="edit-mode">Cách trả lời</label><select id="edit-mode" name="response_mode">${['Trắc nghiệm','Tự luận','Thực hành'].map(v=>opt(v,v,v===q.response_mode)).join('')}</select></div><div class="field full"><label for="edit-question">Nội dung câu hỏi</label><textarea id="edit-question" name="question" rows="5" required>${esc(q.question)}</textarea></div></div><div id="answer-editor" style="margin-top:20px"></div><p class="editor-note">Câu mới mặc định là bản nháp. Chỉ chọn “Đã tự kiểm tra nội dung” sau khi đã kiểm tra đáp án, phương án nhiễu và YCCĐ.</p><div class="dialog-bottom"><button type="button" data-close="edit-dialog">Hủy</button><button type="submit" class="primary">Lưu câu hỏi</button></div>`;
 editorLessons(q.lesson_code,q.outcome_index,q.learning_outcome);renderAnswerEditor(q.type);
 $('#edit-grade').onchange=()=>editorLessons('',0);$('#edit-lesson').onchange=()=>editorOutcomes(0);$('#edit-type').onchange=()=>{renderAnswerEditor($('#edit-type').value);$('#edit-mode').value=$('#edit-type').value==='MC'?'Trắc nghiệm':'Tự luận';if($('#edit-type').value==='ES')$('#edit-level').value='Vận dụng';};$('#question-form').onsubmit=saveQuestion;
 $('#detail-dialog').close();$('#edit-dialog').showModal();
}
function editorLessons(code,index,outcome){const ls=lessons($('#edit-grade').value);$('#edit-lesson').innerHTML=ls.map(l=>opt(l.lesson_code,l.lesson_name_source,l.lesson_code===code)).join('');editorOutcomes(index,outcome);}
function editorOutcomes(index=0,outcome){const l=lessons($('#edit-grade').value).find(l=>l.lesson_code===$('#edit-lesson').value);const outcomes=l?.outcomes||[];let n=Number.isInteger(index)?index:outcomes.indexOf(outcome);if(n<0)n=0;$('#edit-outcome').innerHTML=outcomes.map((s,i)=>opt(i,s,i===n)).join('');}
function renderAnswerEditor(type){
 const q=store.editing;
 if(type==='MC')$('#answer-editor').innerHTML=`<h3>Phương án và giải thích</h3><p class="muted small">Chọn đúng một phương án bằng nút tròn. Giải thích vì sao từng phương án đúng hoặc sai.</p><div class="edit-options">${[0,1,2,3].map(i=>`<div class="option-editor"><div class="option-radio"><input type="radio" name="correct" value="${i}" aria-label="${'ABCD'[i]} là đáp án đúng"${(q.correct??0)===i?' checked':''}></div><div class="field"><label for="option-${i}">Phương án ${'ABCD'[i]}</label><input id="option-${i}" name="option${i}" value="${esc(q.options?.[i]||'')}" required><label for="explanation-${i}">Giải thích phương án ${'ABCD'[i]}</label><textarea id="explanation-${i}" name="explanation${i}" rows="2" required>${esc(q.option_explanations?.[i]||'')}</textarea></div></div>`).join('')}</div>`;
 else $('#answer-editor').innerHTML=`<h3>Hướng dẫn chấm · 1 điểm</h3><p class="muted small">Bốn tiêu chí, mỗi tiêu chí 0,25 điểm. Nêu rõ sản phẩm hoặc minh chứng nếu là bài thực hành.</p>${[0,1,2,3].map(i=>`<div class="field" style="margin-bottom:12px"><label for="rubric-${i}">Tiêu chí ${i+1} · 0,25 điểm</label><textarea id="rubric-${i}" name="rubric${i}" rows="2" required>${esc(q.rubric?.[i]?.criterion||'')}</textarea></div>`).join('')}<div class="field"><label for="equivalent-policy">Chấp nhận đáp án tương đương</label><textarea id="equivalent-policy" name="equivalent_answer_policy" required>${esc(q.equivalent_answer_policy||'Chấp nhận cách diễn đạt và giải pháp tương đương nếu đúng dữ kiện, phù hợp yêu cầu và có giải thích hợp lí; chấm từng tiêu chí độc lập.')}</textarea></div>`;
}
async function saveQuestion(event){
 event.preventDefault();const f=new FormData(event.target),q={...store.editing,grade:Number(f.get('grade')),type:f.get('type'),lesson_code:f.get('lesson_code'),outcome_index:Number(f.get('outcome_index')),level:f.get('level'),review_status:f.get('review_status'),response_mode:f.get('response_mode'),question:f.get('question').trim(),max_score:1};
 const lesson=lessons(q.grade).find(l=>l.lesson_code===q.lesson_code);q.learning_outcome=lesson?.outcomes?.[q.outcome_index]||'';q.lesson_name=lesson?.lesson_name_source||'';q.topic_source=lesson?.topic_source||'';
 q.source_file=lesson?.source_file||'';q.source_rows=(lesson?.occurrences||[]).map(r=>({table_index:r.table_index,row_index:r.row_index,week_raw:r.week_raw,periods_raw:r.periods_raw}));q.semester=1;
 const lessonPeriods=(lesson?.occurrences||[]).flatMap(r=>String(r.periods_raw||'').match(/\d+/g)||[]).map(Number);if(lessonPeriods.length){q.first_ppct_period=Math.min(...lessonPeriods);q.after_hk1_exam=q.first_ppct_period>=(q.grade===10?32:16);}

 if(q.type==='MC'){q.options=[0,1,2,3].map(i=>f.get('option'+i).trim());q.correct=Number(f.get('correct'));q.option_explanations=[0,1,2,3].map(i=>f.get('explanation'+i).trim());delete q.rubric;delete q.equivalent_answer_policy;}else{q.rubric=[0,1,2,3].map(i=>({criterion:f.get('rubric'+i).trim(),points:.25}));q.equivalent_answer_policy=f.get('equivalent_answer_policy').trim();delete q.options;delete q.correct;delete q.option_explanations;}
 const result=await mutate('/api/questions/save',{question:q},()=>{$('#edit-dialog').close();render();notify('Đã lưu câu hỏi vào ngân hàng.');});return result;
}
async function archiveQuestion(id){const q=questions().find(q=>q.id===id);if(!q||!confirm(`Lưu trữ câu ${id}? Câu sẽ ngừng được chọn tạo đề; nội dung và lịch sử vẫn được giữ.`))return;await mutate('/api/questions/archive',{id},()=>{store.selected.delete(id);$('#detail-dialog').close();render();notify('Đã lưu trữ câu hỏi. Có thể tìm lại qua bộ lọc “Đã lưu trữ”.');});}
async function restoreQuestion(id){
 const q=questions().find(q=>q.id===id);if(!q)return;
 try{
  const res=await request('/api/questions/restore',{id,status:'approved'});
  if(res.bank)store.bank=res.bank;
 }catch{
  const copy=structuredClone(q);copy.review_status='approved';
  const res=await request('/api/questions/save',{question:copy});
  if(res.bank)store.bank=res.bank;
 }
 $('#detail-dialog').close();render();notify(`Đã khôi phục câu hỏi ${id} về trạng thái Mẫu đã duyệt.`);
}
async function deleteQuestion(id){
 const q=questions().find(q=>q.id===id);if(!q||!confirm(`Xóa vĩnh viễn câu hỏi ${id} khỏi ngân hàng? (Hệ thống vẫn lưu một bản sao lưu dự phòng trong thư mục backups).`))return;
 try{
  const res=await request('/api/questions/delete',{id});
  if(res.bank)store.bank=res.bank;
 }catch{
  const nextBank=structuredClone(store.bank);
  nextBank.questions=nextBank.questions.filter(x=>x.id!==id);
  const res=await request('/api/bank/import',{bank:nextBank});
  if(res.bank)store.bank=res.bank;
 }
 store.selected.delete(id);$('#detail-dialog').close();render();notify(`Đã xóa câu hỏi ${id}.`);
}
async function bulkUpdateSelected(action,status='approved'){
 const ids=[...store.selected];
 if(!ids.length){notify('Hãy đánh dấu chọn ít nhất một câu hỏi trước.',true);return;}
 if(action==='delete'&&!confirm(`Xóa vĩnh viễn ${ids.length} câu hỏi đang chọn?`))return;
 if(action==='status'&&!confirm(`Đổi trạng thái ${ids.length} câu hỏi đang chọn thành "${statusNames[status]||status}"?`))return;
 try{
  const res=await request('/api/questions/bulk',{ids,action,status});
  if(res.bank)store.bank=res.bank;
 }catch{
  const nextBank=structuredClone(store.bank);
  const set=new Set(ids);
  if(action==='delete')nextBank.questions=nextBank.questions.filter(x=>!set.has(x.id));
  else nextBank.questions.forEach(x=>{if(set.has(x.id))x.review_status=status;});
  const res=await request('/api/bank/import',{bank:nextBank});
  if(res.bank)store.bank=res.bank;
 }
 if(action==='delete'||status==='archived')ids.forEach(id=>store.selected.delete(id));
 render();notify(action==='delete'?`Đã xóa ${ids.length} câu hỏi.`:`Đã cập nhật trạng thái cho ${ids.length} câu hỏi.`);
}
async function importBank(event){const file=event.target.files[0];if(!file)return;try{const bank=JSON.parse(await file.text());if(!confirm('Nhập ngân hàng từ tệp JSON này? Ứng dụng sẽ kiểm tra dữ liệu và sao lưu trước khi ghi. PPCT gốc được giữ theo danh mục đang có.'))return;await mutate('/api/bank/import',{bank},()=>{render();notify('Đã nhập ngân hàng và lưu bản sao trước thay đổi.');});}catch(e){notify('Không đọc được tệp JSON: '+e.message,true);}finally{event.target.value='';}}
function renderPPCT(){
 const g=store.ppctGrade;
 const s=store.selectedSubject || store.ppctSubject || 'Tin học';
 store.ppctSubject = s;
 const allSubjects=['Tin học', 'Toán học', 'Vật lí', 'Hóa học', 'Sinh học', 'Ngữ văn', 'Tiếng Anh', 'Lịch sử', 'Địa lí'];
 const ls=lessons(g, s);
 $('#ppct').innerHTML=title(`Chương trình môn ${s}`,'Phân phối chương trình',`Quản lý bài học, tuần, tiết và yêu cầu cần đạt môn ${s} Khối ${g}.`,
   `<div style="display:flex;gap:8px">` +
   (store.isTestMode && !ls.length ? `<button type="button" class="button" id="btn-load-sample-ppct" style="background:#eaf3fb;color:var(--blue,#0267b1);font-weight:600">📥 Nạp mẫu PPCT GDPT 2018 (${esc(s)})</button>` : '') +
   `<button type="button" class="primary" id="add-ppct-lesson">+ Thêm bài học PPCT</button></div>`)+
 `<div class="card">
   <div style="display:flex;gap:14px;margin-bottom:18px;flex-wrap:wrap">
     <div class="field" style="min-width:200px">
       <label for="ppct-subject" style="display:block;font-weight:600;margin-bottom:4px">Môn học</label>
       <select id="ppct-subject" ${store.context.curriculum_id?'disabled':''} style="width:100%;padding:8px">${allSubjects.map(sub=>opt(sub,sub,sub===s)).join('')}</select>
     </div>
     <div class="field" style="min-width:180px">
       <label for="ppct-grade" style="display:block;font-weight:600;margin-bottom:4px">Khối lớp</label>
       <select id="ppct-grade" style="width:100%;padding:8px">${gradeOptions(g)}</select>
     </div>
   </div>
   <div class="table-wrap">
     <table class="ppct-table">
       <thead><tr><th>Tuần</th><th>Tiết</th><th>Bài / chủ đề</th><th>Yêu cầu cần đạt (YCCĐ)</th><th style="width:150px">Thao tác</th></tr></thead>
       <tbody>${ls.length ? ls.map(l=>`<tr><td>${[...new Set((l.occurrences||[]).map(o=>o.week_raw))].map(esc).join('<br>')}</td><td>${[...new Set((l.occurrences||[]).map(o=>o.periods_raw))].map(esc).join(', ')}</td><td><strong>${esc(l.lesson_code)} · ${esc(l.lesson_name_source || l.lesson_name || l.name)}</strong><p class="small muted">${esc(l.topic_source || '')}</p></td><td><ul>${(l.outcomes||[]).map(o=>`<li>${esc(o)}</li>`).join('')}</ul></td><td><div class="actions"><button type="button" class="export-link" data-edit-ppct="${esc(l.lesson_code)}" data-grade="${g}">Sửa</button><button type="button" class="export-link danger" data-del-ppct="${esc(l.lesson_code)}" data-grade="${g}">Xóa</button></div></td></tr>`).join('') : '<tr><td colspan="5" class="empty" style="text-align:center;padding:24px">Chưa có bài học PPCT cho môn và khối này. Bấm "+ Thêm bài học PPCT" để bổ sung, hoặc bấm "Nạp mẫu PPCT GDPT 2018" để nạp nhanh khung bài học.</td></tr>'}</tbody>
     </table>
   </div>
 </div>
 <div class="card"><h2>Hồ sơ nguồn</h2>${(store.bank.ppct?.sources||[]).filter(src=>Number(src.grade)===g && s==='Tin học').map(src=>`<p class="small">${esc(src.path||src.source_file||'')}</p><p class="muted">${esc(src.approval_status||'Đối chiếu bản KHDH trong thư mục chuyên môn.')}</p>`).join('') || `<p class="muted">Khung chương trình chuẩn Giáo dục Phổ thông 2018 (Bộ GD&ĐT) cho môn ${esc(s)}.</p>`}</div>`;
 $('#ppct-grade').onchange=e=>{store.ppctGrade=Number(e.target.value);renderPPCT();};
 $('#ppct-subject').onchange=e=>setGlobalSubject(e.target.value);
 $('#add-ppct-lesson').onclick=()=>openPPCTEditor(g,'',s);
 const sampleBtn=$('#btn-load-sample-ppct');
 if(sampleBtn)sampleBtn.onclick=()=>{store.testPpctLoaded=true;renderPPCT();notify(`Đã nạp mẫu PPCT GDPT 2018 cho môn ${s}.`);};
}
function openPPCTEditor(grade,code='',subj=''){
 const s = subj || store.ppctSubject || 'Tin học';
 const existing=code?lessons(grade, s).find(l=>l.lesson_code===code):null;
 const occ=(existing?.occurrences||[])[0]||{week_raw:'Tuần 1',periods_raw:'1, 2'};
 $('#edit-title').textContent=existing?`Sửa bài học PPCT · ${existing.lesson_code}`:'Thêm bài học vào PPCT';
 $('#question-form').innerHTML=`<div id="form-error" class="callout error" role="alert" hidden></div><div class="form-grid"><div class="field"><label for="ppct-edit-grade">Khối lớp</label><select id="ppct-edit-grade" name="grade"${existing?' disabled':''}>${gradeOptions(grade)}</select></div><div class="field"><label for="ppct-edit-code">Mã bài (ví dụ: B1, B13)</label><input id="ppct-edit-code" name="lesson_code" value="${esc(existing?.lesson_code||'')}" ${existing?'readonly':''} required></div><div class="field"><label for="ppct-edit-week">Tuần</label><input id="ppct-edit-week" name="week_raw" value="${esc(occ.week_raw||'')}" required></div><div class="field span2"><label for="ppct-edit-name">Tên bài học</label><input id="ppct-edit-name" name="lesson_name_source" value="${esc(existing?.lesson_name_source||'')}" required></div><div class="field"><label for="ppct-edit-periods">Tiết</label><input id="ppct-edit-periods" name="periods_raw" value="${esc(occ.periods_raw||'')}" required></div><div class="field full"><label for="ppct-edit-topic">Chủ đề</label><input id="ppct-edit-topic" name="topic_source" value="${esc(existing?.topic_source||'')}" required></div><div class="field full"><label for="ppct-edit-outcomes">Yêu cầu cần đạt (mỗi dòng 1 yêu cầu)</label><textarea id="ppct-edit-outcomes" name="outcomes" rows="6" required>${esc((existing?.outcomes||[]).join('\n'))}</textarea></div></div><div class="dialog-bottom"><button type="button" data-close="edit-dialog">Hủy</button><button type="submit" class="primary">Lưu bài học PPCT</button></div>`;
 $('#question-form').onsubmit=async ev=>{
  ev.preventDefault();
  const f=new FormData(ev.target);
  const payload={
   grade:Number(existing?grade:f.get('grade')),
   lesson_code:(existing?existing.lesson_code:f.get('lesson_code')).trim(),
   lesson_name_source:f.get('lesson_name_source').trim(),
   topic_source:f.get('topic_source').trim(),
   week_raw:f.get('week_raw').trim(),
   periods_raw:f.get('periods_raw').trim(),
   outcomes:f.get('outcomes').split('\n').map(x=>x.trim()).filter(Boolean)
  };
  await mutate('/api/ppct/save-lesson',{lesson:payload},()=>{
   $('#edit-dialog').close();renderPPCT();notify('Đã lưu thông tin bài học và Yêu cầu cần đạt vào PPCT.');
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
 return `<div class="card-actions">`+
  `<button type="button" class="export-link primary" data-view-revision="${esc(r.id)}">👁 Xem toàn bộ đề cương</button>`+
  `<details class="dropdown-menu"><summary>📥 Tải về ▾</summary><div class="dropdown-content">`+
   `<a href="${base}?format=docx">Word đề cương</a>`+
   `<a href="${base}?format=docx&answers=1">Word kèm đáp án</a>`+
   `<a href="${base}?format=pdf&answers=0">PDF đề cương</a>`+
   `<a href="${base}?format=tex&answers=0">LaTeX đề cương (.tex)</a>`+
   `<a href="${base}?format=docx&target=lms">📤 Tệp upload LMS (.docx)</a>`+
   `<a href="${base}?format=html" target="_blank" rel="noopener">Mở bản in</a>`+
  `</div></details>`+
  `<details class="dropdown-menu"><summary>⚙️ Thao tác ▾</summary><div class="dropdown-content">`+
   `<button type="button" data-view-revision="${esc(r.id)}" data-answers="1">🔑 Xem kèm đáp án & HDC</button>`+
   `<button type="button" data-use-revision="${esc(r.id)}">Dùng tạo đề kiểm tra</button>`+
   `<button type="button" data-edit-revision="${esc(r.id)}">Sửa đề cương</button>`+
   `<button type="button" data-dup-revision="${esc(r.id)}">Nhân bản</button>`+
   `<hr>`+
   `<button type="button" class="danger" data-del-revision="${esc(r.id)}">Xóa đề cương</button>`+
  `</div></details>`+
 `</div>`;
}
function renderRevisions(){
 const g=store.revisionGrade,ids=C.revisionIds(questions(),[...store.selected],g),qs=questions().filter(q=>ids.includes(q.id));
 const editingRev=store.editingRevisionId?store.revisions.find(r=>r.id===store.editingRevisionId):null;
 $('#revisions').innerHTML=title('Chuẩn bị ôn tập','Đề cương ôn tập','Lưu một phiên bản nội dung để đối chiếu khi tạo đề. Hỗ trợ Xem toàn bộ trên trang, Import (.docx/.json), Tạo mới, Sửa, Nhân bản và Xóa.',`<button type="button" class="primary" id="import-revision-btn">📥 Import Đề cương (.docx / .json)</button><input type="file" id="import-revision-file" class="json-import" accept=".docx,.json"><a class="button" href="#bank">Chọn câu trong ngân hàng</a>`)+
 `<div class="card"><h2>Các phiên bản đề cương đã lưu (${store.revisions.length})</h2>${store.revisions.length?[...store.revisions].reverse().map(r=>`<article class="saved-item"><div><h3>${esc(r.title)}</h3><p><strong>Khối ${r.grade}</strong> · ${countRecord(r)} câu hỏi (${(r.questions||[]).filter(q=>q.type==='MC').length} MC${(r.questions||[]).some(q=>q.type==='YN')?`, ${(r.questions||[]).filter(q=>q.type==='YN').length} Đúng/Sai`:''}, ${(r.questions||[]).filter(q=>q.type==='ES').length} Tự luận) · ${esc(date(r.updated_at||r.created_at))}</p><p class="q-id">${esc(r.id)}${r.source_file?` · Nguồn: ${esc(r.source_file)}`:''}</p></div><div class="actions">${revisionLinks(r)}</div></article>`).join(''):empty('Chưa có phiên bản đề cương','Chọn câu ở ngân hàng hoặc Import tệp .docx đề cương.')}</div>`+
 `<div id="revision-inline-viewer" class="card" hidden></div>`+
 `<div class="two-col"><div class="card"><h2>${editingRev?`Sửa phiên bản đề cương (${esc(editingRev.id)})`:'Lưu đề cương mới từ Ngân hàng'}</h2><form id="revision-form"><div class="form-grid"><div class="field"><label for="revision-grade">Khối lớp</label><select id="revision-grade">${gradeOptions(g)}</select></div><div class="field span2"><label for="revision-title">Tên phiên bản</label><input id="revision-title" value="${esc(store.revisionTitleDraft||(editingRev?.title||''))}" placeholder="Ví dụ: Đề cương Giữa HK1 · Khối ${g} · bản 1" required></div></div><div class="selection-tray"><span><strong>${ids.length}</strong> câu khối ${g} đang được chọn</span><a href="#bank">Điều chỉnh lựa chọn</a></div><div class="actions"><button type="button" id="revision-add-filter">Thêm câu đang lọc của khối ${g}</button><button type="button" id="revision-preview-draft"${!ids.length?' disabled':''}>Xem toàn bộ đang chọn</button><button type="button" id="revision-clear" class="quiet">Bỏ chọn khối ${g}</button></div><div class="revision-ids">${qs.length?qs.map(q=>`${esc(q.id)} · ${esc(q.lesson_code)} · ${esc(q.level)} · ${esc(statusNames[q.review_status])}`).join('<br>'):'Chưa chọn câu. Mở ngân hàng, lọc theo bài và đánh dấu những câu muốn đưa vào đề cương.'}</div><div class="actions"><button type="submit" id="save-revision" class="primary"${!ids.length?' disabled':''}>${editingRev?'Cập nhật đề cương đang sửa':'Lưu phiên bản đề cương'}</button>${editingRev?`<button type="button" id="save-revision-as-new"${!ids.length?' disabled':''}>Lưu thành bản mới</button><button type="button" class="quiet" id="cancel-edit-revision">Hủy sửa</button>`:''}</div></form></div><div class="card"><h2>Giữ đúng nội dung đã chuẩn bị</h2><p class="muted">Phiên bản lưu giữ nội dung câu hỏi tại thời điểm tạo. Nếu sửa một câu trong ngân hàng sau đó, phiên bản cũ vẫn giữ nguyên.</p><div class="callout">Khi tạo đề hoặc kiểm định đề thi, ít nhất <strong>90% điểm số / câu hỏi</strong> phải khớp nội dung trong phiên bản đề cương của khối.</div><p class="small muted">Bấm <strong>👁 Xem toàn bộ</strong> ở bất kì đề cương nào phía trên để xem đầy đủ bảng giới hạn kiến thức, toàn bộ câu hỏi và chỉnh sửa trực tiếp ngay trên trang web.</p></div></div>`;
 $('#import-revision-btn').onclick=()=>$('#import-revision-file').click();
 $('#import-revision-file').onchange=async ev=>{
  const file=ev.target.files?.[0];if(!file)return;
  try{
   const b64=await fileToBase64(file);
   await mutate('/api/revisions/import-file',{filename:file.name,content_base64:b64},res=>{
    if(res.revisions)store.revisions=res.revisions;else if(res.revision)store.revisions.push(res.revision);
    store.activeRevisionViewId=res.revision?.id;
    renderRevisions();
    notify(`Đã import đề cương "${res.revision?.title||file.name}" (${res.revision?.question_count||0} câu).`);
   });
  }catch(err){notify(err.message,true);}finally{ev.target.value='';}
 };
 $('#revision-grade').onchange=e=>{store.revisionGrade=Number(e.target.value);renderRevisions();};
 $('#revision-title').oninput=e=>{store.revisionTitleDraft=e.target.value;};
 $('#revision-add-filter').onclick=()=>{filtered().filter(q=>q.grade===g&&q.review_status!=='archived').forEach(q=>store.selected.add(q.id));renderRevisions();};
 $('#revision-preview-draft').onclick=()=>openRevisionViewer({title:$('#revision-title').value.trim()||`Đề cương dự kiến · Khối ${g}`,grade:g,questions:qs},false);
 $('#revision-clear').onclick=()=>{questions().filter(q=>q.grade===g).forEach(q=>store.selected.delete(q.id));renderRevisions();};
 if($('#cancel-edit-revision'))$('#cancel-edit-revision').onclick=()=>{store.editingRevisionId=null;store.revisionTitleDraft='';renderRevisions();};
 if($('#save-revision-as-new'))$('#save-revision-as-new').onclick=async()=>{
  const title=$('#revision-title').value.trim();if(!title)return;
  await mutate('/api/revisions/save',{title,grade:g,question_ids:ids},async result=>{store.revisions.push(result.revision);store.editingRevisionId=null;store.revisionTitleDraft='';renderRevisions();notify('Đã lưu thành phiên bản đề cương mới.');});
 };
 $('#revision-form').onsubmit=async e=>{
  e.preventDefault();const title=$('#revision-title').value.trim();if(!title)return;
  if(editingRev){
   await mutate('/api/revisions/update',{id:editingRev.id,title,grade:g,question_ids:ids},async result=>{
    if(result.revisions)store.revisions=result.revisions;
    else{const idx=store.revisions.findIndex(x=>x.id===editingRev.id);if(idx>=0)store.revisions[idx]=result.revision;}
    store.editingRevisionId=null;store.revisionTitleDraft='';renderRevisions();notify('Đã cập nhật phiên bản đề cương.');
   });
  }else{
   await mutate('/api/revisions/save',{title,grade:g,question_ids:ids},async result=>{store.revisions.push(result.revision);store.revisionTitleDraft='';renderRevisions();notify('Đã lưu phiên bản đề cương. Có thể xuất Word hoặc dùng khi tạo đề.');});
  }
 };
 const activeRev=store.revisions.find(r=>r.id===store.activeRevisionViewId)||store.revisions[0];
 if(activeRev&&$('#revision-inline-viewer')){
  $('#revision-inline-viewer').hidden=false;
  mountRevisionViewerContent($('#revision-inline-viewer'),activeRev,Boolean(store.activeRevisionShowAnswers),true);
 }
}
function startEditRevision(id){
 const r=store.revisions.find(x=>x.id===id);if(!r)return;
 store.editingRevisionId=r.id;
 store.revisionGrade=Number(r.grade);
 store.revisionTitleDraft=r.title;
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
 const r=store.revisions.find(x=>x.id===id);if(!r||!confirm(`Xóa phiên bản đề cương "${r.title}" (${r.id})?`))return;
 await mutate('/api/revisions/delete',{id},result=>{
  store.revisions=result.revisions||store.revisions.filter(x=>x.id!==id);
  if(store.editingRevisionId===id){store.editingRevisionId=null;store.revisionTitleDraft='';}
  renderRevisions();notify('Đã xóa phiên bản đề cương.');
 });
}
function matchingTemplates(){const d=store.examDraft;return store.templates.filter(t=>Number(t.grade)===Number(d.grade)&&t.exam_type===d.exam_type);}
function chooseExamTemplate(){const d=store.examDraft;d.template_id=matchingTemplates()[0]?.id||'';d.blueprint=d.template_id?[]:[{lesson_code:lessons(d.grade)[0]?.lesson_code||'',type:'MC',level:'Biết',count:10,points_per_question:1}];}
function selectedTemplate(){return store.templates.find(t=>t.id===store.examDraft.template_id);}
function examRows(){return selectedTemplate()?.rows||store.examDraft.blueprint;}
function examLinks(r){
 const base='/api/exams/'+encodeURIComponent(r.id)+'/export';
 return `<div class="card-actions">`+
  `<button type="button" class="export-link primary" data-view-exam="${esc(r.id)}" data-mode="student">👁 Xem toàn bộ đề</button>`+
  `<details class="dropdown-menu"><summary>📥 Tải về ▾</summary><div class="dropdown-content">`+
   `<a href="/api/exams/${esc(r.id)}/bundle.zip?format=docx" style="font-weight:bold;color:var(--brand,#0a58ca)">📦 Tải trọn bộ Hồ sơ Word (.zip)</a>`+
   `<a href="/api/exams/${esc(r.id)}/bundle.zip?format=tex">📦 Tải trọn bộ Hồ sơ LaTeX (.zip)</a>`+
   `<hr>`+
   `<a href="${base}?format=docx&answers=0">Word học sinh</a>`+
   `<a href="${base}?format=docx&answers=1">Word đáp án & HDC</a>`+
   `<a href="${base}?format=pdf&answers=0">PDF học sinh</a>`+
   `<a href="${base}?format=pdf&answers=1">PDF đáp án & HDC</a>`+
   `<a href="${base}?format=tex&answers=0">LaTeX đề thi (.tex)</a>`+
   `<a href="${base}?format=tex&answers=1">LaTeX đáp án (.tex)</a>`+
   `<a href="${base}?format=docx&target=lms">📤 Tệp upload LMS (.docx)</a>`+
   `<a href="${base}?format=html&answers=0" target="_blank" rel="noopener">Trang in đề thi</a>`+
   `<a href="${base}?format=html&answers=1" target="_blank" rel="noopener">Trang in đáp án</a>`+
   `<a href="${base}?format=json&answers=1">Tải tệp JSON</a>`+
  `</div></details>`+
  `<details class="dropdown-menu"><summary>⚙️ Thao tác ▾</summary><div class="dropdown-content">`+
   `<button type="button" data-view-exam="${esc(r.id)}" data-mode="verify">🛡️ Đối chiếu Ma trận</button>`+
   `<button type="button" data-view-exam="${esc(r.id)}" data-mode="answers">🔑 Xem đáp án & HDC</button>`+
   `<button type="button" data-edit-exam="${esc(r.id)}">Sửa thông tin đề</button>`+
   `<button type="button" data-dup-exam="${esc(r.id)}">Nhân bản đề</button>`+
   `<button type="button" data-permute-exam="${esc(r.id)}">🔀 Trộn mã đề (2 hoặc 4 mã)</button>`+
   `<button type="button" data-load-exam="${esc(r.id)}">Nạp cấu hình tạo đề</button>`+
   `<hr>`+
   `<button type="button" class="danger" data-del-exam="${esc(r.id)}">Xóa đề kiểm tra</button>`+
  `</div></details>`+
 `</div>`;
}
function renderExams(){
 // A newly added first lesson must also become the value behind the visible selector.
 store.examDraft.blueprint.forEach(row=>{if(!row.lesson_code)row.lesson_code=lessons(store.examDraft.grade)[0]?.lesson_code||'';});
 const d=store.examDraft,t=selectedTemplate(),locked=Boolean(t?.locked),required=needsSource(d.grade,d.exam_type),templates=matchingTemplates(),rows=examRows(),summary=C.blueprintSummary(rows);
 const filterG=store.examFilterGrade||'all';
 const shownExams=store.exams.filter(r=>filterG==='all'||Number(r.grade)===Number(filterG));
 const inspected=store.inspectedExamImport;
 $('#exams').innerHTML='<div class="callout">Để dùng một phiên bản ma trận đã thống nhất và chọn câu theo từng YCCĐ, mở <a href="#matrices">Ma trận & đặc tả</a>, chọn bản đã khóa rồi bấm Dùng tạo đề riêng.</div>'+title('Đúng ma trận · đúng phiên bản','Đề kiểm tra & Kiểm định Ma trận','Xem toàn bộ đề thi, kiểm tra đối chiếu với Ma trận đã duyệt & Đề cương ôn tập, hoặc Import đề thi (.docx/.json) sau khi kiểm định.',`<label for="exam-import-revision">Đề cương đối chiếu khi nhập</label><select id="exam-import-revision">${opt('','Chọn phiên bản đề cương…',!store.importRevisionId)}${store.revisions.map(r=>opt(r.id,`Khối ${r.grade} · ${r.title} · ${date(r.created_at)}`,r.id===store.importRevisionId)).join('')}</select><button type="button" class="primary" id="import-exam-btn">📥 Import & Kiểm định Đề thi (.docx / .json)</button><input type="file" id="import-exam-file" class="json-import" accept=".docx,.json">`)+
 (inspected?`<div class="card" id="exam-import-inspection-box"><div class="dialog-heading"><div><p class="eyebrow">KẾT QUẢ KIỂM ĐỊNH TRƯỚC KHI IMPORT</p><h2>Tệp: ${esc(inspected.filename)} (${inspected.candidate_count} đề)</h2></div><div class="actions"><button type="button" class="primary" id="confirm-import-exams"${!inspected.all_passed?' disabled':''}>✅ Xác nhận Import (${inspected.candidate_count} đề đạt chuẩn)</button><button type="button" class="quiet" id="cancel-import-exams">Đóng</button></div></div>${inspected.candidates.map(c=>`<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">${buildVerificationReportHtml(c)}</div>`).join('')}</div>`:'')+
 `<div class="card"><div class="list-toolbar" style="margin-top:0"><h2 style="margin:0">Đề kiểm tra đã lưu & kiểm định (${shownExams.length} / ${store.exams.length})</h2><div class="actions">${['all',...grades()].map(g=>`<button type="button" class="export-link ${String(filterG)===String(g)?'primary':''}" data-exam-grade-filter="${g}">${g==='all'?`Tất cả (${store.exams.length})`:`Khối ${g} (${store.exams.filter(x=>Number(x.grade)===g).length})`}</button>`).join('')}</div></div>${shownExams.length?shownExams.map(r=>{const v=r.verification;const revPct=v?.revision_check?.coverage_percent_points??(r.revision_match_count?Math.round(r.revision_match_count/countRecord(r)*100):90);return `<article class="saved-item"><div><h3>${esc(r.title)} ${v?.passed?'<span class="badge approved">✅ Đạt chuẩn Ma trận</span>':'<span class="badge draft">Cần kiểm định</span>'}</h3><p><strong>Khối ${r.grade}</strong> · Mã đề: <strong>${esc(r.exam_code||'GỐC')}</strong> · ${countRecord(r)} câu · ${r.total_points??10} điểm · Thời gian: ${r.duration||45} phút${r.campus?` · Cơ sở: ${esc(r.campus)}`:''}</p><p class="small muted">Độ phủ đề cương: <strong>${fmtPts(revPct)}% điểm</strong> (${r.revision_match_count??'—'}/${countRecord(r)} câu) · Ma trận: <strong>${esc(v?.matrix_id||r.matrix_id||'Phân bố tự thiết lập')}</strong></p></div><div class="actions">${examLinks(r)}</div></article>`;}).join(''):empty('Chưa có đề kiểm tra','Đề đã tạo hoặc import được lưu cùng báo cáo kiểm định ma trận.')}</div>`+
 `<div id="exam-inline-viewer" class="card" hidden></div>`+
 `<form id="exam-form"><div class="card"><h2>Tạo đề kiểm tra tự động từ Ngân hàng câu hỏi</h2><div class="form-grid"><div class="field"><label for="exam-grade">Khối lớp</label><select id="exam-grade">${gradeOptions(d.grade)}</select></div><div class="field"><label for="exam-period">Kì kiểm tra</label><select id="exam-period">${Object.entries(periodNames).map(([k,v])=>opt(k,v,k===d.exam_type)).join('')}</select></div><div class="field"><label for="exam-duration">Thời gian (phút)</label><input id="exam-duration" type="number" min="1" max="240" value="${esc(d.duration)}" required></div><div class="field span2"><label for="exam-title">Tên đề kiểm tra</label><input id="exam-title" value="${esc(d.title)}" placeholder="${esc(periodNames[d.exam_type])} · ${esc(subject())} ${d.grade}" required></div><div class="field"><label for="exam-seed">Mã xáo trộn</label><input id="exam-seed" value="${esc(d.seed)}" required></div><div class="field full"><label for="exam-template">Ma trận</label><select id="exam-template">${!required?opt('','Tự thiết lập ma trận',!d.template_id):''}${templates.map(t=>opt(t.id,t.title+(t.unsupported?' · Chưa hỗ trợ đầy đủ':''),t.id===d.template_id)).join('')}${required&&!templates.length?opt('','Chưa có ma trận nguồn phù hợp',true):''}</select></div><div class="field full"><label for="exam-revision">Phiên bản đề cương dùng đối chiếu</label><select id="exam-revision" required>${opt('','Chọn phiên bản đề cương',!d.revision_id)}${store.revisions.filter(r=>Number(r.grade)===Number(d.grade)).map(r=>opt(r.id,`${r.title} · ${countRecord(r)} câu · ${date(r.created_at)}`,r.id===d.revision_id)).join('')}</select></div><details class="sim-details-toggle" style="grid-column:1/-1;margin-top:4px"><summary>⚙️ Tùy chọn nâng cao: Mức tương đồng với Đề cương (${esc(d.similarity_percent??90)}% · ${d.similarity_mode==='exact'?'Bám sát':'Tối thiểu'})</summary><div class="form-grid" style="margin-top:10px"><div class="field"><label for="exam-sim-pct">Mức tương đồng Đề cương (%)</label><div class="sim-slider-wrap"><input id="exam-sim-pct" type="range" min="90" max="100" step="5" value="${esc(d.similarity_percent??90)}"><input id="exam-sim-pct-num" type="number" min="90" max="100" step="1" value="${esc(d.similarity_percent??90)}"><span>%</span></div></div><div class="field"><label for="exam-sim-mode">Chế độ tương đồng</label><select id="exam-sim-mode"><option value="min"${d.similarity_mode==='min'?' selected':''}>Tối thiểu (≥ ${d.similarity_percent??90}%)</option><option value="exact"${d.similarity_mode==='exact'?' selected':''}>Bám sát (${d.similarity_percent??90}% đề cương, ${(100-(d.similarity_percent??90))}% ngoài)</option></select></div></div></details></div><p class="editor-note">Mã xáo trộn giúp tái lập cách chọn. Nội dung câu phải khớp phiên bản đề cương đã chọn; hệ thống không tự bù sang bài hoặc mức độ khác.</p></div>`+
 `<div class="card"><div class="list-toolbar" style="margin-top:0"><h2 style="margin:0">Phân bố câu hỏi ${locked?'<span class="badge">Ma trận nguồn · đã khóa</span>':''}</h2>${!locked?'<button type="button" id="add-matrix-row">+ Thêm dòng</button>':''}</div>${t?`<details class="callout ${t.unsupported?'warning':''}"${t.unsupported?' open':''}><summary><strong>${t.unsupported?'Ma trận chưa đủ điều kiện tạo đề':'Căn cứ và lưu ý của ma trận nguồn'}</strong></summary><p class="source-note">${esc(t.source_notes||'')}</p><p class="small">Nguồn: ${esc((t.source_file||'').split('/').pop())}</p></details>`:''}<div class="table-wrap"><table id="matrix-table"><thead><tr><th>Bài học</th><th>Dạng</th><th>Mức độ</th><th>Số câu</th><th>Điểm / câu</th><th>Có thể chọn¹</th>${!locked?'<th>Thao tác</th>':''}</tr></thead><tbody>${rows.map((r,i)=>matrixRow(r,i,locked)).join('')}</tbody></table></div><div class="score-summary"><span><strong id="matrix-count">${summary.count}</strong> câu</span><span><strong id="matrix-points" class="${summary.points!==10?'invalid':''}">${summary.points}</strong> / 10 điểm</span><span class="small muted">Phải đủ đúng 10 điểm</span></div><p class="count-note">¹ Số câu đúng bài, dạng và mức độ, có trạng thái đã duyệt hoặc đã tự kiểm tra. Kiểm tra lịch PPCT, không trùng và độ phủ đề cương được thực hiện khi tạo đề.</p><div id="generation-warning" class="callout warning" hidden></div><button type="submit" id="generate-exam" class="primary">Tạo và lưu đề kiểm tra</button></div></form>`;
 $('#exam-import-revision').onchange=()=>{store.importRevisionId=$('#exam-import-revision').value;store.inspectedExamImport=null;renderExams();};
 $('#import-exam-btn').onclick=()=>{if(!store.importRevisionId){notify('Chọn phiên bản đề cương để kiểm định tệp nhập.',true);return;}$('#import-exam-file').click();};
 $('#import-exam-file').onchange=async ev=>{
  const file=ev.target.files?.[0];if(!file)return;
  try{
   const b64=await fileToBase64(file);
   const res=await request('/api/exams/inspect-import',{filename:file.name,content_base64:b64,revision_id:store.importRevisionId});
   store.inspectedExamImport=res;
   renderExams();
   $('#exam-import-inspection-box')?.scrollIntoView({behavior:'smooth',block:'start'});
   notify(res.all_passed?`Đã kiểm định "${file.name}": Tất cả ${res.candidate_count} đề đều ĐẠT CHUẨN MA TRẬN. Bấm "Xác nhận Import" để lưu.`:`Đề thi trong "${file.name}" chưa đạt chuẩn ma trận; vui lòng xem chi tiết báo cáo kiểm định.`,!res.all_passed);
  }catch(err){notify(detailError(err),true);}finally{ev.target.value='';}
 };
 if($('#confirm-import-exams'))$('#confirm-import-exams').onclick=async()=>{
  if(!store.inspectedExamImport?.candidates?.length)return;
  await mutate('/api/exams/import-verified',{candidates:store.inspectedExamImport.candidates},res=>{
   if(res.exams)store.exams=res.exams;
   const firstId=res.imported?.[0]?.id;
   store.inspectedExamImport=null;
   if(firstId){store.activeExamViewId=firstId;store.activeExamViewMode='student';}
   renderExams();
   notify(`Đã import thành công ${res.imported_count||1} đề thi đã kiểm định ma trận.`);
  });
 };
 if($('#cancel-import-exams'))$('#cancel-import-exams').onclick=()=>{store.inspectedExamImport=null;renderExams();};
 document.querySelectorAll('[data-exam-grade-filter]').forEach(btn=>{
  btn.onclick=()=>{store.examFilterGrade=btn.dataset.examGradeFilter;renderExams();};
 });
 $('#exam-grade').onchange=()=>{readExamInputs();d.grade=Number($('#exam-grade').value);d.revision_id='';d.title='';chooseExamTemplate();renderExams();};$('#exam-period').onchange=()=>{readExamInputs();d.exam_type=$('#exam-period').value;d.title='';chooseExamTemplate();renderExams();};$('#exam-template').onchange=()=>{readExamInputs();d.template_id=$('#exam-template').value;if(!d.template_id&&!d.blueprint.length)d.blueprint=[{lesson_code:lessons(d.grade)[0]?.lesson_code||'',type:'MC',level:'Biết',count:10,points_per_question:1}];renderExams();};$('#exam-revision').onchange=()=>{d.revision_id=$('#exam-revision').value;updateGenerationState();};
 const simRange=$('#exam-sim-pct');const simNum=$('#exam-sim-pct-num');
 if(simRange&&simNum){
  simRange.oninput=()=>{simNum.value=simRange.value;d.similarity_percent=Number(simRange.value);};
  simNum.oninput=()=>{simRange.value=simNum.value;d.similarity_percent=Number(simNum.value);};
 }
 if($('#exam-sim-mode'))$('#exam-sim-mode').onchange=e=>{d.similarity_mode=e.target.value;};
 ['title','duration','seed'].forEach(k=>$('#exam-'+k).oninput=()=>{readExamInputs();updateGenerationState();});
 if($('#add-matrix-row'))$('#add-matrix-row').onclick=()=>{readExamInputs();d.blueprint.push({lesson_code:lessons(d.grade)[0]?.lesson_code||'',type:'MC',level:'Biết',count:1,points_per_question:.25});renderExams();};
 $('#matrix-table').onchange=event=>{const el=event.target;if(!el.dataset.row||locked)return;const i=Number(el.dataset.row),key=el.dataset.key;d.blueprint[i][key]=['count','points_per_question'].includes(key)?Number(el.value):el.value;if(key==='type'&&el.value==='ES')d.blueprint[i].level='Vận dụng';readExamInputs();renderExams();};
 $('#exam-form').onsubmit=generateExam;updateGenerationState();
 const activeExam=shownExams.find(r=>r.id===store.activeExamViewId)||shownExams[0];
 if(activeExam&&$('#exam-inline-viewer')){
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
async function promptPermuteExam(id){
 const ex=store.exams.find(x=>x.id===id);if(!ex)return;
 const countStr=prompt(`Nhập số lượng mã đề cần trộn từ đề "${ex.title}" (ví dụ: 2 hoặc 4):`, "4");
 if(!countStr)return;
 const count=parseInt(countStr, 10);
 if(isNaN(count)||count<2||count>10){
  notify('Vui lòng nhập số lượng mã đề từ 2 đến 10.', true);
  return;
 }
 const codes = count === 2 ? ['101', '102'] : ['101', '102', '103', '104'].slice(0, count);
 await mutate('/api/exams/permute', {id, num_variants: count, codes, shuffle_questions: true, shuffle_options: true}, res=>{
  if(res.exams)store.exams=res.exams;
  renderExams();
  notify(`Đã tạo thành công ${res.result?.count || count} mã đề hoán vị kèm bảng đáp án đồng bộ!`);
 });
}
function loadExamConfig(id){
 const ex=store.exams.find(x=>x.id===id);if(!ex)return;
 store.examDraft={
  grade:Number(ex.grade),
  exam_type:ex.exam_type||'GK1',
  template_id:ex.template_id||'',
  revision_id:ex.revision_id||'',
  title:`${ex.title||'Đề kiểm tra'} (Mã mới)`,
  duration:Number(ex.duration||45),
  seed:String(Number(ex.seed||2026)+1),
  blueprint:structuredClone(ex.blueprint||[])
 };
 renderExams();
 $('#exam-form')?.scrollIntoView({behavior:'smooth',block:'start'});
 notify('Đã nạp cấu hình đề lên biểu mẫu. Bạn có thể đổi Mã xáo trộn để tạo đề mới.');
}
async function deleteExam(id){
 const ex=store.exams.find(x=>x.id===id);if(!ex||!confirm(`Xóa đề kiểm tra "${ex.title}" (${ex.id})?`))return;
 await mutate('/api/exams/delete',{id},res=>{
  store.exams=res.exams||store.exams.filter(x=>x.id!==id);
  renderExams();notify('Đã xóa đề kiểm tra.');
 });
}
function matrixRow(r,i,locked){const key=`data-row="${i}"`,disabled=locked?' disabled':'';const count=questions().filter(q=>q.grade===Number(store.examDraft.grade)&&q.lesson_code===r.lesson_code&&q.type===r.type&&q.level===r.level&&['approved','content_checked'].includes(q.review_status)).length;return `<tr><td><select aria-label="Bài học dòng ${i+1}" ${key} data-key="lesson_code"${disabled}>${lessons(store.examDraft.grade).map(l=>opt(l.lesson_code,l.lesson_code+' · '+l.lesson_name_source,l.lesson_code===r.lesson_code)).join('')}</select></td><td><select aria-label="Dạng câu dòng ${i+1}" ${key} data-key="type"${disabled}>${['MC','ES'].map(v=>opt(v,v,v===r.type)).join('')}</select></td><td><select aria-label="Mức độ dòng ${i+1}" ${key} data-key="level"${disabled}>${['Biết','Hiểu','Vận dụng'].map(v=>opt(v,v,v===r.level)).join('')}</select></td><td><input aria-label="Số câu dòng ${i+1}" ${key} data-key="count" type="number" min="1" step="1" value="${esc(r.count)}"${disabled}></td><td><input aria-label="Điểm mỗi câu dòng ${i+1}" ${key} data-key="points_per_question" type="number" min="0.01" step="0.01" value="${esc(r.points_per_question)}"${disabled}></td><td><span class="badge${count<r.count?' draft':''}">${count} câu</span></td>${!locked?`<td><button type="button" class="quiet danger" data-remove-row="${i}" aria-label="Bỏ dòng ${i+1}">Bỏ</button></td>`:''}</tr>`;}
function readExamInputs(){const d=store.examDraft;if(!$('#exam-title'))return;d.title=$('#exam-title').value;d.duration=Number($('#exam-duration').value);d.seed=$('#exam-seed').value;d.revision_id=$('#exam-revision').value;if($('#exam-sim-pct-num'))d.similarity_percent=Number($('#exam-sim-pct-num').value);if($('#exam-sim-mode'))d.similarity_mode=$('#exam-sim-mode').value;}
function generationProblems(){const d=store.examDraft,t=selectedTemplate(),rows=examRows(),summary=C.blueprintSummary(rows),p=[];if(C.templateBlocked(t))p.push('Chưa thể tạo đề từ ma trận này: các phần Đúng/Sai hoặc tự luận còn cần xác minh. Xem căn cứ ma trận phía trên. Có thể chọn kiểm tra Thường xuyên để tự thiết lập.');if(needsSource(d.grade,d.exam_type)&&!t)p.push('Kì kiểm tra này cần ma trận nguồn đã xác minh.');if(!d.revision_id)p.push('Chọn một phiên bản đề cương của khối đang tạo đề.');if(!rows.length)p.push('Thêm ít nhất một dòng phân bố câu hỏi.');if(summary.points!==10)p.push(`Tổng hiện tại ${summary.points} điểm; cần đúng 10 điểm.`);if(rows.some(r=>!Number.isInteger(Number(r.count))||Number(r.count)<1||Number(r.points_per_question)<=0))p.push('Số câu phải là số nguyên dương và điểm mỗi câu phải lớn hơn 0.');return p;}
function updateGenerationState(){if(!$('#generate-exam'))return;const p=generationProblems();$('#generate-exam').disabled=store.busy||Boolean(p.length);$('#generation-warning').hidden=!p.length;$('#generation-warning').textContent=p.join('\n');}
async function generateExam(event){event.preventDefault();readExamInputs();const d=store.examDraft,p=generationProblems();if(p.length){notify(p.join('\n'),true);return;}const payload={title:d.title.trim(),grade:Number(d.grade),exam_type:d.exam_type,duration:Number(d.duration),template_id:d.template_id||null,blueprint:examRows(),revision_id:d.revision_id,seed:d.seed,similarity_percent:Number(d.similarity_percent??90),similarity_mode:d.similarity_mode||'min'};if(!payload.title){notify('Nhập tên đề kiểm tra trước khi tạo.',true);return;}await mutate('/api/exams/generate',payload,result=>{store.exams.push(result.exam);renderExams();notify('Đã tạo và lưu đề kiểm tra. Chọn bản học sinh hoặc bản giáo viên bên dưới để xuất.');});}
// Delegate controls that are re-rendered as the filter, list or matrix changes.
document.addEventListener('click',event=>{
 const close=event.target.closest('[data-close]');if(close){$('#'+close.dataset.close).close();return;}
 const viewExam=event.target.closest('[data-view-exam]');if(viewExam){const ex=store.exams.find(r=>r.id===viewExam.dataset.viewExam);if(ex)openExamViewer(ex,viewExam.dataset.mode||'student');return;}
 const editExam=event.target.closest('[data-edit-exam]');if(editExam){openExamMetaEditor(editExam.dataset.editExam);return;}
 const dupExam=event.target.closest('[data-dup-exam]');if(dupExam){duplicateExam(dupExam.dataset.dupExam);return;}
 const permExam=event.target.closest('[data-permute-exam]');if(permExam){promptPermuteExam(permExam.dataset.permuteExam);return;}
 const loadExam=event.target.closest('[data-load-exam]');if(loadExam){loadExamConfig(loadExam.dataset.loadExam);return;}
 const delExam=event.target.closest('[data-del-exam]');if(delExam){deleteExam(delExam.dataset.delExam);return;}
 const viewRev=event.target.closest('[data-view-revision]');if(viewRev){const rev=store.revisions.find(r=>r.id===viewRev.dataset.viewRevision);if(rev)openRevisionViewer(rev,viewRev.dataset.answers==='1');return;}
 const editRev=event.target.closest('[data-edit-revision]');if(editRev){startEditRevision(editRev.dataset.editRevision);return;}
 const dupRev=event.target.closest('[data-dup-revision]');if(dupRev){duplicateRevision(dupRev.dataset.dupRevision);return;}
 const delRev=event.target.closest('[data-del-revision]');if(delRev){deleteRevision(delRev.dataset.delRevision);return;}
 const editPPCT=event.target.closest('[data-edit-ppct]');if(editPPCT){openPPCTEditor(Number(editPPCT.dataset.grade),editPPCT.dataset.editPpct,store.ppctSubject||'Tin học');return;}
 const delPPCT=event.target.closest('[data-del-ppct]');if(delPPCT){deletePPCTLesson(Number(delPPCT.dataset.grade),delPPCT.dataset.delPpct);return;}
 const grade=event.target.closest('[data-open-grade]');if(grade){store.filters.grade=grade.dataset.openGrade;store.filters.lesson='';store.page=1;return;}
 const detail=event.target.closest('[data-detail]');if(detail){showDetail(detail.dataset.detail);return;}
 const edit=event.target.closest('[data-edit]');if(edit){openEditor(edit.dataset.edit,false);return;}
 const dupQ=event.target.closest('[data-dup-q]');if(dupQ){openEditor(dupQ.dataset.dupQ,true);return;}
 const restoreQ=event.target.closest('[data-restore-q]');if(restoreQ){restoreQuestion(restoreQ.dataset.restoreQ);return;}
 const delQ=event.target.closest('[data-del-q]');if(delQ){deleteQuestion(delQ.dataset.delQ);return;}
 const archive=event.target.closest('[data-archive]');if(archive){archiveQuestion(archive.dataset.archive);return;}
 const remove=event.target.closest('[data-remove-row]');if(remove){readExamInputs();store.examDraft.blueprint.splice(Number(remove.dataset.removeRow),1);renderExams();return;}
 const use=event.target.closest('[data-use-revision]');if(use){const r=store.revisions.find(r=>r.id===use.dataset.useRevision);store.examDraft.grade=Number(r.grade);chooseExamTemplate();store.examDraft.revision_id=r.id;location.hash='exams';if(store.tab==='exams')renderExams();}
});
document.addEventListener('change',event=>{if(event.target.matches('[data-check]')){const id=event.target.dataset.check;if(event.target.checked)store.selected.add(id);else store.selected.delete(id);renderBankList();}});
window.addEventListener('hashchange',()=>{clearNotice();switchTab(location.hash.slice(1));});
$('#refresh').onclick=()=>load();
load(true);

function renderMatrices(){window.MatrixUI.mount($("#matrices"),{request,notify,context:store.context,ppct:store.bank.ppct,revisions:store.revisions,onExamCreated:e=>store.exams.push(e)});}

// Keep download URLs tied to this tab's course, including newly rendered links.
function scopeDownloads(){document.querySelectorAll('a[href^="/api/"]').forEach(a=>{const href=apiUrl(a.getAttribute('href'));if(href!==a.getAttribute('href'))a.setAttribute('href',href);});}
new MutationObserver(scopeDownloads).observe(document.body,{childList:true,subtree:true});
scopeDownloads();
const coursePicker=document.getElementById('workspace-curriculum');
if(coursePicker)coursePicker.onchange=()=>{location.href='/app/?curriculum='+encodeURIComponent(coursePicker.value);};

// AI Assistant (Google Gemini) UI Integration
function initAiAssistant() {
  const btn = $('#btn-ai-assistant');
  const dialog = $('#ai-dialog');
  if (!btn || !dialog) return;

  // Mốc A7: khóa Gemini chỉ nằm ở máy chủ (GEMINI_API_KEY); trình duyệt chỉ hỏi trạng thái.
  const keyStatus = $('#gemini-key-status');
  let aiConfigured = false;

  async function refreshAiStatus() {
    try {
      const st = await request('/api/ai/status');
      aiConfigured = Boolean(st.configured);
      if (keyStatus) keyStatus.textContent = aiConfigured
        ? `✓ AI đã được cấu hình. Hôm nay đã dùng ${st.used_today}/${st.daily_limit} lượt.`
        : 'AI chưa được cấu hình trên máy chủ.';
    } catch (e) {
      aiConfigured = false;
      if (keyStatus) keyStatus.textContent = 'Không kiểm tra được trạng thái AI.';
    }
    return aiConfigured;
  }

  async function ensureAiConfigured() {
    if (aiConfigured || await refreshAiStatus()) return true;
    notify('AI chưa được cấu hình. Người quản trị cần đặt biến môi trường GEMINI_API_KEY trên máy chủ.', true);
    return false;
  }

  function syncAiLessons(grade, target='m1') {
    const subj = target === 'm1' ? ($('#ai-m1-subject')?.value || 'Tin học') : ($('#ai-m2-subject')?.value || 'Tin học');
    const list = lessons(Number(grade), subj);
    const sel = $(target === 'm1' ? '#ai-m1-lesson-select' : '#ai-m2-lesson-select');
    if (sel) {
      sel.innerHTML = opt('', `— Chọn bài học ${subj} khối ${grade} —`, true) +
        list.map(l => opt(l.lesson_code, `${l.lesson_code} · ${l.lesson_name_source || l.lesson_name || l.name}`)).join('') +
        (target === 'm1' ? opt('__CUSTOM__', '✏️ Bài học khác (tự nhập)...') : '');
    }
    if (target === 'm1') {
      syncAiOutcomeOptions(list, sel?.value);
    }
  }

  function syncAiOutcomeOptions(lessonList, selectedCode) {
    const outcomeSel = $('#ai-m1-outcome-select');
    const outcomeText = $('#ai-m1-outcome');
    if (!outcomeSel) return;
    const curLesson = (lessonList || []).find(l => l.lesson_code === selectedCode);
    const outcomes = curLesson?.outcomes || [];
    if (outcomes.length > 0) {
      outcomeSel.style.display = 'block';
      outcomeSel.innerHTML = opt('', `— Gợi ý YCCĐ (${outcomes.length} mục) —`, true) +
        outcomes.map(o => opt(o, o)).join('');
      if (outcomeText && (!outcomeText.value || outcomeText.value.trim() === '')) {
        outcomeText.value = outcomes[0];
      }
    } else {
      outcomeSel.style.display = 'none';
      outcomeSel.innerHTML = opt('', '— Gợi ý YCCĐ từ bài học —', true);
    }
  }

  function syncAiExistingQuestions() {
    const sel = $('#ai-m3-select-existing-q');
    if (!sel) return;
    const allQs = questions();
    sel.innerHTML = opt('', '— Chọn một câu hỏi từ ngân hàng —', true) +
      allQs.slice(0, 100).map(q => opt(q.id, `[Khối ${q.grade} - ${q.lesson_code}] ${esc(q.question.slice(0, 65))}...`)).join('');
  }

  btn.onclick = () => {
    refreshAiStatus();
    const curSubj = store.selectedSubject || 'Tin học';
    if ($('#ai-m1-subject')) $('#ai-m1-subject').value = curSubj;
    if ($('#ai-m2-subject')) $('#ai-m2-subject').value = curSubj;
    syncAiLessons($('#ai-m1-grade')?.value || 10, 'm1');
    syncAiLessons($('#ai-m2-grade')?.value || 10, 'm2');
    syncAiExistingQuestions();
    dialog.showModal();
  };

  $('#ai-m1-subject')?.addEventListener('change', () => syncAiLessons($('#ai-m1-grade')?.value || 10, 'm1'));
  $('#ai-m1-grade')?.addEventListener('change', () => syncAiLessons($('#ai-m1-grade')?.value || 10, 'm1'));
  $('#ai-m1-lesson-select')?.addEventListener('change', (e) => {
    const subj = $('#ai-m1-subject')?.value || 'Tin học';
    const grd = Number($('#ai-m1-grade')?.value || 10);
    const list = lessons(grd, subj);
    syncAiOutcomeOptions(list, e.target.value);
  });
  $('#ai-m1-outcome-select')?.addEventListener('change', (e) => {
    if (e.target.value && $('#ai-m1-outcome')) {
      $('#ai-m1-outcome').value = e.target.value;
    }
  });

  $('#ai-m2-subject')?.addEventListener('change', () => syncAiLessons($('#ai-m2-grade')?.value || 10, 'm2'));
  $('#ai-m2-grade')?.addEventListener('change', () => syncAiLessons($('#ai-m2-grade')?.value || 10, 'm2'));

  $('#ai-m3-select-existing-q')?.addEventListener('change', (e) => {
    const qId = e.target.value;
    if (!qId) return;
    const qObj = questions().find(q => q.id === qId);
    if (qObj) {
      $('#ai-m3-question-json').value = JSON.stringify(qObj, null, 2);
    }
  });


  // Switch tabs in AI modal
  dialog.querySelectorAll('[data-ai-tab]').forEach(tabBtn => {
    tabBtn.onclick = () => {
      dialog.querySelectorAll('[data-ai-tab]').forEach(b => {
        b.classList.remove('active');
        b.style.background = '#f5f5f5';
        b.style.color = '#333';
      });
      tabBtn.classList.add('active');
      tabBtn.style.background = 'var(--brand, #0a58ca)';
      tabBtn.style.color = '#fff';

      const tabId = tabBtn.dataset.aiTab;
      dialog.querySelectorAll('.ai-pane').forEach(p => p.hidden = true);
      const pane = $(`#ai-pane-${tabId}`);
      if (pane) pane.hidden = false;
      if (tabId === 'mode3') syncAiExistingQuestions();
    };
  });

  function buildQuestionCardHtml(q, idx, prefix) {
    const cid = `${prefix}-${idx}`;
    const isMc = (q.type || 'MC') === 'MC';
    const isYn = q.type === 'YN';
    const opts = q.options || ['', '', '', ''];
    const corr = q.correct;

    return `
      <div class="card" id="card-${cid}" style="margin-bottom:14px;padding:14px;background:#fcfdff;border:1px solid #d0dbe5;border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <label style="font-weight:bold;color:var(--navy,#102d4a);font-size:15px">
            <input type="checkbox" class="${prefix}-select-chk" data-idx="${idx}" checked style="margin-right:6px">
            Câu ${idx + 1} (${esc(q.type || 'MC')} - <span id="${cid}-lvl-badge">${esc(q.level || 'Biết')}</span>)
          </label>
          <button type="button" class="quiet" data-toggle-edit="${cid}" style="font-size:12px;cursor:pointer;color:var(--brand,#0a58ca)">✏️ Chỉnh sửa / Xem lại</button>
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
          ${q.option_explanations && q.option_explanations.length ? `
            <p style="margin-top:8px;font-size:13px;color:#555;border-top:1px dashed #e0e8f0;padding-top:6px">
              <em>Lời giải: ${esc(q.option_explanations[corr] || q.option_explanations.join('; '))}</em>
            </p>
          ` : ''}
        </div>

        <!-- Edit block (hidden by default) -->
        <div id="${cid}-editor" hidden style="margin-top:10px;padding-top:10px;border-top:1px dashed #c0d0e0;background:#f5f8fb;padding:10px;border-radius:6px">
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
          ${q.type === 'SHORT' ? `
            <label for="${cid}-edit-short" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Đáp án trả lời ngắn:</label>
            <input type="text" id="${cid}-edit-short" value="${esc(C.shortAnswerOf(q))}" style="width:100%;padding:5px;box-sizing:border-box;margin-bottom:8px">
          ` : ''}

          <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:8px">
            <div>
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:2px">Mức độ:</label>
              <select id="${cid}-edit-lvl" style="width:100%;padding:4px">
                <option value="Biết" ${q.level === 'Biết' ? 'selected' : ''}>Nhận biết</option>
                <option value="Hiểu" ${q.level === 'Hiểu' ? 'selected' : ''}>Thông hiểu</option>
                <option value="Vận dụng" ${q.level === 'Vận dụng' ? 'selected' : ''}>Vận dụng</option>
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
          <button type="button" class="primary quiet" data-save-q="${cid}" style="font-size:13px">➕ Thêm vào Ngân hàng (Chờ duyệt)</button>
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

    const result = {
      type: qType,
      level: lvl,
      learning_outcome: yccd,
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
      result.statements = origQ.statements || [];
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
          btn.textContent = editor.hidden ? '✏️ Chỉnh sửa / Xem lại' : '▲ Thu gọn chỉnh sửa';
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
            btn.textContent = '✅ Đã thêm vào Ngân hàng (Chờ duyệt)';
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

  // Mode 1: Generate by Learning Outcome
  const m1Btn = $('#ai-m1-submit-btn');
  if (m1Btn) {
    m1Btn.onclick = async () => {
      if (!(await ensureAiConfigured())) return;
      const selectedLessonCode = $('#ai-m1-lesson-select')?.value;
      if (!selectedLessonCode) {
        notify('Vui lòng chọn bài học từ danh mục PPCT trước khi sinh câu hỏi.', true);
        return;
      }
      const outcome = ($('#ai-m1-outcome').value || '').trim();
      if (!outcome) {
        notify('Vui lòng nhập Yêu cầu cần đạt (YCCĐ).', true);
        return;
      }
      const grade = Number($('#ai-m1-grade').value);
      const subject = $('#ai-m1-subject').value;
      const lessonObj = lessons(grade, subject).find(l => l.lesson_code === selectedLessonCode);
      const lessonName = lessonObj ? (lessonObj.lesson_name_source || lessonObj.lesson_name || lessonObj.name) : 'Bài học';

      const payload = {
        grade: grade,
        subject: subject,
        level: $('#ai-m1-level').value,
        question_type: $('#ai-m1-type').value,
        count: Number($('#ai-m1-count').value || 3),
        lesson_name: lessonName,
        learning_outcome: outcome
      };

      const resBox = $('#ai-m1-results');
      resBox.innerHTML = '<p class="empty">⏳ Đang kết nối Gemini và sinh câu hỏi...</p>';

      try {
        const res = await request('/api/ai/generate-by-outcome', payload);
        const qs = res.questions || [];
        if (!qs.length) {
          resBox.innerHTML = '<p class="empty">Không sinh được câu hỏi nào.</p>';
          return;
        }

        resBox.innerHTML = `<p style="margin-bottom:10px"><strong>Sinh thành công ${qs.length} câu hỏi theo YCCĐ. Vui lòng xem lại và chỉnh sửa trước khi lưu:</strong></p>` +
          qs.map((q, idx) => buildQuestionCardHtml(q, idx, 'm1')).join('');

        bindCardEvents(resBox, qs, 'm1', grade, selectedLessonCode, subject);
      } catch (err) {
        resBox.innerHTML = `<p class="danger" style="color:red">Lỗi: ${esc(err.message || 'Không thể tạo câu hỏi')}</p>`;
      }
    };
  }

  // Mode 2: Parse Raw Text
  const m2Btn = $('#ai-m2-submit-btn');
  if (m2Btn) {
    m2Btn.onclick = async () => {
      if (!(await ensureAiConfigured())) return;
      const raw = ($('#ai-m2-raw-text').value || '').trim();
      if (!raw) {
        notify('Vui lòng dán đề thô vào khung.', true);
        return;
      }
      const grade = Number($('#ai-m2-grade').value);
      const subject = $('#ai-m2-subject')?.value || 'Tin học';
      const targetLesson = $('#ai-m2-lesson-select')?.value;
      if (!targetLesson) {
        notify('Vui lòng chọn bài học đích để gán câu hỏi bóc tách.', true);
        return;
      }

      const resBox = $('#ai-m2-results');
      resBox.innerHTML = '<p class="empty">⏳ Đang phân tích và bóc tách đề thô...</p>';

      try {
        const res = await request('/api/ai/parse-raw', { raw_text: raw, grade: grade });
        const qs = res.questions || [];
        if (!qs.length) {
          resBox.innerHTML = '<p class="empty">Không bóc tách được câu hỏi nào từ nội dung thô.</p>';
          return;
        }

        resBox.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px;background:#eef4fa;border-radius:6px">
            <span><strong>Bóc tách thành công ${qs.length} câu hỏi.</strong></span>
            <div style="display:flex;gap:8px">
              <button type="button" class="quiet" id="m2-select-all" style="font-size:12px">🔘 Chọn tất cả</button>
              <button type="button" class="quiet" id="m2-deselect-all" style="font-size:12px">⚪ Bỏ chọn tất cả</button>
              <button type="button" class="primary" id="m2-bulk-save" style="font-size:12px;padding:6px 12px">💾 Lưu các câu đã chọn (Chờ duyệt)</button>
            </div>
          </div>
          ${qs.map((q, idx) => buildQuestionCardHtml(q, idx, 'm2')).join('')}
        `;

        bindCardEvents(resBox, qs, 'm2', grade, targetLesson, subject);

        const selectAllBtn = $('#m2-select-all');
        const deselectAllBtn = $('#m2-deselect-all');
        const bulkSaveBtn = $('#m2-bulk-save');

        if (selectAllBtn) {
          selectAllBtn.onclick = () => {
            resBox.querySelectorAll('.m2-select-chk').forEach(c => c.checked = true);
          };
        }
        if (deselectAllBtn) {
          deselectAllBtn.onclick = () => {
            resBox.querySelectorAll('.m2-select-chk').forEach(c => c.checked = false);
          };
        }
        if (bulkSaveBtn) {
          bulkSaveBtn.onclick = async () => {
            const selectedChks = Array.from(resBox.querySelectorAll('.m2-select-chk:checked'));
            if (!selectedChks.length) {
              notify('Chưa chọn câu hỏi nào để lưu.', true);
              return;
            }
            const batch = [];
            for (const chk of selectedChks) {
              const idx = Number(chk.dataset.idx);
              try {
                const qData = getQuestionFromCard(`m2-${idx}`, qs[idx]);
                batch.push({ idx, q: { id: '', grade: grade, subject_name: subject, lesson_code: targetLesson,
                  review_status: 'draft', ...qData } });
              } catch (e) {
                notify(`Lỗi ở Câu ${idx + 1}: ${e.message}`, true);
                return;
              }
            }
            bulkSaveBtn.disabled = true;
            bulkSaveBtn.textContent = '⏳ Đang lưu...';
            // Một yêu cầu cho cả lô: hoặc lưu hết, hoặc không lưu câu nào.
            const result = await mutate('/api/ai/save-drafts', { questions: batch.map(b => b.q) });
            if (!result) {
              bulkSaveBtn.disabled = false;
              bulkSaveBtn.textContent = '💾 Lưu các câu đã chọn (Chờ duyệt)';
              return;
            }
            batch.forEach(({ idx }) => {
              const saveBtn = resBox.querySelector(`[data-save-q="m2-${idx}"]`);
              if (saveBtn) {
                saveBtn.textContent = '✅ Đã thêm (Chờ duyệt)';
                saveBtn.disabled = true;
              }
            });
            bulkSaveBtn.textContent = `✅ Đã lưu ${result.saved.length}/${selectedChks.length} câu (Chờ duyệt)`;
            notify(`Đã lưu ${result.saved.length} câu hỏi nháp vào bài [${targetLesson}]; cần duyệt trước khi dùng trong đề.`);
          };
        }
      } catch (err) {
        resBox.innerHTML = `<p class="danger" style="color:red">Lỗi: ${esc(err.message)}</p>`;
      }
    };
  }

  // Mode 3: Generate Variants
  const m3Btn = $('#ai-m3-submit-btn');
  if (m3Btn) {
    m3Btn.onclick = async () => {
      if (!(await ensureAiConfigured())) return;
      const qText = ($('#ai-m3-question-json').value || '').trim();
      if (!qText) {
        notify('Vui lòng chọn hoặc nhập câu hỏi gốc.', true);
        return;
      }
      let origObj = null;
      try { origObj = JSON.parse(qText); } catch(e) {}
      if (!origObj || !origObj.question) {
        notify('Định dạng câu hỏi gốc chưa hợp lệ. Vui lòng chọn câu hỏi từ danh sách.', true);
        return;
      }

      const resBox = $('#ai-m3-results');
      resBox.innerHTML = '<p class="empty">⏳ Đang sinh các biến thể tương đương...</p>';
      try {
        const res = await request('/api/ai/generate-variants', { question: origObj, count: 2 });
        const vars = res.variants || [];
        if (!vars.length) {
          resBox.innerHTML = '<p class="empty">Không sinh được biến thể nào.</p>';
          return;
        }

        resBox.innerHTML = `<p style="margin-bottom:10px"><strong>Sinh thành công ${vars.length} biến thể tương đương từ câu hỏi gốc:</strong></p>` +
          vars.map((v, idx) => buildQuestionCardHtml(v, idx, 'm3')).join('');

        bindCardEvents(resBox, vars, 'm3', origObj.grade || 10, origObj.lesson_code || 'L1', origObj.subject_name || 'Tin học');
      } catch (err) {
        resBox.innerHTML = `<p class="danger" style="color:red">Lỗi: ${esc(err.message)}</p>`;
      }
    };
  }
}
initAiAssistant();

// User Guide & Data Specifications Dialog Integration
function initUserGuide() {
  const guideBtn = $('#btn-user-guide');
  const dialog = $('#help-dialog');
  if (!guideBtn || !dialog) return;

  guideBtn.onclick = () => {
    dialog.showModal();
  };

  // Switch tabs in Help modal
  dialog.querySelectorAll('[data-help-tab]').forEach(tabBtn => {
    tabBtn.onclick = () => {
      dialog.querySelectorAll('[data-help-tab]').forEach(b => {
        b.classList.remove('active');
        b.style.background = '#f5f5f5';
        b.style.color = '#333';
      });
      tabBtn.classList.add('active');
      tabBtn.style.background = 'var(--navy, #102d4a)';
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
        copyBtn.style.background = 'var(--green, #1d7058)';
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

// Test Mode (Clean Slate Sandbox) Integration
function initTestMode() {
  const toggleBtn = $('#btn-toggle-test-mode');
  const banner = $('#test-mode-banner');
  const exitBtn = $('#btn-exit-test-mode');
  const resetBtn = $('#btn-reset-test-data');

  function updateUi() {
    if (store.isTestMode) {
      if (banner) banner.hidden = false;
      if (toggleBtn) {
        toggleBtn.textContent = '🧪 Đang ở Chế độ Test';
        toggleBtn.style.background = '#ffeeba';
        toggleBtn.style.color = '#856404';
        toggleBtn.style.borderColor = '#c58919';
      }
    } else {
      if (banner) banner.hidden = true;
      if (toggleBtn) {
        toggleBtn.textContent = '🧪 Chế độ Test';
        toggleBtn.style.background = '#fffdf5';
        toggleBtn.style.color = '#9a6700';
        toggleBtn.style.borderColor = '#e0c885';
      }
    }
  }

  async function setTestMode(active) {
    store.isTestMode = Boolean(active);
    sessionStorage.setItem('exammatrix_test_mode', store.isTestMode ? '1' : '0');
    updateUi();
    await load(true);
    if (store.isTestMode) {
      notify('Đã chuyển sang Chế độ Test: Dữ liệu hoàn toàn trống, không ảnh hưởng ngân hàng thật.');
    } else {
      notify('Đã quay về Môi trường Dữ liệu Thật (Chính thức).');
    }
  }

  if (toggleBtn) {
    toggleBtn.onclick = () => setTestMode(!store.isTestMode);
  }
  if (exitBtn) {
    exitBtn.onclick = () => setTestMode(false);
  }
  if (resetBtn) {
    resetBtn.onclick = async () => {
      if (!confirm('Bạn có chắc chắn muốn làm sạch toàn bộ dữ liệu trong Chế độ Test về trạng thái trống hoàn toàn?')) return;
      try {
        const res = await request('/api/test/reset', {});
        if (res && res.state) {
          store.bank = res.state.bank;
          store.exams = res.state.exams || [];
          store.revisions = res.state.revisions || [];
          store.selected.clear();
          render();
          notify('Đã làm sạch toàn bộ dữ liệu thử nghiệm về 0 câu hỏi.');
        }
      } catch (err) {
        notify('Lỗi khi làm sạch dữ liệu test: ' + err.message, true);
      }
    };
  }

  updateUi();
}
initTestMode();

function setGlobalSubject(subj) {
  if (!subj) return;
  store.selectedSubject = subj;
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
