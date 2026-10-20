begin;

create or replace function public.can_receive_paw_race(topic text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mp_members m join public.mp_rooms r on r.id=m.room_id
 where m.user_id=auth.uid() and m.seen_at>now()-interval '45 seconds'
 and r.phase in ('countdown','playing') and r.round_id is not null
 and (topic='paw-room:'||r.id::text||':'||r.round_id::text
 or exists(select 1 from public.mp_members actor where actor.room_id=r.id
 and topic='paw-room:'||r.id::text||':'||r.round_id::text||':'||actor.user_id::text)));
$$;
revoke all on function public.can_receive_paw_race(text) from public,anon;
grant execute on function public.can_receive_paw_race(text) to authenticated;

create or replace function public.can_send_paw_motion(topic text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mp_members m join public.mp_rooms r on r.id=m.room_id
 where m.user_id=auth.uid() and m.seen_at>now()-interval '45 seconds'
 and r.phase in ('countdown','playing') and r.round_id is not null
 and topic='paw-room:'||r.id::text||':'||r.round_id::text||':'||m.user_id::text);
$$;
revoke all on function public.can_send_paw_motion(text) from public,anon;
grant execute on function public.can_send_paw_motion(text) to authenticated;

drop policy if exists paw_race_write_guard on realtime.messages;
create policy paw_race_write_guard on realtime.messages as restrictive for insert to authenticated
with check(realtime.topic() not like 'paw-room:%' or public.can_send_paw_motion(realtime.topic()));
drop policy if exists paw_motion_send on realtime.messages;
create policy paw_motion_send on realtime.messages for insert to authenticated
with check(extension='broadcast' and public.can_send_paw_motion(realtime.topic()));
grant insert on realtime.messages to authenticated;

notify pgrst,'reload schema';
commit;
