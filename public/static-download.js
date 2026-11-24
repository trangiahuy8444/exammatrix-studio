/* Tạo tệp thật từ snapshot; không gửi nội dung đề lên dịch vụ bên ngoài. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./static-exam-export.js'),require('./static-exam-workflow.js'));
 else root.BankStaticDownload=factory(root.BankStaticExport,root.BankStaticWorkflow);
})(typeof window!=='undefined'?window:globalThis,function(exporter,workflow){
 'use strict';
 const encode=value=>new TextEncoder().encode(value),clone=x=>JSON.parse(JSON.stringify(x));
 const name=value=>String(value).replace(/[^\p{L}\p{N}._-]/gu,'_').slice(0,100);
 // Tên tệp dễ đọc cho giáo viên: môn, khối, kì, mã đề (không còn mã kỹ thuật EXAM-… / REV-…).
 const ascii=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D');
 const readable=record=>{const parts=[record.subject_name,record.grade?'Khoi_'+record.grade:'',record.exam_type,record.exam_code?'Ma_'+record.exam_code:''].filter(Boolean).map(x=>ascii(x).replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,''));return parts.filter(Boolean).join('_')||name(record.id);};
 const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 function fail(message){throw Error(message);}
 function find(list,id){const r=(list||[]).find(r=>r.id===id);if(!r)fail('Không tìm thấy hồ sơ cần xuất trong không gian hiện tại.');return r;}
 function studentRecord(record){
  const fields=['id','type','question','options','points','slot_number','lesson_code','learning_outcome','level'];
  return {title:record.title,grade:record.grade,subject_name:record.subject_name,duration:record.duration,exam_code:record.exam_code,
   questions:record.questions.map(q=>{const out=Object.fromEntries(fields.filter(k=>q[k]!==undefined).map(k=>[k,clone(q[k])]));if(q.type==='YN')out.statements=(q.statements||[]).map(s=>({label:s.label,text:s.text}));return out;})};
 }
 async function assertIntegrity(record){
  if(['locked','published'].includes(record.status)&&record.questions&&record.approved_hash&&await workflow.contentHash(record)!==record.approved_hash)
   fail('Nội dung đề đã thay đổi sau khi khóa. Không xuất hồ sơ; hãy kiểm tra và duyệt lại phiên bản mới.');
  if(['locked','published'].includes(record.status)&&record.questions&&record.exam_type&&!record.approved_hash)
   fail('Đề cũ thiếu dấu kiểm chứng lúc khóa. Hãy tạo bản chỉnh sửa và duyệt lại trước khi xuất.');
 }
 async function createDownload(path,input,options={}){
  const data=clone(input),url=new URL(path,'https://pages.local'),match=/^\/api\/(exams|revisions|matrices)\/([^/]+)\/(export|bundle\.zip)$/.exec(url.pathname);
  if(!match)fail('Liên kết tải này chưa được hỗ trợ trên Pages.');
  const [,kind,rawId,action]=match,id=decodeURIComponent(rawId),record=find(data[kind],id),format=url.searchParams.get('format')||'docx';
  const answers=url.searchParams.get('answers')==='1',revision=kind==='revisions',warnings=[];
  if(kind!=='matrices'&&(!Array.isArray(record.questions)||!record.questions.length))fail('Hồ sơ chưa có câu hỏi thực tế; không thể xuất đề trống. Hãy tạo lại theo ma trận đã kiểm định.');
  if(options.subject&&(record.subject_name||'Tin học')!==options.subject)fail('Hồ sơ thuộc môn khác. Hãy chuyển đúng môn trước khi tải.');
  if((answers||action==='bundle.zip'||url.searchParams.get('target')==='lms')&&options.canViewAnswers===false)fail('Tài khoản này không có quyền tải đáp án.');
  if(format==='pdf')fail('Bản Pages chưa chuyển Word sang PDF. Hãy tải DOCX rồi dùng Microsoft Word xuất PDF theo quy trình của trường.');
  if(url.searchParams.get('target')==='lms')fail('Bản Pages chưa kiểm chứng tệp Word LMS cho đủ các dạng câu. Hãy dùng bản máy chủ để xuất LMS.');
  if(format!=='docx'&&format!=='json')fail('Bản Pages hiện hỗ trợ DOCX và JSON. Định dạng này cần bản máy chủ.');
  if(kind!=='matrices'&&(!Array.isArray(record.questions)||!record.questions.length))fail('Hồ sơ chưa có snapshot câu hỏi để xuất.');
  if(kind==='exams')await assertIntegrity(record);
  const prefix=(revision?'De_cuong_':kind==='matrices'?'Ma_tran_':answers?'Dap_an_':'De_hoc_sinh_')+readable(record);
  if(action==='bundle.zip'){
   if(kind!=='exams'||format!=='docx')fail('Gói hồ sơ Pages chỉ hỗ trợ bộ đề Word DOCX.');
   const entries=[],family=record.parent_exam_id||record.id;
   const members=data.exams.filter(e=>e.id===record.id||e.parent_exam_id===family||e.id===family);
   const codeCount=members.reduce((m,e)=>m.set(e.exam_code||e.id,(m.get(e.exam_code||e.id)||0)+1),new Map());
   for(const e of members){await assertIntegrity(e);const raw=e.exam_code||e.id,code=name(raw)+(codeCount.get(raw)>1?'_'+name(e.id):'');
    entries.push({name:'De_hoc_sinh_Ma_'+code+'.docx',data:exporter.documentBytes(e)});
    entries.push({name:'Dap_an_Ma_'+code+'.docx',data:exporter.documentBytes(e,{answers:true})});
   }
   const rev=record.revision_snapshot||data.revisions.find(r=>r.id===record.revision_id);
   if(rev){const scope=record.matrix_snapshot||data.matrices.find(m=>m.id===record.matrix_id);entries.push({name:'De_cuong_on_tap.docx',data:exporter.documentBytes({...rev,matrix_snapshot:scope},{revision:true})});warnings.push(...exporter.exportWarnings({revision:true}));}
   else warnings.push('Thiếu đề cương liên kết.');
   const matrix=record.matrix_snapshot||data.matrices.find(m=>m.id===record.matrix_id);
   if(matrix)entries.push({name:'Ma_tran_va_dac_ta.docx',data:exporter.matrixBytes(matrix)});else warnings.push('Đề dùng phân bố tự thiết lập, không có hồ sơ ma trận/đặc tả riêng.');
   warnings.push('Chưa kèm PDF chuyển từ Microsoft Word, tệp LMS hoặc bảng đối chiếu mã đề.','Bản xuất kỹ thuật cần giáo viên kiểm bố cục, ngắt trang và đối chiếu mẫu trường trước khi nộp.');
   if(members.some(e=>!['locked','published'].includes(e.status)))warnings.push('Gói có đề BẢN NHÁP chưa được duyệt phát hành.');
   entries.push({name:'Bao_cao_dong_goi_ho_so.txt',data:'GÓI HỒ SƠ WORD — '+members.length+' đề/mã\n'+warnings.join('\n')});
   return {bytes:exporter.zipFiles(entries),mime:'application/zip',filename:'Ho_so_'+name(record.id)+'.zip',warnings};
  }
  if(format==='json')return {bytes:encode(JSON.stringify(answers||kind==='matrices'?record:studentRecord(record),null,2)),mime:'application/json;charset=utf-8',filename:prefix+'.json',warnings};
  if(revision)warnings.push(...exporter.exportWarnings({revision:true}));
  const bytes=kind==='matrices'?exporter.matrixBytes(record):exporter.documentBytes(record,{answers,revision});
  return {bytes,mime:DOCX,filename:prefix+'.docx',warnings};
 }
 return {createDownload};
});
