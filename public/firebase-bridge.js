// public/firebase-bridge.js
// =============================================================================
// CẦU NỐI LƯU TRỮ CHO GITHUB PAGES / NGOẠI TUYẾN (GOOGLE DRIVE RIÊNG & FIREBASE)
// =============================================================================

(function() {
  // Host Python/Django đánh dấu rõ trong HTML; localhost cũng có thể là máy chủ thật.
  const isStaticHost = !document.querySelector?.('meta[name="workspace-scope"], meta[name="app-host"][content="python"]');

  const config = window.FIREBASE_CONFIG;
  const isConfigured = config && config.apiKey && !config.apiKey.includes('YOUR_API_KEY');
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

  // Trạng thái Cloud-First v2 (Firebase Auth + Firestore v2 + Google Drive v2)
  const RUNTIME_DRIVE_TOKEN_KEY = 'exammatrix_runtime_drive_token_v2';
  let lastSyncedSlicesV2 = null;
  // Dấu phiên bản `_rev` của từng tài liệu Firestore mà tab này đã tải/ghi (chặn ghi đè giữa hai máy/tab).
  let lastKnownRevsV2 = null;
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

  // Tiền tố khóa bộ nhớ đệm CŨ: không còn ghi; chỉ để công cụ cứu hộ (rescueBestCache) đọc bản lưu trước 24/11/2026
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

  function calculateDataScore(data) {
    if (!data || typeof data !== 'object') return 0;
    const qCount = Array.isArray(data.bank?.questions) ? data.bank.questions.length : 0;
    const ppctCount = Array.isArray(data.bank?.ppct?.lessons) ? data.bank.ppct.lessons.length : 0;
    const examCount = Array.isArray(data.exams) ? data.exams.length : 0;
    const revCount = Array.isArray(data.revisions) ? data.revisions.length : 0;
    const matCount = Array.isArray(data.matrices) ? data.matrices.length : 0;
    return (qCount * 10) + (ppctCount * 5) + (matCount * 5) + (examCount * 5) + (revCount * 2);
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

  // Khởi tạo không gian làm việc rỗng; dữ liệu thật chỉ nạp từ Cloud v2 sau khi đăng nhập.
  // Kiểm thử/phát triển (chưa cấu hình Firebase) có thể nạp dữ liệu mẫu qua window.EXAMMATRIX_TEST_SEED.
  function initLocalWorkspace() {
    currentWorkspaceData.bank = { questions: [], ppct: { lessons: [], cleared_grades: [] }, competency_catalogs: [] };
    currentWorkspaceData.exams = [];
    currentWorkspaceData.revisions = [];
    currentWorkspaceData.matrices = [];
    currentWorkspaceData.assessment_plans = [];
    currentWorkspaceData.kttx = [];
    lastSyncedSlicesV2 = null;
    lastKnownRevsV2 = null;
    const seed = !useUnifiedCloudV2() && typeof window !== 'undefined' ? window.EXAMMATRIX_TEST_SEED : null;
    if (seed && typeof seed === 'object') {
      const cached = JSON.parse(JSON.stringify(seed));
      if (cached.bank?.questions) currentWorkspaceData.bank.questions = cached.bank.questions;
      if (cached.bank?.ppct) currentWorkspaceData.bank.ppct = cached.bank.ppct;
      if (cached.bank?.competency_catalogs) currentWorkspaceData.bank.competency_catalogs = cached.bank.competency_catalogs;
      for (const k of ['exams', 'revisions', 'matrices', 'assessment_plans', 'kttx']) {
        if (Array.isArray(cached[k])) currentWorkspaceData[k] = cached[k];
      }
      const cleared = currentWorkspaceData.bank.ppct?.cleared_grades || [];
      currentWorkspaceData.bank.ppct = { ...currentWorkspaceData.bank.ppct, lessons: cleanPpctLessons(currentWorkspaceData.bank.ppct?.lessons || [], cleared), cleared_grades: cleared };
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
          await syncToFirestore(uid, op.data, { path, allowShrink: Boolean(window.CloudStorageV2?.isShrinkAllowedAction?.(path, body)) });
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
        if (!grade && fn) grade = Number(window.TableFileHelper?.detectGradeFromFilename?.(fn) || 0);
        if (!grade && body.extracted_text) {
          const m = body.extracted_text.match(/(?:KHỐI\s*LỚP|KHỐI|LỚP)\s*(\d+)/i);
          if (m && Number(m[1]) >= 6 && Number(m[1]) <= 12) grade = Number(m[1]);
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
        if (!grade && body.filename) grade = Number(window.TableFileHelper?.detectGradeFromFilename?.(body.filename) || 0);
        if (!grade) grade = (window.store && window.store.ppctGrade) || 9;
        if (!Number.isInteger(grade) || grade < 6 || grade > 12) {
          throw new Error(`Khối ${grade} không hợp lệ (chỉ nhận Khối 6–12). Chưa nhập PPCT; hãy chọn đúng khối rồi đọc lại tệp.`);
        }
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
        // Bài tiền đề (Bản đồ tri thức, Giai đoạn 3): giữ giá trị cũ nếu biểu mẫu không gửi trường này.
        const prevLesson = existing.find(x => ((x.subject_name || 'Tin học') === targetSubject) && Number(x.grade) === grade && x.lesson_code === l.lesson_code);
        const prereqSource = l.prerequisites !== undefined ? l.prerequisites : prevLesson?.prerequisites;
        const prereqs = (Array.isArray(prereqSource) ? prereqSource : String(prereqSource || '').split(/[,;\n]/))
          .map(x => String(x || '').trim()).filter(x => x && x.toLowerCase() !== String(l.lesson_code || '').toLowerCase());
        if (prereqs.length) lessonObj.prerequisites = [...new Set(prereqs)];
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
        // Không xóa bài đang được câu hỏi hoặc ma trận dùng: xóa sẽ làm câu và ma trận "mồ côi" (mô phỏng 9 môn, 24/11/2026).
        const sameSubject = x => (x.subject_name || 'Tin học') === targetSubject && Number(x.grade) === grade;
        const sameCode = c => String(c || '').trim().toLowerCase() === String(code || '').trim().toLowerCase();
        const usedQuestions = (currentWorkspaceData.bank.questions || []).filter(q => sameSubject(q) && q.review_status !== 'archived' && sameCode(q.lesson_code)).length;
        const usedMatrices = (currentWorkspaceData.matrices || []).filter(m => sameSubject(m) && m.status !== 'archived'
          && [...(m.lessons || []), ...(m.requirements || [])].some(x => sameCode(x.lesson_code))).length;
        if (usedQuestions || usedMatrices) {
          const parts = [usedQuestions ? `${usedQuestions} câu hỏi` : '', usedMatrices ? `${usedMatrices} ma trận` : ''].filter(Boolean).join(' và ');
          const err = new Error(`Không xóa được bài ${code}: bài đang được ${parts} sử dụng. Hãy lưu trữ hoặc chuyển các câu hỏi sang bài khác và bỏ bài này khỏi ma trận trước.`);
          err.status = 409;
          throw err;
        }
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
      // Chặn khôi phục tệp rỗng đè lên dữ liệu đang có: Firestore không có thùng rác, xóa là mất (mô phỏng 9 môn, 24/11/2026).
      if (calculateDataScore(normalized) === 0 && calculateDataScore(currentWorkspaceData) > 0) {
        throw new Error('Tệp sao lưu không có câu hỏi, PPCT, ma trận, đề cương hay đề nào. Để tránh mất dữ liệu, ứng dụng không khôi phục tệp rỗng đè lên dữ liệu đang có.');
      }
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
  // Áp dụng bản cứu hộ: thay dữ liệu hiện tại rồi lưu lên đám mây như một lần khôi phục (cần đăng nhập).
  window.FirebaseClient.applyRescuedCache = async function(data) {
    if (!data || typeof data !== 'object') return false;
    const clean = JSON.parse(JSON.stringify({ ...data, assessment_plans: Array.isArray(data.assessment_plans) ? data.assessment_plans : [], kttx: Array.isArray(data.kttx) ? data.kttx : [] }));
    delete clean._sync;
    await window.FirebaseClient.replaceWorkspaceData(clean);
    return true;
  };

  function updateDriveSyncButton() {
    const syncBtn = document.getElementById('gdrive-sync-btn');
    if (!syncBtn) return;
    const user = window.FirebaseState.user;
    const signedIn = window.FirebaseState.provider === 'firebase-cloud-v2' && Boolean(user) && !user.isAnonymous;
    syncBtn.hidden = !signedIn;
    if (!signedIn) return;
    const hasDriveTok = Boolean(loadRuntimeDriveToken(user.uid));
    syncBtn.textContent = hasDriveTok ? '☁ Đồng bộ Drive' : '🔗 Kết nối Drive';
    syncBtn.title = hasDriveTok
      ? 'Đồng bộ cây thư mục theo từng Khối lên Google Drive riêng'
      : 'Cấp hoặc gia hạn quyền Google Drive để đồng bộ thư mục phân khối';
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
    let writeResult;
    try {
      writeResult = await v2.firestoreWriteDiffV2(targetUid, db, helpers, beforeSlices, afterSlices, {
        ownerEmail: user.email || '',
        // Chỉ kiểm khi tab biết dấu phiên bản của bản đã tải (luôn có sau khi tải từ Cloud v2).
        knownRevs: lastSyncedSlicesV2 ? lastKnownRevsV2 : null
      });
    } catch (err) {
      if (v2.isConflictError && v2.isConflictError(err)) {
        setCloudSyncPill('error', '⛔ Dữ liệu đã đổi ở máy khác');
        showCloudConflictNotice(err);
        const conflictErr = new Error(err.message);
        conflictErr.code = err.code;
        conflictErr.conflicts = err.conflicts;
        throw conflictErr;
      }
      setCloudSyncPill('error', '⚠️ Chưa lưu được');
      throw new Error('Chưa lưu được dữ liệu trực tuyến (' + (err?.message || 'lỗi kết nối') + '). Vui lòng kiểm tra mạng và thử lại.');
    }

    lastSyncedSlicesV2 = afterSlices;
    lastKnownRevsV2 = writeResult && writeResult.knownRevs ? writeResult.knownRevs : lastKnownRevsV2;
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
    const installV2 = (data, slices, revs) => {
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
      lastKnownRevsV2 = revs || null;
      hideCloudConflictNotice();
      applyWorkspaceToStore();
    };

    setCloudSyncPill('syncing', '⏳ Đang tải dữ liệu…');
    try {
      const fsV2 = await v2.firestoreReadWorkspaceV2(user.uid, db, helpers);
      if (window.FirebaseState.user?.uid !== user.uid) return null;

      if (fsV2.exists && fsV2.hasContent) {
        installV2(fsV2.data, fsV2.slices, fsV2.revs);
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
        installV2(migrated.data, migrated.slices, migrated.knownRevs);
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
      let initialRevs = fsV2.exists ? (fsV2.revs || null) : null;
      if (!fsV2.exists) {
        const written = await v2.firestoreWriteFullV2(user.uid, db, helpers, initialData, { ownerEmail: user.email || '' });
        initialRevs = written && written.knownRevs ? written.knownRevs : null;
      }
      installV2(initialData, v2.splitWorkspaceIntoSlices(initialData), initialRevs);
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

  // Lưu thay đổi: chỉ còn Cloud-First v2 (Firestore + cây thư mục Drive). Ba cách lưu cũ (Drive v1,
  // Firestore v1, bộ nhớ trình duyệt) đã gỡ ngày 24/11/2026.
  // Chưa cấu hình Firebase (kiểm thử, phát triển trên máy): dữ liệu chỉ nằm trong bộ nhớ của trang.
  async function syncToFirestore(uid, data, mutationMeta) {
    if (window.FirebaseState.provider === 'firebase-cloud-v2' || useUnifiedCloudV2()) {
      return await syncToCloudV2(
        uid,
        currentMutationSnapshot || currentWorkspaceData,
        data,
        mutationMeta || activeMutationMeta || {}
      );
    }
    data._sync = { pending: false, provider: 'memory', saved_at: new Date().toISOString() };
  }

  // ===========================================================================
  // SAO LƯU / KHÔI PHỤC TỆP .json (tải về máy; khôi phục thì lưu lên Cloud v2)
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
    // Dữ liệu đã nạp xong; lỗi vẽ giao diện không được báo thành "chưa tải được dữ liệu".
    if (typeof window.render === 'function') {
      try { window.render(); }
      catch (renderErr) {
        console.error('[Hiển thị] Lỗi vẽ giao diện sau khi nạp dữ liệu:', renderErr);
        const status = document.getElementById('static-sync-status');
        if (status) {
          status.hidden = false;
          status.textContent = 'Dữ liệu đã tải xong nhưng một màn hình hiển thị bị lỗi. Hãy tải lại trang; nếu còn lỗi, báo cho người quản trị ứng dụng.';
        }
      }
    }
  }

  // Đưa không gian làm việc về trạng thái rỗng (đăng xuất). Sửa tại chỗ để FirebaseState.currentData vẫn đúng.
  function resetToOfflineWorkspace() {
    delete currentWorkspaceData._sync;
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
        if (!confirm('Khôi phục sẽ THAY THẾ toàn bộ dữ liệu của tài khoản đang dùng bằng nội dung trong tệp (lưu lên đám mây). Tiếp tục?')) return;
        try {
          await window.FirebaseClient.replaceWorkspaceData(payload.data);
          showToast('Đã khôi phục dữ liệu từ tệp sao lưu.');
        } catch (err) {
          showToast(err?.message || 'Chưa khôi phục được dữ liệu.', 'error');
        }
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
        lastKnownRevsV2 = migrated.knownRevs || null;
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
      lastKnownRevsV2 = null;
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

  // 2. Khởi tạo Firebase SDK (App, Analytics & Firestore)
  if (isConfigured) {
    const firebaseVersion = '10.13.0';
    import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app.js`).then(async ({ initializeApp }) => {
      const { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } =
        await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-auth.js`);
      const { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch, runTransaction } =
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
      window.FirebaseState._firestoreHelpers = { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch, runTransaction };

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
          writeBatch,
          runTransaction
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
      lastKnownRevsV2 = null;
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

      // Thiếu mô-đun Cloud v2: không có cách lưu nào khác.
      showOfflineBanner(true);
    }).catch(err => {
      console.warn('[Firebase Bridge] Lỗi tải SDK:', err);
      showOfflineBanner(true);
    });
  } else {
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

  // Thông báo Toast trang nhã (thay thế popup alert)
  // Thông báo khi dữ liệu trên đám mây đã được sửa ở máy/tab khác: không tự gộp, yêu cầu tải lại.
  function showCloudConflictNotice(err) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function' || !document.body) return;
    let box = document.getElementById('cloud-conflict-notice');
    if (!box) {
      box = document.createElement('div');
      box.id = 'cloud-conflict-notice';
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-live', 'assertive');
      box.style.cssText = [
        'position: fixed', 'left: 50%', 'bottom: 24px', 'transform: translateX(-50%)', 'z-index: 10001',
        'max-width: 560px', 'width: calc(100% - 32px)', 'padding: 16px 18px', 'border-radius: 10px',
        'background: #fff4f2', 'color: #7a1c0c', 'border: 1px solid #f0b6a8',
        'box-shadow: 0 10px 28px rgba(0,0,0,0.18)', 'font-size: 14px', 'line-height: 1.5'
      ].join(';');
      const title = document.createElement('strong');
      title.textContent = 'Dữ liệu đã được sửa ở máy hoặc tab khác';
      title.style.display = 'block';
      const body = document.createElement('p');
      body.id = 'cloud-conflict-notice-text';
      body.style.margin = '6px 0 12px';
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
      const later = document.createElement('button');
      later.type = 'button';
      later.className = 'btn';
      later.textContent = 'Để sau';
      later.onclick = () => { box.hidden = true; };
      const reload = document.createElement('button');
      reload.type = 'button';
      reload.className = 'btn btn-primary';
      reload.textContent = 'Tải lại để lấy bản mới nhất';
      reload.onclick = () => { if (typeof location !== 'undefined') location.reload(); };
      actions.append(later, reload);
      box.append(title, body, actions);
      document.body.appendChild(box);
    }
    const n = Array.isArray(err?.conflicts) ? err.conflicts.length : 0;
    const text = document.getElementById('cloud-conflict-notice-text');
    if (text) {
      text.textContent = 'Thao tác vừa rồi CHƯA được lưu để không ghi đè lên phần đã sửa ở nơi khác'
        + (n ? ` (${n} mục bị trùng)` : '')
        + '. Hãy tải lại trang để lấy bản mới nhất rồi làm lại thao tác. Nên chỉ mở ứng dụng ở một tab khi soạn.';
    }
    box.hidden = false;
  }

  function hideCloudConflictNotice() {
    const box = typeof document !== 'undefined' && typeof document.getElementById === 'function'
      ? document.getElementById('cloud-conflict-notice') : null;
    if (box) box.hidden = true;
  }

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
      badge.innerHTML = `<span class="auth-offline-dot"></span><span class="auth-status-text">${useUnifiedCloudV2() ? 'Chưa đăng nhập' : 'Chế độ thử'}</span>`;
      btn.textContent = 'Đăng nhập Google';
      btn.className = 'topbar-btn topbar-btn-primary auth-login-btn';
    }
    updateDriveSyncButton();
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
