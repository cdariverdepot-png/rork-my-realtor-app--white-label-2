// Runs the real analyze-realtor-build bundle offline against recorded public responses.
// Network latency is simulated per request so orchestration (sequential vs concurrent,
// duplicated reads) shows up in wall-clock time exactly as it would against a live site.
// Shared by tests/importerPipeline.test.cjs and scripts/benchmark-build-pipeline.cjs.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { requestKey } = require('./listing-compatibility.cjs');

const functionsRoot = path.resolve(__dirname, '../../supabase/functions');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiledBundles = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A fetch that serves recorded pages (and 404s anything unrecorded) after `latencyMs`. */
function replayNetwork(fixture, { latencyMs = 25, aiLatencyMs = 50, profile } = {}) {
  const pages = new Map();
  for (const page of fixture.pages) {
    if (page.rendering || page.error) continue;
    pages.set(requestKey(page.url, { fragment: page.fragment }), page);
    if (page.finalUrl && page.finalUrl !== page.url) pages.set(requestKey(page.finalUrl, { fragment: page.fragment }), { ...page, url: page.finalUrl });
  }
  const log = [];
  let inFlight = 0, maxInFlight = 0;
  const fetch = async (input, init = {}) => {
    const url = String(input instanceof URL ? input : input.url ?? input);
    const headers = init.headers ?? {};
    const entry = { url, start: Date.now(), end: 0 };
    log.push(entry);
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (url.startsWith('https://api.openai.com/')) {
        await sleep(aiLatencyMs);
        const body = JSON.parse(init.body);
        const format = body.text?.format?.name;
        const result = format === 'inventory_navigation' ? { ids: [] } : profile;
        return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] });
      }
      await sleep(latencyMs);
      const fragment = /XMLHttpRequest/.test(headers['X-Requested-With'] ?? '');
      const page = pages.get(requestKey(url, { fragment })) ?? (fragment ? undefined : pages.get(requestKey(url, { fragment: true })));
      if (!page) return new Response('<html><title>Not Found</title></html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
      if (page.finalUrl && page.finalUrl !== url && pages.has(requestKey(page.finalUrl, { fragment: page.fragment }))) {
        return new Response(null, { status: 302, headers: { Location: page.finalUrl } });
      }
      const type = /^\s*[[{]/.test(page.html) ? 'application/json' : 'text/html; charset=utf-8';
      return new Response(page.html, { status: 200, headers: { 'Content-Type': type } });
    } finally {
      entry.end = Date.now();
      inFlight--;
    }
  };
  return { fetch, log, maxInFlight: () => maxInFlight };
}

/** Loads the single-file Edge Function with Supabase and the network replaced by fixtures. */
function loadBuildFunction(bundleSource, { fetch, sources, guest = false }) {
  let handler;
  const saved = [];
  const admin = {
    rpc: async () => ({ data: true, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: 'owner', is_anonymous: guest, email_confirmed_at: guest ? null : 'now' } }, error: null }) },
    from: table => table === 'realtors'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'realtor' }, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ single: async () => ({ data: { sources, evidence: [], draft: {}, status: 'collecting' } }) }) }),
          update: value => ({ eq: async () => { saved.push(value); return { error: null }; } }) },
  };
  const env = name => name.startsWith('LISTING_RENDER') ? undefined : 'fixture';
  let code = compiledBundles.get(bundleSource);
  if (!code) { code = compile(bundleSource.replace(/^import .*createClient.*;\r?\n/, '')); compiledBundles.set(bundleSource, code); }
  new Function('Deno', 'createClient', 'fetch', code)({
    env: { get: env }, resolveDns: async (_, type) => type === 'A' ? ['8.8.8.8'] : [], serve: fn => { handler = fn; },
  }, () => admin, fetch);
  return { handler, saved };
}

/** Parses a server-sent-events body into { events, result }. */
async function readEventStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '', result;
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
      if (!data) continue;
      const message = JSON.parse(data);
      if (message.event) { events.push(message.event); onEvent?.(message.event); }
      if (message.result) result = message.result;
    }
    if (done) break;
  }
  return { events, result };
}

/** Runs one build request; returns elapsed time, response body and (when streamed) the events. */
async function runBuild(bundleSource, fixture, { stream = false, connected = [], latencyMs, aiLatencyMs, profile } = {}) {
  const seed = fixture.seeds[0];
  const sources = [{ id: 'website', kind: 'url', label: 'Website', uri: seed, status: 'queued' }];
  const network = replayNetwork(fixture, { latencyMs, aiLatencyMs, profile: profile ?? defaultProfile() });
  const { handler, saved } = loadBuildFunction(bundleSource, { fetch: network.fetch, sources });
  const started = Date.now();
  const response = await handler(new Request('https://fixture.invalid/functions/v1/analyze-realtor-build', {
    method: 'POST',
    headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json', ...(stream ? { Accept: 'text/event-stream' } : {}) },
    body: JSON.stringify(connected.length ? { connectedListingSources: connected } : {}),
  }));
  let status, body, events = [];
  if (stream) {
    const streamed = await readEventStream(response);
    events = streamed.events;
    status = streamed.result?.status;
    body = streamed.result?.body;
  } else {
    status = response.status;
    body = await response.json();
  }
  return { elapsed: Date.now() - started, status, body, events, requests: network.log, maxInFlight: network.maxInFlight(), saved };
}

function defaultProfile() {
  return {
    evidence: [{ field: 'realtor.name', value: 'Replay Realtor', sourceId: 'website', locator: 'fixture', confidence: 0.9 }],
    copy: { heroMessage: 'Replay hero', welcomeNote: 'Welcome', tagline: 'Tagline', aboutParagraph: 'Replay about', conciergeLine: 'Concierge', contactLine: 'Contact' },
    tone: 'warm', layoutId: 'warm-concierge', potentialListingSources: [], portraitSourceId: null,
  };
}

const liveFixtures = () => {
  const directory = path.resolve(__dirname, '../tests/fixtures/listing-compatibility');
  return fs.readdirSync(directory).filter(name => /-\d{13}\.json$/.test(name))
    .map(name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
};
const currentBundle = () => fs.readFileSync(path.join(functionsRoot, 'analyze-realtor-build/deploy.bundle.ts'), 'utf8');

module.exports = { replayNetwork, loadBuildFunction, readEventStream, runBuild, liveFixtures, currentBundle, defaultProfile };
