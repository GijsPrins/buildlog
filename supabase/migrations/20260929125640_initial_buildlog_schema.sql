begin;

create schema if not exists private;
revoke all on schema private from public;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 1 and 160),
  subtitle text,
  description text,
  current_phase_id uuid,
  hero_image_id uuid,
  is_public boolean not null default false,
  currency_code text not null default 'EUR'
    check (currency_code ~ '^[A-Z]{3}$'),
  items_enabled boolean not null default false,
  cost_tracking_enabled boolean not null default false,
  theme_config jsonb not null default
    '{
      "schemaVersion": 1,
      "preset": "minimal",
      "colors": {
        "background": "#f7f7f5",
        "surface": "#ffffff",
        "text": "#181817",
        "muted": "#6b6b66",
        "primary": "#2f6f62",
        "secondary": "#596b8c",
        "accent": "#cc6b49",
        "border": "#d9d9d4"
      },
      "typography": {
        "heading": "sans",
        "body": "sans",
        "technical": "mono"
      },
      "shape": { "radius": "small", "shadow": "subtle" },
      "decoration": { "texture": "none", "imageFrame": "none" }
    }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_cost_tracking_requires_items
    check (not cost_tracking_enabled or items_enabled),
  constraint projects_theme_config_is_object
    check (jsonb_typeof(theme_config) = 'object'),
  constraint projects_theme_schema_version
    check ((theme_config ->> 'schemaVersion')::integer = 1)
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'contributor', 'reader')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create unique index project_members_one_owner_idx
  on public.project_members (project_id)
  where role = 'owner';

create index project_members_user_project_idx
  on public.project_members (user_id, project_id);

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email_normalized text not null
    check (email_normalized = lower(trim(email_normalized)) and email_normalized like '%@%'),
  role text not null check (role in ('contributor', 'reader')),
  token_digest text not null unique check (char_length(token_digest) >= 32),
  invited_by_user_id uuid references auth.users (id) on delete set null,
  invited_user_id uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint project_invitations_terminal_state
    check (accepted_at is null or revoked_at is null)
);

create unique index project_invitations_one_unresolved_idx
  on public.project_invitations (project_id, email_normalized)
  where accepted_at is null and revoked_at is null;

create index project_invitations_project_created_idx
  on public.project_invitations (project_id, created_at desc);

create table public.project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  sort_order integer not null check (sort_order >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, sort_order)
);

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  phase_id uuid,
  slug text not null
    check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(trim(title)) between 1 and 200),
  work_date date not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  summary text not null default '',
  content text not null default '',
  finding_decisions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(finding_decisions) = 'array'),
  created_by_user_id uuid default auth.uid()
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, slug),
  constraint logs_phase_same_project
    foreign key (project_id, phase_id)
    references public.project_phases (project_id, id)
    deferrable initially deferred
);

create index logs_project_chronology_idx
  on public.logs (project_id, work_date desc, created_at desc, id);
create index logs_created_by_user_idx
  on public.logs (created_by_user_id)
  where created_by_user_id is not null;

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 200),
  brand text,
  purchase_amount numeric(14,2) check (purchase_amount is null or purchase_amount >= 0),
  purchase_currency_code text check (
    purchase_currency_code is null or purchase_currency_code ~ '^[A-Z]{3}$'
  ),
  estimated_amount numeric(14,2) check (estimated_amount is null or estimated_amount >= 0),
  estimated_currency_code text check (
    estimated_currency_code is null or estimated_currency_code ~ '^[A-Z]{3}$'
  ),
  supplier text,
  url text,
  notes text,
  created_by_user_id uuid default auth.uid()
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_purchase_money_complete check (
    (purchase_amount is null and purchase_currency_code is null)
    or (purchase_amount is not null and purchase_currency_code is not null)
  ),
  constraint items_estimated_money_complete check (
    (estimated_amount is null and estimated_currency_code is null)
    or (estimated_amount is not null and estimated_currency_code is not null)
  )
);

create index items_owner_updated_idx
  on public.items (owner_user_id, updated_at desc);

create table public.project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  role text not null check (
    role in ('subject', 'part', 'material', 'consumable', 'tool', 'external_service')
  ),
  status text check (
    status is null or status in ('planned', 'ordered', 'available', 'installed', 'used', 'removed')
  ),
  notes text,
  attributed_amount numeric(14,2)
    check (attributed_amount is null or attributed_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, item_id)
);

create unique index project_items_one_subject_idx
  on public.project_items (project_id)
  where role = 'subject' and status is distinct from 'removed';
create index project_items_project_role_status_idx
  on public.project_items (project_id, role, status);
create index project_items_item_idx
  on public.project_items (item_id);

create table public.log_item_usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  log_id uuid not null,
  project_item_id uuid not null,
  usage_amount numeric(14,2) check (usage_amount is null or usage_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (log_id, project_item_id),
  constraint log_item_usage_log_same_project
    foreign key (project_id, log_id)
    references public.logs (project_id, id)
    on delete cascade,
  constraint log_item_usage_project_item_same_project
    foreign key (project_id, project_item_id)
    references public.project_items (project_id, id)
    on delete cascade
);

create index log_item_usage_project_idx
  on public.log_item_usage (project_id);
create index log_item_usage_project_item_idx
  on public.log_item_usage (project_item_id);

create table public.project_specs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  section text not null check (char_length(trim(section)) between 1 and 120),
  label text not null check (char_length(trim(label)) between 1 and 160),
  value text not null,
  notes text,
  source text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_specs_project_section_order_idx
  on public.project_specs (project_id, section, sort_order, id);

create table public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  log_id uuid,
  storage_path text generated always as (
    project_id::text || '/' || id::text || '/original'
  ) stored,
  original_file_name text,
  media_type text check (media_type is null or media_type like 'image/%'),
  byte_size bigint check (byte_size is null or byte_size > 0),
  role text not null default 'gallery' check (
    role in ('before', 'after', 'gallery', 'damage', 'identification', 'detail', 'process')
  ),
  caption text,
  sort_order integer not null default 0 check (sort_order >= 0),
  upload_status text not null default 'reserved'
    check (upload_status in ('reserved', 'ready', 'failed')),
  uploaded_by_user_id uuid default auth.uid()
    references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (storage_path),
  constraint project_images_log_same_project
    foreign key (project_id, log_id)
    references public.logs (project_id, id)
    on delete set null (log_id)
);

create index project_images_project_display_idx
  on public.project_images (project_id, deleted_at, sort_order, created_at, id);
create index project_images_log_idx
  on public.project_images (log_id)
  where log_id is not null;

alter table public.projects
  add constraint projects_current_phase_same_project
  foreign key (id, current_phase_id)
  references public.project_phases (project_id, id)
  deferrable initially deferred;

alter table public.projects
  add constraint projects_hero_image_same_project
  foreign key (id, hero_image_id)
  references public.project_images (project_id, id)
  deferrable initially deferred;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();
create trigger projects_set_updated_at
before update on public.projects
for each row execute function private.set_updated_at();
create trigger project_members_set_updated_at
before update on public.project_members
for each row execute function private.set_updated_at();
create trigger project_phases_set_updated_at
before update on public.project_phases
for each row execute function private.set_updated_at();
create trigger logs_set_updated_at
before update on public.logs
for each row execute function private.set_updated_at();
create trigger items_set_updated_at
before update on public.items
for each row execute function private.set_updated_at();
create trigger project_items_set_updated_at
before update on public.project_items
for each row execute function private.set_updated_at();
create trigger log_item_usage_set_updated_at
before update on public.log_item_usage
for each row execute function private.set_updated_at();
create trigger project_specs_set_updated_at
before update on public.project_specs
for each row execute function private.set_updated_at();
create trigger project_images_set_updated_at
before update on public.project_images
for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Builder'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.assert_project_has_one_owner(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.projects where id = p_project_id)
     and (select count(*) from public.project_members
          where project_id = p_project_id and role = 'owner') <> 1 then
    raise exception 'Project % must have exactly one owner', p_project_id
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function private.assert_project_has_one_owner(uuid)
  from public, anon, authenticated;

create or replace function private.check_project_owner_from_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_project_has_one_owner(new.id);
  return new;
end;
$$;

create or replace function private.check_project_owner_from_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.assert_project_has_one_owner(old.project_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id) then
    perform private.assert_project_has_one_owner(new.project_id);
  elsif tg_op = 'INSERT' then
    perform private.assert_project_has_one_owner(new.project_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.check_project_owner_from_project()
  from public, anon, authenticated;
revoke all on function private.check_project_owner_from_membership()
  from public, anon, authenticated;

create constraint trigger projects_require_owner
after insert or update on public.projects
deferrable initially deferred
for each row execute function private.check_project_owner_from_project();

create constraint trigger project_members_require_owner
after insert or update or delete on public.project_members
deferrable initially deferred
for each row execute function private.check_project_owner_from_membership();

create or replace function private.project_role(p_project_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pm.role
  from public.project_members pm
  where pm.project_id = p_project_id
    and pm.user_id = (select auth.uid())
$$;

create or replace function private.can_read_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        p.is_public
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = (select auth.uid())
        )
      )
  )
$$;

create or replace function private.can_edit_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.project_role(p_project_id) in ('owner', 'contributor'), false)
$$;

create or replace function private.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.project_role(p_project_id) = 'owner', false)
$$;

create or replace function private.project_items_enabled(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.items_enabled from public.projects p where p.id = p_project_id), false)
$$;

create or replace function private.can_read_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = (select auth.uid())
    or exists (
      select 1
      from public.project_members target_membership
      join public.projects p on p.id = target_membership.project_id
      where target_membership.user_id = p_user_id
        and (
          p.is_public
          or exists (
            select 1
            from public.project_members caller_membership
            where caller_membership.project_id = p.id
              and caller_membership.user_id = (select auth.uid())
          )
        )
    )
    or exists (
      select 1
      from public.logs l
      join public.projects p on p.id = l.project_id
      where l.created_by_user_id = p_user_id
        and p.is_public
    )
$$;

create or replace function private.can_read_item(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.items i
    where i.id = p_item_id
      and (
        i.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.project_items pi
          join public.projects p on p.id = pi.project_id
          where pi.item_id = i.id
            and p.items_enabled
            and (
              p.is_public
              or exists (
                select 1
                from public.project_members pm
                where pm.project_id = p.id
                  and pm.user_id = (select auth.uid())
              )
            )
        )
      )
  )
$$;

create or replace function private.can_upload_project_image(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_images image
    join public.project_members pm on pm.project_id = image.project_id
    where image.storage_path = p_storage_path
      and image.upload_status = 'reserved'
      and image.deleted_at is null
      and image.uploaded_by_user_id = (select auth.uid())
      and pm.user_id = (select auth.uid())
      and pm.role in ('owner', 'contributor')
  )
$$;

create or replace function private.can_read_project_image_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_images image
    join public.projects p on p.id = image.project_id
    where image.storage_path = p_storage_path
      and image.upload_status = 'ready'
      and image.deleted_at is null
      and (
        p.is_public
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = (select auth.uid())
        )
      )
  )
$$;

revoke all on function private.project_role(uuid) from public;
revoke all on function private.can_read_project(uuid) from public;
revoke all on function private.can_edit_project(uuid) from public;
revoke all on function private.is_project_owner(uuid) from public;
revoke all on function private.project_items_enabled(uuid) from public;
revoke all on function private.can_read_profile(uuid) from public;
revoke all on function private.can_read_item(uuid) from public;
revoke all on function private.can_upload_project_image(text) from public;
revoke all on function private.can_read_project_image_object(text) from public;

grant usage on schema private to anon, authenticated;
grant execute on function private.can_read_project(uuid) to anon, authenticated;
grant execute on function private.can_read_profile(uuid) to anon, authenticated;
grant execute on function private.can_read_item(uuid) to anon, authenticated;
grant execute on function private.can_read_project_image_object(text) to anon, authenticated;
grant execute on function private.project_role(uuid) to authenticated;
grant execute on function private.can_edit_project(uuid) to authenticated;
grant execute on function private.is_project_owner(uuid) to authenticated;
grant execute on function private.project_items_enabled(uuid) to authenticated;
grant execute on function private.can_upload_project_image(text) to authenticated;

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

create or replace function public.create_project(
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
language sql
security invoker
set search_path = ''
as $$
  select private.create_project(
    p_slug, p_name, p_subtitle, p_description, p_is_public,
    p_currency_code, p_items_enabled, p_cost_tracking_enabled,
    p_theme_config, p_phases
  )
$$;

create or replace function private.transfer_project_ownership(
  p_project_id uuid,
  p_new_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_owner_user_id uuid;
begin
  if not private.is_project_owner(p_project_id) then
    raise exception 'Only the current owner can transfer ownership'
      using errcode = '42501';
  end if;

  perform 1 from public.projects where id = p_project_id for update;

  select user_id into v_current_owner_user_id
  from public.project_members
  where project_id = p_project_id and role = 'owner';

  if p_new_owner_user_id = v_current_owner_user_id then
    return;
  end if;

  if not exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = p_new_owner_user_id
  ) then
    raise exception 'The new owner must already be a Project member'
      using errcode = '23503';
  end if;

  perform 1
  from public.project_members
  where project_id = p_project_id
    and user_id in (v_current_owner_user_id, p_new_owner_user_id)
  order by user_id
  for update;

  update public.project_members
  set role = 'contributor'
  where project_id = p_project_id and user_id = v_current_owner_user_id;

  update public.project_members
  set role = 'owner'
  where project_id = p_project_id and user_id = p_new_owner_user_id;
end;
$$;

create or replace function public.transfer_project_ownership(
  p_project_id uuid,
  p_new_owner_user_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.transfer_project_ownership(p_project_id, p_new_owner_user_id)
$$;

revoke all on function private.create_project(text, text, text, text, boolean, text, boolean, boolean, jsonb, jsonb)
  from public;
revoke all on function private.transfer_project_ownership(uuid, uuid)
  from public;
revoke all on function public.create_project(text, text, text, text, boolean, text, boolean, boolean, jsonb, jsonb)
  from public, anon;
revoke all on function public.transfer_project_ownership(uuid, uuid)
  from public, anon;

grant execute on function private.create_project(text, text, text, text, boolean, text, boolean, boolean, jsonb, jsonb)
  to authenticated;
grant execute on function private.transfer_project_ownership(uuid, uuid)
  to authenticated;
grant execute on function public.create_project(text, text, text, text, boolean, text, boolean, boolean, jsonb, jsonb)
  to authenticated;
grant execute on function public.transfer_project_ownership(uuid, uuid)
  to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invitations enable row level security;
alter table public.project_phases enable row level security;
alter table public.logs enable row level security;
alter table public.items enable row level security;
alter table public.project_items enable row level security;
alter table public.log_item_usage enable row level security;
alter table public.project_specs enable row level security;
alter table public.project_images enable row level security;

create policy profiles_select_anon
on public.profiles for select to anon
using ((select private.can_read_profile(id)));
create policy profiles_select_authenticated
on public.profiles for select to authenticated
using ((select private.can_read_profile(id)));
create policy profiles_update_self
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy projects_select_anon
on public.projects for select to anon
using (is_public);
create policy projects_select_authenticated
on public.projects for select to authenticated
using ((select private.can_read_project(id)));
create policy projects_update_owner
on public.projects for update to authenticated
using ((select private.is_project_owner(id)))
with check ((select private.is_project_owner(id)));

create policy project_members_select_authenticated
on public.project_members for select to authenticated
using ((select private.can_read_project(project_id)));

create policy project_invitations_select_owner
on public.project_invitations for select to authenticated
using ((select private.is_project_owner(project_id)));

create policy project_phases_select_anon
on public.project_phases for select to anon
using ((select private.can_read_project(project_id)));
create policy project_phases_select_authenticated
on public.project_phases for select to authenticated
using ((select private.can_read_project(project_id)));
create policy project_phases_insert_owner
on public.project_phases for insert to authenticated
with check ((select private.is_project_owner(project_id)));
create policy project_phases_update_owner
on public.project_phases for update to authenticated
using ((select private.is_project_owner(project_id)))
with check ((select private.is_project_owner(project_id)));
create policy project_phases_delete_owner
on public.project_phases for delete to authenticated
using ((select private.is_project_owner(project_id)));

create policy logs_select_anon
on public.logs for select to anon
using ((select private.can_read_project(project_id)));
create policy logs_select_authenticated
on public.logs for select to authenticated
using ((select private.can_read_project(project_id)));
create policy logs_insert_editor
on public.logs for insert to authenticated
with check (
  (select private.can_edit_project(project_id))
  and created_by_user_id = (select auth.uid())
);
create policy logs_update_editor
on public.logs for update to authenticated
using ((select private.can_edit_project(project_id)))
with check ((select private.can_edit_project(project_id)));
create policy logs_delete_editor
on public.logs for delete to authenticated
using ((select private.can_edit_project(project_id)));

create policy items_select_anon
on public.items for select to anon
using ((select private.can_read_item(id)));
create policy items_select_authenticated
on public.items for select to authenticated
using ((select private.can_read_item(id)));
create policy items_insert_owner
on public.items for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and created_by_user_id = (select auth.uid())
);
create policy items_update_owner
on public.items for update to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));
create policy items_delete_owner
on public.items for delete to authenticated
using (owner_user_id = (select auth.uid()));

create policy project_items_select_anon
on public.project_items for select to anon
using (
  (select private.project_items_enabled(project_id))
  and (select private.can_read_project(project_id))
);
create policy project_items_select_authenticated
on public.project_items for select to authenticated
using (
  (select private.project_items_enabled(project_id))
  and (select private.can_read_project(project_id))
);
create policy project_items_insert_editor
on public.project_items for insert to authenticated
with check (
  (select private.project_items_enabled(project_id))
  and (select private.can_edit_project(project_id))
  and (select private.can_read_item(item_id))
);
create policy project_items_update_editor
on public.project_items for update to authenticated
using (
  (select private.project_items_enabled(project_id))
  and (select private.can_edit_project(project_id))
)
with check (
  (select private.project_items_enabled(project_id))
  and (select private.can_edit_project(project_id))
);
create policy project_items_delete_editor
on public.project_items for delete to authenticated
using (
  (select private.project_items_enabled(project_id))
  and (select private.can_edit_project(project_id))
);

create policy log_item_usage_select_anon
on public.log_item_usage for select to anon
using (
  (select private.project_items_enabled(project_id))
  and (select private.can_read_project(project_id))
);
create policy log_item_usage_select_authenticated
on public.log_item_usage for select to authenticated
using (
  (select private.project_items_enabled(project_id))
  and (select private.can_read_project(project_id))
);
create policy log_item_usage_insert_editor
on public.log_item_usage for insert to authenticated
with check (
  (select private.project_items_enabled(project_id))
  and (select private.can_edit_project(project_id))
);
create policy log_item_usage_update_editor
on public.log_item_usage for update to authenticated
using (
  (select private.project_items_enabled(project_id))
  and (select private.can_edit_project(project_id))
)
with check (
  (select private.project_items_enabled(project_id))
  and (select private.can_edit_project(project_id))
);
create policy log_item_usage_delete_editor
on public.log_item_usage for delete to authenticated
using (
  (select private.project_items_enabled(project_id))
  and (select private.can_edit_project(project_id))
);

create policy project_specs_select_anon
on public.project_specs for select to anon
using ((select private.can_read_project(project_id)));
create policy project_specs_select_authenticated
on public.project_specs for select to authenticated
using ((select private.can_read_project(project_id)));
create policy project_specs_insert_editor
on public.project_specs for insert to authenticated
with check ((select private.can_edit_project(project_id)));
create policy project_specs_update_editor
on public.project_specs for update to authenticated
using ((select private.can_edit_project(project_id)))
with check ((select private.can_edit_project(project_id)));
create policy project_specs_delete_editor
on public.project_specs for delete to authenticated
using ((select private.can_edit_project(project_id)));

create policy project_images_select_anon
on public.project_images for select to anon
using (
  deleted_at is null
  and upload_status = 'ready'
  and (select private.can_read_project(project_id))
);
create policy project_images_select_authenticated
on public.project_images for select to authenticated
using (
  (deleted_at is null or (select private.can_edit_project(project_id)))
  and (select private.can_read_project(project_id))
);
create policy project_images_insert_editor
on public.project_images for insert to authenticated
with check (
  (select private.can_edit_project(project_id))
  and uploaded_by_user_id = (select auth.uid())
);
create policy project_images_update_editor
on public.project_images for update to authenticated
using ((select private.can_edit_project(project_id)))
with check ((select private.can_edit_project(project_id)));

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

grant select on public.projects to anon, authenticated;
grant update (
  slug, name, subtitle, description, current_phase_id, hero_image_id,
  is_public, currency_code, items_enabled, cost_tracking_enabled, theme_config
) on public.projects to authenticated;

grant select on public.project_members to authenticated;
grant select (
  id, project_id, email_normalized, role, invited_by_user_id,
  invited_user_id, expires_at, accepted_at, revoked_at, created_at
) on public.project_invitations to authenticated;

grant select on public.project_phases to anon, authenticated;
grant insert, delete on public.project_phases to authenticated;
grant update (name, description, sort_order, archived_at)
  on public.project_phases to authenticated;

grant select on public.logs to anon, authenticated;
grant insert, delete on public.logs to authenticated;
grant update (
  phase_id, slug, title, work_date, duration_minutes,
  summary, content, finding_decisions
) on public.logs to authenticated;

grant select on public.items to anon, authenticated;
grant insert, delete on public.items to authenticated;
grant update (
  name, brand, purchase_amount, purchase_currency_code,
  estimated_amount, estimated_currency_code, supplier, url, notes
) on public.items to authenticated;

grant select on public.project_items to anon, authenticated;
grant insert, delete on public.project_items to authenticated;
grant update (role, status, notes, attributed_amount)
  on public.project_items to authenticated;

grant select on public.log_item_usage to anon, authenticated;
grant insert, delete on public.log_item_usage to authenticated;
grant update (usage_amount, note) on public.log_item_usage to authenticated;

grant select on public.project_specs to anon, authenticated;
grant insert, delete on public.project_specs to authenticated;
grant update (section, label, value, notes, source, sort_order)
  on public.project_specs to authenticated;

grant select on public.project_images to anon, authenticated;
grant insert on public.project_images to authenticated;
grant update (
  log_id, original_file_name, media_type, byte_size, role,
  caption, sort_order, upload_status, deleted_at
) on public.project_images to authenticated;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-originals',
  'project-originals',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy project_originals_select_anon
on storage.objects for select to anon
using (
  bucket_id = 'project-originals'
  and (select private.can_read_project_image_object(name))
);

create policy project_originals_select_authenticated
on storage.objects for select to authenticated
using (
  bucket_id = 'project-originals'
  and (select private.can_read_project_image_object(name))
);

create policy project_originals_insert_editor
on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-originals'
  and (select private.can_upload_project_image(name))
);

commit;
