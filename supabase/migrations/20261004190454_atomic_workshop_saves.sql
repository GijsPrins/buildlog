-- Keep monetary history in its original reporting currency, including hidden ledgers.
create function private.protect_project_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.currency_code is distinct from old.currency_code and (
    exists(select 1 from public.project_items where project_id=old.id and attributed_amount is not null)
    or exists(select 1 from public.log_item_usage where project_id=old.id and usage_cost is not null)
  ) then
    raise exception 'The project currency cannot change after allocations or usage costs have been recorded.' using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function private.protect_project_currency() from public,anon,authenticated;
create trigger projects_protect_currency before update of currency_code on public.projects
for each row execute function private.protect_project_currency();

-- One transaction for the log, usage, item statuses, photo edits and reservations.
-- Invoker functions retain the caller's table privileges and RLS.
create function public.save_workshop_log(p_log jsonb, p_usage jsonb, p_image_edits jsonb, p_new_images jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := (p_log->>'id')::uuid;
  v_project uuid := (p_log->>'project_id')::uuid;
  v_row jsonb; v_image public.project_images; v_log public.logs;
  v_result jsonb := '[]'::jsonb;
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
    where id=(v_row->>'id')::uuid and project_id=v_project and log_id=v_id;
    if not found then raise exception 'Photo is no longer available.' using errcode='23514'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_new_images) loop
    insert into public.project_images(id,project_id,log_id,original_file_name,media_type,byte_size,role,caption,sort_order,uploaded_by_user_id)
    values((v_row->>'id')::uuid,v_project,v_id,v_row->>'name',v_row->>'type',(v_row->>'size')::bigint,
      v_row->>'role',v_row->>'caption',(v_row->>'sort_order')::integer,auth.uid()) on conflict(id) do nothing;
    select * into v_image from public.project_images where id=(v_row->>'id')::uuid;
    if not found or v_image.project_id<>v_project or v_image.log_id is distinct from v_id or v_image.deleted_at is not null
      or v_image.uploaded_by_user_id is distinct from auth.uid() or v_image.byte_size is distinct from (v_row->>'size')::bigint
      or v_image.original_file_name is distinct from v_row->>'name' then
      raise exception 'This photo reservation cannot be reused.' using errcode='23514';
    end if;
    update public.project_images set role=v_row->>'role',caption=v_row->>'caption',
      upload_status=case when upload_status='failed' then 'reserved' else upload_status end where id=v_image.id;
    v_result := v_result || jsonb_build_array(jsonb_build_object('id',v_image.id,'storage_path',v_image.storage_path,'upload_status',v_image.upload_status));
  end loop;
  return jsonb_build_object('log',to_jsonb(v_log),'images',v_result);
end; $$;
revoke all on function public.save_workshop_log(jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_workshop_log(jsonb,jsonb,jsonb,jsonb) to authenticated;

create function public.save_project_record(p_project jsonb,p_phases jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := (p_project->>'id')::uuid;
  v_row jsonb; v_offset integer; v_phase_id uuid;
begin
  if not private.actor_is_active() or not private.is_project_owner(v_id) then
    raise exception 'Only the owner can save project settings.' using errcode='42501';
  end if;
  perform 1 from public.projects where id=v_id for update;
  -- Recheck after obtaining the lock, including concurrent ownership transfers.
  if not found or not private.is_project_owner(v_id) then raise exception 'Owner access required.' using errcode='42501'; end if;
  if jsonb_typeof(p_phases)<>'array' or not exists(select 1 from jsonb_array_elements(p_phases) p where not coalesce((p->>'archived')::boolean,false)) then
    raise exception 'Keep at least one active phase.' using errcode='23514';
  end if;
  if (select count(distinct p->>'id') from jsonb_array_elements(p_phases) p)<>jsonb_array_length(p_phases)
    or (select count(distinct p->>'sort_order') from jsonb_array_elements(p_phases) p)<>jsonb_array_length(p_phases) then
    raise exception 'Each phase needs its own ID and order.' using errcode='23514';
  end if;
  if exists(select 1 from public.project_phases phase where phase.project_id=v_id
    and not exists(select 1 from jsonb_array_elements(p_phases) p where (p->>'id')::uuid=phase.id)) then
    raise exception 'Project phases changed. Reload the project before saving.' using errcode='23514';
  end if;
  select coalesce(max(sort_order),0)+jsonb_array_length(p_phases)+1 into v_offset from public.project_phases where project_id=v_id;
  update public.project_phases set sort_order=sort_order+v_offset where project_id=v_id;
  for v_row in select value from jsonb_array_elements(p_phases) loop
    v_phase_id := (v_row->>'id')::uuid;
    if exists(select 1 from public.project_phases where id=v_phase_id and project_id<>v_id) then raise exception 'Phase belongs to another project.' using errcode='23514'; end if;
    insert into public.project_phases(id,project_id,name,sort_order,archived_at)
    values(v_phase_id,v_id,btrim(v_row->>'name'),(v_row->>'sort_order')::integer,case when (v_row->>'archived')::boolean then now() else null end)
    on conflict(id) do update set name=excluded.name,sort_order=excluded.sort_order,archived_at=excluded.archived_at;
  end loop;
  if (p_project->>'current_phase_id')::uuid is not null and not exists(select 1 from public.project_phases
    where id=(p_project->>'current_phase_id')::uuid and project_id=v_id and archived_at is null) then
    raise exception 'Choose an active current phase.' using errcode='23514';
  end if;
  update public.projects set slug=p_project->>'slug',name=btrim(p_project->>'name'),subtitle=p_project->>'subtitle',description=p_project->>'description',
    started_story=p_project->>'started_story',motivation_story=p_project->>'motivation_story',object_story=p_project->>'object_story',
    current_phase_id=(p_project->>'current_phase_id')::uuid,hero_image_id=(p_project->>'hero_image_id')::uuid,
    is_completed=(p_project->>'is_completed')::boolean,is_public=(p_project->>'is_public')::boolean,currency_code=upper(p_project->>'currency_code'),
    items_enabled=(p_project->>'items_enabled')::boolean,cost_tracking_enabled=(p_project->>'cost_tracking_enabled')::boolean,theme_config=p_project->'theme_config'
  where id=v_id;
  if not found then raise exception 'Project could not be saved.' using errcode='42501'; end if;
end; $$;
revoke all on function public.save_project_record(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_project_record(jsonb,jsonb) to authenticated;
