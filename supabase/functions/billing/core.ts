import { SUBSCRIPTION_PRICING } from '../../../expo/constants/subscriptionPricing.ts';
export type Interval = 'month' | 'year';
export type BillingConfig = { enabled: boolean; secret: string; webhookSecret: string; monthPrice: string; yearPrice: string; origin: string; failurePolicy: string; };
export function configured(c: BillingConfig): boolean {
  // This implementation is deliberately test-only. Production requires a separately reviewed activation.
  return c.enabled && c.secret.startsWith('sk_test_') && c.webhookSecret.startsWith('whsec_') &&
    /^price_[A-Za-z0-9]+$/.test(c.monthPrice) && /^price_[A-Za-z0-9]+$/.test(c.yearPrice) && c.monthPrice !== c.yearPrice &&
    /^https:\/\//.test(c.origin) && c.failurePolicy === 'paid_period';
}
export function offer(price: any, interval: Interval) {
  if (price?.livemode !== false || price?.active !== true || price?.type !== 'recurring' || price?.recurring?.interval !== interval ||
    price?.recurring?.interval_count !== 1 || !Number.isInteger(price.unit_amount) || price.unit_amount<=0 || !/^[a-z]{3}$/.test(price.currency)) throw new Error('Price configuration is incomplete');
  if (price.currency !== SUBSCRIPTION_PRICING.currency || price.unit_amount !== (interval === 'month' ? SUBSCRIPTION_PRICING.monthlyCents : SUBSCRIPTION_PRICING.annualCents)) throw new Error('Provider price does not match the approved offer');
  const currency = price.currency.toUpperCase();
  // Stripe zero-decimal currencies, rather than assuming every amount has cents.
  const zeroDecimal = new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF']);
  const total = price.unit_amount / (zeroDecimal.has(currency) ? 1 : 100);
  return { interval, currency, amount: price.unit_amount, total: new Intl.NumberFormat('en-US',{style:'currency',currency}).format(total), priceId: price.id };
}
export function annualSavings(month: ReturnType<typeof offer>, year: ReturnType<typeof offer>): string | null {
  if (month.currency !== year.currency || year.amount >= month.amount*12) return null;
  return `Save $${((month.amount*12-year.amount)/100).toFixed(0)} a year — two months`;
}
export function subscriptionSnapshot(sub: any, customer: string, c: BillingConfig) {
  if (sub?.livemode !== false || sub.customer !== customer || !['active','past_due','unpaid','canceled','paused','incomplete','incomplete_expired'].includes(sub.status)) throw new Error('Unverified subscription');
  const items = sub.items?.data ?? [];
  if (items.length!==1 || items[0].quantity!==1) throw new Error('Unsupported subscription');
  const price=items[0].price, interval: Interval=price.id===c.monthPrice?'month':price.id===c.yearPrice?'year': (()=>{throw new Error('Unknown subscription price')})();
  offer(price,interval);
  const invoice=sub.latest_invoice;
  const paidEnds=invoice?.status==='paid' && invoice.livemode===false && invoice.customer===customer &&
    (invoice.subscription===sub.id || invoice.parent?.subscription_details?.subscription===sub.id)
    ? (invoice.lines?.data??[]).filter((line:any)=>
      (line.price?.id===price.id || line.pricing?.price_details?.price===price.id) && !line.proration && !line.parent?.subscription_item_details?.proration && Number.isFinite(line.period?.end) && line.period.end>line.period?.start).map((line:any)=>line.period.end) : [];
  const paidThrough=paidEnds.length?Math.max(...paidEnds):null;
  const end=items[0].current_period_end ?? sub.current_period_end;
  if (!Number.isFinite(end)) throw new Error('Missing subscription period');
  return {customer,subscription:sub.id,status:sub.status,interval,
    paid_through:paidThrough?new Date(paidThrough*1000).toISOString():null,
    period_end:new Date(end*1000).toISOString(),cancel_at_period_end:sub.cancel_at_period_end===true,
    payment_issue:['past_due','unpaid','incomplete'].includes(sub.status)};
}
export async function verifySignature(raw: string, header: string, secret: string, nowSeconds=Date.now()/1000): Promise<boolean> {
  const fields=header.split(',').map(x=>x.split('=')), ts=fields.find(x=>x[0]==='t')?.[1];
  if (!ts || !/^\d+$/.test(ts) || Math.abs(nowSeconds-Number(ts))>300 || !secret.startsWith('whsec_')) return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${ts}.${raw}`)));
  const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  return fields.filter(x=>x[0]==='v1').some(([,signature])=>{
    if(signature?.length!==hex.length)return false;
    let diff=0; for(let i=0;i<hex.length;i++)diff|=hex.charCodeAt(i)^signature.charCodeAt(i);return diff===0;
  });
}
