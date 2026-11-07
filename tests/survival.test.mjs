import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {importTs} from './load-typescript.mjs';
const {DummyRun}=await importTs('../src/game/DummyRun.ts',import.meta.url);
const {SURVIVAL_COURSE,SURVIVAL_STEPS_COURSE,survivalPlatformPhase}=await importTs('../src/game/SurvivalArena.ts',import.meta.url);
const {SingleRecords}=await importTs('../src/game/SingleRecords.ts',import.meta.url);
const db=new PGlite();after(()=>db.close());
await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema realtime;create table realtime.messages(extension text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;");
for(const file of ['202610170001_player_accounts.sql','202610170002_server_economy.sql','202610190003_multiplayer.sql','202610210008_home_shop.sql','202610230009_friends.sql','202610230010_friend_invites.sql','202610240011_snacks.sql','202610240012_park_channels.sql','202610250015_player_blocks.sql','202610240013_mailbox.sql','202610250016_mail_coupons.sql','202610250017_friend_home_visits.sql','202610260018_crossroads_course.sql','202610260019_mail_receipts.sql','202610270021_garden_props_shop.sql','202610270022_lobby_background_shop.sql','202610280023_single_run_rewards.sql','202610280024_multiplayer_rewards.sql','202610280025_daily_coin_quest.sql','202610280026_box_coin_rewards.sql','202610280027_speech_bubble_skins.sql','202610280028_invite_only_rooms.sql','202610290029_daily_attendance_mail.sql','202610290030_pet_shop.sql','202610290031_cherry_sky.sql','202610290032_lobby_floor_shop.sql','202610290033_pet_house_shop.sql','202610290034_account_progress.sql','202610290035_social_account_levels.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/202611070038_survival_mode.sql',import.meta.url),'utf8'));
const users=[1,2,3,4].map(n=>`00000000-0000-0000-0000-00000000000${n}`);
for(const [i,id] of users.entries()){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into public.player_profiles(user_id,nickname)values($1,$2)',[id,'Survivor'+i]);}
beforeEach(()=>db.exec('truncate public.mp_rooms cascade;'));
async function cmd(user,action,room=null,payload={}){
 await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[user]]);return (await db.query('select public.multiplayer_command($1,$2,$3::jsonb) as value',[action,room,JSON.stringify(payload)])).rows[0].value;}finally{await db.exec('reset role');}
}
async function start(map='survival',count=3){
 let state=await cmd(0,'create',null,{map});const id=state.room.id;
 for(let i=1;i<count;i++){await cmd(i,'join',id);await cmd(i,'ready',id,{ready:true});}
 state=await cmd(0,'start',id);const round=state.room.round;
 for(let i=0;i<count;i++)state=await cmd(i,'loaded',id,{round});
 return{state,id,round};
}
const frame=(run,seconds,axis=0)=>{for(let i=0;i<Math.round(seconds*120);i++)run.update(1/120,axis);};
test('all clients share deterministic platform warnings and disappearance with a safe opening',()=>{
 for(let i=0;i<6;i++)assert.equal(survivalPlatformPhase(i,2.99),'safe');
 assert.equal(survivalPlatformPhase(0,6),'warning');assert.equal(survivalPlatformPhase(0,7.5),'gone');assert.equal(survivalPlatformPhase(1,7.5),'safe');
 for(const time of [3,6,7.5,13,24,43,59]){
  const a=new DummyRun(SURVIVAL_COURSE,1,{survivalSeconds:60}),b=new DummyRun(SURVIVAL_COURSE,1,{survivalSeconds:60});a.survival.sync(time);b.survival.sync(time);
  assert.deepEqual(a.course,b.course);assert.ok(a.course.some(s=>!s.disabled));assert.ok(SURVIVAL_COURSE.every(s=>s.disabled===undefined));
 }
});
test('single survival falls eliminate without checkpoint respawn or race finish, attack is irrelevant',()=>{
 const run=new DummyRun(SURVIVAL_COURSE,1,{survivalSeconds:30,finish:1080,manualReturn:true});frame(run,8);
 assert.equal(run.won,true);assert.equal(run.survival.eliminated,true);assert.equal(run.respawns,0);assert.equal(run.survival.succeeded,false);
 const other=new DummyRun(SURVIVAL_COURSE,1,{survivalSeconds:30,finish:1080});other.x=1080;other.update(.05,0);assert.equal(other.won,false);
 assert.equal(new SingleRecords().complete('survival',30,0).newBest,false);
});
test('a live single reaches the thirty-second goal, common elapsed time rebases late clients',()=>{
 const run=new DummyRun(SURVIVAL_COURSE,1,{survivalSeconds:30,finish:1080});
 // Place a platform back under the test player each step; this exercises the timer independently of a movement policy.
 for(let i=0;i<3601&&!run.won;i++){
  const time=(i+1)/120,index=Array.from({length:6},(_,n)=>n).find(n=>survivalPlatformPhase(n,time)!=='gone');
  run.x=84+index*172+86;run.height=0;run.velocity=0;run.update(1/120,0);
 }
 assert.equal(run.survival.succeeded,true);assert.equal(run.survival.eliminated,false);assert.equal(run.won,true);
 const late=new DummyRun(SURVIVAL_COURSE,1,{survivalSeconds:60});late.update(1/60,0,23.5);assert.equal(late.survival.elapsed,23.5);
});
test('multiplayer uses the shared loaded barrier and sixty-second deadline',async()=>{
 const {state}=await start();assert.equal(state.survivalReady,true);assert.equal(state.room.phase,'countdown');
 assert.equal(state.room.endsAt-state.room.startsAt,60000);assert.equal(state.room.members.every(m=>m.ready===false),true);
});
test('elimination is own-account, round-bound, idempotent and leaves spectators until a server winner exists',async()=>{
 const {id,round}=await start();await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '10 seconds',ends_at=clock_timestamp()+interval '50 seconds' where id=$1",[id]);
 await assert.rejects(cmd(3,'eliminate',id,{round,height:-200}),/not_a_member/);
 await assert.rejects(cmd(0,'eliminate',id,{round:'bad',height:-200}),/invalid_elimination/);
 await assert.rejects(cmd(0,'eliminate',id,{round,height:0}),/invalid_elimination/);
 await assert.rejects(cmd(0,'finish',id,{round}),/invalid_finish/);
 let state=await cmd(0,'eliminate',id,{round,height:-200,user:users[1]});assert.equal(state.room.phase,'playing');
 const mine=state.room.racers.find(r=>r.id===users[0]);assert.ok(mine.eliminatedMs>=10000);assert.equal(state.room.racers.find(r=>r.id===users[1]).eliminatedMs,null);
 state=await cmd(0,'eliminate',id,{round,height:-200});assert.equal(state.room.racers.find(r=>r.id===users[0]).eliminatedMs,mine.eliminatedMs);
 state=await cmd(1,'eliminate',id,{round,height:-200});assert.equal(state.room.phase,'results');assert.deepEqual(state.room.racers.filter(r=>r.winner).map(r=>r.id),[users[2]]);
 assert.equal(state.room.members.length,3);assert.equal(state.room.racers.every(r=>r.time!==null),true);
});
test('timeout awards joint winners and disconnected players do not win',async()=>{
 const {id}=await start('survival',4);
 await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '61 seconds',ends_at=clock_timestamp()-interval '1 second' where id=$1",[id]);
 await db.query('update public.mp_racers set disconnected=true where room_id=$1 and user_id=$2',[id,users[3]]);
 const state=await cmd(0,'sync',id);assert.equal(state.room.phase,'results');assert.equal(state.room.racers.filter(r=>r.winner).length,3);assert.equal(state.room.racers.find(r=>r.id===users[3]).winner,false);
 assert.equal(state.room.racers.every(r=>r.time===60000),true);
});
test('existing racing maps retain finish rules and the new migration can be rerun',async()=>{
 const {id,round}=await start('practice',2);await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '7 seconds',ends_at=clock_timestamp()+interval '110 seconds' where id=$1",[id]);
 await assert.rejects(cmd(0,'eliminate',id,{round,height:-200}),/invalid_elimination/);
 await cmd(0,'pose',id,{round,x:2520,height:0});const state=await cmd(0,'finish',id,{round});assert.ok(state.room.racers.find(r=>r.id===users[0]).time>0);
 await db.exec(await readFile(new URL('../supabase/migrations/202611070038_survival_mode.sql',import.meta.url),'utf8'));
 assert.equal((await cmd(0,'sync',id)).room.map,'practice');
});

test('survival results cannot be redeemed through existing racing or single reward endpoints',async()=>{
 const {id,round}=await start('survival',2);await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '61 seconds',ends_at=clock_timestamp()-interval '1 second' where id=$1",[id]);await cmd(0,'sync',id);
 await db.exec('set role authenticated');
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[0]]);
  await assert.rejects(db.query("select public.economy_command('run_start',gen_random_uuid(),'{\"map\":\"survival\"}'::jsonb)"),/invalid_run_map/);
  await assert.rejects(db.query("select public.economy_command('race_reward',gen_random_uuid(),$1::jsonb)",[JSON.stringify({room:id,round,collected:0})]),/invalid_run_coins/);
 }finally{await db.exec('reset role');}
 assert.equal((await db.query('select count(*) as count from public.economy_race_rewards where room_id=$1',[id])).rows[0].count,0);
});


test('stepped map is reachable with ordinary jumps at 30/60/120 FPS in both directions',()=>{
 for(const fps of [30,60,120]){
  const run=new DummyRun(SURVIVAL_STEPS_COURSE,1/.78,{survivalSeconds:30,finish:1080});
  // Isolate traversal from the timed hazard pattern by exercising the first three safe seconds per leg.
  for(let index=0;index<5;index++){
   run.x=84+index*172+84;run.height=SURVIVAL_STEPS_COURSE[index].top;run.velocity=0;run.clearJumpInput();run.enemyTime=0;
   const goal=84+(index+1)*172+84;if(index%2===0)run.jump();
   for(let i=0;i<fps*1.5;i++){const delta=goal-run.x;run.update(1/fps,Math.abs(delta)<4?0:Math.sign(delta));if(Math.abs(goal-run.x)<4&&run.grounded)break;}
   assert.ok(Math.abs(goal-run.x)<5,JSON.stringify({fps,index,x:run.x,height:run.height}));assert.equal(run.height,SURVIVAL_STEPS_COURSE[index+1].top);assert.equal(run.respawns,0);assert.equal(run.won,false);
  }
  for(let index=5;index>0;index--){
   run.x=84+index*172+84;run.height=SURVIVAL_STEPS_COURSE[index].top;run.velocity=0;run.clearJumpInput();run.enemyTime=0;
   const goal=84+(index-1)*172+84;if(index%2===0)run.jump();
   for(let i=0;i<fps*1.5;i++){const delta=goal-run.x;run.update(1/fps,Math.abs(delta)<4?0:Math.sign(delta));if(Math.abs(goal-run.x)<4&&run.grounded)break;}
   assert.ok(Math.abs(goal-run.x)<5,JSON.stringify({fps,index,x:run.x,height:run.height}));assert.equal(run.height,SURVIVAL_STEPS_COURSE[index-1].top);assert.equal(run.won,false);
  }
 }
});
test('Terraced Survival Map keeps old survival available, gates new capabilities, and reuses server results',async()=>{
 await assert.rejects(cmd(0,'create',null,{map:'terraces'}),/mp_rooms_map_check/);
 const migration=await readFile(new URL('../supabase/migrations/202611070039_terraced_survival.sql',import.meta.url),'utf8');await db.exec(migration);
 const {id,round,state}=await start('terraces');assert.equal(state.terracesReady,true);assert.equal(state.room.map,'terraces');assert.equal(state.room.endsAt-state.room.startsAt,60000);
 await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '10 seconds',ends_at=clock_timestamp()+interval '50 seconds' where id=$1",[id]);
 await cmd(0,'eliminate',id,{round,height:-200});const results=await cmd(1,'eliminate',id,{round,height:-200});assert.equal(results.room.phase,'results');assert.deepEqual(results.room.racers.filter(r=>r.winner).map(r=>r.id),[users[2]]);
 await db.exec(migration);assert.equal((await cmd(0,'sync',id)).room.map,'terraces');
});

test('new stepped map keeps both survival reward endpoints disabled and shares deadline winners',async()=>{
 const {id,round}=await start('terraces',2);await db.query("update public.mp_rooms set starts_at=clock_timestamp()-interval '61 seconds',ends_at=clock_timestamp()-interval '1 second' where id=$1",[id]);
 const result=await cmd(0,'sync',id);assert.equal(result.room.racers.filter(r=>r.winner).length,2);assert.equal(result.room.racers.every(r=>r.time===60000),true);
 await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[0]]);
 await assert.rejects(db.query("select public.economy_command('run_start',gen_random_uuid(),'{\"map\":\"terraces\"}'::jsonb)"),/invalid_run_map/);
 await assert.rejects(db.query("select public.economy_command('race_reward',gen_random_uuid(),$1::jsonb)",[JSON.stringify({room:id,round,collected:0})]),/invalid_run_coins/);
 }finally{await db.exec('reset role');}
});
