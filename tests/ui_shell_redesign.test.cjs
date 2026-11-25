const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(publicDir, 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
const bridgeJs = fs.readFileSync(path.join(publicDir, 'firebase-bridge.js'), 'utf8');

test('index.html preserves required shell, header, toast, and sidebar IDs', () => {
  const requiredIds = [
    'notice',
    'btn-toggle-sidebar',
    'btn-close-sidebar',
    'global-subject-select',
    'current-tab-label',
    'current-grade-badge',
    'btn-ai-assistant',
    'topbar-tools-menu',
    'btn-backup-data',
    'btn-user-guide',
    'refresh',
    'firebase-auth-box',
    'sidebar-backdrop',
  ];
  for (const id of requiredIds) {
    assert(indexHtml.includes(`id="${id}"`), `Missing id="${id}" in public/index.html`);
  }
  assert(indexHtml.includes('id="notice" popover="manual"'), '#notice must use popover="manual" for top-layer visibility');
  assert(!indexHtml.includes('class="page-crumb"'), 'Redundant breadcrumb should be removed from topbar');
  assert(indexHtml.includes('./styles.css?v=20261125m'));
  assert(indexHtml.includes('./matrices.js?v=20261125n'));
  assert(indexHtml.includes('./firebase-bridge.js?v=20261125q'));
  assert(indexHtml.includes('./app.js?v=20261125p'));
});

test('styles.css styles #notice as floating fixed toast, full nav collapse, and single-line topbar', () => {
  assert(stylesCss.includes('position: fixed !important;\n  top: 74px !important;\n  right: 22px !important;'));
  assert(stylesCss.includes('#notice[popover]'));
  assert(stylesCss.includes('#notice.is-leaving'));
  assert(stylesCss.includes('.notice-progress'));
  assert(stylesCss.includes('body.sidebar-collapsed .sidebar {\n    transform: translateX(-100%) !important;'));
  assert(stylesCss.includes('body.sidebar-collapsed .workspace {\n    margin-left: 0 !important;'));
  assert(stylesCss.includes('.topbar-dropdown-panel'));
  assert(stylesCss.includes('.topbar-btn {') && stylesCss.includes('white-space: nowrap !important;'));
});

test('app.js notify uses auto-dismiss top-layer floating toast without scrollIntoView and initializes sidebar/topbar', () => {
  const notifyMatch = appJs.match(/function notify\([\s\S]*?function detailError/);
  assert(notifyMatch, 'notify function not found in public/app.js');
  const notifySrc = notifyMatch[0];
  assert(!notifySrc.includes('scrollIntoView'), 'notify must not call scrollIntoView');
  assert(notifySrc.includes('setTimeout'), 'notify must auto-dismiss via setTimeout');
  assert(notifySrc.includes('showPopover'), 'notify must promote #notice via showPopover');
  assert(notifySrc.includes('notice-close'), 'notify must render close button');
  assert(notifySrc.includes('onmouseenter'), 'notify must pause timer on hover');
  assert(appJs.includes('window.notify=notify'), 'app.js must expose window.notify');
  assert(appJs.includes('function initSidebarToggle()'));
  assert(appJs.includes("getElementById('btn-close-sidebar')"));
  assert(appJs.includes('function initTopbarMenus()'));
});

test('firebase-bridge.js renders streamlined account dropdown, preserves auth/Drive IDs, and delegates toast to window.notify', () => {
  for (const id of ['cloud-sync-pill', 'fb-signin-btn', 'fb-account-menu', 'fb-user-badge', 'fb-account-meta', 'gdrive-sync-btn', 'fb-auth-btn']) {
    assert(bridgeJs.includes(`id="${id}"`), `Missing id="${id}" in public/firebase-bridge.js`);
  }
  assert(bridgeJs.includes("typeof window.notify === 'function'"), 'showToast must delegate to window.notify');
});

test('no browser alert() calls remain anywhere in public/ JS or HTML files', () => {
  const files = fs.readdirSync(publicDir).filter(f => /\.(js|html)$/i.test(f));
  for (const f of files) {
    const content = fs.readFileSync(path.join(publicDir, f), 'utf8');
    assert(!/\balert\s*\(/.test(content), `Found forbidden alert() call in public/${f}`);
  }
});
