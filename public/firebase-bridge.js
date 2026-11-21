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

  // Bộ nhớ đệm dữ liệu cá nhân của giáo viên đang đăng nhập
  const localCacheKey = 'exammatrix_teacher_cache_';
  let currentWorkspaceData = {
    bank: { questions: [], ppct: { lessons: [] } },
    exams: [],
    revisions: [],
    matrices: []
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

  async function trySaveLocalCache(uid, data) {
    let lsOk = false;
    try {
      saveStorageData(uid, data);
      lsOk = true;
    } catch (e) {
      lsOk = false;
    }
    const idbOk = await idbSet(uid, data);
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
    try {
      // Chỉ nạp dữ liệu ngoại tuyến. Dữ liệu của từng tài khoản được nạp riêng khi đăng nhập,
      // để người dùng chưa đăng nhập không nhìn thấy dữ liệu của tài khoản khác trên cùng máy.
      const cached = getStorageData('offline');
      if (cached) {
        if (cached.bank?.questions) currentWorkspaceData.bank.questions = cached.bank.questions;
        if (cached.bank?.ppct) currentWorkspaceData.bank.ppct = cached.bank.ppct;
        if (cached.bank?.competency_catalogs) currentWorkspaceData.bank.competency_catalogs = cached.bank.competency_catalogs;
        if (cached.exams) currentWorkspaceData.exams = cached.exams;
        if (cached.revisions) currentWorkspaceData.revisions = cached.revisions;
        if (cached.matrices) currentWorkspaceData.matrices = cached.matrices;
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

  // Khởi tạo danh mục PPCT chuẩn từ curricula.js (chỉ nạp sẵn Khối 8, 9, 10 đã được giáo viên upload)
  function normalizeOccurrences(occ) {
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
        const out = {
          week_raw: o.week_raw != null && String(o.week_raw).trim() !== '' ? String(o.week_raw).trim() : 'Tuần 1',
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
      return { week_raw: 'Tuần 1', duration_raw: '', ppct_raw: '', periods_raw: String(o || '1'), competencies_raw: '', notes_raw: '' };
    };
    if (Array.isArray(occ) && occ.length > 0) return occ.map(mapOne);
    if (occ && typeof occ === 'object') return [mapOne(occ)];
    if (typeof occ === 'number' || typeof occ === 'string') {
      return [{ week_raw: 'Tuần 1', duration_raw: '', ppct_raw: '', periods_raw: String(occ || '1'), competencies_raw: '', notes_raw: '' }];
    }
    return [{ week_raw: 'Tuần 1', duration_raw: '', ppct_raw: '', periods_raw: '1', competencies_raw: '', notes_raw: '' }];
  }

  function cleanPpctLessons(lessons, clearedGrades = []) {
    if (!Array.isArray(lessons)) return [];
    return lessons.filter(l => {
      const g = Number(l.grade);
      if (clearedGrades.includes(g) && !l.user_uploaded) return false;
      // Không xóa PPCT khối khác trong một thao tác đọc hoặc lưu môn đang làm.
      return true;
    }).map(l => ({
      ...l,
      occurrences: normalizeOccurrences(l.occurrences)
    }));
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
            ppct: { lessons: finalLessons, cleared_grades: cleared }
          },
          review_checklist: window.BankStaticWorkflow?.checklist || [],
          can_view_answers: true,
          exams: (currentWorkspaceData.exams || []).map(exam => ({...exam, verification: window.BankStaticEngine?.verifyExam(currentWorkspaceData, exam) || {passed:false, summary:'Chưa nạp bộ kiểm định.'}})),
          revisions: currentWorkspaceData.revisions || [],
          matrices: currentWorkspaceData.matrices || [],
          templates: []
        };
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
          const raw = Array.isArray(body.json) ? body.json : (body.json.lessons || body.json.ppct?.lessons || []);
          lessons = raw.map((l, i) => {
            const rawOcc = (Array.isArray(l.occurrences) && l.occurrences.length > 0)
              ? l.occurrences
              : ((l.week_raw != null || l.duration_raw != null || l.num_periods != null || l.so_tiet != null || l.ppct_raw != null || l.periods_raw != null)
                ? [{
                    week_raw: l.week_raw || 'Tuần 1',
                    duration_raw: l.duration_raw ?? l.so_tiet ?? l.num_periods ?? '',
                    ppct_raw: l.ppct_raw || '',
                    periods_raw: l.periods_raw || l.ppct_raw || l.duration_raw || '1',
                    competencies_raw: l.competencies_raw || '',
                    notes_raw: l.notes_raw || ''
                  }]
                : l.occurrences);
            const occs = normalizeOccurrences(rawOcc);
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
            return {
              status: 'new',
              grade: Number(l.grade || grade),
              lesson_code: l.lesson_code || ('B' + (i + 1)),
              lesson_name: l.lesson_name_source || l.lesson_name || l.name || '',
              lesson_name_source: l.lesson_name_source || l.lesson_name || l.name || '',
              topic: l.topic_source || l.topic || 'Chương trình GDPT',
              topic_source: l.topic_source || l.topic || 'Chương trình GDPT',
              outcomes: Array.isArray(l.outcomes)
                ? l.outcomes.map(o => String(o || '').trim()).filter(Boolean)
                : (typeof l.outcomes === 'string'
                    ? l.outcomes.split(/\r?\n/).map(o => o.trim().replace(/^[-*•+]\s*/, '')).filter(Boolean)
                    : []),
              occurrences: occs,
              digital_competencies: compList,
              notes: notesStr
            };
          });
        } else if (body.extracted_html) {
          // Bóc tách bảng HTML từ tệp Word (.docx) chuẩn KHDH Phụ lục 1
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(body.extracted_html, 'text/html');
            const tables = Array.from(doc.querySelectorAll('table'));
            let targetTable = null;
            for (const tbl of tables) {
              const txt = tbl.textContent.toLowerCase();
              if (txt.includes('bài học') && (txt.includes('ppct') || txt.includes('yêu cầu cần đạt'))) {
                targetTable = tbl;
                break;
              }
            }

            if (targetTable) {
              const rows = Array.from(targetTable.querySelectorAll('tr'));
              let currentTopic = '';
              const lessonsMap = new Map();

              for (const r of rows) {
                const cells = Array.from(r.querySelectorAll('td, th')).map(c => c.textContent.trim());
                if (!cells.length) continue;
                if (cells.some(c => /Bài\s*học/i.test(c) && /Tuần/i.test(cells[0] || ''))) continue;
                if (cells.some(c => /Học\s*kì/i.test(c))) continue;

                if (cells.length === 1 || (cells.length > 1 && !cells[1] && !cells[2])) {
                  const txt = cells[0];
                  if (/Chủ\s*đề/i.test(txt)) currentTopic = txt;
                  continue;
                }

                if (cells.length >= 2) {
                  const weekRaw = cells[0] || '';
                  const lessonRaw = cells[1] || '';
                  const durationRaw = cells[2] || '1';
                  const ppctRaw = cells[3] || '';
                  const outcomesRaw = cells[4] || '';
                  const competenciesRaw = cells[5] || '';
                  const notesRaw = cells[6] || '';

                  if (!lessonRaw.trim()) continue;

                  let lessonCode = '';
                  const mCode = lessonRaw.match(/^(?:Bài|Chủ\s*đề)\s*([0-9]+[a-zA-Z]?)/i);
                  if (mCode) {
                    lessonCode = 'B' + mCode[1];
                  } else if (/Kiểm\s*tra\s*giữa\s*h?k?1/i.test(lessonRaw)) {
                    lessonCode = 'KTGK1';
                  } else if (/Kiểm\s*tra\s*h?k?1|Kiểm\s*tra\s*cuối\s*h?k?1/i.test(lessonRaw)) {
                    lessonCode = 'KTCK1';
                  } else if (/Kiểm\s*tra\s*giữa\s*h?k?2/i.test(lessonRaw)) {
                    lessonCode = 'KTGK2';
                  } else if (/Kiểm\s*tra\s*h?k?2|Kiểm\s*tra\s*cuối\s*h?k?2/i.test(lessonRaw)) {
                    lessonCode = 'KTCK2';
                  } else if (/Ôn\s*tập/i.test(lessonRaw)) {
                    lessonCode = 'OT';
                  } else {
                    lessonCode = 'B' + (lessonsMap.size + 1);
                  }

                  let cleanName = lessonRaw.replace(/^(?:Bài|Chủ\s*đề)\s*[0-9]+[a-zA-Z]?[:.]?\s*/i, '')
                                           .replace(/\s*\(tiết\s*\d+\)/i, '')
                                           .trim();
                  if (!cleanName) cleanName = lessonRaw;

                  const outcomes = outcomesRaw.split(/(?:^|\n|\r|\.)\s*-\s*/)
                    .map(o => o.trim().replace(/^-\s*/, ''))
                    .filter(o => o.length > 5);
                  const rowComps = normalizeTextList(competenciesRaw);
                  const rowNote = String(notesRaw || '').replace(/\s+/g, ' ').trim();

                  if (lessonsMap.has(lessonCode)) {
                    const existing = lessonsMap.get(lessonCode);
                    existing.occurrences.push({
                      week_raw: weekRaw,
                      duration_raw: durationRaw,
                      ppct_raw: ppctRaw,
                      periods_raw: ppctRaw || durationRaw || '1',
                      competencies_raw: competenciesRaw,
                      notes_raw: rowNote
                    });
                    if (outcomes.length > 0 && (!existing.outcomes || !existing.outcomes.length)) {
                      existing.outcomes = outcomes;
                    } else if (outcomes.length > 0) {
                      outcomes.forEach(o => { if (!existing.outcomes.includes(o)) existing.outcomes.push(o); });
                    }
                    rowComps.forEach(c => {
                      if (!existing.digital_competencies.includes(c)) existing.digital_competencies.push(c);
                    });
                    if (rowNote) {
                      const prevNotes = existing.notes ? existing.notes.split('; ').map(s => s.trim()).filter(Boolean) : [];
                      if (!prevNotes.includes(rowNote)) {
                        prevNotes.push(rowNote);
                        existing.notes = prevNotes.join('; ');
                      }
                    }
                  } else {
                    lessonsMap.set(lessonCode, {
                      status: 'new',
                      grade: grade,
                      lesson_code: lessonCode,
                      lesson_name: cleanName,
                      lesson_name_source: cleanName,
                      topic: currentTopic || 'Chương trình GDPT',
                      topic_source: currentTopic || 'Chương trình GDPT',
                      occurrences: [{
                        week_raw: weekRaw,
                        duration_raw: durationRaw,
                        ppct_raw: ppctRaw,
                        periods_raw: ppctRaw || durationRaw || '1',
                        competencies_raw: competenciesRaw,
                        notes_raw: rowNote
                      }],
                      outcomes: outcomes.length ? outcomes : ['Yêu cầu cần đạt theo chương trình môn học.'],
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
            const occs = normalizeOccurrences(l.occurrences);
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
        const compList = normalizeTextList(l.digital_competencies ?? l.competencies ?? l.competencies_raw ?? l.nls_ai ?? []);
        const notesStr = normalizeNotesValue(l.notes ?? l.note ?? l.notes_raw ?? l.ghi_chu ?? '');
        const occs = normalizeOccurrences(l.occurrences || [{
          week_raw: l.week_raw || 'Tuần 1',
          duration_raw: l.duration_raw ?? l.so_tiet ?? l.num_periods ?? '',
          ppct_raw: l.ppct_raw || '',
          periods_raw: l.periods_raw || l.ppct_raw || l.duration_raw || '1',
          competencies_raw: compList.join('\n'),
          notes_raw: notesStr
        }]);
        const lessonObj = {
          grade: grade,
          lesson_code: l.lesson_code,
          lesson_name_source: l.lesson_name_source || l.lesson_name || '',
          topic_source: l.topic_source || l.topic || 'Chương trình GDPT',
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

      // Tuyến Kiểm tra thường xuyên (KTTX)
      if (path === '/api/kttx') {
        throw new Error('Quản lý KTTX chưa được hỗ trợ trên bản Pages. Hãy dùng bản máy chủ; ứng dụng không kết luận dữ liệu KTTX bằng 0.');
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
      try { return JSON.parse(JSON.stringify(await directHandle(path, body))); }
      catch (error) {
        if ((window.FirebaseState.user?.uid || 'offline') === uid) {
          currentWorkspaceData = before;
          window.FirebaseState.currentData = currentWorkspaceData;
        }
        throw error;
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
      await syncToFirestore(uid, currentWorkspaceData);
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
        matrices: Array.isArray(nextData.matrices) ? nextData.matrices : []
      }));
      try {
        currentWorkspaceData = normalized;
        window.FirebaseState.currentData = currentWorkspaceData;
        await syncToFirestore(uid, currentWorkspaceData);
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
      }
    };
    const request = pendingRequest.then(runReplace, runReplace);
    pendingRequest = request.catch(() => {});
    return request;
  };

  function updateDriveSyncButton() {
    const syncBtn = document.getElementById('gdrive-sync-btn');
    if (!syncBtn) return;
    const isDrive = window.FirebaseState.provider === 'google-drive' && Boolean(window.FirebaseState.user);
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

  // Đồng bộ lên Google Drive riêng (hoặc Cloud Firestore nếu dùng Firebase)
  async function syncToFirestore(uid, data) {
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
        matrices: data.matrices || []
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
    const empty = () => ({ bank: { questions: [], ppct: { lessons: [], cleared_grades: [] }, competency_catalogs: [] }, exams: [], revisions: [], matrices: [] });
    const install = data => { currentWorkspaceData = JSON.parse(JSON.stringify(data)); window.FirebaseState.currentData = currentWorkspaceData; applyWorkspaceToStore(); };

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
      install({
        bank: result.data.bank,
        exams: result.data.exams,
        revisions: result.data.revisions,
        matrices: result.data.matrices,
        _sync: { pending: false, provider: 'google-drive', synced_at: result.updatedAt || new Date().toISOString() }
      });
      await trySaveLocalCache(user.uid, currentWorkspaceData);
      if (status) {
        status.hidden = false;
        status.textContent = `Đã tải dữ liệu từ Google Drive riêng của bạn (${driveCfg.folderName}/${driveCfg.fileName}).`;
      }
    } else {
      currentWorkspaceData._sync = { pending: false, provider: 'google-drive' };
      await trySaveLocalCache(user.uid, currentWorkspaceData);
      if (status) {
        status.hidden = false;
        status.textContent = `Đã kết nối Google Drive riêng (${driveCfg.folderName}). Tài khoản mới chưa có tệp dữ liệu; bấm "Đồng bộ Drive" hoặc lưu câu hỏi đầu tiên để tạo ${driveCfg.fileName}.`;
      }
    }
    updateDriveSyncButton();
  }

  // Nạp dữ liệu từ Firestore khi đăng nhập
  async function loadFromFirestore(user, db, helpers) {
    const cached=getStorageData(user.uid),cacheAtStart=JSON.stringify(cached);
    const valid=data=>data&&data.bank&&Array.isArray(data.bank.questions)&&Array.isArray(data.bank.ppct?.lessons)&&['exams','revisions','matrices'].every(k=>Array.isArray(data[k]));
    const empty=()=>({bank:{questions:[],ppct:{lessons:[],cleared_grades:[]}},exams:[],revisions:[],matrices:[]});
    const install=data=>{currentWorkspaceData=JSON.parse(JSON.stringify(data));window.FirebaseState.currentData=currentWorkspaceData;applyWorkspaceToStore();};
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
        install({bank:remote.bank,exams:remote.exams,revisions:remote.revisions,matrices:remote.matrices,_sync:{pending:false}});
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
    window.store.plans={};window.store.selected=new Set();
    window.store.activeExamViewId=null;window.store.activeRevisionViewId=null;
    if(typeof window.restoreExamDraft==='function')window.restoreExamDraft();
    if (typeof window.render === 'function') window.render();
  }

  // Đưa không gian làm việc trong bộ nhớ về dữ liệu ngoại tuyến (khi đăng xuất hoặc khôi phục tệp).
  // Sửa tại chỗ để window.FirebaseState.currentData vẫn trỏ đúng đối tượng.
  function resetToOfflineWorkspace() {
    delete currentWorkspaceData._sync;
    currentWorkspaceData.bank = { questions: [], ppct: { lessons: [] } };
    currentWorkspaceData.exams = [];
    currentWorkspaceData.revisions = [];
    currentWorkspaceData.matrices = [];
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

  if (window.GoogleDriveStorage) {
    initGoogleDriveMode();
    return;
  }

  if (!isConfigured) {
    showOfflineBanner(true);
    return;
  }

  // 2. Khởi tạo Firebase SDK (dự phòng khi không nạp google-drive-storage.js)
  const firebaseVersion = '10.13.0';
  import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app.js`).then(async ({ initializeApp }) => {
    const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } =
      await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-auth.js`);
    const { getFirestore, doc, getDoc, setDoc } =
      await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-firestore.js`);

    const app = initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app);

    window.FirebaseState.auth = auth;
    window.FirebaseState.db = db;
    window.FirebaseState._firestoreHelpers = { doc, getDoc, setDoc };

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
        // Chưa đăng nhập (hoặc vừa đăng xuất): dùng ngoại tuyến, không tự bật hộp đăng nhập.
        if (hadUser) { hadUser = false; resetToOfflineWorkspace(); }
        showOfflineBanner(true);
      }
    });
  }).catch(err => {
    console.warn('[Firebase Bridge] Lỗi tải SDK:', err);
    showOfflineBanner(true); // Không có mạng hoặc không tải được Firebase: vẫn dùng ngoại tuyến
  });

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
            const res = await window.FirebaseClient.syncCurrentData();
            if (res.ok) {
              showToast('Đã đồng bộ dữ liệu lên Google Drive riêng của bạn!');
            } else {
              showToast('Chưa đồng bộ được lên Google Drive — dữ liệu vẫn được giữ trên máy.', 'error');
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
    if (user) {
      const name = user.displayName || (user.email ? user.email.split('@')[0] : 'Giáo viên');
      const initial = name.charAt(0).toUpperCase();
      badge.innerHTML = `<span class="auth-avatar">${escapeHtml(initial)}</span><strong class="auth-name" title="${escapeHtml(user.email || '')}">${escapeHtml(name)}</strong>`;
      btn.textContent = 'Đăng xuất';
      btn.className = 'topbar-btn auth-logout-btn';
      showLoginModal(false);
    } else {
      badge.innerHTML = `<span class="auth-offline-dot"></span><span class="auth-status-text">Ngoại tuyến</span>`;
      btn.textContent = window.FirebaseState.provider === 'google-drive' || window.GoogleDriveStorage ? 'Đăng nhập Google' : 'Đăng nhập';
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
        return 'Chưa bật phương thức này trong Firebase Console. Thầy vui lòng vào Firebase Console > Authentication > Sign-in method và Bật (Enable) Email/Password hoặc Google.';
      }
      if (code.includes('unauthorized-domain')) {
        return 'Tên miền "' + window.location.hostname + '" chưa được phép đăng nhập. Quản trị viên cần vào Firebase Console > Authentication > Settings > Authorized domains và thêm tên miền này. Trong lúc chờ, Thầy/Cô vẫn dùng được chế độ ngoại tuyến.';
      }
      if (code.includes('network-request-failed')) {
        return 'Không kết nối được mạng. Thầy/Cô vẫn dùng được chế độ ngoại tuyến; dữ liệu lưu ngay trên trình duyệt này.';
      }
      if (code.includes('too-many-requests')) {
        return 'Thử đăng nhập quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.';
      }
      if (code.includes('invalid-api-key') || code.includes('api-key-not-valid')) {
        return 'Khóa cấu hình Firebase không hợp lệ. Vui lòng liên hệ quản trị viên.';
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
