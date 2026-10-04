-- A visible log may retain authorship after its author leaves the project.
-- This supplements existing profile visibility without exposing a user directory.
create policy profiles_select_visible_log_author
on public.profiles for select to anon, authenticated
using (exists (
  select 1 from public.logs l
  where l.created_by_user_id = profiles.id
    and (select private.can_read_project(l.project_id))
));
