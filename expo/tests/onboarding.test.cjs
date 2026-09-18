const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
// Load the production pure-data rules, without starting native UI or backend clients.
function load(name) {
  const file = path.join(root, name + '.ts');
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', source)(id => id.startsWith('@/') ? load(id.slice(2)) : require(id), module, module.exports);
  return module.exports;
}
const { requiredStatus, visibleSections, sectionState, REQUIRED_FIELDS } = load('constants/sections');
const { realtorSetupState, clientSetupState } = load('lib/onboardingState');
const { essentialsMet, visibleSteps, missingRequired } = load('constants/clientProfile');
const { editorSave } = load('lib/editorSave');
const { imagePosition, imagePositionKey } = load('lib/themeImages');
const { THEME_LOOKS } = load('constants/theme');
const { preserveProfile } = load('lib/preserveProfile');
test('legacy profiles retain saved copy, themes, hidden sections and arrays while missing fields receive defaults', () => {
  const defaults = { realtor: { name: '', city: '', newField: 'default' }, credentials: { license: { number: '', state: '' } }, theme: { accent: 'pewter' }, note: { body: ['default'] } };
  const saved = { realtor: { name: 'Eliza Vance', city: 'User city' }, credentials: { license: { number: 'legacy-license' } }, theme: { accent: 'gold' }, note: { body: [] }, sectionStates: { note: 'hidden' }, customField: 'keep' };
  const snapshot = JSON.stringify(saved);
  const merged = preserveProfile(defaults, saved);
  assert.equal(merged.realtor.name, 'Eliza Vance');
  assert.equal(merged.realtor.newField, 'default');
  assert.equal(merged.credentials.license.number, 'legacy-license');
  assert.equal(merged.credentials.license.state, '');
  assert.equal(merged.theme.accent, 'gold');
  assert.deepEqual(merged.note.body, []);
  assert.equal(merged.sectionStates.note, 'hidden');
  assert.equal(merged.customField, 'keep');
  assert.equal(JSON.stringify(saved), snapshot);
});
const fixture = () => ({
  realtor: { name: 'Test Realtor', city: 'Test City', phone: '555-0100', email: '', heroMessage: 'Your next home', tagline: '' },
  portraitUrl: 'test-portrait.jpg', note: { body: [] }, beat: { bullets: [] }, testimonials: [], recentlyClosed: [],
  credentials: { designations: [], education: [], awards: [], memberships: [], languages: [], license: { brokerage: 'Test Brokerage', number: 'AB 12-34 / X', state: 'Test region' } },
  theme: { accent: 'pewter', displayFont: 'grotesk', surface: 'alabaster' }
});
test('existing six required fields remain the source of truth; flexible license formats pass', () => {
  assert.deepEqual(REQUIRED_FIELDS.map(f => f.id), ['name','portrait','city','contact','heroLine','license']);
  assert.equal(requiredStatus(fixture()).complete, true);
  for (const field of REQUIRED_FIELDS) {
    const b = fixture();
    if (field.id === 'portrait') b.portraitUrl = '';
    else if (field.id === 'license') b.credentials.license.number = '';
    else if (field.id === 'contact') b.realtor.phone = '';
    else if (field.id === 'heroLine') b.realtor.heroMessage = '';
    else b.realtor[field.id] = '';
    assert.equal(requiredStatus(b).complete, false, field.id);
    assert.equal(realtorSetupState(b, true, 4), 'setup-incomplete');
  }
});
test('base creation, credentials and connected client states stay distinct', () => {
  assert.equal(realtorSetupState(fixture(), false), 'base-app-created');
  assert.equal(realtorSetupState(fixture(), true), 'credentials-available');
  assert.equal(realtorSetupState(fixture(), true, 1), 'client-connected');
});
test('hidden content survives removal and restores according to readiness', () => {
  const b = fixture(); b.note.body = ['A real note'];
  const ctx = { brand: b, visibleListingCount: 0 };
  assert.ok(visibleSections(ctx).includes('note'));
  b.sectionStates = { note: 'hidden' };
  assert.equal(sectionState(b, 'note', true), 'hidden');
  assert.ok(!visibleSections(ctx).includes('note'));
  assert.deepEqual(b.note.body, ['A real note']);
  delete b.sectionStates.note;
  assert.ok(visibleSections(ctx).includes('note'));
  b.note.body = [];
  assert.equal(sectionState(b, 'note', false), 'empty');
  assert.ok(!visibleSections(ctx).includes('note'));
});
test('blank repeater rows and empty listings never expose client sections', () => {
  const b = fixture(); b.testimonials = [{ quote: ' ', author: ' ' }];
  b.recentlyClosed = [{ address: '', price: '' }]; b.credentials.education = [{ institution: '', credential: '' }];
  const sections = visibleSections({ brand: b, visibleListingCount: 0 });
  for (const id of ['listings','note','beat','social','credentials']) assert.ok(!sections.includes(id), id);
  b.note.body = ['', '', 'A later paragraph'];
  assert.ok(visibleSections({ brand: b, visibleListingCount: 0 }).includes('note'));
});
test('client invitation and saved completion cannot bypass required profile fields', () => {
  assert.equal(clientSetupState(false, true, true), 'invitation-required');
  assert.equal(clientSetupState(true, false, true), 'profile-incomplete');
  assert.equal(clientSetupState(true, true, false), 'profile-incomplete');
  assert.equal(clientSetupState(true, true, true), 'experience-accessible');
  assert.equal(essentialsMet({}), false);
  const answers = { fullName: 'Test Client', preferredName: 'Test', phone: '555-0100', contactMethod: 'text', goal: 'buy', timeline: 'soon' };
  assert.equal(essentialsMet(answers), true);
  delete answers.phone;
  assert.equal(essentialsMet(answers), false);
  assert.ok(visibleSteps(answers).some(s => missingRequired(s, answers).some(f => f.id === 'phone')));
});
test('theme changes preserve canonical content; content saves preserve saved image positioning', () => {
  const saved = fixture(); saved.theme.imagePositions = { old: { x: 0, y: 100 } }; saved.layoutId = 'private-collection';
  const draft = structuredClone(saved); draft.realtor.name = 'Draft name'; draft.theme.accent = 'gold'; draft.layoutId = 'warm-concierge';
  assert.equal(editorSave(saved, draft, 'theme').realtor.name, 'Test Realtor');
  assert.equal(editorSave(saved, draft, 'theme').layoutId, 'warm-concierge');
  assert.equal(editorSave(saved, draft, 'content').realtor.name, 'Draft name');
  assert.equal(editorSave(saved, draft, 'content').layoutId, 'private-collection');
  assert.deepEqual(editorSave(saved, draft, 'content').theme, saved.theme);
});
test('all 11 retained looks use independent image positions without changing the image asset', () => {
  assert.equal(THEME_LOOKS.length, 11);
  const keys = new Set(THEME_LOOKS.map(imagePositionKey)); assert.equal(keys.size, 11);
  const theme = { ...fixture().theme, imagePositions: {} };
  const key = imagePositionKey(theme); theme.imagePositions[key] = { x: 0, y: 100 };
  assert.deepEqual(imagePosition(theme), { left: '0%', top: '100%' });
  assert.deepEqual(imagePosition({ ...theme, accent: 'gold' }), { left: '50%', top: '50%' });
  theme.imagePositions[key] = { x: -100, y: NaN };
  assert.deepEqual(imagePosition(theme), { left: '0%', top: '50%' });
});
