'use strict';
// Kho luật nắm quyền chặn duyệt (25/11/2026): kết quả thủ tục của engine vào kho luật thành sự kiện; ngưỡng của tổ;
// phân tầng phủ định; báo khi chạm giới hạn suy diễn; tuần kiểm tra; đối chiếu với kiểm định cũ.
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../public/static-api.js');
const engine = require('../public/static-exam-engine.js');
const workflow = require('../public/static-exam-workflow.js');
const KR = require('../public/knowledge-rules.js');
const { fixture } = require('./static_api.test.cjs');
const env = { engine, workflow, subject: 'Tin học', actor: 'Giáo viên minh họa' };

async function generated(extra = {}, mutate) {
  let data = fixture();
  if (mutate) mutate(data);
  let r = await api.handle('/api/matrices/lock', { id: 'M1', expected_revision: 1, confirmation: { confirmed_by: 'GV', confirmed_at: '2026-11-25', external_agreement: true } }, data, env); data = r.data;
  r = await api.handle('/api/revisions/save', { title: 'ĐC', grade: 9, question_ids: ['Q1', 'Q2', 'Q3', 'Q4'] }, data, env); data = r.data;
  r = await api.handle('/api/exams/generate', { title: 'Đề', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', duration: 45, matrix_id: 'M1', revision_id: r.response.revision.id, seed: 's', ...extra }, data, env);
  return { data: r.data, exam: r.response.exam };
}

test('Kho luật quyết định: đề đạt thì duyệt được; kết luận khớp kiểm định cũ', async () => {
  const { data, exam } = await generated();
  assert.equal(exam.verification.decision, 'kho_luat');
  assert.equal(exam.verification.passed, true);
  assert.equal(exam.verification.parity, true);
  let r = await api.handle('/api/exams/transition', { id: exam.id, action: 'submit' }, data, env);
  r = await api.handle('/api/exams/transition', { id: exam.id, action: 'approve' }, r.data, env);
  assert.equal(r.response.exam.status, 'locked');
});

test('Lỗi tính bằng thủ tục (bản chụp bị sửa) thành vi phạm của kho luật, có căn cứ và giải thích; chặn duyệt', async () => {
  const { data, exam } = await generated();
  data.exams[0].questions[0].question = 'Sửa lén nội dung?';
  await assert.rejects(api.handle('/api/exams/transition', { id: exam.id, action: 'submit' }, data, env), /chưa đạt kiểm định/);
  const k = KR.checkExam(data, data.exams[0], { procedural: engine.verifyExam(data, data.exams[0]).errors });
  const snap = k.errors.find(e => e.rule === 'R-BAN-CHUP');
  assert.ok(snap, 'Có vi phạm R-BAN-CHUP');
  assert.equal(snap.code, 'snapshot', 'Giữ mã lỗi cũ cho luồng đang đọc mã');
  assert.match(snap.explanation, /căn cứ: Bất biến nghiệp vụ/);
});

test('Ngưỡng của tổ: thời gian kiểm tra định kì và tỉ lệ đề cương tối thiểu đọc từ cấu hình; tỉ lệ không dưới 90%', () => {
  const exam = { id: 'E', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', duration: 45, questions: [] };
  const w60 = KR.checkExam({}, exam, { revision: null, config: { thoi_gian_dinh_ki_phut: 60 } }).warnings.find(w => w.rule === 'W-THOI-GIAN');
  assert.match(w60.message, /60 phút \(ngưỡng của tổ\), đề đang ghi 45 phút/);
  assert.equal(KR.checkExam({}, exam, { revision: null }).warnings.some(w => w.rule === 'W-THOI-GIAN'), false, 'Mặc định 45 phút: không cảnh báo');
  assert.deepEqual(KR.normalizeConfig({ de_cuong_min_percent: 70, thoi_gian_dinh_ki_phut: 5 }), { de_cuong_min_percent: 90, thoi_gian_dinh_ki_phut: 15 });
  const facts = KR.examFacts({ ...exam, questions: Array.from({ length: 20 }, (_, i) => ({ id: 'q' + i, type: 'MC', question: 'c' + i, points: 0.5 })) }, { revision: { questions: [] }, config: { de_cuong_min_percent: 95 } });
  assert.deepEqual(facts.find(f => f[1] === 'so_cau_can_tu_de_cuong'), ['de:E', 'so_cau_can_tu_de_cuong', 19]);
});

test('Phân tầng phủ định: luật suy ra dựa vào phủ định của chính nó bị từ chối; chạm giới hạn suy diễn thì cảnh báo', () => {
  assert.throws(() => KR.stratify([{ id: 'X', neu: [['?a', 'la', 'p'], { khong: ['?a', 'nhan', 'q'] }], thi: [['?a', 'nhan', 'q']] }]), /phủ định vòng/);
  const strata = KR.stratify([
    { id: 'A', neu: [['?x', 'co', 'y']], thi: [['?x', 'la', 'ung_vien']] },
    { id: 'B', neu: [['?x', 'la', 'ung_vien'], { khong: ['?x', 'bi_loai', true] }], thi: [['?x', 'duoc_chon', true]] },
    { id: 'C', neu: [['?x', 'co', 'z']], thi: [['?x', 'bi_loai', true]] }]);
  assert.ok(strata.findIndex(l => l.some(r => r.id === 'B')) > strata.findIndex(l => l.some(r => r.id === 'C')), 'Luật dùng phủ định chạy sau luật suy ra vị từ đó');
  const chain = Array.from({ length: 6 }, (_, i) => ['n' + i, 'ke', 'n' + (i + 1)]);
  const res = KR.infer([...chain, ['n0', 'toi', 'n1']], [{ id: 'T', neu: [['?a', 'toi', '?b'], ['?b', 'ke', '?c']], thi: [['?a', 'toi', '?c']] }], { maxRounds: 2 });
  assert.equal(res.truncated, true);
  assert.ok(res.findings.some(f => f.rule === 'W-GIOI-HAN-SUY-DIEN'));
  assert.doesNotThrow(() => KR.stratify(KR.RULES), 'Kho luật hiện tại phân tầng được');
});

test('Tuần kiểm tra gửi kèm khi tạo đề được ghi vào đề; câu thuộc bài học sau tuần đó bị cảnh báo', async () => {
  const { exam } = await generated({ scope_week: 3 }, d => { d.bank.ppct.lessons[0].week_raw = 'Tuần 5'; });
  assert.equal(exam.scope_week, 3);
  assert.ok(exam.verification.warnings.some(w => w.rule === 'W-NGOAI-PHAM-VI'), JSON.stringify(exam.verification.warnings.map(w => w.rule)));
});

test('Đối chiếu kho luật với kiểm định cũ trên mọi đề của khối (chỉ đọc)', async () => {
  const { data } = await generated();
  const before = JSON.stringify(data);
  const r = await api.handle('/api/knowledge/parity', { grade: 9 }, data, env);
  assert.equal(r.changed, false);
  assert.equal(JSON.stringify(data), before);
  assert.equal(r.response.total, 1);
  assert.equal(r.response.mismatched, 0);
  assert.deepEqual(r.response.rows[0].only_rules, []);
});
