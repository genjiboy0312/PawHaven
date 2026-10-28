-- SQL Editor query name: Invite Only Multiplayer Rooms
-- Requires Friend Invites (010) and Sunset Crossroads (018). Existing rooms remain public.
begin;
alter table public.mp_rooms add column if not exists visibility text not null default 'public' check(visibility in ('public','invite'));
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
   look:=jsonb_build_object('petId',case when look->>'petId'='myeongrang' then 'myeongrang' else 'corgi' end,'outfit',clothes);
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

create or replace function public.friend_activity(p_action text default 'poll',p_target uuid default null,p_mode text default 'lobby',p_ticket uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); stamp timestamptz:=clock_timestamp(); inv public.friend_room_invites%rowtype;
 target_room uuid; people jsonb; invitations jsonb; cooldowns jsonb;
begin
 if actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('poll','invite','accept','decline') or p_mode is null or p_mode not in ('lobby','playing') then raise exception 'invite_invalid'; end if;
 insert into public.player_presence(user_id,mode,seen_at) values(actor,p_mode,stamp)
 on conflict(user_id) do update set mode=excluded.mode,seen_at=excluded.seen_at
 where player_presence.seen_at<stamp-interval '20 seconds' or player_presence.mode<>excluded.mode;
 if p_action<>'poll' then
   perform pg_advisory_xact_lock(748201);
   perform pg_advisory_xact_lock(748202);
   stamp:=clock_timestamp();
   if p_target is null or p_target=actor then raise exception 'invite_invalid'; end if;
   if p_action='invite' then
     if not exists(select 1 from public.player_friendships where user_low=least(actor,p_target) and user_high=greatest(actor,p_target) and status='accepted') then raise exception 'invite_not_friend'; end if;
     select r.id into target_room from public.mp_rooms r join public.mp_members m on m.room_id=r.id and m.user_id=actor
       where r.host=actor and r.phase='waiting' and m.seen_at>stamp-interval '45 seconds'
       and (select count(*) from public.mp_members where room_id=r.id and seen_at>stamp-interval '45 seconds')<4;
     if target_room is null then raise exception 'invite_room_unavailable'; end if;
     if not exists(select 1 from public.player_presence where user_id=p_target and mode='lobby' and seen_at>stamp-interval '75 seconds')
       or exists(select 1 from public.mp_members where user_id=p_target and seen_at>stamp-interval '45 seconds') then raise exception 'invite_player_busy'; end if;
     if exists(select 1 from public.friend_room_invites where sender=actor and recipient=p_target and sent_at>stamp-interval '30 seconds') then raise exception 'invite_cooldown'; end if;
     insert into public.friend_room_invites(sender,recipient,room_id,sent_at,expires_at,pending)
       values(actor,p_target,target_room,stamp,stamp+interval '60 seconds',true)
       on conflict(sender,recipient) do update set room_id=excluded.room_id,sent_at=excluded.sent_at,expires_at=excluded.expires_at,pending=true,ticket=excluded.ticket;
   else
     select * into inv from public.friend_room_invites where sender=p_target and recipient=actor;
     if inv.sender is null or inv.ticket is distinct from p_ticket then raise exception 'invite_expired'; end if;
     if p_action='accept' then
       if not inv.pending and exists(select 1 from public.mp_members where user_id=actor and room_id=inv.room_id) then
         return jsonb_build_object('people','[]'::jsonb,'invitations','[]'::jsonb,'cooldowns','[]'::jsonb,'joined',inv.room_id,'now',extract(epoch from stamp)*1000);
       end if;
       if inv.sender is null or not inv.pending or inv.expires_at<=stamp or p_mode<>'lobby'
         or not exists(select 1 from public.player_friendships where user_low=least(actor,p_target) and user_high=greatest(actor,p_target) and status='accepted')
         or not exists(select 1 from public.mp_rooms r join public.mp_members m on m.room_id=r.id and m.user_id=p_target where r.id=inv.room_id and r.host=p_target and r.phase='waiting' and m.seen_at>stamp-interval '45 seconds')
         then raise exception 'invite_expired'; end if;
       if exists(select 1 from public.mp_members where user_id=actor and seen_at>stamp-interval '45 seconds') then raise exception 'invite_player_busy'; end if;
       -- The last seat and invitation consumption commit together.
       perform public.multiplayer_command('join',inv.room_id,jsonb_build_object('invite_ticket',inv.ticket));
       target_room:=inv.room_id;
     end if;
     update public.friend_room_invites set pending=false where sender=p_target and recipient=actor;
   end if;
   delete from public.friend_room_invites where expires_at<stamp-interval '1 day';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.peer,'state',case
   when p.seen_at is null or p.seen_at<=stamp-interval '75 seconds' then 'offline'
   when p.mode='playing' then 'playing'
   when exists(select 1 from public.mp_members m where m.user_id=f.peer and m.seen_at>stamp-interval '45 seconds') then 'room'
   else 'lobby' end)),'[]'::jsonb) into people
 from (select case when user_low=actor then user_high else user_low end peer from public.player_friendships where actor in(user_low,user_high) and status='accepted') f
 left join public.player_presence p on p.user_id=f.peer;
 select coalesce(jsonb_agg(jsonb_build_object('sender',i.sender,'nickname',p.nickname,'room',r.id,'name',r.name,'ticket',i.ticket,'expires',extract(epoch from i.expires_at)*1000) order by i.sent_at),'[]'::jsonb) into invitations
 from public.friend_room_invites i join public.mp_rooms r on r.id=i.room_id join public.player_profiles p on p.user_id=i.sender
 where i.recipient=actor and i.pending and i.expires_at>stamp and p_mode='lobby' and r.host=i.sender and r.phase='waiting'
   and exists(select 1 from public.mp_members m where m.user_id=i.sender and m.room_id=r.id and m.seen_at>stamp-interval '45 seconds')
   and (select count(*) from public.mp_members m where m.room_id=r.id and m.seen_at>stamp-interval '45 seconds')<4
   and not exists(select 1 from public.mp_members where user_id=actor and seen_at>stamp-interval '45 seconds')
   and exists(select 1 from public.player_friendships where user_low=least(actor,i.sender) and user_high=greatest(actor,i.sender) and status='accepted');
 select coalesce(jsonb_agg(jsonb_build_object('id',recipient,'until',extract(epoch from sent_at+interval '30 seconds')*1000)),'[]'::jsonb) into cooldowns
 from (select recipient,sent_at from public.friend_room_invites where sender=actor and sent_at>stamp-interval '30 seconds' order by sent_at desc limit 100) recent;
 -- Recover an accepted invite if its committed response was lost in transit.
 if p_action='poll' and p_mode='lobby' then
   select m.room_id into target_room from public.mp_members m where m.user_id=actor and m.seen_at>stamp-interval '45 seconds'
     and exists(select 1 from public.friend_room_invites i where i.recipient=actor and i.room_id=m.room_id and not i.pending and i.expires_at>stamp);
 end if;
 return jsonb_build_object('people',people,'invitations',invitations,'cooldowns',cooldowns,'joined',target_room,'now',extract(epoch from stamp)*1000);
end;
$$;
revoke all on function public.friend_activity(text,uuid,text,uuid) from public,anon;
grant execute on function public.friend_activity(text,uuid,text,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
