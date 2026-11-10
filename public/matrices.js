(function(root){
  'use strict';
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const E=escapeHtml;
  const profileLabel=p=>p==='GENERAL'?'Mẫu chung':p;
  const competencyLabel=c=>({TDLL:'TDLL · Tư duy và lập luận toán học',MHH:'MHH · Mô hình hóa toán học','GQVĐ':'GQVĐ · Giải quyết vấn đề toán học',GT:'GT · Giao tiếp toán học',SDCC:'SDCC · Sử dụng công cụ học toán'}[c]||c);
  function formatRefs(parts,format){const a=parts.map(p=>(format==='specification'?'Câu ':'')+p.number+(p.label||''));return '('+a.join(', ')+')'+(format==='specification'?'.':'');}
  function filterRecords(records,f={}){return records.filter(m=>(!f.grade||Number(m.grade)===Number(f.grade))&&(!f.status||m.status===f.status)&&(!f.year||m.school_year===f.year)&&(!f.period||m.exam_type===f.period));}
  function visibleActions(m){return m.status==='locked'?['preview','export','new-version','archive','use']:m.status==='archived'?['preview','export','new-version']:['save','review','preview','export','lock','archive'];}
  function packageSummary(p){const m=p.matrix||{};return `Khối ${m.grade} · ${m.profile} · phiên bản ${m.version}`;}
  const states={draft:'Bản nháp',review:'Chờ đối chiếu',locked:'Đã thống nhất · khóa',archived:'Đã lưu trữ'};
  const kinds={MC:'Trắc nghiệm 4 lựa chọn',YN:'Đúng/Sai',SHORT:'Trả lời ngắn',ES:'Tự luận / thực hành'};
  // B3: mẫu hồ sơ. THCS (trường): MC, tự luận; THPT (CV 7991) và mẫu chung: mọi dạng; KTTX/tùy chỉnh: allowed_kinds.
  const ALL_KINDS=['MC','YN','SHORT','ES'],PROFILE_KINDS={THCS:['MC','ES'],THPT:ALL_KINDS,GENERAL:ALL_KINDS};
  const DEFAULT_YN={0:'0',1:'0.1',2:'0.25',3:'0.5',4:'1'};
  function effectiveKinds(m){const chosen=m&&m.allowed_kinds;return Array.isArray(chosen)?ALL_KINDS.filter(k=>chosen.includes(k)):(PROFILE_KINDS[m&&m.profile]||ALL_KINDS).slice();}
  function setAllowedKinds(m,list){const next=ALL_KINDS.filter(k=>list.includes(k)),base=PROFILE_KINDS[m.profile]||ALL_KINDS;if(next.join()===base.join())delete m.allowed_kinds;else m.allowed_kinds=next;}
  function ynTable(m){const t=m&&m.scoring_policy&&m.scoring_policy.yn_table;return Object.fromEntries([0,1,2,3,4].map(n=>[n,String(t&&t[n]!==undefined?t[n]:DEFAULT_YN[n])]));}
  function setYnCoefficient(m,n,value){const t=ynTable(m);t[n]=String(value).trim().replace(',','.');
    if([0,1,2,3,4].every(k=>Number(t[k])===Number(DEFAULT_YN[k])))delete m.scoring_policy;
    else m.scoring_policy={yn_table:t,blank_counts_as:'wrong'};}  // cách làm tròn theo loại bài, không lưu ở ma trận
  function profileOptionsHtml(m,locked){
    const eff=effectiveKinds(m),dis=locked?' disabled':'',t=ynTable(m);
    const tolerance=m.profile==='THPT'?`<div class="form-grid"><div class="field"><label for="mx-ratio_tolerance">Ngưỡng cảnh báo tỉ lệ CV 7991 (± điểm, để trống = 0,5)</label><input id="mx-ratio_tolerance" data-field="ratio_tolerance" type="number" min="0" max="10" step="0.05" value="${E(m.ratio_tolerance??'')}"${dis}></div></div><p class="small muted">Ngưỡng nội bộ của tổ, chỉ để cảnh báo; CV 7991 ghi các tỉ lệ là "khoảng" và Phụ lục chỉ để tham khảo. Vận dụng + Vận dụng cao được quy đổi kỹ thuật khi so với tham khảo ba mức; các mức trong hồ sơ vẫn giữ riêng.</p>`:'';
    return tolerance+`<h3 id="mx-profile-kinds">Dạng câu được phép và cách chấm Đúng/Sai</h3><p class="muted">Mặc định theo mẫu: THCS gồm trắc nghiệm và tự luận; THPT theo CV 7991 gồm cả Đúng/Sai và trả lời ngắn. Với KTTX có thể chọn dạng khác; lựa chọn được lưu cùng ma trận và đề.</p>
    <div class="actions">${ALL_KINDS.map(k=>`<label class="inline-check"><input type="checkbox" data-allow-kind="${k}"${eff.includes(k)?' checked':''}${dis}> ${E(kinds[k])}</label>`).join('')}</div>
    ${eff.includes('YN')?`<div class="form-grid mx-yn-table">${[1,2,3,4].map(n=>`<div class="field"><label for="mx-yn-${n}">Đúng ${n} ý: hệ số</label><input id="mx-yn-${n}" data-yn-coef="${n}" inputmode="decimal" value="${E(String(t[n]).replace('.',','))}"${dis}></div>`).join('')}</div><p class="small muted">Điểm câu = điểm tối đa × hệ số. Ý bỏ trống, chọn cả hai hoặc lỗi tính là sai. Tổng bài: định kì làm tròn đến 0,1; thường xuyên làm tròn đến số nguyên (TT 22/2021, Điều 5; quy ước tổ).</p>`:''}`;
  }
  const periods={TX:'Thường xuyên',GK1:'Giữa học kì I',CK1:'Cuối học kì I',GK2:'Giữa học kì II',CK2:'Cuối học kì II'};
  const levels=['Biết','Hiểu','Vận dụng','Vận dụng cao'];
  function requirementLevelOptions(value){return levels.map(l=>opt(l,l,l===value)).join('');}
    const STANDARD_PRESETS = JSON.parse("{\"6\":{\"profile\":\"THCS\",\"grade\":6,\"exam_type\":\"GK1\",\"duration\":45,\"school_year\":\"2026-2027\",\"title\":\"Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn Tin học Khối 6\",\"owner_name\":\"Tổ Tin học Á Châu\",\"campus\":\"Cao Thắng\",\"total_points\":10,\"lessons\":[{\"lesson_code\":\"B1\",\"title\":\"Thông tin và dữ liệu\",\"topic\":\"Chủ đề 1. Máy tính và cộng đồng\"},{\"lesson_code\":\"B2\",\"title\":\"Xử lý thông tin\",\"topic\":\"Chủ đề 1. Máy tính và cộng đồng\"},{\"lesson_code\":\"B3\",\"title\":\"Thông tin trong máy tính\",\"topic\":\"Chủ đề 1. Máy tính và cộng đồng\"},{\"lesson_code\":\"B4\",\"title\":\"Mạng máy tính\",\"topic\":\"Chủ đề 2. Mạng máy tính và Internet\"},{\"lesson_code\":\"B5\",\"title\":\"Internet\",\"topic\":\"Chủ đề 2. Mạng máy tính và Internet\"}],\"requirements\":[{\"id\":\"R1\",\"lesson_code\":\"B1\",\"level\":\"Biết\",\"text\":\"Nhận biết được sự khác nhau giữa thông tin và dữ liệu.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R2\",\"lesson_code\":\"B1\",\"level\":\"Hiểu\",\"text\":\"Phân biệt được thông tin và vật mang tin.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R3\",\"lesson_code\":\"B1\",\"level\":\"Vận dụng\",\"text\":\"Nêu được ví dụ minh hoa mối quan hệ giữa thông tin và dữ liệu.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R4\",\"lesson_code\":\"B2\",\"level\":\"Biết\",\"text\":\"Nêu được các hoạt động cơ bản trong xử lí thông tin.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R5\",\"lesson_code\":\"B2\",\"level\":\"Hiểu\",\"text\":\"Giải thích được máy tính là công cụ hiệu quả để xử lí thông tin. Nêu được ví dụ minh hoa cụ thể.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R6\",\"lesson_code\":\"B2\",\"level\":\"Vận dụng\",\"text\":\"Giải thích được máy tính là công cụ hiệu quả để xử lí thông tin. Nêu được ví dụ minh hoa cụ thể.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R7\",\"lesson_code\":\"B3\",\"level\":\"Biết\",\"text\":\"Giải thích được việc có thể biểu diễn thông tin chỉ với hai kí hiệu 0 và 1.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R8\",\"lesson_code\":\"B3\",\"level\":\"Hiểu\",\"text\":\"Biết được bit là đơn vị nhỏ nhất trong lưu trữ thông tin.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R9\",\"lesson_code\":\"B3\",\"level\":\"Vận dụng\",\"text\":\"Nêu được tên và độ lớn của các đơn vị cơ bản đo dung lượng thông tin.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R10\",\"lesson_code\":\"B4\",\"level\":\"Biết\",\"text\":\"Nêu được mạng máy tính là gì và lợi ích của nó trong cuộc sống.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R11\",\"lesson_code\":\"B4\",\"level\":\"Hiểu\",\"text\":\"Kể được tên những thành phần chính của một mạng máy tính.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R12\",\"lesson_code\":\"B4\",\"level\":\"Vận dụng\",\"text\":\"Nêu được ví dụ cụ thể về trường hợp mạng không dây tiện dụng hơn mạng có dây.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R13\",\"lesson_code\":\"B5\",\"level\":\"Biết\",\"text\":\"Biết Internet là gì.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R14\",\"lesson_code\":\"B5\",\"level\":\"Hiểu\",\"text\":\"Nêu được một số đặc điểm chính của Internet.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R15\",\"lesson_code\":\"B5\",\"level\":\"Vận dụng\",\"text\":\"Nêu được một số lợi ích chính của Internet.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R16\",\"lesson_code\":\"B5\",\"level\":\"Vận dụng cao\",\"text\":\"Vận dụng kiến thức, kĩ năng tổng hợp để giải quyết tình huống thực tế.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"}],\"slots\":[{\"id\":\"S1\",\"kind\":\"MC\",\"number\":1,\"parts\":[{\"id\":\"P1\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S2\",\"kind\":\"MC\",\"number\":2,\"parts\":[{\"id\":\"P2\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S3\",\"kind\":\"MC\",\"number\":3,\"parts\":[{\"id\":\"P3\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S4\",\"kind\":\"MC\",\"number\":4,\"parts\":[{\"id\":\"P4\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S5\",\"kind\":\"MC\",\"number\":5,\"parts\":[{\"id\":\"P5\",\"label\":\"\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S6\",\"kind\":\"MC\",\"number\":6,\"parts\":[{\"id\":\"P6\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S7\",\"kind\":\"MC\",\"number\":7,\"parts\":[{\"id\":\"P7\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S8\",\"kind\":\"MC\",\"number\":8,\"parts\":[{\"id\":\"P8\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S9\",\"kind\":\"MC\",\"number\":9,\"parts\":[{\"id\":\"P9\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S10\",\"kind\":\"MC\",\"number\":10,\"parts\":[{\"id\":\"P10\",\"label\":\"\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S11\",\"kind\":\"MC\",\"number\":11,\"parts\":[{\"id\":\"P11\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S12\",\"kind\":\"MC\",\"number\":12,\"parts\":[{\"id\":\"P12\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S13\",\"kind\":\"MC\",\"number\":13,\"parts\":[{\"id\":\"P13\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S14\",\"kind\":\"MC\",\"number\":14,\"parts\":[{\"id\":\"P14\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S15\",\"kind\":\"MC\",\"number\":15,\"parts\":[{\"id\":\"P15\",\"label\":\"\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S16\",\"kind\":\"MC\",\"number\":16,\"parts\":[{\"id\":\"P16\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S17\",\"kind\":\"MC\",\"number\":17,\"parts\":[{\"id\":\"P17\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S18\",\"kind\":\"MC\",\"number\":18,\"parts\":[{\"id\":\"P18\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S19\",\"kind\":\"MC\",\"number\":19,\"parts\":[{\"id\":\"P19\",\"label\":\"\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S20\",\"kind\":\"MC\",\"number\":20,\"parts\":[{\"id\":\"P20\",\"label\":\"\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S21\",\"kind\":\"MC\",\"number\":21,\"parts\":[{\"id\":\"P21\",\"label\":\"\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S22\",\"kind\":\"MC\",\"number\":22,\"parts\":[{\"id\":\"P22\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S23\",\"kind\":\"MC\",\"number\":23,\"parts\":[{\"id\":\"P23\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S24\",\"kind\":\"MC\",\"number\":24,\"parts\":[{\"id\":\"P24\",\"label\":\"\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S25\",\"kind\":\"MC\",\"number\":25,\"parts\":[{\"id\":\"P25\",\"label\":\"\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S26\",\"kind\":\"MC\",\"number\":26,\"parts\":[{\"id\":\"P26\",\"label\":\"\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S27\",\"kind\":\"MC\",\"number\":27,\"parts\":[{\"id\":\"P27\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S28\",\"kind\":\"MC\",\"number\":28,\"parts\":[{\"id\":\"P28\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S29\",\"kind\":\"ES\",\"number\":1,\"parts\":[{\"id\":\"P29\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S30\",\"kind\":\"ES\",\"number\":2,\"parts\":[{\"id\":\"P30\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S31\",\"kind\":\"ES\",\"number\":3,\"parts\":[{\"id\":\"P31\",\"label\":\"\",\"requirement_id\":\"R16\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}}],\"indicator_catalog\":[]},\"7\":{\"profile\":\"THCS\",\"grade\":7,\"exam_type\":\"GK1\",\"duration\":45,\"school_year\":\"2026-2027\",\"title\":\"Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn Tin học Khối 7\",\"owner_name\":\"Tổ Tin học Á Châu\",\"campus\":\"Cao Thắng\",\"total_points\":10,\"lessons\":[{\"lesson_code\":\"B1\",\"title\":\"Thiết bị vào - ra\",\"topic\":\"Chủ đề 1. Máy tính và cộng đồng\"},{\"lesson_code\":\"B2\",\"title\":\"Phần mềm máy tính\",\"topic\":\"Chủ đề 1. Máy tính và cộng đồng\"},{\"lesson_code\":\"B3\",\"title\":\"Quản lý dữ liệu trong máy tính\",\"topic\":\"Chủ đề 1. Máy tính và cộng đồng\"},{\"lesson_code\":\"B4\",\"title\":\"Mạng xã hội và một số kênh trao đổi thông tin trên Internet\",\"topic\":\"Chủ đề 2. Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin\"},{\"lesson_code\":\"B5\",\"title\":\"Ứng xử trên mạng\",\"topic\":\"Chủ đề 3. Đạo đức, pháp luật và văn hóa trong môi trường số\"}],\"requirements\":[{\"id\":\"R1\",\"lesson_code\":\"B1\",\"level\":\"Biết\",\"text\":\"Biết và nhận ra được các thiết bị vào\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R2\",\"lesson_code\":\"B1\",\"level\":\"Hiểu\",\"text\":\"ra có nhiều loại, hình dạng khác nhau.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R3\",\"lesson_code\":\"B1\",\"level\":\"Vận dụng\",\"text\":\"Biết được chức năng của các thiết bị vào\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R4\",\"lesson_code\":\"B2\",\"level\":\"Biết\",\"text\":\"Giải thích được sơ lược chức năng điều khiển và quản lí của hệ điều hành.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R5\",\"lesson_code\":\"B2\",\"level\":\"Hiểu\",\"text\":\"Phân biệt được hệ điều hành với phần mềm ứng dụng.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R6\",\"lesson_code\":\"B2\",\"level\":\"Vận dụng\",\"text\":\"Nêu được tên một số phần mềm ứng dụng đã sử dụng.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R7\",\"lesson_code\":\"B3\",\"level\":\"Biết\",\"text\":\"Thao tác thành thạo với tệp và thư mục: tạo, sao chép, di chuyển, đổi tên, xoá tệp và thư mục.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R8\",\"lesson_code\":\"B3\",\"level\":\"Hiểu\",\"text\":\"Biết được tệp chương trình cũng là dữ liệu, có thể được lưu trữ trong máy tính.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R9\",\"lesson_code\":\"B3\",\"level\":\"Vận dụng\",\"text\":\"Nêu được ví dụ về biện pháp bảo vệ dữ liệu như sao lưu, phòng chống virus, ...\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R10\",\"lesson_code\":\"B4\",\"level\":\"Biết\",\"text\":\"Nêu được tên một kênh trao đổi thông tin thông dụng trên Internet và loại thông tin trao đổi trên kênh đó.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R11\",\"lesson_code\":\"B4\",\"level\":\"Hiểu\",\"text\":\"Nêu được một số chức năng cơ bản của mạng xã hội. Nhận biết được một số website là mạng xã hội.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R12\",\"lesson_code\":\"B4\",\"level\":\"Vận dụng\",\"text\":\"Sử dụng được một số chức năng cơ bản của một mạng xã hội để giao lưu và chiasẻ thông tin.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R13\",\"lesson_code\":\"B5\",\"level\":\"Biết\",\"text\":\"Thực hiện được giao tiếp qua mạng theo đúng quy tắc và bằng ngôn ngữ lịch sự, thể hiện ứng xử có văn hoa.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R14\",\"lesson_code\":\"B5\",\"level\":\"Hiểu\",\"text\":\"Nêu được ví dụ truy cập không hợp lệ vào các nguồn thông tin; biết cách ứng xử hợp lí khi gặp những thông tin trên mạng có nội dung xấu, không phù hợp lứa tuổi.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R15\",\"lesson_code\":\"B5\",\"level\":\"Vận dụng\",\"text\":\"Biết được tác hại của bệnh nghiện Internet, từ đó có ý thức phòng tránh.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"},{\"id\":\"R16\",\"lesson_code\":\"B5\",\"level\":\"Vận dụng cao\",\"text\":\"Vận dụng kiến thức, kĩ năng tổng hợp để giải quyết tình huống thực tế.\",\"ppct_outcome_index\":0,\"competency\":\"TDLL\"}],\"slots\":[{\"id\":\"S1\",\"kind\":\"MC\",\"number\":1,\"parts\":[{\"id\":\"P1\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S2\",\"kind\":\"MC\",\"number\":2,\"parts\":[{\"id\":\"P2\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S3\",\"kind\":\"MC\",\"number\":3,\"parts\":[{\"id\":\"P3\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S4\",\"kind\":\"MC\",\"number\":4,\"parts\":[{\"id\":\"P4\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S5\",\"kind\":\"MC\",\"number\":5,\"parts\":[{\"id\":\"P5\",\"label\":\"\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S6\",\"kind\":\"MC\",\"number\":6,\"parts\":[{\"id\":\"P6\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S7\",\"kind\":\"MC\",\"number\":7,\"parts\":[{\"id\":\"P7\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S8\",\"kind\":\"MC\",\"number\":8,\"parts\":[{\"id\":\"P8\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S9\",\"kind\":\"MC\",\"number\":9,\"parts\":[{\"id\":\"P9\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S10\",\"kind\":\"MC\",\"number\":10,\"parts\":[{\"id\":\"P10\",\"label\":\"\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S11\",\"kind\":\"MC\",\"number\":11,\"parts\":[{\"id\":\"P11\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S12\",\"kind\":\"MC\",\"number\":12,\"parts\":[{\"id\":\"P12\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S13\",\"kind\":\"MC\",\"number\":13,\"parts\":[{\"id\":\"P13\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S14\",\"kind\":\"MC\",\"number\":14,\"parts\":[{\"id\":\"P14\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S15\",\"kind\":\"MC\",\"number\":15,\"parts\":[{\"id\":\"P15\",\"label\":\"\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S16\",\"kind\":\"MC\",\"number\":16,\"parts\":[{\"id\":\"P16\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S17\",\"kind\":\"MC\",\"number\":17,\"parts\":[{\"id\":\"P17\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S18\",\"kind\":\"MC\",\"number\":18,\"parts\":[{\"id\":\"P18\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S19\",\"kind\":\"MC\",\"number\":19,\"parts\":[{\"id\":\"P19\",\"label\":\"\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S20\",\"kind\":\"MC\",\"number\":20,\"parts\":[{\"id\":\"P20\",\"label\":\"\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S21\",\"kind\":\"MC\",\"number\":21,\"parts\":[{\"id\":\"P21\",\"label\":\"\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S22\",\"kind\":\"MC\",\"number\":22,\"parts\":[{\"id\":\"P22\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S23\",\"kind\":\"MC\",\"number\":23,\"parts\":[{\"id\":\"P23\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S24\",\"kind\":\"MC\",\"number\":24,\"parts\":[{\"id\":\"P24\",\"label\":\"\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S25\",\"kind\":\"MC\",\"number\":25,\"parts\":[{\"id\":\"P25\",\"label\":\"\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S26\",\"kind\":\"MC\",\"number\":26,\"parts\":[{\"id\":\"P26\",\"label\":\"\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S27\",\"kind\":\"MC\",\"number\":27,\"parts\":[{\"id\":\"P27\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S28\",\"kind\":\"MC\",\"number\":28,\"parts\":[{\"id\":\"P28\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S29\",\"kind\":\"ES\",\"number\":1,\"parts\":[{\"id\":\"P29\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S30\",\"kind\":\"ES\",\"number\":2,\"parts\":[{\"id\":\"P30\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S31\",\"kind\":\"ES\",\"number\":3,\"parts\":[{\"id\":\"P31\",\"label\":\"\",\"requirement_id\":\"R16\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}}],\"indicator_catalog\":[]},\"8\":{\"profile\":\"THCS\",\"grade\":8,\"exam_type\":\"GK1\",\"duration\":45,\"school_year\":\"2026-2027\",\"title\":\"Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn Tin học Khối 8\",\"owner_name\":\"Tổ Tin học Á Châu\",\"campus\":\"Cao Thắng\",\"total_points\":10,\"lessons\":[{\"lesson_code\":\"B1\",\"title\":\"Lược sử công cụ tính toán\",\"topic\":\"Chủ đề 1: Máy tính và cộng đồng\"},{\"lesson_code\":\"B2\",\"title\":\"Thông tin trong môi trường số\",\"topic\":\"Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin\"},{\"lesson_code\":\"B3\",\"title\":\"Thực hành: Khai thác thông tin số\",\"topic\":\"Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin\"},{\"lesson_code\":\"B4\",\"title\":\"Đạo đức và văn hóa trong sử dụng kĩ thuật số\",\"topic\":\"Chủ đề 3: Đạo đức, pháp luật và văn hóa trong môi trường số\"},{\"lesson_code\":\"B12\",\"title\":\"Từ thuật toán đến chương trình\",\"topic\":\"Chủ đề 5: Giải quyết vấn đề với sự trợ giúp của máy tính\"}],\"requirements\":[{\"id\":\"R1\",\"lesson_code\":\"B1\",\"level\":\"Biết\",\"text\":\"Biết được sự ra đời của những chiếc máy tính đầu tiên và người đặt nền móng cho sự phát triển của máy tính; biết được các công nghệ sử dụng trong từng thế hệ máy tính.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R2\",\"lesson_code\":\"B1\",\"level\":\"Hiểu\",\"text\":\"Hiểu được đặc điểm của các máy tính trong cùng một giai đoạn; giải thích được sự phát triển của máy tính qua các thế hệ.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R3\",\"lesson_code\":\"B2\",\"level\":\"Biết\",\"text\":\"Biết được đặc điểm của thông tin số và phần mở rộng của các loại tập tin khác nhau.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R4\",\"lesson_code\":\"B2\",\"level\":\"Hiểu\",\"text\":\"Giải thích được vì sao thông tin số chiếm tỉ lệ rất lớn.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R5\",\"lesson_code\":\"B2\",\"level\":\"Vận dụng\",\"text\":\"Hiểu được đặc điểm của thông tin số, từ đó vận dụng vào thực tiễn để nâng cao chất lượng cuộc sống.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R6\",\"lesson_code\":\"B3\",\"level\":\"Biết\",\"text\":\"Nhận biết được thông tin nào đáng tin cậy và không đáng tin cậy.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R7\",\"lesson_code\":\"B3\",\"level\":\"Hiểu\",\"text\":\"Hiểu được thông tin có giá trị về mặt pháp lý.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R8\",\"lesson_code\":\"B3\",\"level\":\"Vận dụng\",\"text\":\"Tìm kiếm và cho ví dụ về thông tin hợp lý, đáng tin cậy.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R9\",\"lesson_code\":\"B4\",\"level\":\"Biết\",\"text\":\"Biết một số biểu hiện vi phạm đạo đức và pháp luật, biểu hiện thiếu văn hóa khi sử dụng công nghệ kĩ thuật số.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R10\",\"lesson_code\":\"B4\",\"level\":\"Hiểu\",\"text\":\"Giải thích được một số biểu hiện vi phạm đạo đức và pháp luật, biểu hiện thiếu văn hóa khi sử dụng công nghệ kĩ thuật số.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R11\",\"lesson_code\":\"B4\",\"level\":\"Vận dụng\",\"text\":\"Đảm bảo các sản phẩm số do bản thân tạo ra thể hiện đạo đức, tính văn hóa, không vi phạm pháp luật và vận dụng vào cuộc sống thực tiễn.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R12\",\"lesson_code\":\"B12\",\"level\":\"Biết\",\"text\":\"Nhận biết được khái niệm thuật toán, chương trình và mối quan hệ giữa thuật toán và chương trình.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R13\",\"lesson_code\":\"B12\",\"level\":\"Hiểu\",\"text\":\"Giải thích được mối quan hệ giữa thuật toán và chương trình; mô tả được cách chuyển một thuật toán đơn giản thành chương trình.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"}],\"slots\":[{\"id\":\"S1\",\"kind\":\"MC\",\"number\":1,\"parts\":[{\"id\":\"P1\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S2\",\"kind\":\"MC\",\"number\":2,\"parts\":[{\"id\":\"P2\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S3\",\"kind\":\"MC\",\"number\":3,\"parts\":[{\"id\":\"P3\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S4\",\"kind\":\"MC\",\"number\":4,\"parts\":[{\"id\":\"P4\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S5\",\"kind\":\"MC\",\"number\":5,\"parts\":[{\"id\":\"P5\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S6\",\"kind\":\"MC\",\"number\":6,\"parts\":[{\"id\":\"P6\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S7\",\"kind\":\"MC\",\"number\":7,\"parts\":[{\"id\":\"P7\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S8\",\"kind\":\"MC\",\"number\":8,\"parts\":[{\"id\":\"P8\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S9\",\"kind\":\"MC\",\"number\":9,\"parts\":[{\"id\":\"P9\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S10\",\"kind\":\"MC\",\"number\":10,\"parts\":[{\"id\":\"P10\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S11\",\"kind\":\"MC\",\"number\":11,\"parts\":[{\"id\":\"P11\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S12\",\"kind\":\"MC\",\"number\":12,\"parts\":[{\"id\":\"P12\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S13\",\"kind\":\"MC\",\"number\":13,\"parts\":[{\"id\":\"P13\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S14\",\"kind\":\"MC\",\"number\":14,\"parts\":[{\"id\":\"P14\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S15\",\"kind\":\"MC\",\"number\":15,\"parts\":[{\"id\":\"P15\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S16\",\"kind\":\"MC\",\"number\":16,\"parts\":[{\"id\":\"P16\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S17\",\"kind\":\"MC\",\"number\":17,\"parts\":[{\"id\":\"P17\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S18\",\"kind\":\"MC\",\"number\":18,\"parts\":[{\"id\":\"P18\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S19\",\"kind\":\"MC\",\"number\":19,\"parts\":[{\"id\":\"P19\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S20\",\"kind\":\"MC\",\"number\":20,\"parts\":[{\"id\":\"P20\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S21\",\"kind\":\"MC\",\"number\":21,\"parts\":[{\"id\":\"P21\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S22\",\"kind\":\"MC\",\"number\":22,\"parts\":[{\"id\":\"P22\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S23\",\"kind\":\"MC\",\"number\":23,\"parts\":[{\"id\":\"P23\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S24\",\"kind\":\"MC\",\"number\":24,\"parts\":[{\"id\":\"P24\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S25\",\"kind\":\"MC\",\"number\":25,\"parts\":[{\"id\":\"P25\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S26\",\"kind\":\"MC\",\"number\":26,\"parts\":[{\"id\":\"P26\",\"label\":\"\",\"requirement_id\":\"R12\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S27\",\"kind\":\"MC\",\"number\":27,\"parts\":[{\"id\":\"P27\",\"label\":\"\",\"requirement_id\":\"R12\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S28\",\"kind\":\"MC\",\"number\":28,\"parts\":[{\"id\":\"P28\",\"label\":\"\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S29\",\"kind\":\"ES\",\"number\":29,\"parts\":[{\"id\":\"P29\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S30\",\"kind\":\"ES\",\"number\":30,\"parts\":[{\"id\":\"P30\",\"label\":\"\",\"requirement_id\":\"R8\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S31\",\"kind\":\"ES\",\"number\":31,\"parts\":[{\"id\":\"P31\",\"label\":\"\",\"requirement_id\":\"R11\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}}]},\"9\":{\"profile\":\"THCS\",\"grade\":9,\"exam_type\":\"GK1\",\"duration\":45,\"school_year\":\"2026-2027\",\"title\":\"Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn Tin học Khối 9\",\"owner_name\":\"Tổ Tin học Á Châu\",\"campus\":\"Cao Thắng\",\"total_points\":10,\"lessons\":[{\"lesson_code\":\"B1\",\"title\":\"Thế giới kĩ thuật số\",\"topic\":\"Chủ đề 1: Máy tính và cộng đồng\"},{\"lesson_code\":\"B2\",\"title\":\"Thông tin trong giải quyết vấn đề\",\"topic\":\"Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin\"},{\"lesson_code\":\"B3\",\"title\":\"Thực hành: Đánh giá chất lượng thông tin\",\"topic\":\"Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin\"},{\"lesson_code\":\"B4\",\"title\":\"Một số vấn đề pháp lý về sử dụng dịch vụ Internet\",\"topic\":\"Chủ đề 3: Đạo đức, pháp luật và văn hóa số\"},{\"lesson_code\":\"B5\",\"title\":\"Tìm hiểu phần mềm mô phỏng\",\"topic\":\"Chủ đề 4: Ứng dụng tin học\"}],\"requirements\":[{\"id\":\"R1\",\"lesson_code\":\"B1\",\"level\":\"Biết\",\"text\":\"Nhận biết được các thiết bị có tích hợp bộ xử lí thông tin trong đời sống, thương mại; nhận biết thành phần cốt lõi và chức năng của CPU.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R2\",\"lesson_code\":\"B1\",\"level\":\"Hiểu\",\"text\":\"Hiểu yêu cầu số hóa dữ liệu thành dãy bit; phân tích ưu thế của máy tính về dung lượng lưu trữ và truyền thông tin tốc độ cao toàn cầu.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R3\",\"lesson_code\":\"B2\",\"level\":\"Biết\",\"text\":\"Nhận biết bốn tiêu chí đánh giá chất lượng thông tin, tiêu chí quan trọng hàng đầu, vai trò của chất lượng thông tin và tính sử dụng được.\",\"ppct_outcome_index\":0,\"competency\":\"NLc\"},{\"id\":\"R4\",\"lesson_code\":\"B2\",\"level\":\"Hiểu\",\"text\":\"Giải thích sự cần thiết của việc kiểm tra chất lượng thông tin trên Internet; phân tích thông tin sai lệch hoặc thiếu sót theo tiêu chí tính mới, đầy đủ, chính xác.\",\"ppct_outcome_index\":0,\"competency\":\"NLc\"},{\"id\":\"R5\",\"lesson_code\":\"B3\",\"level\":\"Vận dụng\",\"text\":\"Vận dụng tiêu chí tính mới, chính xác, đầy đủ, sử dụng được để đánh giá thông tin; xác định thông tin cần thu thập và nguồn tin cậy khi lập kế hoạch hoạt động dã ngoại học tập.\",\"ppct_outcome_index\":0,\"competency\":\"NLc\"},{\"id\":\"R6\",\"lesson_code\":\"B4\",\"level\":\"Biết\",\"text\":\"Nhận diện tác động tiêu cực do lạm dụng thiết bị số, rác thải điện tử; hành vi xâm phạm quyền riêng tư và quy tắc ứng xử trên mạng xã hội.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R7\",\"lesson_code\":\"B4\",\"level\":\"Hiểu\",\"text\":\"Hiểu trách nhiệm pháp lý trên không gian mạng, chế tài đối với tin giả và chuẩn mực tôn trọng bản quyền, trích dẫn nguồn tài nguyên số.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R8\",\"lesson_code\":\"B4\",\"level\":\"Vận dụng\",\"text\":\"Ứng xử có văn hóa, tôn trọng quyền riêng tư đối với tài khoản chưa đăng xuất; phân tích hậu quả tâm lý và pháp lý của bạo lực mạng.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R9\",\"lesson_code\":\"B5\",\"level\":\"Biết\",\"text\":\"Nhận biết khái niệm, ví dụ và mục đích sử dụng phần mềm mô phỏng PhET; xác định lĩnh vực khoa học của mô phỏng.\",\"ppct_outcome_index\":0,\"competency\":\"NLd\"},{\"id\":\"R10\",\"lesson_code\":\"B5\",\"level\":\"Hiểu\",\"text\":\"Phân tích lợi ích của mô phỏng thí nghiệm ảo đối với hiện tượng nguy hiểm, vi mô hoặc tốn kém; hiểu ứng dụng mô phỏng giao thông trong quy hoạch đô thị.\",\"ppct_outcome_index\":0,\"competency\":\"NLd\"},{\"id\":\"R11\",\"lesson_code\":\"B5\",\"level\":\"Vận dụng\",\"text\":\"Giải thích ưu thế mô phỏng mạch điện một chiều so với thí nghiệm thật; mô tả thao tác lắp mạch, đóng công tắc và đo cường độ dòng điện trên PhET.\",\"ppct_outcome_index\":0,\"competency\":\"NLd\"}],\"slots\":[{\"id\":\"S1\",\"kind\":\"MC\",\"number\":1,\"parts\":[{\"id\":\"P1\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S2\",\"kind\":\"MC\",\"number\":2,\"parts\":[{\"id\":\"P2\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S3\",\"kind\":\"MC\",\"number\":3,\"parts\":[{\"id\":\"P3\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S4\",\"kind\":\"MC\",\"number\":4,\"parts\":[{\"id\":\"P4\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S5\",\"kind\":\"MC\",\"number\":5,\"parts\":[{\"id\":\"P5\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S6\",\"kind\":\"MC\",\"number\":6,\"parts\":[{\"id\":\"P6\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S7\",\"kind\":\"MC\",\"number\":7,\"parts\":[{\"id\":\"P7\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S8\",\"kind\":\"MC\",\"number\":8,\"parts\":[{\"id\":\"P8\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S9\",\"kind\":\"MC\",\"number\":9,\"parts\":[{\"id\":\"P9\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S10\",\"kind\":\"MC\",\"number\":10,\"parts\":[{\"id\":\"P10\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S11\",\"kind\":\"MC\",\"number\":11,\"parts\":[{\"id\":\"P11\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S12\",\"kind\":\"MC\",\"number\":12,\"parts\":[{\"id\":\"P12\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S13\",\"kind\":\"MC\",\"number\":13,\"parts\":[{\"id\":\"P13\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S14\",\"kind\":\"MC\",\"number\":14,\"parts\":[{\"id\":\"P14\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S15\",\"kind\":\"MC\",\"number\":15,\"parts\":[{\"id\":\"P15\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S16\",\"kind\":\"MC\",\"number\":16,\"parts\":[{\"id\":\"P16\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S17\",\"kind\":\"MC\",\"number\":17,\"parts\":[{\"id\":\"P17\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S18\",\"kind\":\"MC\",\"number\":18,\"parts\":[{\"id\":\"P18\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S19\",\"kind\":\"MC\",\"number\":19,\"parts\":[{\"id\":\"P19\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S20\",\"kind\":\"MC\",\"number\":20,\"parts\":[{\"id\":\"P20\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S21\",\"kind\":\"MC\",\"number\":21,\"parts\":[{\"id\":\"P21\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S22\",\"kind\":\"MC\",\"number\":22,\"parts\":[{\"id\":\"P22\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S23\",\"kind\":\"MC\",\"number\":23,\"parts\":[{\"id\":\"P23\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S24\",\"kind\":\"MC\",\"number\":24,\"parts\":[{\"id\":\"P24\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S25\",\"kind\":\"MC\",\"number\":25,\"parts\":[{\"id\":\"P25\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S26\",\"kind\":\"MC\",\"number\":26,\"parts\":[{\"id\":\"P26\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S27\",\"kind\":\"MC\",\"number\":27,\"parts\":[{\"id\":\"P27\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S28\",\"kind\":\"MC\",\"number\":28,\"parts\":[{\"id\":\"P28\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S29\",\"kind\":\"ES\",\"number\":1,\"parts\":[{\"id\":\"P29\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S30\",\"kind\":\"ES\",\"number\":2,\"parts\":[{\"id\":\"P30\",\"label\":\"\",\"requirement_id\":\"R8\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S31\",\"kind\":\"ES\",\"number\":3,\"parts\":[{\"id\":\"P31\",\"label\":\"\",\"requirement_id\":\"R11\",\"points\":1,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}}]},\"10\":{\"profile\":\"THPT\",\"grade\":10,\"exam_type\":\"GK1\",\"duration\":45,\"school_year\":\"2026-2027\",\"title\":\"Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn Tin học Khối 10\",\"owner_name\":\"Tổ Tin học Á Châu\",\"campus\":\"Cao Thắng\",\"total_points\":10,\"lessons\":[{\"lesson_code\":\"B1\",\"title\":\"Thông tin và xử lí thông tin\",\"topic\":\"Chủ đề 1: Máy tính và xã hội tri thức\"},{\"lesson_code\":\"B2\",\"title\":\"Vai trò của thiết bị thông minh và tin học đối với xã hội\",\"topic\":\"Chủ đề 1: Máy tính và xã hội tri thức\"},{\"lesson_code\":\"B3\",\"title\":\"Thực hành sử dụng thiết bị thông dụng\",\"topic\":\"Chủ đề 1: Máy tính và xã hội tri thức\"},{\"lesson_code\":\"B4\",\"title\":\"Mạng máy tính trong cuộc sống hiện đại\",\"topic\":\"Chủ đề 2: Mạng máy tính và Internet\"},{\"lesson_code\":\"B5\",\"title\":\"An toàn trên không gian mạng\",\"topic\":\"Chủ đề 2: Mạng máy tính và Internet\"},{\"lesson_code\":\"B6\",\"title\":\"Thực hành khai thác tài nguyên trên Internet\",\"topic\":\"Chủ đề 2: Mạng máy tính và Internet\"},{\"lesson_code\":\"B7\",\"title\":\"Ứng xử trên môi trường số. Nghĩa vụ tôn trọng bản quyền\",\"topic\":\"Chủ đề 3: Đạo đức, pháp luật và văn hóa trong môi trường số\"},{\"lesson_code\":\"B8\",\"title\":\"Phần mềm thiết kế đồ họa\",\"topic\":\"Chủ đề 4: Ứng dụng tin học\"}],\"requirements\":[{\"id\":\"R1\",\"lesson_code\":\"B1\",\"level\":\"Biết\",\"text\":\"Biết được thông tin, dữ liệu và các bước cơ bản trong xử lí thông tin.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R2\",\"lesson_code\":\"B1\",\"level\":\"Hiểu\",\"text\":\"Hiểu được ưu điểm của thiết bị số.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R3\",\"lesson_code\":\"B1\",\"level\":\"Vận dụng\",\"text\":\"Giải thích các tình huống liên quan đến việc lưu trữ thông tin.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R4\",\"lesson_code\":\"B2\",\"level\":\"Biết\",\"text\":\"Nhận biết thiết bị thông minh; nêu được vai trò của thiết bị thông minh trong cuộc cách mạng công nghiệp lần thứ tư.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R5\",\"lesson_code\":\"B2\",\"level\":\"Hiểu\",\"text\":\"Hiểu được đặc điểm của Internet vạn vật (IoT) trong hệ thống.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R6\",\"lesson_code\":\"B3\",\"level\":\"Biết\",\"text\":\"Biết được một số ứng dụng trên điện thoại thông minh.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R7\",\"lesson_code\":\"B3\",\"level\":\"Hiểu\",\"text\":\"Hiểu được lợi ích của việc lưu trữ đám mây.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R8\",\"lesson_code\":\"B3\",\"level\":\"Vận dụng\",\"text\":\"Áp dụng được việc lưu trữ dữ liệu trên Internet.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R9\",\"lesson_code\":\"B4\",\"level\":\"Biết\",\"text\":\"Biết được mạng LAN, Internet và các loại dịch vụ đám mây cơ bản.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R10\",\"lesson_code\":\"B4\",\"level\":\"Hiểu\",\"text\":\"Hiểu được lợi ích của việc tự đọc dữ liệu của các thiết bị.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R11\",\"lesson_code\":\"B4\",\"level\":\"Vận dụng\",\"text\":\"Vận dụng kiến thức trong các tình huống liên quan đến lưu trữ dữ liệu đám mây.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R12\",\"lesson_code\":\"B5\",\"level\":\"Biết\",\"text\":\"Biết nguy cơ khi tải phần mềm bẻ khóa, khả năng lây nhiễm của virus và cách lựa chọn quét virus.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R13\",\"lesson_code\":\"B5\",\"level\":\"Hiểu\",\"text\":\"Hiểu tầm quan trọng của việc xác minh thông tin và khả năng lây nhiễm virus.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R14\",\"lesson_code\":\"B5\",\"level\":\"Vận dụng\",\"text\":\"Vận dụng cách quét virus phù hợp trong thực tế.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R15\",\"lesson_code\":\"B6\",\"level\":\"Hiểu\",\"text\":\"Hiểu cách thức hoạt động của Google Translate và bố cục tổ chức kho dữ liệu số.\",\"ppct_outcome_index\":0,\"competency\":\"NLc\"},{\"id\":\"R16\",\"lesson_code\":\"B7\",\"level\":\"Biết\",\"text\":\"Biết quyền khi mua bản quyền phần mềm, quyền tác giả và điều kiện trở thành chủ sở hữu bản quyền phần mềm.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R17\",\"lesson_code\":\"B7\",\"level\":\"Hiểu\",\"text\":\"Hiểu các hành vi, trường hợp vi phạm bản quyền.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R18\",\"lesson_code\":\"B7\",\"level\":\"Vận dụng\",\"text\":\"Vận dụng hiểu biết về giấy phép bản quyền khi sử dụng tài nguyên số.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R19\",\"lesson_code\":\"B8\",\"level\":\"Biết\",\"text\":\"Biết hình ảnh đồ họa được tạo thành từ điểm ảnh và phần mở rộng tệp của Inkscape.\",\"ppct_outcome_index\":0,\"competency\":\"NLc\"},{\"id\":\"R20\",\"lesson_code\":\"B8\",\"level\":\"Hiểu\",\"text\":\"Hiểu tính năng của một số lệnh cơ bản trong Inkscape.\",\"ppct_outcome_index\":0,\"competency\":\"NLc\"},{\"id\":\"R21\",\"lesson_code\":\"B8\",\"level\":\"Vận dụng\",\"text\":\"Vẽ được một số hình đơn giản trong phần mềm Inkscape.\",\"ppct_outcome_index\":0,\"competency\":\"NLc\"}],\"slots\":[{\"id\":\"S1\",\"kind\":\"MC\",\"number\":1,\"parts\":[{\"id\":\"P1\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S2\",\"kind\":\"MC\",\"number\":2,\"parts\":[{\"id\":\"P2\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S3\",\"kind\":\"MC\",\"number\":3,\"parts\":[{\"id\":\"P3\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S4\",\"kind\":\"MC\",\"number\":4,\"parts\":[{\"id\":\"P4\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S5\",\"kind\":\"MC\",\"number\":5,\"parts\":[{\"id\":\"P5\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S6\",\"kind\":\"MC\",\"number\":6,\"parts\":[{\"id\":\"P6\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S7\",\"kind\":\"MC\",\"number\":7,\"parts\":[{\"id\":\"P7\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S8\",\"kind\":\"MC\",\"number\":8,\"parts\":[{\"id\":\"P8\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S9\",\"kind\":\"MC\",\"number\":9,\"parts\":[{\"id\":\"P9\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S10\",\"kind\":\"MC\",\"number\":10,\"parts\":[{\"id\":\"P10\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S11\",\"kind\":\"MC\",\"number\":11,\"parts\":[{\"id\":\"P11\",\"label\":\"\",\"requirement_id\":\"R12\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S12\",\"kind\":\"MC\",\"number\":12,\"parts\":[{\"id\":\"P12\",\"label\":\"\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S13\",\"kind\":\"MC\",\"number\":13,\"parts\":[{\"id\":\"P13\",\"label\":\"\",\"requirement_id\":\"R15\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S14\",\"kind\":\"MC\",\"number\":14,\"parts\":[{\"id\":\"P14\",\"label\":\"\",\"requirement_id\":\"R15\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S15\",\"kind\":\"MC\",\"number\":15,\"parts\":[{\"id\":\"P15\",\"label\":\"\",\"requirement_id\":\"R16\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S16\",\"kind\":\"MC\",\"number\":16,\"parts\":[{\"id\":\"P16\",\"label\":\"\",\"requirement_id\":\"R17\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S17\",\"kind\":\"MC\",\"number\":17,\"parts\":[{\"id\":\"P17\",\"label\":\"\",\"requirement_id\":\"R19\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S18\",\"kind\":\"MC\",\"number\":18,\"parts\":[{\"id\":\"P18\",\"label\":\"\",\"requirement_id\":\"R19\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S19\",\"kind\":\"MC\",\"number\":19,\"parts\":[{\"id\":\"P19\",\"label\":\"\",\"requirement_id\":\"R20\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S20\",\"kind\":\"YN\",\"number\":1,\"parts\":[{\"id\":\"P20\",\"label\":\"a\",\"requirement_id\":\"R6\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P21\",\"label\":\"b\",\"requirement_id\":\"R6\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P22\",\"label\":\"c\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P23\",\"label\":\"d\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S21\",\"kind\":\"YN\",\"number\":2,\"parts\":[{\"id\":\"P24\",\"label\":\"a\",\"requirement_id\":\"R12\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P25\",\"label\":\"b\",\"requirement_id\":\"R12\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P26\",\"label\":\"c\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P27\",\"label\":\"d\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S22\",\"kind\":\"YN\",\"number\":3,\"parts\":[{\"id\":\"P28\",\"label\":\"a\",\"requirement_id\":\"R16\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P29\",\"label\":\"b\",\"requirement_id\":\"R16\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P30\",\"label\":\"c\",\"requirement_id\":\"R17\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P31\",\"label\":\"d\",\"requirement_id\":\"R18\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S23\",\"kind\":\"ES\",\"number\":1,\"parts\":[{\"id\":\"P32\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":0.75,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S24\",\"kind\":\"ES\",\"number\":2,\"parts\":[{\"id\":\"P33\",\"label\":\"\",\"requirement_id\":\"R11\",\"points\":0.75,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S25\",\"kind\":\"ES\",\"number\":3,\"parts\":[{\"id\":\"P34\",\"label\":\"\",\"requirement_id\":\"R21\",\"points\":0.75,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}}]},\"11\":{\"profile\":\"THPT\",\"grade\":11,\"exam_type\":\"GK1\",\"duration\":45,\"school_year\":\"2026-2027\",\"title\":\"Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn Tin học Khối 11\",\"owner_name\":\"Tổ Tin học Á Châu\",\"campus\":\"Cao Thắng\",\"total_points\":10,\"lessons\":[{\"lesson_code\":\"B1\",\"title\":\"Hệ điều hành\",\"topic\":\"Chủ đề 1. Máy tính và xã hội tri thức\"},{\"lesson_code\":\"B2\",\"title\":\"Thực hành sử dụng hệ điều hành\",\"topic\":\"Chủ đề 1. Máy tính và xã hội tri thức\"},{\"lesson_code\":\"B3\",\"title\":\"Phần mềm nguồn mở và phần mềm chạy trên Internet\",\"topic\":\"Chủ đề 1. Máy tính và xã hội tri thức\"},{\"lesson_code\":\"B4\",\"title\":\"Bên trong máy tính\",\"topic\":\"Chủ đề 1. Máy tính và xã hội tri thức\"},{\"lesson_code\":\"B5\",\"title\":\"Kết nối máy tính với các thiết bị số\",\"topic\":\"Chủ đề 1. Máy tính và xã hội tri thức\"},{\"lesson_code\":\"B6\",\"title\":\"Lưu trữ và chia sẻ tệp tin trên Internet\",\"topic\":\"Chủ đề 2. Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin\"},{\"lesson_code\":\"B7\",\"title\":\"Thực hành tìm kiếm thông tin trên Internet\",\"topic\":\"Chủ đề 2. Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin\"},{\"lesson_code\":\"B8\",\"title\":\"Thực hành nâng cao sử dụng thư điện tử và mạng xã hội\",\"topic\":\"Chủ đề 2. Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin\"}],\"requirements\":[{\"id\":\"R1\",\"lesson_code\":\"B1\",\"level\":\"Biết\",\"text\":\"Trình bày được sơ lược lịch sử phát triển của các hệ điều hành thông dụng cho máy tính cá nhân (PC).\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R2\",\"lesson_code\":\"B1\",\"level\":\"Hiểu\",\"text\":\"Chỉ ra được một số đặc điểm của hệ điều hành cho thiết bị di động.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R3\",\"lesson_code\":\"B1\",\"level\":\"Vận dụng\",\"text\":\"Trình bày được một cách khái quát mối quan hệ giữa phần cứng, hệ điều hành và phần mềm ứng dụng cũng như vai trò của mỗi thành phần trong hoạt động chung của cả hệ thống.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R4\",\"lesson_code\":\"B2\",\"level\":\"Biết\",\"text\":\"Sử dụng được một số chức năng cơ bản của hệ điều hành cho máy tính cá nhân.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R5\",\"lesson_code\":\"B2\",\"level\":\"Hiểu\",\"text\":\"Sử dụng được một vài tiện ích của hệ điều hành nâng cao hiệu quả của máy tính cá nhân.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R6\",\"lesson_code\":\"B2\",\"level\":\"Vận dụng\",\"text\":\"Sử dụng được một vài tiện ích cơ bản của hệ điều hành trên thiết bị di động.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R7\",\"lesson_code\":\"B3\",\"level\":\"Biết\",\"text\":\"Trình bày được một số khái niệm và so sánh phần mềm nguồn mở với phần mềm thương mại; nêu được vai trò của phần mềm nguồn mở và phần mềm thương mại đối với sự phát triển của công nghệ thông tin.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R8\",\"lesson_code\":\"B3\",\"level\":\"Hiểu\",\"text\":\"Làm quen với phần mềm chạy trên Internet.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R9\",\"lesson_code\":\"B3\",\"level\":\"Vận dụng\",\"text\":\"Làm quen với phần mềm chạy trên Internet.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R10\",\"lesson_code\":\"B4\",\"level\":\"Biết\",\"text\":\"Nhận diện được một số thiết bị bên trong máy tính với chức năng và các thông số đo hiệu năng của chúng.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R11\",\"lesson_code\":\"B4\",\"level\":\"Hiểu\",\"text\":\"Nhận biết được sơ đồ của các mạch logic AND, OR, NOT và giải thích được vai trò của các mạch logic đó trong thực hiện các tính toán nhị phân.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R12\",\"lesson_code\":\"B4\",\"level\":\"Vận dụng\",\"text\":\"Nhận biết được sơ đồ của các mạch logic AND, OR, NOT và giải thích được vai trò của các mạch logic đó trong thực hiện các tính toán nhị phân.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R13\",\"lesson_code\":\"B5\",\"level\":\"Biết\",\"text\":\"Biết một số thông số cơ bản của thiết bị vào – ra thông dụng, cách kết nối với máy tính và tùy chỉnh chức năng để tối ưu hóa hiệu quả sử dụng.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R14\",\"lesson_code\":\"B5\",\"level\":\"Hiểu\",\"text\":\"Đọc hiểu và giải thích được một số thông số cơ bản của các thiết bị số thông dụng trong các tài liệu để kết nối chúng với máy tính.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R15\",\"lesson_code\":\"B5\",\"level\":\"Vận dụng\",\"text\":\"Đọc hiểu và giải thích được một số thông số cơ bản của các thiết bị số thông dụng trong các tài liệu để kết nối chúng với máy tính.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R16\",\"lesson_code\":\"B6\",\"level\":\"Biết\",\"text\":\"Sử dụng được một số công cụ trực tuyến như Google Drive, Dropbox, … để lưu trữ và chia sẻ tệp tin.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R17\",\"lesson_code\":\"B6\",\"level\":\"Hiểu\",\"text\":\"Sử dụng được một số công cụ trực tuyến như Google Drive, Dropbox, … để lưu trữ và chia sẻ tệp tin.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R18\",\"lesson_code\":\"B6\",\"level\":\"Vận dụng\",\"text\":\"Sử dụng được một số công cụ trực tuyến như Google Drive, Dropbox, … để lưu trữ và chia sẻ tệp tin.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R19\",\"lesson_code\":\"B7\",\"level\":\"Biết\",\"text\":\"Sử dụng được máy tìm kiếm trên PC và thiết bị số thông minh bằng cách gõ từ khóa hoặc bằng tiếng nói.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R20\",\"lesson_code\":\"B7\",\"level\":\"Hiểu\",\"text\":\"Xác lập được các lựa chọn theo tiêu chí tìm kiếm để nâng cao hiệu quả tìm kiếm thông tin.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R21\",\"lesson_code\":\"B7\",\"level\":\"Vận dụng\",\"text\":\"Xác lập được các lựa chọn theo tiêu chí tìm kiếm để nâng cao hiệu quả tìm kiếm thông tin.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R22\",\"lesson_code\":\"B8\",\"level\":\"Biết\",\"text\":\"Biết đánh dấu và phân loại thư điện tử.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R23\",\"lesson_code\":\"B8\",\"level\":\"Hiểu\",\"text\":\"Khai thác được một số chức năng nâng cao của mạng xã hội.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R24\",\"lesson_code\":\"B8\",\"level\":\"Vận dụng\",\"text\":\"Khai thác được một số chức năng nâng cao của mạng xã hội.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"}],\"slots\":[{\"id\":\"S1\",\"kind\":\"MC\",\"number\":1,\"parts\":[{\"id\":\"P1\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S2\",\"kind\":\"MC\",\"number\":2,\"parts\":[{\"id\":\"P2\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S3\",\"kind\":\"MC\",\"number\":3,\"parts\":[{\"id\":\"P3\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S4\",\"kind\":\"MC\",\"number\":4,\"parts\":[{\"id\":\"P4\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S5\",\"kind\":\"MC\",\"number\":5,\"parts\":[{\"id\":\"P5\",\"label\":\"\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S6\",\"kind\":\"MC\",\"number\":6,\"parts\":[{\"id\":\"P6\",\"label\":\"\",\"requirement_id\":\"R16\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S7\",\"kind\":\"MC\",\"number\":7,\"parts\":[{\"id\":\"P7\",\"label\":\"\",\"requirement_id\":\"R19\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S8\",\"kind\":\"MC\",\"number\":8,\"parts\":[{\"id\":\"P8\",\"label\":\"\",\"requirement_id\":\"R22\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S9\",\"kind\":\"MC\",\"number\":9,\"parts\":[{\"id\":\"P9\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S10\",\"kind\":\"MC\",\"number\":10,\"parts\":[{\"id\":\"P10\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S11\",\"kind\":\"MC\",\"number\":11,\"parts\":[{\"id\":\"P11\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S12\",\"kind\":\"MC\",\"number\":12,\"parts\":[{\"id\":\"P12\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S13\",\"kind\":\"MC\",\"number\":13,\"parts\":[{\"id\":\"P13\",\"label\":\"\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S14\",\"kind\":\"MC\",\"number\":14,\"parts\":[{\"id\":\"P14\",\"label\":\"\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S15\",\"kind\":\"MC\",\"number\":15,\"parts\":[{\"id\":\"P15\",\"label\":\"\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S16\",\"kind\":\"MC\",\"number\":16,\"parts\":[{\"id\":\"P16\",\"label\":\"\",\"requirement_id\":\"R17\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S17\",\"kind\":\"MC\",\"number\":17,\"parts\":[{\"id\":\"P17\",\"label\":\"\",\"requirement_id\":\"R20\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S18\",\"kind\":\"MC\",\"number\":18,\"parts\":[{\"id\":\"P18\",\"label\":\"\",\"requirement_id\":\"R23\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S19\",\"kind\":\"MC\",\"number\":19,\"parts\":[{\"id\":\"P19\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S20\",\"kind\":\"YN\",\"number\":1,\"parts\":[{\"id\":\"P20a\",\"label\":\"a\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P20b\",\"label\":\"b\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P20c\",\"label\":\"c\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P20d\",\"label\":\"d\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S21\",\"kind\":\"YN\",\"number\":2,\"parts\":[{\"id\":\"P21a\",\"label\":\"a\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P21b\",\"label\":\"b\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P21c\",\"label\":\"c\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P21d\",\"label\":\"d\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S22\",\"kind\":\"YN\",\"number\":3,\"parts\":[{\"id\":\"P22a\",\"label\":\"a\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P22b\",\"label\":\"b\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P22c\",\"label\":\"c\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P22d\",\"label\":\"d\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S23\",\"kind\":\"ES\",\"number\":1,\"parts\":[{\"id\":\"P23\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":0.75,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S24\",\"kind\":\"ES\",\"number\":2,\"parts\":[{\"id\":\"P24\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":0.75,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S25\",\"kind\":\"ES\",\"number\":3,\"parts\":[{\"id\":\"P25\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.75,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}}],\"indicator_catalog\":[{\"code\":\"NLa\",\"competency\":\"NLa\",\"text\":\"Nhận biết và giải thích các khái niệm tin học cơ bản.\"},{\"code\":\"NLb\",\"competency\":\"NLb\",\"text\":\"Sử dụng và ứng dụng công nghệ thông tin trong học tập.\"},{\"code\":\"NLc\",\"competency\":\"NLc\",\"text\":\"Tư duy giải quyết vấn đề với sự trợ giúp của máy tính.\"}]},\"12\":{\"profile\":\"THPT\",\"grade\":12,\"exam_type\":\"GK1\",\"duration\":45,\"school_year\":\"2026-2027\",\"title\":\"Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn Tin học Khối 12\",\"owner_name\":\"Tổ Tin học Á Châu\",\"campus\":\"Cao Thắng\",\"total_points\":10,\"lessons\":[{\"lesson_code\":\"B1\",\"title\":\"Làm quen với Trí tuệ nhân tạo\",\"topic\":\"Chủ đề 1. Máy tính và xã hội tri thức\"},{\"lesson_code\":\"B2\",\"title\":\"Trí tuệ nhân tạo trong khoa học và đời sống\",\"topic\":\"Chủ đề 1. Máy tính và xã hội tri thức\"},{\"lesson_code\":\"B3\",\"title\":\"Một số thiết bị mạng thông dụng\",\"topic\":\"Chủ đề 2. Mạng máy tính và Internet\"},{\"lesson_code\":\"B4\",\"title\":\"Giao thức mạng\",\"topic\":\"Chủ đề 2. Mạng máy tính và Internet\"},{\"lesson_code\":\"B5\",\"title\":\"Thực hành chia sẻ tài nguyên trên mạng\",\"topic\":\"Chủ đề 2. Mạng máy tính và Internet\"},{\"lesson_code\":\"B6\",\"title\":\"Giao tiếp và ứng xử trong không gian mạng\",\"topic\":\"Chủ đề 3. Đạo đức, pháp luật và văn hóa trong môi trường số\"},{\"lesson_code\":\"B23\",\"title\":\"Chuẩn bị xây dựng trang web\",\"topic\":\"Chủ đề 7. Ứng dụng tin học\"},{\"lesson_code\":\"B24\",\"title\":\"Xây dựng phần đầu trang web\",\"topic\":\"Chủ đề 7. Ứng dụng tin học\"}],\"requirements\":[{\"id\":\"R1\",\"lesson_code\":\"B1\",\"level\":\"Biết\",\"text\":\"– Giải thích được sơ lược về khái niệm Trí tuệ nhân tạo.– Nêu được ví dụ minh hoạ cho một số ứng dụng điển hình của AI như điều khiển tự động, chẩn đoán bệnh, nhận dạng chữ viết tay, nhận dạng tiếng nói và khuôn mặt, trợ lí ảo…\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R2\",\"lesson_code\":\"B1\",\"level\":\"Hiểu\",\"text\":\"– Giải thích được sơ lược về khái niệm Trí tuệ nhân tạo.– Nêu được ví dụ minh hoạ cho một số ứng dụng điển hình của AI như điều khiển tự động, chẩn đoán bệnh, nhận dạng chữ viết tay, nhận dạng tiếng nói và khuôn mặt, trợ lí ảo…\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R3\",\"lesson_code\":\"B1\",\"level\":\"Vận dụng\",\"text\":\"– Giải thích được sơ lược về khái niệm Trí tuệ nhân tạo.– Nêu được ví dụ minh hoạ cho một số ứng dụng điển hình của AI như điều khiển tự động, chẩn đoán bệnh, nhận dạng chữ viết tay, nhận dạng tiếng nói và khuôn mặt, trợ lí ảo…\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R4\",\"lesson_code\":\"B2\",\"level\":\"Biết\",\"text\":\"– Chỉ ra được một số lĩnh vực của khoa học công nghệ và đời sống đã và đang phát triển mạnh mẽ dựa trên những thành tựu to lớn của AI.– Nêu được ví dụ để thấy một hệ thống AI có tri thức, có khả năng suy luận và khả năng học, …– Nêu được cảnh báo về sự phát triển của AI trong tương lai.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R5\",\"lesson_code\":\"B2\",\"level\":\"Hiểu\",\"text\":\"– Chỉ ra được một số lĩnh vực của khoa học công nghệ và đời sống đã và đang phát triển mạnh mẽ dựa trên những thành tựu to lớn của AI.– Nêu được ví dụ để thấy một hệ thống AI có tri thức, có khả năng suy luận và khả năng học, …– Nêu được cảnh báo về sự phát triển của AI trong tương lai.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R6\",\"lesson_code\":\"B2\",\"level\":\"Vận dụng\",\"text\":\"– Chỉ ra được một số lĩnh vực của khoa học công nghệ và đời sống đã và đang phát triển mạnh mẽ dựa trên những thành tựu to lớn của AI.– Nêu được ví dụ để thấy một hệ thống AI có tri thức, có khả năng suy luận và khả năng học, …– Nêu được cảnh báo về sự phát triển của AI trong tương lai.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R7\",\"lesson_code\":\"B3\",\"level\":\"Biết\",\"text\":\"Nêu được chức năng chính của một số thiết bị mạng thông dụng.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R8\",\"lesson_code\":\"B3\",\"level\":\"Hiểu\",\"text\":\"Biết cách kết nối máy tính, thiết bị di động vào mạng máy tính.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R9\",\"lesson_code\":\"B3\",\"level\":\"Vận dụng\",\"text\":\"Biết cách kết nối máy tính, thiết bị di động vào mạng máy tính.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R10\",\"lesson_code\":\"B4\",\"level\":\"Biết\",\"text\":\"– Hiểu và mô tả sơ lược được vai trò và chức năng của giao thức mạng nói chung và giao thức TCP/IP nói riêng.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R11\",\"lesson_code\":\"B4\",\"level\":\"Hiểu\",\"text\":\"– Hiểu và mô tả sơ lược được vai trò và chức năng của giao thức mạng nói chung và giao thức TCP/IP nói riêng.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R12\",\"lesson_code\":\"B4\",\"level\":\"Vận dụng\",\"text\":\"– Hiểu và mô tả sơ lược được vai trò và chức năng của giao thức mạng nói chung và giao thức TCP/IP nói riêng.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R13\",\"lesson_code\":\"B5\",\"level\":\"Biết\",\"text\":\"– Sử dụng được các chức năng mạng của hệ điều hành để chia sẻ tài nguyên.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R14\",\"lesson_code\":\"B5\",\"level\":\"Hiểu\",\"text\":\"– Sử dụng được các chức năng mạng của hệ điều hành để chia sẻ tài nguyên.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R15\",\"lesson_code\":\"B5\",\"level\":\"Vận dụng\",\"text\":\"– Sử dụng được các chức năng mạng của hệ điều hành để chia sẻ tài nguyên.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R16\",\"lesson_code\":\"B6\",\"level\":\"Biết\",\"text\":\"Phân tích được ưu và nhược điểm về giao tiếp trong không gian mạng qua các ví dụ cụ thể.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R17\",\"lesson_code\":\"B6\",\"level\":\"Hiểu\",\"text\":\"Phân tích được tính nhân văn trong ứng xử ở một số tình huống tham gia không gian mạng.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R18\",\"lesson_code\":\"B6\",\"level\":\"Vận dụng\",\"text\":\"Phân tích được tính nhân văn trong ứng xử ở một số tình huống tham gia không gian mạng.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R19\",\"lesson_code\":\"B23\",\"level\":\"Biết\",\"text\":\"Có nhận thức ban đầu về các thành phần của trang web và các bước thiết kế trang web.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R20\",\"lesson_code\":\"B23\",\"level\":\"Hiểu\",\"text\":\"Có nhận thức ban đầu về các thành phần của trang web và các bước thiết kế trang web.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R21\",\"lesson_code\":\"B23\",\"level\":\"Vận dụng\",\"text\":\"Có nhận thức ban đầu về các thành phần của trang web và các bước thiết kế trang web.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"},{\"id\":\"R22\",\"lesson_code\":\"B24\",\"level\":\"Biết\",\"text\":\"Biết các bước xây dựng phần đầu trang web với hỗ trợ của Google sites.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R23\",\"lesson_code\":\"B24\",\"level\":\"Hiểu\",\"text\":\"Biết các bước xây dựng phần đầu trang web với hỗ trợ của Google sites.\",\"ppct_outcome_index\":0,\"competency\":\"NLa\"},{\"id\":\"R24\",\"lesson_code\":\"B24\",\"level\":\"Vận dụng\",\"text\":\"Biết các bước xây dựng phần đầu trang web với hỗ trợ của Google sites.\",\"ppct_outcome_index\":0,\"competency\":\"NLb\"}],\"slots\":[{\"id\":\"S1\",\"kind\":\"MC\",\"number\":1,\"parts\":[{\"id\":\"P1\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S2\",\"kind\":\"MC\",\"number\":2,\"parts\":[{\"id\":\"P2\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S3\",\"kind\":\"MC\",\"number\":3,\"parts\":[{\"id\":\"P3\",\"label\":\"\",\"requirement_id\":\"R7\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S4\",\"kind\":\"MC\",\"number\":4,\"parts\":[{\"id\":\"P4\",\"label\":\"\",\"requirement_id\":\"R10\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S5\",\"kind\":\"MC\",\"number\":5,\"parts\":[{\"id\":\"P5\",\"label\":\"\",\"requirement_id\":\"R13\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S6\",\"kind\":\"MC\",\"number\":6,\"parts\":[{\"id\":\"P6\",\"label\":\"\",\"requirement_id\":\"R16\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S7\",\"kind\":\"MC\",\"number\":7,\"parts\":[{\"id\":\"P7\",\"label\":\"\",\"requirement_id\":\"R19\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S8\",\"kind\":\"MC\",\"number\":8,\"parts\":[{\"id\":\"P8\",\"label\":\"\",\"requirement_id\":\"R22\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S9\",\"kind\":\"MC\",\"number\":9,\"parts\":[{\"id\":\"P9\",\"label\":\"\",\"requirement_id\":\"R1\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S10\",\"kind\":\"MC\",\"number\":10,\"parts\":[{\"id\":\"P10\",\"label\":\"\",\"requirement_id\":\"R4\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S11\",\"kind\":\"MC\",\"number\":11,\"parts\":[{\"id\":\"P11\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S12\",\"kind\":\"MC\",\"number\":12,\"parts\":[{\"id\":\"P12\",\"label\":\"\",\"requirement_id\":\"R5\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S13\",\"kind\":\"MC\",\"number\":13,\"parts\":[{\"id\":\"P13\",\"label\":\"\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S14\",\"kind\":\"MC\",\"number\":14,\"parts\":[{\"id\":\"P14\",\"label\":\"\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S15\",\"kind\":\"MC\",\"number\":15,\"parts\":[{\"id\":\"P15\",\"label\":\"\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S16\",\"kind\":\"MC\",\"number\":16,\"parts\":[{\"id\":\"P16\",\"label\":\"\",\"requirement_id\":\"R17\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S17\",\"kind\":\"MC\",\"number\":17,\"parts\":[{\"id\":\"P17\",\"label\":\"\",\"requirement_id\":\"R20\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S18\",\"kind\":\"MC\",\"number\":18,\"parts\":[{\"id\":\"P18\",\"label\":\"\",\"requirement_id\":\"R23\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S19\",\"kind\":\"MC\",\"number\":19,\"parts\":[{\"id\":\"P19\",\"label\":\"\",\"requirement_id\":\"R2\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S20\",\"kind\":\"YN\",\"number\":1,\"parts\":[{\"id\":\"P20a\",\"label\":\"a\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P20b\",\"label\":\"b\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P20c\",\"label\":\"c\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P20d\",\"label\":\"d\",\"requirement_id\":\"R8\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S21\",\"kind\":\"YN\",\"number\":2,\"parts\":[{\"id\":\"P21a\",\"label\":\"a\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P21b\",\"label\":\"b\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P21c\",\"label\":\"c\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P21d\",\"label\":\"d\",\"requirement_id\":\"R11\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S22\",\"kind\":\"YN\",\"number\":3,\"parts\":[{\"id\":\"P22a\",\"label\":\"a\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P22b\",\"label\":\"b\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P22c\",\"label\":\"c\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"},{\"id\":\"P22d\",\"label\":\"d\",\"requirement_id\":\"R14\",\"points\":0.25,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S23\",\"kind\":\"ES\",\"number\":1,\"parts\":[{\"id\":\"P23\",\"label\":\"\",\"requirement_id\":\"R3\",\"points\":0.75,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S24\",\"kind\":\"ES\",\"number\":2,\"parts\":[{\"id\":\"P24\",\"label\":\"\",\"requirement_id\":\"R6\",\"points\":0.75,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}},{\"id\":\"S25\",\"kind\":\"ES\",\"number\":3,\"parts\":[{\"id\":\"P25\",\"label\":\"\",\"requirement_id\":\"R9\",\"points\":0.75,\"indicator\":\"\"}],\"scoring\":{\"mode\":\"sum_parts\"}}],\"indicator_catalog\":[{\"code\":\"NLa\",\"competency\":\"NLa\",\"text\":\"Nhận biết và giải thích các khái niệm tin học cơ bản.\"},{\"code\":\"NLb\",\"competency\":\"NLb\",\"text\":\"Sử dụng và ứng dụng công nghệ thông tin trong học tập.\"},{\"code\":\"NLc\",\"competency\":\"NLc\",\"text\":\"Tư duy giải quyết vấn đề với sự trợ giúp của máy tính.\"}]}}");

  function renumberAllSlots(m) {
    if (!m || !m.slots) return;
    const kindOrder = { MC: 1, YN: 2, SHORT: 3, ES: 4 };
    m.slots.sort((a, b) => (kindOrder[a.kind] || 9) - (kindOrder[b.kind] || 9));

    let mcCount = 0, ynCount = 0, shortCount = 0, esCount = 0;
    m.slots.forEach((s, idx) => {
      s.id = 'S' + (idx + 1);
      if (s.kind === 'MC') {
        s.number = ++mcCount;
      } else if (s.kind === 'YN') {
        s.number = ++ynCount;
      } else if (s.kind === 'SHORT') {
        s.number = ++shortCount;
      } else if (s.kind === 'ES') {
        s.number = (Number(m.grade) === 8 ? (mcCount + ++esCount) : ++esCount);
      } else {
        s.number = idx + 1;
      }
      s.parts.forEach((p, pIdx) => {
        p.id = 'P' + (idx + 1) + (s.parts.length > 1 ? String.fromCharCode(97 + pIdx) : '');
      });
    });
  }

  function updateSlotsFromGrid(m, lessonCode, gridType, newCount) {
    if (!m) return;
    newCount = Math.max(0, parseInt(newCount, 10) || 0);

    let targetKind = 'MC';
    let targetLevel = 'Biết';
    let isYN = false;
    let defaultPts = 0.25;

    if (gridType === 'MC_B') {
      targetKind = 'MC'; targetLevel = 'Biết'; defaultPts = 0.25;
    } else if (gridType === 'MC_H') {
      targetKind = 'MC'; targetLevel = 'Hiểu'; defaultPts = 0.25;
    } else if (gridType === 'YN') {
      targetKind = 'YN'; targetLevel = 'Hiểu'; isYN = true; defaultPts = 0.25;
    } else if (gridType === 'ES_VD') {
      targetKind = 'ES'; targetLevel = 'Vận dụng'; defaultPts = Number(m.grade) >= 10 ? 0.75 : 1.0;
    } else if (gridType === 'ES_VDC') {
      targetKind = 'ES'; targetLevel = 'Vận dụng cao'; defaultPts = Number(m.grade) >= 10 ? 0.75 : 1.0;
    }

    const reqMap = new Map((m.requirements || []).map(r => [r.id, r]));
    const matchingSlotIndices = [];

    (m.slots || []).forEach((s, idx) => {
      const partReqId = s.parts[0]?.requirement_id;
      const r = reqMap.get(partReqId);
      if (!r || r.lesson_code !== lessonCode) return;

      if (gridType === 'MC_B' && s.kind === 'MC' && r.level === 'Biết') matchingSlotIndices.push(idx);
      else if (gridType === 'MC_H' && s.kind === 'MC' && r.level === 'Hiểu') matchingSlotIndices.push(idx);
      else if (gridType === 'YN' && s.kind === 'YN') matchingSlotIndices.push(idx);
      else if (gridType === 'ES_VD' && s.kind === 'ES' && (r.level === 'Vận dụng' || r.level === 'Vận dụng thấp')) matchingSlotIndices.push(idx);
      else if (gridType === 'ES_VDC' && s.kind === 'ES' && r.level === 'Vận dụng cao') matchingSlotIndices.push(idx);
    });

    const curCount = matchingSlotIndices.length;
    if (newCount === curCount) return;

    if (newCount < curCount) {
      const toRemoveIndices = matchingSlotIndices.slice(newCount).sort((a, b) => b - a);
      toRemoveIndices.forEach(idx => {
        m.slots.splice(idx, 1);
      });
    } else {
      const toAdd = newCount - curCount;
      let req = (m.requirements || []).find(r => r.lesson_code === lessonCode && (r.level === targetLevel || (targetLevel === 'Vận dụng' && r.level === 'Vận dụng thấp')));
      if (!req) {
        const lesson = (m.lessons || []).find(l => l.lesson_code === lessonCode);
        const lessonTitle = lesson ? lesson.title : lessonCode;
        req = {
          id: uid('R'),
          lesson_code: lessonCode,
          level: targetLevel,
          text: targetLevel + ': Yêu cầu cần đạt về ' + lessonTitle + '.',
          competency: m.profile === 'THPT' ? 'NLa' : 'TDLL',
          ppct_outcome_index: null,
          choice_group: null
        };
        m.requirements.push(req);
      }

      for (let i = 0; i < toAdd; i++) {
        if (isYN) {
          m.slots.push({
            id: uid('S'),
            kind: 'YN',
            number: 0,
            scoring: { mode: 'sum_parts' },
            parts: ['a', 'b', 'c', 'd'].map(label => ({
              id: uid('P'),
              label,
              requirement_id: req.id,
              points: 0.25,
              indicator: ''
            }))
          });
        } else {
          m.slots.push({
            id: uid('S'),
            kind: targetKind,
            number: 0,
            scoring: { mode: 'sum_parts' },
            parts: [{ id: uid('P'), label: '', requirement_id: req.id, points: defaultPts, indicator: '' }]
          });
        }
      }
    }

    renumberAllSlots(m);
  }

  function matrixGridHtml(m, locked, received) {
    const reqMap = new Map((m.requirements || []).map(r => [r.id, r]));
    const isTHPT = m.profile === 'THPT';

    const lessonRows = (m.lessons || []).map((lesson, idx) => {
      let mc_b = 0, mc_h = 0, yn = 0, es_vd = 0, es_vdc = 0;
      let lessonPts = 0;

      (m.slots || []).forEach(s => {
        const partReqId = s.parts[0]?.requirement_id;
        const r = reqMap.get(partReqId);
        if (!r || r.lesson_code !== lesson.lesson_code) return;

        const sPts = s.parts.reduce((sum, p) => sum + Number(p.points || 0), 0);
        lessonPts += sPts;

        if (s.kind === 'MC') {
          if (r.level === 'Biết') mc_b++;
          else if (r.level === 'Hiểu') mc_h++;
        } else if (s.kind === 'YN') {
          yn++;
        } else if (s.kind === 'ES') {
          if (r.level === 'Vận dụng' || r.level === 'Vận dụng thấp') es_vd++;
          else if (r.level === 'Vận dụng cao') es_vdc++;
        }
      });

      const totalQ = mc_b + mc_h + yn + es_vd + es_vdc;
      const dis = (locked || received) ? ' disabled' : '';

      return `
        <tr>
          <td style="text-align:center;font-weight:600">${idx + 1}</td>
          <td>
            <strong>${E(lesson.title)}</strong>
            <small style="display:block;color:var(--muted)">${E(lesson.lesson_code)}${lesson.topic ? ' · ' + E(lesson.topic) : ''}</small>
          </td>
          <td style="text-align:center">
            <input type="number" min="0" max="30" class="mx-grid-input" data-lesson-code="${E(lesson.lesson_code)}" data-grid-type="MC_B" value="${mc_b}" style="width:54px;text-align:center;font-weight:600;padding:4px"${dis}>
          </td>
          <td style="text-align:center">
            <input type="number" min="0" max="30" class="mx-grid-input" data-lesson-code="${E(lesson.lesson_code)}" data-grid-type="MC_H" value="${mc_h}" style="width:54px;text-align:center;font-weight:600;padding:4px"${dis}>
          </td>
          ${isTHPT ? `
          <td style="text-align:center">
            <input type="number" min="0" max="10" class="mx-grid-input" data-lesson-code="${E(lesson.lesson_code)}" data-grid-type="YN" value="${yn}" style="width:54px;text-align:center;font-weight:600;padding:4px"${dis}>
          </td>` : ''}
          <td style="text-align:center">
            <input type="number" min="0" max="10" class="mx-grid-input" data-lesson-code="${E(lesson.lesson_code)}" data-grid-type="ES_VD" value="${es_vd}" style="width:54px;text-align:center;font-weight:600;padding:4px"${dis}>
          </td>
          <td style="text-align:center">
            <input type="number" min="0" max="10" class="mx-grid-input" data-lesson-code="${E(lesson.lesson_code)}" data-grid-type="ES_VDC" value="${es_vdc}" style="width:54px;text-align:center;font-weight:600;padding:4px"${dis}>
          </td>
          <td style="text-align:center;font-weight:600">${totalQ} câu</td>
          <td style="text-align:center;font-weight:700;color:var(--blue)">${Math.round(lessonPts * 100) / 100}đ</td>
        </tr>
      `;
    }).join('');

    let tot_mc_b = 0, tot_mc_h = 0, tot_yn = 0, tot_es_vd = 0, tot_es_vdc = 0;
    (m.slots || []).forEach(s => {
      const r = reqMap.get(s.parts[0]?.requirement_id);
      if (!r) return;
      if (s.kind === 'MC') {
        if (r.level === 'Biết') tot_mc_b++;
        else if (r.level === 'Hiểu') tot_mc_h++;
      } else if (s.kind === 'YN') {
        tot_yn++;
      } else if (s.kind === 'ES') {
        if (r.level === 'Vận dụng' || r.level === 'Vận dụng thấp') tot_es_vd++;
        else if (r.level === 'Vận dụng cao') tot_es_vdc++;
      }
    });

    const totalQuestions = tot_mc_b + tot_mc_h + tot_yn + tot_es_vd + tot_es_vdc;
    const parts = (m.slots || []).flatMap(s => s.parts || []);
    const totalScore = Math.round(parts.reduce((sum, p) => sum + Number(p.points || 0), 0) * 100) / 100;
    const isPerfect10 = totalScore === 10;

    return `
      <div class="card" style="border:1px solid #c2dbf1;background:#fafdff;margin-bottom:20px;padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">
          <div>
            <h3 style="margin:0 0 4px;color:var(--navy);font-size:17px">📊 Bảng ma trận 2D trực quan (Chỉnh sửa số câu trực tiếp trên web)</h3>
            <p style="margin:0;font-size:13px;color:var(--muted)">Nhập trực tiếp số câu vào từng ô theo từng mức độ nhận thức. Hệ thống tự động tính điểm và đồng bộ vào danh sách câu hỏi chi tiết.</p>
          </div>
          <div class="actions">
            <button type="button" class="primary" data-action="apply-preset" title="Nạp mẫu chuẩn 10.0 điểm đã tối ưu cho Khối này">⚡ Nạp mẫu chuẩn Á Châu (10.0đ)</button>
            <button type="button" data-action="load-ppct-lessons" title="Kéo tất cả các bài học từ Phân phối chương trình sang">📚 Nạp bài học từ PPCT</button>
            <button type="button" class="danger quiet" data-action="clear-slots" title="Xóa toàn bộ câu hỏi để phân bố lại từ đầu">🗑️ Xóa phân bố</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="matrix-grid-table" style="width:100%;border-collapse:collapse;font-size:13px;background:white">
            <thead>
              <tr style="background:#0267B1;color:white;text-align:center">
                <th rowspan="2" style="width:40px;padding:8px;border:1px solid #7ab6e2">TT</th>
                <th rowspan="2" style="padding:8px;border:1px solid #7ab6e2;text-align:left">Bài học / Nội dung</th>
                <th colspan="2" style="padding:6px;border:1px solid #7ab6e2">Phần I: TN nhiều lựa chọn (0.25đ/câu)</th>
                ${isTHPT ? `<th rowspan="2" style="padding:6px;border:1px solid #7ab6e2">Phần II: Đúng/Sai (1.0đ/câu - 4 ý)</th>` : ''}
                <th colspan="2" style="padding:6px;border:1px solid #7ab6e2">Phần ${isTHPT ? 'III' : 'II'}: Tự luận</th>
                <th rowspan="2" style="width:80px;padding:8px;border:1px solid #7ab6e2">Tổng câu</th>
                <th rowspan="2" style="width:80px;padding:8px;border:1px solid #7ab6e2">Điểm số</th>
              </tr>
              <tr style="background:#005896;color:white;text-align:center">
                <th style="width:75px;padding:6px;border:1px solid #7ab6e2">Biết</th>
                <th style="width:75px;padding:6px;border:1px solid #7ab6e2">Hiểu</th>
                <th style="width:75px;padding:6px;border:1px solid #7ab6e2">Vận dụng</th>
                <th style="width:75px;padding:6px;border:1px solid #7ab6e2">Vận dụng cao</th>
              </tr>
            </thead>
            <tbody>
              ${lessonRows || '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--muted)">Chưa có bài học nào. Bấm "+ Thêm bài" hoặc "📚 Nạp bài học từ PPCT" để bắt đầu.</td></tr>'}
            </tbody>
            <tfoot>
              <tr style="background:#eaf3fb;font-weight:700">
                <td colspan="2" style="text-align:right;padding:10px 12px;color:var(--navy)">TỔNG CỘNG TOÀN BÀI:</td>
                <td style="text-align:center;color:var(--navy)">${tot_mc_b} câu<br><small style="font-weight:400;color:var(--muted)">${(tot_mc_b * 0.25).toFixed(2)}đ</small></td>
                <td style="text-align:center;color:var(--navy)">${tot_mc_h} câu<br><small style="font-weight:400;color:var(--muted)">${(tot_mc_h * 0.25).toFixed(2)}đ</small></td>
                ${isTHPT ? `<td style="text-align:center;color:var(--navy)">${tot_yn} câu<br><small style="font-weight:400;color:var(--muted)">${(tot_yn * 1.0).toFixed(2)}đ</small></td>` : ''}
                <td style="text-align:center;color:var(--navy)">${tot_es_vd} câu<br><small style="font-weight:400;color:var(--muted)">${(tot_es_vd * (isTHPT ? 0.75 : 1.0)).toFixed(2)}đ</small></td>
                <td style="text-align:center;color:var(--navy)">${tot_es_vdc} câu<br><small style="font-weight:400;color:var(--muted)">${(tot_es_vdc * (isTHPT ? 0.75 : 1.0)).toFixed(2)}đ</small></td>
                <td style="text-align:center;font-size:14px;color:var(--navy)">${totalQuestions} câu</td>
                <td style="text-align:center;font-size:15px;color:${isPerfect10 ? '#1d7058' : '#bd2336'}">${totalScore}đ</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div style="font-size:13px;color:var(--ink)">
            ${isPerfect10
              ? `<span style="display:inline-flex;align-items:center;gap:6px;background:#e6f4ea;color:#137333;padding:5px 12px;border-radius:20px;font-weight:700">✓ Ma trận đã cân đối chính xác 10.0 / 10.0 điểm</span>`
              : `<span style="display:inline-flex;align-items:center;gap:6px;background:#fce8e6;color:#c5221f;padding:5px 12px;border-radius:20px;font-weight:700">⚠️ Tổng điểm hiện tại: ${totalScore} / 10.0 điểm (${totalScore < 10 ? 'Thiếu ' + (10 - totalScore).toFixed(2) + 'đ' : 'Vượt ' + (totalScore - 10).toFixed(2) + 'đ'})</span>`
            }
          </div>
          <div style="font-size:12px;color:var(--muted)">
            Phân bố tỉ lệ: <strong>Nhận biết ${(tot_mc_b*0.25*10).toFixed(0)}%</strong> · <strong>Thông hiểu ${(tot_mc_h*0.25*10).toFixed(0)}%</strong> · <strong>Vận dụng + VDC ${((10 - (tot_mc_b+tot_mc_h)*0.25)*10).toFixed(0)}%</strong>
          </div>
        </div>
      </div>
    `;
  }

  const ui={container:null,ctx:null,records:[],editing:null,dirty:false,report:null,busy:false,filter:{},importing:null,generation:null,comparison:null,previewState:null};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const opt=(v,text,selected)=>`<option value="${E(v)}"${selected?' selected':''}>${E(text)}</option>`;
  const uid=p=>p+'-'+Math.random().toString(36).slice(2,11);
  const qs=s=>ui.container.querySelector(s);
  const lessons=grade=>(ui.ctx.ppct.lessons||[]).filter(l=>l.grade===Number(grade));
  function message(text,error=false){ui.ctx.notify(text,error);}
  function detail(e){const errors=e.details?.errors||e.details?.validation?.errors;return e.message+(errors?'\n'+errors.map(x=>x.message).join('\n'):'');}
  async function run(work){if(ui.busy)return;ui.busy=true;ui.container.querySelectorAll('button').forEach(b=>b.disabled=true);try{await work();}catch(e){message(detail(e),true);if(e.details?.errors){ui.report=e.details;renderReport();}}finally{ui.busy=false;ui.container.querySelectorAll('button').forEach(b=>b.disabled=false);restoreButtons();}}
  function restoreButtons(){
    if(!ui.editing)return;
    const actions=visibleActions(ui.editing);
    const canLock=Boolean(ui.report?.valid || ui.report?.ok || ui.editing?.reconciliation?.confirmed || qs('#mx-confirm-agreement')?.checked);
    ui.container.querySelectorAll('[data-action]').forEach(b=>{
      const a=b.dataset.action;
      if(['save','review','preview','lock','export'].includes(a))
        b.disabled=!actions.includes(a)||((a!=='save')&&(!ui.editing.id||ui.dirty))||(a==='lock'&&!canLock);
      if(a==='compare')b.disabled=!ui.editing.id||ui.dirty;
    });
    ui.container.querySelectorAll('button:not([data-action])').forEach(b=>b.disabled=false);
  }
  async function refresh(){const d=await ui.ctx.request('/api/matrices');ui.records=d.matrices||[];}
  async function mount(container,context){ui.container=container;ui.ctx=context;await run(async()=>{await refresh();render();});}
  function recordBadges(m){
    const issues=m.reconciliation?.issues||[];
    const notes=m.source?.comparison_notes||[];
    const parts=(m.slots||[]).flatMap(s=>s.parts||[]);
    const essayIssue=issues.find(i=>i.code==='source_essay_disagreement');
    return `<span class="badge ${E(m.status)}">${E(states[m.status])}</span>`+
      (essayIssue?`<span class="badge mx-warn-badge">Cần xác minh: 9/12 ý tự luận</span>`:issues.length?`<span class="badge mx-warn-badge">${issues.length} điểm cần xác minh</span>`:`<span class="badge approved">Khớp số lượng ma trận & đặc tả</span>`)+
      (notes.length?`<span class="badge content_checked">${notes.length} ghi chú đối chiếu</span>`:'')+
      `<small>Phiên bản ${m.version} · ${m.slots?.length||0} câu (${parts.length} ý) · ${m.total_points??10} điểm</small>`;
  }
  const grades=()=>root.BankCore?.contextGrades?.(ui.ctx?.context||{})||[6,7,8,9,10,11,12];
  const generic=()=>ui.ctx?.context?.school_profile===false;
  const subject=m=>m?.subject_name||ui.ctx?.context?.subject_name||'Tin học';
  const competencies=()=>ui.ctx?.context?.competencies||['NLa','NLb','NLc','NLd','NLe'];
  const apiUrl=path=>root.BankCore?.scopedUrl?.(path,ui.ctx?.context?.curriculum_id||'')||path;
  function render(){
    const f=ui.filter;
    ui.container.innerHTML=`<div class="page-head"><div><p class="eyebrow">MA TRẬN THEO CHƯƠNG TRÌNH</p><h1>Ma trận & đặc tả</h1><p>Lập phân bố câu hỏi và yêu cầu cần đạt theo môn, khối lớp của bạn. Đầy đủ thao tác Tạo mới, Xem, Sửa, Nhân bản, Mở khóa và Xóa.</p></div><div class="actions">${grades().map(g=>`<button class="primary" data-action="new" data-grade="${g}">+ Tạo ma trận khối ${g}</button>`).join('')}<button data-action="import">Nhập ma trận</button></div></div>
    <div class="matrix-flow"><span>1. Biên soạn / nhận nguồn</span><span>2. Đối chiếu & thống nhất</span><span>3. Khóa phiên bản</span><span>4. Tạo đề riêng · xuất Word</span></div>
    <div class="card"><div class="filters"><div class="field"><label for="mx-filter-grade">Khối</label><select id="mx-filter-grade" data-filter="grade">${opt('','Tất cả khối',!f.grade)}${grades().map(g=>opt(g,'Khối '+g,String(f.grade)===String(g))).join('')}</select></div><div class="field"><label for="mx-filter-period">Kỳ</label><select id="mx-filter-period" data-filter="period">${opt('','Tất cả kỳ',!f.period)}${Object.entries(periods).map(([k,v])=>opt(k,v,f.period===k)).join('')}</select></div><div class="field"><label for="mx-filter-status">Trạng thái</label><select id="mx-filter-status" data-filter="status">${opt('','Tất cả trạng thái',!f.status)}${Object.entries(states).map(([k,v])=>opt(k,v,f.status===k)).join('')}</select></div><div class="field"><label for="mx-filter-year">Năm học</label><input id="mx-filter-year" data-filter="year" value="${E(f.year||'')}" placeholder="2026-2027"></div></div>
    <div class="mx-records">${filterRecords(ui.records,f).length?filterRecords(ui.records,f).slice().reverse().map(m=>{const issues=m.reconciliation?.issues||[];return `<article class="mx-record-card${ui.editing?.id===m.id?' active':''}"><div class="mx-record-main"><button class="mx-record" data-open="${E(m.id)}"><span><strong>${E(m.title)}</strong><small>Khối ${m.grade} · ${E(profileLabel(m.profile))} · ${E(m.school_year)} · ${E(m.campus||'Chưa ghi cơ sở')} · ${m.mode==='received'?'Bản nhận từ tệp Word gốc':'Phụ trách biên soạn'}${m.source?.name?` (${E(m.source.name)})`:''}</small>${issues.length?`<span class="mx-inline-issues">${issues.map(x=>E(x.message)).join(' • ')}</span>`:''}</span><span class="mx-record-meta">${recordBadges(m)}</span></button></div><div class="mx-record-actions"><button type="button" data-open="${E(m.id)}">Mở & biên tập</button><button type="button" class="primary" data-action="preview-id" data-id="${E(m.id)}">Xem toàn bộ</button><button type="button" data-action="compare-id" data-id="${E(m.id)}">Đối chiếu bản gốc (2 cột)</button><button type="button" data-action="duplicate-id" data-id="${E(m.id)}">Nhân bản</button><button type="button" class="danger" data-action="delete-id" data-id="${E(m.id)}">Xóa</button></div></article>`;}).join(''):'<div class="empty"><h3>Chưa có hồ sơ ma trận</h3><p>Tạo ma trận cho chương trình đang mở hoặc nhập gói dữ liệu phù hợp.</p></div>'}</div></div>
    <div id="mx-preview" class="card mx-preview" hidden></div><div id="mx-work"></div>`;
    ui.container.onclick=click;ui.container.onchange=change;ui.container.oninput=input;
    ui.container.onkeydown=function(e){if(e.key==='Enter'&&e.target.matches('.mx-grid-input')){e.preventDefault();e.target.blur();}};
    if(ui.editing)renderEditor();else if(ui.generation)renderGeneration();else if(ui.importing)renderImport();
    if(ui.comparison)renderComparisonBox();else if(ui.previewState)renderPreviewBox();
  }
  function field(label,path,value,type='text',disabled=false){const id='mx-'+path.replaceAll('.','-');return `<div class="field"><label for="${id}">${E(label)}</label><input id="${id}" data-field="${E(path)}" type="${type}" value="${E(value??'')}"${disabled?' disabled':''}></div>`;}
  function select(label,path,options,disabled=false){const id='mx-'+path.replaceAll('.','-');return `<div class="field"><label for="${id}">${E(label)}</label><select id="${id}" data-field="${E(path)}"${disabled?' disabled':''}>${options}</select></div>`;}
  function newDraft(grade, usePreset=true){
    const g=Number(grade)||grades()[0];
    const preset=(usePreset&&STANDARD_PRESETS&&STANDARD_PRESETS[String(g)])?clone(STANDARD_PRESETS[String(g)]):null;
    if(preset){
      preset.id='';
      preset.family_id='';
      preset.version=1;
      preset.revision=0;
      preset.status='draft';
      preset.mode='authored';
      preset.owner_name=preset.owner_name||'Tổ Tin học Á Châu';
      preset.campus=preset.campus||(generic()?'':'Cao Thắng');
      preset.school_year=ui.ctx?.context?.school_year||preset.school_year||'2026-2027';
      preset.subject_name=subject();
      preset.allow_custom_override=true;
      preset.reconciliation={confirmed:true,issues:[]};
      preset.audit=[{at:new Date().toISOString(),action:'create_preset'}];
      return preset;
    }
    return {id:'',family_id:'',version:1,revision:0,status:'draft',mode:'authored',profile:generic()?'GENERAL':g>=10?'THPT':'THCS',grade:g,school_year:ui.ctx?.context?.school_year||'2026-2027',subject_name:subject(),exam_type:'GK1',duration:45,title:`Ma trận Giữa HK1 ${subject()} ${g}`,owner_name:'',campus:generic()?'':'Cao Thắng',total_points:10,lessons:[],requirements:[],slots:[],indicator_catalog:[],source:null,reconciliation:{confirmed:true,issues:[]},audit:[],allow_custom_override:true};
  }
  function renderEditor(){
    const m=ui.editing,custom=Boolean(m.allow_custom_override),locked=!custom&&['locked','archived'].includes(m.status),received=!custom&&m.mode==='received',protectedFields=locked||received;
    qs('#mx-work').innerHTML=`<section class="card mx-editor"><div class="mx-editor-head"><div><p class="eyebrow">${custom?'CHẾ ĐỘ SỬA TOÀN DIỆN (TÙY CHỈNH)':received?'NHẬN NGUỒN · BẢO TOÀN CHỈ TIÊU':'PHỤ TRÁCH BIÊN SOẠN'}</p><h2>${E(m.title)} <span class="badge">V${m.version}</span></h2><p>${E(states[m.status])}${custom?' · Đang mở khóa tùy chỉnh toàn diện':''}<span id="mx-dirty">${ui.dirty?' · Có thay đổi chưa lưu':''}</span></p></div><div class="actions"><button data-action="preview">Xem toàn bộ bảng</button>${m.mode==='received'||m.source?`<button data-action="compare">Đối chiếu bản gốc (2 cột)</button>`:''}${(locked||received)?`<button type="button" data-action="unlock-custom">🔓 Bật sửa toàn diện</button>`:''}${m.id?`<button type="button" data-action="duplicate-id" data-id="${E(m.id)}">Nhân bản</button><button type="button" class="danger" data-action="delete-id" data-id="${E(m.id)}">Xóa hồ sơ</button>`:''}<button data-action="save" class="primary">Lưu bản nháp</button><button data-action="discard">${ui.dirty?'Bỏ thay đổi / tải bản đã lưu':'Đóng hồ sơ'}</button></div></div>
    <div class="mx-section-nav"><button type="button" data-scroll="mx-information">Thông tin</button><button type="button" data-scroll="mx-grid">Ma trận 2D</button><button type="button" data-scroll="mx-lessons">Bài & YCCĐ</button><button type="button" data-scroll="mx-slots">Phân bố câu / ý</button><button type="button" data-scroll="mx-validation">Đối chiếu</button><button type="button" data-scroll="mx-output">Word & phiên bản</button></div>
    ${received?'<div class="callout">Đang ở chế độ bảo toàn chỉ tiêu nguồn (chỉ bổ sung ánh xạ PPCT và số câu). Nếu bạn muốn thêm/sửa/xóa bài học, YCCĐ hoặc phân bố câu hỏi trực tiếp, hãy bấm nút <strong>"🔓 Bật sửa toàn diện"</strong> ở góc phải phía trên.</div>':''}
    <h3 id="mx-information">1. Thông tin hồ sơ</h3><div class="form-grid">${field('Tên hồ sơ','title',m.title,'text',locked)}${select('Khối lớp','grade',grades().map(g=>opt(g,'Khối '+g,Number(m.grade)===g)).join(),protectedFields)}${field('Người phụ trách biên soạn','owner_name',m.owner_name,'text',locked)}${field('Cơ sở của người phụ trách','campus',m.campus,'text',locked)}${field('Năm học','school_year',m.school_year,'text',protectedFields)}${select('Kỳ kiểm tra','exam_type',Object.entries(periods).map(([k,v])=>opt(k,v,k===m.exam_type)).join(''),protectedFields)}${field('Thời gian (phút)','duration',m.duration,'number',protectedFields)}${select('Kiểu mẫu','profile',(generic()?['GENERAL']:['THCS','THPT']).map(k=>opt(k,profileLabel(k),k===m.profile)).join(''),protectedFields)}</div>
    ${profileOptionsHtml(m,locked)}
    <div id="mx-grid">${matrixGridHtml(m, locked, received)}</div>
    <h3 id="mx-lessons">2. Bài học & yêu cầu cần đạt</h3><p class="muted">Khối ${m.grade}. Nội dung cụ thể liên kết với yêu cầu cần đạt nguồn của PPCT. Các chỉ báo có thể được chọn thay thế theo quy định của mẫu.</p>
    ${!protectedFields?`<div class="actions"><label for="mx-add-lesson">Bài cần thêm</label><select id="mx-add-lesson">${lessons(m.grade).filter(l=>!m.lessons.some(x=>x.lesson_code===l.lesson_code)).map(l=>opt(l.lesson_code,l.lesson_name_source,false)).join('')}</select><button data-action="add-lesson">+ Thêm bài</button></div>`:''}
    ${m.lessons.map((lesson,i)=>`<article class="mx-lesson"><div class="dialog-heading" style="margin-bottom:8px"><h4>${E(lesson.title)}</h4>${!protectedFields?`<button type="button" class="quiet danger" data-action="remove-lesson" data-index="${i}">Xóa bài này</button>`:''}</div>${select('Đối chiếu bài PPCT '+(i+1),`lessons.${i}.lesson_code`,opt('','Chọn bài đối chiếu',!lesson.lesson_code)+lessons(m.grade).map(l=>opt(l.lesson_code,l.lesson_name_source,l.lesson_code===lesson.lesson_code)).join(''),locked)}${!received?`<div class="form-grid">${field('Tên bài hiển thị '+(i+1),`lessons.${i}.title`,lesson.title,'text',locked)}${field('Tên chủ đề '+(i+1),`lessons.${i}.topic`,lesson.topic,'text',locked)}</div>`:`<p class="muted">Nguồn: ${E(lesson.topic)}</p>`}
    ${m.requirements.map((r,ri)=>r.lesson_code===lesson.lesson_code&&(!received||r.source_index===lesson.source_index)?requirementEditor(r,ri,locked,received):'').join('')}
    ${!protectedFields?`<button data-action="add-requirement" data-index="${i}">+ Thêm yêu cầu / chỉ báo kiểm tra</button>`:''}</article>`).join('')}
    ${m.profile==='THPT'?`<h3>Danh mục chỉ báo năng lực</h3><p class="muted">Giữ nguyên mã và mô tả chỉ báo của nguồn. Bảng phân bố năng lực được dựng từ các vị trí đã gắn mã.</p>${m.indicator_catalog.map((c,i)=>`<div class="form-grid mx-indicator">${field('Mã chỉ báo '+(i+1),`indicator_catalog.${i}.code`,c.code,'text',protectedFields)}${select('Năng lực của mã '+(i+1),`indicator_catalog.${i}.competency`,['NLa','NLb','NLc'].map(k=>opt(k,k,k===c.competency)).join(''),protectedFields)}${field('Mô tả chỉ báo '+(i+1),`indicator_catalog.${i}.text`,c.text,'text',protectedFields)}${!protectedFields?`<div class="field" style="justify-content:flex-end"><button type="button" class="quiet danger" data-action="remove-indicator" data-index="${i}">Xóa mã</button></div>`:''}</div>`).join('')}${!protectedFields?'<button data-action="add-indicator">+ Thêm mã chỉ báo</button>':''}`:''}
    <h3 id="mx-slots">3. Phân bố câu hỏi và ý</h3>${!protectedFields?bulkEditor():''}<div id="mx-summary" class="mx-totals"></div>
    <div class="table-wrap"><table class="mx-slots-table"><thead><tr><th>Câu / dạng</th><th>Ý</th><th>Yêu cầu cần đạt cụ thể</th><th>Điểm</th>${m.profile==='THPT'?'<th>Mã chỉ báo</th>':''}${!protectedFields?'<th>Thao tác</th>':''}</tr></thead><tbody>${m.slots.map((s,si)=>s.parts.map((p,pi)=>slotEditor(s,si,p,pi,locked,received)).join('')).join('')}</tbody></table></div>
    <h3 id="mx-validation">4. Đối chiếu & xác nhận</h3>${m.mode==='received'?`<p class="small">Tệp nguồn: ${E(m.source?.name||'Gói dữ liệu')} · Dữ liệu gốc được lưu riêng.</p><label class="mx-checkbox"><input type="checkbox" data-field="reconciliation.confirmed"${m.reconciliation.confirmed?' checked':''}${locked?' disabled':''}>Tôi đã đối chiếu các ánh xạ PPCT, vị trí câu và cách tính điểm với bản nguồn.</label>`:''}<div id="mx-report"></div><div id="mx-shortfall"></div><div class="actions"><button data-action="review">Kiểm tra hồ sơ đã lưu</button><button data-action="shortfall">Báo cáo thiếu câu theo ô</button><button data-action="preview" class="primary">Xem toàn bộ bảng</button>${m.mode==='received'||m.source?`<button data-action="compare">Đối chiếu bản gốc (2 cột)</button>`:''}</div>
    <div id="mx-output"><h3>5. Word & phiên bản dùng chung</h3><p class="muted">Gói dùng chung chỉ có ma trận, đặc tả và chỉ báo; không có câu hỏi, đáp án hoặc lịch sử đề riêng.</p><div id="mx-export-links"></div>
    ${!locked?`<details><summary>Xác nhận bản đã thống nhất để khóa</summary><p class="small muted">Thao tác này ghi nhận xác nhận của thầy, không thay chữ ký hay quyết định thực tế của tổ trưởng.</p><div class="form-grid"><div class="field"><label for="mx-confirm-name">Người xác nhận</label><input id="mx-confirm-name"></div><div class="field"><label for="mx-confirm-date">Ngày xác nhận</label><input id="mx-confirm-date" type="date" value="${new Date().toLocaleDateString('sv-SE')}"></div><div class="field full"><label for="mx-confirm-basis">Căn cứ bản đã thống nhất</label><textarea id="mx-confirm-basis" rows="2"></textarea></div></div><label class="mx-checkbox"><input id="mx-confirm-agreement" type="checkbox">Tôi xác nhận đây là bản đã được thống nhất bên ngoài ứng dụng.</label><button class="primary" data-action="lock">Khóa phiên bản này</button></details>`:`<p class="callout">Bản này đang khóa hoặc lưu trữ. Bạn có thể tạo phiên bản mới hoặc mở khóa về bản nháp.</p><div class="actions"><button data-action="new-version">Tạo phiên bản mới</button><button data-action="unlock">Mở khóa về bản nháp</button>${m.status==='locked'?'<button class="primary" data-action="use">Dùng tạo đề riêng</button>':''}</div>`}
    <details><summary>Lịch sử thao tác</summary><ul>${(m.audit||[]).map(a=>`<li>${E(a.at)} · ${E(({save:'Lưu nháp',lock:'Khóa bản thống nhất',archive:'Lưu trữ',new_version:'Tạo phiên bản tiếp theo',import_source:'Nhập nguồn',unlock:'Mở khóa về nháp',duplicate:'Nhân bản hồ sơ'})[a.action]||a.action)}</li>`).join('')}</ul></details><label for="mx-archive-reason">Lý do lưu trữ</label><input id="mx-archive-reason" placeholder="Không dùng bản này để tạo đề mới"><button class="quiet" data-action="archive">Lưu trữ hồ sơ</button></div></section>`;
    updateSummary();renderReport();renderLinks();restoreButtons();
  }
  function requirementEditor(r,i,locked,received){
    const source=lessons(ui.editing.grade).find(l=>l.lesson_code===r.lesson_code);
    return `<div class="mx-requirement"><div class="dialog-heading" style="margin-bottom:6px"><label for="mx-req-${i}">Yêu cầu / chỉ báo ${i+1}</label>${!locked&&!received?`<button type="button" class="quiet danger" data-action="remove-requirement" data-index="${i}">Xóa yêu cầu</button>`:''}</div><textarea id="mx-req-${i}" rows="2" data-field="requirements.${i}.text"${locked||received?' disabled':''}>${E(r.text)}</textarea><div class="form-grid">${select('Mức độ của yêu cầu '+(i+1),`requirements.${i}.level`,requirementLevelOptions(r.level),locked||received)}${select('Năng lực của yêu cầu '+(i+1),`requirements.${i}.competency`,competencies().map(k=>opt(k,competencyLabel(k),k===r.competency)).join(''),locked||received)}${select('YCCĐ nguồn của yêu cầu '+(i+1),`requirements.${i}.ppct_outcome_index`,opt('','Chọn yêu cầu từ PPCT',r.ppct_outcome_index===null)+(source?.outcomes||[]).map((o,n)=>opt(n,o,r.ppct_outcome_index===n)).join(''),locked)}</div></div>`;
  }
  function bulkEditor(){const m=ui.editing;return `<div class="mx-bulk"><h4>Thêm phân bố</h4><div class="form-grid"><div class="field"><label for="mx-bulk-kind">Dạng câu</label><select id="mx-bulk-kind">${Object.entries(kinds).filter(([k])=>effectiveKinds(m).includes(k)).map(([k,v])=>opt(k,v,false)).join('')}</select></div><div class="field span2"><label for="mx-bulk-req">Yêu cầu kiểm tra</label><select id="mx-bulk-req">${m.requirements.map(r=>opt(r.id,`${r.lesson_code} · ${r.level} · ${r.text}`,false)).join('')}</select></div><div class="field"><label for="mx-bulk-count">Số câu mẹ</label><input id="mx-bulk-count" type="number" min="1" max="100" value="1"></div><div class="field"><label for="mx-bulk-parts">Ý / câu tự luận</label><input id="mx-bulk-parts" type="number" min="1" max="10" value="1"></div><div class="field"><label for="mx-bulk-points">Điểm mỗi ý / câu đơn</label><input id="mx-bulk-points" type="number" min="0.01" step="0.05" value="0.25"></div></div><p class="small muted">Đúng/Sai luôn có 4 ý a–d. Số yêu cầu con của tự luận khác với số tiêu chí của hướng dẫn chấm.</p><button data-action="add-slots">Thêm vào phân bố</button></div>`;}
  function slotEditor(s,si,p,pi,locked,received){const m=ui.editing;const rs=m.requirements.filter(r=>!received||(r.source_index===p.source_index&&r.level===p.source_level));return `<tr><td>${pi===0?`${E(NAMEShort(s.kind))} ${s.number}`:''}</td><td>${E(p.label||'—')}</td><td><select aria-label="Yêu cầu vị trí ${E(s.id)} ${pi+1}" data-field="slots.${si}.parts.${pi}.requirement_id"${locked?' disabled':''}>${opt('','Chọn yêu cầu',!p.requirement_id)}${rs.map(r=>opt(r.id,`${r.lesson_code} · ${r.level} · ${r.text}`,r.id===p.requirement_id)).join('')}</select></td><td><input aria-label="Điểm vị trí ${E(s.id)} ${pi+1}" type="number" min="0.01" step="0.05" data-field="slots.${si}.parts.${pi}.points" value="${E(p.points)}"${locked||received?' disabled':''}></td>${m.profile==='THPT'?`<td><select aria-label="Chỉ báo vị trí ${E(s.id)} ${pi+1}" data-field="slots.${si}.parts.${pi}.indicator"${locked||received?' disabled':''}>${opt('','Chọn mã',!p.indicator)}${m.indicator_catalog.map(c=>opt(c.code,c.code,c.code===p.indicator)).join('')}</select></td>`:''}${!locked&&!received?`<td>${pi===0?`<button class="quiet danger" data-action="remove-slot" data-index="${si}">Bỏ câu</button>`:''}</td>`:''}</tr>`;}
  function NAMEShort(k){return {MC:'MC',YN:'Đ/S',SHORT:'Trả lời ngắn',ES:'Tự luận'}[k];}
  function updateSummary(){const m=ui.editing;if(!m||!qs('#mx-summary'))return;const parts=m.slots.flatMap(s=>s.parts);const total=Math.round(parts.reduce((n,p)=>n+Number(p.points||0),0)*10000)/10000;qs('#mx-summary').innerHTML=`<strong>${m.slots.length} câu mẹ</strong><span>${parts.length} câu / ý</span><strong class="${total===10?'mx-good':'mx-bad'}">${total.toLocaleString('vi-VN')} / 10 điểm</strong>`;}
  // B9: báo cáo thiếu câu đã duyệt theo từng ô, có liên kết sang màn hình duyệt đã lọc đúng ô.
  function shortfallHtml(r,allowReview=false){
    const incomplete=r.complete===false;
    const heading=incomplete?'Chưa thể kết luận đủ câu':r.ok?'Đủ câu đã duyệt cho mọi ô':`Còn thiếu ${E(r.total_shortfall)} câu đã duyệt`;
    const known=incomplete&&r.total_shortfall>0?`<p>Đã xác định thiếu ${E(r.total_shortfall)} câu ở các ô đã đối chiếu; các vị trí bên dưới chưa được tính đủ.</p>`:'';
    const issues=(r.issues||[]).length?`<ul>${r.issues.map(i=>`<li>${E(i.message)}</li>`).join('')}</ul>`:'';
    const rows=(r.cells||[]).map((c,i)=>`<tr${c.shortfall?' style="background:#fff7e6"':''}><td>${E(c.lesson_code)}</td><td>${E(c.outcome)}</td><td>${E(NAMEShort(c.kind))}</td><td>${E(c.level)}</td><td>${E(c.needed)}</td><td>${E(c.approved)}</td><td>${E(c.pending_review)}</td><td>${E(c.needs_review)}</td><td>${E(c.draft)}</td><td><strong>${E(c.shortfall||'—')}</strong></td><td>${c.shortfall&&allowReview?`<button type="button" class="export-link" data-open-review="${i}">Mở duyệt ô này</button>`:''}</td></tr>`).join('');
    const cells=rows?`<div class="table-wrap"><table><thead><tr><th>Bài</th><th>YCCĐ</th><th>Dạng</th><th>Mức độ</th><th>Cần</th><th>Đã duyệt</th><th>Chờ duyệt</th><th>Cần sửa</th><th>Nháp</th><th>Thiếu</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'';
    const unresolved=(r.unresolved_slots||[]).length?`<h4>Vị trí cần đối chiếu từng ý</h4><p>Thông tin của cả câu ngân hàng chưa đủ để xác nhận từng ý khớp bài, YCCĐ và mức độ. Chưa tính các vị trí này là đủ hoặc cộng vào số thiếu đã xác định.</p><div class="table-wrap"><table><thead><tr><th>Câu / ý</th><th>Bài</th><th>YCCĐ</th><th>Mức độ</th><th>Điểm</th><th>Cần đối chiếu</th></tr></thead><tbody>${r.unresolved_slots.flatMap(slot=>(slot.parts?.length?slot.parts:[{}]).map(part=>`<tr><td>${E(NAMEShort(slot.kind)||slot.kind)} ${E(slot.number??'')}${E(part.label||'')}</td><td>${E(part.lesson_code||'Chưa ánh xạ')}</td><td>${E(part.outcome||'Chưa ánh xạ')}</td><td>${E(part.level||'Chưa xác định')}</td><td>${E(part.points??'—')}</td><td>${E(slot.reason||'Cần đối chiếu với nguồn.')}</td></tr>`)).join('')}</tbody></table></div>`:'';
    return `<div class="${!incomplete&&r.ok?'callout':'callout warning'}"><strong>${heading}</strong>${known}${issues}${cells}${unresolved}<p class="small muted">Chỉ câu đã duyệt được dùng cho đề chính thức. Không bù câu sang bài, YCCĐ hoặc mức độ khác. Báo cáo chưa đủ căn cứ cần được đối chiếu trước khi kết luận.</p></div>`;
  }
  function renderShortfall(){const el=qs('#mx-shortfall'),r=ui.shortfall;if(!el||!r)return;
    el.innerHTML=shortfallHtml(r,Boolean(ui.ctx.openReview));
    el.querySelectorAll('[data-open-review]').forEach(b=>b.onclick=()=>ui.ctx.openReview(r.cells[Number(b.dataset.openReview)]));}
  function renderReport(){
    const el=qs('#mx-report');if(!el)return;
    const r=ui.report;
    if(!r){
      el.innerHTML='<p class="muted">Lưu nháp và chạy kiểm tra để xem những mục còn thiếu.</p>';
      return;
    }
    const isValid=Boolean(r.valid ?? r.ok);
    el.innerHTML=`<div class="${isValid?'callout':'mx-errors'}">
      <strong>${isValid?'Đã đạt kiểm tra kỹ thuật':'Còn nội dung cần đối chiếu'}</strong>
      ${r.errors?.length?`<ul>${r.errors.map(e=>`<li>${E(e.message||e)}</li>`).join('')}</ul>`:''}
      ${r.warnings?.length?`<div class="callout warning"><strong>Cảnh báo (không chặn)</strong><ul>${r.warnings.map(w=>`<li>${E(w.message||w)}</li>`).join('')}</ul></div>`:''}
      ${isValid?'<p class="small muted" style="margin-top:6px;">✓ Hồ sơ ma trận & đặc tả khớp chuẩn kỹ thuật. Bạn có thể ký duyệt hoặc khóa phiên bản để sử dụng.</p>':''}
    </div>`;
  }
  function renderLinks(){
    const el=qs('#mx-export-links'),m=ui.editing;if(!el)return;
    if(!m.id||ui.dirty){el.innerHTML='<p class="muted">Lưu thay đổi để xuất đúng nội dung đang soạn.</p>';return;}
    el.innerHTML=`<div class="actions">
      <button type="button" class="button primary" data-export="doc-all">Word trọn bộ (.doc)</button>
      <button type="button" class="button" data-export="doc-matrix">Word ma trận</button>
      <button type="button" class="button" data-export="doc-spec">Word đặc tả</button>
      <button type="button" class="button" data-export="pdf">PDF / In</button>
      <button type="button" class="button" data-export="tex">LaTeX (.tex)</button>
      ${m.profile==='THPT'?`<button type="button" class="button" data-export="doc-comp">Word năng lực</button>`:''}
      <button type="button" class="button" data-export="json">Gói dữ liệu dùng chung (.json)</button>
    </div>`;

    el.querySelectorAll('[data-export]').forEach(btn=>{
      btn.onclick=(ev)=>{
        ev.preventDefault();
        const type=btn.dataset.export;
        if(type==='doc-all')downloadMatrixWord(m,'all');
        else if(type==='doc-matrix')downloadMatrixWord(m,'matrix');
        else if(type==='doc-spec')downloadMatrixWord(m,'specification');
        else if(type==='doc-comp')downloadMatrixWord(m,'competencies');
        else if(type==='pdf')printMatrixDoc(m);
        else if(type==='tex')downloadMatrixLatex(m);
        else if(type==='json')downloadMatrixJson(m);
      };
    });
  }
  function changed(){ui.dirty=true;ui.report=null;const mark=qs('#mx-dirty');if(mark)mark.textContent=' · Có thay đổi chưa lưu';updateSummary();renderReport();renderLinks();restoreButtons();}
  function assign(el){
    if(ui.editing&&el.dataset.allowKind!==undefined){
      setAllowedKinds(ui.editing,[...document.querySelectorAll('[data-allow-kind]')].filter(x=>x.checked).map(x=>x.dataset.allowKind));
      changed();renderEditor();return;
    }
    if(ui.editing&&el.dataset.ynCoef!==undefined){setYnCoefficient(ui.editing,Number(el.dataset.ynCoef),el.value);changed();return;}
    if(!ui.editing||!el.dataset.field)return;
    const path=el.dataset.field.split('.'),key=path.pop();let object=ui.editing;
    for(const part of path)object=object[part];const previous=object[key];let value=el.value;
    if(el.type==='checkbox')value=key==='choice_group'?(el.checked?'alternative':null):el.checked;
    else if(el.type==='number'||key==='ppct_outcome_index'||key==='grade')value=value===''?null:Number(value);
    object[key]=value;changed();
    if(key==='grade'){
      ui.editing.profile=generic()?'GENERAL':Number(value)>=10?'THPT':'THCS';
      renderEditor();
    }else if(path[0]==='lessons'&&key==='lesson_code'){
      const lesson=ui.editing.lessons[Number(path[1])];
      ui.editing.requirements.forEach(r=>{if(ui.editing.mode==='received'&&!ui.editing.allow_custom_override?r.source_index===lesson.source_index:r.lesson_code===previous){r.lesson_code=value;r.ppct_outcome_index=null;}});
      renderEditor();
    }else if(key==='ppct_outcome_index'&&(ui.editing.mode==='authored'||ui.editing.allow_custom_override)){
      const r=object,l=lessons(ui.editing.grade).find(x=>x.lesson_code===r.lesson_code);
      if(!r.text&&value!==null){r.text=l?.outcomes[value]||'';renderEditor();}
    }else if(el.tagName==='SELECT'&&['level','profile','competency'].includes(key))renderEditor();
  }
  function captureGeneration(){if(!ui.generation||!qs('#mx-exam-title'))return;const values={};ui.container.querySelectorAll('[id^=mx-exam-],[data-choice],[data-review-slot]').forEach(el=>{const key=el.dataset.reviewSlot?'review:'+el.dataset.reviewSlot+':'+el.value:el.id;values[key]=el.type==='checkbox'?el.checked:el.value;});ui.generation.formValues=values;}
  function input(event){captureGeneration();if(event.target.matches('[data-field]')&&event.target.tagName!=='SELECT'&&event.target.type!=='checkbox')assign(event.target);if(event.target.id==='mx-confirm-agreement')restoreButtons();}
  async function change(event){
    const el=event.target;
    if(el.matches('.mx-grid-input')){
      const lessonCode=el.dataset.lessonCode;
      const gridType=el.dataset.gridType;
      const val=Math.max(0,parseInt(el.value,10)||0);
      updateSlotsFromGrid(ui.editing,lessonCode,gridType,val);
      changed();renderEditor();
      const nextInput=qs('.mx-grid-input[data-lesson-code="' + lessonCode + '"][data-grid-type="' + gridType + '"]');
      if(nextInput){nextInput.focus();nextInput.select();}
      return;
    }
    if(el.matches('[data-field]')&&(el.tagName==='SELECT'||el.type==='checkbox'))assign(el);if(el.matches('[data-allow-kind],[data-yn-coef]'))assign(el);if(el.dataset.filter){ui.filter[el.dataset.filter]=el.value;render();}if(el.id==='mx-file')await readImport(el.files[0]);if(el.id==='mx-confirm-agreement'||el.dataset.field==='reconciliation.confirmed')restoreButtons();if(el.dataset.choice){const id=el.dataset.choice;ui.container.querySelectorAll('[data-review-slot]').forEach(c=>{if(c.dataset.reviewSlot===id)c.checked=false;});showChoice(id);coverage();}if(el.id==='mx-exam-revision')coverage();captureGeneration();}
  function guard(){if(ui.dirty){message('Có thay đổi chưa lưu. Hãy lưu hoặc bấm “Bỏ thay đổi / tải bản đã lưu” trước khi mở hồ sơ khác.',true);return false;}return true;}
  async function openRecord(id,discard=false){if(!discard&&!guard())return;const d=await ui.ctx.request('/api/matrices/'+encodeURIComponent(id));ui.editing=d.matrix;ui.report=d.validation;ui.dirty=false;ui.importing=null;ui.generation=null;render();}
  async function save(){const result=await ui.ctx.request('/api/matrices/save',{matrix:ui.editing,expected_revision:ui.editing.revision,allow_custom_override:Boolean(ui.editing.allow_custom_override)});ui.editing=result.matrix;ui.report=result.validation;ui.dirty=false;await refresh();render();message('Đã lưu bản nháp; nguồn và lịch sử cũ được giữ nguyên.');}
  function rawCellCenter(ri,headers,cols,start,firstText){
    if(ri<headers)return true;
    const f=String(firstText||'').trim().toLowerCase();
    if(f.startsWith('tổng')||f.startsWith('tỉ lệ')||f.startsWith('ti le'))return true;
    if(headers===4)return true;
    if(cols===3&&headers===1)return start===0||start===1;
    if(start===0)return true;
    if(cols>=10&&headers===3&&start>=3)return true;
    if(cols===8&&headers===3&&start>=4)return true;
    return false;
  }
  function renderRawTablesHtml(m){
    const tables=m?.source?.tables||[];if(!tables.length)return '';
    const period={TX:'THƯỜNG XUYÊN',GK1:'GIỮA KÌ 1',CK1:'CUỐI KÌ 1',GK2:'GIỮA KÌ 2',CK2:'CUỐI KÌ 2'}[m.exam_type]||'';
    const sub=`<p class="mx-doc-subhead" align="center"><strong>MÔN: ${E(subject(m).toLocaleUpperCase('vi'))} ${E(m.grade)} - THỜI GIAN LÀM BÀI: ${E(m.duration||45)} PHÚT</strong></p>`;
    const renderOne=(tbl,headers,heading)=>{
      const cols=tbl.columns||1,widths=(tbl.widths&&tbl.widths.length===cols)?tbl.widths:Array(cols).fill(1),tot=widths.reduce((a,b)=>a+b,0)||1;
      let h=`<p class="mx-doc-heading" align="center"><strong>${E(heading)}</strong></p>`+(heading==='Mã hóa ma trận'?'':sub);
      h+=`<table><colgroup>${widths.map(w=>`<col style="width:${(w/tot*100).toFixed(2)}%">`).join('')}</colgroup>`;
      const rows=tbl.rows||[];
      for(let ri=0;ri<rows.length;ri++){
        const header=ri<headers;
        if(ri===0&&header)h+='<thead>';
        if(!header&&ri>0&&ri-1<headers)h+='</thead><tbody>';
        const cells=rows[ri].cells||[],firstText=cells[0]?.text||'';
        h+='<tr>';
        for(const c of cells){
          if(c.vmerge==='continue')continue;
          let rowspan=1;
          if(c.vmerge==='restart'){
            for(let nr=ri+1;nr<rows.length;nr++){
              const cont=(rows[nr].cells||[]).find(x=>x.start===c.start);
              if(!cont||cont.vmerge!=='continue')break;
              rowspan++;
            }
          }
          const isCenter=rawCellCenter(ri,headers,cols,c.start,firstText);
          const align=isCenter?'center':'left';
          const cls=isCenter?'mx-center':(cols===8&&headers===3&&c.start===3?'mx-req-cell':'mx-left');
          const tag=header?'th':'td';
          h+=`<${tag} colspan="${c.span||1}" rowspan="${rowspan}" align="${align}" class="${cls}">${E(c.text||'').replace(/\n/g,'<br>')}</${tag}>`;
        }
        h+='</tr>';
      }
      return h+'</tbody></table>';
    };
    if(tables.length===4){
      return renderOne(tables[0],3,'MA TRẬN ĐỀ KIỂM TRA '+period)+
             renderOne(tables[1],4,'MA TRẬN PHÂN BỐ THEO DẠNG THỨC CÂU HỎI VÀ CẤP ĐỘ TƯ DUY')+
             renderOne(tables[2],1,'Mã hóa ma trận')+
             renderOne(tables[3],3,'BẢNG ĐẶC TẢ ĐỀ KIỂM TRA '+period);
    }
    let out='';
    if(tables[0])out+=renderOne(tables[0],3,'MA TRẬN ĐỀ KIỂM TRA '+period);
    if(tables[1])out+=renderOne(tables[tables.length-1],3,'BẢNG ĐẶC TẢ ĐỀ KIỂM TRA '+period);
    return out;
  }
  function enhanceSheetTables(rootEl){
    if(!rootEl)return;
    rootEl.querySelectorAll('.mx-sheet-body').forEach(sheet=>{
      sheet.querySelectorAll(':scope > p').forEach(p=>{
        p.setAttribute('align','center');
        const up=p.textContent.trim().toUpperCase();
        p.classList.add(up.startsWith('MÔN:')?'mx-doc-subhead':'mx-doc-heading');
      });
      sheet.querySelectorAll('table').forEach(table=>{
        const headRows=table.querySelectorAll('thead tr').length||1;
        const firstRow=table.querySelector('tr');
        let cols=0;if(firstRow)firstRow.querySelectorAll('th,td').forEach(c=>{cols+=Number(c.getAttribute('colspan')||1);});
        if(!table.querySelector('colgroup')&&cols>0){
          let weights=Array(cols).fill(1);
          if(cols===8&&headRows===3)weights=[0.8,3,3.6,9.2,1.8,1.8,1.8,1.8];
          else if(cols>=10&&headRows===3){const kinds=(cols-7)/3;weights=[0.9,3.1,4,...Array(Math.max(0,Math.round(kinds*3))).fill(1.05),1.1,1.1,1.1,1.7];}
          else if(cols===12&&headRows===4)weights=[1.9,1.1,0.7,1.7,1.7,1.7,1.7,1.7,1.7,1.7,1.7,1.7];
          else if(cols===3&&headRows===1)weights=[5.2,1.8,16.8];
          if(weights.length===cols){
            const tot=weights.reduce((a,b)=>a+b,0)||1;
            const cg=document.createElement('colgroup');
            cg.innerHTML=weights.map(w=>`<col style="width:${(w/tot*100).toFixed(2)}%">`).join('');
            table.insertBefore(cg,table.firstChild);
          }
        }
        const occupied={};
        table.querySelectorAll('tr').forEach((tr,ri)=>{
          const cells=[...tr.children];
          const firstText=cells[0]?.textContent||'';
          let colIdx=0;
          cells.forEach(cell=>{
            while(occupied[`${ri}:${colIdx}`])colIdx++;
            const span=Number(cell.getAttribute('colspan')||1),rspan=Number(cell.getAttribute('rowspan')||1);
            for(let dr=0;dr<rspan;dr++)for(let dc=0;dc<span;dc++)occupied[`${ri+dr}:${colIdx+dc}`]=true;
            if(!cell.getAttribute('align')){
              const isHeader=cell.tagName==='TH'||ri<headRows;
              const isCenter=isHeader||rawCellCenter(ri,headRows,cols,colIdx,firstText);
              cell.setAttribute('align',isCenter?'center':'left');
              cell.classList.add(isCenter?'mx-center':(cols===8&&headRows===3&&colIdx===3?'mx-req-cell':'mx-left'));
            }
            colIdx+=span;
          });
        });
      });
    });
  }
  function buildMatrixView(m) {
    const requirements = {};
    (m?.requirements || []).forEach(r => {
      requirements[r.id] = { ...r, refs: [] };
    });

    const rows = [];
    const lookup = {};
    (m?.lessons || []).forEach((lesson, idx) => {
      const row = {
        index: idx + 1,
        lesson_code: lesson.lesson_code,
        title: lesson.title || lesson.lesson_name_source || `Bài ${idx + 1}`,
        topic: lesson.topic || 'Chủ đề',
        cells: {},
        points: 0,
        counts: { 'Biết': 0, 'Hiểu': 0, 'Vận dụng': 0, 'Vận dụng cao': 0 }
      };
      lookup[row.lesson_code] = row;
      rows.push(row);
    });

    const KINDS = ['MC', 'YN', 'SHORT', 'ES'];
    const LEVELS = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
    const totals = {
      points: 0,
      questions: 0,
      items: 0,
      by_kind: {
        MC: { questions: 0, items: 0, points: 0 },
        YN: { questions: 0, items: 0, points: 0 },
        SHORT: { questions: 0, items: 0, points: 0 },
        ES: { questions: 0, items: 0, points: 0 }
      },
      by_level: {
        'Biết': { items: 0, points: 0 },
        'Hiểu': { items: 0, points: 0 },
        'Vận dụng': { items: 0, points: 0 },
        'Vận dụng cao': { items: 0, points: 0 }
      }
    };

    const competencies = [];

    (m?.slots || []).forEach(slot => {
      const kind = slot.kind;
      if (!KINDS.includes(kind)) return;
      totals.questions += 1;
      if (!totals.by_kind[kind]) totals.by_kind[kind] = { questions: 0, items: 0, points: 0 };
      totals.by_kind[kind].questions += 1;

      (slot.parts || []).forEach(part => {
        const req = requirements[part.requirement_id];
        const row = req ? lookup[req.lesson_code] : (rows[0] || null);
        const level = req?.level || 'Biết';

        const label = kind === 'ES' ? `Câu ${slot.number} TL` : `Câu ${slot.number}${part.label || ''}`;
        if (req && !req.refs.includes(label)) req.refs.push(label);

        const pts = Number(part.points || 0);
        if (row) {
          const cellKey = `${kind}|${level}`;
          if (!row.cells[cellKey]) {
            row.cells[cellKey] = { count: 0, refs: [], points: 0 };
          }
          row.cells[cellKey].count += 1;
          row.cells[cellKey].refs.push(label);
          row.cells[cellKey].points += pts;

          row.counts[level] = (row.counts[level] || 0) + 1;
          row.points += pts;
        }

        totals.items += 1;
        totals.points += pts;
        totals.by_kind[kind].items += 1;
        totals.by_kind[kind].points += pts;
        totals.by_level[level].items += 1;
        totals.by_level[level].points += pts;

        competencies.push({
          kind,
          number: slot.number,
          label: part.label || '',
          level,
          competency: req?.competency || '',
          indicator: part.indicator || ''
        });
      });
    });

    const denominator = Number(m?.total_points || 10);
    rows.forEach(row => {
      row.percentage = denominator ? ((row.points / denominator) * 100) : 0;
    });

    return {
      rows,
      requirements: Object.values(requirements),
      totals,
      competencies,
      indicator_catalog: m?.indicator_catalog || []
    };
  }

  function generateMatrixWordHtml(m, section='all') {
    if (!m) return '<p class="muted">Chưa có dữ liệu ma trận.</p>';
    const v = buildMatrixView(m);
    const period = { TX: 'THƯỜNG XUYÊN', GK1: 'GIỮA KÌ 1', CK1: 'CUỐI KÌ 1', GK2: 'GIỮA KÌ 2', CK2: 'CUỐI KÌ 2' }[m.exam_type] || 'GIỮA KÌ 1';
    const subjUpper = (subject(m) || 'TIN HỌC').toLocaleUpperCase('vi');

    let out = '';

    const headerHtml = (title) => `
      <div class="doc-sheet-head" style="text-align:center;margin-bottom:18px;">
        <table style="width:100%;border:none;margin-bottom:12px;font-family:'Times New Roman',Times,serif;table-layout:fixed;">
          <colgroup><col style="width:45%"><col style="width:55%"></colgroup>
          <tr style="border:none;">
            <td style="border:none;text-align:center;vertical-align:top;font-size:11pt;line-height:1.4;padding:0;">
              <strong>TRƯỜNG QUỐC TẾ Á CHÂU</strong><br>
              <strong>TỔ: ${E(subjUpper)}</strong>
            </td>
            <td style="border:none;text-align:center;vertical-align:top;font-size:11pt;line-height:1.4;padding:0;">
              <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br>
              <strong>Độc lập - Tự do - Hạnh phúc</strong><br>
              -----------------
            </td>
          </tr>
        </table>
        <p class="mx-doc-heading" style="font-size:13pt;font-weight:700;margin:12px 0 4px;text-align:center;text-transform:uppercase;">
          <strong>${E(title)}</strong>
        </p>
        <p class="mx-doc-subhead" style="font-size:11.5pt;font-weight:700;margin:0 0 16px;text-align:center;">
          <strong>MÔN: ${E(subjUpper)} ${E(m.grade)} - THỜI GIAN LÀM BÀI: ${E(m.duration || 45)} PHÚT</strong>
        </p>
      </div>
    `;

    // 1. TABLE 1: MA TRẬN
    if (section === 'all' || section === 'matrix') {
      out += headerHtml(`KHUNG MA TRẬN ĐỀ KIỂM TRA ĐỊNH KỲ ${period}`);
      const kinds = effectiveKinds(m);
      const hasVdc = (m.requirements || []).some(r => r.level === 'Vận dụng cao') || (v.totals?.by_level['Vận dụng cao']?.items > 0);
      const levels = hasVdc ? ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'] : ['Biết', 'Hiểu', 'Vận dụng'];
      const levelAbbr = { 'Biết': 'B', 'Hiểu': 'H', 'Vận dụng': 'VD', 'Vận dụng cao': 'VDC' };
      const kindNames = { MC: 'TNKQ', YN: 'Đúng/Sai', SHORT: 'Trả lời ngắn', ES: 'Tự luận' };

      out += `<table style="border-collapse:collapse;width:100%;table-layout:fixed;margin:10px auto 26px;font-family:'Times New Roman',Times,serif;font-size:11pt;">`;
      out += `<thead>`;
      out += `<tr>
        <th rowspan="3" style="width:40px;border:1px solid #333;text-align:center;vertical-align:middle;background:#f0f4f8;">TT</th>
        <th rowspan="3" style="width:140px;border:1px solid #333;text-align:center;vertical-align:middle;background:#f0f4f8;">Chương / Chủ đề</th>
        <th rowspan="3" style="width:190px;border:1px solid #333;text-align:center;vertical-align:middle;background:#f0f4f8;">Nội dung / Đơn vị kiến thức</th>
        <th colspan="${kinds.length * levels.length}" style="border:1px solid #333;text-align:center;background:#f0f4f8;">Mức độ đánh giá</th>
        <th colspan="${levels.length}" style="border:1px solid #333;text-align:center;background:#f0f4f8;">Tổng</th>
        <th rowspan="3" style="width:70px;border:1px solid #333;text-align:center;vertical-align:middle;background:#f0f4f8;">Tỉ lệ % điểm</th>
      </tr>`;
      out += `<tr>`;
      kinds.forEach(k => {
        out += `<th colspan="${levels.length}" style="border:1px solid #333;text-align:center;background:#f0f4f8;">${kindNames[k] || k}</th>`;
      });
      out += `<th colspan="${levels.length}" style="border:1px solid #333;text-align:center;background:#f0f4f8;">Số câu</th>`;
      out += `</tr>`;
      out += `<tr>`;
      kinds.forEach(() => {
        levels.forEach(l => {
          out += `<th style="border:1px solid #333;text-align:center;font-size:10pt;background:#f0f4f8;">${levelAbbr[l] || l}</th>`;
        });
      });
      levels.forEach(l => {
        out += `<th style="border:1px solid #333;text-align:center;font-size:10pt;background:#f0f4f8;">${levelAbbr[l] || l}</th>`;
      });
      out += `</tr>`;
      out += `</thead><tbody>`;

      const topicGroups = [];
      let currentTopic = null;
      let currentGroup = [];
      v.rows.forEach(r => {
        if (r.topic !== currentTopic) {
          if (currentGroup.length) topicGroups.push(currentGroup);
          currentTopic = r.topic;
          currentGroup = [r];
        } else {
          currentGroup.push(r);
        }
      });
      if (currentGroup.length) topicGroups.push(currentGroup);

      let topicIdx = 0;
      topicGroups.forEach(grp => {
        topicIdx++;
        grp.forEach((row, rowInGrp) => {
          out += `<tr>`;
          if (rowInGrp === 0) {
            out += `<td rowspan="${grp.length}" style="border:1px solid #333;text-align:center;vertical-align:middle;">${topicIdx}</td>`;
            out += `<td rowspan="${grp.length}" style="border:1px solid #333;vertical-align:middle;"><strong>${E(grp[0].topic)}</strong></td>`;
          }
          out += `<td style="border:1px solid #333;vertical-align:middle;">${E(row.title)}</td>`;

          kinds.forEach(k => {
            levels.forEach(l => {
              const cell = row.cells[k + '|' + l];
              if (cell && cell.count > 0) {
                out += `<td style="border:1px solid #333;text-align:center;vertical-align:middle;">${cell.count}${k==='ES'?' TL':''}<br><small>(${cell.refs.join(', ')})</small></td>`;
              } else {
                out += `<td style="border:1px solid #333;text-align:center;vertical-align:middle;color:#888;">—</td>`;
              }
            });
          });

          levels.forEach(l => {
            const cnt = row.counts[l] || 0;
            out += `<td style="border:1px solid #333;text-align:center;vertical-align:middle;">${cnt || '—'}</td>`;
          });

          const pct = (row.percentage || 0).toFixed(1).replace('.0', '');
          out += `<td style="border:1px solid #333;text-align:center;vertical-align:middle;"><strong>${pct}%</strong></td>`;
          out += `</tr>`;
        });
      });

      // Bottom Totals rows
      out += `<tr>
        <td colspan="3" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Tổng số câu và ý</strong></td>`;
      kinds.forEach(k => {
        levels.forEach(l => {
          const sum = v.rows.reduce((acc, r) => acc + (r.cells[k + '|' + l]?.count || 0), 0);
          out += `<td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${sum || '—'}</strong></td>`;
        });
      });
      levels.forEach(l => {
        const sum = v.totals.by_level[l]?.items || 0;
        out += `<td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${sum || '—'}</strong></td>`;
      });
      out += `<td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${v.totals.items} câu/ý</strong></td></tr>`;

      out += `<tr>
        <td colspan="3" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Tổng số điểm</strong></td>`;
      kinds.forEach(k => {
        levels.forEach(l => {
          const pts = v.rows.reduce((acc, r) => acc + (r.cells[k + '|' + l]?.points || 0), 0);
          out += `<td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${pts ? pts.toFixed(2).replace(/\.?0+$/, '') : '—'}</strong></td>`;
        });
      });
      levels.forEach(l => {
        const pts = v.totals.by_level[l]?.points || 0;
        out += `<td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${pts ? pts.toFixed(2).replace(/\.?0+$/, '') : '—'}</strong></td>`;
      });
      out += `<td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${(v.totals.points || 10).toFixed(1).replace('.0', '')} đ</strong></td></tr>`;

      out += `<tr>
        <td colspan="3" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Tỉ lệ %</strong></td>`;
      kinds.forEach(k => {
        levels.forEach(l => {
          const pts = v.rows.reduce((acc, r) => acc + (r.cells[k + '|' + l]?.points || 0), 0);
          const pct = (pts / (v.totals.points || 10)) * 100;
          out += `<td style="border:1px solid #333;text-align:center;background:#fafafa;">${pct ? pct.toFixed(1).replace('.0', '') + '%' : '—'}</td>`;
        });
      });
      levels.forEach(l => {
        const pts = v.totals.by_level[l]?.points || 0;
        const pct = (pts / (v.totals.points || 10)) * 100;
        out += `<td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${pct ? pct.toFixed(1).replace('.0', '') + '%' : '—'}</strong></td>`;
      });
      out += `<td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>100%</strong></td></tr>`;

      out += `</tbody></table>`;
    }

    // 2. TABLE 2: BẢNG ĐẶC TẢ
    if (section === 'all' || section === 'specification') {
      if (out && section === 'all') {
        out += `<div style="page-break-before:always;margin-top:40px;"></div>`;
      }
      out += headerHtml(`BẢNG ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KỲ ${period}`);
      out += `<table style="border-collapse:collapse;width:100%;table-layout:fixed;margin:10px auto 26px;font-family:'Times New Roman',Times,serif;font-size:11pt;">`;
      out += `<colgroup>
        <col style="width:40px">
        <col style="width:130px">
        <col style="width:160px">
        <col style="width:340px">
        <col style="width:90px">
        <col style="width:90px">
        <col style="width:90px">
        <col style="width:90px">
      </colgroup>`;
      out += `<thead>`;
      out += `<tr>
        <th rowspan="3" style="border:1px solid #333;text-align:center;vertical-align:middle;background:#f0f4f8;">TT</th>
        <th rowspan="3" style="border:1px solid #333;text-align:center;vertical-align:middle;background:#f0f4f8;">Chương / Chủ đề</th>
        <th rowspan="3" style="border:1px solid #333;text-align:center;vertical-align:middle;background:#f0f4f8;">Nội dung / Đơn vị kiến thức</th>
        <th rowspan="3" style="border:1px solid #333;text-align:center;vertical-align:middle;background:#f0f4f8;">Yêu cầu cần đạt</th>
        <th colspan="4" style="border:1px solid #333;text-align:center;background:#f0f4f8;">Số câu hỏi theo mức độ đánh giá</th>
      </tr>`;
      out += `<tr>
        <th colspan="3" style="border:1px solid #333;text-align:center;background:#f0f4f8;">Trắc nghiệm khách quan</th>
        <th rowspan="2" style="border:1px solid #333;text-align:center;vertical-align:middle;background:#f0f4f8;">Thực hành /<br>Tự luận</th>
      </tr>`;
      out += `<tr>
        <th style="border:1px solid #333;text-align:center;background:#f0f4f8;font-size:10pt;">Nhiều lựa chọn<br>(MC)</th>
        <th style="border:1px solid #333;text-align:center;background:#f0f4f8;font-size:10pt;">Đúng / Sai<br>(YN)</th>
        <th style="border:1px solid #333;text-align:center;background:#f0f4f8;font-size:10pt;">Trả lời ngắn<br>(Short)</th>
      </tr>`;
      out += `</thead><tbody>`;

      const topicGroups2 = [];
      let currentTopic2 = null;
      let currentGroup2 = [];
      v.rows.forEach(r => {
        if (r.topic !== currentTopic2) {
          if (currentGroup2.length) topicGroups2.push(currentGroup2);
          currentTopic2 = r.topic;
          currentGroup2 = [r];
        } else {
          currentGroup2.push(r);
        }
      });
      if (currentGroup2.length) topicGroups2.push(currentGroup2);

      let topicIdx2 = 0;
      topicGroups2.forEach(grp => {
        topicIdx2++;
        grp.forEach((row, rowInGrp) => {
          const lessonReqs = v.requirements.filter(r => r.lesson_code === row.lesson_code);
          let reqHtml = '';
          const LEVELS_ORDER = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
          const LEVEL_NAMES = { 'Biết': 'Nhận biết', 'Hiểu': 'Thông hiểu', 'Vận dụng': 'Vận dụng', 'Vận dụng cao': 'Vận dụng cao' };

          LEVELS_ORDER.forEach(l => {
            const rs = lessonReqs.filter(r => r.level === l);
            if (!rs.length) return;
            reqHtml += `<p style="margin:4px 0 2px 0;"><strong>${LEVEL_NAMES[l]}:</strong></p>`;
            rs.forEach(r => {
              const refsText = r.refs?.length ? ` (${r.refs.join(', ')})` : '';
              reqHtml += `<p style="margin:2px 0 3px 12px;text-indent:-8px;">– ${E(r.text.replace(/\s*\(c[aâ]u\s+[^)]+\)/i, ''))}<strong>${refsText}</strong>.</p>`;
            });
          });

          if (!reqHtml) reqHtml = `<p class="muted">Đạt yêu cầu chương trình GDPT 2018.</p>`;

          const cellMC = row.cells['MC|Biết'] || row.cells['MC|Hiểu'] || row.cells['MC|Vận dụng'] ?
            ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'].map(lvl => {
              const c = row.cells['MC|' + lvl];
              return c ? `${c.count} ${lvl === 'Biết' ? 'B' : lvl === 'Hiểu' ? 'H' : 'VD'}` : '';
            }).filter(Boolean).join('<br>') : '0';

          const cellYN = row.cells['YN|Biết'] || row.cells['YN|Hiểu'] || row.cells['YN|Vận dụng'] ?
            ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'].map(lvl => {
              const c = row.cells['YN|' + lvl];
              return c ? `${c.count} YN` : '';
            }).filter(Boolean).join('<br>') : '0';

          const cellShort = row.cells['SHORT|Biết'] || row.cells['SHORT|Hiểu'] || row.cells['SHORT|Vận dụng'] ?
            ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'].map(lvl => {
              const c = row.cells['SHORT|' + lvl];
              return c ? `${c.count} Short` : '';
            }).filter(Boolean).join('<br>') : '0';

          const cellES = row.cells['ES|Biết'] || row.cells['ES|Hiểu'] || row.cells['ES|Vận dụng'] || row.cells['ES|Vận dụng cao'] ?
            ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'].map(lvl => {
              const c = row.cells['ES|' + lvl];
              return c ? `${c.count} ${lvl === 'Vận dụng cao' ? 'VDC' : 'VD'}` : '';
            }).filter(Boolean).join('<br>') : '0';

          out += `<tr>`;
          if (rowInGrp === 0) {
            out += `<td rowspan="${grp.length}" style="border:1px solid #333;text-align:center;vertical-align:middle;">${topicIdx2}</td>`;
            out += `<td rowspan="${grp.length}" style="border:1px solid #333;vertical-align:middle;"><strong>${E(grp[0].topic)}</strong></td>`;
          }
          out += `<td style="border:1px solid #333;vertical-align:middle;">${E(row.title)}</td>
            <td style="border:1px solid #333;vertical-align:top;line-height:1.45;padding:8px 10px;">${reqHtml}</td>
            <td style="border:1px solid #333;text-align:center;vertical-align:middle;">${cellMC}</td>
            <td style="border:1px solid #333;text-align:center;vertical-align:middle;">${cellYN}</td>
            <td style="border:1px solid #333;text-align:center;vertical-align:middle;">${cellShort}</td>
            <td style="border:1px solid #333;text-align:center;vertical-align:middle;">${cellES}</td>
          </tr>`;
        });
      });

      const mcTot = v.totals.by_kind.MC?.items || 0;
      const ynTot = v.totals.by_kind.YN?.items || 0;
      const shortTot = v.totals.by_kind.SHORT?.items || 0;
      const esTot = v.totals.by_kind.ES?.items || 0;

      const ptsB = v.totals.by_level['Biết']?.points || 0;
      const ptsH = v.totals.by_level['Hiểu']?.points || 0;
      const ptsVD = v.totals.by_level['Vận dụng']?.points || 0;
      const ptsVDC = v.totals.by_level['Vận dụng cao']?.points || 0;
      const tTotPts = v.totals.points || 10;

      const pctB = ((ptsB / tTotPts) * 100).toFixed(0);
      const pctH = ((ptsH / tTotPts) * 100).toFixed(0);
      const pctVD = ((ptsVD / tTotPts) * 100).toFixed(0);
      const pctVDC = ((ptsVDC / tTotPts) * 100).toFixed(0);

      const tnkqPts = (v.totals.by_kind.MC?.points || 0) + (v.totals.by_kind.YN?.points || 0) + (v.totals.by_kind.SHORT?.points || 0);
      const tlPts = v.totals.by_kind.ES?.points || 0;
      const tnkqPct = ((tnkqPts / tTotPts) * 100).toFixed(0);
      const tlPct = ((tlPts / tTotPts) * 100).toFixed(0);

      out += `<tr>
        <td colspan="4" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Tổng</strong></td>
        <td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${mcTot} câu</strong></td>
        <td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${ynTot ? ynTot + ' câu' : '0'}</strong></td>
        <td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${shortTot ? shortTot + ' câu' : '0'}</strong></td>
        <td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${esTot} câu</strong></td>
      </tr>`;

      out += `<tr>
        <td colspan="4" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Tỉ lệ %</strong></td>
        <td colspan="4" style="border:1px solid #333;text-align:center;background:#fafafa;">
          <strong>Biết: ${pctB}% | Hiểu: ${pctH}% | Vận dụng: ${pctVD}%${Number(pctVDC) ? ` | Vận dụng cao: ${pctVDC}%` : ''}</strong>
        </td>
      </tr>`;

      out += `<tr>
        <td colspan="4" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Tỉ lệ chung</strong></td>
        <td colspan="3" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Trắc nghiệm (B + H): ${tnkqPct}%</strong></td>
        <td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Tự luận (VD + VDC): ${tlPct}%</strong></td>
      </tr>`;

      out += `</tbody></table>`;
    }

    // 3. TABLE 3: NĂNG LỰC (THPT)
    if ((section === 'all' || section === 'competencies') && m.profile === 'THPT' && v.competencies.length) {
      if (out) out += `<div style="page-break-before:always;margin-top:40px;"></div>`;
      out += headerHtml(`MA TRẬN PHÂN BỐ THEO DẠNG THỨC CÂU HỎI VÀ CẤP ĐỘ TƯ DUY`);
      out += `<table style="border-collapse:collapse;width:100%;table-layout:fixed;margin:10px auto 26px;font-family:'Times New Roman',Times,serif;font-size:11pt;">`;
      out += `<thead><tr>
        <th style="border:1px solid #333;width:120px;text-align:center;background:#f0f4f8;">Dạng thức</th>
        <th style="border:1px solid #333;width:90px;text-align:center;background:#f0f4f8;">Câu hỏi</th>
        <th style="border:1px solid #333;width:60px;text-align:center;background:#f0f4f8;">Ý</th>
        <th style="border:1px solid #333;width:100px;text-align:center;background:#f0f4f8;">Cấp độ tư duy</th>
        <th style="border:1px solid #333;width:120px;text-align:center;background:#f0f4f8;">Năng lực</th>
        <th style="border:1px solid #333;text-align:center;background:#f0f4f8;">Mã chỉ báo</th>
      </tr></thead><tbody>`;
      v.competencies.forEach(c => {
        out += `<tr>
          <td style="border:1px solid #333;text-align:center;">${NAMEShort(c.kind) || c.kind}</td>
          <td style="border:1px solid #333;text-align:center;">Câu ${c.number}</td>
          <td style="border:1px solid #333;text-align:center;">${c.label || '—'}</td>
          <td style="border:1px solid #333;text-align:center;">${c.level}</td>
          <td style="border:1px solid #333;text-align:center;">${c.competency || '—'}</td>
          <td style="border:1px solid #333;text-align:center;">${c.indicator || '—'}</td>
        </tr>`;
      });
      out += `</tbody></table>`;
    }

    return out;
  }

  function generateMatrixWordStandaloneHtml(m, section='all') {
    const bodyHtml = generateMatrixWordHtml(m, section);
    const css = `
      body {
        font-family: "Times New Roman", Times, serif;
        color: #000;
        margin: 20px auto;
        max-width: 1400px;
        line-height: 1.45;
        font-size: 11pt;
      }
      p.mx-doc-heading {
        text-align: center;
        font-size: 13pt;
        font-weight: 700;
        margin: 12px 0 4px;
        text-transform: uppercase;
      }
      p.mx-doc-subhead {
        text-align: center;
        font-size: 11.5pt;
        font-weight: 700;
        margin: 0 0 16px;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        table-layout: fixed;
        margin: 10px auto 26px;
      }
      td, th {
        border: 1px solid #333;
        padding: 6px 8px;
        overflow-wrap: anywhere;
        vertical-align: middle;
        font-size: 11pt;
        line-height: 1.4;
      }
      th {
        background-color: #f0f4f8;
        font-weight: bold;
        text-align: center;
      }
      @page {
        size: A4 landscape;
        margin: 1.2cm 1.5cm;
      }
      @media print {
        body { margin: 0; max-width: none; }
        tr { break-inside: avoid; }
      }
    `;
    return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="vi">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(m?.title || 'Ma trận & đặc tả')}</title>
  <style>${css}</style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
  }

  function downloadMatrixWord(m, section='all') {
    if (!m) return;
    const html = generateMatrixWordStandaloneHtml(m, section);
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const period = { TX: 'TX', GK1: 'GK1', CK1: 'CK1', GK2: 'GK2', CK2: 'CK2' }[m.exam_type] || 'GK1';
    const secName = section === 'matrix' ? 'MA_TRAN' : section === 'specification' ? 'DAC_TA' : section === 'competencies' ? 'NANG_LUC' : 'MA_TRAN_VA_DAC_TA';
    a.download = `TIN_${m.grade}_${period}_${secName}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    message(`Đã xuất tệp Word "${a.download}" thành công.`);
  }

  function downloadMatrixJson(m) {
    if (!m) return;
    const pkg = {
      format: 'asian-school-matrix',
      schema_version: 1,
      exported_at: new Date().toISOString(),
      matrix: m
    };
    const jsonStr = JSON.stringify(pkg, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TIN_${m.grade}_${m.exam_type || 'GK1'}_GOI_DU_LIEU.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    message(`Đã tải gói dữ liệu JSON dùng chung "${a.download}".`);
  }

  function printMatrixDoc(m) {
    if (!m) return;
    const html = generateMatrixWordStandaloneHtml(m, 'all');
    const win = window.open('', '_blank');
    if (!win) {
      message('Trình duyệt đã chặn cửa sổ pop-up. Hãy cho phép mở pop-up để in/xuất PDF.', true);
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  function downloadMatrixLatex(m) {
    if (!m) return;
    const v = buildMatrixView(m);
    const period = { TX: 'TX', GK1: 'Giữa HK1', CK1: 'Cuối HK1', GK2: 'Giữa HK2', CK2: 'Cuối HK2' }[m.exam_type] || 'Giữa HK1';
    let tex = `% MA TRẬN VÀ ĐẶC TẢ ĐỀ KIỂM TRA TIN HỌC ${m.grade} - ${period}\n`;
    tex += `\\documentclass[a4paper,landscape,11pt]{article}\n`;
    tex += `\\usepackage[utf8]{inputenc}\n\\usepackage[vietnamese]{babel}\n\\usepackage{geometry,tabularx,booktabs,multirow}\n`;
    tex += `\\geometry{margin=1.5cm}\n\\begin{document}\n`;
    tex += `\\section*{MA TRẬN ĐỀ KIỂM TRA TIN HỌC ${m.grade}}\n`;
    tex += `\\begin{table}[h!]\n\\centering\n`;
    tex += `\\begin{tabular}{|c|l|l|c|c|c|c|c|}\n\\hline\n`;
    tex += `TT & Chương / Chủ đề & Nội dung / Bài học & Biết & Hiểu & Vận dụng & Tổng câu & Tỉ lệ \\\\ \\hline\n`;
    v.rows.forEach(r => {
      tex += `${r.index} & ${r.topic} & ${r.title} & ${r.counts['Biết'] || 0} & ${r.counts['Hiểu'] || 0} & ${r.counts['Vận dụng'] || 0} & ${(r.counts['Biết']||0)+(r.counts['Hiểu']||0)+(r.counts['Vận dụng']||0)} & ${r.percentage.toFixed(0)}\\% \\\\ \\hline\n`;
    });
    tex += `\\end{tabular}\n\\end{table}\n\\end{document}\n`;
    const blob = new Blob([tex], { type: 'application/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TIN_${m.grade}_${m.exam_type || 'GK1'}_MA_TRAN.tex`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    message(`Đã xuất tệp LaTeX "${a.download}".`);
  }

  async function openPreview(id,section='all',mode='web'){
    const m=ui.records.find(x=>x.id===id)||(ui.editing?.id===id?ui.editing:null)||(await ui.ctx.request('/api/matrices/'+encodeURIComponent(id))).matrix;
    let bodyHtml='';
    if(mode==='raw'&&m?.source?.tables?.length&&section==='all'){
      try {
        const res=await fetch(apiUrl(`/api/matrices/${encodeURIComponent(id)}/export?format=html&section=${encodeURIComponent(section)}&mode=raw`));
        if(res.ok){const doc=new DOMParser().parseFromString(await res.text(),'text/html');bodyHtml=doc.body.innerHTML;}
        else bodyHtml=renderRawTablesHtml(m);
      } catch {
        bodyHtml=renderRawTablesHtml(m);
      }
    }else{
      try {
        const res=await fetch(apiUrl(`/api/matrices/${encodeURIComponent(id)}/export?format=html&section=${encodeURIComponent(section)}&mode=${encodeURIComponent(mode)}`));
        if(res.ok){
          const doc=new DOMParser().parseFromString(await res.text(),'text/html');
          bodyHtml=doc.body.innerHTML;
        }
      } catch {}
      if(!bodyHtml){
        bodyHtml=generateMatrixWordHtml(m,section);
      }
    }
    ui.comparison=null;
    ui.previewState={id,matrix:m,section,mode,bodyHtml};
    renderPreviewBox(true);
  }
  function renderPreviewBox(scroll=false){
    const preview=qs('#mx-preview'),st=ui.previewState;if(!preview||!st)return;
    const m=st.matrix,hasRaw=Boolean(m.source?.tables?.length);
    const issues=m.reconciliation?.issues||[];
    const fmtKey=`matrix:${st.id}:${st.section}:${st.mode}`;
    const fmt=root.DocFormatter||root.BankCore?.DocFormatter;
    preview.hidden=false;preview.className='card mx-preview';
    preview.innerHTML=`<div class="mx-panel-head"><div><p class="eyebrow">XEM TOÀN BỘ MA TRẬN & BẢNG ĐẶC TẢ</p><h2>${E(m.title)} · Khối ${m.grade} (${E(profileLabel(m.profile))})</h2></div><div class="actions"><button type="button" data-action="compare-id" data-id="${E(st.id)}">Đối chiếu bản gốc (2 cột)</button>${ui.editing?.id!==st.id?`<button type="button" data-open="${E(st.id)}">Mở biên tập</button>`:''}<button type="button" class="quiet" data-action="close-preview">Đóng khung xem</button></div></div>`+
    `<div class="mx-panel-toolbar"><div class="actions"><button type="button" class="${st.section==='all'?'primary':''}" data-action="preview-sec" data-sec="all">Toàn bộ bảng</button><button type="button" class="${st.section==='matrix'?'primary':''}" data-action="preview-sec" data-sec="matrix">Bảng ma trận</button><button type="button" class="${st.section==='specification'?'primary':''}" data-action="preview-sec" data-sec="specification">Bảng đặc tả</button>${m.profile==='THPT'?`<button type="button" class="${st.section==='competencies'?'primary':''}" data-action="preview-sec" data-sec="competencies">Bảng năng lực</button>`:''}</div>`+
    `<div class="actions">${hasRaw?`<button type="button" class="${st.mode==='web'?'primary':''}" data-action="preview-mode" data-mode="web">Bản chuẩn hóa Web (đánh số câu)</button><button type="button" class="${st.mode==='raw'?'primary':''}" data-action="preview-mode" data-mode="raw">Bảng nguyên trạng từ Word</button>`:''}<button type="button" class="button primary" data-action="download-preview-word">📄 Tải Word (.doc)</button></div></div>`+
    (fmt?fmt.toolbarHtml(fmtKey,false):'')+
    (issues.length?`<div class="mx-errors"><strong>Cảnh báo nguồn cần xác minh (${issues.length} mục):</strong><ul>${issues.map(x=>`<li>${E(x.message)}</li>`).join('')}</ul></div>`:'')+
    `<div class="mx-sheet-body">${st.bodyHtml}</div>`;
    enhanceSheetTables(preview);
    const dlBtn=preview.querySelector('[data-action="download-preview-word"]');
    if(dlBtn)dlBtn.onclick=()=>downloadMatrixWord(m,st.section);
    if(fmt){
      fmt.attach(preview,'.mx-sheet-body',{
        storageKey:fmtKey,
        title:`${m.title} - Khối ${m.grade}`,
        filename:`TIN_${m.grade}_${m.exam_type||'GK1'}_MA_TRAN_CHINH_SUA.doc`,
        landscape:true,
        notify:message,
        onAutoFormat:()=>enhanceSheetTables(preview),
        onSave:async()=>{
          message('Đã lưu nội dung và định dạng bảng của khung Xem toàn bộ. Bạn có thể bấm "Xuất Word bản đang chỉnh" hoặc "In / PDF".');
        }
      });
    }
    if(scroll)preview.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function openComparison(id){
    let data;
    try{
      data=await ui.ctx.request('/api/matrices/'+encodeURIComponent(id)+'/compare');
    }catch(_err){
      const d=await ui.ctx.request('/api/matrices/'+encodeURIComponent(id));
      const m=d.matrix;
      let webHtml='';
      try{
        const webRes=await fetch(apiUrl(`/api/matrices/${encodeURIComponent(id)}/export?format=html&section=all&mode=web`));
        if(webRes.ok){
          const webDoc=new DOMParser().parseFromString(await webRes.text(),'text/html');
          webHtml=webDoc.body.innerHTML;
        }
      }catch{}
      if(!webHtml){
        webHtml=generateMatrixWordHtml(m,'all');
      }
      data={
        matrix:m,
        validation:d.validation,
        pages:[],
        has_raw_tables:Boolean(m.source?.tables?.length),
        raw_html:renderRawTablesHtml(m)||webHtml,
        web_html:webHtml,
        comparison_notes:m.source?.comparison_notes||[],
        issues:m.reconciliation?.issues||[],
      };
    }
    ui.previewState=null;
    ui.comparison={...data,leftMode:data.pages?.length?'pages':'raw',selectedPage:'all',zoom:false};
    renderComparisonBox(true);
  }
  function renderComparisonBox(scroll=false){
    const preview=qs('#mx-preview'),c=ui.comparison;if(!preview||!c)return;
    const m=c.matrix,pages=c.pages||[],issues=c.issues||[],notes=c.comparison_notes||[];
    const visiblePages=c.selectedPage==='all'?pages:pages.filter(p=>String(p.page)===String(c.selectedPage));
    preview.hidden=false;preview.className='card mx-preview mx-compare-card';
    preview.innerHTML=`<div class="mx-panel-head"><div><p class="eyebrow">ĐỐI CHIẾU SONG SONG 2 CỘT · BẢN GỐC WORD & BẢN TRÊN WEB</p><h2>${E(m.title)} · Khối ${m.grade}</h2><p class="small muted">Tệp nguồn: <strong>${E(m.source?.name||'Hồ sơ biên soạn')}</strong>${m.source?.sha256?` · SHA-256: <code>${E(m.source.sha256.slice(0,16))}…</code>`:''} · Tổng: ${c.validation?.totals?.questions||m.slots?.length||0} câu mẹ (${c.validation?.totals?.items||(m.slots||[]).reduce((s,x)=>s+(x.parts?.length||0),0)} ý) · ${c.validation?.totals?.points||m.total_points||10} điểm</p></div><div class="actions"><button type="button" data-action="preview-id" data-id="${E(m.id)}">Xem toàn bộ (1 cột)</button>${ui.editing?.id!==m.id?`<button type="button" data-open="${E(m.id)}">Mở biên tập</button>`:''}<button type="button" class="quiet" data-action="close-preview">Đóng đối chiếu</button></div></div>`+
    (issues.length?`<div class="mx-errors"><strong>Phát hiện ${issues.length} điểm mâu thuẫn trong tệp nguồn cần xác minh (nguyên tắc bảo toàn: giữ nguyên, không tự ý sửa số liệu nguồn):</strong><ul>${issues.map(x=>`<li>${E(x.message)}</li>`).join('')}</ul></div>`:`<div class="callout"><strong>Đối chiếu số lượng & điểm số:</strong> Tổng số câu, số ý và điểm số giữa Bảng ma trận và Bảng đặc tả khớp 100%.</div>`)+
    (notes.length?`<div class="callout warning"><strong>Ghi chú chuẩn hóa hiển thị so với bản Word gốc:</strong><ul style="margin:6px 0 0;padding-left:20px">${notes.map(n=>`<li>${E(n)}</li>`).join('')}</ul></div>`:'')+
    `<div class="mx-compare-grid">`+
      `<section class="mx-compare-pane"><div class="mx-pane-bar"><div><strong>CỘT TRÁI · BẢN GỐC WORD</strong><span class="small muted"> (${pages.length?`${pages.length} trang ảnh gốc`:'Bảng trích xuất nguyên trạng'})</span></div><div class="actions">`+
      (pages.length?`<button type="button" class="${c.leftMode==='pages'?'primary':''}" data-action="cmp-left" data-left="pages">Ảnh trang Word gốc (${pages.length})</button>`:'')+
      (c.has_raw_tables?`<button type="button" class="${c.leftMode==='raw'?'primary':''}" data-action="cmp-left" data-left="raw">Bảng trích xuất nguyên trạng</button>`:'')+
      (c.leftMode==='pages'&&pages.length?`<select id="mx-cmp-page" aria-label="Chọn trang bản gốc">${opt('all',`Tất cả ${pages.length} trang`,c.selectedPage==='all')}${pages.map(p=>opt(p.page,`Trang ${p.page}/${pages.length}`,String(c.selectedPage)===String(p.page))).join('')}</select><button type="button" data-action="cmp-zoom">${c.zoom?'Thu vừa khung':'Phóng to 150%'}</button>`:'')+
      `</div></div><div class="mx-pane-body ${c.zoom?'mx-zoomed':''}">`+
      (c.leftMode==='pages'&&pages.length?visiblePages.map(p=>`<figure class="mx-page-figure"><figcaption>Trang ${p.page} / ${pages.length} — Bản gốc Word (${E(m.source?.name||'')})</figcaption><img src="${E(apiUrl(p.url))}" alt="Trang ${p.page} bản gốc ${E(m.title)}" loading="lazy"></figure>`).join(''):c.raw_html?`<div class="mx-sheet-body">${c.raw_html}</div>`:'<p class="muted">Hồ sơ này được biên soạn trực tiếp trên web, không có tệp Word nguồn đính kèm.</p>')+
      `</div></section>`+
      `<section class="mx-compare-pane" id="mx-cmp-right-pane"><div class="mx-pane-bar"><div><strong>CỘT PHẢI · BẢN TRÊN WEB (CHUẨN HÓA)</strong><span class="small muted"> · Ma trận: (1, 2, 3) · Đặc tả: (Câu 1, Câu 2).</span></div></div>`+
      ((root.DocFormatter||root.BankCore?.DocFormatter)?`<div style="padding:10px 14px 0;background:#eef2f7">${(root.DocFormatter||root.BankCore?.DocFormatter).toolbarHtml(`matrix:${m.id}:all:web`,false)}</div>`:'')+
      `<div class="mx-pane-body"><div class="mx-sheet-body">${c.web_html}</div></div></section>`+
    `</div>`;
    enhanceSheetTables(preview);
    const fmt=root.DocFormatter||root.BankCore?.DocFormatter;
    const rightPane=qs('#mx-cmp-right-pane');
    if(fmt&&rightPane){
      fmt.attach(rightPane,'.mx-sheet-body',{
        storageKey:`matrix:${m.id}:all:web`,
        title:`${m.title} - Khối ${m.grade}`,
        filename:`TIN_${m.grade}_${m.exam_type||'GK1'}_MA_TRAN_CHINH_SUA.doc`,
        landscape:true,
        notify:message,
        onAutoFormat:()=>enhanceSheetTables(rightPane),
        onSave:async()=>{
          message('Đã lưu nội dung và định dạng của Cột phải (Bản chuẩn hóa trên Web).');
        }
      });
    }
    const sel=qs('#mx-cmp-page');if(sel)sel.onchange=ev=>{ui.comparison.selectedPage=ev.target.value;renderComparisonBox(false);};
    if(scroll)preview.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function click(event){
    const scroll=event.target.closest('[data-scroll]');if(scroll){qs('#'+scroll.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    const open=event.target.closest('[data-open]');if(open){await run(()=>openRecord(open.dataset.open));return;}
    const b=event.target.closest('[data-action]');if(!b)return;event.preventDefault();const action=b.dataset.action;
    if(action==='close-preview'){ui.comparison=null;ui.previewState=null;const p=qs('#mx-preview');if(p)p.hidden=true;return;}
    if(action==='cmp-left'&&ui.comparison){ui.comparison.leftMode=b.dataset.left;renderComparisonBox(false);return;}
    if(action==='cmp-zoom'&&ui.comparison){ui.comparison.zoom=!ui.comparison.zoom;renderComparisonBox(false);return;}
    if(action==='preview-sec'&&ui.previewState){await run(()=>openPreview(ui.previewState.id,b.dataset.sec,ui.previewState.mode));return;}
    if(action==='preview-mode'&&ui.previewState){await run(()=>openPreview(ui.previewState.id,ui.previewState.section,b.dataset.mode));return;}
    if(action==='preview-id'){await run(()=>openPreview(b.dataset.id,'all','web'));return;}
    if(action==='compare-id'){await run(()=>openComparison(b.dataset.id));return;}
    if(action==='new'){if(!guard())return;ui.editing=newDraft(b.dataset.grade);ui.report=null;ui.importing=null;ui.generation=null;render();return;}
    if(action==='import'){if(!guard())return;ui.editing=null;ui.generation=null;ui.importing={grade:grades()[0]};render();return;}
    if(action==='discard'){await run(async()=>{if(ui.dirty&&ui.editing.id)await openRecord(ui.editing.id,true);else{ui.editing=null;ui.dirty=false;render();}});return;}
    if(action==='apply-preset'&&ui.editing){
      const g=Number(ui.editing.grade)||8;
      const p=STANDARD_PRESETS[String(g)];
      if(!p){message('Chưa có mẫu cho khối '+g,true);return;}
      const copy=clone(p);
      ui.editing.lessons=copy.lessons;
      ui.editing.requirements=copy.requirements;
      ui.editing.slots=copy.slots;
      ui.editing.indicator_catalog=copy.indicator_catalog||[];
      ui.editing.total_points=copy.total_points||10;
      if(copy.scoring_policy)ui.editing.scoring_policy=copy.scoring_policy;
      changed();renderEditor();
      message('Đã nạp lại mẫu chuẩn Á Châu 10.0 điểm cho Khối ' + g + '!');
      return;
    }
    if(action==='load-ppct-lessons'&&ui.editing){
      const g=Number(ui.editing.grade)||8;
      const ppctLessons=lessons(g);
      if(!ppctLessons.length){
        message('Chưa có danh sách bài học PPCT cho Khối '+g+'. Hãy nạp PPCT trước.',true);
        return;
      }
      let added=0;
      ppctLessons.forEach(pl=>{
        if(!ui.editing.lessons.some(l=>l.lesson_code===pl.lesson_code)){
          ui.editing.lessons.push({
            lesson_code:pl.lesson_code,
            title:pl.lesson_name_source||pl.lesson_code,
            topic:pl.topic_source||''
          });
          added++;
        }
      });
      changed();renderEditor();
      message('Đã đồng bộ ' + added + ' bài học mới từ Phân phối chương trình Khối ' + g + '!');
      return;
    }
    if(action==='clear-slots'&&ui.editing){
      if(!confirm('Bạn có chắc chắn muốn xóa toàn bộ câu hỏi phân bố để tự nhập lại từ đầu?'))return;
      ui.editing.slots=[];
      changed();renderEditor();
      message('Đã xóa toàn bộ câu hỏi phân bố.');
      return;
    }
    if(action==='unlock-custom'&&ui.editing){
      ui.editing.allow_custom_override=true;
      ui.editing.status='draft';
      changed();renderEditor();
      message('Đã bật chế độ sửa toàn diện. Bạn có thể thêm/sửa/xóa bài học, YCCĐ và phân bố câu hỏi rồi bấm Lưu bản nháp.');
      return;
    }
    if(action==='add-lesson'){
      const l=lessons(ui.editing.grade).find(x=>x.lesson_code===qs('#mx-add-lesson')?.value);if(!l)return;
      ui.editing.lessons.push({lesson_code:l.lesson_code,title:l.lesson_name_source,topic:l.topic_source});changed();renderEditor();return;
    }
    if(action==='remove-lesson'){
      const idx=Number(b.dataset.index),l=ui.editing.lessons[idx];if(!l)return;
      ui.editing.lessons.splice(idx,1);
      ui.editing.requirements=ui.editing.requirements.filter(r=>r.lesson_code!==l.lesson_code);
      changed();renderEditor();return;
    }
    if(action==='add-requirement'){
      const l=ui.editing.lessons[Number(b.dataset.index)];ui.editing.requirements.push({id:uid('R'),lesson_code:l.lesson_code,level:'Biết',text:'',ppct_outcome_index:null,competency:competencies()[0],choice_group:null});changed();renderEditor();return;
    }
    if(action==='remove-requirement'){
      const idx=Number(b.dataset.index),r=ui.editing.requirements[idx];if(!r)return;
      ui.editing.requirements.splice(idx,1);
      ui.editing.slots.forEach(s=>s.parts.forEach(p=>{if(p.requirement_id===r.id)p.requirement_id='';}));
      changed();renderEditor();return;
    }
    if(action==='add-indicator'){ui.editing.indicator_catalog.push({code:'',competency:competencies()[0],text:''});changed();renderEditor();return;}
    if(action==='remove-indicator'){ui.editing.indicator_catalog.splice(Number(b.dataset.index),1);changed();renderEditor();return;}
    if(action==='add-slots'){
      const m=ui.editing,kind=qs('#mx-bulk-kind').value,rid=qs('#mx-bulk-req').value,count=Number(qs('#mx-bulk-count').value),parts=kind==='YN'?4:kind==='ES'?Number(qs('#mx-bulk-parts').value):1,points=Number(qs('#mx-bulk-points').value);
      if(!rid||!Number.isInteger(count)||count<1||count>100||!Number.isInteger(parts)||parts<1||parts>10||!Number.isFinite(points)||points<=0){message('Chọn YCCĐ, số câu/ý và điểm hợp lệ trước khi thêm.',true);return;}
      const start=m.slots.filter(s=>s.kind===kind).length;
      for(let i=0;i<count;i++)m.slots.push({id:uid('S'),kind,number:start+i+1,scoring:{mode:'sum_parts'},parts:Array.from({length:parts},(_,j)=>({id:uid('P'),label:parts===1?'':String.fromCharCode(97+j),requirement_id:rid,points,indicator:''}))});
      changed();renderEditor();return;
    }
    if(action==='remove-slot'){const kind=ui.editing.slots[Number(b.dataset.index)].kind;ui.editing.slots.splice(Number(b.dataset.index),1);ui.editing.slots.filter(s=>s.kind===kind).forEach((s,i)=>s.number=i+1);changed();renderEditor();return;}
    await run(async()=>{
      if(action==='save')await save();
      else if(action==='shortfall'){if(!ui.editing.id||ui.dirty){ui.ctx.notify('Lưu ma trận trước khi xem báo cáo thiếu câu.',true);}else{ui.shortfall=await ui.ctx.request('/api/matrices/'+encodeURIComponent(ui.editing.id)+'/shortfall');renderShortfall();}restoreButtons();}
      else if(action==='review'){ui.report=(await ui.ctx.request('/api/matrices/review',{id:ui.editing.id})).validation;renderReport();restoreButtons();}
      else if(action==='preview'){await openPreview(ui.editing.id,'all','web');}
      else if(action==='compare'){await openComparison(ui.editing.id);}
      else if(action==='duplicate-id'){
        const id=b.dataset.id||ui.editing?.id;if(!id)return;
        const result=await ui.ctx.request('/api/matrices/duplicate',{id});
        ui.editing={...result.matrix,allow_custom_override:true};ui.report=result.validation;ui.dirty=false;await refresh();render();
        message('Đã nhân bản hồ sơ ma trận sang bản nháp mới.');
      }else if(action==='delete-id'){
        const id=b.dataset.id||ui.editing?.id;if(!id)return;
        if(typeof window!=='undefined'&&window.confirm&&!window.confirm(`Xóa vĩnh viễn hồ sơ ma trận "${id}"?`))return;
        await ui.ctx.request('/api/matrices/delete',{id});
        if(ui.editing?.id===id){ui.editing=null;ui.dirty=false;}
        if(ui.previewState?.id===id)ui.previewState=null;
        if(ui.comparison?.matrix?.id===id)ui.comparison=null;
        await refresh();render();message('Đã xóa hồ sơ ma trận.');
      }else if(action==='unlock'){
        const result=await ui.ctx.request('/api/matrices/unlock',{id:ui.editing.id});
        ui.editing=result.matrix;ui.report=result.validation;ui.dirty=false;await refresh();render();
        message('Đã mở khóa hồ sơ về trạng thái Bản nháp.');
      }else if(action==='lock'){
        const confirmation={confirmed_by:qs('#mx-confirm-name').value,confirmed_at:qs('#mx-confirm-date').value,basis:qs('#mx-confirm-basis').value,external_agreement:qs('#mx-confirm-agreement').checked};
        const result=await ui.ctx.request('/api/matrices/lock',{id:ui.editing.id,expected_revision:ui.editing.revision,confirmation});ui.editing=result.matrix;ui.report=result.validation;await refresh();render();message('Đã khóa phiên bản. Đề tạo sau này sẽ lưu dấu phiên bản ma trận này.');
      }else if(action==='new-version'){
        const result=await ui.ctx.request('/api/matrices/new-version',{id:ui.editing.id});ui.editing=result.matrix;ui.report=result.validation;ui.dirty=false;await refresh();render();
      }else if(action==='archive'){
        const result=await ui.ctx.request('/api/matrices/archive',{id:ui.editing.id,expected_revision:ui.editing.revision,reason:qs('#mx-archive-reason').value});ui.editing=result.matrix;ui.report=result.validation;await refresh();render();message('Đã lưu trữ; các đề cũ vẫn giữ phiên bản đã dùng.');
      }else if(action==='accept-import'){
        const i=ui.importing;const result=i.package?await ui.ctx.request('/api/matrices/import-package',{package:i.package}):await ui.ctx.request('/api/matrices/accept-import',{filename:i.filename,grade:i.grade,content_base64:i.base64});
        ui.editing=result.matrix;ui.report=result.validation;ui.importing=null;ui.dirty=false;await refresh();render();message('Đã nhận bản nguồn. Hãy đối chiếu PPCT, vị trí câu và các điểm còn thiếu trước khi khóa.');
        await openPreview(ui.editing.id, 'all', 'web');
      }else if(action==='use'){
        const data=await ui.ctx.request('/api/matrices/'+encodeURIComponent(ui.editing.id)+'/candidates');ui.generation=data;ui.editing=null;ui.dirty=false;render();
      }else if(action==='suggest'){suggest();}
      else if(action==='generate'){await generate();}
    });
  }
  function parseMatrixFromMarkdown(text, defaultGrade) {
    if (!text || typeof text !== 'string') return null;
    let grade = Number(defaultGrade || 9);
    const mGrade = text.match(/(?:Khối|Khối lớp|Grade)\s*[:=]?\s*(\d+)/i) || text.match(/(?:TIN|K)\s*(\d+)/i);
    if (mGrade) grade = Number(mGrade[1]);

    let examType = 'GK1';
    if (/Cuối\s*k[ỳi]\s*1|CK1|Học\s*k[ỳi]\s*1/i.test(text)) examType = 'CK1';
    else if (/Giữa\s*k[ỳi]\s*2|GK2/i.test(text)) examType = 'GK2';
    else if (/Cuối\s*k[ỳi]\s*2|CK2|Học\s*k[ỳi]\s*2/i.test(text)) examType = 'CK2';

    let title = '';
    const mTitle = text.match(/^#+\s*(.+)$/m);
    if (mTitle) title = mTitle[1].replace(/[*_#]/g, '').trim();
    if (!title) title = 'Ma trận & đặc tả ' + examType + ' - Khối ' + grade;

    const lessonsMap = new Map();
    const requirements = [];
    const slots = [];
    let reqCount = 0;
    let slotCount = 0;

    function cleanLevel(raw) {
      const l = String(raw || '').toLowerCase();
      if (l.includes('cao')) return 'Vận dụng cao';
      if (l.includes('vận dụng') || l.includes('van dung') || l.includes('vd')) return 'Vận dụng';
      if (l.includes('hiểu') || l.includes('hieu') || l.includes('th')) return 'Hiểu';
      return 'Biết';
    }

    function cleanKind(raw) {
      const k = String(raw || '').toUpperCase();
      if (k.includes('YN') || /ĐÚNG\/SAI|ĐÚNG SAI|Đ-S|DS/i.test(raw)) return 'YN';
      if (k.includes('SHORT') || /TRẢ LỜI NGẮN|NGẮN|TLN/i.test(raw)) return 'SHORT';
      if (k.includes('ES') || /TỰ LUẬN|TU LUAN|TL/i.test(raw)) return 'ES';
      return 'MC';
    }

    function getOrCreateLesson(rawLesson, rawTopic) {
      let cleanLesson = (rawLesson || '').trim();
      if (!cleanLesson) cleanLesson = 'Bài học ' + (lessonsMap.size + 1);

      let code = '';
      const mCode = cleanLesson.match(/^(?:Bài|Chủ\s*đề)\s*([0-9]+[a-zA-Z]?)/i);
      if (mCode) code = 'B' + mCode[1];
      else if (/KTGK1/i.test(cleanLesson)) code = 'KTGK1';
      else if (/KTCK1/i.test(cleanLesson)) code = 'KTCK1';
      else code = 'B' + (lessonsMap.size + 1);

      const titleStr = cleanLesson.replace(/^(?:Bài|Chủ\s*đề)\s*[0-9]+[a-zA-Z]?[:.]?\s*/i, '').trim() || cleanLesson;
      if (!lessonsMap.has(code)) {
        lessonsMap.set(code, {
          lesson_code: code,
          title: titleStr,
          topic: (rawTopic || 'Chương trình GDPT').trim()
        });
      }
      return code;
    }

    function addRequirementAndSlots(lessonCode, level, outcomeText, kind, count, points, refLabel) {
      reqCount++;
      const reqId = 'R' + reqCount;
      requirements.push({
        id: reqId,
        lesson_code: lessonCode,
        level,
        text: outcomeText || 'Yêu cầu cần đạt chuẩn GDPT.',
        ppct_outcome_index: 0,
        competency: 'NLa'
      });

      const numSlots = Math.max(1, count || 1);
      const pts = points || (kind === 'ES' ? 1.0 : 0.25);

      for (let i = 0; i < numSlots; i++) {
        slotCount++;
        slots.push({
          id: 'S' + slotCount,
          kind,
          number: slotCount,
          parts: [{
            id: 'P' + slotCount,
            label: refLabel || '',
            requirement_id: reqId,
            points: pts,
            indicator: ''
          }],
          scoring: { mode: 'sum_parts' }
        });
      }
    }

    // 1. Phân tách tài liệu thành từng bảng Markdown riêng biệt
    const lines = text.split(/\r?\n/);
    const tables = [];
    let curT = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        curT.push(trimmed);
      } else {
        if (curT.length >= 2) tables.push(curT);
        curT = [];
      }
    }
    if (curT.length >= 2) tables.push(curT);

    let parsedAnyTable = false;

    if (tables.length > 0) {
      let specTable = null;
      let matrixTable = null;
      let flatTable = null;

      for (const t of tables) {
        const headerStr = t[0].toLowerCase();
        if (/đặc\s*tả|yêu\s*cầu\s*cần\s*đạt|chuẩn\s*kiến\s*thức|mức\s*độ\s*đánh\s*giá/i.test(headerStr)) {
          if (!specTable) specTable = t;
        } else if (/nhận\s*biết|thông\s*hiểu|vận\s*dụng|tổng\s*số\s*câu/i.test(headerStr)) {
          if (!matrixTable) matrixTable = t;
        } else if (t[0].split('|').length >= 6) {
          if (!flatTable) flatTable = t;
        }
      }

      // Ưu tiên đọc Bản đặc tả (Specification table) trước vì có đầy đủ YCCĐ và câu hỏi chi tiết
      const targetTable = specTable || flatTable;
      if (targetTable) {
        let curTopic = 'Chương trình GDPT';
        let curLesson = '';
        let curLevel = 'Biết';

        const headerCells = targetTable[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
        let colTopic = headerCells.findIndex(c => /chủ\s*đề/i.test(c));
        let colLesson = headerCells.findIndex(c => /bài\s*học|đơn\s*vị\s*kiến\s*thức|nội\s*dung/i.test(c));
        let colLevel = headerCells.findIndex(c => /mức\s*độ/i.test(c));
        let colOutcome = headerCells.findIndex(c => /yêu\s*cầu|chuẩn|đặc\s*tả|nội\s*dung\s*đánh\s*giá/i.test(c));
        let colCount = headerCells.findIndex(c => /số\s*câu|số\s*lượng/i.test(c));
        let colRef = headerCells.findIndex(c => /câu\s*hỏi|mã\s*câu/i.test(c));
        let colPoints = headerCells.findIndex(c => /điểm/i.test(c));

        if (colTopic === -1 && headerCells.length >= 2) colTopic = 1;
        if (colLesson === -1 && headerCells.length >= 3) colLesson = 2;
        if (colLevel === -1 && headerCells.length >= 4) colLevel = 3;
        if (colOutcome === -1 && headerCells.length >= 5) colOutcome = 4;

        for (let ri = 1; ri < targetTable.length; ri++) {
          const row = targetTable[ri];
          const cells = row.split('|').slice(1, -1).map(c => c.trim());
          if (!cells.length || /^:?-+:?$/.test(cells[0])) continue;
          if (cells.some(c => /^tổng/i.test(c))) continue;

          // Xử lý ô gộp hàng (row-spanning carry-forward)
          if (colTopic !== -1 && cells[colTopic]) curTopic = cells[colTopic];
          if (colLesson !== -1 && cells[colLesson]) curLesson = cells[colLesson];
          if (colLevel !== -1 && cells[colLevel]) curLevel = cleanLevel(cells[colLevel]);

          const rawOutcome = (colOutcome !== -1 && cells[colOutcome]) ? cells[colOutcome] : '';
          const rawCount = (colCount !== -1 && cells[colCount]) ? cells[colCount] : '1';
          const rawRef = (colRef !== -1 && cells[colRef]) ? cells[colRef] : '';
          const rawPoints = (colPoints !== -1 && cells[colPoints]) ? cells[colPoints] : '';

          if (!rawOutcome && (colLevel === -1 || !cells[colLevel])) continue;

          const lessonCode = getOrCreateLesson(curLesson || curTopic, curTopic);
          const kind = cleanKind(rawCount + ' ' + rawRef);

          const mCount = rawCount.match(/\d+/);
          const count = mCount ? parseInt(mCount[0], 10) : 1;

          const mPts = rawPoints.match(/\d+(?:[.,]\d+)?/);
          const points = mPts ? parseFloat(mPts[0].replace(',', '.')) : (kind === 'ES' ? 1.0 : 0.25);

          // Phân tách nhiều gạch đầu dòng trong cùng một ô
          const bullets = rawOutcome.split(/<br\s*\/?>|\n|(?<=\.)\s*(?=[-•*]\s*)/i)
            .map(b => b.replace(/^[-•*]\s*/, '').trim())
            .filter(Boolean);

          if (bullets.length > 1) {
            const perBulletCount = Math.max(1, Math.floor(count / bullets.length));
            for (const bText of bullets) {
              addRequirementAndSlots(lessonCode, curLevel, bText, kind, perBulletCount, points, rawRef);
            }
          } else {
            addRequirementAndSlots(lessonCode, curLevel, bullets[0] || rawOutcome, kind, count, points, rawRef);
          }
          parsedAnyTable = true;
        }
      } else if (matrixTable) {
        // Đọc Khung ma trận (Matrix table 10-16 cột)
        let curTopic = 'Chương trình GDPT';
        let curLesson = '';
        const headerCells = matrixTable[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
        let colTopic = headerCells.findIndex(c => /chủ\s*đề/i.test(c));
        let colLesson = headerCells.findIndex(c => /bài\s*học|đơn\s*vị\s*kiến\s*thức|nội\s*dung/i.test(c));
        if (colTopic === -1) colTopic = 1;
        if (colLesson === -1) colLesson = 2;

        for (let ri = 1; ri < matrixTable.length; ri++) {
          const row = matrixTable[ri];
          const cells = row.split('|').slice(1, -1).map(c => c.trim());
          if (!cells.length || /^:?-+:?$/.test(cells[0])) continue;
          if (cells.some(c => /^tổng/i.test(c))) continue;

          if (cells[colTopic]) curTopic = cells[colTopic];
          if (cells[colLesson]) curLesson = cells[colLesson];

          const lessonCode = getOrCreateLesson(curLesson || curTopic, curTopic);

          for (let ci = 0; ci < cells.length; ci++) {
            if (ci === colTopic || ci === colLesson) continue;
            const hName = headerCells[ci] || '';
            if (/tổng|tỉ\s*lệ|stt|tt/i.test(hName)) continue;

            const cellVal = cells[ci];
            const mNum = cellVal.match(/\d+/);
            if (mNum && parseInt(mNum[0], 10) > 0) {
              const count = parseInt(mNum[0], 10);
              const level = cleanLevel(hName);
              const kind = cleanKind(hName + ' ' + cellVal);
              const mPts = cellVal.match(/(\d+(?:[.,]\d+)?)\s*(?:đ|điểm)/i);
              const pts = mPts ? parseFloat(mPts[1].replace(',', '.')) : (kind === 'ES' ? 1.0 : 0.25);

              addRequirementAndSlots(lessonCode, level, 'Yêu cầu cần đạt mức ' + level + ' - ' + (curLesson || curTopic), kind, count, pts, '');
              parsedAnyTable = true;
            }
          }
        }
      }
    }

    // 2. Đọc định dạng Markdown phân cấp theo đề mục (Hierarchical Sections) nếu không có bảng
    if (!parsedAnyTable) {
      let curTopic = 'Chương trình GDPT';
      let curLesson = 'Bài học 1';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (/^##\s+(.+)$/.test(trimmed)) {
          curTopic = trimmed.replace(/^##\s+/, '').trim();
        } else if (/^###\s+(.+)$/.test(trimmed)) {
          curLesson = trimmed.replace(/^###\s+/, '').trim();
        } else if (/^[-*•]\s+/.test(trimmed)) {
          const body = trimmed.replace(/^[-*•]\s+/, '').trim();
          const tags = [];
          const bodyWithoutTags = body.replace(/\[([^\]]+)\]/g, (_, tag) => {
            tags.push(tag.trim());
            return '';
          }).trim();

          let level = 'Biết';
          let kind = 'MC';
          for (const t of tags) {
            if (/biết|hiểu|vận\s*dụng/i.test(t)) level = cleanLevel(t);
            if (/mc|tn|yn|đúng|sai|short|ngắn|es|tự\s*luận|tl/i.test(t)) kind = cleanKind(t);
          }

          let count = 1;
          let points = kind === 'ES' ? 1.0 : 0.25;
          let refLabel = '';

          const mMeta = bodyWithoutTags.match(/\(([^)]+)\)\s*$/);
          let outcomeText = bodyWithoutTags;
          if (mMeta) {
            outcomeText = bodyWithoutTags.slice(0, mMeta.index).trim();
            const metaStr = mMeta[1];
            const mC = metaStr.match(/(\d+)\s*(?:câu|ý)/i);
            if (mC) count = parseInt(mC[1], 10);
            const mP = metaStr.match(/(\d+(?:[.,]\d+)?)\s*(?:đ|điểm)/i);
            if (mP) points = parseFloat(mP[1].replace(',', '.'));
            const mR = metaStr.match(/(?:câu\s*[\d,\sA-Z]+)/i);
            if (mR) refLabel = mR[0];
          }

          const lessonCode = getOrCreateLesson(curLesson, curTopic);
          addRequirementAndSlots(lessonCode, level, outcomeText, kind, count, points, refLabel);
        }
      }
    }

    if (!slots.length) {
      const l1 = { lesson_code: 'B1', title: 'Bài học 1', topic: 'Chương trình GDPT' };
      lessonsMap.set('B1', l1);
      requirements.push({ id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết kiến thức trọng tâm.', ppct_outcome_index: 0, competency: 'NLa' });
      slots.push({ id: 'S1', kind: 'MC', number: 1, parts: [{ id: 'P1', label: '', requirement_id: 'R1', points: 10, indicator: '' }], scoring: { mode: 'sum_parts' } });
    }

    const profile = grade >= 10 ? 'THPT' : 'THCS';
    const totalPoints = slots.reduce((acc, s) => acc + (s.parts || []).reduce((pAcc, p) => pAcc + (Number(p.points) || 0), 0), 0) || 10;

    return {
      format: 'asian-school-matrix',
      schema_version: 1,
      matrix: {
        id: 'MX-' + grade + '-' + examType + '-' + Date.now().toString(36),
        family_id: 'FAM-' + grade + '-' + examType,
        version: 1,
        revision: 0,
        status: 'draft',
        mode: 'authored',
        profile,
        grade,
        school_year: '2026-2027',
        exam_type: examType,
        duration: 45,
        title,
        owner_name: 'Giáo viên phụ trách',
        campus: 'Cao Thắng',
        total_points: Math.round(totalPoints * 10) / 10,
        lessons: Array.from(lessonsMap.values()),
        requirements,
        slots,
        indicator_catalog: [],
        source: null,
        reconciliation: { confirmed: true, issues: [] },
        audit: []
      }
    };
  }

  function downloadMatrixJsonSample(grade = 9) {
    const g = Number(grade) || 9;
    const sample = {
      format: 'asian-school-matrix',
      schema_version: 1,
      matrix: {
        profile: g >= 10 ? 'THPT' : 'THCS',
        grade: g,
        exam_type: 'GK1',
        duration: 45,
        school_year: '2026-2027',
        title: `Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn Tin học Khối ${g}`,
        owner_name: 'Tổ Tin học Á Châu',
        campus: 'Cao Thắng',
        total_points: 10,
        lessons: [
          { lesson_code: 'B1', title: 'Thế giới kĩ thuật số', topic: 'Chủ đề 1: Máy tính và cộng đồng' },
          { lesson_code: 'B2', title: 'Thông tin trong giải quyết vấn đề', topic: 'Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin' }
        ],
        requirements: [
          { id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết được một số thiết bị số thông dụng.', ppct_outcome_index: 0, competency: 'NLa' },
          { id: 'R2', lesson_code: 'B1', level: 'Hiểu', text: 'Giải thích được vai trò của thiết bị số trong đời sống và học tập.', ppct_outcome_index: 1, competency: 'NLa' },
          { id: 'R3', lesson_code: 'B2', level: 'Vận dụng', text: 'Vận dụng được kiến thức để tìm kiếm và đánh giá chất lượng thông tin.', ppct_outcome_index: 0, competency: 'NLb' }
        ],
        slots: [
          { id: 'S1', kind: 'MC', number: 1, parts: [{ id: 'P1', label: '', requirement_id: 'R1', points: 0.25, indicator: '' }], scoring: { mode: 'sum_parts' } },
          { id: 'S2', kind: 'MC', number: 2, parts: [{ id: 'P2', label: '', requirement_id: 'R2', points: 0.25, indicator: '' }], scoring: { mode: 'sum_parts' } },
          { id: 'S3', kind: 'ES', number: 3, parts: [{ id: 'P3', label: '', requirement_id: 'R3', points: 1.0, indicator: '' }], scoring: { mode: 'sum_parts' } }
        ]
      }
    };
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Mau_Ma_tran_Tin_${g}_2026-2027.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadMatrixMdSample(grade = 9) {
    const g = Number(grade) || 9;
    const sampleMd = `# MA TRẬN & ĐẶC TẢ ĐỀ KIỂM TRA GIỮA HỌC KỲ 1
Môn: Tin học - Khối: ${g}
Thời gian: 45 phút - Năm học: 2026-2027

> Ghi chú: Hệ thống hỗ trợ 2 cách biểu diễn trong Markdown:
> Cách 1 (Bảng Đặc tả): Phù hợp khi chuyển từ Word sang. Mỗi dòng là một yêu cầu cần đạt kèm số câu.
> Cách 2 (Phân cấp đề mục ## Chủ đề, ### Bài học, - [Mức độ] [Dạng câu] YCCĐ): Dễ đọc, AI tạo chuẩn 100% không bao giờ lo lệch cột.

## BẢNG ĐẶC TẢ KĨ THUẬT ĐỀ KIỂM TRA

| TT | Chủ đề | Bài học / Đơn vị kiến thức | Mức độ đánh giá | Yêu cầu cần đạt | Số câu hỏi | Câu hỏi trong đề | Điểm |
|---|---|---|---|---|---|---|---|
| 1 | Máy tính và cộng đồng | Bài 1: Thế giới kĩ thuật số | Nhận biết | - Nhận biết được một số thiết bị số thông dụng.<br>- Nêu được ưu điểm của thiết bị số trong đời sống. | 2 TN | Câu 1, Câu 2 | 0.5 |
| | | | Thông hiểu | - Giải thích được vai trò của thiết bị số trong lưu trữ và xử lý thông tin. | 1 TN | Câu 3 | 0.25 |
| 2 | Tổ chức lưu trữ, tìm kiếm | Bài 2: Thông tin trong giải quyết vấn đề | Nhận biết | - Nhận biết được chất lượng của thông tin trên mạng Internet. | 1 TN | Câu 4 | 0.25 |
| | | | Thông hiểu | - Phân biệt được nguồn thông tin đáng tin cậy và không đáng tin cậy. | 2 TN | Câu 5, Câu 6 | 0.5 |
| | | | Vận dụng | - Thực hành tìm kiếm và đánh giá thông tin phục vụ giải quyết vấn đề thực tế. | 1 TL | Câu 1 TL | 1.0 |
`;
    const blob = new Blob([sampleMd], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Mau_Ma_tran_Tin_${g}_2026-2027.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function copyMatrixAiPrompt(grade = 9) {
    const g = Number(grade) || 9;
    const prompt = `Bạn là chuyên gia khảo thí môn Tin học phổ thông GDPT 2018 tại Trường Quốc tế Á Châu.
Hãy giúp tôi chuyển đổi nội dung Ma trận & Đặc tả đề kiểm tra môn Tin học Khối ${g} sang định dạng chuẩn để nạp vào hệ thống ExamMatrix Studio:

---
CÁCH 1: ĐỊNH DẠNG JSON (KHUYÊN DÙNG SỐ 1 - CHUẨN XÁC 100%):
{
  "format": "asian-school-matrix",
  "schema_version": 1,
  "matrix": {
    "profile": "${g >= 10 ? 'THPT' : 'THCS'}",
    "grade": ${g},
    "exam_type": "GK1",
    "duration": 45,
    "school_year": "2026-2027",
    "title": "Ma trận & đặc tả Kiểm tra Giữa HK1 Tin học ${g}",
    "total_points": 10,
    "lessons": [
      { "lesson_code": "B1", "title": "Tên bài 1", "topic": "Tên chủ đề 1" }
    ],
    "requirements": [
      { "id": "R1", "lesson_code": "B1", "level": "Biết", "text": "Nội dung YCCĐ...", "competency": "NLa" }
    ],
    "slots": [
      { "id": "S1", "kind": "MC", "number": 1, "parts": [{ "id": "P1", "label": "Câu 1", "requirement_id": "R1", "points": 0.25 }] }
    ]
  }
}

---
CÁCH 2: ĐỊNH DẠNG MARKDOWN PHÂN CẤP (DỄ ĐỌC, KHÔNG LO LỆCH CỘT KHI NHẬP):
# MA TRẬN & ĐẶC TẢ GIỮA KÌ 1 TIN HỌC ${g}
Môn: Tin học - Khối: ${g} - Thời gian: 45 phút - Năm học: 2026-2027

## Chủ đề 1: Máy tính và cộng đồng
### Bài 1: Tên bài học (Mã: B1)
- [Biết] [MC] Yêu cầu cần đạt 1... (2 câu · 0.5đ · Câu 1, Câu 2)
- [Hiểu] [MC] Yêu cầu cần đạt 2... (1 câu · 0.25đ · Câu 3)
- [Vận dụng] [ES] Yêu cầu cần đạt 3... (1 câu · 1.0đ · Câu 1 TL)

Quy ước:
- [Mức độ]: Biết, Hiểu, Vận dụng, Vận dụng cao.
- [Dạng câu]: MC (Trắc nghiệm 4 lựa chọn), YN (Đúng/Sai), SHORT (Trả lời ngắn), ES (Tự luận).
- Tổng điểm bằng 10.0 điểm.`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prompt).then(() => {
        alert('Đã chép Prompt AI vào bộ nhớ tạm! Thầy/Cô có thể dán vào ChatGPT hoặc Gemini để tạo ma trận chuẩn.');
      }).catch(() => {
        window.prompt('Sao chép Prompt AI dưới đây:', prompt);
      });
    } else {
      window.prompt('Sao chép Prompt AI dưới đây:', prompt);
    }
  }

  function renderImport(){
    const i=ui.importing;
    qs('#mx-work').innerHTML=`<section class="card">
      <p class="eyebrow">GIỮ NGUYÊN BẢN CỦA GIÁO VIÊN PHỤ TRÁCH</p>
      <h2>Nhận ma trận & đặc tả (JSON, Markdown hoặc Word)</h2>
      <div class="callout" style="background:#f0f7ff;border-left:4px solid #0267b1;padding:12px;margin:10px 0;font-size:13px;line-height:1.6">
        <strong>💡 Lưu ý xử lý ma trận nhiều bảng, nhiều cột:</strong><br>
        Ma trận GDPT 2018 thường có nhiều bảng (Khung ma trận & Bản đặc tả) với các ô gộp dòng/cột phức tạp.<br>
        • Khuyên dùng <strong>JSON</strong> (chuẩn xác 100%) hoặc dạng <strong>Markdown phân cấp theo đề mục</strong> để hệ thống nhận diện chính xác tuyệt đối, không lo lệch cột.<br>
        • Bấm <strong>"📥 Tải mẫu"</strong> hoặc <strong>"📋 Chép Prompt AI"</strong> để AI tạo ngay dữ liệu chuẩn.
      </div>
      <div style="display:flex;gap:10px;margin:10px 0 14px;flex-wrap:wrap">
        <button type="button" class="button quiet" id="mx-download-json-sample" style="color:#0267b1;padding:4px 8px;font-size:12px;font-weight:600">📥 Tải mẫu Ma trận (JSON)</button>
        <button type="button" class="button quiet" id="mx-download-md-sample" style="color:#0267b1;padding:4px 8px;font-size:12px;font-weight:600">📝 Tải mẫu Ma trận (Markdown)</button>
        <button type="button" class="button quiet" id="mx-copy-prompt" style="color:#0267b1;padding:4px 8px;font-size:12px;font-weight:600">📋 Chép Prompt AI tạo Ma trận</button>
      </div>
      <div class="form-grid">
        <div class="field"><label for="mx-import-grade">Khối lớp</label><select id="mx-import-grade">${grades().map(g=>opt(g,'Khối '+g,i.grade===g)).join('')}</select></div>
        <div class="field span2"><label for="mx-file">Chọn tệp Markdown (.md), JSON hoặc Word (.docx)</label><input type="file" id="mx-file" accept=".docx,.json,.md,.txt"></div>
      </div>
      <div id="mx-import-result">
        ${i.package?`<p class="callout">${E(packageSummary(i.package))}</p>`:i.candidate?`<p class="callout">Đã nhận dạng ${E(i.candidate.profile||'THCS')} · Khối ${i.grade} · ${i.candidate.slots?.length||0} vị trí câu hỏi. Đạt chuẩn cấu trúc ma trận & đặc tả.</p><ul class="mx-errors">${(i.issues||[]).map(x=>`<li>${E(x.message||x)}</li>`).join('')}</ul><p class="muted">Các chỉ báo và ánh xạ sẽ được mở ở màn hình đối chiếu. Nội dung gốc được bảo toàn.</p>`:'<p class="muted">Hỗ trợ tệp Markdown (.md), gói JSON chuẩn và Word (.docx). Bấm nút tải mẫu ở trên để xem định dạng chuẩn.</p>'}
        ${i.package||i.candidate?'<button class="primary" data-action="accept-import">Lưu bản nhận để đối chiếu & khóa</button>':''}
      </div>
      ${(i.candidate||i.package?.matrix)?`
        <div style="margin-top:20px;border-top:1px dashed var(--line);padding-top:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:10px;">
            <h3 style="margin:0;color:var(--navy);">Bản xem trước đối chiếu theo chuẩn Word (Tự động dựng)</h3>
            <button type="button" class="primary" data-action="accept-import">Lưu bản nhận để đối chiếu & khóa</button>
          </div>
          <p class="muted" style="margin-bottom:12px;">Bảng bên dưới được tự động trích xuất trực quan đúng bố cục Word (Khung ma trận & Bản đặc tả) để thầy/cô đối chiếu tức thì trước khi lưu.</p>
          <div class="mx-sheet-body" style="max-height:60vh;overflow:auto;">
            ${generateMatrixWordHtml(i.candidate || i.package?.matrix, 'all')}
          </div>
        </div>
      `:''}
    </section>`;

    const btnJson = qs('#mx-download-json-sample');
    if (btnJson) btnJson.onclick = () => downloadMatrixJsonSample(Number(qs('#mx-import-grade').value || 9));
    const btnMd = qs('#mx-download-md-sample');
    if (btnMd) btnMd.onclick = () => downloadMatrixMdSample(Number(qs('#mx-import-grade').value || 9));
    const btnPrompt = qs('#mx-copy-prompt');
    if (btnPrompt) btnPrompt.onclick = () => copyMatrixAiPrompt(Number(qs('#mx-import-grade').value || 9));
  }

  async function readImport(file){
    if(!file)return;
    const grade=Number(qs('#mx-import-grade').value);
    await run(async()=>{
      const ext = file.name.toLowerCase().split('.').pop();
      if(ext === 'json') {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.format === 'asian-school-matrix' || data.matrix) {
          ui.importing = { grade: Number(data.matrix?.grade || grade), package: data };
        } else {
          ui.importing = { grade, package: { format: 'asian-school-matrix', schema_version: 1, matrix: data } };
        }
      } else if (ext === 'md' || ext === 'txt') {
        const text = await file.text();
        const parsed = parseMatrixFromMarkdown(text, grade);
        if (!parsed || !parsed.matrix) throw new Error('Không đọc được cấu trúc ma trận từ tệp Markdown.');
        ui.importing = {
          grade: parsed.matrix.grade || grade,
          candidate: parsed.matrix,
          package: parsed,
          filename: file.name
        };
      } else {
        if(file.size>8*1024*1024) throw new Error('Word phải nhỏ hơn 8 MB.');
        const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
        const result=await ui.ctx.request('/api/matrices/inspect-docx',{filename:file.name,grade,content_base64:base64});
        ui.importing={...result,grade,filename:file.name,base64};
      }
      renderImport();
    });
  }
  function renderGeneration(){const g=ui.generation,m=g.matrix;const revisions=(ui.ctx.revisions||[]).filter(r=>r.grade===m.grade);qs('#mx-work').innerHTML=`<section class="card"><p class="eyebrow">ĐỀ RIÊNG THEO MA TRẬN ĐÃ KHÓA</p><h2>${E(m.title)} · V${m.version}</h2><p>Phân bố và điểm giữ theo ma trận chung. Chọn câu và xác nhận chỉ báo cho từng vị trí.</p><div class="form-grid"><div class="field span2"><label for="mx-exam-title">Tên đề riêng</label><input id="mx-exam-title" value="${E(periods[m.exam_type]+' · '+subject(m)+' '+m.grade)}"></div><div class="field"><label for="mx-exam-campus">Cơ sở ra đề</label><input id="mx-exam-campus" value="${generic()?'':'Cao Thắng'}"></div><div class="field"><label for="mx-exam-code">Mã đề</label><input id="mx-exam-code" value="101"></div><div class="field"><label for="mx-exam-seed">Mã xáo trộn phương án</label><input id="mx-exam-seed" value="2026"></div><div class="field full"><label for="mx-exam-revision">Phiên bản đề cương</label><select id="mx-exam-revision">${opt('','Chọn đề cương đã lưu',true)}${revisions.map(r=>opt(r.id,r.title,false)).join('')}</select></div></div><div class="actions"><button data-action="suggest">Gợi ý chọn câu không trùng</button><span id="mx-coverage"></span></div>
    ${g.slots.map(entry=>{const s=entry.slot;return `<article class="mx-exam-slot"><h3>${E(NAMEShort(s.kind))} ${s.number} · ${s.parts.reduce((n,p)=>n+Number(p.points),0)} điểm</h3><div class="field"><label for="mx-choice-${E(s.id)}">Câu cho vị trí ${E(s.id)}</label><select id="mx-choice-${E(s.id)}" data-choice="${E(s.id)}">${opt('','Chọn câu phù hợp',true)}${entry.candidates.map(q=>opt(q.id,(q.recently_used?.length?'⚠ Vừa dùng · ':'')+q.id+' · '+q.question.slice(0,180),false)).join('')}</select></div><div id="mx-choice-detail-${E(s.id)}" class="mx-choice-detail"></div>${entry.requirements.map((r,i)=>`<label class="mx-checkbox"><input type="checkbox" data-review-slot="${E(s.id)}" value="${E(s.parts[i].id)}">Đã đối chiếu ${E(s.parts[i].label||'câu này')}: ${E(r.text)}</label>`).join('')}${!entry.candidates.length?'<p class="mx-bad">Chưa có câu khớp bài, dạng, mức độ và YCCĐ nguồn. Cần bổ sung ngân hàng; không bù sang ô khác.</p>':''}</article>`;}).join('')}
    <button class="primary" data-action="generate">Tạo và lưu đề riêng</button><div id="mx-created-exam"></div></section>`;const values=g.formValues||{};ui.container.querySelectorAll('[id^=mx-exam-],[data-choice],[data-review-slot]').forEach(el=>{const key=el.dataset.reviewSlot?'review:'+el.dataset.reviewSlot+':'+el.value:el.id;if(Object.prototype.hasOwnProperty.call(values,key)){if(el.type==='checkbox')el.checked=values[key];else el.value=values[key];}});g.slots.forEach(e=>showChoice(e.slot.id));coverage();}
  function showChoice(id){const entry=ui.generation.slots.find(e=>e.slot.id===id);const q=entry.candidates.find(q=>q.id===qs('#mx-choice-'+id).value);qs('#mx-choice-detail-'+id).innerHTML=q?`<p class="question-text">${E(q.question)}</p>${q.options?'<ol type="A">'+q.options.map((o,i)=>`<li>${E(o)}${i===q.correct?' <strong>— đáp án đúng</strong>':''}</li>`).join('')+'</ol>':q.rubric?'<ul>'+q.rubric.map(c=>`<li>${E(c.criterion)}</li>`).join('')+'</ul>':''}<p class="small muted">YCCĐ nguồn: ${E(q.learning_outcome)}</p>${q.recently_used?.length?`<p class="mx-bad">⚠ Câu đã có trong đề đã phát hành gần đây: ${q.recently_used.map(u=>`${E(u.title||u.exam_id)} (${E(String(u.published_at||'').slice(0,10))})`).join('; ')}. Chỉ là cảnh báo; nên cân nhắc chọn câu khác.</p>`:''}`:'';}
  function coverage(){if(!ui.generation||!qs('#mx-coverage'))return;const rev=(ui.ctx.revisions||[]).find(r=>r.id===qs('#mx-exam-revision').value),hashes=new Set((rev?.questions||[]).map(q=>q.content_hash));let count=0,matched=0;for(const e of ui.generation.slots){const q=e.candidates.find(q=>q.id===qs('#mx-choice-'+e.slot.id).value);if(q){count++;if(hashes.has(q.content_hash))matched++;}}qs('#mx-coverage').textContent=`Đã chọn ${count}/${ui.generation.slots.length} câu · Khớp nội dung đề cương ${matched} câu. Máy chủ sẽ kiểm tra lại khi tạo đề.`;}
  function suggest(){const rev=(ui.ctx.revisions||[]).find(r=>r.id===qs('#mx-exam-revision').value),hashes=new Set((rev?.questions||[]).map(q=>q.content_hash));const used=new Set();for(const e of ui.generation.slots){const pool=e.candidates.slice().sort((a,b)=>Number(hashes.has(b.content_hash))-Number(hashes.has(a.content_hash)));const q=pool.find(q=>!used.has(q.id));qs('#mx-choice-'+e.slot.id).value=q?.id||'';if(q)used.add(q.id);ui.container.querySelectorAll('[data-review-slot]').forEach(c=>{if(c.dataset.reviewSlot===e.slot.id)c.checked=false;});showChoice(e.slot.id);}captureGeneration();coverage();message('Đã gợi ý câu. Thầy cần xem nội dung và đánh dấu đối chiếu từng chỉ báo trước khi lưu đề.');}
  async function generate(){const g=ui.generation;const placements=g.slots.map(e=>({slot_id:e.slot.id,question_id:qs('#mx-choice-'+e.slot.id).value,reviewed_part_ids:[...ui.container.querySelectorAll('[data-review-slot]')].filter(x=>x.dataset.reviewSlot===e.slot.id&&x.checked).map(x=>x.value)}));const result=await ui.ctx.request('/api/exams/from-matrix',{matrix_id:g.matrix.id,revision_id:qs('#mx-exam-revision').value,title:qs('#mx-exam-title').value,campus:qs('#mx-exam-campus').value,exam_code:qs('#mx-exam-code').value,seed:qs('#mx-exam-seed').value,placements});const e=result.exam,base='/api/exams/'+encodeURIComponent(e.id)+'/export';qs('#mx-created-exam').innerHTML=`<div class="callout"><h3>Đã lưu đề ${E(e.exam_code)} · ${E(e.campus)}</h3><p>${e.question_count} câu · 10 điểm · Khớp đề cương ${e.revision_match_count}/${e.question_count} câu · Ma trận V${e.matrix_version}</p><div class="actions"><button type="button" class="primary" data-view-exam="${E(e.id)}" data-mode="student">Xem đề học sinh</button><button type="button" data-view-exam="${E(e.id)}" data-mode="answers">Xem đáp án & HDC</button><a class="button" href="${base}?format=docx&answers=0">Word học sinh</a><a class="button" href="${base}?format=docx&answers=1">Word đáp án</a></div></div>`;ui.ctx.onExamCreated?.(e);message('Đã tạo đề riêng và lưu phiên bản ma trận dùng chung cùng đề.');}
  const api={shortfallHtml,mount,formatRefs,filterRecords,visibleActions,escapeHtml,packageSummary,effectiveKinds,setAllowedKinds,ynTable,setYnCoefficient,requirementLevelOptions,parseMatrixFromMarkdown,downloadMatrixJsonSample,downloadMatrixMdSample,copyMatrixAiPrompt,buildMatrixView,generateMatrixWordHtml,generateMatrixWordStandaloneHtml,downloadMatrixWord,downloadMatrixJson,STANDARD_PRESETS,newDraft,updateSlotsFromGrid,renumberAllSlots};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MatrixUI=api;
})(typeof window!=='undefined'?window:globalThis);
