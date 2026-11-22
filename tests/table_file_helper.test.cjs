const test = require('node:test');
const assert = require('node:assert/strict');
const TableFileHelper = require('../public/table-file-helper.js');

test('TableFileHelper: parseCsvText handles standard and quoted CSV correctly', () => {
  const csv = '\ufeffMã bài,Mức độ,Dạng câu,"Nội dung câu hỏi, có dấu phẩy",Phương án A,Phương án B,Phương án C,Phương án D,Đáp án đúng,"Hướng dẫn giải\nXuống dòng",Yêu cầu cần đạt\nB1,Biết,MC,"Hỏi gì đó, test?",A1,B1,C1,D1,A,Giai thich,YCCD 1';
  const rows = TableFileHelper.parseCsvText(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], 'Mã bài');
  assert.equal(rows[0][3], 'Nội dung câu hỏi, có dấu phẩy');
  assert.equal(rows[1][0], 'B1');
  assert.equal(rows[1][3], 'Hỏi gì đó, test?');
  assert.equal(rows[1][8], 'A');
});

test('TableFileHelper: parseQuestionsFromRows parses MC, YN, SHORT, ES', () => {
  const rows = [
    ['Mã bài', 'Mức độ', 'Dạng câu', 'Nội dung câu hỏi', 'Phương án A / Ý a', 'Phương án B / Ý b', 'Phương án C / Ý c', 'Phương án D / Ý d', 'Đáp án đúng', 'Hướng dẫn giải', 'Yêu cầu cần đạt'],
    ['B1', 'Biết', 'MC', 'Câu hỏi trắc nghiệm MC 1?', 'PA A', 'PA B', 'PA C', 'PA D', 'B', 'Giải thích cho B', 'Mục tiêu 1'],
    ['B2', 'Vận dụng', 'YN', 'Ngữ cảnh chung Đúng Sai dài hơn 25 kí tự để đạt chuẩn?', 'Ý a', 'Ý b', 'Ý c', 'Ý d', 'Đ, S, Đ, S', 'Giải thích YN', 'Mục tiêu 2'],
    ['B2', 'Hiểu', 'SHORT', 'Câu hỏi ngắn?', '', '', '', '', 'Đáp án ngắn gọn', 'Giải thích SHORT', 'Mục tiêu 3'],
    ['B3', 'Vận dụng cao', 'ES', 'Đề bài tự luận?', '', '', '', '', '', 'Rubric tiêu chí chấm chi tiết', 'Mục tiêu 4']
  ];

  const questions = TableFileHelper.parseQuestionsFromRows(rows, 10, 'Tin học');
  assert.equal(questions.length, 4);

  // MC
  const qMc = questions[0];
  assert.equal(qMc.type, 'MC');
  assert.equal(qMc.correct, 1);
  assert.equal(qMc.lesson_code, 'B1');
  assert.equal(qMc.level, 'Biết');
  assert.equal(qMc.options.length, 4);
  assert.equal(qMc.learning_outcome, 'Mục tiêu 1');

  // YN
  const qYn = questions[1];
  assert.equal(qYn.type, 'YN');
  assert.equal(qYn.statements.length, 4);
  assert.equal(qYn.statements[0].correct, true);
  assert.equal(qYn.statements[1].correct, false);
  assert.equal(qYn.statements[2].correct, true);
  assert.equal(qYn.statements[3].correct, false);

  // SHORT
  const qShort = questions[2];
  assert.equal(qShort.type, 'SHORT');
  assert.equal(qShort.answer, 'Đáp án ngắn gọn');

  // ES
  const qEs = questions[3];
  assert.equal(qEs.type, 'ES');
  assert.equal(qEs.rubric.length, 1);
  assert.equal(qEs.rubric[0].points, 1.0);
});

test('TableFileHelper: parsePpctFromRows parses KHDH 7 columns correctly', () => {
  const rows = [
    ['Tuần', 'Tên bài học', 'Số tiết', 'Tiết PPCT', 'Yêu cầu cần đạt', 'Phát triển năng lực số & AI', 'Ghi chú'],
    ['Tuần 1', 'Bài 1: Thông tin số', '2', 'Tiết 1, 2', 'Hiểu về thông tin số\nĐánh giá độ tin cậy', 'NLS 1.1', 'Cốt lõi'],
    ['Tuần 2', 'Chuyên đề 1: Robot giáo dục', '3', 'Tiết 3, 4, 5', 'Lập trình điều khiển robot', 'NLS 3.2', 'Chuyên đề lựa chọn']
  ];

  const lessons = TableFileHelper.parsePpctFromRows(rows, 10, 'Tin học');
  assert.equal(lessons.length, 2);
  assert.equal(lessons[0].lesson_code, 'B1');
  assert.equal(lessons[0].section, 'core');
  assert.equal(lessons[0].duration, 2);
  assert.equal(lessons[0].outcomes.length, 2);

  assert.equal(lessons[1].lesson_code, 'CD1');
  assert.equal(lessons[1].section, 'elective_topic');
  assert.equal(lessons[1].duration, 3);
});

test('TableFileHelper: buildAiPromptByLesson produces detailed prompt with outcomes and constraints', () => {
  const prompt = TableFileHelper.buildAiPromptByLesson({
    grade: 10,
    subject: 'Tin học',
    lessonCode: 'B1',
    lessonName: 'Thông tin trong môi trường số',
    outcomes: ['Biết các dạng thông tin số', 'Phân tích được độ tin cậy của thông tin mạng'],
    part: 'MC',
    outputFormat: 'EXCEL',
    count: 4
  });

  assert.ok(prompt.includes('Thông tin trong môi trường số'));
  assert.ok(prompt.includes('Biết các dạng thông tin số'));
  assert.ok(prompt.includes('Phân tích được độ tin cậy của thông tin mạng'));
  assert.ok(prompt.includes('11 cột'));
  assert.ok(prompt.includes('B1'));
});

test('TableFileHelper: sample generators produce valid rows for Bank, PPCT and Matrix', () => {
  const bankRows = TableFileHelper.getSampleBankRows(10, 'Tin học');
  assert.ok(bankRows.length >= 5);
  assert.equal(bankRows[0][0], 'Mã bài');
  assert.equal(bankRows[0][3], 'Nội dung câu hỏi');

  const ppctRows = TableFileHelper.getSamplePpctRows(10, 'Tin học');
  assert.ok(ppctRows.length >= 3);
  assert.equal(ppctRows[0][1], 'Tên bài học');

  const matrixRows = TableFileHelper.getSampleMatrixRows(10, 'Tin học');
  assert.ok(matrixRows.length >= 6);
  assert.ok(TableFileHelper.toCsv(bankRows).startsWith('\ufeff'));
});
