const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
globalThis.crypto=webcrypto;
const api=require('../public/static-api.js');
const engine=require('../public/static-exam-engine.js');
const workflow=require('../public/static-exam-workflow.js');
const env={engine,workflow,subject:'Tin học',actor:'Giáo viên minh họa'};
const ppct={lessons:[{grade:8,subject_name:'Tin học',lesson_code:'B8a',lesson_name:'Bài 8a',outcomes:['Nhận biết dữ liệu','Xử lí dữ liệu']}]};
const mc=(question,extra={})=>({grade:8,type:'MC',level:'Biết',lesson_code:'B8a',learning_outcome:'Xử lí dữ liệu',question,options:['Một','Hai','Ba','Bốn'],correct:1,...extra});
const es=question=>({grade:8,type:'ES',level:'Vận dụng',lesson_code:'B8A',learning_outcome:'Nhận biết dữ liệu',question,rubric:[1,2,3,4].map(i=>({criterion:'Ý '+i,points:0.25})),equivalent_answer_policy:'Tương đương'});
function data(){return {bank:{questions:[{...mc('Câu cũ?'),id:'OLD1',subject_name:'Tin học',review_status:'approved'}],ppct},matrices:[],revisions:[],exams:[]};}

test('Pages: nhập thêm giữ câu cũ, bỏ câu trùng, sửa mã bài và để Nháp', async()=>{
 const r=await api.handle('/api/bank/import',{mode:'append',bank:{questions:[mc('Câu mới?',{review_status:'approved'}),es('Tự luận mới?'),mc(' câu  CŨ? ')]}},data(),env);
 const qs=r.data.bank.questions;
 assert.equal(qs.length,3);assert.equal(qs[0].id,'OLD1');assert.equal(qs[0].review_status,'approved');
 assert.deepEqual([r.response.import_report.added,r.response.import_report.skipped],[2,1]);
 assert.equal(qs[2].lesson_code,'B8a');
 assert.ok(qs.slice(1).every(q=>q.review_status==='draft'));
});

test('Pages: một câu sai thì không ghi câu nào và báo số thứ tự', async()=>{
 const cases=[[mc('Hợp lệ?'),mc('Sai bài?',{lesson_code:'B99'})],[mc('Hợp lệ?'),mc('Sai YCCĐ?',{learning_outcome:'Khác'})],[mc('Hợp lệ?'),{...es('Thiếu chấm?'),rubric:[]}],[mc('Lặp?'),mc('Lặp?')]];
 for(const items of cases){
  const input=data(),before=JSON.stringify(input);
  await assert.rejects(api.handle('/api/bank/import',{mode:'append',bank:{questions:items}},input,env),e=>e.details.loi[0].stt===2);
  assert.equal(JSON.stringify(input),before);
 }
 await assert.rejects(api.handle('/api/bank/import',{mode:'append',bank:{questions:[mc('Câu cũ?')]}},data(),env),/Không có câu mới/);
});

test('Pages: YCCĐ lệch dấu, viết tắt cụm từ hoặc gõ dính chữ được tự động chuẩn hoá khớp PPCT', async()=>{
 const r = await api.handle('/api/bank/import', {
  mode: 'append',
  bank: {
   questions: [
    mc('Câu hỏi với YCCĐ viết hoa thường và chấm câu khác?', { learning_outcome: 'nhận biết dữ liệu.' }),
    mc('Câu hỏi với YCCĐ chứa cụm từ chính xác?', { learning_outcome: 'Học sinh thực hiện xử lí dữ liệu số liệu' })
   ]
  }
 }, data(), env);
 const qs = r.data.bank.questions;
 assert.equal(qs[1].learning_outcome, 'Nhận biết dữ liệu');
 assert.equal(qs[2].learning_outcome, 'Xử lí dữ liệu');
});
