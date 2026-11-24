const assert = require('node:assert/strict');
const CloudStorageV2 = require('../public/cloud-storage-v2.js');
const GoogleDriveStorage = require('../public/google-drive-storage.js');

function makeFirestoreMock() {
  const store = new Map();
  const keyOf = (segs) => segs.join('/');

  const db = { store };
  const helpers = {
    doc(_db, ...segs) {
      return { path: keyOf(segs), id: segs[segs.length - 1] };
    },
    collection(_db, ...segs) {
      return { path: keyOf(segs) };
    },
    async getDoc(ref) {
      const val = store.get(ref.path);
      return {
        id: ref.id,
        exists: () => val !== undefined,
        data: () => (val === undefined ? undefined : JSON.parse(JSON.stringify(val)))
      };
    },
    async getDocs(colRef) {
      const prefix = colRef.path + '/';
      const docs = [];
      for (const [k, v] of store.entries()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        if (rest.includes('/')) continue;
        docs.push({
          id: rest,
          data: () => JSON.parse(JSON.stringify(v))
        });
      }
      return {
        docs,
        forEach(fn) { docs.forEach(fn); }
      };
    },
    async setDoc(ref, data) {
      store.set(ref.path, JSON.parse(JSON.stringify(data)));
    },
    async deleteDoc(ref) {
      store.delete(ref.path);
    },
    writeBatch() {
      const ops = [];
      return {
        set(ref, data) { ops.push({ type: 'set', path: ref.path, data }); },
        delete(ref) { ops.push({ type: 'delete', path: ref.path }); },
        async commit() {
          for (const op of ops) {
            if (op.type === 'set') store.set(op.path, JSON.parse(JSON.stringify(op.data)));
            else store.delete(op.path);
          }
        }
      };
    }
  };
  return { db, helpers, store };
}

function makeDriveFetchMock() {
  let seq = 1;
  const items = new Map(); // id -> { id, name, mimeType, parents, trashed, modifiedTime, content }

  function parseMultipart(bodyStr) {
    const boundaryLine = String(bodyStr || '').split(/\r?\n/)[0] || '';
    const boundary = boundaryLine.trim();
    const parts = String(bodyStr || '')
      .split(boundary)
      .slice(1, -1)
      .map(p => {
        const idx = p.indexOf('\r\n\r\n');
        const body = idx >= 0 ? p.slice(idx + 4) : p;
        return body.replace(/\r\n$/, '');
      });
    return {
      meta: JSON.parse(parts[0] || '{}'),
      content: parts[1] || '{}'
    };
  }

  function decodeQuery(urlStr) {
    const u = new URL(urlStr);
    const q = u.searchParams.get('q') || '';
    const nameMatch = q.match(/name\s*=\s*'([^']*)'/);
    const mimeMatch = q.match(/mimeType\s*=\s*'([^']*)'/);
    const parentMatch = q.match(/'([^']*)'\s+in\s+parents/);
    return {
      url: u,
      name: nameMatch ? nameMatch[1].replace(/\\'/g, "'") : null,
      mimeType: mimeMatch ? mimeMatch[1] : null,
      parent: parentMatch ? parentMatch[1] : null
    };
  }

  const fetchImpl = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    const urlStr = String(url);

    // Upload multipart or media (POST create or PATCH update)
    if (urlStr.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      const isMedia = urlStr.includes('uploadType=media');
      const urlObj = new URL(urlStr);
      const pathParts = urlObj.pathname.split('/');
      const existingId = method === 'PATCH' ? decodeURIComponent(pathParts[pathParts.length - 1]) : null;
      if (isMedia && existingId && items.has(existingId)) {
        const cur = items.get(existingId);
        cur.content = String(opts.body || '{}');
        cur.modifiedTime = new Date().toISOString();
        return {
          ok: true,
          status: 200,
          async text() { return JSON.stringify({ id: cur.id, name: cur.name, modifiedTime: cur.modifiedTime }); },
          async json() { return { id: cur.id, name: cur.name, modifiedTime: cur.modifiedTime }; }
        };
      }
      const parsed = parseMultipart(opts.body);
      if (existingId && items.has(existingId)) {
        const cur = items.get(existingId);
        cur.content = parsed.content;
        cur.name = parsed.meta.name || cur.name;
        cur.modifiedTime = new Date().toISOString();
        return {
          ok: true,
          status: 200,
          async text() { return JSON.stringify({ id: cur.id, name: cur.name, modifiedTime: cur.modifiedTime }); },
          async json() { return { id: cur.id, name: cur.name, modifiedTime: cur.modifiedTime }; }
        };
      }
      const id = 'drv-' + (seq++);
      const rec = {
        id,
        name: parsed.meta.name,
        mimeType: parsed.meta.mimeType || 'application/json',
        parents: parsed.meta.parents || [],
        trashed: false,
        modifiedTime: new Date().toISOString(),
        content: parsed.content
      };
      items.set(id, rec);
      return {
        ok: true,
        status: 200,
        async text() { return JSON.stringify({ id, name: rec.name, modifiedTime: rec.modifiedTime }); },
        async json() { return { id, name: rec.name, modifiedTime: rec.modifiedTime }; }
      };
    }

    // Read file content (?alt=media)
    if (urlStr.includes('alt=media') && method === 'GET') {
      const urlObj = new URL(urlStr);
      const parts = urlObj.pathname.split('/');
      const fileId = decodeURIComponent(parts[parts.length - 1]);
      const rec = items.get(fileId);
      if (!rec) {
        return { ok: false, status: 404, async text() { return 'Not found'; } };
      }
      return {
        ok: true,
        status: 200,
        async text() { return rec.content; },
        async json() { return JSON.parse(rec.content); }
      };
    }

    // List children or search files
    if (urlStr.startsWith('https://www.googleapis.com/drive/v3/files') && method === 'GET') {
      const q = decodeQuery(urlStr);
      const files = [...items.values()].filter(it => {
        if (it.trashed) return false;
        if (q.name !== null && it.name !== q.name) return false;
        if (q.mimeType !== null && it.mimeType !== q.mimeType) return false;
        if (q.parent !== null) {
          if (q.parent === 'root') {
            if (it.parents.length && !it.parents.includes('root')) return false;
          } else if (!it.parents.includes(q.parent)) {
            return false;
          }
        }
        return true;
      }).map(it => ({ id: it.id, name: it.name, mimeType: it.mimeType, modifiedTime: it.modifiedTime }));
      return {
        ok: true,
        status: 200,
        async text() { return JSON.stringify({ files }); },
        async json() { return { files }; }
      };
    }

    // Create folder metadata JSON
    if (urlStr.startsWith('https://www.googleapis.com/drive/v3/files') && method === 'POST') {
      const meta = JSON.parse(opts.body || '{}');
      const id = 'fld-' + (seq++);
      const rec = {
        id,
        name: meta.name,
        mimeType: meta.mimeType || 'application/vnd.google-apps.folder',
        parents: meta.parents || ['root'],
        trashed: false,
        modifiedTime: new Date().toISOString(),
        content: ''
      };
      items.set(id, rec);
      return {
        ok: true,
        status: 200,
        async text() { return JSON.stringify({ id, name: rec.name }); },
        async json() { return { id, name: rec.name }; }
      };
    }

    // Patch metadata (e.g. trash)
    if (urlStr.startsWith('https://www.googleapis.com/drive/v3/files/') && method === 'PATCH') {
      const urlObj = new URL(urlStr);
      const parts = urlObj.pathname.split('/');
      const fileId = decodeURIComponent(parts[parts.length - 1]);
      const patch = JSON.parse(opts.body || '{}');
      const rec = items.get(fileId);
      if (rec) Object.assign(rec, patch);
      return {
        ok: true,
        status: 200,
        async text() { return JSON.stringify({ id: fileId }); },
        async json() { return { id: fileId }; }
      };
    }

    throw new Error('Unhandled Drive URL in mock: ' + method + ' ' + urlStr);
  };

  function getFolderPathForItem(rec) {
    const names = [];
    let cur = rec;
    while (cur && cur.parents && cur.parents.length) {
      const pid = cur.parents[0];
      if (pid === 'root') break;
      const p = items.get(pid);
      if (!p) break;
      names.unshift(p.name);
      cur = p;
    }
    return names.join('/');
  }

  return { fetchImpl, items, getFolderPathForItem };
}

function makeSampleWorkspace() {
  return {
    profile: {
      active_grades: [8, 9, 10],
      default_grade: 8,
      active_subject: 'Tin học',
      school_year: '2026-2027'
    },
    bank: {
      subject_name: 'Tin học',
      school_year: '2026-2027',
      ppct: {
        lessons: [
          { grade: 8, lesson_code: 'B1', lesson_name_source: 'Lược sử công cụ tính toán', subject_name: 'Tin học', outcomes: ['Nêu được lịch sử máy tính'] },
          { grade: 9, lesson_code: 'B1', lesson_name_source: 'Thế giới kĩ thuật số', subject_name: 'Tin học', outcomes: ['Nhận biết bộ xử lí'] },
          { grade: 10, lesson_code: 'B1', lesson_name_source: 'Thông tin và xử lí thông tin', subject_name: 'Tin học', section: 'core', outcomes: ['Phân biệt dữ liệu và thông tin'] }
        ],
        cleared_grades: [7]
      },
      competency_catalogs: [
        { subject_name: 'Tin học', school_year: '2026-2027', competencies: [{ code: 'NLa', name: 'Sử dụng CNTT' }] }
      ],
      questions: [
        { id: 'Q8-1', grade: 8, lesson_code: 'B1', subject_name: 'Tin học', type: 'MC', level: 'Biết', question: 'Câu 8.1', options: ['A', 'B', 'C', 'D'], correct: 0, review_status: 'approved' },
        { id: 'Q9-1', grade: 9, lesson_code: 'B1', subject_name: 'Tin học', type: 'MC', level: 'Hiểu', question: 'Câu 9.1', options: ['A', 'B', 'C', 'D'], correct: 1, review_status: 'approved' },
        { id: 'Q10-1', grade: 10, lesson_code: 'B1', subject_name: 'Tin học', type: 'YN', level: 'Vận dụng', question: 'Câu 10.1', statements: ['S1', 'S2', 'S3', 'S4'], review_status: 'draft' }
      ]
    },
    matrices: [
      { id: 'MX-8', grade: 8, subject_name: 'Tin học', title: 'Ma trận 8', school_year: '2026-2027' },
      { id: 'MX-10', grade: 10, subject_name: 'Tin học', title: 'Ma trận 10', school_year: '2026-2027' }
    ],
    revisions: [
      { id: 'REV-9', grade: 9, subject_name: 'Tin học', title: 'Đề cương 9', question_ids: ['Q9-1'] }
    ],
    exams: [
      { id: 'EX-8', grade: 8, subject_name: 'Tin học', title: 'Đề GK1 K8', questions: [] }
    ],
    assessment_plans: [
      { id: 'AP-8', grade: 8, subject_name: 'Tin học', name: 'Kế hoạch K8' }
    ],
    kttx: [
      { id: 'KT-10', grade: 10, subject_name: 'Tin học', title: 'TX1 K10' }
    ]
  };
}

async function runTests() {
  // 1. Exports check
  assert.equal(Object.keys(CloudStorageV2).length, 31, 'CloudStorageV2 must export 31 members');

  // 2. GoogleDriveStorage v1 payload preserves assessment_plans, kttx, profile
  {
    const sample = makeSampleWorkspace();
    const v1Payload = GoogleDriveStorage.buildWorkspacePayload({
      bank: sample.bank,
      exams: sample.exams,
      revisions: sample.revisions,
      matrices: sample.matrices,
      assessment_plans: sample.assessment_plans,
      kttx: sample.kttx,
      profile: sample.profile
    });
    const unwrapped = GoogleDriveStorage.unwrapWorkspacePayload(v1Payload);
    assert.equal(unwrapped.data.assessment_plans.length, 1);
    assert.equal(unwrapped.data.kttx.length, 1);
    assert.deepEqual(unwrapped.data.profile.active_grades, [8, 9, 10]);
    console.log('PASS v1 payload preserves assessment_plans, kttx, and profile');
  }

  // 3. splitWorkspaceIntoSlices + assembleWorkspaceFromSlices round-trip
  {
    const sample = makeSampleWorkspace();
    sample.profile.active_grade = 8;
    const slices = CloudStorageV2.splitWorkspaceIntoSlices(sample);
    const scopeKey = CloudStorageV2.scopeKeyFor('2026-2027', 'Tin học');
    const scope = slices.scopes[scopeKey];
    assert.ok(scope, `Scope key ${scopeKey} must exist`);
    assert.equal(scope.grades['7'].ppct.cleared, true, 'Cleared grade 7 flag preserved');
    assert.equal(scope.grades['8'].questions.length, 1);
    assert.equal(scope.grades['9'].questions.length, 1);
    assert.equal(scope.grades['10'].questions.length, 1);

    const assembled = CloudStorageV2.assembleWorkspaceFromSlices(slices);
    assert.equal(assembled.bank.questions.length, 3);
    assert.equal(assembled.bank.ppct.lessons.length, 3);
    assert.ok(assembled.bank.ppct.cleared_grades.includes(7), 'cleared_grades must include 7');
    assert.ok(assembled.bank.ppct.cleared_grades.includes('Tin học:7'), 'cleared_grades must include Tin học:7');
    assert.equal(assembled.bank.competency_catalogs.length, 1);
    assert.equal(assembled.matrices.length, 2);
    assert.equal(assembled.revisions.length, 1);
    assert.equal(assembled.exams.length, 1);
    assert.equal(assembled.assessment_plans.length, 1);
    assert.equal(assembled.kttx.length, 1);
    assert.deepEqual(assembled.profile.active_grades, [8, 9, 10]);
    assert.equal(assembled.profile.active_grade, 8);
    console.log('PASS splitWorkspaceIntoSlices & assembleWorkspaceFromSlices round-trip');
  }

  // 4. chunkQuestionsByLesson (>=250 questions in one lesson -> chunks <= 100 each)
  {
    const qs250 = Array.from({ length: 250 }, (_, i) => ({
      id: `Q8-BULK-${String(i + 1).padStart(3, '0')}`,
      grade: 8,
      lesson_code: 'B1',
      subject_name: 'Tin học',
      question: `Câu ${i + 1}`
    }));
    const chunks = CloudStorageV2.chunkQuestionsByLesson(qs250, 100, { grade: 8, subject_name: 'Tin học' });
    const chunkKeys = Object.keys(chunks).sort();
    assert.equal(chunkKeys.length, 3, '250 questions must split into 3 chunks (max 100)');
    assert.equal(chunks[chunkKeys[0]].questions.length, 100);
    assert.equal(chunks[chunkKeys[1]].questions.length, 100);
    assert.equal(chunks[chunkKeys[2]].questions.length, 50);

    const wsBig = makeSampleWorkspace();
    wsBig.bank.questions = qs250;
    const round = CloudStorageV2.assembleWorkspaceFromSlices(CloudStorageV2.splitWorkspaceIntoSlices(wsBig));
    assert.equal(round.bank.questions.length, 250);
    console.log('PASS chunkQuestionsByLesson (250 questions -> 3 chunks max 100)');
  }

  // 5. diffSlices strict grade isolation (editing Khối 10 emits zero Khối 8/9 ops)
  {
    const before = makeSampleWorkspace();
    const after = makeSampleWorkspace();
    after.bank.questions[2].question = 'Câu 10.1 đã sửa nội dung';

    const beforeSlices = CloudStorageV2.splitWorkspaceIntoSlices(before);
    const afterSlices = CloudStorageV2.splitWorkspaceIntoSlices(after);
    const diff = CloudStorageV2.diffSlices(beforeSlices, afterSlices, 'uid-test');

    assert.ok(diff.firestoreOps.length > 0, 'Must emit Firestore op for edited Khối 10 question');
    assert.ok(diff.driveFiles.length > 0, 'Must emit Drive file for edited Khối 10 questions');
    for (const op of diff.firestoreOps) {
      assert.equal(op.grade, 10, `Unexpected non-grade-10 Firestore op: ${JSON.stringify(op)}`);
    }
    for (const f of diff.driveFiles) {
      assert.equal(f.grade, 10, `Unexpected non-grade-10 Drive file: ${JSON.stringify(f)}`);
    }

    // Profile-only edit emits zero Drive module files
    const afterProfile = makeSampleWorkspace();
    afterProfile.profile.active_grades = [8, 9, 10, 11];
    const pDiff = CloudStorageV2.diffSlices(beforeSlices, CloudStorageV2.splitWorkspaceIntoSlices(afterProfile), 'uid-test');
    assert.equal(pDiff.profileChanged, true);
    assert.equal(pDiff.driveFiles.length, 0);
    console.log('PASS diffSlices strict grade isolation & profile diff');
  }

  // 6. checkAntiWipe guard + exceptions
  {
    const before = makeSampleWorkspace();
    const wiped = makeSampleWorkspace();
    wiped.bank.questions = wiped.bank.questions.filter(q => q.grade !== 8); // Khối 8 drops 1 -> 0
    const bSlices = CloudStorageV2.splitWorkspaceIntoSlices(before);
    const wSlices = CloudStorageV2.splitWorkspaceIntoSlices(wiped);

    const blockedRes = CloudStorageV2.checkAntiWipe(bSlices, wSlices, { path: '/api/bank/import' });
    assert.equal(blockedRes.ok, false, 'Accidental grade-8 question wipe during import must be blocked');
    assert.equal(blockedRes.blocked[0].grade, 8);
    assert.equal(blockedRes.blocked[0].module, 'questions');

    assert.equal(CloudStorageV2.isShrinkAllowedAction('/api/questions/delete', {}), true);
    assert.equal(CloudStorageV2.isShrinkAllowedAction('/api/questions/bulk', { action: 'delete' }), true);
    assert.equal(CloudStorageV2.isShrinkAllowedAction('/api/questions/bulk', { action: 'grade' }), true);
    assert.equal(CloudStorageV2.isShrinkAllowedAction('/api/questions/bulk', { action: 'approve' }), false);
    assert.equal(CloudStorageV2.isShrinkAllowedAction('/api/ppct/clear-grade', { grade: 8 }), true);
    assert.equal(CloudStorageV2.isShrinkAllowedAction('/api/bank/import', { mode: 'append' }), false);
    assert.equal(CloudStorageV2.isShrinkAllowedAction('/api/bank/import', { mode: 'replace' }), true);

    const allowedExplicit = CloudStorageV2.checkAntiWipe(bSlices, wSlices, {
      path: '/api/questions/delete',
      allowShrink: CloudStorageV2.isShrinkAllowedAction('/api/questions/delete', {})
    });
    assert.equal(allowedExplicit.ok, true, 'Explicit delete must be allowed');

    // Cross-grade move exception on /api/questions/save (move Q8-1 from grade 8 to grade 9 -> total preserved)
    const moved = makeSampleWorkspace();
    moved.bank.questions[0].grade = 9;
    const mSlices = CloudStorageV2.splitWorkspaceIntoSlices(moved);
    const moveRes = CloudStorageV2.checkAntiWipe(bSlices, mSlices, { path: '/api/questions/save', allowShrink: false });
    assert.equal(moveRes.ok, true, 'Moving single question across grades preserves scope total and must succeed');
    console.log('PASS checkAntiWipe protection, explicit deletes, and cross-grade move');
  }

  // 7. Firestore v2 full write + diff write + read round-trip
  {
    const { db, helpers } = makeFirestoreMock();
    const initial = makeSampleWorkspace();
    await CloudStorageV2.firestoreWriteFullV2('teacher-1', db, helpers, initial, { ownerEmail: 'gv@ahs.edu.vn' });

    const read1 = await CloudStorageV2.firestoreReadWorkspaceV2('teacher-1', db, helpers);
    assert.equal(read1.exists, true);
    assert.equal(read1.hasContent, true);
    assert.equal(read1.data.bank.questions.length, 3);
    assert.deepEqual(read1.profile.active_grades, [8, 9, 10]);

    // Diff write editing only Khối 9 exam/revision
    const updated = JSON.parse(JSON.stringify(read1.data));
    updated.revisions.push({ id: 'REV-9-2', grade: 9, subject_name: 'Tin học', title: 'Đề cương CK1 K9', question_ids: ['Q9-1'] });
    const afterSlices = CloudStorageV2.splitWorkspaceIntoSlices(updated);
    const diffRes = await CloudStorageV2.firestoreWriteDiffV2('teacher-1', db, helpers, read1.slices, afterSlices, { ownerEmail: 'gv@ahs.edu.vn' });
    // Chỉ ghi đúng đề cương mới: Khối 9 đã có trong mục lục nên hồ sơ không ghi lại, gói câu hỏi không ghi thừa.
    assert.equal(diffRes.opsCount, 1);

    const read2 = await CloudStorageV2.firestoreReadWorkspaceV2('teacher-1', db, helpers);
    assert.equal(read2.data.revisions.length, 2);
    console.log('PASS Firestore v2 writeFullV2, writeDiffV2, and readWorkspaceV2');
  }

  // 8. Drive v2 modular tree & migrateV1ToV2 (with _backups/legacy_v1_*.json)
  {
    const mockDrive = makeDriveFetchMock();
    const legacyV1 = makeSampleWorkspace();
    const { db, helpers } = makeFirestoreMock();

    const migrated = await CloudStorageV2.migrateV1ToV2({
      uid: 'teacher-1',
      legacyData: legacyV1,
      db,
      firestoreHelpers: helpers,
      driveAccessToken: 'tok-abc',
      driveStorage: GoogleDriveStorage,
      folderName: 'ExamMatrix Studio',
      ownerEmail: 'gv@ahs.edu.vn',
      fetchImpl: mockDrive.fetchImpl
    });

    assert.equal(migrated.data.bank.questions.length, 3);
    const storedNames = [...mockDrive.items.values()].map(it => `${mockDrive.getFolderPathForItem(it)}/${it.name}`);
    assert.ok(storedNames.some(p => p.startsWith('ExamMatrix Studio/_backups/legacy_v1_') && p.endsWith('.json')), 'Legacy v1 backup must exist in _backups/');
    assert.ok(storedNames.includes('ExamMatrix Studio/manifest.json'), 'manifest.json must exist at root');
    assert.ok(storedNames.includes('ExamMatrix Studio/2026-2027/Tin_hoc/Khoi_8/questions.json'), 'Grade 8 modular question file must exist');
    assert.ok(storedNames.includes('ExamMatrix Studio/2026-2027/Tin_hoc/Khoi_10/kttx.json'), 'Grade 10 modular kttx file must exist');

    const driveRead = await CloudStorageV2.driveReadWorkspaceV2('tok-abc', GoogleDriveStorage, {
      folderName: 'ExamMatrix Studio',
      fetchImpl: mockDrive.fetchImpl
    });
    assert.equal(driveRead.exists, true);
    assert.equal(driveRead.data.bank.questions.length, 3);
    assert.equal(driveRead.data.matrices.length, 2);
    assert.equal(driveRead.data.assessment_plans.length, 1);
    assert.ok(driveRead.data.bank.ppct.cleared_grades.includes(7), 'Drive v2 read must include cleared grade 7');

    // Incremental diff write on Drive
    const afterDrive = JSON.parse(JSON.stringify(driveRead.data));
    afterDrive.kttx.push({ id: 'KT-8-NEW', grade: 8, subject_name: 'Tin học', title: 'TX K8' });
    const diffDriveRes = await CloudStorageV2.driveWriteDiffV2(
      'tok-abc',
      GoogleDriveStorage,
      driveRead.slices,
      CloudStorageV2.splitWorkspaceIntoSlices(afterDrive),
      { folderName: 'ExamMatrix Studio', ownerEmail: 'gv@ahs.edu.vn', fetchImpl: mockDrive.fetchImpl }
    );
    assert.equal(diffDriveRes.writtenFiles, 1, 'Only 1 modular Drive file (Khoi_8/kttx.json) must be uploaded');

    const driveRead2 = await CloudStorageV2.driveReadWorkspaceV2('tok-abc', GoogleDriveStorage, {
      folderName: 'ExamMatrix Studio',
      fetchImpl: mockDrive.fetchImpl
    });
    assert.equal(driveRead2.data.kttx.length, 2);
    console.log('PASS Drive v2 modular folder tree, incremental diff, & migrateV1ToV2');
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
