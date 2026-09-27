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
test('password reset emails a recovery link with redirect, not OTP create', async () => {
  let request;
  let cleared = false;
  const module = { exports: {} };
  const fs = require('node:fs');
  const path = require('node:path');
  const ts = require('typescript');
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'lib/passwordReset.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const client = {
    auth: {
      resetPasswordForEmail: async (email, opts) => { request = { email, opts }; return {}; },
      signInWithOtp: async () => { throw new Error('must use resetPasswordForEmail'); },
    },
  };
  new Function('require', 'module', 'exports', source)(
    (id) => {
      if (id === '@/lib/supabase') {
        return {
          supabase: client,
          clearAnonymousSessionForEmailAuth: async () => { cleared = true; },
        };
      }
      if (id === '@/lib/authRedirect') {
        return {
          signupEmailRedirect: (origin) => (origin ? `${origin}/auth/callback` : 'https://published/auth/callback/'),
          passwordResetRedirect: (origin) => (origin ? `${origin}/auth/callback` : 'https://published/auth/callback/'),
        };
      }
      throw new Error('unexpected ' + id);
    },
    module,
    module.exports
  );
  const { requestResetLink, requestResetCode } = module.exports;
  assert.equal((await requestResetLink(' Person@Example.com ')).ok, true);
  assert.equal(cleared, true);
  assert.equal(request.email, 'person@example.com');
  assert.match(request.opts.redirectTo, /auth\/callback/);
  assert.equal((await requestResetCode('person@example.com')).ok, true);
});
test('setNewPassword updates user when recovery session exists', async () => {
  let updated;
  const module = { exports: {} };
  const fs = require('node:fs');
  const path = require('node:path');
  const ts = require('typescript');
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'lib/passwordReset.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'x' } } }),
      updateUser: async (args) => { updated = args; return {}; },
    },
  };
  new Function('require', 'module', 'exports', source)(
    (id) => {
      if (id === '@/lib/supabase') return { supabase: client, clearAnonymousSessionForEmailAuth: async () => {} };
      if (id === '@/lib/authRedirect') return { signupEmailRedirect: () => 'https://x/auth/callback', passwordResetRedirect: () => 'https://x/auth/callback' };
      throw new Error('unexpected ' + id);
    },
    module,
    module.exports
  );
  const { setNewPassword } = module.exports;
  assert.equal((await setNewPassword('secret1')).ok, true);
  assert.deepEqual(updated, { password: 'secret1' });
  assert.equal((await setNewPassword('short')).ok, false);
});
test('setNewPassword fails safely without a recovery session', async () => {
  const module = { exports: {} };
  const fs = require('node:fs');
  const path = require('node:path');
  const ts = require('typescript');
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'lib/passwordReset.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      updateUser: async () => { throw new Error('must not update'); },
    },
  };
  new Function('require', 'module', 'exports', source)(
    (id) => {
      if (id === '@/lib/supabase') return { supabase: client, clearAnonymousSessionForEmailAuth: async () => {} };
      if (id === '@/lib/authRedirect') return { signupEmailRedirect: () => 'https://x/auth/callback', passwordResetRedirect: () => 'https://x/auth/callback' };
      throw new Error('unexpected ' + id);
    },
    module,
    module.exports
  );
  const { setNewPassword } = module.exports;
  const result = await setNewPassword('secret1');
  assert.equal(result.ok, false);
  assert.match(result.error, /link|expired|request/i);
});
test('auth callback helpers route recovery and invite to set-password', () => {
  const { classifyAuthCallbackType, needsSetPassword, readAuthCallbackType, isSignupConfirm } = load('lib/authCallback');
  assert.equal(classifyAuthCallbackType('recovery'), 'recovery');
  assert.equal(classifyAuthCallbackType('invite'), 'invite');
  assert.equal(classifyAuthCallbackType('signup'), 'signup');
  assert.equal(classifyAuthCallbackType('magiclink'), 'email');
  assert.equal(needsSetPassword('recovery'), true);
  assert.equal(needsSetPassword('invite'), true);
  assert.equal(needsSetPassword('signup'), false);
  assert.equal(isSignupConfirm('signup'), true);
  assert.equal(readAuthCallbackType({ get: n => n === 'type' ? 'Recovery' : null }, { get: () => null }), 'recovery');
  assert.equal(readAuthCallbackType({ get: () => null }, { get: n => n === 'type' ? 'invite' : null }), 'invite');
});
test('callback screen sends recovery to set-password before completeRealtorSignIn', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app/auth/callback.tsx'), 'utf8');
  assert.match(src, /needsSetPassword/);
  assert.match(src, /\/reset-password\?mode=set/);
  assert.match(src, /completeRealtorSignIn/);
  assert.match(src, /\/reset-password/);
});
test('reset-password screen is link-based with set mode', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app/reset-password.tsx'), 'utf8');
  assert.match(src, /requestResetLink/);
  assert.match(src, /setNewPassword/);
  assert.match(src, /mode === ['"]set['"]/);
  assert.match(src, /email you a link/);
  assert.doesNotMatch(src, /six-digit code/);
});
