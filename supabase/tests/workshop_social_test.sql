begin;
create temp table social_ids as select gen_random_uuid() owner_id, gen_random_uuid() reader_id,
  gen_random_uuid() visitor_id, gen_random_uuid() inactive_id, gen_random_uuid() private_id,
  gen_random_uuid() public_id, gen_random_uuid() private_log, gen_random_uuid() public_log;
create temp table social_results(test text, passed boolean);
grant select on social_ids to anon, authenticated;
grant insert,select on social_results to anon, authenticated;
insert into auth.users(id,email,email_confirmed_at)
select owner_id,owner_id||'@example.test',now() from social_ids union all
select reader_id,reader_id||'@example.test',now() from social_ids union all
select visitor_id,visitor_id||'@example.test',now() from social_ids union all
select inactive_id,inactive_id||'@example.test',null from social_ids;
update public.profiles set display_name='Social fixture builder' where id in (select reader_id from social_ids);
insert into public.projects(id,slug,name,is_public)
select private_id,private_id::text,'Private social fixture',false from social_ids union all
select public_id,public_id::text,'Public social fixture',true from social_ids;
insert into public.project_members(project_id,user_id,role)
select private_id,owner_id,'owner' from social_ids union all
select public_id,owner_id,'owner' from social_ids union all
select private_id,reader_id,'reader' from social_ids;
insert into public.logs(id,project_id,slug,title,work_date,created_by_user_id)
select private_log,private_id,'private-session','Private fixture',current_date,owner_id from social_ids union all
select public_log,public_id,'public-session','Public fixture',current_date,owner_id from social_ids;
insert into public.workshop_comments(project_id,author_user_id,content)
select private_id,owner_id,'Owner note' from social_ids;

-- Each error expectation executes with the caller's actual database role.
create function pg_temp.social_denied(q text, expected text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return sqlstate=expected; end; $$;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select reader_id::text from social_ids),true);
insert into public.workshop_comments(project_id,author_user_id,content)
select private_id,reader_id,'Reader project note' from social_ids;
insert into public.workshop_comments(project_id,log_id,author_user_id,content)
select private_id,private_log,reader_id,'Reader log note' from social_ids;
insert into social_results select 'private reader can comment on project and log with server-sourced name',count(*)=2 and bool_and(author_display_name='Social fixture builder') from public.workshop_comments where author_user_id=(select reader_id from social_ids);
with changed as (update public.logs set title='Unauthorized' where id=(select private_log from social_ids) returning id)
insert into social_results select 'comment permission does not grant content editing',count(*)=0 from changed;
update public.workshop_comments set content='Corrected reader note' where content='Reader project note';
insert into social_results select 'writer edits own note',count(*)=1 from public.workshop_comments where content='Corrected reader note';
with changed as (update public.workshop_comments set content='Unauthorized' where content='Owner note' returning id)
insert into social_results select 'reader cannot edit another writer',count(*)=0 from changed;
insert into social_results select 'reader cannot remove another writer',pg_temp.social_denied('select public.remove_workshop_comment(id) from public.workshop_comments where content=''Owner note''','42501');
insert into social_results select 'cannot reassign comment identity/target',pg_temp.social_denied('update public.workshop_comments set log_id=null', '42501');
insert into social_results select 'cannot spoof displayed author',pg_temp.social_denied('insert into public.workshop_comments(project_id,author_user_id,author_display_name,content) select private_id,reader_id,''Owner'',''Spoof'' from social_ids','42501');
insert into social_results select 'cannot spoof author identity',pg_temp.social_denied('insert into public.workshop_comments(project_id,author_user_id,content) select private_id,owner_id,''Spoof'' from social_ids','42501');
insert into social_results select 'blank note rejected',pg_temp.social_denied('insert into public.workshop_comments(project_id,content) select private_id,E'' \n\t'' from social_ids','23514');
insert into social_results select 'oversized note rejected',pg_temp.social_denied('insert into public.workshop_comments(project_id,content) select private_id,repeat(''x'',2001) from social_ids','23514');
insert into public.workshop_approvals(project_id,user_id) select private_id,reader_id from social_ids;
insert into public.workshop_approvals(project_id,log_id,user_id) select private_id,private_log,reader_id from social_ids;
insert into social_results select 'independent project/log stamps',count(*)=2 from public.workshop_approvals where user_id=(select reader_id from social_ids);
insert into social_results select 'project stamp cannot be duplicated',pg_temp.social_denied('insert into public.workshop_approvals(project_id) select private_id from social_ids','23505');
insert into social_results select 'log stamp cannot be duplicated',pg_temp.social_denied('insert into public.workshop_approvals(project_id,log_id) select private_id,private_log from social_ids','23505');
insert into social_results select 'cannot stamp for someone else',pg_temp.social_denied('insert into public.workshop_approvals(project_id,user_id) select private_id,owner_id from social_ids','42501');
with removed as (delete from public.workshop_approvals where log_id=(select private_log from social_ids) returning id)
insert into social_results select 'writer can withdraw own stamp',count(*)=1 from removed;

select set_config('request.jwt.claim.sub',(select visitor_id::text from social_ids),true);
insert into social_results select 'outsider cannot see private notes or stamps',not exists(select 1 from public.workshop_comments where project_id=(select private_id from social_ids)) and not exists(select 1 from public.workshop_approvals where project_id=(select private_id from social_ids));
insert into social_results select 'outsider cannot write private notes',pg_temp.social_denied('insert into public.workshop_comments(project_id,content) select private_id,''Intrusion'' from social_ids','42501');
insert into social_results select 'outsider cannot stamp private builds',pg_temp.social_denied('insert into public.workshop_approvals(project_id) select private_id from social_ids','42501');
insert into public.workshop_comments(project_id,log_id,content) select public_id,public_log,'Public visitor note' from social_ids;
insert into public.workshop_approvals(project_id,log_id) select public_id,public_log from social_ids;
insert into social_results select 'public visitors participate without membership',exists(select 1 from public.workshop_comments where content='Public visitor note') and not exists(select 1 from public.project_members where user_id=(select visitor_id from social_ids));
insert into social_results select 'public project cannot expose a private log note',pg_temp.social_denied('insert into public.workshop_comments(project_id,log_id,content) select public_id,private_log,''Wrong project'' from social_ids','23503');
insert into social_results select 'public project cannot expose a private log stamp',pg_temp.social_denied('insert into public.workshop_approvals(project_id,log_id) select public_id,private_log from social_ids','23503');
select set_config('request.jwt.claim.sub',(select inactive_id::text from social_ids),true);
insert into social_results select 'unverified account cannot comment',pg_temp.social_denied('insert into public.workshop_comments(project_id,content) select public_id,''Unverified'' from social_ids','42501');
insert into social_results select 'unverified account cannot stamp',pg_temp.social_denied('insert into public.workshop_approvals(project_id) select public_id from social_ids','42501');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
insert into social_results select 'anonymous visitor sees public discussion only',count(*)=1 and bool_and(project_id=(select public_id from social_ids)) from public.workshop_comments;
insert into social_results select 'anonymous visitor sees public stamp counts only',count(*)=1 and bool_and(project_id=(select public_id from social_ids)) from public.workshop_approvals;
insert into social_results select 'anonymous writes denied',pg_temp.social_denied('insert into public.workshop_comments(project_id,content) select public_id,''Anon'' from social_ids','42501') and pg_temp.social_denied('insert into public.workshop_approvals(project_id) select public_id from social_ids','42501');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from social_ids),true);
select public.remove_workshop_comment(id) from public.workshop_comments where content='Corrected reader note';
insert into social_results select 'owner moderates comments',exists(select 1 from public.workshop_comments where author_user_id=(select reader_id from social_ids) and log_id is null and deleted_at is not null and content='');
with removed as (delete from public.workshop_approvals where user_id=(select reader_id from social_ids) returning id)
insert into social_results select 'owner cannot withdraw someone elses stamp',count(*)=0 from removed;

reset role;
update public.projects set is_public=false where id=(select public_id from social_ids);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select visitor_id::text from social_ids),true);
insert into social_results select 'making a project private hides its conversation from former public visitors',not exists(select 1 from public.workshop_comments where project_id=(select public_id from social_ids)) and not exists(select 1 from public.workshop_approvals where project_id=(select public_id from social_ids));

reset role;
delete from auth.users where id=(select visitor_id from social_ids);
insert into social_results select 'account deletion removes stamps and anonymizes retained notes',exists(select 1 from public.workshop_comments where content='Public visitor note' and author_user_id is null and author_display_name='Former builder') and not exists(select 1 from public.workshop_approvals where user_id=(select visitor_id from social_ids));
delete from public.logs where id=(select private_log from social_ids);
insert into social_results select 'log deletion removes its discussion, preserves project discussion',not exists(select 1 from public.workshop_comments where log_id=(select private_log from social_ids)) and exists(select 1 from public.workshop_comments where content='Owner note');
select (case when passed then 'ok ' else 'not ok ' end)||row_number() over ()||' - '||test from social_results;
rollback;
