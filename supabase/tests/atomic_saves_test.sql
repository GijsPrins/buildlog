begin;
create temp table save_ids as select gen_random_uuid() owner_id,gen_random_uuid() contributor_id,gen_random_uuid() reader_id,gen_random_uuid() outsider_id,
 gen_random_uuid() project_id,gen_random_uuid() other_project_id,gen_random_uuid() phase_id,gen_random_uuid() new_phase_id,gen_random_uuid() log_id,gen_random_uuid() item_id,gen_random_uuid() link_id,gen_random_uuid() image_id;
create temp table save_results(test text,passed boolean);
grant select on save_ids to authenticated,anon;
grant insert,select on save_results to authenticated,anon;
create function pg_temp.check_result(test text, passed boolean) returns void language plpgsql as $$begin
 if passed is distinct from true then raise exception 'FAILED: %',test; end if;
 insert into save_results values(test,passed); end;$$;
create function pg_temp.reject(test text, query text, expected_code text) returns void language plpgsql as $$declare caught boolean:=false; begin
 begin execute query; exception when others then
 if sqlstate<>expected_code then raise exception 'Wrong rejection for %: % %',test,sqlstate,sqlerrm; end if;
 caught:=true; end;
 perform pg_temp.check_result(test,caught); end;$$;
insert into auth.users(id,email,email_confirmed_at)
select owner_id,owner_id||'@example.test',now() from save_ids union all select contributor_id,contributor_id||'@example.test',now() from save_ids
union all select reader_id,reader_id||'@example.test',now() from save_ids union all select outsider_id,outsider_id||'@example.test',now() from save_ids;
insert into public.projects(id,slug,name,items_enabled,cost_tracking_enabled)
select project_id,project_id::text,'Atomic save fixture',true,true from save_ids union all select other_project_id,other_project_id::text,'Slug collision fixture',true,true from save_ids;
insert into public.project_members(project_id,user_id,role)
select project_id,owner_id,'owner' from save_ids union all select project_id,contributor_id,'contributor' from save_ids union all select project_id,reader_id,'reader' from save_ids union all select other_project_id,outsider_id,'owner' from save_ids;
insert into public.project_phases(id,project_id,name,sort_order) select phase_id,project_id,'Start',0 from save_ids;
insert into public.items(id,owner_user_id,created_by_user_id,name) select item_id,owner_id,owner_id,'Fluid' from save_ids;
insert into public.project_items(id,project_id,item_id,role) select link_id,project_id,item_id,'consumable' from save_ids;
create temp table save_payload as select
 jsonb_build_object('id',log_id,'create',true,'project_id',project_id,'phase_id',phase_id,'slug','session','title','Original title','work_date',current_date,'duration_minutes',30,'summary','Keep','content','Original','finding_decisions','[]'::jsonb) log,
 jsonb_build_array(jsonb_build_object('project_item_id',link_id,'usage_amount',150,'usage_cost',2.50,'note','Original quantity','status_after','used')) usage,
 jsonb_build_array(jsonb_build_object('id',image_id,'name','original.jpg','type','image/jpeg','size',20,'role','before','caption','Original caption','sort_order',0)) photos,
 jsonb_build_array(jsonb_build_object('id',phase_id,'name','Start','archived',false,'sort_order',0),jsonb_build_object('id',new_phase_id,'name','Next','archived',false,'sort_order',1)) phases,
 (select to_jsonb(p) from public.projects p where p.id=project_id) project
 from save_ids;
grant select,update on save_payload to authenticated,anon;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select contributor_id::text from save_ids),true);
select public.save_workshop_log(log,usage,'[]',photos) from save_payload;
select public.save_workshop_log(log,usage,'[]',photos) from save_payload;
select pg_temp.check_result('retry keeps one log',(select count(*)=1 from public.logs where id=(select log_id from save_ids)));
select pg_temp.check_result('retry keeps one usage',(select count(*)=1 from public.log_item_usage where log_id=(select log_id from save_ids)));
select pg_temp.check_result('retry keeps one reservation',(select count(*)=1 from public.project_images where id=(select image_id from save_ids)));
select pg_temp.reject('invalid cost rolls back replacement',format('select public.save_workshop_log(%L::jsonb,%L::jsonb,''[]'',''[]'')',jsonb_set(log,'{title}','"Changed"'),jsonb_set(usage,'{0,usage_cost}','-1')),'23514') from save_payload;
select pg_temp.check_result('old log and usage survive failure',(select title='Original title' from public.logs where id=(select log_id from save_ids)) and (select usage_cost=2.50 and usage_amount=150 and note='Original quantity' from public.log_item_usage where log_id=(select log_id from save_ids)));
select pg_temp.reject('cross-project usage rejected',format('select public.save_workshop_log(%L::jsonb,%L::jsonb,''[]'',''[]'')',log,jsonb_set(usage,'{0,project_item_id}',to_jsonb((select new_phase_id from save_ids)))),'23503') from save_payload;
select pg_temp.reject('changed original cannot reuse ID',format('select public.save_workshop_log(%L::jsonb,%L::jsonb,''[]'',%L::jsonb)',log,usage,jsonb_set(photos,'{0,size}','99')),'23514') from save_payload;
select pg_temp.check_result('reservation still has original metadata',(select byte_size=20 and caption='Original caption' from public.project_images where id=(select image_id from save_ids)));
select pg_temp.reject('contributor cannot change project settings',format('select public.save_project_record(%L::jsonb,%L::jsonb)',project,phases),'42501') from save_payload;
select set_config('request.jwt.claim.sub',(select reader_id::text from save_ids),true);
select pg_temp.reject('reader cannot save a log',format('select public.save_workshop_log(%L::jsonb,%L::jsonb,''[]'',''[]'')',log,usage),'42501') from save_payload;
select set_config('request.jwt.claim.sub',(select outsider_id::text from save_ids),true);
select pg_temp.reject('outsider cannot save a log',format('select public.save_workshop_log(%L::jsonb,%L::jsonb,''[]'',''[]'')',log,usage),'42501') from save_payload;
select set_config('request.jwt.claim.sub',(select owner_id::text from save_ids),true);
select pg_temp.reject('currency change is rejected',format('update public.projects set currency_code=''USD'' where id=%L',(select project_id from save_ids)),'23514');
select pg_temp.reject('slug collision rolls back phases',format('select public.save_project_record(%L::jsonb,%L::jsonb)',jsonb_set(project,'{slug}',to_jsonb((select other_project_id::text from save_ids))),phases),'23505') from save_payload;
select pg_temp.check_result('failed project save leaves original phases',(select count(*)=1 and min(sort_order)=0 and min(name)='Start' from public.project_phases where project_id=(select project_id from save_ids)));
select public.save_project_record(project,phases) from save_payload;
select public.save_project_record(project,phases) from save_payload;
select pg_temp.check_result('project retry does not duplicate phases',(select count(*)=2 and sum(sort_order)=1 from public.project_phases where project_id=(select project_id from save_ids)));
select pg_temp.reject('incomplete phase snapshot rejected',format('select public.save_project_record(%L::jsonb,%L::jsonb)',project,jsonb_build_array(phases->0)),'23514') from save_payload;
update public.projects set items_enabled=false,cost_tracking_enabled=false where id=(select project_id from save_ids);
select public.save_workshop_log(log,null,'[]','[]') from save_payload;
select pg_temp.reject('hidden ledger cannot bypass currency protection',format('update public.projects set currency_code=''USD'' where id=%L',(select project_id from save_ids)),'23514');
update public.projects set items_enabled=true,cost_tracking_enabled=true where id=(select project_id from save_ids);
select pg_temp.check_result('disabled ledger edit preserves usage',(select count(*)=1 and min(usage_cost)=2.50 from public.log_item_usage where log_id=(select log_id from save_ids)));
select public.save_workshop_log(log,'[]','[]','[]') from save_payload;
select pg_temp.check_result('explicit empty selection clears usage',(select count(*)=0 from public.log_item_usage where log_id=(select log_id from save_ids)));
update public.projects set currency_code='USD' where id=(select project_id from save_ids);
select pg_temp.check_result('currency can change before monetary allocations',(select currency_code='USD' from public.projects where id=(select project_id from save_ids)));
update public.project_items set attributed_amount=0 where id=(select link_id from save_ids);
select pg_temp.reject('zero allocation also locks currency',format('update public.projects set currency_code=''EUR'' where id=%L',(select project_id from save_ids)),'23514');
reset role;
select jsonb_agg(to_jsonb(save_results)) as results from save_results;
rollback;
