const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function loader(stubs={},context={}){
 const cache=new Map();
 const load=file=>{
  file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
  const m={exports:{}};cache.set(file,m);
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  new Function('require','module','exports',...Object.keys(context),source)(id=>{
   if(id in stubs)return stubs[id];
   if(id.startsWith('@/'))return load(path.join(root,'expo',id.slice(2)+'.ts'));
   if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(!/\.tsx?$/.test(p))p+='.ts';return load(p);}
   return require(id);
  },m,m.exports,...Object.values(context));return m.exports;
 };return load;
}
const core=loader()(path.join(root,'supabase/functions/billing/core.ts'));
const c={enabled:true,secret:'sk_test_fixture',webhookSecret:'whsec_fixture',monthPrice:'price_month',yearPrice:'price_year',origin:'https://app.example.com',failurePolicy:'paid_period'};
const price=interval=>({id:interval==='month'?c.monthPrice:c.yearPrice,livemode:false,active:true,type:'recurring',currency:'usd',unit_amount:interval==='month'?4900:49000,recurring:{interval,interval_count:1}});
const end=Math.floor(Date.now()/1000)+86400*30;
const sub=interval=>({id:'sub_test',livemode:false,customer:'cus_test',status:'active',cancel_at_period_end:false,items:{data:[{quantity:1,price:price(interval),current_period_end:end}]},latest_invoice:{id:'in_test',livemode:false,status:'paid',customer:'cus_test',parent:{subscription_details:{subscription:'sub_test'}},lines:{data:[{pricing:{price_details:{price:price(interval).id}},parent:{subscription_item_details:{proration:false}},period:{start:end-86400*30,end}}]}}});
async function signature(raw,secret=c.webhookSecret){const t=Math.floor(Date.now()/1000);const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const s=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(`${t}.${raw}`));return `t=${t},v1=${Buffer.from(s).toString('hex')}`;}
test('billing requires complete test configuration and the approved USD recurring amounts',()=>{
 assert.equal(core.configured(c),true);
 for(const change of [{enabled:false},{secret:'sk_live_disabled'},{webhookSecret:''},{monthPrice:''},{yearPrice:c.monthPrice},{origin:'http://app.example.com'},{failurePolicy:''}])assert.equal(core.configured({...c,...change}),false);
 assert.equal(core.offer(price('month'),'month').total,'$49.00');assert.equal(core.offer(price('year'),'year').total,'$490.00');assert.match(core.annualSavings(core.offer(price('month'),'month'),core.offer(price('year'),'year')),/98.*two months/);
 for(const change of [{livemode:true},{active:false},{unit_amount:5000},{currency:'eur'},{recurring:{interval:'year',interval_count:1}}])assert.throws(()=>core.offer({...price('month'),...change},'month'));
});
test('current Stripe invoice format and both intervals grant only verified paid periods',()=>{
 for(const interval of ['month','year']){const s=sub(interval);const r=core.subscriptionSnapshot(s,'cus_test',c);assert.equal(r.interval,interval);assert.equal(Date.parse(r.paid_through),end*1000);
  for(const invoice of [undefined,{...s.latest_invoice,status:'open'},{...s.latest_invoice,customer:'cus_other'},{...s.latest_invoice,livemode:true},{...s.latest_invoice,parent:{subscription_details:{subscription:'sub_other'}}}])assert.equal(core.subscriptionSnapshot({...s,latest_invoice:invoice},'cus_test',c).paid_through,null);
 }
 const s=sub('month');assert.throws(()=>core.subscriptionSnapshot({...s,livemode:true},'cus_test',c));assert.throws(()=>core.subscriptionSnapshot(s,'cus_other',c));assert.throws(()=>core.subscriptionSnapshot({...s,items:{data:[]}},'cus_test',c));
 const prorated=structuredClone(s);prorated.latest_invoice.lines.data[0].parent.subscription_item_details.proration=true;assert.equal(core.subscriptionSnapshot(prorated,'cus_test',c).paid_through,null);
 assert.equal(core.subscriptionSnapshot({...s,status:'past_due',latest_invoice:{...s.latest_invoice,status:'open'}},'cus_test',c).payment_issue,true);
});
test('webhook signatures reject modification, expired delivery and incorrect keys',async()=>{
 const raw=JSON.stringify({id:'evt_example',livemode:false});const signed=await signature(raw);assert.equal(await core.verifySignature(raw,signed,c.webhookSecret),true);assert.equal(await core.verifySignature(raw+' ',signed,c.webhookSecret),false);assert.equal(await core.verifySignature(raw,signed,'whsec_wrong'),false);assert.equal(await core.verifySignature(raw,signed,c.webhookSecret,Date.now()/1000+301),false);
});
test('seat/network failures never silently grant unlimited access; disconnect uses stable account ID',async()=>{
 let rpcName,args;
 const backend={rpc:async(name,input)=>{rpcName=name;args=input;return {data:null,error:{message:'offline'}};}};
 const seats=loader({'@/lib/supabase':{supabase:backend}})(path.join(root,'expo/lib/seats.ts'));
 assert.equal((await seats.claimClientSeat({realtorId:'r',clientId:'c',email:'client@example.com',name:'Client'})).ok,false);assert.equal(await seats.fetchSeatState('r'),null);
 backend.rpc=async(name,input)=>{rpcName=name;args=input;return {data:{ok:true},error:null};};assert.equal(await seats.releaseClientSeat('r','stable-account'),true);assert.equal(rpcName,'disconnect_client');assert.equal(args.p_client_id,'stable-account');assert.equal(args.p_client_key,undefined);
});
test('evaluation, custom fee, upfront annual billing and working inquiry remain consistent',()=>{
 const {PLAN_TIERS,CUSTOM_SETUP_PRICE,CUSTOM_INQUIRY_URL}=loader()(path.join(root,'expo/constants/plans.ts'));
 assert.equal(CUSTOM_SETUP_PRICE,'$499');const custom=PLAN_TIERS.find(t=>t.id==='bespoke');assert.match(custom.altPrice,/required.*49\/month.*490\/year, billed annually/);assert.match(custom.features.join(' '),/Hosting.*standard platform updates.*bug fixes.*separately quoted/);assert.match(custom.features.join(' '),/own Apple Developer account.*membership.*separate cost/);assert.match(CUSTOM_INQUIRY_URL,/^mailto:hello@myrealtorapp.com\?subject=/);
 const evalTier=PLAN_TIERS.find(t=>t.id==='evaluation');assert.match(evalTier.features.join(' '),/All standard features for 7 days.*3 connected.*No payment details.*pending invitations do not count/);assert.match(evalTier.priceNote,/7 days/);assert.match(PLAN_TIERS.find(t=>t.id==='pro').altPrice,/490\/year, billed annually.*40\.83.*98/);
});
test('billing handler verifies owner, canonical events, duplicate checkout and delayed payment refresh',async()=>{
 const rid='11111111-1111-4111-8111-111111111111';let handler,canonical=sub('month'),state={realtor_id:rid,provider_customer_id:null,provider_subscription_id:null,revision:0},checkout=null,events=new Set(),created=0;
 const env={BILLING_TEST_ENABLED:'true',STRIPE_TEST_SECRET_KEY:c.secret,STRIPE_TEST_WEBHOOK_SECRET:c.webhookSecret,STRIPE_TEST_MONTH_PRICE_ID:c.monthPrice,STRIPE_TEST_YEAR_PRICE_ID:c.yearPrice,BILLING_WEB_ORIGIN:c.origin,BILLING_PAYMENT_FAILURE_POLICY:c.failurePolicy,SUPABASE_URL:'https://supabase.example',SUPABASE_SERVICE_ROLE_KEY:'fixture',SUPABASE_ANON_KEY:'anon'};
 const db={auth:{getUser:async jwt=>({data:{user:jwt==='owner'?{id:'owner',email_confirmed_at:'yes'}:jwt==='client'?{id:'client'}:null},error:null})},from:()=>({select:()=>({eq:(_key,id)=>({maybeSingle:async()=>({data:id==='owner'?{id:rid}:null,error:null})})})}),rpc:async(name,a)=>{
  let data;
  if(name==='realtor_seat_state')data={ok:true,active:true,limit:state.paid_through?-1:3};
  else if(name==='billing_snapshot')data={...state};
  else if(name==='billing_customer')data=state.provider_customer_id===a.p_customer_id?{realtor_id:rid,provider_subscription_id:state.provider_subscription_id}:null;
  else if(name==='billing_checkout'){
   if(!a.p_request_key && state.checkout_key)data={ok:false,busy:true,session:state.checkout_session_id};
   else{state={...state,checkout_key:'checkout-key',provider_customer_id:a.p_customer_id??state.provider_customer_id,checkout_session_id:a.p_session_id??state.checkout_session_id};data={...state,ok:true};}
  }else if(name==='billing_apply'){
   if(events.has(a.p_event_id))data={ok:true,duplicate:true};else if(a.p_expected_revision!==state.revision)data={ok:false,retry:true};else{state={...state,...a.p_snapshot,provider_subscription_id:a.p_snapshot.subscription,revision:state.revision+1};if(a.p_event_id)events.add(a.p_event_id);data={ok:true};}
  }else throw new Error(name);return {data,error:null};
 }};
 const provider=async(url,options={})=>{
  const u=new URL(url),p=u.pathname.replace('/v1/','');let data;
  if(p.startsWith('prices/'))data=price(p.endsWith(c.monthPrice)?'month':'year');
  else if(p==='customers')data={id:'cus_test'};
  else if(p==='subscriptions')data={data:checkout?.status==='complete'?[canonical]:[],has_more:false};
  else if(p.startsWith('subscriptions/')){if(options.method==='POST')canonical.cancel_at_period_end=options.body.get('cancel_at_period_end')==='true';data=canonical;}
  else if(p==='checkout/sessions'){created++;assert.equal(options.body.get('line_items[0][price]'),c.monthPrice);assert.equal(options.body.get('success_url'),c.origin+'/admin/plans?checkout=returned');checkout={id:'cs_test',url:'https://checkout.stripe.com/c/pay/test',status:'open'};data=checkout;}
  else if(p.startsWith('checkout/sessions/'))data=checkout;
  else if(p==='billing_portal/sessions')data={url:'https://billing.stripe.com/p/session/test'};
  else throw new Error(p);return new Response(JSON.stringify(data),{status:200});
 };
 loader({'npm:@supabase/supabase-js@2.95.3':{createClient:()=>db}},{Deno:{env:{get:k=>env[k]},serve:fn=>{handler=fn;}},fetch:provider})(path.join(root,'supabase/functions/billing/index.ts'));
 const request=async(action,jwt='owner',extra={})=>handler(new Request('https://edge.example/billing',{method:'POST',headers:{authorization:`Bearer ${jwt}`,'content-type':'application/json'},body:JSON.stringify({realtorId:rid,action,...extra})}));
 assert.equal((await request('status','')).status,401);assert.equal((await request('status','client')).status,403);assert.equal((await request('status','owner',{realtorId:'other'})).status,403);
 env.BILLING_TEST_ENABLED='false';assert.equal((await request('checkout','owner',{interval:'month'})).status,503);env.BILLING_TEST_ENABLED='true';
 assert.equal((await (await request('checkout','owner',{interval:'month',priceId:'price_forged'})).json()).url,checkout.url);await request('checkout','owner',{interval:'month'});assert.equal(created,1);assert.equal(state.paid_through,undefined);
 checkout.status='complete';await request('refresh');assert.equal(state.provider_subscription_id,'sub_test');assert.equal(Date.parse(state.paid_through),end*1000);
 const deliver=async event=>{const raw=JSON.stringify(event);return handler(new Request('https://edge.example/billing',{method:'POST',headers:{'stripe-signature':await signature(raw)},body:raw}));};
 const event={id:'evt_old',livemode:false,type:'customer.subscription.updated',data:{object:{id:'sub_test',customer:'cus_test',status:'canceled'}}};
 assert.equal((await deliver(event)).status,200);assert.equal(state.status,'active');const revision=state.revision;await deliver(event);assert.equal(state.revision,revision);
 const older={...event,id:'evt_oldsubscription',data:{object:{id:'sub_old',customer:'cus_test',status:'canceled'}}};assert.equal((await deliver(older)).status,200);assert.equal(state.provider_subscription_id,'sub_test');assert.equal(state.revision,revision);
 assert.equal((await deliver({...event,id:'evt_live',livemode:true})).status,400);assert.equal((await handler(new Request('https://edge.example/billing',{method:'POST',headers:{'stripe-signature':'invalid'},body:JSON.stringify(event)}))).status,400);
 await request('cancel');assert.equal(state.cancel_at_period_end,true);await request('resume');assert.equal(state.cancel_at_period_end,false);
});
