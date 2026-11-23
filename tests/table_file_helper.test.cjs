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
  assert.equal(bankRows[0][11], 'Năng lực');
  assert.ok(bankRows.slice(1).every(r => r.length === 12 && /^NL[a-e]$/.test(r[11])));

  const parsedSampleQs = TableFileHelper.parseQuestionsFromRows(bankRows, 10, 'Tin học');
  assert.ok(parsedSampleQs.length >= 4);
  assert.ok(parsedSampleQs.every(q => q.learning_outcome && q.competency));

  const ppctRows = TableFileHelper.getSamplePpctRows(10, 'Tin học');
  assert.ok(ppctRows.length >= 3);
  assert.equal(ppctRows[0][1], 'Tên bài học');

  const matrixRows = TableFileHelper.getSampleMatrixRows(10, 'Tin học');
  assert.ok(matrixRows.length >= 6);
  assert.ok(TableFileHelper.toCsv(bankRows).startsWith('\ufeff'));
});

test('TableFileHelper: THCS samples exclude YN (True/False) and match grade requirements', () => {
  [6, 7, 8, 9].forEach(g => {
    const rows = TableFileHelper.getSampleBankRows(g, 'Tin học');
    assert.equal(rows[0][4], 'Phương án A'); // Không có '/ Ý a'
    assert.equal(rows[0][11], 'Năng lực');
    assert.ok(rows.slice(1).every(r => r.length === 12 && /^NL[a-e]$/.test(r[11])));
    const types = rows.slice(1).map(r => r[2]);
    assert.ok(types.includes('MC'));
    assert.ok(types.includes('ES'));
    assert.ok(!types.includes('YN'), `Khối ${g} THCS không được có dạng Đúng/Sai (YN)`);
    assert.ok(!types.includes('SHORT'), `Khối ${g} THCS không được có dạng Trả lời ngắn (SHORT)`);

    const parsed = TableFileHelper.parseQuestionsFromRows(rows, g, 'Tin học');
    assert.ok(parsed.every(q => q.learning_outcome && q.competency));
  });

  const matrixRows9 = TableFileHelper.getSampleMatrixRows(9, 'Tin học');
  const mHeaders = matrixRows9[1];
  assert.ok(!mHeaders.includes('DS_Biet'), 'Ma trận THCS không có cột DS_Biet');
  assert.ok(!mHeaders.includes('DS_Hieu'), 'Ma trận THCS không có cột DS_Hieu');
  assert.ok(!mHeaders.includes('DS_VD'), 'Ma trận THCS không có cột DS_VD');
  assert.ok(mHeaders.includes('TN_Biet'));
  assert.ok(mHeaders.includes('TL_VD'));

  const specRows = matrixRows9.slice(6);
  const specTypes = specRows.slice(1).map(r => r[2]);
  assert.ok(!specTypes.includes('YN'), 'Bản đặc tả THCS không có dạng YN');
});

test('TableFileHelper: THPT samples contain all 4 question types (MC, YN, SHORT, ES)', () => {
  [10, 11, 12].forEach(g => {
    const rows = TableFileHelper.getSampleBankRows(g, 'Tin học');
    const types = rows.slice(1).map(r => r[2]);
    assert.ok(types.includes('MC'));
    assert.ok(types.includes('YN'));
    assert.ok(types.includes('SHORT'));
    assert.ok(types.includes('ES'));
  });

  const matrixRows10 = TableFileHelper.getSampleMatrixRows(10, 'Tin học');
  const mHeaders = matrixRows10[1];
  assert.ok(mHeaders.includes('DS_Biet'));
  assert.ok(mHeaders.includes('DS_Hieu'));
  assert.ok(mHeaders.includes('DS_VD'));
});

test('TableFileHelper: buildAiPromptByLesson handles THCS vs THPT constraints properly', () => {
  // THCS tự động chuyển YN thành MC và kèm cảnh báo nghiêm ngặt
  const promptThcs = TableFileHelper.buildAiPromptByLesson({
    grade: 8,
    subject: 'Tin học',
    lessonCode: 'B2',
    lessonName: 'Xử lí dữ liệu',
    outcomes: ['Sử dụng hàm SUM, AVERAGE'],
    part: 'YN', // Người dùng chọn YN cho THCS
    outputFormat: 'EXCEL'
  });
  assert.ok(promptThcs.includes('THCS'));
  assert.ok(promptThcs.includes('TUYỆT ĐỐI KHÔNG SỬ DỤNG dạng câu hỏi trắc nghiệm Đúng/Sai (YN)'));
  assert.ok(promptThcs.includes('MC - 4 phương án'));

  // THCS chọn ALL
  const promptThcsAll = TableFileHelper.buildAiPromptByLesson({
    grade: 9,
    subject: 'Tin học',
    lessonCode: 'B3',
    lessonName: 'Lưu trữ đám mây',
    outcomes: ['Phân quyền tệp'],
    part: 'ALL',
    outputFormat: 'EXCEL'
  });
  assert.ok(promptThcsAll.includes('trọn gói bộ câu hỏi chuẩn THCS'));
  assert.ok(promptThcsAll.includes('Cấp THCS tuyệt đối KHÔNG sinh câu hỏi Đúng/Sai YN'));

  // THPT chọn YN chuẩn CV 7991
  const promptThptYn = TableFileHelper.buildAiPromptByLesson({
    grade: 10,
    subject: 'Tin học',
    lessonCode: 'B1',
    lessonName: 'Thông tin số',
    outcomes: ['Xử lí thông tin'],
    part: 'YN',
    outputFormat: 'EXCEL'
  });
  assert.ok(promptThptYn.includes('Công văn 7991'));
  assert.ok(promptThptYn.includes('4 lệnh hỏi / phát biểu a), b), c), d)'));
  assert.ok(promptThptYn.includes('Đ, S, Đ, S'));
});

test('TableFileHelper: giữ mã bài chữ thường và tách hướng chấm tự luận thành 4 tiêu chí', () => {
  const rows = [
    ['Mã bài', 'Mức độ', 'Dạng câu', 'Nội dung câu hỏi', 'Phương án A / Ý a', 'Phương án B / Ý b', 'Phương án C / Ý c', 'Phương án D / Ý d', 'Đáp án đúng', 'Hướng dẫn giải', 'Yêu cầu cần đạt'],
    ['B8a', 'Vận dụng', 'ES', 'Đề tự luận 2 ý?\na) Ý một.\nb) Ý hai.', '', '', '', '', '',
     'a) Viết đúng công thức (0,25 điểm); tính đúng kết quả (0,25 điểm).\nb) Nêu đúng cách (0,25 điểm); giải thích được (0,25 điểm).', 'Mục tiêu'],
    ['B10a', 'Biết', 'MC', 'Câu MC?', 'A1', 'B1', 'C1', 'D1', 'C', 'Đáp án C.', 'Mục tiêu']
  ];
  const [es, mc] = TableFileHelper.parseQuestionsFromRows(rows, 8, 'Tin học');
  assert.equal(es.lesson_code, 'B8a');
  assert.equal(mc.lesson_code, 'B10a');
  assert.equal(es.rubric.length, 4);
  assert.deepEqual(es.rubric.map(x => x.points), [0.25, 0.25, 0.25, 0.25]);
  assert.equal(es.rubric[1].criterion, 'a) tính đúng kết quả (0,25 điểm)');
  assert.equal(es.rubric[2].criterion, 'b) Nêu đúng cách (0,25 điểm)');
  assert.ok(es.equivalent_answer_policy);
  assert.deepEqual(TableFileHelper.parseRubricText('Hướng chấm tự do'), []);
  assert.deepEqual(TableFileHelper.parseRubricText('A (0,5 điểm). B (0,25 điểm).'), []);
});

test('TableFileHelper: classifyQuestionsForImport phân loại chính xác câu mới, trùng ngân hàng và trùng nội bộ', () => {
  const existingQuestions = [
    { id: 'OLD-01', grade: 9, lesson_code: 'B1', question: 'Câu hỏi đã có trong ngân hàng đề?', learning_outcome: 'YCCĐ cũ' },
    { id: 'OLD-02', grade: 8, lesson_code: 'B2', question: 'Câu của khối 8?', learning_outcome: 'YCCĐ K8' }
  ];

  const incomingQuestions = [
    { grade: 9, question: 'Câu hỏi hoàn toàn mới 1?', lesson_code: 'B1', type: 'MC' },
    { grade: 9, question: '  câu hỏi ĐÃ CÓ trong ngân hàng đề?  ', lesson_code: 'B1', type: 'MC' }, // Trùng ngân hàng (khác hoa thường và khoảng trắng)
    { grade: 9, question: 'Câu hỏi trùng lặp nội bộ trong file?', lesson_code: 'B3', type: 'MC' },
    { grade: 9, question: 'Câu hỏi trùng lặp nội bộ trong file?', lesson_code: 'B3', type: 'MC' }, // Trùng nội bộ
    { grade: 9, question: 'Câu hỏi của khối 9 giống chữ khối 8 nhưng khác khối: Câu của khối 8?', lesson_code: 'B2', type: 'MC' }
  ];

  const res = TableFileHelper.classifyQuestionsForImport(incomingQuestions, existingQuestions, 9);

  assert.equal(res.counts.total, 5);
  assert.equal(res.counts.new, 3);
  assert.equal(res.counts.bank_dup, 1);
  assert.equal(res.counts.internal_dup, 1);

  // Câu 1: mới
  assert.equal(res.items[0].status, 'new');
  // Câu 2: trùng ngân hàng
  assert.equal(res.items[1].status, 'bank_dup');
  assert.equal(res.items[1].matchedId, 'OLD-01');
  assert.equal(res.items[1].matchedLesson, 'B1');
  // Câu 3: mới (xuất hiện lần đầu)
  assert.equal(res.items[2].status, 'new');
  // Câu 4: trùng nội bộ với câu 3 (index 2)
  assert.equal(res.items[3].status, 'internal_dup');
  assert.equal(res.items[3].firstIndex, 2);
  // Câu 5: mới
  assert.equal(res.items[4].status, 'new');

  // Danh sách câu mới hợp lệ loại bỏ cả trùng ngân hàng và trùng nội bộ
  assert.equal(res.validNewQuestions.length, 3);
  assert.equal(res.validNewQuestions[0].question, 'Câu hỏi hoàn toàn mới 1?');
  assert.equal(res.validNewQuestions[1].question, 'Câu hỏi trùng lặp nội bộ trong file?');
});

test('TableFileHelper: detectGradeFromFilename & parseQuestionsFromRows with Grade column', () => {
  // Test detectGradeFromFilename
  assert.equal(TableFileHelper.detectGradeFromFilename('Mau_Cau_hoi_Excel_Tin_hoc_8.xlsx'), 8);
  assert.equal(TableFileHelper.detectGradeFromFilename('Mau_Cau_hoi_Excel_Tin_hoc_9_2026.xlsx'), 9);
  assert.equal(TableFileHelper.detectGradeFromFilename('Ngan_hang_K8.csv'), 8);
  assert.equal(TableFileHelper.detectGradeFromFilename('De_cuong_Lop_9.xlsx'), 9);
  assert.equal(TableFileHelper.detectGradeFromFilename('Tin_hoc_10_chuyen_de.csv'), 10);
  assert.equal(TableFileHelper.detectGradeFromFilename('Tin_11.xlsx'), 11);
  assert.equal(TableFileHelper.detectGradeFromFilename('Tin_12_de_kiem_tra.csv'), 12);
  assert.equal(TableFileHelper.detectGradeFromFilename('ngan_hang_tong_hop.xlsx'), null);

  // Test parseQuestionsFromRows with Grade column overriding defaultGrade
  const rowsWithGradeCol = [
    ['Khối', 'Mã bài', 'Mức độ', 'Dạng câu', 'Nội dung câu hỏi', 'Phương án A', 'Phương án B', 'Phương án C', 'Phương án D', 'Đáp án đúng', 'Hướng dẫn giải / Tiêu chí chấm', 'Yêu cầu cần đạt'],
    [8, 'B1', 'Biết', 'Trắc nghiệm 4 lựa chọn (MC)', 'Câu hỏi khối 8?', 'A', 'B', 'C', 'D', 'A', 'Giải thích', 'YCCĐ 1'],
    ['Khối 9', 'B2', 'Hiểu', 'Trắc nghiệm 4 lựa chọn (MC)', 'Câu hỏi khối 9?', 'A', 'B', 'C', 'D', 'B', 'Giải thích', 'YCCĐ 2']
  ];

  // Pass defaultGrade = 7, but rows have Grade 8 and Grade 9
  const parsed = TableFileHelper.parseQuestionsFromRows(rowsWithGradeCol, 7, 'Tin học');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].grade, 8);
  assert.equal(parsed[0]._hasExplicitRowGrade, true);
  assert.equal(parsed[1].grade, 9);
  assert.equal(parsed[1]._hasExplicitRowGrade, true);
});
