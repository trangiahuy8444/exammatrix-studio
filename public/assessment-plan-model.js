/**
 * Assessment Plan Model & Helper (Phụ lục III Công văn 5512/BGDĐT-GDTrH)
 * Kế hoạch kiểm tra, đánh giá định kỳ và liên kết ma trận cho môn Tin học & các môn THCS/THPT.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BankAssessmentPlan = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PERIOD_NAMES = {
    GK1: 'Giữa học kì I',
    CK1: 'Cuối học kì I',
    GK2: 'Giữa học kì II',
    CK2: 'Cuối học kì II',
    TX: 'Thường xuyên'
  };

  const DEFAULT_PRESETS = {
    6: [
      {
        id: 'PLAN-K6-GK1',
        exam_type: 'GK1',
        semester: 1,
        name: 'Kiểm tra Đánh giá Giữa Học kỳ 1',
        duration: 45,
        week: 'Tuần 9',
        period: 'Tiết 9',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 2,
        scope_lessons: ['B1', 'B2', 'B3', 'B4'],
        scope_description: 'Chủ đề 1. Máy tính và cộng đồng (Bài 1 đến Bài 4)',
        notes: 'Đánh giá định kỳ hệ số 2 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K6-CK1',
        exam_type: 'CK1',
        semester: 1,
        name: 'Kiểm tra Đánh giá Cuối Học kỳ 1',
        duration: 45,
        week: 'Tuần 18',
        period: 'Tiết 18',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 3,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'],
        scope_description: 'Toàn bộ Học kỳ 1: Chủ đề 1, 2, 3 (Bài 1 đến Bài 9)',
        notes: 'Đánh giá định kỳ hệ số 3 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K6-GK2',
        exam_type: 'GK2',
        semester: 2,
        name: 'Kiểm tra Đánh giá Giữa Học kỳ 2',
        duration: 45,
        week: 'Tuần 27',
        period: 'Tiết 27',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 2,
        scope_lessons: ['B10', 'B11', 'B12', 'B13'],
        scope_description: 'Chủ đề 4. Ứng dụng tin học: Soạn thảo văn bản và sơ đồ tư duy (Bài 10 đến Bài 13)',
        notes: 'Đánh giá định kỳ hệ số 2 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K6-CK2',
        exam_type: 'CK2',
        semester: 2,
        name: 'Kiểm tra Đánh giá Cuối Học kỳ 2',
        duration: 45,
        week: 'Tuần 35',
        period: 'Tiết 35',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 3,
        scope_lessons: ['B10', 'B11', 'B12', 'B13', 'B14', 'B15', 'B16'],
        scope_description: 'Toàn bộ Học kỳ 2: Chủ đề 4, 5, 6 (Bài 10 đến Bài 16)',
        notes: 'Đánh giá định kỳ hệ số 3 theo TT 22/2021.'
      }
    ],
    7: [
      {
        id: 'PLAN-K7-GK1',
        exam_type: 'GK1',
        semester: 1,
        name: 'Kiểm tra Đánh giá Giữa Học kỳ 1',
        duration: 45,
        week: 'Tuần 9',
        period: 'Tiết 9',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 2,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5'],
        scope_description: 'Chủ đề 1, 2, 3: Thiết bị vào - ra, Phần mềm ứng dụng & Mạng xã hội',
        notes: 'Đánh giá định kỳ hệ số 2 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K7-CK1',
        exam_type: 'CK1',
        semester: 1,
        name: 'Kiểm tra Đánh giá Cuối Học kỳ 1',
        duration: 45,
        week: 'Tuần 18',
        period: 'Tiết 18',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 3,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'],
        scope_description: 'Toàn bộ Học kỳ 1: Bảng tính điện tử cơ bản và định dạng dữ liệu',
        notes: 'Đánh giá định kỳ hệ số 3 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K7-GK2',
        exam_type: 'GK2',
        semester: 2,
        name: 'Kiểm tra Đánh giá Giữa Học kỳ 2',
        duration: 45,
        week: 'Tuần 27',
        period: 'Tiết 27',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 2,
        scope_lessons: ['B11', 'B12', 'B13', 'B14'],
        scope_description: 'Chủ đề 4. Bảng tính nâng cao và biểu đồ trực quan',
        notes: 'Đánh giá định kỳ hệ số 2 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K7-CK2',
        exam_type: 'CK2',
        semester: 2,
        name: 'Kiểm tra Đánh giá Cuối Học kỳ 2',
        duration: 45,
        week: 'Tuần 35',
        period: 'Tiết 35',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 3,
        scope_lessons: ['B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17', 'B18'],
        scope_description: 'Toàn bộ Học kỳ 2: Phần mềm trình chiếu, Thuật toán tìm kiếm & sắp xếp',
        notes: 'Đánh giá định kỳ hệ số 3 theo TT 22/2021.'
      }
    ],
    8: [
      {
        id: 'PLAN-K8-GK1',
        exam_type: 'GK1',
        semester: 1,
        name: 'Kiểm tra Đánh giá Giữa Học kỳ 1',
        duration: 45,
        week: 'Tuần 9',
        period: 'Tiết 9',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 2,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'],
        scope_description: 'Chủ đề 1, 2, 3: Lịch sử máy tính, Thông tin số & Đạo đức môi trường số',
        notes: 'Đánh giá định kỳ hệ số 2 theo TT 22/2021. Khung ma trận 28 câu TNKQ + 3 câu TL.'
      },
      {
        id: 'PLAN-K8-CK1',
        exam_type: 'CK1',
        semester: 1,
        name: 'Kiểm tra Đánh giá Cuối Học kỳ 1',
        duration: 45,
        week: 'Tuần 18',
        period: 'Tiết 18',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 3,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8a', 'B8b', 'B9a', 'B9b', 'B10', 'B11a', 'B11b', 'B12', 'B13'],
        scope_description: 'Toàn bộ Học kỳ 1: Chủ đề 1, 2, 3 & Chủ đề 4 (Ứng dụng Tin học - Xử lý đồ họa & Bảng tính)',
        notes: 'Đánh giá định kỳ hệ số 3 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K8-GK2',
        exam_type: 'GK2',
        semester: 2,
        name: 'Kiểm tra Đánh giá Giữa Học kỳ 2',
        duration: 45,
        week: 'Tuần 27',
        period: 'Tiết 27',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 2,
        scope_lessons: ['B14', 'B15', 'B16'],
        scope_description: 'Chủ đề 5. Giải quyết vấn đề với sự trợ giúp của máy tính (Thuật toán và Lập trình trực quan Scratch)',
        notes: 'Đánh giá định kỳ hệ số 2 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K8-CK2',
        exam_type: 'CK2',
        semester: 2,
        name: 'Kiểm tra Đánh giá Cuối Học kỳ 2',
        duration: 45,
        week: 'Tuần 35',
        period: 'Tiết 35',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 3,
        scope_lessons: ['B14', 'B15', 'B16', 'B17', 'B18'],
        scope_description: 'Toàn bộ Học kỳ 2: Chủ đề 5 (Thuật toán và Lập trình) & Chủ đề 6 (Hướng nghiệp với Tin học)',
        notes: 'Đánh giá định kỳ hệ số 3 theo TT 22/2021.'
      }
    ],
    9: [
      {
        id: 'PLAN-K9-GK1',
        exam_type: 'GK1',
        semester: 1,
        name: 'Kiểm tra Đánh giá Giữa Học kỳ 1',
        duration: 45,
        week: 'Tuần 9',
        period: 'Tiết 9',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 2,
        scope_lessons: ['B1', 'B2', 'B3', 'B4'],
        scope_description: 'Chủ đề 1 & 2: Máy tính và cộng đồng, Mạng máy tính và dịch vụ Internet',
        notes: 'Đánh giá định kỳ hệ số 2 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K9-CK1',
        exam_type: 'CK1',
        semester: 1,
        name: 'Kiểm tra Đánh giá Cuối Học kỳ 1',
        duration: 45,
        week: 'Tuần 18',
        period: 'Tiết 18',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 3,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9a', 'B9b'],
        scope_description: 'Toàn bộ Học kỳ 1: Chủ đề 1, 2, 3 & 4 (Đạo đức môi trường số, Đa phương tiện & Xử lý đồ họa)',
        notes: 'Đánh giá định kỳ hệ số 3 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K9-GK2',
        exam_type: 'GK2',
        semester: 2,
        name: 'Kiểm tra Đánh giá Giữa Học kỳ 2',
        duration: 45,
        week: 'Tuần 27',
        period: 'Tiết 27',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 2,
        scope_lessons: ['B10', 'B11', 'B12', 'B13', 'B14'],
        scope_description: 'Chủ đề 5. Giải quyết vấn đề với sự trợ giúp của máy tính (Cấu trúc dữ liệu và giải thuật)',
        notes: 'Đánh giá định kỳ hệ số 2 theo TT 22/2021.'
      },
      {
        id: 'PLAN-K9-CK2',
        exam_type: 'CK2',
        semester: 2,
        name: 'Kiểm tra Đánh giá Cuối Học kỳ 2',
        duration: 45,
        week: 'Tuần 35',
        period: 'Tiết 35',
        form: 'Trắc nghiệm khách quan (70%) + Tự luận (30%)',
        coefficient: 3,
        scope_lessons: ['B10', 'B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17'],
        scope_description: 'Toàn bộ Học kỳ 2: Chủ đề 5 & Chủ đề 6 (Tin học và thế giới nghề nghiệp)',
        notes: 'Đánh giá định kỳ hệ số 3 theo TT 22/2021.'
      }
    ],
    10: [
      {
        id: 'PLAN-K10-GK1',
        exam_type: 'GK1',
        semester: 1,
        name: 'Kiểm tra Đánh giá Giữa Học kỳ 1',
        duration: 45,
        week: 'Tuần 9',
        period: 'Tiết 9',
        form: 'TNKQ nhiều lựa chọn (4.75đ) + TN Đúng/Sai (3.0đ) + Tự luận (2.25đ)',
        coefficient: 2,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'],
        scope_description: 'Chủ đề 1 & 2: Máy tính và xã hội tri thức, Mạng máy tính & Internet',
        notes: 'Định dạng khảo thí THPT mới theo CV 7991/BGDĐT-GDTrH.'
      },
      {
        id: 'PLAN-K10-CK1',
        exam_type: 'CK1',
        semester: 1,
        name: 'Kiểm tra Đánh giá Cuối Học kỳ 1',
        duration: 45,
        week: 'Tuần 18',
        period: 'Tiết 18',
        form: 'TNKQ nhiều lựa chọn (4.75đ) + TN Đúng/Sai (3.0đ) + Tự luận (2.25đ)',
        coefficient: 3,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17'],
        scope_description: 'Toàn bộ Học kỳ 1: Chủ đề 1, 2, 3, 4 (Đạo đức trong môi trường số, Lập trình Python cơ bản)',
        notes: 'Định dạng khảo thí THPT mới theo CV 7991/BGDĐT-GDTrH.'
      },
      {
        id: 'PLAN-K10-GK2',
        exam_type: 'GK2',
        semester: 2,
        name: 'Kiểm tra Đánh giá Giữa Học kỳ 2',
        duration: 45,
        week: 'Tuần 27',
        period: 'Tiết 27',
        form: 'TNKQ nhiều lựa chọn (4.75đ) + TN Đúng/Sai (3.0đ) + Tự luận (2.25đ)',
        coefficient: 2,
        scope_lessons: ['B18', 'B19', 'B20', 'B21', 'B22', 'B23', 'B24', 'B25'],
        scope_description: 'Lập trình Python nâng cao: Hàm, Thao tác Xâu ký tự, Danh sách (List)',
        notes: 'Định dạng khảo thí THPT mới theo CV 7991/BGDĐT-GDTrH.'
      },
      {
        id: 'PLAN-K10-CK2',
        exam_type: 'CK2',
        semester: 2,
        name: 'Kiểm tra Đánh giá Cuối Học kỳ 2',
        duration: 45,
        week: 'Tuần 35',
        period: 'Tiết 35',
        form: 'TNKQ nhiều lựa chọn (4.75đ) + TN Đúng/Sai (3.0đ) + Tự luận (2.25đ)',
        coefficient: 3,
        scope_lessons: ['B18', 'B19', 'B20', 'B21', 'B22', 'B23', 'B24', 'B25', 'B26', 'B27', 'B28', 'B29', 'B30', 'B31', 'B32', 'B33', 'B34'],
        scope_description: 'Toàn bộ Học kỳ 2: Thuật toán tìm kiếm, sắp xếp & Nghề nghiệp Tin học',
        notes: 'Định dạng khảo thí THPT mới theo CV 7991/BGDĐT-GDTrH.'
      }
    ],
    11: [
      {
        id: 'PLAN-K11-GK1', exam_type: 'GK1', semester: 1, name: 'Kiểm tra Đánh giá Giữa Học kỳ 1', duration: 45, week: 'Tuần 9', period: 'Tiết 9',
        form: 'TNKQ nhiều lựa chọn + TN Đúng/Sai + Tự luận', coefficient: 2,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5'],
        scope_description: 'Chủ đề 1 & 2: Hệ điều hành, Phần cứng & Mạng máy tính', notes: 'TT 22/2021 & CV 7991.'
      },
      {
        id: 'PLAN-K11-CK1', exam_type: 'CK1', semester: 1, name: 'Kiểm tra Đánh giá Cuối Học kỳ 1', duration: 45, week: 'Tuần 18', period: 'Tiết 18',
        form: 'TNKQ nhiều lựa chọn + TN Đúng/Sai + Tự luận', coefficient: 3,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'],
        scope_description: 'Toàn bộ Học kỳ 1: Cơ sở dữ liệu và hệ quản trị CSDL', notes: 'TT 22/2021 & CV 7991.'
      },
      {
        id: 'PLAN-K11-GK2', exam_type: 'GK2', semester: 2, name: 'Kiểm tra Đánh giá Giữa Học kỳ 2', duration: 45, week: 'Tuần 27', period: 'Tiết 27',
        form: 'TNKQ nhiều lựa chọn + TN Đúng/Sai + Tự luận', coefficient: 2,
        scope_lessons: ['B11', 'B12', 'B13', 'B14', 'B15'],
        scope_description: 'Chủ đề 4. Hệ CSDL quan hệ và truy vấn SQL', notes: 'TT 22/2021 & CV 7991.'
      },
      {
        id: 'PLAN-K11-CK2', exam_type: 'CK2', semester: 2, name: 'Kiểm tra Đánh giá Cuối Học kỳ 2', duration: 45, week: 'Tuần 35', period: 'Tiết 35',
        form: 'TNKQ nhiều lựa chọn + TN Đúng/Sai + Tự luận', coefficient: 3,
        scope_lessons: ['B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17', 'B18'],
        scope_description: 'Toàn bộ Học kỳ 2: Thực hành CSDL & Nghề nghiệp', notes: 'TT 22/2021 & CV 7991.'
      }
    ],
    12: [
      {
        id: 'PLAN-K12-GK1', exam_type: 'GK1', semester: 1, name: 'Kiểm tra Đánh giá Giữa Học kỳ 1', duration: 45, week: 'Tuần 9', period: 'Tiết 9',
        form: 'TNKQ nhiều lựa chọn + TN Đúng/Sai + Tự luận', coefficient: 2,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5'],
        scope_description: 'Trí tuệ nhân tạo (AI), Mạng máy tính & Dịch vụ Internet', notes: 'TT 22/2021 & CV 7991.'
      },
      {
        id: 'PLAN-K12-CK1', exam_type: 'CK1', semester: 1, name: 'Kiểm tra Đánh giá Cuối Học kỳ 1', duration: 45, week: 'Tuần 18', period: 'Tiết 18',
        form: 'TNKQ nhiều lựa chọn + TN Đúng/Sai + Tự luận', coefficient: 3,
        scope_lessons: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'],
        scope_description: 'Toàn bộ Học kỳ 1: Thiết kế trang web với HTML/CSS & Tạo lập website', notes: 'TT 22/2021 & CV 7991.'
      },
      {
        id: 'PLAN-K12-GK2', exam_type: 'GK2', semester: 2, name: 'Kiểm tra Đánh giá Giữa Học kỳ 2', duration: 45, week: 'Tuần 27', period: 'Tiết 27',
        form: 'TNKQ nhiều lựa chọn + TN Đúng/Sai + Tự luận', coefficient: 2,
        scope_lessons: ['B11', 'B12', 'B13', 'B14', 'B15'],
        scope_description: 'Chủ đề định hướng nghề nghiệp (ICT / CS)', notes: 'TT 22/2021 & CV 7991.'
      },
      {
        id: 'PLAN-K12-CK2', exam_type: 'CK2', semester: 2, name: 'Kiểm tra Đánh giá Cuối Học kỳ 2', duration: 45, week: 'Tuần 35', period: 'Tiết 35',
        form: 'TNKQ nhiều lựa chọn + TN Đúng/Sai + Tự luận', coefficient: 3,
        scope_lessons: ['B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17'],
        scope_description: 'Toàn bộ Học kỳ 2: Thực hành dự án & Hướng nghiệp số', notes: 'TT 22/2021 & CV 7991.'
      }
    ]
  };

  function buildDefaultAssessmentPlans(grade, subject = 'Tin học') {
    const g = Number(grade) || 8;
    const baseList = DEFAULT_PRESETS[g] || DEFAULT_PRESETS[8];
    const nowYear = '2026-2027';
    return baseList.map(item => ({
      ...item,
      id: `PLAN-K${g}-${item.exam_type}`,
      grade: g,
      subject_name: subject,
      school_year: nowYear,
      scope_lessons: Array.isArray(item.scope_lessons) ? [...item.scope_lessons] : []
    }));
  }

  function normalizePlan(raw, defaultGrade = 8, defaultSubject = 'Tin học') {
    if (!raw || typeof raw !== 'object') return null;
    const g = Number(raw.grade) || Number(defaultGrade) || 8;
    const subj = String(raw.subject_name || defaultSubject || 'Tin học').trim();
    const rawPeriodType = String(raw.period || '').toUpperCase().trim();
    const fallbackType = ['GK1', 'CK1', 'GK2', 'CK2', 'TX'].includes(rawPeriodType) ? rawPeriodType : '';
    const type = String(raw.exam_type || fallbackType || 'GK1').toUpperCase().trim();
    const randSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const id = String(raw.id || `PLAN-K${g}-${type}-${randSuffix}`).trim();
    const name = String(raw.name || raw.title || PERIOD_NAMES[type] || 'Kiểm tra Đánh giá').trim();
    const duration = Number(raw.duration) || 45;
    const week = String(raw.week || raw.time_week || 'Tuần 9').trim();
    const period = String(raw.period || raw.ppct_period || '').trim();
    const form = String(raw.form || raw.method || (g >= 10 ? 'TNKQ + Đúng/Sai + Tự luận' : 'Trắc nghiệm (70%) + Tự luận (30%)')).trim();
    const coefficient = Number(raw.coefficient) || (['CK1', 'CK2'].includes(type) ? 3 : 2);
    
    // Parse scope lessons
    let scope_lessons = [];
    if (Array.isArray(raw.scope_lessons)) {
      scope_lessons = raw.scope_lessons.map(x => String(x || '').trim()).filter(Boolean);
    } else if (typeof raw.scope_lessons === 'string') {
      scope_lessons = raw.scope_lessons.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    } else if (typeof raw.lessons === 'string') {
      scope_lessons = raw.lessons.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    }

    const scope_description = String(raw.scope_description || raw.scope || '').trim();
    const notes = String(raw.notes || raw.note || '').trim();
    const semester = Number(raw.semester) || (['GK2', 'CK2'].includes(type) ? 2 : 1);

    return {
      id,
      grade: g,
      subject_name: subj,
      school_year: String(raw.school_year || '2026-2027').trim(),
      semester,
      exam_type: type,
      name,
      duration,
      week,
      period,
      form,
      coefficient,
      scope_lessons,
      scope_description,
      notes
    };
  }

  const stripAccents = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[\s\p{P}]+/gu, ' ').trim();

  function parseAssessmentPlansFromRows(rows, defaultGrade = 8, defaultSubject = 'Tin học') {
    if (!Array.isArray(rows) || !rows.length) return [];
    const normH = h => stripAccents(h);
    
    // Tìm hàng tiêu đề
    let headerIdx = -1;
    let colMap = {};
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const joined = row.map(normH).join(' ');
      if (joined.includes('kiem tra') || joined.includes('danh gia') || joined.includes('thoi gian') || joined.includes('thoi diem')) {
        headerIdx = i;
        row.forEach((col, cIdx) => {
          const c = normH(col);
          if (!c || c === 'stt' || c === 'tt') return;
          if (c.includes('ten') || c.includes('bai kiem tra') || c.includes('bai danh gia') || c === 'noi dung') colMap.name = cIdx;
          else if (c.includes('loai') || c.includes('ky kiem tra') || c.includes('ki kiem tra') || c.includes('dot')) colMap.exam_type = cIdx;
          else if (c.includes('thoi gian') || c.includes('thoi luong') || c.includes('phut')) colMap.duration = cIdx;
          else if (c.includes('thoi diem') || c.includes('tuan')) colMap.week = cIdx;
          else if (c.includes('tiet') || c.includes('ppct')) colMap.period = cIdx;
          else if (c.includes('hinh thuc')) colMap.form = cIdx;
          else if (c.includes('pham vi') || c.includes('bai hoc')) colMap.scope = cIdx;
          else if (c.includes('yeu cau can dat') || c.includes('yccd')) colMap.scope_description = cIdx;
          else if (c.includes('he so')) colMap.coefficient = cIdx;
          else if (c.includes('khoi')) colMap.grade = cIdx;
          else if (c.includes('ghi chu')) colMap.notes = cIdx;
        });
        break;
      }
    }

    const dataRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows;
    const plans = [];

    dataRows.forEach((row, idx) => {
      if (!Array.isArray(row) || row.every(x => x == null || String(x).trim() === '')) return;
      if (row.every(x => /^[:\s-]*$/.test(String(x ?? '')))) return;
      const getVal = key => (colMap[key] !== undefined && row[colMap[key]] != null) ? String(row[colMap[key]]).trim() : '';

      let name = getVal('name');
      if (!name) {
        const c0 = row[0] != null ? String(row[0]).trim() : '';
        if (/^\d+$/.test(c0) && row[1]) name = String(row[1]).trim();
        else if (c0 && !/^[:\s-]+$/.test(c0)) name = c0;
      }
      if (!name) return;

      let examType = getVal('exam_type').toUpperCase();
      if (!examType) {
        const nNorm = normH(name);
        if (nNorm.includes('giua hoc ki 1') || nNorm.includes('giua hoc ky 1') || nNorm.includes('giua ki 1') || nNorm.includes('giua ky 1') || nNorm.includes('gk1')) examType = 'GK1';
        else if (nNorm.includes('cuoi hoc ki 1') || nNorm.includes('cuoi hoc ky 1') || nNorm.includes('cuoi ki 1') || nNorm.includes('cuoi ky 1') || nNorm.includes('ck1')) examType = 'CK1';
        else if (nNorm.includes('giua hoc ki 2') || nNorm.includes('giua hoc ky 2') || nNorm.includes('giua ki 2') || nNorm.includes('giua ky 2') || nNorm.includes('gk2')) examType = 'GK2';
        else if (nNorm.includes('cuoi hoc ki 2') || nNorm.includes('cuoi hoc ky 2') || nNorm.includes('cuoi ki 2') || nNorm.includes('cuoi ky 2') || nNorm.includes('ck2')) examType = 'CK2';
        else if (nNorm.includes('thuong xuyen') || nNorm.includes('kttx')) examType = 'TX';
        else examType = idx === 0 ? 'GK1' : (idx === 1 ? 'CK1' : (idx === 2 ? 'GK2' : 'CK2'));
      }

      let dur = parseInt(getVal('duration') || (row[1] ? String(row[1]) : ''), 10);
      if (isNaN(dur) || dur <= 0) dur = 45;

      const week = getVal('week') || (row[2] ? String(row[2]).trim() : `Tuần ${examType === 'GK1' ? 9 : (examType === 'CK1' ? 18 : (examType === 'GK2' ? 27 : 35))}`);
      const period = getVal('period') || '';
      const form = getVal('form') || '';
      const scopeRaw = getVal('scope') || (colMap.scope === undefined && row[5] ? String(row[5]).trim() : '');
      const scopeDescRaw = getVal('scope_description') || scopeRaw;
      const coefRaw = getVal('coefficient');
      const parsedCoef = coefRaw ? parseFloat(coefRaw.replace(',', '.')) : NaN;
      const notes = getVal('notes') || '';
      const rowGrade = parseInt(getVal('grade'), 10) || defaultGrade;

      const parsed = normalizePlan({
        name,
        exam_type: examType,
        duration: dur,
        week,
        period,
        form,
        coefficient: Number.isFinite(parsedCoef) && parsedCoef > 0 ? parsedCoef : undefined,
        scope_lessons: scopeRaw,
        scope_description: scopeDescRaw,
        notes,
        grade: rowGrade,
        subject_name: defaultSubject
      }, defaultGrade, defaultSubject);

      if (parsed) plans.push(parsed);
    });

    return plans.length ? plans : buildDefaultAssessmentPlans(defaultGrade, defaultSubject);
  }

  function linkMatrixToAssessmentPlan(matrix, plan) {
    if (!matrix || !plan) return matrix;
    matrix.assessment_plan_id = plan.id;
    matrix.assessment_plan = {
      id: plan.id,
      name: plan.name,
      week: plan.week,
      period: plan.period,
      duration: plan.duration,
      form: plan.form,
      coefficient: plan.coefficient,
      scope_lessons: Array.isArray(plan.scope_lessons) ? [...plan.scope_lessons] : []
    };
    if (plan.exam_type && ['GK1', 'CK1', 'GK2', 'CK2', 'TX'].includes(plan.exam_type)) {
      matrix.exam_type = plan.exam_type;
    }
    if (plan.duration && Number.isFinite(plan.duration) && plan.duration > 0) {
      matrix.duration = plan.duration;
    }
    return matrix;
  }

  function syncLessonsFromAssessmentPlan(matrix, plan, ppctLessons = []) {
    if (!matrix || !plan || !Array.isArray(plan.scope_lessons)) return matrix;
    matrix.lessons = Array.isArray(matrix.lessons) ? matrix.lessons : [];
    const existingCodes = new Set(matrix.lessons.map(l => l.lesson_code));
    
    plan.scope_lessons.forEach(code => {
      if (existingCodes.has(code)) return;
      const match = ppctLessons.find(l => l.lesson_code === code);
      matrix.lessons.push({
        lesson_code: code,
        title: match ? (match.lesson_name_source || match.lesson_name || match.title || code) : code,
        topic: match ? (match.topic_source || match.topic || '') : ''
      });
      existingCodes.add(code);
    });
    return matrix;
  }

  return {
    PERIOD_NAMES,
    DEFAULT_PRESETS,
    buildDefaultAssessmentPlans,
    normalizePlan,
    parseAssessmentPlansFromRows,
    linkMatrixToAssessmentPlan,
    syncLessonsFromAssessmentPlan
  };
});
