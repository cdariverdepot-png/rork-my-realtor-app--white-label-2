import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { configured, offer, annualSavings, subscriptionSnapshot, verifySignature, type BillingConfig } from './core.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,stripe-signature','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const env=(key:string)=>Deno.env.get(key)??'';
const config=():BillingConfig=>({enabled:env('BILLING_TEST_ENABLED')==='true',secret:env('STRIPE_TEST_SECRET_KEY'),webhookSecret:env('STRIPE_TEST_WEBHOOK_SECRET'),monthPrice:env('STRIPE_TEST_MONTH_PRICE_ID'),yearPrice:env('STRIPE_TEST_YEAR_PRICE_ID'),origin:env('BILLING_WEB_ORIGIN').replace(/\/$/,''),failurePolicy:env('BILLING_PAYMENT_FAILURE_POLICY')});
async function stripe(c:BillingConfig,path:string,method='GET',body?:URLSearchParams,idempotency?:string){
 const headers:Record<string,string>={Authorization:`Bearer ${c.secret}`,'Stripe-Version':'2025-06-30.basil'};
 if(body)headers['Content-Type']='application/x-www-form-urlencoded';if(idempotency)headers['Idempotency-Key']=idempotency;
 const r=await fetch(`https://api.stripe.com/v1/${path}`,{method,headers,body,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('Payment provider unavailable');return r.json();
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json(405,{error:'POST required'});
 const c=config(), db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
 async function rpc(name:string,args:Record<string,unknown>){const {data,error}=await db.rpc(name,args);if(error)throw new Error('Billing state unavailable');return data;}
 async function reconcile(rid:string,subId:string,eventId:string|null){
  for(let attempt=0;attempt<4;attempt++){
   const state=await rpc('billing_snapshot',{p_realtor_id:rid});
   const sub=await stripe(c,`subscriptions/${encodeURIComponent(subId)}?expand[]=latest_invoice`);
   if(sub.latest_invoice?.lines?.has_more)throw new Error('Invoice requires complete reconciliation');
   // Always retrieve canonical provider state; never grant access from redirect parameters or event object status.
   const snapshot=subscriptionSnapshot(sub,state.provider_customer_id,c);
   const result=await rpc('billing_apply',{p_realtor_id:rid,p_expected_revision:state.revision,p_event_id:eventId,p_snapshot:snapshot});
   if(result.ok)return; if(!result.retry)throw new Error('Billing reconciliation unavailable');
  }throw new Error('Billing is updating; please retry');
 }
 try{
  const raw=await req.text();if(raw.length>1000000)return json(413,{error:'Request too large'});
  const isWebhook=req.headers.has('stripe-signature');
  if(isWebhook){
   if(!configured(c))return json(503,{error:'Test billing is not configured'});
   if(!await verifySignature(raw,req.headers.get('stripe-signature')??'',c.webhookSecret))return json(400,{error:'Invalid signature'});
   const event=JSON.parse(raw);if(event.livemode!==false||typeof event.id!=='string'||!/^evt_[A-Za-z0-9]+$/.test(event.id))return json(400,{error:'Invalid test event'});
   if(!['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'].includes(event.type))return json(200,{received:true});
   const customer=event.data?.object?.customer;
   if(typeof customer!=='string')return json(400,{error:'Customer missing'});
   // Resolve ownership from our server-owned customer mapping, not webhook metadata supplied by a checkout caller.
   const mapping=await rpc('billing_customer',{p_customer_id:customer});
   if(!mapping)return json(200,{received:true});
   const object=event.data.object;
   const subId=event.type.startsWith('customer.subscription.')?object.id:object.subscription??object.parent?.subscription_details?.subscription??mapping.provider_subscription_id;
   if(!subId)return json(200,{received:true});
   // An event for an old canceled subscription must not replace the current subscription after reactivation.
   if(mapping.provider_subscription_id && subId!==mapping.provider_subscription_id){
    const current=await stripe(c,`subscriptions/${mapping.provider_subscription_id}`);
    if(!['canceled','incomplete_expired'].includes(current.status))return json(200,{received:true});
   }
   await reconcile(mapping.realtor_id,subId,event.id);return json(200,{received:true});
  }
  const input=JSON.parse(raw),jwt=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')??'';
  const {data:auth,error:authError}=await db.auth.getUser(jwt);if(authError||!auth.user)return json(401,{error:'Sign in required'});
  const {data:owner,error}=await db.from('realtors').select('id').eq('auth_user_id',auth.user.id).maybeSingle();
  if(error||!owner||input.realtorId!==owner.id)return json(403,{error:'Only the account owner can manage billing'});
  const userDb=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false}});
  const readStatus=async()=>{const {data,error}=await userDb.rpc('realtor_seat_state',{p_realtor_id:owner.id});if(error)throw new Error('Account status unavailable');return data;};
  if(input.action==='status'){
   let prices:null|unknown=null;
   if(configured(c)){const month=offer(await stripe(c,`prices/${c.monthPrice}`),'month'),year=offer(await stripe(c,`prices/${c.yearPrice}`),'year');prices={month,year,savings:annualSavings(month,year)};}
   return json(200,{state:await readStatus(),configured:configured(c)&&!!prices,mode:'test',prices});
  }
  if(!configured(c))return json(503,{error:'Subscription checkout is not configured'});
  if(auth.user.is_anonymous||!auth.user.email_confirmed_at)return json(403,{error:'Verify your realtor account before using test billing'});
  if(input.action==='refresh'){
   const b=await rpc('billing_snapshot',{p_realtor_id:owner.id});
   let subId=b.provider_subscription_id;
   if(b.provider_customer_id){
    const subs=await stripe(c,`subscriptions?customer=${encodeURIComponent(b.provider_customer_id)}&status=all&limit=100`);
    if(subs.has_more)throw new Error('Subscription history requires reconciliation');
    const active=subs.data.filter((s:any)=>!['canceled','incomplete_expired'].includes(s.status));
    if(active.length>1)throw new Error('Multiple subscriptions require review');
    if(active.length===1)subId=active[0].id;
   }
   if(subId)await reconcile(owner.id,subId,null);
   return json(200,{state:await readStatus()});
  }
  if(input.action==='manage'||input.action==='cancel'||input.action==='resume'){
   const b=await rpc('billing_snapshot',{p_realtor_id:owner.id});if(!b.provider_customer_id)return json(409,{error:'No subscription to manage'});
   if(input.action==='manage'){
    const portal=await stripe(c,'billing_portal/sessions','POST',new URLSearchParams({customer:b.provider_customer_id,return_url:`${c.origin}/admin/plans`}));
    return json(200,{url:portal.url});
   }
   if(!b.provider_subscription_id)return json(409,{error:'No subscription to manage'});
   const sub=await stripe(c,`subscriptions/${b.provider_subscription_id}`);
   if(['canceled','incomplete_expired'].includes(sub.status))return json(409,{error:'Start a new subscription to reactivate'});
   await stripe(c,`subscriptions/${b.provider_subscription_id}`,'POST',new URLSearchParams({cancel_at_period_end:input.action==='cancel'?'true':'false'}));
   await reconcile(owner.id,b.provider_subscription_id,null);return json(200,{state:await readStatus()});
  }
  if(input.action!=='checkout'||!['month','year'].includes(input.interval))return json(400,{error:'Unknown billing action'});
  const priceId=input.interval==='month'?c.monthPrice:c.yearPrice;
  offer(await stripe(c,`prices/${priceId}`),input.interval);
  const b=await rpc('billing_checkout',{p_realtor_id:owner.id,p_customer_id:null,p_session_id:null,p_request_key:null});
  if(!b.ok){
   if(b.session){const existing=await stripe(c,`checkout/sessions/${b.session}`);if(existing.status==='open')return json(200,{url:existing.url});}
   return json(409,{error:'A checkout is already being prepared. Refresh account status before trying again.'});
  }
  const customer=b.provider_customer_id??(await stripe(c,'customers','POST',new URLSearchParams({'metadata[realtor_id]':owner.id}),`realtor-customer-${owner.id}`)).id;
  // Retain the customer before accepting payment, including if the response is interrupted.
  await rpc('billing_checkout',{p_realtor_id:owner.id,p_customer_id:customer,p_session_id:b.checkout_session_id,p_request_key:b.checkout_key});
  const subscriptions=await stripe(c,`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`);
  if(subscriptions.has_more||subscriptions.data.some((s:any)=>!['canceled','incomplete_expired'].includes(s.status)))return json(409,{error:'Manage your existing subscription instead of starting another'});
  if(b.checkout_session_id){const old=await stripe(c,`checkout/sessions/${b.checkout_session_id}`);if(old.status==='open')return json(200,{url:old.url});}
  const params=new URLSearchParams({mode:'subscription',customer,'line_items[0][price]':priceId,'line_items[0][quantity]':'1',success_url:`${c.origin}/admin/plans?checkout=returned`,cancel_url:`${c.origin}/admin/plans`,expires_at:String(Math.floor(Date.now()/1000)+1800),'subscription_data[metadata][realtor_id]':owner.id});
  const checkout=await stripe(c,'checkout/sessions','POST',params,`realtor-checkout-${owner.id}-${b.checkout_key}`);
  await rpc('billing_checkout',{p_realtor_id:owner.id,p_customer_id:customer,p_session_id:checkout.id,p_request_key:b.checkout_key});
  return json(200,{url:checkout.url});
 }catch(error){console.error('[billing]',error instanceof Error?error.message:'request failed');return json(503,{error:'Billing is temporarily unavailable. Your saved app and client data are retained.'});}
});
