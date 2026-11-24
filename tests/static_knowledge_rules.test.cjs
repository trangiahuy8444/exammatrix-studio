'use strict';
// Kho luật + suy diễn tiến + giải thích (Giai đoạn 2). Chạy song song với static-exam-engine.verifyExam:
// kết luận đạt/không đạt phải khớp mã cũ trên các đề mẫu; giải thích phải chỉ đúng câu và căn cứ.
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../public/static-api.js');
const engine = require('../public/static-exam-engine.js');
const workflow = require('../public/static-exam-workflow.js');
const KR = require('../public/knowledge-rules.js');
const { fixture } = require('./static_api.test.cjs');

const env = { engine, workflow, subject: 'Tin học', actor: 'Giáo viên minh họa' };
const LOCK = { id: 'M1', expected_revision: 1, confirmation: { confirmed_by: 'GV', confirmed_at: '2026-11-24', external_agreement: true } };

async function generated() {
  let data = fixture();
  data = (await api.handle('/api/matrices/lock', LOCK, data, env)).data;
  let r = await api.handle('/api/revisions/save', { title: 'Đề cương mẫu', grade: 9, question_ids: ['Q1', 'Q2', 'Q3', 'Q4'] }, data, env);
  data = r.data;
  r = await api.handle('/api/exams/generate', { title: 'Đề mẫu', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', duration: 45, matrix_id: 'M1', revision_id: r.response.revision.id, seed: 'kg' }, data, env);
  return { data: r.data, exam: JSON.parse(JSON.stringify(r.response.exam)) };
}

const rulesOf = (report) => report.errors.map(e => e.rule).sort();

test('Đề hợp lệ: kho luật và verifyExam cùng kết luận đạt', async () => {
  const { data, exam } = await generated();
  assert.equal(engine.verifyExam(data, exam).passed, true);
  const kr = KR.checkExam(data, exam);
  assert.equal(kr.passed, true, JSON.stringify(kr.errors, null, 2));
  assert.ok(kr.derived_count > 0, 'Phải có sự kiện suy ra (cấp học, định kì…)');
});

const MUTATIONS = [
  ['tổng điểm khác 10', e => { e.questions[0].points = 3; }, 'R-TONG-10', /Tổng điểm của đề là 8/],
  ['câu chưa duyệt', e => { e.questions[1].review_status = 'draft'; }, 'R-CHUA-DUYET', /Câu 2 chưa được duyệt/],
  ['câu trùng nội dung', e => { e.questions[1] = { ...e.questions[0], id: 'Q-CHEP', slot_number: 2 }; }, 'R-TRUNG', /Câu 2 trùng nội dung với câu 1/],
  ['câu khác khối', e => { e.questions[0].grade = 8; }, 'R-KHAC-KHOI', /Câu 1 thuộc Khối 8/],
  ['dạng câu không được dùng (Đúng/Sai ở THCS)', e => { e.questions[0].type = 'YN'; }, 'R-DANG-CAU', /Câu 1 là dạng YN/],
  ['bài ngoài PPCT', e => { e.questions[0].lesson_code = 'B99'; }, 'R-NGOAI-PPCT', /bài “B99” không có trong PPCT/],
  ['YCCĐ không có trong PPCT', e => { e.questions[0].learning_outcome = 'Một YCCĐ bịa ra'; }, 'R-NGOAI-YCCD', /không khớp YCCĐ nào của bài B1/],
  ['chưa gắn đề cương', e => { e.revision_id = null; e.revision_snapshot = null; }, 'R-CHUA-DE-CUONG', /chưa gắn đề cương/]
];

for (const [label, mutate, rule, pattern] of MUTATIONS) {
  test('Đề lỗi (' + label + '): cả hai cùng chặn, kho luật chỉ đúng câu và có căn cứ', async () => {
    const { data, exam } = await generated();
    mutate(exam);
    assert.equal(engine.verifyExam(data, exam).passed, false, 'Mã cũ phải chặn');
    const kr = KR.checkExam(data, exam, label === 'chưa gắn đề cương' ? { revision: null } : {});
    assert.equal(kr.passed, false, 'Kho luật phải chặn');
    const hit = kr.errors.find(e => e.rule === rule);
    assert.ok(hit, `Thiếu luật ${rule}; có: ${rulesOf(kr)}`);
    assert.match(hit.message, pattern);
    assert.ok(hit.can_cu.length > 0, 'Mỗi lỗi phải kèm căn cứ');
    assert.match(hit.explanation, /căn cứ:/);
  });
}

test('Suy diễn tiến nhiều bước: THPT không khai dạng câu -> suy ra cấp học -> suy ra dạng được dùng', () => {
  const exam = { id: 'X', grade: 10, subject_name: 'Tin học', exam_type: 'GK1', duration: 45, questions: [
    { id: 'a', grade: 10, subject_name: 'Tin học', type: 'YN', review_status: 'approved', points: 10, lesson_code: 'B1', learning_outcome: 'x' }
  ] };
  const ok = KR.checkExam({}, exam, { revision: null, ppct: { lessons: [] } });
  assert.ok(!ok.errors.some(e => e.rule === 'R-DANG-CAU'), 'THPT được dùng Đúng/Sai');
  const thcs = KR.checkExam({}, { ...exam, grade: 8, questions: [{ ...exam.questions[0], grade: 8 }] }, { revision: null, ppct: { lessons: [] } });
  const hit = thcs.errors.find(e => e.rule === 'R-DANG-CAU');
  assert.ok(hit);
  assert.match(hit.explanation, /D-DANG-THCS/, 'Giải thích phải nêu luật suy ra trung gian');
  assert.match(hit.explanation, /được dùng dạng|thuộc cấp/);
});

test('Cảnh báo thời gian 45 phút cho đề định kì Tin học (TT 22/2021 Điều 7)', async () => {
  const { data, exam } = await generated();
  exam.duration = 60;
  const kr = KR.checkExam(data, exam);
  const w = kr.warnings.find(x => x.rule === 'W-THOI-GIAN');
  assert.ok(w);
  assert.match(w.can_cu.join(' '), /Điều 7, khoản 1/);
});

test('Tỉ lệ đề cương: thiếu câu từ đề cương thì báo đúng số câu', async () => {
  const { data, exam } = await generated();
  const rev = JSON.parse(JSON.stringify(exam.revision_snapshot));
  rev.questions = rev.questions.filter(q => q.id !== exam.questions[0].id && q.id !== exam.questions[1].id);
  rev.questions.push({ ...exam.questions[0], id: 'KHAC', question: 'Câu khác hẳn' });
  const kr = KR.checkExam(data, exam, { revision: rev });
  const hit = kr.errors.find(e => e.rule === 'R-TI-LE-DE-CUONG');
  assert.ok(hit, rulesOf(kr).join(','));
  assert.match(hit.message, /Mới có 0\/2 câu lấy từ đề cương; cần ít nhất 2 câu/);
});

test('Mỗi luật đều có căn cứ và danh sách luật đọc được', () => {
  for (const r of KR.describeRules()) {
    if (r.loai === 'suy_ra' && !['D-DANG-THCS', 'D-DANG-THPT'].includes(r.id)) continue;
    assert.ok(r.can_cu.length > 0, 'Luật ' + r.id + ' thiếu căn cứ');
  }
  assert.ok(KR.describeRules().length >= 15);
});

test('Bộ máy suy diễn: mẫu phủ định, biến dùng chung và điểm bất động', () => {
  const rules = [
    { id: 'A', neu: [['?x', 'cha', '?y']], thi: [['?x', 'to_tien', '?y']] },
    { id: 'B', neu: [['?x', 'to_tien', '?y'], ['?y', 'to_tien', '?z']], thi: [['?x', 'to_tien', '?z']] },
    { id: 'C', muc: 'canh_bao', neu: [['?x', 'la', 'nguoi'], { khong: ['?x', 'cha', '?y'] }], vi_pham: '{?x} không có thông tin cha' }
  ];
  const r = KR.infer([['an', 'cha', 'binh'], ['binh', 'cha', 'cuong'], ['cuong', 'cha', 'dung'], ['dung', 'la', 'nguoi'], ['an', 'la', 'nguoi']], rules);
  const has = f => r.facts.some(x => JSON.stringify(x) === JSON.stringify(f));
  assert.ok(has(['an', 'to_tien', 'dung']), 'Bắc cầu qua 3 bước');
  assert.deepEqual(r.findings.map(f => f.message), ['dung không có thông tin cha']);
});

test('API: kiểm định đề gắn báo cáo kho luật; các API tri thức chỉ đọc, không ghi dữ liệu', async () => {
  const { data, exam } = await generated();
  const verified = await api.handle('/api/exams/verify', { id: exam.id }, data, env);
  assert.equal(verified.response.verification.passed, true);
  assert.equal(verified.response.verification.knowledge.passed, true);
  const overview = await api.handle('/api/knowledge/overview', { grade: 9 }, data, env);
  assert.equal(overview.changed, false);
  assert.ok(overview.response.summary.total_nodes > 0);
  assert.ok(Array.isArray(overview.response.coverage) && overview.response.coverage.length === 1);
  const ctx = await api.handle('/api/knowledge/lesson-context', { grade: 9, lesson_code: 'B1' }, data, env);
  assert.deepEqual(ctx.response.context.outcomes.map(o => o.text), ['Nhận biết dữ liệu']);
  await assert.rejects(api.handle('/api/knowledge/lesson-context', { grade: 9, lesson_code: 'B99' }, data, env));
  const rules = await api.handle('/api/knowledge/rules', {}, data, env);
  assert.ok(rules.response.rules.some(r => r.id === 'R-TONG-10'));
  const check = await api.handle('/api/knowledge/check-exam', { id: exam.id, scope_week: 5 }, data, env);
  assert.equal(check.changed, false);
  assert.equal(check.response.report.passed, true);
});
