-- SQL Editor query name: Create One-Time Test Coin Coupon
-- Run once as an administrator. The actual code is generated in the database.
-- Re-running this same script returns the same coupon without renewing its quota or expiry.
begin;
insert into public.mail_coupons(id,code,title,body,rewards,expires_at,max_uses)
values (
 'b1843d70-5cc7-4aec-b48a-ecb602ef7ad1',
 'PAW-TEST-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
 '테스트 코인 선물',
 '쿠폰 입력 테스트 보상입니다. 받기를 누르면 100,000코인이 지급됩니다.',
 '{"coins":100000}'::jsonb,
 now()+interval '7 days',
 1
)
on conflict(id) do nothing;
commit;
select code,rewards->>'coins' as coins,expires_at,max_uses,used_count,enabled
from public.mail_coupons where id='b1843d70-5cc7-4aec-b48a-ecb602ef7ad1';
