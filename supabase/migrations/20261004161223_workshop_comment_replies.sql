alter table public.workshop_comments
  add column parent_id uuid references public.workshop_comments(id) on delete cascade,
  add column thread_id uuid references public.workshop_comments(id) on delete cascade,
  add column deleted_at timestamptz;
-- Preserve existing edit dates when upgrading all existing notes to roots.
alter table public.workshop_comments disable trigger workshop_comments_updated;
update public.workshop_comments set thread_id=id;
alter table public.workshop_comments enable trigger workshop_comments_updated;
alter table public.workshop_comments alter column thread_id set not null;
alter table public.workshop_comments drop constraint workshop_comments_content_check;
alter table public.workshop_comments add constraint workshop_comments_content_check
  check ((deleted_at is null and char_length(btrim(content)) between 1 and 2000 and content ~ '[^[:space:]]')
    or (deleted_at is not null and content=''));
alter table public.workshop_comments add constraint workshop_comments_thread_shape
  check ((parent_id is null and thread_id=id) or (parent_id is not null and parent_id<>id and thread_id<>id));
create index workshop_comments_parent_idx on public.workshop_comments(parent_id);
create index workshop_comments_thread_idx on public.workshop_comments(thread_id,created_at desc,id desc);

create or replace function private.prepare_workshop_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_parent public.workshop_comments;
begin
  if tg_op='INSERT' then
    if new.parent_id is null then new.thread_id := new.id;
    else
      select * into v_parent from public.workshop_comments where id=new.parent_id;
      if not found or v_parent.deleted_at is not null or v_parent.project_id<>new.project_id
        or v_parent.log_id is distinct from new.log_id then
        raise exception 'Reply to an available note in the same workshop conversation.' using errcode='23514';
      end if;
      new.thread_id := v_parent.thread_id;
    end if;
    select coalesce(nullif(btrim(display_name),''),'Workshop visitor') into new.author_display_name
      from public.profiles where id=new.author_user_id;
    new.author_display_name := coalesce(new.author_display_name,'Workshop visitor');
  else
    if new.parent_id is distinct from old.parent_id or new.thread_id is distinct from old.thread_id then
      raise exception 'A workshop note cannot be moved to another thread.' using errcode='23514';
    end if;
    if old.deleted_at is not null and (new.content<>old.content or new.deleted_at is distinct from old.deleted_at) then
      raise exception 'Removed workshop notes cannot be edited.' using errcode='23514';
    end if;
    if new.author_user_id is null and old.author_user_id is not null then new.author_display_name := 'Former builder'; end if;
  end if;
  new.content := btrim(new.content);
  return new;
end; $$;

grant insert(parent_id) on public.workshop_comments to authenticated;
-- Retain reply context rather than letting an author delete other people's replies.
revoke delete on public.workshop_comments from authenticated;
drop policy workshop_comments_remove on public.workshop_comments;
drop policy workshop_comments_edit on public.workshop_comments;
create policy workshop_comments_edit on public.workshop_comments for update to authenticated
  using (deleted_at is null and author_user_id=(select auth.uid()) and (select private.actor_is_active()) and (select private.can_read_project(project_id)))
  with check (deleted_at is null and author_user_id=(select auth.uid()) and (select private.actor_is_active()) and (select private.can_read_project(project_id)));

create function private.remove_workshop_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_note public.workshop_comments;
begin
  if not private.actor_is_active() then raise exception 'Sign in to remove a workshop note.' using errcode='42501'; end if;
  select * into v_note from public.workshop_comments where id=p_comment_id for update;
  if not found or not private.can_read_project(v_note.project_id)
    or not (coalesce(v_note.author_user_id=auth.uid(),false) or private.is_project_owner(v_note.project_id)) then
    raise exception 'You cannot remove this workshop note.' using errcode='42501';
  end if;
  if v_note.deleted_at is null then
    update public.workshop_comments set content='',deleted_at=now() where id=p_comment_id;
  end if;
end; $$;
revoke all on function private.remove_workshop_comment(uuid) from public,anon,authenticated;
grant execute on function private.remove_workshop_comment(uuid) to authenticated;
create function public.remove_workshop_comment(p_comment_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.remove_workshop_comment(p_comment_id);
$$;
revoke all on function public.remove_workshop_comment(uuid) from public,anon,authenticated;
grant execute on function public.remove_workshop_comment(uuid) to authenticated;

-- RLS continues to protect both roots and replies, including the aggregate.
create view public.workshop_threads with (security_invoker=true) as
select c.*, (select count(*) from public.workshop_comments r where r.thread_id=c.id and r.parent_id is not null and r.deleted_at is null) as reply_count
from public.workshop_comments c
where c.parent_id is null and (c.deleted_at is null or exists(
  select 1 from public.workshop_comments r where r.thread_id=c.id and r.parent_id is not null and r.deleted_at is null
));
revoke all on public.workshop_threads from anon,authenticated;
grant select on public.workshop_threads to anon,authenticated;
