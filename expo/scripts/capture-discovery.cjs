// Records every public response listing discovery requests for a site, with production options, so
// discovery CPU and scope can be profiled and replayed offline. Same recorder and fixture shape as
// the compatibility replay corpus (scripts/listing-compatibility.cjs).
//   node scripts/capture-discovery.cjs --out DIR --id NAME URL [--id NAME URL ...]
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, createRecorder } = require('./listing-compatibility.cjs');

const args = process.argv.slice(2);
const out = args[args.indexOf('--out') + 1];
const pairs = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--id') pairs.push({ id: args[i + 1], url: args[i + 2] });
fs.mkdirSync(out, { recursive: true });

(async () => {
  const engine = await loadEngine();
  const { discoverListings, publicListingRequestHeaders, decodePublicListingResponse, isRobotChallenge, isPublishedScriptGate } = engine;
  for (const { id, url } of pairs) {
    const recorder = createRecorder(async (target, options) => {
      const response = await fetch(target, { headers: { 'User-Agent': 'MyRealtorAppBuilder/1.0',
        ...(options?.cookie ? { Cookie: options.cookie } : {}),
        ...(options?.fragment ? { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json,text/html,text/plain' } : { Accept: 'text/html,text/plain' }),
        ...publicListingRequestHeaders(new URL(target), options) }, signal: AbortSignal.timeout(12000) });
      const html = await decodePublicListingResponse(await response.text(), response.headers.get('content-type') ?? '', new URL(response.url), options);
      if (!response.ok && !isRobotChallenge(html) && !isPublishedScriptGate(html)) throw Error('The page returned ' + response.status + '.');
      if (html.length > 2_000_000) throw Error('The page is too large to analyze.');
      return { html, finalUrl: new URL(response.url) };
    });
    const options = { maxDepth: 5, maxPages: 160, maxListings: 100, maxDetailPages: 100, enrichAll: true, maxDurationMs: 120000 };
    const started = Date.now();
    const result = await discoverListings([url], recorder.fetchPage, options).catch(error => ({ error: String(error.message ?? error), listings: [], meta: {} }));
    const fixture = recorder.fixture(id, [url], options, result, 'Diagnostic capture for CPU and scope analysis (Oct 2026 repair campaign); not a golden baseline.');
    fixture.capturedForDiagnostics = true;
    fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(fixture));
    process.stdout.write(`${id}: ${fixture.pages.length} pages, ${result.listings.length} listings, ${Date.now() - started} ms, ${result.error ?? ''}\n`);
  }
})();
