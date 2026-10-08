// Captures every public HTTP response the website/profile reader requests for a site, so the build
// path (page details, imagery, design, linked pages) can be replayed offline: CPU profiling and
// regression tests run against exactly what the live site served. The AI step is stubbed and never
// recorded; listing discovery is skipped (it has its own replay corpus).
//   node scripts/capture-build-pages.cjs --out DIR --id NAME URL [--id NAME URL ...]
const fs = require('node:fs');
const path = require('node:path');
const { loadBuildFunction, readEventStream, currentBundle, defaultProfile } = require('./build-pipeline-harness.cjs');

const args = process.argv.slice(2);
const out = args[args.indexOf('--out') + 1];
const pairs = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--id') pairs.push({ id: args[i + 1], url: args[i + 2] });
fs.mkdirSync(out, { recursive: true });

function recordingFetch(responses) {
  return async (input, init = {}) => {
    const url = String(input instanceof URL ? input : input.url ?? input);
    if (url.startsWith('https://api.openai.com/')) {
      const format = JSON.parse(init.body).text?.format?.name;
      return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(format === 'inventory_navigation' ? { ids: [] } : defaultProfile()) }] }] });
    }
    const response = await fetch(input, init);
    const body = response.status >= 300 && response.status < 400 ? '' : await response.text();
    const entry = { url, status: response.status, contentType: response.headers.get('content-type') ?? '',
      location: response.headers.get('location') ?? undefined, body: body.slice(0, 2_100_000) };
    responses.push(entry);
    return new Response(entry.status >= 300 && entry.status < 400 ? null : entry.body,
      { status: entry.status, headers: { 'Content-Type': entry.contentType, ...(entry.location ? { Location: entry.location } : {}) } });
  };
}

(async () => {
  console.log = ((log) => (...a) => { if (!/^\[(build|listing-sync)\]/.test(String(a[0]))) log(...a); })(console.log);
  console.error = () => {}; console.warn = () => {};
  for (const { id, url } of pairs) {
    const responses = [];
    const sources = [{ id: 'website', kind: 'url', label: 'Website', uri: url, status: 'queued' }];
    const { handler } = loadBuildFunction(currentBundle(), { fetch: recordingFetch(responses), sources });
    const response = await handler(new Request('https://capture.invalid/', { method: 'POST',
      headers: { Authorization: 'Bearer capture', 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ connectedListingSources: [url] }) }));
    const { result } = await readEventStream(response);
    const capture = { schemaVersion: 1, id, capturedAt: new Date().toISOString(), provenance: 'public-response-capture',
      seed: url, status: result?.status, responses };
    fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(capture));
    process.stdout.write(`${id}: ${responses.length} responses, ${Math.round(JSON.stringify(capture).length / 1024)} KB, status ${result?.status}\n`);
  }
})();
