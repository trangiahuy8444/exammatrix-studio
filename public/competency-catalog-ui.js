/* Nạp danh mục theo môn; chỉ áp dụng vào bản nháp khi giáo viên chọn. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.BankCompetencyCatalogUI=api;})(typeof window!=='undefined'?window:globalThis,function(root){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const norm=x=>String(x||'').normalize('NFC').trim().toLowerCase();
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function applyCatalog(matrix,catalog,subject){
  if(!matrix||['locked','archived'].includes(matrix.status)||matrix.matrix_locked||matrix.spec_locked||matrix.mode==='received')throw new Error('Hãy tạo phiên bản nháp có thể biên soạn trước khi áp dụng danh mục.');
  if(!catalog||norm(catalog.subject_name)!==norm(subject)||norm(matrix.subject_name||subject)!==norm(subject))throw new Error('Danh mục và ma trận phải thuộc đúng môn đang chọn.');
  return {...copy(matrix),competency_catalog:copy(catalog.competencies),indicator_catalog:copy(catalog.indicators),catalog_revision:catalog.revision};
 }
 function table(c){
  const names=new Map(c.competencies.map(x=>[x.code,x.name]));
  return `<div class="table-wrap"><table><thead><tr><th>Mã năng lực</th><th>Tên thành phần năng lực</th><th>Mã chỉ báo</th><th>Mô tả chỉ báo</th></tr></thead><tbody>${c.indicators.map(x=>`<tr><td>${escape(x.competency)}</td><td>${escape(names.get(x.competency))}</td><td>${escape(x.code)}</td><td>${escape(x.text)}</td></tr>`).join('')}</tbody></table></div>`;
 }
 async function mount(host,options){
  const subject=options.subject;
  let catalog=null,preview=null,busy=false,loadFailed=false;
  const catalogLib=root.BankCompetencyCatalog;
  const presets=catalogLib&&typeof catalogLib.listSubjectPresets==='function'?catalogLib.listSubjectPresets():[];
  const matchedPreset=catalogLib&&typeof catalogLib.presetCatalogForSubject==='function'?catalogLib.presetCatalogForSubject(subject):null;
  const presetSelectHtml=presets.length?`<div class="form-grid" style="margin:8px 0"><div class="field"><label for="mx-catalog-preset-select">Bộ mẫu Thành phần năng lực – Chỉ báo GDPT 2018 (TT 32/2018 &amp; CV 6569)</label><select id="mx-catalog-preset-select">${presets.map(p=>`<option value="${escape(p.key)}"${matchedPreset&&matchedPreset.key===p.key?' selected':''}>${escape(p.label)} (${p.competenciesCount} NL · ${p.indicatorsCount} chỉ báo)</option>`).join('')}</select></div><div class="field" style="display:flex;align-items:flex-end"><button type="button" class="primary" data-catalog-action="load-preset">Nạp bộ mẫu GDPT 2018</button></div></div>`:'';
  host.innerHTML=`<details class="card" id="mx-catalog-panel"><summary style="cursor:pointer;font-weight:700">Danh mục năng lực & chỉ báo · ${escape(subject)}</summary><p>Nạp danh mục của môn đang chọn, xem trước rồi lưu. Mỗi ma trận giữ bản sao riêng; cập nhật danh mục không đổi hồ sơ đã khóa.</p><p class="small muted">Bảng gồm 4 cột: Mã năng lực · Tên thành phần năng lực · Mã chỉ báo · Mô tả chỉ báo. Dùng bộ mẫu tham khảo GDPT 2018 bên dưới hoặc tải bảng riêng của tổ bộ môn.</p>${presetSelectHtml}<div class="field"><label for="mx-catalog-file">Chọn tệp Excel (.xlsx), CSV hoặc TSV</label><input id="mx-catalog-file" type="file" accept=".xlsx,.csv,.tsv,.txt"></div><div class="field"><label for="mx-catalog-text">Hoặc dán bảng từ Word/Excel (gồm hàng tiêu đề)</label><textarea id="mx-catalog-text" rows="5" placeholder="Mã năng lực&#9;Tên thành phần năng lực&#9;Mã chỉ báo&#9;Mô tả chỉ báo"></textarea></div><div class="actions"><button type="button" data-catalog-action="preview">Xem trước bảng đã dán</button><button type="button" data-catalog-action="sample">Tải mẫu CSV ${matchedPreset?escape(subject):'minh họa'}</button></div><div id="mx-catalog-preview" aria-live="polite"></div><div id="mx-catalog-library" aria-live="polite">Đang nạp danh mục đã lưu…</div><div id="mx-catalog-message" role="status"></div></details>`;
  const $=s=>host.querySelector(s),notify=(s,bad=false)=>{$('#mx-catalog-message').textContent=s;options.notify?.(s,bad);};
  function controls(){host.querySelectorAll('button').forEach(b=>b.disabled=busy);const save=$('[data-catalog-action="save"]');if(save)save.disabled=busy||loadFailed||!preview?.valid;}
  function library(){const m=options.matrix();$('#mx-catalog-library').innerHTML=catalog?`<h3>Danh mục đã lưu · phiên bản ${catalog.revision}</h3><p>${catalog.competencies.length} thành phần năng lực · ${catalog.indicators.length} chỉ báo. ${m?.catalog_revision?'Ma trận đang dùng bản '+escape(m.catalog_revision)+'.':''}</p><details><summary>Xem danh mục đã lưu</summary>${table(catalog)}</details>${m?'<button type="button" data-catalog-action="apply">Áp dụng danh mục đã lưu vào ma trận đang mở</button><p class="small muted">Sau khi áp dụng, chọn lại năng lực cho từng YCCĐ và mã chỉ báo cho từng câu/ý. Nội dung và điểm câu được giữ nguyên.</p>':'<p>Mở ma trận nháp, sau đó áp dụng danh mục tại đây.</p>'}`:'<p>Môn này chưa có danh mục đã lưu.</p>';controls();}
  function showPreview(report){preview=report;$('#mx-catalog-preview').innerHTML=`<h3>Xem trước · chưa lưu</h3>${report.valid?`<p>${report.catalog.competencies.length} thành phần năng lực · ${report.catalog.indicators.length} chỉ báo.</p>${table(report.catalog)}<p>Lưu sẽ thay thế danh mục dùng cho các lần áp dụng tiếp theo của môn ${escape(subject)}.</p><button type="button" data-catalog-action="save">Lưu danh mục cho môn ${escape(subject)}</button>`:`<ul class="mx-errors">${report.errors.map(e=>`<li>${e.row?'Dòng '+escape(e.row)+': ':''}${escape(e.message)}</li>`).join('')}</ul>`}`;controls();}
  async function act(work){if(busy)return;busy=true;controls();try{await work();}catch(e){notify(e.message,true);}finally{busy=false;controls();}}
  host.addEventListener('input',e=>{if(e.target.id==='mx-catalog-text'){preview=null;$('#mx-catalog-preview').innerHTML='';}});
  host.addEventListener('change',e=>{if(e.target.id==='mx-catalog-file')act(async()=>{preview=null;$('#mx-catalog-preview').innerHTML='';const file=e.target.files[0];if(file)showPreview(await root.BankCompetencyCatalog.readFile(file));});});
  host.addEventListener('click',e=>{const button=e.target.closest('[data-catalog-action]');if(!button)return;e.preventDefault();e.stopPropagation();act(async()=>{
   const action=button.dataset.catalogAction;
   if(action==='preview')showPreview(root.BankCompetencyCatalog.parseText($('#mx-catalog-text').value));
   if(action==='load-preset'){
    const presetKey=$('#mx-catalog-preset-select')?.value||subject;
    const preset=catalogLib&&typeof catalogLib.presetCatalogForSubject==='function'?catalogLib.presetCatalogForSubject(presetKey):null;
    if(!preset)throw new Error('Không tìm thấy bộ mẫu GDPT 2018 cho mục đã chọn.');
    showPreview(root.BankCompetencyCatalog.validate({competencies:preset.competencies,indicators:preset.indicators}));
    notify('Đã nạp xem trước bộ mẫu '+preset.label+'. Thầy/Cô có thể bấm Lưu danh mục để dùng.');
   }
   if(action==='save'){
    if(!preview?.valid||loadFailed)throw new Error('Cần xem trước bảng hợp lệ và nạp được danh mục hiện tại trước khi lưu.');
    const response=await options.request('/api/matrices/catalog/save',{catalog:preview.catalog,expected_revision:catalog?.revision||0});catalog=response.catalog;preview=null;$('#mx-catalog-preview').innerHTML='';library();notify('Đã lưu danh mục cho môn '+subject+'. Ma trận hiện có được giữ nguyên.');
   }
   if(action==='apply'){const next=applyCatalog(options.matrix(),catalog,subject);options.apply(next);notify('Đã áp dụng danh mục vào bản nháp. Hãy chọn năng lực cho YCCĐ và chỉ báo cho từng câu, rồi lưu ma trận.');}
   if(action==='sample'){
    const preset=(catalogLib&&typeof catalogLib.presetCatalogForSubject==='function'?catalogLib.presetCatalogForSubject($('#mx-catalog-preset-select')?.value):null)||matchedPreset;
    const text=(preset&&catalogLib&&typeof catalogLib.toCsv==='function')?catalogLib.toCsv(preset):'\ufeffMã năng lực,Tên thành phần năng lực,Mã chỉ báo,Mô tả chỉ báo\r\nMINH_HOA,Thành phần năng lực minh họa,MINH_HOA.1,Thay dòng minh họa này bằng nội dung tài liệu bộ môn\r\n';
    const fileSlug=preset?preset.key:'minh_hoa';
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`MAU_DANH_MUC_NANG_LUC_${fileSlug}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }
  });});
  try{const response=await options.request('/api/matrices/catalog');catalog=response.catalog||null;library();}catch(e){loadFailed=true;$('#mx-catalog-library').textContent='Chưa nạp được danh mục. Đóng và mở lại màn hình để thử lại.';notify(e.message,true);controls();}
 }
 return {applyCatalog,mount};
});
