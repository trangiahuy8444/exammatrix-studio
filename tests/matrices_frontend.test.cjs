const assert=require('node:assert/strict');
let ui;
try {ui=require('../public/matrices.js');}catch {ui=null;}
assert.ok(ui,'Matrix UI helpers must be implemented');
assert.deepEqual(ui.visibleActions({status:'locked',mode:'received'}),['preview','export','new-version','archive','use']);
assert.ok(!ui.visibleActions({status:'locked',mode:'authored'}).includes('save'));
assert.equal(ui.formatRefs([{number:1,label:'a'},{number:1,label:'b'}],'matrix'),'(1a, 1b)');
assert.equal(ui.formatRefs([{number:1,label:''}],'specification'),'(Câu 1).');
assert.equal(ui.filterRecords([{grade:9,status:'draft'},{grade:8,status:'locked'}],{grade:9}).length,1);
assert.equal(ui.escapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
assert.equal(ui.packageSummary({matrix:{grade:9,profile:'THCS',version:2}}),'Khối 9 · THCS · phiên bản 2');
console.log('Matrix UI helpers passed');

// B3: mẫu hồ sơ — dạng câu được phép và bảng hệ số Đúng/Sai
assert.deepEqual(ui.effectiveKinds({profile:'THCS'}),['MC','ES']);
assert.deepEqual(ui.effectiveKinds({profile:'THPT'}),['MC','YN','SHORT','ES']);
assert.deepEqual(ui.effectiveKinds({profile:'THCS',allowed_kinds:['YN','MC']}),['MC','YN']);
{const m={profile:'THCS'};ui.setAllowedKinds(m,['MC','ES']);assert.equal('allowed_kinds' in m,false);   // trùng mặc định thì không lưu
 ui.setAllowedKinds(m,['MC','YN','ES']);assert.deepEqual(m.allowed_kinds,['MC','YN','ES']);}
assert.deepEqual(ui.ynTable({}),{0:'0',1:'0.1',2:'0.25',3:'0.5',4:'1'});
{const m={};ui.setYnCoefficient(m,1,'0');assert.deepEqual(m.scoring_policy.yn_table,{0:'0',1:'0',2:'0.25',3:'0.5',4:'1'});
 ui.setYnCoefficient(m,1,'0,1');assert.equal('scoring_policy' in m,false);}  // về mặc định thì bỏ, nhận dấu phẩy
console.log('PASS matrix UI: mẫu hồ sơ và hệ số Đúng/Sai');

// G1-LEVEL4: trình chọn phải giữ đúng mức VDC khi biên tập.
{
 const options=ui.requirementLevelOptions('Vận dụng cao');
 assert.match(options,/<option value="Vận dụng cao" selected>Vận dụng cao<\/option>/);
 assert.match(options,/<option value="Vận dụng">Vận dụng<\/option>/);
 assert.equal((options.match(/<option /g)||[]).length,4);
}
console.log('PASS matrix UI: chọn riêng Vận dụng cao');

// G1: số thiếu đã đo được không thay kết luận khi còn vị trí chưa đối chiếu.
{
 const report={ok:true,complete:false,total_shortfall:0,cells:[],issues:[{code:'empty',message:'Chưa dựng vị trí.'}],unresolved_slots:[]};
 const html=ui.shortfallHtml(report);
 assert.match(html,/Chưa thể kết luận đủ câu/);
 assert.doesNotMatch(html,/Đủ câu đã duyệt cho mọi ô/);
 assert.match(html,/Chưa dựng vị trí\./);
 assert.doesNotMatch(html,/Còn thiếu 0 câu/);
}
{
 const parts=['a','b','c','d'].map((label,i)=>({part_id:'P'+i,label,lesson_code:'B'+(i+1),outcome:'YCCĐ '+i,level:i===3?'Vận dụng cao':'Biết',points:.25}));
 parts[1].outcome='<img src=x onerror=alert(1)>';
 const html=ui.shortfallHtml({ok:false,complete:false,total_shortfall:2,cells:[],issues:[],unresolved_slots:[{slot_id:'YN-1',kind:'YN',number:1,reason:'Cần đối chiếu từng ý.',parts}]});
 for(const label of ['1a','1b','1c','1d','Vận dụng cao','B4'])assert.ok(html.includes(label),label);
 assert.match(html,/Đã xác định thiếu 2 câu/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img/);
}
{
 const html=ui.shortfallHtml({ok:true,complete:true,total_shortfall:0,cells:[],issues:[],unresolved_slots:[]});
 assert.match(html,/Đủ câu đã duyệt cho mọi ô/);
 assert.doesNotMatch(html,/Chưa thể kết luận/);
}
console.log('PASS matrix UI: báo cáo thiếu câu chưa đủ căn cứ và hiển thị mọi ý');

// Test parseMatrixFromMarkdown with multi-table document and row-spanning
{
  const multiTableMd = `
# MA TRẬN & ĐẶC TẢ GIỮA HỌC KỲ 1
Môn: Tin học - Khối 9 - Năm học: 2026-2027

## BẢNG 1: KHUNG MA TRẬN
| TT | Chủ đề | Đơn vị kiến thức | Nhận biết | Thông hiểu | Vận dụng | Vận dụng cao | Tổng |
|---|---|---|---|---|---|---|---|
| 1 | Máy tính | Bài 1 | 2 | 1 | 0 | 0 | 3 |
| | | Bài 2 | 1 | 2 | 1 | 0 | 4 |

## BẢNG 2: BẢNG ĐẶC TẢ KĨ THUẬT
| TT | Chủ đề | Bài học / Đơn vị kiến thức | Mức độ đánh giá | Yêu cầu cần đạt | Số câu hỏi | Câu hỏi trong đề | Điểm |
|---|---|---|---|---|---|---|---|
| 1 | Máy tính và cộng đồng | Bài 1: Thế giới kĩ thuật số | Nhận biết | - Nhận biết được một số thiết bị số thông dụng.<br>- Nêu được ưu điểm của thiết bị số. | 2 TN | Câu 1, Câu 2 | 0.5 |
| | | | Thông hiểu | - Giải thích được vai trò mạng máy tính. | 1 TN | Câu 3 | 0.25 |
| 2 | Tổ chức lưu trữ, tìm kiếm | Bài 2: Thông tin trong giải quyết vấn đề | Nhận biết | - Nhận biết được thông tin chất lượng. | 1 TN | Câu 4 | 0.25 |
| | | | Thông hiểu | - Phân biệt tin thật và tin giả. | 2 TN | Câu 5, Câu 6 | 0.5 |
| | | | Vận dụng | - Thực hành tìm kiếm thông tin an toàn. | 1 TL | Câu 1 TL | 1.0 |
`;

  const parsed = ui.parseMatrixFromMarkdown(multiTableMd, 9);
  assert.ok(parsed && parsed.matrix, 'Phải bóc tách được ma trận từ tài liệu nhiều bảng');
  assert.equal(parsed.matrix.grade, 9);
  assert.equal(parsed.matrix.lessons.length, 2);
  assert.equal(parsed.matrix.lessons[0].title, 'Thế giới kĩ thuật số');
  assert.equal(parsed.matrix.lessons[0].topic, 'Máy tính và cộng đồng');
  assert.equal(parsed.matrix.lessons[1].title, 'Thông tin trong giải quyết vấn đề');
  assert.equal(parsed.matrix.lessons[1].topic, 'Tổ chức lưu trữ, tìm kiếm');

  // Kiểm tra 6 yêu cầu cần đạt được phân tách chính xác (bao gồm tách <br>)
  assert.equal(parsed.matrix.requirements.length, 6);
  assert.equal(parsed.matrix.requirements[0].level, 'Biết');
  assert.equal(parsed.matrix.requirements[1].level, 'Biết');
  assert.equal(parsed.matrix.requirements[2].level, 'Hiểu');
  assert.equal(parsed.matrix.requirements[5].level, 'Vận dụng');

  // Kiểm tra 7 slots
  assert.equal(parsed.matrix.slots.length, 7);
  assert.equal(parsed.matrix.slots[6].kind, 'ES');
  console.log('PASS matrix UI: parseMatrixFromMarkdown nhận diện chính xác tài liệu đa bảng và ô gộp dòng');
}

// Test parseMatrixFromMarkdown with hierarchical section markdown
{
  const sectionMd = `
# MA TRẬN ĐỀ KIỂM TRA TIN HỌC 9
Khối: 9

## Chủ đề 1: Máy tính và cộng đồng
### Bài 1: Thiết bị số
- [Biết] [MC] Nhận biết được các loại thiết bị số. (2 câu · 0.5đ · Câu 1, Câu 2)
- [Hiểu] [MC] Giải thích được cơ chế hoạt động mạng. (1 câu · 0.25đ · Câu 3)

## Chủ đề 2: Dịch vụ đám mây
### Bài 2: Lưu trữ trực tuyến
- [Vận dụng] [ES] Thực hành chia sẻ thư mục bảo mật. (1 câu · 1.0đ · Câu 1 TL)
`;

  const parsed = ui.parseMatrixFromMarkdown(sectionMd, 9);
  assert.ok(parsed && parsed.matrix);
  assert.equal(parsed.matrix.lessons.length, 2);
  assert.equal(parsed.matrix.requirements.length, 3);
  assert.equal(parsed.matrix.slots.length, 4); // 2 câu Biết + 1 câu Hiểu + 1 câu Vận dụng
  console.log('PASS matrix UI: parseMatrixFromMarkdown nhận diện chính xác Markdown phân cấp đề mục');

  // Test buildMatrixView & generateMatrixWordHtml
  const v = ui.buildMatrixView(parsed.matrix);
  assert.ok(v.rows && v.rows.length === 2);
  assert.equal(v.totals.items, 4);

  const wordHtml = ui.generateMatrixWordHtml(parsed.matrix, 'all');
  assert.ok(wordHtml.includes('KHUNG MA TRẬN ĐỀ KIỂM TRA ĐỊNH KỲ'));
  assert.ok(wordHtml.includes('BẢNG ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KỲ'));
  assert.ok(wordHtml.includes('TRƯỜNG QUỐC TẾ Á CHÂU'));
  assert.ok(wordHtml.includes('Thiết bị số'));
  assert.ok(wordHtml.includes('Lưu trữ trực tuyến'));

  const standalone = ui.generateMatrixWordStandaloneHtml(parsed.matrix, 'all');
  assert.ok(standalone.includes('xmlns:w="urn:schemas-microsoft-com:office:word"'));
  assert.ok(standalone.includes('size: A4 landscape'));
  console.log('PASS matrix UI: buildMatrixView & generateMatrixWordHtml xuất chuẩn bố cục Word 2 bảng');
}
