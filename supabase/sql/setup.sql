-- =====================================================================
--  My Realtor App — COMPLETE Supabase setup
--  ---------------------------------------------------------------------
--  Paste this ENTIRE file into:
--     Supabase Dashboard → SQL Editor → New query → (paste) → Run
--
--  It is idempotent: safe to run more than once.
--  It creates everything the app needs:
--     1. app_kv      — shared realtime sync (listings, brand, docs, notifs)
--     2. realtors    — one row per realtor (multi-tenant white-label)
--     3. realtime    — pushes realtor edits to client phones instantly
--     4. app-images  — public Storage bucket for photos / brand assets
--     5. client-code helper function + seed demo realtor
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1.  app_kv — shared key/value sync table
-- ---------------------------------------------------------------------
create table if not exists public.app_kv (
  key        text primary key,
  value      jsonb not null,
  rev        bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.app_kv enable row level security;

drop policy if exists "kv read"   on public.app_kv;
drop policy if exists "kv insert" on public.app_kv;
drop policy if exists "kv update" on public.app_kv;
create policy "kv read"   on public.app_kv for select using (true);
create policy "kv insert" on public.app_kv for insert with check (true);
create policy "kv update" on public.app_kv for update using (true) with check (true);


-- ---------------------------------------------------------------------
-- 2.  realtors — one row per realtor (multi-tenant)
-- ---------------------------------------------------------------------
create table if not exists public.realtors (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique,
  name                text not null,
  password_hash       text not null,
  brand_name          text not null default '',
  monogram            text not null default '',
  client_code         text not null unique,
  client_code_enabled boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_realtors_client_code on public.realtors (client_code);
create index if not exists idx_realtors_email        on public.realtors (email);

alter table public.realtors enable row level security;

-- Open policies on purpose: the app signs every device in ANONYMOUSLY, so
-- auth.uid() can never equal a realtor row id. Email + password is verified
-- inside the app. (For a hardened production build you'd move realtor auth to
-- Supabase Auth and gate updates by auth.uid() = id.)
drop policy if exists "realtors read"   on public.realtors;
drop policy if exists "realtors insert" on public.realtors;
drop policy if exists "realtors update" on public.realtors;
create policy "realtors read"   on public.realtors for select using (true);
create policy "realtors insert" on public.realtors for insert with check (true);
create policy "realtors update" on public.realtors for update using (true) with check (true);


-- ---------------------------------------------------------------------
-- 3.  Realtime — push edits to every connected device instantly
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_kv'
  ) then
    alter publication supabase_realtime add table public.app_kv;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'realtors'
  ) then
    alter publication supabase_realtime add table public.realtors;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 4.  app-images — public Storage bucket for photos / brand assets
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('app-images', 'app-images', true)
on conflict (id) do update set public = true;

drop policy if exists "app-images read"   on storage.objects;
drop policy if exists "app-images upload" on storage.objects;
create policy "app-images read"   on storage.objects
  for select using (bucket_id = 'app-images');
create policy "app-images upload" on storage.objects
  for insert with check (bucket_id = 'app-images');


-- ---------------------------------------------------------------------
-- 5.  Deterministic 6-char client code generator + trigger
--     (only used as a safety net — the app sends its own code on insert)
-- ---------------------------------------------------------------------
create or replace function public.generate_client_code(email_input text)
returns text
language plpgsql
immutable
as $$
declare
  alpha  constant text  := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  n      constant int   := length(alpha);
  digest bytea := decode(md5(coalesce(email_input, '')), 'hex'); -- 16 deterministic bytes
  result text  := '';
  i      int;
begin
  -- Map the first 6 bytes of the md5 digest onto our 31-char alphabet.
  -- get_byte() returns a clean integer 0..255, so there is no bigint or
  -- bit-shift casting here (that was the cause of the substr() error).
  for i in 0..5 loop
    result := result || substr(alpha, (get_byte(digest, i) % n) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.realtors_set_client_code()
returns trigger
language plpgsql
as $$
begin
  if new.client_code is null or new.client_code = '' then
    new.client_code := public.generate_client_code(lower(trim(new.email)));
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger trg_realtors_set_client_code
  before insert or update on public.realtors
  for each row execute function public.realtors_set_client_code();


-- ---------------------------------------------------------------------
-- 6.  Seed the demo realtor (doubles as the App Store review login)
-- ---------------------------------------------------------------------
--  Review / demo credentials (share privately with the App Store team):
--      Email:    eliza@vanceprivate.com
--      Password: realtor2025
--  The hash below is SHA-256 of
--      'myrealtor.v1|eliza@vanceprivate.com|realtor2025'
--  and must match lib/passwordHash.ts. `do update` keeps it fresh on re-run.
insert into public.realtors (id, email, name, password_hash, brand_name, monogram, client_code)
values (
  '00000000-0000-0000-0000-000000000001',
  'eliza@vanceprivate.com',
  'Eliza Vance',
  'ead9ca9a27054b63e6641af6ee8959a4f69eeb142cac91906918cf315af24ab9',
  'VANCE',
  'EV',
  'NVNF6E'  -- pinned to match the app's deriveClientCode('eliza@vanceprivate.com')
)
on conflict (id) do update set
  password_hash = excluded.password_hash,
  brand_name    = excluded.brand_name,
  monogram      = excluded.monogram,
  client_code   = excluded.client_code;

-- ---------------------------------------------------------------------
-- Security note (multi-tenant isolation)
-- ---------------------------------------------------------------------
--  Per-realtor data is namespaced by realtorId in app_kv keys
--  ("<realtorId>:listings.v2", "<realtorId>:<clientId>:chat.v1", ...), so the
--  app never mixes one realtor's data with another's. Passwords are stored as
--  one-way SHA-256 hashes (never plaintext), verified in-app.
--
--  Because every device authenticates ANONYMOUSLY, the policies above are open.
--  To fully harden for production you would migrate realtor + client accounts
--  to Supabase Auth and gate each row by auth.uid()/owner_id, and move login
--  verification into a SECURITY DEFINER RPC so password_hash is never selectable
--  by the anon role.
--
-- Done. ✅  Next: enable Anonymous sign-ins (Authentication → Sign In / Providers).
