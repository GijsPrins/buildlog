begin;
select '1..9';
create temp table purchase_test_ids as select gen_random_uuid() owner_id, gen_random_uuid() reader_id, gen_random_uuid() other_id,
  gen_random_uuid() project_a, gen_random_uuid() project_b, gen_random_uuid() unrelated_project,
  gen_random_uuid() tool_id, gen_random_uuid() unlinked_id, gen_random_uuid() planned_id, gen_random_uuid() free_id, gen_random_uuid() unrelated_item;
grant select on purchase_test_ids to authenticated;
create temp table purchase_test_results(test text, passed boolean);
grant insert,select on purchase_test_results to authenticated;
insert into auth.users(id,email,email_confirmed_at)
select owner_id,owner_id || '@example.test',now() from purchase_test_ids union all
select reader_id,reader_id || '@example.test',now() from purchase_test_ids union all
select other_id,other_id || '@example.test',now() from purchase_test_ids;
insert into public.projects(id,slug,name,is_public,items_enabled,cost_tracking_enabled)
select project_a,project_a::text,'Purchase fixture A',false,true,true from purchase_test_ids union all
select project_b,project_b::text,'Purchase fixture B',false,true,true from purchase_test_ids union all
select unrelated_project,unrelated_project::text,'Unrelated public fixture',true,true,true from purchase_test_ids;
insert into public.project_members(project_id,user_id,role)
select project_a,owner_id,'owner' from purchase_test_ids union all
select project_b,owner_id,'owner' from purchase_test_ids union all
select unrelated_project,other_id,'owner' from purchase_test_ids union all
select project_a,reader_id,'reader' from purchase_test_ids;
insert into public.items(id,owner_user_id,name,purchase_amount,purchase_currency_code,estimated_amount,estimated_currency_code,created_by_user_id)
select tool_id,owner_id,'Shared tool',20,'EUR',null::numeric,null::text,owner_id from purchase_test_ids union all
select unlinked_id,owner_id,'Unlinked purchase',5,'EUR',null,null,owner_id from purchase_test_ids union all
select planned_id,owner_id,'Planned item',null,null,10,'USD',owner_id from purchase_test_ids union all
select free_id,owner_id,'Free purchase',0,'EUR',50,'GBP',owner_id from purchase_test_ids union all
select unrelated_item,other_id,'Unrelated public item',99,'EUR',null,null,other_id from purchase_test_ids;
insert into public.project_items(project_id,item_id,role,status)
select project_a,tool_id,'tool','available' from purchase_test_ids union all
select project_b,tool_id,'tool','removed' from purchase_test_ids union all
select project_a,planned_id,'part','planned' from purchase_test_ids union all
select unrelated_project,unrelated_item,'part','available' from purchase_test_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from purchase_test_ids),true);
create temp table purchase_scope as
select i.* from public.items i where i.owner_user_id=(select auth.uid())
union
select i.* from public.items i join public.project_items pi on pi.item_id=i.id
join public.project_members pm on pm.project_id=pi.project_id where pm.user_id=(select auth.uid());
insert into purchase_test_results select 'shared purchase counted once with unlinked purchases',count(*)=4 and sum(purchase_amount) filter(where purchase_currency_code='EUR')=25 from purchase_scope;
insert into purchase_test_results select 'public items outside membership excluded',count(*)=0 from purchase_scope where id=(select unrelated_item from purchase_test_ids);
insert into purchase_test_results select 'estimates separate from actual purchases and grouped by currency',sum(estimated_amount) filter(where purchase_amount is null and estimated_currency_code='USD')=10 and count(*) filter(where purchase_amount is null and estimated_currency_code='GBP')=0 from purchase_scope;
update public.items set purchase_amount=7 where id=(select unlinked_id from purchase_test_ids);
insert into purchase_test_results select 'owner edits unlinked purchase without project membership link',purchase_amount=7 from public.items where id=(select unlinked_id from purchase_test_ids);
insert into public.items(owner_user_id,name,purchase_amount,purchase_currency_code,created_by_user_id)
select owner_id,'New independent purchase fixture',2,'EUR',owner_id from purchase_test_ids;
insert into purchase_test_results select 'authenticated user records an independent item',count(*)=1 from public.items i where i.owner_user_id=(select owner_id from purchase_test_ids) and i.name='New independent purchase fixture' and not exists(select 1 from public.project_items pi where pi.item_id=i.id);
select set_config('request.jwt.claim.sub',(select reader_id::text from purchase_test_ids),true);
insert into purchase_test_results select 'reader can see shared purchases',count(*)=1 from public.items where id=(select tool_id from purchase_test_ids);
insert into purchase_test_results select 'reader cannot see owners unlinked inventory',count(*)=0 from public.items where id=(select unlinked_id from purchase_test_ids);
with changed as (update public.items set purchase_amount=999 where id=(select tool_id from purchase_test_ids) returning id)
insert into purchase_test_results select 'reader cannot edit another persons shared purchase',count(*)=0 from changed;
reset role;
update public.project_members set role='contributor' where project_id=(select project_a from purchase_test_ids) and user_id=(select reader_id from purchase_test_ids);
set local role authenticated;
with changed as (update public.items set estimated_amount=999 where id=(select planned_id from purchase_test_ids) returning id)
insert into purchase_test_results select 'contributor cannot edit another persons estimate',count(*)=0 from changed;
reset role;
select (case when passed then 'ok ' else 'not ok ' end) || row_number() over () || ' - ' || test from purchase_test_results;
rollback;
