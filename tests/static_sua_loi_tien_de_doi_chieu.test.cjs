'use strict';
// Sửa lỗi sau rà soát commit 107ac84 (25/11/2026): vòng lặp bài tiền đề khi lưu PPCT, mã lỗi đề cương khi đối chiếu.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/core.js');
const KR = require('../public/knowledge-rules.js');

const L = (code, pre, grade = 9) => ({ grade, subject_name: 'Tin học', lesson_code: code, prerequisites: pre || [] });

test('Vòng lặp tiền đề: chỉ chặn vòng lặp đi qua bài đang lưu; vòng lặp cũ ở chỗ khác không chặn lưu bài khác', () => {
  const lessons = [L('B1', ['B3']), L('B2', ['B1']), L('B3', ['B2']), L('B4'), L('B5', ['B4'])];
  assert.equal(C.detectPrerequisiteCycle(lessons, 'Tin học', { through: '9:B5' }).hasCycle, false);
  assert.deepEqual(C.detectPrerequisiteCycle(lessons, 'Tin học', { through: '9:B1' }).cycle, ['9:B1', '9:B2', '9:B3', '9:B1']);
  assert.equal(C.detectPrerequisiteCycle(lessons, 'Tin học').hasCycle, true, 'Không truyền through: vẫn tìm mọi vòng lặp như cũ');
  const cross = [L('B12', ['9:B1'], 8), L('B1', ['8:B12'])];
  assert.deepEqual(C.detectPrerequisiteCycle(cross, 'Tin học', { through: '9:B1' }).cycle, ['9:B1', '8:B12', '9:B1'], 'Vòng lặp liên khối');
});

test('Đề cương không hợp lệ: vi phạm kho luật mang cùng mã với kiểm định cũ (revision), đối chiếu không báo lệch giả', () => {
  const exam = { id: 'E', grade: 9, subject_name: 'Tin học', revision_id: 'REV-X', questions: [] };
  const k = KR.checkExam({ revisions: [] }, exam, { revision: { questions: [] }, procedural: [{ code: 'revision', message: 'Đề cương phải cùng khối, môn và kì kiểm tra.' }] });
  const f = k.errors.find(e => e.rule === 'R-DE-CUONG-HOP-LE');
  assert.ok(f);
  assert.equal(f.code, 'revision');
});

test('Gợi ý 90% (làm tròn lên: 31 câu → 28) nhưng KHÔNG ép bù khi giáo viên chủ động chỉnh số câu/tỉ lệ thấp hơn', () => {
  assert.equal(C.requiredRevisionCount(31, 90), 28);
  assert.equal(C.requiredRevisionCount(20, 90), 18);
  assert.equal(C.requiredRevisionCount(12, 90), 11);
  assert.equal(C.requiredRevisionCount(10, 100), 10);
  // Gợi ý theo tổng 90% + ghim TL 100% -> 25/28 TN + 3/3 TL = 28/31.
  const sugg = C.computeRevisionPlan({ MC: 28, ES: 3 }, { overallPercent: 90, typeTargets: { ES: 100 } });
  assert.deepEqual([sugg.required_total, sugg.by_type.MC.want, sugg.by_type.ES.want, sugg.below_min_90], [28, 25, 3, false]);
  // Chỉnh trực tiếp số câu: 24/28 TN + 3/3 TL = 27/31 — giữ đúng ý giáo viên, báo below_min_90: true để cảnh báo.
  const customCnt = C.computeRevisionPlan({ MC: 28, ES: 3 }, { typeCounts: { MC: 24, ES: 3 } });
  assert.deepEqual([customCnt.required_total, customCnt.by_type.MC.want, customCnt.by_type.ES.want, customCnt.below_min_90], [27, 24, 3, true]);
  // Chỉnh theo % từng dạng: TN 85% + TL 100% -> 24 + 3 = 27/31, không ép nhảy về 28.
  const customPct = C.computeRevisionPlan({ MC: 28, ES: 3 }, { typeTargets: { MC: 85, ES: 100 } });
  assert.deepEqual([customPct.required_total, customPct.by_type.MC.want, customPct.by_type.ES.want, customPct.below_min_90], [27, 24, 3, true]);
  const c = C.computeRevisionPlan({ MC: 28, ES: 3 });
  assert.equal(c.required_total, 28);
  assert.ok(c.actual_percent >= 90);
});
