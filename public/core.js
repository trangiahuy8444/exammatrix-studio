(function(root){
  'use strict';
  const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  const jsonHeaders=token=>token?{'Content-Type':'application/json','X-CSRFToken':token}:{'Content-Type':'application/json'};
  const formatStoragePrefix=scope=>'tin_doc_fmt_v2:'+(scope?encodeURIComponent(scope)+':':'');
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
  // Đối chiếu ma trận khi chọn câu: mỗi ô (bài, dạng, mức độ) cần bao nhiêu câu, đã chọn bao nhiêu, ngân hàng còn bao nhiêu câu đã duyệt.
  function matrixCellCoverage(rows,selected,bank,multiplier){
    const m=Number(multiplier)||1,cells=new Map(),key=q=>[q.lesson_code,q.type,q.level].join('|');
    (rows||[]).forEach(r=>{const k=key(r),c=cells.get(k)||{lesson_code:r.lesson_code,type:r.type,level:r.level,need:0,selected:0,available:0};c.need+=Number(r.count||0)*m;cells.set(k,c);});
    let outside=0;
    (selected||[]).forEach(q=>{const c=cells.get(key(q));if(c)c.selected+=1;else outside+=1;});
    (bank||[]).forEach(q=>{const c=cells.get(key(q));if(c&&q.review_status==='approved')c.available+=1;});
    const list=[...cells.values()].map(c=>({...c,short:Math.max(0,c.need-c.selected),bankShort:Math.max(0,c.need-c.available)}));
    return {cells:list,outside,need:list.reduce((n,c)=>n+c.need,0),selected:list.reduce((n,c)=>n+c.selected,0)};
  }
  // Ô ma trận (bài, dạng, mức độ[, YCCĐ]) có chứa câu q không.
  function cellMatches(cell,q){return q.lesson_code===cell.lesson_code&&q.type===cell.type&&q.level===cell.level&&(!(cell.outcomes||[]).length||cell.outcomes.includes(q.learning_outcome));}
  // Chia tổng số câu đề cương cho các ô theo tỉ lệ số câu của ô (phần dư lớn nhất), không vượt số câu ngân hàng có.
    // Chia số câu đề cương cho các ô theo số câu trắc nghiệm (MC) và tự luận (ES) từng bài.
  function distributeCountsByLesson(cells, lessonCounts) {
    const out = {};
    if (!cells || !cells.length || !lessonCounts) return out;
    // Nhóm ô theo (lesson_code, type)
    const groups = {};
    cells.forEach(c => {
      const k = c.lesson_code + '::' + c.type;
      if (!groups[k]) groups[k] = [];
      groups[k].push(c);
    });
    Object.keys(groups).forEach(k => {
      const [lcode, type] = k.split('::');
      const gCells = groups[k];
      const target = Number(lessonCounts[lcode]?.[type] ?? 0);
      if (target > 0) {
        const sub = distributeCounts(gCells, target);
        Object.assign(out, sub);
      } else if (lessonCounts[lcode] && lessonCounts[lcode][type] === 0) {
        gCells.forEach(c => { out[c.key] = 0; });
      }
    });
    return out;
  }

function distributeCounts(cells,total){
    const whole=cells.reduce((n,c)=>n+Number(c.need||0),0),out={};if(!whole||!(total>0))return out;
    const raw=cells.map(c=>({c,v:total*Number(c.need||0)/whole}));raw.forEach(r=>{out[r.c.key]=Math.floor(r.v);});
    let left=total-raw.reduce((n,r)=>n+out[r.c.key],0);
    raw.slice().sort((a,b)=>(b.v-Math.floor(b.v))-(a.v-Math.floor(a.v))).forEach(r=>{if(left>0){out[r.c.key]+=1;left-=1;}});
    cells.forEach(c=>{if(c.available!==undefined)out[c.key]=Math.min(out[c.key],Number(c.available));});
    return out;
  }
  function revisionIds(questions,ids,grade){const selected=new Set(ids);return questions.filter(q=>selected.has(q.id)&&Number(q.grade)===Number(grade)&&q.review_status!=='archived').map(q=>q.id);}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  // Keep this deliberately small grammar aligned with exports._question_text_blocks.
  // HTML, inline Markdown and ordinary pipes are always literal question text.
  function questionTextBlocks(text){
    const lines=String(text??'').split('\n'),blocks=[],plain=[];
    const flush=()=>{if(plain.length){blocks.push(['text',plain.splice(0)]);}};
    const cells=line=>{
      let value=line.trim();if(!value.includes('|'))return null;
      if(value.startsWith('|'))value=value.slice(1);
      if(value.endsWith('|'))value=value.slice(0,-1);
      const row=value.split('|').map(c=>c.trim());return row.length>=2?row:null;
    };
    let i=0;
    while(i<lines.length){
      const line=lines[i];
      if(line.trimStart().startsWith('```')){
        const closing=lines.findIndex((s,j)=>j>i&&s.trim()==='```');
        if(/^\s*```[\p{L}\p{N}_.+-]*\s*$/u.test(line)&&closing>=0){
          flush();blocks.push(['code',lines.slice(i+1,closing)]);i=closing+1;
        }else{
          const stop=closing<0?lines.length:closing+1;
          plain.push(...lines.slice(i,stop));i=stop;
        }
        continue;
      }
      const header=cells(line),separator=i+1<lines.length?cells(lines[i+1]):null;
      if(header&&separator&&header.length===separator.length&&separator.every(c=>/^:?-{3,}:?$/.test(c))){
        let stop=i+2,valid=true;const rows=[header];
        while(stop<lines.length&&lines[stop].includes('|')){
          const row=cells(lines[stop]);if(!row||row.length!==header.length)valid=false;
          rows.push(row);stop++;
        }
        if(valid&&rows.length>1){flush();blocks.push(['table',rows]);}
        else plain.push(...lines.slice(i,stop));
        i=stop;continue;
      }
      plain.push(line);i++;
    }
    flush();return blocks;
  }
  function questionTextHtml(text,{editable=false}={}){
    const blocks=questionTextBlocks(text),rich=blocks.some(([kind])=>kind!=='text');
    const field=editable?' data-edit-field="question"':'';
    if(!rich)return `<span${field} style="white-space:pre-wrap">${escapeHtml(text)}</span>`;
    const cellStyle='border:1px solid #9aa9b7;padding:6px 8px;white-space:pre-wrap;overflow-wrap:anywhere';
    const html=blocks.map(([kind,content])=>{
      if(kind==='code')return `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4;font-family:Consolas,monospace;padding:10px;border:1px solid #d5dde5;background:#f6f8fa"><code>${escapeHtml(content.join('\n'))}</code></pre>`;
      if(kind==='table')return `<table class="question-table" style="width:100%;table-layout:fixed;border-collapse:collapse;white-space:normal;margin:10px 0"><thead><tr>${content[0].map(c=>`<th style="${cellStyle}">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${content.slice(1).map(row=>`<tr>${row.map(c=>`<td style="${cellStyle}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      return `<div style="white-space:pre-wrap">${escapeHtml(content.join('\n'))}</div>`;
    }).join('');
    return `<div${field} data-question-source-preserved="true" contenteditable="false" style="white-space:normal" title="Sửa nội dung mã và bảng bằng nút Sửa câu hỏi">${html}</div>`;
  }
  function insertQuestionTemplate(text,start,end,kind){
    text=String(text??'');start=Math.max(0,Math.min(text.length,Number(start)||0));end=Math.max(start,Math.min(text.length,Number(end)||start));
    const templates={code:['```python\n    # Viết mã tại đây\n```','    # Viết mã tại đây'],table:['| Đại lượng | Giá trị |\n| --- | --- |\n| Giá trị 1 | Giá trị 2 |','Giá trị 1']};
    const entry=templates[kind];if(!entry)return {text,selectionStart:start,selectionEnd:end};
    // Insert without removing selected question text.
    const before=text.slice(0,start),after=text.slice(start);
    const prefix=before&&!before.endsWith('\n')?'\n':'';
    const suffix=after&&!after.startsWith('\n')?'\n':'';
    const value=prefix+entry[0]+suffix,selectionStart=start+prefix.length+entry[0].indexOf(entry[1]);
    return {text:before+value+after,selectionStart,selectionEnd:selectionStart+entry[1].length};
  }

  // Only form choices belong here; never persist bank records, answers or credentials.
  function examDraftKey(scope){if(!scope||(scope.curriculum&&!scope.workspace))return null;return 'bank_exam_draft_v1:'+JSON.stringify([scope.workspace||'',scope.curriculum||'',scope.subject||'',Boolean(scope.test)]);}
  function cleanExamDraft(value,context={}){
    const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    const number=(x,min,max,fallback)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:fallback;
    const text=(x,max=500)=>typeof x==='string'?x.slice(0,max):'';
    const grade=(context.grades||[]).includes(v.grade)?v.grade:(context.grades?.[0]||8);
    const exam_type=['TX','GK1','CK1','GK2','CK2'].includes(v.exam_type)?v.exam_type:'GK1';
    const compatible=r=>Number(r.grade)===grade&&r.exam_type===exam_type;
    const revision=id=>(context.revisions||[]).some(r=>r.id===id&&Number(r.grade)===grade)?id:'';
    const matrix_id=(context.matrices||[]).some(r=>r.id===v.matrix_id&&r.status==='locked'&&compatible(r))?v.matrix_id:'';
    const template_id=!matrix_id&&(context.templates||[]).some(r=>r.id===v.template_id&&compatible(r))?v.template_id:'';
    const lessonCodes=new Set((context.lessons||[]).map(l=>l.lesson_code));
    const validOutcomes=r=>r.outcomes===undefined||(Array.isArray(r.outcomes)&&r.outcomes.every(o=>typeof o==='string'&&(context.lessons||[]).some(l=>l.lesson_code===r.lesson_code&&(l.outcomes||[]).includes(o))));
    const blueprint=(Array.isArray(v.blueprint)?v.blueprint:[]).slice(0,500).filter(r=>r&&lessonCodes.has(r.lesson_code)&&['MC','ES'].includes(r.type)&&['Biết','Hiểu','Vận dụng','Vận dụng cao'].includes(r.level)&&Number.isInteger(r.count)&&r.count>0&&r.count<=10000&&number(r.points_per_question,.001,100,null)!==null&&validOutcomes(r)).map(r=>({lesson_code:r.lesson_code,type:r.type,level:r.level,count:r.count,points_per_question:r.points_per_question,...(r.outcomes===undefined?{}:{outcomes:[...new Set(r.outcomes)]})}));
    const set_counts={};if(v.set_counts&&typeof v.set_counts==='object'&&!Array.isArray(v.set_counts))Object.entries(v.set_counts).slice(0,500).forEach(([k,n])=>{if(k.length<=500&&!['__proto__','constructor','prototype'].includes(k)&&Number.isInteger(n)&&n>=0&&n<=10000)set_counts[k]=n;});
    return {grade,exam_type,title:text(v.title),duration:number(v.duration,1,240,45),seed:text(v.seed,200)||'2026',revision_id:revision(v.revision_id),matrix_id,template_id,blueprint,similarity_percent:number(v.similarity_percent,90,100,90),similarity_mode:v.similarity_mode==='exact'?'exact':'min',set_count:Number.isInteger(v.set_count)?number(v.set_count,1,6,2):2,set_rev:revision(v.set_rev)||'auto',set_counts};
  }
  function saveExamDraft(storage,scope,draft){
    try{
      const key=examDraftKey(scope);if(!key)return false;
      const fields=['grade','exam_type','title','duration','seed','revision_id','matrix_id','template_id','similarity_percent','similarity_mode','set_count','set_rev','set_counts'];
      const value=Object.fromEntries(fields.map(k=>[k,draft[k]]));
      value.blueprint=(Array.isArray(draft.blueprint)?draft.blueprint:[]).map(r=>r&&Object.fromEntries(['lesson_code','type','level','count','points_per_question','outcomes'].map(k=>[k,r[k]])));
      value.set_counts=Object.fromEntries(Object.entries(draft.set_counts||{}).slice(0,500).filter(([k,n])=>k.length<=500&&!['__proto__','constructor','prototype'].includes(k)&&Number.isInteger(n)&&n>=0&&n<=10000));
      storage.setItem(key,JSON.stringify(value));return true;
    }catch{return false;}
  }
  function loadExamDraft(storage,scope,context){try{const key=examDraftKey(scope);if(!key)return null;const raw=storage.getItem(key);if(!raw)return null;const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)?cleanExamDraft(value,context):null;}catch{return null;}}

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
            <span class="fmt-sep"></span>
            <button type="button" data-fmt-cmd="cell-merge-right" title="Gộp ô đang chọn với ô kế tiếp bên phải (Colspan)">⧉ Gộp ngang</button>
            <button type="button" data-fmt-cmd="cell-merge-down" title="Gộp ô đang chọn với ô bên dưới (Rowspan)">⧈ Gộp dọc</button>
            <button type="button" data-fmt-cmd="cell-split" title="Hủy gộp ô (tách về các ô đơn ban đầu)">⊞ Tách ô</button>
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
        <p class="fmt-hint" ${editing?'':'hidden'} data-fmt-hint>Mẹo: Nhấp trực tiếp vào bất kỳ ô bảng, tiêu đề hoặc phương án nào để sửa chữ. Bấm <strong>⧉ Gộp ngang</strong> hoặc <strong>⧈ Gộp dọc</strong> để gộp các ô lại với nhau (hoặc <strong>⊞ Tách ô</strong> để hủy gộp). Dùng các nút căn giữa (↔ Giữa), chỉnh độ rộng cột (Cột − / Cột +), cỡ chữ hoặc thêm/xóa dòng theo ý muốn.</p>
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
      let activeCell=null,activeBlock=null,isEditing=Boolean(opts.startEditing),sourceFocused=false;
      const sourceSelector='[data-question-source-preserved="true"]';
      const inSource=element=>Boolean((element?.nodeType===3?element.parentElement:element)?.closest?.(sourceSelector));
      const containsSource=element=>inSource(element)||Boolean(element?.querySelector?.(sourceSelector));
      const protectedSelection=()=>{
        if(sourceFocused)return true;
        const selection=window.getSelection?.();
        if(inSource(selection?.anchorNode)||inSource(selection?.focusNode))return true;
        if(selection?.rangeCount&&!selection.isCollapsed){
          const range=selection.getRangeAt(0);
          return [...sheet.querySelectorAll(sourceSelector)].some(block=>range.intersectsNode(block));
        }
        return false;
      };
      const clearActiveSource=target=>{
        sourceFocused=inSource(target);
        if(!sourceFocused)return false;
        activeCell=null;activeBlock=null;
        sheet.querySelectorAll('.fmt-active-cell').forEach(x=>x.classList.remove('fmt-active-cell'));
        return true;
      };
      const explainSourceLock=()=>opts.notify?.('Sửa câu có mã hoặc bảng bằng nút “Sửa câu hỏi”.',true);
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
        if(clearActiveSource(ev.target))return;
        const cell=ev.target.closest?.('td,th');if(cell&&sheet.contains(cell))activeCell=cell;
        const blk=ev.target.closest?.('td,th,p,h1,h2,h3,h4,h5,li,article');if(blk&&sheet.contains(blk))activeBlock=blk;
      });
      sheet.addEventListener('click',ev=>{
        if(clearActiveSource(ev.target))return;
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
        return [...found].filter(el=>!containsSource(el));
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
        const command=ev.target.closest('[data-fmt-cmd]')?.dataset.fmtCmd;
        const mutatesSource=['[data-fmt-exec]','[data-fmt-align]','[data-fmt-valign]','[data-fmt-col]'].some(selector=>ev.target.closest(selector))||['row-add','row-del','auto-center-table','cell-merge-right','cell-merge-down','cell-split'].includes(command);
        if(mutatesSource&&protectedSelection()){ev.preventDefault();explainSourceLock();return;}
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
          if(inSource(activeCell)){explainSourceLock();return;}
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
          [...sheet.querySelectorAll('th')].filter(th=>!inSource(th)).forEach(th=>{th.setAttribute('align','center');th.style.textAlign='center';th.classList.add('mx-center');});
          sheet.querySelectorAll(':scope > p, .doc-sheet-head, .doc-sheet-head h3, .doc-sheet-head p').forEach(p=>{p.setAttribute('align','center');p.style.textAlign='center';});
          opts.notify?.('Đã chuẩn hóa căn giữa tiêu đề và các cột dữ liệu trong bảng.');
          return;
        }
        if(cmd==='row-add'){
          if(!activeCell||!sheet.contains(activeCell)){opts.notify?.('Hãy nhấp vào một ô trong bảng để thêm dòng bên dưới.',true);return;}
          if(inSource(activeCell)){explainSourceLock();return;}
          const tr=activeCell.closest('tr');if(!tr)return;
          const clone=tr.cloneNode(true);
          clone.querySelectorAll('td,th').forEach(c=>{c.removeAttribute('rowspan');c.innerHTML='&nbsp;';c.classList.remove('fmt-active-cell');});
          tr.parentElement.insertBefore(clone,tr.nextSibling);
          return;
        }
        if(cmd==='row-del'){
          if(!activeCell||!sheet.contains(activeCell)){opts.notify?.('Hãy nhấp vào một ô trong dòng cần xóa.',true);return;}
          if(inSource(activeCell)){explainSourceLock();return;}
          const tr=activeCell.closest('tr');if(!tr)return;
          tr.remove();activeCell=null;
          return;
        }
        if(cmd==='cell-merge-right'){
          if(!activeCell||!sheet.contains(activeCell)){opts.notify?.('Hãy nhấp vào ô cần gộp.',true);return;}
          if(inSource(activeCell)){explainSourceLock();return;}
          const next=activeCell.nextElementSibling;
          if(!next){opts.notify?.('Không có ô bên phải liền kề để gộp.',true);return;}
          const nextText=next.innerHTML.trim();
          if(nextText && nextText!=='&nbsp;' && nextText!=='—'){
            activeCell.innerHTML += (activeCell.innerHTML.trim() ? '<br>' : '') + nextText;
          }
          const span=Number(activeCell.getAttribute('colspan')||1)+Number(next.getAttribute('colspan')||1);
          activeCell.setAttribute('colspan',span);
          next.remove();
          opts.notify?.('Đã gộp ô sang phải (colspan=' + span + ').');
          return;
        }
        if(cmd==='cell-merge-down'){
          if(!activeCell||!sheet.contains(activeCell)){opts.notify?.('Hãy nhấp vào ô cần gộp.',true);return;}
          if(inSource(activeCell)){explainSourceLock();return;}
          const tr=activeCell.closest('tr');
          const table=activeCell.closest('table');
          if(!tr||!table){opts.notify?.('Không tìm thấy bảng.',true);return;}
          const rows=[...table.querySelectorAll('tr')];
          const ri=rows.indexOf(tr);
          const rspan=Number(activeCell.getAttribute('rowspan')||1);
          const targetRowIdx=ri+rspan;
          if(targetRowIdx>=rows.length){opts.notify?.('Ô đã ở hàng cuối cùng của bảng, không thể gộp xuống.',true);return;}

          const targetCol=findColumnIndex(activeCell);
          if(targetCol<0){opts.notify?.('Không xác định được vị trí cột.',true);return;}

          const occupied={};
          let below=null;
          for(let r=0;r<=targetRowIdx;r++){
            let c=0;
            for(const cellEl of rows[r].children){
              while(occupied[`${r}:${c}`])c++;
              if(r===targetRowIdx&&c===targetCol){below=cellEl;break;}
              const sp=Number(cellEl.getAttribute('colspan')||1);
              const rsp=Number(cellEl.getAttribute('rowspan')||1);
              for(let dr=0;dr<rsp;dr++)for(let dc=0;dc<sp;dc++)occupied[`${r+dr}:${c+dc}`]=true;
              c+=sp;
            }
            if(below)break;
          }
          if(!below){opts.notify?.('Không tìm thấy ô bên dưới tương ứng để gộp.',true);return;}
          const belowText=below.innerHTML.trim();
          if(belowText && belowText!=='&nbsp;' && belowText!=='—'){
            activeCell.innerHTML += (activeCell.innerHTML.trim() ? '<br>' : '') + belowText;
          }
          const newRspan=rspan+Number(below.getAttribute('rowspan')||1);
          activeCell.setAttribute('rowspan',newRspan);
          below.remove();
          opts.notify?.('Đã gộp ô xuống dưới (rowspan=' + newRspan + ').');
          return;
        }
        if(cmd==='cell-split'){
          if(!activeCell||!sheet.contains(activeCell)){opts.notify?.('Hãy nhấp vào ô cần tách.',true);return;}
          if(inSource(activeCell)){explainSourceLock();return;}
          const cspan=Number(activeCell.getAttribute('colspan')||1);
          const rspan=Number(activeCell.getAttribute('rowspan')||1);
          if(cspan<=1&&rspan<=1){opts.notify?.('Ô này chưa được gộp (colspan=1, rowspan=1).',true);return;}
          activeCell.removeAttribute('colspan');
          activeCell.removeAttribute('rowspan');
          for(let i=1;i<cspan;i++){
            const td=document.createElement(activeCell.tagName);
            td.innerHTML='&nbsp;';
            td.className=activeCell.className;
            activeCell.parentElement.insertBefore(td,activeCell.nextSibling);
          }
          if(rspan>1){
            const table=activeCell.closest('table');
            const tr=activeCell.closest('tr');
            const rows=[...table.querySelectorAll('tr')];
            const ri=rows.indexOf(tr);
            for(let r=1;r<rspan;r++){
              const targetTr=rows[ri+r];
              if(targetTr){
                for(let i=0;i<cspan;i++){
                  const td=document.createElement(activeCell.tagName);
                  td.innerHTML='&nbsp;';
                  td.className=activeCell.className;
                  targetTr.appendChild(td);
                }
              }
            }
          }
          opts.notify?.('Đã tách ô về ô đơn.');
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
        if(protectedSelection()){explainSourceLock();return;}
        const fs=ev.target.closest('[data-fmt-fontsize]');
        if(fs&&fs.value){
          const targets=getTargetElements();
          if(targets.length)targets.forEach(el=>el.style.fontSize=fs.value);
          else{sheet.style.fontSize=fs.value;[...sheet.querySelectorAll('td,th')].filter(c=>!inSource(c)).forEach(c=>c.style.fontSize=fs.value);}
          fs.value='';return;
        }
        const lh=ev.target.closest('[data-fmt-lineheight]');
        if(lh&&lh.value){
          const targets=getTargetElements();
          if(targets.length)targets.forEach(el=>el.style.lineHeight=lh.value);
          else{sheet.style.lineHeight=lh.value;[...sheet.querySelectorAll('td,th,p')].filter(c=>!containsSource(c)).forEach(c=>c.style.lineHeight=lh.value);}
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
    return Array.isArray(grades)&&grades.length?grades.filter(g=>Number.isInteger(g)&&g>=1&&g<=12):[6,7,8,9,10,11,12];
  }
function syncEditedQuestionsFromSheet(sheet,record){
 const changed=[];
 if(!sheet||!record?.questions)return changed;
 sheet.querySelectorAll('[data-edit-qid]').forEach((art,qIndex)=>{
  const qid=art.dataset.editQid;
  const recQ=(record.questions||[]).find(x=>x.id===qid)||record.questions[qIndex];
  const qEl=art.querySelector('[data-edit-field="question"]');
  // A rendered table/code block has no faithful textContent round trip. Preserve
  // record source even when restoring an older saved formatter view.
  const preserveSource=qEl?.dataset?.questionSourcePreserved==='true'||questionTextBlocks(recQ?.question).some(([kind])=>kind!=='text');
  const newQText=qEl&&!preserveSource?qEl.textContent.trim():null;
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
  const COGNITIVE_LEVELS=['Biết','Hiểu','Vận dụng','Vận dụng cao'];
  function levelAfterTypeChange(level,kind){return kind==='ES'&&level!=='Vận dụng cao'?'Vận dụng':level;}
  function cognitiveLevels(){return COGNITIVE_LEVELS.slice();}
  function levelOptions(value){return COGNITIVE_LEVELS.map(level=>`<option value="${escapeHtml(level)}"${level===value?' selected':''}>${escapeHtml(level)}</option>`).join('');}
  const LEVEL_ORDER=Object.fromEntries(COGNITIVE_LEVELS.map((level,index)=>[level,index]));
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
        '"📥 Import Đề cương (.docx / .json)" để nhập đề cương có sẵn.',
        '"Tạo đề cương theo ma trận": chọn ma trận, sửa "Số câu đề cương" từng ô (hoặc nhập tổng rồi "Chia theo tỉ lệ"), bấm "Tự chọn…". Cột "Đã chọn" cho biết mỗi ô đang có bao nhiêu câu.'],
      tips:['Mục "Giới hạn kiến thức ôn tập" khi xuất có đúng 3 cột: STT, Tên chủ đề, Tên bài.',
        'Muốn tạo luôn đề cương và các đề một lần: dùng "Tạo đề tự động theo ma trận" ở màn hình Tạo đề kiểm tra.']},
    matrices:{title:'Ma trận & đặc tả',purpose:'Lập, nhập, đối chiếu và khóa ma trận – bảng đặc tả; tạo đề theo ma trận.',
      steps:['"Nhập ma trận" → "Chọn Word hoặc gói JSON" để nhận ma trận của tổ (Khối 8, 10); hoặc "+ Tạo ma trận khối…" để tự thiết kế (Khối 9).',
        'Đi lần lượt 5 bước: 1. Thông tin hồ sơ → 2. Bài học & YCCĐ → 3. Phân bố câu hỏi và ý → 4. Đối chiếu & xác nhận → 5. Word & phiên bản dùng chung.',
        'Ở bước 3, chọn dạng câu được phép và cách chấm Đúng/Sai; ứng dụng cảnh báo tỉ lệ theo CV 7991 (chỉ cảnh báo).',
        'Bấm "Báo cáo thiếu câu theo ô" để biết ô nào chưa đủ câu đã duyệt; "Mở duyệt ô này" để sang màn hình duyệt đã lọc sẵn.',
        '"Xác nhận bản đã thống nhất để khóa" rồi "Khóa phiên bản này". Muốn sửa bản đã khóa: "Tạo phiên bản mới".',
        '"Tạo và lưu đề riêng" để sinh đề trực tiếp từ ma trận.'],
      tips:['Giữ nguyên YCCĐ, số câu, số điểm của ma trận gốc.','Đánh số câu dạng (1, 2, 3) hoặc (1a, 1b), không dùng (C1 - C4).']},
    exams:{title:'Tạo đề kiểm tra',purpose:'Sinh đề từ ngân hàng theo ma trận và đề cương, kiểm định, duyệt – khóa, phát hành và xuất hồ sơ.',
      steps:['Điền tên đề, khối, kì kiểm tra, thời gian; chọn ma trận (ma trận đã khóa ở "Ma trận & đặc tả" hiện bảng từng ô kèm YCCĐ) và đề cương nếu đã có.',
        'Bấm "Tạo và lưu đề kiểm tra". Nếu thiếu câu, ứng dụng báo rõ ô thiếu (không tự hạ mức độ hay đổi bài).',
        'Chưa có đề cương vẫn tạo được đề (chọn "Chưa gắn đề cương"); trước khi gửi duyệt, mở đề → chọn đề cương cạnh nút "Kiểm định lại" rồi kiểm định.',
        '"Tạo đề tự động theo ma trận": chọn số đề (1–6) và đề cương (tự lập, chỉnh số câu từng ô; hoặc bản đã lưu). Mỗi đề lấy 90% câu từ đề cương, 10% còn lại (ưu tiên Vận dụng) để phân hóa.',
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
  const api={questionTextBlocks,questionTextHtml,insertQuestionTemplate,levelAfterTypeChange,cognitiveLevels,levelOptions,examDraftKey,cleanExamDraft,saveExamDraft,loadExamDraft,screenGuide,SCREEN_GUIDES,reviewFiltersForCell,nextKttxNumber,examStatusOf,examActions,examEditable,reviewQueue,reviewStatusOf,reviewKeyAction,stepIndex,checklistMissing,reviewProgress,mcExplanations,shortAnswerOf,syncEditedQuestionsFromSheet,scopedUrl,contextGrades,courseLessons,normalize,jsonHeaders,formatStoragePrefix,filterQuestions,blueprintSummary,matrixCellCoverage,cellMatches,distributeCountsByLesson,distributeCounts,sourceTemplateRequired,templateBlocked,revisionIds,escapeHtml,DocFormatter};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else{root.BankCore=api;root.DocFormatter=DocFormatter;}
})(typeof window!=='undefined'?window:globalThis);
