/*
 * Màn hình "Bản đồ tri thức" và phần "Vì sao" + nút sửa trong báo cáo kiểm định (docs/KE_HOACH_DO_THI_TRI_THUC.md).
 * Chỉ đọc, trừ thao tác "Áp dụng chuẩn hóa mã YCCĐ" và nút "Xác nhận tiền đề" do giáo viên bấm.
 * Nạp sau app.js; dùng các hàm chung của app.js qua window (request, store, BankCore, BankKnowledgeGraph).
 */
(function () {
  'use strict';
  const C = window.BankCore;
  const esc = (s) => (C && C.escapeHtml ? C.escapeHtml(s) : String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])));
  const LEVELS = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
  const state = { grade: null, scopeWeek: '', examId: '', loading: false, data: null, rules: null, examReport: null, error: '', norm: null, normBusy: false, normMsg: '', parity: null, cfgMsg: '', suggestMsg: '' };

  const call = (path, body) => (typeof window.request === 'function' ? window.request(path, body) : Promise.reject(new Error('Ứng dụng chưa sẵn sàng.')));
  const store = () => window.store || {};
  const grades = () => {
    try { if (typeof window.availableGrades === 'function') return window.availableGrades(); } catch (e) { /* bỏ qua */ }
    return [6, 7, 8, 9, 10, 11, 12];
  };
  const defaultGrade = () => {
    const g = store().activeGrade;
    return typeof g === 'number' ? g : (grades()[0] || 8);
  };

  function fixButtonHtml(f, ctx = {}) {
    const fix = f && f.cach_sua;
    if (!fix || !fix.hanh_dong) return '';
    const exId = fix.exam_id || ctx.exam_id || '';
    const revId = fix.revision_id || ctx.revision_id || '';
    const gr = fix.grade || ctx.grade || '';
    return `<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <button type="button" class="export-link kg-fix-btn" data-kg-fix="${esc(fix.hanh_dong)}" data-kg-exam="${esc(exId)}" data-kg-rev="${esc(revId)}" data-kg-grade="${esc(gr)}" data-kg-rule="${esc(f.rule || '')}">${esc(fix.nhan || 'Mở chỗ sửa')}</button>
      ${fix.mo_ta ? `<span class="small muted">${esc(fix.mo_ta)}</span>` : ''}
    </div>`;
  }

  // Luật có từ 3 vi phạm trở lên (vd 24 câu chưa duyệt) gộp thành một mục: câu đầu, số vi phạm cùng loại, danh sách đầy đủ, một nút sửa.
  function findingList(items, cls, ctx = {}) {
    if (!items || !items.length) return '';
    const groups = [];
    const byRule = new Map();
    for (const f of items) {
      const k = f.rule || f.message;
      if (!byRule.has(k)) { const g = { rule: k, items: [] }; byRule.set(k, g); groups.push(g); }
      byRule.get(k).items.push(f);
    }
    const one = f => `<li class="${cls}"><strong>${esc(f.message)}</strong>
      ${cls === 'kg-error' ? fixButtonHtml(f, ctx) : ''}
      <details><summary>Vì sao?</summary><pre class="kg-why">${esc(f.explanation || '')}</pre></details></li>`;
    return `<ul class="kg-findings">${groups.map(g => g.items.length < 3 ? g.items.map(one).join('') : `<li class="${cls}"><strong>${esc(g.items[0].message)}</strong> <span class="small muted">và ${g.items.length - 1} vi phạm cùng loại (${esc(g.rule)})</span>
      ${cls === 'kg-error' ? fixButtonHtml(g.items[0], ctx) : ''}
      <details><summary>Xem đủ ${g.items.length} vi phạm</summary><ul class="small">${g.items.map(f => `<li>${esc(f.message)}</li>`).join('')}</ul></details>
      <details><summary>Vì sao?</summary><pre class="kg-why">${esc(g.items[0].explanation || '')}</pre></details></li>`).join('')}</ul>`;
  }

  // Dùng trong báo cáo kiểm định đề (app.js, chế độ "verify").
  function verificationHtml(record) {
    const k = record && record.verification && record.verification.knowledge;
    if (!k) return '';
    if (k.error) return `<div class="callout warning">${esc(k.error)}</div>`;
    const head = k.passed
      ? '<p class="badge approved">Kho luật: không phát hiện vi phạm</p>'
      : `<p class="badge draft">Kho luật: ${k.errors.length} vi phạm cần sửa</p>`;
    const ctx = { exam_id: record.id || '', revision_id: record.revision_id || '', grade: record.grade || '' };
    return `<div class="card kg-verify"><h3>Kiểm tra theo kho luật (có giải thích &amp; hướng sửa)</h3>
      <p class="muted small">Kho luật quyết định đề có được duyệt hay không, kèm câu nào sai, vì sao, căn cứ văn bản nào và nút đi tới chỗ sửa.${record.verification.decision === 'kho_luat' ? (record.verification.parity === false ? ` <strong>Lưu ý:</strong> kiểm định cũ kết luận ${record.verification.legacy?.passed ? 'đạt' : 'chưa đạt'}, khác kho luật; hãy báo người quản trị.` : ' Kết luận khớp với kiểm định cũ.') : ' Kho luật chưa chạy được nên đang dùng kiểm định cũ.'}</p>
      ${head}${findingList(k.errors, 'kg-error', ctx)}${k.warnings && k.warnings.length ? '<h4>Cảnh báo (không chặn)</h4>' + findingList(k.warnings, 'kg-warning', ctx) : ''}</div>`;
  }

  function coverageTable(rows) {
    if (!rows.length) return '<p class="muted">Khối này chưa có YCCĐ trong PPCT.</p>';
    const cell = (lv) => {
      const n = lv.approved, o = lv.other;
      const cls = n === 0 ? 'kg-zero' : '';
      return `<td class="${cls}" style="text-align:center">${n}${o ? ` <span class="muted small">(+${o} chưa duyệt)</span>` : ''}</td>`;
    };
    const compCell = (r) => {
      const comps = [...(r.competencies || []), ...(r.indicators || [])];
      const nls = [...(r.digital_competencies || []), ...(r.ai_codes || [])];
      if (!comps.length && !nls.length) return '<span class="muted small">—</span>';
      return (comps.length ? `<div>${comps.map(esc).join(', ')}</div>` : '')
        + (nls.length ? `<div class="small muted">NLS/AI bài: ${nls.map(esc).join(', ')}</div>` : '');
    };
    return `<div class="table-wrap"><table class="kg-coverage"><thead><tr><th>Bài</th><th>Yêu cầu cần đạt</th><th>Năng lực / Chỉ báo</th>${LEVELS.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(r.lesson_code)}</td><td>${esc(r.text)}</td><td>${compCell(r)}</td>${LEVELS.map(l => cell(r.levels[l])).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="muted small">Số câu <strong>đã duyệt</strong> theo từng YCCĐ và mức độ; cột năng lực chỉ ghi năng lực/chỉ báo gắn trực tiếp với YCCĐ đó; ô tô đậm là chưa có câu đã duyệt.</p>`;
  }

  // Mã YCCĐ: thống kê câu nối theo mã / theo chữ / không nối được, xem trước và áp dụng chuẩn hóa.
  function outcomeIdCard(d) {
    const a = d && d.id_audit;
    if (!a) return '';
    const total = a.theo_ma + a.theo_chu + a.khong_noi;
    const n = state.norm;
    const preview = n ? `<div class="callout" style="margin-top:10px"><strong>Xem trước:</strong> lưu mã cho YCCĐ của ${n.lessons_updated} bài; ${n.questions_linked} câu khớp chữ sẽ được lưu mã; ${n.matrices_updated} ma trận chưa khóa sẽ lưu mã YCCĐ.${n.outside_ppct ? ` ${n.outside_ppct} câu thuộc bài không có trong PPCT (xử lí ở mục lỗi bên dưới).` : ''}</div>
      ${n.unmatched.length ? `<h4>${n.unmatched.length} câu có YCCĐ lệch chữ: chọn YCCĐ đúng (để trống nếu chưa chắc)</h4>
      <div class="table-wrap"><table class="small"><thead><tr><th>Câu</th><th>Bài</th><th>YCCĐ đang ghi</th><th>Chọn YCCĐ trong PPCT</th></tr></thead><tbody>
      ${n.unmatched.map(u => `<tr><td>${esc(u.question)}</td><td>${esc(u.lesson_code)}</td><td>${esc(u.learning_outcome || '(trống)')}</td><td><select data-norm-map="${esc(u.question_id)}"><option value="">— Để trống —</option>${u.suggestions.map((s, i) => `<option value="${esc(s.id)}" ${i === 0 && s.score >= 0.5 ? 'selected' : ''}>${esc(s.text)} (giống ${Math.round(s.score * 100)}%)</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table></div>` : ''}
      <div class="actions" style="margin-top:8px"><button type="button" class="primary" id="kg-norm-apply" ${state.normBusy || (!n.changed && !n.unmatched.length) ? 'disabled' : ''}>Áp dụng chuẩn hóa</button></div>` : '';
    return `<div class="card"><h3>Mã yêu cầu cần đạt (YCCĐ)</h3>
      <p class="muted small">Mỗi YCCĐ trong PPCT có một mã cố định (ví dụ TIN9-B1-YC3). Chèn, xóa, đổi thứ tự hay sửa câu chữ YCCĐ không làm câu hỏi và ma trận trỏ nhầm sang YCCĐ khác. Câu chưa có mã vẫn dùng được nhưng dễ lệch khi sửa PPCT.</p>
      <div class="kg-stats">${[['Câu nối theo mã', a.theo_ma], ['Câu chỉ khớp theo chữ', a.theo_chu], ['Câu không nối được YCCĐ', a.khong_noi]].map(([t, v]) => `<div class="card kg-stat"><div class="kg-num">${v}</div><div class="muted">${esc(t)}</div></div>`).join('')}</div>
      ${total && a.theo_ma === total ? '<p class="badge approved">Mọi câu đã nối YCCĐ theo mã.</p>' : `<div class="actions"><button type="button" id="kg-norm-preview" ${state.normBusy ? 'disabled' : ''}>Xem trước chuẩn hóa mã YCCĐ</button></div>`}
      ${state.normMsg ? `<p class="callout">${esc(state.normMsg)}</p>` : ''}${preview}</div>`;
  }

  // Ô ma trận (kể cả ô 2D nhận mọi YCCĐ của bài): cần bao nhiêu câu, có bao nhiêu câu đã duyệt.
  function matrixCellsCard(d) {
    const list = (d && d.matrix_cells) || [];
    if (!list.length) return '';
    const kind = { MC: 'TN', YN: 'Đ/S', SHORT: 'TLN', ES: 'TL' };
    return `<div class="card"><h3>Ô ma trận và câu đã duyệt</h3>${list.map(m => `<details><summary><strong>${esc(m.title)}</strong> · ${m.cells.filter(c => c.short).length ? `<span style="color:#b91c1c">${m.cells.filter(c => c.short).length} ô thiếu câu</span>` : 'đủ câu'}</summary>
      <div class="table-wrap"><table class="small"><thead><tr><th>Bài</th><th>Mức độ</th><th>Dạng</th><th>Cần</th><th>Đã duyệt</th><th>Thiếu</th></tr></thead><tbody>${m.cells.map(c => `<tr><td>${esc(c.lesson_code)}</td><td>${esc(c.level)}</td><td>${esc(kind[c.kind] || c.kind)}</td><td>${c.need}</td><td>${c.approved}${c.other ? ` <span class="muted">(+${c.other} chưa duyệt)</span>` : ''}</td><td${c.short ? ' style="color:#b91c1c;font-weight:700"' : ''}>${c.short || '—'}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}</div>`;
  }

  // Ngưỡng của tổ (lưu trong hồ sơ): tỉ lệ đề cương tối thiểu (90–100%, không thấp hơn quy định tổ) và thời gian kiểm tra định kì.
  function configCard() {
    const c = (store().profile && store().profile.rule_config) || { de_cuong_min_percent: 90, thoi_gian_dinh_ki_phut: 45 };
    return `<div class="card"><h3>Ngưỡng của tổ cho kho luật</h3>
      <p class="muted small">Đổi ngưỡng ở đây, không cần sửa mã. Tỉ lệ đề cương không đặt dưới 90% (rules/01_phan_cong_va_bien_soan_de.md). Thời gian 45 phút là mức của TT 22/2021 cho môn có từ 70 tiết/năm trở xuống; chỉ đổi khi môn khác mức đó.</p>
      <div class="filters" style="align-items:flex-end">
        <div class="field"><label for="kg-cfg-pct">Tỉ lệ câu lấy từ đề cương, tối thiểu (%)</label><input id="kg-cfg-pct" type="number" min="90" max="100" step="1" value="${esc(c.de_cuong_min_percent)}"></div>
        <div class="field"><label for="kg-cfg-min">Thời gian kiểm tra định kì (phút)</label><input id="kg-cfg-min" type="number" min="15" max="180" step="5" value="${esc(c.thoi_gian_dinh_ki_phut)}"></div>
        <button type="button" id="kg-cfg-save">Lưu ngưỡng</button></div>${state.cfgMsg ? `<p class="small">${esc(state.cfgMsg)}</p>` : ''}</div>`;
  }

  function parityCard() {
    const p = state.parity;
    const body = !p ? '<p class="muted small">Chạy kho luật và kiểm định cũ trên mọi đề của khối, rồi so kết luận.</p>'
      : !p.total ? '<p class="muted">Khối này chưa có đề.</p>'
      : `<p>${p.mismatched ? `<strong style="color:#b91c1c">${p.mismatched}/${p.total} đề hai bên kết luận khác nhau.</strong>` : `<span class="badge approved">${p.total}/${p.total} đề: hai bên kết luận giống nhau.</span>`}</p>
        <div class="table-wrap"><table class="small"><thead><tr><th>Đề</th><th>Kiểm định cũ</th><th>Kho luật</th><th>Lỗi chỉ một bên thấy</th></tr></thead><tbody>
        ${p.rows.map(r => `<tr${r.same ? '' : ' style="background:#fff0f1"'}><td>${esc(r.title)}${r.exam_code ? ' · ' + esc(r.exam_code) : ''}</td><td>${r.legacy_passed ? 'Đạt' : 'Chưa đạt'}</td><td>${r.rules_passed ? 'Đạt' : 'Chưa đạt'}</td><td>${[...r.only_legacy.map(c => 'cũ: ' + c), ...r.only_rules.map(c => 'kho luật: ' + c)].map(esc).join(', ') || '—'}</td></tr>`).join('')}
        </tbody></table></div>`;
    return `<div class="card"><h3>Đối chiếu kho luật với kiểm định cũ</h3>${body}<div class="actions"><button type="button" id="kg-parity">Đối chiếu các đề của khối</button></div></div>`;
  }

  function render() {
    const root = document.getElementById('knowledge');
    if (!root) return;
    if (state.grade === null) state.grade = defaultGrade();
    const d = state.data;
    const exams = (store().exams || []).filter(e => Number(e.grade) === Number(state.grade));
    const gradeOpts = grades().map(g => `<option value="${g}" ${Number(g) === Number(state.grade) ? 'selected' : ''}>Khối ${g}</option>`).join('');
    const summary = d ? `<div class="kg-stats">
      ${[['Bài học', d.summary.nodes.bai], ['Yêu cầu cần đạt', d.summary.nodes.yccd], ['Câu hỏi', d.summary.nodes.cau], ['Quan hệ', d.summary.total_edges]]
        .map(([t, n]) => `<div class="card kg-stat"><div class="kg-num">${n || 0}</div><div class="muted">${esc(t)}</div></div>`).join('')}</div>` : '';
    const allIssues = d ? [...(d.schema_issues || []), ...(d.issues || [])] : [];
    const issues = d ? (allIssues.length
      ? `<ul class="kg-findings">${allIssues.map(i => `<li class="${i.severity === 'loi' ? 'kg-error' : 'kg-warning'}">${esc(i.message)}</li>`).join('')}</ul>`
      : '<p class="badge approved">Không có vi phạm lược đồ hay câu “mồ côi”; mọi bài đều có YCCĐ và mọi YCCĐ đều có câu đã duyệt.</p>') : '';
    const dups = d ? (d.duplicates.length
      ? `<ul>${d.duplicates.map(g => `<li>Các câu <strong>${g.question_ids.map(esc).join(', ')}</strong> giống nhau khoảng ${Math.round(g.max_score * 100)}%.</li>`).join('')}</ul>`
      : '<p class="muted">Không thấy nhóm câu gần trùng (ngưỡng 80%).</p>') : '';
    const prereqSugg = d && Array.isArray(d.prerequisite_suggestions) ? d.prerequisite_suggestions : [];
    const prereqSuggHtml = prereqSugg.length ? `<details style="margin-top:10px"><summary><strong>Gợi ý bài tiền đề theo thứ tự tuần PPCT (${prereqSugg.length} bài chưa gắn tiền đề)</strong></summary>
      <p class="small muted" style="margin:6px 0">Ứng dụng gợi ý bài liền trước theo tuần PPCT để giáo viên xem và tự xác nhận lưu (không tự ghi).</p>
      <div class="table-wrap"><table class="small"><thead><tr><th>Bài học</th><th>Gợi ý cần học trước</th><th>Lý do</th><th>Thao tác</th></tr></thead><tbody>
      ${prereqSugg.slice(0, 20).map(s => {
        const pre = s.suggested[0];
        return `<tr><td><strong>${esc(s.lesson_code)}</strong> ${esc(s.name || '')} (tuần ${s.first_week})</td><td><strong>${esc(pre.lesson_code)}</strong> ${esc(pre.name || '')}</td><td class="small muted">${esc(pre.reason)}</td><td><button type="button" class="export-link" data-kg-accept-prereq="${esc(s.lesson_code)}" data-kg-prereq-grade="${esc(s.grade)}" data-kg-prereq-val="${esc(pre.lesson_code)}">Xác nhận lưu</button></td></tr>`;
      }).join('')}</tbody></table></div></details>` : '';
    const order = d ? `<ol class="kg-order">${d.study_order.order.map(l => `<li><strong>${esc(l.lesson_code)}</strong> ${esc(l.name || '')}${l.first_week ? ` <span class="muted small">· tuần ${l.first_week}</span>` : ''}${l.prerequisites.length ? ` <span class="muted small">· cần học trước: ${l.prerequisites.map(esc).join(', ')}</span>` : ''}</li>`).join('')}</ol>
      ${d.study_order.cyclic.length ? `<div class="callout warning">Quan hệ tiền đề bị vòng lặp ở các bài: ${d.study_order.cyclic.map(esc).join(', ')}. Hãy sửa lại cột “Bài tiền đề” trong PPCT.</div>` : ''}
      ${state.suggestMsg ? `<p class="callout">${esc(state.suggestMsg)}</p>` : ''}
      ${prereqSuggHtml}
      ${d.after_week.length ? `<div class="callout">Kiểm tra đến hết tuần ${esc(state.scopeWeek)}: các bài <strong>${d.after_week.map(esc).join(', ')}</strong> chưa học tới, không nên ra câu.</div>` : ''}` : '';
    const selectedExam = exams.find(e => e.id === state.examId);
    const examCtx = selectedExam ? { exam_id: selectedExam.id, revision_id: selectedExam.revision_id || '', grade: selectedExam.grade } : { grade: state.grade };
    const examBox = `<div class="filters" style="align-items:flex-end">
        <div class="field"><label for="kg-exam">Đề đã lưu</label><select id="kg-exam"><option value="">— Chọn đề —</option>${exams.map(e => `<option value="${esc(e.id)}" ${e.id === state.examId ? 'selected' : ''}>${esc(e.title || e.id)}${e.exam_code ? ' · ' + esc(e.exam_code) : ''}</option>`).join('')}</select></div>
        <button type="button" id="kg-check-exam" ${exams.length ? '' : 'disabled'}>Kiểm tra theo kho luật</button></div>
      ${state.examReport ? (state.examReport.passed ? '<p class="badge approved">Không phát hiện vi phạm.</p>' : `<p class="badge draft">${state.examReport.errors.length} vi phạm cần sửa</p>`) + findingList(state.examReport.errors, 'kg-error', examCtx) + (state.examReport.warnings.length ? '<h4>Cảnh báo (không chặn)</h4>' + findingList(state.examReport.warnings, 'kg-warning', examCtx) : '') : ''}`;
    const rules = state.rules ? `<div class="table-wrap"><table><thead><tr><th>Mã</th><th>Loại</th><th>Nội dung</th><th>Căn cứ</th></tr></thead><tbody>${state.rules.map(r => `<tr><td><code>${esc(r.id)}</code></td><td>${({ suy_ra: 'Suy ra', chan: 'Chặn', canh_bao: 'Cảnh báo' })[r.loai] || esc(r.loai)}</td><td>${esc(r.noi_dung)}</td><td class="small">${r.can_cu.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Đang tải danh sách luật…</p>';

    root.innerHTML = `<div class="card"><h2 style="margin-top:0">Bản đồ tri thức</h2>
      <p class="muted">Ứng dụng nối PPCT, yêu cầu cần đạt, năng lực, chỉ báo, câu hỏi, đề cương và đề thành một mạng quan hệ để chỉ ra chỗ thiếu, chỗ trùng và kiểm tra đề theo kho luật có giải thích. Màn hình này chỉ đọc, trừ các nút giáo viên tự xác nhận.</p>
      <div class="filters" style="align-items:flex-end">
        <div class="field"><label for="kg-grade">Khối</label><select id="kg-grade">${gradeOpts}</select></div>
        <div class="field"><label for="kg-week">Kiểm tra đến hết tuần (không bắt buộc)</label><input id="kg-week" type="number" min="1" max="40" value="${esc(state.scopeWeek)}" placeholder="VD: 9"></div>
        <button type="button" class="primary" id="kg-run">${state.loading ? 'Đang phân tích…' : 'Phân tích'}</button></div>
      ${state.error ? `<div class="callout warning">${esc(state.error)}</div>` : ''}${summary}</div>
      ${d ? `${outcomeIdCard(d)}<div class="card"><h3>Lỗi và chỗ thiếu trong dữ liệu</h3>${issues}</div>${matrixCellsCard(d)}
      <div class="card"><h3>Bảng phủ yêu cầu cần đạt × mức độ</h3>${coverageTable(d.coverage)}</div>
      <div class="card"><h3>Câu hỏi gần trùng</h3>${dups}</div>
      <div class="card"><h3>Thứ tự ôn tập theo bài tiền đề</h3><p class="muted small">Ghi “Bài tiền đề” (có thể ghi liên khối như <code>8:B12</code>) trong PPCT hoặc xác nhận gợi ý theo tuần bên dưới.</p>${order}</div>` : ''}
      <div class="card"><h3>Kiểm tra một đề theo kho luật</h3>${examBox}</div>${parityCard()}${configCard()}
      <details class="card"><summary><strong>Danh sách luật và căn cứ</strong></summary>${rules}</details>`;

    document.getElementById('kg-grade').onchange = (e) => { state.grade = Number(e.target.value); state.data = null; state.examReport = null; state.examId = ''; run(); };
    document.getElementById('kg-week').onchange = (e) => { state.scopeWeek = e.target.value; };
    document.getElementById('kg-run').onclick = () => { state.scopeWeek = document.getElementById('kg-week').value; run(); };
    document.getElementById('kg-exam').onchange = (e) => { state.examId = e.target.value; state.examReport = null; render(); };
    document.getElementById('kg-check-exam').onclick = checkExam;
    const pv = document.getElementById('kg-norm-preview'); if (pv) pv.onclick = () => normalize(false);
    const ap = document.getElementById('kg-norm-apply'); if (ap) ap.onclick = () => normalize(true);
    const pb = document.getElementById('kg-parity'); if (pb) pb.onclick = async () => { try { state.parity = await call('/api/knowledge/parity', { grade: state.grade }); } catch (err) { state.error = err.message; } render(); };
    const cs = document.getElementById('kg-cfg-save'); if (cs) cs.onclick = async () => {
      const rule_config = { de_cuong_min_percent: Number(document.getElementById('kg-cfg-pct').value), thoi_gian_dinh_ki_phut: Number(document.getElementById('kg-cfg-min').value) };
      try { const res = await call('/api/profile/save', { profile: { rule_config } }); if (window.store && res && res.profile) window.store.profile = res.profile; const c = res?.profile?.rule_config || rule_config; state.cfgMsg = `Đã lưu: đề cương tối thiểu ${c.de_cuong_min_percent}%, kiểm tra định kì ${c.thoi_gian_dinh_ki_phut} phút. Áp dụng cho lần kiểm định tiếp theo.`; }
      catch (err) { state.cfgMsg = err && err.message ? err.message : 'Chưa lưu được ngưỡng.'; }
      render();
    };
    root.querySelectorAll('[data-kg-accept-prereq]').forEach(btn => {
      btn.onclick = async () => {
        const lCode = btn.dataset.kgAcceptPrereq, lGrade = Number(btn.dataset.kgPrereqGrade), preVal = btn.dataset.kgPrereqVal;
        const lesson = (store().bank?.ppct?.lessons || []).find(l => Number(l.grade) === lGrade && l.lesson_code === lCode);
        if (!lesson) return;
        const nextPre = [...new Set([...(lesson.prerequisites || []), preVal])];
        try {
          await call('/api/ppct/save-lesson', { lesson: { ...lesson, prerequisites: nextPre } });
          state.suggestMsg = `Đã lưu bài tiền đề ${preVal} cho bài ${lCode}.`;
          if (typeof window.load === 'function') await window.load();
          await run();
        } catch (err) {
          state.suggestMsg = err && err.message ? err.message : 'Chưa lưu được bài tiền đề.';
          render();
        }
      };
    });
  }

  // Xử lý nút sửa nhanh dưới mỗi vi phạm của kho luật (đóng dialog nếu đang mở và dẫn tới đúng màn hình/hành động).
  if (!window.__kgFixDelegated) {
    window.__kgFixDelegated = true;
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest?.('.kg-fix-btn');
      if (!btn) return;
      const act = btn.dataset.kgFix || '';
      const exId = btn.dataset.kgExam || '';
      const revId = btn.dataset.kgRev || '';
      const gr = Number(btn.dataset.kgGrade || 0);
      const st = store();
      if (gr && typeof window.setActiveGrade === 'function') window.setActiveGrade(gr, { skipRender: true });
      const dlg = btn.closest('dialog');
      if (dlg && dlg.open) dlg.close();

      if (act === 'mo_doi_chieu_de_cuong') {
        if (revId) st.activeRevisionViewId = revId;
        if (exId) st.revCoverageExamId = exId;
        location.hash = 'revisions';
        setTimeout(() => document.getElementById('revision-coverage')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
        return;
      }
      if (act === 'mo_duyet_cau') {
        location.hash = 'review';
        return;
      }
      if (act === 'mo_ppct') {
        location.hash = 'ppct';
        return;
      }
      if (act === 'goi_y_thay_the') {
        const exam = (st.exams || []).find(x => x.id === exId);
        const KG = window.BankKnowledgeGraph;
        if (exam && exam.matrix_id) {
          try {
            const rep = await call(`/api/matrices/${encodeURIComponent(exam.matrix_id)}/shortfall`);
            const cells = (rep.cells || []).filter(c => c.shortfall > 0 && Array.isArray(c.suggestions) && c.suggestions.length);
            if (cells.length && typeof window.notify === 'function') {
              const txt = cells.slice(0, 3).map(c => `${c.lesson_code} (${c.level}): ${c.suggestions.map(s => s.question_id).join(', ')}`).join(' · ');
              window.notify(`Gợi ý câu thay thế (bài · mức độ): ${txt}`);
            }
          } catch {}
          location.hash = 'matrices';
        } else if (exam && KG && typeof KG.suggestForCell === 'function') {
          location.hash = 'matrices';
        } else {
          location.hash = 'matrices';
        }
        return;
      }
      if (act === 'kiem_dinh_lai') {
        if (exId) {
          try {
            await call('/api/exams/verify', { id: exId });
            if (typeof window.load === 'function') await window.load();
            if (typeof window.notify === 'function') window.notify('Đã kiểm định lại đề kiểm tra.');
            if (location.hash === '#knowledge' && state.examId === exId) await checkExam();
            return;
          } catch {}
        }
        location.hash = 'exams';
        return;
      }
      location.hash = 'exams';
    });
  }

  async function normalize(apply) {
    const mappings = {};
    if (apply) document.querySelectorAll('[data-norm-map]').forEach(sel => { if (sel.value) mappings[sel.dataset.normMap] = sel.value; });
    if (apply && !window.confirm(`Lưu mã YCCĐ cho Khối ${state.grade}: PPCT, câu hỏi khớp chữ${Object.keys(mappings).length ? `, ${Object.keys(mappings).length} câu đã chọn YCCĐ` : ''} và ma trận chưa khóa? Câu đã chọn sẽ được đổi chữ YCCĐ theo đúng PPCT.`)) return;
    state.normBusy = true; state.normMsg = ''; render();
    try {
      const res = await call('/api/knowledge/normalize-outcomes', { grade: state.grade, apply, mappings });
      if (apply) {
        const r = res.report;
        state.norm = null;
        state.normMsg = `Đã lưu mã YCCĐ: ${r.lessons_updated} bài, ${r.questions_linked + r.questions_mapped} câu hỏi, ${r.matrices_updated} ma trận.${r.unmatched.length ? ` Còn ${r.unmatched.length} câu chưa chọn YCCĐ.` : ''}`;
        if (typeof window.load === 'function') await window.load();
        state.data = await call('/api/knowledge/overview', { grade: state.grade, scope_week: state.scopeWeek ? Number(state.scopeWeek) : undefined });
      } else state.norm = res.report;
    } catch (err) {
      state.normMsg = err && err.message ? err.message : 'Chưa chuẩn hóa được.';
    } finally { state.normBusy = false; render(); }
  }

  async function run() {
    state.loading = true; state.error = ''; render();
    try {
      state.data = await call('/api/knowledge/overview', { grade: state.grade, scope_week: state.scopeWeek ? Number(state.scopeWeek) : undefined });
      if (!state.rules) state.rules = (await call('/api/knowledge/rules', {})).rules;
    } catch (err) {
      state.error = err && err.message ? err.message : 'Chưa phân tích được.';
    } finally {
      state.loading = false; render();
    }
  }

  async function checkExam() {
    if (!state.examId) return;
    try {
      state.examReport = (await call('/api/knowledge/check-exam', { id: state.examId, scope_week: state.scopeWeek ? Number(state.scopeWeek) : undefined })).report;
    } catch (err) {
      state.error = err && err.message ? err.message : 'Chưa kiểm tra được đề.';
    }
    render();
  }

  function renderKnowledge() {
    render();
    if (!state.data && !state.loading) run();
  }

  window.BankKnowledgeUI = { verificationHtml, renderKnowledge };
  window.renderKnowledge = renderKnowledge;
})();
