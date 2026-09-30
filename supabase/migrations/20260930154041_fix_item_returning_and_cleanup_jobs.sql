begin;
drop policy items_select_authenticated on public.items;
create policy items_select_authenticated on public.items for select to authenticated
using (owner_user_id = (select auth.uid()) or (select private.can_read_item(id)));
create function private.complete_account_deletion(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from auth.users where id=p_user_id) then raise exception 'Auth deletion has not completed'; end if;
  delete from private.account_deletion_jobs where user_id=p_user_id;
end; $$;
create function public.complete_account_deletion(p_user_id uuid)
returns void language sql security invoker set search_path = '' as $$ select private.complete_account_deletion(p_user_id) $$;
revoke all on function private.complete_account_deletion(uuid), public.complete_account_deletion(uuid) from public, anon, authenticated;
grant execute on function private.complete_account_deletion(uuid), public.complete_account_deletion(uuid) to service_role;
commit;
