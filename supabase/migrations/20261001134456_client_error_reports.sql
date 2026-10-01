-- Client crash/error reports from the app ErrorBoundary.
-- Service role inserts from the report-client-error edge function.
-- No public read; owners inspect via the SQL editor / dashboard.

create table if not exists public.client_error_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message text not null,
  pathname text,
  platform text,
  role text,
  report jsonb not null default '{}'::jsonb
);

alter table public.client_error_reports enable row level security;

-- No anon/authenticated policies: only service_role (edge function) can write.
-- Intentionally empty RLS so the table is private by default.

comment on table public.client_error_reports is
  'Crash reports auto-filed by the mobile/web ErrorBoundary.';
