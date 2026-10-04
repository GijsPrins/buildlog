-- A NULL log_id intentionally means discussion/approval of the project itself.
-- Composite log references prevent attaching a private log to a public project.
create table public.workshop_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  log_id uuid,
  author_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  author_display_name text not null default 'Workshop visitor',
  content text not null check (char_length(btrim(content)) between 1 and 2000 and content ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id, log_id) references public.logs(project_id, id) on delete cascade
);
create index workshop_comments_target_idx on public.workshop_comments(project_id, log_id, created_at desc, id desc);
create index workshop_comments_author_idx on public.workshop_comments(author_user_id);
create index workshop_comments_log_idx on public.workshop_comments(log_id) where log_id is not null;

create table public.workshop_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  log_id uuid,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key(project_id, log_id) references public.logs(project_id, id) on delete cascade
);
create unique index workshop_approvals_project_once_idx on public.workshop_approvals(project_id, user_id) where log_id is null;
create unique index workshop_approvals_log_once_idx on public.workshop_approvals(log_id, user_id) where log_id is not null;
create index workshop_approvals_target_idx on public.workshop_approvals(project_id, log_id);
create index workshop_approvals_user_idx on public.workshop_approvals(user_id);

-- Copy only the display name, without exposing a public profile/email directory.
-- Clients cannot write snapshots, identity, timestamps or target changes.
create function private.prepare_workshop_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(btrim(display_name), ''), 'Workshop visitor')
      into new.author_display_name from public.profiles where id = new.author_user_id;
    new.author_display_name := coalesce(new.author_display_name, 'Workshop visitor');
  elsif new.author_user_id is null and old.author_user_id is not null then
    new.author_display_name := 'Former builder';
  end if;
  new.content := btrim(new.content);
  return new;
end; $$;
revoke all on function private.prepare_workshop_comment() from public, anon, authenticated;
create trigger workshop_comments_prepare before insert or update on public.workshop_comments
  for each row execute function private.prepare_workshop_comment();
create trigger workshop_comments_updated before update on public.workshop_comments
  for each row execute function private.set_updated_at();

alter table public.workshop_comments enable row level security;
alter table public.workshop_approvals enable row level security;
revoke all on public.workshop_comments, public.workshop_approvals from anon, authenticated;
grant select on public.workshop_comments, public.workshop_approvals to anon, authenticated;
grant insert(project_id, log_id, author_user_id, content) on public.workshop_comments to authenticated;
grant update(content) on public.workshop_comments to authenticated;
grant delete on public.workshop_comments to authenticated;
grant insert(project_id, log_id, user_id) on public.workshop_approvals to authenticated;
grant delete on public.workshop_approvals to authenticated;
grant all on public.workshop_comments, public.workshop_approvals to service_role;

create policy workshop_comments_read on public.workshop_comments for select to anon, authenticated
  using ((select private.can_read_project(project_id)));
create policy workshop_comments_add on public.workshop_comments for insert to authenticated
  with check (author_user_id = (select auth.uid()) and (select private.actor_is_active()) and (select private.can_read_project(project_id)));
create policy workshop_comments_edit on public.workshop_comments for update to authenticated
  using (author_user_id = (select auth.uid()) and (select private.actor_is_active()) and (select private.can_read_project(project_id)))
  with check (author_user_id = (select auth.uid()) and (select private.actor_is_active()) and (select private.can_read_project(project_id)));
create policy workshop_comments_remove on public.workshop_comments for delete to authenticated
  using ((select private.actor_is_active()) and (select private.can_read_project(project_id))
    and (author_user_id = (select auth.uid()) or (select private.is_project_owner(project_id))));
create policy workshop_approvals_read on public.workshop_approvals for select to anon, authenticated
  using ((select private.can_read_project(project_id)));
create policy workshop_approvals_add on public.workshop_approvals for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.actor_is_active()) and (select private.can_read_project(project_id)));
create policy workshop_approvals_remove on public.workshop_approvals for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.actor_is_active()) and (select private.can_read_project(project_id)));
