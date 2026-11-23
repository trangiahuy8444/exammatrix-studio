// public/google-drive-storage.js
// Lưu trữ không gian làm việc ExamMatrix Studio trực tiếp trên Google Drive riêng của từng giáo viên (Drive API v3 + GIS).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.GoogleDriveStorage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file openid email profile';
  const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const DEFAULT_FOLDER_NAME = 'ExamMatrix Studio';
  const DEFAULT_FILE_NAME = 'exammatrix-workspace.json';
  const WORKSPACE_FORMAT = 'exammatrix-drive-workspace';
  const WORKSPACE_VERSION = 1;
  const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

  let _gisLoadPromise = null;

  function escapeDriveQuery(value) {
    return String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
  }

  function isValidWorkspaceData(data) {
    return Boolean(
      data &&
      typeof data === 'object' &&
      data.bank &&
      typeof data.bank === 'object' &&
      Array.isArray(data.bank.questions) &&
      Array.isArray(data.bank.ppct && data.bank.ppct.lessons) &&
      ['exams', 'revisions', 'matrices'].every((key) => Array.isArray(data[key]))
    );
  }

  function unwrapWorkspacePayload(raw) {
    const invalidMsg = 'Dữ liệu trên Google Drive không đúng định dạng ExamMatrix Studio.';
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(invalidMsg);
    }
    if (
      raw.format !== undefined &&
      raw.format !== WORKSPACE_FORMAT &&
      raw.format !== 'exammatrix-offline-backup'
    ) {
      throw new Error(invalidMsg);
    }

    const candidate = (
      raw.format === WORKSPACE_FORMAT ||
      raw.format === 'exammatrix-offline-backup' ||
      (raw.data && typeof raw.data === 'object' && raw.bank === undefined)
    ) ? raw.data : raw;

    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(invalidMsg);
    }

    // Chuẩn hóa nhẹ nếu tệp sao lưu cũ có bank.ppct là mảng bài học hoặc thiếu cleared_grades
    let normalized = candidate;
    if (candidate.bank && typeof candidate.bank === 'object' && Array.isArray(candidate.bank.ppct)) {
      normalized = {
        ...candidate,
        bank: {
          ...candidate.bank,
          ppct: { lessons: candidate.bank.ppct, cleared_grades: [] }
        }
      };
    }

    if (!isValidWorkspaceData(normalized)) {
      throw new Error(invalidMsg);
    }

    const ppct = normalized.bank.ppct;
    const resultData = {
      bank: {
        questions: normalized.bank.questions,
        ppct: {
          ...ppct,
          lessons: ppct.lessons,
          cleared_grades: Array.isArray(ppct.cleared_grades) ? ppct.cleared_grades : []
        },
        competency_catalogs: Array.isArray(normalized.bank.competency_catalogs)
          ? normalized.bank.competency_catalogs
          : []
      },
      exams: normalized.exams,
      revisions: normalized.revisions,
      matrices: normalized.matrices,
      assessment_plans: Array.isArray(normalized.assessment_plans) ? normalized.assessment_plans : [],
      kttx: Array.isArray(normalized.kttx) ? normalized.kttx : []
    };
    if (normalized.profile && typeof normalized.profile === 'object' && !Array.isArray(normalized.profile)) {
      resultData.profile = normalized.profile;
    }
    return {
      data: resultData,
      ownerEmail: typeof raw.owner_email === 'string' ? raw.owner_email : '',
      updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null
    };
  }

  function buildWorkspacePayload(workspaceData, { ownerEmail } = {}) {
    const src = workspaceData && typeof workspaceData === 'object' ? workspaceData : {};
    const bank = src.bank && typeof src.bank === 'object' ? src.bank : {};
    const ppct = bank.ppct && typeof bank.ppct === 'object' ? bank.ppct : {};
    const outData = {
      bank: {
        questions: Array.isArray(bank.questions) ? bank.questions : [],
        ppct: {
          lessons: Array.isArray(ppct.lessons) ? ppct.lessons : [],
          cleared_grades: Array.isArray(ppct.cleared_grades) ? ppct.cleared_grades : []
        },
        competency_catalogs: Array.isArray(bank.competency_catalogs) ? bank.competency_catalogs : []
      },
      exams: Array.isArray(src.exams) ? src.exams : [],
      revisions: Array.isArray(src.revisions) ? src.revisions : [],
      matrices: Array.isArray(src.matrices) ? src.matrices : [],
      assessment_plans: Array.isArray(src.assessment_plans) ? src.assessment_plans : [],
      kttx: Array.isArray(src.kttx) ? src.kttx : []
    };
    if (src.profile && typeof src.profile === 'object' && !Array.isArray(src.profile)) {
      outData.profile = src.profile;
    }
    return {
      format: WORKSPACE_FORMAT,
      version: WORKSPACE_VERSION,
      owner_email: ownerEmail || '',
      updated_at: new Date().toISOString(),
      data: outData
    };
  }

  function buildMultipartBody(metadata, jsonText, boundary) {
    return [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata || {}),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      String(jsonText == null ? '' : jsonText),
      `--${boundary}--`,
      ''
    ].join('\r\n');
  }

  function makeDriveError(status, message, code) {
    const resolvedCode = code || (
      status === 401 ? 'DRIVE_AUTH_EXPIRED'
        : status === 403 ? 'DRIVE_PERMISSION_DENIED'
          : status === 404 ? 'DRIVE_NOT_FOUND'
            : 'DRIVE_REQUEST_FAILED'
    );
    const err = new Error(message);
    err.status = status;
    err.code = resolvedCode;
    return err;
  }

  async function driveFetch(url, { accessToken, fetchImpl, method = 'GET', headers = {}, body, expectJson = true } = {}) {
    if (!accessToken) {
      throw makeDriveError(401, 'Phiên Google Drive chưa đăng nhập hoặc đã hết hạn.', 'DRIVE_AUTH_EXPIRED');
    }
    const doFetch = fetchImpl || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
    if (typeof doFetch !== 'function') {
      throw new Error('Trình duyệt không hỗ trợ fetch để kết nối Google Drive.');
    }

    const resp = await doFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...headers
      },
      body
    });

    const text = await resp.text();
    if (!resp.ok) {
      let detail = '';
      try {
        const parsed = text ? JSON.parse(text) : null;
        detail = parsed?.error?.message || parsed?.error_description || '';
      } catch (e) {
        detail = '';
      }
      if (resp.status === 401) {
        throw makeDriveError(401, 'Phiên đăng nhập Google Drive đã hết hạn. Vui lòng đăng nhập lại.', 'DRIVE_AUTH_EXPIRED');
      }
      if (resp.status === 403) {
        throw makeDriveError(
          403,
          'Không có quyền truy cập tệp trên Google Drive. Vui lòng cấp quyền lưu tệp khi đăng nhập.' + (detail ? ` (${detail})` : ''),
          'DRIVE_PERMISSION_DENIED'
        );
      }
      if (resp.status === 404) {
        throw makeDriveError(404, 'Không tìm thấy tệp hoặc thư mục dữ liệu trên Google Drive.', 'DRIVE_NOT_FOUND');
      }
      throw makeDriveError(
        resp.status,
        `Lỗi kết nối Google Drive (HTTP ${resp.status})${detail ? ': ' + detail : '.'}`
      );
    }

    if (!expectJson) return text;
    try {
      return text ? JSON.parse(text) : {};
    } catch (e) {
      throw new Error('Phản hồi từ Google Drive không đúng định dạng JSON.');
    }
  }

  async function getUserProfile(accessToken, { fetchImpl } = {}) {
    const profile = await driveFetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      accessToken,
      fetchImpl
    });
    if (!profile || !profile.sub || !profile.email) {
      throw new Error('Không lấy được thông tin tài khoản Google (thiếu mã định danh hoặc email).');
    }
    return {
      uid: `gdrive:${profile.sub}`,
      sub: profile.sub,
      email: profile.email,
      displayName: profile.name || profile.email,
      picture: profile.picture || ''
    };
  }

  async function findOrCreateFolder(accessToken, folderName = DEFAULT_FOLDER_NAME, { fetchImpl } = {}) {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${escapeDriveQuery(folderName)}' and trashed=false`;
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=${encodeURIComponent('files(id,name,modifiedTime)')}&orderBy=${encodeURIComponent('modifiedTime desc')}&pageSize=10`;
    const listed = await driveFetch(listUrl, { accessToken, fetchImpl });
    if (Array.isArray(listed.files) && listed.files.length > 0 && listed.files[0].id) {
      return listed.files[0].id;
    }

    const created = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      accessToken,
      fetchImpl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });
    if (!created || !created.id) {
      throw new Error('Không tạo được thư mục ExamMatrix Studio trên Google Drive.');
    }
    return created.id;
  }

  async function findWorkspaceFile(accessToken, folderId, fileName = DEFAULT_FILE_NAME, { fetchImpl } = {}) {
    if (!folderId) return null;
    const q = `'${escapeDriveQuery(folderId)}' in parents and name='${escapeDriveQuery(fileName)}' and trashed=false`;
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=${encodeURIComponent('files(id,name,modifiedTime)')}&orderBy=${encodeURIComponent('modifiedTime desc')}&pageSize=10`;
    const listed = await driveFetch(listUrl, { accessToken, fetchImpl });
    return (Array.isArray(listed.files) && listed.files[0]) || null;
  }

  async function readWorkspace(accessToken, { folderName = DEFAULT_FOLDER_NAME, fileName = DEFAULT_FILE_NAME, fetchImpl } = {}) {
    const folderId = await findOrCreateFolder(accessToken, folderName, { fetchImpl });
    const file = await findWorkspaceFile(accessToken, folderId, fileName, { fetchImpl });
    if (!file || !file.id) {
      return {
        exists: false,
        folderId,
        fileId: null,
        modifiedTime: null,
        ownerEmail: '',
        updatedAt: null,
        data: null
      };
    }

    const rawText = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
      { accessToken, fetchImpl, expectJson: false }
    );

    let rawJson;
    try {
      rawJson = JSON.parse(rawText);
    } catch (e) {
      throw new Error('Tệp dữ liệu trên Google Drive bị hỏng hoặc không phải JSON hợp lệ.');
    }

    const parsed = unwrapWorkspacePayload(rawJson);
    return {
      exists: true,
      folderId,
      fileId: file.id,
      modifiedTime: file.modifiedTime || null,
      ownerEmail: parsed.ownerEmail,
      updatedAt: parsed.updatedAt,
      data: parsed.data
    };
  }

  async function writeWorkspace(accessToken, workspaceData, {
    folderId,
    fileId,
    folderName = DEFAULT_FOLDER_NAME,
    fileName = DEFAULT_FILE_NAME,
    ownerEmail,
    fetchImpl
  } = {}) {
    const payload = buildWorkspacePayload(workspaceData, { ownerEmail });
    const jsonText = JSON.stringify(payload);

    let targetFolderId = folderId || await findOrCreateFolder(accessToken, folderName, { fetchImpl });
    let targetFileId = fileId || null;

    if (!targetFileId) {
      const existing = await findWorkspaceFile(accessToken, targetFolderId, fileName, { fetchImpl });
      if (existing && existing.id) targetFileId = existing.id;
    }

    if (targetFileId) {
      try {
        const updated = await driveFetch(
          `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(targetFileId)}?uploadType=media&fields=id,name,modifiedTime`,
          {
            accessToken,
            fetchImpl,
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: jsonText
          }
        );
        return {
          folderId: targetFolderId,
          fileId: updated.id || targetFileId,
          modifiedTime: updated.modifiedTime || null,
          updatedAt: payload.updated_at
        };
      } catch (err) {
        if (err && (err.status === 404 || err.code === 'DRIVE_NOT_FOUND')) {
          targetFolderId = await findOrCreateFolder(accessToken, folderName, { fetchImpl });
          targetFileId = null;
        } else {
          throw err;
        }
      }
    }

    const boundary = `exammatrix_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    const body = buildMultipartBody(
      { name: fileName, parents: [targetFolderId], mimeType: 'application/json' },
      jsonText,
      boundary
    );
    const created = await driveFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
      {
        accessToken,
        fetchImpl,
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      }
    );
    if (!created || !created.id) {
      throw new Error('Không tạo được tệp dữ liệu trên Google Drive.');
    }
    return {
      folderId: targetFolderId,
      fileId: created.id,
      modifiedTime: created.modifiedTime || null,
      updatedAt: payload.updated_at
    };
  }

  // =========================================================================
  // MODULAR V2 DRIVE HELPERS: Cây thư mục phân tách theo Năm học / Môn / Khối
  // =========================================================================
  async function findOrCreateSubfolder(accessToken, parentId, folderName, { fetchImpl } = {}) {
    if (!parentId) {
      return await findOrCreateFolder(accessToken, folderName, { fetchImpl });
    }
    const q = `mimeType='application/vnd.google-apps.folder' and '${escapeDriveQuery(parentId)}' in parents and name='${escapeDriveQuery(folderName)}' and trashed=false`;
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=${encodeURIComponent('files(id,name,modifiedTime)')}&orderBy=${encodeURIComponent('modifiedTime desc')}&pageSize=10`;
    const listed = await driveFetch(listUrl, { accessToken, fetchImpl });
    if (Array.isArray(listed.files) && listed.files.length > 0 && listed.files[0].id) {
      return listed.files[0].id;
    }
    const created = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      accessToken,
      fetchImpl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });
    if (!created || !created.id) {
      throw new Error(`Không tạo được thư mục "${folderName}" trên Google Drive.`);
    }
    return created.id;
  }

  async function ensureFolderPath(accessToken, segments = [], { fetchImpl, folderCache } = {}) {
    const cleanSegments = (Array.isArray(segments) ? segments : []).map(s => String(s || '').trim()).filter(Boolean);
    if (!cleanSegments.length) {
      throw new Error('Thiếu đường dẫn thư mục Google Drive.');
    }
    let parentId = null;
    let builtPath = '';
    for (let i = 0; i < cleanSegments.length; i++) {
      const seg = cleanSegments[i];
      builtPath = builtPath ? `${builtPath}/${seg}` : seg;
      if (folderCache && typeof folderCache.get === 'function' && folderCache.get(builtPath)) {
        parentId = folderCache.get(builtPath);
        continue;
      }
      parentId = i === 0
        ? await findOrCreateFolder(accessToken, seg, { fetchImpl })
        : await findOrCreateSubfolder(accessToken, parentId, seg, { fetchImpl });
      if (folderCache && typeof folderCache.set === 'function' && parentId) {
        folderCache.set(builtPath, parentId);
      }
    }
    return parentId;
  }

  async function readJsonFileInFolder(accessToken, folderId, fileName, { fetchImpl } = {}) {
    if (!folderId || !fileName) {
      return { exists: false, fileId: null, modifiedTime: null, data: null };
    }
    const file = await findWorkspaceFile(accessToken, folderId, fileName, { fetchImpl });
    if (!file || !file.id) {
      return { exists: false, fileId: null, modifiedTime: null, data: null };
    }
    const rawText = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
      { accessToken, fetchImpl, expectJson: false }
    );
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (e) {
      throw new Error(`Tệp "${fileName}" trên Google Drive bị hỏng hoặc không phải JSON hợp lệ.`);
    }
    return {
      exists: true,
      fileId: file.id,
      modifiedTime: file.modifiedTime || null,
      data
    };
  }

  async function writeJsonFileInFolder(accessToken, folderId, fileName, jsonObj, { fileId, fetchImpl } = {}) {
    if (!folderId || !fileName) {
      throw new Error('Thiếu folderId hoặc tên tệp khi ghi lên Google Drive.');
    }
    const jsonText = JSON.stringify(jsonObj);
    let targetFileId = fileId || null;
    if (!targetFileId) {
      const existing = await findWorkspaceFile(accessToken, folderId, fileName, { fetchImpl });
      if (existing && existing.id) targetFileId = existing.id;
    }
    if (targetFileId) {
      try {
        const updated = await driveFetch(
          `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(targetFileId)}?uploadType=media&fields=id,name,modifiedTime`,
          {
            accessToken,
            fetchImpl,
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: jsonText
          }
        );
        return {
          folderId,
          fileId: updated.id || targetFileId,
          modifiedTime: updated.modifiedTime || null
        };
      } catch (err) {
        if (err && (err.status === 404 || err.code === 'DRIVE_NOT_FOUND')) {
          targetFileId = null;
        } else {
          throw err;
        }
      }
    }
    const boundary = `exammatrix_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    const body = buildMultipartBody(
      { name: fileName, parents: [folderId], mimeType: 'application/json' },
      jsonText,
      boundary
    );
    const created = await driveFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
      {
        accessToken,
        fetchImpl,
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      }
    );
    if (!created || !created.id) {
      throw new Error(`Không tạo được tệp "${fileName}" trên Google Drive.`);
    }
    return {
      folderId,
      fileId: created.id,
      modifiedTime: created.modifiedTime || null
    };
  }

  async function listFolderChildren(accessToken, folderId, { fetchImpl } = {}) {
    if (!folderId) return [];
    const q = `'${escapeDriveQuery(folderId)}' in parents and trashed=false`;
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=${encodeURIComponent('files(id,name,mimeType,modifiedTime)')}&orderBy=${encodeURIComponent('modifiedTime desc')}&pageSize=200`;
    const listed = await driveFetch(listUrl, { accessToken, fetchImpl });
    return Array.isArray(listed.files) ? listed.files : [];
  }

  async function backupJsonToBackupsFolder(accessToken, rootFolderId, backupFileName, jsonObj, { fetchImpl, maxKeep = 10 } = {}) {
    if (!rootFolderId || !backupFileName) {
      throw new Error('Thiếu rootFolderId hoặc tên tệp sao lưu.');
    }
    const backupsId = await findOrCreateSubfolder(accessToken, rootFolderId, '_backups', { fetchImpl });
    const written = await writeJsonFileInFolder(accessToken, backupsId, backupFileName, jsonObj, { fetchImpl });
    if (Number.isInteger(maxKeep) && maxKeep > 0) {
      try {
        const children = await listFolderChildren(accessToken, backupsId, { fetchImpl });
        const jsonFiles = children
          .filter(c => c && c.id && c.mimeType !== 'application/vnd.google-apps.folder')
          .sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
        if (jsonFiles.length > maxKeep) {
          for (const stale of jsonFiles.slice(maxKeep)) {
            await driveFetch(
              `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(stale.id)}`,
              {
                accessToken,
                fetchImpl,
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                body: JSON.stringify({ trashed: true })
              }
            ).catch(() => {});
          }
        }
      } catch (e) {}
    }
    return { ...written, backupsFolderId: backupsId };
  }

  function loadGisScript() {
    const g = typeof globalThis !== 'undefined' ? globalThis : null;
    if (g && g.google && g.google.accounts && g.google.accounts.oauth2) {
      return Promise.resolve(g.google.accounts.oauth2);
    }
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return Promise.reject(new Error('Môi trường hiện tại không hỗ trợ đăng nhập Google trên trình duyệt.'));
    }
    if (_gisLoadPromise) return _gisLoadPromise;

    _gisLoadPromise = new Promise((resolve, reject) => {
      const finishOk = () => {
        if (g && g.google && g.google.accounts && g.google.accounts.oauth2) {
          resolve(g.google.accounts.oauth2);
        } else {
          _gisLoadPromise = null;
          reject(new Error('Không khởi tạo được Google Identity Services.'));
        }
      };
      const finishErr = () => {
        _gisLoadPromise = null;
        reject(new Error('Không tải được thư viện đăng nhập Google. Vui lòng kiểm tra kết nối mạng.'));
      };

      const existing = typeof document.querySelector === 'function'
        ? document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`)
        : null;
      if (existing) {
        if (g && g.google && g.google.accounts && g.google.accounts.oauth2) {
          finishOk();
          return;
        }
        existing.addEventListener('load', finishOk, { once: true });
        existing.addEventListener('error', finishErr, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = finishOk;
      script.onerror = finishErr;
      (document.head || document.body || document.documentElement).appendChild(script);
    });

    return _gisLoadPromise;
  }

  async function requestAccessToken({ clientId, scope = DRIVE_SCOPE, prompt = 'consent', loginHint } = {}) {
    if (!clientId || !String(clientId).trim()) {
      throw new Error('Chưa cấu hình Google OAuth Client ID.');
    }
    const oauth2 = await loadGisScript();
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      const succeed = (val) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };

      const tokenClient = oauth2.initTokenClient({
        client_id: String(clientId).trim(),
        scope,
        callback: (tokenResp) => {
          if (!tokenResp || tokenResp.error) {
            const errCode = tokenResp?.error || '';
            if (errCode === 'access_denied') {
              const e = new Error('Bạn đã từ chối cấp quyền lưu trữ Google Drive.');
              e.code = 'ACCESS_DENIED';
              return fail(e);
            }
            return fail(new Error('Đăng nhập Google không thành công' + (errCode ? `: ${errCode}` : '.')));
          }
          if (!tokenResp.access_token) {
            return fail(new Error('Google không trả về mã truy cập hợp lệ.'));
          }
          if (
            typeof oauth2.hasGrantedAllScopes === 'function' &&
            !oauth2.hasGrantedAllScopes(tokenResp, DRIVE_FILE_SCOPE)
          ) {
            const e = new Error('Ứng dụng cần quyền Google Drive (drive.file) để tạo và lưu dữ liệu riêng của bạn. Vui lòng tích chọn quyền này khi đăng nhập.');
            e.code = 'MISSING_DRIVE_SCOPE';
            return fail(e);
          }
          const expiresIn = Number(tokenResp.expires_in || 3600);
          succeed({
            accessToken: tokenResp.access_token,
            expiresAt: Date.now() + expiresIn * 1000,
            scope: tokenResp.scope || scope
          });
        },
        error_callback: (err) => {
          const type = err?.type || '';
          if (type === 'popup_closed') {
            const e = new Error('Bạn đã đóng cửa sổ đăng nhập Google.');
            e.code = 'POPUP_CLOSED';
            return fail(e);
          }
          if (type === 'popup_failed_to_open') {
            const e = new Error('Trình duyệt chặn cửa sổ bật lên (popup). Vui lòng cho phép popup để đăng nhập Google.');
            e.code = 'POPUP_BLOCKED';
            return fail(e);
          }
          return fail(new Error('Không mở được cửa sổ đăng nhập Google' + (type ? ` (${type})` : '.')));
        }
      });

      const reqOpts = {};
      if (prompt !== undefined && prompt !== null) reqOpts.prompt = prompt;
      if (loginHint) reqOpts.hint = loginHint;
      tokenClient.requestAccessToken(reqOpts);
    });
  }

  function revokeAccessToken(accessToken) {
    const g = typeof globalThis !== 'undefined' ? globalThis : null;
    if (accessToken && g && g.google && g.google.accounts && g.google.accounts.oauth2 && typeof g.google.accounts.oauth2.revoke === 'function') {
      return new Promise((resolve) => {
        try {
          g.google.accounts.oauth2.revoke(accessToken, () => resolve());
        } catch (e) {
          resolve();
        }
      });
    }
    return Promise.resolve();
  }

  return {
    DRIVE_SCOPE,
    DRIVE_FILE_SCOPE,
    DEFAULT_FOLDER_NAME,
    DEFAULT_FILE_NAME,
    WORKSPACE_FORMAT,
    WORKSPACE_VERSION,
    escapeDriveQuery,
    isValidWorkspaceData,
    unwrapWorkspacePayload,
    buildWorkspacePayload,
    buildMultipartBody,
    makeDriveError,
    getUserProfile,
    findOrCreateFolder,
    findOrCreateSubfolder,
    ensureFolderPath,
    findWorkspaceFile,
    listFolderChildren,
    readJsonFileInFolder,
    writeJsonFileInFolder,
    backupJsonToBackupsFolder,
    readWorkspace,
    writeWorkspace,
    loadGisScript,
    requestAccessToken,
    revokeAccessToken
  };
});
