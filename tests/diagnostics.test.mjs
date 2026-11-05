import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importTs} from './load-typescript.mjs';
const {ConnectionDiagnostics}=await importTs('../src/account/ConnectionDiagnostics.ts',import.meta.url);
const tick=()=>new Promise(r=>setImmediate(r));

test('connection diagnostics preserve the SDK response and retain only whitelisted metadata',async()=>{
 const log=new ConnectionDiagnostics(),secret='private-person@example.com',token='private-access-token',text='private chat text';
 const request={method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({p_action:'buy_home',p_payload:{name:secret,text}})};
 const body=JSON.stringify({code:'42501',message:secret,details:token,hint:text});
 const response=await log.wrap(async()=>new Response(body,{status:403}))('https://example.com/rest/v1/rpc/economy_command?email='+secret,request);
 assert.equal(response.status,403);assert.equal(await response.text(),body);
 for(let i=0;i<20&&JSON.parse(log.report()).failures[0].code!=='42501';i++)await tick();
 const report=JSON.parse(log.report()),entry=report.failures[0];
 assert.equal(entry.operation,'economy_command.buy_home');assert.equal(entry.code,'42501');assert.equal(entry.status,403);
 assert.ok(Number.isFinite(Date.parse(entry.at)));assert.ok(entry.durationMs>=0);
 assert.deepEqual(Object.keys(entry).sort(),['at','code','durationMs','operation','status']);
 for(const value of [secret,token,text,'https://','p_payload','Authorization'])assert.equal(log.report().includes(value),false);
 await log.wrap(async()=>new Response(JSON.stringify({code:secret}),{status:500}))('https://example.com/'+secret,{body:JSON.stringify({p_action:secret})});
 await tick();assert.equal(JSON.parse(log.report()).failures[1].operation,'other');assert.equal(log.report().includes(secret),false);
});

test('diagnostics bound failures, distinguish timeouts and ignore ordinary cancellation and success',async()=>{
 const log=new ConnectionDiagnostics();
 const network=Error('private transport detail'),timeout=new DOMException('private timeout detail','TimeoutError'),cancel=new DOMException('private cancellation detail','AbortError');
 await log.wrap(async()=>new Response('{}'))('https://example.com/rest/v1/player_profiles');
 await assert.rejects(log.wrap(async()=>{throw cancel;})('https://example.com/auth/v1/token'),e=>e===cancel);
 assert.equal(JSON.parse(log.report()).failures.length,0);
 await assert.rejects(log.wrap(async()=>{throw timeout;})('https://example.com/auth/v1/token'),e=>e===timeout);
 assert.equal(JSON.parse(log.report()).failures[0].code,'TIMEOUT');
 const run=log.wrap(async()=>{throw network;});
 for(let i=0;i<25;i++)await assert.rejects(run('https://example.com/rest/v1/player_saves'),e=>e===network);
 const failures=JSON.parse(log.report()).failures;assert.equal(failures.length,20);assert.ok(failures.every(f=>f.code==='NETWORK'&&f.operation==='player_saves'));
 assert.equal(log.report().includes('private'),false);assert.equal(JSON.parse(new ConnectionDiagnostics().report()).failures.length,0);
});

test('large error bodies stay HTTP-only and are not consumed by diagnostics',async()=>{
 const log=new ConnectionDiagnostics(),body=JSON.stringify({code:'PGRST202',message:'x'.repeat(4000)});
 const response=await log.wrap(async()=>new Response(body,{status:404}))('https://example.com/rest/v1/rpc/save_player_state');
 assert.equal(await response.text(),body);await tick();assert.equal(JSON.parse(log.report()).failures[0].code,'HTTP_404');
});
