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

function bridgeHarness({ server = false, quota = false, mockFetch = null, initialLocal = null, initialSession = null, driveStorageOverrides = null, domParser = null } = {}) {
  const localValues = initialLocal || new Map([['exammatrix_teacher_cache_offline', JSON.stringify(fixture())]]);
  const sessionValues = initialSession || new Map();
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
    GoogleDriveStorage: driveStorageOverrides ? { ...driveStorage, ...driveStorageOverrides } : driveStorage,
    GOOGLE_DRIVE_CONFIG: {
      clientId: '12345-test.apps.googleusercontent.com',
      folderName: 'ExamMatrix Studio',
      fileName: 'exammatrix-workspace.json',
      scope: driveStorage.DRIVE_SCOPE
    },
    store: { bank: {}, selectedSubject: 'Tin học' },
    EXAMMATRIX_TEST_SEED: initialLocal ? null : fixture(),
    crypto: webcrypto
  };

  const context = {
    window: windowObj,
    globalThis: undefined,
    crypto: webcrypto,
    console,
    setTimeout,
    clearTimeout,
    ...(domParser ? { DOMParser: domParser } : {}),
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

test('Bridge + Google Drive: does not intercept Django server host', () => {
  const djangoHost = bridgeHarness({ server: true });
  assert.equal(djangoHost.window.FirebaseClient.canHandle('/api/state'), false);
});

test('PPCT import preview normalizes all 7 KHDH columns, Markdown table, save-lesson, and renders full table safely', async () => {
  const mock = createMockDriveServer();
  const h = bridgeHarness({ mockFetch: mock.fetchImpl });

  const report = await h.window.FirebaseClient.handle('/api/ppct/inspect-import', {
    filename: 'ppct_khoi_8.json',
    grade: 8,
    subject_name: 'Tin học',
    json: {
      lessons: [
        {
          grade: 8,
          lesson_code: 'B1',
          lesson_name_source: 'Bài 1. Lịch sử công cụ tính toán',
          topic_source: 'Chủ đề 1. Máy tính và cộng đồng',
          occurrences: [{ week_raw: '1', duration_raw: '2', ppct_raw: '1, 2', periods_raw: '1, 2' }],
          outcomes: [
            'Trình bày được sơ lược lịch sử phát triển máy tính',
            'Nêu được ví dụ <script>alert(1)</script> tác động của công nghệ'
          ],
          digital_competencies: [
            '1.1.TC2a: Khai thác học liệu số',
            '5.1.TC2a: Đánh giá tác động của <img src=x onerror=alert(1)> AI'
          ],
          notes: 'Thực hành theo nhóm'
        },
        {
          grade: 8,
          lesson_code: 'B2',
          lesson_name_source: 'Bài 2. Thông tin trong môi trường số',
          topic_source: 'Chủ đề 2. Tổ chức lưu trữ',
          occurrences: '3',
          outcomes: '- Nhận biết được thông tin số\n- Phân biệt được đặc điểm thông tin số'
        }
      ]
    }
  });

  assert.equal(report.summary.new, 2);
  assert.deepEqual([...report.lessons[0].outcomes], [
    'Trình bày được sơ lược lịch sử phát triển máy tính',
    'Nêu được ví dụ <script>alert(1)</script> tác động của công nghệ'
  ]);
  assert.deepEqual([...report.lessons[0].digital_competencies], [
    '1.1.TC2a: Khai thác học liệu số',
    '5.1.TC2a: Đánh giá tác động của <img src=x onerror=alert(1)> AI'
  ]);
  assert.equal(report.lessons[0].notes, 'Thực hành theo nhóm');
  assert.equal(report.lessons[0].occurrences[0].duration_raw, '2');
  assert.equal(report.lessons[0].occurrences[0].ppct_raw, '1, 2');
  assert.deepEqual([...report.lessons[1].outcomes], [
    'Nhận biết được thông tin số',
    'Phân biệt được đặc điểm thông tin số'
  ]);

  const savedRes = await h.window.FirebaseClient.handle('/api/ppct/save-lesson', {
    lesson: {
      grade: 8,
      lesson_code: 'B10',
      lesson_name_source: 'Bài 10. Đạo đức & AI',
      topic_source: 'Chủ đề 3',
      week_raw: '12',
      duration_raw: '2',
      ppct_raw: '23, 24',
      periods_raw: '23, 24',
      outcomes: ['Ứng xử văn minh trên môi trường số'],
      digital_competencies: ['2.2.TC2a: Tương tác an toàn', '5.3.TC2a: Kiểm chứng AI'],
      notes: 'Tích hợp QĐ 2422'
    }
  });
  const savedB10 = savedRes.bank.ppct.lessons.find(x => x.lesson_code === 'B10');
  assert.equal(savedB10.occurrences[0].duration_raw, '2');
  assert.equal(savedB10.occurrences[0].ppct_raw, '23, 24');
  assert.deepEqual([...savedB10.digital_competencies], ['2.2.TC2a: Tương tác an toàn', '5.3.TC2a: Kiểm chứng AI']);
  assert.equal(savedB10.notes, 'Tích hợp QĐ 2422');

  const appSource = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  const occStart = appSource.indexOf('function safeLessonOccurrences(');
  const occEnd = appSource.indexOf('const lessons=(g,subj)=>');
  const helperStart = appSource.indexOf('function renderPpctListCell(');
  const helperEnd = appSource.indexOf('function renderPPCT(');
  const mdStart = appSource.indexOf('function parsePpctFromMarkdown(');
  const cardStart = appSource.indexOf('function ppctImportCard(');
  const cardEnd = appSource.indexOf('function bindPpctImport(');
  assert.ok(occStart > 0 && occEnd > occStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart);
  assert.ok(mdStart > 0 && cardStart > mdStart && cardEnd > cardStart);

  const previewReport = {
    ...report,
    summary: { new: 2, changed: 2, unchanged: 1, conflict: 1 },
    lessons: [
      ...report.lessons,
      {
        status: 'unchanged',
        grade: 8,
        lesson_code: 'B3',
        lesson_name: 'Bài 3. Giữ nguyên',
        topic: 'Chủ đề 2',
        occurrences: [{ week_raw: '4', duration_raw: '2', ppct_raw: '7, 8' }],
        outcomes: ['YCCĐ giữ nguyên để giáo viên đối chiếu'],
        digital_competencies: ['1.2.TC2a: Tìm kiếm thông tin'],
        notes: 'Giữ nguyên chuẩn'
      },
      {
        status: 'changed',
        grade: 8,
        lesson_code: 'B4',
        lesson_name: 'Bài 4. Thay đổi YCCĐ',
        topic: 'Chủ đề 3',
        occurrences: 1,
        outcomes: ['YCCĐ giữ lại', 'YCCĐ mới thêm'],
        digital_competencies: ['3.1.TC2a: Sáng tạo nội dung'],
        notes: 'Cập nhật mới',
        changes: [
          {
            field: 'Yêu cầu cần đạt',
            old: ['YCCĐ giữ lại', 'YCCĐ cũ bị bỏ'],
            new: ['YCCĐ giữ lại', 'YCCĐ mới thêm']
          }
        ]
      },
      {
        status: 'changed',
        grade: 8,
        lesson_code: 'B5',
        lesson_name: 'Bài 5. Đổi tên bài',
        topic: 'Chủ đề 3',
        occurrences: 1,
        outcomes: ['YCCĐ hiện tại vẫn phải hiện rõ'],
        changes: [
          { field: 'Tên bài', old: 'Tên cũ', new: 'Bài 5. Đổi tên bài' }
        ]
      },
      {
        status: 'conflict',
        grade: 8,
        lesson_code: 'B6',
        lesson_name: 'Bài 6. Xung đột',
        topic: 'Chủ đề 4',
        occurrences: 1,
        outcomes: ['YCCĐ mới trong tệp xung đột'],
        conflict: {
          reason: 'Yêu cầu cần đạt đang có câu hỏi sử dụng sẽ bị bỏ hoặc thay.',
          outcomes: ['YCCĐ đang có câu hỏi sử dụng']
        }
      },
      {
        status: 'new',
        grade: 8,
        lesson_code: 'B7',
        lesson_name: 'Bài 7. Thiếu YCCĐ',
        topic: 'Chủ đề 4',
        occurrences: [{ week_raw: '10', periods_raw: '10' }],
        outcomes: []
      }
    ]
  };

  const sandbox = {
    store: { ppctImport: { report: previewReport } },
    esc: core.escapeHtml
  };
  vm.runInNewContext(
    `${appSource.slice(occStart, occEnd)}\n${appSource.slice(helperStart, helperEnd)}\n${appSource.slice(mdStart, cardEnd)}`,
    sandbox
  );

  const parsedMd = sandbox.parsePpctFromMarkdown(
    `| Tuần | Bài học | Số tiết | PPCT | Yêu cầu cần đạt | Phát triển năng lực số & AI | Ghi chú |\n` +
    `|:---:|---|:---:|:---:|---|---|---|\n` +
    `| Chủ đề A. Máy tính |\n` +
    `| 1 | Bài 1. Máy tính | 1 | 1 | - Hiểu cấu trúc máy tính | - 1.1.TC2a: Khai thác phần cứng | Chuẩn bị máy |\n` +
    `| 2 | Bài 1. Máy tính (tt) | 1 | 2 | - Vận dụng thành thạo hơn | - 5.1.TC2a: Tối ưu thao tác | Phòng máy 1 |`,
    8
  );
  assert.equal(parsedMd.length, 1);
  assert.equal(parsedMd[0].lesson_code, 'B1');
  assert.equal(parsedMd[0].occurrences.length, 2);
  assert.equal(parsedMd[0].occurrences[0].duration_raw, '1');
  assert.equal(parsedMd[0].occurrences[1].ppct_raw, '2');
  assert.deepEqual([...parsedMd[0].digital_competencies], ['1.1.TC2a: Khai thác phần cứng', '5.1.TC2a: Tối ưu thao tác']);
  assert.equal(parsedMd[0].notes, 'Chuẩn bị máy; Phòng máy 1');

  const mdFields = sandbox.ppctLessonFields(parsedMd[0]);
  assert.equal(mdFields.duration, '2');
  assert.equal(mdFields.ppct, '1, 2');

  const html = sandbox.ppctImportCard(8);
  assert.match(html, /<table class="ppct-table ppct-khdh-table">/);
  assert.doesNotMatch(html, /ppct-col-status|<th>Kết quả<\/th>/);
  assert.match(html, /<th class="ppct-col-week">Tuần<\/th>/);
  assert.match(html, /<th class="ppct-col-lesson">Bài học<\/th>/);
  assert.match(html, /<th class="ppct-col-duration">Số tiết<\/th>/);
  assert.match(html, /<th class="ppct-col-ppct">PPCT<\/th>/);
  assert.match(html, /<th class="ppct-col-outcomes">Yêu cầu cần đạt<\/th>/);
  assert.match(html, /<th class="ppct-col-nls">Phát triển năng lực số &amp; AI<\/th>/);
  assert.match(html, /<th class="ppct-col-notes">Ghi chú<\/th>/);
  assert.doesNotMatch(html, /<td class="small">/);
  assert.ok(html.includes('Trình bày được sơ lược lịch sử phát triển máy tính'));
  assert.ok(html.includes('Nêu được ví dụ &lt;script&gt;alert(1)&lt;/script&gt; tác động của công nghệ'));
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.ok(html.includes('1.1.TC2a: Khai thác học liệu số'));
  assert.ok(html.includes('5.1.TC2a: Đánh giá tác động của &lt;img src=x onerror=alert(1)&gt; AI'));
  assert.equal(html.includes('<img src=x onerror=alert(1)>'), false);
  assert.ok(html.includes('Thực hành theo nhóm'));
  assert.ok(html.includes('<td class="ppct-col-duration">2</td><td class="ppct-col-ppct">1, 2</td>'));
  assert.ok(html.includes('Nhận biết được thông tin số'));
  assert.ok(html.includes('Phân biệt được đặc điểm thông tin số'));
  assert.ok(html.includes('YCCĐ giữ nguyên để giáo viên đối chiếu'));
  assert.ok(html.includes('1.2.TC2a: Tìm kiếm thông tin'));
  assert.ok(html.includes('+ YCCĐ mới thêm'));
  assert.ok(html.includes('− YCCĐ cũ bị bỏ'));
  assert.ok(html.includes('Xem đủ 2 YCCĐ sau khi cập nhật'));
  assert.ok(html.includes('YCCĐ hiện tại vẫn phải hiện rõ'));
  assert.ok(html.includes('Yêu cầu cần đạt đang có câu hỏi sử dụng sẽ bị bỏ hoặc thay.'));
  assert.ok(html.includes('YCCĐ đang có câu hỏi sử dụng'));
  assert.ok(html.includes('Xem 1 YCCĐ trong tệp tải lên'));
  assert.ok(html.includes('Chưa có yêu cầu cần đạt (YCCĐ).'));

  // Kiểm tra cô lập theo môn học khi apply-import và clear-grade trên cùng Khối 8
  await h.window.FirebaseClient.handle('/api/ppct/apply-import', {
    grade: 8,
    subject_name: 'Vật lí',
    lessons: [
      {
        grade: 8,
        lesson_code: 'VL1',
        lesson_name_source: 'Bài 1. Chuyển động cơ',
        topic_source: 'Cơ học',
        occurrences: [{ week_raw: '1', duration_raw: '2', ppct_raw: '1, 2' }],
        outcomes: ['Nêu được ví dụ về chuyển động cơ']
      }
    ]
  });
  const afterTinApply = await h.window.FirebaseClient.handle('/api/ppct/apply-import', {
    grade: 8,
    subject_name: 'Tin học',
    lessons: report.lessons
  });
  assert.ok(afterTinApply.bank.ppct.lessons.some(l => l.subject_name === 'Vật lí' && Number(l.grade) === 8));
  assert.ok(afterTinApply.bank.ppct.lessons.some(l => l.subject_name === 'Tin học' && Number(l.grade) === 8));

  const afterTinClear = await h.window.FirebaseClient.handle('/api/ppct/clear-grade', {
    grade: 8,
    subject_name: 'Tin học'
  });
  assert.equal(afterTinClear.bank.ppct.lessons.some(l => l.subject_name === 'Tin học' && Number(l.grade) === 8), false);
  assert.equal(afterTinClear.bank.ppct.lessons.some(l => l.subject_name === 'Vật lí' && Number(l.grade) === 8), true);
});

function createTableDomParserMock() {
  return class MockDOMParser {
    parseFromString(html) {
      const stripTags = (raw) => String(raw || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
      const tableMatches = Array.from(String(html || '').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi));
      const tables = tableMatches.map((tm) => {
        const rowMatches = Array.from(tm[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
        const rows = rowMatches.map((rm) => {
          const cellMatches = Array.from(rm[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi));
          const cells = cellMatches.map((cm) => ({
            innerHTML: cm[2],
            textContent: stripTags(cm[2])
          }));
          return {
            querySelectorAll: (sel) => (sel.includes('td') || sel.includes('th') ? cells : [])
          };
        });
        return {
          querySelector: (sel) => (sel === 'tr' ? (rows[0] || null) : null),
          querySelectorAll: (sel) => (sel === 'tr' ? rows : [])
        };
      });
      return {
        querySelectorAll: (sel) => (sel === 'table' ? tables : [])
      };
    }
  };
}

test('PPCT THPT: Bridge JSON elective_topics, extracted_html multi-table Word, and save-lesson section/orientation', async () => {
  const h = bridgeHarness({ domParser: createTableDomParserMock() });

  // 1. HTML bóc tách từ Word gồm Mục II.1 cốt lõi (có lỗi "Bải 13", Ôn tập, KTĐK) + Mục II.2 Chuyên đề (kèm Thiết bị dạy học)
  const wordHtml = `
    <p>II.1. Phần cốt lõi môn Tin học 11</p>
    <table>
      <tr><th>Tuần</th><th>Bài học</th><th>Số tiết</th><th>PPCT</th><th>Yêu cầu cần đạt</th><th>Phát triển năng lực số &amp; AI</th><th>Ghi chú</th></tr>
      <tr><td colspan="7">Học kì 1</td></tr>
      <tr><td colspan="7">Chủ đề 1. Máy tính và xã hội tri thức</td></tr>
      <tr><td>1</td><td>Bài 1. Hệ điều hành</td><td>2</td><td>1, 2</td><td>- Trình bày được chức năng HĐH.</td><td>1.1.NC1a: Khai thác HĐH an toàn.</td><td></td></tr>
      <tr><td>5</td><td>Bải 13. Cơ sở dữ liệu</td><td>2</td><td>9, 10</td><td>- Giải thích được khái niệm CSDL.</td><td>1.2.NC1b</td><td>Chính tả Bải</td></tr>
      <tr><td>8</td><td>Ôn tập học kì 1</td><td>1</td><td>15</td><td>- Hệ thống kiến thức HK1.</td><td></td><td></td></tr>
      <tr><td>9</td><td>Kiểm tra giữa HK1</td><td>1</td><td>16</td><td>- Đánh giá giữa học kì 1.</td><td></td><td>TT 22/2021</td></tr>
    </table>
    <p>II.2. Chuyên đề học tập lựa chọn (ICT)</p>
    <table>
      <tr><th>Chuyên đề</th><th>Số tiết</th><th>Thiết bị dạy học</th><th>Yêu cầu cần đạt</th><th>Phát triển năng lực số &amp; AI</th><th>Ghi chú</th></tr>
      <tr><td>Chuyên đề 1: Quản trị dự án</td><td>10</td><td>Máy tính, mạng LAN</td><td>- Lập kế hoạch dự án bằng phần mềm.</td><td>2.2.NC1a</td><td></td></tr>
      <tr><td>Chuyên đề 2: Bảo vệ dữ liệu</td><td>10</td><td>Phòng máy</td><td>- Sao lưu và phân quyền dữ liệu.</td><td>4.2.NC1a</td><td></td></tr>
      <tr><td>Chuyên đề 3: Sản phẩm số</td><td>15</td><td>Máy tính</td><td>- Thiết kế sản phẩm số đa phương tiện.</td><td>3.1.NC1b</td><td>Tổng 35 tiết</td></tr>
    </table>
  `;
  const htmlReport = await h.window.FirebaseClient.handle('/api/ppct/inspect-import', {
    grade: 11,
    subject_name: 'Tin học',
    filename: 'KHDH_Tin_11_ICT.docx',
    extracted_html: wordHtml
  });
  assert.deepEqual(
    [...htmlReport.lessons.map(l => l.lesson_code)],
    ['B1', 'B13', 'OT_HK1', 'KTGK1', 'CD1', 'CD2', 'CD3']
  );
  const byCodeHtml = Object.fromEntries(htmlReport.lessons.map(l => [l.lesson_code, l]));
  assert.equal(byCodeHtml.B1.section, 'core');
  assert.equal(byCodeHtml.OT_HK1.section, 'review');
  assert.equal(byCodeHtml.KTGK1.section, 'assessment');
  assert.equal(byCodeHtml.CD1.section, 'elective_topic');
  assert.equal(byCodeHtml.CD1.orientation, 'ICT');
  assert.ok(byCodeHtml.CD1.notes.includes('Máy tính, mạng LAN'));

  // 2. Nhập JSON THPT có orientation + elective_topics và kiểm tra apply-import + save-lesson
  const jsonReport = await h.window.FirebaseClient.handle('/api/ppct/inspect-import', {
    grade: 10,
    subject_name: 'Tin học',
    filename: 'ppct_khoi_10_ict.json',
    json: {
      grade: 10,
      subject_name: 'Tin học',
      orientation: 'ICT',
      lessons: [
        {
          grade: 10,
          section: 'core',
          lesson_code: 'B1',
          lesson_name_source: 'Bài 1. Dữ liệu và thông tin',
          topic_source: 'Chủ đề 1',
          occurrences: [{ week_raw: '1', duration_raw: '2', ppct_raw: '1, 2' }],
          outcomes: ['Phân biệt thông tin và dữ liệu'],
          digital_competencies: ['1.1.NC1a: Tìm kiếm số'],
          notes: ''
        },
        {
          grade: 10,
          section: 'assessment',
          lesson_code: 'KTGK1',
          lesson_name_source: 'Kiểm tra giữa HK1',
          topic_source: 'Đánh giá định kỳ',
          occurrences: [{ week_raw: '9', duration_raw: '1', ppct_raw: '18' }],
          outcomes: ['Kiểm tra giữa kì 1'],
          digital_competencies: [],
          notes: ''
        }
      ],
      elective_topics: [
        {
          grade: 10,
          section: 'elective_topic',
          orientation: 'ICT',
          lesson_code: 'CD1',
          lesson_name_source: 'Chuyên đề 1: Quản trị dự án',
          topic_source: 'Chuyên đề lựa chọn',
          occurrences: [{ week_raw: '', duration_raw: '10', ppct_raw: '' }],
          outcomes: ['Lập kế hoạch dự án'],
          digital_competencies: ['2.2.NC1a'],
          notes: 'Phòng máy'
        },
        {
          grade: 10,
          section: 'elective_topic',
          orientation: 'ICT',
          lesson_code: 'CD2',
          lesson_name_source: 'Chuyên đề 2: Bảng tính',
          topic_source: 'Chuyên đề lựa chọn',
          occurrences: [{ week_raw: '', duration_raw: '10', ppct_raw: '' }],
          outcomes: ['Phân tích số liệu'],
          digital_competencies: [],
          notes: ''
        },
        {
          grade: 10,
          section: 'elective_topic',
          orientation: 'ICT',
          lesson_code: 'CD3',
          lesson_name_source: 'Chuyên đề 3: Thiết kế tài liệu',
          topic_source: 'Chuyên đề lựa chọn',
          occurrences: [{ week_raw: '', duration_raw: '15', ppct_raw: '' }],
          outcomes: ['Xuất bản tài liệu số'],
          digital_competencies: [],
          notes: ''
        }
      ]
    }
  });
  assert.equal(jsonReport.summary.new, 5);
  const applied = await h.window.FirebaseClient.handle('/api/ppct/apply-import', {
    grade: 10,
    subject_name: 'Tin học',
    lessons: jsonReport.lessons
  });
  const stored10 = applied.bank.ppct.lessons.filter(l => Number(l.grade) === 10);
  assert.equal(stored10.length, 5);
  const cd1 = stored10.find(l => l.lesson_code === 'CD1');
  assert.equal(cd1.section, 'elective_topic');
  assert.equal(cd1.orientation, 'ICT');

  // save-lesson thủ công cho chuyên đề mới không cần Tuần/PPCT
  const afterSave = await h.window.FirebaseClient.handle('/api/ppct/save-lesson', {
    lesson: {
      grade: 10,
      subject_name: 'Tin học',
      section: 'elective_topic',
      orientation: 'CS',
      lesson_code: 'CD4',
      lesson_name_source: 'Chuyên đề 4: Thuật toán nâng cao',
      topic_source: 'Chuyên đề lựa chọn',
      week_raw: '',
      duration_raw: '10',
      ppct_raw: '',
      outcomes: ['Phân tích độ phức tạp thuật toán'],
      digital_competencies: ['5.2.NC1a'],
      notes: 'Định hướng CS'
    }
  });
  const cd4 = afterSave.bank.ppct.lessons.find(l => Number(l.grade) === 10 && l.lesson_code === 'CD4');
  assert.equal(cd4.section, 'elective_topic');
  assert.equal(cd4.orientation, 'CS');
  assert.equal(cd4.occurrences[0].week_raw, '');
});

test('PPCT THPT & THCS: parsePpctFromMarkdown multi-table, ppctImportCard compliance banner, and validateMatrix guard', () => {
  const appSource = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  const occStart = appSource.indexOf('function safeLessonOccurrences(');
  const occEnd = appSource.indexOf('const lessons=(g,subj)=>');
  const helperStart = appSource.indexOf('function renderPpctListCell(');
  const helperEnd = appSource.indexOf('function renderPPCT(');
  const mdStart = appSource.indexOf('function parsePpctFromMarkdown(');
  const cardStart = appSource.indexOf('function ppctImportCard(');
  const cardEnd = appSource.indexOf('function bindPpctImport(');
  const sandbox = {
    store: {
      ppctImport: null,
      ppctGrade: 10,
      ppctSubject: 'Tin học'
    },
    esc: core.escapeHtml
  };
  vm.runInNewContext(
    `${appSource.slice(occStart, occEnd)}\n${appSource.slice(helperStart, helperEnd)}\n${appSource.slice(mdStart, cardEnd)}`,
    sandbox
  );

  const mdThpt = `# Kế hoạch dạy học Tin học 10\n\n## II.1. Phần cốt lõi (ICT)\n\n| Tuần | Bài học | Số tiết | PPCT | Yêu cầu cần đạt | Phát triển năng lực số & AI | Ghi chú |\n|:---:|---|:---:|:---:|---|---|---|\n| 1 | Bài 1. Thông tin và xử lí thông tin | 2 | 1, 2 | - Phân biệt thông tin và dữ liệu | - 1.1.NC1a: Tìm kiếm số | Chuẩn bị |\n| 9 | Kiểm tra giữa học kì 1 | 1 | 18 | - Đánh giá GK1 | | |\n\n## II.2. Chuyên đề học tập lựa chọn (ICT)\n\n| Chuyên đề | Số tiết | Thiết bị dạy học | Yêu cầu cần đạt | Phát triển năng lực số & AI | Ghi chú |\n|---|:---:|---|---|---|---|\n| Chuyên đề 1: Quản trị dự án | 10 | Máy tính kết nối mạng | - Lập kế hoạch dự án | - 2.2.NC1a: Hợp tác số | ICT |\n| Chuyên đề 2: Bảo vệ dữ liệu | 10 | Phòng máy | - Sao lưu dữ liệu | - 4.2.NC1a: An toàn số | |\n| Chuyên đề 3: Thiết kế sản phẩm số | 15 | Phòng máy | - Thiết kế ấn phẩm số | - 3.1.NC1b: Sáng tạo số | |\n`;

  const parsed = sandbox.parsePpctFromMarkdown(mdThpt, 10);
  assert.deepEqual([...parsed.map(x => x.lesson_code)], ['B1', 'KTGK1', 'CD1', 'CD2', 'CD3']);
  assert.equal(parsed[0].section, 'core');
  assert.equal(parsed[1].section, 'assessment');
  assert.equal(parsed[2].section, 'elective_topic');
  assert.equal(parsed[2].orientation, 'ICT');
  assert.ok(parsed[2].notes.includes('Máy tính kết nối mạng'));

  // Kiểm định cảnh báo chuẩn 70+35 tiết và bậc NLS TC1/TC2/NC1
  const badSummary = sandbox.validatePpctCompliance(10, 'Tin học', [
    { grade: 10, lesson_code: 'B1', section: 'core', occurrences: [{ duration_raw: '2' }], digital_competencies: ['1.1.TC2a: Sai bậc lớp 10'] },
    { grade: 10, lesson_code: 'CD1', section: 'elective_topic', occurrences: [{ duration_raw: '25' }], digital_competencies: [] }
  ]);
  assert.equal(badSummary.expectedNls, 'NC1');
  assert.equal(badSummary.corePeriods, 2);
  assert.equal(badSummary.electivePeriods, 25);
  assert.ok(badSummary.alerts.some(a => a.text.includes('70 tiết')));
  assert.ok(badSummary.alerts.some(a => a.text.includes('35 tiết')));
  assert.ok(badSummary.alerts.some(a => a.text.includes('NC1') && a.text.includes('TC2')));

  const goodSummary = sandbox.validatePpctCompliance(10, 'Tin học', [
    { grade: 10, lesson_code: 'B1', section: 'core', occurrences: [{ duration_raw: '70' }], digital_competencies: ['1.1.NC1a: Đúng bậc THPT'] },
    { grade: 10, lesson_code: 'CD1', section: 'elective_topic', occurrences: [{ duration_raw: '35' }], digital_competencies: [] }
  ]);
  assert.equal(goodSummary.alerts.some(a => a.level === 'err' || a.level === 'warn'), false);

  // Giao diện xem trước nhập Khối 10: có banner hợp chuẩn, đủ 7 cột cốt lõi + bảng II.2 Chuyên đề, không có cột Kết quả
  sandbox.store.ppctImport = {
    report: {
      filename: 'KHDH_10.md',
      grades: [10],
      subject_name: 'Tin học',
      summary: { new: 5, changed: 0, unchanged: 0, conflict: 0 },
      lessons: parsed.map(item => ({
        ...item,
        lesson_name: item.lesson_name_source,
        topic: item.topic_source,
        status: 'new'
      }))
    }
  };
  const previewHtml = sandbox.ppctImportCard(10);
  assert.match(previewHtml, /class="ppct-compliance-box"/);
  assert.match(previewHtml, /ppct-khdh-table/);
  assert.match(previewHtml, /Mục II\.2 · Chuyên đề học tập lựa chọn THPT/);
  assert.match(previewHtml, /ppct-elective-table/);
  assert.doesNotMatch(previewHtml, /ppct-col-status|<th>Kết quả<\/th>/);
  assert.doesNotMatch(previewHtml, /<td class="small">/);

  // Guard ma trận: chặn Chuyên đề THPT trong kiểm tra định kỳ (GK/CK), cho phép ở kiểm tra thường xuyên (TX)
  const d = fixture();
  const ppctWithCd = {
    lessons: [
      {
        grade: 10,
        subject_name: 'Tin học',
        lesson_code: 'CD1',
        section: 'elective_topic',
        orientation: 'ICT',
        lesson_name_source: 'Chuyên đề 1: Quản trị dự án',
        outcomes: ['Lập kế hoạch dự án']
      }
    ]
  };
  const matrixGk1 = {
    ...d.matrices[0],
    grade: 10,
    exam_type: 'GK1',
    lessons: [{ lesson_code: 'CD1', section: 'elective_topic', outcomes: ['Lập kế hoạch dự án'] }],
    requirements: d.matrices[0].requirements.map(r => ({
      ...r,
      lesson_code: 'CD1',
      learning_outcome: 'Lập kế hoạch dự án'
    }))
  };
  const resGk1 = engine.validateMatrix(matrixGk1, ppctWithCd);
  assert.equal(resGk1.valid, false);
  const cdErr = resGk1.errors.find(e => e.code === 'elective_in_periodic');
  assert.ok(cdErr);
  assert.match(cdErr.message, /TT 22\/2021/);

  const resTx = engine.validateMatrix({ ...matrixGk1, exam_type: 'TX' }, ppctWithCd);
  assert.equal(resTx.errors.some(e => e.code === 'elective_in_periodic'), false);
});

test('5 phân hệ nâng cấp: core.js, matrices.js CV 7991, static-exam-engine Khối 6–12 và app.js UI helpers', () => {
  const matricesUi = require('../public/matrices.js');

  // 1. core.js: filterQuestions / reviewQueue với section, cleanExamDraft SHORT, convertKttxScoreTo10
  const qs = [
    { id: 'q1', grade: 10, lesson_code: 'B1', ppct_section: 'core', type: 'MC', level: 'Biết', review_status: 'pending_review', question: 'Câu cốt lõi' },
    { id: 'q2', grade: 10, lesson_code: 'CD1', ppct_section: 'elective_topic', type: 'SHORT', level: 'Hiểu', review_status: 'pending_review', question: 'Câu chuyên đề' },
  ];
  assert.deepEqual(core.filterQuestions(qs, { section: 'elective_topic' }).map(q => q.id), ['q2']);
  assert.deepEqual(core.reviewQueue(qs, { status: 'pending_review', section: 'core' }).map(q => q.id), ['q1']);
  const cleanedDraft = core.cleanExamDraft({
    grade: 10,
    exam_type: 'GK1',
    blueprint: [{ lesson_code: 'B1', type: 'SHORT', level: 'Vận dụng', count: 2, points_per_question: 0.5 }],
  }, { grades: [10], lessons: [{ lesson_code: 'B1', outcomes: [] }] });
  assert.equal(cleanedDraft.blueprint.length, 1);
  assert.equal(cleanedDraft.blueprint[0].type, 'SHORT');
  assert.equal(core.convertKttxScoreTo10('15', '20'), 8);
  assert.throws(() => core.convertKttxScoreTo10('25', '20'));

  // 2. matrices.js: computeCv7991Warnings (SHORT == 0 -> YN target 4, VD+VDC quy đổi kỹ thuật)
  const cvOkNoShort = matricesUi.computeCv7991Warnings({
    profile: 'THPT',
    exam_type: 'GK1',
    requirements: [
      { id: 'r1', level: 'Biết' },
      { id: 'r2', level: 'Hiểu' },
      { id: 'r3', level: 'Vận dụng cao' },
    ],
    slots: [
      { kind: 'MC', parts: [{ requirement_id: 'r1', points: 3 }] },
      { kind: 'YN', parts: [{ requirement_id: 'r1', points: 1 }, { requirement_id: 'r2', points: 3 }] },
      { kind: 'ES', parts: [{ requirement_id: 'r3', points: 3 }] },
    ],
  });
  assert.deepEqual(cvOkNoShort, []);

  const cvWarnSplit = matricesUi.computeCv7991Warnings({
    profile: 'THPT',
    exam_type: 'CK1',
    requirements: [
      { id: 'r1', level: 'Biết' },
      { id: 'r2', level: 'Vận dụng cao' },
    ],
    slots: [
      { kind: 'MC', parts: [{ requirement_id: 'r1', points: 5 }] },
      { kind: 'ES', parts: [{ requirement_id: 'r2', points: 5 }] },
    ],
  });
  assert.ok(cvWarnSplit.some(w => w.code === 'ratio_level' && w.message.includes('Vận dụng cao')));

  // 3. static-exam-engine & static-exam-workflow: Khối 6-12 + elective_in_thcs + lesson_non_instructional
  const d = fixture();
  const ppctAll = {
    lessons: [
      { grade: 6, lesson_code: 'B1', outcomes: ['YCCĐ 6'] },
      { grade: 8, lesson_code: 'CD1', section: 'elective_topic', lesson_name_source: 'Chuyên đề', topic_source: 'Chuyên đề', outcomes: ['YCCĐ CD'] },
      { grade: 11, lesson_code: 'KTGK1', section: 'assessment', lesson_name_source: 'Kiểm tra giữa HK1', topic_source: 'Đánh giá', outcomes: ['Đánh giá'] },
    ],
  };
  const mxThcsCd = engine.validateMatrix({
    ...d.matrices[0],
    grade: 8,
    exam_type: 'GK1',
    lessons: [{ lesson_code: 'CD1', outcomes: ['YCCĐ CD'] }],
    requirements: d.matrices[0].requirements.map(r => ({ ...r, lesson_code: 'CD1', learning_outcome: 'YCCĐ CD' })),
  }, ppctAll);
  assert.ok(mxThcsCd.errors.some(e => e.code === 'elective_in_thcs'));

  const mxNonInst = engine.validateMatrix({
    ...d.matrices[0],
    grade: 11,
    profile: 'THPT',
    exam_type: 'GK1',
    lessons: [{ lesson_code: 'KTGK1', outcomes: ['Đánh giá'] }],
    requirements: d.matrices[0].requirements.map(r => ({ ...r, lesson_code: 'KTGK1', learning_outcome: 'Đánh giá' })),
  }, ppctAll);
  assert.ok(mxNonInst.errors.some(e => e.code === 'lesson_non_instructional'));

  assert.deepEqual(workflow.technicalProblems({
    grade: 6, lesson_code: 'B1', type: 'MC', level: 'Biết', learning_outcome: 'YCCĐ 6',
    question: 'Câu hỏi Tin học 6 hợp lệ?', options: ['A', 'B', 'C', 'D'], correct: 0,
    option_explanations: ['Đúng', 'Sai', 'Sai', 'Sai'],
  }), []);
  assert.ok(workflow.technicalProblems({
    grade: 5, lesson_code: 'B1', type: 'MC', level: 'Biết', learning_outcome: 'YCCĐ 5',
    question: 'Khối 5 ngoài phạm vi?', options: ['A', 'B', 'C', 'D'], correct: 0,
  }).length > 0);

  // 4. app.js: buildRevisionSheetHtml bảo mật SHORT cho học sinh + hiện cho GV; lessonPickerTable cột YN/SHORT
  const appSource = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  const buildersCode = appSource.slice(appSource.indexOf('function mcColsClass('), appSource.indexOf('function mountExamViewerContent('));
  const revUi = new Function('C', 'esc', 'subject', 'fmtPts', 'scaledPolicy', 'countRecord', 'revisionGoals', 'schoolProfile', 'store', `${buildersCode}; return {buildRevisionSheetHtml};`)(
    core, core.escapeHtml, () => 'Tin học', n => String(n), () => '', r => (r.questions || []).length, () => [], () => false, { context: { school_year: '2026-2027' } }
  );
  const revWithShort = {
    title: 'Đề cương Tin 10', grade: 10,
    questions: [{ id: 'S1', slot_number: 1, type: 'SHORT', level: 'Vận dụng', lesson_code: 'B1', question: 'Đáp số?', short_answer: 'SECRET_42', points: 0.5 }],
  };
  const studentHtml = revUi.buildRevisionSheetHtml(revWithShort, false);
  const teacherHtml = revUi.buildRevisionSheetHtml(revWithShort, true);
  assert.equal(studentHtml.includes('SECRET_42'), false);
  assert.ok(teacherHtml.includes('SECRET_42'));
  assert.match(teacherHtml, /BẢNG ĐÁP ÁN TRẢ LỜI NGẮN/);

  const pickerCode = appSource.slice(appSource.indexOf('function lessonPickerTable('), appSource.indexOf('function revisionMatrixPanel('));
  const { lessonPickerTable } = new Function('esc', `${pickerCode}; return {lessonPickerTable};`)(core.escapeHtml);
  const thcsPicker = lessonPickerTable([{ lesson_code: 'B1', type: 'MC', need: 4, available: 6 }, { lesson_code: 'B1', type: 'ES', need: 1, available: 2 }], 'rev', {});
  assert.doesNotMatch(thcsPicker, /data-rev-lesson-yn|data-rev-lesson-short/);
  const thptPicker = lessonPickerTable([
    { lesson_code: 'B1', type: 'MC', need: 4, available: 6 },
    { lesson_code: 'B1', type: 'YN', need: 1, available: 2 },
    { lesson_code: 'B1', type: 'SHORT', need: 2, available: 3 },
    { lesson_code: 'B1', type: 'ES', need: 1, available: 2 },
  ], 'rev', {});
  assert.match(thptPicker, /data-rev-lesson-yn/);
  assert.match(thptPicker, /data-rev-lesson-short/);

  // 5. CV 7991/6569 questionQualityWarnings (9 rules) & Prompt AI + Sample questions compliance
  const catalogLib = require('../public/competency-catalog.js');
  const codesOf = q => core.questionQualityWarnings(q).map(w => w.code);
  const cleanMc = {
    type: 'MC',
    question: 'Trong bảng tính Excel, kí hiệu $A$1 là loại địa chỉ ô nào?',
    options: ['Địa chỉ tương đối', 'Địa chỉ tuyệt đối', 'Địa chỉ hỗn hợp cột', 'Địa chỉ hỗn hợp hàng'],
    correct: 1,
  };
  assert.deepEqual(codesOf(cleanMc), []);
  assert.deepEqual(codesOf({ ...cleanMc, question: 'Phát biểu nào sau đây KHÔNG đúng về RAM?' }), []);
  assert.deepEqual(codesOf({ ...cleanMc, question: 'Phát biểu nào sau đây **không đúng** về RAM?' }), []);
  assert.ok(codesOf({ ...cleanMc, options: ['A', 'B', 'C', 'Tất cả các đáp án trên đều đúng'] }).includes('mc_banned_option'));
  assert.ok(codesOf({ ...cleanMc, question: 'Phát biểu nào sau đây không đúng về RAM?' }).includes('mc_unemphasized_negation'));
  assert.ok(codesOf({ ...cleanMc, question: 'Phát biểu nào sau đây KHÔNG đúng?', options: ['Không thể ghi dữ liệu', 'B', 'C', 'D'] }).includes('mc_double_negation'));
  assert.ok(codesOf({ ...cleanMc, question: 'Bộ nhớ ____ dùng để lưu dữ liệu tạm thời.' }).includes('mc_inline_blank'));
  assert.ok(codesOf({ ...cleanMc, options: ['RAM', 'ROM', 'CPU', 'Thiết bị lưu trữ dữ liệu tạm thời tốc độ cao phục vụ trực tiếp cho bộ vi xử lí'] }).includes('mc_length_imbalance'));
  assert.ok(codesOf({ ...cleanMc, options: ['Luôn luôn an toàn trong mọi trường hợp', 'Phương án B', 'Phương án C', 'Phương án D'] }).includes('mc_vague_or_absolute'));
  assert.ok(codesOf({
    type: 'YN',
    question: 'Khi sử dụng thư điện tử (Email) trong học tập và công việc:',
    statements: [
      { label: 'a', text: 'Ý 1', correct: true },
      { label: 'b', text: 'Ý 2', correct: true },
      { label: 'c', text: 'Ý 3', correct: true },
      { label: 'd', text: 'Ý 4', correct: true },
    ],
  }).includes('yn_context_or_balance'));
  assert.ok(codesOf({ type: 'SHORT', question: 'Đáp số?', short_answer: '15 cm' }).includes('short_answer_format'));
  assert.ok(codesOf({ type: 'SHORT', question: 'Đáp số?', short_answer: '12345' }).includes('short_answer_format'));
  assert.ok(codesOf({ type: 'ES', question: 'Ngắn?', rubric: [] }).includes('es_rubric_or_prompt'));

  const rulesCode = appSource.slice(appSource.indexOf('function nlsCodeForGrade('), appSource.indexOf('function downloadBankJsonSample('));
  const promptHelpers = new Function('C', 'esc', 'subject', 'window', `${rulesCode}; return {qualityWarningsHtml, subjectCompetencyGuideText, cv7991QuestionRulesBlock, sampleQuestionsByGrade};`)(
    core, core.escapeHtml, () => 'Tin học', { BankCompetencyCatalog: catalogLib }
  );
  for (const g of [8, 10]) {
    for (const q of promptHelpers.sampleQuestionsByGrade(g, 'Tin học')) {
      assert.deepEqual(core.questionQualityWarnings(q), [], `Sample question ${q.id} must have 0 quality warnings`);
    }
  }
  const mathBlock = promptHelpers.cv7991QuestionRulesBlock(10, 'Toán', 'GK1');
  assert.match(mathBlock, /CV 7991\/BGDĐT-GDTrH/);
  assert.match(mathBlock, /1\.a — 11 tiêu chí/);
  assert.match(mathBlock, /1\.b — 9 tiêu chí/);
  assert.match(mathBlock, /1\.c — 16 tiêu chí/);
  assert.match(mathBlock, /TDLL: Tư duy và lập luận toán học/);
  const litBlock = promptHelpers.cv7991QuestionRulesBlock(10, 'Ngữ văn', 'CK1');
  assert.match(litBlock, /ĐỌC: Năng lực đọc hiểu văn bản/);
  assert.match(litBlock, /VIẾT: Năng lực tạo lập văn bản/);
});


