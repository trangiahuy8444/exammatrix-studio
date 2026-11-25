'use strict';
// Giao diện mới (duyệt 25/11/2026): bìa hồ sơ kỳ kiểm tra và thanh 6 bước tính từ dữ liệu thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/core.js');

const M = (o) => ({ grade: 9, subject_name: 'Tin học', exam_type: 'GK1', status: 'draft', requirements: [{ outcome_mode: 'any' }], ...o });
const E = (o) => ({ grade: 9, subject_name: 'Tin học', exam_type: 'GK1', status: 'drafting', ...o });

test('Bìa hồ sơ: kỳ chưa có gì thì 6 ô chưa làm, việc tiếp theo là Bắt đầu', () => {
  const d = C.dossierStatus({ matrices: [], exams: [], revisions: [] }, { grade: 9, subject: 'Tin học' });
  assert.deepEqual(d.map(p => p.code), ['GK1', 'CK1', 'GK2', 'CK2']);
  assert.ok(d[0].slots.every(x => x.state === 'todo'));
  assert.deepEqual(d[0].next, { tab: 'matrices', label: 'Bắt đầu' });
});

test('Bìa hồ sơ: ma trận 2D khóa nhưng chưa có đặc tả thật; đề lỗi kiểm định thì "cần sửa"', () => {
  const data = {
    matrices: [M({ status: 'locked', duration: 45 }), M({ exam_type: 'CK1', status: 'locked', requirements: [{ ppct_outcome_index: 0 }] })],
    revisions: [{ id: 'R1', status: 'drafting' }],
    exams: [E({ id: 'E1', revision_id: 'R1', title: 'Đề 1', exam_code: '101', verification: { passed: false, errors: [{ message: 'Câu chưa duyệt: TN câu 2.' }] } }), E({ id: 'E2', parent_exam_id: 'E1', exam_code: '102' })]
  };
  const [gk1, ck1] = C.dossierStatus(data, { grade: 9, subject: 'Tin học' });
  const st = Object.fromEntries(gk1.slots.map(x => [x.key, x.state]));
  assert.deepEqual(st, { matrix: 'done', spec: 'todo', revision: 'doing', exam: 'done', approve: 'fix', publish: 'todo' });
  assert.equal(gk1.meta, '45 phút');
  assert.equal(gk1.next.label, 'Sửa đề, rồi duyệt');
  assert.match(gk1.issues[0].text, /Đề 1 \(mã 101\): Câu chưa duyệt: TN câu 2/);
  assert.equal(Object.fromEntries(ck1.slots.map(x => [x.key, x.state])).spec, 'done', 'Ma trận khóa có YCCĐ thật thì đặc tả đã xong');
});

test('Bìa hồ sơ: chỉ tính đúng khối, đúng môn; kỳ phát hành đủ thì "Đủ hồ sơ"', () => {
  const data = {
    matrices: [M({ status: 'locked', spec_locked: true }), M({ grade: 8, status: 'locked' }), M({ subject_name: 'Toán học', status: 'locked' })],
    revisions: [{ id: 'R', status: 'published' }],
    exams: [E({ id: 'A', revision_id: 'R', status: 'published' }), E({ id: 'B', parent_exam_id: 'A', status: 'published' })]
  };
  const gk1 = C.dossierStatus(data, { grade: 9, subject: 'Tin học' })[0];
  assert.equal(gk1.done, 6);
  assert.equal(gk1.next, null);
  assert.equal(C.dossierStatus(data, { grade: 9, subject: 'Toán học' })[0].slots[0].state, 'done');
  assert.equal(C.dossierStatus(data, { grade: 9, subject: 'Toán học' })[0].slots[2].state, 'todo');
});

test('Thanh 6 bước: đánh dấu bước của màn hình đang mở và trạng thái từng bước', () => {
  const data = { matrices: [M({ status: 'locked' })], exams: [], revisions: [], ppct: { lessons: [{ grade: 9, subject_name: 'Tin học', lesson_code: 'B1' }] } };
  const m = C.kyStepperModel(data, { grade: 9, subject: 'Tin học', period: 'GK1', tab: 'revisions' });
  assert.deepEqual(m.steps.map(s => s.label), ['Phạm vi', 'Ma trận', 'Đề cương', 'Đề và mã đề', 'Kiểm định, duyệt', 'Phát hành']);
  assert.deepEqual(m.steps.map(s => s.state), ['done', 'done', 'todo', 'todo', 'todo', 'todo']);
  assert.equal(m.steps.find(s => s.current).key, 'revision');
  assert.equal(C.kyStepperModel(data, { grade: 9, subject: 'Tin học', period: 'CK2', tab: 'exams' }).label, 'Cuối học kì II');
});

test('Trợ giúp trang chủ khớp giao diện mới', () => {
  assert.equal(C.screenGuide('overview').title, 'Hồ sơ kiểm tra');
  assert.ok(C.screenGuide('overview').steps.some(s => /Dấu tích đỏ/.test(s)));
});
