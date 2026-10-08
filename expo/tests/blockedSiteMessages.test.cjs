// Blocked sites (final integration): restrictions are kept and never worked around; the realtor is told
// plainly why the link could not be imported and which supported import methods remain.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/index.ts'), 'utf8');
const pick = pattern => source.match(pattern)?.[0] ?? assert.fail(`missing ${pattern}`);
const code = pick(/const BLOCKED_ALTERNATIVES = [^\n]+\n/) + pick(/function readableSourceFailure[\s\S]*?\n}\n/);
const readableSourceFailure = new Function(ts.transpileModule(code + '\nreturn readableSourceFailure;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)();

test('a site that refuses automated readers names the supported alternatives', () => {
  for (const [error, start] of [
    ['The page returned 403.', 'remax.com refused our request (403). This site blocks automated readers'],
    ['The page returned 401.', 'remax.com refused our request (401).'],
    ['Detail page requires human verification', 'remax.com asks every visitor to pass a human check'],
    ['The site sent an error page instead of the website', 'remax.com sent an error page instead of the website.'],
  ]) {
    const message = readableSourceFailure('https://www.remax.com/real-estate-agents/someone', error);
    assert.ok(message.startsWith(start), message);
    assert.match(message, /public page that lists your properties/);
    assert.match(message, /upload a listing file \(PDF, CSV, Word, text, or screenshots\)/);
    assert.match(message, /add properties yourself from your dashboard/);
  }
});

test('outages and wrong addresses are not described as blocking', () => {
  for (const [error, expected] of [
    ['signal timed out', 'agent.example did not respond in time.'],
    ['The page returned 404.', 'agent.example says that page does not exist (404). Check the address.'],
    ['The page returned 503.', 'agent.example had a server error (503). It may be temporary.'],
  ]) assert.equal(readableSourceFailure('https://agent.example/listings', error), expected);
});
