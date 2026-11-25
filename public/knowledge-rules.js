/*
 * Kho luật kiểm tra đánh giá + bộ máy suy diễn tiến + phần giải thích (Giai đoạn 2,
 * docs/KE_HOACH_DO_THI_TRI_THUC.md). Thuần, không I/O, UMD.
 *
 * - Sự kiện (fact) là bộ ba [chủ thể, vị từ, đối tượng].
 * - Luật là DỮ LIỆU: `neu` (các mẫu bộ ba có biến ?x, mẫu phủ định {khong:[...]}, phép thử {thu:..}),
 *   `thi` (thêm sự kiện suy ra) hoặc `vi_pham` (lỗi chặn / cảnh báo, câu giải thích có {?biến}).
 * - Mỗi luật ghi `can_cu`: văn bản, điều, khoản đã đối chiếu bản gốc (bản OCR trong
 *   01_Van_ban_phap_ly_va_Quy_dinh/_Ban_OCR_tim_kiem/) hoặc quy tắc trường/quyết định giáo viên.
 *
 * Giai đoạn chuyển đổi: kho luật chạy SONG SONG với static-exam-engine.verifyExam; mã cũ vẫn là
 * căn cứ chặn duyệt. Chỉ gỡ mã cũ khi kết quả hai bên khớp (tests/static_knowledge_rules.test.cjs).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BankKnowledgeRules = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const list = x => (Array.isArray(x) ? x : []);
  const text = x => (typeof x === 'string' ? x.trim() : '');
  const norm = x => String(x || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const isVar = x => typeof x === 'string' && x.startsWith('?');
  // Nền móng tri thức dùng chung (core.js): một định nghĩa câu trùng, mã YCCĐ cố định.
  const core = (typeof module === 'object' && module.exports && typeof require === 'function') ? require('./core.js') : (typeof window !== 'undefined' ? window.BankCore : globalThis.BankCore);

  const CAN_CU = {
    THANG_DIEM_10: 'TT 22/2021/TT-BGDĐT, Điều 5, khoản 3, điểm b (đánh giá bằng điểm số theo thang điểm 10)',
    MA_TRAN_YCCD: 'TT 22/2021/TT-BGDĐT, Điều 7, khoản 1 (đề kiểm tra định kì xây dựng dựa trên ma trận, đặc tả, đáp ứng yêu cầu cần đạt)',
    THOI_GIAN: 'TT 22/2021/TT-BGDĐT, Điều 7, khoản 1 (môn có từ 70 tiết/năm học trở xuống: 45 phút)',
    DANG_CAU_THPT: 'CV 7991/BGDĐT-GDTrH, Phụ lục (THPT: nhiều lựa chọn, Đúng – Sai, trả lời ngắn, tự luận)',
    DANG_CAU_THCS: 'Quy ước của tổ: THCS dùng nhiều lựa chọn và tự luận (docs/BOI_CANH.md; danh sách dạng câu THCS còn chờ tổ xác nhận)',
    DE_CUONG_90: 'Quy tắc trường rules/01_phan_cong_va_bien_soan_de.md (90% đề lấy từ hoặc bám sát đề cương ôn tập)',
    PHU_YCCD: 'Quyết định giáo viên 26/10/2026 (docs/BOI_CANH.md mục 4): tiêu chí đề cương phủ YCCĐ 100%',
    CAU_DA_DUYET: 'Quyết định giáo viên 26/10/2026 (docs/BOI_CANH.md mục 4): đề chính thức chỉ dùng câu đã duyệt',
    KHONG_TRUNG: 'Bất biến nghiệp vụ (docs/THIET_KE.md): đề không có câu trùng',
    PHAM_VI_TUAN: 'PPCT của giáo viên (CV 5512/BGDĐT-GDTrH, Phụ lục 1): chỉ kiểm tra nội dung đã học tới thời điểm kiểm tra'
  };

  // ------------------------------------------------------------------------------------------
  // KHO LUẬT
  // ------------------------------------------------------------------------------------------
  const RULES = [
    // --- Luật suy ra (thêm sự kiện) ---
    { id: 'D-CAP-THCS', mo_ta: 'Khối 6–9 thuộc cấp THCS',
      neu: [['?d', 'khoi', '?k'], { thu: 'lt', a: '?k', b: 10 }], thi: [['?d', 'cap_hoc', 'THCS']] },
    { id: 'D-CAP-THPT', mo_ta: 'Khối 10–12 thuộc cấp THPT',
      neu: [['?d', 'khoi', '?k'], { thu: 'ge', a: '?k', b: 10 }], thi: [['?d', 'cap_hoc', 'THPT']] },
    { id: 'D-DANG-THCS', mo_ta: 'Đề THCS không khai dạng câu riêng: dùng nhiều lựa chọn, tự luận',
      neu: [['?d', 'cap_hoc', 'THCS'], ['?d', 'khai_dang_rieng', false]],
      thi: [['?d', 'cho_phep_dang', 'MC'], ['?d', 'cho_phep_dang', 'ES']], can_cu: CAN_CU.DANG_CAU_THCS },
    { id: 'D-DANG-THPT', mo_ta: 'Đề THPT không khai dạng câu riêng: dùng đủ 4 dạng',
      neu: [['?d', 'cap_hoc', 'THPT'], ['?d', 'khai_dang_rieng', false]],
      thi: [['?d', 'cho_phep_dang', 'MC'], ['?d', 'cho_phep_dang', 'YN'], ['?d', 'cho_phep_dang', 'SHORT'], ['?d', 'cho_phep_dang', 'ES']],
      can_cu: CAN_CU.DANG_CAU_THPT },
    { id: 'D-DINH-KI', mo_ta: 'Giữa kì, cuối kì là đánh giá định kì',
      neu: [['?d', 'loai_kiem_tra', '?t'], { thu: 'in', a: '?t', b: ['GK1', 'CK1', 'GK2', 'CK2'] }], thi: [['?d', 'la', 'dinh_ki']] },

    // --- Luật vi phạm (chặn) ---
    { id: 'R-TONG-10', muc: 'chan', can_cu: CAN_CU.THANG_DIEM_10,
      neu: [['?d', 'la', 'de'], ['?d', 'tong_diem', '?t'], { thu: 'ne_num', a: '?t', b: 10 }],
      vi_pham: 'Tổng điểm của đề là {?t}, phải đúng 10 điểm.' },
    { id: 'R-DANG-CAU', muc: 'chan', can_cu: [CAN_CU.DANG_CAU_THPT, CAN_CU.DANG_CAU_THCS],
      neu: [['?d', 'co_cau', '?c'], ['?c', 'la_dang', '?k'], { khong: ['?d', 'cho_phep_dang', '?k'] }, ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} là dạng {?k}, không thuộc các dạng câu được dùng cho đề này.' },
    { id: 'R-CHUA-DUYET', muc: 'chan', can_cu: CAN_CU.CAU_DA_DUYET,
      neu: [['?d', 'co_cau', '?c'], ['?c', 'trang_thai', '?s'], { thu: 'ne', a: '?s', b: 'approved' }, ['?c', 'trang_thai_ten', '?ten'], ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} chưa được duyệt (trạng thái: {?ten}).' },
    { id: 'R-KHAC-KHOI', muc: 'chan', can_cu: CAN_CU.MA_TRAN_YCCD,
      neu: [['?d', 'khoi', '?k'], ['?d', 'co_cau', '?c'], ['?c', 'khoi', '?kc'], { thu: 'ne_num', a: '?kc', b: '?k' }, ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} thuộc Khối {?kc}, khác khối của đề (Khối {?k}).' },
    { id: 'R-KHAC-MON', muc: 'chan', can_cu: CAN_CU.MA_TRAN_YCCD,
      neu: [['?d', 'mon', '?m'], ['?d', 'co_cau', '?c'], ['?c', 'mon', '?mc'], { thu: 'ne', a: '?mc', b: '?m' }, ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} thuộc môn {?mc}, khác môn của đề ({?m}).' },
    { id: 'R-TRUNG', muc: 'chan', can_cu: CAN_CU.KHONG_TRUNG,
      neu: [['?c1', 'trung_voi', '?c2'], ['?c1', 'muc_trung', '?m'], ['?c1', 'so_thu_tu', '?n1'], ['?c2', 'so_thu_tu', '?n2']],
      vi_pham: 'Câu {?n1} trùng với câu {?n2} ({?m}).' },
    { id: 'R-NGOAI-PPCT', muc: 'chan', can_cu: CAN_CU.MA_TRAN_YCCD,
      neu: [['?d', 'co_cau', '?c'], { khong: ['?c', 'thuoc_bai_ppct', true] }, ['?c', 'ma_bai', '?b'], ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n}: bài “{?b}” không có trong PPCT của khối.' },
    { id: 'R-NGOAI-YCCD', muc: 'chan', can_cu: CAN_CU.MA_TRAN_YCCD,
      neu: [['?d', 'co_cau', '?c'], ['?c', 'thuoc_bai_ppct', true], { khong: ['?c', 'danh_gia_yccd_ppct', true] }, ['?c', 'ma_bai', '?b'], ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n}: YCCĐ của câu không khớp YCCĐ nào của bài {?b} trong PPCT.' },
    { id: 'R-CHUA-DE-CUONG', muc: 'chan', can_cu: CAN_CU.DE_CUONG_90,
      neu: [['?d', 'la', 'de'], ['?d', 'co_de_cuong', false]],
      vi_pham: 'Đề chưa gắn đề cương ôn tập nên chưa kiểm được tỉ lệ 90%.' },
    { id: 'R-TI-LE-DE-CUONG', muc: 'chan', can_cu: CAN_CU.DE_CUONG_90,
      neu: [['?d', 'co_de_cuong', true], ['?d', 'so_cau_trong_de_cuong', '?x'], ['?d', 'so_cau_can_tu_de_cuong', '?y'], { thu: 'lt', a: '?x', b: '?y' }, ['?d', 'so_cau', '?n']],
      vi_pham: 'Mới có {?x}/{?n} câu lấy từ đề cương; cần ít nhất {?y} câu.' },
    { id: 'R-PHU-YCCD', muc: 'chan', can_cu: CAN_CU.PHU_YCCD,
      neu: [['?d', 'co_de_cuong', true], ['?d', 'co_cau', '?c'], { khong: ['?c', 'yccd_trong_de_cuong', true] }, ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} kiểm tra YCCĐ không có trong đề cương ôn tập.' },

    // --- Cảnh báo (không chặn) ---
    { id: 'W-NGOAI-DE-CUONG', muc: 'canh_bao', can_cu: CAN_CU.DE_CUONG_90,
      neu: [['?d', 'co_de_cuong', true], ['?d', 'co_cau', '?c'], ['?c', 'trong_de_cuong', false], ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} không có trong đề cương (được phép trong giới hạn 10%).' },
    { id: 'W-THOI-GIAN', muc: 'canh_bao', can_cu: CAN_CU.THOI_GIAN,
      neu: [['?d', 'la', 'dinh_ki'], ['?d', 'mon_tin_hoc', true], ['?d', 'thoi_gian', '?p'], { thu: 'ne_num', a: '?p', b: 45 }],
      vi_pham: 'Môn Tin học có từ 70 tiết/năm trở xuống: bài kiểm tra định kì làm trong 45 phút, đề đang ghi {?p} phút.' },
    { id: 'W-NGOAI-PHAM-VI', muc: 'canh_bao', can_cu: CAN_CU.PHAM_VI_TUAN,
      neu: [['?d', 'kiem_tra_den_tuan', '?w'], ['?d', 'co_cau', '?c'], ['?c', 'tuan_bat_dau', '?t'], { thu: 'gt', a: '?t', b: '?w' }, ['?c', 'ma_bai', '?b'], ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} thuộc bài {?b}, theo PPCT bắt đầu học ở tuần {?t}, sau tuần {?w} là thời điểm kiểm tra.' },
    { id: 'W-THIEU-TIEN-DE', muc: 'canh_bao', can_cu: CAN_CU.PHAM_VI_TUAN,
      neu: [['?d', 'kiem_tra_den_tuan', '?w'], ['?d', 'co_cau', '?c'], ['?c', 'can_bai_tien_de', '?p'], ['?p', 'tuan_bat_dau', '?t'], { thu: 'gt', a: '?t', b: '?w' }, ['?c', 'so_thu_tu', '?n'], ['?p', 'ma', '?pb']],
      vi_pham: 'Câu {?n} cần bài tiền đề {?pb}, nhưng bài này học sau tuần {?w}.' }
  ];

  // ------------------------------------------------------------------------------------------
  // BỘ MÁY SUY DIỄN TIẾN
  // ------------------------------------------------------------------------------------------
  function factKey(f) { return JSON.stringify(f); }

  function createFactBase(initial) {
    const facts = [];
    const keys = new Set();
    const bySP = new Map();
    const byP = new Map();
    const add = (f) => {
      const k = factKey(f);
      if (keys.has(k)) return false;
      keys.add(k);
      facts.push(f);
      const sp = f[0] + '\u0001' + f[1];
      if (!bySP.has(sp)) bySP.set(sp, []);
      bySP.get(sp).push(f);
      if (!byP.has(f[1])) byP.set(f[1], []);
      byP.get(f[1]).push(f);
      return true;
    };
    list(initial).forEach(add);
    return {
      facts, add, has: f => keys.has(factKey(f)),
      candidates(s, p) { return !isVar(s) && !isVar(p) ? list(bySP.get(s + '\u0001' + p)) : !isVar(p) ? list(byP.get(p)) : facts; }
    };
  }

  const resolve = (term, b) => (isVar(term) ? b[term] : term);

  function unify(pattern, fact, binding) {
    const b = { ...binding };
    for (let i = 0; i < 3; i++) {
      const t = pattern[i];
      if (isVar(t)) {
        if (t in b) { if (b[t] !== fact[i]) return null; } else b[t] = fact[i];
      } else if (t !== fact[i]) return null;
    }
    return b;
  }

  const TESTS = {
    eq: (a, b) => a === b, ne: (a, b) => a !== b,
    lt: (a, b) => Number(a) < Number(b), le: (a, b) => Number(a) <= Number(b),
    gt: (a, b) => Number(a) > Number(b), ge: (a, b) => Number(a) >= Number(b),
    ne_num: (a, b) => Math.abs(Number(a) - Number(b)) > 1e-9,
    in: (a, b) => list(b).includes(a)
  };

  // Khớp các điều kiện theo thứ tự; trả mọi bộ gán biến kèm sự kiện đã dùng.
  function matchConditions(conds, fb) {
    let states = [{ b: {}, used: [] }];
    for (const c of conds) {
      const next = [];
      if (Array.isArray(c)) {
        for (const st of states) {
          const s = resolve(c[0], st.b), p = resolve(c[1], st.b);
          for (const f of fb.candidates(s === undefined ? c[0] : s, p === undefined ? c[1] : p)) {
            const b = unify(c, f, st.b);
            if (b) next.push({ b, used: [...st.used, f], absent: st.absent });
          }
        }
      } else if (c && c.khong) {
        for (const st of states) {
          const pat = c.khong.map(t => (isVar(t) && t in st.b ? st.b[t] : t));
          const any = fb.candidates(pat[0], pat[1]).some(f => unify(pat, f, {}));
          if (!any) next.push({ ...st, absent: [...(st.absent || []), pat] });
        }
      } else if (c && c.thu) {
        const fn = TESTS[c.thu];
        if (!fn) throw new Error('Phép thử không hỗ trợ: ' + c.thu);
        for (const st of states) if (fn(resolve(c.a, st.b), resolve(c.b, st.b))) next.push(st);
      }
      states = next;
      if (!states.length) break;
    }
    return states;
  }

  function fill(template, b) {
    return String(template).replace(/\{(\?[A-Za-z0-9_]+)\}/g, (_, v) => (v in b ? String(b[v]) : v));
  }

  // Suy diễn tiến tới điểm bất động; ghi lại nguồn gốc mỗi sự kiện suy ra để giải thích.
  function infer(initialFacts, rules = RULES, opts = {}) {
    const fb = createFactBase(initialFacts);
    const derivedBy = new Map();
    const deriveRules = rules.filter(r => r.thi);
    const maxRounds = opts.maxRounds || 20;
    for (let round = 0; round < maxRounds; round++) {
      let added = 0;
      for (const r of deriveRules) {
        for (const st of matchConditions(r.neu, fb)) {
          for (const tpl of r.thi) {
            const f = tpl.map(t => resolve(t, st.b));
            if (f.some(x => x === undefined)) continue;
            if (fb.add(f)) { added++; derivedBy.set(factKey(f), { rule: r.id, from: st.used }); }
          }
        }
      }
      if (!added) break;
    }
    const findings = [];
    const seen = new Set();
    for (const r of rules.filter(r => r.vi_pham)) {
      for (const st of matchConditions(r.neu, fb)) {
        const message = fill(r.vi_pham, st.b);
        const k = r.id + '|' + message;
        if (seen.has(k)) continue;
        seen.add(k);
        findings.push({
          rule: r.id, muc: r.muc || 'chan', message,
          can_cu: Array.isArray(r.can_cu) ? r.can_cu : (r.can_cu ? [r.can_cu] : []),
          bindings: st.b,
          because: st.used.map(f => ({ fact: f, derived: derivedBy.get(factKey(f)) || null })),
          // Điều kiện phủ định: điều gì không có, và những gì đang có cùng chủ thể + vị từ.
          absent: list(st.absent).map(pat => ({
            pattern: pat,
            present: fb.candidates(pat[0], pat[1]).filter(f => f[0] === pat[0] && f[1] === pat[1])
              .map(f => ({ fact: f, derived: derivedBy.get(factKey(f)) || null }))
          }))
        });
      }
    }
    return { facts: fb.facts, findings, derivedBy };
  }

  // Câu giải thích "vì sao" cho một kết luận: luật, sự kiện dẫn tới, luật suy ra trung gian, căn cứ.
  const PRED_LABELS = { cap_hoc: 'thuộc cấp', cho_phep_dang: 'được dùng dạng', la: 'là', khoi: 'thuộc khối' };
  function human(t) {
    const s = String(t);
    if (s.startsWith('de:')) return 'đề';
    if (s.startsWith('cau:')) return 'câu';
    if (s.startsWith('bai:')) return 'bài ' + s.slice(4);
    return PRED_LABELS[s] || (s === 'dinh_ki' ? 'đánh giá định kì' : s);
  }
  const humanFact = (f) => f.map(t => (isVar(t) ? '…' : human(t))).join(' ');

  function explain(finding, rules = RULES) {
    const byId = new Map(rules.map(r => [r.id, r]));
    const lines = [`${finding.muc === 'chan' ? 'Chặn' : 'Cảnh báo'} [${finding.rule}]: ${finding.message}`];
    for (const b of finding.because) {
      if (!b.derived) continue;
      const r = byId.get(b.derived.rule);
      lines.push(`  vì suy ra “${humanFact(b.fact)}” theo luật ${b.derived.rule}${r?.mo_ta ? ' (' + r.mo_ta + ')' : ''}`);
    }
    for (const a of list(finding.absent)) {
      const shown = humanFact(a.pattern);
      if (!a.present.length) { lines.push(`  vì không có “${shown}”`); continue; }
      const present = a.present.map(p => {
        const r = p.derived ? byId.get(p.derived.rule) : null;
        return String(p.fact[2]) + (p.derived ? ` (suy ra theo luật ${p.derived.rule}${r?.mo_ta ? ': ' + r.mo_ta : ''})` : '');
      });
      lines.push(`  vì không có “${shown}”; chỉ có: ${present.join(', ')}`);
    }
    for (const c of finding.can_cu) lines.push('  căn cứ: ' + c);
    return lines.join('\n');
  }

  // ------------------------------------------------------------------------------------------
  // SỰ KIỆN TỪ MỘT ĐỀ
  // ------------------------------------------------------------------------------------------
  // Khóa nội dung câu: dùng chung với đối chiếu đề cương và tạo đề (core.questionKeys).
  function contentKey(q) { return core.questionKeys(q).match; }

  function ppctLookup(ppct) {
    const lessons = new Map();
    for (const l of list(ppct?.lessons)) {
      if (!l || !text(l.lesson_code)) continue;
      lessons.set(`${norm(l.subject_name || 'Tin học')}|${Number(l.grade)}|${norm(l.lesson_code)}`, l);
    }
    return lessons;
  }

  const STATUS_LABELS = { draft: 'bản nháp', pending_review: 'chờ duyệt', content_checked: 'chờ duyệt', needs_review: 'cần sửa lại', approved: 'đã duyệt', archived: 'lưu trữ' };

  function weekOf(l) {
    const raws = [l?.week_raw, ...list(l?.occurrences).map(o => (o && typeof o === 'object' ? o.week_raw : o))];
    let best = null;
    for (const raw of raws) {
      const m = String(raw ?? '').match(/(\d{1,2})/);
      if (m) { const n = Number(m[1]); if (n > 0 && (best === null || n < best)) best = n; }
    }
    return best;
  }

  // opts: { revision (đề cương), ppct, scopeWeek (kiểm tra đến hết tuần), threshold (%) }
  function examFacts(exam, opts = {}) {
    const e = exam || {};
    const d = 'de:' + (e.id || 'moi');
    const F = [];
    const subj = text(e.subject_name) || 'Tin học';
    F.push([d, 'la', 'de'], [d, 'khoi', Number(e.grade)], [d, 'mon', norm(subj)]);
    if (norm(subj) === norm('Tin học')) F.push([d, 'mon_tin_hoc', true]);
    if (text(e.exam_type)) F.push([d, 'loai_kiem_tra', e.exam_type]);
    if (Number.isFinite(Number(e.duration)) && e.duration !== null && e.duration !== undefined) F.push([d, 'thoi_gian', Number(e.duration)]);
    const allowed = list(e.allowed_kinds).filter(Boolean);
    F.push([d, 'khai_dang_rieng', allowed.length > 0]);
    allowed.forEach(k => F.push([d, 'cho_phep_dang', k]));
    const qs = list(e.questions);
    F.push([d, 'so_cau', qs.length]);
    const total = qs.reduce((n, q) => n + (Number(q?.points) || 0), 0);
    F.push([d, 'tong_diem', Math.round(total * 1000) / 1000]);
    const scopeWeek = Number(opts.scopeWeek ?? e.scope_week);
    if (Number.isInteger(scopeWeek) && scopeWeek > 0) F.push([d, 'kiem_tra_den_tuan', scopeWeek]);

    const lessons = ppctLookup(opts.ppct || e.ppct_snapshot);
    const rev = opts.revision === undefined ? (e.revision_snapshot || null) : opts.revision;
    const revKeys = new Set(list(rev?.questions).map(contentKey));
    // YCCĐ theo mã cố định khi tra được trong PPCT (đổi câu chữ YCCĐ không làm lệch đối chiếu).
    const outcomeKey = q => { const l = lessons.get(`${norm(text(q?.subject_name) || subj)}|${Number(q?.grade)}|${norm(q?.lesson_code)}`); const r = l && core.resolveOutcome(l, { id: q?.learning_outcome_id, text: q?.learning_outcome }); return norm(q?.lesson_code) + '|' + (r ? 'id:' + r.id : 't:' + norm(q?.learning_outcome)); };
    const revOutcomes = new Set(list(rev?.questions).map(outcomeKey));
    F.push([d, 'co_de_cuong', Boolean(rev)]);
    const seenKey = new Map();
    let inRev = 0;
    qs.forEach((q, i) => {
      const c = 'cau:' + (q?.id || i) + '#' + i;
      const n = q?.slot_number || q?.number || i + 1;
      F.push([d, 'co_cau', c], [c, 'so_thu_tu', n], [c, 'khoi', Number(q?.grade)], [c, 'mon', norm(text(q?.subject_name) || subj)],
        [c, 'trang_thai', q?.review_status || 'draft'], [c, 'trang_thai_ten', STATUS_LABELS[q?.review_status || 'draft'] || String(q?.review_status)],
        [c, 'ma_bai', text(q?.lesson_code) || '(trống)']);
      if (q?.type) F.push([c, 'la_dang', q.type]);
      if (q?.level) F.push([c, 'o_muc_do', q.level]);
      const key = contentKey(q), stem = core.questionKeys(q).stem;
      const prev = seenKey.get(stem);
      if (prev && norm(q?.question)) F.push([c, 'trung_voi', prev.c], [c, 'muc_trung', core.RELATION_LABELS[core.questionRelation(prev.q, q)] || 'cùng lời dẫn']);
      else seenKey.set(stem, { c, q });
      const lesson = lessons.get(`${norm(text(q?.subject_name) || subj)}|${Number(q?.grade)}|${norm(q?.lesson_code)}`);
      if (lesson) {
        F.push([c, 'thuoc_bai_ppct', true]);
        if (core.resolveOutcome(lesson, { id: q?.learning_outcome_id, text: q?.learning_outcome })) F.push([c, 'danh_gia_yccd_ppct', true]);
        const w = weekOf(lesson);
        if (w !== null) F.push([c, 'tuan_bat_dau', w]);
        for (const code of list(lesson.prerequisites)) {
          const pre = lessons.get(`${norm(lesson.subject_name || subj)}|${Number(lesson.grade)}|${norm(code)}`);
          if (!pre) continue;
          const p = 'bai:' + norm(code);
          F.push([c, 'can_bai_tien_de', p], [p, 'ma', String(code)]);
          const pw = weekOf(pre);
          if (pw !== null) F.push([p, 'tuan_bat_dau', pw]);
        }
      }
      if (rev) {
        const isIn = revKeys.has(key);
        if (isIn) inRev++;
        F.push([c, 'trong_de_cuong', isIn]);
        if (revOutcomes.has(outcomeKey(q))) F.push([c, 'yccd_trong_de_cuong', true]);
      }
    });
    if (rev) {
      const threshold = Number(opts.threshold ?? e.similarity_target_percent ?? 90);
      F.push([d, 'so_cau_trong_de_cuong', inRev], [d, 'so_cau_can_tu_de_cuong', Math.ceil(qs.length * threshold / 100)]);
    }
    return F;
  }

  // Kiểm một đề bằng kho luật. data: workspace (để tìm đề cương nếu đề chưa có bản chụp).
  function checkExam(data, exam, opts = {}) {
    const e = exam || {};
    let revision = opts.revision;
    if (revision === undefined) {
      revision = e.revision_snapshot || (e.revision_id ? list(data?.revisions).find(r => r.id === e.revision_id) : null) || null;
    }
    const ppct = opts.ppct || e.ppct_snapshot || data?.bank?.ppct;
    const facts = examFacts(e, { ...opts, revision, ppct });
    const result = infer(facts, opts.rules || RULES);
    const blocking = result.findings.filter(f => f.muc === 'chan');
    const warnings = result.findings.filter(f => f.muc !== 'chan');
    return {
      passed: blocking.length === 0,
      errors: blocking.map(f => ({ rule: f.rule, message: f.message, can_cu: f.can_cu, explanation: explain(f, opts.rules || RULES) })),
      warnings: warnings.map(f => ({ rule: f.rule, message: f.message, can_cu: f.can_cu, explanation: explain(f, opts.rules || RULES) })),
      facts_count: result.facts.length,
      derived_count: result.derivedBy.size
    };
  }

  // Danh sách luật để tổ chuyên môn đọc (mã, loại, nội dung, căn cứ).
  function describeRules(rules = RULES) {
    return rules.map(r => ({
      id: r.id, loai: r.thi ? 'suy_ra' : (r.muc === 'canh_bao' ? 'canh_bao' : 'chan'),
      noi_dung: r.mo_ta || r.vi_pham, can_cu: Array.isArray(r.can_cu) ? r.can_cu : (r.can_cu ? [r.can_cu] : [])
    }));
  }

  return { RULES, CAN_CU, infer, explain, examFacts, checkExam, describeRules, matchConditions, createFactBase, contentKey };
});
