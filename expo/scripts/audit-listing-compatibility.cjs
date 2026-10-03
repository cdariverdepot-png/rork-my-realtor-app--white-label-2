// Run from expo: node scripts/audit-listing-compatibility.cjs
// Live observations change with inventory; historical counts are comparison data, not crawler rules.
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');

(async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/listingDiscovery.ts'), 'utf8');
  const code = stripTypeScriptTypes ? stripTypeScriptTypes(source) : require('typescript').transpileModule(source,
    { compilerOptions: { module: require('typescript').ModuleKind.ES2022, target: require('typescript').ScriptTarget.ES2022 } }).outputText;
  const { discoverListings, publicListingRequestHeaders, decodePublicListingResponse } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/realtor-websites.json'), 'utf8'));
  const results = [];
  for (const example of fixtures.examples) {
    const started = Date.now();
    const result = await discoverListings([example.url], async (url, options) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'MyRealtorAppBuilder/1.0',
        ...(options?.fragment ? { 'X-Requested-With': 'XMLHttpRequest' } : {}), ...publicListingRequestHeaders(new URL(url),options) }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw Error('HTTP ' + response.status);
      const html = await decodePublicListingResponse(await response.text(),response.headers.get("content-type")??"",new URL(response.url),options);
      if (html.length > 2_000_000) throw Error('Response too large');
      return { html, finalUrl: new URL(response.url) };
    }, { maxPages: 20, maxListings: 100, maxDetailPages: 12 });
    const active = result.listings.filter(row=>!row.status || row.status === "active");
    results.push({ name: example.name, url: example.url, historicalCount: example.lastObservedActiveCount,
      found: active.length, priced: active.filter(row => row.price).length,
      photographed: active.filter(row => row.images.length).length,
      identifiedByMLS: active.filter(row => row.listingNumber).length,
      durationMs: Date.now() - started, meta: result.meta });
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
  if (results.some(result => !result.found || result.priced !== result.found || result.photographed !== result.found)) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
