begin;

create or replace function public.can_receive_paw_race(topic text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mp_members m join public.mp_rooms r on r.id=m.room_id
 where m.user_id=auth.uid() and m.seen_at>now()-interval '45 seconds'
 and r.phase in ('countdown','playing') and r.round_id is not null
 and topic='paw-room:'||r.id::text||':'||r.round_id::text);
$$;
revoke all on function public.can_receive_paw_race(text) from public,anon;
grant execute on function public.can_receive_paw_race(text) to authenticated;

drop policy if exists paw_race_receive on realtime.messages;
create policy paw_race_receive on realtime.messages for select to authenticated
using(extension='broadcast' and public.can_receive_paw_race(realtime.topic()));
-- Keep room topics protected even if a project later adds a broad chat policy.
drop policy if exists paw_race_read_guard on realtime.messages;
create policy paw_race_read_guard on realtime.messages as restrictive for select to authenticated
using(realtime.topic() not like 'paw-room:%' or public.can_receive_paw_race(realtime.topic()));
drop policy if exists paw_race_write_guard on realtime.messages;
create policy paw_race_write_guard on realtime.messages as restrictive for insert to authenticated
with check(realtime.topic() not like 'paw-room:%');
grant select on realtime.messages to authenticated;

create or replace function public.broadcast_paw_pose()
returns trigger language plpgsql security definer set search_path='' as $$
declare race uuid;
begin
 if new.pose is not distinct from old.pose then return new; end if;
 select round_id into race from public.mp_rooms where id=new.room_id and phase='playing';
 if race is not null then
   perform realtime.send(jsonb_build_object('id',new.user_id,'pose',new.pose,
     'at',extract(epoch from clock_timestamp())*1000), 'pose',
     'paw-room:'||new.room_id::text||':'||race::text,true);
 end if;
 return new;
exception when others then
 raise warning 'paw_race_stream_failed: %',sqlstate;
 return new;
end;
$$;
revoke all on function public.broadcast_paw_pose() from public,anon,authenticated;
drop trigger if exists paw_pose_stream on public.mp_members;
create trigger paw_pose_stream after update of pose on public.mp_members
for each row execute function public.broadcast_paw_pose();

notify pgrst,'reload schema';
commit;
