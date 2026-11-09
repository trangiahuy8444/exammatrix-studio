// public/firebase-bridge.js
// =============================================================================
// CẦU NỐI FIREBASE CHO GITHUB PAGES (AUTH & MULTI-TENANT FIRESTORE)
// =============================================================================

(function() {
  const isStaticHost = typeof window !== 'undefined' && (
    window.location.hostname.endsWith('github.io') ||
    window.location.hostname === 'localhost' ||
    window.location.protocol === 'file:'
  );

  const config = window.FIREBASE_CONFIG;
  const isConfigured = config && config.apiKey && !config.apiKey.includes('YOUR_API_KEY');

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
    } catch(e) {}
  }

  // Khởi tạo danh mục PPCT chuẩn từ curricula.js
  function buildDefaultLessons(subject) {
    const curricula = window.SUBJECT_CURRICULA || {};
    const subjData = curricula[subject] || curricula['Tin học'] || {};
    const lessons = [];
    Object.keys(subjData).forEach(grade => {
      (subjData[grade] || []).forEach(l => {
        lessons.push({
          ...l,
          grade: Number(grade),
          subject_name: subject,
          occurrences: l.occurrences || [{ week_raw: 'Tuần 1', periods_raw: '1' }]
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
    isReady: false,
    currentData: currentWorkspaceData
  };

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

      // 1. Lấy trạng thái hệ thống
      if (path === '/api/state') {
        const lessons = buildDefaultLessons(subj);
        const questions = currentWorkspaceData.bank.questions || [];
        return {
          context: { subject_name: subj },
          bank: {
            questions: questions,
            ppct: { lessons: lessons }
          },
          review_checklist: [],
          can_view_answers: true,
          is_test_mode: false,
          exams: currentWorkspaceData.exams || [],
          revisions: currentWorkspaceData.revisions || [],
          matrices: currentWorkspaceData.matrices || [],
          templates: []
        };
      }

      // 2. Lưu câu hỏi vào ngân hàng (hỗ trợ cả 2 route)
      if (path === '/api/bank/save-question' || path === '/api/questions/save') {
        const q = { ...(body.question || body) };
        if (!q.id) {
          q.id = `K${q.grade || 10}-GV-${Math.random().toString(36).slice(2, 10)}`;
        }
        q.updated_at = new Date().toISOString();
        const qs = currentWorkspaceData.bank.questions || [];
        const idx = qs.findIndex(x => x.id === q.id);
        if (idx >= 0) qs[idx] = q;
        else qs.push(q);
        currentWorkspaceData.bank.questions = qs;
        await syncToFirestore(uid, currentWorkspaceData);
        return { question: q, bank: currentWorkspaceData.bank };
      }

      // 3. Nhập câu hỏi (JSON Import)
      if (path === '/api/bank/import') {
        const incoming = Array.isArray(body.bank) ? body.bank : (body.bank?.questions || []);
        const qs = currentWorkspaceData.bank.questions || [];
        incoming.forEach(raw => {
          const q = { ...raw };
          if (!q.id) q.id = `K${q.grade || 10}-GV-${Math.random().toString(36).slice(2, 10)}`;
          if (!q.review_status) q.review_status = 'draft';
          const idx = qs.findIndex(x => x.id === q.id);
          if (idx >= 0) qs[idx] = q;
          else qs.push(q);
        });
        currentWorkspaceData.bank.questions = qs;
        await syncToFirestore(uid, currentWorkspaceData);
        return { bank: currentWorkspaceData.bank };
      }

      // 4. Xóa câu hỏi (hỗ trợ cả 2 route)
      if (path === '/api/bank/delete-question' || path === '/api/questions/delete') {
        const id = body.id;
        currentWorkspaceData.bank.questions = (currentWorkspaceData.bank.questions || []).filter(q => q.id !== id);
        await syncToFirestore(uid, currentWorkspaceData);
        return { bank: currentWorkspaceData.bank };
      }

      // Khôi phục câu hỏi
      if (path === '/api/questions/restore') {
        const id = body.id;
        const qs = currentWorkspaceData.bank.questions || [];
        const target = qs.find(q => q.id === id);
        if (target) target.review_status = body.status || 'approved';
        await syncToFirestore(uid, currentWorkspaceData);
        return { question: target, bank: currentWorkspaceData.bank };
      }

      // Thao tác hàng loạt (Bulk)
      if (path === '/api/questions/bulk') {
        const ids = new Set(body.ids || []);
        const qs = currentWorkspaceData.bank.questions || [];
        qs.forEach(q => {
          if (ids.has(q.id)) {
            if (body.status) q.review_status = body.status;
          }
        });
        await syncToFirestore(uid, currentWorkspaceData);
        return { bank: currentWorkspaceData.bank };
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
          lessons = raw.map((l, i) => ({
            status: 'new',
            grade: Number(l.grade || grade),
            lesson_code: l.lesson_code || ('B' + (i + 1)),
            lesson_name: l.lesson_name_source || l.lesson_name || l.name || '',
            topic: l.topic_source || l.topic || '',
            outcomes: Array.isArray(l.outcomes) ? l.outcomes : [],
            occurrences: (l.occurrences || []).length || 1
          }));
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
                  const periodsRaw = cells[2] || '1';
                  const ppctRaw = cells[3] || '';
                  const outcomesRaw = cells[4] || '';

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

                  if (lessonsMap.has(lessonCode)) {
                    const existing = lessonsMap.get(lessonCode);
                    existing.occurrences.push({ week_raw: weekRaw, periods_raw: periodsRaw, ppct_raw: ppctRaw });
                    if (outcomes.length > 0 && (!existing.outcomes || !existing.outcomes.length)) {
                      existing.outcomes = outcomes;
                    } else if (outcomes.length > 0) {
                      outcomes.forEach(o => { if (!existing.outcomes.includes(o)) existing.outcomes.push(o); });
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
                      occurrences: [{ week_raw: weekRaw, periods_raw: periodsRaw, ppct_raw: ppctRaw }],
                      outcomes: outcomes.length ? outcomes : ['Yêu cầu cần đạt theo chương trình môn học.']
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
              topic: 'Chương trình GDPT',
              outcomes: ['Yêu cầu cần đạt theo chương trình môn học.'],
              occurrences: 1
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

        const incoming = Array.isArray(body.lessons) ? body.lessons : [];
        if (incoming.length > 0) {
          if (!currentWorkspaceData.bank.ppct) currentWorkspaceData.bank.ppct = { lessons: [] };
          const existing = currentWorkspaceData.bank.ppct.lessons || [];
          const otherLessons = existing.filter(l => Number(l.grade) !== grade);
          const newLessons = incoming.map(l => ({
            ...l,
            grade: grade,
            subject_name: body.subject_name || (window.store && window.store.selectedSubject) || 'Tin học'
          }));
          currentWorkspaceData.bank.ppct.lessons = [...otherLessons, ...newLessons];
          await syncToFirestore(uid, currentWorkspaceData);

          if (window.store && window.store.bank) {
            window.store.bank.ppct = currentWorkspaceData.bank.ppct;
          }
        }
        return {
          bank: currentWorkspaceData.bank,
          summary: { new: incoming.length, changed: 0, conflict: 0 }
        };
      }

      // Tuyến Kiểm tra thường xuyên (KTTX)
      if (path === '/api/kttx') {
        return { assignments: [], submissions: [], stats: { total: 0 } };
      }

      // Đặt lại dữ liệu test
      if (path === '/api/test/reset') {
        return { success: true };
      }

      // 5. Đề cương (Revisions)
      if (path === '/api/revisions/save' || path === '/api/revisions/update') {
        const rev = { ...body };
        if (!rev.id) rev.id = `REV-${Math.random().toString(36).slice(2, 10)}`;
        rev.created_at = rev.created_at || new Date().toISOString();
        const revs = currentWorkspaceData.revisions || [];
        const idx = revs.findIndex(x => x.id === rev.id);
        if (idx >= 0) revs[idx] = rev;
        else revs.push(rev);
        currentWorkspaceData.revisions = revs;
        await syncToFirestore(uid, currentWorkspaceData);
        return { revision: rev, revisions: revs };
      }

      if (path === '/api/revisions/delete') {
        currentWorkspaceData.revisions = (currentWorkspaceData.revisions || []).filter(r => r.id !== body.id);
        await syncToFirestore(uid, currentWorkspaceData);
        return { revisions: currentWorkspaceData.revisions };
      }

      // 6. Đề kiểm tra (Exams)
      if (path === '/api/exams/save' || path === '/api/exams/generate') {
        const exam = { ...body };
        if (!exam.id) exam.id = `EXAM-${Math.random().toString(36).slice(2, 10)}`;
        exam.created_at = exam.created_at || new Date().toISOString();
        const exams = currentWorkspaceData.exams || [];
        exams.push(exam);
        currentWorkspaceData.exams = exams;
        await syncToFirestore(uid, currentWorkspaceData);
        return { exam: exam, exams: exams };
      }

      if (path === '/api/exams/delete') {
        currentWorkspaceData.exams = (currentWorkspaceData.exams || []).filter(e => e.id !== body.id);
        await syncToFirestore(uid, currentWorkspaceData);
        return { exams: currentWorkspaceData.exams };
      }

      // Mặc định phản hồi thành công cho các route phụ
      return { success: true };
    }
  };

  // Đồng bộ lên Cloud Firestore
  async function syncToFirestore(uid, data) {
    saveStorageData(uid, data);
    if (!window.FirebaseState.user || !window.FirebaseState.db) return;
    try {
      const { doc, setDoc } = window.FirebaseState._firestoreHelpers;
      const ref = doc(window.FirebaseState.db, 'workspaces', uid);
      await setDoc(ref, {
        owner_email: window.FirebaseState.user.email,
        updated_at: new Date().toISOString(),
        bank: { questions: data.bank.questions || [] },
        exams: data.exams || [],
        revisions: data.revisions || [],
        matrices: data.matrices || []
      }, { merge: true });
    } catch(e) {
      console.warn('[Firebase] Lỗi ghi Firestore:', e);
    }
  }

  // Nạp dữ liệu từ Firestore khi đăng nhập
  async function loadFromFirestore(user, db, helpers) {
    try {
      const ref = helpers.doc(db, 'workspaces', user.uid);
      const snap = await helpers.getDoc(ref);
      if (snap.exists()) {
        const remote = snap.data();
        currentWorkspaceData.bank.questions = remote.bank?.questions || [];
        currentWorkspaceData.exams = remote.exams || [];
        currentWorkspaceData.revisions = remote.revisions || [];
        currentWorkspaceData.matrices = remote.matrices || [];
      } else {
        // Chưa có dữ liệu thì lưu bộ khung mới
        await helpers.setDoc(ref, {
          owner_email: user.email,
          created_at: new Date().toISOString(),
          bank: { questions: [] },
          exams: [],
          revisions: [],
          matrices: []
        });
      }
      saveStorageData(user.uid, currentWorkspaceData);
      if (window.store) {
        window.store.bank = {
          ...window.store.bank,
          questions: currentWorkspaceData.bank.questions
        };
        window.store.exams = currentWorkspaceData.exams;
        window.store.revisions = currentWorkspaceData.revisions;
        window.store.matrixRecords = currentWorkspaceData.matrices;
        if (typeof window.render === 'function') window.render();
      }
    } catch(e) {
      console.warn('[Firebase] Lỗi nạp Firestore:', e);
    }
  }

  if (!isConfigured) return;

  // 2. Khởi tạo Firebase SDK
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

    onAuthStateChanged(auth, async (user) => {
      window.FirebaseState.user = user;
      updateUserUI(user);
      if (user) {
        console.log('[Firebase Bridge] Giáo viên đăng nhập:', user.email);
        await loadFromFirestore(user, db, { doc, getDoc, setDoc });
      } else {
        showLoginModal(true);
      }
    });
  }).catch(err => {
    console.warn('[Firebase Bridge] Lỗi tải SDK:', err);
  });

  // Thông báo Toast trang nhã (thay thế popup alert)
  function showToast(message, type = 'success') {
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
    toast.innerHTML = `<span>${isOk ? '✅' : '⚠️'}</span> <span>${message}</span>`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-12px)';
    }, 3500);
  }

  // UI Setup
  function setupAuthUI(auth, db, helpers) {
    let authBox = document.getElementById('firebase-auth-box');
    if (!authBox) {
      const topbarRight = document.querySelector('.topbar-right') || document.querySelector('.topbar > div:last-child');
      if (topbarRight) {
        authBox = document.createElement('div');
        authBox.id = 'firebase-auth-box';
        authBox.className = 'auth-pill-container';
        topbarRight.appendChild(authBox);
      }
    }
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
    if (!badge || !btn) return;
    if (user) {
      const name = user.displayName || user.email.split('@')[0];
      const initial = name.charAt(0).toUpperCase();
      badge.innerHTML = `<span class="auth-avatar">${initial}</span><strong class="auth-name" title="${user.email}">${name}</strong>`;
      btn.textContent = 'Đăng xuất';
      btn.className = 'topbar-btn auth-logout-btn';
      showLoginModal(false);
    } else {
      badge.innerHTML = `<span class="auth-offline-dot"></span><span class="auth-status-text">Chưa đăng nhập</span>`;
      btn.textContent = 'Đăng nhập';
      btn.className = 'topbar-btn topbar-btn-primary auth-login-btn';
    }
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
          <button type="button" id="fb-btn-close-modal" class="button quiet" style="font-size:11px;color:#718096;text-decoration:underline;cursor:pointer;">Đóng (Dùng thử ngoại tuyến)</button>
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
      if (!modal.open) modal.showModal();
    } else {
      if (modal.open) modal.close();
    }
  }
})();
