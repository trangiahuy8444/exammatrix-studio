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
      return isStaticHost && isConfigured;
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

      // 2. Lưu câu hỏi vào ngân hàng
      if (path === '/api/bank/save-question') {
        const q = { ...body };
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

      // 4. Xóa câu hỏi
      if (path === '/api/bank/delete-question') {
        const id = body.id;
        currentWorkspaceData.bank.questions = (currentWorkspaceData.bank.questions || []).filter(q => q.id !== id);
        await syncToFirestore(uid, currentWorkspaceData);
        return { bank: currentWorkspaceData.bank };
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
    const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } =
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

  // UI Setup
  function setupAuthUI(auth, db, helpers) {
    const topbarRight = document.querySelector('.topbar > div:last-child');
    if (topbarRight && !document.getElementById('firebase-auth-box')) {
      const authBox = document.createElement('div');
      authBox.id = 'firebase-auth-box';
      authBox.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:8px;padding-left:8px;border-left:1px solid #c5d8ea;font-size:12px;';
      authBox.innerHTML = `
        <span id="fb-user-badge" style="font-weight:600;color:var(--navy,#102d4a);">Đang kết nối Firebase…</span>
        <button id="fb-auth-btn" class="button" type="button" style="padding:4px 8px;font-size:11px;font-weight:600;">Đăng nhập</button>
      `;
      topbarRight.appendChild(authBox);

      authBox.querySelector('#fb-auth-btn').onclick = () => {
        if (window.FirebaseState.user) {
          if (confirm('Thầy/Cô có chắc muốn đăng xuất khỏi tài khoản này?')) {
            helpers.signOut(auth);
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
      badge.innerHTML = `👤 <strong title="${user.email}">${user.email.split('@')[0]}</strong>`;
      badge.style.color = '#0267B1';
      btn.textContent = 'Đăng xuất';
      btn.className = 'button quiet';
      showLoginModal(false);
    } else {
      badge.innerHTML = `⚠️ <span style="color:#d9534f">Chưa đăng nhập</span>`;
      btn.textContent = 'Đăng nhập';
      btn.className = 'button primary';
    }
  }

  function createLoginModal(auth, helpers) {
    if (document.getElementById('firebase-login-modal')) return;
    const modal = document.createElement('dialog');
    modal.id = 'firebase-login-modal';
    modal.style.cssText = 'border:1px solid #c5d8ea;border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 12px 32px rgba(0,0,0,0.18);z-index:9999;';
    modal.innerHTML = `
      <form id="fb-login-form" method="dialog" style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:24px;">🔐</span>
          <div>
            <h3 style="margin:0;font-size:16px;color:#102d4a;">TÀI KHOẢN GIÁO VIÊN</h3>
            <p style="margin:2px 0 0;font-size:12px;color:#666;">Dữ liệu câu hỏi & đề thi lưu riêng cho từng thầy/cô</p>
          </div>
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:4px 0;">
        <div id="fb-auth-error" style="color:#c92a2a;background:#fff5f5;padding:8px 12px;border-radius:6px;font-size:12px;display:none;line-height:1.4;"></div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;" for="fb-email">Email giáo viên:</label>
          <input type="email" id="fb-email" required placeholder="thayco@truong.edu.vn" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #c5d8ea;border-radius:6px;">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;" for="fb-password">Mật khẩu:</label>
          <input type="password" id="fb-password" required placeholder="••••••••" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #c5d8ea;border-radius:6px;">
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button type="submit" id="fb-btn-login-submit" class="button primary" style="flex:1;padding:8px;font-weight:600;">Đăng nhập</button>
          <button type="button" id="fb-btn-register-submit" class="button" style="flex:1;padding:8px;font-weight:600;">Tạo tài khoản</button>
        </div>
        <div style="text-align:center;margin-top:4px;">
          <button type="button" id="fb-btn-close-modal" class="button quiet" style="font-size:11px;color:#888;">Đóng (Dùng thử ngoại tuyến)</button>
        </div>
      </form>
    `;
    document.body.appendChild(modal);

    const form = modal.querySelector('#fb-login-form');
    const errBox = modal.querySelector('#fb-auth-error');
    const emailInput = modal.querySelector('#fb-email');
    const passInput = modal.querySelector('#fb-password');

    function friendlyAuthError(err) {
      const code = err.code || '';
      if (code.includes('operation-not-allowed')) {
        return 'Chưa bật tính năng Đăng nhập bằng Email/Password trong Firebase Console. Thầy vui lòng vào Firebase Console > Authentication > Sign-in method > Bật Email/Password.';
      }
      if (code.includes('user-not-found') || code.includes('invalid-credential') || code.includes('wrong-password')) {
        return 'Email hoặc mật khẩu không chính xác. Nếu chưa có tài khoản, vui lòng bấm nút "Tạo tài khoản".';
      }
      if (code.includes('email-already-in-use')) {
        return 'Email này đã được đăng ký. Vui lòng bấm nút "Đăng nhập".';
      }
      if (code.includes('weak-password')) {
        return 'Mật khẩu quá ngắn. Vui lòng đặt mật khẩu từ 6 ký tự trở lên.';
      }
      return 'Lỗi: ' + (err.message || code);
    }

    form.onsubmit = async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      try {
        await helpers.signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
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
        alert('Tạo tài khoản giáo viên thành công! Dữ liệu của Thầy/Cô được khởi tạo riêng biệt.');
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
