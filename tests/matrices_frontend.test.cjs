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
