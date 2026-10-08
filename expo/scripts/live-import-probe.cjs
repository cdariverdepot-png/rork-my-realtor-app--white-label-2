// Live probe: runs the analyze-realtor-build bundle (previous and current versions) against real
// public realtor websites over the real network, recording the streamed events, stage timings,
// listing counts and obstacles. Supabase is stubbed and the AI step returns a fixed neutral
// profile (no API key is used), so profile facts in this report are NOT extracted facts.
//   node scripts/live-import-probe.cjs --before <git-ref> --out report.json URL...
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadBuildFunction, readEventStream, currentBundle, defaultProfile } = require('./build-pipeline-harness.cjs');

const args = process.argv.slice(2);
const arg = key => { const i = args.indexOf(key); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const before = arg('--before');
const out = arg('--out') ?? 'live-import-probe.json';
const urls = args;
const repo = path.resolve(__dirname, '../..');

function liveFetch(log) {
  return async (input, init = {}) => {
    const url = String(input instanceof URL ? input : input.url ?? input);
    if (url.startsWith('https://api.openai.com/')) {
      const format = JSON.parse(init.body).text?.format?.name;
      return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(format === 'inventory_navigation' ? { ids: [] } : defaultProfile()) }] }] });
    }
    const entry = { url, start: Date.now() };
    log.push(entry);
    try {
      const response = await fetch(input, init);
      entry.status = response.status;
      return response;
    } catch (error) { entry.error = String(error.message ?? error); throw error; }
    finally { entry.ms = Date.now() - entry.start; }
  };
}

async function probe(bundleSource, url, stream) {
  const log = [];
  const sources = [{ id: 'website', kind: 'url', label: 'Website', uri: url, status: 'queued' }];
  const { handler } = loadBuildFunction(bundleSource, { fetch: liveFetch(log), sources });
  const started = Date.now();
  const response = await handler(new Request('https://probe.invalid/', { method: 'POST',
    headers: { Authorization: 'Bearer probe', 'Content-Type': 'application/json', ...(stream ? { Accept: 'text/event-stream' } : {}) }, body: '{}' }));
  let status, body, events = [], firstEventMs = null;
  if (stream) {
    const streamed = await readEventStream(response, () => { if (firstEventMs === null) firstEventMs = Date.now() - started; });
    events = streamed.events; status = streamed.result?.status; body = streamed.result?.body;
  } else { status = response.status; body = await response.json(); }
  const meta = body?.listingDiscovery ?? {};
  return { elapsedMs: Date.now() - started, firstEventMs, status, error: body?.error,
    listings: body?.discoveredListings?.length ?? 0, timings: body?.timings,
    discovery: { outcome: meta.outcome, interfaces: meta.interfaces, obstacles: meta.obstacles, issues: meta.issues, stages: meta.stages, enrichment: meta.enrichment, visited: meta.visited?.length },
    design: body?.draft?.websiteDesign ? { portrait: !!body.draft.websiteDesign.portraitImageUrl, logo: !!body.draft.websiteDesign.logoUrl, sections: body.draft.websiteDesign.sections?.length } : null,
    requests: log.length, failedRequests: log.filter(r => r.error || r.status >= 400).map(r => ({ url: r.url, status: r.status, error: r.error })).slice(0, 20),
    events };
}

(async () => {
  const quiet = console.log; console.log = (...a) => { if (!/^\[(build|listing-sync)\]/.test(String(a[0]))) quiet(...a); };
  console.error = () => {}; console.warn = () => {};
  const oldBundle = before ? execFileSync('git', ['show', `${before}:supabase/functions/analyze-realtor-build/deploy.bundle.ts`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 }) : null;
  const report = { ranAt: new Date().toISOString(), before, note: 'Real network; Supabase stubbed; AI step stubbed with a fixed neutral profile; no listing renderer configured.', sites: [] };
  for (const url of urls) {
    const site = { url };
    if (oldBundle) site.before = await probe(oldBundle, url, false).catch(error => ({ crashed: String(error.stack ?? error) }));
    site.after = await probe(currentBundle(), url, true).catch(error => ({ crashed: String(error.stack ?? error) }));
    report.sites.push(site);
    quiet(url, 'before', site.before?.elapsedMs, 'ms', site.before?.listings, '| after', site.after?.elapsedMs, 'ms', site.after?.listings, 'first event', site.after?.firstEventMs, 'ms');
  }
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
})();
