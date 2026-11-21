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
  const stripSubject = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const SUBJECT_CATALOGS = Object.freeze({
    tin_hoc: {
      key: 'tin_hoc',
      label: 'Tin học (TT 32/2018 & TT 02/2025)',
      aliases: ['tin hoc', 'tin', 'informatics'],
      competencies: [
        { code: 'NLa', name: 'Sử dụng và quản lí các phương tiện công nghệ thông tin và truyền thông' },
        { code: 'NLb', name: 'Ứng xử phù hợp trong môi trường số' },
        { code: 'NLc', name: 'Giải quyết vấn đề với sự hỗ trợ của công nghệ thông tin và truyền thông' },
        { code: 'NLd', name: 'Ứng dụng công nghệ thông tin và truyền thông trong học và tự học' },
        { code: 'NLe', name: 'Hợp tác trong môi trường số' }
      ],
      indicators: [
        { code: 'NLa.1', competency: 'NLa', text: 'Nhận diện, phân biệt cấu tạo, chức năng của thiết bị số, phần mềm hệ thống và phần mềm ứng dụng.' },
        { code: 'NLa.2', competency: 'NLa', text: 'Thực hiện thao tác quản lí dữ liệu, tệp, thư mục và khai thác tài nguyên mạng máy tính an toàn.' },
        { code: 'NLa.3', competency: 'NLa', text: 'Thiết lập, vận hành cơ bản các thiết bị ngoại vi, kết nối mạng hoặc hệ cơ sở dữ liệu đúng quy trình.' },
        { code: 'NLa.4', competency: 'NLa', text: 'Phân tích thông số kĩ thuật phần cứng, mạng hoặc cấu trúc dữ liệu để lựa chọn phương án phù hợp.' },
        { code: 'NLb.1', competency: 'NLb', text: 'Nhận biết các quy định pháp luật, bản quyền số, quy tắc an toàn và văn hoá giao tiếp trên mạng.' },
        { code: 'NLb.2', competency: 'NLb', text: 'Giải thích nguy cơ mất an toàn thông tin, vi phạm bản quyền và tác động của công nghệ số/AI tới xã hội.' },
        { code: 'NLb.3', competency: 'NLb', text: 'Đề xuất và thực hành ứng xử có đạo đức, trách nhiệm, bảo vệ dữ liệu cá nhân trong tình huống thực tế.' },
        { code: 'NLc.1', competency: 'NLc', text: 'Nhận diện bài toán, thuật toán, cấu trúc điều khiển hoặc thành phần chương trình, bảng/truy vấn CSDL.' },
        { code: 'NLc.2', competency: 'NLc', text: 'Theo dõi vết thuật toán, kiểm thử, phát hiện lỗi và giải thích kết quả thực thi chương trình/truy vấn.' },
        { code: 'NLc.3', competency: 'NLc', text: 'Thiết kế thuật toán, viết chương trình, tạo sản phẩm số hoặc thiết kế CSDL giải quyết vấn đề cụ thể.' },
        { code: 'NLc.4', competency: 'NLc', text: 'Đánh giá độ phức tạp, tối ưu thuật toán hoặc cải tiến giải pháp tin học cho bài toán thực tiễn.' },
        { code: 'NLd.1', competency: 'NLd', text: 'Khai thác học liệu số, phần mềm mô phỏng, công cụ tìm kiếm để tìm hiểu tri thức môn học.' },
        { code: 'NLd.2', competency: 'NLd', text: 'Đánh giá độ tin cậy của nguồn thông tin/công cụ AI và tự học, mở rộng kiến thức bằng CNTT.' },
        { code: 'NLe.1', competency: 'NLe', text: 'Sử dụng công cụ trực tuyến để trao đổi, chia sẻ thông tin và phản hồi văn minh.' },
        { code: 'NLe.2', competency: 'NLe', text: 'Tổ chức cộng tác, phân công và đồng tạo lập sản phẩm số qua nền tảng làm việc nhóm.' }
      ]
    },
    toan_hoc: {
      key: 'toan_hoc',
      label: 'Toán học (TT 32/2018 & CV 6569/7991)',
      aliases: ['toan', 'toan hoc', 'math', 'mathematics'],
      competencies: [
        { code: 'TDLL', name: 'Tư duy và lập luận toán học' },
        { code: 'MHH', name: 'Mô hình hóa toán học' },
        { code: 'GQVĐ', name: 'Giải quyết vấn đề toán học' },
        { code: 'GT', name: 'Giao tiếp toán học' },
        { code: 'SDCC', name: 'Sử dụng công cụ, phương tiện học toán' }
      ],
      indicators: [
        { code: 'TD1.1', competency: 'TDLL', text: 'Thực hiện các thao tác tư duy cơ bản: so sánh, phân tích, tổng hợp, đặc biệt hóa, khái quát hóa, quy nạp, diễn dịch.' },
        { code: 'TD1.2', competency: 'TDLL', text: 'Phát hiện sự tương đồng, khác biệt và mối liên hệ lôgic trong các đối tượng, tính chất toán học.' },
        { code: 'TD2.1', competency: 'TDLL', text: 'Chỉ ra chứng cứ, lí lẽ và lập luận chặt chẽ, hợp lí để chứng minh khẳng định toán học.' },
        { code: 'MH1.1', competency: 'MHH', text: 'Xác định và thiết lập mô hình toán học (biểu thức, phương trình, hàm số, đồ thị, hình vẽ) cho tình huống thực tiễn.' },
        { code: 'MH2.1', competency: 'MHH', text: 'Giải quyết vấn đề trong mô hình đã lập, lí giải kết quả và đánh giá tính phù hợp với thực tiễn.' },
        { code: 'GQ1.1', competency: 'GQVĐ', text: 'Nhận biết, phát hiện được vấn đề cần giải quyết bằng kiến thức toán học.' },
        { code: 'GQ2.1', competency: 'GQVĐ', text: 'Đề xuất và lựa chọn chiến lược, thuật toán thích hợp để giải quyết bài toán.' },
        { code: 'GQ3.1', competency: 'GQVĐ', text: 'Thực hiện giải pháp toán học chính xác và đánh giá, mở rộng lời giải.' },
        { code: 'GT1.1', competency: 'GT', text: 'Đọc, hiểu văn bản toán học, công thức, kí hiệu, bảng số liệu và đồ thị.' },
        { code: 'GT2.1', competency: 'GT', text: 'Diễn đạt, trình bày rõ ràng, chính xác ý tưởng và lời giải bằng ngôn ngữ toán học kết hợp ngôn ngữ thông thường.' },
        { code: 'CC1.1', competency: 'SDCC', text: 'Sử dụng đúng công cụ đo vẽ hình học, máy tính cầm tay để tính toán và kiểm tra kết quả.' },
        { code: 'CC2.1', competency: 'SDCC', text: 'Khai thác phần mềm toán học/bảng tính hỗ trợ biểu diễn hình ảnh, đồ thị và xử lí số liệu.' }
      ]
    },
    vat_li: {
      key: 'vat_li',
      label: 'Vật lí (TT 32/2018 & CV 6569/7991)',
      aliases: ['vat li', 'vat ly', 'physics'],
      competencies: [
        { code: 'NT', name: 'Nhận thức vật lí' },
        { code: 'TH', name: 'Tìm hiểu thế giới tự nhiên dưới góc độ vật lí' },
        { code: 'VD', name: 'Vận dụng kiến thức, kĩ năng đã học' }
      ],
      indicators: [
        { code: 'NT1', competency: 'NT', text: 'Nhận biết, nêu được tên đối tượng, khái niệm, đại lượng, đơn vị và hiện tượng vật lí.' },
        { code: 'NT2', competency: 'NT', text: 'Trình bày các định luật, nguyên lí, mô hình vật lí bằng ngôn ngữ, công thức và đồ thị.' },
        { code: 'NT3', competency: 'NT', text: 'Phân loại các sự vật, hiện tượng và quá trình vật lí theo tiêu chí xác định.' },
        { code: 'NT4', competency: 'NT', text: 'Phân tích đặc điểm của đối tượng, quá trình vật lí theo lôgic khoa học.' },
        { code: 'NT5', competency: 'NT', text: 'So sánh, giải thích mối quan hệ nhân quả giữa các đại lượng và hiện tượng vật lí.' },
        { code: 'NT6', competency: 'NT', text: 'Nhận xét, phản biện và tính toán các đại lượng dựa trên định luật vật lí.' },
        { code: 'TH1', competency: 'TH', text: 'Đề xuất vấn đề, đặt câu hỏi về hiện tượng vật lí từ quan sát hoặc bảng số liệu.' },
        { code: 'TH2', competency: 'TH', text: 'Đưa ra phán đoán và xây dựng giả thuyết về quy luật vật lí.' },
        { code: 'TH3', competency: 'TH', text: 'Lập kế hoạch, lựa chọn dụng cụ và thiết kế phương án thí nghiệm vật lí.' },
        { code: 'TH4', competency: 'TH', text: 'Đọc dụng cụ đo, thu thập, xử lí số liệu thực nghiệm, đồ thị và đánh giá sai số.' },
        { code: 'TH5', competency: 'TH', text: 'Rút ra kết luận khoa học và trình bày kết quả nghiên cứu.' },
        { code: 'VD1', competency: 'VD', text: 'Giải thích hiện tượng tự nhiên và giải bài toán vật lí gắn bối cảnh quen thuộc.' },
        { code: 'VD2', competency: 'VD', text: 'Đề xuất giải pháp kĩ thuật, sử dụng thiết bị điện/năng lượng an toàn, hiệu quả trong thực tiễn.' }
      ]
    },
    hoa_hoc: {
      key: 'hoa_hoc',
      label: 'Hóa học (TT 32/2018 & CV 6569/7991)',
      aliases: ['hoa hoc', 'hoa', 'chemistry'],
      competencies: [
        { code: 'NT', name: 'Nhận thức hóa học' },
        { code: 'TH', name: 'Tìm hiểu thế giới tự nhiên dưới góc độ hóa học' },
        { code: 'VD', name: 'Vận dụng kiến thức, kĩ năng đã học' }
      ],
      indicators: [
        { code: 'NT1', competency: 'NT', text: 'Nhận biết, gọi tên chất, công thức hóa học, kí hiệu và khái niệm hóa học.' },
        { code: 'NT2', competency: 'NT', text: 'Trình bày cấu tạo nguyên tử/phân tử, tính chất vật lí – hóa học và viết phương trình phản ứng.' },
        { code: 'NT3', competency: 'NT', text: 'Phân loại các chất và loại phản ứng hóa học theo tiêu chí đặc trưng.' },
        { code: 'NT4', competency: 'NT', text: 'So sánh, giải thích mối quan hệ giữa cấu tạo chất với tính chất và chiều hướng phản ứng.' },
        { code: 'NT5', competency: 'NT', text: 'Tính toán thành phần, nồng độ, hiệu suất và năng lượng phản ứng hóa học.' },
        { code: 'TH1', competency: 'TH', text: 'Đặt câu hỏi và nêu giả thuyết về tính chất hoặc cơ chế biến đổi của chất.' },
        { code: 'TH2', competency: 'TH', text: 'Đề xuất phương án nhận biết, tách chất hoặc thiết kế thí nghiệm hóa học an toàn.' },
        { code: 'TH3', competency: 'TH', text: 'Quan sát hiện tượng, xử lí số liệu thực nghiệm và rút ra kết luận hóa học.' },
        { code: 'VD1', competency: 'VD', text: 'Giải thích các hiện tượng hóa học trong đời sống, sản xuất và y tế.' },
        { code: 'VD2', competency: 'VD', text: 'Đề xuất biện pháp sử dụng hóa chất an toàn, xử lí ô nhiễm và phát triển bền vững.' }
      ]
    },
    sinh_hoc: {
      key: 'sinh_hoc',
      label: 'Sinh học (TT 32/2018 & CV 6569/7991)',
      aliases: ['sinh hoc', 'sinh', 'biology'],
      competencies: [
        { code: 'NT', name: 'Nhận thức sinh học' },
        { code: 'TH', name: 'Tìm hiểu thế giới sống' },
        { code: 'VD', name: 'Vận dụng kiến thức, kĩ năng đã học' }
      ],
      indicators: [
        { code: 'NT1', competency: 'NT', text: 'Nhận biết, kể tên, phát biểu đối tượng, khái niệm và quy luật sinh học.' },
        { code: 'NT2', competency: 'NT', text: 'Trình bày đặc điểm cấu tạo, vai trò sinh học bằng ngôn ngữ, sơ đồ, biểu đồ.' },
        { code: 'NT3', competency: 'NT', text: 'Phân loại đối tượng và hiện tượng sống theo tiêu chí khoa học.' },
        { code: 'NT4', competency: 'NT', text: 'Phân tích đặc điểm cấu trúc – quá trình sinh lí, di truyền, tiến hóa theo trình tự lôgic.' },
        { code: 'NT5', competency: 'NT', text: 'So sánh, lựa chọn đặc điểm cấu tạo, cơ chế và quá trình sinh học dựa trên tiêu chí.' },
        { code: 'NT6', competency: 'NT', text: 'Giải thích mối quan hệ giữa cấu tạo với chức năng và nguyên nhân – kết quả ở các cấp độ tổ chức sống.' },
        { code: 'NT7', competency: 'NT', text: 'Nhận ra điểm sai trong nhận định sinh học và đưa ra lập luận phản biện có căn cứ.' },
        { code: 'TH1', competency: 'TH', text: 'Đề xuất vấn đề, đặt câu hỏi nghiên cứu và nêu giả thuyết về hiện tượng sống.' },
        { code: 'TH2', competency: 'TH', text: 'Lập kế hoạch quan sát, điều tra hoặc thiết kế thí nghiệm sinh học kiểm chứng giả thuyết.' },
        { code: 'TH3', competency: 'TH', text: 'Thu thập, xử lí số liệu thực nghiệm/biểu đồ sinh học và rút ra kết luận.' },
        { code: 'VD1', competency: 'VD', text: 'Giải thích hiện tượng sức khỏe, nông nghiệp, sinh thái quen thuộc bằng kiến thức sinh học.' },
        { code: 'VD2', competency: 'VD', text: 'Đề xuất biện pháp bảo vệ sức khỏe, đa dạng sinh học và môi trường sống.' }
      ]
    },
    khtn: {
      key: 'khtn',
      label: 'Khoa học tự nhiên THCS (TT 32/2018)',
      aliases: ['khoa hoc tu nhien', 'khtn', 'natural science'],
      competencies: [
        { code: 'NT', name: 'Nhận thức khoa học tự nhiên' },
        { code: 'TH', name: 'Tìm hiểu tự nhiên' },
        { code: 'VD', name: 'Vận dụng kiến thức, kĩ năng đã học' }
      ],
      indicators: [
        { code: 'NT1', competency: 'NT', text: 'Nhận biết, nêu tên sự vật, hiện tượng, đại lượng và khái niệm KHTN.' },
        { code: 'NT2', competency: 'NT', text: 'Trình bày quy luật, mối quan hệ bằng lời, sơ đồ hoặc công thức đơn giản.' },
        { code: 'NT3', competency: 'NT', text: 'So sánh, phân loại và giải thích nguyên nhân của các hiện tượng tự nhiên.' },
        { code: 'TH1', competency: 'TH', text: 'Đặt câu hỏi tìm hiểu tự nhiên và đưa ra dự đoán ban đầu.' },
        { code: 'TH2', competency: 'TH', text: 'Lựa chọn dụng cụ, đề xuất phương án thí nghiệm/quan sát đơn giản.' },
        { code: 'TH3', competency: 'TH', text: 'Đọc số liệu, xử lí bảng biểu thí nghiệm và rút ra kết luận.' },
        { code: 'VD1', competency: 'VD', text: 'Giải thích các hiện tượng tự nhiên thường gặp trong đời sống.' },
        { code: 'VD2', competency: 'VD', text: 'Ứng xử phù hợp với tự nhiên, tiết kiệm năng lượng và bảo vệ môi trường.' }
      ]
    },
    ngu_van: {
      key: 'ngu_van',
      label: 'Ngữ văn (TT 32/2018 & CV 7991)',
      aliases: ['ngu van', 'van', 'literature'],
      competencies: [
        { code: 'ĐỌC', name: 'Năng lực đọc hiểu văn bản' },
        { code: 'VIẾT', name: 'Năng lực tạo lập văn bản (Viết)' },
        { code: 'NÓI_NGHE', name: 'Năng lực nói và nghe' },
        { code: 'VH', name: 'Năng lực văn học' }
      ],
      indicators: [
        { code: 'DOC.1', competency: 'ĐỌC', text: 'Nhận biết phương thức biểu đạt, thể loại, ngôi kể, đề tài và chi tiết tiêu biểu của văn bản (ưu tiên ngữ liệu ngoài SGK).' },
        { code: 'DOC.2', competency: 'ĐỌC', text: 'Hiểu và phân tích đặc điểm ngôn ngữ, biện pháp tu từ, kết cấu và thông điệp của văn bản.' },
        { code: 'DOC.3', competency: 'ĐỌC', text: 'Đánh giá giá trị tư tưởng, văn hóa và liên hệ, rút ra bài học cho bản thân.' },
        { code: 'VIET.1', competency: 'VIẾT', text: 'Xác định đúng kiểu văn bản, yêu cầu đề bài và lập dàn ý mạch lạc.' },
        { code: 'VIET.2', competency: 'VIẾT', text: 'Viết đoạn văn hoặc bài văn nghị luận xã hội có lí lẽ, bằng chứng thuyết phục.' },
        { code: 'VIET.3', competency: 'VIẾT', text: 'Viết bài văn nghị luận văn học phân tích, đánh giá tác phẩm bảo đảm chuẩn tiếng Việt và sáng tạo.' },
        { code: 'VH.1', competency: 'VH', text: 'Cảm thụ, phân tích nhân vật, hình tượng nghệ thuật và giá trị thẩm mĩ của tác phẩm văn học.' },
        { code: 'NN.1', competency: 'NÓI_NGHE', text: 'Trình bày, trao đổi ý kiến rõ ràng và lắng nghe, phản hồi đúng trọng tâm.' }
      ]
    },
    tieng_anh: {
      key: 'tieng_anh',
      label: 'Tiếng Anh (TT 32/2018 & CEFR)',
      aliases: ['tieng anh', 'anh van', 'ngoai ngu', 'english'],
      competencies: [
        { code: 'LANG', name: 'Kiến thức ngôn ngữ (Ngữ âm, Từ vựng, Ngữ pháp)' },
        { code: 'READ', name: 'Năng lực Đọc hiểu (Reading)' },
        { code: 'WRITE', name: 'Năng lực Viết (Writing)' },
        { code: 'LISTEN', name: 'Năng lực Nghe hiểu (Listening)' },
        { code: 'SPEAK', name: 'Năng lực Nói (Speaking)' }
      ],
      indicators: [
        { code: 'LANG.1', competency: 'LANG', text: 'Nhận diện và phân biệt phát âm, trọng âm từ và ngữ điệu trong giao tiếp.' },
        { code: 'LANG.2', competency: 'LANG', text: 'Vận dụng từ vựng và cấu trúc ngữ pháp chính xác trong ngữ cảnh.' },
        { code: 'READ.1', competency: 'READ', text: 'Đọc lấy ý chính (skimming) và nắm bố cục đoạn văn/thông báo.' },
        { code: 'READ.2', competency: 'READ', text: 'Đọc tìm thông tin chi tiết (scanning), tham chiếu từ và đoán nghĩa từ ngữ cảnh.' },
        { code: 'READ.3', competency: 'READ', text: 'Suy luận thái độ tác giả và thông tin hàm ý trong văn bản.' },
        { code: 'WRITE.1', competency: 'WRITE', text: 'Sắp xếp, chuyển đổi câu giữ nguyên nghĩa và cấu trúc chuẩn mực.' },
        { code: 'WRITE.2', competency: 'WRITE', text: 'Viết đoạn văn, thư điện tử hoặc bài luận ngắn mạch lạc đúng văn phong.' },
        { code: 'LISTEN.1', competency: 'LISTEN', text: 'Nghe hiểu ý chính và thông tin cụ thể từ hội thoại, thông báo quen thuộc.' },
        { code: 'SPEAK.1', competency: 'SPEAK', text: 'Trình bày ý kiến, miêu tả và tương tác giao tiếp theo chủ đề chuẩn CEFR A2/B1.' }
      ]
    },
    lich_su: {
      key: 'lich_su',
      label: 'Lịch sử (TT 32/2018 & CV 6569/7991)',
      aliases: ['lich su', 'su', 'history'],
      competencies: [
        { code: 'THLS', name: 'Tìm hiểu lịch sử' },
        { code: 'NTLS', name: 'Nhận thức và tư duy lịch sử' },
        { code: 'VDLS', name: 'Vận dụng kiến thức, kĩ năng đã học' }
      ],
      indicators: [
        { code: 'THLS.1', competency: 'THLS', text: 'Nhận diện và phân loại được các nguồn sử liệu (chữ viết, hiện vật, tranh ảnh, lược đồ).' },
        { code: 'THLS.2', competency: 'THLS', text: 'Khai thác thông tin, trích dẫn dữ kiện chính xác từ sử liệu được cung cấp.' },
        { code: 'NTLS.1', competency: 'NTLS', text: 'Xác định thời gian, không gian, trình bày diễn biến sự kiện và quá trình lịch sử.' },
        { code: 'NTLS.2', competency: 'NTLS', text: 'Giải thích nguyên nhân, hệ quả, ý nghĩa và mối liên hệ giữa các sự kiện lịch sử.' },
        { code: 'NTLS.3', competency: 'NTLS', text: 'So sánh, nhận xét, đánh giá khách quan sự kiện và vai trò nhân vật lịch sử.' },
        { code: 'VDLS.1', competency: 'VDLS', text: 'Liên hệ bài học lịch sử để giải thích vấn đề hiện tại và bảo tồn di sản văn hóa.' }
      ]
    },
    dia_li: {
      key: 'dia_li',
      label: 'Địa lí (TT 32/2018 & CV 6569/7991)',
      aliases: ['dia li', 'dia ly', 'dia', 'geography'],
      competencies: [
        { code: 'NTĐL', name: 'Nhận thức khoa học địa lí' },
        { code: 'THĐL', name: 'Tìm hiểu địa lí' },
        { code: 'VDĐL', name: 'Vận dụng kiến thức, kĩ năng đã học' }
      ],
      indicators: [
        { code: 'NTDL.1', competency: 'NTĐL', text: 'Nhận biết, mô tả đối tượng, hiện tượng địa lí tự nhiên và kinh tế – xã hội.' },
        { code: 'NTDL.2', competency: 'NTĐL', text: 'Giải thích cơ chế, mối quan hệ giữa các yếu tố tự nhiên và dân cư – kinh tế.' },
        { code: 'THDL.1', competency: 'THĐL', text: 'Khai thác thông tin từ bản đồ, Atlat, lược đồ địa lí.' },
        { code: 'THDL.2', competency: 'THĐL', text: 'Tính toán, xử lí bảng số liệu thống kê, đọc và nhận xét biểu đồ địa lí.' },
        { code: 'VDDL.1', competency: 'VDĐL', text: 'Vận dụng kiến thức giải thích vấn đề kinh tế địa phương, ứng phó biến đổi khí hậu và thiên tai.' }
      ]
    },
    lich_su_dia_li: {
      key: 'lich_su_dia_li',
      label: 'Lịch sử và Địa lí THCS (TT 32/2018)',
      aliases: ['lich su va dia li', 'lich su va dia ly', 'lich su dia li', 'su dia', 'su va dia'],
      competencies: [
        { code: 'THLS', name: 'Tìm hiểu lịch sử' },
        { code: 'NTLS', name: 'Nhận thức và tư duy lịch sử' },
        { code: 'VDLS', name: 'Vận dụng kiến thức lịch sử' },
        { code: 'NTĐL', name: 'Nhận thức khoa học địa lí' },
        { code: 'THĐL', name: 'Tìm hiểu địa lí' },
        { code: 'VDĐL', name: 'Vận dụng kiến thức địa lí' }
      ],
      indicators: [
        { code: 'THLS.1', competency: 'THLS', text: 'Khai thác thông tin từ tư liệu chữ viết, hiện vật, tranh ảnh lịch sử.' },
        { code: 'NTLS.1', competency: 'NTLS', text: 'Trình bày, giải thích nguyên nhân, diễn biến và ý nghĩa sự kiện lịch sử.' },
        { code: 'VDLS.1', competency: 'VDLS', text: 'Rút ra bài học lịch sử gắn với thực tiễn địa phương và hiện tại.' },
        { code: 'NTDL.1', competency: 'NTĐL', text: 'Mô tả, giải thích đặc điểm và mối liên hệ các hiện tượng địa lí tự nhiên – KT–XH.' },
        { code: 'THDL.1', competency: 'THĐL', text: 'Đọc bản đồ, lược đồ, biểu đồ và xử lí bảng số liệu địa lí.' },
        { code: 'VDDL.1', competency: 'VDĐL', text: 'Liên hệ giải quyết vấn đề môi trường, dân cư và thiên tai thực tế.' }
      ]
    },
    gdktpl: {
      key: 'gdktpl',
      label: 'GDCD (THCS) & GDKT&PL (THPT · TT 32/2018)',
      aliases: ['gdcd', 'giao duc cong dan', 'gdktpl', 'gdkt pl', 'giao duc kinh te va phap luat', 'kinh te va phap luat'],
      competencies: [
        { code: 'ĐCHV', name: 'Năng lực điều chỉnh hành vi' },
        { code: 'PTBT', name: 'Năng lực phát triển bản thân' },
        { code: 'THKTXH', name: 'Năng lực tìm hiểu và tham gia hoạt động kinh tế – xã hội' }
      ],
      indicators: [
        { code: 'DCHV.1', competency: 'ĐCHV', text: 'Nhận biết chuẩn mực đạo đức, quy định pháp luật và quyền, nghĩa vụ của công dân.' },
        { code: 'DCHV.2', competency: 'ĐCHV', text: 'Phân tích, đánh giá hành vi đúng/sai của bản thân và người khác trong tình huống thực tế.' },
        { code: 'DCHV.3', competency: 'ĐCHV', text: 'Đề xuất cách ứng xử, giải quyết tình huống phù hợp chuẩn mực đạo đức và pháp luật.' },
        { code: 'PTBT.1', competency: 'PTBT', text: 'Lập kế hoạch tài chính cá nhân, quản lí thời gian và mục tiêu phát triển bản thân.' },
        { code: 'THKTXH.1', competency: 'THKTXH', text: 'Hiểu các hiện tượng kinh tế (thị trường, thuế, lạm phát, tín dụng) và vai trò chủ thể kinh tế.' },
        { code: 'THKTXH.2', competency: 'THKTXH', text: 'Khai thác thông tin văn bản pháp luật/kinh tế để giải quyết tình huống đời sống.' }
      ]
    },
    cong_nghe: {
      key: 'cong_nghe',
      label: 'Công nghệ (TT 32/2018)',
      aliases: ['cong nghe', 'ktcn', 'technology'],
      competencies: [
        { code: 'NTCN', name: 'Nhận thức công nghệ' },
        { code: 'GTCN', name: 'Giao tiếp công nghệ' },
        { code: 'SDCN', name: 'Sử dụng công nghệ' },
        { code: 'ĐGCN', name: 'Đánh giá công nghệ' },
        { code: 'TKKT', name: 'Thiết kế kĩ thuật' }
      ],
      indicators: [
        { code: 'NTCN.1', competency: 'NTCN', text: 'Nhận biết đối tượng, nguyên lí hoạt động và vai trò của hệ thống/sản phẩm công nghệ.' },
        { code: 'NTCN.2', competency: 'NTCN', text: 'Giải thích cấu tạo, quy trình công nghệ hoặc tác động môi trường trong sản xuất.' },
        { code: 'GTCN.1', competency: 'GTCN', text: 'Đọc, lập và sử dụng bản vẽ kĩ thuật, sơ đồ mạch điện/sơ đồ khối đúng tiêu chuẩn.' },
        { code: 'SDCN.1', competency: 'SDCN', text: 'Lựa chọn, vận hành thiết bị, quy trình công nghệ đúng kĩ thuật và an toàn.' },
        { code: 'DGCN.1', competency: 'ĐGCN', text: 'Đánh giá sản phẩm/giải pháp công nghệ trên tiêu chí hiệu quả, kinh tế và an toàn sinh thái.' },
        { code: 'TKKT.1', competency: 'TKKT', text: 'Đề xuất ý tưởng, phác thảo bản thiết kế giải pháp kĩ thuật giải quyết nhu cầu thực tiễn.' }
      ]
    }
  });

  function resolveSubjectEntry(subjectName) {
    const key = stripSubject(subjectName || 'Tin học');
    if (!key) return SUBJECT_CATALOGS.tin_hoc;
    const entries = Object.values(SUBJECT_CATALOGS);
    for (const entry of entries) {
      if (entry.aliases.includes(key)) return entry;
    }
    // Khớp theo thứ tự ưu tiên từ khóa dài trước (tránh Lịch sử và Địa lí khớp nhầm đơn môn)
    for (const entry of entries) {
      if (entry.aliases.some(a => a.length >= 4 && key.includes(a))) return entry;
    }
    return null;
  }

  function listSubjectPresets() {
    return Object.values(SUBJECT_CATALOGS).map(entry => ({
      key: entry.key,
      label: entry.label,
      competenciesCount: entry.competencies.length,
      indicatorsCount: entry.indicators.length
    }));
  }

  function presetCatalogForSubject(subjectNameOrKey) {
    if (!subjectNameOrKey) return null;
    const direct = SUBJECT_CATALOGS[subjectNameOrKey];
    const entry = direct || resolveSubjectEntry(subjectNameOrKey);
    if (!entry) return null;
    return {
      key: entry.key,
      label: entry.label,
      competencies: entry.competencies.map(c => ({ code: c.code.normalize('NFC'), name: c.name.normalize('NFC') })),
      indicators: entry.indicators.map(ind => ({ code: ind.code.normalize('NFC'), competency: ind.competency.normalize('NFC'), text: ind.text.normalize('NFC') }))
    };
  }

  function defaultCompetenciesForSubject(subjectName) {
    const entry = resolveSubjectEntry(subjectName);
    if (!entry) return ['NL_CHUNG'];
    const codes = entry.competencies.map(c => c.code.normalize('NFC'));
    if (entry.key === 'tin_hoc' || entry.key === 'toan_hoc') return codes;
    return codes.includes('NL_CHUNG') ? codes : [...codes, 'NL_CHUNG'];
  }

  function competencyNameForCode(code, subjectName) {
    const cleanCode = String(code || '').normalize('NFC').trim();
    if (!cleanCode) return '';
    if (cleanCode === 'NL_CHUNG') return 'Năng lực chung / liên môn';
    const entry = resolveSubjectEntry(subjectName);
    if (entry) {
      const hit = entry.competencies.find(c => c.code.normalize('NFC') === cleanCode);
      if (hit) return hit.name.normalize('NFC');
    }
    for (const anyEntry of Object.values(SUBJECT_CATALOGS)) {
      const hit = anyEntry.competencies.find(c => c.code.normalize('NFC') === cleanCode);
      if (hit) return hit.name.normalize('NFC');
    }
    return cleanCode;
  }

  function toCsv(catalog) {
    if (!catalog || !Array.isArray(catalog.competencies) || !Array.isArray(catalog.indicators)) return '';
    const nameByCode = new Map(catalog.competencies.map(c => [norm(c.code), norm(c.name)]));
    const csvCell = v => {
      const s = String(v ?? '');
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [HEADERS.map(csvCell).join(',')];
    for (const ind of catalog.indicators) {
      const cCode = norm(ind.competency);
      const cName = nameByCode.get(cCode) || cCode;
      lines.push([cCode, cName, norm(ind.code), norm(ind.text)].map(csvCell).join(','));
    }
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  return {
    parseText, parseRows, validate, readFile,
    SUBJECT_CATALOGS, listSubjectPresets, presetCatalogForSubject,
    defaultCompetenciesForSubject, competencyNameForCode, toCsv
  };
});
