begin;
select '1..6';
create temp table author_test_ids as select gen_random_uuid() owner_id, gen_random_uuid() author_id, gen_random_uuid() reader_id, gen_random_uuid() outsider_id, gen_random_uuid() project_id, gen_random_uuid() log_id;
grant select on author_test_ids to authenticated, anon;
create temp table author_test_results(test text, passed boolean);
grant insert, select on author_test_results to authenticated, anon;
insert into auth.users(id,email,email_confirmed_at)
select owner_id,owner_id || '@example.test',now() from author_test_ids union all
select author_id,author_id || '@example.test',now() from author_test_ids union all
select reader_id,reader_id || '@example.test',now() from author_test_ids union all
select outsider_id,outsider_id || '@example.test',now() from author_test_ids;
insert into public.projects(id,slug,name,is_public)
select project_id,project_id::text,'Author visibility rollback test',false from author_test_ids;
insert into public.project_members(project_id,user_id,role)
select project_id,owner_id,'owner' from author_test_ids union all
select project_id,author_id,'contributor' from author_test_ids union all
select project_id,reader_id,'reader' from author_test_ids;
insert into public.logs(id,project_id,slug,title,work_date,created_by_user_id)
select log_id,project_id,'test','Authorship',current_date,author_id from author_test_ids;
delete from public.project_members where user_id=(select author_id from author_test_ids);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select reader_id::text from author_test_ids),true);
insert into author_test_results select 'private reader sees former author',count(*)=1 from public.profiles where id=(select author_id from author_test_ids);
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
insert into author_test_results select 'outsider cannot see private author',count(*)=0 from public.profiles where id=(select author_id from author_test_ids);
set local role anon;
select set_config('request.jwt.claim.sub','',true);
insert into author_test_results select 'anonymous visitor cannot see private author',count(*)=0 from public.profiles where id=(select author_id from author_test_ids);
reset role;
update public.projects set is_public=true where id=(select project_id from author_test_ids);
set local role anon;
insert into author_test_results select 'public visitor sees recorded author',count(*)=1 from public.profiles where id=(select author_id from author_test_ids);
insert into author_test_results select 'public visitor cannot browse unrelated profiles',count(*)=0 from public.profiles where id=(select outsider_id from author_test_ids);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from author_test_ids),true);
update public.logs set finding_decisions='[{"finding":"Bearing wear","decision":"Replace"},{"finding":"Marking","decision":"Document"}]'::jsonb where id=(select log_id from author_test_ids);
insert into author_test_results select 'editing multiple findings preserves original author',jsonb_array_length(finding_decisions)=2 and created_by_user_id=(select author_id from author_test_ids) from public.logs where id=(select log_id from author_test_ids);
reset role;
select (case when passed then 'ok ' else 'not ok ' end) || row_number() over () || ' - ' || test from author_test_results;
rollback;


