begin;
-- Server-only lifecycle. Neither selected plan labels nor device storage grant access.
create table private.billing_accounts (
 realtor_id uuid primary key references public.realtors(id) on delete cascade,
 ever_paid boolean not null default false,
 provider_customer_id text unique, provider_subscription_id text,
 status text not null default 'evaluation', billing_interval text check (billing_interval in ('month','year')),
 paid_through timestamptz, period_end timestamptz, cancel_at_period_end boolean not null default false,
 payment_issue boolean not null default false, revision bigint not null default 0,
 checkout_key uuid, checkout_until timestamptz, checkout_session_id text,
 updated_at timestamptz not null default now()
);
create table private.client_relationships (
 realtor_id uuid not null references public.realtors(id) on delete cascade,
 client_id text not null, active boolean not null default true,
 connected_at timestamptz not null default now(), disconnected_at timestamptz,
 primary key(realtor_id,client_id),
 foreign key(realtor_id,client_id) references public.client_accounts(realtor_id,client_id) on delete cascade
);
create table private.billing_events (
 event_id text primary key, realtor_id uuid not null references public.realtors(id) on delete cascade,
 processed_at timestamptz not null default now()
);
create index client_relationships_active on private.client_relationships(realtor_id) where active;
alter table private.billing_accounts enable row level security;
alter table private.client_relationships enable row level security;
alter table private.billing_events enable row level security;
revoke all on private.billing_accounts,private.client_relationships,private.billing_events from public,anon,authenticated;
-- Existing authenticated, currently bound accounts retain their relationships; address-book contacts are excluded.
insert into private.client_relationships(realtor_id,client_id)
 select distinct s.realtor_id,s.client_id from private.client_sessions s join public.client_accounts a
 on a.realtor_id=s.realtor_id and a.client_id=s.client_id and a.pw_hash=s.credential_version;
-- Do not silently disconnect existing customers or grant an unapproved unlimited plan.
do $$ begin
 if exists(select 1 from private.client_relationships where active group by realtor_id having count(*)>3)
 then raise exception 'Existing connections exceed evaluation allowance. Reconcile verified paid entitlements before applying this migration.'; end if;
end; $$;

create function private.service_active(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.realtors where id=rid) and coalesce((select
 case when not ever_paid then true else coalesce(paid_through>now(),false) end
 from private.billing_accounts where realtor_id=rid),true);
$$;
create function public.realtor_service_active(p_realtor_id uuid) returns boolean language sql security invoker set search_path='' as $$ select private.service_active(p_realtor_id); $$;
revoke all on function public.realtor_service_active(uuid) from public,anon,authenticated;
grant execute on function public.realtor_service_active(uuid),private.service_active(uuid) to service_role;
create function private.entitlement(rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b private.billing_accounts%rowtype; used integer; enabled boolean;
begin
 select * into b from private.billing_accounts where realtor_id=rid;
 select count(*) into used from private.client_relationships where realtor_id=rid and active;
 enabled:=private.service_active(rid);
 return jsonb_build_object('ok',true,'plan',case when b.ever_paid then 'pro' else 'evaluation' end,
  'active',enabled,'status',case when not enabled then 'inactive' else coalesce(b.status,'evaluation') end,
  'providerStatus',coalesce(b.status,'evaluation'),'interval',b.billing_interval,'serviceEnd',b.paid_through,
  'renewalAt',b.period_end,'cancelAtPeriodEnd',coalesce(b.cancel_at_period_end,false),
  'paymentIssue',coalesce(b.payment_issue,false),'everPaid',coalesce(b.ever_paid,false),
  'limit',case when not enabled then 0 when b.ever_paid then -1 else 3 end,'used',used);
end; $$;
create function private.activate_relationship(rid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.client_sessions%rowtype; ent jsonb; used integer;
begin
 -- The authenticated credential binding supplies identity; caller-supplied email/name never does.
 select * into s from private.client_sessions where auth_user_id=auth.uid() and realtor_id=rid;
 if not found or not exists(select 1 from public.client_accounts a where a.realtor_id=rid and a.client_id=s.client_id and a.pw_hash=s.credential_version)
 then return jsonb_build_object('ok',false,'reason','authentication'); end if;
 perform pg_advisory_xact_lock(hashtextextended('entitlement:'||rid::text,0));
 ent:=private.entitlement(rid); used:=(ent->>'used')::integer;
 if not (ent->>'active')::boolean then return jsonb_build_object('ok',false,'reason','inactive'); end if;
 if exists(select 1 from private.client_relationships where realtor_id=rid and client_id=s.client_id and active)
 then return jsonb_build_object('ok',true,'reused',true,'used',used,'limit',ent->'limit'); end if;
 if (ent->>'limit')::integer>=0 and used>=(ent->>'limit')::integer then return jsonb_build_object('ok',false,'reason','limit'); end if;
 insert into private.client_relationships(realtor_id,client_id) values(rid,s.client_id)
 on conflict(realtor_id,client_id) do update set active=true,disconnected_at=null;
 return jsonb_build_object('ok',true,'reused',false,'used',used+1,'limit',ent->'limit');
end; $$;

alter function private.authenticate_client(uuid,text,text) rename to authenticate_client_credentials;
revoke all on function private.authenticate_client_credentials(uuid,text,text) from public,anon,authenticated;
create function private.authenticate_client(rid uuid,email_input text,hash_input text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; activated jsonb;
begin
 result:=private.authenticate_client_credentials(rid,email_input,hash_input);
 if result->>'ok'='true' then
  activated:=private.activate_relationship(rid);
  if activated->>'ok'<>'true' then return activated; end if;
 end if;
 return result;
end; $$;
create or replace function private.create_client(rid uuid,email_input text,hash_input text,cid text,name_input text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; authenticated jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in is required' using errcode='42501'; end if;
 if exists(select 1 from public.realtors where auth_user_id=auth.uid()) then raise exception 'Use a client session' using errcode='42501'; end if;
 if not exists(select 1 from public.realtors where id=rid and client_code_enabled) then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 if length(cid)>160 or length(name_input)>240 or length(email_input)>320 then raise exception 'Invalid account'; end if;
 result:=private.register_client_account(rid,email_input,hash_input,cid,name_input);
 if result->>'created'='true' then
  authenticated:=private.authenticate_client(rid,email_input,hash_input);
  if authenticated->>'ok'<>'true' then return authenticated||jsonb_build_object('account_created',true); end if;
 end if;
 return result;
end; $$;
alter function private.bound_client(uuid) rename to bound_client_credentials;
revoke all on function private.bound_client_credentials(uuid) from public,anon,authenticated;
create function private.bound_client(rid uuid) returns text language sql stable security definer set search_path='' as $$
 select r.client_id from private.client_relationships r where r.realtor_id=rid and r.active
 and r.client_id=private.bound_client_credentials(rid) and private.service_active(rid);
$$;
-- Identity remains resumable when service is inactive; it does not authorize private data access.
create or replace function private.client_identity() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.client_sessions%rowtype;
begin
 select * into s from private.client_sessions where auth_user_id=auth.uid();
 if not found or private.bound_client_credentials(s.realtor_id) is null then return null; end if;
 return jsonb_build_object('realtorId',s.realtor_id,'clientId',s.client_id);
end; $$;
-- Backward-compatible RPC names, with authentication and fail-closed server enforcement.
create function public.claim_client_seat(p_realtor_id uuid,p_client_key text,p_client_id text,p_client_name text) returns jsonb language sql security invoker set search_path='' as $$ select private.activate_relationship(p_realtor_id); $$;
create function private.disconnect_relationship(rid uuid,cid text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.realtor_owner(rid) then raise exception 'Not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('entitlement:'||rid::text,0));
 update private.client_relationships set active=false,disconnected_at=now() where realtor_id=rid and client_id=cid;
 -- Retain accounts, sessions, documents, messages and favorites. Access is revoked by bound_client().
 return jsonb_build_object('ok',true);
end; $$;
create function public.disconnect_client(p_realtor_id uuid,p_client_id text) returns jsonb language sql security invoker set search_path='' as $$ select private.disconnect_relationship(p_realtor_id,p_client_id); $$;
create function private.seat_state(rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.realtor_owner(rid) then raise exception 'Not authorized' using errcode='42501'; end if;
 return private.entitlement(rid)||jsonb_build_object('connections',coalesce((select jsonb_agg(jsonb_build_object(
 'clientKey',a.email,'clientId',r.client_id,'clientName',a.name,'connectedAt',extract(epoch from r.connected_at)*1000))
 from private.client_relationships r join public.client_accounts a on a.realtor_id=r.realtor_id and a.client_id=r.client_id where r.realtor_id=rid and r.active),'[]'), 'attempts','[]'::jsonb);
end; $$;
create function public.realtor_seat_state(p_realtor_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.seat_state(p_realtor_id); $$;
create function public.mark_attempts_seen(p_realtor_id uuid) returns void language sql security invoker set search_path='' as $$ select null::void; $$;
create function private.experience_access(rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b jsonb; owner boolean; connected boolean;
begin
 owner:=private.realtor_owner(rid); connected:=private.bound_client(rid) is not null;
 select value into b from public.app_kv where key=rid::text||':brand.v2';
 return jsonb_build_object('available',private.service_active(rid) and (owner or connected),
 'publicAvailable',private.service_active(rid),'contact',jsonb_build_object('name',b->'realtor'->>'name',
 'phone',b->'realtor'->>'phone','email',b->'realtor'->>'email'));
end; $$;
create function public.experience_access(p_realtor_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.experience_access(p_realtor_id); $$;
alter function private.kv_read(text) rename to kv_read_before_entitlements;
alter function private.kv_write(text,jsonb,bigint) rename to kv_write_before_entitlements;
revoke all on function private.kv_read_before_entitlements(text),private.kv_write_before_entitlements(text,jsonb,bigint) from public,anon,authenticated;
create function private.kv_read(k text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rid uuid;
begin
 if split_part(k,':',1) !~ '^[0-9a-fA-F-]{36}$' then return null; end if;
 rid:=split_part(k,':',1)::uuid;
 if not private.service_active(rid) then return null; end if;
 -- Disconnected clients cannot fall back to the anonymous published-data path.
 if exists(select 1 from private.client_sessions where auth_user_id=auth.uid() and realtor_id=rid) and private.bound_client(rid) is null and not private.realtor_owner(rid) then return null; end if;
 return private.kv_read_before_entitlements(k);
end; $$;
create function private.kv_write(k text,v jsonb,requested_rev bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 if split_part(k,':',1) !~ '^[0-9a-fA-F-]{36}$' or not private.service_active(split_part(k,':',1)::uuid) then raise exception 'Service unavailable' using errcode='42501'; end if;
 perform private.kv_write_before_entitlements(k,v,requested_rev);
end; $$;
create function private.export_realtor(rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.realtor_owner(rid) then raise exception 'Not authorized' using errcode='42501'; end if;
 return jsonb_build_object('exportedAt',now(),'records',coalesce((select jsonb_object_agg(key,value) from public.app_kv
 where split_part(key,':',1)=rid::text and substring(key from 38) not like 'auth.%'),'{}'),
 'relationships',coalesce((select jsonb_agg(to_jsonb(r)) from private.client_relationships r where realtor_id=rid),'[]'),
 'listingSources',coalesce((select jsonb_agg(to_jsonb(s)-'headers') from public.listing_sources s where realtor_id=rid),'[]'),
 'build',(select to_jsonb(b)-'auth_user_id' from public.realtor_builds b join public.realtors r on r.auth_user_id=b.auth_user_id where r.id=rid),
 'clientAccounts',coalesce((select jsonb_agg(jsonb_build_object('clientId',a.client_id,'name',a.name,'email',a.email)) from public.client_accounts a where realtor_id=rid),'[]'));
end; $$;
create function public.export_realtor_data(p_realtor_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.export_realtor(p_realtor_id); $$;
create or replace function public.authorize_push(p_realtor_id uuid,p_audience text) returns boolean language sql security invoker set search_path='' as $$
 select private.service_active(p_realtor_id) and (private.realtor_owner(p_realtor_id) or (p_audience='realtor' and private.bound_client(p_realtor_id) is not null)); $$;
alter function private.active_push_tokens(uuid,text,jsonb) rename to active_push_tokens_before_entitlements;
revoke all on function private.active_push_tokens_before_entitlements(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function private.active_push_tokens(rid uuid,target_role text,client_ids jsonb) returns table(token text,role text,client_id text) language sql stable security definer set search_path='' as $$
 select t.* from private.active_push_tokens_before_entitlements(rid,target_role,client_ids) t where private.service_active(rid)
 and (target_role='admin' or exists(select 1 from private.client_relationships r where r.realtor_id=rid and r.client_id=t.client_id and r.active)); $$;
revoke all on function private.active_push_tokens(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.active_push_tokens(uuid,text,jsonb) to service_role;
-- Gate public lead/showing endpoints as well; they must not bypass a disconnected binding.
alter function private.capture_public_lead(uuid,text,text,text) rename to capture_public_lead_before_entitlements;
revoke all on function private.capture_public_lead_before_entitlements(uuid,text,text,text) from public,anon,authenticated;
create function private.capture_public_lead(rid uuid,n text,e text,p text) returns text language plpgsql security definer set search_path='' as $$
begin
 if not private.service_active(rid) or (exists(select 1 from private.client_sessions where auth_user_id=auth.uid() and realtor_id=rid) and private.bound_client(rid) is null) then raise exception 'Service unavailable' using errcode='42501'; end if;
 return private.capture_public_lead_before_entitlements(rid,n,e,p);
end; $$;
revoke all on function private.capture_public_lead(uuid,text,text,text) from public,anon;
grant execute on function private.capture_public_lead(uuid,text,text,text) to authenticated;
alter function private.request_showing(uuid,text,text,bigint,integer) rename to request_showing_before_entitlements;
revoke all on function private.request_showing_before_entitlements(uuid,text,text,bigint,integer) from public,anon,authenticated;
create function private.request_showing(rid uuid,request_id text,listing_id text,starts bigint,duration integer) returns text language plpgsql security definer set search_path='' as $$
begin
 if not private.service_active(rid) or (exists(select 1 from private.client_sessions where auth_user_id=auth.uid() and realtor_id=rid) and private.bound_client(rid) is null) then raise exception 'Service unavailable' using errcode='42501'; end if;
 return private.request_showing_before_entitlements(rid,request_id,listing_id,starts,duration);
end; $$;
revoke all on function private.request_showing(uuid,text,text,bigint,integer) from public,anon;
grant execute on function private.request_showing(uuid,text,text,bigint,integer) to authenticated;
-- Billing writes are exclusively available to a verified provider handler, never the app role.
create function private.billing_snapshot(rid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.billing_accounts%rowtype;
begin
 insert into private.billing_accounts(realtor_id) values(rid) on conflict do nothing;
 select * into b from private.billing_accounts where realtor_id=rid;
 return to_jsonb(b);
end; $$;
create function public.billing_snapshot(p_realtor_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.billing_snapshot(p_realtor_id); $$;
create function private.billing_customer(customer_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('realtor_id',realtor_id,'provider_subscription_id',provider_subscription_id) from private.billing_accounts where provider_customer_id=customer_id; $$;
create function public.billing_customer(p_customer_id text) returns jsonb language sql security invoker set search_path='' as $$ select private.billing_customer(p_customer_id); $$;
revoke all on function private.billing_customer(text),public.billing_customer(text) from public,anon,authenticated;
grant execute on function private.billing_customer(text),public.billing_customer(text) to service_role;
create function private.billing_apply(rid uuid,expected_revision bigint,event_id text,snapshot jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.billing_accounts%rowtype; paid timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('entitlement:'||rid::text,0));
 perform private.billing_snapshot(rid);
 select * into b from private.billing_accounts where realtor_id=rid for update;
 if event_id is not null and exists(select 1 from private.billing_events e where e.event_id=billing_apply.event_id) then return jsonb_build_object('ok',true,'duplicate',true); end if;
 if b.revision<>expected_revision then return jsonb_build_object('ok',false,'retry',true); end if;
 if b.provider_customer_id is distinct from snapshot->>'customer' then raise exception 'Customer mismatch'; end if;
 if snapshot->>'interval' not in ('month','year') then raise exception 'Invalid interval'; end if;
 paid:=nullif(snapshot->>'paid_through','')::timestamptz;
 update private.billing_accounts set provider_subscription_id=snapshot->>'subscription',status=snapshot->>'status',
 billing_interval=snapshot->>'interval',paid_through=greatest(b.paid_through,paid),period_end=nullif(snapshot->>'period_end','')::timestamptz,
 ever_paid=b.ever_paid or paid is not null,cancel_at_period_end=coalesce((snapshot->>'cancel_at_period_end')::boolean,false),
 payment_issue=coalesce((snapshot->>'payment_issue')::boolean,false),revision=revision+1,updated_at=now()
 where realtor_id=rid;
 if event_id is not null then insert into private.billing_events(event_id,realtor_id) values(event_id,rid); end if;
 return jsonb_build_object('ok',true);
end; $$;
create function public.billing_apply(p_realtor_id uuid,p_expected_revision bigint,p_event_id text,p_snapshot jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.billing_apply(p_realtor_id,p_expected_revision,p_event_id,p_snapshot); $$;
create function private.billing_checkout(rid uuid,customer_id text,session_id text,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.billing_accounts%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('entitlement:'||rid::text,0));
 perform private.billing_snapshot(rid);
 select * into b from private.billing_accounts where realtor_id=rid for update;
 if request_key is null then
  if b.checkout_until>now() then return jsonb_build_object('ok',false,'busy',true,'session',b.checkout_session_id); end if;
  update private.billing_accounts set checkout_key=gen_random_uuid(),checkout_until=now()+interval '20 minutes' where realtor_id=rid returning * into b;
 else
  if b.checkout_key is distinct from request_key then raise exception 'Checkout superseded'; end if;
  update private.billing_accounts set provider_customer_id=coalesce(provider_customer_id,customer_id),checkout_session_id=session_id where realtor_id=rid returning * into b;
 end if;
 return to_jsonb(b)||jsonb_build_object('ok',true);
end; $$;
create function public.billing_checkout(p_realtor_id uuid,p_customer_id text,p_session_id text,p_request_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.billing_checkout(p_realtor_id,p_customer_id,p_session_id,p_request_key); $$;
-- Owner-only direct table access must also honor inactivity; billing/export use narrow RPCs.
create policy "kv service active" on public.app_kv as restrictive for all to authenticated
 using (private.service_active(split_part(key,':',1)::uuid)) with check (private.service_active(split_part(key,':',1)::uuid));
create policy "listing source service active" on public.listing_sources as restrictive for all to authenticated
 using(private.service_active(realtor_id)) with check(private.service_active(realtor_id));
create policy "build service active" on public.realtor_builds as restrictive for all to authenticated
 using(exists(select 1 from public.realtors r where r.auth_user_id=realtor_builds.auth_user_id and private.service_active(r.id)))
 with check(exists(select 1 from public.realtors r where r.auth_user_id=realtor_builds.auth_user_id and private.service_active(r.id)));
create function private.storage_service_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.realtors r where r.auth_user_id=auth.uid() and private.service_active(r.id))
 or exists(select 1 from private.client_sessions s where s.auth_user_id=auth.uid() and private.bound_client(s.realtor_id) is not null);
$$;
revoke all on function private.storage_service_active() from public,anon;
grant execute on function private.storage_service_active() to authenticated;
create policy "storage service active" on storage.objects as restrictive for all to authenticated
 using ((select private.storage_service_active())) with check ((select private.storage_service_active()));
-- No private helper is implicitly callable through the inherited PUBLIC privilege.
revoke all on function private.service_active(uuid),private.entitlement(uuid),private.activate_relationship(uuid),private.disconnect_relationship(uuid,text),private.seat_state(uuid),private.experience_access(uuid),private.export_realtor(uuid),private.billing_snapshot(uuid),private.billing_apply(uuid,bigint,text,jsonb),private.billing_checkout(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.claim_client_seat(uuid,text,text,text),public.disconnect_client(uuid,text),public.realtor_seat_state(uuid),public.mark_attempts_seen(uuid),public.experience_access(uuid),public.export_realtor_data(uuid),public.billing_snapshot(uuid),public.billing_apply(uuid,bigint,text,jsonb),public.billing_checkout(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function private.service_active(uuid),private.activate_relationship(uuid),private.disconnect_relationship(uuid,text),private.seat_state(uuid),private.experience_access(uuid),private.export_realtor(uuid),public.claim_client_seat(uuid,text,text,text),public.disconnect_client(uuid,text),public.realtor_seat_state(uuid),public.mark_attempts_seen(uuid),public.experience_access(uuid),public.export_realtor_data(uuid) to authenticated;
grant execute on function private.billing_snapshot(uuid),private.billing_apply(uuid,bigint,text,jsonb),private.billing_checkout(uuid,text,text,uuid),public.billing_snapshot(uuid),public.billing_apply(uuid,bigint,text,jsonb),public.billing_checkout(uuid,text,text,uuid) to service_role;
grant execute on function private.bound_client(uuid),private.authenticate_client(uuid,text,text),private.kv_read(text),private.kv_write(text,jsonb,bigint) to authenticated;
revoke all on function private.bound_client(uuid),private.authenticate_client(uuid,text,text),private.kv_read(text),private.kv_write(text,jsonb,bigint) from public,anon;
commit;
