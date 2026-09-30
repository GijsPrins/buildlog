begin;

-- The anonymous BOM policies also use this helper.
grant execute on function private.project_items_enabled(uuid) to anon;
grant usage on schema private to service_role;
insert into public.profiles(id, display_name)
select id, left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), split_part(email, '@', 1), 'Builder'), 120)
from auth.users on conflict (id) do nothing;

create function private.workshop_members(p_project_id uuid, p_action text default 'list', p_email text default null, p_role text default 'contributor', p_target_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_target uuid;
  v_message text := '';
begin
  if auth.uid() is null or not private.is_project_owner(p_project_id) then
    raise exception 'Only the project owner can manage members' using errcode = '42501';
  end if;
  perform 1 from public.projects where id = p_project_id for update;
  if p_action = 'add' then
    if p_role not in ('contributor', 'reader') or v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Enter a valid email and access role';
    end if;
    select id into v_target from auth.users where lower(email) = v_email and email_confirmed_at is not null and deleted_at is null;
    if exists(select 1 from public.project_members where project_id = p_project_id and user_id = v_target and role = 'owner') then
      raise exception 'The owner already has access';
    end if;
    update public.project_invitations set revoked_at = now()
    where project_id = p_project_id and email_normalized = v_email and accepted_at is null and revoked_at is null;
    if v_target is not null then
      insert into public.project_members(project_id, user_id, role) values (p_project_id, v_target, p_role)
      on conflict (project_id, user_id) do update set role = excluded.role;
      v_message := 'Registered account recognized. Access has been granted.';
    else
      insert into public.project_invitations(project_id, email_normalized, role, token_digest, invited_by_user_id, expires_at)
      values(p_project_id, v_email, p_role, gen_random_uuid()::text || gen_random_uuid()::text, auth.uid(), now() + interval '7 days');
      v_message := 'Invitation saved for seven days. Share the sign-up link; access is granted after this email is verified.';
    end if;
  elsif p_action = 'remove' then
    if exists(select 1 from public.project_members where project_id = p_project_id and user_id = p_target_id and role = 'owner') then
      raise exception 'Transfer ownership before removing the owner';
    end if;
    delete from public.project_members where project_id = p_project_id and user_id = p_target_id and role <> 'owner';
    update public.project_invitations i set revoked_at = now() where i.project_id = p_project_id and accepted_at is null and revoked_at is null
      and email_normalized = (select lower(email) from auth.users where id = p_target_id);
    v_message := 'Access removed.';
  elsif p_action = 'cancel' then
    update public.project_invitations set revoked_at = now() where id = p_target_id and project_id = p_project_id and accepted_at is null and revoked_at is null;
    v_message := 'Invitation cancelled.';
  elsif p_action <> 'list' then
    raise exception 'Unknown member action';
  end if;
  return jsonb_build_object('message', v_message,
    'members', coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'role', m.role, 'name', p.display_name, 'email', u.email) order by m.created_at)
      from public.project_members m join public.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id where m.project_id = p_project_id), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'email', email_normalized, 'role', role, 'expiresAt', expires_at) order by created_at)
      from public.project_invitations where project_id = p_project_id and accepted_at is null and revoked_at is null), '[]'::jsonb));
end; $$;

create function public.workshop_members(p_project_id uuid, p_action text default 'list', p_email text default null, p_role text default 'contributor', p_target_id uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
 select private.workshop_members(p_project_id, p_action, p_email, p_role, p_target_id)
$$;
revoke all on function private.workshop_members(uuid,text,text,text,uuid), public.workshop_members(uuid,text,text,text,uuid) from public, anon;
grant execute on function private.workshop_members(uuid,text,text,text,uuid), public.workshop_members(uuid,text,text,text,uuid) to authenticated;

create function private.accept_workshop_invitations()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_email text; v_count integer := 0; v_invitation record;
begin
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null and deleted_at is null;
  if v_email is null then return 0; end if;
  for v_invitation in select * from public.project_invitations where email_normalized = v_email and expires_at > now() and accepted_at is null and revoked_at is null order by project_id for update loop
    insert into public.project_members(project_id, user_id, role) values(v_invitation.project_id, auth.uid(), v_invitation.role)
    on conflict (project_id,user_id) do nothing;
    update public.project_invitations set accepted_at = now(), invited_user_id = auth.uid() where id = v_invitation.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
create function public.accept_workshop_invitations()
returns integer language sql security invoker set search_path = '' as $$ select private.accept_workshop_invitations() $$;
revoke all on function private.accept_workshop_invitations(), public.accept_workshop_invitations() from public, anon;
grant execute on function private.accept_workshop_invitations(), public.accept_workshop_invitations() to authenticated;

-- Server-only, resumable deletion preparation. Auth and Storage deletion use their supported APIs.
create table private.account_deletion_jobs(user_id uuid primary key, storage_paths jsonb not null, created_at timestamptz not null default now());
alter table private.account_deletion_jobs enable row level security;
revoke all on private.account_deletion_jobs from public, anon, authenticated;
create function private.prepare_account_deletion(p_user_id uuid, p_delete_projects boolean, p_transfers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_project record; v_new_owner uuid; v_paths jsonb; v_email text;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id = p_user_id) then raise exception 'Account not found'; end if;
  perform 1 from auth.users where id = p_user_id for update;
  select storage_paths into v_paths from private.account_deletion_jobs where user_id = p_user_id;
  if found then return v_paths; end if;
  perform 1 from public.projects p join public.project_members m on m.project_id = p.id where m.user_id = p_user_id and m.role = 'owner' order by p.id for update of p;
  if not p_delete_projects then
    for v_project in select p.id, p.name from public.projects p join public.project_members m on m.project_id = p.id where m.user_id = p_user_id and m.role = 'owner' loop
      v_email := lower(trim(p_transfers ->> v_project.id::text));
      select id into v_new_owner from auth.users where lower(email) = v_email and id <> p_user_id and email_confirmed_at is not null and deleted_at is null
        and not exists(select 1 from private.account_deletion_jobs j where j.user_id = auth.users.id);
      if v_new_owner is null then raise exception 'Enter the verified email of another registered account for %', v_project.name; end if;
      update public.project_members set role = 'contributor' where project_id = v_project.id and user_id = p_user_id;
      insert into public.project_members(project_id,user_id,role) values(v_project.id,v_new_owner,'owner') on conflict(project_id,user_id) do update set role = 'owner';
    end loop;
    v_paths := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(i.storage_path), '[]'::jsonb) into v_paths from public.project_images i join public.project_members m on m.project_id = i.project_id where m.user_id = p_user_id and m.role = 'owner';
    delete from public.projects where id in(select project_id from public.project_members where user_id = p_user_id and role = 'owner');
  end if;
  -- Items shared with remaining builds stay with one of those builds' owners.
  update public.items i set owner_user_id = (select m.user_id from public.project_items pi join public.project_members m on m.project_id = pi.project_id and m.role = 'owner' where pi.item_id = i.id order by pi.created_at, pi.id limit 1)
    where i.owner_user_id = p_user_id and exists(select 1 from public.project_items pi where pi.item_id = i.id);
  delete from public.items where owner_user_id = p_user_id;
  delete from public.project_members where user_id = p_user_id;
  update public.project_invitations set revoked_at = now() where email_normalized = (select lower(email) from auth.users where id = p_user_id) and accepted_at is null and revoked_at is null;
  insert into private.account_deletion_jobs(user_id, storage_paths) values(p_user_id, v_paths);
  return v_paths;
end; $$;
create function public.prepare_account_deletion(p_user_id uuid, p_delete_projects boolean, p_transfers jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select private.prepare_account_deletion(p_user_id,p_delete_projects,p_transfers) $$;
revoke all on function private.prepare_account_deletion(uuid,boolean,jsonb), public.prepare_account_deletion(uuid,boolean,jsonb) from public, anon, authenticated;
grant execute on function private.prepare_account_deletion(uuid,boolean,jsonb), public.prepare_account_deletion(uuid,boolean,jsonb) to service_role;

create or replace function private.create_project(
  p_slug text,
  p_name text,
  p_subtitle text,
  p_description text,
  p_is_public boolean,
  p_currency_code text,
  p_items_enabled boolean,
  p_cost_tracking_enabled boolean,
  p_theme_config jsonb,
  p_phases jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id uuid;
  v_phase jsonb;
  v_phase_id uuid;
  v_first_phase_id uuid;
  v_ordinality bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Permanent account required' using errcode = '42501';
  end if;
  perform 1 from auth.users where id = v_user_id for update;
  if not found or exists(select 1 from private.account_deletion_jobs where user_id = v_user_id) then
    raise exception 'Account is being deleted' using errcode = '42501';
  end if;
  if jsonb_typeof(p_phases) <> 'array' then
    raise exception 'Phases must be a JSON array' using errcode = '22023';
  end if;

  insert into public.projects (
    slug, name, subtitle, description, is_public, currency_code,
    items_enabled, cost_tracking_enabled, theme_config
  )
  values (
    lower(trim(p_slug)), trim(p_name), p_subtitle, p_description,
    coalesce(p_is_public, false), upper(p_currency_code),
    coalesce(p_items_enabled, false), coalesce(p_cost_tracking_enabled, false),
    p_theme_config
  )
  returning id into v_project_id;

  insert into public.project_members (project_id, user_id, role)
  values (v_project_id, v_user_id, 'owner');

  for v_phase, v_ordinality in
    select value, ordinality
    from jsonb_array_elements(p_phases) with ordinality
  loop
    if nullif(trim(v_phase ->> 'name'), '') is null then
      raise exception 'Every phase requires a name' using errcode = '22023';
    end if;

    v_phase_id := gen_random_uuid();
    insert into public.project_phases (
      id, project_id, name, description, sort_order
    )
    values (
      v_phase_id,
      v_project_id,
      trim(v_phase ->> 'name'),
      v_phase ->> 'description',
      coalesce((v_phase ->> 'sortOrder')::integer, (v_ordinality - 1)::integer)
    );

    if v_first_phase_id is null then
      v_first_phase_id := v_phase_id;
    end if;
  end loop;

  update public.projects
  set current_phase_id = v_first_phase_id
  where id = v_project_id;

  return v_project_id;
end;
$$;

commit;
