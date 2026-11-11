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

  // Test gộp ô theo Chủ đề (rowspan) khi có nhiều bài trong 1 chủ đề
  const mdSameTopic = `
# MA TRẬN ĐỀ KIỂM TRA TIN HỌC 9
Khối: 9

## Chủ đề 1: Máy tính và cộng đồng
### Bài 1: Thiết bị số
- [Biết] [MC] Thiết bị số. (1 câu · 0.25đ · Câu 1)
### Bài 2: Mạng máy tính
- [Hiểu] [MC] Mạng máy tính. (1 câu · 0.25đ · Câu 2)
`;
  const parsedSame = ui.parseMatrixFromMarkdown(mdSameTopic, 9);
  const htmlSame = ui.generateMatrixWordHtml(parsedSame.matrix, 'all');
  assert.ok(htmlSame.includes('rowspan="2"'), 'Cả Khung Ma trận và Bản đặc tả phải gộp ô TT và Chủ đề (rowspan=2)');
  console.log('PASS matrix UI: buildMatrixView & generateMatrixWordHtml xuất chuẩn bố cục Word 2 bảng và tự động gộp ô theo chủ đề');

  // Test web-native matrix creation & presets
  assert.ok(ui.STANDARD_PRESETS, 'STANDARD_PRESETS must exist');
  assert.ok(ui.STANDARD_PRESETS['8'], 'Preset for grade 8 must exist');
  assert.ok(ui.STANDARD_PRESETS['9'], 'Preset for grade 9 must exist');
  assert.ok(ui.STANDARD_PRESETS['10'], 'Preset for grade 10 must exist');

  // Test newDraft for Grade 8
  const draft8 = ui.newDraft(8, true);
  assert.equal(draft8.grade, 8);
  assert.equal(draft8.profile, 'THCS');
  assert.equal(draft8.total_points, 10);
  assert.equal(draft8.lessons.length, 5);
  assert.equal(draft8.slots.length, 31);
  const total8 = draft8.slots.flatMap(s => s.parts).reduce((sum, p) => sum + Number(p.points), 0);
  assert.equal(total8, 10, 'Grade 8 preset must equal 10.0 points');

  // Test newDraft for Grade 9
  const draft9 = ui.newDraft(9, true);
  assert.equal(draft9.grade, 9);
  assert.equal(draft9.profile, 'THCS');
  assert.equal(draft9.total_points, 10);
  assert.equal(draft9.lessons.length, 5);
  assert.equal(draft9.slots.length, 31);
  const total9 = draft9.slots.flatMap(s => s.parts).reduce((sum, p) => sum + Number(p.points), 0);
  assert.equal(total9, 10, 'Grade 9 preset must equal 10.0 points');

  // Test newDraft presets for all grades 6 to 12
  for (const g of [6, 7, 8, 9, 10, 11, 12]) {
    assert.ok(ui.STANDARD_PRESETS[String(g)], `Preset for grade ${g} must exist`);
    const d = ui.newDraft(g, true);
    assert.equal(d.grade, g);
    assert.equal(d.total_points, 10);
    assert.equal(d.profile, g >= 10 ? 'THPT' : 'THCS');
    const tot = d.slots.flatMap(s => s.parts).reduce((sum, p) => sum + Number(p.points), 0);
    assert.equal(tot, 10, `Grade ${g} preset must sum to 10.0 points`);
  }
  console.log('PASS matrix UI: presets for all grades 6-12 verified at 10.0 points');

  // Test clean draft creation (no initial pre-filled lessons or slots)
  const cleanDraft = ui.newDraft(10, false);
  assert.equal(cleanDraft.grade, 10);
  assert.equal(cleanDraft.profile, 'THPT');
  assert.equal(cleanDraft.lessons.length, 0, 'Clean draft must start with 0 lessons');
  assert.equal(cleanDraft.slots.length, 0, 'Clean draft must start with 0 slots');
  assert.equal(cleanDraft.requirements.length, 0, 'Clean draft must start with 0 requirements');
  console.log('PASS matrix UI: clean draft creation starts empty with 0 lessons and 0 slots');

  // Test updateSlotsFromGrid interactive adjustments
  const testMatrix = ui.newDraft(8, true);
  const initialSlots = testMatrix.slots.length;
  // Reduce MC_B for B1 from 4 to 2
  ui.updateSlotsFromGrid(testMatrix, 'B1', 'MC_B', 2);
  assert.equal(testMatrix.slots.length, initialSlots - 2, 'Slots count should decrease by 2');
  // Increase MC_B for B1 back to 4
  ui.updateSlotsFromGrid(testMatrix, 'B1', 'MC_B', 4);
  assert.equal(testMatrix.slots.length, initialSlots, 'Slots count should restore to initial count');
  assert.equal(testMatrix.slots[0].id, 'S1');
  assert.equal(testMatrix.slots[0].number, 1);
  // Test sortLessonsByPpct when B2 is removed and re-added at the end (B1, B3, B4, B5, B2 -> B1, B2, B3, B4, B5)
  const sortMatrix = ui.newDraft(9, false);
  sortMatrix.lessons = [
    { lesson_code: 'B1', title: 'Thế giới kĩ thuật số', topic: 'Chủ đề 1' },
    { lesson_code: 'B3', title: 'Thực hành: Đánh giá chất lượng thông tin', topic: 'Chủ đề 2' },
    { lesson_code: 'B4', title: 'Một số vấn đề pháp lý về sử dụng dịch vụ Internet', topic: 'Chủ đề 3' },
    { lesson_code: 'B5', title: 'Tìm hiểu phần mềm mô phỏng', topic: 'Chủ đề 4' },
    { lesson_code: 'B2', title: 'Thông tin trong giải quyết vấn đề', topic: 'Chủ đề 2' }
  ];
  ui.sortLessonsByPpct(sortMatrix);
  assert.deepEqual(
    sortMatrix.lessons.map(l => l.lesson_code),
    ['B1', 'B2', 'B3', 'B4', 'B5'],
    'Lessons should be sorted in natural PPCT order B1..B5'
  );
  console.log('PASS matrix UI: web-native matrix creation, Asian School presets, lesson sorting & 2D grid updates passed');

  // Test interactive specGridHtml & fillLessonPpctRequirements & Grade 8 Word 100% exact format
  const g8Preset = ui.STANDARD_PRESETS['8'];
  assert(typeof ui.specGridHtml === 'function', 'specGridHtml should be exported');
  assert(typeof ui.fillLessonPpctRequirements === 'function', 'fillLessonPpctRequirements should be exported');
  const specHtml = ui.specGridHtml(g8Preset, false, false);
  assert(specHtml.includes('Bảng 2: Bảng đặc tả đề kiểm tra trực quan'), 'Should render Table 2 header');
  assert(specHtml.includes('Tự điền toàn bộ YCCĐ từ PPCT'), 'Should render 1-click auto-fill button');
  assert(specHtml.includes('mx-spec-req-input'), 'Should render editable textareas for requirements');
  assert(specHtml.includes('MC (B)'), 'Should format question count with level and competency');

  const g8WordHtml = ui.generateMatrixWordHtml(g8Preset, 'all');
  assert(g8WordHtml.includes('KHUNG MA TRẬN ĐỀ KIỂM TRA ĐỊNH KỲ'), 'Word should include Khung ma trận');
  assert(g8WordHtml.includes('BẢNG ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KỲ'), 'Word should include Bảng đặc tả');
  assert(g8WordHtml.includes('Lưu ý:'), 'Word should include notice notes under tables');
  assert(g8WordHtml.includes('4 MC (B) (NLa)'), 'Word should format Grade 8 exact cell 4 MC (B) (NLa)');
  assert(g8WordHtml.includes('1 ES (NLa)'), 'Word should format Grade 8 exact essay 1 ES (NLa)');
  assert(g8WordHtml.includes('16 câu B = 40%'), 'Word should format Grade 8 exact percentage row');
  console.log('PASS matrix UI: specGridHtml and Grade 8 exact layout Word export passed');
}
