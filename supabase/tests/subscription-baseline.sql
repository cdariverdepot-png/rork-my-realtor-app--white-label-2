-- Isolated test fixture for the existing pre-subscription contracts. NEVER apply to a real project.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private; create schema storage;
grant usage on schema storage to authenticated;
create table storage.objects(id uuid default gen_random_uuid(),name text);
alter table storage.objects enable row level security;
create policy fixture_storage on storage.objects to authenticated using(true) with check(true);
grant select,insert on storage.objects to authenticated;
grant usage on schema public,auth,private to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
create table public.realtors(id uuid primary key,auth_user_id uuid unique,client_code_enabled boolean default true,client_code text);
grant select on public.realtors to authenticated;
create table public.client_accounts(realtor_id uuid,client_id text,email text,pw_hash text,name text,primary key(realtor_id,client_id),unique(realtor_id,email));
create table private.client_sessions(auth_user_id uuid primary key,realtor_id uuid,client_id text,credential_version text);
create table public.app_kv(key text primary key,value jsonb,rev bigint default 0);
create table public.listing_sources(id uuid primary key default gen_random_uuid(),realtor_id uuid,headers jsonb,url text);
create table public.realtor_builds(auth_user_id uuid primary key,draft jsonb);
alter table public.app_kv enable row level security;
alter table public.listing_sources enable row level security;
alter table public.realtor_builds enable row level security;
create function private.realtor_owner(rid uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.realtors where id=rid and auth_user_id=auth.uid()); $$;
create policy owner on public.app_kv to authenticated using(private.realtor_owner(split_part(key,':',1)::uuid));
create policy owner on public.listing_sources to authenticated using(private.realtor_owner(realtor_id));
create policy owner on public.realtor_builds to authenticated using(auth_user_id=auth.uid());
grant select,insert,update,delete on public.app_kv,public.listing_sources,public.realtor_builds to authenticated;
create function private.register_client_account(rid uuid,e text,h text,c text,n text) returns jsonb language plpgsql security definer as $$
begin
 insert into public.client_accounts values(rid,c,lower(e),h,n) on conflict do nothing;
 return jsonb_build_object('ok',true,'created',found);
end; $$;
create function private.authenticate_client(rid uuid,e text,h text) returns jsonb language plpgsql security definer as $$
declare a public.client_accounts%rowtype;
begin
 select * into a from public.client_accounts where realtor_id=rid and email=lower(e);
 if not found then return '{"ok":false,"reason":"not_found"}'; end if;
 if a.pw_hash<>h then return '{"ok":false,"reason":"bad_password"}'; end if;
 insert into private.client_sessions values(auth.uid(),rid,a.client_id,a.pw_hash) on conflict(auth_user_id) do update set realtor_id=excluded.realtor_id,client_id=excluded.client_id,credential_version=excluded.credential_version;
 return jsonb_build_object('ok',true,'client_id',a.client_id,'name',a.name);
end; $$;
create function private.create_client(rid uuid,email_input text,hash_input text,cid text,name_input text) returns jsonb language sql as $$ select private.register_client_account(rid,email_input,hash_input,cid,name_input); $$;
create function public.register_client_account(p_realtor_id uuid,p_email text,p_pw_hash text,p_client_id text,p_name text) returns jsonb language plpgsql as $$ begin return private.create_client(p_realtor_id,p_email,p_pw_hash,p_client_id,p_name); end; $$;
create function public.verify_client_account(p_realtor_id uuid,p_email text,p_pw_hash text) returns jsonb language plpgsql as $$ begin return private.authenticate_client(p_realtor_id,p_email,p_pw_hash); end; $$;
create function private.bound_client(rid uuid) returns text language sql stable security definer as $$ select s.client_id from private.client_sessions s join public.client_accounts a on a.realtor_id=s.realtor_id and a.client_id=s.client_id and a.pw_hash=s.credential_version where s.realtor_id=rid and s.auth_user_id=auth.uid(); $$;
create function private.kv_read(k text) returns jsonb language plpgsql stable security definer as $$
begin
 if private.realtor_owner(split_part(k,':',1)::uuid) or private.bound_client(split_part(k,':',1)::uuid) is not null then return (select value from public.app_kv where key=k); end if;
 return null;
end; $$;
create function private.kv_write(k text,v jsonb,requested_rev bigint) returns void language plpgsql security definer as $$
begin
 if not private.realtor_owner(split_part(k,':',1)::uuid) and private.bound_client(split_part(k,':',1)::uuid) is null then raise exception 'Not authorized' using errcode='42501'; end if;
 insert into public.app_kv values(k,v,requested_rev) on conflict(key) do update set value=excluded.value,rev=excluded.rev;
end; $$;
create function private.active_push_tokens(rid uuid,target_role text,client_ids jsonb) returns table(token text,role text,client_id text) language sql as $$ select 'test-token'::text,target_role,'c1'::text; $$;
create function private.request_showing(rid uuid,request_id text,listing_id text,starts bigint,duration integer) returns text language sql as $$ select request_id; $$;
create function private.capture_public_lead(rid uuid,n text,e text,p text) returns text language sql as $$ select 'fixture-lead'; $$;
grant execute on all functions in schema private,public,auth to authenticated;
revoke all on function private.register_client_account(uuid,text,text,text,text) from public,anon,authenticated;
insert into public.realtors values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'INVITE'),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,'OTHER');
insert into public.app_kv values('11111111-1111-4111-8111-111111111111:brand.v2','{"published":true,"realtor":{"name":"Cindy","email":"business@example.com","phone":"555-0100"}}',1),('11111111-1111-4111-8111-111111111111:messages.v1','{"history":["preserved"]}',1),('11111111-1111-4111-8111-111111111111:clients.v2','{"items":[{"id":"contact-only"}]}',1),('11111111-1111-4111-8111-111111111111:auth.secret','{"password":"never-export"}',1),('22222222-2222-4222-8222-222222222222:brand.v2','{"other":true}',1);
insert into public.listing_sources(realtor_id,headers,url) values('11111111-1111-4111-8111-111111111111','{"Authorization":"never-export"}','https://example.com');
insert into public.realtor_builds values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"draft":"preserved"}');
