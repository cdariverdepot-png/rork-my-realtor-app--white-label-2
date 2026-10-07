-- Isolated fixture reproducing the LIVE pre-subscription schema (tables, grants and the exact
-- production function bodies captured 2026-10-07). Used to prove the subscription migration applies
-- to production unchanged. NEVER apply to a real project.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth; create schema private; create schema storage; create schema extensions;
create extension pgcrypto schema extensions;
grant usage on schema public,auth,private,extensions to authenticated,service_role,anon;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
create table storage.objects(id uuid default gen_random_uuid(),name text);
create table public.realtors(id uuid primary key default gen_random_uuid(), email text not null unique, name text not null, password_hash text not null, brand_name text not null default '', monogram text not null default '', client_code text unique, client_code_enabled boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), auth_user_id uuid unique);
create table public.client_accounts(realtor_id uuid not null, email text not null, pw_hash text not null, client_id text not null, name text not null default '', created_at timestamptz not null default now(), failed_attempts integer not null default 0, locked_until timestamptz, primary key(realtor_id,email));
create unique index client_accounts_identity on public.client_accounts(realtor_id,client_id);
create table public.app_kv(key text primary key, value jsonb not null, rev bigint not null default 0, updated_at timestamptz not null default now());
create table public.push_tokens(token text primary key, realtor_id uuid not null, role text not null, owner_key text not null, client_id text, platform text not null default 'unknown', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), auth_user_id uuid);
create table public.realtor_builds(auth_user_id uuid primary key, realtor_id uuid, status text not null default 'collecting', sources jsonb not null default '[]', draft jsonb not null default '{}', evidence jsonb not null default '[]', selected_layout text, completed_at timestamptz, updated_at timestamptz not null default now());
create table private.client_sessions(auth_user_id uuid primary key, realtor_id uuid not null, client_id text not null, credential_version text not null, created_at timestamptz not null default now());
create table private.public_leads(auth_user_id uuid not null, realtor_id uuid not null, lead_id text not null, name text not null, email text not null, phone text not null, primary key(auth_user_id,realtor_id));
alter table public.app_kv enable row level security; alter table public.realtor_builds enable row level security; alter table public.realtors enable row level security;
create policy "kv owner read" on public.app_kv for select to authenticated using ((substring(key from 38) !~~ 'auth.%') and exists(select 1 from public.realtors r where r.id::text=split_part(app_kv.key,':',1) and r.auth_user_id=(select auth.uid())));
create policy "realtor builds own read" on public.realtor_builds for select to authenticated using (auth.uid()=auth_user_id);
create policy "realtor owner read" on public.realtors for select to authenticated using (auth.uid()=auth_user_id);
grant select on public.app_kv,public.realtor_builds,public.realtors to authenticated;

CREATE FUNCTION private.realtor_owner(rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 select auth.uid() is not null and exists(select 1 from public.realtors where id=rid and auth_user_id=auth.uid());
$function$;
CREATE FUNCTION private.verify_client_account(p_realtor_id uuid, p_email text, p_pw_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
declare v_row public.client_accounts%rowtype; v_email text := lower(trim(coalesce(p_email, ''))); v_match boolean;
begin
  select * into v_row from public.client_accounts where realtor_id = p_realtor_id and email = v_email for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_row.locked_until is not null and v_row.locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if v_row.pw_hash like '$2%' then v_match := crypt(coalesce(p_pw_hash, ''), v_row.pw_hash) = v_row.pw_hash;
  else v_match := v_row.pw_hash = coalesce(p_pw_hash, ''); end if;
  if not v_match then
    update public.client_accounts set failed_attempts = failed_attempts + 1, locked_until = case when failed_attempts + 1 >= 10 then now() + interval '15 minutes' else locked_until end where realtor_id = p_realtor_id and email = v_email;
    return jsonb_build_object('ok', false, 'reason', 'bad_password');
  end if;
  update public.client_accounts set failed_attempts = 0, locked_until = null, pw_hash = case when pw_hash like '$2%' then pw_hash else crypt(p_pw_hash, gen_salt('bf', 10)) end where realtor_id = p_realtor_id and email = v_email;
  return jsonb_build_object('ok', true, 'client_id', v_row.client_id, 'name', v_row.name);
end;
$function$;
CREATE FUNCTION private.register_client_account(p_realtor_id uuid, p_email text, p_pw_hash text, p_client_id text, p_name text DEFAULT ''::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_realtor_id is null or v_email = '' or coalesce(p_client_id, '') = '' or coalesce(p_pw_hash, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if not exists (select 1 from public.realtors where id = p_realtor_id) then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if to_regclass('public.client_connections') is not null then
    if not exists (select 1 from public.client_connections where realtor_id = p_realtor_id and client_key = v_email and status = 'active') then return jsonb_build_object('ok', false, 'reason', 'no_seat'); end if;
  end if;
  insert into public.client_accounts (realtor_id, email, pw_hash, client_id, name) values (p_realtor_id, v_email, crypt(p_pw_hash, gen_salt('bf', 10)), p_client_id, coalesce(p_name, '')) on conflict (realtor_id, email) do nothing;
  return jsonb_build_object('ok', true, 'created', found);
end;
$function$;
CREATE FUNCTION private.authenticate_client(rid uuid, email_input text, hash_input text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare result jsonb; account public.client_accounts%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in is required' using errcode='42501'; end if;
 if exists(select 1 from public.realtors where auth_user_id=auth.uid()) then raise exception 'Use a client session' using errcode='42501'; end if;
 result:=private.verify_client_account(rid,email_input,hash_input);
 if result->>'ok'='true' then
  select * into account from public.client_accounts where realtor_id=rid and email=lower(trim(email_input));
  insert into private.client_sessions(auth_user_id,realtor_id,client_id,credential_version) values(auth.uid(),rid,account.client_id,account.pw_hash)
   on conflict(auth_user_id) do update set realtor_id=excluded.realtor_id,client_id=excluded.client_id,credential_version=excluded.credential_version,created_at=now();
 end if;
 return result;
end; $function$;
CREATE FUNCTION private.bound_client(rid uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 select s.client_id from private.client_sessions s join public.client_accounts a on a.realtor_id=s.realtor_id and a.client_id=s.client_id
 where s.auth_user_id=auth.uid() and s.realtor_id=rid and s.credential_version=a.pw_hash limit 1;
$function$;
CREATE FUNCTION private.client_identity() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
declare grant_row private.client_sessions%rowtype;
begin
 select * into grant_row from private.client_sessions where auth_user_id=auth.uid();
 if not found or private.bound_client(grant_row.realtor_id) is null then return null; end if;
 return jsonb_build_object('realtorId',grant_row.realtor_id,'clientId',grant_row.client_id);
end; $function$;
CREATE FUNCTION private.create_client(rid uuid, email_input text, hash_input text, cid text, name_input text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in is required' using errcode='42501'; end if;
 if exists(select 1 from public.realtors where auth_user_id=auth.uid()) then raise exception 'Use a client session' using errcode='42501'; end if;
 if not exists(select 1 from public.realtors where id=rid and client_code_enabled) then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 if length(cid)>160 or length(name_input)>240 or length(email_input)>320 then raise exception 'Invalid account'; end if;
 result:=private.register_client_account(rid,email_input,hash_input,cid,name_input);
 if result->>'created'='true' then perform private.authenticate_client(rid,email_input,hash_input); end if;
 return result;
end; $function$;
CREATE FUNCTION private.kv_read(k text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
declare rid uuid; suffix text; cid text; row_value jsonb; row_rev bigint; tx jsonb;
begin
 if split_part(k,':',1) !~ '^[0-9a-fA-F-]{36}$' then return null; end if;
 rid:=split_part(k,':',1)::uuid; suffix:=substring(k from 38);
 select value,rev into row_value,row_rev from public.app_kv where key=k;
 if not found then return null; end if;
 if suffix like 'auth.%' then return null; end if;
 if private.realtor_owner(rid) then return jsonb_build_object('value',row_value,'rev',row_rev); end if;
 cid:=private.bound_client(rid);
 if cid is null and not (suffix in ('brand.v2','listings.v2') and exists(select 1 from public.realtors where id=rid and client_code_enabled)) then return null; end if;
 case suffix
 when 'brand.v2' then null;
 when 'listings.v2' then
  row_value:=jsonb_set(row_value,'{items}',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(row_value->'items','[]')) x where coalesce(x->>'hidden','false')<>'true' and coalesce(x->>'sourceArchived','false')<>'true'),'[]'));
 when 'clientProfiles.v1','clientFeed.v1' then row_value:=case when row_value ? cid then jsonb_build_object(cid,row_value->cid) else '{}'::jsonb end;
 when 'clients.v1' then row_value:=coalesce((select jsonb_agg(x) from jsonb_array_elements(row_value) x where x->>'id'=cid),'[]');
 when 'tx.v1' then row_value:=coalesce((select jsonb_agg(x) from jsonb_array_elements(row_value) x where coalesce(x->'clientIds','[]') ? cid),'[]');
 when 'docs.v2' then
  select value into tx from public.app_kv where key=rid::text||':tx.v1';
  row_value:=coalesce((select jsonb_agg(x) from jsonb_array_elements(row_value) x
   where (x->'recipientIds' ? cid or (nullif(x->>'transactionId','') is not null and (not(x ? 'recipientIds') or jsonb_array_length(coalesce(x->'recipientIds','[]'))=0)))
    and (nullif(x->>'transactionId','') is null or exists(select 1 from jsonb_array_elements(coalesce(tx,'[]')) t where t->>'id'=x->>'transactionId' and coalesce(t->'clientIds','[]') ? cid))),'[]');
 when 'appointments.v1' then row_value:=coalesce((select jsonb_agg(x) from jsonb_array_elements(row_value) x where coalesce(x->'recipientIds','[]') ? cid),'[]');
 when 'notifs.v1' then row_value:=coalesce((select jsonb_agg(x) from jsonb_array_elements(row_value) x where coalesce(x->>'audience','')<>'realtor' and (not(x ? 'recipientIds') or jsonb_array_length(coalesce(x->'recipientIds','[]'))=0 or x->'recipientIds' ? cid)),'[]');
 else if suffix<>cid||':chat.v1' and suffix<>cid||':favorites.v1' then return null; end if;
 end case;
 return jsonb_build_object('value',row_value,'rev',row_rev);
end; $function$;
CREATE FUNCTION private.kv_write(k text, v jsonb, requested_rev bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare rid uuid; suffix text; cid text; old jsonb; merged jsonb; e jsonb; previous jsonb; readable jsonb;
begin
 if auth.uid() is null or split_part(k,':',1) !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Not authorized' using errcode='42501'; end if;
 if octet_length(v::text)>4000000 then raise exception 'Record too large'; end if;
 rid:=split_part(k,':',1)::uuid; suffix:=substring(k from 38);
 perform pg_advisory_xact_lock(hashtextextended(k,0));
 select value into old from public.app_kv where key=k for update;
 if suffix like 'auth.%' then raise exception 'Credentials are not shared records' using errcode='42501'; end if;
 if private.realtor_owner(rid) then merged:=v;
 else
  cid:=private.bound_client(rid);
  if cid is null then raise exception 'Sign in again to access your account' using errcode='42501'; end if;
  if suffix='clientProfiles.v1' then
   if jsonb_typeof(v)<>'object' or exists(select 1 from jsonb_object_keys(v) name where name<>cid) then raise exception 'Not your profile' using errcode='42501'; end if;
   if not(v ? cid) then return; end if;
   if v->cid->>'clientId' is distinct from cid then raise exception 'Invalid profile identity'; end if;
   merged:=coalesce(old,'{}')||jsonb_build_object(cid,v->cid);
  elsif suffix='clientFeed.v1' then
   if jsonb_typeof(v)<>'object' or exists(select 1 from jsonb_object_keys(v) name where name<>cid) then raise exception 'Not your feed' using errcode='42501'; end if;
   if not(v ? cid) then return; end if;
   merged:=coalesce(old,'{}')||jsonb_build_object(cid,coalesce(old->cid,jsonb_build_object('clientId',cid,'notes','[]'::jsonb,'pinnedListingIds','[]'::jsonb,'pinnedDocumentIds','[]'::jsonb))||jsonb_build_object('savedSearches',coalesce(v->cid->'savedSearches','[]'),'updatedAt',v->cid->'updatedAt'));
  elsif suffix=cid||':favorites.v1' then merged:=v;
  elsif suffix in ('clients.v1','appointments.v1','notifs.v1','docs.v2') or suffix=cid||':chat.v1' then
   if jsonb_typeof(v)<>'array' then raise exception 'Invalid collection'; end if;
   merged:=coalesce(old,'[]'); readable:=private.kv_read(k)->'value';
   for e in select value from jsonb_array_elements(v) loop
    if nullif(e->>'id','') is null then raise exception 'Missing record identity'; end if;
    select value into previous from jsonb_array_elements(merged) where value->>'id'=e->>'id' limit 1;
    if suffix='clients.v1' then
     if e->>'id'<>cid then raise exception 'Not your contact' using errcode='42501'; end if;
     e:=coalesce(previous,e)||jsonb_build_object('name',e->>'name','phone',e->>'phone');
    elsif suffix='appointments.v1' then
     if previous is not null then
      if not(coalesce(previous->'recipientIds','[]') ? cid) then raise exception 'Not your appointment' using errcode='42501'; end if;
      if e<>previous then raise exception 'Ask your realtor to change this appointment' using errcode='42501'; end if;
     else
      if e->>'createdBy' is distinct from 'client' or e->>'status' is distinct from 'requested' or e->'recipientIds' is distinct from jsonb_build_array(cid) then raise exception 'Invalid showing request' using errcode='42501'; end if;
     end if;
    elsif suffix='docs.v2' then
     if previous is null or not exists(select 1 from jsonb_array_elements(coalesce(readable,'[]')) x where x->>'id'=e->>'id') then raise exception 'Not your document' using errcode='42501'; end if;
     if (e-'status'-'viewedAt')<>(previous-'status'-'viewedAt') or (e->>'status') not in ('viewed',previous->>'status') then raise exception 'Document changes require your realtor' using errcode='42501'; end if;
     e:=previous||jsonb_build_object('status',e->>'status','viewedAt',e->'viewedAt');
    elsif suffix='notifs.v1' then
     if previous is not null then
      if not exists(select 1 from jsonb_array_elements(coalesce(readable,'[]')) x where x->>'id'=e->>'id') then raise exception 'Not your notification' using errcode='42501'; end if;
      if (e-'read')<>(previous-'read') then raise exception 'Notification content is read only' using errcode='42501'; end if;
      e:=previous||jsonb_build_object('read',e->'read');
     else
      if e->>'audience' is distinct from 'realtor' then raise exception 'Cannot notify other clients' using errcode='42501'; end if;
      e:=e||jsonb_build_object('senderClientId',cid);
     end if;
    else
     if previous is not null then
      if (e-'read')<>(previous-'read') then raise exception 'Existing messages cannot be edited' using errcode='42501'; end if;
      e:=previous||jsonb_build_object('read',e->'read');
     elsif e->>'role' is distinct from 'client' or length(coalesce(e->>'text',''))>12000 then raise exception 'Invalid sender' using errcode='42501'; end if;
    end if;
    merged:=coalesce((select jsonb_agg(x) from jsonb_array_elements(merged) x where x->>'id'<>e->>'id'),'[]')||jsonb_build_array(e);
   end loop;
  else raise exception 'This record is managed by your realtor' using errcode='42501'; end if;
 end if;
 insert into public.app_kv(key,value,rev,updated_at) values(k,merged,greatest(requested_rev,extract(epoch from clock_timestamp())::bigint*1000),now())
 on conflict(key) do update set value=excluded.value,rev=greatest(app_kv.rev+1,excluded.rev),updated_at=now();
end; $function$;
CREATE FUNCTION private.active_push_tokens(rid uuid, target_role text, client_ids jsonb) RETURNS TABLE(token text, role text, client_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 select t.token,t.role,t.client_id from public.push_tokens t where t.realtor_id=rid and t.role=target_role and t.auth_user_id is not null
 and ((target_role='admin' and exists(select 1 from public.realtors r where r.id=rid and r.auth_user_id=t.auth_user_id))
 or (target_role='client' and (client_ids is null or client_ids ? t.client_id) and exists(select 1 from private.client_sessions s join public.client_accounts a on a.realtor_id=s.realtor_id and a.client_id=s.client_id and a.pw_hash=s.credential_version
 where s.auth_user_id=t.auth_user_id and s.realtor_id=rid and s.client_id=t.client_id)));
$function$;
CREATE FUNCTION private.capture_public_lead(rid uuid, n text, e text, p text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare cid text; k text; roster jsonb; stamp bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.realtors where id=rid and client_code_enabled) then raise exception 'This invitation is unavailable' using errcode='42501'; end if;
 n:=trim(coalesce(n,'')); e:=lower(trim(coalesce(e,''))); p:=trim(coalesce(p,''));
 if length(n)<2 or length(n)>240 or length(e)>320 or length(p)>80 or (e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(p)<6) then raise exception 'Please enter your name and contact details'; end if;
 perform pg_advisory_xact_lock(hashtextextended(rid::text||':clients.v1',0));
 select lead_id into cid from private.public_leads where auth_user_id=auth.uid() and realtor_id=rid;
 if cid is not null then return cid; end if;
 cid:='lead_'||gen_random_uuid()::text;
 insert into private.public_leads values(auth.uid(),rid,cid,n,e,p);
 k:=rid::text||':clients.v1'; stamp:=(extract(epoch from clock_timestamp())*1000)::bigint;
 select value into roster from public.app_kv where key=k;
 roster:=coalesce(roster,'[]')||jsonb_build_array(jsonb_build_object('id',cid,'name',n,'email',e,'phone',p,'tag','Booking','source','booking','createdAt',stamp));
 insert into public.app_kv(key,value,rev) values(k,roster,stamp) on conflict(key) do update set value=excluded.value,rev=greatest(app_kv.rev+1,excluded.rev),updated_at=now();
 return cid;
end; $function$;
CREATE FUNCTION private.request_showing(rid uuid, request_id text, listing_id text, starts bigint, duration integer) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare cid text; k text; items jsonb; listing jsonb; existing jsonb; stamp bigint;
begin
 if auth.uid() is null then raise exception 'Please reconnect' using errcode='42501'; end if;
 cid:=private.bound_client(rid);
 if cid is null then select lead_id into cid from private.public_leads where auth_user_id=auth.uid() and realtor_id=rid; end if;
 if cid is null then raise exception 'Please open your invitation and enter your details first' using errcode='42501'; end if;
 if not exists(select 1 from public.realtors where id=rid and client_code_enabled) then raise exception 'This invitation is unavailable'; end if;
 stamp:=(extract(epoch from clock_timestamp())*1000)::bigint;
 if request_id is null or length(request_id)<1 or length(request_id)>160 or starts is null or starts<stamp or starts>stamp+63072000000 or duration is null or duration<15 or duration>180 then raise exception 'Please choose a valid viewing time'; end if;
 select x into listing from public.app_kv a cross join lateral jsonb_array_elements(coalesce(a.value->'items',a.value)) x where a.key=rid::text||':listings.v2' and x->>'id'=listing_id and not coalesce((x->>'hidden')::boolean,false) and not coalesce((x->>'sourceArchived')::boolean,false) limit 1;
 if listing is null then raise exception 'This home is no longer available to book'; end if;
 k:=rid::text||':appointments.v1'; perform pg_advisory_xact_lock(hashtextextended(k,0));
 select value into items from public.app_kv where key=k; items:=coalesce(items,'[]');
 select x into existing from jsonb_array_elements(items) x where x->>'id'=request_id;
 if existing is not null then
  if not coalesce(existing->'recipientIds' ? cid,false) then raise exception 'Please start a new request' using errcode='42501'; end if;
  return request_id;
 end if;
 if (select count(*) from jsonb_array_elements(items) x where x->'recipientIds' ? cid and coalesce((x->>'updatedAt')::bigint,0)>stamp-86400000)>=10 then raise exception 'Please contact your realtor about additional viewing requests'; end if;
 items:=jsonb_build_array(jsonb_build_object('id',request_id,'listingId',listing_id,'listingTitle',listing->>'title','startsAt',starts,'durationMin',duration,'status','requested','createdBy','client','recipientIds',jsonb_build_array(cid),'updatedAt',stamp))||items;
 insert into public.app_kv(key,value,rev) values(k,items,stamp) on conflict(key) do update set value=excluded.value,rev=greatest(app_kv.rev+1,excluded.rev),updated_at=now();
 return request_id;
end; $function$;
CREATE FUNCTION public.authorize_push(p_realtor_id uuid, p_audience text) RETURNS boolean LANGUAGE sql SET search_path TO '' AS $function$ select private.realtor_owner(p_realtor_id) or (p_audience='realtor' and private.bound_client(p_realtor_id) is not null); $function$;
CREATE FUNCTION public.capture_public_lead(p_realtor_id uuid, p_name text, p_email text, p_phone text) RETURNS text LANGUAGE sql SET search_path TO '' AS $function$ select private.capture_public_lead(p_realtor_id,p_name,p_email,p_phone); $function$;
CREATE FUNCTION public.current_client_identity() RETURNS jsonb LANGUAGE sql SET search_path TO '' AS $function$ select private.client_identity(); $function$;
CREATE FUNCTION public.register_client_account(p_realtor_id uuid, p_email text, p_pw_hash text, p_client_id text, p_name text DEFAULT ''::text) RETURNS jsonb LANGUAGE sql SET search_path TO '' AS $function$ select private.create_client(p_realtor_id,p_email,p_pw_hash,p_client_id,p_name); $function$;
CREATE FUNCTION public.request_public_showing(p_realtor_id uuid, p_request_id text, p_listing_id text, p_starts_at bigint, p_duration_min integer) RETURNS text LANGUAGE sql SET search_path TO '' AS $function$ select private.request_showing(p_realtor_id,p_request_id,p_listing_id,p_starts_at,p_duration_min); $function$;
CREATE FUNCTION public.resolve_push_recipients(p_realtor_id uuid, p_target_role text, p_client_ids jsonb DEFAULT NULL::jsonb) RETURNS TABLE(token text, role text, client_id text) LANGUAGE sql SET search_path TO '' AS $function$ select * from private.active_push_tokens(p_realtor_id,p_target_role,p_client_ids); $function$;
CREATE FUNCTION public.secure_kv_get(p_key text) RETURNS jsonb LANGUAGE sql SET search_path TO '' AS $function$ select private.kv_read(p_key); $function$;
CREATE FUNCTION public.secure_kv_set(p_key text, p_value jsonb, p_rev bigint) RETURNS void LANGUAGE sql SET search_path TO '' AS $function$ select private.kv_write(p_key,p_value,p_rev); $function$;
CREATE FUNCTION public.verify_client_account(p_realtor_id uuid, p_email text, p_pw_hash text) RETURNS jsonb LANGUAGE sql SET search_path TO '' AS $function$ select private.authenticate_client(p_realtor_id,p_email,p_pw_hash); $function$;
-- Live grants (captured from pg_proc.proacl).
revoke all on all functions in schema private from public;
revoke all on all functions in schema public from public;
grant execute on function private.active_push_tokens(uuid,text,jsonb),private.register_client_account(uuid,text,text,text,text),private.verify_client_account(uuid,text,text) to service_role;
grant execute on function private.authenticate_client(uuid,text,text),private.bound_client(uuid),private.capture_public_lead(uuid,text,text,text),private.client_identity(),private.create_client(uuid,text,text,text,text),private.kv_read(text),private.kv_write(text,jsonb,bigint),private.realtor_owner(uuid),private.request_showing(uuid,text,text,bigint,integer) to authenticated;
grant execute on function public.authorize_push(uuid,text),public.capture_public_lead(uuid,text,text,text),public.current_client_identity(),public.register_client_account(uuid,text,text,text,text),public.secure_kv_get(text),public.secure_kv_set(text,jsonb,bigint),public.verify_client_account(uuid,text,text),public.request_public_showing(uuid,text,text,bigint,integer) to authenticated,service_role;
grant execute on function public.resolve_push_recipients(uuid,text,jsonb) to service_role;
-- Supabase grants new public functions to anon/authenticated/service_role by default.
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
