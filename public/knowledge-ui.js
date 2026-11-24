/*
 * Màn hình "Bản đồ tri thức" và phần "Vì sao" trong báo cáo kiểm định (docs/KE_HOACH_DO_THI_TRI_THUC.md).
 * Chỉ đọc: gọi các API /api/knowledge/* (static-api.js), không ghi dữ liệu.
 * Nạp sau app.js; dùng các hàm chung của app.js qua window (request, store, BankCore).
 */
(function () {
  'use strict';
  const C = window.BankCore;
  const esc = (s) => (C && C.escapeHtml ? C.escapeHtml(s) : String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])));
  const LEVELS = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
  const state = { grade: null, scopeWeek: '', examId: '', loading: false, data: null, rules: null, examReport: null, error: '' };

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

  function findingList(items, cls) {
    if (!items || !items.length) return '';
    return `<ul class="kg-findings">${items.map(f => `<li class="${cls}"><strong>${esc(f.message)}</strong>
      <details><summary>Vì sao?</summary><pre class="kg-why">${esc(f.explanation || '')}</pre></details></li>`).join('')}</ul>`;
  }

  // Dùng trong báo cáo kiểm định đề (app.js, chế độ "verify").
  function verificationHtml(record) {
    const k = record && record.verification && record.verification.knowledge;
    if (!k) return '';
    if (k.error) return `<div class="callout warning">${esc(k.error)}</div>`;
    const head = k.passed
      ? '<p class="badge approved">Kho luật: không phát hiện vi phạm</p>'
      : `<p class="badge draft">Kho luật: ${k.errors.length} vi phạm cần sửa</p>`;
    return `<div class="card kg-verify"><h3>Kiểm tra theo kho luật (có giải thích)</h3>
      <p class="muted small">Chạy song song với kiểm định hiện có để chỉ rõ câu nào sai, vì sao và căn cứ văn bản nào. Quyết định duyệt vẫn theo kiểm định hiện có.</p>
      ${head}${findingList(k.errors, 'kg-error')}${k.warnings && k.warnings.length ? '<h4>Cảnh báo (không chặn)</h4>' + findingList(k.warnings, 'kg-warning') : ''}</div>`;
  }

  function coverageTable(rows) {
    if (!rows.length) return '<p class="muted">Khối này chưa có YCCĐ trong PPCT.</p>';
    const cell = (lv) => {
      const n = lv.approved, o = lv.other;
      const cls = n === 0 ? 'kg-zero' : '';
      return `<td class="${cls}" style="text-align:center">${n}${o ? ` <span class="muted small">(+${o} chưa duyệt)</span>` : ''}</td>`;
    };
    return `<div class="table-wrap"><table class="kg-coverage"><thead><tr><th>Bài</th><th>Yêu cầu cần đạt</th>${LEVELS.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(r.lesson_code)}</td><td>${esc(r.text)}</td>${LEVELS.map(l => cell(r.levels[l])).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="muted small">Số câu <strong>đã duyệt</strong> theo từng YCCĐ và mức độ; ô tô đậm là chưa có câu đã duyệt.</p>`;
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
    const issues = d ? (d.issues.length
      ? `<ul class="kg-findings">${d.issues.map(i => `<li class="${i.severity === 'loi' ? 'kg-error' : 'kg-warning'}">${esc(i.message)}</li>`).join('')}</ul>`
      : '<p class="badge approved">Không có câu “mồ côi”; mọi bài đều có YCCĐ và mọi YCCĐ đều có câu đã duyệt.</p>') : '';
    const dups = d ? (d.duplicates.length
      ? `<ul>${d.duplicates.map(g => `<li>Các câu <strong>${g.question_ids.map(esc).join(', ')}</strong> giống nhau khoảng ${Math.round(g.max_score * 100)}%.</li>`).join('')}</ul>`
      : '<p class="muted">Không thấy nhóm câu gần trùng (ngưỡng 80%).</p>') : '';
    const order = d ? `<ol class="kg-order">${d.study_order.order.map(l => `<li><strong>${esc(l.lesson_code)}</strong> ${esc(l.name || '')}${l.first_week ? ` <span class="muted small">· tuần ${l.first_week}</span>` : ''}${l.prerequisites.length ? ` <span class="muted small">· cần học trước: ${l.prerequisites.map(esc).join(', ')}</span>` : ''}</li>`).join('')}</ol>
      ${d.study_order.cyclic.length ? `<div class="callout warning">Quan hệ tiền đề bị vòng lặp ở các bài: ${d.study_order.cyclic.map(esc).join(', ')}. Hãy sửa lại cột “Bài tiền đề” trong PPCT.</div>` : ''}
      ${d.after_week.length ? `<div class="callout">Kiểm tra đến hết tuần ${esc(state.scopeWeek)}: các bài <strong>${d.after_week.map(esc).join(', ')}</strong> chưa học tới, không nên ra câu.</div>` : ''}` : '';
    const examBox = `<div class="filters" style="align-items:flex-end">
        <div class="field"><label for="kg-exam">Đề đã lưu</label><select id="kg-exam"><option value="">— Chọn đề —</option>${exams.map(e => `<option value="${esc(e.id)}" ${e.id === state.examId ? 'selected' : ''}>${esc(e.title || e.id)}${e.exam_code ? ' · ' + esc(e.exam_code) : ''}</option>`).join('')}</select></div>
        <button type="button" id="kg-check-exam" ${exams.length ? '' : 'disabled'}>Kiểm tra theo kho luật</button></div>
      ${state.examReport ? (state.examReport.passed ? '<p class="badge approved">Không phát hiện vi phạm.</p>' : `<p class="badge draft">${state.examReport.errors.length} vi phạm cần sửa</p>`) + findingList(state.examReport.errors, 'kg-error') + (state.examReport.warnings.length ? '<h4>Cảnh báo (không chặn)</h4>' + findingList(state.examReport.warnings, 'kg-warning') : '') : ''}`;
    const rules = state.rules ? `<div class="table-wrap"><table><thead><tr><th>Mã</th><th>Loại</th><th>Nội dung</th><th>Căn cứ</th></tr></thead><tbody>${state.rules.map(r => `<tr><td><code>${esc(r.id)}</code></td><td>${({ suy_ra: 'Suy ra', chan: 'Chặn', canh_bao: 'Cảnh báo' })[r.loai] || esc(r.loai)}</td><td>${esc(r.noi_dung)}</td><td class="small">${r.can_cu.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Đang tải danh sách luật…</p>';

    root.innerHTML = `<div class="card"><h2 style="margin-top:0">Bản đồ tri thức</h2>
      <p class="muted">Ứng dụng nối PPCT, yêu cầu cần đạt, năng lực, câu hỏi, đề cương và đề thành một mạng quan hệ để chỉ ra chỗ thiếu, chỗ trùng và kiểm tra đề theo kho luật có giải thích. Màn hình này chỉ đọc, không thay đổi dữ liệu.</p>
      <div class="filters" style="align-items:flex-end">
        <div class="field"><label for="kg-grade">Khối</label><select id="kg-grade">${gradeOpts}</select></div>
        <div class="field"><label for="kg-week">Kiểm tra đến hết tuần (không bắt buộc)</label><input id="kg-week" type="number" min="1" max="40" value="${esc(state.scopeWeek)}" placeholder="VD: 9"></div>
        <button type="button" class="primary" id="kg-run">${state.loading ? 'Đang phân tích…' : 'Phân tích'}</button></div>
      ${state.error ? `<div class="callout warning">${esc(state.error)}</div>` : ''}${summary}</div>
      ${d ? `<div class="card"><h3>Lỗi và chỗ thiếu trong dữ liệu</h3>${issues}</div>
      <div class="card"><h3>Bảng phủ yêu cầu cần đạt × mức độ</h3>${coverageTable(d.coverage)}</div>
      <div class="card"><h3>Câu hỏi gần trùng</h3>${dups}</div>
      <div class="card"><h3>Thứ tự ôn tập theo bài tiền đề</h3><p class="muted small">Ghi “Bài tiền đề” cho từng bài trong màn hình Phân phối chương trình để ứng dụng sắp thứ tự ôn và cảnh báo câu thuộc bài chưa học.</p>${order}</div>` : ''}
      <div class="card"><h3>Kiểm tra một đề theo kho luật</h3>${examBox}</div>
      <details class="card"><summary><strong>Danh sách luật và căn cứ</strong></summary>${rules}</details>`;

    document.getElementById('kg-grade').onchange = (e) => { state.grade = Number(e.target.value); state.data = null; state.examReport = null; state.examId = ''; run(); };
    document.getElementById('kg-week').onchange = (e) => { state.scopeWeek = e.target.value; };
    document.getElementById('kg-run').onclick = () => { state.scopeWeek = document.getElementById('kg-week').value; run(); };
    document.getElementById('kg-exam').onchange = (e) => { state.examId = e.target.value; state.examReport = null; render(); };
    document.getElementById('kg-check-exam').onclick = checkExam;
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
