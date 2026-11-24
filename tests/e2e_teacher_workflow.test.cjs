const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
globalThis.crypto = webcrypto;

const api = require('../public/static-api.js');
const engine = require('../public/static-exam-engine.js');
const workflow = require('../public/static-exam-workflow.js');
const comparison = require('../public/exam-comparison.js');

const env = {
  engine,
  workflow,
  comparison,
  subject: 'Tin học',
  actor: 'Giáo viên Tin học 9'
};

function makeInitialWorkspace() {
  return {
    bank: {
      ppct: {
        lessons: [
          {
            grade: 9,
            subject_name: 'Tin học',
            lesson_code: 'B1',
            lesson_name: 'Thế giới kĩ thuật số',
            topic: 'Chủ đề 1: Máy tính và cộng đồng',
            outcomes: ['Nhận biết được thiết bị có gắn bộ xử lí thông tin.']
          },
          {
            grade: 9,
            subject_name: 'Tin học',
            lesson_code: 'B2',
            lesson_name: 'Thông tin trong giải quyết vấn đề',
            topic: 'Chủ đề 2: Tổ chức lưu trữ và tìm kiếm thông tin',
            outcomes: ['Giải thích được sự cần thiết của đánh giá chất lượng thông tin.']
          },
          {
            grade: 9,
            subject_name: 'Tin học',
            lesson_code: 'B3',
            lesson_name: 'Đánh giá chất lượng thông tin',
            topic: 'Chủ đề 2: Tổ chức lưu trữ và tìm kiếm thông tin',
            outcomes: ['Vận dụng tiêu chí đánh giá chất lượng thông tin vào tình huống thực tế.']
          }
        ]
      },
      questions: []
    },
    matrices: [],
    revisions: [],
    exams: []
  };
}

function buildImportQuestions() {
  const qs = [];
  for (let i = 1; i <= 6; i++) {
    qs.push({
      grade: 9,
      subject_name: 'Tin học',
      type: 'MC',
      level: 'Biết',
      lesson_code: 'B1',
      learning_outcome: 'Nhận biết được thiết bị có gắn bộ xử lí thông tin.',
      question: `Câu trắc nghiệm B1 số ${i}: Thiết bị nào sau đây có gắn bộ xử lí thông tin?`,
      options: [`Máy giặt thông minh (${i})`, `Cái bàn gỗ (${i})`, `Cây thước kẻ (${i})`, `Cuốn vở giấy (${i})`],
      correct: 0,
      option_explanations: ['Đúng vì có vi xử lí điều khiển.', 'Sai.', 'Sai.', 'Sai.']
    });
  }
  for (let i = 1; i <= 6; i++) {
    qs.push({
      grade: 9,
      subject_name: 'Tin học',
      type: 'MC',
      level: 'Hiểu',
      lesson_code: 'B2',
      learning_outcome: 'Giải thích được sự cần thiết của đánh giá chất lượng thông tin.',
      question: `Câu trắc nghiệm B2 số ${i}: Vì sao cần kiểm tra tính mới và độ chính xác của thông tin trên Internet?`,
      options: [`Để tránh ra quyết định sai lầm (${i})`, `Để tăng dung lượng ổ cứng (${i})`, `Để đổi màu màn hình (${i})`, `Để tăng tốc độ chuột (${i})`],
      correct: 0,
      option_explanations: ['Đúng.', 'Sai.', 'Sai.', 'Sai.']
    });
  }
  for (let i = 1; i <= 4; i++) {
    qs.push({
      grade: 9,
      subject_name: 'Tin học',
      type: 'ES',
      level: 'Vận dụng',
      lesson_code: 'B3',
      learning_outcome: 'Vận dụng tiêu chí đánh giá chất lượng thông tin vào tình huống thực tế.',
      question: `Câu tự luận B3 số ${i}: Em hãy nêu 2 tiêu chí đánh giá nguồn tin khi tìm tài liệu học tập về biến đổi khí hậu.`,
      rubric: [
        { criterion: 'Nêu đúng tiêu chí tính chính xác và tính mới.', points: 1.0 },
        { criterion: 'Lấy được ví dụ kiểm chứng nguồn tin cậy.', points: 1.0 }
      ],
      max_score: 2.0
    });
  }
  return qs;
}

async function main() {
  let data = makeInitialWorkspace();

  // Bước 1: Nhập bổ sung bộ câu hỏi Khối 9 -> toàn bộ vào trạng thái Nháp (draft)
  const imported = buildImportQuestions();
  let res = await api.handle('/api/bank/import', { mode: 'append', questions: imported }, data, env);
  data = res.data;
  assert.equal(res.changed, true);
  assert.equal(res.response.import_report.added, 16);
  assert.equal(data.bank.questions.length, 16);
  assert.ok(data.bank.questions.every(q => q.review_status === 'draft'), 'Mọi câu mới nhập phải ở trạng thái draft');

  // Bổ sung 1 câu dùng biến thể mã bài ('B01') + YCCĐ khác câu chữ để kiểm tra khớp linh hoạt,
  // 1 câu legacy có mức độ 'Nhận biết' + mã bài 'Bài 1',
  // và 1 câu lỗi kỹ thuật (trùng phương án A/B) để kiểm tra bộ lọc an toàn của duyệt hàng loạt.
  data.bank.questions.push(
    {
      id: 'Q-VAR-B01',
      grade: 9,
      subject_name: 'Tin học',
      type: 'MC',
      level: 'Biết',
      lesson_code: 'B01',
      learning_outcome: 'Diễn đạt YCCĐ khác với ma trận nhưng vẫn hợp lệ kỹ thuật.',
      question: 'Câu biến thể B01: Trong máy giặt hiện đại, bộ phận nào điều khiển chu trình giặt?',
      options: ['Bộ vi xử lí nhúng', 'Vỏ nhựa ngoài', 'Dây phơi đồ', 'Nắp thủy tinh'],
      correct: 0,
      review_status: 'draft'
    },
    {
      id: 'Q-LEGACY-BAI1',
      grade: 9,
      subject_name: 'Tin học',
      type: 'MC',
      level: 'Nhận biết',
      lesson_code: 'Bài 1',
      learning_outcome: 'YCCĐ cũ chưa chuẩn hóa.',
      question: 'Câu cũ Bài 1: Thiết bị số nào giúp lưu trữ và xử lí dữ liệu cá nhân?',
      options: ['Điện thoại thông minh', 'Quyển sách giấy', 'Bảng phấn', 'Bút chì'],
      correct: 0,
      review_status: 'draft'
    },
    {
      id: 'Q-BROKEN-DUP-OPT',
      grade: 9,
      subject_name: 'Tin học',
      type: 'MC',
      level: 'Biết',
      lesson_code: 'B1',
      learning_outcome: 'Nhận biết được thiết bị có gắn bộ xử lí thông tin.',
      question: 'Câu lỗi cố ý: hai phương án giống nhau?',
      options: ['Phương án trùng', 'Phương án trùng', 'Phương án C', 'Phương án D'],
      correct: 0,
      review_status: 'draft'
    }
  );

  // Bước 2: Quy chuẩn duyệt từng câu nghiêm ngặt vẫn được giữ nguyên, và duyệt nhanh hàng loạt hoạt động an toàn
  await assert.rejects(
    api.handle('/api/questions/bulk', { ids: [data.bank.questions[0].id], action: 'approve' }, data, env),
    /phiếu kiểm định/
  );
  await assert.rejects(
    api.handle('/api/questions/bulk', { ids: [data.bank.questions[0].id], action: 'bulk_approve' }, data, env),
    /xác nhận/
  );

  const allIds = data.bank.questions.map(q => q.id);
  res = await api.handle('/api/questions/bulk', { ids: allIds, action: 'bulk_approve', confirmed: true }, data, env);
  data = res.data;
  assert.equal(res.changed, true);
  assert.equal(res.response.approved_count, 17, '16 câu import + Q-VAR-B01 phải được duyệt');
  assert.equal(res.response.skipped_count, 2, 'Q-LEGACY-BAI1 (level Nhận biết chưa chuẩn hóa) và Q-BROKEN-DUP-OPT (trùng phương án) phải bị bỏ qua an toàn');
  assert.equal(data.bank.questions.find(q => q.id === 'Q-BROKEN-DUP-OPT').review_status, 'draft');
  const firstApproved = data.bank.questions[0];
  assert.equal(firstApproved.review_status, 'approved');
  assert.ok(firstApproved.approved_at);
  assert.equal(firstApproved.approved_by, 'Giáo viên Tin học 9');
  assert.ok(firstApproved.review_history.some(h => h.action === 'approve'));

  // Bước 3: Lưu và Khóa Ma trận 2D Khối 9 (6 câu MC 1.0đ + 2 câu ES 2.0đ = 10 điểm)
  const matrixDraft = {
    id: 'MX-E2E-K9',
    family_id: 'FAM-E2E-K9',
    title: 'Ma trận & đặc tả GK1 Tin học 9 (E2E)',
    grade: 9,
    subject_name: 'Tin học',
    exam_type: 'GK1',
    profile: 'THCS',
    mode: 'authored',
    duration: 45,
    total_points: 10,
    school_year: '2026-2027',
    owner_name: 'Giáo viên Tin học 9',
    campus: 'Cao Thắng',
    indicator_catalog: [],
    reconciliation: { confirmed: true, issues: [] },
    lessons: [
      { lesson_code: 'B1', title: 'Thế giới kĩ thuật số', topic: 'Chủ đề 1' },
      { lesson_code: 'B2', title: 'Thông tin trong giải quyết vấn đề', topic: 'Chủ đề 2' },
      { lesson_code: 'B3', title: 'Đánh giá chất lượng thông tin', topic: 'Chủ đề 2' }
    ],
    requirements: [
      { id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết thiết bị gắn bộ xử lí (diễn đạt khác chút vẫn khớp linh hoạt)', ppct_outcome_index: 0, competency: 'NLa' },
      { id: 'R2', lesson_code: 'B2', level: 'Hiểu', text: 'Hiểu ý nghĩa đánh giá thông tin', ppct_outcome_index: 0, competency: 'NLc' },
      { id: 'R3', lesson_code: 'B3', level: 'Vận dụng', text: 'Vận dụng tiêu chí kiểm chứng thông tin', ppct_outcome_index: 0, competency: 'NLc' }
    ],
    slots: [
      { id: 'S1', kind: 'MC', number: 1, scoring: { mode: 'sum_parts' }, parts: [{ id: 'P1', requirement_id: 'R1', points: 1 }] },
      { id: 'S2', kind: 'MC', number: 2, scoring: { mode: 'sum_parts' }, parts: [{ id: 'P2', requirement_id: 'R1', points: 1 }] },
      { id: 'S3', kind: 'MC', number: 3, scoring: { mode: 'sum_parts' }, parts: [{ id: 'P3', requirement_id: 'R1', points: 1 }] },
      { id: 'S4', kind: 'MC', number: 4, scoring: { mode: 'sum_parts' }, parts: [{ id: 'P4', requirement_id: 'R2', points: 1 }] },
      { id: 'S5', kind: 'MC', number: 5, scoring: { mode: 'sum_parts' }, parts: [{ id: 'P5', requirement_id: 'R2', points: 1 }] },
      { id: 'S6', kind: 'MC', number: 6, scoring: { mode: 'sum_parts' }, parts: [{ id: 'P6', requirement_id: 'R2', points: 1 }] },
      { id: 'S7', kind: 'ES', number: 1, scoring: { mode: 'sum_parts' }, parts: [{ id: 'P7', requirement_id: 'R3', points: 2 }] },
      { id: 'S8', kind: 'ES', number: 2, scoring: { mode: 'sum_parts' }, parts: [{ id: 'P8', requirement_id: 'R3', points: 2 }] }
    ]
  };
  res = await api.handle('/api/matrices/save', { matrix: matrixDraft }, data, env);
  data = res.data;
  const matrixId = res.response.matrix.id;
  res = await api.handle('/api/matrices/lock', {
    id: matrixId,
    expected_revision: res.response.matrix.revision,
    confirmation: { confirmed_by: 'Giáo viên Tin học 9', confirmed_at: '2026-11-24', external_agreement: true }
  }, data, env);
  data = res.data;
  assert.equal(res.response.matrix.status, 'locked');

  // Kiểm tra /candidates trong luồng linh hoạt cũng nhận cả B01 và Bài 1 (while strict slots keep strict boundary)
  const candRes = await api.handle(`/api/matrices/${matrixId}/candidates`, undefined, data, env);
  assert.equal(candRes.response.bank_diagnostics.flexible_empty_slots, 0, 'Tất cả ô phải đủ câu ở chế độ linh hoạt');
  const strictS1Ids = new Set(candRes.response.slots[0].candidates.map(c => c.id));
  assert.equal(strictS1Ids.has('Q-LEGACY-BAI1'), false, 'Luồng chặt vẫn phải loại câu nháp Bài 1 Nhận biết');
  const s1CandIds = new Set(candRes.response.flexible_slots[0].candidates.map(c => c.id));
  assert.ok(s1CandIds.has('Q-VAR-B01'), 'Luồng linh hoạt phải nhận câu có mã bài B01 cho ô B1');
  assert.ok(s1CandIds.has('Q-LEGACY-BAI1'), 'Luồng linh hoạt phải nhận câu nháp mã Bài 1 mức Nhận biết');

  // Bước 4: Tự bốc ngẫu nhiên Đề cương theo từng dạng (Trắc nghiệm + Tự luận) & lưu với độ tương đồng 70%
  const proposeA = await api.handle('/api/revisions/propose', {
    grade: 9,
    exam_type: 'GK1',
    matrix_id: matrixId,
    flexible: true,
    type_counts: { MC: 6, ES: 2 },
    seed: 'seed-alpha'
  }, data, env);
  const proposeB = await api.handle('/api/revisions/propose', {
    grade: 9,
    exam_type: 'GK1',
    matrix_id: matrixId,
    flexible: true,
    type_counts: { MC: 6, ES: 2 },
    seed: 'seed-beta-different'
  }, data, env);
  assert.equal(proposeA.response.total, 8);
  const proposedQsA = proposeA.response.question_ids.map(id => data.bank.questions.find(q => q.id === id));
  assert.equal(proposedQsA.filter(q => q.type === 'MC').length, 6);
  assert.equal(proposedQsA.filter(q => q.type === 'ES').length, 2);
  assert.notEqual(
    [...proposeA.response.question_ids].sort().join(','),
    [...proposeB.response.question_ids].sort().join(','),
    'Seed khác nhau phải cho bộ câu bốc ngẫu nhiên khác nhau khi ngân hàng dư'
  );

  res = await api.handle('/api/revisions/save', {
    title: 'Đề cương GK1 Tin học 9 (Tương đồng 70%)',
    grade: 9,
    question_ids: proposeA.response.question_ids,
    similarity_target_percent: 70
  }, data, env);
  data = res.data;
  const savedRev = res.response.revision;
  assert.equal(savedRev.similarity_target_percent, 70);
  assert.equal(savedRev.question_count, 8);

  // Bước 5: Tạo đề một cửa ở mức tương đồng 70% + chống tạo trùng trong 15s + tạo bộ 2 đề
  const genPayload = {
    title: 'Đề GK1 Tin học 9',
    grade: 9,
    exam_type: 'GK1',
    duration: 45,
    matrix_id: matrixId,
    revision_id: savedRev.id,
    seed: '2026',
    similarity_percent: 70,
    similarity_mode: 'min',
    flexible: true
  };
  res = await api.handle('/api/exams/generate', genPayload, data, env);
  data = res.data;
  assert.equal(res.changed, true);
  assert.equal(data.exams.length, 1);
  const singleExam = res.response.exam;
  assert.equal(singleExam.question_count, 8);
  assert.equal(singleExam.total_points, 10);
  const revIdSet = new Set(savedRev.question_ids);
  const overlapCount = singleExam.questions.filter(q => revIdSet.has(q.id)).length;
  assert.ok(overlapCount >= Math.ceil(0.7 * 8), `Tỉ lệ trùng đề cương phải >= 70% (${overlapCount}/8)`);

  // Bấm đúp tạo lại cùng cấu hình trong 15 giây -> trả lại đề đã tạo, KHÔNG sinh bản trùng
  const dupRes = await api.handle('/api/exams/generate', genPayload, data, env);
  data = dupRes.data;
  assert.equal(dupRes.changed, false);
  assert.equal(dupRes.response.exam.id, singleExam.id);
  assert.equal(data.exams.length, 1);

  // Tạo bộ 2 đề thi cùng ma trận và độ tương đồng 70%
  res = await api.handle('/api/exams/generate-set', {
    title: 'Bộ đề GK1 Tin học 9',
    grade: 9,
    exam_type: 'GK1',
    duration: 45,
    matrix_id: matrixId,
    revision_id: savedRev.id,
    exam_count: 2,
    seed: 'set-2026',
    similarity_percent: 70,
    similarity_mode: 'min',
    flexible: true
  }, data, env);
  data = res.data;
  assert.equal(res.changed, true);
  assert.equal(res.response.exams.length, 2);
  assert.deepEqual(res.response.exams.map(e => e.exam_code), ['101', '102']);
  assert.ok(res.response.exams.every(e => e.total_points === 10 && e.question_count === 8));
  assert.equal(data.exams.length, 3);

  // Bước 6: Xóa 1 đề lẻ và xóa hàng loạt các đề còn lại
  res = await api.handle('/api/exams/delete', { id: singleExam.id }, data, env);
  data = res.data;
  assert.equal(res.changed, true);
  assert.equal(data.exams.length, 2);

  const remainingIds = data.exams.map(e => e.id);
  res = await api.handle('/api/exams/delete', { ids: remainingIds }, data, env);
  data = res.data;
  assert.equal(res.changed, true);
  assert.equal(res.response.deleted_count, 2);
  assert.equal(data.exams.length, 0);

  console.log('PASS e2e_teacher_workflow: import -> bulk_approve -> matrix lock -> flexible revision -> single & set exam -> single & batch delete');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
