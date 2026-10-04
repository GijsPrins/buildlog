begin;
select '1..7';
create temp table completion_test_ids as select gen_random_uuid() owner_id, gen_random_uuid() contributor_id, gen_random_uuid() reader_id, gen_random_uuid() project_id, gen_random_uuid() phase_id;
grant select on completion_test_ids to authenticated, anon;
create temp table completion_test_results(test text, passed boolean);
grant insert, select on completion_test_results to authenticated, anon;
insert into auth.users(id,email,email_confirmed_at)
select owner_id,owner_id || '@example.test',now() from completion_test_ids union all
select contributor_id,contributor_id || '@example.test',now() from completion_test_ids union all
select reader_id,reader_id || '@example.test',now() from completion_test_ids;
insert into public.projects(id,slug,name,is_public)
select project_id,project_id::text,'Completion rollback test',true from completion_test_ids;
insert into public.project_members(project_id,user_id,role)
select project_id,owner_id,'owner' from completion_test_ids union all
select project_id,contributor_id,'contributor' from completion_test_ids union all
select project_id,reader_id,'reader' from completion_test_ids;
insert into public.project_phases(id,project_id,name,sort_order)
select phase_id,project_id,'Ready for the road',0 from completion_test_ids;
update public.projects set current_phase_id=(select phase_id from completion_test_ids) where id=(select project_id from completion_test_ids);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from completion_test_ids),true);
insert into completion_test_results select 'new projects start in progress',not is_completed from public.projects where id=(select project_id from completion_test_ids);
update public.projects set is_completed=true where id=(select project_id from completion_test_ids);
insert into completion_test_results select 'owner completes custom phase without changing it',is_completed and current_phase_id=(select phase_id from completion_test_ids) from public.projects where id=(select project_id from completion_test_ids);
update public.project_phases set name='Done' where id=(select phase_id from completion_test_ids);
update public.projects set is_completed=false where id=(select project_id from completion_test_ids);
insert into completion_test_results select 'owner reopens even when phase is named Done',not is_completed from public.projects where id=(select project_id from completion_test_ids);
select set_config('request.jwt.claim.sub',(select contributor_id::text from completion_test_ids),true);
with changed as (update public.projects set is_completed=true where id=(select project_id from completion_test_ids) returning id)
insert into completion_test_results select 'contributor cannot change completion',count(*)=0 from changed;
select set_config('request.jwt.claim.sub',(select reader_id::text from completion_test_ids),true);
with changed as (update public.projects set is_completed=true where id=(select project_id from completion_test_ids) returning id)
insert into completion_test_results select 'reader cannot change completion',count(*)=0 from changed;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
with changed as (update public.projects set is_completed=true where id=(select project_id from completion_test_ids) returning id)
insert into completion_test_results select 'outsider cannot change completion',count(*)=0 from changed;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
insert into completion_test_results select 'public visitor can read completion',count(*)=1 and bool_and(not is_completed) from public.projects where id=(select project_id from completion_test_ids);
reset role;
select (case when passed then 'ok ' else 'not ok ' end) || row_number() over () || ' - ' || test from completion_test_results;
rollback;
