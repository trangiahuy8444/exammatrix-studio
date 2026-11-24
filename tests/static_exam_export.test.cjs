const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const file=path.join(__dirname,'../public/static-exam-export.js');
const E=fs.existsSync(file)?require(file):{};
function inspect(bytes){
 assert.ok(bytes instanceof Uint8Array);
 const p=spawnSync('python3',['-c',`import sys,io,zipfile,json,xml.etree.ElementTree as ET
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
out={}
for n in z.namelist():
 b=z.read(n)
 if n.endswith('.xml') or n.endswith('.rels'): ET.fromstring(b)
 if n=='word/document.xml':
  root=ET.fromstring(b); ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}; w='{'+ns['w']+'}'
  pg=root.find('.//w:pgSz',ns); assert pg.get(w+'orient')=='landscape'; assert pg.get(w+'w')=='16838'; assert pg.get(w+'h')=='11906'
  margin=root.find('.//w:pgMar',ns); assert margin.get(w+'top')==margin.get(w+'bottom')=='567'
  for table in root.findall('.//w:tbl',ns):
   grid=[int(c.get(w+'w')) for c in table.findall('w:tblGrid/w:gridCol',ns)]
   assert sum(grid)<=13606
   assert table.find('w:tr/w:trPr/w:tblHeader',ns) is not None
   for row in table.findall('w:tr',ns):
    widths=[int(c.get(w+'w')) for c in row.findall('w:tc/w:tcPr/w:tcW',ns)]
    assert widths==grid
 if n=='word/styles.xml': assert b'Times New Roman' in b
 out[n]=b.decode('utf-8')
print(json.dumps(out))`],{input:bytes,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);
}
const record={title:'Synthetic <exam>',questions:[
 {type:'MC',question:'Compare & choose\n```cpp\nif (a < b) return 1;\n```\n| X | Y |\n| --- | --- |\n| 1 | 2 |',options:['Option A','Option B'],correct:1,explanation:'PRIVATE_EXPLANATION'},
 {type:'YN',question:'True?',statements:[{label:'a',text:'Visible statement',correct:false,explanation:'PRIVATE_YN'}]},
 {type:'SHORT',question:'Compute',short_answer:'PRIVATE_SHORT'},
 {type:'ES',question:'Explain',answer:'PRIVATE_ESSAY',rubric:[{criterion:'PRIVATE_CRITERION',points:1.25}]}
]};
test('ZIP stores UTF-8 names, binary data, CRC and safe names',()=>{
 assert.equal(typeof E.zipFiles,'function');
 const z=inspect(E.zipFiles([{name:'đề.txt',data:'Tiếng Việt'},{name:'empty',data:new Uint8Array()}]));
 assert.equal(z['đề.txt'],'Tiếng Việt');assert.equal(z.empty,'');
 for(const name of ['../x','/x','a/../x','a\\b','C:/x','a//b','x\u0000'])assert.throws(()=>E.zipFiles([{name,data:''}]),/tên|đường dẫn/i);
 assert.throws(()=>E.zipFiles([{name:'x',data:''},{name:'x',data:''}]),/trùng/i);
});
test('real OOXML student document preserves grammar and excludes private answers',()=>{
 assert.equal(typeof E.documentBytes,'function');const z=inspect(E.documentBytes(record));
 for(const n of ['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml','word/_rels/document.xml.rels'])assert.ok(z[n],n);
 const xml=z['word/document.xml'];assert.match(xml,/if \(a &lt; b\)/);assert.match(xml,/w:tbl/);assert.match(xml,/Visible statement/);
 assert.doesNotMatch(JSON.stringify(z),/PRIVATE_|correct|rubric|explanation/);
 assert.match(xml,/w:orient="landscape"/);assert.match(xml,/w:w="16838"/);assert.match(xml,/w:top="567"/);assert.match(xml,/w:bottom="567"/);
 for(const m of xml.matchAll(/<w:tblW w:w="(\d+)"/g))assert.ok(+m[1]<=13606);
 assert.match(z['word/styles.xml'],/Times New Roman/);assert.doesNotMatch(xml,/drawing|logo/i);
});
test('teacher output includes answers and numeric rubric criterion',()=>{
 const xml=inspect(E.documentBytes(record,{answers:true}))['word/document.xml'];
 for(const s of ['PRIVATE_SHORT','PRIVATE_ESSAY','PRIVATE_CRITERION','1,25','PRIVATE_EXPLANATION','Sai'])assert.ok(xml.includes(s),s);
});
test('revision scope has exactly three columns and discloses absent logo',()=>{
 const r={...record,matrix_snapshot:{lessons:[{topic:'Topic',title:'Lesson'}]}};
 const xml=inspect(E.documentBytes(r,{revision:true}))['word/document.xml'];
 assert.match(E.exportWarnings({revision:true})[0],/thiếu logo/);assert.deepEqual(E.exportWarnings(),[]);assert.match(xml,/chưa đầy đủ theo mẫu đề cương của trường/);assert.equal((xml.match(/<w:tblGrid>(.*?)<\/w:tblGrid>/s)[1].match(/<w:gridCol /g)||[]).length,3);assert.match(xml,/STT/);assert.match(xml,/Tên chủ đề/);assert.match(xml,/Tên bài/);assert.match(xml,/Lesson/);
 assert.match(xml,/<w:tblGrid>(?:<w:gridCol[^>]+\/>){3}<\/w:tblGrid>/);
 assert.ok(E.limitations.some(s=>/logo/i.test(s)));assert.match(xml,/logo/i);
});
test('teacher rubric is scaled to assigned exam points and headers identify the paper',()=>{
 const r={title:'Đề minh họa',grade:9,subject_name:'Tin học',exam_type:'GK1',duration:45,questions:[{id:'ES1',type:'ES',question:'Giải thích dữ liệu',slot_number:1,points:5,max_score:1,rubric:[{criterion:'Ý thứ nhất',points:0.25},{criterion:'Ý thứ hai',points:0.75}]}]};
 const xml=inspect(E.documentBytes(r,{answers:true}))['word/document.xml'];
 assert.match(xml,/1,25/);assert.match(xml,/3,75/);assert.match(xml,/45 phút/);assert.match(xml,/5 điểm/);
 assert.match(xml,/BẢN NHÁP/);assert.match(xml,/TỰ LUẬN/);
 assert.throws(()=>E.documentBytes({...r,questions:[{...r.questions[0],max_score:2}]},{answers:true}),/thang điểm|hướng dẫn chấm/);
});
test('unsupported media and malformed questions reject clearly',()=>{
 for(const patch of [{images:[{src:'x'}]},{equation:{latex:'x'}},{question:{type:'equation'}},{question:'![diagram](x.png)'},{question:'<img src="x">'},{type:'OTHER'}]){
  assert.throws(()=>E.documentBytes({questions:[{type:'ES',question:'Q',...patch}]}),/chưa hỗ trợ|hình ảnh|phương trình/i);
 }
 assert.throws(()=>E.documentBytes({question_ids:['x']}),/bản chụp|câu hỏi/i);
});
test('matrix and specification use requirements and allocated slot references',()=>{
 const xml=inspect(E.matrixBytes({title:'Matrix',lessons:[{code:'L1',topic:'Topic',title:'Lesson'}],requirements:[{id:'R1',lesson_code:'L1',text:'Outcome',level:'Biết'}],slots:[{number:3,kind:'ES',parts:[{requirement_id:'R1',points:2}]}]}))['word/document.xml'];
 for(const s of ['Outcome','Câu 3','ES','2','MA TRẬN','ĐẶC TẢ'])assert.ok(xml.includes(s),s);
});
test('browser UMD works offline with BankCore and no require',()=>{
 const context={TextEncoder,Uint8Array,DataView,BankCore:require('../public/core.js')};vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
 assert.equal(typeof context.BankStaticExport.zipFiles,'function');inspect(context.BankStaticExport.documentBytes(record));
});

test('binary ZIP is stored, bounded, deterministic and contains every byte',()=>{
 const bytes=E.zipFiles([{name:'raw.bin',data:Uint8Array.from({length:256},(_,i)=>i)}]);
 const result=spawnSync('python3',['-c',"import io,sys,zipfile;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.testzip() is None;assert z.read('raw.bin')==bytes(range(256));assert z.getinfo('raw.bin').compress_type==0"],{input:bytes});
 assert.equal(result.status,0,result.stderr.toString());
 assert.deepEqual(E.zipFiles([]),E.zipFiles([]));
 assert.throws(()=>E.zipFiles(new Array(4097)),/giới hạn/);
 assert.throws(()=>E.zipFiles([{name:'large',data:new Uint8Array(32*1024*1024)}]),/giới hạn/);
 assert.throws(()=>E.documentBytes({questions:new Array(2001)}),/giới hạn/);
 assert.throws(()=>E.documentBytes({questions:[{type:'ES',question:'Q',rubric:[{criterion:'R',points:'1'}]}]},{answers:true}),/số/);
});

test('teacher rubric exports without maxscore in exam and revision contexts',()=>{
 const r={questions:[{type:'ES',question:'Câu hỏi giả lập',rubric:[{criterion:'Tiêu chí chấm giả lập',points:0.75}]}]};
 for(const revision of [false,true]){
  const xml=inspect(E.documentBytes(r,{answers:true,revision}))['word/document.xml'];
  assert.match(xml,/Tiêu chí chấm giả lập/);assert.match(xml,/0.75/);
 }
});
test('all declared errors and export limitations use Vietnamese',()=>{
 const source=fs.readFileSync(file,'utf8');
 const messages=[...source.matchAll(/(?:fail|return fail)\('([^']+)'/g)].map(m=>m[1]);
 assert.ok(messages.length>=20);
 for(const message of [...messages,...E.limitations,...E.exportWarnings({revision:true})]){
  assert.match(message,/[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i,message);
 }
 assert.match(E.exportWarnings({revision:true})[0],/thiếu logo/);
 assert.match(E.exportWarnings({revision:true})[0],/chưa đầy đủ theo mẫu đề cương của trường/);
});
// L5 (kiểm thử giả lập 24/11/2026): chân trang Trang X/Y, phương án cùng dòng, điểm dùng dấu phẩy.
test('đề có chân trang Trang X/Y, phương án cùng dòng và điểm viết 0,25',()=>{
 const r={title:'Đề minh họa',grade:9,subject_name:'Toán học',exam_type:'GK1',duration:45,status:'locked',questions:[
  {id:'M1',type:'MC',question:'Câu một',slot_number:1,points:0.25,options:['Một','Hai','Ba','Bốn'],correct:0},
  {id:'Y1',type:'YN',question:'Xét các ý',slot_number:1,points:1,statements:['a','b','c','d'].map((l,i)=>({label:l,text:'Ý '+l,correct:i%2===0}))}]};
 const files=inspect(E.documentBytes(r));const xml=files['word/document.xml'];
 assert.ok(files['word/footer1.xml'],'có footer');assert.match(files['word/footer1.xml'],/PAGE/);assert.match(files['word/footer1.xml'],/NUMPAGES/);assert.match(files['word/footer1.xml'],/Trang /);
 assert.match(xml,/footerReference/);assert.match(files['[Content_Types].xml'],/footer1\.xml/);assert.match(files['word/_rels/document.xml.rels'],/footer1\.xml/);
 assert.match(xml,/A\. Một</);assert.match(xml,/D\. Bốn</);assert.match(xml,/a\) Ý a</);
 assert.match(xml,/0,25 điểm/);assert.doesNotMatch(xml,/0\.25 điểm/);
 assert.doesNotMatch(xml,/Đúng<|>Sai</,'bản học sinh không có đáp án Đúng/Sai');
});
