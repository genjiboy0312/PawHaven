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
const {Texture}=await import('pixi.js');
const db = new PGlite();
const users = [1,2,3,4,5].map(n => `${n}`.repeat(8) + '-1111-4111-8111-111111111111');
await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon;");
for (const file of ['202610170001_player_accounts.sql','202610170002_server_economy.sql','202610190003_multiplayer.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
for (const user of users) await db.query('insert into auth.users values($1)',[user]);
async function as(user,query,args=[],role='authenticated') {
  await db.exec('set role '+role);
  try { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']); return await db.query(query,args); }
  finally { await db.exec('reset role'); }
}
async function cmd(n,action,room=null,payload={}) { return (await as(users[n], 'select public.multiplayer_command($1,$2,$3) as result',[action,room,JSON.stringify(payload)])).rows[0].result; }
beforeEach(async()=>{await db.exec('truncate public.mp_rooms cascade');});
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
  children=[];style={};attributes=new Map();classList={add(){}};inert=false;scrollLeft=0;clientWidth=500;disabled=false;
  constructor(tag='div'){super();this.tag=tag;}
  append(...items){items.forEach(item=>{item.parent=this;this.children.push(item);});}
  replaceChildren(...items){this.children.forEach(c=>{c.parent=undefined;});this.children=[];this.append(...items);}
  setAttribute(k,v){this.attributes.set(k,v);}getAttribute(k){return this.attributes.get(k)??null;}
  all(){return this.children.flatMap(c=>[c,...c.all()]);}
  querySelector(s){return this.all().find(c=>c.className?.split(' ').includes(s.slice(1)));}
  querySelectorAll(){return this.all().filter(c=>c.tag==='button'&&!c.disabled);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  focus(){document.activeElement=this;}get isConnected(){return this.tag==='main'||!!this.parent?.isConnected;}
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
    await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '10 seconds' where id=$1",[room.id]);await client.command('sync');
    await cmd(1,'pose',room.id,{round:start.round,x:400,height:0,action:'run',vx:240});await client.command('sync');scene.update(0.1);
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
