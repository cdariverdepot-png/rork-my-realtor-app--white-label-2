begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create table if not exists private.client_sessions (
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 realtor_id uuid not null references public.realtors(id) on delete cascade,
 client_id text not null, credential_version text not null, created_at timestamptz not null default now()
);
alter table private.client_sessions enable row level security;
revoke all on private.client_sessions from public,anon,authenticated;
create unique index if not exists client_accounts_identity on public.client_accounts(realtor_id,client_id);

create or replace function private.realtor_owner(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.realtors where id=rid and auth_user_id=auth.uid());
$$;
create or replace function private.bound_client(rid uuid) returns text language sql stable security definer set search_path='' as $$
 select s.client_id from private.client_sessions s join public.client_accounts a on a.realtor_id=s.realtor_id and a.client_id=s.client_id
 where s.auth_user_id=auth.uid() and s.realtor_id=rid and s.credential_version=a.pw_hash limit 1;
$$;
revoke all on function private.realtor_owner(uuid),private.bound_client(uuid) from public,anon;
grant execute on function private.realtor_owner(uuid),private.bound_client(uuid) to authenticated;

-- Preserve bcrypt/password throttling, but bind successful authentication to a real JWT identity.
alter function public.verify_client_account(uuid,text,text) set schema private;
alter function public.register_client_account(uuid,text,text,text,text) set schema private;
revoke all on function private.verify_client_account(uuid,text,text),private.register_client_account(uuid,text,text,text,text) from public,anon,authenticated;
create or replace function private.authenticate_client(rid uuid,email_input text,hash_input text) returns jsonb language plpgsql security definer set search_path='' as $$
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
end; $$;
create or replace function private.create_client(rid uuid,email_input text,hash_input text,cid text,name_input text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in is required' using errcode='42501'; end if;
 if exists(select 1 from public.realtors where auth_user_id=auth.uid()) then raise exception 'Use a client session' using errcode='42501'; end if;
 if not exists(select 1 from public.realtors where id=rid and client_code_enabled) then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 if length(cid)>160 or length(name_input)>240 or length(email_input)>320 then raise exception 'Invalid account'; end if;
 result:=private.register_client_account(rid,email_input,hash_input,cid,name_input);
 if result->>'created'='true' then perform private.authenticate_client(rid,email_input,hash_input); end if;
 return result;
end; $$;
create or replace function public.verify_client_account(p_realtor_id uuid,p_email text,p_pw_hash text) returns jsonb language sql security invoker set search_path='' as $$ select private.authenticate_client(p_realtor_id,p_email,p_pw_hash); $$;
create or replace function public.register_client_account(p_realtor_id uuid,p_email text,p_pw_hash text,p_client_id text,p_name text default '') returns jsonb language sql security invoker set search_path='' as $$ select private.create_client(p_realtor_id,p_email,p_pw_hash,p_client_id,p_name); $$;
create or replace function private.client_identity() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare grant_row private.client_sessions%rowtype;
begin
 select * into grant_row from private.client_sessions where auth_user_id=auth.uid();
 if not found or private.bound_client(grant_row.realtor_id) is null then return null; end if;
 return jsonb_build_object('realtorId',grant_row.realtor_id,'clientId',grant_row.client_id);
end; $$;
create or replace function public.current_client_identity() returns jsonb language sql security invoker set search_path='' as $$ select private.client_identity(); $$;
create or replace function private.create_guest_realtor() returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if auth.uid() is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Start a guest session'; end if;
 select id into rid from public.realtors where auth_user_id=auth.uid();
 if rid is not null then return rid; end if;
 insert into public.realtors(id,email,name,password_hash,auth_user_id,client_code_enabled) values(auth.uid(),'guest+realtor+'||auth.uid()::text||'@guest.myrealtor.app','','supabase-auth-only',auth.uid(),false) returning id into rid;
 return rid;
end; $$;
create or replace function public.create_guest_realtor() returns uuid language sql security invoker set search_path='' as $$ select private.create_guest_realtor(); $$;

create or replace function private.kv_read(k text) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
end; $$;
create or replace function public.secure_kv_get(p_key text) returns jsonb language sql security invoker set search_path='' as $$ select private.kv_read(p_key); $$;

create or replace function private.kv_write(k text,v jsonb,requested_rev bigint) returns void language plpgsql security definer set search_path='' as $$
declare rid uuid; suffix text; cid text; old jsonb; merged jsonb; e jsonb; previous jsonb; readable jsonb;
begin
 if auth.uid() is null or split_part(k,':',1) !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Not authorized' using errcode='42501'; end if;
 if octet_length(v::text)>4000000 then raise exception 'Record too large'; end if;
 rid:=split_part(k,':',1)::uuid; suffix:=substring(k from 38);
 -- Serialize merges including the first insert; client snapshots never replace other clients.
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
end; $$;
create or replace function public.secure_kv_set(p_key text,p_value jsonb,p_rev bigint) returns void language sql security invoker set search_path='' as $$ select private.kv_write(p_key,p_value,p_rev); $$;

-- Every direct shared-table access now requires the verified realtor owner.
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename in ('app_kv','push_tokens') loop
 execute format('drop policy %I on public.%I',p.policyname,(select tablename from pg_policies where schemaname='public' and policyname=p.policyname limit 1)); end loop; end $$;
revoke all on public.app_kv,public.push_tokens,public.client_accounts from anon,authenticated;
grant select on public.app_kv to authenticated;
create policy "kv owner read" on public.app_kv for select to authenticated using (substring(key from 38) not like 'auth.%' and exists(select 1 from public.realtors r where r.id::text=split_part(key,':',1) and r.auth_user_id=(select auth.uid())));
alter table public.push_tokens add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
grant delete on public.push_tokens to authenticated;
create policy "push owner delete" on public.push_tokens for delete to authenticated using(auth_user_id=(select auth.uid()));
grant select on public.push_tokens to authenticated;
create policy "push owner read" on public.push_tokens for select to authenticated using(auth_user_id=(select auth.uid()));
create or replace function private.register_device(tok text,rid uuid,kind text,owner_key_input text,cid text,platform_input text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or (kind='admin' and not private.realtor_owner(rid)) or (kind='client' and (private.bound_client(rid) is null or private.bound_client(rid)<>cid)) or kind not in ('admin','client') then raise exception 'Not authorized' using errcode='42501'; end if;
 if tok !~ '^(ExponentPushToken|ExpoPushToken)\[' or length(tok)>240 then raise exception 'Invalid device token'; end if;
 if exists(select 1 from public.push_tokens where token=tok and auth_user_id is not null and auth_user_id<>auth.uid()) then raise exception 'Device belongs to another session' using errcode='42501'; end if;
 insert into public.push_tokens(token,realtor_id,role,owner_key,client_id,platform,auth_user_id) values(tok,rid,kind,lower(trim(owner_key_input)),cid,platform_input,auth.uid())
 on conflict(token) do update set realtor_id=excluded.realtor_id,role=excluded.role,owner_key=excluded.owner_key,client_id=excluded.client_id,platform=excluded.platform,auth_user_id=excluded.auth_user_id,updated_at=now();
 return jsonb_build_object('ok',true);
end; $$;
create or replace function public.register_push_token(p_token text,p_realtor_id uuid,p_role text,p_owner_key text,p_client_id text default null,p_platform text default 'unknown') returns jsonb language sql security invoker set search_path='' as $$ select private.register_device(p_token,p_realtor_id,p_role,p_owner_key,p_client_id,p_platform); $$;
create or replace function public.authorize_push(p_realtor_id uuid,p_audience text) returns boolean language sql security invoker set search_path='' as $$ select private.realtor_owner(p_realtor_id) or (p_audience='realtor' and private.bound_client(p_realtor_id) is not null); $$;
create or replace function private.delete_client(rid uuid,email_input text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid text; suffix text; row_data record;
begin
 select client_id into cid from public.client_accounts where realtor_id=rid and email=lower(trim(email_input));
 if cid is null or not(private.realtor_owner(rid) or private.bound_client(rid)=cid) then raise exception 'Not authorized' using errcode='42501'; end if;
 delete from public.app_kv where key in (rid::text||':'||cid||':chat.v1',rid::text||':'||cid||':favorites.v1');
 for row_data in select key,value from public.app_kv where key in (rid::text||':clientProfiles.v1',rid::text||':clientFeed.v1') for update loop
  update public.app_kv set value=row_data.value-cid,rev=rev+1,updated_at=now() where key=row_data.key;
 end loop;
 update public.app_kv set value=coalesce((select jsonb_agg(x) from jsonb_array_elements(value) x where x->>'id'<>cid),'[]'),rev=rev+1,updated_at=now() where key=rid::text||':clients.v1';
 delete from public.push_tokens where realtor_id=rid and client_id=cid;
 delete from private.client_sessions where realtor_id=rid and client_id=cid;
 delete from public.client_accounts where realtor_id=rid and client_id=cid;
 return jsonb_build_object('ok',true,'seat_freed',true);
end; $$;
create or replace function private.delete_realtor(rid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.realtor_owner(rid) then raise exception 'Not authorized' using errcode='42501'; end if;
 delete from public.app_kv where split_part(key,':',1)=rid::text;
 delete from public.push_tokens where realtor_id=rid;
 delete from private.client_sessions where realtor_id=rid;
 delete from public.client_accounts where realtor_id=rid;
 delete from public.realtor_builds where realtor_id=rid;
 delete from public.realtors where id=rid;
 return jsonb_build_object('ok',true);
end; $$;
create or replace function public.delete_client_account(p_realtor_id uuid,p_client_key text) returns jsonb language sql security invoker set search_path='' as $$ select private.delete_client(p_realtor_id,p_client_key); $$;
create or replace function public.delete_realtor_account(p_realtor_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.delete_realtor(p_realtor_id); $$;
revoke all on function private.delete_client(uuid,text),private.delete_realtor(uuid) from public,anon;
grant execute on function private.delete_client(uuid,text),private.delete_realtor(uuid) to authenticated;
revoke all on function public.delete_realtor_account(uuid),public.delete_client_account(uuid,text),public.reset_realtor_password(text,text) from public,anon,authenticated;
grant execute on function public.delete_realtor_account(uuid),public.delete_client_account(uuid,text) to authenticated;
alter function public.generate_client_code(text) set search_path='';
alter function public.realtors_set_client_code() set search_path='';

-- Public images remain public marketing assets; uploads require an owned prefix.
drop policy if exists "anon upload" on storage.objects;
drop policy if exists "app-images upload" on storage.objects;
create policy "app images owner upload" on storage.objects for insert to authenticated with check(bucket_id='app-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Unfiltered broadcast channels cannot carry private data. The app uses private channels; default-deny policies keep these closed.
revoke all on realtime.messages from anon,authenticated;

-- Only explicitly listed invoker APIs and their checked private implementations are callable.
revoke all on function private.authenticate_client(uuid,text,text),private.create_client(uuid,text,text,text,text),private.client_identity(),private.create_guest_realtor(),private.kv_read(text),private.kv_write(text,jsonb,bigint),private.register_device(text,uuid,text,text,text,text) from public,anon;
grant execute on function private.authenticate_client(uuid,text,text),private.create_client(uuid,text,text,text,text),private.client_identity(),private.create_guest_realtor(),private.kv_read(text),private.kv_write(text,jsonb,bigint),private.register_device(text,uuid,text,text,text,text) to authenticated;
revoke all on function public.verify_client_account(uuid,text,text),public.register_client_account(uuid,text,text,text,text),public.current_client_identity(),public.create_guest_realtor(),public.secure_kv_get(text),public.secure_kv_set(text,jsonb,bigint),public.register_push_token(text,uuid,text,text,text,text),public.authorize_push(uuid,text) from public,anon;
grant execute on function public.verify_client_account(uuid,text,text),public.register_client_account(uuid,text,text,text,text),public.current_client_identity(),public.create_guest_realtor(),public.secure_kv_get(text),public.secure_kv_set(text,jsonb,bigint),public.register_push_token(text,uuid,text,text,text,text),public.authorize_push(uuid,text) to authenticated;
commit;
