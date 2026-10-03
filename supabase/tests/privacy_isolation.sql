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
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
do $$ declare v jsonb; k text; denied boolean; begin
 if (select count(*) from public.app_kv)>0 then raise exception 'Client can directly read tenant blobs'; end if;
 foreach k in array array['clientProfiles.v1','clientFeed.v1','clients.v1','docs.v2','tx.v1','appointments.v1','notifs.v1'] loop
  v:=public.secure_kv_get('b1000000-0000-4000-8000-000000000001:'||k);
  if v is null or v::text like '%client-b%' or v::text like '%doc-b%' or v::text like '%appt-b%' or v::text like '%notice-b%' or v::text like '%notice-owner%' or v::text like '%unassigned%' then raise exception 'Filtered read failed for %: %',k,v; end if;
 end loop;
 if public.secure_kv_get('b1000000-0000-4000-8000-000000000001:client-b:chat.v1') is not null then raise exception 'Peer chat exposed'; end if;
 if public.secure_kv_get('b1000000-0000-4000-8000-000000000002:clients.v1') is not null then raise exception 'Other realtor roster exposed'; end if;
 v:=public.secure_kv_get('b1000000-0000-4000-8000-000000000001:listings.v2');
 if v::text like '%hidden%' or v::text like '%archived%' then raise exception 'Private listings exposed'; end if;
 perform public.secure_kv_set('b1000000-0000-4000-8000-000000000001:clientProfiles.v1','{"client-a":{"clientId":"client-a","secret":"updated A"}}',2);
 denied:=false;
 begin perform public.secure_kv_set('b1000000-0000-4000-8000-000000000001:clientProfiles.v1','{"client-b":{"clientId":"client-b","secret":"forged"}}',3); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Peer profile write allowed'; end if;
 denied:=false;
 begin perform public.secure_kv_set('b1000000-0000-4000-8000-000000000001:client-b:chat.v1','[]',3); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Peer chat write allowed'; end if;
 denied:=false;
 begin perform public.secure_kv_set('b1000000-0000-4000-8000-000000000001:client-a:chat.v1','[{"id":"forged","role":"realtor","text":"fake"}]',3); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Realtor impersonation allowed'; end if;
 perform public.secure_kv_set('b1000000-0000-4000-8000-000000000001:client-a:chat.v1','[{"id":"new-a","role":"client","text":"legitimate"}]',3);
 if public.authorize_push('b1000000-0000-4000-8000-000000000001','all-clients') then raise exception 'Client push to all clients allowed'; end if;
 if not public.authorize_push('b1000000-0000-4000-8000-000000000001','realtor') then raise exception 'Legitimate realtor contact blocked'; end if;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
do $$ declare v jsonb; begin
 v:=public.secure_kv_get('b1000000-0000-4000-8000-000000000001:clientProfiles.v1');
 if v->'value'->'client-b'->>'secret'<>'B' or v->'value'->'client-a'->>'secret'<>'updated A' then raise exception 'Scoped merge destroyed peer profile'; end if;
 if public.secure_kv_get('b1000000-0000-4000-8000-000000000002:clients.v1') is not null then raise exception 'Realtor can access another realtor'; end if;
 perform public.secure_kv_set('b1000000-0000-4000-8000-000000000001:brand.v2','{"own":"allowed"}',4);
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000005',true);
do $$ declare denied boolean:=false; begin
 if public.secure_kv_get('b1000000-0000-4000-8000-000000000001:clientProfiles.v1') is not null then raise exception 'Unbound account exposed private data'; end if;
 begin perform public.delete_client_account('b1000000-0000-4000-8000-000000000001','client-a@privacy-qa.invalid'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Unbound client account deletion allowed'; end if;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select public.revoke_client_identity();
do $$ begin if public.current_client_identity() is not null then raise exception 'Logout did not revoke membership'; end if; if public.secure_kv_get('b1000000-0000-4000-8000-000000000001:clientProfiles.v1') is not null then raise exception 'Logged-out client can read private data'; end if; end $$;
reset role;
select jsonb_build_object('passed',true,'checks','two realtors; two clients; unbound client; filtered reads; own writes; peer denials; merge preservation; impersonation denial; push audience; deletion denial; session revocation','fixtures','synthetic; transaction rolled back') as privacy_verification;
rollback;
