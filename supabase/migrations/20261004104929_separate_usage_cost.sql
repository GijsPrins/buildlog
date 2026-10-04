-- Existing usage_amount values were entered as quantities. Never reinterpret them as money.
alter table public.log_item_usage
  add column usage_cost numeric(14,2) check (usage_cost is null or usage_cost >= 0);
comment on column public.log_item_usage.usage_amount is 'Quantity used; not a monetary amount. Units may be described in note.';
comment on column public.log_item_usage.usage_cost is 'Cost attributed to this session in the project reporting currency; null means not recorded.';
grant update (usage_cost) on public.log_item_usage to authenticated;
