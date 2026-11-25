'use strict';
// Đề cương (25/11/2026): thông báo lỗi đúng chỗ, nhập đề cương từ tệp, lập theo số câu từng dạng, đối chiếu đề ↔ đề cương.
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../public/static-api.js');
const engine = require('../public/static-exam-engine.js');
const workflow = require('../public/static-exam-workflow.js');

const env = { engine, workflow, subject: 'Tin học', actor: 'Giáo viên minh họa' };
const LESSONS = [
  { grade: 9, subject_name: 'Tin học', lesson_code: 'B1', lesson_name_source: 'Bài 1', outcomes: ['YC B1 thứ nhất', 'YC B1 thứ hai'] },
  { grade: 9, subject_name: 'Tin học', lesson_code: 'B2', lesson_name_source: 'Bài 2', outcomes: ['YC B2'] },
  { grade: 9, subject_name: 'Tin học', lesson_code: 'B3', lesson_name_source: 'Bài 3', outcomes: ['YC B3'] }
];

function workspace({ mcB1 = 30, mcB2 = 10, es = 8 } = {}) {
  const qs = [];
  const mc = (id, code, oi, level) => ({ id, grade: 9, subject_name: 'Tin học', type: 'MC', level, lesson_code: code, learning_outcome: LESSONS.find(l => l.lesson_code === code).outcomes[oi],
    question: `Câu ${id}?`, options: [`Đúng ${id}`, `Sai A ${id}`, `Sai B ${id}`, `Sai C ${id}`], correct: 0, review_status: 'approved' });
  for (let i = 0; i < mcB1; i++) qs.push(mc('B1-' + i, 'B1', i % 2, 'Biết'));
  for (let i = 0; i < mcB2; i++) qs.push(mc('B2-' + i, 'B2', 0, 'Hiểu'));
  for (let i = 0; i < es; i++) qs.push({ id: 'ES-' + i, grade: 9, subject_name: 'Tin học', type: 'ES', level: 'Vận dụng', lesson_code: 'B3', learning_outcome: 'YC B3',
    question: `Tự luận ${i}`, rubric: [{ criterion: 'Ý', points: 1 }], max_score: 1, review_status: 'approved' });
  return { bank: { questions: qs, ppct: { lessons: LESSONS } }, matrices: [], revisions: [], exams: [] };
}

test('Lưu đề cương: thông báo đúng điều sai (không câu nào, câu không còn trong ngân hàng); câu chọn trùng chỉ giữ một', async () => {
  const data = workspace();
  await assert.rejects(api.handle('/api/revisions/save', { title: 'ĐC', grade: 9, question_ids: [] }, data, env), /chưa có câu hỏi nào/);
  await assert.rejects(api.handle('/api/revisions/save', { title: 'ĐC', grade: 'abc', question_ids: ['B1-0'] }, data, env), /Chưa xác định khối/);
  await assert.rejects(api.handle('/api/revisions/save', { title: 'ĐC', grade: 9, question_ids: ['B1-0', 'KHONG-CO'] }, data, env), err => /1 câu không còn trong Ngân hàng/.test(err.message) && err.details.missing_ids[0] === 'KHONG-CO');
  const r = await api.handle('/api/revisions/save', { title: 'ĐC', grade: 9, question_ids: ['B1-0', 'B1-1', 'B1-0'] }, data, env);
  assert.equal(r.response.revision.questions.length, 2);
});

test('Nhập đề cương từ tệp: câu mới vào Ngân hàng (Nháp), câu trùng mã trong tệp vẫn nhập được, nhập lại thì dùng câu đã có', async () => {
  let data = workspace({ mcB1: 2, mcB2: 0, es: 0 });
  const file = [
    { id: 'X1', type: 'MC', level: 'Biết', lesson_code: 'B1', learning_outcome: 'YC B1 thứ nhất', question: 'Câu tệp 1?', options: ['a', 'b', 'c', 'd'], correct: 0 },
    { id: 'X1', type: 'MC', level: 'Biết', lesson_code: 'b1', learning_outcome: 'YC B1 thứ hai', question: 'Câu tệp 2?', options: ['a', 'b', 'c', 'd'], correct: 1 },
    { type: 'MC', level: 'Biết', lesson_code: 'B1', learning_outcome: 'YC B1 thứ nhất', question: 'Câu B1-0?', options: ['Đúng B1-0', 'Sai A B1-0', 'Sai B B1-0', 'Sai C B1-0'], correct: 0 }
  ];
  let r = await api.handle('/api/revisions/import', { title: 'Đề cương nhập', grade: 9, questions: file }, data, env);
  data = r.data;
  assert.equal(r.response.revision.questions.length, 3);
  assert.deepEqual(r.response.import_report, { file_questions: 3, added: 2, reused: 1 });
  assert.ok(data.bank.questions.filter(q => /Câu tệp/.test(q.question)).every(q => q.review_status === 'draft'));
  r = await api.handle('/api/revisions/import', { title: 'Đề cương nhập lại', grade: 9, questions: file }, data, env);
  assert.deepEqual(r.response.import_report, { file_questions: 3, added: 0, reused: 3 });
  assert.equal(r.data.bank.questions.length, data.bank.questions.length, 'Không thêm câu trùng');
  await assert.rejects(api.handle('/api/revisions/import', { title: 'x', grade: 9, questions: [] }, data, env), /không có câu hỏi hợp lệ/);
});

test('Lập đề cương theo số câu từng dạng từ toàn bộ ngân hàng (chưa có ma trận): 40 TN + 6 TL chia theo bài, mức độ', async () => {
  const data = workspace({ mcB1: 30, mcB2: 10, es: 8 });
  const r = await api.handle('/api/revisions/propose', { grade: 9, subject_name: 'Tin học', from_bank: true, type_counts: { MC: 40, ES: 6 }, seed: 'a' }, data, env);
  const p = r.response;
  assert.equal(p.source, 'bank');
  assert.equal(p.total, 46);
  assert.deepEqual({ MC: p.by_type.MC.selected, ES: p.by_type.ES.selected }, { MC: 40, ES: 6 });
  const cell = k => p.cells.find(c => c.lesson_code === k);
  assert.equal(cell('B1').revision_count, 30, 'Chia theo tỉ lệ câu sẵn có: B1 30/40');
  assert.equal(cell('B2').revision_count, 10);
  assert.deepEqual(p.warnings, []);
  const r2 = await api.handle('/api/revisions/propose', { grade: 9, subject_name: 'Tin học', from_bank: true, type_counts: { MC: 40, ES: 6 }, seed: 'b' }, data, env);
  assert.equal(r2.response.total, 46);
  const short = await api.handle('/api/revisions/propose', { grade: 9, subject_name: 'Tin học', from_bank: true, type_counts: { MC: 60, YN: 4 }, seed: 'c' }, data, env);
  assert.ok(short.response.warnings.some(w => /Ô B1 · trắc nghiệm · Biết thiếu 15 câu đã duyệt: cần 45, có 30/.test(w)), short.response.warnings.join('\n'));
  assert.ok(short.response.warnings.some(w => /chưa có câu đã duyệt dạng Đúng\/Sai/.test(w)));
});

test('Lập đề cương theo số câu từng dạng với ma trận đã khóa: chia đúng tỉ lệ ô; mã ngẫu nhiên khác cho bộ khác', async () => {
  const data = workspace({ mcB1: 30, mcB2: 30, es: 8 });
  const m = { id: 'M', family_id: 'F', title: 'Ma trận', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', status: 'draft', revision: 1, version: 1, mode: 'authored', profile: 'THCS',
    school_year: '2026-2027', owner_name: 'Tổ', campus: 'CT', duration: 45, total_points: 10, indicator_catalog: [], reconciliation: { confirmed: true, issues: [] },
    lessons: LESSONS.map(l => ({ lesson_code: l.lesson_code, title: l.lesson_name_source, topic: 'Chủ đề' })),
    requirements: [
      { id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'B1', competency: 'NLa', outcome_mode: 'any', ppct_outcome_index: null },
      { id: 'R2', lesson_code: 'B2', level: 'Hiểu', text: 'B2', competency: 'NLa', ppct_outcome_index: 0 },
      { id: 'R3', lesson_code: 'B3', level: 'Vận dụng', text: 'B3', competency: 'NLa', ppct_outcome_index: 0 }],
    slots: [
      ...Array.from({ length: 12 }, (_, i) => ({ id: 'A' + i, kind: 'MC', number: i + 1, scoring: { mode: 'sum_parts' }, parts: [{ id: 'PA' + i, requirement_id: 'R1', points: 0.25 }] })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 'B' + i, kind: 'MC', number: 13 + i, scoring: { mode: 'sum_parts' }, parts: [{ id: 'PB' + i, requirement_id: 'R2', points: 0.25 }] })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: 'C' + i, kind: 'ES', number: i + 1, scoring: { mode: 'sum_parts' }, parts: [{ id: 'PC' + i, requirement_id: 'R3', points: 3 }] }))] };
  data.matrices = [m];
  const locked = await api.handle('/api/matrices/lock', { id: 'M', expected_revision: 1, confirmation: { confirmed_by: 'GV', confirmed_at: '2026-11-25', external_agreement: true } }, data, env);
  const d = locked.data;
  const a = await api.handle('/api/revisions/propose', { grade: 9, exam_type: 'GK1', matrix_id: 'M', type_counts: { MC: 40, ES: 6 }, seed: 'x' }, d, env);
  const b1 = a.response.cells.find(c => c.lesson_code === 'B1'), b2 = a.response.cells.find(c => c.lesson_code === 'B2');
  assert.equal(b1.requested + b2.requested, 40);
  assert.equal(b1.requested, 30, 'Ô B1 có 12/16 vị trí trắc nghiệm → 30/40 câu');
  assert.equal(b2.requested, 10);
  assert.equal(a.response.cells.find(c => c.type === 'ES').revision_count, 6);
  const b = await api.handle('/api/revisions/propose', { grade: 9, exam_type: 'GK1', matrix_id: 'M', type_counts: { MC: 40, ES: 6 }, seed: 'y' }, d, env);
  assert.notDeepEqual([...a.response.question_ids].sort(), [...b.response.question_ids].sort(), 'Mã ngẫu nhiên khác → bộ câu khác');
});

test('Đối chiếu đề ↔ đề cương: câu nào có, câu nào chưa (nhãn theo phần), tỉ lệ theo câu, điểm, YCCĐ; chỉ đọc', async () => {
  let data = workspace({ mcB1: 6, mcB2: 0, es: 2 });
  let r = await api.handle('/api/revisions/save', { title: 'ĐC', grade: 9, question_ids: ['B1-0', 'B1-1', 'B1-2', 'ES-0'] }, data, env);
  data = r.data; const rev = r.response.revision;
  const q = id => ({ ...data.bank.questions.find(x => x.id === id) });
  const exam = { id: 'E1', title: 'Đề thử', grade: 9, subject_name: 'Tin học', revision_id: rev.id, similarity_target_percent: 90,
    questions: [{ ...q('B1-0'), slot_number: 1, points: 2 }, { ...q('B1-1'), slot_number: 2, points: 2 }, { ...q('B1-3'), slot_number: 3, points: 2 }, { ...q('ES-1'), slot_number: 1, points: 4 }] };
  // mã hoán vị: phương án đổi chỗ vẫn tính là có trong đề cương
  exam.questions[0].options = [...exam.questions[0].options].reverse(); exam.questions[0].correct = 3;
  data.exams = [exam];
  const before = JSON.stringify(data);
  r = await api.handle('/api/revisions/coverage', { revision_id: rev.id }, data, env);
  assert.equal(r.changed, false);
  assert.equal(JSON.stringify(data), before);
  const rep = r.response.reports[0];
  assert.equal(rep.total, 4);
  assert.equal(rep.in_revision, 2);
  assert.equal(rep.count_percent, 50);
  assert.equal(rep.points_percent, 40);
  assert.equal(rep.required, 4);
  assert.deepEqual(rep.items.filter(x => !x.in_revision).map(x => x.label), ['TN câu 3', 'TL câu 1']);
  assert.equal(rep.items.find(x => x.label === 'TN câu 3').outcome_in_revision, true);
  assert.equal(rep.outcome_percent, 100);
});
