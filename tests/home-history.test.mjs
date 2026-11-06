import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importTs} from './load-typescript.mjs';
const {HomeState,HOME_STORAGE_KEY}=await importTs('../src/home/HomeState.ts',import.meta.url);
const {HomeHistory}=await importTs('../src/home/HomeHistory.ts',import.meta.url);
function fixture(stock){
 const values=new Map();let writes=0;
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){writes++;values.set(k,v);}};
 const state=new HomeState(storage,stock),history=new HomeHistory(state);
 return{state,history,storage,values,get writes(){return writes;}};
}
test('undo and redo each retain only three edits and automatically persist restored layouts',()=>{
 const f=fixture(),h=f.history,s=f.state;
 for(const option of [1,2,3,4])h.apply(()=>s.select('Background',option));
 for(const option of [3,2,1]){assert.equal(h.undo(),true);assert.equal(s.current.Background,option);}
 assert.equal(h.canUndo,false);assert.equal(h.undo(),false);
 for(const option of [2,3,4]){assert.equal(h.redo(),true);assert.equal(s.current.Background,option);assert.equal(new HomeState(f.storage).current.Background,option);}
 assert.equal(h.canRedo,false);assert.equal(h.redo(),false);assert.equal(f.writes,10);
});
test('place, move, remove and floor changes restore IDs, positions, and remaining quantities',()=>{
 const {state:s,history:h}=fixture();let id;
 h.apply(()=>id=s.place('Furniture',4));h.apply(()=>s.move(id,.8,.85));h.apply(()=>s.remove(id));
 assert.equal(s.remaining('Furniture',4),3);
 h.undo();assert.equal(s.items[0].id,id);assert.equal(s.items[0].x,.8);assert.equal(s.remaining('Furniture',4),2);
 h.undo();assert.equal(s.items[0].x,.15);h.undo();assert.equal(s.items.length,0);
 h.redo();h.redo();h.redo();assert.equal(s.items.length,0);
 h.apply(()=>s.select('Floor',2));h.undo();assert.equal(s.current.Floor,0);h.redo();assert.equal(s.current.Floor,2);
});
test('no-op or rejected edits preserve redo while new edits discard it and never reuse placement IDs',()=>{
 const {state:s,history:h}=fixture();let first,second;
 h.apply(()=>first=s.place('Furniture',4));h.undo();
 assert.equal(h.apply(()=>s.select('Background',0)),false);assert.equal(h.apply(()=>s.move(999,.2,.7)),false);assert.equal(h.canRedo,true);
 h.apply(()=>second=s.place('Furniture',4));assert.ok(second>first);assert.equal(h.canRedo,false);
 const p=s.items[0];assert.equal(h.apply(()=>s.move(p.id,p.x,p.y)),false);assert.equal(h.canUndo,true);
});
test('undo cannot restore removed items or paid surfaces after ownership is lost',()=>{
 let stock=1;
 const f=fixture(()=>stock),s=f.state,h=f.history;let id;
 h.apply(()=>id=s.place('Furniture',5));h.apply(()=>s.remove(id));stock=0;
 const writes=f.writes;assert.equal(h.undo(),false);assert.equal(s.items.length,0);assert.equal(h.canUndo,false);assert.equal(h.canRedo,false);assert.equal(f.writes,writes);
 stock=1;h.apply(()=>s.select('Background',2));h.apply(()=>s.select('Background',0));stock=0;
 assert.equal(h.undo(),false);assert.equal(s.current.Background,0);
});
test('snapshots are copied, unknown ownership does not resurrect inventory, and hidden legacy data survives edits',()=>{
 let stock;
 const f=fixture(()=>stock);
 f.values.set(HOME_STORAGE_KEY,JSON.stringify({version:2,Background:0,Floor:0,items:[{id:7,tab:'Furniture',option:5,x:.4,y:.7}]}));
 const s=new HomeState(f.storage,()=>stock),h=new HomeHistory(s);
 const copy=s.snapshot();copy.items[0].x=.9;assert.equal(s.snapshot().items[0].x,.4);
 stock=0;assert.equal(s.items.length,0);
 h.apply(()=>s.select('Background',0));assert.equal(h.canUndo,false);
 stock=1;h.apply(()=>s.select('Floor',2));h.undo();assert.equal(s.snapshot().items.length,1);
 h.apply(()=>s.remove(7));stock=undefined;assert.equal(h.undo(),false);assert.equal(s.snapshot().items.length,0);
});
test('external changes and new scene sessions clear history without reverting the saved layout',()=>{
 const {state:s,history:h,storage}=fixture();h.apply(()=>s.select('Background',2));s.select('Floor',2);h.reconcile();
 assert.equal(h.canUndo,false);assert.equal(h.canRedo,false);assert.equal(s.current.Background,2);
 h.apply(()=>s.select('Background',3));let events=0;const off=h.subscribe(()=>events++);h.undo();h.redo();assert.equal(events,2);off();h.destroy();assert.equal(events,2);
 const next=new HomeHistory(s);assert.equal(next.canUndo,false);assert.equal(next.canRedo,false);assert.equal(new HomeState(storage).current.Background,3);
});
test('blocked storage still supports in-session undo and redo',()=>{
 const s=new HomeState({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}),h=new HomeHistory(s);
 h.apply(()=>s.select('Background',2));assert.equal(h.undo(),true);assert.equal(s.current.Background,0);assert.equal(h.redo(),true);assert.equal(s.current.Background,2);
});
