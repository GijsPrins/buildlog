-- Display names are now readable on public projects, so never derive them from an email address.
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Builder'),120))
  on conflict (id) do nothing;
  return new;
end; $$;

-- Replace names that were derived from the email local-part, including snapshots on workshop notes.
with derived as (
  update public.profiles p set display_name='Builder'
  from auth.users u
  where u.id=p.id and nullif(trim(u.raw_user_meta_data->>'display_name'),'') is null
    and p.display_name=left(split_part(coalesce(u.email,''),'@',1),120)
  returning p.id
)
update public.workshop_comments c set author_display_name='Builder'
from derived d, auth.users u
where c.author_user_id=d.id and u.id=d.id and c.author_display_name=left(split_part(coalesce(u.email,''),'@',1),120);

-- Only a content change is an edit; detaching a deleted author must not mark notes as edited.
drop trigger workshop_comments_updated on public.workshop_comments;
create trigger workshop_comments_updated before update of content on public.workshop_comments
  for each row execute function private.set_updated_at();
