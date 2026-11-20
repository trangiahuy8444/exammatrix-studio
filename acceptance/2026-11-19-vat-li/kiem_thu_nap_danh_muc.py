"""Kiểm luồng nạp danh mục trên File/Chromium; profile và dữ liệu hoàn toàn minh họa."""
import json
import subprocess
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[2]
OUT=Path('/private/tmp/exammatrix-catalog-20261119');OUT.mkdir(exist_ok=True)
data=json.loads(subprocess.check_output(['node','-e',"console.log(JSON.stringify(require('./tests/static_api.test.cjs').fixture()))"],cwd=ROOT))
m=data['matrices'][0];m.update(profile='THPT',grade=10,subject_name='Vật lí',title='Ma trận Vật lí minh họa')
m['requirements'][0]['competency']='NL_CHUNG'
for l in data['bank']['ppct']['lessons']:l.update(grade=10,subject_name='Vật lí')
headers=['Mã năng lực','Tên thành phần năng lực','Mã chỉ báo','Mô tả chỉ báo']
rows=[headers,['VL','Thành phần minh họa','VL.1','Chỉ báo minh họa <b>văn bản</b>']]
text='\n'.join('\t'.join(row) for row in rows)
xlsx=OUT/'danh-muc-minh-hoa.xlsx'
with zipfile.ZipFile(xlsx,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Danh mục" sheetId="1" r:id="rId1"/></sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
    xml='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    for n,row in enumerate(rows,1):
        xml+=f'<row r="{n}">'+''.join(f'<c r="{chr(65+i)}{n}" t="inlineStr"><is><t>{escape(v)}</t></is></c>' for i,v in enumerate(row))+'</row>'
    z.writestr('xl/worksheets/sheet1.xml',xml+'</sheetData></worksheet>')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport=dict(width=1440,height=1100))
    page=context.new_page();page.set_default_timeout(15000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/*',lambda route:route.continue_() if route.request.url.startswith('file:') else route.abort())
    page.add_init_script('localStorage.setItem("exammatrix_active_subject","Vật lí");if(!localStorage.getItem("exammatrix_teacher_cache_offline"))localStorage.setItem("exammatrix_teacher_cache_offline",'+json.dumps(json.dumps(data))+');')
    try:
        page.goto((ROOT/'public/index.html').as_uri()+'#matrices');page.wait_for_load_state('networkidle')
        page.locator('[data-open="M1"]').first.click()
        page.locator('#mx-catalog-panel summary').first.click()
        page.locator('#mx-catalog-text').fill(text+'\nVL\tThành phần minh họa\tVL.1\tTrùng mã')
        page.locator('[data-catalog-action="preview"]').click()
        expect(page.locator('#mx-catalog-preview')).to_contain_text('Trùng mã')
        assert not page.locator('[data-catalog-action="save"]').count()
        page.locator('#mx-catalog-file').set_input_files(str(xlsx))
        expect(page.locator('[data-catalog-action="save"]')).to_be_enabled()
        expect(page.locator('#mx-catalog-preview')).to_contain_text('VL.1')
        assert page.locator('#mx-catalog-preview b').count()==0
        page.screenshot(path=str(OUT/'01-xem-truoc.png'))
        page.locator('[data-catalog-action="save"]').click()
        expect(page.locator('#mx-catalog-library')).to_contain_text('phiên bản 1')
        page.locator('[data-catalog-action="apply"]').click()
        advanced=page.locator('details').filter(has=page.locator('[data-field="requirements.0.competency"]')).first
        advanced.locator('summary').first.click()
        page.locator('[data-field="requirements.0.competency"]').select_option('VL')
        for i in range(2):page.locator(f'[data-field="slots.{i}.parts.0.indicator"]').select_option('VL.1')
        page.locator('[data-action="save-and-lock"]').click()
        page.wait_for_function('window.FirebaseState.currentData.matrices[0].status === "locked"')
        snapshot=page.evaluate('JSON.stringify(window.FirebaseState.currentData.matrices[0])')
        page.reload();page.wait_for_load_state('networkidle')
        page.wait_for_function('window.FirebaseState.currentData.matrices[0].status === "locked"')
        assert page.evaluate('JSON.stringify(window.FirebaseState.currentData.matrices[0])')==snapshot
        page.locator('[data-open="M1"]').first.click()
        page.locator('#mx-catalog-panel summary').first.click()
        page.locator('#mx-catalog-text').fill(text.replace('Thành phần minh họa','Thành phần bản hai'))
        page.locator('[data-catalog-action="preview"]').click();page.locator('[data-catalog-action="save"]').click()
        expect(page.locator('#mx-catalog-library')).to_contain_text('phiên bản 2')
        assert page.evaluate('JSON.stringify(window.FirebaseState.currentData.matrices[0])')==snapshot
        page.locator('[data-catalog-action="apply"]').click()
        expect(page.locator('#mx-catalog-message')).to_contain_text('phiên bản nháp')
        page.screenshot(path=str(OUT/'02-khoa-va-cap-nhat-danh-muc.png'))
        page.reload();page.wait_for_load_state('networkidle')
        assert page.evaluate('JSON.stringify(window.FirebaseState.currentData.matrices[0])')==snapshot
        assert page.evaluate('window.FirebaseState.currentData.bank.competency_catalogs[0].revision')==2
        assert not errors,errors
        print('PASS Chromium/File: XLSX xem trước, chặn trùng mã, gắn năng lực/chỉ báo, chốt, tải lại, cập nhật thư viện giữ nguyên ma trận khóa.')
    except Exception:
        print(page.locator('body').inner_text()[-14000:]);print('PAGE ERRORS',errors)
        page.screenshot(path=str(OUT/'loi.png'))
        raise
    finally:
        context.close();browser.close()
