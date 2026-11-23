// public/firebase-bridge.js
// =============================================================================
// CẦU NỐI LƯU TRỮ CHO GITHUB PAGES / NGOẠI TUYẾN (GOOGLE DRIVE RIÊNG & FIREBASE)
// =============================================================================

(function() {
  // Host Python/Django đánh dấu rõ trong HTML; localhost cũng có thể là máy chủ thật.
  const isStaticHost = !document.querySelector?.('meta[name="workspace-scope"], meta[name="app-host"][content="python"]');

  const config = window.FIREBASE_CONFIG;
  const isConfigured = config && config.apiKey && !config.apiKey.includes('YOUR_API_KEY');
  const GDRIVE_SESSION_KEY = 'exammatrix_gdrive_session_v1';
  const GDRIVE_CLIENT_ID_KEY = 'exammatrix_google_client_id';

  function getGoogleDriveSettings() {
    const cfg = (typeof window !== 'undefined' && window.GOOGLE_DRIVE_CONFIG) || {};
    let overrideClientId = '';
    try {
      if (typeof localStorage !== 'undefined') {
        overrideClientId = (localStorage.getItem(GDRIVE_CLIENT_ID_KEY) || '').trim();
      }
    } catch (e) {}
    return {
      clientId: overrideClientId || String(cfg.clientId || '').trim(),
      configuredClientId: String(cfg.clientId || '').trim(),
      overrideClientId,
      folderName: String(cfg.folderName || 'ExamMatrix Studio').trim() || 'ExamMatrix Studio',
      fileName: String(cfg.fileName || 'exammatrix-workspace.json').trim() || 'exammatrix-workspace.json',
      scope: String(cfg.scope || 'https://www.googleapis.com/auth/drive.file openid email profile').trim()
    };
  }

  function saveDriveSession(session) {
    if (!session || !session.user) {
      clearDriveSession();
      return;
    }
    const remember = session.remember !== false;
    const serialized = JSON.stringify({
      user: session.user,
      accessToken: session.accessToken || '',
      expiresAt: Number(session.expiresAt || 0),
      folderId: session.folderId || null,
      fileId: session.fileId || null,
      modifiedTime: session.modifiedTime || null,
      remember
    });
    if (remember) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(GDRIVE_SESSION_KEY, serialized);
      } catch (e) {}
    } else {
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(GDRIVE_SESSION_KEY);
      } catch (e) {}
    }
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(GDRIVE_SESSION_KEY, serialized);
    } catch (e) {}
  }

  function loadDriveSession() {
    const readFrom = (store) => {
      try {
        if (!store || typeof store.getItem !== 'function') return null;
        const raw = store.getItem(GDRIVE_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return (parsed && parsed.user && parsed.user.uid) ? parsed : null;
      } catch (e) {
        return null;
      }
    };
    const lsSession = readFrom(typeof localStorage !== 'undefined' ? localStorage : null);
    const ssSession = readFrom(typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    if (lsSession && ssSession) {
      const lsTokenValid = Boolean(lsSession.accessToken && Number(lsSession.expiresAt || 0) > Date.now());
      const ssTokenValid = Boolean(ssSession.accessToken && Number(ssSession.expiresAt || 0) > Date.now());
      if (ssTokenValid && !lsTokenValid) return ssSession;
      if (lsTokenValid && !ssTokenValid) return lsSession;
      return Number(ssSession.expiresAt || 0) > Number(lsSession.expiresAt || 0) ? ssSession : lsSession;
    }
    return lsSession || ssSession || null;
  }

  function clearDriveSession() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(GDRIVE_SESSION_KEY);
      }
    } catch (e) {}
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(GDRIVE_SESSION_KEY);
      }
    } catch (e) {}
  }

  // Trạng thái Cloud-First v2 (Firebase Auth + Firestore v2 + Google Drive v2)
  const RUNTIME_DRIVE_TOKEN_KEY = 'exammatrix_runtime_drive_token_v2';
  let lastSyncedSlicesV2 = null;
  let currentMutationSnapshot = null;
  let activeMutationMeta = null;
  const cloudFolderCacheV2 = new Map();

  function useUnifiedCloudV2() {
    return Boolean(isStaticHost && isConfigured && typeof window !== 'undefined' && window.CloudStorageV2);
  }

  function saveRuntimeDriveToken(uid, accessToken, expiresAt) {
    const cleanToken = String(accessToken || '').trim();
    const exp = Number(expiresAt || 0);
    if (window.FirebaseState) {
      window.FirebaseState.driveAccessToken = cleanToken;
      window.FirebaseState.driveTokenExpiresAt = cleanToken ? exp : 0;
    }
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (uid && cleanToken && exp > Date.now() + 5000) {
          sessionStorage.setItem(RUNTIME_DRIVE_TOKEN_KEY, JSON.stringify({ uid, accessToken: cleanToken, expiresAt: exp }));
        } else {
          sessionStorage.removeItem(RUNTIME_DRIVE_TOKEN_KEY);
        }
      }
    } catch (e) {}
  }

  function loadRuntimeDriveToken(uid) {
    if (!uid) return null;
    if (window.FirebaseState?.driveAccessToken && Number(window.FirebaseState.driveTokenExpiresAt || 0) > Date.now() + 5000) {
      return {
        uid,
        accessToken: window.FirebaseState.driveAccessToken,
        expiresAt: Number(window.FirebaseState.driveTokenExpiresAt)
      };
    }
    try {
      if (typeof sessionStorage === 'undefined') return null;
      const raw = sessionStorage.getItem(RUNTIME_DRIVE_TOKEN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.uid === uid && parsed.accessToken && Number(parsed.expiresAt || 0) > Date.now() + 5000) {
        if (window.FirebaseState) {
          window.FirebaseState.driveAccessToken = parsed.accessToken;
          window.FirebaseState.driveTokenExpiresAt = Number(parsed.expiresAt);
        }
        return parsed;
      }
    } catch (e) {}
    return null;
  }

  function setCloudSyncPill(state = 'offline', text = '') {
    const pill = typeof document !== 'undefined' ? document.getElementById('cloud-sync-pill') : null;
    if (!pill) return;
    pill.hidden = false;
    pill.className = `cloud-sync-pill cloud-pill-${state}`;
    pill.textContent = text || ({
      synced: '☁ Đã lưu trực tuyến',
      syncing: '⏳ Đang lưu dữ liệu…',
      partial: '☁ Đã lưu · Cần kết nối lại Drive',
      error: '⚠️ Chưa lưu được',
      offline: 'Chưa đăng nhập'
    }[state] || '');
  }

  // Bộ nhớ đệm dữ liệu cá nhân (chỉ dùng cho chế độ tương thích ngoại tuyến khi chưa cấu hình Cloud v2)
  const localCacheKey = 'exammatrix_teacher_cache_';
  let currentWorkspaceData = {
    bank: { questions: [], ppct: { lessons: [], cleared_grades: [] }, competency_catalogs: [] },
    exams: [],
    revisions: [],
    matrices: [],
    assessment_plans: [],
    kttx: [],
    profile: {
      schema_version: 2,
      school_year: '2026-2027',
      active_grades: [8, 9, 10],
      active_grade: 8,
      active_subject: 'Tin học'
    }
  };

  function getStorageData(uid) {
    try {
      const saved = localStorage.getItem(localCacheKey + (uid || 'offline'));
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return null;
  }

  function saveStorageData(uid, data) {
    try {
      localStorage.setItem(localCacheKey + (uid || 'offline'), JSON.stringify(data));
    } catch(e) {
      throw new Error('Chưa lưu được dữ liệu trên trình duyệt (bộ nhớ đầy hoặc bị chặn). Hãy tải bản sao lưu và giải phóng bộ nhớ.');
    }
  }

  function calculateDataScore(data) {
    if (!data || typeof data !== 'object') return 0;
    const qCount = Array.isArray(data.bank?.questions) ? data.bank.questions.length : 0;
    const ppctCount = Array.isArray(data.bank?.ppct?.lessons) ? data.bank.ppct.lessons.length : 0;
    const examCount = Array.isArray(data.exams) ? data.exams.length : 0;
    const revCount = Array.isArray(data.revisions) ? data.revisions.length : 0;
    const matCount = Array.isArray(data.matrices) ? data.matrices.length : 0;
    return (qCount * 10) + (ppctCount * 5) + (matCount * 5) + (examCount * 5) + (revCount * 2);
  }

  function findBestAvailableCache() {
    let best = null;
    let maxScore = 0;
    try {
      if (typeof localStorage === 'undefined') return null;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(localCacheKey) || k === 'exammatrix_emergency_backup' || k === 'exammatrix_offline_backup')) {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          try {
            const rawVal = JSON.parse(raw);
            const val = rawVal?.data || rawVal;
            const score = calculateDataScore(val);
            if (score > maxScore) {
              maxScore = score;
              best = val;
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
    return best;
  }

  const IDB_NAME = 'exammatrix_drive_cache_v1';
  const IDB_STORE = 'workspaces';

  function openCacheDb() {
    return new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: 'uid' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function idbGet(uid) {
    const db = await openCacheDb();
    if (!db) return null;
    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (e) {}
        resolve(val);
      };
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(uid || 'offline');
        req.onsuccess = () => done(req.result ? req.result.data : null);
        req.onerror = () => done(null);
        tx.onabort = () => done(null);
        tx.onerror = () => done(null);
      } catch (e) {
        done(null);
      }
    });
  }

  async function idbSet(uid, data) {
    const db = await openCacheDb();
    if (!db) return false;
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (e) {}
        resolve(ok);
      };
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.oncomplete = () => done(true);
        tx.onerror = () => done(false);
        tx.onabort = () => done(false);
        tx.objectStore(IDB_STORE).put({
          uid: uid || 'offline',
          data: JSON.parse(JSON.stringify(data)),
          saved_at: new Date().toISOString()
        });
      } catch (e) {
        done(false);
      }
    });
  }

  async function idbGetAll() {
    const db = await openCacheDb();
    if (!db) return [];
    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => {
        if (settled) return;
        settled = true;
        try { db.close(); } catch (e) {}
        resolve(val || []);
      };
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = () => done(req.result || []);
        req.onerror = () => done([]);
        tx.onabort = () => done([]);
        tx.onerror = () => done([]);
      } catch (e) {
        done([]);
      }
    });
  }

  async function trySaveLocalCache(uid, data) {
    let lsOk = false;
    try {
      saveStorageData(uid, data);
      lsOk = true;
    } catch (e) {
      lsOk = false;
    }
    const idbOk = await idbSet(uid, data);
    // Lưu một bản sao lưu khẩn cấp nếu dữ liệu có giá trị
    try {
      if (calculateDataScore(data) > 0 && typeof localStorage !== 'undefined') {
        localStorage.setItem('exammatrix_emergency_backup', JSON.stringify({
          saved_at: new Date().toISOString(),
          data: data
        }));
      }
    } catch (e) {}
    return { lsOk, idbOk, saved: lsOk || idbOk };
  }

  async function getBestCachedData(uid) {
    const lsData = getStorageData(uid);
    const idbData = await idbGet(uid);
    if (lsData && idbData) {
      const lsTs = Date.parse(lsData._sync?.saved_at || '') || 0;
      const idbTs = Date.parse(idbData._sync?.saved_at || '') || 0;
      return idbTs > lsTs ? idbData : lsData;
    }
    return idbData || lsData || null;
  }

  function initLocalWorkspace() {
    if (useUnifiedCloudV2()) {
      // Kiến trúc Cloud-First v2: dữ liệu học vụ lấy từ Firebase & Google Drive, không nạp từ localStorage lúc khởi động.
      currentWorkspaceData.bank = { questions: [], ppct: { lessons: [], cleared_grades: [] }, competency_catalogs: [] };
      currentWorkspaceData.exams = [];
      currentWorkspaceData.revisions = [];
      currentWorkspaceData.matrices = [];
      currentWorkspaceData.assessment_plans = [];
      currentWorkspaceData.kttx = [];
      lastSyncedSlicesV2 = null;
      return;
    }
    try {
      // Chế độ ngoại tuyến / kiểm thử: nạp cache cục bộ
      let cached = getStorageData('offline');
      if (!cached || calculateDataScore(cached) === 0) {
        const rescued = findBestAvailableCache();
        if (rescued && calculateDataScore(rescued) > 0) {
          cached = rescued;
        }
      }
      if (cached) {
        if (cached.bank?.questions) currentWorkspaceData.bank.questions = cached.bank.questions;
        if (cached.bank?.ppct) currentWorkspaceData.bank.ppct = cached.bank.ppct;
        if (cached.bank?.competency_catalogs) currentWorkspaceData.bank.competency_catalogs = cached.bank.competency_catalogs;
        if (cached.exams) currentWorkspaceData.exams = cached.exams;
        if (cached.revisions) currentWorkspaceData.revisions = cached.revisions;
        if (cached.matrices) currentWorkspaceData.matrices = cached.matrices;
        if (Array.isArray(cached.assessment_plans)) currentWorkspaceData.assessment_plans = cached.assessment_plans;
        if (Array.isArray(cached.kttx)) currentWorkspaceData.kttx = cached.kttx;
      }
    } catch(e) {}
    const cleared = currentWorkspaceData.bank.ppct?.cleared_grades || [];
    if (currentWorkspaceData.bank.ppct?.lessons?.length) {
      currentWorkspaceData.bank.ppct.lessons = cleanPpctLessons(currentWorkspaceData.bank.ppct.lessons, cleared);
    }
    if (!currentWorkspaceData.bank.ppct?.lessons?.length) {
      currentWorkspaceData.bank.ppct = {
        lessons: [],
        cleared_grades: cleared
      };
    }
  }

  function normalizeTextList(value) {
    const rawItems = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
    const seen = new Set();
    const out = [];
    for (const entry of rawItems) {
      for (const line of String(entry || '').split(/\r?\n/)) {
        const clean = line.trim().replace(/^[-–*•+]\s*/, '').trim();
        if (clean && !seen.has(clean)) {
          seen.add(clean);
          out.push(clean);
        }
      }
    }
    return out;
  }

  function normalizeNotesValue(notes, occurrences = []) {
    if (Array.isArray(notes)) {
      const cleaned = notes.map(x => String(x || '').trim()).filter(Boolean);
      if (cleaned.length) return cleaned.join('\n');
    } else if (notes != null && String(notes).trim() !== '') {
      return String(notes).trim();
    }
    const seen = [];
    for (const o of (Array.isArray(occurrences) ? occurrences : [])) {
      const n = String(o?.notes_raw || '').trim();
      if (n && !seen.includes(n)) seen.push(n);
    }
    return seen.join('; ');
  }

  function normalizePpctSection(rawSection = '', lessonCode = '', lessonName = '', topic = '') {
    const raw = String(rawSection || '').trim().toLowerCase();
    if (['core', 'elective_topic', 'review', 'assessment'].includes(raw)) return raw;
    if (['chuyen_de', 'chuyên đề', 'special_topic', 'elective', 'chuyen_de_hoc_tap', 'cdht'].includes(raw)) return 'elective_topic';
    if (['on_tap', 'ôn tập', 'luyen_tap', 'luyện tập'].includes(raw)) return 'review';
    if (['kiem_tra', 'kiểm tra', 'danh_gia', 'đánh giá', 'periodic'].includes(raw)) return 'assessment';
    const code = String(lessonCode || '').trim();
    const name = String(lessonName || '').trim();
    const tp = String(topic || '').trim();
    if (/^(?:CD|CĐ)\d/i.test(code) || /^\s*Chuyên\s*đề\b/i.test(name) || /chuyên\s*đề\s*học\s*tập|chuyên\s*đề\s*lựa\s*chọn/i.test(tp)) {
      return 'elective_topic';
    }
    if (/^KT(?:GK|CK)[12]$/i.test(code) || /^\s*Kiểm\s*tra\s*(?:giữa|cuối)?\s*h?[kìỳ]/i.test(name)) {
      return 'assessment';
    }
    if (/^(?:OT|LT)(?:_HK[12])?(?:_\d+)?$/i.test(code) || /^\s*(?:Ôn\s*tập|Luyện\s*tập)\b/i.test(name)) {
      return 'review';
    }
    return 'core';
  }

  function detectPpctOrientation(text = '') {
    const low = String(text || '').trim().toLowerCase().replace(/_/g, ' ');
    if (!low) return '';
    if (low.includes('tin học ứng dụng') || /\bict\b/.test(low)) return 'ICT';
    if (low.includes('khoa học máy tính') || /\bcs\b/.test(low)) return 'CS';
    return '';
  }

  // Khởi tạo danh mục PPCT chuẩn từ curricula.js (chỉ nạp sẵn Khối 8, 9, 10 đã được giáo viên upload)
  function normalizeOccurrences(occ, defaultWeek = 'Tuần 1') {
    const mapOne = (o) => {
      if (typeof o === 'object' && o !== null) {
        const duration = o.duration_raw != null && String(o.duration_raw).trim() !== ''
          ? String(o.duration_raw).trim()
          : (o.so_tiet != null && String(o.so_tiet).trim() !== ''
            ? String(o.so_tiet).trim()
            : (o.num_periods != null && String(o.num_periods).trim() !== '' ? String(o.num_periods).trim() : ''));
        const ppct = o.ppct_raw != null && String(o.ppct_raw).trim() !== '' ? String(o.ppct_raw).trim() : '';
        const periods = o.periods_raw != null && String(o.periods_raw).trim() !== ''
          ? String(o.periods_raw).trim()
          : (ppct || duration || '1');
        const rawWeek = o.week_raw != null ? String(o.week_raw).trim() : '';
        const out = {
          week_raw: rawWeek !== '' ? rawWeek : defaultWeek,
          duration_raw: duration,
          ppct_raw: ppct,
          periods_raw: periods,
          competencies_raw: o.competencies_raw != null ? String(o.competencies_raw).trim() : '',
          notes_raw: o.notes_raw != null ? String(o.notes_raw).trim() : ''
        };
        if (o.semester != null) out.semester = o.semester;
        if (o.table_index != null) out.table_index = o.table_index;
        if (o.row_index != null) out.row_index = o.row_index;
        return out;
      }
      return { week_raw: defaultWeek, duration_raw: '', ppct_raw: '', periods_raw: String(o || '1'), competencies_raw: '', notes_raw: '' };
    };
    if (Array.isArray(occ) && occ.length > 0) return occ.map(mapOne);
    if (occ && typeof occ === 'object') return [mapOne(occ)];
    if (typeof occ === 'number' || typeof occ === 'string') {
      return [{ week_raw: defaultWeek, duration_raw: '', ppct_raw: '', periods_raw: String(occ || '1'), competencies_raw: '', notes_raw: '' }];
    }
    return [{ week_raw: defaultWeek, duration_raw: '', ppct_raw: '', periods_raw: '1', competencies_raw: '', notes_raw: '' }];
  }

  function cleanPpctLessons(lessons, clearedGrades = []) {
    if (!Array.isArray(lessons)) return [];
    return lessons.filter(l => {
      const g = Number(l.grade);
      if (clearedGrades.includes(g) && !l.user_uploaded) return false;
      // Không xóa PPCT khối khác trong một thao tác đọc hoặc lưu môn đang làm.
      return true;
    }).map(l => {
      const section = normalizePpctSection(l.section, l.lesson_code, l.lesson_name_source || l.lesson_name || l.name, l.topic_source || l.topic);
      const orientRaw = String(l.orientation || '').trim();
      const orientation = detectPpctOrientation(orientRaw) || orientRaw || (section === 'elective_topic' ? detectPpctOrientation(l.topic_source || l.topic || '') : '');
      return {
        ...l,
        section,
        orientation,
        occurrences: normalizeOccurrences(l.occurrences, section === 'elective_topic' ? '' : 'Tuần 1')
      };
    });
  }

  function buildDefaultLessons(subject, allowedGrades = [8, 9, 10]) {
    const curricula = window.SUBJECT_CURRICULA || {};
    const subjData = curricula[subject] || curricula['Tin học'] || {};
    const lessons = [];
    allowedGrades.forEach(grade => {
      (subjData[grade] || subjData[String(grade)] || []).forEach(l => {
        lessons.push({
          ...l,
          grade: Number(grade),
          subject_name: subject,
          occurrences: normalizeOccurrences(l.occurrences)
        });
      });
    });
    return lessons;
  }

  const KTTX_FORMS = [
    { key: 'hoi_dap', label: 'Hỏi – đáp' },
    { key: 'viet', label: 'Viết' },
    { key: 'thuyet_trinh', label: 'Thuyết trình' },
    { key: 'thuc_hanh', label: 'Thực hành' },
    { key: 'thi_nghiem', label: 'Thí nghiệm' },
    { key: 'san_pham', label: 'Sản phẩm học tập' }
  ];
  const KTTX_CLUSTER_FORM = { key: 'cum_chuyen_de', label: 'Kết quả cụm chuyên đề học tập (THPT)', min_grade: 10 };
  const KTTX_FORM_KEYS = [...KTTX_FORMS.map(f => f.key), KTTX_CLUSTER_FORM.key];
  const KTTX_TIN_PERIODS = { 6: 35, 7: 35, 8: 35, 9: 35, 10: 70, 11: 70, 12: 70 };

  function kttxGradesFor(subj) {
    const ctxGrades = window.store?.context?.allowed_grades;
    if (Array.isArray(ctxGrades) && ctxGrades.length) return ctxGrades.map(Number);
    return window.BankStaticEngine?.subjectContext?.(subj)?.allowed_grades || [6, 7, 8, 9, 10, 11, 12];
  }

  function kttxPeriodsPerYear(grade, subj) {
    const declared = window.store?.context?.policy?.periods_per_year;
    if (declared && typeof declared === 'object') {
      const v = declared[String(grade)];
      if (Number.isInteger(v) && v > 0) return v;
    }
    if ((subj || 'Tin học') === 'Tin học') return KTTX_TIN_PERIODS[Number(grade)] ?? null;
    return null;
  }

  function txCountPerSemester(periodsPerYear) {
    if (!Number.isInteger(periodsPerYear) || periodsPerYear <= 0) return null;
    if (periodsPerYear <= 35) return 2;
    if (periodsPerYear <= 70) return 3;
    return 4;
  }

  function kttxActivityTitle(subj, grade, k, semester) {
    const shortSubj = (subj || 'Tin học') === 'Tin học' ? 'Tin' : subj;
    return `${shortSubj} ${grade}_Kiểm tra thường xuyên ${k} - HK ${Number(semester) === 1 ? 'I' : 'II'}`;
  }

  function buildKttxState(workspace, subj) {
    const allActs = Array.isArray(workspace?.kttx) ? workspace.kttx : [];
    const activities = JSON.parse(JSON.stringify(allActs.filter(a => (a.subject_name || 'Tin học') === subj)));
    const grades = kttxGradesFor(subj);
    const forms = KTTX_FORMS.map(f => ({ ...f }));
    if (grades.some(g => g >= KTTX_CLUSTER_FORM.min_grade)) forms.push({ ...KTTX_CLUSTER_FORM });
    const ppctLessons = Array.isArray(workspace?.bank?.ppct?.lessons) ? workspace.bank.ppct.lessons : [];
    const elective_topics_by_grade = {};
    for (const l of ppctLessons) {
      const lSubj = l.subject_name || 'Tin học';
      if (lSubj !== subj) continue;
      const lg = Number(l.grade);
      if (!grades.includes(lg)) continue;
      const code = String(l.lesson_code || '');
      const sec = normalizePpctSection(l.section, code, l.lesson_name_source || l.lesson_name, l.topic_source || l.topic);
      if (sec === 'elective_topic') {
        const occ = Array.isArray(l.occurrences) && l.occurrences[0] ? l.occurrences[0] : {};
        (elective_topics_by_grade[String(lg)] ||= []).push({
          lesson_code: code,
          lesson_name_source: l.lesson_name_source || l.lesson_name || code,
          orientation: String(l.orientation || detectPpctOrientation(`${l.topic_source || ''} ${l.lesson_name_source || ''}`) || ''),
          duration_raw: String(occ.duration_raw || '')
        });
      }
    }
    const overview = [];
    for (const grade of grades) {
      for (const semester of [1, 2]) {
        const mine = activities.filter(a => Number(a.grade) === grade && Number(a.semester) === semester);
        const classes = [...new Set(mine.map(a => a.class_name || ''))].sort();
        if (!classes.length) classes.push('');
        for (const className of classes) {
          const acts = mine.filter(a => (a.class_name || '') === className);
          const recorded = acts.filter(a => a.recorded && a.form !== KTTX_CLUSTER_FORM.key).length;
          const cluster = acts.filter(a => a.recorded && a.form === KTTX_CLUSTER_FORM.key).length;
          const perYear = kttxPeriodsPerYear(grade, subj);
          const required = perYear ? txCountPerSemester(perYear) : null;
          let message = '';
          if (required === null) {
            message = 'Môn chưa khai báo số tiết/năm học nên chưa tính được số ĐĐGtx cần có.';
          } else if (recorded === required) {
            message = `Đủ ${required} ĐĐGtx (TT 22/2021, Điều 6).`;
          } else if (recorded < required) {
            message = `Đã chọn ${recorded}/${required} ĐĐGtx — thiếu ${required - recorded}. Chỉ là cảnh báo.`;
          } else {
            message = `Đã chọn ${recorded} ĐĐGtx, nhiều hơn ${required} cần ghi sổ. Chỉ là cảnh báo.`;
          }
          if (cluster === 1) {
            message += ' Thêm 01 lần ĐGtx từ kết quả cụm chuyên đề học tập (Điều 6, khoản 3).';
          } else if (cluster > 1) {
            message += ` Đang chọn ${cluster} kết quả cụm chuyên đề; chỉ ghi 01 kết quả cụm chuyên đề (Điều 6, khoản 3).`;
          }
          overview.push({
            grade,
            semester,
            class_name: className,
            periods_per_year: perYear,
            required,
            recorded,
            cluster_recorded: cluster,
            activities: acts.length,
            ok: required !== null && recorded === required && cluster <= 1,
            message
          });
        }
      }
    }
    return { activities, forms, elective_topics_by_grade, overview };
  }

  // Khung trạng thái toàn cục
  window.FirebaseState = {
    user: null,
    db: null,
    auth: null,
    driveSession: null,
    provider: null,
    isReady: false,
    currentData: currentWorkspaceData
  };
  initLocalWorkspace();
  if(isStaticHost&&window.BankCore?.DocFormatter)window.BankCore.DocFormatter.storagePrefix=window.BankCore.formatStoragePrefix('pages:offline');

  // ===========================================================================
  // CLIENT ADAPTER: ĐIỀU PHỐI DỮ LIỆU KHI CHẠY TRÊN GITHUB PAGES
  // ===========================================================================
  window.FirebaseClient = {
    canHandle(path) {
      return isStaticHost;
    },

    async handle(path, body) {
      const uid = window.FirebaseState.user ? window.FirebaseState.user.uid : 'offline';
      const subj = (window.store && window.store.selectedSubject) || 'Tin học';

      if (window.BankStaticAPI?.canHandle(path)) {
        const op = await window.BankStaticAPI.handle(path, body, currentWorkspaceData, {subject:subj, actor:'Giáo viên trên trình duyệt',engine:window.BankStaticEngine,workflow:window.BankStaticWorkflow,comparison:window.BankExamComparison});
        if (op.changed) {
          await syncToFirestore(uid, op.data);
          if ((window.FirebaseState.user?.uid || 'offline') !== uid)
            throw new Error('Tài khoản đã thay đổi trong khi lưu. Hãy tải lại dữ liệu của tài khoản hiện tại.');
          currentWorkspaceData = op.data;
          window.FirebaseState.currentData = currentWorkspaceData;
          if (window.store) { window.store.plans = {}; window.store.matrixRecords = JSON.parse(JSON.stringify(op.data.matrices)); }
        }
        return op.response;
      }

      // 1. Lấy trạng thái hệ thống
      if (path === '/api/state') {
        const cleared = currentWorkspaceData.bank?.ppct?.cleared_grades || [];
        const finalLessons = cleanPpctLessons(currentWorkspaceData.bank?.ppct?.lessons || [], cleared);
        if (!currentWorkspaceData.bank.ppct) currentWorkspaceData.bank.ppct = { lessons: [], cleared_grades: cleared };
        currentWorkspaceData.bank.ppct.lessons = finalLessons;
        const questions = currentWorkspaceData.bank.questions || [];
        return {
          context: window.BankStaticEngine?.subjectContext(subj) || { subject_name: subj },
          bank: {
            questions: questions,
            ppct: { lessons: finalLessons, cleared_grades: cleared },
            competency_catalogs: Array.isArray(currentWorkspaceData.bank?.competency_catalogs) ? currentWorkspaceData.bank.competency_catalogs : []
          },
          review_checklist: window.BankStaticWorkflow?.checklist || [],
          can_view_answers: true,
          exams: (currentWorkspaceData.exams || []).map(exam => ({...exam, verification: window.BankStaticEngine?.verifyExam(currentWorkspaceData, exam) || {passed:false, summary:'Chưa nạp bộ kiểm định.'}})),
          revisions: currentWorkspaceData.revisions || [],
          matrices: currentWorkspaceData.matrices || [],
          assessment_plans: Array.isArray(currentWorkspaceData.assessment_plans) ? currentWorkspaceData.assessment_plans : [],
          profile: currentWorkspaceData.profile || null,
          templates: []
        };
      }

      if (path === '/api/profile/save') {
        const incoming = body && typeof body === 'object' ? (body.profile || body) : {};
        const v2 = window.CloudStorageV2;
        const prev = currentWorkspaceData.profile || {};
        const merged = v2
          ? v2.normalizeProfile({ ...prev, ...incoming, updated_at: new Date().toISOString() })
          : { ...prev, ...incoming, updated_at: new Date().toISOString() };
        currentWorkspaceData.profile = merged;
        await syncToFirestore(uid, currentWorkspaceData, { path, allowShrink: false });
        if ((window.FirebaseState.user?.uid || 'offline') !== uid) {
          throw new Error('Tài khoản đã thay đổi trong khi lưu tùy chọn hồ sơ.');
        }
        if (window.store) window.store.profile = JSON.parse(JSON.stringify(merged));
        return { profile: JSON.parse(JSON.stringify(merged)) };
      }

      // Tuyến Phân phối chương trình (PPCT)
      if (path === '/api/ppct/inspect-import') {
        const fn = body.filename || '';
        let grade = Number(body.grade || 0);
        if (!grade && fn) {
          const m = fn.match(/(?:TIN|KHỐI|KHOI|LỚP|LOP|K)\s*(\d+)/i);
          if (m) grade = Number(m[1]);
        }
        if (!grade && body.extracted_text) {
          const m = body.extracted_text.match(/(?:KHỐI\s*LỚP|KHỐI|LỚP)\s*(\d+)/i);
          if (m) grade = Number(m[1]);
        }
        if (!grade) grade = (window.store && window.store.ppctGrade) || 9;

        let lessons = [];
        let issues = [];

        if (body.json) {
          const rootJson = (body.json && typeof body.json === 'object' && !Array.isArray(body.json) && body.json.ppct && typeof body.json.ppct === 'object')
            ? body.json.ppct
            : body.json;
          const topOrientationRaw = (!Array.isArray(rootJson) && rootJson && rootJson.orientation) ? String(rootJson.orientation).trim() : '';
          const topOrientation = detectPpctOrientation(topOrientationRaw) || topOrientationRaw;
          const coreRaw = Array.isArray(rootJson) ? rootJson : (Array.isArray(rootJson?.lessons) ? rootJson.lessons : []);
          const electiveRaw = [];
          if (rootJson && !Array.isArray(rootJson)) {
            for (const key of ['elective_topics', 'special_topics', 'chuyen_de', 'chuyen_de_hoc_tap']) {
              if (Array.isArray(rootJson[key]) && rootJson[key].length) {
                rootJson[key].forEach((item, idx) => electiveRaw.push({ item, cdSeq: idx + 1 }));
              }
            }
          }
          const taggedJson = [
            ...coreRaw.map((item, idx) => ({ item, isElective: false, seq: idx + 1 })),
            ...electiveRaw.map(({ item, cdSeq }) => ({ item, isElective: true, seq: cdSeq }))
          ];
          lessons = taggedJson.map(({ item: l, isElective, seq }) => {
            const lessonName = l.lesson_name_source || l.lesson_name || l.name || l.title || '';
            const lessonCode = String(l.lesson_code || (isElective ? ('CD' + seq) : ('B' + seq))).trim();
            const topicSource = l.topic_source || l.topic || (isElective ? 'Chuyên đề học tập lựa chọn' : 'Chương trình GDPT');
            const section = normalizePpctSection(l.section || (isElective ? 'elective_topic' : ''), lessonCode, lessonName, topicSource);
            const itemOrientRaw = String(l.orientation || '').trim();
            const orientation = detectPpctOrientation(itemOrientRaw) || itemOrientRaw || (section === 'elective_topic' ? (topOrientation || detectPpctOrientation(topicSource) || detectPpctOrientation(lessonName)) : '');
            const rawOcc = (Array.isArray(l.occurrences) && l.occurrences.length > 0)
              ? l.occurrences
              : ((l.week_raw != null || l.duration_raw != null || l.num_periods != null || l.so_tiet != null || l.ppct_raw != null || l.periods_raw != null)
                ? [{
                    week_raw: l.week_raw != null ? l.week_raw : (section === 'elective_topic' ? '' : 'Tuần 1'),
                    duration_raw: l.duration_raw ?? l.so_tiet ?? l.num_periods ?? '',
                    ppct_raw: l.ppct_raw || '',
                    periods_raw: l.periods_raw || l.ppct_raw || l.duration_raw || '1',
                    competencies_raw: l.competencies_raw || '',
                    notes_raw: l.notes_raw || ''
                  }]
                : l.occurrences);
            const occs = normalizeOccurrences(rawOcc, section === 'elective_topic' ? '' : 'Tuần 1');
            const compList = normalizeTextList(
              l.digital_competencies ?? l.competencies ?? l.competencies_raw ?? l.nls_ai ?? []
            );
            for (const o of occs) {
              for (const c of normalizeTextList(o.competencies_raw)) {
                if (!compList.includes(c)) compList.push(c);
              }
            }
            const notesStr = normalizeNotesValue(
              l.notes ?? l.note ?? l.notes_raw ?? l.ghi_chu ?? '',
              occs
            );
            let parsedOutcomes = Array.isArray(l.outcomes)
              ? l.outcomes.map(o => String(o || '').trim()).filter(Boolean)
              : (typeof l.outcomes === 'string'
                  ? l.outcomes.split(/\r?\n/).map(o => o.trim().replace(/^[-*•+]\s*/, '')).filter(Boolean)
                  : []);
            if (!parsedOutcomes.length) {
              if (section === 'assessment') parsedOutcomes = ['Kiểm tra, đánh giá định kỳ theo ma trận và bản đặc tả.'];
              else if (section === 'review') parsedOutcomes = ['Hệ thống hóa, củng cố kiến thức và kĩ năng đã học.'];
            }
            return {
              status: 'new',
              grade: Number(l.grade || rootJson?.grade || grade),
              lesson_code: lessonCode,
              lesson_name: lessonName,
              lesson_name_source: lessonName,
              topic: topicSource,
              topic_source: topicSource,
              section,
              orientation,
              outcomes: parsedOutcomes,
              occurrences: occs,
              digital_competencies: compList,
              notes: notesStr
            };
          });
        } else if (body.extracted_html) {
          // Bóc tách bảng HTML từ tệp Word (.docx) chuẩn KHDH Phụ lục 1 (cả Mục II.1 cốt lõi và Mục II.2 Chuyên đề lựa chọn)
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(body.extracted_html, 'text/html');
            const tables = Array.from(doc.querySelectorAll('table'));
            const docOrientation = detectPpctOrientation(body.filename || '');
            const mapColumns = (hdrCells) => {
              const cols = { stt: -1, week: -1, lesson: -1, duration: -1, ppct: -1, outcomes: -1, nls: -1, notes: -1, equipment: -1 };
              hdrCells.forEach((raw, idx) => {
                const low = String(raw || '').trim().toLowerCase();
                if (!low) return;
                if (cols.stt < 0 && /^(?:stt|tt|st)$/.test(low)) cols.stt = idx;
                else if (cols.ppct < 0 && low.includes('ppct')) cols.ppct = idx;
                else if (cols.week < 0 && /(?:tuần|thời\s*điểm|week)/i.test(low)) cols.week = idx;
                else if (cols.duration < 0 && /(?:số\s*tiết|thời\s*lượng|duration|^tiết$)/i.test(low)) cols.duration = idx;
                else if (cols.outcomes < 0 && /(?:yêu\s*cầu\s*cần\s*đạt|yccđ|yccd|mục\s*tiêu|chuẩn\s*kiến\s*thức|learning\s*outcome)/i.test(low)) cols.outcomes = idx;
                else if (cols.nls < 0 && /(?:năng\s*lực\s*số|nls|\bai\b)/i.test(low)) cols.nls = idx;
                else if (cols.equipment < 0 && /(?:thiết\s*bị|đồ\s*dùng\s*dạy\s*học)/i.test(low)) cols.equipment = idx;
                else if (cols.notes < 0 && /(?:ghi\s*chú|note)/i.test(low)) cols.notes = idx;
                else if (cols.lesson < 0 && /(?:chuyên\s*đề|bài\s*học|tên\s*bài|bài\s*dạy|nội\s*dung|lesson)/i.test(low)) cols.lesson = idx;
              });
              return cols;
            };
            const matchedTables = [];
            tables.forEach((tbl, tIdx) => {
              const firstRow = tbl.querySelector('tr');
              if (!firstRow) return;
              const hdr = Array.from(firstRow.querySelectorAll('td, th')).map(c => c.textContent.trim());
              const hdrLow = hdr.map(x => x.toLowerCase());
              const hasWeek = hdrLow.some(x => /(?:tuần|thời\s*điểm|week)/.test(x));
              const hasLesson = hdrLow.some(x => /(?:bài\s*học|tên\s*bài|bài\s*dạy|nội\s*dung|lesson)/.test(x));
              const hasElectiveCol = hdrLow.some(x => /(?:chuyên\s*đề|tên\s*bài\s*dạy)/.test(x));
              const hasDuration = hdrLow.some(x => /(?:số\s*tiết|thời\s*lượng|duration|^tiết$)/.test(x));
              const hasOutcome = hdrLow.some(x => /(?:yêu\s*cầu\s*cần\s*đạt|yccđ|yccd|mục\s*tiêu|chuẩn\s*kiến\s*thức)/.test(x));
              if (hasWeek && hasLesson && hasOutcome) {
                matchedTables.push({ kind: 'core', table: tbl, cols: mapColumns(hdr), tableIndex: tIdx });
              } else if (hasElectiveCol && hasDuration && hasOutcome) {
                matchedTables.push({ kind: 'elective', table: tbl, cols: mapColumns(hdr), tableIndex: tIdx });
              }
            });

            if (matchedTables.length > 0) {
              const lessonsMap = new Map();
              const cleanTitle = (s) => String(s || '').replace(/\s*\((?:tt|tiếp(?:\s*theo)?|t|tiết\s*\d+)\)?\s*$/i, '').replace(/\s+/g, ' ').trim();
              const cellAt = (cells, idx, fallback = '') => (idx >= 0 && idx < cells.length ? (cells[idx] || '') : fallback);

              for (const { kind, table, cols, tableIndex } of matchedTables) {
                const rows = Array.from(table.querySelectorAll('tr'));
                let semester = 1;
                let currentTopic = kind === 'elective' ? 'Chuyên đề học tập lựa chọn' : '';
                let currentOrientation = '';

                for (let rIdx = 1; rIdx < rows.length; rIdx++) {
                  const cells = Array.from(rows[rIdx].querySelectorAll('td, th')).map(c => c.textContent.trim());
                  const distinct = [...new Set(cells.filter(Boolean))];
                  if (!distinct.length) continue;

                  const firstNonEmpty = distinct[0];
                  const mSem = firstNonEmpty.match(/^\s*Học\s*k[ìỳ]\s*(I{1,2}|[12])\b/i);
                  if (mSem && distinct.length === 1) {
                    semester = (mSem[1].toUpperCase() === 'II' || mSem[1] === '2') ? 2 : 1;
                    continue;
                  }
                  const electiveBanner = distinct.find(x => /chuyên\s*đề\s*học\s*tập|chuyên\s*đề\s*lựa\s*chọn/i.test(x));
                  if (electiveBanner && distinct.length <= 2) {
                    currentTopic = electiveBanner.replace(/\s+/g, ' ').trim();
                    currentOrientation = detectPpctOrientation(currentTopic) || currentOrientation;
                    continue;
                  }
                  const topicCell = distinct.find(x => /^\s*Chủ\s*đề\b/i.test(x));
                  if (topicCell && distinct.length <= 2) {
                    currentTopic = topicCell.replace(/\s+/g, ' ').trim();
                    continue;
                  }

                  const stt = cellAt(cells, cols.stt);
                  const weekRaw = cols.week >= 0 ? cellAt(cells, cols.week) : (kind === 'core' ? (cells[0] || '') : '');
                  const lessonRaw = cols.lesson >= 0 ? cellAt(cells, cols.lesson) : (cells[1] || '');
                  const durationRaw = cols.duration >= 0 ? cellAt(cells, cols.duration) : (cells[2] || '1');
                  const ppctRaw = cols.ppct >= 0 ? cellAt(cells, cols.ppct) : (kind === 'core' ? (cells[3] || '') : '');
                  const outcomesRaw = cols.outcomes >= 0 ? cellAt(cells, cols.outcomes) : (kind === 'core' ? (cells[4] || '') : '');
                  const competenciesRaw = cols.nls >= 0 ? cellAt(cells, cols.nls) : (kind === 'core' ? (cells[5] || '') : '');
                  const equipRaw = cols.equipment >= 0 ? cellAt(cells, cols.equipment).trim() : '';
                  const notesBase = cols.notes >= 0 ? cellAt(cells, cols.notes).trim() : (kind === 'core' ? (cells[6] || '').trim() : '');
                  const notesRaw = [notesBase, equipRaw ? 'Thiết bị: ' + equipRaw : ''].filter(Boolean).join('; ');
                  if (!lessonRaw.trim()) continue;

                  let lessonCode = '';
                  let cleanName = '';
                  let section = 'core';
                  let orientation = '';
                  let topicForRow = currentTopic || 'Chương trình GDPT';

                  const mElective = lessonRaw.match(/^\s*Chuyên\s*đề\s*(\d+[a-zA-Z]?)\s*[-–.:]?\s*(.+)$/i);
                  const mBai = lessonRaw.match(/^\s*(?:(?:Bài|Bải|Tiết)|Chủ\s*đề\s*\d+\s*[-–.:]\s*(?:Bài|Bải))?\s*(?:Bài|Bải)\s+(\d+[a-zA-Z]?)\s*[-–.:]\s*(.+)$/i);

                  if (kind === 'elective' || mElective) {
                    section = 'elective_topic';
                    if (mElective) {
                      lessonCode = 'CD' + mElective[1].toLowerCase();
                      cleanName = cleanTitle(`Chuyên đề ${mElective[1]}: ${mElective[2]}`);
                    } else if (stt && /^\d+[a-zA-Z]?$/.test(stt.trim())) {
                      lessonCode = 'CD' + stt.trim().toLowerCase();
                      cleanName = cleanTitle(lessonRaw);
                    } else {
                      const nextIdx = Array.from(lessonsMap.keys()).filter(k => /^CD\d/i.test(k)).length + 1;
                      lessonCode = 'CD' + nextIdx;
                      cleanName = cleanTitle(lessonRaw);
                    }
                    orientation = currentOrientation || detectPpctOrientation(currentTopic) || detectPpctOrientation(lessonRaw) || docOrientation;
                    topicForRow = currentTopic || 'Chuyên đề học tập lựa chọn';
                  } else if (mBai) {
                    section = 'core';
                    lessonCode = 'B' + mBai[1].toLowerCase();
                    cleanName = cleanTitle(`Bài ${mBai[1]}. ${mBai[2]}`);
                  } else if (/^\s*Kiểm\s*tra\b/i.test(lessonRaw)) {
                    section = 'assessment';
                    const lowL = lessonRaw.toLowerCase();
                    let semNum = semester;
                    if (/(?:hk|học\s*k[ìỳ])\s*(?:ii|2)\b|\b(?:hk)?2\b/.test(lowL)) semNum = 2;
                    else if (/(?:hk|học\s*k[ìỳ])\s*(?:i|1)\b|\b(?:hk)?1\b/.test(lowL)) semNum = 1;
                    lessonCode = (lowL.includes('giữa') ? 'KTGK' : 'KTCK') + semNum;
                    cleanName = cleanTitle(lessonRaw);
                    topicForRow = 'Kiểm tra, đánh giá định kỳ';
                  } else if (/^\s*(?:Ôn\s*tập|Luyện\s*tập)\b/i.test(lessonRaw)) {
                    section = 'review';
                    const isCont = /\s*\((?:tt|tiếp(?:\s*theo)?|t|tiết\s*\d+)\)?\s*$/i.test(lessonRaw);
                    const prefix = /^\s*Luyện\s*tập\b/i.test(lessonRaw) ? 'LT' : 'OT';
                    const baseCode = `${prefix}_HK${semester}`;
                    if (lessonsMap.has(baseCode) && !isCont) {
                      let suffix = 2;
                      while (lessonsMap.has(`${baseCode}_${suffix}`)) suffix += 1;
                      lessonCode = `${baseCode}_${suffix}`;
                    } else {
                      lessonCode = baseCode;
                    }
                    cleanName = cleanTitle(lessonRaw);
                    topicForRow = currentTopic || 'Ôn tập, củng cố';
                  } else {
                    continue;
                  }

                  let outcomes = outcomesRaw.split(/(?:^|\n|\r|\.)\s*-\s*/)
                    .map(o => o.trim().replace(/^-\s*/, ''))
                    .filter(o => o.length > 3);
                  if (!outcomes.length) {
                    if (section === 'assessment') outcomes = ['Kiểm tra, đánh giá định kỳ theo ma trận và bản đặc tả.'];
                    else if (section === 'review') outcomes = ['Hệ thống hóa, củng cố kiến thức và kĩ năng đã học.'];
                  }
                  const rowComps = normalizeTextList(competenciesRaw);
                  const rowNote = String(notesRaw || '').replace(/\s+/g, ' ').trim();
                  const occEntry = {
                    semester,
                    table_index: tableIndex,
                    row_index: rIdx,
                    week_raw: weekRaw,
                    duration_raw: durationRaw,
                    ppct_raw: ppctRaw,
                    periods_raw: ppctRaw || durationRaw || '1',
                    competencies_raw: competenciesRaw,
                    notes_raw: rowNote
                  };

                  if (lessonsMap.has(lessonCode)) {
                    const existing = lessonsMap.get(lessonCode);
                    existing.occurrences.push(occEntry);
                    outcomes.forEach(o => { if (!existing.outcomes.includes(o)) existing.outcomes.push(o); });
                    rowComps.forEach(c => { if (!existing.digital_competencies.includes(c)) existing.digital_competencies.push(c); });
                    if (rowNote) {
                      const prevNotes = existing.notes ? existing.notes.split('; ').map(s => s.trim()).filter(Boolean) : [];
                      if (!prevNotes.includes(rowNote)) {
                        prevNotes.push(rowNote);
                        existing.notes = prevNotes.join('; ');
                      }
                    }
                    if (orientation && !existing.orientation) existing.orientation = orientation;
                  } else {
                    lessonsMap.set(lessonCode, {
                      status: 'new',
                      grade: grade,
                      lesson_code: lessonCode,
                      lesson_name: cleanName,
                      lesson_name_source: cleanName,
                      topic: topicForRow,
                      topic_source: topicForRow,
                      section,
                      orientation,
                      occurrences: [occEntry],
                      outcomes,
                      digital_competencies: rowComps,
                      notes: rowNote
                    });
                  }
                }
              }

              if (lessonsMap.size > 0) {
                lessons = Array.from(lessonsMap.values());
              }
            }
          } catch(e) {
            console.warn('Lỗi phân tích HTML bảng KHDH:', e);
          }
        }

        // Dự phòng nếu chưa bóc được từ bảng HTML
        if (!lessons.length && body.extracted_text) {
          const text = body.extracted_text;
          const isExam = /MA TRẬN|ĐẶC TẢ|ĐỀ KIỂM TRA|BẢNG ĐẶC TẢ|PHẦN I/i.test(text) || /Câu\s*\d+[:.]/i.test(text);
          if (isExam) {
            issues.push({
              message: '⚠️ Nhận diện: Tệp "' + fn + '" là hồ sơ Ma trận & Đề kiểm tra. Mục này dùng để nạp Bảng Kế hoạch dạy học (PPCT Phụ lục 1). Để nạp các câu hỏi trong đề này vào ngân hàng đề, Thầy/Cô vui lòng bấm nút "✨ AI Nhập đề" ở thanh trên cùng!'
            });
          }
          const matches = [...text.matchAll(/(?:Bài)\s*(\d+)[:.]\s*([^\n\r]+)/gi)];
          if (matches.length > 0) {
            lessons = matches.slice(0, 30).map((m, i) => ({
              status: 'new',
              grade: grade,
              lesson_code: 'B' + (m[1] || (i + 1)),
              lesson_name: m[2].trim(),
              lesson_name_source: m[2].trim(),
              topic: 'Chương trình GDPT',
              topic_source: 'Chương trình GDPT',
              outcomes: ['Yêu cầu cần đạt theo chương trình môn học.'],
              digital_competencies: [],
              notes: '',
              occurrences: [{ week_raw: 'Tuần ' + (i + 1), duration_raw: '1', ppct_raw: '', periods_raw: '1', competencies_raw: '', notes_raw: '' }]
            }));
          }
        }

        return {
          sha256: 'local-' + Date.now(),
          filename: fn,
          grades: [grade],
          lessons: lessons,
          summary: {
            new: lessons.length,
            changed: 0,
            unchanged: 0,
            conflict: 0
          },
          issues: issues
        };
      }

      if (path === '/api/ppct/apply-import') {
        let grade = Number(body.grade || 0);
        if (!grade && body.filename) {
          const m = body.filename.match(/(?:TIN|KHỐI|KHOI|LỚP|LOP|K)\s*(\d+)/i);
          if (m) grade = Number(m[1]);
        }
        if (!grade) grade = (window.store && window.store.ppctGrade) || 9;
        const targetSubject = body.subject_name || (window.store && window.store.selectedSubject) || 'Tin học';

        const incoming = Array.isArray(body.lessons) ? body.lessons : [];
        if (incoming.length > 0) {
          if (!currentWorkspaceData.bank.ppct) currentWorkspaceData.bank.ppct = { lessons: [], cleared_grades: [] };
          const cleared = (currentWorkspaceData.bank.ppct.cleared_grades || []).filter(g => Number(g) !== grade);
          currentWorkspaceData.bank.ppct.cleared_grades = cleared;
          const existing = cleanPpctLessons(currentWorkspaceData.bank.ppct.lessons || [], cleared);
          const otherLessons = existing.filter(l => !(((l.subject_name || 'Tin học') === targetSubject) && Number(l.grade) === grade));
          const newLessons = incoming.map(l => {
            const lessonName = l.lesson_name_source || l.lesson_name || l.name || '';
            const topicSource = l.topic_source || l.topic || 'Chương trình GDPT';
            const section = normalizePpctSection(l.section, l.lesson_code, lessonName, topicSource);
            const orientRaw = String(l.orientation || '').trim();
            const orientation = detectPpctOrientation(orientRaw) || orientRaw || (section === 'elective_topic' ? (detectPpctOrientation(topicSource) || detectPpctOrientation(lessonName)) : '');
            const occs = normalizeOccurrences(l.occurrences, section === 'elective_topic' ? '' : 'Tuần 1');
            const compList = normalizeTextList(l.digital_competencies ?? l.competencies ?? l.competencies_raw ?? l.nls_ai ?? []);
            for (const o of occs) {
              for (const c of normalizeTextList(o.competencies_raw)) {
                if (!compList.includes(c)) compList.push(c);
              }
            }
            return {
              ...l,
              grade: grade,
              user_uploaded: true,
              subject_name: l.subject_name || targetSubject,
              section,
              orientation,
              occurrences: occs,
              digital_competencies: compList,
              notes: normalizeNotesValue(l.notes ?? l.note ?? l.notes_raw ?? l.ghi_chu ?? '', occs)
            };
          });
          currentWorkspaceData.bank.ppct.lessons = [...otherLessons, ...newLessons];
          await syncToFirestore(uid, currentWorkspaceData);

          if (window.store && window.store.bank) {
            window.store.bank.ppct = JSON.parse(JSON.stringify(currentWorkspaceData.bank.ppct));
          }
        }
        return {
          bank: currentWorkspaceData.bank,
          summary: { new: incoming.length, changed: 0, conflict: 0 }
        };
      }

      if (path === '/api/ppct/save-lesson') {
        const l = body.lesson || body;
        const grade = Number(l.grade || 9);
        const targetSubject = l.subject_name || (window.store && window.store.selectedSubject) || 'Tin học';
        if (!currentWorkspaceData.bank.ppct) currentWorkspaceData.bank.ppct = { lessons: [], cleared_grades: [] };
        const cleared = (currentWorkspaceData.bank.ppct.cleared_grades || []).filter(g => Number(g) !== grade);
        currentWorkspaceData.bank.ppct.cleared_grades = cleared;
        const existing = cleanPpctLessons(currentWorkspaceData.bank.ppct.lessons || [], cleared);
        const lessonName = l.lesson_name_source || l.lesson_name || '';
        const topicSource = l.topic_source || l.topic || 'Chương trình GDPT';
        const section = normalizePpctSection(l.section, l.lesson_code, lessonName, topicSource);
        const orientRaw = String(l.orientation || '').trim();
        const orientation = detectPpctOrientation(orientRaw) || orientRaw || (section === 'elective_topic' ? (detectPpctOrientation(topicSource) || detectPpctOrientation(lessonName)) : '');
        const compList = normalizeTextList(l.digital_competencies ?? l.competencies ?? l.competencies_raw ?? l.nls_ai ?? []);
        const notesStr = normalizeNotesValue(l.notes ?? l.note ?? l.notes_raw ?? l.ghi_chu ?? '');
        const occs = normalizeOccurrences(l.occurrences || [{
          week_raw: l.week_raw != null ? l.week_raw : (section === 'elective_topic' ? '' : 'Tuần 1'),
          duration_raw: l.duration_raw ?? l.so_tiet ?? l.num_periods ?? '',
          ppct_raw: l.ppct_raw || '',
          periods_raw: l.periods_raw || l.ppct_raw || l.duration_raw || '1',
          competencies_raw: compList.join('\n'),
          notes_raw: notesStr
        }], section === 'elective_topic' ? '' : 'Tuần 1');
        const lessonObj = {
          grade: grade,
          lesson_code: l.lesson_code,
          lesson_name_source: lessonName,
          topic_source: topicSource,
          section,
          orientation,
          subject_name: targetSubject,
          user_uploaded: true,
          occurrences: occs,
          outcomes: Array.isArray(l.outcomes) ? l.outcomes : [],
          digital_competencies: compList,
          notes: notesStr
        };
        const idx = existing.findIndex(x => ((x.subject_name || 'Tin học') === targetSubject) && Number(x.grade) === grade && x.lesson_code === lessonObj.lesson_code);
        if (idx >= 0) existing[idx] = lessonObj;
        else existing.push(lessonObj);
        currentWorkspaceData.bank.ppct.lessons = existing;
        await syncToFirestore(uid, currentWorkspaceData);
        if (window.store && window.store.bank) window.store.bank.ppct = JSON.parse(JSON.stringify(currentWorkspaceData.bank.ppct));
        return { bank: currentWorkspaceData.bank, lesson: lessonObj };
      }

      if (path === '/api/ppct/delete-lesson') {
        const grade = Number(body.grade || 9);
        const code = body.lesson_code;
        const targetSubject = body.subject_name || (window.store && window.store.selectedSubject) || 'Tin học';
        if (!currentWorkspaceData.bank.ppct) currentWorkspaceData.bank.ppct = { lessons: [], cleared_grades: [] };
        currentWorkspaceData.bank.ppct.lessons = (currentWorkspaceData.bank.ppct.lessons || []).filter(
          l => !(((l.subject_name || 'Tin học') === targetSubject) && Number(l.grade) === grade && l.lesson_code === code)
        );
        await syncToFirestore(uid, currentWorkspaceData);
        if (window.store && window.store.bank) window.store.bank.ppct = JSON.parse(JSON.stringify(currentWorkspaceData.bank.ppct));
        return { bank: currentWorkspaceData.bank };
      }

      if (path === '/api/ppct/clear-grade') {
        const grade = Number(body.grade || 0);
        const targetSubject = body.subject_name || (window.store && window.store.selectedSubject) || 'Tin học';
        if (!currentWorkspaceData.bank.ppct) currentWorkspaceData.bank.ppct = { lessons: [], cleared_grades: [] };
        const cleared = new Set(currentWorkspaceData.bank.ppct.cleared_grades || []);
        cleared.add(grade);
        currentWorkspaceData.bank.ppct.cleared_grades = [...cleared];
        currentWorkspaceData.bank.ppct.lessons = (currentWorkspaceData.bank.ppct.lessons || []).filter(
          l => !(((l.subject_name || 'Tin học') === targetSubject) && Number(l.grade) === grade)
        );
        await syncToFirestore(uid, currentWorkspaceData);
        if (window.store && window.store.bank) window.store.bank.ppct = JSON.parse(JSON.stringify(currentWorkspaceData.bank.ppct));
        return { bank: currentWorkspaceData.bank };
      }

      if (path === '/api/ppct/restore-grade') {
        const grade = Number(body.grade || 0);
        const targetSubject = body.subject_name || (window.store && window.store.selectedSubject) || 'Tin học';
        if (!currentWorkspaceData.bank.ppct) currentWorkspaceData.bank.ppct = { lessons: [], cleared_grades: [] };
        currentWorkspaceData.bank.ppct.cleared_grades = (currentWorkspaceData.bank.ppct.cleared_grades || []).filter(
          g => Number(g) !== grade && g !== `${targetSubject}:${grade}`
        );
        await syncToFirestore(uid, currentWorkspaceData);
        if (window.store && window.store.bank) window.store.bank.ppct = JSON.parse(JSON.stringify(currentWorkspaceData.bank.ppct));
        return { bank: currentWorkspaceData.bank };
      }

      // Tuyến Kiểm tra thường xuyên (KTTX — TT 22/2021, Điều 6)
      if (path === '/api/kttx') {
        if (!Array.isArray(currentWorkspaceData.kttx)) currentWorkspaceData.kttx = [];
        return buildKttxState(currentWorkspaceData, subj);
      }

      if (path === '/api/kttx/save') {
        const p = (body && body.activity && typeof body.activity === 'object') ? body.activity : (body || {});
        if (!p || typeof p !== 'object' || Array.isArray(p)) {
          throw new Error('Dữ liệu hoạt động KTTX không hợp lệ.');
        }
        const grade = Number(p.grade);
        const allowedGrades = kttxGradesFor(subj);
        if (!Number.isInteger(grade) || !allowedGrades.includes(grade)) {
          throw new Error('Khối không thuộc chương trình đang chọn.');
        }
        const semester = Number(p.semester);
        if (![1, 2].includes(semester)) {
          throw new Error('Học kì phải là 1 hoặc 2.');
        }
        const k = Number(p.k);
        if (!Number.isInteger(k) || k < 1 || k > 20) {
          throw new Error('Số thứ tự bài KTTX phải từ 1 đến 20.');
        }
        if (!KTTX_FORM_KEYS.includes(p.form)) {
          throw new Error('Hình thức phải theo TT 22/2021, Điều 6, khoản 1.');
        }
        if (p.form === KTTX_CLUSTER_FORM.key && grade < KTTX_CLUSTER_FORM.min_grade) {
          throw new Error('Cụm chuyên đề học tập chỉ có ở cấp THPT (TT 22/2021, Điều 6, khoản 3).');
        }
        const maxNum = Number(String(p.max_score ?? '10').trim().replace(',', '.'));
        if (!Number.isFinite(maxNum) || maxNum <= 0 || maxNum > 1000) {
          throw new Error('Thang điểm tối đa phải lớn hơn 0 và không quá 1000.');
        }
        const maxScoreStr = String(maxNum);
        const className = String(p.class_name || '').trim().slice(0, 30);
        const examId = p.exam_id || null;
        if (examId) {
          const exam = (currentWorkspaceData.exams || []).find(e => e.id === examId);
          if (!exam || exam.exam_type !== 'TX' || Number(exam.grade) !== grade) {
            throw new Error('Chỉ gắn được đề kiểm tra thường xuyên (TX) cùng khối.');
          }
        }
        const rawCodes = p.lesson_codes || [];
        if (!Array.isArray(rawCodes)) {
          throw new Error('Danh sách mã bài KTTX không hợp lệ.');
        }
        const lessonCodes = [];
        for (const c of rawCodes) {
          const sc = String(c || '').trim();
          if (sc && !lessonCodes.includes(sc)) lessonCodes.push(sc);
        }
        let orientation = String(p.orientation || '').trim();
        if (p.form === KTTX_CLUSTER_FORM.key && !orientation && lessonCodes.length) {
          const ppctL = (currentWorkspaceData.bank?.ppct?.lessons || []).find(l =>
            Number(l.grade) === grade && (l.subject_name || 'Tin học') === subj && l.lesson_code === lessonCodes[0]
          );
          if (ppctL) {
            orientation = ppctL.orientation || detectPpctOrientation(`${ppctL.topic_source || ''} ${ppctL.lesson_name_source || ''}`) || '';
          }
        }
        if (!Array.isArray(currentWorkspaceData.kttx)) currentWorkspaceData.kttx = [];
        const records = currentWorkspaceData.kttx;
        const ident = p.id || null;
        const old = ident ? records.find(a => a.id === ident) : null;
        if (ident && !old) {
          const err = new Error('Không tìm thấy hoạt động KTTX.');
          err.status = 404;
          throw err;
        }
        const dup = records.find(a =>
          a.id !== ident &&
          (a.subject_name || 'Tin học') === subj &&
          Number(a.grade) === grade &&
          (a.class_name || '') === className &&
          Number(a.semester) === semester &&
          Number(a.k) === k
        );
        if (dup) {
          const err = new Error(`Đã có TX${k}-HK${semester} cho khối ${grade}${className ? ' lớp ' + className : ''}.`);
          err.status = 409;
          throw err;
        }
        const nowIso = new Date().toISOString();
        const activity = {
          id: ident || ('KTTX-' + Math.random().toString(16).slice(2, 14)),
          code: `TX${k}-HK${semester}`,
          subject_name: subj,
          grade,
          semester,
          k,
          class_name: className,
          form: p.form,
          max_score: maxScoreStr,
          recorded: p.recorded === true,
          exam_id: examId,
          lesson_codes: lessonCodes,
          orientation,
          note: String(p.note || '').trim().slice(0, 500),
          title: kttxActivityTitle(subj, grade, k, semester),
          created_at: old?.created_at || nowIso,
          updated_at: nowIso,
          updated_by: window.FirebaseState.user?.email || 'local'
        };
        const nextAll = records.filter(a => a.id !== activity.id).concat([activity]);
        nextAll.sort((a, b) => (Number(a.grade) - Number(b.grade)) || String(a.class_name || '').localeCompare(String(b.class_name || '')) || (Number(a.semester) - Number(b.semester)) || (Number(a.k) - Number(b.k)));
        currentWorkspaceData.kttx = nextAll;
        await syncToFirestore(uid, currentWorkspaceData);
        if ((window.FirebaseState.user?.uid || 'offline') !== uid) {
          throw new Error('Tài khoản đã thay đổi trong khi lưu KTTX.');
        }
        if (window.store) window.store.kttxActivities = JSON.parse(JSON.stringify(nextAll));
        return { activity: JSON.parse(JSON.stringify(activity)), ...buildKttxState(currentWorkspaceData, subj) };
      }

      if (path === '/api/kttx/delete') {
        const ident = body && body.id;
        if (!Array.isArray(currentWorkspaceData.kttx)) currentWorkspaceData.kttx = [];
        const remaining = currentWorkspaceData.kttx.filter(a => a.id !== ident);
        if (remaining.length === currentWorkspaceData.kttx.length) {
          const err = new Error('Không tìm thấy hoạt động KTTX.');
          err.status = 404;
          throw err;
        }
        currentWorkspaceData.kttx = remaining;
        await syncToFirestore(uid, currentWorkspaceData);
        if ((window.FirebaseState.user?.uid || 'offline') !== uid) {
          throw new Error('Tài khoản đã thay đổi trong khi xóa KTTX.');
        }
        if (window.store) window.store.kttxActivities = JSON.parse(JSON.stringify(remaining));
        return buildKttxState(currentWorkspaceData, subj);
      }

      throw new Error('Thao tác này chưa được hỗ trợ trên bản Pages. Không có dữ liệu nào được thay đổi.');
    }
  };

  // Tuần tự hóa ghi và tách phản hồi khỏi workspace: sửa trên giao diện không sửa ngầm snapshot.
  const directHandle = window.FirebaseClient.handle.bind(window.FirebaseClient);
  let pendingRequest = Promise.resolve();
  window.FirebaseClient.handle = (path, body) => {
    const run = async () => {
      if (!isStaticHost) throw new Error('Trang này sử dụng máy chủ Python; không xử lý dữ liệu qua cầu nối Pages.');
      const before = JSON.parse(JSON.stringify(currentWorkspaceData));
      const uid = window.FirebaseState.user?.uid || 'offline';
      currentMutationSnapshot = before;
      activeMutationMeta = {
        path,
        allowShrink: Boolean(window.CloudStorageV2?.isShrinkAllowedAction?.(path, body))
      };
      try { return JSON.parse(JSON.stringify(await directHandle(path, body))); }
      catch (error) {
        if ((window.FirebaseState.user?.uid || 'offline') === uid) {
          currentWorkspaceData = before;
          window.FirebaseState.currentData = currentWorkspaceData;
        }
        throw error;
      } finally {
        currentMutationSnapshot = null;
        activeMutationMeta = null;
      }
    };
    const request = pendingRequest.then(run, run);
    pendingRequest = request.catch(() => {});
    return request;
  };

  window.FirebaseClient.loadFromGoogleDrive = loadFromGoogleDrive;

  window.FirebaseClient.syncCurrentData = () => {
    const runSync = async () => {
      if (!isStaticHost) throw new Error('Trang này sử dụng máy chủ Python; không xử lý dữ liệu qua cầu nối Pages.');
      const uid = window.FirebaseState.user?.uid || 'offline';
      await syncToFirestore(uid, currentWorkspaceData, { path: 'syncCurrentData', allowShrink: false });
      return {
        ok: !currentWorkspaceData._sync?.pending,
        pending: Boolean(currentWorkspaceData._sync?.pending)
      };
    };
    const request = pendingRequest.then(runSync, runSync);
    pendingRequest = request.catch(() => {});
    return request;
  };

  window.FirebaseClient.replaceWorkspaceData = (nextData) => {
    const runReplace = async () => {
      if (!isStaticHost) throw new Error('Trang này sử dụng máy chủ Python; không xử lý dữ liệu qua cầu nối Pages.');
      if (!nextData || typeof nextData !== 'object' || !nextData.bank || !Array.isArray(nextData.bank.questions)) {
        throw new Error('Dữ liệu khôi phục không đúng định dạng ExamMatrix Studio.');
      }
      const before = JSON.parse(JSON.stringify(currentWorkspaceData));
      const uid = window.FirebaseState.user?.uid || 'offline';
      const fallbackPpct = currentWorkspaceData.bank?.ppct || { lessons: [], cleared_grades: [] };
      const normalized = JSON.parse(JSON.stringify({
        bank: {
          questions: nextData.bank.questions,
          ppct: (nextData.bank.ppct && Array.isArray(nextData.bank.ppct.lessons)) ? nextData.bank.ppct : fallbackPpct,
          competency_catalogs: Array.isArray(nextData.bank.competency_catalogs)
            ? nextData.bank.competency_catalogs
            : (currentWorkspaceData.bank?.competency_catalogs || [])
        },
        exams: Array.isArray(nextData.exams) ? nextData.exams : [],
        revisions: Array.isArray(nextData.revisions) ? nextData.revisions : [],
        matrices: Array.isArray(nextData.matrices) ? nextData.matrices : [],
        assessment_plans: Array.isArray(nextData.assessment_plans)
          ? nextData.assessment_plans
          : (Array.isArray(currentWorkspaceData.assessment_plans) ? currentWorkspaceData.assessment_plans : []),
        kttx: Array.isArray(nextData.kttx)
          ? nextData.kttx
          : (Array.isArray(currentWorkspaceData.kttx) ? currentWorkspaceData.kttx : []),
        ...(nextData.profile && typeof nextData.profile === 'object' ? { profile: nextData.profile } : (currentWorkspaceData.profile ? { profile: currentWorkspaceData.profile } : {}))
      }));
      try {
        currentMutationSnapshot = before;
        activeMutationMeta = { path: 'replaceWorkspaceData', allowShrink: true };
        currentWorkspaceData = normalized;
        window.FirebaseState.currentData = currentWorkspaceData;
        await syncToFirestore(uid, currentWorkspaceData, activeMutationMeta);
        if ((window.FirebaseState.user?.uid || 'offline') !== uid) {
          throw new Error('Tài khoản đã thay đổi trong khi khôi phục dữ liệu.');
        }
        applyWorkspaceToStore();
        return {
          ok: !currentWorkspaceData._sync?.pending,
          pending: Boolean(currentWorkspaceData._sync?.pending)
        };
      } catch (error) {
        if ((window.FirebaseState.user?.uid || 'offline') === uid) {
          currentWorkspaceData = before;
          window.FirebaseState.currentData = currentWorkspaceData;
        }
        throw error;
      } finally {
        currentMutationSnapshot = null;
        activeMutationMeta = null;
      }
    };
    const request = pendingRequest.then(runReplace, runReplace);
    pendingRequest = request.catch(() => {});
    return request;
  };

  // Quét toàn bộ bộ nhớ đệm (localStorage và IndexedDB) để tìm bản dữ liệu tốt nhất cứu hộ
  window.FirebaseClient.rescueBestCache = async function() {
    let best = null;
    let maxScore = 0;
    let bestKey = '';

    // 1. Quét localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith(localCacheKey) || k === 'exammatrix_emergency_backup' || k === 'exammatrix_offline_backup')) {
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            try {
              const rawVal = JSON.parse(raw);
              const val = rawVal?.data || rawVal;
              const score = calculateDataScore(val);
              if (score > maxScore) {
                maxScore = score;
                best = val;
                bestKey = k;
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}

    // 2. Quét IndexedDB
    try {
      const idbRecords = await idbGetAll();
      for (const rec of idbRecords) {
        const d = rec?.data;
        const score = calculateDataScore(d);
        if (score > maxScore) {
          maxScore = score;
          best = d;
          bestKey = 'idb:' + (rec.uid || 'unknown');
        }
      }
    } catch (e) {}

    if (!best || maxScore === 0) return { found: false };
    return {
      found: true,
      score: maxScore,
      sourceKey: bestKey,
      questionsCount: best.bank?.questions?.length || 0,
      ppctCount: best.bank?.ppct?.lessons?.length || 0,
      examsCount: best.exams?.length || 0,
      matricesCount: best.matrices?.length || 0,
      revisionsCount: best.revisions?.length || 0,
      data: best
    };
  };

  // Áp dụng bản cứu hộ vào workspace hiện tại
  window.FirebaseClient.applyRescuedCache = async function(data) {
    if (!data || typeof data !== 'object') return false;
    currentWorkspaceData = JSON.parse(JSON.stringify({
      ...data,
      assessment_plans: Array.isArray(data.assessment_plans) ? data.assessment_plans : [],
      kttx: Array.isArray(data.kttx) ? data.kttx : []
    }));
    delete currentWorkspaceData._sync;
    window.FirebaseState.currentData = currentWorkspaceData;
    const targetUid = window.FirebaseState.user?.uid || 'offline';
    try { saveStorageData(targetUid, currentWorkspaceData); } catch (e) {}
    try { saveStorageData('offline', currentWorkspaceData); } catch (e) {}
    await trySaveLocalCache(targetUid, currentWorkspaceData);
    applyWorkspaceToStore();
    return true;
  };

  function updateDriveSyncButton() {
    const syncBtn = document.getElementById('gdrive-sync-btn');
    if (!syncBtn) return;
    const provider = window.FirebaseState.provider;
    const user = window.FirebaseState.user;
    if (provider === 'firebase-cloud-v2' && Boolean(user) && !user.isAnonymous) {
      syncBtn.hidden = false;
      const hasDriveTok = Boolean(loadRuntimeDriveToken(user.uid));
      syncBtn.textContent = hasDriveTok ? '☁ Đồng bộ Drive' : '🔗 Kết nối Drive';
      syncBtn.title = hasDriveTok
        ? 'Đồng bộ cây thư mục theo từng Khối lên Google Drive riêng'
        : 'Cấp hoặc gia hạn quyền Google Drive để đồng bộ thư mục phân khối';
      return;
    }
    const isDrive = provider === 'google-drive' && Boolean(user);
    syncBtn.hidden = !isDrive;
    if (!isDrive) return;
    const session = window.FirebaseState.driveSession;
    const tokenExpired = !session?.accessToken || (session.expiresAt && session.expiresAt <= Date.now());
    const needsSync = tokenExpired || Boolean(currentWorkspaceData?._sync?.pending);
    syncBtn.textContent = needsSync ? '⚠ Đồng bộ Drive' : '☁ Đồng bộ Drive';
    syncBtn.title = needsSync
      ? 'Có thay đổi chưa đồng bộ hoặc phiên Drive đã hết hạn — bấm để đồng bộ ngay'
      : 'Đồng bộ ngay lên Google Drive riêng của bạn';
  }

  async function requestTokenWithConsentFallback(driveCfg, { prompt = '', loginHint = '' } = {}) {
    try {
      return await window.GoogleDriveStorage.requestAccessToken({
        clientId: driveCfg.clientId,
        scope: driveCfg.scope,
        prompt,
        loginHint
      });
    } catch (err) {
      if (err && err.code === 'MISSING_DRIVE_SCOPE' && prompt !== 'consent') {
        return await window.GoogleDriveStorage.requestAccessToken({
          clientId: driveCfg.clientId,
          scope: driveCfg.scope,
          prompt: 'consent',
          loginHint
        });
      }
      throw err;
    }
  }

  async function tryAutoRefreshDriveToken(session, driveCfg) {
    if (!session || !session.user || !session.user.uid) return false;
    if (!window.GoogleDriveStorage || typeof window.GoogleDriveStorage.requestAccessToken !== 'function') return false;
    if (!driveCfg || !driveCfg.clientId) return false;
    const hasInteractiveContext = (typeof document !== 'undefined' && typeof document.createElement === 'function')
      || Boolean(session.allowAutoRefresh);
    if (!hasInteractiveContext) return false;
    try {
      const tokenInfo = await requestTokenWithConsentFallback(driveCfg, {
        prompt: '',
        loginHint: session.user.email || ''
      });
      if (!tokenInfo || !tokenInfo.accessToken) return false;
      if (typeof window.GoogleDriveStorage.getUserProfile === 'function') {
        const profile = await window.GoogleDriveStorage.getUserProfile(tokenInfo.accessToken, {
          fetchImpl: session.fetchImpl
        });
        if (!profile || profile.uid !== session.user.uid) {
          return false;
        }
        session.user = { ...session.user, ...profile };
        window.FirebaseState.user = session.user;
      }
      session.accessToken = tokenInfo.accessToken;
      session.expiresAt = tokenInfo.expiresAt;
      saveDriveSession(session);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Đồng bộ song song lên Firebase Firestore (kênh lưu trữ đám mây song song với Google Drive)
  async function syncToFirestoreParallel(uid, data) {
    if (!window.FirebaseState?.db || !window.FirebaseState?._firestoreHelpers) return;
    try {
      const { doc, setDoc } = window.FirebaseState._firestoreHelpers;
      const targetUid = (uid && uid !== 'offline') ? uid : (window.FirebaseState.user?.uid || window.FirebaseState.driveSession?.user?.uid || 'offline');
      if (targetUid === 'offline') return;
      const ref = doc(window.FirebaseState.db, 'workspaces', targetUid);
      const email = window.FirebaseState.user?.email || window.FirebaseState.driveSession?.user?.email || '';
      const payload = {
        owner_email: email,
        updated_at: new Date().toISOString(),
        bank: {
          questions: data.bank?.questions || [],
          ppct: data.bank?.ppct || { lessons: [] },
          competency_catalogs: data.bank?.competency_catalogs || []
        },
        exams: data.exams || [],
        revisions: data.revisions || [],
        matrices: data.matrices || [],
        assessment_plans: Array.isArray(data.assessment_plans) ? data.assessment_plans : [],
        kttx: Array.isArray(data.kttx) ? data.kttx : []
      };
      let timer;
      const writePromise = setDoc(ref, payload, { merge: true });
      await Promise.race([
        writePromise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Firebase timeout')), 5000); })
      ]);
      if (timer) clearTimeout(timer);
      console.info('[Firebase Sync] Đã đồng bộ bản sao lên Firebase Firestore song song.');
    } catch (e) {
      console.warn('[Firebase Sync] Lưu ý đồng bộ Firebase (dữ liệu chính vẫn an toàn trên Google Drive):', e?.message || e);
    }
  }

  // ===========================================================================
  // CLOUD-FIRST V2 ENGINE: Firebase Firestore (Chính) + Google Drive (Phân khối)
  // ===========================================================================
  async function syncToCloudV2(uid, beforeData, afterData, mutationMeta = {}) {
    const v2 = window.CloudStorageV2;
    const db = window.FirebaseState?.db;
    const helpers = window.FirebaseState?._firestoreHelpers;
    const user = window.FirebaseState?.user;
    if (!v2 || !user || user.isAnonymous || !db || !helpers) {
      throw new Error('Vui lòng đăng nhập tài khoản Google để lưu dữ liệu lên Đám mây.');
    }
    const targetUid = user.uid || uid;
    const beforeSlices = lastSyncedSlicesV2 || v2.splitWorkspaceIntoSlices(beforeData || {});
    const afterSlices = v2.splitWorkspaceIntoSlices(afterData || {});

    const wipeCheck = v2.checkAntiWipe(beforeSlices, afterSlices, mutationMeta || {});
    if (!wipeCheck.ok) {
      setCloudSyncPill('error', '⛔ Đã chặn ghi đè rỗng');
      throw new Error(wipeCheck.message);
    }

    setCloudSyncPill('syncing', '⏳ Đang lưu dữ liệu…');
    try {
      await v2.firestoreWriteDiffV2(targetUid, db, helpers, beforeSlices, afterSlices, {
        ownerEmail: user.email || ''
      });
    } catch (err) {
      setCloudSyncPill('error', '⚠️ Chưa lưu được');
      throw new Error('Chưa lưu được dữ liệu trực tuyến (' + (err?.message || 'lỗi kết nối') + '). Vui lòng kiểm tra mạng và thử lại.');
    }

    lastSyncedSlicesV2 = afterSlices;
    afterData._sync = {
      pending: false,
      provider: 'firebase-cloud-v2',
      synced_at: new Date().toISOString()
    };

    const driveTok = loadRuntimeDriveToken(targetUid);
    if (driveTok && window.GoogleDriveStorage) {
      const driveCfg = getGoogleDriveSettings();
      v2.driveWriteDiffV2(driveTok.accessToken, window.GoogleDriveStorage, beforeSlices, afterSlices, {
        folderName: driveCfg.folderName,
        ownerEmail: user.email || '',
        folderCache: cloudFolderCacheV2
      }).then(() => {
        if (window.FirebaseState.user?.uid === targetUid) {
          setCloudSyncPill('synced', '☁ Đã lưu · Drive ✓');
          updateDriveSyncButton();
        }
      }).catch((drvErr) => {
        if (window.FirebaseState.user?.uid !== targetUid) return;
        if (drvErr && (drvErr.code === 'DRIVE_AUTH_EXPIRED' || drvErr.status === 401)) {
          saveRuntimeDriveToken(targetUid, '', 0);
          setCloudSyncPill('partial', '☁ Đã lưu · Cần kết nối lại Drive');
        } else {
          setCloudSyncPill('partial', '☁ Đã lưu · Chờ đồng bộ Drive');
        }
        updateDriveSyncButton();
      });
    } else {
      setCloudSyncPill('synced', '☁ Đã lưu trực tuyến');
    }
    updateDriveSyncButton();
  }

  async function loadFromCloudV2(user, opts = {}) {
    const v2 = window.CloudStorageV2;
    const db = opts.db || window.FirebaseState?.db;
    const helpers = opts.helpers || window.FirebaseState?._firestoreHelpers;
    if (!v2 || !user || user.isAnonymous || !db || !helpers) return null;

    const status = document.getElementById('static-sync-status');
    const driveCfg = getGoogleDriveSettings();
    const installV2 = (data, slices) => {
      const clean = JSON.parse(JSON.stringify({
        bank: {
          questions: Array.isArray(data?.bank?.questions) ? data.bank.questions : [],
          ppct: data?.bank?.ppct && Array.isArray(data.bank.ppct.lessons)
            ? data.bank.ppct
            : { lessons: [], cleared_grades: [] },
          competency_catalogs: Array.isArray(data?.bank?.competency_catalogs) ? data.bank.competency_catalogs : []
        },
        exams: Array.isArray(data?.exams) ? data.exams : [],
        revisions: Array.isArray(data?.revisions) ? data.revisions : [],
        matrices: Array.isArray(data?.matrices) ? data.matrices : [],
        assessment_plans: Array.isArray(data?.assessment_plans) ? data.assessment_plans : [],
        kttx: Array.isArray(data?.kttx) ? data.kttx : [],
        profile: v2.normalizeProfile(data?.profile || {}),
        _sync: { pending: false, provider: 'firebase-cloud-v2', synced_at: new Date().toISOString() }
      }));
      currentWorkspaceData = clean;
      window.FirebaseState.currentData = currentWorkspaceData;
      lastSyncedSlicesV2 = slices || v2.splitWorkspaceIntoSlices(currentWorkspaceData);
      applyWorkspaceToStore();
    };

    setCloudSyncPill('syncing', '⏳ Đang tải dữ liệu…');
    try {
      const fsV2 = await v2.firestoreReadWorkspaceV2(user.uid, db, helpers);
      if (window.FirebaseState.user?.uid !== user.uid) return null;

      if (fsV2.exists && fsV2.hasContent) {
        installV2(fsV2.data, fsV2.slices);
        const driveTok = opts.driveAccessToken || loadRuntimeDriveToken(user.uid)?.accessToken || '';
        if (driveTok && window.GoogleDriveStorage) {
          setCloudSyncPill('synced', '☁ Đã lưu · Drive ✓');
          // Đảm bảo thư mục v2 trên Drive đã có manifest (tự bù nếu lần đầu dùng máy mới)
          v2.driveReadWorkspaceV2(driveTok, window.GoogleDriveStorage, { folderName: driveCfg.folderName }).then(res => {
            if (!res.exists) {
              return v2.driveWriteFullV2(driveTok, window.GoogleDriveStorage, fsV2.data, {
                folderName: driveCfg.folderName,
                ownerEmail: user.email || '',
                folderCache: cloudFolderCacheV2
              });
            }
          }).catch(() => {});
        } else {
          setCloudSyncPill('synced', '☁ Đã lưu trực tuyến');
        }
        if (status) { status.hidden = true; status.textContent = ''; }
        updateDriveSyncButton();
        return { source: 'firestore-v2', data: fsV2.data };
      }

      // Firestore v2 chưa có dữ liệu -> tự động kiểm tra nâng cấp từ Firestore v1 hoặc Google Drive v2/v1
      let legacySource = null;
      let legacyData = null;

      // 1) Legacy Firestore /workspaces/{uid}
      try {
        const legacyRef = helpers.doc(db, 'workspaces', user.uid);
        const legacySnap = await helpers.getDoc(legacyRef);
        const legacyExists = Boolean(legacySnap && (typeof legacySnap.exists === 'function' ? legacySnap.exists() : legacySnap.exists));
        if (legacyExists) {
          const ld = typeof legacySnap.data === 'function' ? legacySnap.data() : legacySnap.data;
          if (calculateDataScore(ld) > 0) {
            legacySource = 'firestore-v1';
            legacyData = ld;
          }
        }
      } catch (e) {}

      // 2) Google Drive v2 hoặc Google Drive v1 (tệp exammatrix-workspace.json cũ)
      const driveTok = opts.driveAccessToken || loadRuntimeDriveToken(user.uid)?.accessToken || '';
      if (!legacyData && driveTok && window.GoogleDriveStorage) {
        try {
          const dv2 = await v2.driveReadWorkspaceV2(driveTok, window.GoogleDriveStorage, { folderName: driveCfg.folderName });
          if (dv2.exists && calculateDataScore(dv2.data) > 0) {
            legacySource = 'drive-v2';
            legacyData = dv2.data;
          }
        } catch (e) {}
        if (!legacyData) {
          try {
            const dv1 = await window.GoogleDriveStorage.readWorkspace(driveTok, {
              folderName: driveCfg.folderName,
              fileName: driveCfg.fileName
            });
            if (dv1.exists && calculateDataScore(dv1.data) > 0) {
              legacySource = 'drive-v1';
              legacyData = dv1.data;
            }
          } catch (e) {}
        }
      }

      if (window.FirebaseState.user?.uid !== user.uid) return null;

      if (legacyData) {
        const migrated = await v2.migrateV1ToV2({
          uid: user.uid,
          legacyData,
          db,
          firestoreHelpers: helpers,
          driveAccessToken: driveTok,
          driveStorage: window.GoogleDriveStorage,
          folderName: driveCfg.folderName,
          ownerEmail: user.email || ''
        });
        installV2(migrated.data, migrated.slices);
        setCloudSyncPill('synced', driveTok ? '☁ Đã lưu · Drive ✓' : '☁ Đã lưu trực tuyến');
        if (status) { status.hidden = true; status.textContent = ''; }
        showToast('Đã tự động sắp xếp dữ liệu theo từng Khối trên hệ thống trực tuyến!');
        updateDriveSyncButton();
        return { source: legacySource, data: migrated.data };
      }

      // Tài khoản mới hoàn toàn (hoặc đã có profile rỗng)
      const initialData = fsV2.exists && fsV2.data ? fsV2.data : {
        bank: { questions: [], ppct: { lessons: [], cleared_grades: [] }, competency_catalogs: [] },
        exams: [],
        revisions: [],
        matrices: [],
        assessment_plans: [],
        kttx: [],
        profile: v2.normalizeProfile({ active_grades: [8, 9, 10], active_grade: 8, active_subject: 'Tin học' })
      };
      if (!fsV2.exists) {
        await v2.firestoreWriteFullV2(user.uid, db, helpers, initialData, { ownerEmail: user.email || '' });
      }
      installV2(initialData, v2.splitWorkspaceIntoSlices(initialData));
      setCloudSyncPill('synced', driveTok ? '☁ Đã lưu · Drive ✓' : '☁ Đã lưu trực tuyến');
      if (status) {
        status.hidden = false;
        status.textContent = `Đã kết nối tài khoản ${user.email || ''} (lưu trữ trực tuyến theo từng Khối). Bấm "☁ Đồng bộ Drive" nếu cần nhập dữ liệu từ tệp Google Drive cũ.`;
      }
      updateDriveSyncButton();
      return { source: 'empty-v2', data: initialData };
    } catch (err) {
      setCloudSyncPill('error', '⚠️ Lỗi tải dữ liệu');
      if (status) {
        status.hidden = false;
        status.textContent = 'Chưa tải được dữ liệu trực tuyến: ' + (err?.message || 'lỗi kết nối');
      }
      return null;
    }
  }

  window.FirebaseClient.loadFromCloudV2 = loadFromCloudV2;
  window.FirebaseClient.syncToCloudV2 = syncToCloudV2;

  // Đồng bộ lên Google Drive riêng (hoặc Cloud Firestore nếu dùng Firebase)
  async function syncToFirestore(uid, data, mutationMeta) {
    if (window.FirebaseState.provider === 'firebase-cloud-v2' || useUnifiedCloudV2()) {
      return await syncToCloudV2(
        uid,
        currentMutationSnapshot || currentWorkspaceData,
        data,
        mutationMeta || activeMutationMeta || {}
      );
    }
    const driveSession = window.FirebaseState.driveSession;
    const isDriveMode = window.FirebaseState.provider === 'google-drive' || Boolean(driveSession?.accessToken);
    if (isDriveMode) {
      data._sync = { pending: true, provider: 'google-drive', saved_at: new Date().toISOString() };
      const localBefore = await trySaveLocalCache(uid, data);
      const hint = document.getElementById('static-sync-status');
      const driveCfg = getGoogleDriveSettings();

      const attemptWrite = async () => {
        const writing = window.GoogleDriveStorage.writeWorkspace(driveSession.accessToken, data, {
          folderId: driveSession.folderId,
          fileId: driveSession.fileId,
          folderName: driveCfg.folderName,
          fileName: driveCfg.fileName,
          ownerEmail: window.FirebaseState.user?.email || '',
          fetchImpl: driveSession.fetchImpl
        });
        let timer;
        let result;
        try {
          result = await Promise.race([
            writing,
            new Promise((resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Chưa kết nối được Google Drive.')), 15000);
            })
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        driveSession.folderId = result.folderId;
        driveSession.fileId = result.fileId;
        driveSession.modifiedTime = result.modifiedTime || driveSession.modifiedTime || null;
        saveDriveSession(driveSession);
        syncToFirestoreParallel(uid, data);
        data._sync = {
          pending: false,
          provider: 'google-drive',
          saved_at: data._sync.saved_at,
          synced_at: result.updatedAt
        };
        const localAfter = await trySaveLocalCache(uid, data);
        if (hint) {
          hint.hidden = false;
          hint.textContent = localAfter.saved
            ? `Đã lưu trên trình duyệt và đồng bộ vào Google Drive riêng của bạn (${driveCfg.folderName}/${driveCfg.fileName}).`
            : `Đã đồng bộ thành công vào Google Drive riêng của bạn (${driveCfg.folderName}/${driveCfg.fileName}). Bộ nhớ đệm localStorage đang đầy nhưng dữ liệu chính đã được lưu an toàn trên Drive.`;
        }
      };

      let tokenExpired = !driveSession?.accessToken || (driveSession.expiresAt && driveSession.expiresAt <= Date.now());
      if (tokenExpired && window.GoogleDriveStorage) {
        const refreshed = await tryAutoRefreshDriveToken(driveSession, driveCfg);
        if (refreshed) tokenExpired = false;
      }

      if (!window.GoogleDriveStorage || tokenExpired) {
        if (driveSession) {
          driveSession.accessToken = '';
          driveSession.expiresAt = 0;
          saveDriveSession(driveSession);
        }
        if (!localBefore.saved) {
          updateDriveSyncButton();
          throw new Error('Phiên Google Drive đã hết hạn và bộ nhớ trình duyệt đang đầy. Hãy đăng nhập Google lại hoặc tải bản sao lưu trước khi thao tác tiếp.');
        }
        if (hint) {
          hint.hidden = false;
          hint.textContent = 'Phiên Google Drive đã hết hạn. Dữ liệu đã lưu trên trình duyệt nhưng chưa đồng bộ — hãy bấm "Đồng bộ Drive" để đăng nhập lại trước khi đổi máy.';
        }
        updateDriveSyncButton();
        return;
      }

      try {
        await attemptWrite();
      } catch (e) {
        let isAuthExpired = Boolean(e && (e.code === 'DRIVE_AUTH_EXPIRED' || e.status === 401));
        if (isAuthExpired) {
          driveSession.accessToken = '';
          driveSession.expiresAt = 0;
          saveDriveSession(driveSession);
          const refreshed = await tryAutoRefreshDriveToken(driveSession, driveCfg);
          if (refreshed) {
            try {
              await attemptWrite();
              updateDriveSyncButton();
              return;
            } catch (retryErr) {
              e = retryErr;
              isAuthExpired = Boolean(e && (e.code === 'DRIVE_AUTH_EXPIRED' || e.status === 401));
              if (isAuthExpired) {
                driveSession.accessToken = '';
                driveSession.expiresAt = 0;
                saveDriveSession(driveSession);
              }
            }
          }
        }
        if (!localBefore.saved) {
          if (hint) {
            hint.hidden = false;
            hint.textContent = isAuthExpired
              ? 'Phiên Google Drive đã hết hạn và bộ nhớ trình duyệt đang đầy. Hãy đăng nhập lại trước khi thao tác tiếp.'
              : `Chưa đồng bộ được lên Google Drive (${e?.message || 'lỗi kết nối'}) và bộ nhớ trình duyệt cũng đầy.`;
          }
          updateDriveSyncButton();
          throw new Error(`Chưa đồng bộ được lên Google Drive (${e?.message || 'lỗi kết nối'}) và bộ nhớ trình duyệt cũng đầy. Không có dữ liệu nào bị ghi đè; hãy kiểm tra mạng và tải bản sao lưu.`);
        }
        if (hint) {
          hint.hidden = false;
          hint.textContent = isAuthExpired
            ? 'Phiên Google Drive đã hết hạn. Dữ liệu đã lưu trên trình duyệt nhưng chưa đồng bộ — hãy bấm "Đồng bộ Drive" để đăng nhập lại trước khi đổi máy.'
            : `Đã lưu trên trình duyệt nhưng chưa đồng bộ lên Google Drive (${e?.message || 'lỗi kết nối'}). Hãy tải bản sao lưu và kiểm tra kết nối trước khi đổi máy.`;
        }
      }
      updateDriveSyncButton();
      return;
    }

    data._sync = { pending: uid !== 'offline', saved_at: new Date().toISOString() };
    saveStorageData(uid, data);

    if (!window.FirebaseState.user || !window.FirebaseState.db || !window.FirebaseState._firestoreHelpers) return;
    try {
      const { doc, setDoc } = window.FirebaseState._firestoreHelpers;
      const ref = doc(window.FirebaseState.db, 'workspaces', uid);
      const writing = setDoc(ref, {
        owner_email: window.FirebaseState.user.email,
        updated_at: new Date().toISOString(),
        bank: {
          questions: data.bank.questions || [],
          ppct: data.bank.ppct || { lessons: [] },
          competency_catalogs: data.bank.competency_catalogs || []
        },
        exams: data.exams || [],
        revisions: data.revisions || [],
        matrices: data.matrices || [],
        assessment_plans: Array.isArray(data.assessment_plans) ? data.assessment_plans : []
      }, { merge: true });
      let timer;
      try {
        await Promise.race([writing,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Chưa kết nối được đám mây.')),5000);})]);
      } finally { if(timer)clearTimeout(timer); }
      data._sync.pending = false;
      saveStorageData(uid, data);
      const hint = document.getElementById('static-sync-status');
      if (hint) { hint.hidden = false; hint.textContent = 'Đã lưu trên trình duyệt và đồng bộ lên đám mây.'; }
    } catch(e) {
      const hint = document.getElementById('static-sync-status');
      if (hint) { hint.hidden = false; hint.textContent = 'Đã lưu trên trình duyệt nhưng chưa đồng bộ lên đám mây. Hãy tải bản sao lưu và kiểm tra kết nối trước khi đổi máy.'; }
    }
  }

  // Nạp dữ liệu từ Google Drive riêng của giáo viên khi đăng nhập
  async function loadFromGoogleDrive(session, opts = {}) {
    const user = session && session.user;
    if (!user || !user.uid) return;
    const status = document.getElementById('static-sync-status');
    const valid = data => data && data.bank && Array.isArray(data.bank.questions) && Array.isArray(data.bank.ppct?.lessons) && ['exams', 'revisions', 'matrices'].every(k => Array.isArray(data[k]));
    const empty = () => ({ bank: { questions: [], ppct: { lessons: [], cleared_grades: [] }, competency_catalogs: [] }, exams: [], revisions: [], matrices: [], assessment_plans: [], kttx: [] });
    const install = data => { currentWorkspaceData = JSON.parse(JSON.stringify({ ...data, assessment_plans: Array.isArray(data?.assessment_plans) ? data.assessment_plans : [], kttx: Array.isArray(data?.kttx) ? data.kttx : [] })); window.FirebaseState.currentData = currentWorkspaceData; applyWorkspaceToStore(); };

    const syncCached = getStorageData(user.uid);
    install(valid(syncCached) ? syncCached : empty());
    const cached = await getBestCachedData(user.uid);
    const cacheAtStart = JSON.stringify(cached);
    if (valid(cached) && JSON.stringify(cached) !== JSON.stringify(syncCached)) {
      install(cached);
    }

    if (cached?._sync?.pending && valid(cached)) {
      if (status) {
        status.hidden = false;
        status.textContent = 'Máy này có bản chưa đồng bộ lên Google Drive. Đang giữ dữ liệu cục bộ; hãy bấm "Đồng bộ Drive" để đẩy lên hoặc tải bản sao lưu.';
      }
      updateDriveSyncButton();
      return;
    }

    const isTokenExpired = !session.accessToken || Number(session.expiresAt || 0) <= Date.now() + 5000;
    if (isTokenExpired) {
      session.accessToken = '';
      session.expiresAt = 0;
      saveDriveSession(session);
      if (status) {
        status.hidden = false;
        status.textContent = `Đang giữ đăng nhập tài khoản ${user.email || ''} với dữ liệu đã lưu trên máy. Phiên Google Drive 60 phút đã hết hạn — hệ thống sẽ tự gia hạn và đồng bộ khi thầy/cô Lưu/Nhập dữ liệu, hoặc bấm "⚠ Đồng bộ Drive".`;
      }
      updateDriveSyncButton();
      return;
    }

    if (!window.GoogleDriveStorage) {
      if (status) {
        status.hidden = false;
        status.textContent = 'Chưa nạp được mô-đun Google Drive. Đang giữ bản trên máy của tài khoản hiện tại.';
      }
      updateDriveSyncButton();
      return;
    }

    const driveCfg = getGoogleDriveSettings();
    let result;
    try {
      result = await window.GoogleDriveStorage.readWorkspace(session.accessToken, {
        folderName: driveCfg.folderName,
        fileName: driveCfg.fileName,
        fetchImpl: opts.fetchImpl || session.fetchImpl
      });
    } catch (error) {
      if (window.FirebaseState.user?.uid === user.uid) {
        if (error && (error.code === 'DRIVE_AUTH_EXPIRED' || error.status === 401)) {
          session.accessToken = '';
          session.expiresAt = 0;
          saveDriveSession(session);
          if (status) {
            status.hidden = false;
            status.textContent = 'Phiên Google Drive đã hết hạn. Đang giữ bản trên máy của tài khoản hiện tại; hãy bấm "Đồng bộ Drive" để đăng nhập lại.';
          }
        } else if (status) {
          status.hidden = false;
          status.textContent = `Chưa tải được dữ liệu từ Google Drive (${error?.message || 'lỗi kết nối'}). Đang giữ bản trên máy của tài khoản hiện tại; hãy kiểm tra kết nối và tải bản sao lưu.`;
        }
      }
      updateDriveSyncButton();
      return;
    }

    if (window.FirebaseState.user?.uid !== user.uid) return;
    const latest = await getBestCachedData(user.uid);
    if (JSON.stringify(latest) !== cacheAtStart && valid(latest)) {
      install(latest);
      updateDriveSyncButton();
      return;
    }

    session.folderId = result.folderId;
    session.fileId = result.fileId;
    session.modifiedTime = result.modifiedTime || null;
    saveDriveSession(session);

    if (result.exists && valid(result.data)) {
      const remoteQuestions = result.data.bank?.questions || [];
      const localQuestions = currentWorkspaceData.bank?.questions || [];
      const remoteScore = calculateDataScore(result.data);
      let localScore = calculateDataScore(currentWorkspaceData);

      if (remoteScore === 0 && localScore === 0) {
        // Tệp Drive rỗng và RAM rỗng -> Tự động kiểm tra bản cache tốt nhất trong máy để nạp và đẩy lên Drive
        const rescued = findBestAvailableCache();
        if (rescued && calculateDataScore(rescued) > 0) {
          console.info('[Firebase Bridge] Tự động lấy bản dữ liệu lưu trữ trên máy để khôi phục và đẩy lên Google Drive.');
          install(rescued);
          currentWorkspaceData._sync = { pending: true, provider: 'google-drive' };
          await trySaveLocalCache(user.uid, currentWorkspaceData);
          syncToFirestore(user.uid, currentWorkspaceData).catch(() => {});
        } else {
          install(result.data);
        }
      } else if (remoteQuestions.length === 0 && localQuestions.length > 0) {
        console.info('[Firebase Bridge] Giữ lại các câu hỏi trên máy vì tệp Drive từ xa đang trống.');
        currentWorkspaceData._sync = { pending: true, provider: 'google-drive' };
        await trySaveLocalCache(user.uid, currentWorkspaceData);
        syncToFirestore(user.uid, currentWorkspaceData).catch(() => {});
      } else {
        install({
          bank: result.data.bank,
          exams: result.data.exams,
          revisions: result.data.revisions,
          matrices: result.data.matrices,
          assessment_plans: Array.isArray(result.data.assessment_plans) ? result.data.assessment_plans : [],
          kttx: Array.isArray(result.data.kttx) ? result.data.kttx : [],
          _sync: { pending: false, provider: 'google-drive', synced_at: result.updatedAt || new Date().toISOString() }
        });
        await trySaveLocalCache(user.uid, currentWorkspaceData);
      }
      if (status) {
        status.hidden = false;
        status.textContent = `Đã tải dữ liệu từ Google Drive riêng của bạn (${driveCfg.folderName}/${driveCfg.fileName}).`;
      }
    } else {
      // Tệp chưa có trên Drive: nếu trong máy có dữ liệu lưu trữ, tự động nạp và tạo tệp trên Drive
      if (calculateDataScore(currentWorkspaceData) === 0) {
        const rescued = findBestAvailableCache();
        if (rescued && calculateDataScore(rescued) > 0) {
          install(rescued);
        }
      }
      currentWorkspaceData._sync = {
        pending: Boolean(currentWorkspaceData.bank?.questions?.length > 0),
        provider: 'google-drive'
      };
      await trySaveLocalCache(user.uid, currentWorkspaceData);
      if (currentWorkspaceData.bank?.questions?.length > 0) {
        syncToFirestore(user.uid, currentWorkspaceData).catch(() => {});
      }
      if (status) {
        status.hidden = false;
        status.textContent = currentWorkspaceData.bank?.questions?.length > 0
          ? `Đã kết nối Google Drive riêng (${driveCfg.folderName}) và đang đồng bộ ${currentWorkspaceData.bank.questions.length} câu hỏi lên Drive.`
          : `Đã kết nối Google Drive riêng (${driveCfg.folderName}). Tài khoản mới chưa có tệp dữ liệu; hãy bấm "Đồng bộ Drive" hoặc lưu câu hỏi đầu tiên để tạo ${driveCfg.fileName}.`;
      }
    }
    updateDriveSyncButton();
  }

  // Nạp dữ liệu từ Firestore khi đăng nhập
  async function loadFromFirestore(user, db, helpers) {
    const cached=getStorageData(user.uid),cacheAtStart=JSON.stringify(cached);
    const valid=data=>data&&data.bank&&Array.isArray(data.bank.questions)&&Array.isArray(data.bank.ppct?.lessons)&&['exams','revisions','matrices'].every(k=>Array.isArray(data[k]));
    const empty=()=>({bank:{questions:[],ppct:{lessons:[],cleared_grades:[]}},exams:[],revisions:[],matrices:[],assessment_plans:[],kttx:[]});
    const install=data=>{currentWorkspaceData=JSON.parse(JSON.stringify({...data,assessment_plans:Array.isArray(data?.assessment_plans)?data.assessment_plans:[],kttx:Array.isArray(data?.kttx)?data.kttx:[]}));window.FirebaseState.currentData=currentWorkspaceData;applyWorkspaceToStore();};
    install(valid(cached)?cached:empty());
    const status=document.getElementById('static-sync-status');
    if(cached?._sync?.pending&&valid(cached)){
      if(status){status.hidden=false;status.textContent='Máy này có bản chưa đồng bộ. Đang giữ dữ liệu cục bộ; hãy tải bản sao lưu và kiểm tra kết nối trước khi đổi máy.';}
      return;
    }
    try{
      const ref=helpers.doc(db,'workspaces',user.uid),snap=await helpers.getDoc(ref);
      if(window.FirebaseState.user?.uid!==user.uid)return;
      const latest=getStorageData(user.uid);
      if(JSON.stringify(latest)!==cacheAtStart&&valid(latest)){install(latest);return;}
      if(snap.exists()){
        const remote=snap.data();
        if(!valid(remote))throw new Error('Dữ liệu đám mây chưa đúng định dạng.');
        install({bank:remote.bank,exams:remote.exams,revisions:remote.revisions,matrices:remote.matrices,assessment_plans:Array.isArray(remote.assessment_plans)?remote.assessment_plans:[],kttx:Array.isArray(remote.kttx)?remote.kttx:[],_sync:{pending:false}});
      }
      // Tài khoản mới chỉ nhận cache của chính UID đó hoặc dữ liệu rỗng; không lấy ngân hàng ngoại tuyến.
      // Không ghi hoặc dọn dữ liệu đám mây trong một thao tác đọc; lần lưu đầu sẽ tạo workspace.
      saveStorageData(user.uid,currentWorkspaceData);
    }catch(error){
      if(window.FirebaseState.user?.uid===user.uid&&status){status.hidden=false;status.textContent='Chưa tải được dữ liệu đám mây. Đang giữ bản trên máy của tài khoản hiện tại; hãy kiểm tra kết nối và tải bản sao lưu.';}
    }
  }

  // ===========================================================================
  // CHẾ ĐỘ NGOẠI TUYẾN: dữ liệu lưu trong localStorage của trình duyệt này
  // ===========================================================================
  const OFFLINE_BACKUP_FORMAT = 'exammatrix-offline-backup';

  function applyWorkspaceToStore() {
    if(isStaticHost&&window.BankCore?.DocFormatter)window.BankCore.DocFormatter.storagePrefix=window.BankCore.formatStoragePrefix('pages:'+(window.FirebaseState.user?.uid||'offline'));
    if (!window.store) return;
    const snapshot=JSON.parse(JSON.stringify(currentWorkspaceData));
    window.store.bank = {
      ...window.store.bank,
      questions: snapshot.bank.questions,
      ppct: snapshot.bank.ppct,
      ...(Array.isArray(snapshot.bank.competency_catalogs) ? { competency_catalogs: snapshot.bank.competency_catalogs } : {})
    };
    window.store.exams = snapshot.exams;
    window.store.revisions = snapshot.revisions;
    window.store.matrixRecords = snapshot.matrices;
    window.store.assessmentPlans = Array.isArray(snapshot.assessment_plans) ? snapshot.assessment_plans : [];
    window.store.kttxActivities = Array.isArray(snapshot.kttx) ? snapshot.kttx : [];
    if (snapshot.profile && typeof snapshot.profile === 'object') {
      window.store.profile = snapshot.profile;
      if (typeof window.syncProfileFromWorkspace === 'function') {
        window.syncProfileFromWorkspace(snapshot.profile);
      }
    }
    window.store.plans={};window.store.selected=new Set();
    window.store.activeExamViewId=null;window.store.activeRevisionViewId=null;
    if(typeof window.restoreExamDraft==='function')window.restoreExamDraft();
    if (typeof window.render === 'function') window.render();
  }

  // Đưa không gian làm việc trong bộ nhớ về dữ liệu ngoại tuyến (khi đăng xuất hoặc khôi phục tệp).
  // Sửa tại chỗ để window.FirebaseState.currentData vẫn trỏ đúng đối tượng.
  function resetToOfflineWorkspace() {
    delete currentWorkspaceData._sync;
    // Tuyệt đối không xóa dữ liệu nếu trong bộ nhớ RAM hiện tại đang có câu hỏi / PPCT / ma trận
    const currentScore = calculateDataScore(currentWorkspaceData);
    if (currentScore > 0) {
      try { saveStorageData('offline', currentWorkspaceData); } catch (e) {}
      idbSet('offline', currentWorkspaceData).catch(() => {});
      applyWorkspaceToStore();
      return;
    }
    currentWorkspaceData.bank = { questions: [], ppct: { lessons: [] } };
    currentWorkspaceData.exams = [];
    currentWorkspaceData.revisions = [];
    currentWorkspaceData.matrices = [];
    currentWorkspaceData.assessment_plans = [];
    currentWorkspaceData.kttx = [];
    initLocalWorkspace();
    applyWorkspaceToStore();
  }

  function showOfflineBanner(show) {
    if (!isStaticHost) return;
    const banner = document.getElementById('offline-banner');
    if (banner) banner.hidden = !show;
  }

  function isValidOfflineBackup(payload) {
    const d = payload && payload.data;
    return Boolean(payload && payload.format === OFFLINE_BACKUP_FORMAT && d &&
      d.bank && Array.isArray(d.bank.questions) &&
      Array.isArray(d.exams) && Array.isArray(d.revisions) && Array.isArray(d.matrices));
  }

  function setupOfflineBanner() {
    const loginBtn = document.getElementById('btn-offline-login');
    const backupBtn = document.getElementById('btn-offline-backup');
    const restoreBtn = document.getElementById('btn-offline-restore');
    const fileInput = document.getElementById('offline-restore-file');
    if (loginBtn) {
      loginBtn.onclick = () => {
        if (document.getElementById('firebase-login-modal')) showLoginModal(true);
        else showToast('Cần kết nối mạng để đăng nhập. Hiện vẫn dùng được chế độ ngoại tuyến.', 'error');
      };
    }
    if (backupBtn) {
      backupBtn.onclick = () => {
        const payload = {
          format: OFFLINE_BACKUP_FORMAT,
          version: 1,
          saved_at: new Date().toISOString(),
          data: currentWorkspaceData
        };
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'exammatrix_ngoai_tuyen_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Đã tải bản sao lưu dữ liệu ngoại tuyến.');
      };
    }
    if (restoreBtn && fileInput) {
      restoreBtn.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
          showToast('Tệp sao lưu quá lớn (tối đa 20 MB).', 'error');
          return;
        }
        let payload = null;
        try { payload = JSON.parse(await file.text()); } catch (e) { payload = null; }
        if (!isValidOfflineBackup(payload)) {
          showToast('Tệp không phải bản sao lưu ngoại tuyến hợp lệ của ExamMatrix Studio.', 'error');
          return;
        }
        if (!confirm('Khôi phục sẽ THAY THẾ toàn bộ dữ liệu ngoại tuyến hiện có trên trình duyệt này bằng nội dung trong tệp. Tiếp tục?')) return;
        const d = payload.data;
        saveStorageData('offline', {
          bank: { questions: d.bank.questions, ppct: d.bank.ppct || { lessons: [] } },
          exams: d.exams,
          revisions: d.revisions,
          matrices: d.matrices
        });
        resetToOfflineWorkspace();
        showToast('Đã khôi phục dữ liệu ngoại tuyến từ tệp sao lưu.');
      };
    }
  }

  setupOfflineBanner();

  // Chỉ chạy đăng nhập đám mây trên trang tĩnh (GitHub Pages, localhost, file:); máy chủ Django có tài khoản riêng.
  if (!isStaticHost) {
    showOfflineBanner(true);
    return;
  }

  async function syncDriveV2Now() {
    const v2 = window.CloudStorageV2;
    const user = window.FirebaseState?.user;
    const db = window.FirebaseState?.db;
    const helpers = window.FirebaseState?._firestoreHelpers;
    if (!v2 || !user || user.isAnonymous) {
      showLoginModal(true);
      return { ok: false };
    }
    if (!window.GoogleDriveStorage) {
      throw new Error('Chưa nạp mô-đun Google Drive.');
    }
    const driveCfg = getGoogleDriveSettings();
    let tokRec = loadRuntimeDriveToken(user.uid);
    if (!tokRec || !tokRec.accessToken) {
      if (!driveCfg.clientId) {
        throw new Error('Chưa cấu hình Google OAuth Client ID cho Google Drive.');
      }
      const tokenInfo = await requestTokenWithConsentFallback(driveCfg, {
        prompt: '',
        loginHint: user.email || ''
      });
      saveRuntimeDriveToken(user.uid, tokenInfo.accessToken, tokenInfo.expiresAt);
      tokRec = loadRuntimeDriveToken(user.uid);
    }
    if (!tokRec || !tokRec.accessToken) {
      throw new Error('Chưa lấy được quyền truy cập Google Drive.');
    }

    const accessToken = tokRec.accessToken;
    setCloudSyncPill('syncing', '⏳ Đang đồng bộ Drive…');
    try {
      let dv2 = null;
      try {
        dv2 = await v2.driveReadWorkspaceV2(accessToken, window.GoogleDriveStorage, { folderName: driveCfg.folderName });
      } catch (e) {
        if (e && (e.code === 'DRIVE_AUTH_EXPIRED' || e.status === 401)) {
          saveRuntimeDriveToken(user.uid, '', 0);
          const refreshedInfo = await requestTokenWithConsentFallback(driveCfg, { prompt: 'consent', loginHint: user.email || '' });
          saveRuntimeDriveToken(user.uid, refreshedInfo.accessToken, refreshedInfo.expiresAt);
          dv2 = await v2.driveReadWorkspaceV2(refreshedInfo.accessToken, window.GoogleDriveStorage, { folderName: driveCfg.folderName });
        }
      }
      const activeTok = loadRuntimeDriveToken(user.uid)?.accessToken || accessToken;
      let dv1 = null;
      if (!dv2?.exists || calculateDataScore(dv2.data) === 0) {
        try {
          dv1 = await window.GoogleDriveStorage.readWorkspace(activeTok, {
            folderName: driveCfg.folderName,
            fileName: driveCfg.fileName
          });
        } catch (e) {}
      }

      const currentScore = calculateDataScore(currentWorkspaceData);
      const driveV2Score = dv2?.exists ? calculateDataScore(dv2.data) : 0;
      const driveV1Score = dv1?.exists ? calculateDataScore(dv1.data) : 0;

      if (currentScore === 0 && (driveV2Score > 0 || driveV1Score > 0)) {
        const sourceData = driveV2Score >= driveV1Score ? dv2.data : dv1.data;
        const migrated = await v2.migrateV1ToV2({
          uid: user.uid,
          legacyData: sourceData,
          db,
          firestoreHelpers: helpers,
          driveAccessToken: activeTok,
          driveStorage: window.GoogleDriveStorage,
          folderName: driveCfg.folderName,
          ownerEmail: user.email || ''
        });
        currentWorkspaceData = JSON.parse(JSON.stringify(migrated.data));
        window.FirebaseState.currentData = currentWorkspaceData;
        lastSyncedSlicesV2 = migrated.slices;
        applyWorkspaceToStore();
        setCloudSyncPill('synced', '☁ Đã lưu · Drive ✓');
        showToast(`Đã tải & đồng bộ ${currentWorkspaceData.bank?.questions?.length || 0} câu hỏi từ Google Drive!`);
      } else {
        // Đẩy toàn bộ cấu trúc phân tách theo từng Khối lên Google Drive
        if (dv1?.exists && calculateDataScore(dv1.data) > 0 && !dv2?.exists) {
          const rootId = await window.GoogleDriveStorage.findOrCreateFolder(activeTok, driveCfg.folderName);
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          await window.GoogleDriveStorage.backupJsonToBackupsFolder(activeTok, rootId, `legacy_v1_${ts}.json`, {
            migrated_at: new Date().toISOString(),
            owner_email: user.email || '',
            legacy_data: dv1.data
          }).catch(() => {});
        }
        await v2.driveWriteFullV2(activeTok, window.GoogleDriveStorage, currentWorkspaceData, {
          folderName: driveCfg.folderName,
          ownerEmail: user.email || '',
          folderCache: cloudFolderCacheV2
        });
        setCloudSyncPill('synced', '☁ Đã lưu · Drive ✓');
        showToast(`Đã đồng bộ cấu trúc thư mục theo từng Khối (${currentWorkspaceData.bank?.questions?.length || 0} câu hỏi) lên Google Drive!`);
      }
      updateDriveSyncButton();
      return { ok: true };
    } catch (err) {
      if (err && (err.code === 'DRIVE_AUTH_EXPIRED' || err.status === 401)) {
        saveRuntimeDriveToken(user.uid, '', 0);
        setCloudSyncPill('partial', '☁ Đã lưu · Cần kết nối lại Drive');
      } else {
        setCloudSyncPill('partial', '☁ Đã lưu · Lỗi đồng bộ Drive');
      }
      updateDriveSyncButton();
      throw err;
    }
  }
  window.FirebaseClient.syncDriveV2Now = syncDriveV2Now;

  function createUnifiedCloudLoginModal(auth, helpers) {
    if (typeof document === 'undefined' || !document.body) return;
    const existing = document.getElementById('firebase-login-modal');
    if (existing && existing.dataset.mode === 'cloud-v2') return;
    if (existing) existing.remove();

    const modal = document.createElement('dialog');
    modal.id = 'firebase-login-modal';
    modal.dataset.mode = 'cloud-v2';
    modal.style.cssText = 'border:1px solid #c5d8ea;border-radius:12px;padding:24px;max-width:450px;width:92%;box-shadow:0 12px 32px rgba(0,0,0,0.18);z-index:9999;';
    modal.innerHTML = `
      <form id="fb-login-form" method="dialog" style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:42px;height:42px;border-radius:10px;background:#e7f5ff;display:flex;align-items:center;justify-content:center;font-size:22px;">
            ☁️
          </div>
          <div>
            <h3 style="margin:0;font-size:16px;font-weight:700;color:#102d4a;">ĐĂNG NHẬP TÀI KHOẢN GIÁO VIÊN</h3>
            <p style="margin:2px 0 0;font-size:12px;color:#4a5568;">Giữ đăng nhập ổn định &amp; tự động lưu độc lập từng Khối lớp.</p>
          </div>
        </div>

        <div style="background:#f8fafc;border:1px solid #dce5ee;border-radius:8px;padding:10px 12px;font-size:12px;color:#334155;line-height:1.5;">
          Dữ liệu được lưu an toàn theo cây thư mục <strong>Năm học → Môn → Khối</strong> trên hệ thống trực tuyến và Google Drive (<code>ExamMatrix Studio/</code>) của riêng Thầy/Cô.
        </div>

        <div id="fb-auth-error" style="color:#c92a2a;background:#fff5f5;padding:10px 14px;border-radius:8px;font-size:12px;display:none;line-height:1.45;border:1px solid #ffc9c9;"></div>

        <button type="button" id="fb-btn-google" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:11px 16px;background:#ffffff;border:1px solid #0267b1;border-radius:8px;font-size:13.5px;font-weight:600;color:#0f172a;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.347 2.825.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg>
          <span>Đăng nhập bằng tài khoản Google</span>
        </button>

        <details style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:12px;color:#475569;">
          <summary style="cursor:pointer;font-weight:600;color:#1e293b;">Hoặc đăng nhập bằng Email &amp; Mật khẩu giáo viên</summary>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
            <input type="email" id="fb-email" placeholder="thayco@truong.edu.vn" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #c5d8ea;border-radius:6px;font-size:12.5px;">
            <input type="password" id="fb-password" placeholder="Mật khẩu (tối thiểu 6 ký tự)" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #c5d8ea;border-radius:6px;font-size:12.5px;">
            <div style="display:flex;gap:8px;">
              <button type="submit" id="fb-btn-login-submit" class="button primary" style="flex:1;padding:7px;font-weight:600;font-size:12.5px;">Đăng nhập Email</button>
              <button type="button" id="fb-btn-register-submit" class="button" style="flex:1;padding:7px;font-weight:600;font-size:12.5px;">Tạo tài khoản</button>
            </div>
          </div>
        </details>

        <div style="text-align:center;margin-top:2px;">
          <button type="button" id="fb-btn-close-modal" class="button quiet" style="font-size:12px;color:#64748b;text-decoration:underline;cursor:pointer;">Đóng</button>
        </div>
      </form>
    `;
    document.body.appendChild(modal);

    const errBox = modal.querySelector('#fb-auth-error');
    const googleBtn = modal.querySelector('#fb-btn-google');
    const form = modal.querySelector('#fb-login-form');
    const emailInput = modal.querySelector('#fb-email');
    const passInput = modal.querySelector('#fb-password');

    const mapAuthErr = (err) => {
      const code = err?.code || '';
      if (code.includes('unauthorized-domain')) {
        return `Tên miền "${window.location.hostname}" chưa được cấp quyền đăng nhập trong cấu hình hệ thống.`;
      }
      if (code.includes('popup-blocked')) {
        return 'Trình duyệt đang chặn cửa sổ bật lên. Hãy cho phép cửa sổ bật lên rồi thử lại.';
      }
      if (code.includes('operation-not-allowed')) {
        return 'Phương thức đăng nhập này chưa được kích hoạt trong cấu hình hệ thống.';
      }
      return err?.message || 'Không đăng nhập được.';
    };

    if (googleBtn) {
      googleBtn.onclick = async () => {
        errBox.style.display = 'none';
        googleBtn.disabled = true;
        try {
          const provider = new helpers.GoogleAuthProvider();
          provider.addScope('https://www.googleapis.com/auth/drive.file');
          provider.setCustomParameters({ prompt: 'select_account' });
          const result = await helpers.signInWithPopup(auth, provider);
          const cred = helpers.GoogleAuthProvider.credentialFromResult
            ? helpers.GoogleAuthProvider.credentialFromResult(result)
            : null;
          if (cred?.accessToken && result?.user?.uid) {
            saveRuntimeDriveToken(result.user.uid, cred.accessToken, Date.now() + 55 * 60 * 1000);
          }
          modal.close();
          showToast(`Đăng nhập thành công (${result.user?.email || 'Google'})!`);
        } catch (err) {
          if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
          errBox.textContent = mapAuthErr(err);
          errBox.style.display = 'block';
        } finally {
          googleBtn.disabled = false;
        }
      };
    }

    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        if (!emailInput?.value || !passInput?.value) {
          errBox.textContent = 'Nhập đầy đủ email và mật khẩu.';
          errBox.style.display = 'block';
          return;
        }
        try {
          await helpers.signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
          modal.close();
          showToast('Đăng nhập Email thành công!');
        } catch (err) {
          errBox.textContent = mapAuthErr(err);
          errBox.style.display = 'block';
        }
      };
    }

    const regBtn = modal.querySelector('#fb-btn-register-submit');
    if (regBtn) {
      regBtn.onclick = async () => {
        errBox.style.display = 'none';
        if (!emailInput?.value || !passInput?.value) {
          errBox.textContent = 'Nhập đủ email và mật khẩu (tối thiểu 6 ký tự).';
          errBox.style.display = 'block';
          return;
        }
        try {
          await helpers.createUserWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
          modal.close();
          showToast('Tạo tài khoản giáo viên thành công!');
        } catch (err) {
          errBox.textContent = mapAuthErr(err);
          errBox.style.display = 'block';
        }
      };
    }

    const closeBtn = modal.querySelector('#fb-btn-close-modal');
    if (closeBtn) closeBtn.onclick = () => modal.close();
  }

  function setupUnifiedCloudAuthUI(auth, db, helpers) {
    const authBox = ensureAuthBox();
    if (authBox) {
      authBox.className = 'auth-pill-container';
      authBox.innerHTML = `
        <span id="cloud-sync-pill" class="cloud-sync-pill cloud-pill-offline" hidden>Chưa kết nối</span>
        <span id="fb-user-badge" class="auth-pill-badge"><span class="auth-offline-dot"></span><span class="auth-status-text">Chưa đăng nhập</span></span>
        <button id="gdrive-sync-btn" class="topbar-btn auth-login-btn" type="button" hidden title="Đồng bộ cây thư mục theo từng Khối lên Google Drive riêng">☁ Đồng bộ Drive</button>
        <button id="fb-auth-btn" class="topbar-btn topbar-btn-primary auth-login-btn" type="button">Đăng nhập Google</button>
      `;

      const syncBtn = authBox.querySelector('#gdrive-sync-btn');
      if (syncBtn) {
        syncBtn.onclick = async () => {
          syncBtn.disabled = true;
          try {
            await syncDriveV2Now();
          } catch (err) {
            if (err && err.code === 'POPUP_CLOSED') return;
            showToast(err?.message || 'Chưa đồng bộ được với Google Drive.', 'error');
          } finally {
            syncBtn.disabled = false;
            updateDriveSyncButton();
          }
        };
      }

      const authBtn = authBox.querySelector('#fb-auth-btn');
      if (authBtn) {
        authBtn.onclick = async () => {
          const curUser = window.FirebaseState.user;
          if (curUser && !curUser.isAnonymous) {
            if (confirm('Thầy/Cô có muốn đăng xuất khỏi tài khoản Google hiện tại? Dữ liệu đã được lưu an toàn trên Đám mây.')) {
              await helpers.signOut(auth);
              saveRuntimeDriveToken(null, '', 0);
              lastSyncedSlicesV2 = null;
              cloudFolderCacheV2.clear();
              showToast('Đã đăng xuất.');
            }
          } else {
            showLoginModal(true);
          }
        };
      }
    }
    createUnifiedCloudLoginModal(auth, helpers);
  }

  const unifiedModeEnabled = useUnifiedCloudV2();

  // 1. Chỉ dùng Google Drive Token v1 cũ khi CHƯA bật Firebase Cloud v2 (vd. test harness hoặc chưa cấu hình Firebase)
  if (!unifiedModeEnabled && window.GoogleDriveStorage) {
    initGoogleDriveMode();
  }

  // 2. Khởi tạo Firebase SDK (App, Analytics & Firestore)
  if (isConfigured) {
    const firebaseVersion = '10.13.0';
    import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app.js`).then(async ({ initializeApp }) => {
      const { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } =
        await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-auth.js`);
      const { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch } =
        await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-firestore.js`);

      const app = initializeApp(config);
      let analytics = null;
      try {
        const { getAnalytics } = await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-analytics.js`);
        analytics = getAnalytics(app);
      } catch (analyticsErr) {
        // Analytics có thể không hỗ trợ trong môi trường kiểm thử / offline, không ảnh hưởng
      }

      const auth = getAuth(app);
      const db = getFirestore(app);

      window.FirebaseState.app = app;
      window.FirebaseState.analytics = analytics;
      window.FirebaseState.auth = auth;
      window.FirebaseState.db = db;
      window.FirebaseState._firestoreHelpers = { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch };

      if (unifiedModeEnabled) {
        const v2AuthHelpers = {
          signInWithEmailAndPassword,
          createUserWithEmailAndPassword,
          signInWithPopup,
          GoogleAuthProvider,
          signOut,
          doc,
          getDoc,
          setDoc,
          collection,
          getDocs,
          deleteDoc,
          writeBatch
        };
        setupUnifiedCloudAuthUI(auth, db, v2AuthHelpers);
        console.info('[Cloud v2] Đã kích hoạt chế độ lưu trữ Đám mây (Firebase Auth + Firestore v2 + Google Drive phân khối).');

        let hadCloudUser = false;
        onAuthStateChanged(auth, async (user) => {
          if (user && user.isAnonymous) {
            // Bỏ qua phiên ẩn danh cũ nếu còn sót lại để yêu cầu đăng nhập Google chính thức
            await signOut(auth).catch(() => {});
            user = null;
          }
          if (user) {
            hadCloudUser = true;
            window.FirebaseState.provider = 'firebase-cloud-v2';
            window.FirebaseState.user = user;
            updateUserUI(user);
            showOfflineBanner(false);
            const driveTok = loadRuntimeDriveToken(user.uid)?.accessToken || '';
            await loadFromCloudV2(user, { db, helpers: v2AuthHelpers, driveAccessToken: driveTok });
          } else {
            window.FirebaseState.provider = 'firebase-cloud-v2';
            window.FirebaseState.user = null;
            saveRuntimeDriveToken(null, '', 0);
            lastSyncedSlicesV2 = null;
            if (hadCloudUser || calculateDataScore(currentWorkspaceData) > 0) {
              hadCloudUser = false;
              currentWorkspaceData = {
                bank: { questions: [], ppct: { lessons: [], cleared_grades: [] }, competency_catalogs: [] },
                exams: [],
                revisions: [],
                matrices: [],
                assessment_plans: [],
                kttx: [],
                profile: currentWorkspaceData.profile || window.CloudStorageV2.normalizeProfile({})
              };
              window.FirebaseState.currentData = currentWorkspaceData;
              applyWorkspaceToStore();
            }
            const status = document.getElementById('static-sync-status');
            if (status) { status.hidden = true; status.textContent = ''; }
            setCloudSyncPill('offline', 'Chưa đăng nhập');
            updateUserUI(null);
            showOfflineBanner(true);
          }
        });
        return;
      }

      // Chế độ legacy nếu thiếu CloudStorageV2 hoặc GoogleDriveStorage
      if (!auth.currentUser) {
        signInAnonymously(auth).catch(() => {});
      }

      if (!window.GoogleDriveStorage) {
        setupAuthUI(auth, db, {
          signInWithEmailAndPassword,
          createUserWithEmailAndPassword,
          signInWithPopup,
          GoogleAuthProvider,
          signOut,
          doc,
          getDoc,
          setDoc
        });

        let hadUser = false;
        onAuthStateChanged(auth, async (user) => {
          window.FirebaseState.user = user;
          updateUserUI(user);
          if (user) {
            hadUser = true;
            showOfflineBanner(false);
            console.info('[Firebase] Đã đăng nhập tài khoản giáo viên.');
            await loadFromFirestore(user, db, { doc, getDoc, setDoc });
          } else {
            if (hadUser) { hadUser = false; resetToOfflineWorkspace(); }
            showOfflineBanner(true);
          }
        });
      }
    }).catch(err => {
      console.warn('[Firebase Bridge] Lỗi tải SDK:', err);
      if (unifiedModeEnabled || !window.GoogleDriveStorage) showOfflineBanner(true);
    });
  } else if (!window.GoogleDriveStorage) {
    showOfflineBanner(true);
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setupGoogleDriveAutoSyncListeners() {
    if (window._gdriveAutoSyncBound) return;
    window._gdriveAutoSyncBound = true;
    const flushPendingIfReady = () => {
      if (window.FirebaseState.provider !== 'google-drive' || !window.FirebaseState.user) return;
      const session = window.FirebaseState.driveSession;
      const hasValidToken = Boolean(session?.accessToken && Number(session.expiresAt || 0) > Date.now() + 5000);
      if (hasValidToken && currentWorkspaceData?._sync?.pending) {
        window.FirebaseClient.syncCurrentData().catch(() => {});
      }
    };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('online', flushPendingIfReady);
      window.addEventListener('beforeunload', (e) => {
        if (window.FirebaseState.provider === 'google-drive' && currentWorkspaceData?._sync?.pending) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') flushPendingIfReady();
      });
    }
  }

  function initGoogleDriveMode() {
    setupGoogleDriveAuthUI();
    setupGoogleDriveAutoSyncListeners();
    const savedSession = loadDriveSession();
    if (savedSession && savedSession.user && savedSession.user.uid) {
      window.FirebaseState.provider = 'google-drive';
      window.FirebaseState.user = savedSession.user;
      window.FirebaseState.driveSession = savedSession;
      updateUserUI(savedSession.user);
      showOfflineBanner(false);
      loadFromGoogleDrive(savedSession).then(() => {
        if (
          window.FirebaseState.provider === 'google-drive' &&
          window.FirebaseState.user?.uid === savedSession.user.uid &&
          currentWorkspaceData?._sync?.pending &&
          savedSession.accessToken &&
          Number(savedSession.expiresAt || 0) > Date.now() + 5000
        ) {
          window.FirebaseClient.syncCurrentData().catch(() => {});
        }
      }).catch(() => {});
    } else {
      updateUserUI(null);
      showOfflineBanner(true);
    }
  }

  function ensureAuthBox() {
    let authBox = document.getElementById('firebase-auth-box');
    if (!authBox && typeof document.querySelector === 'function' && typeof document.createElement === 'function') {
      const topbarRight = document.querySelector('.topbar-right') || document.querySelector('.topbar > div:last-child');
      if (topbarRight) {
        authBox = document.createElement('div');
        authBox.id = 'firebase-auth-box';
        authBox.className = 'auth-pill-container';
        topbarRight.appendChild(authBox);
      }
    }
    return authBox;
  }

  function setupGoogleDriveAuthUI() {
    const authBox = ensureAuthBox();
    if (authBox) {
      authBox.className = 'auth-pill-container';
      authBox.innerHTML = `
        <span id="fb-user-badge" class="auth-pill-badge"><span class="auth-offline-dot"></span><span class="auth-status-text">Ngoại tuyến</span></span>
        <button id="gdrive-sync-btn" class="topbar-btn auth-login-btn" type="button" hidden title="Đồng bộ ngay lên Google Drive riêng của bạn">☁ Đồng bộ Drive</button>
        <button id="fb-auth-btn" class="topbar-btn topbar-btn-primary auth-login-btn" type="button">Đăng nhập Google</button>
      `;

      const syncBtn = authBox.querySelector('#gdrive-sync-btn');
      if (syncBtn) {
        syncBtn.onclick = async () => {
          const user = window.FirebaseState.user;
          let session = window.FirebaseState.driveSession;
          if (!user || !session) {
            showLoginModal(true);
            return;
          }
          syncBtn.disabled = true;
          try {
            const needRefresh = !session.accessToken || (session.expiresAt && session.expiresAt <= Date.now() + 5000);
            if (needRefresh) {
              const driveCfg = getGoogleDriveSettings();
              if (!driveCfg.clientId) {
                showLoginModal(true);
                return;
              }
              const tokenInfo = await requestTokenWithConsentFallback(driveCfg, {
                prompt: '',
                loginHint: user.email || ''
              });
              const profile = await window.GoogleDriveStorage.getUserProfile(tokenInfo.accessToken);
              if (profile.uid !== user.uid) {
                const switchedSession = {
                  user: profile,
                  accessToken: tokenInfo.accessToken,
                  expiresAt: tokenInfo.expiresAt,
                  folderId: null,
                  fileId: null,
                  modifiedTime: null,
                  remember: session.remember !== false
                };
                window.FirebaseState.provider = 'google-drive';
                window.FirebaseState.user = profile;
                window.FirebaseState.driveSession = switchedSession;
                saveDriveSession(switchedSession);
                updateUserUI(profile);
                showOfflineBanner(false);
                await loadFromGoogleDrive(switchedSession);
                showToast(`Đã chuyển sang tài khoản ${profile.email} và tải dữ liệu từ Google Drive.`);
                return;
              }
              session.accessToken = tokenInfo.accessToken;
              session.expiresAt = tokenInfo.expiresAt;
              saveDriveSession(session);
            }

            // Đồng bộ thông minh 2 chiều: Đọc từ Drive và so sánh với máy
            const driveCfg = getGoogleDriveSettings();
            let driveResult = null;
            try {
              driveResult = await window.GoogleDriveStorage.readWorkspace(session.accessToken, {
                folderName: driveCfg.folderName,
                fileName: driveCfg.fileName,
                fetchImpl: session.fetchImpl
              });
            } catch (readErr) {
              console.warn('[Sync] Không đọc được tệp Drive:', readErr);
            }

            const driveScore = (driveResult?.exists && driveResult.data) ? calculateDataScore(driveResult.data) : 0;
            let currentScore = calculateDataScore(currentWorkspaceData);

            // Nếu trên màn hình đang trống (score = 0) nhưng trong bộ nhớ đệm máy có dữ liệu
            if (currentScore === 0) {
              const rescued = findBestAvailableCache();
              if (rescued && calculateDataScore(rescued) > 0) {
                currentWorkspaceData = JSON.parse(JSON.stringify(rescued));
                delete currentWorkspaceData._sync;
                window.FirebaseState.currentData = currentWorkspaceData;
                applyWorkspaceToStore();
                currentScore = calculateDataScore(currentWorkspaceData);
              }
            }

            if (driveScore > currentScore && driveResult?.data) {
              // Trên Google Drive có dữ liệu phong phú hơn -> Kéo từ Google Drive về máy
              currentWorkspaceData = JSON.parse(JSON.stringify({
                ...driveResult.data,
                assessment_plans: Array.isArray(driveResult.data?.assessment_plans) ? driveResult.data.assessment_plans : [],
                kttx: Array.isArray(driveResult.data?.kttx) ? driveResult.data.kttx : [],
                _sync: { pending: false, provider: 'google-drive', synced_at: driveResult.updatedAt || new Date().toISOString() }
              }));
              window.FirebaseState.currentData = currentWorkspaceData;
              await trySaveLocalCache(user.uid, currentWorkspaceData);
              applyWorkspaceToStore();
              showToast(`Đã tải về thành công ${currentWorkspaceData.bank?.questions?.length || 0} câu hỏi từ Google Drive của bạn!`);
            } else if (currentScore > 0) {
              // Trên máy có dữ liệu -> Đẩy lên Google Drive
              const res = await window.FirebaseClient.syncCurrentData();
              if (res.ok) {
                showToast(`Đã đồng bộ thành công ${currentWorkspaceData.bank?.questions?.length || 0} câu hỏi lên Google Drive của bạn!`);
              } else {
                showToast('Chưa đồng bộ được lên Google Drive — dữ liệu vẫn được giữ trên máy.', 'error');
              }
            } else if (driveResult?.exists && driveResult.data) {
              currentWorkspaceData = JSON.parse(JSON.stringify(driveResult.data));
              window.FirebaseState.currentData = currentWorkspaceData;
              applyWorkspaceToStore();
              showToast('Đã đồng bộ dữ liệu với Google Drive.');
            } else {
              showToast('Tài khoản Google Drive hiện chưa có dữ liệu câu hỏi để đồng bộ.', 'error');
            }
          } catch (err) {
            if (err && err.code === 'POPUP_CLOSED') return;
            showToast(err?.message || 'Chưa đồng bộ được với Google Drive.', 'error');
          } finally {
            syncBtn.disabled = false;
            updateDriveSyncButton();
          }
        };
      }

      const authBtn = authBox.querySelector('#fb-auth-btn');
      if (authBtn) {
        authBtn.onclick = async () => {
          if (window.FirebaseState.user) {
            const hasPending = Boolean(currentWorkspaceData?._sync?.pending);
            const promptMsg = hasPending
              ? 'Máy này vẫn còn thay đổi chưa đồng bộ lên Google Drive. Đăng xuất sẽ chuyển về dữ liệu ngoại tuyến (dữ liệu của tài khoản vẫn giữ trong bộ nhớ đệm trình duyệt). Tiếp tục đăng xuất?'
              : 'Thầy/Cô có muốn đăng xuất khỏi Google Drive?';
            if (confirm(promptMsg)) {
              const token = window.FirebaseState.driveSession?.accessToken;
              await window.GoogleDriveStorage.revokeAccessToken(token);
              clearDriveSession();
              window.FirebaseState.user = null;
              window.FirebaseState.driveSession = null;
              window.FirebaseState.provider = null;
              const hint = document.getElementById('static-sync-status');
              if (hint) {
                hint.hidden = true;
                hint.textContent = '';
              }
              resetToOfflineWorkspace();
              updateUserUI(null);
              showOfflineBanner(true);
              showToast('Đã đăng xuất khỏi Google Drive.');
            }
          } else {
            showLoginModal(true);
          }
        };
      }
    }
    createGoogleDriveLoginModal();
  }

  function createGoogleDriveLoginModal() {
    if (document.getElementById('firebase-login-modal')) return;
    if (typeof document.createElement !== 'function' || !document.body) return;
    const modal = document.createElement('dialog');
    modal.id = 'firebase-login-modal';
    modal.style.cssText = 'border:1px solid #c5d8ea;border-radius:12px;padding:24px;max-width:450px;width:92%;box-shadow:0 12px 32px rgba(0,0,0,0.18);z-index:9999;';
    modal.innerHTML = `
      <form id="fb-login-form" method="dialog" style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:42px;height:42px;border-radius:10px;background:#e7f5ff;display:flex;align-items:center;justify-content:center;font-size:22px;">
            ☁️
          </div>
          <div>
            <h3 style="margin:0;font-size:16px;font-weight:700;color:#102d4a;">LƯU TRỮ GOOGLE DRIVE RIÊNG</h3>
            <p style="margin:2px 0 0;font-size:12px;color:#4a5568;">Dữ liệu của thầy/cô nào được lưu trực tiếp trong Google Drive của thầy/cô đó.</p>
          </div>
        </div>

        <div style="background:#f8fafc;border:1px solid #dce5ee;border-radius:8px;padding:10px 12px;font-size:12px;color:#334155;line-height:1.5;">
          <strong>Bảo mật quyền tối giản:</strong> Ứng dụng chỉ xin quyền <code>drive.file</code> để tạo và đọc duy nhất tệp <code>ExamMatrix Studio/exammatrix-workspace.json</code> của riêng bạn, không truy cập các tệp khác trên Drive.
        </div>

        <div id="fb-auth-error" style="color:#c92a2a;background:#fff5f5;padding:10px 14px;border-radius:8px;font-size:12px;display:none;line-height:1.45;border:1px solid #ffc9c9;"></div>

        <div id="gdrive-client-warning" style="color:#854d0e;background:#fefce8;padding:10px 12px;border-radius:8px;font-size:12px;display:none;line-height:1.45;border:1px solid #fde047;"></div>

        <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#334155;cursor:pointer;">
          <input type="checkbox" id="gdrive-remember-me" checked style="width:16px;height:16px;margin:0;accent-color:#0267b1;">
          <span>Ghi nhớ đăng nhập trên máy này (bỏ chọn nếu dùng máy tính chung ở trường)</span>
        </label>

        <button type="button" id="fb-btn-google" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:11px 16px;background:#ffffff;border:1px solid #0267b1;border-radius:8px;font-size:13.5px;font-weight:600;color:#0f172a;cursor:pointer;transition:all 0.2s ease;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.347 2.825.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg>
          <span>Đăng nhập bằng Google (lưu vào Drive riêng)</span>
        </button>

        <details id="gdrive-config-details" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:12px;color:#475569;">
          <summary style="cursor:pointer;font-weight:600;color:#1e293b;">Cấu hình Google OAuth Client ID (dành cho quản trị / thử nhanh)</summary>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
            <label for="gdrive-client-id-input" style="font-size:11.5px;color:#334155;">Dán Web Client ID (<code>...apps.googleusercontent.com</code>) để dùng ngay trên trình duyệt này hoặc ghi vào <code>public/google-drive-config.js</code>:</label>
            <input type="text" id="gdrive-client-id-input" placeholder="1234567890-xxxx.apps.googleusercontent.com" style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;">
            <div style="display:flex;gap:8px;">
              <button type="button" id="gdrive-client-id-save" class="button" style="padding:5px 10px;font-size:12px;">Lưu Client ID trên máy này</button>
              <button type="button" id="gdrive-client-id-clear" class="button quiet" style="padding:5px 10px;font-size:12px;">Xóa ghi đè</button>
            </div>
          </div>
        </details>

        <div style="text-align:center;margin-top:2px;">
          <button type="button" id="fb-btn-close-modal" class="button quiet" style="font-size:12px;color:#64748b;text-decoration:underline;cursor:pointer;">Đóng và dùng ngoại tuyến</button>
        </div>
      </form>
    `;
    document.body.appendChild(modal);

    const errBox = modal.querySelector('#fb-auth-error');
    const warnBox = modal.querySelector('#gdrive-client-warning');
    const rememberBox = modal.querySelector('#gdrive-remember-me');
    const googleBtn = modal.querySelector('#fb-btn-google');
    const detailsEl = modal.querySelector('#gdrive-config-details');
    const clientIdInput = modal.querySelector('#gdrive-client-id-input');
    const saveClientIdBtn = modal.querySelector('#gdrive-client-id-save');
    const clearClientIdBtn = modal.querySelector('#gdrive-client-id-clear');

    function refreshClientIdNotice() {
      const cfg = getGoogleDriveSettings();
      if (clientIdInput) {
        clientIdInput.value = cfg.overrideClientId || cfg.configuredClientId || '';
      }
      if (!cfg.clientId) {
        warnBox.textContent = 'Chưa cấu hình Google OAuth Client ID trong google-drive-config.js. Hãy dán Client ID ở mục bên dưới để kích hoạt đăng nhập Google.';
        warnBox.style.display = 'block';
        if (detailsEl) detailsEl.open = true;
      } else {
        warnBox.style.display = 'none';
      }
    }
    refreshClientIdNotice();
    modal._refreshDriveConfigUI = refreshClientIdNotice;

    if (saveClientIdBtn && clientIdInput) {
      saveClientIdBtn.onclick = () => {
        errBox.style.display = 'none';
        const val = clientIdInput.value.trim();
        if (!/^[^\s]+\.apps\.googleusercontent\.com$/i.test(val)) {
          errBox.textContent = 'Client ID chưa đúng định dạng (phải kết thúc bằng .apps.googleusercontent.com).';
          errBox.style.display = 'block';
          return;
        }
        try {
          localStorage.setItem(GDRIVE_CLIENT_ID_KEY, val);
        } catch (e) {}
        refreshClientIdNotice();
        showToast('Đã lưu Google Client ID cho trình duyệt này.');
      };
    }

    if (clearClientIdBtn) {
      clearClientIdBtn.onclick = () => {
        errBox.style.display = 'none';
        try {
          localStorage.removeItem(GDRIVE_CLIENT_ID_KEY);
        } catch (e) {}
        refreshClientIdNotice();
        showToast('Đã xóa Client ID ghi đè trên trình duyệt.');
      };
    }

    if (googleBtn) {
      googleBtn.onclick = async () => {
        errBox.style.display = 'none';
        const driveCfg = getGoogleDriveSettings();
        if (!driveCfg.clientId) {
          refreshClientIdNotice();
          errBox.textContent = 'Chưa có Google OAuth Client ID. Vui lòng dán Client ID vào ô cấu hình bên dưới hoặc tệp google-drive-config.js.';
          errBox.style.display = 'block';
          return;
        }
        googleBtn.disabled = true;
        try {
          const tokenInfo = await window.GoogleDriveStorage.requestAccessToken({
            clientId: driveCfg.clientId,
            scope: driveCfg.scope,
            prompt: 'consent'
          });
          const profile = await window.GoogleDriveStorage.getUserProfile(tokenInfo.accessToken);
          const session = {
            user: profile,
            accessToken: tokenInfo.accessToken,
            expiresAt: tokenInfo.expiresAt,
            folderId: null,
            fileId: null,
            modifiedTime: null,
            remember: Boolean(rememberBox ? rememberBox.checked : true)
          };
          window.FirebaseState.provider = 'google-drive';
          window.FirebaseState.user = profile;
          window.FirebaseState.driveSession = session;
          saveDriveSession(session);
          updateUserUI(profile);
          showOfflineBanner(false);
          modal.close();
          showToast(`Đã kết nối Google Drive của ${profile.email}!`);
          await loadFromGoogleDrive(session);
        } catch (err) {
          if (err && err.code === 'POPUP_CLOSED') return;
          errBox.textContent = err?.message || 'Không đăng nhập được bằng Google.';
          errBox.style.display = 'block';
        } finally {
          googleBtn.disabled = false;
          updateDriveSyncButton();
        }
      };
    }

    modal.querySelector('#fb-btn-close-modal').onclick = () => modal.close();
  }

  // Thông báo Toast trang nhã (thay thế popup alert)
  function showToast(message, type = 'success') {
    if (typeof document.createElement !== 'function' || !document.body) return;
    let toast = document.getElementById('fb-toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'fb-toast-notification';
      toast.style.cssText = [
        'position: fixed',
        'top: 24px',
        'right: 24px',
        'z-index: 10000',
        'padding: 12px 20px',
        'border-radius: 8px',
        'font-size: 14px',
        'font-weight: 600',
        'box-shadow: 0 8px 24px rgba(0,0,0,0.14)',
        'transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'opacity: 0',
        'transform: translateY(-12px)',
        'pointer-events: none',
        'display: flex',
        'align-items: center',
        'gap: 10px',
        'font-family: inherit'
      ].join(';');
      document.body.appendChild(toast);
    }
    const isOk = type === 'success';
    toast.style.background = isOk ? '#e6fcf5' : '#fff5f5';
    toast.style.color = isOk ? '#0ca678' : '#e03131';
    toast.style.border = isOk ? '1px solid #63e6be' : '1px solid #ffa8a8';
    toast.innerHTML = `<span>${isOk ? '✅' : '⚠️'}</span> <span>${escapeHtml(message)}</span>`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-12px)';
    }, 3500);
  }

  // UI Setup (Firebase fallback)
  function setupAuthUI(auth, db, helpers) {
    const authBox = ensureAuthBox();
    if (authBox) {
      authBox.className = 'auth-pill-container';
      authBox.innerHTML = `
        <span id="fb-user-badge" class="auth-pill-badge"><span class="auth-offline-dot"></span><span class="auth-status-text">Đang kết nối…</span></span>
        <button id="fb-auth-btn" class="topbar-btn auth-login-btn" type="button">Đăng nhập</button>
      `;

      authBox.querySelector('#fb-auth-btn').onclick = async () => {
        if (window.FirebaseState.user) {
          if (confirm('Thầy/Cô có muốn đăng xuất khỏi tài khoản này?')) {
            await helpers.signOut(auth);
            showToast('Đã đăng xuất tài khoản.');
          }
        } else {
          showLoginModal(true);
        }
      };
    }
    createLoginModal(auth, helpers);
  }

  function updateUserUI(user) {
    const badge = document.getElementById('fb-user-badge');
    const btn = document.getElementById('fb-auth-btn');
    if (!badge || !btn) {
      updateDriveSyncButton();
      return;
    }
    if (user && !user.isAnonymous) {
      const name = user.displayName || (user.email ? user.email.split('@')[0] : 'Giáo viên');
      const initial = name.charAt(0).toUpperCase();
      badge.innerHTML = `<span class="auth-avatar">${escapeHtml(initial)}</span><strong class="auth-name" title="${escapeHtml(user.email || '')}">${escapeHtml(name)}</strong>`;
      btn.textContent = 'Đăng xuất';
      btn.className = 'topbar-btn auth-logout-btn';
      showLoginModal(false);
    } else {
      badge.innerHTML = `<span class="auth-offline-dot"></span><span class="auth-status-text">${useUnifiedCloudV2() ? 'Chưa đăng nhập' : 'Ngoại tuyến'}</span>`;
      btn.textContent = (window.FirebaseState.provider === 'google-drive' || window.GoogleDriveStorage || useUnifiedCloudV2()) ? 'Đăng nhập Google' : 'Đăng nhập';
      btn.className = 'topbar-btn topbar-btn-primary auth-login-btn';
    }
    updateDriveSyncButton();
  }

  function createLoginModal(auth, helpers) {
    if (document.getElementById('firebase-login-modal')) return;
    const modal = document.createElement('dialog');
    modal.id = 'firebase-login-modal';
    modal.style.cssText = 'border:1px solid #c5d8ea;border-radius:12px;padding:24px;max-width:420px;width:92%;box-shadow:0 12px 32px rgba(0,0,0,0.18);z-index:9999;';
    modal.innerHTML = `
      <form id="fb-login-form" method="dialog" style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:10px;background:#e7f5ff;display:flex;align-items:center;justify-content:center;font-size:20px;">
            👨‍🏫
          </div>
          <div>
            <h3 style="margin:0;font-size:16px;font-weight:700;color:#102d4a;">CỔNG ĐĂNG NHẬP GIÁO VIÊN</h3>
            <p style="margin:2px 0 0;font-size:12px;color:#666;">Hệ thống Khảo thí & Ngân hàng đề ExamMatrix Studio</p>
          </div>
        </div>

        <div id="fb-auth-error" style="color:#c92a2a;background:#fff5f5;padding:10px 14px;border-radius:8px;font-size:12px;display:none;line-height:1.45;border:1px solid #ffc9c9;"></div>

        <!-- Đăng nhập Google / Gmail -->
        <button type="button" id="fb-btn-google" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:10px 16px;background:#ffffff;border:1px solid #cfd8dc;border-radius:8px;font-size:13px;font-weight:600;color:#37474f;cursor:pointer;transition:all 0.2s ease;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.347 2.825.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg>
          <span>Đăng nhập bằng tài khoản Google (Gmail)</span>
        </button>

        <div style="display:flex;align-items:center;text-align:center;color:#8a99a8;font-size:11px;margin:2px 0;">
          <span style="flex:1;border-bottom:1px solid #e2e8f0;"></span>
          <span style="padding:0 10px;text-transform:uppercase;letter-spacing:0.5px;">Hoặc dùng Email giáo viên</span>
          <span style="flex:1;border-bottom:1px solid #e2e8f0;"></span>
        </div>

        <div>
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#2d3748;" for="fb-email">Email giáo viên:</label>
          <input type="email" id="fb-email" placeholder="thayco@truong.edu.vn" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #c5d8ea;border-radius:6px;font-size:13px;">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#2d3748;" for="fb-password">Mật khẩu:</label>
          <input type="password" id="fb-password" placeholder="••••••••" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #c5d8ea;border-radius:6px;font-size:13px;">
        </div>

        <div style="display:flex;gap:10px;margin-top:6px;">
          <button type="submit" id="fb-btn-login-submit" class="button primary" style="flex:1;padding:9px;font-weight:600;">Đăng nhập</button>
          <button type="button" id="fb-btn-register-submit" class="button" style="flex:1;padding:9px;font-weight:600;border:1px solid #c5d8ea;">Tạo tài khoản mới</button>
        </div>
        <div style="text-align:center;margin-top:2px;">
          <button type="button" id="fb-btn-close-modal" class="button quiet" style="font-size:11px;color:#718096;text-decoration:underline;cursor:pointer;">Đóng và dùng ngoại tuyến</button>
        </div>
      </form>
    `;
    document.body.appendChild(modal);

    const form = modal.querySelector('#fb-login-form');
    const errBox = modal.querySelector('#fb-auth-error');
    const emailInput = modal.querySelector('#fb-email');
    const passInput = modal.querySelector('#fb-password');
    const googleBtn = modal.querySelector('#fb-btn-google');

    function friendlyAuthError(err) {
      const code = err.code || '';
      if (code.includes('operation-not-allowed')) {
        return 'Phương thức đăng nhập này chưa được kích hoạt. Vui lòng liên hệ quản trị viên để bật đăng nhập bằng Google hoặc Email.';
      }
      if (code.includes('unauthorized-domain')) {
        return 'Tên miền "' + window.location.hostname + '" chưa được cấp quyền đăng nhập. Vui lòng liên hệ quản trị viên.';
      }
      if (code.includes('network-request-failed')) {
        return 'Không kết nối được mạng. Vui lòng kiểm tra đường truyền Internet rồi thử lại.';
      }
      if (code.includes('too-many-requests')) {
        return 'Thử đăng nhập quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.';
      }
      if (code.includes('invalid-api-key') || code.includes('api-key-not-valid')) {
        return 'Cấu hình kết nối hệ thống không hợp lệ. Vui lòng liên hệ quản trị viên.';
      }
      if (code.includes('popup-closed-by-user')) {
        return 'Cửa sổ đăng nhập Google đã đóng.';
      }
      if (code.includes('popup-blocked')) {
        return 'Trình duyệt chặn popup. Thầy vui lòng cho phép cửa sổ bật lên để đăng nhập Google.';
      }
      if (code.includes('user-not-found') || code.includes('invalid-credential') || code.includes('wrong-password')) {
        return 'Email hoặc mật khẩu không chính xác. Nếu chưa có tài khoản, vui lòng bấm nút "Tạo tài khoản mới".';
      }
      if (code.includes('email-already-in-use')) {
        return 'Email này đã được đăng ký. Thầy vui lòng bấm nút "Đăng nhập".';
      }
      if (code.includes('weak-password')) {
        return 'Mật khẩu quá ngắn. Vui lòng đặt mật khẩu từ 6 ký tự trở lên.';
      }
      return 'Lỗi: ' + (err.message || code);
    }

    if (googleBtn) {
      googleBtn.onclick = async () => {
        errBox.style.display = 'none';
        try {
          const provider = new helpers.GoogleAuthProvider();
          await helpers.signInWithPopup(auth, provider);
          showToast('Đăng nhập bằng tài khoản Google thành công!');
          modal.close();
        } catch (err) {
          if (err.code === 'auth/popup-closed-by-user') return;
          errBox.textContent = friendlyAuthError(err);
          errBox.style.display = 'block';
        }
      };
    }

    form.onsubmit = async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      if (!emailInput.value || !passInput.value) {
        errBox.textContent = 'Vui lòng nhập đầy đủ email và mật khẩu.';
        errBox.style.display = 'block';
        return;
      }
      try {
        await helpers.signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
        showToast('Đăng nhập thành công!');
        modal.close();
      } catch (err) {
        errBox.textContent = friendlyAuthError(err);
        errBox.style.display = 'block';
      }
    };

    modal.querySelector('#fb-btn-register-submit').onclick = async () => {
      errBox.style.display = 'none';
      if (!emailInput.value || !passInput.value) {
        errBox.textContent = 'Vui lòng điền đủ email và mật khẩu (tối thiểu 6 ký tự).';
        errBox.style.display = 'block';
        return;
      }
      try {
        await helpers.createUserWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
        showToast('Tạo tài khoản giáo viên thành công!');
        modal.close();
      } catch (err) {
        errBox.textContent = friendlyAuthError(err);
        errBox.style.display = 'block';
      }
    };

    modal.querySelector('#fb-btn-close-modal').onclick = () => modal.close();
  }

  function showLoginModal(show) {
    const modal = document.getElementById('firebase-login-modal');
    if (!modal) return;
    if (show) {
      if (typeof modal._refreshDriveConfigUI === 'function') modal._refreshDriveConfigUI();
      if (!modal.open) modal.showModal();
    } else {
      if (modal.open) modal.close();
    }
  }
})();
