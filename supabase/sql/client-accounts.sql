-- =====================================================================
--  My Realtor App — CLIENT ACCOUNTS (sign in on any device)
--  ---------------------------------------------------------------------
--  Paste this ENTIRE file into:
--     Supabase Dashboard → SQL Editor → New query → (paste) → Run
--
--  Idempotent: safe to run more than once. Run it AFTER setup.sql.
--
--  Client accounts used to exist only on the phone that created them. This
--  keeps a server copy (email + the same SHA-256 password hash the app
--  already stores), so a client can sign in on a new phone or after a
--  reinstall. The table is locked: no one can read it directly — only the two
--  functions below can register an account or check a password.
-- =====================================================================

create table if not exists public.client_accounts (
  realtor_id  uuid        not null,
  email       text        not null,
  pw_hash     text        not null,
  client_id   text        not null,
  name        text        not null default '',
  created_at  timestamptz not null default now(),
  primary key (realtor_id, email)
);

alter table public.client_accounts enable row level security;
-- No policies on purpose: direct reads/writes are refused for everyone.

-- Register a new client account. An existing account is never overwritten.
create or replace function public.register_client_account(
  p_realtor_id uuid,
  p_email      text,
  p_pw_hash    text,
  p_client_id  text,
  p_name       text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_realtor_id is null or v_email = '' or coalesce(p_pw_hash, '') = '' or coalesce(p_client_id, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  insert into public.client_accounts (realtor_id, email, pw_hash, client_id, name)
  values (p_realtor_id, v_email, p_pw_hash, p_client_id, coalesce(p_name, ''))
  on conflict (realtor_id, email) do nothing;
  if found then
    return jsonb_build_object('ok', true, 'created', true);
  end if;
  return jsonb_build_object('ok', true, 'created', false);
end;
$$;

-- Check a client's password. Returns their client id and name on a match.
create or replace function public.verify_client_account(
  p_realtor_id uuid,
  p_email      text,
  p_pw_hash    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.client_accounts%rowtype;
begin
  select * into v_row from public.client_accounts
   where realtor_id = p_realtor_id and email = lower(trim(coalesce(p_email, '')));
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_row.pw_hash <> coalesce(p_pw_hash, '') then
    return jsonb_build_object('ok', false, 'reason', 'bad_password');
  end if;
  return jsonb_build_object('ok', true, 'client_id', v_row.client_id, 'name', v_row.name);
end;
$$;

revoke all on function public.register_client_account(uuid, text, text, text, text) from public;
revoke all on function public.verify_client_account(uuid, text, text) from public;
grant execute on function public.register_client_account(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.verify_client_account(uuid, text, text) to anon, authenticated;
