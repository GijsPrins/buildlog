begin;
select '1..12';
create temp table usage_test_ids as select gen_random_uuid() owner_id, gen_random_uuid() contributor_id, gen_random_uuid() reader_id, gen_random_uuid() project_id, gen_random_uuid() item_id, gen_random_uuid() link_id, gen_random_uuid() log_id, gen_random_uuid() usage_id;
grant select on usage_test_ids to authenticated;
create temp table usage_test_results(test text, passed boolean);
grant insert, select on usage_test_results to authenticated;
insert into auth.users(id,email,email_confirmed_at)
select owner_id, owner_id || '@example.test', now() from usage_test_ids union all
select contributor_id, contributor_id || '@example.test', now() from usage_test_ids union all
select reader_id, reader_id || '@example.test', now() from usage_test_ids;
insert into public.projects(id,slug,name,items_enabled,cost_tracking_enabled)
select project_id, project_id::text, 'Usage cost rollback test',true,true from usage_test_ids;
insert into public.project_members(project_id,user_id,role)
select project_id, owner_id, 'owner' from usage_test_ids union all
select project_id, contributor_id, 'contributor' from usage_test_ids union all
select project_id, reader_id, 'reader' from usage_test_ids;
insert into public.items(id,owner_user_id,name,created_by_user_id)
select item_id,owner_id,'Test fluid',owner_id from usage_test_ids;
insert into public.project_items(id,project_id,item_id,role)
select link_id,project_id,item_id,'consumable' from usage_test_ids;
insert into public.logs(id,project_id,slug,title,work_date,created_by_user_id)
select log_id,project_id,'test','Usage',current_date,owner_id from usage_test_ids;
insert into public.log_item_usage(id,project_id,log_id,project_item_id,usage_amount)
select usage_id,project_id,log_id,link_id,150 from usage_test_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select contributor_id::text from usage_test_ids),true);
update public.log_item_usage set usage_cost=2.50 where id=(select usage_id from usage_test_ids);
insert into usage_test_results select 'contributor saves cost without altering quantity', usage_cost=2.50 and usage_amount=150 from public.log_item_usage where id=(select usage_id from usage_test_ids);
do $$ begin
  begin
    update public.log_item_usage set usage_cost=-1 where id=(select usage_id from usage_test_ids);
    raise exception 'Negative usage cost was accepted';
  exception when check_violation then insert into usage_test_results values('negative cost rejected',true); end;
end $$;
select set_config('request.jwt.claim.sub',(select reader_id::text from usage_test_ids),true);
with changed as (update public.log_item_usage set usage_cost=999 where id=(select usage_id from usage_test_ids) returning id)
insert into usage_test_results select 'reader cannot change cost',count(*)=0 from changed;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
insert into usage_test_results select 'outsider cannot read usage',count(*)=0 from public.log_item_usage where id=(select usage_id from usage_test_ids);

select set_config('request.jwt.claim.sub',(select owner_id::text from usage_test_ids),true);
insert into public.project_images(project_id,log_id,media_type,byte_size,role,upload_status)
select project_id,log_id,'image/png',100,'before','ready' from usage_test_ids;
update public.projects set hero_image_id=(select id from public.project_images where project_id=(select project_id from usage_test_ids)) where id=(select project_id from usage_test_ids);
select public.transfer_project_ownership((select project_id from usage_test_ids),(select reader_id from usage_test_ids));
insert into usage_test_results select 'one owner after transfer',count(*)=1 from public.project_members where project_id=(select project_id from usage_test_ids) and role='owner';
insert into usage_test_results select 'previous owner becomes contributor',role='contributor' from public.project_members where project_id=(select project_id from usage_test_ids) and user_id=(select owner_id from usage_test_ids);
do $$ begin
 begin
  perform public.transfer_project_ownership((select project_id from usage_test_ids),(select owner_id from usage_test_ids));
  raise exception 'Former owner transferred again';
 exception when insufficient_privilege then insert into usage_test_results values('former owner cannot transfer',true); end;
end $$;
select set_config('request.jwt.claim.sub',(select reader_id::text from usage_test_ids),true);
do $$ begin
 begin
  perform public.transfer_project_ownership((select project_id from usage_test_ids),gen_random_uuid());
  raise exception 'Nonmember received ownership';
 exception when foreign_key_violation then insert into usage_test_results values('nonmember cannot receive ownership',true); end;
end $$;
select set_config('request.jwt.claim.sub',(select contributor_id::text from usage_test_ids),true);
delete from public.logs where id=(select log_id from usage_test_ids);
insert into usage_test_results select 'editor deletes log',count(*)=0 from public.logs where id=(select log_id from usage_test_ids);
insert into usage_test_results select 'log usage deleted',count(*)=0 from public.log_item_usage where log_id=(select log_id from usage_test_ids);
insert into usage_test_results select 'original image retained and detached',count(*)=1 from public.project_images where project_id=(select project_id from usage_test_ids) and log_id is null;
insert into usage_test_results select 'project cover retained',hero_image_id is not null from public.projects where id=(select project_id from usage_test_ids);
reset role;
select (case when passed then 'ok ' else 'not ok ' end) || row_number() over () || ' - ' || test from usage_test_results;
rollback;
