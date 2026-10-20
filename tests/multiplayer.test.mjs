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
const {RemoteMotion}=await importTs('../src/multiplayer/RemoteMotion.ts',import.meta.url);
const {roomStream}=await importTs('../src/multiplayer/RoomStream.ts',import.meta.url);
const {lobbyStream}=await importTs('../src/multiplayer/RoomStream.ts',import.meta.url);
const {enterLandscape,portraitTouch,installMobileViewport}=await importTs('../src/ui/MobileViewport.ts',import.meta.url);
const {Texture}=await import('pixi.js');
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
async function as(user,query,args=[],role='authenticated') {
  await db.exec('set role '+role);
  try { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']); return await db.query(query,args); }
  finally { await db.exec('reset role'); }
}
async function cmd(n,action,room=null,payload={}) { return (await as(users[n], 'select public.multiplayer_command($1,$2,$3) as result',[action,room,JSON.stringify(payload)])).rows[0].result; }
beforeEach(async()=>{await db.exec('truncate public.mp_rooms cascade;truncate realtime.messages');});
after(async()=>{await db.close();});
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
  assert.equal(start.phase,'countdown'); assert.ok(start.startsAt>Date.now()-2000); assert.ok(start.round);
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

test('race scene freezes during countdown, draws peers and returns after server results',async()=>{
  const room=(await cmd(0,'create')).room;await cmd(1,'join',room.id);await cmd(1,'ready',room.id,{ready:true});const start=(await cmd(0,'start',room.id)).room;
  const env=dom(),client=new RoomClient(users[0],(a,r,p)=>cmd(0,a,r,p));let scene,returned=0;
  try{
    await client.command('sync');const config={id:'corgi',speed:90,scale:0.62,animations:{idle:{frames:[Texture.WHITE],fps:3},run:{frames:Array(4).fill(Texture.WHITE),fps:8}}};
    scene=new PlayScene(config,()=>returned++,{open(){},multiplayer:{client,pets:[config],leave(){}}});
    scene.update(0.1);assert.equal(scene.run.x,120);assert.equal(scene.run.elapsed,0);assert.equal(scene.peers.size,1);
    const peer=scene.peers.get(users[1]);assert.equal(peer.box.alpha,1);assert.equal(peer.box.tint,0xb0b0b0);assert.equal(scene.pet.alpha,1);assert.equal(scene.pet.tint,0xffffff);
    assert.equal(peer.name.alpha,1);assert.equal(peer.name.parent,scene.nameLayer);assert.equal(peer.name.y,peer.box.y-155);
    assert.equal(scene.localName.text,client.room.members.find(m=>m.id===users[0]).name);assert.equal(scene.localName.alpha,1);
    assert.equal(scene.localName.y,scene.pet.y-155);
    await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '10 seconds' where id=$1",[room.id]);await client.command('sync');
    await cmd(1,'pose',room.id,{round:start.round,x:400,height:0,action:'run',vx:240});await client.command('sync');await new Promise(resolve=>setTimeout(resolve,75));scene.update(0.1);
    assert.ok(scene.peers.get(users[1]).box.x>120);
    scene.update(0.1);assert.ok(scene.peers.get(users[1]).animation.sprite.currentFrame>0);
    scene.run.x=scene.run.finish;scene.update(0.01);await idle(client);scene.update(0.01);assert.equal(scene.back.disabled,true);
    assert.match(scene.raceNote.textContent,/Waiting for friends · \d+s left/);
    assert.equal(scene.ranking.querySelector('.race-result-row').getAttribute('data-self'),'true');
    await db.query("update public.mp_rooms set ends_at=clock_timestamp()-interval '1 second' where id=$1",[room.id]);await client.command('sync');scene.update(0.01);
    assert.equal(scene.back.disabled,false);assert.equal(scene.raceNote.textContent,'It was lovely running together!');
    assert.equal(scene.ranking.querySelector('.race-results-list').children[1].children[0].textContent,'—');
    scene.back.dispatchEvent(new Event('click'));scene.update(0.41);assert.equal(returned,1);
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
    menu=new PlayMenuPopup(v=>pauses.push(v),{single:async map=>{chosen=map;return true;},race(){},login(){},dismiss(){closed++;}});
    menu.open();env.host.all().find(e=>e.textContent==='Single').dispatchEvent(new Event('click'));
    env.host.all().find(e=>e.textContent==='Practice Yard').dispatchEvent(new Event('click'));
    await new Promise(r=>setImmediate(r));assert.equal(chosen,'practice');assert.equal(closed,1);assert.equal(hud.inert,false);assert.equal(pauses.at(-1),false);
  }finally{menu?.destroy();env.restore();}
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
