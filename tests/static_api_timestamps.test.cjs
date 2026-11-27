const assert = require('node:assert/strict');
const test = require('node:test');

const core = require('../public/core.js');
const engine = require('../public/static-exam-engine.js');
const workflow = require('../public/static-exam-workflow.js');
const api = require('../public/static-api.js');
const planModel = require('../public/assessment-plan-model.js');

test('BankCore formatDateTime and createdAtOf normalize timestamps and fallbacks cleanly', () => {
  const out = core.formatDateTime('2026-11-27T08:09:00.000Z', 'Chưa có');
  assert.match(out, /\d{2}\/\d{2}\/2026/, 'Must render Vietnamese dd/MM/yyyy date');
  assert.match(out, /\d{2}:\d{2}/, 'Must render HH:mm time');
  assert.equal(core.formatDateTime(null, 'Chưa ghi thời điểm'), 'Chưa ghi thời điểm');

  assert.equal(core.createdAtOf({ created_at: '2026-11-27T01:00:00Z' }), '2026-11-27T01:00:00Z');
  assert.equal(core.createdAtOf({ audit: [{ at: '2026-11-26T02:00:00Z', action: 'save' }] }), '2026-11-26T02:00:00Z');
  assert.equal(core.createdAtOf({ updated_at: '2026-11-25T03:00:00Z' }), '2026-11-25T03:00:00Z');
  assert.equal(core.createdAtOf(null), null);
});

test('static-api stamps created_at on matrices, competency catalog, assessment plans, and exams', async () => {
  const baseData = {
    bank: {
      ppct: {
        lessons: [
          {
            grade: 8,
            subject_name: 'Tin học',
            lesson_code: 'B1',
            lesson_name_source: 'Bài 1',
            topic_source: 'Chủ đề 1',
            outcomes: ['Nhận biết dữ liệu']
          }
        ]
      },
      questions: [],
      competency_catalogs: []
    },
    assessment_plans: [],
    matrices: [],
    revisions: [],
    exams: []
  };
  const env = { engine, workflow, subject: 'Tin học', actor: 'GV' };

  const catRes = await api.handle('/api/matrices/catalog/save', {
    expected_revision: 0,
    catalog: {
      competencies: [{ code: 'NLa', name: 'Năng lực A' }],
      indicators: [{ code: 'NLa.1', competency: 'NLa', text: 'Chỉ báo A1' }]
    }
  }, baseData, env);
  assert.ok(Date.parse(catRes.response.catalog.created_at), 'Catalog must record created_at');

  const mxRes = await api.handle('/api/matrices/save', {
    matrix: {
      grade: 8,
      profile: 'THCS',
      exam_type: 'GK1',
      title: 'Ma trận B1',
      lessons: [{ lesson_code: 'B1', title: 'Bài 1', topic: 'Chủ đề 1' }],
      requirements: [{ id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết dữ liệu', ppct_outcome_index: 0, competency: 'NLa' }],
      slots: [{ id: 'S1', kind: 'MC', number: 1, scoring: { mode: 'sum_parts' }, parts: [{ id: 'P1', requirement_id: 'R1', points: 10 }] }]
    }
  }, catRes.data, env);
  assert.ok(Date.parse(mxRes.response.matrix.created_at), 'Matrix save must record created_at');

  const dupRes = await api.handle('/api/matrices/duplicate', { id: mxRes.response.matrix.id }, mxRes.data, env);
  assert.ok(Date.parse(dupRes.response.matrix.created_at), 'Matrix duplicate must record fresh created_at');
  assert.equal(dupRes.response.matrix.audit?.[0]?.action, 'duplicate');

  const apRes = await api.handle('/api/assessment-plans/save', {
    plan: { grade: 8, name: 'Kiểm tra GK1', exam_type: 'GK1', duration: 45 }
  }, dupRes.data, { ...env, BankAssessmentPlan: planModel });
  assert.ok(Date.parse(apRes.response.plan.created_at), 'Assessment plan save must record created_at');

  const preserved = planModel.normalizePlan({ grade: 8, name: 'Plan', created_at: '2026-11-20T05:00:00Z' }, 8, 'Tin học');
  assert.equal(preserved.created_at, '2026-11-20T05:00:00Z', 'normalizePlan must preserve created_at');
});
