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

test('account errors never display backend diagnostics', () => {
  const { authErrorMessage } = load('lib/authErrors');
  for (const code of ['PGRST202', 'unknown', undefined]) {
    const message = authErrorMessage({ code, message: 'public.ensure_realtor_auth_record(p_name) schema cache secret' });
    assert.doesNotMatch(message, /public\.|p_name|schema|secret/);
  }
  assert.match(authErrorMessage({ code: 'invalid_credentials' }), /password/);
  assert.match(authErrorMessage({ code: 'over_email_send_rate_limit' }), /wait/);
  assert.doesNotThrow(() => authErrorMessage(null));
});

test('signup email always returns to the published destination, never loopback', () => {
  const { signupEmailRedirect, PUBLISHED_AUTH_RETURN } = load('lib/authRedirect');
  assert.equal(signupEmailRedirect('http://127.0.0.1:4179'), PUBLISHED_AUTH_RETURN);
  assert.equal(signupEmailRedirect(PUBLISHED_AUTH_RETURN), PUBLISHED_AUTH_RETURN);
  assert.equal(signupEmailRedirect(), PUBLISHED_AUTH_RETURN);
  assert.equal(signupEmailRedirect('https://untrusted.example'), PUBLISHED_AUTH_RETURN);
  assert.equal(signupEmailRedirect('http://127.0.0.1:4178'), PUBLISHED_AUTH_RETURN);
});

test('all seven reference themes switch presentation without replacing profile, photos or optional states', () => {
  const { THEME_CAROUSEL_ORDER, themeCandidate } = load('constants/themeDesigns');
  const saved = fixture();
  saved.sectionStates = { note: 'hidden', beat: 'empty' };
  saved.theme.imagePositions = { legacy: { x: 71, y: 33 } };
  const before = JSON.stringify(saved);
  assert.equal(new Set(THEME_CAROUSEL_ORDER).size, 7);
  for (const id of THEME_CAROUSEL_ORDER) {
    const next = themeCandidate(saved, id);
    assert.equal(next.layoutId, id);
    assert.equal(next.realtor, saved.realtor);
    assert.equal(next.portraitUrl, saved.portraitUrl);
    assert.equal(next.note, saved.note);
    assert.equal(next.sectionStates, saved.sectionStates);
    assert.equal(next.theme.imagePositions, saved.theme.imagePositions);
    assert.equal(next.theme.presentationVersion, 2);
  }
  assert.equal(JSON.stringify(saved), before);
});
test('sample profiles are isolated, theme-specific and replaced wholesale by completed user information', () => {
  const { themePreview, themeSample } = load('constants/themeSamples');
  const { THEME_CAROUSEL_ORDER, themeCandidate } = load('constants/themeDesigns');
  const saved = fixture();
  const homes = [{ id: 'real-home', title: 'My real listing' }];
  const before = JSON.stringify(saved);
  const names = THEME_CAROUSEL_ORDER.map(id => themeSample(id).brand.realtor.name);
  assert.equal(new Set(names).size, 7);
  assert.equal(names.filter(name => name.includes('Eliza')).length, 1);
  for (const id of THEME_CAROUSEL_ORDER) {
    const sample = themePreview(saved, homes, id, true);
    assert.equal(sample.sample, true);
    assert.ok(sample.listings.every(home => home.id.startsWith('sample-')));
    const actual = themePreview(saved, homes, id, false);
    assert.equal(actual.sample, false);
    assert.equal(actual.brand.realtor, saved.realtor);
    assert.equal(actual.listings, homes);
    assert.equal(themeCandidate(saved, id).portraitUrl, saved.portraitUrl);
  }
  assert.equal(JSON.stringify(saved), before);
  const unfinished = { ...saved, portraitUrl: '' };
  assert.equal(themePreview(unfinished, [], 'coastal-personal', false).sample, true);
  assert.equal(themePreview(unfinished, [], 'coastal-personal', false, 'profile').brand.portraitUrl, '');
  const a = themeSample('coastal-personal');
  a.brand.realtor.name = 'Changed locally';
  a.listings[0].title = 'Changed locally';
  assert.equal(themeSample('coastal-personal').brand.realtor.name, 'Marissa Cole');
  assert.notEqual(themeSample('coastal-personal').listings[0].title, 'Changed locally');
});

test('all seven bundled sample portraits exist and never override real profile images', () => {
  const file = path.join(root, 'constants/themeSamplePortraits.ts');
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const assets = [];
  new Function('require', 'module', 'exports', source)(id => {
    assert.match(id, /^\.\.\/assets\/theme-portraits\//);
    assert.ok(fs.statSync(path.resolve(path.dirname(file), id)).size > 0);
    assets.push(id);
    return assets.length;
  }, module, module.exports);
  const { withSamplePortrait } = module.exports;
  const { THEME_CAROUSEL_ORDER } = load('constants/themeDesigns');
  assert.equal(new Set(assets).size, 7);
  for (const layoutId of THEME_CAROUSEL_ORDER) {
    const brand = { ...fixture(), layoutId };
    assert.equal(withSamplePortrait({ brand, sample: false }).portraitSource, undefined);
    assert.ok(withSamplePortrait({ brand, sample: true }).portraitSource);
    assert.equal(withSamplePortrait({ brand, sample: true }).brand, brand);
    assert.equal(brand.portraitUrl, 'test-portrait.jpg');
  }
});

test('reference themes retain coordinated colors while legacy customization remains available', () => {
  const { themeDesign, THEME_DESIGNS } = load('constants/themeDesigns');
  assert.deepEqual(themeDesign('coastal-personal', { accent: 'burgundy', presentationVersion: 2 }), THEME_DESIGNS['coastal-personal']);
  assert.notEqual(themeDesign('coastal-personal', { accent: 'burgundy' }).accent, THEME_DESIGNS['coastal-personal'].accent);
});

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
  const keys = new Set(THEME_LOOKS.map(theme => imagePositionKey(theme))); assert.equal(keys.size, 11);
  const theme = { ...fixture().theme, imagePositions: {} };
  const key = imagePositionKey(theme); theme.imagePositions[key] = { x: 0, y: 100 };
  assert.deepEqual(imagePosition(theme), { left: '0%', top: '100%' });
  assert.deepEqual(imagePosition({ ...theme, accent: 'gold' }), { left: '50%', top: '50%' });
  theme.imagePositions[key] = { x: -100, y: NaN };
  assert.deepEqual(imagePosition(theme), { left: '0%', top: '50%' });
});

test('layout registry preserves legacy default and only reorders visible content', () => {
  const { CLIENT_LAYOUTS, DEFAULT_CLIENT_LAYOUT } = load('constants/clientLayouts');
  const { THEME_SECTION_ORDER, orderThemeSections } = load('constants/themeStructure');
  assert.equal(DEFAULT_CLIENT_LAYOUT, 'private-collection');
  assert.ok(CLIENT_LAYOUTS.some(l => l.id === 'eliza-editorial'));
  const visible = ['hero', 'listings', 'quickContact', 'footer'];
  for (const layout of CLIENT_LAYOUTS) {
    const order = THEME_SECTION_ORDER[layout.id];
    assert.equal(new Set(order).size, order.length);
    const result = orderThemeSections(visible, layout.id);
    assert.deepEqual([...result].sort(), [...visible].sort());
    assert.equal(result[0], 'hero');
    assert.equal(result.at(-1), 'footer');
    assert.ok(!result.includes('note'));
  }
  assert.deepEqual(visible, ['hero', 'listings', 'quickContact', 'footer']);
});

test('Eliza and coastal switches round-trip content including long names, empty photos and hidden sections', () => {
  const { CLIENT_LAYOUTS } = load('constants/clientLayouts');
  const saved = fixture();
  saved.realtor.name = 'Alexandra Charlotte Montgomery-Wellington & Associates';
  saved.portraitUrl = '';
  saved.sectionStates = { note: 'hidden' };
  saved.customData = { retained: true };
  const before = JSON.stringify(saved);
  let current = saved;
  for (const id of ['eliza-editorial', 'coastal-personal', 'eliza-editorial']) {
    const layout = CLIENT_LAYOUTS.find(item => item.id === id);
    current = editorSave(current, { ...current, layoutId: id, theme: { ...layout.defaultTheme } }, 'theme');
    assert.deepEqual(current.realtor, saved.realtor);
    assert.equal(current.portraitUrl, '');
    assert.deepEqual(current.sectionStates, saved.sectionStates);
    assert.deepEqual(current.customData, saved.customData);
  }
  assert.equal(JSON.stringify(saved), before);
});

test('portrait framing is isolated by layout and retains legacy crop fallback', () => {
  const theme = { ...fixture().theme, imagePositions: {} };
  theme.imagePositions[imagePositionKey(theme)] = { x: 0, y: 100 };
  assert.deepEqual(imagePosition(theme, 'eliza-editorial'), { left: '0%', top: '100%' });
  theme.imagePositions[imagePositionKey(theme, 'eliza-editorial')] = { x: 75, y: 25 };
  assert.deepEqual(imagePosition(theme, 'eliza-editorial'), { left: '75%', top: '25%' });
  assert.deepEqual(imagePosition(theme, 'coastal-personal'), { left: '0%', top: '100%' });
});
