const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadBookingLink() {
  const module = { exports: {} };
  const source = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', 'lib/bookingLink.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  new Function('require', 'module', 'exports', source)((id) => {
    if (id === 'expo-linking') {
      return {
        createURL: (p, opts) => {
          const q = new URLSearchParams(opts?.queryParams ?? {}).toString();
          return `rork-app://${p.replace(/^\//, '')}${q ? `?${q}` : ''}`;
        },
      };
    }
    return require(id);
  }, module, module.exports);
  return module.exports;
}

test('clientInviteLink uses portal invite entry with access code', () => {
  const prev = process.env.EXPO_PUBLIC_APP_URL;
  process.env.EXPO_PUBLIC_APP_URL = 'https://cdariverdepot-my-realtor.expo.app';
  try {
    const { clientInviteLink } = loadBookingLink();
    const url = clientInviteLink('ab12cd');
    assert.equal(url, 'https://cdariverdepot-my-realtor.expo.app/portal?entry=client&invite=AB12CD');
    assert.doesNotMatch(url, /welcome/);
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_APP_URL;
    else process.env.EXPO_PUBLIC_APP_URL = prev;
  }
});

test('clientInviteLink falls back to deep link without EXPO_PUBLIC_APP_URL', () => {
  const prev = process.env.EXPO_PUBLIC_APP_URL;
  delete process.env.EXPO_PUBLIC_APP_URL;
  try {
    const { clientInviteLink } = loadBookingLink();
    const url = clientInviteLink('XYZ789');
    assert.match(url, /portal/);
    assert.match(url, /entry=client/);
    assert.match(url, /invite=XYZ789/);
    assert.doesNotMatch(url, /welcome/);
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_APP_URL;
    else process.env.EXPO_PUBLIC_APP_URL = prev;
  }
});

test('admin dash no longer promotes public /welcome booking link', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/admin/index.tsx'), 'utf8');
  assert.match(src, /clientInviteLink/);
  assert.match(src, /CLIENT INVITE/);
  assert.doesNotMatch(src, /PUBLIC BOOKING LINK/);
  assert.doesNotMatch(src, /bookingLink\(/);
  assert.doesNotMatch(src, /\/welcome\?ref=/);
});
