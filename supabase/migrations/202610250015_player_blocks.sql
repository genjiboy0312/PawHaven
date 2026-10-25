-- Query name: Player Blocks and Chat Privacy
begin;
-- Also includes the preceding whisper schema, so applying this latest query is sufficient.
alter table public.park_chat add column if not exists recipient_id uuid references auth.users(id) on delete cascade;
alter table public.park_chat add column if not exists recipient_name text;
create table if not exists public.player_blocks(
 blocker uuid not null references auth.users(id) on delete cascade,
 blocked uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(blocker,blocked),check(blocker<>blocked)
);
create index if not exists player_blocks_target on public.player_blocks(blocked);
alter table public.player_blocks enable row level security;
revoke all on public.player_blocks from public,anon,authenticated;
create or replace function public.friends_command(p_action text default 'list',p_target uuid default null,p_query text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); lo uuid; hi uuid; link public.player_friendships%rowtype;
  query text := btrim(coalesce(p_query,'')); peers jsonb; matches jsonb := '[]'::jsonb;
begin
  if actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_action not in ('list','search','send','accept','reject','cancel','remove','block','unblock') or p_action is null then
    raise exception 'friend_invalid_action';
  end if;
  if p_action='search' and query !~ '^[A-Za-z0-9가-힣_]{2,16}$' then raise exception 'friend_invalid_query'; end if;
  if p_action not in ('list','search') then
    if p_target is null or p_target=actor then raise exception 'friend_invalid_target'; end if;
    -- Same lightweight write serialization used by the multiplayer command API.
    if p_action in ('block','unblock') then perform pg_advisory_xact_lock(7240412); end if;
    perform pg_advisory_xact_lock(748202);
    lo:=least(actor,p_target); hi:=greatest(actor,p_target);
    if not exists(select 1 from public.player_profiles where user_id=actor and nickname is not null) then
      raise exception 'friend_nickname_required';
    end if;
    select * into link from public.player_friendships where user_low=lo and user_high=hi;
    if p_action in ('send','accept') and exists(select 1 from public.player_blocks where (blocker=actor and blocked=p_target) or (blocker=p_target and blocked=actor)) then raise exception 'friend_blocked'; end if;
    if p_action='block' then
      if not exists(select 1 from public.player_profiles where user_id=p_target and nickname is not null) then raise exception 'friend_not_found'; end if;
      if not exists(select 1 from public.player_blocks where blocker=actor and blocked=p_target) and (select count(*) from public.player_blocks where blocker=actor)>=100 then raise exception 'friend_limit'; end if;
      insert into public.player_blocks(blocker,blocked) values(actor,p_target) on conflict do nothing;
      delete from public.player_friendships where user_low=lo and user_high=hi;
      if to_regclass('public.friend_room_invites') is not null then
        delete from public.friend_room_invites where (sender=actor and recipient=p_target) or (sender=p_target and recipient=actor);
      end if;
    elsif p_action='unblock' then
      delete from public.player_blocks where blocker=actor and blocked=p_target;
    elsif p_action='send' then
      if not exists(select 1 from public.player_profiles where user_id=p_target and nickname is not null) then raise exception 'friend_not_found'; end if;
      if link.user_low is not null then
        if link.status='pending' and link.requested_by<>actor then raise exception 'friend_incoming'; end if;
      else
        if (select count(*) from public.player_friendships where status='pending' and requested_by=actor)>=20
          or (select count(*) from public.player_friendships where status='pending' and p_target in (user_low,user_high) and requested_by<>p_target)>=100
          or (select count(*) from public.player_friendships where status='accepted' and actor in (user_low,user_high))>=100
          or (select count(*) from public.player_friendships where status='accepted' and p_target in (user_low,user_high))>=100 then raise exception 'friend_limit'; end if;
        insert into public.player_friendships(user_low,user_high,requested_by) values(lo,hi,actor);
      end if;
    elsif p_action='accept' then
      if link.user_low is null or (link.status='pending' and link.requested_by=actor) then raise exception 'friend_not_found'; end if;
      if link.status='pending' then
        if (select count(*) from public.player_friendships where status='accepted' and actor in (user_low,user_high))>=100
          or (select count(*) from public.player_friendships where status='accepted' and p_target in (user_low,user_high))>=100 then raise exception 'friend_limit'; end if;
        update public.player_friendships set status='accepted' where user_low=lo and user_high=hi;
      end if;
    elsif p_action in ('reject','cancel') then
      if link.user_low is not null then
        if link.status<>'pending' or (p_action='reject' and link.requested_by=actor) or (p_action='cancel' and link.requested_by<>actor) then raise exception 'friend_not_found'; end if;
        delete from public.player_friendships where user_low=lo and user_high=hi;
      end if;
    elsif p_action='remove' then
      if link.user_low is not null and link.status<>'accepted' then raise exception 'friend_not_found'; end if;
      delete from public.player_friendships where user_low=lo and user_high=hi;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'nickname',p.nickname,'relation',
    case when f.status='accepted' then 'friend' when f.requested_by=actor then 'outgoing' else 'incoming' end)
    order by lower(p.nickname),p.user_id),'[]'::jsonb) into peers
  from public.player_friendships f join public.player_profiles p
    on p.user_id=case when f.user_low=actor then f.user_high else f.user_low end
  where actor in (f.user_low,f.user_high);
  if query ~ '^[A-Za-z0-9가-힣_]{2,16}$' then
    select coalesce(jsonb_agg(jsonb_build_object('id',q.user_id,'nickname',q.nickname,'relation',
      coalesce((select e->>'relation' from jsonb_array_elements(peers) e where e->>'id'=q.user_id::text),'none'))
      order by lower(q.nickname),q.user_id),'[]'::jsonb) into matches
    from (select user_id,nickname from public.player_profiles
      where user_id<>actor and nickname is not null and left(lower(nickname),length(query))=lower(query) and not exists(select 1 from public.player_blocks b where (b.blocker=actor and b.blocked=user_id) or (b.blocker=user_id and b.blocked=actor))
      order by lower(nickname),user_id limit 20) q;
  end if;
  return jsonb_build_object(
    'friends',coalesce((select jsonb_agg(e) from jsonb_array_elements(peers) e where e->>'relation'='friend'),'[]'::jsonb),
    'incoming',coalesce((select jsonb_agg(e) from jsonb_array_elements(peers) e where e->>'relation'='incoming'),'[]'::jsonb),
    'outgoing',coalesce((select jsonb_agg(e) from jsonb_array_elements(peers) e where e->>'relation'='outgoing'),'[]'::jsonb),
    'matches',matches,
    'blocked',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'nickname',p.nickname,'relation','blocked') order by lower(p.nickname),p.user_id) from public.player_blocks b join public.player_profiles p on p.user_id=b.blocked where b.blocker=actor),'[]'::jsonb));
end;
$$;
revoke all on function public.friends_command(text,uuid,text) from public,anon;
grant execute on function public.friends_command(text,uuid,text) to authenticated;


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
    values(uid,p_channel,p_session,coalesce((select snapshot->'character' from public.player_saves where user_id=uid),'{}'))
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

create or replace function public.park_whisper(p_channel integer,p_session uuid,p_target uuid,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); mine public.park_members; target_name text; nickname text; msg text;
begin
 -- Reuse the same lock, session validation, heartbeat and history cleanup as public chat.
 perform public.park_command('sync',p_channel,p_session);
 if p_target is null or p_target=uid then raise exception 'whisper_target_left'; end if;
 select p.nickname into target_name from public.park_members m join public.player_profiles p on p.user_id=m.user_id
 where m.user_id=p_target and m.channel=p_channel and m.seen_at>clock_timestamp()-interval '45 seconds';
 if target_name is null then raise exception 'whisper_target_left'; end if;
 if exists(select 1 from public.player_blocks where (blocker=uid and blocked=p_target) or (blocker=p_target and blocked=uid)) then raise exception 'friend_blocked'; end if;
 select * into mine from public.park_members where user_id=uid;
 msg:=btrim(regexp_replace(coalesce(p_text,''),'[[:cntrl:]]',' ','g'));
 if char_length(msg) not between 1 and 100 then raise exception 'invalid_message'; end if;
 if mine.last_chat>clock_timestamp()-interval '2 seconds' then raise exception 'chat_cooldown'; end if;
 select p.nickname into nickname from public.player_profiles p where user_id=uid;
 insert into public.park_chat(channel,user_id,name,message,recipient_id,recipient_name)
 values(p_channel,uid,nickname,msg,p_target,target_name);
 update public.park_members set last_chat=clock_timestamp() where user_id=uid;
 return public.park_command('sync',p_channel,p_session);
end;$$;
revoke all on function public.park_whisper(integer,uuid,uuid,text) from public,anon;
grant execute on function public.park_whisper(integer,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
