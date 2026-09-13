-- Apply before deploying the updated signup flow. Existing invitations remain valid.
begin;
alter table public.realtors alter column client_code drop not null;
alter table public.realtors alter column client_code_enabled set default false;

create or replace function public.realtors_set_client_code()
returns trigger language plpgsql as $$
begin
  if new.client_code_enabled and (new.client_code is null or new.client_code = '') then
    new.client_code := public.generate_client_code(lower(trim(new.email)));
  end if;
  new.updated_at := now();
  return new;
end;
$$;
commit;
