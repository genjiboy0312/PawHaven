import {test,beforeEach,after} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {importTs} from './load-typescript.mjs';
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'Node.js'},configurable:true});
const {ShopState}=await importTs('../src/shop/ShopState.ts',import.meta.url),{ServerShopState}=await importTs('../src/shop/ServerShopState.ts',import.meta.url),{EconomyClient}=await importTs('../src/shop/EconomyClient.ts',import.meta.url),{parseEconomyResult}=await importTs('../src/shop/EconomySnapshot.ts',import.meta.url);
const {createAtlasAnimal}=await importTs('../src/animals/createMyeongrang.ts',import.meta.url),{CharacterSelection}=await importTs('../src/animals/CharacterSelection.ts',import.meta.url),{CharacterPresets}=await importTs('../src/animals/CharacterPresets.ts',import.meta.url),{PET_IDS}=await importTs('../src/animals/PetCatalog.ts',import.meta.url);
const {Texture,TextureSource}=await import('pixi.js');const db=new PGlite();after(()=>db.close());
await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema realtime;create table realtime.messages(extension text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;");
for(const file of ['202610170001_player_accounts.sql','202610170002_server_economy.sql','202610190003_multiplayer.sql','202610210008_home_shop.sql','202610230009_friends.sql','202610230010_friend_invites.sql','202610240011_snacks.sql','202610240012_park_channels.sql','202610250015_player_blocks.sql','202610240013_mailbox.sql','202610250016_mail_coupons.sql','202610250017_friend_home_visits.sql','202610260018_crossroads_course.sql','202610260019_mail_receipts.sql','202610270021_garden_props_shop.sql','202610270022_lobby_background_shop.sql','202610280023_single_run_rewards.sql','202610280024_multiplayer_rewards.sql','202610280025_daily_coin_quest.sql','202610280026_box_coin_rewards.sql','202610280027_speech_bubble_skins.sql','202610280028_invite_only_rooms.sql','202610290029_daily_attendance_mail.sql','202610290030_pet_shop.sql','202610290031_cherry_sky.sql','202610290032_lobby_floor_shop.sql','202610290033_pet_house_shop.sql','202610290034_account_progress.sql','202610290035_social_account_levels.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
const users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];for(const [i,id]of users.entries()){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into public.player_profiles(user_id,nickname)values($1,$2)',[id,'PetOwner'+i]);}
let seq=0;const nonce=()=>`aaaaaaaa-1111-4111-8111-${String(++seq).padStart(12,'0')}`;
async function as(n,sql,args=[],role='authenticated'){await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':users[n]]);return(await db.query(sql,args)).rows[0]?.data;}finally{await db.exec('reset role');}}
const economy=(n,action='load',payload={},id=nonce())=>as(n,'select public.economy_command($1,$2,$3) as data',[action,id,JSON.stringify(payload)]);
beforeEach(()=>db.exec('truncate public.mp_rooms cascade;truncate public.park_members,public.park_chat,public.player_saves,public.player_mail,public.player_friendships,public.player_presence,public.economy_pets,public.economy_requests,public.economy_runs,public.economy_race_rewards,public.economy_claims,public.economy_items,public.economy_home_items,public.economy_wallets cascade;'));
const {accountProgress,ACCOUNT_MAX_XP}=await importTs('../src/account/AccountProgress.ts',import.meta.url);
async function run(n=0){const start=await economy(n,'run_start',{map:'practice'});await db.query("update public.economy_runs set started_at=clock_timestamp()-interval '6 seconds' where id=$1",[start.run_id]);return start.run_id;}
test('account curve is permanent, bounded, separate from pass XP and persistent for guests',()=>{
 for(const [xp,level]of [[0,1],[99,1],[100,2],[249,2],[250,3],[450,4],[252449,99],[252450,100]])assert.equal(accountProgress(xp).level,level);
 let saved=null;const storage={getItem:()=>saved,setItem:(_,value)=>saved=value},state=new ShopState(storage);const coins=state.coins,snacks=state.snacks;
 state.completeRun();assert.equal(state.accountProgress.xp,0);
 for(let i=0;i<5;i++){state.beginRun('practice');state.completeRun(0);state.completeRun(0);}
 assert.equal(state.accountProgress.level,2);assert.equal(state.accountProgress.xp,100);assert.equal(state.xp,400);assert.equal(state.coins,coins+50+20);assert.equal(state.snacks,snacks+1);assert.deepEqual(state.accountRunReward,{beforeXP:80,afterXP:100,levelUp:{level:2,coins:20,snacks:1}});assert.equal(state.takeAccountLevelUp().level,2);assert.equal(state.takeAccountLevelUp(),undefined);
 assert.equal(new ShopState(storage).accountProgress.xp,100);assert.equal(accountProgress(ACCOUNT_MAX_XP).percent,100);
});
test('server awards XP once per validated single finish, level gifts atomically and isolates accounts',async()=>{
 const initial=await economy(0);assert.equal(initial.snapshot.accountProgressReady,true);assert.equal(initial.snapshot.accountXP,0);
 for(let i=0;i<5;i++){const run_id=await run(),id=nonce(),payload={run_id,collected:0,accountXP:99999};const r=await economy(0,'run_finish',payload,id);parseEconomyResult(r);assert.equal(r.snapshot.accountXP,(i+1)*20);assert.equal((await economy(0,'run_finish',payload,id)).snapshot.accountXP,(i+1)*20);assert.equal((await economy(0,'run_finish',payload)).outcome,'run_rejected');if(i===4){assert.deepEqual(r.account_level_up,{level:2,coins:20,snacks:1});assert.equal(r.snapshot.coins,initial.snapshot.coins+70);assert.equal(r.snapshot.snacks,initial.snapshot.snacks+1);}}
 assert.equal((await economy(1)).snapshot.accountXP,0);const token=await run();assert.equal((await economy(1,'run_finish',{run_id:token,collected:0})).outcome,'run_rejected');assert.equal((await economy(1)).snapshot.accountXP,0);
 await assert.rejects(as(0,'update public.economy_wallets set account_xp=999 where user_id=$1',[users[0]]),/permission denied/);await assert.rejects(as(0,'select pawhaven_private.award_account_xp($1)',[users[0]]),/permission denied/);
 await db.exec(await readFile(new URL('../supabase/migrations/202610290034_account_progress.sql',import.meta.url),'utf8'));assert.equal((await economy(0)).snapshot.accountXP,100);
});
test('multiplayer requires a recorded finish and retries never duplicate account XP or gifts',async()=>{
 await economy(0);await economy(1);const room=nonce(),round=nonce();await db.query("insert into public.mp_rooms(id,name,host,map,phase,round_id,starts_at)values($1,'XP room',$2,'practice','results',$3,clock_timestamp()-interval '12 seconds')",[room,users[0],round]);
 for(let i=0;i<2;i++)await db.query('insert into public.mp_racers(room_id,user_id,nickname,finished_ms)values($1,$2,$3,$4)',[room,users[i],'Player'+i,i===1?9000:null]);
 assert.equal((await economy(0,'race_reward',{room,round,collected:0})).outcome,'run_rejected');assert.equal((await economy(0)).snapshot.accountXP,0);
 await db.query('update public.economy_wallets set account_xp=80 where user_id=$1',[users[1]]);const id=nonce(),payload={room,round,collected:0};const r=await economy(1,'race_reward',payload,id);assert.equal(r.snapshot.accountXP,100);assert.equal(r.account_level_up.level,2);assert.equal((await economy(1,'race_reward',payload,id)).snapshot.accountXP,100);assert.equal((await economy(1,'race_reward',payload)).snapshot.accountXP,100);
});
test('account cap and capped wallets do not overflow; old servers remain compatible',async()=>{
 await economy(0);await db.query('update public.economy_wallets set account_xp=252440,coins=999995,snacks=99 where user_id=$1',[users[0]]);const run_id=await run(),r=await economy(0,'run_finish',{run_id,collected:0});assert.equal(r.snapshot.accountXP,252450);assert.equal(r.snapshot.coins,1000000);assert.deepEqual(r.account_level_up,{level:100,coins:0,snacks:0});parseEconomyResult(r);
 const token=await run();assert.equal((await economy(0,'run_finish',{run_id:token,collected:0})).account_level_up,undefined);
 const old=structuredClone(r);delete old.account_level_up;delete old.snapshot.accountProgressReady;delete old.snapshot.accountXP;parseEconomyResult(old);old.snapshot.accountProgressReady=true;assert.throws(()=>parseEconomyResult(old));
});
test('server state survives a lost completion response and displays the level notice only once',async()=>{
 await economy(0);await db.query('update public.economy_wallets set account_xp=80 where user_id=$1',[users[0]]);let lose=true;
 const api=new EconomyClient(async request=>{const r=await economy(0,request.p_action,request.p_payload,request.p_request_id);if(request.p_action==='run_finish'&&lose){lose=false;throw Error('lost')}return r;},nonce),state=new ServerShopState(api),idle=async()=>{while(api.busy)await new Promise(r=>setImmediate(r));};
 try{await idle();assert.equal(state.accountProgress.xp,80);await state.beginRun('practice');await db.query("update public.economy_runs set started_at=clock_timestamp()-interval '6 seconds' where user_id=$1",[users[0]]);await state.completeRun(0);assert.equal(state.accountProgress.xp,80);assert.equal(state.accountRunReward,undefined);await state.retry();await idle();assert.equal(state.accountProgress.xp,100);assert.deepEqual(state.accountRunReward,{beforeXP:80,afterXP:100,levelUp:{level:2,coins:20,snacks:1}});assert.equal(state.takeAccountLevelUp().level,2);assert.equal(state.takeAccountLevelUp(),undefined);const receipt=state.accountRunReward;await api.execute('load');assert.equal(state.accountRunReward,receipt);assert.equal(state.takeAccountLevelUp(),undefined);}finally{state.destroy();}
});

test('account result presentation bounds the award, respects max-level and preserves image-backed colors',async()=>{
 const {accountFinishReward}=await importTs('../src/account/AccountProgress.ts',import.meta.url);
 assert.deepEqual(accountFinishReward(80,100),{beforeXP:80,afterXP:100});assert.deepEqual(accountFinishReward(0,80),{beforeXP:60,afterXP:80});assert.equal(accountFinishReward(100,80),undefined);
 assert.deepEqual(accountFinishReward(252440,252450),{beforeXP:252440,afterXP:252450});assert.deepEqual(accountFinishReward(252450,252450),{beforeXP:252450,afterXP:252450});
 for(const name of ['Track','Fill'])assert.deepEqual(await readFile(new URL('../Resources/Account_XP_'+name+'.png',import.meta.url)),await readFile(new URL('../public/assets/ui/surfaces/account-xp-'+name.toLowerCase()+'.png',import.meta.url)));
});

test('social names accept only bounded server levels and preserve older server names',async()=>{
 const {accountLevelName}=await importTs('../src/account/AccountProgress.ts',import.meta.url);
 assert.equal(accountLevelName('명랑집사',3),'Lv. 3 명랑집사');assert.equal(accountLevelName('Player',100),'Lv. 100 Player');
 for(const level of [undefined,null,0,-1,101,1.5,'99',NaN,Infinity])assert.equal(accountLevelName('Player',level),'Player');
});
test('park and room snapshots disclose only server-derived account levels for their current members',async()=>{
 await economy(0);await db.query('update public.economy_wallets set account_xp=100 where user_id=$1',[users[0]]);
 const session0=nonce(),session1=nonce();await as(0,"select public.park_command('join',1,$1,'') as data",[session0]);
 const joined=await as(1,"select public.park_command('join',1,$1,'') as data",[session1]);
 assert.equal(joined.members.find(m=>m.id===users[0]).level,2);assert.equal(joined.members.find(m=>m.id===users[1]).level,1);
 await db.query('update public.economy_wallets set account_xp=250 where user_id=$1',[users[0]]);
 const synced=await as(1,"select public.park_command('sync',1,$1,$2) as data",[session1,JSON.stringify({level:100})]);assert.equal(synced.members.find(m=>m.id===users[0]).level,3);assert.equal(synced.members.find(m=>m.id===users[0]).session,session0);
 for(const member of synced.members){assert.equal(member.accountXP,undefined);assert.equal(member.coins,undefined);}
 const created=await as(0,"select public.multiplayer_command('create',null,$1) as data",[JSON.stringify({name:'Level room',level:100,accountXP:99999})]);assert.equal(created.room.members[0].level,3);
 const room=await as(1,"select public.multiplayer_command('join',$1,$2) as data",[created.room.id,JSON.stringify({level:99})]);assert.equal(room.room.members.find(m=>m.id===users[1]).level,1);assert.equal(room.room.members.find(m=>m.id===users[0]).level,3);
 await db.exec(await readFile(new URL('../supabase/migrations/202610290035_social_account_levels.sql',import.meta.url),'utf8'));assert.equal((await economy(0)).snapshot.accountXP,250);
});
test('social level responses retain private-room and park session boundaries',async()=>{
 const session=nonce();await as(0,"select public.park_command('join',1,$1,'') as data",[session]);await assert.rejects(as(1,"select public.park_command('sync',1,$1,'') as data",[session]),/park_session_lost/);
 const listed=await as(1,"select public.park_command('list',1,null,'') as data");assert.equal(listed.members,undefined);
 const created=await as(0,"select public.multiplayer_command('create',null,$1) as data",[JSON.stringify({name:'Private levels',visibility:'invite'})]);assert.equal(created.room.members[0].level,1);
 const rooms=await as(1,"select public.multiplayer_command('list',null,'{}') as data");assert.equal(rooms.rooms.length,0);
 await assert.rejects(as(1,"select public.multiplayer_command('join',$1,'{}') as data",[created.room.id]),/room_unavailable/);
 await assert.rejects(as(1,'select pawhaven_private.account_level(100) as data'),/permission denied/);
});
test('park level refresh changes only the label and keeps the existing actor pose and animation',async()=>{
 const {ParkScene}=await importTs('../src/game/scenes/ParkScene.ts',import.meta.url);
 const member={id:'peer',session:'session',name:'명랑집사',look:{petId:'corgi'},level:3};
 const old={signature:JSON.stringify([member.session,member.look,member.name]),name:{text:member.name},x:500,y:700,height:60,animation:{frame:4},box:{destroy(){throw Error('actor rebuilt')}}};
 const scene={actors:new Map([[member.id,old]])};ParkScene.prototype.actor.call(scene,member);assert.equal(old.name.text,'Lv. 3 명랑집사');assert.deepEqual([old.x,old.y,old.height,old.animation.frame],[500,700,60,4]);
 member.level=4;ParkScene.prototype.actor.call(scene,member);assert.equal(old.name.text,'Lv. 4 명랑집사');delete member.level;ParkScene.prototype.actor.call(scene,member);assert.equal(old.name.text,'명랑집사');
});
test('latest account and social migrations keep server background and floor purchases ready and retry-safe',async()=>{
 const api=new EconomyClient(request=>economy(0,request.p_action,request.p_payload,request.p_request_id),nonce),state=new ServerShopState(api),idle=async()=>{while(api.busy)await new Promise(r=>setImmediate(r));};
 try{await idle();for(const [category,index]of[['Background',4],['Floor',4],['Background',2],['Floor',2]]){assert.equal(await state.buyHome(category,index),'purchased');await idle();assert.equal(state.connection,'ready');assert.equal(state.message,'');assert.equal(state.homeOwned(category,index),1);}assert.equal(state.coins,200);assert.equal(state.accountProgress.xp,0);}finally{state.destroy();}
});

test('legacy furniture-only checks reproduce stuck surface purchases; repair preserves records and retries once',async()=>{
 await economy(0);await economy(0,'buy_home',{category:'Furniture',index:5});const before=await economy(0);
 await db.exec("alter table public.economy_home_items add constraint garden_home_index check(item_index>=1 and item_index<=pawhaven_private.home_max_index(category));alter table public.economy_home_items add constraint garden_home_minimum check(quantity>=pawhaven_private.home_initial_stock(category,item_index));");
 const requests=[],api=new EconomyClient(request=>{requests.push(request);return economy(0,request.p_action,request.p_payload,request.p_request_id)},nonce),state=new ServerShopState(api),idle=async()=>{while(api.busy)await new Promise(r=>setImmediate(r));};
 try{await idle();assert.equal(await state.buyHome('Background',4),'invalid');await idle();assert.equal(state.connection,'setup');assert.equal(state.coins,before.snapshot.coins);assert.equal(state.homeOwned('Background',4),0);
  await db.exec(await readFile(new URL('../supabase/migrations/202610290036_repair_surface_purchases.sql',import.meta.url),'utf8'));await state.retry();await idle();assert.equal(state.connection,'ready');assert.equal(state.homeOwned('Background',4),1);assert.equal(state.coins,before.snapshot.coins-200);assert.equal(state.homeOwned('Furniture',5),1);
  const buys=requests.filter(r=>r.p_action==='buy_home');assert.equal(buys.length,2);assert.equal(buys[0].p_request_id,buys[1].p_request_id);await state.retry();await idle();assert.equal(state.coins,before.snapshot.coins-200);
  assert.equal(await state.buyHome('Floor',4),'purchased');await idle();assert.equal(state.homeOwned('Floor',4),1);assert.equal(state.coins,before.snapshot.coins-400);
  await db.exec(await readFile(new URL('../supabase/migrations/202610290036_repair_surface_purchases.sql',import.meta.url),'utf8'));assert.equal((await economy(0)).snapshot.coins,state.coins);
  await assert.rejects(db.query("insert into public.economy_home_items values($1,'Floor',2,2)",[users[0]]),/lobby_surface_limit/);await assert.rejects(db.query("insert into public.economy_home_items values($1,'Other',1,1)",[users[0]]),/lobby_home_category/);
 }finally{state.destroy();}
});
