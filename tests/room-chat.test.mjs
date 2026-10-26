import {test,after} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {importTs} from './load-typescript.mjs';
const {RoomChatClient}=await importTs('../src/multiplayer/RoomChatClient.ts',import.meta.url);
const db=new PGlite();after(()=>db.close());
await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema realtime;create table realtime.messages(extension text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;create function realtime.send(jsonb,text,text,boolean)returns void language sql as $$select null::void$$;create table public.player_blocks(blocker uuid,blocked uuid);");
for(const file of ['202610170001_player_accounts.sql','202610190003_multiplayer.sql','202610260020_room_chat.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
const users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];for(const id of users)await db.query('insert into auth.users values($1)',[id]);
const room=(await db.query("insert into public.mp_rooms(name,host)values('Room',$1) returning id",[users[0]])).rows[0].id;
for(const [i,id]of users.slice(0,2).entries())await db.query("insert into public.mp_members(user_id,room_id,nickname,look)values($1,$2,$3,'{}')",[id,room,'Player'+i]);
let sequence=0;const nonce=()=>`aaaaaaaa-1111-4111-8111-${String(++sequence).padStart(12,'0')}`;
async function as(n,sql,args=[],role='authenticated'){await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':users[n]]);return await db.query(sql,args);}finally{await db.exec('reset role');}}
async function command(n,action='list',text='',key=null){return(await as(n,'select public.room_chat_command($1,$2,$3,$4) as data',[room,action,text,key])).rows[0].data;}
test('waiting-room chat is private, server-named, limited, idempotent, blocked and phase-gated',async()=>{
 assert.deepEqual(await command(0),[]);const key=nonce();const sent=await command(0,'send','  hello  ',key);assert.equal(sent[0].text,'hello');assert.equal(sent[0].name,'Player0');assert.equal(sent[0].sender,users[0]);
 assert.equal((await command(0,'send','hello',key)).length,1);await assert.rejects(command(0,'send','spam',nonce()),/chat_slow/);
 assert.equal((await command(1)).length,1);await assert.rejects(command(2),/room_chat_unavailable/);await assert.rejects(as(null,'select public.room_chat_command($1)',[room],'anon'),/permission denied/);await assert.rejects(as(0,'select * from public.mp_chat'),/permission denied/);
 await assert.rejects(command(1,'send','x'.repeat(101),nonce()),/invalid_chat/);await assert.rejects(command(1,'bad'),/invalid_action/);
 await db.query('insert into public.player_blocks values($1,$2)',[users[1],users[0]]);assert.equal((await command(1)).length,0);await db.exec('delete from public.player_blocks');
 await db.query("update public.mp_members set seen_at=now()-interval '1 minute' where user_id=$1",[users[1]]);await assert.rejects(command(1),/room_chat_unavailable/);await db.exec('update public.mp_members set seen_at=now()');
 for(const phase of ['countdown','playing','results']){await db.query('update public.mp_rooms set phase=$1',[phase]);await assert.rejects(command(0,'send','late',nonce()),/room_chat_unavailable/);}
 await db.exec("update public.mp_rooms set phase='waiting'");
 const policies=(await db.query("select policyname,permissive from pg_policies where tablename='messages' and policyname like 'paw_chat%' order by policyname")).rows;assert.equal(policies.length,3);assert.equal(policies.find(p=>p.policyname==='paw_chat_write_guard').permissive,'RESTRICTIVE');
 assert.equal((await as(0,'select public.can_receive_paw_chat($1) as allowed',['paw-chat:'+room])).rows[0].allowed,true);assert.equal((await as(2,'select public.can_receive_paw_chat($1) as allowed',['paw-chat:'+room])).rows[0].allowed,false);
 await db.exec(await readFile(new URL('../supabase/migrations/202610260020_room_chat.sql',import.meta.url),'utf8'));assert.equal((await command(0)).length,1);
 for(let i=0;i<35;i++)await db.query("insert into public.mp_chat(room_id,sender,nickname,body,nonce,created_at)values($1,$2,'Player0',$3,$4,now()+$5*interval '1 second')",[room,users[0],'line'+i,nonce(),i+1]);
 const history=await command(1);assert.equal(history.length,30);assert.equal(history[0].text,'line5');assert.equal(history.at(-1).text,'line34');
 await db.query('delete from public.mp_rooms where id=$1',[room]);assert.equal((await db.query('select count(*)::int as count from public.mp_chat')).rows[0].count,0);
});
test('chat retries a lost send with the same nonce and ignores disposed account responses',async()=>{
 const message={id:'message',sender:users[0],name:'Player',text:'hello',at:new Date().toISOString()},requests=[];let lost=true;
 const client=new RoomChatClient(async(action,text,key)=>{requests.push(key);if(action==='send'&&lost){lost=false;throw Error('lost');}return[message];});
 assert.equal(await client.send('hello'),false);assert.equal(await client.send('hello'),true);assert.equal(requests[0],requests[1]);assert.equal(client.messages.length,1);client.destroy();
 let resolve;const late=new RoomChatClient(()=>new Promise(r=>resolve=r));const pending=late.refresh();late.destroy();resolve([message]);await pending;assert.deepEqual(late.messages,[]);
 const invalid=new RoomChatClient(async()=>[{...message,text:'x'.repeat(101)}]);await invalid.refresh();assert.equal(invalid.loaded,false);assert.equal(invalid.error,'roomChatOffline');invalid.destroy();
});
