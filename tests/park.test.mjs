import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {importTs} from './load-typescript.mjs';
const {parkPose,parkStep,parkCamera,PARK_WORLD,parkEmote}=await importTs('../src/park/ParkModel.ts',import.meta.url);
const {ParkClient}=await importTs('../src/park/ParkClient.ts',import.meta.url);
const {chatDockBounds,chatVisibleViewport}=await importTs('../src/ui/KeyboardChatDock.ts',import.meta.url);
const db=new PGlite();after(()=>db.close());
await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema realtime;create table realtime.messages(extension text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;");
await db.exec(await readFile(new URL('../supabase/migrations/202610170001_player_accounts.sql',import.meta.url),'utf8'));
const migration=await readFile(new URL('../supabase/migrations/202610240012_park_channels.sql',import.meta.url),'utf8');await db.exec(migration);
const whispers=await readFile(new URL('../supabase/migrations/202610250014_park_whispers.sql',import.meta.url),'utf8');await db.exec(whispers);
const ids=Array.from({length:10},(_,n)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`),session='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
for(const [i,id]of ids.entries()){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into public.player_profiles(user_id,nickname)values($1,$2)',[id,'Player'+i]);}
await db.query('insert into public.player_saves(user_id,snapshot)values($1,$2)',[ids[0],JSON.stringify({version:1,character:{petId:'myeongrang',outfit:{Hat:2,Acc:2,Body:0,Etc:0}}})]);
async function as(n,sql,args=[],role='authenticated'){await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':ids[n]]);return await db.query(sql,args);}finally{await db.exec('reset role');}}
async function command(n,action,channel=1,lease=session,text=''){return(await as(n,'select public.park_command($1,$2,$3,$4) as data',[action,channel,lease,text])).rows[0].data;}

test('keyboard chat layout stays inside the visible viewport, including pan offsets',()=>{
 for(const view of [{width:1280,height:310,offsetLeft:0,offsetTop:0},{width:400,height:350,offsetLeft:0,offsetTop:160},{width:360,height:150,offsetLeft:35,offsetTop:45}]){
  const b=chatDockBounds(view);assert.ok(b.left>=view.offsetLeft+8);assert.ok(b.left+b.width<=view.offsetLeft+view.width-8);assert.equal(b.bottom,view.offsetTop+view.height-8);assert.ok(b.maxHeight<=view.height-16);assert.ok(b.bottom-b.maxHeight>=view.offsetTop+8);
 }
});
test('fullscreen overlay keyboard and resized viewport use the smaller visible area exactly once',()=>{
 const full={width:1280,height:720,offsetLeft:0,offsetTop:0},keyboard={left:0,top:390,width:1280,height:330};
 assert.equal(chatVisibleViewport(full,keyboard).height,390);
 assert.equal(chatVisibleViewport({...full,height:390},keyboard).height,390);
 assert.equal(chatVisibleViewport({...full,offsetTop:80},keyboard).height,310);
 assert.deepEqual(chatVisibleViewport(full,{...keyboard,height:0}),full);assert.deepEqual(chatVisibleViewport(full,{...keyboard,left:1500}),full);
 const bounds=chatDockBounds(chatVisibleViewport(full,keyboard));assert.ok(bounds.bottom<keyboard.top);
});

test('keyboard-local or stale fullscreen rectangles never produce a one-pixel chat viewport',()=>{
 const full={width:1280,height:720,offsetLeft:0,offsetTop:0},local={left:0,top:0,width:1280,height:330};
 assert.equal(chatVisibleViewport(full,local,720).height,390);
 assert.equal(chatVisibleViewport({...full,height:390},local,720).height,390);
 assert.deepEqual(chatVisibleViewport(full,{...local,height:720},720),full);
 assert.equal(chatVisibleViewport(full,{...local,top:12},720).height,390);
});
test('park joins have strict capacity, server nickname/appearance and atomic switching',async()=>{
 for(let n=0;n<8;n++)await command(n,'join');
 const snapshot=await command(0,'sync');assert.deepEqual(snapshot.counts,[8,0,0,0]);assert.equal(snapshot.members[0].name,'Player0');assert.equal(snapshot.members[0].look.petId,'myeongrang');assert.equal(snapshot.members[0].look.outfit.Hat,2);
 await assert.rejects(command(8,'join'),/park_full/);assert.deepEqual((await command(8,'list')).counts,[8,0,0,0]);
 await command(0,'join',2);assert.deepEqual((await command(0,'sync',2)).counts,[7,1,0,0]);
 await assert.rejects(command(0,'sync',1),/park_session_lost/);await assert.rejects(command(0,'join',5),/invalid_channel/);
});
test('park chat is channel private, rate limited, length bounded and uses server identity',async()=>{
 const first=await command(0,'chat',2,session,'<b>hello</b>\n world');assert.equal(first.messages[0].name,'Player0');assert.equal(first.messages[0].message,'<b>hello</b>  world');
 assert.equal((await command(1,'sync')).messages.length,0);assert.equal((await command(1,'list')).messages,undefined);
 await assert.rejects(command(0,'chat',2,session,'again'),/chat_cooldown/);
 await db.query("update public.park_members set last_chat=now()-interval '3 seconds' where user_id=$1",[ids[0]]);
 await assert.rejects(command(0,'chat',2,session,'x'.repeat(101)),/invalid_message/);await assert.rejects(command(0,'chat',2,session,'  '),/invalid_message/);
 await assert.rejects(as(0,'select * from public.park_chat'),/permission denied/);await assert.rejects(as(null,"select public.park_command('list')",[],'anon'),/permission denied/);
});
test('actor topics cannot impersonate peers or read another channel; stale tab cannot evict a new session',async()=>{
 const topic=(channel,id,lease=session)=>`paw-park:${channel}:${ids[id]}:${lease}`;
 const allowed=async(n,channel,actor,send,lease=session)=>(await as(n,'select public.can_use_paw_park($1,$2) as ok',[topic(channel,actor,lease),send])).rows[0].ok;
 assert.equal(await allowed(1,1,1,true),true);assert.equal(await allowed(1,1,2,false),true);assert.equal(await allowed(1,1,2,true),false);assert.equal(await allowed(1,2,0,false),false);
 await command(0,'join',2,other);await command(0,'leave',2,session);assert.equal((await command(0,'sync',2,other)).members.length,1);await assert.rejects(command(0,'chat',2,session,'old'),/park_session_lost/);
 assert.equal(await allowed(0,2,0,true,session),false);assert.equal(await allowed(0,2,0,true,other),true);
 await db.query("update public.park_members set seen_at=now()-interval '46 seconds' where user_id=$1",[ids[1]]);assert.equal(await allowed(1,1,2,false),false);
 await command(8,'join');assert.equal((await command(8,'sync')).members.length,7); // expired member removed and free slot reused
 await db.exec(migration);await db.exec(whispers);assert.equal((await command(0,'sync',2,other)).members.length,1);
});
test('park movement clamps time/map/jumps and rejects malicious or reordered motion input',()=>{
 assert.equal(parkStep(1719,720,0,0,1,0,1).x,1720);assert.equal(parkStep(80,720,0,0,-1,0,.05).x,80);assert.equal(parkStep(400,720,1,-100,0,0,.05).height,0);
 for(const v of [null,{}, {x:NaN,height:0,direction:1,moving:true,seq:1},{x:1,height:0,direction:0,moving:true,seq:1}])assert.equal(parkPose(v),undefined);
 assert.deepEqual(parkPose({x:2000,y:-100,height:999,direction:-1,moving:true,seq:3}),{x:1720,y:600,height:160,direction:-1,moving:true,seq:3});
 assert.equal(parkPose({x:300,y:NaN,height:0,direction:1,moving:false,seq:1}),undefined);
 assert.equal(parkPose({x:300,height:0,direction:1,moving:false,seq:1}).y,PARK_WORLD.spawnY);
});
test('park ground movement supports both axes, stops before sky and keeps diagonal speed constant',()=>{
 assert.equal(parkStep(900,600,0,0,0,-1,.05).y,600);assert.equal(parkStep(900,880,0,0,0,1,.05).y,880);
 const up=parkStep(900,720,0,0,0,-1,.05),down=parkStep(900,720,0,0,0,1,.05);assert.equal(up.y,711);assert.equal(down.y,729);
 const diagonal=parkStep(900,720,0,0,1,1,.05);assert.ok(Math.abs(Math.hypot(diagonal.x-900,diagonal.y-720)-9)<1e-8);
 const jump=parkStep(900,600,0,440,0,-1,.05);assert.equal(jump.y,600);assert.ok(jump.height>0);assert.ok(PARK_WORLD.minY>PARK_WORLD.height*.44+100);
 const a=parkCamera(900,600),b=parkCamera(1000,880);assert.ok(b.x>a.x);assert.ok(b.y>a.y);
 for(const point of [[80,600],[1720,880]]){const camera=parkCamera(...point);assert.ok(camera.x>=0&&camera.x<=PARK_WORLD.width-960);assert.ok(camera.y>=0&&camera.y<=PARK_WORLD.height-540);}
});
test('park client cleans subscriptions, rejects old pose sequences and leaves with its own session',async()=>{
 const streams=[],calls=[];let removed=0;
 const snapshot={counts:[2,0,0,0],members:[{id:ids[0],session,name:'Player0'},{id:ids[1],session,name:'Player1'}],messages:[]};
 const transport={rpc:async(_fn,p)=>{calls.push(p);return{data:snapshot,error:null};},realtime:{setAuth:async()=>{}},channel(topic){const handlers={};const stream={topic,on(_type,{event},fn){handlers[event]=fn;return stream;},subscribe(fn){stream.status=fn;queueMicrotask(()=>fn('SUBSCRIBED'));return stream;},send:async()=> 'ok',handlers};streams.push(stream);return stream;},removeChannel:async()=>{removed++;}};
 const c=new ParkClient(transport,ids[0]);assert.equal(await c.join(1),true);await new Promise(r=>setTimeout(r,0));assert.equal(c.connected,true);
 const remote=streams[1];remote.handlers.pose({payload:{x:200,y:800,height:20,direction:1,moving:true,seq:5}});remote.handlers.pose({payload:{x:100,y:600,height:0,direction:1,moving:true,seq:4}});assert.equal(c.poses.get(ids[1]).x,200);assert.equal(c.poses.get(ids[1]).y,800);
 assert.equal(await c.chat('hi'),true);c.destroy();assert.equal(removed,2);assert.equal(calls.at(-1).p_action,'leave');assert.equal(calls.at(-1).p_session,c.session);assert.notEqual(c.session,session);
 remote.handlers.pose({payload:{x:300,height:0,direction:1,moving:false,seq:6}});assert.equal(c.poses.get(ids[1]).x,200);
});

test('whispers are visible only to sender/recipient, never public history, and share the public rate limit',async()=>{
 await db.exec('delete from public.park_members;delete from public.park_chat;');
 for(let n=0;n<3;n++)await command(n,'join',1);await command(3,'join',2);
 const whisper=(n,target,text='private hello',lease=session)=>(async()=>{return(await as(n,'select public.park_whisper($1,$2,$3,$4) as data',[1,lease,ids[target],text])).rows[0].data;})();
 const sent=await whisper(0,1);assert.equal(sent.messages.length,1);assert.equal(sent.messages[0].recipient_id,ids[1]);assert.equal(sent.messages[0].recipient_name,'Player1');assert.equal(sent.messages[0].name,'Player0');
 assert.equal((await command(1,'sync')).messages[0].message,'private hello');assert.equal((await command(2,'sync')).messages.length,0);assert.equal((await command(3,'sync',2)).messages.length,0);
 await assert.rejects(whisper(0,1),/chat_cooldown/);await assert.rejects(command(0,'chat',1,session,'public'),/chat_cooldown/);
 await db.query("update public.park_members set last_chat=now()-interval '3 seconds' where user_id=$1",[ids[0]]);
 await command(0,'chat',1,session,'public');const bystander=await command(2,'sync');assert.equal(bystander.messages.length,1);assert.equal(bystander.messages[0].message,'public');assert.equal(bystander.messages[0].recipient_id,null);
 await assert.rejects(whisper(0,1),/chat_cooldown/);await assert.rejects(whisper(0,3),/whisper_target_left/);await assert.rejects(whisper(0,0),/whisper_target_left/);await assert.rejects(whisper(0,1,'secret',other),/park_session_lost/);
 await assert.rejects(as(null,'select public.park_whisper(1,$1,$2,$3)',[session,ids[1],'secret'],'anon'),/permission denied/);await assert.rejects(as(2,'select * from public.park_chat'),/permission denied/);
 await command(1,'leave');await assert.rejects(whisper(0,1),/whisper_target_left/);
 await command(1,'join',1);await db.query("update public.park_members set last_chat=null where user_id=$1",[ids[0]]);await assert.rejects(whisper(0,1,'x'.repeat(101)),/invalid_message/);await assert.rejects(whisper(0,1,' '),/invalid_message/);
 await db.exec(whispers);assert.equal((await command(2,'sync')).messages.some(m=>m.recipient_id),false);
});

test('private chat RPC sends only an empty shared notification, and never falls back to public on errors',async()=>{
 const calls=[],broadcasts=[];let fail=false;
 const c=new ParkClient({rpc:async(fn,p)=>{calls.push({fn,p});return{data:{counts:[1,0,0,0],members:[],messages:[]},error:fail?{message:'whisper_target_left'}:null}}},ids[0]);c.channel=1;
 c.streams.set(`paw-park:1:${ids[0]}:${c.session}`,{send:async value=>{broadcasts.push(value)}});
 assert.equal(await c.chat('secret',ids[1]),true);assert.equal(calls[0].fn,'park_whisper');assert.equal(calls[0].p.p_target,ids[1]);assert.deepEqual(broadcasts[0].payload,{});assert.equal(JSON.stringify(broadcasts).includes('secret'),false);
 fail=true;assert.equal(await c.chat('secret',ids[1]),false);assert.equal(c.chatError,'parkWhisperLeft');assert.equal(calls.every(c=>c.fn==='park_whisper'),true);assert.equal(c.error,'');c.closed=true;
});

test('park reactions accept only fixed IDs and strip arbitrary broadcast text/identity',()=>{
 for(const value of[null,{}, {kind:'custom',seq:1},{kind:'heart',seq:-1},{kind:'heart',seq:NaN},{kind:'music',seq:1.5}])assert.equal(parkEmote(value),undefined);
 assert.deepEqual(parkEmote({kind:'wave',seq:1,user_id:ids[5],message:'private text'}),{kind:'wave',seq:1});
});

test('reactions reuse owned actor streams, throttle both sides and discard stale sessions and departed players',async()=>{
 const originalNow=Date.now;let now=10000;Date.now=()=>now;const streams=[],sent=[],removed=[];
 let snapshot={counts:[2,0,0,0],members:[{id:ids[0],session,name:'Player0'},{id:ids[1],session,name:'Player1'}],messages:[]};
 const transport={rpc:async()=>({data:snapshot,error:null}),realtime:{setAuth:async()=>{}},channel(topic){const handlers={};const stream={topic,handlers,on(_type,{event},fn){handlers[event]=fn;return stream},subscribe(fn){queueMicrotask(()=>fn('SUBSCRIBED'));return stream},send:async value=>{sent.push(value)}};streams.push(stream);return stream},removeChannel:async stream=>removed.push(stream)};
 const c=new ParkClient(transport,ids[0]);
 try{
  assert.equal(c.emote('wave'),false);snapshot.members[0].session=c.session;await c.join(1);await new Promise(r=>setTimeout(r,0));
  assert.equal(c.emote('wave'),true);assert.deepEqual(sent[0],{type:'broadcast',event:'emote',payload:{kind:'wave',seq:1}});assert.equal(c.getEmote(ids[0]).kind,'wave');assert.equal(c.emote('heart'),false);assert.equal(c.emote('unknown'),false);
  const remote=streams[1];remote.handlers.emote({payload:{kind:'heart',seq:2}});assert.equal(c.getEmote(ids[1]).kind,'heart');remote.handlers.emote({payload:{kind:'music',seq:3}});assert.equal(c.getEmote(ids[1]).kind,'heart');
  now+=3001;assert.equal(c.getEmote(ids[1]),undefined);assert.equal(c.emote('music'),true);remote.handlers.emote({payload:{kind:'wave',seq:1}});assert.equal(c.getEmote(ids[1]),undefined);remote.handlers.emote({payload:{kind:'music',seq:3}});assert.equal(c.getEmote(ids[1]).kind,'music');
  snapshot={...snapshot,members:[snapshot.members[0],{...snapshot.members[1],session:other}]};c.snapshot=snapshot;c.syncStreams();remote.handlers.emote({payload:{kind:'wave',seq:9}});assert.equal(c.getEmote(ids[1]),undefined);
  snapshot={...snapshot,members:[snapshot.members[0]]};c.snapshot=snapshot;c.syncStreams();streams.at(-1).handlers.emote({payload:{kind:'wave',seq:10}});assert.equal(c.getEmote(ids[1]),undefined);assert.ok(removed.length>=2);
  c.destroy();assert.equal(c.getEmote(ids[0]),undefined);assert.equal(c.emote('wave'),false);
 }finally{c.destroy();Date.now=originalNow;}
});

test('returning from character customization publishes saved cosmetics to peers in the same park',async()=>{
 const channel=4,oldSession='44444444-4444-4444-8444-444444444444',newSession='55555555-5555-4555-8555-555555555555';
 await command(8,'join',channel,oldSession);await command(9,'join',channel,session);
 const look={petId:'corgi',outfit:{Hat:2,Body:0,Acc:2,Etc:2}};
 await db.query('insert into public.player_saves(user_id,snapshot) values($1,$2) on conflict(user_id) do update set snapshot=excluded.snapshot',[ids[8],JSON.stringify({version:1,character:look})]);
 const returned=await command(8,'join',channel,newSession);assert.deepEqual(returned.members.find(m=>m.id===ids[8]).look,look);
 await command(8,'leave',channel,oldSession);
 const peer=await command(9,'sync',channel,session);assert.deepEqual(peer.members.find(m=>m.id===ids[8]).look,look);assert.equal(peer.members.find(m=>m.id===ids[8]).session,newSession);
 await command(8,'leave',channel,newSession);await command(9,'leave',channel,session);
});
