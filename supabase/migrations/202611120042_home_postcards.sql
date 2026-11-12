-- SQL Editor query name: Home Postcard Display
-- Requires Friend Home Visits (017).
begin;
create table if not exists public.player_home_postcards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  image_png bytea not null check (
    octet_length(image_png) between 45 and 786432
    and substring(image_png from 1 for 24) =
      decode('89504e470d0a1a0a0000000d4948445200000254000001b6', 'hex')
    and substring(image_png from octet_length(image_png)-11) =
      decode('0000000049454e44ae426082', 'hex')
  )
);
alter table public.player_home_postcards enable row level security;
revoke all on public.player_home_postcards from public, anon, authenticated;

create or replace function public.read_home_postcard(p_target uuid, p_include_image boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_target is null then return null; end if;
  if p_target <> owner_id then
    perform pg_advisory_xact_lock(748202);
    if not exists (
      select 1 from public.player_friendships
      where user_low=least(owner_id,p_target) and user_high=greatest(owner_id,p_target) and status='accepted'
    ) or exists (
      select 1 from public.player_blocks
      where (blocker=owner_id and blocked=p_target) or (blocker=p_target and blocked=owner_id)
    ) then return null; end if;
  end if;
  if p_include_image then
    return (select replace(encode(image_png,'base64'),chr(10),'')
      from public.player_home_postcards where user_id=p_target);
  end if;
  return (select '' from public.player_home_postcards where user_id=p_target);
end;
$$;

create or replace function public.set_home_postcard(p_png text)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_png is null then
    delete from public.player_home_postcards where user_id=owner_id;
    return;
  end if;
  if octet_length(p_png) > 1048576 then
    raise exception 'invalid_postcard_size' using errcode='22023';
  end if;
  insert into public.player_home_postcards(user_id,image_png)
    values (owner_id,decode(p_png,'base64'))
    on conflict (user_id) do update set image_png=excluded.image_png;
end;
$$;
revoke all on function public.read_home_postcard(uuid,boolean) from public,anon,authenticated;
revoke all on function public.set_home_postcard(text) from public,anon,authenticated;
grant execute on function public.read_home_postcard(uuid,boolean) to authenticated;
grant execute on function public.set_home_postcard(text) to authenticated;
notify pgrst,'reload schema';
commit;
