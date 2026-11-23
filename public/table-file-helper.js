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
  // Tách hướng chấm tự luận thành các tiêu chí theo mốc "(0,25 điểm)".
  // Mỗi tiêu chí kết thúc bằng mốc điểm; ý a), b) ở đầu dòng được ghi lại cho các tiêu chí cùng dòng.
  // Trả về [] nếu không tìm thấy mốc điểm hoặc tổng điểm khác 1.
  function parseRubricText(text) {
    const src = String(text || '').trim();
    if (!src) return [];
    const marker = /\((\d+(?:[.,]\d+)?)\s*điểm\)/gi;
    const items = [];
    src.split(/\r?\n/).forEach(line => {
      const labelMatch = line.trim().match(/^([a-dA-D])\)\s*/);
      const label = labelMatch ? labelMatch[1].toLowerCase() + ') ' : '';
      let last = 0, m;
      marker.lastIndex = 0;
      while ((m = marker.exec(line)) !== null) {
        let piece = line.slice(last, m.index + m[0].length).trim();
        piece = piece.replace(/^[\s;,.–\-•+]+/, '').replace(/^([a-dA-D])\)\s*/, '').trim();
        const points = Number(m[1].replace(',', '.'));
        if (piece && points > 0) items.push({ criterion: label + piece, points });
        last = m.index + m[0].length;
      }
    });
    const total = items.reduce((a, b) => a + b.points, 0);
    return items.length && Math.abs(total - 1) < 1e-9 ? items : [];
  }

  function parseQuestionsFromRows(rows, defaultGrade = 9, defaultSubject = 'Tin học') {
    if (!Array.isArray(rows) || !rows.length) return [];

    let headerIndex = -1;
    let colMap = {
      grade: -1,
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
        if (/^khoi\b|^khoi\s*lop|^lop\b|^grade\b/i.test(c)) { colMap.grade = idx; matches++; }
        else if (/ma\s*bai|bai\s*hoc|bai|lesson/i.test(c)) { colMap.lesson = idx; matches++; }
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
        else if (/nang\s*luc|thanh\s*phan\s*nang\s*luc|^nl\b|^nls\b|competenc/i.test(c)) { colMap.competency = idx; matches++; }
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
      const compRaw = getVal(colMap.competency);
      let competency = '';
      if (compRaw) {
        const mComp = compRaw.match(/\b(NL[a-e]|NL[A-E])\b/i);
        competency = mComp ? ('NL' + mComp[1].slice(2).toLowerCase()) : compRaw.trim();
      }

      // Chuẩn hóa mức độ nhận thức
      let level = 'Biết';
      const normLvl = stripAccents(lower(levelRaw));
      if (/van\s*dung\s*cao|vdc/i.test(normLvl)) level = 'Vận dụng cao';
      else if (/van\s*dung|vd/i.test(normLvl)) level = 'Vận dụng';
      else if (/hieu|thong\s*hieu|th/i.test(normLvl)) level = 'Hiểu';
      else if (/biet|nhan\s*biet|nb/i.test(normLvl)) level = 'Biết';

      // Chuẩn hóa mã bài học: giữ nguyên chữ hoa/thường (PPCT có mã như B8a, B10a);
      // máy chủ đối chiếu với PPCT không phân biệt hoa thường.
      let lessonCode = lessonRaw.trim();
      if (!/^([A-Za-z0-9_\-]+)$/.test(lessonCode)) {
        const m = lessonCode.match(/\b(B\d+[a-z]?|CD\d+|BAI\s*\d+[a-z]?)\b/i);
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

      let questionGrade = Number(defaultGrade) || 9;
      let hasExplicitRowGrade = false;
      if (colMap.grade >= 0) {
        const rawG = getVal(colMap.grade);
        const parsedG = Number(String(rawG).replace(/\D+/g, ''));
        if (parsedG >= 6 && parsedG <= 12) {
          questionGrade = parsedG;
          hasExplicitRowGrade = true;
        }
      }

      const id = `Q-IMPORT-${now}-${rIdx + 1}`;
      const baseQ = {
        id,
        grade: questionGrade,
        _hasExplicitRowGrade: hasExplicitRowGrade,
        subject_name: defaultSubject,
        lesson_code: lessonCode,
        level,
        type: qType,
        question: qText,
        learning_outcome: outcome || '',
        competency: competency || '',
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
        const parsedRubric = parseRubricText(explanation);
        baseQ.rubric = parsedRubric.length
          ? parsedRubric
          : [{ criterion: explanation || 'Nêu và thực hiện đúng yêu cầu đề bài.', points: 1.0 }];
        baseQ.equivalent_answer_policy = 'Chấp nhận cách diễn đạt hoặc cách làm khác nếu đúng bản chất và đủ ý.';
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
    const g = Number(grade) || 9;
    const isThpt = g >= 10;

    if (!isThpt) {
      // CẤP THCS (Khối 6, 7, 8, 9 · TT 22/2021): Chỉ gồm Trắc nghiệm 4 lựa chọn (MC) và Tự luận (ES).
      // TUYỆT ĐỐI KHÔNG CÓ Đúng/Sai (YN) và Trả lời ngắn (SHORT).
      const header = [
        'Mã bài', 'Mức độ', 'Dạng câu', 'Nội dung câu hỏi',
        'Phương án A', 'Phương án B', 'Phương án C', 'Phương án D',
        'Đáp án đúng', 'Hướng dẫn giải / Tiêu chí chấm', 'Yêu cầu cần đạt'
      ];

      if (g === 6) {
        return [
          header,
          [
            'B1', 'Biết', 'MC',
            'Thiết bị nào sau đây là thiết bị vào dùng để nhập dữ liệu chữ và số vào máy tính?',
            'Bàn phím (Keyboard)', 'Màn hình (Monitor)', 'Máy in (Printer)', 'Loa (Speaker)',
            'A',
            'Bàn phím là thiết bị vào dùng để nhập kí tự và dữ liệu vào máy tính. Màn hình, máy in và loa là các thiết bị ra.',
            'Nhận biết được các thiết bị vào - ra cơ bản của hệ thống máy tính.'
          ],
          [
            'B1', 'Hiểu', 'MC',
            'Đơn vị đo dung lượng thông tin nhỏ nhất trong máy tính lưu trữ một trong hai chữ số 0 hoặc 1 là gì?',
            'Byte (B)', 'Bit (b)', 'Kilobyte (KB)', 'Megabyte (MB)',
            'B',
            'Bit (viết tắt của binary digit) là đơn vị cơ bản và nhỏ nhất để đo dung lượng thông tin.',
            'Hiểu được các đơn vị đo dung lượng thông tin cơ bản.'
          ],
          [
            'B2', 'Vận dụng', 'MC',
            'Để bảo vệ máy tính và tài khoản cá nhân khỏi virus và các phần mềm độc hại, hành động nào sau đây là đúng đắn?',
            'Mở tất cả các tệp đính kèm gửi từ địa chỉ email không rõ nguồn gốc',
            'Cài đặt và cập nhật thường xuyên chương trình diệt virus có bản quyền',
            'Đặt mật khẩu tài khoản rất ngắn và đơn giản như "123456" cho dễ nhớ',
            'Tắt tính năng tường lửa bảo vệ của hệ điều hành khi lướt mạng',
            'B',
            'Cài đặt chương trình diệt virus giúp tự động phát hiện, ngăn chặn và loại bỏ mã độc xâm nhập.',
            'Vận dụng được các biện pháp an toàn cơ bản để bảo vệ máy tính và dữ liệu.'
          ],
          [
            'B3', 'Vận dụng cao', 'ES',
            'Em hãy giải thích vì sao cần phải định kì sao lưu các tệp dữ liệu học tập quan trọng trên máy tính và đề xuất 02 cách sao lưu an toàn, hiệu quả mà học sinh lớp 6 có thể thực hiện.',
            '', '', '', '',
            '',
            '1. Giải thích được sự cần thiết: phòng ngừa rủi ro hư hỏng ổ đĩa, nhiễm virus mã hóa hoặc vô tình xóa nhầm tệp (0.5 điểm).\n2. Đề xuất đúng 02 cách: sao chép lưu trữ sang thiết bị nhớ ngoài (ổ USB) hoặc đồng bộ lên dịch vụ lưu trữ đám mây của nhà trường/cá nhân (0.5 điểm).',
            'Đề xuất và thực hiện được các giải pháp sao lưu, bảo vệ dữ liệu cá nhân an toàn.'
          ]
        ];
      }

      if (g === 7) {
        return [
          header,
          [
            'B1', 'Biết', 'MC',
            'Thiết bị nào sau đây vừa đảm nhận chức năng của thiết bị vào, vừa đảm nhận chức năng của thiết bị ra?',
            'Bàn phím cơ', 'Màn hình cảm ứng (Touchscreen)', 'Chuột không dây', 'Máy quét ảnh (Scanner)',
            'B',
            'Màn hình cảm ứng vừa nhận thao tác chạm ngón tay (vào) vừa hiển thị hình ảnh kết quả (ra).',
            'Nhận biết và phân loại được các thiết bị vào - ra thông dụng.'
          ],
          [
            'B1', 'Hiểu', 'MC',
            'Mạng xã hội mang lại lợi ích nổi bật nào sau đây cho học sinh trong quá trình học tập và rèn luyện?',
            'Chia sẻ thông tin cá nhân và mật khẩu cho tất cả mọi người',
            'Kết nối bạn bè, tham gia nhóm học tập và trao đổi tri thức bổ ích',
            'Tải và cài đặt các trò chơi điện tử không rõ nguồn gốc',
            'Đăng tải các nội dung chưa được kiểm chứng để thu hút tương tác',
            'B',
            'Mạng xã hội là kênh giao lưu, hợp tác và chia sẻ tài liệu học tập hiệu quả nếu được sử dụng đúng cách.',
            'Hiểu được vai trò, lợi ích và trách nhiệm khi tham gia mạng xã hội.'
          ],
          [
            'B2', 'Vận dụng', 'MC',
            'Khi nhận được tin nhắn từ một tài khoản lạ kèm đường liên kết mời nhận quà tặng miễn phí trên mạng xã hội, hành vi ứng xử an toàn nhất là gì?',
            'Nhấp vào liên kết ngay để xem quà tặng và nhập số điện thoại',
            'Chuyển tiếp đường liên kết cho bạn bè trong lớp để cùng nhận thưởng',
            'Không nhấp vào liên kết, chặn tài khoản lạ và thông báo cho người lớn/thầy cô',
            'Cung cấp mã xác thực OTP ngân hàng của gia đình theo hướng dẫn',
            'C',
            'Đường liên kết lạ có thể chứa mã độc đánh cắp tài khoản hoặc lừa đảo tài chính; không nhấp và chặn tài khoản là cách an toàn nhất.',
            'Thực hiện được các quy tắc bảo đảm an toàn khi giao tiếp trên không gian mạng.'
          ],
          [
            'B3', 'Vận dụng cao', 'ES',
            'Em hãy viết một đoạn văn ngắn (từ 5 đến 7 dòng) đưa ra lời khuyên cho các bạn học sinh về văn hóa ứng xử lịch sự trên mạng xã hội và nêu 02 biện pháp để bảo vệ quyền riêng tư cá nhân khi tham gia Internet.',
            '', '', '', '',
            '',
            '- Nêu được chuẩn mực giao tiếp văn minh: tôn trọng ý kiến người khác, không dùng từ ngữ xúc phạm hay lan truyền thông tin sai sự thật (0.5 điểm).\n- Nêu được 02 biện pháp bảo vệ quyền riêng tư: không công khai địa chỉ nhà/số điện thoại/lịch trình, đặt mật khẩu mạnh và không đăng ảnh riêng tư của người khác khi chưa xin phép (0.5 điểm).',
            'Hình thành ý thức, kỹ năng giao tiếp văn hóa và bảo vệ đời tư trong môi trường số.'
          ]
        ];
      }

      if (g === 8) {
        return [
          header,
          [
            'B1', 'Biết', 'MC',
            'Lịch sử phát triển của ngành công nghiệp máy tính điện tử từ trước đến nay được phân chia thành bao nhiêu thế hệ chính?',
            '3 thế hệ', '4 thế hệ', '5 thế hệ', '6 thế hệ',
            'C',
            'Máy tính điện tử đã trải qua 5 thế hệ chính: thế hệ đèn điện tử chân không, bóng bán dẫn, mạch tích hợp (IC), mạch tích hợp quy mô rất lớn (VLSI) và máy tính thông minh tích hợp AI.',
            'Nêu được các mốc phát triển chính của máy tính điện tử qua 5 thế hệ.'
          ],
          [
            'B2', 'Hiểu', 'MC',
            'Trong phần mềm bảng tính, công thức nào sau đây tính trung bình cộng các giá trị số trong khối ô từ B2 đến B8?',
            '=AVERAGE(B2:B8)', '=SUM(B2:B8)', '=COUNT(B2:B8)', '=TOTAL(B2:B8)',
            'A',
            'Hàm AVERAGE thực hiện tính trung bình cộng của các ô chứa giá trị số trong phạm vi chỉ định.',
            'Sử dụng được các hàm tính toán cơ bản trong phần mềm bảng tính.'
          ],
          [
            'B2', 'Vận dụng', 'MC',
            'Tại ô tính D2 có công thức =B2*C2. Khi thực hiện sao chép công thức từ ô D2 xuống ô D3, công thức tại ô D3 sẽ tự động biến đổi thành gì?',
            '=$B$2*$C$2', '=B3*C3', '=B2*C3', '=C2*D2',
            'B',
            'Do sử dụng địa chỉ tương đối, chỉ số hàng của các ô tham chiếu B2 và C2 sẽ tự động tăng tương ứng thêm 1 thành B3 và C3.',
            'Hiểu và vận dụng thành thạo cơ chế sao chép công thức với địa chỉ tương đối.'
          ],
          [
            'B3', 'Vận dụng cao', 'ES',
            'Để quản lí bảng điểm thi đua của các tổ trong lớp bằng bảng tính, em hãy nêu 02 nguyên tắc trình bày bảng tính khoa học, rõ ràng và nêu tên các hàm cần dùng để tìm điểm cao nhất, điểm thấp nhất và điểm trung bình của cả lớp.',
            '', '', '', '',
            '',
            '1. Nêu 02 nguyên tắc trình bày: tiêu đề cột rõ ràng, định dạng kiểu dữ liệu đúng (số thập phân, căn lề), kẻ đường viền và phân biệt màu sắc hợp lí (0.5 điểm).\n2. Nêu đúng các hàm tương ứng: hàm =MAX(...) để tìm điểm cao nhất, hàm =MIN(...) để tìm điểm thấp nhất và hàm =AVERAGE(...) để tính điểm trung bình (0.5 điểm).',
            'Vận dụng bảng tính điện tử để giải quyết bài toán quản lí dữ liệu học tập thực tế.'
          ]
        ];
      }

      // Mặc định Khối 9 (THCS)
      return [
        header,
        [
          'B1', 'Biết', 'MC',
          'Thiết bị mạng nào sau đây có chức năng định tuyến, kết nối các mạng máy tính khác nhau và chuyển tiếp các gói tin ra môi trường Internet toàn cầu?',
          'Bộ định tuyến (Router)', 'Bộ chuyển mạch (Switch)', 'Bộ lặp tín hiệu (Repeater)', 'Điểm truy cập không dây (Access Point)',
          'A',
          'Bộ định tuyến (Router) là thiết bị kết nối mạng nội bộ (LAN) với mạng Internet bên ngoài và định tuyến lưu lượng dữ liệu.',
          'Nhận biết được chức năng và vai trò của các thiết bị mạng thông dụng.'
        ],
        [
          'B1', 'Hiểu', 'MC',
          'Hành vi nào sau đây vi phạm quyền tác giả và quyền sở hữu trí tuệ trong việc sử dụng sản phẩm công nghệ số?',
          'Sử dụng phần mềm mã nguồn mở miễn phí theo giấy phép GNU/GPL',
          'Tải và cài đặt phần mềm bẻ khóa (crack) rồi phát tán cho nhiều người dùng',
          'Mua bản quyền phần mềm chính hãng từ trang chủ của nhà sản xuất',
          'Trích dẫn rõ nguồn gốc và tác giả khi sử dụng một đoạn tài liệu trên mạng',
          'B',
          'Hành vi giải mã, bẻ khóa và phát tán phần mềm lậu là vi phạm pháp luật về bản quyền và sở hữu trí tuệ.',
          'Hiểu và chấp hành nghiêm túc quy định pháp luật về bản quyền trong môi trường số.'
        ],
        [
          'B2', 'Vận dụng', 'MC',
          'Khi chia sẻ tệp tài liệu học tập của nhóm trên Google Drive, để các bạn có thể đọc và viết nhận xét góp ý nhưng không thể tự ý chỉnh sửa hay xóa nội dung gốc, em nên cấp quyền gì?',
          'Quyền Người xem (Viewer)', 'Quyền Người nhận xét (Commenter)', 'Quyền Người chỉnh sửa (Editor)', 'Quyền Chủ sở hữu (Owner)',
          'B',
          'Quyền "Người nhận xét" cho phép xem và thêm bình luận/góp ý bên lề tài liệu mà không làm thay đổi trực tiếp nội dung văn bản gốc.',
          'Vận dụng được kỹ năng phân quyền chia sẻ tài nguyên an toàn trên nền tảng đám mây.'
        ],
        [
          'B3', 'Vận dụng cao', 'ES',
          'Em hãy phân tích 02 nguy cơ khi sao chép toàn bộ nội dung hoặc hình ảnh từ Internet vào bài báo cáo học tập mà không trích dẫn nguồn. Từ đó, hãy đề xuất 02 hành động cụ thể để thể hiện tính liêm chính học thuật.',
          '', '', '', '',
          '',
          '1. Phân tích 02 nguy cơ: vi phạm quyền sở hữu trí tuệ của tác giả gốc, bị xử lí kỷ luật học vụ vì gian lận và đánh mất năng lực tư duy sáng tạo của bản thân (0.5 điểm).\n2. Đề xuất 02 hành động: luôn ghi rõ nguồn tham khảo (tên tác giả, liên kết, ngày truy cập) và tự diễn đạt lại ý tưởng bằng cách viết của chính mình (paraphrasing) kèm chú thích nguồn (0.5 điểm).',
          'Vận dụng và cam kết thực hành tính liêm chính học thuật, đạo đức trong kỉ nguyên số.'
        ]
      ];
    }

    // CẤP THPT (Khối 10, 11, 12 · CV 7991): Đầy đủ 4 dạng MC, YN (Đúng/Sai 4 ý), SHORT, ES
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
        'Trong dự án học tập, một nhóm học sinh sử dụng Google Drive để lưu trữ và chia sẻ tài liệu chung. Xét tính Đúng/Sai của các nhận định sau:',
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
    const g = Number(grade) || 9;
    const isThpt = g >= 10;
    const header = ['Tuần', 'Tên bài học', 'Số tiết', 'Tiết PPCT', 'Yêu cầu cần đạt', 'Phát triển năng lực số & AI', 'Ghi chú'];

    if (!isThpt) {
      if (g === 6) {
        return [
          header,
          [
            'Tuần 1', 'Bài 1: Thông tin và dữ liệu trong đời sống', '1', 'Tiết 1',
            'Nhận biết được thông tin và dữ liệu trong các tình huống thực tế.\nBiết được các dạng thông tin cơ bản: văn bản, hình ảnh, âm thanh.',
            'Năng lực nhận diện và thu nhận thông tin số (NLS 1.1)',
            'Nội dung cốt lõi'
          ],
          [
            'Tuần 2', 'Bài 2: Biểu diễn thông tin trong máy tính', '1', 'Tiết 2',
            'Hiểu được vai trò của hai kí hiệu 0 và 1 (bit) trong biểu diễn thông tin.\nBiết được các đơn vị đo dung lượng thông tin cơ bản: B, KB, MB, GB.',
            'Hiểu nguyên lí lưu trữ dữ liệu số (NLS 1.2)',
            'Nội dung cốt lõi'
          ],
          [
            'Tuần 3', 'Bài 3: Thực hành sao lưu và bảo vệ tệp tin', '2', 'Tiết 3, 4',
            'Thực hiện được việc quản lí thư mục và tệp tin trên máy tính.\nBiết cách sao lưu dữ liệu quan trọng sang thiết bị lưu trữ ngoài hoặc đám mây.',
            'Quản trị dữ liệu và an toàn thiết bị số (NLS 4.1)',
            'Thực hành tại phòng máy'
          ]
        ];
      }
      if (g === 7) {
        return [
          header,
          [
            'Tuần 1', 'Bài 1: Thiết bị vào và thiết bị ra của máy tính', '1', 'Tiết 1',
            'Nhận biết và phân loại được các thiết bị vào - ra thông dụng.\nBiết cách kết nối an toàn các thiết bị ngoại vi với máy tính.',
            'Sử dụng và quản lí thiết bị phần cứng (NLS 1.1)',
            'Nội dung cốt lõi'
          ],
          [
            'Tuần 2', 'Bài 2: Mạng xã hội và giao tiếp trên Internet', '1', 'Tiết 2',
            'Hiểu được vai trò của mạng xã hội trong trao đổi tri thức và học tập.\nNhận biết các nguy cơ rủi ro khi chia sẻ thông tin cá nhân trên mạng.',
            'Giao tiếp và cộng tác số có trách nhiệm (NLS 2.1)',
            'Nội dung cốt lõi'
          ],
          [
            'Tuần 3', 'Bài 3: Văn hóa ứng xử trên không gian mạng', '2', 'Tiết 3, 4',
            'Thực hiện được các quy tắc ứng xử văn minh, tôn trọng người khác trên mạng.\nBiết phòng tránh các hành vi lừa đảo và bảo vệ quyền riêng tư cá nhân.',
            'Bảo vệ danh tính số và an toàn thông tin (NLS 4.2)',
            'Thực hành phòng máy'
          ]
        ];
      }
      if (g === 8) {
        return [
          header,
          [
            'Tuần 1', 'Bài 1: Lịch sử phát triển của máy tính điện tử', '1', 'Tiết 1',
            'Nêu được các mốc phát triển chính của máy tính qua 5 thế hệ.\nHiểu được vai trò của mạch tích hợp và sự xuất hiện của trí tuệ nhân tạo.',
            'Hiểu biết tổng quan công nghệ số (NLS 1.1)',
            'Nội dung cốt lõi'
          ],
          [
            'Tuần 2', 'Bài 2: Thông tin trong môi trường số và bản quyền', '1', 'Tiết 2',
            'Nhận biết được đặc điểm của thông tin số: dễ phát tán, khó kiểm soát.\nHiểu và tôn trọng bản quyền khi sử dụng tài nguyên thông tin trên mạng.',
            'Đánh giá thông tin và liêm chính số (NLS 1.2)',
            'Nội dung cốt lõi'
          ],
          [
            'Tuần 3', 'Bài 3: Xử lí dữ liệu với phần mềm bảng tính', '2', 'Tiết 3, 4',
            'Sử dụng thành thạo các hàm tính toán SUM, AVERAGE, MAX, MIN trong bảng tính.\nVận dụng được địa chỉ tương đối và tuyệt đối khi sao chép công thức.',
            'Phân tích và trực quan hóa dữ liệu số (NLS 3.1)',
            'Thực hành tại phòng máy'
          ]
        ];
      }
      // Khối 9
      return [
        header,
        [
          'Tuần 1', 'Bài 1: Thiết bị mạng và các dịch vụ Internet', '1', 'Tiết 1',
          'Nhận biết được vai trò và chức năng của Router, Switch, Modem trong mạng.\nHiểu được cơ chế truyền tải thông tin qua mạng Internet.',
          'Kết nối và hạ tầng mạng số (NLS 1.1)',
          'Nội dung cốt lõi'
        ],
        [
          'Tuần 2', 'Bài 2: Quyền tác giả và đạo đức trong môi trường số', '1', 'Tiết 2',
          'Hiểu các quy định pháp luật cơ bản về quyền tác giả đối với phần mềm và nội dung số.\nNhận diện hành vi xâm phạm bản quyền và đề xuất giải pháp ứng xử chuẩn mực.',
          'Đạo đức, pháp luật và liêm chính học thuật (NLS 4.1)',
          'Nội dung cốt lõi'
        ],
        [
          'Tuần 3', 'Bài 3: Lưu trữ đám mây và cộng tác làm việc nhóm', '2', 'Tiết 3, 4',
          'Thực hiện được việc tổ chức thư mục, chia sẻ và phân quyền tệp tin trên Google Drive.\nCộng tác soạn thảo văn bản và thuyết trình trực tuyến an toàn, hiệu quả.',
          'Cộng tác số và quản trị tài nguyên đám mây (NLS 2.2)',
          'Thực hành tại phòng máy'
        ]
      ];
    }

    // Khối 10, 11, 12 THPT
    return [
      header,
      [
        'Tuần 1', 'Bài 1: Dữ liệu, thông tin và tri thức trong kỉ nguyên số', '1', 'Tiết 1',
        'Phân biệt được dữ liệu, thông tin và tri thức.\nNêu được vai trò của tri thức và các công nghệ thu thập dữ liệu lớn.',
        'Năng lực xử lí dữ liệu số nâng cao (NLS 1.1)',
        'Mục II.1 cốt lõi'
      ],
      [
        'Tuần 2', 'Bài 2: Mạng máy tính và điện toán đám mây', '2', 'Tiết 2, 3',
        'Phân tích được kiến trúc mạng Internet và các dịch vụ điện toán đám mây.\nThực hiện phân quyền, chia sẻ tài nguyên an toàn trên môi trường số.',
        'Cộng tác và kiến trúc đám mây (NLS 2.1)',
        'Mục II.1 cốt lõi'
      ],
      [
        'Tuần 3', 'Chuyên đề 1: Thực hành thiết kế và lập trình ứng dụng số', '2', 'Tiết 4, 5',
        'Xây dựng được kịch bản thuật toán và cài đặt chương trình giải quyết bài toán thực tiễn.\nKiểm thử và đánh giá độ phức tạp của giải thuật.',
        'Tư duy tính toán và sáng tạo thuật toán (NLS 3.2)',
        'Chuyên đề lựa chọn'
      ]
    ];
  }

  function getSampleMatrixRows(grade = 9, subject = 'Tin học') {
    const g = Number(grade) || 9;
    const isThpt = g >= 10;

    if (!isThpt) {
      // CẤP THCS (Khối 6, 7, 8, 9 · TT 22/2021): Tỉ lệ 70% TN (28 câu = 7.0đ) + 30% TL (3 câu = 3.0đ).
      // TUYỆT ĐỐI KHÔNG CÓ CỘT ĐÚNG/SAI (DS_Biet, DS_Hieu, DS_VD)!
      return [
        ['BẢNG 1: KHUNG MA TRẬN 2D ĐỀ KIỂM TRA ĐỊNH KỲ (CẤP THCS · TT 22/2021)'],
        ['STT', 'Chủ đề', 'Mã bài', 'Tên bài học', 'Số tiết', 'TN_Biet', 'TN_Hieu', 'TN_VD', 'TL_VD', 'TL_VDC', 'Tong_Cau', 'Tong_Diem'],
        ['1', 'Chủ đề 1: Máy tính và cộng đồng', 'B1', 'Thế giới kĩ thuật số', '2', '8', '4', '0', '0', '0', '12', '3.0'],
        ['2', 'Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', 'B2', 'Lưu trữ và xử lí dữ liệu số', '3', '5', '5', '2', '1', '0', '13', '4.5'],
        ['3', 'Chủ đề 3: Đạo đức, pháp luật và văn hóa trong môi trường số', 'B3', 'An toàn và đạo đức số', '3', '3', '1', '0', '1', '1', '6', '2.5'],
        [''],
        ['BẢNG 2: BẢN ĐẶC TẢ TỪNG CÂU HỎI (CẤP THCS · TT 22/2021)'],
        ['Câu', 'Phần', 'Dạng câu', 'Mã bài', 'Mức độ', 'Yêu cầu cần đạt / Mục tiêu đánh giá cụ thể', 'Điểm'],
        ['Câu 1-16', 'Phần 1', 'MC', 'B1', 'Biết', 'Nhận biết được các khái niệm, thiết bị số và công cụ cơ bản của hệ thống máy tính.', '0.25'],
        ['Câu 17-26', 'Phần 1', 'MC', 'B2', 'Hiểu', 'Giải thích được các nguyên lí xử lí thông tin, tổ chức và lưu trữ dữ liệu an toàn.', '0.25'],
        ['Câu 27-28', 'Phần 1', 'MC', 'B2', 'Vận dụng', 'Vận dụng các thao tác công nghệ số để tìm kiếm và chia sẻ tài nguyên hợp lệ.', '0.25'],
        ['Câu 1', 'Phần 2', 'ES', 'B2', 'Vận dụng', 'Vận dụng phần mềm ứng dụng để xử lí và quản lí bài toán thực tế trong học tập.', '1.0'],
        ['Câu 2', 'Phần 2', 'ES', 'B3', 'Vận dụng', 'Đề xuất giải pháp bảo vệ dữ liệu cá nhân và an toàn thông tin khi tham gia Internet.', '1.0'],
        ['Câu 3', 'Phần 2', 'ES', 'B3', 'Vận dụng cao', 'Phân tích các tình huống đạo đức số và thực hành liêm chính học thuật trong kỉ nguyên số.', '1.0']
      ];
    }

    // CẤP THPT (Khối 10, 11, 12 · CV 7991): Đầy đủ các cột TN, Đúng/Sai, Tự luận
    return [
      ['BẢNG 1: KHUNG MA TRẬN 2D ĐỀ KIỂM TRA ĐỊNH KỲ (CẤP THPT · CV 7991)'],
      ['STT', 'Chủ đề', 'Mã bài', 'Tên bài học', 'Số tiết', 'TN_Biet', 'TN_Hieu', 'TN_VD', 'DS_Biet', 'DS_Hieu', 'DS_VD', 'TL_VD', 'TL_VDC', 'Tong_Cau', 'Tong_Diem'],
      ['1', 'Chủ đề A. Máy tính và xã hội tri thức (Mục II.1 cốt lõi)', 'B1', 'Thông tin và xử lí thông tin số', '2', '6', '4', '0', '1', '0', '0', '0', '0', '11', '3.5'],
      ['2', 'Chủ đề B. Mạng máy tính và Internet (Mục II.1 cốt lõi)', 'B2', 'Mạng máy tính và an toàn thông tin', '3', '4', '3', '2', '0', '1', '1', '1', '0', '12', '4.75'],
      ['3', 'Chủ đề D. Đạo đức, pháp luật và văn hóa trong môi trường số (Mục II.1 cốt lõi)', 'B3', 'Ứng xử nhân văn và bản quyền số', '2', '0', '0', '0', '0', '0', '0', '1', '1', '2', '1.75'],
      [''],
      ['BẢNG 2: BẢN ĐẶC TẢ TỪNG CÂU HỎI (CẤP THPT · CV 7991)'],
      ['Câu', 'Phần', 'Dạng câu', 'Mã bài', 'Mức độ', 'Yêu cầu cần đạt / Mục tiêu đánh giá cụ thể', 'Điểm'],
      ['Câu 1-10', 'Phần 1', 'MC', 'B1', 'Biết', 'Nhận biết được các khái niệm về thông tin, dữ liệu và xử lí thông tin số.', '0.25'],
      ['Câu 11-19', 'Phần 1', 'MC', 'B2', 'Hiểu', 'Phân tích được quy trình truyền tải, bảo mật và kết nối mạng máy tính.', '0.25'],
      ['Câu 1', 'Phần 2', 'YN', 'B1', 'Biết', 'Đánh giá tính Đúng/Sai của các mệnh đề về biểu diễn thông tin và mã hóa dữ liệu.', '1.0'],
      ['Câu 2', 'Phần 2', 'YN', 'B2', 'Hiểu', 'Đánh giá tính Đúng/Sai của các nhận định về giao thức mạng và phân quyền dữ liệu đám mây.', '1.0'],
      ['Câu 3', 'Phần 2', 'YN', 'B2', 'Vận dụng', 'Vận dụng các nguyên tắc an ninh mạng để nhận diện mã độc và phòng chống tấn công lừa đảo.', '1.0'],
      ['Câu 1', 'Phần 3', 'ES', 'B2', 'Vận dụng', 'Xây dựng phương án kết nối mạng an toàn và tối ưu hóa tài nguyên cho doanh nghiệp nhỏ.', '0.75'],
      ['Câu 2', 'Phần 3', 'ES', 'B3', 'Vận dụng', 'Đề xuất giải pháp bảo vệ quyền tác giả và quyền riêng tư cá nhân trong môi trường số.', '0.75'],
      ['Câu 3', 'Phần 3', 'ES', 'B3', 'Vận dụng cao', 'Phân tích tác động xã hội của trí tuệ nhân tạo và đưa ra khuyến nghị đạo đức sử dụng AI có trách nhiệm.', '0.75']
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

    const g = Number(grade) || 9;
    const isThpt = g >= 10;

    // Nếu cấp THCS chọn YN, tự động đổi sang MC vì THCS không có dạng Đúng/Sai YN
    let effectivePart = part;
    if (!isThpt && effectivePart === 'YN') {
      effectivePart = 'MC';
    }

    const formattedOutcomes = (outcomes && outcomes.length)
      ? outcomes.map((o, idx) => `   ${idx + 1}. ${o}`).join('\n')
      : `   1. Nắm vững kiến thức và kỹ năng trọng tâm của ${lessonName}.`;

    let gradePolicyNotice = '';
    if (!isThpt) {
      gradePolicyNotice = `LƯU Ý QUY CHUẨN ĐẶC BIỆT CẤP THCS (KHỐI ${g} · THEO THÔNG TƯ 22/2021/TT-BGDĐT):
- Đề kiểm tra và đề cương ôn tập cấp THCS TUYỆT ĐỐI KHÔNG SỬ DỤNG dạng câu hỏi trắc nghiệm Đúng/Sai (YN).
- Cấu trúc đề chuẩn Á Châu cấp THCS chỉ gồm 2 phần: Phần 1 Trắc nghiệm nhiều lựa chọn (MC - 4 phương án A, B, C, D) và Phần 2 Tự luận / Thực hành (ES). Tỉ lệ chuẩn 70% Trắc nghiệm (7.0 điểm) + 30% Tự luận (3.0 điểm).\n\n`;
    }

    let partInstruction = '';
    if (effectivePart === 'MC') {
      partInstruction = `NHIỆM VỤ: Biên soạn ${count} câu hỏi Trắc nghiệm nhiều lựa chọn (MC - 4 phương án A, B, C, D) cho bài học này:
- Phân bổ mức độ nhận thức: Biết, Hiểu, Vận dụng bám sát từng Yêu cầu cần đạt (YCCĐ) bên trên.
- Mỗi câu hỏi gồm câu dẫn ngắn gọn, trong sáng + 4 phương án A, B, C, D. Độ dài các phương án tương đương nhau.
- TUYỆT ĐỐI KHÔNG dùng các phương án "Tất cả các đáp án trên đều đúng/sai", "Cả A và B đều đúng".
- Cung cấp lời giải thích chi tiết vì sao phương án đúng là đúng và vì sao 3 phương án còn lại sai.`;
    } else if (effectivePart === 'YN') {
      partInstruction = `NHIỆM VỤ: Biên soạn ${count} câu hỏi Đúng/Sai (YN - chuẩn Công văn 7991/BGDĐT-GDTrH cấp THPT):
- Mỗi câu gồm 01 đoạn dẫn ngữ liệu tình huống thực tế chung (dài ít nhất 25 ký tự) gắn liền với bài học.
- Kèm theo 4 lệnh hỏi / phát biểu a), b), c), d) độc lập nhau, tăng dần mức độ nhận thức (Biết -> Hiểu -> Vận dụng -> Vận dụng cao).
- TUYỆT ĐỐI KHÔNG để cả 4 ý cùng Đúng hoặc cả 4 ý cùng Sai (phải đan xen Đúng và Sai, ví dụ: Đ, S, Đ, S hoặc Đ, Đ, S, Đ).
- Lời giải thích rõ căn cứ tính Đúng/Sai của từng ý a, b, c, d.`;
    } else if (effectivePart === 'SHORT_ES') {
      if (isThpt) {
        partInstruction = `NHIỆM VỤ: Biên soạn câu hỏi Trả lời ngắn (SHORT) và Tự luận (ES):
- Dạng Trả lời ngắn (SHORT): Nêu rõ đơn vị tính và quy ước làm tròn. Đáp án ngắn gọn duy nhất (tối đa 4 ký tự nếu là số theo QĐ 764).
- Dạng Tự luận (ES): Nêu rõ tình huống thực tế, yêu cầu thực hiện và barem tiêu chí chấm (Rubric) chi tiết theo từng bước/ý (tổng 0.75 đến 1.5 điểm).`;
      } else {
        partInstruction = `NHIỆM VỤ: Biên soạn câu hỏi Tự luận / Thực hành (ES) cho cấp THCS:
- Dạng Tự luận (ES): Nêu rõ tình huống thực tế gắn liền với bài học, yêu cầu học sinh giải quyết vấn đề hoặc viết đoạn văn/thao tác bảng tính.
- Kèm theo Barem tiêu chí chấm điểm (Rubric) chi tiết cho từng ý (tổng điểm 1.0 đến 2.0 điểm).`;
      }
    } else {
      // ALL
      if (isThpt) {
        partInstruction = `NHIỆM VỤ: Biên soạn trọn gói một bộ câu hỏi hoàn chỉnh cho bài học này gồm đủ 3 phần (chuẩn CV 7991):
1. Phần 1 (MC): 3 câu trắc nghiệm 4 lựa chọn (Biết, Hiểu, Vận dụng).
2. Phần 2 (YN): 1 câu Đúng/Sai gồm ngữ liệu tình huống thực tế chung + 4 ý a, b, c, d (chuẩn CV 7991, không để cả 4 ý cùng Đúng hoặc cùng Sai).
3. Phần 3: 1 câu Trả lời ngắn (SHORT) hoặc Tự luận (ES) kèm barem tiêu chí chấm chi tiết.`;
      } else {
        partInstruction = `NHIỆM VỤ: Biên soạn trọn gói bộ câu hỏi chuẩn THCS (Thông tư 22/2021) cho bài học này gồm 2 phần:
1. Phần 1 (MC): 3 câu trắc nghiệm 4 lựa chọn A, B, C, D (1 câu Biết, 1 câu Hiểu, 1 câu Vận dụng).
2. Phần 2 (ES): 1 câu hỏi Tự luận / Thực hành (Vận dụng hoặc Vận dụng cao) kèm barem tiêu chí chấm điểm chi tiết (1.0 điểm).
(LƯU Ý NGHIÊM NGẶT: Cấp THCS tuyệt đối KHÔNG sinh câu hỏi Đúng/Sai YN).`;
      }
    }

    let formatInstruction = '';
    if (outputFormat === 'EXCEL') {
      if (isThpt) {
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
      } else {
        formatInstruction = `YÊU CẦU ĐỊNH DẠNG ĐẦU RA (DẠNG BẢNG EXCEL / TSV HOẶC MARKDOWN TABLE ĐỂ GIÁO VIÊN COPY DÁN THẲNG VÀO EXCEL):
Hãy xuất kết quả dưới dạng BẢNG gồm đúng 11 cột sau (ngăn cách bằng ký tự Tab hoặc bảng Markdown):
Cột 1: Mã bài (ghi "${lessonCode}")
Cột 2: Mức độ (Biết / Hiểu / Vận dụng / Vận dụng cao)
Cột 3: Dạng câu (MC / ES)
Cột 4: Nội dung câu hỏi (Câu hỏi trắc nghiệm MC hoặc đề bài tự luận ES)
Cột 5: Phương án A
Cột 6: Phương án B
Cột 7: Phương án C
Cột 8: Phương án D
Cột 9: Đáp án đúng (Ghi "A", "B", "C" hoặc "D" cho MC; để trống cho ES)
Cột 10: Hướng dẫn giải / Tiêu chí chấm (Giải thích chi tiết vì sao đúng/sai hoặc barem chấm điểm)
Cột 11: Yêu cầu cần đạt (Gắn đúng YCCĐ tương ứng của bài)

CHỈ XUẤT TRỰC TIẾP BẢNG DỮ LIỆU, KHÔNG VIẾT LỜI MỞ ĐẦU HOẶC LỜI BÌNH BÊN NGOÀI.`;
      }
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

${gradePolicyNotice}${partInstruction}

${formatInstruction}`;
  }

  function normalizeQuestionText(str) {
    return String(str == null ? '' : str)
      .normalize('NFC')
      .toLowerCase()
      .trim()
      .replace(/\s+/gu, ' ');
  }

  function classifyQuestionsForImport(incomingQuestions = [], existingQuestions = [], fallbackGrade = 9) {
    const defaultGrade = Number(fallbackGrade) || 9;
    const existingMap = new Map();
    for (const q of (existingQuestions || [])) {
      if (!q) continue;
      const g = Number(q.grade) || defaultGrade;
      const key = `${g}|${normalizeQuestionText(q.question)}`;
      if (!existingMap.has(key)) {
        existingMap.set(key, q);
      }
    }

    const seenInBatch = new Map();
    const items = (incomingQuestions || []).map((rawQ, idx) => {
      const q = { ...rawQ };
      q.grade = Number(q.grade) || defaultGrade;
      q.type = q.type || 'MC';
      const key = `${q.grade}|${normalizeQuestionText(q.question)}`;

      if (existingMap.has(key)) {
        const matched = existingMap.get(key);
        return {
          status: 'bank_dup',
          matchedId: matched.id || '',
          matchedLesson: matched.lesson_code || '',
          matchedOutcome: matched.learning_outcome || '',
          question: q,
          index: idx
        };
      } else if (seenInBatch.has(key)) {
        const firstIdx = seenInBatch.get(key);
        return {
          status: 'internal_dup',
          firstIndex: firstIdx,
          question: q,
          index: idx
        };
      } else {
        seenInBatch.set(key, idx);
        return {
          status: 'new',
          question: q,
          index: idx
        };
      }
    });

    const counts = {
      total: items.length,
      new: items.filter(x => x.status === 'new').length,
      bank_dup: items.filter(x => x.status === 'bank_dup').length,
      internal_dup: items.filter(x => x.status === 'internal_dup').length
    };

    return {
      items,
      counts,
      validNewQuestions: items.filter(x => x.status === 'new').map(x => x.question),
      nonInternalDupQuestions: items.filter(x => x.status !== 'internal_dup').map(x => x.question)
    };
  }

  function detectGradeFromFilename(filename) {
    if (!filename || typeof filename !== 'string') return null;
    const clean = stripAccents(filename).toLowerCase();
    // Patterns like: 'khoi 8', 'khoi_8', 'k8', 'lop 8', 'grade 8', 'tin 8', 'tin_hoc_8', 'tin8', etc.
    const m = clean.match(/(?:khoi|k|lop|grade|tin(?:[_\s\-]*hoc)?)[_\s\-]*([6-9]|1[0-2])(?:[_\s\-\.]|$)/i);
    if (m) {
      const num = Number(m[1]);
      if (num >= 6 && num <= 12) return num;
    }
    return null;
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
    parseRubricText,
    parsePpctFromRows,
    getSampleBankRows,
    getSamplePpctRows,
    getSampleMatrixRows,
    buildAiPromptByLesson,
    stripAccents,
    norm,
    normalizeQuestionText,
    classifyQuestionsForImport,
    detectGradeFromFilename
  };
});
