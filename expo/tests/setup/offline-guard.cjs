// Level A (offline) guard, loaded into every regression test process with `node --test --require`.
// The offline suite must never reach a paid model or a live website. Any HTTP(S) request to a
// non-local host through fetch, http or https throws immediately and is reported when the process
// exits, so a test that forgot to inject its recorded network fails instead of silently spending
// money or depending on today's internet. Tests that inject their own fetch are unaffected.
// Set LEVEL_A_GUARD=off only for a deliberately live script, never for the regression suite.
if (process.env.LEVEL_A_GUARD !== 'off') {
  process.env.AI_MODE = 'offline';
  const http = require('node:http');
  const https = require('node:https');
  const blocked = [];
  const local = host => /^(?:localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i.test(host ?? '');
  const refuse = target => {
    const text = String(target);
    blocked.push(text.slice(0, 200));
    const paid = /api\.openai\.com|api\.anthropic\.com/i.test(text);
    return Object.assign(new Error(`Offline regression suite blocked a ${paid ? 'paid AI' : 'live network'} request: ${text.slice(0, 160)}`), { code: 'LEVEL_A_OFFLINE' });
  };
  const hostOf = input => {
    try { const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input?.url); return url.protocol.startsWith('http') ? url.hostname : null; }
    catch { return null; }
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = function guardedFetch(input, init) {
    const host = hostOf(input);
    if (host !== null && !local(host)) return Promise.reject(refuse(typeof input === 'string' || input instanceof URL ? input : input?.url));
    return realFetch.call(this, input, init);
  };
  for (const mod of [http, https]) {
    for (const name of ['request', 'get']) {
      const real = mod[name];
      mod[name] = function guardedRequest(target, ...rest) {
        const options = typeof target === 'string' || target instanceof URL ? new URL(String(target)) : target ?? {};
        const host = options.hostname ?? options.host;
        if (host && !local(String(host).replace(/:\d+$/, ''))) throw refuse(`${mod === https ? 'https' : 'http'}://${host}${options.pathname ?? options.path ?? ''}`);
        return real.call(this, target, ...rest);
      };
    }
  }
  // A test that deliberately proves a request is refused clears its own entry after asserting it.
  globalThis.__levelAGuard = { blocked, clear: () => blocked.splice(0) };
  process.on('exit', () => {
    if (!blocked.length) return;
    process.exitCode = 1;
    console.error(`\nLevel A guard: ${blocked.length} unexpected network request(s) were blocked:\n  ${[...new Set(blocked)].join('\n  ')}`);
  });
}
