const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const file = path.resolve(__dirname, '../lib/appBuilder/sourceModel.ts');
const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleRef = { exports: {} };
new Function('module', 'exports', source)(moduleRef, moduleRef.exports);
const { resolveFacts } = moduleRef.exports;

test('independent matching sources strengthen a draft fact', () => {
  const facts = resolveFacts([
    { field: 'realtor.name', value: 'Avery Reed', sourceId: 'site', confidence: 0.72 },
    { field: 'realtor.name', value: '  Avery   Reed ', sourceId: 'brokers', confidence: 0.72 },
  ]);
  assert.equal(facts[0].value, 'Avery Reed');
  assert.equal(facts[0].needsClarification, false);
  assert.equal(facts[0].evidence.length, 2);
});

test('conflicts and unsupported high-risk facts remain questions', () => {
  const facts = resolveFacts([
    { field: 'realtor.phone', value: '555-0100', sourceId: 'site', confidence: 0.92 },
    { field: 'realtor.phone', value: '555-0101', sourceId: 'profile', confidence: 0.88 },
    { field: 'credentials.license.number', value: 'AB123', sourceId: 'site', confidence: 0.95 },
  ]);
  assert.equal(facts.find((item) => item.field === 'realtor.phone').needsClarification, true);
  assert.deepEqual(facts.find((item) => item.field === 'realtor.phone').conflictingValues, ['555-0101']);
  assert.equal(facts.find((item) => item.field === 'credentials.license.number').needsClarification, true);
});

test('a single clearly-stated website fact is used without asking again', () => {
  const facts = resolveFacts([{ field: 'realtor.city', value: "Coeur d'Alene, ID", sourceId: 'site', confidence: 0.7 }]);
  assert.equal(facts[0].needsClarification, false);
});

test('builder auth gate exports helpers and a local guest builder path', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../lib/appBuilder/buildService.ts'), 'utf8');
  assert.match(src, /export const BUILDER_AUTH_MESSAGE/);
  assert.match(src, /Confirm your realtor email and sign in to use the app builder/);
  assert.match(src, /export async function hasVerifiedBuilderAuth/);
  assert.match(src, /export async function hasGuestBuilderAccess/);
  assert.match(src, /export async function setGuestBuilderAccess/);
  assert.match(src, /GUEST_BUILDER_ACCESS_KEY/);
  assert.match(src, /isGuestPlaceholderEmail/);
  assert.match(src, /@guest\.myrealtor\.app/);
  // Guest REALTOR access codes use local AsyncStorage — not cloud verify.
  assert.match(src, /kind === "local"/);
  assert.match(src, /analyzeLocal/);
  assert.match(src, /myrealtor\.builder\.local\.v1/);
  // Edge case (non-guest, no auth) still throws the shared constant.
  assert.match(src, /throw new Error\(BUILDER_AUTH_MESSAGE\)/);
});
