const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function importer(session, response) {
  const calls = [];
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session } }),
      signInAnonymously: () => { throw Error('Importer must not replace the account session'); },
    },
    functions: { invoke: async (name, args) => { calls.push({ name, ...args }); return response; } },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/listingSourceService.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(() => ({ supabase }), module, module.exports);
  return { ...module.exports, calls };
}

test('dashboard and code owners use their existing session for unrelated public source URLs', async () => {
  for (const user of [{ id: 'verified-owner' }, { id: 'code-owner', is_anonymous: true }]) {
    const api = importer({ user }, { data: { ok: true, imported: 1, items: [{ title: '12 Pine St', price: '$350,000' }] } });
    const result = await api.connectListingSource('https://third-party.example/property/12', 'selected-owner');
    assert.equal(result.imported, 1);
    assert.deepEqual(api.calls, [{ name: 'refresh-listings', body: { mode: 'connect', url: 'https://third-party.example/property/12', realtorId: 'selected-owner' } }]);
  }
});

test('an expired session cannot start an import or silently create a new account', async () => {
  const api = importer(null, { data: { ok: true } });
  await assert.rejects(api.connectListingSource('https://public.example/'), /session has expired/i);
  assert.equal(api.calls.length, 0);
});

test('extraction and account errors retain their actual HTTP status and specific feedback', async () => {
  for (const [status, message] of [[422, 'This website blocks automatic access.'], [403, 'This session does not own the selected realtor account.'], [401, 'Your session has expired.']]) {
    const api = importer({ user: { id: 'owner' } }, { data: null, error: { context: new Response(JSON.stringify({ error: message }), { status }) } });
    await assert.rejects(api.connectListingSource('https://public.example/'), error => error instanceof api.ListingImportError && error.status === status && error.message === message);
  }
});
