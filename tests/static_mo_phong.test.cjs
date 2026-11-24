'use strict';
// Mô phỏng giáo viên chạy trọn quy trình bản Pages (acceptance/2026-11-24-mo-phong-9-mon/mo-phong.cjs)
// cho một tài khoản THCS và một THPT, cả đường đi chuẩn lẫn tình huống lộn xộn; kèm các ca chống tái phát
// của lỗi tìm được khi mô phỏng 9 môn (24/11/2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../acceptance/2026-11-24-mo-phong-9-mon/mo-phong.cjs');

for (const subject of ['Tin học', 'Vật lí']) {
  test(`Mô phỏng giáo viên ${subject}: quy trình chuẩn và tình huống lộn xộn đều đúng`, async () => {
    const a = M.ACCOUNTS.find(x => x.subject === subject);
    const results = [];
    await M.runAccount({ ...a, uid: a.uid + '-ci' }, results);
    await M.runMessy({ ...a, uid: a.uid + '-ci' }, results);
    for (const r of results) {
      const bad = r.steps.filter(s => !s.ok);
      assert.deepEqual(bad.map(s => `${s.step}: ${s.detail}`), [], r.account.name);
    }
  });
}

async function account(uid) {
  const a = { ...M.ACCOUNTS[0], uid };
  const t = M.openTab(a);
  await t.window.FirebaseClient.loadFromCloudV2(t.window.FirebaseState.user, { db: M.firestore.db, helpers: M.firestore.helpers });
  const lessons = M.ppctLessons(a);
  for (const l of lessons) await t.call('/api/ppct/save-lesson', { lesson: l });
  return { a, t, lessons };
}

test('Nhập câu cho khối chưa có PPCT: bị chặn, nêu rõ cần nhập PPCT trước', async () => {
  const { a, t, lessons } = await account('fix-import-grade');
  const q = { ...M.bankQuestions(a, lessons)[0], grade: a.grade + 1 };
  await assert.rejects(t.call('/api/bank/import', { mode: 'append', questions: [q], grade: q.grade }),
    err => /chưa hợp lệ/.test(err.message) && JSON.stringify(err.details || {}).includes('chưa có Phân phối chương trình'));
});

test('Xóa bài PPCT: chặn khi còn câu hỏi dùng, cho xóa khi không còn ai dùng', async () => {
  const { a, t, lessons } = await account('fix-delete-lesson');
  await t.call('/api/bank/import', { mode: 'append', questions: M.bankQuestions(a, lessons).filter(q => q.lesson_code === 'B1'), grade: a.grade });
  await assert.rejects(t.call('/api/ppct/delete-lesson', { grade: a.grade, lesson_code: 'B1', subject_name: a.subject }), /đang được 8 câu hỏi/);
  await t.call('/api/ppct/delete-lesson', { grade: a.grade, lesson_code: 'B3', subject_name: a.subject });
  const codes = [...t.window.FirebaseState.currentData.bank.ppct.lessons].map(l => String(l.lesson_code)).sort();
  assert.deepEqual(codes, ['B1', 'B2']);
});

test('Khôi phục tệp sao lưu rỗng đè lên dữ liệu đang có: bị chặn', async () => {
  const { t } = await account('fix-empty-restore');
  await assert.rejects(t.window.FirebaseClient.replaceWorkspaceData({ bank: { questions: [], ppct: { lessons: [] } }, exams: [], revisions: [], matrices: [] }), /không khôi phục tệp rỗng/);
  assert.equal(t.window.FirebaseState.currentData.bank.ppct.lessons.length, 3);
});

test('Thiếu câu khi tạo đề: thông báo chỉ rõ vị trí, số cần và số có', async () => {
  const engine = require('../public/static-exam-engine.js');
  const { fixture } = require('./static_api.test.cjs');
  const d = fixture();
  d.matrices[0].status = 'locked';
  d.bank.questions.forEach((q, i) => { if (i) q.review_status = 'draft'; });
  assert.throws(() => engine.generateExam(d, { title: 'Đề', grade: 9, subject_name: 'Tin học', exam_type: 'GK1', matrix_id: 'M1' }),
    err => /Vị trí thiếu: Trắc nghiệm câu 1, Trắc nghiệm câu 2: cần 2, có 1 câu đã duyệt/.test(err.message) && err.details.short_slots.length === 1);
});

test('Phát hành đề cương khi còn đề liên kết chưa khóa: thông báo nêu mã đề', async () => {
  const workflow = require('../public/static-exam-workflow.js');
  const { fixture } = require('./static_api.test.cjs');
  const rev = { id: 'R', status: 'drafting', title: 'ĐC', grade: 9, subject_name: 'Tin học', questions: [fixture().bank.questions[0]] };
  const exams = [{ id: 'E1', revision_id: 'R', status: 'drafting', exam_code: '201', title: 'Đề hoán vị' }];
  await assert.rejects(workflow.transitionRevision(rev, 'publish', { exams }), /mã 201 “Đề hoán vị”/);
});
