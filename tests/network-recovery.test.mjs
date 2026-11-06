import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importTs} from './load-typescript.mjs';
const {NetworkRecovery}=await importTs('../src/account/NetworkRecovery.ts',import.meta.url);
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const target=new EventTarget(),events=[];
 const account={user:{id:'first'},async recoverConnection(allow){events.push(['account',allow]);return !allow;}};
 const commerce={hasPendingRequests:false,async retryConnection(){events.push(['wallet']);}};
 let state={account,commerce,allowAccountLoad:true};
 const recovery=new NetworkRecovery(()=>state,target);
 return{target,events,account,commerce,recovery,set(value){state=value;},get state(){return state;},online(){target.dispatchEvent(new Event('online'));},offline(){target.dispatchEvent(new Event('offline'));}};
}

test('online recovery runs once per network cycle, preserves wallet-first ordering and unsubscribes',async()=>{
 const f=fixture();try{
  f.online();f.online();await tick();await tick();assert.deepEqual(f.events,[['wallet'],['account',true]]);
  f.online();await tick();assert.equal(f.events.length,2);
  f.offline();f.online();await tick();assert.equal(f.events.length,4);
  f.recovery.destroy();f.offline();f.online();await tick();assert.equal(f.events.length,4);
 }finally{f.recovery.destroy();}
});

test('initial account load waits for a safe lobby and never discards unknown purchases',async()=>{
 const f=fixture();try{
  f.set({...f.state,allowAccountLoad:false});f.online();await tick();assert.deepEqual(f.events,[['wallet'],['account',false]]);
  f.recovery.resume();await tick();assert.equal(f.events.length,2);
  f.set({...f.state,allowAccountLoad:true});f.commerce.hasPendingRequests=true;f.recovery.resume();await tick();assert.deepEqual(f.events.at(-1),['account',false]);assert.equal(f.events.filter(e=>e[0]==='wallet').length,1);
  f.commerce.hasPendingRequests=false;f.recovery.resume();await tick();assert.deepEqual(f.events.at(-1),['account',true]);
  const count=f.events.length;f.recovery.resume();await tick();assert.equal(f.events.length,count);
 }finally{f.recovery.destroy();}
});

test('account or commerce replacement during recovery cannot save a different session',async()=>{
 for(const kind of ['account','commerce','destroy']){
  const f=fixture();let release;
  f.commerce.retryConnection=()=>new Promise(r=>release=r);
  try{
   f.online();
   if(kind==='account')f.account.user={id:'second'};
   if(kind==='commerce')f.set({...f.state,commerce:{...f.commerce}});
   if(kind==='destroy')f.recovery.destroy();
   release();await tick();assert.deepEqual(f.events,[]);
  }finally{f.recovery.destroy();}
 }
});

test('a second real reconnect during an in-flight request is serialized instead of overlapping',async()=>{
 const f=fixture();let release,calls=0,active=0,max=0;
 f.commerce.retryConnection=async()=>{calls++;active++;max=Math.max(max,active);if(calls===1)await new Promise(r=>release=r);active--;};
 try{
  f.online();f.offline();f.online();f.online();assert.equal(calls,1);release();await tick();await tick();assert.equal(calls,2);assert.equal(max,1);
 }finally{f.recovery.destroy();}
});

test('reconnect recovers personal records between wallet and account without repeat uploads',async()=>{
 const f=fixture();try{
  f.set({...f.state,records:{async retryConnection(){f.events.push(['records']);}}});
  f.online();f.online();await tick();await tick();assert.deepEqual(f.events,[['wallet'],['records'],['account',true]]);
 }finally{f.recovery.destroy();}
});
