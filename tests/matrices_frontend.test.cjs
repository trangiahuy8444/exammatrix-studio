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

  // Helper tạo fixture ma trận kiểm thử sạch (không còn STANDARD_PRESETS viết sẵn)
  function buildSampleThcsMatrix(grade) {
    const lessons = [
      { lesson_code: 'B1', title: 'Bài 1', topic: 'Chủ đề 1' },
      { lesson_code: 'B2', title: 'Bài 2', topic: 'Chủ đề 2' },
      { lesson_code: 'B3', title: 'Bài 3', topic: 'Chủ đề 2' },
      { lesson_code: 'B4', title: 'Bài 4', topic: 'Chủ đề 3' },
      { lesson_code: 'B12', title: 'Bài 12', topic: 'Chủ đề 4' }
    ];
    const requirements = [
      { id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'YCCĐ B1 Biết', ppct_outcome_index: 0, competency: 'NLa' },
      { id: 'R2', lesson_code: 'B1', level: 'Hiểu', text: 'YCCĐ B1 Hiểu', ppct_outcome_index: 1, competency: 'NLa' },
      { id: 'R3', lesson_code: 'B2', level: 'Biết', text: 'YCCĐ B2 Biết', ppct_outcome_index: 0, competency: 'NLa' },
      { id: 'R4', lesson_code: 'B2', level: 'Hiểu', text: 'YCCĐ B2 Hiểu', ppct_outcome_index: 1, competency: 'NLa' },
      { id: 'R5', lesson_code: 'B2', level: 'Vận dụng', text: 'YCCĐ B2 VD', ppct_outcome_index: 0, competency: 'NLa' },
      { id: 'R6', lesson_code: 'B3', level: 'Biết', text: 'YCCĐ B3 Biết', ppct_outcome_index: 0, competency: 'NLa' },
      { id: 'R7', lesson_code: 'B3', level: 'Hiểu', text: 'YCCĐ B3 Hiểu', ppct_outcome_index: 0, competency: 'NLa' },
      { id: 'R8', lesson_code: 'B3', level: 'Vận dụng', text: 'YCCĐ B3 VD', ppct_outcome_index: 0, competency: 'NLa' },
      { id: 'R9', lesson_code: 'B4', level: 'Biết', text: 'YCCĐ B4 Biết', ppct_outcome_index: 0, competency: 'NLb' },
      { id: 'R10', lesson_code: 'B4', level: 'Hiểu', text: 'YCCĐ B4 Hiểu', ppct_outcome_index: 0, competency: 'NLb' },
      { id: 'R11', lesson_code: 'B4', level: 'Vận dụng', text: 'YCCĐ B4 VD', ppct_outcome_index: 0, competency: 'NLb' },
      { id: 'R12', lesson_code: 'B12', level: 'Biết', text: 'YCCĐ B12 Biết', ppct_outcome_index: 0, competency: 'NLc' },
      { id: 'R13', lesson_code: 'B12', level: 'Hiểu', text: 'YCCĐ B12 Hiểu', ppct_outcome_index: 0, competency: 'NLc' }
    ];
    const mcReqIds = [
      'R1','R1','R1','R1',
      'R2','R2','R2',
      'R3','R3','R3',
      'R4','R4','R4',
      'R6','R6','R6',
      'R7','R7',
      'R9','R9','R9','R9',
      'R10','R10','R10',
      'R12','R12',
      'R13'
    ];
    const slots = mcReqIds.map((rid, i) => ({
      id: 'S' + (i + 1),
      kind: 'MC',
      number: i + 1,
      parts: [{ id: 'P' + (i + 1), label: '', requirement_id: rid, points: 0.25, indicator: '' }],
      scoring: { mode: 'sum_parts' }
    }));
    ['R5', 'R8', 'R11'].forEach((rid, i) => {
      const idx = slots.length + 1;
      slots.push({
        id: 'S' + idx,
        kind: 'ES',
        number: i + 1,
        parts: [{ id: 'P' + idx, label: '', requirement_id: rid, points: 1, indicator: '' }],
        scoring: { mode: 'sum_parts' }
      });
    });
    return {
      ...ui.newDraft(grade),
      lessons,
      requirements,
      slots
    };
  }

  // Xác nhận đã bỏ hoàn toàn bộ mẫu viết sẵn STANDARD_PRESETS; newDraft luôn tạo nháp trắng
  assert.equal(ui.STANDARD_PRESETS, undefined, 'STANDARD_PRESETS must be completely removed');
  for (const g of [6, 7, 8, 9, 10, 11, 12]) {
    const d = ui.newDraft(g);
    assert.equal(d.grade, g);
    assert.equal(d.total_points, 10);
    assert.equal(d.profile, g >= 10 ? 'THPT' : 'THCS');
    assert.equal(d.lessons.length, 0, `Grade ${g} newDraft must start empty without preset`);
    assert.equal(d.slots.length, 0, `Grade ${g} newDraft must start with 0 slots`);
    assert.equal(d.requirements.length, 0, `Grade ${g} newDraft must start with 0 requirements`);
  }
  console.log('PASS matrix UI: clean draft creation across grades 6-12 with STANDARD_PRESETS removed');

  // Test updateSlotsFromGrid interactive adjustments
  const testMatrix = buildSampleThcsMatrix(8);
  const initialSlots = testMatrix.slots.length;
  assert.equal(initialSlots, 31);
  // Reduce MC_B for B1 from 4 to 2
  ui.updateSlotsFromGrid(testMatrix, 'B1', 'MC_B', 2);
  assert.equal(testMatrix.slots.length, initialSlots - 2, 'Slots count should decrease by 2');
  // Increase MC_B for B1 back to 4
  ui.updateSlotsFromGrid(testMatrix, 'B1', 'MC_B', 4);
  assert.equal(testMatrix.slots.length, initialSlots, 'Slots count should restore to initial count');
  assert.equal(testMatrix.slots[0].id, 'S1');
  assert.equal(testMatrix.slots[0].number, 1);
  // Test sortLessonsByPpct when B2 is removed and re-added at the end (B1, B3, B4, B5, B2 -> B1, B2, B3, B4, B5)
  const sortMatrix = ui.newDraft(9);
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
  console.log('PASS matrix UI: web-native matrix creation, lesson sorting & 2D grid updates passed');

  // Test interactive specGridHtml with new 2-button bank workflow & Word export
  const g8Matrix = buildSampleThcsMatrix(8);
  assert(typeof ui.specGridHtml === 'function', 'specGridHtml should be exported');
  assert(typeof ui.autoFillSpecFromBank === 'function', 'autoFillSpecFromBank should be exported');
  assert(typeof ui.bankOutcomesForLesson === 'function', 'bankOutcomesForLesson should be exported');
  assert(typeof ui.applySpecBankSelections === 'function', 'applySpecBankSelections should be exported');
  assert(typeof ui.reconcileSpecRequirements === 'function', 'reconcileSpecRequirements should be exported');

  const g8GridHtml = ui.matrixGridHtml(g8Matrix, false, false);
  assert(!g8GridHtml.includes('apply-preset'), 'Matrix 1 must not render apply-preset button');

  const specHtml = ui.specGridHtml(g8Matrix, false, false);
  assert(specHtml.includes('Bảng 2: Bảng đặc tả đề kiểm tra trực quan'), 'Should render Table 2 header');
  assert(specHtml.includes('data-action="random-fill-spec-from-bank"'), 'Should render random-fill-from-bank button');
  assert(specHtml.includes('data-action="open-spec-bank-picker"'), 'Should render open-spec-bank-picker button');
  assert(specHtml.includes('data-action="random-fill-lesson-from-bank"'), 'Should render per-lesson random bank button');
  assert(!specHtml.includes('auto-fill-all-ppct-reqs'), 'Must not render old auto-fill PPCT button');
  assert(!specHtml.includes('fill-lesson-ppct-reqs'), 'Must not render old per-lesson fill PPCT button');
  assert(!specHtml.includes('split-all-question-reqs'), 'Must not render manual split button');
  assert(!specHtml.includes('merge-all-question-reqs'), 'Must not render manual merge button');
  assert(specHtml.includes('mx-spec-req-input'), 'Should render editable textareas for requirements');
  assert(specHtml.includes('MC (B)'), 'Should format question count with level and competency');
  assert(specHtml.includes('mx-spec-lesson-row'), 'Should render lesson row highlight classes');
  assert(specHtml.includes('mx-spec-lesson-code'), 'Should render lesson code badge');
  assert(specHtml.includes('mx-spec-topic-start'), 'Should render topic boundary marker');
  assert(specHtml.includes('mx-spec-level-block'), 'Should render level separator block inside lesson');

  const g8WordHtml = ui.generateMatrixWordHtml(g8Matrix, 'all');
  assert(g8WordHtml.includes('KHUNG MA TRẬN ĐỀ KIỂM TRA ĐỊNH KỲ'), 'Word should include Khung ma trận');
  assert(g8WordHtml.includes('BẢNG ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KỲ'), 'Word should include Bảng đặc tả');
  assert(g8WordHtml.includes('Lưu ý:'), 'Word should include notice notes under tables');
  assert(g8WordHtml.includes('4 MC (B) (NLa)'), 'Word should format Grade 8 exact cell 4 MC (B) (NLa)');
  assert(g8WordHtml.includes('1 ES (NLa)'), 'Word should format Grade 8 exact essay 1 ES (NLa)');
  assert(g8WordHtml.includes('16 câu B = 40%'), 'Word should format Grade 8 exact percentage row');
  console.log('PASS matrix UI: specGridHtml and Grade 8 exact layout Word export passed');

  // Test two-stage locking: Table 1 (Matrix 2D) lock and Table 2 (Spec) lock
  const draftMatrix = buildSampleThcsMatrix(8);

  // Unlocked state
  const gridUnlockedHtml = ui.matrixGridHtml(draftMatrix, false, false);
  assert(gridUnlockedHtml.includes('data-action="lock-matrix"'), 'Matrix 2D should have Lock Matrix button');
  const specUnlockedHtml = ui.specGridHtml(draftMatrix, false, false);
  assert(specUnlockedHtml.includes('data-action="lock-spec"'), 'Spec grid should have Lock Spec button');

  // Matrix locked state (Table 1 locked, Table 2 remains editable)
  draftMatrix.matrix_locked = true;
  draftMatrix.spec_locked = false;
  const gridLockedHtml = ui.matrixGridHtml(draftMatrix, true, false);
  assert(gridLockedHtml.includes('🔒 Đã chốt Bảng ma trận 2D'), 'Matrix 2D should display locked badge');
  assert(gridLockedHtml.includes('data-action="unlock-matrix"'), 'Matrix 2D should have unlock-matrix action');
  assert(gridLockedHtml.includes('disabled'), 'Matrix 2D inputs should be disabled when locked');
  
  // Spec is still unlocked
  const specStillUnlockedHtml = ui.specGridHtml(draftMatrix, false, false);
  assert(specStillUnlockedHtml.includes('data-action="lock-spec"'), 'Spec should remain editable and have lock-spec action');

  // Spec locked state
  draftMatrix.spec_locked = true;
  const specLockedHtml = ui.specGridHtml(draftMatrix, true, false);
  assert(specLockedHtml.includes('🔒 Đã chốt Bảng đặc tả'), 'Spec grid should display locked badge');
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
  const customSpecMatrix = buildSampleThcsMatrix(8);

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

  // Test per-question objectives automatically separated & rendered cleanly
  const perQuestionMatrix = buildSampleThcsMatrix(9);
  const splitCount = ui.splitQuestionRequirements(perQuestionMatrix, 'B1', 'Biết');
  assert.equal(splitCount, 4, 'B1 - Biết has 4 MC questions so splitting must create 4 per-question objective rows');
  const b1BietReqs = perQuestionMatrix.requirements.filter(r => r.lesson_code === 'B1' && r.level === 'Biết');
  assert.equal(b1BietReqs.length, 4);
  b1BietReqs[0].text = 'Mục tiêu riêng của Câu 1';
  b1BietReqs[1].text = 'Mục tiêu riêng của Câu 2';
  const perQSpecHtml = ui.specGridHtml(perQuestionMatrix, false, false);
  assert(perQSpecHtml.includes('4 mục tiêu (tự động tách theo YCCĐ)'), 'Spec grid must show count of per-question objectives');
  assert(perQSpecHtml.includes('Mục tiêu riêng của Câu 1'), 'Spec grid must render objective of Question 1');
  assert(perQSpecHtml.includes('Mục tiêu riêng của Câu 2'), 'Spec grid must render objective of Question 2');
  const perQWordHtml = ui.generateMatrixWordHtml(perQuestionMatrix, 'specification');
  assert(perQWordHtml.includes('Mục tiêu riêng của Câu 1<strong> (Câu 1)</strong>'), 'Word spec table must pair Question 1 objective with (Câu 1)');
  assert(perQWordHtml.includes('Mục tiêu riêng của Câu 2<strong> (Câu 2)</strong>'), 'Word spec table must pair Question 2 objective with (Câu 2)');
  console.log('PASS matrix UI: customizable question numbers and competency in Table 2 passed');
}

// Khung hướng dẫn nhập số liệu trên bảng ma trận 2D (hiện cả khi đã khóa) và thu phóng khung xem trước.
{
  const draft = ui.newDraft(8);
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
        BankStaticExport: { zipFiles: require('../public/static-exam-export.js').zipFiles, matrixBytes: () => { throw new Error('downloadMatrixWord must not call raw matrixBytes'); } }
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
      assert.equal(createdLinks[0].download, 'TIN_9_GK1_MA_TRAN_VA_DAC_TA.docx');
      assert.equal(createdLinks[0].clicked, true);
      assert.ok(capturedBlob, 'Phải tạo Blob Word');
      const docText = Buffer.from(await capturedBlob.arrayBuffer()).toString('utf8');
      assert.ok(docText.startsWith('PK'), 'Phải là tệp .docx (ZIP)');
      assert.ok(docText.includes('KHUNG MA TRẬN ĐỀ KIỂM TRA ĐỊNH KỲ'));
      assert.ok(docText.includes('BẢNG ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KỲ'));
      assert.ok(docText.includes('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'), 'Khổ ngang A4');
      assert.ok(docText.includes('w:top="567"') && docText.includes('w:bottom="567"'), 'Lề trên/dưới 1,0 cm');
      assert.ok(docText.includes('w:left="1616"') && docText.includes('w:right="1616"'), 'Vùng chữ rộng 24 cm');
      assert.ok(docText.includes(' NUMPAGES '), 'Chân trang Trang X/Y');
      assert.ok(docText.includes('<w:tblHeader/>'), 'Dòng tiêu đề bảng lặp lại mỗi trang');
      assert.ok(docText.includes('<w:vMerge w:val="restart"/>') && docText.includes('<w:gridSpan w:val="'), 'Gộp ô dọc và ngang thành bảng Word gốc');
      assert.ok(docText.includes('<w:tblW w:w="13606" w:type="dxa"/>'), 'Bảng rộng đúng 24 cm');
      assert.ok(!docText.includes('altChunk') && !docText.includes('<table'), 'Không nhúng HTML: mở được cả ở Google Docs, Pages');
      const matrixOnly = ui.generateMatrixWordHtml(mTest, 'matrix');
      assert.ok(matrixOnly.includes('<small>(1)</small>') && !/<small>\(Câu/.test(matrixOnly), 'Ô ma trận đánh số thuần (1), không có chữ Câu');
      assert.ok(ui.generateMatrixWordHtml(mTest, 'specification').includes('Câu 1'), 'Bảng đặc tả vẫn ghi (Câu 1) cuối YCCĐ');
      console.log('PASS matrix UI: downloadMatrixWord xuất đúng nội dung Web khổ Landscape ngay cả trên bản Pages');
    } finally {
      global.window = prevWin;
      global.document = prevDoc;
      global.URL.createObjectURL = prevCreateUrl;
      global.URL.revokeObjectURL = prevRevokeUrl;
    }
  }

  // Kiểm tra liên kết lại ma trận gốc khi trích xuất Bảng 2 Đặc tả từ đề & mở lại từ KHKTĐG (không tạo phiên bản trùng)
  {
    const prevDoc = global.document;
    const workEl = { innerHTML: '', scrollIntoView: () => {}, querySelector: () => null, querySelectorAll: () => [] };
    const listEl = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
    const noticeEl = { hidden: true, className: '', textContent: '' };
    const stubEls = { '#mx-work': workEl, '#mx-list': listEl, '#mx-notice': noticeEl };
    const host = {
      innerHTML: '',
      querySelector: sel => stubEls[sel] || { innerHTML: '', textContent: '', hidden: false, value: '', disabled: false, querySelector: () => null, querySelectorAll: () => [] },
      querySelectorAll: () => [],
      addEventListener: () => {}
    };
    global.document = {
      getElementById: () => null,
      createElement: () => ({ innerHTML: '', style: {}, querySelector: () => null, querySelectorAll: () => [] })
    };
    try {
      const unlockedCalls = [];
      let records = [
        {
          id: 'MX-ORIG-1',
          family_id: 'FAM-ORIG',
          version: 1,
          revision: 2,
          status: 'locked',
          matrix_locked: true,
          spec_locked: false,
          title: 'Ma trận GK1 Tin 8 gốc',
          grade: 8,
          subject_name: 'Tin học',
          exam_type: 'GK1',
          duration: 45,
          assessment_plan_id: 'AP-8-GK1',
          profile: 'THCS',
          lessons: [{ lesson_code: 'B1', title: 'Thông tin', topic: 'Chủ đề 1' }],
          requirements: [{ id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'YCCĐ gốc' }],
          slots: [{ id: 'S1', number: 1, kind: 'MC', parts: [{ id: 'P1', requirement_id: 'R1', points: 0.25 }] }]
        }
      ];
      await ui.mount(host, {
        context: { subject_name: 'Tin học' },
        ppct: { lessons: [{ grade: 8, subject_name: 'Tin học', lesson_code: 'B1', lesson_name_source: 'Thông tin', topic_source: 'Chủ đề 1', outcomes: ['Nhận biết thông tin số'] }] },
        activeGrade: 8,
        activeGrades: [8, 9],
        request: async (url, body) => {
          if (url === '/api/matrices') return { matrices: records };
          if (url === '/api/matrices/unlock') {
            unlockedCalls.push(body.id);
            const cur = records.find(m => m.id === body.id);
            cur.status = 'draft';
            cur.revision = (cur.revision || 0) + 1;
            return { matrix: cur, validation: { valid: true, errors: [] } };
          }
          if (url.startsWith('/api/matrices/MX-ORIG-1')) {
            return { matrix: records[0] };
          }
          return {};
        },
        notify: () => {}
      });
      const resPlan = await ui.createFromPlan({ id: 'AP-8-GK1', name: 'Giữa kì 1', grade: 8, subject_name: 'Tin học', exam_type: 'GK1', duration: 45 });
      assert.equal(resPlan.reused, true, 'Lập ma trận từ KHKTĐG phải mở lại ma trận đã gắn AP-8-GK1');
      assert.equal(resPlan.matrix.id, 'MX-ORIG-1');
      const resSpec = await ui.openEditorWithExamSpec({
        id: 'EX-FROM-ORIG',
        matrix_id: 'MX-ORIG-1',
        title: 'Đề GK1 · Mã 101',
        exam_code: '101',
        grade: 8,
        subject_name: 'Tin học',
        exam_type: 'GK1',
        duration: 45,
        questions: [
          { slot_number: 1, lesson_code: 'B1', level: 'Biết', learning_outcome: 'Nhận biết thông tin số', competency: 'NLa', type: 'MC', points: 0.25 }
        ]
      });
      assert.equal(resSpec.reused, true, 'Trích xuất Bảng 2 Đặc tả phải liên kết lại ma trận gốc MX-ORIG-1');
      assert.equal(resSpec.matrix.id, 'MX-ORIG-1', 'ID ma trận gốc phải được giữ nguyên, không tạo phiên bản mới');
      assert.equal(resSpec.matrix.matrix_locked, true, 'Bảng 1 Ma trận đã chốt vẫn giữ nguyên khóa');
      assert.equal(resSpec.matrix.source_exam_id, 'EX-FROM-ORIG');
      assert.deepEqual(unlockedCalls, ['MX-ORIG-1'], 'Ma trận locked gốc phải được mở khóa tại chỗ để ghi Bảng 2');
      console.log('PASS matrix UI: trích xuất Bảng 2 Đặc tả và KHKTĐG liên kết lại đúng ma trận gốc, không tạo phiên bản trùng');
    } finally {
      global.document = prevDoc;
    }
  }

  // Kiểm tra Bảng 2 lấy YCCĐ + NL từ Ngân hàng đề & tự động gom/tách
  {
    const prevDoc = global.document;
    const stubHost = {
      innerHTML: '',
      querySelector: () => ({ innerHTML: '', textContent: '', hidden: false, value: '', disabled: false, querySelector: () => null, querySelectorAll: () => [] }),
      querySelectorAll: () => [],
      addEventListener: () => {}
    };
    global.document = {
      getElementById: () => null,
      createElement: () => ({ innerHTML: '', style: {}, querySelector: () => null, querySelectorAll: () => [] })
    };
    try {
      const bankQuestions = [
        { id: 'Q1', grade: 8, subject_name: 'Tin học', lesson_code: 'B1', type: 'MC', level: 'Biết', review_status: 'approved', learning_outcome: 'Trình bày được sơ lược lịch sử phát triển máy tính.', competency: 'NLa' },
        { id: 'Q2', grade: 8, subject_name: 'Tin học', lesson_code: 'B1', type: 'MC', level: 'Biết', review_status: 'approved', learning_outcome: 'Nêu được ví dụ thay đổi xã hội do máy tính mang lại.', competency: 'NLb' },
        { id: 'Q3', grade: 8, subject_name: 'Tin học', lesson_code: 'B1', type: 'MC', level: 'Hiểu', review_status: 'approved', learning_outcome: 'Trình bày được sơ lược lịch sử phát triển máy tính.', competency: 'NLa' },
        { id: 'Q4', grade: 9, subject_name: 'Tin học', lesson_code: 'B1', type: 'MC', level: 'Biết', review_status: 'approved', learning_outcome: 'YCCĐ khối 9 không được lẫn vào khối 8.', competency: 'NLd' },
        { id: 'Q5', grade: 8, subject_name: 'Toán học', lesson_code: 'B1', type: 'MC', level: 'Biết', review_status: 'approved', learning_outcome: 'YCCĐ môn Toán không được lẫn vào Tin học.', competency: 'TDLL' }
      ];
      await ui.mount(stubHost, {
        context: { subject_name: 'Tin học' },
        ppct: {
          lessons: [
            {
              grade: 8,
              subject_name: 'Tin học',
              lesson_code: 'B1',
              lesson_name_source: 'Lược sử công cụ tính toán',
              topic_source: 'Chủ đề 1',
              outcomes: [
                'Trình bày được sơ lược lịch sử phát triển máy tính.',
                'Nêu được ví dụ thay đổi xã hội do máy tính mang lại.',
                'YCCĐ thứ 3 chưa có câu trong ngân hàng đề.'
              ],
              outcome_ids: ['TIN8-B1-YC1', 'TIN8-B1-YC2', 'TIN8-B1-YC3']
            }
          ]
        },
        questions: bankQuestions,
        activeGrade: 8,
        activeGrades: [8],
        request: async url => (url === '/api/matrices' ? { matrices: [] } : {}),
        notify: () => {}
      });

      const m = ui.newDraft(8);
      m.lessons = [{ lesson_code: 'B1', title: 'Lược sử công cụ tính toán', topic: 'Chủ đề 1' }];
      ui.updateSlotsFromGrid(m, 'B1', 'MC_B', 3);
      // Mặc định updateSlotsFromGrid tạo outcome_mode: 'any'
      assert.equal(m.requirements[0].outcome_mode, 'any');

      const bankInfo = ui.bankOutcomesForLesson(m, 'B1', { kind: 'MC', level: 'Biết' });
      assert.equal(bankInfo.bankItems.length, 2, 'Chỉ lấy 2 YCCĐ thuộc đúng Khối 8 · Tin học · B1 từ Ngân hàng đề');
      assert.equal(bankInfo.ppctOnly.length, 1, 'Tách riêng 1 YCCĐ PPCT chưa có câu hỏi nào trong Ngân hàng đề');
      assert.equal(bankInfo.ppctOnly[0].ppct_outcome_index, 2);
      assert(bankInfo.bankItems.every(x => !x.text.includes('khối 9') && !x.text.includes('Toán')), 'Không lẫn dữ liệu khác khối/môn');

      // 1) Chọn 2 câu cùng YCCĐ+NL (YC1, NLa) và 1 câu khác YCCĐ+NL (YC2, NLb) -> tự động tách thành 2 dòng (Câu 1, Câu 2) và (Câu 3)
      const sel1 = new Map([
        [m.slots[0].id, { lesson_code: 'B1', level: 'Biết', text: bankInfo.bankItems[0].text, competency: 'NLa', ppct_outcome_index: 0, ppct_outcome_id: 'TIN8-B1-YC1' }],
        [m.slots[1].id, { lesson_code: 'B1', level: 'Biết', text: bankInfo.bankItems[0].text, competency: 'NLa', ppct_outcome_index: 0, ppct_outcome_id: 'TIN8-B1-YC1' }],
        [m.slots[2].id, { lesson_code: 'B1', level: 'Biết', text: bankInfo.bankItems[1].text, competency: 'NLb', ppct_outcome_index: 1, ppct_outcome_id: 'TIN8-B1-YC2' }]
      ]);
      const r1 = ui.applySpecBankSelections(m, sel1);
      assert.equal(r1.updatedSlots, 3);
      assert.equal(m.requirements.length, 2, 'Tự động gom 2 câu chung YCCĐ+NL và tách 1 câu khác YCCĐ+NL thành 2 dòng');
      assert.equal(m.requirements[0].outcome_mode, undefined, 'Phải xóa outcome_mode: any khi đã gắn YCCĐ PPCT cụ thể');
      assert.equal(m.requirements[0].ppct_outcome_index, 0);
      assert.equal(m.requirements[1].ppct_outcome_index, 1);
      const specRendered = ui.specGridHtml(m, false, false);
      assert(specRendered.includes('2 mục tiêu (tự động tách theo YCCĐ)'));
      assert(specRendered.includes('(NLa, NLb)'), 'Cột MC phải hiển thị đủ cả 2 mã NL khi mức độ có nhiều NL');

      // 2) Chuyển câu 3 sang cùng YCCĐ+NL với câu 1 & 2 -> tự động gom còn đúng 1 dòng
      const sel2 = new Map([
        [m.slots[2].id, { lesson_code: 'B1', level: 'Biết', text: bankInfo.bankItems[0].text, competency: 'NLa', ppct_outcome_index: 0, ppct_outcome_id: 'TIN8-B1-YC1' }]
      ]);
      ui.applySpecBankSelections(m, sel2);
      assert.equal(m.requirements.length, 1, 'Tự động gom cả 3 câu cùng YCCĐ+NL về 1 dòng duy nhất');
      const vMerged = ui.buildMatrixView(m);
      assert.deepEqual(vMerged.requirements[0].refs, ['Câu 1', 'Câu 2', 'Câu 3']);

      // 3) Kiểm tra autoFillSpecFromBank (ngẫu nhiên có kiểm soát từ ngân hàng đề)
      let seq = 0;
      const fillRes = ui.autoFillSpecFromBank(m, { randomFn: () => ((seq++) % 2) * 0.6 });
      assert.equal(fillRes.totalSlots, 3);
      assert.equal(fillRes.fromBankSlots, 3);
      assert.equal(fillRes.missingSlots, 0);
      assert(m.requirements.every(r => r.ppct_outcome_index !== null && !r.outcome_mode), 'Tất cả dòng được điền từ Ngân hàng đề phải ánh xạ chính xác sang PPCT');
      console.log('PASS matrix UI: Bảng 2 lấy YCCĐ + NL từ Ngân hàng đề & tự động gom/tách chính xác');
    } finally {
      global.document = prevDoc;
    }
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
