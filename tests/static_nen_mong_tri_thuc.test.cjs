'use strict';
// Nền móng tri thức (25/11/2026): mã YCCĐ cố định, nối câu/ma trận theo mã, một định nghĩa "câu trùng", ô ma trận 2D trong đồ thị.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/core.js');
const KG = require('../public/knowledge-graph.js');
const KR = require('../public/knowledge-rules.js');
const api = require('../public/static-api.js');
const engine = require('../public/static-exam-engine.js');
const workflow = require('../public/static-exam-workflow.js');
const env = { engine, workflow, subject: 'Tin học', actor: 'Giáo viên minh họa' };

const lesson = (outcomes, extra = {}) => ({ grade: 9, subject_name: 'Tin học', lesson_code: 'B1', lesson_name_source: 'Bài 1', topic: 'Chủ đề 1', outcomes, ...extra });
const mc = (id, outcome, extra = {}) => ({ id, grade: 9, subject_name: 'Tin học', type: 'MC', level: 'Biết', lesson_code: 'B1', learning_outcome: outcome,
  question: `Câu ${id}?`, options: [`Đúng ${id}`, `Sai A ${id}`, `Sai B ${id}`, `Sai C ${id}`], correct: 0, review_status: 'approved', ...extra });

test('Mã YCCĐ cố định: giữ mã khi chèn, xóa, đổi thứ tự, sửa nhẹ câu chữ; không dùng lại số đã xóa', () => {
  const v1 = lesson(['Nêu được khái niệm thiết bị số', 'Giải thích được vai trò của máy tính']);
  const a = C.assignOutcomeIds(v1, null);
  assert.deepEqual(a.outcome_ids, ['TIN9-B1-YC1', 'TIN9-B1-YC2']);
  const v2 = lesson(['Giải thích được vai trò của máy tính', 'Nhận biết dữ liệu số', 'Nêu được khái niệm về thiết bị số']);
  const b = C.assignOutcomeIds(v2, { ...v1, ...a });
  assert.deepEqual(b.outcome_ids, ['TIN9-B1-YC2', 'TIN9-B1-YC3', 'TIN9-B1-YC1'], 'Đổi thứ tự + chèn + sửa nhẹ chữ');
  assert.deepEqual(b.renamed.map(x => x.id), ['TIN9-B1-YC1']);
  const v3 = lesson(['Giải thích được vai trò của máy tính']);
  const c = C.assignOutcomeIds(v3, { ...v2, ...b });
  assert.deepEqual(c.removed.sort(), ['TIN9-B1-YC1', 'TIN9-B1-YC3']);
  const d = C.assignOutcomeIds(lesson(['Giải thích được vai trò của máy tính', 'Hoàn toàn mới về mạng']), { ...v3, ...c });
  assert.deepEqual(d.outcome_ids, ['TIN9-B1-YC2', 'TIN9-B1-YC4'], 'Không dùng lại YC1, YC3 đã xóa');
});

test('Lưu PPCT: câu hỏi nhận mã và chữ YCCĐ mới; ma trận chưa khóa cập nhật vị trí; ma trận đã khóa giữ nguyên', () => {
  const v1 = { ...lesson(['YC một', 'YC hai']), outcome_ids: ['TIN9-B1-YC1', 'TIN9-B1-YC2'], outcome_id_next: 3 };
  const questions = [mc('Q1', 'YC hai'), mc('Q2', 'YC một', { learning_outcome_id: 'TIN9-B1-YC1' }), mc('Q3', 'Không khớp gì')];
  const req = () => [{ id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'yc', ppct_outcome_index: 1 }];
  const matrices = [{ id: 'M-NHAP', grade: 9, subject_name: 'Tin học', status: 'draft', requirements: req() }, { id: 'M-KHOA', grade: 9, subject_name: 'Tin học', status: 'locked', requirements: req() }];
  const r = C.syncOutcomeIds(lesson(['YC hai được sửa câu chữ', 'Mới chèn', 'YC một']), v1, { questions, matrices });
  assert.deepEqual(r.lesson.outcome_ids, ['TIN9-B1-YC2', 'TIN9-B1-YC3', 'TIN9-B1-YC1']);
  assert.deepEqual([questions[0].learning_outcome_id, questions[0].learning_outcome], ['TIN9-B1-YC2', 'YC hai được sửa câu chữ']);
  assert.equal(questions[1].learning_outcome, 'YC một');
  assert.equal(questions[2].learning_outcome_id, undefined, 'Câu không khớp: không tự gán');
  assert.deepEqual([matrices[0].requirements[0].ppct_outcome_id, matrices[0].requirements[0].ppct_outcome_index], ['TIN9-B1-YC2', 0]);
  assert.equal(matrices[1].requirements[0].ppct_outcome_index, 1, 'Ma trận đã khóa giữ nguyên');
  assert.equal(r.questions_updated, 1, 'Q2 đã đúng mã và chữ: không tính là cập nhật');
});

test('Đồ thị nối theo mã: câu có chữ YCCĐ cũ nhưng đúng mã vẫn nối; PPCT đổi thứ tự không làm lệch; ô ma trận 2D có trong đồ thị', () => {
  const data = { bank: { ppct: { lessons: [{ ...lesson(['YC mới viết lại', 'YC hai']), outcome_ids: ['TIN9-B1-YC2', 'TIN9-B1-YC1'] }] },
    questions: [mc('Q1', 'YC hai cũ', { learning_outcome_id: 'TIN9-B1-YC1' }), mc('Q2', 'YC hai'), mc('Q3', 'YC hia', { type: 'MC' })] },
  matrices: [{ id: 'M2D', title: '2D', grade: 9, subject_name: 'Tin học', status: 'draft',
    requirements: [{ id: 'R1', lesson_code: 'B1', level: 'Biết', outcome_mode: 'any', ppct_outcome_index: null }, { id: 'R2', lesson_code: 'B1', level: 'Biết', ppct_outcome_id: 'TIN9-B1-YC2', ppct_outcome_index: 9 }],
    slots: [1, 2, 3, 4, 5].map(n => ({ id: 'S' + n, kind: 'MC', number: n, parts: [{ requirement_id: 'R1', points: 0.25 }] })) }], revisions: [], exams: [] };
  const g = KG.buildGraph(data);
  assert.equal(g.match('cau:Q1', 'danh_gia', 'yccd:TIN9-B1-YC1')[0]?.props.theo, 'ma');
  assert.equal(g.match('cau:Q2', 'danh_gia', 'yccd:TIN9-B1-YC1')[0]?.props.theo, 'chu');
  assert.equal(g.match('matran:M2D', 'can_cu', 'yccd:TIN9-B1-YC2').length, 1, 'Yêu cầu ma trận nối theo mã, bỏ qua chỉ số sai');
  const cells = KG.matrixCells(g, 'M2D');
  assert.deepEqual(cells.map(c => [c.lesson_code, c.level, c.kind, c.need, c.approved, c.short]), [['B1', 'Biết', 'MC', 5, 3, 2]]);
  const issue = KG.validateGraph(g).find(i => i.question_id === 'Q3');
  assert.equal(issue.code, 'cau_khong_yccd');
  assert.equal(issue.suggestions[0].id, 'TIN9-B1-YC1', 'Gợi ý YCCĐ gần nhất cho câu gõ sai chữ');
  assert.deepEqual(KG.outcomeIdAudit(g), { theo_ma: 1, theo_chu: 1, khong_noi: 1, ngoai_ppct: 0 });
});

test('Một định nghĩa câu trùng: trùng hẳn / đã trộn phương án / cùng lời dẫn; luật và đối chiếu đề cương dùng chung', () => {
  const q = mc('A', 'YC');
  const permuted = { ...q, id: 'A-102', options: [...q.options].reverse(), correct: 3 };
  const otherAnswer = { ...q, id: 'A-X', correct: 1 };
  assert.equal(C.questionRelation(q, { ...q, id: 'A2' }), 'trung_han');
  assert.equal(C.questionRelation(q, permuted), 'tron_phuong_an');
  assert.equal(C.questionRelation(q, otherAnswer), 'cung_loi_dan');
  assert.equal(C.questionRelation(q, { ...q, level: 'Hiểu', learning_outcome: 'khác', option_explanations: ['x'] }), 'trung_han', 'Bài, mức độ, YCCĐ, lời giải không làm câu thành câu khác');
  const exam = { id: 'E', grade: 9, subject_name: 'Tin học', questions: [{ ...permuted, points: 5 }, { ...otherAnswer, points: 5 }] };
  const cov = engine.revisionCoverage(exam, { questions: [q] });
  assert.deepEqual(cov.items.map(x => [x.in_revision, x.similar_text]), [[true, false], [false, true]]);
  const facts = KR.examFacts({ ...exam, questions: [{ ...q, slot_number: 1 }, { ...otherAnswer, slot_number: 2 }] }, { revision: null });
  const res = KR.infer(facts);
  const dup = res.findings.find(f => f.rule === 'R-TRUNG');
  assert.match(dup.message, /Câu 2 trùng với câu 1 \(cùng lời dẫn\)/);
});

test('Đổi câu chữ YCCĐ trong PPCT không làm lệch đối chiếu đề ↔ đề cương (so theo mã)', async () => {
  const L = { ...lesson(['YC gốc']), outcome_ids: ['TIN9-B1-YC1'] };
  const oldQ = mc('Q1', 'YC gốc', { learning_outcome_id: 'TIN9-B1-YC1' });
  const newQ = { ...mc('Q2', 'YC đã viết lại'), learning_outcome_id: 'TIN9-B1-YC1' };
  const data = { bank: { ppct: { lessons: [{ ...L, outcomes: ['YC đã viết lại'] }] }, questions: [oldQ, newQ] }, matrices: [], revisions: [{ id: 'REV', title: 'ĐC', grade: 9, subject_name: 'Tin học', questions: [oldQ] }],
    exams: [{ id: 'E', title: 'Đề', grade: 9, subject_name: 'Tin học', revision_id: 'REV', questions: [{ ...newQ, points: 10 }] }] };
  const r = await api.handle('/api/revisions/coverage', { revision_id: 'REV', exam_id: 'E' }, data, env);
  assert.equal(r.response.reports[0].outcome_percent, 100);
});

test('Chuẩn hóa mã YCCĐ: xem trước không ghi; áp dụng lưu mã PPCT, câu khớp chữ, câu giáo viên chọn, ma trận chưa khóa', async () => {
  const data = { bank: { ppct: { lessons: [lesson(['Nêu được khái niệm thiết bị số', 'Giải thích vai trò máy tính'])] },
    questions: [mc('Q1', 'Nêu được khái niệm thiết bị số'), mc('Q2', 'Nêu khái niệm thiết bị số.'), mc('Q3', 'Giải thích vai trò máy tính', { grade: 8 })] },
  matrices: [{ id: 'M', grade: 9, subject_name: 'Tin học', status: 'draft', requirements: [{ id: 'R', lesson_code: 'B1', level: 'Biết', ppct_outcome_index: 1 }] }], revisions: [], exams: [] };
  let r = await api.handle('/api/knowledge/normalize-outcomes', { grade: 9 }, data, env);
  assert.equal(r.changed, false);
  const rep = r.response.report;
  assert.deepEqual([rep.lessons_updated, rep.questions_linked, rep.matrices_updated], [1, 1, 1]);
  assert.equal(rep.unmatched[0].question_id, 'Q2');
  assert.equal(rep.unmatched[0].suggestions[0].id, 'TIN9-B1-YC1');
  assert.equal(data.bank.questions[0].learning_outcome_id, undefined, 'Xem trước không đổi dữ liệu');
  r = await api.handle('/api/knowledge/normalize-outcomes', { grade: 9, apply: true, mappings: { Q2: 'TIN9-B1-YC1' } }, data, env);
  assert.equal(r.changed, true);
  const d = r.data;
  assert.deepEqual(d.bank.ppct.lessons[0].outcome_ids, ['TIN9-B1-YC1', 'TIN9-B1-YC2']);
  assert.deepEqual(d.bank.questions.slice(0, 2).map(q => [q.learning_outcome_id, q.learning_outcome]), [['TIN9-B1-YC1', 'Nêu được khái niệm thiết bị số'], ['TIN9-B1-YC1', 'Nêu được khái niệm thiết bị số']]);
  assert.equal(d.bank.questions[2].learning_outcome_id, undefined, 'Khác khối: ngoài phạm vi');
  assert.equal(d.matrices[0].requirements[0].ppct_outcome_id, 'TIN9-B1-YC2');
  r = await api.handle('/api/knowledge/normalize-outcomes', { grade: 9, apply: true }, d, env);
  assert.equal(r.changed, false, 'Chạy lại không đổi gì');
});

test('Lưu câu hỏi: tự lưu mã YCCĐ theo YCCĐ giáo viên chọn', async () => {
  const data = { bank: { ppct: { lessons: [{ ...lesson(['YC một', 'YC hai']), outcome_ids: ['TIN9-B1-YC5', 'TIN9-B1-YC7'] }] }, questions: [] }, matrices: [], revisions: [], exams: [] };
  const q = mc(undefined, 'YC hai', { review_status: 'draft' }); delete q.id;
  const r = await api.handle('/api/questions/save', { question: q }, data, env);
  assert.equal(r.response.question.learning_outcome_id, 'TIN9-B1-YC7');
});
