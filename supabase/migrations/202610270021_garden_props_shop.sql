-- SQL Editor query name: Garden Props Shop
-- Requires home shop, snacks, mailbox, friends/blocks and friend home visits.
begin;
create or replace function pawhaven_private.home_max_index(category text)
returns integer language sql immutable set search_path='' as $$select case category when 'Furniture' then 5 when 'Etc' then 7 else null end$$;
create or replace function pawhaven_private.home_initial_stock(category text,item_index integer)
returns integer language sql immutable set search_path='' as $$select case when (category='Furniture' and item_index=5) or (category='Etc' and item_index>=5) then 0 else 3 end$$;
revoke all on function pawhaven_private.home_max_index(text),pawhaven_private.home_initial_stock(text,integer) from public,anon,authenticated;
-- Preserve category and quantity-limit checks; replace only item-index/default checks.
do $$declare entry record;begin
 for entry in select conname from pg_constraint where conrelid='public.economy_home_items'::regclass and contype='c' and pg_get_constraintdef(oid) like '%item_index%' loop
  execute format('alter table public.economy_home_items drop constraint %I',entry.conname);
 end loop;
end$$;
alter table public.economy_home_items add constraint garden_home_index check(item_index>=1 and item_index<=pawhaven_private.home_max_index(category));
alter table public.economy_home_items add constraint garden_home_minimum check(quantity>=pawhaven_private.home_initial_stock(category,item_index));

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
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_request_id is null or p_action is null or p_action not in
    ('load','buy','buy_home','feed','pet','claim_daily','claim_pass','unlock_pass','run_start','run_finish') then
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
    update public.economy_wallets set quest_day = v_day, daily_pet = 0, daily_run = 0, last_pet = null,
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
  elsif p_action = 'buy' then
    v_category := p_payload->>'category';
    v_index := (p_payload->>'index')::integer;
    if v_category is null or v_category not in ('Hat','Body','Acc','Etc') or v_index is null or v_index not between 1 and 20 then
      raise exception 'invalid_item' using errcode = '22023';
    end if;
    v_price := 75 + ((v_index - 1) / 5) * 25;
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
    if jsonb_typeof(p_payload->'index') is distinct from 'number' or (p_payload->>'index') !~ '^[1-9][0-9]*$' then
      raise exception 'invalid_home_item' using errcode = '22023';
    end if;
    v_index := (p_payload->>'index')::integer;
    if v_category is null or v_category not in ('Furniture','Etc') or v_index is null or
      v_index < 1 or v_index > (pawhaven_private.home_max_index(v_category)) then
      raise exception 'invalid_home_item' using errcode = '22023';
    end if;
    v_price := case when v_category = 'Furniture' and v_index = 5 then 250 else 100 + v_index * 25 end;
    select quantity into v_quantity from public.economy_home_items where user_id = v_user and category = v_category and item_index = v_index;
    v_quantity := coalesce(v_quantity, pawhaven_private.home_initial_stock(v_category,v_index));
    if v_quantity >= 20 then
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
    if p_payload->>'petId' is null or p_payload->>'petId' not in ('corgi','myeongrang') then raise exception 'invalid_pet' using errcode='22023'; end if;
    if v_wallet.snacks=0 then v_result:='{"outcome":"snack_empty"}';
    elsif v_wallet.last_snack is not null and v_now<v_wallet.last_snack+interval '4 seconds' then v_result:='{"outcome":"snack_cooldown"}';
    else
      update public.economy_wallets set snacks=snacks-1,last_snack=v_now where user_id=v_user;
      v_result:=jsonb_build_object('outcome','fed','petId',p_payload->>'petId');
    end if;
  elsif p_action = 'claim_daily' then
    v_key := p_payload->>'quest';
    if v_key is null or v_key not in ('pet','run') then raise exception 'invalid_quest' using errcode = '22023'; end if;
    if (v_key = 'pet' and v_wallet.daily_pet >= 3) or (v_key = 'run' and v_wallet.daily_run >= 1) then
      v_reward := case when v_key = 'pet' then 50 else 100 end;
      insert into public.economy_claims values(v_user,'daily:' || v_wallet.quest_day || ':' || v_key) on conflict do nothing;
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        update public.economy_wallets set coins = least(1000000,coins + v_reward),snacks=least(99,snacks+1) where user_id = v_user;
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
  elsif p_action = 'run_start' then
    update public.economy_runs set consumed = true where user_id = v_user and not consumed;
    v_run := gen_random_uuid();
    insert into public.economy_runs(id,user_id,started_at,expires_at) values(v_run,v_user,v_now,v_now + interval '15 minutes');
    v_result := jsonb_build_object('outcome','started','run_id',v_run);
  elsif p_action = 'run_finish' then
    v_run := (p_payload->>'run_id')::uuid;
    update public.economy_runs set consumed = true where id = v_run and user_id = v_user and not consumed
      and v_now >= started_at + interval '4 seconds' and v_now <= expires_at;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then v_result := '{"outcome":"run_rejected"}';
    else
      update public.economy_wallets set xp = least(400,xp + 100), daily_run = 1 where user_id = v_user;
      v_result := '{"outcome":"finished"}';
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
revoke all on function public.economy_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.economy_command(text,uuid,jsonb) to authenticated;

create or replace function public.send_player_mail(p_user uuid,p_delivery_key text,p_title text,p_body text,p_rewards jsonb default '{}',p_expires_at timestamptz default now()+interval '30 days')
returns uuid language plpgsql security definer set search_path='' as $$
declare reward jsonb; key text; result uuid;
begin
 if p_user is null or p_delivery_key is null or char_length(p_delivery_key) not between 1 and 100
 or p_title is null or char_length(btrim(p_title)) not between 1 and 80 or p_body is null or char_length(btrim(p_body)) not between 1 and 2000
 or p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '366 days'
 or p_rewards is null or jsonb_typeof(p_rewards)<>'object' or octet_length(p_rewards::text)>8000 then raise exception 'invalid_mail' using errcode='22023';end if;
 for key in select jsonb_object_keys(p_rewards) loop
  if key not in ('coins','snacks','items','home') then raise exception 'invalid_rewards' using errcode='22023';end if;
 end loop;
 for key in select unnest(array['coins','snacks']) loop
  if p_rewards ? key then
   if jsonb_typeof(p_rewards->key)<>'number' or (p_rewards->>key)!~'^[0-9]{1,6}$' then raise exception 'invalid_rewards' using errcode='22023';end if;
   if (p_rewards->>key)::integer>(case when key='coins' then 100000 else 99 end) then raise exception 'invalid_rewards' using errcode='22023';end if;
  end if;
 end loop;
 if jsonb_typeof(coalesce(p_rewards->'items','[]'))<>'array' or jsonb_typeof(coalesce(p_rewards->'home','[]'))<>'array' then raise exception 'invalid_rewards' using errcode='22023';end if;
 if jsonb_array_length(coalesce(p_rewards->'items','[]'))>20 or jsonb_array_length(coalesce(p_rewards->'home','[]'))>20 then raise exception 'invalid_rewards' using errcode='22023';end if;
 for reward in select value from jsonb_array_elements(coalesce(p_rewards->'items','[]')) loop
  if jsonb_typeof(reward)<>'object' or coalesce(reward->>'category','') not in ('Hat','Body','Acc','Etc')
  or jsonb_typeof(reward->'index') is distinct from 'number' or coalesce(reward->>'index','')!~'^[0-9]{1,2}$' then raise exception 'invalid_rewards' using errcode='22023';end if;
  if (reward->>'index')::integer not between 1 and 20 then raise exception 'invalid_rewards' using errcode='22023';end if;
 end loop;
 for reward in select value from jsonb_array_elements(coalesce(p_rewards->'home','[]')) loop
  if jsonb_typeof(reward)<>'object' or coalesce(reward->>'category','') not in ('Furniture','Etc')
  or jsonb_typeof(reward->'index') is distinct from 'number' or jsonb_typeof(reward->'quantity') is distinct from 'number'
  or coalesce(reward->>'index','')!~'^[0-9]$' or coalesce(reward->>'quantity','')!~'^[0-9]{1,2}$' then raise exception 'invalid_rewards' using errcode='22023';end if;
  if (reward->>'index')::integer not between 1 and (pawhaven_private.home_max_index(reward->>'category'))
  or (reward->>'quantity')::integer not between 1 and 20 then raise exception 'invalid_rewards' using errcode='22023';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(coalesce(p_rewards->'home','[]')) r group by r->>'category',r->>'index' having count(*)>1) then raise exception 'duplicate_reward' using errcode='22023';end if;
 insert into public.player_mail(user_id,delivery_key,title,body,rewards,expires_at)
 values(p_user,p_delivery_key,btrim(p_title),btrim(p_body),p_rewards,p_expires_at)
 on conflict(user_id,delivery_key) do nothing returning id into result;
 if result is null then select id into result from public.player_mail where user_id=p_user and delivery_key=p_delivery_key;end if;
 return result;
end;$$;
revoke all on function public.send_player_mail(uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.send_player_mail(uuid,text,text,text,jsonb,timestamptz) to service_role;


create or replace function public.mailbox_command(p_action text default 'load',p_mail_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); mail public.player_mail; wallet public.economy_wallets; reward jsonb;
 v_coins integer; v_snacks integer; quantity integer; initial integer; blocked integer:=0; granted integer:=0; capacity boolean; outcome text:='loaded';
 total_coins integer:=0;total_snacks integer:=0;total_items integer:=0;total_home integer:=0;total_notices integer:=0;added integer;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501';end if;
 if p_action is null or p_action not in ('load','read','claim','claim_all') or (p_action in ('read','claim') and p_mail_id is null) then raise exception 'invalid_command' using errcode='22023';end if;
 -- Reuse the economy initializer and wallet lock; purchases/quest claims/mail cannot race.
 perform public.economy_command('load',gen_random_uuid());
 select * into strict wallet from public.economy_wallets where user_id=uid for update;
 if p_action='read' then update public.player_mail set read_at=coalesce(read_at,clock_timestamp()) where id=p_mail_id and user_id=uid;
 elsif p_action in ('claim','claim_all') then
  for mail in select * from public.player_mail where user_id=uid and claimed_at is null and expires_at>clock_timestamp()
   and (p_action='claim_all' or id=p_mail_id) order by created_at,id limit 100 for update loop
   v_coins:=coalesce((mail.rewards->>'coins')::integer,0);v_snacks:=coalesce((mail.rewards->>'snacks')::integer,0);
   capacity:=wallet.coins+v_coins>1000000 or wallet.snacks+v_snacks>99;
   for reward in select value from jsonb_array_elements(coalesce(mail.rewards->'home','[]')) loop
    initial:=pawhaven_private.home_initial_stock(reward->>'category',(reward->>'index')::integer);
    select coalesce((select i.quantity from public.economy_home_items i where i.user_id=uid and i.category=reward->>'category' and i.item_index=(reward->>'index')::integer),initial) into quantity;
    if quantity+(reward->>'quantity')::integer>20 then capacity:=true;end if;
   end loop;
   if capacity then blocked:=blocked+1;continue;end if;
   update public.economy_wallets set coins=economy_wallets.coins+v_coins,snacks=economy_wallets.snacks+v_snacks,revision=revision+1 where user_id=uid;
   total_coins:=total_coins+v_coins;total_snacks:=total_snacks+v_snacks;
   if v_coins=0 and v_snacks=0 and jsonb_array_length(coalesce(mail.rewards->'items','[]'))=0 and jsonb_array_length(coalesce(mail.rewards->'home','[]'))=0 then total_notices:=total_notices+1;end if;
   for reward in select value from jsonb_array_elements(coalesce(mail.rewards->'items','[]')) loop
    insert into public.economy_items(user_id,category,item_index)values(uid,reward->>'category',(reward->>'index')::integer) on conflict do nothing;
    get diagnostics added=row_count;total_items:=total_items+added;
   end loop;
   for reward in select value from jsonb_array_elements(coalesce(mail.rewards->'home','[]')) loop
    initial:=pawhaven_private.home_initial_stock(reward->>'category',(reward->>'index')::integer);
    insert into public.economy_home_items(user_id,category,item_index,quantity) values(uid,reward->>'category',(reward->>'index')::integer,initial+(reward->>'quantity')::integer)
    on conflict(user_id,category,item_index) do update set quantity=economy_home_items.quantity+(reward->>'quantity')::integer;
    total_home:=total_home+(reward->>'quantity')::integer;
   end loop;
   update public.player_mail set claimed_at=clock_timestamp(),read_at=coalesce(read_at,clock_timestamp()) where id=mail.id;
   granted:=granted+1;select * into strict wallet from public.economy_wallets where user_id=uid;
  end loop;
  outcome:=case when blocked>0 then 'capacity' when granted>0 then 'claimed' else 'unavailable' end;
 end if;
 return jsonb_build_object('outcome',outcome,'granted',granted,'blocked',blocked,'revision',wallet.revision,'now',clock_timestamp(),
 'received',jsonb_build_object('coins',total_coins,'snacks',total_snacks,'items',total_items,'home',total_home,'notices',total_notices),
 'pending',(select count(*) from public.player_mail where user_id=uid and claimed_at is null and expires_at>clock_timestamp()),
 'mail',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'body',m.body,'rewards',m.rewards,'createdAt',m.created_at,'expiresAt',m.expires_at,'readAt',m.read_at,'claimedAt',m.claimed_at) order by m.created_at desc,m.id)
  from(select * from public.player_mail where user_id=uid order by (claimed_at is null and expires_at>clock_timestamp()) desc,created_at desc,id limit 100)m),'[]'::jsonb));
end;$$;
revoke all on function public.mailbox_command(text,uuid) from public,anon;
grant execute on function public.mailbox_command(text,uuid) to authenticated;

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
  'character',jsonb_build_object('petId',case when look->>'petId'='myeongrang' then 'myeongrang' else 'corgi' end,'outfit',clothes),
  'home',jsonb_build_object('version',2,'Background',case when home->>'Background' ~ '^[0-3]$' then (home->>'Background')::integer else 0 end,
  'Floor',case when home->>'Floor' ~ '^[0-3]$' then (home->>'Floor')::integer else 0 end,'items',items));
end;$$;
revoke all on function public.visit_friend_home(uuid) from public,anon;
grant execute on function public.visit_friend_home(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
