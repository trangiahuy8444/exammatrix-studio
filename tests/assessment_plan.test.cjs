const test = require('node:test');
const assert = require('node:assert/strict');
const planModel = require('../public/assessment-plan-model.js');
const staticApi = require('../public/static-api.js');

test('assessment-plan-model builds valid defaults for grade 8', () => {
  const plans = planModel.buildDefaultAssessmentPlans(8, 'Tin học');
  assert.equal(plans.length, 4, 'Should build 4 periodic assessment plans (GK1, CK1, GK2, CK2)');
  assert.equal(plans[0].exam_type, 'GK1');
  assert.equal(plans[0].grade, 8);
  assert.equal(plans[0].coefficient, 2);
  assert.ok(plans[0].scope_lessons.includes('B1'));
  assert.ok(plans[0].scope_lessons.includes('B6'));
  assert.equal(plans[1].exam_type, 'CK1');
  assert.equal(plans[1].coefficient, 3);
  assert.equal(plans[1].duration, 45);
});

test('assessment-plan-model builds valid defaults for grade 9 and 10', () => {
  const p9 = planModel.buildDefaultAssessmentPlans(9, 'Tin học');
  assert.equal(p9.length, 4);
  assert.equal(p9[0].exam_type, 'GK1');

  const p10 = planModel.buildDefaultAssessmentPlans(10, 'Tin học');
  assert.equal(p10.length, 4);
  assert.equal(p10[0].grade, 10);
  assert.equal(p10[0].duration, 45);
});

test('assessment-plan-model normalizes raw user inputs safely', () => {
  const raw = {
    name: '  Kiểm tra giữa kì 1 khối 8  ',
    exam_type: 'GK1',
    duration: '45 phút',
    week: 'Tuần 9',
    period: 'Tiết 9',
    coefficient: '2',
    scope_lessons: 'B1, B2, B3; B4'
  };
  const normalized = planModel.normalizePlan(raw, 8, 'Tin học');
  assert.equal(normalized.name, 'Kiểm tra giữa kì 1 khối 8');
  assert.equal(normalized.grade, 8);
  assert.equal(normalized.duration, 45);
  assert.equal(normalized.coefficient, 2);
  assert.deepEqual(normalized.scope_lessons, ['B1', 'B2', 'B3', 'B4']);
});

test('assessment-plan-model parses table rows from Excel/CSV (CV 5512 Phụ lục 3)', () => {
  const rows = [
    ['Bài kiểm tra, đánh giá', 'Thời gian', 'Thời điểm', 'Hệ số', 'Hình thức', 'Phạm vi bài học'],
    ['Kiểm tra Giữa kì 1', '45 phút', 'Tuần 9, Tiết 9', '2', 'Trắc nghiệm + Tự luận', 'B1; B2; B3; B4; B5; B6'],
    ['Kiểm tra Cuối kì 1', '45 phút', 'Tuần 18, Tiết 18', '3', 'Trắc nghiệm + Tự luận', 'B1 đến B13']
  ];
  const parsed = planModel.parseAssessmentPlansFromRows(rows, 8, 'Tin học');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Kiểm tra Giữa kì 1');
  assert.equal(parsed[0].duration, 45);
  assert.equal(parsed[0].coefficient, 2);
  assert.deepEqual(parsed[0].scope_lessons, ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
});

test('assessment-plan-model links matrix to plan and syncs lessons', () => {
  const plan = {
    id: 'PLAN-K8-GK1',
    name: 'Kiểm tra Đánh giá Giữa Học kỳ 1',
    exam_type: 'GK1',
    duration: 45,
    grade: 8,
    scope_lessons: ['B1', 'B2', 'B3']
  };
  const matrix = {
    grade: 8,
    title: 'Ma trận tự do',
    lessons: [],
    requirements: []
  };
  const linked = planModel.linkMatrixToAssessmentPlan(matrix, plan);
  assert.equal(linked.assessment_plan_id, 'PLAN-K8-GK1');
  assert.equal(linked.exam_type, 'GK1');
  assert.equal(linked.duration, 45);

  const ppctLs = [
    { lesson_code: 'B1', title: 'Lịch sử máy tính', topic: 'Chủ đề 1' },
    { lesson_code: 'B2', title: 'Thông tin trong môi trường số', topic: 'Chủ đề 1' },
    { lesson_code: 'B3', title: 'Thực hành khai thác thông tin số', topic: 'Chủ đề 2' },
    { lesson_code: 'B4', title: 'Đạo đức trong môi trường số', topic: 'Chủ đề 3' }
  ];
  planModel.syncLessonsFromAssessmentPlan(linked, plan, ppctLs);
  assert.equal(linked.lessons.length, 3);
  assert.equal(linked.lessons[0].lesson_code, 'B1');
  assert.equal(linked.lessons[1].lesson_code, 'B2');
  assert.equal(linked.lessons[2].lesson_code, 'B3');
});

test('static-api handles /api/assessment-plans endpoints successfully', async () => {
  const env = {
    engine: {
      validateMatrix: () => ({ valid: true, errors: [], warnings: [] }),
      shortfall: () => ({ ok: true, cells: [] })
    },
    workflow: {},
    subject: 'Tin học'
  };

  const initialWorkspace = {
    bank: { questions: [], ppct: { lessons: [] } },
    exams: [],
    revisions: [],
    matrices: [],
    assessment_plans: []
  };

  // 1. Reset defaults
  const resetRes = await staticApi.handle('/api/assessment-plans/reset-defaults', { grade: 8 }, initialWorkspace, env);
  assert.ok(resetRes.changed);
  assert.equal(resetRes.response.success, true);
  assert.equal(resetRes.data.assessment_plans.length, 4);

  // 2. List
  const listRes = await staticApi.handle('/api/assessment-plans', { grade: 8 }, resetRes.data, env);
  assert.equal(listRes.response.assessment_plans.length, 4);

  // 3. Save new plan
  const saveRes = await staticApi.handle('/api/assessment-plans/save', {
    plan: {
      name: 'Kiểm tra chuyên đề nâng cao',
      grade: 8,
      exam_type: 'TX',
      duration: 15,
      coefficient: 1,
      scope_lessons: ['B1', 'B2']
    }
  }, resetRes.data, env);
  assert.ok(saveRes.changed);
  assert.equal(saveRes.data.assessment_plans.length, 5);

  // 4. Delete plan
  const savedId = saveRes.response.plan.id;
  const delRes = await staticApi.handle('/api/assessment-plans/delete', { id: savedId }, saveRes.data, env);
  assert.ok(delRes.changed);
  assert.equal(delRes.data.assessment_plans.length, 4);

  // 5. Import replace_grade preserves other grades/subjects and replaces current grade cleanly
  const grade9Seed = await staticApi.handle('/api/assessment-plans/reset-defaults', { grade: 9, subject_name: 'Tin học' }, delRes.data, env);
  assert.equal(grade9Seed.data.assessment_plans.length, 8);
  const impRes = await staticApi.handle('/api/assessment-plans/import', {
    grade: 8,
    subject_name: 'Tin học',
    replace_grade: true,
    rows: [
      ['STT', 'Bài kiểm tra, đánh giá', 'Thời gian', 'Thời điểm (Tuần)', 'Tiết PPCT', 'Hệ số', 'Hình thức', 'Phạm vi bài học', 'Yêu cầu cần đạt tóm tắt', 'Ghi chú'],
      ['---', '---', '---', '---', '---', '---', '---', '---', '---', '---'],
      ['1', 'Kiểm tra Giữa Học kỳ 1', '45 phút', 'Tuần 9', 'Tiết 9', '2', 'TNKQ + TL', 'B1; B2; B3', 'Chủ đề 1 & 2', 'Theo TT 22'],
      ['2', 'Kiểm tra Cuối Học kỳ 1', '60 phút', 'Tuần 18', 'Tiết 18', '3', 'TNKQ + TL', 'B1; B2; B3; B4; B5', 'Toàn bộ HK1', 'Theo TT 22']
    ]
  }, grade9Seed.data, env);
  assert.ok(impRes.changed);
  assert.equal(impRes.response.imported.length, 2);
  const k8After = impRes.data.assessment_plans.filter(p => p.grade === 8);
  const k9After = impRes.data.assessment_plans.filter(p => p.grade === 9);
  assert.equal(k8After.length, 2, 'Thay thế KHKTĐG Khối 8 thành 2 mốc mới');
  assert.equal(k9After.length, 4, 'Giữ nguyên 4 mốc Khối 9');
  assert.equal(k8After[1].exam_type, 'CK1');
  assert.equal(k8After[1].duration, 60);
  assert.equal(k8After[1].coefficient, 3);
  assert.equal(k8After[0].scope_description, 'Chủ đề 1 & 2');
});

test('assessment-plan-model parses Markdown rows with kì/kỳ spelling and STT column', () => {
  const rows = [
    ['STT', 'Bài kiểm tra, đánh giá', 'Thời gian (phút)', 'Thời điểm (Tuần)', 'Hệ số', 'Hình thức', 'Phạm vi bài học', 'Yêu cầu cần đạt'],
    ['---', '---', '---', '---', '---', '---', '---', '---'],
    ['1', 'Kiểm tra Đánh giá Cuối Học kỳ 1', '45', 'Tuần 18', '3', 'Trắc nghiệm + Tự luận', 'B1; B2; B3; B4', 'Tổng hợp kiến thức HK1'],
    ['2', 'Kiểm tra Đánh giá Giữa Học kỳ 2', '45', 'Tuần 27', '2', 'Thực hành', 'B5; B6', 'Kiến thức giữa HK2']
  ];
  const parsed = planModel.parseAssessmentPlansFromRows(rows, 9, 'Tin học');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].exam_type, 'CK1');
  assert.equal(parsed[0].coefficient, 3);
  assert.deepEqual(parsed[0].scope_lessons, ['B1', 'B2', 'B3', 'B4']);
  assert.equal(parsed[0].scope_description, 'Tổng hợp kiến thức HK1');
  assert.equal(parsed[1].exam_type, 'GK2');
  assert.equal(parsed[1].coefficient, 2);
});

test('app.js assessment-plans UI has no invalid $$ or #edit-content selectors and includes import helpers', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const appSource = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.equal(/\$\$\s*\(/.test(appSource), false, 'app.js must never call undefined $$()');
  assert.equal(appSource.includes('#edit-content'), false, 'app.js must not reference non-existent #edit-content');
  for (const id of ['ap-import-card', 'ap-download-excel-sample', 'ap-download-json-sample', 'ap-download-md-sample', 'ap-copy-prompt', 'ap-import-inspect', 'ap-import-apply']) {
    assert.ok(appSource.includes(id), `app.js missing UI element #${id}`);
  }
});
