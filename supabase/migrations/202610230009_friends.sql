-- Friends phase 1: authenticated nickname search and consent-based friendships.
begin;
create table if not exists public.player_friendships (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key(user_low,user_high),
  check(user_low < user_high),
  check(requested_by in (user_low,user_high))
);
create index if not exists player_friendships_high on public.player_friendships(user_high);
alter table public.player_friendships enable row level security;
revoke all on public.player_friendships from public,anon,authenticated;
grant select on public.player_friendships to authenticated;
drop policy if exists friendships_read_own on public.player_friendships;
create policy friendships_read_own on public.player_friendships for select to authenticated
  using ((select auth.uid()) in (user_low,user_high));

create or replace function public.friends_command(p_action text default 'list',p_target uuid default null,p_query text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); lo uuid; hi uuid; link public.player_friendships%rowtype;
  query text := btrim(coalesce(p_query,'')); peers jsonb; matches jsonb := '[]'::jsonb;
begin
  if actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_action not in ('list','search','send','accept','reject','cancel','remove') or p_action is null then
    raise exception 'friend_invalid_action';
  end if;
  if p_action='search' and query !~ '^[A-Za-z0-9가-힣_]{2,16}$' then raise exception 'friend_invalid_query'; end if;
  if p_action not in ('list','search') then
    if p_target is null or p_target=actor then raise exception 'friend_invalid_target'; end if;
    -- Same lightweight write serialization used by the multiplayer command API.
    perform pg_advisory_xact_lock(748202);
    lo:=least(actor,p_target); hi:=greatest(actor,p_target);
    if not exists(select 1 from public.player_profiles where user_id=actor and nickname is not null) then
      raise exception 'friend_nickname_required';
    end if;
    select * into link from public.player_friendships where user_low=lo and user_high=hi;
    if p_action='send' then
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
      where user_id<>actor and nickname is not null and left(lower(nickname),length(query))=lower(query)
      order by lower(nickname),user_id limit 20) q;
  end if;
  return jsonb_build_object(
    'friends',coalesce((select jsonb_agg(e) from jsonb_array_elements(peers) e where e->>'relation'='friend'),'[]'::jsonb),
    'incoming',coalesce((select jsonb_agg(e) from jsonb_array_elements(peers) e where e->>'relation'='incoming'),'[]'::jsonb),
    'outgoing',coalesce((select jsonb_agg(e) from jsonb_array_elements(peers) e where e->>'relation'='outgoing'),'[]'::jsonb),
    'matches',matches);
end;
$$;
revoke all on function public.friends_command(text,uuid,text) from public,anon;
grant execute on function public.friends_command(text,uuid,text) to authenticated;
commit;
