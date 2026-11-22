/**
 * TableFileHelper: Bộ công cụ đọc & xuất file Excel (.xlsx / .csv / .tsv),
 * chuyển đổi dữ liệu bảng tính thành Ngân hàng câu hỏi, PPCT và Ma trận,
 * và sinh Prompt AI tạo câu hỏi theo bài - mục tiêu bài học (YCCĐ).
 * 
 * Ưu tiên định dạng: Excel (.xlsx / .csv) #1 -> JSON #2 -> Markdown #3.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TableFileHelper = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // =========================================================================
  // 1. CÁC HÀM TIỆN ÍCH CƠ BẢN & XỬ LÝ CHUỖI
  // =========================================================================
  const norm = str => (typeof str === 'string' ? str.trim() : str == null ? '' : String(str).trim());
  const lower = str => norm(str).toLowerCase();
  
  function stripAccents(str) {
    return norm(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  // =========================================================================
  // 2. PARSE CSV / TSV / TEXT (RFC 4180 COMPLIANT CÓ UTF-8 BOM & QUOTES)
  // =========================================================================
  function parseCsvText(rawText) {
    if (typeof rawText !== 'string') return [];
    let text = rawText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!text.trim()) return [];

    // Nhận diện delimiter: tab, chấm phẩy, hoặc phẩy ở dòng tiêu đề ngoài dấu ngoặc kép
    let quoted = false;
    const counts = { '\t': 0, ';': 0, ',': 0 };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { i++; continue; }
        quoted = !quoted;
      } else if (!quoted) {
        if (c === '\n') break;
        if (c in counts) counts[c]++;
      }
    }
    const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ',';

    const rows = [];
    let row = [];
    let cell = '';
    let state = 0; // 0: chờ/thường, 1: trong ngoặc kép, 2: vừa thoát ngoặc kép

    const pushCell = () => {
      row.push(cell.trim());
      cell = '';
      state = 0;
    };
    const pushRow = () => {
      pushCell();
      if (row.some(c => c !== '')) {
        rows.push(row);
      }
      row = [];
    };

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (state === 1) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            state = 2;
          }
        } else {
          cell += c;
        }
        continue;
      }

      if (c === delimiter) {
        pushCell();
      } else if (c === '\n') {
        pushRow();
      } else if (c === '"' && state === 0 && !cell) {
        state = 1;
      } else if (c === '"' || state === 2) {
        if (c === ' ' || c === '\t') continue;
        cell += c;
        state = 3;
      } else {
        cell += c;
        state = 3;
      }
    }
    if (cell || row.length || state === 2) {
      pushRow();
    }
    return rows;
  }

  // =========================================================================
  // 3. GIẢI NÉN & ĐỌC EXCEL (.XLSX) THUẦN JAVASCRIPT (DOMParser + DecompressionStream)
  // =========================================================================
  function elements(node, name) {
    if (!node) return [];
    return Array.from(node.getElementsByTagName('*')).filter(
      n => (n.localName || n.nodeName.split(':').pop()) === name
    );
  }

  function parseXml(xmlText) {
    if (typeof xmlText !== 'string') throw new Error('XML text không hợp lệ.');
    if (/<!DOCTYPE|<!ENTITY/i.test(xmlText)) throw new Error('XML không an toàn.');
    const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
    if (!parser) throw new Error('Không có DOMParser trong môi trường này.');
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (!doc.documentElement || elements(doc, 'parsererror').length) {
      throw new Error('Lỗi cú pháp XML trong file XLSX.');
    }
    return doc;
  }

  function crc32(data) {
    let c = 0xffffffff;
    for (const x of data) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  async function unzipXlsx(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = bytes.length;
    const u16 = p => view.getUint16(p, true);
    const u32 = p => view.getUint32(p, true);

    let end = -1;
    for (let p = n - 22; p >= Math.max(0, n - 65557); p--) {
      if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === n) {
        end = p;
        break;
      }
    }
    if (end < 0) throw new Error('Tệp không đúng định dạng XLSX (ZIP archive).');

    const count = u16(end + 10);
    const length = u32(end + 12);
    const offset = u32(end + 16);
    if (offset + length !== end) throw new Error('Cấu trúc XLSX không hợp lệ.');

    let p = offset;
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      if (p + 46 > end || u32(p) !== 0x02014b50) throw new Error('Mục ZIP không hợp lệ.');
      const flags = u16(p + 8);
      const method = u16(p + 10);
      const crc = u32(p + 16);
      const compressed = u32(p + 20);
      const plain = u32(p + 24);
      const nl = u16(p + 28);
      const extra = u16(p + 30);
      const comment = u16(p + 32);
      const local = u32(p + 42);

      const name = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nl));
      const nameLen = u16(local + 26);
      const dataStart = local + 30 + nameLen + u16(local + 28);
      const dataEnd = dataStart + compressed;

      entries.set(name, { dataStart, dataEnd, plain, method, crc });
      p += 46 + nl + extra + comment;
    }

    return async function readEntry(name) {
      let entry = entries.get(name);
      if (!entry && !name.startsWith('/')) entry = entries.get('/' + name);
      if (!entry && name.startsWith('/')) entry = entries.get(name.slice(1));
      if (!entry) return null;

      let data = bytes.subarray(entry.dataStart, entry.dataEnd);
      if (entry.method === 8) {
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('Trình duyệt chưa hỗ trợ DecompressionStream. Vui lòng cập nhật trình duyệt hoặc dùng file CSV.');
        }
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const reader = stream.getReader();
        const chunks = [];
        let len = 0;
        for (;;) {
          const res = await reader.read();
          if (res.done) break;
          len += res.value.length;
          chunks.push(res.value);
        }
        data = new Uint8Array(len);
        let at = 0;
        for (const chunk of chunks) {
          data.set(chunk, at);
          at += chunk.length;
        }
      }
      return new TextDecoder('utf-8').decode(data);
    };
  }

  async function parseXlsxBytes(bytes) {
    const read = await unzipXlsx(bytes);
    const workbookXml = await read('xl/workbook.xml');
    if (!workbookXml) throw new Error('Không tìm thấy xl/workbook.xml trong file XLSX.');
    const workbook = parseXml(workbookXml);

    // Đọc sharedStrings nếu có
    let sharedStrings = [];
    const sharedStringsXml = await read('xl/sharedStrings.xml');
    if (sharedStringsXml) {
      const ssDoc = parseXml(sharedStringsXml);
      sharedStrings = elements(ssDoc, 'si').map(si =>
        elements(si, 't').map(t => t.textContent).join('')
      );
    }

    // Đọc quan hệ sheets
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const relsXml = await read('xl/_rels/workbook.xml.rels');
    if (relsXml) {
      const relsDoc = parseXml(relsXml);
      const rels = elements(relsDoc, 'Relationship');
      const firstSheetRel = rels.find(r => /\/worksheet$/.test(r.getAttribute('Type') || ''));
      if (firstSheetRel) {
        let target = firstSheetRel.getAttribute('Target') || '';
        if (target.startsWith('/')) target = target.slice(1);
        else if (!target.startsWith('xl/')) target = 'xl/' + target;
        sheetPath = target;
      }
    }

    let sheetXml = await read(sheetPath);
    if (!sheetXml) {
      sheetXml = await read('xl/worksheets/sheet1.xml');
    }
    if (!sheetXml) throw new Error('Không đọc được trang tính đầu tiên trong file XLSX.');

    const sheetDoc = parseXml(sheetXml);
    const rows = [];
    let lastRow = 0;

    for (const r of elements(sheetDoc, 'row')) {
      const rowNum = r.hasAttribute('r') ? Number(r.getAttribute('r')) : lastRow + 1;
      lastRow = rowNum;
      const values = [];
      let lastCol = 0;

      for (const c of elements(r, 'c')) {
        const ref = c.getAttribute('r');
        let col = lastCol + 1;
        if (ref) {
          const m = /^([A-Z]{1,3})([1-9]\d*)$/.exec(ref);
          if (m) {
            col = 0;
            for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
          }
        }
        lastCol = col;

        const type = c.getAttribute('t');
        const vEl = elements(c, 'v')[0];
        let val = '';
        if (type === 'inlineStr') {
          val = elements(c, 'is').map(is => elements(is, 't').map(t => t.textContent).join('')).join('');
        } else if (type === 's' && vEl) {
          const idx = Number(vEl.textContent);
          val = sharedStrings[idx] || '';
        } else if (vEl) {
          val = vEl.textContent || '';
        }
        values[col - 1] = val.trim();
      }

      // Điền khoảng trống
      for (let j = 0; j < values.length; j++) {
        if (values[j] === undefined) values[j] = '';
      }
      if (values.some(v => v !== '')) {
        rows.push(values);
      }
    }

    return rows;
  }

  // =========================================================================
  // 4. XUẤT CSV CÓ UTF-8 BOM MỞ TRỰC TIẾP TRÊN EXCEL
  // =========================================================================
  function toCsv(rows) {
    if (!Array.isArray(rows) || !rows.length) return '\ufeff';
    const lines = rows.map(row => {
      if (!Array.isArray(row)) return '';
      return row.map(cell => {
        const s = cell == null ? '' : String(cell);
        if (/[",\r\n\t;]/.test(s)) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      }).join(',');
    });
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  function downloadCsv(rows, filename = 'du_lieu.csv') {
    const csvContent = toCsv(rows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // =========================================================================
  // 5. ĐỌC TỔNG HỢP MỌI LOẠI FILE (EXCEL / CSV / JSON / MARKDOWN)
  // =========================================================================
  async function readTableFile(file) {
    if (!file) throw new Error('Chưa chọn tệp.');
    const ext = (file.name || '').toLowerCase().split('.').pop();

    if (ext === 'xlsx' || ext === 'xls') {
      if (ext === 'xls') {
        throw new Error('Định dạng .xls cũ không được hỗ trợ. Vui lòng mở tệp trong Excel và chọn "Save As" sang định dạng .xlsx hoặc .csv.');
      }
      const buffer = await file.arrayBuffer();
      const rows = await parseXlsxBytes(new Uint8Array(buffer));
      return { type: 'table', rows, filename: file.name, ext };
    }

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      const text = await file.text();
      // Nếu là CSV/TSV
      const rows = parseCsvText(text);
      if (rows.length && rows[0].length >= 2) {
        return { type: 'table', rows, filename: file.name, ext, text };
      }
      // Nếu là văn bản thuần hoặc markdown
      return { type: 'text', text, filename: file.name, ext };
    }

    if (ext === 'json') {
      const text = await file.text();
      const data = JSON.parse(text);
      return { type: 'json', data, filename: file.name, ext };
    }

    if (ext === 'md') {
      const text = await file.text();
      return { type: 'markdown', text, filename: file.name, ext };
    }

    if (ext === 'docx') {
      return { type: 'docx', file, filename: file.name, ext };
    }

    throw new Error(`Định dạng tệp .${ext} chưa được hỗ trợ. Vui lòng chọn file Excel (.xlsx, .csv), JSON (.json) hoặc Markdown (.md).`);
  }

  // =========================================================================
  // 6. PHÂN TÍCH BẢNG DỮ LIỆU EXCEL / CSV THÀNH NGÂN HÀNG CÂU HỎI
  // =========================================================================
  function parseQuestionsFromRows(rows, defaultGrade = 9, defaultSubject = 'Tin học') {
    if (!Array.isArray(rows) || !rows.length) return [];

    let headerIndex = -1;
    let colMap = {
      lesson: -1, level: -1, type: -1, question: -1,
      optA: -1, optB: -1, optC: -1, optD: -1,
      correct: -1, explanation: -1, outcome: -1
    };

    // Tìm dòng tiêu đề
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const row = rows[i];
      let matches = 0;
      row.forEach((cell, idx) => {
        const c = stripAccents(lower(cell));
        if (/ma\s*bai|bai\s*hoc|bai|lesson/i.test(c)) { colMap.lesson = idx; matches++; }
        else if (/muc\s*do|muc|level/i.test(c)) { colMap.level = idx; matches++; }
        else if (/dang\s*cau|dang|loai|type/i.test(c)) { colMap.type = idx; matches++; }
        else if (/cau\s*hoi|de\s*bai|ngu\s*lieu|noi\s*dung|question/i.test(c)) { colMap.question = idx; matches++; }
        else if (/phuong\s*an\s*a|y\s*a|^a\)?$|^a\./i.test(c)) { colMap.optA = idx; matches++; }
        else if (/phuong\s*an\s*b|y\s*b|^b\)?$|^b\./i.test(c)) { colMap.optB = idx; matches++; }
        else if (/phuong\s*an\s*c|y\s*c|^c\)?$|^c\./i.test(c)) { colMap.optC = idx; matches++; }
        else if (/phuong\s*an\s*d|y\s*d|^d\)?$|^d\./i.test(c)) { colMap.optD = idx; matches++; }
        else if (/dap\s*an|dap\s*an\s*dung|key|answer/i.test(c)) { colMap.correct = idx; matches++; }
        else if (/huong\s*dan|loi\s*giai|giai\s*thich|tieu\s*chi|rubric|explanation/i.test(c)) { colMap.explanation = idx; matches++; }
        else if (/yeu\s*cau\s*can\s*dat|yccd|muc\s*tieu|outcome/i.test(c)) { colMap.outcome = idx; matches++; }
      });
      if (matches >= 3) {
        headerIndex = i;
        break;
      }
    }

    // Nếu không tìm thấy hàng tiêu đề rõ ràng, gán cột mặc định 11 cột chuẩn
    if (headerIndex === -1) {
      headerIndex = 0; // giả sử dòng đầu là tiêu đề hoặc dữ liệu
      colMap = {
        lesson: 0, level: 1, type: 2, question: 3,
        optA: 4, optB: 5, optC: 6, optD: 7,
        correct: 8, explanation: 9, outcome: 10
      };
    }

    const dataRows = rows.slice(headerIndex + 1);
    const questions = [];
    const now = Date.now();

    dataRows.forEach((row, rIdx) => {
      if (!row || !row.length) return;
      const getVal = idx => (idx >= 0 && idx < row.length ? norm(row[idx]) : '');

      const qText = getVal(colMap.question);
      if (!qText) return; // Bỏ qua dòng trống câu hỏi

      const lessonRaw = getVal(colMap.lesson) || 'B1';
      const levelRaw = getVal(colMap.level);
      const typeRaw = getVal(colMap.type).toUpperCase();
      const optA = getVal(colMap.optA);
      const optB = getVal(colMap.optB);
      const optC = getVal(colMap.optC);
      const optD = getVal(colMap.optD);
      const correctRaw = getVal(colMap.correct);
      const explanation = getVal(colMap.explanation);
      const outcome = getVal(colMap.outcome);

      // Chuẩn hóa mức độ nhận thức
      let level = 'Biết';
      const normLvl = stripAccents(lower(levelRaw));
      if (/van\s*dung\s*cao|vdc/i.test(normLvl)) level = 'Vận dụng cao';
      else if (/van\s*dung|vd/i.test(normLvl)) level = 'Vận dụng';
      else if (/hieu|thong\s*hieu|th/i.test(normLvl)) level = 'Hiểu';
      else if (/biet|nhan\s*biet|nb/i.test(normLvl)) level = 'Biết';

      // Chuẩn hóa mã bài học
      let lessonCode = lessonRaw.toUpperCase();
      if (!/^([A-Z0-9_\-]+)$/.test(lessonCode)) {
        const m = lessonCode.match(/\b(B\d+|CD\d+|BAI\s*\d+)\b/i);
        if (m) lessonCode = m[1].replace(/\s+/g, '');
        else lessonCode = 'B1';
      }

      // Xác định loại câu hỏi
      let qType = 'MC';
      if (/YN|DUNG\s*SAI|D\/S/i.test(typeRaw)) {
        qType = 'YN';
      } else if (/SHORT|TRA\s*LOI\s*NGAN|NGAN/i.test(typeRaw)) {
        qType = 'SHORT';
      } else if (/ES|TU\s*LUAN|TL/i.test(typeRaw)) {
        qType = 'ES';
      } else {
        // Tự động nhận diện dựa vào dữ liệu
        if (optA && optB && optC && optD) {
          // Kiểm tra xem đáp án có phải dạng Đúng/Sai (Đ, S, Đ, S)
          if (/^[ĐDSđdsTFtf01][,\s;\/]+[ĐDSđdsTFtf01]/i.test(correctRaw)) {
            qType = 'YN';
          } else {
            qType = 'MC';
          }
        } else if (!optA && !optB && correctRaw) {
          qType = 'SHORT';
        } else if (!optA && !optB && !correctRaw) {
          qType = 'ES';
        }
      }

      const id = `Q-IMPORT-${now}-${rIdx + 1}`;
      const baseQ = {
        id,
        grade: Number(defaultGrade) || 9,
        subject_name: defaultSubject,
        lesson_code: lessonCode,
        level,
        type: qType,
        question: qText,
        learning_outcome: outcome || '',
        review_status: 'draft',
        created_at: new Date().toISOString()
      };

      if (qType === 'MC') {
        const options = [optA, optB, optC, optD].filter(Boolean);
        while (options.length < 4) options.push(`Phương án ${'ABCD'[options.length]}`);

        let correct = 0;
        const normKey = correctRaw.toUpperCase().trim();
        if (normKey === 'B' || normKey === '1') correct = 1;
        else if (normKey === 'C' || normKey === '2') correct = 2;
        else if (normKey === 'D' || normKey === '3') correct = 3;

        baseQ.options = options;
        baseQ.correct = correct;
        baseQ.option_explanations = [
          correct === 0 ? (explanation || 'Phương án đúng.') : 'Phương án sai.',
          correct === 1 ? (explanation || 'Phương án đúng.') : 'Phương án sai.',
          correct === 2 ? (explanation || 'Phương án đúng.') : 'Phương án sai.',
          correct === 3 ? (explanation || 'Phương án đúng.') : 'Phương án sai.'
        ];
        if (explanation) {
          baseQ.option_explanations[correct] = explanation;
        }
        questions.push(baseQ);
      } else if (qType === 'YN') {
        // Phân tích 4 ý Đúng/Sai
        const rawStatements = [
          { label: 'a', text: optA || 'Ý a' },
          { label: 'b', text: optB || 'Ý b' },
          { label: 'c', text: optC || 'Ý c' },
          { label: 'd', text: optD || 'Ý d' }
        ];

        // Tách đáp án Đ, S, Đ, S
        const keys = correctRaw.split(/[,;\s\/]+/).map(k => k.trim().toUpperCase());
        const isTrue = k => k === 'Đ' || k === 'D' || k === 'T' || k === 'TRUE' || k === '1' || k === 'ĐÚNG';

        baseQ.statements = rawStatements.map((st, sIdx) => ({
          label: st.label,
          text: st.text,
          correct: keys[sIdx] ? isTrue(keys[sIdx]) : sIdx % 2 === 0
        }));
        baseQ.explanation = explanation || '';
        questions.push(baseQ);
      } else if (qType === 'SHORT') {
        baseQ.answer = correctRaw || '';
        baseQ.explanation = explanation || '';
        questions.push(baseQ);
      } else if (qType === 'ES') {
        baseQ.rubric = [
          { criterion: explanation || 'Nêu và thực hiện đúng yêu cầu đề bài.', points: 1.0 }
        ];
        baseQ.max_score = 1.0;
        questions.push(baseQ);
      }
    });

    return questions;
  }

  // =========================================================================
  // 7. PHÂN TÍCH BẢNG DỮ LIỆU EXCEL / CSV THÀNH DANH MỤC PPCT
  // =========================================================================
  function parsePpctFromRows(rows, defaultGrade = 9, defaultSubject = 'Tin học') {
    if (!Array.isArray(rows) || !rows.length) return [];

    let headerIndex = -1;
    let colMap = { week: -1, lesson: -1, duration: -1, ppct: -1, outcomes: -1, nls: -1, notes: -1 };

    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const row = rows[i];
      let matches = 0;
      row.forEach((cell, idx) => {
        const c = stripAccents(lower(cell));
        if (/tuan|stt|tiet\s*thu/i.test(c)) { colMap.week = idx; matches++; }
        else if (/bai\s*hoc|ten\s*bai|bai|lesson/i.test(c)) { colMap.lesson = idx; matches++; }
        else if (/so\s*tiet|thoi\s*luong|duration/i.test(c)) { colMap.duration = idx; matches++; }
        else if (/tiet\s*ppct|ppct|tiet/i.test(c)) { colMap.ppct = idx; matches++; }
        else if (/yeu\s*cau\s*can\s*dat|yccd|muc\s*tieu|outcomes/i.test(c)) { colMap.outcomes = idx; matches++; }
        else if (/nang\s*luc\s*so|nls|ai/i.test(c)) { colMap.nls = idx; matches++; }
        else if (/ghi\s*chu|notes/i.test(c)) { colMap.notes = idx; matches++; }
      });
      if (matches >= 3) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      headerIndex = 0;
      colMap = { week: 0, lesson: 1, duration: 2, ppct: 3, outcomes: 4, nls: 5, notes: 6 };
    }

    const dataRows = rows.slice(headerIndex + 1);
    const lessons = [];
    let lessonCount = 1;

    dataRows.forEach(row => {
      if (!row || !row.length) return;
      const getVal = idx => (idx >= 0 && idx < row.length ? norm(row[idx]) : '');

      const lessonNameRaw = getVal(colMap.lesson);
      if (!lessonNameRaw) return;

      const weekRaw = getVal(colMap.week);
      const durationRaw = Number(getVal(colMap.duration)) || 1;
      const ppctRaw = getVal(colMap.ppct);
      const outcomesRaw = getVal(colMap.outcomes);
      const nlsRaw = getVal(colMap.nls);
      const notesRaw = getVal(colMap.notes);

      // Nhận diện mã bài B1, B2... hoặc CD1, CD2...
      let lessonCode = `B${lessonCount}`;
      let cleanName = lessonNameRaw;
      const mCode = lessonNameRaw.match(/^(?:Bài|Chuyên đề|CD|B)\s*([0-9A-Za-z]+)\s*[:\.\-·]\s*(.*)$/i);
      if (mCode) {
        const prefix = /chuyên\s*đề|CD/i.test(lessonNameRaw) ? 'CD' : 'B';
        lessonCode = `${prefix}${mCode[1]}`;
        cleanName = mCode[2].trim();
      }

      // Xác định phần cốt lõi hay chuyên đề học tập
      const isElective = /chuyên\s*đề|CD\d+/i.test(lessonCode) || /chuyên\s*đề/i.test(notesRaw);
      const section = isElective ? 'elective_topic' : 'core';

      // Tách các YCCĐ
      const outcomes = outcomesRaw
        ? outcomesRaw.split(/(?:\r?\n|•|\-|\+)\s*/).map(o => o.trim()).filter(Boolean)
        : [];

      lessons.push({
        grade: Number(defaultGrade) || 9,
        subject_name: defaultSubject,
        lesson_code: lessonCode,
        lesson_name: cleanName,
        lesson_name_source: cleanName,
        topic: notesRaw || (isElective ? 'Chuyên đề lựa chọn' : 'Nội dung cốt lõi'),
        duration: durationRaw,
        section,
        outcomes: outcomes.length ? outcomes : [cleanName],
        competencies: nlsRaw ? [nlsRaw] : [],
        occurrences: [{
          week_raw: weekRaw || `Tuần ${lessonCount}`,
          periods_raw: ppctRaw || `Tiết ${lessonCount}`,
          source_title: lessonNameRaw
        }]
      });
      lessonCount++;
    });

    return lessons;
  }

  // =========================================================================
  // 8. TẠO MẪU FILE CSV (CÓ UTF-8 BOM) CHO CẢ 3 PHÂN HỆ
  // =========================================================================
  function getSampleBankRows(grade = 9, subject = 'Tin học') {
    const isThpt = Number(grade) >= 10;
    return [
      [
        'Mã bài', 'Mức độ', 'Dạng câu', 'Nội dung câu hỏi',
        'Phương án A / Ý a', 'Phương án B / Ý b', 'Phương án C / Ý c', 'Phương án D / Ý d',
        'Đáp án đúng', 'Hướng dẫn giải / Tiêu chí chấm', 'Yêu cầu cần đạt'
      ],
      [
        'B1', 'Biết', 'MC',
        `Thiết bị nào sau đây là thiết bị vào cơ bản của máy tính trong môn ${subject}?`,
        'Bàn phím (Keyboard)', 'Màn hình (Monitor)', 'Máy in (Printer)', 'Loa (Speaker)',
        'A',
        'Bàn phím là thiết bị vào dùng để nhập văn bản và lệnh. Màn hình, máy in và loa là các thiết bị ra.',
        'Nhận biết được các thiết bị vào - ra cơ bản của hệ thống máy tính.'
      ],
      [
        'B1', 'Hiểu', 'MC',
        'Khi lưu trữ dữ liệu trên các dịch vụ đám mây (Google Drive, OneDrive), ưu điểm lớn nhất là gì?',
        'Dung lượng lưu trữ hoàn toàn vô hạn mà không mất phí',
        'Có thể truy cập và chia sẻ dữ liệu mọi lúc mọi nơi khi có kết nối Internet',
        'Thiết bị cá nhân sẽ không bao giờ bị nhiễm virus mã hóa tệp',
        'Không cần phải đặt mật khẩu hay thiết lập bảo mật cho tài khoản',
        'B',
        'Dịch vụ đám mây cho phép người dùng đồng bộ hóa, truy cập và cộng tác làm việc từ xa dễ dàng.',
        'Hiểu được vai trò và lợi ích thực tiễn của công nghệ lưu trữ đám mây.'
      ],
      [
        'B2', 'Vận dụng', 'YN',
        isThpt
          ? 'Trong dự án học tập, một nhóm học sinh sử dụng Google Drive để lưu trữ và chia sẻ tài liệu chung. Xét tính Đúng/Sai của các nhận định sau:'
          : 'Khi chia sẻ tệp tin và thư mục trên môi trường mạng máy tính, xét tính Đúng/Sai của các phát biểu sau:',
        'Có thể phân quyền "Người xem" để người khác chỉ đọc tài liệu mà không chỉnh sửa được',
        'Khi chủ sở hữu xóa thư mục gốc trên đám mây, các thành viên được chia sẻ vẫn truy cập bình thường',
        'Chủ sở hữu thư mục có toàn quyền thêm, bớt thành viên hoặc thu hồi quyền truy cập bất cứ lúc nào',
        'Chia sẻ tệp với quyền "Bất kỳ ai có đường liên kết đều có thể chỉnh sửa" là an toàn tuyệt đối',
        'Đ, S, Đ, S',
        'Ý a Đúng (Drive cho phép cấp quyền Người xem/Nhận xét/Chỉnh sửa); Ý b Sai (khi xóa thư mục gốc thì liên kết chia sẻ bị vô hiệu); Ý c Đúng (chủ sở hữu có toàn quyền quản trị); Ý d Sai (chia sẻ công khai không kiểm soát tiềm ẩn nguy cơ bị xóa hoặc phá hoại dữ liệu).',
        'Vận dụng được các kỹ năng chia sẻ tài nguyên và thiết lập phân quyền an toàn trên đám mây.'
      ],
      [
        'B2', 'Hiểu', 'SHORT',
        'Trong phần mềm bảng tính, công thức =COUNTIF(A1:A20, ">=5") dùng để đếm số lượng các ô thỏa mãn điều kiện gì?',
        '', '', '', '',
        'Số ô có giá trị lớn hơn hoặc bằng 5',
        'Hàm COUNTIF thực hiện đếm số ô trong phạm vi A1:A20 có giá trị thỏa mãn tiêu chí lớn hơn hoặc bằng 5.',
        'Sử dụng được các hàm tính toán và đếm có điều kiện cơ bản trong bảng tính.'
      ],
      [
        'B3', 'Vận dụng cao', 'ES',
        'Hãy đề xuất 02 biện pháp cụ thể và khả thi để bảo vệ thông tin tài khoản và dữ liệu cá nhân khi sử dụng máy tính công cộng tại phòng máy trường học hoặc quán Internet.',
        '', '', '', '',
        '',
        '1. Không lưu thông tin đăng nhập trên trình duyệt và luôn đăng xuất khỏi mọi tài khoản sau khi hoàn thành công việc (0.5 điểm); 2. Sử dụng chế độ duyệt web ẩn danh, không cắm thiết bị lưu trữ USB không rõ nguồn gốc và xóa lịch sử duyệt web trước khi rời máy (0.5 điểm).',
        'Đề xuất được các giải pháp an toàn thông tin cá nhân và dữ liệu trong môi trường số.'
      ]
    ];
  }

  function getSamplePpctRows(grade = 9, subject = 'Tin học') {
    return [
      ['Tuần', 'Tên bài học', 'Số tiết', 'Tiết PPCT', 'Yêu cầu cần đạt', 'Phát triển năng lực số & AI', 'Ghi chú'],
      [
        'Tuần 1', 'Bài 1: Thông tin trong môi trường số', '1', 'Tiết 1',
        'Nhận biết được các dạng thông tin số và đặc điểm của thông tin trên mạng Internet.\nHiểu được tầm quan trọng của việc chọn lọc thông tin đáng tin cậy.',
        'Năng lực tìm kiếm, đánh giá độ tin cậy của thông tin số (NLS 1.2)',
        'Nội dung cốt lõi'
      ],
      [
        'Tuần 2', 'Bài 2: Sử dụng dịch vụ lưu trữ đám mây', '2', 'Tiết 2, 3',
        'Thực hiện được việc tải lên, tải xuống và tổ chức tệp tin trên dịch vụ lưu trữ đám mây.\nBiết cách thiết lập quyền truy cập và chia sẻ tệp an toàn cho người khác.',
        'Hợp tác và chia sẻ tài nguyên qua công nghệ đám mây (NLS 2.1)',
        'Thực hành tại phòng máy'
      ],
      [
        'Tuần 3', 'Bài 3: Thực hành bảo mật dữ liệu cá nhân', '1', 'Tiết 4',
        'Nhận diện được các rủi ro lộ lọt thông tin khi sử dụng Internet công cộng.\nĐề xuất và thực hiện được các thói quen bảo đảm an toàn dữ liệu.',
        'Bảo đảm an toàn danh tính số và dữ liệu cá nhân (NLS 4.1)',
        'Kiểm tra đánh giá thường xuyên'
      ]
    ];
  }

  function getSampleMatrixRows(grade = 9, subject = 'Tin học') {
    return [
      ['BẢNG 1: KHUNG MA TRẬN 2D ĐỀ KIỂM TRA ĐỊNH KỲ'],
      ['STT', 'Chủ đề', 'Mã bài', 'Tên bài học', 'Số tiết', 'TN_Biet', 'TN_Hieu', 'TN_VD', 'DS_Biet', 'DS_Hieu', 'DS_VD', 'TL_VD', 'TL_VDC', 'Tong_Cau', 'Tong_Diem'],
      ['1', 'Chủ đề 1', 'B1', 'Thông tin trong môi trường số', '2', '4', '2', '0', '1', '0', '0', '0', '0', '7', '2.0'],
      ['2', 'Chủ đề 2', 'B2', 'Lưu trữ đám mây và chia sẻ', '3', '3', '3', '1', '0', '1', '1', '1', '0', '10', '4.5'],
      ['3', 'Chủ đề 3', 'B3', 'An toàn thông tin dữ liệu', '3', '2', '2', '1', '0', '0', '0', '0', '1', '6', '3.5'],
      [''],
      ['BẢNG 2: BẢN ĐẶC TẢ TỪNG CÂU HỎI'],
      ['Câu', 'Phần', 'Dạng câu', 'Mã bài', 'Mức độ', 'Yêu cầu cần đạt / Mục tiêu đánh giá cụ thể', 'Điểm'],
      ['Câu 1', 'Phần 1', 'MC', 'B1', 'Biết', 'Nhận biết được các thiết bị vào - ra cơ bản của hệ thống máy tính.', '0.25'],
      ['Câu 2', 'Phần 1', 'MC', 'B1', 'Hiểu', 'Hiểu được vai trò và lợi ích của dịch vụ lưu trữ đám mây.', '0.25'],
      ['Câu 1', 'Phần 2', 'YN', 'B2', 'Vận dụng', 'Vận dụng quy tắc phân quyền chia sẻ tệp an toàn trên Google Drive.', '1.0'],
      ['Câu 1', 'Phần 3', 'ES', 'B3', 'Vận dụng cao', 'Đề xuất giải pháp bảo vệ dữ liệu cá nhân trên máy tính công cộng.', '1.0']
    ];
  }

  // =========================================================================
  // 9. BỘ HƯỚNG DẪN & TẠO PROMPT AI THEO BÀI - MỤC TIÊU BÀI HỌC (YCCĐ)
  // =========================================================================
  function buildAiPromptByLesson(params) {
    const {
      grade = 9,
      subject = 'Tin học',
      lessonCode = 'B1',
      lessonName = 'Tên bài học',
      outcomes = [],
      part = 'ALL', // 'MC', 'YN', 'SHORT_ES', 'ALL'
      outputFormat = 'EXCEL', // 'EXCEL', 'JSON', 'MARKDOWN'
      count = 4
    } = params || {};

    const isThpt = Number(grade) >= 10;
    const g = Number(grade) || 9;
    const formattedOutcomes = (outcomes && outcomes.length)
      ? outcomes.map((o, idx) => `   ${idx + 1}. ${o}`).join('\n')
      : `   1. Nắm vững kiến thức và kỹ năng trọng tâm của ${lessonName}.`;

    let partInstruction = '';
    let tableColumnsHeader = '';

    if (part === 'MC') {
      partInstruction = `NHIỆM VỤ: Biên soạn ${count} câu hỏi Trắc nghiệm nhiều lựa chọn (MC - 4 phương án A, B, C, D) cho bài học này:
- Phân bổ mức độ nhận thức: Biết, Hiểu, Vận dụng bám sát từng Yêu cầu cần đạt (YCCĐ) bên trên.
- Mỗi câu hỏi gồm câu dẫn ngắn gọn, trong sáng + 4 phương án A, B, C, D. Độ dài các phương án tương đương nhau.
- TUYỆT ĐỐI KHÔNG dùng các phương án "Tất cả các đáp án trên đều đúng/sai", "Cả A và B đều đúng".
- Cung cấp lời giải thích chi tiết vì sao phương án đúng là đúng và vì sao 3 phương án còn lại sai.`;
    } else if (part === 'YN') {
      partInstruction = `NHIỆM VỤ: Biên soạn ${count} câu hỏi Đúng/Sai (YN - chuẩn Công văn 7991/BGDĐT-GDTrH):
- Mỗi câu gồm 01 đoạn dẫn ngữ liệu tình huống thực tế chung (dài ít nhất 25 ký tự) gắn liền với bài học.
- Kèm theo 4 lệnh hỏi / phát biểu a), b), c), d) độc lập nhau, tăng dần mức độ nhận thức (Biết -> Hiểu -> Vận dụng -> Vận dụng cao).
- TUYỆT ĐỐI KHÔNG để cả 4 ý cùng Đúng hoặc cả 4 ý cùng Sai (phải đan xen Đúng và Sai, ví dụ: Đ, S, Đ, S hoặc Đ, Đ, S, Đ).
- Lời giải thích rõ căn cứ tính Đúng/Sai của từng ý a, b, c, d.`;
    } else if (part === 'SHORT_ES') {
      partInstruction = `NHIỆM VỤ: Biên soạn câu hỏi Trả lời ngắn (SHORT) và Tự luận (ES):
- Dạng Trả lời ngắn (SHORT): Nêu rõ đơn vị tính và quy ước làm tròn. Đáp án ngắn gọn duy nhất (tối đa 4 ký tự nếu là số theo QĐ 764).
- Dạng Tự luận (ES): Nêu rõ tình huống thực tế, yêu cầu thực hiện và barem tiêu chí chấm (Rubric) chi tiết theo từng bước/ý (tổng 1.0 đến 2.0 điểm).`;
    } else {
      partInstruction = `NHIỆM VỤ: Biên soạn trọn gói một bộ câu hỏi hoàn chỉnh cho bài học này gồm đủ 3 phần:
1. Phần 1 (MC): 3 câu trắc nghiệm 4 lựa chọn (Biết, Hiểu, Vận dụng).
2. Phần 2 (YN): 1 câu Đúng/Sai gồm ngữ liệu tình huống thực tế chung + 4 ý a, b, c, d (chuẩn CV 7991, không để cả 4 ý cùng Đúng hoặc cùng Sai).
3. Phần 3: 1 câu Trả lời ngắn (SHORT) hoặc Tự luận (ES) kèm barem tiêu chí chấm.`;
    }

    let formatInstruction = '';
    if (outputFormat === 'EXCEL') {
      formatInstruction = `YÊU CẦU ĐỊNH DẠNG ĐẦU RA (DẠNG BẢNG EXCEL / TSV HOẶC MARKDOWN TABLE ĐỂ GIÁO VIÊN COPY DÁN THẲNG VÀO EXCEL):
Hãy xuất kết quả dưới dạng BẢNG gồm đúng 11 cột sau (ngăn cách bằng ký tự Tab hoặc bảng Markdown):
Cột 1: Mã bài (ghi "${lessonCode}")
Cột 2: Mức độ (Biết / Hiểu / Vận dụng / Vận dụng cao)
Cột 3: Dạng câu (MC / YN / SHORT / ES)
Cột 4: Nội dung câu hỏi (Câu hỏi MC/SHORT/ES hoặc Ngữ cảnh dẫn chung cho câu YN)
Cột 5: Phương án A / Ý a
Cột 6: Phương án B / Ý b
Cột 7: Phương án C / Ý c
Cột 8: Phương án D / Ý d
Cột 9: Đáp án đúng (Ghi "A", "B", "C" hoặc "D" cho MC; ghi "Đ, S, Đ, S" cho YN; ghi đáp án cho SHORT; để trống cho ES)
Cột 10: Hướng dẫn giải / Tiêu chí chấm (Giải thích chi tiết vì sao đúng/sai hoặc barem điểm)
Cột 11: Yêu cầu cần đạt (Gắn đúng YCCĐ tương ứng của bài)

CHỈ XUẤT TRỰC TIẾP BẢNG DỮ LIỆU, KHÔNG VIẾT LỜI MỞ ĐẦU HOẶC LỜI BÌNH BÊN NGOÀI.`;
    } else if (outputFormat === 'JSON') {
      formatInstruction = `YÊU CẦU ĐỊNH DẠNG ĐẦU RA (DẠNG JSON CHUẨN ĐỂ NHẬP TRỰC TIẾP VÀO HỆ THỐNG):
Xuất duy nhất 01 khối mã JSON hợp lệ cấu trúc:
{
  "bank": {
    "questions": [
      {
        "grade": ${g},
        "subject_name": "${subject}",
        "lesson_code": "${lessonCode}",
        "type": "MC",
        "level": "Biết",
        "question": "Nội dung câu hỏi...",
        "options": ["Phương án A", "Phương án B", "Phương án C", "Phương án D"],
        "correct": 0,
        "option_explanations": ["Giải thích A", "Giải thích B", "Giải thích C", "Giải thích D"],
        "learning_outcome": "Gắn đúng YCCĐ..."
      }
    ]
  }
}
CHỈ XUẤT ĐÚNG JSON HỢP LỆ TRONG KHỐI \`\`\`json ... \`\`\`, KHÔNG KÈM BÌNH LUẬN.`;
    } else {
      formatInstruction = `YÊU CẦU ĐỊNH DẠNG ĐẦU RA (DẠNG MARKDOWN CHUẨN):
### Câu 1:
Nội dung câu hỏi...
A. Phương án A
B. Phương án B
C. Phương án C
D. Phương án D
*Đáp án:* A
*Mức độ:* Biết
*Bài học:* ${lessonCode}
*Lời giải:* Giải thích rõ vì sao đúng...
*Yêu cầu cần đạt:* ${outcomes[0] || lessonName}

CHỈ XUẤT NỘI DUNG MARKDOWN, KHÔNG KÈM LỜI BÌNH.`;
    }

    return `Bạn là chuyên gia sư phạm và khảo thí môn ${subject} cấp ${isThpt ? 'THPT' : 'THCS'} (chương trình GDPT 2018 tại Trường Quốc tế Á Châu - Asian School).
Hãy giúp tôi biên soạn câu hỏi cho bài học sau:

Môn học: ${subject} - Khối: ${g}
Bài học: ${lessonCode} · ${lessonName}
Mục tiêu & Yêu cầu cần đạt (YCCĐ) theo chương trình:
${formattedOutcomes}

${partInstruction}

${formatInstruction}`;
  }

  // =========================================================================
  // EXPORT PUBLIC API
  // =========================================================================
  return {
    parseCsvText,
    parseXlsxBytes,
    readTableFile,
    toCsv,
    downloadCsv,
    parseQuestionsFromRows,
    parsePpctFromRows,
    getSampleBankRows,
    getSamplePpctRows,
    getSampleMatrixRows,
    buildAiPromptByLesson,
    stripAccents,
    norm
  };
});
