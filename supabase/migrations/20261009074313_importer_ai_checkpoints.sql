-- Additive, service-role-only checkpoints. No customer grants or billing changes.
create schema if not exists private;
create table private.import_ai_locks (channel text primary key);
create table private.import_ai_attempts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, channel text not null,
 fingerprint text not null, stage text not null, reserved_usd numeric not null check(reserved_usd>=0),
 cost_usd numeric not null default 0 check(cost_usd>=0), usage_known boolean not null default false,
 usage jsonb, created_at timestamptz not null default now(), finished_at timestamptz
);
create index import_ai_attempts_budget on private.import_ai_attempts(channel,created_at,owner_id);
create table private.import_ai_cache (
 owner_id uuid not null, channel text not null, fingerprint text not null,
 attempt_id uuid not null references private.import_ai_attempts(id),
 state text not null check(state in ('running','complete','failed','uncertain')),
 lease_until timestamptz not null, expires_at timestamptz not null, response jsonb,
 primary key(owner_id,channel,fingerprint)
);
alter table private.import_ai_locks enable row level security;
alter table private.import_ai_attempts enable row level security;
alter table private.import_ai_cache enable row level security;
revoke all on private.import_ai_locks,private.import_ai_attempts,private.import_ai_cache from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.import_ai_locks,private.import_ai_attempts,private.import_ai_cache to service_role;

create function public.import_ai_acquire(p_owner uuid,p_channel text,p_key text,p_stage text,p_reserve numeric,
 p_daily_limit numeric default null,p_actor_limit numeric default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached private.import_ai_cache; attempt uuid; spent numeric; actor_spent numeric;
begin
 if p_owner is null or p_channel not in ('production','staging') or p_key !~ '^[a-f0-9]{64}$'
 or p_stage not in ('profile','navigation','copy-variation','listing-files','page-normalizer')
 or p_reserve is null or p_reserve < 0 or p_reserve > 100
 or p_daily_limit < 0 or p_actor_limit < 0 then raise exception 'Invalid AI reservation'; end if;
 -- Serialize admission, including different tenants, before examining or reserving the daily budget.
 insert into private.import_ai_locks(channel) values(p_channel) on conflict do nothing;
 perform 1 from private.import_ai_locks where channel=p_channel for update;
 select * into cached from private.import_ai_cache where owner_id=p_owner and channel=p_channel and fingerprint=p_key;
 if found then
   if cached.state='complete' and cached.expires_at>now() and cached.response is not null then
     return jsonb_build_object('state','cached','response',cached.response);
   end if;
   -- Missing provider usage requires reconciliation, never an automatic second purchase.
   if cached.state='uncertain' or (cached.state='running' and cached.lease_until>now()) then
     return jsonb_build_object('state','busy');
   end if;
 end if;
 select coalesce(sum(case when usage_known then cost_usd else reserved_usd end),0),
   coalesce(sum(case when owner_id=p_owner then case when usage_known then cost_usd else reserved_usd end else 0 end),0)
 into spent,actor_spent from private.import_ai_attempts
 where channel=p_channel and (not usage_known or created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC');
 if (p_daily_limit is not null and spent+p_reserve>p_daily_limit)
 or (p_actor_limit is not null and actor_spent+p_reserve>p_actor_limit) then
   return jsonb_build_object('state','budget');
 end if;
 insert into private.import_ai_attempts(owner_id,channel,fingerprint,stage,reserved_usd)
 values(p_owner,p_channel,p_key,p_stage,p_reserve) returning id into attempt;
 insert into private.import_ai_cache(owner_id,channel,fingerprint,attempt_id,state,lease_until,expires_at)
 values(p_owner,p_channel,p_key,attempt,'running',now()+interval '3 minutes',now())
 on conflict(owner_id,channel,fingerprint) do update set attempt_id=excluded.attempt_id,state='running',
 lease_until=excluded.lease_until,expires_at=excluded.expires_at,response=null;
 return jsonb_build_object('state','acquired','attempt',attempt);
end $$;

create function public.import_ai_finish(p_attempt uuid,p_response jsonb,p_usage jsonb,p_cost numeric,p_known boolean,p_cache_seconds integer)
returns void language plpgsql security invoker set search_path='' as $$
declare a private.import_ai_attempts;
begin
 if p_cost is null or p_cost<0 or p_cost>100 or p_known is null or p_cache_seconds not between 0 and 604800
 or (p_response is not null and (jsonb_typeof(p_response)<>'object' or octet_length(p_response::text)>2000000))
 then raise exception 'Invalid AI reconciliation'; end if;
 select * into a from private.import_ai_attempts where id=p_attempt;
 if not found then raise exception 'Unknown AI attempt'; end if;
 perform 1 from private.import_ai_locks where channel=a.channel for update;
 select * into a from private.import_ai_attempts where id=p_attempt for update;
 -- Idempotent settlement; an unknown attempt may later be reconciled from provider records.
 if a.finished_at is not null and a.usage_known then return; end if;
 update private.import_ai_attempts set cost_usd=p_cost,usage_known=p_known,usage=p_usage,finished_at=now() where id=p_attempt;
 update private.import_ai_cache set state=case when not p_known then 'uncertain'
   when p_response is not null and p_cache_seconds>0 then 'complete' else 'failed' end,
   response=case when p_known and p_cache_seconds>0 then p_response else null end,
   expires_at=now()+make_interval(secs=>p_cache_seconds),lease_until=now()
 where owner_id=a.owner_id and channel=a.channel and fingerprint=a.fingerprint and attempt_id=p_attempt;
end $$;
revoke all on function public.import_ai_acquire(uuid,text,text,text,numeric,numeric,numeric),
 public.import_ai_finish(uuid,jsonb,jsonb,numeric,boolean,integer) from public,anon,authenticated;
grant execute on function public.import_ai_acquire(uuid,text,text,text,numeric,numeric,numeric),
 public.import_ai_finish(uuid,jsonb,jsonb,numeric,boolean,integer) to service_role;
