const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const load=import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(fs.readFileSync(path.resolve(__dirname,'../../supabase/functions/analyze-realtor-build/aiGateway.ts'),'utf8'))).toString('base64'));
test('separate gateways reuse validated content at zero new-call budget; invalid results never persist',async()=>{
 const {createAiGateway}=await load;let sends=0;const cache=new Map(),keys=new Map();let next=0;
 const persistence={acquire:async(key)=>cache.has(key)?{state:'cached',response:cache.get(key)}:(keys.set(String(++next),key),{state:'acquired',attempt:String(next)}),finish:async(id,r)=>{if(r.response&&r.cacheSeconds>0)cache.set(keys.get(id),r.response)}};
 const create=(limit='4')=>createAiGateway({env:n=>({OPENAI_API_KEY_STAGING:'fixture',AI_STAGING_MAX_CALLS:limit})[n],channel:'staging',persistence,log:()=>{},fetch:async()=>{sends++;return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:5},output:[]})}});
 const opts={accept:()=>true,cacheSeconds:600};
 await create().request('profile',{input:'source A'},opts);
 const reused=create('0');await reused.request('profile',{input:'source A'},opts);assert.equal(sends,1);assert.equal(reused.summary().calls,0);assert.equal(reused.summary().reused,1);
 await create().request('profile',{input:'source B'},opts);assert.equal(sends,2,'changed source is a new request');
 await create().request('profile',{input:'bad'},{accept:()=>false,cacheSeconds:600});
 await create().request('profile',{input:'bad'},{accept:()=>false,cacheSeconds:600});assert.equal(sends,4);
});
test('checkpoint outage fails before paid work and does not create an unknown provider charge',async()=>{
 const {createAiGateway}=await load;let sends=0;
 const ai=createAiGateway({env:n=>n==='OPENAI_API_KEY'?'fixture':undefined,channel:'production',log:()=>{},persistence:{acquire:async()=>{throw Error('offline')},finish:async()=>{}},fetch:async()=>{sends++;return Response.json({})}});
 await assert.rejects(ai.request('profile',{input:'a'}),{code:'ai_checkpoint'});assert.equal(sends,0);assert.equal(ai.summary().calls,0);assert.equal(ai.summary().unresolvedUsd,0);
});

test('campaign accounting includes unknown provider reservations across runs',()=>{
 const {spentOn,createCampaignMeter}=require('../scripts/ai-budget.cjs');
 assert.equal(spentOn([{at:'2026-10-09T01:00:00Z',estimatedUsd:.1,unresolvedUsd:.2}],'2026-10-09'),.1+.2);
 const config={levels:{D:{usdLimit:.2}},dailyUsdLimit:1,defaultEstimateUsdPerBuild:.1,alertFraction:.8};
 const rows=[];const meter=createCampaignMeter({campaign:'fixture',level:'D',config,ledger:[],write:r=>rows.push(r),warn:()=>{}});
 meter.recordSite('site',[{calls:1,estimatedUsd:0,unresolvedUsd:.2}]);
 assert.equal(meter.beforeSite(),false);assert.equal(rows[0].unresolvedUsd,.2);
});

