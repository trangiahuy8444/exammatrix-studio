'use strict';
// Nhận diện trình duyệt nhúng (Zalo, Messenger…): Google chặn đăng nhập tại đó, web phải hướng dẫn mở bằng trình duyệt thường.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/core.js');

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ';
const AND = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) ';

test('Nhận ra trình duyệt trong Zalo, Messenger, Facebook và webview Android', () => {
  assert.equal(C.inAppBrowserName(IOS + 'Mobile/15E148 Zalo iOS/23.10.01'), 'Zalo');
  assert.equal(C.inAppBrowserName(AND + 'Version/4.0 Chrome/129.0 Mobile Safari/537.36 Zalo android/12100'), 'Zalo');
  assert.equal(C.inAppBrowserName(IOS + 'Mobile/15E148 [FBAN/MessengerForiOS;FBAV/480.0]'), 'Messenger');
  assert.equal(C.inAppBrowserName(AND + 'Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0;]'), 'Messenger');
  assert.equal(C.inAppBrowserName(IOS + 'Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]'), 'Facebook');
  assert.equal(C.inAppBrowserName(AND.replace('SM-A546E)', 'SM-A546E; wv)') + 'Version/4.0 Chrome/129.0 Mobile Safari/537.36'), 'một ứng dụng khác');
});

test('Không cảnh báo nhầm trên trình duyệt thường', () => {
  for (const agent of [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    IOS + 'Version/18.0 Mobile/15E148 Safari/604.1',
    IOS + 'CriOS/130.0 Mobile/15E148 Safari/604.1',
    AND + 'Chrome/130.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0 CocCoc/1',
    '', undefined
  ]) assert.equal(C.inAppBrowserName(agent), null, String(agent));
});
