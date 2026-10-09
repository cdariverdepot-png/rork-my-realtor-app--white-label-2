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
test('subscription state never globally gates realtor or client navigation',()=>{
 const layout=fs.readFileSync(path.join(root,'expo/app/_layout.tsx'),'utf8');
 const gate=fs.readFileSync(path.join(root,'expo/components/ServiceAccessGate.tsx'),'utf8');
 assert.doesNotMatch(layout,/ServiceAccessGate/);
 assert.doesNotMatch(gate,/experience_access|ownerBlocked|clientBlocked|currently unavailable/);
 assert.match(gate,/return <>{children}<\/?>/);
});
test('paid actions distinguish unknown entitlement and fail closed without blocking reads',()=>{
 const source=fs.readFileSync(path.join(root,'expo/lib/serviceEntitlement.ts'),'utf8');
 assert.match(source,/"active" \| "inactive" \| "unknown"/);
 assert.match(source,/if \(error \|\| typeof data\?\.available !== "boolean"\) return "unknown"/);
 for(const file of ['contexts/BrandContext.tsx','components/ChatThread.tsx','app/message.tsx','components/InvitationTools.tsx']){
  const body=fs.readFileSync(path.join(root,'expo',file),'utf8'); assert.match(body,/serviceEntitlement|seats\.tracked/);
 }
});
test('native subscription UI contains no private checkout path',()=>{
 const plans=fs.readFileSync(path.join(root,'expo/app/admin/plans.tsx'),'utf8');
 assert.doesNotMatch(plans,/billingRequest|verifiedBillingURL|TEST SUBSCRIPTION|checkout\.stripe/);
 assert.match(plans,/managed through Apple/);assert.match(plans,/RESTORE PURCHASES/);assert.match(plans,/MANAGE SUBSCRIPTION/);
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
 const evalTier=PLAN_TIERS.find(t=>t.id==='evaluation');assert.match(evalTier.features.join(' '),/All standard features for 7 days.*3 connected.*Free trial through the App Store; renews unless canceled.*pending invitations do not count/);assert.match(evalTier.priceNote,/7 days/);assert.match(PLAN_TIERS.find(t=>t.id==='pro').altPrice,/490\/year, billed annually.*40\.83.*98/);
});
test('entitlement lookup failures resolve to unknown, never inactive',async()=>{
 const cases=[[{data:null,error:{message:'function public.experience_access does not exist',code:'PGRST202'}},'unknown'],[{data:null,error:{message:'offline'}},'unknown'],[{data:{},error:null},'unknown'],[{data:{available:false},error:null},'inactive'],[{data:{available:true},error:null},'active']];
 for(const [reply,expected] of cases){
  const lib=loader({'@/lib/supabase':{supabase:{rpc:async()=>reply}}})(path.join(root,'expo/lib/serviceEntitlement.ts'));
  assert.equal(await lib.serviceEntitlement('r'),expected);
 }
 const thrown=loader({'@/lib/supabase':{supabase:{rpc:async()=>{throw new Error('network');}}}})(path.join(root,'expo/lib/serviceEntitlement.ts'));
 assert.equal(await thrown.serviceEntitlement('r'),'unknown');
});
test('owner service notice is accurate to the actual inactive reason',()=>{
 const {serviceNoticeCopy}=loader()(path.join(root,'expo/lib/serviceNotice.ts'));
 assert.equal(serviceNoticeCopy(null),null);
 assert.match(serviceNoticeCopy('billing_retry').title,/Apple couldn't renew/);
 assert.match(serviceNoticeCopy('billing_retry').body,/restore publishing and client communication/);
 for(const reason of ['not_subscribed','canceled','expired','refunded']){const c=serviceNoticeCopy(reason);assert.doesNotMatch(c.title+c.body,/payment/i,`${reason} never claims a payment failed`);assert.match(c.body,/remain available/);}
 assert.match(serviceNoticeCopy('not_subscribed').title,/7-day free trial/);assert.match(serviceNoticeCopy('refunded').title,/^Refunded/);assert.match(serviceNoticeCopy('expired').title,/^Expired/);assert.match(serviceNoticeCopy('canceled').title,/^Canceled/);
});
test('inactive or unknown seat state never becomes a lockout or a misleading capacity banner',()=>{
 const seats=fs.readFileSync(path.join(root,'expo/contexts/SeatsContext.tsx'),'utf8');
 assert.match(seats,/const serviceInactive = tracked && verified && !active;/);
 assert.match(seats,/const atLimit = tracked && !serviceInactive &&/);
 for(const file of ['components/OnboardingGuard.tsx','app/_layout.tsx','app/index.tsx']){
  const body=fs.readFileSync(path.join(root,'expo',file),'utf8');assert.doesNotMatch(body,/useSeats|experience_access|serviceEntitlement|realtor_seat_state/,`${file} startup/navigation is billing-independent`);
 }
});

test('Apple is the only payment path: no private checkout code and no fabricated product IDs',()=>{
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.name==='node_modules'||e.name.startsWith('.')?[]:e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 for(const file of [...walk(path.join(root,'expo/app')),...walk(path.join(root,'expo/components')),...walk(path.join(root,'expo/contexts')),...walk(path.join(root,'expo/lib')),...walk(path.join(root,'supabase/functions'))].filter(f=>/\.(ts|tsx)$/.test(f)))
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),/stripe|checkout\.session|card number/i,`${path.relative(root,file)} has no private payment path`);
 assert.equal(fs.existsSync(path.join(root,'supabase/functions/billing')),false);
 const config=fs.readFileSync(path.join(root,'expo/lib/appleSubscriptions.ts'),'utf8');
 assert.match(config,/process\.env\.EXPO_PUBLIC_IOS_SUBSCRIPTION_MONTHLY_ID/);assert.doesNotMatch(config,/"(com|app)\.[a-z]+\.[a-z_.]+"/,'no hard-coded product IDs');
 const lib=loader({'@/lib/supabase':{supabase:null,ensureSupabaseSession:async()=>{}}})(path.join(root,'expo/lib/appleSubscriptions.ts'));
 assert.equal(lib.appleSubscriptionsConfigured(),!!(process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_MONTHLY_ID||process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_ANNUAL_ID));
});
test('StoreKit loads only in the iOS bundle; web and Android never import it',()=>{
 const stub=fs.readFileSync(path.join(root,'expo/lib/storekit.ts'),'utf8'),ios=fs.readFileSync(path.join(root,'expo/lib/storekit.ios.ts'),'utf8');
 assert.doesNotMatch(stub,/expo-iap/);assert.match(stub,/storeKitAvailable = false/);
 assert.match(ios,/try \{ cached = require\("expo-iap"\) as typeof Iap; \} catch \{ cached = null; \}/,'native module loads lazily so Expo Go/preview clients never crash');assert.doesNotMatch(ios,/^import \{[^}]*\} from "expo-iap"/m);assert.match(ios,/appAccountToken: realtorId/);assert.match(ios,/finishTransaction\(\{ purchase: p\.raw as Purchase, isConsumable: false \}\)/);
 const hook=fs.readFileSync(path.join(root,'expo/lib/useAppleSubscription.ts'),'utf8');
 assert.match(hook,/if \(result\.ok\) for \(const p of purchases\) await finishPurchase/,'transactions finish only after server verification');
});
test('no global unavailable screen exists and demo/preview never load entitlement state',()=>{
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 for(const file of [...walk(path.join(root,'expo/app')),...walk(path.join(root,'expo/components'))])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/This app is currently unavailable/);
 const seats=fs.readFileSync(path.join(root,'expo/contexts/SeatsContext.tsx'),'utf8');
 assert.match(seats,/const tracked = isAdmin && !demoViewMode && !isDemoRealtor;/);
 const ent=fs.readFileSync(path.join(root,'expo/lib/serviceEntitlement.ts'),'utf8');assert.match(ent,/if \(!realtorId \|\| !supabase\) return "unknown"/);
});
