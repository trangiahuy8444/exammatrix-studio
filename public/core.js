(function(root){
  'use strict';
  const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  const jsonHeaders=token=>token?{'Content-Type':'application/json','X-CSRFToken':token}:{'Content-Type':'application/json'};
  const formatStoragePrefix=scope=>'tin_doc_fmt_v1:'+(scope?encodeURIComponent(scope)+':':'');
  function courseLessons(stored,context,grade,subject,samples={}){
    if(context?.curriculum_id){
      if(subject!==context.subject_name)return [];
      return stored.filter(l=>(!grade||Number(l.grade)===Number(grade))&&contextGrades(context).includes(Number(l.grade)));
    }
    const own=stored.filter(l=>(!grade||Number(l.grade)===Number(grade))&&
      (l.subject_name===subject||(!l.subject_name&&subject==='Tin học')));
    return own.length?own:(samples[subject]?.[Number(grade)]||[]);
  }
  function filterQuestions(questions,f={}){
    const needle=normalize(f.search).trim();
    return questions.filter(q=>{
      if(f.grade && String(q.grade)!==String(f.grade))return false;
      if(f.lesson && q.lesson_code!==f.lesson)return false;
      if(f.type && q.type!==f.type)return false;
      if(f.level && q.level!==f.level)return false;
      if(f.status==='active' && q.review_status==='archived')return false;
      if(f.status && !['active','all'].includes(f.status) && q.review_status!==f.status)return false;
      return !needle || normalize([q.id,q.question,q.lesson_name,q.learning_outcome,...(q.options||[])].join(' ')).includes(needle);
    });
  }
  function blueprintSummary(rows){return {count:rows.reduce((n,r)=>n+Number(r.count||0),0),points:Math.round(rows.reduce((n,r)=>n+Number(r.count||0)*Number(r.points_per_question||0),0)*10000)/10000};}
  function sourceTemplateRequired(grade,period){return [8,10].includes(Number(grade))&&['GK1','CK1','GK2','CK2'].includes(period);}
  function templateBlocked(t){return Boolean(t?.unsupported);}
  function revisionIds(questions,ids,grade){const selected=new Set(ids);return questions.filter(q=>selected.has(q.id)&&Number(q.grade)===Number(grade)&&q.review_status!=='archived').map(q=>q.id);}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  const DocFormatter={
    storagePrefix:formatStoragePrefix(typeof document!=='undefined'?document.querySelector('meta[name="workspace-scope"]')?.content:''),
    loadSaved(key){
      if(!key||typeof window==='undefined')return null;
      try{return window.localStorage.getItem(this.storagePrefix+key);}catch{return null;}
    },
    saveHtml(key,html){
      if(!key||typeof window==='undefined')return false;
      try{window.localStorage.setItem(this.storagePrefix+key,html);return true;}catch{return false;}
    },
    clearSaved(key){
      if(!key||typeof window==='undefined')return;
      try{window.localStorage.removeItem(this.storagePrefix+key);}catch{}
    },
    toolbarHtml(key,editing=false){
      const hasSaved=Boolean(this.loadSaved(key));
      return `<div class="fmt-bar" data-fmt-bar>
        <div class="fmt-row">
          <button type="button" class="fmt-toggle ${editing?'primary':''}" data-fmt-cmd="toggle-edit" title="Bật/tắt chế độ nhấp chuột vào văn bản hoặc ô bảng để sửa nội dung và căn chỉnh trực tiếp">
            ${editing?'✏️ Đang bật sửa trực tiếp (Bấm để khóa)':'✏️ Chỉnh sửa nội dung & định dạng'}
          </button>
          ${hasSaved?'<span class="badge approved" data-fmt-saved-badge>Đã lưu bản chỉnh tay</span>':''}
          <div class="fmt-group" ${editing?'':'hidden'} data-fmt-tools>
            <button type="button" data-fmt-exec="bold" title="In đậm (Cmd+B)"><strong>B</strong></button>
            <button type="button" data-fmt-exec="italic" title="In nghiêng (Cmd+I)"><em>I</em></button>
            <button type="button" data-fmt-exec="underline" title="Gạch chân (Cmd+U)"><u>U</u></button>
            <span class="fmt-sep"></span>
            <button type="button" data-fmt-align="left" title="Căn trái ô / đoạn đang chọn">⬅ Trái</button>
            <button type="button" data-fmt-align="center" title="Căn giữa (align center) ô / đoạn đang chọn">↔ Giữa</button>
            <button type="button" data-fmt-align="right" title="Căn phải ô / đoạn đang chọn">➡ Phải</button>
            <button type="button" data-fmt-align="justify" title="Căn đều 2 bên">☰ Đều</button>
            <button type="button" data-fmt-cmd="auto-center-table" title="Chuẩn hóa căn giữa tiêu đề, cột TT/STT và các cột điểm/số lượng trong toàn bộ bảng">⊞ Chuẩn căn giữa bảng</button>
            <span class="fmt-sep"></span>
            <button type="button" data-fmt-valign="top" title="Căn lề trên ô bảng">⬆ Trên</button>
            <button type="button" data-fmt-valign="middle" title="Căn chính giữa ô bảng theo chiều dọc">⇕ Giữa ô</button>
            <button type="button" data-fmt-valign="bottom" title="Căn lề dưới ô bảng">⬇ Dưới</button>
            <span class="fmt-sep"></span>
            <label class="fmt-mini-label">Cỡ chữ
              <select data-fmt-fontsize aria-label="Cỡ chữ">
                <option value="">Mặc định</option>
                <option value="11pt">11pt</option>
                <option value="12pt">12pt</option>
                <option value="13pt">13pt</option>
                <option value="14pt">14pt</option>
                <option value="16pt">16pt</option>
              </select>
            </label>
            <label class="fmt-mini-label">Giãn dòng
              <select data-fmt-lineheight aria-label="Giãn dòng">
                <option value="">Mặc định</option>
                <option value="1.2">1.2</option>
                <option value="1.35">1.35</option>
                <option value="1.5">1.5</option>
                <option value="1.65">1.65</option>
              </select>
            </label>
            <span class="fmt-sep"></span>
            <button type="button" data-fmt-col="-1.5" title="Thu hẹp cột bảng đang đặt con trỏ (-1.5%)">Cột −</button>
            <button type="button" data-fmt-col="1.5" title="Mở rộng cột bảng đang đặt con trỏ (+1.5%)">Cột +</button>
            <button type="button" data-fmt-cmd="row-add" title="Chèn thêm 1 dòng ngay bên dưới ô bảng đang chọn">+ Dòng</button>
            <button type="button" data-fmt-cmd="row-del" title="Xóa dòng bảng đang đặt con trỏ">× Xóa dòng</button>
            <label class="fmt-mini-label">Nền ô
              <select data-fmt-bg aria-label="Màu nền ô">
                <option value="">Đổi màu ô…</option>
                <option value="#ffffff">Trắng</option>
                <option value="#eef4fa">Xanh tiêu đề</option>
                <option value="#fff9db">Vàng nhạt</option>
                <option value="#eef8f3">Xanh lá nhạt</option>
              </select>
            </label>
          </div>
          <div class="fmt-actions">
            <button type="button" class="primary" data-fmt-cmd="save" title="Lưu nội dung và định dạng đã chỉnh sửa">💾 Lưu chỉnh sửa</button>
            <button type="button" data-fmt-cmd="export-word" title="Tải tệp Word giữ nguyên định dạng và nội dung đang chỉnh trên màn hình">📄 Xuất Word bản đang chỉnh</button>
            <button type="button" data-fmt-cmd="print" title="Mở cửa sổ In / Lưu PDF đúng theo định dạng đang chỉnh">🖨️ In / PDF</button>
            <button type="button" class="quiet danger" data-fmt-cmd="reset" title="Khôi phục về nội dung và định dạng mặc định ban đầu">↺ Khôi phục gốc</button>
          </div>
        </div>
        <p class="fmt-hint" ${editing?'':'hidden'} data-fmt-hint>Mẹo: Nhấp trực tiếp vào bất kỳ ô bảng, tiêu đề, câu hỏi hoặc phương án nào để sửa chữ. Bôi đen chữ hoặc đặt con trỏ vào ô bảng rồi bấm các nút căn giữa (↔ Giữa), chỉnh độ rộng cột (Cột − / Cột +), cỡ chữ hoặc thêm/xóa dòng.</p>
      </div>`;
    },
    attach(hostEl,sheetSelector,opts={}){
      if(!hostEl||typeof document==='undefined')return;
      const sheet=hostEl.querySelector(sheetSelector);if(!sheet)return;
      const key=opts.storageKey||'';
      const originalHtml=sheet.innerHTML;
      const saved=this.loadSaved(key);
      if(saved&&!opts.skipRestore){
        sheet.innerHTML=saved;
      }
      let activeCell=null,activeBlock=null,isEditing=Boolean(opts.startEditing);
      const syncEditState=()=>{
        sheet.contentEditable=isEditing?'true':'false';
        sheet.classList.toggle('fmt-editable',isEditing);
        const toggleBtn=hostEl.querySelector('[data-fmt-cmd="toggle-edit"]');
        if(toggleBtn){
          toggleBtn.classList.toggle('primary',isEditing);
          toggleBtn.innerHTML=isEditing?'✏️ Đang bật sửa trực tiếp (Bấm để khóa)':'✏️ Chỉnh sửa nội dung & định dạng';
        }
        const tools=hostEl.querySelector('[data-fmt-tools]'),hint=hostEl.querySelector('[data-fmt-hint]');
        if(tools)tools.hidden=!isEditing;
        if(hint)hint.hidden=!isEditing;
      };
      syncEditState();

      sheet.addEventListener('focusin',ev=>{
        const cell=ev.target.closest?.('td,th');if(cell&&sheet.contains(cell))activeCell=cell;
        const blk=ev.target.closest?.('td,th,p,h1,h2,h3,h4,h5,li,article');if(blk&&sheet.contains(blk))activeBlock=blk;
      });
      sheet.addEventListener('click',ev=>{
        const cell=ev.target.closest?.('td,th');
        if(cell&&sheet.contains(cell)){
          sheet.querySelectorAll('.fmt-active-cell').forEach(x=>x.classList.remove('fmt-active-cell'));
          activeCell=cell;cell.classList.add('fmt-active-cell');
        }
        const blk=ev.target.closest?.('td,th,p,h1,h2,h3,h4,h5,li,article');
        if(blk&&sheet.contains(blk))activeBlock=blk;
      });

      const getTargetElements=()=>{
        const sel=window.getSelection?.();
        const found=new Set();
        if(sel&&sel.rangeCount>0&&!sel.isCollapsed){
          const range=sel.getRangeAt(0);
          sheet.querySelectorAll('td,th,p,h1,h2,h3,h4,h5,li').forEach(el=>{
            if(range.intersectsNode(el))found.add(el);
          });
        }
        if(!found.size){
          if(activeCell&&sheet.contains(activeCell))found.add(activeCell);
          else if(activeBlock&&sheet.contains(activeBlock))found.add(activeBlock);
        }
        return [...found];
      };

      const findColumnIndex=cell=>{
        const tr=cell.parentElement,table=cell.closest('table');
        if(!tr||!table)return -1;
        const occupied={};
        const rows=[...table.querySelectorAll('tr')];
        for(let ri=0;ri<rows.length;ri++){
          let ci=0;
          for(const c of rows[ri].children){
            while(occupied[`${ri}:${ci}`])ci++;
            if(c===cell)return ci;
            const span=Number(c.getAttribute('colspan')||1),rspan=Number(c.getAttribute('rowspan')||1);
            for(let dr=0;dr<rspan;dr++)for(let dc=0;dc<span;dc++)occupied[`${ri+dr}:${ci+dc}`]=true;
            ci+=span;
          }
        }
        return -1;
      };

      const bar=hostEl.querySelector('[data-fmt-bar]');
      if(!bar)return;
      bar.addEventListener('click',async ev=>{
        const execBtn=ev.target.closest('[data-fmt-exec]');
        if(execBtn){
          ev.preventDefault();
          if(!isEditing){isEditing=true;syncEditState();}
          document.execCommand(execBtn.dataset.fmtExec,false,null);
          return;
        }
        const alignBtn=ev.target.closest('[data-fmt-align]');
        if(alignBtn){
          ev.preventDefault();
          if(!isEditing){isEditing=true;syncEditState();}
          const align=alignBtn.dataset.fmtAlign;
          const targets=getTargetElements();
          if(!targets.length){opts.notify?.('Hãy nhấp vào một ô bảng hoặc đoạn văn bản cần căn chỉnh.',true);return;}
          targets.forEach(el=>{
            el.setAttribute('align',align);
            el.style.textAlign=align;
            el.classList.remove('mx-center','mx-left');
            if(align==='center')el.classList.add('mx-center');
            else if(align==='left')el.classList.add('mx-left');
          });
          return;
        }
        const valignBtn=ev.target.closest('[data-fmt-valign]');
        if(valignBtn){
          ev.preventDefault();
          const v=valignBtn.dataset.fmtValign;
          const cells=getTargetElements().map(x=>x.closest('td,th')).filter(Boolean);
          const list=cells.length?cells:(activeCell?[activeCell]:[]);
          if(!list.length){opts.notify?.('Hãy nhấp vào một ô trong bảng để căn lề dọc.',true);return;}
          list.forEach(c=>{c.style.verticalAlign=v;c.style.setProperty('vertical-align',v,'important');});
          return;
        }
        const colBtn=ev.target.closest('[data-fmt-col]');
        if(colBtn){
          ev.preventDefault();
          if(!activeCell||!sheet.contains(activeCell)){opts.notify?.('Hãy nhấp vào một ô trong cột cần chỉnh độ rộng.',true);return;}
          const table=activeCell.closest('table');if(!table)return;
          const ci=findColumnIndex(activeCell);if(ci<0)return;
          const cols=[...table.querySelectorAll('colgroup col')];
          if(!cols[ci]){opts.notify?.('Bảng này chưa có cấu hình cột.',true);return;}
          const delta=Number(colBtn.dataset.fmtCol||0);
          const cur=parseFloat(cols[ci].style.width)||10;
          const next=Math.max(2.5,Math.min(70,cur+delta));
          cols[ci].style.width=next.toFixed(2)+'%';
          return;
        }
        const cmdBtn=ev.target.closest('[data-fmt-cmd]');
        if(!cmdBtn)return;
        ev.preventDefault();
        const cmd=cmdBtn.dataset.fmtCmd;
        if(cmd==='toggle-edit'){
          isEditing=!isEditing;syncEditState();
          if(isEditing)sheet.focus();
          return;
        }
        if(cmd==='auto-center-table'){
          opts.onAutoFormat?.(sheet);
          sheet.querySelectorAll('th').forEach(th=>{th.setAttribute('align','center');th.style.textAlign='center';th.classList.add('mx-center');});
          sheet.querySelectorAll(':scope > p, .doc-sheet-head, .doc-sheet-head h3, .doc-sheet-head p').forEach(p=>{p.setAttribute('align','center');p.style.textAlign='center';});
          opts.notify?.('Đã chuẩn hóa căn giữa tiêu đề và các cột dữ liệu trong bảng.');
          return;
        }
        if(cmd==='row-add'){
          if(!activeCell||!sheet.contains(activeCell)){opts.notify?.('Hãy nhấp vào một ô trong bảng để thêm dòng bên dưới.',true);return;}
          const tr=activeCell.closest('tr');if(!tr)return;
          const clone=tr.cloneNode(true);
          clone.querySelectorAll('td,th').forEach(c=>{c.removeAttribute('rowspan');c.innerHTML='&nbsp;';c.classList.remove('fmt-active-cell');});
          tr.parentElement.insertBefore(clone,tr.nextSibling);
          return;
        }
        if(cmd==='row-del'){
          if(!activeCell||!sheet.contains(activeCell)){opts.notify?.('Hãy nhấp vào một ô trong dòng cần xóa.',true);return;}
          const tr=activeCell.closest('tr');if(!tr)return;
          tr.remove();activeCell=null;
          return;
        }
        if(cmd==='save'){
          sheet.querySelectorAll('.fmt-active-cell').forEach(x=>x.classList.remove('fmt-active-cell'));
          if(opts.onSave&&await opts.onSave(sheet)===false)return;
          this.saveHtml(key,sheet.innerHTML);
          if(!opts.onSave)opts.notify?.('Đã lưu nội dung và định dạng chỉnh sửa của bản xem này.');
          return;
        }
        if(cmd==='reset'){
          this.clearSaved(key);
          sheet.innerHTML=originalHtml;
          opts.onAutoFormat?.(sheet);
          opts.notify?.('Đã khôi phục về nội dung và định dạng mặc định.');
          return;
        }
        if(cmd==='print'){
          this.printSheet(sheet,opts.title||'Tài liệu',opts.landscape!==false);
          return;
        }
        if(cmd==='export-word'){
          this.exportWordSheet(sheet,opts.filename||'tai_lieu_chinh_sua.doc',opts.title||'Tài liệu',opts.landscape!==false);
          return;
        }
      });

      bar.addEventListener('change',ev=>{
        const fs=ev.target.closest('[data-fmt-fontsize]');
        if(fs&&fs.value){
          const targets=getTargetElements();
          if(targets.length)targets.forEach(el=>el.style.fontSize=fs.value);
          else{sheet.style.fontSize=fs.value;sheet.querySelectorAll('td,th').forEach(c=>c.style.fontSize=fs.value);}
          fs.value='';return;
        }
        const lh=ev.target.closest('[data-fmt-lineheight]');
        if(lh&&lh.value){
          const targets=getTargetElements();
          if(targets.length)targets.forEach(el=>el.style.lineHeight=lh.value);
          else{sheet.style.lineHeight=lh.value;sheet.querySelectorAll('td,th,p').forEach(c=>c.style.lineHeight=lh.value);}
          lh.value='';return;
        }
        const bg=ev.target.closest('[data-fmt-bg]');
        if(bg&&bg.value){
          const cells=getTargetElements().map(x=>x.closest('td,th')).filter(Boolean);
          const list=cells.length?cells:(activeCell?[activeCell]:[]);
          list.forEach(c=>c.style.backgroundColor=bg.value);
          bg.value='';
        }
      });
    },
    buildStandaloneHtml(sheet,title='Tài liệu',landscape=true){
      const clone=sheet.cloneNode(true);
      clone.querySelectorAll('.fmt-active-cell').forEach(x=>x.classList.remove('fmt-active-cell'));
      const pageRule=landscape?'size:A4 landscape;margin:1cm 2cm':'size:A4 portrait;margin:1.5cm 2cm';
      const css=`
        body{font-family:"Times New Roman",Times,serif;color:#000;margin:20px auto;max-width:${landscape?'1400px':'960px'};line-height:1.45;font-size:12pt}
        p.mx-doc-heading,.doc-sheet-head h3,h1,h2,h3{text-align:center;font-weight:700;margin:10px 0 4px}
        p.mx-doc-subhead,.doc-sheet-head p{text-align:center;margin:2px 0 10px}
        .doc-sheet-head{text-align:center;border-bottom:1px solid #333;padding-bottom:12px;margin-bottom:16px}
        table{border-collapse:collapse;width:100%;table-layout:fixed;margin:10px auto 22px}
        td,th{border:1px solid #333;padding:6px 8px;overflow-wrap:anywhere;vertical-align:middle;font-size:11pt;line-height:1.4}
        th,td.mx-center,[align="center"]{text-align:center}
        td.mx-left,[align="left"]{text-align:left}
        td.mx-req-cell{text-align:left;vertical-align:top;line-height:1.5}
        .doc-question{margin-bottom:10px}
        .doc-options{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 16px;padding-left:10px}
        .answer-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin-bottom:14px}
        .answer-cell{border:1px solid #333;padding:6px;text-align:center}
        thead{display:table-header-group}
        @page{${pageRule}}
        @media print{body{margin:0;max-width:none}tr{break-inside:avoid}}
      `;
      return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${clone.innerHTML}</body></html>`;
    },
    printSheet(sheet,title,landscape=true){
      const html=this.buildStandaloneHtml(sheet,title,landscape);
      const win=window.open('','_blank');
      if(!win)return;
      win.document.open();win.document.write(html);win.document.close();
      win.focus();setTimeout(()=>win.print(),250);
    },
    exportWordSheet(sheet,filename,title,landscape=true){
      const html=this.buildStandaloneHtml(sheet,title,landscape);
      const blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download=filename.endsWith('.doc')||filename.endsWith('.docx')?filename:(filename+'.doc');
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
    }
  };

  function scopedUrl(path, curriculum){
    if(!curriculum||!path.startsWith('/api/'))return path;
    const url=new URL(path,'http://local.invalid');
    url.searchParams.set('curriculum',curriculum);
    return url.pathname+url.search+url.hash;
  }
  function contextGrades(context={}){
    const grades=context.allowed_grades;
    return Array.isArray(grades)&&grades.length?grades.filter(g=>Number.isInteger(g)&&g>=1&&g<=12):[8,9,10];
  }
function syncEditedQuestionsFromSheet(sheet,record){
 const changed=[];
 if(!sheet||!record?.questions)return changed;
 sheet.querySelectorAll('[data-edit-qid]').forEach((art,qIndex)=>{
  const qid=art.dataset.editQid;
  const recQ=(record.questions||[]).find(x=>x.id===qid)||record.questions[qIndex];
  const qEl=art.querySelector('[data-edit-field="question"]');
  const newQText=qEl?qEl.textContent.trim():null;
  let dirty=false;
  const applyTo=target=>{
   if(!target)return;
   if(newQText&&newQText!==target.question){target.question=newQText;dirty=true;}
   if(target.type==='MC'&&Array.isArray(target.options)){
    art.querySelectorAll('[data-edit-opt]').forEach(optEl=>{
     const idx=Number(optEl.dataset.editOpt);
     const txt=optEl.textContent.trim();
     if(Number.isInteger(idx)&&txt&&txt!==target.options[idx]){target.options[idx]=txt;dirty=true;}
    });
    art.querySelectorAll('[data-edit-exp]').forEach(expEl=>{
     const idx=Number(expEl.dataset.editExp);
     const txt=expEl.textContent.trim();
     if(Number.isInteger(idx)&&Array.isArray(target.option_explanations)&&txt&&txt!==target.option_explanations[idx]){target.option_explanations[idx]=txt;dirty=true;}
    });
   }
   if(target.type==='YN'&&Array.isArray(target.statements)){
    art.querySelectorAll('[data-edit-stmt]').forEach(stEl=>{
     const idx=Number(stEl.dataset.editStmt);
     const txt=stEl.textContent.trim();
     if(Number.isInteger(idx)&&target.statements[idx]&&txt&&txt!==target.statements[idx].text){target.statements[idx].text=txt;dirty=true;}
    });
   }
   if(target.type==='ES'&&Array.isArray(target.rubric)){
    art.querySelectorAll('[data-edit-rubric]').forEach(rubEl=>{
     const idx=Number(rubEl.dataset.editRubric);
     const txt=rubEl.textContent.trim();
     if(Number.isInteger(idx)&&target.rubric[idx]&&txt&&txt!==target.rubric[idx].criterion){target.rubric[idx].criterion=txt;dirty=true;}
    });
   }
  };
  applyTo(recQ);
  if(dirty&&recQ)changed.push(recQ);
 });
 return changed;
}
  // Giải thích đủ 4 phương án; ô "Lời giải" của giáo viên ghi vào phương án đúng.
  function mcExplanations(existing,correctIndex,text){
    const out=[0,1,2,3].map(i=>String((Array.isArray(existing)&&existing[i])||''));
    if(String(text||'').trim()&&correctIndex>=0&&correctIndex<4)out[correctIndex]=String(text).trim();
    return out;
  }
  // Đáp án câu trả lời ngắn theo tên trường chuẩn short_answer (đọc được tên cũ).
  function shortAnswerOf(q){
    for(const k of ['short_answer','correct_answer','answer']){const v=q&&q[k];if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim();}
    return '';
  }
  // B1: hàng đợi duyệt câu hỏi. "content_checked" là tên cũ của "chờ duyệt".
  const LEVEL_ORDER={'Biết':0,'Hiểu':1,'Vận dụng':2};
  function reviewStatusOf(q){const s=(q&&q.review_status)||'draft';return s==='content_checked'?'pending_review':s;}
  function reviewQueue(questions,f){
    f=f||{};const status=f.status||'pending_review';
    return (questions||[]).filter(q=>{
      const s=reviewStatusOf(q);
      if(s==='archived')return false;
      if(status!=='all'&&s!==status)return false;
      if(f.grade&&String(q.grade)!==String(f.grade))return false;
      if(f.lesson&&q.lesson_code!==f.lesson)return false;
      if(f.level&&q.level!==f.level)return false;
      if(f.type&&q.type!==f.type)return false;
      if(f.origin&&(q.origin||'teacher')!==f.origin)return false;
      if(f.outcome&&q.learning_outcome!==f.outcome)return false;
      return true;
    }).sort((a,b)=>(a.grade-b.grade)||String(a.lesson_code).localeCompare(String(b.lesson_code),'vi',{numeric:true})||
      ((LEVEL_ORDER[a.level]??9)-(LEVEL_ORDER[b.level]??9))||String(a.id).localeCompare(String(b.id)));
  }
  // B9: bộ lọc màn hình duyệt cho đúng một ô ma trận
  function reviewFiltersForCell(c){return {status:'pending_review',grade:String(c.grade),lesson:c.lesson_code,type:c.kind,level:c.level,origin:'',outcome:c.outcome};}
  function reviewKeyAction(key){return {a:'approve',r:'return',j:'next',k:'prev',e:'edit'}[String(key||'').toLowerCase()]||null;}
  function stepIndex(i,delta,length){if(!length)return 0;return Math.min(length-1,Math.max(0,i+delta));}
  function checklistMissing(checklist,items){return (items||[]).map(x=>x.key).filter(k=>!(checklist&&checklist[k]===true));}
  function reviewProgress(questions){
    const out={draft:0,pending_review:0,needs_review:0,approved:0,total:0};
    (questions||[]).forEach(q=>{const s=reviewStatusOf(q);if(s==='archived')return;if(s in out)out[s]++;out.total++;});
    return out;
  }
  // B2: vòng đời đề kiểm tra
  function examStatusOf(e){const s=(e&&e.status)||'drafting';return ['drafting','pending_approval','locked','published'].includes(s)?s:'drafting';}
  function examActions(e){return {drafting:['submit'],pending_approval:['approve','return'],locked:['publish','new_revision'],published:['new_revision']}[examStatusOf(e)];}
  function examEditable(e){return !['locked','published'].includes(examStatusOf(e));}
  // B8: số thứ tự bài KTTX tiếp theo trong cùng khối, học kì, lớp
  function nextKttxNumber(acts,grade,semester,className){return 1+Math.max(0,...(acts||[]).filter(a=>a.grade===grade&&a.semester===semester&&(a.class_name||'')===(className||'')).map(a=>a.k));}
  // Hướng dẫn theo màn hình đang mở (giáo viên yêu cầu 28/10/2026): mỗi màn hình có mục đích, các bước và lưu ý riêng.
  const SCREEN_GUIDES={
    overview:{title:'Tổng quan',purpose:'Xem nhanh tình trạng ngân hàng của môn đang chọn và đi đến việc cần làm tiếp theo.',
      steps:['Đọc các ô số liệu: tổng số câu, số câu theo khối, theo trạng thái duyệt.',
        'Bấm "Mở màn hình duyệt câu hỏi →" nếu còn câu đang chờ duyệt.',
        'Bấm "Soạn câu hỏi mới" hoặc "Chuẩn bị đề cương →" để sang bước tiếp theo.'],
      tips:['Đề chính thức chỉ dùng câu ở trạng thái "Đã duyệt".']},
    bank:{title:'Ngân hàng câu hỏi',purpose:'Tìm, soạn, sửa và nhập câu hỏi (MC, Đúng/Sai, Trả lời ngắn, Tự luận) theo bài học và YCCĐ trong PPCT.',
      steps:['Lọc theo khối, bài học, dạng câu, mức độ, trạng thái hoặc gõ vào ô tìm kiếm (mã câu, nội dung, phương án, YCCĐ).',
        'Bấm "+ Thêm câu hỏi": chọn khối, bài, YCCĐ, mức độ, dạng câu rồi nhập nội dung và đáp án. MC cần đủ 4 phương án kèm giải thích; Đúng/Sai cần đủ 4 ý a–d; Trả lời ngắn cần đáp án; Tự luận cần 4 tiêu chí chấm, tổng 1 điểm.',
        'Bấm "Sửa" trên một câu để chỉnh. Sửa nội dung, đáp án, YCCĐ hoặc mức độ của câu đã duyệt sẽ đưa câu về "Cần sửa lại" và phải duyệt lại.',
        'Tích chọn nhiều câu rồi dùng "Thao tác hàng loạt": "Gửi duyệt", "📤 Xuất Word LMS", "Tạo đề cương từ lựa chọn" hoặc "Xóa câu đã chọn".',
        '"Nhập JSON" để nạp nhiều câu theo lược đồ chuẩn; "Xuất JSON" để sao lưu hoặc chia sẻ.'],
      tips:['Câu mới và câu do AI tạo luôn ở trạng thái nháp, không tự lên "Đã duyệt".',
        'Ứng dụng cảnh báo khi câu trùng nguyên văn với câu đã có.']},
    review:{title:'Duyệt câu hỏi',purpose:'Kiểm định từng câu theo phiếu 7 mục trước khi câu được dùng trong đề chính thức.',
      steps:['Chọn bộ lọc (trạng thái, khối, bài, dạng, mức độ, nguồn) để lập hàng đợi duyệt.',
        'Đọc toàn văn câu, đáp án, giải thích hoặc hướng dẫn chấm, YCCĐ ở khung bên phải.',
        'Tích đủ 7 mục của phiếu kiểm định rồi bấm "Duyệt (A)".',
        'Nếu chưa đạt: nhập lý do (bắt buộc) rồi bấm "Trả lại (R)". Câu đã duyệt mà phát hiện sai: nhập lý do rồi "Thu hồi duyệt, trả lại (R)".',
        'Dùng "Sau (J) ›" và "‹ Trước (K)" để chuyển câu; "Sửa (E)" để mở trình sửa câu.'],
      tips:['Phím tắt: A duyệt, R trả lại, J câu sau, K câu trước, E sửa.',
        'Không có nút "duyệt tất cả": mỗi câu phải được mở và xác nhận phiếu riêng. Lịch sử duyệt ghi người duyệt, thời điểm và lý do.']},
    ppct:{title:'Phân phối chương trình',purpose:'Quản lí danh mục bài học và YCCĐ của từng khối — nguồn chuẩn cho câu hỏi, đề cương và ma trận.',
      steps:['Chọn khối lớp để xem danh sách bài, số tiết, tuần và YCCĐ.',
        'Nhập PPCT từ tệp: trong thẻ "Nhập PPCT từ Word hoặc JSON", chọn tệp KHDH Phụ lục 1 (.docx) hoặc tệp JSON, bấm "Đọc và đối chiếu". Xem bảng so sánh (bài mới / có thay đổi / giữ nguyên / xung đột), rồi bấm "Xác nhận nhập".',
        'Bấm "+ Thêm bài học PPCT" để thêm bài thủ công, hoặc "Sửa" trên một bài để chỉnh tên, chủ đề, YCCĐ.',
        '"Hồ sơ nguồn" cho biết PPCT được nhập từ tệp nào (kèm mã SHA-256).'],
      tips:['YCCĐ đang được câu hỏi sử dụng, hoặc bài đã gắn vào ma trận, không thể xóa/sửa tùy ý (ứng dụng báo xung đột).',
        'Nhập PPCT không xóa bài cũ; bài có xung đột được bỏ qua và liệt kê để giáo viên xử lí.']},
    revisions:{title:'Đề cương ôn tập',purpose:'Chọn bộ câu hỏi công bố cho học sinh ôn tập. Đề kiểm tra phải lấy từ hoặc bám sát đề cương (≥ 90% số câu).',
      steps:['Chọn khối, lọc câu ở ngân hàng rồi bấm "Thêm câu đang lọc của khối…" hoặc thêm từng câu.',
        'Bấm "Xem toàn bộ đang chọn" để rà lại danh sách.',
        'Đặt "Tên phiên bản" rồi "Lưu phiên bản đề cương". Mỗi lần lưu là một bản chụp cố định, không đổi theo ngân hàng.',
        'Muốn chỉnh bản đã lưu: mở bản đó, sửa, rồi "Cập nhật…" hoặc "Lưu thành bản mới".',
        '"📥 Import Đề cương (.docx / .json)" để nhập đề cương có sẵn.'],
      tips:['Mục "Giới hạn kiến thức ôn tập" khi xuất có đúng 3 cột: STT, Tên chủ đề, Tên bài.']},
    matrices:{title:'Ma trận & đặc tả',purpose:'Lập, nhập, đối chiếu và khóa ma trận – bảng đặc tả; tạo đề theo ma trận.',
      steps:['"Nhập ma trận" → "Chọn Word hoặc gói JSON" để nhận ma trận của tổ (Khối 8, 10); hoặc "+ Tạo ma trận khối…" để tự thiết kế (Khối 9).',
        'Đi lần lượt 5 bước: 1. Thông tin hồ sơ → 2. Bài học & YCCĐ → 3. Phân bố câu hỏi và ý → 4. Đối chiếu & xác nhận → 5. Word & phiên bản dùng chung.',
        'Ở bước 3, chọn dạng câu được phép và cách chấm Đúng/Sai; ứng dụng cảnh báo tỉ lệ theo CV 7991 (chỉ cảnh báo).',
        'Bấm "Báo cáo thiếu câu theo ô" để biết ô nào chưa đủ câu đã duyệt; "Mở duyệt ô này" để sang màn hình duyệt đã lọc sẵn.',
        '"Xác nhận bản đã thống nhất để khóa" rồi "Khóa phiên bản này". Muốn sửa bản đã khóa: "Tạo phiên bản mới".',
        '"Tạo và lưu đề riêng" để sinh đề trực tiếp từ ma trận.'],
      tips:['Giữ nguyên YCCĐ, số câu, số điểm của ma trận gốc.','Đánh số câu dạng (1, 2, 3) hoặc (1a, 1b), không dùng (C1 - C4).']},
    exams:{title:'Tạo đề kiểm tra',purpose:'Sinh đề từ ngân hàng theo ma trận và đề cương, kiểm định, duyệt – khóa, phát hành và xuất hồ sơ.',
      steps:['Điền tên đề, khối, kì kiểm tra, thời gian; chọn ma trận và "Phiên bản đề cương dùng đối chiếu".',
        'Bấm "Tạo và lưu đề kiểm tra". Nếu thiếu câu, ứng dụng báo rõ ô thiếu (không tự hạ mức độ hay đổi bài).',
        'Mở đề đã lưu, xem kết quả "Kiểm định": tổng 10 điểm, khớp từng ô ma trận, tiêu chí đề cương T ≥ 90%, bao phủ YCCĐ 100%.',
        'Vòng đời: "Gửi duyệt đề" → "Duyệt & khóa" → "Phát hành". Đề đã khóa không sửa được; muốn sửa tạo bản chỉnh sửa mới và duyệt lại.',
        'Nhập "Mã xáo trộn" để tạo các mã đề hoán vị; tải "Bảng đối chiếu mã đề".',
        'Xuất: "Tải trọn bộ Hồ sơ Word" / "PDF" (PDF chuyển từ chính tệp Word), "Tải tệp LMS", hoặc mã nguồn XeLaTeX.'],
      tips:['Đáp án và hướng dẫn chấm chỉ tải được với tài khoản có quyền xem đáp án; mỗi lần tải đều được ghi nhật ký.',
        'Câu đã dùng trong đề phát hành gần đây được cảnh báo (không chặn).']},
    kttx:{title:'Kiểm tra thường xuyên',purpose:'Lập kế hoạch các hoạt động KTTX và theo dõi số đầu điểm ĐĐGtx cần có theo TT 22/2021, Điều 6.',
      steps:['Xem "Tổng quan đầu điểm": số đầu điểm đã chọn ghi nhận / cần có của từng khối, học kì, lớp.',
        'Điền khối, học kì, lớp (để trống = tất cả lớp), hình thức, thang điểm tối đa, ghi chú; có thể gắn một đề TX đã lưu.',
        'Bấm "Thêm hoạt động". Tên hồ sơ tự đặt theo mẫu "Tin N_Kiểm tra thường xuyên k - HK I/II".',
        'Đánh dấu hoạt động được chọn để ghi nhận đầu điểm; điểm quy đổi về thang 10 và làm tròn đến số nguyên.'],
      tips:['Khối THPT có thể ghi nhận kết quả cụm chuyên đề học tập như 1 đầu điểm ĐĐGtx (Điều 6.3).',
        'Tổng quan chỉ cảnh báo khi thiếu đầu điểm, không chặn thao tác.']},
  };
  const TEST_MODE_TIP='Đang ở Chế độ Test: dữ liệu là bản sao, mọi thao tác không ảnh hưởng ngân hàng thật. Bấm "🔄 Làm mới dữ liệu test" để chép lại bản sao mới.';
  function screenGuide(tab,opts){
    const g=SCREEN_GUIDES[tab]||SCREEN_GUIDES.overview;
    return {...g,tips:(opts&&opts.testMode)?[TEST_MODE_TIP,...g.tips]:g.tips.slice()};
  }
  const api={screenGuide,SCREEN_GUIDES,reviewFiltersForCell,nextKttxNumber,examStatusOf,examActions,examEditable,reviewQueue,reviewStatusOf,reviewKeyAction,stepIndex,checklistMissing,reviewProgress,mcExplanations,shortAnswerOf,syncEditedQuestionsFromSheet,scopedUrl,contextGrades,courseLessons,normalize,jsonHeaders,formatStoragePrefix,filterQuestions,blueprintSummary,sourceTemplateRequired,templateBlocked,revisionIds,escapeHtml,DocFormatter};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else{root.BankCore=api;root.DocFormatter=DocFormatter;}
})(typeof window!=='undefined'?window:globalThis);
