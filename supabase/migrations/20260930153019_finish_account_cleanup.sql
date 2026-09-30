begin;
create or replace function private.prepare_account_deletion(p_user_id uuid, p_delete_projects boolean, p_transfers jsonb)
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
  -- Preserve contributed photos by transferring only Storage ownership metadata.
  -- Files for deleted projects are removed later through the Storage API.
  update storage.objects o set owner = m.user_id, owner_id = m.user_id::text
    from public.project_images i join public.project_members m on m.project_id = i.project_id and m.role = 'owner'
    where o.bucket_id = 'project-originals' and o.name = i.storage_path and (o.owner = p_user_id or o.owner_id = p_user_id::text);
  -- Items shared with remaining builds stay with one of those builds' owners.
  update public.items i set owner_user_id = (select m.user_id from public.project_items pi join public.project_members m on m.project_id = pi.project_id and m.role = 'owner' where pi.item_id = i.id order by pi.created_at, pi.id limit 1)
    where i.owner_user_id = p_user_id and exists(select 1 from public.project_items pi where pi.item_id = i.id);
  delete from public.items where owner_user_id = p_user_id;
  delete from public.project_members where user_id = p_user_id;
  update public.project_invitations set revoked_at = now() where email_normalized = (select lower(email) from auth.users where id = p_user_id) and accepted_at is null and revoked_at is null;
  insert into private.account_deletion_jobs(user_id, storage_paths) values(p_user_id, v_paths);
  return v_paths;
end; $$;

create function private.actor_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
select exists(select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null and deleted_at is null)
  and not exists(select 1 from private.account_deletion_jobs where user_id = auth.uid())
$$;
revoke all on function private.actor_is_active() from public, anon;
grant execute on function private.actor_is_active() to authenticated;
drop policy items_insert_owner on public.items;
create policy items_insert_owner on public.items for insert to authenticated
with check (owner_user_id = (select auth.uid()) and created_by_user_id = (select auth.uid()) and (select private.actor_is_active()));

create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''), nullif(split_part(coalesce(new.email,''),'@',1),''),'Builder'),120))
  on conflict (id) do nothing;
  return new;
end; $$;

commit;
