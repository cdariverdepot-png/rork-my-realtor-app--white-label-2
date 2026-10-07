// Subscription regression against a replica of the LIVE production schema and function bodies.
// Proves the migration applies to production unchanged and that billing state restricts paid
// service actions only — never sign-in, navigation, reads, or existing client relationships.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const R='11111111-1111-4111-8111-111111111111',OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const uid=n=>`cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12,'0')}`;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const url=process.env.PGTEST_DATABASE_URL;

test('live-replica subscription lifecycle restricts service actions, never access',{skip:!url&&'Requires PGTEST_DATABASE_URL (PostgreSQL with pgcrypto).'},async t=>{
 if(!/localhost|127\.0\.0\.1/.test(url))throw new Error('Tests require an isolated local PostgreSQL database');
 const {Client}=require('pg');
 const name='replica_'+crypto.randomBytes(4).toString('hex');
 const root=new Client({connectionString:url});await root.connect();await root.query(`create database ${name}`);
 const u=new URL(url);u.pathname='/'+name;const db=new Client({connectionString:u.toString()});await db.connect();
 t.after(async()=>{await db.end();await root.query(`drop database if exists ${name}`);await root.end();});
 const query=(sql,params)=>db.query(sql,params);
 const scalar=async(sql,params)=>(await query(sql,params)).rows[0].result;
 const as=async id=>{await query('set role authenticated');await query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
 const admin=async()=>{await query('reset role');await query("select set_config('request.jwt.claim.sub','',false)");};
 const exec=sql=>db.query(sql);
 await exec(fs.readFileSync(path.join(__dirname,'live-replica-baseline.sql'),'utf8'));
 // Production-shaped data that exists BEFORE the migration: one realtor with three existing clients.
 await admin();
 await query("insert into public.realtors(id,email,name,password_hash,client_code,client_code_enabled,auth_user_id) values($1,'cindy@example.com','Cindy','x','INVITE',true,$2)",[R,OWNER]);
 for(const n of [1,2,3])await query("insert into public.client_accounts(realtor_id,email,pw_hash,client_id,name) values($1,$2,extensions.crypt($3,extensions.gen_salt('bf',4)),$4,$5)",[R,`c${n}@example.com`,hash('pw'+n),`c${n}`,`Client ${n}`]);
 await query("insert into public.app_kv(key,value,rev) values($1,$2,1),($3,$4,1),($5,$6,1),($7,$8,1)",[
  R+':brand.v2',JSON.stringify({realtor:{name:'Cindy',email:'business@example.com',phone:'555-0100'}}),
  R+':listings.v2',JSON.stringify({items:[{id:'l1',title:'12 Pine St'}]}),
  R+':c1:chat.v1',JSON.stringify([{id:'m1',role:'client',text:'Hello',createdAt:1,read:false}]),
  R+':clients.v1',JSON.stringify([{id:'c1',name:'Client 1'}])]);
 // Apply the migration exactly as it will run in production.
 await exec(fs.readFileSync(path.join(__dirname,'../migrations/20261004061627_subscription_entitlements.sql'),'utf8'));
 await exec(fs.readFileSync(path.join(__dirname,'../migrations/20261007200000_apple_entitlements.sql'),'utf8'));

 const state=async()=>{await as(OWNER);return scalar('select public.realtor_seat_state($1) result',[R]);};
 const access=async id=>{await as(id);return scalar('select public.experience_access($1) result',[R]);};
 const login=async(n,auth=uid(n))=>{await as(auth);return scalar('select public.verify_client_account($1,$2,$3) result',[R,`c${n}@example.com`,hash('pw'+n)]);};
 const read=async(id,key)=>{await as(id);return scalar('select public.secure_kv_get($1) result',[key]);};
 const write=async(id,key,value)=>{await as(id);return query('select public.secure_kv_set($1,$2::jsonb,$3)',[key,JSON.stringify(value),Date.now()]);};
 const expire=async(fields="trial_started_at=now()-interval '8 days'")=>{await admin();await query(`update private.realtor_entitlements set ${fields} where realtor_id=$1`,[R]);};
 let signedAt=Date.now();
 const apple=async(over={})=>{await admin();await query("set role service_role");return scalar('select public.apple_apply($1,$2::jsonb) result',[R,JSON.stringify({original_transaction_id:'2000000000000001',product_id:'monthly',environment:'Sandbox',expires_at:new Date(Date.now()+30*86400000).toISOString(),revoked_at:null,signed_at:new Date(signedAt+=1000).toISOString(),auto_renew:true,billing_issue:false,...over})]);};
 const chat=async()=>(await read(OWNER,R+':c1:chat.v1')).value;

 await t.test('existing clients are backfilled as connected relationships and the trial starts now',async()=>{
  const s=await state();assert.equal(s.active,true);assert.equal(s.used,3);assert.equal(s.connections.length,3);assert.equal(s.inactiveReason,null);
  assert.ok(Date.parse(s.trialEnd)>Date.now()+6*86400000);
 });
 await t.test('active realtor retains full functionality',async()=>{
  for(const n of [1,2,3])assert.equal((await login(n)).ok,true);
  await write(OWNER,R+':brand.v2',{realtor:{name:'Cindy',email:'business@example.com',phone:'555-0100'},published:2});
  const history=await chat();await write(OWNER,R+':c1:chat.v1',[...history,{id:'m2',role:'realtor',text:'Hi',createdAt:2}]);
  await write(uid(1),R+':c1:chat.v1',[{id:'m3',role:'client',text:'Thanks',createdAt:3}]);
  assert.deepEqual((await chat()).map(m=>m.id).sort(),['m1','m2','m3']);
  assert.equal((await access(OWNER)).available,true);assert.equal((await access(uid(1))).available,true);
  await as(OWNER);assert.equal(await scalar('select public.authorize_push($1,$2) result',[R,'client']),true);
 });
 await t.test('trial expiration restricts service actions without any lockout',async()=>{
  await expire();
  const s=await state();assert.equal(s.active,false);assert.equal(s.inactiveReason,'trial_ended');assert.equal(s.paymentIssue,false);
  assert.equal(s.connections.length,3,'existing relationships survive');
  // Realtor still reads everything.
  assert.equal((await read(OWNER,R+':listings.v2')).value.items[0].id,'l1');assert.equal((await read(OWNER,R+':clients.v1')).value[0].id,'c1');
  assert.equal((await chat()).length,3);
  await as(OWNER);assert.ok((await query('select key from public.app_kv')).rows.length>=4,'no billing RLS hides owner rows');
  // Drafts and ordinary account records remain writable.
  await write(OWNER,R+':brand.design-draft.v1',{draft:true});await write(OWNER,R+':clients.v1',[{id:'c1',name:'Client One'}]);
  // Publishing and new realtor messages are refused server-side.
  await assert.rejects(write(OWNER,R+':brand.v2',{realtor:{name:'Changed'}}),/Publishing is unavailable/);
  await assert.rejects(write(OWNER,R+':c1:chat.v1',[...await chat(),{id:'m4',role:'realtor',text:'New',createdAt:4}]),/Messaging is unavailable/);
  // Read receipts on existing history still work.
  await write(OWNER,R+':c1:chat.v1',(await chat()).map(m=>({...m,read:true})));
  assert.ok((await chat()).every(m=>m.read===true));
  assert.equal((await access(OWNER)).available,false);
  await as(OWNER);assert.equal(await scalar('select public.authorize_push($1,$2) result',[R,'client']),false);
 });
 await t.test('existing clients keep signing in, reading and completing their profile while the realtor is inactive',async()=>{
  assert.equal((await login(1)).ok,true);assert.equal((await login(2,uid(20))).ok,true,'existing client on a new device');
  await as(uid(1));assert.deepEqual(await scalar('select public.current_client_identity() result'),{realtorId:R,clientId:'c1'});
  assert.equal((await read(uid(1),R+':listings.v2')).value.items[0].id,'l1');assert.equal((await read(uid(1),R+':brand.v2')).value.realtor.name,'Cindy');
  assert.equal((await read(uid(1),R+':c1:chat.v1')).value.length,3,'client reads existing history');
  await write(uid(1),R+':clientProfiles.v1',{c1:{clientId:'c1',name:'Client 1',moving:'Spring'}});
  assert.equal((await read(uid(1),R+':clientProfiles.v1')).value.c1.moving,'Spring');
  await write(uid(1),R+':c1:favorites.v1',['l1']);
  const a=await access(uid(1));assert.equal(a.available,false);assert.equal(a.contact.email,'business@example.com');
  for(const k of ['paymentIssue','status','serviceEnd','trialEnd','inactiveReason','publicAvailable'])assert.equal(a[k],undefined,`client never sees ${k}`);
 });
 await t.test('client-initiated communication and new connections are refused while inactive',async()=>{
  await assert.rejects(write(uid(1),R+':c1:chat.v1',[{id:'m5',role:'client',text:'Hello?',createdAt:5}]),/Messaging is unavailable/);
  await as(uid(1));await assert.rejects(query('select public.request_public_showing($1,$2,$3,$4,$5)',[R,'req1','l1',Date.now()+86400000,30]),/Service unavailable/);
  await as(uid(9));const r=await scalar('select public.register_client_account($1,$2,$3,$4,$5) result',[R,'new@example.com',hash('new'),'c9','New']);
  assert.equal(r.reason,'inactive');assert.equal(r.account_created,true);
  assert.equal((await state()).used,3,'no new active relationship');
 });
 await t.test('Apple billing retry, cancellation, expiry and refund report accurate reasons and never lock anyone out',async()=>{
  const past=new Date(Date.now()-86400000).toISOString();
  await apple({expires_at:past,billing_issue:true});
  let s=await state();assert.equal(s.active,false);assert.equal(s.inactiveReason,'billing_retry');assert.equal((await login(1)).ok,true);
  await apple({expires_at:past,billing_issue:false,auto_renew:false});s=await state();assert.equal(s.inactiveReason,'canceled');
  await apple({expires_at:past,auto_renew:true});s=await state();assert.equal(s.inactiveReason,'expired');
  await apple({expires_at:past,revoked_at:past});s=await state();assert.equal(s.inactiveReason,'revoked');
  assert.equal((await read(uid(1),R+':listings.v2')).value.items.length,1);
 });
 await t.test('restoring service restores restricted actions without recreating clients or data',async()=>{
  await apple({revoked_at:null});
  const s=await state();assert.equal(s.active,true);assert.equal(s.limit,-1);assert.equal(s.connections.length,3);
  await write(OWNER,R+':brand.v2',{realtor:{name:'Cindy Restored'}});
  await write(uid(1),R+':c1:chat.v1',[{id:'m6',role:'client',text:'Back',createdAt:6}]);
  assert.ok((await chat()).some(m=>m.id==='m6'));
  await as(uid(9));assert.equal((await scalar('select public.verify_client_account($1,$2,$3) result',[R,'new@example.com',hash('new')])).ok,true);assert.equal(await scalar('select private.bound_client($1) result',[R]),'c9','previously refused client can now connect');
 });
 await t.test('anon cannot call any entitlement or billing function',async()=>{
  await admin();await query('set role anon');
  for(const sql of ["select public.experience_access('"+R+"')","select public.realtor_seat_state('"+R+"')","select public.realtor_service_active('"+R+"')","select public.apple_apply('"+R+"','{}')"])
   await assert.rejects(query(sql),/permission denied/);
  await admin();await as(OWNER);await assert.rejects(query("select public.apple_apply($1,'{}'::jsonb)",[R]),/permission denied/);
 });
});
