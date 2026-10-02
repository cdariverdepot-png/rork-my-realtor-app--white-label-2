begin;
create or replace function private.clear_client_identity() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.push_tokens where auth_user_id=auth.uid() and role='client';
 delete from private.client_sessions where auth_user_id=auth.uid();
end; $$;
create or replace function public.revoke_client_identity() returns void language sql security invoker set search_path='' as $$ select private.clear_client_identity(); $$;
revoke all on function private.clear_client_identity(),public.revoke_client_identity() from public,anon;
grant execute on function private.clear_client_identity(),public.revoke_client_identity() to authenticated;
commit;
