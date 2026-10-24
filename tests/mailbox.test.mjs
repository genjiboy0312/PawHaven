import {test,beforeEach,after} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {importTs} from './load-typescript.mjs';
const {MailboxClient,parseMailbox}=await importTs('../src/mail/MailboxClient.ts',import.meta.url);
const db=new PGlite(),users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];let sequence=0;
await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;");
for(const file of ['202610170001_player_accounts.sql','202610170002_server_economy.sql','202610210008_home_shop.sql','202610240011_snacks.sql','202610240013_mailbox.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
for(const id of users)await db.query('insert into auth.users values($1)',[id]);after(()=>db.close());
beforeEach(()=>db.exec('truncate public.player_mail,public.economy_requests,public.economy_runs,public.economy_claims,public.economy_items,public.economy_home_items,public.economy_wallets'));
async function as(n,sql,args=[],role='authenticated'){await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':users[n]]);return await db.query(sql,args);}finally{await db.exec('reset role');}}
async function command(n,action='load',id=null){return(await as(n,'select public.mailbox_command($1,$2) as data',[action,id])).rows[0].data;}
async function send(n,rewards={},key='delivery-'+(++sequence)){return(await as(null,'select public.send_player_mail($1,$2,$3,$4,$5) as id',[users[n],key,'Server gift','A little present for your pet.',JSON.stringify(rewards)],'service_role')).rows[0].id;}
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
