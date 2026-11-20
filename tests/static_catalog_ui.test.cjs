const test=require('node:test'),assert=require('node:assert/strict');
test('Word preview renders imported catalog as text and retains descriptions',()=>{
 const m=require('./static_api.test.cjs').fixture().matrices[0];m.profile='THPT';
 m.competency_catalog=[{code:'<b>VL</b>',name:'Thành phần minh họa'}];m.indicator_catalog=[{code:'VL1',competency:'<b>VL</b>',text:'Mô tả <img src=x>'}];
 m.requirements[0].competency='<b>VL</b>';m.slots.forEach(s=>s.parts.forEach(p=>p.indicator='VL1'));
 const html=require('../public/matrices.js').generateMatrixWordHtml(m,'all');
 assert.ok(!html.includes('<b>VL</b>'));assert.ok(!html.includes('<img src=x>'));
 assert.ok(html.includes('Thành phần minh họa'));assert.ok(html.includes('Mô tả &lt;img src=x&gt;'));
});
test('applying catalog preserves question content and protects locked matrices',()=>{
 const ui=require('../public/competency-catalog-ui.js');
 const matrix={subject_name:'Vật lí',status:'draft',requirements:[{id:'R1',competency:'NL_CHUNG'}],slots:[{id:'S1',parts:[{points:10}]}]};
 const catalog={subject_name:'Vật lí',revision:2,competencies:[{code:'VL',name:'Minh họa'}],indicators:[{code:'VL1',competency:'VL',text:'Minh họa'}]};
 const before=JSON.stringify(matrix),result=ui.applyCatalog(matrix,catalog,'Vật lí');
 assert.equal(JSON.stringify(matrix),before);assert.deepEqual(result.requirements,matrix.requirements);assert.deepEqual(result.slots,matrix.slots);
 assert.equal(result.catalog_revision,2);assert.deepEqual(result.competency_catalog,catalog.competencies);
 catalog.competencies[0].name='Đổi';assert.equal(result.competency_catalog[0].name,'Minh họa');
 for(const extra of [{status:'locked',allow_custom_override:true},{status:'archived'},{matrix_locked:true},{spec_locked:true},{mode:'received'}])assert.throws(()=>ui.applyCatalog({...matrix,...extra},catalog,'Vật lí'));
 assert.throws(()=>ui.applyCatalog(matrix,catalog,'Toán'));
});
