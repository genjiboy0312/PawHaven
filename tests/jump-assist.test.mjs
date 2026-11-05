import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importTs} from './load-typescript.mjs';
const {DummyRun}=await importTs('../src/game/DummyRun.ts',import.meta.url);
const ground=[{x:0,width:3000,top:0,bottom:-300}],ledge=[{x:0,width:200,top:0,bottom:-300}];

test('landing consumes a recent jump once across frame rates, but expired inputs do not bounce',()=>{
 for(const fps of [30,60,120]){
  const run=new DummyRun(ground);run.height=12;run.velocity=-180;run.jump();
  assert.equal(run.jumpSequence,0);assert.equal(run.canJump,false);assert.equal(run.canQueueJump,true);
  for(let i=0;i<Math.ceil(.15*fps);i++)run.update(1/fps,0);
  assert.equal(run.jumpSequence,1);assert.ok(run.height>0);run.jump();assert.equal(run.jumpSequence,1);
  run.update(1.2,0);assert.equal(run.jumpSequence,1);assert.equal(run.grounded,true);
  const expired=new DummyRun(ground);expired.height=100;expired.velocity=-100;expired.jump();expired.update(.7,0);
  assert.equal(expired.jumpSequence,0);assert.equal(expired.grounded,true);
 }
});

test('walking off an edge allows one late jump and expires after the grace period',()=>{
 for(const fps of [30,60,120]){
  const run=new DummyRun(ledge);run.x=223;run.update(1/fps,1);assert.equal(run.grounded,false);assert.equal(run.canJump,true);
  run.jump();assert.equal(run.velocity,440);assert.equal(run.jumpSequence,1);run.jump();assert.equal(run.jumpSequence,1);
  const late=new DummyRun(ledge);late.x=220;late.update(.15,1);assert.equal(late.canJump,false);const before=late.velocity;late.jump();assert.equal(late.velocity,before);
 }
});

test('dash falls, explicit input clears, respawns and finishes cannot trigger a queued jump',()=>{
 const dash=new DummyRun(ledge);dash.x=220;dash.startDash();dash.jump();dash.update(.025,1);
 assert.equal(dash.grounded,false);assert.equal(dash.canJump,false);assert.equal(dash.jumpSequence,0);
 const cleared=new DummyRun(ground);cleared.height=8;cleared.velocity=-200;cleared.jump();cleared.clearJumpInput();cleared.update(.1,0);assert.equal(cleared.jumpSequence,0);assert.equal(cleared.grounded,true);
 const respawn=new DummyRun(ground);respawn.height=-191;respawn.jump();respawn.update(.01,0);assert.equal(respawn.respawns,1);respawn.update(.1,0);assert.equal(respawn.jumpSequence,0);
 const finish=new DummyRun(ground,1,{finish:120});finish.height=8;finish.velocity=-200;finish.jump();finish.update(.1,0);assert.equal(finish.won,true);assert.equal(finish.jumpSequence,0);finish.jump();assert.equal(finish.jumpSequence,0);
});


test('walking off a moving platform keeps the same short jump grace',()=>{
 const run=new DummyRun([{x:120,width:120,top:0,bottom:-20,oneWay:true,motion:{distance:40,period:2}}]);
 run.update(.1,0);const solid=run.platforms[0].solid;run.x=solid.x+solid.width+run.halfWidth-1;
 run.update(.025,1);assert.equal(run.grounded,false);assert.equal(run.canJump,true);run.jump();assert.equal(run.jumpSequence,1);assert.equal(run.velocity,440);
});
