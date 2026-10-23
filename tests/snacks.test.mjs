import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {importTs} from './load-typescript.mjs';
const {EconomyClient}=await importTs('../src/shop/EconomyClient.ts',import.meta.url);
const {ServerShopState}=await importTs('../src/shop/ServerShopState.ts',import.meta.url);
const {ShopState}=await importTs('../src/shop/ShopState.ts',import.meta.url);
const {SnackButton}=await importTs('../src/ui/SnackButton.ts',import.meta.url);
const {parseEconomyResult}=await importTs('../src/shop/EconomySnapshot.ts',import.meta.url);
const db=new PGlite(),users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];let sequence=0;
const uuid=()=> '00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');
await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;");
for(const file of ['202610170001_player_accounts.sql','202610170002_server_economy.sql','202610210008_home_shop.sql','202610240011_snacks.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
for(const id of users)await db.query('insert into auth.users values($1)',[id]);
async function as(n,sql,args=[],role='authenticated'){await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':users[n]]);return await db.query(sql,args);}finally{await db.exec('reset role');}}
async function command(n,action='load',payload={},id=uuid()){return(await as(n,'select public.economy_command($1,$2,$3) as data',[action,id,JSON.stringify(payload)])).rows[0].data;}
async function earn(n=0){await command(n);await db.query('update public.economy_wallets set daily_pet=3 where user_id=$1',[users[n]]);return command(n,'claim_daily',{quest:'pet'});}
beforeEach(()=>db.exec('truncate public.economy_requests,public.economy_runs,public.economy_claims,public.economy_items,public.economy_home_items,public.economy_wallets'));
after(()=>db.close());
test('daily quest grants one server-owned treat only on a successful first claim',async()=>{
 assert.equal((await command(0)).snapshot.snacks,0);assert.equal((await command(0,'claim_daily',{quest:'pet'})).snapshot.snacks,0);
 await db.query('update public.economy_wallets set daily_pet=3 where user_id=$1',[users[0]]);
 const id=uuid(),payload={quest:'pet',snacks:99,user_id:users[1]};const first=await command(0,'claim_daily',payload,id);
 assert.equal(first.outcome,'claimed');assert.equal(first.snapshot.snacks,1);assert.equal(first.snapshot.coins,1050);
 assert.equal((await command(0,'claim_daily',payload,id)).snapshot.snacks,1);assert.equal((await command(0,'claim_daily',{quest:'pet'})).snapshot.snacks,1);
 assert.equal((await command(1)).snapshot.snacks,0);await assert.rejects(as(0,'update public.economy_wallets set snacks=99'),/permission denied/);assert.equal((await as(1,'select * from public.economy_wallets')).rows.length,1);
 await assert.rejects(command(null,'feed',{petId:'corgi'}));await assert.rejects(as(null,"select public.economy_command('load',$1)",[uuid()],'anon'));
});
test('feed is atomic, validates the pet, rate-limits taps and replays a lost response without consuming twice',async()=>{
 await earn();await assert.rejects(command(0,'feed',{petId:'invalid'}),/invalid_pet/);const id=uuid(),payload={petId:'myeongrang',count:-10,user_id:users[1]};
 const first=await command(0,'feed',payload,id);assert.equal(first.outcome,'fed');assert.equal(first.petId,'myeongrang');assert.equal(first.snapshot.snacks,0);
 assert.equal((await command(0,'feed',payload,id)).outcome,'fed');assert.equal((await command(0)).snapshot.snacks,0);assert.equal((await command(0,'feed',{petId:'corgi'})).outcome,'snack_empty');
 await db.query('update public.economy_wallets set daily_run=1 where user_id=$1',[users[0]]);await command(0,'claim_daily',{quest:'run'});
 assert.equal((await command(0,'feed',{petId:'corgi'})).outcome,'snack_cooldown');assert.equal((await command(0)).snapshot.snacks,1);
 await db.query("update public.economy_wallets set last_snack=clock_timestamp()-interval '5 seconds' where user_id=$1",[users[0]]);assert.equal((await command(0,'feed',{petId:'corgi'})).snapshot.snacks,0);
 await assert.rejects(command(0,'feed',{petId:'corgi'},id),/request_id_reused/);
});
test('stock caps at 99, persists across server day rollover and migration replay preserves inventory',async()=>{
 await command(0);await db.query('update public.economy_wallets set snacks=99,daily_pet=3 where user_id=$1',[users[0]]);
 assert.equal((await command(0,'claim_daily',{quest:'pet'})).snapshot.snacks,99);
 await db.query("update public.economy_claims set claim_key='daily:' || (select quest_day-1 from public.economy_wallets where user_id=$1) || ':pet' where user_id=$1",[users[0]]);
 await db.query("update public.economy_wallets set quest_day=quest_day-1 where user_id=$1",[users[0]]);const next=await command(0);assert.equal(next.snapshot.snacks,99);assert.equal(next.snapshot.daily.pet,0);assert.deepEqual(next.snapshot.daily.claimed,[]);
 await db.exec(await readFile(new URL('../supabase/migrations/202610240011_snacks.sql',import.meta.url),'utf8'));assert.equal((await command(0)).snapshot.snacks,99);
});
test('older servers remain readable and malformed treat stock cannot enter the client',async()=>{
 const data=await command(0);assert.equal(parseEconomyResult(data).snapshot.snacksReady,true);
 const old=structuredClone(data);delete old.snapshot.snacks;delete old.snapshot.snacksReady;assert.ok(parseEconomyResult(old));
 for(const count of [-1,100,1.5,'1']){const bad=structuredClone(data);bad.snapshot.snacks=count;assert.throws(()=>parseEconomyResult(bad));}
});
test('guest quest and treat use persist together without granting a second daily reward',()=>{
 let saved=null,now=new Date(2026,9,24,10).getTime();const storage={getItem:()=>saved,setItem(_k,v){saved=v;}};const shop=new ShopState(storage,()=>now);
 for(let i=0;i<3;i++){shop.recordPet();now+=10000;}assert.equal(shop.claimDaily('pet'),true);assert.equal(shop.snacks,1);assert.equal(shop.claimDaily('pet'),false);
 assert.equal(shop.feed('myeongrang'),true);assert.equal(shop.feedSerial,1);assert.equal(shop.feed('myeongrang'),false);assert.equal(new ShopState(storage,()=>now).snacks,0);
 shop.completeRun();assert.equal(shop.claimDaily('run'),true);assert.equal(shop.feed('corgi'),false);now+=4000;assert.equal(shop.feed('corgi'),true);
});
test('unknown feed outcomes retry the same request and trigger exactly one reaction event',async()=>{
 await earn();let fail=true,requests=[];
 const api=new EconomyClient(async request=>{requests.push(request.p_request_id);const value=await command(0,request.p_action,request.p_payload,request.p_request_id);if(request.p_action==='feed'&&fail){fail=false;throw Error('lost response');}return value;},uuid);
 const shop=new ServerShopState(api);const idle=async()=>{for(let i=0;api.busy&&i<1000;i++)await new Promise(r=>setTimeout(r,1));assert.equal(api.busy,false);};
 try{await idle();assert.equal(await shop.feed('myeongrang'),false);assert.equal(shop.feedSerial,0);assert.equal((await command(0)).snapshot.snacks,0);const request=requests.at(-1);await api.retry();assert.equal(requests.at(-1),request);assert.equal(shop.snacks,0);assert.equal(shop.feedSerial,1);assert.equal(shop.fedPet,'myeongrang');await api.retry();assert.equal(shop.feedSerial,1);}finally{shop.destroy();}
});
class Element extends EventTarget{children=[];style={};hidden=false;disabled=false;attributes=new Map();append(...items){this.children.push(...items);}setAttribute(k,v){this.attributes.set(k,v);}remove(){this.removed=true;}}
test('pet-side button serializes touches, routes empty stock to quests and cleans up its action',async()=>{
 const old=globalThis.document;globalThis.document={createElement:()=>new Element()};let quests=0,reactions=0;
 const shop=new ShopState({getItem:()=>JSON.stringify({snacks:1}),setItem(){}}),button=new SnackButton(shop,'myeongrang',()=>reactions++,()=>quests++);
 try{button.reveal();button.element.dispatchEvent(new Event('click'));button.element.dispatchEvent(new Event('click'));await new Promise(r=>setImmediate(r));button.update(0,20,20,960,540);assert.equal(shop.snacks,0);assert.equal(reactions,1);button.update(0,20,20,960,540);assert.equal(reactions,1);assert.equal(button.element.disabled,true);button.update(5,20,20,960,540);button.reveal();button.element.dispatchEvent(new Event('click'));assert.equal(quests,1);button.destroy();assert.equal(button.element.removed,true);}finally{button.destroy();if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
