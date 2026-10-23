begin;
create table if not exists public.player_presence (
 user_id uuid primary key references auth.users(id) on delete cascade,
 mode text not null check(mode in ('lobby','playing')),
 seen_at timestamptz not null default clock_timestamp()
);
create table if not exists public.friend_room_invites (
 sender uuid not null references auth.users(id) on delete cascade,
 recipient uuid not null references auth.users(id) on delete cascade,
 room_id uuid not null references public.mp_rooms(id) on delete cascade,
 sent_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 pending boolean not null default true, ticket uuid not null default gen_random_uuid(),
 primary key(sender,recipient),check(sender<>recipient)
);
create index if not exists friend_invites_recipient on public.friend_room_invites(recipient);
alter table public.player_presence enable row level security;
alter table public.friend_room_invites enable row level security;
revoke all on public.player_presence,public.friend_room_invites from public,anon,authenticated;

-- Accepted friends see only coarse activity. Room admission uses the existing RPC.
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
       perform public.multiplayer_command('join',inv.room_id,'{}'::jsonb);
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
commit;
