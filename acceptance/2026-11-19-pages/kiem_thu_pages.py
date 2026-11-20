"""Luồng giáo viên trên máy chủ tĩnh localhost:8897, profile và dữ liệu hoàn toàn giả."""
import json
import os
import subprocess
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
seed = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('./tests/static_api.test.cjs').fixture()))"], cwd=ROOT))
OUT = Path('/private/tmp/exammatrix-pages-20261119')
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport=dict(width=1440, height=1000), accept_downloads=True)
    page.set_default_timeout(10000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.route('**/*', lambda route: route.continue_() if route.request.url.startswith('http://localhost:8897/') else route.abort())
    page.add_init_script('localStorage.setItem("exammatrix_teacher_cache_offline", '+json.dumps(json.dumps(seed))+');')
    try:
        page.goto(os.environ.get('PAGES_TEST_BASE_URL','http://localhost:8897/')+'#matrices')
        page.wait_for_load_state('networkidle')
        page.locator('[data-open="M1"]').first.click()
        shortfall = page.locator('[data-action="shortfall"]')
        shortfall.locator('xpath=ancestor::details[1]/summary').click()
        shortfall.click()
        expect(page.locator('#mx-shortfall')).to_contain_text('Đủ câu đã duyệt')
        agreement = page.locator('#mx-confirm-agreement')
        if agreement.count():
            agreement.check()
        page.locator('[data-action="lock"]:visible, [data-action="save-and-lock"]:visible').first.click()
        page.wait_for_function("window.FirebaseState.currentData.matrices[0].status === 'locked'")
        # Đóng xem trước nếu thao tác khóa mở cửa sổ này.
        for dialog in page.locator('dialog[open]').all():
            dialog.evaluate('(el)=>el.close()')
        page.locator('a[data-tab="bank"]').click()
        for question in seed['bank']['questions']:
            page.locator('input[data-check="'+question['id']+'"]').check()
        page.locator('a[data-tab="revisions"]').click()
        page.locator('#revision-title').fill('Đề cương kiểm thử Pages')
        page.locator('#save-revision').click()
        page.wait_for_function('window.FirebaseState.currentData.revisions.length === 1')
        revision_id = page.evaluate('window.FirebaseState.currentData.revisions[0].id')
        # Chưa có đề khóa: nút phát hành phải bị từ chối thực sự.
        page.locator('[data-rev-act="publish"]').click()
        expect(page.locator('#notice')).to_contain_text('khóa')
        assert page.evaluate('window.FirebaseState.currentData.revisions[0].status') != 'published'
        page.locator('a[data-tab="exams"]').click()
        expect(page.locator('#exam-grade')).to_have_value('9')
        page.locator('#exam-template').select_option('mx:M1')
        page.locator('#exam-title').fill('Đề kiểm thử Pages')
        page.locator('#exam-revision').select_option(revision_id)
        expect(page.locator('#generate-exam')).to_be_enabled()
        page.locator('#generate-exam').click()
        page.wait_for_function('window.FirebaseState.currentData.exams.length === 1')
        exam_id = page.evaluate('window.FirebaseState.currentData.exams[0].id')
        assert page.evaluate('window.FirebaseState.currentData.exams[0].questions.length') == 2
        for action, status in [('submit', 'pending_approval'), ('approve', 'locked')]:
            page.locator('[data-exam-act="'+action+'"][data-exam-id="'+exam_id+'"]').click()
            page.wait_for_function('(status)=>window.FirebaseState.currentData.exams[0].status===status', arg=status)
        page.locator('[data-exam-act="publish"][data-exam-id="'+exam_id+'"]').click()
        expect(page.locator('#notice')).to_contain_text('đề cương')
        page.locator('a[data-tab="revisions"]').click()
        page.locator('[data-rev-act="publish"]').click()
        page.wait_for_function('window.FirebaseState.currentData.revisions[0].status === "published"')
        page.locator('a[data-tab="exams"]').click()
        page.locator('[data-exam-act="publish"][data-exam-id="'+exam_id+'"]').click()
        page.wait_for_function('window.FirebaseState.currentData.exams[0].status === "published"')
        student_url = '/api/exams/'+exam_id+'/export?format=docx&answers=0'
        with page.expect_download() as download_info:
            page.locator('a[href="'+student_url+'"]:visible').first.click()
        download_info.value.save_as(OUT/'de_hoc_sinh.docx')
        with zipfile.ZipFile(OUT/'de_hoc_sinh.docx') as doc:
            assert doc.testzip() is None
            xml = doc.read('word/document.xml').decode()
            assert 'Đáp án đúng' not in xml and 'PRIVATE_' not in xml
        card = page.locator('article.saved-item').filter(has=page.locator('[data-exam-id="'+exam_id+'"]')).first
        if not page.locator('a[href="/api/exams/'+exam_id+'/bundle.zip?format=docx"]:visible').count():
            card.locator('details').first.locator('summary').click()
        with page.expect_download() as download_info:
            page.locator('a[href="/api/exams/'+exam_id+'/bundle.zip?format=docx"]:visible').first.click()
        download_info.value.save_as(OUT/'ho_so.zip')
        with zipfile.ZipFile(OUT/'ho_so.zip') as bundle:
            assert bundle.testzip() is None
            assert 'Bao_cao_dong_goi_ho_so.txt' in bundle.namelist()
        before = page.evaluate('JSON.stringify(window.FirebaseState.currentData.exams[0].questions)')
        page.evaluate("async()=>{const q=window.FirebaseState.currentData.bank.questions[0];await window.FirebaseClient.handle('/api/questions/save',{question:{...q,question:'Đã sửa nội dung sau phát hành'}});}")
        assert page.evaluate('JSON.stringify(window.FirebaseState.currentData.exams[0].questions)') == before
        assert page.evaluate('window.FirebaseState.currentData.bank.questions[0].review_status') == 'needs_review'
        page.screenshot(path=str(OUT/'luong-pages.png'))
        negative = browser.new_page(viewport=dict(width=1440,height=1000))
        negative.set_default_timeout(10000)
        negative.on('pageerror', lambda error: errors.append(str(error)))
        negative.route('**/*', lambda route: route.continue_() if route.request.url.startswith('http://localhost:8897/') else route.abort())
        missing=json.loads(json.dumps(seed))
        missing['matrices'][0]['status']='locked'
        for q in missing['bank']['questions']:
            q['review_status']='draft'
        negative.add_init_script('localStorage.setItem("exammatrix_teacher_cache_offline", '+json.dumps(json.dumps(missing))+');')
        negative.goto(os.environ.get('PAGES_TEST_BASE_URL','http://localhost:8897/')+'#matrices')
        negative.wait_for_load_state('networkidle')
        negative.locator('[data-open="M1"]').first.click()
        shortage=negative.locator('[data-action="shortfall"]')
        shortage.locator('xpath=ancestor::details[1]/summary').click()
        shortage.click()
        expect(negative.locator('#mx-shortfall')).to_contain_text('Còn thiếu 2 câu đã duyệt')
        negative.locator('a[data-tab="exams"]').click()
        negative.locator('#import-exam-file').set_input_files(dict(name='de-gia.json',mimeType='application/json',buffer=json.dumps({'title':'Đề giả','questions':[],'verification':{'passed':True}}).encode()))
        expect(negative.locator('#confirm-import-exams')).to_be_disabled()
        assert negative.evaluate('window.FirebaseState.currentData.exams.length') == 0
        negative.screenshot(path=str(OUT/'chan-de-chua-dat.png'))
        negative.close()
        assert not errors, errors
        print('PASS Chromium Pages: ma trận → đề cương → sinh đề thật → khóa → phát hành → DOCX/ZIP; chặn phát hành sớm, thiếu câu và nhập giả đạt; snapshot bất biến.')
    except Exception:
        page.screenshot(path=str(OUT/'loi-pages.png'), full_page=True)
        print('PAGE ERRORS:', errors)
        print('NOTICE:', page.locator('#notice').inner_text())
        print('FORM:', page.evaluate("({grade:document.querySelector('#exam-grade')?.value,options:[...document.querySelectorAll('#exam-template option')].map(x=>[x.value,x.textContent]),matrices:window.store?.matrixRecords?.map(m=>({id:m.id,status:m.status,grade:m.grade,subject:m.subject_name}))})"))
        raise
    finally:
        browser.close()
