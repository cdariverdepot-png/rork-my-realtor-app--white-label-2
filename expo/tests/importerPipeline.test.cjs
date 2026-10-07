// Build-pipeline contracts: the single-file bundle is generated from source, the orchestration
// does not repeat or serialize work it already has, and live progress reports only real work.
// Responses come from the permanent live captures (tests/fixtures/listing-compatibility/*-<ms>.json)
// with simulated per-request latency; the AI step is a fixed synthetic response.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runBuild, liveFixtures, currentBundle, defaultProfile } = require('../scripts/build-pipeline-harness.cjs');

const repo = path.resolve(__dirname, '../..');
const LATENCY = 80;
const quiet = async work => {
  const log = console.log, error = console.error, warn = console.warn;
  console.log = (...args) => { if (!/^\[(build|listing-sync)\]/.test(String(args[0]))) log(...args); };
  console.error = () => {}; console.warn = () => {};
  try { return await work(); } finally { console.log = log; console.error = error; console.warn = warn; }
};
const fixtures = liveFixtures();
const bundle = currentBundle();
const withoutVolatile = body => {
  const copy = JSON.parse(JSON.stringify(body));
  delete copy.timings;
  if (copy.draft?.websiteDesign) delete copy.draft.websiteDesign.analyzedAt;
  return copy;
};

test('deploy bundle is generated from the current function sources', () => {
  const { build } = require(path.join(repo, 'scripts/bundle-analyze-function.cjs'));
  assert.ok(bundle === build(), 'deploy.bundle.ts is stale: run node scripts/bundle-analyze-function.cjs');
});

test('the live regression corpus is available for pipeline checks', () => {
  assert.ok(fixtures.length >= 4, 'expected the captured Cindy, Gethomenow, McKenzie and North Idaho Freedom sites');
});

for (const fixture of fixtures) {
  test(`${fixture.id}: one build reads each public page once and in parallel where independent`, () => quiet(async () => {
    const run = await runBuild(bundle, fixture, { latencyMs: LATENCY });
    assert.equal(run.status, 200);
    const counts = new Map();
    for (const request of run.requests) if (!request.url.startsWith('https://api.openai.com/')) counts.set(request.url, (counts.get(request.url) ?? 0) + 1);
    const repeated = [...counts].filter(([, n]) => n > 1);
    assert.deepEqual(repeated, [], 'a page was fetched more than once in one build');
    assert.ok(run.maxInFlight >= 2, 'independent page reads should overlap');
    // Stylesheets and linked pages are read in bounded parallel rounds, not one after another:
    // adding latency to every request adds only a few round trips to the design stage.
    const fast = await runBuild(bundle, fixture, { latencyMs: 1 });
    const rounds = (run.body.timings.design - fast.body.timings.design) / (LATENCY - 1);
    assert.ok(rounds <= 6, `design stage waited ~${rounds.toFixed(1)} sequential round trips`);
    for (const stage of ['site', 'design', 'listings', 'profile', 'save', 'total']) assert.equal(typeof run.body.timings[stage], 'number', stage);
    assert.equal(run.body.discoveredListings.length, fixture.expected.listings.filter(item => item.status !== 'sold' && item.status !== 'off_market' && item.sourceStatus !== 'unknown').length);
  }));

  test(`${fixture.id}: a listing source already connected in this setup run is not crawled again`, () => quiet(async () => {
    const full = await runBuild(bundle, fixture, { latencyMs: 1 });
    const connected = await runBuild(bundle, fixture, { latencyMs: 1, connected: [fixture.seeds[0]] });
    assert.equal(connected.status, 200);
    assert.deepEqual(connected.body.discoveredListings, []);
    assert.deepEqual(connected.body.listingDiscovery.skipped, [fixture.seeds[0]]);
    assert.ok(connected.requests.length < full.requests.length);
    const strip = design => { const copy = { ...design }; delete copy.analyzedAt; return copy; };
    assert.deepEqual(strip(connected.body.draft.websiteDesign), strip(full.body.draft.websiteDesign), 'skipping discovery must not change the website design');
  }));

  test(`${fixture.id}: the event stream reports only real work and ends with the ordinary JSON result`, () => quiet(async () => {
    const plain = await runBuild(bundle, fixture, { latencyMs: 1 });
    const streamed = await runBuild(bundle, fixture, { latencyMs: 1, stream: true });
    assert.equal(streamed.status, plain.status);
    assert.deepEqual(withoutVolatile(streamed.body), withoutVolatile(plain.body));
    const { events } = streamed;
    const body = streamed.body;
    assert.deepEqual(events[0], { kind: 'stage', stage: 'site', state: 'start', at: events[0].at });
    for (let i = 1; i < events.length; i++) assert.ok(events[i].at >= events[i - 1].at, 'events are emitted as they happen');
    // Every opened stage is closed; nothing is left spinning when the result arrives.
    const open = new Set();
    for (const event of events.filter(e => e.kind === 'stage')) {
      if (event.state === 'start') open.add(event.stage); else open.delete(event.stage);
    }
    assert.deepEqual([...open], []);
    const site = events.find(e => e.kind === 'site');
    if (site) {
      assert.ok(fixture.pages[0].html.includes(site.name.split(' ')[0]), `site name "${site.name}" must come from the page`);
      assert.equal(site.host, new URL(fixture.seeds[0]).hostname.replace(/^www\./, ''));
    }
    const design = events.find(e => e.kind === 'design');
    const actual = body.draft.websiteDesign;
    assert.deepEqual(design && { portrait: design.portrait, logo: design.logo, images: design.images, sections: design.sections },
      { portrait: !!actual.portraitImageUrl, logo: !!actual.logoUrl, images: actual.imagery?.images.length ?? 0, sections: actual.sections.length });
    const tallies = events.filter(e => e.kind === 'listings');
    assert.ok(tallies.length > 0);
    for (let i = 1; i < tallies.length; i++) assert.ok(tallies[i].pages >= tallies[i - 1].pages && tallies[i].found >= tallies[i - 1].found, 'tallies only grow');
    const listingsDone = events.find(e => e.kind === 'stage' && e.stage === 'listings' && e.state === 'done');
    assert.equal(listingsDone.count, body.discoveredListings.length);
    const details = events.filter(e => e.kind === 'stage' && e.stage === 'details');
    if (body.listingDiscovery.enrichment?.scheduled) {
      assert.equal(details.at(-1).total, body.listingDiscovery.enrichment.scheduled);
      assert.equal(details.at(-1).count, body.listingDiscovery.enrichment.enriched + body.listingDiscovery.enrichment.failed);
    }
    const profile = events.find(e => e.kind === 'profile');
    assert.equal(profile.name, defaultProfile().evidence[0].value, 'profile events repeat validated evidence only');
    assert.equal(profile.city, undefined, 'no city was stated, so none is reported');
    const renders = events.filter(e => e.kind === 'render');
    assert.equal(renders.length, 0, 'no renderer is configured, so no render is reported');
    assert.deepEqual(events.slice(-2).map(e => [e.stage, e.state]), [['save', 'start'], ['save', 'done']]);
  }));
}
