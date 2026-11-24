/*
 * Đồ thị tri thức chương trình (Giai đoạn 1, docs/KE_HOACH_DO_THI_TRI_THUC.md).
 * Thuần, không I/O: dựng đồ thị từ dữ liệu sẵn có (PPCT, câu hỏi, ma trận, đề cương, đề),
 * không nhập tay lại và không lưu riêng. Chạy được trong trình duyệt và Node (UMD).
 *
 * Nút:   mon, khoi, chude, bai, yccd, nangluc, mucdo, dang, cau, matran, decuong, de
 * Cạnh:  thuoc, co_yccd, phat_trien, danh_gia, o_muc_do, la_dang, nam_trong, can_cu, tien_de
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BankKnowledgeGraph = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const LEVELS = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
  const KINDS = ['MC', 'YN', 'SHORT', 'ES'];
  const KIND_LABELS = { MC: 'Trắc nghiệm nhiều lựa chọn', YN: 'Đúng/Sai', SHORT: 'Trả lời ngắn', ES: 'Tự luận' };
  const COMPETENCY_RE = /\bNL\s*([a-eA-E])\b/g;

  const list = x => (Array.isArray(x) ? x : []);
  const text = x => (typeof x === 'string' ? x.trim() : '');
  const norm = x => String(x || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const slug = x => norm(x).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
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

  const ids = {
    mon: (s) => `mon:${slug(s)}`,
    khoi: (s, g) => `khoi:${slug(s)}:${g}`,
    chude: (s, g, t) => `chude:${slug(s)}:${g}:${slug(t)}`,
    bai: (s, g, code) => `bai:${slug(s)}:${g}:${String(code).trim()}`,
    yccd: (s, g, code, i) => `yccd:${slug(s)}:${g}:${String(code).trim()}:${i}`,
    nangluc: (c) => `nangluc:${c}`,
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
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        const e = { s, p, o, ...(props ? { props } : {}) };
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

    LEVELS.forEach(l => g.addNode(ids.mucdo(l), 'mucdo', l));
    KINDS.forEach(k => g.addNode(ids.dang(k), 'dang', KIND_LABELS[k], { code: k }));

    // Chỉ mục tra YCCĐ theo (môn, khối, bài, nội dung chuẩn hoá) để nối câu hỏi.
    const outcomeIndex = new Map();
    const lessonIndex = new Map();

    for (const l of list(bank.ppct?.lessons)) {
      if (!l || !text(l.lesson_code) || !keep(l.subject_name)) continue;
      const subj = subjectOf(l.subject_name);
      const grade = Number(l.grade);
      if (!Number.isInteger(grade)) continue;
      const monId = g.addNode(ids.mon(subj), 'mon', subj).id;
      const khoiId = g.addNode(ids.khoi(subj, grade), 'khoi', `${subj} ${grade}`, { grade, subject_name: subj }).id;
      g.addEdge(khoiId, 'thuoc', monId);
      const topic = text(l.topic) || text(l.topic_source) || 'Chưa ghi chủ đề';
      const chudeId = g.addNode(ids.chude(subj, grade, topic), 'chude', topic, { grade, subject_name: subj }).id;
      g.addEdge(chudeId, 'thuoc', khoiId);
      const baiId = ids.bai(subj, grade, l.lesson_code);
      g.addNode(baiId, 'bai', `${l.lesson_code}. ${lessonName(l)}`, {
        grade, subject_name: subj, lesson_code: String(l.lesson_code).trim(), name: lessonName(l),
        section: l.section || 'core', first_week: firstWeek(l),
        prerequisites: list(l.prerequisites).map(String)
      });
      g.addEdge(baiId, 'thuoc', chudeId);
      lessonIndex.set(`${norm(subj)}|${grade}|${norm(l.lesson_code)}`, baiId);
      const lessonComps = competencyCodes([...list(l.competencies), ...list(l.digital_competencies)]);
      list(l.outcomes).forEach((o, i) => {
        const t = outcomeText(o);
        if (!t) return;
        const yId = g.addNode(ids.yccd(subj, grade, l.lesson_code, i), 'yccd', t, {
          grade, subject_name: subj, lesson_code: String(l.lesson_code).trim(), index: i
        }).id;
        g.addEdge(baiId, 'co_yccd', yId);
        outcomeIndex.set(`${norm(subj)}|${grade}|${norm(l.lesson_code)}|${norm(t)}`, yId);
        lessonComps.forEach(c => {
          g.addNode(ids.nangluc(c), 'nangluc', c);
          g.addEdge(yId, 'phat_trien', ids.nangluc(c), { source: 'ppct' });
        });
      });
    }
    // Quan hệ tiền đề (Giai đoạn 3) do giáo viên ghi trong PPCT: lesson.prerequisites = [mã bài].
    for (const n of g.ofType('bai')) {
      for (const code of n.props.prerequisites) {
        const pre = lessonIndex.get(`${norm(n.props.subject_name)}|${n.props.grade}|${norm(code)}`);
        if (pre && pre !== n.id) g.addEdge(pre, 'tien_de', n.id);
      }
    }

    const linkQuestion = (q) => {
      if (!q || !text(q.id) || !keep(q.subject_name)) return null;
      const subj = subjectOf(q.subject_name);
      const grade = Number(q.grade);
      const cId = ids.cau(q.id);
      g.addNode(cId, 'cau', text(q.question).slice(0, 80) || q.id, {
        question_id: q.id, grade, subject_name: subj, lesson_code: text(q.lesson_code),
        level: q.level, type: q.type, review_status: q.review_status || 'draft',
        learning_outcome: text(q.learning_outcome), competency: text(q.competency)
      });
      if (LEVELS.includes(q.level)) g.addEdge(cId, 'o_muc_do', ids.mucdo(q.level));
      if (KINDS.includes(q.type)) g.addEdge(cId, 'la_dang', ids.dang(q.type));
      const baiId = lessonIndex.get(`${norm(subj)}|${grade}|${norm(q.lesson_code)}`);
      if (baiId) g.addEdge(cId, 'thuoc', baiId);
      const yId = outcomeIndex.get(`${norm(subj)}|${grade}|${norm(q.lesson_code)}|${norm(q.learning_outcome)}`);
      if (yId) g.addEdge(cId, 'danh_gia', yId);
      for (const c of competencyCodes([q.competency])) {
        g.addNode(ids.nangluc(c), 'nangluc', c);
        g.addEdge(cId, 'phat_trien', ids.nangluc(c));
      }
      return cId;
    };
    list(bank.questions).forEach(linkQuestion);

    for (const m of list(data?.matrices)) {
      if (!m || !text(m.id) || !keep(m.subject_name)) continue;
      const subj = subjectOf(m.subject_name);
      const mId = g.addNode(ids.matran(m.id), 'matran', text(m.title) || m.id, {
        grade: m.grade, subject_name: subj, exam_type: m.exam_type, status: m.status
      }).id;
      for (const r of list(m.requirements)) {
        const baiId = lessonIndex.get(`${norm(subj)}|${Number(m.grade)}|${norm(r.lesson_code)}`);
        if (baiId) g.addEdge(mId, 'can_cu', baiId);
        if (!Number.isInteger(r.ppct_outcome_index)) continue;
        const yId = ids.yccd(subj, Number(m.grade), r.lesson_code, r.ppct_outcome_index);
        if (!g.node(yId)) continue;
        g.addEdge(mId, 'can_cu', yId, { level: r.level, requirement_id: r.id });
        for (const c of competencyCodes([r.competency])) {
          g.addNode(ids.nangluc(c), 'nangluc', c);
          g.addEdge(yId, 'phat_trien', ids.nangluc(c), { source: 'matran' });
        }
      }
    }

    const linkCollection = (records, type, idFn) => {
      for (const r of list(records)) {
        if (!r || !text(r.id) || !keep(r.subject_name)) continue;
        const rId = g.addNode(idFn(r.id), type, text(r.title) || r.id, {
          grade: r.grade, subject_name: subjectOf(r.subject_name), status: r.status || null
        }).id;
        for (const q of list(r.questions)) {
          const cId = g.node(ids.cau(q?.id)) ? ids.cau(q.id) : linkQuestion(q);
          if (cId) g.addEdge(cId, 'nam_trong', rId);
        }
        if (type === 'de' && text(r.matrix_id)) g.addEdge(rId, 'can_cu', ids.matran(r.matrix_id));
        if (type === 'de' && text(r.revision_id)) g.addEdge(rId, 'can_cu', ids.decuong(r.revision_id));
      }
    };
    linkCollection(data?.revisions, 'decuong', ids.decuong);
    linkCollection(data?.exams, 'de', ids.de);

    return g;
  }

  // ------------------------------------------------------------------------------------------
  // Kiểm tra đồ thị (Giai đoạn 1): câu "mồ côi", YCCĐ không có câu, bài không có YCCĐ.
  // ------------------------------------------------------------------------------------------
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
      if (!g.outgoing(n.id, 'thuoc').some(e => g.node(e.o)?.type === 'bai')) {
        issues.push({ code: 'cau_ngoai_ppct', severity: 'loi', node: n.id, question_id: n.props.question_id,
          message: `Câu ${n.props.question_id}: bài “${n.props.lesson_code || '(trống)'}” không có trong PPCT Khối ${n.props.grade}.` });
      } else if (!g.outgoing(n.id, 'danh_gia').length) {
        issues.push({ code: 'cau_khong_yccd', severity: 'loi', node: n.id, question_id: n.props.question_id,
          message: `Câu ${n.props.question_id}: YCCĐ “${n.props.learning_outcome || '(trống)'}” không khớp YCCĐ nào của bài ${n.props.lesson_code} trong PPCT.` });
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

  // ------------------------------------------------------------------------------------------
  // Truy vấn và gợi ý (Giai đoạn 4)
  // ------------------------------------------------------------------------------------------
  // Bảng phủ: mỗi YCCĐ × mức độ có bao nhiêu câu theo trạng thái duyệt.
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
      rows.push({
        yccd: y.id, text: y.label, grade: y.props.grade, lesson_code: y.props.lesson_code,
        levels: byLevel,
        approved_total: LEVELS.reduce((n, l) => n + byLevel[l].approved, 0),
        missing_levels: LEVELS.slice(0, 3).filter(l => byLevel[l].approved === 0)
      });
    }
    return rows.sort((a, b) => a.grade - b.grade || String(a.lesson_code).localeCompare(String(b.lesson_code), 'vi', { numeric: true }) || a.yccd.localeCompare(b.yccd));
  }

  function tokens(s) {
    return new Set(norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
      .split(/[^a-z0-9]+/).filter(w => w.length > 1));
  }
  function jaccard(a, b) {
    if (!a.size && !b.size) return 0;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    return inter / (a.size + b.size - inter);
  }

  // Câu tương tự: cùng YCCĐ (hoặc cùng bài) và nội dung giống nhau theo từ (Jaccard).
  function similarQuestions(g, questions, questionId, opts = {}) {
    const threshold = opts.threshold ?? 0.5;
    const byId = new Map(list(questions).map(q => [q.id, q]));
    const target = byId.get(questionId);
    if (!target) return [];
    const cId = ids.cau(questionId);
    const ys = g.outgoing(cId, 'danh_gia').map(e => e.o);
    const bais = g.outgoing(cId, 'thuoc').map(e => e.o);
    const peers = new Set();
    ys.forEach(y => g.incoming(y, 'danh_gia').forEach(e => peers.add(e.s)));
    if (!ys.length) bais.forEach(b => g.incoming(b, 'thuoc').forEach(e => peers.add(e.s)));
    peers.delete(cId);
    const tt = tokens(target.question);
    const out = [];
    for (const p of peers) {
      const q = byId.get(g.node(p)?.props.question_id);
      if (!q) continue;
      const score = jaccard(tt, tokens(q.question));
      if (score >= threshold) out.push({ question_id: q.id, score: Math.round(score * 100) / 100, same_outcome: ys.some(y => g.match(p, 'danh_gia', y).length) });
    }
    return out.sort((a, b) => b.score - a.score || a.question_id.localeCompare(b.question_id));
  }

  // Nhóm câu gần trùng trong cả ngân hàng một khối (để rà soát trước khi lập đề cương).
  function nearDuplicateGroups(g, questions, opts = {}) {
    const grade = opts.grade !== undefined ? Number(opts.grade) : null;
    const threshold = opts.threshold ?? 0.8;
    const qs = list(questions).filter(q => q && text(q.id) && (grade === null || Number(q.grade) === grade));
    const seen = new Set();
    const groups = [];
    for (const q of qs) {
      if (seen.has(q.id)) continue;
      const sims = similarQuestions(g, qs, q.id, { threshold }).filter(s => !seen.has(s.question_id));
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

  // ------------------------------------------------------------------------------------------
  // Quan hệ tiền đề và phạm vi kiểm tra (Giai đoạn 3)
  // ------------------------------------------------------------------------------------------
  // Thứ tự ôn tập: sắp bài theo quan hệ tiền đề (Kahn), cùng hạng thì theo tuần rồi mã bài.
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
      order: order.map(n => ({ lesson_code: n.props.lesson_code, name: n.props.name, first_week: n.props.first_week,
        prerequisites: g.incoming(n.id, 'tien_de').map(e => g.node(e.s)?.props.lesson_code).filter(Boolean) })),
      cyclic
    };
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

  // Ngữ cảnh tri thức cho lời nhắc AI (Giai đoạn 5): YCCĐ, năng lực, bài tiền đề của một bài.
  function lessonContext(g, subject, grade, lessonCode) {
    const baiId = ids.bai(subjectOf(subject), Number(grade), lessonCode);
    const bai = g.node(baiId);
    if (!bai) return null;
    const outcomes = g.outgoing(baiId, 'co_yccd').map(e => g.node(e.o)).filter(Boolean)
      .sort((a, b) => a.props.index - b.props.index)
      .map(y => ({ index: y.props.index, text: y.label, competencies: g.outgoing(y.id, 'phat_trien').map(e => g.node(e.o)?.label).filter(Boolean) }));
    const topic = g.outgoing(baiId, 'thuoc').map(e => g.node(e.o)).find(n => n?.type === 'chude');
    return {
      subject_name: bai.props.subject_name, grade: bai.props.grade, lesson_code: bai.props.lesson_code, name: bai.props.name,
      topic: topic ? topic.label : '', first_week: bai.props.first_week, outcomes,
      prerequisites: g.incoming(baiId, 'tien_de').map(e => g.node(e.s)).filter(Boolean).map(n => ({ lesson_code: n.props.lesson_code, name: n.props.name }))
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
    LEVELS, KINDS, KIND_LABELS, ids, slug, norm, firstWeek, competencyCodes,
    createGraph, buildGraph, validateGraph, coverage, similarQuestions, nearDuplicateGroups,
    suggestForCell, studyOrder, lessonsAfterWeek, lessonContext, summary
  };
});
