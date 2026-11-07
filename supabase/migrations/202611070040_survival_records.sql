-- Survival Personal Records. Requires Single Records and Goals Sync (037).
-- Personal progress only; no currency, ranking or multiplayer result writes.
begin;
alter table public.player_single_records add column if not exists survival_cleared boolean not null default false;
alter table public.player_single_records drop constraint if exists player_single_records_map_check;
alter table public.player_single_records add constraint player_single_records_map_check
  check (map in ('garden','practice','forest','crossroads','cherry','survival','terraces'));
alter table public.player_single_records drop constraint if exists single_survival_record_bounds;
alter table public.player_single_records add constraint single_survival_record_bounds
  check (map not in ('survival','terraces') or (best_ms <= 30000 and (not survival_cleared or best_ms = 30000)));

create or replace function public.sync_single_records(p_records jsonb default '{"version":2,"times":{},"goals":{}}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  item record;
  goals jsonb;
  duration bigint;
  result jsonb;
begin
  if owner_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_records is null or jsonb_typeof(p_records) <> 'object' or octet_length(p_records::text) > 10000
     or p_records->'version' is distinct from '2'::jsonb or jsonb_typeof(p_records->'times') is distinct from 'object'
     or jsonb_typeof(p_records->'goals') is distinct from 'object' then
    raise exception 'invalid_single_records' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_records) k where k not in ('version','times','goals'))
     or exists (select 1 from jsonb_object_keys(p_records->'goals') k where not (p_records->'times' ? k)) then
    raise exception 'invalid_single_records' using errcode = '22023';
  end if;
  -- Stable map order keeps concurrent merges consistent. Each row only improves.
  for item in select key, value from jsonb_each(p_records->'times') order by key loop
    if item.key not in ('garden','practice','forest','crossroads','cherry','survival','terraces') or jsonb_typeof(item.value) <> 'number'
       or item.value::text !~ '^[0-9]{1,8}$' then
      raise exception 'invalid_single_records' using errcode = '22023';
    end if;
    duration := item.value::text::bigint;
    if duration not between 1 and 86400000 then raise exception 'invalid_single_records' using errcode = '22023'; end if;
    goals := coalesce(p_records->'goals'->item.key, '[]'::jsonb);
    if jsonb_typeof(goals) <> 'array' then raise exception 'invalid_single_records' using errcode = '22023'; end if;
    if jsonb_array_length(goals) > 3 or exists (select 1 from jsonb_array_elements(goals) g where jsonb_typeof(g) <> 'string' or g#>>'{}' not in ('finish','noFalls','time')) then
      raise exception 'invalid_single_records' using errcode = '22023';
    end if;
    if item.key in ('survival','terraces') and
       (duration > 30000 or exists (select 1 from jsonb_array_elements_text(goals) g where g <> 'finish')
        or (goals ? 'finish' and duration <> 30000)) then
      raise exception 'invalid_single_records' using errcode = '22023';
    end if;
    insert into public.player_single_records(user_id,map,best_ms,no_falls,survival_cleared)
      values(owner_id,item.key,duration,goals ? 'noFalls',item.key in ('survival','terraces') and goals ? 'finish')
      on conflict (user_id,map) do update set
        best_ms = case when excluded.map in ('survival','terraces') then greatest(player_single_records.best_ms, excluded.best_ms) else least(player_single_records.best_ms, excluded.best_ms) end,
        survival_cleared = player_single_records.survival_cleared or excluded.survival_cleared,
        no_falls = player_single_records.no_falls or excluded.no_falls,
        updated_at = now();
  end loop;
  select jsonb_build_object('version',2,'times',coalesce(jsonb_object_agg(map,best_ms),'{}'::jsonb),
    'goals',coalesce(jsonb_object_agg(map,
      case when map in ('survival','terraces') then case when survival_cleared then '["finish"]'::jsonb else '[]'::jsonb end else
      '["finish"]'::jsonb || case when no_falls then '["noFalls"]'::jsonb else '[]'::jsonb end ||
      case when best_ms <= case map when 'practice' then 12000 when 'forest' then 40000 when 'crossroads' then 24000 else 30000 end
        then '["time"]'::jsonb else '[]'::jsonb end end),'{}'::jsonb)) into result
    from public.player_single_records where user_id = owner_id;
  return result;
end;
$$;
revoke all on function public.sync_single_records(jsonb) from public, anon;
grant execute on function public.sync_single_records(jsonb) to authenticated;
commit;
