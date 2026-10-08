// CPU attribution for the deployed importer code on live sites (no app, no database writes).
// Production analyze/refresh isolates were killed with "CPU Time exceeded"; this measures how much
// CPU each stage consumes for the same sites, the HTML sizes involved and the first-page HTTP result.
// The AI step is stubbed (no API key), so profile facts here are not extracted facts.
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { loadBuildFunction, readEventStream, currentBundle, defaultProfile } = require('./build-pipeline-harness.cjs');

const out = process.env.OUT_DIR ?? path.resolve('cpu-out');
fs.mkdirSync(out, { recursive: true });
const sites = JSON.parse(process.env.SITES);
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };

function liveFetch(log) {
  return async (input, init = {}) => {
    const url = String(input instanceof URL ? input : input.url ?? input);
    if (url.startsWith('https://api.openai.com/')) {
      const format = JSON.parse(init.body).text?.format?.name;
      return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(format === 'inventory_navigation' ? { ids: [] } : defaultProfile()) }] }] });
    }
    const entry = { url: url.slice(0, 160), start: Date.now() };
    log.push(entry);
    try {
      const res = await fetch(input, init);
      entry.status = res.status;
      entry.type = res.headers.get('content-type');
      entry.length = Number(res.headers.get('content-length') ?? 0) || undefined;
      return res;
    } catch (e) { entry.error = String(e.message ?? e).slice(0, 120); throw e; }
    finally { entry.ms = Date.now() - entry.start; }
  };
}

async function analyze(site) {
  const log = [];
  const sources = [{ id: 'website', kind: 'url', label: 'Website', uri: site.url, status: 'queued' }];
  const { handler } = loadBuildFunction(currentBundle(), { fetch: liveFetch(log), sources });
  const stages = [];
  let last = cpu();
  const c0 = last, t0 = Date.now();
  const response = await handler(new Request('https://probe.invalid/', { method: 'POST',
    headers: { Authorization: 'Bearer probe', 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ connectedListingSources: [site.url] }) }));
  const { events, result } = await readEventStream(response, event => {
    const now = cpu();
    stages.push({ at: Date.now() - t0, cpuMs: Math.round(now - last), event: event.kind === 'stage' ? `${event.stage}:${event.state}` : event.kind, detail: event.name ?? event.count ?? undefined });
    last = now;
  });
  return { wallMs: Date.now() - t0, cpuMs: Math.round(cpu() - c0), status: result?.status, error: result?.body?.error,
    sourceErrors: (result?.body?.sources ?? []).map(s => s.error).filter(Boolean), stages, firstRequests: log.slice(0, 6), requests: log.length, events: events.length };
}

async function discover(engine, site) {
  const log = [];
  const f = liveFetch(log);
  const fetchHtml = async (uri, options) => {
    const res = await f(uri, { headers: options?.fragment ? { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json,text/html' } : { Accept: 'text/html' }, signal: AbortSignal.timeout(12000) });
    const html = await res.text();
    if (!res.ok && !/<html|<!doctype/i.test(html.slice(0, 500))) throw new Error(`The page returned ${res.status}.`);
    return { html, finalUrl: new URL(res.url || uri) };
  };
  const pages = [];
  let last = cpu();
  const c0 = last, t0 = Date.now();
  const result = await engine.discoverListings([site.url], fetchHtml, { maxDepth: 5, maxPages: 160, maxListings: 100, maxDetailPages: 100, enrichAll: true, maxDurationMs: 60000,
    onProgress: event => { const now = cpu(); pages.push({ at: Date.now() - t0, cpuMs: Math.round(now - last), phase: event.phase, url: event.url?.slice(0, 120), pages: event.pages, found: event.found, done: event.done }); last = now; } })
    .catch(e => ({ error: String(e.message ?? e) }));
  const sizes = log.map(r => r.length).filter(Boolean);
  return { wallMs: Date.now() - t0, cpuMs: Math.round(cpu() - c0), error: result.error, found: result.listings?.length, outcome: result.meta?.outcome,
    interfaces: result.meta?.interfaces, inventoryUrls: result.meta?.inventoryUrls?.slice(0, 6), obstacles: result.meta?.obstacles?.slice(0, 4), stages: result.meta?.stages,
    visited: result.meta?.visited?.slice(0, 40), maxCpuStep: pages.reduce((m, p) => p.cpuMs > m.cpuMs ? p : m, { cpuMs: 0 }), steps: pages.length,
    requests: log.length, largestResponses: sizes.sort((a, b) => b - a).slice(0, 5), sample: (result.listings ?? []).slice(0, 5).map(l => ({ title: l.title, price: l.price, sourceUrl: l.sourceUrl, images: l.images?.length })) };
}

(async () => {
  console.log = ((log) => (...a) => { if (!/^\[(build|listing-sync)\]/.test(String(a[0]))) log(...a); })(console.log);
  console.error = () => {}; console.warn = () => {};
  const source = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/listingDiscovery.ts'), 'utf8');
  const engine = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
  for (const site of sites) {
    const record = { id: site.id, url: site.url };
    record.analyze = await analyze(site).catch(e => ({ crashed: String(e.stack ?? e).slice(0, 500) }));
    record.discovery = await discover(engine, site).catch(e => ({ crashed: String(e.stack ?? e).slice(0, 500) }));
    fs.writeFileSync(path.join(out, `${site.id}.json`), JSON.stringify(record, null, 2));
    process.stdout.write(`${site.id} analyze cpu ${record.analyze.cpuMs} discovery cpu ${record.discovery.cpuMs}\n`);
  }
})();
