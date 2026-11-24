/* Offline, synchronous OOXML export. No network, DOM, or third-party packages.
 * Bounds: ZIP32 stored entries only; 32 MiB total, 4096 entries, 2000 questions.
 * Literal text/code and rectangular grammar tables only. No images, equations,
 * PDF, template fidelity, or school revision banner. Footer shows "Trang X/Y" via Word fields. Call
 * exportWarnings({revision:true}) before presenting a revision download.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.BankStaticExport=factory(root.BankCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(core){
  'use strict';
  const encoder=new TextEncoder(),MAX=32*1024*1024,WIDTH=13600;
  const limitations=Object.freeze(['Chỉ hỗ trợ ZIP32 không nén; giới hạn 32 MiB và 4096 mục.', 'Tối đa 2000 câu hỏi; chỉ hỗ trợ văn bản thuần, khối mã trong dấu rào và bảng chữ nhật phân cột bằng dấu |.', 'Chưa hỗ trợ hình ảnh, đối tượng phương trình, PDF và định dạng hoàn toàn giống mẫu. Số trang "Trang X/Y" do Word tính khi mở tệp.', 'Bản xuất đề cương thiếu logo hoặc banner của trường; hồ sơ chưa đầy đủ theo mẫu đề cương của trường.']);
  function exportWarnings(options={}){return options.revision?[limitations[3]]:[];}
  function fail(message){throw new Error(message);}
  function bytes(value){if(typeof value==='string')return encoder.encode(value);if(value instanceof Uint8Array)return value;return fail('Dữ liệu ZIP phải là mảng byte Uint8Array hoặc chuỗi văn bản.');}
  function concat(parts){const n=parts.reduce((s,p)=>s+p.length,0);if(n>MAX)fail('Tệp xuất vượt giới hạn 32 MiB.');const out=new Uint8Array(n);let at=0;parts.forEach(p=>{out.set(p,at);at+=p.length;});return out;}
  const crcTable=Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=(i>>>1)^((i&1)?0xedb88320:0);return i>>>0;});
  function crc32(data){let c=0xffffffff;for(const b of data)c=(c>>>8)^crcTable[(c^b)&255];return (c^0xffffffff)>>>0;}
  function header(size){const b=new Uint8Array(size),v=new DataView(b.buffer);return {b,u16:(p,n)=>v.setUint16(p,n,true),u32:(p,n)=>v.setUint32(p,n,true)};}
  function zipFiles(entries){
    if(!Array.isArray(entries)||entries.length>4096)fail('Danh sách mục ZIP không hợp lệ hoặc vượt giới hạn 4096 mục.');
    const local=[],central=[],seen=new Set();let offset=0;
    entries.forEach(entry=>{
      const name=entry&&entry.name;
      if(typeof name!=='string'||!name||/[\\:\x00-\x1f\x7f]/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))fail('Tên hoặc đường dẫn trong ZIP không an toàn.');
      if(seen.has(name))fail('Tên mục trong ZIP bị trùng.');seen.add(name);
      const n=bytes(name),data=bytes(entry.data);if(n.length>65535)fail('Tên mục trong ZIP quá dài.');
      if(offset+data.length+n.length+30>MAX)fail('Tệp xuất vượt giới hạn 32 MiB.');
      const crc=crc32(data),h=header(30);h.u32(0,0x04034b50);h.u16(4,20);h.u16(6,0x800);h.u16(12,33);h.u32(14,crc);h.u32(18,data.length);h.u32(22,data.length);h.u16(26,n.length);
      local.push(h.b,n,data);
      const c=header(46);c.u32(0,0x02014b50);c.u16(4,20);c.u16(6,20);c.u16(8,0x800);c.u16(14,33);c.u32(16,crc);c.u32(20,data.length);c.u32(24,data.length);c.u16(28,n.length);c.u32(42,offset);central.push(c.b,n);offset+=30+n.length+data.length;
    });
    const size=central.reduce((s,b)=>s+b.length,0),end=header(22);end.u32(0,0x06054b50);end.u16(8,entries.length);end.u16(10,entries.length);end.u32(12,size);end.u32(16,offset);return concat([...local,...central,end.b]);
  }
  function text(v){if(v===undefined||v===null)return '';if(typeof v==='object')fail('Chưa hỗ trợ hình ảnh, phương trình hoặc đối tượng văn bản có cấu trúc.');const s=String(v);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(s))fail('Chưa hỗ trợ ký tự điều khiển XML trong văn bản.');return s;}
  function esc(v){return text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
  // Số thập phân theo cách viết tiếng Việt: 0,25; 1; 2,5.
  function num(v){const n=Number(v);if(!Number.isFinite(n))return text(v);return String(Number(n.toFixed(6))).replace('.',',');}
  // Nhãn phương án và nội dung cùng một dòng khi nội dung là một dòng văn bản thường.
  function labeled(label,value){
    const s=text(value);
    if(!/[\n|`]/.test(s)&&!/!\[[^\]]*\]\(|<(?:img|svg|math)\b/i.test(s))return p(label+' '+s);
    return p(label)+rich(s);
  }
  function p(value,bold=false){return '<w:p><w:r>'+(bold?'<w:rPr><w:b/></w:rPr>':'')+'<w:t xml:space="preserve">'+esc(value)+'</w:t></w:r></w:p>';}
  function table(rows){
    if(!rows.length)return '';const cols=rows[0].length;if(!cols||cols>32||rows.some(r=>r.length!==cols))fail('Chưa hỗ trợ bảng không có dạng chữ nhật hoặc vượt quá 32 cột.');
    const width=Math.floor(WIDTH/cols);
    return '<w:tbl><w:tblPr><w:tblW w:w="'+(width*cols)+'" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(k=>'<w:'+k+' w:val="single" w:sz="4"/>').join('')+'</w:tblBorders></w:tblPr><w:tblGrid>'+rows[0].map(()=>'<w:gridCol w:w="'+width+'"/>').join('')+'</w:tblGrid>'+rows.map((r,i)=>'<w:tr>'+(i===0?'<w:trPr><w:tblHeader/></w:trPr>':'')+r.map(c=>'<w:tc><w:tcPr><w:tcW w:w="'+width+'" w:type="dxa"/></w:tcPr>'+text(c).split('\n').map(s=>p(s,i===0)).join('')+'</w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>'+p('');
  }
  function rich(value){
    const s=text(value);if(/!\[[^\]]*\]\(|<(?:img|svg|math)\b/i.test(s))fail('Chưa hỗ trợ mã đánh dấu hình ảnh hoặc phương trình.');
    if(!core||typeof core.questionTextBlocks!=='function')fail('Cần nạp BankCore.questionTextBlocks để xuất đúng cấu trúc văn bản.');
    return core.questionTextBlocks(s).map(([kind,content])=>kind==='table'?table(content):content.map(line=>p(line)).join('')).join('');
  }
  function rejectMedia(value){
    if(!value||typeof value!=='object')return;
    for(const [key,v] of Object.entries(value)){
      if(/^(images?|equations?|math|attachments?|media|drawing)$/i.test(key)&&v!=null&&v!==''&&(!Array.isArray(v)||v.length))fail('Chưa hỗ trợ hình ảnh, phương trình hoặc nội dung đa phương tiện tại trường: '+key);
      if(/^(image|equation|math|drawing)$/i.test(String(value.type||'')))fail('Chưa hỗ trợ đối tượng hình ảnh hoặc phương trình.');
      if(v&&typeof v==='object')rejectMedia(v);
    }
  }
  function run(t){return '<w:r><w:t xml:space="preserve">'+esc(t)+'</w:t></w:r>';}
  // Trường PAGE/NUMPAGES; giá trị "1" chỉ là chỗ giữ, Word tính lại khi mở hoặc in.
  function field(code){return '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> '+code+' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';}
  const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  function doc(body){
    const entries={
      '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
      'word/footer1.xml':'<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>'+run('Trang ')+field('PAGE')+run('/')+field('NUMPAGES')+'</w:p></w:ftr>',
      'word/styles.xml':'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>',
      'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="567" w:right="1440" w:bottom="567" w:left="1440" w:header="0" w:footer="284" w:gutter="0"/></w:sectPr></w:body></w:document>'
    };return zipFiles(Object.entries(entries).map(([name,data])=>({name,data:declaration+data})));
  }
  function scope(record){
    const matrix=record.matrix_snapshot||record.matrix||{},lessons=matrix.lessons||record.lessons||[];
    return p('A. GIỚI HẠN KIẾN THỨC ÔN TẬP',true)+table([['STT','Tên chủ đề','Tên bài'],...lessons.map((l,i)=>[i+1,l.topic||l.topic_name||'',l.title||l.lesson_name||l.name||l.code||''])]);
  }
  function documentBytes(record,{answers=false,revision=false}={}){
    if(!record||!Array.isArray(record.questions))fail('Cần danh sách bản chụp câu hỏi nguồn để xuất tài liệu.');
    if(record.questions.length>2000)fail('Số câu hỏi vượt giới hạn xuất 2000 câu.');
    let body=p(record.title||record.name||(revision?'ĐỀ CƯƠNG ÔN TẬP':'ĐỀ KIỂM TRA'),true);
    if(!['locked','published'].includes(record.status))body+=p('BẢN NHÁP — CHƯA DUYỆT PHÁT HÀNH',true);
    body+=p([record.subject_name,record.grade?'Khối '+record.grade:'',record.exam_type,record.duration?record.duration+' phút':'',record.exam_code?'Mã '+record.exam_code:''].filter(Boolean).join(' · '));
    if(revision)body+=p(exportWarnings({revision:true})[0])+scope(record);
    const order=['MC','YN','SHORT','ES'],headings={MC:'TRẮC NGHIỆM NHIỀU LỰA CHỌN',YN:'TRẮC NGHIỆM ĐÚNG / SAI',SHORT:'TRẢ LỜI NGẮN',ES:'TỰ LUẬN'};let previous;
    record.questions.slice().sort((a,b)=>order.indexOf(a?.type)-order.indexOf(b?.type)).forEach((q,i)=>{
      rejectMedia(q);if(!['MC','YN','SHORT','ES'].includes(q.type))fail('Chưa hỗ trợ dạng câu hỏi này.');
      if(q.type!==previous){body+=p(headings[q.type],true);previous=q.type;}
      body+=p('Câu '+text(q.slot_number??q.number??i+1)+'.'+(q.points!==undefined?' ('+num(q.points)+' điểm)':''),true)+rich(q.question);
      if(q.type==='MC'){
        if(!Array.isArray(q.options))fail('Danh sách phương án câu hỏi trắc nghiệm không hợp lệ.');
        q.options.forEach((o,j)=>{body+=labeled(String.fromCharCode(65+j)+'.',o);});
        if(answers){if(!Number.isInteger(q.correct)||q.correct<0||q.correct>=q.options.length)fail('Chỉ số phương án đúng của câu hỏi trắc nghiệm không hợp lệ.');body+=p('Đáp án: '+String.fromCharCode(65+q.correct),true);}
      }
      if(q.type==='YN'){
        if(!Array.isArray(q.statements))fail('Danh sách mệnh đề câu hỏi đúng/sai không hợp lệ.');
        q.statements.forEach((s,j)=>{body+=labeled(text(s.label||String.fromCharCode(97+j))+')',s.text);if(answers){if(typeof s.correct!=='boolean')fail('Giá trị đáp án câu hỏi đúng/sai phải là đúng hoặc sai.');body+=p(s.correct?'Đúng':'Sai',true);if(s.explanation)body+=rich(s.explanation);}});
      }
      if(answers){
        if(q.type==='SHORT')body+=p('Đáp án: '+(core.shortAnswerOf?core.shortAnswerOf(q):text(q.short_answer??q.correct_answer??q.answer)),true);
        if(q.type==='ES'&&q.answer)body+=rich(q.answer);
        if(q.type==='ES'&&Array.isArray(q.rubric)){
          const rawTotal=q.rubric.reduce((sum,r)=>sum+Number(r.points),0),base=Number(q.max_score??rawTotal),target=Number(q.points??base);
          if(!Number.isFinite(base)||base<=0||!Number.isFinite(target)||target<0)fail('Không thể quy đổi điểm hướng dẫn chấm.');
          if(Math.abs(rawTotal-base)>1e-8)fail('Tổng điểm hướng dẫn chấm gốc không khớp thang điểm gốc; hãy sửa trước khi xuất.');
          const scale=revision?1:target/base;
          body+=table([['Tiêu chí','Điểm'],...q.rubric.map(r=>{if(typeof r.points!=='number'||!Number.isFinite(r.points)||r.points<0)fail('Điểm của tiêu chí chấm phải là số hữu hạn và không âm.');return [text(r.criterion),num(r.points*scale)];})]);
        }
        for(const key of ['explanation','equivalent_answer_policy'])if(q[key])body+=rich(q[key]);
        if(Array.isArray(q.option_explanations))q.option_explanations.forEach((e,j)=>{if(e)body+=labeled(String.fromCharCode(65+j)+'.',e);});
      }else if(['SHORT','ES'].includes(q.type))body+=p('................................................................................................');
    });return doc(body);
  }
  function matrixBytes(matrix){
    if(!matrix||!Array.isArray(matrix.requirements)||!Array.isArray(matrix.slots))fail('Cần danh sách yêu cầu cần đạt và vị trí câu hỏi của ma trận.');rejectMedia(matrix);
    if(matrix.requirements.length>4000||matrix.slots.length>2000)fail('Ma trận vượt giới hạn 4000 yêu cầu cần đạt hoặc 2000 vị trí câu hỏi.');
    const reqs=matrix.requirements,slots=matrix.slots,lessons=matrix.lessons||[];
    let body=p('MA TRẬN — '+text(matrix.title||matrix.name||''),true);
    body+=table([['Bài','Mức độ','Dạng','Câu','Điểm'],...slots.map((s,i)=>{
      const parts=s.parts||[],rs=parts.map(part=>{const r=reqs.find(r=>r.id===part.requirement_id);if(!r)fail('Không tìm thấy yêu cầu cần đạt được tham chiếu trong ma trận.');return r;});
      const points=parts.reduce((sum,part)=>{if(typeof part.points!=='number'||!Number.isFinite(part.points)||part.points<0)fail('Điểm phân bổ trong ma trận phải là số hữu hạn và không âm.');return sum+part.points;},0);
      return [[...new Set(rs.map(r=>r.lesson_code))].join(', '),[...new Set(rs.map(r=>r.level))].join(', '),s.kind,s.number??i+1,num(points)];
    })]);
    body+=p('BẢNG ĐẶC TẢ',true)+table([['Bài / Chủ đề','Yêu cầu cần đạt','Mức độ','Phân bổ'],...reqs.map(r=>{
      const refs=[];slots.forEach((s,i)=>(s.parts||[]).forEach(part=>{if(part.requirement_id===r.id)refs.push('Câu '+(s.number??i+1)+(part.label?' '+part.label:'')+' ('+s.kind+')');}));
      const l=lessons.find(l=>(l.code||l.lesson_code)===r.lesson_code)||{};
      return [[l.topic,l.title||r.lesson_code].filter(Boolean).join(' / '),text(r.text),r.level||'',refs.join(', ')];
    })]);
    if(matrix.competency_catalog?.length){
      const names=new Map(matrix.competency_catalog.map(c=>[c.code,c.name]));
      body+=p('PHÂN BỐ NĂNG LỰC VÀ CHỈ BÁO',true)+table([['Câu / Ý','Mức độ','Thành phần năng lực','Mã chỉ báo'],...slots.flatMap(s=>(s.parts||[]).map(part=>{
        const r=reqs.find(r=>r.id===part.requirement_id)||{};
        return ['Câu '+s.number+(part.label||''),r.level||'',[r.competency,names.get(r.competency)].filter(Boolean).join(' · '),part.indicator||''];
      }))]);
      body+=p('DANH MỤC CHỈ BÁO ĐÃ SỬ DỤNG',true)+table([['Thành phần năng lực','Mã chỉ báo','Mô tả'],...(matrix.indicator_catalog||[]).map(c=>[[c.competency,names.get(c.competency)].filter(Boolean).join(' · '),c.code,c.text])]);
    }
    return doc(body);
  }
  return Object.freeze({zipFiles,documentBytes,matrixBytes,exportWarnings,limitations});
});
