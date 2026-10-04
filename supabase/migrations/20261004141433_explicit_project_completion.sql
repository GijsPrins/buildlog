alter table public.projects add column is_completed boolean not null default false;

-- Preserve the previous dashboard classification once; phase names have no
-- runtime meaning after this migration.
update public.projects p set is_completed = true
from public.project_phases phase
where phase.id = p.current_phase_id and phase.project_id = p.id
  and lower(phase.name) in ('done', 'complete', 'completed');

-- Existing project UPDATE RLS permits only the project owner.
grant update (is_completed) on public.projects to authenticated;
