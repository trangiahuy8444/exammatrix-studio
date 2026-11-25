const assert=require('node:assert/strict');
let ui;
try {ui=require('../public/matrices.js');}catch {ui=null;}
assert.ok(ui,'Matrix UI helpers must be implemented');
{
 const m={profile:'THCS',grade:9,lessons:[{lesson_code:'B1',title:'Bài'}],requirements:[{id:'R1',lesson_code:'B1',level:'Biết',text:'YCCĐ'}],slots:[1,2].map(i=>({id:'S'+i,number:i,kind:'MC',parts:[{requirement_id:'R1',points:5}]}))};
 const html=ui.matrixGridHtml(m,false,false);
 assert.ok(html.includes('Phân bố riêng'));assert.ok(html.includes('10 điểm'));assert.ok(!html.includes('95%'));assert.ok(!html.includes('0.50đ'));
}
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
  assert.ok(standalone.includes('@page WordSection1'));
  assert.ok(standalone.includes('mso-page-orientation: landscape'));
  assert.ok(standalone.includes('29.7cm 21.0cm'));
  assert.ok(standalone.includes('class="WordSection1"'));

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

  // Test two-stage locking: Table 1 (Matrix 2D) lock and Table 2 (Spec) lock
  const draftMatrix = ui.newDraft(8, false);
  draftMatrix.lessons = g8Preset.lessons;
  draftMatrix.requirements = g8Preset.requirements;
  draftMatrix.slots = g8Preset.slots;

  // Unlocked state
  const gridUnlockedHtml = ui.matrixGridHtml(draftMatrix, false, false);
  assert(gridUnlockedHtml.includes('data-action="lock-matrix"'), 'Matrix 2D should have Lock Matrix button');
  const specUnlockedHtml = ui.specGridHtml(draftMatrix, false, false);
  assert(specUnlockedHtml.includes('data-action="lock-spec"'), 'Spec grid should have Lock Spec button');

  // Matrix locked state (Table 1 locked, Table 2 remains editable)
  draftMatrix.matrix_locked = true;
  draftMatrix.spec_locked = false;
  const gridLockedHtml = ui.matrixGridHtml(draftMatrix, true, false);
  assert(gridLockedHtml.includes('Đã chốt Bảng ma trận 2D'), 'Matrix 2D should display locked badge');
  assert(gridLockedHtml.includes('data-action="unlock-matrix"'), 'Matrix 2D should have unlock-matrix action');
  assert(gridLockedHtml.includes('disabled'), 'Matrix 2D inputs should be disabled when locked');
  
  // Spec is still unlocked
  const specStillUnlockedHtml = ui.specGridHtml(draftMatrix, false, false);
  assert(specStillUnlockedHtml.includes('data-action="lock-spec"'), 'Spec should remain editable and have lock-spec action');

  // Spec locked state
  draftMatrix.spec_locked = true;
  const specLockedHtml = ui.specGridHtml(draftMatrix, true, false);
  assert(specLockedHtml.includes('Đã chốt Bảng đặc tả'), 'Spec grid should display locked badge');
  assert(specLockedHtml.includes('data-action="unlock-spec"'), 'Spec grid should have unlock-spec action');
  assert(specLockedHtml.includes('disabled'), 'Spec textareas should be disabled when locked');
  assert(!specLockedHtml.includes('class="mx-spec-refs-input"'), 'Spec question refs input should be disabled/hidden when locked');
  assert(!specLockedHtml.includes('class="mx-spec-comp-input"'), 'Spec comp input should be disabled/hidden when locked');

  // Verify essay slots restart numbering at 1
  const esRenumberMatrix = {
    lessons: [{ lesson_code: 'B1' }],
    requirements: [{ id: 'R1', lesson_code: 'B1', level: 'Biết' }, { id: 'R2', lesson_code: 'B1', level: 'Vận dụng' }],
    slots: [
      { kind: 'MC', number: 1, parts: [{ requirement_id: 'R1' }] },
      { kind: 'MC', number: 2, parts: [{ requirement_id: 'R1' }] },
      { kind: 'ES', number: 29, parts: [{ requirement_id: 'R2' }] },
      { kind: 'ES', number: 30, parts: [{ requirement_id: 'R2' }] }
    ]
  };
  ui.renumberAllSlots(esRenumberMatrix);
  assert.equal(esRenumberMatrix.slots[0].number, 1);
  assert.equal(esRenumberMatrix.slots[1].number, 2);
  assert.equal(esRenumberMatrix.slots[2].number, 1, 'ES must restart numbering at 1 instead of continuing from MC');
  assert.equal(esRenumberMatrix.slots[3].number, 2, 'ES must be continuous starting at 1');

  console.log('PASS matrix UI: two-stage independent locking for Matrix 2D and Spec Grid passed');

  // Test customizable question numbers by level and competency input in Spec Grid
  const customSpecMatrix = ui.newDraft(8, false);
  customSpecMatrix.lessons = g8Preset.lessons;
  customSpecMatrix.requirements = JSON.parse(JSON.stringify(g8Preset.requirements));
  customSpecMatrix.slots = g8Preset.slots;

  // Unlocked editable state should have mx-spec-refs-input and exactly 1 mx-spec-comp-input per level
  const editableSpecHtml = ui.specGridHtml(customSpecMatrix, false, false);
  assert(editableSpecHtml.includes('mx-spec-refs-input'), 'Should render editable question input mx-spec-refs-input');
  assert(editableSpecHtml.includes('mx-spec-comp-input'), 'Should render competency input mx-spec-comp-input');
  assert(editableSpecHtml.includes('mx-competency-datalist'), 'Should include datalist with standard competencies NLa..NLe');
  const b1BietCompInputs = (editableSpecHtml.match(/class="mx-spec-comp-input"[^>]*data-lesson-code="B1"[^>]*data-level="Biết"/g) || []).length;
  assert.equal(b1BietCompInputs, 1, 'There should be exactly 1 competency input for B1 - Biết (no duplicates in MC column)');

  // Set custom refs and custom competency for B1 - Biết
  customSpecMatrix.custom_level_refs = { 'B1|Biết': 'Câu 1 - 4 (Tùy chỉnh)' };
  customSpecMatrix.custom_level_comp = { 'B1|Biết': 'NLb' };
  // Also update requirement
  customSpecMatrix.requirements.forEach(r => {
    if (r.lesson_code === 'B1' && r.level === 'Biết') {
      r.custom_refs = 'Câu 1 - 4 (Tùy chỉnh)';
      r.competency = 'NLb';
    }
  });

  const updatedSpecHtml = ui.specGridHtml(customSpecMatrix, false, false);
  assert(updatedSpecHtml.includes('Câu 1 - 4 (Tùy chỉnh)'), 'Spec grid should display customized question refs');
  assert(updatedSpecHtml.includes('value="NLb"'), 'Spec grid competency input should have value NLb');
  assert(updatedSpecHtml.includes('4 MC (B)'), 'Column should display question count');
  assert(updatedSpecHtml.includes('reset-spec-refs'), 'Should render reset button when custom refs are set');

  // Check Word export reflects the custom refs and custom competency
  const updatedWordHtml = ui.generateMatrixWordHtml(customSpecMatrix, 'all');
  assert(updatedWordHtml.includes('Câu 1 - 4 (Tùy chỉnh)'), 'Word export must reflect custom question refs');
  assert(updatedWordHtml.includes('4 MC (B) (NLb)'), 'Word export must reflect customized competency (NLb)');

  // Test splitting requirements into per-question objectives (đặc tả theo mục tiêu của từng câu hỏi)
  const perQuestionMatrix = ui.newDraft(9, true);
  const splitCount = ui.splitQuestionRequirements(perQuestionMatrix, 'B1', 'Biết');
  assert.equal(splitCount, 4, 'B1 - Biết has 4 MC questions so splitting must create 4 per-question objective rows');
  const b1BietReqs = perQuestionMatrix.requirements.filter(r => r.lesson_code === 'B1' && r.level === 'Biết');
  assert.equal(b1BietReqs.length, 4);
  b1BietReqs[0].text = 'Mục tiêu riêng của Câu 1';
  b1BietReqs[1].text = 'Mục tiêu riêng của Câu 2';
  const perQSpecHtml = ui.specGridHtml(perQuestionMatrix, false, false);
  assert(perQSpecHtml.includes('4 mục tiêu câu hỏi'), 'Spec grid must show count of per-question objectives');
  assert(perQSpecHtml.includes('Mục tiêu riêng của Câu 1'), 'Spec grid must render objective of Question 1');
  assert(perQSpecHtml.includes('Mục tiêu riêng của Câu 2'), 'Spec grid must render objective of Question 2');
  const perQWordHtml = ui.generateMatrixWordHtml(perQuestionMatrix, 'specification');
  assert(perQWordHtml.includes('Mục tiêu riêng của Câu 1<strong> (Câu 1)</strong>'), 'Word spec table must pair Question 1 objective with (Câu 1)');
  assert(perQWordHtml.includes('Mục tiêu riêng của Câu 2<strong> (Câu 2)</strong>'), 'Word spec table must pair Question 2 objective with (Câu 2)');
  console.log('PASS matrix UI: customizable question numbers and competency in Table 2 passed');
}

// Khung hướng dẫn nhập số liệu trên bảng ma trận 2D (hiện cả khi đã khóa) và thu phóng khung xem trước.
{
  const draft = ui.newDraft(8, false);
  for (const locked of [false, true]) {
    const html = ui.matrixGridHtml(draft, locked, false);
    assert(html.includes('class="mx-help"'), 'Matrix 2D must render the help panel (locked=' + locked + ')');
    assert(html.includes('Hướng dẫn nhập số liệu'), 'Help panel must have its summary text');
    assert(html.includes('(1a, 1b)') && html.includes('(C1 - C4)'), 'Help must state the question-numbering rule');
    assert(/10,0 điểm/.test(html), 'Help must state the 10.0-point total');
    assert(!html.includes('<script'), 'Help must not use inline scripts (CSP)');
  }
  const fs = require('node:fs');
  const js = fs.readFileSync(require('node:path').join(__dirname, '../public/matrices.js'), 'utf8');
  const css = fs.readFileSync(require('node:path').join(__dirname, '../public/styles.css'), 'utf8');
  assert(js.includes("action==='preview-zoom'"), 'Preview zoom action handler must exist');
  assert(js.includes('PREVIEW_ZOOMS=[80,90,100,110,125,150]'), 'Zoom steps must be defined');
  for (const z of [80, 90, 110, 125, 150]) {
    assert(css.includes(`.mx-preview[data-zoom="${z}"] .mx-sheet-body{zoom:`), 'Missing zoom CSS for ' + z);
  }
  // Thu phóng chỉ là hiển thị: không được chèn style trực tiếp vào phần thân bảng sẽ được lưu/xuất.
  assert(!/mx-sheet-body[^`]{0,40}style=/.test(js.slice(js.indexOf('function renderPreviewBox'), js.indexOf('function renderComparisonBox'))), 'Zoom must not add inline style to .mx-sheet-body');
  for (const g of [6, 7]) {
    const p = ui.STANDARD_PRESETS[String(g)];
    assert(p && p.requirements.length > 0, `Preset grade ${g} must exist`);
    assert(p.requirements.every(r => ['NLa', 'NLb', 'NLc', 'NLd', 'NLe'].includes(r.competency)), `Preset grade ${g} must only use Informatics competencies NLa..NLe (no TDLL)`);
  }
  assert(js.includes("function switchGradeContext(rawGrade,source='create')"), 'switchGradeContext must exist to refresh UI and clear old grade preview/editor');
  assert(js.includes("if(el.id==='mx-create-grade')"), 'Changing #mx-create-grade must invoke switchGradeContext');
  assert(js.includes("ui.editing.requirements=[];\n      ui.editing.slots=[];"), 'Switching grade in editor must always clear old requirements and slots even if new grade has no PPCT');
  console.log('PASS matrix UI: help panel and display-only preview zoom passed');

  // Kiểm tra tính năng gom mục tiêu câu hỏi chung YCCĐ
  const testMatrix = {
    grade: 8,
    profile: 'THCS',
    lessons: [{ lesson_code: 'B1', title: 'Bài 1', topic: 'Chủ đề 1' }],
    requirements: [
      { id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết thiết bị xử lí.' },
      { id: 'R2', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết thiết bị xử lí. (Mục tiêu Câu 2)' }
    ],
    slots: [
      { id: 'S1', number: 1, kind: 'MC', parts: [{ id: 'P1', requirement_id: 'R1', points: 0.25 }] },
      { id: 'S2', number: 2, kind: 'MC', parts: [{ id: 'P2', requirement_id: 'R2', points: 0.25 }] }
    ]
  };
  const mergedCount = ui.mergeQuestionRequirements(testMatrix, 'B1', 'Biết');
  assert.equal(mergedCount, 1, 'Phải gom 1 mục tiêu thừa');
  assert.equal(testMatrix.requirements.length, 1, 'Chỉ còn 1 mục tiêu duy nhất');
  assert.equal(testMatrix.requirements[0].text, 'Nhận biết thiết bị xử lí.', 'Phải loại bỏ hậu tố Mục tiêu Câu');
  assert.equal(testMatrix.slots[0].parts[0].requirement_id, 'R1');
  assert.equal(testMatrix.slots[1].parts[0].requirement_id, 'R1');
  const view = ui.buildMatrixView(testMatrix);
  assert.deepEqual(view.requirements[0].refs, ['Câu 1', 'Câu 2'], 'Danh sách câu hỏi gộp phải hiển thị đầy đủ Câu 1, Câu 2');
  console.log('PASS matrix UI: gom mục tiêu câu hỏi chung YCCĐ thành công');

  // Kiểm tra tính năng Tạo đề thi từ Ma trận 2D và Làm Bảng 2 Đặc tả từ đề thi
  {
    const m = {
      grade: 8,
      profile: 'THCS',
      lessons: [{ lesson_code: 'B1', title: 'Bài 1', topic: 'Chủ đề A' }],
      requirements: [{ id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'YCCĐ gốc' }],
      slots: [{ id: 'S1', number: 1, kind: 'MC', parts: [{ id: 'P1', requirement_id: 'R1', points: 0.25 }] }]
    };
    const gridHtml = ui.matrixGridHtml(m, false, false);
    assert.ok(gridHtml.includes('data-action="create-exam-from-matrix"'), 'Phải có nút Tạo đề thi ngay từ Ma trận 2D');

    // Đề thi thực tế được sinh ra
    const mockExam = {
      id: 'EXAM-001',
      title: 'Đề kiểm tra GK1 Khối 8',
      exam_code: '101',
      grade: 8,
      questions: [
        { slot_number: 1, lesson_code: 'B1', level: 'Biết', learning_outcome: 'Nhận biết được CPU và RAM.', competency: 'NLa', type: 'MC', points: 0.25 },
        { slot_number: 2, lesson_code: 'B1', level: 'Hiểu', learning_outcome: 'Giải thích được nguyên lí Von Neumann.', competency: 'NLb', type: 'MC', points: 0.25 },
        { slot_number: 3, lesson_code: 'B2', level: 'Vận dụng', learning_outcome: 'Thực hành tạo bảng tính Excel.', competency: 'NLc', type: 'ES', points: 1.0 }
      ]
    };

    const synced = ui.syncSpecFromExam(m, mockExam);
    assert.equal(synced, true);
    assert.equal(m.requirements.length, 3, 'Phải sinh đúng 3 mục tiêu đặc tả tương ứng 3 câu trong đề');
    assert.equal(m.requirements[0].custom_refs, 'Câu 1');
    assert.equal(m.requirements[0].text, 'Nhận biết được CPU và RAM.');
    assert.equal(m.requirements[0].competency, 'NLa');
    assert.equal(m.requirements[1].custom_refs, 'Câu 2');
    assert.equal(m.requirements[1].competency, 'NLb');
    assert.equal(m.requirements[2].custom_refs, 'Câu 3');
    assert.equal(m.requirements[2].competency, 'NLc');
    assert.equal(m.requirements[2].lesson_code, 'B2');
    assert.ok(m.lessons.some(l => l.lesson_code === 'B2'), 'Phải tự động bổ sung Bài 2 vào danh sách bài học của ma trận');
    assert.equal(m.slots.length, 3);
    assert.equal(m.slots[2].kind, 'ES');
    assert.equal(m.slots[2].parts[0].points, 1.0);

    const specHtml = ui.specGridHtml(m, false, false);
    assert.ok(specHtml.includes('Nhận biết được CPU và RAM.'));
    assert.ok(specHtml.includes('Giải thích được nguyên lí Von Neumann.'));

    // Kiểm tra trường hợp Đề thi có các câu chung Yêu cầu cần đạt -> tự động GỘP vào 1 mục tiêu chung
    const mockExamWithSharedOutcomes = {
      id: 'EXAM-SHARED',
      title: 'Đề kiểm tra có câu chung YCCĐ',
      exam_code: '102',
      grade: 8,
      questions: [
        { slot_number: 1, lesson_code: 'B1', level: 'Biết', learning_outcome: 'Nhận biết được sự có mặt của các thiết bị có gắn bộ xử lí thông tin.', competency: 'NLa', type: 'MC', points: 0.25 },
        { slot_number: 2, lesson_code: 'B1', level: 'Biết', learning_outcome: 'Nhận biết được sự có mặt của các thiết bị có gắn bộ xử lí thông tin.', competency: 'NLa', type: 'MC', points: 0.25 },
        { slot_number: 3, lesson_code: 'B1', level: 'Hiểu', learning_outcome: 'Nêu được ví dụ minh họa về thiết bị thông minh.', competency: 'NLa', type: 'MC', points: 0.25 }
      ]
    };
    const mShared = {
      grade: 8,
      profile: 'THCS',
      lessons: [{ lesson_code: 'B1', title: 'Bài 1', topic: 'Chủ đề A' }],
      requirements: [],
      slots: []
    };
    const syncedShared = ui.syncSpecFromExam(mShared, mockExamWithSharedOutcomes);
    assert.equal(syncedShared, true);
    // 2 câu Biết chung YCCĐ được gộp vào 1 mục tiêu, cộng 1 câu Hiểu -> tổng cộng 2 mục tiêu đặc tả
    assert.equal(mShared.requirements.length, 2, 'Câu 1 và Câu 2 có chung YCCĐ phải được gộp thành 1 mục tiêu');
    assert.equal(mShared.requirements[0].custom_refs, 'Câu 1, Câu 2', 'custom_refs phải hiển thị cả Câu 1, Câu 2');
    assert.equal(mShared.requirements[0].text, 'Nhận biết được sự có mặt của các thiết bị có gắn bộ xử lí thông tin.');
    // Cả 2 slot S1 và S2 đều liên kết đến cùng 1 requirement này
    assert.equal(mShared.slots[0].parts[0].requirement_id, mShared.requirements[0].id);
    assert.equal(mShared.slots[1].parts[0].requirement_id, mShared.requirements[0].id);
    assert.equal(mShared.requirements[1].custom_refs, 'Câu 3');

    console.log('PASS matrix UI: tạo đề từ ma trận 2D và trích xuất Bảng 2 Đặc tả từ đề thi thành công (đã tự động gộp câu chung YCCĐ)');
  }
}

(async () => {
  const container = {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const calls = [];
  await ui.mount(container, {
    request: async () => ({
      matrices: [
        { id: 'M8', grade: 8, title: 'MT 8', status: 'draft', school_year: '2026-2027', profile: 'THCS', version: 1, slots: [] },
        { id: 'M9', grade: 9, title: 'MT 9', status: 'draft', school_year: '2026-2027', profile: 'THCS', version: 1, slots: [] }
      ]
    }),
    notify: () => {},
    context: { subject_name: 'Tin học' },
    ppct: { lessons: [] },
    revisions: [],
    exams: [],
    activeGrade: 9,
    activeGrades: [8, 9, 10],
    onGradeChange: g => calls.push(g)
  });

  assert.equal(calls.length, 0, 'mount() must NOT invoke onGradeChange');
  assert.ok(container.innerHTML.includes('Khối 8'));
  assert.ok(container.innerHTML.includes('Khối 9'));
  assert.ok(container.innerHTML.includes('Khối 10'));
  assert.ok(!container.innerHTML.includes('Khối 6'));
  assert.ok(!container.innerHTML.includes('Khối 7'));
  assert.ok(!container.innerHTML.includes('Khối 11'));
  assert.ok(!container.innerHTML.includes('Khối 12'));
  assert.ok(container.innerHTML.includes('MT 9'));
  assert.ok(!container.innerHTML.includes('MT 8'), 'Initial activeGrade 9 must filter out M8');

  await container.onchange({
    target: { id: 'mx-filter-grade', value: '10', dataset: { filter: 'grade' }, matches: () => false, closest: () => null }
  });
  assert.equal(calls[calls.length - 1], 10);

  await container.onchange({
    target: { id: 'mx-filter-grade', value: '', dataset: { filter: 'grade' }, matches: () => false, closest: () => null }
  });
  assert.equal(calls[calls.length - 1], 'all');
  assert.ok(container.innerHTML.includes('MT 8') && container.innerHTML.includes('MT 9'), 'Filter "Tất cả khối" must show both M8 and M9');

  await container.onchange({
    target: { id: 'mx-create-grade', value: '8', dataset: {}, matches: () => false, closest: () => null }
  });
  assert.equal(calls[calls.length - 1], 8);
  console.log('PASS matrix UI: đồng bộ không gian Khối lớp toàn cục 2 chiều thành công');

  // Kiểm tra luồng "Tự động chọn câu & Tạo đề ngay" (scarce overlapping matching + gửi đủ grade/exam_type/subject_name/duration + reviewed_part_ids)
  {
    const els = new Map();
    let reviewCheckboxes = [];
    const makeEl = (props = {}) => ({
      value: '',
      checked: false,
      innerHTML: '',
      textContent: '',
      dataset: {},
      disabled: false,
      matches: () => false,
      closest: () => null,
      ...props
    });
    const syncWorkElements = (html) => {
      reviewCheckboxes = [];
      for (const m of String(html || '').matchAll(/<(input|select)\b([^>]*)>/g)) {
        const attrs = m[2];
        const id = attrs.match(/\bid="([^"]*)"/)?.[1] || '';
        const val = attrs.match(/\bvalue="([^"]*)"/)?.[1] || '';
        const choice = attrs.match(/\bdata-choice="([^"]*)"/)?.[1] || '';
        const reviewSlot = attrs.match(/\bdata-review-slot="([^"]*)"/)?.[1] || '';
        const isChk = /\btype="checkbox"/.test(attrs);
        const dataset = {};
        if (choice) dataset.choice = choice;
        if (reviewSlot) dataset.reviewSlot = reviewSlot;
        const el = makeEl({ id, value: val, dataset, type: isChk ? 'checkbox' : undefined });
        if (id) els.set('#' + id, el);
        if (reviewSlot) reviewCheckboxes.push(el);
      }
      for (const m of String(html || '').matchAll(/<(div|span)\b[^>]*\bid="(mx-choice-detail-[^"]+|mx-coverage|mx-created-exam)"[^>]*>/g)) {
        const id = m[2];
        if (!els.has('#' + id)) els.set('#' + id, makeEl({ id }));
      }
    };
    const workEl = makeEl({ id: 'mx-work' });
    Object.defineProperty(workEl, 'innerHTML', {
      get() { return this._html || ''; },
      set(v) { this._html = v; syncWorkElements(v); }
    });
    els.set('#mx-work', workEl);

    const genContainer = {
      _html: '',
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = v; },
      querySelector(sel) { return els.get(sel) || null; },
      querySelectorAll(sel) {
        if (sel === '[data-review-slot]') return reviewCheckboxes;
        return [];
      }
    };

    const requests = [];
    const scarceMatrix = {
      id: 'MX-SCARCE',
      title: 'Ma trận GK1 Khối 9',
      grade: 9,
      subject_name: 'Tin học',
      exam_type: 'GK1',
      duration: 45,
      status: 'locked',
      profile: 'THCS',
      school_year: '2026-2027',
      version: 1,
      revision: 1,
      slots: [
        { id: 'S1', number: 1, kind: 'MC', parts: [{ id: 'P1', requirement_id: 'R1', points: 5 }] },
        { id: 'S2', number: 2, kind: 'MC', parts: [{ id: 'P2', requirement_id: 'R1', points: 5 }] }
      ],
      requirements: [{ id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết CPU' }]
    };
    const q1 = { id: 'Q1', question: 'Câu 1 chung?', options: ['A', 'B', 'C', 'D'], correct: 0, learning_outcome: 'Nhận biết CPU' };
    const q2 = { id: 'Q2', question: 'Câu 2 dự phòng?', options: ['A', 'B', 'C', 'D'], correct: 1, learning_outcome: 'Nhận biết CPU' };

    await ui.mount(genContainer, {
      request: async (path, body) => {
        requests.push({ path, body });
        if (path === '/api/matrices') return { matrices: [scarceMatrix] };
        if (path === '/api/matrices/MX-SCARCE') return { matrix: scarceMatrix, validation: { valid: true, errors: [] } };
        if (path === '/api/matrices/MX-SCARCE/candidates') {
          return {
            matrix: scarceMatrix,
            slots: [
              { slot: scarceMatrix.slots[0], requirements: [scarceMatrix.requirements[0]], candidates: [q1, q2] },
              { slot: scarceMatrix.slots[1], requirements: [scarceMatrix.requirements[0]], candidates: [q1] }
            ]
          };
        }
        if (path === '/api/exams/from-matrix') {
          return {
            exam: {
              id: 'EX-AUTO-1',
              grade: body.grade,
              campus: body.campus,
              exam_code: body.exam_code,
              question_count: body.placements.length,
              revision_match_count: 0,
              matrix_version: 1
            }
          };
        }
        return {};
      },
      notify: () => {},
      context: { subject_name: 'Tin học' },
      ppct: { lessons: [] },
      revisions: [],
      exams: [],
      activeGrade: 9,
      activeGrades: [8, 9, 10]
    });

    const mkBtn = (action, extra = {}) => ({
      dataset: { action, ...extra },
      matches: () => false,
      closest: (s) => (s === '[data-action]' ? { dataset: { action, ...extra } } : null)
    });
    const mkOpenBtn = (id) => ({
      dataset: { open: id },
      matches: () => false,
      closest: (s) => (s === '[data-open]' ? { dataset: { open: id } } : null)
    });

    await genContainer.onclick({ preventDefault: () => {}, target: mkOpenBtn('MX-SCARCE') });
    await genContainer.onclick({ preventDefault: () => {}, target: mkBtn('use') });
    await genContainer.onclick({ preventDefault: () => {}, target: mkBtn('quick-generate-exam') });

    const genCall = requests.find(r => r.path === '/api/exams/from-matrix');
    assert.ok(genCall, 'Phải gọi /api/exams/from-matrix khi bấm Tự động chọn câu & Tạo đề ngay');
    assert.equal(genCall.body.grade, 9);
    assert.equal(genCall.body.exam_type, 'GK1');
    assert.equal(genCall.body.subject_name, 'Tin học');
    assert.equal(genCall.body.duration, 45);
    assert.deepEqual(genCall.body.placements, [
      { slot_id: 'S1', question_id: 'Q2', reviewed_part_ids: ['P1'] },
      { slot_id: 'S2', question_id: 'Q1', reviewed_part_ids: ['P2'] }
    ], 'Backtracking phải chọn Q2 cho S1 và Q1 cho S2 kèm đủ reviewed_part_ids');
    console.log('PASS matrix UI: tự động chọn câu không trùng (backtracking) và tạo đề ngay gửi đủ tham số');
  }

  // Kiểm tra tự động bật Chế độ linh hoạt Ma trận 2D khi strict_empty_slots > 0 và flexible_empty_slots === 0
  {
    const els = new Map();
    let reviewCheckboxes = [];
    const makeEl = (props = {}) => ({
      value: '', checked: false, innerHTML: '', textContent: '', dataset: {}, disabled: false,
      matches: () => false, closest: () => null, ...props
    });
    const syncWorkElements = (html) => {
      reviewCheckboxes = [];
      for (const m of String(html || '').matchAll(/<(input|select)\b([^>]*)>/g)) {
        const attrs = m[2];
        const id = attrs.match(/\bid="([^"]*)"/)?.[1] || '';
        const val = attrs.match(/\bvalue="([^"]*)"/)?.[1] || '';
        const choice = attrs.match(/\bdata-choice="([^"]*)"/)?.[1] || '';
        const reviewSlot = attrs.match(/\bdata-review-slot="([^"]*)"/)?.[1] || '';
        const isChk = /\btype="checkbox"/.test(attrs);
        const dataset = {};
        if (choice) dataset.choice = choice;
        if (reviewSlot) dataset.reviewSlot = reviewSlot;
        const el = makeEl({ id, value: val, checked: /\bchecked\b/.test(attrs), dataset, type: isChk ? 'checkbox' : undefined });
        if (id) els.set('#' + id, el);
        if (reviewSlot) reviewCheckboxes.push(el);
      }
      for (const m of String(html || '').matchAll(/<(div|span)\b[^>]*\bid="(mx-choice-detail-[^"]+|mx-coverage|mx-created-exam)"[^>]*>/g)) {
        if (!els.has('#' + m[2])) els.set('#' + m[2], makeEl({ id: m[2] }));
      }
    };
    const workEl = makeEl({ id: 'mx-work' });
    Object.defineProperty(workEl, 'innerHTML', {
      get() { return this._html || ''; },
      set(v) { this._html = v; syncWorkElements(v); }
    });
    els.set('#mx-work', workEl);

    const flexContainer = {
      _html: '',
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = v; },
      querySelector(sel) { return els.get(sel) || null; },
      querySelectorAll(sel) { return sel === '[data-review-slot]' ? reviewCheckboxes : []; }
    };

    const requests = [];
    const mFlex = {
      id: 'MX-FLEX', title: 'Ma trận GK1 K9', grade: 9, subject_name: 'Tin học', exam_type: 'GK1',
      duration: 45, status: 'locked', profile: 'THCS', school_year: '2026-2027', version: 1, revision: 1,
      slots: [{ id: 'S1', number: 1, kind: 'MC', parts: [{ id: 'P1', requirement_id: 'R1', points: 10 }] }],
      requirements: [{ id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'YCCĐ PPCT 1' }]
    };
    const qDraft = { id: 'QD-1', question: 'Câu nháp K9?', options: ['A', 'B'], correct: 0, learning_outcome: 'YCCĐ khác', review_status: 'draft' };

    await ui.mount(flexContainer, {
      request: async (path, body) => {
        requests.push({ path, body });
        if (path === '/api/matrices') return { matrices: [mFlex] };
        if (path === '/api/matrices/MX-FLEX') return { matrix: mFlex, validation: { valid: true, errors: [] } };
        if (path === '/api/matrices/MX-FLEX/candidates') {
          return {
            matrix: mFlex,
            slots: [{ slot: mFlex.slots[0], requirements: [mFlex.requirements[0]], candidates: [] }],
            flexible_slots: [{ slot: mFlex.slots[0], requirements: [mFlex.requirements[0]], candidates: [qDraft] }],
            bank_diagnostics: { total_in_grade: 459, approved_in_grade: 0, unapproved_in_grade: 459, strict_empty_slots: 1, flexible_empty_slots: 0 }
          };
        }
        if (path === '/api/exams/from-matrix') {
          return { exam: { id: 'EX-FLEX-1', grade: 9, campus: body.campus, exam_code: body.exam_code, question_count: 1, revision_match_count: 0, matrix_version: 1 } };
        }
        return {};
      },
      notify: () => {}, context: { subject_name: 'Tin học' }, ppct: { lessons: [] }, revisions: [], exams: [], activeGrade: 9, activeGrades: [8, 9, 10]
    });

    await flexContainer.onclick({ preventDefault: () => {}, target: { dataset: { open: 'MX-FLEX' }, matches: () => false, closest: s => (s === '[data-open]' ? { dataset: { open: 'MX-FLEX' } } : null) } });
    await flexContainer.onclick({ preventDefault: () => {}, target: { dataset: { action: 'use' }, matches: () => false, closest: s => (s === '[data-action]' ? { dataset: { action: 'use' } } : null) } });

    assert.equal(els.get('#mx-flexible-mode')?.checked, true, 'Phải tự bật #mx-flexible-mode khi strict trống nhưng flexible có câu');
    await flexContainer.onclick({ preventDefault: () => {}, target: { dataset: { action: 'quick-generate-exam' }, matches: () => false, closest: s => (s === '[data-action]' ? { dataset: { action: 'quick-generate-exam' } } : null) } });

    const genCall = requests.find(r => r.path === '/api/exams/from-matrix');
    assert.ok(genCall, 'Phải gọi /api/exams/from-matrix ở chế độ linh hoạt');
    assert.equal(genCall.body.flexible, true);
    assert.deepEqual(genCall.body.placements, [{ slot_id: 'S1', question_id: 'QD-1', reviewed_part_ids: ['P1'] }]);
    console.log('PASS matrix UI: tự động bật Chế độ linh hoạt Ma trận 2D và gửi flexible: true');
  }

  // Kiểm tra downloadMatrixWord luôn xuất đúng nội dung Web khổ Landscape ngay cả khi có FirebaseClient + BankStaticExport
  {
    const prevWin = global.window;
    const prevDoc = global.document;
    const prevCreateUrl = global.URL.createObjectURL;
    const prevRevokeUrl = global.URL.revokeObjectURL;
    const createdLinks = [];
    let capturedBlob = null;
    try {
      global.window = {
        ...(prevWin || {}),
        FirebaseClient: { canHandle: () => true },
        BankStaticExport: { matrixBytes: () => { throw new Error('downloadMatrixWord must not call raw matrixBytes'); } }
      };
      global.document = {
        ...(prevDoc || {}),
        createElement: tag => {
          const el = { tagName: tag.toUpperCase(), href: '', download: '', clicked: false, click() { this.clicked = true; }, remove() {} };
          createdLinks.push(el);
          return el;
        },
        body: { appendChild: () => {} }
      };
      global.URL.createObjectURL = b => { capturedBlob = b; return 'blob:test-word'; };
      global.URL.revokeObjectURL = () => {};

      const mTest = {
        id: 'MX-DOC', title: 'Ma trận & Đặc tả K9', grade: 9, subject_name: 'Tin học', exam_type: 'GK1',
        profile: 'THCS', school_year: '2026-2027',
        lessons: [{ lesson_code: 'B1', title: 'Thế giới kĩ thuật số', topic: 'Chủ đề 1' }],
        requirements: [{ id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết thiết bị số' }],
        slots: [{ id: 'S1', number: 1, kind: 'MC', parts: [{ requirement_id: 'R1', points: 10 }] }]
      };
      ui.downloadMatrixWord(mTest, 'all');
      assert.equal(createdLinks.length, 1);
      assert.equal(createdLinks[0].download, 'TIN_9_GK1_MA_TRAN_VA_DAC_TA.doc');
      assert.equal(createdLinks[0].clicked, true);
      assert.ok(capturedBlob, 'Phải tạo Blob Word');
      const docText = await capturedBlob.text();
      assert.ok(docText.includes('KHUNG MA TRẬN ĐỀ KIỂM TRA ĐỊNH KỲ'));
      assert.ok(docText.includes('BẢNG ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KỲ'));
      assert.ok(docText.includes('mso-page-orientation: landscape'));
      assert.ok(docText.includes('class="WordSection1"'));
      console.log('PASS matrix UI: downloadMatrixWord xuất đúng nội dung Web khổ Landscape ngay cả trên bản Pages');
    } finally {
      global.window = prevWin;
      global.document = prevDoc;
      global.URL.createObjectURL = prevCreateUrl;
      global.URL.revokeObjectURL = prevRevokeUrl;
    }
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
