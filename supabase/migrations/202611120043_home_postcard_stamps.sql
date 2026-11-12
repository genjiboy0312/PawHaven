-- SQL Editor query name: Home Postcard Paw Stamps
-- Requires Home Postcard Display (042).
begin;

alter table public.player_home_postcards
  add column if not exists revision uuid not null default gen_random_uuid();

create table if not exists public.home_postcard_stamps (
  owner_id uuid not null references public.player_home_postcards(user_id) on delete cascade,
  visitor_id uuid not null references auth.users(id) on delete cascade,
  stamped_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, visitor_id),
  check (owner_id <> visitor_id)
);
alter table public.home_postcard_stamps enable row level security;
revoke all on public.home_postcard_stamps from public, anon, authenticated;

create or replace function public.reset_home_postcard_stamps()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.image_png is distinct from old.image_png then
    new.revision := gen_random_uuid();
    delete from public.home_postcard_stamps where owner_id=old.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists reset_home_postcard_stamps on public.player_home_postcards;
create trigger reset_home_postcard_stamps before update of image_png on public.player_home_postcards
  for each row execute function public.reset_home_postcard_stamps();
revoke all on function public.reset_home_postcard_stamps() from public, anon, authenticated;

create or replace function public.read_home_postcard_frame(p_target uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare viewer_id uuid := auth.uid();
begin
  -- The existing read checks friendship and both block directions under the social lock.
  if public.read_home_postcard(p_target, false) is null then return null; end if;
  return (
    select jsonb_build_object(
      'revision', p.revision,
      'image', replace(encode(p.image_png,'base64'),chr(10),''),
      'stamped', exists (
        select 1 from public.home_postcard_stamps
        where owner_id=p_target and visitor_id=viewer_id
      ),
      'visitors', case when viewer_id=p_target then coalesce((
        select jsonb_agg(recent.nickname order by recent.stamped_at desc, recent.visitor_id)
        from (
          select profile.nickname, stamp.stamped_at, stamp.visitor_id
          from public.home_postcard_stamps stamp
          join public.player_profiles profile on profile.user_id=stamp.visitor_id
          join public.player_friendships friendship
            on friendship.user_low=least(p_target,stamp.visitor_id)
            and friendship.user_high=greatest(p_target,stamp.visitor_id)
            and friendship.status='accepted'
          where stamp.owner_id=p_target and profile.nickname is not null
            and not exists (
              select 1 from public.player_blocks
              where (blocker=p_target and blocked=stamp.visitor_id)
                 or (blocker=stamp.visitor_id and blocked=p_target)
            )
          order by stamp.stamped_at desc, stamp.visitor_id limit 3
        ) recent
      ),'[]'::jsonb) else '[]'::jsonb end
    ) from public.player_home_postcards p where p.user_id=p_target
  );
end;
$$;

create or replace function public.stamp_home_postcard(p_target uuid, p_revision uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare viewer_id uuid := auth.uid();
begin
  if viewer_id is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_target is null or p_revision is null or p_target=viewer_id then return false; end if;
  if public.read_home_postcard(p_target, false) is null then return false; end if;
  -- Serialize the stamp with replacement and deletion, and reject an open frame for an old image.
  perform 1 from public.player_home_postcards where user_id=p_target and revision=p_revision for update;
  if not found then return false; end if;
  insert into public.home_postcard_stamps(owner_id,visitor_id)
    values(p_target,viewer_id) on conflict (owner_id,visitor_id) do nothing;
  return true;
end;
$$;

revoke all on function public.read_home_postcard_frame(uuid) from public, anon, authenticated;
revoke all on function public.stamp_home_postcard(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_home_postcard_frame(uuid) to authenticated;
grant execute on function public.stamp_home_postcard(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
