begin;
select plan(19);

insert into auth.users (id, email, email_confirmed_at)
values
  ('10000000-0000-0000-0000-000000000001', 'owner@example.test', now()),
  ('10000000-0000-0000-0000-000000000002', 'contributor@example.test', now()),
  ('10000000-0000-0000-0000-000000000003', 'reader@example.test', now()),
  ('10000000-0000-0000-0000-000000000004', 'outsider@example.test', now());

insert into public.projects (
  id, slug, name, is_public, items_enabled, cost_tracking_enabled
)
values
  ('20000000-0000-0000-0000-000000000001', 'public-build', 'Public build', true, true, true),
  ('20000000-0000-0000-0000-000000000002', 'private-build', 'Private build', false, false, false),
  ('20000000-0000-0000-0000-000000000003', 'other-build', 'Other build', false, true, false);

insert into public.project_members (project_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'contributor'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'reader'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'contributor'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'reader'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'owner');

insert into public.project_phases (id, project_id, name, sort_order)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Build', 0),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Private work', 0);

insert into public.logs (
  id, project_id, phase_id, slug, title, work_date, created_by_user_id
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'public-log', 'Public log', current_date,
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    'private-log', 'Private log', current_date,
    '10000000-0000-0000-0000-000000000001'
  );

insert into public.project_images (
  id, project_id, role, upload_status, uploaded_by_user_id
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'gallery', 'ready',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'gallery', 'reserved',
    '10000000-0000-0000-0000-000000000002'
  );

set constraints all immediate;
set constraints all deferred;

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'profiles', 'projects', 'project_members', 'project_invitations',
        'project_phases', 'logs', 'items', 'project_items',
        'log_item_usage', 'project_specs', 'project_images'
      )
      and c.relrowsecurity
  ),
  11,
  'RLS is enabled on every public application table'
);

set local role anon;

select is(
  (select count(*)::integer from public.projects),
  1,
  'anonymous visitors see only public Projects'
);
select is(
  (select count(*)::integer from public.logs),
  1,
  'anonymous visitors see Logs only for public Projects'
);
select is(
  (select count(*)::integer from public.project_images),
  1,
  'anonymous visitors see only ready, non-deleted public images'
);
select throws_ok(
  $$insert into public.logs (project_id, slug, title, work_date)
    values ('20000000-0000-0000-0000-000000000001', 'anon-write', 'No', current_date)$$,
  '42501',
  null,
  'anonymous visitors have no Log insert grant'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

select is(
  (select count(*)::integer from public.projects),
  2,
  'an authenticated outsider sees public Projects plus their own private Project'
);
select is(
  (select count(*)::integer from public.logs),
  1,
  'an authenticated outsider cannot see another private Project Log'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*)::integer from public.projects),
  2,
  'a Reader sees their private Project and public Projects'
);
select throws_ok(
  $$insert into public.logs (
      project_id, slug, title, work_date, created_by_user_id
    ) values (
      '20000000-0000-0000-0000-000000000002',
      'reader-write', 'No', current_date,
      '10000000-0000-0000-0000-000000000003'
    )$$,
  '42501',
  null,
  'a Reader cannot insert a Log'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $$insert into public.logs (
      project_id, phase_id, slug, title, work_date, created_by_user_id
    ) values (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      'contributor-log', 'Contributor log', current_date,
      '10000000-0000-0000-0000-000000000002'
    )$$,
  'a Contributor can insert a Log in their Project'
);
select is_empty(
  $$update public.projects
    set name = 'Contributor changed this'
    where id = '20000000-0000-0000-0000-000000000001'
    returning id$$,
  'a Contributor cannot update Project administration'
);
select throws_ok(
  $$insert into public.project_items (project_id, item_id, role)
    values (
      '20000000-0000-0000-0000-000000000002',
      '60000000-0000-0000-0000-000000000001',
      'tool'
    )$$,
  '42501',
  null,
  'an unreadable Item cannot be linked into a Project'
);

reset role;
insert into public.items (
  id, owner_user_id, name, created_by_user_id
)
values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'Shared tool',
  '10000000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$insert into public.project_items (project_id, item_id, role)
    values (
      '20000000-0000-0000-0000-000000000002',
      '60000000-0000-0000-0000-000000000001',
      'tool'
    )$$,
  '42501',
  null,
  'a Contributor cannot add Items while the Project capability is disabled'
);
select lives_ok(
  $$insert into public.project_items (project_id, item_id, role)
    values (
      '20000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000001',
      'tool'
    )$$,
  'a Contributor can add a readable Item when Items are enabled'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select isnt_empty(
  $$update public.projects
    set name = 'Owner changed this'
    where id = '20000000-0000-0000-0000-000000000001'
    returning id$$,
  'the Owner can update Project administration'
);
set constraints logs_phase_same_project immediate;
select throws_ok(
  $$insert into public.logs (
      project_id, phase_id, slug, title, work_date, created_by_user_id
    ) values (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      'wrong-phase', 'Wrong phase', current_date,
      '10000000-0000-0000-0000-000000000001'
    )$$,
  '23503',
  null,
  'a Log cannot reference a phase from another Project'
);
set constraints logs_phase_same_project deferred;
select throws_ok(
  $$insert into public.project_members (project_id, user_id, role)
    values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000004',
      'reader'
    )$$,
  '42501',
  null,
  'the Owner cannot bypass controlled membership operations through the table'
);
select throws_ok(
  $$update public.logs
    set created_by_user_id = '10000000-0000-0000-0000-000000000004'
    where id = '40000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Log authorship is immutable through column grants'
);

reset role;

select throws_ok(
  $$insert into public.project_members (project_id, user_id, role)
    values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000004',
      'owner'
    )$$,
  '23505',
  null,
  'a partial unique index prevents two Owners'
);

select * from finish();
rollback;
