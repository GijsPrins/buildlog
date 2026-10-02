create function private.valid_library_theme(config jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
 select coalesce(
 config @> '{"schemaVersion":1}'::jsonb
 and length(config->>'preset') between 1 and 120
 and jsonb_typeof(config->'colors') = 'object'
 and (select count(*) = 8 and bool_and(config->'colors'->>k ~ '^#[0-9a-fA-F]{6}$')
      from unnest(array['background','surface','text','muted','primary','secondary','accent','border']) k)
 and config->'typography'->>'heading' in ('serif','sans')
 and config->'typography'->>'body' = 'sans'
 and config->'typography'->>'technical' = 'mono'
 and config->'shape'->>'radius' in ('none','small','medium')
 and config->'shape'->>'shadow' in ('none','subtle')
 and config->'decoration'->>'texture' in ('none','grid','paper')
 and config->'decoration'->>'imageFrame' in ('none','bordered','print'), false);
$$;
revoke all on function private.valid_library_theme(jsonb) from public, anon;
grant execute on function private.valid_library_theme(jsonb) to authenticated, service_role;
create table public.user_themes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 80),
 config jsonb not null check (private.valid_library_theme(config)),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index user_themes_user_name_idx on public.user_themes(user_id,name);
alter table public.user_themes enable row level security;
revoke all on public.user_themes from anon, authenticated;
grant select,insert,update,delete on public.user_themes to authenticated;
grant all on public.user_themes to service_role;
create policy user_themes_read on public.user_themes for select to authenticated using (user_id = (select auth.uid()));
create policy user_themes_create on public.user_themes for insert to authenticated with check (user_id = (select auth.uid()) and (select private.actor_is_active()));
create policy user_themes_edit on public.user_themes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select private.actor_is_active()));
create policy user_themes_remove on public.user_themes for delete to authenticated using (user_id = (select auth.uid()));
create trigger user_themes_set_updated_at before update on public.user_themes for each row execute function private.set_updated_at();
