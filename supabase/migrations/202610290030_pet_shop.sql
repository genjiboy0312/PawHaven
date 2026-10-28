-- SQL Editor query name: Pet Shop and Owned Companions
-- Requires Invite Only Multiplayer Rooms (028) and current economy/mail migrations.
-- Corgi remains free. Myeongrang and Tuxedo Cat each cost 500 Coins; no automatic paid grants.
begin;
create table if not exists public.economy_pets(
 user_id uuid not null references auth.users(id) on delete cascade,
 pet_id text not null check(pet_id in ('myeongrang','tuxedo')),
 primary key(user_id,pet_id)
);
alter table public.economy_pets enable row level security;
revoke all on public.economy_pets from public,anon,authenticated;
create or replace function pawhaven_private.owned_pet(p_user uuid,p_pet text)
returns text language sql stable security definer set search_path='' as $$
 select case when p_pet in ('myeongrang','tuxedo') and exists(select 1 from public.economy_pets where user_id=p_user and pet_id=p_pet) then p_pet else 'corgi' end;
$$;
revoke all on function pawhaven_private.owned_pet(uuid,text) from public,anon,authenticated;
-- Keep legacy presets, but clamp the selected animal even for direct save-table writes.
create or replace function pawhaven_private.check_saved_pet()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(new.snapshot->'character')='object' then
  new.snapshot:=jsonb_set(new.snapshot,'{character,petId}',to_jsonb(pawhaven_private.owned_pet(new.user_id,new.snapshot->'character'->>'petId')));
 end if;
 return new;
end;$$;
revoke all on function pawhaven_private.check_saved_pet() from public,anon,authenticated;
drop trigger if exists check_saved_pet on public.player_saves;
create trigger check_saved_pet before insert or update of snapshot on public.player_saves for each row execute function pawhaven_private.check_saved_pet();
create or replace function pawhaven_private.economy_snapshot(p_user uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'petShopReady',true,'pets',jsonb_build_array('corgi')||coalesce((select jsonb_agg(p.pet_id order by p.pet_id) from public.economy_pets p where p.user_id=p_user),'[]'::jsonb),
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
      (v_category='Background' and v_index not between 0 and 3) or
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
    if v_map not in ('practice','garden','forest','crossroads') then raise exception 'invalid_run_map' using errcode='22023'; end if;
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

revoke all on function pawhaven_private.economy_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.economy_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.economy_command(text,uuid,jsonb) to authenticated;

create or replace function public.multiplayer_command(p_action text, p_room uuid default null, p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid(); stamp timestamptz := clock_timestamp(); r public.mp_rooms%rowtype;
 mine public.mp_members%rowtype; target uuid; n integer; out_room jsonb := null; out_list jsonb;
 look jsonb; clothes jsonb := '{}'; cat text; choice integer; v_name text; v_pose jsonb; finish_x integer;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 if p_action not in ('list','sync','create','join','leave','ready','map','start','loaded','pose','finish','return') then raise exception 'invalid_action' using errcode='22023'; end if;
 -- Serialize the small prototype lobby, including the last free seat and account membership.
 perform pg_advisory_xact_lock(748201);
 stamp:=clock_timestamp();
 update public.mp_racers a set disconnected=true where exists(select 1 from public.mp_members m where m.user_id=a.user_id and m.room_id=a.room_id and m.seen_at<stamp-interval '45 seconds');
 delete from public.mp_members where seen_at<stamp-interval '45 seconds';
 delete from public.mp_rooms r0 where not exists(select 1 from public.mp_members m where m.room_id=r0.id);
 update public.mp_rooms r0 set host=(select m.user_id from public.mp_members m where m.room_id=r0.id order by m.joined_at,m.user_id limit 1)
 where not exists(select 1 from public.mp_members m where m.room_id=r0.id and m.user_id=r0.host);
 with cancelled as (
   update public.mp_rooms r0 set phase='waiting',round_id=null,starts_at=null,ends_at=null
   where phase='countdown' and ((select count(*) from public.mp_members m where m.room_id=r0.id)<2 or (starts_at is null and ends_at<=stamp)) returning id
 ) update public.mp_members set ready=false where room_id in(select id from cancelled);
 update public.mp_rooms set phase='playing' where phase='countdown' and starts_at<=stamp;
 update public.mp_rooms r0 set phase='results' where phase='playing' and
 (ends_at<=stamp or not exists(select 1 from public.mp_racers a where a.room_id=r0.id and a.finished_ms is null and not a.disconnected));
 update public.mp_rooms r0 set phase='waiting',starts_at=null,ends_at=null where phase='results' and
 not exists(select 1 from public.mp_members m where m.room_id=r0.id and not m.returned);

 select * into mine from public.mp_members where user_id=uid;
 if p_action='create' then
   if mine.user_id is not null then raise exception 'already_in_room' using errcode='P0001'; end if;
   if p_payload ? 'visibility' and (jsonb_typeof(p_payload->'visibility') is distinct from 'string' or p_payload->>'visibility' not in ('public','invite')) then raise exception 'invalid_visibility' using errcode='22023'; end if;
   insert into public.mp_rooms(name,host,map,visibility) values(coalesce(nullif(left(trim(p_payload->>'name'),24),''),'Cozy Room'),uid,coalesce(p_payload->>'map','garden'),coalesce(p_payload->>'visibility','public')) returning id into target;
 elsif p_action='join' then
   if mine.user_id is not null and mine.room_id<>p_room then raise exception 'already_in_room' using errcode='P0001'; end if;
   select * into r from public.mp_rooms where id=p_room;
   if not found then raise exception 'room_closed' using errcode='P0001'; end if;
   if mine.user_id is null then
     if r.phase<>'waiting' or (select count(*) from public.mp_members where room_id=p_room)>=4 then raise exception 'room_unavailable' using errcode='P0001'; end if;
     if r.visibility='invite' then
       -- No address-based access: a live ticket belongs to this recipient and the current host.
       if not exists(select 1 from public.friend_room_invites i
         join public.player_friendships f on f.user_low=least(i.sender,i.recipient) and f.user_high=greatest(i.sender,i.recipient) and f.status='accepted'
         join public.mp_members host_member on host_member.room_id=r.id and host_member.user_id=r.host and host_member.seen_at>stamp-interval '45 seconds'
         where i.room_id=r.id and i.sender=r.host and i.recipient=uid and i.pending and i.expires_at>stamp
         and i.ticket::text=p_payload->>'invite_ticket') then
         raise exception 'room_unavailable' using errcode='P0001';
       end if;
       update public.friend_room_invites set pending=false where room_id=r.id and sender=r.host and recipient=uid and ticket::text=p_payload->>'invite_ticket';
     end if;
   end if;
   target:=p_room;
 end if;
 if target is not null and mine.user_id is null then
   select coalesce(p.nickname,'Player '||left(uid::text,4)) into v_name from (values(1)) dummy(v) left join public.player_profiles p on p.user_id=uid;
   select snapshot->'character' into look from public.player_saves where user_id=uid;
   foreach cat in array array['Hat','Body','Acc','Etc'] loop
     choice:=case when coalesce(look->'outfit'->>cat,'0') ~ '^([0-9]|1[0-9]|20)$' then (look->'outfit'->>cat)::integer else 0 end;
     if choice>1 and not exists(select 1 from public.economy_items where user_id=uid and category=cat and item_index=choice) then choice:=0; end if;
     clothes:=clothes||jsonb_build_object(cat,coalesce(choice,0));
   end loop;
   look:=jsonb_build_object('petId',pawhaven_private.owned_pet(uid,look->>'petId'),'outfit',clothes);
   insert into public.mp_members(user_id,room_id,nickname,look) values(uid,target,v_name,look);
 end if;
 select * into mine from public.mp_members where user_id=uid;
 if p_action not in ('list','create','join') and (mine.user_id is null or (p_room is not null and mine.room_id<>p_room)) then
   if p_action='sync' then return jsonb_build_object('privateRoomsReady',true,'room',null,'rooms','[]'::jsonb,'now',extract(epoch from stamp)*1000); end if;
   raise exception 'not_a_member' using errcode='42501';
 end if;
 if mine.user_id is not null then
   target:=mine.room_id; select * into r from public.mp_rooms where id=target;
   update public.mp_members set seen_at=stamp where user_id=uid;
   if p_action='leave' then
     update public.mp_racers set disconnected=true where room_id=target and user_id=uid and finished_ms is null;
     delete from public.mp_members where user_id=uid;
     if r.host=uid then update public.mp_rooms set host=coalesce((select user_id from public.mp_members where room_id=target order by joined_at,user_id limit 1),uid) where id=target; end if;
     delete from public.mp_rooms where id=target and not exists(select 1 from public.mp_members where room_id=target);
   elsif p_action='ready' then
     if r.phase<>'waiting' or r.host=uid then raise exception 'cannot_ready' using errcode='P0001'; end if;
     update public.mp_members set ready=coalesce((p_payload->>'ready')::boolean,false) where user_id=uid;
   elsif p_action='map' then
     if r.host<>uid or r.phase<>'waiting' then raise exception 'host_only' using errcode='42501'; end if;
     if r.map is distinct from p_payload->>'map' then
       update public.mp_rooms set map=p_payload->>'map' where id=target;
       update public.mp_members set ready=false where room_id=target;
     end if;
   elsif p_action='start' then
     if r.host<>uid then raise exception 'host_only' using errcode='42501'; end if;
     if r.phase<>'waiting' or (select count(*) from public.mp_members where room_id=target)<2 or exists(select 1 from public.mp_members where room_id=target and user_id<>uid and not ready) then raise exception 'not_ready' using errcode='P0001'; end if;
     update public.mp_rooms set phase='countdown',round_id=gen_random_uuid(),starts_at=null,ends_at=stamp+interval '20 seconds' where id=target;
     delete from public.mp_racers where room_id=target;
     insert into public.mp_racers(room_id,user_id,nickname) select room_id,user_id,nickname from public.mp_members where room_id=target;
     update public.mp_members set loaded_round=null,ready=false,returned=false,pose='{"x":120,"height":0,"direction":1,"action":"idle","progress":0,"vx":0}' where room_id=target;
   elsif p_action='loaded' then
     if r.phase not in ('countdown','playing') or p_payload->>'round' is distinct from r.round_id::text then raise exception 'stale_round' using errcode='P0001'; end if;
     update public.mp_members set loaded_round=r.round_id where user_id=uid;
   elsif p_action in ('pose','finish') then
     if r.phase not in ('playing','countdown') or p_payload->>'round' is distinct from r.round_id::text then raise exception 'stale_round' using errcode='P0001'; end if;
     if p_action='pose' and r.phase='playing' and not exists(select 1 from public.mp_racers where room_id=target and user_id=uid and finished_ms is not null) then
       finish_x:=case r.map when 'garden' then 6500 when 'crossroads' then 5700 else 2520 end;
       v_pose:=jsonb_build_object('x',greatest(120,least(finish_x,(p_payload->>'x')::numeric)), 'height',greatest(-200,least(300,(p_payload->>'height')::numeric)),
         'direction',case when p_payload->>'direction'='-1' then -1 else 1 end,'action',case when p_payload->>'action' in ('idle','run','jump','fall','land','attack','skill') then p_payload->>'action' else 'idle' end,
         'progress',greatest(0,least(1,coalesce((p_payload->>'progress')::numeric,0))),'vx',greatest(-1800,least(1800,coalesce((p_payload->>'vx')::numeric,0))));
       update public.mp_members set pose=v_pose where user_id=uid;
     elsif p_action='finish' then
       finish_x:=case r.map when 'garden' then 6500 when 'crossroads' then 5700 else 2520 end;
       if r.phase<>'playing' or stamp<r.starts_at+interval '4 seconds' or (mine.pose->>'x')::numeric<finish_x-25 or (mine.pose->>'height')::numeric<0 then raise exception 'invalid_finish' using errcode='P0001'; end if;
       update public.mp_racers set finished_ms=floor(extract(epoch from(stamp-r.starts_at))*1000) where room_id=target and user_id=uid and finished_ms is null;
       update public.mp_rooms set ends_at=least(ends_at,stamp+interval '20 seconds') where id=target;
     end if;
   elsif p_action='return' then
     if r.phase<>'results' then raise exception 'not_finished' using errcode='P0001'; end if;
     update public.mp_members set returned=true,ready=false where user_id=uid;
   end if;
 end if;
 -- All current members must have rendered the race scene before scheduling a shared start.
 -- Two seconds of delivery lead-in, five digits, then one second of Ready~.
 update public.mp_rooms waiting set starts_at=stamp+interval '8 seconds',ends_at=stamp+interval '128 seconds'
 where waiting.phase='countdown' and waiting.starts_at is null
 and (select count(*) from public.mp_members m where m.room_id=waiting.id)>=2
 and not exists(select 1 from public.mp_members m where m.room_id=waiting.id and m.loaded_round is distinct from waiting.round_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'map',l.map,'phase',l.phase,'count',l.members) order by l.created_at desc),'[]'::jsonb) into out_list
 from (select a.*, (select count(*) from public.mp_members b where b.room_id=a.id) members from public.mp_rooms a where a.visibility='public' order by a.created_at desc limit 80) l;
 select * into mine from public.mp_members where user_id=uid;
 if mine.user_id is not null then
   select * into r from public.mp_rooms where id=mine.room_id;
   out_room:=jsonb_build_object('id',r.id,'name',r.name,'host',r.host,'visibility',r.visibility,'map',r.map,'phase',r.phase,'round',r.round_id,'startsAt',extract(epoch from r.starts_at)*1000,
     'endsAt',extract(epoch from r.ends_at)*1000,'members',(select jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.nickname,'look',m.look,'ready',m.ready,'returned',m.returned,'pose',m.pose) order by m.joined_at,m.user_id) from public.mp_members m where m.room_id=r.id),
     'racers',coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'name',a.nickname,'time',a.finished_ms,'left',a.disconnected) order by a.finished_ms nulls last,a.nickname) from public.mp_racers a where a.room_id=r.id),'[]'::jsonb));
 end if;
 return jsonb_build_object('privateRoomsReady',true,'room',out_room,'rooms',out_list,'now',extract(epoch from stamp)*1000);
end;
$$;
revoke all on function public.multiplayer_command(text,uuid,jsonb) from public,anon;
grant execute on function public.multiplayer_command(text,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';


create or replace function public.park_command(p_action text,p_channel integer default 1,p_session uuid default null,p_text text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); mine public.park_members; nickname text; result jsonb; msg text;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_channel is null or p_channel not between 1 and 4 then raise exception 'invalid_channel'; end if;
 -- Serialize joins across all four small prototype channels (also protects cross-channel switches).
 perform pg_advisory_xact_lock(7240412);
 delete from public.park_members where seen_at<clock_timestamp()-interval '45 seconds';
 delete from public.park_chat where created_at<clock_timestamp()-interval '1 hour';
 select * into mine from public.park_members where user_id=uid;
 if p_action='leave' then
   delete from public.park_members where user_id=uid and session=p_session;
 elsif p_action='join' then
   if p_session is null then raise exception 'invalid_session'; end if;
   select p.nickname into nickname from public.player_profiles p where user_id=uid;
   if nickname is null then raise exception 'nickname_required'; end if;
   if (select count(*) from public.park_members where channel=p_channel and user_id<>uid)>=8 then raise exception 'park_full'; end if;
   insert into public.park_members(user_id,channel,session,look)
    values(uid,p_channel,p_session,jsonb_set(coalesce((select snapshot->'character' from public.player_saves where user_id=uid),'{}'),'{petId}',to_jsonb(pawhaven_private.owned_pet(uid,(select snapshot->'character'->>'petId' from public.player_saves where user_id=uid)))))
    on conflict(user_id) do update set channel=excluded.channel,session=excluded.session,look=excluded.look,seen_at=clock_timestamp();
 elsif p_action in ('sync','chat') then
   if mine.user_id is null or mine.session is distinct from p_session or mine.channel<>p_channel then raise exception 'park_session_lost'; end if;
   update public.park_members set seen_at=clock_timestamp() where user_id=uid;
   if p_action='chat' then
     msg:=btrim(regexp_replace(coalesce(p_text,''),'[[:cntrl:]]',' ','g'));
     if char_length(msg) not between 1 and 100 then raise exception 'invalid_message'; end if;
     if mine.last_chat>clock_timestamp()-interval '2 seconds' then raise exception 'chat_cooldown'; end if;
     select p.nickname into nickname from public.player_profiles p where user_id=uid;
     insert into public.park_chat(channel,user_id,name,message) values(p_channel,uid,nickname,msg);
     update public.park_members set last_chat=clock_timestamp() where user_id=uid;
   end if;
 elsif p_action<>'list' then raise exception 'invalid_action';
 end if;
 select jsonb_build_object('counts',(select jsonb_agg((select count(*) from public.park_members where channel=n)) from generate_series(1,4) n)) into result;
 if p_action in ('join','sync','chat') then
   result:=result||jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'session',m.session,'name',p.nickname,'look',m.look) order by m.user_id)
    from public.park_members m join public.player_profiles p on p.user_id=m.user_id where m.channel=p_channel),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from (select id,user_id,name,message,recipient_id,recipient_name from public.park_chat where channel=p_channel and (recipient_id is null or user_id=uid or recipient_id=uid) and not exists(select 1 from public.player_blocks b where b.blocker=uid and b.blocked=user_id) order by id desc limit 30)c),'[]'::jsonb));
 end if;
 return result;
end;$$;
revoke all on function public.park_command(text,integer,uuid,text) from public,anon;
grant execute on function public.park_command(text,integer,uuid,text) to authenticated;


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
  'home',jsonb_build_object('version',2,'Background',case when home->>'Background' ~ '^[0-3]$' then (home->>'Background')::integer else 0 end,
  'Floor',case when home->>'Floor' ~ '^[0-3]$' then (home->>'Floor')::integer else 0 end,'items',items));
end;$$;
revoke all on function public.visit_friend_home(uuid) from public,anon;
grant execute on function public.visit_friend_home(uuid) to authenticated;

notify pgrst,'reload schema';

update public.mp_members set look=jsonb_set(look,'{petId}',to_jsonb(pawhaven_private.owned_pet(user_id,look->>'petId')));
update public.park_members set look=jsonb_set(look,'{petId}',to_jsonb(pawhaven_private.owned_pet(user_id,look->>'petId')));
notify pgrst,'reload schema';
commit;
