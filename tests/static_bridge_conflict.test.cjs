'use strict';
// Cầu nối Pages (firebase-bridge.js) với Cloud v2: hai tab cùng tải một tài khoản, tab B lưu sau lên
// cùng câu hỏi thì bị chặn, dữ liệu trong tab B được hoàn lại và hiện thông báo tải lại.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const V2 = require('../public/cloud-storage-v2.js');
const { makeFirestoreMock } = require('./firestore_mock.cjs');
const { fixture } = require('./static_api.test.cjs');

const USER = { uid: 'gv-hai-tab', email: '', isAnonymous: false };

function fakeElement(tag) {
  const el = {
    tagName: tag, id: '', hidden: false, textContent: '', className: '', style: {}, children: [], attrs: {},
    setAttribute(k, v) { el.attrs[k] = v; },
    append(...kids) { el.children.push(...kids); kids.forEach(k => { k.parent = el; }); },
    appendChild(kid) { el.append(kid); return kid; }
  };
  return el;
}

function openTab(firestore) {
  const elements = new Map();
  const body = fakeElement('body');
  const register = (el) => { if (el.id) elements.set(el.id, el); (el.children || []).forEach(register); };
  body.appendChild = (kid) => { body.children.push(kid); register(kid); return kid; };
  const document = {
    body,
    querySelector: () => null,
    getElementById: (id) => {
      if (!elements.has(id)) for (const child of body.children) register(child);
      return elements.get(id) || null;
    },
    createElement: (tag) => fakeElement(tag)
  };
  const values = new Map();
  const window = {
    location: { hostname: 'localhost', protocol: 'http:' },
    BankStaticAPI: require('../public/static-api.js'),
    BankStaticEngine: require('../public/static-exam-engine.js'),
    BankStaticWorkflow: require('../public/static-exam-workflow.js'),
    BankExamComparison: require('../public/exam-comparison.js'),
    BankCore: require('../public/core.js'),
    CloudStorageV2: V2,
    crypto: webcrypto
  };
  const context = {
    window, document, crypto: webcrypto, console: { ...console, info() {}, log() {} }, setTimeout, clearTimeout,
    localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/firebase-bridge.js'), 'utf8'), context);
  window.FirebaseState.provider = 'firebase-cloud-v2';
  window.FirebaseState.user = USER;
  window.FirebaseState.db = firestore.db;
  window.FirebaseState._firestoreHelpers = firestore.helpers;
  return { window, document };
}

const questionText = (store, id) => {
  for (const [k, v] of store.entries()) {
    if (!k.includes('/question_chunks/')) continue;
    const q = (v.questions || []).find(x => x.id === id);
    if (q) return q.question;
  }
  return undefined;
};

for (const withTransaction of [false, true]) {
  test('Hai tab cùng sửa một câu hỏi: tab lưu sau bị chặn, được hoàn lại và báo tải lại' + (withTransaction ? ' (runTransaction)' : ''), async () => {
    const firestore = makeFirestoreMock({ withTransaction });
    await V2.firestoreWriteFullV2(USER.uid, firestore.db, firestore.helpers, fixture(), { ownerEmail: '' });

    const tabA = openTab(firestore);
    const tabB = openTab(firestore);
    await tabA.window.FirebaseClient.loadFromCloudV2(USER, { db: firestore.db, helpers: firestore.helpers });
    await tabB.window.FirebaseClient.loadFromCloudV2(USER, { db: firestore.db, helpers: firestore.helpers });

    const q = fixture().bank.questions[0];
    await tabA.window.FirebaseClient.handle('/api/questions/save', { question: { ...q, question: 'Sửa ở tab A' } });
    assert.equal(questionText(firestore.store, q.id), 'Sửa ở tab A');

    await assert.rejects(
      tabB.window.FirebaseClient.handle('/api/questions/save', { question: { ...q, question: 'Sửa ở tab B' } }),
      err => err.code === 'CLOUD_CONFLICT' && /máy hoặc tab khác/.test(err.message)
    );
    assert.equal(questionText(firestore.store, q.id), 'Sửa ở tab A', 'Bản trên đám mây phải giữ nội dung của tab A');
    const stateB = await tabB.window.FirebaseClient.handle('/api/state');
    assert.equal(stateB.bank.questions.find(x => x.id === q.id).question, q.question, 'Tab B phải hoàn lại thay đổi chưa lưu');

    const notice = tabB.document.getElementById('cloud-conflict-notice');
    assert.ok(notice && notice.hidden === false, 'Phải hiện hộp thông báo xung đột');
    assert.match(tabB.document.getElementById('cloud-conflict-notice-text').textContent, /CHƯA được lưu/);

    // Tải lại tab B rồi lưu: thành công trên bản mới nhất.
    await tabB.window.FirebaseClient.loadFromCloudV2(USER, { db: firestore.db, helpers: firestore.helpers });
    assert.equal(notice.hidden, true, 'Tải lại xong phải ẩn thông báo');
    await tabB.window.FirebaseClient.handle('/api/questions/save', { question: { ...q, question: 'Tab B sau khi tải lại' } });
    assert.equal(questionText(firestore.store, q.id), 'Tab B sau khi tải lại');
  });
}

test('Một tab lưu liên tiếp nhiều lần không tự báo xung đột', async () => {
  const firestore = makeFirestoreMock({ withTransaction: true });
  await V2.firestoreWriteFullV2(USER.uid, firestore.db, firestore.helpers, fixture(), { ownerEmail: '' });
  const tab = openTab(firestore);
  await tab.window.FirebaseClient.loadFromCloudV2(USER, { db: firestore.db, helpers: firestore.helpers });
  const q = fixture().bank.questions[0];
  for (const text of ['Lần 1', 'Lần 2', 'Lần 3']) {
    await tab.window.FirebaseClient.handle('/api/questions/save', { question: { ...q, question: text } });
  }
  assert.equal(questionText(firestore.store, q.id), 'Lần 3');
});
