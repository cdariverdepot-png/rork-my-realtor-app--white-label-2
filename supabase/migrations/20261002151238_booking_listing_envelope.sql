create or replace function private.request_showing(rid uuid,request_id text,listing_id text,starts bigint,duration integer) returns text language plpgsql security definer set search_path='' as $$
declare cid text; k text; items jsonb; listing jsonb; existing jsonb; stamp bigint;
begin
 if auth.uid() is null then raise exception 'Please reconnect' using errcode='42501'; end if;
 cid:=private.bound_client(rid);
 if cid is null then select lead_id into cid from private.public_leads where auth_user_id=auth.uid() and realtor_id=rid; end if;
 if cid is null then raise exception 'Please open your invitation and enter your details first' using errcode='42501'; end if;
 if not exists(select 1 from public.realtors where id=rid and client_code_enabled) then raise exception 'This invitation is unavailable'; end if;
 stamp:=(extract(epoch from clock_timestamp())*1000)::bigint;
 if request_id is null or length(request_id)<1 or length(request_id)>160 or starts is null or starts<stamp or starts>stamp+63072000000 or duration is null or duration<15 or duration>180 then raise exception 'Please choose a valid viewing time'; end if;
 select x into listing from public.app_kv a cross join lateral jsonb_array_elements(coalesce(a.value->'items',a.value)) x where a.key=rid::text||':listings.v2' and x->>'id'=listing_id and not coalesce((x->>'hidden')::boolean,false) and not coalesce((x->>'sourceArchived')::boolean,false) limit 1;
 if listing is null then raise exception 'This home is no longer available to book'; end if;
 k:=rid::text||':appointments.v1'; perform pg_advisory_xact_lock(hashtextextended(k,0));
 select value into items from public.app_kv where key=k; items:=coalesce(items,'[]');
 select x into existing from jsonb_array_elements(items) x where x->>'id'=request_id;
 if existing is not null then
  if not coalesce(existing->'recipientIds' ? cid,false) then raise exception 'Please start a new request' using errcode='42501'; end if;
  return request_id;
 end if;
 if (select count(*) from jsonb_array_elements(items) x where x->'recipientIds' ? cid and coalesce((x->>'updatedAt')::bigint,0)>stamp-86400000)>=10 then raise exception 'Please contact your realtor about additional viewing requests'; end if;
 items:=jsonb_build_array(jsonb_build_object('id',request_id,'listingId',listing_id,'listingTitle',listing->>'title','startsAt',starts,'durationMin',duration,'status','requested','createdBy','client','recipientIds',jsonb_build_array(cid),'updatedAt',stamp))||items;
 insert into public.app_kv(key,value,rev) values(k,items,stamp) on conflict(key) do update set value=excluded.value,rev=greatest(app_kv.rev+1,excluded.rev),updated_at=now();
 return request_id;
end; $$;
