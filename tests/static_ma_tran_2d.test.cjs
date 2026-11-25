'use strict';
// Luồng Ma trận 2D → đề cương, đề → bảng đặc tả theo đề; kiểm định nêu rõ câu sai; trộn đề trong từng phần (25/11/2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../public/static-api.js');
const engine = require('../public/static-exam-engine.js');
const workflow = require('../public/static-exam-workflow.js');
const KR = require('../public/knowledge-rules.js');
const MatrixUI = require('../public/matrices.js');
const core = require('../public/core.js');

const env = { engine, workflow, subject: 'Tin học', actor: 'Giáo viên minh họa' };
const LESSONS = [
  { grade: 9, subject_name: 'Tin học', lesson_code: 'B1', lesson_name_source: 'Thế giới kĩ thuật số', topic_source: 'Chủ đề 1', outcomes: ['Nêu được ví dụ thiết bị có bộ xử lí', 'Nhận biết vai trò bộ xử lí'], digital_competencies: ['NLa'] },
  { grade: 9, subject_name: 'Tin học', lesson_code: 'B2', lesson_name_source: 'Thông tin trong giải quyết vấn đề', topic_source: 'Chủ đề 1', outcomes: ['Giải thích tầm quan trọng của thông tin', 'Phân tích ví dụ chất lượng thông tin'], digital_competencies: ['NLc'] },
  { grade: 9, subject_name: 'Tin học', lesson_code: 'B3', lesson_name_source: 'Đánh giá chất lượng thông tin', topic_source: 'Chủ đề 1', outcomes: ['Vận dụng tiêu chí đánh giá thông tin'], digital_competencies: ['NLc'] }
];

function bank() {
  const qs = [];
  const q = (id, code, oi, level, type, extra) => ({ id, grade: 9, subject_name: 'Tin học', lesson_code: code, learning_outcome: LESSONS.find(l => l.lesson_code === code).outcomes[oi], level, type, review_status: 'approved', ...extra });
  // Câu trải trên CẢ HAI YCCĐ của mỗi bài: ô 2D phải nhận hết.
  for (let i = 0; i < 6; i++) qs.push(q('B1-' + i, 'B1', i % 2, 'Biết', 'MC', { question: `Câu B1 số ${i}?`, options: [`Đúng ${i}`, `Sai A${i}`, `Sai B${i}`, `Sai C${i}`], correct: 0, competency: i % 2 ? 'NLb' : 'NLa' }));
  for (let i = 0; i < 6; i++) qs.push(q('B2-' + i, 'B2', i % 2, 'Hiểu', 'MC', { question: `Câu B2 số ${i}?`, options: [`Đúng ${i}`, `Sai A${i}`, `Sai B${i}`, `Sai C${i}`], correct: 0 }));
  for (let i = 0; i < 3; i++) qs.push(q('B3-' + i, 'B3', 0, 'Vận dụng', 'ES', { question: `Tự luận B3 số ${i}`, rubric: [{ criterion: 'Ý chính', points: 1.5 }, { criterion: 'Ví dụ', points: 1.5 }], max_score: 3 }));
  return qs;
}

// Dựng ma trận đúng như bảng 2D trên giao diện: nhập số câu vào ô bài × mức độ.
function matrix2D() {
  const m = { id: 'M2D', family_id: 'F2D', title: 'Ma trận 2D GK1 Tin 9', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', status: 'draft', revision: 1, version: 1,
    mode: 'authored', profile: 'THCS', school_year: '2026-2027', owner_name: 'Tổ Tin học', campus: 'Cao Thắng', duration: 45, total_points: 10,
    indicator_catalog: [], reconciliation: { confirmed: true, issues: [] },
    lessons: LESSONS.map(l => ({ lesson_code: l.lesson_code, title: l.lesson_name_source, topic: l.topic_source })), requirements: [], slots: [] };
  MatrixUI.updateSlotsFromGrid(m, 'B1', 'MC_B', 4);
  MatrixUI.updateSlotsFromGrid(m, 'B2', 'MC_H', 4);
  MatrixUI.updateSlotsFromGrid(m, 'B3', 'ES_VD', 2);
  // Điểm theo khung 10: 8 TN × 0,5 + 2 TL × 3
  m.slots.forEach(s => s.parts.forEach(p => { p.points = s.kind === 'MC' ? 0.5 : 3; }));
  MatrixUI.renumberSlots ? MatrixUI.renumberSlots(m) : null;
  const counters = {}; m.slots.forEach(s => { s.number = (counters[s.kind] = (counters[s.kind] || 0) + 1); });
  return m;
}

async function lockedWorkspace() {
  let data = { bank: { questions: bank(), ppct: { lessons: LESSONS } }, matrices: [matrix2D()], revisions: [], exams: [] };
  const r = await api.handle('/api/matrices/lock', { id: 'M2D', expected_revision: 1, confirmation: { confirmed_by: 'GV', confirmed_at: '2026-11-25', external_agreement: true } }, data, env);
  return r.data;
}

test('Ô ma trận 2D chỉ ràng buộc bài × dạng × mức độ: nhận mọi YCCĐ của bài', async () => {
  const m = matrix2D();
  assert.ok(m.requirements.length === 3 && m.requirements.every(r => r.outcome_mode === 'any' && r.ppct_outcome_index === null));
  const data = await lockedWorkspace();
  assert.equal(data.matrices[0].status, 'locked');
  const sf = await api.handle('/api/matrices/M2D/shortfall', undefined, data, env);
  assert.equal(sf.response.ok, true, JSON.stringify(sf.response.cells));
  assert.ok(sf.response.cells.every(c => c.outcome === '(Mọi YCCĐ của bài)'));
  const b1 = sf.response.cells.find(c => c.lesson_code === 'B1');
  assert.equal(b1.approved, 6, 'Câu của cả hai YCCĐ bài B1 đều được tính');
});

test('Ma trận 2D → đề cương → bộ 2 đề, kiểm định đạt (mã cũ và kho luật)', async () => {
  let data = await lockedWorkspace();
  const p = await api.handle('/api/revisions/propose', { grade: 9, exam_type: 'GK1', matrix_id: 'M2D', seed: 'x' }, data, env);
  let r = await api.handle('/api/revisions/save', { title: 'Đề cương 2D', grade: 9, question_ids: p.response.question_ids, matrix_id: 'M2D' }, data, env);
  data = r.data;
  r = await api.handle('/api/exams/generate-set', { title: 'Bộ đề 2D', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', duration: 45, matrix_id: 'M2D', revision_id: r.response.revision.id, exam_count: 2, seed: 's' }, data, env);
  data = r.data;
  for (const e of r.response.exams) {
    const v = engine.verifyExam(data, e);
    assert.equal(v.passed, true, JSON.stringify(v.errors));
    assert.equal(KR.checkExam(data, e).passed, true);
  }
  // Duyệt và khóa cả bộ: kiểm từng ô ma trận 2D theo bài × dạng × mức độ (trước đây báo "chưa ánh xạ đúng YCCĐ").
  const setId = r.response.exams[0].exam_set.id;
  r = await api.handle('/api/exams/set/transition', { set_id: setId, action: 'submit' }, data, env); data = r.data;
  r = await api.handle('/api/exams/set/transition', { set_id: setId, action: 'approve' }, data, env);
  assert.ok(r.response.exams.every(e => e.status === 'locked'));
});

test('Kiểm định nêu rõ câu chưa duyệt, câu đổi nội dung, câu sai ô ma trận', async () => {
  let data = await lockedWorkspace();
  const r = await api.handle('/api/exams/generate', { title: 'Đề', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', matrix_id: 'M2D', seed: 'v' }, data, env);
  const exam = JSON.parse(JSON.stringify(r.response.exam));
  exam.questions[1].review_status = 'draft';
  exam.questions[2].question += ' (sửa lén)';
  const v = engine.verifyExam(r.data, exam);
  const byCode = Object.fromEntries(v.errors.map(e => [e.code, e]));
  assert.match(byCode.questions_not_approved.message, /Câu chưa duyệt: TN câu 2/);
  assert.match(byCode.snapshot.message, /TN câu 3/);
  const moved = JSON.parse(JSON.stringify(r.response.exam));
  moved.questions[0].level = 'Hiểu';
  const v2 = engine.verifyExam(r.data, moved);
  assert.ok(v2.errors.some(e => e.code === 'matrix_cell' && /TN câu 1: câu mức Hiểu, ô cần mức Biết/.test(e.message)), JSON.stringify(v2.errors));
});

test('Đề tạo bằng chế độ linh hoạt có bản chụp: kiểm định không còn báo "bản chụp sai"', async () => {
  const data = await lockedWorkspace();
  data.bank.questions[0].review_status = 'draft';
  const r = await api.handle('/api/exams/generate', { title: 'Đề linh hoạt', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', matrix_id: 'M2D', flexible: true, seed: 'f' }, data, env);
  const e = r.response.exam;
  assert.ok(e.questions.every(q => q.source_snapshot_hash && q.content_hash));
  const codes = e.verification.errors.map(x => x.code);
  assert.ok(!codes.includes('snapshot'), JSON.stringify(e.verification.errors));
  const v = await api.handle('/api/exams/verify', { id: e.id }, r.data, env);
  assert.ok(!v.response.verification.errors.some(x => x.code === 'snapshot'));
});

test('Bảng đặc tả trích từ đề: không gộp nhầm TN câu 1 với TL câu 1; YCCĐ và năng lực thật của từng câu', async () => {
  const data = await lockedWorkspace();
  const r = await api.handle('/api/exams/generate', { title: 'Đề', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', matrix_id: 'M2D', seed: 'spec' }, data, env);
  const exam = r.response.exam;
  const m = { grade: 9, subject_name: 'Tin học', lessons: [], requirements: [], slots: [] };
  MatrixUI.syncSpecFromExam(m, exam, LESSONS);
  assert.equal(m.slots.length, exam.questions.length);
  assert.equal(new Set(m.slots.map(s => s.id)).size, m.slots.length, 'Mã vị trí không được trùng');
  assert.equal(m.slots.filter(s => s.kind === 'MC').length, 8);
  assert.equal(m.slots.filter(s => s.kind === 'ES').length, 2);
  for (const s of m.slots) {
    const q = exam.questions.find(x => x.type === s.kind && x.slot_number === s.number);
    const req = m.requirements.find(x => x.id === s.parts[0].requirement_id);
    assert.equal(req.lesson_code, q.lesson_code);
    assert.equal(req.level, q.level);
    assert.equal(LESSONS.find(l => l.lesson_code === q.lesson_code).outcomes[req.ppct_outcome_index], q.learning_outcome);
    assert.match(req.custom_refs, new RegExp('Câu ' + q.slot_number + '\\b'));
  }
  const b1 = exam.questions.find(q => q.lesson_code === 'B1' && q.competency === 'NLb');
  if (b1) assert.ok(m.requirements.some(x => x.competency === 'NLb'), 'Giữ năng lực riêng của câu');
  const es = m.requirements.filter(x => m.slots.some(s => s.kind === 'ES' && s.parts[0].requirement_id === x.id));
  assert.ok(es.every(x => x.competency === 'NLc'), 'Câu không ghi năng lực thì lấy năng lực của bài trong PPCT');
});

test('Trộn đề: xáo trong từng phần, giữ thứ tự phần và tự luận, đáp án đúng đi theo phương án', async () => {
  let data = await lockedWorkspace();
  let r = await api.handle('/api/exams/generate', { title: 'Đề gốc', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', matrix_id: 'M2D', seed: 'p' }, data, env);
  data = r.data; const src = r.response.exam;
  r = await api.handle('/api/exams/permute', { id: src.id, codes: ['101', '102', '103', '104'], shuffle_questions: true, shuffle_options: true, keep_es_order: true, seed: 'mix' }, data, env);
  const made = r.response.result.exams;
  assert.equal(made.length, 4);
  for (const e of made) {
    const types = e.questions.map(q => q.type);
    assert.deepEqual(types, [...types].sort((a, b) => ['MC', 'YN', 'SHORT', 'ES'].indexOf(a) - ['MC', 'YN', 'SHORT', 'ES'].indexOf(b)), 'Không trộn lẫn các phần');
    assert.deepEqual(e.questions.filter(q => q.type === 'ES').map(q => q.id), src.questions.filter(q => q.type === 'ES').map(q => q.id), 'Giữ thứ tự tự luận');
    for (const q of e.questions.filter(q => q.type === 'MC')) {
      const o = src.questions.find(x => x.id === q.id);
      assert.equal(q.options[q.correct], o.options[o.correct]);
    }
    assert.deepEqual(e.questions.filter(q => q.type === 'MC').map(q => q.slot_number), e.questions.filter(q => q.type === 'MC').map((_, i) => i + 1));
    assert.equal(engine.verifyExam(r.data, e).errors.some(x => x.code === 'snapshot'), false);
  }
  assert.ok(made.some(e => e.questions.filter(q => q.type === 'MC').map(q => q.id).join() !== src.questions.filter(q => q.type === 'MC').map(q => q.id).join()), 'Có xáo thứ tự câu');
  await assert.rejects(api.handle('/api/exams/permute', { id: src.id, codes: ['104', '105'], seed: 'again' }, r.data, env), /Mã 104 đã có/);
  const key = core.permutationAnswerKey([src, ...made]);
  assert.equal(key.rows.length, 5);
  assert.equal(key.columns.length, src.questions.length);
  assert.ok(key.rows[1].cells.every(c => /^[ABCD]$|^TL$/.test(c.answer) && c.source));
});

test('Trộn đề: xáo ý a–d câu Đúng/Sai khi chọn, đáp án Đ/S đi theo ý', async () => {
  const exam = { id: 'E', title: 'Đề Đ/S', grade: 10, subject_name: 'Tin học', exam_type: 'GK1', status: 'drafting', question_count: 1, total_points: 10,
    questions: [{ id: 'Y1', type: 'YN', slot_number: 1, grade: 10, subject_name: 'Tin học', points: 10, review_status: 'approved', question: 'Đ/S',
      statements: ['a', 'b', 'c', 'd'].map((l, k) => ({ label: l, text: 'Ý ' + l, correct: k === 0 })) }] };
  Object.assign(exam, { blueprint: [], revision_snapshot: null, ppct_snapshot: null });
  exam.questions.forEach(q => { q.source_snapshot_hash = engine.fingerprint(q); });
  exam.snapshot_integrity = engine.jsonDigest({ questions: exam.questions, matrix: null, blueprint: exam.blueprint, revision: exam.revision_snapshot, ppct: exam.ppct_snapshot });
  const data = { bank: { questions: [], ppct: { lessons: [] } }, matrices: [], revisions: [], exams: [exam] };
  const r = await api.handle('/api/exams/permute', { id: 'E', codes: ['201', '202', '203', '204', '205', '206'], shuffle_statements: true, seed: 'yn' }, data, env);
  const orders = new Set(r.response.result.exams.map(e => e.questions[0].statements.map(s => s.text).join('|')));
  assert.ok(orders.size > 1, 'Thứ tự ý a–d phải được xáo');
  for (const e of r.response.result.exams) {
    const st = e.questions[0].statements;
    assert.deepEqual(st.map(s => s.label), ['a', 'b', 'c', 'd']);
    assert.equal(st.find(s => s.text === 'Ý a').correct, true);
  }
});
