begin;
select '1..9';
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
select set_config('request.jwt.claim.sub',(select contributor_id::text from usage_test_ids),true);
insert into public.project_specs(project_id,section,label,value) select project_id,'Frame','Serial','TEST123' from usage_test_ids;
insert into usage_test_results select 'contributor adds fact',count(*)=1 from public.project_specs where project_id=(select project_id from usage_test_ids);
update public.project_specs set value='TEST456' where project_id=(select project_id from usage_test_ids);
insert into usage_test_results select 'contributor edits fact',value='TEST456' from public.project_specs where project_id=(select project_id from usage_test_ids);
select set_config('request.jwt.claim.sub',(select reader_id::text from usage_test_ids),true);
with changed as (delete from public.project_specs where project_id=(select project_id from usage_test_ids) returning id)
insert into usage_test_results select 'reader cannot delete fact',count(*)=0 from changed;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
insert into usage_test_results select 'outsider cannot read private dossier',count(*)=0 from public.project_specs where project_id=(select project_id from usage_test_ids);
select set_config('request.jwt.claim.sub',(select owner_id::text from usage_test_ids),true);
with changed as (delete from public.project_specs where project_id=(select project_id from usage_test_ids) returning id)
insert into usage_test_results select 'owner deletes fact',count(*)=1 from changed;
reset role;
select (case when passed then 'ok ' else 'not ok ' end) || row_number() over () || ' - ' || test from usage_test_results;
rollback;
