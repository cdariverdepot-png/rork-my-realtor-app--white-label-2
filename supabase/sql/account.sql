-- =====================================================================
--  My Realtor App — account deletion + push tokens
--  ---------------------------------------------------------------------
--  Paste this ENTIRE file into:
--     Supabase Dashboard → SQL Editor → New query → (paste) → Run
--
--  Run AFTER setup.sql and seats.sql. Idempotent: safe to run twice.
--
--  Adds:
--     1. push_tokens          — device tokens so notifications reach phones
--     2. delete_client_account — client erases themselves, frees the seat
--     3. delete_realtor_account — realtor erases themselves and all their data
--
--  App Store guideline 5.1.1(v) requires in-app account deletion for any app
--  that lets users create an account. These functions are what make the
--  in-app "Delete account" button actually delete something.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1.  push_tokens — one row per device, per person
-- ---------------------------------------------------------------------
create table if not exists public.push_tokens (
  token       text primary key,
  realtor_id  uuid not null,
  -- 'admin' for the realtor's own device, 'client' for a client's device.
  role        text not null check (role in ('admin', 'client')),
  -- Normalised email. Identifies the person across their devices.
  owner_key   text not null,
  client_id   text,
  platform    text not null default 'unknown',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_push_tokens_realtor on public.push_tokens (realtor_id);
create index if not exists idx_push_tokens_owner   on public.push_tokens (owner_key);

alter table public.push_tokens enable row level security;

-- Open policies for the same reason the rest of the schema uses them: every
-- device signs in anonymously, so auth.uid() never matches an app identity.
drop policy if exists "push read"   on public.push_tokens;
drop policy if exists "push write"  on public.push_tokens;
drop policy if exists "push update" on public.push_tokens;
drop policy if exists "push delete" on public.push_tokens;
create policy "push read"   on public.push_tokens for select using (true);
create policy "push write"  on public.push_tokens for insert with check (true);
create policy "push update" on public.push_tokens for update using (true) with check (true);
create policy "push delete" on public.push_tokens for delete using (true);


-- ---------------------------------------------------------------------
-- 2.  Register / refresh a device token
-- ---------------------------------------------------------------------
create or replace function public.register_push_token(
  p_token      text,
  p_realtor_id uuid,
  p_role       text,
  p_owner_key  text,
  p_client_id  text default null,
  p_platform   text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_token');
  end if;
  if p_role not in ('admin', 'client') then
    return jsonb_build_object('ok', false, 'reason', 'bad_role');
  end if;

  -- A device can change hands (realtor signs out, client signs in). The token
  -- is the primary key, so re-registering simply re-points it at whoever is
  -- signed in now — which is exactly the behaviour we want.
  insert into public.push_tokens (token, realtor_id, role, owner_key, client_id, platform, updated_at)
  values (trim(p_token), p_realtor_id, p_role, lower(trim(p_owner_key)), p_client_id, coalesce(p_platform, 'unknown'), now())
  on conflict (token) do update
    set realtor_id = excluded.realtor_id,
        role       = excluded.role,
        owner_key  = excluded.owner_key,
        client_id  = excluded.client_id,
        platform   = excluded.platform,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;


-- ---------------------------------------------------------------------
-- 3.  Client deletes their own account
-- ---------------------------------------------------------------------
--  Frees the realtor's seat and removes the client's devices. The realtor's
--  own roster entry is intentionally left alone: that is the agent's address
--  book, the same as a business card they were handed, and it is not ours to
--  edit. The privacy policy says exactly this.
create or replace function public.delete_client_account(
  p_realtor_id uuid,
  p_client_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_client_key, '')));
  v_removed int := 0;
begin
  if p_realtor_id is null or v_key = '' then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;

  delete from public.client_connections
   where realtor_id = p_realtor_id and client_key = v_key;
  get diagnostics v_removed = row_count;

  delete from public.push_tokens
   where realtor_id = p_realtor_id and owner_key = v_key and role = 'client';

  -- Any pending "someone was turned away" notice for this address is stale now.
  delete from public.connection_attempts
   where realtor_id = p_realtor_id and client_key = v_key;

  return jsonb_build_object('ok', true, 'seat_freed', v_removed > 0);
end;
$$;


-- ---------------------------------------------------------------------
-- 4.  Realtor deletes their own account
-- ---------------------------------------------------------------------
--  Erases the realtor row, every client connection, every device token and
--  every synced key belonging to their scope. Their clients lose access on
--  next launch because the realtor no longer resolves.
--
--  Guarded so the frozen demo showcase can never be deleted, whatever calls it.
create or replace function public.delete_realtor_account(p_realtor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kv int := 0;
begin
  if p_realtor_id is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  if p_realtor_id = '00000000-0000-0000-0000-000000000001'::uuid then
    return jsonb_build_object('ok', false, 'reason', 'demo_protected');
  end if;

  -- Every synced key is prefixed with the realtor's id — brand, listings,
  -- documents, notifications, client feeds, profiles, the lot.
  delete from public.app_kv where key like p_realtor_id::text || ':%';
  get diagnostics v_kv = row_count;

  delete from public.push_tokens         where realtor_id = p_realtor_id;
  delete from public.connection_attempts where realtor_id = p_realtor_id;
  delete from public.client_connections  where realtor_id = p_realtor_id;
  -- The plan lives as a column on realtors, so it goes with the row.
  delete from public.realtors            where id = p_realtor_id;

  return jsonb_build_object('ok', true, 'keys_removed', v_kv);
end;
$$;


-- ---------------------------------------------------------------------
-- 5.  Password reset — set a new hash after email ownership is proven
-- ---------------------------------------------------------------------
--  The app verifies the person controls the mailbox using Supabase Auth's
--  one-time email code, then calls this to write the new hash. The function
--  requires a genuine (non-anonymous) auth session whose email matches the
--  account being reset, so possession of the anon key alone is not enough.
create or replace function public.reset_realtor_password(
  p_email text,
  p_hash  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_anon boolean := coalesce((auth.jwt() -> 'is_anonymous')::boolean, false);
  v_rows int := 0;
begin
  if v_email = '' or coalesce(trim(p_hash), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  if v_anon or v_jwt_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'not_verified');
  end if;
  if v_jwt_email <> v_email then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;

  update public.realtors
     set password_hash = trim(p_hash), updated_at = now()
   where email = v_email;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;


grant execute on function public.register_push_token(text, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.delete_client_account(uuid, text)   to anon, authenticated;
grant execute on function public.delete_realtor_account(uuid)        to anon, authenticated;
grant execute on function public.reset_realtor_password(text, text)  to anon, authenticated;
