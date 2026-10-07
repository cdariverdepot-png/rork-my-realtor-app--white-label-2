// Measures the setup import (listing import + profile build) before and after a change, offline,
// against the permanent live captures with the same simulated latency for both versions.
//   node scripts/benchmark-build-pipeline.cjs --before <git-ref> [--latency 150] [--ai 5000]
// "before" runs the listing import, then the build (which crawled listings again);
// "after" runs them concurrently and the build skips the page the listing import connected.
// The listing import is measured with each version's discovery engine and production options.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { runBuild, liveFixtures, currentBundle, replayNetwork } = require('./build-pipeline-harness.cjs');
const { requestKey } = require('./listing-compatibility.cjs');

const args = process.argv.slice(2);
const arg = (key, fallback) => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : fallback; };
const before = arg('--before');
if (!before) { console.error('Usage: --before <git-ref>'); process.exit(2); }
const latencyMs = Number(arg('--latency', 150));
const aiLatencyMs = Number(arg('--ai', 5000));
const repo = path.resolve(__dirname, '../..');
const show = file => execFileSync('git', ['show', `${before}:${file}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
const engineFrom = source => import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));

async function listingImport(engine, fixture) {
  const network = replayNetwork(fixture, { latencyMs });
  const read = async (url, options) => {
    const response = await network.fetch(url, { headers: options?.fragment ? { 'X-Requested-With': 'XMLHttpRequest' } : {} });
    if (response.status === 302) return read(new URL(response.headers.get('location'), url).toString(), options);
    const html = await response.text();
    if (!response.ok) throw new Error(`The page returned ${response.status}.`);
    return { html, finalUrl: new URL(url) };
  };
  const started = Date.now();
  const result = await engine.discoverListings(fixture.seeds, read, { maxDepth: 5, maxPages: 160, maxListings: 100, maxDetailPages: 100, enrichAll: true, maxDurationMs: 120000 });
  return { elapsed: Date.now() - started, found: result.listings.length };
}

(async () => {
  const quiet = console.log; console.log = (...a) => { if (!/^\[(build|listing-sync)\]/.test(String(a[0]))) quiet(...a); };
  console.error = () => {}; console.warn = () => {};
  const oldBundle = show('supabase/functions/analyze-realtor-build/deploy.bundle.ts');
  const oldEngine = await engineFrom(show('supabase/functions/analyze-realtor-build/listingDiscovery.ts'));
  const newEngine = await engineFrom(fs.readFileSync(path.join(repo, 'supabase/functions/analyze-realtor-build/listingDiscovery.ts'), 'utf8'));
  const rows = [];
  for (const fixture of liveFixtures()) {
    const importBefore = await listingImport(oldEngine, fixture);
    const buildBefore = await runBuild(oldBundle, fixture, { latencyMs, aiLatencyMs });
    const importAfter = await listingImport(newEngine, fixture);
    const buildAfter = await runBuild(currentBundle(), fixture, { latencyMs, aiLatencyMs, connected: [fixture.seeds[0]] });
    if (importAfter.found !== importBefore.found) throw new Error(`${fixture.id}: listing count changed ${importBefore.found} -> ${importAfter.found}`);
    rows.push({ site: fixture.id.replace(/-\d+$/, ''), listings: importAfter.found,
      'import before': importBefore.elapsed, 'build before': buildBefore.elapsed, 'total before': importBefore.elapsed + buildBefore.elapsed,
      'import after': importAfter.elapsed, 'build after': buildAfter.elapsed, 'total after': Math.max(importAfter.elapsed, buildAfter.elapsed),
      'requests before': buildBefore.requests.length, 'requests after': buildAfter.requests.length });
  }
  quiet(`Simulated latency ${latencyMs} ms/request, AI ${aiLatencyMs} ms. Times in ms.`);
  console.table(rows);
})();
