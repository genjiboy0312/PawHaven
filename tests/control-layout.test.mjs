import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importTs} from './load-typescript.mjs';
const {CONTROL_IDS,CONTROL_WIDTH,copyControlLayout,normalizeControlLayout,moveControl,controlPointer,applyControlLayout}=await importTs('../src/settings/ControlLayout.ts',import.meta.url);
const {GameSettings,GAME_SETTINGS_KEY}=await importTs('../src/settings/GameSettings.ts',import.meta.url);

test('control positions persist per device, reset safely, and cannot be mutated through settings snapshots',()=>{
 const entries=new Map(),disk={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)},settings=new GameSettings(disk);
 const layout=moveControl(copyControlLayout(),'joystick',{x:.22,y:.79});assert.equal(layout.joystick.x,.22);
 settings.update({controlLayout:layout,leftHanded:true,controlSize:1.2});
 layout.joystick.x=.5;const view=settings.current;view.controlLayout.jump.x=.1;
 const restored=new GameSettings(disk);assert.equal(restored.current.controlLayout.joystick.x,.22);assert.equal(restored.current.controlLayout.jump.x,.85);assert.equal(settings.current.controlLayout.jump.x,.85);
 restored.update({controlLayout:undefined});assert.equal(restored.current.controlLayout,undefined);assert.equal(new GameSettings(disk).current.controlLayout,undefined);assert.equal(restored.current.leftHanded,true);
 for(const invalid of [null,{}, {...copyControlLayout(),jump:{x:NaN,y:1}}, {...copyControlLayout(),dash:copyControlLayout().attack}]){
  entries.set(GAME_SETTINGS_KEY,JSON.stringify({controlLayout:invalid}));assert.equal(new GameSettings(disk).current.controlLayout,undefined);
 }
});

test('all touch controls fit the landscape surface at maximum size and overlapping moves are rejected',()=>{
 const initial=copyControlLayout();assert.deepEqual(normalizeControlLayout(initial),initial);
 for(const id of CONTROL_IDS){
  for(const point of [{x:-9,y:8},{x:99,y:-8}]){
   const layout=moveControl(initial,id,point);const p=layout[id],radius=CONTROL_WIDTH[id]/200*1.2;
   assert.ok(p.x-radius>=.01999&&p.x+radius<=.98001);assert.ok(p.y-radius*16/9>=.45999&&p.y+radius*16/9<=.98001);
  }
  const other=CONTROL_IDS.find(other=>other!==id);assert.equal(moveControl(initial,id,initial[other]),initial);
 }
 assert.equal(moveControl(initial,'jump',{x:Infinity,y:.8}),initial);
});

test('drag coordinates account for portrait rotation and left-handed mirroring without modifying the saved layout',()=>{
 const landscape=controlPointer(210,110,{left:10,top:10,width:1000,height:500},false,false);
 assert.deepEqual(landscape,{x:.2,y:.2});
 const portrait=controlPointer(410,210,{left:10,top:10,width:500,height:1000},true,false);
 assert.ok(Math.abs(portrait.x-.2)<1e-10&&Math.abs(portrait.y-.2)<1e-10);
 assert.equal(controlPointer(210,110,{left:10,top:10,width:1000,height:500},false,true).x,.8);
 const values=new Map(),host={style:{setProperty:(k,v)=>values.set(k,v)}},layout=copyControlLayout();
 applyControlLayout(host,{controlSize:1.2,leftHanded:true,controlLayout:layout});
 assert.ok(Math.abs(parseFloat(values.get('--jump-x'))-15)<1e-8);assert.equal(layout.jump.x,.85);assert.equal(values.get('--control-scale'),'1.2');
});
