-- Skip the optional seat relation before PostgreSQL plans its query.
-- Existing private wrapper authorization and function grants are preserved.
CREATE OR REPLACE FUNCTION private.register_client_account(
  p_realtor_id uuid, p_email text, p_pw_hash text, p_client_id text,
  p_name text DEFAULT ''::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_realtor_id is null or v_email = ''
     or coalesce(p_client_id, '') = ''
     or coalesce(p_pw_hash, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if not exists (select 1 from public.realtors where id = p_realtor_id) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if to_regclass('public.client_connections') is not null then
    if not exists (
      select 1 from public.client_connections
      where realtor_id = p_realtor_id and client_key = v_email and status = 'active'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'no_seat');
    end if;
  end if;
  insert into public.client_accounts (realtor_id, email, pw_hash, client_id, name)
  values (p_realtor_id, v_email, crypt(p_pw_hash, gen_salt('bf', 10)),
          p_client_id, coalesce(p_name, ''))
  on conflict (realtor_id, email) do nothing;
  return jsonb_build_object('ok', true, 'created', found);
end;
$function$;
