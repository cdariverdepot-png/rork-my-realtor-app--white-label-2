// Replays captured website-reader responses through the analyze-realtor-build bundle offline.
// Used for CPU profiling and to prove a refactor leaves the reader's output unchanged:
// the AI request body (what the profile model reads) and the website design are both returned.
const fs = require('node:fs');
const zlib = require('node:zlib');
const { loadBuildFunction, readEventStream, defaultProfile } = require('./build-pipeline-harness.cjs');

function loadCapture(file) {
  const raw = fs.readFileSync(file);
  return JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8'));
}

function replayFetch(capture, seen) {
  const byUrl = new Map();
  for (const entry of capture.responses) if (!byUrl.has(entry.url)) byUrl.set(entry.url, entry);
  let aiRequest;
  const fetch = async (input, init = {}) => {
    const url = String(input instanceof URL ? input : input.url ?? input);
    if (url.startsWith('https://api.openai.com/')) {
      const body = JSON.parse(init.body);
      const format = body.text?.format?.name;
      // Reader parity compares semantic inputs. Admission control is independently tested.
      const { max_output_tokens: _outputBound, ...semanticBody } = body;
      if (format !== 'inventory_navigation') aiRequest = semanticBody;
      return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(format === 'inventory_navigation' ? { ids: [] } : defaultProfile()) }] }] });
    }
    seen?.push(url);
    const entry = byUrl.get(url);
    if (!entry) return new Response('<html><title>Not captured</title></html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
    const redirect = entry.status >= 300 && entry.status < 400;
    return new Response(redirect ? null : entry.body, { status: entry.status, headers: { 'Content-Type': entry.contentType || 'text/html', ...(entry.location ? { Location: entry.location } : {}) } });
  };
  return { fetch, aiRequest: () => aiRequest };
}

/** Runs one capture; returns CPU used, the AI request and the design, stripped of volatile fields. */
async function replayCapture(bundleSource, capture) {
  const seen = [];
  const network = replayFetch(capture, seen);
  const sources = [{ id: 'website', kind: 'url', label: 'Website', uri: capture.seed, status: 'queued' }];
  const { handler } = loadBuildFunction(bundleSource, { fetch: network.fetch, sources });
  const started = process.cpuUsage();
  const response = await handler(new Request('https://replay.invalid/', { method: 'POST',
    headers: { Authorization: 'Bearer replay', 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ connectedListingSources: [capture.seed] }) }));
  const { events, result } = await readEventStream(response);
  const used = process.cpuUsage(started);
  const design = result?.body?.draft?.websiteDesign ? { ...result.body.draft.websiteDesign } : null;
  if (design) delete design.analyzedAt;
  return { cpuMs: Math.round((used.user + used.system) / 1000), status: result?.status, events, aiRequest: network.aiRequest(), design, requested: seen };
}

module.exports = { loadCapture, replayCapture, replayFetch };
