begin;
-- SQL three-valued logic must never let an unbound client through deletion.
create or replace function private.delete_client(rid uuid,email_input text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid text; row_data record;
begin
 select client_id into cid from public.client_accounts where realtor_id=rid and email=lower(trim(email_input));
 if cid is null or not coalesce(private.realtor_owner(rid) or private.bound_client(rid)=cid,false) then raise exception 'Not authorized' using errcode='42501'; end if;
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
create or replace function private.active_push_tokens(rid uuid,target_role text,client_ids jsonb) returns table(token text,role text,client_id text) language sql stable security definer set search_path='' as $$
 select t.token,t.role,t.client_id from public.push_tokens t where t.realtor_id=rid and t.role=target_role and t.auth_user_id is not null
 and ((target_role='admin' and exists(select 1 from public.realtors r where r.id=rid and r.auth_user_id=t.auth_user_id))
 or (target_role='client' and (client_ids is null or client_ids ? t.client_id) and exists(select 1 from private.client_sessions s join public.client_accounts a on a.realtor_id=s.realtor_id and a.client_id=s.client_id and a.pw_hash=s.credential_version
 where s.auth_user_id=t.auth_user_id and s.realtor_id=rid and s.client_id=t.client_id)));
$$;
create or replace function public.resolve_push_recipients(p_realtor_id uuid,p_target_role text,p_client_ids jsonb default null) returns table(token text,role text,client_id text) language sql security invoker set search_path='' as $$ select * from private.active_push_tokens(p_realtor_id,p_target_role,p_client_ids); $$;
revoke all on function private.active_push_tokens(uuid,text,jsonb),public.resolve_push_recipients(uuid,text,jsonb) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.active_push_tokens(uuid,text,jsonb),public.resolve_push_recipients(uuid,text,jsonb) to service_role;
commit;
