import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { importTs } from './load-typescript.mjs';
const { SingleRecords } = await importTs('../src/game/SingleRecords.ts', import.meta.url);
const { AccountStorage } = await importTs('../src/account/AccountStorage.ts', import.meta.url);
const { SingleRecordSync, parseSingleRecordData, singleRecordTransport } = await importTs('../src/account/SingleRecordSync.ts', import.meta.url);
const empty = () => ({version:2,times:{},goals:{}});
const data = (ms, goals=['finish']) => ({version:2,times:{practice:ms},goals:{practice:goals}});
const tick = () => new Promise(r=>setImmediate(r));
const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/202611070037_single_record_sync.sql',import.meta.url),'utf8');
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users values ('${a}'),('${b}');`);
await db.exec(migration);
after(()=>db.close());
async function as(owner,sql,params=[],role='authenticated'){
 await db.exec('set role '+role);
 try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner??'']);return await db.query(sql,params);}finally{await db.exec('reset role');}
}
const sync = async(owner,payload=empty())=>(await as(owner,'select public.sync_single_records($1::jsonb) as value',[JSON.stringify(payload)])).rows[0].value;

test('SQL merges best time and goals across devices, isolates owners, and reruns safely',async()=>{
 assert.deepEqual(await sync(a,data(15000,['finish','noFalls'])),data(15000,['finish','noFalls']));
 assert.deepEqual(await sync(a,data(10000)),data(10000,['finish','noFalls','time']));
 assert.deepEqual(await sync(a,data(20000)),data(10000,['finish','noFalls','time']));
 assert.deepEqual(await sync(b),empty());
 assert.equal((await as(b,'select * from public.player_single_records')).rows.length,0);
 await assert.rejects(as(b,`insert into public.player_single_records values ($1,'garden',1,false,now())`,[b]),/permission denied/);
 await assert.rejects(as(null,'select public.sync_single_records()'),/authentication_required/);
 await assert.rejects(as(a,'select public.sync_single_records()',[],'anon'),/permission denied/);
 await db.exec(migration); assert.equal((await sync(a)).times.practice,10000);
});
test('SQL rejects malformed records atomically and derives time goals from map thresholds',async()=>{
 for(const payload of [null,{}, {...empty(),version:'2'},data(0),data(86400001),data(1.2),{version:2,times:{bad:5},goals:{bad:[]}},data(123,['wrong']),{...empty(),goals:{garden:['finish']}},data(123,[null]),{version:2,times:{garden:12000,practice:0},goals:{garden:[],practice:[]}}]){
  await assert.rejects(sync(b,payload),/invalid_single_records/);
 }
 assert.deepEqual(await sync(b),empty());
 const result=await sync(b,{version:2,times:{forest:40001,garden:30000},goals:{forest:['time'],garden:[]}});
 assert.deepEqual(result.goals.forest,['finish']);assert.deepEqual(result.goals.garden,['finish','time']);
});
test('local merge is monotonic, preserves legacy records, and returns independent snapshots',()=>{
 const record=new SingleRecords({getItem:()=>JSON.stringify({version:1,times:{practice:14000}}),setItem(){}});
 let changes=0;record.subscribe(()=>changes++);
 record.merge(data(18000,['finish','noFalls']));record.merge(data(11000));record.merge(data(18000));
 assert.equal(record.best('practice'),11000);assert.deepEqual(record.goals('practice'),['finish','noFalls','time']);assert.equal(changes,2);
 const snap=record.snapshot();snap.goals.practice.length=0;assert.equal(record.goals('practice').length,3);
 assert.throws(()=>parseSingleRecordData(data(4,['bad'])));
});
test('account-bound storage survives owner changes without dirtying cosmetic saves or importing guests',()=>{
 const storage=new AccountStorage();storage.singleRecords().complete('practice',8,0);
 storage.owner=a;const first=storage.singleRecords();first.complete('practice',14,1);
 storage.owner=b;first.complete('practice',12,1);
 assert.equal(storage.singleRecords().best('practice'),null);assert.equal(storage.singleRecords(a).best('practice'),12000);
 assert.equal(storage.singleRecords(null).best('practice'),8000);assert.equal(storage.meta.dirty,false);
});
test('sync serializes changes made during download and retains server goals',async()=>{
 const record=new SingleRecords();let calls=[],release;
 const service=new SingleRecordSync(record,empty,payload=>{calls.push(payload);return calls.length===1?new Promise(r=>release=r):Promise.resolve(payload);});
 await tick();record.complete('practice',9,1);release(data(14000,['finish','noFalls']));await service.sync();
 assert.equal(calls.length,2);assert.equal(calls[1].times.practice,9000);assert.deepEqual(calls[1].goals.practice,['finish','noFalls','time']);
 assert.equal(service.status,'saved');service.destroy();
});
test('offline retry and explicit guest import preserve data without retry loops',async()=>{
 const record=new SingleRecords();let failed=true,calls=0;
 const service=new SingleRecordSync(record,()=>data(7000,['finish','noFalls']),async payload=>{calls++;if(failed)throw Error('offline');return payload;});
 await service.sync();assert.equal(service.status,'offline');assert.equal(calls,1);assert.equal(record.best('practice'),null);
 record.complete('practice',15,1);await tick();assert.equal(service.status,'offline');assert.equal(record.best('practice'),15000);
 failed=false;await service.retryConnection();assert.equal(service.status,'saved');assert.equal(record.best('practice'),15000);
 await service.importGuest();assert.equal(record.best('practice'),7000);assert.equal(service.status,'saved');service.destroy();
});
test('missing migration is recoverable and late responses cannot write a changed or destroyed account',async()=>{
 let calls=0;const record=new SingleRecords();const service=new SingleRecordSync(record,empty,async p=>{if(++calls===1)throw {code:'PGRST202'};return p;});
 await service.sync();assert.equal(service.status,'setup');record.complete('practice',13,0);await tick();assert.equal(calls,1);
 await service.sync();assert.equal(service.status,'saved');service.destroy();
 for(const dispose of [false,true]){
  let release,active=true;const r=new SingleRecords();const s=new SingleRecordSync(r,empty,()=>new Promise(resolve=>release=resolve),()=>active);
  await tick();if(dispose)s.destroy();else active=false;release(data(6000));await tick();assert.equal(r.best('practice'),null);s.destroy();
 }
});


test('real SQL transport restores a second device and explicit guest import merges without rewards',async()=>{
 const local=new SingleRecords();local.complete('cherry',22,0);
 const first=new SingleRecordSync(local,()=>data(9000),payload=>sync(a,payload));
 await first.sync();assert.equal(first.status,'saved');first.destroy();
 const secondRecords=new SingleRecords(),second=new SingleRecordSync(secondRecords,()=>data(5000),payload=>sync(a,payload));
 await second.sync();assert.equal(secondRecords.best('cherry'),22000);assert.equal(secondRecords.best('practice'),10000);
 await second.importGuest();assert.equal(secondRecords.best('practice'),5000);second.destroy();
 assert.deepEqual((await sync(a)).goals.cherry,['finish','noFalls','time']);
});
test('RPC uses the current owner token and rejects a session change before any request',async()=>{
 let owner=a,token='fresh-token',calls=0;
 const client={auth:{async getSession(){return {data:{session:{user:{id:owner},access_token:token}},error:null};}},rpc(name,args){
  calls++;assert.equal(name,'sync_single_records');assert.deepEqual(args,{p_records:empty()});
  return {setHeader(key,value){assert.equal(key,'Authorization');assert.equal(value,'Bearer '+token);return this;},async abortSignal(signal){assert.equal(signal.aborted,false);return {data:empty(),error:null};}};
 }};
 const transport=singleRecordTransport(client,a),abort=new AbortController();
 await transport(empty(),abort.signal);token='refreshed-token';await transport(empty(),abort.signal);
 owner=b;await assert.rejects(transport(empty(),abort.signal),e=>e.code==='42501');assert.equal(calls,2);
});
