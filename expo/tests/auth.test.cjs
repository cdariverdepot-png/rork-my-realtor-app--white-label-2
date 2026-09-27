const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(name, client) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', source)(id => id === '@/lib/supabase' ? { supabase: client, ensureSupabaseSession: async () => null, clearAnonymousSessionForEmailAuth: async () => {} } : load(id.replace('@/', ''), client), module, module.exports);
  return module.exports;
}
test('email sign-in never silently creates another account', async () => {
  let request;
  const auth = load('lib/emailSignIn', { auth: { signInWithOtp: async args => { request = args; return {}; } } });
  assert.equal((await auth.sendAccountCode(' Person@Example.com ')).ok, true);
  assert.equal(request.email, 'person@example.com');
  assert.equal(request.options.shouldCreateUser, false);
  assert.match(request.options.emailRedirectTo, /^https:\/\//);
});
test('confirmation resend uses signup resend, not account creation', async () => {
  let request;
  const auth = load('lib/emailSignIn', { auth: { resend: async args => { request = args; return {}; } } });
  assert.equal((await auth.sendAccountCode('person@example.com', true)).ok, true);
  assert.equal(request.type, 'signup');
});
test('invalid addresses and codes never contact authentication service', async () => {
  const auth = load('lib/emailSignIn', { auth: {} });
  assert.equal((await auth.sendAccountCode('bad')).ok, false);
  assert.equal((await auth.verifyAccountCode('person@example.com', 'abc123')).ok, false);
});
test('email code verifies exact code with normalized email', async () => {
  let request;
  const auth = load('lib/emailSignIn', { auth: { verifyOtp: async args => { request = args; return {}; } } });
  assert.equal((await auth.verifyAccountCode(' Person@Example.com ', '123456')).ok, true);
  assert.deepEqual(request, { email: 'person@example.com', token: '123456', type: 'email' });
});
test('signup confirmation verifies with signup otp type first', async () => {
  const calls = [];
  const auth = load('lib/emailSignIn', { auth: { verifyOtp: async args => { calls.push(args); return args.type === 'signup' ? {} : { error: { message: 'bad' } }; } } });
  assert.equal((await auth.verifyAccountCode('person@example.com', '123456', true)).ok, true);
  assert.equal(calls[0].type, 'signup');
});
test('delivery errors and exceptions do not expose internal messages', async () => {
  const auth = load('lib/emailSignIn', { auth: { signInWithOtp: async () => { throw new Error('database secret'); } } });
  const result = await auth.sendAccountCode('person@example.com');
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.error, /database|secret/);
});
test('unconfirmed accounts cannot create or claim realtor rows', async () => {
  const auth = load('lib/realtorAuth', { auth: { getUser: async () => ({ data: { user: { email_confirmed_at: null } } }) }, rpc: () => { throw new Error('must not call'); } });
  assert.equal((await auth.ensureRealtorAuthRecord()).verificationRequired, true);
});
test('missing database function yields safe actionable error', async () => {
  const auth = load('lib/realtorAuth', { auth: { getUser: async () => ({ data: { user: { email_confirmed_at: '2026-01-01' } } }) }, rpc: async () => ({ error: { code: 'PGRST202', message: 'schema cache public.secret' } }) });
  const result = await auth.ensureRealtorAuthRecord();
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.error, /schema|public|secret/);
});
test('sign-in network exception returns controlled failure', async () => {
  const auth = load('lib/realtorAuth', { auth: { signInWithPassword: async () => { throw new Error('internal'); } } });
  assert.equal((await auth.signInRealtorWithAuth('person@example.com', 'password')).ok, false);
});
