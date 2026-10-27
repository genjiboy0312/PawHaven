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
