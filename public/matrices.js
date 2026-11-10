(function(root){
  'use strict';
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const E=escapeHtml;
  const profileLabel=p=>p==='GENERAL'?'Mẫu chung':p;
  const competencyLabel=c=>({TDLL:'TDLL · Tư duy và lập luận toán học',MHH:'MHH · Mô hình hóa toán học','GQVĐ':'GQVĐ · Giải quyết vấn đề toán học',GT:'GT · Giao tiếp toán học',SDCC:'SDCC · Sử dụng công cụ học toán'}[c]||c);
  function formatRefs(parts,format){const a=parts.map(p=>(format==='specification'?'Câu ':'')+p.number+(p.label||''));return '('+a.join(', ')+')'+(format==='specification'?'.':'');}
  function filterRecords(records,f={}){return records.filter(m=>(!f.grade||Number(m.grade)===Number(f.grade))&&(!f.status||m.status===f.status)&&(!f.year||m.school_year===f.year)&&(!f.period||m.exam_type===f.period));}
  function visibleActions(m){return m.status==='locked'?['preview','export','new-version','archive','use']:m.status==='archived'?['preview','export','new-version']:['save','review','preview','export','lock','archive'];}
  function packageSummary(p){const m=p.matrix||{};return `Khối ${m.grade} · ${m.profile} · phiên bản ${m.version}`;}
  const states={draft:'Bản nháp',review:'Chờ đối chiếu',locked:'Đã thống nhất · khóa',archived:'Đã lưu trữ'};
  const kinds={MC:'Trắc nghiệm 4 lựa chọn',YN:'Đúng/Sai',SHORT:'Trả lời ngắn',ES:'Tự luận / thực hành'};
  // B3: mẫu hồ sơ. THCS (trường): MC, tự luận; THPT (CV 7991) và mẫu chung: mọi dạng; KTTX/tùy chỉnh: allowed_kinds.
  const ALL_KINDS=['MC','YN','SHORT','ES'],PROFILE_KINDS={THCS:['MC','ES'],THPT:ALL_KINDS,GENERAL:ALL_KINDS};
  const DEFAULT_YN={0:'0',1:'0.1',2:'0.25',3:'0.5',4:'1'};
  function effectiveKinds(m){const chosen=m&&m.allowed_kinds;return Array.isArray(chosen)?ALL_KINDS.filter(k=>chosen.includes(k)):(PROFILE_KINDS[m&&m.profile]||ALL_KINDS).slice();}
  function setAllowedKinds(m,list){const next=ALL_KINDS.filter(k=>list.includes(k)),base=PROFILE_KINDS[m.profile]||ALL_KINDS;if(next.join()===base.join())delete m.allowed_kinds;else m.allowed_kinds=next;}
  function ynTable(m){const t=m&&m.scoring_policy&&m.scoring_policy.yn_table;return Object.fromEntries([0,1,2,3,4].map(n=>[n,String(t&&t[n]!==undefined?t[n]:DEFAULT_YN[n])]));}
  function setYnCoefficient(m,n,value){const t=ynTable(m);t[n]=String(value).trim().replace(',','.');
    if([0,1,2,3,4].every(k=>Number(t[k])===Number(DEFAULT_YN[k])))delete m.scoring_policy;
    else m.scoring_policy={yn_table:t,blank_counts_as:'wrong'};}  // cách làm tròn theo loại bài, không lưu ở ma trận
  function profileOptionsHtml(m,locked){
    const eff=effectiveKinds(m),dis=locked?' disabled':'',t=ynTable(m);
    const tolerance=m.profile==='THPT'?`<div class="form-grid"><div class="field"><label for="mx-ratio_tolerance">Ngưỡng cảnh báo tỉ lệ CV 7991 (± điểm, để trống = 0,5)</label><input id="mx-ratio_tolerance" data-field="ratio_tolerance" type="number" min="0" max="10" step="0.05" value="${E(m.ratio_tolerance??'')}"${dis}></div></div><p class="small muted">Ngưỡng nội bộ của tổ, chỉ để cảnh báo; CV 7991 ghi các tỉ lệ là "khoảng" và Phụ lục chỉ để tham khảo. Vận dụng + Vận dụng cao được quy đổi kỹ thuật khi so với tham khảo ba mức; các mức trong hồ sơ vẫn giữ riêng.</p>`:'';
    return tolerance+`<h3 id="mx-profile-kinds">Dạng câu được phép và cách chấm Đúng/Sai</h3><p class="muted">Mặc định theo mẫu: THCS gồm trắc nghiệm và tự luận; THPT theo CV 7991 gồm cả Đúng/Sai và trả lời ngắn. Với KTTX có thể chọn dạng khác; lựa chọn được lưu cùng ma trận và đề.</p>
    <div class="actions">${ALL_KINDS.map(k=>`<label class="inline-check"><input type="checkbox" data-allow-kind="${k}"${eff.includes(k)?' checked':''}${dis}> ${E(kinds[k])}</label>`).join('')}</div>
    ${eff.includes('YN')?`<div class="form-grid mx-yn-table">${[1,2,3,4].map(n=>`<div class="field"><label for="mx-yn-${n}">Đúng ${n} ý: hệ số</label><input id="mx-yn-${n}" data-yn-coef="${n}" inputmode="decimal" value="${E(String(t[n]).replace('.',','))}"${dis}></div>`).join('')}</div><p class="small muted">Điểm câu = điểm tối đa × hệ số. Ý bỏ trống, chọn cả hai hoặc lỗi tính là sai. Tổng bài: định kì làm tròn đến 0,1; thường xuyên làm tròn đến số nguyên (TT 22/2021, Điều 5; quy ước tổ).</p>`:''}`;
  }
  const periods={TX:'Thường xuyên',GK1:'Giữa học kì I',CK1:'Cuối học kì I',GK2:'Giữa học kì II',CK2:'Cuối học kì II'};
  const levels=['Biết','Hiểu','Vận dụng','Vận dụng cao'];
  function requirementLevelOptions(value){return levels.map(l=>opt(l,l,l===value)).join('');}
  const ui={container:null,ctx:null,records:[],editing:null,dirty:false,report:null,busy:false,filter:{},importing:null,generation:null,comparison:null,previewState:null};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const opt=(v,text,selected)=>`<option value="${E(v)}"${selected?' selected':''}>${E(text)}</option>`;
  const uid=p=>p+'-'+Math.random().toString(36).slice(2,11);
  const qs=s=>ui.container.querySelector(s);
  const lessons=grade=>(ui.ctx.ppct.lessons||[]).filter(l=>l.grade===Number(grade));
  function message(text,error=false){ui.ctx.notify(text,error);}
  function detail(e){const errors=e.details?.errors||e.details?.validation?.errors;return e.message+(errors?'\n'+errors.map(x=>x.message).join('\n'):'');}
  async function run(work){if(ui.busy)return;ui.busy=true;ui.container.querySelectorAll('button').forEach(b=>b.disabled=true);try{await work();}catch(e){message(detail(e),true);if(e.details?.errors){ui.report=e.details;renderReport();}}finally{ui.busy=false;ui.container.querySelectorAll('button').forEach(b=>b.disabled=false);restoreButtons();}}
  function restoreButtons(){if(!ui.editing)return;const actions=visibleActions(ui.editing);ui.container.querySelectorAll('[data-action]').forEach(b=>{const a=b.dataset.action;if(['save','review','preview','lock','export'].includes(a))b.disabled=!actions.includes(a)||((a!=='save')&&(!ui.editing.id||ui.dirty))||(a==='lock'&&!ui.report?.valid);if(a==='compare')b.disabled=!ui.editing.id||ui.dirty;});ui.container.querySelectorAll('button:not([data-action])').forEach(b=>b.disabled=false);}
  async function refresh(){const d=await ui.ctx.request('/api/matrices');ui.records=d.matrices||[];}
  async function mount(container,context){ui.container=container;ui.ctx=context;await run(async()=>{await refresh();render();});}
  function recordBadges(m){
    const issues=m.reconciliation?.issues||[];
    const notes=m.source?.comparison_notes||[];
    const parts=(m.slots||[]).flatMap(s=>s.parts||[]);
    const essayIssue=issues.find(i=>i.code==='source_essay_disagreement');
    return `<span class="badge ${E(m.status)}">${E(states[m.status])}</span>`+
      (essayIssue?`<span class="badge mx-warn-badge">Cần xác minh: 9/12 ý tự luận</span>`:issues.length?`<span class="badge mx-warn-badge">${issues.length} điểm cần xác minh</span>`:`<span class="badge approved">Khớp số lượng ma trận & đặc tả</span>`)+
      (notes.length?`<span class="badge content_checked">${notes.length} ghi chú đối chiếu</span>`:'')+
      `<small>Phiên bản ${m.version} · ${m.slots?.length||0} câu (${parts.length} ý) · ${m.total_points??10} điểm</small>`;
  }
  const grades=()=>root.BankCore.contextGrades(ui.ctx.context||{});
  const generic=()=>ui.ctx.context?.school_profile===false;
  const subject=m=>m?.subject_name||ui.ctx.context?.subject_name||'Tin học';
  const competencies=()=>ui.ctx.context?.competencies||['NLa','NLb','NLc','NLd','NLe'];
  const apiUrl=path=>root.BankCore.scopedUrl(path,ui.ctx.context?.curriculum_id||'');
  function render(){
    const f=ui.filter;
    ui.container.innerHTML=`<div class="page-head"><div><p class="eyebrow">MA TRẬN THEO CHƯƠNG TRÌNH</p><h1>Ma trận & đặc tả</h1><p>Lập phân bố câu hỏi và yêu cầu cần đạt theo môn, khối lớp của bạn. Đầy đủ thao tác Tạo mới, Xem, Sửa, Nhân bản, Mở khóa và Xóa.</p></div><div class="actions">${grades().map(g=>`<button class="primary" data-action="new" data-grade="${g}">+ Tạo ma trận khối ${g}</button>`).join('')}<button data-action="import">Nhập ma trận</button></div></div>
    <div class="matrix-flow"><span>1. Biên soạn / nhận nguồn</span><span>2. Đối chiếu & thống nhất</span><span>3. Khóa phiên bản</span><span>4. Tạo đề riêng · xuất Word</span></div>
    <div class="card"><div class="filters"><div class="field"><label for="mx-filter-grade">Khối</label><select id="mx-filter-grade" data-filter="grade">${opt('','Tất cả khối',!f.grade)}${grades().map(g=>opt(g,'Khối '+g,String(f.grade)===String(g))).join('')}</select></div><div class="field"><label for="mx-filter-period">Kỳ</label><select id="mx-filter-period" data-filter="period">${opt('','Tất cả kỳ',!f.period)}${Object.entries(periods).map(([k,v])=>opt(k,v,f.period===k)).join('')}</select></div><div class="field"><label for="mx-filter-status">Trạng thái</label><select id="mx-filter-status" data-filter="status">${opt('','Tất cả trạng thái',!f.status)}${Object.entries(states).map(([k,v])=>opt(k,v,f.status===k)).join('')}</select></div><div class="field"><label for="mx-filter-year">Năm học</label><input id="mx-filter-year" data-filter="year" value="${E(f.year||'')}" placeholder="2026-2027"></div></div>
    <div class="mx-records">${filterRecords(ui.records,f).length?filterRecords(ui.records,f).slice().reverse().map(m=>{const issues=m.reconciliation?.issues||[];return `<article class="mx-record-card${ui.editing?.id===m.id?' active':''}"><div class="mx-record-main"><button class="mx-record" data-open="${E(m.id)}"><span><strong>${E(m.title)}</strong><small>Khối ${m.grade} · ${E(profileLabel(m.profile))} · ${E(m.school_year)} · ${E(m.campus||'Chưa ghi cơ sở')} · ${m.mode==='received'?'Bản nhận từ tệp Word gốc':'Phụ trách biên soạn'}${m.source?.name?` (${E(m.source.name)})`:''}</small>${issues.length?`<span class="mx-inline-issues">${issues.map(x=>E(x.message)).join(' • ')}</span>`:''}</span><span class="mx-record-meta">${recordBadges(m)}</span></button></div><div class="mx-record-actions"><button type="button" data-open="${E(m.id)}">Mở & biên tập</button><button type="button" class="primary" data-action="preview-id" data-id="${E(m.id)}">Xem toàn bộ</button><button type="button" data-action="compare-id" data-id="${E(m.id)}">Đối chiếu bản gốc (2 cột)</button><button type="button" data-action="duplicate-id" data-id="${E(m.id)}">Nhân bản</button><button type="button" class="danger" data-action="delete-id" data-id="${E(m.id)}">Xóa</button></div></article>`;}).join(''):'<div class="empty"><h3>Chưa có hồ sơ ma trận</h3><p>Tạo ma trận cho chương trình đang mở hoặc nhập gói dữ liệu phù hợp.</p></div>'}</div></div>
    <div id="mx-preview" class="card mx-preview" hidden></div><div id="mx-work"></div>`;
    ui.container.onclick=click;ui.container.onchange=change;ui.container.oninput=input;
    if(ui.editing)renderEditor();else if(ui.generation)renderGeneration();else if(ui.importing)renderImport();
    if(ui.comparison)renderComparisonBox();else if(ui.previewState)renderPreviewBox();
  }
  function field(label,path,value,type='text',disabled=false){const id='mx-'+path.replaceAll('.','-');return `<div class="field"><label for="${id}">${E(label)}</label><input id="${id}" data-field="${E(path)}" type="${type}" value="${E(value??'')}"${disabled?' disabled':''}></div>`;}
  function select(label,path,options,disabled=false){const id='mx-'+path.replaceAll('.','-');return `<div class="field"><label for="${id}">${E(label)}</label><select id="${id}" data-field="${E(path)}"${disabled?' disabled':''}>${options}</select></div>`;}
  function newDraft(grade){const g=Number(grade)||grades()[0];return {id:'',family_id:'',version:1,revision:0,status:'draft',mode:'authored',profile:generic()?'GENERAL':g===10?'THPT':'THCS',grade:g,school_year:ui.ctx.context?.school_year||'2026-2027',subject_name:subject(),exam_type:'GK1',duration:45,title:`Ma trận Giữa HK1 ${subject()} ${g}`,owner_name:'',campus:generic()?'':'Cao Thắng',total_points:10,lessons:[],requirements:[],slots:[],indicator_catalog:[],source:null,reconciliation:{confirmed:true,issues:[]},audit:[],allow_custom_override:true};}
  function renderEditor(){
    const m=ui.editing,custom=Boolean(m.allow_custom_override),locked=!custom&&['locked','archived'].includes(m.status),received=!custom&&m.mode==='received',protectedFields=locked||received;
    qs('#mx-work').innerHTML=`<section class="card mx-editor"><div class="mx-editor-head"><div><p class="eyebrow">${custom?'CHẾ ĐỘ SỬA TOÀN DIỆN (TÙY CHỈNH)':received?'NHẬN NGUỒN · BẢO TOÀN CHỈ TIÊU':'PHỤ TRÁCH BIÊN SOẠN'}</p><h2>${E(m.title)} <span class="badge">V${m.version}</span></h2><p>${E(states[m.status])}${custom?' · Đang mở khóa tùy chỉnh toàn diện':''}<span id="mx-dirty">${ui.dirty?' · Có thay đổi chưa lưu':''}</span></p></div><div class="actions"><button data-action="preview">Xem toàn bộ bảng</button>${m.mode==='received'||m.source?`<button data-action="compare">Đối chiếu bản gốc (2 cột)</button>`:''}${(locked||received)?`<button type="button" data-action="unlock-custom">🔓 Bật sửa toàn diện</button>`:''}${m.id?`<button type="button" data-action="duplicate-id" data-id="${E(m.id)}">Nhân bản</button><button type="button" class="danger" data-action="delete-id" data-id="${E(m.id)}">Xóa hồ sơ</button>`:''}<button data-action="save" class="primary">Lưu bản nháp</button><button data-action="discard">${ui.dirty?'Bỏ thay đổi / tải bản đã lưu':'Đóng hồ sơ'}</button></div></div>
    <div class="mx-section-nav"><button type="button" data-scroll="mx-information">Thông tin</button><button type="button" data-scroll="mx-lessons">Bài & YCCĐ</button><button type="button" data-scroll="mx-slots">Phân bố câu / ý</button><button type="button" data-scroll="mx-validation">Đối chiếu</button><button type="button" data-scroll="mx-output">Word & phiên bản</button></div>
    ${received?'<div class="callout">Đang ở chế độ bảo toàn chỉ tiêu nguồn (chỉ bổ sung ánh xạ PPCT và số câu). Nếu bạn muốn thêm/sửa/xóa bài học, YCCĐ hoặc phân bố câu hỏi trực tiếp, hãy bấm nút <strong>"🔓 Bật sửa toàn diện"</strong> ở góc phải phía trên.</div>':''}
    <h3 id="mx-information">1. Thông tin hồ sơ</h3><div class="form-grid">${field('Tên hồ sơ','title',m.title,'text',locked)}${select('Khối lớp','grade',grades().map(g=>opt(g,'Khối '+g,Number(m.grade)===g)).join(),protectedFields)}${field('Người phụ trách biên soạn','owner_name',m.owner_name,'text',locked)}${field('Cơ sở của người phụ trách','campus',m.campus,'text',locked)}${field('Năm học','school_year',m.school_year,'text',protectedFields)}${select('Kỳ kiểm tra','exam_type',Object.entries(periods).map(([k,v])=>opt(k,v,k===m.exam_type)).join(''),protectedFields)}${field('Thời gian (phút)','duration',m.duration,'number',protectedFields)}${select('Kiểu mẫu','profile',(generic()?['GENERAL']:['THCS','THPT']).map(k=>opt(k,profileLabel(k),k===m.profile)).join(''),protectedFields)}</div>
    ${profileOptionsHtml(m,locked)}
    <h3 id="mx-lessons">2. Bài học & yêu cầu cần đạt</h3><p class="muted">Khối ${m.grade}. Nội dung cụ thể liên kết với yêu cầu cần đạt nguồn của PPCT. Các chỉ báo có thể được chọn thay thế theo quy định của mẫu.</p>
    ${!protectedFields?`<div class="actions"><label for="mx-add-lesson">Bài cần thêm</label><select id="mx-add-lesson">${lessons(m.grade).filter(l=>!m.lessons.some(x=>x.lesson_code===l.lesson_code)).map(l=>opt(l.lesson_code,l.lesson_name_source,false)).join('')}</select><button data-action="add-lesson">+ Thêm bài</button></div>`:''}
    ${m.lessons.map((lesson,i)=>`<article class="mx-lesson"><div class="dialog-heading" style="margin-bottom:8px"><h4>${E(lesson.title)}</h4>${!protectedFields?`<button type="button" class="quiet danger" data-action="remove-lesson" data-index="${i}">Xóa bài này</button>`:''}</div>${select('Đối chiếu bài PPCT '+(i+1),`lessons.${i}.lesson_code`,opt('','Chọn bài đối chiếu',!lesson.lesson_code)+lessons(m.grade).map(l=>opt(l.lesson_code,l.lesson_name_source,l.lesson_code===lesson.lesson_code)).join(''),locked)}${!received?`<div class="form-grid">${field('Tên bài hiển thị '+(i+1),`lessons.${i}.title`,lesson.title,'text',locked)}${field('Tên chủ đề '+(i+1),`lessons.${i}.topic`,lesson.topic,'text',locked)}</div>`:`<p class="muted">Nguồn: ${E(lesson.topic)}</p>`}
    ${m.requirements.map((r,ri)=>r.lesson_code===lesson.lesson_code&&(!received||r.source_index===lesson.source_index)?requirementEditor(r,ri,locked,received):'').join('')}
    ${!protectedFields?`<button data-action="add-requirement" data-index="${i}">+ Thêm yêu cầu / chỉ báo kiểm tra</button>`:''}</article>`).join('')}
    ${m.profile==='THPT'?`<h3>Danh mục chỉ báo năng lực</h3><p class="muted">Giữ nguyên mã và mô tả chỉ báo của nguồn. Bảng phân bố năng lực được dựng từ các vị trí đã gắn mã.</p>${m.indicator_catalog.map((c,i)=>`<div class="form-grid mx-indicator">${field('Mã chỉ báo '+(i+1),`indicator_catalog.${i}.code`,c.code,'text',protectedFields)}${select('Năng lực của mã '+(i+1),`indicator_catalog.${i}.competency`,['NLa','NLb','NLc'].map(k=>opt(k,k,k===c.competency)).join(''),protectedFields)}${field('Mô tả chỉ báo '+(i+1),`indicator_catalog.${i}.text`,c.text,'text',protectedFields)}${!protectedFields?`<div class="field" style="justify-content:flex-end"><button type="button" class="quiet danger" data-action="remove-indicator" data-index="${i}">Xóa mã</button></div>`:''}</div>`).join('')}${!protectedFields?'<button data-action="add-indicator">+ Thêm mã chỉ báo</button>':''}`:''}
    <h3 id="mx-slots">3. Phân bố câu hỏi và ý</h3>${!protectedFields?bulkEditor():''}<div id="mx-summary" class="mx-totals"></div>
    <div class="table-wrap"><table class="mx-slots-table"><thead><tr><th>Câu / dạng</th><th>Ý</th><th>Yêu cầu cần đạt cụ thể</th><th>Điểm</th>${m.profile==='THPT'?'<th>Mã chỉ báo</th>':''}${!protectedFields?'<th>Thao tác</th>':''}</tr></thead><tbody>${m.slots.map((s,si)=>s.parts.map((p,pi)=>slotEditor(s,si,p,pi,locked,received)).join('')).join('')}</tbody></table></div>
    <h3 id="mx-validation">4. Đối chiếu & xác nhận</h3>${m.mode==='received'?`<p class="small">Tệp nguồn: ${E(m.source?.name||'Gói dữ liệu')} · Dữ liệu gốc được lưu riêng.</p><label class="mx-checkbox"><input type="checkbox" data-field="reconciliation.confirmed"${m.reconciliation.confirmed?' checked':''}${locked?' disabled':''}>Tôi đã đối chiếu các ánh xạ PPCT, vị trí câu và cách tính điểm với bản nguồn.</label>`:''}<div id="mx-report"></div><div id="mx-shortfall"></div><div class="actions"><button data-action="review">Kiểm tra hồ sơ đã lưu</button><button data-action="shortfall">Báo cáo thiếu câu theo ô</button><button data-action="preview" class="primary">Xem toàn bộ bảng</button>${m.mode==='received'||m.source?`<button data-action="compare">Đối chiếu bản gốc (2 cột)</button>`:''}</div>
    <div id="mx-output"><h3>5. Word & phiên bản dùng chung</h3><p class="muted">Gói dùng chung chỉ có ma trận, đặc tả và chỉ báo; không có câu hỏi, đáp án hoặc lịch sử đề riêng.</p><div id="mx-export-links"></div>
    ${!locked?`<details><summary>Xác nhận bản đã thống nhất để khóa</summary><p class="small muted">Thao tác này ghi nhận xác nhận của thầy, không thay chữ ký hay quyết định thực tế của tổ trưởng.</p><div class="form-grid"><div class="field"><label for="mx-confirm-name">Người xác nhận</label><input id="mx-confirm-name"></div><div class="field"><label for="mx-confirm-date">Ngày xác nhận</label><input id="mx-confirm-date" type="date" value="${new Date().toLocaleDateString('sv-SE')}"></div><div class="field full"><label for="mx-confirm-basis">Căn cứ bản đã thống nhất</label><textarea id="mx-confirm-basis" rows="2"></textarea></div></div><label class="mx-checkbox"><input id="mx-confirm-agreement" type="checkbox">Tôi xác nhận đây là bản đã được thống nhất bên ngoài ứng dụng.</label><button class="primary" data-action="lock">Khóa phiên bản này</button></details>`:`<p class="callout">Bản này đang khóa hoặc lưu trữ. Bạn có thể tạo phiên bản mới hoặc mở khóa về bản nháp.</p><div class="actions"><button data-action="new-version">Tạo phiên bản mới</button><button data-action="unlock">Mở khóa về bản nháp</button>${m.status==='locked'?'<button class="primary" data-action="use">Dùng tạo đề riêng</button>':''}</div>`}
    <details><summary>Lịch sử thao tác</summary><ul>${(m.audit||[]).map(a=>`<li>${E(a.at)} · ${E(({save:'Lưu nháp',lock:'Khóa bản thống nhất',archive:'Lưu trữ',new_version:'Tạo phiên bản tiếp theo',import_source:'Nhập nguồn',unlock:'Mở khóa về nháp',duplicate:'Nhân bản hồ sơ'})[a.action]||a.action)}</li>`).join('')}</ul></details><label for="mx-archive-reason">Lý do lưu trữ</label><input id="mx-archive-reason" placeholder="Không dùng bản này để tạo đề mới"><button class="quiet" data-action="archive">Lưu trữ hồ sơ</button></div></section>`;
    updateSummary();renderReport();renderLinks();restoreButtons();
  }
  function requirementEditor(r,i,locked,received){
    const source=lessons(ui.editing.grade).find(l=>l.lesson_code===r.lesson_code);
    return `<div class="mx-requirement"><div class="dialog-heading" style="margin-bottom:6px"><label for="mx-req-${i}">Yêu cầu / chỉ báo ${i+1}</label>${!locked&&!received?`<button type="button" class="quiet danger" data-action="remove-requirement" data-index="${i}">Xóa yêu cầu</button>`:''}</div><textarea id="mx-req-${i}" rows="2" data-field="requirements.${i}.text"${locked||received?' disabled':''}>${E(r.text)}</textarea><div class="form-grid">${select('Mức độ của yêu cầu '+(i+1),`requirements.${i}.level`,requirementLevelOptions(r.level),locked||received)}${select('Năng lực của yêu cầu '+(i+1),`requirements.${i}.competency`,competencies().map(k=>opt(k,competencyLabel(k),k===r.competency)).join(''),locked||received)}${select('YCCĐ nguồn của yêu cầu '+(i+1),`requirements.${i}.ppct_outcome_index`,opt('','Chọn yêu cầu từ PPCT',r.ppct_outcome_index===null)+(source?.outcomes||[]).map((o,n)=>opt(n,o,r.ppct_outcome_index===n)).join(''),locked)}</div></div>`;
  }
  function bulkEditor(){const m=ui.editing;return `<div class="mx-bulk"><h4>Thêm phân bố</h4><div class="form-grid"><div class="field"><label for="mx-bulk-kind">Dạng câu</label><select id="mx-bulk-kind">${Object.entries(kinds).filter(([k])=>effectiveKinds(m).includes(k)).map(([k,v])=>opt(k,v,false)).join('')}</select></div><div class="field span2"><label for="mx-bulk-req">Yêu cầu kiểm tra</label><select id="mx-bulk-req">${m.requirements.map(r=>opt(r.id,`${r.lesson_code} · ${r.level} · ${r.text}`,false)).join('')}</select></div><div class="field"><label for="mx-bulk-count">Số câu mẹ</label><input id="mx-bulk-count" type="number" min="1" max="100" value="1"></div><div class="field"><label for="mx-bulk-parts">Ý / câu tự luận</label><input id="mx-bulk-parts" type="number" min="1" max="10" value="1"></div><div class="field"><label for="mx-bulk-points">Điểm mỗi ý / câu đơn</label><input id="mx-bulk-points" type="number" min="0.01" step="0.05" value="0.25"></div></div><p class="small muted">Đúng/Sai luôn có 4 ý a–d. Số yêu cầu con của tự luận khác với số tiêu chí của hướng dẫn chấm.</p><button data-action="add-slots">Thêm vào phân bố</button></div>`;}
  function slotEditor(s,si,p,pi,locked,received){const m=ui.editing;const rs=m.requirements.filter(r=>!received||(r.source_index===p.source_index&&r.level===p.source_level));return `<tr><td>${pi===0?`${E(NAMEShort(s.kind))} ${s.number}`:''}</td><td>${E(p.label||'—')}</td><td><select aria-label="Yêu cầu vị trí ${E(s.id)} ${pi+1}" data-field="slots.${si}.parts.${pi}.requirement_id"${locked?' disabled':''}>${opt('','Chọn yêu cầu',!p.requirement_id)}${rs.map(r=>opt(r.id,`${r.lesson_code} · ${r.level} · ${r.text}`,r.id===p.requirement_id)).join('')}</select></td><td><input aria-label="Điểm vị trí ${E(s.id)} ${pi+1}" type="number" min="0.01" step="0.05" data-field="slots.${si}.parts.${pi}.points" value="${E(p.points)}"${locked||received?' disabled':''}></td>${m.profile==='THPT'?`<td><select aria-label="Chỉ báo vị trí ${E(s.id)} ${pi+1}" data-field="slots.${si}.parts.${pi}.indicator"${locked||received?' disabled':''}>${opt('','Chọn mã',!p.indicator)}${m.indicator_catalog.map(c=>opt(c.code,c.code,c.code===p.indicator)).join('')}</select></td>`:''}${!locked&&!received?`<td>${pi===0?`<button class="quiet danger" data-action="remove-slot" data-index="${si}">Bỏ câu</button>`:''}</td>`:''}</tr>`;}
  function NAMEShort(k){return {MC:'MC',YN:'Đ/S',SHORT:'Trả lời ngắn',ES:'Tự luận'}[k];}
  function updateSummary(){const m=ui.editing;if(!m||!qs('#mx-summary'))return;const parts=m.slots.flatMap(s=>s.parts);const total=Math.round(parts.reduce((n,p)=>n+Number(p.points||0),0)*10000)/10000;qs('#mx-summary').innerHTML=`<strong>${m.slots.length} câu mẹ</strong><span>${parts.length} câu / ý</span><strong class="${total===10?'mx-good':'mx-bad'}">${total.toLocaleString('vi-VN')} / 10 điểm</strong>`;}
  // B9: báo cáo thiếu câu đã duyệt theo từng ô, có liên kết sang màn hình duyệt đã lọc đúng ô.
  function shortfallHtml(r,allowReview=false){
    const incomplete=r.complete===false;
    const heading=incomplete?'Chưa thể kết luận đủ câu':r.ok?'Đủ câu đã duyệt cho mọi ô':`Còn thiếu ${E(r.total_shortfall)} câu đã duyệt`;
    const known=incomplete&&r.total_shortfall>0?`<p>Đã xác định thiếu ${E(r.total_shortfall)} câu ở các ô đã đối chiếu; các vị trí bên dưới chưa được tính đủ.</p>`:'';
    const issues=(r.issues||[]).length?`<ul>${r.issues.map(i=>`<li>${E(i.message)}</li>`).join('')}</ul>`:'';
    const rows=(r.cells||[]).map((c,i)=>`<tr${c.shortfall?' style="background:#fff7e6"':''}><td>${E(c.lesson_code)}</td><td>${E(c.outcome)}</td><td>${E(NAMEShort(c.kind))}</td><td>${E(c.level)}</td><td>${E(c.needed)}</td><td>${E(c.approved)}</td><td>${E(c.pending_review)}</td><td>${E(c.needs_review)}</td><td>${E(c.draft)}</td><td><strong>${E(c.shortfall||'—')}</strong></td><td>${c.shortfall&&allowReview?`<button type="button" class="export-link" data-open-review="${i}">Mở duyệt ô này</button>`:''}</td></tr>`).join('');
    const cells=rows?`<div class="table-wrap"><table><thead><tr><th>Bài</th><th>YCCĐ</th><th>Dạng</th><th>Mức độ</th><th>Cần</th><th>Đã duyệt</th><th>Chờ duyệt</th><th>Cần sửa</th><th>Nháp</th><th>Thiếu</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'';
    const unresolved=(r.unresolved_slots||[]).length?`<h4>Vị trí cần đối chiếu từng ý</h4><p>Thông tin của cả câu ngân hàng chưa đủ để xác nhận từng ý khớp bài, YCCĐ và mức độ. Chưa tính các vị trí này là đủ hoặc cộng vào số thiếu đã xác định.</p><div class="table-wrap"><table><thead><tr><th>Câu / ý</th><th>Bài</th><th>YCCĐ</th><th>Mức độ</th><th>Điểm</th><th>Cần đối chiếu</th></tr></thead><tbody>${r.unresolved_slots.flatMap(slot=>(slot.parts?.length?slot.parts:[{}]).map(part=>`<tr><td>${E(NAMEShort(slot.kind)||slot.kind)} ${E(slot.number??'')}${E(part.label||'')}</td><td>${E(part.lesson_code||'Chưa ánh xạ')}</td><td>${E(part.outcome||'Chưa ánh xạ')}</td><td>${E(part.level||'Chưa xác định')}</td><td>${E(part.points??'—')}</td><td>${E(slot.reason||'Cần đối chiếu với nguồn.')}</td></tr>`)).join('')}</tbody></table></div>`:'';
    return `<div class="${!incomplete&&r.ok?'callout':'callout warning'}"><strong>${heading}</strong>${known}${issues}${cells}${unresolved}<p class="small muted">Chỉ câu đã duyệt được dùng cho đề chính thức. Không bù câu sang bài, YCCĐ hoặc mức độ khác. Báo cáo chưa đủ căn cứ cần được đối chiếu trước khi kết luận.</p></div>`;
  }
  function renderShortfall(){const el=qs('#mx-shortfall'),r=ui.shortfall;if(!el||!r)return;
    el.innerHTML=shortfallHtml(r,Boolean(ui.ctx.openReview));
    el.querySelectorAll('[data-open-review]').forEach(b=>b.onclick=()=>ui.ctx.openReview(r.cells[Number(b.dataset.openReview)]));}
  function renderReport(){const el=qs('#mx-report');if(!el)return;const r=ui.report;el.innerHTML=r?`<div class="${r.valid?'callout':'mx-errors'}"><strong>${r.valid?'Đã đạt kiểm tra kỹ thuật':'Còn nội dung cần đối chiếu'}</strong>${r.errors?.length?`<ul>${r.errors.map(e=>`<li>${E(e.message)}</li>`).join('')}</ul>`:''}${r.warnings?.length?`<div class="callout warning"><strong>Cảnh báo (không chặn)</strong><ul>${r.warnings.map(w=>`<li>${E(w.message)}</li>`).join('')}</ul></div>`:''}${r.valid&&!r.exam_supported?'<p>Ma trận xuất được Word; có câu Đúng/Sai hoặc trả lời ngắn trải trên nhiều bài/mức độ nên cần chọn câu và đối chiếu thủ công.</p>':''}${r.valid?'<p>Kiểm tra này không tự xác nhận tổ trưởng đã duyệt.</p>':''}</div>`:'<p class="muted">Lưu nháp và chạy kiểm tra để xem những mục còn thiếu.</p>';}
  function renderLinks(){const el=qs('#mx-export-links'),m=ui.editing;if(!el)return;if(!m.id||ui.dirty){el.innerHTML='<p class="muted">Lưu thay đổi để xuất đúng nội dung đang soạn.</p>';return;}const base='/api/matrices/'+encodeURIComponent(m.id)+'/export';el.innerHTML=`<div class="actions"><a class="button primary" href="${base}?format=docx">Word trọn bộ</a><a class="button" href="${base}?format=docx&section=matrix">Word ma trận</a><a class="button" href="${base}?format=docx&section=specification">Word đặc tả</a><a class="button" href="${base}?format=pdf">PDF</a><a class="button" href="${base}?format=tex">LaTeX (.tex)</a>${m.profile==='THPT'?`<a class="button" href="${base}?format=docx&section=competencies">Word năng lực</a>`:''}<a class="button" href="${base}?format=json">Gói dữ liệu dùng chung</a></div>`;}
  function changed(){ui.dirty=true;ui.report=null;const mark=qs('#mx-dirty');if(mark)mark.textContent=' · Có thay đổi chưa lưu';updateSummary();renderReport();renderLinks();restoreButtons();}
  function assign(el){
    if(ui.editing&&el.dataset.allowKind!==undefined){
      setAllowedKinds(ui.editing,[...document.querySelectorAll('[data-allow-kind]')].filter(x=>x.checked).map(x=>x.dataset.allowKind));
      changed();renderEditor();return;
    }
    if(ui.editing&&el.dataset.ynCoef!==undefined){setYnCoefficient(ui.editing,Number(el.dataset.ynCoef),el.value);changed();return;}
    if(!ui.editing||!el.dataset.field)return;
    const path=el.dataset.field.split('.'),key=path.pop();let object=ui.editing;
    for(const part of path)object=object[part];const previous=object[key];let value=el.value;
    if(el.type==='checkbox')value=key==='choice_group'?(el.checked?'alternative':null):el.checked;
    else if(el.type==='number'||key==='ppct_outcome_index'||key==='grade')value=value===''?null:Number(value);
    object[key]=value;changed();
    if(key==='grade'){
      ui.editing.profile=generic()?'GENERAL':Number(value)===10?'THPT':'THCS';
      renderEditor();
    }else if(path[0]==='lessons'&&key==='lesson_code'){
      const lesson=ui.editing.lessons[Number(path[1])];
      ui.editing.requirements.forEach(r=>{if(ui.editing.mode==='received'&&!ui.editing.allow_custom_override?r.source_index===lesson.source_index:r.lesson_code===previous){r.lesson_code=value;r.ppct_outcome_index=null;}});
      renderEditor();
    }else if(key==='ppct_outcome_index'&&(ui.editing.mode==='authored'||ui.editing.allow_custom_override)){
      const r=object,l=lessons(ui.editing.grade).find(x=>x.lesson_code===r.lesson_code);
      if(!r.text&&value!==null){r.text=l?.outcomes[value]||'';renderEditor();}
    }else if(el.tagName==='SELECT'&&['level','profile','competency'].includes(key))renderEditor();
  }
  function captureGeneration(){if(!ui.generation||!qs('#mx-exam-title'))return;const values={};ui.container.querySelectorAll('[id^=mx-exam-],[data-choice],[data-review-slot]').forEach(el=>{const key=el.dataset.reviewSlot?'review:'+el.dataset.reviewSlot+':'+el.value:el.id;values[key]=el.type==='checkbox'?el.checked:el.value;});ui.generation.formValues=values;}
  function input(event){captureGeneration();if(event.target.matches('[data-field]')&&event.target.tagName!=='SELECT'&&event.target.type!=='checkbox')assign(event.target);}
  async function change(event){const el=event.target;if(el.matches('[data-field]')&&(el.tagName==='SELECT'||el.type==='checkbox'))assign(el);if(el.matches('[data-allow-kind],[data-yn-coef]'))assign(el);if(el.dataset.filter){ui.filter[el.dataset.filter]=el.value;render();}if(el.id==='mx-file')await readImport(el.files[0]);if(el.dataset.choice){const id=el.dataset.choice;ui.container.querySelectorAll('[data-review-slot]').forEach(c=>{if(c.dataset.reviewSlot===id)c.checked=false;});showChoice(id);coverage();}if(el.id==='mx-exam-revision')coverage();captureGeneration();}
  function guard(){if(ui.dirty){message('Có thay đổi chưa lưu. Hãy lưu hoặc bấm “Bỏ thay đổi / tải bản đã lưu” trước khi mở hồ sơ khác.',true);return false;}return true;}
  async function openRecord(id,discard=false){if(!discard&&!guard())return;const d=await ui.ctx.request('/api/matrices/'+encodeURIComponent(id));ui.editing=d.matrix;ui.report=d.validation;ui.dirty=false;ui.importing=null;ui.generation=null;render();}
  async function save(){const result=await ui.ctx.request('/api/matrices/save',{matrix:ui.editing,expected_revision:ui.editing.revision,allow_custom_override:Boolean(ui.editing.allow_custom_override)});ui.editing=result.matrix;ui.report=result.validation;ui.dirty=false;await refresh();render();message('Đã lưu bản nháp; nguồn và lịch sử cũ được giữ nguyên.');}
  function rawCellCenter(ri,headers,cols,start,firstText){
    if(ri<headers)return true;
    const f=String(firstText||'').trim().toLowerCase();
    if(f.startsWith('tổng')||f.startsWith('tỉ lệ')||f.startsWith('ti le'))return true;
    if(headers===4)return true;
    if(cols===3&&headers===1)return start===0||start===1;
    if(start===0)return true;
    if(cols>=10&&headers===3&&start>=3)return true;
    if(cols===8&&headers===3&&start>=4)return true;
    return false;
  }
  function renderRawTablesHtml(m){
    const tables=m?.source?.tables||[];if(!tables.length)return '';
    const period={TX:'THƯỜNG XUYÊN',GK1:'GIỮA KÌ 1',CK1:'CUỐI KÌ 1',GK2:'GIỮA KÌ 2',CK2:'CUỐI KÌ 2'}[m.exam_type]||'';
    const sub=`<p class="mx-doc-subhead" align="center"><strong>MÔN: ${E(subject(m).toLocaleUpperCase('vi'))} ${E(m.grade)} - THỜI GIAN LÀM BÀI: ${E(m.duration||45)} PHÚT</strong></p>`;
    const renderOne=(tbl,headers,heading)=>{
      const cols=tbl.columns||1,widths=(tbl.widths&&tbl.widths.length===cols)?tbl.widths:Array(cols).fill(1),tot=widths.reduce((a,b)=>a+b,0)||1;
      let h=`<p class="mx-doc-heading" align="center"><strong>${E(heading)}</strong></p>`+(heading==='Mã hóa ma trận'?'':sub);
      h+=`<table><colgroup>${widths.map(w=>`<col style="width:${(w/tot*100).toFixed(2)}%">`).join('')}</colgroup>`;
      const rows=tbl.rows||[];
      for(let ri=0;ri<rows.length;ri++){
        const header=ri<headers;
        if(ri===0&&header)h+='<thead>';
        if(!header&&ri>0&&ri-1<headers)h+='</thead><tbody>';
        const cells=rows[ri].cells||[],firstText=cells[0]?.text||'';
        h+='<tr>';
        for(const c of cells){
          if(c.vmerge==='continue')continue;
          let rowspan=1;
          if(c.vmerge==='restart'){
            for(let nr=ri+1;nr<rows.length;nr++){
              const cont=(rows[nr].cells||[]).find(x=>x.start===c.start);
              if(!cont||cont.vmerge!=='continue')break;
              rowspan++;
            }
          }
          const isCenter=rawCellCenter(ri,headers,cols,c.start,firstText);
          const align=isCenter?'center':'left';
          const cls=isCenter?'mx-center':(cols===8&&headers===3&&c.start===3?'mx-req-cell':'mx-left');
          const tag=header?'th':'td';
          h+=`<${tag} colspan="${c.span||1}" rowspan="${rowspan}" align="${align}" class="${cls}">${E(c.text||'').replace(/\n/g,'<br>')}</${tag}>`;
        }
        h+='</tr>';
      }
      return h+'</tbody></table>';
    };
    if(tables.length===4){
      return renderOne(tables[0],3,'MA TRẬN ĐỀ KIỂM TRA '+period)+
             renderOne(tables[1],4,'MA TRẬN PHÂN BỐ THEO DẠNG THỨC CÂU HỎI VÀ CẤP ĐỘ TƯ DUY')+
             renderOne(tables[2],1,'Mã hóa ma trận')+
             renderOne(tables[3],3,'BẢNG ĐẶC TẢ ĐỀ KIỂM TRA '+period);
    }
    let out='';
    if(tables[0])out+=renderOne(tables[0],3,'MA TRẬN ĐỀ KIỂM TRA '+period);
    if(tables[1])out+=renderOne(tables[tables.length-1],3,'BẢNG ĐẶC TẢ ĐỀ KIỂM TRA '+period);
    return out;
  }
  function enhanceSheetTables(rootEl){
    if(!rootEl)return;
    rootEl.querySelectorAll('.mx-sheet-body').forEach(sheet=>{
      sheet.querySelectorAll(':scope > p').forEach(p=>{
        p.setAttribute('align','center');
        const up=p.textContent.trim().toUpperCase();
        p.classList.add(up.startsWith('MÔN:')?'mx-doc-subhead':'mx-doc-heading');
      });
      sheet.querySelectorAll('table').forEach(table=>{
        const headRows=table.querySelectorAll('thead tr').length||1;
        const firstRow=table.querySelector('tr');
        let cols=0;if(firstRow)firstRow.querySelectorAll('th,td').forEach(c=>{cols+=Number(c.getAttribute('colspan')||1);});
        if(!table.querySelector('colgroup')&&cols>0){
          let weights=Array(cols).fill(1);
          if(cols===8&&headRows===3)weights=[0.8,3,3.6,9.2,1.8,1.8,1.8,1.8];
          else if(cols>=10&&headRows===3){const kinds=(cols-7)/3;weights=[0.9,3.1,4,...Array(Math.max(0,Math.round(kinds*3))).fill(1.05),1.1,1.1,1.1,1.7];}
          else if(cols===12&&headRows===4)weights=[1.9,1.1,0.7,1.7,1.7,1.7,1.7,1.7,1.7,1.7,1.7,1.7];
          else if(cols===3&&headRows===1)weights=[5.2,1.8,16.8];
          if(weights.length===cols){
            const tot=weights.reduce((a,b)=>a+b,0)||1;
            const cg=document.createElement('colgroup');
            cg.innerHTML=weights.map(w=>`<col style="width:${(w/tot*100).toFixed(2)}%">`).join('');
            table.insertBefore(cg,table.firstChild);
          }
        }
        const occupied={};
        table.querySelectorAll('tr').forEach((tr,ri)=>{
          const cells=[...tr.children];
          const firstText=cells[0]?.textContent||'';
          let colIdx=0;
          cells.forEach(cell=>{
            while(occupied[`${ri}:${colIdx}`])colIdx++;
            const span=Number(cell.getAttribute('colspan')||1),rspan=Number(cell.getAttribute('rowspan')||1);
            for(let dr=0;dr<rspan;dr++)for(let dc=0;dc<span;dc++)occupied[`${ri+dr}:${colIdx+dc}`]=true;
            if(!cell.getAttribute('align')){
              const isHeader=cell.tagName==='TH'||ri<headRows;
              const isCenter=isHeader||rawCellCenter(ri,headRows,cols,colIdx,firstText);
              cell.setAttribute('align',isCenter?'center':'left');
              cell.classList.add(isCenter?'mx-center':(cols===8&&headRows===3&&colIdx===3?'mx-req-cell':'mx-left'));
            }
            colIdx+=span;
          });
        });
      });
    });
  }
  async function openPreview(id,section='all',mode='web'){
    const m=ui.records.find(x=>x.id===id)||(ui.editing?.id===id?ui.editing:null)||(await ui.ctx.request('/api/matrices/'+encodeURIComponent(id))).matrix;
    let bodyHtml='';
    if(mode==='raw'&&m?.source?.tables?.length&&section==='all'){
      const res=await fetch(apiUrl(`/api/matrices/${encodeURIComponent(id)}/export?format=html&section=${encodeURIComponent(section)}&mode=raw`));
      if(res.ok){const doc=new DOMParser().parseFromString(await res.text(),'text/html');bodyHtml=doc.body.innerHTML;}
      else bodyHtml=renderRawTablesHtml(m);
    }else{
      const res=await fetch(apiUrl(`/api/matrices/${encodeURIComponent(id)}/export?format=html&section=${encodeURIComponent(section)}&mode=${encodeURIComponent(mode)}`));
      if(!res.ok)throw new Error('Chưa dựng được bản xem toàn bộ. Hãy kiểm tra hồ sơ đã lưu.');
      const doc=new DOMParser().parseFromString(await res.text(),'text/html');
      bodyHtml=doc.body.innerHTML;
    }
    ui.comparison=null;
    ui.previewState={id,matrix:m,section,mode,bodyHtml};
    renderPreviewBox(true);
  }
  function renderPreviewBox(scroll=false){
    const preview=qs('#mx-preview'),st=ui.previewState;if(!preview||!st)return;
    const m=st.matrix,base='/api/matrices/'+encodeURIComponent(st.id)+'/export',hasRaw=Boolean(m.source?.tables?.length);
    const issues=m.reconciliation?.issues||[];
    const fmtKey=`matrix:${st.id}:${st.section}:${st.mode}`;
    const fmt=root.DocFormatter||root.BankCore?.DocFormatter;
    preview.hidden=false;preview.className='card mx-preview';
    preview.innerHTML=`<div class="mx-panel-head"><div><p class="eyebrow">XEM TOÀN BỘ MA TRẬN & BẢNG ĐẶC TẢ</p><h2>${E(m.title)} · Khối ${m.grade} (${E(profileLabel(m.profile))})</h2></div><div class="actions"><button type="button" data-action="compare-id" data-id="${E(st.id)}">Đối chiếu bản gốc (2 cột)</button>${ui.editing?.id!==st.id?`<button type="button" data-open="${E(st.id)}">Mở biên tập</button>`:''}<button type="button" class="quiet" data-action="close-preview">Đóng khung xem</button></div></div>`+
    `<div class="mx-panel-toolbar"><div class="actions"><button type="button" class="${st.section==='all'?'primary':''}" data-action="preview-sec" data-sec="all">Toàn bộ bảng</button><button type="button" class="${st.section==='matrix'?'primary':''}" data-action="preview-sec" data-sec="matrix">Bảng ma trận</button><button type="button" class="${st.section==='specification'?'primary':''}" data-action="preview-sec" data-sec="specification">Bảng đặc tả</button>${m.profile==='THPT'?`<button type="button" class="${st.section==='competencies'?'primary':''}" data-action="preview-sec" data-sec="competencies">Bảng năng lực</button>`:''}</div>`+
    `<div class="actions">${hasRaw?`<button type="button" class="${st.mode==='web'?'primary':''}" data-action="preview-mode" data-mode="web">Bản chuẩn hóa Web (đánh số câu)</button><button type="button" class="${st.mode==='raw'?'primary':''}" data-action="preview-mode" data-mode="raw">Bảng nguyên trạng từ Word</button>`:''}<a class="button" href="${base}?format=docx&mode=${E(st.mode)}">Tải Word (.docx)</a></div></div>`+
    (fmt?fmt.toolbarHtml(fmtKey,false):'')+
    (issues.length?`<div class="mx-errors"><strong>Cảnh báo nguồn cần xác minh (${issues.length} mục):</strong><ul>${issues.map(x=>`<li>${E(x.message)}</li>`).join('')}</ul></div>`:'')+
    `<div class="mx-sheet-body">${st.bodyHtml}</div>`;
    enhanceSheetTables(preview);
    if(fmt){
      fmt.attach(preview,'.mx-sheet-body',{
        storageKey:fmtKey,
        title:`${m.title} - Khối ${m.grade}`,
        filename:`TIN_${m.grade}_${m.exam_type||'GK1'}_MA_TRAN_CHINH_SUA.doc`,
        landscape:true,
        notify:message,
        onAutoFormat:()=>enhanceSheetTables(preview),
        onSave:async()=>{
          message('Đã lưu nội dung và định dạng bảng của khung Xem toàn bộ. Bạn có thể bấm "Xuất Word bản đang chỉnh" hoặc "In / PDF".');
        }
      });
    }
    if(scroll)preview.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function openComparison(id){
    let data;
    try{
      data=await ui.ctx.request('/api/matrices/'+encodeURIComponent(id)+'/compare');
    }catch(_err){
      const d=await ui.ctx.request('/api/matrices/'+encodeURIComponent(id));
      const m=d.matrix;
      const webRes=await fetch(apiUrl(`/api/matrices/${encodeURIComponent(id)}/export?format=html&section=all&mode=web`));
      const webDoc=webRes.ok?new DOMParser().parseFromString(await webRes.text(),'text/html'):null;
      data={
        matrix:m,
        validation:d.validation,
        pages:[],
        has_raw_tables:Boolean(m.source?.tables?.length),
        raw_html:renderRawTablesHtml(m),
        web_html:webDoc?webDoc.body.innerHTML:'',
        comparison_notes:m.source?.comparison_notes||[],
        issues:m.reconciliation?.issues||[],
      };
    }
    ui.previewState=null;
    ui.comparison={...data,leftMode:data.pages?.length?'pages':'raw',selectedPage:'all',zoom:false};
    renderComparisonBox(true);
  }
  function renderComparisonBox(scroll=false){
    const preview=qs('#mx-preview'),c=ui.comparison;if(!preview||!c)return;
    const m=c.matrix,pages=c.pages||[],issues=c.issues||[],notes=c.comparison_notes||[];
    const visiblePages=c.selectedPage==='all'?pages:pages.filter(p=>String(p.page)===String(c.selectedPage));
    preview.hidden=false;preview.className='card mx-preview mx-compare-card';
    preview.innerHTML=`<div class="mx-panel-head"><div><p class="eyebrow">ĐỐI CHIẾU SONG SONG 2 CỘT · BẢN GỐC WORD & BẢN TRÊN WEB</p><h2>${E(m.title)} · Khối ${m.grade}</h2><p class="small muted">Tệp nguồn: <strong>${E(m.source?.name||'Hồ sơ biên soạn')}</strong>${m.source?.sha256?` · SHA-256: <code>${E(m.source.sha256.slice(0,16))}…</code>`:''} · Tổng: ${c.validation?.totals?.questions||m.slots?.length||0} câu mẹ (${c.validation?.totals?.items||(m.slots||[]).reduce((s,x)=>s+(x.parts?.length||0),0)} ý) · ${c.validation?.totals?.points||m.total_points||10} điểm</p></div><div class="actions"><button type="button" data-action="preview-id" data-id="${E(m.id)}">Xem toàn bộ (1 cột)</button>${ui.editing?.id!==m.id?`<button type="button" data-open="${E(m.id)}">Mở biên tập</button>`:''}<button type="button" class="quiet" data-action="close-preview">Đóng đối chiếu</button></div></div>`+
    (issues.length?`<div class="mx-errors"><strong>Phát hiện ${issues.length} điểm mâu thuẫn trong tệp nguồn cần xác minh (nguyên tắc bảo toàn: giữ nguyên, không tự ý sửa số liệu nguồn):</strong><ul>${issues.map(x=>`<li>${E(x.message)}</li>`).join('')}</ul></div>`:`<div class="callout"><strong>Đối chiếu số lượng & điểm số:</strong> Tổng số câu, số ý và điểm số giữa Bảng ma trận và Bảng đặc tả khớp 100%.</div>`)+
    (notes.length?`<div class="callout warning"><strong>Ghi chú chuẩn hóa hiển thị so với bản Word gốc:</strong><ul style="margin:6px 0 0;padding-left:20px">${notes.map(n=>`<li>${E(n)}</li>`).join('')}</ul></div>`:'')+
    `<div class="mx-compare-grid">`+
      `<section class="mx-compare-pane"><div class="mx-pane-bar"><div><strong>CỘT TRÁI · BẢN GỐC WORD</strong><span class="small muted"> (${pages.length?`${pages.length} trang ảnh gốc`:'Bảng trích xuất nguyên trạng'})</span></div><div class="actions">`+
      (pages.length?`<button type="button" class="${c.leftMode==='pages'?'primary':''}" data-action="cmp-left" data-left="pages">Ảnh trang Word gốc (${pages.length})</button>`:'')+
      (c.has_raw_tables?`<button type="button" class="${c.leftMode==='raw'?'primary':''}" data-action="cmp-left" data-left="raw">Bảng trích xuất nguyên trạng</button>`:'')+
      (c.leftMode==='pages'&&pages.length?`<select id="mx-cmp-page" aria-label="Chọn trang bản gốc">${opt('all',`Tất cả ${pages.length} trang`,c.selectedPage==='all')}${pages.map(p=>opt(p.page,`Trang ${p.page}/${pages.length}`,String(c.selectedPage)===String(p.page))).join('')}</select><button type="button" data-action="cmp-zoom">${c.zoom?'Thu vừa khung':'Phóng to 150%'}</button>`:'')+
      `</div></div><div class="mx-pane-body ${c.zoom?'mx-zoomed':''}">`+
      (c.leftMode==='pages'&&pages.length?visiblePages.map(p=>`<figure class="mx-page-figure"><figcaption>Trang ${p.page} / ${pages.length} — Bản gốc Word (${E(m.source?.name||'')})</figcaption><img src="${E(apiUrl(p.url))}" alt="Trang ${p.page} bản gốc ${E(m.title)}" loading="lazy"></figure>`).join(''):c.raw_html?`<div class="mx-sheet-body">${c.raw_html}</div>`:'<p class="muted">Hồ sơ này được biên soạn trực tiếp trên web, không có tệp Word nguồn đính kèm.</p>')+
      `</div></section>`+
      `<section class="mx-compare-pane" id="mx-cmp-right-pane"><div class="mx-pane-bar"><div><strong>CỘT PHẢI · BẢN TRÊN WEB (CHUẨN HÓA)</strong><span class="small muted"> · Ma trận: (1, 2, 3) · Đặc tả: (Câu 1, Câu 2).</span></div></div>`+
      ((root.DocFormatter||root.BankCore?.DocFormatter)?`<div style="padding:10px 14px 0;background:#eef2f7">${(root.DocFormatter||root.BankCore?.DocFormatter).toolbarHtml(`matrix:${m.id}:all:web`,false)}</div>`:'')+
      `<div class="mx-pane-body"><div class="mx-sheet-body">${c.web_html}</div></div></section>`+
    `</div>`;
    enhanceSheetTables(preview);
    const fmt=root.DocFormatter||root.BankCore?.DocFormatter;
    const rightPane=qs('#mx-cmp-right-pane');
    if(fmt&&rightPane){
      fmt.attach(rightPane,'.mx-sheet-body',{
        storageKey:`matrix:${m.id}:all:web`,
        title:`${m.title} - Khối ${m.grade}`,
        filename:`TIN_${m.grade}_${m.exam_type||'GK1'}_MA_TRAN_CHINH_SUA.doc`,
        landscape:true,
        notify:message,
        onAutoFormat:()=>enhanceSheetTables(rightPane),
        onSave:async()=>{
          message('Đã lưu nội dung và định dạng của Cột phải (Bản chuẩn hóa trên Web).');
        }
      });
    }
    const sel=qs('#mx-cmp-page');if(sel)sel.onchange=ev=>{ui.comparison.selectedPage=ev.target.value;renderComparisonBox(false);};
    if(scroll)preview.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function click(event){
    const scroll=event.target.closest('[data-scroll]');if(scroll){qs('#'+scroll.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    const open=event.target.closest('[data-open]');if(open){await run(()=>openRecord(open.dataset.open));return;}
    const b=event.target.closest('[data-action]');if(!b)return;event.preventDefault();const action=b.dataset.action;
    if(action==='close-preview'){ui.comparison=null;ui.previewState=null;const p=qs('#mx-preview');if(p)p.hidden=true;return;}
    if(action==='cmp-left'&&ui.comparison){ui.comparison.leftMode=b.dataset.left;renderComparisonBox(false);return;}
    if(action==='cmp-zoom'&&ui.comparison){ui.comparison.zoom=!ui.comparison.zoom;renderComparisonBox(false);return;}
    if(action==='preview-sec'&&ui.previewState){await run(()=>openPreview(ui.previewState.id,b.dataset.sec,ui.previewState.mode));return;}
    if(action==='preview-mode'&&ui.previewState){await run(()=>openPreview(ui.previewState.id,ui.previewState.section,b.dataset.mode));return;}
    if(action==='preview-id'){await run(()=>openPreview(b.dataset.id,'all','web'));return;}
    if(action==='compare-id'){await run(()=>openComparison(b.dataset.id));return;}
    if(action==='new'){if(!guard())return;ui.editing=newDraft(b.dataset.grade);ui.report=null;ui.importing=null;ui.generation=null;render();return;}
    if(action==='import'){if(!guard())return;ui.editing=null;ui.generation=null;ui.importing={grade:grades()[0]};render();return;}
    if(action==='discard'){await run(async()=>{if(ui.dirty&&ui.editing.id)await openRecord(ui.editing.id,true);else{ui.editing=null;ui.dirty=false;render();}});return;}
    if(action==='unlock-custom'&&ui.editing){
      ui.editing.allow_custom_override=true;
      ui.editing.status='draft';
      changed();renderEditor();
      message('Đã bật chế độ sửa toàn diện. Bạn có thể thêm/sửa/xóa bài học, YCCĐ và phân bố câu hỏi rồi bấm Lưu bản nháp.');
      return;
    }
    if(action==='add-lesson'){
      const l=lessons(ui.editing.grade).find(x=>x.lesson_code===qs('#mx-add-lesson')?.value);if(!l)return;
      ui.editing.lessons.push({lesson_code:l.lesson_code,title:l.lesson_name_source,topic:l.topic_source});changed();renderEditor();return;
    }
    if(action==='remove-lesson'){
      const idx=Number(b.dataset.index),l=ui.editing.lessons[idx];if(!l)return;
      ui.editing.lessons.splice(idx,1);
      ui.editing.requirements=ui.editing.requirements.filter(r=>r.lesson_code!==l.lesson_code);
      changed();renderEditor();return;
    }
    if(action==='add-requirement'){
      const l=ui.editing.lessons[Number(b.dataset.index)];ui.editing.requirements.push({id:uid('R'),lesson_code:l.lesson_code,level:'Biết',text:'',ppct_outcome_index:null,competency:competencies()[0],choice_group:null});changed();renderEditor();return;
    }
    if(action==='remove-requirement'){
      const idx=Number(b.dataset.index),r=ui.editing.requirements[idx];if(!r)return;
      ui.editing.requirements.splice(idx,1);
      ui.editing.slots.forEach(s=>s.parts.forEach(p=>{if(p.requirement_id===r.id)p.requirement_id='';}));
      changed();renderEditor();return;
    }
    if(action==='add-indicator'){ui.editing.indicator_catalog.push({code:'',competency:competencies()[0],text:''});changed();renderEditor();return;}
    if(action==='remove-indicator'){ui.editing.indicator_catalog.splice(Number(b.dataset.index),1);changed();renderEditor();return;}
    if(action==='add-slots'){
      const m=ui.editing,kind=qs('#mx-bulk-kind').value,rid=qs('#mx-bulk-req').value,count=Number(qs('#mx-bulk-count').value),parts=kind==='YN'?4:kind==='ES'?Number(qs('#mx-bulk-parts').value):1,points=Number(qs('#mx-bulk-points').value);
      if(!rid||!Number.isInteger(count)||count<1||count>100||!Number.isInteger(parts)||parts<1||parts>10||!Number.isFinite(points)||points<=0){message('Chọn YCCĐ, số câu/ý và điểm hợp lệ trước khi thêm.',true);return;}
      const start=m.slots.filter(s=>s.kind===kind).length;
      for(let i=0;i<count;i++)m.slots.push({id:uid('S'),kind,number:start+i+1,scoring:{mode:'sum_parts'},parts:Array.from({length:parts},(_,j)=>({id:uid('P'),label:parts===1?'':String.fromCharCode(97+j),requirement_id:rid,points,indicator:''}))});
      changed();renderEditor();return;
    }
    if(action==='remove-slot'){const kind=ui.editing.slots[Number(b.dataset.index)].kind;ui.editing.slots.splice(Number(b.dataset.index),1);ui.editing.slots.filter(s=>s.kind===kind).forEach((s,i)=>s.number=i+1);changed();renderEditor();return;}
    await run(async()=>{
      if(action==='save')await save();
      else if(action==='shortfall'){if(!ui.editing.id||ui.dirty){ui.ctx.notify('Lưu ma trận trước khi xem báo cáo thiếu câu.',true);}else{ui.shortfall=await ui.ctx.request('/api/matrices/'+encodeURIComponent(ui.editing.id)+'/shortfall');renderShortfall();}restoreButtons();}
      else if(action==='review'){ui.report=(await ui.ctx.request('/api/matrices/review',{id:ui.editing.id})).validation;renderReport();restoreButtons();}
      else if(action==='preview'){await openPreview(ui.editing.id,'all','web');}
      else if(action==='compare'){await openComparison(ui.editing.id);}
      else if(action==='duplicate-id'){
        const id=b.dataset.id||ui.editing?.id;if(!id)return;
        const result=await ui.ctx.request('/api/matrices/duplicate',{id});
        ui.editing={...result.matrix,allow_custom_override:true};ui.report=result.validation;ui.dirty=false;await refresh();render();
        message('Đã nhân bản hồ sơ ma trận sang bản nháp mới.');
      }else if(action==='delete-id'){
        const id=b.dataset.id||ui.editing?.id;if(!id)return;
        if(typeof window!=='undefined'&&window.confirm&&!window.confirm(`Xóa vĩnh viễn hồ sơ ma trận "${id}"?`))return;
        await ui.ctx.request('/api/matrices/delete',{id});
        if(ui.editing?.id===id){ui.editing=null;ui.dirty=false;}
        if(ui.previewState?.id===id)ui.previewState=null;
        if(ui.comparison?.matrix?.id===id)ui.comparison=null;
        await refresh();render();message('Đã xóa hồ sơ ma trận.');
      }else if(action==='unlock'){
        const result=await ui.ctx.request('/api/matrices/unlock',{id:ui.editing.id});
        ui.editing=result.matrix;ui.report=result.validation;ui.dirty=false;await refresh();render();
        message('Đã mở khóa hồ sơ về trạng thái Bản nháp.');
      }else if(action==='lock'){
        const confirmation={confirmed_by:qs('#mx-confirm-name').value,confirmed_at:qs('#mx-confirm-date').value,basis:qs('#mx-confirm-basis').value,external_agreement:qs('#mx-confirm-agreement').checked};
        const result=await ui.ctx.request('/api/matrices/lock',{id:ui.editing.id,expected_revision:ui.editing.revision,confirmation});ui.editing=result.matrix;ui.report=result.validation;await refresh();render();message('Đã khóa phiên bản. Đề tạo sau này sẽ lưu dấu phiên bản ma trận này.');
      }else if(action==='new-version'){
        const result=await ui.ctx.request('/api/matrices/new-version',{id:ui.editing.id});ui.editing=result.matrix;ui.report=result.validation;ui.dirty=false;await refresh();render();
      }else if(action==='archive'){
        const result=await ui.ctx.request('/api/matrices/archive',{id:ui.editing.id,expected_revision:ui.editing.revision,reason:qs('#mx-archive-reason').value});ui.editing=result.matrix;ui.report=result.validation;await refresh();render();message('Đã lưu trữ; các đề cũ vẫn giữ phiên bản đã dùng.');
      }else if(action==='accept-import'){
        const i=ui.importing;const result=i.package?await ui.ctx.request('/api/matrices/import-package',{package:i.package}):await ui.ctx.request('/api/matrices/accept-import',{filename:i.filename,grade:i.grade,content_base64:i.base64});
        ui.editing=result.matrix;ui.report=result.validation;ui.importing=null;ui.dirty=false;await refresh();render();message('Đã nhận bản nguồn. Hãy đối chiếu PPCT, vị trí câu và các điểm còn thiếu trước khi khóa.');
      }else if(action==='use'){
        const data=await ui.ctx.request('/api/matrices/'+encodeURIComponent(ui.editing.id)+'/candidates');ui.generation=data;ui.editing=null;ui.dirty=false;render();
      }else if(action==='suggest'){suggest();}
      else if(action==='generate'){await generate();}
    });
  }
  function parseMatrixFromMarkdown(text, defaultGrade) {
    if (!text || typeof text !== 'string') return null;
    let grade = Number(defaultGrade || 9);
    const mGrade = text.match(/(?:Khối|Khối lớp|Grade)\s*[:=]?\s*(\d+)/i) || text.match(/(?:TIN|K)\s*(\d+)/i);
    if (mGrade) grade = Number(mGrade[1]);

    let examType = 'GK1';
    if (/Cuối\s*k[ỳi]\s*1|CK1|Học\s*k[ỳi]\s*1/i.test(text)) examType = 'CK1';
    else if (/Giữa\s*k[ỳi]\s*2|GK2/i.test(text)) examType = 'GK2';
    else if (/Cuối\s*k[ỳi]\s*2|CK2|Học\s*k[ỳi]\s*2/i.test(text)) examType = 'CK2';

    let title = '';
    const mTitle = text.match(/^#+\s*(.+)$/m);
    if (mTitle) title = mTitle[1].replace(/[*_#]/g, '').trim();
    if (!title) title = 'Ma trận & đặc tả ' + examType + ' - Khối ' + grade;

    const lines = text.split(/\r?\n/);
    const tableRows = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
    
    const lessonsMap = new Map();
    const requirements = [];
    const slots = [];
    let reqCount = 0;
    let slotCount = 0;

    for (const r of tableRows) {
      const cells = r.split('|').slice(1, -1).map(c => c.trim());
      if (!cells.length) continue;
      if (/^:?-+:?$/.test(cells[0]) || /^(?:TT|STT)$/i.test(cells[0]) || (/Bài\s*học/i.test(cells[1] || '') && /Yêu\s*cầu/i.test(cells[2] || '')) || (/Bài\s*học/i.test(cells[2] || '') && /Yêu\s*cầu/i.test(cells[3] || ''))) continue;
      if (cells.some(c => /^Tổng/i.test(c))) continue;

      let lessonRaw = '', outcomeRaw = '', levelRaw = 'Biết', kindRaw = 'MC', countRaw = '1', ptsRaw = '0.25', topicRaw = 'Chương trình GDPT';

      if (cells.length >= 6) {
        if (cells.length >= 7 && /Chủ\s*đề/i.test(cells[1])) {
          topicRaw = cells[1];
          lessonRaw = cells[2];
          outcomeRaw = cells[3];
          levelRaw = cells[4];
          kindRaw = cells[5] || 'MC';
          countRaw = cells[6] || '1';
          ptsRaw = cells[7] || '0.25';
        } else {
          lessonRaw = cells[1] || cells[0];
          outcomeRaw = cells[2] || '';
          levelRaw = cells[3] || 'Biết';
          kindRaw = cells[4] || 'MC';
          countRaw = cells[5] || '1';
          ptsRaw = cells[6] || '0.25';
        }
      } else if (cells.length >= 3) {
        lessonRaw = cells[0];
        outcomeRaw = cells[1];
        levelRaw = cells[2] || 'Biết';
        if (cells[3]) kindRaw = cells[3];
      }

      if (!lessonRaw) continue;

      let lessonCode = '';
      const mCode = lessonRaw.match(/^(?:Bài|Chủ\s*đề)\s*([0-9]+[a-zA-Z]?)/i);
      if (mCode) lessonCode = 'B' + mCode[1];
      else if (/KTGK1/i.test(lessonRaw)) lessonCode = 'KTGK1';
      else if (/KTCK1/i.test(lessonRaw)) lessonCode = 'KTCK1';
      else lessonCode = 'B' + (lessonsMap.size + 1);

      const cleanLessonName = lessonRaw.replace(/^(?:Bài|Chủ\s*đề)\s*[0-9]+[a-zA-Z]?[:.]?\s*/i, '').trim() || lessonRaw;

      if (!lessonsMap.has(lessonCode)) {
        lessonsMap.set(lessonCode, {
          lesson_code: lessonCode,
          title: cleanLessonName,
          topic: topicRaw
        });
      }

      let stdLevel = 'Biết';
      const lLower = levelRaw.toLowerCase();
      if (lLower.includes('cao')) stdLevel = 'Vận dụng cao';
      else if (lLower.includes('vận dụng') || lLower.includes('van dung')) stdLevel = 'Vận dụng';
      else if (lLower.includes('hiểu') || lLower.includes('hieu')) stdLevel = 'Hiểu';

      let stdKind = 'MC';
      const kUpper = kindRaw.toUpperCase();
      if (kUpper.includes('YN') || /ĐÚNG\/SAI|ĐÚNG SAI/i.test(kindRaw)) stdKind = 'YN';
      else if (kUpper.includes('SHORT') || /TRẢ LỜI NGẮN|NGẮN/i.test(kindRaw)) stdKind = 'SHORT';
      else if (kUpper.includes('ES') || /TỰ LUẬN|TL/i.test(kindRaw)) stdKind = 'ES';

      reqCount++;
      const reqId = 'R' + reqCount;
      requirements.push({
        id: reqId,
        lesson_code: lessonCode,
        level: stdLevel,
        text: outcomeRaw || 'Yêu cầu cần đạt chuẩn theo chương trình môn học.',
        ppct_outcome_index: 0,
        competency: 'NLa'
      });

      const numSlots = Math.max(1, parseInt(countRaw, 10) || 1);
      const pts = parseFloat(String(ptsRaw).replace(',', '.')) || (stdKind === 'ES' ? 1.0 : 0.25);

      for (let sIdx = 0; sIdx < numSlots; sIdx++) {
        slotCount++;
        const slotId = 'S' + slotCount;
        slots.push({
          id: slotId,
          kind: stdKind,
          number: slotCount,
          parts: [{
            id: 'P' + slotCount,
            label: '',
            requirement_id: reqId,
            points: pts,
            indicator: ''
          }],
          scoring: { mode: 'sum_parts' }
        });
      }
    }

    if (!slots.length) {
      const l1 = { lesson_code: 'B1', title: 'Bài học 1', topic: 'Chương trình GDPT' };
      lessonsMap.set('B1', l1);
      requirements.push({ id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết kiến thức trọng tâm.', ppct_outcome_index: 0, competency: 'NLa' });
      slots.push({ id: 'S1', kind: 'MC', number: 1, parts: [{ id: 'P1', label: '', requirement_id: 'R1', points: 10, indicator: '' }], scoring: { mode: 'sum_parts' } });
    }

    const profile = grade >= 10 ? 'THPT' : 'THCS';
    const totalPoints = slots.reduce((acc, s) => acc + (s.parts || []).reduce((pAcc, p) => pAcc + (Number(p.points) || 0), 0), 0) || 10;

    return {
      format: 'asian-school-matrix',
      schema_version: 1,
      matrix: {
        id: 'MX-' + grade + '-' + examType + '-' + Date.now().toString(36),
        family_id: 'FAM-' + grade + '-' + examType,
        version: 1,
        revision: 0,
        status: 'draft',
        mode: 'authored',
        profile,
        grade,
        school_year: '2026-2027',
        exam_type: examType,
        duration: 45,
        title,
        owner_name: 'Giáo viên phụ trách',
        campus: 'Cao Thắng',
        total_points: Math.round(totalPoints * 10) / 10,
        lessons: Array.from(lessonsMap.values()),
        requirements,
        slots,
        indicator_catalog: [],
        source: null,
        reconciliation: { confirmed: true, issues: [] },
        audit: []
      }
    };
  }

  function downloadMatrixJsonSample(grade = 9) {
    const g = Number(grade) || 9;
    const sample = {
      format: 'asian-school-matrix',
      schema_version: 1,
      matrix: {
        profile: g >= 10 ? 'THPT' : 'THCS',
        grade: g,
        exam_type: 'GK1',
        duration: 45,
        school_year: '2026-2027',
        title: `Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn Tin học Khối ${g}`,
        owner_name: 'Tổ Tin học Á Châu',
        campus: 'Cao Thắng',
        total_points: 10,
        lessons: [
          { lesson_code: 'B1', title: 'Thế giới kĩ thuật số', topic: 'Chủ đề 1: Máy tính và cộng đồng' },
          { lesson_code: 'B2', title: 'Thông tin trong giải quyết vấn đề', topic: 'Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin' }
        ],
        requirements: [
          { id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết được một số thiết bị số thông dụng.', ppct_outcome_index: 0, competency: 'NLa' },
          { id: 'R2', lesson_code: 'B1', level: 'Hiểu', text: 'Giải thích được vai trò của thiết bị số trong đời sống và học tập.', ppct_outcome_index: 1, competency: 'NLa' },
          { id: 'R3', lesson_code: 'B2', level: 'Vận dụng', text: 'Vận dụng được kiến thức để tìm kiếm và đánh giá chất lượng thông tin.', ppct_outcome_index: 0, competency: 'NLb' }
        ],
        slots: [
          { id: 'S1', kind: 'MC', number: 1, parts: [{ id: 'P1', label: '', requirement_id: 'R1', points: 0.25, indicator: '' }], scoring: { mode: 'sum_parts' } },
          { id: 'S2', kind: 'MC', number: 2, parts: [{ id: 'P2', label: '', requirement_id: 'R2', points: 0.25, indicator: '' }], scoring: { mode: 'sum_parts' } },
          { id: 'S3', kind: 'ES', number: 3, parts: [{ id: 'P3', label: '', requirement_id: 'R3', points: 1.0, indicator: '' }], scoring: { mode: 'sum_parts' } }
        ]
      }
    };
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Mau_Ma_tran_Tin_${g}_2026-2027.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadMatrixMdSample(grade = 9) {
    const g = Number(grade) || 9;
    const sampleMd = `# MA TRẬN & ĐẶC TẢ ĐỀ KIỂM TRA GIỮA HỌC KỲ 1
Môn: Tin học - Khối: ${g}
Thời gian: 45 phút - Năm học: 2026-2027

| TT | Chủ đề | Bài học | Yêu cầu cần đạt | Mức độ | Dạng câu | Số câu | Điểm |
|---|---|---|---|---|---|---|---|
| 1 | Chủ đề 1: Máy tính và cộng đồng | Bài 1: Thế giới kĩ thuật số | Nhận biết được một số thiết bị số thông dụng. | Biết | MC | 2 | 0.5 |
| 2 | Chủ đề 1: Máy tính và cộng đồng | Bài 1: Thế giới kĩ thuật số | Giải thích được vai trò của thiết bị số trong đời sống. | Hiểu | MC | 2 | 0.5 |
| 3 | Chủ đề 2: Tổ chức lưu trữ | Bài 2: Thông tin trong giải quyết vấn đề | Giải thích được sự cần thiết phải đánh giá thông tin. | Hiểu | MC | 2 | 0.5 |
| 4 | Chủ đề 2: Tổ chức lưu trữ | Bài 2: Thông tin trong giải quyết vấn đề | Vận dụng được kiến thức để tìm kiếm và đánh giá thông tin. | Vận dụng | ES | 1 | 1.0 |
`;
    const blob = new Blob([sampleMd], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Mau_Ma_tran_Tin_${g}_2026-2027.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function copyMatrixAiPrompt(grade = 9) {
    const g = Number(grade) || 9;
    const prompt = `Bạn là chuyên gia khảo thí môn Tin học phổ thông GDPT 2018 tại Trường Quốc tế Á Châu.
Hãy giúp tôi chuyển bảng Ma trận & Đặc tả đề kiểm tra môn Tin học Khối ${g} sang định dạng bảng Markdown (.md) chuẩn để nạp vào hệ thống ExamMatrix Studio:

Yêu cầu cấu trúc:
1. Dòng đầu: # MA TRẬN & ĐẶC TẢ KIỂM TRA GIỮA HỌC KỲ 1 (hoặc CUỐI HỌC KỲ)
2. Thông tin phụ: Môn: Tin học - Khối: ${g} - Thời gian: 45 phút
3. Bảng Markdown gồm chính xác các cột:
| TT | Chủ đề | Bài học | Yêu cầu cần đạt | Mức độ | Dạng câu | Số câu | Điểm |
4. Quy ước chuẩn:
- Cột "Mức độ": Ghi rõ một trong 4 mức: Biết, Hiểu, Vận dụng, Vận dụng cao.
- Cột "Dạng câu": Ghi rõ: MC (Trắc nghiệm nhiều lựa chọn 4 phương án), YN (Trắc nghiệm Đúng/Sai 4 ý a,b,c,d), SHORT (Trả lời ngắn) hoặc ES (Tự luận).
- Tổng điểm các dòng cộng lại bằng đúng 10.0 điểm.
5. Chỉ xuất trực tiếp nội dung Markdown, không kèm lời bình.`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prompt).then(() => {
        alert('Đã chép Prompt AI vào bộ nhớ tạm! Thầy/Cô dán vào ChatGPT hoặc Gemini để tạo ma trận Markdown tức thì.');
      }).catch(() => {
        window.prompt('Sao chép Prompt AI dưới đây:', prompt);
      });
    } else {
      window.prompt('Sao chép Prompt AI dưới đây:', prompt);
    }
  }

  function renderImport(){
    const i=ui.importing;
    qs('#mx-work').innerHTML=`<section class="card">
      <p class="eyebrow">GIỮ NGUYÊN BẢN CỦA GIÁO VIÊN PHỤ TRÁCH</p>
      <h2>Nhận ma trận & đặc tả (JSON, Markdown hoặc Word)</h2>
      <p>Khuyên dùng <strong>JSON</strong> hoặc <strong>Markdown (.md)</strong> để nạp tức thì, chính xác 100% và không bị phụ thuộc định dạng ngầm. Vẫn hỗ trợ tệp Word (.docx) theo cấu trúc mẫu trường.</p>
      <div style="display:flex;gap:10px;margin:10px 0 14px;flex-wrap:wrap">
        <button type="button" class="button quiet" id="mx-download-json-sample" style="color:#0267b1;padding:4px 8px;font-size:12px;font-weight:600">📥 Tải mẫu Ma trận (JSON)</button>
        <button type="button" class="button quiet" id="mx-download-md-sample" style="color:#0267b1;padding:4px 8px;font-size:12px;font-weight:600">📝 Tải mẫu Ma trận (Markdown)</button>
        <button type="button" class="button quiet" id="mx-copy-prompt" style="color:#0267b1;padding:4px 8px;font-size:12px;font-weight:600">📋 Chép Prompt AI tạo Ma trận</button>
      </div>
      <div class="form-grid">
        <div class="field"><label for="mx-import-grade">Khối lớp</label><select id="mx-import-grade">${grades().map(g=>opt(g,'Khối '+g,i.grade===g)).join('')}</select></div>
        <div class="field span2"><label for="mx-file">Chọn tệp Markdown (.md), JSON hoặc Word (.docx)</label><input type="file" id="mx-file" accept=".docx,.json,.md,.txt"></div>
      </div>
      <div id="mx-import-result">
        ${i.package?`<p class="callout">${E(packageSummary(i.package))}</p>`:i.candidate?`<p class="callout">Đã nhận dạng ${E(i.candidate.profile||'THCS')} · Khối ${i.grade} · ${i.candidate.slots?.length||0} vị trí câu hỏi. Đạt chuẩn cấu trúc ma trận & đặc tả.</p><ul class="mx-errors">${(i.issues||[]).map(x=>`<li>${E(x.message||x)}</li>`).join('')}</ul><p class="muted">Các chỉ báo và ánh xạ sẽ được mở ở màn hình đối chiếu. Nội dung gốc được bảo toàn.</p>`:'<p class="muted">Hỗ trợ tệp Markdown (.md), gói JSON chuẩn và Word (.docx). Bấm nút tải mẫu ở trên để xem định dạng chuẩn.</p>'}
        ${i.package||i.candidate?'<button class="primary" data-action="accept-import">Lưu bản nhận để đối chiếu</button>':''}
      </div>
    </section>`;

    const btnJson = qs('#mx-download-json-sample');
    if (btnJson) btnJson.onclick = () => downloadMatrixJsonSample(Number(qs('#mx-import-grade').value || 9));
    const btnMd = qs('#mx-download-md-sample');
    if (btnMd) btnMd.onclick = () => downloadMatrixMdSample(Number(qs('#mx-import-grade').value || 9));
    const btnPrompt = qs('#mx-copy-prompt');
    if (btnPrompt) btnPrompt.onclick = () => copyMatrixAiPrompt(Number(qs('#mx-import-grade').value || 9));
  }

  async function readImport(file){
    if(!file)return;
    const grade=Number(qs('#mx-import-grade').value);
    await run(async()=>{
      const ext = file.name.toLowerCase().split('.').pop();
      if(ext === 'json') {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.format === 'asian-school-matrix' || data.matrix) {
          ui.importing = { grade: Number(data.matrix?.grade || grade), package: data };
        } else {
          ui.importing = { grade, package: { format: 'asian-school-matrix', schema_version: 1, matrix: data } };
        }
      } else if (ext === 'md' || ext === 'txt') {
        const text = await file.text();
        const parsed = parseMatrixFromMarkdown(text, grade);
        if (!parsed || !parsed.matrix) throw new Error('Không đọc được cấu trúc ma trận từ tệp Markdown.');
        ui.importing = {
          grade: parsed.matrix.grade || grade,
          candidate: parsed.matrix,
          package: parsed,
          filename: file.name
        };
      } else {
        if(file.size>8*1024*1024) throw new Error('Word phải nhỏ hơn 8 MB.');
        const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
        const result=await ui.ctx.request('/api/matrices/inspect-docx',{filename:file.name,grade,content_base64:base64});
        ui.importing={...result,grade,filename:file.name,base64};
      }
      renderImport();
    });
  }
  function renderGeneration(){const g=ui.generation,m=g.matrix;const revisions=(ui.ctx.revisions||[]).filter(r=>r.grade===m.grade);qs('#mx-work').innerHTML=`<section class="card"><p class="eyebrow">ĐỀ RIÊNG THEO MA TRẬN ĐÃ KHÓA</p><h2>${E(m.title)} · V${m.version}</h2><p>Phân bố và điểm giữ theo ma trận chung. Chọn câu và xác nhận chỉ báo cho từng vị trí.</p><div class="form-grid"><div class="field span2"><label for="mx-exam-title">Tên đề riêng</label><input id="mx-exam-title" value="${E(periods[m.exam_type]+' · '+subject(m)+' '+m.grade)}"></div><div class="field"><label for="mx-exam-campus">Cơ sở ra đề</label><input id="mx-exam-campus" value="${generic()?'':'Cao Thắng'}"></div><div class="field"><label for="mx-exam-code">Mã đề</label><input id="mx-exam-code" value="101"></div><div class="field"><label for="mx-exam-seed">Mã xáo trộn phương án</label><input id="mx-exam-seed" value="2026"></div><div class="field full"><label for="mx-exam-revision">Phiên bản đề cương</label><select id="mx-exam-revision">${opt('','Chọn đề cương đã lưu',true)}${revisions.map(r=>opt(r.id,r.title,false)).join('')}</select></div></div><div class="actions"><button data-action="suggest">Gợi ý chọn câu không trùng</button><span id="mx-coverage"></span></div>
    ${g.slots.map(entry=>{const s=entry.slot;return `<article class="mx-exam-slot"><h3>${E(NAMEShort(s.kind))} ${s.number} · ${s.parts.reduce((n,p)=>n+Number(p.points),0)} điểm</h3><div class="field"><label for="mx-choice-${E(s.id)}">Câu cho vị trí ${E(s.id)}</label><select id="mx-choice-${E(s.id)}" data-choice="${E(s.id)}">${opt('','Chọn câu phù hợp',true)}${entry.candidates.map(q=>opt(q.id,(q.recently_used?.length?'⚠ Vừa dùng · ':'')+q.id+' · '+q.question.slice(0,180),false)).join('')}</select></div><div id="mx-choice-detail-${E(s.id)}" class="mx-choice-detail"></div>${entry.requirements.map((r,i)=>`<label class="mx-checkbox"><input type="checkbox" data-review-slot="${E(s.id)}" value="${E(s.parts[i].id)}">Đã đối chiếu ${E(s.parts[i].label||'câu này')}: ${E(r.text)}</label>`).join('')}${!entry.candidates.length?'<p class="mx-bad">Chưa có câu khớp bài, dạng, mức độ và YCCĐ nguồn. Cần bổ sung ngân hàng; không bù sang ô khác.</p>':''}</article>`;}).join('')}
    <button class="primary" data-action="generate">Tạo và lưu đề riêng</button><div id="mx-created-exam"></div></section>`;const values=g.formValues||{};ui.container.querySelectorAll('[id^=mx-exam-],[data-choice],[data-review-slot]').forEach(el=>{const key=el.dataset.reviewSlot?'review:'+el.dataset.reviewSlot+':'+el.value:el.id;if(Object.prototype.hasOwnProperty.call(values,key)){if(el.type==='checkbox')el.checked=values[key];else el.value=values[key];}});g.slots.forEach(e=>showChoice(e.slot.id));coverage();}
  function showChoice(id){const entry=ui.generation.slots.find(e=>e.slot.id===id);const q=entry.candidates.find(q=>q.id===qs('#mx-choice-'+id).value);qs('#mx-choice-detail-'+id).innerHTML=q?`<p class="question-text">${E(q.question)}</p>${q.options?'<ol type="A">'+q.options.map((o,i)=>`<li>${E(o)}${i===q.correct?' <strong>— đáp án đúng</strong>':''}</li>`).join('')+'</ol>':q.rubric?'<ul>'+q.rubric.map(c=>`<li>${E(c.criterion)}</li>`).join('')+'</ul>':''}<p class="small muted">YCCĐ nguồn: ${E(q.learning_outcome)}</p>${q.recently_used?.length?`<p class="mx-bad">⚠ Câu đã có trong đề đã phát hành gần đây: ${q.recently_used.map(u=>`${E(u.title||u.exam_id)} (${E(String(u.published_at||'').slice(0,10))})`).join('; ')}. Chỉ là cảnh báo; nên cân nhắc chọn câu khác.</p>`:''}`:'';}
  function coverage(){if(!ui.generation||!qs('#mx-coverage'))return;const rev=(ui.ctx.revisions||[]).find(r=>r.id===qs('#mx-exam-revision').value),hashes=new Set((rev?.questions||[]).map(q=>q.content_hash));let count=0,matched=0;for(const e of ui.generation.slots){const q=e.candidates.find(q=>q.id===qs('#mx-choice-'+e.slot.id).value);if(q){count++;if(hashes.has(q.content_hash))matched++;}}qs('#mx-coverage').textContent=`Đã chọn ${count}/${ui.generation.slots.length} câu · Khớp nội dung đề cương ${matched} câu. Máy chủ sẽ kiểm tra lại khi tạo đề.`;}
  function suggest(){const rev=(ui.ctx.revisions||[]).find(r=>r.id===qs('#mx-exam-revision').value),hashes=new Set((rev?.questions||[]).map(q=>q.content_hash));const used=new Set();for(const e of ui.generation.slots){const pool=e.candidates.slice().sort((a,b)=>Number(hashes.has(b.content_hash))-Number(hashes.has(a.content_hash)));const q=pool.find(q=>!used.has(q.id));qs('#mx-choice-'+e.slot.id).value=q?.id||'';if(q)used.add(q.id);ui.container.querySelectorAll('[data-review-slot]').forEach(c=>{if(c.dataset.reviewSlot===e.slot.id)c.checked=false;});showChoice(e.slot.id);}captureGeneration();coverage();message('Đã gợi ý câu. Thầy cần xem nội dung và đánh dấu đối chiếu từng chỉ báo trước khi lưu đề.');}
  async function generate(){const g=ui.generation;const placements=g.slots.map(e=>({slot_id:e.slot.id,question_id:qs('#mx-choice-'+e.slot.id).value,reviewed_part_ids:[...ui.container.querySelectorAll('[data-review-slot]')].filter(x=>x.dataset.reviewSlot===e.slot.id&&x.checked).map(x=>x.value)}));const result=await ui.ctx.request('/api/exams/from-matrix',{matrix_id:g.matrix.id,revision_id:qs('#mx-exam-revision').value,title:qs('#mx-exam-title').value,campus:qs('#mx-exam-campus').value,exam_code:qs('#mx-exam-code').value,seed:qs('#mx-exam-seed').value,placements});const e=result.exam,base='/api/exams/'+encodeURIComponent(e.id)+'/export';qs('#mx-created-exam').innerHTML=`<div class="callout"><h3>Đã lưu đề ${E(e.exam_code)} · ${E(e.campus)}</h3><p>${e.question_count} câu · 10 điểm · Khớp đề cương ${e.revision_match_count}/${e.question_count} câu · Ma trận V${e.matrix_version}</p><div class="actions"><button type="button" class="primary" data-view-exam="${E(e.id)}" data-mode="student">Xem đề học sinh</button><button type="button" data-view-exam="${E(e.id)}" data-mode="answers">Xem đáp án & HDC</button><a class="button" href="${base}?format=docx&answers=0">Word học sinh</a><a class="button" href="${base}?format=docx&answers=1">Word đáp án</a></div></div>`;ui.ctx.onExamCreated?.(e);message('Đã tạo đề riêng và lưu phiên bản ma trận dùng chung cùng đề.');}
  const api={shortfallHtml,mount,formatRefs,filterRecords,visibleActions,escapeHtml,packageSummary,effectiveKinds,setAllowedKinds,ynTable,setYnCoefficient,requirementLevelOptions,parseMatrixFromMarkdown,downloadMatrixJsonSample,downloadMatrixMdSample,copyMatrixAiPrompt};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MatrixUI=api;
})(typeof window!=='undefined'?window:globalThis);
