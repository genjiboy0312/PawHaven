-- SQL Editor query name: Daily Visit Reward Mail
-- Requires Garden Props Shop (021). Existing mail, receipts and economy functions are preserved.
begin;
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
 'mail',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'body',m.body,'kind',case when m.delivery_key like 'attendance:%' then 'attendance' else 'system' end,'rewards',m.rewards,'createdAt',m.created_at,'expiresAt',m.expires_at,'readAt',m.read_at,'claimedAt',m.claimed_at) order by m.created_at desc,m.id)
  from(select * from public.player_mail where user_id=uid order by (claimed_at is null and expires_at>clock_timestamp()) desc,created_at desc,id limit 100)m),'[]'::jsonb));
end;$$;
revoke all on function public.mailbox_command(text,uuid) from public,anon;
grant execute on function public.mailbox_command(text,uuid) to authenticated;


-- No caller-selected user, date, amount or delivery key. The same wallet-before-mail lock order
-- as normal claims serializes devices; the existing unique(user_id,delivery_key) prevents duplicates.
create or replace function public.daily_attendance_mail()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); stamp timestamptz; today date;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501';end if;
 perform public.economy_command('load',gen_random_uuid());
 stamp:=clock_timestamp();today:=(stamp at time zone 'Asia/Seoul')::date;
 perform public.send_player_mail(uid,'attendance:'||today::text,'Daily Visit Gift',
  'Thank you for visiting today! Receive this mail to collect 30 Coins. One gift per Korean calendar day.',
  jsonb_build_object('coins',30),stamp+interval '30 days');
 return public.mailbox_command('load');
end;$$;
revoke all on function public.daily_attendance_mail() from public,anon;
grant execute on function public.daily_attendance_mail() to authenticated;
notify pgrst,'reload schema';
commit;
