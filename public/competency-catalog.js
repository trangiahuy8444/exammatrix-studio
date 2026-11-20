/* Bộ đọc danh mục độc lập, không truy cập mạng hay thay đổi dữ liệu đầu vào.
 * Giới hạn: 5 MiB đầu vào, 2000 dòng dữ liệu, ZIP 256 mục/20 MiB giải nén,
 * tối đa 8 MiB/mục và tỷ lệ nén 200:1. Mã Excel phải là ô văn bản.
 * XLSX cần DOMParser và DecompressionStream('deflate-raw') của trình duyệt.
 * row: số dòng bảng/Excel (tính tiêu đề), 0 cho lỗi toàn tệp/danh mục.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.BankCompetencyCatalog = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const MAX = 5 * 1024 * 1024, ROWS = 2000, TOTAL = 20 * 1024 * 1024, ENTRY = 8 * 1024 * 1024;
  const HEADERS = ['Mã năng lực', 'Tên thành phần năng lực', 'Mã chỉ báo', 'Mô tả chỉ báo'];
  const empty = () => ({ competencies: [], indicators: [] });
  const norm = v => typeof v === 'string' ? v.normalize('NFC').trim() : '';
  const report = (catalog, errors) => ({ valid: !errors.length, errors, catalog });
  const fail = (message, row = 0) => report(empty(), [{ row, message }]);
  const size = s => new TextEncoder().encode(s).length;
  function validate(input) {
    const catalog = empty(), errors = [], names = new Map(), codes = new Set();
    const add = (row, message) => errors.push({row, message});
    if (!input || !Array.isArray(input.competencies) || !Array.isArray(input.indicators)) return fail('Danh mục phải có danh sách năng lực và chỉ báo.');
    if (input.competencies.length > ROWS || input.indicators.length > ROWS) return fail('Tối đa 2000 dòng dữ liệu.');
    for (const [i, value] of input.competencies.entries()) {
      const code = norm(value && value.code), name = norm(value && value.name);
      if (!code || !name) { add(i+1, 'Thiếu mã hoặc tên năng lực (phải là văn bản).'); continue; }
      if (names.has(code)) { add(i+1, `Trùng mã năng lực ${code}${names.get(code) !== name ? ': tên mâu thuẫn' : ''}.`); continue; }
      names.set(code, name); catalog.competencies.push({code, name});
    }
    for (const [i, value] of input.indicators.entries()) {
      const code = norm(value && value.code), competency = norm(value && value.competency), text = norm(value && value.text);
      if (!code || !competency || !text) { add(i+1, 'Thiếu mã chỉ báo, mã năng lực hoặc mô tả (phải là văn bản).'); continue; }
      if (codes.has(code)) { add(i+1, `Trùng mã chỉ báo ${code}.`); continue; }
      codes.add(code);
      if (!names.has(competency)) add(i+1, `Mã năng lực ${competency} chưa được khai báo.`);
      catalog.indicators.push({code, competency, text});
    }
    if (!catalog.competencies.length || !catalog.indicators.length) add(0, 'Danh mục cần ít nhất một năng lực và một chỉ báo.');
    if (size(JSON.stringify(catalog)) > MAX) add(0, 'Danh mục vượt giới hạn 5 MB.');
    return report(catalog, errors);
  }
  // positions là số dòng thật của worksheet; không lấp hàng triệu dòng trống.
  function rowsReport(rows, positions) {
    if (!Array.isArray(rows)) return fail('Dữ liệu phải là bảng 4 cột.');
    if (rows.length > ROWS + 1) return fail('Tối đa 2000 dòng dữ liệu (không tính tiêu đề).');
    const catalog = empty(), errors = [], names = new Map(), codes = new Set();
    let header = false, bytes = 0;
    for (let i=0; i<rows.length; i++) {
      const row = rows[i], number = positions ? positions[i] : i+1;
      if (!Array.isArray(row)) { errors.push({row:number,message:'Dòng phải là bảng 4 cột.'}); continue; }
      bytes += row.reduce((s,v)=>s+(typeof v === 'string' ? size(v) : 0),0);
      if (bytes > MAX) return fail('Dữ liệu vượt giới hạn 5 MB.');
      if (row.every(v => v == null || typeof v === 'string' && !norm(v))) continue;
      const values = Array.from({length:4},(_,j)=>norm(row[j]));
      if (!header) {
        header = true;
        if (row.length !== 4 || !HEADERS.every((v,j)=>v === values[j])) return fail('Tiêu đề phải đúng 4 cột: '+HEADERS.join(', ')+'.',number);
        continue;
      }
      if (row.length > 4) { errors.push({row:number,message:'Mỗi dòng chỉ được có 4 cột.'}); continue; }
      if (row.some(v => v != null && typeof v !== 'string')) { errors.push({row:number,message:'Các ô phải là văn bản; đặt mã Excel ở định dạng Text để giữ nguyên mã.'}); continue; }
      if (values.some(v=>!v)) { errors.push({row:number,message:'Thiếu ô: cần đủ mã năng lực, tên năng lực, mã chỉ báo và mô tả.'}); continue; }
      const [competency,name,code,text] = values;
      if (names.has(competency) && names.get(competency) !== name) errors.push({row:number,message:`Mã năng lực ${competency} có tên khác (mâu thuẫn).`});
      else if (!names.has(competency)) { names.set(competency,name);catalog.competencies.push({code:competency,name}); }
      if (codes.has(code)) errors.push({row:number,message:`Trùng mã chỉ báo ${code}.`});
      else {codes.add(code);catalog.indicators.push({code,competency,text});}
    }
    if (!header || !catalog.indicators.length) errors.push({row:0,message:'Bảng chưa có dữ liệu chỉ báo hợp lệ.'});
    return report(catalog,errors);
  }
  function parseRows(rows) { return rowsReport(rows); }
  function parseText(text) {
    if (typeof text !== 'string') return fail('Nội dung nhập phải là văn bản.');
    if (size(text)>MAX) return fail('Tệp vượt giới hạn 5 MB.');
    text = text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    // Đếm dấu phân cách chỉ ngoài ngoặc kép ở dòng tiêu đề.
    let quoted = false; const counts = {'\t':0,';':0,',':0};
    for (let i=0;i<text.length;i++) { const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted){if(c==='\n')break;if(c in counts) counts[c]++;} }
    const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
    const rows=[], positions=[];let row=[],cell='',state=0,line=1,start=1;
    const pushCell=()=>{row.push(cell);cell='';state=0;};
    const pushRow=()=>{pushCell();rows.push(row);positions.push(start);row=[];start=line+1;};
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(state===1) {if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else state=2;}else {cell+=c;if(c==='\n')line++;}continue;}
      if(c===delimiter)pushCell();
      else if(c==='\n'){pushRow();line++;if(rows.length>ROWS+1)return fail('Tối đa 2000 dòng dữ liệu.');}
      else if(c==='"'&&state===0&&!cell)state=1;
      else if(c==='"'||state===2)return fail('Ngoặc kép CSV không hợp lệ.',line);
      else {cell+=c;state=3;}
    }
    if(state===1)return fail('Chưa đóng ngoặc kép CSV.',start);
    if(cell || row.length || state===2)pushRow();
    return rowsReport(rows,positions);
  }
  function crc32(data) { let c=0xffffffff;for(const x of data){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0; }
  function stop(message) {throw new Error(message);}
  async function unzip(bytes) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), n=bytes.length;
    const u16=p=>view.getUint16(p,true),u32=p=>view.getUint32(p,true);
    let end=-1;
    for(let p=n-22;p>=Math.max(0,n-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===n){end=p;break;}
    if(end<0)stop('Tệp XLSX/ZIP không hợp lệ.');
    const count=u16(end+10), length=u32(end+12), offset=u32(end+16);
    if(u16(end+4)||u16(end+6)||u16(end+8)!==count||count>256||count===65535||offset+length!==end)stop('ZIP nhiều phần/ZIP64 hoặc vượt giới hạn 256 mục.');
    let p=offset,total=0;const entries=new Map(),ranges=[];
    for(let i=0;i<count;i++) {
      if(p+46>end||u32(p)!==0x02014b50)stop('Cấu trúc ZIP không hợp lệ.');
      const flags=u16(p+8),method=u16(p+10),crc=u32(p+16),compressed=u32(p+20),plain=u32(p+24),nl=u16(p+28),extra=u16(p+30),comment=u16(p+32),local=u32(p+42);
      if(flags & 0x41)stop('Không hỗ trợ tệp ZIP mã hóa.');
      if(method!==0&&method!==8)stop('Phương thức nén ZIP không được hỗ trợ.');
      if(u16(p+34)||p+46+nl+extra+comment>end)stop('Cấu trúc ZIP không hợp lệ.');
      const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(p+46,p+46+nl));
      if(!name||name.startsWith('/')||name.includes('\\')||name.split('/').some(x=>x==='..'||x==='.')||entries.has(name))stop('Đường dẫn ZIP trùng hoặc không an toàn.');
      total+=plain;
      if(plain>ENTRY||total>TOTAL||plain>Math.max(1,compressed)*200)stop('ZIP vượt giới hạn giải nén (8 MB/mục, 20 MB/tệp, tỷ lệ 200:1).');
      if(local+30>offset||u32(local)!==0x04034b50||u16(local+6)!==flags||u16(local+8)!==method)stop('Đầu mục ZIP không hợp lệ.');
      const nameLen=u16(local+26),dataStart=local+30+nameLen+u16(local+28),dataEnd=dataStart+compressed;
      if(dataEnd>offset||dataStart>offset||new TextDecoder().decode(bytes.subarray(local+30,local+30+nameLen))!==name)stop('Dữ liệu ZIP không hợp lệ.');
      ranges.push([local,dataEnd]);entries.set(name,{dataStart,dataEnd,plain,method,crc});p+=46+nl+extra+comment;
    }
    if(p!==end)stop('Thư mục ZIP không hợp lệ.');
    ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)if(ranges[i][0]<ranges[i-1][1])stop('Các mục ZIP chồng lấn.');
    return async function read(name) {
      const entry=entries.get(name);if(!entry)stop('Thiếu thành phần XLSX: '+name);
      let data=bytes.subarray(entry.dataStart,entry.dataEnd);
      if(entry.method===8) {
        let stream;
        try { stream=new Blob([data]).stream().pipeThrough(new root.DecompressionStream('deflate-raw')); }
        catch (_) {stop('Trình duyệt chưa hỗ trợ giải nén XLSX ngoại tuyến; hãy cập nhật trình duyệt hoặc lưu bảng thành CSV.');}
        const reader=stream.getReader(),chunks=[];let length=0;
        try {for(;;){const result=await reader.read();if(result.done)break;length+=result.value.length;if(length>entry.plain||length>ENTRY){await reader.cancel();stop('Dữ liệu vượt giới hạn giải nén ZIP.');}chunks.push(result.value);}}
        catch(error){try{await reader.cancel();}catch(_){}throw error;}
        data=new Uint8Array(length);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
      }
      if(data.length!==entry.plain||crc32(data)!==entry.crc)stop('Kích thước hoặc CRC ZIP không hợp lệ.');
      return new TextDecoder('utf-8',{fatal:true}).decode(data);
    };
  }
  const elements=(node,name)=>Array.from(node.getElementsByTagName('*')).filter(n=>(n.localName||n.nodeName.split(':').pop())===name);
  function xml(text) {
    if(/<!DOCTYPE|<!ENTITY/i.test(text))stop('XML không cho phép DTD hoặc thực thể ngoài.');
    if(!root.DOMParser)stop('Đọc XLSX cần DOMParser của trình duyệt.');
    let broken=false,doc;
    try {doc=new root.DOMParser({errorHandler:{warning:()=>{broken=true;},error:()=>{broken=true;},fatalError:()=>{broken=true;}}}).parseFromString(text,'application/xml');}
    catch(_){stop('XML trong XLSX không hợp lệ.');}
    if(broken||!doc.documentElement||elements(doc,'parsererror').length)stop('XML trong XLSX không hợp lệ.');
    return doc;
  }
  async function xlsx(bytes) {
    const read=await unzip(bytes),workbook=xml(await read('xl/workbook.xml')),rels=xml(await read('xl/_rels/workbook.xml.rels'));
    const relationships=new Map();
    for(const r of elements(rels,'Relationship')) {
      const id=r.getAttribute('Id');if(relationships.has(id))stop('Quan hệ XLSX trùng.');relationships.set(id,r);
    }
    let strings;
    async function shared() {
      if(strings)return strings;
      // sharedStrings thông thường ở xl/sharedStrings.xml; giải quyết quan hệ nếu có.
      const rel=Array.from(relationships.values()).find(r=>/\/sharedStrings$/.test(r.getAttribute('Type')));
      strings=elements(xml(await read(rel?target(rel):'xl/sharedStrings.xml')),'si').map(si=>elements(si,'t').map(t=>t.textContent).join(''));
      return strings;
    }
    function target(rel) {
      if(rel.getAttribute('TargetMode')==='External')stop('XLSX không hỗ trợ liên kết ngoài.');
      const raw=rel.getAttribute('Target');if(!raw||raw.includes('\\')||raw.includes('?')||raw.includes('#'))stop('Đường dẫn XLSX không hợp lệ.');
      const parts=(raw.startsWith('/')?raw.slice(1):'xl/'+raw).split('/'),out=[];
      for(const part of parts){if(part==='..'){if(!out.length)stop('Đường dẫn XLSX không an toàn.');out.pop();}else if(part&&part!=='.')out.push(part);}
      return out.join('/');
    }
    const populated=[];const sheets=elements(workbook,'sheet');
    if(!sheets.length||sheets.length>64)stop('XLSX cần 1–64 trang tính.');
    for(const s of sheets) {
      const id=s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),rel=relationships.get(id);
      if(!rel||!/\/worksheet$/.test(rel.getAttribute('Type')))stop('Quan hệ trang tính XLSX không hợp lệ.');
      const doc=xml(await read(target(rel)));
      if(elements(doc,'f').length)stop('Không chấp nhận công thức Excel; hãy dán giá trị văn bản trước khi nhập.');
      const rows=[],positions=[],seenRows=new Set();let lastRow=0;
      for(const r of elements(doc,'row')) {
        const rowNumber=r.hasAttribute('r')?Number(r.getAttribute('r')):lastRow+1;
        if(!Number.isInteger(rowNumber)||rowNumber<1||rowNumber>1048576||seenRows.has(rowNumber)||rowNumber<=lastRow)stop('Số dòng Excel không hợp lệ.');
        seenRows.add(rowNumber);lastRow=rowNumber;const values=[],columns=new Set();let lastCol=0;
        for(const c of elements(r,'c')) {
          const ref=c.getAttribute('r');let col=lastCol+1;
          if(ref){const match=/^([A-Z]{1,3})([1-9]\d*)$/.exec(ref);if(!match||Number(match[2])!==rowNumber)stop('Địa chỉ ô Excel không hợp lệ.');col=0;for(const ch of match[1])col=col*26+ch.charCodeAt(0)-64;}
          if(col>16384||columns.has(col))stop('Cột Excel trùng hoặc không hợp lệ.');columns.add(col);lastCol=col;
          const type=c.getAttribute('t'),v=elements(c,'v')[0];let value='';
          if(type==='inlineStr')value=elements(c,'is').map(is=>elements(is,'t').map(t=>t.textContent).join('')).join('');
          else if(type==='s'&&v){const index=Number(v.textContent),ss=await shared();if(!/^\d+$/.test(v.textContent)||!Number.isSafeInteger(index)||index>=ss.length)stop('Chỉ số sharedStrings không hợp lệ.');value=ss[index];}
          else if(type==='str'&&v)value=v.textContent;
          else if(v&&v.textContent!=='') {if(col===1||col===3)stop('Mã Excel phải là văn bản (Text), không dùng ô số để tránh mất số 0 đầu.');value=v.textContent;if(type&&type!=='n')stop('Ô Excel phải là văn bản.');}
          if(norm(value)){if(col>4)stop('Trang tính có dữ liệu ngoài 4 cột quy định.');values[col-1]=value;}
        }
        if(values.length){rows.push(Array.from({length:4},(_,j)=>values[j]||''));positions.push(rowNumber);if(rows.length>ROWS+1)stop('Tối đa 2000 dòng dữ liệu.');}
      }
      if(rows.length)populated.push({rows,positions});
    }
    if(populated.length>1)stop('Có nhiều trang tính chứa dữ liệu. Hãy giữ đúng một trang tính có bảng danh mục rồi nhập lại.');
    if(!populated.length)return fail('XLSX chưa có bảng dữ liệu.');
    return rowsReport(populated[0].rows,populated[0].positions);
  }
  async function readFile(file) {
    try {
      if(!file||typeof file.name!=='string')return fail('Chưa chọn tệp hợp lệ.');
      if(!Number.isFinite(file.size)||file.size<0||file.size>MAX)return fail('Tệp vượt giới hạn 5 MB hoặc kích thước không hợp lệ.');
      const extension=file.name.toLowerCase().split('.').pop();
      if(extension==='xls')return fail('Không hỗ trợ .xls; hãy lưu lại thành .xlsx hoặc CSV.');
      if(!['xlsx','csv','tsv','txt'].includes(extension))return fail('Định dạng không hỗ trợ; chọn .xlsx, .csv hoặc .tsv.');
      const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
      if(bytes.length>MAX)return fail('Tệp vượt giới hạn 5 MB.');
      if(extension==='xlsx')return await xlsx(bytes);
      return parseText(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    } catch(error) {return fail('Không đọc được tệp: '+(error && error.message || 'Dữ liệu không hợp lệ.'));}
  }
  return {parseText,parseRows,validate,readFile};
});
