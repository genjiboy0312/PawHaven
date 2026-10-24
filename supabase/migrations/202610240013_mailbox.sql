-- SQL Editor query name: Player Mailbox and Rewards
begin;
create table if not exists public.player_mail (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 delivery_key text not null check(char_length(delivery_key) between 1 and 100),
 title text not null check(char_length(title) between 1 and 80),
 body text not null check(char_length(body) between 1 and 2000),
 rewards jsonb not null default '{}' check(jsonb_typeof(rewards)='object'),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days',
 read_at timestamptz,claimed_at timestamptz,
 unique(user_id,delivery_key)
);
create index if not exists player_mail_owner_time on public.player_mail(user_id,created_at desc);
alter table public.player_mail enable row level security;
revoke all on public.player_mail from public,anon,authenticated;

-- Only trusted server delivery can choose reward contents. The browser cannot call this function.
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
  if (reward->>'index')::integer not between 1 and (case when reward->>'category'='Furniture' then 5 else 4 end)
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
    initial:=case when reward->>'category'='Furniture' and (reward->>'index')::integer=5 then 0 else 3 end;
    select coalesce((select i.quantity from public.economy_home_items i where i.user_id=uid and i.category=reward->>'category' and i.item_index=(reward->>'index')::integer),initial) into quantity;
    if quantity+(reward->>'quantity')::integer>20 then capacity:=true;end if;
   end loop;
   if capacity then blocked:=blocked+1;continue;end if;
   update public.economy_wallets set coins=economy_wallets.coins+v_coins,snacks=economy_wallets.snacks+v_snacks,revision=revision+1 where user_id=uid;
   for reward in select value from jsonb_array_elements(coalesce(mail.rewards->'items','[]')) loop
    insert into public.economy_items(user_id,category,item_index)values(uid,reward->>'category',(reward->>'index')::integer) on conflict do nothing;
   end loop;
   for reward in select value from jsonb_array_elements(coalesce(mail.rewards->'home','[]')) loop
    initial:=case when reward->>'category'='Furniture' and (reward->>'index')::integer=5 then 0 else 3 end;
    insert into public.economy_home_items(user_id,category,item_index,quantity) values(uid,reward->>'category',(reward->>'index')::integer,initial+(reward->>'quantity')::integer)
    on conflict(user_id,category,item_index) do update set quantity=economy_home_items.quantity+(reward->>'quantity')::integer;
   end loop;
   update public.player_mail set claimed_at=clock_timestamp(),read_at=coalesce(read_at,clock_timestamp()) where id=mail.id;
   granted:=granted+1;select * into strict wallet from public.economy_wallets where user_id=uid;
  end loop;
  outcome:=case when blocked>0 then 'capacity' when granted>0 then 'claimed' else 'unavailable' end;
 end if;
 return jsonb_build_object('outcome',outcome,'granted',granted,'blocked',blocked,'revision',wallet.revision,'now',clock_timestamp(),
 'pending',(select count(*) from public.player_mail where user_id=uid and claimed_at is null and expires_at>clock_timestamp()),
 'mail',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'body',m.body,'rewards',m.rewards,'createdAt',m.created_at,'expiresAt',m.expires_at,'readAt',m.read_at,'claimedAt',m.claimed_at) order by m.created_at desc,m.id)
  from(select * from public.player_mail where user_id=uid order by (claimed_at is null and expires_at>clock_timestamp()) desc,created_at desc,id limit 100)m),'[]'::jsonb));
end;$$;
revoke all on function public.mailbox_command(text,uuid) from public,anon;
grant execute on function public.mailbox_command(text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
