/* Báo cáo chỉ đọc; cùng hợp đồng với domain/exam_comparison.py. */
(function(root) {
 'use strict';
 const contextKeys=['subject_name','grade','exam_type','duration'];
 const fields=['type','level','lesson_code','learning_outcome'];
 const dimensions=[...fields,'cells','question_weights'];
 const limitation='Đối chiếu theo từng câu hỏi, chưa đo mức độ từng ý hoặc độ khó, độ phân biệt. Khớp cấu trúc không chứng minh tương đương tâm trắc. Tỷ lệ dùng chung mã câu không chứng minh nội dung hoặc phiên bản giống nhau.';
 const text=v=>typeof v==='string'?v.trim():'';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function units(v){
  if(!['string','number'].includes(typeof v)||text(v)===''&&typeof v==='string')return null;
  // Cùng cú pháp số thập phân với Python; không nhận hex hoặc chuỗi trắng.
  if(typeof v==='string'&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v.trim()))return null;
  const n=Number(v);if(!Number.isFinite(n)||n<0||n>10000)return null;
  // Làm tròn số thập phân bằng số nguyên để đồng nhất với Decimal của Python.
  const [mantissa,exponent='0']=String(v).trim().replace(/^[+-]/,'').toLowerCase().split('e');
  const [whole,fraction='']=mantissa.split('.'),digits=(whole+fraction).replace(/^0+/,'');
  if(!digits)return 0;
  const shift=Number(exponent)-fraction.length+6;
  if(shift>=0)return Number(BigInt(digits)*10n**BigInt(shift));
  if(-shift>digits.length)return 0;
  const divisor=10n**BigInt(-shift);
  return Number((BigInt(digits)+divisor/2n)/divisor);
 }
 function summary(e){
  const issues=[],ids=new Set(),buckets=Object.fromEntries(dimensions.map(d=>[d,new Map()]));
  const context=Object.fromEntries(contextKeys.map(k=>[k,e[k]??null]));
  if(!text(context.subject_name)||!Number.isInteger(context.grade)||typeof context.grade!=='number'||context.grade<1||context.grade>12||
     !text(context.exam_type)||!Number.isInteger(context.duration)||typeof context.duration!=='number'||context.duration<1||context.duration>300)
   issues.push('Thiếu hoặc sai thông tin môn, khối, kỳ hoặc thời lượng.');
  const questions=Array.isArray(e.questions)?e.questions:[];
  if(!questions.length)issues.push('Đề chưa có danh sách câu hỏi đầy đủ.');
  let total=0;
  for(const q of questions){
   if(!q||typeof q!=='object'||Array.isArray(q)){issues.push('Có câu hỏi sai định dạng.');continue;}
   const id=text(q.id);if(!id||ids.has(id))issues.push('Có mã câu bị thiếu hoặc lặp trong đề.');if(id)ids.add(id);
   const values=Object.fromEntries(fields.map(k=>[k,text(q[k])]));
   if(Object.values(values).some(v=>!v)||!['MC','YN','SHORT','ES'].includes(values.type)||!['Biết','Hiểu','Vận dụng','Vận dụng cao'].includes(values.level))
    issues.push('Có câu thiếu hoặc sai dạng, mức độ, bài hoặc YCCĐ.');
   let points=units(q.points);if(points===null){issues.push('Có câu thiếu điểm hoặc điểm không hợp lệ.');points=0;}total+=points;
   const cell=fields.map(k=>values[k]);
   values.cells=JSON.stringify(cell);values.question_weights=JSON.stringify([...cell,points]);
   for(const d of dimensions){const row=buckets[d].get(values[d])||[0,0];row[0]++;row[1]+=points;buckets[d].set(values[d],row);}
  }
  return [{id:e.id,title:text(e.title)||e.id,context,question_count:questions.length,total_points:total/1e6,
   dimensions:Object.fromEntries(dimensions.map(d=>[d,[...buckets[d]].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>({key,count:v[0],points:v[1]/1e6}))])),
   issues:[...new Set(issues)]},ids];
 }
 function compareExams(exams){
  if(!Array.isArray(exams)||exams.length<2||exams.length>6)throw Error('Chọn từ 2 đến 6 đề đã lưu để so sánh.');
  const ids=exams.map(e=>e?.id);
  if(ids.some(id=>!text(id))||new Set(ids).size!==ids.length)throw Error('Mỗi đề phải có mã riêng, không để trống hoặc chọn lặp.');
  const data=exams.map(summary),pairs=[];
  for(let i=0;i<exams.length;i++)for(let j=i+1;j<exams.length;j++){
   const [a,ai]=data[i],[b,bi]=data[j],differences=contextKeys.filter(k=>a.context[k]!==b.context[k]);
   for(const k of ['question_count','total_points'])if(a[k]!==b[k])differences.push(k);
   for(const d of dimensions)if(JSON.stringify(a.dimensions[d])!==JSON.stringify(b.dimensions[d]))differences.push(d);
   const complete=!a.issues.length&&!b.issues.length,shared=[...ai].filter(id=>bi.has(id)).length;
   pairs.push({left_id:a.id,right_id:b.id,same_structure:complete?!differences.length:null,differences,shared_question_ids:shared,
    overlap_percent:complete?Math.round(10000*shared/new Set([...ai,...bi]).size)/100:null,
    same_family:(exams[i].parent_exam_id||a.id)===(exams[j].parent_exam_id||b.id)});
  }
  return {summaries:data.map(d=>d[0]),pairs,limitation};
 }
 const labels={subject_name:'Môn học',grade:'Khối',exam_type:'Kỳ kiểm tra',duration:'Thời lượng',question_count:'Số câu',total_points:'Tổng điểm',type:'Dạng câu',level:'Mức độ',lesson_code:'Bài học',learning_outcome:'YCCĐ',cells:'Ô bài × YCCĐ × dạng × mức độ',question_weights:'Điểm từng câu trong cùng ô'};
 function reportHtml(report){
  const exams=report.summaries,byId=new Map(exams.map(e=>[e.id,e]));
  let html=`<p class="callout">${esc(report.limitation)} Tỷ lệ dùng chung = số mã chung / tổng số mã của hai đề (không đếm lặp).</p>`;
  html+='<h3>Kết quả từng cặp đề</h3><ul>'+report.pairs.map(p=>`<li><strong>${esc(byId.get(p.left_id).title)} / ${esc(byId.get(p.right_id).title)}: ${p.same_structure===null?'Chưa đủ căn cứ':p.same_structure?'Khớp cấu trúc theo câu':'Có chênh lệch cấu trúc'}</strong>`+
   `${p.differences.length?'<p>Cần kiểm tra: '+p.differences.map(k=>esc(labels[k])).join(', ')+'.</p>':''}`+
   `<p>Dùng chung ${p.shared_question_ids} mã câu${p.overlap_percent===null?' (chưa đủ căn cứ tính tỷ lệ)':` (${p.overlap_percent}%)`}.${p.same_family?' Cùng gia đình hoán vị: đây không phải hai đề gốc độc lập.':''}</p></li>`).join('')+'</ul>';
  for(const e of exams)if(e.issues.length)html+=`<p class="callout error"><strong>${esc(e.title)}</strong>: ${e.issues.map(esc).join(' ')}</p>`;
  const row=(label,values)=>`<tr><th scope="row">${esc(label)}</th>${values.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`;
  html+='<div style="overflow-x:auto"><table><caption>Tổng quan đề đã lưu</caption><thead><tr><th>Tiêu chí</th>'+exams.map(e=>`<th scope="col">${esc(e.title)}</th>`).join('')+'</tr></thead><tbody>';
  for(const k of contextKeys)html+=row(labels[k],exams.map(e=>e.context[k]??'Thiếu dữ liệu'));
  for(const k of ['question_count','total_points'])html+=row(labels[k],exams.map(e=>e[k]));
  html+='</tbody></table></div>';
  for(const d of dimensions){
   const keys=[...new Set(exams.flatMap(e=>e.dimensions[d].map(r=>r.key)))].sort();
   html+=`<details><summary>${esc(labels[d])} — số câu / điểm</summary><div style="overflow-x:auto"><table><thead><tr><th>Nhóm</th>`+exams.map(e=>`<th scope="col">${esc(e.title)}</th>`).join('')+'</tr></thead><tbody>';
   for(const k of keys){const parts=(d==='cells'||d==='question_weights')?JSON.parse(k):null;
    if(d==='question_weights')parts[parts.length-1]=`${parts[parts.length-1]/1e6} điểm/câu`;
    const label=parts?parts.join(' · '):k;
    html+=row(label||'Thiếu dữ liệu',exams.map(e=>{const r=e.dimensions[d].find(r=>r.key===k);return r?`${r.count} câu / ${r.points} điểm`:'0 câu / 0 điểm';}));}
   html+='</tbody></table></div></details>';
  }
  return html;
 }
 const api={compareExams,reportHtml,limitation};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BankExamComparison=api;
})(typeof window!=='undefined'?window:globalThis);
