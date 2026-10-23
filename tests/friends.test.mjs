import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {importTs} from './load-typescript.mjs';
const db=new PGlite(),users=[1,2,3,4].map(n=>`${n}`.repeat(8)+'-1111-4111-8111-111111111111');
const {FriendsClient,friendsTransport}=await importTs('../src/friends/FriendsClient.ts',import.meta.url);
const {FriendsPopup}=await importTs('../src/ui/FriendsPopup.ts',import.meta.url);
const {setLanguage}=await importTs('../src/settings/i18n.ts',import.meta.url);
const blank=()=>({friends:[],incoming:[],outgoing:[],matches:[]});
const friend=(id=users[1],relation='friend')=>({id,nickname:'Corgi',relation});
async function idle(client){for(let i=0;client.busy&&i<2000;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(client.busy,false);}
await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;");
for(const file of ['202610170001_player_accounts.sql','202610230009_friends.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
for(const id of users)await db.query('insert into auth.users values($1)',[id]);
async function as(n,sql,args=[],role='authenticated'){
 await db.exec('set role '+role);
 try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':users[n]]);return await db.query(sql,args);}finally{await db.exec('reset role');}
}
async function command(n,action='list',target=null,query=''){return(await as(n,'select public.friends_command($1,$2,$3) as data',[action,target===null?null:users[target],query])).rows[0].data;}
beforeEach(async()=>{await db.exec('truncate public.player_friendships;truncate public.player_profiles');for(const [i,name]of ['Myeongrang','Corgi','Corgi_pal','Other'].entries())await db.query('insert into public.player_profiles(user_id,nickname) values($1,$2)',[users[i],name]);});
after(()=>db.close());
test('friend search exposes only bounded public nicknames and treats underscores literally',async()=>{
 const data=await command(0,'search',null,'cor');assert.equal(data.matches.length,2);
 assert.deepEqual(Object.keys(data.matches[0]).sort(),['id','nickname','relation']);
 assert.equal((await command(1,'search',null,'corgi')).matches.some(p=>p.id===users[1]),false);
 assert.equal((await command(0,'search',null,'Corgi_')).matches[0].id,users[2]);
 await assert.rejects(command(0,'search',null,'%'));await assert.rejects(command(null));
 await assert.rejects(as(null,"select public.friends_command()",[],'anon'));
 assert.equal((await as(0,'select * from public.player_profiles')).rows.length,1);
});
test('friend requests require recipient consent, are idempotent and become symmetric on acceptance',async()=>{
 let data=await command(0,'send',1,'Cor');assert.equal(data.outgoing.length,1);assert.equal(data.matches[0].relation,'outgoing');
 await command(0,'send',1);assert.equal((await db.query('select * from public.player_friendships')).rows.length,1);
 await assert.rejects(command(0,'accept',1));await assert.rejects(command(1,'send',0),/friend_incoming/);
 assert.equal((await command(1)).incoming[0].id,users[0]);
 data=await command(1,'accept',0);assert.equal(data.friends[0].id,users[0]);assert.equal(data.incoming.length,0);
 assert.equal((await command(0)).friends[0].id,users[1]);await command(1,'accept',0);
 await command(0,'remove',1);assert.equal((await command(1)).friends.length,0);await command(0,'remove',1);
});
test('only the appropriate party can cancel, decline, or mutate a friendship',async()=>{
 await command(0,'send',1);
 await assert.rejects(command(0,'reject',1));await assert.rejects(command(1,'cancel',0));await assert.rejects(command(2,'accept',0));
 await assert.rejects(command(0,'remove',1));await command(1,'reject',0);assert.equal((await command(0)).outgoing.length,0);
 await command(0,'send',1);await command(0,'cancel',1);assert.equal((await command(1)).incoming.length,0);
 await assert.rejects(command(0,'send',0));await db.query('update public.player_profiles set nickname=null where user_id=$1',[users[2]]);
 await assert.rejects(command(0,'send',2));await assert.rejects(command(2,'send',0),/friend_nickname_required/);
 await command(0,'send',1);
 assert.equal((await as(2,'select * from public.player_friendships')).rows.length,0);
 await assert.rejects(as(2,'delete from public.player_friendships'));await assert.rejects(as(0,'update public.player_friendships set status=\'accepted\''));
});

test('search and pending requests stay bounded, and the migration can be rerun safely',async()=>{
 await db.exec("insert into auth.users select md5('friend-test-'||i)::uuid from generate_series(1,25)i on conflict do nothing;insert into public.player_profiles(user_id,nickname) select md5('friend-test-'||i)::uuid,'TestFriend'||i from generate_series(1,25)i;");
 assert.equal((await command(0,'search',null,'TestFriend')).matches.length,20);
 for(let i=1;i<=20;i++)await as(0,"select public.friends_command('send',md5('friend-test-'||$1)::uuid)",[String(i)]);
 await assert.rejects(as(0,"select public.friends_command('send',md5('friend-test-21')::uuid)"),/friend_limit/);
 await db.exec(await readFile(new URL('../supabase/migrations/202610230009_friends.sql',import.meta.url),'utf8'));
 assert.equal((await command(0)).outgoing.length,20);
});

test('friends transport binds RPC to the current authenticated owner and never sends for another account',async()=>{
 let session={user:{id:users[0]},access_token:'owner-token'},calls=0,headers,signal;
 const api={auth:{getSession:async()=>({data:{session},error:null})},rpc(name,args){calls++;assert.equal(name,'friends_command');assert.equal(args.p_action,'list');return{setHeader(key,value){headers=[key,value];return this;},abortSignal(value){signal=value;return Promise.resolve({data:blank(),error:null});}};}};
 const send=friendsTransport(api,users[0]),abort=new AbortController();
 await send('list',null,'',abort.signal);assert.deepEqual(headers,['Authorization','Bearer owner-token']);assert.equal(signal,abort.signal);
 session={user:{id:users[1]},access_token:'other-token'};await assert.rejects(send('list',null,'',abort.signal));assert.equal(calls,1);
 session=null;await assert.rejects(send('list',null,'',abort.signal));assert.equal(calls,1);
});

test('closed or disposed friends clients discard late responses and serialize mutations',async()=>{
 let release,calls=0,signal;const gate=new Promise(resolve=>{release=resolve;});
 const client=new FriendsClient(users[0],async(_action,_target,_query,abort)=>{calls++;signal=abort;if(calls===1)await gate;return{...blank(),friends:[friend()]};});
 const pending=client.refresh();assert.equal(client.busy,true);assert.equal(await client.command('send',users[2]),false);assert.equal(calls,1);
 client.stop();assert.equal(signal.aborted,true);release();assert.equal(await pending,false);assert.equal(client.loaded,false);assert.deepEqual(client.snapshot,blank());
 assert.equal(await client.refresh(),true);assert.equal(client.snapshot.friends[0].id,users[1]);
 client.destroy();assert.equal(await client.refresh(),false);assert.deepEqual(client.snapshot,blank());
});

test('friends errors recover without accepting malformed data or invalid searches',async()=>{
 let mode='setup',calls=0;
 const client=new FriendsClient(users[0],async()=>{calls++;if(mode==='setup')throw{code:'PGRST202'};if(mode==='bad')return{...blank(),friends:[{...friend(),nickname:'<script>'}]};return blank();});
 assert.equal(await client.refresh(),false);assert.equal(client.error,'setup');mode='ready';assert.equal(await client.refresh(),true);assert.equal(client.error,'');
 const old=calls;assert.equal(await client.search('%'),false);assert.equal(client.error,'query');assert.equal(calls,old);
 assert.equal(await client.command('send',users[0]),false);assert.equal(calls,old);
 mode='bad';assert.equal(await client.refresh(),false);assert.equal(client.error,'offline');assert.deepEqual(client.snapshot,blank());client.destroy();
});

class Element extends EventTarget{
 children=[];attributes=new Map();className='';textContent='';inert=false;disabled=false;scrollTop=0;value='';
 constructor(tag='div'){super();this.tag=tag;}
 classList={contains:name=>this.className.split(' ').includes(name)};
 append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
 replaceChildren(...items){this.children.forEach(item=>{item.parent=undefined;});this.children=[];this.append(...items);}
 all(){return this.children.flatMap(item=>[item,...item.all()]);}
 setAttribute(key,value){this.attributes.set(key,value);}getAttribute(key){return this.attributes.get(key)??null;}
 querySelector(selector){return this.all().find(item=>item.className.split(' ').includes(selector.slice(1)));}
 querySelectorAll(){return this.all().filter(item=>['button','input'].includes(item.tag)&&!item.disabled);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);}
 focus(){document.activeElement=this;}get isConnected(){return this.tag==='main'||!!this.parent?.isConnected;}
}
function dom(){
 const old={document:globalThis.document,window:globalThis.window,HTMLElement:globalThis.HTMLElement},host=new Element('main');
 const doc=Object.assign(new EventTarget(),{hidden:false,documentElement:{},activeElement:undefined,createElement:tag=>new Element(tag),querySelector:selector=>selector==='#app'?host:host.querySelector(selector),querySelectorAll:selector=>host.all().filter(item=>item.attributes.has(selector.slice(1,-1)))});
 globalThis.document=doc;globalThis.window=new EventTarget();globalThis.HTMLElement=Element;
 return{host,restore(){for(const key of Object.keys(old)){if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key];}}};
}

test('lobby-owned friends polling survives popup close and is disposed with the account',async()=>{
 const env=dom(),client=new FriendsClient(users[0],async()=>blank());
 const popup=new FriendsPopup(()=>{},client,undefined,()=> 'Myeongrang',undefined,undefined,true);
 try{
  client.start();await idle(client);const timer=client.timer;popup.open();popup.close();
  assert.equal(client.timer,timer);assert.equal(timer._destroyed,false);
  await command(1,'send',0);client.transport=async()=>command(0);await client.refresh();assert.equal(client.snapshot.incoming.length,1);
  popup.destroy();assert.equal(client.timer._destroyed,true);assert.deepEqual(client.snapshot,blank());assert.equal(await client.refresh(),false);
 }finally{popup.destroy();env.restore();}
});
test('Friends popup searches, sends, cancels, accepts and confirms deletion with the real RPC state',async()=>{
 const env=dom(),hud=new Element();env.host.append(hud);const pauses=[];
 const client=new FriendsClient(users[0],(action,target,query)=>command(0,action,target===null?null:users.indexOf(target),query));
 const popup=new FriendsPopup(value=>pauses.push(value),client,()=>{},()=> 'Myeongrang');
 const click=label=>{const button=env.host.all().find(item=>item.tag==='button'&&item.textContent===label);assert.ok(button,label);button.dispatchEvent(new Event('click'));};
 try{
  popup.open();await idle(client);assert.equal(hud.inert,true);assert.equal(pauses.at(-1),true);
  click('Add Friend');let input=env.host.querySelector('.friend-search').children[0];input.value='Corgi';input.dispatchEvent(new Event('input'));
  env.host.querySelector('.friend-search').dispatchEvent(new Event('submit',{cancelable:true}));await idle(client);assert.equal(client.snapshot.matches.length,2);
  click('Add friend');await idle(client);assert.equal(client.snapshot.outgoing.length,1);
  click('Requests');click('Cancel request');await idle(client);assert.equal(client.snapshot.outgoing.length,0);
  await command(1,'send',0);await client.refresh();assert.ok(env.host.all().some(item=>item.textContent==='Requests (1)'));
  click('Accept');await idle(client);click('Friends');assert.equal(client.snapshot.friends.length,1);
  click('Remove');assert.equal(env.host.querySelector('.friends-panel').inert,true);await client.refresh();env.host.querySelector('.confirm-cancel').dispatchEvent(new Event('click'));assert.equal(client.snapshot.friends.length,1);
  assert.equal(document.activeElement,env.host.querySelector('.friends-panel').querySelector('.settings-close'));
  click('Remove');env.host.querySelector('.confirm-accept').dispatchEvent(new Event('click'));await idle(client);assert.equal(client.snapshot.friends.length,0);
  setLanguage('ko');assert.ok(env.host.all().some(item=>item.textContent==='새로고침'));
  popup.close();assert.equal(hud.inert,false);assert.equal(pauses.at(-1),false);assert.equal(client.busy,false);
  const timer=client.timer;assert.ok(timer);assert.equal(timer._destroyed,true);
 }finally{popup.destroy();setLanguage('en');env.restore();}
});
