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

// Execute the real Edge Function with website/API boundaries replaced by fixtures.
async function runWebsiteBuild({ guest = false, mode, unreadable = false, noFacts = false, html } = {}) {
  const edge = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/index.ts'), 'utf8')
    .replace(/^import .*createClient.*;\r?\n/, '');
  const code = ts.transpileModule(edge, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let handler, aiBody, update, reads = 0;
  const source = { id:'website', kind:'url', label:'Website', uri:'https://cindycarlsonrealty.com/', status:'queued' };
  const draft = { heroMessage:'Original opening', aboutParagraph:'Original introduction', tone:'warm', layoutId:'warm-concierge' };
  const build = { sources:[source], evidence:[], draft, status:'needs-input' };
  const admin = { auth:{getUser:async()=>({data:{user:{id:'fixture',is_anonymous:guest,email_confirmed_at:guest?null:'now'}}})}, from:()=> {
    reads++;
    return { select:()=>({eq:()=>({single:async()=>({data:build})})}), update:value=>({eq:async()=>{update=value;return {error:null};}}) };
  } };
  const fetchFixture = async (url, options) => {
    if (String(url).startsWith('https://api.openai.com/')) {
      aiBody=JSON.parse(options.body);
      const generated = mode === 'regenerate' ? {value:'Cindy Carlson Realty: your North Idaho guide.'} : {
        evidence:noFacts?[]:[{field:'realtor.brandName',value:'Cindy Carlson Realty',sourceId:'website',locator:source.uri,confidence:0.95}],
        copy:{heroMessage:'Cindy Carlson Realty: your North Idaho guide.',aboutParagraph:'Personal help buying and selling in North Idaho.'},
        tone:'warm',layoutId:'warm-concierge',portraitSourceId:null,potentialListingSources:[],
      };
      return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(generated)}]}]});
    }
    if (unreadable) return new Response('Unavailable',{status:503});
    return new Response(html ?? '<html><title>Cindy Carlson Realty</title><p>Full Service Agency in North Idaho.</p></html>',{headers:{'Content-Type':'text/html'}});
  };
  new Function('Deno','createClient','fetch',code)({env:{get:()=> 'fixture'},resolveDns:async(_,type)=>type==='A'?['8.8.8.8']:[],serve:fn=>{handler=fn;}},()=>admin,fetchFixture);
  const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({guest,mode,target:'heroMessage',sources:[source],draft})}));
  return {status:response.status,result:await response.json(),aiBody,update,reads};
}

test('guest testing-code builds read URL content and generate real copy without account writes', async () => {
  const r=await runWebsiteBuild({guest:true});
  assert.equal(r.status,200);
  assert.match(JSON.stringify(r.aiBody.input),/Cindy Carlson Realty/);
  assert.match(JSON.stringify(r.aiBody.input),/North Idaho/);
  assert.equal(r.aiBody.text.format.type,'json_schema');
  assert.ok(r.aiBody.text.format.schema.required.includes('evidence'));
  assert.equal(r.result.evidence[0].value,'Cindy Carlson Realty');
  assert.equal(r.reads,0);
});

test('retries reread URLs for existing drafts with zero facts and change only selected copy', async () => {
  for (const guest of [true,false]) {
    const r=await runWebsiteBuild({guest,mode:'regenerate'});
    assert.equal(r.status,200);
    assert.match(JSON.stringify(r.aiBody.input),/Full Service Agency in North Idaho/);
    assert.equal(r.result.draft.aboutParagraph,'Original introduction');
    assert.match(r.result.draft.heroMessage,/Cindy Carlson/);
    if (guest) assert.equal(r.reads,0);
    else assert.equal(r.update.draft.aboutParagraph,'Original introduction');
  }
});

test('failed URL reads or empty extracted facts cannot produce a successful generic build', async () => {
  for (const mode of [undefined,'regenerate']) {
    const r=await runWebsiteBuild({guest:true,mode,unreadable:true});
    assert.equal(r.status,422);
    assert.equal(r.aiBody,undefined);
    assert.equal(r.update,undefined);
  }
  const empty=await runWebsiteBuild({noFacts:true});
  assert.equal(empty.status,422);
  assert.equal(empty.update,undefined);
});

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
  const introAt = src.indexOf('YOUR INTRODUCTION', reviewStart);
  assert.ok(introAt > reviewStart, 'introduction card missing');
  const review = src.slice(reviewStart, introAt);
  // Review now mounts the real ThemeFace canvas — never a flat brown stub.
  assert.match(review, /ThemeFace/);
  assert.match(review, /themeCandidate/);
  // Opening-line / review chrome must not interpolate draft.realtor.name (auth identity leak).
  assert.doesNotMatch(review, /\{draft\.realtor\.name\}/);
  assert.doesNotMatch(review, /#29231F/);
});
