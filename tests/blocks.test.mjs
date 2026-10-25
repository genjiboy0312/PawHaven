import{test,after,beforeEach}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{PGlite}from'@electric-sql/pglite';import{importTs}from'./load-typescript.mjs';
const{FriendsClient}=await importTs('../src/friends/FriendsClient.ts',import.meta.url);
const{parseFriendHome,readFriendHome}=await importTs('../src/friends/FriendHome.ts',import.meta.url);
const db=new PGlite();after(()=>db.close());const users=Array.from({length:4},(_,n)=>String(n+1).repeat(8)+'-1111-4111-8111-111111111111'),lease='aaaaaaaa-1111-4111-8111-111111111111';
await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema realtime;create table realtime.messages(extension text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;");
for(const file of['202610170001_player_accounts.sql','202610170002_server_economy.sql','202610190003_multiplayer.sql','202610200007_race_countdown.sql','202610210008_home_shop.sql','202610230009_friends.sql','202610230010_friend_invites.sql','202610240012_park_channels.sql','202610250015_player_blocks.sql','202610250017_friend_home_visits.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
for(const id of users)await db.query('insert into auth.users values($1)',[id]);
beforeEach(async()=>{await db.exec('truncate public.mp_rooms cascade;delete from public.player_blocks;delete from public.player_friendships;delete from public.park_chat;delete from public.park_members;delete from public.player_presence;delete from public.player_profiles');for(const[i,id]of users.entries())await db.query('insert into public.player_profiles(user_id,nickname)values($1,$2)',[id,'Player'+i]);});
async function as(n,sql,args=[],role='authenticated'){await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':users[n]]);return(await db.query(sql,args)).rows[0]?.data;}finally{await db.exec('reset role');}}
const friends=(n,action='list',target=null,query='')=>as(n,'select public.friends_command($1,$2,$3) as data',[action,target===null?null:users[target],query]);
const park=(n,action='sync',text='')=>as(n,'select public.park_command($1,1,$2,$3) as data',[action,lease,text]);
const whisper=(n,target)=>as(n,'select public.park_whisper(1,$1,$2,$3) as data',[lease,users[target],'secret']);
const activity=(n,action='poll',target=null,ticket=null)=>as(n,'select public.friend_activity($1,$2,$3,$4) as data',[action,target===null?null:users[target],'lobby',ticket]);

test('blocking removes friendship/requests/invites, prevents send/accept and unblocking never restores them',async()=>{
 await friends(0,'send',1);await friends(1,'accept',0);await activity(1);
 await as(0,"select public.multiplayer_command('create') as data");await activity(0,'invite',1);const old=(await activity(1)).invitations[0];assert.ok(old);
 const state=await friends(0,'block',1);assert.deepEqual(state.friends,[]);assert.equal(state.blocked[0].id,users[1]);assert.equal(state.blocked[0].relation,'blocked');
 assert.equal((await friends(1)).blocked.length,0);assert.equal((await activity(1)).invitations.length,0);assert.equal((await activity(0)).people.length,0);
 await assert.rejects(activity(0,'invite',1),/invite_not_friend/);await assert.rejects(activity(1,'accept',0,old.ticket),/invite_expired/);
 for(const[a,b]of[[0,1],[1,0]])for(const action of['send','accept'])await assert.rejects(friends(a,action,b),/friend_blocked/);
 assert.equal((await friends(0,'search',null,'Player1')).matches.length,0);assert.equal((await friends(1,'search',null,'Player0')).matches.length,0);
 await friends(1,'unblock',0);await assert.rejects(friends(1,'send',0),/friend_blocked/);
 await friends(0,'block',1);assert.equal((await friends(0)).blocked.length,1);await friends(0,'unblock',1);const unblocked=await friends(0);assert.equal(unblocked.blocked.length,0);assert.equal(unblocked.friends.length,0);assert.equal(unblocked.incoming.length,0);
 await friends(1,'send',0);assert.equal((await friends(0)).incoming.length,1);await friends(0,'block',1);assert.equal((await friends(0)).incoming.length,0);
});

test('server filters blocked public/private history and rejects whispers in both directions while actors remain',async()=>{
 for(let n=0;n<3;n++)await park(n,'join');await park(1,'chat','public before block');await whisper(0,1);
 assert.equal((await park(0)).messages.length,2);await friends(0,'block',1);
 const state=await park(0);assert.equal(state.members.length,3);assert.equal(state.messages.some(m=>m.user_id===users[1]),false);assert.equal((await park(2)).messages.some(m=>m.message==='public before block'),true);
 await assert.rejects(whisper(0,1),/friend_blocked/);await assert.rejects(whisper(1,0),/friend_blocked/);
 await db.query('update public.park_members set last_chat=null');await park(1,'chat','public after block');assert.equal((await park(0)).messages.some(m=>m.message==='public after block'),false);
 await friends(0,'unblock',1);assert.equal((await park(0)).messages.some(m=>m.message==='public after block'),true);await db.query('update public.park_members set last_chat=null');assert.equal((await whisper(1,0)).messages.some(m=>m.recipient_id===users[0]),true);
});

test('block RPC owns identity, restricts direct access and supports repeat migrations and account disposal',async()=>{
 await assert.rejects(friends(0,'block',0),/friend_invalid_target/);await assert.rejects(as(null,'select public.friends_command($1,$2) as data',['block',users[1]],'anon'),/permission denied/);
 await friends(0,'block',1);for(const n of[0,1,2])await assert.rejects(as(n,'select * from public.player_blocks'),/permission denied/);
 await assert.rejects(as(1,'delete from public.player_blocks'),/permission denied/);
 await db.exec(await readFile(new URL('../supabase/migrations/202610250015_player_blocks.sql',import.meta.url),'utf8'));assert.equal((await friends(0)).blocked.length,1);
 const c=new FriendsClient(users[0],(action,target,query)=>as(0,'select public.friends_command($1,$2,$3) as data',[action,target,query]));assert.equal(await c.refresh(),true);assert.equal(c.snapshot.blocked[0].id,users[1]);assert.equal(await c.command('send',users[1]),false);assert.equal(c.error,'blocked');assert.equal(await c.command('unblock',users[1]),true);assert.equal(c.snapshot.blocked.length,0);c.destroy();assert.equal(c.snapshot.blocked,undefined);
});

const visit=n=>as(0,'select public.visit_friend_home($1) as data',[users[n]]);
test('saved friend homes are read-only, offline-capable and omit private save and inventory data',async()=>{
 await db.exec('delete from public.player_saves;delete from public.economy_home_items;delete from public.economy_items');
 await friends(0,'send',1);await friends(1,'accept',0);
 const placed=Array.from({length:3},(_,n)=>({id:n+1,tab:'Furniture',option:5,x:.2+n*.2,y:.75}));
 const snapshot={version:1,character:{petId:'myeongrang',outfit:{Hat:2,Acc:2,Body:0,Etc:0}},presets:[{secret:'not shared'}],private:'hidden',home:{version:2,Background:2,Floor:3,items:placed,secret:'hidden'}};
 await db.query('insert into public.player_saves(user_id,snapshot)values($1,$2)',[users[1],JSON.stringify(snapshot)]);
 await db.query("insert into public.economy_items values($1,'Hat',2)",[users[1]]);await db.query("insert into public.economy_home_items values($1,'Furniture',5,2)",[users[1]]);
 const before=(await db.query('select * from public.player_saves')).rows;
 const data=await visit(1);assert.deepEqual(Object.keys(data).sort(),['character','home','id','nickname']);assert.equal(data.character.petId,'myeongrang');assert.equal(data.character.outfit.Hat,2);assert.equal(data.character.outfit.Acc,0);assert.equal(data.home.items.length,2);assert.equal(data.home.secret,undefined);
 const view=parseFriendHome(data,users[1]);assert.equal(view.home.current.Background,2);assert.equal(view.home.items.length,2);view.home.move(1,.8,.8);view.character.outfit.Hat=0;
 assert.equal((await visit(1)).home.items[0].x,.2);assert.deepEqual((await db.query('select * from public.player_saves')).rows,before);
 assert.equal((await db.query('select * from public.player_saves where user_id=$1',[users[0]])).rows.length,0);
 assert.equal(await as(0,'select snapshot as data from public.player_saves where user_id=$1',[users[1]]),undefined);
 await db.exec(await readFile(new URL('../supabase/migrations/202610250017_friend_home_visits.sql',import.meta.url),'utf8'));assert.equal((await visit(1)).home.items.length,2);
});
test('only accepted, unblocked friends can visit, including friends without a saved home',async()=>{
 for(const n of[0,1,2])await assert.rejects(visit(n),/home_unavailable/);
 await friends(0,'send',2);await assert.rejects(visit(2),/home_unavailable/);await friends(2,'accept',0);
 await db.query('delete from public.player_saves where user_id=$1',[users[2]]);const empty=await visit(2);assert.deepEqual(empty.home.items,[]);assert.equal(empty.character.petId,'corgi');
 await friends(2,'block',0);await assert.rejects(visit(2),/home_unavailable/);
 // Even an inconsistent accepted row must not bypass a block in either direction.
 await db.query("insert into public.player_friendships(user_low,user_high,requested_by,status)values($1,$2,$1,'accepted')",[users[0],users[2]]);await assert.rejects(visit(2),/home_unavailable/);
 await assert.rejects(as(null,'select public.visit_friend_home($1) as data',[users[2]],'anon'),/permission denied/);
 await assert.rejects(as(null,'select public.visit_friend_home($1) as data',[users[2]]),/not_authenticated/);
 await db.query('delete from public.player_friendships where user_high=$1',[users[2]]);
});
test('home transport checks account identity, discards cancelled responses and normalizes isolated placement data',async()=>{
 const data={id:users[1],nickname:'Player1',character:{petId:'myeongrang',outfit:{Hat:0,Acc:0,Body:0,Etc:0}},home:{version:2,Background:1,Floor:2,items:[{id:1,tab:'Furniture',option:5,x:99,y:-1}]}};
 assert.equal(parseFriendHome(data,users[1]).home.items[0].x,.9);assert.throws(()=>parseFriendHome(data,users[2]),/home_unavailable/);
 let resolve,calls=0;const signal=new AbortController();const client={auth:{getSession:async()=>({data:{session:{user:{id:users[0]},access_token:'token'}}})},rpc(name,args){assert.equal(name,'visit_friend_home');assert.deepEqual(args,{p_target:users[1]});calls++;return{setHeader(){return this;},abortSignal(){return new Promise(r=>resolve=r);}};}};
 const request=readFriendHome(client,users[0],users[1],signal.signal);await new Promise(r=>setTimeout(r,0));signal.abort();resolve({data});await assert.rejects(request,/account_changed/);
 await assert.rejects(readFriendHome(client,users[2],users[1],new AbortController().signal),/account_changed/);assert.equal(calls,1);
});
