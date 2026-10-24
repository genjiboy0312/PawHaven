export interface ChatViewport {width:number;height:number;offsetLeft:number;offsetTop:number}
interface KeyboardRect {left:number;top:number;width:number;height:number}
interface KeyboardGeometry extends EventTarget {overlaysContent:boolean;readonly boundingRect:KeyboardRect}
/** Both overlay keyboards (fullscreen) and resized visual viewports use layout CSS coordinates. */
export function chatVisibleViewport(view:ChatViewport,keyboard?:KeyboardRect,layoutHeight=view.offsetTop+view.height):ChatViewport{
 if(!keyboard||keyboard.height<=0||keyboard.width<=0||keyboard.left>=view.offsetLeft+view.width||keyboard.left+keyboard.width<=view.offsetLeft||keyboard.top>=view.offsetTop+view.height||keyboard.top+keyboard.height<=view.offsetTop)return view;
 // Treat top=0 as potentially resized/keyboard-local coordinates during IME transitions.
 // Do not collapse the entire conversation to 1px; reconcile against the pre-IME layout.
 const top=keyboard.top-view.offsetTop;
 const available=top>=96?top:layoutHeight-keyboard.height-view.offsetTop;
 if(available<96)return view;
 return {...view,height:Math.min(view.height,available)};
}
/** Layout viewport coordinates for a panel above the software keyboard. */
export function chatDockBounds(view:ChatViewport){
 const margin=8,width=Math.max(1,Math.min(700,view.width-margin*2));
 return {left:view.offsetLeft+(view.width-width)/2,bottom:view.offsetTop+view.height-margin,width,maxHeight:Math.max(1,Math.min(190,view.height-margin*2))};
}

/** Temporarily dock the SAME chat node outside the rotated/clipped game surface. */
export class KeyboardChatDock {
 private readonly abort=new AbortController();private marker?:Comment;private savedStyle:string|null=null;
 private moving=false;private composing=false;private baseline=0;private blurTimer?:ReturnType<typeof setTimeout>;
 private frame=0;private closed=false;
 private readonly keyboard?:KeyboardGeometry;private overlayBefore?:boolean;
 private frozenHost?:HTMLElement;private hostStyle:string|null=null;
 private popoverBefore:string|null=null;private ownsPopover=false;
 private lastView?:ChatViewport;
 constructor(private readonly element:HTMLElement,private readonly input:HTMLInputElement){
  input.setAttribute('data-keyboard-chat','true');
  this.keyboard=(navigator as Navigator&{virtualKeyboard?:KeyboardGeometry}).virtualKeyboard;
  const options={signal:this.abort.signal};
  input.addEventListener('pointerdown',event=>{
   if(!this.touch()||event.button!==0||this.marker)return;
   // Move before native focus, then suppress the default focus action on the old coordinates.
   event.preventDefault();this.mount();input.focus({preventScroll:true});
  },options);
  input.addEventListener('focus',()=>{clearTimeout(this.blurTimer);if(this.touch()&&!this.moving)this.mount();},options);
  input.addEventListener('compositionstart',()=>{this.composing=true;clearTimeout(this.blurTimer);},options);
  input.addEventListener('compositionend',()=>{this.composing=false;this.schedule();},options);
  input.addEventListener('input',()=>clearTimeout(this.blurTimer),options);
  input.addEventListener('blur',()=>{
   if(!this.moving)this.scheduleReset();
  },options);
  const layout=()=>this.schedule();
  window.visualViewport?.addEventListener('resize',layout,options);window.visualViewport?.addEventListener('scroll',layout,options);
  window.addEventListener('resize',layout,options);window.screen?.orientation?.addEventListener('change',layout,options);
  this.keyboard?.addEventListener('geometrychange',layout,options);document.addEventListener('fullscreenchange',layout,options);
 }
 private touch(){return window.matchMedia?.('(any-pointer: coarse)').matches??false;}
 private view():ChatViewport{
  const v=window.visualViewport;
  const next=v&&v.width>=96&&v.height>=96?{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop}:{width:window.innerWidth,height:window.innerHeight,offsetLeft:0,offsetTop:0};
  if(next.width>=96&&next.height>=96)this.lastView=next;
  return this.lastView??next;
 }
 private shrunk(){return this.view().height<this.baseline-80;}
 private visibleView(){return chatVisibleViewport(this.view(),this.keyboard?.boundingRect,this.baseline);}
 private keyboardOpen(){return this.shrunk()||this.visibleView().height<this.view().height;}
 private scheduleReset(){
  clearTimeout(this.blurTimer);
  // Viewport/keyboard geometry can bounce during Android IME transitions. Only real focus loss
  // after composition and keyboard dismissal can end the editing session automatically.
  this.blurTimer=setTimeout(()=>{if(!this.composing&&document.activeElement!==this.input&&!this.keyboardOpen())this.reset();},400);
 }
 private freezeGame(){
  const host=this.element.closest<HTMLElement>('#app');if(!host)return;
  this.frozenHost=host;this.hostStyle=host.getAttribute('style');const rect=host.getBoundingClientRect();
  // Keep the existing CSS rotation about its centre, independent of keyboard/URL-bar resizing.
  const width=host.clientWidth,height=host.clientHeight;
  Object.assign(host.style,{position:'fixed',width:width+'px',height:height+'px',left:(rect.left+rect.width/2-width/2)+'px',top:(rect.top+rect.height/2-height/2)+'px',margin:'0'});
 }
 private mount(){
  if(this.closed||this.marker||!this.element.isConnected)return;
  this.baseline=Math.max(this.view().height,window.innerHeight);
  if(this.keyboard){try{this.overlayBefore=this.keyboard.overlaysContent;this.keyboard.overlaysContent=true;}catch{this.overlayBefore=undefined;}}
  this.freezeGame();
  this.savedStyle=this.element.getAttribute('style');this.marker=document.createComment('keyboard-chat-home');this.element.before(this.marker);
  this.moving=true;const focused=document.activeElement===this.input,start=this.input.selectionStart,end=this.input.selectionEnd;
  const fullscreen=document.fullscreenElement;
  const surface=fullscreen instanceof HTMLElement&&fullscreen!==document.documentElement?fullscreen:document.body;
  this.element.classList.add('keyboard-chat-docked');surface.append(this.element);this.layout();
  if(focused){this.input.focus({preventScroll:true});if(start!==null&&end!==null)this.input.setSelectionRange(start,end);}
  this.moving=false;
 }
 private elevate(){
  // Fullscreen lives in the browser top layer, beyond ordinary z-index stacking.
  // A manual popover lifts the SAME input without a modal, light-dismiss or DOM moves.
  if(typeof this.element.showPopover!=='function')return;
  if(!this.ownsPopover){this.popoverBefore=this.element.getAttribute('popover');this.element.setAttribute('popover','manual');this.ownsPopover=true;}
  if(!this.element.matches(':popover-open')){
   try{this.element.showPopover();}catch{/* Older fullscreen implementations retain the portal fallback. */}
  }
 }
 private schedule(){if(!this.marker||this.closed)return;cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.layout());}
 private layout(){
  if(!this.marker||this.closed)return;
  this.elevate();
  const view=this.visibleView();
  // Never blur/reparent a focused input because of a geometry change. When the keyboard
  // closes, this same node moves down; reparenting waits until the user leaves the input.
  if(!this.moving&&document.activeElement!==this.input&&!this.composing&&!this.keyboardOpen())this.scheduleReset();
  const bounds=chatDockBounds(view);
  this.element.style.left=bounds.left+'px';this.element.style.width=bounds.width+'px';this.element.style.maxHeight=bounds.maxHeight+'px';
  this.element.style.top=Math.max(view.offsetTop+8,bounds.bottom-this.element.getBoundingClientRect().height)+'px';
 }
 reset(){
  if(!this.marker)return;this.moving=true;clearTimeout(this.blurTimer);cancelAnimationFrame(this.frame);this.input.blur();
  const marker=this.marker;this.marker=undefined;this.element.classList.remove('keyboard-chat-docked');
  if(this.ownsPopover){
   if(this.element.matches(':popover-open'))this.element.hidePopover();
   if(this.popoverBefore===null)this.element.removeAttribute('popover');else this.element.setAttribute('popover',this.popoverBefore);
   this.ownsPopover=false;
  }
  if(this.savedStyle===null)this.element.removeAttribute('style');else this.element.setAttribute('style',this.savedStyle);
  if(marker.isConnected)marker.replaceWith(this.element);else this.element.remove();this.composing=false;this.moving=false;
  if(this.frozenHost){if(this.hostStyle===null)this.frozenHost.removeAttribute('style');else this.frozenHost.setAttribute('style',this.hostStyle);this.frozenHost=undefined;}
  if(this.keyboard&&this.overlayBefore!==undefined){try{this.keyboard.overlaysContent=this.overlayBefore;}catch{/* Browser changed keyboard policy. */}this.overlayBefore=undefined;}
 }
 destroy(){if(this.closed)return;this.reset();this.closed=true;this.abort.abort();clearTimeout(this.blurTimer);cancelAnimationFrame(this.frame);this.input.removeAttribute('data-keyboard-chat');}
}
