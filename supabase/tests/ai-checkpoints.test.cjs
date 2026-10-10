const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('durable checkpoints isolate tenants, reserve budgets, preserve unknown charges and settle idempotently',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261009074313_importer_ai_checkpoints.sql'),'utf8'));
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  const acquire=async(o,key,reserve=.04,limit=.1)=> (await db.query('select public.import_ai_acquire($1,$2,$3,$4,$5,$6,$7) as result',[o,'staging',key.repeat(64),'profile',reserve,limit,null])).rows[0].result;
  const finish=async(id,known,response=null)=>db.query('select public.import_ai_finish($1,$2,$3,$4,$5,$6)',[id,response,{requestId:'fixture'},.01,known,response?600:0]);
  await db.exec('set role service_role');
  const a=await acquire(owner,'a');assert.equal(a.state,'acquired');
  assert.equal((await acquire(owner,'a')).state,'busy');
  const b=await acquire(other,'a');assert.equal(b.state,'acquired','another tenant never reuses a result');
  assert.equal((await acquire(owner,'b')).state,'budget','both outstanding reservations count');
  const response={status:200,text:'{"ok":true}',contentType:'application/json'};
  await finish(a.attempt,true,response);
  assert.deepEqual((await acquire(owner,'a',.04,0)).response,response,'reuse is free even at zero budget');
  await finish(a.attempt,true,response);
  assert.equal((await db.query('select cost_usd from private.import_ai_attempts where id=$1',[a.attempt])).rows[0].cost_usd,'0.01');
  await finish(b.attempt,false);
  assert.equal((await acquire(other,'a')).state,'busy','uncertain provider charge is not retried');
  await finish(b.attempt,true);
  assert.equal((await acquire(other,'a')).state,'acquired','reconciled failure can retry');
  await db.exec('set role authenticated');
  await assert.rejects(acquire(owner,'c'),/permission denied/);
  await assert.rejects(db.query('select * from private.import_ai_cache'),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int as n from pg_class where relname like 'import_ai_%' and relkind='r' and relrowsecurity")).rows[0].n,3);
 } finally {await db.close();}
});
