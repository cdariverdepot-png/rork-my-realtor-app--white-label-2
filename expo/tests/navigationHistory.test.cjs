const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', 'module', code)(module.exports, module);
  return module.exports;
}
const preview = load('lib/previewHistory.ts');
test('preview property back returns to collection, menu and home before leaving the editor', () => {
  const history = [];
  let current = '/';
  for (const destination of ['/menu', '/listings', '/listing/actual-home']) current = preview.previewDestination(history, current, destination);
  assert.equal(current, '/listing/actual-home');
  for (const expected of ['/listings', '/menu', '/']) assert.equal(preview.previousPreviewPage(history), expected);
  assert.equal(preview.previousPreviewPage(history), null);
});
test('repeated footer selections do not create loops or duplicate history', () => {
  const history = [];
  let current = '/';
  for (const destination of ['/menu', '/menu', '/listings', '/menu', '/', '/', '/favorites']) current = preview.previewDestination(history, current, destination);
  assert.deepEqual(history, ['/']);
  assert.equal(current, '/favorites');
  assert.equal(preview.previousPreviewPage(history), '/');
  assert.equal(preview.previousPreviewPage(history), null);
});
test('back falls back to the current workflow for deep links and preserves normal history', () => {
  const { backOr } = load('lib/navIntent.ts');
  const calls = [];
  const router = { canGoBack: () => false, back: () => calls.push('back'), replace: path => calls.push(path) };
  backOr(router); backOr(router, '/');
  router.canGoBack = () => true;
  backOr(router, '/');
  assert.deepEqual(calls, ['/admin', '/', 'back']);
});
test('launch overlay is a sibling of account data, with no splash route or account-key reset', () => {
  const source = read('app/_layout.tsx');
  assert.match(source, /<AccountData\s*\/>\s*<LaunchOverlay\s*\/>/);
  const inner = source.slice(source.indexOf('function RootLayoutInner'), source.indexOf('export default function RootLayout'));
  assert.doesNotMatch(inner, /BootScreen|booting/);
  assert.doesNotMatch(source, /Stack.Screen name="(?:splash|boot|launch)"/);
  assert.match(source, /Stack.Protected guard=\{!isAuthenticated\}/);
});
test('editor drafts are account-scoped and navigation does not discard them', () => {
  const layout = read('app/_layout.tsx');
  assert.match(layout, /React.Fragment key=\{identity\}>\s*<WorkflowDraftProvider>/);
  const context = read('contexts/WorkflowDraftContext.tsx');
  assert.match(context, /useRef\(new Map/);
  assert.doesNotMatch(context, /AsyncStorage|localStorage/);
  const studio = read('app/admin/studio.tsx');
  const leave = studio.slice(studio.indexOf('const leave = () =>'), studio.indexOf('const leaveRef'));
  assert.match(leave, /workflowDrafts.set/);
  assert.doesNotMatch(leave, /window.confirm|Discard|setDirty\(false\)/);
  assert.match(read('components/ThemeCarousel.tsx'), /resumed\?\.index/);
});
test('completed setup is not reopened from an old build URL', () => {
  const build = read('components/InitialRealtorSetup.tsx');
  assert.match(build, /saved.status === 'complete'.*router.dismissTo\('\/admin'\)/);
  assert.match(read('app/admin/ready.tsx'), /router.dismissTo\("\/admin"\)/);
  assert.match(read('app/admin/_layout.tsx'), /name="index" options=\{\{ gestureEnabled: false/);
});
