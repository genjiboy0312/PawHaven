-- SQL Editor query name: Cherry Blossom Sky and Course
-- Requires Pet Shop and Owned Companions (030). Existing purchases and rewards are preserved.
begin;
alter table public.economy_home_items drop constraint if exists lobby_home_index;
alter table public.economy_home_items add constraint lobby_home_index check(case when category='Background' then item_index between 0 and 4 else item_index between 1 and pawhaven_private.home_max_index(category) end);
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.economy_runs'::regclass and contype='c' and pg_get_constraintdef(oid) like '%course_id%' loop
  execute format('alter table public.economy_runs drop constraint %I',c.conname);
 end loop;
end$$;
alter table public.economy_runs add constraint economy_run_course check(course_id in ('practice','garden','forest','crossroads','cherry'));
create or replace function pawhaven_private.course_coin_limit(course text)
returns integer language sql immutable set search_path='' as $$select case course when 'practice' then 8 when 'garden' then 12 when 'cherry' then 12 when 'forest' then 14 when 'crossroads' then 15 else null end$$;
revoke all on function pawhaven_private.course_coin_limit(text) from public,anon,authenticated;
create or replace function pawhaven_private.owned_background(p_user uuid,p_background text)
returns integer language sql stable security definer set search_path='' as $$
 select case when p_background ~ '^[1-4]$' and exists(select 1 from public.economy_home_items where user_id=p_user and category='Background' and item_index=case when p_background ~ '^[1-4]$' then p_background::integer else -1 end and quantity>0) then p_background::integer else 0 end;
$$;
revoke all on function pawhaven_private.owned_background(uuid,text) from public,anon,authenticated;
create or replace function pawhaven_private.check_saved_pet()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(new.snapshot->'character')='object' then
  new.snapshot:=jsonb_set(new.snapshot,'{character,petId}',to_jsonb(pawhaven_private.owned_pet(new.user_id,new.snapshot->'character'->>'petId')));
 end if;
 if jsonb_typeof(new.snapshot->'home')='object' then
  new.snapshot:=jsonb_set(new.snapshot,'{home,Background}',to_jsonb(pawhaven_private.owned_background(new.user_id,new.snapshot->'home'->>'Background')));
 end if;
 return new;
end;$$;

create or replace function pawhaven_private.economy_snapshot(p_user uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'cherrySkyReady',true,'petShopReady',true,'pets',jsonb_build_array('corgi')||coalesce((select jsonb_agg(p.pet_id order by p.pet_id) from public.economy_pets p where p.user_id=p_user),'[]'::jsonb),
    'coins', w.coins, 'xp', w.xp, 'premium', w.premium,
    'snacksReady', true, 'snacks', w.snacks,
    'homeShopReady', true, 'homeBackgroundShopReady', true, 'runRewardsReady', true, 'raceRewardsReady', true, 'dailyCoinQuestReady', true, 'boxCoinRewardsReady', true, 'speechSkinsReady', true,
    'homeItems', coalesce((select jsonb_object_agg(i.category || ':' || i.item_index, i.quantity)
      from public.economy_home_items i where i.user_id = p_user), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(i.category || ':' || i.item_index order by i.category, i.item_index)
      from public.economy_items i where i.user_id = p_user), '[]'::jsonb),
    'claimed', coalesce((select jsonb_agg(replace(c.claim_key,'pass:season0:','') order by c.claim_key)
      from public.economy_claims c where c.user_id = p_user and c.claim_key like 'pass:season0:%'), '[]'::jsonb),
    'daily', jsonb_build_object(
      'day', w.quest_day::text, 'pet', w.daily_pet, 'run', w.daily_run, 'coins', w.daily_coins,
      'coinsClaimed', exists(select 1 from public.economy_claims c where c.user_id=p_user and c.claim_key='daily:' || w.quest_day || ':coins'),
      'claimed', coalesce((select jsonb_agg(split_part(c.claim_key,':',3) order by c.claim_key)
        from public.economy_claims c where c.user_id = p_user and c.claim_key like 'daily:' || w.quest_day || ':%' and split_part(c.claim_key,':',3) in ('pet','run')), '[]'::jsonb),
      'lastPet', case when w.last_pet is null then null else floor(extract(epoch from w.last_pet) * 1000)::bigint end
    )
  ) from public.economy_wallets w where w.user_id = p_user;
$$;

create or replace function public.economy_command(p_action text, p_request_id uuid, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_day date;
  v_wallet public.economy_wallets%rowtype;
  v_previous public.economy_requests%rowtype;
  v_result jsonb := '{"outcome":"ignored"}'::jsonb;
  v_category text;
  v_index integer;
  v_price integer;
  v_quantity integer;
  v_key text;
  v_reward integer;
  v_tier integer;
  v_premium boolean;
  v_run uuid;
  v_rows integer;
  v_map text;
  v_collected integer;
  v_max_coins integer;
  v_room uuid;
  v_round uuid;
  v_race record;
  v_receipt jsonb;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_request_id is null or p_action is null or p_action not in
    ('load','buy','buy_pet','buy_home','feed','pet','claim_daily','claim_pass','unlock_pass','run_start','run_finish','race_reward') then
    raise exception 'invalid_command' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 2000 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  v_day := (v_now at time zone 'Asia/Seoul')::date;
  insert into public.economy_wallets(user_id) values(v_user) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.economy_items(user_id,category,item_index)
      select v_user, c, 1 from unnest(array['Hat','Body','Acc','Etc']) c;
  end if;
  select * into strict v_wallet from public.economy_wallets where user_id = v_user for update;
  v_now := clock_timestamp();
  v_day := (v_now at time zone 'Asia/Seoul')::date;
  if v_wallet.quest_day < v_day then
    update public.economy_wallets set quest_day = v_day, daily_pet = 0, daily_run = 0, daily_coins = 0, last_pet = null,
      revision = revision + 1 where user_id = v_user;
    select * into strict v_wallet from public.economy_wallets where user_id = v_user;
  end if;
  select * into v_previous from public.economy_requests where user_id = v_user and request_id = p_request_id;
  if found then
    if v_previous.command <> p_action or v_previous.payload <> p_payload then
      raise exception 'request_id_reused' using errcode = '22023';
    end if;
    -- Replay preserves the original effect but returns today's current wallet, never an old balance.
    return v_previous.result || jsonb_build_object('snapshot', pawhaven_private.economy_snapshot(v_user), 'revision', v_wallet.revision);
  end if;
  if p_action <> 'load' then
    if v_now >= v_wallet.request_window + interval '1 minute' then
      update public.economy_wallets set request_window = v_now, request_count = 0 where user_id = v_user;
      v_wallet.request_count := 0;
    end if;
    if v_wallet.request_count >= 120 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
    update public.economy_wallets set request_count = request_count + 1 where user_id = v_user;
  end if;

  if p_action = 'load' then
    v_result := '{"outcome":"loaded"}';
  elsif p_action = 'buy_pet' then
    v_key:=p_payload->>'petId';
    if v_key is null or v_key not in ('myeongrang','tuxedo') then raise exception 'invalid_pet' using errcode='22023';end if;
    if exists(select 1 from public.economy_pets where user_id=v_user and pet_id=v_key) then v_result:='{"outcome":"owned"}';
    elsif v_wallet.coins<500 then v_result:='{"outcome":"insufficient"}';
    else
      update public.economy_wallets set coins=coins-500 where user_id=v_user;
      insert into public.economy_pets(user_id,pet_id)values(v_user,v_key);
      v_result:='{"outcome":"purchased"}';
    end if;
  elsif p_action = 'buy' then
    v_category := p_payload->>'category';
    v_index := (p_payload->>'index')::integer;
    if v_category is null or v_category not in ('Hat','Body','Acc','Etc') or v_index is null or v_index not between 1 and 20 then
      raise exception 'invalid_item' using errcode = '22023';
    end if;
    v_price := case when v_category = 'Etc' and v_index = 2 then 150 else 75 + ((v_index - 1) / 5) * 25 end;
    if exists(select 1 from public.economy_items where user_id = v_user and category = v_category and item_index = v_index) then
      v_result := '{"outcome":"owned"}';
    elsif v_wallet.coins < v_price then
      v_result := '{"outcome":"insufficient"}';
    else
      update public.economy_wallets set coins = coins - v_price where user_id = v_user;
      insert into public.economy_items values(v_user,v_category,v_index);
      v_result := '{"outcome":"purchased"}';
    end if;
  elsif p_action = 'buy_home' then
    v_category := p_payload->>'category';
    if jsonb_typeof(p_payload->'index') is distinct from 'number' or (p_payload->>'index') !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'invalid_home_item' using errcode = '22023';
    end if;
    v_index := (p_payload->>'index')::integer;
    if v_category is null or v_category not in ('Background','Furniture','Etc') or v_index is null or
      (v_category='Background' and v_index not between 0 and 4) or
      (v_category<>'Background' and (v_index < 1 or v_index > pawhaven_private.home_max_index(v_category))) then
      raise exception 'invalid_home_item' using errcode = '22023';
    end if;
    v_price := case when v_category = 'Background' then 200 when v_category = 'Furniture' and v_index = 5 then 250 else 100 + v_index * 25 end;
    select quantity into v_quantity from public.economy_home_items where user_id = v_user and category = v_category and item_index = v_index;
    v_quantity := coalesce(v_quantity, case when v_category='Background' then case when v_index=0 then 1 else 0 end else pawhaven_private.home_initial_stock(v_category,v_index) end);
    if v_quantity >= (case when v_category='Background' then 1 else 20 end) then
      v_result := '{"outcome":"limit"}';
    elsif v_wallet.coins < v_price then
      v_result := '{"outcome":"insufficient"}';
    else
      update public.economy_wallets set coins = coins - v_price where user_id = v_user;
      insert into public.economy_home_items(user_id,category,item_index,quantity) values(v_user,v_category,v_index,v_quantity + 1)
        on conflict(user_id,category,item_index) do update set quantity = excluded.quantity;
      v_result := '{"outcome":"purchased"}';
    end if;
  elsif p_action = 'pet' then
    if v_wallet.daily_pet < 3 and (v_wallet.last_pet is null or v_now >= v_wallet.last_pet + interval '10 seconds') then
      update public.economy_wallets set daily_pet = daily_pet + 1, last_pet = v_now where user_id = v_user;
      v_result := '{"outcome":"recorded"}';
    end if;
  elsif p_action = 'feed' then
    if p_payload->>'petId' is null or p_payload->>'petId' not in ('corgi','myeongrang','tuxedo') or pawhaven_private.owned_pet(v_user,p_payload->>'petId') is distinct from p_payload->>'petId' then raise exception 'invalid_pet' using errcode='22023'; end if;
    if v_wallet.snacks=0 then v_result:='{"outcome":"snack_empty"}';
    elsif v_wallet.last_snack is not null and v_now<v_wallet.last_snack+interval '4 seconds' then v_result:='{"outcome":"snack_cooldown"}';
    else
      update public.economy_wallets set snacks=snacks-1,last_snack=v_now where user_id=v_user;
      v_result:=jsonb_build_object('outcome','fed','petId',p_payload->>'petId');
    end if;
  elsif p_action = 'claim_daily' then
    v_key := p_payload->>'quest';
    if v_key is null or v_key not in ('pet','run','coins') then raise exception 'invalid_quest' using errcode = '22023'; end if;
    if (v_key = 'pet' and v_wallet.daily_pet >= 3) or (v_key = 'run' and v_wallet.daily_run >= 1) or (v_key = 'coins' and v_wallet.daily_coins >= 20) then
      v_reward := case when v_key = 'run' then 100 else 50 end;
      insert into public.economy_claims values(v_user,'daily:' || v_wallet.quest_day || ':' || v_key) on conflict do nothing;
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        update public.economy_wallets set coins = least(1000000,coins + v_reward),snacks=least(99,snacks+case when v_key='coins' then 0 else 1 end) where user_id = v_user;
        v_result := '{"outcome":"claimed"}';
      end if;
    end if;
  elsif p_action = 'claim_pass' then
    v_tier := (p_payload->>'tier')::integer;
    v_premium := (p_payload->>'premium')::boolean;
    if v_tier is null or v_tier not between 1 and 5 or v_premium is null then raise exception 'invalid_tier' using errcode = '22023'; end if;
    if v_tier <= least(5,1 + v_wallet.xp / 100) and (not v_premium or v_wallet.premium) then
      v_key := 'pass:season0:' || case when v_premium then 'premium-' else 'free-' end || v_tier;
      insert into public.economy_claims values(v_user,v_key) on conflict do nothing;
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        v_reward := v_tier * case when v_premium then 40 else 20 end;
        update public.economy_wallets set coins = least(1000000,coins + v_reward) where user_id = v_user;
        v_result := '{"outcome":"claimed"}';
      end if;
    end if;
  elsif p_action = 'unlock_pass' then
    -- Season 0 only: the existing prototype unlock is explicitly free, not a paid entitlement.
    update public.economy_wallets set premium = true where user_id = v_user;
    v_result := '{"outcome":"unlocked"}';
  elsif p_action = 'race_reward' then
    v_room := (p_payload->>'room')::uuid; v_round := (p_payload->>'round')::uuid;
    if v_room is null or v_round is null or jsonb_typeof(p_payload->'collected') is distinct from 'number' or (p_payload->>'collected') !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'invalid_race_reward' using errcode='22023';
    end if;
    v_collected := (p_payload->>'collected')::integer;
    if v_collected not between 0 and 15 then raise exception 'invalid_run_coins' using errcode='22023'; end if;
    select jsonb_build_object('collected',coins_collected,'bonus',10,'coins',reward_coins) into v_receipt
      from public.economy_race_rewards where user_id=v_user and round_id=v_round and room_id=v_room;
    if found then
      v_result := jsonb_build_object('outcome','finished','run_id',v_round,'run_reward',v_receipt);
    else
      select id,map,phase,round_id,starts_at into v_race from public.mp_rooms where id=v_room for share;
      if not found or v_race.round_id is distinct from v_round or v_race.phase not in ('playing','results') or v_race.starts_at is null or v_now<v_race.starts_at+interval '4 seconds'
        or not exists(select 1 from public.mp_racers where room_id=v_room and user_id=v_user and finished_ms is not null) then
        v_result := jsonb_build_object('outcome','run_rejected','run_id',v_round);
      else
        v_max_coins := pawhaven_private.course_coin_limit(v_race.map);
        if v_max_coins is null or v_collected>v_max_coins then raise exception 'invalid_run_coins' using errcode='22023'; end if;
        v_reward := least(1000000-v_wallet.coins,10+v_collected);
        update public.economy_wallets set coins=coins+v_reward,xp=least(400,xp+100),daily_run=1,daily_coins=least(20,daily_coins+v_collected) where user_id=v_user;
        insert into public.economy_race_rewards(user_id,round_id,room_id,coins_collected,reward_coins) values(v_user,v_round,v_room,v_collected,v_reward);
        v_result := jsonb_build_object('outcome','finished','run_id',v_round,'run_reward',jsonb_build_object('collected',v_collected,'bonus',10,'coins',v_reward));
      end if;
    end if;
  elsif p_action = 'run_start' then
    v_map := coalesce(p_payload->>'map','garden');
    if v_map not in ('practice','garden','forest','crossroads','cherry') then raise exception 'invalid_run_map' using errcode='22023'; end if;
    update public.economy_runs set consumed = true where user_id = v_user and not consumed;
    v_run := gen_random_uuid();
    insert into public.economy_runs(id,user_id,started_at,expires_at,course_id) values(v_run,v_user,v_now,v_now + interval '15 minutes',v_map);
    v_result := jsonb_build_object('outcome','started','run_id',v_run);
  elsif p_action = 'run_finish' then
    v_run := (p_payload->>'run_id')::uuid;
    if v_run is null then raise exception 'invalid_run_token' using errcode='22023'; end if;
    if p_payload ? 'collected' and (jsonb_typeof(p_payload->'collected') is distinct from 'number' or (p_payload->>'collected') !~ '^(0|[1-9][0-9]*)$') then
      raise exception 'invalid_run_coins' using errcode='22023';
    end if;
    v_collected := coalesce((p_payload->>'collected')::integer,0);
    if v_collected not between 0 and 15 then raise exception 'invalid_run_coins' using errcode='22023'; end if;
    update public.economy_runs set consumed = true where id = v_run and user_id = v_user and not consumed
      and v_now >= started_at + interval '4 seconds' and v_now <= expires_at returning course_id into v_map;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then v_result := jsonb_build_object('outcome','run_rejected','run_id',v_run);
    else
      v_max_coins := pawhaven_private.course_coin_limit(v_map);
      if v_collected > v_max_coins then raise exception 'invalid_run_coins' using errcode='22023'; end if;
      v_reward := least(1000000-v_wallet.coins,10+v_collected);
      update public.economy_wallets set coins=coins+v_reward,xp=least(400,xp+100),daily_run=1,daily_coins=least(20,daily_coins+v_collected) where user_id=v_user;
      update public.economy_runs set coins_collected=v_collected,reward_coins=v_reward where id=v_run;
      v_result := jsonb_build_object('outcome','finished','run_id',v_run,'run_reward',jsonb_build_object('collected',v_collected,'bonus',10,'coins',v_reward));
    end if;
  end if;
  if p_action <> 'load' then
    update public.economy_wallets set revision = revision + 1 where user_id = v_user;
    insert into public.economy_requests(user_id,request_id,command,payload,result) values(v_user,p_request_id,p_action,p_payload,v_result);
  end if;
  return v_result || jsonb_build_object('snapshot',pawhaven_private.economy_snapshot(v_user),
    'revision',(select revision from public.economy_wallets where user_id = v_user));
end;
$$;

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
  if cat not in ('Furniture','Etc') or cat is null or coalesce(item->>'option','')!~'^[1-7]$' then continue;end if;
  choice:=(item->>'option')::integer;if choice>pawhaven_private.home_max_index(cat) then continue;end if;
  select quantity into stock from public.economy_home_items where user_id=p_target and category=cat and item_index=choice;
  stock:=coalesce(stock,pawhaven_private.home_initial_stock(cat,choice));
  item_key:=cat||':'||choice;used:=coalesce((counts->>item_key)::integer,0);
  if used>=stock then continue;end if;
  counts:=counts||jsonb_build_object(item_key,used+1);
  -- Share only the placement fields; never leak arbitrary save data.
  items:=items||jsonb_build_array(jsonb_build_object('id',item->'id','tab',cat,'option',choice,'x',item->'x','y',item->'y'));
 end loop;
 return jsonb_build_object('id',p_target,'nickname',nickname,
  'character',jsonb_build_object('petId',pawhaven_private.owned_pet(p_target,look->>'petId'),'outfit',clothes),
  'home',jsonb_build_object('version',2,'Background',pawhaven_private.owned_background(p_target,home->>'Background'),
  'Floor',case when home->>'Floor' ~ '^[0-3]$' then (home->>'Floor')::integer else 0 end,'items',items));
end;$$;
notify pgrst,'reload schema';
commit;
