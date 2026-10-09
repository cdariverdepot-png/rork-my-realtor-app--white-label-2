const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const gateway = import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/aiGateway.ts'), 'utf8'))).toString('base64'));
const reply = () => Response.json({status:'completed',usage:{input_tokens:10,output_tokens:10},output:[]}, {headers:{'x-request-id':'request-fixture'}});
async function setup(values = {}, send = async () => reply()) {
  const {createAiGateway} = await gateway;
  let calls = 0;
  const valuesWithKey = {OPENAI_API_KEY_STAGING:'fixture', ...values};
  return {ai:createAiGateway({channel:'staging',env:n=>valuesWithKey[n],log:()=>{},fetch:async (...args)=>{calls++;return send(...args)}}),calls:()=>calls};
}
test('reject unaffordable work before sending, including output reservation', async () => {
  const x = await setup({AI_STAGING_MAX_USD:'0.01'});
  await assert.rejects(x.ai.request('profile',{input:'small'}),{code:'ai_budget'});
  assert.equal(x.calls(),0);
});
test('concurrent identical work shares one call and completed reuse works at the limit', async () => {
  let release; const ready = new Promise(r=>{release=r});
  const x=await setup({AI_STAGING_MAX_CALLS:'1'},async()=>{await ready;return reply()});
  const a=x.ai.request('profile',{input:'same'}),b=x.ai.request('profile',{input:'same'});
  assert.equal(x.calls(),1);
  await assert.rejects(x.ai.request('profile',{input:'different'}),{code:'ai_budget'});
  release();const [ar,br]=await Promise.all([a,b]);assert.deepEqual(await ar.json(),await br.json());
  await x.ai.request('profile',{input:'same'});assert.equal(x.calls(),1);assert.equal(x.ai.summary().reused,2);
});
test('concurrent different work reserves dollars before responses return', async () => {
  let release;const ready=new Promise(r=>{release=r});
  const x=await setup({AI_STAGING_MAX_USD:'0.05'},async()=>{await ready;return reply()});
  const a=x.ai.request('profile',{input:'first'});
  await assert.rejects(x.ai.request('profile',{input:'second'}),{code:'ai_budget'});
  release();await a;assert.equal(x.calls(),1);
});
test('unknown usage retains its reservation and response-stream errors are accounted', async () => {
  const x=await setup({AI_STAGING_MAX_USD:'0.05'},async()=>{throw Error('timeout')});
  await assert.rejects(x.ai.request('profile',{input:'first'}),/timeout/);
  assert.ok(x.ai.summary().unresolvedUsd>0);
  await assert.rejects(x.ai.request('profile',{input:'second'}),{code:'ai_budget'});
  assert.equal(x.calls(),1);
});
test('policy model wins, output is bounded, request id is retained', async () => {
  let body; const x=await setup({},async(_,init)=>{body=JSON.parse(init.body);return reply()});
  await x.ai.request('profile',{input:'x',model:'expensive-override',max_output_tokens:100000});
  assert.equal(body.model,'gpt-4.1');assert.equal(body.max_output_tokens,4096);
  assert.equal(x.ai.summary().records[0].requestId,'request-fixture');
  assert.equal(x.ai.summary().unresolvedUsd,0);
});
test('staging-only keys allow builds; deterministic setup does not require a production AI key', async () => {
  const {runBuild,currentBundle}=require('../scripts/build-pipeline-harness.cjs');
  const bundle=currentBundle().replace('const DEPLOYMENT_CHANNEL: "production" | "staging" = "production";', 'const DEPLOYMENT_CHANNEL: "production" | "staging" = "staging";');
  const result=await runBuild(bundle,{seeds:['https://agent.example/'],pages:[{url:'https://agent.example/',html:'<h1>Jane Realtor</h1><p>Springfield homes</p>'}]},{latencyMs:1,aiLatencyMs:1,env:{OPENAI_API_KEY:undefined,OPENAI_API_KEY_STAGING:'fixture'}});
  assert.equal(result.status,200);
});
