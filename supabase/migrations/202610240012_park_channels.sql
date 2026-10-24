-- Query name: Park Channels and Chat
begin;
create table if not exists public.park_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 channel integer not null check(channel between 1 and 4),
 session uuid not null, seen_at timestamptz not null default now(),
 last_chat timestamptz, look jsonb not null default '{}'::jsonb
);
create table if not exists public.park_chat (
 id bigint generated always as identity primary key,
 channel integer not null check(channel between 1 and 4),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null, message text not null check(char_length(message) between 1 and 100),
 created_at timestamptz not null default now()
);
create index if not exists park_chat_channel_time on public.park_chat(channel,created_at);
alter table public.park_members enable row level security;
alter table public.park_chat enable row level security;
revoke all on public.park_members,public.park_chat from public,anon,authenticated;

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
    'messages',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from (select id,user_id,name,message from public.park_chat where channel=p_channel order by id desc limit 30)c),'[]'::jsonb));
 end if;
 return result;
end;$$;
revoke all on function public.park_command(text,integer,uuid,text) from public,anon;
grant execute on function public.park_command(text,integer,uuid,text) to authenticated;

create or replace function public.can_use_paw_park(topic text,sending boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.park_members me join public.park_members actor on actor.channel=me.channel
 where me.user_id=auth.uid() and me.seen_at>now()-interval '45 seconds' and actor.seen_at>now()-interval '45 seconds'
 and topic='paw-park:'||me.channel::text||':'||actor.user_id::text||':'||actor.session::text
 and (not sending or actor.user_id=auth.uid()));
$$;
revoke all on function public.can_use_paw_park(text,boolean) from public,anon;
grant execute on function public.can_use_paw_park(text,boolean) to authenticated;
drop policy if exists paw_park_receive on realtime.messages;
create policy paw_park_receive on realtime.messages for select to authenticated using(extension='broadcast' and public.can_use_paw_park(realtime.topic(),false));
drop policy if exists paw_park_send on realtime.messages;
create policy paw_park_send on realtime.messages for insert to authenticated with check(extension='broadcast' and public.can_use_paw_park(realtime.topic(),true));
drop policy if exists paw_park_read_guard on realtime.messages;
create policy paw_park_read_guard on realtime.messages as restrictive for select to authenticated using(realtime.topic() not like 'paw-park:%' or public.can_use_paw_park(realtime.topic(),false));
drop policy if exists paw_park_write_guard on realtime.messages;
create policy paw_park_write_guard on realtime.messages as restrictive for insert to authenticated with check(realtime.topic() not like 'paw-park:%' or public.can_use_paw_park(realtime.topic(),true));
grant select,insert on realtime.messages to authenticated;
notify pgrst,'reload schema';
commit;
