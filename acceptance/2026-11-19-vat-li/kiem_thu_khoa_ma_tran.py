"""Tái hiện trường hợp mở File trên Chromium; chỉ dùng profile và ma trận minh họa."""
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[2]
data=json.loads(subprocess.check_output(['node','-e',"console.log(JSON.stringify(require('./tests/static_api.test.cjs').fixture()))"],cwd=ROOT))
matrix=data['matrices'][0]
matrix.update(profile='THPT',grade=10,subject_name='Vật lí',title='Ma trận Vật lí minh họa')
matrix['requirements'][0]['competency']='NL_CHUNG'
for lesson in data['bank']['ppct']['lessons']:
    lesson.update(grade=10,subject_name='Vật lí')
for question in data['bank']['questions']:
    question.update(grade=10,subject_name='Vật lí')
OUT=Path('/private/tmp/exammatrix-physics-indicators-20261119')
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for bad_code in (False,True):
        sample=json.loads(json.dumps(data))
        if bad_code:
            sample['matrices'][0]['slots'][0]['parts'][0]['indicator']='VL_MISSING'
        context=browser.new_context(viewport=dict(width=1440,height=1000))
        page=context.new_page()
        page.set_default_timeout(10000)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('**/*',lambda route:route.continue_() if route.request.url.startswith('file:') else route.abort())
        script='localStorage.setItem("exammatrix_active_subject","Vật lí");if(!localStorage.getItem("exammatrix_teacher_cache_offline"))localStorage.setItem("exammatrix_teacher_cache_offline",'+json.dumps(json.dumps(sample))+');'
        page.add_init_script(script)
        try:
            page.goto((ROOT/'public/index.html').as_uri()+'#matrices')
            page.wait_for_load_state('networkidle')
            page.locator('[data-open="M1"]').first.click()
            page.locator('[data-action="save-and-lock"]').click()
            if bad_code:
                expect(page.locator('#mx-report')).to_contain_text('Câu 1 (MC)')
                expect(page.locator('#mx-report')).to_contain_text('VL_MISSING')
                assert page.evaluate('window.FirebaseState.currentData.matrices[0].status')=='draft'
            else:
                page.wait_for_function('window.FirebaseState.currentData.matrices[0].status === "locked"')
                actual=page.evaluate('window.FirebaseState.currentData.matrices[0]')
                assert actual['requirements']==matrix['requirements']
                assert actual['slots']==matrix['slots']
                assert actual['indicator_catalog']==[]
                page.reload()
                page.wait_for_function('window.FirebaseState.currentData.matrices[0].status === "locked"')
            assert not errors,errors
            page.screenshot(path=str(OUT/('bao-loi-cu-the.png' if bad_code else 'vat-li-da-khoa.png')))
        except Exception:
            print(page.locator('body').inner_text()[-14000:])
            print('PAGE ERRORS',errors)
            raise
        finally:
            context.close()
    browser.close()
print('PASS File/Chromium: Vật lí THPT không khai chỉ báo khóa được, giữ nguyên điểm/YCCĐ khi tải lại; mã sai vẫn bị chặn và chỉ rõ câu.')
