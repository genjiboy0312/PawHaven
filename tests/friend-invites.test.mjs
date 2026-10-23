import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {importTs} from './load-typescript.mjs';
const {FriendActivity,activityTransport}=await importTs('../src/friends/FriendActivity.ts',import.meta.url);
const db=new PGlite(),users=[1,2,3,4,5].map(n=>`${n}`.repeat(8)+'-1111-4111-8111-111111111111');
await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;");
for(const file of ['202610170001_player_accounts.sql','202610170002_server_economy.sql','202610190003_multiplayer.sql','202610200007_race_countdown.sql','202610230009_friends.sql','202610230010_friend_invites.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
for(const id of users)await db.query('insert into auth.users values($1)',[id]);
async function as(n,sql,args=[],role='authenticated'){
 await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':users[n]]);return await db.query(sql,args);}finally{await db.exec('reset role');}
}
async function social(n,action='poll',target=null,mode='lobby',ticket=null){return(await as(n,'select public.friend_activity($1,$2,$3,$4) as data',[action,target===null?null:users[target],mode,ticket])).rows[0].data;}
async function room(n,action='list',id=null){return(await as(n,'select public.multiplayer_command($1,$2) as data',[action,id])).rows[0].data;}
async function link(a,b){await as(a,"select public.friends_command('send',$1)",[users[b]]);await as(b,"select public.friends_command('accept',$1)",[users[a]]);}
async function prepare(){await link(0,1);await social(1);return(await room(0,'create')).room.id;}
beforeEach(async()=>{await db.exec('truncate public.mp_rooms cascade;truncate public.player_presence;truncate public.player_friendships;truncate public.player_profiles');for(const [i,name]of ['Host','Friend','Third','Fourth','Other'].entries())await db.query('insert into public.player_profiles(user_id,nickname) values($1,$2)',[users[i],name]);});
after(()=>db.close());
test('activity is friend-only, auth-only and read/write tables remain inaccessible',async()=>{
 await link(0,1);await social(1);await social(2);
 const state=await social(0);assert.deepEqual(state.people,[{id:users[1],state:'lobby'}]);assert.equal(state.invitations.length,0);
 assert.deepEqual(Object.keys(state.people[0]).sort(),['id','state']);
 for(const table of ['player_presence','friend_room_invites']){await assert.rejects(as(0,'select * from public.'+table));await assert.rejects(as(0,'delete from public.'+table));}
 await assert.rejects(social(null));await assert.rejects(as(null,'select public.friend_activity()',[],'anon'));
 await assert.rejects(social(0,'poll',null,'unknown'));assert.equal((await as(0,'select * from public.player_profiles')).rows.length,1);
});
test('presence distinguishes offline, playing and room; heartbeat is throttled and hidden expiry is server-based',async()=>{
 await link(0,1);assert.equal((await social(0)).people[0].state,'offline');await social(1);
 const stamp=(await db.query('select seen_at from public.player_presence where user_id=$1',[users[1]])).rows[0].seen_at;
 await social(1);assert.deepEqual((await db.query('select seen_at from public.player_presence where user_id=$1',[users[1]])).rows[0].seen_at,stamp);
 await social(1,'poll',null,'playing');assert.equal((await social(0)).people[0].state,'playing');
 await social(1);await room(1,'create');assert.equal((await social(0)).people[0].state,'room');
 await db.query("update public.player_presence set seen_at=clock_timestamp()-interval '76 seconds' where user_id=$1",[users[1]]);assert.equal((await social(0)).people[0].state,'offline');
});
test('only host may invite an available accepted friend, with a server cooldown',async()=>{
 const id=await prepare();await social(2);await assert.rejects(social(0,'invite',2),/invite_not_friend/);
 await room(2,'join',id);await link(2,1);await assert.rejects(social(2,'invite',1),/invite_room_unavailable/);
 await social(1,'poll',null,'playing');await assert.rejects(social(0,'invite',1),/invite_player_busy/);await social(1);
 const sent=await social(0,'invite',1);assert.equal(sent.cooldowns.length,1);await assert.rejects(social(0,'invite',1),/invite_cooldown/);
 const inbox=(await social(1)).invitations;assert.equal(inbox.length,1);assert.equal(inbox[0].room,id);assert.equal(inbox[0].nickname,'Host');
 assert.ok(inbox[0].expires-sent.now<=60000);assert.equal((await social(3)).invitations.length,0);
});
test('accept atomically joins through room RPC; consumed ticket retries do not join twice',async()=>{
 const id=await prepare();await social(0,'invite',1);const invite=(await social(1)).invitations[0];
 await assert.rejects(social(2,'accept',0,'lobby',invite.ticket));
 await assert.rejects(social(1,'accept',0,'lobby',users[4]),/invite_expired/);
 assert.equal((await social(1,'accept',0,'lobby',invite.ticket)).joined,id);
 assert.equal((await social(1)).joined,id,'poll recovers a committed acceptance whose response was lost');
 assert.equal((await room(1)).room.id,id);assert.equal((await social(1)).invitations.length,0);
 assert.equal((await social(1,'accept',0,'lobby',invite.ticket)).joined,id);
 assert.equal((await db.query('select * from public.mp_members where room_id=$1',[id])).rows.length,2);
});
test('full, started, removed-friend and expired invitations never grant admission',async()=>{
 const id=await prepare();await social(0,'invite',1);const inv=(await social(1)).invitations[0];
 for(const n of [2,3,4])await room(n,'join',id);
 assert.equal((await social(1)).invitations.length,0);await assert.rejects(social(1,'accept',0,'lobby',inv.ticket),/room_unavailable/);
 assert.equal((await db.query('select pending from public.friend_room_invites')).rows[0].pending,true);
 await room(4,'leave');await db.query("update public.mp_rooms set phase='playing' where id=$1",[id]);await assert.rejects(social(1,'accept',0,'lobby',inv.ticket),/invite_expired/);
 await db.query("update public.mp_rooms set phase='waiting' where id=$1",[id]);
 await as(0,"select public.friends_command('remove',$1)",[users[1]]);assert.equal((await social(1)).invitations.length,0);await assert.rejects(social(1,'accept',0,'lobby',inv.ticket),/invite_expired/);
 await link(0,1);await db.exec("update public.friend_room_invites set expires_at=clock_timestamp()-interval '1 second'");await assert.rejects(social(1,'accept',0,'lobby',inv.ticket),/invite_expired/);
});
test('playing inbox is deferred, decline consumes ticket and old tickets cannot act on reinvites',async()=>{
 await prepare();await social(0,'invite',1);const old=(await social(1)).invitations[0];
 assert.equal((await social(1,'poll',null,'playing')).invitations.length,0);await assert.rejects(social(1,'accept',0,'playing',old.ticket),/invite_expired/);
 await social(1,'decline',0,'lobby',old.ticket);assert.equal((await social(1)).invitations.length,0);
 await db.exec("update public.friend_room_invites set sent_at=clock_timestamp()-interval '31 seconds'");await social(0,'invite',1);
 const next=(await social(1)).invitations[0];assert.notEqual(next.ticket,old.ticket);
 await assert.rejects(social(1,'decline',0,'lobby',old.ticket),/invite_expired/);assert.equal((await social(1)).invitations.length,1);
 await db.exec(await readFile(new URL('../supabase/migrations/202610230010_friend_invites.sql',import.meta.url),'utf8'));
 assert.equal((await social(1)).invitations[0].ticket,next.ticket);
});
test('host leave or ownership transfer invalidates old invitations',async()=>{
 const id=await prepare();await social(0,'invite',1);const inv=(await social(1)).invitations[0];await room(2,'join',id);await room(0,'leave');
 assert.equal((await social(1)).invitations.length,0);await assert.rejects(social(1,'accept',0,'lobby',inv.ticket),/invite_expired/);
});
const blank=()=>({people:[],invitations:[],cooldowns:[],joined:null,now:Date.now()});
test('activity transport binds authenticated owner and forwards cancellation and ticket',async()=>{
 let current={user:{id:users[0]},access_token:'owner'},args,headers,signal,calls=0;
 const api={auth:{async getSession(){return{data:{session:current},error:null};}},rpc(name,values){calls++;assert.equal(name,'friend_activity');args=values;return{setHeader(...values){headers=values;return this;},abortSignal(value){signal=value;return Promise.resolve({data:blank(),error:null});}};}};
 const send=activityTransport(api,users[0]),abort=new AbortController();await send('accept',users[1],'lobby',users[3],abort.signal);
 assert.deepEqual(args,{p_action:'accept',p_target:users[1],p_mode:'lobby',p_ticket:users[3]});assert.deepEqual(headers,['Authorization','Bearer owner']);assert.equal(signal,abort.signal);
 current={user:{id:users[1]},access_token:'other'};await assert.rejects(send('poll',null,'lobby',null,abort.signal));assert.equal(calls,1);
});

test('friend invite acceptance also saves the selected appearance before admission',async()=>{
 let release,admitted=false,saved=false;const gate=new Promise(resolve=>{release=resolve;});
 const api={auth:{async getSession(){return{data:{session:{user:{id:users[0]},access_token:'owner'}},error:null};}},rpc(){admitted=true;assert.equal(saved,true);return{setHeader(){return this;},abortSignal(){return Promise.resolve({data:blank(),error:null});}};}};
 const send=activityTransport(api,users[0],async()=>{await gate;saved=true;});
 const accepting=send('accept',users[1],'lobby',users[3],new AbortController().signal);await new Promise(resolve=>setImmediate(resolve));assert.equal(admitted,false);release();await accepting;assert.equal(admitted,true);
});
test('activity discards disposed-account responses, validates data, maps errors and hides stale inbox in gameplay',async()=>{
 let release,mode='lobby',failure='',calls=0;const gate=new Promise(resolve=>{release=resolve;});
 const data={...blank(),people:[{id:users[1],state:'lobby'}],invitations:[{sender:users[1],nickname:'Friend',room:users[3],name:'Room',ticket:users[4],expires:Date.now()+60000}]};
 const activity=new FriendActivity(users[0],async()=>{calls++;if(failure)throw{message:failure};return data;},()=>mode);
 assert.equal(await activity.refresh(),true);assert.equal(activity.state(users[1]),'lobby');assert.equal(activity.invitations.length,1);mode='playing';assert.equal(activity.invitations.length,0);
 failure='invite_cooldown';assert.equal(await activity.command('invite',users[1]),false);assert.equal(activity.error,'cooldown');assert.equal(activity.state(users[1]),'unknown');failure='';assert.equal(await activity.refresh(),true);
 data.people[0].state='<script>';assert.equal(await activity.refresh(),false);assert.equal(activity.error,'offline');activity.destroy();
 let captured;const disposed=new FriendActivity(users[0],async(_a,_t,_m,_i,signal)=>{captured=signal;await gate;return blank();},()=>mode);
 const pending=disposed.refresh();assert.equal(await disposed.refresh(),false);disposed.destroy();release();assert.equal(await pending,false);assert.equal(captured.aborted,true);assert.equal(disposed.loaded,false);
});
test('background tabs suspend polling, focus resumes it, and account disposal clears timers and listeners',async()=>{
 const saved={window:globalThis.window,document:globalThis.document};let calls=0;
 globalThis.window=new EventTarget();globalThis.document=Object.assign(new EventTarget(),{hidden:false});
 const activity=new FriendActivity(users[0],async()=>{calls++;return blank();},()=> 'lobby');
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  activity.start();await settle();assert.equal(calls,1);const timer=activity.timer;assert.ok(timer);
  document.hidden=true;activity.timer._onTimeout();await settle();assert.equal(calls,1);assert.equal(timer._destroyed,true);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(calls,2);
  const activeTimer=activity.timer;activity.destroy();assert.equal(activeTimer._destroyed,true);
  window.dispatchEvent(new Event('focus'));await settle();assert.equal(calls,2);assert.equal(await activity.refresh(),false);
 }finally{activity.destroy();for(const key of Object.keys(saved)){if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];}}
});
