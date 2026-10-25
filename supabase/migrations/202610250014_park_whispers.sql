-- Query name: Park Whispers and Private Chat
begin;
alter table public.park_chat add column if not exists recipient_id uuid references auth.users(id) on delete cascade;
alter table public.park_chat add column if not exists recipient_name text;
-- Existing private table/RLS and RPC-only access remain in force.
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
    'messages',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from (select id,user_id,name,message,recipient_id,recipient_name from public.park_chat where channel=p_channel and (recipient_id is null or user_id=uid or recipient_id=uid) order by id desc limit 30)c),'[]'::jsonb));
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
