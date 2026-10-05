// Shared by the live audit and permanent offline replay suite. No app dependencies required on Node 22.18+.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

async function loadEngine() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/listingDiscovery.ts'), 'utf8');
  const code = stripTypeScriptTypes(source);
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

// Record decoded public responses only. Never serialize request headers, cookies or activation credentials.
const sanitize = text => text.replace(/("activationToken"\s*:\s*")[^"]+("|$)/g,
  (_, prefix, suffix) => prefix + '00000000-0000-0000-0000-000000000000' + suffix);
const requestKey = (url, options, rendering = false) => JSON.stringify(options?.cookie ? [url, !!options?.fragment, rendering, "gate"] : [url, !!options?.fragment, rendering]);
const snapshot = result => JSON.parse(JSON.stringify({
  listings: [...result.listings].sort((a,b) => a.sourceUrl.localeCompare(b.sourceUrl)),
  coverage: result.meta.coverage, outcome: result.meta.outcome, expectedCount: result.meta.expectedCount,
  issues: result.meta.issues, failed: result.meta.failed,
  strategies: [...new Set((result.meta.compatibility?.pages ?? []).flatMap(p => p.attempts.filter(a => a.outcome === 'extracted').map(a => a.id)))].sort(),
}));

function createRecorder(fetchPage, renderPage) {
  const pages = new Map();
  const wrap = (fetcher, rendering) => async (url, options) => {
    const key = requestKey(url, options, rendering);
    try {
      const page = await fetcher(url, options);
      pages.set(key, { key, url, fragment: !!options?.fragment, rendering, finalUrl: page.finalUrl.toString(), html: sanitize(page.html),
        ...(Array.isArray(page.network) ? { network: page.network.map(entry => ({ url: entry.url, html: sanitize(entry.html ?? '') })) } : {}) });
      return page;
    } catch (error) {
      pages.set(key, { key, url, fragment: !!options?.fragment, rendering, error: String(error.message ?? error) });
      throw error;
    }
  };
  return { fetchPage: wrap(fetchPage, false), renderPage: renderPage && wrap(renderPage, true),
    fixture: (id, seeds, options, result, rationale) => ({ schemaVersion: 1, id,
      capturedAt: new Date().toISOString(), provenance: 'public-response-capture', rationale,
      seeds, options, pages: [...pages.values()], expected: snapshot(result), evidence: result.meta.compatibility }) };
}

async function replayFixture(fixture, engine) {
  assert.equal(fixture.schemaVersion, 1, 'Unsupported replay schema');
  assert.ok(fixture.rationale, 'Every case must explain why the solution works');
  const pages = new Map(fixture.pages.map(page => [page.key, page]));
  assert.equal(pages.size, fixture.pages.length, 'Duplicate recorded request');
  const missing = [];
  const read = rendering => async (url, options) => {
    const page = pages.get(requestKey(url, options, rendering));
    if (!page) { missing.push(url); throw Error('Unrecorded request: ' + url); }
    if (page.error) throw Error(page.error);
    return { html: page.html, finalUrl: new URL(page.finalUrl), ...(page.network ? { network: page.network } : {}) };
  };
  const result = await engine.discoverListings(fixture.seeds, read(false), {
    ...fixture.options, maxDurationMs: 60000,
    ...(fixture.pages.some(p => p.rendering) ? { renderPage: read(true) } : {}),
  });
  assert.deepEqual(missing, [], 'Replay must never silently swallow a new request');
  assert.deepEqual(snapshot(result), fixture.expected, fixture.id + ': extraction contract changed');
  return result;
}

function writeFixture(directory, fixture) {
  assert.match(fixture.id, /^[a-z0-9][a-z0-9-]{0,100}$/);
  fs.mkdirSync(directory, { recursive: true });
  // A changed live inventory must become a NEW case; never silently rewrite a golden baseline.
  fs.writeFileSync(path.join(directory, fixture.id + '.json'), JSON.stringify(fixture, null, 2) + '\n', { flag: 'wx' });
}

module.exports = { loadEngine, createRecorder, replayFixture, writeFixture, snapshot, requestKey };
