begin;

alter table public.projects
  add column started_story text,
  add column motivation_story text,
  add column object_story text;

comment on column public.projects.started_story is 'How this build began and the object entered the builder''s life.';
comment on column public.projects.motivation_story is 'Why the builder chose to take on this project.';
comment on column public.projects.object_story is 'Known history and character of the object before the build.';

grant update (started_story, motivation_story, object_story)
  on public.projects to authenticated;

commit;
