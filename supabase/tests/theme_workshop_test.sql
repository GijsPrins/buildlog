begin;
select '1..8';
create temp table theme_test_ids as select gen_random_uuid() owner_id, gen_random_uuid() contributor_id, gen_random_uuid() reader_id, gen_random_uuid() project_id, gen_random_uuid() phase_id;
grant select on theme_test_ids to authenticated, anon;
create temp table theme_test_results(test text, passed boolean);
grant insert, select on theme_test_results to authenticated, anon;
insert into auth.users(id,email,email_confirmed_at)
select owner_id,owner_id || '@example.test',now() from theme_test_ids union all
select contributor_id,contributor_id || '@example.test',now() from theme_test_ids union all
select reader_id,reader_id || '@example.test',now() from theme_test_ids;
insert into public.projects(id,slug,name,is_public)
select project_id,project_id::text,'Theme rollback test',true from theme_test_ids;
insert into public.project_members(project_id,user_id,role)
select project_id,owner_id,'owner' from theme_test_ids union all
select project_id,contributor_id,'contributor' from theme_test_ids union all
select project_id,reader_id,'reader' from theme_test_ids;
insert into public.project_phases(id,project_id,name,sort_order)
select phase_id,project_id,'Ready for the road',0 from theme_test_ids;
update public.projects set current_phase_id=(select phase_id from theme_test_ids) where id=(select project_id from theme_test_ids);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from theme_test_ids),true);
update public.projects set theme_config=jsonb_set(theme_config,'{typography,body}','"serif"') where id=(select project_id from theme_test_ids);
insert into theme_test_results select 'owner saves serif project theme',theme_config->'typography'->>'body'='serif' from public.projects where id=(select project_id from theme_test_ids);
insert into public.user_themes(user_id,name,config) select owner_id,'Bookish test',theme_config from theme_test_ids join public.projects on id=project_id;
insert into theme_test_results select 'owner saves serif library theme',count(*)=1 from public.user_themes where user_id=(select owner_id from theme_test_ids);
do $$ begin
 begin
  update public.user_themes set config=jsonb_set(config,'{typography,body}','"unsupported"') where user_id=(select owner_id from theme_test_ids);
  raise exception 'Invalid typeface accepted';
 exception when check_violation then insert into theme_test_results values('invalid body typeface rejected',true); end;
 begin
  update public.user_themes set config=config #- '{colors,primary}' where user_id=(select owner_id from theme_test_ids);
  raise exception 'Missing colour accepted';
 exception when check_violation then insert into theme_test_results values('missing colour still rejected',true); end;
end $$;
select set_config('request.jwt.claim.sub',(select contributor_id::text from theme_test_ids),true);
with changed as (update public.projects set theme_config=jsonb_set(theme_config,'{typography,body}','"sans"') where id=(select project_id from theme_test_ids) returning id)
insert into theme_test_results select 'contributor cannot change project theme',count(*)=0 from changed;
select set_config('request.jwt.claim.sub',(select reader_id::text from theme_test_ids),true);
with changed as (update public.projects set theme_config=jsonb_set(theme_config,'{typography,body}','"sans"') where id=(select project_id from theme_test_ids) returning id)
insert into theme_test_results select 'reader cannot change project theme',count(*)=0 from changed;
insert into theme_test_results select 'other member cannot read personal library',count(*)=0 from public.user_themes where user_id=(select owner_id from theme_test_ids);
set local role anon;
select set_config('request.jwt.claim.sub','',true);
insert into theme_test_results select 'public visitor reads saved project theme',theme_config->'typography'->>'body'='serif' from public.projects where id=(select project_id from theme_test_ids);
reset role;
select (case when passed then 'ok ' else 'not ok ' end) || row_number() over () || ' - ' || test from theme_test_results;
rollback;
