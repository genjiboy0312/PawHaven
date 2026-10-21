import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { importTs } from './load-typescript.mjs';
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'Node.js'},configurable:true});
const {RoomClient,roomTransport}=await importTs('../src/multiplayer/RoomClient.ts',import.meta.url);
const {PlayMenuPopup}=await importTs('../src/ui/PlayMenuPopup.ts',import.meta.url);
const {PlayScene}=await importTs('../src/game/scenes/PlayScene.ts',import.meta.url);
const {raceResults}=await importTs('../src/ui/RaceResults.ts',import.meta.url);
const {RacePodium}=await importTs('../src/ui/RacePodium.ts',import.meta.url);
const {RaceProgress}=await importTs('../src/ui/RaceProgress.ts',import.meta.url);
const {SingleRecords,SINGLE_RECORDS_KEY}=await importTs('../src/game/SingleRecords.ts',import.meta.url);
const {AccountStorage}=await importTs('../src/account/AccountStorage.ts',import.meta.url);
const {DummyRun}=await importTs('../src/game/DummyRun.ts',import.meta.url);
const {COURSES}=await importTs('../src/game/CourseCatalog.ts',import.meta.url);
const {createCourseArt,courseTerrain,courseMarker}=await importTs('../src/game/CourseArt.ts',import.meta.url);
const {RemoteMotion}=await importTs('../src/multiplayer/RemoteMotion.ts',import.meta.url);
const {raceCountdown}=await importTs('../src/multiplayer/RaceCountdown.ts',import.meta.url);
const {roomStream}=await importTs('../src/multiplayer/RoomStream.ts',import.meta.url);
const {lobbyStream}=await importTs('../src/multiplayer/RoomStream.ts',import.meta.url);
const {enterLandscape,portraitTouch,installMobileViewport}=await importTs('../src/ui/MobileViewport.ts',import.meta.url);
const {Texture,TextureSource}=await import('pixi.js');
const db = new PGlite();
const users = [1,2,3,4,5].map(n => `${n}`.repeat(8) + '-1111-4111-8111-111111111111');
await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon;");
for (const file of ['202610170001_player_accounts.sql','202610170002_server_economy.sql','202610190003_multiplayer.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
for (const user of users) await db.query('insert into auth.users values($1)',[user]);
// Supabase-owned Realtime primitives are replaced only in this local SQL harness.
await db.exec(`create schema realtime;create table realtime.messages(payload jsonb,event text,topic text,private boolean,extension text default 'broadcast');
alter table realtime.messages enable row level security;grant usage on schema realtime to authenticated;
create function realtime.topic() returns text language sql stable as $$select current_setting('test.realtime.topic',true)$$;
create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$insert into realtime.messages(payload,event,topic,private) values($1,$2,$3,$4)$$;`);
await db.exec(await readFile(new URL('../supabase/migrations/202610200004_room_stream.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/202610200005_direct_motion.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/202610200006_lobby_state.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/202610200007_race_countdown.sql',import.meta.url),'utf8'));
async function as(user,query,args=[],role='authenticated') {
  await db.exec('set role '+role);
  try { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']); return await db.query(query,args); }
  finally { await db.exec('reset role'); }
}
async function cmd(n,action,room=null,payload={}) { return (await as(users[n], 'select public.multiplayer_command($1,$2,$3) as result',[action,room,JSON.stringify(payload)])).rows[0].result; }
beforeEach(async()=>{await db.exec('truncate public.mp_rooms cascade;truncate realtime.messages');});
after(async()=>{await db.close();});

const artManifest=JSON.parse(await readFile(new URL('../public/assets/course/frames.json',import.meta.url),'utf8'));
function testCourseArt(){
  const images=Object.fromEntries(['grass','soil','start','checkpoint','finish'].map(id=>{const spec=artManifest.tiles[id]??artManifest.markers[id];return[id,new Texture({source:new TextureSource({width:spec.width,height:spec.height})})];}));
  return{images,art:createCourseArt(images,artManifest)};
}
function destroyCourseArt({images,art}){Object.values(art.markers).forEach(marker=>marker.texture.destroy(false));Object.values(images).forEach(texture=>texture.destroy(true));}

test('course PNGs preserve the generated Resources originals and match runtime frames',async()=>{
  const files={grass:'Terrain_Grass_Soil_Tile.png',soil:'Terrain_Soil_Fill_Tile.png',start:'Course_Start_Flag.png',checkpoint:'Course_Checkpoint_Flag.png',finish:'Course_Finish_Flag.png'};
  for(const [id,name]of Object.entries(files)){
    const spec=artManifest.tiles[id]??artManifest.markers[id];
    const original=await readFile(new URL('../Resources/'+name,import.meta.url)),runtime=await readFile(new URL('../public/assets/course/'+spec.file,import.meta.url));
    assert.ok(original.equals(runtime));assert.equal(runtime.readUInt32BE(16),spec.width);assert.equal(runtime.readUInt32BE(20),spec.height);
    if(spec.frame){assert.ok(spec.frame.x>=0&&spec.frame.y>=0);assert.ok(spec.frame.x+spec.frame.width<=spec.width);assert.ok(spec.frame.y+spec.frame.height<=spec.height);}
  }
});

test('textured terrain stays inside every collision solid and marker feet share the exact ground baseline',()=>{
  const bundle=testCourseArt(),{art}=bundle;
  try{
    for(const map of Object.values(COURSES)){
      const view=courseTerrain(map.solids,art);assert.equal(view.children.length,map.solids.length*2);
      map.solids.forEach((solid,index)=>{
        const [soil,grass]=view.children.slice(index*2,index*2+2);
        for(const sprite of [soil,grass]){assert.equal(sprite.x,solid.x);assert.equal(sprite.y,390-solid.top);assert.equal(sprite.width,solid.width);}
        assert.equal(soil.height,solid.top-solid.bottom);assert.equal(grass.height,Math.min(96,solid.top-solid.bottom));assert.equal(grass.texture,art.grass);
      });view.destroy({children:true});
    }
    for(const id of ['start','checkpoint','finish']){
      const sprite=courseMarker(id,art,5100),spec=artManifest.markers[id];
      assert.ok(Math.abs(sprite.x+(spec.foot.x-spec.frame.x-sprite.anchor.x*spec.frame.width)*sprite.scale.x-5100)<.0001);
      assert.ok(Math.abs(sprite.y+(spec.foot.y-spec.frame.y-sprite.anchor.y*spec.frame.height)*sprite.scale.y-390)<.0001);
      assert.ok(Math.abs(spec.visibleHeight*sprite.scale.y-110)<.0001);sprite.destroy();
    }
    const bad=structuredClone(artManifest);bad.markers.finish.frame.width=99999;assert.throws(()=>createCourseArt(bundle.images,bad),/invalid_course_marker/);
  }finally{destroyCourseArt(bundle);}
});

test('every playable map uses shared terrain art and brightens its checkpoint after crossing without destroying shared textures',()=>{
  const env=dom(),bundle=testCourseArt();let scene;
  const config={id:'corgi',speed:90,scale:.62,animations:{idle:{frames:[Texture.WHITE],fps:3}}};
  try{
    for(const [id,map]of Object.entries(COURSES)){
      scene=new PlayScene(config,()=>{},{open(){},map:id,art:bundle.art});scene.update(.01);
      assert.equal(scene.world.children.find(c=>c.label==='course-terrain').children.length,map.solids.length*2);
      for(const [key,x]of [['start',120],['checkpoint',map.checkpoint],['finish',map.finish]]){const marker=scene.world.children.find(c=>c.label==='course-'+key);assert.equal(marker.x,x);assert.equal(marker.y,390);}
      assert.equal(scene.checkpointMarker.alpha,.6);scene.run.x=map.checkpoint+10;scene.update(.02);assert.equal(scene.checkpointMarker.alpha,1);assert.equal(scene.checkpointMarker.tint,0xffffff);
      scene.destroy({children:true});scene=undefined;assert.equal(bundle.art.markers.checkpoint.texture.destroyed,false);
    }
  }finally{scene?.destroy({children:true});destroyCourseArt(bundle);env.restore();}
});
test('rooms expose counts, serialize the fourth seat, isolate members and deny direct table access',async()=>{
  const room=(await cmd(0,'create',null,{name:'Friends',map:'garden'})).room;
  for (const n of [1,2,3]) await cmd(n,'join',room.id);
  assert.equal((await cmd(0,'list')).rooms[0].count,4);
  await assert.rejects(()=>cmd(4,'join',room.id),e=>e.code==='P0001');
  assert.equal((await cmd(4,'list')).room,null);
  await assert.rejects(()=>cmd(4,'ready',room.id,{ready:true}),e=>e.code==='42501');
  await assert.rejects(()=>as(users[0],'select * from public.mp_members'),e=>e.code==='42501');
  await assert.rejects(()=>as(null,"select public.multiplayer_command('list')",[],'anon'),e=>e.code==='42501');
});
test('only the host selects maps, map changes reset ready and start requires all guests ready',async()=>{
  const r=(await cmd(0,'create')).room; await cmd(1,'join',r.id);
  await assert.rejects(()=>cmd(0,'start',r.id),e=>e.code==='P0001');
  await assert.rejects(()=>cmd(1,'map',r.id,{map:'practice'}),e=>e.code==='42501');
  await cmd(1,'ready',r.id,{ready:true});
  assert.equal((await cmd(0,'map',r.id,{map:'practice'})).room.members[1].ready,false);
  await cmd(1,'ready',r.id,{ready:true});
  const start=(await cmd(0,'start',r.id)).room;
  assert.equal(start.phase,'countdown'); assert.equal(start.startsAt,null); assert.ok(start.round);
  await assert.rejects(()=>cmd(2,'join',r.id),e=>e.code==='P0001');
  await assert.rejects(()=>cmd(0,'map',r.id,{map:'garden'}),e=>e.code==='42501');
});
test('leaving transfers host and stale connections free seats',async()=>{
  const r=(await cmd(0,'create')).room; await cmd(1,'join',r.id); await cmd(2,'join',r.id);
  await cmd(0,'leave',r.id);
  assert.equal((await cmd(1,'sync',r.id)).room.host,users[1]);
  await db.query("update public.mp_members set seen_at=clock_timestamp()-interval '60 seconds' where user_id=$1",[users[1]]);
  const next=(await cmd(2,'sync',r.id)).room;
  assert.equal(next.host,users[2]); assert.equal(next.members.length,1);
  await cmd(2,'leave',r.id); assert.equal((await cmd(0,'list')).rooms.length,0);
});

test('a late scene holds all players at the loading barrier, then schedules one full countdown',async()=>{
  const room=(await cmd(0,'create')).room;
  for(const n of [1,2,3]){await cmd(n,'join',room.id);await cmd(n,'ready',room.id,{ready:true});}
  const start=(await cmd(0,'start',room.id)).room;
  for(const n of [0,1,2]){
    assert.equal((await cmd(n,'loaded',room.id,{round:start.round,user_id:users[3]})).room.startsAt,null);
  }
  assert.equal((await db.query('select loaded_round from public.mp_members where user_id=$1',[users[3]])).rows[0].loaded_round,null);
  await assert.rejects(()=>cmd(4,'loaded',room.id,{round:start.round}),e=>e.code==='42501');
  await assert.rejects(()=>cmd(3,'loaded',room.id,{round:'old'}),e=>e.code==='P0001');
  // An old host-start timestamp must not consume the guest's five digits.
  await db.query("update public.mp_rooms set ends_at=clock_timestamp()+interval '3 seconds' where id=$1",[room.id]);
  assert.equal((await cmd(0,'sync',room.id)).room.startsAt,null);
  const last=await cmd(3,'loaded',room.id,{round:start.round});
  assert.ok(last.room.startsAt-last.now>=7990);assert.equal(last.room.endsAt-last.room.startsAt,120000);
  for(const n of [0,1,2,3])assert.equal((await cmd(n,'loaded',room.id,{round:start.round})).room.startsAt,last.room.startsAt);
  assert.equal((await cmd(0,'sync',room.id)).room.startsAt,last.room.startsAt);
});

test('a missing scene cancels preparation instead of leaving the room stuck',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});
  const start=(await cmd(0,'start',room.id)).room;await cmd(0,'loaded',room.id,{round:start.round});
  await db.query("update public.mp_rooms set ends_at=clock_timestamp()-interval '1 second' where id=$1",[room.id]);
  const cancelled=(await cmd(0,'sync',room.id)).room;
  assert.equal(cancelled.phase,'waiting');assert.equal(cancelled.round,null);assert.equal(cancelled.startsAt,null);
  assert.ok(cancelled.members.every(m=>!m.ready));
  await assert.rejects(()=>cmd(1,'loaded',room.id,{round:start.round}),e=>e.code==='P0001');
});

test('countdown uses the shared clock for five digits, Ready and the Start movement boundary',()=>{
  const start=100000;
  assert.equal(raceCountdown(null,0),'');assert.equal(raceCountdown(start,start-8000),'');
  assert.deepEqual([6000,5000,4000,3000,2000,1000,0].map(ms=>raceCountdown(start,start-ms)),['5','4','3','2','1','Ready~','Start!']);
  assert.equal(raceCountdown(start,start-1),'Ready~');assert.equal(raceCountdown(start,start+799),'Start!');
  assert.equal(raceCountdown(start,start+800),'');
});
test('poses belong to the authenticated racer, stale rounds fail and finish times cannot be overwritten',async()=>{
  const r=(await cmd(0,'create')).room; await cmd(1,'join',r.id); await cmd(1,'ready',r.id,{ready:true});
  const start=(await cmd(0,'start',r.id)).room;
  await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '10 seconds' where id=$1",[r.id]);
  await assert.rejects(()=>cmd(0,'pose',r.id,{round:'old'}),e=>e.code==='P0001');
  const posed=await cmd(0,'pose',r.id,{round:start.round,x:6500,height:0,action:'run',user_id:users[1]});
  assert.equal(posed.room.members[0].pose.x,6500); assert.equal(posed.room.members[1].pose.x,120);
  const finish=await cmd(0,'finish',r.id,{round:start.round}); const time=finish.room.racers.find(a=>a.id===users[0]).time;
  assert.ok(time>=10000); assert.equal((await cmd(0,'finish',r.id,{round:start.round})).room.racers.find(a=>a.id===users[0]).time,time);
  await assert.rejects(()=>cmd(1,'finish',r.id,{round:start.round}),e=>e.code==='P0001');
  await db.query("update public.mp_rooms set ends_at=clock_timestamp()-interval '1 second' where id=$1",[r.id]);
  assert.equal((await cmd(1,'sync',r.id)).room.phase,'results');
  await cmd(0,'return',r.id); assert.equal((await cmd(0,'sync',r.id)).room.phase,'results');
  await cmd(1,'return',r.id); assert.equal((await cmd(0,'sync',r.id)).room.phase,'waiting');
});

test('a departing player cancels a countdown before the remaining host can race alone',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});
  await cmd(0,'start',room.id);await cmd(1,'leave',room.id);
  const next=(await cmd(0,'sync',room.id)).room;assert.equal(next.phase,'waiting');assert.equal(next.round,null);
});

class Element extends EventTarget {
  children=[];style={};attributes=new Map();classList={
    add:(name)=>{this.className=((this.className??'')+' '+name).trim();},
    remove:(name)=>{this.className=(this.className??'').split(' ').filter(n=>n!==name).join(' ');},
    contains:(name)=>(this.className??'').split(' ').includes(name),
    toggle:(name,on)=>{if(on&&!this.classList.contains(name))this.classList.add(name);if(!on)this.classList.remove(name);},
  };inert=false;scrollLeft=0;clientWidth=500;disabled=false;
  constructor(tag='div'){super();this.tag=tag;}
  get tagName(){return this.tag.toUpperCase();}
  contains(element){return element===this||this.all().includes(element);}
  append(...items){items.forEach(item=>{item.parent=this;this.children.push(item);});}
  replaceChildren(...items){this.children.forEach(c=>{c.parent=undefined;});this.children=[];this.append(...items);}
  setAttribute(k,v){this.attributes.set(k,v);}getAttribute(k){return this.attributes.get(k)??null;}
  all(){return this.children.flatMap(c=>[c,...c.all()]);}
  querySelector(s){return this.all().find(c=>c.className?.split(' ').includes(s.slice(1)));}
  querySelectorAll(){return this.all().filter(c=>c.tag==='button'&&!c.disabled);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  focus(){document.activeElement=this;}get isConnected(){return this.tag==='main'||!!this.parent?.isConnected;}
  blur(){if(document.activeElement===this)document.activeElement=undefined;}
  scrollBy({left}){this.scrollLeft+=left;this.dispatchEvent(new Event('scroll'));}
}
function dom(){
  const old={document:globalThis.document,window:globalThis.window,HTMLElement:globalThis.HTMLElement};const host=new Element('main');
  globalThis.HTMLElement=Element;globalThis.document=Object.assign(new EventTarget(),{createElement:tag=>new Element(tag),querySelector:()=>host,querySelectorAll:()=>[]});globalThis.window=new EventTarget();
  return {host,restore(){for(const key of Object.keys(old))if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key];}};
}
async function idle(client){for(let n=0;n<100;n++){await new Promise(r=>setTimeout(r,2));if(!client.busy&&!client.work)return;}throw Error('Room request did not settle');}

test('room menu renders four cards per page with counts and blocks full/running rooms',async()=>{
  const env=dom();const rooms=Array.from({length:6},(_,i)=>({id:String(i),name:'Room '+i,map:'garden',phase:i===1?'playing':'waiting',count:i===2?4:2}));
  const client=new RoomClient(users[0],async()=>({room:null,rooms,now:Date.now()}));let menu;
  try{
    menu=new PlayMenuPopup(()=>{},{rooms:client,single:async()=>true,race(){},login(){},dismiss(){}});menu.open('multi');await idle(client);
    const pager=env.host.querySelector('.room-pages');assert.equal(pager.children.length,2);assert.equal(pager.children[0].children.length,4);assert.equal(pager.children[1].children.length,2);
    assert.equal(pager.children[0].children[0].children[1].textContent,'2 / 4 · Waiting');assert.equal(pager.children[0].children[1].disabled,true);assert.equal(pager.children[0].children[2].disabled,true);
  }finally{menu?.destroy();client.destroy(false);env.restore();}
});

test('real room snapshots drive host Ready gating, countdown and popup cleanup',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);
  const env=dom(),hud=new Element();env.host.append(hud);let launches=0;const pauses=[];
  const client=new RoomClient(users[0],(a,r,p)=>cmd(0,a,r,p));let menu;
  try{
    menu=new PlayMenuPopup(v=>pauses.push(v),{rooms:client,single:async()=>true,race(){launches++;},login(){},dismiss(){}});
    menu.open('multi');await idle(client);
    let start=env.host.all().find(e=>e.textContent==='START');assert.equal(start.disabled,true);assert.equal(hud.inert,true);
    await cmd(1,'ready',room.id,{ready:true});await client.command('sync');
    start=env.host.all().find(e=>e.textContent==='START');assert.equal(start.disabled,false);start.dispatchEvent(new Event('click'));await idle(client);
    assert.equal(launches,1);assert.equal(pauses.at(-1),false);assert.equal(hud.inert,false);
  }finally{menu?.destroy();client.destroy(false);env.restore();}
});

test('room creation uses the host nickname for blank titles and preserves a custom title',async()=>{
  await db.query("insert into public.player_profiles(user_id,nickname) values($1,'명랑집사') on conflict(user_id) do update set nickname=excluded.nickname",[users[0]]);
  const env=dom(),client=new RoomClient(users[0],(a,r,p)=>cmd(0,a,r,p));let menu;
  try{
    menu=new PlayMenuPopup(()=>{},{rooms:client,nickname:()=> '명랑집사',single:async()=>true,race(){},login(){},dismiss(){}});
    menu.open('create');
    let input=env.host.all().find(e=>e.tag==='input');assert.equal(input.placeholder,'명랑집사님의 방');
    input.value='   ';input.dispatchEvent(new Event('input'));
    env.host.all().find(e=>e.tag==='button'&&e.textContent==='Create room').dispatchEvent(new Event('click'));await idle(client);
    assert.equal(client.room.name,'명랑집사님의 방');assert.equal(client.room.members[0].name,'명랑집사');
    await client.command('leave');menu.destroy();
    menu=new PlayMenuPopup(()=>{},{rooms:client,nickname:()=> '명랑집사',single:async()=>true,race(){},login(){},dismiss(){}});menu.open('create');
    input=env.host.all().find(e=>e.tag==='input');input.value='  함께 달려요  ';input.dispatchEvent(new Event('input'));
    env.host.all().find(e=>e.tag==='button'&&e.textContent==='Create room').dispatchEvent(new Event('click'));await idle(client);
    assert.equal(client.room.name,'함께 달려요');
  }finally{menu?.destroy();client.destroy(false);await db.query('delete from public.player_profiles where user_id=$1',[users[0]]);env.restore();}
});

test('course markers show clamped position, stable peer colors and only server-confirmed finish checks',()=>{
  const env=dom(),bar=new RaceProgress('self');env.host.append(bar.element);
  try{
    const entries=[{id:'self',name:'Me',x:120,finished:false},{id:'one',name:'One',x:620,finished:false},{id:'two',name:'Two',x:1120,finished:false},{id:'three',name:'Three',x:120,finished:false}];
    bar.update(entries,120,1120);
    const self=bar.markers.get('self').element,one=bar.markers.get('one').element,two=bar.markers.get('two').element;
    assert.equal(self.style.left,'0.00%');assert.equal(one.style.left,'50.00%');assert.equal(two.style.left,'100.00%');
    assert.equal(two.getAttribute('data-finished'),'false');assert.equal(self.children[0].className,'race-course-paw');
    assert.equal(self.children[0].children.length,4);assert.equal(one.getAttribute('aria-label'),'One · 50%');
    const colors=entries.filter(e=>e.id!=='self').map(e=>bar.markers.get(e.id).element.style.color);assert.equal(new Set(colors).size,3);
    const originalColor=one.style.color;
    bar.update([{...entries[2],x:-100,finished:true},{...entries[1],x:5000},{...entries[0],x:NaN}],120,1120);
    assert.equal(two.style.left,'100.00%');assert.equal(two.getAttribute('data-finished'),'true');assert.match(two.getAttribute('aria-label'),/✓$/);
    assert.equal(one.style.left,'100.00%');assert.equal(one.style.color,originalColor);assert.equal(self.style.left,'0.00%');
    assert.equal(bar.markers.size,3);assert.equal(bar.track.children.length,3);
    bar.update([{...entries[0],x:-1}],120,1120);assert.equal(self.style.left,'0.00%');assert.equal(bar.track.children.length,1);
    bar.destroy();assert.equal(env.host.querySelector('.race-course-progress'),undefined);
  }finally{env.restore();}
});

test('race scene freezes during countdown, draws peers and returns after server results',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});const start=(await cmd(0,'start',room.id)).room;
  const env=dom(),client=new RoomClient(users[0],(a,r,p)=>cmd(0,a,r,p));let scene,returned=0;
  try{
    await client.command('sync');const config={id:'corgi',speed:90,scale:0.62,animations:{idle:{frames:[Texture.WHITE],fps:3},run:{frames:Array(4).fill(Texture.WHITE),fps:8}}};
    scene=new PlayScene(config,()=>returned++,{open(){},multiplayer:{client,pets:[config],leave(){}}});
    scene.update(0.1);assert.equal(scene.run.x,120);assert.equal(scene.run.elapsed,0);assert.equal(scene.peers.size,1);
    assert.equal(scene.courseProgress.markers.size,2);assert.equal(scene.courseProgress.markers.get(users[0]).element.style.left,'0.00%');
    assert.equal((await db.query('select loaded_round from public.mp_members where user_id=$1',[users[0]])).rows[0].loaded_round,null);
    scene.update(0.1);await idle(client);
    assert.equal((await db.query('select loaded_round from public.mp_members where user_id=$1',[users[0]])).rows[0].loaded_round,start.round);
    assert.equal(client.room.startsAt,null);assert.equal(scene.countdown.textContent,'Waiting for players…');
    await cmd(1,'loaded',room.id,{round:start.round});await client.command('sync');
    for(const [remaining,label]of [[6000,'5'],[5000,'4'],[4000,'3'],[3000,'2'],[2000,'1'],[1000,'Ready~'],[0,'Start!']]){
      const now=performance.now();client.clockOffset=client.room.startsAt-remaining-now;scene.keys.add('KeyD');scene.update(0.01);
      assert.equal(scene.countdown.textContent,label);if(remaining>0)assert.equal(scene.run.x,120);
    }
    scene.keys.clear();client.clockOffset=undefined;
    const peer=scene.peers.get(users[1]);assert.equal(peer.box.alpha,1);assert.equal(peer.box.tint,0xb0b0b0);assert.equal(scene.pet.alpha,1);assert.equal(scene.pet.tint,0xffffff);
    assert.equal(peer.name.alpha,1);assert.equal(peer.name.parent,scene.nameLayer);assert.equal(peer.name.y,peer.box.y-155);
    assert.equal(scene.localName.text,client.room.members.find(m=>m.id===users[0]).name);assert.equal(scene.localName.alpha,1);
    assert.equal(scene.localName.y,scene.pet.y-155);
    await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '10 seconds' where id=$1",[room.id]);await client.command('sync');
    await cmd(1,'pose',room.id,{round:start.round,x:400,height:0,action:'run',vx:240});await client.command('sync');await new Promise(resolve=>setTimeout(resolve,75));scene.update(0.1);
    assert.ok(scene.peers.get(users[1]).box.x>120);
    assert.equal(scene.courseProgress.markers.get(users[1]).element.style.left,((scene.peers.get(users[1]).box.x-120)/(scene.run.finish-120)*100).toFixed(2)+'%');
    scene.update(0.1);assert.ok(scene.peers.get(users[1]).animation.sprite.currentFrame>0);
    scene.run.x=scene.run.finish;scene.update(0.01);await idle(client);scene.update(0.01);assert.equal(scene.back.disabled,true);
    assert.equal(scene.courseProgress.element.hidden,false);assert.equal(scene.courseProgress.markers.get(users[0]).element.getAttribute('data-finished'),'true');
    assert.match(scene.raceNote.textContent,/Waiting for friends · \d+s left/);
    assert.equal(scene.ranking.querySelector('.race-result-row').getAttribute('data-self'),'true');
    await db.query("update public.mp_rooms set ends_at=clock_timestamp()-interval '1 second' where id=$1",[room.id]);await client.command('sync');scene.update(0.01);
    assert.equal(scene.back.disabled,false);assert.equal(scene.raceNote.textContent,'It was lovely running together!');
    assert.equal(scene.courseProgress.element.hidden,true);
    assert.equal(scene.podium.element.querySelector('.race-winner-name').textContent,client.room.racers.find(r=>r.id===users[0]).name);
    assert.equal(scene.podium.element.querySelector('.race-podium-list').children[0].children[0].textContent,'DNF');
    assert.equal(scene.hud.inert,true);scene.podium.back.dispatchEvent(new Event('click'));scene.update(0.41);assert.equal(returned,1);
  }finally{scene?.destroy({children:true});await idle(client);client.destroy(false);env.restore();}
});

test('room requests pin the session owner and destroyed clients ignore late responses',async()=>{
  let active=users[0],calls=0,header;
  const send=roomTransport({auth:{getSession:async()=>({data:{session:{user:{id:active},access_token:'token-'+active}}})},rpc(){calls++;return {setHeader(k,v){header=v;return this;},abortSignal(){return Promise.resolve({data:{room:null,rooms:[],now:1},error:null});}};}},users[0]);
  await send('list',null,{},new AbortController().signal);assert.equal(header,'Bearer token-'+users[0]);active=users[1];await assert.rejects(()=>send('list',null,{},new AbortController().signal));assert.equal(calls,1);
  let release;const gate=new Promise(r=>{release=r;});const client=new RoomClient(users[0],async()=>{await gate;return {room:null,rooms:[],now:100};});const pending=client.command('list');client.destroy(false);release();await pending;assert.equal(client.snapshot.now,0);
});

test('single map choice launches without an account and restores the lobby input surface',async()=>{
  const env=dom(),hud=new Element();env.host.append(hud);let chosen,closed=0;const pauses=[];let menu;
  try{
    menu=new PlayMenuPopup(v=>pauses.push(v),{best:map=>map==='practice'?12345:null,single:async map=>{chosen=map;return true;},race(){},login(){},dismiss(){closed++;}});
    menu.open();env.host.all().find(e=>e.textContent==='Single').dispatchEvent(new Event('click'));
    assert.equal(env.host.querySelector('.single-map-summary').getAttribute('data-map'),'garden');
    assert.equal(env.host.querySelector('.single-map-change').textContent,'Choose map (3)');
    env.host.querySelector('.single-map-change').dispatchEvent(new Event('click'));
    const choices=env.host.querySelector('.single-map-choices');assert.equal(choices.children.length,3);
    assert.equal(choices.children.find(c=>c.getAttribute('data-map')==='garden').getAttribute('aria-pressed'),'true');
    assert.equal(choices.children.find(c=>c.getAttribute('data-map')==='forest').getAttribute('data-map'),'forest');
    choices.children.find(c=>c.getAttribute('data-map')==='practice').dispatchEvent(new Event('click'));
    assert.equal(chosen,undefined);assert.equal(env.host.querySelector('.single-map-choices'),undefined);
    assert.equal(env.host.querySelector('.single-map-summary').getAttribute('data-map'),'practice');
    assert.equal(env.host.querySelector('.single-map-practice').querySelector('.single-map-best').textContent,'Personal best 12.35s');
    env.host.querySelector('.single-map-play').dispatchEvent(new Event('click'));
    await new Promise(r=>setImmediate(r));assert.equal(chosen,'practice');assert.equal(closed,1);assert.equal(hud.inert,false);assert.equal(pauses.at(-1),false);
  }finally{menu?.destroy();env.restore();}
});

test('single personal records keep the faster valid completion and survive a local reload',()=>{
  const values=new Map(),disk={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  let records=new SingleRecords(disk);assert.equal(records.best('garden'),null);
  assert.equal(records.record('garden',30.1234),true);assert.equal(records.record('garden',30.1234),false);assert.equal(records.record('garden',40),false);
  assert.equal(records.record('garden',25.5),true);assert.equal(records.record('practice',10),true);
  assert.equal(records.record('forest',35),true);
  for(const invalid of [NaN,Infinity,-1,0])assert.equal(records.record('garden',invalid),false);
  assert.equal(records.record('__proto__',1),false);
  records=new SingleRecords(disk);assert.equal(records.best('garden'),25500);assert.equal(records.best('practice'),10000);
  assert.equal(records.best('forest'),35000);
  values.set(SINGLE_RECORDS_KEY,'{broken');assert.equal(new SingleRecords(disk).best('garden'),null);
  values.set(SINGLE_RECORDS_KEY,JSON.stringify({version:1,times:{garden:-1,practice:'123'}}));assert.equal(new SingleRecords(disk).best('practice'),null);
  const blocked=new SingleRecords({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
  assert.equal(blocked.record('garden',12),true);assert.equal(blocked.best('garden'),12000);
});

test('forest stepping route completes at 30/60/120 FPS with optional ground dashes and no forced fall',()=>{
  const map=COURSES.forest,jumps=[520,1170,2320,2820,4140,4450,4760,5470,6480,7020,7620,8130,8720,9280],times=[];
  for(const fps of [30,60,120])for(const dash of [false,true]){
    const run=new DummyRun(map.solids,1/.78,{finish:map.finish,checkpoint:map.checkpoint,targets:map.targets,manualReturn:true});
    let next=0,burst=0;const dashes=[3300,6000,9800];
    for(let frame=0;frame<fps*45&&!run.won;frame++){
      if(next<jumps.length&&run.x>=jumps[next]&&run.grounded){run.jump();next++;}
      if(dash&&burst<dashes.length&&run.x>=dashes[burst]&&run.grounded){run.startDash();burst++;}
      run.update(1/fps,1);
    }
    assert.equal(run.won,true,JSON.stringify({fps,dash,x:run.x,next}));assert.equal(run.respawns,0);assert.equal(run.checkpoint,5100);assert.equal(run.height,0);
    assert.ok(map.solids.some(s=>s.top===0&&s.x<run.finish-100&&s.x+s.width>run.finish+100));
    if(!dash){assert.ok(run.elapsed>=30&&run.elapsed<=40);times.push(run.elapsed);}else assert.equal(burst,3);
  }
  assert.ok(Math.max(...times)-Math.min(...times)<.05);
});

test('forest misses return to the start before the checkpoint and the safe middle clearing afterwards',()=>{
  const map=COURSES.forest,run=new DummyRun(map.solids,1/.78,{finish:map.finish,checkpoint:map.checkpoint,targets:map.targets,manualReturn:true});
  run.x=4150;for(let i=0;i<300&&run.respawns===0;i++)run.update(1/60,1);
  assert.equal(run.respawns,1);assert.equal(run.x,120);assert.equal(run.checkpoint,120);
  run.x=5200;run.update(.01,0);assert.equal(run.checkpoint,5100);const before=run.elapsed;
  run.x=6500;for(let i=0;i<300&&run.respawns===1;i++)run.update(1/60,1);
  assert.equal(run.respawns,2);assert.equal(run.x,5100);assert.equal(run.height,0);assert.equal(run.grounded,true);assert.ok(run.elapsed>before);
  run.x=3300;run.startDash();run.update(.32,1);assert.ok(run.x>3500&&run.x<4200);assert.equal(run.respawns,2);assert.equal(run.grounded,true);
});

test('forest can launch as single but never leaks into room creation after switching modes',async()=>{
  const env=dom(),client=new RoomClient(users[0],(a,r,p)=>cmd(0,a,r,p));let menu,chosen;
  try{
    menu=new PlayMenuPopup(()=>{},{rooms:client,single:async map=>{chosen=map;return false;},race(){},login(){},dismiss(){}});menu.open('single');
    env.host.querySelector('.single-map-change').dispatchEvent(new Event('click'));
    env.host.querySelector('.single-map-forest').dispatchEvent(new Event('click'));assert.equal(env.host.querySelector('.single-map-summary').getAttribute('data-map'),'forest');
    env.host.querySelector('.single-map-play').dispatchEvent(new Event('click'));await new Promise(resolve=>setImmediate(resolve));assert.equal(chosen,'forest');
    env.host.all().find(e=>e.tag==='button'&&e.textContent==='Back').dispatchEvent(new Event('click'));
    env.host.all().find(e=>e.tag==='button'&&e.textContent==='Multiplayer').dispatchEvent(new Event('click'));await idle(client);
    env.host.all().find(e=>e.tag==='button'&&e.textContent==='Create room').dispatchEvent(new Event('click'));
    const maps=env.host.querySelector('.mode-cards').children;assert.deepEqual(maps.map(e=>e.getAttribute('data-map')),['garden','practice']);
    env.host.all().find(e=>e.tag==='button'&&e.textContent==='Create room').dispatchEvent(new Event('click'));await idle(client);assert.equal(client.room.map,'garden');
  }finally{menu?.destroy();client.destroy(false);env.restore();}
});

test('single map dialog cancels with Escape without leaving Single or starting a run and restores opener focus',()=>{
  const env=dom(),hud=new Element();env.host.append(hud);let menu,launches=0;
  try{
    menu=new PlayMenuPopup(()=>{},{single:async()=>{launches++;return true;},race(){},login(){},dismiss(){}});menu.open('single');
    const opener=env.host.querySelector('.single-map-change');opener.dispatchEvent(new Event('click'));
    assert.equal(env.host.querySelector('.play-menu-panel').inert,true);assert.equal(opener.getAttribute('aria-expanded'),'true');
    const event=Object.assign(new Event('keydown',{cancelable:true}),{key:'Escape'});env.host.querySelector('.single-map-picker').dispatchEvent(event);
    assert.equal(event.defaultPrevented,true);assert.equal(env.host.querySelector('.single-map-picker'),undefined);assert.equal(launches,0);
    assert.equal(env.host.querySelector('.play-menu-panel').inert,false);assert.equal(opener.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,opener);
    assert.equal(env.host.querySelector('.single-map-summary').getAttribute('data-map'),'garden');assert.equal(hud.inert,true);
    opener.dispatchEvent(new Event('click'));menu.destroy();assert.equal(env.host.querySelector('.single-map-picker'),undefined);assert.equal(hud.inert,false);
  }finally{menu?.destroy();env.restore();}
});

test('single records are local to each guest or account without marking cloud saves dirty',()=>{
  const values=new Map(),storage=new AccountStorage({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)});
  new SingleRecords(storage).record('garden',20);
  storage.owner='first';let records=new SingleRecords(storage);assert.equal(records.best('garden'),null);records.record('garden',15);
  assert.equal(storage.meta.dirty,false);
  storage.owner='second';records=new SingleRecords(storage);assert.equal(records.best('garden'),null);records.record('practice',11);
  storage.owner='first';assert.equal(new SingleRecords(storage).best('garden'),15000);assert.equal(new SingleRecords(storage).best('practice'),null);
  storage.owner=null;assert.equal(new SingleRecords(storage).best('garden'),20000);
});

test('single scene records only a completed run once and highlights only an improved personal best',()=>{
  const env=dom(),records=new SingleRecords();let scene,completions=0,submissions=0;
  const config={id:'corgi',speed:90,scale:0.62,animations:{idle:{frames:[Texture.WHITE],fps:3}}};
  const settings={open(){},map:'practice',record(seconds){submissions++;return records.record('practice',seconds);},complete(){completions++;}};
  try{
    scene=new PlayScene(config,()=>{},settings);scene.update(.2);assert.equal(submissions,0);assert.equal(records.best('practice'),null);
    scene.run.elapsed=10;scene.run.x=scene.run.finish;scene.update(.1);scene.update(.5);
    assert.equal(submissions,1);assert.equal(completions,1);assert.equal(records.best('practice'),Math.round(scene.run.elapsed*1000));assert.equal(scene.bestNote.hidden,false);
    const best=records.best('practice');scene.destroy({children:true});
    scene=new PlayScene(config,()=>{},settings);scene.run.elapsed=12;scene.run.x=scene.run.finish;scene.update(.1);
    assert.equal(submissions,2);assert.equal(records.best('practice'),best);assert.equal(scene.bestNote.hidden,true);assert.equal(records.best('garden'),null);
  }finally{scene?.destroy({children:true});env.restore();}
});

test('background room refreshes never overlap while a response is pending',async()=>{
  let release,calls=0;const gate=new Promise(r=>{release=r;});
  const client=new RoomClient(users[0],async()=>{calls++;await gate;return {room:null,rooms:[],now:1};});
  try{client.start();client.start();assert.equal(calls,1);release();await idle(client);assert.equal(calls,1);}
  finally{release();client.destroy(false);}
});

test('waiting room shows real pets, Ready state and host transfer without leaking animation timers',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});
  const env=dom(),client=new RoomClient(users[1],(a,r,p)=>cmd(1,a,r,p));let menu;
  const config={id:'corgi',animations:{idle:{frames:[Texture.WHITE],fps:8}}};
  try{
    menu=new PlayMenuPopup(()=>{},{rooms:client,pets:[{config,thumbnail:'./assets/characters/corgi/corgi-idle-walk.png'}],single:async()=>true,race(){},login(){},dismiss(){}});
    menu.open('multi');await idle(client);
    const slots=env.host.querySelector('.room-slots');assert.equal(slots.children.length,4);
    assert.equal(slots.children[0].getAttribute('data-ready'),'true');assert.equal(slots.children[1].getAttribute('data-ready'),'true');assert.equal(slots.children[2].getAttribute('data-empty'),'true');
    assert.equal(env.host.querySelector('.room-start-hint').textContent,'Ready! Waiting for the host to start…');
    assert.ok(env.host.querySelector('.room-pet').style.backgroundImage.includes('corgi-idle-walk.png'));
    assert.ok(menu.portraitTimer);assert.ok(!env.host.all().some(e=>e.tag==='button'&&e.textContent==='START'));
    await cmd(0,'leave',room.id);await client.command('sync');
    assert.equal(env.host.querySelector('.room-start-hint').textContent,'Waiting for one more player…');
    assert.ok(env.host.querySelector('.room-event').textContent.endsWith('is now the host.'));
    assert.equal(env.host.all().find(e=>e.textContent==='START').disabled,true);
    menu.destroy();assert.equal(menu.portraitTimer,undefined);assert.equal(menu.portraits.length,0);
  }finally{menu?.destroy();client.destroy(false);env.restore();}
});

test('race result rows use accepted times, keep unfinished racers unranked and highlight the owner',()=>{
  const env=dom();
  try{
    const racers=[{id:'pending',name:'Still running',time:null,left:false},{id:'slow',name:'Slow',time:12000,left:false},{id:'fast',name:'<Fast>',time:9000,left:false},{id:'left',name:'Left',time:null,left:true}];
    const pet={id:'myeongrang',animations:{idle:{frames:[Texture.WHITE],fps:8}}};
    const members=[{id:'fast',look:{petId:'myeongrang'}}];
    const list=raceResults(racers,members,'fast',[pet],false);
    assert.equal(racers[0].id,'pending');assert.equal(list.children.length,4);
    assert.equal(list.children[0].children[0].textContent,'1');assert.equal(list.children[0].children[2].textContent,'<Fast> · You');assert.equal(list.children[0].children[3].textContent,'9.00s');
    assert.equal(list.children[0].getAttribute('data-self'),'true');assert.ok(list.querySelector('.room-pet').style.backgroundImage.includes('myeongrang/idle.png'));
    assert.equal(list.children[2].children[0].textContent,'—');assert.equal(list.children[2].children[3].textContent,'Racing…');assert.equal(list.children[3].children[3].textContent,'DNF');
    const ended=raceResults(racers,members,'pending',[pet],true);assert.equal(ended.children[2].children[3].textContent,'DNF');
  }finally{env.restore();}
});

test('final podium centers the winner with the chosen pet and hat, animates existing emote frames and lists other names only',()=>{
  const env=dom(),hud=new Element();env.host.append(hud);let podium,returned=0;
  const draws=[];const context={setTransform(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},scale(){},drawImage(...args){draws.push(args);}};
  const create=document.createElement;document.createElement=tag=>{const e=create(tag);if(tag==='canvas')e.getContext=()=>context;return e;};
  const config={id:'myeongrang',speed:90,scale:0.62,animations:{idle:{frames:[Texture.WHITE],fps:3},emote:{frames:[Texture.WHITE,Texture.WHITE,Texture.WHITE],fps:8,head:Array(3).fill({x:0,y:-1,width:20})}},wardrobe:{santaHat:Texture.WHITE,outfit:{Hat:0}}};
  const racers=[{id:'slow',name:'Second',time:9000},{id:'win',name:'<Winner>',time:8000},{id:'third',name:'Third',time:10000},{id:'left',name:'Last',time:null}];
  try{
    podium=new RacePodium(racers,[{id:'win',look:{petId:'myeongrang',outfit:{Hat:1}}}],'slow',[config],hud,()=>returned++);
    assert.equal(hud.inert,true);assert.equal(podium.element.querySelector('.race-winner-name').textContent,'<Winner>');
    assert.equal(podium.element.querySelector('.race-winner-place').textContent,'1st');
    const rows=podium.element.querySelector('.race-podium-list').children;
    assert.deepEqual(rows.map(row=>row.children.map(cell=>cell.textContent)),[['2','Second'],['3','Third'],['DNF','Last']]);
    assert.equal(rows[0].getAttribute('data-self'),'true');assert.equal(rows[0].children.length,2);
    podium.update(0.01);const first=podium.animation.sprite.currentFrame;podium.update(0.14);
    assert.notEqual(podium.animation.sprite.currentFrame,first);assert.equal(podium.animation.hat.visible,true);assert.equal(config.wardrobe.outfit.Hat,0);
    assert.ok(draws.length>=4);assert.equal(document.activeElement,podium.back);
    podium.back.dispatchEvent(new Event('click'));assert.equal(returned,1);
    podium.destroy();assert.equal(hud.inert,false);assert.equal(env.host.querySelector('.race-podium-overlay'),undefined);
  }finally{if(hud.inert)podium?.destroy();env.restore();}
});

test('all-DNF podium does not invent a winner and preserves an already inert background on cleanup',()=>{
  const env=dom(),hud=new Element();hud.inert=true;let podium;
  try{
    podium=new RacePodium([{id:'one',name:'One',time:null},{id:'two',name:'Two',time:null}],[],'one',[],hud,()=>{});
    assert.equal(podium.element.querySelector('.race-winner'),undefined);
    assert.equal(podium.element.querySelector('.race-podium-list').children.length,2);
    assert.equal(podium.element.querySelector('.race-no-winner').textContent,'No finishers this time');
    podium.destroy();assert.equal(hud.inert,true);
  }finally{env.restore();}
});

test('start sends the first moved pose immediately while the last server snapshot still says countdown',async()=>{
  const env=dom();let provide,flushes=0,poseCalls=0,scene;
  const room={id:'room',map:'garden',host:'one',phase:'countdown',round:'round',startsAt:10000,endsAt:130000,members:[{id:'one',name:'One',look:{petId:'corgi',outfit:{}},pose:{x:120,height:0,direction:1,action:'idle',progress:0,vx:0}}],racers:[{id:'one',name:'One',time:null,left:false}]};
  const client=new RoomClient('one',async(action)=>{if(action==='pose')poseCalls++;return{room:structuredClone(room),rooms:[],now:9000};},(r,receive,status,pose)=>{provide=pose;return Object.assign(()=>{},{flush(){flushes++;assert.ok(provide().x>120);}});});
  try{
    await client.command('sync');const config={id:'corgi',speed:90,scale:0.62,animations:{idle:{frames:[Texture.WHITE],fps:3},run:{frames:[Texture.WHITE],fps:8}}};
    scene=new PlayScene(config,()=>{},{open(){},multiplayer:{client,pets:[config],leave(){}}});
    client.clockOffset=9000-performance.now();assert.equal(provide().x,120);
    client.clockOffset=10001-performance.now();scene.keys.add('KeyD');scene.update(0.016);
    assert.equal(flushes,1);assert.ok(provide().vx>0);assert.equal(client.room.phase,'countdown');
    await new Promise(resolve=>setTimeout(resolve,20));await idle(client);assert.ok(poseCalls>=1);
    scene.update(0.016);assert.equal(flushes,1);
    client.reconnect();assert.equal(provide(),undefined);
  }finally{scene?.destroy({children:true});client.destroy(false);env.restore();}
});

test('an uncertain Ready request is read back before any mutation can be retried',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);
  const calls=[];let lose=false;const client=new RoomClient(users[1],async(a,r,p)=>{calls.push(a);const result=await cmd(1,a,r,p);if(lose){lose=false;throw Error('lost acknowledgement');}return result;});
  try{
    await client.command('sync');lose=true;assert.equal(await client.command('ready',{ready:true}),false);
    assert.equal(client.reconnecting,true);assert.equal(await client.command('ready',{ready:false}),false);
    await client.poll();assert.deepEqual(calls,['sync','ready','sync']);assert.equal(client.room.members.find(m=>m.id===users[1]).ready,true);
    assert.equal(client.reconnecting,false);assert.equal(client.notice,'restored');assert.equal(client.recoverySerial,1);
  }finally{client.destroy(false);}
});

test('a lost finish acknowledgement is synchronized without submitting a second finish',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});const start=(await cmd(0,'start',room.id)).room;
  await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '10 seconds' where id=$1",[room.id]);
  const calls=[];let lost=false;const client=new RoomClient(users[0],async(a,r,p)=>{calls.push(a);const result=await cmd(0,a,r,p);if(a==='finish'&&!lost){lost=true;throw Error('lost acknowledgement');}return result;});
  try{
    await client.command('sync');await client.finish({x:6500,height:0,direction:1,action:'idle',progress:0,vx:0});assert.equal(client.reconnecting,true);
    await client.poll();assert.equal(calls.at(-1),'sync');assert.equal(calls.filter(a=>a==='finish').length,1);
    assert.ok(client.room.racers.find(r=>r.id===users[0]).time>=10000);assert.equal(client.finishPose,undefined);assert.equal(client.room.round,start.round);
  }finally{client.destroy(false);}
});

test('expired membership returns to room selection and does not replay Ready',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);const env=dom();
  const client=new RoomClient(users[1],(a,r,p)=>cmd(1,a,r,p));let menu;
  try{
    menu=new PlayMenuPopup(()=>{},{rooms:client,single:async()=>true,race(){},login(){},dismiss(){}});menu.open('multi');await idle(client);
    await db.query("update public.mp_members set seen_at=clock_timestamp()-interval '60 seconds' where user_id=$1",[users[1]]);
    client.reconnect();await idle(client);assert.equal(client.room,null);assert.equal(client.notice,'removed');
    assert.ok(env.host.all().some(e=>e.textContent==='Your room session has ended. Please choose a room again.'));assert.ok(env.host.querySelector('.room-pages'));
  }finally{menu?.destroy();client.destroy(false);env.restore();}
});

test('race reconnection freezes movement, restores the server pose and exits an expired round',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});await cmd(0,'start',room.id);
  await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '10 seconds' where id=$1",[room.id]);
  const env=dom(),client=new RoomClient(users[0],(a,r,p)=>cmd(0,a,r,p));let scene,returned=0;
  try{
    await client.command('sync');await client.command('pose',{round:client.room.round,x:400,height:0,direction:1,action:'idle',progress:0,vx:0});
    const config={id:'corgi',speed:90,scale:0.62,animations:{idle:{frames:[Texture.WHITE],fps:3}}};
    scene=new PlayScene(config,()=>returned++,{open(){},multiplayer:{client,pets:[config],leave(){}}});
    assert.equal(scene.run.x,400);
    client.needsSync=true;scene.keys.add('KeyD');scene.run.x=999;scene.update(0.1);assert.equal(scene.run.x,999);assert.equal(scene.countdown.textContent,'Reconnecting… Checking the room before resuming.');
    await client.command('sync');scene.update(0);assert.equal(scene.run.x,400);assert.equal(scene.keys.size,0);
    await cmd(0,'leave',room.id);client.reconnect();await idle(client);scene.update(0.1);assert.equal(returned,1);scene.update(0.1);assert.equal(returned,1);
  }finally{scene?.destroy({children:true});client.destroy(false);env.restore();}
});

test('background transitions invalidate stale responses and remove recovery listeners on shutdown',async()=>{
  const env=dom();let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const client=new RoomClient(users[0],async()=>{calls++;if(calls===1)await gate;return {room:null,rooms:[],now:calls};});
  try{
    client.start();document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(client.reconnecting,true);
    release();await idle(client);assert.equal(client.snapshot.now,0);assert.equal(client.timer,undefined);
    document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await idle(client);assert.equal(client.snapshot.now,2);assert.equal(client.reconnecting,false);
    client.destroy(false);window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));assert.equal(calls,2);
  }finally{release();client.destroy(false);env.restore();}
});

test('host selects maps in a separate popup, resetting Ready and restoring the room focus surface',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});
  const env=dom(),client=new RoomClient(users[0],(a,r,p)=>cmd(0,a,r,p));let menu;
  try{
    menu=new PlayMenuPopup(()=>{},{rooms:client,single:async()=>true,race(){},login(){},dismiss(){}});menu.open('multi');await idle(client);
    assert.equal(env.host.querySelector('.room-map-choices'),undefined);
    env.host.querySelector('.room-change-map').dispatchEvent(new Event('click'));
    assert.ok(env.host.querySelector('.room-map-picker'));assert.equal(env.host.querySelector('.play-menu-panel').inert,true);
    const practice=env.host.querySelector('.room-map-choices').children.find(b=>b.getAttribute('data-map')==='practice');practice.dispatchEvent(new Event('click'));await idle(client);
    assert.equal(client.room.map,'practice');assert.equal(client.room.members.find(m=>m.id===users[1]).ready,false);
    assert.equal(env.host.querySelector('.room-map-picker'),undefined);assert.equal(env.host.querySelector('.play-menu-panel').inert,false);
    env.host.querySelector('.room-change-map').dispatchEvent(new Event('click'));const event=new Event('keydown');Object.defineProperty(event,'key',{value:'Escape'});env.host.querySelector('.room-map-picker').dispatchEvent(event);
    assert.equal(env.host.querySelector('.room-map-picker'),undefined);assert.ok(client.room);
  }finally{menu?.destroy();client.destroy(false);env.restore();}
});

test('a second account joins from the room card and stays in the shared room with guest map controls disabled',async()=>{
  const room=(await cmd(0,'create',null,{name:'Second account test'})).room,env=dom();
  const client=new RoomClient(users[1],(a,r,p)=>cmd(1,a,r,p));let menu;
  try{
    menu=new PlayMenuPopup(()=>{},{rooms:client,single:async()=>true,race(){},login(){},dismiss(){}});menu.open('multi');await idle(client);
    const card=env.host.querySelector('.room-card');assert.equal(card.disabled,false);card.dispatchEvent(new Event('click'));await idle(client);
    assert.equal(client.room.id,room.id);assert.equal(client.room.members.length,2);assert.equal(client.room.host,users[0]);
    assert.equal(env.host.querySelector('.room-change-map'),undefined);assert.equal(env.host.querySelector('.mode-cards'),undefined);
    env.host.all().find(e=>e.tag==='button'&&e.textContent==='Ready').dispatchEvent(new Event('click'));await idle(client);
    assert.equal((await cmd(0,'sync',room.id)).room.members.find(m=>m.id===users[1]).ready,true);
  }finally{menu?.destroy();client.destroy(false);env.restore();}
});

test('cloud cosmetic save failure cannot block room admission and auth is checked after the save attempt',{timeout:5000},async()=>{
  let rpcCalls=0,saves=0,active=users[1];
  const client={auth:{getSession:async()=>({data:{session:{user:{id:active},access_token:'token'}}})},rpc(name,args){rpcCalls++;assert.equal(args.p_action,'join');return {setHeader(){return this;},abortSignal(){return Promise.resolve({data:{room:null,rooms:[],now:1},error:null});}};}};
  const send=roomTransport(client,users[1],async()=>{saves++;throw Error('cloud conflict');});
  await send('join','room',{},new AbortController().signal);assert.equal(saves,1);assert.equal(rpcCalls,1);
  let release;const saving=new Promise(resolve=>{release=resolve;});const pending=roomTransport(client,users[1],()=>saving);
  try{await pending('join','room',{},new AbortController().signal);assert.equal(rpcCalls,2);}finally{release();}
  const changed=roomTransport(client,users[1],async()=>{active=users[0];});
  await assert.rejects(()=>changed('join','room',{},new AbortController().signal));assert.equal(rpcCalls,2);
});

test('database broadcasts accepted poses privately and room topics reject outsiders and client writes',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});const start=(await cmd(0,'start',room.id)).room;
  await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '10 seconds' where id=$1",[room.id]);
  const pose={round:start.round,x:350,height:0,direction:1,action:'run',progress:0,vx:240};await cmd(0,'pose',room.id,pose);
  const message=(await db.query("select * from realtime.messages where event='pose'")).rows[0],topic=`paw-room:${room.id}:${start.round}`;
  assert.equal(message.topic,topic);assert.equal(message.private,true);assert.equal(message.payload.id,users[0]);assert.equal(message.payload.pose.x,350);
  await cmd(0,'pose',room.id,pose);assert.equal((await db.query("select count(*) n from realtime.messages where event='pose'")).rows[0].n,1);
  await db.query("select set_config('test.realtime.topic',$1,false)",[topic]);
  assert.equal((await as(users[1],"select * from realtime.messages where event='pose'")).rows.length,1);
  assert.equal((await as(users[2],'select * from realtime.messages')).rows.length,0);
  await db.exec("grant insert on realtime.messages to authenticated;create policy test_broad_send on realtime.messages for insert to authenticated with check(true);create policy test_broad_receive on realtime.messages for select to authenticated using(true);");
  try{
    assert.equal((await as(users[2],'select * from realtime.messages')).rows.length,0);
    await assert.rejects(()=>as(users[1],"insert into realtime.messages(payload,event,topic,private) values('{}','pose',$1,true)",[topic]),e=>e.code==='42501');
  }finally{await db.exec('drop policy test_broad_send on realtime.messages;drop policy test_broad_receive on realtime.messages;grant insert on realtime.messages to authenticated');}
});

test('live poses cannot be overwritten by an older RPC snapshot, replay or another round',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});await cmd(0,'start',room.id);
  let receive,stopped=0;const client=new RoomClient(users[0],(a,r,p)=>cmd(0,a,r,p),(r,callback,status)=>{receive=callback;status(true);return()=>{stopped++;};});
  try{
    await client.command('sync');const member=client.room.members.find(m=>m.id===users[1]);
    const pose={x:500,height:80,direction:1,action:'jump',progress:0.2,vx:240};
    receive({id:users[1],pose,at:1000});assert.equal(client.peerPose(member).pose.x,500);
    receive({id:users[1],pose:{...pose,x:700},at:999});receive({id:users[1],pose:{...pose,x:9000},at:2000});assert.equal(client.peerPose(member).pose.x,500);
    await client.command('sync');assert.equal(client.room.members.find(m=>m.id===users[1]).pose.x,120);assert.equal(client.peerPose(member).pose.x,500);
    await client.command('leave');assert.equal(stopped,1);assert.equal(client.streamConnected,false);receive({id:users[1],pose,at:3000});assert.equal(client.streamed.size,0);
  }finally{client.destroy(false);}
});

test('snapshot correction stays continuous after delayed dash packets and prediction stops after 80ms',()=>{
  const pose={x:120,height:0,direction:1,action:'run',progress:0,vx:1000};
  const motion=new RemoteMotion();motion.push(pose,0);motion.push({...pose,x:220,height:60},100);
  motion.update(110,1/60);assert.ok(motion.x>120&&motion.x<220);assert.ok(motion.height>0&&motion.height<=15);
  motion.push({...pose,x:1500,height:200},500);const before=motion.x;motion.update(700,1/60);assert.ok(motion.x-before<=2200/60+0.001);assert.ok(motion.x<1500);
  for(let n=0;n<200;n++)motion.update(2000+n*16,1/60);assert.ok(motion.x<=1580.001);
  motion.push({...pose,x:1500,height:0,vx:0,action:'idle'},6000);for(let n=0;n<100;n++)motion.update(7000+n*16,1/60);assert.ok(Math.abs(motion.x-1500)<0.001);
});

test('private stream checks its owner, delivers payloads and unsubscribes without leaking late events',async()=>{
  let handler,status,removed=0,channels=0,delivered=0;
  const channel={on(kind,filter,fn){handler=fn;return this;},subscribe(fn){status=fn;return this;}};
  const client={auth:{getSession:async()=>({data:{session:{user:{id:users[0]}}}})},realtime:{setAuth:async()=>{}},channel(topic,options){channels++;assert.equal(options.config.private,true);assert.match(topic,/^paw-room:/);return channel;},removeChannel:async()=>{removed++;}};
  const stop=roomStream(client,users[0])({id:'room',round:'round'},()=>{delivered++;},()=>{});await new Promise(resolve=>setImmediate(resolve));
  status('SUBSCRIBED');handler({payload:{id:users[1]}});assert.equal(delivered,1);stop();handler({payload:{}});assert.equal(delivered,1);assert.equal(removed,1);
  roomStream(client,users[1])({id:'room',round:'round'},()=>{},()=>{});await new Promise(resolve=>setImmediate(resolve));assert.equal(channels,1);
});

test('direct motion can be published only on the authenticated actor topic and received by current room members',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});const start=(await cmd(0,'start',room.id)).room;
  const topic=`paw-room:${room.id}:${start.round}:${users[0]}`;
  await db.query("select set_config('test.realtime.topic',$1,false)",[topic]);
  await as(users[0],"insert into realtime.messages(payload,event,topic,private) values('{}','motion',$1,true)",[topic]);
  assert.equal((await as(users[1],"select * from realtime.messages where event='motion'")).rows.length,1);
  await assert.rejects(()=>as(users[1],"insert into realtime.messages(payload,event,topic,private) values('{}','motion',$1,true)",[topic]),e=>e.code==='42501');
  assert.equal((await as(users[2],'select * from realtime.messages')).rows.length,0);
  assert.equal((await as(users[0],'select public.can_send_paw_motion($1) allowed',[topic])).rows[0].allowed,true);
  await cmd(0,'leave',room.id);assert.equal((await as(users[0],'select public.can_send_paw_motion($1) allowed',[topic])).rows[0].allowed,false);
});

test('direct motion has priority over database motion and rejects stale sequence numbers',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});await cmd(0,'start',room.id);
  let receive,fast;const client=new RoomClient(users[0],(a,r,p)=>cmd(0,a,r,p),(r,callback,status,pose,direct)=>{receive=callback;fast=direct;status(true);return()=>{};});
  try{
    await client.command('sync');fast(true);const member=client.room.members.find(m=>m.id===users[1]);
    const pose={x:600,height:0,direction:1,action:'run',progress:0,vx:240};
    receive({id:users[1],pose,at:100,source:'direct',session:'first'});assert.equal(client.peerPose(member).pose.x,600);assert.equal(client.peerPose(member).delay,20);
    receive({id:users[1],pose:{...pose,x:300},at:Date.now()});receive({id:users[1],pose:{...pose,x:400},at:90,source:'direct',session:'first'});assert.equal(client.peerPose(member).pose.x,600);
    receive({id:users[1],pose:{...pose,x:650},at:1,source:'direct',session:'reload'});assert.equal(client.peerPose(member).pose.x,650);
    client.destroy(false);assert.equal(client.directConnected,false);assert.equal(client.streamed.size,0);
  }finally{client.destroy(false);}
});

test('actor channels bind remote identity to the subscribed topic and publish without an RPC round trip',async()=>{
  const channels=[],received=[];let fast=false,sent=0;
  const pose={x:300,height:0,direction:1,action:'run',progress:0,vx:240};
  const client={auth:{getSession:async()=>({data:{session:{user:{id:users[0]}}}})},realtime:{setAuth:async()=>{}},
    channel(topic,options){const c={topic,on(kind,filter,fn){this.receive=fn;return this;},subscribe(fn){this.status=fn;return this;},async send(message){sent++;assert.equal(message.payload.pose.x,300);return 'ok';}};channels.push(c);return c;},removeChannel:async()=>{}};
  const stop=roomStream(client,users[0])({id:'room',round:'round',members:[{id:users[0]},{id:users[1]}]},value=>received.push(value),()=>{},()=>pose,value=>{fast=value;});
  try{
    await new Promise(resolve=>setImmediate(resolve));assert.equal(channels.length,3);channels.forEach(c=>c.status('SUBSCRIBED'));assert.equal(fast,true);
    channels[2].receive({payload:{id:users[0],pose,at:10,session:'peer'}});assert.equal(received[0].id,users[1]);assert.equal(received[0].source,'direct');
    const before=sent;stop.flush();assert.equal(sent,before+1);stop.flush();assert.equal(sent,before+2);
    await new Promise(resolve=>setTimeout(resolve,80));assert.ok(sent>=1);
  }finally{stop();}
});

test('lobby broadcasts Ready and countdown changes, excludes heartbeat noise and denies outsider reads and client writes',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await db.exec('truncate realtime.messages');
  await cmd(1,'sync',room.id);assert.equal((await db.query("select count(*) n from realtime.messages where event='state'")).rows[0].n,0);
  await cmd(1,'ready',room.id,{ready:true});const messages=(await db.query("select * from realtime.messages where event='state'")).rows;assert.equal(messages.length,1);assert.equal(messages[0].payload.room,room.id);
  const topic='paw-lobby:'+room.id;await db.query("select set_config('test.realtime.topic',$1,false)",[topic]);
  assert.ok((await as(users[0],"select * from realtime.messages where event='state'")).rows.length>0);assert.equal((await as(users[2],'select * from realtime.messages')).rows.length,0);
  await assert.rejects(()=>as(users[1],"insert into realtime.messages(payload,event,topic,private) values('{}','state',$1,true)",[topic]),e=>e.code==='42501');
  await cmd(0,'start',room.id);assert.ok((await db.query("select count(*) n from realtime.messages where event='state'")).rows[0].n>1);
});

test('room notifications refresh Ready and start without waiting for the lobby polling interval',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);
  const signals=new Map();let queue=Promise.resolve();
  const transport=n=>(a,r,p)=>{const work=queue.then(()=>cmd(n,a,r,p));queue=work.catch(()=>{});return work;};
  const state=n=>(r,changed,status)=>{signals.set(n,changed);status(true);return()=>signals.delete(n);};
  const host=new RoomClient(users[0],transport(0),undefined,state(0)),guest=new RoomClient(users[1],transport(1),undefined,state(1));
  try{
    await host.command('sync');await guest.command('sync');await guest.command('ready',{ready:true});signals.get(0)();
    await new Promise(resolve=>setTimeout(resolve,70));await idle(host);assert.equal(host.room.members.find(m=>m.id===users[1]).ready,true);
    await host.command('start');signals.get(1)();await new Promise(resolve=>setTimeout(resolve,70));await idle(guest);
    assert.equal(guest.room.phase,'countdown');assert.equal(guest.room.round,host.room.round);assert.equal(guest.room.startsAt,host.room.startsAt);
  }finally{host.destroy(false);guest.destroy(false);}
});

test('server clock estimates compensate different request round trips',async()=>{
  const make=delay=>new RoomClient(users[0],async()=>{const start=performance.now();await new Promise(resolve=>setTimeout(resolve,delay));return {room:null,rooms:[],now:Date.now()-(performance.now()-start)/2};});
  const a=make(20),b=make(80);
  try{await a.command('list');await b.command('list');assert.ok(Math.abs(a.serverTime-b.serverTime)<15);assert.ok(Math.abs(a.serverTime-Date.now())<15);}
  finally{a.destroy(false);b.destroy(false);}
});

function mobileDom(){
  const env=dom();document.body=new Element('body');document.documentElement=new Element('html');document.documentElement.append(document.body);document.body.append(env.host);
  window.matchMedia=q=>({matches:q.includes('coarse')});window.innerHeight=844;
  const orientation=Object.assign(new EventTarget(),{type:'portrait-primary'});window.screen={orientation,width:390,height:844};
  window.visualViewport=Object.assign(new EventTarget(),{height:844,offsetTop:0});return {...env,orientation};
}
function inputFocus(input){const event=new Event('focusin');Object.defineProperty(event,'target',{value:input});document.dispatchEvent(event);}

test('mobile start requests fullscreen before landscape lock and tolerates unsupported browsers',async()=>{
  const env=mobileDom(),calls=[];
  try{
    document.documentElement.requestFullscreen=async()=>{calls.push('fullscreen');document.fullscreenElement=document.documentElement;};
    env.orientation.lock=async value=>{calls.push(value);};await enterLandscape();assert.deepEqual(calls,['fullscreen','landscape']);
    document.fullscreenElement=null;document.documentElement.requestFullscreen=async()=>{throw Error('denied');};await enterLandscape();assert.equal(calls.length,2);
  }finally{env.restore();}
});

test('portrait keyboard fallback edits room text outside the rotated game and commits with the input event',()=>{
  const env=mobileDom();let cleanup,changes=0;
  try{
    const input=new Element('input');input.type='text';input.value='Room';input.maxLength=24;input.placeholder='Room name';input.addEventListener('input',()=>changes++);env.host.append(input);
    cleanup=installMobileViewport(env.host);assert.equal(portraitTouch(),true);inputFocus(input);
    const editor=document.body.querySelector('.mobile-text-editor'),copy=editor.children[0].children[0].children[0];
    assert.equal(env.host.contains(copy),false);assert.equal(env.host.inert,true);assert.equal(copy.maxLength,24);
    window.visualViewport.height=300;window.visualViewport.dispatchEvent(new Event('resize'));assert.equal(env.host.classList.contains('portrait-touch'),true);assert.equal(editor.style.height,'300px');
    copy.value='New Room';editor.children[0].children[1].dispatchEvent(new Event('click'));assert.equal(input.value,'New Room');assert.equal(changes,1);assert.equal(env.host.inert,false);assert.equal(document.body.querySelector('.mobile-text-editor'),undefined);
    inputFocus(input);document.body.querySelector('.mobile-text-editor').children[0].children[2].dispatchEvent(new Event('click'));assert.equal(changes,1);
  }finally{cleanup?.();env.restore();}
});
