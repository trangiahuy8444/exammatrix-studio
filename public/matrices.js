(function(root){
  'use strict';
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const E=escapeHtml;
  const profileLabel=p=>p==='GENERAL'?'Mẫu chung':p;
  const competencyLabel=c=>{const item=ui.editing?.competency_catalog?.find(x=>x.code===c);if(item)return `${c} · ${item.name}`;const catName=root.BankCompetencyCatalog?.competencyNameForCode?.(c,ui.editing?.subject_name||ui.ctx?.context?.subject_name);if(catName&&catName!==c)return `${c} · ${catName}`;return ({TDLL:'TDLL · Tư duy và lập luận toán học',MHH:'MHH · Mô hình hóa toán học','GQVĐ':'GQVĐ · Giải quyết vấn đề toán học',GT:'GT · Giao tiếp toán học',SDCC:'SDCC · Sử dụng công cụ học toán'}[c]||c);};
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
  function profileOptionsHtml(){
    return '';
  }
  const periods={TX:'Thường xuyên',GK1:'Giữa học kì I',CK1:'Cuối học kì I',GK2:'Giữa học kì II',CK2:'Cuối học kì II'};
  const levels=['Biết','Hiểu','Vận dụng','Vận dụng cao'];
  function requirementLevelOptions(value){return levels.map(l=>opt(l,l,l===value)).join('');}
    const STANDARD_PRESETS = JSON.parse("{\"6\": {\"profile\": \"THCS\", \"grade\": 6, \"exam_type\": \"GK1\", \"duration\": 45, \"school_year\": \"2026-2027\", \"title\": \"Ma tr\u1eadn & \u0111\u1eb7c t\u1ea3 Ki\u1ec3m tra Gi\u1eefa HK1 \u00b7 M\u00f4n Tin h\u1ecdc Kh\u1ed1i 6\", \"owner_name\": \"T\u1ed5 Tin h\u1ecdc \u00c1 Ch\u00e2u\", \"campus\": \"Cao Th\u1eafng\", \"total_points\": 10, \"lessons\": [{\"lesson_code\": \"B1\", \"title\": \"Th\u00f4ng tin v\u00e0 d\u1eef li\u1ec7u\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 c\u1ed9ng \u0111\u1ed3ng\"}, {\"lesson_code\": \"B2\", \"title\": \"X\u1eed l\u00fd th\u00f4ng tin\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 c\u1ed9ng \u0111\u1ed3ng\"}, {\"lesson_code\": \"B3\", \"title\": \"Th\u00f4ng tin trong m\u00e1y t\u00ednh\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 c\u1ed9ng \u0111\u1ed3ng\"}, {\"lesson_code\": \"B4\", \"title\": \"M\u1ea1ng m\u00e1y t\u00ednh\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2. M\u1ea1ng m\u00e1y t\u00ednh v\u00e0 Internet\"}, {\"lesson_code\": \"B5\", \"title\": \"Internet\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2. M\u1ea1ng m\u00e1y t\u00ednh v\u00e0 Internet\"}], \"requirements\": [{\"id\": \"R1\", \"lesson_code\": \"B1\", \"level\": \"Bi\u1ebft\", \"text\": \"Nh\u1eadn bi\u1ebft \u0111\u01b0\u1ee3c s\u1ef1 kh\u00e1c nhau gi\u1eefa th\u00f4ng tin v\u00e0 d\u1eef li\u1ec7u.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R2\", \"lesson_code\": \"B1\", \"level\": \"Hi\u1ec3u\", \"text\": \"Ph\u00e2n bi\u1ec7t \u0111\u01b0\u1ee3c th\u00f4ng tin v\u00e0 v\u1eadt mang tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R3\", \"lesson_code\": \"B1\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 minh hoa m\u1ed1i quan h\u1ec7 gi\u1eefa th\u00f4ng tin v\u00e0 d\u1eef li\u1ec7u.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R4\", \"lesson_code\": \"B2\", \"level\": \"Bi\u1ebft\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c c\u00e1c ho\u1ea1t \u0111\u1ed9ng c\u01a1 b\u1ea3n trong x\u1eed l\u00ed th\u00f4ng tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R5\", \"lesson_code\": \"B2\", \"level\": \"Hi\u1ec3u\", \"text\": \"Gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c m\u00e1y t\u00ednh l\u00e0 c\u00f4ng c\u1ee5 hi\u1ec7u qu\u1ea3 \u0111\u1ec3 x\u1eed l\u00ed th\u00f4ng tin. N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 minh hoa c\u1ee5 th\u1ec3.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R6\", \"lesson_code\": \"B2\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c m\u00e1y t\u00ednh l\u00e0 c\u00f4ng c\u1ee5 hi\u1ec7u qu\u1ea3 \u0111\u1ec3 x\u1eed l\u00ed th\u00f4ng tin. N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 minh hoa c\u1ee5 th\u1ec3.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R7\", \"lesson_code\": \"B3\", \"level\": \"Bi\u1ebft\", \"text\": \"Gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c vi\u1ec7c c\u00f3 th\u1ec3 bi\u1ec3u di\u1ec5n th\u00f4ng tin ch\u1ec9 v\u1edbi hai k\u00ed hi\u1ec7u 0 v\u00e0 1.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R8\", \"lesson_code\": \"B3\", \"level\": \"Hi\u1ec3u\", \"text\": \"Bi\u1ebft \u0111\u01b0\u1ee3c bit l\u00e0 \u0111\u01a1n v\u1ecb nh\u1ecf nh\u1ea5t trong l\u01b0u tr\u1eef th\u00f4ng tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R9\", \"lesson_code\": \"B3\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c t\u00ean v\u00e0 \u0111\u1ed9 l\u1edbn c\u1ee7a c\u00e1c \u0111\u01a1n v\u1ecb c\u01a1 b\u1ea3n \u0111o dung l\u01b0\u1ee3ng th\u00f4ng tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R10\", \"lesson_code\": \"B4\", \"level\": \"Bi\u1ebft\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c m\u1ea1ng m\u00e1y t\u00ednh l\u00e0 g\u00ec v\u00e0 l\u1ee3i \u00edch c\u1ee7a n\u00f3 trong cu\u1ed9c s\u1ed1ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R11\", \"lesson_code\": \"B4\", \"level\": \"Hi\u1ec3u\", \"text\": \"K\u1ec3 \u0111\u01b0\u1ee3c t\u00ean nh\u1eefng th\u00e0nh ph\u1ea7n ch\u00ednh c\u1ee7a m\u1ed9t m\u1ea1ng m\u00e1y t\u00ednh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R12\", \"lesson_code\": \"B4\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 c\u1ee5 th\u1ec3 v\u1ec1 tr\u01b0\u1eddng h\u1ee3p m\u1ea1ng kh\u00f4ng d\u00e2y ti\u1ec7n d\u1ee5ng h\u01a1n m\u1ea1ng c\u00f3 d\u00e2y.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R13\", \"lesson_code\": \"B5\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft Internet l\u00e0 g\u00ec.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R14\", \"lesson_code\": \"B5\", \"level\": \"Hi\u1ec3u\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 \u0111\u1eb7c \u0111i\u1ec3m ch\u00ednh c\u1ee7a Internet.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R15\", \"lesson_code\": \"B5\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 l\u1ee3i \u00edch ch\u00ednh c\u1ee7a Internet.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R16\", \"lesson_code\": \"B5\", \"level\": \"V\u1eadn d\u1ee5ng cao\", \"text\": \"V\u1eadn d\u1ee5ng ki\u1ebfn th\u1ee9c, k\u0129 n\u0103ng t\u1ed5ng h\u1ee3p \u0111\u1ec3 gi\u1ea3i quy\u1ebft t\u00ecnh hu\u1ed1ng th\u1ef1c t\u1ebf.\", \"ppct_outcome_index\": 0, \"competency\": \"NLc\"}], \"slots\": [{\"id\": \"S1\", \"kind\": \"MC\", \"number\": 1, \"parts\": [{\"id\": \"P1\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S2\", \"kind\": \"MC\", \"number\": 2, \"parts\": [{\"id\": \"P2\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S3\", \"kind\": \"MC\", \"number\": 3, \"parts\": [{\"id\": \"P3\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S4\", \"kind\": \"MC\", \"number\": 4, \"parts\": [{\"id\": \"P4\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S5\", \"kind\": \"MC\", \"number\": 5, \"parts\": [{\"id\": \"P5\", \"label\": \"\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S6\", \"kind\": \"MC\", \"number\": 6, \"parts\": [{\"id\": \"P6\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S7\", \"kind\": \"MC\", \"number\": 7, \"parts\": [{\"id\": \"P7\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S8\", \"kind\": \"MC\", \"number\": 8, \"parts\": [{\"id\": \"P8\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S9\", \"kind\": \"MC\", \"number\": 9, \"parts\": [{\"id\": \"P9\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S10\", \"kind\": \"MC\", \"number\": 10, \"parts\": [{\"id\": \"P10\", \"label\": \"\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S11\", \"kind\": \"MC\", \"number\": 11, \"parts\": [{\"id\": \"P11\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S12\", \"kind\": \"MC\", \"number\": 12, \"parts\": [{\"id\": \"P12\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S13\", \"kind\": \"MC\", \"number\": 13, \"parts\": [{\"id\": \"P13\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S14\", \"kind\": \"MC\", \"number\": 14, \"parts\": [{\"id\": \"P14\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S15\", \"kind\": \"MC\", \"number\": 15, \"parts\": [{\"id\": \"P15\", \"label\": \"\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S16\", \"kind\": \"MC\", \"number\": 16, \"parts\": [{\"id\": \"P16\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S17\", \"kind\": \"MC\", \"number\": 17, \"parts\": [{\"id\": \"P17\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S18\", \"kind\": \"MC\", \"number\": 18, \"parts\": [{\"id\": \"P18\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S19\", \"kind\": \"MC\", \"number\": 19, \"parts\": [{\"id\": \"P19\", \"label\": \"\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S20\", \"kind\": \"MC\", \"number\": 20, \"parts\": [{\"id\": \"P20\", \"label\": \"\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S21\", \"kind\": \"MC\", \"number\": 21, \"parts\": [{\"id\": \"P21\", \"label\": \"\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S22\", \"kind\": \"MC\", \"number\": 22, \"parts\": [{\"id\": \"P22\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S23\", \"kind\": \"MC\", \"number\": 23, \"parts\": [{\"id\": \"P23\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S24\", \"kind\": \"MC\", \"number\": 24, \"parts\": [{\"id\": \"P24\", \"label\": \"\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S25\", \"kind\": \"MC\", \"number\": 25, \"parts\": [{\"id\": \"P25\", \"label\": \"\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S26\", \"kind\": \"MC\", \"number\": 26, \"parts\": [{\"id\": \"P26\", \"label\": \"\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S27\", \"kind\": \"MC\", \"number\": 27, \"parts\": [{\"id\": \"P27\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S28\", \"kind\": \"MC\", \"number\": 28, \"parts\": [{\"id\": \"P28\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S29\", \"kind\": \"ES\", \"number\": 1, \"parts\": [{\"id\": \"P29\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S30\", \"kind\": \"ES\", \"number\": 2, \"parts\": [{\"id\": \"P30\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S31\", \"kind\": \"ES\", \"number\": 3, \"parts\": [{\"id\": \"P31\", \"label\": \"\", \"requirement_id\": \"R16\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}], \"indicator_catalog\": []}, \"7\": {\"profile\": \"THCS\", \"grade\": 7, \"exam_type\": \"GK1\", \"duration\": 45, \"school_year\": \"2026-2027\", \"title\": \"Ma tr\u1eadn & \u0111\u1eb7c t\u1ea3 Ki\u1ec3m tra Gi\u1eefa HK1 \u00b7 M\u00f4n Tin h\u1ecdc Kh\u1ed1i 7\", \"owner_name\": \"T\u1ed5 Tin h\u1ecdc \u00c1 Ch\u00e2u\", \"campus\": \"Cao Th\u1eafng\", \"total_points\": 10, \"lessons\": [{\"lesson_code\": \"B1\", \"title\": \"Thi\u1ebft b\u1ecb v\u00e0o - ra\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 c\u1ed9ng \u0111\u1ed3ng\"}, {\"lesson_code\": \"B2\", \"title\": \"Ph\u1ea7n m\u1ec1m m\u00e1y t\u00ednh\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 c\u1ed9ng \u0111\u1ed3ng\"}, {\"lesson_code\": \"B3\", \"title\": \"Qu\u1ea3n l\u00fd d\u1eef li\u1ec7u trong m\u00e1y t\u00ednh\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 c\u1ed9ng \u0111\u1ed3ng\"}, {\"lesson_code\": \"B4\", \"title\": \"M\u1ea1ng x\u00e3 h\u1ed9i v\u00e0 m\u1ed9t s\u1ed1 k\u00eanh trao \u0111\u1ed5i th\u00f4ng tin tr\u00ean Internet\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2. T\u1ed5 ch\u1ee9c l\u01b0u tr\u1eef, t\u00ecm ki\u1ebfm v\u00e0 trao \u0111\u1ed5i th\u00f4ng tin\"}, {\"lesson_code\": \"B5\", \"title\": \"\u1ee8ng x\u1eed tr\u00ean m\u1ea1ng\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 3. \u0110\u1ea1o \u0111\u1ee9c, ph\u00e1p lu\u1eadt v\u00e0 v\u0103n h\u00f3a trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\"}], \"requirements\": [{\"id\": \"R1\", \"lesson_code\": \"B1\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft v\u00e0 nh\u1eadn ra \u0111\u01b0\u1ee3c c\u00e1c thi\u1ebft b\u1ecb v\u00e0o\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R2\", \"lesson_code\": \"B1\", \"level\": \"Hi\u1ec3u\", \"text\": \"ra c\u00f3 nhi\u1ec1u lo\u1ea1i, h\u00ecnh d\u1ea1ng kh\u00e1c nhau.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R3\", \"lesson_code\": \"B1\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Bi\u1ebft \u0111\u01b0\u1ee3c ch\u1ee9c n\u0103ng c\u1ee7a c\u00e1c thi\u1ebft b\u1ecb v\u00e0o\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R4\", \"lesson_code\": \"B2\", \"level\": \"Bi\u1ebft\", \"text\": \"Gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c s\u01a1 l\u01b0\u1ee3c ch\u1ee9c n\u0103ng \u0111i\u1ec1u khi\u1ec3n v\u00e0 qu\u1ea3n l\u00ed c\u1ee7a h\u1ec7 \u0111i\u1ec1u h\u00e0nh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R5\", \"lesson_code\": \"B2\", \"level\": \"Hi\u1ec3u\", \"text\": \"Ph\u00e2n bi\u1ec7t \u0111\u01b0\u1ee3c h\u1ec7 \u0111i\u1ec1u h\u00e0nh v\u1edbi ph\u1ea7n m\u1ec1m \u1ee9ng d\u1ee5ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R6\", \"lesson_code\": \"B2\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c t\u00ean m\u1ed9t s\u1ed1 ph\u1ea7n m\u1ec1m \u1ee9ng d\u1ee5ng \u0111\u00e3 s\u1eed d\u1ee5ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R7\", \"lesson_code\": \"B3\", \"level\": \"Bi\u1ebft\", \"text\": \"Thao t\u00e1c th\u00e0nh th\u1ea1o v\u1edbi t\u1ec7p v\u00e0 th\u01b0 m\u1ee5c: t\u1ea1o, sao ch\u00e9p, di chuy\u1ec3n, \u0111\u1ed5i t\u00ean, xo\u00e1 t\u1ec7p v\u00e0 th\u01b0 m\u1ee5c.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R8\", \"lesson_code\": \"B3\", \"level\": \"Hi\u1ec3u\", \"text\": \"Bi\u1ebft \u0111\u01b0\u1ee3c t\u1ec7p ch\u01b0\u01a1ng tr\u00ecnh c\u0169ng l\u00e0 d\u1eef li\u1ec7u, c\u00f3 th\u1ec3 \u0111\u01b0\u1ee3c l\u01b0u tr\u1eef trong m\u00e1y t\u00ednh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R9\", \"lesson_code\": \"B3\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 v\u1ec1 bi\u1ec7n ph\u00e1p b\u1ea3o v\u1ec7 d\u1eef li\u1ec7u nh\u01b0 sao l\u01b0u, ph\u00f2ng ch\u1ed1ng virus, ...\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R10\", \"lesson_code\": \"B4\", \"level\": \"Bi\u1ebft\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c t\u00ean m\u1ed9t k\u00eanh trao \u0111\u1ed5i th\u00f4ng tin th\u00f4ng d\u1ee5ng tr\u00ean Internet v\u00e0 lo\u1ea1i th\u00f4ng tin trao \u0111\u1ed5i tr\u00ean k\u00eanh \u0111\u00f3.\", \"ppct_outcome_index\": 0, \"competency\": \"NLe\"}, {\"id\": \"R11\", \"lesson_code\": \"B4\", \"level\": \"Hi\u1ec3u\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 ch\u1ee9c n\u0103ng c\u01a1 b\u1ea3n c\u1ee7a m\u1ea1ng x\u00e3 h\u1ed9i. Nh\u1eadn bi\u1ebft \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 website l\u00e0 m\u1ea1ng x\u00e3 h\u1ed9i.\", \"ppct_outcome_index\": 0, \"competency\": \"NLe\"}, {\"id\": \"R12\", \"lesson_code\": \"B4\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 ch\u1ee9c n\u0103ng c\u01a1 b\u1ea3n c\u1ee7a m\u1ed9t m\u1ea1ng x\u00e3 h\u1ed9i \u0111\u1ec3 giao l\u01b0u v\u00e0 chias\u1ebb th\u00f4ng tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLe\"}, {\"id\": \"R13\", \"lesson_code\": \"B5\", \"level\": \"Bi\u1ebft\", \"text\": \"Th\u1ef1c hi\u1ec7n \u0111\u01b0\u1ee3c giao ti\u1ebfp qua m\u1ea1ng theo \u0111\u00fang quy t\u1eafc v\u00e0 b\u1eb1ng ng\u00f4n ng\u1eef l\u1ecbch s\u1ef1, th\u1ec3 hi\u1ec7n \u1ee9ng x\u1eed c\u00f3 v\u0103n hoa.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R14\", \"lesson_code\": \"B5\", \"level\": \"Hi\u1ec3u\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 truy c\u1eadp kh\u00f4ng h\u1ee3p l\u1ec7 v\u00e0o c\u00e1c ngu\u1ed3n th\u00f4ng tin; bi\u1ebft c\u00e1ch \u1ee9ng x\u1eed h\u1ee3p l\u00ed khi g\u1eb7p nh\u1eefng th\u00f4ng tin tr\u00ean m\u1ea1ng c\u00f3 n\u1ed9i dung x\u1ea5u, kh\u00f4ng ph\u00f9 h\u1ee3p l\u1ee9a tu\u1ed5i.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R15\", \"lesson_code\": \"B5\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Bi\u1ebft \u0111\u01b0\u1ee3c t\u00e1c h\u1ea1i c\u1ee7a b\u1ec7nh nghi\u1ec7n Internet, t\u1eeb \u0111\u00f3 c\u00f3 \u00fd th\u1ee9c ph\u00f2ng tr\u00e1nh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R16\", \"lesson_code\": \"B5\", \"level\": \"V\u1eadn d\u1ee5ng cao\", \"text\": \"V\u1eadn d\u1ee5ng ki\u1ebfn th\u1ee9c, k\u0129 n\u0103ng t\u1ed5ng h\u1ee3p \u0111\u1ec3 gi\u1ea3i quy\u1ebft t\u00ecnh hu\u1ed1ng th\u1ef1c t\u1ebf.\", \"ppct_outcome_index\": 0, \"competency\": \"NLc\"}], \"slots\": [{\"id\": \"S1\", \"kind\": \"MC\", \"number\": 1, \"parts\": [{\"id\": \"P1\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S2\", \"kind\": \"MC\", \"number\": 2, \"parts\": [{\"id\": \"P2\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S3\", \"kind\": \"MC\", \"number\": 3, \"parts\": [{\"id\": \"P3\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S4\", \"kind\": \"MC\", \"number\": 4, \"parts\": [{\"id\": \"P4\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S5\", \"kind\": \"MC\", \"number\": 5, \"parts\": [{\"id\": \"P5\", \"label\": \"\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S6\", \"kind\": \"MC\", \"number\": 6, \"parts\": [{\"id\": \"P6\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S7\", \"kind\": \"MC\", \"number\": 7, \"parts\": [{\"id\": \"P7\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S8\", \"kind\": \"MC\", \"number\": 8, \"parts\": [{\"id\": \"P8\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S9\", \"kind\": \"MC\", \"number\": 9, \"parts\": [{\"id\": \"P9\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S10\", \"kind\": \"MC\", \"number\": 10, \"parts\": [{\"id\": \"P10\", \"label\": \"\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S11\", \"kind\": \"MC\", \"number\": 11, \"parts\": [{\"id\": \"P11\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S12\", \"kind\": \"MC\", \"number\": 12, \"parts\": [{\"id\": \"P12\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S13\", \"kind\": \"MC\", \"number\": 13, \"parts\": [{\"id\": \"P13\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S14\", \"kind\": \"MC\", \"number\": 14, \"parts\": [{\"id\": \"P14\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S15\", \"kind\": \"MC\", \"number\": 15, \"parts\": [{\"id\": \"P15\", \"label\": \"\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S16\", \"kind\": \"MC\", \"number\": 16, \"parts\": [{\"id\": \"P16\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S17\", \"kind\": \"MC\", \"number\": 17, \"parts\": [{\"id\": \"P17\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S18\", \"kind\": \"MC\", \"number\": 18, \"parts\": [{\"id\": \"P18\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S19\", \"kind\": \"MC\", \"number\": 19, \"parts\": [{\"id\": \"P19\", \"label\": \"\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S20\", \"kind\": \"MC\", \"number\": 20, \"parts\": [{\"id\": \"P20\", \"label\": \"\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S21\", \"kind\": \"MC\", \"number\": 21, \"parts\": [{\"id\": \"P21\", \"label\": \"\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S22\", \"kind\": \"MC\", \"number\": 22, \"parts\": [{\"id\": \"P22\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S23\", \"kind\": \"MC\", \"number\": 23, \"parts\": [{\"id\": \"P23\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S24\", \"kind\": \"MC\", \"number\": 24, \"parts\": [{\"id\": \"P24\", \"label\": \"\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S25\", \"kind\": \"MC\", \"number\": 25, \"parts\": [{\"id\": \"P25\", \"label\": \"\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S26\", \"kind\": \"MC\", \"number\": 26, \"parts\": [{\"id\": \"P26\", \"label\": \"\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S27\", \"kind\": \"MC\", \"number\": 27, \"parts\": [{\"id\": \"P27\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S28\", \"kind\": \"MC\", \"number\": 28, \"parts\": [{\"id\": \"P28\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S29\", \"kind\": \"ES\", \"number\": 1, \"parts\": [{\"id\": \"P29\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S30\", \"kind\": \"ES\", \"number\": 2, \"parts\": [{\"id\": \"P30\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S31\", \"kind\": \"ES\", \"number\": 3, \"parts\": [{\"id\": \"P31\", \"label\": \"\", \"requirement_id\": \"R16\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}], \"indicator_catalog\": []}, \"8\": {\"profile\": \"THCS\", \"grade\": 8, \"exam_type\": \"GK1\", \"duration\": 45, \"school_year\": \"2026-2027\", \"title\": \"Ma tr\u1eadn & \u0111\u1eb7c t\u1ea3 Ki\u1ec3m tra Gi\u1eefa HK1 \u00b7 M\u00f4n Tin h\u1ecdc Kh\u1ed1i 8\", \"owner_name\": \"T\u1ed5 Tin h\u1ecdc \u00c1 Ch\u00e2u\", \"campus\": \"Cao Th\u1eafng\", \"total_points\": 10, \"lessons\": [{\"lesson_code\": \"B1\", \"title\": \"L\u01b0\u1ee3c s\u1eed c\u00f4ng c\u1ee5 t\u00ednh to\u00e1n\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1: M\u00e1y t\u00ednh v\u00e0 c\u1ed9ng \u0111\u1ed3ng\"}, {\"lesson_code\": \"B2\", \"title\": \"Th\u00f4ng tin trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2: T\u1ed5 ch\u1ee9c l\u01b0u tr\u1eef, t\u00ecm ki\u1ebfm v\u00e0 trao \u0111\u1ed5i th\u00f4ng tin\"}, {\"lesson_code\": \"B3\", \"title\": \"Th\u1ef1c h\u00e0nh: Khai th\u00e1c th\u00f4ng tin s\u1ed1\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2: T\u1ed5 ch\u1ee9c l\u01b0u tr\u1eef, t\u00ecm ki\u1ebfm v\u00e0 trao \u0111\u1ed5i th\u00f4ng tin\"}, {\"lesson_code\": \"B4\", \"title\": \"\u0110\u1ea1o \u0111\u1ee9c v\u00e0 v\u0103n h\u00f3a trong s\u1eed d\u1ee5ng k\u0129 thu\u1eadt s\u1ed1\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 3: \u0110\u1ea1o \u0111\u1ee9c, ph\u00e1p lu\u1eadt v\u00e0 v\u0103n h\u00f3a trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\"}, {\"lesson_code\": \"B12\", \"title\": \"T\u1eeb thu\u1eadt to\u00e1n \u0111\u1ebfn ch\u01b0\u01a1ng tr\u00ecnh\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 5: Gi\u1ea3i quy\u1ebft v\u1ea5n \u0111\u1ec1 v\u1edbi s\u1ef1 tr\u1ee3 gi\u00fap c\u1ee7a m\u00e1y t\u00ednh\"}], \"requirements\": [{\"id\": \"R1\", \"lesson_code\": \"B1\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft \u0111\u01b0\u1ee3c s\u1ef1 ra \u0111\u1eddi c\u1ee7a nh\u1eefng chi\u1ebfc m\u00e1y t\u00ednh \u0111\u1ea7u ti\u00ean v\u00e0 ng\u01b0\u1eddi \u0111\u1eb7t n\u1ec1n m\u00f3ng cho s\u1ef1 ph\u00e1t tri\u1ec3n c\u1ee7a m\u00e1y t\u00ednh; bi\u1ebft \u0111\u01b0\u1ee3c c\u00e1c c\u00f4ng ngh\u1ec7 s\u1eed d\u1ee5ng trong t\u1eebng th\u1ebf h\u1ec7 m\u00e1y t\u00ednh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R2\", \"lesson_code\": \"B1\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u \u0111\u01b0\u1ee3c \u0111\u1eb7c \u0111i\u1ec3m c\u1ee7a c\u00e1c m\u00e1y t\u00ednh trong c\u00f9ng m\u1ed9t giai \u0111o\u1ea1n; gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c s\u1ef1 ph\u00e1t tri\u1ec3n c\u1ee7a m\u00e1y t\u00ednh qua c\u00e1c th\u1ebf h\u1ec7.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R3\", \"lesson_code\": \"B2\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft \u0111\u01b0\u1ee3c \u0111\u1eb7c \u0111i\u1ec3m c\u1ee7a th\u00f4ng tin s\u1ed1 v\u00e0 ph\u1ea7n m\u1edf r\u1ed9ng c\u1ee7a c\u00e1c lo\u1ea1i t\u1eadp tin kh\u00e1c nhau.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R4\", \"lesson_code\": \"B2\", \"level\": \"Hi\u1ec3u\", \"text\": \"Gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c v\u00ec sao th\u00f4ng tin s\u1ed1 chi\u1ebfm t\u1ec9 l\u1ec7 r\u1ea5t l\u1edbn.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R5\", \"lesson_code\": \"B2\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Hi\u1ec3u \u0111\u01b0\u1ee3c \u0111\u1eb7c \u0111i\u1ec3m c\u1ee7a th\u00f4ng tin s\u1ed1, t\u1eeb \u0111\u00f3 v\u1eadn d\u1ee5ng v\u00e0o th\u1ef1c ti\u1ec5n \u0111\u1ec3 n\u00e2ng cao ch\u1ea5t l\u01b0\u1ee3ng cu\u1ed9c s\u1ed1ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R6\", \"lesson_code\": \"B3\", \"level\": \"Bi\u1ebft\", \"text\": \"Nh\u1eadn bi\u1ebft \u0111\u01b0\u1ee3c th\u00f4ng tin n\u00e0o \u0111\u00e1ng tin c\u1eady v\u00e0 kh\u00f4ng \u0111\u00e1ng tin c\u1eady.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R7\", \"lesson_code\": \"B3\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u \u0111\u01b0\u1ee3c th\u00f4ng tin c\u00f3 gi\u00e1 tr\u1ecb v\u1ec1 m\u1eb7t ph\u00e1p l\u00fd.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R8\", \"lesson_code\": \"B3\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"T\u00ecm ki\u1ebfm v\u00e0 cho v\u00ed d\u1ee5 v\u1ec1 th\u00f4ng tin h\u1ee3p l\u00fd, \u0111\u00e1ng tin c\u1eady.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R9\", \"lesson_code\": \"B4\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft m\u1ed9t s\u1ed1 bi\u1ec3u hi\u1ec7n vi ph\u1ea1m \u0111\u1ea1o \u0111\u1ee9c v\u00e0 ph\u00e1p lu\u1eadt, bi\u1ec3u hi\u1ec7n thi\u1ebfu v\u0103n h\u00f3a khi s\u1eed d\u1ee5ng c\u00f4ng ngh\u1ec7 k\u0129 thu\u1eadt s\u1ed1.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R10\", \"lesson_code\": \"B4\", \"level\": \"Hi\u1ec3u\", \"text\": \"Gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 bi\u1ec3u hi\u1ec7n vi ph\u1ea1m \u0111\u1ea1o \u0111\u1ee9c v\u00e0 ph\u00e1p lu\u1eadt, bi\u1ec3u hi\u1ec7n thi\u1ebfu v\u0103n h\u00f3a khi s\u1eed d\u1ee5ng c\u00f4ng ngh\u1ec7 k\u0129 thu\u1eadt s\u1ed1.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R11\", \"lesson_code\": \"B4\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"\u0110\u1ea3m b\u1ea3o c\u00e1c s\u1ea3n ph\u1ea9m s\u1ed1 do b\u1ea3n th\u00e2n t\u1ea1o ra th\u1ec3 hi\u1ec7n \u0111\u1ea1o \u0111\u1ee9c, t\u00ednh v\u0103n h\u00f3a, kh\u00f4ng vi ph\u1ea1m ph\u00e1p lu\u1eadt v\u00e0 v\u1eadn d\u1ee5ng v\u00e0o cu\u1ed9c s\u1ed1ng th\u1ef1c ti\u1ec5n.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R12\", \"lesson_code\": \"B12\", \"level\": \"Bi\u1ebft\", \"text\": \"Nh\u1eadn bi\u1ebft \u0111\u01b0\u1ee3c kh\u00e1i ni\u1ec7m thu\u1eadt to\u00e1n, ch\u01b0\u01a1ng tr\u00ecnh v\u00e0 m\u1ed1i quan h\u1ec7 gi\u1eefa thu\u1eadt to\u00e1n v\u00e0 ch\u01b0\u01a1ng tr\u00ecnh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R13\", \"lesson_code\": \"B12\", \"level\": \"Hi\u1ec3u\", \"text\": \"Gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c m\u1ed1i quan h\u1ec7 gi\u1eefa thu\u1eadt to\u00e1n v\u00e0 ch\u01b0\u01a1ng tr\u00ecnh; m\u00f4 t\u1ea3 \u0111\u01b0\u1ee3c c\u00e1ch chuy\u1ec3n m\u1ed9t thu\u1eadt to\u00e1n \u0111\u01a1n gi\u1ea3n th\u00e0nh ch\u01b0\u01a1ng tr\u00ecnh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}], \"slots\": [{\"id\": \"S1\", \"kind\": \"MC\", \"number\": 1, \"parts\": [{\"id\": \"P1\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S2\", \"kind\": \"MC\", \"number\": 2, \"parts\": [{\"id\": \"P2\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S3\", \"kind\": \"MC\", \"number\": 3, \"parts\": [{\"id\": \"P3\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S4\", \"kind\": \"MC\", \"number\": 4, \"parts\": [{\"id\": \"P4\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S5\", \"kind\": \"MC\", \"number\": 5, \"parts\": [{\"id\": \"P5\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S6\", \"kind\": \"MC\", \"number\": 6, \"parts\": [{\"id\": \"P6\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S7\", \"kind\": \"MC\", \"number\": 7, \"parts\": [{\"id\": \"P7\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S8\", \"kind\": \"MC\", \"number\": 8, \"parts\": [{\"id\": \"P8\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S9\", \"kind\": \"MC\", \"number\": 9, \"parts\": [{\"id\": \"P9\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S10\", \"kind\": \"MC\", \"number\": 10, \"parts\": [{\"id\": \"P10\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S11\", \"kind\": \"MC\", \"number\": 11, \"parts\": [{\"id\": \"P11\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S12\", \"kind\": \"MC\", \"number\": 12, \"parts\": [{\"id\": \"P12\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S13\", \"kind\": \"MC\", \"number\": 13, \"parts\": [{\"id\": \"P13\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S14\", \"kind\": \"MC\", \"number\": 14, \"parts\": [{\"id\": \"P14\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S15\", \"kind\": \"MC\", \"number\": 15, \"parts\": [{\"id\": \"P15\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S16\", \"kind\": \"MC\", \"number\": 16, \"parts\": [{\"id\": \"P16\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S17\", \"kind\": \"MC\", \"number\": 17, \"parts\": [{\"id\": \"P17\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S18\", \"kind\": \"MC\", \"number\": 18, \"parts\": [{\"id\": \"P18\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S19\", \"kind\": \"MC\", \"number\": 19, \"parts\": [{\"id\": \"P19\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S20\", \"kind\": \"MC\", \"number\": 20, \"parts\": [{\"id\": \"P20\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S21\", \"kind\": \"MC\", \"number\": 21, \"parts\": [{\"id\": \"P21\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S22\", \"kind\": \"MC\", \"number\": 22, \"parts\": [{\"id\": \"P22\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S23\", \"kind\": \"MC\", \"number\": 23, \"parts\": [{\"id\": \"P23\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S24\", \"kind\": \"MC\", \"number\": 24, \"parts\": [{\"id\": \"P24\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S25\", \"kind\": \"MC\", \"number\": 25, \"parts\": [{\"id\": \"P25\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S26\", \"kind\": \"MC\", \"number\": 26, \"parts\": [{\"id\": \"P26\", \"label\": \"\", \"requirement_id\": \"R12\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S27\", \"kind\": \"MC\", \"number\": 27, \"parts\": [{\"id\": \"P27\", \"label\": \"\", \"requirement_id\": \"R12\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S28\", \"kind\": \"MC\", \"number\": 28, \"parts\": [{\"id\": \"P28\", \"label\": \"\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S29\", \"kind\": \"ES\", \"number\": 29, \"parts\": [{\"id\": \"P29\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S30\", \"kind\": \"ES\", \"number\": 30, \"parts\": [{\"id\": \"P30\", \"label\": \"\", \"requirement_id\": \"R8\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S31\", \"kind\": \"ES\", \"number\": 31, \"parts\": [{\"id\": \"P31\", \"label\": \"\", \"requirement_id\": \"R11\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}]}, \"9\": {\"profile\": \"THCS\", \"grade\": 9, \"exam_type\": \"GK1\", \"duration\": 45, \"school_year\": \"2026-2027\", \"title\": \"Ma tr\u1eadn & \u0111\u1eb7c t\u1ea3 Ki\u1ec3m tra Gi\u1eefa HK1 \u00b7 M\u00f4n Tin h\u1ecdc Kh\u1ed1i 9\", \"owner_name\": \"T\u1ed5 Tin h\u1ecdc \u00c1 Ch\u00e2u\", \"campus\": \"Cao Th\u1eafng\", \"total_points\": 10, \"lessons\": [{\"lesson_code\": \"B1\", \"title\": \"Th\u1ebf gi\u1edbi k\u0129 thu\u1eadt s\u1ed1\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1: M\u00e1y t\u00ednh v\u00e0 c\u1ed9ng \u0111\u1ed3ng\"}, {\"lesson_code\": \"B2\", \"title\": \"Th\u00f4ng tin trong gi\u1ea3i quy\u1ebft v\u1ea5n \u0111\u1ec1\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2: T\u1ed5 ch\u1ee9c l\u01b0u tr\u1eef, t\u00ecm ki\u1ebfm v\u00e0 trao \u0111\u1ed5i th\u00f4ng tin\"}, {\"lesson_code\": \"B3\", \"title\": \"Th\u1ef1c h\u00e0nh: \u0110\u00e1nh gi\u00e1 ch\u1ea5t l\u01b0\u1ee3ng th\u00f4ng tin\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2: T\u1ed5 ch\u1ee9c l\u01b0u tr\u1eef, t\u00ecm ki\u1ebfm v\u00e0 trao \u0111\u1ed5i th\u00f4ng tin\"}, {\"lesson_code\": \"B4\", \"title\": \"M\u1ed9t s\u1ed1 v\u1ea5n \u0111\u1ec1 ph\u00e1p l\u00fd v\u1ec1 s\u1eed d\u1ee5ng d\u1ecbch v\u1ee5 Internet\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 3: \u0110\u1ea1o \u0111\u1ee9c, ph\u00e1p lu\u1eadt v\u00e0 v\u0103n h\u00f3a s\u1ed1\"}, {\"lesson_code\": \"B5\", \"title\": \"T\u00ecm hi\u1ec3u ph\u1ea7n m\u1ec1m m\u00f4 ph\u1ecfng\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 4: \u1ee8ng d\u1ee5ng tin h\u1ecdc\"}], \"requirements\": [{\"id\": \"R1\", \"lesson_code\": \"B1\", \"level\": \"Bi\u1ebft\", \"text\": \"Nh\u1eadn bi\u1ebft \u0111\u01b0\u1ee3c c\u00e1c thi\u1ebft b\u1ecb c\u00f3 t\u00edch h\u1ee3p b\u1ed9 x\u1eed l\u00ed th\u00f4ng tin trong \u0111\u1eddi s\u1ed1ng, th\u01b0\u01a1ng m\u1ea1i; nh\u1eadn bi\u1ebft th\u00e0nh ph\u1ea7n c\u1ed1t l\u00f5i v\u00e0 ch\u1ee9c n\u0103ng c\u1ee7a CPU.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R2\", \"lesson_code\": \"B1\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u y\u00eau c\u1ea7u s\u1ed1 h\u00f3a d\u1eef li\u1ec7u th\u00e0nh d\u00e3y bit; ph\u00e2n t\u00edch \u01b0u th\u1ebf c\u1ee7a m\u00e1y t\u00ednh v\u1ec1 dung l\u01b0\u1ee3ng l\u01b0u tr\u1eef v\u00e0 truy\u1ec1n th\u00f4ng tin t\u1ed1c \u0111\u1ed9 cao to\u00e0n c\u1ea7u.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R3\", \"lesson_code\": \"B2\", \"level\": \"Bi\u1ebft\", \"text\": \"Nh\u1eadn bi\u1ebft b\u1ed1n ti\u00eau ch\u00ed \u0111\u00e1nh gi\u00e1 ch\u1ea5t l\u01b0\u1ee3ng th\u00f4ng tin, ti\u00eau ch\u00ed quan tr\u1ecdng h\u00e0ng \u0111\u1ea7u, vai tr\u00f2 c\u1ee7a ch\u1ea5t l\u01b0\u1ee3ng th\u00f4ng tin v\u00e0 t\u00ednh s\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c.\", \"ppct_outcome_index\": 0, \"competency\": \"NLc\"}, {\"id\": \"R4\", \"lesson_code\": \"B2\", \"level\": \"Hi\u1ec3u\", \"text\": \"Gi\u1ea3i th\u00edch s\u1ef1 c\u1ea7n thi\u1ebft c\u1ee7a vi\u1ec7c ki\u1ec3m tra ch\u1ea5t l\u01b0\u1ee3ng th\u00f4ng tin tr\u00ean Internet; ph\u00e2n t\u00edch th\u00f4ng tin sai l\u1ec7ch ho\u1eb7c thi\u1ebfu s\u00f3t theo ti\u00eau ch\u00ed t\u00ednh m\u1edbi, \u0111\u1ea7y \u0111\u1ee7, ch\u00ednh x\u00e1c.\", \"ppct_outcome_index\": 0, \"competency\": \"NLc\"}, {\"id\": \"R5\", \"lesson_code\": \"B3\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"V\u1eadn d\u1ee5ng ti\u00eau ch\u00ed t\u00ednh m\u1edbi, ch\u00ednh x\u00e1c, \u0111\u1ea7y \u0111\u1ee7, s\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c \u0111\u1ec3 \u0111\u00e1nh gi\u00e1 th\u00f4ng tin; x\u00e1c \u0111\u1ecbnh th\u00f4ng tin c\u1ea7n thu th\u1eadp v\u00e0 ngu\u1ed3n tin c\u1eady khi l\u1eadp k\u1ebf ho\u1ea1ch ho\u1ea1t \u0111\u1ed9ng d\u00e3 ngo\u1ea1i h\u1ecdc t\u1eadp.\", \"ppct_outcome_index\": 0, \"competency\": \"NLc\"}, {\"id\": \"R6\", \"lesson_code\": \"B4\", \"level\": \"Bi\u1ebft\", \"text\": \"Nh\u1eadn di\u1ec7n t\u00e1c \u0111\u1ed9ng ti\u00eau c\u1ef1c do l\u1ea1m d\u1ee5ng thi\u1ebft b\u1ecb s\u1ed1, r\u00e1c th\u1ea3i \u0111i\u1ec7n t\u1eed; h\u00e0nh vi x\u00e2m ph\u1ea1m quy\u1ec1n ri\u00eang t\u01b0 v\u00e0 quy t\u1eafc \u1ee9ng x\u1eed tr\u00ean m\u1ea1ng x\u00e3 h\u1ed9i.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R7\", \"lesson_code\": \"B4\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u tr\u00e1ch nhi\u1ec7m ph\u00e1p l\u00fd tr\u00ean kh\u00f4ng gian m\u1ea1ng, ch\u1ebf t\u00e0i \u0111\u1ed1i v\u1edbi tin gi\u1ea3 v\u00e0 chu\u1ea9n m\u1ef1c t\u00f4n tr\u1ecdng b\u1ea3n quy\u1ec1n, tr\u00edch d\u1eabn ngu\u1ed3n t\u00e0i nguy\u00ean s\u1ed1.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R8\", \"lesson_code\": \"B4\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"\u1ee8ng x\u1eed c\u00f3 v\u0103n h\u00f3a, t\u00f4n tr\u1ecdng quy\u1ec1n ri\u00eang t\u01b0 \u0111\u1ed1i v\u1edbi t\u00e0i kho\u1ea3n ch\u01b0a \u0111\u0103ng xu\u1ea5t; ph\u00e2n t\u00edch h\u1eadu qu\u1ea3 t\u00e2m l\u00fd v\u00e0 ph\u00e1p l\u00fd c\u1ee7a b\u1ea1o l\u1ef1c m\u1ea1ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R9\", \"lesson_code\": \"B5\", \"level\": \"Bi\u1ebft\", \"text\": \"Nh\u1eadn bi\u1ebft kh\u00e1i ni\u1ec7m, v\u00ed d\u1ee5 v\u00e0 m\u1ee5c \u0111\u00edch s\u1eed d\u1ee5ng ph\u1ea7n m\u1ec1m m\u00f4 ph\u1ecfng PhET; x\u00e1c \u0111\u1ecbnh l\u0129nh v\u1ef1c khoa h\u1ecdc c\u1ee7a m\u00f4 ph\u1ecfng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLd\"}, {\"id\": \"R10\", \"lesson_code\": \"B5\", \"level\": \"Hi\u1ec3u\", \"text\": \"Ph\u00e2n t\u00edch l\u1ee3i \u00edch c\u1ee7a m\u00f4 ph\u1ecfng th\u00ed nghi\u1ec7m \u1ea3o \u0111\u1ed1i v\u1edbi hi\u1ec7n t\u01b0\u1ee3ng nguy hi\u1ec3m, vi m\u00f4 ho\u1eb7c t\u1ed1n k\u00e9m; hi\u1ec3u \u1ee9ng d\u1ee5ng m\u00f4 ph\u1ecfng giao th\u00f4ng trong quy ho\u1ea1ch \u0111\u00f4 th\u1ecb.\", \"ppct_outcome_index\": 0, \"competency\": \"NLd\"}, {\"id\": \"R11\", \"lesson_code\": \"B5\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Gi\u1ea3i th\u00edch \u01b0u th\u1ebf m\u00f4 ph\u1ecfng m\u1ea1ch \u0111i\u1ec7n m\u1ed9t chi\u1ec1u so v\u1edbi th\u00ed nghi\u1ec7m th\u1eadt; m\u00f4 t\u1ea3 thao t\u00e1c l\u1eafp m\u1ea1ch, \u0111\u00f3ng c\u00f4ng t\u1eafc v\u00e0 \u0111o c\u01b0\u1eddng \u0111\u1ed9 d\u00f2ng \u0111i\u1ec7n tr\u00ean PhET.\", \"ppct_outcome_index\": 0, \"competency\": \"NLd\"}], \"slots\": [{\"id\": \"S1\", \"kind\": \"MC\", \"number\": 1, \"parts\": [{\"id\": \"P1\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S2\", \"kind\": \"MC\", \"number\": 2, \"parts\": [{\"id\": \"P2\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S3\", \"kind\": \"MC\", \"number\": 3, \"parts\": [{\"id\": \"P3\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S4\", \"kind\": \"MC\", \"number\": 4, \"parts\": [{\"id\": \"P4\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S5\", \"kind\": \"MC\", \"number\": 5, \"parts\": [{\"id\": \"P5\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S6\", \"kind\": \"MC\", \"number\": 6, \"parts\": [{\"id\": \"P6\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S7\", \"kind\": \"MC\", \"number\": 7, \"parts\": [{\"id\": \"P7\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S8\", \"kind\": \"MC\", \"number\": 8, \"parts\": [{\"id\": \"P8\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S9\", \"kind\": \"MC\", \"number\": 9, \"parts\": [{\"id\": \"P9\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S10\", \"kind\": \"MC\", \"number\": 10, \"parts\": [{\"id\": \"P10\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S11\", \"kind\": \"MC\", \"number\": 11, \"parts\": [{\"id\": \"P11\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S12\", \"kind\": \"MC\", \"number\": 12, \"parts\": [{\"id\": \"P12\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S13\", \"kind\": \"MC\", \"number\": 13, \"parts\": [{\"id\": \"P13\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S14\", \"kind\": \"MC\", \"number\": 14, \"parts\": [{\"id\": \"P14\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S15\", \"kind\": \"MC\", \"number\": 15, \"parts\": [{\"id\": \"P15\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S16\", \"kind\": \"MC\", \"number\": 16, \"parts\": [{\"id\": \"P16\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S17\", \"kind\": \"MC\", \"number\": 17, \"parts\": [{\"id\": \"P17\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S18\", \"kind\": \"MC\", \"number\": 18, \"parts\": [{\"id\": \"P18\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S19\", \"kind\": \"MC\", \"number\": 19, \"parts\": [{\"id\": \"P19\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S20\", \"kind\": \"MC\", \"number\": 20, \"parts\": [{\"id\": \"P20\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S21\", \"kind\": \"MC\", \"number\": 21, \"parts\": [{\"id\": \"P21\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S22\", \"kind\": \"MC\", \"number\": 22, \"parts\": [{\"id\": \"P22\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S23\", \"kind\": \"MC\", \"number\": 23, \"parts\": [{\"id\": \"P23\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S24\", \"kind\": \"MC\", \"number\": 24, \"parts\": [{\"id\": \"P24\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S25\", \"kind\": \"MC\", \"number\": 25, \"parts\": [{\"id\": \"P25\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S26\", \"kind\": \"MC\", \"number\": 26, \"parts\": [{\"id\": \"P26\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S27\", \"kind\": \"MC\", \"number\": 27, \"parts\": [{\"id\": \"P27\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S28\", \"kind\": \"MC\", \"number\": 28, \"parts\": [{\"id\": \"P28\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S29\", \"kind\": \"ES\", \"number\": 1, \"parts\": [{\"id\": \"P29\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S30\", \"kind\": \"ES\", \"number\": 2, \"parts\": [{\"id\": \"P30\", \"label\": \"\", \"requirement_id\": \"R8\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S31\", \"kind\": \"ES\", \"number\": 3, \"parts\": [{\"id\": \"P31\", \"label\": \"\", \"requirement_id\": \"R11\", \"points\": 1, \"indicator\": \"\"}], \"scoring\": {\"mode\": \"sum_parts\"}}]}, \"10\": {\"profile\": \"THPT\", \"grade\": 10, \"exam_type\": \"GK1\", \"duration\": 45, \"school_year\": \"2026-2027\", \"title\": \"Ma tr\u1eadn & \u0111\u1eb7c t\u1ea3 Ki\u1ec3m tra Gi\u1eefa HK1 \u00b7 M\u00f4n Tin h\u1ecdc Kh\u1ed1i 10\", \"owner_name\": \"T\u1ed5 Tin h\u1ecdc \u00c1 Ch\u00e2u\", \"campus\": \"Cao Th\u1eafng\", \"total_points\": 10, \"lessons\": [{\"lesson_code\": \"B1\", \"title\": \"Th\u00f4ng tin v\u00e0 x\u1eed l\u00ed th\u00f4ng tin\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1: M\u00e1y t\u00ednh v\u00e0 x\u00e3 h\u1ed9i tri th\u1ee9c\"}, {\"lesson_code\": \"B2\", \"title\": \"Vai tr\u00f2 c\u1ee7a thi\u1ebft b\u1ecb th\u00f4ng minh v\u00e0 tin h\u1ecdc \u0111\u1ed1i v\u1edbi x\u00e3 h\u1ed9i\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1: M\u00e1y t\u00ednh v\u00e0 x\u00e3 h\u1ed9i tri th\u1ee9c\"}, {\"lesson_code\": \"B3\", \"title\": \"Th\u1ef1c h\u00e0nh s\u1eed d\u1ee5ng thi\u1ebft b\u1ecb th\u00f4ng d\u1ee5ng\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1: M\u00e1y t\u00ednh v\u00e0 x\u00e3 h\u1ed9i tri th\u1ee9c\"}, {\"lesson_code\": \"B4\", \"title\": \"M\u1ea1ng m\u00e1y t\u00ednh trong cu\u1ed9c s\u1ed1ng hi\u1ec7n \u0111\u1ea1i\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2: M\u1ea1ng m\u00e1y t\u00ednh v\u00e0 Internet\"}, {\"lesson_code\": \"B5\", \"title\": \"An to\u00e0n tr\u00ean kh\u00f4ng gian m\u1ea1ng\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2: M\u1ea1ng m\u00e1y t\u00ednh v\u00e0 Internet\"}, {\"lesson_code\": \"B6\", \"title\": \"Th\u1ef1c h\u00e0nh khai th\u00e1c t\u00e0i nguy\u00ean tr\u00ean Internet\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2: M\u1ea1ng m\u00e1y t\u00ednh v\u00e0 Internet\"}, {\"lesson_code\": \"B7\", \"title\": \"\u1ee8ng x\u1eed tr\u00ean m\u00f4i tr\u01b0\u1eddng s\u1ed1. Ngh\u0129a v\u1ee5 t\u00f4n tr\u1ecdng b\u1ea3n quy\u1ec1n\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 3: \u0110\u1ea1o \u0111\u1ee9c, ph\u00e1p lu\u1eadt v\u00e0 v\u0103n h\u00f3a trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\"}, {\"lesson_code\": \"B8\", \"title\": \"Ph\u1ea7n m\u1ec1m thi\u1ebft k\u1ebf \u0111\u1ed3 h\u1ecda\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 4: \u1ee8ng d\u1ee5ng tin h\u1ecdc\"}], \"requirements\": [{\"id\": \"R1\", \"lesson_code\": \"B1\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft \u0111\u01b0\u1ee3c th\u00f4ng tin, d\u1eef li\u1ec7u v\u00e0 c\u00e1c b\u01b0\u1edbc c\u01a1 b\u1ea3n trong x\u1eed l\u00ed th\u00f4ng tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R2\", \"lesson_code\": \"B1\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u \u0111\u01b0\u1ee3c \u01b0u \u0111i\u1ec3m c\u1ee7a thi\u1ebft b\u1ecb s\u1ed1.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R3\", \"lesson_code\": \"B1\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Gi\u1ea3i th\u00edch c\u00e1c t\u00ecnh hu\u1ed1ng li\u00ean quan \u0111\u1ebfn vi\u1ec7c l\u01b0u tr\u1eef th\u00f4ng tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R4\", \"lesson_code\": \"B2\", \"level\": \"Bi\u1ebft\", \"text\": \"Nh\u1eadn bi\u1ebft thi\u1ebft b\u1ecb th\u00f4ng minh; n\u00eau \u0111\u01b0\u1ee3c vai tr\u00f2 c\u1ee7a thi\u1ebft b\u1ecb th\u00f4ng minh trong cu\u1ed9c c\u00e1ch m\u1ea1ng c\u00f4ng nghi\u1ec7p l\u1ea7n th\u1ee9 t\u01b0.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R5\", \"lesson_code\": \"B2\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u \u0111\u01b0\u1ee3c \u0111\u1eb7c \u0111i\u1ec3m c\u1ee7a Internet v\u1ea1n v\u1eadt (IoT) trong h\u1ec7 th\u1ed1ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R6\", \"lesson_code\": \"B3\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 \u1ee9ng d\u1ee5ng tr\u00ean \u0111i\u1ec7n tho\u1ea1i th\u00f4ng minh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R7\", \"lesson_code\": \"B3\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u \u0111\u01b0\u1ee3c l\u1ee3i \u00edch c\u1ee7a vi\u1ec7c l\u01b0u tr\u1eef \u0111\u00e1m m\u00e2y.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R8\", \"lesson_code\": \"B3\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"\u00c1p d\u1ee5ng \u0111\u01b0\u1ee3c vi\u1ec7c l\u01b0u tr\u1eef d\u1eef li\u1ec7u tr\u00ean Internet.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R9\", \"lesson_code\": \"B4\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft \u0111\u01b0\u1ee3c m\u1ea1ng LAN, Internet v\u00e0 c\u00e1c lo\u1ea1i d\u1ecbch v\u1ee5 \u0111\u00e1m m\u00e2y c\u01a1 b\u1ea3n.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R10\", \"lesson_code\": \"B4\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u \u0111\u01b0\u1ee3c l\u1ee3i \u00edch c\u1ee7a vi\u1ec7c t\u1ef1 \u0111\u1ecdc d\u1eef li\u1ec7u c\u1ee7a c\u00e1c thi\u1ebft b\u1ecb.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R11\", \"lesson_code\": \"B4\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"V\u1eadn d\u1ee5ng ki\u1ebfn th\u1ee9c trong c\u00e1c t\u00ecnh hu\u1ed1ng li\u00ean quan \u0111\u1ebfn l\u01b0u tr\u1eef d\u1eef li\u1ec7u \u0111\u00e1m m\u00e2y.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R12\", \"lesson_code\": \"B5\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft nguy c\u01a1 khi t\u1ea3i ph\u1ea7n m\u1ec1m b\u1ebb kh\u00f3a, kh\u1ea3 n\u0103ng l\u00e2y nhi\u1ec5m c\u1ee7a virus v\u00e0 c\u00e1ch l\u1ef1a ch\u1ecdn qu\u00e9t virus.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R13\", \"lesson_code\": \"B5\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u t\u1ea7m quan tr\u1ecdng c\u1ee7a vi\u1ec7c x\u00e1c minh th\u00f4ng tin v\u00e0 kh\u1ea3 n\u0103ng l\u00e2y nhi\u1ec5m virus.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R14\", \"lesson_code\": \"B5\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"V\u1eadn d\u1ee5ng c\u00e1ch qu\u00e9t virus ph\u00f9 h\u1ee3p trong th\u1ef1c t\u1ebf.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R15\", \"lesson_code\": \"B6\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u c\u00e1ch th\u1ee9c ho\u1ea1t \u0111\u1ed9ng c\u1ee7a Google Translate v\u00e0 b\u1ed1 c\u1ee5c t\u1ed5 ch\u1ee9c kho d\u1eef li\u1ec7u s\u1ed1.\", \"ppct_outcome_index\": 0, \"competency\": \"NLc\"}, {\"id\": \"R16\", \"lesson_code\": \"B7\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft quy\u1ec1n khi mua b\u1ea3n quy\u1ec1n ph\u1ea7n m\u1ec1m, quy\u1ec1n t\u00e1c gi\u1ea3 v\u00e0 \u0111i\u1ec1u ki\u1ec7n tr\u1edf th\u00e0nh ch\u1ee7 s\u1edf h\u1eefu b\u1ea3n quy\u1ec1n ph\u1ea7n m\u1ec1m.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R17\", \"lesson_code\": \"B7\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u c\u00e1c h\u00e0nh vi, tr\u01b0\u1eddng h\u1ee3p vi ph\u1ea1m b\u1ea3n quy\u1ec1n.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R18\", \"lesson_code\": \"B7\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"V\u1eadn d\u1ee5ng hi\u1ec3u bi\u1ebft v\u1ec1 gi\u1ea5y ph\u00e9p b\u1ea3n quy\u1ec1n khi s\u1eed d\u1ee5ng t\u00e0i nguy\u00ean s\u1ed1.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R19\", \"lesson_code\": \"B8\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft h\u00ecnh \u1ea3nh \u0111\u1ed3 h\u1ecda \u0111\u01b0\u1ee3c t\u1ea1o th\u00e0nh t\u1eeb \u0111i\u1ec3m \u1ea3nh v\u00e0 ph\u1ea7n m\u1edf r\u1ed9ng t\u1ec7p c\u1ee7a Inkscape.\", \"ppct_outcome_index\": 0, \"competency\": \"NLc\"}, {\"id\": \"R20\", \"lesson_code\": \"B8\", \"level\": \"Hi\u1ec3u\", \"text\": \"Hi\u1ec3u t\u00ednh n\u0103ng c\u1ee7a m\u1ed9t s\u1ed1 l\u1ec7nh c\u01a1 b\u1ea3n trong Inkscape.\", \"ppct_outcome_index\": 0, \"competency\": \"NLc\"}, {\"id\": \"R21\", \"lesson_code\": \"B8\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"V\u1ebd \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 h\u00ecnh \u0111\u01a1n gi\u1ea3n trong ph\u1ea7n m\u1ec1m Inkscape.\", \"ppct_outcome_index\": 0, \"competency\": \"NLc\"}], \"slots\": [{\"id\": \"S1\", \"kind\": \"MC\", \"number\": 1, \"parts\": [{\"id\": \"P1\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S2\", \"kind\": \"MC\", \"number\": 2, \"parts\": [{\"id\": \"P2\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S3\", \"kind\": \"MC\", \"number\": 3, \"parts\": [{\"id\": \"P3\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S4\", \"kind\": \"MC\", \"number\": 4, \"parts\": [{\"id\": \"P4\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S5\", \"kind\": \"MC\", \"number\": 5, \"parts\": [{\"id\": \"P5\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S6\", \"kind\": \"MC\", \"number\": 6, \"parts\": [{\"id\": \"P6\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S7\", \"kind\": \"MC\", \"number\": 7, \"parts\": [{\"id\": \"P7\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S8\", \"kind\": \"MC\", \"number\": 8, \"parts\": [{\"id\": \"P8\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S9\", \"kind\": \"MC\", \"number\": 9, \"parts\": [{\"id\": \"P9\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S10\", \"kind\": \"MC\", \"number\": 10, \"parts\": [{\"id\": \"P10\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S11\", \"kind\": \"MC\", \"number\": 11, \"parts\": [{\"id\": \"P11\", \"label\": \"\", \"requirement_id\": \"R12\", \"points\": 0.25, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S12\", \"kind\": \"MC\", \"number\": 12, \"parts\": [{\"id\": \"P12\", \"label\": \"\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S13\", \"kind\": \"MC\", \"number\": 13, \"parts\": [{\"id\": \"P13\", \"label\": \"\", \"requirement_id\": \"R15\", \"points\": 0.25, \"indicator\": \"NLc.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S14\", \"kind\": \"MC\", \"number\": 14, \"parts\": [{\"id\": \"P14\", \"label\": \"\", \"requirement_id\": \"R15\", \"points\": 0.25, \"indicator\": \"NLc.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S15\", \"kind\": \"MC\", \"number\": 15, \"parts\": [{\"id\": \"P15\", \"label\": \"\", \"requirement_id\": \"R16\", \"points\": 0.25, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S16\", \"kind\": \"MC\", \"number\": 16, \"parts\": [{\"id\": \"P16\", \"label\": \"\", \"requirement_id\": \"R17\", \"points\": 0.25, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S17\", \"kind\": \"MC\", \"number\": 17, \"parts\": [{\"id\": \"P17\", \"label\": \"\", \"requirement_id\": \"R19\", \"points\": 0.25, \"indicator\": \"NLc.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S18\", \"kind\": \"MC\", \"number\": 18, \"parts\": [{\"id\": \"P18\", \"label\": \"\", \"requirement_id\": \"R19\", \"points\": 0.25, \"indicator\": \"NLc.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S19\", \"kind\": \"MC\", \"number\": 19, \"parts\": [{\"id\": \"P19\", \"label\": \"\", \"requirement_id\": \"R20\", \"points\": 0.25, \"indicator\": \"NLc.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S20\", \"kind\": \"YN\", \"number\": 1, \"parts\": [{\"id\": \"P20\", \"label\": \"a\", \"requirement_id\": \"R6\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P21\", \"label\": \"b\", \"requirement_id\": \"R6\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P22\", \"label\": \"c\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P23\", \"label\": \"d\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S21\", \"kind\": \"YN\", \"number\": 2, \"parts\": [{\"id\": \"P24\", \"label\": \"a\", \"requirement_id\": \"R12\", \"points\": 0.25, \"indicator\": \"NLb.1\"}, {\"id\": \"P25\", \"label\": \"b\", \"requirement_id\": \"R12\", \"points\": 0.25, \"indicator\": \"NLb.1\"}, {\"id\": \"P26\", \"label\": \"c\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"NLb.1\"}, {\"id\": \"P27\", \"label\": \"d\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S22\", \"kind\": \"YN\", \"number\": 3, \"parts\": [{\"id\": \"P28\", \"label\": \"a\", \"requirement_id\": \"R16\", \"points\": 0.25, \"indicator\": \"NLb.1\"}, {\"id\": \"P29\", \"label\": \"b\", \"requirement_id\": \"R16\", \"points\": 0.25, \"indicator\": \"NLb.1\"}, {\"id\": \"P30\", \"label\": \"c\", \"requirement_id\": \"R17\", \"points\": 0.25, \"indicator\": \"NLb.1\"}, {\"id\": \"P31\", \"label\": \"d\", \"requirement_id\": \"R18\", \"points\": 0.25, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S23\", \"kind\": \"ES\", \"number\": 1, \"parts\": [{\"id\": \"P32\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 0.75, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S24\", \"kind\": \"ES\", \"number\": 2, \"parts\": [{\"id\": \"P33\", \"label\": \"\", \"requirement_id\": \"R11\", \"points\": 0.75, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S25\", \"kind\": \"ES\", \"number\": 3, \"parts\": [{\"id\": \"P34\", \"label\": \"\", \"requirement_id\": \"R21\", \"points\": 0.75, \"indicator\": \"NLc.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}], \"competency_catalog\": [{\"code\": \"NLa\", \"name\": \"S\u1eed d\u1ee5ng v\u00e0 qu\u1ea3n l\u00ed c\u00e1c ph\u01b0\u01a1ng ti\u1ec7n c\u00f4ng ngh\u1ec7 th\u00f4ng tin v\u00e0 truy\u1ec1n th\u00f4ng\"}, {\"code\": \"NLb\", \"name\": \"\u1ee8ng x\u1eed ph\u00f9 h\u1ee3p trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\"}, {\"code\": \"NLc\", \"name\": \"Gi\u1ea3i quy\u1ebft v\u1ea5n \u0111\u1ec1 v\u1edbi s\u1ef1 h\u1ed7 tr\u1ee3 c\u1ee7a c\u00f4ng ngh\u1ec7 th\u00f4ng tin v\u00e0 truy\u1ec1n th\u00f4ng\"}, {\"code\": \"NLd\", \"name\": \"\u1ee8ng d\u1ee5ng c\u00f4ng ngh\u1ec7 th\u00f4ng tin v\u00e0 truy\u1ec1n th\u00f4ng trong h\u1ecdc v\u00e0 t\u1ef1 h\u1ecdc\"}, {\"code\": \"NLe\", \"name\": \"H\u1ee3p t\u00e1c trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\"}], \"indicator_catalog\": [{\"code\": \"NLa.1\", \"competency\": \"NLa\", \"text\": \"Nh\u1eadn di\u1ec7n, ph\u00e2n bi\u1ec7t c\u1ea5u t\u1ea1o, ch\u1ee9c n\u0103ng c\u1ee7a thi\u1ebft b\u1ecb s\u1ed1, ph\u1ea7n m\u1ec1m h\u1ec7 th\u1ed1ng v\u00e0 ph\u1ea7n m\u1ec1m \u1ee9ng d\u1ee5ng.\"}, {\"code\": \"NLa.2\", \"competency\": \"NLa\", \"text\": \"Th\u1ef1c hi\u1ec7n thao t\u00e1c qu\u1ea3n l\u00ed d\u1eef li\u1ec7u, t\u1ec7p, th\u01b0 m\u1ee5c v\u00e0 khai th\u00e1c t\u00e0i nguy\u00ean m\u1ea1ng m\u00e1y t\u00ednh an to\u00e0n.\"}, {\"code\": \"NLa.3\", \"competency\": \"NLa\", \"text\": \"Thi\u1ebft l\u1eadp, v\u1eadn h\u00e0nh c\u01a1 b\u1ea3n c\u00e1c thi\u1ebft b\u1ecb ngo\u1ea1i vi, k\u1ebft n\u1ed1i m\u1ea1ng ho\u1eb7c h\u1ec7 c\u01a1 s\u1edf d\u1eef li\u1ec7u \u0111\u00fang quy tr\u00ecnh.\"}, {\"code\": \"NLa.4\", \"competency\": \"NLa\", \"text\": \"Ph\u00e2n t\u00edch th\u00f4ng s\u1ed1 k\u0129 thu\u1eadt ph\u1ea7n c\u1ee9ng, m\u1ea1ng ho\u1eb7c c\u1ea5u tr\u00fac d\u1eef li\u1ec7u \u0111\u1ec3 l\u1ef1a ch\u1ecdn ph\u01b0\u01a1ng \u00e1n ph\u00f9 h\u1ee3p.\"}, {\"code\": \"NLb.1\", \"competency\": \"NLb\", \"text\": \"Nh\u1eadn bi\u1ebft c\u00e1c quy \u0111\u1ecbnh ph\u00e1p lu\u1eadt, b\u1ea3n quy\u1ec1n s\u1ed1, quy t\u1eafc an to\u00e0n v\u00e0 v\u0103n ho\u00e1 giao ti\u1ebfp tr\u00ean m\u1ea1ng.\"}, {\"code\": \"NLb.2\", \"competency\": \"NLb\", \"text\": \"Gi\u1ea3i th\u00edch nguy c\u01a1 m\u1ea5t an to\u00e0n th\u00f4ng tin, vi ph\u1ea1m b\u1ea3n quy\u1ec1n v\u00e0 bi\u1ec7n ph\u00e1p ph\u00f2ng tr\u00e1nh.\"}, {\"code\": \"NLc.1\", \"competency\": \"NLc\", \"text\": \"M\u00f4 t\u1ea3 \u00fd t\u01b0\u1edfng thu\u1eadt to\u00e1n, ph\u00e2n t\u00edch b\u00e0i to\u00e1n v\u00e0 bi\u1ec3u di\u1ec5n c\u1ea5u tr\u00fac d\u1eef li\u1ec7u ph\u00f9 h\u1ee3p.\"}, {\"code\": \"NLc.2\", \"competency\": \"NLc\", \"text\": \"Theo d\u00f5i v\u1ebft thu\u1eadt to\u00e1n, ki\u1ec3m th\u1eed, ph\u00e1t hi\u1ec7n l\u1ed7i v\u00e0 gi\u1ea3i th\u00edch k\u1ebft qu\u1ea3 th\u1ef1c thi ch\u01b0\u01a1ng tr\u00ecnh/truy v\u1ea5n.\"}, {\"code\": \"NLc.3\", \"competency\": \"NLc\", \"text\": \"Thi\u1ebft k\u1ebf thu\u1eadt to\u00e1n, vi\u1ebft ch\u01b0\u01a1ng tr\u00ecnh, t\u1ea1o s\u1ea3n ph\u1ea9m s\u1ed1 ho\u1eb7c thi\u1ebft k\u1ebf CSDL gi\u1ea3i quy\u1ebft v\u1ea5n \u0111\u1ec1 c\u1ee5 th\u1ec3.\"}, {\"code\": \"NLc.4\", \"competency\": \"NLc\", \"text\": \"\u0110\u00e1nh gi\u00e1 \u0111\u1ed9 ph\u1ee9c t\u1ea1p, t\u1ed1i \u01b0u thu\u1eadt to\u00e1n ho\u1eb7c c\u1ea3i ti\u1ebfn gi\u1ea3i ph\u00e1p tin h\u1ecdc cho b\u00e0i to\u00e1n th\u1ef1c ti\u1ec5n.\"}, {\"code\": \"NLd.1\", \"competency\": \"NLd\", \"text\": \"Khai th\u00e1c h\u1ecdc li\u1ec7u s\u1ed1, ph\u1ea7n m\u1ec1m m\u00f4 ph\u1ecfng, c\u00f4ng c\u1ee5 t\u00ecm ki\u1ebfm \u0111\u1ec3 t\u00ecm hi\u1ec3u tri th\u1ee9c m\u00f4n h\u1ecdc.\"}, {\"code\": \"NLd.2\", \"competency\": \"NLd\", \"text\": \"\u0110\u00e1nh gi\u00e1 \u0111\u1ed9 tin c\u1eady c\u1ee7a ngu\u1ed3n th\u00f4ng tin/c\u00f4ng c\u1ee5 AI v\u00e0 t\u1ef1 h\u1ecdc, m\u1edf r\u1ed9ng ki\u1ebfn th\u1ee9c b\u1eb1ng CNTT.\"}, {\"code\": \"NLe.1\", \"competency\": \"NLe\", \"text\": \"S\u1eed d\u1ee5ng c\u00f4ng c\u1ee5 tr\u1ef1c tuy\u1ebfn \u0111\u1ec3 trao \u0111\u1ed5i, chia s\u1ebb th\u00f4ng tin v\u00e0 ph\u1ea3n h\u1ed3i v\u0103n minh.\"}, {\"code\": \"NLe.2\", \"competency\": \"NLe\", \"text\": \"T\u1ed5 ch\u1ee9c c\u1ed9ng t\u00e1c, ph\u00e2n c\u00f4ng v\u00e0 \u0111\u1ed3ng t\u1ea1o l\u1eadp s\u1ea3n ph\u1ea9m s\u1ed1 qua n\u1ec1n t\u1ea3ng l\u00e0m vi\u1ec7c nh\u00f3m.\"}], \"catalog_revision\": 1}, \"11\": {\"profile\": \"THPT\", \"grade\": 11, \"exam_type\": \"GK1\", \"duration\": 45, \"school_year\": \"2026-2027\", \"title\": \"Ma tr\u1eadn & \u0111\u1eb7c t\u1ea3 Ki\u1ec3m tra Gi\u1eefa HK1 \u00b7 M\u00f4n Tin h\u1ecdc Kh\u1ed1i 11\", \"owner_name\": \"T\u1ed5 Tin h\u1ecdc \u00c1 Ch\u00e2u\", \"campus\": \"Cao Th\u1eafng\", \"total_points\": 10, \"lessons\": [{\"lesson_code\": \"B1\", \"title\": \"H\u1ec7 \u0111i\u1ec1u h\u00e0nh\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 x\u00e3 h\u1ed9i tri th\u1ee9c\"}, {\"lesson_code\": \"B2\", \"title\": \"Th\u1ef1c h\u00e0nh s\u1eed d\u1ee5ng h\u1ec7 \u0111i\u1ec1u h\u00e0nh\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 x\u00e3 h\u1ed9i tri th\u1ee9c\"}, {\"lesson_code\": \"B3\", \"title\": \"Ph\u1ea7n m\u1ec1m ngu\u1ed3n m\u1edf v\u00e0 ph\u1ea7n m\u1ec1m ch\u1ea1y tr\u00ean Internet\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 x\u00e3 h\u1ed9i tri th\u1ee9c\"}, {\"lesson_code\": \"B4\", \"title\": \"B\u00ean trong m\u00e1y t\u00ednh\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 x\u00e3 h\u1ed9i tri th\u1ee9c\"}, {\"lesson_code\": \"B5\", \"title\": \"K\u1ebft n\u1ed1i m\u00e1y t\u00ednh v\u1edbi c\u00e1c thi\u1ebft b\u1ecb s\u1ed1\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 x\u00e3 h\u1ed9i tri th\u1ee9c\"}, {\"lesson_code\": \"B6\", \"title\": \"L\u01b0u tr\u1eef v\u00e0 chia s\u1ebb t\u1ec7p tin tr\u00ean Internet\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2. T\u1ed5 ch\u1ee9c l\u01b0u tr\u1eef, t\u00ecm ki\u1ebfm v\u00e0 trao \u0111\u1ed5i th\u00f4ng tin\"}, {\"lesson_code\": \"B7\", \"title\": \"Th\u1ef1c h\u00e0nh t\u00ecm ki\u1ebfm th\u00f4ng tin tr\u00ean Internet\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2. T\u1ed5 ch\u1ee9c l\u01b0u tr\u1eef, t\u00ecm ki\u1ebfm v\u00e0 trao \u0111\u1ed5i th\u00f4ng tin\"}, {\"lesson_code\": \"B8\", \"title\": \"Th\u1ef1c h\u00e0nh n\u00e2ng cao s\u1eed d\u1ee5ng th\u01b0 \u0111i\u1ec7n t\u1eed v\u00e0 m\u1ea1ng x\u00e3 h\u1ed9i\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2. T\u1ed5 ch\u1ee9c l\u01b0u tr\u1eef, t\u00ecm ki\u1ebfm v\u00e0 trao \u0111\u1ed5i th\u00f4ng tin\"}], \"requirements\": [{\"id\": \"R1\", \"lesson_code\": \"B1\", \"level\": \"Bi\u1ebft\", \"text\": \"Tr\u00ecnh b\u00e0y \u0111\u01b0\u1ee3c s\u01a1 l\u01b0\u1ee3c l\u1ecbch s\u1eed ph\u00e1t tri\u1ec3n c\u1ee7a c\u00e1c h\u1ec7 \u0111i\u1ec1u h\u00e0nh th\u00f4ng d\u1ee5ng cho m\u00e1y t\u00ednh c\u00e1 nh\u00e2n (PC).\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R2\", \"lesson_code\": \"B1\", \"level\": \"Hi\u1ec3u\", \"text\": \"Ch\u1ec9 ra \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 \u0111\u1eb7c \u0111i\u1ec3m c\u1ee7a h\u1ec7 \u0111i\u1ec1u h\u00e0nh cho thi\u1ebft b\u1ecb di \u0111\u1ed9ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R3\", \"lesson_code\": \"B1\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Tr\u00ecnh b\u00e0y \u0111\u01b0\u1ee3c m\u1ed9t c\u00e1ch kh\u00e1i qu\u00e1t m\u1ed1i quan h\u1ec7 gi\u1eefa ph\u1ea7n c\u1ee9ng, h\u1ec7 \u0111i\u1ec1u h\u00e0nh v\u00e0 ph\u1ea7n m\u1ec1m \u1ee9ng d\u1ee5ng c\u0169ng nh\u01b0 vai tr\u00f2 c\u1ee7a m\u1ed7i th\u00e0nh ph\u1ea7n trong ho\u1ea1t \u0111\u1ed9ng chung c\u1ee7a c\u1ea3 h\u1ec7 th\u1ed1ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R4\", \"lesson_code\": \"B2\", \"level\": \"Bi\u1ebft\", \"text\": \"S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 ch\u1ee9c n\u0103ng c\u01a1 b\u1ea3n c\u1ee7a h\u1ec7 \u0111i\u1ec1u h\u00e0nh cho m\u00e1y t\u00ednh c\u00e1 nh\u00e2n.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R5\", \"lesson_code\": \"B2\", \"level\": \"Hi\u1ec3u\", \"text\": \"S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c m\u1ed9t v\u00e0i ti\u1ec7n \u00edch c\u1ee7a h\u1ec7 \u0111i\u1ec1u h\u00e0nh n\u00e2ng cao hi\u1ec7u qu\u1ea3 c\u1ee7a m\u00e1y t\u00ednh c\u00e1 nh\u00e2n.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R6\", \"lesson_code\": \"B2\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c m\u1ed9t v\u00e0i ti\u1ec7n \u00edch c\u01a1 b\u1ea3n c\u1ee7a h\u1ec7 \u0111i\u1ec1u h\u00e0nh tr\u00ean thi\u1ebft b\u1ecb di \u0111\u1ed9ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R7\", \"lesson_code\": \"B3\", \"level\": \"Bi\u1ebft\", \"text\": \"Tr\u00ecnh b\u00e0y \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 kh\u00e1i ni\u1ec7m v\u00e0 so s\u00e1nh ph\u1ea7n m\u1ec1m ngu\u1ed3n m\u1edf v\u1edbi ph\u1ea7n m\u1ec1m th\u01b0\u01a1ng m\u1ea1i; n\u00eau \u0111\u01b0\u1ee3c vai tr\u00f2 c\u1ee7a ph\u1ea7n m\u1ec1m ngu\u1ed3n m\u1edf v\u00e0 ph\u1ea7n m\u1ec1m th\u01b0\u01a1ng m\u1ea1i \u0111\u1ed1i v\u1edbi s\u1ef1 ph\u00e1t tri\u1ec3n c\u1ee7a c\u00f4ng ngh\u1ec7 th\u00f4ng tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R8\", \"lesson_code\": \"B3\", \"level\": \"Hi\u1ec3u\", \"text\": \"L\u00e0m quen v\u1edbi ph\u1ea7n m\u1ec1m ch\u1ea1y tr\u00ean Internet.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R9\", \"lesson_code\": \"B3\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"L\u00e0m quen v\u1edbi ph\u1ea7n m\u1ec1m ch\u1ea1y tr\u00ean Internet.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R10\", \"lesson_code\": \"B4\", \"level\": \"Bi\u1ebft\", \"text\": \"Nh\u1eadn di\u1ec7n \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 thi\u1ebft b\u1ecb b\u00ean trong m\u00e1y t\u00ednh v\u1edbi ch\u1ee9c n\u0103ng v\u00e0 c\u00e1c th\u00f4ng s\u1ed1 \u0111o hi\u1ec7u n\u0103ng c\u1ee7a ch\u00fang.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R11\", \"lesson_code\": \"B4\", \"level\": \"Hi\u1ec3u\", \"text\": \"Nh\u1eadn bi\u1ebft \u0111\u01b0\u1ee3c s\u01a1 \u0111\u1ed3 c\u1ee7a c\u00e1c m\u1ea1ch logic AND, OR, NOT v\u00e0 gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c vai tr\u00f2 c\u1ee7a c\u00e1c m\u1ea1ch logic \u0111\u00f3 trong th\u1ef1c hi\u1ec7n c\u00e1c t\u00ednh to\u00e1n nh\u1ecb ph\u00e2n.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R12\", \"lesson_code\": \"B4\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Nh\u1eadn bi\u1ebft \u0111\u01b0\u1ee3c s\u01a1 \u0111\u1ed3 c\u1ee7a c\u00e1c m\u1ea1ch logic AND, OR, NOT v\u00e0 gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c vai tr\u00f2 c\u1ee7a c\u00e1c m\u1ea1ch logic \u0111\u00f3 trong th\u1ef1c hi\u1ec7n c\u00e1c t\u00ednh to\u00e1n nh\u1ecb ph\u00e2n.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R13\", \"lesson_code\": \"B5\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft m\u1ed9t s\u1ed1 th\u00f4ng s\u1ed1 c\u01a1 b\u1ea3n c\u1ee7a thi\u1ebft b\u1ecb v\u00e0o \u2013 ra th\u00f4ng d\u1ee5ng, c\u00e1ch k\u1ebft n\u1ed1i v\u1edbi m\u00e1y t\u00ednh v\u00e0 t\u00f9y ch\u1ec9nh ch\u1ee9c n\u0103ng \u0111\u1ec3 t\u1ed1i \u01b0u h\u00f3a hi\u1ec7u qu\u1ea3 s\u1eed d\u1ee5ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R14\", \"lesson_code\": \"B5\", \"level\": \"Hi\u1ec3u\", \"text\": \"\u0110\u1ecdc hi\u1ec3u v\u00e0 gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 th\u00f4ng s\u1ed1 c\u01a1 b\u1ea3n c\u1ee7a c\u00e1c thi\u1ebft b\u1ecb s\u1ed1 th\u00f4ng d\u1ee5ng trong c\u00e1c t\u00e0i li\u1ec7u \u0111\u1ec3 k\u1ebft n\u1ed1i ch\u00fang v\u1edbi m\u00e1y t\u00ednh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R15\", \"lesson_code\": \"B5\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"\u0110\u1ecdc hi\u1ec3u v\u00e0 gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 th\u00f4ng s\u1ed1 c\u01a1 b\u1ea3n c\u1ee7a c\u00e1c thi\u1ebft b\u1ecb s\u1ed1 th\u00f4ng d\u1ee5ng trong c\u00e1c t\u00e0i li\u1ec7u \u0111\u1ec3 k\u1ebft n\u1ed1i ch\u00fang v\u1edbi m\u00e1y t\u00ednh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R16\", \"lesson_code\": \"B6\", \"level\": \"Bi\u1ebft\", \"text\": \"S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 c\u00f4ng c\u1ee5 tr\u1ef1c tuy\u1ebfn nh\u01b0 Google Drive, Dropbox, \u2026 \u0111\u1ec3 l\u01b0u tr\u1eef v\u00e0 chia s\u1ebb t\u1ec7p tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R17\", \"lesson_code\": \"B6\", \"level\": \"Hi\u1ec3u\", \"text\": \"S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 c\u00f4ng c\u1ee5 tr\u1ef1c tuy\u1ebfn nh\u01b0 Google Drive, Dropbox, \u2026 \u0111\u1ec3 l\u01b0u tr\u1eef v\u00e0 chia s\u1ebb t\u1ec7p tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R18\", \"lesson_code\": \"B6\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 c\u00f4ng c\u1ee5 tr\u1ef1c tuy\u1ebfn nh\u01b0 Google Drive, Dropbox, \u2026 \u0111\u1ec3 l\u01b0u tr\u1eef v\u00e0 chia s\u1ebb t\u1ec7p tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R19\", \"lesson_code\": \"B7\", \"level\": \"Bi\u1ebft\", \"text\": \"S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c m\u00e1y t\u00ecm ki\u1ebfm tr\u00ean PC v\u00e0 thi\u1ebft b\u1ecb s\u1ed1 th\u00f4ng minh b\u1eb1ng c\u00e1ch g\u00f5 t\u1eeb kh\u00f3a ho\u1eb7c b\u1eb1ng ti\u1ebfng n\u00f3i.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R20\", \"lesson_code\": \"B7\", \"level\": \"Hi\u1ec3u\", \"text\": \"X\u00e1c l\u1eadp \u0111\u01b0\u1ee3c c\u00e1c l\u1ef1a ch\u1ecdn theo ti\u00eau ch\u00ed t\u00ecm ki\u1ebfm \u0111\u1ec3 n\u00e2ng cao hi\u1ec7u qu\u1ea3 t\u00ecm ki\u1ebfm th\u00f4ng tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R21\", \"lesson_code\": \"B7\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"X\u00e1c l\u1eadp \u0111\u01b0\u1ee3c c\u00e1c l\u1ef1a ch\u1ecdn theo ti\u00eau ch\u00ed t\u00ecm ki\u1ebfm \u0111\u1ec3 n\u00e2ng cao hi\u1ec7u qu\u1ea3 t\u00ecm ki\u1ebfm th\u00f4ng tin.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R22\", \"lesson_code\": \"B8\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft \u0111\u00e1nh d\u1ea5u v\u00e0 ph\u00e2n lo\u1ea1i th\u01b0 \u0111i\u1ec7n t\u1eed.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R23\", \"lesson_code\": \"B8\", \"level\": \"Hi\u1ec3u\", \"text\": \"Khai th\u00e1c \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 ch\u1ee9c n\u0103ng n\u00e2ng cao c\u1ee7a m\u1ea1ng x\u00e3 h\u1ed9i.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R24\", \"lesson_code\": \"B8\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Khai th\u00e1c \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 ch\u1ee9c n\u0103ng n\u00e2ng cao c\u1ee7a m\u1ea1ng x\u00e3 h\u1ed9i.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}], \"slots\": [{\"id\": \"S1\", \"kind\": \"MC\", \"number\": 1, \"parts\": [{\"id\": \"P1\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S2\", \"kind\": \"MC\", \"number\": 2, \"parts\": [{\"id\": \"P2\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S3\", \"kind\": \"MC\", \"number\": 3, \"parts\": [{\"id\": \"P3\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S4\", \"kind\": \"MC\", \"number\": 4, \"parts\": [{\"id\": \"P4\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S5\", \"kind\": \"MC\", \"number\": 5, \"parts\": [{\"id\": \"P5\", \"label\": \"\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S6\", \"kind\": \"MC\", \"number\": 6, \"parts\": [{\"id\": \"P6\", \"label\": \"\", \"requirement_id\": \"R16\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S7\", \"kind\": \"MC\", \"number\": 7, \"parts\": [{\"id\": \"P7\", \"label\": \"\", \"requirement_id\": \"R19\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S8\", \"kind\": \"MC\", \"number\": 8, \"parts\": [{\"id\": \"P8\", \"label\": \"\", \"requirement_id\": \"R22\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S9\", \"kind\": \"MC\", \"number\": 9, \"parts\": [{\"id\": \"P9\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S10\", \"kind\": \"MC\", \"number\": 10, \"parts\": [{\"id\": \"P10\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S11\", \"kind\": \"MC\", \"number\": 11, \"parts\": [{\"id\": \"P11\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S12\", \"kind\": \"MC\", \"number\": 12, \"parts\": [{\"id\": \"P12\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S13\", \"kind\": \"MC\", \"number\": 13, \"parts\": [{\"id\": \"P13\", \"label\": \"\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S14\", \"kind\": \"MC\", \"number\": 14, \"parts\": [{\"id\": \"P14\", \"label\": \"\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S15\", \"kind\": \"MC\", \"number\": 15, \"parts\": [{\"id\": \"P15\", \"label\": \"\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S16\", \"kind\": \"MC\", \"number\": 16, \"parts\": [{\"id\": \"P16\", \"label\": \"\", \"requirement_id\": \"R17\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S17\", \"kind\": \"MC\", \"number\": 17, \"parts\": [{\"id\": \"P17\", \"label\": \"\", \"requirement_id\": \"R20\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S18\", \"kind\": \"MC\", \"number\": 18, \"parts\": [{\"id\": \"P18\", \"label\": \"\", \"requirement_id\": \"R23\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S19\", \"kind\": \"MC\", \"number\": 19, \"parts\": [{\"id\": \"P19\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S20\", \"kind\": \"YN\", \"number\": 1, \"parts\": [{\"id\": \"P20a\", \"label\": \"a\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P20b\", \"label\": \"b\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P20c\", \"label\": \"c\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P20d\", \"label\": \"d\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S21\", \"kind\": \"YN\", \"number\": 2, \"parts\": [{\"id\": \"P21a\", \"label\": \"a\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P21b\", \"label\": \"b\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P21c\", \"label\": \"c\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P21d\", \"label\": \"d\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S22\", \"kind\": \"YN\", \"number\": 3, \"parts\": [{\"id\": \"P22a\", \"label\": \"a\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P22b\", \"label\": \"b\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P22c\", \"label\": \"c\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P22d\", \"label\": \"d\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S23\", \"kind\": \"ES\", \"number\": 1, \"parts\": [{\"id\": \"P23\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 0.75, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S24\", \"kind\": \"ES\", \"number\": 2, \"parts\": [{\"id\": \"P24\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 0.75, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S25\", \"kind\": \"ES\", \"number\": 3, \"parts\": [{\"id\": \"P25\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.75, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}], \"indicator_catalog\": [{\"code\": \"NLa.1\", \"competency\": \"NLa\", \"text\": \"Nh\u1eadn di\u1ec7n, ph\u00e2n bi\u1ec7t c\u1ea5u t\u1ea1o, ch\u1ee9c n\u0103ng c\u1ee7a thi\u1ebft b\u1ecb s\u1ed1, ph\u1ea7n m\u1ec1m h\u1ec7 th\u1ed1ng v\u00e0 ph\u1ea7n m\u1ec1m \u1ee9ng d\u1ee5ng.\"}, {\"code\": \"NLa.2\", \"competency\": \"NLa\", \"text\": \"Th\u1ef1c hi\u1ec7n thao t\u00e1c qu\u1ea3n l\u00ed d\u1eef li\u1ec7u, t\u1ec7p, th\u01b0 m\u1ee5c v\u00e0 khai th\u00e1c t\u00e0i nguy\u00ean m\u1ea1ng m\u00e1y t\u00ednh an to\u00e0n.\"}, {\"code\": \"NLa.3\", \"competency\": \"NLa\", \"text\": \"Thi\u1ebft l\u1eadp, v\u1eadn h\u00e0nh c\u01a1 b\u1ea3n c\u00e1c thi\u1ebft b\u1ecb ngo\u1ea1i vi, k\u1ebft n\u1ed1i m\u1ea1ng ho\u1eb7c h\u1ec7 c\u01a1 s\u1edf d\u1eef li\u1ec7u \u0111\u00fang quy tr\u00ecnh.\"}, {\"code\": \"NLa.4\", \"competency\": \"NLa\", \"text\": \"Ph\u00e2n t\u00edch th\u00f4ng s\u1ed1 k\u0129 thu\u1eadt ph\u1ea7n c\u1ee9ng, m\u1ea1ng ho\u1eb7c c\u1ea5u tr\u00fac d\u1eef li\u1ec7u \u0111\u1ec3 l\u1ef1a ch\u1ecdn ph\u01b0\u01a1ng \u00e1n ph\u00f9 h\u1ee3p.\"}, {\"code\": \"NLb.1\", \"competency\": \"NLb\", \"text\": \"Nh\u1eadn bi\u1ebft c\u00e1c quy \u0111\u1ecbnh ph\u00e1p lu\u1eadt, b\u1ea3n quy\u1ec1n s\u1ed1, quy t\u1eafc an to\u00e0n v\u00e0 v\u0103n ho\u00e1 giao ti\u1ebfp tr\u00ean m\u1ea1ng.\"}, {\"code\": \"NLb.2\", \"competency\": \"NLb\", \"text\": \"Gi\u1ea3i th\u00edch nguy c\u01a1 m\u1ea5t an to\u00e0n th\u00f4ng tin, vi ph\u1ea1m b\u1ea3n quy\u1ec1n v\u00e0 bi\u1ec7n ph\u00e1p ph\u00f2ng tr\u00e1nh.\"}, {\"code\": \"NLc.1\", \"competency\": \"NLc\", \"text\": \"M\u00f4 t\u1ea3 \u00fd t\u01b0\u1edfng thu\u1eadt to\u00e1n, ph\u00e2n t\u00edch b\u00e0i to\u00e1n v\u00e0 bi\u1ec3u di\u1ec5n c\u1ea5u tr\u00fac d\u1eef li\u1ec7u ph\u00f9 h\u1ee3p.\"}, {\"code\": \"NLc.2\", \"competency\": \"NLc\", \"text\": \"Theo d\u00f5i v\u1ebft thu\u1eadt to\u00e1n, ki\u1ec3m th\u1eed, ph\u00e1t hi\u1ec7n l\u1ed7i v\u00e0 gi\u1ea3i th\u00edch k\u1ebft qu\u1ea3 th\u1ef1c thi ch\u01b0\u01a1ng tr\u00ecnh/truy v\u1ea5n.\"}, {\"code\": \"NLc.3\", \"competency\": \"NLc\", \"text\": \"Thi\u1ebft k\u1ebf thu\u1eadt to\u00e1n, vi\u1ebft ch\u01b0\u01a1ng tr\u00ecnh, t\u1ea1o s\u1ea3n ph\u1ea9m s\u1ed1 ho\u1eb7c thi\u1ebft k\u1ebf CSDL gi\u1ea3i quy\u1ebft v\u1ea5n \u0111\u1ec1 c\u1ee5 th\u1ec3.\"}, {\"code\": \"NLc.4\", \"competency\": \"NLc\", \"text\": \"\u0110\u00e1nh gi\u00e1 \u0111\u1ed9 ph\u1ee9c t\u1ea1p, t\u1ed1i \u01b0u thu\u1eadt to\u00e1n ho\u1eb7c c\u1ea3i ti\u1ebfn gi\u1ea3i ph\u00e1p tin h\u1ecdc cho b\u00e0i to\u00e1n th\u1ef1c ti\u1ec5n.\"}, {\"code\": \"NLd.1\", \"competency\": \"NLd\", \"text\": \"Khai th\u00e1c h\u1ecdc li\u1ec7u s\u1ed1, ph\u1ea7n m\u1ec1m m\u00f4 ph\u1ecfng, c\u00f4ng c\u1ee5 t\u00ecm ki\u1ebfm \u0111\u1ec3 t\u00ecm hi\u1ec3u tri th\u1ee9c m\u00f4n h\u1ecdc.\"}, {\"code\": \"NLd.2\", \"competency\": \"NLd\", \"text\": \"\u0110\u00e1nh gi\u00e1 \u0111\u1ed9 tin c\u1eady c\u1ee7a ngu\u1ed3n th\u00f4ng tin/c\u00f4ng c\u1ee5 AI v\u00e0 t\u1ef1 h\u1ecdc, m\u1edf r\u1ed9ng ki\u1ebfn th\u1ee9c b\u1eb1ng CNTT.\"}, {\"code\": \"NLe.1\", \"competency\": \"NLe\", \"text\": \"S\u1eed d\u1ee5ng c\u00f4ng c\u1ee5 tr\u1ef1c tuy\u1ebfn \u0111\u1ec3 trao \u0111\u1ed5i, chia s\u1ebb th\u00f4ng tin v\u00e0 ph\u1ea3n h\u1ed3i v\u0103n minh.\"}, {\"code\": \"NLe.2\", \"competency\": \"NLe\", \"text\": \"T\u1ed5 ch\u1ee9c c\u1ed9ng t\u00e1c, ph\u00e2n c\u00f4ng v\u00e0 \u0111\u1ed3ng t\u1ea1o l\u1eadp s\u1ea3n ph\u1ea9m s\u1ed1 qua n\u1ec1n t\u1ea3ng l\u00e0m vi\u1ec7c nh\u00f3m.\"}], \"competency_catalog\": [{\"code\": \"NLa\", \"name\": \"S\u1eed d\u1ee5ng v\u00e0 qu\u1ea3n l\u00ed c\u00e1c ph\u01b0\u01a1ng ti\u1ec7n c\u00f4ng ngh\u1ec7 th\u00f4ng tin v\u00e0 truy\u1ec1n th\u00f4ng\"}, {\"code\": \"NLb\", \"name\": \"\u1ee8ng x\u1eed ph\u00f9 h\u1ee3p trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\"}, {\"code\": \"NLc\", \"name\": \"Gi\u1ea3i quy\u1ebft v\u1ea5n \u0111\u1ec1 v\u1edbi s\u1ef1 h\u1ed7 tr\u1ee3 c\u1ee7a c\u00f4ng ngh\u1ec7 th\u00f4ng tin v\u00e0 truy\u1ec1n th\u00f4ng\"}, {\"code\": \"NLd\", \"name\": \"\u1ee8ng d\u1ee5ng c\u00f4ng ngh\u1ec7 th\u00f4ng tin v\u00e0 truy\u1ec1n th\u00f4ng trong h\u1ecdc v\u00e0 t\u1ef1 h\u1ecdc\"}, {\"code\": \"NLe\", \"name\": \"H\u1ee3p t\u00e1c trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\"}], \"catalog_revision\": 1}, \"12\": {\"profile\": \"THPT\", \"grade\": 12, \"exam_type\": \"GK1\", \"duration\": 45, \"school_year\": \"2026-2027\", \"title\": \"Ma tr\u1eadn & \u0111\u1eb7c t\u1ea3 Ki\u1ec3m tra Gi\u1eefa HK1 \u00b7 M\u00f4n Tin h\u1ecdc Kh\u1ed1i 12\", \"owner_name\": \"T\u1ed5 Tin h\u1ecdc \u00c1 Ch\u00e2u\", \"campus\": \"Cao Th\u1eafng\", \"total_points\": 10, \"lessons\": [{\"lesson_code\": \"B1\", \"title\": \"L\u00e0m quen v\u1edbi Tr\u00ed tu\u1ec7 nh\u00e2n t\u1ea1o\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 x\u00e3 h\u1ed9i tri th\u1ee9c\"}, {\"lesson_code\": \"B2\", \"title\": \"Tr\u00ed tu\u1ec7 nh\u00e2n t\u1ea1o trong khoa h\u1ecdc v\u00e0 \u0111\u1eddi s\u1ed1ng\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 1. M\u00e1y t\u00ednh v\u00e0 x\u00e3 h\u1ed9i tri th\u1ee9c\"}, {\"lesson_code\": \"B3\", \"title\": \"M\u1ed9t s\u1ed1 thi\u1ebft b\u1ecb m\u1ea1ng th\u00f4ng d\u1ee5ng\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2. M\u1ea1ng m\u00e1y t\u00ednh v\u00e0 Internet\"}, {\"lesson_code\": \"B4\", \"title\": \"Giao th\u1ee9c m\u1ea1ng\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2. M\u1ea1ng m\u00e1y t\u00ednh v\u00e0 Internet\"}, {\"lesson_code\": \"B5\", \"title\": \"Th\u1ef1c h\u00e0nh chia s\u1ebb t\u00e0i nguy\u00ean tr\u00ean m\u1ea1ng\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 2. M\u1ea1ng m\u00e1y t\u00ednh v\u00e0 Internet\"}, {\"lesson_code\": \"B6\", \"title\": \"Giao ti\u1ebfp v\u00e0 \u1ee9ng x\u1eed trong kh\u00f4ng gian m\u1ea1ng\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 3. \u0110\u1ea1o \u0111\u1ee9c, ph\u00e1p lu\u1eadt v\u00e0 v\u0103n h\u00f3a trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\"}, {\"lesson_code\": \"B23\", \"title\": \"Chu\u1ea9n b\u1ecb x\u00e2y d\u1ef1ng trang web\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 7. \u1ee8ng d\u1ee5ng tin h\u1ecdc\"}, {\"lesson_code\": \"B24\", \"title\": \"X\u00e2y d\u1ef1ng ph\u1ea7n \u0111\u1ea7u trang web\", \"topic\": \"Ch\u1ee7 \u0111\u1ec1 7. \u1ee8ng d\u1ee5ng tin h\u1ecdc\"}], \"requirements\": [{\"id\": \"R1\", \"lesson_code\": \"B1\", \"level\": \"Bi\u1ebft\", \"text\": \"\u2013 Gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c s\u01a1 l\u01b0\u1ee3c v\u1ec1 kh\u00e1i ni\u1ec7m Tr\u00ed tu\u1ec7 nh\u00e2n t\u1ea1o.\u2013 N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 minh ho\u1ea1 cho m\u1ed9t s\u1ed1 \u1ee9ng d\u1ee5ng \u0111i\u1ec3n h\u00ecnh c\u1ee7a AI nh\u01b0 \u0111i\u1ec1u khi\u1ec3n t\u1ef1 \u0111\u1ed9ng, ch\u1ea9n \u0111o\u00e1n b\u1ec7nh, nh\u1eadn d\u1ea1ng ch\u1eef vi\u1ebft tay, nh\u1eadn d\u1ea1ng ti\u1ebfng n\u00f3i v\u00e0 khu\u00f4n m\u1eb7t, tr\u1ee3 l\u00ed \u1ea3o\u2026\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R2\", \"lesson_code\": \"B1\", \"level\": \"Hi\u1ec3u\", \"text\": \"\u2013 Gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c s\u01a1 l\u01b0\u1ee3c v\u1ec1 kh\u00e1i ni\u1ec7m Tr\u00ed tu\u1ec7 nh\u00e2n t\u1ea1o.\u2013 N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 minh ho\u1ea1 cho m\u1ed9t s\u1ed1 \u1ee9ng d\u1ee5ng \u0111i\u1ec3n h\u00ecnh c\u1ee7a AI nh\u01b0 \u0111i\u1ec1u khi\u1ec3n t\u1ef1 \u0111\u1ed9ng, ch\u1ea9n \u0111o\u00e1n b\u1ec7nh, nh\u1eadn d\u1ea1ng ch\u1eef vi\u1ebft tay, nh\u1eadn d\u1ea1ng ti\u1ebfng n\u00f3i v\u00e0 khu\u00f4n m\u1eb7t, tr\u1ee3 l\u00ed \u1ea3o\u2026\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R3\", \"lesson_code\": \"B1\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"\u2013 Gi\u1ea3i th\u00edch \u0111\u01b0\u1ee3c s\u01a1 l\u01b0\u1ee3c v\u1ec1 kh\u00e1i ni\u1ec7m Tr\u00ed tu\u1ec7 nh\u00e2n t\u1ea1o.\u2013 N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 minh ho\u1ea1 cho m\u1ed9t s\u1ed1 \u1ee9ng d\u1ee5ng \u0111i\u1ec3n h\u00ecnh c\u1ee7a AI nh\u01b0 \u0111i\u1ec1u khi\u1ec3n t\u1ef1 \u0111\u1ed9ng, ch\u1ea9n \u0111o\u00e1n b\u1ec7nh, nh\u1eadn d\u1ea1ng ch\u1eef vi\u1ebft tay, nh\u1eadn d\u1ea1ng ti\u1ebfng n\u00f3i v\u00e0 khu\u00f4n m\u1eb7t, tr\u1ee3 l\u00ed \u1ea3o\u2026\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R4\", \"lesson_code\": \"B2\", \"level\": \"Bi\u1ebft\", \"text\": \"\u2013 Ch\u1ec9 ra \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 l\u0129nh v\u1ef1c c\u1ee7a khoa h\u1ecdc c\u00f4ng ngh\u1ec7 v\u00e0 \u0111\u1eddi s\u1ed1ng \u0111\u00e3 v\u00e0 \u0111ang ph\u00e1t tri\u1ec3n m\u1ea1nh m\u1ebd d\u1ef1a tr\u00ean nh\u1eefng th\u00e0nh t\u1ef1u to l\u1edbn c\u1ee7a AI.\u2013 N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 \u0111\u1ec3 th\u1ea5y m\u1ed9t h\u1ec7 th\u1ed1ng AI c\u00f3 tri th\u1ee9c, c\u00f3 kh\u1ea3 n\u0103ng suy lu\u1eadn v\u00e0 kh\u1ea3 n\u0103ng h\u1ecdc, \u2026\u2013 N\u00eau \u0111\u01b0\u1ee3c c\u1ea3nh b\u00e1o v\u1ec1 s\u1ef1 ph\u00e1t tri\u1ec3n c\u1ee7a AI trong t\u01b0\u01a1ng lai.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R5\", \"lesson_code\": \"B2\", \"level\": \"Hi\u1ec3u\", \"text\": \"\u2013 Ch\u1ec9 ra \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 l\u0129nh v\u1ef1c c\u1ee7a khoa h\u1ecdc c\u00f4ng ngh\u1ec7 v\u00e0 \u0111\u1eddi s\u1ed1ng \u0111\u00e3 v\u00e0 \u0111ang ph\u00e1t tri\u1ec3n m\u1ea1nh m\u1ebd d\u1ef1a tr\u00ean nh\u1eefng th\u00e0nh t\u1ef1u to l\u1edbn c\u1ee7a AI.\u2013 N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 \u0111\u1ec3 th\u1ea5y m\u1ed9t h\u1ec7 th\u1ed1ng AI c\u00f3 tri th\u1ee9c, c\u00f3 kh\u1ea3 n\u0103ng suy lu\u1eadn v\u00e0 kh\u1ea3 n\u0103ng h\u1ecdc, \u2026\u2013 N\u00eau \u0111\u01b0\u1ee3c c\u1ea3nh b\u00e1o v\u1ec1 s\u1ef1 ph\u00e1t tri\u1ec3n c\u1ee7a AI trong t\u01b0\u01a1ng lai.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R6\", \"lesson_code\": \"B2\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"\u2013 Ch\u1ec9 ra \u0111\u01b0\u1ee3c m\u1ed9t s\u1ed1 l\u0129nh v\u1ef1c c\u1ee7a khoa h\u1ecdc c\u00f4ng ngh\u1ec7 v\u00e0 \u0111\u1eddi s\u1ed1ng \u0111\u00e3 v\u00e0 \u0111ang ph\u00e1t tri\u1ec3n m\u1ea1nh m\u1ebd d\u1ef1a tr\u00ean nh\u1eefng th\u00e0nh t\u1ef1u to l\u1edbn c\u1ee7a AI.\u2013 N\u00eau \u0111\u01b0\u1ee3c v\u00ed d\u1ee5 \u0111\u1ec3 th\u1ea5y m\u1ed9t h\u1ec7 th\u1ed1ng AI c\u00f3 tri th\u1ee9c, c\u00f3 kh\u1ea3 n\u0103ng suy lu\u1eadn v\u00e0 kh\u1ea3 n\u0103ng h\u1ecdc, \u2026\u2013 N\u00eau \u0111\u01b0\u1ee3c c\u1ea3nh b\u00e1o v\u1ec1 s\u1ef1 ph\u00e1t tri\u1ec3n c\u1ee7a AI trong t\u01b0\u01a1ng lai.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R7\", \"lesson_code\": \"B3\", \"level\": \"Bi\u1ebft\", \"text\": \"N\u00eau \u0111\u01b0\u1ee3c ch\u1ee9c n\u0103ng ch\u00ednh c\u1ee7a m\u1ed9t s\u1ed1 thi\u1ebft b\u1ecb m\u1ea1ng th\u00f4ng d\u1ee5ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R8\", \"lesson_code\": \"B3\", \"level\": \"Hi\u1ec3u\", \"text\": \"Bi\u1ebft c\u00e1ch k\u1ebft n\u1ed1i m\u00e1y t\u00ednh, thi\u1ebft b\u1ecb di \u0111\u1ed9ng v\u00e0o m\u1ea1ng m\u00e1y t\u00ednh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R9\", \"lesson_code\": \"B3\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Bi\u1ebft c\u00e1ch k\u1ebft n\u1ed1i m\u00e1y t\u00ednh, thi\u1ebft b\u1ecb di \u0111\u1ed9ng v\u00e0o m\u1ea1ng m\u00e1y t\u00ednh.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R10\", \"lesson_code\": \"B4\", \"level\": \"Bi\u1ebft\", \"text\": \"\u2013 Hi\u1ec3u v\u00e0 m\u00f4 t\u1ea3 s\u01a1 l\u01b0\u1ee3c \u0111\u01b0\u1ee3c vai tr\u00f2 v\u00e0 ch\u1ee9c n\u0103ng c\u1ee7a giao th\u1ee9c m\u1ea1ng n\u00f3i chung v\u00e0 giao th\u1ee9c TCP/IP n\u00f3i ri\u00eang.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R11\", \"lesson_code\": \"B4\", \"level\": \"Hi\u1ec3u\", \"text\": \"\u2013 Hi\u1ec3u v\u00e0 m\u00f4 t\u1ea3 s\u01a1 l\u01b0\u1ee3c \u0111\u01b0\u1ee3c vai tr\u00f2 v\u00e0 ch\u1ee9c n\u0103ng c\u1ee7a giao th\u1ee9c m\u1ea1ng n\u00f3i chung v\u00e0 giao th\u1ee9c TCP/IP n\u00f3i ri\u00eang.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R12\", \"lesson_code\": \"B4\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"\u2013 Hi\u1ec3u v\u00e0 m\u00f4 t\u1ea3 s\u01a1 l\u01b0\u1ee3c \u0111\u01b0\u1ee3c vai tr\u00f2 v\u00e0 ch\u1ee9c n\u0103ng c\u1ee7a giao th\u1ee9c m\u1ea1ng n\u00f3i chung v\u00e0 giao th\u1ee9c TCP/IP n\u00f3i ri\u00eang.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R13\", \"lesson_code\": \"B5\", \"level\": \"Bi\u1ebft\", \"text\": \"\u2013 S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c c\u00e1c ch\u1ee9c n\u0103ng m\u1ea1ng c\u1ee7a h\u1ec7 \u0111i\u1ec1u h\u00e0nh \u0111\u1ec3 chia s\u1ebb t\u00e0i nguy\u00ean.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R14\", \"lesson_code\": \"B5\", \"level\": \"Hi\u1ec3u\", \"text\": \"\u2013 S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c c\u00e1c ch\u1ee9c n\u0103ng m\u1ea1ng c\u1ee7a h\u1ec7 \u0111i\u1ec1u h\u00e0nh \u0111\u1ec3 chia s\u1ebb t\u00e0i nguy\u00ean.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R15\", \"lesson_code\": \"B5\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"\u2013 S\u1eed d\u1ee5ng \u0111\u01b0\u1ee3c c\u00e1c ch\u1ee9c n\u0103ng m\u1ea1ng c\u1ee7a h\u1ec7 \u0111i\u1ec1u h\u00e0nh \u0111\u1ec3 chia s\u1ebb t\u00e0i nguy\u00ean.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R16\", \"lesson_code\": \"B6\", \"level\": \"Bi\u1ebft\", \"text\": \"Ph\u00e2n t\u00edch \u0111\u01b0\u1ee3c \u01b0u v\u00e0 nh\u01b0\u1ee3c \u0111i\u1ec3m v\u1ec1 giao ti\u1ebfp trong kh\u00f4ng gian m\u1ea1ng qua c\u00e1c v\u00ed d\u1ee5 c\u1ee5 th\u1ec3.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R17\", \"lesson_code\": \"B6\", \"level\": \"Hi\u1ec3u\", \"text\": \"Ph\u00e2n t\u00edch \u0111\u01b0\u1ee3c t\u00ednh nh\u00e2n v\u0103n trong \u1ee9ng x\u1eed \u1edf m\u1ed9t s\u1ed1 t\u00ecnh hu\u1ed1ng tham gia kh\u00f4ng gian m\u1ea1ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R18\", \"lesson_code\": \"B6\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Ph\u00e2n t\u00edch \u0111\u01b0\u1ee3c t\u00ednh nh\u00e2n v\u0103n trong \u1ee9ng x\u1eed \u1edf m\u1ed9t s\u1ed1 t\u00ecnh hu\u1ed1ng tham gia kh\u00f4ng gian m\u1ea1ng.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R19\", \"lesson_code\": \"B23\", \"level\": \"Bi\u1ebft\", \"text\": \"C\u00f3 nh\u1eadn th\u1ee9c ban \u0111\u1ea7u v\u1ec1 c\u00e1c th\u00e0nh ph\u1ea7n c\u1ee7a trang web v\u00e0 c\u00e1c b\u01b0\u1edbc thi\u1ebft k\u1ebf trang web.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R20\", \"lesson_code\": \"B23\", \"level\": \"Hi\u1ec3u\", \"text\": \"C\u00f3 nh\u1eadn th\u1ee9c ban \u0111\u1ea7u v\u1ec1 c\u00e1c th\u00e0nh ph\u1ea7n c\u1ee7a trang web v\u00e0 c\u00e1c b\u01b0\u1edbc thi\u1ebft k\u1ebf trang web.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R21\", \"lesson_code\": \"B23\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"C\u00f3 nh\u1eadn th\u1ee9c ban \u0111\u1ea7u v\u1ec1 c\u00e1c th\u00e0nh ph\u1ea7n c\u1ee7a trang web v\u00e0 c\u00e1c b\u01b0\u1edbc thi\u1ebft k\u1ebf trang web.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}, {\"id\": \"R22\", \"lesson_code\": \"B24\", \"level\": \"Bi\u1ebft\", \"text\": \"Bi\u1ebft c\u00e1c b\u01b0\u1edbc x\u00e2y d\u1ef1ng ph\u1ea7n \u0111\u1ea7u trang web v\u1edbi h\u1ed7 tr\u1ee3 c\u1ee7a Google sites.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R23\", \"lesson_code\": \"B24\", \"level\": \"Hi\u1ec3u\", \"text\": \"Bi\u1ebft c\u00e1c b\u01b0\u1edbc x\u00e2y d\u1ef1ng ph\u1ea7n \u0111\u1ea7u trang web v\u1edbi h\u1ed7 tr\u1ee3 c\u1ee7a Google sites.\", \"ppct_outcome_index\": 0, \"competency\": \"NLa\"}, {\"id\": \"R24\", \"lesson_code\": \"B24\", \"level\": \"V\u1eadn d\u1ee5ng\", \"text\": \"Bi\u1ebft c\u00e1c b\u01b0\u1edbc x\u00e2y d\u1ef1ng ph\u1ea7n \u0111\u1ea7u trang web v\u1edbi h\u1ed7 tr\u1ee3 c\u1ee7a Google sites.\", \"ppct_outcome_index\": 0, \"competency\": \"NLb\"}], \"slots\": [{\"id\": \"S1\", \"kind\": \"MC\", \"number\": 1, \"parts\": [{\"id\": \"P1\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S2\", \"kind\": \"MC\", \"number\": 2, \"parts\": [{\"id\": \"P2\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S3\", \"kind\": \"MC\", \"number\": 3, \"parts\": [{\"id\": \"P3\", \"label\": \"\", \"requirement_id\": \"R7\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S4\", \"kind\": \"MC\", \"number\": 4, \"parts\": [{\"id\": \"P4\", \"label\": \"\", \"requirement_id\": \"R10\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S5\", \"kind\": \"MC\", \"number\": 5, \"parts\": [{\"id\": \"P5\", \"label\": \"\", \"requirement_id\": \"R13\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S6\", \"kind\": \"MC\", \"number\": 6, \"parts\": [{\"id\": \"P6\", \"label\": \"\", \"requirement_id\": \"R16\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S7\", \"kind\": \"MC\", \"number\": 7, \"parts\": [{\"id\": \"P7\", \"label\": \"\", \"requirement_id\": \"R19\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S8\", \"kind\": \"MC\", \"number\": 8, \"parts\": [{\"id\": \"P8\", \"label\": \"\", \"requirement_id\": \"R22\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S9\", \"kind\": \"MC\", \"number\": 9, \"parts\": [{\"id\": \"P9\", \"label\": \"\", \"requirement_id\": \"R1\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S10\", \"kind\": \"MC\", \"number\": 10, \"parts\": [{\"id\": \"P10\", \"label\": \"\", \"requirement_id\": \"R4\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S11\", \"kind\": \"MC\", \"number\": 11, \"parts\": [{\"id\": \"P11\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S12\", \"kind\": \"MC\", \"number\": 12, \"parts\": [{\"id\": \"P12\", \"label\": \"\", \"requirement_id\": \"R5\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S13\", \"kind\": \"MC\", \"number\": 13, \"parts\": [{\"id\": \"P13\", \"label\": \"\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S14\", \"kind\": \"MC\", \"number\": 14, \"parts\": [{\"id\": \"P14\", \"label\": \"\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S15\", \"kind\": \"MC\", \"number\": 15, \"parts\": [{\"id\": \"P15\", \"label\": \"\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S16\", \"kind\": \"MC\", \"number\": 16, \"parts\": [{\"id\": \"P16\", \"label\": \"\", \"requirement_id\": \"R17\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S17\", \"kind\": \"MC\", \"number\": 17, \"parts\": [{\"id\": \"P17\", \"label\": \"\", \"requirement_id\": \"R20\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S18\", \"kind\": \"MC\", \"number\": 18, \"parts\": [{\"id\": \"P18\", \"label\": \"\", \"requirement_id\": \"R23\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S19\", \"kind\": \"MC\", \"number\": 19, \"parts\": [{\"id\": \"P19\", \"label\": \"\", \"requirement_id\": \"R2\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S20\", \"kind\": \"YN\", \"number\": 1, \"parts\": [{\"id\": \"P20a\", \"label\": \"a\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P20b\", \"label\": \"b\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P20c\", \"label\": \"c\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P20d\", \"label\": \"d\", \"requirement_id\": \"R8\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S21\", \"kind\": \"YN\", \"number\": 2, \"parts\": [{\"id\": \"P21a\", \"label\": \"a\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P21b\", \"label\": \"b\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P21c\", \"label\": \"c\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P21d\", \"label\": \"d\", \"requirement_id\": \"R11\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S22\", \"kind\": \"YN\", \"number\": 3, \"parts\": [{\"id\": \"P22a\", \"label\": \"a\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P22b\", \"label\": \"b\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P22c\", \"label\": \"c\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLa.1\"}, {\"id\": \"P22d\", \"label\": \"d\", \"requirement_id\": \"R14\", \"points\": 0.25, \"indicator\": \"NLa.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S23\", \"kind\": \"ES\", \"number\": 1, \"parts\": [{\"id\": \"P23\", \"label\": \"\", \"requirement_id\": \"R3\", \"points\": 0.75, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S24\", \"kind\": \"ES\", \"number\": 2, \"parts\": [{\"id\": \"P24\", \"label\": \"\", \"requirement_id\": \"R6\", \"points\": 0.75, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}, {\"id\": \"S25\", \"kind\": \"ES\", \"number\": 3, \"parts\": [{\"id\": \"P25\", \"label\": \"\", \"requirement_id\": \"R9\", \"points\": 0.75, \"indicator\": \"NLb.1\"}], \"scoring\": {\"mode\": \"sum_parts\"}}], \"indicator_catalog\": [{\"code\": \"NLa.1\", \"competency\": \"NLa\", \"text\": \"Nh\u1eadn di\u1ec7n, ph\u00e2n bi\u1ec7t c\u1ea5u t\u1ea1o, ch\u1ee9c n\u0103ng c\u1ee7a thi\u1ebft b\u1ecb s\u1ed1, ph\u1ea7n m\u1ec1m h\u1ec7 th\u1ed1ng v\u00e0 ph\u1ea7n m\u1ec1m \u1ee9ng d\u1ee5ng.\"}, {\"code\": \"NLa.2\", \"competency\": \"NLa\", \"text\": \"Th\u1ef1c hi\u1ec7n thao t\u00e1c qu\u1ea3n l\u00ed d\u1eef li\u1ec7u, t\u1ec7p, th\u01b0 m\u1ee5c v\u00e0 khai th\u00e1c t\u00e0i nguy\u00ean m\u1ea1ng m\u00e1y t\u00ednh an to\u00e0n.\"}, {\"code\": \"NLa.3\", \"competency\": \"NLa\", \"text\": \"Thi\u1ebft l\u1eadp, v\u1eadn h\u00e0nh c\u01a1 b\u1ea3n c\u00e1c thi\u1ebft b\u1ecb ngo\u1ea1i vi, k\u1ebft n\u1ed1i m\u1ea1ng ho\u1eb7c h\u1ec7 c\u01a1 s\u1edf d\u1eef li\u1ec7u \u0111\u00fang quy tr\u00ecnh.\"}, {\"code\": \"NLa.4\", \"competency\": \"NLa\", \"text\": \"Ph\u00e2n t\u00edch th\u00f4ng s\u1ed1 k\u0129 thu\u1eadt ph\u1ea7n c\u1ee9ng, m\u1ea1ng ho\u1eb7c c\u1ea5u tr\u00fac d\u1eef li\u1ec7u \u0111\u1ec3 l\u1ef1a ch\u1ecdn ph\u01b0\u01a1ng \u00e1n ph\u00f9 h\u1ee3p.\"}, {\"code\": \"NLb.1\", \"competency\": \"NLb\", \"text\": \"Nh\u1eadn bi\u1ebft c\u00e1c quy \u0111\u1ecbnh ph\u00e1p lu\u1eadt, b\u1ea3n quy\u1ec1n s\u1ed1, quy t\u1eafc an to\u00e0n v\u00e0 v\u0103n ho\u00e1 giao ti\u1ebfp tr\u00ean m\u1ea1ng.\"}, {\"code\": \"NLb.2\", \"competency\": \"NLb\", \"text\": \"Gi\u1ea3i th\u00edch nguy c\u01a1 m\u1ea5t an to\u00e0n th\u00f4ng tin, vi ph\u1ea1m b\u1ea3n quy\u1ec1n v\u00e0 bi\u1ec7n ph\u00e1p ph\u00f2ng tr\u00e1nh.\"}, {\"code\": \"NLc.1\", \"competency\": \"NLc\", \"text\": \"M\u00f4 t\u1ea3 \u00fd t\u01b0\u1edfng thu\u1eadt to\u00e1n, ph\u00e2n t\u00edch b\u00e0i to\u00e1n v\u00e0 bi\u1ec3u di\u1ec5n c\u1ea5u tr\u00fac d\u1eef li\u1ec7u ph\u00f9 h\u1ee3p.\"}, {\"code\": \"NLc.2\", \"competency\": \"NLc\", \"text\": \"Theo d\u00f5i v\u1ebft thu\u1eadt to\u00e1n, ki\u1ec3m th\u1eed, ph\u00e1t hi\u1ec7n l\u1ed7i v\u00e0 gi\u1ea3i th\u00edch k\u1ebft qu\u1ea3 th\u1ef1c thi ch\u01b0\u01a1ng tr\u00ecnh/truy v\u1ea5n.\"}, {\"code\": \"NLc.3\", \"competency\": \"NLc\", \"text\": \"Thi\u1ebft k\u1ebf thu\u1eadt to\u00e1n, vi\u1ebft ch\u01b0\u01a1ng tr\u00ecnh, t\u1ea1o s\u1ea3n ph\u1ea9m s\u1ed1 ho\u1eb7c thi\u1ebft k\u1ebf CSDL gi\u1ea3i quy\u1ebft v\u1ea5n \u0111\u1ec1 c\u1ee5 th\u1ec3.\"}, {\"code\": \"NLc.4\", \"competency\": \"NLc\", \"text\": \"\u0110\u00e1nh gi\u00e1 \u0111\u1ed9 ph\u1ee9c t\u1ea1p, t\u1ed1i \u01b0u thu\u1eadt to\u00e1n ho\u1eb7c c\u1ea3i ti\u1ebfn gi\u1ea3i ph\u00e1p tin h\u1ecdc cho b\u00e0i to\u00e1n th\u1ef1c ti\u1ec5n.\"}, {\"code\": \"NLd.1\", \"competency\": \"NLd\", \"text\": \"Khai th\u00e1c h\u1ecdc li\u1ec7u s\u1ed1, ph\u1ea7n m\u1ec1m m\u00f4 ph\u1ecfng, c\u00f4ng c\u1ee5 t\u00ecm ki\u1ebfm \u0111\u1ec3 t\u00ecm hi\u1ec3u tri th\u1ee9c m\u00f4n h\u1ecdc.\"}, {\"code\": \"NLd.2\", \"competency\": \"NLd\", \"text\": \"\u0110\u00e1nh gi\u00e1 \u0111\u1ed9 tin c\u1eady c\u1ee7a ngu\u1ed3n th\u00f4ng tin/c\u00f4ng c\u1ee5 AI v\u00e0 t\u1ef1 h\u1ecdc, m\u1edf r\u1ed9ng ki\u1ebfn th\u1ee9c b\u1eb1ng CNTT.\"}, {\"code\": \"NLe.1\", \"competency\": \"NLe\", \"text\": \"S\u1eed d\u1ee5ng c\u00f4ng c\u1ee5 tr\u1ef1c tuy\u1ebfn \u0111\u1ec3 trao \u0111\u1ed5i, chia s\u1ebb th\u00f4ng tin v\u00e0 ph\u1ea3n h\u1ed3i v\u0103n minh.\"}, {\"code\": \"NLe.2\", \"competency\": \"NLe\", \"text\": \"T\u1ed5 ch\u1ee9c c\u1ed9ng t\u00e1c, ph\u00e2n c\u00f4ng v\u00e0 \u0111\u1ed3ng t\u1ea1o l\u1eadp s\u1ea3n ph\u1ea9m s\u1ed1 qua n\u1ec1n t\u1ea3ng l\u00e0m vi\u1ec7c nh\u00f3m.\"}], \"competency_catalog\": [{\"code\": \"NLa\", \"name\": \"S\u1eed d\u1ee5ng v\u00e0 qu\u1ea3n l\u00ed c\u00e1c ph\u01b0\u01a1ng ti\u1ec7n c\u00f4ng ngh\u1ec7 th\u00f4ng tin v\u00e0 truy\u1ec1n th\u00f4ng\"}, {\"code\": \"NLb\", \"name\": \"\u1ee8ng x\u1eed ph\u00f9 h\u1ee3p trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\"}, {\"code\": \"NLc\", \"name\": \"Gi\u1ea3i quy\u1ebft v\u1ea5n \u0111\u1ec1 v\u1edbi s\u1ef1 h\u1ed7 tr\u1ee3 c\u1ee7a c\u00f4ng ngh\u1ec7 th\u00f4ng tin v\u00e0 truy\u1ec1n th\u00f4ng\"}, {\"code\": \"NLd\", \"name\": \"\u1ee8ng d\u1ee5ng c\u00f4ng ngh\u1ec7 th\u00f4ng tin v\u00e0 truy\u1ec1n th\u00f4ng trong h\u1ecdc v\u00e0 t\u1ef1 h\u1ecdc\"}, {\"code\": \"NLe\", \"name\": \"H\u1ee3p t\u00e1c trong m\u00f4i tr\u01b0\u1eddng s\u1ed1\"}], \"catalog_revision\": 1}}");
    Object.values(STANDARD_PRESETS).forEach(pr=>{const c={};(pr.slots||[]).forEach(s=>{c[s.kind]=(c[s.kind]||0)+1;s.number=c[s.kind];});});

  function renumberAllSlots(m) {
    if (!m || !m.slots) return;
    const kindOrder = { MC: 1, YN: 2, SHORT: 3, ES: 4 };
    const levelOrder = { 'Biết': 1, 'Hiểu': 2, 'Vận dụng thấp': 3, 'Vận dụng': 3, 'Vận dụng cao': 4 };
    const lessonOrder = new Map((m.lessons || []).map((l, idx) => [l.lesson_code, idx]));
    const reqMap = new Map((m.requirements || []).map(r => [r.id, r]));
    m.slots.sort((a, b) => {
      const kDiff = (kindOrder[a.kind] || 9) - (kindOrder[b.kind] || 9);
      if (kDiff !== 0) return kDiff;
      const ra = reqMap.get(a.parts?.[0]?.requirement_id);
      const rb = reqMap.get(b.parts?.[0]?.requirement_id);
      const la = ra && lessonOrder.has(ra.lesson_code) ? lessonOrder.get(ra.lesson_code) : 999;
      const lb = rb && lessonOrder.has(rb.lesson_code) ? lessonOrder.get(rb.lesson_code) : 999;
      if (la !== lb) return la - lb;
      const lva = ra ? (levelOrder[ra.level] || 9) : 9;
      const lvb = rb ? (levelOrder[rb.level] || 9) : 9;
      return lva - lvb;
    });

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
        s.number = ++esCount;
      } else {
        s.number = idx + 1;
      }
      s.parts.forEach((p, pIdx) => {
        p.id = 'P' + (idx + 1) + (s.parts.length > 1 ? String.fromCharCode(97 + pIdx) : '');
      });
    });
  }

  function lessonNaturalSortKey(lesson, ppctOrderMap) {
    const code = String(lesson?.lesson_code || '').trim();
    const match = code.match(/^B(\d+)([a-zA-Z]*)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      const suffix = (match[2] || '').toLowerCase();
      return num * 100 + (suffix ? suffix.charCodeAt(0) - 96 : 0);
    }
    if (ppctOrderMap && ppctOrderMap.has(code)) {
      return 10000 + ppctOrderMap.get(code);
    }
    return 99999;
  }

  function sortLessonsByPpct(m) {
    if (!m || !Array.isArray(m.lessons)) return;
    const ppctList = lessons(m.grade);
    const ppctOrderMap = new Map(ppctList.map((l, idx) => [l.lesson_code, idx]));
    m.lessons.sort((a, b) => {
      const ka = lessonNaturalSortKey(a, ppctOrderMap);
      const kb = lessonNaturalSortKey(b, ppctOrderMap);
      if (ka !== kb) return ka - kb;
      const ia = ppctOrderMap.has(a.lesson_code) ? ppctOrderMap.get(a.lesson_code) : 9999;
      const ib = ppctOrderMap.has(b.lesson_code) ? ppctOrderMap.get(b.lesson_code) : 9999;
      if (ia !== ib) return ia - ib;
      return String(a.lesson_code || '').localeCompare(String(b.lesson_code || ''), 'vi', { numeric: true });
    });
    renumberAllSlots(m);
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
      const lesson = (m.lessons || []).find(l => l.lesson_code === lessonCode);
      const lessonTitle = lesson ? lesson.title : lessonCode;
      const ppctLesson = typeof lessons === 'function' ? lessons(m.grade).find(l => l.lesson_code === lessonCode) : null;
      const ppctOutcomes = Array.isArray(ppctLesson?.outcomes) ? ppctLesson.outcomes.filter(Boolean) : [];
      const lvlIdx = targetLevel === 'Biết' ? 0 : targetLevel === 'Hiểu' ? 1 : targetLevel === 'Vận dụng' ? 2 : 3;
      const outcomeForLevel = ppctOutcomes[lvlIdx] || ppctOutcomes[0] || (targetLevel + ': Yêu cầu cần đạt về ' + lessonTitle + '.');
      const realOutcomeText = outcomeForLevel;

      // Ô ma trận 2D chỉ ràng buộc bài × dạng × mức độ: nhận mọi YCCĐ của bài. YCCĐ và năng lực cụ thể
      // lấy từ câu hỏi thật khi trích bảng đặc tả từ đề (trước đây tự gắn YCCĐ theo vị trí mức độ, không có căn cứ).
      void realOutcomeText;
      let req = (m.requirements || []).find(r => r.lesson_code === lessonCode && r.outcome_mode === 'any' && (r.level === targetLevel || (targetLevel === 'Vận dụng' && r.level === 'Vận dụng thấp')))
        || (m.requirements || []).find(r => r.lesson_code === lessonCode && (r.level === targetLevel || (targetLevel === 'Vận dụng' && r.level === 'Vận dụng thấp')));
      if (!req) {
        req = {
          id: uid('R'),
          lesson_code: lessonCode,
          level: targetLevel,
          text: `${targetLevel}: mọi yêu cầu cần đạt của ${lessonTitle} (YCCĐ cụ thể lấy từ đề khi trích bảng đặc tả)`,
          competency: competencies()[0] || 'NLa',
          outcome_mode: 'any',
          ppct_outcome_index: null,
          choice_group: null
        };
        m.requirements.push(req);
      }

      const isHighSchool = m.profile === 'THPT' || Number(m.grade) >= 10;
      const getIndicatorForComp = (comp) => {
        if (!isHighSchool) return '';
        const match = Array.isArray(m.indicator_catalog) && m.indicator_catalog.find(i => i.competency === comp);
        return match?.code || (comp ? comp + '.1' : 'NLa.1');
      };
      const defInd = getIndicatorForComp(req.competency);

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
              indicator: defInd
            }))
          });
        } else {
          m.slots.push({
            id: uid('S'),
            kind: targetKind,
            number: 0,
            scoring: { mode: 'sum_parts' },
            parts: [{ id: uid('P'), label: '', requirement_id: req.id, points: defaultPts, indicator: defInd }]
          });
        }
      }
    }

    renumberAllSlots(m);
  }

  // Số câu ĐÃ DUYỆT sẵn có trong ngân hàng cho một ô bảng 2D (bài × dạng × mức độ), để giáo viên biết thiếu câu ngay khi nhập.
  function gridAvailCount(m, lessonCode, gridType) {
    const want = { MC_B: ['MC', ['Biết']], MC_H: ['MC', ['Hiểu']], YN: ['YN', null], ES_VD: ['ES', ['Vận dụng', 'Vận dụng thấp']], ES_VDC: ['ES', ['Vận dụng cao']] }[gridType];
    if (!want) return null;
    const qs = Array.isArray(ui.ctx?.questions) ? ui.ctx.questions : null;
    if (!qs) return null;
    const code = String(lessonCode || '').trim().toLowerCase(), subj = String(subject(m) || '').normalize('NFC').toLowerCase();
    return qs.filter(q => q && q.review_status === 'approved' && Number(q.grade) === Number(m.grade)
      && String(q.subject_name || 'Tin học').normalize('NFC').toLowerCase() === subj
      && String(q.lesson_code || '').trim().toLowerCase() === code && q.type === want[0] && (!want[1] || want[1].includes(q.level))).length;
  }
  function gridAvailHtml(m, lessonCode, gridType, count) {
    const have = gridAvailCount(m, lessonCode, gridType);
    if (have === null) return '';
    const need = Number(count) || 0;
    if (!need && !have) return '';
    const short = need > have;
    return `<span class="mx-grid-avail${short ? ' short' : ''}" title="Số câu đã duyệt trong ngân hàng cho ô này">${short ? `thiếu ${need - have}` : `có ${have} câu`}</span>`;
  }
  function matrixGridHtml(m, locked, received) {
    const reqMap = new Map((m.requirements || []).map(r => [r.id, r]));
    const isTHPT = m.profile === 'THPT';
    const custom=(m.slots||[]).some(s=>{
      const r=reqMap.get(s.parts?.[0]?.requirement_id),points=(s.parts||[]).reduce((n,p)=>n+Number(p.points||0),0);
      return !r||s.kind==='SHORT'||s.kind==='MC'&&(!['Biết','Hiểu'].includes(r.level)||Math.abs(points-0.25)>1e-8)||s.kind==='YN'&&(!isTHPT||Math.abs(points-1)>1e-8)||s.kind==='ES'&&(!['Vận dụng','Vận dụng cao'].includes(r.level)||Math.abs(points-(isTHPT?0.75:1))>1e-8);
    });
    if(custom){
      const total=(m.slots||[]).flatMap(s=>s.parts||[]).reduce((n,p)=>n+Number(p.points||0),0);
      return `<section class="card"><h3>Phân bố riêng — giữ nguyên điểm từng vị trí</h3><p>Bảng nhập nhanh dùng mẫu điểm cố định nên không áp dụng cho hồ sơ này. Xem số liệu thật bên dưới; để sửa, mở mục “Tùy chỉnh danh sách từng câu hỏi & chỉ báo nâng cao”.</p><div class="table-wrap"><table><thead><tr><th>Câu</th><th>Dạng</th><th>Bài · Mức độ</th><th>Điểm</th></tr></thead><tbody>${(m.slots||[]).map(s=>`<tr><td>${E(s.number)}</td><td>${E(s.kind)}</td><td>${(s.parts||[]).map(p=>{const r=reqMap.get(p.requirement_id);return E(r?`${r.lesson_code} · ${r.level}`:'Chưa ánh xạ YCCĐ');}).join('<br>')}</td><td>${E((s.parts||[]).reduce((n,p)=>n+Number(p.points||0),0))}</td></tr>`).join('')}</tbody></table></div><strong>${E((m.slots||[]).length)} câu · ${E(Math.round(total*1000000)/1000000)} điểm</strong></section>`;
    }

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
      const isPlanLesson = Boolean(m.assessment_plan?.scope_lessons?.includes(lesson.lesson_code));

      const totalLessonsCount = (m.lessons || []).length;
      return `
        <tr>
          <td style="text-align:center;font-weight:600">${idx + 1}</td>
          <td>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div>
                <strong>${E(lesson.title)}</strong>
                ${isPlanLesson ? `<span class="badge" style="background:#ECE9F9;color:#4A3AA8;border:1px solid #D6D1F2;font-weight:600;font-size:10px;margin-left:4px">Trong KHKTĐG</span>` : ''}
                <small style="display:block;color:var(--muted)">${E(lesson.lesson_code)}${lesson.topic ? ' · ' + E(lesson.topic) : ''}</small>
              </div>
              ${!(locked || received) ? `
              <div style="display:inline-flex;align-items:center;gap:3px;flex-shrink:0">
                <button type="button" class="quiet" data-action="move-lesson-up" data-index="${idx}" title="Di chuyển bài học lên trên" style="padding:2px 6px;font-size:11px;min-height:auto"${idx === 0 ? ' disabled' : ''}>▲</button>
                <button type="button" class="quiet" data-action="move-lesson-down" data-index="${idx}" title="Di chuyển bài học xuống dưới" style="padding:2px 6px;font-size:11px;min-height:auto"${idx === totalLessonsCount - 1 ? ' disabled' : ''}>▼</button>
                <button type="button" class="quiet danger" data-action="remove-lesson" data-index="${idx}" title="Xóa bài học này khỏi ma trận" style="padding:2px 6px;font-size:11px;min-height:auto">✕</button>
              </div>` : ''}
            </div>
          </td>
          <td style="text-align:center">
            <input type="number" min="0" max="30" class="mx-grid-input" data-lesson-code="${E(lesson.lesson_code)}" data-grid-type="MC_B" value="${mc_b}" style="width:54px;text-align:center;font-weight:600;padding:4px"${dis}>${gridAvailHtml(m, lesson.lesson_code, 'MC_B', mc_b)}
          </td>
          <td style="text-align:center">
            <input type="number" min="0" max="30" class="mx-grid-input" data-lesson-code="${E(lesson.lesson_code)}" data-grid-type="MC_H" value="${mc_h}" style="width:54px;text-align:center;font-weight:600;padding:4px"${dis}>${gridAvailHtml(m, lesson.lesson_code, 'MC_H', mc_h)}
          </td>
          ${isTHPT ? `
          <td style="text-align:center">
            <input type="number" min="0" max="10" class="mx-grid-input" data-lesson-code="${E(lesson.lesson_code)}" data-grid-type="YN" value="${yn}" style="width:54px;text-align:center;font-weight:600;padding:4px"${dis}>${gridAvailHtml(m, lesson.lesson_code, 'YN', yn)}
          </td>` : ''}
          <td style="text-align:center">
            <input type="number" min="0" max="10" class="mx-grid-input" data-lesson-code="${E(lesson.lesson_code)}" data-grid-type="ES_VD" value="${es_vd}" style="width:54px;text-align:center;font-weight:600;padding:4px"${dis}>${gridAvailHtml(m, lesson.lesson_code, 'ES_VD', es_vd)}
          </td>
          <td style="text-align:center">
            <input type="number" min="0" max="10" class="mx-grid-input" data-lesson-code="${E(lesson.lesson_code)}" data-grid-type="ES_VDC" value="${es_vdc}" style="width:54px;text-align:center;font-weight:600;padding:4px"${dis}>${gridAvailHtml(m, lesson.lesson_code, 'ES_VDC', es_vdc)}
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
    const allPpctLessons = selectableLessons(m.grade, m.exam_type).slice().sort((a, b) => lessonNaturalSortKey(a, null) - lessonNaturalSortKey(b, null));
    const addedCodes = new Set((m.lessons || []).map(x => x.lesson_code));
    const availPpctLessons = allPpctLessons.filter(l => !addedCodes.has(l.lesson_code));
    const firstAvailCode = availPpctLessons[0]?.lesson_code || '';
    let knowPts = 0, underPts = 0, applyPts = 0;
    (m.slots || []).forEach(s => {
      (s.parts || []).forEach(p => {
        const r = reqMap.get(p.requirement_id);
        const pts = Number(p.points || 0);
        if (r?.level === 'Biết') knowPts += pts;
        else if (r?.level === 'Hiểu') underPts += pts;
        else applyPts += pts;
      });
    });

    return `
      <div class="card" style="border:1px solid #D6D1F2;background:#F7F8FB;margin-bottom:20px;padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">
          <div>
            <h3 style="margin:0 0 4px;color:var(--navy);font-size:17px">Bảng ma trận 2D trực quan (Chỉnh sửa số câu trực tiếp trên web)</h3>
            <p style="margin:0;font-size:13px;color:var(--muted)">Nhập trực tiếp số câu vào từng ô theo từng mức độ nhận thức. Hệ thống tự động tính điểm và đồng bộ vào danh sách câu hỏi chi tiết.</p>
          </div>
          <div class="actions">
            <button type="button" data-action="apply-preset" title="${isTHPT ? 'Điền nhanh mẫu chuẩn THPT (Phần 1: 19 câu TN 4,75đ + Phần 2: 3 câu Đ/S 3,0đ + Phần 3: 3 câu TL 2,25đ = 10,0 điểm)' : 'Điền nhanh mẫu 5 bài đầu học kì (28 câu TN 7,0đ + 3 câu TL 3,0đ = 10,0 điểm)'}">${isTHPT ? 'Điền mẫu THPT (19 TN + 3 Đ/S + 3 TL · 10đ)' : 'Điền mẫu tham khảo Giữa kì (5 bài · 10đ)'}</button>
            <button type="button" data-action="sort-lessons-ppct" title="Tự động sắp xếp lại các bài học theo đúng thứ tự B1, B2, B3... của PPCT">⇅ Sắp xếp đúng thứ tự bài</button>
            <button type="button" class="danger quiet" data-action="clear-slots" title="Xóa trắng bài học và câu hỏi phân bố để làm lại từ đầu">Làm trống ma trận</button>
          </div>
        </div>
        <details class="mx-help" id="mx-grid-help">
          <summary>Hướng dẫn nhập số liệu vào bảng ma trận</summary>
          <ol>
            <li><strong>Chọn bài</strong> ở ô "Chọn bài đưa vào ma trận" rồi bấm "+ Thêm bài đã chọn" (hoặc "+ Tự nhập bài mới"). Bài mới hiện thành một hàng trong bảng.</li>
            <li><strong>Nhập số câu</strong> vào từng ô theo dạng câu và mức độ nhận thức. Hệ thống tự cộng tổng số câu và tổng điểm ở hàng cuối.</li>
            <li><strong>Điểm:</strong> mỗi câu trắc nghiệm nhiều lựa chọn là 0,25 điểm (${isTHPT ? 'THPT chuẩn 19 câu = 4,75đ; Đúng/Sai 3 câu × 1,0đ = 3,0đ; Tự luận 3 câu × 0,75đ = 2,25đ' : 'THCS chuẩn 28 câu = 7,0đ; Tự luận 3 câu × 1,0đ = 3,0đ'}). Câu Đúng/Sai tính điểm theo thang bậc thang của CV 7991. Mục tiêu là <strong>tổng đúng 10,0 điểm</strong>; nếu thiếu hoặc vượt, hệ thống báo số điểm lệch.</li>
            <li><strong>Mã câu:</strong> ở bảng đặc tả, mỗi mức độ có ô mã câu và ô năng lực để bạn sửa tay (có nút đặt lại về mặc định). Hãy ghi từng câu cụ thể, ví dụ <code>(1, 2, 3, 4)</code> hoặc <code>(1a, 1b)</code>, không ghi dải câu <code>(C1 - C4)</code>.</li>
            <li><strong>Khóa:</strong> sau khi đủ số liệu, khóa ma trận 2D rồi khóa bảng đặc tả. Hai bảng khóa độc lập nhau; bảng đã khóa không sửa được cho đến khi mở khóa.</li>
          </ol>
        </details>
        ${!(locked || received) ? `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding:10px 12px;background:#F3F4F8;border:1px solid #E4E7F0;border-radius:8px">
          <label for="mx-grid-add-lesson" style="font-weight:600;font-size:13px;color:var(--navy)">Chọn bài đưa vào ma trận:</label>
          <select id="mx-grid-add-lesson" style="min-height:34px;padding:5px 10px;border:1px solid var(--line);border-radius:6px;background:#fff;flex:1;min-width:220px">
            ${allPpctLessons.length
              ? allPpctLessons.map(l => {
                  const isAdded = addedCodes.has(l.lesson_code);
                  const label = (isAdded ? '✓ [Đã có trong bảng] ' : '') + `${l.lesson_code} · ${l.lesson_name_source}${l.topic_source ? ' (' + l.topic_source + ')' : ''}`;
                  return `<option value="${E(l.lesson_code)}"${isAdded ? ' disabled' : (l.lesson_code === firstAvailCode ? ' selected' : '')}>${E(label)}</option>`;
                }).join('')
              : '<option value="">-- Chưa có PPCT cho khối này --</option>'}
          </select>
          <button type="button" data-action="grid-add-lesson" ${availPpctLessons.length ? '' : 'disabled'}>+ Thêm bài đã chọn</button>
          <button type="button" data-action="grid-add-custom-lesson">+ Tự nhập bài mới</button>
        </div>` : ''}
        <div class="table-wrap">
          <table class="matrix-grid-table" style="width:100%;border-collapse:collapse;font-size:13px;background:white">
            <thead>
              <tr style="background:#4A3AA8;color:white;text-align:center">
                <th rowspan="2" style="width:40px;padding:8px;border:1px solid #A99FE0">TT</th>
                <th rowspan="2" style="padding:8px;border:1px solid #A99FE0;text-align:left">Bài học / Nội dung</th>
                <th colspan="2" style="padding:6px;border:1px solid #A99FE0">Phần 1: TN nhiều lựa chọn (0,25đ/câu · ${isTHPT ? '19 câu = 4,75đ' : '28 câu = 7,0đ'})</th>
                ${isTHPT ? `<th rowspan="2" style="padding:6px;border:1px solid #A99FE0">Phần 2: Đúng/Sai (1,0đ/câu - 4 ý · 3 câu = 3,0đ)</th>` : ''}
                <th colspan="2" style="padding:6px;border:1px solid #A99FE0">Phần ${isTHPT ? '3' : '2'}: Tự luận (${isTHPT ? '0,75đ/câu · 3 câu = 2,25đ' : '1,0đ/câu · 3 câu = 3,0đ'})</th>
                <th rowspan="2" style="width:80px;padding:8px;border:1px solid #A99FE0">Tổng câu</th>
                <th rowspan="2" style="width:80px;padding:8px;border:1px solid #A99FE0">Điểm số</th>
              </tr>
              <tr style="background:#1C2333;color:white;text-align:center">
                <th style="width:75px;padding:6px;border:1px solid #A99FE0">Biết</th>
                <th style="width:75px;padding:6px;border:1px solid #A99FE0">Hiểu</th>
                <th style="width:75px;padding:6px;border:1px solid #A99FE0">Vận dụng</th>
                <th style="width:75px;padding:6px;border:1px solid #A99FE0">Vận dụng cao</th>
              </tr>
            </thead>
            <tbody>
              ${lessonRows || `<tr><td colspan="${isTHPT ? 8 : 7}" style="text-align:center;padding:24px;color:var(--muted)">Ma trận đang trống. Hãy chọn từng bài học ở thanh phía trên rồi bấm <strong>+ Thêm bài đã chọn</strong> (hoặc bấm <strong>Điền mẫu ${isTHPT ? 'THPT (19 TN + 3 Đ/S + 3 TL · 10đ)' : 'tham khảo Giữa kì'}</strong>).</td></tr>`}
            </tbody>
            <tfoot>
              <tr style="background:#F2F0FB;font-weight:700">
                <td colspan="2" style="text-align:right;padding:10px 12px;color:var(--navy)">TỔNG CỘNG TOÀN BÀI:</td>
                <td style="text-align:center;color:var(--navy)">${tot_mc_b} câu<br><small style="font-weight:400;color:var(--muted)">${(tot_mc_b * 0.25).toFixed(2)}đ</small></td>
                <td style="text-align:center;color:var(--navy)">${tot_mc_h} câu<br><small style="font-weight:400;color:var(--muted)">${(tot_mc_h * 0.25).toFixed(2)}đ</small></td>
                ${isTHPT ? `<td style="text-align:center;color:var(--navy)">${tot_yn} câu<br><small style="font-weight:400;color:var(--muted)">${(tot_yn * 1.0).toFixed(2)}đ</small></td>` : ''}
                <td style="text-align:center;color:var(--navy)">${tot_es_vd} câu<br><small style="font-weight:400;color:var(--muted)">${(tot_es_vd * (isTHPT ? 0.75 : 1.0)).toFixed(2)}đ</small></td>
                <td style="text-align:center;color:var(--navy)">${tot_es_vdc} câu<br><small style="font-weight:400;color:var(--muted)">${(tot_es_vdc * (isTHPT ? 0.75 : 1.0)).toFixed(2)}đ</small></td>
                <td style="text-align:center;font-size:14px;color:var(--navy)">${totalQuestions} câu</td>
                <td style="text-align:center;font-size:15px;color:${isPerfect10 ? '#1F6B52' : '#C62828'}">${totalScore}đ</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div style="font-size:13px;color:var(--ink)">
            ${isPerfect10
              ? `<span style="display:inline-flex;align-items:center;gap:6px;background:#E4E7F0;color:#1F6B52;padding:5px 12px;border-radius:20px;font-weight:700">✓ Ma trận đã cân đối chính xác 10.0 / 10.0 điểm</span>`
              : `<span style="display:inline-flex;align-items:center;gap:6px;background:#F3F4F8;color:#C62828;padding:5px 12px;border-radius:20px;font-weight:700">Tổng điểm hiện tại: ${totalScore} / 10.0 điểm (${totalScore < 10 ? 'Thiếu ' + (10 - totalScore).toFixed(2) + 'đ' : 'Vượt ' + (totalScore - 10).toFixed(2) + 'đ'})</span>`
            }
          </div>
          <div style="font-size:12px;color:var(--muted);text-align:right">
            ${isTHPT ? `<div style="margin-bottom:2px;color:var(--navy)">Khung điểm: <strong>Phần 1 (TN): ${tot_mc_b + tot_mc_h}/19 câu (${((tot_mc_b + tot_mc_h) * 0.25).toFixed(2)}/4,75đ)</strong> · <strong>Phần 2 (Đ/S): ${tot_yn}/3 câu (${(tot_yn * 1.0).toFixed(2)}/3,00đ)</strong> · <strong>Phần 3 (TL): ${tot_es_vd + tot_es_vdc}/3 câu (${((tot_es_vd + tot_es_vdc) * 0.75).toFixed(2)}/2,25đ)</strong></div>` : ''}
            Phân bố tỉ lệ: <strong>Nhận biết ${(knowPts*10).toFixed(0)}%</strong> · <strong>Thông hiểu ${(underPts*10).toFixed(0)}%</strong> · <strong>Vận dụng + VDC ${(applyPts*10).toFixed(0)}%</strong>
          </div>
        </div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px dashed #D6D1F2;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div class="actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button type="button" class="button" data-action="create-exam-from-matrix" style="background:#4A3AA8;color:#fff;border-color:#4A3AA8;font-weight:700" title="Dựa vào ma trận 2D này để chọn câu hỏi từ ngân hàng và tạo đề thi ngay">Tạo đề thi ngay từ Ma trận 2D này</button>
            ${(locked || m.matrix_locked)
              ? `<span style="display:inline-flex;align-items:center;gap:6px;background:#E4E7F0;color:#1F6B52;padding:6px 14px;border-radius:8px;font-weight:700;border:1px solid #A9D3C1;font-size:13px">Đã chốt Bảng ma trận 2D</span>
                 <button type="button" class="quiet" data-action="unlock-matrix" style="font-size:12px;padding:5px 10px;border:1px solid #D5D9E4;border-radius:6px">Mở khóa sửa ma trận</button>`
              : `<button type="button" class="primary" data-action="lock-matrix" style="background:#1F6B52;border-color:#1F6B52;font-weight:700">Lưu & Chốt Bảng ma trận</button>`
            }
            <button type="button" class="primary" data-action="save">Lưu bản nháp</button>
            <button type="button" data-action="preview">Xem bảng chuẩn Word (Ma trận + Đặc tả)</button>
            <button type="button" data-action="quick-export-doc">Xuất Word trọn bộ (.doc)</button>
          </div>
          <small style="color:var(--muted)">
            ${(locked || m.matrix_locked)
              ? (m.spec_locked ? 'Đã chốt đầy đủ cả Ma trận 2D và Bảng đặc tả.' : '✓ Bảng ma trận đã chốt — Thầy/Cô chuyển xuống Bảng 2 phía dưới để hoàn thiện và bấm "Lưu & Chốt Bảng đặc tả".')
              : (ui.dirty || !m.id ? '● Đang có thay đổi chưa lưu — bấm "Lưu bản nháp" hoặc "Lưu & Chốt Bảng ma trận"' : '✓ Đã lưu vào hệ thống')}
          </small>
        </div>
      </div>
    `;
  }

  function splitQuestionRequirements(m, targetLessonCode = null, targetLevel = null) {
    if (!m || !Array.isArray(m.slots) || !Array.isArray(m.requirements)) return 0;
    const reqMap = new Map(m.requirements.map(r => [r.id, r]));
    // Group by (lessonCode|level), where each item in a group is { slot, parts: [part, ...] }
    const groups = new Map();
    m.slots.forEach(s => {
      if (!s || !Array.isArray(s.parts) || !s.parts.length) return;
      const byKeyInSlot = new Map();
      s.parts.forEach(p => {
        const r = reqMap.get(p?.requirement_id);
        if (!r) return;
        if (targetLessonCode && r.lesson_code !== targetLessonCode) return;
        if (targetLevel && r.level !== targetLevel) return;
        const key = r.lesson_code + '|' + r.level;
        if (!byKeyInSlot.has(key)) byKeyInSlot.set(key, []);
        byKeyInSlot.get(key).push(p);
      });
      byKeyInSlot.forEach((partsForKey, key) => {
        if (!groups.has(key)) groups.set(key, []);
        // If YN has multiple parts in the same level (e.g. 1a, 1b both Biết), split each part or keep per-slot?
        // For YN, if a single YN question has multiple statements at the same level (e.g., 1a and 1b), splitting per statement or per question:
        if (s.kind === 'YN' && partsForKey.length > 1) {
          partsForKey.forEach(p => groups.get(key).push({ slot: s, parts: [p] }));
        } else {
          groups.get(key).push({ slot: s, parts: partsForKey });
        }
      });
    });

    let splitCount = 0;
    groups.forEach((itemList, key) => {
      if (itemList.length <= 1) return;
      const [lessonCode, level] = key.split('|');
      const existingReqs = m.requirements.filter(r => r.lesson_code === lessonCode && r.level === level);
      if (existingReqs.length >= itemList.length) {
        itemList.forEach((item, idx) => {
          const targetReq = existingReqs[Math.min(idx, existingReqs.length - 1)];
          if (targetReq) item.parts.forEach(p => { p.requirement_id = targetReq.id; });
        });
        return;
      }
      const baseReq = existingReqs[0] || {
        lesson_code: lessonCode,
        level,
        text: '',
        competency: competencies()[0] || 'NLa',
        ppct_outcome_index: 0,
        choice_group: null
      };
      const clauses = existingReqs
        .flatMap(r => String(r.text || '').split(/\r?\n|;\s+|(?<=\.)\s*(?=[–\-•+]\s*)/))
        .map(line => line.replace(/^[–\-•+]\s*/, '').trim())
        .filter(Boolean);
      const firstIdxInAll = m.requirements.findIndex(r => r.lesson_code === lessonCode && r.level === level);
      const newReqs = itemList.map((item, idx) => {
        const s = item.slot;
        const pLabels = item.parts.map(p => p.label || '').filter(Boolean).join(', ');
        const oldR = existingReqs[idx];
        const qLabel = s.kind === 'ES'
          ? `Câu ${s.number} TL`
          : s.kind === 'YN'
            ? `Câu ${s.number}${pLabels ? pLabels : ''} Đ/S`
            : s.kind === 'SHORT'
              ? `Câu ${s.number} TLN`
              : `Câu ${s.number}`;
        let defaultObjText = '';
        if (oldR?.text && existingReqs.length > 1) {
          defaultObjText = oldR.text;
        } else if (clauses[idx]) {
          defaultObjText = clauses[idx];
        } else {
          const baseText = clauses[0] || baseReq.text || `Yêu cầu cần đạt mức ${level}`;
          defaultObjText = `${baseText} (Mục tiêu ${qLabel})`;
        }
        const reqObj = {
          id: oldR?.id || uid('R'),
          lesson_code: lessonCode,
          level,
          text: defaultObjText,
          competency: oldR?.competency || baseReq.competency || (competencies()[0] || 'NLa'),
          ppct_outcome_index: Number.isInteger(oldR?.ppct_outcome_index) ? oldR.ppct_outcome_index : (Number.isInteger(baseReq.ppct_outcome_index) ? baseReq.ppct_outcome_index : 0),
          choice_group: oldR?.choice_group ?? null
        };
        item.parts.forEach(p => { p.requirement_id = reqObj.id; });
        return reqObj;
      });
      if (m.custom_level_refs) delete m.custom_level_refs[key];
      const remaining = m.requirements.filter(r => !(r.lesson_code === lessonCode && r.level === level));
      const insertAt = firstIdxInAll >= 0 ? Math.min(firstIdxInAll, remaining.length) : remaining.length;
      remaining.splice(insertAt, 0, ...newReqs);
      m.requirements = remaining;
      splitCount += newReqs.length;
    });
    return splitCount;
  }

  function mergeQuestionRequirements(m, targetLessonCode = null, targetLevel = null) {
    if (!m || !Array.isArray(m.slots) || !Array.isArray(m.requirements)) return 0;
    
    const groups = new Map();
    m.requirements.forEach(r => {
      if (targetLessonCode && r.lesson_code !== targetLessonCode) return;
      if (targetLevel && r.level !== targetLevel) return;
      const key = r.lesson_code + '|' + r.level;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });

    let mergedCount = 0;
    groups.forEach((reqList, key) => {
      if (reqList.length <= 1) return;
      
      const masterReq = reqList[0];
      if (masterReq.text) {
        masterReq.text = masterReq.text.replace(/\s*\(Mục tiêu\s+Câu[^)]*\)/gi, '').trim();
      }
      
      const otherReqIds = new Set(reqList.slice(1).map(r => r.id));
      
      const relatedSlotNums = [];
      (m.slots || []).forEach(s => {
        (s.parts || []).forEach(p => {
          if (otherReqIds.has(p.requirement_id) || p.requirement_id === masterReq.id) {
            p.requirement_id = masterReq.id;
            if (s.number && !relatedSlotNums.includes(s.number)) relatedSlotNums.push(s.number);
          }
        });
      });

      if (relatedSlotNums.length) {
        relatedSlotNums.sort((a, b) => a - b);
        masterReq.custom_refs = relatedSlotNums.map(n => 'Câu ' + n).join(', ');
      }

      m.requirements = m.requirements.filter(r => !otherReqIds.has(r.id));
      if (m.custom_level_refs) {
        delete m.custom_level_refs[key];
      }
      mergedCount += reqList.length - 1;
    });

    return mergedCount;
  }

  function fillLessonPpctRequirements(m, lessonCode) {
    if (!m) return;
    const pl = lessons(m.grade).find(l => l.lesson_code === lessonCode);
    const presetLessonReqs = (STANDARD_PRESETS[String(m.grade)]?.requirements || []).filter(r => r.lesson_code === lessonCode);
    const outcomes = Array.isArray(pl?.outcomes) && pl.outcomes.filter(Boolean).length
      ? pl.outcomes.filter(Boolean)
      : presetLessonReqs.map(r => r.text).filter(Boolean);
    if (!outcomes.length) return;

    const reqMap = new Map((m.requirements || []).map(r => [r.id, r]));
    const usedLevels = new Set();
    (m.slots || []).forEach(s => {
      (s.parts || []).forEach(p => {
        const r = reqMap.get(p?.requirement_id);
        if (r && r.lesson_code === lessonCode) usedLevels.add(r.level);
      });
    });
    if (!usedLevels.size) {
      usedLevels.add('Biết');
      usedLevels.add('Hiểu');
      usedLevels.add('Vận dụng');
    }

    const order = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
    const activeLevels = order.filter(lvl => usedLevels.has(lvl));

    activeLevels.forEach((lvl, idx) => {
      const presetForLvl = presetLessonReqs.find(r => r.level === lvl);
      const outcome = presetForLvl?.text || outcomes[idx] || outcomes[outcomes.length - 1] || outcomes[0];
      const levelReqs = (m.requirements || []).filter(req => req.lesson_code === lessonCode && req.level === lvl);
      if (levelReqs.length) {
        const primaryReq = levelReqs[0];
        primaryReq.text = outcome;
        primaryReq.ppct_outcome_index = Math.min(idx, Math.max(0, (pl?.outcomes?.length || 1) - 1));
        delete primaryReq.custom_refs;
        if (levelReqs.length > 1) {
          const oldIds = new Set(levelReqs.map(r => r.id));
          (m.slots || []).forEach(s => {
            (s.parts || []).forEach(p => {
              if (oldIds.has(p.requirement_id)) p.requirement_id = primaryReq.id;
            });
          });
          m.requirements = m.requirements.filter(r => !(r.lesson_code === lessonCode && r.level === lvl && r.id !== primaryReq.id));
        }
      } else {
        m.requirements.push({
          id: uid('R'),
          lesson_code: lessonCode,
          level: lvl,
          text: outcome,
          competency: presetForLvl?.competency || competencies()[0] || 'NLa',
          ppct_outcome_index: Math.min(idx, Math.max(0, (pl?.outcomes?.length || 1) - 1))
        });
      }
    });
  }

  function syncSpecFromExam(m, exam, ppctOverride) {
    if (!m || !exam || !Array.isArray(exam.questions) || !exam.questions.length) {
      return false;
    }
    if (!Array.isArray(m.lessons)) m.lessons = [];
    const existingLessons = new Map(m.lessons.map(l => [l.lesson_code, l]));
    const ppctLessons = Array.isArray(ppctOverride) ? ppctOverride.filter(l => Number(l.grade) === Number(m.grade)) : lessons(m.grade);
    exam.questions.forEach(q => {
      const lCode = q.lesson_code || 'B1';
      if (!existingLessons.has(lCode)) {
        const pl = ppctLessons.find(l => l.lesson_code === lCode);
        const newL = {
          lesson_code: lCode,
          title: pl?.lesson_name_source || pl?.title || q.lesson_name || ('Bài ' + lCode),
          topic: pl?.topic_source || pl?.topic || q.topic || 'Chủ đề'
        };
        m.lessons.push(newL);
        existingLessons.set(lCode, newL);
      }
    });

    const newReqs = [];
    const newSlots = [];
    const reqGroupMap = new Map();
    const normT = t => String(t || '').normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();
    const allowedComps = competencies();
    const compOf = (q, pl) => {
      // Năng lực: của câu hỏi; nếu trống thì mã đầu tiên khai trong PPCT của bài; cuối cùng mới lấy mã mặc định của môn.
      if (q.competency && allowedComps.includes(q.competency)) return q.competency;
      const fromPpct = [...(pl?.digital_competencies || []), ...(pl?.competencies || [])].join(' ').match(/\bNL\s*([a-eA-E])\b/);
      const code = fromPpct ? 'NL' + fromPpct[1].toLowerCase() : '';
      return allowedComps.includes(code) ? code : (allowedComps[0] || 'NLa');
    };

    // Mỗi dạng câu đánh số lại từ Câu 1 (TN câu 1.., TL câu 1..): mã định danh phải kèm dạng câu,
    // nếu không "TN câu 1" và "TL câu 1" bị gộp làm một (lỗi trước 25/11/2026).
    exam.questions.forEach((q, idx) => {
      const kind = q.type || 'MC';
      const qNum = q.slot_number || (idx + 1);
      const qLevel = q.level || 'Biết';
      const lCode = q.lesson_code || 'B1';
      const pl = ppctLessons.find(l => l.lesson_code === lCode);
      const outcomes = Array.isArray(pl?.outcomes) ? pl.outcomes : [];
      const rawText = q.learning_outcome || (q.question ? (q.question.length > 150 ? q.question.slice(0, 147) + '...' : q.question) : ('Mục tiêu đánh giá câu ' + qNum));
      const cleanText = String(rawText || '').replace(/\s*\(Mục tiêu\s+Câu[^)]*\)/gi, '').trim();
      const outcomeIdx = outcomes.findIndex(o => normT(o) === normT(cleanText));
      const qComp = compOf(q, pl);

      const groupKey = `${lCode}|${qLevel}|${kind}|${normT(cleanText)}|${qComp}`;
      let req = reqGroupMap.get(groupKey);
      if (req) {
        if (!req._refNums.includes(qNum)) req._refNums.push(qNum);
        req._refNums.sort((a, b) => a - b);
        req.custom_refs = req._refNums.map(n => 'Câu ' + n).join(', ');
      } else {
        req = {
          id: `R-EXAM-${kind}-${qNum}`,
          lesson_code: lCode,
          level: qLevel,
          text: outcomeIdx >= 0 ? outcomes[outcomeIdx] : cleanText,
          competency: qComp,
          custom_refs: 'Câu ' + qNum,
          _refNums: [qNum],
          ppct_outcome_index: outcomeIdx >= 0 ? outcomeIdx : null,
          ...(outcomeIdx >= 0 ? {} : { outcome_mode: 'any' })
        };
        reqGroupMap.set(groupKey, req);
        newReqs.push(req);
      }

      const sId = `S-${kind}-${qNum}`;
      let pts = Number(q.points);
      if (!Number.isFinite(pts) || pts <= 0) {
        pts = kind === 'MC' ? 0.25 : kind === 'YN' ? 1.0 : kind === 'SHORT' ? 0.5 : 1.0;
      }
      const parts = kind === 'YN'
        ? ['a', 'b', 'c', 'd'].map(label => ({ id: `${sId}-${label}`, requirement_id: req.id, points: Math.round(pts / 4 * 10000) / 10000, label }))
        : [{ id: sId + '-P1', requirement_id: req.id, points: pts, label: '' }];
      newSlots.push({ id: sId, number: qNum, kind, scoring: { mode: 'sum_parts' }, parts });
    });
    newReqs.forEach(r => { delete r._refNums; });

    m.requirements = newReqs;
    m.slots = newSlots;
    m.custom_level_refs = {};
    m.spec_locked = false;
    return true;
  }

  function specGridHtml(m, locked, received) {
    if (!m) return '';
    const v = buildMatrixView(m);
    const dis = (locked || received) ? ' disabled' : '';
    const isTHPT = m.profile === 'THPT';

    const topicGroups = [];
    let currentTopic = null;
    let currentGroup = [];
    (m.lessons || []).forEach(l => {
      const top = l.topic || 'Chủ đề';
      if (top !== currentTopic) {
        if (currentGroup.length) topicGroups.push(currentGroup);
        currentTopic = top;
        currentGroup = [l];
      } else {
        currentGroup.push(l);
      }
    });
    if (currentGroup.length) topicGroups.push(currentGroup);

    const LEVELS_ORDER = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
    const LEVEL_NAMES = { 'Biết': 'Nhận biết', 'Hiểu': 'Thông hiểu', 'Vận dụng': 'Vận dụng', 'Vận dụng cao': 'Vận dụng cao' };

    let tableRows = '';
    let topicIdx = 0;

    const codes=m.competency_catalog?.map(c=>c.code)||competencies();
    const datalistHtml = `<datalist id="mx-competency-datalist">${codes.map(c=>`<option value="${E(c)}">${E(m.competency_catalog?.find(x=>x.code===c)?.name||c)}</option>`).join('')}</datalist>`;

    topicGroups.forEach(grp => {
      topicIdx++;
      grp.forEach((lesson, rowInGrp) => {
        const vRow = v.rows.find(r => r.lesson_code === lesson.lesson_code) || { cells: {}, counts: {} };
        const lessonReqs = (m.requirements || []).filter(r => r.lesson_code === lesson.lesson_code);
        const compNLa = lessonReqs[0]?.competency || 'NLa';

        let reqsHtml = '';
        LEVELS_ORDER.forEach(lvl => {
          const rs = lessonReqs.filter(r => r.level === lvl);
          const cellKeyMC = 'MC|' + lvl;
          const cellKeyYN = 'YN|' + lvl;
          const cellKeySHORT = 'SHORT|' + lvl;
          const cellKeyES = 'ES|' + lvl;
          const slotCountInLevel = (vRow.cells[cellKeyMC]?.count || 0) + (vRow.cells[cellKeyYN]?.count || 0) + (vRow.cells[cellKeySHORT]?.count || 0) + (vRow.cells[cellKeyES]?.count || 0);
          if (!rs.length && slotCountInLevel <= 0) return;

          const levelReqV = v.requirements.filter(r => r.lesson_code === lesson.lesson_code && r.level === lvl);
          const autoRefs = levelReqV.flatMap(r => r.refs || []).join(', ');
          const customRefs = rs[0]?.custom_refs ?? m.custom_level_refs?.[lesson.lesson_code + '|' + lvl] ?? '';
          const displayRefs = customRefs || autoRefs;
          const lvlComp = rs[0]?.competency || m.custom_level_comp?.[lesson.lesson_code + '|' + lvl] || compNLa;
          const canSplitLevel = !(locked || received) && slotCountInLevel > 1 && rs.length < slotCountInLevel;

          reqsHtml += `<div style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px dotted #E4E7F0">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:6px;flex-wrap:wrap">
              <strong style="color:var(--navy);font-size:12px">${LEVEL_NAMES[lvl]}:</strong>
              <div style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">
                ${canSplitLevel ? `<button type="button" class="quiet" data-action="split-level-question-reqs" data-lesson-code="${E(lesson.lesson_code)}" data-level="${lvl}" title="Tách thành ${slotCountInLevel} dòng riêng để viết mục tiêu đánh giá cụ thể cho từng câu hỏi" style="font-size:10.5px;padding:2px 6px;background:#EEF6F2;color:#1F6B52;border:1px solid #CFE5DB;border-radius:4px;font-weight:700">Tách riêng từng câu (${slotCountInLevel} câu)</button>` : ''}
                ${!(locked || received)
                  ? `${rs.length <= 1 ? `<div style="display:inline-flex;align-items:center;gap:3px;background:#F2F0FB;border:1px solid #D6D1F2;padding:2px 6px;border-radius:5px" title="Số thứ tự câu hỏi thuộc mục tiêu mức ${LEVEL_NAMES[lvl]}">
                       <span style="font-size:10.5px;font-weight:700;color:#4A3AA8">Câu:</span>
                       <input type="text"
                              class="mx-spec-refs-input"
                              data-req-id="${E(rs[0]?.id || '')}"
                              data-lesson-code="${E(lesson.lesson_code)}"
                              data-level="${lvl}"
                              value="${E(displayRefs)}"
                              placeholder="VD: Câu 1, Câu 2"
                              title="Tùy chỉnh số thứ tự câu hỏi gán cho mục tiêu này (bấm nút ↺ để tự tính lại từ ma trận)"
                              style="font-size:11px;padding:2px 6px;border:1px solid #D5D9E4;border-radius:4px;color:#4A3AA8;font-weight:700;min-width:130px;background:#fff">
                       ${customRefs ? `<button type="button" class="quiet" data-action="reset-spec-refs" data-lesson-code="${E(lesson.lesson_code)}" data-level="${lvl}" title="Khôi phục câu tự động từ ma trận" style="padding:1px 4px;font-size:10px;color:#5B6475;line-height:1">↺</button>` : ''}
                     </div>` : `<span class="badge" style="font-size:10.5px;background:#ECE9F9;color:#4A3AA8;font-weight:700">${rs.length} mục tiêu câu hỏi</span>${!(locked || received) ? `<button type="button" class="quiet" data-action="merge-level-question-reqs" data-lesson-code="${E(lesson.lesson_code)}" data-level="${lvl}" title="Gom ${rs.length} mục tiêu câu hỏi này thành 1 mục tiêu chung (gộp câu hỏi)" style="font-size:10.5px;padding:2px 8px;background:#F2F0FB;color:#4A3AA8;border:1px solid #D6D1F2;border-radius:4px;font-weight:700">Gom vào 1 mục tiêu chung</button>` : ''}`}
                     <div style="display:inline-flex;align-items:center;gap:3px;background:#F3F4F8;border:1px solid #EBD7A6;padding:2px 6px;border-radius:5px" title="Thành phần năng lực cho mức ${LEVEL_NAMES[lvl]}">
                       <span style="font-size:10.5px;font-weight:700;color:#8A5A00">NL:</span>
                       <input type="text"
                              list="mx-competency-datalist"
                              class="mx-spec-comp-input"
                              data-lesson-code="${E(lesson.lesson_code)}"
                              data-level="${lvl}"
                              value="${E(lvlComp)}"
                              placeholder="Mã năng lực"
                              title="Chọn mã trong danh mục năng lực đã nạp"
                              style="font-size:11px;font-weight:700;padding:2px 4px;border:1px solid #D5D9E4;border-radius:4px;color:#8A5A00;width:55px;background:#fff;text-align:center">
                     </div>`
                  : `<span class="badge" style="font-size:11px;background:#ECE9F9;color:#4A3AA8;font-weight:600">${E(displayRefs)}</span>
                     <span class="badge" style="font-size:11px;background:#FBF4E4;color:#8A5A00;font-weight:700;border:1px solid #D4A84A">(${E(lvlComp)})</span>`
                }
              </div>
            </div>`;

          if (rs.length) {
            rs.forEach((r, rIdx) => {
              const vReq = levelReqV.find(x => x.id === r.id);
              const rAutoRefs = (vReq?.refs || []).join(', ');
              const rCustomRefs = r.custom_refs ?? (rs.length === 1 ? (m.custom_level_refs?.[lesson.lesson_code + '|' + lvl] ?? '') : '');
              const rDisplayRefs = rCustomRefs || rAutoRefs || (rs.length === 1 ? displayRefs : `Mục tiêu câu ${rIdx + 1}`);
              reqsHtml += `
                <div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:5px">
                  ${rs.length > 1
                    ? (!(locked || received)
                        ? `<div style="display:inline-flex;align-items:center;gap:2px;background:#F2F0FB;border:1px solid #D6D1F2;padding:2px 5px;border-radius:4px;flex-shrink:0;margin-top:2px" title="Câu hỏi gắn với mục tiêu này">
                             <input type="text"
                                    class="mx-spec-refs-input"
                                    data-req-id="${E(r.id)}"
                                    data-lesson-code="${E(lesson.lesson_code)}"
                                    data-level="${lvl}"
                                    value="${E(rDisplayRefs)}"
                                    placeholder="Câu..."
                                    style="font-size:11px;padding:1px 4px;border:1px solid #D5D9E4;border-radius:3px;color:#4A3AA8;font-weight:700;width:86px;background:#fff">
                             ${rCustomRefs ? `<button type="button" class="quiet" data-action="reset-spec-refs" data-req-id="${E(r.id)}" data-lesson-code="${E(lesson.lesson_code)}" data-level="${lvl}" title="Khôi phục số thứ tự câu tự động" style="padding:0 3px;font-size:10px;color:#5B6475">↺</button>` : ''}
                           </div>`
                        : `<span class="badge" style="font-size:10.5px;background:#ECE9F9;color:#4A3AA8;font-weight:700;flex-shrink:0;margin-top:4px">${E(rDisplayRefs)}</span>`)
                    : `<span style="font-size:11px;color:#4A3AA8;font-weight:700;padding-top:4px;flex-shrink:0" title="Mục tiêu đánh giá của ${E(rDisplayRefs || 'câu hỏi')}">YCCĐ</span>`
                  }
                  <textarea class="mx-spec-req-input" data-req-id="${E(r.id)}" rows="2" style="flex:1;font-size:12px;padding:4px 6px;border:1px solid #D5D9E4;border-radius:4px;line-height:1.35;resize:vertical" placeholder="Nhập mục tiêu kiểm tra, đánh giá của ${E(rDisplayRefs || ('câu hỏi mức ' + LEVEL_NAMES[lvl]))}..."${dis}>${E(r.text)}</textarea>
                  ${!(locked || received) ? `<button type="button" class="quiet danger" data-action="remove-spec-req" data-req-id="${E(r.id)}" title="Xóa dòng mục tiêu câu hỏi này" style="padding:2px 5px;font-size:11px">✕</button>` : ''}
                </div>
              `;
            });
          } else {
            reqsHtml += `
              <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
                <span class="muted" style="font-size:12px;font-style:italic">Chưa có mục tiêu câu hỏi cho mức ${LEVEL_NAMES[lvl]}</span>
                ${!(locked || received) ? `<button type="button" class="quiet" data-action="add-spec-req" data-lesson-code="${E(lesson.lesson_code)}" data-level="${lvl}" style="font-size:11px;padding:2px 6px">+ Thêm mục tiêu câu hỏi</button>` : ''}
              </div>
            `;
          }
          reqsHtml += `</div>`;
        });

        if (!reqsHtml) {
          reqsHtml = `<p class="muted" style="font-size:12px;margin:4px 0">Chưa có phân bố câu hỏi cho bài này.</p>`;
        }

        if (!(locked || received)) {
          reqsHtml += `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              <button type="button" class="quiet" data-action="split-lesson-question-reqs" data-lesson-code="${E(lesson.lesson_code)}" style="font-size:11px;padding:2px 7px;background:#EEF6F2;color:#1F6B52;border:1px solid #CFE5DB;border-radius:4px;font-weight:600" title="Tách riêng mỗi câu hỏi trong bài này thành một dòng mục tiêu đánh giá độc lập">Tách mục tiêu từng câu</button>
              <button type="button" class="quiet" data-action="merge-lesson-question-reqs" data-lesson-code="${E(lesson.lesson_code)}" style="font-size:11px;padding:2px 7px;background:#F2F0FB;color:#4A3AA8;border:1px solid #D6D1F2;border-radius:4px;font-weight:600" title="Gom các câu có cùng mức độ nhận thức của bài này vào 1 mục tiêu chung">Gom câu cùng YCCĐ bài này</button>
              <button type="button" class="quiet" data-action="add-spec-req" data-lesson-code="${E(lesson.lesson_code)}" data-level="Biết" style="font-size:11px;padding:2px 7px;border:1px solid #D5D9E4;border-radius:4px">+ Thêm mục tiêu câu hỏi</button>
              <button type="button" class="quiet" data-action="fill-lesson-ppct-reqs" data-lesson-code="${E(lesson.lesson_code)}" style="font-size:11px;padding:2px 7px;background:#F2F0FB;color:#4A3AA8;border:1px solid #D6D1F2;border-radius:4px" title="Gợi ý câu chữ khung từ Phân phối chương trình">Lấy YCCĐ từ PPCT</button>
            </div>
          `;
        }

        const cellMC = ['Biết', 'Hiểu', 'Vận dụng'].map(lvl => {
          const c = vRow.cells['MC|' + lvl];
          if (!c || !c.count) return '';
          const rLvl = lessonReqs.find(r => r.level === lvl);
          const comp = rLvl?.competency || m.custom_level_comp?.[lesson.lesson_code + '|' + lvl] || compNLa;
          const lvlAbbr = lvl === 'Biết' ? 'B' : lvl === 'Hiểu' ? 'H' : 'VD';
          return `<div style="padding:2px 0;font-size:12px;white-space:nowrap"><strong>${c.count} MC (${lvlAbbr})</strong> <span class="badge" style="background:#FBF4E4;color:#8A5A00;font-size:11px;font-weight:700;border:1px solid #D4A84A;padding:1px 5px;border-radius:4px" title="Thành phần năng lực của mức ${LEVEL_NAMES[lvl]} (chỉnh sửa ở ô NL bên trái)">(${E(comp)})</span></div>`;
        }).filter(Boolean).join('') || '0';

        const cellYN = isTHPT ? (['Biết', 'Hiểu', 'Vận dụng'].map(lvl => {
          const c = vRow.cells['YN|' + lvl];
          return c ? `${c.count} YN` : '';
        }).filter(Boolean).join('<br>') || '0') : '0';

        const cellShort = isTHPT ? (['Biết', 'Hiểu', 'Vận dụng'].map(lvl => {
          const c = vRow.cells['SHORT|' + lvl];
          return c ? `${c.count} Short` : '';
        }).filter(Boolean).join('<br>') || '0') : '0';

        const cellES = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'].map(lvl => {
          const c = vRow.cells['ES|' + lvl];
          if (!c || !c.count) return '';
          const rLvl = lessonReqs.find(r => r.level === lvl);
          const comp = rLvl?.competency || m.custom_level_comp?.[lesson.lesson_code + '|' + lvl] || compNLa;
          return `<div style="padding:2px 0;font-size:12px;white-space:nowrap"><strong>${c.count} ES</strong> <span class="badge" style="background:#FBF4E4;color:#8A5A00;font-size:11px;font-weight:700;border:1px solid #D4A84A;padding:1px 5px;border-radius:4px" title="Thành phần năng lực của mức ${LEVEL_NAMES[lvl]} (chỉnh sửa ở ô NL bên trái)">(${E(comp)})</span></div>`;
        }).filter(Boolean).join('') || '0';

        const isPlanLesson = Boolean(m.assessment_plan?.scope_lessons?.includes(lesson.lesson_code));
        tableRows += `<tr>`;
        if (rowInGrp === 0) {
          tableRows += `<td rowspan="${grp.length}" style="text-align:center;font-weight:600;vertical-align:middle">${topicIdx}</td>`;
          tableRows += `<td rowspan="${grp.length}" style="vertical-align:middle;font-weight:600;color:var(--navy);background:#F7F8FB">${E(grp[0].topic)}</td>`;
        }
        tableRows += `
          <td style="vertical-align:middle;font-weight:600">
            ${E(lesson.title)}
            <small style="display:block;color:var(--muted);font-weight:400">${E(lesson.lesson_code)}</small>
            ${isPlanLesson ? `<span class="badge" style="background:#ECE9F9;color:#4A3AA8;border:1px solid #D6D1F2;font-weight:600;font-size:10px;margin-top:3px;display:inline-block">Trong KHKTĐG</span>` : ''}
          </td>
          <td style="vertical-align:top;padding:8px 10px">${reqsHtml}</td>
          <td style="text-align:center;vertical-align:middle;font-size:12px;line-height:1.4">${cellMC}</td>
          <td style="text-align:center;vertical-align:middle;font-size:12px">${cellYN}</td>
          <td style="text-align:center;vertical-align:middle;font-size:12px">${cellShort}</td>
          <td style="text-align:center;vertical-align:middle;font-size:12px;line-height:1.4">${cellES}</td>
        </tr>`;
      });
    });

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

    const matchingExams = (ui.ctx?.exams || []).filter(ex => Number(ex.grade) === Number(m.grade));

    return datalistHtml + `
      <div id="mx-spec-table-container" class="card" style="border:1px solid #D6D1F2;background:#fff;margin-bottom:20px;padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">
          <div>
            <h3 style="margin:0 0 4px;color:var(--navy);font-size:17px">Bảng 2: Bảng đặc tả đề kiểm tra trực quan (Đặc tả Yêu cầu cần đạt theo mục tiêu từng câu hỏi)</h3>
            <p style="margin:0;font-size:13px;color:var(--muted)">Đặc tả mục tiêu kiểm tra, đánh giá cụ thể của từng câu hỏi (Câu 1, Câu 2...) theo 4 mức độ nhận thức. Mỗi dòng đặc tả gắn trực tiếp với câu hỏi tương ứng trong đề chứ không ghi chung mục tiêu của cả bài học.</p>
          </div>
          <div class="actions" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            ${matchingExams.length ? `
              <div style="display:inline-flex;align-items:center;gap:6px;background:#F7F8FB;padding:3px 8px;border-radius:6px;border:1px solid #D5D9E4">
                <label for="mx-sync-exam-select" style="font-size:12px;font-weight:700;color:#4A3AA8">Làm Bảng 2 từ Đề:</label>
                <select id="mx-sync-exam-select" style="font-size:12px;padding:3px 8px;border-radius:4px;border:1px solid #8F97A8;max-width:240px">
                  ${matchingExams.map((ex, i) => `<option value="${E(ex.id)}"${i === 0 ? ' selected' : ''}>${E(ex.title || ex.exam_code || ex.id)} (${(ex.questions||[]).length} câu)</option>`).join('')}
                </select>
                <button type="button" class="button" data-action="sync-spec-from-selected-exam" style="background:#4A3AA8;color:#fff;border-color:#4A3AA8;font-size:12px;padding:3px 10px;font-weight:700" title="Trích xuất toàn bộ mục tiêu câu hỏi, YCCĐ và Năng lực từ đề thi đã chọn vào Bảng 2 Đặc tả">
                  Trích xuất mục tiêu
                </button>
              </div>
            ` : ''}
            ${!(locked || received) ? `<button type="button" class="primary" data-action="split-all-question-reqs" style="background:#1C2333;border-color:#1C2333;font-weight:700" title="Tách riêng mỗi câu hỏi (Câu 1, Câu 2...) thành một dòng mục tiêu đánh giá độc lập để đặc tả theo mục tiêu từng câu hỏi">Tách mục tiêu theo từng câu hỏi</button>` : ''}
            ${!(locked || received) ? `<button type="button" class="button" data-action="merge-all-question-reqs" style="background:#F2F0FB;border-color:#4A3AA8;color:#4A3AA8;font-weight:700" title="Gom các câu có cùng yêu cầu cần đạt / mức độ nhận thức vào 1 mục tiêu chung">Gom câu cùng YCCĐ (Toàn bảng)</button>` : ''}
            ${!(locked || received) ? `<button type="button" class="primary" data-action="auto-fill-all-ppct-reqs" style="background:#4A3AA8;font-weight:700" title="Tự động lấy câu chữ YCCĐ từ Phân phối chương trình điền gợi ý vào các dòng">Tự điền toàn bộ YCCĐ từ PPCT</button>` : ''}
            <button type="button" data-action="preview">Xem bảng chuẩn Word</button>
          </div>
        </div>
        <p style="font-style:italic;font-size:12px;color:var(--muted);margin:0 0 10px 0">
          <strong>Lưu ý:</strong> Các câu hỏi có chung Yêu cầu cần đạt được <strong>gộp chung vào một mục tiêu</strong> (ví dụ: Câu 1, Câu 2). Thầy/Cô có thể bấm <strong>"Tách mục tiêu theo từng câu hỏi"</strong> để viết mục tiêu riêng cho từng câu, hoặc bấm <strong>"Gom câu cùng YCCĐ"</strong> để gộp lại gọn gàng bất kỳ lúc nào.
        </p>
        <div class="table-wrap">
          <table class="matrix-spec-table" style="width:100%;border-collapse:collapse;font-size:13px;background:white">
            <thead>
              <tr style="background:#4A3AA8;color:white;text-align:center">
                <th rowspan="3" style="width:40px;padding:8px;border:1px solid #A99FE0">TT</th>
                <th rowspan="3" style="width:140px;padding:8px;border:1px solid #A99FE0;text-align:left">Chương / Chủ đề</th>
                <th rowspan="3" style="width:170px;padding:8px;border:1px solid #A99FE0;text-align:left">Nội dung / Đơn vị kiến thức</th>
                <th rowspan="3" style="padding:8px;border:1px solid #A99FE0;text-align:left">Yêu cầu cần đạt (Đặc tả theo mục tiêu từng câu hỏi)</th>
                <th colspan="4" style="padding:6px;border:1px solid #A99FE0">Số câu hỏi theo mức độ đánh giá</th>
              </tr>
              <tr style="background:#1C2333;color:white;text-align:center">
                <th colspan="3" style="padding:6px;border:1px solid #A99FE0">Trắc nghiệm khách quan</th>
                <th rowspan="2" style="width:95px;padding:6px;border:1px solid #A99FE0;vertical-align:middle">Thực hành /<br>Tự luận</th>
              </tr>
              <tr style="background:#1C2333;color:white;text-align:center">
                <th style="width:115px;padding:4px;border:1px solid #A99FE0;font-size:11px">Nhiều lựa chọn<br>(MC 4-1)</th>
                <th style="width:75px;padding:4px;border:1px solid #A99FE0;font-size:11px">Đúng / Sai<br>(YN 4-4)</th>
                <th style="width:75px;padding:4px;border:1px solid #A99FE0;font-size:11px">Trả lời ngắn<br>(Short)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Chưa có bài học nào trong ma trận. Hãy thêm bài ở Bảng ma trận 2D phía trên.</td></tr>`}
            </tbody>
            <tfoot>
              <tr style="background:#F2F0FB;font-weight:700">
                <td colspan="4" style="text-align:center;padding:8px;color:var(--navy)">Tổng</td>
                <td style="text-align:center;color:var(--navy);font-size:12px;line-height:1.35">${v.totals.by_level['Biết']?.items ? v.totals.by_level['Biết'].items + ' câu B' : ''}${v.totals.by_level['Hiểu']?.items ? '<br>' + v.totals.by_level['Hiểu'].items + ' câu H' : ''}</td>
                <td style="text-align:center;color:var(--navy);font-size:12px">${ynTot ? ynTot + ' câu' : '0'}</td>
                <td style="text-align:center;color:var(--navy);font-size:12px">${shortTot ? shortTot + ' câu' : '0'}</td>
                <td style="text-align:center;color:var(--navy);font-size:12px">${esTot ? esTot + ' câu VD' : '0'}</td>
              </tr>
              <tr style="background:#F7F8FB;font-weight:700">
                <td colspan="4" style="text-align:center;padding:8px">Tỉ lệ %</td>
                <td colspan="4" style="text-align:center;color:var(--navy);font-size:12.5px">
                  ${v.totals.by_level['Biết']?.items || 0} câu B = ${pctB}%, ${v.totals.by_level['Hiểu']?.items || 0} câu H = ${pctH}%, ${esTot} câu VD = ${pctVD}%${Number(pctVDC) ? `, ${v.totals.by_level['Vận dụng cao']?.items || 0} câu VDC = ${pctVDC}%` : ''}
                </td>
              </tr>
              <tr style="background:#F7F8FB;font-weight:700">
                <td colspan="4" style="text-align:center;padding:8px">Tỉ lệ chung</td>
                <td colspan="3" style="text-align:center;color:#1F6B52;font-size:12.5px">Trắc nghiệm (B + H): ${tnkqPct}%</td>
                <td style="text-align:center;color:#8A5A00;font-size:12.5px">Tự luận (VD + VDC): ${tlPct}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px dashed #D6D1F2;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div class="actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${(locked || m.spec_locked)
              ? `<span style="display:inline-flex;align-items:center;gap:6px;background:#F2F0FB;color:#4A3AA8;padding:6px 14px;border-radius:8px;font-weight:700;border:1px solid #A99FE0;font-size:13px">Đã chốt Bảng đặc tả</span>
                 <button type="button" class="quiet" data-action="unlock-spec" style="font-size:12px;padding:5px 10px;border:1px solid #D5D9E4;border-radius:6px">Mở khóa sửa đặc tả</button>`
              : `<button type="button" class="primary" data-action="lock-spec" style="background:#4A3AA8;border-color:#4A3AA8;font-weight:700">Lưu & Chốt Bảng đặc tả</button>`
            }
            ${!(locked || received || m.spec_locked) ? `<button type="button" class="quiet" data-action="auto-fill-all-ppct-reqs" style="background:#F2F0FB;color:#4A3AA8;border:1px solid #D6D1F2;font-weight:600;padding:6px 12px;border-radius:6px" title="Tự động lấy câu chữ YCCĐ từ Phân phối chương trình điền vào tất cả các bài">Nạp lại toàn bộ YCCĐ từ PPCT</button>` : ''}
            <button type="button" data-action="preview">Xem bảng chuẩn Word</button>
            <button type="button" data-action="quick-export-doc">Xuất Word trọn bộ (.doc)</button>
          </div>
          <small style="color:var(--muted)">
            ${(locked || m.spec_locked)
              ? (m.matrix_locked ? 'Đã chốt đầy đủ cả Ma trận 2D và Bảng đặc tả.' : '✓ Bảng đặc tả đã chốt — Thầy/Cô cần bấm chốt Bảng ma trận 1 phía trên để hoàn tất khóa phiên bản.')
              : '● Chưa chốt bảng đặc tả — kiểm tra câu chữ YCCĐ và bấm "Lưu & Chốt Bảng đặc tả".'}
          </small>
        </div>
      </div>
    `;
  }

  const PREVIEW_ZOOMS=[80,90,100,110,125,150];
  const ui={container:null,ctx:null,records:[],editing:null,dirty:false,report:null,busy:false,filter:{},createGrade:8,importing:null,generation:null,comparison:null,previewState:null,previewZoom:100};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const opt=(v,text,selected)=>`<option value="${E(v)}"${selected?' selected':''}>${E(text)}</option>`;
  const uid=p=>p+'-'+Math.random().toString(36).slice(2,11);
  const qs=s=>ui.container.querySelector(s);
  const lessons=grade=>(Array.isArray(ui.ctx?.ppct?.lessons) ? ui.ctx.ppct.lessons : []).filter(l=>Number(l.grade)===Number(grade));
  function lessonSectionOf(l){
    const raw=String(l?.section||'').trim().toLowerCase();
    if(['core','elective_topic','review','assessment'].includes(raw))return raw;
    const code=String(l?.lesson_code||'').trim(),name=String(l?.lesson_name_source||l?.lesson_name||'').trim(),tp=String(l?.topic_source||l?.topic||'').trim();
    if(/^(?:CD|CĐ)\d/i.test(code)||/^\s*Chuyên\s*đề\b/i.test(name)||/chuyên\s*đề/i.test(tp))return 'elective_topic';
    if(/^KT(?:GK|CK)[12]$/i.test(code)||/^\s*Kiểm\s*tra\b/i.test(name))return 'assessment';
    if(/^(?:OT|LT)(?:_HK[12])?(?:_\d+)?$/i.test(code)||/^\s*(?:Ôn\s*tập|Luyện\s*tập)\b/i.test(name))return 'review';
    return 'core';
  }
  function selectableLessons(grade,examType=ui.editing?.exam_type,keepCodes=[]){
    const keep=new Set(Array.isArray(keepCodes)?keepCodes:[]);
    return lessons(grade).filter(l=>{
      if(keep.has(l.lesson_code))return true;
      const sec=lessonSectionOf(l);
      if(sec==='assessment'||sec==='review')return false;
      if(sec==='elective_topic'&&examType&&examType!=='TX')return false;
      return true;
    });
  }
  function computeCv7991Warnings(m){
    if(!m||m.profile!=='THPT'||!['GK1','CK1','GK2','CK2'].includes(m.exam_type))return [];
    const rawTol=m.ratio_tolerance;
    const tol=(rawTol===undefined||rawTol===null||rawTol==='')?0.5:Number(rawTol);
    if(!Number.isFinite(tol)||tol<0)return [];
    const reqs=new Map((m.requirements||[]).filter(Boolean).map(r=>[r.id,r]));
    const byKind={MC:0,YN:0,SHORT:0,ES:0};
    const byLevel={'Biết':0,'Hiểu':0,'Vận dụng':0};
    let hasVdc=false;
    for(const s of (m.slots||[])){
      for(const p of (s.parts||[])){
        const pts=Number(p.points)||0;
        if(Object.prototype.hasOwnProperty.call(byKind,s.kind))byKind[s.kind]+=pts;
        const lv=reqs.get(p.requirement_id)?.level;
        if(lv==='Vận dụng cao'){hasVdc=true;byLevel['Vận dụng']+=pts;}
        else if(Object.prototype.hasOwnProperty.call(byLevel,lv))byLevel[lv]+=pts;
      }
    }
    const kindNames={MC:'Nhiều lựa chọn',YN:'Đúng – Sai',SHORT:'Trả lời ngắn',ES:'Tự luận'};
    const isAsianThptKind=byKind.SHORT<1e-9&&Math.abs(byKind.MC-4.75)<=tol+1e-9&&Math.abs(byKind.YN-3)<=tol+1e-9&&Math.abs(byKind.ES-2.25)<=tol+1e-9;
    const targets={MC:3,YN:2,SHORT:2,ES:3};
    if(byKind.SHORT<1e-9){targets.YN+=targets.SHORT;delete targets.SHORT;delete byKind.SHORT;}
    const fmt=n=>String(Math.round(n*1000)/1000).replace('.',',');
    const out=[];
    if(!isAsianThptKind){
      for(const [k,t] of Object.entries(targets)){
        const diff=byKind[k]-t;
        if(Math.abs(diff)>tol+1e-9){
          out.push({code:'ratio_kind',message:`${kindNames[k]}: ${fmt(byKind[k])} điểm; CV 7991 tham khảo khoảng ${fmt(t)} điểm (lệch ${fmt(Math.abs(diff))}, vượt ngưỡng nội bộ ±${fmt(tol)}). Chỉ là cảnh báo.`});
        }
      }
    }
    for(const [lv,t] of Object.entries({'Biết':4,'Hiểu':3,'Vận dụng':3})){
      const diff=byLevel[lv]-t;
      if(Math.abs(diff)>tol+1e-9){
        const label=(lv==='Vận dụng'&&hasVdc)?'Mức Vận dụng + Vận dụng cao (quy đổi kỹ thuật để so tham khảo ba mức)':'Mức '+lv;
        out.push({code:'ratio_level',message:`${label}: ${fmt(byLevel[lv])} điểm; CV 7991 tham khảo khoảng ${fmt(t)} điểm (lệch ${fmt(Math.abs(diff))}, vượt ngưỡng nội bộ ±${fmt(tol)}). Chỉ là cảnh báo.`});
      }
    }
    return out;
  }
  function renderMatrixGuidanceBanner(m){
    if(!m)return '';
    const g=Number(m.grade)||0;
    const isTx=m.exam_type==='TX';
    const ppctByCode=new Map(lessons(g).map(l=>[l.lesson_code,l]));
    const electiveSelected=(m.lessons||[]).filter(l=>{
      const pl=ppctByCode.get(l.lesson_code);
      return lessonSectionOf(pl||l)==='elective_topic';
    });
    const parts=[];
    if(!isTx&&electiveSelected.length){
      parts.push(`<div class="callout error"><strong>Vi phạm phạm vi TT 22/2021 (Điều 7, khoản 1):</strong> Kỳ kiểm tra định kỳ (${E(m.exam_type)}) đang chứa ${electiveSelected.length} Chuyên đề lựa chọn (${electiveSelected.map(x=>E(x.lesson_code)).join(', ')}). Hãy chuyển sang kỳ <strong>Thường xuyên (TX)</strong> hoặc gỡ các Chuyên đề khỏi ma trận định kỳ.</div>`);
    }
    return parts.join('');
  }
  function message(text,error=false){ui.ctx.notify(text,error);}
  function detail(e){const errors=e.details?.errors||e.details?.validation?.errors;return e.message+(errors?'\n'+errors.map(x=>x.message).join('\n'):'');}
  async function run(work){if(ui.busy)return;ui.busy=true;ui.container.querySelectorAll('button').forEach(b=>b.disabled=true);try{await work();}catch(e){message(detail(e),true);if(e.details?.errors){ui.report=e.details;renderReport();}}finally{ui.busy=false;ui.container.querySelectorAll('button').forEach(b=>b.disabled=false);restoreButtons();}}
  function restoreButtons(){
    if(!ui.editing)return;
    const isArchived = ui.editing.status === 'archived';
    ui.container.querySelectorAll('[data-action]').forEach(b=>{
      const a=b.dataset.action;
      if(['save','save-and-lock','lock-matrix','unlock-matrix','lock-spec','unlock-spec','review','preview','lock','export','quick-export-doc'].includes(a))
        b.disabled=isArchived;
      if(a==='compare')b.disabled=!ui.editing.id;
    });
    ui.container.querySelectorAll('button:not([data-action])').forEach(b=>b.disabled=false);
  }
  async function refresh(){const d=await ui.ctx.request('/api/matrices');ui.records=d.matrices||[];ui.ctx?.onMatricesChanged?.(ui.records);}
  async function mount(container,context){
    ui.container=container;
    ui.ctx=context;
    if(context&&Object.prototype.hasOwnProperty.call(context,'activeGrade')){
      const ag=context.activeGrade;
      const nextFilter=(ag==='all'||ag===''||ag==null)?'':String(ag);
      ui.filter.grade=nextFilter;
      if(nextFilter&&Number(nextFilter)){
        const ng=Number(nextFilter);
        ui.createGrade=ng;
        if(!ui.dirty){
          if(ui.editing&&Number(ui.editing.grade)!==ng){ui.editing=null;ui.report=null;ui.shortfall=null;}
          if(ui.previewState&&Number(ui.previewState.matrix?.grade)!==ng)ui.previewState=null;
          if(ui.comparison&&Number(ui.comparison.matrix?.grade)!==ng)ui.comparison=null;
          if(ui.generation&&Number(ui.generation.matrix?.grade)!==ng)ui.generation=null;
          if(ui.importing&&Number(ui.importing.grade)!==ng)ui.importing={grade:ng};
        }
      }else if(Array.isArray(context.activeGrades)&&context.activeGrades.length&&!context.activeGrades.includes(Number(ui.createGrade))){
        ui.createGrade=Number(context.activeGrades[0]);
      }
    }
    await run(async()=>{await refresh();render();});
  }
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
  const grades=()=>{
    const base=root.BankCore?.contextGrades?.(ui.ctx?.context||{})||[6,7,8,9,10,11,12];
    const active=ui.ctx?.activeGrades;
    if(!Array.isArray(active)||!active.length)return base;
    const set=new Set(active.map(Number).filter(g=>base.includes(g)));
    [ui.createGrade,ui.filter?.grade,ui.editing?.grade].forEach(v=>{const n=Number(v);if(n&&base.includes(n))set.add(n);});
    const out=[...set].sort((a,b)=>a-b);
    return out.length?out:base;
  };
  const generic=()=>ui.ctx?.context?.school_profile===false;
  const defaultOwner=()=>`Tổ ${subject()||'chuyên môn'}`;
  const subject=m=>m?.subject_name||ui.ctx?.context?.subject_name||'Tin học';
  const competencies=()=>{
    if(ui.editing?.competency_catalog?.length)return ui.editing.competency_catalog.map(c=>c.code);
    const subjName=subject(ui.editing);
    const ctxComps=ui.ctx?.context?.competencies;
    const presetComps=root.BankCompetencyCatalog?.defaultCompetenciesForSubject?.(subjName);
    if(ui.editing?.subject_name&&ui.ctx?.context?.subject_name&&ui.editing.subject_name!==ui.ctx.context.subject_name&&presetComps?.length)return presetComps;
    if(ctxComps?.length&&!(ctxComps.length===1&&ctxComps[0]==='NL_CHUNG'&&presetComps?.length))return ctxComps;
    return presetComps||ctxComps||['NLa','NLb','NLc','NLd','NLe'];
  };
  const competencyOptions=current=>[...new Set([...competencies(),...(current?[current]:[])])].map(k=>opt(k,competencies().includes(k)?competencyLabel(k):k+' · cần đối chiếu danh mục',k===current)).join('');
  const apiUrl=path=>root.BankCore?.scopedUrl?.(path,ui.ctx?.context?.curriculum_id||'')||path;
  function render(){
    const f=ui.filter;
    const selCreateGrade=Number(ui.createGrade||f.grade||8)||8;
    ui.container.innerHTML=`<div class="page-head"><div><p class="eyebrow">MA TRẬN THEO CHƯƠNG TRÌNH</p><h1>Ma trận & đặc tả</h1><p>Lập phân bố câu hỏi và yêu cầu cần đạt theo môn, khối lớp của bạn. Đầy đủ thao tác Tạo mới, Xem, Sửa, Nhân bản, Mở khóa và Xóa.</p></div><div class="actions" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><select id="mx-create-grade" aria-label="Chọn khối lớp tạo ma trận" style="min-height:38px;padding:7px 12px;border:1px solid var(--line);border-radius:7px;font-weight:600;background:#fff;color:var(--ink)">${grades().map(g=>opt(g,'Khối '+g,selCreateGrade===Number(g))).join('')}</select><button class="primary" data-action="new">+ Tạo ma trận mới</button><button data-action="import">Nhập ma trận</button></div></div>
    <div id="mx-catalog-host"></div>
    <div class="matrix-flow"><span>1. Biên soạn / nhận nguồn</span><span>2. Đối chiếu & thống nhất</span><span>3. Khóa phiên bản</span><span>4. Tạo đề riêng · xuất Word</span></div>
    <div class="card"><div class="filters"><div class="field"><label for="mx-filter-grade">Khối</label><select id="mx-filter-grade" data-filter="grade">${opt('','Tất cả khối',!f.grade)}${grades().map(g=>opt(g,'Khối '+g,String(f.grade)===String(g))).join('')}</select></div><div class="field"><label for="mx-filter-period">Kỳ</label><select id="mx-filter-period" data-filter="period">${opt('','Tất cả kỳ',!f.period)}${Object.entries(periods).map(([k,v])=>opt(k,v,f.period===k)).join('')}</select></div><div class="field"><label for="mx-filter-status">Trạng thái</label><select id="mx-filter-status" data-filter="status">${opt('','Tất cả trạng thái',!f.status)}${Object.entries(states).map(([k,v])=>opt(k,v,f.status===k)).join('')}</select></div><div class="field"><label for="mx-filter-year">Năm học</label><input id="mx-filter-year" data-filter="year" value="${E(f.year||'')}" placeholder="2026-2027"></div></div>
    <div class="mx-records">${filterRecords(ui.records,f).length?filterRecords(ui.records,f).slice().reverse().map(m=>{const issues=m.reconciliation?.issues||[];return `<article class="mx-record-card${ui.editing?.id===m.id?' active':''}"><div class="mx-record-main"><button class="mx-record" data-open="${E(m.id)}"><span><strong>${E(m.title)}</strong><small>Khối ${m.grade} · ${E(profileLabel(m.profile))} · ${E(m.school_year)} · ${E(m.campus||'Chưa ghi cơ sở')} · ${m.mode==='received'?'Bản nhận từ tệp Word gốc':'Phụ trách biên soạn'}${m.source?.name?` (${E(m.source.name)})`:''}</small>${issues.length?`<span class="mx-inline-issues">${issues.map(x=>E(x.message)).join(' • ')}</span>`:''}</span><span class="mx-record-meta">${recordBadges(m)}</span></button></div><div class="mx-record-actions"><button type="button" data-open="${E(m.id)}">Mở & biên tập</button><button type="button" class="primary" data-action="preview-id" data-id="${E(m.id)}">Xem toàn bộ</button><button type="button" data-action="compare-id" data-id="${E(m.id)}">Đối chiếu bản gốc (2 cột)</button><button type="button" data-action="duplicate-id" data-id="${E(m.id)}">Nhân bản</button><button type="button" class="danger" data-action="delete-id" data-id="${E(m.id)}">Xóa</button></div></article>`;}).join(''):'<div class="empty"><h3>Chưa có hồ sơ ma trận</h3><p>Tạo ma trận cho chương trình đang mở hoặc nhập gói dữ liệu phù hợp.</p></div>'}</div></div>
    <div id="mx-preview" class="card mx-preview" hidden></div><div id="mx-work"></div>`;
    ui.container.onclick=click;ui.container.onchange=change;ui.container.oninput=input;
    ui.container.onkeydown=function(e){if(e.key==='Enter'&&e.target.matches('.mx-grid-input')){e.preventDefault();e.target.blur();}};
    if(ui.editing)renderEditor();else if(ui.generation)renderGeneration();else if(ui.importing)renderImport();
    if(ui.comparison)renderComparisonBox();else if(ui.previewState)renderPreviewBox();
    root.BankCompetencyCatalogUI?.mount(qs('#mx-catalog-host'),{request:ui.ctx.request,notify:ui.ctx.notify,subject:subject(),matrix:()=>ui.editing,apply:m=>{ui.editing=m;changed();render();}});
  }
  function field(label,path,value,type='text',disabled=false){const id='mx-'+path.replaceAll('.','-');return `<div class="field"><label for="${id}">${E(label)}</label><input id="${id}" data-field="${E(path)}" type="${type}" value="${E(value??'')}"${disabled?' disabled':''}></div>`;}
  function select(label,path,options,disabled=false){const id='mx-'+path.replaceAll('.','-');return `<div class="field"><label for="${id}">${E(label)}</label><select id="${id}" data-field="${E(path)}"${disabled?' disabled':''}>${options}</select></div>`;}

  function getAssessmentPlansForMatrix(grade, subj) {
    const s = subj || subject();
    const g = Number(grade);
    const storePlans = (typeof window !== 'undefined' && window.store && Array.isArray(window.store.assessmentPlans))
      ? window.store.assessmentPlans
      : (Array.isArray(ui.ctx?.assessmentPlans) ? ui.ctx.assessmentPlans : []);
    let list = storePlans.filter(p => (p.subject_name || 'Tin học') === s && Number(p.grade) === g);
    if (!list.length && root.BankAssessmentPlan) {
      list = root.BankAssessmentPlan.buildDefaultAssessmentPlans(g, s);
    }
    return list;
  }

  function renderAssessmentPlanDropdown(m, protectedFields) {
    const g = Number(m.grade);
    const s = subject(m);
    const plans = getAssessmentPlansForMatrix(g, s);
    const currentId = m.assessment_plan_id || '';
    const currentPlan = plans.find(p => p.id === currentId) || m.assessment_plan;
    return `
      <div class="field span2" style="grid-column: 1 / -1; background:#F2F0FB; border:1px solid #D6D1F2; border-radius:8px; padding:12px 16px; margin:6px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
          <label for="mx-assessment-plan" style="font-weight:700; color:#3A2D8A; margin:0;">
            Kế hoạch kiểm tra, đánh giá tham chiếu (Phụ lục 3 CV 5512 &amp; TT 22/2021)
          </label>
          ${currentPlan && !protectedFields ? `<button type="button" class="button primary" id="mx-sync-plan-lessons" style="font-size:12px; padding:4px 12px; background:#4A3AA8; border-color:#4A3AA8;">Đồng bộ bài học KHKTĐG (${(currentPlan.scope_lessons||[]).length} bài)</button>` : ''}
        </div>
        <select id="mx-assessment-plan" data-field="assessment_plan_id" ${protectedFields ? 'disabled' : ''} style="width:100%; font-weight:600; background:#fff; min-height:36px;">
          ${opt('', '-- Tự do (Không liên kết KHKTĐG cụ thể) --', !currentId)}
          ${plans.map(p => opt(p.id, `${p.name} · ${p.week || ''} (${p.period || ''}) · ${p.duration || 45}p · Hệ số ${p.coefficient || (['CK1','CK2'].includes(p.exam_type)?3:2)}`, p.id === currentId)).join('')}
        </select>
        ${currentPlan ? `
          <div style="margin-top:8px; font-size:12px; color:#4A3AA8; display:flex; gap:14px; flex-wrap:wrap; align-items:center; line-height:1.5;">
            <span><strong>Thời điểm:</strong> ${E(currentPlan.week || '—')}</span>
            <span><strong>Tiết PPCT:</strong> ${E(currentPlan.period || '—')}</span>
            <span><strong>Thời lượng:</strong> ${E(currentPlan.duration || 45)} phút</span>
            <span><strong>Hình thức:</strong> ${E(currentPlan.form || 'Trắc nghiệm + Tự luận')}</span>
            <span><strong>Hệ số:</strong> x${E(currentPlan.coefficient || (['CK1','CK2'].includes(currentPlan.exam_type)?3:2))}</span>
            <div style="width:100%; margin-top:4px; color:#2E3646;">
              <strong>Phạm vi bài học theo KHKTĐG:</strong> ${(currentPlan.scope_lessons || []).map(code => `<span class="badge" style="background:#ECE9F9; color:#4A3AA8; border:1px solid #D6D1F2; font-weight:600; margin:0 2px;">${E(code)}</span>`).join('') || '<span class="muted">Tất cả bài học</span>'}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
  function newDraft(grade, usePreset=false){
    const g=Number(grade)||grades()[0];
    const isHigh=g>=10;

    if(usePreset&&STANDARD_PRESETS&&STANDARD_PRESETS[String(g)]){
      const preset=clone(STANDARD_PRESETS[String(g)]);
      preset.id='';
      preset.family_id='';
      preset.version=1;
      preset.revision=0;
      preset.status='draft';
      preset.mode='authored';
      // Mẫu chuẩn được soạn cho Tin học; người phụ trách lấy theo môn đang chọn để môn khác không bị ghi "Tổ Tin học".
      preset.owner_name=(!preset.owner_name||/Tổ Tin học/i.test(preset.owner_name))?defaultOwner():preset.owner_name;
      preset.campus=preset.campus||(generic()?'':'Cao Thắng');
      preset.school_year=ui.ctx?.context?.school_year||preset.school_year||'2026-2027';
      preset.subject_name=subject();
      preset.requirements.forEach(r=>{if(!competencies().includes(r.competency))r.competency=competencies()[0];});
      preset.allow_custom_override=true;
      preset.reconciliation={confirmed:true,issues:[]};
      preset.audit=[{at:new Date().toISOString(),action:'create_preset'}];
      return preset;
    }

    return {
      id:'',family_id:'',version:1,revision:0,status:'draft',mode:'authored',
      profile:generic()?'GENERAL':isHigh?'THPT':'THCS',
      grade:g,
      school_year:ui.ctx?.context?.school_year||'2026-2027',
      subject_name:subject(),
      exam_type:'GK1',
      duration:45,
      title:`Ma trận Giữa HK1 ${subject()} ${g}`,
      owner_name:defaultOwner(),
      campus:generic()?'':'Cao Thắng',
      total_points:10,
      lessons:[],
      requirements:[],
      slots:[],
      indicator_catalog:isHigh&&subject()==='Tin học'?[
        {code:'NLa',competency:'NLa',text:'Nhận biết và giải thích các khái niệm tin học cơ bản.'},
        {code:'NLb',competency:'NLb',text:'Sử dụng và ứng dụng công nghệ thông tin trong học tập.'},
        {code:'NLc',competency:'NLc',text:'Tư duy giải quyết vấn đề với sự trợ giúp của máy tính.'}
      ]:[],
      source:null,
      reconciliation:{confirmed:true,issues:[]},
      audit:[{at:new Date().toISOString(),action:'create_clean'}],
      allow_custom_override:true
    };
  }
  function renderEditor(){
    normalizeSlotNumbers(ui.editing);
    const openSections=[...ui.container.querySelectorAll('#mx-work details')].map(d=>d.open);
    const m=ui.editing,custom=Boolean(m.allow_custom_override),locked=['locked','archived'].includes(m.status),received=!custom&&m.mode==='received',protectedFields=locked||received;
    const matrixLocked = locked || Boolean(m.matrix_locked);
    const specLocked = locked || Boolean(m.spec_locked);
    qs('#mx-work').innerHTML=`<section class="card mx-editor"><div class="mx-editor-head"><div><p class="eyebrow">${custom?'CHẾ ĐỘ SỬA TOÀN DIỆN (TÙY CHỈNH)':received?'NHẬN NGUỒN · BẢO TOÀN CHỈ TIÊU':'PHỤ TRÁCH BIÊN SOẠN'}</p><h2>${E(m.title)} <span class="badge">V${m.version}</span></h2><p>${E(states[m.status])}${custom?' · Đang mở khóa tùy chỉnh toàn diện':''}<span id="mx-dirty">${ui.dirty?' · Có thay đổi chưa lưu':''}</span></p></div><div class="actions"><button data-action="preview">Xem toàn bộ bảng</button>${m.mode==='received'||m.source?`<button data-action="compare">Đối chiếu bản gốc (2 cột)</button>`:''}${received?`<button type="button" data-action="unlock-custom">Bật sửa toàn diện</button>`:''}${m.id?`<button type="button" data-action="duplicate-id" data-id="${E(m.id)}">Nhân bản</button><button type="button" class="danger" data-action="delete-id" data-id="${E(m.id)}">Xóa hồ sơ</button>`:''}<button data-action="save" class="primary">Lưu bản nháp</button><button data-action="discard">${ui.dirty?'Bỏ thay đổi / tải bản đã lưu':'Đóng hồ sơ'}</button></div></div>
    <div class="mx-section-nav"><button type="button" data-scroll="mx-information">Thông tin</button><button type="button" data-scroll="mx-grid">1. Bảng ma trận 2D ${m.matrix_locked ? '· đã chốt' : ''}</button><button type="button" data-scroll="mx-spec-grid">2. Bảng đặc tả ${m.spec_locked ? '· đã chốt' : ''}</button><button type="button" data-scroll="mx-output">3. Word & chốt phiên bản</button></div>
    ${received?'<div class="callout">Đang ở chế độ bảo toàn chỉ tiêu nguồn (chỉ bổ sung ánh xạ PPCT và số câu). Nếu bạn muốn thêm/sửa/xóa bài học, YCCĐ hoặc phân bố câu hỏi trực tiếp, hãy bấm nút <strong>"Bật sửa toàn diện"</strong> ở góc phải phía trên.</div>':''}
    <h3 id="mx-information">1. Thông tin hồ sơ</h3><div class="form-grid">${field('Tên hồ sơ','title',m.title,'text',locked)}${select('Khối lớp','grade',grades().map(g=>opt(g,'Khối '+g,Number(m.grade)===g)).join(),protectedFields)}${field('Người phụ trách biên soạn','owner_name',m.owner_name,'text',locked)}${field('Cơ sở của người phụ trách','campus',m.campus,'text',locked)}${field('Năm học','school_year',m.school_year,'text',protectedFields)}${select('Kỳ kiểm tra','exam_type',Object.entries(periods).map(([k,v])=>opt(k,v,k===m.exam_type)).join(''),protectedFields)}${field('Thời gian (phút)','duration',m.duration,'number',protectedFields)}${select('Kiểu mẫu','profile',(generic()?['GENERAL']:['THCS','THPT']).map(k=>opt(k,profileLabel(k),k===m.profile)).join(''),protectedFields)}${renderAssessmentPlanDropdown(m,protectedFields)}</div>
    ${renderMatrixGuidanceBanner(m)}
    ${profileOptionsHtml(m,matrixLocked)}
    <div id="mx-grid">${matrixGridHtml(m, matrixLocked, received)}</div>
    <div id="mx-spec-grid">${specGridHtml(m, specLocked, received)}</div>
    <details style="margin:16px 0;border:1px solid var(--line);border-radius:10px;background:#F7F8FB;padding:10px 16px">
      <summary style="cursor:pointer;font-weight:600;color:var(--muted);font-size:13px">Tùy chỉnh danh sách từng câu hỏi & chỉ báo nâng cao (Hệ thống đã tự động liên kết từ Bảng 1 & Bảng 2)</summary>
      <div style="margin-top:14px">
        <h3 id="mx-lessons">Bài học & yêu cầu cần đạt chi tiết</h3><p class="muted">Khối ${m.grade}. Thầy/Cô có thể chỉnh sửa trực tiếp ở Bảng 2 (Bảng đặc tả) phía trên hoặc tùy chỉnh tại đây.</p>
        ${!received&&!matrixLocked&&!specLocked?`<div class="actions"><label for="mx-add-lesson">Bài cần thêm</label><select id="mx-add-lesson">${selectableLessons(m.grade,m.exam_type).filter(l=>!m.lessons.some(x=>x.lesson_code===l.lesson_code)).map(l=>opt(l.lesson_code,l.lesson_name_source,false)).join('')}</select><button data-action="add-lesson">+ Thêm bài</button></div>`:''}
        ${m.lessons.map((lesson,i)=>`<article class="mx-lesson"><div class="dialog-heading" style="margin-bottom:8px"><h4>${E(lesson.title)}</h4>${!received&&!matrixLocked&&!specLocked?`<button type="button" class="quiet danger" data-action="remove-lesson" data-index="${i}">Xóa bài này</button>`:''}</div>${select('Đối chiếu bài PPCT '+(i+1),`lessons.${i}.lesson_code`,opt('','Chọn bài đối chiếu',!lesson.lesson_code)+selectableLessons(m.grade,m.exam_type,[lesson.lesson_code]).map(l=>opt(l.lesson_code,l.lesson_name_source,l.lesson_code===lesson.lesson_code)).join(''),matrixLocked||specLocked||received)}${!received?`<div class="form-grid">${field('Tên bài hiển thị '+(i+1),`lessons.${i}.title`,lesson.title,'text',matrixLocked||specLocked)}${field('Tên chủ đề '+(i+1),`lessons.${i}.topic`,lesson.topic,'text',matrixLocked||specLocked)}</div>`:`<p class="muted">Nguồn: ${E(lesson.topic)}</p>`}
        ${m.requirements.map((r,ri)=>r.lesson_code===lesson.lesson_code&&(!received||r.source_index===lesson.source_index)?requirementEditor(r,ri,specLocked,received):'').join('')}
        ${!received&&!specLocked?`<button data-action="add-requirement" data-index="${i}">+ Thêm yêu cầu / chỉ báo kiểm tra</button>`:''}</article>`).join('')}
        ${(m.profile==='THPT'||m.competency_catalog?.length)?`<h3>Danh mục chỉ báo năng lực</h3><p class="muted">Giữ nguyên mã và mô tả chỉ báo của nguồn. Bảng phân bố năng lực được dựng từ các vị trí đã gắn mã.</p>${m.indicator_catalog.map((c,i)=>`<div class="form-grid mx-indicator">${field('Mã chỉ báo '+(i+1),`indicator_catalog.${i}.code`,c.code,'text',specLocked||received)}${select('Năng lực của mã '+(i+1),`indicator_catalog.${i}.competency`,competencyOptions(c.competency),specLocked||received)}${field('Mô tả chỉ báo '+(i+1),`indicator_catalog.${i}.text`,c.text,'text',specLocked||received)}${!specLocked&&!received?`<div class="field" style="justify-content:flex-end"><button type="button" class="quiet danger" data-action="remove-indicator" data-index="${i}">Xóa mã</button></div>`:''}</div>`).join('')}${!specLocked&&!received?'<button data-action="add-indicator">+ Thêm mã chỉ báo</button>':''}`:''}
        <h3 id="mx-slots">Phân bố câu hỏi và ý chi tiết</h3>${!matrixLocked&&!received?bulkEditor():''}<div id="mx-summary" class="mx-totals"></div>
        <div class="table-wrap"><table class="mx-slots-table"><thead><tr><th>Câu / dạng</th><th>Ý</th><th>Yêu cầu cần đạt cụ thể</th><th>Điểm</th>${(m.profile==='THPT'||m.competency_catalog?.length)?'<th>Mã chỉ báo</th>':''}${!matrixLocked&&!received?'<th>Thao tác</th>':''}</tr></thead><tbody>${m.slots.map((s,si)=>s.parts.map((p,pi)=>slotEditor(s,si,p,pi,matrixLocked,received)).join('')).join('')}</tbody></table></div>
      </div>
    </details>
    <div id="mx-output"><h3>3. Xuất file Word, Đối chiếu & Chốt phiên bản</h3><p class="muted">Xem trực tiếp bảng Ma trận & Đặc tả chuẩn Word (có gộp ô tự động), tải file Word/PDF hoặc chốt phiên bản để tạo đề kiểm tra.</p><div id="mx-report"></div><div id="mx-shortfall"></div><div id="mx-export-links" style="margin-bottom:12px"></div>
    ${m.status!=='locked'?`<div class="card" style="background:#EEF6F2;border:1px solid #CFE5DB;padding:16px;margin-bottom:14px"><h4 style="margin:0 0 8px;color:#17503D">Xác nhận & Chốt phiên bản Ma trận</h4><p class="small muted" style="margin:0 0 12px">Sau khi chốt (khóa phiên bản), ma trận này sẽ sẵn sàng để chọn trong mục <strong>Tạo đề kiểm tra</strong> và <strong>Đề cương ôn tập</strong>.</p><div class="form-grid"><div class="field"><label for="mx-confirm-name">Người xác nhận</label><input id="mx-confirm-name" value="${E(m.owner_name||'Trần Gia Huy')}"></div><div class="field"><label for="mx-confirm-date">Ngày xác nhận</label><input id="mx-confirm-date" type="date" value="${new Date().toLocaleDateString('sv-SE')}"></div><div class="field full"><label for="mx-confirm-basis">Ghi chú xác nhận (tùy chọn)</label><input id="mx-confirm-basis" value="Đã thống nhất ma trận và đặc tả"></div></div><label class="mx-checkbox" style="margin:8px 0"><input id="mx-confirm-agreement" type="checkbox" checked> Tôi xác nhận chốt phiên bản ma trận & đặc tả này.</label><div class="actions"><button class="primary" data-action="save-and-lock" style="background:#1F6B52;border-color:#1F6B52;font-weight:700">Lưu & Chốt phiên bản này</button><button data-action="save" class="primary">Chỉ lưu bản nháp</button><button data-action="preview">Xem toàn bộ bảng chuẩn Word</button></div></div>`:`<div class="callout" style="background:#E4E7F0;border-color:#A9D3C1;color:#1F6B52"><strong>Phiên bản ma trận này đã được chốt và khóa thành công!</strong><p style="margin:6px 0 0">Bạn có thể dùng ma trận này để tạo đề kiểm tra ngay hoặc mở khóa nếu cần chỉnh sửa lại.</p><div class="actions" style="margin-top:10px"><button class="primary" data-action="use">Dùng tạo đề kiểm tra ngay</button><button data-action="unlock">Mở khóa về bản nháp để sửa</button><button data-action="new-version">Tạo phiên bản V${(m.version||1)+1}</button></div></div>`}
    <details style="margin-top:10px"><summary style="cursor:pointer;color:var(--muted);font-size:13px">Lịch sử thao tác & Lưu trữ hồ sơ</summary><ul style="font-size:13px">${(m.audit||[]).map(a=>`<li>${E(a.at)} · ${E(({save:'Lưu nháp',lock:'Khóa bản thống nhất',archive:'Lưu trữ',new_version:'Tạo phiên bản tiếp theo',import_source:'Nhập nguồn',unlock:'Mở khóa về nháp',duplicate:'Nhân bản hồ sơ'})[a.action]||a.action)}</li>`).join('')}</ul><div class="actions"><input id="mx-archive-reason" placeholder="Lý do lưu trữ (nếu không dùng nữa)" style="max-width:280px"><button class="quiet" data-action="archive">Lưu trữ hồ sơ</button><button data-action="shortfall" class="quiet">Báo cáo thiếu câu theo ô</button></div></details></div></section>`;
    ui.container.querySelectorAll('#mx-work details').forEach((d,i)=>{if(openSections[i])d.open=true;});
    updateSummary();renderReport();renderLinks();restoreButtons();
  }
  function requirementEditor(r,i,locked,received){
    const source=lessons(ui.editing.grade).find(l=>l.lesson_code===r.lesson_code);
    return `<div class="mx-requirement"><div class="dialog-heading" style="margin-bottom:6px"><label for="mx-req-${i}">Yêu cầu / chỉ báo ${i+1}</label>${!locked&&!received?`<button type="button" class="quiet danger" data-action="remove-requirement" data-index="${i}">Xóa yêu cầu</button>`:''}</div><textarea id="mx-req-${i}" rows="2" data-field="requirements.${i}.text"${locked||received?' disabled':''}>${E(r.text)}</textarea><div class="form-grid">${select('Mức độ của yêu cầu '+(i+1),`requirements.${i}.level`,requirementLevelOptions(r.level),locked||received)}${select('Năng lực của yêu cầu '+(i+1),`requirements.${i}.competency`,competencyOptions(r.competency),locked||received)}${select('YCCĐ nguồn của yêu cầu '+(i+1),`requirements.${i}.ppct_outcome_index`,opt('','Chọn yêu cầu từ PPCT',r.ppct_outcome_index===null&&r.outcome_mode!=='any')+opt('*','Mọi YCCĐ của bài (ma trận 2D — YCCĐ cụ thể lấy từ đề)',r.outcome_mode==='any')+(source?.outcomes||[]).map((o,n)=>opt(n,o,r.outcome_mode!=='any'&&r.ppct_outcome_index===n)).join(''),locked)}</div></div>`;
  }
  function bulkEditor(){const m=ui.editing;return `<div class="mx-bulk"><h4>Thêm phân bố</h4><div class="form-grid"><div class="field"><label for="mx-bulk-kind">Dạng câu</label><select id="mx-bulk-kind">${Object.entries(kinds).filter(([k])=>effectiveKinds(m).includes(k)).map(([k,v])=>opt(k,v,false)).join('')}</select></div><div class="field span2"><label for="mx-bulk-req">Yêu cầu kiểm tra</label><select id="mx-bulk-req">${m.requirements.map(r=>opt(r.id,`${r.lesson_code} · ${r.level} · ${r.text}`,false)).join('')}</select></div><div class="field"><label for="mx-bulk-count">Số câu mẹ</label><input id="mx-bulk-count" type="number" min="1" max="100" value="1"></div><div class="field"><label for="mx-bulk-parts">Ý / câu tự luận</label><input id="mx-bulk-parts" type="number" min="1" max="10" value="1"></div><div class="field"><label for="mx-bulk-points">Điểm mỗi ý / câu đơn</label><input id="mx-bulk-points" type="number" min="0.01" step="0.05" value="0.25"></div></div><p class="small muted">Đúng/Sai luôn có 4 ý a–d. Số yêu cầu con của tự luận khác với số tiêu chí của hướng dẫn chấm.</p><button data-action="add-slots">Thêm vào phân bố</button></div>`;}
  function slotEditor(s,si,p,pi,locked,received){const m=ui.editing;const rs=m.requirements.filter(r=>!received||(r.source_index===p.source_index&&r.level===p.source_level));return `<tr><td>${pi===0?`${E(NAMEShort(s.kind))} ${s.number}`:''}</td><td>${E(p.label||'—')}</td><td><select aria-label="Yêu cầu vị trí ${E(s.id)} ${pi+1}" data-field="slots.${si}.parts.${pi}.requirement_id"${locked?' disabled':''}>${opt('','Chọn yêu cầu',!p.requirement_id)}${rs.map(r=>opt(r.id,`${r.lesson_code} · ${r.level} · ${r.text}`,r.id===p.requirement_id)).join('')}</select></td><td><input aria-label="Điểm vị trí ${E(s.id)} ${pi+1}" type="number" min="0.01" step="0.05" data-field="slots.${si}.parts.${pi}.points" value="${E(p.points)}"${locked||received?' disabled':''}></td>${(m.profile==='THPT'||m.competency_catalog?.length)?`<td><select aria-label="Chỉ báo vị trí ${E(s.id)} ${pi+1}" data-field="slots.${si}.parts.${pi}.indicator"${locked||received?' disabled':''}>${opt('','Chọn mã',!p.indicator)}${m.indicator_catalog.filter(c=>c.competency===m.requirements.find(r=>r.id===p.requirement_id)?.competency||c.code===p.indicator).map(c=>opt(c.code,c.code+' · '+c.text,c.code===p.indicator)).join('')+(!m.indicator_catalog.some(c=>c.code===p.indicator)&&p.indicator?opt(p.indicator,p.indicator+' · không có trong danh mục',true):'')}</select></td>`:''}${!locked&&!received?`<td>${pi===0?`<button class="quiet danger" data-action="remove-slot" data-index="${si}">Bỏ câu</button>`:''}</td>`:''}</tr>`;}
  function NAMEShort(k){return {MC:'MC',YN:'Đ/S',SHORT:'Trả lời ngắn',ES:'Tự luận'}[k];}
  function updateSummary(){const m=ui.editing;if(!m||!qs('#mx-summary'))return;const parts=m.slots.flatMap(s=>s.parts);const total=Math.round(parts.reduce((n,p)=>n+Number(p.points||0),0)*10000)/10000;qs('#mx-summary').innerHTML=`<strong>${m.slots.length} câu mẹ</strong><span>${parts.length} câu / ý</span><strong class="${total===10?'mx-good':'mx-bad'}">${total.toLocaleString('vi-VN')} / 10 điểm</strong>`;}
  // B9: báo cáo thiếu câu đã duyệt theo từng ô, có liên kết sang màn hình duyệt đã lọc đúng ô.
  function shortfallHtml(r,allowReview=false){
    const incomplete=r.complete===false;
    const heading=incomplete?'Chưa thể kết luận đủ câu':r.ok?'Đủ câu đã duyệt cho mọi ô':`Còn thiếu ${E(r.total_shortfall)} câu đã duyệt`;
    const known=incomplete&&r.total_shortfall>0?`<p>Đã xác định thiếu ${E(r.total_shortfall)} câu ở các ô đã đối chiếu; các vị trí bên dưới chưa được tính đủ.</p>`:'';
    const issues=(r.issues||[]).length?`<ul>${r.issues.map(i=>`<li>${E(i.message)}</li>`).join('')}</ul>`:'';
    const rows=(r.cells||[]).map((c,i)=>`<tr${c.shortfall?' style="background:#F3F4F8"':''}><td>${E(c.lesson_code)}</td><td>${E(c.outcome)}</td><td>${E(NAMEShort(c.kind))}</td><td>${E(c.level)}</td><td>${E(c.needed)}</td><td>${E(c.approved)}</td><td>${E(c.pending_review)}</td><td>${E(c.needs_review)}</td><td>${E(c.draft)}</td><td><strong>${E(c.shortfall||'—')}</strong></td><td>${c.shortfall&&allowReview?`<button type="button" class="export-link" data-open-review="${i}">Mở duyệt ô này</button>`:''}</td></tr>${c.shortfall&&(c.suggestions||[]).length?`<tr class="mx-suggest-row"><td colspan="11" style="background:#F7F8FB;font-size:13px"><strong>Gợi ý từ Bản đồ tri thức:</strong> có ${E(c.suggestions.length)} câu đúng ô này nhưng chưa duyệt, duyệt xong sẽ bù được chỗ thiếu.<ul style="margin:4px 0 0">${c.suggestions.map(s=>`<li><code>${E(s.question_id)}</code> (${E(({draft:'bản nháp',pending_review:'chờ duyệt',content_checked:'chờ duyệt',needs_review:'cần sửa lại'})[s.review_status]||s.review_status)}): ${E(s.question||'')}</li>`).join('')}</ul></td></tr>`:''}`).join('');
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
      <button type="button" class="button" data-export="custom-matrix" style="background:#4A3AA8;color:#fff;border-color:#4A3AA8;font-weight:700">Tùy biến xuất hồ sơ</button>
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
        if(type==='custom-matrix')openCustomMatrixExportDialog(m);
        else if(type==='doc-all')downloadMatrixWord(m,'all');
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
    else if(key==='ppct_outcome_index'&&value==='*'){object.outcome_mode='any';value=null;}
    else if(el.type==='number'||key==='ppct_outcome_index'||key==='grade'){if(key==='ppct_outcome_index')delete object.outcome_mode;value=value===''?null:Number(value);}
    if(key==='assessment_plan_id'){
      object[key]=value;
      const plans = getAssessmentPlansForMatrix(ui.editing.grade, subject(ui.editing));
      const plan = plans.find(p => p.id === value);
      ui.editing.assessment_plan = plan || null;
      if(plan){
        if(plan.exam_type)ui.editing.exam_type=plan.exam_type;
        if(plan.duration)ui.editing.duration=plan.duration;
      }
      changed();renderEditor();return;
    }
    object[key]=value;changed();
    if(key==='grade'){
      const newGrade=Number(value);
      ui.createGrade=newGrade;
      ui.editing.grade=newGrade;
      ui.editing.profile=generic()?'GENERAL':newGrade>=10?'THPT':'THCS';
      ui.editing.matrix_locked=false;
      ui.editing.spec_locked=false;
      ui.editing.custom_level_refs={};
      ui.editing.custom_level_comp={};
      if(newGrade>=10&&!generic()&&subject(ui.editing)==='Tin học'&&!(ui.editing.indicator_catalog||[]).length){
        ui.editing.indicator_catalog=[
          {code:'NLa',competency:'NLa',text:'Nhận biết và giải thích các khái niệm tin học cơ bản.'},
          {code:'NLb',competency:'NLb',text:'Sử dụng và ứng dụng công nghệ thông tin trong học tập.'},
          {code:'NLc',competency:'NLc',text:'Tư duy giải quyết vấn đề với sự trợ giúp của máy tính.'}
        ];
      }else if(newGrade<10){
        ui.editing.indicator_catalog=[];
      }
      ui.editing.title=`Ma trận ${periods[ui.editing.exam_type]||'Giữa HK1'} ${subject()} ${newGrade}`;
      const pl=selectableLessons(newGrade,ui.editing.exam_type);
      ui.editing.lessons=pl.length?pl.slice(0,newGrade>=10?8:5).map(l=>({
        lesson_code:l.lesson_code,
        title:l.lesson_name_source||l.lesson_code,
        topic:l.topic_source||''
      })):[];
      ui.editing.requirements=[];
      ui.editing.slots=[];
      ui.previewState=null;
      ui.comparison=null;
      ui.shortfall=null;
      ui.report=null;
      changed();
      render();
      message('Đã chuyển sang Khối ' + newGrade + ' và làm mới toàn bộ bảng ma trận & đặc tả.');
      return;
    }else if(key==='exam_type'){
      if(value==='TX'&&Number(ui.editing.duration)===45)ui.editing.duration=15;
      else if(value!=='TX'&&Number(ui.editing.duration)===15)ui.editing.duration=45;
      renderEditor();
    }else if(key==='profile'){
      if(value==='THPT'&&subject(ui.editing)==='Tin học'&&!(ui.editing.indicator_catalog||[]).length){
        ui.editing.indicator_catalog=[
          {code:'NLa',competency:'NLa',text:'Nhận biết và giải thích các khái niệm tin học cơ bản.'},
          {code:'NLb',competency:'NLb',text:'Sử dụng và ứng dụng công nghệ thông tin trong học tập.'},
          {code:'NLc',competency:'NLc',text:'Tư duy giải quyết vấn đề với sự trợ giúp của máy tính.'}
        ];
      }
      renderEditor();
    }else if(path[0]==='lessons'&&key==='lesson_code'){
      const lesson=ui.editing.lessons[Number(path[1])];
      ui.editing.requirements.forEach(r=>{if(ui.editing.mode==='received'&&!ui.editing.allow_custom_override?r.source_index===lesson.source_index:r.lesson_code===previous){r.lesson_code=value;r.ppct_outcome_index=null;}});
      renderEditor();
    }else if(key==='ppct_outcome_index'&&(ui.editing.mode==='authored'||ui.editing.allow_custom_override)){
      const r=object,l=lessons(ui.editing.grade).find(x=>x.lesson_code===r.lesson_code);
      if(!r.text&&value!==null){r.text=l?.outcomes[value]||'';renderEditor();}
    }else if(el.tagName==='SELECT'&&['level','competency'].includes(key))renderEditor();
  }
  function captureGeneration(){if(!ui.generation||!qs('#mx-exam-title'))return;const values={};ui.container.querySelectorAll('[id^=mx-exam-],[data-choice],[data-review-slot]').forEach(el=>{const key=el.dataset.reviewSlot?'review:'+el.dataset.reviewSlot+':'+el.value:el.id;values[key]=el.type==='checkbox'?el.checked:el.value;});ui.generation.formValues=values;}
  function input(event){
    captureGeneration();
    const m = ui.editing;
    const locked = ['locked', 'archived'].includes(m?.status);
    const specLocked = locked || Boolean(m?.spec_locked);
    const matrixLocked = locked || Boolean(m?.matrix_locked);

    if (event.target.matches('.mx-spec-req-input')) {
      if (specLocked) { event.preventDefault(); return; }
      const reqId = event.target.dataset.reqId;
      const r = (ui.editing?.requirements || []).find(x => x.id === reqId);
      if (r) {
        r.text = event.target.value;
        ui.dirty = true;
        const mark = qs('#mx-dirty');
        if (mark) mark.textContent = ' · Có thay đổi chưa lưu';
      }
      return;
    }
    if (event.target.matches('.mx-spec-refs-input')) {
      if (specLocked) { event.preventDefault(); return; }
      const reqId = event.target.dataset.reqId;
      const lessonCode = event.target.dataset.lessonCode;
      const level = event.target.dataset.level;
      const val = event.target.value;
      const levelReqs = (ui.editing.requirements || []).filter(r => r.lesson_code === lessonCode && r.level === level);
      if (reqId && levelReqs.length > 1) {
        const targetReq = levelReqs.find(r => r.id === reqId);
        if (targetReq) targetReq.custom_refs = val;
      } else {
        if (!ui.editing.custom_level_refs) ui.editing.custom_level_refs = {};
        ui.editing.custom_level_refs[lessonCode + '|' + level] = val;
        levelReqs.forEach(r => {
          r.custom_refs = val;
        });
      }
      ui.dirty = true;
      const mark = qs('#mx-dirty');
      if (mark) mark.textContent = ' · Có thay đổi chưa lưu';
      return;
    }
    if (event.target.matches('.mx-spec-comp-input')) {
      if (specLocked) { event.preventDefault(); return; }
      const lessonCode = event.target.dataset.lessonCode;
      const level = event.target.dataset.level;
      const val = event.target.value.trim();
      if (!ui.editing.custom_level_comp) ui.editing.custom_level_comp = {};
      ui.editing.custom_level_comp[lessonCode + '|' + level] = val;
      (ui.editing.requirements || []).filter(r => r.lesson_code === lessonCode && r.level === level).forEach(r => {
        r.competency = val;
      });
      ui.container.querySelectorAll(`.mx-spec-comp-input[data-lesson-code="${lessonCode}"][data-level="${level}"]`).forEach(inputEl => {
        if (inputEl !== event.target && inputEl.value !== val) {
          inputEl.value = val;
        }
      });
      ui.dirty = true;
      const mark = qs('#mx-dirty');
      if (mark) mark.textContent = ' · Có thay đổi chưa lưu';
      return;
    }
    if (matrixLocked && event.target.closest('#mx-grid')) {
      event.preventDefault();
      return;
    }
    if (specLocked && event.target.closest('#mx-spec-grid')) {
      event.preventDefault();
      return;
    }
    if(event.target.matches('[data-field]')&&event.target.tagName!=='SELECT'&&event.target.type!=='checkbox')assign(event.target);
    if(event.target.id==='mx-confirm-agreement')restoreButtons();
  }
  async function change(event){
    const el=event.target;
    const m = ui.editing;
    const locked = ['locked', 'archived'].includes(m?.status);
    const specLocked = locked || Boolean(m?.spec_locked);
    const matrixLocked = locked || Boolean(m?.matrix_locked);

    if (el.matches('.mx-spec-req-input')) {
      if (specLocked) {
        message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi chỉnh sửa.', true);
        return;
      }
      changed();
      return;
    }
    if (el.matches('.mx-spec-refs-input') || el.matches('.mx-spec-comp-input')) {
      if (specLocked) {
        message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi chỉnh sửa.', true);
        return;
      }
      changed();
      renderEditor();
      return;
    }
    if(el.matches('.mx-grid-input')){
      if (matrixLocked) {
        message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi chỉnh sửa.', true);
        return;
      }
      const lessonCode=el.dataset.lessonCode;
      const gridType=el.dataset.gridType;
      const val=Math.max(0,parseInt(el.value,10)||0);
      updateSlotsFromGrid(ui.editing,lessonCode,gridType,val);
      changed();renderEditor();
      const nextInput=qs('.mx-grid-input[data-lesson-code="' + lessonCode + '"][data-grid-type="' + gridType + '"]');
      if(nextInput){nextInput.focus();nextInput.select();}
      return;
    }
    if (matrixLocked && el.closest('#mx-grid')) {
      message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi chỉnh sửa.', true);
      return;
    }
    if (specLocked && el.closest('#mx-spec-grid')) {
      message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi chỉnh sửa.', true);
      return;
    }
    if(el.id==='mx-create-grade'){
      switchGradeContext(el.value,'create');
      if(typeof ui.ctx?.onGradeChange==='function'&&Number(el.value))ui.ctx.onGradeChange(Number(el.value));
      return;
    }
    if(el.id==='mx-import-grade'){
      const g=Number(el.value)||8;
      ui.createGrade=g;
      ui.importing={grade:g};
      renderImport();
      return;
    }
    if(el.matches('[data-field]')&&(el.tagName==='SELECT'||el.type==='checkbox')){assign(el);if(el.dataset.field.endsWith('.competency')||el.dataset.field.endsWith('.requirement_id'))renderEditor();}
    if(el.matches('[data-allow-kind],[data-yn-coef]'))assign(el);
    if(el.dataset.filter){
      ui.filter[el.dataset.filter]=el.value;
      if(el.dataset.filter==='grade'){
        if(el.value){
          switchGradeContext(el.value,'filter');
          if(typeof ui.ctx?.onGradeChange==='function'&&Number(el.value))ui.ctx.onGradeChange(Number(el.value));
          return;
        }
        if(typeof ui.ctx?.onGradeChange==='function')ui.ctx.onGradeChange('all');
      }
      render();
    }
    if(el.id==='mx-file')await readImport(el.files[0]);
    if(el.id==='mx-flexible-mode'&&ui.generation){ui.generation.flexibleMode=Boolean(el.checked);renderGeneration();return;}
    if(el.id==='mx-confirm-agreement'||el.dataset.field==='reconciliation.confirmed')restoreButtons();
    if(el.dataset.choice){const id=el.dataset.choice;ui.container.querySelectorAll('[data-review-slot]').forEach(c=>{if(c.dataset.reviewSlot===id)c.checked=false;});showChoice(id);coverage();}
    if(el.id==='mx-exam-revision')coverage();
    captureGeneration();
  }
  function switchGradeContext(rawGrade,source='create'){
    const g=Number(rawGrade)||0;
    if(g)ui.createGrade=g;
    if(source==='create'&&g){
      ui.filter.grade=String(g);
    }
    if(g){
      if(ui.previewState&&Number(ui.previewState.matrix?.grade)!==g){
        ui.previewState=null;
      }
      if(ui.comparison&&Number(ui.comparison.matrix?.grade)!==g){
        ui.comparison=null;
      }
      if(ui.generation&&Number(ui.generation.matrix?.grade)!==g){
        ui.generation=null;
      }
      if(ui.importing&&Number(ui.importing.grade)!==g){
        ui.importing={grade:g};
      }
      if(ui.editing&&Number(ui.editing.grade)!==g){
        const matching=filterRecords(ui.records,{...ui.filter,grade:String(g)});
        ui.editing=matching.length?null:newDraft(g,false);
        ui.report=null;
        ui.shortfall=null;
        ui.dirty=false;
      }else if(!ui.editing&&!ui.importing&&!ui.generation&&source==='create'){
        const matching=filterRecords(ui.records,{...ui.filter,grade:String(g)});
        if(!matching.length){
          ui.editing=newDraft(g,false);
          ui.report=null;
          ui.shortfall=null;
          ui.dirty=false;
        }
      }
    }
    render();
  }
  function guard(){
    if(ui.dirty){
      if(confirm('Bạn đang có thay đổi chưa lưu trên ma trận hiện tại. Bạn có muốn bỏ thay đổi để tiếp tục không?')){
        ui.dirty=false;
        return true;
      }
      return false;
    }
    return true;
  }
  function normalizeSlotNumbers(m){
    if(!m||typeof m!=='object'||m.status==='locked'||m.status==='archived')return false;
    let changedAny=false;
    if(!['authored','received'].includes(m.mode)){m.mode='authored';changedAny=true;}
    if(!['THCS','THPT','GENERAL'].includes(m.profile)){m.profile=Number(m.grade)>=10?'THPT':'THCS';changedAny=true;}
    if(!m.school_year||!String(m.school_year).trim()){m.school_year='2026-2027';changedAny=true;}
    if(!m.owner_name||!String(m.owner_name).trim()){m.owner_name='Giáo viên phụ trách';changedAny=true;}
    if(!m.campus||!String(m.campus).trim()){m.campus='Cao Thắng';changedAny=true;}
    if(!Array.isArray(m.indicator_catalog)){m.indicator_catalog=[];changedAny=true;}
    if(!m.reconciliation||typeof m.reconciliation!=='object'||Array.isArray(m.reconciliation)){m.reconciliation={confirmed:true,issues:[]};changedAny=true;}
    if(m.reconciliation.confirmed===undefined||m.reconciliation.confirmed===null){m.reconciliation.confirmed=true;changedAny=true;}
    if(!Array.isArray(m.reconciliation.issues)){m.reconciliation.issues=[];changedAny=true;}

    const isHighSchool = m.profile === 'THPT' || Number(m.grade) >= 10;
    const catLib = root.BankCompetencyCatalog;
    if(isHighSchool){
      if(!m.indicator_catalog.length){
        const preset = catLib && typeof catLib.presetCatalogForSubject === 'function' ? catLib.presetCatalogForSubject(m.subject_name || 'Tin học') : null;
        if(preset && Array.isArray(preset.indicators) && preset.indicators.length){
          m.competency_catalog = preset.competencies;
          m.indicator_catalog = preset.indicators;
          m.catalog_revision = 1;
          changedAny = true;
        } else {
          m.competency_catalog = [
            { code: 'NLa', name: 'Sử dụng và quản lí các phương tiện CNTT' },
            { code: 'NLb', name: 'Ứng xử phù hợp trong môi trường số' },
            { code: 'NLc', name: 'Giải quyết vấn đề với sự hỗ trợ của CNTT' },
            { code: 'NLd', name: 'Ứng dụng CNTT trong học và tự học' },
            { code: 'NLe', name: 'Hợp tác trong môi trường số' }
          ];
          m.indicator_catalog = [
            { code: 'NLa.1', competency: 'NLa', text: 'Nhận diện, phân biệt thiết bị và công nghệ.' },
            { code: 'NLb.1', competency: 'NLb', text: 'Ứng xử an toàn và hợp pháp trên mạng.' },
            { code: 'NLc.1', competency: 'NLc', text: 'Giải quyết vấn đề bằng tin học.' },
            { code: 'NLd.1', competency: 'NLd', text: 'Ứng dụng CNTT trong tự học.' },
            { code: 'NLe.1', competency: 'NLe', text: 'Hợp tác trong môi trường số.' }
          ];
          changedAny = true;
        }
      }
    }

    if(Array.isArray(m.requirements)){
      m.requirements.forEach((r,idx)=>{
        if(!r||typeof r!=='object')return;
        if(!r.id||!String(r.id).trim()){r.id='R'+(idx+1);changedAny=true;}
        const lv=String(r.level||'').trim();
        if(/nhận\s*biết|^biết$/i.test(lv)&&r.level!=='Biết'){r.level='Biết';changedAny=true;}
        else if(/thông\s*hiểu|^hiểu$/i.test(lv)&&r.level!=='Hiểu'){r.level='Hiểu';changedAny=true;}
        else if(/vận\s*dụng\s*cao|^vdc$/i.test(lv)&&r.level!=='Vận dụng cao'){r.level='Vận dụng cao';changedAny=true;}
        else if(/vận\s*dụng|^vd$/i.test(lv)&&!/cao/i.test(lv)&&r.level!=='Vận dụng'){r.level='Vận dụng';changedAny=true;}
        const pl=lessons(m.grade).find(x=>x.lesson_code===r.lesson_code);
        const outLen=Array.isArray(pl?.outcomes)&&pl.outcomes.length?pl.outcomes.length:1;
        if(!Number.isInteger(r.ppct_outcome_index)||r.ppct_outcome_index<0||r.ppct_outcome_index>=outLen){
          r.ppct_outcome_index=0;
          changedAny=true;
        }
      });
    }
    if(!Array.isArray(m.slots))return changedAny;

    const reqMap = new Map((m.requirements || []).filter(r => r && typeof r === 'object').map(r => [r.id, r]));
    const indByComp = {};
    if(Array.isArray(m.indicator_catalog)){
      m.indicator_catalog.forEach(ind => {
        if(ind && ind.code && ind.competency){
          (indByComp[ind.competency] || (indByComp[ind.competency] = [])).push(ind.code);
        }
      });
    }

    const groups={};
    m.slots.forEach((s,idx)=>{
      if(!s||typeof s!=='object')return;
      if(!s.id||!String(s.id).trim()){s.id='S'+(idx+1);changedAny=true;}
      if(!s.scoring||typeof s.scoring!=='object'||s.scoring.mode!=='sum_parts'){s.scoring={mode:'sum_parts'};changedAny=true;}
      if(Array.isArray(s.parts)){
        s.parts.forEach((p,pIdx)=>{
          if(!p||typeof p!=='object')return;
          if(!p.id||!String(p.id).trim()){p.id='P'+(idx+1)+(s.parts.length>1?String.fromCharCode(97+pIdx):'');changedAny=true;}
          if(isHighSchool){
            const req = reqMap.get(p.requirement_id);
            const targetComp = req?.competency || 'NLa';
            const candCodes = indByComp[targetComp] || indByComp['NLa'] || (m.indicator_catalog[0] ? [m.indicator_catalog[0].code] : ['NLa.1']);
            const curInd = typeof p.indicator === 'string' ? p.indicator.trim() : '';
            const isValid = curInd && m.indicator_catalog.some(i => i.code === curInd && i.competency === targetComp);
            if(!isValid){
              p.indicator = candCodes[0] || (m.indicator_catalog[0]?.code) || 'NLa.1';
              changedAny = true;
            }
          }
        });
      }
      (groups[s.kind]||(groups[s.kind]=[])).push(s);
    });
    Object.values(groups).forEach(list=>{
      const ordered=list.map((s,i)=>[s,i]).sort((a,b)=>(Number(a[0].number)||0)-(Number(b[0].number)||0)||a[1]-b[1]).map(x=>x[0]);
      ordered.forEach((s,i)=>{if(s.number!==i+1){s.number=i+1;changedAny=true;}});
    });
    return changedAny;
  }
  async function openRecord(id,discard=false){
    if(!discard&&!guard())return;
    const d=await ui.ctx.request('/api/matrices/'+encodeURIComponent(id));
    ui.editing=d.matrix;
    const hadSlotFix=normalizeSlotNumbers(ui.editing);
    const eng=root.BankStaticEngine||root.StaticExamEngine;
    if(ui.ctx?.ppct && eng){
      ui.report=eng.validateMatrix(ui.editing,ui.ctx.ppct);
      if(hadSlotFix)ui.dirty=true;else ui.dirty=false;
    } else if(hadSlotFix){
      ui.dirty=true;
      if(d.validation){
        const errs=(d.validation.errors||[]).filter(e=>e.code!=='number_sequence');
        ui.report={...d.validation,errors:errs,valid:errs.length===0};
      } else {
        ui.report=null;
      }
    } else {
      ui.report=d.validation;
      ui.dirty=false;
    }
    ui.importing=null;
    ui.generation=null;
    ui.previewState=null;
    ui.comparison=null;
    ui.shortfall=null;
    render();
    qs('#mx-work')?.scrollIntoView?.({behavior:'smooth',block:'start'});
  }
  async function save(silent=false){
    normalizeSlotNumbers(ui.editing);
    (ui.editing.requirements||[]).forEach(r=>{
      if(/^(Biết|Hiểu|Vận dụng|Vận dụng cao):\s*Yêu cầu cần đạt về/i.test(String(r.text||'').trim())){
        const pl=lessons(ui.editing.grade).find(l=>l.lesson_code===r.lesson_code);
        if(pl?.outcomes?.length){r.text=pl.outcomes.join('\n');r.ppct_outcome_index=0;}
      }
    });
    const result=await ui.ctx.request('/api/matrices/save',{matrix:ui.editing,expected_revision:ui.editing.revision,allow_custom_override:Boolean(ui.editing.allow_custom_override)});
    ui.editing=result.matrix;
    ui.report=result.validation;
    ui.dirty=false;
    await refresh();
    render();
    if(!silent)message('Đã lưu bản nháp ma trận thành công!');
  }
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
    const reqCountByKey = {};
    (m?.requirements || []).forEach(r => {
      const k = r.lesson_code + '|' + r.level;
      reqCountByKey[k] = (reqCountByKey[k] || 0) + 1;
    });
    (m?.requirements || []).forEach(r => {
      const k = r.lesson_code + '|' + r.level;
      const customRefs = r.custom_refs || (reqCountByKey[k] === 1 ? m?.custom_level_refs?.[k] : '');
      const comp = r.competency || m?.custom_level_comp?.[k] || 'NLa';
      requirements[r.id] = { ...r, competency: comp, refs: [], custom_refs: customRefs };
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

    const planCitation = (m.assessment_plan || (m.assessment_plan_id ? getAssessmentPlansForMatrix(m.grade, subject(m)).find(p => p.id === m.assessment_plan_id) : null));
    const citationHtml = planCitation ? `
      <p style="font-size:10pt;font-style:italic;margin:-10px 0 14px;text-align:center;color:#333;">
        (Căn cứ Kế hoạch kiểm tra, đánh giá định kỳ: ${E(planCitation.name || 'Kiểm tra định kỳ')} — Thời điểm: ${E(planCitation.week || '')} · Tiết PPCT: ${E(planCitation.period || '')} · Thời lượng: ${E(planCitation.duration || 45)} phút · Hình thức: ${E(planCitation.form || 'Viết/Máy tính')})
      </p>
    ` : '';

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
        <p class="mx-doc-subhead" style="font-size:11.5pt;font-weight:700;margin:0 0 ${planCitation ? '6px' : '16px'};text-align:center;">
          <strong>MÔN: ${E(subjUpper)} ${E(m.grade)} - THỜI GIAN LÀM BÀI: ${E(m.duration || 45)} PHÚT</strong>
        </p>
        ${citationHtml}
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
      out += `<p style="font-style:italic;margin:6px 0 24px;font-size:10.5pt;line-height:1.45;font-family:'Times New Roman',Times,serif;">
        <strong>* Lưu ý:</strong><br>
        - Các câu hỏi ở cấp độ nhận biết và thông hiểu là các câu hỏi trắc nghiệm khách quan 4 lựa chọn, trong đó có duy nhất 1 lựa chọn đúng. Số điểm tính cho 1 câu trắc nghiệm là 0,25 điểm/câu.<br>
        - Các câu hỏi ở cấp độ vận dụng là các câu hỏi tự luận. Số điểm tính cho 1 câu tự luận là 1 điểm/câu.
      </p>`;
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
              const customRefs = r.custom_refs || (rs.length === 1 ? m?.custom_level_refs?.[row.lesson_code + '|' + l] : '');
              const autoRefs = r.refs?.length ? r.refs.join(', ') : '';
              const finalRefs = customRefs || autoRefs;
              const refsText = finalRefs ? ` (${finalRefs})` : '';
              reqHtml += `<p style="margin:2px 0 3px 12px;text-indent:-8px;">– ${E(r.text.replace(/\s*\(c[aâ]u\s+[^)]+\)/i, ''))}<strong>${refsText}</strong>.</p>`;
            });
          });

          if (!reqHtml) reqHtml = `<p class="muted">Đạt yêu cầu chương trình GDPT 2018.</p>`;

          const cellMC = row.cells['MC|Biết'] || row.cells['MC|Hiểu'] || row.cells['MC|Vận dụng'] ?
            ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'].map(lvl => {
              const c = row.cells['MC|' + lvl];
              if (!c || !c.count) return '';
              const lvlAbbr = lvl === 'Biết' ? 'B' : lvl === 'Hiểu' ? 'H' : lvl === 'Vận dụng cao' ? 'VDC' : 'VD';
              const comp = (lessonReqs.find(r => r.level === lvl)?.competency) || m?.custom_level_comp?.[row.lesson_code + '|' + lvl] || 'NLa';
              return `${c.count} MC (${lvlAbbr}) (${E(comp)})`;
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
              if (!c || !c.count) return '';
              const comp = (lessonReqs.find(r => r.level === lvl)?.competency) || m?.custom_level_comp?.[row.lesson_code + '|' + lvl] || 'NLa';
              return `${c.count} ES (${E(comp)})`;
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

      const mcB = v.totals.by_level['Biết']?.by_kind?.MC?.items || v.rows.reduce((sum, r) => sum + (r.cells['MC|Biết']?.count || 0), 0);
      const mcH = v.totals.by_level['Hiểu']?.by_kind?.MC?.items || v.rows.reduce((sum, r) => sum + (r.cells['MC|Hiểu']?.count || 0), 0);
      const esVD = v.rows.reduce((sum, r) => sum + (r.cells['ES|Vận dụng']?.count || 0) + (r.cells['ES|Vận dụng cao']?.count || 0), 0);

      out += `<tr>
        <td colspan="4" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Tổng</strong></td>
        <td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${mcB ? mcB + ' câu B' : ''}${mcB && mcH ? '<br>' : ''}${mcH ? mcH + ' câu H' : ''}</strong></td>
        <td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${ynTot ? ynTot + ' câu' : '0'}</strong></td>
        <td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${shortTot ? shortTot + ' câu' : '0'}</strong></td>
        <td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>${esVD ? esVD + ' câu VD' : esTot + ' câu'}</strong></td>
      </tr>`;

      out += `<tr>
        <td colspan="4" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Tỉ lệ %</strong></td>
        <td colspan="4" style="border:1px solid #333;text-align:center;background:#fafafa;">
          <strong>${mcB ? mcB + ' câu B = ' + pctB + '%, ' : ''}${mcH ? mcH + ' câu H = ' + pctH + '%, ' : ''}${esVD ? esVD + ' câu VD = ' + pctVD + '%' : 'VD = ' + pctVD + '%'}</strong>
        </td>
      </tr>`;

      out += `<tr>
        <td colspan="4" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>Tỉ lệ chung</strong></td>
        <td colspan="3" style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>B + H = ${Number(pctB) + Number(pctH)}%</strong></td>
        <td style="border:1px solid #333;text-align:center;background:#fafafa;"><strong>VD = ${pctVD}%</strong></td>
      </tr>`;

      out += `</tbody></table>`;
      out += `<p style="font-style:italic;margin:6px 0 24px;font-size:10.5pt;line-height:1.45;font-family:'Times New Roman',Times,serif;">
        <strong>* Lưu ý:</strong><br>
        - Ở mức độ nhận biết và thông hiểu thì có thể ra câu hỏi ở một chỉ báo của mức độ kiến thức, kĩ năng cần kiểm tra, đánh giá tương ứng (một gạch đầu dòng thuộc mức độ đó).<br>
        - Ở mức độ vận dụng có thể xây dựng câu hỏi vào một trong các đơn vị kiến thức.
      </p>`;
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
          <td style="border:1px solid #333;text-align:center;">${E(c.competency || '—')}</td>
          <td style="border:1px solid #333;text-align:center;">${E(c.indicator || '—')}</td>
        </tr>`;
      });
      out += `</tbody></table>`;
      if(m.competency_catalog?.length){
        const names=new Map(m.competency_catalog.map(c=>[c.code,c.name]));
        out+=`<h3>Danh mục năng lực và chỉ báo của phiên bản</h3><table style="border-collapse:collapse;width:100%;table-layout:fixed"><thead><tr><th>Thành phần năng lực</th><th>Mã chỉ báo</th><th>Mô tả</th></tr></thead><tbody>${(m.indicator_catalog||[]).map(c=>`<tr><td style="border:1px solid #333">${E(c.competency)} · ${E(names.get(c.competency)||'')}</td><td style="border:1px solid #333">${E(c.code)}</td><td style="border:1px solid #333">${E(c.text)}</td></tr>`).join('')}</tbody></table>`;
      }
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
        margin: 1.0cm 1.5cm;
      }
      @page WordSection1 {
        size: 29.7cm 21.0cm;
        mso-page-orientation: landscape;
        margin: 1.0cm 1.5cm;
      }
      div.WordSection1 {
        page: WordSection1;
      }
      @media print {
        body { margin: 0; max-width: none; }
        tr { break-inside: avoid; }
      }
    `;
    const wordXml = '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->';
    return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="vi">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(m?.title || 'Ma trận & đặc tả')}</title>
  ${wordXml}
  <style>${css}</style>
</head>
<body>
  <div class="WordSection1">${bodyHtml}</div>
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
    const rawSubj = String(subject(m) || 'Tin học').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
    const subjCode = (rawSubj === 'TIN_HOC' || rawSubj === 'TIN') ? 'TIN' : (rawSubj || 'MON');
    const secName = section === 'matrix' ? 'MA_TRAN' : section === 'specification' ? 'DAC_TA' : section === 'competencies' ? 'NANG_LUC' : 'MA_TRAN_VA_DAC_TA';
    a.download = `${subjCode}_${m.grade}_${period}_${secName}.doc`;
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

  function openCustomMatrixExportDialog(m) {
    if (!m) return;
    const dlg = document.getElementById('custom-matrix-export-dialog');
    const container = document.getElementById('custom-matrix-export-content');
    if (!dlg || !container) return;

    const titleEl = document.getElementById('custom-matrix-export-title');
    if (titleEl) {
      titleEl.innerHTML = `Tùy biến xuất Ma trận &amp; Đặc tả: <span style="color:#4A3AA8">${E(m.title)}</span> (Khối ${m.grade} · ${m.exam_type || 'GK1'})`;
    }

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
        <div style="background:#F3F4F8;border:1px solid #D5D9E4;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <strong style="color:#4A3AA8;font-size:14px">${E(m.title || 'Ma trận đề kiểm tra')}</strong>
            <div style="font-size:12px;color:#5B6475;margin-top:2px">
              Khối ${E(m.grade)} · ${E(profileLabel(m.profile))} · Kỳ kiểm tra: <strong>${E(periods[m.exam_type] || m.exam_type || 'GK1')}</strong> · Phiên bản: <strong>V${E(m.version || 1)}</strong>
            </div>
          </div>
          <span class="badge ${m.status === 'locked' ? 'approved' : 'draft'}">
            ${m.status === 'locked' ? 'Đã chốt (Khóa)' : 'Bản nháp đang soạn'}
          </span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div style="background:#fff;border:1px solid #E4E7F0;border-radius:8px;padding:14px">
            <h4 style="margin:0 0 10px;color:#4A3AA8;font-size:13px;border-bottom:1px solid #F3F4F8;padding-bottom:6px">
              1. Thành phần bảng dữ liệu xuất (Tích chọn):
            </h4>
            <div style="display:flex;flex-direction:column;gap:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cmx-sec-matrix" checked>
                <span><strong>Bảng 1: Khung Ma trận 2D</strong> (Khổ A4 ngang, không tràn viền 15 cột)</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cmx-sec-spec" checked>
                <span><strong>Bảng 2: Bản đặc tả chi tiết</strong> (Khổ A4 ngang, chi tiết YCCĐ &amp; số câu)</span>
              </label>
              ${m.profile === 'THPT' ? `
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cmx-sec-comp">
                <span><strong>Bảng 3: Bảng chỉ báo &amp; Năng lực Tin học</strong> (Khung NLa-NLe)</span>
              </label>` : ''}
            </div>
          </div>

          <div style="background:#fff;border:1px solid #E4E7F0;border-radius:8px;padding:14px">
            <h4 style="margin:0 0 10px;color:#4A3AA8;font-size:13px;border-bottom:1px solid #F3F4F8;padding-bottom:6px">
              2. Phương thức ghép tệp &amp; Khổ giấy in:
            </h4>
            <div style="margin-bottom:10px">
              <label style="display:block;font-size:11px;font-weight:700;color:#5B6475;margin-bottom:4px">Ghép file xuất:</label>
              <div style="display:flex;flex-direction:column;gap:6px;font-size:12px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input type="radio" name="cmx_bundle_mode" value="single" checked>
                  <strong>01 tệp Word duy nhất</strong> (Khổ A4 ngang toàn bộ)
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input type="radio" name="cmx_bundle_mode" value="separate">
                  <strong>Tách riêng từng tệp</strong> (Tất cả đều theo khổ A4 ngang)
                </label>
              </div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="cmx-opt-school-header" checked>
              <span>Tiêu ngữ Trường Quốc tế Á Châu &amp; Năm học 2026-2027</span>
            </label>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E4E7F0;padding-top:14px;margin-top:6px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;gap:8px">
            <button type="button" class="button primary" id="btn-cmx-export-word" style="background:#4A3AA8;border-color:#4A3AA8;color:#fff;font-weight:700">
              Xuất tệp Word (.doc / .docx)
            </button>
            <button type="button" class="button" id="btn-cmx-export-json" style="font-weight:600">
              Gói dữ liệu JSON (.json)
            </button>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="button" id="btn-cmx-print" style="font-weight:600">
              Mở trang in / PDF
            </button>
            <button type="button" class="button quiet" data-close="custom-matrix-export-dialog">Đóng</button>
          </div>
        </div>
      </div>
    `;

    const exportBtn = document.getElementById('btn-cmx-export-word');
    if (exportBtn) {
      exportBtn.onclick = () => {
        const secMatrix = document.getElementById('cmx-sec-matrix')?.checked;
        const secSpec = document.getElementById('cmx-sec-spec')?.checked;
        const secComp = document.getElementById('cmx-sec-comp')?.checked;
        const isSep = document.querySelector('input[name="cmx_bundle_mode"]:checked')?.value === 'separate';

        if (isSep) {
          if (secMatrix) downloadMatrixWord(m, 'matrix');
          if (secSpec) setTimeout(() => downloadMatrixWord(m, 'specification'), 500);
          if (secComp) setTimeout(() => downloadMatrixWord(m, 'competencies'), 1000);
        } else {
          let section = 'all';
          if (secMatrix && !secSpec && !secComp) section = 'matrix';
          else if (!secMatrix && secSpec && !secComp) section = 'specification';
          else if (!secMatrix && !secSpec && secComp) section = 'competencies';
          downloadMatrixWord(m, section);
        }
      };
    }

    const jsonBtn = document.getElementById('btn-cmx-export-json');
    if (jsonBtn) jsonBtn.onclick = () => downloadMatrixJson(m);

    const printBtn = document.getElementById('btn-cmx-print');
    if (printBtn) printBtn.onclick = () => printMatrixDoc(m);

    dlg.showModal();
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
    const zoomPct=PREVIEW_ZOOMS.includes(ui.previewZoom)?ui.previewZoom:100;preview.dataset.zoom=String(zoomPct);
    preview.innerHTML=`<div class="mx-panel-head"><div><p class="eyebrow">XEM TOÀN BỘ MA TRẬN & BẢNG ĐẶC TẢ</p><h2>${E(m.title)} · Khối ${m.grade} (${E(profileLabel(m.profile))})</h2></div><div class="actions"><button type="button" data-action="compare-id" data-id="${E(st.id)}">Đối chiếu bản gốc (2 cột)</button>${ui.editing?.id!==st.id?`<button type="button" data-open="${E(st.id)}">Mở biên tập</button>`:''}<button type="button" class="quiet" data-action="close-preview">Đóng khung xem</button></div></div>`+
    `<div class="mx-panel-toolbar"><div class="actions"><button type="button" class="${st.section==='all'?'primary':''}" data-action="preview-sec" data-sec="all">Toàn bộ bảng</button><button type="button" class="${st.section==='matrix'?'primary':''}" data-action="preview-sec" data-sec="matrix">Bảng ma trận</button><button type="button" class="${st.section==='specification'?'primary':''}" data-action="preview-sec" data-sec="specification">Bảng đặc tả</button>${m.profile==='THPT'?`<button type="button" class="${st.section==='competencies'?'primary':''}" data-action="preview-sec" data-sec="competencies">Bảng năng lực</button>`:''}</div>`+
    `<div class="actions">${hasRaw?`<button type="button" class="${st.mode==='web'?'primary':''}" data-action="preview-mode" data-mode="web">Bản chuẩn hóa Web (đánh số câu)</button><button type="button" class="${st.mode==='raw'?'primary':''}" data-action="preview-mode" data-mode="raw">Bảng nguyên trạng từ Word</button>`:''}<button type="button" class="button" data-action="custom-matrix-export" style="background:#4A3AA8;color:#fff;border-color:#4A3AA8;font-weight:700">Tùy biến xuất hồ sơ</button><button type="button" class="button primary" data-action="download-preview-word">Tải Word (.doc)</button></div></div>`+
    (fmt?fmt.toolbarHtml(fmtKey,false):'')+
    (issues.length?`<div class="mx-errors"><strong>Cảnh báo nguồn cần xác minh (${issues.length} mục):</strong><ul>${issues.map(x=>`<li>${E(x.message)}</li>`).join('')}</ul></div>`:'')+
    `<div class="mx-zoom"><span>Cỡ hiển thị:</span><button type="button" class="quiet" data-action="preview-zoom" data-dir="-1" title="Thu nhỏ khung xem" aria-label="Thu nhỏ khung xem">A−</button><strong class="mx-zoom-val" aria-live="polite">${zoomPct}%</strong><button type="button" class="quiet" data-action="preview-zoom" data-dir="1" title="Phóng to khung xem" aria-label="Phóng to khung xem">A+</button><button type="button" class="quiet" data-action="preview-zoom" data-dir="0" title="Về 100%">Đặt lại</button><small>Chỉ đổi cỡ xem trên màn hình. Tệp Word/PDF vẫn giữ chuẩn: Times New Roman, lề trên/dưới 1,0 cm, khổ ngang.</small></div>`+
    `<div class="mx-sheet-body">${st.bodyHtml}</div>`;
    enhanceSheetTables(preview);
    const dlBtn=preview.querySelector('[data-action="download-preview-word"]');
    if(dlBtn)dlBtn.onclick=()=>downloadMatrixWord(m,st.section);
    const customMxBtn=preview.querySelector('[data-action="custom-matrix-export"]');
    if(customMxBtn)customMxBtn.onclick=()=>openCustomMatrixExportDialog(m);
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
    preview.innerHTML=`<div class="mx-panel-head"><div><p class="eyebrow">ĐỐI CHIẾU SONG SONG 2 CỘT · BẢN GỐC WORD & BẢN TRÊN WEB</p><h2>${E(m.title)} · Khối ${m.grade}</h2><p class="small muted">Tệp nguồn: <strong>${E(m.source?.name||'Hồ sơ biên soạn')}</strong> · Tổng: ${c.validation?.totals?.questions||m.slots?.length||0} câu mẹ (${c.validation?.totals?.items||(m.slots||[]).reduce((s,x)=>s+(x.parts?.length||0),0)} ý) · ${c.validation?.totals?.points||m.total_points||10} điểm</p></div><div class="actions"><button type="button" data-action="preview-id" data-id="${E(m.id)}">Xem toàn bộ (1 cột)</button>${ui.editing?.id!==m.id?`<button type="button" data-open="${E(m.id)}">Mở biên tập</button>`:''}<button type="button" class="quiet" data-action="close-preview">Đóng đối chiếu</button></div></div>`+
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
      ((root.DocFormatter||root.BankCore?.DocFormatter)?`<div style="padding:10px 14px 0;background:#F3F4F8">${(root.DocFormatter||root.BankCore?.DocFormatter).toolbarHtml(`matrix:${m.id}:all:web`,false)}</div>`:'')+
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
    const syncPlanBtn=event.target.closest('#mx-sync-plan-lessons');
    if(syncPlanBtn){
      event.preventDefault();
      const m=ui.editing;
      if(!m)return;
      const plans=getAssessmentPlansForMatrix(m.grade,subject(m));
      const plan=plans.find(p=>p.id===m.assessment_plan_id)||m.assessment_plan;
      if(!plan){message('Chưa chọn Kế hoạch KTĐG để đồng bộ.');return;}
      const allLs=selectableLessons(m.grade,m.exam_type);
      if(root.BankAssessmentPlan&&typeof root.BankAssessmentPlan.syncLessonsFromAssessmentPlan==='function'){
        root.BankAssessmentPlan.syncLessonsFromAssessmentPlan(m,plan,allLs);
        changed();renderEditor();
        message(`Đã đồng bộ ${(plan.scope_lessons||[]).length} bài học từ KHKTĐG "${plan.name}" vào ma trận!`);
      }
      return;
    }
    const scroll=event.target.closest('[data-scroll]');if(scroll){qs('#'+scroll.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    const open=event.target.closest('[data-open]');if(open){await run(()=>openRecord(open.dataset.open));return;}
    const b=event.target.closest('[data-action]');if(!b)return;event.preventDefault();const action=b.dataset.action;
    if(action==='close-preview'){ui.comparison=null;ui.previewState=null;const p=qs('#mx-preview');if(p)p.hidden=true;return;}
    if(action==='preview-zoom'){
      const p=qs('#mx-preview'),cur=PREVIEW_ZOOMS.includes(ui.previewZoom)?ui.previewZoom:100,dir=Number(b.dataset.dir);
      const next=dir===0?100:PREVIEW_ZOOMS[Math.max(0,Math.min(PREVIEW_ZOOMS.length-1,PREVIEW_ZOOMS.indexOf(cur)+dir))];
      ui.previewZoom=next;
      if(p){p.dataset.zoom=String(next);const v=p.querySelector('.mx-zoom-val');if(v)v.textContent=next+'%';}
      return;
    }
    if(action==='cmp-left'&&ui.comparison){ui.comparison.leftMode=b.dataset.left;renderComparisonBox(false);return;}
    if(action==='cmp-zoom'&&ui.comparison){ui.comparison.zoom=!ui.comparison.zoom;renderComparisonBox(false);return;}
    if(action==='preview-sec'&&ui.previewState){await run(()=>openPreview(ui.previewState.id,b.dataset.sec,ui.previewState.mode));return;}
    if(action==='preview-mode'&&ui.previewState){await run(()=>openPreview(ui.previewState.id,ui.previewState.section,b.dataset.mode));return;}
    if(action==='preview-id'){await run(()=>openPreview(b.dataset.id,'all','web'));return;}
    if(action==='compare-id'){await run(()=>openComparison(b.dataset.id));return;}
    if(action==='new'){
      if(!guard())return;
      const g=Number(b.dataset.grade||qs('#mx-create-grade')?.value||ui.createGrade||ui.filter.grade)||8;
      ui.createGrade=g;
      ui.filter.grade=String(g);
      ui.editing=newDraft(g,false);
      ui.report=null;
      ui.shortfall=null;
      ui.importing=null;
      ui.generation=null;
      ui.previewState=null;
      ui.comparison=null;
      ui.dirty=false;
      render();
      qs('#mx-work')?.scrollIntoView?.({behavior:'smooth',block:'start'});
      message('Đã mở tạo ma trận mới cho Khối ' + g + '. Bạn có thể nhập số câu trực tiếp vào bảng 2D hoặc bấm "Nạp mẫu chuẩn Á Châu (10.0đ)".');
      return;
    }
    if(action==='import'){
      if(!guard())return;
      ui.editing=null;
      ui.generation=null;
      ui.report=null;
      ui.shortfall=null;
      ui.previewState=null;
      ui.comparison=null;
      const g=Number(qs('#mx-create-grade')?.value||ui.createGrade||ui.filter.grade)||8;
      ui.createGrade=g;
      ui.importing={grade:g};
      render();
      qs('#mx-work')?.scrollIntoView?.({behavior:'smooth',block:'start'});
      return;
    }
    if(action==='discard'){await run(async()=>{if(ui.dirty&&ui.editing.id)await openRecord(ui.editing.id,true);else{ui.editing=null;ui.dirty=false;render();}});return;}
    const isGloballyLocked = ['locked', 'archived'].includes(ui.editing?.status);
    const isMatrixLocked = isGloballyLocked || Boolean(ui.editing?.matrix_locked);
    const isSpecLocked = isGloballyLocked || Boolean(ui.editing?.spec_locked);
    if(action==='apply-preset'&&ui.editing){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
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
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
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
      sortLessonsByPpct(ui.editing);
      changed();renderEditor();
      message('Đã đồng bộ và sắp xếp ' + added + ' bài học từ Phân phối chương trình Khối ' + g + '!');
      return;
    }
    if(action==='sort-lessons-ppct'&&ui.editing){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
      sortLessonsByPpct(ui.editing);
      changed();renderEditor();
      message('Đã sắp xếp lại các bài học theo đúng thứ tự PPCT (B1, B2, B3...)!');
      return;
    }
    if(action==='move-lesson-up'&&ui.editing){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
      const idx=Number(b.dataset.index);
      if(idx>0&&idx<ui.editing.lessons.length){
        const tmp=ui.editing.lessons[idx-1];
        ui.editing.lessons[idx-1]=ui.editing.lessons[idx];
        ui.editing.lessons[idx]=tmp;
        renumberAllSlots(ui.editing);
        changed();renderEditor();
      }
      return;
    }
    if(action==='move-lesson-down'&&ui.editing){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
      const idx=Number(b.dataset.index);
      if(idx>=0&&idx<ui.editing.lessons.length-1){
        const tmp=ui.editing.lessons[idx+1];
        ui.editing.lessons[idx+1]=ui.editing.lessons[idx];
        ui.editing.lessons[idx]=tmp;
        renumberAllSlots(ui.editing);
        changed();renderEditor();
      }
      return;
    }
    if(action==='clear-slots'&&ui.editing){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
      if(!confirm('Bạn có chắc chắn muốn làm trống toàn bộ bài học và câu hỏi phân bố trong ma trận để tự thiết lập lại từ đầu?'))return;
      ui.editing.lessons=[];
      ui.editing.requirements=[];
      ui.editing.slots=[];
      changed();renderEditor();
      message('Đã làm trống toàn bộ bài học và câu hỏi phân bố trong ma trận.');
      return;
    }
    if(action==='grid-add-lesson'&&ui.editing){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
      const code=qs('#mx-grid-add-lesson')?.value;
      const l=lessons(ui.editing.grade).find(x=>x.lesson_code===code);
      if(!l){message('Vui lòng chọn bài học từ danh sách PPCT.',true);return;}
      if(!ui.editing.lessons.some(x=>x.lesson_code===l.lesson_code)){
        ui.editing.lessons.push({lesson_code:l.lesson_code,title:l.lesson_name_source||l.lesson_code,topic:l.topic_source||''});
        sortLessonsByPpct(ui.editing);
      }
      changed();renderEditor();
      message('Đã thêm bài "' + (l.lesson_name_source||l.lesson_code) + '" vào đúng thứ tự trong bảng ma trận.');
      return;
    }
    if(action==='grid-add-custom-lesson'&&ui.editing){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
      const nextNum=(ui.editing.lessons?.length||0)+1;
      const defaultCode='B'+nextNum;
      const title=prompt('Nhập tên bài học / nội dung kiểm tra:', 'Bài ' + nextNum);
      if(!title||!title.trim())return;
      const topic=prompt('Nhập tên Chủ đề (tùy chọn):', 'Chủ đề ' + nextNum)||'';
      let code=defaultCode;
      while((ui.editing.lessons||[]).some(x=>x.lesson_code===code)){
        code='B'+Math.floor(Math.random()*900+100);
      }
      ui.editing.lessons.push({lesson_code:code,title:title.trim(),topic:topic.trim()});
      changed();renderEditor();
      message('Đã thêm bài "' + title.trim() + '" vào bảng ma trận.');
      return;
    }
    if(action==='unlock-custom'&&ui.editing){
      ui.editing.allow_custom_override=true;
      ui.editing.matrix_locked=false;
      ui.editing.spec_locked=false;
      ui.editing.status='draft';
      changed();renderEditor();
      message('Đã bật chế độ sửa toàn diện. Bạn có thể thêm/sửa/xóa bài học, YCCĐ và phân bố câu hỏi rồi bấm Lưu bản nháp.');
      return;
    }
    if(action==='split-all-question-reqs'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const total=splitQuestionRequirements(ui.editing);
      changed();renderEditor();
      message(total>0 ? ('Đã tách thành ' + total + ' dòng mục tiêu đánh giá riêng biệt cho từng câu hỏi!') : 'Các câu hỏi trong bảng đặc tả đã được tách riêng theo từng mục tiêu.');
      return;
    }
    if(action==='split-lesson-question-reqs'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const code=b.dataset.lessonCode;
      const total=splitQuestionRequirements(ui.editing,code);
      changed();renderEditor();
      message(total>0 ? ('Đã tách riêng ' + total + ' mục tiêu câu hỏi cho bài ' + code + '!') : ('Các câu hỏi của bài ' + code + ' đã ở trạng thái tách riêng từng mục tiêu.'));
      return;
    }
    if(action==='split-level-question-reqs'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const code=b.dataset.lessonCode;
      const level=b.dataset.level;
      const total=splitQuestionRequirements(ui.editing,code,level);
      changed();renderEditor();
      message('Đã tách thành ' + total + ' mục tiêu riêng cho từng câu hỏi mức ' + level + ' của bài ' + code + '!');
      return;
    }
    if(action==='merge-all-question-reqs'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const total=mergeQuestionRequirements(ui.editing);
      changed();renderEditor();
      message(total>0 ? (`Đã gộp ${total} mục tiêu thừa, gom các câu có chung YCCĐ vào cùng mục tiêu gọn gàng!`) : 'Các câu hỏi có chung YCCĐ đã ở trạng thái gom gọn gàng.');
      return;
    }
    if(action==='merge-lesson-question-reqs'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const code=b.dataset.lessonCode;
      const total=mergeQuestionRequirements(ui.editing,code);
      changed();renderEditor();
      message(total>0 ? (`Đã gom các câu cùng YCCĐ của bài ${code} vào mục tiêu chung!`) : (`Các câu hỏi của bài ${code} đã ở trạng thái gom gọn gàng.`));
      return;
    }
    if(action==='merge-level-question-reqs'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const code=b.dataset.lessonCode;
      const level=b.dataset.level;
      const total=mergeQuestionRequirements(ui.editing,code,level);
      changed();renderEditor();
      message(`Đã gom các câu mức ${level} của bài ${code} vào 1 mục tiêu chung!`);
      return;
    }
    if(action==='auto-fill-all-ppct-reqs'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      let count=0;
      (ui.editing.lessons||[]).forEach(l=>{
        fillLessonPpctRequirements(ui.editing,l.lesson_code);
        count++;
      });
      changed();renderEditor();
      message('Đã tự động điền YCCĐ từ PPCT cho toàn bộ ' + count + ' bài học trong ma trận!');
      return;
    }
    if(action==='fill-lesson-ppct-reqs'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const code=b.dataset.lessonCode;
      fillLessonPpctRequirements(ui.editing,code);
      changed();renderEditor();
      message('Đã nạp YCCĐ từ PPCT cho bài ' + code + '!');
      return;
    }
    if(action==='add-spec-req'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const code=b.dataset.lessonCode;
      const level=b.dataset.level||'Biết';
      const pl=lessons(ui.editing.grade).find(x=>x.lesson_code===code);
      const defaultText=pl?.outcomes?.[0]||'';
      const newReq={
        id:uid('R'),
        lesson_code:code,
        level:level,
        text:defaultText,
        ppct_outcome_index:0,
        competency:competencies()[0]||'NLa',
        choice_group:null
      };
      const sameGroupIds=new Set((ui.editing.requirements||[]).filter(r=>r.lesson_code===code&&r.level===level).map(r=>r.id));
      ui.editing.requirements.push(newReq);
      const sharedSlots=(ui.editing.slots||[]).filter(s=>sameGroupIds.has(s.parts?.[0]?.requirement_id));
      if(sharedSlots.length>1){
        const lastSlot=sharedSlots[sharedSlots.length-1];
        (lastSlot.parts||[]).forEach(p=>{p.requirement_id=newReq.id;});
      }
      changed();renderEditor();
      return;
    }
    if(action==='remove-spec-req'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const reqId=b.dataset.reqId;
      const idx=(ui.editing.requirements||[]).findIndex(r=>r.id===reqId);
      if(idx!==-1){
        const removed=ui.editing.requirements[idx];
        ui.editing.requirements.splice(idx,1);
        const fallback=(ui.editing.requirements||[]).find(r=>r.lesson_code===removed.lesson_code&&r.level===removed.level)
          ||(ui.editing.requirements||[]).find(r=>r.lesson_code===removed.lesson_code);
        (ui.editing.slots||[]).forEach(s=>{
          (s.parts||[]).forEach(p=>{
            if(p.requirement_id===reqId)p.requirement_id=fallback?fallback.id:'';
          });
        });
        if(fallback&&fallback.text){
          fallback.text = fallback.text.replace(/\s*\(Mục tiêu\s+Câu[^)]*\)/gi, '').trim();
        }
        if(ui.editing.custom_level_refs){
          delete ui.editing.custom_level_refs[removed.lesson_code+'|'+removed.level];
        }
        changed();renderEditor();
      }
      return;
    }
    if(action==='reset-spec-refs'&&ui.editing){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const reqId=b.dataset.reqId;
      const lessonCode=b.dataset.lessonCode;
      const level=b.dataset.level;
      if(reqId){
        const targetReq=(ui.editing.requirements||[]).find(r=>r.id===reqId);
        if(targetReq)delete targetReq.custom_refs;
      }
      if(ui.editing.custom_level_refs){
        delete ui.editing.custom_level_refs[lessonCode+'|'+level];
      }
      if(!reqId){
        (ui.editing.requirements||[]).filter(r=>r.lesson_code===lessonCode&&r.level===level).forEach(r=>{
          delete r.custom_refs;
        });
      }
      changed();renderEditor();
      message('Đã khôi phục số thứ tự câu tự động theo ma trận cho mức ' + level + ' của bài ' + lessonCode + '.');
      return;
    }
    if(action==='add-lesson'){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
      const l=lessons(ui.editing.grade).find(x=>x.lesson_code===qs('#mx-add-lesson')?.value);if(!l)return;
      if(!ui.editing.lessons.some(x=>x.lesson_code===l.lesson_code)){
        ui.editing.lessons.push({lesson_code:l.lesson_code,title:l.lesson_name_source,topic:l.topic_source});
        sortLessonsByPpct(ui.editing);
      }
      changed();renderEditor();return;
    }
    if(action==='remove-lesson'){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
      const idx=Number(b.dataset.index),l=ui.editing.lessons[idx];if(!l)return;
      const removedReqIds=new Set(ui.editing.requirements.filter(r=>r.lesson_code===l.lesson_code).map(r=>r.id));
      ui.editing.lessons.splice(idx,1);
      ui.editing.requirements=ui.editing.requirements.filter(r=>r.lesson_code!==l.lesson_code);
      ui.editing.slots=(ui.editing.slots||[]).filter(s=>!removedReqIds.has(s.parts?.[0]?.requirement_id));
      renumberAllSlots(ui.editing);
      changed();renderEditor();return;
    }
    if(action==='add-requirement'){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const l=ui.editing.lessons[Number(b.dataset.index)];ui.editing.requirements.push({id:uid('R'),lesson_code:l.lesson_code,level:'Biết',text:'',ppct_outcome_index:null,competency:competencies()[0],choice_group:null});changed();renderEditor();return;
    }
    if(action==='remove-requirement'){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      const idx=Number(b.dataset.index),r=ui.editing.requirements[idx];if(!r)return;
      ui.editing.requirements.splice(idx,1);
      ui.editing.slots.forEach(s=>s.parts.forEach(p=>{if(p.requirement_id===r.id)p.requirement_id='';}));
      changed();renderEditor();return;
    }
    if(action==='add-indicator'){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      ui.editing.indicator_catalog.push({code:'',competency:competencies()[0],text:''});changed();renderEditor();return;
    }
    if(action==='remove-indicator'){
      if(isSpecLocked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
      ui.editing.indicator_catalog.splice(Number(b.dataset.index),1);changed();renderEditor();return;
    }
    if(action==='add-slots'){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
      const m=ui.editing,kind=qs('#mx-bulk-kind').value,rid=qs('#mx-bulk-req').value,count=Number(qs('#mx-bulk-count').value),parts=kind==='YN'?4:kind==='ES'?Number(qs('#mx-bulk-parts').value):1,points=Number(qs('#mx-bulk-points').value);
      if(!rid||!Number.isInteger(count)||count<1||count>100||!Number.isInteger(parts)||parts<1||parts>10||!Number.isFinite(points)||points<=0){message('Chọn YCCĐ, số câu/ý và điểm hợp lệ trước khi thêm.',true);return;}
      for(let i=0;i<count;i++)m.slots.push({id:uid('S'),kind,number:0,scoring:{mode:'sum_parts'},parts:Array.from({length:parts},(_,j)=>({id:uid('P'),label:parts===1?'':String.fromCharCode(97+j),requirement_id:rid,points,indicator:''}))});
      renumberAllSlots(m);
      changed();renderEditor();return;
    }
    if(action==='remove-slot'){
      if(isMatrixLocked){message('Bảng ma trận 2D đã chốt. Hãy bấm "Mở khóa sửa ma trận" trước khi thay đổi.',true);return;}
      ui.editing.slots.splice(Number(b.dataset.index),1);
      renumberAllSlots(ui.editing);
      changed();renderEditor();return;
    }
    await run(async()=>{
      if(action==='save')await save();
      else if(action==='lock-matrix'){
        normalizeSlotNumbers(ui.editing);
        ui.editing.matrix_locked = true;
        await save(true);
        message('Đã lưu & chốt Bảng ma trận 2D! Số câu và danh sách bài học đã được cố định.');
      }
      else if(action==='unlock-matrix'){
        if(ui.editing.status === 'locked'){
          const result=await ui.ctx.request('/api/matrices/unlock',{id:ui.editing.id});
          ui.editing=result.matrix;ui.report=result.validation;ui.dirty=false;await refresh();render();
          message('Đã mở khóa phiên bản về trạng thái Bản nháp.');
          return;
        }
        ui.editing.matrix_locked = false;
        await save(true);
        message('Đã mở khóa Bảng ma trận 2D để chỉnh sửa.');
      }
      else if(action==='lock-spec'){
        normalizeSlotNumbers(ui.editing);
        ui.editing.spec_locked = true;
        await save(true);
        message('Đã lưu & chốt Bảng đặc tả! Toàn bộ Yêu cầu cần đạt đã được cố định.');
      }
      else if(action==='unlock-spec'){
        if(ui.editing.status === 'locked'){
          const result=await ui.ctx.request('/api/matrices/unlock',{id:ui.editing.id});
          ui.editing=result.matrix;ui.report=result.validation;ui.dirty=false;await refresh();render();
          message('Đã mở khóa phiên bản về trạng thái Bản nháp.');
          return;
        }
        ui.editing.spec_locked = false;
        await save(true);
        message('Đã mở khóa Bảng đặc tả để chỉnh sửa.');
      }
      else if(action==='save-and-lock'){
        normalizeSlotNumbers(ui.editing);
        await save(true);
        const confirmation={
          confirmed_by:qs('#mx-confirm-name')?.value||ui.editing.owner_name||'Trần Gia Huy',
          confirmed_at:qs('#mx-confirm-date')?.value||new Date().toLocaleDateString('sv-SE'),
          basis:qs('#mx-confirm-basis')?.value||'Đã thống nhất ma trận và đặc tả',
          external_agreement:true
        };
        const result=await ui.ctx.request('/api/matrices/lock',{id:ui.editing.id,expected_revision:ui.editing.revision,confirmation});
        ui.editing=result.matrix;
        ui.report=result.validation;
        ui.dirty=false;
        await refresh();
        render();
        await openPreview(ui.editing.id,'all','web');
        message('Đã lưu và chốt (khóa) phiên bản ma trận thành công! Bạn có thể xuất Word hoặc dùng tạo đề kiểm tra ngay.');
      }
      else if(action==='quick-export-doc'){
        if(!ui.editing.id||ui.dirty)await save(true);
        downloadMatrixWord(ui.editing,'all');
      }
      else if(action==='shortfall'){
        if(!ui.editing.id||ui.dirty)await save(true);
        ui.shortfall=await ui.ctx.request('/api/matrices/'+encodeURIComponent(ui.editing.id)+'/shortfall');
        renderShortfall();
        restoreButtons();
      }
      else if(action==='review'){
        if(!ui.editing.id||ui.dirty)await save(true);
        ui.report=(await ui.ctx.request('/api/matrices/review',{id:ui.editing.id})).validation;
        renderReport();
        restoreButtons();
      }
      else if(action==='preview'){
        if(!ui.editing.id||ui.dirty)await save(true);
        await openPreview(ui.editing.id,'all','web');
      }
      else if(action==='compare'){
        if(!ui.editing.id||ui.dirty)await save(true);
        await openComparison(ui.editing.id);
      }
      else if(action==='duplicate-id'){
        const id=b.dataset.id||ui.editing?.id;if(!id)return;
        const result=await ui.ctx.request('/api/matrices/duplicate',{id});
        ui.editing={...result.matrix,allow_custom_override:true};ui.report=result.validation;ui.dirty=false;await refresh();render();
        message('Đã nhân bản hồ sơ ma trận sang bản nháp mới.');
      }else if(action==='delete-id'){
        const id=b.dataset.id||ui.editing?.id;if(!id)return;
        const target=ui.records.find(x=>x.id===id)||(ui.editing?.id===id?ui.editing:null);
        const label=target?.title||'Ma trận này';
        if(typeof window!=='undefined'&&window.confirm&&!window.confirm(`Xóa vĩnh viễn hồ sơ ma trận "${label}"?`))return;
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
        if(normalizeSlotNumbers(ui.editing))ui.dirty=true;
        if(!ui.editing.id||ui.dirty)await save(true);
        const confirmation={
          confirmed_by:qs('#mx-confirm-name')?.value||ui.editing.owner_name||'Trần Gia Huy',
          confirmed_at:qs('#mx-confirm-date')?.value||new Date().toLocaleDateString('sv-SE'),
          basis:qs('#mx-confirm-basis')?.value||'Đã thống nhất ma trận và đặc tả',
          external_agreement:true
        };
        const result=await ui.ctx.request('/api/matrices/lock',{id:ui.editing.id,expected_revision:ui.editing.revision,confirmation});ui.editing=result.matrix;ui.report=result.validation;ui.dirty=false;await refresh();render();message('Đã khóa phiên bản. Đề tạo sau này sẽ lưu dấu phiên bản ma trận này.');
      }else if(action==='new-version'){
        const result=await ui.ctx.request('/api/matrices/new-version',{id:ui.editing.id});ui.editing=result.matrix;ui.report=result.validation;ui.dirty=false;await refresh();render();
      }else if(action==='archive'){
        const result=await ui.ctx.request('/api/matrices/archive',{id:ui.editing.id,expected_revision:ui.editing.revision,reason:qs('#mx-archive-reason').value});ui.editing=result.matrix;ui.report=result.validation;await refresh();render();message('Đã lưu trữ; các đề cũ vẫn giữ phiên bản đã dùng.');
      }else if(action==='accept-import'){
        const i=ui.importing;const result=i.package?await ui.ctx.request('/api/matrices/import-package',{package:i.package}):await ui.ctx.request('/api/matrices/accept-import',{filename:i.filename,grade:i.grade,content_base64:i.base64});
        ui.editing=result.matrix;ui.report=result.validation;ui.importing=null;ui.dirty=false;await refresh();render();message('Đã nhận bản nguồn. Hãy đối chiếu PPCT, vị trí câu và các điểm còn thiếu trước khi khóa.');
        await openPreview(ui.editing.id, 'all', 'web');
      }else if(action==='use'){
        if(typeof ui.ctx?.onOpenInExamCreator==='function'){
          const chosen=ui.editing;
          await refresh();
          ui.editing=null;ui.dirty=false;
          ui.ctx.onOpenInExamCreator(chosen);
          return;
        }
        const data=await ui.ctx.request('/api/matrices/'+encodeURIComponent(ui.editing.id)+'/candidates');
        data.flexibleMode=Boolean(data.bank_diagnostics&&data.bank_diagnostics.strict_empty_slots>0&&data.bank_diagnostics.flexible_empty_slots<data.bank_diagnostics.strict_empty_slots);
        ui.generation=data;ui.editing=null;ui.dirty=false;render();
      }else if(action==='create-exam-from-matrix'){
        if(!ui.editing)return;
        if(normalizeSlotNumbers(ui.editing))ui.dirty=true;
        if(!ui.editing.id||ui.dirty)await save(false);
        if(ui.editing.status!=='locked'){
          const confirmation={
            confirmed_by:qs('#mx-confirm-name')?.value||ui.editing.owner_name||'Trần Gia Huy',
            confirmed_at:qs('#mx-confirm-date')?.value||new Date().toLocaleDateString('sv-SE'),
            basis:qs('#mx-confirm-basis')?.value||'Khóa để tạo đề thi từ Ma trận 2D',
            external_agreement:true
          };
          try{
            const lockRes=await ui.ctx.request('/api/matrices/lock',{id:ui.editing.id,expected_revision:ui.editing.revision,confirmation});
            ui.editing=lockRes.matrix;
          }catch(err){
            if(typeof ui.ctx?.onOpenInExamCreator==='function')throw err;
          }
        }
        if(typeof ui.ctx?.onOpenInExamCreator==='function'){
          const chosen=ui.editing;
          await refresh();
          ui.editing=null;ui.dirty=false;
          ui.ctx.onOpenInExamCreator(chosen);
          return;
        }
        try{
          ui.editingMatrixBackup=ui.editing;
          const data=await ui.ctx.request('/api/matrices/'+encodeURIComponent(ui.editing.id)+'/candidates');
          data.flexibleMode=Boolean(data.bank_diagnostics&&data.bank_diagnostics.strict_empty_slots>0&&data.bank_diagnostics.flexible_empty_slots<data.bank_diagnostics.strict_empty_slots);
          ui.generation=data;ui.editing=null;ui.dirty=false;render();
          message('Đã nạp khung đề thi từ Ma trận 2D! Thầy/Cô có thể bấm "Tự động chọn câu & Tạo đề ngay" hoặc chọn câu từng vị trí.');
        }catch(err){
          message('Chưa thể nạp câu hỏi cho ma trận này: '+err.message,true);
        }
      }else if(action==='quick-generate-exam'){
        if(ui.generating)return;
        const pick=suggest({autoCheck:true,silent:true});
        if(pick.missing.length>0){
          message(`Chưa đủ câu hỏi đã duyệt trong ngân hàng cho ${pick.missing.length} vị trí: ${pick.missing.slice(0,5).join(', ')}${pick.missing.length>5?'…':''}. Vui lòng duyệt thêm câu ở mục "Duyệt câu hỏi" hoặc bổ sung ngân hàng.`,true);
          return;
        }
        await generate();
      }else if(action==='apply-exam-to-spec'){
        const examId=b.dataset.examId;
        const ex=(ui.ctx?.exams||[]).find(x=>x.id===examId)||ui.lastCreatedExam;
        const targetMatrix=ui.editingMatrixBackup||(ui.generation&&ui.generation.matrix)||ui.editing;
        if(ex&&targetMatrix){
          syncSpecFromExam(targetMatrix,ex);
          ui.editing=targetMatrix;ui.generation=null;ui.dirty=true;render();
          message(`Đã trích xuất Bảng 2 Đặc tả thành công từ ${ex.questions.length} câu hỏi của đề "${ex.title||ex.exam_code||ex.id}". Thầy/Cô có thể xem và chỉnh sửa ở Bảng 2 phía dưới.`);
          setTimeout(()=>{
            const el=document.getElementById('mx-spec-table-container');
            if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
          },100);
        }
      }else if(action==='sync-spec-from-selected-exam'){
        const sel=qs('#mx-sync-exam-select');
        const examId=sel?sel.value:'';
        const ex=(ui.ctx?.exams||[]).find(x=>x.id===examId)||(ui.ctx?.exams||[]).find(x=>Number(x.grade)===Number(ui.editing.grade));
        if(!ex){
          message('Chưa có đề thi nào được chọn hoặc chưa có đề thi đã lưu cho khối này. Thầy/Cô có thể bấm "Tạo đề thi ngay từ Ma trận 2D này" ở Bảng 1 trước.',true);
          return;
        }
        if(ui.editing.spec_locked){message('Bảng đặc tả đã chốt. Hãy bấm "Mở khóa sửa đặc tả" trước khi thay đổi.',true);return;}
        syncSpecFromExam(ui.editing,ex);
        ui.dirty=true;
        render();
        message(`Đã trích xuất Bảng 2 Đặc tả thành công từ ${ex.questions.length} câu hỏi của đề "${ex.title||ex.exam_code||ex.id}".`);
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

    const mObj = {
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
    };
    renumberAllSlots(mObj);

    return {
      format: 'asian-school-matrix',
      schema_version: 1,
      matrix: mObj
    };
  }

  // Mẫu ma trận được soạn cho Tin học; với môn khác giữ nguyên cấu trúc, số câu, điểm và thay nội dung Tin học bằng ô cần điền.
  const isTinSubjectName=()=>String(subject()||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().trim()==='tin hoc';
  const sampleFileSubject=()=>String(subject()||'Mon').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');
  function adaptSampleToSubject(m, g) {
    if (!m || isTinSubjectName()) return m;
    const L = `${subject()} lớp ${g}`;
    m.subject_name = subject();
    m.title = `Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn ${subject()} Khối ${g}`;
    m.owner_name = defaultOwner();
    (m.lessons || []).forEach(l => { l.title = `[Tên bài ${l.lesson_code} – ${L}]`; l.topic = `[Chủ đề của ${l.lesson_code} – ${L}]`; });
    (m.requirements || []).forEach(r => { r.text = `[Yêu cầu cần đạt mức ${r.level} của ${r.lesson_code} – ${L}]`; });
    m.indicator_catalog = [];
    (m.slots || []).forEach(sl => (sl.parts || []).forEach(p => { p.indicator = ''; }));
    return m;
  }
  function adaptSampleMarkdownToSubject(md, g) {
    if (isTinSubjectName()) return md;
    const L = `${subject()} lớp ${g}`;
    return md
      .replace(/Môn: Tin học/g, `Môn: ${subject()}`)
      .replace(/^## Chủ đề ([^:]+):.*$/gm, (_, k) => `## Chủ đề ${k}: [Tên chủ đề – ${L}]`)
      .replace(/^### Bài (\d+):.*\(Mã: (B\d+)\)\s*$/gm, (_, n, code) => `### Bài ${n}: [Tên bài ${n} – ${L}] (Mã: ${code})`)
      .replace(/^- \[([^\]]+)\] \[([A-Z]+)\] [^(]*\(/gm, (_, lv, kind) => `- [${lv}] [${kind}] [Yêu cầu cần đạt mức ${lv} – ${L}] (`);
  }
  function downloadMatrixExcelSample(grade = 9) {
    const g = Number(grade) || 9;
    if (typeof TableFileHelper !== 'undefined') {
      const rows = TableFileHelper.getSampleMatrixRows(g, subject());
      TableFileHelper.downloadCsv(rows, `Mau_Ma_tran_Dac_ta_Excel_${g}_2026-2027.csv`);
    } else {
      message('Bộ công cụ bảng tính đang nạp, vui lòng thử lại sau giây lát.', true);
    }
  }

  function downloadMatrixJsonSample(grade = 9) {
    const g = Number(grade) || 9;
    const isHigh = g >= 10;
    const sample = isHigh ? {
      format: 'asian-school-matrix',
      schema_version: 1,
      matrix: {
        mode: 'authored',
        profile: 'THPT',
        grade: g,
        exam_type: 'GK1',
        duration: 45,
        school_year: '2026-2027',
        title: `Ma trận & đặc tả Kiểm tra Giữa HK1 · Môn Tin học Khối ${g}`,
        owner_name: 'Tổ Tin học Á Châu',
        campus: 'Cao Thắng',
        total_points: 10,
        lessons: [
          { lesson_code: 'B1', title: 'Thông tin và xử lí thông tin số', topic: 'Chủ đề A. Máy tính và xã hội tri thức (Mục II.1 cốt lõi)' },
          { lesson_code: 'B2', title: 'Mạng máy tính và an toàn số', topic: 'Chủ đề B. Mạng máy tính và Internet (Mục II.1 cốt lõi)' }
        ],
        requirements: [
          { id: 'R1', lesson_code: 'B1', level: 'Biết', text: 'Nhận biết khái niệm thông tin, dữ liệu và thiết bị số.', ppct_outcome_index: 0, competency: 'NLa' },
          { id: 'R2', lesson_code: 'B1', level: 'Hiểu', text: 'Phân tích được quy trình xử lí và lưu trữ dữ liệu số.', ppct_outcome_index: 0, competency: 'NLb' },
          { id: 'R3', lesson_code: 'B2', level: 'Vận dụng', text: 'Vận dụng biện pháp bảo mật, an toàn thông tin trong thực tiễn.', ppct_outcome_index: 0, competency: 'NLc' },
          { id: 'R4', lesson_code: 'B2', level: 'Vận dụng cao', text: 'Đề xuất và tối ưu giải pháp bảo vệ hệ thống số.', ppct_outcome_index: 0, competency: 'NLc' }
        ],
        indicator_catalog: [
          { code: 'NLa', competency: 'NLa', text: 'Sử dụng và quản lí thiết bị công nghệ thông tin.' },
          { code: 'NLb', competency: 'NLb', text: 'Ứng xử phù hợp và an toàn trong môi trường số.' },
          { code: 'NLc', competency: 'NLc', text: 'Giải quyết vấn đề với sự hỗ trợ của công nghệ thông tin.' }
        ],
        reconciliation: { confirmed: true, issues: [] },
        slots: [
          ...Array.from({ length: 10 }, (_, idx) => ({ id: `S${idx + 1}`, kind: 'MC', number: idx + 1, parts: [{ id: `P${idx + 1}`, label: '', requirement_id: 'R1', points: 0.25, indicator: 'NLa' }], scoring: { mode: 'sum_parts' } })),
          ...Array.from({ length: 9 }, (_, idx) => ({ id: `S${idx + 11}`, kind: 'MC', number: idx + 11, parts: [{ id: `P${idx + 11}`, label: '', requirement_id: 'R2', points: 0.25, indicator: 'NLb' }], scoring: { mode: 'sum_parts' } })),
          { id: 'S20', kind: 'YN', number: 1, parts: [
            { id: 'P20a', label: 'a', requirement_id: 'R1', points: 0.25, indicator: 'NLa' },
            { id: 'P20b', label: 'b', requirement_id: 'R1', points: 0.25, indicator: 'NLa' },
            { id: 'P20c', label: 'c', requirement_id: 'R2', points: 0.25, indicator: 'NLb' },
            { id: 'P20d', label: 'd', requirement_id: 'R3', points: 0.25, indicator: 'NLc' }
          ], scoring: { mode: 'sum_parts' } },
          { id: 'S21', kind: 'YN', number: 2, parts: [
            { id: 'P21a', label: 'a', requirement_id: 'R1', points: 0.25, indicator: 'NLa' },
            { id: 'P21b', label: 'b', requirement_id: 'R1', points: 0.25, indicator: 'NLa' },
            { id: 'P21c', label: 'c', requirement_id: 'R2', points: 0.25, indicator: 'NLb' },
            { id: 'P21d', label: 'd', requirement_id: 'R3', points: 0.25, indicator: 'NLc' }
          ], scoring: { mode: 'sum_parts' } },
          { id: 'S22', kind: 'YN', number: 3, parts: [
            { id: 'P22a', label: 'a', requirement_id: 'R1', points: 0.25, indicator: 'NLa' },
            { id: 'P22b', label: 'b', requirement_id: 'R1', points: 0.25, indicator: 'NLa' },
            { id: 'P22c', label: 'c', requirement_id: 'R2', points: 0.25, indicator: 'NLb' },
            { id: 'P22d', label: 'd', requirement_id: 'R3', points: 0.25, indicator: 'NLc' }
          ], scoring: { mode: 'sum_parts' } },
          { id: 'S23', kind: 'ES', number: 1, parts: [{ id: 'P23', label: '', requirement_id: 'R3', points: 0.75, indicator: 'NLc' }], scoring: { mode: 'sum_parts' } },
          { id: 'S24', kind: 'ES', number: 2, parts: [{ id: 'P24', label: '', requirement_id: 'R3', points: 0.75, indicator: 'NLc' }], scoring: { mode: 'sum_parts' } },
          { id: 'S25', kind: 'ES', number: 3, parts: [{ id: 'P25', label: '', requirement_id: 'R4', points: 0.75, indicator: 'NLc' }], scoring: { mode: 'sum_parts' } }
        ]
      }
    } : {
      format: 'asian-school-matrix',
      schema_version: 1,
      matrix: {
        mode: 'authored',
        profile: 'THCS',
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
          { id: 'R2', lesson_code: 'B1', level: 'Hiểu', text: 'Giải thích được vai trò của thiết bị số trong đời sống và học tập.', ppct_outcome_index: 0, competency: 'NLa' },
          { id: 'R3', lesson_code: 'B2', level: 'Vận dụng', text: 'Vận dụng được kiến thức để tìm kiếm và đánh giá chất lượng thông tin.', ppct_outcome_index: 0, competency: 'NLb' },
          { id: 'R4', lesson_code: 'B2', level: 'Vận dụng cao', text: 'Đề xuất cách khai thác thông tin an toàn, hiệu quả trong tình huống thực tế.', ppct_outcome_index: 0, competency: 'NLc' }
        ],
        indicator_catalog: [],
        reconciliation: { confirmed: true, issues: [] },
        slots: [
          ...Array.from({ length: 16 }, (_, idx) => ({ id: `S${idx + 1}`, kind: 'MC', number: idx + 1, parts: [{ id: `P${idx + 1}`, label: '', requirement_id: 'R1', points: 0.25, indicator: '' }], scoring: { mode: 'sum_parts' } })),
          ...Array.from({ length: 12 }, (_, idx) => ({ id: `S${idx + 17}`, kind: 'MC', number: idx + 17, parts: [{ id: `P${idx + 17}`, label: '', requirement_id: 'R2', points: 0.25, indicator: '' }], scoring: { mode: 'sum_parts' } })),
          { id: 'S29', kind: 'ES', number: 1, parts: [{ id: 'P29', label: '', requirement_id: 'R3', points: 1.0, indicator: '' }], scoring: { mode: 'sum_parts' } },
          { id: 'S30', kind: 'ES', number: 2, parts: [{ id: 'P30', label: '', requirement_id: 'R3', points: 1.0, indicator: '' }], scoring: { mode: 'sum_parts' } },
          { id: 'S31', kind: 'ES', number: 3, parts: [{ id: 'P31', label: '', requirement_id: 'R4', points: 1.0, indicator: '' }], scoring: { mode: 'sum_parts' } }
        ]
      }
    };
    adaptSampleToSubject(sample.matrix, g);
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Mau_Ma_tran_${sampleFileSubject()}_${g}_2026-2027.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadMatrixMdSample(grade = 9) {
    const g = Number(grade) || 9;
    const isHigh = g >= 10;
    const sampleMd = isHigh ? `# MA TRẬN & ĐẶC TẢ ĐỀ KIỂM TRA GIỮA HỌC KỲ 1 (THPT Á CHÂU · CV 7991)
Môn: Tin học - Khối: ${g} - Thời gian: 45 phút - Năm học: 2026-2027

> Khung điểm THPT Á Châu: Phần 1 Trắc nghiệm (MC) 19 câu = 4,75đ (0,25đ/câu) · Phần 2 Đúng/Sai (YN) 3 câu = 3,0đ (1,0đ/câu · 4 ý a, b, c, d) · Phần 3 Tự luận (ES) 3 câu = 2,25đ (0,75đ/câu). Tổng: 25 câu = 10,0 điểm. Chỉ sử dụng Phần cốt lõi Mục II.1 (TT 22/2021 Điều 7.1 không đưa Chuyên đề CD1..CD3 vào đề giữa kỳ/cuối kỳ).

## Chủ đề A: Máy tính và xã hội tri thức
### Bài 1: Thông tin và xử lí thông tin (Mã: B1)
- [Biết] [MC] Nhận biết khái niệm thông tin, dữ liệu và thiết bị số. (10 câu · 2.5đ · Câu 1..10)
- [Hiểu] [MC] Phân tích quy trình xử lí và lưu trữ dữ liệu số. (9 câu · 2.25đ · Câu 11..19)

## Chủ đề B: Mạng máy tính và Internet
### Bài 2: Mạng máy tính và an toàn số (Mã: B2)
- [Biết] [YN] Nhận diện thành phần mạng và quy tắc an toàn cơ bản. (2 câu 4 ý · 2.0đ · Câu 1, Câu 2 ĐS)
- [Hiểu] [YN] Phân tích tình huống rủi ro an toàn thông tin. (1 câu 4 ý · 1.0đ · Câu 3 ĐS)
- [Vận dụng] [ES] Vận dụng kiến thức bảo mật và giải quyết vấn đề thực tiễn. (2 câu · 1.5đ · Câu 1, Câu 2 TL)
- [Vận dụng cao] [ES] Đề xuất và tối ưu giải pháp bảo vệ hệ thống số. (1 câu · 0.75đ · Câu 3 TL)
` : `# MA TRẬN & ĐẶC TẢ ĐỀ KIỂM TRA GIỮA HỌC KỲ 1 (THCS Á CHÂU)
Môn: Tin học - Khối: ${g}
Thời gian: 45 phút - Năm học: 2026-2027

> Ghi chú: Mẫu THCS sử dụng 2 dạng (Trắc nghiệm nhiều lựa chọn MC 7,0đ + Tự luận ES 3,0đ) và 4 mức độ (Biết, Hiểu, Vận dụng, Vận dụng cao). Cấp THCS không có Chuyên đề lựa chọn.

## BẢNG ĐẶC TẢ KĨ THUẬT ĐỀ KIỂM TRA

| TT | Chủ đề | Bài học / Đơn vị kiến thức | Mức độ đánh giá | Yêu cầu cần đạt | Số câu hỏi | Câu hỏi trong đề | Điểm |
|---|---|---|---|---|---|---|---|
| 1 | Máy tính và cộng đồng | Bài 1: Thế giới kĩ thuật số | Nhận biết | - Nhận biết được một số thiết bị số thông dụng.<br>- Nêu được ưu điểm của thiết bị số trong đời sống. | 16 TN | Câu 1..16 | 4.0 |
| | | | Thông hiểu | - Giải thích được vai trò của thiết bị số trong lưu trữ và xử lý thông tin. | 12 TN | Câu 17..28 | 3.0 |
| 2 | Tổ chức lưu trữ, tìm kiếm | Bài 2: Thông tin trong giải quyết vấn đề | Vận dụng | - Thực hành tìm kiếm và đánh giá thông tin phục vụ giải quyết vấn đề thực tế. | 2 TL | Câu 1, Câu 2 TL | 2.0 |
| | | | Vận dụng cao | - Đề xuất cách khai thác thông tin an toàn, hiệu quả trong tình huống thực tế. | 1 TL | Câu 3 TL | 1.0 |
`;
    const blob = new Blob([adaptSampleMarkdownToSubject(sampleMd, g)], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Mau_Ma_tran_${sampleFileSubject()}_${g}_2026-2027.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function copyMatrixAiPrompt(grade = 9) {
    const g = Number(grade) || 9;
    const isHigh = g >= 10;
    const activeEdit = (typeof ui !== 'undefined' && ui?.editing) ? ui.editing : null;
    const subjName = subject(activeEdit);
    const presetCat = root.BankCompetencyCatalog?.presetCatalogForSubject?.(subjName);
    const compList = activeEdit?.competency_catalog?.length ? activeEdit.competency_catalog : (presetCat?.competencies || [{ code: 'NLa', name: 'Năng lực đặc thù 1' }]);
    const indList = activeEdit?.indicator_catalog?.length ? activeEdit.indicator_catalog : (presetCat?.indicators || [{ code: compList[0]?.code || 'NL1', competency: compList[0]?.code || 'NL1', text: 'Mô tả chỉ báo...' }]);
    const firstComp = compList[0]?.code || 'NL_CHUNG';
    const firstInd = indList[0]?.code || firstComp;
    const compSummaryLines = compList.map(c => `  * ${c.code}: ${c.name}`).join('\n');
    const indSampleLines = indList.slice(0, 6).map(i => `  * ${i.code} (${i.competency}): ${i.text}`).join('\n');
    const thptRules = isHigh
      ? `\nQUY CHUẨN BẮT BUỘC VỚI THPT (KHỐI ${g} — KHUNG ĐIỂM THPT Á CHÂU · CV 7991/BGDĐT-GDTrH & TT 22/2021):
- Profile = "THPT", tổng điểm = 10.0. Gắn đúng mã thành phần năng lực & chỉ báo môn ${subjName} vào từng yêu cầu/vị trí câu.
- Khung điểm chuẩn THPT Á Châu (tổng 25 câu = 10,0 điểm):
  + Phần 1 — Câu hỏi trắc nghiệm nhiều lựa chọn (MC): 19 câu × 0,25 điểm = 4,75 điểm (đánh số number từ 1 đến 19).
  + Phần 2 — Câu hỏi trắc nghiệm Đúng/Sai 4 ý a, b, c, d (YN): 3 câu × 1,0 điểm (mỗi ý a, b, c, d là 0,25 điểm) = 3,0 điểm (đánh số number từ 1 đến 3).
  + Phần 3 — Câu hỏi Tự luận (ES): 3 câu × 0,75 điểm = 2,25 điểm (đánh số number từ 1 đến 3).
- Phân bố mức độ đánh giá chuẩn: Biết ~4,0đ (40%) · Hiểu ~3,0đ (30%) · Vận dụng (gồm Vận dụng + Vận dụng cao) ~3,0đ (30%).
- QUAN TRỌNG (TT 22/2021 Điều 7, khoản 1): Nếu kỳ kiểm tra là định kỳ (GK1, CK1, GK2, CK2), CHỈ chọn bài thuộc Phần cốt lõi (Mục II.1, mã B1, B2...), KHÔNG đưa Chuyên đề học tập (CD1..CD3). Chỉ đưa Chuyên đề vào Ma trận Kiểm tra thường xuyên (exam_type = "TX").`
      : `\nQUY CHUẨN BẮT BUỘC VỚI THCS (KHỐI ${g} — MẪU Á CHÂU & TT 22/2021):
- Profile = "THCS", tổng điểm = 10.0. Sử dụng 2 dạng chính: MC (Trắc nghiệm 4 lựa chọn, thường 7.0đ = 28 câu) và ES (Tự luận/thực hành, thường 3.0đ = 3 câu).
- Phân bố theo mức độ nhận thức phù hợp (Biết, Hiểu, Vận dụng hoặc 4 mức khi trường quy định). Cấp THCS không có Chuyên đề lựa chọn.`;
    const prompt = `Bạn là chuyên gia khảo thí môn ${subjName} phổ thông GDPT 2018 (TT 32/2018 & CV 7991/BGDĐT-GDTrH).
Hãy giúp tôi thiết lập/chuyển đổi nội dung Ma trận & Đặc tả đề kiểm tra môn ${subjName} Khối ${g} sang định dạng chuẩn để nạp vào hệ thống ExamMatrix Studio:
${thptRules}

THÀNH PHẦN NĂNG LỰC & CHỈ BÁO MÔN ${subjName.toUpperCase()}:
${compSummaryLines}
- Chỉ báo tham khảo:
${indSampleLines}

---
QUY TẮC BẮT BUỘC CHO BẢNG ĐẶC TẢ ("requirements"):
- Mỗi phần tử trong "requirements" là YÊU CẦU CẦN ĐẠT ĐẶC TẢ THEO MỤC TIÊU ĐÁNH GIÁ CỤ THỂ CỦA TỪNG CÂU HỎI (hoặc nhóm câu hỏi cùng mục tiêu), tuyệt đối KHÔNG chép chung chung mục tiêu của cả bài học.
- Mỗi requirement bắt buộc có "ppct_outcome_index": 0.
- Mỗi slot trong "slots" bắt buộc có "scoring": { "mode": "sum_parts" }, và số thứ tự "number" trong mỗi dạng (MC, YN, SHORT, ES) phải đánh số bắt đầu từ 1, 2, 3... (Tự luận ES cũng bắt đầu lại từ 1).

CÁCH 1: ĐỊNH DẠNG JSON (KHUYÊN DÙNG SỐ 1 - CHUẨN XÁC 100%):
{
  "format": "asian-school-matrix",
  "schema_version": 1,
  "matrix": {
    "mode": "authored",
    "profile": "${isHigh ? 'THPT' : 'THCS'}",
    "grade": ${g},
    "subject_name": "${subjName}",
    "exam_type": "GK1",
    "duration": 45,
    "school_year": "2026-2027",
    "title": "Ma trận & đặc tả Kiểm tra Giữa HK1 ${subjName} ${g}",
    "owner_name": "Tổ ${subjName} Á Châu",
    "campus": "Cao Thắng",
    "total_points": 10,
    "lessons": [
      { "lesson_code": "B1", "title": "Tên bài 1", "topic": "Tên chủ đề 1" }
    ],
    "requirements": [
      { "id": "R1", "lesson_code": "B1", "level": "Biết", "text": "Mục tiêu đánh giá cụ thể của Câu 1...", "ppct_outcome_index": 0, "competency": "${firstComp}" }
    ],
    "indicator_catalog": ${isHigh ? `[\n      { "code": "${firstInd}", "competency": "${firstComp}", "text": "Mô tả chỉ báo..." }\n    ]` : '[]'},
    "reconciliation": { "confirmed": true, "issues": [] },
    "slots": [
      { "id": "S1", "kind": "MC", "number": 1, "scoring": { "mode": "sum_parts" }, "parts": [{ "id": "P1", "label": "", "requirement_id": "R1", "points": 0.25${isHigh ? `, "indicator": "${firstInd}"` : ', "indicator": ""'} }] }
    ]
  }
}

---
CÁCH 2: ĐỊNH DẠNG MARKDOWN PHÂN CẤP (DỄ ĐỌC, KHÔNG LO LỆCH CỘT KHI NHẬP):
# MA TRẬN & ĐẶC TẢ GIỮA KÌ 1 ${subjName.toLocaleUpperCase('vi')} ${g}
Môn: ${subjName} - Khối: ${g} - Thời gian: 45 phút - Năm học: 2026-2027

## Chủ đề 1: Tên chủ đề cốt lõi
### Bài 1: Tên bài học (Mã: B1)
- [Biết] [MC] Yêu cầu cần đạt 1... (${firstComp}) (2 câu · 0.5đ · Câu 1, Câu 2)
${isHigh ? `- [Hiểu] [YN] Yêu cầu cần đạt 2... (${firstComp}) (1 câu 4 ý · 1.0đ · Câu 1 ĐS)\n- [Vận dụng] [SHORT] Yêu cầu cần đạt 3... (${firstComp}) (2 câu · 1.0đ · Câu 1, Câu 2 TLN)\n` : `- [Hiểu] [MC] Yêu cầu cần đạt 2... (${firstComp}) (1 câu · 0.25đ · Câu 3)\n`}- [Vận dụng] [ES] Yêu cầu cần đạt 4... (${firstComp}) (1 câu · 1.0đ · Câu 1 TL)

Quy ước:
- [Mức độ]: Biết, Hiểu, Vận dụng (chỉ tách Vận dụng cao khi hồ sơ riêng của tổ yêu cầu).
- [Dạng câu]: MC (Trắc nghiệm 4 lựa chọn), YN (Đúng/Sai 4 ý a-d), SHORT (Trả lời ngắn), ES (Tự luận).
- Tổng điểm phải bằng đúng 10.0 điểm.`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prompt).then(() => {
        alert(`Đã chép Prompt AI tạo Ma trận ${subjName} Khối ${g} (${isHigh ? 'THPT CV 7991' : 'THCS Á Châu'}) vào bộ nhớ tạm!`);
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
      <h2>Nhận ma trận & đặc tả (Excel, JSON, Markdown hoặc Word)</h2>
      <div class="callout" style="background:#F2F0FB;border-left:4px solid #4A3AA8;padding:12px;margin:10px 0;font-size:13px;line-height:1.6">
        <strong>Lưu ý xử lý ma trận nhiều bảng, nhiều cột:</strong><br>
        Ma trận GDPT 2018 thường có nhiều bảng (Khung ma trận & Bản đặc tả) với các ô gộp dòng/cột phức tạp.<br>
        • Khuyên dùng <strong>Excel (.xlsx / .csv)</strong> hoặc <strong>JSON</strong> để hệ thống nhận diện chính xác tuyệt đối, không lo lệch cột.<br>
        • Bấm <strong>"Tải mẫu"</strong> hoặc <strong>"Chép Prompt AI"</strong> để AI tạo ngay dữ liệu chuẩn.
      </div>
      <div style="display:flex;gap:10px;margin:10px 0 14px;flex-wrap:wrap;align-items:center">
        <button type="button" class="button" id="mx-download-excel-sample" style="background:#1F6B52;color:#fff;border-color:#1F6B52;padding:6px 12px;font-size:12px;font-weight:700">Tải mẫu Ma trận (Excel)</button>
        <button type="button" class="button quiet" id="mx-download-json-sample" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Tải mẫu Ma trận (JSON)</button>
        <button type="button" class="button quiet" id="mx-download-md-sample" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Tải mẫu Ma trận (Markdown)</button>
        <button type="button" class="button quiet" id="mx-copy-prompt" style="color:#4A3AA8;padding:6px 12px;font-size:12px;font-weight:600">Chép Prompt AI tạo Ma trận</button>
      </div>
      <div class="form-grid">
        <div class="field"><label for="mx-import-grade">Khối lớp</label><select id="mx-import-grade">${grades().map(g=>opt(g,'Khối '+g,i.grade===g)).join('')}</select></div>
        <div class="field span2"><label for="mx-file">Chọn tệp Excel (.xlsx, .csv), Markdown (.md), JSON hoặc Word (.docx)</label><input type="file" id="mx-file" accept=".xlsx,.xls,.csv,.tsv,.docx,.json,.md,.txt"></div>
      </div>
      <div id="mx-import-result">
        ${i.package?`<p class="callout">${E(packageSummary(i.package))}</p>`:i.candidate?`<p class="callout">Đã nhận dạng ${E(i.candidate.profile||'THCS')} · Khối ${i.grade} · ${i.candidate.slots?.length||0} vị trí câu hỏi. Đạt chuẩn cấu trúc ma trận & đặc tả.</p><ul class="mx-errors">${(i.issues||[]).map(x=>`<li>${E(x.message||x)}</li>`).join('')}</ul><p class="muted">Các chỉ báo và ánh xạ sẽ được mở ở màn hình đối chiếu. Nội dung gốc được bảo toàn.</p>`:'<p class="muted">Hỗ trợ tệp Excel (.xlsx, .csv), Markdown (.md), gói JSON chuẩn và Word (.docx). Bấm nút tải mẫu ở trên để xem định dạng chuẩn.</p>'}
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

    const btnExcel = qs('#mx-download-excel-sample');
    if (btnExcel) btnExcel.onclick = () => downloadMatrixExcelSample(Number(qs('#mx-import-grade').value || 9));
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
      if(ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'tsv') {
        if(typeof TableFileHelper !== 'undefined') {
          const res = await TableFileHelper.readTableFile(file);
          if(res.type === 'table') {
            const mdText = res.rows.map(r => '| ' + r.map(c => String(c || '').replace(/\|/g, '-')).join(' | ') + ' |').join('\n');
            const parsed = parseMatrixFromMarkdown(mdText, grade);
            if (!parsed || !parsed.matrix) throw new Error('Không đọc được cấu trúc ma trận từ bảng tính Excel.');
            ui.importing = {
              grade: parsed.matrix.grade || grade,
              candidate: parsed.matrix,
              package: parsed,
              filename: file.name
            };
          } else {
            throw new Error('Không đọc được bảng dữ liệu trong tệp.');
          }
        }
      } else if(ext === 'json') {
        const text = await file.text();
        const data = JSON.parse(text);
        const rawMatrix = (data && typeof data === 'object' && data.matrix && typeof data.matrix === 'object') ? data.matrix : data;
        const pkg = (data && data.format === 'asian-school-matrix')
          ? { ...data, schema_version: data.schema_version || 1, matrix: rawMatrix }
          : { format: 'asian-school-matrix', schema_version: 1, matrix: rawMatrix };
        if (pkg.content_sha256 === undefined && pkg.matrix && typeof pkg.matrix === 'object') {
          if (!pkg.matrix.grade) pkg.matrix.grade = grade;
          normalizeSlotNumbers(pkg.matrix);
        }
        ui.importing = { grade: Number(pkg.matrix?.grade || grade), candidate: pkg.matrix, package: pkg, filename: file.name };
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
  function generationSlots(g=ui.generation){return (g&&g.flexibleMode&&Array.isArray(g.flexible_slots))?g.flexible_slots:(g?.slots||[]);}
  function renderGeneration(){
    const g=ui.generation,m=g.matrix,slots=generationSlots(g),diag=g.bank_diagnostics;
    const revisions=(ui.ctx.revisions||[]).filter(r=>r.grade===m.grade);
    const strictMatched=Array.isArray(g.slots)?g.slots.filter(s=>(s.candidates||[]).length>0).length:0;
    const flexMatched=Array.isArray(g.flexible_slots)?g.flexible_slots.filter(s=>(s.candidates||[]).length>0).length:strictMatched;
    const diagBanner=(diag||Array.isArray(g.flexible_slots))?`<div class="callout ${g.flexibleMode?'':'warning'}" style="margin:10px 0 12px;padding:12px 14px;background:${g.flexibleMode?'#F2F0FB':'#F3F4F8'};border:1px solid ${g.flexibleMode?'#B9B0EA':'#D4A84A'};border-radius:8px"><div style="font-size:13px;margin-bottom:6px"><strong>Ngân hàng Khối ${E(m.grade)}:</strong> ${diag?`${diag.total_in_grade} câu (${diag.approved_in_grade} đã duyệt · ${diag.unapproved_in_grade} nháp/chờ duyệt) · `:''}Khớp chặt (YCCĐ nguồn &amp; đã duyệt): <strong>${strictMatched}/${slots.length}</strong> vị trí · Khớp linh hoạt (cùng Bài &amp; Mức độ): <strong>${flexMatched}/${slots.length}</strong> vị trí.</div><label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;font-weight:600;color:#1C2333;cursor:pointer"><input type="checkbox" id="mx-flexible-mode"${g.flexibleMode?' checked':''}><span>Chế độ linh hoạt Ma trận 2D (chấp nhận mọi YCCĐ trong cùng Bài &amp; cả câu Nháp/Chờ duyệt để tạo đề nháp nhanh — ưu tiên câu đã duyệt trước)</span></label></div>`:'';
    const optLabel=q=>{
      const statusTag=(q.review_status&&q.review_status!=='approved')?(q.review_status==='pending_review'?'[Chờ duyệt] ':q.review_status==='needs_review'?'[Cần sửa] ':'[Nháp] '):'';
      const idPart=/^[A-Z]{1,6}-[0-9a-f-]{12,}$/i.test(String(q.id||''))?'':(q.id+' · ');
      return statusTag+(q.recently_used?.length?'Vừa dùng · ':'')+idPart+String(q.question||'').slice(0,180);
    };
    qs('#mx-work').innerHTML=`<section class="card"><p class="eyebrow">ĐỀ RIÊNG THEO MA TRẬN ĐÃ KHÓA</p><h2>${E(m.title)} · V${m.version}</h2><p>Phân bố và điểm giữ theo ma trận chung. Chọn câu và xác nhận chỉ báo cho từng vị trí.</p>${diagBanner}<div class="form-grid"><div class="field span2"><label for="mx-exam-title">Tên đề riêng</label><input id="mx-exam-title" value="${E(periods[m.exam_type]+' · '+subject(m)+' '+m.grade)}"></div><div class="field"><label for="mx-exam-campus">Cơ sở ra đề</label><input id="mx-exam-campus" value="${generic()?'':'Cao Thắng'}"></div><div class="field"><label for="mx-exam-code">Mã đề</label><input id="mx-exam-code" value="101"></div><div class="field"><label for="mx-exam-seed">Mã xáo trộn phương án</label><input id="mx-exam-seed" value="2026"></div><div class="field full"><label for="mx-exam-revision">Phiên bản đề cương</label><select id="mx-exam-revision">${opt('','Chọn đề cương đã lưu',true)}${revisions.map(r=>opt(r.id,r.title,false)).join('')}</select></div></div><div class="actions"><button data-action="suggest">Gợi ý chọn câu không trùng</button><button type="button" class="primary" data-action="quick-generate-exam" style="background:#4A3AA8;font-weight:700">Tự động chọn câu &amp; Tạo đề ngay</button><span id="mx-coverage"></span></div>
    ${slots.map(entry=>{const s=entry.slot;return `<article class="mx-exam-slot"><h3>${E(NAMEShort(s.kind))} ${s.number} · ${s.parts.reduce((n,p)=>n+Number(p.points),0)} điểm</h3><div class="field"><label for="mx-choice-${E(s.id)}">Chọn câu hỏi cho ${E(NAMEShort(s.kind))} ${s.number}</label><select id="mx-choice-${E(s.id)}" data-choice="${E(s.id)}">${opt('','Chọn câu phù hợp',true)}${entry.candidates.map(q=>opt(q.id,optLabel(q),false)).join('')}</select></div><div id="mx-choice-detail-${E(s.id)}" class="mx-choice-detail"></div>${entry.requirements.map((r,i)=>`<label class="mx-checkbox"><input type="checkbox" data-review-slot="${E(s.id)}" value="${E(s.parts[i].id)}">Đã đối chiếu ${E(s.parts[i].label||'câu này')}: ${E(r.text)}</label>`).join('')}${!entry.candidates.length?'<p class="mx-bad">Chưa có câu khớp bài, dạng, mức độ và YCCĐ nguồn. Cần bổ sung ngân hàng; không bù sang ô khác.</p>':''}</article>`;}).join('')}
    <button class="primary" data-action="generate">Tạo và lưu đề riêng</button><div id="mx-created-exam"></div></section>`;const values=g.formValues||{};ui.container.querySelectorAll('[id^=mx-exam-],[data-choice],[data-review-slot]').forEach(el=>{const key=el.dataset.reviewSlot?'review:'+el.dataset.reviewSlot+':'+el.value:el.id;if(Object.prototype.hasOwnProperty.call(values,key)){if(el.type==='checkbox')el.checked=values[key];else el.value=values[key];}});slots.forEach(e=>showChoice(e.slot.id));coverage();}
  function showChoice(id){const entry=generationSlots(ui.generation).find(e=>e.slot.id===id);if(!entry)return;const q=entry.candidates.find(q=>q.id===qs('#mx-choice-'+id)?.value);const det=qs('#mx-choice-detail-'+id);if(det)det.innerHTML=q?`<p class="question-text">${E(q.question)}</p>${q.options?'<ol type="A">'+q.options.map((o,i)=>`<li>${E(o)}${i===q.correct?' <strong>— đáp án đúng</strong>':''}</li>`).join('')+'</ol>':q.rubric?'<ul>'+q.rubric.map(c=>`<li>${E(c.criterion)}</li>`).join('')+'</ul>':''}<p class="small muted">YCCĐ nguồn: ${E(q.learning_outcome||'Chưa gắn YCCĐ')}${q.review_status&&q.review_status!=='approved'?` · Trạng thái: ${E({pending_review:'Chờ duyệt',needs_review:'Cần sửa',draft:'Nháp'}[q.review_status]||q.review_status)}`:''}</p>${q.recently_used?.length?`<p class="mx-bad">Câu đã có trong đề đã phát hành gần đây: ${q.recently_used.map(u=>`${E(u.title||u.exam_id)} (${E(String(u.published_at||'').slice(0,10))})`).join('; ')}. Chỉ là cảnh báo; nên cân nhắc chọn câu khác.</p>`:''}`:'';}
  function coverage(){const slots=generationSlots(ui.generation);if(!ui.generation||!qs('#mx-coverage'))return;const rev=(ui.ctx.revisions||[]).find(r=>r.id===qs('#mx-exam-revision').value),hashes=new Set((rev?.questions||[]).map(q=>q.content_hash));let count=0,matched=0;for(const e of slots){const q=e.candidates.find(q=>q.id===qs('#mx-choice-'+e.slot.id)?.value);if(q){count++;if(hashes.has(q.content_hash))matched++;}}qs('#mx-coverage').textContent=`Đã chọn ${count}/${slots.length} câu · Khớp nội dung đề cương ${matched} câu.`;}
  function suggest(opts={}){
    const slots=generationSlots(ui.generation);
    const revEl=qs('#mx-exam-revision');
    const rev=(ui.ctx.revisions||[]).find(r=>r.id===(revEl?revEl.value:''));
    const hashes=new Set((rev?.questions||[]).map(q=>q.content_hash));
    const normQ=s=>String(s||'').normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ');
    const prepared=slots.map(e=>({
      entry:e,
      slotId:e.slot.id,
      pool:(e.candidates||[]).slice().sort((a,b)=>Number(hashes.has(b.content_hash))-Number(hashes.has(a.content_hash)))
    }));
    const ordered=prepared.slice().sort((a,b)=>a.pool.length-b.pool.length);
    const chosenMap=new Map();
    const usedIds=new Set();
    const usedTexts=new Set();
    let attempts=0;
    function backtrack(idx){
      if(idx>=ordered.length)return true;
      if(++attempts>50000)return false;
      const item=ordered[idx];
      for(const q of item.pool){
        const textKey=normQ(q.question);
        if(usedIds.has(q.id)||(textKey&&usedTexts.has(textKey)))continue;
        usedIds.add(q.id);
        if(textKey)usedTexts.add(textKey);
        chosenMap.set(item.slotId,q.id);
        if(backtrack(idx+1))return true;
        usedIds.delete(q.id);
        if(textKey)usedTexts.delete(textKey);
        chosenMap.delete(item.slotId);
      }
      return false;
    }
    if(!backtrack(0)){
      chosenMap.clear();
      usedIds.clear();
      usedTexts.clear();
      for(const item of ordered){
        const q=item.pool.find(cand=>{
          const textKey=normQ(cand.question);
          return !usedIds.has(cand.id)&&!(textKey&&usedTexts.has(textKey));
        });
        if(q){
          usedIds.add(q.id);
          const textKey=normQ(q.question);
          if(textKey)usedTexts.add(textKey);
          chosenMap.set(item.slotId,q.id);
        }
      }
    }
    const missing=[];
    for(const e of slots){
      const pickedId=chosenMap.get(e.slot.id)||'';
      const choiceEl=qs('#mx-choice-'+e.slot.id);
      if(choiceEl)choiceEl.value=pickedId;
      ui.container.querySelectorAll('[data-review-slot]').forEach(c=>{
        if(c.dataset.reviewSlot===e.slot.id)c.checked=Boolean(opts.autoCheck&&pickedId);
      });
      if(!pickedId){
        const req=e.requirements&&e.requirements[0];
        const meta=[req&&req.lesson_code,req&&req.level].filter(Boolean).join(' · ');
        missing.push(`Câu ${e.slot.number||e.slot.id}${meta?` (${meta})`:''}`);
      }
      showChoice(e.slot.id);
    }
    captureGeneration();coverage();
    if(!opts.silent){
      message('Đã gợi ý câu. Thầy cần xem nội dung và đánh dấu đối chiếu từng chỉ báo trước khi lưu đề.');
    }
    return {chosenCount:slots.length-missing.length,total:slots.length,missing};
  }
  async function generate(){
    if(ui.generating)return;
    ui.generating=true;
    const btns=[...(ui.container?.querySelectorAll('[data-action="quick-generate-exam"],[data-action="generate"]')||[])];
    btns.forEach(b=>{b.disabled=true;});
    try{
      return await generateExamInner();
    }finally{
      ui.generating=false;
      btns.forEach(b=>{b.disabled=false;});
    }
  }
  async function generateExamInner(){
    const g=ui.generation,slots=generationSlots(g);
    const placements=slots.map(e=>({
      slot_id:e.slot.id,
      question_id:qs('#mx-choice-'+e.slot.id)?.value||'',
      reviewed_part_ids:[...ui.container.querySelectorAll('[data-review-slot]')].filter(x=>x.dataset.reviewSlot===e.slot.id&&x.checked).map(x=>x.value)
    }));
    const result=await ui.ctx.request('/api/exams/from-matrix',{
      matrix_id:g.matrix.id,
      grade:Number(g.matrix.grade),
      exam_type:g.matrix.exam_type,
      subject_name:subject(g.matrix),
      duration:Number(g.matrix.duration||45),
      flexible:Boolean(g.flexibleMode),
      revision_id:qs('#mx-exam-revision')?.value||'',
      title:qs('#mx-exam-title')?.value||'',
      campus:qs('#mx-exam-campus')?.value||'',
      exam_code:qs('#mx-exam-code')?.value||'101',
      seed:qs('#mx-exam-seed')?.value||'2026',
      placements
    });const e=result.exam,base='/api/exams/'+encodeURIComponent(e.id)+'/export';ui.lastCreatedExam=e;if(Array.isArray(ui.ctx?.exams)&&!ui.ctx.exams.some(x=>x.id===e.id))ui.ctx.exams.push(e);qs('#mx-created-exam').innerHTML=`<div class="callout" style="background:#EEF6F2;border:1px solid #A9D3C1;padding:16px;margin-top:14px"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div><h3 style="margin:0;color:#1F6B52">Đã lưu đề ${E(e.exam_code)} · Khối ${e.grade} · ${E(e.campus)}</h3><p style="margin:2px 0 0;font-size:13px;color:#1F6B52">${e.question_count} câu · 10 điểm · Khớp đề cương ${e.revision_match_count}/${e.question_count} câu · Ma trận V${e.matrix_version}</p></div></div><div style="background:#fff;border:1px solid #CFE5DB;border-radius:8px;padding:12px;margin:12px 0"><strong style="color:#4A3AA8;font-size:13px">BƯỚC TIẾP THEO: LÀM BẢNG 2 ĐẶC TẢ TỪ ĐỀ THI NÀY</strong><p style="margin:4px 0 10px;font-size:12.5px;color:#2E3646">Hệ thống sẽ lấy chính xác ${e.question_count} câu hỏi thực tế trong đề thi vừa tạo (gồm Số câu, Mức độ, Yêu cầu cần đạt YCCĐ và Năng lực NLa/b/c/d/e) để tự động điền chuẩn xác vào <strong>Bảng 2: Bảng đặc tả đề kiểm tra trực quan</strong>.</p><button type="button" class="primary" data-action="apply-exam-to-spec" data-exam-id="${E(e.id)}" style="background:#4A3AA8;border-color:#4A3AA8;font-weight:700;font-size:13px;padding:8px 16px">Làm ngay Bảng 2 Đặc tả từ đề thi này</button></div><div class="actions"><button type="button" class="primary" data-view-exam="${E(e.id)}" data-mode="student">Xem đề học sinh</button><button type="button" data-view-exam="${E(e.id)}" data-mode="answers">Xem đáp án & HDC</button><a class="button" href="${base}?format=docx&answers=0">Word học sinh</a><a class="button" href="${base}?format=docx&answers=1">Word đáp án</a></div></div>`;ui.ctx.onExamCreated?.(e);message('Đã tạo đề riêng thành công! Thầy/Cô có thể bấm "Làm ngay Bảng 2 Đặc tả từ đề thi này" để đồng bộ.');}
  function openEditorWithDraft(draft){
    ui.editing=draft;
    ui.dirty=true;
    ui.report=null;
    ui.shortfall=null;
    render();
  }
  function openEditorWithExamSpec(exam){
    if(!exam||!Array.isArray(exam.questions))return;
    const g=Number(exam.grade)||8;
    const draft=newDraft(g,false);
    draft.title=`Ma trận & Đặc tả theo đề ${exam.title||exam.exam_code||exam.id}`;
    draft.exam_type=exam.exam_type||'GK1';
    draft.duration=exam.duration||45;
    syncSpecFromExam(draft,exam);
    openEditorWithDraft(draft);
  }
  function createFromPlan(plan){
    const g=Number(plan.grade)||8;
    const draft=newDraft(g,false);
    draft.title=`Ma trận & Đặc tả ${plan.name} Khối ${g}`;
    draft.exam_type=plan.exam_type||'GK1';
    draft.duration=plan.duration||45;
    draft.assessment_plan_id=plan.id;
    draft.assessment_plan=plan;
    const allLs=selectableLessons(g,draft.exam_type);
    if(root.BankAssessmentPlan&&typeof root.BankAssessmentPlan.syncLessonsFromAssessmentPlan==='function'){
      root.BankAssessmentPlan.syncLessonsFromAssessmentPlan(draft,plan,allLs);
    }
    openEditorWithDraft(draft);
  }
  const api={syncSpecFromExam,shortfallHtml,mount,formatRefs,filterRecords,visibleActions,escapeHtml,packageSummary,effectiveKinds,setAllowedKinds,ynTable,setYnCoefficient,requirementLevelOptions,parseMatrixFromMarkdown,downloadMatrixExcelSample,downloadMatrixJsonSample,downloadMatrixMdSample,copyMatrixAiPrompt,computeCv7991Warnings,buildMatrixView,generateMatrixWordHtml,generateMatrixWordStandaloneHtml,downloadMatrixWord,downloadMatrixJson,openCustomMatrixExportDialog,STANDARD_PRESETS,newDraft,openEditorWithDraft,openEditorWithExamSpec,createFromPlan,getAssessmentPlansForMatrix,updateSlotsFromGrid,renumberAllSlots,sortLessonsByPpct,fillLessonPpctRequirements,splitQuestionRequirements,mergeQuestionRequirements,syncSpecFromExam,normalizeSlotNumbers,matrixGridHtml,specGridHtml};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MatrixUI=api;
})(typeof window!=='undefined'?window:globalThis);
