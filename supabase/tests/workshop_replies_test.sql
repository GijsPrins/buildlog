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

insert into public.workshop_comments(project_id,author_user_id,content)
select public_id,owner_id,'Public root' from social_ids;
alter table social_ids add column private_root uuid,add column public_root uuid;
update social_ids set private_root=(select id from public.workshop_comments where content='Owner note'),public_root=(select id from public.workshop_comments where content='Public root');
create function pg_temp.social_denied(q text, expected text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return sqlstate=expected; end; $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select reader_id::text from social_ids),true);
insert into public.workshop_comments(project_id,parent_id,content) select private_id,private_root,'Reader reply' from social_ids;
insert into social_results select 'reader replies without content editing',exists(select 1 from public.workshop_comments where content='Reader reply' and parent_id=(select private_root from social_ids) and thread_id=parent_id);
insert into public.workshop_comments(project_id,parent_id,content) select private_id,(select id from public.workshop_comments where content='Reader reply'),'Reply to a reply' from social_ids;
insert into social_results select 'reply-to-reply retains immediate parent and original thread',exists(select 1 from public.workshop_comments where content='Reply to a reply' and parent_id<>thread_id and thread_id=(select private_root from social_ids));
insert into social_results select 'cannot attach reply to another project',pg_temp.social_denied('insert into public.workshop_comments(project_id,parent_id,content) select public_id,private_root,''Wrong project'' from social_ids','23514');
insert into social_results select 'cannot move reply between project and log conversation',pg_temp.social_denied('insert into public.workshop_comments(project_id,log_id,parent_id,content) select private_id,private_log,private_root,''Wrong target'' from social_ids','23514');
insert into social_results select 'cannot invent a parent',pg_temp.social_denied('insert into public.workshop_comments(project_id,parent_id,content) select private_id,gen_random_uuid(),''Missing parent'' from social_ids','23514');
insert into social_results select 'cannot set or move thread identity',pg_temp.social_denied('insert into public.workshop_comments(project_id,thread_id,content) select private_id,private_root,''Spoof'' from social_ids','42501') and pg_temp.social_denied('update public.workshop_comments set parent_id=null','42501');
insert into social_results select 'hard deletion unavailable to clients',pg_temp.social_denied('delete from public.workshop_comments where content=''Reader reply''','42501');
select public.remove_workshop_comment(id) from public.workshop_comments where content='Reader reply';
insert into social_results select 'removal erases text but preserves replies',exists(select 1 from public.workshop_comments where parent_id=(select private_root from social_ids) and deleted_at is not null and content='') and exists(select 1 from public.workshop_comments where content='Reply to a reply');
with changed as (update public.workshop_comments set content='Restored' where deleted_at is not null returning id)
insert into social_results select 'removed note cannot be edited/restored',count(*)=0 from changed;
insert into social_results select 'cannot reply directly to removed note',pg_temp.social_denied('insert into public.workshop_comments(project_id,parent_id,content) select private_id,(select id from public.workshop_comments where deleted_at is not null),''Unavailable'' from social_ids','23514');
insert into social_results select 'reader cannot moderate root',pg_temp.social_denied('select public.remove_workshop_comment(private_root) from social_ids','42501');
select set_config('request.jwt.claim.sub',(select owner_id::text from social_ids),true);
select public.remove_workshop_comment(private_root) from social_ids;
insert into social_results select 'root tombstone appears while live replies remain',exists(select 1 from public.workshop_threads where id=(select private_root from social_ids) and deleted_at is not null and reply_count=1);
select public.remove_workshop_comment(id) from public.workshop_comments where content='Reply to a reply';
insert into social_results select 'empty removed thread disappears',not exists(select 1 from public.workshop_threads where id=(select private_root from social_ids));
select set_config('request.jwt.claim.sub',(select reader_id::text from social_ids),true);
insert into public.workshop_comments(project_id,parent_id,content) select public_id,public_root,'Public reader reply' from social_ids;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
insert into social_results select 'anonymous view and counts exclude private threads',count(*)=1 and bool_and(id=(select public_root from social_ids)) and sum(reply_count)=1 from public.workshop_threads;
insert into social_results select 'anonymous cannot call removal RPC',pg_temp.social_denied('select public.remove_workshop_comment(public_root) from social_ids','42501');
reset role;
delete from auth.users where id=(select reader_id from social_ids);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select visitor_id::text from social_ids),true);
insert into social_results select 'visitor cannot moderate a former-author reply',pg_temp.social_denied('select public.remove_workshop_comment(id) from public.workshop_comments where content=''Public reader reply''','42501');
insert into public.workshop_comments(project_id,parent_id,content) select public_id,public_root,'Public visitor reply' from social_ids;
insert into social_results select 'public visitor can reply without membership',exists(select 1 from public.workshop_comments where content='Public visitor reply' and thread_id=(select public_root from social_ids));
reset role;
update public.projects set is_public=false where id=(select public_id from social_ids);
set local role authenticated;
insert into social_results select 'revoked public visibility hides threads and counts',not exists(select 1 from public.workshop_threads);
insert into social_results select 'revoked visibility prevents replies',pg_temp.social_denied('insert into public.workshop_comments(project_id,parent_id,content) select public_id,public_root,''Private now'' from social_ids','42501');
reset role;
select (case when passed then 'ok ' else 'not ok ' end)||row_number() over ()||' - '||test from social_results;
rollback;
