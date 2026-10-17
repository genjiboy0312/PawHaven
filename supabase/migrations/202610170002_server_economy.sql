-- Server-owned Season 0 prototype economy. No real payments or imported client balances.
begin;
create schema if not exists pawhaven_private;
revoke all on schema pawhaven_private from public, anon, authenticated;
create table if not exists public.economy_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins integer not null default 1000 check (coins between 0 and 1000000),
  xp integer not null default 0 check (xp between 0 and 400),
  premium boolean not null default false,
  quest_day date not null default (now() at time zone 'Asia/Seoul')::date,
  daily_pet smallint not null default 0 check (daily_pet between 0 and 3),
  daily_run smallint not null default 0 check (daily_run between 0 and 1),
  last_pet timestamptz,
  revision bigint not null default 0,
  request_window timestamptz not null default now(),
  request_count integer not null default 0
);
create table if not exists public.economy_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('Hat','Body','Acc','Etc')),
  item_index smallint not null check (item_index between 1 and 20),
  primary key(user_id,category,item_index)
);
create table if not exists public.economy_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_key text not null,
  primary key(user_id,claim_key)
);
create table if not exists public.economy_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  command text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
create table if not exists public.economy_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  consumed boolean not null default false
);
create index if not exists economy_runs_active on public.economy_runs(user_id) where not consumed;

alter table public.economy_wallets enable row level security;
alter table public.economy_items enable row level security;
alter table public.economy_claims enable row level security;
alter table public.economy_requests enable row level security;
alter table public.economy_runs enable row level security;
revoke all on public.economy_wallets, public.economy_items, public.economy_claims,
  public.economy_requests, public.economy_runs from public, anon, authenticated;
grant select on public.economy_wallets, public.economy_items, public.economy_claims to authenticated;
drop policy if exists economy_wallet_read on public.economy_wallets;
create policy economy_wallet_read on public.economy_wallets for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists economy_item_read on public.economy_items;
create policy economy_item_read on public.economy_items for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists economy_claim_read on public.economy_claims;
create policy economy_claim_read on public.economy_claims for select to authenticated using ((select auth.uid()) = user_id);

create or replace function pawhaven_private.economy_snapshot(p_user uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'coins', w.coins, 'xp', w.xp, 'premium', w.premium,
    'items', coalesce((select jsonb_agg(i.category || ':' || i.item_index order by i.category, i.item_index)
      from public.economy_items i where i.user_id = p_user), '[]'::jsonb),
    'claimed', coalesce((select jsonb_agg(replace(c.claim_key,'pass:season0:','') order by c.claim_key)
      from public.economy_claims c where c.user_id = p_user and c.claim_key like 'pass:season0:%'), '[]'::jsonb),
    'daily', jsonb_build_object(
      'day', w.quest_day::text, 'pet', w.daily_pet, 'run', w.daily_run,
      'claimed', coalesce((select jsonb_agg(split_part(c.claim_key,':',3) order by c.claim_key)
        from public.economy_claims c where c.user_id = p_user and c.claim_key like 'daily:' || w.quest_day || ':%'), '[]'::jsonb),
      'lastPet', case when w.last_pet is null then null else floor(extract(epoch from w.last_pet) * 1000)::bigint end
    )
  ) from public.economy_wallets w where w.user_id = p_user;
$$;
revoke all on function pawhaven_private.economy_snapshot(uuid) from public, anon, authenticated;

-- Identity, prices, rewards, day boundaries and entitlement are derived on the server.
-- Definer is required because clients have no direct economy write permissions.
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
  v_key text;
  v_reward integer;
  v_tier integer;
  v_premium boolean;
  v_run uuid;
  v_rows integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_request_id is null or p_action is null or p_action not in
    ('load','buy','pet','claim_daily','claim_pass','unlock_pass','run_start','run_finish') then
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
  elsif p_action = 'pet' then
    if v_wallet.daily_pet < 3 and (v_wallet.last_pet is null or v_now >= v_wallet.last_pet + interval '10 seconds') then
      update public.economy_wallets set daily_pet = daily_pet + 1, last_pet = v_now where user_id = v_user;
      v_result := '{"outcome":"recorded"}';
    end if;
  elsif p_action = 'claim_daily' then
    v_key := p_payload->>'quest';
    if v_key is null or v_key not in ('pet','run') then raise exception 'invalid_quest' using errcode = '22023'; end if;
    if (v_key = 'pet' and v_wallet.daily_pet >= 3) or (v_key = 'run' and v_wallet.daily_run >= 1) then
      v_reward := case when v_key = 'pet' then 50 else 100 end;
      insert into public.economy_claims values(v_user,'daily:' || v_wallet.quest_day || ':' || v_key) on conflict do nothing;
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        update public.economy_wallets set coins = least(1000000,coins + v_reward) where user_id = v_user;
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
commit;
