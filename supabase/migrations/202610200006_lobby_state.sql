begin;
create or replace function public.can_receive_paw_lobby(topic text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mp_members m where m.user_id=auth.uid()
 and m.seen_at>now()-interval '45 seconds' and topic='paw-lobby:'||m.room_id::text);
$$;
revoke all on function public.can_receive_paw_lobby(text) from public,anon;
grant execute on function public.can_receive_paw_lobby(text) to authenticated;
drop policy if exists paw_lobby_receive on realtime.messages;
create policy paw_lobby_receive on realtime.messages for select to authenticated
using(extension='broadcast' and public.can_receive_paw_lobby(realtime.topic()));
drop policy if exists paw_lobby_read_guard on realtime.messages;
create policy paw_lobby_read_guard on realtime.messages as restrictive for select to authenticated
using(realtime.topic() not like 'paw-lobby:%' or public.can_receive_paw_lobby(realtime.topic()));
drop policy if exists paw_lobby_write_guard on realtime.messages;
create policy paw_lobby_write_guard on realtime.messages as restrictive for insert to authenticated
with check(realtime.topic() not like 'paw-lobby:%');

create or replace function public.broadcast_paw_lobby()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if tg_table_name='mp_rooms' then
   if tg_op='DELETE' then target:=old.id; else target:=new.id; end if;
 else
   if tg_op='UPDATE' and new.ready is not distinct from old.ready and new.returned is not distinct from old.returned then return null; end if;
   if tg_op='DELETE' then target:=old.room_id; else target:=new.room_id; end if;
 end if;
 perform realtime.send(jsonb_build_object('room',target),'state','paw-lobby:'||target::text,true);
 return null;
exception when others then
 raise warning 'paw_lobby_stream_failed: %',sqlstate;
 return null;
end;
$$;
revoke all on function public.broadcast_paw_lobby() from public,anon,authenticated;
drop trigger if exists paw_lobby_room_state on public.mp_rooms;
create trigger paw_lobby_room_state after insert or update or delete on public.mp_rooms
for each row execute function public.broadcast_paw_lobby();
drop trigger if exists paw_lobby_member_state on public.mp_members;
create trigger paw_lobby_member_state after insert or update or delete on public.mp_members
for each row execute function public.broadcast_paw_lobby();
notify pgrst,'reload schema';
commit;
