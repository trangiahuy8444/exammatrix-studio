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
  assert(indexHtml.includes('id="app-modal-dialog"'), 'Missing #app-modal-dialog in public/index.html');
  assert(indexHtml.includes('id="spec-bank-picker-dialog"'), 'Missing #spec-bank-picker-dialog in public/index.html');
  assert(indexHtml.includes('./styles.css?v=20261126c'));
  assert(indexHtml.includes('./core.js?v=20261126g'));
  assert(indexHtml.includes('./matrices.css?v=20261127b'));
  assert(indexHtml.includes('./matrices.js?v=20261127b'));
  assert(indexHtml.includes('./firebase-bridge.js?v=20261126g'));
  assert(indexHtml.includes('./app.js?v=20261126f'));
  assert(indexHtml.includes('./knowledge-ui.js?v=20261126c'));
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
  assert(appJs.includes('rev-vis-box') && appJs.includes('rev-vis-compare') && appJs.includes('function visualDiffPair('));
  assert(appJs.includes('function renderExamOverlapVisual('));
  assert(appJs.includes('const activeRev=shownRevs.find('), 'renderRevisions must select activeRev strictly from grade/subject-filtered shownRevs');
  assert(!appJs.includes('store.revisions[0]'), 'renderRevisions must not fall back to cross-grade store.revisions[0]');
  assert(appJs.includes("store.activeRevisionViewId=null;store.revCoverageExamId=null;"), 'setActiveGrade must clear cross-grade activeRevisionViewId');
  assert(appJs.includes('async function createRevisionFromExam(') && appJs.includes('data-create-rev-from-exam'), 'app.js must provide createRevisionFromExam two-way workflow button');
  assert(stylesCss.includes('.rev-vis-cell') && stylesCss.includes('.rev-vis-compare'));
  const matricesCss = fs.readFileSync(path.join(publicDir, 'matrices.css'), 'utf8');
  assert(matricesCss.includes('.matrix-spec-table tbody td') && matricesCss.includes('.mx-spec-lesson-cell'), 'matrices.css must style Table 2 lesson boundaries and cells');
});

test('firebase-bridge.js renders streamlined account dropdown, preserves auth/Drive IDs, and delegates toast to window.notify', () => {
  for (const id of ['cloud-sync-pill', 'fb-signin-btn', 'fb-account-menu', 'fb-user-badge', 'fb-account-meta', 'gdrive-sync-btn', 'fb-auth-btn']) {
    assert(bridgeJs.includes(`id="${id}"`), `Missing id="${id}" in public/firebase-bridge.js`);
  }
  assert(bridgeJs.includes("typeof window.notify === 'function'"), 'showToast must delegate to window.notify');
});

test('no browser alert(), confirm(), or prompt() calls remain anywhere in public/ JS or HTML files', () => {
  const coreJs = fs.readFileSync(path.join(publicDir, 'core.js'), 'utf8');
  assert(coreJs.includes('function uiConfirm(') && coreJs.includes('function uiPrompt(') && coreJs.includes('function uiMultiPrompt('));
  assert(stylesCss.includes('dialog.app-modal-dialog') && stylesCss.includes('button.danger-solid'));
  const files = fs.readdirSync(publicDir).filter(f => /\.(js|html)$/i.test(f));
  for (const f of files) {
    const content = fs.readFileSync(path.join(publicDir, f), 'utf8');
    assert(!/\b(alert|confirm|prompt)\s*\(/.test(content), `Found forbidden native dialog call in public/${f}`);
  }
});
