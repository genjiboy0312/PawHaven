import {test,after} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {importTs} from './load-typescript.mjs';
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'Node.js'},configurable:true});
const {Texture,TextureSource}=await import('pixi.js');
const {GARDEN_PROPS}=await importTs('../src/home/GardenProps.ts',import.meta.url);
const {HomeState}=await importTs('../src/home/HomeState.ts',import.meta.url);
const {ShopState}=await importTs('../src/shop/ShopState.ts',import.meta.url);
const {LobbyMap}=await importTs('../src/home/LobbyMap.ts',import.meta.url);
const {courseDecor,COURSE_DECOR}=await importTs('../src/game/CourseDecor.ts',import.meta.url);
const {COURSES}=await importTs('../src/game/CourseCatalog.ts',import.meta.url);
const {parseEconomyResult}=await importTs('../src/shop/EconomySnapshot.ts',import.meta.url);
const {HomeShopPreview}=await importTs('../src/home/HomeShopPreview.ts',import.meta.url);
const {EconomyClient}=await importTs('../src/shop/EconomyClient.ts',import.meta.url);
const {ServerShopState}=await importTs('../src/shop/ServerShopState.ts',import.meta.url);
const {COURSE_COINS,courseCoinLimit}=await importTs('../src/game/CourseCoins.ts',import.meta.url);
const db=new PGlite();after(()=>db.close());
await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema realtime;create table realtime.messages(extension text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;");
for(const file of ['202610170001_player_accounts.sql','202610170002_server_economy.sql','202610190003_multiplayer.sql','202610210008_home_shop.sql','202610230009_friends.sql','202610230010_friend_invites.sql','202610240011_snacks.sql','202610240012_park_channels.sql','202610250015_player_blocks.sql','202610240013_mailbox.sql','202610250016_mail_coupons.sql','202610250017_friend_home_visits.sql','202610260019_mail_receipts.sql','202610270021_garden_props_shop.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
const users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];for(const [i,id]of users.entries()){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into public.player_profiles(user_id,nickname)values($1,$2)',[id,'Player'+i]);}
let seq=0;const nonce=()=>`aaaaaaaa-1111-4111-8111-${String(++seq).padStart(12,'0')}`;
async function as(n,sql,args=[],role='authenticated'){await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':users[n]]);return(await db.query(sql,args)).rows[0]?.data;}finally{await db.exec('reset role');}}
const economy=(n,action='load',payload={},id=nonce())=>as(n,'select public.economy_command($1,$2,$3) as data',[action,id,JSON.stringify(payload)]);
test('garden sprites share original PNGs and purchased stock; scenery never mutates course geometry',async()=>{
 const names={greenTree:'Small_Green_Tree_Prototype.png',cherryTree:'Small_Cherry_Tree_Prototype.png',fence:'Low_Wooden_Fence_Prototype.png',crate:'Wooden_Box_Prototype.png'};
 const textures={};for(const [id,s]of Object.entries(GARDEN_PROPS)){
  const original=await readFile(new URL('../Resources/'+names[id],import.meta.url)),png=await readFile(new URL('../public/'+s.file,import.meta.url));assert.ok(original.equals(png));assert.equal(png.readUInt32BE(16),s.source[0]);assert.equal(png.readUInt32BE(20),s.source[1]);
  assert.ok(s.frame[0]>=0&&s.frame[1]>=0&&s.frame[0]+s.frame[2]<=s.source[0]&&s.frame[1]+s.frame[3]<=s.source[1]);textures[id]=new Texture({source:new TextureSource({width:s.frame[2],height:s.frame[3]})});
 }
 const entries=new Map(),storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)},shop=new ShopState(storage),home=new HomeState(storage,(tab,index)=>shop.homeOwned(tab,index));
 for(const index of [5,6,7]){assert.equal(shop.homeOwned('Etc',index),0);assert.equal(home.place('Etc',index),undefined);assert.equal(shop.buyHome('Etc',index),'purchased');const id=home.place('Etc',index);assert.ok(id);assert.equal(home.remaining('Etc',index),0);}
 const restored=new HomeState(storage,(tab,index)=>shop.homeOwned(tab,index));assert.equal(restored.items.length,3);
 const map=new LobbyMap({background:Texture.WHITE,floor:Texture.WHITE,cushion:Texture.WHITE,...textures});map.draw(960,540,home.current,home.items);assert.equal(map.objects.children.length,3);assert.ok(map.objects.children.every(view=>view.children.some(c=>c.label.startsWith('garden-prop-'))));map.destroy({children:true});
 for(const [id,course]of Object.entries(COURSES)){const before=JSON.stringify(course.solids),decor=courseDecor(id,textures);assert.equal(decor.children.length,COURSE_DECOR[id].length);assert.equal(decor.eventMode,'none');for(const [,x]of COURSE_DECOR[id])assert.ok(course.solids.some(s=>s.top===0&&x>=s.x+60&&x<=s.x+s.width-60));decor.destroy({children:true});assert.equal(JSON.stringify(course.solids),before);}
 assert.ok(Object.values(textures).every(t=>!t.destroyed));Object.values(textures).forEach(t=>t.destroy(true));
});
test('new garden stock is server-priced, idempotent, bounded and recognized by mail and friend visits',async()=>{
 assert.deepEqual((await economy(0)).snapshot.homeItems,{});const id=nonce();const bought=await economy(0,'buy_home',{category:'Etc',index:5,price:0},id);assert.equal(bought.snapshot.coins,775);assert.equal(bought.snapshot.homeItems['Etc:5'],1);assert.equal((await economy(0,'buy_home',{category:'Etc',index:5,price:0},id)).snapshot.coins,775);
 assert.equal((await economy(1)).snapshot.homeItems['Etc:5'],undefined);await assert.rejects(economy(0,'buy_home',{category:'Etc',index:8}),/invalid_home_item/);
 for(const index of [6,7])assert.equal((await economy(0,'buy_home',{category:'Etc',index})).outcome,'purchased');
 const mail=await as(null,"select public.send_player_mail($1,'garden-test','Garden gift','Enjoy the garden',$2) as data",[users[0],JSON.stringify({home:[{category:'Etc',index:6,quantity:1},{category:'Etc',index:7,quantity:2}]})],'service_role');
 const claimed=await as(0,"select public.mailbox_command('claim',$1) as data",[mail]);assert.equal(claimed.received.home,3);assert.equal((await economy(0)).snapshot.homeItems['Etc:7'],3);
 await db.query("insert into public.player_friendships(user_low,user_high,status,requested_by)values($1,$2,'accepted',$1)",[users[0],users[1]]);
 await db.query('insert into public.player_saves(user_id,snapshot)values($1,$2)',[users[0],JSON.stringify({character:{petId:'corgi',outfit:{}},home:{version:2,Background:0,Floor:0,items:[{id:1,tab:'Etc',option:5,x:.3,y:.75},{id:2,tab:'Etc',option:6,x:.6,y:.75}]}})]);
 const visit=await as(1,'select public.visit_friend_home($1) as data',[users[0]]);assert.deepEqual(visit.home.items.map(i=>i.option),[5,6]);
 await db.query("update public.economy_home_items set quantity=20 where user_id=$1 and category='Etc' and item_index=5",[users[0]]);assert.equal((await economy(0,'buy_home',{category:'Etc',index:5})).outcome,'limit');
 await db.exec(await readFile(new URL('../supabase/migrations/202610270021_garden_props_shop.sql',import.meta.url),'utf8'));assert.equal((await economy(0)).snapshot.homeItems['Etc:5'],20);
});

test('shop lobby previews reuse room art, replace temporary products and never write saved room state',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},home=new HomeState(storage);
 home.select('Background',2);home.select('Floor',3);home.place('Furniture',1);
 const before=JSON.stringify([...data]),saved=JSON.stringify({look:home.current,items:home.items}),revision=home.revision;
 const texture=()=>new Texture({source:new TextureSource({width:160,height:100})});
 const textures={background:texture(),noon:texture(),sunset:texture(),night:texture(),floor:texture(),cushion:texture(),sofa:texture(),greenTree:texture(),cherryTree:texture(),fence:texture(),crate:texture()};
 const preview=new HomeShopPreview(textures),map=preview.map;
 try{
  preview.showSelection(home,'Background',3);assert.equal(map.children[1].texture,textures.night);assert.equal(map.objects.children.length,1);
  preview.showSelection(home,'Floor',0);assert.equal(map.children[1].texture,textures.sunset);assert.equal(map.children[2].visible,true);
  preview.showSelection(home,'Furniture',5);const sofa=map.objects.children.find(c=>c.label==='-1005');assert.equal(map.objects.children.length,2);assert.equal(sofa.children[1].texture,textures.sofa);assert.equal(sofa.x,480);assert.equal(sofa.y,405);
  preview.showSelection(home,'Etc',5);assert.equal(sofa.destroyed,true);const tree=map.objects.children.find(c=>c.label==='-1105');assert.equal(tree.children[1].texture,textures.greenTree);
  preview.showSelection(home,'Etc',6);assert.equal(tree.destroyed,true);const cherry=map.objects.children.find(c=>c.label==='-1106');assert.equal(cherry.children[1].texture,textures.cherryTree);
  preview.showSelection(home,'Etc',6);assert.equal(map.objects.children.length,2);assert.equal(cherry.destroyed,false);
  preview.showSelection(home,'Background',0);assert.equal(cherry.destroyed,true);assert.equal(map.objects.children.length,1);
  assert.equal(JSON.stringify([...data]),before);assert.equal(JSON.stringify({look:home.current,items:home.items}),saved);assert.equal(home.revision,revision);assert.equal(preview.eventMode,'none');assert.equal(map.scale.x,420/960);
 }finally{preview.destroy({children:true});assert.ok(Object.values(textures).every(t=>!t.destroyed));Object.values(textures).forEach(t=>t.destroy(true));}
});

test('guest run rewards persist once and remain independent from daily quest claims',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},state=new ShopState(storage);
 state.beginRun('practice');state.completeRun(3);assert.equal(state.coins,1013);assert.deepEqual(state.runReward,{status:'confirmed',collected:3,coins:13});
 state.completeRun(3);assert.equal(state.coins,1013);assert.equal(new ShopState(storage).coins,1013);assert.equal(state.claimDaily('run'),true);assert.equal(state.coins,1113);
 state.beginRun('practice');state.completeRun(9);assert.equal(state.coins,1113);
});

test('backgrounds unlock once, persist and gate Home selection without consuming stock or changing saved looks',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const state=new ShopState(storage),home=new HomeState(storage,(tab,index)=>state.homeOwned(tab,index));
 assert.equal(state.homeOwned('Background',0),1);assert.equal(state.buyHome('Background',0),'limit');
 assert.equal(home.select('Background',1),false);
 for(const index of [1,2,3]){const coins=state.coins;assert.equal(state.buyHome('Background',index),'purchased');assert.equal(state.coins,coins-200);assert.equal(state.buyHome('Background',index),'limit');assert.equal(home.select('Background',index),true);assert.equal(state.homeOwned('Background',index),1);}
 const restored=new ShopState(storage);assert.equal(restored.coins,400);assert.equal(restored.homeOwned('Background',3),1);assert.equal(new HomeState(storage,(tab,index)=>restored.homeOwned(tab,index)).current.Background,3);
 assert.equal(restored.buyHome('Background',4),'invalid');assert.equal(restored.buyHome('Background',-1),'invalid');
 data.set('pawhaven.home.v1',JSON.stringify({version:2,Background:2,Floor:3,items:[]}));
 const legacy=new HomeState(storage,()=>0);assert.equal(legacy.current.Background,2);assert.equal(legacy.backgroundAvailable(2),true);assert.equal(legacy.select('Background',3),false);assert.equal(legacy.select('Floor',1),true);
});

test('Lobby Background Shop enforces server price, ownership cap, account isolation and safe replay',async()=>{
 assert.equal((await economy(1)).snapshot.homeBackgroundShopReady,undefined);
 const sql=await readFile(new URL('../supabase/migrations/202610270022_lobby_background_shop.sql',import.meta.url),'utf8');await db.exec(sql);
 const initial=await economy(1);assert.equal(initial.snapshot.homeBackgroundShopReady,true);assert.equal(parseEconomyResult(initial).snapshot.homeBackgroundShopReady,true);
 const id=nonce(),payload={category:'Background',index:1,price:0};
 const bought=await economy(1,'buy_home',payload,id);assert.equal(bought.snapshot.coins,800);assert.equal(bought.snapshot.homeItems['Background:1'],1);
 assert.equal((await economy(1,'buy_home',payload,id)).snapshot.coins,800);
 assert.equal((await economy(1,'buy_home',payload)).outcome,'limit');assert.equal((await economy(0)).snapshot.homeItems['Background:1'],undefined);
 assert.equal((await economy(1,'buy_home',{category:'Background',index:0})).outcome,'limit');
 for(const index of [-1,4,1.5,'1'])await assert.rejects(economy(1,'buy_home',{category:'Background',index}));
 await assert.rejects(economy(1,'buy_home',{category:'Background',index:2},id),/request_id_reused/);
 await assert.rejects(as(1,"insert into public.economy_home_items values($1,'Background',2,1)",[users[1]]),/permission denied/);
 await assert.rejects(db.query("update public.economy_home_items set quantity=2 where user_id=$1 and category='Background'",[users[1]]));
 await db.exec(sql);assert.equal((await economy(1)).snapshot.homeItems['Background:1'],1);
 for(const index of [2,3])assert.equal((await economy(1,'buy_home',{category:'Background',index})).outcome,'purchased');
 const result=await economy(1);assert.equal(result.snapshot.coins,400);assert.equal(parseEconomyResult(result).snapshot.homeItems['Background:3'],1);
 const corrupt=structuredClone(result);corrupt.snapshot.homeItems['Background:3']=2;assert.throws(()=>parseEconomyResult(corrupt),/invalid_economy_response/);
});

test('Single Run Coin Rewards pays a bounded server-derived receipt once per map token',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/202610280023_single_run_rewards.sql',import.meta.url),'utf8');await db.exec(sql);
 const age=run=>db.query("update public.economy_runs set started_at=clock_timestamp()-interval '6 seconds' where id=$1",[run]);
 for(const [map,coins]of Object.entries(COURSE_COINS)){
  const before=(await economy(1)).snapshot.coins,start=await economy(1,'run_start',{map});await age(start.run_id);const id=nonce(),payload={run_id:start.run_id,collected:coins.length,reward:999999};
  const done=await economy(1,'run_finish',payload,id);assert.equal(done.snapshot.coins,before+10+coins.length);assert.deepEqual(done.run_reward,{collected:coins.length,bonus:10,coins:10+coins.length});assert.equal(parseEconomyResult(done).run_reward.coins,10+coins.length);
  assert.equal((await economy(1,'run_finish',payload,id)).snapshot.coins,done.snapshot.coins);assert.equal((await economy(1,'run_finish',payload)).outcome,'run_rejected');
 }
 const start=await economy(1,'run_start',{map:'practice'});assert.equal((await economy(1,'run_finish',{run_id:start.run_id,collected:0})).outcome,'run_rejected');await age(start.run_id);
 assert.equal((await economy(0,'run_finish',{run_id:start.run_id,collected:0})).outcome,'run_rejected');
 for(const collected of [8,-1,1.5,'3',null])await assert.rejects(economy(1,'run_finish',{run_id:start.run_id,collected}),/invalid_run_coins/);
 const done=await economy(1,'run_finish',{run_id:start.run_id,collected:2});assert.equal(done.run_reward.coins,12);
 await assert.rejects(economy(1,'run_start',{map:'fake'}),/invalid_run_map/);
 const expired=await economy(1,'run_start',{map:'garden'});await db.query("update public.economy_runs set expires_at=clock_timestamp()-interval '1 second' where id=$1",[expired.run_id]);assert.equal((await economy(1,'run_finish',{run_id:expired.run_id,collected:0})).outcome,'run_rejected');
 await assert.rejects(as(1,"update public.economy_runs set consumed=false where id=$1",[done.run_id]),/permission denied/);
 const capped=await economy(1,'run_start',{map:'garden'});await age(capped.run_id);await db.query('update public.economy_wallets set coins=999995 where user_id=$1',[users[1]]);assert.equal((await economy(1,'run_finish',{run_id:capped.run_id,collected:10})).run_reward.coins,5);
 await db.exec(sql);assert.equal((await economy(1)).snapshot.coins,1000000);
 const corrupt=structuredClone(done);corrupt.run_reward.coins=999;assert.throws(()=>parseEconomyResult(corrupt),/invalid_economy_response/);
});

test('a lost run reward response retries the same receipt and updates the subscribed account only once',async()=>{
 let lose=true;const requests=[];const transport=async request=>{requests.push(structuredClone(request));const result=await economy(0,request.p_action,request.p_payload,request.p_request_id);if(request.p_action==='run_finish'&&lose){lose=false;throw Error('lost response')}return result};
 const api=new EconomyClient(transport,nonce),state=new ServerShopState(api),idle=async()=>{while(api.busy)await new Promise(r=>setImmediate(r))};let updates=0;const off=state.subscribe(()=>updates++);
 try{
  await idle();const before=state.coins;assert.equal(await state.beginRun('practice'),true);await idle();await db.query("update public.economy_runs set started_at=clock_timestamp()-interval '6 seconds' where user_id=$1 and not consumed",[users[0]]);
  await state.completeRun(3);await idle();assert.equal(state.runReward.status,'pending');assert.equal(state.coins,before);assert.equal(state.connection,'offline');await state.retry();await idle();
  assert.deepEqual(state.runReward,{status:'confirmed',collected:3,coins:13});assert.equal(state.coins,before+13);const finish=requests.filter(r=>r.p_action==='run_finish');assert.equal(finish.length,2);assert.equal(finish[0].p_request_id,finish[1].p_request_id);assert.ok(updates>0);await state.completeRun(3);assert.equal(state.coins,before+13);
 }finally{off();state.destroy();api.destroy();}
});

test('run reward SQL recovers a missing treat wallet schema without resetting balances or owned items',async()=>{
 const before=(await economy(0)).snapshot;
 await db.exec('alter table public.economy_wallets drop column snacks cascade;alter table public.economy_wallets drop column last_snack;');
 await db.exec(await readFile(new URL('../supabase/migrations/202610280023_single_run_rewards.sql',import.meta.url),'utf8'));
 const after=(await economy(0)).snapshot;assert.equal(after.coins,before.coins);assert.deepEqual(after.homeItems,before.homeItems);assert.equal(after.snacks,0);assert.equal(after.runRewardsReady,true);
 const start=await economy(0,'run_start',{map:'practice'});await db.query("update public.economy_runs set started_at=clock_timestamp()-interval '6 seconds' where id=$1",[start.run_id]);assert.equal((await economy(0,'run_finish',{run_id:start.run_id,collected:0})).run_reward.coins,10);
});

test('multiplayer coins use server round/finish records and preserve the receipt after room deletion',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/202610280024_multiplayer_rewards.sql',import.meta.url),'utf8');await db.exec(sql);
 await db.query('update public.economy_wallets set coins=1000 where user_id=any($1::uuid[])',[users]);
 const room=nonce(),round=nonce();await db.query("insert into public.mp_rooms(id,name,host,map,phase,round_id,starts_at)values($1,'Reward room',$2,'practice','results',$3,clock_timestamp()-interval '12 seconds')",[room,users[0],round]);
 for(let i=0;i<2;i++)await db.query('insert into public.mp_racers(room_id,user_id,nickname,finished_ms)values($1,$2,$3,$4)',[room,users[i],'Player'+i,i===1?9000:null]);
 assert.equal((await economy(0,'race_reward',{room,round,collected:3})).outcome,'run_rejected');
 for(const collected of [8,-1,1.5,'3',null])await assert.rejects(economy(1,'race_reward',{room,round,collected}));
 const id=nonce(),payload={room,round,collected:3,reward:999999};const paid=await economy(1,'race_reward',payload,id);assert.equal(paid.snapshot.coins,1013);assert.equal(paid.snapshot.raceRewardsReady,true);assert.equal(parseEconomyResult(paid).run_reward.coins,13);
 assert.equal((await economy(1,'race_reward',payload,id)).snapshot.coins,1013);assert.equal((await economy(1,'race_reward',payload)).snapshot.coins,1013);
 assert.equal((await db.query('select count(*)::int as n from public.economy_race_rewards where user_id=$1 and round_id=$2',[users[1],round])).rows[0].n,1);
 await assert.rejects(as(1,'delete from public.economy_race_rewards where user_id=$1',[users[1]]),/permission denied/);
 await db.query('delete from public.mp_rooms where id=$1',[room]);assert.equal((await economy(1,'race_reward',payload)).snapshot.coins,1013);assert.equal((await economy(0,'race_reward',{room,round:nonce(),collected:0})).outcome,'run_rejected');
 await db.exec(sql);assert.equal((await economy(1,'race_reward',payload)).run_reward.coins,13);
});

test('multiplayer reward retries update the same observer; DNF and older SQL never send a payout request',async()=>{
 const room=nonce(),round=nonce();await db.query("insert into public.mp_rooms(id,name,host,map,phase,round_id,starts_at)values($1,'Retry room',$2,'garden','results',$3,clock_timestamp()-interval '12 seconds')",[room,users[0],round]);await db.query("insert into public.mp_racers(room_id,user_id,nickname,finished_ms)values($1,$2,'Player0',9000)",[room,users[0]]);
 let lose=true;const requests=[];const transport=async request=>{requests.push(request);const result=await economy(0,request.p_action,request.p_payload,request.p_request_id);if(request.p_action==='race_reward'&&lose){lose=false;throw Error('lost race receipt')}return result};const api=new EconomyClient(transport,nonce),state=new ServerShopState(api),idle=async()=>{while(api.busy)await new Promise(r=>setImmediate(r))};
 try{await idle();const before=state.coins;await state.completeRace(room,round,4,true);await idle();assert.equal(state.runReward.status,'pending');assert.equal(state.coins,before);await state.retry();await idle();assert.deepEqual(state.runReward,{status:'confirmed',collected:4,coins:14});assert.equal(state.coins,before+14);const payouts=requests.filter(r=>r.p_action==='race_reward');assert.equal(payouts.length,2);assert.equal(payouts[0].p_request_id,payouts[1].p_request_id);await state.completeRace(room,round,4,false);assert.equal(state.runReward.status,'notFinished');assert.equal(requests.filter(r=>r.p_action==='race_reward').length,2);}finally{state.destroy();}
 let calls=0;const oldApi=new EconomyClient(async request=>{calls++;const result=await economy(0,request.p_action,request.p_payload,request.p_request_id);delete result.snapshot.raceRewardsReady;return result},nonce),oldState=new ServerShopState(oldApi);while(oldApi.busy)await new Promise(r=>setImmediate(r));const before=calls;await oldState.completeRace(room,round,4,true);assert.equal(oldState.runReward.status,'unavailable');assert.equal(calls,before);oldState.destroy();
});

test('guest daily coin quest persists capped progress, pays only coins once and resets the next day',()=>{
 let now=Date.now();const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},state=new ShopState(storage,()=>now),quest=()=>state.dailyQuests.find(q=>q.id==='coins');
 assert.equal(quest().progress,0);assert.equal(state.claimDaily('coins'),false);state.beginRun('practice');assert.equal(quest().progress,0);
 state.completeRun(7);state.completeRun(7);assert.equal(quest().progress,7);
 for(const collected of [7,7]){state.beginRun('practice');state.completeRun(collected);}assert.equal(quest().progress,20);assert.equal(quest().canClaim,true);assert.equal(state.hasDailyRewards,true);
 const before=state.coins,snacks=state.snacks;assert.equal(state.claimDaily('coins'),true);assert.equal(state.coins,before+50);assert.equal(state.snacks,snacks);assert.equal(state.claimDaily('coins'),false);
 const restored=new ShopState(storage,()=>now);assert.equal(restored.dailyQuests.find(q=>q.id==='coins').claimed,true);assert.equal(restored.coins,before+50);
 now+=86400000;restored.refreshDaily();assert.equal(restored.dailyQuests.find(q=>q.id==='coins').progress,0);assert.equal(restored.dailyQuests.find(q=>q.id==='coins').claimed,false);
});

test('Daily Coin Collector Quest combines accepted single/multi runs once, pays 50 and resets by server day',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/202610280025_daily_coin_quest.sql',import.meta.url),'utf8');await db.exec(sql);
 const first=await economy(0);assert.equal(first.snapshot.dailyCoinQuestReady,true);assert.equal(first.snapshot.daily.coins,0);assert.equal((await economy(0,'claim_daily',{quest:'coins'})).outcome,'ignored');
 const start=await economy(0,'run_start',{map:'practice'});assert.equal((await economy(0,'run_finish',{run_id:start.run_id,collected:7})).snapshot.daily.coins,0);await db.query("update public.economy_runs set started_at=clock_timestamp()-interval '6 seconds' where id=$1",[start.run_id]);const key=nonce(),payload={run_id:start.run_id,collected:7};assert.equal((await economy(0,'run_finish',payload,key)).snapshot.daily.coins,7);assert.equal((await economy(0,'run_finish',payload,key)).snapshot.daily.coins,7);assert.equal((await economy(0,'run_finish',payload)).snapshot.daily.coins,7);
 const room=nonce(),round=nonce();await db.query("insert into public.mp_rooms(id,name,host,map,phase,round_id,starts_at)values($1,'Quest room',$2,'garden','results',$3,clock_timestamp()-interval '12 seconds')",[room,users[0],round]);for(let i=0;i<2;i++)await db.query('insert into public.mp_racers(room_id,user_id,nickname,finished_ms)values($1,$2,$3,$4)',[room,users[i],'Player'+i,i===0?9000:null]);
 const race={room,round,collected:10};assert.equal((await economy(0,'race_reward',race)).snapshot.daily.coins,17);assert.equal((await economy(0,'race_reward',race)).snapshot.daily.coins,17);assert.equal((await economy(1,'race_reward',race)).snapshot.daily.coins,0);
 const last=await economy(0,'run_start',{map:'practice'});await db.query("update public.economy_runs set started_at=clock_timestamp()-interval '6 seconds' where id=$1",[last.run_id]);assert.equal((await economy(0,'run_finish',{run_id:last.run_id,collected:7})).snapshot.daily.coins,20);
 const before=(await economy(0)).snapshot,claim=await economy(0,'claim_daily',{quest:'coins'});assert.equal(claim.snapshot.coins,before.coins+50);assert.equal(claim.snapshot.snacks,before.snacks);assert.equal(claim.snapshot.daily.coinsClaimed,true);assert.equal(claim.snapshot.daily.claimed.includes('coins'),false);assert.equal(parseEconomyResult(claim).snapshot.daily.coins,20);assert.equal((await economy(0,'claim_daily',{quest:'coins'})).snapshot.coins,claim.snapshot.coins);
 await db.exec(sql);assert.equal((await economy(0)).snapshot.daily.coinsClaimed,true);
 const api=new EconomyClient(request=>economy(0,request.p_action,request.p_payload,request.p_request_id),nonce),state=new ServerShopState(api);while(api.busy)await new Promise(r=>setImmediate(r));assert.equal(state.dailyQuests.find(q=>q.id==='coins').claimed,true);state.destroy();
 const corrupt=structuredClone(claim);corrupt.snapshot.daily.coins=21;assert.throws(()=>parseEconomyResult(corrupt),/invalid_economy_response/);
 const day=claim.snapshot.daily.day;await db.query("update public.economy_claims set claim_key='daily:' || (($2::date-1)::text) || ':coins' where user_id=$1 and claim_key='daily:' || $2 || ':coins'",[users[0],day]);await db.query("update public.economy_wallets set quest_day=quest_day-1 where user_id=$1",[users[0]]);
 const reset=await economy(0);assert.equal(reset.snapshot.daily.coins,0);assert.equal(reset.snapshot.daily.coinsClaimed,false);assert.equal(reset.snapshot.coins,claim.snapshot.coins);assert.equal((await economy(0,'race_reward',race)).snapshot.daily.coins,0);assert.equal((await economy(0,'run_finish',payload,key)).snapshot.daily.coins,0);
 let requests=0;const oldApi=new EconomyClient(async request=>{requests++;const result=await economy(0,request.p_action,request.p_payload,request.p_request_id);delete result.snapshot.dailyCoinQuestReady;delete result.snapshot.daily.coins;delete result.snapshot.daily.coinsClaimed;return result},nonce),oldState=new ServerShopState(oldApi);while(oldApi.busy)await new Promise(r=>setImmediate(r));const calls=requests;assert.deepEqual(oldState.dailyQuests.map(q=>q.id),['pet','run']);assert.equal(await oldState.claimDaily('coins'),false);assert.equal(requests,calls);oldState.destroy();
});

test('box coin reward limits match map collectibles plus targets for single/multi and keep prior receipts',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/202610280026_box_coin_rewards.sql',import.meta.url),'utf8');await db.exec(sql);
 assert.equal((await economy(1)).snapshot.boxCoinRewardsReady,true);
 for(const map of Object.keys(COURSE_COINS)){
  const limit=courseCoinLimit(map);assert.equal(limit,COURSE_COINS[map].length+COURSES[map].targets.length);
  const before=(await economy(1)).snapshot.coins,start=await economy(1,'run_start',{map});await db.query("update public.economy_runs set started_at=clock_timestamp()-interval '6 seconds' where id=$1",[start.run_id]);
  await assert.rejects(economy(1,'run_finish',{run_id:start.run_id,collected:limit+1}),/invalid_run_coins/);
  const id=nonce(),payload={run_id:start.run_id,collected:limit},done=await economy(1,'run_finish',payload,id);assert.equal(done.snapshot.coins,before+10+limit);assert.equal(parseEconomyResult(done).run_reward.coins,10+limit);assert.equal((await economy(1,'run_finish',payload,id)).snapshot.coins,done.snapshot.coins);
 }
 const room=nonce(),round=nonce();await db.query("insert into public.mp_rooms(id,name,host,map,phase,round_id,starts_at)values($1,'Box coins',$2,'garden','results',$3,clock_timestamp()-interval '12 seconds')",[room,users[0],round]);await db.query("insert into public.mp_racers(room_id,user_id,nickname,finished_ms)values($1,$2,'Player1',9000)",[room,users[1]]);
 const before=(await economy(1)).snapshot.coins,payload={room,round,collected:12};const paid=await economy(1,'race_reward',payload);assert.equal(paid.snapshot.coins,before+22);assert.equal(paid.snapshot.daily.coins,20);assert.equal((await economy(1,'race_reward',payload)).snapshot.coins,paid.snapshot.coins);
 await db.exec(sql);assert.equal((await economy(1,'race_reward',payload)).run_reward.coins,22);const corrupt=structuredClone(paid);corrupt.run_reward.coins=26;assert.throws(()=>parseEconomyResult(corrupt),/invalid_economy_response/);
});
