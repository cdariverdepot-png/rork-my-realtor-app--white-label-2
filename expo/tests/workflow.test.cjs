const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(name, mocks = {}) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', name + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(id => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('@/')) return load(id.slice(2), mocks);
    return require(id);
  }, mod, mod.exports);
  return mod.exports;
}

test('client registration rejects duplicate and failed server writes', async () => {
  const input = { realtorId: 'agent', email: 'client@example.com', pwHash: 'hash', clientId: 'client', name: 'Client' };
  for (const [reply, expected] of [
    [{ data: { ok: true, created: true } }, { ok: true }],
    [{ data: { ok: true, created: false } }, { ok: false, reason: 'existing' }],
    [{ data: { ok: false, reason: 'no_seat' } }, { ok: false, reason: 'unavailable' }],
    [{ error: { message: 'offline' } }, { ok: false, reason: 'unavailable' }],
  ]) {
    const api = load('lib/clientAccounts', { '@/lib/supabase': { ensureSupabaseSession:async()=>null, supabase: { rpc: async () => reply } } });
    assert.deepEqual(await api.registerClientAccount(input), expected);
  }
});

test('account lookup preserves unavailable, not-found and password errors', async () => {
  for (const [reply, status] of [
    [{ error: { message: 'offline' } }, 'unavailable'],
    [{ data: { ok: false, reason: 'not_found' } }, 'not_found'],
    [{ data: { ok: false, reason: 'bad_password' } }, 'bad_password'],
    [{ data: { ok: false, reason: 'locked' } }, 'locked'],
  ]) {
    const api = load('lib/clientAccounts', { '@/lib/supabase': { ensureSupabaseSession:async()=>null, supabase: { rpc: async () => reply } } });
    assert.equal((await api.verifyClientAccount('agent', 'a@example.com', 'hash')).status, status);
  }
});

test('registration does not finish while the server write is pending', async () => {
  let resolve, complete = false;
  const api = load('lib/clientAccounts', { '@/lib/supabase': { ensureSupabaseSession:async()=>null, supabase: { rpc: () => new Promise(r => { resolve = r; }) } } });
  const result = api.registerClientAccount({}).then(value => { complete = true; return value; });
  await Promise.resolve();
  assert.equal(complete, false);
  resolve({ data: { ok: true, created: true } });
  assert.deepEqual(await result, { ok: true });
});

test('repeat booking lead returns the existing roster ID after a strict save', async () => {
  let saved;
  const api = load('lib/clientRoster', {
    '@react-native-async-storage/async-storage': { setItem: async () => {}, getItem: async () => null },
    '@/lib/kvStore': { isKvEnabled: () => true,
      kvGet: async () => ({ value: [{ id: 'original', email: 'a@example.com', name: 'Old', createdAt: 1 }] }),
      kvSet: async (key, value, rev, strict) => { assert.equal(strict, true); saved = value; } },
  });
  const id = await api.appendClientToRoster('agent', { id: 'new', email: 'A@example.com', name: 'Updated', createdAt: 2 }, true);
  assert.equal(id, 'original');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'Updated');
  assert.equal(saved[0].createdAt, 1);
});

test('public contact capture rejects failed reads and writes instead of continuing', async () => {
  for (const failAt of ['read', 'write']) {
    let writes = 0;
    const api = load('lib/clientRoster', {
      '@react-native-async-storage/async-storage': { setItem: async () => {}, getItem: async () => null },
      '@/lib/kvStore': { isKvEnabled: () => true,
        kvGet: async () => { if (failAt === 'read') throw Error('offline'); return null; },
        kvSet: async () => { writes++; throw Error('offline'); } },
    });
    await assert.rejects(api.appendClientToRoster('agent', { id: 'new', email: '', name: 'Name', createdAt: 1 }, true));
    assert.equal(writes, failAt === 'read' ? 0 : 1);
  }
});

test('booking retries use the same write-only request ID without reading private collections', async () => {
 const calls=[]; const api=load('lib/leadBooking',{'@/lib/supabase':{ensureSupabaseSession:async()=>null,supabase:{rpc:async(name,args)=>{calls.push({name,args});return {error:null};}}}});
 const appointment={id:'request',listingId:'home',startsAt:123,durationMin:45,recipientIds:['forged']};
 await api.appendLeadAppointment('11111111-1111-1111-1111-111111111111',appointment);
 await api.appendLeadAppointment('11111111-1111-1111-1111-111111111111',appointment);
 assert.equal(calls.length,2); assert.equal(calls[0].name,'request_public_showing');assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].args.recipientIds,undefined);
});
test('failed booking authentication never sends a request', async()=>{
 let writes=0;const api=load('lib/leadBooking',{'@/lib/supabase':{ensureSupabaseSession:async()=>{throw Error('offline')},supabase:{rpc:async()=>{writes++}}}});
 await assert.rejects(api.appendLeadAppointment('11111111-1111-1111-1111-111111111111',{id:'request'}));assert.equal(writes,0);
});

test('phone is required for call/text preferences but not email or in-app messages', () => {
  const api = load('constants/clientProfile');
  const base = { fullName: 'Client Name', preferredName: 'Client', goal: 'browse', timeline: 'unsure' };
  for (const contactMethod of ['email', 'app']) assert.equal(api.essentialsMet({ ...base, contactMethod }), true);
  for (const contactMethod of ['text', 'call']) {
    assert.equal(api.essentialsMet({ ...base, contactMethod }), false);
    assert.equal(api.essentialsMet({ ...base, contactMethod, phone: '555-0100' }), true);
  }
});
