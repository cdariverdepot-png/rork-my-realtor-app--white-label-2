begin;
create table private.error_report_quota(auth_user_id uuid primary key references auth.users(id) on delete cascade,window_start timestamptz not null,hits integer not null);
alter table private.error_report_quota enable row level security;
revoke all on private.error_report_quota from public,anon,authenticated;
create function private.allow_error_report() returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if auth.uid() is null then return false; end if;
 insert into private.error_report_quota values(auth.uid(),now(),1) on conflict(auth_user_id) do update set hits=case when error_report_quota.window_start<now()-interval '1 hour' then 1 else error_report_quota.hits+1 end,window_start=case when error_report_quota.window_start<now()-interval '1 hour' then now() else error_report_quota.window_start end returning hits into n;
 return n<=5;
end; $$;
create function public.allow_error_report() returns boolean language sql security invoker set search_path='' as $$ select private.allow_error_report(); $$;
revoke all on function private.allow_error_report(),public.allow_error_report() from public,anon;
grant execute on function private.allow_error_report(),public.allow_error_report() to authenticated;
commit;
