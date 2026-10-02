begin;
select plan(11);
insert into auth.users(id,email,email_confirmed_at) values
('91000000-0000-0000-0000-000000000001','theme-owner@qa.test',now()),
('91000000-0000-0000-0000-000000000002','theme-other@qa.test',now());
create temp table theme_test_result (test text, passed boolean);
grant all on theme_test_result to authenticated,anon;
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
-- Build a complete independent fixture, not depending on existing user projects.
insert into public.user_themes(id,user_id,name,config) values
('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','QA palette',
'{"schemaVersion":1,"preset":"qa","colors":{"background":"#ffffff","surface":"#ffffff","text":"#000000","muted":"#555555","primary":"#123f36","secondary":"#596b8c","accent":"#e27143","border":"#d8d6ce"},"typography":{"heading":"serif","body":"sans","technical":"mono"},"shape":{"radius":"small","shadow":"subtle"},"decoration":{"texture":"paper","imageFrame":"print"}}');
insert into theme_test_result select 'owner creates and reads', count(*)=1 from public.user_themes where id='92000000-0000-0000-0000-000000000001';
update public.user_themes set name='Edited palette' where id='92000000-0000-0000-0000-000000000001';
insert into theme_test_result select 'owner edits',name='Edited palette' from public.user_themes where id='92000000-0000-0000-0000-000000000001';
do $$ begin
 begin update public.user_themes set user_id='91000000-0000-0000-0000-000000000002' where id='92000000-0000-0000-0000-000000000001';
 raise exception 'ownership reassignment allowed'; exception when insufficient_privilege then insert into theme_test_result values('cannot reassign ownership',true); end;
 begin update public.user_themes set config=config #- '{colors,primary}' where id='92000000-0000-0000-0000-000000000001';
 raise exception 'missing colour allowed'; exception when check_violation then insert into theme_test_result values('missing colour rejected',true); end;
 begin update public.user_themes set config=jsonb_set(config,'{colors,primary}','"url(unsafe)"') where id='92000000-0000-0000-0000-000000000001';
 raise exception 'unsafe colour allowed'; exception when check_violation then insert into theme_test_result values('unsafe colour rejected',true); end;
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',true);
insert into theme_test_result select 'other account cannot read',count(*)=0 from public.user_themes where id='92000000-0000-0000-0000-000000000001';
with changed as (update public.user_themes set name='Hacked' where id='92000000-0000-0000-0000-000000000001' returning id) insert into theme_test_result select 'other account cannot edit',count(*)=0 from changed;
with removed as (delete from public.user_themes where id='92000000-0000-0000-0000-000000000001' returning id) insert into theme_test_result select 'other account cannot delete',count(*)=0 from removed;
do $$ begin
 begin insert into public.user_themes(user_id,name,config) values('91000000-0000-0000-0000-000000000001','Spoof','{}');
 raise exception 'spoofed insert allowed'; exception when insufficient_privilege then insert into theme_test_result values('other account cannot create for owner',true); end;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.user_themes; raise exception 'anonymous read allowed';
 exception when insufficient_privilege then insert into theme_test_result values('anonymous denied',true); end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
with removed as (delete from public.user_themes where id='92000000-0000-0000-0000-000000000001' returning id) insert into theme_test_result select 'owner deletes',count(*)=1 from removed;
reset role;
select ok(passed,test) from theme_test_result;
select * from finish();
rollback;
