'use strict';
/*
 * Mô phỏng 9 tài khoản giáo viên (mỗi môn một người) chạy trọn quy trình trên bản Pages,
 * qua cầu nối thật (public/firebase-bridge.js) với Firestore giả trong bộ nhớ (tests/firestore_mock.cjs).
 * Dữ liệu tự soạn, không dùng ngân hàng hay đề thật. Không gọi mạng.
 *
 * Chạy:  node acceptance/2026-11-24-mo-phong-9-mon/mo-phong.cjs
 * Kết quả: in bảng tóm tắt và ghi KET_QUA.json cùng thư mục.
 */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const pub = (f) => path.join(ROOT, 'public', f);
const V2 = require(pub('cloud-storage-v2.js'));
const { makeFirestoreMock } = require(path.join(ROOT, 'tests/firestore_mock.cjs'));
const CompetencyCatalog = require(pub('competency-catalog.js'));
const BRIDGE_SRC = fs.readFileSync(pub('firebase-bridge.js'), 'utf8');

const ACCOUNTS = [
  { uid: 'gv-tin-8', name: 'Cô Lan', subject: 'Tin học', grade: 8, matrix2d: true },
  { uid: 'gv-toan-9', name: 'Thầy Minh', subject: 'Toán học', grade: 9 },
  { uid: 'gv-ly-10', name: 'Cô Hoa', subject: 'Vật lí', grade: 10, matrix2d: true },
  { uid: 'gv-hoa-11', name: 'Thầy Phúc', subject: 'Hóa học', grade: 11 },
  { uid: 'gv-sinh-12', name: 'Cô Mai', subject: 'Sinh học', grade: 12, matrix2d: true },
  { uid: 'gv-van-7', name: 'Cô Thu', subject: 'Ngữ văn', grade: 7 },
  { uid: 'gv-anh-6', name: 'Thầy David', subject: 'Tiếng Anh', grade: 6, matrix2d: true },
  { uid: 'gv-su-10', name: 'Thầy Nam', subject: 'Lịch sử', grade: 10 },
  { uid: 'gv-dia-11', name: 'Cô Vân', subject: 'Địa lí', grade: 11, matrix2d: true }
];

const firestore = makeFirestoreMock({ withTransaction: true });

function openTab(account) {
  const window = {
    location: { hostname: 'localhost', protocol: 'http:' },
    BankStaticAPI: require(pub('static-api.js')),
    BankStaticEngine: require(pub('static-exam-engine.js')),
    BankStaticWorkflow: require(pub('static-exam-workflow.js')),
    BankExamComparison: require(pub('exam-comparison.js')),
    BankCompetencyCatalog: CompetencyCatalog,
    BankKnowledgeGraph: require(pub('knowledge-graph.js')),
    BankKnowledgeRules: require(pub('knowledge-rules.js')),
    BankCore: require(pub('core.js')),
    CloudStorageV2: V2,
    crypto: webcrypto,
    store: { selectedSubject: account.subject, bank: {} }
  };
  const local = new Map();
  const context = {
    window, crypto: webcrypto, setTimeout, clearTimeout,
    console: { ...console, info() {}, log() {}, warn() {} },
    document: { querySelector: () => null, getElementById: () => null },
    localStorage: { getItem: k => local.get(k) ?? null, setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k), key: i => [...local.keys()][i], get length() { return local.size; } }
  };
  vm.runInNewContext(BRIDGE_SRC, context);
  Object.assign(window.FirebaseState, {
    provider: 'firebase-cloud-v2',
    user: { uid: account.uid, email: account.uid + '@truong.test', displayName: account.name, isAnonymous: false },
    db: firestore.db, _firestoreHelpers: firestore.helpers
  });
  return { window, local, call: (p, b) => window.FirebaseClient.handle(p, b) };
}

const isThpt = (g) => g >= 10;

function ppctLessons(a) {
  const s = a.subject;
  const L = (code, name, week, outcomes, prereq) => ({
    grade: a.grade, subject_name: s, lesson_code: code, lesson_name_source: `${name} (${s} ${a.grade})`,
    topic_source: `Chủ đề minh họa ${s}`, section: 'core', week_raw: `Tuần ${week}`, duration_raw: '2', ppct_raw: `${week * 2 - 1}, ${week * 2}`,
    outcomes, prerequisites: prereq
  });
  return [
    L('B1', 'Bài mở đầu', 1, [`Nêu được khái niệm cơ bản của ${s} ${a.grade}`, `Nhận biết được thuật ngữ trọng tâm ${s}`], []),
    L('B2', 'Bài phát triển', 3, [`Giải thích được mối liên hệ trong ${s} ${a.grade}`, `Phân tích được ví dụ minh họa ${s}`], ['B1']),
    L('B3', 'Bài vận dụng', 6, [`Vận dụng được kiến thức ${s} vào tình huống thực tế`, `Giải quyết được bài toán ngắn ${s}`], ['B2'])
  ];
}

function bankQuestions(a, lessons) {
  const out = [];
  const base = { grade: a.grade, subject_name: a.subject };
  const yc = (code, i) => lessons.find(l => l.lesson_code === code).outcomes[i];
  for (let i = 1; i <= 8; i++) out.push({ ...base, type: 'MC', level: 'Biết', lesson_code: 'B1', learning_outcome: yc('B1', 0),
    question: `[${a.subject}] Câu nhận biết số ${i}: khái niệm nào đúng với nội dung bài mở đầu?`,
    options: [`Phương án đúng ${i}`, `Phương án nhiễu A${i}`, `Phương án nhiễu B${i}`, `Phương án nhiễu C${i}`], correct: 0,
    option_explanations: [`GIẢI_THÍCH_ĐÚNG_${i}`, 'Sai.', 'Sai.', 'Sai.'] });
  for (let i = 1; i <= 8; i++) out.push({ ...base, type: 'MC', level: 'Hiểu', lesson_code: 'B2', learning_outcome: yc('B2', 0),
    question: `[${a.subject}] Câu thông hiểu số ${i}: vì sao hai nội dung của bài phát triển liên hệ với nhau?`,
    options: [`Lí do đúng ${i}`, `Lí do sai A${i}`, `Lí do sai B${i}`, `Lí do sai C${i}`], correct: 0 });
  for (let i = 1; i <= 4; i++) out.push({ ...base, type: 'ES', level: 'Vận dụng', lesson_code: 'B3', learning_outcome: yc('B3', 0),
    question: `[${a.subject}] Câu tự luận số ${i}: vận dụng kiến thức để xử lí một tình huống thực tế.`,
    rubric: [{ criterion: `HƯỚNG_DẪN_CHẤM_${i}: nêu đúng ý chính`, points: 1.5 }, { criterion: 'Lập luận hợp lí, có ví dụ', points: 1.5 }], max_score: 3 });
  if (isThpt(a.grade)) {
    for (let i = 1; i <= 6; i++) out.push({ ...base, type: 'YN', level: 'Hiểu', lesson_code: 'B2', learning_outcome: yc('B2', 1),
      question: `[${a.subject}] Đoạn tư liệu số ${i} về ví dụ minh họa của bài phát triển. Xét tính đúng sai của các phát biểu sau.`,
      statements: ['a', 'b', 'c', 'd'].map((l, k) => ({ label: l, text: `Phát biểu ${l} của câu ${i}`, correct: k % 2 === 0 })) });
    for (let i = 1; i <= 4; i++) out.push({ ...base, type: 'SHORT', level: 'Vận dụng', lesson_code: 'B3', learning_outcome: yc('B3', 1),
      question: `[${a.subject}] Câu trả lời ngắn số ${i}: tính kết quả của bài toán ngắn.`, short_answer: String(10 + i) });
  }
  return out;
}

function matrixFor(a, comps) {
  const c = (i) => comps[i % comps.length];
  const thpt = isThpt(a.grade);
  const req = [
    { id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nêu khái niệm', ppct_outcome_index: 0, competency: c(0) },
    { id: 'R2', lesson_code: 'B2', level: 'Hiểu', text: 'Giải thích mối liên hệ', ppct_outcome_index: 0, competency: c(1) },
    { id: 'R3', lesson_code: 'B3', level: 'Vận dụng', text: 'Vận dụng vào tình huống', ppct_outcome_index: 0, competency: c(2) }
  ];
  const slot = (id, kind, number, parts) => ({ id, kind, number, scoring: { mode: 'sum_parts' }, parts });
  const slots = [];
  const mcPts = thpt ? 0.25 : 0.5;
  for (let i = 0; i < 8; i++) slots.push(slot('MC' + i, 'MC', i + 1, [{ id: 'PMC' + i, label: '', requirement_id: i < 4 ? 'R1' : 'R2', points: mcPts }]));
  if (thpt) {
    req.push({ id: 'R4', lesson_code: 'B2', level: 'Hiểu', text: 'Phân tích ví dụ', ppct_outcome_index: 1, competency: c(1) },
      { id: 'R5', lesson_code: 'B3', level: 'Vận dụng', text: 'Giải bài toán ngắn', ppct_outcome_index: 1, competency: c(2) });
    for (let i = 0; i < 2; i++) slots.push(slot('YN' + i, 'YN', i + 1, ['a', 'b', 'c', 'd'].map(l => ({ id: `PYN${i}${l}`, label: l, requirement_id: 'R4', points: 0.5 }))));
    for (let i = 0; i < 2; i++) slots.push(slot('SH' + i, 'SHORT', i + 1, [{ id: 'PSH' + i, label: '', requirement_id: 'R5', points: 0.5 }]));
    slots.push(slot('ES0', 'ES', 1, [{ id: 'PES0', label: '', requirement_id: 'R3', points: 3 }]));
  } else {
    for (let i = 0; i < 2; i++) slots.push(slot('ES' + i, 'ES', i + 1, [{ id: 'PES' + i, label: '', requirement_id: 'R3', points: 3 }]));
  }
  // Một nửa số môn dùng ma trận kiểu 2D: ô chỉ ràng buộc bài × dạng × mức độ (mọi YCCĐ của bài).
  if (a.matrix2d) req.forEach(r => { r.outcome_mode = 'any'; r.ppct_outcome_index = null; });
  return {
    id: 'MX-' + a.uid, family_id: 'FAM-' + a.uid, title: `Ma trận GK1 ${a.subject} ${a.grade}`, grade: a.grade, subject_name: a.subject,
    exam_type: 'GK1', profile: thpt ? 'THPT' : 'THCS', mode: 'authored', duration: 45, total_points: 10, school_year: '2026-2027',
    owner_name: `Tổ ${a.subject}`, campus: 'Cao Thắng', indicator_catalog: [], reconciliation: { confirmed: true, issues: [] },
    lessons: [1, 2, 3].map(n => ({ lesson_code: 'B' + n, title: 'Bài ' + n, topic: `Chủ đề minh họa ${a.subject}` })),
    requirements: req, slots
  };
}

function storedZipText(bytes) {
  // Gói ZIP lưu thẳng (không nén) nên có thể dò chuỗi UTF-8 trực tiếp.
  return Buffer.from(bytes).toString('utf8');
}

async function runAccount(a, results) {
  const steps = [];
  const rec = async (name, fn) => {
    try { const detail = await fn(); steps.push({ step: name, ok: true, detail: detail || '' }); return true; }
    catch (err) { steps.push({ step: name, ok: false, detail: String(err && err.message || err).slice(0, 400) }); return false; }
  };
  const tab = openTab(a);
  const W = tab.window;
  const ctx = {};
  const must = (cond, msg) => { if (!cond) throw new Error(msg); };

  await rec('Đăng nhập, tài khoản mới rỗng', async () => {
    const r = await W.FirebaseClient.loadFromCloudV2(W.FirebaseState.user, { db: firestore.db, helpers: firestore.helpers });
    must(r && r.source === 'empty-v2', 'Nguồn tải: ' + (r && r.source));
    must(W.FirebaseState.currentData.bank.questions.length === 0, 'Tài khoản mới có sẵn câu hỏi');
    return 'empty-v2';
  });
  const lessons = ppctLessons(a);
  await rec('Nhập PPCT 3 bài (kèm bài tiền đề)', async () => {
    for (const l of lessons) await tab.call('/api/ppct/save-lesson', { lesson: l });
    const ls = W.FirebaseState.currentData.bank.ppct.lessons.filter(l => l.subject_name === a.subject && Number(l.grade) === a.grade);
    must(ls.length === 3, 'Số bài PPCT: ' + ls.length);
    must((ls.find(l => l.lesson_code === 'B3').prerequisites || []).join() === 'B2', 'Mất bài tiền đề');
    return '3 bài';
  });
  const qs = bankQuestions(a, lessons);
  await rec('Nhập ngân hàng câu hỏi (thêm vào)', async () => {
    const r = await tab.call('/api/bank/import', { mode: 'append', questions: qs, grade: a.grade });
    must(r.import_report && r.import_report.added === qs.length, 'Thêm được ' + JSON.stringify(r.import_report));
    return `${qs.length} câu (${[...new Set(qs.map(q => q.type))].join(', ')})`;
  });
  await rec('Duyệt nhanh toàn bộ', async () => {
    const ids = W.FirebaseState.currentData.bank.questions.map(q => q.id);
    const r = await tab.call('/api/questions/bulk', { ids, action: 'bulk_approve', confirmed: true });
    must(r.approved_count === qs.length, `Duyệt ${r.approved_count}/${qs.length}, bỏ qua ${r.skipped_count}: ${JSON.stringify((r.skipped || []).slice(0, 2))}`);
    return `${r.approved_count} câu`;
  });
  const comps = CompetencyCatalog.defaultCompetenciesForSubject(a.subject);
  await rec('Lập và khóa ma trận + đặc tả', async () => {
    const saved = await tab.call('/api/matrices/save', { matrix: matrixFor(a, comps) });
    const v = saved.validation;
    must(!v || v.valid !== false, 'Ma trận chưa hợp lệ: ' + JSON.stringify((v && v.errors || []).slice(0, 3)));
    const locked = await tab.call('/api/matrices/lock', { id: saved.matrix.id, expected_revision: saved.matrix.revision,
      confirmation: { confirmed_by: a.name, confirmed_at: '2026-11-24', external_agreement: true } });
    must(locked.matrix.status === 'locked', 'Trạng thái ' + locked.matrix.status);
    ctx.matrixId = locked.matrix.id;
    return `${locked.matrix.slots.length} vị trí, năng lực ${comps.slice(0, 3).join('/')}`;
  });
  await rec('Báo cáo thiếu câu (đủ câu)', async () => {
    const r = await tab.call(`/api/matrices/${encodeURIComponent(ctx.matrixId)}/shortfall`);
    must(r.ok === true, `Thiếu ${r.total_shortfall}, complete=${r.complete}, ${JSON.stringify((r.issues || []).slice(0, 2))}`);
    return 'đủ';
  });
  await rec('Bản đồ tri thức: không có lỗi dữ liệu', async () => {
    const r = await tab.call('/api/knowledge/overview', { grade: a.grade });
    const errs = r.issues.filter(i => i.severity === 'loi');
    must(errs.length === 0, errs.map(e => e.message).join(' | '));
    must(r.study_order.order.map(x => x.lesson_code).join() === 'B1,B2,B3', 'Thứ tự ôn ' + r.study_order.order.map(x => x.lesson_code));
    const warn = r.issues.filter(i => i.severity !== 'loi').length;
    return `${r.summary.nodes.yccd} YCCĐ, ${r.summary.total_edges} quan hệ, ${warn} cảnh báo`;
  });
  await rec('Lập đề cương theo ma trận', async () => {
    const p = await tab.call('/api/revisions/propose', { grade: a.grade, exam_type: 'GK1', matrix_id: ctx.matrixId, seed: a.uid });
    const ids = p.question_ids || (p.cells || []).flatMap(c => c.question_ids || []);
    must(ids.length > 0, 'Đề xuất rỗng');
    const r = await tab.call('/api/revisions/save', { title: `Đề cương GK1 ${a.subject} ${a.grade}`, grade: a.grade, question_ids: ids, matrix_id: ctx.matrixId });
    ctx.revisionId = r.revision.id;
    return `${r.revision.questions.length} câu`;
  });
  await rec('Tạo bộ 2 đề (mã 101, 102)', async () => {
    const r = await tab.call('/api/exams/generate-set', { title: `Bộ đề GK1 ${a.subject} ${a.grade}`, grade: a.grade, subject_name: a.subject,
      exam_type: 'GK1', duration: 45, matrix_id: ctx.matrixId, revision_id: ctx.revisionId, exam_count: 2, seed: 'set-' + a.uid });
    must(r.exams.length === 2, 'Số đề ' + r.exams.length);
    must(r.exams.map(e => e.exam_code).join() === '101,102', 'Mã đề ' + r.exams.map(e => e.exam_code));
    must(r.exams.every(e => e.total_points === 10), 'Tổng điểm khác 10');
    ctx.exams = r.exams.map(e => e.id); ctx.setId = r.exams[0].exam_set && r.exams[0].exam_set.id;
    return `${r.exams[0].question_count} câu/đề${r.warnings && r.warnings.length ? '; cảnh báo: ' + r.warnings.join(' ') : ''}`;
  });
  await rec('Kiểm định đề: mã cũ và kho luật cùng kết luận', async () => {
    const out = [];
    for (const id of ctx.exams) {
      const r = await tab.call('/api/exams/verify', { id });
      const v = r.verification;
      must(v.passed === true, `Đề ${id} chưa đạt: ${JSON.stringify(v.errors).slice(0, 300)}`);
      must(v.knowledge && v.knowledge.passed === v.passed, `Kho luật lệch: ${JSON.stringify(v.knowledge && v.knowledge.errors).slice(0, 300)}`);
      out.push(`${v.knowledge.warnings.length} cảnh báo`);
    }
    return out.join(', ');
  });
  await rec('Hoán vị thêm 2 mã đề từ đề 101', async () => {
    const r = await tab.call('/api/exams/permute', { id: ctx.exams[0], codes: ['201', '202'], num_variants: 2, shuffle_questions: true, shuffle_options: true, seed: 'perm' });
    must(r.result && r.result.exams.length === 2, 'Số mã hoán vị');
    const ORDER = ['MC', 'YN', 'SHORT', 'ES'];
    for (const e of r.result.exams) {
      const types = e.questions.map(q => q.type);
      must(types.every((t, i) => i === 0 || ORDER.indexOf(types[i - 1]) <= ORDER.indexOf(t)), 'Mã ' + e.exam_code + ' trộn lẫn các phần: ' + types.join(''));
    }
    ctx.variants = r.result.exams.map(e => e.id);
    return r.result.exams.map(e => e.exam_code).join(', ') + ' (giữ thứ tự phần)';
  });
  await rec('Gửi duyệt và duyệt khóa cả bộ đề', async () => {
    must(ctx.setId, 'Thiếu mã bộ đề');
    await tab.call('/api/exams/set/transition', { set_id: ctx.setId, action: 'submit' });
    const r = await tab.call('/api/exams/set/transition', { set_id: ctx.setId, action: 'approve' });
    must(r.exams.every(e => e.status === 'locked'), 'Trạng thái ' + r.exams.map(e => e.status));
    return 'locked';
  });
  await rec('Phát hành đề cương khi mã hoán vị chưa duyệt: bị chặn, thông báo nêu rõ mã', async () => {
    let msg = '';
    try { await tab.call('/api/revisions/transition', { id: ctx.revisionId, action: 'publish' }); }
    catch (err) { msg = err.message; }
    must(/mã 201/.test(msg) && /mã 202/.test(msg), 'Thông báo chưa nêu mã đề: ' + (msg || 'không bị chặn'));
    return msg.slice(0, 90) + '…';
  });
  await rec('Duyệt và khóa 2 mã hoán vị', async () => {
    for (const id of ctx.variants || []) {
      await tab.call('/api/exams/transition', { id, action: 'submit' });
      const r = await tab.call('/api/exams/transition', { id, action: 'approve' });
      must(r.exam.status === 'locked', 'Trạng thái ' + r.exam.status);
    }
    return (ctx.variants || []).length + ' mã';
  });
  await rec('Phát hành đề cương rồi phát hành bộ đề', async () => {
    await tab.call('/api/revisions/transition', { id: ctx.revisionId, action: 'publish' });
    const r = await tab.call('/api/exams/set/transition', { set_id: ctx.setId, action: 'publish' });
    must(r.exams.every(e => e.status === 'published'), 'Trạng thái ' + r.exams.map(e => e.status));
    return 'published';
  });
  await rec('Xuất Word đề học sinh không lộ đáp án; đáp án có hướng dẫn chấm', async () => {
    const DL = require(pub('static-download.js'));
    const data = W.FirebaseState.currentData;
    const opts = { canViewAnswers: true, subject: a.subject };
    const stu = await DL.createDownload(`/api/exams/${encodeURIComponent(ctx.exams[0])}/export?format=docx`, data, opts);
    const ans = await DL.createDownload(`/api/exams/${encodeURIComponent(ctx.exams[0])}/export?format=docx&answers=1`, data, opts);
    const zip = await DL.createDownload(`/api/exams/${encodeURIComponent(ctx.exams[0])}/bundle.zip`, data, opts);
    const st = storedZipText(stu.bytes), at = storedZipText(ans.bytes), zt = storedZipText(zip.bytes);
    must(!/GIẢI_THÍCH_ĐÚNG|HƯỚNG_DẪN_CHẤM/.test(st), 'Đề học sinh lộ giải thích/hướng dẫn chấm');
    must(/HƯỚNG_DẪN_CHẤM/.test(at), 'Đáp án thiếu hướng dẫn chấm');
    must(zt.includes('Ma_tran_va_dac_ta.docx') && zt.includes('De_cuong_on_tap.docx'), 'Gói ZIP thiếu ma trận hoặc đề cương');
    return `${stu.filename}; ZIP ${(zip.bytes.length / 1024).toFixed(0)} KB`;
  });
  await rec('Kho luật kiểm đề đã phát hành, có phạm vi tuần', async () => {
    const r = await tab.call('/api/knowledge/check-exam', { id: ctx.exams[1], scope_week: 4 });
    const out = r.report.warnings.filter(w => w.rule === 'W-NGOAI-PHAM-VI');
    must(r.report.passed, JSON.stringify(r.report.errors).slice(0, 300));
    return `${out.length} câu thuộc bài học sau tuần 4 (B3 bắt đầu tuần 6)`;
  });
  await rec('Tải lại trang: dữ liệu còn đủ trên đám mây', async () => {
    const t2 = openTab(a);
    await t2.window.FirebaseClient.loadFromCloudV2(t2.window.FirebaseState.user, { db: firestore.db, helpers: firestore.helpers });
    const d1 = W.FirebaseState.currentData, d2 = t2.window.FirebaseState.currentData;
    const sig = d => [d.bank.questions.length, d.bank.ppct.lessons.length, d.matrices.length, d.revisions.length, d.exams.length].join('/');
    must(sig(d1) === sig(d2), `Trước ${sig(d1)} ≠ sau ${sig(d2)}`);
    must(d2.exams.filter(e => e.status === 'published').length === 2, 'Mất trạng thái phát hành');
    must(![...t2.local.keys()].some(k => k.startsWith('exammatrix_teacher_cache_')), 'Còn ghi cache trình duyệt');
    ctx.tab2 = t2;
    return 'câu/PPCT/ma trận/đề cương/đề = ' + sig(d2);
  });
  await rec('Hai tab cùng sửa một câu: tab sau bị chặn', async () => {
    const t2 = ctx.tab2 || openTab(a);
    if (!ctx.tab2) await t2.window.FirebaseClient.loadFromCloudV2(t2.window.FirebaseState.user, { db: firestore.db, helpers: firestore.helpers });
    const q = W.FirebaseState.currentData.bank.questions.find(x => x.type === 'MC');
    await tab.call('/api/questions/save', { question: { ...q, question: q.question + ' (sửa ở tab 1)' } });
    let blocked = false;
    try { await t2.call('/api/questions/save', { question: { ...q, question: q.question + ' (sửa ở tab 2)' } }); }
    catch (err) { blocked = err.code === 'CLOUD_CONFLICT'; if (!blocked) throw err; }
    must(blocked, 'Tab 2 ghi đè được tab 1');
    return 'CLOUD_CONFLICT';
  });
  results.push({ account: a, steps });
}


// ------------------------------------------------------------------------------------------
// Vòng 2: tình huống lộn xộn giáo viên hay gặp. Mỗi bước ghi hành vi mong đợi; lệch là lỗi.
// ------------------------------------------------------------------------------------------
async function runMessy(base, results) {
  const a = { ...base, uid: base.uid + '-m' };
  const steps = [];
  const rec = async (name, fn) => {
    try { const detail = await fn(); steps.push({ step: name, ok: true, detail: detail || '' }); }
    catch (err) { steps.push({ step: name, ok: false, detail: String(err && err.message || err).slice(0, 400) }); }
  };
  const must = (cond, msg) => { if (!cond) throw new Error(msg); };
  const rejects = async (p, b) => { try { await tab.call(p, b); } catch (err) { return err; } return null; };
  const tab = openTab(a);
  const W = tab.window;
  await W.FirebaseClient.loadFromCloudV2(W.FirebaseState.user, { db: firestore.db, helpers: firestore.helpers });
  const lessons = ppctLessons(a);
  for (const l of lessons) await tab.call('/api/ppct/save-lesson', { lesson: l });
  const qs = bankQuestions(a, lessons);
  await tab.call('/api/bank/import', { mode: 'append', questions: qs, grade: a.grade });
  await tab.call('/api/questions/bulk', { ids: W.FirebaseState.currentData.bank.questions.map(q => q.id), action: 'bulk_approve', confirmed: true });
  const comps = CompetencyCatalog.defaultCompetenciesForSubject(a.subject);

  await rec('Nhập lại đúng tệp cũ: không thêm câu trùng, báo rõ', async () => {
    const before = W.FirebaseState.currentData.bank.questions.length;
    let r = null, msg = '';
    try { r = await tab.call('/api/bank/import', { mode: 'append', questions: qs, grade: a.grade }); } catch (err) { msg = err.message; }
    must(W.FirebaseState.currentData.bank.questions.length === before, 'Đã thêm câu trùng');
    must(msg || (r && r.import_report.added === 0), 'Không báo gì');
    return msg ? msg.slice(0, 90) : 'bỏ qua toàn bộ';
  });
  await rec('Mã bài viết thường "b1", YCCĐ thừa dấu cách: chuẩn hóa theo PPCT', async () => {
    const q = { ...qs[0], question: qs[0].question + ' (biến thể)', lesson_code: 'b1', learning_outcome: '  ' + qs[0].learning_outcome.replace(/ /g, '  ') + ' ' };
    const r = await tab.call('/api/bank/import', { mode: 'append', questions: [q], grade: a.grade });
    must(r.import_report.added === 1, 'Không nhập được: ' + JSON.stringify(r.import_report));
    const saved = W.FirebaseState.currentData.bank.questions.find(x => x.question === q.question);
    must(saved.lesson_code === 'B1', 'Mã bài lưu là ' + saved.lesson_code);
    const g = W.BankKnowledgeGraph.buildGraph(W.FirebaseState.currentData, { subject: a.subject });
    must(g.outgoing('cau:' + saved.id, 'danh_gia').length === 1, 'YCCĐ thừa dấu cách không khớp PPCT trong Bản đồ tri thức');
    return 'B1, khớp YCCĐ';
  });
  await rec('Nhập nhầm khối (câu khối khác chưa có PPCT): bị chặn, không ghi', async () => {
    const before = W.FirebaseState.currentData.bank.questions.length;
    const wrong = qs.slice(0, 2).map(q => ({ ...q, grade: a.grade === 12 ? 11 : a.grade + 1, question: q.question + ' (nhầm khối)' }));
    const err = await rejects('/api/bank/import', { mode: 'append', questions: wrong, grade: wrong[0].grade });
    must(err, 'Không bị chặn');
    must(W.FirebaseState.currentData.bank.questions.length === before, 'Đã ghi một phần');
    return err.message.slice(0, 100);
  });
  await rec('Câu có YCCĐ không thuộc PPCT: bị chặn khi nhập', async () => {
    const err = await rejects('/api/bank/import', { mode: 'append', questions: [{ ...qs[0], question: 'Câu YCCĐ lạ', learning_outcome: 'YCCĐ không có trong PPCT' }], grade: a.grade });
    must(err, 'Không bị chặn');
    return err.message.slice(0, 100);
  });
  await rec('Ma trận tổng 9,5 điểm: không khóa được', async () => {
    const m = matrixFor(a, comps); m.id = 'MX-SAI-' + a.uid; m.family_id = 'F-SAI-' + a.uid; m.slots[0].parts[0].points -= 0.5;
    const saved = await tab.call('/api/matrices/save', { matrix: m });
    const err = await rejects('/api/matrices/lock', { id: saved.matrix.id, expected_revision: saved.matrix.revision, confirmation: { confirmed_by: a.name, confirmed_at: '2026-11-24', external_agreement: true } });
    const full = err ? err.message + ' ' + JSON.stringify(err.details || {}) : '';
    must(err && /10 điểm/.test(full), 'Không bị chặn hoặc không nói về 10 điểm: ' + full.slice(0, 200));
    await tab.call('/api/matrices/delete', { id: saved.matrix.id }).catch(() => {});
    return err.message.slice(0, 100);
  });
  if (!isThpt(a.grade)) {
    await rec('THCS dùng câu Đúng/Sai trong ma trận: không khóa được', async () => {
      const m = matrixFor(a, comps); m.id = 'MX-YN-' + a.uid; m.family_id = 'F-YN-' + a.uid;
      m.slots[0] = { id: 'YNX', kind: 'YN', number: 1, scoring: { mode: 'sum_parts' }, parts: ['a', 'b', 'c', 'd'].map(l => ({ id: 'PYNX' + l, label: l, requirement_id: 'R1', points: 0.125 })) };
      let err = null, savedYn = null;
      try { savedYn = await tab.call('/api/matrices/save', { matrix: m }); } catch (e) { err = e; }
      if (!err) { m.id = savedYn.matrix.id;
        err = await rejects('/api/matrices/lock', { id: savedYn.matrix.id, expected_revision: savedYn.matrix.revision, confirmation: { confirmed_by: a.name, confirmed_at: '2026-11-24', external_agreement: true } }); }
      must(err, 'THCS khóa được ma trận có câu Đúng/Sai');
      await tab.call('/api/matrices/delete', { id: m.id }).catch(() => {});
      return err.message.slice(0, 100);
    });
  }
  const saved = await tab.call('/api/matrices/save', { matrix: matrixFor(a, comps) });
  const locked = await tab.call('/api/matrices/lock', { id: saved.matrix.id, expected_revision: saved.matrix.revision, confirmation: { confirmed_by: a.name, confirmed_at: '2026-11-24', external_agreement: true } });
  const mid = locked.matrix.id;
  await rec('Sửa nội dung câu đã duyệt: về "cần duyệt lại"; ô thiếu có gợi ý đúng câu đó', async () => {
    const es = W.FirebaseState.currentData.bank.questions.filter(q => q.type === 'ES' && q.lesson_code === 'B3' && q.learning_outcome === lessons[2].outcomes[0]);
    for (const q of es) {
      const r = await tab.call('/api/questions/save', { question: { ...q, question: q.question + ' (đã sửa)' } });
      must(r.question.review_status === 'needs_review', 'Trạng thái sau sửa: ' + r.question.review_status);
    }
    const sf = await tab.call(`/api/matrices/${encodeURIComponent(mid)}/shortfall`);
    const cell = sf.cells.find(c => c.kind === 'ES' && c.shortfall > 0);
    must(cell, 'Không báo thiếu câu tự luận');
    must((cell.suggestions || []).length === es.length, `Gợi ý ${(cell.suggestions || []).length}/${es.length}`);
    must(cell.suggestions.every(x => x.review_status === 'needs_review'), 'Gợi ý sai trạng thái');
    return `thiếu ${cell.shortfall}, gợi ý ${cell.suggestions.length} câu cần duyệt lại`;
  });
  await rec('Xóa bài PPCT đang có câu hỏi và ma trận dùng: phải chặn hoặc cảnh báo', async () => {
    const err = await rejects('/api/ppct/delete-lesson', { grade: a.grade, lesson_code: 'B1', subject_name: a.subject });
    const still = W.FirebaseState.currentData.bank.ppct.lessons.some(l => l.lesson_code === 'B1' && Number(l.grade) === a.grade);
    must(err || still, 'Đã xóa bài B1 dù còn ' + W.FirebaseState.currentData.bank.questions.filter(q => q.lesson_code === 'B1').length + ' câu và ma trận đã khóa dùng bài này');
    return err ? err.message.slice(0, 100) : 'giữ bài';
  });
  await rec('Tạo bộ 6 đề khi đề cương nhỏ: tạo được kèm cảnh báo hoặc bị chặn rõ ràng, không ghi dở', async () => {
    const before = W.FirebaseState.currentData.exams.length;
    const p = await tab.call('/api/revisions/propose', { grade: a.grade, exam_type: 'GK1', matrix_id: mid, seed: 'm' }).catch(e => ({ error: e }));
    if (p.error) return 'không lập được đề cương: ' + p.error.message.slice(0, 80);
    const rv = await tab.call('/api/revisions/save', { title: 'Đề cương nhỏ', grade: a.grade, question_ids: p.question_ids, matrix_id: mid });
    try {
      const r = await tab.call('/api/exams/generate-set', { title: 'Bộ 6 đề', grade: a.grade, subject_name: a.subject, exam_type: 'GK1', duration: 45, matrix_id: mid, revision_id: rv.revision.id, exam_count: 6, seed: 'six' });
      must(r.exams.length === 6, 'Số đề ' + r.exams.length);
      return '6 đề; ' + (r.warnings || []).join(' ').slice(0, 80);
    } catch (err) {
      must(W.FirebaseState.currentData.exams.length === before, 'Bị lỗi nhưng đã ghi dở ' + (W.FirebaseState.currentData.exams.length - before) + ' đề');
      must(/Vị trí thiếu: Tự luận câu/.test(err.message), 'Thông báo chưa chỉ rõ vị trí thiếu: ' + err.message);
      return 'chặn đúng (ô tự luận không còn câu đã duyệt): ' + err.message.slice(err.message.indexOf('Vị trí thiếu'), err.message.indexOf('Vị trí thiếu') + 90);
    }
  });
  await rec('Chưa đăng nhập mà lưu: bị từ chối, dữ liệu không đổi', async () => {
    const t = openTab(a);
    t.window.FirebaseState.user = null;
    let msg = '';
    try { await t.call('/api/ppct/save-lesson', { lesson: lessons[0] }); } catch (err) { msg = err.message; }
    must(/đăng nhập/i.test(msg), 'Thông báo: ' + (msg || 'không bị từ chối'));
    return msg.slice(0, 80);
  });
  await rec('Khôi phục tệp sao lưu hỏng: bị từ chối, dữ liệu giữ nguyên', async () => {
    const n = W.FirebaseState.currentData.bank.questions.length;
    let msg = '';
    try { await W.FirebaseClient.replaceWorkspaceData({ bank: { questions: 'không phải danh sách' } }); } catch (err) { msg = err.message; }
    must(msg, 'Không bị từ chối');
    must(W.FirebaseState.currentData.bank.questions.length === n, 'Dữ liệu bị đổi');
    return msg.slice(0, 80);
  });
  await rec('Khôi phục tệp sao lưu rỗng: chặn xóa sạch ngân hàng (chống ghi đè rỗng)', async () => {
    const n = W.FirebaseState.currentData.bank.questions.length;
    let msg = '';
    try { await W.FirebaseClient.replaceWorkspaceData({ bank: { questions: [], ppct: { lessons: [] } }, exams: [], revisions: [], matrices: [] }); } catch (err) { msg = err.message; }
    const fresh = await V2.firestoreReadWorkspaceV2(a.uid, firestore.db, firestore.helpers);
    must(fresh.data.bank.questions.length === n || msg, 'Ngân hàng trên đám mây bị xóa sạch không cảnh báo');
    return msg ? 'chặn: ' + msg.slice(0, 80) : 'đã thay bằng dữ liệu rỗng theo yêu cầu (có xác nhận ở giao diện)';
  });
  results.push({ account: { ...a, name: a.name + ' (tình huống)' }, steps });
}

async function main() {
  const results = [];
  for (const a of ACCOUNTS) await runAccount(a, results);
  for (const a of ACCOUNTS) await runMessy(a, results);

  // Tách dữ liệu giữa các tài khoản
  const isolation = [];
  for (const a of [...ACCOUNTS, ...ACCOUNTS.map(x => ({ ...x, uid: x.uid + '-m' }))]) {
    const r = await V2.firestoreReadWorkspaceV2(a.uid, firestore.db, firestore.helpers);
    const d = r.data || { bank: { questions: [] }, exams: [] };
    const foreign = d.bank.questions.filter(q => q.subject_name !== a.subject).length + d.exams.filter(e => e.subject_name !== a.subject).length;
    isolation.push({ uid: a.uid, questions: d.bank.questions.length, exams: d.exams.length, foreign });
  }

  const summary = results.map(r => ({
    tai_khoan: `${r.account.name} — ${r.account.subject} ${r.account.grade}`,
    dat: r.steps.filter(s => s.ok).length, tong: r.steps.length,
    loi: r.steps.filter(s => !s.ok).map(s => `${s.step}: ${s.detail}`)
  }));
  fs.writeFileSync(path.join(__dirname, 'KET_QUA.json'), JSON.stringify({ chay_luc: new Date().toISOString(), summary, isolation, results }, null, 2));
  for (const s of summary) {
    console.log(`${s.dat === s.tong ? 'ĐẠT ' : 'LỖI '} ${s.tai_khoan}: ${s.dat}/${s.tong}`);
    s.loi.forEach(l => console.log('      - ' + l));
  }
  const leak = isolation.filter(i => i.foreign > 0);
  console.log(leak.length ? 'LỖI  Tách dữ liệu: ' + JSON.stringify(leak) : `ĐẠT  Tách dữ liệu: ${isolation.length} tài khoản, không lẫn môn khác`);
  process.exitCode = summary.every(s => s.dat === s.tong) && !leak.length ? 0 : 1;
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 2; });
module.exports = { ACCOUNTS, openTab, ppctLessons, bankQuestions, matrixFor, firestore, runAccount, runMessy };
