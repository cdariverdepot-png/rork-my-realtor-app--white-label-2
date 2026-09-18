-- Realtor build data is private and belongs to a Supabase Auth user.
-- Run after setup.sql. Existing realtor rows remain available during migration.

alter table public.realtors
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- Realtor records are private. Clients resolve only an enabled invitation
-- code through a narrowly scoped function below.
drop policy if exists "realtors read" on public.realtors;
drop policy if exists "realtors insert" on public.realtors;
drop policy if exists "realtors update" on public.realtors;
drop policy if exists "realtor owner read" on public.realtors;
drop policy if exists "realtor owner update" on public.realtors;
create policy "realtor owner read" on public.realtors for select to authenticated
  using (auth.uid() = auth_user_id);
create policy "realtor owner update" on public.realtors for update to authenticated
  using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
revoke all on public.realtors from public, anon, authenticated;
grant select (id, email, name, brand_name, monogram, client_code,
  client_code_enabled, created_at, updated_at, auth_user_id) on public.realtors to authenticated;
grant update (client_code, client_code_enabled) on public.realtors to authenticated;

create or replace function public.lookup_realtor_by_code(p_code text)
returns table (id uuid, name text, brand_name text, monogram text,
  client_code text, client_code_enabled boolean)
language sql security definer set search_path = public
as $$
  select r.id, r.name, r.brand_name, r.monogram, r.client_code,
    r.client_code_enabled
  from public.realtors r
  where r.client_code = upper(regexp_replace(p_code, '[[:space:]]', '', 'g'))
    and r.client_code_enabled = true
  limit 1;
$$;
revoke all on function public.lookup_realtor_by_code(text) from public;
grant execute on function public.lookup_realtor_by_code(text) to anon, authenticated;

create index if not exists idx_realtors_auth_user_id
  on public.realtors(auth_user_id);

-- After an email-confirmed Supabase Auth sign-in, attach the existing realtor
-- row with that email or create a new row. Existing realtor IDs stay stable,
-- preserving all scoped brand, listings, and client data.
create or replace function public.ensure_realtor_auth_record(p_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_user auth.users%rowtype;
  v_realtor public.realtors%rowtype;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required';
  end if;
  select * into v_auth_user from auth.users where id = auth.uid();
  if v_auth_user.email is null or v_auth_user.email_confirmed_at is null then
    raise exception 'Confirm your email before continuing';
  end if;
  select * into v_realtor from public.realtors
    where lower(email) = lower(v_auth_user.email) for update;
  if found then
    if v_realtor.auth_user_id is not null and v_realtor.auth_user_id <> auth.uid() then
      raise exception 'This realtor account is already linked';
    end if;
    update public.realtors set auth_user_id = auth.uid() where id = v_realtor.id;
    return v_realtor.id;
  end if;

  v_name := nullif(trim(p_name), '');
  if v_name is null then
    v_name := split_part(v_auth_user.email, '@', 1);
  end if;
  insert into public.realtors
    (email, name, password_hash, brand_name, monogram, client_code_enabled, auth_user_id)
  values
    (lower(v_auth_user.email), v_name, 'supabase-auth-only',
     upper(split_part(v_name, ' ', 1)), upper(left(v_name, 1)), false, auth.uid())
  returning id into v_realtor.id;
  return v_realtor.id;
end;
$$;

revoke all on function public.ensure_realtor_auth_record(text) from public, anon;
grant execute on function public.ensure_realtor_auth_record(text) to authenticated;

create table if not exists public.realtor_builds (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  realtor_id uuid references public.realtors(id) on delete set null,
  status text not null default 'collecting'
    check (status in ('collecting', 'processing', 'needs-input', 'ready', 'complete')),
  sources jsonb not null default '[]'::jsonb,
  draft jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  selected_layout text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.realtor_builds enable row level security;

drop policy if exists "realtor builds own read" on public.realtor_builds;
drop policy if exists "realtor builds own insert" on public.realtor_builds;
drop policy if exists "realtor builds own update" on public.realtor_builds;
create policy "realtor builds own read" on public.realtor_builds
  for select to authenticated using (auth.uid() = auth_user_id);
create policy "realtor builds own insert" on public.realtor_builds
  for insert to authenticated with check (auth.uid() = auth_user_id and exists (
    select 1 from public.realtors r where r.id = realtor_id and r.auth_user_id = auth.uid()
  ));
create policy "realtor builds own update" on public.realtor_builds
  for update to authenticated using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id and exists (
    select 1 from public.realtors r where r.id = realtor_id and r.auth_user_id = auth.uid()
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'realtor-build-sources', 'realtor-build-sources', false, 20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg', 'image/png', 'image/webp'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "realtor build files own read" on storage.objects;
drop policy if exists "realtor build files own insert" on storage.objects;
drop policy if exists "realtor build files own delete" on storage.objects;
create policy "realtor build files own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'realtor-build-sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "realtor build files own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'realtor-build-sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "realtor build files own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'realtor-build-sources' and (storage.foldername(name))[1] = auth.uid()::text);
