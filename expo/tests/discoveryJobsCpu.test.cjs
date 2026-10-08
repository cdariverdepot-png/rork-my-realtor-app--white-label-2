// Listing discovery CPU per job, replayed from the 25-site diagnostic captures of Oct 7 2026
// (diagnostics/discovery, live public responses). Production lost whole imports to the ~2 s Edge
// Function CPU allowance (Rocky's, Bridge, Coldwell, Zillow). After the repair, discovery examines
// each document once, never crawls pager links as navigation, and reads property details in separate
// bounded jobs; each job must stay well inside the allowance, and what is imported must not change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, snapshot } = require('../scripts/listing-compatibility.cjs');
const { replayDiscovery, load } = require('../scripts/replay-discovery-cpu.cjs');

const dir = path.resolve(__dirname, '../../diagnostics/discovery');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).sort() : [];
// Same constants as refresh-listings/sourceHandler.ts (asserted below).
// Ceiling matches the website-reader replay: 25% under the 2 s allowance. Closest case (Oct 2026): Rocky's
// inventory job, ~1.4 s, spent crawling a regional MLS feed of other offices' listings (repair stage 4: scope).
const INVENTORY_JOB_DETAILS = 12, DETAIL_JOB_SIZE = 25, JOB_CPU_CEILING_MS = 1500;

// Declared, evidence-backed baseline changes (tests/fixtures/baseline-changes, see its README): exact
// before -> after values for named records, verified as improvements by the acceptance gate. Everything
// not declared must still match the recording.
const DECLARABLE_FIELDS = new Set(['title']);
const declared = (() => {
  const folder = path.resolve(__dirname, 'fixtures/baseline-changes');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(f => f.endsWith('.json')).flatMap(f => JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8')).changes.map(c => ({ ...c, file: f })));
})();
function withDeclaredChanges(id, expected) {
  const changes = declared.filter(c => c.capture === id);
  if (!changes.length) return expected;
  const next = JSON.parse(JSON.stringify(expected));
  for (const change of changes) {
    assert.ok(DECLARABLE_FIELDS.has(change.field), `${change.file}: ${change.field} cannot be declared`);
    const record = next.listings.find(item => item.sourceUrl === change.sourceUrl);
    assert.ok(record, `${change.file}: no recorded listing ${change.sourceUrl}`);
    assert.equal(record[change.field], change.before, `${change.file}: recorded ${change.field} differs from the declared before-value`);
    record[change.field] = change.after;
  }
  return next;
}

test('declared baseline changes name only declarable fields and existing captures', () => {
  for (const change of declared) {
    assert.ok(DECLARABLE_FIELDS.has(change.field), `${change.file}: ${change.field}`);
    assert.ok(files.includes(`${change.capture}.json.gz`), `${change.file}: unknown capture ${change.capture}`);
    assert.notEqual(change.before, change.after, `${change.file}: a declared change must change something`);
  }
});

test('detail job sizes match the refresh-listings function', () => {
  const handler = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/refresh-listings/sourceHandler.ts'), 'utf8');
  assert.match(handler, new RegExp(`INVENTORY_JOB_DETAILS = ${INVENTORY_JOB_DETAILS};`));
  assert.match(handler, new RegExp(`DETAIL_JOB_SIZE = ${DETAIL_JOB_SIZE};`));
});

// Repair stage 4 (accuracy over quantity), reviewed one by one against the captured pages. Each site
// keeps a subset of what it imported before (never a new listing), for the stated structural reason.
const REVIEWED_SCOPE_CHANGES = {
  'coldwell-banker-alena-goncharov': { listings: 0, why: 'the 100 came from Summerville market pages p_2-p_5 outside the agent\'s pages; her /listings/ page publishes no cards' },
  'compass-jeff-stahlhut': { listings: 0, why: 'the 11 came from site-wide /coming-soon/ and /compass-listings/ collections, not the agent page' },
  'irene-on-whidbey': { listings: 2, why: 'the vendor ad read from the www.idxbroker.com homepage is no longer imported' },
  'raleigh-realty': { listings: 0, why: 'city filter pages; every listing\'s detail page attributes it to another brokerage' },
  'rockys-mom-realty': { listings: 0, why: 'a regional MLS feed (32,115 pages); no card read was attributed to the site\'s own office' },
  'scott-a-jacobs-realtor': { listings: 0, why: 'the 100 were a brokerage city search reached through the brokerage homepage' },
  'zillow-leland-reed': { listings: 0, why: 'the 100 came from Zillow FSBO/rental/marketing pages and followupboss.com, outside the agent profile' },
};

// Repair stage 6 (generic detail reader), reviewed: the same listings, titles and prices; details
// only added, read from each property's own page (gallery/description containers). Photos stay on
// the MLS image hosts and never carry another listing's number (checked during review).
const REVIEWED_DETAIL_GAINS = {
  'elevate-realty-granbury': { complete: 20, described: 20 },
  'freestone-properties': { complete: 3, described: 3 },
  'katerina-sayles': { complete: 12, described: 12 },
  'the-battle-group': { complete: 6, described: 6 },
  'woods-n-water-real-estate': { complete: 1, described: 1 },
  'mount-snow-palmiter': { complete: 0, described: 10 }, // 2 pages publish only a contact-form prompt; gallery endpoint not captured
  'houses-of-kansas-city': { complete: 0, described: 10 }, // remarks now from the description container
};

let engine;
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
for (const file of files) {
  const id = file.replace('.json.gz', '');
  test(`${id}: same listings, and every import job stays within the CPU allowance`, async () => {
    engine ??= await loadEngine();
    const fixture = load(path.join(dir, file));
    // Imported inventory is unchanged; fewer failed requests is allowed, new failures are not.
    const full = await replayDiscovery(engine, fixture);
    const now = snapshot(full.result), was = withDeclaredChanges(id, fixture.expected);
    const reviewed = REVIEWED_SCOPE_CHANGES[id];
    if (reviewed) {
      assert.equal(now.listings.length, reviewed.listings, reviewed.why);
      const before = new Set(was.listings.map(item => item.sourceUrl));
      for (const item of now.listings) assert.ok(before.has(item.sourceUrl), `scope rules never add listings: ${item.sourceUrl}`);
    } else if (REVIEWED_DETAIL_GAINS[id]) {
      const gains = REVIEWED_DETAIL_GAINS[id];
      const key = item => [item.sourceUrl, item.title, item.price, item.beds, item.baths].join('|');
      assert.deepEqual(now.listings.map(key), was.listings.map(key), 'the same listings, titles and prices');
      now.listings.forEach((item, i) => assert.ok(item.images.length >= was.listings[i].images.length || item.detailsComplete, `no photos lost: ${item.sourceUrl}`));
      assert.equal(now.listings.filter(item => item.detailsComplete).length, gains.complete);
      assert.equal(now.listings.filter(item => item.description).length, gains.described);
      assert.ok(now.listings.every(item => !/<[a-z][^>]*>/i.test(item.description)), 'descriptions are text');
    } else {
      assert.deepEqual(now.listings, was.listings);
      assert.equal(now.outcome, was.outcome);
      assert.equal(now.coverage, was.coverage);
      for (const url of now.failed ?? []) assert.ok((was.failed ?? []).includes(url), `new failed request ${url}`);
    }

    const inventoryJob = { ...fixture, options: { ...fixture.options, detailBudget: INVENTORY_JOB_DETAILS } };
    await replayDiscovery(engine, inventoryJob); // warm-up: JIT is not the import's work
    const first = await replayDiscovery(engine, inventoryJob);
    assert.ok(first.cpuMs < JOB_CPU_CEILING_MS, `inventory job used ${first.cpuMs} ms`);
    const deferred = new Set(first.result.meta.enrichment?.deferred ?? []);
    assert.equal(deferred.size, Math.max(0, first.result.listings.length - INVENTORY_JOB_DETAILS));

    // Detail jobs: the same reader production runs for each deferred listing, in job-sized batches.
    const pages = new Map(fixture.pages.map(page => [page.key, page]));
    const { requestKey } = require('../scripts/listing-compatibility.cjs');
    const read = async (url, options) => { const page = pages.get(requestKey(url, options, false)); if (!page || page.error) throw Error(page?.error ?? 'Unrecorded'); return { html: page.html, finalUrl: new URL(page.finalUrl) }; };
    const pending = first.result.listings.filter(item => deferred.has(item.sourceUrl));
    for (let i = 0; i < pending.length; i += DETAIL_JOB_SIZE) {
      const batch = pending.slice(i, i + DETAIL_JOB_SIZE);
      for (const item of batch) await engine.enrichPublicProperty(item, read).catch(() => {}); // warm-up
      const started = cpu();
      for (const item of batch) await engine.enrichPublicProperty(item, read).catch(() => {});
      const used = cpu() - started;
      assert.ok(used < JOB_CPU_CEILING_MS, `detail job ${i / DETAIL_JOB_SIZE + 1} used ${Math.round(used)} ms`);
    }
  });
}
