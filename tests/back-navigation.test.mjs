import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importTs} from './load-typescript.mjs';
const {backAction,installBackNavigation}=await importTs('../src/ui/BackNavigation.ts',import.meta.url);
function fixture(){
 const previous={window:globalThis.window,observer:globalThis.MutationObserver};
 const nodes=[],entries=[{external:true},{kept:'existing-state'}];let index=1,observer;
 const win=new EventTarget();win.location={href:'https://game.test/PawHaven/'};
 win.history={get state(){return entries[index];},pushState(state){entries.splice(index+1);entries.push(state);index++;},back(){if(index>0){index--;win.dispatchEvent(new Event('popstate'));}},forward(){if(index<entries.length-1){index++;win.dispatchEvent(new Event('popstate'));}}};
 globalThis.window=win;globalThis.MutationObserver=class{constructor(fn){this.fn=fn;observer=this;}observe(){}disconnect(){this.disconnected=true;}};
 const host={ownerDocument:{body:{querySelectorAll:()=>nodes}}};let release=installBackNavigation(host);
 const element=()=>({hidden:false,inert:false,closest(selector){return selector==='[hidden]'?this.hidden?this:null:this.inert?this:null;}});
 return{nodes,entries,win,element,get index(){return index;},notify(){observer.fn([{type:'childList',addedNodes:[{nodeType:1}],removedNodes:[]}]);},reinstall(){release();release=installBackNavigation(host);},restore(){release();if(previous.window===undefined)delete globalThis.window;else globalThis.window=previous.window;if(previous.observer===undefined)delete globalThis.MutationObserver;else globalThis.MutationObserver=previous.observer;}};
}

test('one history guard closes nested UI in order then allows the lobby to return to its previous page',()=>{
 const f=fixture();let panelClosed=0,modalClosed=0;
 try{
  assert.equal(f.entries.length,2);const panel=f.element();f.nodes.push(panel);backAction(panel,()=>{panelClosed++;f.nodes.splice(f.nodes.indexOf(panel),1);});
  assert.equal(f.entries.length,3);assert.equal(f.win.history.state.kept,'existing-state');
  const modal=f.element();f.nodes.push(modal);backAction(modal,()=>{modalClosed++;f.nodes.pop();});assert.equal(f.entries.length,3);
  f.win.history.back();assert.equal(modalClosed,1);assert.equal(panelClosed,0);assert.equal(f.entries.length,3);
  f.win.history.back();assert.equal(panelClosed,1);assert.equal(f.index,1);
  f.win.history.back();assert.equal(f.index,0);assert.deepEqual(f.win.history.state,{external:true});
 }finally{f.restore();}
});

test('UI close and reload do not accumulate guards or trap native Back',()=>{
 const f=fixture();try{
  for(let i=0;i<20;i++){const panel=f.element();f.nodes.push(panel);backAction(panel,()=>{});f.nodes.pop();f.notify();}
  assert.equal(f.entries.length,3);f.reinstall();assert.equal(f.entries.length,3);f.win.history.back();assert.equal(f.index,0);
  f.win.history.forward();f.win.history.forward();assert.equal(f.index,1);f.win.history.back();assert.equal(f.index,0);
 }finally{f.restore();}
});

test('processing blocks Back, hidden panels are skipped, and disposed navigation no longer intercepts',()=>{
 const f=fixture();let calls=0;try{
  const panel=f.element(),busy=f.element();f.nodes.push(panel,busy);backAction(panel,()=>calls++);backAction(busy,()=>calls+=10);
  busy.inert=true;f.win.history.back();assert.equal(calls,0);assert.equal(f.entries.length,3);
  busy.hidden=true;f.win.history.back();assert.equal(calls,1);
  f.restore();f.win.history.back();assert.equal(calls,1);assert.equal(f.index,1);
 }finally{if(globalThis.window===f.win)f.restore();}
});
