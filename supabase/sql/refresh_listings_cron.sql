-- Public listing sources are checked every two hours. This dispatcher runs every
-- five minutes and sends bounded jobs only for due sources / legacy URL listings.
-- Deploy refresh-listings with --no-verify-jwt: the handler validates either a
-- verified account JWT or a private LISTING_SYNC_TOKEN itself.
-- Before running, save these Vault secrets:
--   listing_sync_project_url  = https://YOUR_PROJECT.supabase.co
--   listing_sync_token        = a random secret, also set as Edge LISTING_SYNC_TOKEN
-- No anon key authorizes scheduler writes; never put the sync token in the app.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'listing_sync_project_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'listing_sync_token') then
    raise exception 'Configure listing_sync_project_url and listing_sync_token in Vault before enabling listing sync';
  end if;
end $$;

select cron.unschedule(jobid) from cron.job
where jobname in ('refresh-listings-daily', 'refresh-listing-sources');

select cron.schedule('refresh-listing-sources', '*/5 * * * *', $job$
with source_jobs as (
  select split_part(k.key, ':', 1) as realtor_id,
    jsonb_build_object('realtorId', split_part(k.key, ':', 1), 'sourceId', s->>'id') as body,
    case when s->>'nextSyncAt' ~ '^[0-9]+$' then (s->>'nextSyncAt')::numeric else 0 end as due_at
  from public.app_kv k
  cross join lateral jsonb_array_elements(case when jsonb_typeof(k.value->'sources') = 'array' then k.value->'sources' else '[]'::jsonb end) s
  where k.key like '%:listing-sources.v1' and s->>'url' like 'https://%'
), legacy_jobs as (
  select split_part(k.key, ':', 1) as realtor_id,
    jsonb_build_object('realtorId', split_part(k.key, ':', 1), 'mode', 'legacy') as body,
    min(case when l->>'nextSyncAt' ~ '^[0-9]+$' then (l->>'nextSyncAt')::numeric else 0 end) as due_at
  from public.app_kv k
  cross join lateral jsonb_array_elements(case when jsonb_typeof(k.value->'items') = 'array' then k.value->'items' else '[]'::jsonb end) l
  where k.key like '%:listings.v2' and l->>'sourceUrl' like 'https://%' and coalesce(l->>'sourceId', '') = ''
  group by k.key
), due as (
  select j.body from (select * from source_jobs union all select * from legacy_jobs) j
  join public.realtors r on r.id::text = j.realtor_id
  where j.due_at <= extract(epoch from now()) * 1000
    and j.realtor_id <> '00000000-0000-0000-0000-000000000001'
  order by j.due_at limit 20
)
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'listing_sync_project_url' limit 1) || '/functions/v1/refresh-listings',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-listing-sync-token',
    (select decrypted_secret from vault.decrypted_secrets where name = 'listing_sync_token' limit 1)),
  body := due.body,
  timeout_milliseconds := 120000
) from due;
$job$);

-- Verify activation:
-- select jobname, schedule, active from cron.job where jobname = 'refresh-listing-sources';
-- select status_code, timed_out, error_msg from net._http_response order by created desc limit 10;
-- An incomplete/blocked crawl never archives inventory; missing homes require
-- two successful complete snapshots at least two hours apart.
