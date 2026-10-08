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

test('detail job sizes match the refresh-listings function', () => {
  const handler = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/refresh-listings/sourceHandler.ts'), 'utf8');
  assert.match(handler, new RegExp(`INVENTORY_JOB_DETAILS = ${INVENTORY_JOB_DETAILS};`));
  assert.match(handler, new RegExp(`DETAIL_JOB_SIZE = ${DETAIL_JOB_SIZE};`));
});

let engine;
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
for (const file of files) {
  const id = file.replace('.json.gz', '');
  test(`${id}: same listings, and every import job stays within the CPU allowance`, async () => {
    engine ??= await loadEngine();
    const fixture = load(path.join(dir, file));
    // Imported inventory is unchanged; fewer failed requests is allowed, new failures are not.
    const full = await replayDiscovery(engine, fixture);
    const now = snapshot(full.result), was = fixture.expected;
    assert.deepEqual(now.listings, was.listings);
    assert.equal(now.outcome, was.outcome);
    assert.equal(now.coverage, was.coverage);
    for (const url of now.failed ?? []) assert.ok((was.failed ?? []).includes(url), `new failed request ${url}`);

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
