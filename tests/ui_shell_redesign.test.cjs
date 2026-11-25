const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const bridgeJs = fs.readFileSync(path.join(root, 'public/firebase-bridge.js'), 'utf8');

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
  assert(!indexHtml.includes('class="page-crumb"'), 'Redundant breadcrumb should be removed from topbar');
  assert(indexHtml.includes('./styles.css?v=20261125k'));
  assert(indexHtml.includes('./firebase-bridge.js?v=20261125k'));
  assert(indexHtml.includes('./app.js?v=20261125k'));
});

test('styles.css styles #notice as floating fixed toast, full nav collapse, and single-line topbar', () => {
  assert(stylesCss.includes('position: fixed !important;\n  top: 74px !important;\n  right: 22px !important;'));
  assert(stylesCss.includes('#notice.is-leaving'));
  assert(stylesCss.includes('.notice-progress'));
  assert(stylesCss.includes('body.sidebar-collapsed .sidebar {\n    transform: translateX(-100%) !important;'));
  assert(stylesCss.includes('body.sidebar-collapsed .workspace {\n    margin-left: 0 !important;'));
  assert(stylesCss.includes('.topbar-dropdown-panel'));
  assert(stylesCss.includes('.topbar-btn {') && stylesCss.includes('white-space: nowrap !important;'));
});

test('app.js notify uses auto-dismiss floating toast without scrollIntoView and initializes sidebar/topbar', () => {
  const notifyMatch = appJs.match(/function notify\([\s\S]*?function detailError/);
  assert(notifyMatch, 'notify function not found in public/app.js');
  const notifySrc = notifyMatch[0];
  assert(!notifySrc.includes('scrollIntoView'), 'notify must not call scrollIntoView');
  assert(notifySrc.includes('setTimeout'), 'notify must auto-dismiss via setTimeout');
  assert(notifySrc.includes('notice-close'), 'notify must render close button');
  assert(notifySrc.includes('onmouseenter'), 'notify must pause timer on hover');
  assert(appJs.includes('function initSidebarToggle()'));
  assert(appJs.includes("getElementById('btn-close-sidebar')"));
  assert(appJs.includes('function initTopbarMenus()'));
});

test('firebase-bridge.js renders streamlined account dropdown and preserves auth/Drive IDs', () => {
  for (const id of ['cloud-sync-pill', 'fb-signin-btn', 'fb-account-menu', 'fb-user-badge', 'fb-account-meta', 'gdrive-sync-btn', 'fb-auth-btn']) {
    assert(bridgeJs.includes(`id="${id}"`), `Missing id="${id}" in public/firebase-bridge.js`);
  }
});
