create or replace function private.valid_library_theme(config jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
 select coalesce(
 config @> '{"schemaVersion":1}'::jsonb
 and length(config->>'preset') between 1 and 120
 and jsonb_typeof(config->'colors') = 'object'
 and (select count(*) = 8 and bool_and(coalesce(config->'colors'->>k ~ '^#[0-9a-fA-F]{6}$',false))
      from unnest(array['background','surface','text','muted','primary','secondary','accent','border']) k)
 and config->'typography'->>'heading' in ('serif','sans')
 and config->'typography'->>'body' = 'sans'
 and config->'typography'->>'technical' = 'mono'
 and config->'shape'->>'radius' in ('none','small','medium')
 and config->'shape'->>'shadow' in ('none','subtle')
 and config->'decoration'->>'texture' in ('none','grid','paper')
 and config->'decoration'->>'imageFrame' in ('none','bordered','print'), false);
$$;
