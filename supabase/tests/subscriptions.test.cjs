const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const R='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const uid=n=>`cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12,'0')}`;
test('server entitlement lifecycle in isolated PostgreSQL',async t=>{
 let db,connect,close;
 if(process.env.PGTEST_DATABASE_URL){
  if(!/localhost|127\.0\.0\.1/.test(process.env.PGTEST_DATABASE_URL))throw new Error('Tests require an isolated local PostgreSQL database');
  const {Client}=require('pg'); db=new Client({connectionString:process.env.PGTEST_DATABASE_URL});await db.connect();
  connect=async()=>{const c=new Client({connectionString:process.env.PGTEST_DATABASE_URL});await c.connect();return c;};close=()=>db.end();
 }else{
  const {PGlite}=require('@electric-sql/pglite');db=new PGlite(); await db.waitReady;close=()=>db.close();
 }
 t.after(close);
 const query=(sql,params)=>db.query(sql,params);
 const scalar=async(sql,params)=>(await query(sql,params)).rows[0].result;
 const as=async(id,role='authenticated')=>{await query(`set role ${role}`);await query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
 const admin=async()=>{await query('reset role');await query("select set_config('request.jwt.claim.sub','',false)");};
 // The fixture contains intentionally simplified test credentials; all subscription SQL below is production code.
 const exec=sql=>db.exec?db.exec(sql):db.query(sql);
 await exec(fs.readFileSync(path.join(__dirname,'subscription-baseline.sql'),'utf8'));
 await exec(fs.readFileSync(path.join(__dirname,'../migrations/20261004061627_subscription_entitlements.sql'),'utf8'));
 await exec(fs.readFileSync(path.join(__dirname,'../migrations/20261007200000_apple_entitlements.sql'),'utf8'));
 // Verified Apple snapshots, as written by the apple-subscription Edge Function (service role only).
 let signedAt=Date.now();
 const paid=(over={})=>({original_transaction_id:'2000000000000001',product_id:'monthly',environment:'Sandbox',expires_at:new Date(Date.now()+86400000*30).toISOString(),revoked_at:null,signed_at:new Date(signedAt+=1000).toISOString(),auto_renew:true,billing_issue:false,...over});
 const apply=async(value,rid=R)=>{await as('', 'service_role');return scalar('select public.apple_apply($1,$2) result',[rid,value]);};
 const state=async()=>{await as(OWNER);return scalar('select public.realtor_seat_state($1) result',[R]);};
 const login=async(n,password='password')=>{await as(uid(n));return scalar('select public.verify_client_account($1,$2,$3) result',[R,`c${n}@example.com`,password]);};
 const disconnect=async(n)=>{await as(OWNER);return scalar('select public.disconnect_client($1,$2) result',[R,`c${n}`]);};
 await t.test('contacts, pending invitations and failed authentication consume no seats',async()=>{
  assert.equal((await state()).used,0); assert.equal((await state()).active,true);
  await admin();for(let n=1;n<=6;n++)await query('insert into public.client_accounts values($1,$2,$3,$4,$5)',[R,`c${n}`,`c${n}@example.com`,'password',`Client ${n}`]);
  assert.equal((await login(1,'wrong')).reason,'bad_password');assert.equal((await state()).used,0);
  await as(uid(1));const spoof=await scalar('select public.claim_client_seat($1,$2,$3,$4) result',[R,'spoof@example.com','forged','Forged']);assert.equal(spoof.ok,false);assert.equal((await state()).used,0);
 });
 await t.test('evaluation expires after seven days and can be restored for the remaining lifecycle tests',async()=>{
  await admin();await query("update private.realtor_entitlements set trial_started_at=now()-interval '8 days' where realtor_id=$1",[R]);
  assert.equal((await state()).active,false);assert.equal((await login(1)).reason,'inactive');
  await admin();await query("update private.realtor_entitlements set trial_started_at=now() where realtor_id=$1",[R]);assert.equal((await state()).active,true);
 });
 await t.test('three authenticated clients and repeated/new-device acceptance count once',async()=>{
  for(let n=1;n<=3;n++)assert.equal((await login(n)).ok,true);
  assert.equal((await login(1)).ok,true);await as(uid(10));assert.equal((await scalar('select public.verify_client_account($1,$2,$3) result',[R,'c1@example.com','password'])).ok,true);
  assert.equal((await state()).used,3);assert.equal((await login(4)).reason,'limit');assert.equal((await state()).used,3);
 });
 await t.test('disconnection revokes private access, frees a seat and preserves history',async()=>{
  await disconnect(1);await as(uid(1));assert.equal(await scalar('select private.bound_client($1) result',[R]),null);
  assert.equal(await scalar('select private.kv_read($1) result',[R+':messages.v1']),null);
  assert.equal((await state()).used,2);assert.equal((await login(4)).ok,true);assert.equal((await login(1)).reason,'limit');
  await disconnect(4);assert.equal((await login(1)).ok,true);await as(uid(1));assert.deepEqual(await scalar('select private.kv_read($1) result',[R+':messages.v1']),{history:['preserved']});
  await admin();assert.equal((await query('select count(*)::int n from private.client_relationships where realtor_id=$1 and client_id=$2',[R,'c1'])).rows[0].n,1);
 });
 await t.test('concurrent acceptance cannot oversubscribe the remaining evaluation seat',async()=>{
  await disconnect(3);
  if(!connect){t.diagnostic('PGlite serializes a single connection; the separate PostgreSQL CI job verifies concurrent transactions.');assert.equal((await login(5)).ok,true);assert.equal((await login(6)).reason,'limit');return;}
  const clients=await Promise.all([connect(),connect(),connect()]);
  try{
   await Promise.all(clients.map(async(c,i)=>{await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[uid([3,5,6][i])]);}));
   const results=await Promise.all(clients.map((c,i)=>c.query('select public.verify_client_account($1,$2,$3) result',[R,`c${[3,5,6][i]}@example.com`,'password'])));
   assert.equal(results.filter(r=>r.rows[0].result.ok).length,1);assert.equal((await state()).used,3);
  }finally{await Promise.all(clients.map(c=>c.end()));}
 });
 await t.test('signup capacity refusal saves the authenticated account for retry',async()=>{
  await as(uid(7));const r=await scalar('select public.register_client_account($1,$2,$3,$4,$5) result',[R,'c7@example.com','password','c7','New client']);assert.equal(r.reason,'limit');assert.equal(r.account_created,true);
  await admin();assert.equal((await query('select count(*)::int n from public.client_accounts where realtor_id=$1 and client_id=$2',[R,'c7'])).rows[0].n,1);assert.equal((await state()).used,3);
 });
 await t.test('a verified Apple subscription unlocks unlimited connections without replacing records',async()=>{
  assert.equal((await apply(paid())).ok,true);assert.equal((await state()).limit,-1);assert.equal((await state()).status,'subscribed');assert.equal((await login(6)).ok,true);
  await as(OWNER);const exported=await scalar('select public.export_realtor_data($1) result',[R]);assert.deepEqual(exported.records[R+':messages.v1'],{history:['preserved']});assert.equal(exported.records[R+':auth.secret'],undefined);assert.equal(exported.records[OTHER+':brand.v2'],undefined);assert.equal(exported.listingSources[0].headers,undefined);
  await admin();assert.equal((await query('select client_code from public.realtors where id=$1',[R])).rows[0].client_code,'INVITE');assert.deepEqual((await query('select draft from public.realtor_builds where auth_user_id=$1',[OWNER])).rows[0].draft,{draft:'preserved'});
 });
 await t.test('older signed Apple data never overwrites newer, and one subscription binds to one realtor',async()=>{
  const newer=paid();await apply(newer);
  const stale=await apply(paid({signed_at:new Date(Date.parse(newer.signed_at)-60000).toISOString(),expires_at:new Date(Date.now()-1000).toISOString()}));
  assert.equal(stale.stale,true);assert.equal((await state()).active,true);
  assert.equal((await apply(paid(),OTHER)).reason,'other_account');
 });
 await t.test('turning off auto-renew keeps service through the Apple expiry date',async()=>{
  const off=paid({auto_renew:false});await apply(off);const s=await state();assert.equal(s.active,true);assert.equal(s.cancelAtPeriodEnd,true);assert.equal(Date.parse(s.serviceEnd),Date.parse(off.expires_at));
  await apply(paid());assert.equal((await state()).cancelAtPeriodEnd,false);
 });
 await t.test('a billing problem is reported only when Apple reports billing retry; service continues while Apple grants it',async()=>{
  await apply(paid({billing_issue:true}));const s=await state();assert.equal(s.paymentIssue,true);assert.equal(s.active,true);
  await apply(paid());assert.equal((await state()).paymentIssue,false);
 });
 await t.test('expiry never restores evaluation or locks anyone out; only new connections and service actions stop',async()=>{
  await disconnect(2);await apply(paid({expires_at:new Date(Date.now()-1000).toISOString(),auto_renew:false}));
  const s=await state();assert.equal(s.active,false);assert.equal(s.inactiveReason,'canceled');assert.equal(s.everPaid,true);assert.equal(s.limit,0);assert.equal(s.plan,'pro');assert.equal((await login(2)).reason,'inactive','a disconnected client cannot reconnect while inactive');assert.equal((await login(1)).ok,true,'an existing connected client still signs in');
  await as(uid(1));const a=await scalar('select public.experience_access($1) result',[R]);assert.equal(a.available,false);assert.equal(a.contact.email,'business@example.com');assert.equal(a.paymentIssue,undefined);assert.equal(a.status,undefined);
  await as(uid(1));assert.deepEqual(await scalar('select private.kv_read($1) result',[R+':messages.v1']),{history:['preserved']},'existing clients keep reading');await assert.rejects(query('select private.request_showing($1,$2,$3,$4,$5)',[R,'request','listing',0,30]),/unavailable/);
  await as(OWNER);assert.ok((await query('select * from public.app_kv')).rows.length>0);assert.ok((await query('select * from public.listing_sources')).rows.length>0);assert.ok((await query('select * from public.realtor_builds')).rows.length>0);const data=await scalar('select public.export_realtor_data($1) result',[R]);assert.ok(data.records[R+':messages.v1']);assert.deepEqual(data.build.draft,{draft:'preserved'});assert.equal(data.clientAccounts[0].pw_hash,undefined);
  await query('insert into storage.objects(name) values($1)',['allowed-upload']);await as(uid(1));await assert.rejects(query('select private.capture_public_lead($1,$2,$3,$4)',[R,'Client','client@example.com','555']),/unavailable/);
 });
 await t.test('reactivation restores only previously active relationships and existing invitations',async()=>{
  await apply(paid());assert.equal((await state()).active,true);
  await as(uid(1));assert.equal(await scalar('select private.bound_client($1) result',[R]),'c1');await as(uid(2));assert.equal(await scalar('select private.bound_client($1) result',[R]),null);
  await admin();assert.equal((await query('select client_code from public.realtors where id=$1',[R])).rows[0].client_code,'INVITE');
 });
 await t.test('cross-realtor access and client billing writes are rejected',async()=>{
  await as(OWNER);await assert.rejects(query('select public.realtor_seat_state($1)',[OTHER]),/authorized/);await assert.rejects(query('select public.export_realtor_data($1)',[OTHER]),/authorized/);await assert.rejects(query('select public.disconnect_client($1,$2)',[OTHER,'c1']),/authorized/);
  await as(uid(1));await assert.rejects(query('select public.apple_apply($1,$2)',[R,paid()]),/permission denied/);await assert.rejects(query('select * from private.realtor_entitlements'),/permission denied/);assert.equal(await scalar('select private.bound_client($1) result',[OTHER]),null);
  await as(OWNER);await assert.rejects(query('select public.apple_apply($1,$2)',[R,paid()]),/permission denied/,'a realtor cannot grant themselves a subscription');
 });
});
