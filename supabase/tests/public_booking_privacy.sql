begin;
-- Synthetic fixtures only. The entire transaction is rolled back, including identities.
insert into auth.users(id,email,is_anonymous) values
 ('a1000000-0000-4000-8000-000000000001','realtor-a@privacy-qa.invalid',false),
 ('a1000000-0000-4000-8000-000000000002','realtor-b@privacy-qa.invalid',false),
 ('a1000000-0000-4000-8000-000000000003',null,true),
 ('a1000000-0000-4000-8000-000000000004',null,true),
 ('a1000000-0000-4000-8000-000000000005',null,true);
insert into public.realtors(id,email,name,password_hash,auth_user_id,client_code_enabled) values
 ('b1000000-0000-4000-8000-000000000001','realtor-a@privacy-qa.invalid','Fixture A','not-a-password','a1000000-0000-4000-8000-000000000001',true),
 ('b1000000-0000-4000-8000-000000000002','realtor-b@privacy-qa.invalid','Fixture B','not-a-password','a1000000-0000-4000-8000-000000000002',true);
insert into public.client_accounts(realtor_id,email,pw_hash,client_id,name) values
 ('b1000000-0000-4000-8000-000000000001','client-a@privacy-qa.invalid',extensions.crypt(repeat('a',64),extensions.gen_salt('bf',4)),'client-a','Fixture Client A'),
 ('b1000000-0000-4000-8000-000000000001','client-b@privacy-qa.invalid',extensions.crypt(repeat('b',64),extensions.gen_salt('bf',4)),'client-b','Fixture Client B');
insert into private.client_sessions(auth_user_id,realtor_id,client_id,credential_version)
 select case client_id when 'client-a' then 'a1000000-0000-4000-8000-000000000003'::uuid else 'a1000000-0000-4000-8000-000000000004'::uuid end,realtor_id,client_id,pw_hash from public.client_accounts where realtor_id='b1000000-0000-4000-8000-000000000001';
insert into public.app_kv(key,value,rev) values
 ('b1000000-0000-4000-8000-000000000001:clientProfiles.v1','{"client-a":{"clientId":"client-a","secret":"A"},"client-b":{"clientId":"client-b","secret":"B"}}',1),
 ('b1000000-0000-4000-8000-000000000001:clientFeed.v1','{"client-a":{"clientId":"client-a","notes":["A"]},"client-b":{"clientId":"client-b","notes":["B"]}}',1),
 ('b1000000-0000-4000-8000-000000000001:clients.v1','[{"id":"client-a"},{"id":"client-b"}]',1),
 ('b1000000-0000-4000-8000-000000000001:client-a:chat.v1','[{"id":"m-a","role":"client","text":"private A"}]',1),
 ('b1000000-0000-4000-8000-000000000001:client-b:chat.v1','[{"id":"m-b","role":"client","text":"private B"}]',1),
 ('b1000000-0000-4000-8000-000000000001:tx.v1','[{"id":"tx-a","clientIds":["client-a"]},{"id":"tx-b","clientIds":["client-b"]}]',1),
 ('b1000000-0000-4000-8000-000000000001:docs.v2','[{"id":"unassigned"},{"id":"doc-a","recipientIds":["client-a"]},{"id":"doc-b","recipientIds":["client-b"]},{"id":"doc-tx-b","transactionId":"tx-b"}]',1),
 ('b1000000-0000-4000-8000-000000000001:appointments.v1','[{"id":"appt-a","recipientIds":["client-a"]},{"id":"appt-b","recipientIds":["client-b"]}]',1),
 ('b1000000-0000-4000-8000-000000000001:notifs.v1','[{"id":"notice-a","recipientIds":["client-a"]},{"id":"notice-b","recipientIds":["client-b"]},{"id":"notice-owner","audience":"realtor"}]',1),
 ('b1000000-0000-4000-8000-000000000001:listings.v2','{"items":[{"id":"public"},{"id":"hidden","hidden":true},{"id":"archived","sourceArchived":true}]}',1),
 ('b1000000-0000-4000-8000-000000000002:clients.v1','[{"id":"other-realtor-private"}]',1);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000005',true);
do $$ declare cid text; again text; denied boolean:=false; begin
 cid:=public.capture_public_lead('b1000000-0000-4000-8000-000000000001','Public Visitor','visitor@privacy-qa.invalid','');
 again:=public.capture_public_lead('b1000000-0000-4000-8000-000000000001','Public Visitor','visitor@privacy-qa.invalid','');
 if cid<>again then raise exception 'Retry duplicated lead'; end if;
 if public.secure_kv_get('b1000000-0000-4000-8000-000000000001:clients.v1') is not null then raise exception 'Public visitor can read roster'; end if;
 perform public.request_public_showing('b1000000-0000-4000-8000-000000000001','public-request','public',(extract(epoch from now())*1000)::bigint+86400000,45);
 perform public.request_public_showing('b1000000-0000-4000-8000-000000000001','public-request','public',(extract(epoch from now())*1000)::bigint+86400000,45);
 begin perform public.request_public_showing('b1000000-0000-4000-8000-000000000001','hidden-request','hidden',(extract(epoch from now())*1000)::bigint+86400000,45); exception when others then denied:=true; end;
 if not denied then raise exception 'Hidden home booking allowed'; end if;
 if public.secure_kv_get('b1000000-0000-4000-8000-000000000001:appointments.v1') is not null then raise exception 'Public appointments exposed'; end if;
end $$;
reset role;
do $$ declare v jsonb; cid text; begin
 select lead_id into cid from private.public_leads where auth_user_id='a1000000-0000-4000-8000-000000000005';
 select value into v from public.app_kv where key='b1000000-0000-4000-8000-000000000001:appointments.v1';
 if (select count(*) from jsonb_array_elements(v) x where x->>'id'='public-request')<>1 then raise exception 'Duplicate showing'; end if;
 if not (select x->'recipientIds' ? cid from jsonb_array_elements(v) x where x->>'id'='public-request') then raise exception 'Recipient forged'; end if;
 if jsonb_array_length(v)<>3 then raise exception 'Peer appointments overwritten'; end if;
end $$;
select jsonb_build_object('passed',true,'checks','write-only lead capture, safe retry, private reads denied, server-derived recipient, hidden listing denied, appointments preserved');
rollback;
