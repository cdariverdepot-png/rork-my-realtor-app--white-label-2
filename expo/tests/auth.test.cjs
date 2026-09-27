const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(name, client) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', source)(id => {
    if (id === 'react-native') return { Platform: { OS: 'web' } };
    if (id === '@/lib/supabase') return { supabase: client, ensureSupabaseSession: async () => null, clearAnonymousSessionForEmailAuth: async () => {}, withEmailAuth: fn => fn() };
    if (id.startsWith('@/')) return load(id.slice(2), client);
    return require(id);
  }, module, module.exports);
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
      if (id === 'react-native') return { Platform: { OS: 'web' } };
      if (id === '@/lib/supabase') {
        return {
          supabase: client,
          clearAnonymousSessionForEmailAuth: async () => { cleared = true; },
          withEmailAuth: async fn => { cleared = true; return fn(); },
        };
      }
      if (id === '@/lib/authRedirect') {
        return {
          signupEmailRedirect: (origin) => (origin ? `${origin}/auth/callback` : 'https://published/auth/callback/'),
          passwordResetRedirect: (origin) => (origin ? `${origin}/auth/callback` : 'https://published/auth/callback/'),
          webOriginForRedirect: () => undefined,
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
      getSession: async () => ({ data: { session: { access_token: 'x', user: { is_anonymous: false } } } }),
      getUser: async () => ({ data: { user: { is_anonymous: false, email_confirmed_at: '2026-09-26' } } }),
      updateUser: async (args) => { updated = args; return {}; },
    },
  };
  new Function('require', 'module', 'exports', source)(
    (id) => {
      if (id === '@/lib/supabase') return { supabase: client, clearAnonymousSessionForEmailAuth: async () => {}, withEmailAuth: fn => fn() };
      if (id === '@/lib/authRedirect') return { signupEmailRedirect: () => 'https://x/auth/callback', passwordResetRedirect: () => 'https://x/auth/callback' , webOriginForRedirect: () => undefined };
      throw new Error('unexpected ' + id);
    },
    module,
    module.exports
  );
  const { setNewPassword, setNewPasswordWhileAuthenticated } = module.exports;
  assert.equal(typeof setNewPasswordWhileAuthenticated, 'function');
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
      if (id === '@/lib/supabase') return { supabase: client, clearAnonymousSessionForEmailAuth: async () => {}, withEmailAuth: fn => fn() };
      if (id === '@/lib/authRedirect') return { signupEmailRedirect: () => 'https://x/auth/callback', passwordResetRedirect: () => 'https://x/auth/callback' , webOriginForRedirect: () => undefined };
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
  assert.match(src, /setNewPasswordWhileAuthenticated/);
  assert.match(src, /mode === ['"]set['"]/);
  assert.match(src, /email you a link/);
  assert.doesNotMatch(src, /six-digit code/);
});

test('passwordResetRedirect mirrors signup localhost vs Pages rules', () => {
  const { passwordResetRedirect, signupEmailRedirect, PUBLISHED_AUTH_RETURN } = load('lib/authRedirect', {});
  assert.equal(passwordResetRedirect('http://localhost:8081'), signupEmailRedirect('http://localhost:8081'));
  assert.equal(passwordResetRedirect('http://127.0.0.1:4179'), 'http://127.0.0.1:4179/auth/callback');
  assert.equal(passwordResetRedirect(), PUBLISHED_AUTH_RETURN);
});

test('PKCE recovery uses SDK redirect type without relying on event timing', async () => {
  const client = { auth: {
    exchangeCodeForSession: async () => ({ data: { session: {}, redirectType: 'recovery' } }),
    getUser: async () => ({ data: { user: { email_confirmed_at: '2026-09-26' } } }),
  } };
  const { completeAuthCallback } = load('lib/completeAuthCallback', client);
  assert.equal(await completeAuthCallback({ code: 'single-use-code' }), 'recovery');
});

test('empty callback cannot reuse an unrelated logged-in session', async () => {
  const { completeAuthCallback } = load('lib/completeAuthCallback', { auth: {} });
  await assert.rejects(completeAuthCallback({}), /Missing/);
});

test('callback errors are rejected before exchanging credentials', async () => {
  const { completeAuthCallback } = load('lib/completeAuthCallback', { auth: {} });
  await assert.rejects(completeAuthCallback({ code: 'code', error: 'expired' }), /Invalid/);
});

test('guest session cannot finish an email callback', async () => {
  const client = { auth: {
    exchangeCodeForSession: async () => ({ data: { session: {} } }),
    getUser: async () => ({ data: { user: { is_anonymous: true } } }),
  } };
  const { completeAuthCallback } = load('lib/completeAuthCallback', client);
  await assert.rejects(completeAuthCallback({ code: 'code' }), /Verified/);
});

test('guest session cannot set an account password', async () => {
  const { setNewPassword } = load('lib/passwordReset', { auth: {
    getSession: async () => ({ data: { session: { user: { is_anonymous: true } } } }),
  } });
  assert.equal((await setNewPassword('not-a-real-password')).ok, false);
});

test('social callback preserves published subdirectory and rejects unknown deployments', () => {
  const { socialCallbackRedirect, PUBLISHED_AUTH_RETURN } = load('lib/authRedirect');
  assert.equal(socialCallbackRedirect('https://cdariverdepot-png.github.io'), PUBLISHED_AUTH_RETURN);
  assert.equal(socialCallbackRedirect('http://localhost:8081'), 'http://localhost:8081/auth/callback');
  assert.throws(() => socialCallbackRedirect('https://unconfigured.example'));
});
test('Google + Microsoft default on; Apple defaults on for iOS', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/socialSignIn.ts'), 'utf8');
  assert.match(src, /socialFlag\(["']EXPO_PUBLIC_GOOGLE_SIGN_IN["'],\s*true\)/);
  assert.match(src, /socialFlag\(["']EXPO_PUBLIC_MICROSOFT_SIGN_IN["'],\s*true\)/);
  assert.match(src, /socialFlag\(["']EXPO_PUBLIC_APPLE_SIGN_IN["'],\s*Platform\.OS === ["']ios["']\)/);
});

test('signing up an existing email says so instead of waiting for an email that never comes', async () => {
  const auth = load('lib/realtorAuth', { auth: { signUp: async () => ({ data: { user: { identities: [] }, session: null } }) } });
  const result = await auth.signUpRealtorWithAuth({ name: 'A B', email: 'a@b.co', password: 'secret1' });
  assert.equal(result.ok, false);
  assert.notEqual(result.verificationRequired, true);
  assert.match(result.error, /already exists/);
});
test('new signup still asks for email confirmation', async () => {
  const auth = load('lib/realtorAuth', { auth: { signUp: async () => ({ data: { user: { identities: [{}] }, session: null } }) } });
  const result = await auth.signUpRealtorWithAuth({ name: 'A B', email: 'a@b.co', password: 'secret1' });
  assert.equal(result.verificationRequired, true);
});
test('email delivery failures get a clear message', () => {
  const { authErrorMessage } = load('lib/authErrors');
  assert.match(authErrorMessage({ message: 'Error sending confirmation email' }), /couldn't send the email/);
  assert.match(authErrorMessage({ code: 'email_address_not_authorized' }), /couldn't send email/);
});
test('link opened in another browser is reported as other-device, not a broken account', async () => {
  const client = { auth: { exchangeCodeForSession: async () => ({ data: { session: null }, error: { name: 'AuthPKCECodeVerifierMissingError', message: 'PKCE code verifier not found in storage.' } }) } };
  const { completeAuthCallback } = load('lib/completeAuthCallback', client);
  await assert.rejects(completeAuthCallback({ code: 'c' }), e => e.reason === 'other-device');
});
test('token_hash links verify on any device', async () => {
  let args;
  const client = { auth: {
    verifyOtp: async a => { args = a; return { data: { session: {} } }; },
    getUser: async () => ({ data: { user: { email_confirmed_at: '2026-09-27' } } }),
  } };
  const { completeAuthCallback } = load('lib/completeAuthCallback', client);
  assert.equal(await completeAuthCallback({ tokenHash: 'th', type: 'recovery' }), 'recovery');
  assert.deepEqual(args, { token_hash: 'th', type: 'recovery' });
});
test('social flags are read statically so the bundler can inline them', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/socialSignIn.ts'), 'utf8');
  assert.doesNotMatch(src, /process\.env\[/);
  assert.match(src, /process\.env\.EXPO_PUBLIC_GOOGLE_SIGN_IN/);
});
test('social buttons sit above the email-code fallback on the portal', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/portal.tsx'), 'utf8');
  assert.ok(src.indexOf('<SocialSignIn />') < src.indexOf('<EmailCodeSignIn'));
});
test('deep links other than invite codes are passed through, not sent home', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/+native-intent.tsx'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText)(mod, mod.exports);
  assert.equal(mod.exports.redirectSystemPath({ path: 'rork-app://auth/callback?code=x', initial: true }), 'rork-app://auth/callback?code=x');
  assert.match(mod.exports.redirectSystemPath({ path: 'rork-app://code/ABC123', initial: true }), /invite=ABC123/);
});
test('app restart checks the stored session (offline-safe), not a network getUser', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'contexts/AuthContext.tsx'), 'utf8');
  assert.match(src, /auth\.getSession\(\)\)\.data\.session\?\.user/);
});
test('realtor record uses the signup name, never one derived from the email', async () => {
  let args;
  const auth = load('lib/realtorAuth', { auth: { getUser: async () => ({ data: { user: { email: 'littlelightsdigital@gmail.com', email_confirmed_at: '2026-09-27', user_metadata: { realtor_name: ' Jerrod ' } } } }) }, rpc: async (_fn, a) => { args = a; return { data: 'id-1' }; } });
  assert.equal((await auth.ensureRealtorAuthRecord()).ok, true);
  assert.deepEqual(args, { p_name: 'Jerrod' });
});
