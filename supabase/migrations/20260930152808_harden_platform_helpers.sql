begin;

-- The dashboard's automatic-RLS event trigger is not an application RPC.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
create policy account_deletion_jobs_no_client_access on private.account_deletion_jobs
as restrictive for all to public using (false) with check (false);

commit;
