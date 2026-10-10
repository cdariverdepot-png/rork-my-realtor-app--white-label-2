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

const discoverySource = ts.transpileModule(fs.readFileSync(path.resolve(__dirname,
  '../../supabase/functions/analyze-realtor-build/listingDiscovery.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const discoveryModule = { exports: {} };
new Function('require', 'module', 'exports', discoverySource)(require, discoveryModule, discoveryModule.exports);
const { publicListingRequestHeaders, decodePublicListingResponse, createListingRenderer, listingRenderBackendFromEnv, isRobotChallenge, isPublishedScriptGate, publishedScriptGateCookie, continueAfterVerification } = discoveryModule.exports;
const designModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname,
  '../../supabase/functions/analyze-realtor-build/websiteDesign.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(designModule, designModule.exports);
const presentationModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname,
  '../lib/websitePresentation.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(presentationModule, presentationModule.exports);

// Execute the real Edge Function with website/API boundaries replaced by fixtures.
async function runWebsiteBuild({ guest = false, mode, unreadable = false, noFacts = false, html, status = 'needs-input', invokeRenderer = false, serviceActive = true, trustedGuest = true, updatedAt, conflict = false } = {}) {
  const edge = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/index.ts'), 'utf8')
    .replace(/^import .*createClient.*;\r?\n/m, '')
    .replace(/^import .*listingDiscovery\.ts";\r?\n/m, '');
  // progress.ts has no imports; it is embedded as-is, exactly as the deployment bundle does.
  const progressModule = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/progress.ts'), 'utf8').replace(/^export /gm, '');
  // listingRecords.ts imports only types; it is embedded the same way.
  const recordsModule = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/listingRecords.ts'), 'utf8').replace(/^import type .*;\r?\n/gm, '').replace(/^export /gm, '');
  // aiGateway.ts and deployment.ts import nothing; they are embedded the same way.
  const aiModules = ['aiGateway.ts', 'aiPersistence.ts', 'deployment.ts'].map(file => fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build', file), 'utf8').replace(/^import type .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n');
  const edgeWithoutFiles = progressModule + '\n' + recordsModule + '\n' + aiModules + '\n' + edge.replace(/^import .*aiPersistence\.ts";\r?\n/m, '').replace(/^import .*aiGateway\.ts";\r?\n/m, '').replace(/^import .*deployment\.ts";\r?\n/m, '').replace(/^import .*listingFiles\.ts";\r?\n/m, '').replace(/^import .*websiteDesign\.ts";\r?\n/m, '').replace(/^import .*progress\.ts";\r?\n/m, '').replace(/^import .*listingRecords\.ts";\r?\n/m, '');
  // Inline a minimal discoverListings so the edge function body still runs in fixtures.
  const discoveryStub = `
    async function discoverListings(seeds, fetchHtml, options) {
      const visited = [];
      const listings = [];
      let rendered = false;
      if (options && typeof options.renderPage === 'function') {
        const page = await options.renderPage(seeds[0]);
        rendered = !!(page && page.html);
        const price = page && page.html ? (page.html.match(/\\$[\\d,]+/) || [])[0] : '';
        if (price) {
          listings.push({ title: 'Rendered inventory', description: '', price, beds: 0, baths: 0, sqft: '',
            neighborhood: '', image: '', images: [], sourceUrl: page.finalUrl.toString() });
        }
      }
      for (const uri of seeds.slice(0, 2)) {
        try {
          const page = await fetchHtml(uri);
          visited.push(page.finalUrl.toString());
          const price = (page.html.match(/\\$[\\d,]+/) || [])[0] || '';
          const title = (page.html.match(/<title[^>]*>([^<]*)<\\/title>/i) || [])[1] || '';
          if (price || /listing|property|home/i.test(page.html)) {
            listings.push({ title: title || 'Listing', description: '', price, beds: 0, baths: 0, sqft: '',
              neighborhood: '', image: '', images: [], sourceUrl: page.finalUrl.toString() });
          }
        } catch {}
      }
      return { listings, meta: { visited, hops: visited.length, found: listings.length, maxDepth: 0, rendered } };
    }
  `;
  const code = ts.transpileModule(discoveryStub + '\n' + edgeWithoutFiles, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let handler, aiBody, update, reads = 0;
  const rendererPosts = [];
  const source = { id:'website', kind:'url', label:'Website', uri:'https://cindycarlsonrealty.com/', status:'queued' };
  const draft = { heroMessage:'Original opening', aboutParagraph:'Original introduction', tone:'warm', layoutId:'warm-concierge' };
  const build = { sources:[source], evidence:[], draft, status, updated_at:updatedAt };
  const admin = { rpc:async()=>({data:serviceActive,error:null}), auth:{getUser:async()=>({data:{user:{id:'fixture',is_anonymous:guest,app_metadata:{importer_test_access:trustedGuest},email_confirmed_at:guest?null:'now'}}})}, from:table=> {
    if(table==='realtors')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'realtor'},error:null})})})};
    reads++;
    return { select:()=>({eq:()=>({single:async()=>({data:build})})}), update:value=>({eq:()=>{
      if(updatedAt)return {eq:(column,expected)=>{assert.equal(column,'updated_at');assert.equal(expected,updatedAt);return {select:async()=>{if(!conflict)update=value;return {data:conflict?[]:[{auth_user_id:'fixture',updated_at:'new-version'}],error:null}}}}};
      update=value;return Promise.resolve({error:null});
    }}) };
  } };
  const fetchFixture = async (url, options) => {
    if (String(url) === 'https://render.example/run') {
      rendererPosts.push({ headers: options.headers, body: JSON.parse(options.body) });
      return Response.json({
        html: '<html><title>Rendered inventory</title><p>$350,000</p></html>',
        finalUrl: 'https://cindycarlsonrealty.com/',
        network: [{ url: 'https://cindycarlsonrealty.com/api/search', html: '{"listings":[1]}' }],
      });
    }
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
  const previousFetch = globalThis.fetch;
  if (invokeRenderer) globalThis.fetch = fetchFixture;
  let response;
  try {
    new Function('Deno','createClient','fetch','publicListingRequestHeaders','decodePublicListingResponse','extractWebsiteDesign','websiteStylesheetUrls','websiteContentLinks','composeWebsiteSections','classifyWebsiteSection','websiteNeedsBrowser','websiteAsset','assignPageImages','describePageImages','createListingRenderer','listingRenderBackendFromEnv','isRobotChallenge','isPublishedScriptGate','publishedScriptGateCookie','continueAfterVerification',code)({env:{get:name => invokeRenderer && name === 'LISTING_RENDER_URL' ? 'https://render.example/run' : invokeRenderer && name === 'LISTING_RENDER_TOKEN' ? 'render-token' : name === 'LISTING_RENDER_URL' || name === 'LISTING_RENDER_TOKEN' ? undefined : 'fixture'},resolveDns:async(_,type)=>type==='A'?['8.8.8.8']:[],serve:fn=>{handler=fn;}},()=>admin,fetchFixture,publicListingRequestHeaders,decodePublicListingResponse,designModule.exports.extractWebsiteDesign,designModule.exports.websiteStylesheetUrls,designModule.exports.websiteContentLinks,designModule.exports.composeWebsiteSections,designModule.exports.classifyWebsiteSection,designModule.exports.websiteNeedsBrowser,designModule.exports.websiteAsset,designModule.exports.assignPageImages,designModule.exports.describePageImages,createListingRenderer,listingRenderBackendFromEnv,isRobotChallenge,isPublishedScriptGate,publishedScriptGateCookie,continueAfterVerification);
    response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({guest,mode,target:'heroMessage',sources:[source],draft})}));
  } finally {
    globalThis.fetch = previousFetch;
  }
  return {status:response.status,result:await response.json(),aiBody,update,reads,rendererPosts};
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
  assert.equal(r.rendererPosts.length,0);
});

test('production onboarding invokes the configured renderer and continues discovery', async () => {
  const r = await runWebsiteBuild({ guest: true, invokeRenderer: true });
  assert.equal(r.status, 200);
  assert.equal(r.rendererPosts.length, 1);
  assert.equal(r.rendererPosts[0].body.url, 'https://cindycarlsonrealty.com/');
  assert.equal(r.rendererPosts[0].headers.authorization, 'Bearer render-token');
  assert.equal(r.result.listingDiscovery.rendered, true);
  assert.ok(r.result.discoveredListings.some(item => item.price === '$350,000'));
});

test('expired evaluation retains authenticated website setup for cloud and guest drafts',async()=>{
  for(const guest of [true,false]){const r=await runWebsiteBuild({guest,serviceActive:false});assert.equal(r.status,200);assert.ok(r.aiBody);}
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
    if (request === '@/lib/websitePresentation') return presentationModule.exports;
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

    // Studio Update From URL (Oct 9 2026): a name that was read from the previous website is that website's,
    // not the realtor's own, so the new website's name replaces it; a name the realtor has is still kept.
    const fact = (field, value) => ({ field, value, evidence: [], needsClarification: false, conflictingValues: [] });
    const fromCindy = { ...base, realtor: { ...base.realtor, name: 'Cindy Carlson' } };
    const switched = applyBuildDraft(fromCindy, [fact('realtor.name', 'Bernadette Stech')], {}, { previousFacts: [fact('realtor.name', 'Cindy Carlson')] });
    assert.equal(switched.realtor.name, 'Bernadette Stech');
    const ownName = applyBuildDraft({ ...base, realtor: { ...base.realtor, name: 'Jerrod Taylor' } }, [fact('realtor.name', 'Bernadette Stech')], {}, { previousFacts: [fact('realtor.name', 'Cindy Carlson')] });
    assert.equal(ownName.realtor.name, 'Jerrod Taylor');
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
  // Review now mounts the real client canvas — never a flat brown stub.
  assert.match(review, /OnboardingThemePreview/);
  assert.match(review, /themeCandidate/);
  // Opening-line / review chrome must not interpolate draft.realtor.name (auth identity leak).
  assert.doesNotMatch(review, /\{draft\.realtor\.name\}/);
  assert.doesNotMatch(review, /#29231F/);
});

test('completed cloud drafts remain editable after onboarding', async () => {
  for (const mode of [undefined, 'regenerate']) {
    const r = await runWebsiteBuild({ status: 'complete', mode });
    assert.equal(r.status, 200);
    assert.match(r.result.draft.heroMessage, /Cindy Carlson/);
    assert.ok(r.update);
  }
});

test('completed guest drafts can refresh the same URL and retain saved content on failure', async () => {
  const original = { sources: [{id:'site',kind:'url',uri:'https://example.com/'}], evidence:[], draft:{heroMessage:'Saved copy'}, selected_layout:'warm-concierge',status:'complete' };
  let saved = original, fail = false, calls = 0;
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../lib/appBuilder/buildService.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = {exports:{}};
  const storage = {getItem:async key => key.includes('guestAccess') ? JSON.stringify({realtorId:'guest'}) : JSON.stringify(saved), setItem:async (key,value) => {saved=JSON.parse(value);}};
  new Function('require','module','exports',code)(id => {
    if (id==='@react-native-async-storage/async-storage') return {__esModule:true,default:storage};
    if (id==='expo-file-system') return {File:class{}};
    if (id==='expo-crypto') return {randomUUID:()=> 'id'};
    if (id==='react-native') return {Platform:{OS:'web'}};
    if (id==='@/lib/importStream') return {invokeWithProgress:async()=>{throw new Error('streaming is not used by this flow');}};
    if (id==='@/lib/importerFunctions') return {BUILD_FUNCTION:'analyze-realtor-build',LISTING_FUNCTION:'refresh-listings'};
    if (id==='@/lib/supabase') return {ensureSupabaseSession:async()=>true,supabase:{functions:{invoke:async()=>{calls++;return fail ? {data:{error:'Website unavailable'}} : {data:{draft:{heroMessage:'Fresh copy'},evidence:[],sources:original.sources}};}}}};
    throw new Error(id);
  },mod,mod.exports);
  await mod.exports.analyzeBuild();
  assert.equal(calls,1);
  assert.equal(saved.draft.heroMessage,'Fresh copy');
  assert.equal(saved.sources[0].uri,original.sources[0].uri);
  saved=original; fail=true;
  await assert.rejects(mod.exports.analyzeBuild(),/Website unavailable/);
  assert.deepEqual(saved,original);
});

test('production rejects anonymous paid inference without server-owned tester authorization',async()=>{
 const r=await runWebsiteBuild({guest:true,trustedGuest:false});assert.equal(r.status,403);assert.equal(r.aiBody,undefined);assert.equal(r.update,undefined);
});
test('an import cannot overwrite a draft edited after its snapshot',async()=>{
 const r=await runWebsiteBuild({updatedAt:'original-version',conflict:true});assert.equal(r.status,409);assert.equal(r.result.code,'build_changed');assert.equal(r.update,undefined);
 const saved=await runWebsiteBuild({updatedAt:'original-version'});assert.equal(saved.status,200);assert.ok(saved.update);
});
