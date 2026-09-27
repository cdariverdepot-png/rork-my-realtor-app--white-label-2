-- =====================================================================
--  My Realtor App — CLIENT ACCOUNTS (sign in on any device)
--  ---------------------------------------------------------------------
--  Paste this ENTIRE file into:
--     Supabase Dashboard → SQL Editor → New query → (paste) → Run
--
--  Idempotent: safe to run more than once (also safe if an earlier version of
--  this file was already run). Run it AFTER setup.sql and seats.sql.
--
--  WHAT IS STORED
--  --------------
--  The app never sends a client's password. It sends a one-way SHA-256
--  derivative of it (email + password + app pepper). The server then stores
--  only a bcrypt hash (salted, slow) of THAT value. So the table holds no
--  password and no value that can be replayed to sign in.
--
--  ISOLATION
--  ---------
--  RLS is on with no policies, and table privileges are revoked: nobody can
--  select/insert/update this table directly with the app's keys. The only way
--  in is the two SECURITY DEFINER functions below, which return a client's
--  own id/name only when the password matches. Repeated wrong passwords lock
--  the account for 15 minutes.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.client_accounts (
  realtor_id  uuid        not null,
  email       text        not null,
  pw_hash     text        not null,
  client_id   text        not null,
  name        text        not null default '',
  created_at  timestamptz not null default now(),
  primary key (realtor_id, email)
);
alter table public.client_accounts add column if not exists failed_attempts int not null default 0;
alter table public.client_accounts add column if not exists locked_until timestamptz;

alter table public.client_accounts enable row level security;
-- No policies on purpose, and no direct table privileges for app roles.
revoke all on table public.client_accounts from public, anon, authenticated;


-- Register a new client account. Only for someone who holds a seat with this
-- realtor (the app claims it just before), and never overwrites an account.
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
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_realtor_id is null or v_email = '' or coalesce(p_client_id, '') = ''
     or coalesce(p_pw_hash, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if not exists (select 1 from public.realtors where id = p_realtor_id) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if to_regclass('public.client_connections') is not null and not exists (
    select 1 from public.client_connections
     where realtor_id = p_realtor_id and client_key = v_email and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no_seat');
  end if;
  insert into public.client_accounts (realtor_id, email, pw_hash, client_id, name)
  values (p_realtor_id, v_email, crypt(p_pw_hash, gen_salt('bf', 10)), p_client_id, coalesce(p_name, ''))
  on conflict (realtor_id, email) do nothing;
  return jsonb_build_object('ok', true, 'created', found);
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
set search_path = public, extensions
as $$
declare
  v_row   public.client_accounts%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_match boolean;
begin
  select * into v_row from public.client_accounts
   where realtor_id = p_realtor_id and email = v_email
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  if v_row.pw_hash like '$2%' then
    v_match := crypt(coalesce(p_pw_hash, ''), v_row.pw_hash) = v_row.pw_hash;
  else
    -- Row written by the first version of this file (unsalted): compare once,
    -- then upgrade it to bcrypt below.
    v_match := v_row.pw_hash = coalesce(p_pw_hash, '');
  end if;

  if not v_match then
    update public.client_accounts
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 10 then now() + interval '15 minutes' else locked_until end
     where realtor_id = p_realtor_id and email = v_email;
    return jsonb_build_object('ok', false, 'reason', 'bad_password');
  end if;

  update public.client_accounts
     set failed_attempts = 0,
         locked_until = null,
         pw_hash = case when pw_hash like '$2%' then pw_hash else crypt(p_pw_hash, gen_salt('bf', 10)) end
   where realtor_id = p_realtor_id and email = v_email;
  return jsonb_build_object('ok', true, 'client_id', v_row.client_id, 'name', v_row.name);
end;
$$;

revoke all on function public.register_client_account(uuid, text, text, text, text) from public;
revoke all on function public.verify_client_account(uuid, text, text) from public;
grant execute on function public.register_client_account(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.verify_client_account(uuid, text, text) to anon, authenticated;
