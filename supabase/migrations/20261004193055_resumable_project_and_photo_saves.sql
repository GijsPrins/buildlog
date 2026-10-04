-- One transaction for the log, usage, item statuses, photo edits and reservations.
-- Invoker functions retain the caller's table privileges and RLS.
create or replace function public.save_workshop_log(p_log jsonb, p_usage jsonb, p_image_edits jsonb, p_new_images jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := (p_log->>'id')::uuid;
  v_project uuid := (p_log->>'project_id')::uuid;
  v_row jsonb; v_image public.project_images; v_log public.logs;
  v_result jsonb := '[]'::jsonb; v_next_order integer;
begin
  if not private.actor_is_active() or not private.can_edit_project(v_project) then
    raise exception 'You cannot save this workshop session.' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,0));
  select * into v_log from public.logs where id=v_id for update;
  if found and v_log.project_id<>v_project then raise exception 'Session belongs to another project.' using errcode='23514'; end if;
  if not found and not coalesce((p_log->>'create')::boolean,false) then raise exception 'Session no longer exists.' using errcode='23514'; end if;
  insert into public.logs(id,project_id,phase_id,slug,title,work_date,duration_minutes,summary,content,finding_decisions,created_by_user_id)
  values(v_id,v_project,(p_log->>'phase_id')::uuid,p_log->>'slug',btrim(p_log->>'title'),(p_log->>'work_date')::date,
    (p_log->>'duration_minutes')::integer,coalesce(p_log->>'summary',''),coalesce(p_log->>'content',''),coalesce(p_log->'finding_decisions','[]'::jsonb),auth.uid())
  on conflict(id) do update set phase_id=excluded.phase_id,title=excluded.title,work_date=excluded.work_date,
    duration_minutes=excluded.duration_minutes,summary=excluded.summary,content=excluded.content,finding_decisions=excluded.finding_decisions
  returning * into v_log;

  -- SQL NULL means preserve usage when the ledger is disabled; [] intentionally clears it.
  if p_usage is not null then
    if not private.project_items_enabled(v_project) then raise exception 'The parts ledger is disabled.' using errcode='23514'; end if;
    if jsonb_typeof(p_usage)<>'array' then raise exception 'Invalid usage records.' using errcode='23514'; end if;
    delete from public.log_item_usage where log_id=v_id and project_id=v_project;
    for v_row in select value from jsonb_array_elements(p_usage) loop
      insert into public.log_item_usage(project_id,log_id,project_item_id,usage_amount,usage_cost,note)
      values(v_project,v_id,(v_row->>'project_item_id')::uuid,(v_row->>'usage_amount')::numeric,(v_row->>'usage_cost')::numeric,v_row->>'note');
      if nullif(v_row->>'status_after','') is not null then
        update public.project_items set status=v_row->>'status_after' where id=(v_row->>'project_item_id')::uuid and project_id=v_project;
        if not found then raise exception 'Item is no longer available.' using errcode='23514'; end if;
      end if;
    end loop;
  end if;

  for v_row in select value from jsonb_array_elements(p_image_edits) loop
    update public.project_images set role=v_row->>'role',caption=v_row->>'caption',
      deleted_at=case when coalesce((v_row->>'removed')::boolean,false) then coalesce(deleted_at,now()) else deleted_at end
    where id=(v_row->>'id')::uuid and project_id=v_project and log_id=v_id
      and (not coalesce((v_row->>'pending')::boolean,false) or uploaded_by_user_id=auth.uid());
    if not found and not coalesce((v_row->>'pending')::boolean,false) then raise exception 'Photo is no longer available.' using errcode='23514'; end if;
  end loop;
  -- Append after retained images; count is not a safe offset after deletion.
  select coalesce(max(sort_order),-1)+1 into v_next_order from public.project_images i
    where i.project_id=v_project and i.log_id=v_id and i.deleted_at is null
      and not exists(select 1 from jsonb_array_elements(p_new_images) p where (p->>'id')::uuid=i.id);
  for v_row in select value from jsonb_array_elements(p_new_images) loop
    insert into public.project_images(id,project_id,log_id,original_file_name,media_type,byte_size,role,caption,sort_order,uploaded_by_user_id)
    values((v_row->>'id')::uuid,v_project,v_id,v_row->>'name',v_row->>'type',(v_row->>'size')::bigint,
      v_row->>'role',v_row->>'caption',v_next_order,auth.uid()) on conflict(id) do nothing;
    select * into v_image from public.project_images where id=(v_row->>'id')::uuid;
    if not found or v_image.project_id<>v_project or v_image.log_id is distinct from v_id or v_image.deleted_at is not null
      or v_image.uploaded_by_user_id is distinct from auth.uid() or v_image.byte_size is distinct from (v_row->>'size')::bigint
      or v_image.original_file_name is distinct from v_row->>'name' then
      raise exception 'This photo reservation cannot be reused.' using errcode='23514';
    end if;
    update public.project_images set role=v_row->>'role',caption=v_row->>'caption',
      sort_order=v_next_order, upload_status=case when upload_status='failed' then 'reserved' else upload_status end where id=v_image.id;
    v_next_order := v_next_order+1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('id',v_image.id,'storage_path',v_image.storage_path,'upload_status',v_image.upload_status));
  end loop;
  return jsonb_build_object('log',to_jsonb(v_log),'images',v_result);
end; $$;
revoke all on function public.save_workshop_log(jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_workshop_log(jsonb,jsonb,jsonb,jsonb) to authenticated;


-- Creation requires a privileged bootstrap because projects/membership cannot
-- be inserted directly by clients. Retries require the same active owner.
create function private.create_project_record(p_project jsonb,p_phases jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_project->>'id')::uuid;
  v_user uuid := auth.uid(); v_phase jsonb;
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Permanent account required.' using errcode='42501';
  end if;
  perform 1 from auth.users where id=v_user for update;
  if not found or not private.actor_is_active() then raise exception 'Account unavailable.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,0));
  if exists(select 1 from public.projects where id=v_id) then
    if not private.is_project_owner(v_id) then raise exception 'Only the owner can resume project creation.' using errcode='42501'; end if;
  else
    insert into public.projects(id,slug,name,theme_config)
      values(v_id,p_project->>'slug',btrim(p_project->>'name'),p_project->'theme_config');
    insert into public.project_members(project_id,user_id,role) values(v_id,v_user,'owner');
    for v_phase in select value from jsonb_array_elements(p_phases) loop
      insert into public.project_phases(id,project_id,name,sort_order)
      values((v_phase->>'id')::uuid,v_id,btrim(v_phase->>'name'),(v_phase->>'sort_order')::integer);
    end loop;
  end if;
  perform public.save_project_record(p_project,p_phases);
  return v_id;
end; $$;
revoke all on function private.create_project_record(jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.create_project_record(jsonb,jsonb) to authenticated;
create function public.create_project_record(p_project jsonb,p_phases jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_project_record(p_project,p_phases);
$$;
revoke all on function public.create_project_record(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_project_record(jsonb,jsonb) to authenticated;
