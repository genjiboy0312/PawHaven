import {test,beforeEach,after} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {importTs} from './load-typescript.mjs';
const {MailboxClient,parseMailbox,hasMailRewards,mailGroup,mailboxTransport}=await importTs('../src/mail/MailboxClient.ts',import.meta.url);
const db=new PGlite(),users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];let sequence=0;
await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;");
for(const file of ['202610170001_player_accounts.sql','202610170002_server_economy.sql','202610210008_home_shop.sql','202610240011_snacks.sql','202610240013_mailbox.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/202610250016_mail_coupons.sql',import.meta.url),'utf8'));
for(const id of users)await db.query('insert into auth.users values($1)',[id]);after(()=>db.close());
await db.exec(await readFile(new URL('../supabase/migrations/202610260019_mail_receipts.sql',import.meta.url),'utf8'));
beforeEach(()=>db.exec('truncate public.mail_coupon_redemptions,public.mail_coupon_attempts,public.mail_coupons,public.player_mail,public.economy_requests,public.economy_runs,public.economy_claims,public.economy_items,public.economy_home_items,public.economy_wallets'));
async function as(n,sql,args=[],role='authenticated'){await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':users[n]]);return await db.query(sql,args);}finally{await db.exec('reset role');}}
async function command(n,action='load',id=null){return(await as(n,'select public.mailbox_command($1,$2) as data',[action,id])).rows[0].data;}
async function send(n,rewards={},key='delivery-'+(++sequence)){return(await as(null,'select public.send_player_mail($1,$2,$3,$4,$5) as id',[users[n],key,'Server gift','A little present for your pet.',JSON.stringify(rewards)],'service_role')).rows[0].id;}

test('receipts total only committed rewards, exclude duplicate outfits and blocked mail, and survive replay',async()=>{
 const migration=await readFile(new URL('../supabase/migrations/202610260019_mail_receipts.sql',import.meta.url),'utf8');await db.exec(migration);
 await send(0,{coins:50,snacks:2,items:[{category:'Hat',index:2}],home:[{category:'Furniture',index:5,quantity:2}]});
 await send(0,{coins:25,items:[{category:'Hat',index:2}]});await send(0,{});
 await send(0,{snacks:99});
 const result=await command(0,'claim_all');
 assert.equal(result.granted,3);assert.equal(result.blocked,1);assert.equal(result.outcome,'capacity');
 assert.deepEqual(result.received,{coins:75,snacks:2,items:1,home:2,notices:1});parseMailbox(result);
 await db.exec(migration);const retry=await command(0,'claim_all');assert.equal(retry.granted,0);assert.equal(retry.received.coins,0);
 for(const received of [{...result.received,coins:-1},{...result.received,items:'2'},null])assert.throws(()=>parseMailbox({...result,received}),/invalid_receipt/);
});

test('new-mail observer ignores initial mail, polling duplicates and older pages; notices have no reward action',async()=>{
 const first=await send(0,{});const client=new MailboxClient(request=>command(0,request.p_action,request.p_mail_id));
 await client.run('load');assert.equal(client.arrivalVersion,0);const notice=client.snapshot.mail[0];assert.equal(hasMailRewards(notice),false);assert.equal(mailGroup(notice,false),'mailWaiting');
 await send(0,{coins:25});await client.run('load');assert.equal(client.arrivalVersion,1);await client.run('load');assert.equal(client.arrivalVersion,1);
 await client.run('claim_all');assert.equal(client.receipt.granted,2);assert.equal(client.receipt.received.coins,25);await client.run('load');assert.equal(client.receipt.received.coins,25);assert.equal(client.arrivalVersion,1);
 assert.equal(mailGroup(client.snapshot.mail.find(m=>m.id===first),true),'mailClaimed');
 await send(0,{});await db.exec("update public.player_mail set created_at=now()-interval '1 day' where claimed_at is null");await client.run('load');assert.equal(client.arrivalVersion,1);
 client.destroy();
});
test('mail delivery is trusted-server only, idempotent and private to each account',async()=>{
 const id=await send(0,{coins:100},'same-key');assert.equal(await send(0,{coins:100},'same-key'),id);assert.equal((await command(0)).mail.length,1);assert.equal((await command(1)).mail.length,0);
 await assert.rejects(as(0,'select * from public.player_mail'),/permission denied/);await assert.rejects(as(0,"select public.send_player_mail($1,'hack','x','x','{}')",[users[0]]),/permission denied/);
 await assert.rejects(as(null,"select public.mailbox_command('load')",[],'anon'),/permission denied/);assert.equal((await command(1,'claim',id)).granted,0);assert.equal((await command(0)).pending,1);
 await command(1,'read',id);assert.equal((await command(0)).mail[0].readAt,null);await command(0,'read',id);assert.ok((await command(0)).mail[0].readAt);
});
test('claims atomically grant coins, treats, wardrobe and furniture through the existing economy',async()=>{
 const id=await send(0,{coins:100,snacks:2,items:[{category:'Hat',index:2}],home:[{category:'Furniture',index:5,quantity:2},{category:'Etc',index:1,quantity:1}]});
 const result=await command(0,'claim',id);assert.equal(result.granted,1);assert.equal(result.pending,0);assert.ok(result.mail[0].claimedAt);assert.equal(result.revision,1);
 const wallet=(await db.query('select * from public.economy_wallets where user_id=$1',[users[0]])).rows[0];assert.equal(wallet.coins,1100);assert.equal(wallet.snacks,2);
 const items=(await db.query('select * from public.economy_items where user_id=$1 and category=\'Hat\' and item_index=2',[users[0]])).rows;assert.equal(items.length,1);
 const furniture=(await db.query('select category,item_index,quantity from public.economy_home_items where user_id=$1 order by category',[users[0]])).rows;assert.deepEqual(furniture.map(i=>i.quantity),[4,2]);
 assert.equal((await command(0,'claim',id)).granted,0);assert.equal((await command(0,'claim_all')).granted,0);assert.equal((await db.query('select coins from public.economy_wallets where user_id=$1',[users[0]])).rows[0].coins,1100);
 assert.equal((await command(1)).revision,0);
});
test('capacity and expiry never consume or partially apply a mail; receive all skips only blocked mail',async()=>{
 const full=await send(0,{coins:30,snacks:2}),good=await send(0,{items:[{category:'Acc',index:2}]}),expired=await send(0,{coins:40});await command(0);
 await db.query('update public.economy_wallets set snacks=99 where user_id=$1',[users[0]]);await db.query("update public.player_mail set expires_at=now()-interval '1 second' where id=$1",[expired]);
 const all=await command(0,'claim_all');assert.equal(all.granted,1);assert.equal(all.blocked,1);assert.equal(all.pending,1);assert.equal(all.mail.find(m=>m.id===full).claimedAt,null);assert.ok(all.mail.find(m=>m.id===good).claimedAt);
 assert.equal((await db.query('select coins from public.economy_wallets where user_id=$1',[users[0]])).rows[0].coins,1000);assert.equal((await command(0,'claim',expired)).granted,0);
 await db.query('update public.economy_wallets set snacks=0 where user_id=$1',[users[0]]);assert.equal((await command(0,'claim',full)).granted,1);
 const stock=await send(0,{home:[{category:'Furniture',index:5,quantity:20}]});await db.query("insert into public.economy_home_items values($1,'Furniture',5,1)",[users[0]]);assert.equal((await command(0,'claim',stock)).outcome,'capacity');
 const coins=await send(0,{coins:10});await db.query('update public.economy_wallets set coins=999999 where user_id=$1',[users[0]]);assert.equal((await command(0,'claim',coins)).outcome,'capacity');assert.equal((await command(0)).mail.find(m=>m.id===coins).claimedAt,null);
});
test('server validates reward definitions and migration replay preserves mail',async()=>{
 for(const reward of [{coins:-1},{snacks:100},{coins:'10'},{items:[{category:'Hat',index:0}]},{items:[{category:'Hat',index:'2'}]},{home:[{category:'Furniture',index:6,quantity:1}]},{home:[{category:'Furniture',index:5,quantity:0}]},{home:[{category:'Furniture',index:5,quantity:'1'}]},{home:[{category:'Etc',index:1,quantity:1},{category:'Etc',index:1,quantity:2}]},{unknown:1},{items:null}])await assert.rejects(send(0,reward),/invalid_rewards|duplicate_reward/);
 const id=await send(0,{});await command(0,'claim',id);await db.exec(await readFile(new URL('../supabase/migrations/202610240013_mailbox.sql',import.meta.url),'utf8'));assert.ok((await command(0)).mail[0].claimedAt);
});
test('lost claim responses retry the same IDs, refresh inventory and cannot double-grant',async()=>{
 const id=await send(0,{coins:75});let fail=true,reloads=0,requests=[];
 const client=new MailboxClient(async request=>{requests.push(request);const result=await command(0,request.p_action,request.p_mail_id);if(request.p_action==='claim'&&fail){fail=false;throw Error('lost');}return result;},async()=>{reloads++;});
 await client.run('load');assert.equal(client.pending,1);assert.equal(await client.run('claim',id),false);assert.equal(client.error,'mailOffline');assert.equal(await client.run('load'),true);assert.deepEqual(requests.at(-1),{p_action:'claim',p_mail_id:id});assert.equal(client.pending,0);assert.equal(reloads,2);
 assert.equal((await db.query('select coins from public.economy_wallets where user_id=$1',[users[0]])).rows[0].coins,1075);client.destroy();assert.equal(await client.run('claim_all'),false);
});
test('malformed snapshots never enter the client and disposed account responses are ignored',async()=>{
 const data=await command(0);assert.deepEqual(parseMailbox(data).mail,[]);for(const change of [{pending:-1},{mail:[{id:'bad'}]},{revision:1.5}])assert.throws(()=>parseMailbox({...data,...change}));
 let resolve;let reloads=0;const client=new MailboxClient(()=>new Promise(r=>{resolve=r;}),async()=>{reloads++;});const pending=client.run('load');client.destroy();resolve(data);assert.equal(await pending,false);assert.equal(client.snapshot,undefined);assert.equal(reloads,0);
});

async function coupon(code='PAW-TEST',rewards={coins:100},limit=null){
 return (await db.query("insert into public.mail_coupons(code,title,body,rewards,expires_at,max_uses) values($1,'Coupon gift','A gift for your pet.',$2,now()+interval '1 day',$3) returning id",[code,JSON.stringify(rewards),limit])).rows[0].id;
}
async function redeem(n,code){return(await as(n,'select public.redeem_coupon($1) as data',[code])).rows[0].data;}
async function cooldown(){await db.exec("update public.mail_coupon_attempts set attempted_at=now()-interval '3 seconds'");}

test('coupons deliver private mail once per account, and only claiming grants inventory',async()=>{
 await coupon('PAW-TEST',{coins:125,items:[{category:'Hat',index:2}],home:[{category:'Furniture',index:5,quantity:1}]});
 const sent=await redeem(0,'  paw-test  ');assert.equal(sent.outcome,'couponSent');assert.equal(sent.pending,1);assert.equal(sent.granted,0);parseMailbox(sent);
 assert.equal((await db.query('select coins from public.economy_wallets where user_id=$1',[users[0]])).rows[0].coins,1000);
 assert.equal((await command(1)).mail.length,0);
 await cooldown();const used=await redeem(0,'PAW-TEST');assert.equal(used.outcome,'couponUsed');assert.equal(used.mail.length,1);
 assert.equal((await redeem(1,'PAW-TEST')).outcome,'couponSent');
 assert.equal((await command(0,'claim',sent.mail[0].id)).granted,1);assert.equal((await command(0,'claim',sent.mail[0].id)).granted,0);
 assert.equal((await db.query('select coins from public.economy_wallets where user_id=$1',[users[0]])).rows[0].coins,1125);
 assert.equal((await db.query('select used_count from public.mail_coupons')).rows[0].used_count,2);
 await db.exec(await readFile(new URL('../supabase/migrations/202610250016_mail_coupons.sql',import.meta.url),'utf8'));
 await cooldown();assert.equal((await redeem(0,'PAW-TEST')).outcome,'couponUsed');
});

test('coupons enforce server quota, validity, rate limit and trusted definitions',async()=>{
 const id=await coupon('LIMITED',{coins:10},1);
 assert.equal((await redeem(0,'LIMITED')).outcome,'couponSent');assert.equal((await redeem(1,'LIMITED')).outcome,'couponExhausted');
 assert.equal((await redeem(1,'MISSING')).outcome,'couponSlow');await cooldown();
 for(const code of [null,'','bad code','x'.repeat(41),'MISSING']){assert.equal((await redeem(1,code)).outcome,'couponInvalid');await cooldown();}
 await db.query("update public.mail_coupons set expires_at=now()-interval '1 second',starts_at=now()-interval '1 day' where id=$1",[id]);
 assert.equal((await redeem(1,'LIMITED')).outcome,'couponExpired');await cooldown();
 await db.query("update public.mail_coupons set expires_at=now()+interval '2 days',starts_at=now()+interval '1 day' where id=$1",[id]);
 assert.equal((await redeem(1,'LIMITED')).outcome,'couponExpired');await cooldown();
 await db.query('update public.mail_coupons set enabled=false where id=$1',[id]);assert.equal((await redeem(1,'LIMITED')).outcome,'couponInvalid');
 for(const table of ['mail_coupons','mail_coupon_redemptions','mail_coupon_attempts'])await assert.rejects(as(0,'select * from public.'+table),/permission denied/);
 await assert.rejects(as(null,"select public.redeem_coupon('LIMITED')",[],'anon'),/permission denied/);
 await assert.rejects(as(null,"select public.redeem_coupon('LIMITED')"),/not_authenticated/);
 await coupon('INVALID',{coins:-20});await cooldown();await assert.rejects(redeem(1,'INVALID'),/invalid_rewards/);
 assert.equal((await db.query("select used_count from public.mail_coupons where code='INVALID'")).rows[0].used_count,0);
 assert.equal((await command(1)).mail.length,0);
});

test('lost coupon responses retry the same code and cannot create a second delivery',async()=>{
 await coupon();let lost=true;const requests=[];
 const client=new MailboxClient(async request=>{requests.push(request);if(request.p_action!=='redeem')return command(0,request.p_action,request.p_mail_id);const result=await redeem(0,request.p_code);if(lost){lost=false;throw Error('lost response');}return result;});
 assert.equal(await client.run('redeem',' paw-test '),false);await cooldown();assert.equal(await client.run('load'),true);
 assert.deepEqual(requests.at(-1),{p_action:'redeem',p_mail_id:null,p_code:'PAW-TEST'});assert.equal(client.snapshot.outcome,'couponUsed');assert.equal(client.pending,1);assert.equal(client.snapshot.mail.length,1);
 assert.equal((await db.query('select used_count from public.mail_coupons')).rows[0].used_count,1);client.destroy();
});

test('attendance transport falls back only for missing SQL and keeps account identity checks',async()=>{
 const calls=[],snapshot={mail:[],pending:0,revision:0,now:new Date().toISOString(),outcome:'loaded',granted:0,blocked:0};let failure={code:'PGRST202'},current=users[0];
 const api={auth:{async getSession(){return{data:{session:{user:{id:current},access_token:'test'}},error:null}}},rpc(name,args){calls.push({name,args});return{setHeader(){return this},async abortSignal(){return name==='daily_attendance_mail'?{error:failure,data:null}:{error:null,data:snapshot}}}}};
 const transport=mailboxTransport(api,users[0]),signal=new AbortController().signal;assert.deepEqual(await transport({p_action:'attendance',p_mail_id:null},signal),snapshot);assert.deepEqual(calls.map(c=>c.name),['daily_attendance_mail','mailbox_command']);assert.deepEqual(calls[1].args,{p_action:'load',p_mail_id:null});
 calls.length=0;failure={code:'network'};await assert.rejects(transport({p_action:'attendance',p_mail_id:null},signal));assert.equal(calls.length,1);current=users[1];await assert.rejects(transport({p_action:'attendance',p_mail_id:null},signal));assert.equal(calls.length,1);
});

test('lobby attendance waits behind a running mail request and regular polling keeps its existing path',async()=>{
 const base={mail:[],pending:0,revision:0,now:new Date().toISOString(),outcome:'loaded',granted:0,blocked:0},calls=[];let resolve;
 const client=new MailboxClient(request=>{calls.push(request.p_action);if(calls.length===1)return new Promise(r=>resolve=r);return Promise.resolve(base)});
 const loading=client.run('load');client.start();assert.deepEqual(calls,['load']);resolve(base);await loading;await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['load','attendance']);client.start();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['load','attendance','attendance']);client.destroy();
});
test('one-time admin test coupon generates a private code, preserves issuance and grants 100000 only through mail',async()=>{
 const sql=await readFile(new URL('../supabase/admin/create_test_coin_coupon.sql',import.meta.url),'utf8');
 const issue=async()=>{await db.exec(sql);return(await db.query("select * from public.mail_coupons where id='b1843d70-5cc7-4aec-b48a-ecb602ef7ad1'")).rows[0];};
 const issued=await issue();assert.match(issued.code,/^PAW-TEST-[A-F0-9]{16}$/);assert.equal(issued.max_uses,1);assert.deepEqual(issued.rewards,{coins:100000});
 const remaining=Date.parse(issued.expires_at)-Date.now();assert.ok(remaining>6.99*86400000&&remaining<=7*86400000+1000);
 const sent=await redeem(0,issued.code);assert.equal(sent.outcome,'couponSent');assert.equal((await db.query('select coins from public.economy_wallets where user_id=$1',[users[0]])).rows[0].coins,1000);
 assert.equal((await redeem(1,issued.code)).outcome,'couponExhausted');assert.equal((await command(0,'claim',sent.mail[0].id)).granted,1);assert.equal((await command(0,'claim',sent.mail[0].id)).granted,0);
 assert.equal((await db.query('select coins from public.economy_wallets where user_id=$1',[users[0]])).rows[0].coins,101000);
 const repeated=await issue();assert.equal(repeated.code,issued.code);assert.equal(repeated.used_count,1);assert.deepEqual(repeated.expires_at,issued.expires_at);
 await cooldown();assert.equal((await redeem(0,issued.code)).outcome,'couponUsed');
});
