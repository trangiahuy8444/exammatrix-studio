const assert=require('node:assert/strict');
let ui;
try {ui=require('../public/matrices.js');}catch {ui=null;}
assert.ok(ui,'Matrix UI helpers must be implemented');
assert.deepEqual(ui.visibleActions({status:'locked',mode:'received'}),['preview','export','new-version','archive','use']);
assert.ok(!ui.visibleActions({status:'locked',mode:'authored'}).includes('save'));
assert.equal(ui.formatRefs([{number:1,label:'a'},{number:1,label:'b'}],'matrix'),'(1a, 1b)');
assert.equal(ui.formatRefs([{number:1,label:''}],'specification'),'(Câu 1).');
assert.equal(ui.filterRecords([{grade:9,status:'draft'},{grade:8,status:'locked'}],{grade:9}).length,1);
assert.equal(ui.escapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
assert.equal(ui.packageSummary({matrix:{grade:9,profile:'THCS',version:2}}),'Khối 9 · THCS · phiên bản 2');
console.log('Matrix UI helpers passed');

// B3: mẫu hồ sơ — dạng câu được phép và bảng hệ số Đúng/Sai
assert.deepEqual(ui.effectiveKinds({profile:'THCS'}),['MC','ES']);
assert.deepEqual(ui.effectiveKinds({profile:'THPT'}),['MC','YN','SHORT','ES']);
assert.deepEqual(ui.effectiveKinds({profile:'THCS',allowed_kinds:['YN','MC']}),['MC','YN']);
{const m={profile:'THCS'};ui.setAllowedKinds(m,['MC','ES']);assert.equal('allowed_kinds' in m,false);   // trùng mặc định thì không lưu
 ui.setAllowedKinds(m,['MC','YN','ES']);assert.deepEqual(m.allowed_kinds,['MC','YN','ES']);}
assert.deepEqual(ui.ynTable({}),{0:'0',1:'0.1',2:'0.25',3:'0.5',4:'1'});
{const m={};ui.setYnCoefficient(m,1,'0');assert.deepEqual(m.scoring_policy.yn_table,{0:'0',1:'0',2:'0.25',3:'0.5',4:'1'});
 ui.setYnCoefficient(m,1,'0,1');assert.equal('scoring_policy' in m,false);}  // về mặc định thì bỏ, nhận dấu phẩy
console.log('PASS matrix UI: mẫu hồ sơ và hệ số Đúng/Sai');

// G1-LEVEL4: trình chọn phải giữ đúng mức VDC khi biên tập.
{
 const options=ui.requirementLevelOptions('Vận dụng cao');
 assert.match(options,/<option value="Vận dụng cao" selected>Vận dụng cao<\/option>/);
 assert.match(options,/<option value="Vận dụng">Vận dụng<\/option>/);
 assert.equal((options.match(/<option /g)||[]).length,4);
}
console.log('PASS matrix UI: chọn riêng Vận dụng cao');

// G1: số thiếu đã đo được không thay kết luận khi còn vị trí chưa đối chiếu.
{
 const report={ok:true,complete:false,total_shortfall:0,cells:[],issues:[{code:'empty',message:'Chưa dựng vị trí.'}],unresolved_slots:[]};
 const html=ui.shortfallHtml(report);
 assert.match(html,/Chưa thể kết luận đủ câu/);
 assert.doesNotMatch(html,/Đủ câu đã duyệt cho mọi ô/);
 assert.match(html,/Chưa dựng vị trí\./);
 assert.doesNotMatch(html,/Còn thiếu 0 câu/);
}
{
 const parts=['a','b','c','d'].map((label,i)=>({part_id:'P'+i,label,lesson_code:'B'+(i+1),outcome:'YCCĐ '+i,level:i===3?'Vận dụng cao':'Biết',points:.25}));
 parts[1].outcome='<img src=x onerror=alert(1)>';
 const html=ui.shortfallHtml({ok:false,complete:false,total_shortfall:2,cells:[],issues:[],unresolved_slots:[{slot_id:'YN-1',kind:'YN',number:1,reason:'Cần đối chiếu từng ý.',parts}]});
 for(const label of ['1a','1b','1c','1d','Vận dụng cao','B4'])assert.ok(html.includes(label),label);
 assert.match(html,/Đã xác định thiếu 2 câu/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img/);
}
{
 const html=ui.shortfallHtml({ok:true,complete:true,total_shortfall:0,cells:[],issues:[],unresolved_slots:[]});
 assert.match(html,/Đủ câu đã duyệt cho mọi ô/);
 assert.doesNotMatch(html,/Chưa thể kết luận/);
}
console.log('PASS matrix UI: báo cáo thiếu câu chưa đủ căn cứ và hiển thị mọi ý');
