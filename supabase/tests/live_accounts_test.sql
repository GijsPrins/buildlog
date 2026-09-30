begin;
select plan(22);

insert into auth.users(id,email,email_confirmed_at) values
 ('71000000-0000-0000-0000-000000000001','owner@workshop.test',now()),
 ('71000000-0000-0000-0000-000000000002','member@workshop.test',now()),
 ('71000000-0000-0000-0000-000000000003','reader@workshop.test',now()),
 ('71000000-0000-0000-0000-000000000004','pending@workshop.test',null);
insert into public.projects(id,slug,name,is_public,items_enabled) values
 ('72000000-0000-0000-0000-000000000001','test-handoff','Handoff',false,true),
 ('72000000-0000-0000-0000-000000000002','test-deletion','Deletion',false,true);
insert into public.project_members(project_id,user_id,role) values
 ('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','owner'),
 ('72000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000002','owner');
set constraints all immediate;
set constraints all deferred;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);

select lives_ok($$select public.workshop_members('72000000-0000-0000-0000-000000000001','add',' MEMBER@workshop.test ','contributor')$$,'Owner recognizes verified account by normalized email');
select is((select role from public.project_members where project_id='72000000-0000-0000-0000-000000000001' and user_id='71000000-0000-0000-0000-000000000002'),'contributor','Verified account granted contributor access');
select throws_ok($$select public.workshop_members('72000000-0000-0000-0000-000000000001','add','owner@workshop.test','reader')$$,null,null,'Owner cannot demote themselves');
select lives_ok($$select public.workshop_members('72000000-0000-0000-0000-000000000001','add','pending@workshop.test','reader')$$,'Unknown/unverified account gets pending invitation');
select is((select count(*)::integer from public.project_members where project_id='72000000-0000-0000-0000-000000000001'),2,'Unverified account not admitted');
select throws_ok($$select public.prepare_account_deletion('71000000-0000-0000-0000-000000000001',true,'{}')$$,'42501',null,'Browser cannot invoke privileged account cleanup');

select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.workshop_members('72000000-0000-0000-0000-000000000001')$$,'42501',null,'Contributor cannot list owner-only account details');
select throws_ok($$select public.workshop_members('72000000-0000-0000-0000-000000000001','add','reader@workshop.test','reader')$$,'42501',null,'Contributor cannot invite members');
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000004',true);
select is(public.accept_workshop_invitations(),0,'Unverified email cannot accept invitation');
reset role;
update auth.users set email_confirmed_at=now() where id='71000000-0000-0000-0000-000000000004';
set local role authenticated;
select is(public.accept_workshop_invitations(),1,'Verified email accepts pending invitation');
select is(public.accept_workshop_invitations(),0,'Invitation acceptance is idempotent');
select is((select role from public.project_members where project_id='72000000-0000-0000-0000-000000000001' and user_id='71000000-0000-0000-0000-000000000004'),'reader','Invited reader has intended role');
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.workshop_members('72000000-0000-0000-0000-000000000001','remove',null,'reader','71000000-0000-0000-0000-000000000004')$$,'Owner can revoke reader access');
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from public.projects where id='72000000-0000-0000-0000-000000000001'),0,'Revoked reader loses private-project access');
reset role;

insert into public.items(id,owner_user_id,name,created_by_user_id) values('73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','Retained part','71000000-0000-0000-0000-000000000001');
insert into public.project_items(project_id,item_id,role) values('72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','part');
insert into public.project_images(id,project_id,upload_status,uploaded_by_user_id) values
 ('74000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','ready','71000000-0000-0000-0000-000000000001'),
 ('74000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000002','ready','71000000-0000-0000-0000-000000000002');
insert into storage.objects(bucket_id,name,owner_id,owner) values('project-originals','72000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/original','71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001');
select throws_ok($$select public.prepare_account_deletion('71000000-0000-0000-0000-000000000001',false,'{}')$$,null,null,'Missing successor rejects deletion transaction');
select lives_ok($$select public.prepare_account_deletion('71000000-0000-0000-0000-000000000001',false,'{"72000000-0000-0000-0000-000000000001":"reader@workshop.test"}')$$,'Keep-projects deletion transfers ownership');
select is((select user_id::text from public.project_members where project_id='72000000-0000-0000-0000-000000000001' and role='owner'),'71000000-0000-0000-0000-000000000003','New owner is assigned');
select is((select owner_user_id::text from public.items where id='73000000-0000-0000-0000-000000000001'),'71000000-0000-0000-0000-000000000003','Retained item ownership transferred');
select is((select owner_id from storage.objects where name='72000000-0000-0000-0000-000000000001/74000000-0000-0000-0000-000000000001/original'),'71000000-0000-0000-0000-000000000003','Retained photo ownership transferred');
select is(jsonb_array_length(public.prepare_account_deletion('71000000-0000-0000-0000-000000000002',true,'{}')),1,'Delete-projects cleanup returns Storage API paths');
select is((select count(*)::integer from public.projects where id='72000000-0000-0000-0000-000000000002'),0,'Owned project and children removed');
select lives_ok($$select public.prepare_account_deletion('71000000-0000-0000-0000-000000000002',true,'{}')$$,'Cleanup can be safely retried');

select * from finish();
rollback;
