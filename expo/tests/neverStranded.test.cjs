// Repair campaign, stage 2: a failed import never strands the realtor. Every failure path ends with
// (1) the real reason, (2) a way to retry, and (3) what was already saved still saved. Showing an
// error is not a fix for the failure itself; these tests only pin down that nobody is left on a
// spinner or a blank screen while the underlying failures are repaired in the other stages.
// All responses here are synthetic contracts, not live captures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { replayNetwork, loadBuildFunction, readEventStream, runBuild, currentBundle } = require('../scripts/build-pipeline-harness.cjs');

const bundle = currentBundle();
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const quiet = async work => {
  const log = console.log, error = console.error;
  console.log = () => {}; console.error = () => {};
  try { return await work(); } finally { console.log = log; console.error = error; }
};
const loadModule = (file, stubs) => {
  const moduleRef = { exports: {} };
  const localRequire = id => {
    if (id in stubs) return stubs[id];
    throw new Error(`unexpected import ${id}`);
  };
  new Function('module', 'exports', 'require', compile(read(file)))(moduleRef, moduleRef.exports, localRequire);
  return moduleRef.exports;
};
const progressModel = () => loadModule('lib/importProgress.ts', {});

/** importStream with a signed-in session and a scripted streaming response. */
const streamWith = chunks => {
  const encoder = new TextEncoder();
  const body = {
    getReader() {
      let i = 0;
      return { read: async () => {
        if (i >= chunks.length) return { done: true, value: undefined };
        const chunk = chunks[i++];
        if (chunk instanceof Error) throw chunk;
        return { done: false, value: encoder.encode(chunk) };
      } };
    },
  };
  return loadModule('lib/importStream.ts', {
    '@/lib/supabase': {
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } }, error: null }) } },
      supabaseFunctionUrl: name => `https://fixture.invalid/functions/v1/${name}`, supabasePublicKey: 'public',
    },
    '@/lib/importProgress': progressModel(),
    'expo/fetch': { fetch: async () => ({ status: 200, headers: new Headers({ 'Content-Type': 'text/event-stream' }), body }) },
  });
};
const event = value => `data: ${JSON.stringify({ event: value })}\n\n`;

test('a stream that ends without the final answer is reported as an interruption, after its real events', async () => {
  const seen = [];
  const { invokeWithProgress } = streamWith([event({ kind: 'stage', stage: 'listings', state: 'start', at: 1 })]);
  await assert.rejects(invokeWithProgress('refresh-listings', {}, e => seen.push(e)),
    { message: 'The import was interrupted before it finished. Anything already saved is kept.' });
  assert.deepEqual(seen.map(e => e.stage), ['listings']);
});

test('a connection dropped mid-stream is the same interruption, not a raw network error', async () => {
  const { invokeWithProgress } = streamWith([event({ kind: 'site', name: 'A', host: 'a.example', at: 1 }), new TypeError('Network request failed')]);
  await assert.rejects(invokeWithProgress('analyze-realtor-build', {}, () => {}), /interrupted before it finished/);
});

test('when a request fails, nothing in that channel is left spinning', () => {
  const model = progressModel();
  let lines = model.requestStarted(model.requestStarted([], 'listings'), 'build');
  lines = model.applyImportEvent(lines, 'build', { kind: 'stage', stage: 'profile', state: 'start', at: 1 });
  lines = model.requestFinished(lines, 'build', false);
  assert.deepEqual(lines.filter(line => line.id.startsWith('build:')).map(line => line.state).filter(s => s === 'active'), []);
  assert.ok(lines.some(line => line.id.startsWith('listings:') && line.state === 'active'), 'the other request is untouched');
});

test('an unreadable website returns a coded, actionable reason and closes every stage it opened', () => quiet(async () => {
  const fixture = { seeds: ['https://www.unreadable-site.example/'], pages: [] };
  const run = await runBuild(bundle, fixture, { stream: true, latencyMs: 1 });
  assert.equal(run.status, 422);
  assert.equal(run.body.code, 'sources_unreadable');
  assert.match(run.body.error, /unreadable-site\.example says that page does not exist \(404\)/);
  assert.match(run.body.error, /retry, or use a different page/);
  const opened = run.events.filter(e => e.kind === 'stage' && e.state === 'start').map(e => e.stage);
  const closed = new Set(run.events.filter(e => e.kind === 'stage' && e.state !== 'start').map(e => e.stage));
  for (const stage of opened) assert.ok(closed.has(stage), `${stage} was left open`);
}));

test('a rejected profile model returns a coded reason that says what is kept', () => quiet(async () => {
  const fixture = { seeds: ['https://agent.example/'], pages: [{ url: 'https://agent.example/', finalUrl: 'https://agent.example/',
    html: '<html><head><title>Jane Agent | Realtor</title></head><body><h1>Jane Agent</h1><p>Helping buyers and sellers in Springfield.</p></body></html>' }] };
  const network = replayNetwork(fixture, { latencyMs: 1 });
  const fetch = async (input, init) => String(input).startsWith('https://api.openai.com/')
    ? new Response('{"error":"rate limited"}', { status: 429 }) : network.fetch(input, init);
  const { handler } = loadBuildFunction(bundle, { fetch, sources: [{ id: 'website', kind: 'url', label: 'Website', uri: fixture.seeds[0], status: 'queued' }] });
  const response = await handler(new Request('https://fixture.invalid/functions/v1/analyze-realtor-build', {
    method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: '{}' }));
  const { events, result } = await readEventStream(response);
  assert.equal(result.status, 502);
  assert.equal(result.body.code, 'ai_rejected');
  assert.match(result.body.error, /AI quota or rate limit.*sources are still saved; please retry/);
  assert.deepEqual(events.filter(e => e.stage === 'profile').map(e => e.state), ['start', 'failed']);
}));

test('the build screen keeps the activity and offers the reason, what was kept, Retry and Change website', () => {
  const component = read('components/BuildProgress.tsx');
  assert.match(component, /failure\.message/);
  assert.match(component, /failure\.kept\.map/);
  assert.match(component, /accessibilityLabel="Retry the build"/);
  assert.match(component, /accessibilityLabel="Change website"/);
  assert.match(component, /const active = !failure && line\.state === "active"/, 'a stopped build shows no spinner');
  const setup = read('components/InitialRealtorSetup.tsx');
  assert.match(setup, /<BuildProgress lines=\{activity\} failure=\{buildFailure\}/);
  assert.match(setup, /onRetry=\{\(\) => \{ setBuildFailure\(null\); analyze\(\); \}\}/);
  assert.match(setup, /imported and saved\. They are kept\./);
  // Only account/ownership problems stop the profile build when listings could not be imported.
  assert.match(setup, /error instanceof ListingImportError && \(error\.status === 401 \|\| error\.status === 403\)\) throw error/);
});

/** listingSourceService with a signed-in session and scripted refresh-listings responses. */
const listingService = responses => {
  const calls = [];
  const service = loadModule('lib/listingSourceService.ts', {
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }) } } },
    '@/lib/importerFunctions': { LISTING_FUNCTION: 'refresh-listings' },
    '@/lib/importStream': { invokeWithProgress: async (_, body) => {
      calls.push(body);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { status: 200, body: next };
    } },
  });
  return { service, calls };
};

test('setup keeps reading deferred details job by job until every listing was attempted', async () => {
  const { service, calls } = listingService([
    { ok: true, imported: 60, source: { id: 'src' }, detailsPending: 48, detailsSince: 77, items: [] },
    { ok: true, attempted: 25, detailsPending: 23, items: [{ id: 'a' }] },
    { ok: true, attempted: 23, remaining: 0, items: [{ id: 'b' }], warning: '3 listings have incomplete property details.' },
  ]);
  const result = await service.connectListingSource('https://agent.example/listings', 'r1', () => {});
  assert.deepEqual(calls.map(c => c.mode), ['connect', 'details', 'details']);
  assert.ok(calls.slice(1).every(c => c.sourceId === 'src' && c.since === 77), 'every job belongs to the same import');
  assert.equal(result.imported, 60);
  assert.equal(result.detailsPending, 0);
  assert.deepEqual(result.items, [{ id: 'b' }]);
  assert.match(result.warning, /3 listings have incomplete/);
});

test('an interrupted detail job keeps the import and says exactly what is still missing', async () => {
  const { service, calls } = listingService([
    { ok: true, imported: 60, source: { id: 'src' }, detailsPending: 48, detailsSince: 77, items: [{ id: 'cards' }] },
    { ok: true, attempted: 25, detailsPending: 23, items: [{ id: 'first-batch' }] },
    new Error('The import was interrupted before it finished. Anything already saved is kept.'),
  ]);
  const result = await service.connectListingSource('https://agent.example/listings', 'r1', () => {});
  assert.equal(calls.length, 3);
  assert.equal(result.imported, 60, 'the saved inventory is still reported');
  assert.deepEqual(result.items, [{ id: 'first-batch' }], 'details read before the interruption are kept');
  assert.match(result.warning, /Full details for 23 of them could not be read this time.*Sync your listings to try again/);
});

test('a detail job that makes no progress ends the loop instead of repeating', async () => {
  const { service, calls } = listingService([
    { ok: true, imported: 5, source: { id: 'src' }, detailsPending: 5, detailsSince: 9 },
    { ok: true, attempted: 0, detailsPending: 5 },
  ]);
  await service.connectListingSource('https://agent.example/listings', 'r1', () => {});
  assert.equal(calls.length, 2);
});

test('production builds call the production importer; only a well-formed suffix selects staging copies', () => {
  const names = suffix => {
    const saved = process.env.EXPO_PUBLIC_FUNCTION_SUFFIX;
    if (suffix === undefined) delete process.env.EXPO_PUBLIC_FUNCTION_SUFFIX; else process.env.EXPO_PUBLIC_FUNCTION_SUFFIX = suffix;
    try { return loadModule('lib/importerFunctions.ts', {}); }
    finally { if (saved === undefined) delete process.env.EXPO_PUBLIC_FUNCTION_SUFFIX; else process.env.EXPO_PUBLIC_FUNCTION_SUFFIX = saved; }
  };
  assert.deepEqual({ ...names(undefined) }, { BUILD_FUNCTION: 'analyze-realtor-build', LISTING_FUNCTION: 'refresh-listings' });
  assert.deepEqual({ ...names('-staging') }, { BUILD_FUNCTION: 'analyze-realtor-build-staging', LISTING_FUNCTION: 'refresh-listings-staging' });
  assert.equal(names('/../billing').BUILD_FUNCTION, 'analyze-realtor-build');
});

// Repair stage 3 (synthetic contracts): blocked pages, loader shells and transient failures.
const buildWith = async fetch => {
  const { handler } = loadBuildFunction(bundle, { fetch, sources: [{ id: 'website', kind: 'url', label: 'Website', uri: 'https://agent.example/', status: 'queued' }] });
  const response = await handler(new Request('https://fixture.invalid/functions/v1/analyze-realtor-build', {
    method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ connectedListingSources: ['https://agent.example/'] }) }));
  return { status: response.status, body: await response.json() };
};
const ai = () => Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(require('../scripts/build-pipeline-harness.cjs').defaultProfile()) }] }] });
const agentPage = '<html><head><title>Jane Agent | Realtor</title></head><body><h1>Jane Agent</h1><p>' + 'Helping buyers and sellers in Springfield for twenty years. '.repeat(6) + '</p></body></html>';

test('a CDN error page is never read as the website', () => quiet(async () => {
  let aiCalls = 0;
  const result = await buildWith(async input => {
    const url = String(input.url ?? input);
    if (url.startsWith('https://api.openai.com/')) { aiCalls++; return ai(); }
    return new Response('<html><head><title>ERROR: The request could not be satisfied</title></head><body><h1>403 ERROR</h1><h2>The request could not be satisfied.</h2>Request blocked. We can\'t connect to the server for this app or website at this time.<br>Generated by cloudfront (CloudFront)</body></html>', { status: 403, headers: { 'Content-Type': 'text/html' } });
  });
  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'sources_unreadable');
  assert.match(result.body.error, /agent\.example refused our request \(403\)|agent\.example sent an error page/);
  assert.equal(aiCalls, 0);
}));

test('a loader shell is not the website; without a browser the build says why', () => quiet(async () => {
  const result = await buildWith(async input => {
    const url = String(input.url ?? input);
    if (url.startsWith('https://api.openai.com/')) return ai();
    return new Response('<html><head><title>C21 loading...</title><script src="/app.js"></script></head><body><div id="app">Loading...</div></body></html>', { headers: { 'Content-Type': 'text/html' } });
  });
  assert.equal(result.status, 422);
  assert.match(result.body.error, /only shows a loader \(“C21 loading\.\.\. Loading\.\.\.”\); its content is built in the browser/);
}));

test('one slow response is retried instead of failing the build', () => quiet(async () => {
  let homepage = 0;
  const result = await buildWith(async input => {
    const url = String(input.url ?? input);
    if (url.startsWith('https://api.openai.com/')) return ai();
    if (url === 'https://agent.example/' && homepage++ === 0) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    if (url === 'https://agent.example/') return new Response(agentPage, { headers: { 'Content-Type': 'text/html' } });
    return new Response('<html><title>Not Found</title></html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
  });
  assert.equal(homepage, 2, 'the homepage was requested twice');
  assert.equal(result.status, 200);
}));

test('a guest/owner-test placeholder address is never shown as the realtor contact', () => {
  const brand = read('contexts/BrandContext.tsx');
  assert.match(brand, /email: publicEmail\(record\?\.email\)/);
  assert.match(brand, /email: publicEmail\(unborrow\(r\.email, d\.email, f\.email\)\)/);
  assert.ok(brand.includes('/@guest\\.myrealtor\\.app$/i.test(email) ? "" : email'), 'guest placeholders are recognized');
});

test('an unpublished listing status is never shown as an internal sync state', () => {
  const label = read('lib/listingStatusLabel.ts');
  assert.doesNotMatch(label, /Status unconfirmed/);
  assert.match(label, /return item\.tag \|\| "Listing";/);
});

test('an exhausted AI account is reported as unavailable on our side, not as the realtor\'s retry problem', () => quiet(async () => {
  const fixture = { seeds: ['https://agent.example/'], pages: [{ url: 'https://agent.example/', finalUrl: 'https://agent.example/',
    html: '<html><head><title>Jane Agent | Realtor</title></head><body><h1>Jane Agent</h1><p>Helping buyers and sellers in Springfield.</p></body></html>' }] };
  const network = replayNetwork(fixture, { latencyMs: 1 });
  const fetch = async (input, init) => String(input).startsWith('https://api.openai.com/')
    ? new Response('{"error":{"type":"insufficient_quota","code":"credit_balance_exhausted"}}', { status: 429 }) : network.fetch(input, init);
  const { handler } = loadBuildFunction(bundle, { fetch, sources: [{ id: 'website', kind: 'url', label: 'Website', uri: fixture.seeds[0], status: 'queued' }] });
  const response = await handler(new Request('https://fixture.invalid/functions/v1/analyze-realtor-build', {
    method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: '{}' }));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, 'ai_unavailable');
  assert.match(body.error, /temporarily unavailable on our side.*listings are saved/);
  assert.doesNotMatch(body.error, /quota|credit/i);
}));
