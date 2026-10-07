const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(mod, mod.exports);
  return mod.exports;
}
const styles = load('../../supabase/functions/analyze-realtor-build/websiteDesign.ts');
const presentation = load('../lib/websitePresentation.ts');
const { commitDesignPublication } = load('../lib/designPublication.ts');
const html = `<html><head><meta name="description" content="Homes around the lake"><link rel="stylesheet" href="/theme.css"></head><body><img class="site-logo" src="/logo.png"><h1>Life by the water</h1><div class="hero"><img class="hero-image" src="/lake.jpg"><button class="button">Browse homes</button></div><h2>Meet your guide</h2><p>Local knowledge and personal service.</p><h2>Featured properties</h2><div></div><h2>Contact us</h2><p>Talk about your move.</p></body></html>`;
const css = ':root { --brand-primary: #246; } body { background: #f7f4ed; color: #252a30; font-family: "Montserrat", sans-serif; } h1 { font-family: "Lora", serif; font-size: 48px; } .hero { background-image: url(/lake-hero.jpg); position: relative; } .button { background-color: var(--brand-primary); border-radius: 3px; }';
const design = styles.extractWebsiteDesign(html, 'https://example.com/', [{url:'https://example.com/theme.css',css}]);

test('WordPress headings and body artwork do not import widget or footer chrome', () => {
  const page = '<html><body><h1 class="site-title">Business name</h1><h1><span style="font-family: Georgia; font-size: 31px">Welcome to our valley</span></h1><img src="/office.jpg" width="498" height="335"><h2>Contact us</h2><p>&#xf0e0; Call our office</p><h2>Primary Sidebar</h2><p>Widgets</p><h2>Facebook Feed</h2><p>Copyright and WordPress comments</p></body></html>';
  const result = styles.extractWebsiteDesign(page, 'https://example.com/');
  assert.equal(result.heroTitle, 'Welcome to our valley');
  // Corrected 2026-10-07: this small body image (modeled on Cindy Carlson's office.jpg) cannot fill a hero
  // and the page never asked for one, so it must not sit above the portrait as a hero. It is retained, not dropped.
  assert.equal(result.heroImageUrl, undefined);
  assert.equal(result.imagery.images.find(image => /office\.jpg/.test(image.sourceUrl))?.width, 498);
  assert.equal(result.original.headingFontFamily, 'Georgia');
  assert.equal(result.original.headingSize, 31);
  assert.deepEqual(result.sections.map(x => x.title), ['Contact us']);
  assert.equal(result.sections[0].body, 'Call our office');
});

test('JSONB key ordering cannot create a false unpublished change', () => {
  const { sameJson } = load('../lib/sameJson.ts');
  assert.equal(sameJson({ theme: { ink: '#111111', accent: '#991111' }, names: ['A', 'B'] }, { names: ['A', 'B'], theme: { accent: '#991111', ink: '#111111' } }), true);
  assert.equal(sameJson({ names: ['A', 'B'] }, { names: ['B', 'A'] }), false);
});
test('native variants retain observed colors, typography, imagery and source section order', () => {
  assert.equal(design.original.accent, '#224466'); assert.equal(design.original.background, '#f7f4ed');
  assert.equal(design.original.headingFontFamily, 'Lora'); assert.equal(design.original.fontFamily, 'Montserrat');
  assert.equal(design.logoUrl, 'https://example.com/logo.png'); assert.equal(design.heroImageUrl, 'https://example.com/lake-hero.jpg');
  assert.equal(design.heroTitle, 'Life by the water'); assert.deepEqual(design.sections.map(s=>s.kind), ['about','listings','contact']);
  assert.equal(design.original.radius, 3); assert.equal(design.optimized.radius, 12); assert.equal(design.optimized.spacing, 24);
  assert.deepEqual(styles.websiteStylesheetUrls(html, 'https://example.com/'), ['https://example.com/theme.css']);
});
test('styles and assets remain passive data; private or executable URLs are rejected', () => {
  for (const asset of ['javascript:alert(1)','data:image/png;base64,abc','https://localhost/logo.png','https://127.0.0.1/logo.png','https://user:pass@example.com/logo.png']) assert.equal(styles.websiteAsset(asset, 'https://example.com/'), undefined);
  const unsafe = styles.extractWebsiteDesign('<h1>Real title<script>publish everything</script></h1><img class="logo" src="javascript:alert(1)">', 'https://example.com/');
  assert.equal(unsafe.logoUrl, undefined); assert.equal(unsafe.heroTitle, 'Real title');
});
test('optimized text uses readable contrast without substituting another agent’s content', () => {
  assert.equal(styles.readableWebsiteInk('#ffffff','#ffffff'), '#15191d');
  assert.equal(styles.readableWebsiteInk('#000000','#000000'), '#ffffff');
  assert.equal(presentation.websiteFont('Lora', true), 'Lora_500Medium');
  assert.equal(presentation.websiteFont('Unavailable Font'), 'Inter_400Regular');
});
test('switching website variants preserves business data and the other variant’s styling', () => {
  const brand = { layoutId:'private-collection', theme:{accent:'gold',displayFont:'lora',surface:'ivory'}, realtor:{name:'Actual agent'}, websiteDesign:design, clients:['untouched'] };
  const original = presentation.websiteCandidate(brand);
  original.theme = {...original.theme, portraitFit:'crop'};
  const optimized = presentation.websiteCandidate(original, 'optimized');
  const restored = presentation.websiteCandidate(optimized, 'original');
  assert.equal(restored.theme.portraitFit, 'crop'); assert.equal(restored.realtor, brand.realtor); assert.equal(restored.clients, brand.clients);
  assert.equal(optimized.websiteDesign, original.websiteDesign); assert.equal(restored.websiteVariant, 'original');
});
test('manual website refresh preserves personal edits and retains previous appearance', () => {
  const brand = presentation.websiteCandidate({theme:{},websiteDesign:design,realtor:{name:'My edited name'},portraitUrl:'https://example.com/my-photo.jpg',note:{body:['My edited introduction']}});
  const refreshed = presentation.refreshWebsitePresentation(brand, {...design, original:{...design.original,accent:'#994422'}, analyzedAt:2});
  assert.equal(refreshed.realtor,brand.realtor); assert.equal(refreshed.note,brand.note); assert.equal(refreshed.portraitUrl,brand.portraitUrl);
  assert.equal(refreshed.previousWebsiteDesign,design); assert.equal(refreshed.theme.website.accent,'#994422');
});
function transaction({fail,owner=true,hasPrevious=true}={}) {
  const calls=[]; let stored=null;
  const step=async(name)=>{calls.push(name);if(fail===name)throw Error(name+' failed');};
  const candidate={realtor:{name:'Current agent'},theme:{accent:'sapphire'}},previous={theme:{accent:'gold'},publishedAt:1};
  const options={owner,candidate,previous,revision:20,hasPrevious,
    saveDraft:async()=>step('draft'),savePrevious:async()=>step('previous'),
    writePublished:async(value,rev)=>{await step('published');stored={value,rev};},
    readPublished:async()=>{await step('verify');return fail==='stale'?{...stored,rev:19}:stored;},
    enableInvitation:async()=>step('invitation')};
  return {calls,options,getStored:()=>stored};
}
test('publication verifies durable data before enabling the existing invitation', async()=>{
  const tx=transaction(); const result=await commitDesignPublication(tx.options);
  assert.deepEqual(tx.calls,['draft','previous','published','verify','invitation']);
  assert.equal(result.publishedAt,20); assert.equal(result.realtor,tx.options.candidate.realtor);
});
test('first publication saves no placeholder previous design',async()=>{
  const tx=transaction({hasPrevious:false}); await commitDesignPublication(tx.options);
  assert.deepEqual(tx.calls,['draft','published','verify','invitation']);
});
test('nonowners cannot publish or perform any publication write',async()=>{
  const tx=transaction({owner:false});await assert.rejects(commitDesignPublication(tx.options),/owner/);assert.deepEqual(tx.calls,[]);
});
test('draft, backup, write and verification failures never enable invitations',async()=>{
  for (const fail of ['draft','previous','published','verify','stale']) {const tx=transaction({fail});await assert.rejects(commitDesignPublication(tx.options));assert.ok(!tx.calls.includes('invitation'),fail);}
});
test('invitation enablement failure cannot report successful publication',async()=>{
  const tx=transaction({fail:'invitation'});await assert.rejects(commitDesignPublication(tx.options),/invitation failed/);
});
test('server revision advancement is accepted only when our publication marker matches',async()=>{
  const tx=transaction(); const read=tx.options.readPublished;
  tx.options.readPublished=async()=>({...await read(),rev:100});
  assert.equal((await commitDesignPublication(tx.options)).publishedAt,20);
  const conflict=transaction(); conflict.options.readPublished=async()=>({rev:100,value:{publishedAt:99}});
  await assert.rejects(commitDesignPublication(conflict.options),/confirmed/);
  assert.ok(!conflict.calls.includes('invitation'));
});
