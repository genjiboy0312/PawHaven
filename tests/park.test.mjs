import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {importTs} from './load-typescript.mjs';
const {parkPose,parkStep,parkCamera,PARK_WORLD}=await importTs('../src/park/ParkModel.ts',import.meta.url);
const {ParkClient}=await importTs('../src/park/ParkClient.ts',import.meta.url);
const {chatDockBounds,chatVisibleViewport}=await importTs('../src/ui/KeyboardChatDock.ts',import.meta.url);
const db=new PGlite();after(()=>db.close());
await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema realtime;create table realtime.messages(extension text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;");
await db.exec(await readFile(new URL('../supabase/migrations/202610170001_player_accounts.sql',import.meta.url),'utf8'));
const migration=await readFile(new URL('../supabase/migrations/202610240012_park_channels.sql',import.meta.url),'utf8');await db.exec(migration);
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
 await db.exec(migration);assert.equal((await command(0,'sync',2,other)).members.length,1);
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
