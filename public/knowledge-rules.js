/*
 * Kho luật kiểm tra đánh giá + bộ máy suy diễn tiến + phần giải thích (Giai đoạn 2,
 * docs/KE_HOACH_DO_THI_TRI_THUC.md). Thuần, không I/O, UMD.
 *
 * - Sự kiện (fact) là bộ ba [chủ thể, vị từ, đối tượng].
 * - Luật là DỮ LIỆU: `neu` (các mẫu bộ ba có biến ?x, mẫu phủ định {khong:[...]}, phép thử {thu:..}),
 *   `thi` (thêm sự kiện suy ra) hoặc `vi_pham` (lỗi chặn / cảnh báo, câu giải thích có {?biến}).
 * - Mỗi luật ghi `can_cu`: văn bản, điều, khoản đã đối chiếu bản gốc (bản OCR trong
 *   01_Van_ban_phap_ly_va_Quy_dinh/_Ban_OCR_tim_kiem/) hoặc quy tắc trường/quyết định giáo viên.
 *
 * Giai đoạn chuyển đổi: kho luật chạy SONG SONG với static-exam-engine.verifyExam; mã cũ vẫn là
 * căn cứ chặn duyệt. Chỉ gỡ mã cũ khi kết quả hai bên khớp (tests/static_knowledge_rules.test.cjs).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BankKnowledgeRules = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const list = x => (Array.isArray(x) ? x : []);
  const text = x => (typeof x === 'string' ? x.trim() : '');
  const norm = x => String(x || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const isVar = x => typeof x === 'string' && x.startsWith('?');
  // Nền móng tri thức dùng chung (core.js): một định nghĩa câu trùng, mã YCCĐ cố định.
  const core = (typeof module === 'object' && module.exports && typeof require === 'function') ? require('./core.js') : (typeof window !== 'undefined' ? window.BankCore : globalThis.BankCore);

  const CAN_CU = {
    THANG_DIEM_10: 'TT 22/2021/TT-BGDĐT, Điều 5, khoản 3, điểm b (đánh giá bằng điểm số theo thang điểm 10)',
    MA_TRAN_YCCD: 'TT 22/2021/TT-BGDĐT, Điều 7, khoản 1 (đề kiểm tra định kì xây dựng dựa trên ma trận, đặc tả, đáp ứng yêu cầu cần đạt)',
    THOI_GIAN: 'TT 22/2021/TT-BGDĐT, Điều 7, khoản 1 (môn có từ 70 tiết/năm học trở xuống: 45 phút)',
    DANG_CAU_THPT: 'CV 7991/BGDĐT-GDTrH, Phụ lục (THPT: nhiều lựa chọn, Đúng – Sai, trả lời ngắn, tự luận)',
    DANG_CAU_THCS: 'Quy ước của tổ: THCS dùng nhiều lựa chọn và tự luận (docs/BOI_CANH.md; danh sách dạng câu THCS còn chờ tổ xác nhận)',
    DE_CUONG_90: 'Quy tắc trường rules/01_phan_cong_va_bien_soan_de.md (90% đề lấy từ hoặc bám sát đề cương ôn tập)',
    TI_LE_DANG: 'Quyết định giáo viên 25/11/2026: tỉ lệ đề cương theo từng dạng',
    PHU_YCCD: 'Quyết định giáo viên 26/10/2026 (docs/BOI_CANH.md mục 4): tiêu chí đề cương phủ YCCĐ 100%',
    CAU_DA_DUYET: 'Quyết định giáo viên 26/10/2026 (docs/BOI_CANH.md mục 4): đề chính thức chỉ dùng câu đã duyệt',
    KHONG_TRUNG: 'Bất biến nghiệp vụ (docs/THIET_KE.md): đề không có câu trùng',
    PHAM_VI_TUAN: 'PPCT của giáo viên (CV 5512/BGDĐT-GDTrH, Phụ lục 1): chỉ kiểm tra nội dung đã học tới thời điểm kiểm tra',
    KY_THUAT: 'Bất biến nghiệp vụ (docs/THIET_KE.md): câu đủ phương án, đáp án, hướng dẫn chấm và có điểm dương',
    BAN_CHUP: 'Bất biến nghiệp vụ (docs/THIET_KE.md): đề gắn với bản chụp câu hỏi, ma trận, đề cương, PPCT lúc tạo; không sửa ngầm sau đó',
    CAN_MA_TRAN: 'Quy ước ứng dụng (docs/THIET_KE.md): đề duyệt và phát hành phải theo ma trận đã khóa; phân bố tự thiết lập chỉ dùng bản nháp',
    HO_SO: 'Quy ước hồ sơ của ứng dụng: đề có tên, số câu khai báo khớp số câu thực có'
  };

  // ------------------------------------------------------------------------------------------
  // KHO LUẬT
  // ------------------------------------------------------------------------------------------
  const RULES = [
    // --- Luật suy ra (thêm sự kiện) ---
    { id: 'D-CAP-THCS', mo_ta: 'Khối 6–9 thuộc cấp THCS',
      neu: [['?d', 'khoi', '?k'], { thu: 'lt', a: '?k', b: 10 }], thi: [['?d', 'cap_hoc', 'THCS']] },
    { id: 'D-CAP-THPT', mo_ta: 'Khối 10–12 thuộc cấp THPT',
      neu: [['?d', 'khoi', '?k'], { thu: 'ge', a: '?k', b: 10 }], thi: [['?d', 'cap_hoc', 'THPT']] },
    { id: 'D-DANG-THCS', mo_ta: 'Đề THCS không khai dạng câu riêng: dùng nhiều lựa chọn, tự luận',
      neu: [['?d', 'cap_hoc', 'THCS'], ['?d', 'khai_dang_rieng', false]],
      thi: [['?d', 'cho_phep_dang', 'MC'], ['?d', 'cho_phep_dang', 'ES']], can_cu: CAN_CU.DANG_CAU_THCS },
    { id: 'D-DANG-THPT', mo_ta: 'Đề THPT không khai dạng câu riêng: dùng đủ 4 dạng',
      neu: [['?d', 'cap_hoc', 'THPT'], ['?d', 'khai_dang_rieng', false]],
      thi: [['?d', 'cho_phep_dang', 'MC'], ['?d', 'cho_phep_dang', 'YN'], ['?d', 'cho_phep_dang', 'SHORT'], ['?d', 'cho_phep_dang', 'ES']],
      can_cu: CAN_CU.DANG_CAU_THPT },
    { id: 'D-DINH-KI', mo_ta: 'Giữa kì, cuối kì là đánh giá định kì',
      neu: [['?d', 'loai_kiem_tra', '?t'], { thu: 'in', a: '?t', b: ['GK1', 'CK1', 'GK2', 'CK2'] }], thi: [['?d', 'la', 'dinh_ki']] },

    // --- Luật vi phạm (chặn) ---
    { id: 'R-TONG-10', muc: 'chan', ma_cu: 'points', can_cu: CAN_CU.THANG_DIEM_10,
      cach_sua: { hanh_dong: 'mo_de_kiem_tra', nhan: 'Mở đề để chỉnh điểm', mo_ta: 'Điều chỉnh điểm từng câu hoặc tạo lại đề từ ma trận đủ 10 điểm.' },
      neu: [['?d', 'la', 'de'], ['?d', 'tong_diem', '?t'], { thu: 'ne_num', a: '?t', b: 10 }],
      vi_pham: 'Tổng điểm của đề là {?t}, phải đúng 10 điểm.' },
    { id: 'R-DANG-CAU', muc: 'chan', ma_cu: 'matrix_cell', can_cu: [CAN_CU.DANG_CAU_THPT, CAN_CU.DANG_CAU_THCS],
      cach_sua: { hanh_dong: 'goi_y_thay_the', nhan: 'Xem gợi ý câu đúng dạng / Ma trận', mo_ta: 'Đổi câu sang dạng được phép của cấp học hoặc chỉnh ma trận.' },
      neu: [['?d', 'co_cau', '?c'], ['?c', 'la_dang', '?k'], { khong: ['?d', 'cho_phep_dang', '?k'] }, ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} là dạng {?k}, không thuộc các dạng câu được dùng cho đề này.' },
    { id: 'R-CHUA-DUYET', muc: 'chan', ma_cu: 'questions_not_approved', can_cu: CAN_CU.CAU_DA_DUYET,
      cach_sua: { hanh_dong: 'mo_duyet_cau', nhan: 'Mở Duyệt câu hỏi', mo_ta: 'Duyệt các câu còn ở trạng thái Nháp/Chờ duyệt trước khi duyệt đề.' },
      neu: [['?d', 'co_cau', '?c'], ['?c', 'trang_thai', '?s'], { thu: 'ne', a: '?s', b: 'approved' }, ['?c', 'trang_thai_ten', '?ten'], ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} chưa được duyệt (trạng thái: {?ten}).' },
    { id: 'R-KHAC-KHOI', muc: 'chan', ma_cu: 'scope', can_cu: CAN_CU.MA_TRAN_YCCD,
      cach_sua: { hanh_dong: 'mo_de_kiem_tra', nhan: 'Mở đề kiểm tra', mo_ta: 'Thay câu khác khối bằng câu thuộc đúng khối lớp của đề.' },
      neu: [['?d', 'khoi', '?k'], ['?d', 'co_cau', '?c'], ['?c', 'khoi', '?kc'], { thu: 'ne_num', a: '?kc', b: '?k' }, ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} thuộc Khối {?kc}, khác khối của đề (Khối {?k}).' },
    { id: 'R-KHAC-MON', muc: 'chan', ma_cu: 'scope', can_cu: CAN_CU.MA_TRAN_YCCD,
      cach_sua: { hanh_dong: 'mo_de_kiem_tra', nhan: 'Mở đề kiểm tra', mo_ta: 'Thay câu khác môn bằng câu thuộc đúng môn học của đề.' },
      neu: [['?d', 'mon', '?m'], ['?d', 'co_cau', '?c'], ['?c', 'mon', '?mc'], { thu: 'ne', a: '?mc', b: '?m' }, ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} thuộc môn {?mc}, khác môn của đề ({?m}).' },
    { id: 'R-TRUNG', muc: 'chan', ma_cu: 'duplicate', can_cu: CAN_CU.KHONG_TRUNG,
      cach_sua: { hanh_dong: 'mo_de_kiem_tra', nhan: 'Mở đề để thay câu trùng', mo_ta: 'Thay một trong các câu bị trùng bằng câu khác trong ngân hàng.' },
      neu: [['?c1', 'trung_voi', '?c2'], ['?c1', 'muc_trung', '?m'], ['?c1', 'so_thu_tu', '?n1'], ['?c2', 'so_thu_tu', '?n2']],
      vi_pham: 'Câu {?n1} trùng với câu {?n2} ({?m}).' },
    { id: 'R-NGOAI-PPCT', muc: 'chan', ma_cu: 'matrix_cell', can_cu: CAN_CU.MA_TRAN_YCCD,
      cach_sua: { hanh_dong: 'mo_ppct', nhan: 'Mở PPCT / Chuẩn hóa YCCĐ', mo_ta: 'Kiểm tra mã bài của câu hỏi trong Ngân hàng hoặc bổ sung bài vào PPCT.' },
      neu: [['?d', 'co_cau', '?c'], { khong: ['?c', 'thuoc_bai_ppct', true] }, ['?c', 'ma_bai', '?b'], ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n}: bài “{?b}” không có trong PPCT của khối.' },
    { id: 'R-NGOAI-YCCD', muc: 'chan', ma_cu: 'matrix_cell', can_cu: CAN_CU.MA_TRAN_YCCD,
      cach_sua: { hanh_dong: 'mo_ppct', nhan: 'Mở PPCT / Chuẩn hóa YCCĐ', mo_ta: 'Chỉnh YCCĐ của câu hỏi hoặc dùng công cụ Chuẩn hóa mã YCCĐ.' },
      neu: [['?d', 'co_cau', '?c'], ['?c', 'thuoc_bai_ppct', true], { khong: ['?c', 'danh_gia_yccd_ppct', true] }, ['?c', 'ma_bai', '?b'], ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n}: YCCĐ của câu không khớp YCCĐ nào của bài {?b} trong PPCT.' },
    { id: 'R-CHUA-DE-CUONG', muc: 'chan', ma_cu: 'revision', can_cu: CAN_CU.DE_CUONG_90,
      cach_sua: { hanh_dong: 'mo_doi_chieu_de_cuong', nhan: 'Gắn & đối chiếu đề cương', mo_ta: 'Gắn một phiên bản đề cương vào đề thi rồi kiểm định lại.' },
      neu: [['?d', 'la', 'de'], ['?d', 'co_de_cuong', false]],
      vi_pham: 'Đề chưa gắn đề cương ôn tập nên chưa kiểm được tỉ lệ 90%.' },
    { id: 'R-TI-LE-DE-CUONG', muc: 'chan', ma_cu: 'revision_criterion', can_cu: CAN_CU.DE_CUONG_90,
      cach_sua: { hanh_dong: 'mo_doi_chieu_de_cuong', nhan: 'Điều chỉnh tỉ lệ đề cương', mo_ta: 'Mở khung Đối chiếu & điều chỉnh đề cương để bổ sung câu của đề vào đề cương.' },
      neu: [['?d', 'co_de_cuong', true], ['?d', 'so_cau_trong_de_cuong', '?x'], ['?d', 'so_cau_can_tu_de_cuong', '?y'], { thu: 'lt', a: '?x', b: '?y' }, ['?d', 'so_cau', '?n']],
      vi_pham: 'Mới có {?x}/{?n} câu lấy từ đề cương; cần ít nhất {?y} câu.' },
    { id: 'R-TI-LE-DANG', muc: 'chan', ma_cu: 'revision_criterion', can_cu: [CAN_CU.TI_LE_DANG, CAN_CU.DE_CUONG_90],
      cach_sua: { hanh_dong: 'mo_doi_chieu_de_cuong', nhan: 'Điều chỉnh tỉ lệ đề cương theo dạng', mo_ta: 'Mở khung Đối chiếu để bổ sung đủ câu từng dạng vào đề cương.' },
      neu: [['?d', 'can_tu_de_cuong_dang', '?x'], ['?x', 'dang', '?t'], ['?x', 'dang_ten', '?ten'], ['?x', 'can', '?n'], ['?x', 'co', '?m'], ['?x', 'tong', '?tong'], { thu: 'lt', a: '?m', b: '?n' }],
      vi_pham: 'Dạng {?ten} mới có {?m}/{?tong} câu lấy từ đề cương; cần ít nhất {?n} câu.' },
    { id: 'R-PHU-YCCD', muc: 'chan', ma_cu: 'revision_criterion', can_cu: CAN_CU.PHU_YCCD,
      cach_sua: { hanh_dong: 'mo_doi_chieu_de_cuong', nhan: 'Bổ sung YCCĐ vào đề cương', mo_ta: 'Mở màn Đề cương để thêm câu phủ YCCĐ còn thiếu.' },
      neu: [['?d', 'co_de_cuong', true], ['?d', 'co_cau', '?c'], { khong: ['?c', 'yccd_trong_de_cuong', true] }, ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} kiểm tra YCCĐ không có trong đề cương ôn tập.' },

    // --- Kết quả tính bằng thủ tục gắn kèm (procedural attachment): engine tính, kho luật quyết định ---
    ...[
      ['R-TEN-DE', 'title', CAN_CU.HO_SO, 'mo_de_kiem_tra', 'Đặt tên đề kiểm tra', 'Nhập tên đề kiểm tra trong màn Tạo đề.'],
      ['R-SO-CAU', 'points', CAN_CU.HO_SO, 'mo_de_kiem_tra', 'Kiểm tra số câu & điểm', 'Đối chiếu lại số câu và điểm tổng của đề.'],
      ['R-TI-LE-KHAI-BAO', 'similarity', CAN_CU.DE_CUONG_90, 'mo_de_kiem_tra', 'Chỉnh tỉ lệ đề cương (90–100%)', 'Đặt lại tỉ lệ đề cương hợp lệ từ 90% đến 100%.'],
      ['R-KY-THUAT', 'technical', CAN_CU.KY_THUAT, 'mo_de_kiem_tra', 'Sửa nội dung kỹ thuật câu hỏi', 'Bổ sung phương án, đáp án hoặc hướng dẫn chấm trong Ngân hàng rồi tạo lại đề.'],
      ['R-BAN-CHUP', 'snapshot', CAN_CU.BAN_CHUP, 'kiem_dinh_lai', 'Kiểm định lại / Tạo lại đề', 'Bấm Kiểm định lại hoặc tạo lại đề để cập nhật bản chụp.'],
      ['R-MA-TRAN', 'matrix', CAN_CU.MA_TRAN_YCCD, 'goi_y_thay_the', 'Kiểm tra ma trận nguồn', 'Mở Ma trận & đặc tả để đối chiếu cấu trúc đề với ma trận đã khóa.'],
      ['R-O-MA-TRAN', 'matrix_cell', CAN_CU.MA_TRAN_YCCD, 'goi_y_thay_the', 'Xem gợi ý câu thay thế đúng ô', 'Thay câu lệch ô bằng câu gợi ý đúng bài, YCCĐ, dạng và mức độ.'],
      ['R-CAN-MA-TRAN', 'matrix_required', CAN_CU.CAN_MA_TRAN, 'goi_y_thay_the', 'Gắn ma trận đã khóa', 'Mở Ma trận & đặc tả để khóa ma trận và tạo đề chính thức từ ma trận đó.'],
      ['R-DE-CUONG-HOP-LE', 'revision_invalid', CAN_CU.DE_CUONG_90, 'mo_doi_chieu_de_cuong', 'Kiểm tra lại đề cương gắn kèm', 'Mở màn Đề cương để rà soát các câu chưa duyệt hoặc sai khối.']
    ].map(([id, code, cc, act, lbl, desc]) => ({
      id, muc: 'chan', can_cu: cc, ma_cu: code === 'revision_invalid' ? 'revision' : code, // cùng mã với kiểm định cũ để đối chiếu không báo lệch giả
      cach_sua: { hanh_dong: act, nhan: lbl, mo_ta: desc },
      neu: [['?d', 'thu_tuc', '?x'], ['?x', 'ma', code], ['?x', 'mo_ta', '?m']], vi_pham: '{?m}'
    })),

    // --- Cảnh báo (không chặn) ---
    { id: 'W-NGOAI-DE-CUONG', muc: 'canh_bao', can_cu: CAN_CU.DE_CUONG_90,
      neu: [['?d', 'co_de_cuong', true], ['?d', 'co_cau', '?c'], ['?c', 'trong_de_cuong', false], ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} không có trong đề cương (được phép trong giới hạn 10%).' },
    { id: 'W-THOI-GIAN', muc: 'canh_bao', can_cu: CAN_CU.THOI_GIAN,
      neu: [['?d', 'la', 'dinh_ki'], ['?d', 'mon_tin_hoc', true], ['?d', 'thoi_gian', '?p'], ['?d', 'thoi_gian_chuan', '?c'], { thu: 'ne_num', a: '?p', b: '?c' }],
      vi_pham: 'Bài kiểm tra định kì môn Tin học làm trong {?c} phút (ngưỡng của tổ), đề đang ghi {?p} phút.' },
    { id: 'W-NGOAI-PHAM-VI', muc: 'canh_bao', can_cu: CAN_CU.PHAM_VI_TUAN,
      neu: [['?d', 'kiem_tra_den_tuan', '?w'], ['?d', 'co_cau', '?c'], ['?c', 'tuan_bat_dau', '?t'], { thu: 'gt', a: '?t', b: '?w' }, ['?c', 'ma_bai', '?b'], ['?c', 'so_thu_tu', '?n']],
      vi_pham: 'Câu {?n} thuộc bài {?b}, theo PPCT bắt đầu học ở tuần {?t}, sau tuần {?w} là thời điểm kiểm tra.' },
    { id: 'W-THIEU-TIEN-DE', muc: 'canh_bao', can_cu: CAN_CU.PHAM_VI_TUAN,
      neu: [['?d', 'kiem_tra_den_tuan', '?w'], ['?d', 'co_cau', '?c'], ['?c', 'can_bai_tien_de', '?p'], ['?p', 'tuan_bat_dau', '?t'], { thu: 'gt', a: '?t', b: '?w' }, ['?c', 'so_thu_tu', '?n'], ['?p', 'ma', '?pb']],
      vi_pham: 'Câu {?n} cần bài tiền đề {?pb}, nhưng bài này học sau tuần {?w}.' }
  ];

  // ------------------------------------------------------------------------------------------
  // BỘ MÁY SUY DIỄN TIẾN
  // ------------------------------------------------------------------------------------------
  function factKey(f) { return JSON.stringify(f); }

  function createFactBase(initial) {
    const facts = [];
    const keys = new Set();
    const bySP = new Map();
    const byP = new Map();
    const add = (f) => {
      const k = factKey(f);
      if (keys.has(k)) return false;
      keys.add(k);
      facts.push(f);
      const sp = f[0] + '\u0001' + f[1];
      if (!bySP.has(sp)) bySP.set(sp, []);
      bySP.get(sp).push(f);
      if (!byP.has(f[1])) byP.set(f[1], []);
      byP.get(f[1]).push(f);
      return true;
    };
    list(initial).forEach(add);
    return {
      facts, add, has: f => keys.has(factKey(f)),
      candidates(s, p) { return !isVar(s) && !isVar(p) ? list(bySP.get(s + '\u0001' + p)) : !isVar(p) ? list(byP.get(p)) : facts; }
    };
  }

  const resolve = (term, b) => (isVar(term) ? b[term] : term);

  function unify(pattern, fact, binding) {
    const b = { ...binding };
    for (let i = 0; i < 3; i++) {
      const t = pattern[i];
      if (isVar(t)) {
        if (t in b) { if (b[t] !== fact[i]) return null; } else b[t] = fact[i];
      } else if (t !== fact[i]) return null;
    }
    return b;
  }

  const TESTS = {
    eq: (a, b) => a === b, ne: (a, b) => a !== b,
    lt: (a, b) => Number(a) < Number(b), le: (a, b) => Number(a) <= Number(b),
    gt: (a, b) => Number(a) > Number(b), ge: (a, b) => Number(a) >= Number(b),
    ne_num: (a, b) => Math.abs(Number(a) - Number(b)) > 1e-9,
    in: (a, b) => list(b).includes(a)
  };

  // Khớp các điều kiện theo thứ tự; trả mọi bộ gán biến kèm sự kiện đã dùng.
  function matchConditions(conds, fb) {
    let states = [{ b: {}, used: [] }];
    for (const c of conds) {
      const next = [];
      if (Array.isArray(c)) {
        for (const st of states) {
          const s = resolve(c[0], st.b), p = resolve(c[1], st.b);
          for (const f of fb.candidates(s === undefined ? c[0] : s, p === undefined ? c[1] : p)) {
            const b = unify(c, f, st.b);
            if (b) next.push({ b, used: [...st.used, f], absent: st.absent });
          }
        }
      } else if (c && c.khong) {
        for (const st of states) {
          const pat = c.khong.map(t => (isVar(t) && t in st.b ? st.b[t] : t));
          const any = fb.candidates(pat[0], pat[1]).some(f => unify(pat, f, {}));
          if (!any) next.push({ ...st, absent: [...(st.absent || []), pat] });
        }
      } else if (c && c.thu) {
        const fn = TESTS[c.thu];
        if (!fn) throw new Error('Phép thử không hỗ trợ: ' + c.thu);
        for (const st of states) if (fn(resolve(c.a, st.b), resolve(c.b, st.b))) next.push(st);
      }
      states = next;
      if (!states.length) break;
    }
    return states;
  }

  function fill(template, b) {
    return String(template).replace(/\{(\?[A-Za-z0-9_]+)\}/g, (_, v) => (v in b ? String(b[v]) : v));
  }

  // Phân tầng luật suy ra theo phủ định (stratified negation): vị từ bị phủ định phải được suy ra xong ở tầng trước.
  // Kho luật có phủ định vòng (p cần "không q", q lại suy từ p) thì báo lỗi ngay khi nạp, không chạy suy diễn sai.
  function stratify(rules = RULES) {
    const derive = rules.filter(r => r.thi);
    const heads = new Set(derive.flatMap(r => r.thi.map(t => t[1])).filter(p => !isVar(p)));
    const level = new Map([...heads].map(p => [p, 0]));
    const deps = derive.flatMap(r => r.thi.map(t => t[1]).filter(h => !isVar(h)).flatMap(h => list(r.neu).flatMap(c => {
      if (Array.isArray(c)) return isVar(c[1]) ? [...heads].map(q => ({ h, q, neg: false })) : [{ h, q: c[1], neg: false }];
      if (c && c.khong) return isVar(c.khong[1]) ? [...heads].map(q => ({ h, q, neg: true })) : [{ h, q: c.khong[1], neg: true }];
      return [];
    })));
    const limit = heads.size + 1;
    for (let changed = true, n = 0; changed; n++) {
      changed = false;
      for (const { h, q, neg } of deps) {
        if (!heads.has(q)) continue;
        const need = (level.get(q) || 0) + (neg ? 1 : 0);
        if (need > (level.get(h) || 0)) { level.set(h, need); changed = true; if (need > limit) throw new Error(`Kho luật có phủ định vòng ở vị từ “${h}” (luật suy ra dựa vào điều phủ định của chính nó). Hãy sửa luật trước khi dùng.`); }
      }
      if (n > limit * deps.length + 1) break;
    }
    const strata = [];
    for (const r of derive) { const s = Math.max(0, ...r.thi.map(t => level.get(t[1]) || 0)); (strata[s] = strata[s] || []).push(r); }
    return strata.filter(Boolean);
  }
  const RULE_STRATA = stratify(RULES); // kiểm khi nạp mô-đun

  // Suy diễn tiến tới điểm bất động theo từng tầng; ghi lại nguồn gốc mỗi sự kiện suy ra để giải thích.
  function infer(initialFacts, rules = RULES, opts = {}) {
    const fb = createFactBase(initialFacts);
    const derivedBy = new Map();
    const strata = rules === RULES ? RULE_STRATA : stratify(rules);
    const maxRounds = opts.maxRounds || 20;
    let truncated = false;
    for (const layer of strata) {
      let round = 0;
      for (; round < maxRounds; round++) {
        let added = 0;
        for (const r of layer) {
          for (const st of matchConditions(r.neu, fb)) {
            for (const tpl of r.thi) {
              const f = tpl.map(t => resolve(t, st.b));
              if (f.some(x => x === undefined)) continue;
              if (fb.add(f)) { added++; derivedBy.set(factKey(f), { rule: r.id, from: st.used }); }
            }
          }
        }
        if (!added) break;
      }
      if (round >= maxRounds) truncated = true;
    }
    const findings = [];
    const seen = new Set();
    for (const r of rules.filter(r => r.vi_pham)) {
      for (const st of matchConditions(r.neu, fb)) {
        const message = fill(r.vi_pham, st.b);
        const k = r.id + '|' + message;
        if (seen.has(k)) continue;
        seen.add(k);
        findings.push({
          rule: r.id, muc: r.muc || 'chan', message,
          can_cu: Array.isArray(r.can_cu) ? r.can_cu : (r.can_cu ? [r.can_cu] : []),
          bindings: st.b,
          because: st.used.map(f => ({ fact: f, derived: derivedBy.get(factKey(f)) || null })),
          // Điều kiện phủ định: điều gì không có, và những gì đang có cùng chủ thể + vị từ.
          absent: list(st.absent).map(pat => ({
            pattern: pat,
            present: fb.candidates(pat[0], pat[1]).filter(f => f[0] === pat[0] && f[1] === pat[1])
              .map(f => ({ fact: f, derived: derivedBy.get(factKey(f)) || null }))
          }))
        });
      }
    }
    if (truncated) findings.push({ rule: 'W-GIOI-HAN-SUY-DIEN', muc: 'canh_bao', message: `Suy diễn dừng ở giới hạn ${maxRounds} vòng khi chưa xong; kết luận có thể thiếu. Hãy báo người quản trị kho luật.`, can_cu: [], bindings: {}, because: [], absent: [] });
    return { facts: fb.facts, findings, derivedBy, truncated };
  }

  // Câu giải thích "vì sao" cho một kết luận: luật, sự kiện dẫn tới, luật suy ra trung gian, căn cứ.
  const PRED_LABELS = { cap_hoc: 'thuộc cấp', cho_phep_dang: 'được dùng dạng', la: 'là', khoi: 'thuộc khối' };
  function human(t) {
    const s = String(t);
    if (s.startsWith('de:')) return 'đề';
    if (s.startsWith('cau:')) return 'câu';
    if (s.startsWith('bai:')) return 'bài ' + s.slice(4);
    return PRED_LABELS[s] || (s === 'dinh_ki' ? 'đánh giá định kì' : s);
  }
  const humanFact = (f) => f.map(t => (isVar(t) ? '…' : human(t))).join(' ');

  function explain(finding, rules = RULES) {
    const byId = new Map(rules.map(r => [r.id, r]));
    const lines = [`${finding.muc === 'chan' ? 'Chặn' : 'Cảnh báo'} [${finding.rule}]: ${finding.message}`];
    for (const b of finding.because) {
      if (!b.derived) continue;
      const r = byId.get(b.derived.rule);
      lines.push(`  vì suy ra “${humanFact(b.fact)}” theo luật ${b.derived.rule}${r?.mo_ta ? ' (' + r.mo_ta + ')' : ''}`);
    }
    for (const a of list(finding.absent)) {
      const shown = humanFact(a.pattern);
      if (!a.present.length) { lines.push(`  vì không có “${shown}”`); continue; }
      const present = a.present.map(p => {
        const r = p.derived ? byId.get(p.derived.rule) : null;
        return String(p.fact[2]) + (p.derived ? ` (suy ra theo luật ${p.derived.rule}${r?.mo_ta ? ': ' + r.mo_ta : ''})` : '');
      });
      lines.push(`  vì không có “${shown}”; chỉ có: ${present.join(', ')}`);
    }
    for (const c of finding.can_cu) lines.push('  căn cứ: ' + c);
    return lines.join('\n');
  }

  // ------------------------------------------------------------------------------------------
  // SỰ KIỆN TỪ MỘT ĐỀ
  // ------------------------------------------------------------------------------------------
  // Khóa nội dung câu: dùng chung với đối chiếu đề cương và tạo đề (core.questionKeys).
  function contentKey(q) { return core.questionKeys(q).match; }

  function ppctLookup(ppct) {
    const lessons = new Map();
    for (const l of list(ppct?.lessons)) {
      if (!l || !text(l.lesson_code)) continue;
      lessons.set(`${norm(l.subject_name || 'Tin học')}|${Number(l.grade)}|${norm(l.lesson_code)}`, l);
    }
    return lessons;
  }

  const STATUS_LABELS = { draft: 'bản nháp', pending_review: 'chờ duyệt', content_checked: 'chờ duyệt', needs_review: 'cần sửa lại', approved: 'đã duyệt', archived: 'lưu trữ' };
  const KIND_VN = { MC: 'Trắc nghiệm', YN: 'Đúng/Sai', SHORT: 'Trả lời ngắn', ES: 'Tự luận' };

  function weekOf(l) {
    const raws = [l?.week_raw, ...list(l?.occurrences).map(o => (o && typeof o === 'object' ? o.week_raw : o))];
    let best = null;
    for (const raw of raws) {
      const m = String(raw ?? '').match(/(\d{1,2})/);
      if (m) { const n = Number(m[1]); if (n > 0 && (best === null || n < best)) best = n; }
    }
    return best;
  }

  // Ngưỡng tổ chuyên môn đặt được (hồ sơ: profile.rule_config). Tỉ lệ đề cương không dưới 90% (rules/01).
  const DEFAULT_CONFIG = Object.freeze({ de_cuong_min_percent: 90, thoi_gian_dinh_ki_phut: 45 });
  function normalizeConfig(c) {
    const x = c && typeof c === 'object' ? c : {};
    const pct = Math.round(Number(x.de_cuong_min_percent)), min = Math.round(Number(x.thoi_gian_dinh_ki_phut));
    return { de_cuong_min_percent: Number.isFinite(pct) ? Math.max(90, Math.min(100, pct)) : 90, thoi_gian_dinh_ki_phut: Number.isFinite(min) ? Math.max(15, Math.min(180, min)) : 45 };
  }
  // Mã lỗi của kiểm định thủ tục (static-exam-engine.verifyExam) được đưa vào kho luật thành sự kiện; mã đã có luật gốc thì bỏ qua.
  const PROCEDURAL_CODES = new Set(['title', 'points', 'similarity', 'technical', 'snapshot', 'matrix', 'matrix_cell', 'matrix_required', 'revision']);

  // opts: { revision (đề cương), ppct, scopeWeek (kiểm tra đến hết tuần), threshold (%), config (ngưỡng của tổ), procedural (lỗi thủ tục) }
  function examFacts(exam, opts = {}) {
    const e = exam || {};
    const d = 'de:' + (e.id || 'moi');
    const F = [];
    const cfg = normalizeConfig(opts.config);
    F.push([d, 'thoi_gian_chuan', cfg.thoi_gian_dinh_ki_phut]);
    const totalPts = list(e.questions).reduce((n, q) => n + (Number(q?.points) || 0), 0);
    list(opts.procedural).forEach((err, i) => {
      let code = err && err.code;
      if (!PROCEDURAL_CODES.has(code)) return;
      if (code === 'points' && Math.abs(totalPts - 10) > 1e-9) return; // tổng điểm sai: luật R-TONG-10 đã báo
      if (code === 'revision') { if (!text(e.revision_id)) return; code = 'revision_invalid'; } // chưa gắn: luật R-CHUA-DE-CUONG đã báo
      const x = 'thu_tuc:' + i;
      F.push([d, 'thu_tuc', x], [x, 'ma', code], [x, 'mo_ta', String(err.message || code)]);
    });
    const subj = text(e.subject_name) || 'Tin học';
    F.push([d, 'la', 'de'], [d, 'khoi', Number(e.grade)], [d, 'mon', norm(subj)]);
    if (norm(subj) === norm('Tin học')) F.push([d, 'mon_tin_hoc', true]);
    if (text(e.exam_type)) F.push([d, 'loai_kiem_tra', e.exam_type]);
    if (Number.isFinite(Number(e.duration)) && e.duration !== null && e.duration !== undefined) F.push([d, 'thoi_gian', Number(e.duration)]);
    const allowed = list(e.allowed_kinds).filter(Boolean);
    F.push([d, 'khai_dang_rieng', allowed.length > 0]);
    allowed.forEach(k => F.push([d, 'cho_phep_dang', k]));
    const qs = list(e.questions);
    F.push([d, 'so_cau', qs.length]);
    const total = qs.reduce((n, q) => n + (Number(q?.points) || 0), 0);
    F.push([d, 'tong_diem', Math.round(total * 1000) / 1000]);
    const scopeWeek = Number(opts.scopeWeek ?? e.scope_week);
    if (Number.isInteger(scopeWeek) && scopeWeek > 0) F.push([d, 'kiem_tra_den_tuan', scopeWeek]);

    const lessons = ppctLookup(opts.ppct || e.ppct_snapshot);
    const rev = opts.revision === undefined ? (e.revision_snapshot || null) : opts.revision;
    const revKeys = new Set(list(rev?.questions).map(contentKey));
    // YCCĐ theo mã cố định khi tra được trong PPCT (đổi câu chữ YCCĐ không làm lệch đối chiếu).
    const outcomeKey = q => { const l = lessons.get(`${norm(text(q?.subject_name) || subj)}|${Number(q?.grade)}|${norm(q?.lesson_code)}`); const r = l && core.resolveOutcome(l, { id: q?.learning_outcome_id, text: q?.learning_outcome }); return norm(q?.lesson_code) + '|' + (r ? 'id:' + r.id : 't:' + norm(q?.learning_outcome)); };
    const revOutcomes = new Set(list(rev?.questions).map(outcomeKey));
    F.push([d, 'co_de_cuong', Boolean(rev)]);
    const seenKey = new Map();
    let inRev = 0;
    qs.forEach((q, i) => {
      const c = 'cau:' + (q?.id || i) + '#' + i;
      const n = q?.slot_number || q?.number || i + 1;
      F.push([d, 'co_cau', c], [c, 'so_thu_tu', n], [c, 'khoi', Number(q?.grade)], [c, 'mon', norm(text(q?.subject_name) || subj)],
        [c, 'trang_thai', q?.review_status || 'draft'], [c, 'trang_thai_ten', STATUS_LABELS[q?.review_status || 'draft'] || String(q?.review_status)],
        [c, 'ma_bai', text(q?.lesson_code) || '(trống)']);
      if (q?.type) F.push([c, 'la_dang', q.type]);
      if (q?.level) F.push([c, 'o_muc_do', q.level]);
      const key = contentKey(q), stem = core.questionKeys(q).stem;
      const prev = seenKey.get(stem);
      if (prev && norm(q?.question)) F.push([c, 'trung_voi', prev.c], [c, 'muc_trung', core.RELATION_LABELS[core.questionRelation(prev.q, q)] || 'cùng lời dẫn']);
      else seenKey.set(stem, { c, q });
      const lesson = lessons.get(`${norm(text(q?.subject_name) || subj)}|${Number(q?.grade)}|${norm(q?.lesson_code)}`);
      if (lesson) {
        F.push([c, 'thuoc_bai_ppct', true]);
        if (core.resolveOutcome(lesson, { id: q?.learning_outcome_id, text: q?.learning_outcome })) F.push([c, 'danh_gia_yccd_ppct', true]);
        const w = weekOf(lesson);
        if (w !== null) F.push([c, 'tuan_bat_dau', w]);
        for (const code of list(lesson.prerequisites)) {
          const pr = (core && typeof core.parsePrerequisite === 'function')
            ? core.parsePrerequisite(code, lesson.grade)
            : { grade: Number(lesson.grade), lesson_code: String(code || '').trim() };
          if (!pr || !pr.lesson_code) continue;
          const pre = lessons.get(`${norm(lesson.subject_name || subj)}|${pr.grade}|${norm(pr.lesson_code)}`);
          if (!pre) continue;
          const labelCode = pr.grade !== Number(lesson.grade) ? `${pr.grade}:${pr.lesson_code}` : pr.lesson_code;
          const p = 'bai:' + pr.grade + ':' + norm(pr.lesson_code);
          F.push([c, 'can_bai_tien_de', p], [p, 'ma', labelCode]);
          if (pr.grade === Number(lesson.grade)) {
            const pw = weekOf(pre);
            if (pw !== null) F.push([p, 'tuan_bat_dau', pw]);
          }
        }
      }
      if (rev) {
        const isIn = revKeys.has(key);
        if (isIn) inRev++;
        F.push([c, 'trong_de_cuong', isIn]);
        if (revOutcomes.has(outcomeKey(q))) F.push([c, 'yccd_trong_de_cuong', true]);
      }
    });
    if (rev) {
      const threshold = Math.max(cfg.de_cuong_min_percent, Number(opts.threshold ?? e.similarity_target_percent ?? 90) || 0);
      const rawOverall = rev?.overall_target_percent ?? e?.overall_target_percent ?? null;
      const reqTotal = rawOverall != null
        ? (core && typeof core.requiredRevisionCount === 'function'
          ? core.requiredRevisionCount(qs.length, threshold)
          : (qs.length <= 0 || threshold <= 0 ? 0 : (threshold >= 100 ? qs.length : Math.min(qs.length, Math.ceil(qs.length * threshold / 100 - 1e-9)))))
        : Math.ceil(qs.length * threshold / 100);
      F.push([d, 'so_cau_trong_de_cuong', inRev], [d, 'so_cau_can_tu_de_cuong', reqTotal]);
      const typeTargets = rev?.coverage_targets || e?.coverage_targets || null;
      if (typeTargets && typeof typeTargets === 'object') {
        const countsByType = {};
        for (const t of ['MC', 'YN', 'SHORT', 'ES']) {
          const cnt = qs.filter(q => q?.type === t).length;
          if (cnt) countsByType[t] = cnt;
        }
        const plan = core && typeof core.computeRevisionPlan === 'function'
          ? core.computeRevisionPlan(countsByType, { overallPercent: rawOverall, typeTargets })
          : null;
        for (const t of Object.keys(plan?.by_type || {})) {
          const qType = qs.filter(q => q?.type === t);
          if (!qType.length) continue;
          const needT = plan.by_type[t].want;
          const haveT = qType.filter(q => revKeys.has(contentKey(q))).length;
          const x = 'dang_de_cuong:' + t;
          F.push([d, 'can_tu_de_cuong_dang', x], [x, 'dang', t], [x, 'dang_ten', KIND_VN[t] || t], [x, 'can', needT], [x, 'co', haveT], [x, 'tong', qType.length]);
        }
      }
    }
    return F;
  }

  // Kiểm một đề bằng kho luật. data: workspace (để tìm đề cương nếu đề chưa có bản chụp).
  function checkExam(data, exam, opts = {}) {
    const e = exam || {};
    let revision = opts.revision;
    if (revision === undefined) {
      revision = e.revision_snapshot || (e.revision_id ? list(data?.revisions).find(r => r.id === e.revision_id) : null) || null;
    }
    const ppct = opts.ppct || e.ppct_snapshot || data?.bank?.ppct;
    const facts = examFacts(e, { ...opts, revision, ppct });
    const rules = opts.rules || RULES;
    const result = infer(facts, rules);
    const byId = new Map(rules.map(r => [r.id, r]));
    const blocking = result.findings.filter(f => f.muc === 'chan');
    const warnings = result.findings.filter(f => f.muc !== 'chan');
    const ctxMeta = { exam_id: e.id || '', revision_id: e.revision_id || revision?.id || '', grade: e.grade || '' };
    // code: mã lỗi quen thuộc của báo cáo kiểm định cũ (vd 'snapshot'), để màn hình và luồng duyệt đọc như trước.
    const shape = f => {
      const r = byId.get(f.rule);
      const fix = r && r.cach_sua ? { ...r.cach_sua, ...ctxMeta } : null;
      return { rule: f.rule, code: r?.ma_cu || f.rule, message: f.message, can_cu: f.can_cu, explanation: explain(f, rules), ...(fix ? { cach_sua: fix } : {}) };
    };
    return {
      passed: blocking.length === 0,
      errors: blocking.map(shape),
      warnings: warnings.map(shape),
      facts_count: result.facts.length,
      derived_count: result.derivedBy.size,
      truncated: Boolean(result.truncated),
      config: normalizeConfig(opts.config)
    };
  }

  // Danh sách luật để tổ chuyên môn đọc (mã, loại, nội dung, căn cứ).
  function describeRules(rules = RULES) {
    return rules.map(r => ({
      id: r.id, loai: r.thi ? 'suy_ra' : (r.muc === 'canh_bao' ? 'canh_bao' : 'chan'),
      noi_dung: r.mo_ta || r.vi_pham, can_cu: Array.isArray(r.can_cu) ? r.can_cu : (r.can_cu ? [r.can_cu] : []),
      cach_sua: r.cach_sua || null
    }));
  }

  return { RULES, CAN_CU, DEFAULT_CONFIG, normalizeConfig, stratify, infer, explain, examFacts, checkExam, describeRules, matchConditions, createFactBase, contentKey };
});
