import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {importTs} from './load-typescript.mjs';
const {SingleRecords}=await importTs('../src/game/SingleRecords.ts',import.meta.url);
const {SingleRecordSync,parseSingleRecordData}=await importTs('../src/account/SingleRecordSync.ts',import.meta.url);
const payload=(times={},goals={})=>({version:2,times,goals});
const db=new PGlite(),a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users values ('${a}'),('${b}');`);
const migration=await readFile(new URL('../supabase/migrations/202611070040_survival_records.sql',import.meta.url),'utf8');
await db.exec(await readFile(new URL('../supabase/migrations/202611070037_single_record_sync.sql',import.meta.url),'utf8'));
await db.exec(migration);after(()=>db.close());
async function as(owner,sql,args=[],role='authenticated'){await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner??'']);return await db.query(sql,args);}finally{await db.exec('reset role');}}
const sync=async(owner,p=payload())=>(await as(owner,'select public.sync_single_records($1::jsonb) value',[JSON.stringify(p)])).rows[0].value;
test('survival keeps longest duration and explicit clear, while races keep shortest time',()=>{
 let saved;const r=new SingleRecords({getItem:()=>null,setItem(k,v){saved=v;}});let events=0;r.subscribe(()=>events++);
 assert.equal(r.survive('survival',24.6,false).newBest,true);r.survive('survival',12,false);assert.equal(r.best('survival'),24600);
 assert.equal(r.survive('survival',30,false).newBest,true);assert.deepEqual(r.goals('survival'),[]);
 assert.deepEqual(r.survive('survival',30,true),{newBest:false,goals:['finish'],newGoals:['finish']});
 r.survive('survival',14,false);assert.equal(events,3);assert.deepEqual(new SingleRecords({getItem:()=>saved,setItem(){}}).goals('survival'),['finish']);
 r.survive('terraces',10,false);r.complete('practice',10,0);r.complete('practice',9,1);assert.equal(r.best('practice'),9000);assert.equal(r.best('terraces'),10000);
 const snapshot=r.snapshot();snapshot.goals.survival.length=0;assert.deepEqual(r.goals('survival'),['finish']);
 for(const [map,time,clear] of [['survival',31,false],['survival',29,true],['survival',NaN,false],['survival',0,false],['garden',20,true]])assert.equal(r.survive(map,time,clear).newBest,false);
 assert.equal(r.complete('survival',10,0).newBest,false);
});
test('device merge retains maximum survival and independent clear without inferring a boundary clear',()=>{
 const r=new SingleRecords();r.survive('survival',30,false);r.complete('garden',24,1);
 r.merge(payload({survival:21000,garden:28000},{survival:[],garden:['finish','noFalls']}));assert.equal(r.best('survival'),30000);assert.deepEqual(r.goals('survival'),[]);assert.equal(r.best('garden'),24000);
 r.merge(payload({survival:30000},{survival:['finish']}));assert.deepEqual(r.goals('survival'),['finish']);
 r.merge(payload({survival:12000},{survival:[]}));assert.deepEqual(r.goals('survival'),['finish']);
 for(const p of [payload({survival:30001},{survival:[]}),payload({terraces:29000},{terraces:['finish']}),payload({survival:10000},{survival:['noFalls']})])assert.throws(()=>parseSingleRecordData(p));
});
test('SQL merges both rules, isolates owners and reruns without losing progress',async()=>{
 await sync(a,payload({survival:24600,practice:14000},{survival:[],practice:['noFalls']}));
 let p=await sync(a,payload({survival:12000,practice:10000,terraces:30000},{survival:[],practice:[],terraces:[]}));
 assert.equal(p.times.survival,24600);assert.equal(p.times.practice,10000);assert.deepEqual(p.goals.terraces,[]);
 p=await sync(a,payload({survival:30000,terraces:30000},{survival:['finish'],terraces:['finish']}));
 await sync(a,payload({survival:20000},{survival:[]}));await db.exec(migration);p=await sync(a);assert.equal(p.times.survival,30000);assert.deepEqual(p.goals.survival,['finish']);
 assert.deepEqual(await sync(b),payload());assert.equal((await as(b,'select * from public.player_single_records')).rows.length,0);
 await assert.rejects(as(a,'update public.player_single_records set best_ms=1'),/permission denied/);
 await assert.rejects(as(null,'select public.sync_single_records()'),/authentication_required/);
 await assert.rejects(as(a,'select public.sync_single_records()',[],'anon'),/permission denied/);
});
test('SQL rejects invalid survival records atomically including incompatible goals',async()=>{
 for(const p of [payload({survival:30001},{survival:[]}),payload({terraces:29999},{terraces:['finish']}),payload({survival:10000},{survival:['time']}),payload({garden:12000,survival:0},{garden:[],survival:[]})])await assert.rejects(sync(b,p),/invalid_single_records/);
 assert.deepEqual(await sync(b),payload());
 const p=await sync(b,payload({survival:30000},{survival:[]}));assert.deepEqual(p.goals.survival,[]);
});
test('real account transport restores survival progress on a second device',async()=>{
 const first=new SingleRecords();first.survive('terraces',23.4,false);
 const s=new SingleRecordSync(first,()=>payload(),p=>sync(b,p));await s.sync();assert.equal(s.status,'saved');s.destroy();
 const second=new SingleRecords(),t=new SingleRecordSync(second,()=>payload(),p=>sync(b,p));await t.sync();assert.equal(second.best('terraces'),23400);assert.deepEqual(second.goals('survival'),[]);
 second.survive('terraces',30,true);await t.sync();assert.deepEqual((await sync(b)).goals.terraces,['finish']);t.destroy();
});
test('old record schema preserves local progress and permits explicit retry after SQL upgrade',async()=>{
 let upgraded=false,calls=0;const r=new SingleRecords();r.survive('survival',18,false);
 const s=new SingleRecordSync(r,()=>payload(),async p=>{calls++;if(!upgraded)throw {code:'22023'};return p;});
 await s.sync();assert.equal(s.status,'setup');r.survive('survival',24,false);await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(r.best('survival'),24000);
 upgraded=true;await s.sync();assert.equal(s.status,'saved');s.destroy();
});
