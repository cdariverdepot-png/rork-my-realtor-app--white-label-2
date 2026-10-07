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
 const state=async()=>{await as(OWNER);return scalar('select public.realtor_seat_state($1) result',[R]);};
 const login=async(n,password='password')=>{await as(uid(n));return scalar('select public.verify_client_account($1,$2,$3) result',[R,`c${n}@example.com`,password]);};
 const disconnect=async(n)=>{await as(OWNER);return scalar('select public.disconnect_client($1,$2) result',[R,`c${n}`]);};
 const snapshot=async()=>{await as('', 'service_role');return scalar('select public.billing_snapshot($1) result',[R]);};
 const paid={customer:'cus_test',subscription:'sub_test',status:'active',interval:'month',paid_through:new Date(Date.now()+86400000*30).toISOString(),period_end:new Date(Date.now()+86400000*30).toISOString(),cancel_at_period_end:false,payment_issue:false};
 const apply=async(value,event=null,revision)=>{const b=await snapshot();return scalar('select public.billing_apply($1,$2,$3,$4) result',[R,revision??b.revision,event,value]);};
 await t.test('contacts, pending invitations and failed authentication consume no seats',async()=>{
  assert.equal((await state()).used,0); assert.equal((await state()).active,true);
  await admin();for(let n=1;n<=6;n++)await query('insert into public.client_accounts values($1,$2,$3,$4,$5)',[R,`c${n}`,`c${n}@example.com`,'password',`Client ${n}`]);
  assert.equal((await login(1,'wrong')).reason,'bad_password');assert.equal((await state()).used,0);
  await as(uid(1));const spoof=await scalar('select public.claim_client_seat($1,$2,$3,$4) result',[R,'spoof@example.com','forged','Forged']);assert.equal(spoof.ok,false);assert.equal((await state()).used,0);
 });
 await t.test('evaluation expires after seven days and can be restored for the remaining lifecycle tests',async()=>{
  await admin();await query("update private.billing_accounts set trial_started_at=now()-interval '8 days' where realtor_id=$1",[R]);
  assert.equal((await state()).active,false);assert.equal((await login(1)).reason,'inactive');
  await admin();await query("update private.billing_accounts set trial_started_at=now() where realtor_id=$1",[R]);assert.equal((await state()).active,true);
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
 await t.test('verified billing unlocks unlimited monthly or annual access without replacing records',async()=>{
  const b=await snapshot();await scalar('select public.billing_checkout($1,null,null,null) result',[R]);const checkout=await snapshot();await scalar('select public.billing_checkout($1,$2,null,$3) result',[R,'cus_test',checkout.checkout_key]);
  assert.equal((await apply(paid,'evt_paid')).ok,true);assert.equal((await state()).limit,-1);assert.equal((await login(6)).ok,true);
  assert.equal((await apply({...paid,interval:'year'},'evt_annual')).ok,true);assert.equal((await state()).limit,-1);assert.equal((await state()).interval,'year');
  await as(OWNER);const exported=await scalar('select public.export_realtor_data($1) result',[R]);assert.deepEqual(exported.records[R+':messages.v1'],{history:['preserved']});assert.equal(exported.records[R+':auth.secret'],undefined);assert.equal(exported.records[OTHER+':brand.v2'],undefined);assert.equal(exported.listingSources[0].headers,undefined);
  await admin();assert.equal((await query('select client_code from public.realtors where id=$1',[R])).rows[0].client_code,'INVITE');assert.deepEqual((await query('select draft from public.realtor_builds where auth_user_id=$1',[OWNER])).rows[0].draft,{draft:'preserved'});
 });
 await t.test('duplicate events are harmless and stale reconciliation retries',async()=>{
  const old=await snapshot();assert.equal((await apply(paid,'evt_paid')).duplicate,true);assert.equal((await snapshot()).revision,old.revision);
  await apply(paid,'evt_fresh');assert.equal((await apply({...paid,status:'canceled'},'evt_stale',old.revision)).retry,true);assert.equal((await state()).active,true);
 });
 await t.test('scheduled cancellation and reversal retain access through the paid date',async()=>{
  await apply({...paid,cancel_at_period_end:true},'evt_cancel');assert.equal((await state()).active,true);assert.equal((await state()).cancelAtPeriodEnd,true);assert.equal(Date.parse((await state()).serviceEnd),Date.parse(paid.paid_through));
  await apply(paid,'evt_resume');assert.equal((await state()).cancelAtPeriodEnd,false);
 });
 await t.test('failure uses already-paid access and provider recovery; no grace is invented',async()=>{
  await apply({...paid,status:'past_due',paid_through:null,payment_issue:true},'evt_failure');const s=await state();assert.equal(s.paymentIssue,true);assert.equal(s.active,true);assert.equal(Date.parse(s.serviceEnd),Date.parse(paid.paid_through));
  await apply(paid,'evt_recovered');assert.equal((await state()).paymentIssue,false);
 });
 await t.test('expiry never restores evaluation or locks anyone out; only new connections and service actions stop',async()=>{
  await disconnect(2);await admin();await query("update private.billing_accounts set status='canceled',paid_through=now()-interval '1 second' where realtor_id=$1",[R]);
  const s=await state();assert.equal(s.active,false);assert.equal(s.everPaid,true);assert.equal(s.limit,0);assert.equal(s.plan,'pro');assert.equal((await login(2)).reason,'inactive','a disconnected client cannot reconnect while inactive');assert.equal((await login(1)).ok,true,'an existing connected client still signs in');
  await as(uid(1));const a=await scalar('select public.experience_access($1) result',[R]);assert.equal(a.available,false);assert.equal(a.contact.email,'business@example.com');assert.equal(a.paymentIssue,undefined);assert.equal(a.status,undefined);
  await as(uid(1));assert.deepEqual(await scalar('select private.kv_read($1) result',[R+':messages.v1']),{history:['preserved']},'existing clients keep reading');await assert.rejects(query('select private.request_showing($1,$2,$3,$4,$5)',[R,'request','listing',0,30]),/unavailable/);
  await as(OWNER);assert.ok((await query('select * from public.app_kv')).rows.length>0);assert.ok((await query('select * from public.listing_sources')).rows.length>0);assert.ok((await query('select * from public.realtor_builds')).rows.length>0);const data=await scalar('select public.export_realtor_data($1) result',[R]);assert.ok(data.records[R+':messages.v1']);assert.deepEqual(data.build.draft,{draft:'preserved'});assert.equal(data.clientAccounts[0].pw_hash,undefined);
  await query('insert into storage.objects(name) values($1)',['allowed-upload']);await as(uid(1));await assert.rejects(query('select private.capture_public_lead($1,$2,$3,$4)',[R,'Client','client@example.com','555']),/unavailable/);
 });
 await t.test('reactivation restores only previously active relationships and existing invitations',async()=>{
  await apply({...paid,subscription:'sub_reactivated'},'evt_reactivated');assert.equal((await state()).active,true);
  await as(uid(1));assert.equal(await scalar('select private.bound_client($1) result',[R]),'c1');await as(uid(2));assert.equal(await scalar('select private.bound_client($1) result',[R]),null);
  await admin();assert.equal((await query('select client_code from public.realtors where id=$1',[R])).rows[0].client_code,'INVITE');
 });
 await t.test('cross-realtor access and client billing writes are rejected',async()=>{
  await as(OWNER);await assert.rejects(query('select public.realtor_seat_state($1)',[OTHER]),/authorized/);await assert.rejects(query('select public.export_realtor_data($1)',[OTHER]),/authorized/);await assert.rejects(query('select public.disconnect_client($1,$2)',[OTHER,'c1']),/authorized/);
  await as(uid(1));await assert.rejects(query('select public.billing_snapshot($1)',[R]),/permission denied/);await assert.rejects(query('select * from private.billing_accounts'),/permission denied/);assert.equal(await scalar('select private.bound_client($1) result',[OTHER]),null);
  await as(OWNER);await assert.rejects(query('select public.billing_apply($1,$2,$3,$4)',[R,0,'evt_spoof',paid]),/permission denied/);
 });
});
