-- Existing client accounts use a separate password hash. Verify email through
-- Supabase Auth, then reset only the matching account without changing its ID.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.recover_client_password(p_realtor_id uuid, p_pw_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if auth.uid() is null or p_realtor_id is null or coalesce(p_pw_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Email verification required';
  end if;
  select lower(trim(email)) into v_email from auth.users
  where id = auth.uid() and email_confirmed_at is not null and not coalesce(is_anonymous, false);
  if v_email is null then raise exception 'Email verification required'; end if;
  update public.client_accounts
    set pw_hash = extensions.crypt(p_pw_hash, extensions.gen_salt('bf', 10)),
        failed_attempts = 0, locked_until = null
    where realtor_id = p_realtor_id and email = v_email;
  return jsonb_build_object('ok', found);
end;
$$;
revoke all on function private.recover_client_password(uuid, text) from public, anon;
grant execute on function private.recover_client_password(uuid, text) to authenticated;

create or replace function public.recover_client_password(p_realtor_id uuid, p_pw_hash text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.recover_client_password(p_realtor_id, p_pw_hash); $$;
revoke all on function public.recover_client_password(uuid, text) from public, anon;
grant execute on function public.recover_client_password(uuid, text) to authenticated;
