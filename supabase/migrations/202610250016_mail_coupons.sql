-- SQL Editor query name: Mail Coupons and Rewards
-- Requires Player Mailbox and Rewards (202610240013_mailbox.sql).
begin;
create table if not exists public.mail_coupons (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check(code ~ '^[A-Z0-9][A-Z0-9-]{3,39}$'),
 title text not null check(char_length(btrim(title)) between 1 and 80),
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 rewards jsonb not null check(jsonb_typeof(rewards)='object'),
 starts_at timestamptz not null default now(),expires_at timestamptz not null,
 enabled boolean not null default true,
 max_uses integer check(max_uses between 1 and 10000000),
 used_count integer not null default 0 check(used_count>=0),
 check(expires_at>starts_at),check(max_uses is null or used_count<=max_uses)
);
create table if not exists public.mail_coupon_redemptions (
 coupon_id uuid not null references public.mail_coupons(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 mail_id uuid not null references public.player_mail(id),
 redeemed_at timestamptz not null default clock_timestamp(),
 primary key(coupon_id,user_id)
);
create table if not exists public.mail_coupon_attempts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 attempted_at timestamptz not null default '-infinity'
);
alter table public.mail_coupons enable row level security;
alter table public.mail_coupon_redemptions enable row level security;
alter table public.mail_coupon_attempts enable row level security;
revoke all on public.mail_coupons,public.mail_coupon_redemptions,public.mail_coupon_attempts from public,anon,authenticated;

-- Browser supplies only the code. Recipient, rewards and once-only records are server-owned.
create or replace function public.redeem_coupon(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); coupon public.mail_coupons; v_code text:=upper(btrim(p_code));
 last_attempt timestamptz; mail_id uuid; outcome text;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501';end if;
 insert into public.mail_coupon_attempts(user_id) values(uid) on conflict do nothing;
 select attempted_at into last_attempt from public.mail_coupon_attempts where user_id=uid for update;
 if last_attempt>clock_timestamp()-interval '2 seconds' then outcome:='couponSlow';
 else
  update public.mail_coupon_attempts set attempted_at=clock_timestamp() where user_id=uid;
  if v_code is null or char_length(v_code) not between 4 and 40 or v_code !~ '^[A-Z0-9][A-Z0-9-]{3,39}$' then outcome:='couponInvalid';
  else
   -- One row lock serializes the global quota and per-account delivery in one transaction.
   select * into coupon from public.mail_coupons where mail_coupons.code=v_code for update;
   if not found or not coupon.enabled then outcome:='couponInvalid';
   elsif exists(select 1 from public.mail_coupon_redemptions where coupon_id=coupon.id and user_id=uid) then outcome:='couponUsed';
   elsif clock_timestamp()<coupon.starts_at or clock_timestamp()>=coupon.expires_at then outcome:='couponExpired';
   elsif coupon.max_uses is not null and coupon.used_count>=coupon.max_uses then outcome:='couponExhausted';
   else
    mail_id:=public.send_player_mail(uid,'coupon:'||coupon.id::text,coupon.title,coupon.body,coupon.rewards,clock_timestamp()+interval '30 days');
    insert into public.mail_coupon_redemptions(coupon_id,user_id,mail_id) values(coupon.id,uid,mail_id);
    update public.mail_coupons set used_count=used_count+1 where id=coupon.id;
    outcome:='couponSent';
   end if;
  end if;
 end if;
 return public.mailbox_command('load',null)||jsonb_build_object('outcome',outcome);
end;$$;
revoke all on function public.redeem_coupon(text) from public,anon;
grant execute on function public.redeem_coupon(text) to authenticated;
notify pgrst,'reload schema';
commit;
