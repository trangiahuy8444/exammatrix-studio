/*
 * Đồ thị tri thức chương trình (Giai đoạn 1–5 + Lược đồ + Năng lực/Chỉ báo/NLS/AI + Bản chụp,
 * docs/KE_HOACH_DO_THI_TRI_THUC.md & docs/KE_HOACH_GIAO_ANTIGRAVITY.md).
 * Thuần, không I/O: dựng đồ thị từ dữ liệu sẵn có (PPCT, câu hỏi, ma trận, đề cương, đề),
 * không nhập tay lại và không lưu riêng. Chạy được trong trình duyệt và Node (UMD).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BankKnowledgeGraph = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const core = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./core.js')
    : (typeof window !== 'undefined' ? window.BankCore : globalThis.BankCore);

  const LEVELS = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
  const KINDS = ['MC', 'YN', 'SHORT', 'ES'];
  const KIND_LABELS = { MC: 'Trắc nghiệm nhiều lựa chọn', YN: 'Đúng/Sai', SHORT: 'Trả lời ngắn', ES: 'Tự luận' };
  const COMPETENCY_RE = /\bNL\s*([a-eA-E])\b/g;
  const NLS_CODE_RE = /([1-6]\.[1-6])\.(CB[12]|TC[12]|NC[12])([a-z])?/gi;
  const AI_CODE_RE = /\b(\d{1,2})\.([A-D][1-5])\.(MR)?(\d+)\b/g;

  // Lược đồ (ontology) khai báo bằng dữ liệu: loại nút, vị từ, đầu/cuối hợp lệ, số lượng và cạnh bắt buộc.
  const SCHEMA = Object.freeze({
    node_types: [
      'mon', 'khoi', 'chude', 'bai', 'yccd',
      'nangluc', 'chibao', 'nangluc_so', 'giao_duc_ai',
      'mucdo', 'dang', 'cau', 'matran', 'o_ma_tran', 'decuong', 'de'
    ],
    predicates: {
      thuoc_mon: { from: ['khoi'], to: ['mon'], card: '1' },
      thuoc_khoi: { from: ['chude'], to: ['khoi'], card: '1' },
      thuoc_chu_de: { from: ['bai'], to: ['chude'], card: '1' },
      kiem_tra_bai: { from: ['cau'], to: ['bai'], card: '0..1' },
      thuoc_ma_tran: { from: ['o_ma_tran'], to: ['matran'], card: '1' },
      co_yccd: { from: ['bai'], to: ['yccd'], card: '0..n' },
      phat_trien: { from: ['bai', 'yccd', 'cau'], to: ['nangluc', 'nangluc_so', 'giao_duc_ai'], card: '0..n' },
      dat_chi_bao: { from: ['yccd'], to: ['chibao'], card: '0..n' },
      thuoc_nang_luc: { from: ['chibao'], to: ['nangluc'], card: '0..1' },
      danh_gia: { from: ['cau'], to: ['yccd'], card: '0..n' },
      o_muc_do: { from: ['cau', 'o_ma_tran'], to: ['mucdo'], card: '0..1' },
      la_dang: { from: ['cau', 'o_ma_tran'], to: ['dang'], card: '0..1' },
      nam_trong: { from: ['cau'], to: ['decuong', 'de'], card: '0..n' },
      can_cu: { from: ['o_ma_tran', 'matran', 'de'], to: ['bai', 'yccd', 'matran', 'decuong'], card: '0..n' },
      tien_de: { from: ['bai'], to: ['bai'], card: '0..n' }
    },
    required_edges: {
      khoi: ['thuoc_mon'],
      chude: ['thuoc_khoi'],
      bai: ['thuoc_chu_de'],
      o_ma_tran: ['thuoc_ma_tran', 'can_cu']
    }
  });

  const list = x => (Array.isArray(x) ? x : []);
  const text = x => (typeof x === 'string' ? x.trim() : '');
  const norm = x => String(x || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const slug = x => norm(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'khac';
  const subjectOf = x => text(x) || 'Tin học';

  function lessonName(l) {
    return text(l?.lesson_name) || text(l?.lesson_name_source) || text(l?.title) || text(l?.lesson_code);
  }

  function outcomeText(o) {
    if (typeof o === 'string') return o.trim();
    if (o && typeof o === 'object') return text(o.text) || text(o.outcome) || text(o.content);
    return '';
  }

  // "Tuần 7", "Tuần 7-8", "7" -> số tuần nhỏ nhất; không đọc được -> null
  function firstWeek(l) {
    const raws = [l?.week_raw, ...list(l?.occurrences).map(o => (o && typeof o === 'object' ? o.week_raw : o))];
    let best = null;
    for (const raw of raws) {
      const m = String(raw ?? '').match(/(\d{1,2})/);
      if (!m) continue;
      const n = Number(m[1]);
      if (Number.isInteger(n) && n > 0 && (best === null || n < best)) best = n;
    }
    return best;
  }

  function competencyCodes(values) {
    const out = new Set();
    for (const v of list(values)) {
      const s = String(v || '');
      let m;
      COMPETENCY_RE.lastIndex = 0;
      while ((m = COMPETENCY_RE.exec(s))) out.add('NL' + m[1].toLowerCase());
    }
    return [...out].sort();
  }

  // Mã Khung năng lực số (TT 02/2025/TT-BGDĐT & CV 3456/BGDĐT-GDPT), vd: 1.1.TC2a
  function digitalCompetencyCodes(values) {
    const out = new Map();
    for (const v of list(values)) {
      const s = String(v || '');
      let m;
      NLS_CODE_RE.lastIndex = 0;
      while ((m = NLS_CODE_RE.exec(s))) {
        const comp = m[1];
        const lv = m[2].toUpperCase();
        const sub = m[3] ? m[3].toLowerCase() : '';
        const code = `${comp}.${lv}${sub}`;
        if (!out.has(code)) {
          out.set(code, { code, domain: comp.split('.')[0], component: comp, level: lv, sub });
        }
      }
    }
    return [...out.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  // Mã Khung nội dung giáo dục AI (QĐ 2422/QĐ-BGDĐT & CV 5588/BGDĐT-GDPT), vd: 8.A1.1, 10.C1.MR1
  function aiEducationCodes(values) {
    const out = new Map();
    for (const v of list(values)) {
      const s = String(v || '');
      let m;
      AI_CODE_RE.lastIndex = 0;
      while ((m = AI_CODE_RE.exec(s))) {
        const code = `${Number(m[1])}.${m[2].toUpperCase()}.${m[3] ? 'MR' : ''}${m[4]}`;
        if (!out.has(code)) {
          out.set(code, { code, grade: Number(m[1]), strand: m[2].toUpperCase(), extended: Boolean(m[3]) });
        }
      }
    }
    return [...out.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  const ids = {
    mon: (s) => `mon:${slug(s)}`,
    khoi: (s, g) => `khoi:${slug(s)}:${g}`,
    chude: (s, g, t) => `chude:${slug(s)}:${g}:${slug(t)}`,
    bai: (s, g, code) => `bai:${slug(s)}:${g}:${String(code).trim()}`,
    yccd: (outcomeId) => `yccd:${outcomeId}`,
    o_ma_tran: (mid, code, level, kind) => `o2d:${mid}:${String(code).trim()}:${slug(level)}:${kind || 'all'}`,
    nangluc: (c) => `nangluc:${c}`,
    chibao: (code) => `chibao:${String(code).trim()}`,
    nangluc_so: (code) => `nls:${String(code).trim()}`,
    giao_duc_ai: (code) => `ai:${String(code).trim()}`,
    mucdo: (l) => `mucdo:${slug(l)}`,
    dang: (k) => `dang:${k}`,
    cau: (id) => `cau:${id}`,
    matran: (id) => `matran:${id}`,
    decuong: (id) => `decuong:${id}`,
    de: (id) => `de:${id}`
  };

  function createGraph() {
    const nodes = new Map();
    const edges = [];
    const edgeKeys = new Set();
    const out = new Map();
    const inc = new Map();
    const g = {
      nodes, edges,
      addNode(id, type, label, props) {
        if (!nodes.has(id)) nodes.set(id, { id, type, label: label || id, props: { ...(props || {}) } });
        else if (props) Object.assign(nodes.get(id).props, props);
        return nodes.get(id);
      },
      addEdge(s, p, o, props) {
        const key = s + '\u0001' + p + '\u0001' + o;
        if (edgeKeys.has(key)) {
          if (props) {
            const found = list(out.get(s)).find(e => e.p === p && e.o === o);
            if (found) found.props = { ...(found.props || {}), ...props };
          }
          return;
        }
        edgeKeys.add(key);
        const cleanProps = props ? Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined)) : null;
        const e = { s, p, o, ...(cleanProps && Object.keys(cleanProps).length ? { props: cleanProps } : {}) };
        edges.push(e);
        if (!out.has(s)) out.set(s, []);
        if (!inc.has(o)) inc.set(o, []);
        out.get(s).push(e);
        inc.get(o).push(e);
      },
      node: (id) => nodes.get(id) || null,
      outgoing: (id, p) => list(out.get(id)).filter(e => !p || e.p === p),
      incoming: (id, p) => list(inc.get(id)).filter(e => !p || e.p === p),
      ofType: (type) => [...nodes.values()].filter(n => n.type === type),
      // Khớp mẫu bộ ba; phần tử null/undefined là "bất kì".
      match(s, p, o) {
        const pool = s ? list(out.get(s)) : o ? list(inc.get(o)) : edges;
        return pool.filter(e => (!s || e.s === s) && (!p || e.p === p) && (!o || e.o === o));
      },
      toJSON() {
        return { nodes: [...nodes.values()], edges: edges.map(e => ({ ...e })) };
      }
    };
    return g;
  }

  // Dựng đồ thị từ dữ liệu workspace. opts.subject lọc một môn (mặc định: mọi môn có trong dữ liệu).
  function buildGraph(data, opts = {}) {
    const g = createGraph();
    const bank = data?.bank || {};
    const wantSubject = opts.subject ? norm(opts.subject) : null;
    const keep = (s) => !wantSubject || norm(subjectOf(s)) === wantSubject;
    const ppctVersion = bank.ppct?.updated_at || null;

    LEVELS.forEach(l => g.addNode(ids.mucdo(l), 'mucdo', l));
    KINDS.forEach(k => g.addNode(ids.dang(k), 'dang', KIND_LABELS[k], { code: k }));

    const lessonIndex = new Map();
    const lessonObj = new Map(); // baiId -> bài trong PPCT

    for (const l of list(bank.ppct?.lessons)) {
      if (!l || !text(l.lesson_code) || !keep(l.subject_name)) continue;
      const subj = subjectOf(l.subject_name);
      const grade = Number(l.grade);
      if (!Number.isInteger(grade)) continue;
      const prov = { nguon: 'ppct', phien_ban: l.updated_at || ppctVersion || null };
      const monId = g.addNode(ids.mon(subj), 'mon', subj).id;
      const khoiId = g.addNode(ids.khoi(subj, grade), 'khoi', `${subj} ${grade}`, { grade, subject_name: subj }).id;
      g.addEdge(khoiId, 'thuoc_mon', monId, prov);
      const topic = text(l.topic) || text(l.topic_source) || 'Chưa ghi chủ đề';
      const chudeId = g.addNode(ids.chude(subj, grade, topic), 'chude', topic, { grade, subject_name: subj }).id;
      g.addEdge(chudeId, 'thuoc_khoi', khoiId, prov);
      const baiId = ids.bai(subj, grade, l.lesson_code);
      g.addNode(baiId, 'bai', `${l.lesson_code}. ${lessonName(l)}`, {
        grade, subject_name: subj, lesson_code: String(l.lesson_code).trim(), name: lessonName(l),
        section: l.section || 'core', first_week: firstWeek(l),
        prerequisites: list(l.prerequisites).map(String)
      });
      g.addEdge(baiId, 'thuoc_chu_de', chudeId, prov);
      lessonIndex.set(`${norm(subj)}|${grade}|${norm(l.lesson_code)}`, baiId);
      lessonObj.set(baiId, l);

      // Năng lực cấp bài (chỉ gắn vào nút bài, KHÔNG tự gắn vào mọi YCCĐ của bài).
      const lessonComps = competencyCodes([...list(l.competencies), ...list(l.digital_competencies)]);
      lessonComps.forEach(c => {
        g.addNode(ids.nangluc(c), 'nangluc', c);
        g.addEdge(baiId, 'phat_trien', ids.nangluc(c), prov);
      });
      // Năng lực số (TT 02/2025 & CV 3456) và Giáo dục AI (QĐ 2422 & CV 5588) từ digital_competencies của PPCT.
      const digRaw = [...list(l.digital_competencies), ...list(l.competencies)];
      digitalCompetencyCodes(digRaw).forEach(nc => {
        const nId = g.addNode(ids.nangluc_so(nc.code), 'nangluc_so', nc.code, {
          ...nc, can_cu: 'TT 02/2025/TT-BGDĐT; CV 3456/BGDĐT-GDPT'
        }).id;
        g.addEdge(baiId, 'phat_trien', nId, prov);
      });
      aiEducationCodes(digRaw).forEach(ac => {
        const aId = g.addNode(ids.giao_duc_ai(ac.code), 'giao_duc_ai', ac.code, {
          ...ac, can_cu: 'QĐ 2422/QĐ-BGDĐT; CV 5588/BGDĐT-GDPT'
        }).id;
        g.addEdge(baiId, 'phat_trien', aId, prov);
      });

      const outcomeIds = core.lessonOutcomeIds(l);
      const outcomeCompsArr = Array.isArray(l.outcome_competencies) ? l.outcome_competencies : [];
      list(l.outcomes).forEach((o, i) => {
        const t = outcomeText(o);
        if (!t) return;
        const yId = g.addNode(ids.yccd(outcomeIds[i]), 'yccd', t, {
          grade, subject_name: subj, lesson_code: String(l.lesson_code).trim(), index: i, outcome_id: outcomeIds[i]
        }).id;
        g.addEdge(baiId, 'co_yccd', yId, prov);
        // Chỉ gắn năng lực cho YCCĐ từ PPCT khi PPCT ghi riêng cho từng YCCĐ.
        const rawOutComp = (o && typeof o === 'object' && (o.competencies || o.competency))
          ? [o.competencies, o.competency].flat()
          : (outcomeCompsArr[i] ? [outcomeCompsArr[i]].flat() : []);
        competencyCodes(rawOutComp).forEach(c => {
          g.addNode(ids.nangluc(c), 'nangluc', c);
          g.addEdge(yId, 'phat_trien', ids.nangluc(c), prov);
        });
      });
    }

    // Quan hệ tiền đề (hỗ trợ cả cùng khối 'B1' lẫn liên khối '8:B12').
    for (const n of g.ofType('bai')) {
      const lObj = lessonObj.get(n.id);
      const prov = { nguon: 'ppct', phien_ban: lObj?.updated_at || ppctVersion || null };
      for (const rawCode of n.props.prerequisites) {
        const pr = core.parsePrerequisite
          ? core.parsePrerequisite(rawCode, n.props.grade)
          : { grade: n.props.grade, lesson_code: String(rawCode).trim() };
        if (!pr || pr.grade === null) continue;
        const pre = lessonIndex.get(`${norm(n.props.subject_name)}|${pr.grade}|${norm(pr.lesson_code)}`);
        if (pre && pre !== n.id) g.addEdge(pre, 'tien_de', n.id, prov);
      }
    }

    const linkQuestion = (q, extraProv = null) => {
      if (!q || !text(q.id) || !keep(q.subject_name)) return null;
      const subj = subjectOf(q.subject_name);
      const grade = Number(q.grade);
      const cId = ids.cau(q.id);
      const prov = extraProv || { nguon: 'nganhang', phien_ban: q.updated_at || q.approved_at || q.created_at || null };
      g.addNode(cId, 'cau', text(q.question).slice(0, 80) || q.id, {
        question_id: q.id, grade, subject_name: subj, lesson_code: text(q.lesson_code),
        level: q.level, type: q.type, review_status: q.review_status || 'draft',
        learning_outcome: text(q.learning_outcome), learning_outcome_id: text(q.learning_outcome_id), competency: text(q.competency)
      });
      if (LEVELS.includes(q.level)) g.addEdge(cId, 'o_muc_do', ids.mucdo(q.level), prov);
      if (KINDS.includes(q.type)) g.addEdge(cId, 'la_dang', ids.dang(q.type), prov);
      const baiId = lessonIndex.get(`${norm(subj)}|${grade}|${norm(q.lesson_code)}`);
      if (baiId) g.addEdge(cId, 'kiem_tra_bai', baiId, prov);
      const hit = baiId ? core.resolveOutcome(lessonObj.get(baiId), { id: q.learning_outcome_id, text: q.learning_outcome }) : null;
      if (hit) g.addEdge(cId, 'danh_gia', ids.yccd(hit.id), { ...prov, theo: hit.how === 'ma' ? 'ma' : 'chu' });
      for (const c of competencyCodes([q.competency])) {
        g.addNode(ids.nangluc(c), 'nangluc', c);
        g.addEdge(cId, 'phat_trien', ids.nangluc(c), prov);
      }
      return cId;
    };
    list(bank.questions).forEach(q => linkQuestion(q));

    const addMatrix = (m) => {
      if (!m || !text(m.id) || !keep(m.subject_name)) return null;
      const subj = subjectOf(m.subject_name);
      const prov = { nguon: 'matran', phien_ban: m.updated_at || m.locked_at || m.created_at || null };
      const mId = g.addNode(ids.matran(m.id), 'matran', text(m.title) || m.id, {
        grade: m.grade, subject_name: subj, exam_type: m.exam_type, status: m.status
      }).id;
      const catalogIndByCode = new Map();
      for (const ind of list(m.indicator_catalog)) {
        if (!ind || !text(ind.code)) continue;
        const code = text(ind.code), comp = competencyCodes([ind.competency])[0] || text(ind.competency);
        const cbId = g.addNode(ids.chibao(code), 'chibao', text(ind.text) || code, {
          code, competency: comp, text: text(ind.text), matrix_id: m.id
        }).id;
        catalogIndByCode.set(code, { id: cbId, competency: comp });
        if (comp) {
          const nlId = g.addNode(ids.nangluc(comp), 'nangluc', comp).id;
          g.addEdge(cbId, 'thuoc_nang_luc', nlId, prov);
        }
      }
      const reqById = new Map(list(m.requirements).map(r => [r.id, r]));
      const indByReqId = new Map();
      const cellNeed = new Map();
      for (const slot of list(m.slots)) {
        for (const part of list(slot?.parts)) {
          const r = reqById.get(part?.requirement_id);
          if (!r) continue;
          const k = [r.lesson_code, r.level, slot.kind].join('|');
          cellNeed.set(k, (cellNeed.get(k) || 0) + 1);
          if (text(part.indicator)) {
            if (!indByReqId.has(r.id)) indByReqId.set(r.id, new Set());
            indByReqId.get(r.id).add(text(part.indicator));
          }
        }
      }
      for (const [k, need] of cellNeed) {
        const [code, level, kind] = k.split('|');
        const baiId = lessonIndex.get(`${norm(subj)}|${Number(m.grade)}|${norm(code)}`);
        if (!baiId) continue;
        const oId = g.addNode(ids.o_ma_tran(m.id, code, level, kind), 'o_ma_tran', `${code} · ${level} · ${kind}`, { matrix_id: m.id, lesson_code: code, level, kind, need }).id;
        g.addEdge(oId, 'thuoc_ma_tran', mId, prov);
        g.addEdge(oId, 'can_cu', baiId, prov);
        if (LEVELS.includes(level)) g.addEdge(oId, 'o_muc_do', ids.mucdo(level), prov);
        if (KINDS.includes(kind)) g.addEdge(oId, 'la_dang', ids.dang(kind), prov);
      }
      for (const r of list(m.requirements)) {
        const baiId = lessonIndex.get(`${norm(subj)}|${Number(m.grade)}|${norm(r.lesson_code)}`);
        if (baiId) g.addEdge(mId, 'can_cu', baiId, prov);
        if (r.outcome_mode === 'any' || !baiId) continue;
        const hit = core.resolveOutcome(lessonObj.get(baiId), { id: r.ppct_outcome_id, index: r.ppct_outcome_index });
        if (!hit) continue;
        const yId = ids.yccd(hit.id);
        g.addEdge(mId, 'can_cu', yId, { ...prov, level: r.level, requirement_id: r.id });
        const reqComps = competencyCodes([r.competency]);
        for (const c of reqComps) {
          g.addNode(ids.nangluc(c), 'nangluc', c);
          g.addEdge(yId, 'phat_trien', ids.nangluc(c), prov);
        }
        const indCodes = new Set([...(indByReqId.get(r.id) || [])]);
        if (text(r.indicator)) indCodes.add(text(r.indicator));
        if (text(r.indicator_code)) indCodes.add(text(r.indicator_code));
        for (const code of indCodes) {
          const cat = catalogIndByCode.get(code);
          const cbId = cat ? cat.id : g.addNode(ids.chibao(code), 'chibao', code, { code, competency: reqComps[0] || '' }).id;
          g.addEdge(yId, 'dat_chi_bao', cbId, prov);
          const comp = cat?.competency || reqComps[0];
          if (comp) {
            const nlId = g.addNode(ids.nangluc(comp), 'nangluc', comp).id;
            g.addEdge(cbId, 'thuoc_nang_luc', nlId, prov);
          }
        }
      }
      return mId;
    };
    list(data?.matrices).forEach(addMatrix);

    const addRevision = (r) => {
      if (!r || !text(r.id) || !keep(r.subject_name)) return null;
      const prov = { nguon: 'decuong', phien_ban: r.updated_at || r.created_at || null };
      const rId = g.addNode(ids.decuong(r.id), 'decuong', text(r.title) || r.id, {
        grade: r.grade, subject_name: subjectOf(r.subject_name), status: r.status || null
      }).id;
      for (const q of list(r.questions)) {
        const cId = g.node(ids.cau(q?.id)) ? ids.cau(q.id) : linkQuestion(q, prov);
        if (cId) g.addEdge(cId, 'nam_trong', rId, prov);
      }
      return rId;
    };
    list(data?.revisions).forEach(addRevision);

    for (const r of list(data?.exams)) {
      if (!r || !text(r.id) || !keep(r.subject_name)) continue;
      const prov = { nguon: 'de', phien_ban: r.updated_at || r.locked_at || r.created_at || null };
      const rId = g.addNode(ids.de(r.id), 'de', text(r.title) || r.id, {
        grade: r.grade, subject_name: subjectOf(r.subject_name), status: r.status || null
      }).id;
      for (const q of list(r.questions)) {
        const cId = g.node(ids.cau(q?.id)) ? ids.cau(q.id) : linkQuestion(q, prov);
        if (cId) g.addEdge(cId, 'nam_trong', rId, prov);
      }
      if (text(r.matrix_id)) {
        const mNodeId = g.node(ids.matran(r.matrix_id)) ? ids.matran(r.matrix_id) : (r.matrix_snapshot ? addMatrix(r.matrix_snapshot) : null);
        if (mNodeId) g.addEdge(rId, 'can_cu', mNodeId, prov);
      }
      if (text(r.revision_id)) {
        const dNodeId = g.node(ids.decuong(r.revision_id)) ? ids.decuong(r.revision_id) : (r.revision_snapshot ? addRevision(r.revision_snapshot) : null);
        if (dNodeId) g.addEdge(rId, 'can_cu', dNodeId, prov);
      }
    }

    return g;
  }

  // Dựng đồ thị từ bản chụp gắn với đề thi (PPCT/ma trận/đề cương tại thời điểm tạo đề) để báo cáo đề đã khóa không trôi theo sửa đổi về sau.
  function buildGraphForExam(exam, fallbackData = null) {
    const e = exam || {};
    const ppct = e.ppct_snapshot || fallbackData?.bank?.ppct || { lessons: [] };
    const matrices = e.matrix_snapshot
      ? [e.matrix_snapshot]
      : (e.matrix_id && Array.isArray(fallbackData?.matrices) ? fallbackData.matrices.filter(m => m && m.id === e.matrix_id) : []);
    const revisions = e.revision_snapshot
      ? [e.revision_snapshot]
      : (e.revision_id && Array.isArray(fallbackData?.revisions) ? fallbackData.revisions.filter(r => r && r.id === e.revision_id) : []);
    return buildGraph({
      bank: { ppct, questions: list(e.questions) },
      matrices,
      revisions,
      exams: e.id ? [e] : []
    }, { subject: e.subject_name });
  }

  // Kiểm tra đồ thị có khớp SCHEMA (loại nút, vị từ, đầu/cuối, bắt buộc, số lượng 1 / 0..1).
  function checkSchema(g) {
    const violations = [];
    const allowedNodeTypes = new Set(SCHEMA.node_types);
    for (const n of g.nodes.values()) {
      if (!allowedNodeTypes.has(n.type)) {
        violations.push({ code: 'schema_node_type', severity: 'loi', node: n.id,
          message: `Lược đồ: nút “${n.id}” có loại không hợp lệ (${n.type}).` });
      }
    }
    for (const e of g.edges) {
      const spec = SCHEMA.predicates[e.p];
      if (!spec) {
        violations.push({ code: 'schema_predicate', severity: 'loi', edge: { ...e },
          message: `Lược đồ: quan hệ “${e.p}” (${e.s} → ${e.o}) chưa khai báo trong lược đồ.` });
        continue;
      }
      const sNode = g.node(e.s), oNode = g.node(e.o);
      if (!sNode || !oNode) {
        violations.push({ code: 'schema_dangling', severity: 'loi', edge: { ...e },
          message: `Lược đồ: cạnh “${e.p}” (${e.s} → ${e.o}) thiếu nút đầu hoặc cuối.` });
        continue;
      }
      if (!spec.from.includes(sNode.type) || !spec.to.includes(oNode.type)) {
        violations.push({ code: 'schema_endpoint_type', severity: 'loi', edge: { ...e },
          message: `Lược đồ: quan hệ “${e.p}” không cho phép nối ${sNode.type} → ${oNode.type}.` });
      }
    }
    for (const n of g.nodes.values()) {
      for (const reqPred of list(SCHEMA.required_edges[n.type])) {
        if (!g.outgoing(n.id, reqPred).length) {
          violations.push({ code: 'schema_required_edge', severity: 'loi', node: n.id,
            message: `Lược đồ: nút ${n.type} “${n.label}” thiếu quan hệ bắt buộc “${reqPred}”.` });
        }
      }
      for (const [pred, spec] of Object.entries(SCHEMA.predicates)) {
        if ((spec.card === '1' || spec.card === '0..1') && spec.from.includes(n.type)) {
          const edgesOut = g.outgoing(n.id, pred);
          if (edgesOut.length > 1) {
            violations.push({ code: 'schema_cardinality', severity: 'loi', node: n.id,
              message: `Lược đồ: nút ${n.type} “${n.label}” có ${edgesOut.length} cạnh “${pred}” (chỉ cho phép ${spec.card}).` });
          }
        }
      }
    }
    return violations;
  }

  // Kiểm tra đồ thị: câu "mồ côi", YCCĐ không có câu, bài không có YCCĐ.
  function validateGraph(g, opts = {}) {
    const issues = [];
    const grade = opts.grade !== undefined ? Number(opts.grade) : null;
    const inScope = n => grade === null || Number(n.props.grade) === grade;
    for (const n of g.ofType('bai').filter(inScope)) {
      if (!g.outgoing(n.id, 'co_yccd').length) {
        issues.push({ code: 'bai_khong_yccd', severity: 'canh_bao', node: n.id, lesson_code: n.props.lesson_code,
          message: `Bài ${n.label} chưa có yêu cầu cần đạt trong PPCT.` });
      }
    }
    for (const n of g.ofType('cau').filter(inScope)) {
      if (!g.outgoing(n.id, 'kiem_tra_bai').some(e => g.node(e.o)?.type === 'bai')) {
        issues.push({ code: 'cau_ngoai_ppct', severity: 'loi', node: n.id, question_id: n.props.question_id,
          message: `Câu ${n.props.question_id}: bài “${n.props.lesson_code || '(trống)'}” không có trong PPCT Khối ${n.props.grade}.` });
      } else if (!g.outgoing(n.id, 'danh_gia').length) {
        const bai = g.outgoing(n.id, 'kiem_tra_bai').map(e => g.node(e.o)).find(x => x?.type === 'bai');
        const sugg = bai ? core.suggestOutcomes(lessonOf(g, bai.id), n.props.learning_outcome, 3) : [];
        issues.push({ code: 'cau_khong_yccd', severity: 'loi', node: n.id, question_id: n.props.question_id, suggestions: sugg,
          message: `Câu ${n.props.question_id}: YCCĐ “${n.props.learning_outcome || '(trống)'}” không khớp YCCĐ nào của bài ${n.props.lesson_code} trong PPCT.`
            + (sugg[0] ? ` Gần nhất: “${sugg[0].text}” (${sugg[0].id}).` : '') });
      }
    }
    for (const n of g.ofType('yccd').filter(inScope)) {
      const approved = g.incoming(n.id, 'danh_gia').filter(e => g.node(e.s)?.props.review_status === 'approved');
      if (!approved.length) {
        issues.push({ code: 'yccd_chua_co_cau', severity: 'canh_bao', node: n.id, lesson_code: n.props.lesson_code,
          message: `YCCĐ “${n.label}” (bài ${n.props.lesson_code}, Khối ${n.props.grade}) chưa có câu hỏi đã duyệt.` });
      }
    }
    return issues;
  }

  // Tình trạng mã YCCĐ của câu hỏi: nối theo mã / chỉ theo câu chữ (cần lưu mã) / không nối được (cần giáo viên chọn).
  function outcomeIdAudit(g, opts = {}) {
    const grade = opts.grade !== undefined ? Number(opts.grade) : null;
    const out = { theo_ma: 0, theo_chu: 0, khong_noi: 0, ngoai_ppct: 0 };
    for (const n of g.ofType('cau')) {
      if (grade !== null && Number(n.props.grade) !== grade) continue;
      if (!g.outgoing(n.id, 'kiem_tra_bai').some(e => g.node(e.o)?.type === 'bai')) { out.ngoai_ppct++; continue; }
      const es = g.outgoing(n.id, 'danh_gia');
      if (!es.length) out.khong_noi++;
      else if (es.some(e => e.props?.theo === 'ma')) out.theo_ma++;
      else out.theo_chu++;
    }
    return out;
  }

  // Dựng lại "bài" (YCCĐ + mã) từ đồ thị để tra gợi ý.
  function lessonOf(g, baiId) {
    const ys = g.outgoing(baiId, 'co_yccd').map(e => g.node(e.o)).filter(Boolean).sort((a, b) => a.props.index - b.props.index);
    const b = g.node(baiId);
    return { subject_name: b?.props.subject_name, grade: b?.props.grade, lesson_code: b?.props.lesson_code, outcomes: ys.map(y => y.label), outcome_ids: ys.map(y => y.props.outcome_id) };
  }

  // Ô ma trận (kể cả ô 2D nhận mọi YCCĐ của bài): cần bao nhiêu câu, ngân hàng có bao nhiêu câu đã duyệt đúng bài × mức độ × dạng.
  function matrixCells(g, matrixId) {
    return g.ofType('o_ma_tran').filter(o => !matrixId || o.props.matrix_id === matrixId).map(o => {
      const bai = g.outgoing(o.id, 'can_cu').map(e => e.o)[0];
      const qs = bai ? g.incoming(bai, 'kiem_tra_bai').map(e => g.node(e.s)).filter(n => n?.type === 'cau' && n.props.level === o.props.level && n.props.type === o.props.kind) : [];
      const approved = qs.filter(n => n.props.review_status === 'approved').length;
      return { matrix_id: o.props.matrix_id, lesson_code: o.props.lesson_code, level: o.props.level, kind: o.props.kind, need: o.props.need, approved, other: qs.length - approved, short: Math.max(0, o.props.need - approved) };
    }).sort((a, b) => String(a.lesson_code).localeCompare(String(b.lesson_code), 'vi', { numeric: true }) || LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
  }

  // Bảng phủ: mỗi YCCĐ × mức độ có bao nhiêu câu theo trạng thái duyệt + năng lực & chỉ báo gắn với YCCĐ đó.
  function coverage(g, opts = {}) {
    const grade = opts.grade !== undefined ? Number(opts.grade) : null;
    const rows = [];
    for (const y of g.ofType('yccd')) {
      if (grade !== null && Number(y.props.grade) !== grade) continue;
      const byLevel = {};
      LEVELS.forEach(l => { byLevel[l] = { approved: 0, other: 0 }; });
      for (const e of g.incoming(y.id, 'danh_gia')) {
        const q = g.node(e.s);
        if (!q || !byLevel[q.props.level]) continue;
        if (q.props.review_status === 'approved') byLevel[q.props.level].approved++;
        else byLevel[q.props.level].other++;
      }
      const compSet = new Set(g.outgoing(y.id, 'phat_trien').map(e => g.node(e.o)).filter(n => n?.type === 'nangluc').map(n => n.label));
      const indSet = new Set();
      for (const e of g.outgoing(y.id, 'dat_chi_bao')) {
        const cb = g.node(e.o);
        if (!cb) continue;
        indSet.add(cb.props?.code || cb.label);
        for (const ne of g.outgoing(cb.id, 'thuoc_nang_luc')) {
          const nl = g.node(ne.o);
          if (nl) compSet.add(nl.label);
        }
      }
      const parentBai = g.incoming(y.id, 'co_yccd').map(e => g.node(e.s)).find(n => n?.type === 'bai');
      const digCodes = parentBai ? g.outgoing(parentBai.id, 'phat_trien').map(e => g.node(e.o)).filter(n => n?.type === 'nangluc_so').map(n => n.label).sort() : [];
      const aiCodes = parentBai ? g.outgoing(parentBai.id, 'phat_trien').map(e => g.node(e.o)).filter(n => n?.type === 'giao_duc_ai').map(n => n.label).sort() : [];
      rows.push({
        yccd: y.id, text: y.label, grade: y.props.grade, lesson_code: y.props.lesson_code,
        competencies: [...compSet].sort(),
        indicators: [...indSet].sort(),
        digital_competencies: digCodes,
        ai_codes: aiCodes,
        levels: byLevel,
        approved_total: LEVELS.reduce((n, l) => n + byLevel[l].approved, 0),
        missing_levels: LEVELS.slice(0, 3).filter(l => byLevel[l].approved === 0)
      });
    }
    return rows.sort((a, b) => a.grade - b.grade || String(a.lesson_code).localeCompare(String(b.lesson_code), 'vi', { numeric: true }) || a.yccd.localeCompare(b.yccd));
  }

  function bigramsOf(s) {
    if (core && typeof core.questionBigrams === 'function') return core.questionBigrams(s);
    const w = norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
      .split(/[^a-z0-9]+/).filter(x => x.length > 1);
    const out = new Set();
    for (let i = 0; i + 1 < w.length; i++) out.add(w[i] + ' ' + w[i + 1]);
    if (!out.size && w.length === 1) out.add(w[0]);
    return out;
  }
  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    return inter / (a.size + b.size - inter);
  }

  // Câu tương tự: cùng YCCĐ (hoặc cùng bài), dùng cụm 2 từ + danh sách từ dừng tiếng Việt (core.questionBigrams).
  function similarQuestions(g, questions, questionId, opts = {}) {
    const threshold = opts.threshold ?? 0.5;
    const byId = new Map(list(questions).map(q => [q.id, q]));
    const target = byId.get(questionId);
    if (!target) return [];
    const cId = ids.cau(questionId);
    const ys = g.outgoing(cId, 'danh_gia').map(e => e.o);
    const bais = g.outgoing(cId, 'kiem_tra_bai').map(e => e.o);
    const peers = new Set();
    ys.forEach(y => g.incoming(y, 'danh_gia').forEach(e => peers.add(e.s)));
    if (!ys.length) bais.forEach(b => g.incoming(b, 'kiem_tra_bai').forEach(e => peers.add(e.s)));
    peers.delete(cId);
    const tt = bigramsOf(target.question);
    if (!tt.size) return [];
    const out = [];
    for (const p of peers) {
      const q = byId.get(g.node(p)?.props.question_id);
      if (!q) continue;
      const score = jaccard(tt, bigramsOf(q.question));
      if (score >= threshold) out.push({ question_id: q.id, score: Math.round(score * 100) / 100, same_outcome: ys.some(y => g.match(p, 'danh_gia', y).length) });
    }
    return out.sort((a, b) => b.score - a.score || a.question_id.localeCompare(b.question_id));
  }

  // Nhóm câu gần trùng: lập chỉ mục đảo theo cụm 2 từ (không so từng cặp trên cả ngân hàng).
  function nearDuplicateGroups(g, questions, opts = {}) {
    const grade = opts.grade !== undefined ? Number(opts.grade) : null;
    const threshold = opts.threshold ?? 0.8;
    const qs = list(questions).filter(q => q && text(q.id) && (grade === null || Number(q.grade) === grade));
    const vecs = new Map(), inv = new Map(), outcomesOf = new Map();
    for (const q of qs) {
      const b = bigramsOf(q.question);
      if (!b.size) continue;
      vecs.set(q.id, b);
      const cId = ids.cau(q.id);
      outcomesOf.set(q.id, new Set(g.outgoing(cId, 'danh_gia').map(e => e.o)));
      for (const bg of b) {
        if (!inv.has(bg)) inv.set(bg, []);
        inv.get(bg).push(q);
      }
    }
    const seen = new Set();
    const groups = [];
    for (const q of qs) {
      if (seen.has(q.id)) continue;
      const bq = vecs.get(q.id);
      if (!bq) continue;
      const candIds = new Set();
      for (const bg of bq) for (const peer of (inv.get(bg) || [])) if (peer.id !== q.id && !seen.has(peer.id)) candIds.add(peer.id);
      const qOuts = outcomesOf.get(q.id) || new Set();
      const sims = [];
      for (const pid of candIds) {
        const bp = vecs.get(pid);
        if (!bp) continue;
        // Chỉ nhóm nếu cùng YCCĐ (khi cả hai đều có) hoặc nội dung gần như trùng.
        const pOuts = outcomesOf.get(pid) || new Set();
        const shareOut = !qOuts.size || !pOuts.size || [...qOuts].some(y => pOuts.has(y));
        if (!shareOut && threshold < 0.85) continue;
        const sc = jaccard(bq, bp);
        if (sc >= threshold) sims.push({ question_id: pid, score: Math.round(sc * 100) / 100 });
      }
      if (!sims.length) continue;
      const members = [q.id, ...sims.map(s => s.question_id)];
      members.forEach(id => seen.add(id));
      groups.push({ question_ids: members, max_score: Math.max(...sims.map(s => s.score)) });
    }
    return groups;
  }

  // Gợi ý câu thay thế cho một ô thiếu (bài × YCCĐ × dạng × mức độ). Không bao giờ hạ mức độ hay đổi dạng.
  function suggestForCell(g, questions, cell) {
    const want = { grade: Number(cell.grade), lesson_code: norm(cell.lesson_code), type: cell.type, level: cell.level, outcome: norm(cell.learning_outcome) };
    const out = [];
    for (const q of list(questions)) {
      if (!q || Number(q.grade) !== want.grade || norm(q.lesson_code) !== want.lesson_code) continue;
      if (q.type !== want.type || q.level !== want.level) continue;
      if (want.outcome && norm(q.learning_outcome) !== want.outcome) continue;
      out.push({
        question_id: q.id, review_status: q.review_status || 'draft',
        action: q.review_status === 'approved' ? 'dung_ngay' : 'can_duyet',
        note: q.review_status === 'approved' ? 'Đã duyệt, dùng được ngay.' : 'Đúng ô nhưng chưa duyệt: cần duyệt trước khi dùng.'
      });
    }
    return out.sort((a, b) => (a.action === 'dung_ngay' ? 0 : 1) - (b.action === 'dung_ngay' ? 0 : 1) || a.question_id.localeCompare(b.question_id));
  }

  // Thứ tự ôn tập: sắp bài theo quan hệ tiền đề (Kahn), cùng hạng thì theo tuần rồi mã bài; hỗ trợ tiền đề liên khối (8:B12).
  function studyOrder(g, opts = {}) {
    const grade = opts.grade !== undefined ? Number(opts.grade) : null;
    const lessons = g.ofType('bai').filter(n => grade === null || Number(n.props.grade) === grade);
    const idSet = new Set(lessons.map(n => n.id));
    const indeg = new Map(lessons.map(n => [n.id, 0]));
    for (const n of lessons) for (const e of g.outgoing(n.id, 'tien_de')) if (idSet.has(e.o)) indeg.set(e.o, indeg.get(e.o) + 1);
    const key = n => [n.props.first_week ?? 999, n.props.lesson_code];
    const cmp = (a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || String(x[1]).localeCompare(String(y[1]), 'vi', { numeric: true }); };
    const ready = lessons.filter(n => indeg.get(n.id) === 0).sort(cmp);
    const order = [];
    while (ready.length) {
      const n = ready.shift();
      order.push(n);
      for (const e of g.outgoing(n.id, 'tien_de')) {
        if (!idSet.has(e.o)) continue;
        indeg.set(e.o, indeg.get(e.o) - 1);
        if (indeg.get(e.o) === 0) { ready.push(g.node(e.o)); ready.sort(cmp); }
      }
    }
    const cyclic = lessons.filter(n => !order.includes(n)).map(n => n.props.lesson_code);
    return {
      order: order.map(n => ({
        lesson_code: n.props.lesson_code, name: n.props.name, first_week: n.props.first_week,
        prerequisites: g.incoming(n.id, 'tien_de').map(e => {
          const s = g.node(e.s);
          if (!s) return null;
          return Number(s.props.grade) !== Number(n.props.grade)
            ? `${s.props.grade}:${s.props.lesson_code}`
            : s.props.lesson_code;
        }).filter(Boolean)
      })),
      cyclic
    };
  }

  // Gợi ý bài tiền đề theo thứ tự tuần trong PPCT (chỉ đọc; giáo viên xác nhận mới lưu).
  function suggestPrerequisites(g, opts = {}) {
    const grade = opts.grade !== undefined ? Number(opts.grade) : null;
    const lessons = g.ofType('bai')
      .filter(n => (grade === null || Number(n.props.grade) === grade) && Number.isInteger(n.props.first_week))
      .sort((a, b) => (a.props.first_week - b.props.first_week) || String(a.props.lesson_code).localeCompare(String(b.props.lesson_code), 'vi', { numeric: true }));
    const topicOf = n => g.outgoing(n.id, 'thuoc_chu_de').map(e => e.o)[0] || '';
    const suggestions = [];
    for (let i = 1; i < lessons.length; i++) {
      const cur = lessons[i];
      if (g.incoming(cur.id, 'tien_de').length) continue; // đã có tiền đề
      const sameTopicPrev = lessons.slice(0, i).reverse().find(p => p.props.first_week < cur.props.first_week && topicOf(p) === topicOf(cur));
      const prev = sameTopicPrev || lessons.slice(0, i).reverse().find(p => p.props.first_week < cur.props.first_week);
      if (!prev) continue;
      suggestions.push({
        grade: cur.props.grade,
        lesson_code: cur.props.lesson_code,
        name: cur.props.name,
        first_week: cur.props.first_week,
        suggested: [{
          lesson_code: prev.props.lesson_code,
          name: prev.props.name,
          first_week: prev.props.first_week,
          reason: sameTopicPrev ? `Cùng chủ đề, học trước ở tuần ${prev.props.first_week}` : `Bài liền trước theo tuần PPCT (tuần ${prev.props.first_week})`
        }]
      });
    }
    return suggestions;
  }

  // Bài nằm ngoài phạm vi khi kiểm tra đến hết tuần `untilWeek` (tuần bắt đầu học > untilWeek).
  function lessonsAfterWeek(g, grade, untilWeek, subject) {
    const w = Number(untilWeek);
    if (!Number.isInteger(w) || w < 1) return [];
    return g.ofType('bai')
      .filter(n => Number(n.props.grade) === Number(grade) && (!subject || norm(n.props.subject_name) === norm(subject)))
      .filter(n => Number.isInteger(n.props.first_week) && n.props.first_week > w)
      .map(n => n.props.lesson_code);
  }

  // Ngữ cảnh tri thức cho lời nhắc AI (Giai đoạn 5): YCCĐ, năng lực, NLS/AI, bài tiền đề của một bài.
  function lessonContext(g, subject, grade, lessonCode) {
    const baiId = ids.bai(subjectOf(subject), Number(grade), lessonCode);
    const bai = g.node(baiId);
    if (!bai) return null;
    const lessonComps = g.outgoing(baiId, 'phat_trien').map(e => g.node(e.o)).filter(n => n?.type === 'nangluc').map(n => n.label);
    const digitalComps = g.outgoing(baiId, 'phat_trien').map(e => g.node(e.o)).filter(n => n?.type === 'nangluc_so').map(n => n.label);
    const aiCodes = g.outgoing(baiId, 'phat_trien').map(e => g.node(e.o)).filter(n => n?.type === 'giao_duc_ai').map(n => n.label);
    const outcomes = g.outgoing(baiId, 'co_yccd').map(e => g.node(e.o)).filter(Boolean)
      .sort((a, b) => a.props.index - b.props.index)
      .map(y => {
        const yComps = new Set(g.outgoing(y.id, 'phat_trien').map(e => g.node(e.o)).filter(n => n?.type === 'nangluc').map(n => n.label));
        for (const ce of g.outgoing(y.id, 'dat_chi_bao')) {
          for (const ne of g.outgoing(ce.o, 'thuoc_nang_luc')) {
            const nl = g.node(ne.o);
            if (nl) yComps.add(nl.label);
          }
        }
        const merged = yComps.size ? [...yComps].sort() : lessonComps;
        return { index: y.props.index, text: y.label, competencies: merged };
      });
    const topic = g.outgoing(baiId, 'thuoc_chu_de').map(e => g.node(e.o)).find(n => n?.type === 'chude');
    return {
      subject_name: bai.props.subject_name, grade: bai.props.grade, lesson_code: bai.props.lesson_code, name: bai.props.name,
      topic: topic ? topic.label : '', first_week: bai.props.first_week,
      competencies: lessonComps, digital_competencies: digitalComps, ai_codes: aiCodes,
      outcomes,
      prerequisites: g.incoming(baiId, 'tien_de').map(e => g.node(e.s)).filter(Boolean).map(n => ({
        grade: n.props.grade, lesson_code: n.props.lesson_code, name: n.props.name
      }))
    };
  }

  function summary(g) {
    const count = {};
    for (const n of g.nodes.values()) count[n.type] = (count[n.type] || 0) + 1;
    const edgeCount = {};
    for (const e of g.edges) edgeCount[e.p] = (edgeCount[e.p] || 0) + 1;
    return { nodes: count, edges: edgeCount, total_nodes: g.nodes.size, total_edges: g.edges.length };
  }

  return {
    SCHEMA, LEVELS, KINDS, KIND_LABELS, ids, slug, norm, firstWeek,
    competencyCodes, digitalCompetencyCodes, aiEducationCodes,
    createGraph, buildGraph, buildGraphForExam, checkSchema, validateGraph, coverage,
    matrixCells, lessonOf, outcomeIdAudit, similarQuestions, nearDuplicateGroups,
    suggestForCell, studyOrder, suggestPrerequisites, lessonsAfterWeek, lessonContext, summary
  };
});
