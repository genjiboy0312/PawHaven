-- Multiplayer Coin Rush. Run after Terraced Survival Map (039).
-- No economy writes: this prototype does not grant currency, XP, or quest progress.
begin;
alter table public.mp_rooms drop constraint if exists mp_rooms_map_check;
alter table public.mp_rooms add constraint mp_rooms_map_check check (map in ('garden','practice','crossroads','survival','terraces','coinRush'));
alter table public.mp_racers add column if not exists coin_mask integer not null default 0 check (coin_mask between 0 and 4095);
alter table public.mp_racers add column if not exists coin_finished_ms integer check (coin_finished_ms between 0 and 30000);
create or replace function public.multiplayer_command(p_action text, p_room uuid default null, p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid(); stamp timestamptz := clock_timestamp(); r public.mp_rooms%rowtype;
 mine public.mp_members%rowtype; target uuid; n integer; out_room jsonb := null; out_list jsonb;
 look jsonb; clothes jsonb := '{}'; cat text; choice integer; v_name text; v_pose jsonb; finish_x integer; submitted_mask integer; sample_ms integer; server_ms integer;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 if p_action not in ('list','sync','create','join','leave','ready','map','start','loaded','pose','finish','eliminate','return') then raise exception 'invalid_action' using errcode='22023'; end if;
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
 update public.mp_rooms r0 set phase='results' where phase='playing' and map not in ('survival','terraces','coinRush') and
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
   if p_action='sync' then return jsonb_build_object('coinRushReady',true,'terracesReady',true,'survivalReady',true,'privateRoomsReady',true,'room',null,'rooms','[]'::jsonb,'now',extract(epoch from stamp)*1000); end if;
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
     if p_payload->>'round' is distinct from r.round_id::text or
        (r.phase not in ('playing','countdown') and not (r.map='coinRush' and r.phase='results' and p_action='pose')) then
       raise exception 'stale_round' using errcode='P0001';
     end if;
     if p_action='pose' and r.phase='playing' and not exists(select 1 from public.mp_racers where room_id=target and user_id=uid and (finished_ms is not null or eliminated_ms is not null)) then
       finish_x:=case r.map when 'coinRush' then 1080 when 'terraces' then 1080 when 'survival' then 1080 when 'garden' then 6500 when 'crossroads' then 5700 else 2520 end;
       v_pose:=jsonb_build_object('x',greatest(120,least(finish_x,(p_payload->>'x')::numeric)), 'height',greatest(-200,least(300,(p_payload->>'height')::numeric)),
         'direction',case when p_payload->>'direction'='-1' then -1 else 1 end,'action',case when p_payload->>'action' in ('idle','run','jump','fall','land','attack','skill') then p_payload->>'action' else 'idle' end,
         'progress',greatest(0,least(1,coalesce((p_payload->>'progress')::numeric,0))),'vx',greatest(-1800,least(1800,coalesce((p_payload->>'vx')::numeric,0))));
       update public.mp_members set pose=v_pose where user_id=uid;
       -- The caller can only report its own pickups, once per coin and round.
       if r.map='coinRush' and p_payload ? 'coinMask' and stamp<r.ends_at+interval '1200 milliseconds' then
         if jsonb_typeof(p_payload->'coinMask') is distinct from 'number' or p_payload->>'coinMask' !~ '^[0-9]{1,4}$'
            or jsonb_typeof(p_payload->'coinTime') is distinct from 'number' or p_payload->>'coinTime' !~ '^[0-9]{1,5}$' then
           raise exception 'invalid_coin_rush_score' using errcode='22023';
         end if;
         submitted_mask:=(p_payload->>'coinMask')::integer;
         sample_ms:=(p_payload->>'coinTime')::integer;
         server_ms:=greatest(0,floor(extract(epoch from(stamp-r.starts_at))*1000));
         if submitted_mask not between 1 and 4095 or sample_ms not between 0 and 30000 or sample_ms>server_ms+250 then
           raise exception 'invalid_coin_rush_score' using errcode='22023';
         end if;
         update public.mp_racers a set
           coin_mask=a.coin_mask | submitted_mask,
           coin_finished_ms=case when (a.coin_mask | submitted_mask)=4095
             then coalesce(a.coin_finished_ms,least(30000,greatest(sample_ms,server_ms-1200))) else null end
         where a.room_id=target and a.user_id=uid and not a.disconnected and a.coin_finished_ms is null;
       end if;
     elsif p_action='finish' then
       finish_x:=case r.map when 'coinRush' then 1080 when 'terraces' then 1080 when 'survival' then 1080 when 'garden' then 6500 when 'crossroads' then 5700 else 2520 end;
       if r.map in ('survival','terraces','coinRush') or r.phase<>'playing' or stamp<r.starts_at+interval '4 seconds' or (mine.pose->>'x')::numeric<finish_x-25 or (mine.pose->>'height')::numeric<0 then raise exception 'invalid_finish' using errcode='P0001'; end if;
       update public.mp_racers set finished_ms=floor(extract(epoch from(stamp-r.starts_at))*1000) where room_id=target and user_id=uid and finished_ms is null;
       update public.mp_rooms set ends_at=least(ends_at,stamp+interval '20 seconds') where id=target;
     end if;
   elsif p_action='eliminate' then
     if r.map not in ('survival','terraces') or r.phase<>'playing' or p_payload->>'round' is distinct from r.round_id::text or stamp<r.starts_at then
       raise exception 'invalid_elimination' using errcode='P0001';
     end if;
     if jsonb_typeof(p_payload->'height') is distinct from 'number' or (p_payload->>'height')::numeric > -150 then
       raise exception 'invalid_elimination' using errcode='22023';
     end if;
     update public.mp_racers set eliminated_ms=least(60000,greatest(0,floor(extract(epoch from(stamp-r.starts_at))*1000)))
       where room_id=target and user_id=uid and eliminated_ms is null;
   elsif p_action='return' then
     if r.phase<>'results' then raise exception 'not_finished' using errcode='P0001'; end if;
     update public.mp_members set returned=true,ready=false where user_id=uid;
   end if;
 end if;
 -- All current members must have rendered the race scene before scheduling a shared start.
 -- Two seconds of delivery lead-in, five digits, then one second of Ready~.
 update public.mp_rooms waiting set starts_at=stamp+interval '8 seconds',ends_at=stamp+case when waiting.map='coinRush' then interval '38 seconds' when waiting.map in ('survival','terraces') then interval '68 seconds' else interval '128 seconds' end
 where waiting.phase='countdown' and waiting.starts_at is null
 and (select count(*) from public.mp_members m where m.room_id=waiting.id)>=2
 and not exists(select 1 from public.mp_members m where m.room_id=waiting.id and m.loaded_round is distinct from waiting.round_id);
 -- A survival round is resolved by server membership and time, never by a racing finish.
 with ended as (
   update public.mp_rooms arena set phase='results'
   where arena.map in ('survival','terraces') and arena.phase='playing'
     and (arena.ends_at<=stamp or (stamp>=arena.starts_at+interval '1 second' and
       (select count(*) from public.mp_racers a where a.room_id=arena.id and a.eliminated_ms is null and not a.disconnected)<=1))
   returning id,starts_at
 ) update public.mp_racers a set finished_ms=coalesce(a.eliminated_ms,least(60000,greatest(0,floor(extract(epoch from(stamp-ended.starts_at))*1000))))
   from ended where a.room_id=ended.id;
 -- The 30-second play window is followed by a short delivery window for the last pickups.
 update public.mp_rooms arena set phase='results'
 where arena.map='coinRush' and arena.phase='playing'
   and (arena.ends_at+interval '1200 milliseconds'<=stamp or
     not exists(select 1 from public.mp_racers a where a.room_id=arena.id and not a.disconnected and a.coin_finished_ms is null));
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'map',l.map,'phase',l.phase,'count',l.members) order by l.created_at desc),'[]'::jsonb) into out_list
 from (select a.*, (select count(*) from public.mp_members b where b.room_id=a.id) members from public.mp_rooms a where a.visibility='public' order by a.created_at desc limit 80) l;
 select * into mine from public.mp_members where user_id=uid;
 if mine.user_id is not null then
   select * into r from public.mp_rooms where id=mine.room_id;
   out_room:=jsonb_build_object('id',r.id,'name',r.name,'host',r.host,'visibility',r.visibility,'map',r.map,'phase',r.phase,'round',r.round_id,'startsAt',extract(epoch from r.starts_at)*1000,
     'endsAt',extract(epoch from r.ends_at)*1000,'members',(select jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.nickname,'level',pawhaven_private.account_level(coalesce((select w.account_xp from public.economy_wallets w where w.user_id=m.user_id),0)),'look',m.look,'ready',m.ready,'returned',m.returned,'pose',m.pose) order by m.joined_at,m.user_id) from public.mp_members m where m.room_id=r.id),
     'racers',coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'name',a.nickname,'time',a.finished_ms,'left',a.disconnected,'eliminatedMs',a.eliminated_ms,'coinMask',a.coin_mask,'coinFinishMs',a.coin_finished_ms,'winner',r.map in ('survival','terraces') and r.phase='results' and a.eliminated_ms is null and not a.disconnected) order by a.finished_ms nulls last,a.nickname) from public.mp_racers a where a.room_id=r.id),'[]'::jsonb));
 end if;
 return jsonb_build_object('coinRushReady',true,'terracesReady',true,'survivalReady',true,'privateRoomsReady',true,'room',out_room,'rooms',out_list,'now',extract(epoch from stamp)*1000);
end;
$$;
revoke all on function public.multiplayer_command(text,uuid,jsonb) from public,anon;
grant execute on function public.multiplayer_command(text,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
