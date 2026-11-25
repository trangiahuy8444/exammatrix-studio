/* Pure Pages lifecycle rules. Persistence, authorization and atomic writes belong to the host. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.window || root).BankStaticWorkflow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ADMIN = new Set(['status','lifecycle','approved_hash','approved_by','approved_at','locked_at','published_at','usage','updated_at','created_at','verification','needs_verification','previous_exam_id','reuse_check','revision_check']);
  const REVIEW_FIELDS = ['grade','subject_name','type','lesson_code','level','learning_outcome','question','options','correct','option_explanations','statements','short_answer','rubric','max_score','equivalent_answer_policy','response_mode','competency'];
  const checklist = Object.freeze([
    {key:'accurate',label:'Nội dung chính xác về kiến thức'},
    {key:'outcome',label:'Bám đúng yêu cầu cần đạt đã gắn'},
    {key:'level',label:'Mức độ nhận thức phù hợp'},
    {key:'answer',label:'Đáp án đúng và không mơ hồ'},
    {key:'distractors',label:'Phương án nhiễu hợp lý, đồng nhất / hướng dẫn chấm đủ ý, rõ biểu điểm'},
    {key:'language',label:'Ngôn ngữ rõ ràng, đơn nghĩa, thống nhất kí hiệu, không lỗi chính tả'},
    {key:'informatics',label:'Đoạn mã, hình, thuật ngữ, phiên bản phần mềm và kết quả chương trình đúng (nếu có)'}
  ].map(Object.freeze));
  const levels = ['Biết','Hiểu','Vận dụng','Vận dụng cao'];
  const kinds = ['MC','YN','SHORT','ES'];
  const frozen = x => ['locked','published'].includes(x.status);
  const fail = message => { throw new Error(message); };
  const now = () => new Date().toISOString();
  const text = x => x !== null && x !== undefined && String(x).trim() !== '';
  const norm = x => String(x == null ? '' : x).normalize('NFC').toLowerCase().trim().replace(/\s+/gu,' ');
  function canonical(x) {
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
    if (typeof x === 'number' && Number.isFinite(x)) return JSON.stringify(x);
    if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
    if (x && typeof x === 'object' && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)) {
      return '{' + Object.keys(x).sort().map(k => JSON.stringify(k)+':'+canonical(x[k])).join(',') + '}';
    }
    fail('Dữ liệu JSON không hợp lệ (không chấp nhận giá trị thiếu hoặc số không hữu hạn).');
  }
  // JSON clone intentionally omits undefined object properties from optional form fields.
  const clone = x => JSON.parse(JSON.stringify(x));
  const id = prefix => prefix + (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  async function contentHash(record) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) fail('Không có WebCrypto SHA-256. Hãy mở ứng dụng qua HTTPS hoặc localhost.');
    const content = Object.fromEntries(Object.entries(record || {}).filter(([k]) => !ADMIN.has(k)));
    const bytes = new TextEncoder().encode(canonical(content));
    return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
  }
  const statusOf = q => q.review_status === 'content_checked' ? 'pending_review' : q.review_status || 'draft';
  function shortAnswer(q) {
    for (const k of ['short_answer','correct_answer','answer']) if (text(q[k])) return String(q[k]).trim();
    return '';
  }
  function reviewContent(q, version) {
    const c = {};
    for (const k of REVIEW_FIELDS) if (q[k] !== undefined && q[k] !== null && q[k] !== '') c[k] = clone(q[k]);
    if (q.type === 'SHORT') c.short_answer = shortAnswer(q);
    if (version && q.type === 'MC' && Array.isArray(q.options)) {
      c.options = q.options.map((o,i) => [String(o), i === q.correct, String((q.option_explanations || [])[i] || '')]).sort((a,b) => canonical(a).localeCompare(canonical(b)));
      delete c.correct; delete c.option_explanations;
    }
    if (version && q.type === 'YN' && Array.isArray(q.statements)) c.statements = q.statements.map(s => [String(s.text || ''),s.correct]).sort((a,b) => canonical(a).localeCompare(canonical(b)));
    return canonical(c);
  }
  function technicalProblems(q) {
    const problems = [];
    if (!text(q.question)) problems.push('Thiếu nội dung câu hỏi.');
    if (!text(q.learning_outcome)) problems.push('Chưa gắn yêu cầu cần đạt.');
    if (!text(q.lesson_code) || !levels.includes(q.level) || !Number.isInteger(q.grade) || q.grade < 6 || q.grade > 12) problems.push('Khối, bài hoặc mức độ không hợp lệ.');
    if (!kinds.includes(q.type)) problems.push('Dạng câu không hợp lệ.');
    if (q.type === 'MC') {
      if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !text(o)) || new Set(q.options.map(norm)).size !== 4) problems.push('Câu nhiều lựa chọn cần bốn phương án khác nhau.');
      if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) problems.push('Chưa chọn đáp án đúng.');
    }
    if (q.type === 'YN' && (!Array.isArray(q.statements) || q.statements.length !== 4 || q.statements.some(s => !s || !text(s.text) || typeof s.correct !== 'boolean'))) problems.push('Câu Đúng/Sai cần bốn ý đủ nội dung và đáp án.');
    if (q.type === 'SHORT' && !shortAnswer(q)) problems.push('Câu trả lời ngắn chưa có đáp án.');
    if (q.type === 'ES' && (!Array.isArray(q.rubric) || !q.rubric.length || q.rubric.some(r => !r || !text(r.criterion) || !positive(r.points)))) problems.push('Câu tự luận chưa có hướng dẫn chấm hợp lệ.');
    return problems;
  }
  const positive = n => (typeof n === 'number' || typeof n === 'string' && n.trim() !== '') && Number.isFinite(Number(n)) && Number(n) > 0;
  function assertTechnical(q) {
    const problems = technicalProblems(q);
    if (problems.length) fail('Câu hỏi chưa qua kiểm tra kỹ thuật: '+problems.join(' '));
  }
  function saveQuestion(existing, incoming) {
    const q = clone({...existing,...incoming});
    const old = existing && clone(existing);
    q.id = old ? old.id : q.id || id('K'+q.grade+'-GV-');
    q.created_at = old ? old.created_at || now() : now();
    q.updated_at = now();
    q.origin = old ? old.origin || 'teacher' : q.origin || 'teacher';
    q.review_history = old ? clone(old.review_history || []) : [];
    q.review_status = old ? statusOf(old) : 'draft';
    for (const key of ['review_hash','approved_hash','approved_by','approved_at','status_before_archive','archived_at']) {
      delete q[key];
      if (old && old[key] !== undefined) q[key] = clone(old[key]);
    }
    if (old && statusOf(old) === 'approved' && reviewContent(q) !== reviewContent(old)) {
      q.review_status = 'needs_review';
      q.review_history.push({action:'edit_after_approval',at:q.updated_at,by:'local',from_status:'approved'});
      delete q.review_hash;
    }
    if (old && statusOf(old) === 'archived' && old.status_before_archive === 'approved' && reviewContent(q) !== reviewContent(old)) {
      q.status_before_archive = 'needs_review';
      delete q.review_hash;
    }
    return q;
  }
  function reviewQuestion(question, action, options = {}) {
    const q = clone(question), status = statusOf(q), at = now();
    const entry = {action,at,by:String(options.actor || 'local'),from_status:status};
    const reason = String(options.reason || '').trim();
    let next;
    if (action === 'submit') {
      if (!['draft','needs_review'].includes(status)) fail('Chỉ gửi duyệt được câu nháp hoặc câu cần sửa lại.');
      assertTechnical(q); next = 'pending_review';
    } else if (action === 'approve') {
      if (status !== 'pending_review') fail('Chỉ duyệt được câu đang chờ duyệt.');
      if (checklist.some(c => !options.checklist || options.checklist[c.key] !== true)) fail('Phiếu kiểm định chưa được xác nhận đủ.');
      assertTechnical(q); entry.checklist = Object.fromEntries(checklist.map(c => [c.key,true])); next = 'approved';
    } else if (action === 'reject' || action === 'return') {
      if (!['pending_review','approved'].includes(status)) fail('Chỉ trả lại được câu chờ duyệt hoặc đã duyệt.');
      if (!reason) fail('Khi trả lại phải ghi lý do cần sửa.');
      next = 'needs_review';
    } else if (action === 'archive') {
      if (status === 'archived') fail('Câu hỏi đã được lưu trữ.');
      q.status_before_archive = status; q.archived_at = at; next = 'archived';
    } else if (action === 'restore') {
      if (status !== 'archived') fail('Chỉ khôi phục được câu đã lưu trữ.');
      next = ['draft','needs_review','pending_review','approved'].includes(q.status_before_archive) ? q.status_before_archive : 'draft';
      delete q.status_before_archive; delete q.archived_at;
    } else fail('Thao tác duyệt câu hỏi không hợp lệ.');
    if (reason) entry.reason = reason.slice(0,1000);
    q.review_status = next; q.updated_at = at; q.review_history = [...(q.review_history || []),entry];
    return q;
  }
  function validateQuestions(record, exam) {
    if (!Array.isArray(record.questions) || !record.questions.length) fail('Hồ sơ cần ít nhất một câu hỏi; không chấp nhận đề rỗng.');
    const ids = new Set(); let total = 0;
    for (const q of record.questions) {
      if (!q || !text(q.id) || ids.has(q.id)) fail('Mã câu hỏi thiếu hoặc trùng trong hồ sơ.');
      ids.add(q.id);
      assertTechnical(q);
      if (q.grade !== record.grade) fail('Câu hỏi phải cùng khối với hồ sơ.');
      if (exam) {
        if (!positive(q.points)) fail('Điểm câu hỏi phải lớn hơn 0.');
        total += Number(q.points);
      }
    }
    if (exam && Math.abs(total-10) > 1e-9) fail('Tổng điểm đề phải bằng 10.');
  }
  function matrixCheck(exam, matrix, ppct) {
    if (!matrix || !Array.isArray(matrix.slots) || !matrix.slots.length || !Array.isArray(matrix.requirements)) fail('Ma trận chưa có vị trí hoặc yêu cầu để đối chiếu.');
    if (matrix.grade !== exam.grade || exam.matrix_id && matrix.id !== exam.matrix_id) fail('Ma trận không khớp mã hoặc khối của đề.');
    if (matrix.mode === 'received' && (!matrix.reconciliation || matrix.reconciliation.confirmed !== true || (matrix.reconciliation.issues || []).length)) fail('Ma trận nhận từ nguồn chưa được đối chiếu đầy đủ.');
    const reqs = new Map(), expected = new Map(), actual = new Map();
    const key = (lesson,outcome,kind,level) => canonical([lesson,outcome,kind,level]);
    const add = (map,k,count,points) => { const v=map.get(k)||[0,0]; map.set(k,[v[0]+count,v[1]+points]); };
    for (const r of matrix.requirements) {
      if (!r || !text(r.id) || reqs.has(r.id)) fail('Ma trận có mã yêu cầu thiếu hoặc trùng.');
      reqs.set(r.id,r);
    }
    const slotIds = new Set(), anyCells = new Set();
    const cellId = (lesson,kind,level) => canonical([lesson,kind,level]);
    for (const slot of matrix.slots) {
      if (!slot || !text(slot.id) || slotIds.has(slot.id) || !kinds.includes(slot.kind) || !Array.isArray(slot.parts) || !slot.parts.length) fail('Ma trận có vị trí câu thiếu, trùng hoặc không hợp lệ.');
      slotIds.add(slot.id);
      let identity;
      for (const part of slot.parts) {
        const r = reqs.get(part.requirement_id);
        if (!r || !text(r.lesson_code) || !levels.includes(r.level) || !positive(part.points)) fail('Ma trận có ý chưa ánh xạ hoặc điểm không hợp lệ.');
        let outcome = r.text;
        if (r.outcome_mode === 'any') {
          // Ô ma trận 2D: mọi YCCĐ của bài; so khớp theo bài × dạng × mức độ.
          outcome = '*'; anyCells.add(cellId(r.lesson_code,slot.kind,r.level));
        } else if (ppct) {
          const lesson = (ppct.lessons || []).find(l => l.lesson_code === r.lesson_code && (l.grade == null || l.grade === exam.grade));
          outcome = lesson && Number.isInteger(r.ppct_outcome_index) && r.ppct_outcome_index >= 0 ? (lesson.outcomes || [])[r.ppct_outcome_index] : undefined;
          if (typeof outcome !== 'string' || !text(outcome)) fail('Ma trận chưa ánh xạ đúng YCCĐ trong PPCT.');
        }
        if (!text(outcome)) fail('Ma trận chưa có nội dung YCCĐ để đối chiếu.');
        const k = key(r.lesson_code,outcome,slot.kind,r.level);
        if (identity !== undefined && identity !== k) fail('Ma trận có câu nhiều ý khác ô; cần đối chiếu từng ý, chưa thể xác nhận từ câu mẹ.');
        add(expected,k,identity === undefined ? 1 : 0,Number(part.points)); identity = k;
      }
    }
    for (const q of exam.questions) {
      const any = anyCells.has(cellId(q.lesson_code,q.type,q.level));
      if (any && ppct) {
        const lesson = (ppct.lessons || []).find(l => l.lesson_code === q.lesson_code && (l.grade == null || l.grade === exam.grade));
        if (!lesson || !(lesson.outcomes || []).some(o => norm(o) === norm(q.learning_outcome))) fail('Câu thuộc bài ' + q.lesson_code + ' có YCCĐ không có trong PPCT của bài.');
      }
      add(actual,key(q.lesson_code,any ? '*' : q.learning_outcome,q.type,q.level),1,Number(q.points));
    }
    for (const k of new Set([...expected.keys(),...actual.keys()])) {
      const e=expected.get(k)||[0,0], a=actual.get(k)||[0,0];
      if (e[0] !== a[0] || Math.abs(e[1]-a[1]) > 1e-9) fail('Đề lệch số câu hoặc điểm tại ô ma trận: '+k);
    }
  }
  // Match actual normalized content, never caller-supplied hash flags or close-match approvals.
  function exactContent(q) {
    const body = [q.type,norm(q.question)];
    if (q.type === 'MC') body.push((q.options || []).map(norm).sort());
    if (q.type === 'YN') body.push((q.statements || []).map(s => norm(s.text)).sort());
    if (q.type === 'SHORT') body.push(norm(shortAnswer(q)));
    return canonical(body);
  }
  function revisionCheck(exam, revision) {
    if (!revision || revision.id !== exam.revision_id || revision.grade !== exam.grade) fail('Đề chưa gắn phiên bản đề cương hợp lệ.');
    validateQuestions(revision,false);
    const outcomes = new Set(revision.questions.map(q => canonical([q.lesson_code,q.learning_outcome])));
    if (exam.questions.some(q => !outcomes.has(canonical([q.lesson_code,q.learning_outcome])))) fail('Đề cương chưa bao phủ 100% YCCĐ của đề.');
    const exact = new Set(revision.questions.map(exactContent));
    const hasOverall = revision?.overall_target_percent != null || exam?.overall_target_percent != null;
    const req = hasOverall ? (exam.questions.length ? Math.max(1, Math.floor(exam.questions.length * 0.9 + 1e-9)) : 0) : Math.ceil(exam.questions.length * 0.9);
    if (exam.questions.filter(q => exact.has(exactContent(q))).length < req) fail('Đề phải có ít nhất 90% câu trùng nội dung thực tế với đề cương.');
  }
  function revisionContent(revision) {
    return canonical(Object.fromEntries(Object.entries(revision).filter(([k]) => !ADMIN.has(k) && !['published_by','locked_by'].includes(k))));
  }
  function assertRevisionSnapshot(exam, revision) {
    if (!exam.revision_snapshot || revisionContent(exam.revision_snapshot) !== revisionContent(revision)) fail('Đề cương đã thay đổi phiên bản so với bản chụp trong đề.');
  }
  async function assertFrozen(record) {
    if (!record.approved_hash || await contentHash(record) !== record.approved_hash) fail('Nội dung đã thay đổi sau khi duyệt; hãy tạo bản chỉnh sửa mới và duyệt lại.');
  }
  async function transitionExam(exam, action, options = {}) {
    const e = clone(exam), status = e.status || 'drafting', at = now();
    const entry = {action,at,by:String(options.actor || 'local'),from_status:status};
    if (action === 'new_revision') {
      if (!frozen(e)) fail('Chỉ tạo bản chỉnh sửa mới từ đề đã khóa hoặc phát hành.');
      await assertFrozen(e);
      const result = Object.fromEntries(Object.entries(e).filter(([k]) => !ADMIN.has(k)));
      result.id = id('EXAM-'); result.status = 'drafting'; result.created_at = at;
      result.previous_exam_id = e.id; result.lifecycle = [{...entry,action:'new_revision_from',source:e.id}];
      return result;
    }
    if (action === 'return' || action === 'reject') {
      if (status !== 'pending_approval') fail('Chỉ trả lại được đề đang chờ duyệt.');
      if (!text(options.reason)) fail('Khi trả lại đề phải ghi lý do.');
      entry.reason = String(options.reason).trim().slice(0,1000); e.status = 'drafting';
    } else if (action === 'submit' || action === 'approve') {
      if (action === 'submit' && status !== 'drafting') fail('Chỉ gửi duyệt được đề đang soạn.');
      if (action === 'approve' && status !== 'pending_approval') fail('Chỉ duyệt được đề đang chờ duyệt.');
      validateQuestions(e,true);
      if (!Array.isArray(options.questions)) fail('Chưa cung cấp ngân hàng câu hỏi hiện tại để đối chiếu.');
      const bank = new Map();
      for (const q of options.questions) {
        if (bank.has(q.id)) fail('Ngân hàng có mã câu hỏi trùng.');
        bank.set(q.id,q);
      }
      for (const q of e.questions) {
        const b = bank.get(q.id);
        if (!b || statusOf(b) !== 'approved') fail('Câu hỏi trong ngân hàng chưa được duyệt hoặc không còn tồn tại.');
        assertTechnical(b);
        if (reviewContent(q,true) !== reviewContent(b,true)) fail('Nội dung câu trong đề khác phiên bản đã duyệt.');
      }
      const matrix = e.matrix_snapshot || options.matrix;
      matrixCheck(e,matrix,options.ppct);
      if (e.matrix_snapshot && options.matrix && canonical(e.matrix_snapshot) !== canonical(options.matrix)) fail('Bản chụp ma trận khác phiên bản hiện tại; cần tạo lại đề.');
      revisionCheck(e,options.revision);
      if (e.revision_snapshot) assertRevisionSnapshot(e,options.revision);
      e.matrix_snapshot = clone(matrix); e.revision_snapshot = clone(options.revision);
      if (action === 'approve') {
        e.approved_hash = await contentHash(e); e.approved_by = entry.by; e.approved_at = at; e.locked_at = at;
        entry.content_hash = e.approved_hash; e.status = 'locked';
      } else e.status = 'pending_approval';
    } else if (action === 'publish') {
      if (status !== 'locked') fail('Chỉ phát hành được đề đã duyệt và khóa.');
      await assertFrozen(e);
      if (!options.revision || options.revision.id !== e.revision_id || options.revision.status !== 'published') fail('Chỉ phát hành đề khi đề cương liên kết đã phát hành.');
      assertRevisionSnapshot(e,options.revision);
      e.status = 'published'; e.published_at = at;
      entry.content_hash = e.approved_hash;
      e.usage = {published_at:at,by:entry.by,exam_type:e.exam_type || '',grade:e.grade,exam_code:e.exam_code || '',questions:e.questions.map(q => ({id:q.id,version:reviewContent(q,true)}))};
    } else fail('Thao tác với đề không hợp lệ; đề khóa hoặc đã phát hành không được sửa hoặc xóa.');
    e.lifecycle = [...(e.lifecycle || []),entry];
    return e;
  }
  async function transitionRevision(revision, action, options = {}) {
    const r = clone(revision), status = r.status || 'drafting', at = now();
    const entry = {action,at,by:String(options.actor || 'local'),from_status:status};
    const linked = (options.exams || []).filter(e => e.revision_id === r.id);
    if (action === 'lock') {
      if (status !== 'drafting') fail('Chỉ khóa được đề cương đang soạn.');
      validateQuestions(r,false); r.status = 'locked'; r.locked_at = at; r.locked_by = entry.by;
    } else if (action === 'publish') {
      if (!['drafting','locked'].includes(status)) fail('Chỉ phát hành được đề cương đang soạn hoặc đã khóa.');
      validateQuestions(r,false);
      if (!linked.length) fail('Cần ít nhất một đề căn cứ đã khóa để phát hành đề cương.');
      const unlocked = linked.filter(e => !frozen(e));
      if (unlocked.length) {
        // Nêu rõ đề nào còn thiếu (kể cả mã hoán vị: mã hoán vị không thừa hưởng việc duyệt của đề gốc).
        const names = unlocked.map(e => (e.exam_code ? 'mã ' + e.exam_code : '') + (e.title ? ' “' + e.title + '”' : '') || e.id).map(s => s.trim());
        fail('Chưa thể phát hành đề cương vì còn ' + unlocked.length + ' đề căn cứ chưa được duyệt và khóa: ' + names.join('; ') + '. Hãy duyệt và khóa các đề này (hoặc xóa mã không dùng) rồi phát hành lại.');
      }
      for (const e of linked) {
        await assertFrozen(e); validateQuestions(e,true); revisionCheck(e,r); assertRevisionSnapshot(e,r);
      }
      r.status = 'published'; r.published_at = at; r.published_by = entry.by;
    } else if (action === 'unlock') {
      if (!frozen(r)) fail('Chỉ mở khóa được đề cương đã khóa hoặc phát hành.');
      if (linked.some(frozen)) fail('Không thể mở khóa đề cương vì đã có đề khóa hoặc phát hành liên kết.');
      r.status = 'drafting';
    } else fail('Thao tác với đề cương không hợp lệ; hồ sơ khóa không được sửa.');
    r.lifecycle = [...(r.lifecycle || []),entry];
    return r;
  }
  function assertEditable(record) {
    if (frozen(record)) fail('Hồ sơ đã khóa hoặc phát hành không được sửa hoặc xóa; hãy tạo bản chỉnh sửa mới.');
    return true;
  }
  return Object.freeze({contentHash,saveQuestion,reviewQuestion,transitionExam,transitionRevision,checklist,assertEditable,technicalProblems});
});
