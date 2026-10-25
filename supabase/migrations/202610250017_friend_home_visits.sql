-- SQL Editor query name: Friend Home Visits
-- Requires accounts, economy, home shop, friends and Player Blocks and Chat Privacy (015).
begin;
create or replace function public.visit_friend_home(p_target uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); saved jsonb; home jsonb; look jsonb; clothes jsonb:='{}';
 nickname text; cat text; choice integer; item jsonb; items jsonb:='[]'; counts jsonb:='{}';
 stock integer; item_key text; used integer;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501';end if;
 if p_target is null or p_target=uid then raise exception 'home_unavailable';end if;
 -- Same serialization as friend removal/blocking, but no presence or visitor writes.
 perform pg_advisory_xact_lock(748202);
 if not exists(select 1 from public.player_friendships where user_low=least(uid,p_target) and user_high=greatest(uid,p_target) and status='accepted')
 or exists(select 1 from public.player_blocks where (blocker=uid and blocked=p_target) or (blocker=p_target and blocked=uid)) then raise exception 'home_unavailable';end if;
 select p.nickname into nickname from public.player_profiles p where user_id=p_target;
 if nickname is null then raise exception 'home_unavailable';end if;
 select snapshot into saved from public.player_saves where user_id=p_target;
 look:=saved->'character';home:=saved->'home';
 foreach cat in array array['Hat','Body','Acc','Etc'] loop
  choice:=case when coalesce(look->'outfit'->>cat,'0') ~ '^([0-9]|1[0-9]|20)$' then (look->'outfit'->>cat)::integer else 0 end;
  if choice>1 and not exists(select 1 from public.economy_items where user_id=p_target and category=cat and item_index=choice) then choice:=0;end if;
  clothes:=clothes||jsonb_build_object(cat,coalesce(choice,0));
 end loop;
 for item in select value from jsonb_array_elements(case when jsonb_typeof(home->'items')='array' then home->'items' else '[]'::jsonb end) limit 200 loop
  cat:=item->>'tab';
  if cat not in ('Furniture','Etc') or cat is null or coalesce(item->>'option','')!~'^[1-5]$' then continue;end if;
  choice:=(item->>'option')::integer;if cat='Etc' and choice>4 then continue;end if;
  select quantity into stock from public.economy_home_items where user_id=p_target and category=cat and item_index=choice;
  stock:=coalesce(stock,case when cat='Furniture' and choice=5 then 0 else 3 end);
  item_key:=cat||':'||choice;used:=coalesce((counts->>item_key)::integer,0);
  if used>=stock then continue;end if;
  counts:=counts||jsonb_build_object(item_key,used+1);
  -- Share only the placement fields; never leak arbitrary save data.
  items:=items||jsonb_build_array(jsonb_build_object('id',item->'id','tab',cat,'option',choice,'x',item->'x','y',item->'y'));
 end loop;
 return jsonb_build_object('id',p_target,'nickname',nickname,
  'character',jsonb_build_object('petId',case when look->>'petId'='myeongrang' then 'myeongrang' else 'corgi' end,'outfit',clothes),
  'home',jsonb_build_object('version',2,'Background',case when home->>'Background' ~ '^[0-3]$' then (home->>'Background')::integer else 0 end,
  'Floor',case when home->>'Floor' ~ '^[0-3]$' then (home->>'Floor')::integer else 0 end,'items',items));
end;$$;
revoke all on function public.visit_friend_home(uuid) from public,anon;
grant execute on function public.visit_friend_home(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
