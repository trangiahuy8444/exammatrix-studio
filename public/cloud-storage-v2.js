// public/cloud-storage-v2.js
// Kiến trúc lưu trữ Đám mây phân mảnh theo Năm học -> Môn học -> Khối lớp (Cloud-First v2)
// Hỗ trợ song song Firebase Firestore (Primary Cloud DB) và Google Drive (Thư mục phân khối)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.CloudStorageV2 = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 2;
  const DEFAULT_SCHOOL_YEAR = '2026-2027';
  const DEFAULT_ACTIVE_GRADES = [8, 9, 10];
  const DEFAULT_SUBJECT = 'Tin học';
  const MAX_QUESTIONS_PER_CHUNK = 100;
  const ALL_GRADES = [6, 7, 8, 9, 10, 11, 12];
  const MODULE_NAMES = ['ppct', 'assessment_plans', 'kttx', 'questions', 'matrices', 'revisions', 'exams'];

  const clone = (v) => JSON.parse(JSON.stringify(v));

  function stripVietnamese(text) {
    return String(text == null ? '' : text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  function subjectSlug(name) {
    const clean = stripVietnamese(name || DEFAULT_SUBJECT)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return clean || 'tin-hoc';
  }

  function subjectDriveFolder(name) {
    const clean = stripVietnamese(name || DEFAULT_SUBJECT)
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return clean || 'Tin_hoc';
  }

  function sanitizeDocId(raw) {
    const clean = String(raw == null ? '' : raw)
      .trim()
      .replace(/[\/\s]+/g, '_')
      .replace(/[^A-Za-z0-9_.\-:]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
    if (!clean || clean === '.' || clean === '..') return 'OTHER';
    return clean;
  }

  function scopeKeyFor(schoolYear, subjectName) {
    const sy = sanitizeDocId(schoolYear || DEFAULT_SCHOOL_YEAR) || DEFAULT_SCHOOL_YEAR;
    return `${sy}__${subjectSlug(subjectName || DEFAULT_SUBJECT)}`;
  }

  function normalizeGradesList(input) {
    const arr = Array.isArray(input) ? input : DEFAULT_ACTIVE_GRADES;
    const valid = [...new Set(arr.map(x => Number(x)).filter(g => ALL_GRADES.includes(g)))].sort((a, b) => a - b);
    return valid.length ? valid : [...DEFAULT_ACTIVE_GRADES];
  }

  function normalizeProfile(profile = {}) {
    const p = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
    const activeGrades = normalizeGradesList(p.active_grades);
    let activeGrade = p.active_grade;
    if (activeGrade === 'all') {
      activeGrade = 'all';
    } else {
      const gNum = Number(activeGrade);
      activeGrade = ALL_GRADES.includes(gNum) ? gNum : activeGrades[0];
    }
    const activeSubject = String(p.active_subject || DEFAULT_SUBJECT).trim() || DEFAULT_SUBJECT;
    const schoolYear = String(p.school_year || DEFAULT_SCHOOL_YEAR).trim() || DEFAULT_SCHOOL_YEAR;
    return {
      schema_version: SCHEMA_VERSION,
      school_year: schoolYear,
      active_grades: activeGrades,
      active_grade: activeGrade,
      active_subject: activeSubject,
      // Ngưỡng của tổ cho kho luật kiểm định (Bản đồ tri thức): tỉ lệ đề cương 90–100%, thời gian kiểm tra định kì.
      ...(p.rule_config && typeof p.rule_config === 'object' ? { rule_config: {
        de_cuong_min_percent: Math.max(90, Math.min(100, Math.round(Number(p.rule_config.de_cuong_min_percent)) || 90)),
        thoi_gian_dinh_ki_phut: Math.max(15, Math.min(180, Math.round(Number(p.rule_config.thoi_gian_dinh_ki_phut)) || 45))
      } } : {}),
      updated_at: String(p.updated_at || new Date().toISOString())
    };
  }

  function isShrinkAllowedAction(path, body) {
    const cleanPath = String(path || '').split('?')[0];
    const allowedExact = new Set([
      '/api/bank/delete-question',
      '/api/questions/delete',
      '/api/ppct/clear-grade',
      '/api/ppct/delete-lesson',
      '/api/matrices/delete',
      '/api/exams/delete',
      '/api/revisions/delete',
      '/api/assessment-plans/delete',
      '/api/kttx/delete',
      'replaceWorkspaceData'
    ]);
    if (allowedExact.has(cleanPath)) return true;
    if (/^\/api\/(questions|matrices|exams|revisions|assessment-plans|kttx)\/[^/]+\/delete$/.test(cleanPath)) return true;
    if (cleanPath === '/api/questions/bulk' && ['delete', 'grade'].includes(body?.action)) return true;
    if (cleanPath === '/api/bank/import' && (!body || body.mode !== 'append')) return true;
    return false;
  }

  function canonicalStringify(value) {
    if (value === null || value === undefined) return JSON.stringify(value);
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(item => (item === undefined ? 'null' : canonicalStringify(item))).join(',') + ']';
    }
    const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
  }

  function chunkQuestionsByLesson(questions, maxPerChunk = MAX_QUESTIONS_PER_CHUNK, { grade, subject_name } = {}) {
    const list = Array.isArray(questions) ? questions : [];
    const perChunk = Math.max(1, Number(maxPerChunk) || MAX_QUESTIONS_PER_CHUNK);
    const byLesson = new Map();
    for (const q of list) {
      if (!q || typeof q !== 'object') continue;
      const lessonCode = String(q.lesson_code || 'OTHER').trim() || 'OTHER';
      const lessonKey = sanitizeDocId(lessonCode);
      if (!byLesson.has(lessonKey)) {
        byLesson.set(lessonKey, { lesson_code: lessonCode, items: [] });
      }
      byLesson.get(lessonKey).items.push(clone(q));
    }
    const chunks = {};
    const sortedKeys = [...byLesson.keys()].sort();
    for (const lessonKey of sortedKeys) {
      const group = byLesson.get(lessonKey);
      group.items.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
      for (let i = 0; i < group.items.length; i += perChunk) {
        const partIndex = Math.floor(i / perChunk);
        const chunkId = `${lessonKey}__p${partIndex}`;
        chunks[chunkId] = {
          chunk_id: chunkId,
          lesson_code: group.lesson_code,
          grade: Number(grade) || 8,
          subject_name: subject_name || DEFAULT_SUBJECT,
          questions: group.items.slice(i, i + perChunk)
        };
      }
    }
    return chunks;
  }

  function createEmptyGradeSlice(grade, subjectName) {
    return {
      grade: Number(grade),
      ppct: {
        grade: Number(grade),
        subject_name: subjectName || DEFAULT_SUBJECT,
        cleared: false,
        lessons: []
      },
      assessment_plans: [],
      kttx: [],
      questions: [],
      question_chunks: {},
      matrices: {},
      revisions: {},
      exams: {}
    };
  }

  function ensureScopeAndGrade(scopes, schoolYear, subjectName, gradeNum) {
    const subj = String(subjectName || DEFAULT_SUBJECT).trim() || DEFAULT_SUBJECT;
    const key = scopeKeyFor(schoolYear, subj);
    if (!scopes[key]) {
      scopes[key] = {
        scopeKey: key,
        school_year: schoolYear || DEFAULT_SCHOOL_YEAR,
        subject_name: subj,
        subject_folder: subjectDriveFolder(subj),
        competency_catalog: null,
        grades: {}
      };
    }
    if (gradeNum !== undefined && gradeNum !== null && Number.isFinite(Number(gradeNum)) && Number(gradeNum) > 0) {
      const gStr = String(Number(gradeNum));
      if (!scopes[key].grades[gStr]) {
        scopes[key].grades[gStr] = createEmptyGradeSlice(Number(gradeNum), subj);
      }
      return { scope: scopes[key], gradeSlice: scopes[key].grades[gStr] };
    }
    return { scope: scopes[key], gradeSlice: null };
  }

  function splitWorkspaceIntoSlices(workspaceData = {}, { schoolYear } = {}) {
    const raw = workspaceData && typeof workspaceData === 'object' ? workspaceData : {};
    const profile = normalizeProfile({
      ...(raw.profile || {}),
      ...(schoolYear ? { school_year: schoolYear } : {})
    });
    const sy = profile.school_year || DEFAULT_SCHOOL_YEAR;
    const scopes = {};
    const bank = raw.bank && typeof raw.bank === 'object' ? raw.bank : {};

    // 1. Danh mục năng lực theo môn
    const catalogs = Array.isArray(bank.competency_catalogs) ? bank.competency_catalogs : [];
    for (const cat of catalogs) {
      if (!cat || typeof cat !== 'object') continue;
      const subj = cat.subject_name || DEFAULT_SUBJECT;
      const { scope } = ensureScopeAndGrade(scopes, sy, subj);
      scope.competency_catalog = clone(cat);
    }

    // 2. PPCT cleared_grades
    const clearedGrades = Array.isArray(bank.ppct?.cleared_grades) ? bank.ppct.cleared_grades : [];
    for (const entry of clearedGrades) {
      let subj = DEFAULT_SUBJECT;
      let gNum = Number(entry);
      if (typeof entry === 'string' && entry.includes(':')) {
        const idx = entry.lastIndexOf(':');
        subj = entry.slice(0, idx).trim() || DEFAULT_SUBJECT;
        gNum = Number(entry.slice(idx + 1));
      }
      if (Number.isFinite(gNum) && gNum > 0) {
        const { gradeSlice } = ensureScopeAndGrade(scopes, sy, subj, gNum);
        gradeSlice.ppct.cleared = true;
      }
    }

    // 3. PPCT lessons
    const ppctLessons = Array.isArray(bank.ppct?.lessons) ? bank.ppct.lessons : [];
    for (const lesson of ppctLessons) {
      if (!lesson || typeof lesson !== 'object') continue;
      const subj = lesson.subject_name || DEFAULT_SUBJECT;
      const gNum = Number(lesson.grade) || 8;
      const { gradeSlice } = ensureScopeAndGrade(scopes, sy, subj, gNum);
      gradeSlice.ppct.lessons.push(clone(lesson));
    }

    // 4. Câu hỏi ngân hàng
    const questions = Array.isArray(bank.questions) ? bank.questions : [];
    for (const q of questions) {
      if (!q || typeof q !== 'object') continue;
      const subj = q.subject_name || DEFAULT_SUBJECT;
      const gNum = Number(q.grade) || 8;
      const { gradeSlice } = ensureScopeAndGrade(scopes, sy, subj, gNum);
      gradeSlice.questions.push(clone(q));
    }

    // 5. Kế hoạch KTĐG (assessment_plans)
    const plans = Array.isArray(raw.assessment_plans) ? raw.assessment_plans : [];
    for (const plan of plans) {
      if (!plan || typeof plan !== 'object') continue;
      const subj = plan.subject_name || DEFAULT_SUBJECT;
      const gNum = Number(plan.grade) || 8;
      const { gradeSlice } = ensureScopeAndGrade(scopes, sy, subj, gNum);
      gradeSlice.assessment_plans.push(clone(plan));
    }

    // 6. KTTX
    const kttxList = Array.isArray(raw.kttx) ? raw.kttx : [];
    for (const item of kttxList) {
      if (!item || typeof item !== 'object') continue;
      const subj = item.subject_name || DEFAULT_SUBJECT;
      const gNum = Number(item.grade) || 8;
      const { gradeSlice } = ensureScopeAndGrade(scopes, sy, subj, gNum);
      gradeSlice.kttx.push(clone(item));
    }

    // 7. Ma trận (matrices)
    const matrices = Array.isArray(raw.matrices) ? raw.matrices : [];
    matrices.forEach((m, idx) => {
      if (!m || typeof m !== 'object') return;
      const subj = m.subject_name || DEFAULT_SUBJECT;
      const gNum = Number(m.grade) || 8;
      const { gradeSlice } = ensureScopeAndGrade(scopes, sy, subj, gNum);
      const docId = sanitizeDocId(m.id || `MX_${idx}`);
      gradeSlice.matrices[docId] = clone(m);
    });

    // 8. Đề cương (revisions)
    const revisions = Array.isArray(raw.revisions) ? raw.revisions : [];
    revisions.forEach((r, idx) => {
      if (!r || typeof r !== 'object') return;
      const subj = r.subject_name || DEFAULT_SUBJECT;
      const gNum = Number(r.grade) || 8;
      const { gradeSlice } = ensureScopeAndGrade(scopes, sy, subj, gNum);
      const docId = sanitizeDocId(r.id || `REV_${idx}`);
      gradeSlice.revisions[docId] = clone(r);
    });

    // 9. Đề kiểm tra (exams)
    const exams = Array.isArray(raw.exams) ? raw.exams : [];
    exams.forEach((ex, idx) => {
      if (!ex || typeof ex !== 'object') return;
      const subj = ex.subject_name || DEFAULT_SUBJECT;
      const gNum = Number(ex.grade) || 8;
      const { gradeSlice } = ensureScopeAndGrade(scopes, sy, subj, gNum);
      const docId = sanitizeDocId(ex.id || `EX_${idx}`);
      gradeSlice.exams[docId] = clone(ex);
    });

    // Sắp xếp ổn định và phân mảnh question_chunks cho từng Khối
    for (const scope of Object.values(scopes)) {
      for (const gradeSlice of Object.values(scope.grades)) {
        gradeSlice.ppct.lessons.sort((a, b) => String(a.lesson_code || '').localeCompare(String(b.lesson_code || '')));
        gradeSlice.questions.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
        gradeSlice.assessment_plans.sort((a, b) => String(a.id || a.name || '').localeCompare(String(b.id || b.name || '')));
        gradeSlice.kttx.sort((a, b) => String(a.id || a.code || '').localeCompare(String(b.id || b.code || '')));
        gradeSlice.question_chunks = chunkQuestionsByLesson(gradeSlice.questions, MAX_QUESTIONS_PER_CHUNK, {
          grade: gradeSlice.grade,
          subject_name: scope.subject_name
        });
      }
    }

    return { profile, scopes };
  }

  function assembleWorkspaceFromSlices(slices = {}) {
    const src = slices && typeof slices === 'object' ? slices : {};
    const profile = normalizeProfile(src.profile || {});
    const scopes = src.scopes && typeof src.scopes === 'object' ? src.scopes : {};
    const questions = [];
    const lessons = [];
    const clearedGrades = [];
    const clearedSet = new Set();
    const competencyCatalogs = [];
    const exams = [];
    const revisions = [];
    const matrices = [];
    const assessmentPlans = [];
    const kttx = [];

    const scopeKeys = Object.keys(scopes).sort();
    for (const scopeKey of scopeKeys) {
      const scope = scopes[scopeKey];
      if (!scope || typeof scope !== 'object') continue;
      if (scope.competency_catalog && typeof scope.competency_catalog === 'object') {
        competencyCatalogs.push(clone(scope.competency_catalog));
      }
      const gradeKeys = Object.keys(scope.grades || {}).sort((a, b) => Number(a) - Number(b));
      for (const gKey of gradeKeys) {
        const gSlice = scope.grades[gKey];
        if (!gSlice || typeof gSlice !== 'object') continue;
        const gNum = Number(gSlice.grade || gKey);
        const subj = scope.subject_name || gSlice.ppct?.subject_name || DEFAULT_SUBJECT;

        if (gSlice.ppct?.cleared) {
          if (subj === DEFAULT_SUBJECT && !clearedSet.has(String(gNum))) {
            clearedSet.add(String(gNum));
            clearedGrades.push(gNum);
          }
          const scopedKey = `${subj}:${gNum}`;
          if (!clearedSet.has(scopedKey)) {
            clearedSet.add(scopedKey);
            clearedGrades.push(scopedKey);
          }
        }
        for (const l of (Array.isArray(gSlice.ppct?.lessons) ? gSlice.ppct.lessons : [])) {
          lessons.push(clone(l));
        }

        // Ưu tiên hợp nhất từ question_chunks nếu có, fallback gSlice.questions
        const chunkKeys = Object.keys(gSlice.question_chunks || {}).sort();
        if (chunkKeys.length > 0) {
          const seenQ = new Set();
          for (const ck of chunkKeys) {
            const chunk = gSlice.question_chunks[ck];
            for (const q of (Array.isArray(chunk?.questions) ? chunk.questions : [])) {
              const qKey = q.id || canonicalStringify(q);
              if (!seenQ.has(qKey)) {
                seenQ.add(qKey);
                questions.push(clone(q));
              }
            }
          }
        } else {
          for (const q of (Array.isArray(gSlice.questions) ? gSlice.questions : [])) {
            questions.push(clone(q));
          }
        }

        for (const ap of (Array.isArray(gSlice.assessment_plans) ? gSlice.assessment_plans : [])) {
          assessmentPlans.push(clone(ap));
        }
        for (const kt of (Array.isArray(gSlice.kttx) ? gSlice.kttx : [])) {
          kttx.push(clone(kt));
        }
        for (const mId of Object.keys(gSlice.matrices || {}).sort()) {
          if (gSlice.matrices[mId]) matrices.push(clone(gSlice.matrices[mId]));
        }
        for (const rId of Object.keys(gSlice.revisions || {}).sort()) {
          if (gSlice.revisions[rId]) revisions.push(clone(gSlice.revisions[rId]));
        }
        for (const eId of Object.keys(gSlice.exams || {}).sort()) {
          if (gSlice.exams[eId]) exams.push(clone(gSlice.exams[eId]));
        }
      }
    }

    return {
      bank: {
        questions,
        ppct: {
          lessons,
          cleared_grades: clearedGrades
        },
        competency_catalogs: competencyCatalogs
      },
      exams,
      revisions,
      matrices,
      assessment_plans: assessmentPlans,
      kttx,
      profile
    };
  }

  function buildScopesIndex(slices = {}) {
    const scopes = slices.scopes || {};
    return Object.keys(scopes).sort().map(scopeKey => {
      const sc = scopes[scopeKey];
      const gradeNums = Object.keys(sc.grades || {})
        .map(g => Number(g))
        .filter(g => Number.isFinite(g) && g > 0)
        .sort((a, b) => a - b);
      return {
        scopeKey: sc.scopeKey,
        school_year: sc.school_year,
        subject_name: sc.subject_name,
        subject_folder: sc.subject_folder,
        has_catalog: Boolean(sc.competency_catalog),
        grades: gradeNums
      };
    });
  }

  function buildDriveFilePayload(scope, gradeSlice, modName, updatedAt) {
    const grade = gradeSlice.grade;
    const subj = scope.subject_name;
    if (modName === 'ppct') {
      return {
        schema_version: SCHEMA_VERSION,
        grade,
        subject_name: subj,
        updated_at: updatedAt,
        cleared: Boolean(gradeSlice.ppct?.cleared),
        lessons: gradeSlice.ppct?.lessons || []
      };
    }
    if (modName === 'assessment_plans') {
      return {
        schema_version: SCHEMA_VERSION,
        grade,
        subject_name: subj,
        updated_at: updatedAt,
        assessment_plans: gradeSlice.assessment_plans || []
      };
    }
    if (modName === 'kttx') {
      return {
        schema_version: SCHEMA_VERSION,
        grade,
        subject_name: subj,
        updated_at: updatedAt,
        kttx: gradeSlice.kttx || []
      };
    }
    if (modName === 'questions') {
      return {
        schema_version: SCHEMA_VERSION,
        grade,
        subject_name: subj,
        updated_at: updatedAt,
        questions: gradeSlice.questions || []
      };
    }
    if (modName === 'matrices') {
      return {
        schema_version: SCHEMA_VERSION,
        grade,
        subject_name: subj,
        updated_at: updatedAt,
        matrices: Object.keys(gradeSlice.matrices || {}).sort().map(k => gradeSlice.matrices[k])
      };
    }
    if (modName === 'revisions') {
      return {
        schema_version: SCHEMA_VERSION,
        grade,
        subject_name: subj,
        updated_at: updatedAt,
        revisions: Object.keys(gradeSlice.revisions || {}).sort().map(k => gradeSlice.revisions[k])
      };
    }
    if (modName === 'exams') {
      return {
        schema_version: SCHEMA_VERSION,
        grade,
        subject_name: subj,
        updated_at: updatedAt,
        exams: Object.keys(gradeSlice.exams || {}).sort().map(k => gradeSlice.exams[k])
      };
    }
    return null;
  }

  function diffSlices(beforeSlices = {}, afterSlices = {}, uid = 'offline') {
    const before = beforeSlices && typeof beforeSlices === 'object' ? beforeSlices : { profile: {}, scopes: {} };
    const after = afterSlices && typeof afterSlices === 'object' ? afterSlices : { profile: {}, scopes: {} };
    const bScopes = before.scopes || {};
    const aScopes = after.scopes || {};

    const stripTs = (p) => {
      if (!p) return null;
      const cp = clone(p);
      delete cp.updated_at;
      return cp;
    };
    const beforeIndex = buildScopesIndex(before);
    const afterIndex = buildScopesIndex(after);
    const profileChanged = canonicalStringify(stripTs(before.profile)) !== canonicalStringify(stripTs(after.profile))
      || canonicalStringify(beforeIndex) !== canonicalStringify(afterIndex);

    const firestoreOps = [];
    const driveFiles = [];
    const dirtyDriveKeys = new Set();
    const nowIso = new Date().toISOString();

    const addDriveFile = (scope, gradeSlice, modName, customFileName) => {
      const gKey = gradeSlice ? String(gradeSlice.grade) : 'shared';
      const dKey = `${scope.scopeKey}|${gKey}|${modName}`;
      if (dirtyDriveKeys.has(dKey)) return;
      dirtyDriveKeys.add(dKey);
      if (modName === 'competency_catalog') {
        driveFiles.push({
          scopeKey: scope.scopeKey,
          school_year: scope.school_year,
          subject_name: scope.subject_name,
          subject_folder: scope.subject_folder,
          grade: null,
          module: 'competency_catalog',
          fileName: 'competency_catalog.json',
          payload: {
            schema_version: SCHEMA_VERSION,
            scopeKey: scope.scopeKey,
            school_year: scope.school_year,
            subject_name: scope.subject_name,
            updated_at: nowIso,
            catalog: scope.competency_catalog || null
          }
        });
        return;
      }
      driveFiles.push({
        scopeKey: scope.scopeKey,
        school_year: scope.school_year,
        subject_name: scope.subject_name,
        subject_folder: scope.subject_folder,
        grade: gradeSlice.grade,
        module: modName,
        fileName: customFileName || `${modName}.json`,
        payload: buildDriveFilePayload(scope, gradeSlice, modName, nowIso)
      });
    };

    const allScopeKeys = [...new Set([...Object.keys(bScopes), ...Object.keys(aScopes)])].sort();
    for (const scopeKey of allScopeKeys) {
      const bSc = bScopes[scopeKey];
      const aSc = aScopes[scopeKey];
      const refScope = aSc || bSc;

      // Shared competency catalog
      const bCat = bSc?.competency_catalog || null;
      const aCat = aSc?.competency_catalog || null;
      if (canonicalStringify(bCat) !== canonicalStringify(aCat)) {
        const pathSegments = ['workspaces', uid, 'scopes', scopeKey, 'shared', 'competency_catalog'];
        if (aCat) {
          firestoreOps.push({
            op: 'set',
            pathSegments,
            data: { ...clone(aCat), updated_at: nowIso },
            scopeKey,
            grade: null,
            module: 'competency_catalog',
            docId: 'competency_catalog'
          });
        } else {
          firestoreOps.push({
            op: 'delete',
            pathSegments,
            scopeKey,
            grade: null,
            module: 'competency_catalog',
            docId: 'competency_catalog'
          });
        }
        addDriveFile(aSc || bSc, null, 'competency_catalog');
      }

      const bGrades = bSc?.grades || {};
      const aGrades = aSc?.grades || {};
      const allGradeKeys = [...new Set([...Object.keys(bGrades), ...Object.keys(aGrades)])].sort((x, y) => Number(x) - Number(y));

      for (const gKey of allGradeKeys) {
        const bG = bGrades[gKey] || createEmptyGradeSlice(Number(gKey), refScope.subject_name);
        const aG = aGrades[gKey] || createEmptyGradeSlice(Number(gKey), refScope.subject_name);

        // 1. Single-document modules (ppct, assessment_plans, kttx)
        const singleModules = [
          {
            name: 'ppct',
            bVal: bG.ppct,
            aVal: aG.ppct,
            hasData: (v) => Boolean(v && ((v.lessons && v.lessons.length > 0) || v.cleared))
          },
          {
            name: 'assessment_plans',
            bVal: { grade: Number(gKey), subject_name: refScope.subject_name, assessment_plans: bG.assessment_plans || [] },
            aVal: { grade: Number(gKey), subject_name: refScope.subject_name, assessment_plans: aG.assessment_plans || [] },
            hasData: (v) => Boolean(v && v.assessment_plans && v.assessment_plans.length > 0)
          },
          {
            name: 'kttx',
            bVal: { grade: Number(gKey), subject_name: refScope.subject_name, kttx: bG.kttx || [] },
            aVal: { grade: Number(gKey), subject_name: refScope.subject_name, kttx: aG.kttx || [] },
            hasData: (v) => Boolean(v && v.kttx && v.kttx.length > 0)
          }
        ];

        for (const mod of singleModules) {
          if (canonicalStringify(mod.bVal) !== canonicalStringify(mod.aVal)) {
            const pathSegments = ['workspaces', uid, 'scopes', scopeKey, 'grades', gKey, 'modules', mod.name];
            if (mod.hasData(mod.aVal)) {
              firestoreOps.push({
                op: 'set',
                pathSegments,
                data: { ...clone(mod.aVal), updated_at: nowIso },
                scopeKey,
                grade: Number(gKey),
                module: mod.name,
                docId: mod.name
              });
            } else {
              firestoreOps.push({
                op: 'delete',
                pathSegments,
                scopeKey,
                grade: Number(gKey),
                module: mod.name,
                docId: mod.name
              });
            }
            addDriveFile(refScope, aG, mod.name);
          }
        }

        // 2. Question chunks
        const bChunks = bG.question_chunks || {};
        const aChunks = aG.question_chunks || {};
        const allChunkIds = [...new Set([...Object.keys(bChunks), ...Object.keys(aChunks)])].sort();
        let questionsDirtyForDrive = false;
        for (const cId of allChunkIds) {
          if (canonicalStringify(bChunks[cId] || null) !== canonicalStringify(aChunks[cId] || null)) {
            const pathSegments = ['workspaces', uid, 'scopes', scopeKey, 'grades', gKey, 'question_chunks', cId];
            if (aChunks[cId]) {
              firestoreOps.push({
                op: 'set',
                pathSegments,
                data: { ...clone(aChunks[cId]), updated_at: nowIso },
                scopeKey,
                grade: Number(gKey),
                module: 'questions',
                docId: cId
              });
            } else {
              firestoreOps.push({
                op: 'delete',
                pathSegments,
                scopeKey,
                grade: Number(gKey),
                module: 'questions',
                docId: cId
              });
            }
            questionsDirtyForDrive = true;
          }
        }
        if (questionsDirtyForDrive) {
          addDriveFile(refScope, aG, 'questions');
        }

        // 3. Collection-based modules: matrices, revisions, exams
        for (const colName of ['matrices', 'revisions', 'exams']) {
          const bMap = bG[colName] || {};
          const aMap = aG[colName] || {};
          const allIds = [...new Set([...Object.keys(bMap), ...Object.keys(aMap)])].sort();
          let colDirtyForDrive = false;
          for (const docId of allIds) {
            if (canonicalStringify(bMap[docId] || null) !== canonicalStringify(aMap[docId] || null)) {
              const pathSegments = ['workspaces', uid, 'scopes', scopeKey, 'grades', gKey, colName, docId];
              if (aMap[docId]) {
                firestoreOps.push({
                  op: 'set',
                  pathSegments,
                  data: clone(aMap[docId]),
                  scopeKey,
                  grade: Number(gKey),
                  module: colName,
                  docId
                });
              } else {
                firestoreOps.push({
                  op: 'delete',
                  pathSegments,
                  scopeKey,
                  grade: Number(gKey),
                  module: colName,
                  docId
                });
              }
              colDirtyForDrive = true;
            }
          }
          if (colDirtyForDrive) {
            addDriveFile(refScope, aG, colName);
          }
        }
      }
    }

    return {
      profileChanged,
      scopesIndex: afterIndex,
      firestoreOps,
      driveFiles
    };
  }

  function checkAntiWipe(beforeSlices = {}, afterSlices = {}, mutationMeta = {}) {
    if (mutationMeta && mutationMeta.allowShrink === true) {
      return { ok: true, blocked: [] };
    }
    const cleanPath = String(mutationMeta?.path || '').split('?')[0];
    const isSingleItemUpdate = ['/api/questions/save', '/api/bank/save-question', '/api/matrices/save', '/api/revisions/update'].includes(cleanPath);
    const bScopes = (beforeSlices && beforeSlices.scopes) || {};
    const aScopes = (afterSlices && afterSlices.scopes) || {};
    const blocked = [];

    const scopeTotalForModule = (sc, mod) => {
      if (!sc || !sc.grades) return 0;
      let total = 0;
      for (const gSlice of Object.values(sc.grades)) {
        if (mod === 'questions') total += (gSlice.questions || []).length;
        else if (mod === 'ppct') total += (gSlice.ppct?.lessons || []).length;
        else if (mod === 'assessment_plans') total += (gSlice.assessment_plans || []).length;
        else if (mod === 'kttx') total += (gSlice.kttx || []).length;
        else if (mod === 'matrices') total += Object.keys(gSlice.matrices || {}).length;
        else if (mod === 'revisions') total += Object.keys(gSlice.revisions || {}).length;
        else if (mod === 'exams') total += Object.keys(gSlice.exams || {}).length;
      }
      return total;
    };

    for (const [scopeKey, bSc] of Object.entries(bScopes)) {
      const aSc = aScopes[scopeKey];
      for (const [gKey, bG] of Object.entries(bSc.grades || {})) {
        const aG = aSc?.grades?.[gKey] || createEmptyGradeSlice(Number(gKey), bSc.subject_name);
        const checks = [
          { mod: 'questions', label: 'Ngân hàng câu hỏi', beforeCount: (bG.questions || []).length, afterCount: (aG.questions || []).length },
          { mod: 'ppct', label: 'PPCT', beforeCount: (bG.ppct?.lessons || []).length, afterCount: (aG.ppct?.lessons || []).length },
          { mod: 'assessment_plans', label: 'Kế hoạch KTĐG', beforeCount: (bG.assessment_plans || []).length, afterCount: (aG.assessment_plans || []).length },
          { mod: 'kttx', label: 'KTTX', beforeCount: (bG.kttx || []).length, afterCount: (aG.kttx || []).length },
          { mod: 'matrices', label: 'Ma trận & đặc tả', beforeCount: Object.keys(bG.matrices || {}).length, afterCount: Object.keys(aG.matrices || {}).length },
          { mod: 'revisions', label: 'Đề cương ôn tập', beforeCount: Object.keys(bG.revisions || {}).length, afterCount: Object.keys(aG.revisions || {}).length },
          { mod: 'exams', label: 'Đề kiểm tra', beforeCount: Object.keys(bG.exams || {}).length, afterCount: Object.keys(aG.exams || {}).length }
        ];
        for (const c of checks) {
          if (c.beforeCount > 0 && c.afterCount === 0) {
            if (isSingleItemUpdate && scopeTotalForModule(aSc, c.mod) >= scopeTotalForModule(bSc, c.mod)) {
              continue;
            }
            blocked.push({
              scopeKey,
              subject_name: bSc.subject_name,
              grade: Number(gKey),
              module: c.mod,
              label: c.label,
              beforeCount: c.beforeCount
            });
          }
        }
      }
    }

    if (blocked.length > 0) {
      const summary = blocked.slice(0, 3).map(b => `${b.label} (${b.subject_name} Khối ${b.grade}: ${b.beforeCount} → 0)`).join(', ');
      return {
        ok: false,
        blocked,
        message: `Hệ thống đã chặn thao tác ghi đè rỗng để bảo vệ dữ liệu trên Đám mây (${summary}). Nếu Thầy/Cô thật sự muốn xóa, hãy dùng nút Xóa chính thức trong mục đó.`
      };
    }
    return { ok: true, blocked: [] };
  }

  // =========================================================================
  // FIRESTORE V2 ADAPTER
  // =========================================================================
  async function readFirestoreCollection(db, helpers, pathSegments) {
    if (!helpers || typeof helpers.collection !== 'function' || typeof helpers.getDocs !== 'function') {
      return [];
    }
    try {
      const colRef = helpers.collection(db, ...pathSegments);
      const snap = await helpers.getDocs(colRef);
      const items = [];
      if (snap && typeof snap.forEach === 'function') {
        snap.forEach(docSnap => {
          items.push({ id: docSnap.id, data: typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data });
        });
      } else if (snap && Array.isArray(snap.docs)) {
        for (const docSnap of snap.docs) {
          items.push({ id: docSnap.id, data: typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data });
        }
      }
      return items;
    } catch (e) {
      return [];
    }
  }

  async function firestoreReadWorkspaceV2(uid, db, helpers) {
    if (!uid || !db || !helpers || typeof helpers.doc !== 'function' || typeof helpers.getDoc !== 'function') {
      return { exists: false, hasContent: false, data: null };
    }
    const profileRef = helpers.doc(db, 'workspaces', uid, 'meta', 'profile');
    const profileSnap = await helpers.getDoc(profileRef);
    const exists = Boolean(profileSnap && (typeof profileSnap.exists === 'function' ? profileSnap.exists() : profileSnap.exists));
    if (!exists) {
      return { exists: false, hasContent: false, data: null };
    }
    const revs = {};
    const profileRaw = takeRev(revs, ['workspaces', uid, 'meta', 'profile'],
      typeof profileSnap.data === 'function' ? profileSnap.data() : (profileSnap.data || {})) || {};
    const profile = normalizeProfile(profileRaw);
    const scopesIndex = Array.isArray(profileRaw.scopes_index) ? profileRaw.scopes_index : [];
    const scopes = {};

    await Promise.all(scopesIndex.map(async (scMeta) => {
      if (!scMeta || !scMeta.scopeKey) return;
      const scopeKey = scMeta.scopeKey;
      const subj = scMeta.subject_name || DEFAULT_SUBJECT;
      const sy = scMeta.school_year || profile.school_year || DEFAULT_SCHOOL_YEAR;
      const scopeObj = {
        scopeKey,
        school_year: sy,
        subject_name: subj,
        subject_folder: scMeta.subject_folder || subjectDriveFolder(subj),
        competency_catalog: null,
        grades: {}
      };
      scopes[scopeKey] = scopeObj;

      // Đọc danh mục năng lực dùng chung môn
      try {
        const catSnap = await helpers.getDoc(helpers.doc(db, 'workspaces', uid, 'scopes', scopeKey, 'shared', 'competency_catalog'));
        const catExists = Boolean(catSnap && (typeof catSnap.exists === 'function' ? catSnap.exists() : catSnap.exists));
        if (catExists) {
          scopeObj.competency_catalog = clone(takeRev(revs, ['workspaces', uid, 'scopes', scopeKey, 'shared', 'competency_catalog'],
            typeof catSnap.data === 'function' ? catSnap.data() : catSnap.data));
        }
      } catch (e) {}

      const gradeNums = Array.isArray(scMeta.grades) ? scMeta.grades : [];
      await Promise.all(gradeNums.map(async (gNum) => {
        const gStr = String(Number(gNum));
        const gSlice = createEmptyGradeSlice(Number(gNum), subj);
        scopeObj.grades[gStr] = gSlice;

        const readModuleDoc = async (modName) => {
          try {
            const snap = await helpers.getDoc(helpers.doc(db, 'workspaces', uid, 'scopes', scopeKey, 'grades', gStr, 'modules', modName));
            const ok = Boolean(snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists));
            return ok ? takeRev(revs, ['workspaces', uid, 'scopes', scopeKey, 'grades', gStr, 'modules', modName],
              typeof snap.data === 'function' ? snap.data() : snap.data) : null;
          } catch (e) {
            return null;
          }
        };

        const [ppctDoc, apDoc, ktDoc, chunkDocs, mxDocs, revDocs, exDocs] = await Promise.all([
          readModuleDoc('ppct'),
          readModuleDoc('assessment_plans'),
          readModuleDoc('kttx'),
          readFirestoreCollection(db, helpers, ['workspaces', uid, 'scopes', scopeKey, 'grades', gStr, 'question_chunks']),
          readFirestoreCollection(db, helpers, ['workspaces', uid, 'scopes', scopeKey, 'grades', gStr, 'matrices']),
          readFirestoreCollection(db, helpers, ['workspaces', uid, 'scopes', scopeKey, 'grades', gStr, 'revisions']),
          readFirestoreCollection(db, helpers, ['workspaces', uid, 'scopes', scopeKey, 'grades', gStr, 'exams'])
        ]);

        const gradePath = ['workspaces', uid, 'scopes', scopeKey, 'grades', gStr];
        for (const [colName, items] of [['question_chunks', chunkDocs], ['matrices', mxDocs], ['revisions', revDocs], ['exams', exDocs]]) {
          for (const item of items) {
            if (item && item.data) item.data = takeRev(revs, [...gradePath, colName, item.id], item.data);
          }
        }
        // Gói câu hỏi được ghi kèm `updated_at`; bỏ khi đọc để bản đọc khớp bản chia lại,
        // nếu không mỗi lần lưu sẽ ghi lại thừa mọi gói câu hỏi (và tự gây xung đột giữa hai máy).
        for (const item of chunkDocs) {
          if (item && item.data && 'updated_at' in item.data) {
            item.data = { ...item.data };
            delete item.data.updated_at;
          }
        }

        if (ppctDoc) {
          gSlice.ppct = {
            grade: Number(gNum),
            subject_name: subj,
            cleared: Boolean(ppctDoc.cleared),
            lessons: Array.isArray(ppctDoc.lessons) ? clone(ppctDoc.lessons) : []
          };
        }
        if (apDoc && Array.isArray(apDoc.assessment_plans)) {
          gSlice.assessment_plans = clone(apDoc.assessment_plans);
        }
        if (ktDoc && Array.isArray(ktDoc.kttx)) {
          gSlice.kttx = clone(ktDoc.kttx);
        }
        for (const item of chunkDocs) {
          if (!item || !item.data) continue;
          gSlice.question_chunks[item.id] = clone(item.data);
          for (const q of (Array.isArray(item.data.questions) ? item.data.questions : [])) {
            gSlice.questions.push(clone(q));
          }
        }
        for (const item of mxDocs) {
          if (item && item.data) gSlice.matrices[item.id] = clone(item.data);
        }
        for (const item of revDocs) {
          if (item && item.data) gSlice.revisions[item.id] = clone(item.data);
        }
        for (const item of exDocs) {
          if (item && item.data) gSlice.exams[item.id] = clone(item.data);
        }
      }));
    }));

    const slices = { profile, scopes };
    const data = assembleWorkspaceFromSlices(slices);
    const hasContent = Boolean(
      data.bank.questions.length > 0 ||
      data.bank.ppct.lessons.length > 0 ||
      data.bank.ppct.cleared_grades.length > 0 ||
      data.matrices.length > 0 ||
      data.revisions.length > 0 ||
      data.exams.length > 0 ||
      data.assessment_plans.length > 0 ||
      data.kttx.length > 0 ||
      data.bank.competency_catalogs.length > 0
    );

    return { exists: true, hasContent, data, slices, profile, revs };
  }

  // =========================================================================
  // CHẶN GHI ĐÈ GIỮA HAI MÁY/TAB (optimistic concurrency)
  // Mỗi tài liệu ghi lên Firestore mang `_rev` (chuỗi ngẫu nhiên, đổi mỗi lần ghi). Tab giữ bảng
  // `knownRevs` {đường dẫn: dấu} của bản nó đã tải/ghi. Trước khi ghi, dấu trên đám mây phải khớp;
  // lệch dấu nghĩa là máy/tab khác đã sửa -> báo CLOUD_CONFLICT và không ghi gì. `_rev` không bao giờ
  // nằm trong dữ liệu giáo viên (bị tách ra khi đọc).
  // =========================================================================
  const CONFLICT_CODE = 'CLOUD_CONFLICT';
  const REV_ABSENT = 'absent';
  const REV_LEGACY = 'legacy';

  function revPath(segments) {
    return segments.join('/');
  }

  function newRevToken() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function takeRev(revs, segments, data) {
    if (!data || typeof data !== 'object') return data;
    const rev = typeof data._rev === 'string' && data._rev ? data._rev : REV_LEGACY;
    revs[revPath(segments)] = rev;
    if (!('_rev' in data)) return data;
    const cleaned = { ...data };
    delete cleaned._rev;
    return cleaned;
  }

  function remoteRevOf(snap) {
    const exists = Boolean(snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists));
    if (!exists) return REV_ABSENT;
    const data = typeof snap.data === 'function' ? snap.data() : snap.data;
    return data && typeof data._rev === 'string' && data._rev ? data._rev : REV_LEGACY;
  }

  function makeConflictError(conflicts) {
    const err = new Error('Dữ liệu trên đám mây vừa được sửa ở máy hoặc tab khác. Thao tác vừa rồi chưa được lưu. Hãy tải lại trang để lấy bản mới nhất rồi làm lại.');
    err.code = CONFLICT_CODE;
    err.conflicts = conflicts;
    return err;
  }

  function findConflicts(ops, remoteRevs, knownRevs) {
    const conflicts = [];
    ops.forEach((op, i) => {
      const path = revPath(op.pathSegments);
      const known = Object.prototype.hasOwnProperty.call(knownRevs, path) ? knownRevs[path] : REV_ABSENT;
      if (remoteRevs[i] !== known) {
        conflicts.push({ path, module: op.module, grade: op.grade, docId: op.docId, op: op.op });
      }
    });
    return conflicts;
  }

  function isConflictError(err) {
    return Boolean(err && err.code === CONFLICT_CODE);
  }

  // Gắn dấu mới cho mọi thao tác set; trả về bảng dấu sau khi ghi.
  function stampOps(ops) {
    const revsAfter = {};
    const stamped = ops.map(op => {
      const path = revPath(op.pathSegments);
      if (op.op === 'delete') {
        revsAfter[path] = REV_ABSENT;
        return op;
      }
      const rev = newRevToken();
      revsAfter[path] = rev;
      return { ...op, data: { ...op.data, _rev: rev } };
    });
    return { stamped, revsAfter };
  }

  async function executeFirestoreOps(db, helpers, ops, { knownRevs = null } = {}) {
    if (!ops.length) return;
    const checkConflicts = Boolean(knownRevs && typeof knownRevs === 'object');
    const TX_LIMIT = 450;

    if (checkConflicts && typeof helpers.runTransaction === 'function' && ops.length <= TX_LIMIT) {
      // Giao dịch: đọc dấu và ghi trong cùng một lượt nguyên tử của Firestore.
      await helpers.runTransaction(db, async (tx) => {
        const refs = ops.map(op => helpers.doc(db, ...op.pathSegments));
        const remoteRevs = [];
        for (const ref of refs) remoteRevs.push(remoteRevOf(await tx.get(ref)));
        const conflicts = findConflicts(ops, remoteRevs, knownRevs);
        if (conflicts.length) throw makeConflictError(conflicts);
        ops.forEach((op, i) => {
          if (op.op === 'delete') tx.delete(refs[i]);
          else tx.set(refs[i], op.data);
        });
      });
      return;
    }

    if (checkConflicts) {
      // Không có giao dịch (hoặc quá nhiều tài liệu): đọc dấu trước, lệch thì dừng trước khi ghi.
      const remoteRevs = await Promise.all(ops.map(op => helpers.getDoc(helpers.doc(db, ...op.pathSegments)).then(remoteRevOf)));
      const conflicts = findConflicts(ops, remoteRevs, knownRevs);
      if (conflicts.length) throw makeConflictError(conflicts);
    }

    if (typeof helpers.writeBatch === 'function') {
      const BATCH_LIMIT = 400;
      for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const chunk = ops.slice(i, i + BATCH_LIMIT);
        const batch = helpers.writeBatch(db);
        for (const op of chunk) {
          const ref = helpers.doc(db, ...op.pathSegments);
          if (op.op === 'delete') {
            batch.delete(ref);
          } else {
            batch.set(ref, op.data);
          }
        }
        await batch.commit();
      }
      return;
    }
    // Fallback tuần tự nếu môi trường test không cung cấp writeBatch
    for (const op of ops) {
      const ref = helpers.doc(db, ...op.pathSegments);
      if (op.op === 'delete') {
        if (typeof helpers.deleteDoc === 'function') await helpers.deleteDoc(ref);
      } else {
        await helpers.setDoc(ref, op.data);
      }
    }
  }

  async function firestoreWriteDiffV2(uid, db, helpers, beforeSlices, afterSlices, { ownerEmail, forceProfile = false, knownRevs = null } = {}) {
    if (!uid || !db || !helpers || typeof helpers.doc !== 'function' || typeof helpers.setDoc !== 'function') {
      throw new Error('Thiếu kết nối Firebase Firestore v2.');
    }
    const diff = diffSlices(beforeSlices, afterSlices, uid);
    const ops = [...diff.firestoreOps];
    // Chỉ ghi lại hồ sơ khi hồ sơ hoặc mục lục khối thay đổi: hai máy sửa hai tài liệu khác nhau
    // sẽ không đụng nhau ở tài liệu hồ sơ.
    if (forceProfile || diff.profileChanged) {
      const profilePayload = {
        ...normalizeProfile(afterSlices.profile || {}),
        owner_email: ownerEmail || '',
        updated_at: new Date().toISOString(),
        scopes_index: diff.scopesIndex
      };
      ops.push({
        op: 'set',
        pathSegments: ['workspaces', uid, 'meta', 'profile'],
        data: profilePayload,
        scopeKey: '_meta',
        grade: null,
        module: 'profile',
        docId: 'profile'
      });
    }
    const { stamped, revsAfter } = stampOps(ops);
    await executeFirestoreOps(db, helpers, stamped, { knownRevs });
    return {
      knownRevs: { ...(knownRevs || {}), ...revsAfter },
      opsCount: ops.length,
      driveFiles: diff.driveFiles,
      scopesIndex: diff.scopesIndex
    };
  }

  async function firestoreWriteFullV2(uid, db, helpers, workspaceData, opts = {}) {
    const emptySlices = { profile: {}, scopes: {} };
    const afterSlices = splitWorkspaceIntoSlices(workspaceData, opts);
    return await firestoreWriteDiffV2(uid, db, helpers, emptySlices, afterSlices, { ...opts, forceProfile: true });
  }

  // =========================================================================
  // GOOGLE DRIVE V2 ADAPTER (Cây thư mục phân tách theo Năm học / Môn / Khối)
  // =========================================================================
  function buildManifestPayload(slices, { ownerEmail } = {}) {
    const profile = normalizeProfile(slices.profile || {});
    const scopes = slices.scopes || {};
    return {
      schema_version: SCHEMA_VERSION,
      format: 'exammatrix-drive-v2',
      owner_email: ownerEmail || '',
      updated_at: new Date().toISOString(),
      profile,
      scopes: Object.keys(scopes).sort().map(scopeKey => {
        const sc = scopes[scopeKey];
        return {
          scopeKey: sc.scopeKey,
          school_year: sc.school_year,
          subject_name: sc.subject_name,
          subject_folder: sc.subject_folder,
          has_catalog: Boolean(sc.competency_catalog),
          grades: Object.keys(sc.grades || {}).sort((a, b) => Number(a) - Number(b)).map(gKey => {
            const gSlice = sc.grades[gKey];
            const mods = [];
            if ((gSlice.ppct?.lessons || []).length || gSlice.ppct?.cleared) mods.push('ppct');
            if ((gSlice.assessment_plans || []).length) mods.push('assessment_plans');
            if ((gSlice.kttx || []).length) mods.push('kttx');
            if ((gSlice.questions || []).length) mods.push('questions');
            if (Object.keys(gSlice.matrices || {}).length) mods.push('matrices');
            if (Object.keys(gSlice.revisions || {}).length) mods.push('revisions');
            if (Object.keys(gSlice.exams || {}).length) mods.push('exams');
            return { grade: gSlice.grade, modules: mods };
          })
        };
      })
    };
  }

  async function driveReadWorkspaceV2(accessToken, driveStorage, { folderName = 'ExamMatrix Studio', fetchImpl } = {}) {
    if (!accessToken || !driveStorage || typeof driveStorage.findOrCreateFolder !== 'function') {
      throw new Error('Thiếu GoogleDriveStorage để đọc dữ liệu phân khối.');
    }
    const rootFolderId = await driveStorage.findOrCreateFolder(accessToken, folderName, { fetchImpl });
    const manifestRes = await driveStorage.readJsonFileInFolder(accessToken, rootFolderId, 'manifest.json', { fetchImpl });
    if (!manifestRes.exists || !manifestRes.data || manifestRes.data.schema_version !== SCHEMA_VERSION) {
      return { exists: false, rootFolderId, manifest: null, data: null };
    }

    const manifest = manifestRes.data;
    const profile = normalizeProfile(manifest.profile || {});
    const scopes = {};
    const folderCache = new Map([[folderName, rootFolderId]]);

    for (const scMeta of (Array.isArray(manifest.scopes) ? manifest.scopes : [])) {
      if (!scMeta || !scMeta.scopeKey) continue;
      const subj = scMeta.subject_name || DEFAULT_SUBJECT;
      const sy = scMeta.school_year || profile.school_year || DEFAULT_SCHOOL_YEAR;
      const subjFolder = scMeta.subject_folder || subjectDriveFolder(subj);
      const scopeObj = {
        scopeKey: scMeta.scopeKey,
        school_year: sy,
        subject_name: subj,
        subject_folder: subjFolder,
        competency_catalog: null,
        grades: {}
      };
      scopes[scMeta.scopeKey] = scopeObj;

      if (scMeta.has_catalog) {
        try {
          const subjFolderId = await driveStorage.ensureFolderPath(accessToken, [folderName, sy, subjFolder], { fetchImpl, folderCache });
          const catFile = await driveStorage.readJsonFileInFolder(accessToken, subjFolderId, 'competency_catalog.json', { fetchImpl });
          if (catFile.exists && catFile.data?.catalog) {
            scopeObj.competency_catalog = clone(catFile.data.catalog);
          }
        } catch (e) {}
      }

      for (const gMeta of (Array.isArray(scMeta.grades) ? scMeta.grades : [])) {
        const gNum = Number(gMeta.grade);
        if (!Number.isFinite(gNum) || gNum <= 0) continue;
        const gSlice = createEmptyGradeSlice(gNum, subj);
        scopeObj.grades[String(gNum)] = gSlice;

        const mods = Array.isArray(gMeta.modules) && gMeta.modules.length ? gMeta.modules : MODULE_NAMES;
        const gradeFolderId = await driveStorage.ensureFolderPath(
          accessToken,
          [folderName, sy, subjFolder, `Khoi_${gNum}`],
          { fetchImpl, folderCache }
        );

        await Promise.all(mods.map(async (modName) => {
          const fileRes = await driveStorage.readJsonFileInFolder(accessToken, gradeFolderId, `${modName}.json`, { fetchImpl });
          if (!fileRes.exists || !fileRes.data) return;
          const d = fileRes.data;
          if (modName === 'ppct') {
            gSlice.ppct = {
              grade: gNum,
              subject_name: subj,
              cleared: Boolean(d.cleared),
              lessons: Array.isArray(d.lessons) ? clone(d.lessons) : []
            };
          } else if (modName === 'assessment_plans' && Array.isArray(d.assessment_plans)) {
            gSlice.assessment_plans = clone(d.assessment_plans);
          } else if (modName === 'kttx' && Array.isArray(d.kttx)) {
            gSlice.kttx = clone(d.kttx);
          } else if (modName === 'questions' && Array.isArray(d.questions)) {
            gSlice.questions = clone(d.questions);
            gSlice.question_chunks = chunkQuestionsByLesson(gSlice.questions, MAX_QUESTIONS_PER_CHUNK, { grade: gNum, subject_name: subj });
          } else if (modName === 'matrices' && Array.isArray(d.matrices)) {
            d.matrices.forEach((m, idx) => {
              gSlice.matrices[sanitizeDocId(m?.id || `MX_${idx}`)] = clone(m);
            });
          } else if (modName === 'revisions' && Array.isArray(d.revisions)) {
            d.revisions.forEach((r, idx) => {
              gSlice.revisions[sanitizeDocId(r?.id || `REV_${idx}`)] = clone(r);
            });
          } else if (modName === 'exams' && Array.isArray(d.exams)) {
            d.exams.forEach((ex, idx) => {
              gSlice.exams[sanitizeDocId(ex?.id || `EX_${idx}`)] = clone(ex);
            });
          }
        }));
      }
    }

    const slices = { profile, scopes };
    return {
      exists: true,
      rootFolderId,
      manifest,
      slices,
      data: assembleWorkspaceFromSlices(slices)
    };
  }

  async function driveWriteDiffV2(accessToken, driveStorage, beforeSlices, afterSlices, {
    folderName = 'ExamMatrix Studio',
    ownerEmail = '',
    fetchImpl,
    folderCache,
    forceManifest = false
  } = {}) {
    if (!accessToken || !driveStorage || typeof driveStorage.ensureFolderPath !== 'function') {
      throw new Error('Thiếu kết nối Google Drive v2.');
    }
    const cache = folderCache instanceof Map ? folderCache : new Map();
    const diff = diffSlices(beforeSlices, afterSlices);
    if (!forceManifest && !diff.profileChanged && diff.driveFiles.length === 0) {
      return { writtenFiles: 0, updatedManifest: false };
    }

    const rootFolderId = await driveStorage.ensureFolderPath(accessToken, [folderName], { fetchImpl, folderCache: cache });

    for (const item of diff.driveFiles) {
      const pathSegments = item.grade != null
        ? [folderName, item.school_year, item.subject_folder, `Khoi_${item.grade}`]
        : [folderName, item.school_year, item.subject_folder];
      const targetFolderId = await driveStorage.ensureFolderPath(accessToken, pathSegments, { fetchImpl, folderCache: cache });
      await driveStorage.writeJsonFileInFolder(accessToken, targetFolderId, item.fileName, item.payload, { fetchImpl });
    }

    const manifestPayload = buildManifestPayload(afterSlices, { ownerEmail });
    await driveStorage.writeJsonFileInFolder(accessToken, rootFolderId, 'manifest.json', manifestPayload, { fetchImpl });

    return {
      rootFolderId,
      writtenFiles: diff.driveFiles.length,
      updatedManifest: true,
      manifest: manifestPayload
    };
  }

  async function driveWriteFullV2(accessToken, driveStorage, workspaceData, opts = {}) {
    const emptySlices = { profile: {}, scopes: {} };
    const afterSlices = splitWorkspaceIntoSlices(workspaceData, opts);
    return await driveWriteDiffV2(accessToken, driveStorage, emptySlices, afterSlices, { ...opts, forceManifest: true });
  }

  // =========================================================================
  // TỰ ĐỘNG NÂNG CẤP DỮ LIỆU CŨ V1 -> V2 (Không bao giờ mất dữ liệu cũ)
  // =========================================================================
  async function migrateV1ToV2({
    uid,
    legacyData,
    db,
    firestoreHelpers,
    driveAccessToken,
    driveStorage,
    folderName = 'ExamMatrix Studio',
    ownerEmail = '',
    fetchImpl
  } = {}) {
    const cleanLegacy = legacyData && typeof legacyData === 'object' ? clone(legacyData) : {};
    const slices = splitWorkspaceIntoSlices(cleanLegacy);
    const assembled = assembleWorkspaceFromSlices(slices);

    let knownRevs = null;
    if (uid && db && firestoreHelpers) {
      const written = await firestoreWriteFullV2(uid, db, firestoreHelpers, assembled, { ownerEmail });
      knownRevs = written.knownRevs;
    }

    if (driveAccessToken && driveStorage) {
      const rootFolderId = await driveStorage.findOrCreateFolder(accessTokenOrToken(driveAccessToken), folderName, { fetchImpl });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      try {
        await driveStorage.backupJsonToBackupsFolder(
          driveAccessToken,
          rootFolderId,
          `legacy_v1_${ts}.json`,
          {
            migrated_at: new Date().toISOString(),
            owner_email: ownerEmail || '',
            legacy_data: cleanLegacy
          },
          { fetchImpl }
        );
      } catch (e) {}
      await driveWriteFullV2(driveAccessToken, driveStorage, assembled, { folderName, ownerEmail, fetchImpl });
    }

    return { data: assembled, slices, knownRevs };
  }

  function accessTokenOrToken(t) {
    return t;
  }

  return {
    SCHEMA_VERSION,
    DEFAULT_SCHOOL_YEAR,
    DEFAULT_ACTIVE_GRADES,
    DEFAULT_SUBJECT,
    MAX_QUESTIONS_PER_CHUNK,
    ALL_GRADES,
    MODULE_NAMES,
    subjectSlug,
    subjectDriveFolder,
    sanitizeDocId,
    scopeKeyFor,
    normalizeGradesList,
    normalizeProfile,
    isShrinkAllowedAction,
    canonicalStringify,
    chunkQuestionsByLesson,
    splitWorkspaceIntoSlices,
    assembleWorkspaceFromSlices,
    buildScopesIndex,
    diffSlices,
    checkAntiWipe,
    firestoreReadWorkspaceV2,
    firestoreWriteDiffV2,
    firestoreWriteFullV2,
    buildManifestPayload,
    driveReadWorkspaceV2,
    driveWriteDiffV2,
    driveWriteFullV2,
    migrateV1ToV2,
    CONFLICT_CODE,
    isConflictError
  };
});
