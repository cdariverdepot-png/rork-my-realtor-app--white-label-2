const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { publicRenderTarget, selectCapturedResponses, isPrivateAddress, NETWORK_CAP } = require('../../services/listing-renderer/renderContract.cjs');

test('importer reads the renderer only from Deno.env', () => {
  const root = path.resolve(__dirname, '../..');
  assert.equal(fs.existsSync(path.join(root, 'supabase/functions/analyze-realtor-build/listingRenderEnv.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts/bake-listing-render-env.py')), false);
  const files = [
    'supabase/functions/analyze-realtor-build/index.ts',
    'supabase/functions/analyze-realtor-build/deploy.bundle.ts',
    'supabase/functions/refresh-listings/sourceHandler.ts',
    '.github/workflows/deploy-listing-renderer.yml',
    '.github/workflows/deploy-functions.yml',
  ].map(file => fs.readFileSync(path.join(root, file), 'utf8'));
  const joined = files.join('\n');
  assert.doesNotMatch(joined, /listingRenderEnv|bake-listing-render-env/);
  assert.match(files[0], /listingRenderBackendFromEnv\(name => Deno\.env\.get\(name\)\)/);
  assert.match(files[1], /listingRenderBackendFromEnv\(name => Deno\.env\.get\(name\)\)/);
  assert.match(files[2], /listingRenderBackendFromEnv\(name => Deno\.env\.get\(name\)\)/);
  assert.match(files[3], /supabase secrets set/);
  assert.match(files[4], /confirm-listing-render-secrets\.py/);
  assert.doesNotMatch(files.slice(0, 3).join('\n'), /fly\.dev|[0-9a-f]{32}/);
});

test('renderer rejects private networks, metadata hosts and non-HTTPS targets', () => {
  for (const raw of [
    'http://agent.example/listings',
    'https://localhost/listings',
    'https://127.0.0.1/listings',
    'https://10.1.2.3/listings',
    'https://192.168.1.9/listings',
    'https://172.16.0.4/listings',
    'https://169.254.169.254/latest/meta-data',
    'https://metadata.google.internal/',
    'file:///etc/passwd',
    'https://user:pass@agent.example/',
    'https://printer.local/',
    'https://db.internal/',
  ]) {
    assert.equal(publicRenderTarget(raw).status, 400, raw);
  }
  assert.equal(publicRenderTarget('https://www.compass.com/homes-for-sale/index-wa/').error, undefined);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('::1'), true);
});

test('renderer keeps at most 30 same-origin JSON or search payloads and scrubs the session', () => {
  const page = 'https://agent.example/listings';
  const entries = Array.from({ length: 40 }, (_, i) => ({
    url: `https://agent.example/api/listings?page=${i}`,
    contentType: 'application/json',
    html: `{"n":${i},"cookie":"session-secret-value"}`,
  }));
  entries.push({ url: 'https://ads.example/pixel', contentType: 'application/json', html: '{"ad":1}' });
  entries.push({ url: 'https://agent.example/app.css', contentType: 'text/css', html: 'body{}' });
  const selected = selectCapturedResponses(entries, page, 'session-secret-value');
  assert.equal(selected.length, NETWORK_CAP);
  assert.equal(selected.some(row => row.html.includes('session-secret-value')), false);
  assert.equal(selected.some(row => /ads\.example/.test(row.url)), false);
});

test('listing render server enforces auth, SSRF, failure cleanup and a bounded document', async t => {
  // The browser is simulated, so DNS must be deterministic and offline too.
  const dns = require('node:dns/promises');
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  require('node:module').syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    require('node:module').syncBuiltinESMExports();
  });
  const { createListingRenderServer } = await import('../../services/listing-renderer/server.mjs');
  let closed = 0;
  const browser = {
    async newContext() {
      return {
        async setExtraHTTPHeaders() {},
        async newPage() {
          return {
            on(event, listener) {
              if (event === 'response') listener({
                url: () => 'https://example.com/api/search',
                headers: () => ({ 'content-type': 'application/json' }),
                text: async () => '{"listings":[{"id":"1"}]}',
              });
            },
            async goto() {},
            async waitForLoadState() {},
            url: () => 'https://example.com/listings',
            async content() { return '<html><title>Example Listings</title><body>homes</body></html>'; },
            async waitForTimeout() {},
          };
        },
        async close() { closed += 1; },
      };
    },
  };
  const failing = {
    async newContext() {
      return {
        async setExtraHTTPHeaders() {},
        async newPage() {
          return {
            on() {},
            async goto() { throw new Error('Timeout 10000ms exceeded'); },
            async waitForLoadState() {},
            url: () => 'https://example.com/',
            async content() { return ''; },
            async waitForTimeout() {},
          };
        },
        async close() { closed += 1; },
      };
    },
  };
  const token = 'test-token-value-1';
  let useFail = false;
  const server = createListingRenderServer({
    token,
    browser: new Proxy({}, { get: (_t, prop) => (...args) => (useFail ? failing : browser)[prop](...args) }),
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const port = server.address().port;
  const post = (headers, body) => new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, method: 'POST', path: '/', headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.end(body);
  });
  const denied = await post({ 'content-type': 'application/json' }, JSON.stringify({ url: 'https://example.com/' }));
  assert.equal(denied.status, 401);
  const malformed = await post({ 'content-type': 'application/json', authorization: `Bearer ${token}` }, '{');
  assert.equal(malformed.status, 400);
  const local = await post({ 'content-type': 'application/json', authorization: `Bearer ${token}` }, JSON.stringify({ url: 'http://127.0.0.1/secret' }));
  assert.equal(local.status, 400);
  const ok = await post({ 'content-type': 'application/json', authorization: `Bearer ${token}` }, JSON.stringify({ url: 'https://example.com/listings', cookie: 'session-secret-value' }));
  assert.equal(ok.status, 200);
  const parsed = JSON.parse(ok.body);
  assert.match(parsed.html, /Example Listings/);
  assert.equal(parsed.finalUrl, 'https://example.com/listings');
  assert.equal(parsed.network.length, 1);
  assert.match(parsed.network[0].html, /listings/);
  useFail = true;
  const timed = await post({ 'content-type': 'application/json', authorization: `Bearer ${token}` }, JSON.stringify({ url: 'https://example.com/slow' }));
  assert.equal(timed.status, 504);
  useFail = false;
  const again = await post({ 'content-type': 'application/json', authorization: `Bearer ${token}` }, JSON.stringify({ url: 'https://example.com/listings' }));
  assert.equal(again.status, 200);
  assert.ok(closed >= 3);
});
