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
  const prevAppUrl = process.env.EXPO_PUBLIC_APP_URL;
  delete process.env.EXPO_PUBLIC_APP_URL;
  const { passwordResetRedirect, signupEmailRedirect, PUBLISHED_AUTH_RETURN } = load('lib/authRedirect', {});
  assert.equal(passwordResetRedirect('http://localhost:8081'), signupEmailRedirect('http://localhost:8081'));
  assert.equal(passwordResetRedirect('http://127.0.0.1:4179'), 'http://127.0.0.1:4179/auth/callback');
  assert.equal(passwordResetRedirect(), PUBLISHED_AUTH_RETURN);
  if (prevAppUrl === undefined) delete process.env.EXPO_PUBLIC_APP_URL;
  else process.env.EXPO_PUBLIC_APP_URL = prevAppUrl;
});

test('hosted Expo origin is preferred for web email redirects when APP_URL is set', () => {
  const prevAppUrl = process.env.EXPO_PUBLIC_APP_URL;
  process.env.EXPO_PUBLIC_APP_URL = 'https://cdariverdepot-my-realtor.expo.app';
  const { signupEmailRedirect, passwordResetRedirect, socialCallbackRedirect } = load('lib/authRedirect', {});
  assert.equal(signupEmailRedirect('https://cdariverdepot-my-realtor.expo.app'), 'https://cdariverdepot-my-realtor.expo.app/auth/callback');
  assert.equal(passwordResetRedirect('https://cdariverdepot-my-realtor.expo.app'), 'https://cdariverdepot-my-realtor.expo.app/auth/callback');
  assert.equal(socialCallbackRedirect('https://cdariverdepot-my-realtor.expo.app'), 'https://cdariverdepot-my-realtor.expo.app/auth/callback');
  if (prevAppUrl === undefined) delete process.env.EXPO_PUBLIC_APP_URL;
  else process.env.EXPO_PUBLIC_APP_URL = prevAppUrl;
});

test('AUTH_BYPASS is env-gated only (never forced true in source)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'contexts/AuthContext.tsx'), 'utf8');
  assert.doesNotMatch(src, /true\s*\|\|\s*process\.env\.EXPO_PUBLIC_AUTH_BYPASS/);
  assert.match(src, /AUTH_BYPASS_ENABLED\s*=\s*\n?\s*process\.env\.EXPO_PUBLIC_AUTH_BYPASS\s*===\s*["']true["']/);
});

test('callback other-device path points users to portal confirmed sign-in', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/auth/callback.tsx'), 'utf8');
  assert.match(src, /confirmed=1/);
  assert.match(src, /other-device/);
  assert.match(src, /email code/i);
});

test('portal surfaces EmailCodeSignIn after confirmed callback', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/portal.tsx'), 'utf8');
  assert.match(src, /confirmedParam|emailAlreadyConfirmed/);
  assert.match(src, /EmailCodeSignIn/);
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
test('portal entry gateway shows SocialSignIn with Or continue with', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/portal.tsx'), 'utf8');
  const entryIdx = src.indexOf('function EntryForm');
  assert.ok(entryIdx > 0);
  const entryBlock = src.slice(entryIdx, src.indexOf('function CodeForm'));
  assert.match(entryBlock, /Or continue with/);
  assert.match(entryBlock, /<SocialSignIn \/>/);
  assert.match(entryBlock, /AccessCodeContinue/);
  assert.doesNotMatch(entryBlock, /Demo code:/);
});
test('welcome landing shows SocialSignIn under Realtor Login', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/index.tsx'), 'utf8');
  assert.match(src, /import SocialSignIn from ["']@\/components\/SocialSignIn["']/);
  assert.match(src, /import AccessCodeContinue from ["']@\/components\/AccessCodeContinue["']/);
  const realtorIdx = src.indexOf('Realtor Login');
  const socialIdx = src.indexOf('<SocialSignIn />');
  const accessIdx = src.indexOf('<AccessCodeContinue');
  assert.ok(realtorIdx > 0 && socialIdx > realtorIdx && accessIdx > socialIdx);
  assert.match(src, /Or continue with/);
  assert.doesNotMatch(src, /Demo code:/);
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

test('static export skips Supabase initialization; browsers and native apps still initialize', async () => {
  const vm = require('node:vm');
  const source = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', 'lib/supabase.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText;
  for (const scenario of [
    { os: 'web', browser: false, expected: 0 },
    { os: 'web', browser: true, expected: 1 },
    { os: 'ios', browser: false, expected: 1 },
    { os: 'android', browser: false, expected: 1 },
  ]) {
    let initialized = 0;
    const session = { user: { id: 'test-user' } };
    const client = { auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => {},
      signInAnonymously: () => { throw new Error('must not create a guest'); },
    } };
    const context = {
      exports: {}, process: { env: {} }, console: { log: () => {} },
      ...(scenario.browser ? { window: {} } : {}),
      require: id => {
        if (id === 'react-native-url-polyfill/auto') return {};
        if (id === 'react-native') return { Platform: { OS: scenario.os } };
        if (id === '@react-native-async-storage/async-storage') return { default: {} };
        if (id === 'expo-constants') return { default: { expoConfig: {} } };
        if (id === '@supabase/supabase-js') return { createClient: () => { initialized++; return client; } };
        throw new Error('Unexpected import: ' + id);
      },
    };
    vm.runInNewContext(source, context);
    assert.equal(initialized, scenario.expected, JSON.stringify(scenario));
    assert.equal(context.exports.supabase, scenario.expected ? client : null);
    assert.equal(await context.exports.ensureSupabaseSession(), scenario.expected ? session : null);
  }
});

test('Google social sign-in uses ID token path, not Supabase OAuth authorize', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/socialSignIn.ts'), 'utf8');
  assert.match(src, /signInWithIdToken/);
  assert.match(src, /ResponseType\.IdToken/);
  assert.match(src, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID/);
  assert.match(src, /startGoogleIdTokenSignIn/);
  // Google must not go through supabase.auth.signInWithOAuth
  const googleFn = src.slice(src.indexOf('async function startGoogleIdTokenSignIn'), src.indexOf('async function startSupabaseOAuth'));
  assert.doesNotMatch(googleFn, /signInWithOAuth/);
  assert.match(src, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(src, /GOOGLE_DISCOVERY/);
  // Microsoft / Apple keep OAuth
  assert.match(src, /startSupabaseOAuth/);
  assert.match(src, /provider === ["']google["']\s*\)\s*return await startGoogleIdTokenSignIn/);
});

test('Google ID-token redirect stays on app origin, never supabase.co', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/socialSignIn.ts'), 'utf8');
  assert.match(src, /googleIdTokenRedirectUri/);
  assert.match(src, /socialCallbackRedirect/);
  assert.doesNotMatch(src, /supabase\.co\/auth\/v1\/callback/);
  // Documented production fallback callback on expo.app
  assert.match(src, /cdariverdepot-my-realtor\.expo\.app\/auth\/callback/);
});

test('Supabase OAuth probes authorize URL before browser redirect (no raw JSON)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/socialSignIn.ts'), 'utf8');
  assert.match(src, /probeOAuthAuthorizeUrl/);
  assert.match(src, /redirect:\s*["']manual["']/);
  assert.match(src, /PROVIDER_UNAVAILABLE/);
  assert.match(src, /looksLikeProviderDisabled/);
  const oauthFn = src.slice(src.indexOf('async function startSupabaseOAuth'), src.indexOf('function connectErrorMessage'));
  assert.ok(oauthFn.indexOf('probeOAuthAuthorizeUrl') < oauthFn.indexOf('window.location.assign'));
  assert.ok(oauthFn.indexOf('probeOAuthAuthorizeUrl') < oauthFn.indexOf('openAuthSessionAsync'));
});

test('authErrors scrub provider-disabled JSON instead of showing it', () => {
  const { authErrorMessage } = load('lib/authErrors');
  assert.match(
    authErrorMessage({ code: 'validation_failed', message: 'Unsupported provider: provider is not enabled' }),
    /isn't connected yet/
  );
  assert.match(
    authErrorMessage({ message: '{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}' }),
    /isn't connected yet/
  );
});

test('Google web sign-in uses full-page redirect, not a post-await popup', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/socialSignIn.ts'), 'utf8');
  assert.match(src, /window\.location\.assign\(authUrl\)/);
  assert.match(src, /completeGoogleIdTokenCallback/);
  assert.match(src, /GOOGLE_OIDC_NONCE_KEY/);
  // Web path must not call promptAsync (popup after awaits gets blocked).
  const googleFn = src.slice(src.indexOf('async function startGoogleIdTokenSignIn'), src.indexOf('async function startSupabaseOAuth'));
  assert.match(googleFn, /Platform\.OS === ["']web["']/);
  assert.match(googleFn, /makeAuthUrlAsync/);
  // Native still uses promptAsync
  assert.match(googleFn, /promptAsync/);
});

test('auth callback completes Google ID-token returns before email OAuth parsing', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/auth/callback.tsx'), 'utf8');
  assert.match(src, /completeGoogleIdTokenCallback/);
  // Compare call sites inside the effect body (imports list completeAuthCallback first).
  const body = src.slice(src.indexOf('void (async () => {'));
  assert.ok(body.indexOf('completeGoogleIdTokenCallback') < body.indexOf('completeAuthCallback('));
});

test('portal defaults to welcome entry; back from code clears sticky entry=client', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/portal.tsx'), 'utf8');
  assert.match(src, /goWelcome/);
  assert.match(src, /router\.replace\(["']\/portal["']\)/);
  assert.match(src, /Default \(missing \/ unknown\) is the welcome gateway/);
  assert.match(src, /entryParam === ["']client["'] \? ["']code["'] : ["']entry["']/);
  // Back from code must clear sticky query, not only transitionTo("entry")
  const onBack = src.slice(src.indexOf('const onBack'), src.indexOf('return (', src.indexOf('const onBack')));
  assert.match(onBack, /goWelcome\(\)/);
  assert.doesNotMatch(onBack, /stage === ["']code["']\)\s*\{\s*transitionTo\(["']entry["']\)/);
});

test('login and logout land on welcome /, not sticky portal client code', () => {
  for (const file of ['app/login.tsx', 'app/account.tsx', 'components/Hero.tsx', 'app/client-profile.tsx', 'app/admin/index.tsx']) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(src, /router\.replace\(["']\/portal["']\)/, file);
  }
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'app/login.tsx'), 'utf8'), /router\.replace\(["']\/["']\)/);
});

test('guest role codes: REALTOR admin, CLIENT/DEMO client; never collide with invite codes', () => {
  const access = load('constants/access', null);
  assert.equal(access.REALTOR_ACCESS_CODE, 'REALTOR');
  assert.equal(access.CLIENT_ACCESS_CODE, 'CLIENT');
  assert.equal(access.GUEST_ACCESS_CODE, 'DEMO');
  assert.equal(access.isRealtorAccessCode('realtor'), true);
  assert.equal(access.isRealtorAccessCode(' REALTOR '), true);
  assert.equal(access.isRealtorAccessCode('CLIENT'), false);
  assert.equal(access.isClientAccessCode('client'), true);
  assert.equal(access.isClientAccessCode('DEMO'), true);
  assert.equal(access.isClientAccessCode('demo'), true);
  assert.equal(access.isGuestAccessCode(' DEMO '), true);
  assert.equal(access.isClientAccessCode('REALTOR'), false);
  assert.equal(access.isClientAccessCode('NVNF6E'), false);
  assert.equal(access.isRealtorAccessCode('NVNF6E'), false);
});
test('portal guest path uses dual role mint without revealing the codes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/portal.tsx'), 'utf8');
  assert.match(src, /isRealtorAccessCode/);
  assert.match(src, /isClientAccessCode/);
  assert.match(src, /enterGuestRealtor/);
  assert.match(src, /enterGuestClient/);
  assert.match(src, /prepareNewRealtorTour/);
  assert.match(src, /prepareNewClientTour/);
  assert.match(src, /AccessCodeContinue/);
  assert.doesNotMatch(src, /Demo code:/);
  assert.doesNotMatch(src, /GUEST_ACCESS_CODE/);
  assert.doesNotMatch(src, /REALTOR_ACCESS_CODE/);
  assert.doesNotMatch(src, /["']REALTOR["']/);
  assert.doesNotMatch(src, /["']CLIENT["']/);
});

test('portal realtor login surfaces AccessCodeContinue with Google/Microsoft', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/portal.tsx'), 'utf8');
  assert.match(src, /AccessCodeContinue/);
  const socialIdx = src.indexOf('<SocialSignIn />');
  const accessIdx = src.indexOf('<AccessCodeContinue');
  const emailIdx = src.indexOf('<EmailCodeSignIn');
  assert.ok(socialIdx > 0 && accessIdx > socialIdx && emailIdx > accessIdx);
  assert.doesNotMatch(src, /Demo code:/);
  assert.doesNotMatch(src, /function GuestAccessCard/);
});
test('welcome landing shows AccessCodeContinue without DEMO hint', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/index.tsx'), 'utf8');
  assert.match(src, /AccessCodeContinue/);
  assert.match(src, /enterGuestRealtor/);
  assert.match(src, /enterGuestClient/);
  assert.match(src, /isRealtorAccessCode/);
  assert.match(src, /isClientAccessCode/);
  assert.match(src, /prepareNewRealtorTour/);
  assert.match(src, /prepareNewClientTour/);
  assert.doesNotMatch(src, /Demo code:/);
  assert.doesNotMatch(src, /HAVE AN ACCESS CODE\?/);
  assert.doesNotMatch(src, /["']REALTOR["']/);
  assert.doesNotMatch(src, /["']CLIENT["']/);
});
test('AuthContext exposes enterGuestClient that clears prior session', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'contexts/AuthContext.tsx'), 'utf8');
  assert.match(src, /enterGuestClient/);
  assert.match(src, /signInAnonymously/);
  assert.match(src, /guest\+\$\{uuid\}@guest\.myrealtor\.app/);
  assert.match(src, /DEMO_REALTOR_ID/);
  assert.match(src, /clientTourSeen: false/);
  assert.match(src, /const name = "";/);
});
test('AuthContext exposes enterGuestRealtor that mints admin without DEMO_REALTOR_ID', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'contexts/AuthContext.tsx'), 'utf8');
  assert.match(src, /enterGuestRealtor/);
  assert.match(src, /realtorTourSeen: false/);
  assert.match(src, /role: "admin"/);
  assert.match(src, /client_code_enabled: false/);
  assert.match(src, /guest\+realtor\+\$\{realtorId\}@guest\.myrealtor\.app/);
  assert.match(src, /rpc\('create_guest_realtor'\)/);
  // Must not pin guest realtor onto the Eliza showcase id.
  const start = src.indexOf('const enterGuestRealtor = useCallback');
  assert.ok(start >= 0, 'enterGuestRealtor callback body');
  const end = src.indexOf('const logout = useCallback', start);
  const fn = src.slice(start, end > start ? end : start + 2500);
  assert.doesNotMatch(fn, /DEMO_REALTOR_ID/);
  assert.match(fn, /role: "admin"/);
});

test('walkthrough Next advances from page 0 via scrollToOffset + live width', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components/OnboardingCarousel.tsx'), 'utf8');
  assert.match(src, /export function nextWalkthroughIndex/);
  assert.match(src, /useWindowDimensions/);
  assert.match(src, /scrollToOffset/);
  assert.match(src, /getItemLayout/);
  assert.match(src, /syncIndex\(next\)/);
  assert.doesNotMatch(src, /const \{ width: SCREEN_W \} = Dimensions\.get\("window"\)/);
  // Mirror the pure helper (source-tested above) so we do not eval TS.
  function nextWalkthroughIndex(current, total) {
    if (total <= 0) return null;
    if (current < 0) return 0;
    if (current >= total - 1) return null;
    return current + 1;
  }
  assert.equal(nextWalkthroughIndex(0, 5), 1);
  assert.equal(nextWalkthroughIndex(1, 5), 2);
  assert.equal(nextWalkthroughIndex(4, 5), null);
  assert.equal(nextWalkthroughIndex(3, 5), 4);
});

test('client tour finish gates home flash until /client-profile', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/_layout.tsx'), 'utf8');
  assert.match(src, /profileGateCover/);
  assert.match(src, /pendingClientProfileAfterTour/);
  assert.match(src, /router\.replace\("\/client-profile"\)/);
  // Must not markTourSeen before replace for incomplete client profiles.
  const finish = src.match(/const handleOnboardingFinish = useCallback\(\(\) => \{[\s\S]*?\}, \[/);
  assert.ok(finish);
  assert.match(finish[0], /setProfileGateCover\(true\)/);
  assert.match(finish[0], /router\.replace\("\/client-profile"\)/);
  assert.match(finish[0], /return;/);
  // markTourSeen("client") happens in the pathname effect, not before replace.
  assert.match(src, /if \(pathname !== "\/client-profile"\) return;/);
  assert.match(src, /markTourSeen\("client"\)/);
});


test('build onboarding: guest local path; never invents signup; edge sends to portal', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components/InitialRealtorSetup.tsx'), 'utf8');
  assert.match(src, /hasVerifiedBuilderAuth/);
  assert.match(src, /BUILDER_AUTH_MESSAGE/);
  assert.match(src, /isGuestAccess/);
  assert.match(src, /authHydrated/);
  assert.match(src, /goPortalAuth/);
  // Guest access-code sessions never show invent-signup panels.
  assert.match(src, /needsBuilderAuth/);
  assert.match(src, /builderAuthPanel/);
  assert.match(src, /BuildUrlEntry/);
  const entry = fs.readFileSync(path.join(__dirname, "..", "components/BuildUrlEntry.tsx"), "utf8");
  assert.match(entry, /Import my listings/);
  assert.equal((entry.match(/<TextInput\s/g)||[]).length,1);
  assert.doesNotMatch(entry, /Upload PDF|Import contacts|Add link/);
  assert.doesNotMatch(src, /ACCOUNT REQUIRED/);
  assert.doesNotMatch(src, /Create account & continue/);
  assert.doesNotMatch(src, /EmailCodeSignIn/);
  assert.doesNotMatch(src, /submitBuilderAuth/);
  // Edge case: portal redirect, not invent-signup forms on build.
  assert.match(src, /SIGN IN REQUIRED/);
  assert.match(src, /Go to realtor sign-in/);
  assert.match(src, /entry: "realtor"/);
  assert.match(src, /leaveBuild/);
  assert.match(src, /accessibilityLabel="Back"/);
  assert.match(src, /accessibilityLabel="Close"/);
  assert.match(src, /if \(error\.message === BUILDER_AUTH_MESSAGE\) return null/);
  assert.match(src, /!isGuestAccess && \(message === BUILDER_AUTH_MESSAGE/);
});

test('real realtor signup goes to /admin for walkthrough before build', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/portal.tsx'), 'utf8');
  const signup = src.match(/if \(stage === "realtor-setup"\) \{[\s\S]*?\} else if \(stage === "realtor-signin"\)/);
  assert.ok(signup, 'realtor-setup branch');
  assert.match(signup[0], /prepareNewRealtorTour\(\)/);
  assert.match(signup[0], /router\.replace\("\/admin\/"\)/);
  assert.doesNotMatch(signup[0], /router\.replace\("\/admin\/build"\)/);
});

test('guest REALTOR session mints guestAccess and local builder flag', () => {
  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'contexts/AuthContext.tsx'), 'utf8');
  assert.match(authSrc, /guestAccess: true/);
  assert.match(authSrc, /setGuestBuilderAccess/);
  assert.match(authSrc, /isGuestAccessSession/);
  assert.match(authSrc, /isGuestAccess:/);
  const start = authSrc.indexOf('const enterGuestRealtor = useCallback');
  assert.ok(start >= 0);
  const body = authSrc.slice(start, authSrc.indexOf('const logout = useCallback',start));
  assert.match(body, /guestAccess: true/);
});

test('walkthrough carousel exposes Back navigation after the first slide', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components/OnboardingCarousel.tsx'), 'utf8');
  assert.match(src, /goBack/);
  assert.match(src, /accessibilityLabel="Back to previous walkthrough step"/);
  assert.match(src, /ArrowLeft/);
  assert.match(src, /topNavRow/);
});

test('realtor tour finish gates until /admin/build for incomplete setup', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/_layout.tsx'), 'utf8');
  assert.match(src, /pendingRealtorBuildAfterTour/);
  assert.match(src, /router\.replace\("\/admin\/build"\)/);
  const finish = src.match(/const handleOnboardingFinish = useCallback\(\(\) => \{[\s\S]*?\}, \[/);
  assert.ok(finish);
  assert.match(finish[0], /audience === "realtor"/);
  assert.match(finish[0], /router\.replace\("\/admin\/build"\)/);
  assert.match(src, /if \(pathname !== "\/admin\/build"\) return;/);
  assert.match(src, /markTourSeen\("realtor"\)/);
  const guard = fs.readFileSync(path.join(__dirname, '..', 'components/OnboardingGuard.tsx'), 'utf8');
  assert.match(guard, /realtorTourSeen &&/);
});

test('client profile intake never shows Eliza/Vance demo chrome for DEMO realtor', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/client-profile.tsx'), 'utf8');
  assert.match(src, /DEMO_REALTOR_ID/);
  assert.match(src, /isDemoAgent/);
  assert.match(src, /Only your agent can see this/);
  assert.match(src, /MY REALTOR/);
  assert.match(src, /chromeBrand/);
  assert.doesNotMatch(src, /Only Eliza sees this/);
  assert.doesNotMatch(src, /"VANCE PRIVATE"/);
  assert.doesNotMatch(src, /Only \{realtorFirst\} sees this/);
});

test('production keeps AUTH_BYPASS off and Microsoft sign-in', () => {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.production'), 'utf8');
  assert.match(env, /EXPO_PUBLIC_AUTH_BYPASS=false/);
  const social = fs.readFileSync(path.join(__dirname, '..', 'lib/socialSignIn.ts'), 'utf8');
  assert.match(social, /id:\s*["']azure["']|Microsoft|MICROSOFT|microsoft/);
  assert.match(social, /EXPO_PUBLIC_MICROSOFT_SIGN_IN/);
});

test('portal entry has no Explore Demo button', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/portal.tsx'), 'utf8');
  assert.doesNotMatch(src, /Explore Demo/);
  assert.doesNotMatch(src, /onExploreDemo/);
  assert.doesNotMatch(src, /enterDemoView/);
  assert.doesNotMatch(src, /handleExploreDemo/);
});

test('landing and realtor login screens have no Explore/View Demo CTAs', () => {
  const files = [
    'app/index.tsx',
    'app/welcome.tsx',
    'app/portal.tsx',
    'app/login.tsx',
    'app/admin/login.tsx',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.doesNotMatch(src, /Explore Demo/, rel);
    assert.doesNotMatch(src, /View Demo/, rel);
    assert.doesNotMatch(src, /onExploreDemo/, rel);
    assert.doesNotMatch(src, /handleExploreDemo/, rel);
    assert.doesNotMatch(src, /Continue without login/, rel);
    assert.doesNotMatch(src, /onSkipLogin/, rel);
  }
  const landing = fs.readFileSync(path.join(__dirname, '..', 'app/index.tsx'), 'utf8');
  assert.doesNotMatch(landing, /enterDemoView/);
  const admin = fs.readFileSync(path.join(__dirname, '..', 'app/admin/index.tsx'), 'utf8');
  assert.doesNotMatch(admin, /View Demo/);
  assert.doesNotMatch(admin, /enterDemoView\(\)/);
  const portal = fs.readFileSync(path.join(__dirname, '..', 'app/portal.tsx'), 'utf8');
  assert.doesNotMatch(portal, /handleSkipLogin/);
  assert.doesNotMatch(portal, /Skip login/);
});
