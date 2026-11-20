const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
// Node has no DOMParser. Use the project's existing Python runtime as an XML
// oracle, exposing only the DOM methods used by the browser module. No npm deps.
class DOMParser {
 parseFromString(source) {
  const result=spawnSync('python3',['-c',`import sys,json,xml.etree.ElementTree as ET
def encode(e):
 return {'tag':e.tag, 'attrs':e.attrib, 'text':''.join(e.itertext()), 'children':[encode(c) for c in e]}
print(json.dumps(encode(ET.fromstring(sys.stdin.read()))))`],{input:source,encoding:'utf8',maxBuffer:24*1024*1024});
  if(result.status!==0) throw new Error('Invalid XML fixture');
  function element(value) {
   const children=value.children.map(element),localName=value.tag.split('}').pop();
   return {localName,textContent:value.text,children,
    getAttribute:name=>value.attrs[name]||'',
    hasAttribute:name=>Object.hasOwn(value.attrs,name),
    getAttributeNS:(ns,name)=>value.attrs['{'+ns+'}'+name]||'',
    getElementsByTagName(name){const nodes=[];for(const child of children){if(name==='*'||child.localName===name)nodes.push(child);nodes.push(...child.getElementsByTagName(name));}return nodes;}
   };
  }
  const documentElement=element(JSON.parse(result.stdout));
  return {documentElement,getElementsByTagName:name=>[...(name==='*'||documentElement.localName===name?[documentElement]:[]),...documentElement.getElementsByTagName(name)]};
 }
}
const path = require('node:path');
const modulePath = path.resolve(__dirname, '../public/competency-catalog.js');
const api = require(modulePath);
const H = ['Mã năng lực', 'Tên thành phần năng lực', 'Mã chỉ báo', 'Mô tả chỉ báo'];
const R = ['001', 'Năng lực mẫu', '01.01', 'Mô tả mẫu'];
function bad(r, pattern) { assert.equal(r.valid, false); assert.ok(r.errors.every(e => Number.isInteger(e.row) && typeof e.message === 'string')); if(pattern) assert.match(r.errors.map(e=>e.message).join(' '), pattern); }
function crc(b) { let c=0xffffffff; for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0; }
function zip(entries, options={}) {
 const parts=[], central=[]; let offset=0;
 for(const [name, text] of Object.entries(entries)) {
  const n=Buffer.from(name),raw=Buffer.from(text),data=options.stored?raw:zlib.deflateRawSync(raw),method=options.stored?0:8;
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(options.encrypted?1:0,6);h.writeUInt16LE(method,8);h.writeUInt32LE(crc(raw),14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(n.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(options.encrypted?1:0,8);c.writeUInt16LE(method,10);c.writeUInt32LE(crc(raw),16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(options.bomb?40*1024*1024:raw.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
  parts.push(h,n,data);central.push(c,n);offset+=h.length+n.length+data.length;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(Buffer.concat(central).length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,...central,end]);
}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
function sheet(rows=[H,R]) { return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r,i)=>`<row r="${i+1}">${r.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`; }
function book(sheets=[sheet()], extra={}) {
 return {'xl/workbook.xml':`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="S${i+1}" sheetId="${i+1}" r:id="r${i+1}"/>`).join('')}</sheets></workbook>`, 'xl/_rels/workbook.xml.rels':`<Relationships>${sheets.map((s,i)=>`<Relationship Id="r${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`,...Object.fromEntries(sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,s])),...extra};
}
function file(bytes,name='catalog.xlsx') { return {name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}; }
function browser(extra={}) {const context={DOMParser,TextDecoder,TextEncoder,Uint8Array,DataView,Blob,DecompressionStream,console,...extra};vm.createContext(context);vm.runInContext(fs.readFileSync(modulePath,'utf8'),context);return context.BankCompetencyCatalog;}
test('exports UMD and preserves normalized literal codes',()=>{
 assert.equal(typeof api.parseRows,'function'); const r=api.parseRows([H,[' 001 ',' Tên ',' 01.01 ',' Mô tả '],['001','Tên','02','Khác']]);
 assert.equal(r.valid,true);assert.deepEqual(r.catalog.competencies,[{code:'001',name:'Tên'}]);assert.equal(r.catalog.indicators[0].code,'01.01');assert.equal(typeof browser().parseText,'function');
});
test('CSV, semicolon and pasted TSV support BOM, quoted delimiters, doubled quotes and multiline',()=>{
 for(const d of [',',';','\t']) {const r=api.parseText('\ufeff'+H.join(d)+'\r\n001'+d+'Tên'+d+'01'+d+'"Mô tả'+d+' và ""trích""\r\ndòng hai"\r\n');assert.equal(r.valid,true);assert.equal(r.catalog.indicators[0].text,`Mô tả${d} và "trích"\ndòng hai`);}
 bad(api.parseText(H.join(',')+'\n"unclosed'),/ngoặc kép/i);
 bad(api.parseText(H.join(',')+'\na,b,c,"d"oops'),/ngoặc kép/i);
});
test('strict headers, cells, conflicts, duplicates and source row numbers',()=>{
 bad(api.parseRows([['wrong'],R]),/tiêu đề/i);bad(api.parseRows([H,['001','Tên','01','']]),/thiếu/i);
 const r=api.parseRows([H,R,[],R]);bad(r,/trùng/i);assert.equal(r.errors[0].row,4);
 bad(api.parseRows([H,R,['001','Tên khác','02','Mô tả']]),/khác|mâu thuẫn/i);
 bad(api.parseRows([H,[...R,'extra']]),/4 cột/);bad(api.parseRows([H,[1,'Tên','01','Mô tả']]),/văn bản/);
});
test('validate rejects malformed catalogs, duplicate competencies, missing references without throwing or mutating',()=>{
 for(const c of [null,{}, {competencies:[null],indicators:[null]}, {competencies:[{code:'A',name:'a'},{code:'A',name:'a'}],indicators:[]}, {competencies:[],indicators:[{code:'I',competency:'A',text:'t'}]}]) bad(api.validate(c));
 const c={competencies:[{code:' A ',name:' Tên '}],indicators:[{code:' I ',competency:' A ',text:' t '}]},before=JSON.stringify(c);assert.equal(api.validate(c).valid,true);assert.equal(JSON.stringify(c),before);
});
test('row and byte limits apply to all entry points',async()=>{
 bad(api.parseRows([H,...Array.from({length:2001},(_,i)=>['A','Tên',String(i),'t'])]),/2000/);
 bad(api.parseText('é'.repeat(3*1024*1024)),/5 MB/);
 bad(await api.readFile({name:'a.xlsx',size:5*1024*1024+1}),/5 MB/);
 bad(await api.readFile(file(Buffer.from('x'),'a.xls')),/xls.*xlsx/i);
 bad(await api.readFile(file(Buffer.from('x'),'a.pdf')),/định dạng/i);
 assert.equal((await api.readFile(file(Buffer.from(H.join('\t')+'\n'+R.join('\t')),'a.csv'))).valid,true);
});
test('XLSX works offline in browser UMD using real raw deflate and inline strings',async()=>{
 const r=await browser().readFile(file(zip(book())));assert.equal(r.valid,true,JSON.stringify(r));assert.equal(r.catalog.indicators[0].competency,'001');
 const stored=await browser().readFile(file(zip(book(),{stored:true})));assert.equal(stored.valid,true);
});
test('XLSX shared strings rich text, sparse cells, sheet order and blank sheets',async()=>{
 const strings=[...H,...R];const s=`<worksheet><sheetData><row r="1">${H.map((_,i)=>`<c r="${'ABCD'[i]}1" t="s"><v>${i}</v></c>`).join('')}</row><row r="7">${R.map((_,i)=>`<c r="${'ABCD'[i]}7" t="s"><v>${i+4}</v></c>`).join('')}</row></sheetData></worksheet>`;
 const r=await browser().readFile(file(zip(book(['<worksheet><sheetData/></worksheet>',s],{'xl/sharedStrings.xml':`<sst>${strings.map(x=>`<si><r><t>${esc(x)}</t></r></si>`).join('')}</sst>`}))));assert.equal(r.valid,true,JSON.stringify(r));
 const sparse=s.replace('<c r="B7" t="s"><v>5</v></c>','');const b=await browser().readFile(file(zip(book([sparse],{'xl/sharedStrings.xml':`<sst>${strings.map(x=>`<si><t>${esc(x)}</t></si>`).join('')}</sst>`}))));bad(b,/thiếu/i);assert.equal(b.errors[0].row,7);
});
test('XLSX rejects formulas, ambiguous sheets, encryption, bombs and malformed archives/XML',async()=>{
 const cases=[ [zip(book([sheet().replace('<is><t>001</t></is>','<f>1+1</f><v>2</v>')])),/công thức/], [zip(book([sheet(),sheet()])),/một.*trang tính|1.*trang tính/], [zip(book(),{encrypted:true}),/mã hóa/], [zip(book(),{bomb:true}),/giải nén|giới hạn/], [Buffer.from('not zip'),/ZIP|xlsx/i], [zip(book(['<worksheet><broken></worksheet>'])),/XML/], [zip(book([sheet().replace('t="inlineStr"><is><t>001</t></is>','><v>1</v>')])),/văn bản/]];
 for(const [bytes,pattern] of cases) bad(await browser().readFile(file(bytes)),pattern);
});

test('boundary accepts 2000 data rows, rejects normalized duplicates and validates snapshot limits',()=>{
 const rows=[H,...Array.from({length:2000},(_,i)=>['A','Tên',String(i),'t'])];assert.equal(api.parseRows(rows).valid,true);
 bad(api.validate({competencies:[],indicators:[]}));
 bad(api.validate({competencies:[{code:'A',name:'Tên'}],indicators:Array.from({length:2001},(_,i)=>({code:String(i),competency:'A',text:'t'}))}),/2000/);
 bad(api.parseRows([H,['A','Tên','e\u0301','t'],['A','Tên','é','t']]),/trùng/i);
 const r=api.validate({competencies:[{code:' A ',name:' Tên '}],indicators:[{code:' e\u0301 ',competency:' A ',text:' tên '}]});assert.deepEqual(r.catalog,{competencies:[{code:'A',name:'Tên'}],indicators:[{code:'é',competency:'A',text:'tên'}]});
});
test('XLSX detects CRC corruption, invalid shared indexes, DTD and unsupported decompression',async()=>{
 const bytes=zip(book(),{stored:true});const corrupt=Buffer.from(bytes);corrupt[corrupt.indexOf(Buffer.from('<workbook'))+2]^=1;bad(await browser().readFile(file(corrupt)),/CRC/);
 bad(await browser().readFile(file(zip(book(['<!DOCTYPE worksheet [<!ENTITY x "bad">]><worksheet/>'])))),/XML/);
 const s=sheet().replace('<is><t>001</t></is>','<v>9999</v>').replace('r="A2" t="inlineStr"','r="A2" t="s"');bad(await browser().readFile(file(zip(book([s],{'xl/sharedStrings.xml':'<sst><si><t>A</t></si></sst>'})))),/sharedStrings/);
 bad(await browser({DecompressionStream:undefined}).readFile(file(zip(book()))),/trình duyệt/i);
});
