"""Chạy với máy chủ tĩnh tại localhost:8896; chỉ dữ liệu minh họa trong profile tạm."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
exams = json.loads((ROOT / 'tests/fixtures/exam_comparison.json').read_text())
seed = dict(bank=dict(questions=[], ppct=dict(lessons=[])), exams=exams, revisions=[], matrices=[])

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport=dict(width=1440, height=1000))
    page.route('**/*', lambda route: route.continue_() if route.request.url.startswith('http://localhost:8896/') else route.abort())
    page.add_init_script('localStorage.setItem("exammatrix_teacher_cache_offline", '+json.dumps(json.dumps(seed))+');')
    page.goto('http://localhost:8896/#exams')
    page.wait_for_load_state('networkidle')
    button = page.locator('[data-compare-exam="E1"]')
    expect(button).to_be_visible()
    button.click()
    dialog = page.locator('#exam-comparison-dialog')
    expect(dialog).to_be_visible()
    submit = dialog.get_by_role('button', name='So sánh các đề đã chọn')
    submit.click()
    expect(dialog.get_by_role('alert')).to_contain_text('Chọn từ 2 đến 6')
    dialog.locator('input[value="E2"]').check()
    before = page.evaluate('localStorage.getItem("exammatrix_teacher_cache_offline")')
    submit.click()
    expect(page.locator('#exam-comparison-result')).to_contain_text('Khớp cấu trúc theo câu')
    expect(page.locator('#exam-comparison-result')).to_contain_text('0 mã câu (0%)')
    assert page.evaluate('localStorage.getItem("exammatrix_teacher_cache_offline")') == before
    dialog.screenshot(path='/private/tmp/exammatrix-comparison-desktop.png')
    page.set_viewport_size(dict(width=390, height=844))
    expect(submit).to_be_visible()
    bounds = dialog.bounding_box()
    assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= 391
    dialog.screenshot(path='/private/tmp/exammatrix-comparison-mobile.png')
    dialog.get_by_role('button', name='Đóng', exact=True).click()
    expect(dialog).not_to_be_visible()
    # Sửa dữ liệu giả trong bộ nhớ, kiểm báo cáo có chênh lệch.
    page.evaluate('window.FirebaseState.currentData.exams[1].questions[0].points = 3')
    button.click()
    dialog.locator('input[value="E2"]').check()
    submit.click()
    expect(page.locator('#exam-comparison-result')).to_contain_text('Có chênh lệch cấu trúc')
    expect(page.locator('#exam-comparison-result')).to_contain_text('Tổng điểm')
    browser.close()
    print('PASS Chromium: mở/chọn/giới hạn/khớp/lệch/chỉ đọc/đóng; desktop và mobile.')
