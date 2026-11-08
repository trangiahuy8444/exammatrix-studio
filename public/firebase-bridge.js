// public/firebase-bridge.js
// =============================================================================
// CẦU NỐI FIREBASE CHO GITHUB PAGES (AUTH & MULTI-TENANT FIRESTORE)
// =============================================================================

(function() {
  // 1. Kiểm tra cấu hình Firebase
  const config = window.FIREBASE_CONFIG;
  const isConfigured = config && config.apiKey && !config.apiKey.includes('YOUR_API_KEY');

  // Khung chứa trạng thái người dùng
  window.FirebaseState = {
    user: null,
    db: null,
    auth: null,
    isReady: false
  };

  if (!isConfigured) {
    console.info('[Firebase Bridge] Chưa điền cấu hình Firebase thật. Ứng dụng hoạt động theo máy chủ cục bộ hoặc dữ liệu trình duyệt.');
    return;
  }

  // 2. Nạp Firebase SDK từ CDN chính thức của Google
  const firebaseVersion = '10.13.0';
  import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app.js`).then(async ({ initializeApp }) => {
    const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } =
      await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-auth.js`);
    const { getFirestore, doc, getDoc, setDoc, updateDoc } =
      await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-firestore.js`);

    const app = initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app);

    window.FirebaseState.auth = auth;
    window.FirebaseState.db = db;

    // 3. Khởi tạo giao diện Đăng nhập / Người dùng trên thanh tiêu đề
    setupAuthUI(auth, db, {
      signInWithEmailAndPassword,
      createUserWithEmailAndPassword,
      signOut,
      doc,
      getDoc,
      setDoc
    });

    // 4. Lắng nghe trạng thái đăng nhập
    onAuthStateChanged(auth, async (user) => {
      window.FirebaseState.user = user;
      updateUserUI(user);
      if (user) {
        console.log('[Firebase Bridge] Đã đăng nhập giáo viên:', user.email, 'UID:', user.uid);
        await syncUserData(user, db, { doc, getDoc, setDoc });
      } else {
        console.log('[Firebase Bridge] Chưa đăng nhập. Yêu cầu đăng nhập để tải dữ liệu giáo viên.');
        showLoginModal(true);
      }
    });
  }).catch(err => {
    console.warn('[Firebase Bridge] Không tải được Firebase SDK:', err);
  });

  // ===========================================================================
  // GIAO DIỆN XÁC THỰC (AUTH UI)
  // ===========================================================================
  function setupAuthUI(auth, db, helpers) {
    // Chèn container hiển thị tài khoản vào thanh topbar
    const topbarRight = document.querySelector('.topbar > div:last-child');
    if (topbarRight) {
      const authBox = document.createElement('div');
      authBox.id = 'firebase-auth-box';
      authBox.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:8px;padding-left:8px;border-left:1px solid #c5d8ea;font-size:12px;';
      authBox.innerHTML = `
        <span id="fb-user-badge" style="font-weight:600;color:var(--navy,#102d4a);">Đang kết nối Firebase…</span>
        <button id="fb-auth-btn" class="button" type="button" style="padding:4px 8px;font-size:11px;font-weight:600;">Đăng nhập</button>
      `;
      topbarRight.appendChild(authBox);

      const btn = authBox.querySelector('#fb-auth-btn');
      btn.onclick = () => {
        if (window.FirebaseState.user) {
          if (confirm('Thầy/Cô có chắc chắn muốn đăng xuất khỏi tài khoản này?')) {
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
    modal.style.cssText = 'border:1px solid #c5d8ea;border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 12px 32px rgba(0,0,0,0.18);';
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
        <div id="fb-auth-error" style="color:#c92a2a;background:#fff5f5;padding:8px 12px;border-radius:6px;font-size:12px;display:none;"></div>
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

    form.onsubmit = async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      try {
        await helpers.signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
        modal.close();
      } catch (err) {
        errBox.textContent = 'Đăng nhập thất bại: ' + err.message;
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
        errBox.textContent = 'Đăng ký thất bại: ' + err.message;
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

  // ===========================================================================
  // ĐỒNG BỘ DỮ LIỆU ĐỘC LẬP TỪNG GIÁO VIÊN (FIRESTORE)
  // ===========================================================================
  async function syncUserData(user, db, helpers) {
    try {
      const userDocRef = helpers.doc(db, 'workspaces', user.uid);
      const snap = await helpers.getDoc(userDocRef);

      if (snap.exists()) {
        const remoteData = snap.data();
        if (remoteData.bank && window.store) {
          window.store.bank = remoteData.bank;
          window.store.exams = remoteData.exams || [];
          window.store.revisions = remoteData.revisions || [];
          window.store.matrixRecords = remoteData.matrices || [];
          if (typeof window.render === 'function') window.render();
          console.log('[Firebase Bridge] Đã nạp dữ liệu cá nhân của giáo viên từ Cloud Firestore.');
        }
      } else {
        // Tạo không gian làm việc trống ban đầu cho giáo viên mới
        console.log('[Firebase Bridge] Khởi tạo không gian làm việc mới cho giáo viên.');
        const initialWorkspace = {
          owner_email: user.email,
          created_at: new Date().toISOString(),
          bank: window.store?.bank || { questions: [], ppct: {} },
          exams: [],
          revisions: [],
          matrices: []
        };
        await helpers.setDoc(userDocRef, initialWorkspace);
      }
    } catch (e) {
      console.warn('[Firebase Bridge] Lỗi đồng bộ Firestore:', e);
    }
  }
})();
