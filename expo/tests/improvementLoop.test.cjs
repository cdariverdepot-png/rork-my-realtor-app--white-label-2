// Phase 9 (synthetic contracts): the autonomous improvement loop's own rules. The evaluator must tell
// code defects from blocked or unpublished information; the registry must group by structural cause and
// refuse to retry without new evidence; and the acceptance gate must reject every way a repair could
// "pass" without being an improvement (lost or market records, ownership changes, weakened tests,
// edited fixtures or gate files).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { namesProperty, detailPageName, findingsFor } = require('../scripts/improve/evaluate.cjs');
const { diagnose, queue } = require('../scripts/improve/failures.cjs');
const { compare } = require('../scripts/improve/gate.cjs');
const { requestKey } = require('../scripts/improve/engine.cjs');

const page = (url, html, extra = {}) => ({ key: requestKey(url, undefined, false), url, finalUrl: url, html, ...extra });
const listing = (sourceUrl, title, extra = {}) => ({ sourceUrl, title, description: '', images: [], price: '', ...extra });
const entry = { id: 'site-a', set: 'regression', category: 'test' };
const replay = (listings, meta = {}) => ({ result: { listings, meta: { compatibility: { pages: [{ attempts: [{ id: 'property-cards', outcome: 'extracted' }] }] }, ...meta } }, listings, missing: [] });

test('titles name a property only when they read as an address or a located place name', () => {
  for (const title of ['123 Main St, Boise, ID', 'Cottage Island, Hope, ID 83836', 'Lot 9 Cator Dr', '0 Allie LN Salem VA 24153']) assert.ok(namesProperty(title), title);
  for (const title of ['$20,000,000', '', 'View Details', '3 beds 2 baths', 'Featured Listing', '$1.2M']) assert.ok(!namesProperty(title), title);
});

test('a detail page names its property from structured address data or an address heading, never from page chrome', () => {
  assert.equal(detailPageName('<script type="application/ld+json">{"address":{"@type":"PostalAddress","streetAddress":"Cottage Island","addressLocality":"Hope","addressRegion":"ID"}}</script>'), 'Cottage Island, Hope, ID');
  assert.equal(detailPageName('<h1>412 Pine Street, Sandpoint, ID 83864</h1>'), '412 Pine Street, Sandpoint, ID 83864');
  assert.equal(detailPageName('<h1>Welcome to our listings</h1>'), null);
});

test('improvement loop: a price title is a code defect only when the recorded detail page names the property', () => {
  const capture = { pages: [
    page('https://a.example/property/1/', '<h1>412 Pine Street, Sandpoint, ID 83864</h1>'),
    page('https://a.example/property/2/', '', { error: 'The operation was aborted due to timeout' }),
    page('https://a.example/property/3/', '<h1>Gallery</h1>'),
  ] };
  const findings = findingsFor(entry, capture, replay([
    listing('https://a.example/property/1/', '$500,000'), listing('https://a.example/property/2/', '$600,000'), listing('https://a.example/property/3/', '$700,000')]));
  const kinds = Object.fromEntries(findings.filter(f => f.code === 'TITLE_NOT_PROPERTY').map(f => [f.defectKind, f.count]));
  assert.deepEqual(kinds, { code_defect: 1, temporary_outage: 1, needs_review: 1 });
});

test('improvement loop: the same property twice is a duplicate; distinct units and lots are not', () => {
  const capture = { pages: [] };
  const dup = findingsFor(entry, capture, replay([
    listing('https://a.example/d/1/111/', '14 Densmore Ave N Seattle, WA 98133', { description: 'Same words.', price: '$500,000' }),
    listing('https://a.example/d/1/222/', '14 Densmore Ave N Seattle, WA 98133', { description: 'Same words.', price: '$500,000' }),
    listing('https://a.example/d/2/', '1017 Minor Ave #1401 Seattle, WA 98104', { description: 'Same words.' }),
    listing('https://a.example/d/3/', '1017 Minor Ave #1402 Seattle, WA 98104', { description: 'Same words.' }),
  ])).find(f => f.code === 'DUPLICATE_PROPERTY');
  assert.equal(dup.count, 1);
  assert.equal(dup.examples[0].sourceUrls.length, 2);
  const none = findingsFor(entry, capture, replay([
    listing('https://a.example/d/1/', '14 Densmore Ave N Seattle, WA 98133', { description: 'One.' }),
    listing('https://a.example/d/2/', '14 Densmore Ave N Seattle, WA 98133', { description: 'Two (another unit of a duplex, different text).' }),
  ])).find(f => f.code === 'DUPLICATE_PROPERTY');
  assert.equal(none, undefined);
  // One parcel, two listings (Oct 2026 corpus: same address and lead photo, different price and remarks).
  const split = findingsFor(entry, capture, replay([
    listing('https://a.example/p/1623/', '172 Elk Hills Rd, Sandpoint, ID 83864', { price: '$4,950,000', description: 'Home and acreage.', images: ['https://cdn.example/a.jpg'] }),
    listing('https://a.example/p/1624/', '172 Elk Hills Rd, Sandpoint, ID 83864', { price: '$3,200,000', description: 'Home only.', images: ['https://cdn.example/a.jpg'] }),
  ])).find(f => f.code === 'DUPLICATE_PROPERTY');
  assert.equal(split, undefined, 'different prices and remarks are different listings');
});

test('improvement loop: refused and unanswered sites are not code defects', () => {
  const blocked = findingsFor(entry, { pages: [page('https://a.example/', '', { error: 'The page returned 403.' })] },
    { result: { listings: [], meta: { failed: ['https://a.example/'] } }, listings: [], missing: [] });
  assert.deepEqual(blocked.map(f => [f.code, f.defectKind]), [['BLOCKED_SOURCE', 'blocked_source']]);
  const outage = findingsFor(entry, { pages: [page('https://a.example/', '', { error: 'The operation was aborted due to timeout' })] },
    { result: { listings: [], meta: { failed: ['https://a.example/'] } }, listings: [], missing: [] });
  assert.deepEqual(outage.map(f => [f.code, f.defectKind]), [['SOURCE_UNAVAILABLE', 'temporary_outage']]);
});

const evaluation = (sites, at = '2026-10-08T00:00:00Z') => ({ evaluatedAt: at, sites });
const site = (id, findings, listings = []) => ({ id, set: 'regression', category: 'x', cpuMs: 100, listings, findings });
const finding = (code, defectKind, count, architecture = 'property-cards', examples = [{ sourceUrl: 'https://a.example/1' }]) =>
  ({ code, defectKind, severity: 2, count, architecture, examples, detail: 'd' });

test('improvement loop: the registry groups one symptom across sites and architectures and queues only code defects', () => {
  const registry = diagnose({ version: 1, failures: {} }, evaluation([
    site('a', [finding('DUPLICATE_PROPERTY', 'code_defect', 2, 'ihomefinder'), finding('BLOCKED_SOURCE', 'blocked_source', 1)]),
    site('b', [finding('DUPLICATE_PROPERTY', 'code_defect', 10, 'property-cards'), finding('NO_LISTINGS', 'needs_review', 1)]),
  ]));
  const dup = registry.failures['duplicate-property'];
  assert.equal(dup.siteCount, 2);
  assert.deepEqual(dup.architectures, ['ihomefinder', 'property-cards']);
  assert.equal(registry.failures['blocked-source--blocked-source'].status, 'not_code');
  assert.equal(registry.failures['no-listings--needs-review'].status, 'needs_review');
  assert.deepEqual(queue(registry).map(q => q.id), ['duplicate-property']);
});

test('improvement loop: a rejected repair is not retried until the evidence or the hypothesis changes', () => {
  const evalA = evaluation([site('a', [finding('TITLE_NOT_PROPERTY', 'code_defect', 3)])]);
  let registry = diagnose({ version: 1, failures: {} }, evalA);
  const f = registry.failures['title-not-property'];
  registry = { ...registry, failures: { ...registry.failures, 'title-not-property': { ...f, status: 'rejected', attempts: [{ outcome: 'rejected', evidenceHash: f.evidenceHash }] } } };
  assert.deepEqual(queue(diagnose(registry, evalA)), [], 'same evidence: not retried');
  const evalB = evaluation([site('a', [finding('TITLE_NOT_PROPERTY', 'code_defect', 3, 'property-cards', [{ sourceUrl: 'https://a.example/new' }])])]);
  assert.deepEqual(queue(diagnose(registry, evalB)).map(q => q.id), ['title-not-property'], 'new evidence reopens it');
});

const rec = (sourceUrl, title, extra = {}) => ({ sourceUrl, title, ownership: null, listingOffice: null, description: 100, photos: 5, price: '$1', ...extra });
const failureFor = code => ({ code, sites: [] });

test('improvement loop: the gate accepts a repair that only reduces its target', () => {
  const before = evaluation([site('a', [finding('TITLE_NOT_PROPERTY', 'code_defect', 1)], [rec('u1', '$500,000'), rec('u2', '1 Elm St, Boise, ID')])]);
  const after = evaluation([site('a', [], [rec('u1', '412 Pine St, Sandpoint, ID'), rec('u2', '1 Elm St, Boise, ID')])]);
  const result = compare(before, after, failureFor('TITLE_NOT_PROPERTY'));
  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.ok(result.improvements.some(i => /412 Pine/.test(i)));
});

test('improvement loop: the gate rejects lost records, market records, ownership changes and degraded fields', () => {
  const base = [rec('u1', '1 Elm St, Boise, ID', { ownership: 'featured' }), rec('u2', '2 Oak St, Boise, ID'), rec('u3', '3 Ash St, Boise, ID')];
  const before = evaluation([site('a', [finding('TITLE_NOT_PROPERTY', 'code_defect', 1)], base), site('b', [], [rec('v1', '9 Fir St, Moscow, ID')])]);
  const after = evaluation([
    site('a', [], [rec('u1', '1 Elm St, Boise, ID', { ownership: 'own' }), rec('u2', '$400,000', { photos: 2 }), rec('market', '7 Bay St, Tampa, FL', { listingOffice: 'Other Realty' })]),
    site('b', [finding('DETAIL_INCOMPLETE', 'code_defect', 1)], [rec('v1', '9 Fir St, Moscow, ID')]),
  ]);
  const { ok, problems } = compare(before, after, failureFor('TITLE_NOT_PROPERTY'));
  assert.equal(ok, false);
  for (const expected of [/disappeared: u3/, /ownership changed featured -> own/, /no longer names the property/, /photos decreased/, /new unattributed record/, /b: new or increased finding DETAIL_INCOMPLETE/]) {
    assert.ok(problems.some(p => expected.test(p)), `expected a problem matching ${expected}:\n${problems.join('\n')}`);
  }
});

test('improvement loop: the gate rejects a repair whose target does not decrease', () => {
  const same = evaluation([site('a', [finding('DUPLICATE_PROPERTY', 'code_defect', 2)], [rec('u1', '1 Elm St, Boise, ID')])]);
  assert.equal(compare(same, same, failureFor('DUPLICATE_PROPERTY')).ok, false);
});

test('improvement loop: the change policy rejects edits to tests, fixtures, the gate and paths outside the engine', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-'));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), text); };
  const run = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  run('init', '-q', '-b', 'base');
  run('config', 'user.email', 't@example.invalid'); run('config', 'user.name', 't');
  write('expo/tests/alpha.test.cjs', "test('a', () => { assert.ok(1); assert.ok(2); });\nconst REVIEWED_X = new Set(['one']);\n");
  write('expo/tests/fixtures/case.json', '{"expected":1}');
  write('supabase/functions/analyze-realtor-build/listingRecords.ts', 'export const a = 1;\n');
  write('expo/scripts/improve/gate.cjs', '// gate');
  run('add', '-A'); run('commit', '-qm', 'base');
  run('switch', '-qc', 'candidate');
  write('supabase/functions/analyze-realtor-build/listingRecords.ts', 'export const a = 2;\n');
  write('expo/tests/alpha.test.cjs', "test('a', () => { assert.ok(1); });\nconst REVIEWED_X = new Set(['one', 'two']);\n");
  write('expo/tests/fixtures/case.json', '{"expected":2}');
  write('expo/scripts/improve/gate.cjs', '// always pass');
  write('supabase/functions/billing/index.ts', 'export {}');
  run('add', '-A'); run('commit', '-qm', 'candidate');
  const script = `const { changePolicy } = require(${JSON.stringify(path.resolve(__dirname, '../scripts/improve/gate.cjs'))});
    process.stdout.write(JSON.stringify(changePolicy('base', 'title-not-property')));`;
  const policy = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, IMPROVE_REPO_ROOT: repo }, encoding: 'utf8' }));
  assert.equal(policy.ok, false);
  for (const expected of [/alpha\.test\.cjs: assertions removed/, /REVIEWED_\* exception set changed/, /fixtures\/case\.json: existing fixtures .* immutable/,
    /improve\/gate\.cjs: outside the paths/, /billing\/index\.ts: outside the paths/, /No new regression test/, /knowledge.*missing/]) {
    assert.ok(policy.problems.some(p => expected.test(p)), `expected ${expected}:\n${policy.problems.join('\n')}`);
  }
  fs.rmSync(repo, { recursive: true, force: true });
});

test('improvement loop: a declared baseline change must be produced exactly and be an improvement by rule', () => {
  const { checkDeclarations } = require('../scripts/improve/gate.cjs');
  const before = evaluation([site('a', [], [rec('u1', '$500,000'), rec('u2', '1 Elm St, Boise, ID')])]);
  const after = evaluation([site('a', [], [rec('u1', '412 Pine St, Sandpoint, ID'), rec('u2', '1 Elm St, Boise, ID')])]);
  const good = { file: 'x.json', capture: 'a', sourceUrl: 'u1', field: 'title', before: '$500,000', after: '412 Pine St, Sandpoint, ID' };
  assert.equal(checkDeclarations([good], before, after).ok, true);
  assert.equal(checkDeclarations([{ ...good, after: '999 Invented Rd, Boise, ID' }], before, after).ok, false, 'must be what the engine now produces');
  assert.equal(checkDeclarations([{ ...good, sourceUrl: 'u2', before: '1 Elm St, Boise, ID', after: '$1' }], before, after).ok, false, 'a regression cannot be declared');
});

test('improvement loop: a duplicate repair may remove records only within a duplicate group, keeping one of each', () => {
  const dupFinding = { ...finding('DUPLICATE_PROPERTY', 'code_defect', 7), examples: [{ sourceUrls: ['d1', 'd2'] }], groups: [['d1', 'd2'], ['e1', 'e2']] };
  const before = evaluation([site('a', [dupFinding], [rec('d1', '1 Elm St, Boise, ID'), rec('d2', '1 Elm St, Boise, ID'), rec('e1', '2 Oak St, Boise, ID'), rec('e2', '2 Oak St, Boise, ID'), rec('f1', '3 Ash St, Boise, ID')])]);
  const merged = evaluation([site('a', [], [rec('d2', '1 Elm St, Boise, ID'), rec('e1', '2 Oak St, Boise, ID'), rec('f1', '3 Ash St, Boise, ID')])]);
  assert.equal(compare(before, merged, failureFor('DUPLICATE_PROPERTY')).ok, true, 'groups beyond the displayed examples count');
  const lostGroup = evaluation([site('a', [], [rec('d2', '1 Elm St, Boise, ID'), rec('f1', '3 Ash St, Boise, ID')])]);
  assert.ok(compare(before, lostGroup, failureFor('DUPLICATE_PROPERTY')).problems.some(p => /every record of a duplicate group disappeared/.test(p)));
  const lostOther = evaluation([site('a', [], [rec('d2', '1 Elm St, Boise, ID'), rec('e1', '2 Oak St, Boise, ID')])]);
  assert.ok(compare(before, lostOther, failureFor('DUPLICATE_PROPERTY')).problems.some(p => /disappeared: f1/.test(p)));
});

test('improvement loop: a social post imported as a listing is a code defect; a site drawn in the browser is not', () => {
  const social = findingsFor(entry, { pages: [] }, replay([listing('https://www.instagram.com/p/abc/', 'cameronteam')])).find(f => f.code === 'NOT_A_PROPERTY');
  assert.equal(social.defectKind, 'code_defect');
  const drawn = findingsFor(entry, { pages: [] }, { result: { listings: [], meta: { obstacles: [{ code: 'requires_rendering', url: 'https://a.example/' }] } }, listings: [], missing: [] });
  assert.deepEqual(drawn.map(f => [f.code, f.defectKind]), [['REQUIRES_RENDERING', 'needs_review']]);
});
