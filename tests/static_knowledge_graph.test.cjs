'use strict';
// Đồ thị tri thức chương trình (Giai đoạn 1, 3, 4, 5). Dữ liệu tự soạn, không dùng ngân hàng thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const KG = require('../public/knowledge-graph.js');
const KR = require('../public/knowledge-rules.js');

function workspace() {
  const lesson = (code, name, week, outcomes, extra = {}) => ({
    grade: 8, subject_name: 'Tin học', lesson_code: code, lesson_name: name, topic: 'Chủ đề A. Máy tính và cộng đồng',
    outcomes, competencies: ['NLa, NLc'], occurrences: [{ week_raw: `Tuần ${week}`, periods_raw: 'Tiết 1' }], ...extra
  });
  const q = (id, code, outcome, level, type, status, question) => ({
    id, grade: 8, subject_name: 'Tin học', lesson_code: code, learning_outcome: outcome, level, type,
    review_status: status, question, options: ['A', 'B', 'C', 'D'], correct: 0, competency: 'NLa'
  });
  return {
    bank: {
      ppct: { lessons: [
        lesson('B1', 'Lịch sử máy tính', 1, ['Nêu được lịch sử phát triển máy tính', 'Nhận biết các thế hệ máy tính']),
        lesson('B2', 'Thông tin trong môi trường số', 3, ['Nhận biết thông tin số'], { prerequisites: ['B1'] }),
        lesson('B3', 'Sử dụng công nghệ số', 9, ['Sử dụng công nghệ số an toàn'], { prerequisites: ['B2'] }),
        lesson('B4', 'Bài chưa có YCCĐ', 10, [])
      ] },
      questions: [
        q('Q1', 'B1', 'Nêu được lịch sử phát triển máy tính', 'Biết', 'MC', 'approved', 'Máy tính điện tử đầu tiên ra đời năm nào?'),
        q('Q2', 'B1', 'Nêu được lịch sử phát triển máy tính', 'Biết', 'MC', 'approved', 'Máy tính điện tử đầu tiên ra đời vào năm nào?'),
        q('Q3', 'B1', 'Nêu được lịch sử phát triển máy tính', 'Hiểu', 'MC', 'draft', 'Vì sao bóng bán dẫn thay đèn điện tử?'),
        q('Q4', 'B2', 'Nhận biết thông tin số', 'Biết', 'MC', 'approved', 'Thông tin số được lưu dưới dạng nào?'),
        q('Q5', 'B3', 'Sử dụng công nghệ số an toàn', 'Vận dụng', 'ES', 'approved', 'Em hãy đề xuất cách dùng mạng an toàn.'),
        q('Q6', 'B9', 'YCCĐ lạ', 'Biết', 'MC', 'approved', 'Câu thuộc bài không có trong PPCT'),
        q('Q7', 'B2', 'YCCĐ không có trong bài', 'Biết', 'MC', 'approved', 'Câu gắn YCCĐ sai')
      ]
    },
    matrices: [{ id: 'M8', title: 'Ma trận GK1 K8', grade: 8, subject_name: 'Tin học', exam_type: 'GK1', status: 'locked',
      requirements: [{ id: 'R1', lesson_code: 'B1', ppct_outcome_index: 0, level: 'Biết', competency: 'NLb' }] }],
    revisions: [{ id: 'REV8', title: 'Đề cương GK1', grade: 8, subject_name: 'Tin học', questions: [{ id: 'Q1' }, { id: 'Q4' }] }],
    exams: []
  };
}

test('Dựng đồ thị: đủ loại nút, cạnh, định danh ổn định, năng lực từ PPCT và ma trận', () => {
  const g = KG.buildGraph(workspace());
  const s = KG.summary(g);
  assert.equal(s.nodes.bai, 4);
  assert.equal(s.nodes.yccd, 4);
  assert.equal(s.nodes.chude, 1);
  assert.ok(g.node('bai:tin-hoc:8:B1'));
  assert.ok(g.node('yccd:TIN8-B1-YC2'));
  assert.equal(g.match('cau:Q1', 'danh_gia', 'yccd:TIN8-B1-YC1').length, 1);
  assert.equal(g.match('cau:Q1', 'nam_trong', 'decuong:REV8').length, 1);
  assert.equal(g.match('bai:tin-hoc:8:B1', 'tien_de', 'bai:tin-hoc:8:B2').length, 1);
  // Việc 3: năng lực chung cả bài gắn vào nút bài; từng YCCĐ chỉ nhận năng lực gắn riêng cho YCCĐ đó (từ ma trận hoặc PPCT).
  const comps = g.outgoing('yccd:TIN8-B1-YC1', 'phat_trien').map(e => e.o).sort();
  assert.deepEqual(comps, ['nangluc:NLb']);
  const comps2 = g.outgoing('yccd:TIN8-B1-YC2', 'phat_trien').map(e => e.o).sort();
  assert.deepEqual(comps2, []);
  const lessonComps = g.outgoing('bai:tin-hoc:8:B1', 'phat_trien').map(e => e.o).sort();
  assert.deepEqual(lessonComps, ['nangluc:NLa', 'nangluc:NLc']);
  // Dựng lại cho cùng kết quả (định danh ổn định, không phụ thuộc thứ tự chạy)
  assert.deepEqual(KG.buildGraph(workspace()).toJSON(), g.toJSON());
});

test('Kiểm đồ thị: báo câu ngoài PPCT, câu sai YCCĐ, bài không YCCĐ, YCCĐ chưa có câu duyệt', () => {
  const issues = KG.validateGraph(KG.buildGraph(workspace()), { grade: 8 });
  const codes = issues.map(i => i.code + ':' + (i.question_id || i.lesson_code)).sort();
  assert.ok(codes.includes('cau_ngoai_ppct:Q6'));
  assert.ok(codes.includes('cau_khong_yccd:Q7'));
  assert.ok(codes.includes('bai_khong_yccd:B4'));
  assert.ok(codes.includes('yccd_chua_co_cau:B1'), 'YCCĐ thứ hai của B1 chưa có câu');
  assert.ok(!codes.some(c => c.endsWith(':Q1')));
  assert.ok(issues.every(i => /[A-Za-zÀ-ỹ]/.test(i.message)));
});

test('Bảng phủ YCCĐ × mức độ, chỉ đếm câu đã duyệt vào "approved"', () => {
  const rows = KG.coverage(KG.buildGraph(workspace()), { grade: 8 });
  const r = rows.find(x => x.yccd === 'yccd:TIN8-B1-YC1');
  assert.equal(r.levels['Biết'].approved, 2);
  assert.equal(r.levels['Hiểu'].approved, 0);
  assert.equal(r.levels['Hiểu'].other, 1);
  assert.deepEqual(r.missing_levels, ['Hiểu', 'Vận dụng']);
});

test('Câu tương tự và nhóm gần trùng trong ngân hàng', () => {
  const data = workspace();
  const g = KG.buildGraph(data);
  const sims = KG.similarQuestions(g, data.bank.questions, 'Q1', { threshold: 0.6 });
  assert.equal(sims[0].question_id, 'Q2');
  assert.equal(sims[0].same_outcome, true);
  const groups = KG.nearDuplicateGroups(g, data.bank.questions, { grade: 8, threshold: 0.6 });
  assert.deepEqual(groups.map(x => x.question_ids.sort()), [['Q1', 'Q2']]);
});

test('Gợi ý cho ô thiếu: đúng bài, YCCĐ, dạng, mức độ; không hạ mức độ', () => {
  const data = workspace();
  const out = KG.suggestForCell(KG.buildGraph(data), data.bank.questions, { grade: 8, lesson_code: 'B1', type: 'MC', level: 'Hiểu', learning_outcome: 'Nêu được lịch sử phát triển máy tính' });
  assert.deepEqual(out.map(x => [x.question_id, x.action]), [['Q3', 'can_duyet']]);
});

test('Thứ tự ôn theo tiền đề, phát hiện vòng lặp tiền đề', () => {
  const g = KG.buildGraph(workspace());
  const so = KG.studyOrder(g, { grade: 8 });
  const order = so.order.map(x => x.lesson_code);
  assert.ok(order.indexOf('B1') < order.indexOf('B2') && order.indexOf('B2') < order.indexOf('B3'));
  assert.deepEqual(so.cyclic, []);
  const cyc = workspace();
  cyc.bank.ppct.lessons[0].prerequisites = ['B3'];
  assert.deepEqual(KG.studyOrder(KG.buildGraph(cyc), { grade: 8 }).cyclic.sort(), ['B1', 'B2', 'B3']);
});

test('Phạm vi theo tuần: bài học sau tuần kiểm tra bị cảnh báo (kho luật)', () => {
  const data = workspace();
  const g = KG.buildGraph(data);
  assert.deepEqual(KG.lessonsAfterWeek(g, 8, 8, 'Tin học').sort(), ['B3', 'B4']);
  const exam = { id: 'E', grade: 8, subject_name: 'Tin học', exam_type: 'GK1', duration: 45, allowed_kinds: ['MC', 'ES'],
    questions: [{ ...data.bank.questions[0], points: 5, slot_number: 1 }, { ...data.bank.questions[4], points: 5, slot_number: 2 }] };
  const kr = KR.checkExam(data, exam, { revision: null, scopeWeek: 8 });
  const w = kr.warnings.find(x => x.rule === 'W-NGOAI-PHAM-VI');
  assert.ok(w, JSON.stringify(kr.warnings));
  assert.match(w.message, /Câu 2 thuộc bài B3, theo PPCT bắt đầu học ở tuần 9, sau tuần 8/);
  const kr2 = KR.checkExam(data, exam, { revision: null, scopeWeek: 2 });
  assert.ok(kr2.warnings.some(x => x.rule === 'W-THIEU-TIEN-DE' && /bài tiền đề B2/.test(x.message)));
});

test('Ngữ cảnh tri thức cho lời nhắc AI: YCCĐ, năng lực, chủ đề, bài tiền đề', () => {
  const ctx = KG.lessonContext(KG.buildGraph(workspace()), 'Tin học', 8, 'B2');
  assert.equal(ctx.topic, 'Chủ đề A. Máy tính và cộng đồng');
  assert.deepEqual(ctx.outcomes.map(o => o.text), ['Nhận biết thông tin số']);
  assert.deepEqual(ctx.outcomes[0].competencies.sort(), ['NLa', 'NLc']);
  assert.deepEqual(ctx.prerequisites.map(p => p.lesson_code), ['B1']);
  assert.equal(KG.lessonContext(KG.buildGraph(workspace()), 'Tin học', 8, 'B99'), null);
});

test('Đồ thị lọc theo môn và chịu được dữ liệu thiếu', () => {
  const g = KG.buildGraph({ bank: { ppct: { lessons: [{ grade: 10, subject_name: 'Toán', lesson_code: 'T1', outcomes: ['x'] }, null, { lesson_code: '' }] }, questions: [null, {}] } }, { subject: 'Tin học' });
  assert.equal(KG.summary(g).nodes.bai || 0, 0);
  assert.doesNotThrow(() => KG.validateGraph(KG.buildGraph({})));
});

test('PPCT: lưu "Bài tiền đề" qua cầu nối Pages, bỏ chính nó, giữ giá trị cũ khi biểu mẫu không gửi', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const { webcrypto } = require('node:crypto');
  const values = new Map();
  const window = { EXAMMATRIX_TEST_SEED: { bank: { questions: [], ppct: { lessons: [
    { grade: 9, subject_name: 'Tin học', lesson_code: 'B1', lesson_name_source: 'Bài một', outcomes: ['YC 1'] }] } }, matrices: [], revisions: [], exams: [] },
    location: { hostname: 'localhost', protocol: 'http:' }, BankStaticAPI: require('../public/static-api.js'),
    BankStaticEngine: require('../public/static-exam-engine.js'), BankStaticWorkflow: require('../public/static-exam-workflow.js'),
    BankCore: require('../public/core.js'), crypto: webcrypto };
  const context = { window, crypto: webcrypto, console: { ...console, info() {}, log() {} }, setTimeout, clearTimeout,
    document: { querySelector: () => null, getElementById: () => null },
    localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/firebase-bridge.js'), 'utf8'), context);
  const save = (extra) => window.FirebaseClient.handle('/api/ppct/save-lesson', { lesson: { grade: 9, subject_name: 'Tin học', lesson_code: 'B2', lesson_name_source: 'Bài hai', topic_source: 'Chủ đề', outcomes: ['YC 2'], ...extra } });
  let res = await save({ prerequisites: ['B1', 'B2', ' '] });
  assert.deepEqual([...res.lesson.prerequisites], ['B1']);
  res = await save({});
  assert.deepEqual([...res.lesson.prerequisites], ['B1'], 'Không gửi trường thì giữ giá trị cũ');
  const g = KG.buildGraph(window.FirebaseState.currentData);
  assert.equal(g.match('bai:tin-hoc:9:B1', 'tien_de', 'bai:tin-hoc:9:B2').length, 1);
  assert.equal(g.node('chude:tin-hoc:9:chu-de').label, 'Chủ đề', 'Đọc chủ đề từ topic_source');
});

test('AI có căn cứ tri thức: lời nhắc kèm YCCĐ, năng lực, bài tiền đề; cảnh báo câu nhập lệch PPCT', () => {
  const TFH = require('../public/table-file-helper.js');
  const data = workspace();
  const ctx = KG.lessonContext(KG.buildGraph(data), 'Tin học', 8, 'B2');
  const prompt = TFH.buildAiPromptByLesson({ grade: 8, subject: 'Tin học', lessonCode: 'B2', lessonName: 'Thông tin trong môi trường số', outcomes: ['Nhận biết thông tin số'], part: 'MC', knowledge: ctx });
  assert.match(prompt, /NGỮ CẢNH TRI THỨC/);
  assert.match(prompt, /Nhận biết thông tin số \(năng lực: NLa, NLc\)/);
  assert.match(prompt, /bài tiền đề: B1 \(Lịch sử máy tính\)/);
  assert.match(prompt, /PHẢI chép NGUYÊN VĂN/);
  assert.doesNotMatch(prompt, /THEO THÔNG TƯ 22\/2021/, 'Không gán quy ước của tổ cho TT 22/2021');
  assert.doesNotMatch(TFH.buildAiPromptByLesson({ grade: 8, lessonCode: 'B2', part: 'MC' }), /NGỮ CẢNH TRI THỨC/, 'Không có ngữ cảnh thì giữ lời nhắc cũ');
  const warns = TFH.knowledgeImportWarnings([
    { grade: 8, lesson_code: 'B2', learning_outcome: 'Nhận biết thông tin số', type: 'MC' },
    { grade: 8, lesson_code: 'B2', learning_outcome: 'YCCĐ viết khác', type: 'MC' },
    { grade: 8, lesson_code: 'B77', learning_outcome: 'x', type: 'YN' }
  ], data.bank.ppct, { subject: 'Tin học' });
  assert.deepEqual(warns.map(w => w.index + ':' + w.code), ['2:yccd_ngoai_ppct', '3:bai_ngoai_ppct', '3:dang_cau_cap_hoc']);
});

test('Việc 2: schema chuẩn phát hiện cạnh sai loại nút hoặc nút bài thiếu cạnh bắt buộc', () => {
  assert.ok(KG.SCHEMA && Array.isArray(KG.SCHEMA.node_types) && KG.SCHEMA.predicates && KG.SCHEMA.required_edges);
  const g = KG.buildGraph(workspace());
  assert.deepEqual(KG.checkSchema(g), []);
  g.addEdge('cau:Q1', 'tien_de', 'yccd:TIN8-B1-YC1');
  const errs = KG.checkSchema(g);
  assert.ok(errs.some(e => e.code === 'schema_endpoint_type' && e.edge?.p === 'tien_de'), JSON.stringify(errs));
  const g2 = KG.createGraph();
  g2.addNode('bai:tin-hoc:8:BX', 'bai', 'Bài thiếu chủ đề', { lesson_code: 'BX' });
  const errs2 = KG.checkSchema(g2);
  assert.ok(errs2.some(e => e.code === 'schema_required_edge' && /thuoc_chu_de/.test(e.message)), JSON.stringify(errs2));
});

test('Việc 3: tách năng lực/chỉ báo từng YCCĐ, chuẩn Năng lực số (TT 02/2025) và Giáo dục AI (QĐ 2422)', () => {
  const core = require('../public/core.js');
  const ws = workspace();
  ws.bank.ppct.lessons[0].outcome_competencies = ['NLa', 'NLd'];
  ws.bank.ppct.lessons[0].digital_competencies = ['1.1.TC2a', '8.A1.1', '1.2.TC2b'];
  ws.matrices[0].requirements[0].indicator = 'CB.1';
  const g = KG.buildGraph(ws, { grade: 8 });
  assert.deepEqual(KG.checkSchema(g), []);
  assert.deepEqual(g.outgoing('yccd:TIN8-B1-YC1', 'phat_trien').map(e => e.o).sort(), ['nangluc:NLa', 'nangluc:NLb']);
  assert.deepEqual(g.outgoing('yccd:TIN8-B1-YC2', 'phat_trien').map(e => e.o).sort(), ['nangluc:NLd']);
  assert.ok(g.node('chibao:CB.1'));
  assert.equal(g.match('yccd:TIN8-B1-YC1', 'dat_chi_bao', 'chibao:CB.1').length, 1);
  assert.ok(g.node('nls:1.1.TC2a'));
  assert.ok(g.node('ai:8.A1.1'));
  assert.equal(g.match('bai:tin-hoc:8:B1', 'phat_trien', 'nls:1.1.TC2a').length, 1);
  assert.equal(g.match('bai:tin-hoc:8:B1', 'phat_trien', 'ai:8.A1.1').length, 1);
  const cov = KG.coverage(g, { grade: 8 });
  const row1 = cov.find(r => r.lesson_code === 'B1' && r.yccd === 'yccd:TIN8-B1-YC1');
  assert.ok(row1 && row1.competencies.includes('NLa') && row1.indicators.includes('CB.1') && row1.digital_competencies.includes('1.1.TC2a') && row1.ai_codes.includes('8.A1.1'), JSON.stringify(row1));
  assert.deepEqual(KG.digitalCompetencyCodes(['1.1.TC2a', 'NLa']).map(x => x.code), ['1.1.TC2a']);
  assert.deepEqual(KG.aiEducationCodes(['8.A1.1', '10.B2.MR1', 'NLa']).map(x => x.code), ['10.B2.MR1', '8.A1.1']);
  assert.equal(core.textSimilarity('máy tính', 'tính máy'), 0);
});

test('Việc 4 & 6: đồ thị theo bản chụp đề không đổi khi sửa PPCT; chống đảo từ & chu trình tiền đề liên khối', async () => {
  const ws = workspace();
  const exam = {
    id: 'EX-SNAP', title: 'Đề chụp', grade: 8, subject_name: 'Tin học', exam_type: 'GK1', duration: 45,
    questions: [{ ...ws.bank.questions[0], points: 10, slot_number: 1 }],
    ppct_snapshot: JSON.parse(JSON.stringify(ws.bank.ppct))
  };
  const beforeG = KG.buildGraphForExam(exam, ws);
  // Sửa PPCT gốc của ngân hàng (xóa hết YCCĐ của B1): đồ thị từ bản chụp của đề vẫn giữ nguyên nguồn gốc & YCCĐ.
  ws.bank.ppct.lessons[0].outcomes = [];
  ws.bank.ppct.lessons[0].outcome_ids = [];
  const afterG = KG.buildGraphForExam(exam, ws);
  assert.ok(afterG.node('yccd:TIN8-B1-YC1'));
  const evalEdge = afterG.outgoing('cau:Q1', 'danh_gia')[0];
  assert.ok(evalEdge && evalEdge.props && evalEdge.props.nguon && 'phien_ban' in evalEdge.props, JSON.stringify(evalEdge));
  assert.equal(beforeG.nodes.size, afterG.nodes.size);

  // Chống đảo từ trong nearDuplicateGroups: "máy tính bảng" vs "bảng tính máy" không được gom nhóm trùng.
  ws.bank.questions.push(
    { id: 'Q-SWAP-1', grade: 8, subject_name: 'Tin học', lesson_code: 'B1', type: 'MC', level: 'Biết', question: 'Máy tính bảng dùng để làm gì trong học tập', answer: 'A', options: ['A', 'B', 'C', 'D'], review_status: 'approved' },
    { id: 'Q-SWAP-2', grade: 8, subject_name: 'Tin học', lesson_code: 'B1', type: 'MC', level: 'Biết', question: 'Bảng tính máy học tập làm gì để dùng trong', answer: 'A', options: ['A', 'B', 'C', 'D'], review_status: 'approved' }
  );
  const gDup = KG.buildGraph(ws, { grade: 8 });
  const swapGroup = KG.nearDuplicateGroups(gDup, { grade: 8, threshold: 0.7 }).find(gr => gr.some(x => x.id === 'Q-SWAP-1'));
  assert.equal(swapGroup, undefined);

  // Tiền đề liên khối 8:B12 + chặn chu trình khi lưu PPCT.
  ws.bank.ppct.lessons.push(
    { id: 'L9-1', grade: 9, subject_name: 'Tin học', lesson_code: 'B1', lesson_name_source: 'Bài 1 K9', topic_source: 'CĐ 9', week_raw: 'Tuần 1', outcomes: ['YC9-1'], outcome_ids: ['TIN9-B1-YC1'], prerequisites: ['8:B4'] }
  );
  const gCross = KG.buildGraph(ws, {});
  assert.equal(gCross.match('bai:tin-hoc:8:B4', 'tien_de', 'bai:tin-hoc:9:B1').length, 1);
  assert.ok(Array.isArray(KG.suggestPrerequisites(gCross, { grade: 8, subject_name: 'Tin học' })));

  const fs = require('node:fs'), vm = require('node:vm');
  const { webcrypto } = require('node:crypto');
  const values = new Map();
  const win = {
    EXAMMATRIX_TEST_SEED: {
      bank: {
        questions: [],
        ppct: {
          lessons: [
            { grade: 8, subject_name: 'Tin học', lesson_code: 'B1', lesson_name_source: 'B1', outcomes: ['YC 1'], prerequisites: ['B2'] },
            { grade: 8, subject_name: 'Tin học', lesson_code: 'B2', lesson_name_source: 'B2', outcomes: ['YC 2'], prerequisites: [] }
          ]
        }
      },
      matrices: [], revisions: [], exams: []
    },
    location: { hostname: 'localhost', protocol: 'http:' },
    BankStaticAPI: require('../public/static-api.js'),
    BankStaticEngine: require('../public/static-exam-engine.js'),
    BankStaticWorkflow: require('../public/static-exam-workflow.js'),
    BankCore: require('../public/core.js'),
    crypto: webcrypto
  };
  const context = {
    window: win, crypto: webcrypto, console: { ...console, info() {}, log() {} },
    setTimeout, clearTimeout,
    document: { querySelector: () => null, getElementById: () => null },
    localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/firebase-bridge.js'), 'utf8'), context);
  await assert.rejects(
    () => win.FirebaseClient.handle('/api/ppct/save-lesson', { lesson: { grade: 8, subject_name: 'Tin học', lesson_code: 'B2', lesson_name_source: 'B2', outcomes: ['YC 2'], prerequisites: ['B1'] } }),
    /vòng lặp|chu trình/i
  );
  const okCross = await win.FirebaseClient.handle('/api/ppct/save-lesson', { lesson: { grade: 9, subject_name: 'Tin học', lesson_code: 'B1', lesson_name_source: 'B1 K9', outcomes: ['YC 9'], prerequisites: ['8:B1'] } });
  assert.deepEqual([...okCross.lesson.prerequisites], ['8:B1']);
});
