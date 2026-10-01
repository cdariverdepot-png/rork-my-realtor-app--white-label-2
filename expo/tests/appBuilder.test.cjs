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

test('applyBuildDraft drops email-local-part names and prefers scraped identity', () => {
  const draftFile = path.resolve(__dirname, '../lib/appBuilder/applyDraft.ts');
  const src = fs.readFileSync(draftFile, 'utf8');
  assert.match(src, /isEmailLocalPartName/);
  assert.match(src, /email-local-part/);
  // Never protect an email handle the way a real signup display name is protected.
  assert.match(src, /!isEmailLocalPartName\(next\.realtor\.name, next\.realtor\.email\)/);

  const layoutsStub = {
    CLIENT_LAYOUTS: [{ id: 'warm-concierge', defaultTheme: { accent: 'gold' } }],
    isClientLayoutId: (id) => id === 'warm-concierge',
  };
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '@/constants/clientLayouts') return layoutsStub;
    if (request === '@/contexts/BrandContext') return {};
    return originalLoad.apply(this, arguments);
  };
  try {
    const source = ts.transpileModule(fs.readFileSync(draftFile, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const moduleRef = { exports: {} };
    new Function('require', 'module', 'exports', source)(require, moduleRef, moduleRef.exports);
    const { applyBuildDraft, isEmailLocalPartName } = moduleRef.exports;

    assert.equal(isEmailLocalPartName('jdouglastaylor', 'jdouglastaylor@example.com'), true);
    assert.equal(isEmailLocalPartName('Jerrod Taylor', 'jdouglastaylor@example.com'), false);

    const base = {
      realtor: {
        name: 'jdouglastaylor',
        title: '',
        city: '',
        phone: '',
        email: 'jdouglastaylor@example.com',
        tagline: '',
        heroMessage: '',
        welcomeNote: '',
        yearsActive: 0,
        closedVolume: '',
        monogram: '',
        brandName: 'JDOUGLASTAYLOR',
        brandSub: '',
        heroEyebrow: '',
        primaryCta: '',
        secondaryCta: '',
      },
      note: { date: '', title: '', body: [], signoff: '', opener: '' },
      concierge: { eyebrow: '', title: '' },
      quickContact: { kicker: '', title: '', sub: '' },
      credentials: { eyebrow: '', title: '', designations: [], education: [], awards: [], memberships: [], languages: [], license: { number: '', state: '', brokerage: '', since: '' } },
      portraitUrl: '',
      iconUrl: '',
      signatureUrl: '',
      beat: { headline: '', bullets: [] },
      testimonials: [],
      recentlyClosed: [],
      marketPulse: { headline: '', date: '', paragraphs: [], signoff: '' },
      neighborhoods: [],
      curated: { eyebrow: '', title: '' },
      social: { eyebrow: '', title: '', closedKicker: '' },
      theme: {},
      copyright: '',
      updatedAt: 0,
      layoutId: 'warm-concierge',
    };

    const withScrape = applyBuildDraft(
      base,
      [
        { field: 'realtor.name', value: 'Cindy Carlson', evidence: [], needsClarification: false, conflictingValues: [] },
        { field: 'realtor.brandName', value: 'Cindy Carlson Realty', evidence: [], needsClarification: false, conflictingValues: [] },
        { field: 'realtor.city', value: "Coeur d'Alene, ID", evidence: [], needsClarification: false, conflictingValues: [] },
      ],
      { heroMessage: 'Welcome to Cindy Carlson Realty', aboutParagraph: 'Hello clients.', layoutId: 'warm-concierge' },
    );
    assert.equal(withScrape.realtor.name, 'Cindy Carlson');
    assert.equal(withScrape.realtor.brandName, 'Cindy Carlson Realty');
    assert.equal(withScrape.realtor.city, "Coeur d'Alene, ID");

    const noNameScrape = applyBuildDraft(
      base,
      [{ field: 'realtor.brandName', value: 'Cindy Carlson Realty', evidence: [], needsClarification: false, conflictingValues: [] }],
      { heroMessage: 'Welcome', layoutId: 'warm-concierge' },
    );
    // Login handle cleared so review asks for a real name.
    assert.equal(noNameScrape.realtor.name, '');
    assert.equal(noNameScrape.realtor.brandName, 'Cindy Carlson Realty');

    const keepsSignupName = applyBuildDraft(
      { ...base, realtor: { ...base.realtor, name: 'Jerrod Taylor', brandName: 'TAYLOR' } },
      [{ field: 'realtor.name', value: 'Website Name', evidence: [], needsClarification: false, conflictingValues: [] }],
      {},
    );
    assert.equal(keepsSignupName.realtor.name, 'Jerrod Taylor');
  } finally {
    Module._load = originalLoad;
  }
});

test('URL preview card never renders realtor.name / auth handle under the headline', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/InitialRealtorSetup.tsx'), 'utf8');
  const reviewStart = src.indexOf('your app</Text>');
  assert.ok(reviewStart > 0, 'review heading missing');
  const review = src.slice(reviewStart, src.indexOf('YOUR INTRODUCTION', reviewStart));
  // Bronze subtitle must not interpolate draft.realtor.name (auth identity leak).
  assert.doesNotMatch(review, /\{draft\.realtor\.name\}/);
  assert.match(review, /never auth login/);
  assert.match(review, /brandName/);
});
