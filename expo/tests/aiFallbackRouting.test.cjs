// Synthetic architecture contracts, not live-site claims. No customer host switches.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const moduleRef={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../supabase/functions/analyze-realtor-build/listingDiscovery.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(moduleRef,moduleRef.exports);
const {discoverListings}=moduleRef.exports;
test('empty application shells and empty collections never buy page interpretation',async()=>{
 for(const origin of ['https://first.example','https://unfamiliar.example'])for(const html of ['<div id="root"></div><script src="/app.js"></script>','<h1>My listings</h1><p>No current properties</p>']){
  let calls=0;await discoverListings([origin+'/listings'],async uri=>({html,finalUrl:new URL(uri)}),{maxPages:2,normalizePage:async()=>{calls++;return []}});assert.equal(calls,0);
 }
});
test('rendered known records are acquired before model fallback',async()=>{
 let calls=0,renders=0;const origin='https://new-architecture.example';
 const result=await discoverListings([origin+'/listings'],async uri=>({html:'<div id="root"></div><script src="/app.js"></script>',finalUrl:new URL(uri)}),{
  maxPages:2,normalizePage:async()=>{calls++;return []},renderPage:async uri=>{renders++;return {finalUrl:new URL(uri),html:'<script type="application/ld+json">'+JSON.stringify({'@type':'RealEstateListing',name:'12 Pine St',price:'450000',url:origin+'/property/12',image:origin+'/12.jpg'})+'</script>'}}
 });assert.ok(renders>0);assert.equal(calls,0);assert.ok(result.listings.some(x=>x.title==='12 Pine St'));
});
test('unfamiliar property evidence still reaches optional normalization on unrelated hosts',async()=>{
 for(const origin of ['https://first.example','https://another.example']){
  let calls=0;const result=await discoverListings([origin+'/listings'],async uri=>({html:'<h1>Featured inventory</h1><custom-record>MLS # A123 asking $450,000. Contact the agent for 12 Pine St.</custom-record>',finalUrl:new URL(uri)}),{maxPages:1,normalizePage:async()=>{calls++;return []}});
  assert.equal(calls,1);assert.ok(result.meta.stages.includes('ai_normalizer_empty'));assert.notEqual(result.meta.coverage,'complete');
 }
});
