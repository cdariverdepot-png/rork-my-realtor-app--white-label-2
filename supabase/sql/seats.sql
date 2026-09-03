-- =====================================================================
--  My Realtor App — CLIENT SEATS (free tier = 3 connected clients)
--  ---------------------------------------------------------------------
--  Paste this ENTIRE file into:
--     Supabase Dashboard → SQL Editor → New query → (paste) → Run
--
--  Idempotent: safe to run more than once. Run it AFTER setup.sql.
--
--  WHAT THIS METERS
--  ----------------
--  A *contact* (a row on the realtor's roster) is unlimited and free — it is
--  the realtor's own address book. A *connection* is a client account that can
--  actually open the app. Only connections consume seats.
--
--  Seat identity is the client's normalised email, so the same person on a new
--  phone, or after a reinstall, re-uses their existing seat instead of burning
--  a second one.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1.  Plan column on realtors
-- ---------------------------------------------------------------------
alter table public.realtors
  add column if not exists plan text not null default 'free';

alter table public.realtors
  add column if not exists plan_updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'realtors_plan_check'
  ) then
    alter table public.realtors
      add constraint realtors_plan_check
      check (plan in ('free', 'pro', 'bespoke'));
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2.  client_connections — one row per distinct client account
-- ---------------------------------------------------------------------
create table if not exists public.client_connections (
  id           uuid primary key default gen_random_uuid(),
  realtor_id   uuid not null references public.realtors(id) on delete cascade,
  -- Normalised email. Stable across devices and reinstalls, which is what
  -- makes "same person = same seat" work.
  client_key   text not null,
  -- The app-side client id for this account (may differ per device install).
  client_id    text not null default '',
  client_name  text not null default '',
  status       text not null default 'active' check (status in ('active', 'revoked')),
  connected_at timestamptz not null default now(),
  revoked_at   timestamptz
);

-- One row per person per realtor. Revoking flips status rather than deleting,
-- so reconnecting the same client reuses their original row.
create unique index if not exists idx_client_connections_person
  on public.client_connections (realtor_id, client_key);

create index if not exists idx_client_connections_active
  on public.client_connections (realtor_id) where status = 'active';


-- ---------------------------------------------------------------------
-- 3.  connection_attempts — people who were turned away at the limit
-- ---------------------------------------------------------------------
create table if not exists public.connection_attempts (
  id           uuid primary key default gen_random_uuid(),
  realtor_id   uuid not null references public.realtors(id) on delete cascade,
  client_key   text not null,
  client_name  text not null default '',
  attempted_at timestamptz not null default now(),
  seen         boolean not null default false
);

create unique index if not exists idx_connection_attempts_person
  on public.connection_attempts (realtor_id, client_key);


-- ---------------------------------------------------------------------
-- 4.  RLS — reads are open, writes go through the functions below only
-- ---------------------------------------------------------------------
--  Unlike the rest of this schema, these two tables deliberately have NO
--  insert/update/delete policy. Every device signs in anonymously, so an open
--  write policy would let the app hand itself extra seats. The SECURITY
--  DEFINER functions below are the only write path.
alter table public.client_connections enable row level security;
alter table public.connection_attempts enable row level security;

drop policy if exists "connections read" on public.client_connections;
create policy "connections read" on public.client_connections for select using (true);

drop policy if exists "attempts read" on public.connection_attempts;
create policy "attempts read" on public.connection_attempts for select using (true);


-- ---------------------------------------------------------------------
-- 5.  Seat limit for a plan.  -1 means unlimited.
-- ---------------------------------------------------------------------
create or replace function public.seat_limit_for_plan(
  p_plan       text,
  p_realtor_id uuid default null
)
returns int
language plpgsql
immutable
as $$
begin
  -- The Eliza Vance showcase is exempt — it is a demo, not a customer.
  if p_realtor_id = '00000000-0000-0000-0000-000000000001'::uuid then
    return -1;
  end if;
  if coalesce(p_plan, 'free') in ('pro', 'bespoke') then
    return -1;
  end if;
  return 3;
end;
$$;


-- ---------------------------------------------------------------------
-- 6.  claim_client_seat — the only way a client gets access
-- ---------------------------------------------------------------------
--  Counts and claims inside ONE transaction, behind a row lock on the
--  realtor. Two clients redeeming the same code in the same instant queue up
--  here, so the last free seat can only ever be handed out once.
create or replace function public.claim_client_seat(
  p_realtor_id  uuid,
  p_client_key  text,
  p_client_id   text default '',
  p_client_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan     text;
  v_limit    int;
  v_key      text := lower(trim(coalesce(p_client_key, '')));
  v_status   text;
  v_used     int;
begin
  if p_realtor_id is null or v_key = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select plan into v_plan
  from public.realtors
  where id = p_realtor_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_realtor');
  end if;

  v_limit := public.seat_limit_for_plan(v_plan, p_realtor_id);

  select status into v_status
  from public.client_connections
  where realtor_id = p_realtor_id and client_key = v_key;

  select count(*) into v_used
  from public.client_connections
  where realtor_id = p_realtor_id and status = 'active';

  -- Already connected: same person, new phone or fresh install. No new seat.
  if v_status = 'active' then
    return jsonb_build_object(
      'ok', true, 'reused', true, 'used', v_used, 'limit', v_limit, 'plan', v_plan
    );
  end if;

  -- New person (or a previously revoked one) and the seats are full.
  -- Note this also grandfathers a downgrade: existing connections keep
  -- working, only new ones are refused until the count drops below the limit.
  if v_limit >= 0 and v_used >= v_limit then
    insert into public.connection_attempts (realtor_id, client_key, client_name)
    values (p_realtor_id, v_key, coalesce(p_client_name, ''))
    on conflict (realtor_id, client_key) do update
      set attempted_at = now(),
          seen         = false,
          client_name  = excluded.client_name;

    return jsonb_build_object(
      'ok', false, 'reason', 'limit', 'used', v_used, 'limit', v_limit, 'plan', v_plan
    );
  end if;

  insert into public.client_connections (realtor_id, client_key, client_id, client_name, status)
  values (p_realtor_id, v_key, coalesce(p_client_id, ''), coalesce(p_client_name, ''), 'active')
  on conflict (realtor_id, client_key) do update
    set status       = 'active',
        revoked_at   = null,
        client_id    = excluded.client_id,
        client_name  = excluded.client_name,
        connected_at = now();

  -- They got in, so any earlier turn-away notice for them is stale.
  delete from public.connection_attempts
  where realtor_id = p_realtor_id and client_key = v_key;

  return jsonb_build_object(
    'ok', true, 'reused', false, 'used', v_used + 1, 'limit', v_limit, 'plan', v_plan
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 7.  release_client_seat — realtor disconnects a client, seat frees up
-- ---------------------------------------------------------------------
create or replace function public.release_client_seat(
  p_realtor_id uuid,
  p_client_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key  text := lower(trim(coalesce(p_client_key, '')));
  v_used int;
begin
  if p_realtor_id is null or v_key = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  update public.client_connections
     set status = 'revoked', revoked_at = now()
   where realtor_id = p_realtor_id
     and client_key = v_key
     and status = 'active';

  select count(*) into v_used
  from public.client_connections
  where realtor_id = p_realtor_id and status = 'active';

  return jsonb_build_object('ok', true, 'used', v_used);
end;
$$;


-- ---------------------------------------------------------------------
-- 8.  realtor_seat_state — everything the dashboard needs, in one call
-- ---------------------------------------------------------------------
create or replace function public.realtor_seat_state(p_realtor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan        text;
  v_limit       int;
  v_connections jsonb;
  v_attempts    jsonb;
  v_used        int;
begin
  if p_realtor_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select plan into v_plan from public.realtors where id = p_realtor_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_realtor');
  end if;

  v_limit := public.seat_limit_for_plan(v_plan, p_realtor_id);

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'clientKey',   client_key,
             'clientId',    client_id,
             'clientName',  client_name,
             'connectedAt', extract(epoch from connected_at) * 1000
           ) order by connected_at desc
         ), '[]'::jsonb),
         count(*)
    into v_connections, v_used
  from public.client_connections
  where realtor_id = p_realtor_id and status = 'active';

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'clientKey',   client_key,
             'clientName',  client_name,
             'attemptedAt', extract(epoch from attempted_at) * 1000
           ) order by attempted_at desc
         ), '[]'::jsonb)
    into v_attempts
  from public.connection_attempts
  where realtor_id = p_realtor_id and seen = false;

  return jsonb_build_object(
    'ok', true,
    'plan', v_plan,
    'limit', v_limit,
    'used', v_used,
    'connections', v_connections,
    'attempts', v_attempts
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 9.  mark_attempts_seen — realtor has read the turn-away notice
-- ---------------------------------------------------------------------
create or replace function public.mark_attempts_seen(p_realtor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_realtor_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  update public.connection_attempts
     set seen = true
   where realtor_id = p_realtor_id and seen = false;
  return jsonb_build_object('ok', true);
end;
$$;


-- ---------------------------------------------------------------------
-- 10. set_realtor_plan — manual tier flip until purchases are wired up
-- ---------------------------------------------------------------------
--  Intended for the Supabase SQL editor, e.g.
--     select public.set_realtor_plan('agent@example.com', 'pro');
create or replace function public.set_realtor_plan(
  p_email text,
  p_plan  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_plan not in ('free', 'pro', 'bespoke') then
    return jsonb_build_object('ok', false, 'reason', 'bad_plan');
  end if;

  update public.realtors
     set plan = p_plan, plan_updated_at = now()
   where email = lower(trim(p_email))
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_realtor');
  end if;
  return jsonb_build_object('ok', true, 'realtorId', v_id, 'plan', p_plan);
end;
$$;


-- ---------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------
grant execute on function public.claim_client_seat(uuid, text, text, text) to anon, authenticated;
grant execute on function public.release_client_seat(uuid, text)           to anon, authenticated;
grant execute on function public.realtor_seat_state(uuid)                  to anon, authenticated;
grant execute on function public.mark_attempts_seen(uuid)                  to anon, authenticated;
grant execute on function public.seat_limit_for_plan(text, uuid)           to anon, authenticated;
-- set_realtor_plan is intentionally NOT granted to anon: it is a back-office
-- action, run from the SQL editor or a trusted server, never from a phone.


-- ---------------------------------------------------------------------
-- Honest note on how strong this is
-- ---------------------------------------------------------------------
--  These functions close the holes that matter in practice: reinstalling the
--  app, going offline, editing local storage, or signing in on another device
--  cannot mint seats, and two simultaneous redemptions cannot both take the
--  last one. The count is ours, not the phone's.
--
--  What it does NOT do is authenticate the caller — like the rest of this
--  schema, any client holding the public anon key can call release_client_seat
--  for a realtor id it knows. Closing that means moving realtor + client
--  accounts onto Supabase Auth and gating these functions by auth.uid(), which
--  is the same migration the note at the bottom of setup.sql describes.
--
-- Done. ✅
