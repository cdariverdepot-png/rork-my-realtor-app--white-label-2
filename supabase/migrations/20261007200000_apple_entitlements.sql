begin;
-- One subscription lifecycle, owned by Apple.
--
-- Apple handles purchase, the 7-day free trial (introductory offer), renewal, cancellation,
-- billing retry and grace period, refunds and subscription management. Supabase caches only the
-- latest VERIFIED Apple entitlement per realtor so the server can enforce paid SERVICE ACTIONS.
-- There is no local trial clock and no private billing state.
--
-- Application rules on top of Apple's state:
--   * Apple introductory (free-trial) period: paid actions on, up to 3 connected clients.
--   * Paid period (incl. Apple billing grace period): paid actions on, unlimited clients.
--   * Anything else (never subscribed, expired, canceled and ended, refunded, unknown):
--     paid actions off. Sign-in, navigation, reading and existing clients are NEVER affected
--     (see 20261004061627); no data, relationship or message history is removed.
--
-- This migration removes the private (Stripe-style) billing functions and events, and the locally
-- generated trial (`billing_accounts.trial_started_at`), which is not carried forward. Accounts,
-- clients, relationships, messages and all application data are untouched.

drop function if exists public.billing_snapshot(uuid), public.billing_apply(uuid,bigint,text,jsonb),
 public.billing_checkout(uuid,text,text,uuid), public.billing_customer(text),
 private.billing_snapshot(uuid), private.billing_apply(uuid,bigint,text,jsonb),
 private.billing_checkout(uuid,text,text,uuid), private.billing_customer(text);
drop table if exists private.billing_events;
drop trigger if exists initialize_realtor_billing on public.realtors;
drop function if exists private.initialize_billing_account();

create table private.realtor_entitlements (
 realtor_id uuid primary key references public.realtors(id) on delete cascade,
 apple_original_transaction_id text not null unique,
 apple_product_id text not null,
 apple_environment text not null,
 apple_expires_at timestamptz,
 apple_in_trial boolean not null default false,   -- current period is Apple's introductory free trial
 apple_revoked_at timestamptz,                    -- refund / revocation reported by Apple
 apple_auto_renew boolean,                        -- null until Apple renewal info is received
 apple_billing_issue boolean not null default false, -- Apple billing retry (incl. grace period)
 apple_signed_at timestamptz not null,            -- ordering: older signed data never overwrites newer
 updated_at timestamptz not null default now()
);
alter table private.realtor_entitlements enable row level security;
revoke all on private.realtor_entitlements from public,anon,authenticated;
drop table private.billing_accounts;

-- Active only while a verified, unrevoked Apple entitlement is within its period (Apple extends the
-- period through a billing grace period). No row = never subscribed = inactive.
create or replace function private.service_active(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.realtors where id=rid) and exists(select 1 from private.realtor_entitlements e
  where e.realtor_id=rid and e.apple_expires_at>now() and e.apple_revoked_at is null);
$$;

-- Owner-facing state for Account & Billing. Clients never receive this.
create or replace function private.entitlement(rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e private.realtor_entitlements%rowtype; used integer; enabled boolean; found_row boolean;
begin
 select * into e from private.realtor_entitlements where realtor_id=rid; found_row:=found;
 select count(*) into used from private.client_relationships where realtor_id=rid and active;
 enabled:=private.service_active(rid);
 return jsonb_build_object('ok',true,'plan',case when not enabled then 'none' when e.apple_in_trial then 'evaluation' else 'pro' end,
  'active',enabled,
  'status',case when not enabled then 'inactive' when e.apple_in_trial then 'trial' when e.apple_billing_issue then 'grace_period' else 'subscribed' end,
  'inactiveReason',case when enabled then null when not found_row then 'not_subscribed'
   when e.apple_revoked_at is not null then 'refunded'
   when e.apple_billing_issue then 'billing_retry'
   when e.apple_auto_renew is false then 'canceled' else 'expired' end,
  'trialEnd',case when enabled and e.apple_in_trial then e.apple_expires_at else null end,
  'everPaid',found_row,'serviceEnd',e.apple_expires_at,
  'renewalAt',case when e.apple_auto_renew is distinct from false then e.apple_expires_at else null end,
  'cancelAtPeriodEnd',coalesce(e.apple_auto_renew=false,false),
  'paymentIssue',coalesce(e.apple_billing_issue,false),'interval',null,
  'limit',case when not enabled then 0 when e.apple_in_trial then 3 else -1 end,'used',used);
end; $$;

-- Verified Apple snapshot, written only by the apple-subscription Edge Function (service role).
create function private.apple_apply(rid uuid,snapshot jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e private.realtor_entitlements%rowtype; otid text:=snapshot->>'original_transaction_id'; signed timestamptz:=(snapshot->>'signed_at')::timestamptz;
begin
 if otid is null or otid !~ '^\d{1,40}$' or signed is null or coalesce(snapshot->>'product_id','')='' or coalesce(snapshot->>'environment','')='' then raise exception 'Invalid snapshot'; end if;
 if not exists(select 1 from public.realtors where id=rid) then return jsonb_build_object('ok',false,'reason','unknown_realtor'); end if;
 perform pg_advisory_xact_lock(hashtextextended('entitlement:'||rid::text,0));
 -- One Apple subscription belongs to exactly one realtor.
 if exists(select 1 from private.realtor_entitlements where apple_original_transaction_id=otid and realtor_id<>rid) then
  return jsonb_build_object('ok',false,'reason','other_account'); end if;
 select * into e from private.realtor_entitlements where realtor_id=rid for update;
 if found and e.apple_original_transaction_id=otid and e.apple_signed_at>signed then
  return jsonb_build_object('ok',true,'stale',true,'active',private.service_active(rid)); end if;
 insert into private.realtor_entitlements as t(realtor_id,apple_original_transaction_id,apple_product_id,apple_environment,apple_expires_at,
  apple_in_trial,apple_revoked_at,apple_auto_renew,apple_billing_issue,apple_signed_at)
 values(rid,otid,snapshot->>'product_id',snapshot->>'environment',nullif(snapshot->>'expires_at','')::timestamptz,
  coalesce((snapshot->>'in_trial')::boolean,false),nullif(snapshot->>'revoked_at','')::timestamptz,
  case when jsonb_typeof(snapshot->'auto_renew')='boolean' then (snapshot->>'auto_renew')::boolean end,
  coalesce(case when jsonb_typeof(snapshot->'billing_issue')='boolean' then (snapshot->>'billing_issue')::boolean end,false),signed)
 on conflict(realtor_id) do update set apple_original_transaction_id=excluded.apple_original_transaction_id,
  apple_product_id=excluded.apple_product_id, apple_environment=excluded.apple_environment, apple_expires_at=excluded.apple_expires_at,
  apple_in_trial=excluded.apple_in_trial, apple_revoked_at=excluded.apple_revoked_at,
  -- Renewal fields are only known from Apple renewal info; keep the last verified value otherwise.
  apple_auto_renew=case when jsonb_typeof(snapshot->'auto_renew')='boolean' then excluded.apple_auto_renew else t.apple_auto_renew end,
  apple_billing_issue=case when jsonb_typeof(snapshot->'billing_issue')='boolean' then excluded.apple_billing_issue else t.apple_billing_issue end,
  apple_signed_at=excluded.apple_signed_at, updated_at=now();
 return jsonb_build_object('ok',true,'active',private.service_active(rid));
end; $$;
create function public.apple_apply(p_realtor_id uuid,p_snapshot jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.apple_apply(p_realtor_id,p_snapshot); $$;
create function private.apple_realtor(otid text) returns uuid language sql stable security definer set search_path='' as $$
 select realtor_id from private.realtor_entitlements where apple_original_transaction_id=otid; $$;
create function public.apple_realtor(p_original_transaction_id text) returns uuid language sql security invoker set search_path='' as $$ select private.apple_realtor(p_original_transaction_id); $$;

revoke all on function private.apple_apply(uuid,jsonb),public.apple_apply(uuid,jsonb),private.apple_realtor(text),public.apple_realtor(text) from public,anon,authenticated;
grant execute on function private.apple_apply(uuid,jsonb),public.apple_apply(uuid,jsonb),private.apple_realtor(text),public.apple_realtor(text) to service_role;
revoke all on function private.service_active(uuid),private.entitlement(uuid) from public,anon;
commit;
