const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
globalThis.crypto = webcrypto;

const driveStorage = require('../public/google-drive-storage.js');
const api = require('../public/static-api.js');
const engine = require('../public/static-exam-engine.js');
const workflow = require('../public/static-exam-workflow.js');
const comparison = require('../public/exam-comparison.js');
const core = require('../public/core.js');
const { fixture } = require('./static_api.test.cjs');

function makeResponse(status, body) {
  const textBody = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return textBody;
    }
  };
}

function createMockDriveServer() {
  const drives = new Map(); // userKey -> { folders: Map, files: Map, seq: number, reads: number, writes: number }
  const tokens = new Map(); // accessToken -> { sub, email, name, expired?: boolean }

  function ensureDrive(sub) {
    if (!drives.has(sub)) {
      drives.set(sub, { folders: new Map(), files: new Map(), seq: 0, reads: 0, writes: 0 });
    }
    return drives.get(sub);
  }

  function registerUser(token, profile) {
    tokens.set(token, { ...profile });
    ensureDrive(profile.sub);
  }

  function expireToken(token) {
    const t = tokens.get(token);
    if (t) t.expired = true;
  }

  function parseMultipartJson(bodyText) {
    const parts = String(bodyText).split(/\r?\n--exammatrix_[^\r\n]+(?:--)?\r?\n?/);
    const metaSection = parts.find((p) => p.includes('"name"') && !p.includes('"format"'));
    const dataSection = parts.find((p) => p.includes('"format"') || p.includes('"bank"'));
    const extractBody = (section) => {
      if (!section) return {};
      const idx = section.indexOf('\r\n\r\n');
      const raw = idx >= 0 ? section.slice(idx + 4).trim() : section.trim();
      return JSON.parse(raw);
    };
    return {
      metadata: extractBody(metaSection),
      contentText: (() => {
        const idx = (dataSection || '').indexOf('\r\n\r\n');
        return idx >= 0 ? dataSection.slice(idx + 4).trim() : '';
      })()
    };
  }

  async function fetchImpl(url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const authHeader = (opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const user = tokens.get(token);
    if (!user || user.expired) {
      return makeResponse(401, { error: { message: 'Invalid Credentials' } });
    }
    const drive = ensureDrive(user.sub);

    if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
      return makeResponse(200, { sub: user.sub, email: user.email, name: user.name });
    }

    if (method === 'GET' && url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
      const parsedUrl = new URL(url);
      const q = parsedUrl.searchParams.get('q') || '';
      if (q.includes("mimeType='application/vnd.google-apps.folder'")) {
        const m = q.match(/name='((?:\\.|[^'])*)'/);
        const folderName = m ? m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\') : '';
        const matches = [...drive.folders.values()].filter((f) => f.name === folderName && !f.trashed);
        return makeResponse(200, { files: matches });
      }
      const parentMatch = q.match(/'((?:\\.|[^'])*)' in parents/);
      const nameMatch = q.match(/name='((?:\\.|[^'])*)'/);
      const parentId = parentMatch ? parentMatch[1] : '';
      const fileName = nameMatch ? nameMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\') : '';
      const matches = [...drive.files.values()].filter(
        (f) => !f.trashed && f.parents.includes(parentId) && f.name === fileName
      );
      return makeResponse(200, { files: matches.map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime })) });
    }

    if (url.startsWith('https://www.googleapis.com/drive/v3/files') && method === 'POST') {
      const meta = JSON.parse(opts.body);
      const id = `folder_${++drive.seq}`;
      const folder = { id, name: meta.name, modifiedTime: new Date().toISOString(), trashed: false };
      drive.folders.set(id, folder);
      return makeResponse(200, { id: folder.id, name: folder.name });
    }

    const mediaReadMatch = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?alt=media$/);
    if (mediaReadMatch && method === 'GET') {
      const fileId = decodeURIComponent(mediaReadMatch[1]);
      const file = drive.files.get(fileId);
      if (!file || file.trashed) {
        return makeResponse(404, { error: { message: 'File not found' } });
      }
      drive.reads += 1;
      return makeResponse(200, file.content);
    }

    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart') && method === 'POST') {
      const { metadata, contentText } = parseMultipartJson(opts.body);
      const id = `file_${++drive.seq}`;
      const file = {
        id,
        name: metadata.name,
        parents: metadata.parents || [],
        modifiedTime: new Date().toISOString(),
        trashed: false,
        content: contentText
      };
      drive.files.set(id, file);
      drive.writes += 1;
      return makeResponse(200, { id: file.id, name: file.name, modifiedTime: file.modifiedTime });
    }

    const mediaPatchMatch = url.match(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\/([^?]+)\?uploadType=media/);
    if (mediaPatchMatch && method === 'PATCH') {
      const fileId = decodeURIComponent(mediaPatchMatch[1]);
      const file = drive.files.get(fileId);
      if (!file || file.trashed) {
        return makeResponse(404, { error: { message: 'File not found' } });
      }
      file.content = opts.body;
      file.modifiedTime = new Date().toISOString();
      drive.writes += 1;
      return makeResponse(200, { id: file.id, name: file.name, modifiedTime: file.modifiedTime });
    }

    return makeResponse(400, { error: { message: `Unhandled mock URL: ${method} ${url}` } });
  }

  return { drives, registerUser, expireToken, fetchImpl };
}

function bridgeHarness({ server = false, quota = false, mockFetch = null } = {}) {
  const localValues = new Map([['exammatrix_teacher_cache_offline', JSON.stringify(fixture())]]);
  const sessionValues = new Map();
  const status = { hidden: true, textContent: '' };
  const authBox = { id: 'firebase-auth-box', className: '', innerHTML: '', querySelector: () => null };
  const offlineBanner = { hidden: true };

  const windowObj = {
    location: { hostname: 'trangiahuy8444.github.io', protocol: 'https:' },
    BankStaticAPI: api,
    BankStaticEngine: engine,
    BankStaticWorkflow: workflow,
    BankExamComparison: comparison,
    BankCore: core,
    GoogleDriveStorage: driveStorage,
    GOOGLE_DRIVE_CONFIG: {
      clientId: '12345-test.apps.googleusercontent.com',
      folderName: 'ExamMatrix Studio',
      fileName: 'exammatrix-workspace.json',
      scope: driveStorage.DRIVE_SCOPE
    },
    store: { bank: {}, selectedSubject: 'Tin học' },
    crypto: webcrypto
  };

  const context = {
    window: windowObj,
    globalThis: undefined,
    crypto: webcrypto,
    console,
    setTimeout,
    clearTimeout,
    fetch: mockFetch || (async () => { throw new Error('unexpected network'); }),
    document: {
      querySelector: () => (server ? {} : null),
      getElementById: (id) => {
        if (id === 'static-sync-status') return status;
        if (id === 'firebase-auth-box') return authBox;
        if (id === 'offline-banner') return offlineBanner;
        return null;
      }
    },
    localStorage: {
      getItem: (k) => (localValues.has(k) ? localValues.get(k) : null),
      setItem: (k, v) => {
        if (quota) throw new Error('quota');
        localValues.set(k, String(v));
      },
      removeItem: (k) => localValues.delete(k)
    },
    sessionStorage: {
      getItem: (k) => (sessionValues.has(k) ? sessionValues.get(k) : null),
      setItem: (k, v) => sessionValues.set(k, String(v)),
      removeItem: (k) => sessionValues.delete(k)
    }
  };
  context.globalThis = windowObj;

  const source = fs.readFileSync(require.resolve('../public/firebase-bridge.js'), 'utf8');
  vm.runInNewContext(source, context);
  return { window: windowObj, localValues, sessionValues, status, offlineBanner };
}

test('GoogleDriveStorage: escapeDriveQuery escapes backslash and single quote', () => {
  assert.equal(driveStorage.escapeDriveQuery("a'b\\c'd"), "a\\'b\\\\c\\'d");
});

test('GoogleDriveStorage: unwrapWorkspacePayload supports Drive, offline backup, and flat formats', () => {
  const sample = fixture();
  const wrappedDrive = driveStorage.buildWorkspacePayload(sample, { ownerEmail: 'gv@school.edu.vn' });
  const res1 = driveStorage.unwrapWorkspacePayload(wrappedDrive);
  assert.equal(res1.ownerEmail, 'gv@school.edu.vn');
  assert.equal(res1.data.bank.questions.length, sample.bank.questions.length);

  const offlineBackup = { format: 'exammatrix-offline-backup', version: 1, data: sample };
  const res2 = driveStorage.unwrapWorkspacePayload(offlineBackup);
  assert.equal(res2.data.exams.length, sample.exams.length);

  const res3 = driveStorage.unwrapWorkspacePayload(sample);
  assert.equal(res3.data.matrices.length, sample.matrices.length);

  assert.throws(() => driveStorage.unwrapWorkspacePayload({ format: 'wrong-format', data: sample }), /không đúng định dạng/);
  assert.throws(() => driveStorage.unwrapWorkspacePayload({ bank: { questions: [] } }), /không đúng định dạng/);
  assert.throws(() => driveStorage.unwrapWorkspacePayload(null), /không đúng định dạng/);
});

test('GoogleDriveStorage: buildMultipartBody preserves UTF-8 Vietnamese JSON parts', () => {
  const body = driveStorage.buildMultipartBody(
    { name: 'exammatrix-workspace.json', parents: ['fld1'], mimeType: 'application/json' },
    JSON.stringify({ note: 'Đề kiểm tra Tin học Khối 9' }),
    'test_boundary'
  );
  assert.ok(body.includes('--test_boundary\r\nContent-Type: application/json; charset=UTF-8'));
  assert.ok(body.includes('"parents":["fld1"]'));
  assert.ok(body.includes('Đề kiểm tra Tin học Khối 9'));
  assert.ok(body.endsWith('--test_boundary--\r\n'));
});

test('GoogleDriveStorage: getUserProfile returns gdrive UID and throws DRIVE_AUTH_EXPIRED on 401', async () => {
  const mock = createMockDriveServer();
  mock.registerUser('tok-a', { sub: 'sub-a', email: 'a@school.edu.vn', name: 'Cô A' });

  const profile = await driveStorage.getUserProfile('tok-a', { fetchImpl: mock.fetchImpl });
  assert.deepEqual(profile, {
    uid: 'gdrive:sub-a',
    sub: 'sub-a',
    email: 'a@school.edu.vn',
    displayName: 'Cô A',
    picture: ''
  });

  mock.expireToken('tok-a');
  await assert.rejects(
    driveStorage.getUserProfile('tok-a', { fetchImpl: mock.fetchImpl }),
    (err) => err.status === 401 && err.code === 'DRIVE_AUTH_EXPIRED'
  );
});

test('GoogleDriveStorage: findOrCreateFolder reuses existing folder or creates new one', async () => {
  const mock = createMockDriveServer();
  mock.registerUser('tok-a', { sub: 'sub-a', email: 'a@school.edu.vn', name: 'Cô A' });

  const id1 = await driveStorage.findOrCreateFolder('tok-a', 'ExamMatrix Studio', { fetchImpl: mock.fetchImpl });
  const id2 = await driveStorage.findOrCreateFolder('tok-a', 'ExamMatrix Studio', { fetchImpl: mock.fetchImpl });
  assert.equal(id1, id2);
  assert.equal(mock.drives.get('sub-a').folders.size, 1);
});

test('GoogleDriveStorage: readWorkspace handles absent file, valid file, and corrupt JSON', async () => {
  const mock = createMockDriveServer();
  mock.registerUser('tok-a', { sub: 'sub-a', email: 'a@school.edu.vn', name: 'Cô A' });

  const empty = await driveStorage.readWorkspace('tok-a', { fetchImpl: mock.fetchImpl });
  assert.equal(empty.exists, false);
  assert.equal(empty.fileId, null);
  assert.ok(empty.folderId);

  const sample = fixture();
  const written = await driveStorage.writeWorkspace('tok-a', sample, {
    ownerEmail: 'a@school.edu.vn',
    fetchImpl: mock.fetchImpl
  });
  const loaded = await driveStorage.readWorkspace('tok-a', { fetchImpl: mock.fetchImpl });
  assert.equal(loaded.exists, true);
  assert.equal(loaded.fileId, written.fileId);
  assert.equal(loaded.data.bank.questions.length, sample.bank.questions.length);

  mock.drives.get('sub-a').files.get(written.fileId).content = '{bad json';
  await assert.rejects(
    driveStorage.readWorkspace('tok-a', { fetchImpl: mock.fetchImpl }),
    /bị hỏng/
  );
});

test('GoogleDriveStorage: writeWorkspace creates multipart, patches media, and recovers from 404 on PATCH', async () => {
  const mock = createMockDriveServer();
  mock.registerUser('tok-a', { sub: 'sub-a', email: 'a@school.edu.vn', name: 'Cô A' });

  const calls = [];
  const spyFetch = async (url, opts = {}) => {
    calls.push({ method: opts.method || 'GET', url });
    return mock.fetchImpl(url, opts);
  };

  const sample = fixture();
  const first = await driveStorage.writeWorkspace('tok-a', sample, {
    ownerEmail: 'a@school.edu.vn',
    fetchImpl: spyFetch
  });
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.includes('uploadType=multipart')));

  calls.length = 0;
  sample.bank.questions[0].question = 'Câu hỏi cập nhật lần 2';
  const second = await driveStorage.writeWorkspace('tok-a', sample, {
    folderId: first.folderId,
    fileId: first.fileId,
    ownerEmail: 'a@school.edu.vn',
    fetchImpl: spyFetch
  });
  assert.equal(second.fileId, first.fileId);
  assert.ok(calls.some((c) => c.method === 'PATCH' && c.url.includes('uploadType=media')));

  // Giả lập người dùng xóa tệp trên Drive: PATCH trả 404 → tự tạo tệp mới an toàn
  mock.drives.get('sub-a').files.delete(first.fileId);
  calls.length = 0;
  const third = await driveStorage.writeWorkspace('tok-a', sample, {
    folderId: first.folderId,
    fileId: first.fileId,
    ownerEmail: 'a@school.edu.vn',
    fetchImpl: spyFetch
  });
  assert.notEqual(third.fileId, first.fileId);
  assert.ok(calls.some((c) => c.method === 'PATCH'));
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.includes('uploadType=multipart')));
});

test('Bridge + Google Drive: isolates per-user Drives and brand-new account never inherits offline data', async () => {
  const mock = createMockDriveServer();
  mock.registerUser('tok-a', { sub: 'user-a', email: 'user-a@school.edu.vn', name: 'Cô A' });
  mock.registerUser('tok-b', { sub: 'user-b', email: 'user-b@school.edu.vn', name: 'Thầy B' });

  const h = bridgeHarness({ mockFetch: mock.fetchImpl });

  const sessionA = {
    user: { uid: 'gdrive:user-a', email: 'user-a@school.edu.vn', displayName: 'Cô A' },
    accessToken: 'tok-a',
    expiresAt: Date.now() + 3600 * 1000,
    folderId: null,
    fileId: null,
    fetchImpl: mock.fetchImpl
  };
  h.window.FirebaseState.provider = 'google-drive';
  h.window.FirebaseState.user = sessionA.user;
  h.window.FirebaseState.driveSession = sessionA;

  await h.window.FirebaseClient.loadFromGoogleDrive(sessionA);
  assert.equal(h.window.FirebaseState.currentData.bank.questions.length, 0);
  assert.equal(h.window.store.bank.questions.length, 0);

  // Nạp dữ liệu vào Drive của User A qua replaceWorkspaceData
  const sample = fixture();
  sample.bank.questions[0].question = 'Câu riêng của User A';
  const replaced = await h.window.FirebaseClient.replaceWorkspaceData(sample);
  assert.equal(replaced.ok, true);
  assert.ok(sessionA.fileId);
  assert.equal(mock.drives.get('user-a').writes, 1);
  assert.equal(mock.drives.get('user-b').writes, 0);

  // Chuyển sang User B: Drive trống, hoàn toàn tách biệt khỏi User A
  const sessionB = {
    user: { uid: 'gdrive:user-b', email: 'user-b@school.edu.vn', displayName: 'Thầy B' },
    accessToken: 'tok-b',
    expiresAt: Date.now() + 3600 * 1000,
    folderId: null,
    fileId: null,
    fetchImpl: mock.fetchImpl
  };
  h.window.FirebaseState.user = sessionB.user;
  h.window.FirebaseState.driveSession = sessionB;
  await h.window.FirebaseClient.loadFromGoogleDrive(sessionB);
  assert.equal(h.window.FirebaseState.currentData.bank.questions.length, 0);
  assert.equal(mock.drives.get('user-b').files.size, 0);

  // Quay lại User A (xóa cache local để chắc chắn tải từ Drive của A)
  h.localValues.delete('exammatrix_teacher_cache_gdrive:user-a');
  h.window.FirebaseState.user = sessionA.user;
  h.window.FirebaseState.driveSession = sessionA;
  await h.window.FirebaseClient.loadFromGoogleDrive(sessionA);
  assert.equal(h.window.FirebaseState.currentData.bank.questions[0].question, 'Câu riêng của User A');
});

test('Bridge + Google Drive: saving question syncs to Drive, 401 preserves pending local edits and syncCurrentData recovers', async () => {
  const mock = createMockDriveServer();
  mock.registerUser('tok-a', { sub: 'user-a', email: 'user-a@school.edu.vn', name: 'Cô A' });

  const h = bridgeHarness({ mockFetch: mock.fetchImpl });
  const sessionA = {
    user: { uid: 'gdrive:user-a', email: 'user-a@school.edu.vn', displayName: 'Cô A' },
    accessToken: 'tok-a',
    expiresAt: Date.now() + 3600 * 1000,
    folderId: null,
    fileId: null,
    fetchImpl: mock.fetchImpl
  };
  h.window.FirebaseState.provider = 'google-drive';
  h.window.FirebaseState.user = sessionA.user;
  h.window.FirebaseState.driveSession = sessionA;

  const seed = fixture();
  await h.window.FirebaseClient.replaceWorkspaceData(seed);
  const q0 = seed.bank.questions[0];

  await h.window.FirebaseClient.handle('/api/questions/save', {
    question: { ...q0, question: 'Đã đồng bộ lần 1' }
  });
  const cachedOk = JSON.parse(h.localValues.get('exammatrix_teacher_cache_gdrive:user-a'));
  assert.equal(cachedOk._sync.pending, false);
  assert.equal(cachedOk._sync.provider, 'google-drive');
  assert.match(h.status.textContent, /Google Drive riêng/);

  // Token hết hạn trên Drive (401)
  mock.expireToken('tok-a');
  await h.window.FirebaseClient.handle('/api/questions/save', {
    question: { ...q0, question: 'Sửa khi token hết hạn' }
  });

  const cachedPending = JSON.parse(h.localValues.get('exammatrix_teacher_cache_gdrive:user-a'));
  assert.equal(cachedPending._sync.pending, true);
  assert.equal(cachedPending.bank.questions[0].question, 'Sửa khi token hết hạn');
  assert.equal(sessionA.accessToken, '');
  assert.equal(h.status.hidden, false);
  assert.match(h.status.textContent, /chưa đồng bộ/i);

  // loadFromGoogleDrive không được ghi đè lên thay đổi đang chờ đồng bộ
  const readsBefore = mock.drives.get('user-a').reads;
  mock.registerUser('tok-a-fresh', { sub: 'user-a', email: 'user-a@school.edu.vn', name: 'Cô A' });
  sessionA.accessToken = 'tok-a-fresh';
  sessionA.expiresAt = Date.now() + 3600 * 1000;
  await h.window.FirebaseClient.loadFromGoogleDrive(sessionA);
  assert.equal(mock.drives.get('user-a').reads, readsBefore);
  assert.equal(h.window.FirebaseState.currentData.bank.questions[0].question, 'Sửa khi token hết hạn');

  // Bấm Đồng bộ Drive sau khi có token mới
  const synced = await h.window.FirebaseClient.syncCurrentData();
  assert.equal(synced.ok, true);
  assert.equal(synced.pending, false);
  const loadedAfter = await driveStorage.readWorkspace('tok-a-fresh', { fetchImpl: mock.fetchImpl });
  assert.equal(loadedAfter.data.bank.questions[0].question, 'Sửa khi token hết hạn');
});

test('Bridge + Google Drive: does not intercept Django server host', () => {
  const djangoHost = bridgeHarness({ server: true });
  assert.equal(djangoHost.window.FirebaseClient.canHandle('/api/state'), false);
});

test('Bridge + Google Drive: load and sync succeed even when localStorage quota is full', async () => {
  const mock = createMockDriveServer();
  mock.registerUser('tok-a', { sub: 'user-a', email: 'user-a@school.edu.vn', name: 'Cô A' });

  const h = bridgeHarness({ quota: true, mockFetch: mock.fetchImpl });
  const sessionA = {
    user: { uid: 'gdrive:user-a', email: 'user-a@school.edu.vn', displayName: 'Cô A' },
    accessToken: 'tok-a',
    expiresAt: Date.now() + 3600 * 1000,
    folderId: null,
    fileId: null,
    fetchImpl: mock.fetchImpl
  };
  h.window.FirebaseState.provider = 'google-drive';
  h.window.FirebaseState.user = sessionA.user;
  h.window.FirebaseState.driveSession = sessionA;

  await h.window.FirebaseClient.loadFromGoogleDrive(sessionA);
  assert.doesNotMatch(h.status.textContent, /Chưa tải được/);
  assert.match(h.status.textContent, /Đã kết nối Google Drive riêng/);

  const synced = await h.window.FirebaseClient.syncCurrentData();
  assert.equal(synced.ok, true);
  assert.equal(synced.pending, false);
  assert.ok(sessionA.fileId);
  const driveFiles = [...mock.drives.get('user-a').files.values()];
  assert.equal(driveFiles.length, 1);
  assert.equal(driveFiles[0].name, 'exammatrix-workspace.json');

  const seed = fixture();
  await h.window.FirebaseClient.replaceWorkspaceData(seed);
  const q0 = seed.bank.questions[0];
  await h.window.FirebaseClient.handle('/api/questions/save', {
    question: { ...q0, question: 'Lưu thành công dù localStorage đầy' }
  });
  const loadedAfter = await driveStorage.readWorkspace('tok-a', { fetchImpl: mock.fetchImpl });
  assert.equal(loadedAfter.data.bank.questions[0].question, 'Lưu thành công dù localStorage đầy');
});

test('Bridge + Google Drive: rejects and rolls back when BOTH localStorage quota and Google Drive fail', async () => {
  const mock = createMockDriveServer();
  mock.registerUser('tok-a', { sub: 'user-a', email: 'user-a@school.edu.vn', name: 'Cô A' });

  const h = bridgeHarness({ quota: true, mockFetch: mock.fetchImpl });
  const sessionA = {
    user: { uid: 'gdrive:user-a', email: 'user-a@school.edu.vn', displayName: 'Cô A' },
    accessToken: 'tok-a',
    expiresAt: Date.now() + 3600 * 1000,
    folderId: null,
    fileId: null,
    fetchImpl: mock.fetchImpl
  };
  h.window.FirebaseState.provider = 'google-drive';
  h.window.FirebaseState.user = sessionA.user;
  h.window.FirebaseState.driveSession = sessionA;

  const seed = fixture();
  await h.window.FirebaseClient.replaceWorkspaceData(seed);
  const originalText = seed.bank.questions[0].question;

  mock.expireToken('tok-a');
  await assert.rejects(
    h.window.FirebaseClient.handle('/api/questions/save', {
      question: { ...seed.bank.questions[0], question: 'Không được phép giữ lại nếu cả hai đều lỗi' }
    }),
    /bộ nhớ trình duyệt cũng đầy/
  );
  assert.equal(h.window.FirebaseState.currentData.bank.questions[0].question, originalText);
});
