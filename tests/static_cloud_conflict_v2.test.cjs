'use strict';
// Chặn ghi đè giữa hai máy/tab (Cloud-First v2): mỗi tài liệu Firestore mang dấu phiên bản `_rev`;
// trước khi ghi, so dấu trên đám mây với dấu mà tab này đã tải. Lệch dấu -> báo CLOUD_CONFLICT, không ghi gì.
const test = require('node:test');
const assert = require('node:assert/strict');
const V2 = require('../public/cloud-storage-v2.js');
const { makeFirestoreMock } = require('./firestore_mock.cjs');

const UID = 'gv-xung-dot';

function sampleWorkspace() {
  return {
    profile: { active_grades: [8, 9], active_grade: 8, active_subject: 'Tin học', school_year: '2026-2027' },
    bank: {
      ppct: { lessons: [{ grade: 8, lesson_code: 'B1', subject_name: 'Tin học', outcomes: ['YCCĐ mẫu'] }], cleared_grades: [] },
      competency_catalogs: [],
      questions: [
        { id: 'Q8-1', grade: 8, lesson_code: 'B1', subject_name: 'Tin học', type: 'MC', level: 'Biết', question: 'Câu mẫu 1', options: ['A', 'B', 'C', 'D'], correct: 0 }
      ]
    },
    matrices: [],
    revisions: [{ id: 'REV-9', grade: 9, subject_name: 'Tin học', title: 'Đề cương mẫu 9', question_ids: [] }],
    exams: [{ id: 'EX-8', grade: 8, subject_name: 'Tin học', title: 'Đề mẫu K8', questions: [] }],
    assessment_plans: [],
    kttx: []
  };
}

// Một "máy" tải dữ liệu rồi lưu thay đổi, giống syncToCloudV2 trong firebase-bridge.js.
async function openDevice(db, helpers) {
  const read = await V2.firestoreReadWorkspaceV2(UID, db, helpers);
  const device = {
    data: JSON.parse(JSON.stringify(read.data)),
    slices: read.slices,
    knownRevs: read.revs,
    async save(mutate) {
      const next = JSON.parse(JSON.stringify(device.data));
      mutate(next);
      const after = V2.splitWorkspaceIntoSlices(next);
      const res = await V2.firestoreWriteDiffV2(UID, db, helpers, device.slices, after, { knownRevs: device.knownRevs });
      device.data = next;
      device.slices = after;
      device.knownRevs = res.knownRevs;
      return res;
    }
  };
  return device;
}

async function seeded(opts) {
  const fs = makeFirestoreMock(opts);
  await V2.firestoreWriteFullV2(UID, fs.db, fs.helpers, sampleWorkspace(), { ownerEmail: '' });
  return fs;
}

const examTitle = (store) => {
  for (const [k, v] of store.entries()) if (k.endsWith('/exams/EX-8')) return v.title;
  return undefined;
};

for (const withTransaction of [false, true]) {
  const label = withTransaction ? ' (runTransaction)' : ' (đọc trước rồi ghi lô)';

  test('Máy B sửa cùng đề sau máy A: bị chặn, bản của A giữ nguyên' + label, async () => {
    const { db, helpers, store } = await seeded({ withTransaction });
    const a = await openDevice(db, helpers);
    const b = await openDevice(db, helpers);

    await a.save(d => { d.exams[0].title = 'Đề K8 — sửa ở máy A'; });
    await assert.rejects(
      b.save(d => { d.exams[0].title = 'Đề K8 — sửa ở máy B'; }),
      err => err.code === 'CLOUD_CONFLICT' && Array.isArray(err.conflicts) && err.conflicts.some(c => c.module === 'exams' && c.docId === 'EX-8')
    );
    assert.equal(examTitle(store), 'Đề K8 — sửa ở máy A');
  });

  test('Lỗi xung đột không ghi bất kỳ tài liệu nào của lượt đó' + label, async () => {
    const { db, helpers, store } = await seeded({ withTransaction });
    const a = await openDevice(db, helpers);
    const b = await openDevice(db, helpers);
    await a.save(d => { d.exams[0].title = 'A'; });
    const snapshot = JSON.stringify([...store.entries()].sort());
    await assert.rejects(b.save(d => {
      d.exams[0].title = 'B';
      d.revisions[0].title = 'Đề cương sửa ở B'; // tài liệu khác, không xung đột, cũng không được ghi
    }), { code: 'CLOUD_CONFLICT' });
    assert.equal(JSON.stringify([...store.entries()].sort()), snapshot);
  });

  test('Hai máy sửa hai tài liệu khác nhau: cả hai đều lưu được, không mất của nhau' + label, async () => {
    const { db, helpers } = await seeded({ withTransaction });
    const a = await openDevice(db, helpers);
    const b = await openDevice(db, helpers);
    await a.save(d => { d.exams[0].title = 'Đề sửa ở A'; });
    await b.save(d => { d.revisions[0].title = 'Đề cương sửa ở B'; });
    const fresh = await V2.firestoreReadWorkspaceV2(UID, db, helpers);
    assert.equal(fresh.data.exams[0].title, 'Đề sửa ở A');
    assert.equal(fresh.data.revisions[0].title, 'Đề cương sửa ở B');
  });

  test('Máy A thêm đề mới, máy B lưu việc khác: đề mới của A không bị xóa' + label, async () => {
    const { db, helpers } = await seeded({ withTransaction });
    const a = await openDevice(db, helpers);
    const b = await openDevice(db, helpers);
    await a.save(d => { d.exams.push({ id: 'EX-8-MOI', grade: 8, subject_name: 'Tin học', title: 'Đề mới ở A', questions: [] }); });
    await b.save(d => { d.revisions[0].title = 'Đề cương sửa ở B'; });
    const fresh = await V2.firestoreReadWorkspaceV2(UID, db, helpers);
    assert.ok(fresh.data.exams.some(e => e.id === 'EX-8-MOI'));
  });

  test('Máy A sửa đề, máy B xóa chính đề đó: bị chặn' + label, async () => {
    const { db, helpers, store } = await seeded({ withTransaction });
    const a = await openDevice(db, helpers);
    const b = await openDevice(db, helpers);
    await a.save(d => { d.exams[0].title = 'A giữ đề'; });
    await assert.rejects(b.save(d => { d.exams = []; }), { code: 'CLOUD_CONFLICT' });
    assert.equal(examTitle(store), 'A giữ đề');
  });

  test('Cùng một tab lưu liên tiếp nhiều lần không tự báo xung đột' + label, async () => {
    const { db, helpers } = await seeded({ withTransaction });
    const a = await openDevice(db, helpers);
    await a.save(d => { d.exams[0].title = 'Lần 1'; });
    await a.save(d => { d.exams[0].title = 'Lần 2'; });
    await a.save(d => { d.exams = []; });
    await a.save(d => { d.exams.push({ id: 'EX-8', grade: 8, subject_name: 'Tin học', title: 'Tạo lại', questions: [] }); });
    const fresh = await V2.firestoreReadWorkspaceV2(UID, db, helpers);
    assert.equal(fresh.data.exams[0].title, 'Tạo lại');
  });

  test('Tải lại sau xung đột thì lưu được bản mới' + label, async () => {
    const { db, helpers } = await seeded({ withTransaction });
    const a = await openDevice(db, helpers);
    let b = await openDevice(db, helpers);
    await a.save(d => { d.exams[0].title = 'A'; });
    await assert.rejects(b.save(d => { d.exams[0].title = 'B'; }), { code: 'CLOUD_CONFLICT' });
    b = await openDevice(db, helpers);
    assert.equal(b.data.exams[0].title, 'A');
    await b.save(d => { d.exams[0].title = 'B sau khi tải lại'; });
    const fresh = await V2.firestoreReadWorkspaceV2(UID, db, helpers);
    assert.equal(fresh.data.exams[0].title, 'B sau khi tải lại');
  });
}

test('Dấu phiên bản không lọt vào dữ liệu giáo viên và không gây ghi thừa', async () => {
  const { db, helpers } = await seeded();
  const read = await V2.firestoreReadWorkspaceV2(UID, db, helpers);
  assert.ok(!JSON.stringify(read.data).includes('"_rev"'), '_rev không được xuất hiện trong dữ liệu đã ghép');
  assert.ok(!JSON.stringify(read.slices.scopes).includes('"_rev"'), '_rev không được nằm trong slices');
  const diff = V2.diffSlices(read.slices, V2.splitWorkspaceIntoSlices(read.data), UID);
  assert.equal(diff.firestoreOps.length, 0, 'Đọc rồi ghép lại không được sinh thao tác ghi');
  assert.ok(Object.keys(read.revs).length > 0);
});

test('Tài liệu cũ chưa có dấu phiên bản vẫn lưu được', async () => {
  const { db, helpers, store } = await seeded();
  for (const [k, v] of store.entries()) { delete v._rev; store.set(k, v); }
  const a = await openDevice(db, helpers);
  await a.save(d => { d.exams[0].title = 'Sửa tài liệu cũ'; });
  assert.equal(examTitle(store), 'Sửa tài liệu cũ');
});

test('Không truyền knownRevs: giữ cách ghi cũ (ghi lần đầu, chuyển dữ liệu)', async () => {
  const fs = makeFirestoreMock();
  const res = await V2.firestoreWriteFullV2(UID, fs.db, fs.helpers, sampleWorkspace(), { ownerEmail: '' });
  assert.ok(res.knownRevs && Object.keys(res.knownRevs).length > 0, 'Ghi đầy đủ phải trả dấu phiên bản cho tab');
  const read = await V2.firestoreReadWorkspaceV2(UID, fs.db, fs.helpers);
  for (const [path, rev] of Object.entries(res.knownRevs)) {
    assert.equal(read.revs[path] || 'absent', rev, path);
  }
});
