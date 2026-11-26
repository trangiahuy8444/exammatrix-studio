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

test('Đưa đề cương về 90% nội dung đề: bớt đúng số câu vượt, ưu tiên câu có YCCĐ còn câu khác; đề cương khóa thì lưu phiên bản mới', async () => {
  let data = workspace({ mcB1: 20, mcB2: 0, es: 4 });
  const ids = [...Array.from({ length: 18 }, (_, i) => 'B1-' + i), 'ES-0', 'ES-1'];
  let r = await api.handle('/api/revisions/save', { title: 'ĐC', grade: 9, question_ids: [...ids, 'B1-18', 'B1-19'] }, data, env);
  data = r.data; const rev = r.response.revision;
  const q = id => ({ ...data.bank.questions.find(x => x.id === id) });
  data.exams = [{ id: 'E1', title: 'Đề 20 câu', grade: 9, subject_name: 'Tin học', revision_id: rev.id, status: 'draft', similarity_target_percent: 90, questions: ids.map((id, i) => ({ ...q(id), slot_number: i + 1, points: 0.5 })) }];
  r = await api.handle('/api/revisions/coverage', { revision_id: rev.id, exam_id: 'E1' }, data, env);
  assert.equal(r.response.reports[0].in_revision, 20);
  r = await api.handle('/api/revisions/trim-to-exam', { revision_id: rev.id, exam_id: 'E1', percent: 90 }, data, env);
  data = r.data;
  assert.equal(r.response.kept, 18);
  assert.equal(r.response.removed.length, 2);
  assert.equal(r.response.new_version, false);
  assert.ok(r.response.removed.every(x => x.outcome_still_covered), 'Không làm mất YCCĐ');
  assert.equal(r.response.revision.id, rev.id);
  assert.equal(r.response.revision.questions.length, 20, 'Đề cương còn 2 câu ngoài đề + 18 câu của đề');
  r = await api.handle('/api/revisions/coverage', { revision_id: rev.id, exam_id: 'E1' }, data, env);
  assert.equal(r.response.reports[0].in_revision, 18);
  assert.equal(r.response.reports[0].count_percent, 90);
  await assert.rejects(api.handle('/api/revisions/trim-to-exam', { revision_id: rev.id, exam_id: 'E1', percent: 90 }, data, env), /không cần thay đổi/);
  // Đề cương gắn với đề đã khóa: không sửa tại chỗ, lưu phiên bản mới.
  r = await api.handle('/api/revisions/save', { title: 'ĐC đủ', grade: 9, question_ids: ids }, data, env);
  data = r.data; const full = r.response.revision;
  data.exams[0] = { ...data.exams[0], revision_id: full.id, status: 'locked' };
  r = await api.handle('/api/revisions/trim-to-exam', { revision_id: full.id, exam_id: 'E1' }, data, env);
  assert.equal(r.response.new_version, true);
  assert.notEqual(r.response.revision.id, full.id);
  assert.equal(r.response.revision.title, 'ĐC đủ (90% đề)');
  assert.equal(r.data.revisions.find(x => x.id === full.id).questions.length, 20, 'Bản đã khóa giữ nguyên');
});

test('Tăng tỉ lệ đề cương: thêm câu của đề (kể cả bản đã trộn phương án) theo tỉ lệ riêng TN/TL; dưới 90% thì cảnh báo', async () => {
  let data = workspace({ mcB1: 20, mcB2: 0, es: 4 });
  let r = await api.handle('/api/revisions/save', { title: 'ĐC ít', grade: 9, question_ids: ['B1-0', 'B1-1'] }, data, env);
  data = r.data; const rev = r.response.revision;
  const q = id => ({ ...data.bank.questions.find(x => x.id === id) });
  const mcs = Array.from({ length: 10 }, (_, i) => ({ ...q('B1-' + i), slot_number: i + 1, points: 0.25 }));
  mcs[5].options = [...mcs[5].options].reverse(); mcs[5].correct = 3; mcs[5].id = 'B1-5-ma102';
  data.exams = [{ id: 'E2', title: 'Đề', grade: 9, subject_name: 'Tin học', revision_id: rev.id, status: 'draft', questions: [...mcs, { ...q('ES-0'), slot_number: 1, points: 3 }, { ...q('ES-1'), slot_number: 2, points: 3 }] }];
  r = await api.handle('/api/revisions/coverage', { revision_id: rev.id, exam_id: 'E2' }, data, env);
  assert.deepEqual(r.response.reports[0].by_type, { MC: { total: 10, in_revision: 2, percent: 20 }, ES: { total: 2, in_revision: 0, percent: 0 } });
  r = await api.handle('/api/revisions/align-to-exam', { revision_id: rev.id, exam_id: 'E2', targets: { MC: 90, ES: 50 } }, data, env);
  data = r.data;
  assert.deepEqual([r.response.by_type.MC.wanted, r.response.by_type.MC.after], [9, 9]);
  assert.deepEqual([r.response.by_type.ES.wanted, r.response.by_type.ES.after], [1, 1]);
  assert.ok(r.response.added.some(x => x.id === 'B1-5'), 'Câu đã trộn phương án được thêm bằng câu gốc trong Ngân hàng');
  assert.ok(r.response.warnings.some(w => /dưới mức 90%/.test(w)), 'Tỉ lệ chung 10/12 = 83,3% < 90% thì cảnh báo');
  r = await api.handle('/api/revisions/coverage', { revision_id: rev.id, exam_id: 'E2' }, data, env);
  assert.equal(r.response.reports[0].in_revision, 10);
  assert.equal(r.response.reports[0].by_type.MC.in_revision, 9);
});

test('Áp dụng tỉ lệ chung (VD: 27/31 câu · TN 85%, TL 100%) cho tất cả các đề liên kết và đồng bộ kiểm tra đối chiếu', async () => {
  let data = workspace({ mcB1: 40, mcB2: 20, es: 6 });
  const q = id => ({ ...data.bank.questions.find(x => x.id === id) });
  // Tạo đề cương ban đầu chỉ có ít câu để kiểm tra bước tự bổ sung đồng loạt
  let r = await api.handle('/api/revisions/save', { title: 'ĐC chung', grade: 9, question_ids: ['B1-0', 'ES-0'] }, data, env);
  data = r.data; const rev = r.response.revision;
  // Hai đề liên kết cùng có 28 MC + 3 ES = 31 câu
  const makeExam = (id, code, mcOffset) => ({
    id, title: `Đề ${code}`, grade: 9, subject_name: 'Tin học', exam_code: code,
    revision_id: rev.id, status: 'drafting', similarity_target_percent: 90,
    questions: [
      ...Array.from({ length: 28 }, (_, i) => ({ ...q('B1-' + (mcOffset + i)), slot_number: i + 1, points: 0.25 })),
      ...Array.from({ length: 3 }, (_, i) => ({ ...q('ES-' + i), slot_number: i + 1, points: 1 }))
    ]
  });
  data.exams = [makeExam('E1', '101', 0), makeExam('E2', '102', 10)];

  r = await api.handle('/api/revisions/align-to-exam', {
    revision_id: rev.id, exam_id: 'E1', targets: { MC: 85, ES: 100 }, apply_to_linked: true
  }, data, env);
  data = r.data;
  assert.deepEqual(r.response.coverage_targets, { MC: 85, ES: 100 });
  assert.deepEqual(r.response.revision.coverage_targets, { MC: 85, ES: 100 });
  assert.ok(r.response.warnings.some(w => /dưới mức.*90%/.test(w)), '27/31 = 87,1% < 90% thì cảnh báo để giáo viên biết');
  assert.equal(r.response.linked_count, 2);
  assert.equal(r.response.exam_reports.length, 2);
  for (const rep of r.response.exam_reports) {
    assert.equal(rep.total, 31);
    assert.equal(rep.in_revision, 27);
    assert.equal(rep.required, 27);
    assert.equal(rep.types_ok, true);
    assert.equal(rep.by_type.MC.in_revision, 24);
    assert.equal(rep.by_type.ES.in_revision, 3);
    assert.equal(rep.by_type.ES.percent, 100);
  }

  const cov = await api.handle('/api/revisions/coverage', { revision_id: r.response.revision.id }, data, env);
  assert.equal(cov.response.reports.length, 2);
  for (const rep of cov.response.reports) {
    assert.equal(rep.in_revision, 27);
    assert.equal(rep.required, 27);
    assert.equal(rep.types_ok, true);
  }
});

test('Tạo bộ đề mới kế thừa tỉ lệ từng dạng (coverage_targets) từ đề cương liên kết (100% TL, 85% TN)', async () => {
  let data = workspace({ mcB1: 35, mcB2: 20, es: 6 });
  const m = {
    id: 'M-SHARED', family_id: 'F-SHARED', title: 'Ma trận 31 câu', grade: 9, subject_name: 'Tin học', exam_type: 'CK1',
    status: 'draft', revision: 1, version: 1, mode: 'authored', profile: 'THCS', school_year: '2026-2027',
    owner_name: 'Tổ', campus: 'CT', duration: 45, total_points: 10, indicator_catalog: [],
    reconciliation: { confirmed: true, issues: [] },
    lessons: LESSONS.map(l => ({ lesson_code: l.lesson_code, title: l.lesson_name_source, topic: 'Chủ đề' })),
    requirements: [
      { id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'B1', competency: 'NLa', outcome_mode: 'any', ppct_outcome_index: null },
      { id: 'R2', lesson_code: 'B3', level: 'Vận dụng', text: 'B3', competency: 'NLa', outcome_mode: 'any', ppct_outcome_index: null }
    ],
    slots: [
      ...Array.from({ length: 28 }, (_, i) => ({ id: 'MC' + i, kind: 'MC', number: i + 1, scoring: { mode: 'sum_parts' }, parts: [{ id: 'PMC' + i, requirement_id: 'R1', points: 0.25 }] })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: 'ES' + i, kind: 'ES', number: i + 1, scoring: { mode: 'sum_parts' }, parts: [{ id: 'PES' + i, requirement_id: 'R2', points: 1 }] }))
    ]
  };
  data.matrices = [m];
  data = (await api.handle('/api/matrices/lock', { id: 'M-SHARED', expected_revision: 1, confirmation: { confirmed_by: 'GV', confirmed_at: '2026-11-25', external_agreement: true } }, data, env)).data;
  const revIds = [...Array.from({ length: 24 }, (_, i) => 'B1-' + i), 'ES-0', 'ES-1', 'ES-2'];
  const savedRevRes = await api.handle('/api/revisions/save', {
    title: 'ĐC chuẩn 27/31', grade: 9, question_ids: revIds, similarity_target_percent: 87, coverage_targets: { MC: 85, ES: 100 }
  }, data, env);
  data = savedRevRes.data;
  const rev = savedRevRes.response.revision;

  const setRes = await api.handle('/api/exams/generate-set', {
    title: 'CK1 Tin 9', grade: 9, exam_type: 'CK1', matrix_id: 'M-SHARED',
    revision_id: rev.id, exam_count: 2, flexible: true, similarity_percent: 87, similarity_mode: 'exact', seed: 'ck1'
  }, data, env);
  assert.equal(setRes.response.exams.length, 2);
  for (const ex of setRes.response.exams) {
    assert.deepEqual(ex.coverage_targets, { MC: 85, ES: 100 });
    const cov = engine.revisionCoverage(ex, rev, data.bank.ppct);
    assert.equal(cov.by_type.ES.in_revision, 3, '100% câu Tự luận nằm trong đề cương');
    assert.equal(cov.by_type.ES.percent, 100);
    assert.equal(cov.in_revision, 27, 'Tổng 27/31 câu nằm trong đề cương');
  }
});

test('3 đề liên kết giao nhau (Mã 101, 102, 103 · 31 câu): giải chính xác về 28/31 (TN 25/28, TL 3/3) và đạt kiểm định', async () => {
  const KR = require('../public/knowledge-rules.js');
  let data = workspace({ mcB1: 42, mcB2: 0, es: 4 });
  const q = id => ({ ...data.bank.questions.find(x => x.id === id) });
  // Tạo đề cương ban đầu chứa tất cả câu (31+) để tái hiện tình huống phải CẮT bớt đồng bộ trên 3 đề giao nhau.
  const allIds = data.bank.questions.map(x => x.id);
  let r = await api.handle('/api/revisions/save', { title: 'ĐC CK1 K9', grade: 9, question_ids: allIds }, data, env);
  data = r.data; const rev = r.response.revision;
  const pick28 = (offset) => Array.from({ length: 28 }, (_, i) => ({ ...q('B1-' + ((offset + i) % 42)), slot_number: i + 1, points: 0.25 }));
  const threeEs = () => Array.from({ length: 3 }, (_, i) => ({ ...q('ES-' + i), slot_number: i + 1, points: 1 }));
  data.exams = [
    { id: 'EX101', title: 'CK1 · Mã 101', grade: 9, subject_name: 'Tin học', exam_code: '101', revision_id: rev.id, status: 'drafting', similarity_target_percent: 90, questions: [...pick28(0), ...threeEs()] },
    { id: 'EX102', title: 'CK1 · Mã 102', grade: 9, subject_name: 'Tin học', exam_code: '102', revision_id: rev.id, status: 'drafting', similarity_target_percent: 90, questions: [...pick28(7), ...threeEs()] },
    { id: 'EX103', title: 'CK1 · Mã 103', grade: 9, subject_name: 'Tin học', exam_code: '103', revision_id: rev.id, status: 'drafting', similarity_target_percent: 90, questions: [...pick28(14), ...threeEs()] }
  ];

  r = await api.handle('/api/revisions/align-to-exam', {
    revision_id: rev.id, exam_id: 'EX101', overall_percent: 90, targets: { MC: 90, ES: 100 }, apply_to_linked: true
  }, data, env);
  data = r.data;
  assert.equal(r.response.warnings.length, 0, JSON.stringify(r.response.warnings));
  assert.equal(r.response.revision.similarity_target_percent, 90);
  assert.equal(r.response.revision.overall_target_percent, 90);
  assert.equal(r.response.exam_reports.length, 3);
  for (const rep of r.response.exam_reports) {
    assert.equal(rep.total, 31);
    assert.equal(rep.in_revision, 28, `${rep.exam_code} phải đúng 28/31 (tối thiểu 90%, làm tròn lên)`);
    assert.equal(rep.required, 28);
    assert.equal(rep.by_type.MC.in_revision, 25, `${rep.exam_code} TN phải đúng 25/28`);
    assert.equal(rep.by_type.ES.in_revision, 3, `${rep.exam_code} TL phải đủ 3/3`);
    assert.equal(rep.types_ok, true);
  }
  const verify = await api.handle('/api/exams/verify', { id: 'EX101' }, data, env);
  const revErrors = verify.response.verification.errors.filter(e => ['revision', 'revision_criterion', 'similarity'].includes(e.code));
  assert.deepEqual(revErrors, []);
  const krRes = KR.checkExam(data, data.exams[0]);
  assert.deepEqual(krRes.errors.filter(e => e.code === 'revision_criterion'), []);

  // Chỉnh tay trực tiếp type_counts: 24/28 TN + 3/3 TL -> cả 3 đề về 27/31, có cảnh báo < 90%, nhưng verifyExam/KR vẫn giữ chuẩn duyệt 90%.
  r = await api.handle('/api/revisions/align-to-exam', {
    revision_id: rev.id, exam_id: 'EX101', type_counts: { MC: 24, ES: 3 }, apply_to_linked: true
  }, data, env);
  assert.deepEqual(r.response.coverage_counts, { MC: 24, ES: 3 });
  assert.ok(r.response.warnings.some(w => /dưới mức quy định tối thiểu 90%/.test(w)));
  for (const rep of r.response.exam_reports) {
    assert.equal(rep.in_revision, 27);
    assert.equal(rep.by_type.MC.in_revision, 24);
    assert.equal(rep.by_type.ES.in_revision, 3);
  }
  const verifyUnder = await api.handle('/api/exams/verify', { id: 'EX101' }, r.data, env);
  const krUnder = KR.checkExam(r.data, r.data.exams[0]);
  const hasRevCritVerify = verifyUnder.response.verification.errors.some(e => e.code === 'revision_criterion');
  const hasRevCritKr = krUnder.errors.some(e => e.code === 'revision_criterion');
  assert.equal(hasRevCritVerify, true);
  assert.equal(hasRevCritKr, true);
});

test('revisionCoverage tra ve vi tri trong de & de cuong, option_map va tom tat so sanh truc quan', () => {
  const mkMc = (id, text, options, correct, lesson = 'B1', level = 'Biết') => ({
    id, grade: 9, subject_name: 'Tin học', type: 'MC', lesson_code: lesson, level,
    learning_outcome: 'YCCĐ ' + lesson, review_status: 'approved', question: text, options, correct, points: 0.25
  });
  const mkEs = (id, text, lesson = 'B1') => ({
    id, grade: 9, subject_name: 'Tin học', type: 'ES', lesson_code: lesson, level: 'Vận dụng',
    learning_outcome: 'YCCĐ ' + lesson, review_status: 'approved', question: text,
    rubric: [{ criterion: 'Ý 1', points: 0.5 }, { criterion: 'Ý 2', points: 0.5 }], points: 1
  });
  const rev = {
    id: 'REV-VIS',
    title: 'ĐC CK1 K9',
    grade: 9,
    questions: [
      mkMc('R1', 'Câu 1 đề cương giữ nguyên', ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'], 0),
      mkMc('R2', 'Câu 2 đề cương trộn phương án', ['Lựa 1', 'Lựa 2', 'Lựa 3', 'Lựa 4'], 1),
      mkMc('R3', 'Câu 3 cùng lời dẫn khác đáp án', ['Cũ 1', 'Cũ 2', 'Cũ 3', 'Cũ 4'], 0),
      mkEs('R4', 'Câu tự luận trong đề cương', 'B2')
    ]
  };
  const exam = {
    id: 'EX-VIS',
    title: 'Đề CK1',
    exam_code: '101',
    grade: 9,
    questions: [
      mkMc('E1', 'Câu 1 đề cương giữ nguyên', ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'], 0),
      mkMc('E2', 'Câu 2 đề cương trộn phương án', ['Lựa 4', 'Lựa 1', 'Lựa 2', 'Lựa 3'], 2),
      mkMc('E3', 'Câu 3 cùng lời dẫn khác đáp án', ['Mới 1', 'Mới 2', 'Mới 3', 'Mới 4'], 1),
      mkMc('E4', 'Câu mới hoàn toàn ngoài đề cương', ['X1', 'X2', 'X3', 'X4'], 0),
      mkEs('E5', 'Câu tự luận trong đề cương', 'B2')
    ]
  };
  const rep = engine.revisionCoverage(exam, rev);
  assert.equal(rep.revision_total, 4);
  assert.deepEqual(rep.match_summary, { exact: 2, shuffled: 1, similar: 1, outside: 1 });
  assert.equal(rep.items[0].match_type, 'exact');
  assert.equal(rep.items[0].revision_label, 'TN câu 1');
  assert.equal(rep.items[0].option_map[0].revision_index, 0);
  assert.equal(rep.items[1].match_type, 'shuffled');
  assert.equal(rep.items[1].in_revision, true);
  assert.equal(rep.items[1].revision_label, 'TN câu 2');
  assert.equal(rep.items[1].option_map[0].revision_index, 3); // Lựa 4 -> idx 3 ở đề cương
  assert.equal(rep.items[1].option_map[2].revision_index, 1); // Đáp án đúng Lựa 2 -> idx 1 ở đề cương
  assert.equal(rep.items[1].option_map[2].same_correct, true);
  assert.equal(rep.items[2].match_type, 'similar');
  assert.equal(rep.items[2].in_revision, false);
  assert.equal(rep.items[2].similar_text, true);
  assert.equal(rep.items[2].revision_label, 'TN câu 3');
  assert.equal(rep.items[3].match_type, 'outside');
  assert.equal(rep.items[3].revision_label, null);
  assert.equal(rep.items[3].revision_detail, null);
  assert.equal(rep.items[4].match_type, 'exact');
  assert.equal(rep.items[4].revision_label, 'TL câu 1');
  assert.equal(rep.items[4].revision_detail.rubric.length, 2);
});

test('/api/matrices/delete cho phep xoa ma tran da khoa khi chua co de lien ket va bao ro ten de neu con lien ket', async () => {
  let data = workspace({ mcB1: 5, mcB2: 0, es: 0 });
  data.matrices = [
    { id: 'MX-LOCKED-UNUSED', title: 'Ma trận CK1 chưa tạo đề', grade: 8, subject_name: 'Tin học', status: 'locked', slots: [] },
    { id: 'MX-LOCKED-USED', title: 'Ma trận CK1 đã gắn đề', grade: 8, subject_name: 'Tin học', status: 'locked', slots: [] }
  ];
  data.exams = [
    { id: 'EX-LINKED', title: 'Đề CK1 Tin 8 · Mã 101', exam_code: '101', grade: 8, subject_name: 'Tin học', matrix_id: 'MX-LOCKED-USED' }
  ];

  // Ma trận đang khóa nhưng chưa có đề thi nào dùng -> xóa thành công
  const rOk = await api.handle('/api/matrices/delete', { id: 'MX-LOCKED-UNUSED' }, data, env);
  assert.equal(rOk.response.success, true);
  assert.equal(rOk.data.matrices.some(m => m.id === 'MX-LOCKED-UNUSED'), false);

  // Ma trận đang gắn với đề EX-LINKED -> bị chặn 409 kèm tên đề cụ thể
  await assert.rejects(
    api.handle('/api/matrices/delete', { id: 'MX-LOCKED-USED' }, rOk.data, env),
    err => err.status === 409 && /1 đề kiểm tra.*Đề CK1 Tin 8/.test(err.message)
  );
});

test('Quy trinh linh hoat: tao de truoc khong can de cuong -> /api/revisions/from-exam -> kiem dinh dat 100% YCCD & >= 90%', async () => {
  const KR = require('../public/knowledge-rules.js');
  const { fixture } = require('./static_api.test.cjs');
  let data = fixture();
  let r = await api.handle('/api/matrices/lock', {
    id: 'M1',
    expected_revision: 1,
    confirmation: { confirmed_by: 'GV', confirmed_at: '2026-11-26', external_agreement: true }
  }, data, env);
  data = r.data;

  // 1. Tạo đề trước mà CHƯA có đề cương nào (revision_id: null) -> hoàn toàn cho phép!
  const gen = await api.handle('/api/exams/generate', {
    title: 'Đề GK1 · Tin 9 (tạo trước)',
    grade: 9,
    subject_name: 'Tin học',
    exam_type: 'GK1',
    duration: 45,
    matrix_id: 'M1',
    revision_id: null,
    seed: 'flex-rev-test'
  }, data, env);
  data = gen.data;
  const exBefore = gen.response.exam;
  assert.equal(exBefore.revision_id, null);

  // Khi chưa gắn đề cương: verifyExam chỉ báo mã `revision` (không đổ hàng loạt câu vào coverage.missing hay lặp `revision_criterion`)
  const vBefore = engine.verifyExam(data, exBefore);
  assert.equal(vBefore.passed, false);
  assert.deepEqual(vBefore.errors.map(e => e.code), ['revision']);
  assert.deepEqual(vBefore.revision_criterion.coverage.missing, []);

  // 2. Bấm tạo & gắn Đề cương từ chính đề vừa tạo (90%)
  const revRes = await api.handle('/api/revisions/from-exam', {
    exam_id: exBefore.id,
    title: 'Đề cương GK1 Tin 9 (rút từ đề)',
    percent: 90
  }, data, env);
  data = revRes.data;
  const rev = revRes.response.revision;
  const exAfter = revRes.response.exam;
  assert.ok(rev.id);
  assert.equal(exAfter.revision_id, rev.id);
  assert.equal(exAfter.verification.passed, true, JSON.stringify(exAfter.verification.errors));
  assert.equal(exAfter.verification.revision_criterion.coverage.ok, true);
  assert.ok(exAfter.revision_match_count >= exAfter.revision_required_count);

  const krAfter = KR.checkExam(data, exAfter);
  assert.equal(krAfter.passed, true, JSON.stringify(krAfter.errors));
});
