-- PawHaven: cosmetics only. No currency, purchases or quest rewards are accepted here.
begin;
create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text check (nickname is null or nickname ~ '^[A-Za-z0-9가-힣_]{2,16}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists player_profiles_nickname_unique
  on public.player_profiles (lower(nickname)) where nickname is not null;

create table if not exists public.player_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null check (
    jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 100000
    and snapshot->>'version' = '1'
  ),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.player_profiles enable row level security;
alter table public.player_saves enable row level security;
revoke all on public.player_profiles, public.player_saves from public, anon, authenticated;
grant select on public.player_profiles to authenticated;
grant select, insert, update on public.player_saves to authenticated;

drop policy if exists profiles_read_own on public.player_profiles;
create policy profiles_read_own on public.player_profiles for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists saves_read_own on public.player_saves;
create policy saves_read_own on public.player_saves for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists saves_insert_own on public.player_saves;
create policy saves_insert_own on public.player_saves for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists saves_update_own on public.player_saves;
create policy saves_update_own on public.player_saves for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Optimistic revision check prevents silently overwriting a different device's save.
create or replace function public.save_player_state(expected_revision bigint, state jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare next_revision bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if expected_revision = 0 then
    insert into public.player_saves(user_id, snapshot)
      values (auth.uid(), state) on conflict (user_id) do nothing returning revision into next_revision;
  else
    update public.player_saves set snapshot = state, revision = revision + 1, updated_at = now()
      where user_id = auth.uid() and revision = expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'save_conflict' using errcode = '40001'; end if;
  return next_revision;
end;
$$;

-- First nickname is free. Clients have no direct profile INSERT/UPDATE rights.
-- A later paid rename must be a separate server-validated transaction.
create or replace function public.claim_player_nickname(new_nickname text)
returns text language plpgsql security definer set search_path = '' as $$
declare result text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if new_nickname is null or new_nickname !~ '^[A-Za-z0-9가-힣_]{2,16}$' then
    raise exception 'invalid_nickname';
  end if;
  insert into public.player_profiles(user_id, nickname) values (auth.uid(), new_nickname)
    on conflict (user_id) do update set nickname = excluded.nickname
      where public.player_profiles.nickname is null returning nickname into result;
  if result is null then raise exception 'nickname_already_set'; end if;
  return result;
end;
$$;
revoke all on function public.save_player_state(bigint,jsonb) from public, anon;
revoke all on function public.claim_player_nickname(text) from public, anon;
grant execute on function public.save_player_state(bigint,jsonb) to authenticated;
grant execute on function public.claim_player_nickname(text) to authenticated;
commit;
