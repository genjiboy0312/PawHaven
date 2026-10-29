-- SQL Editor query name: Repair Lobby Surface Purchases
-- Preserve wallets, purchases, receipts and current RPC functions.
begin;
do $$declare entry record;begin
 for entry in select conname from pg_constraint
  where conrelid='public.economy_home_items'::regclass and contype='c'
   and (pg_get_constraintdef(oid) like '%category%' or pg_get_constraintdef(oid) like '%item_index%') loop
  execute format('alter table public.economy_home_items drop constraint %I',entry.conname);
 end loop;
end$$;
alter table public.economy_home_items add constraint lobby_home_category check(category in ('Background','Floor','Furniture','Etc'));
alter table public.economy_home_items add constraint lobby_home_index check(case when category in ('Background','Floor') then item_index between 0 and 4 else item_index between 1 and pawhaven_private.home_max_index(category) end);
alter table public.economy_home_items add constraint lobby_home_minimum check(quantity>=case when category in ('Background','Floor') then case when item_index=0 then 1 else 0 end else pawhaven_private.home_initial_stock(category,item_index) end);
alter table public.economy_home_items add constraint lobby_surface_limit check(category not in ('Background','Floor') or quantity<=1);
commit;
