// Run from expo: node scripts/audit-listing-compatibility.cjs
// Live observations change with inventory; historical counts are comparison data, not crawler rules.
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, createRecorder, replayFixture, writeFixture } = require('./listing-compatibility.cjs');

(async () => {
  const engine = await loadEngine();
  const { discoverListings, publicListingRequestHeaders, decodePublicListingResponse, isRobotChallenge, isPublishedScriptGate } = engine;
  const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/realtor-websites.json'), 'utf8'));
  const args = process.argv.slice(2);
  const argument = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
  const url = argument('--url');
  const examples = url ? [{ name: argument('--name') || new URL(url).hostname, url }] : fixtures.examples;
  const recordDirectory = path.resolve(argument('--record-dir') || path.join(__dirname, '../tests/fixtures/listing-compatibility'));
  const results = [];
  for (const example of examples) {
    const started = Date.now();
    const recorder = createRecorder(async (url, options) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'MyRealtorAppBuilder/1.0',
        ...(options?.cookie ? { Cookie: options.cookie } : {}),
        ...(options?.fragment ? { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json,text/html,text/plain' } : {}),
        ...publicListingRequestHeaders(new URL(url),options) }, signal: AbortSignal.timeout(12000) });
      const html = await decodePublicListingResponse(await response.text(), response.headers.get('content-type') ?? '', new URL(response.url), options);
      if (!response.ok && !isRobotChallenge(html) && !isPublishedScriptGate(html)) throw Error('HTTP ' + response.status);
      if (html.length > 2_000_000) throw Error('Response too large');
      return { html, finalUrl: new URL(response.url) };
    });
    const options = { maxPages: 40, maxListings: 100, enrichAll: true, maxDurationMs: 90000 };
    const result = await discoverListings([example.url], recorder.fetchPage, options);
    const active = result.listings.filter(row=>!row.status || row.status === "active");
    let regressionCase;
    if (active.length && active.every(row => row.price && row.images.length)) {
      const strategies = [...new Set(result.meta.compatibility.pages.flatMap(p => p.attempts.filter(a => a.outcome === 'extracted').map(a => a.id)))];
      const id = example.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,60) + '-' + Date.now();
      const fixture = recorder.fixture(id, [example.url], options, result,
        'Observed extraction via ' + strategies.join(', ') + '. See evidence for architectural matches, navigation and rendering. Coverage: ' + result.meta.coverage + '.');
      // Provider-owned transport hosts are part of the protocol, not customer-specific fixes.
      if (!/(?:^|\.)(?:flexmls\.com|idxhome\.com|brivityidx\.com)$/i.test(new URL(example.url).hostname)) {
        fixture.rehostOrigin = new URL(example.url).origin;
      }
      // Redaction and capture completeness must not change extraction before this case is preserved.
      await replayFixture(fixture, engine);
      // Prove portability on an unfamiliar customer hostname before preserving this solution.
      if (fixture.rehostOrigin) await replayFixture(JSON.parse(JSON.stringify(fixture).split(fixture.rehostOrigin).join('https://unfamiliar-broker.example')), engine);
      writeFixture(recordDirectory, fixture);
      regressionCase = id;
    }
    results.push({ name: example.name, url: example.url, historicalCount: example.lastObservedActiveCount,
      regressionCase,
      found: active.length, priced: active.filter(row => row.price).length,
      photographed: active.filter(row => row.images.length).length,
      identifiedByMLS: active.filter(row => row.listingNumber).length,
      durationMs: Date.now() - started, meta: result.meta });
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
  if (results.some(result => !result.found || result.priced !== result.found || result.photographed !== result.found)) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
