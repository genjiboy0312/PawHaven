import{test}from'node:test';import assert from'node:assert/strict';import{importTs}from'./load-typescript.mjs';
import{setMaxListeners}from'node:events';setMaxListeners(30); // DOM-style listener groups legitimately exceed Node's default 10.
const{KeyboardChatDock}=await importTs('../src/ui/KeyboardChatDock.ts',import.meta.url);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function environment(popover=false){
 const keys=['window','document','navigator','HTMLElement','requestAnimationFrame','cancelAnimationFrame'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let doc;
 class Element extends EventTarget{
  attrs=new Map();style={};parentElement=null;children=[];selectionStart=0;selectionEnd=0;clientWidth=1280;clientHeight=720;
  classList={values:new Set(),add(v){this.values.add(v);},remove(v){this.values.delete(v);},contains(v){return this.values.has(v);}};
  get isConnected(){return this===doc.body||!!this.parentElement?.isConnected;}
  getAttribute(k){return this.attrs.get(k)??null;}setAttribute(k,v){this.attrs.set(k,String(v));}removeAttribute(k){this.attrs.delete(k);if(k==='style')this.style={};}
  contains(el){return this===el||this.children.some(c=>c.contains(el));}
  detach(){if(this.parentElement){const list=this.parentElement.children;list.splice(list.indexOf(this),1);}this.parentElement=null;}
  append(el){if(el.contains(doc.activeElement))doc.activeElement.blur();el.detach();this.children.push(el);el.parentElement=this;}
  before(el){const list=this.parentElement.children;list.splice(list.indexOf(this),0,el);el.parentElement=this.parentElement;}
  replaceWith(el){const parent=this.parentElement;el.detach();parent.children.splice(parent.children.indexOf(this),1,el);el.parentElement=parent;this.parentElement=null;}
  remove(){this.detach();}closest(){for(let el=this;el;el=el.parentElement)if(el.getAttribute('id')==='app')return el;return null;}
  focus(){if(doc.activeElement===this)return;doc.activeElement?.blur?.();doc.activeElement=this;this.dispatchEvent(new Event('focus'));}
  blur(){if(doc.activeElement!==this)return;doc.activeElement=doc.body;this.dispatchEvent(new Event('blur'));}
  setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
  getBoundingClientRect(){return {left:0,top:0,width:this===host?1280:700,height:this===host?720:170};}
 }
 doc=Object.assign(new EventTarget(),{body:new Element(),documentElement:new Element(),fullscreenElement:null,createComment:()=>new Element()});
 const host=new Element();host.setAttribute('id','app');doc.body.append(host);const chat=new Element(),input=new Element();host.append(chat);chat.append(input);doc.activeElement=doc.body;
 if(popover){chat.open=false;chat.shows=0;chat.matches=selector=>selector===':popover-open'&&chat.open;chat.showPopover=()=>{chat.open=true;chat.shows++;};chat.hidePopover=()=>{chat.open=false;};}
 const view=Object.assign(new EventTarget(),{width:1280,height:720,offsetLeft:0,offsetTop:0}),keyboard=Object.assign(new EventTarget(),{overlaysContent:false,boundingRect:{left:0,top:0,width:0,height:0}}),orientation=new EventTarget();
 const win=Object.assign(new EventTarget(),{innerHeight:720,innerWidth:1280,visualViewport:view,matchMedia:()=>({matches:true}),screen:{orientation}});
 const values={window:win,document:doc,navigator:{virtualKeyboard:keyboard},HTMLElement:Element,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout};for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:values[k]});
 const dock=new KeyboardChatDock(chat,input);
 const pointer=()=>{const event=new Event('pointerdown',{cancelable:true});Object.defineProperty(event,'button',{value:0});input.dispatchEvent(event);return event;};
 const geometry=async(open)=>{keyboard.boundingRect=open?{left:0,top:390,width:1280,height:330}:{left:0,top:0,width:0,height:0};keyboard.dispatchEvent(new Event('geometrychange'));await wait(8);};
 return{dock,chat,input,host,doc,view,keyboard,orientation,pointer,geometry,restore(){dock.destroy();for(const k of keys){const desc=saved.get(k);if(desc)Object.defineProperty(globalThis,k,desc);else delete globalThis[k];}}};
}
test('first touch mounts before focus and later touches retain native caret behaviour',()=>{
 const e=environment();try{assert.equal(e.pointer().defaultPrevented,true);assert.equal(e.doc.activeElement,e.input);assert.equal(e.chat.parentElement,e.doc.body);assert.equal(e.pointer().defaultPrevented,false);}finally{e.restore();}
});
test('IME geometry bounce, resize and orientation never blur or reparent a focused composition',async()=>{
 const e=environment();try{
  e.pointer();let blurs=0;e.input.addEventListener('blur',()=>blurs++);e.input.value='명랑';e.input.dispatchEvent(new Event('compositionstart'));
  await e.geometry(true);await e.geometry(false);e.orientation.dispatchEvent(new Event('change'));e.view.dispatchEvent(new Event('resize'));await wait(450);
  assert.equal(e.doc.activeElement,e.input);assert.equal(blurs,0);assert.equal(e.chat.parentElement,e.doc.body);assert.equal(e.input.value,'명랑');
  await e.geometry(true);e.input.dispatchEvent(new Event('compositionend'));await e.geometry(false);await wait(450);
  assert.equal(e.doc.activeElement,e.input);assert.equal(blurs,0);assert.equal(e.chat.parentElement,e.doc.body);
 }finally{e.restore();}
});
test('sending waits for keyboard dismissal and focus loss before restoring the original node',async()=>{
 const e=environment();try{e.pointer();await e.geometry(true);e.input.blur();await wait(450);assert.equal(e.chat.parentElement,e.doc.body);await e.geometry(false);await wait(450);assert.equal(e.chat.parentElement,e.host);assert.equal(e.keyboard.overlaysContent,false);assert.equal(e.host.getAttribute('style'),null);}finally{e.restore();}
});
test('short focus loss followed by refocus cancels automatic restoration',async()=>{
 const e=environment();try{e.pointer();e.input.blur();await wait(80);e.input.focus();await wait(450);assert.equal(e.chat.parentElement,e.doc.body);assert.equal(e.doc.activeElement,e.input);}finally{e.restore();}
});

test('manual top layer survives geometry changes without reopening or losing focus',async()=>{
 const e=environment(true);try{
  e.pointer();assert.equal(e.chat.getAttribute('popover'),'manual');assert.equal(e.chat.open,true);
  await e.geometry(true);await e.geometry(false);assert.equal(e.chat.shows,1);assert.equal(e.doc.activeElement,e.input);
  // A fullscreen transition can remove an element from the top layer: restore it once.
  e.chat.open=false;e.doc.dispatchEvent(new Event('fullscreenchange'));await wait(8);
  assert.equal(e.chat.open,true);assert.equal(e.chat.shows,2);assert.equal(e.doc.activeElement,e.input);
  e.dock.reset();assert.equal(e.chat.open,false);assert.equal(e.chat.getAttribute('popover'),null);assert.equal(e.chat.parentElement,e.host);
 }finally{e.restore();}
});

test('destroy restores an existing popover attribute',()=>{
 const e=environment(true);try{e.chat.setAttribute('popover','auto');e.pointer();e.dock.destroy();assert.equal(e.chat.open,false);assert.equal(e.chat.getAttribute('popover'),'auto');}finally{e.restore();}
});
