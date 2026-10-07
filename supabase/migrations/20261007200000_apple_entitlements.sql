begin;
-- Apple App Store is the payment system. Apple handles purchase, renewal, cancellation, billing retry
-- and subscription management. This migration removes the private provider (Stripe-style) billing
-- state and keeps only what the server needs to enforce paid SERVICE ACTIONS:
--   * the server-owned 7-day trial clock,
--   * the latest verified Apple subscription snapshot (one original transaction per realtor).
-- Billing state still never gates sign-in, navigation or reading (see 20261004061627).

drop function if exists public.billing_snapshot(uuid), public.billing_apply(uuid,bigint,text,jsonb),
 public.billing_checkout(uuid,text,text,uuid), public.billing_customer(text),
 private.billing_snapshot(uuid), private.billing_apply(uuid,bigint,text,jsonb),
 private.billing_checkout(uuid,text,text,uuid), private.billing_customer(text);
drop table if exists private.billing_events;

alter table private.billing_accounts rename to realtor_entitlements;
alter table private.realtor_entitlements
 drop column if exists provider_customer_id, drop column if exists provider_subscription_id,
 drop column if exists status, drop column if exists billing_interval, drop column if exists paid_through,
 drop column if exists period_end, drop column if exists cancel_at_period_end, drop column if exists payment_issue,
 drop column if exists revision, drop column if exists checkout_key, drop column if exists checkout_until,
 drop column if exists checkout_session_id, drop column if exists ever_paid,
 add column apple_original_transaction_id text unique,
 add column apple_product_id text,
 add column apple_environment text,
 add column apple_expires_at timestamptz,
 add column apple_revoked_at timestamptz,
 add column apple_auto_renew boolean,
 add column apple_billing_issue boolean not null default false,
 add column apple_signed_at timestamptz;

create or replace function private.initialize_billing_account() returns trigger language plpgsql security definer set search_path='' as $billing$
begin
 insert into private.realtor_entitlements(realtor_id) values(new.id) on conflict do nothing;
 return new;
end; $billing$;

-- Active = a verified, unrevoked Apple subscription that has not expired, or (only for accounts that
-- have never subscribed) inside the 7-day trial. An expired subscription never falls back to the trial.
create or replace function private.service_active(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.realtors where id=rid) and coalesce((select
  (e.apple_original_transaction_id is null and e.trial_started_at + interval '7 days' > now())
  or (e.apple_expires_at is not null and e.apple_expires_at > now() and e.apple_revoked_at is null)
 from private.realtor_entitlements e where e.realtor_id=rid),false);
$$;

-- Owner-facing state. Keys match what the app already reads. The trial allows 3 connected clients;
-- an active Apple subscription is unlimited; inactive allows no NEW connections (existing stay).
create or replace function private.entitlement(rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e private.realtor_entitlements%rowtype; used integer; enabled boolean; subscribed boolean; ever boolean;
begin
 select * into e from private.realtor_entitlements where realtor_id=rid;
 select count(*) into used from private.client_relationships where realtor_id=rid and active;
 enabled:=private.service_active(rid);
 ever:=e.apple_original_transaction_id is not null;
 subscribed:=ever and e.apple_expires_at>now() and e.apple_revoked_at is null;
 return jsonb_build_object('ok',true,'plan',case when ever then 'pro' else 'evaluation' end,
  'active',enabled,'status',case when subscribed then 'subscribed' when enabled then 'trial' else 'inactive' end,
  'inactiveReason',case when enabled then null when not ever then 'trial_ended'
   when e.apple_revoked_at is not null then 'revoked'
   when e.apple_billing_issue then 'billing_retry'
   when e.apple_auto_renew is false then 'canceled' else 'expired' end,
  'trialEnd',e.trial_started_at + interval '7 days',
  'everPaid',ever,'serviceEnd',e.apple_expires_at,
  'renewalAt',case when e.apple_auto_renew is distinct from false then e.apple_expires_at else null end,
  'cancelAtPeriodEnd',coalesce(e.apple_auto_renew=false,false),
  'paymentIssue',coalesce(e.apple_billing_issue,false),'interval',null,
  'limit',case when not enabled then 0 when subscribed then -1 else 3 end,'used',used);
end; $$;

-- Verified Apple snapshot (from the apple-subscription Edge Function only). Older signed data never
-- overwrites newer; one Apple subscription can belong to only one realtor.
create function private.apple_apply(rid uuid,snapshot jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e private.realtor_entitlements%rowtype; otid text:=snapshot->>'original_transaction_id'; signed timestamptz:=(snapshot->>'signed_at')::timestamptz;
begin
 if otid is null or otid !~ '^\d{1,40}$' or signed is null then raise exception 'Invalid snapshot'; end if;
 if not exists(select 1 from public.realtors where id=rid) then return jsonb_build_object('ok',false,'reason','unknown_realtor'); end if;
 perform pg_advisory_xact_lock(hashtextextended('entitlement:'||rid::text,0));
 if exists(select 1 from private.realtor_entitlements where apple_original_transaction_id=otid and realtor_id<>rid) then
  return jsonb_build_object('ok',false,'reason','other_account'); end if;
 insert into private.realtor_entitlements(realtor_id) values(rid) on conflict do nothing;
 select * into e from private.realtor_entitlements where realtor_id=rid for update;
 if e.apple_original_transaction_id=otid and e.apple_signed_at is not null and e.apple_signed_at>signed then
  return jsonb_build_object('ok',true,'stale',true); end if;
 update private.realtor_entitlements set apple_original_transaction_id=otid,
  apple_product_id=snapshot->>'product_id', apple_environment=snapshot->>'environment',
  apple_expires_at=nullif(snapshot->>'expires_at','')::timestamptz, apple_revoked_at=nullif(snapshot->>'revoked_at','')::timestamptz,
  apple_auto_renew=case when snapshot ? 'auto_renew' and snapshot->'auto_renew'<>'null'::jsonb then (snapshot->>'auto_renew')::boolean else apple_auto_renew end,
  apple_billing_issue=case when snapshot ? 'billing_issue' and snapshot->'billing_issue'<>'null'::jsonb then (snapshot->>'billing_issue')::boolean else apple_billing_issue end,
  apple_signed_at=signed, updated_at=now()
 where realtor_id=rid;
 return jsonb_build_object('ok',true,'active',private.service_active(rid));
end; $$;
create function public.apple_apply(p_realtor_id uuid,p_snapshot jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.apple_apply(p_realtor_id,p_snapshot); $$;
create function private.apple_realtor(otid text) returns uuid language sql stable security definer set search_path='' as $$
 select realtor_id from private.realtor_entitlements where apple_original_transaction_id=otid; $$;
create function public.apple_realtor(p_original_transaction_id text) returns uuid language sql security invoker set search_path='' as $$ select private.apple_realtor(p_original_transaction_id); $$;

revoke all on function private.apple_apply(uuid,jsonb),public.apple_apply(uuid,jsonb),private.apple_realtor(text),public.apple_realtor(text) from public,anon,authenticated;
grant execute on function private.apple_apply(uuid,jsonb),public.apple_apply(uuid,jsonb),private.apple_realtor(text),public.apple_realtor(text) to service_role;
revoke all on function private.service_active(uuid),private.entitlement(uuid),private.initialize_billing_account() from public,anon;
revoke all on private.realtor_entitlements from public,anon,authenticated;
commit;
