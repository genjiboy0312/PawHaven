begin;
create table if not exists public.mp_chat(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.mp_rooms(id) on delete cascade,
 sender uuid not null references auth.users(id) on delete cascade,
 nickname text not null, body text not null check(char_length(body) between 1 and 100),
 nonce uuid not null,created_at timestamptz not null default clock_timestamp(),
 unique(room_id,sender,nonce)
);
create index if not exists mp_chat_room_time on public.mp_chat(room_id,created_at desc,id);
alter table public.mp_chat enable row level security;
revoke all on public.mp_chat from public,anon,authenticated;

create or replace function public.can_receive_paw_chat(topic text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mp_members m join public.mp_rooms r on r.id=m.room_id
 where m.user_id=auth.uid() and m.seen_at>now()-interval '45 seconds' and r.phase='waiting'
 and topic='paw-chat:'||r.id::text);
$$;
revoke all on function public.can_receive_paw_chat(text) from public,anon;
grant execute on function public.can_receive_paw_chat(text) to authenticated;
drop policy if exists paw_chat_receive on realtime.messages;
create policy paw_chat_receive on realtime.messages for select to authenticated
using(extension='broadcast' and public.can_receive_paw_chat(realtime.topic()));
drop policy if exists paw_chat_read_guard on realtime.messages;
create policy paw_chat_read_guard on realtime.messages as restrictive for select to authenticated
using(realtime.topic() not like 'paw-chat:%' or public.can_receive_paw_chat(realtime.topic()));
drop policy if exists paw_chat_write_guard on realtime.messages;
create policy paw_chat_write_guard on realtime.messages as restrictive for insert to authenticated
with check(realtime.topic() not like 'paw-chat:%');

create or replace function public.room_chat_command(p_room uuid,p_action text default 'list',p_text text default '',p_nonce uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); member public.mp_members; content text; inserted uuid;
begin
 if actor is null then raise exception 'not_authenticated' using errcode='42501';end if;
 if p_action is null or p_action not in ('list','send') then raise exception 'invalid_action' using errcode='22023';end if;
 -- Use the lobby command's lock so start/leave and chat membership checks cannot race.
 perform pg_advisory_xact_lock(748201);
 select * into member from public.mp_members where user_id=actor and room_id=p_room and seen_at>clock_timestamp()-interval '45 seconds';
 if member.user_id is null or not exists(select 1 from public.mp_rooms where id=p_room and phase='waiting') then raise exception 'room_chat_unavailable' using errcode='42501';end if;
 if p_action='send' then
  content:=btrim(regexp_replace(coalesce(p_text,''),'[[:cntrl:]]',' ','g'));
  if p_nonce is null or char_length(content) not between 1 and 100 then raise exception 'invalid_chat' using errcode='22023';end if;
  if not exists(select 1 from public.mp_chat where room_id=p_room and sender=actor and nonce=p_nonce) then
   if exists(select 1 from public.mp_chat where room_id=p_room and sender=actor and created_at>clock_timestamp()-interval '1 second') then raise exception 'chat_slow' using errcode='P0001';end if;
   insert into public.mp_chat(room_id,sender,nickname,body,nonce)values(p_room,actor,member.nickname,content,p_nonce) returning id into inserted;
   begin
    perform realtime.send(jsonb_build_object('room',p_room),'message','paw-chat:'||p_room::text,true);
   exception when others then raise warning 'room_chat_stream_failed: %',sqlstate;end;
  end if;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'sender',c.sender,'name',c.nickname,'text',c.body,'at',c.created_at) order by c.created_at,c.id)
 from(select * from public.mp_chat m where m.room_id=p_room and not exists(select 1 from public.player_blocks b where (b.blocker=actor and b.blocked=m.sender) or (b.blocked=actor and b.blocker=m.sender)) order by m.created_at desc,m.id desc limit 30)c),'[]'::jsonb);
end;$$;
revoke all on function public.room_chat_command(uuid,text,text,uuid) from public,anon;
grant execute on function public.room_chat_command(uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
