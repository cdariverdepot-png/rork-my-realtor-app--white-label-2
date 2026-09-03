-- Schedule refresh-listings to run every 24 hours.
-- Run this once in the Supabase SQL editor (project: mxrxxhjsceafmzhbpwtc).
--
-- Prerequisites:
--   1. Deploy the Edge Function:
--        supabase functions deploy refresh-listings --no-verify-jwt
--   2. Enable the pg_cron + pg_net extensions in
--        Dashboard → Database → Extensions
--   3. Copy your project's anon key (Settings → API) and paste it in the
--      Authorization header below (used only for routing — the function
--      uses its own SERVICE_ROLE_KEY internally).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous schedule with the same name (idempotent).
select cron.unschedule('refresh-listings-daily')
where exists (select 1 from cron.job where jobname = 'refresh-listings-daily');

select
  cron.schedule(
    'refresh-listings-daily',
    '0 */24 * * *',         -- every 24 hours
    $$
    select net.http_post(
      url := 'https://mxrxxhjsceafmzhbpwtc.supabase.co/functions/v1/refresh-listings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.anon_key', true)
      ),
      body := '{}'::jsonb
    );
    $$
  );

-- Optional: set the anon key once so the cron job can read it.
-- alter database postgres set app.settings.anon_key = 'eyJhbGciOi...your anon key...';
