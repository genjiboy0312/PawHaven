export interface ChatViewport {width:number;height:number;offsetLeft:number;offsetTop:number}
/** Layout viewport coordinates for a panel above the software keyboard. */
export function chatDockBounds(view:ChatViewport){
 const margin=8,width=Math.max(1,Math.min(700,view.width-margin*2));
 return {left:view.offsetLeft+(view.width-width)/2,bottom:view.offsetTop+view.height-margin,width,maxHeight:Math.max(1,Math.min(190,view.height-margin*2))};
}

/** Temporarily dock the SAME chat node outside the rotated/clipped game surface. */
export class KeyboardChatDock {
 private readonly abort=new AbortController();private marker?:Comment;private savedStyle:string|null=null;
 private moving=false;private keyboardSeen=false;private baseline=0;private blurTimer?:ReturnType<typeof setTimeout>;
 private frame=0;private closed=false;
 constructor(private readonly element:HTMLElement,private readonly input:HTMLInputElement){
  input.setAttribute('data-keyboard-chat','true');
  const options={signal:this.abort.signal};
  input.addEventListener('pointerdown',()=>{if(this.touch()){this.mount();input.focus({preventScroll:true});}},options);
  input.addEventListener('focus',()=>{if(this.touch()&&!this.moving)this.mount();},options);
  input.addEventListener('blur',()=>{
   if(this.moving)return;clearTimeout(this.blurTimer);
   // Let Send's click/submit complete before reparenting its target.
   this.blurTimer=setTimeout(()=>{if(document.activeElement!==input&&!this.shrunk())this.reset();},220);
  },options);
  const layout=()=>this.schedule();
  window.visualViewport?.addEventListener('resize',layout,options);window.visualViewport?.addEventListener('scroll',layout,options);
  window.addEventListener('resize',layout,options);window.screen?.orientation?.addEventListener('change',()=>this.reset(),options);
 }
 private touch(){return window.matchMedia?.('(any-pointer: coarse)').matches??false;}
 private view():ChatViewport{const v=window.visualViewport;return v?{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop}:{width:window.innerWidth,height:window.innerHeight,offsetLeft:0,offsetTop:0};}
 private shrunk(){return this.view().height<this.baseline-80;}
 private mount(){
  if(this.closed||this.marker||!this.element.isConnected)return;
  this.baseline=Math.max(this.view().height,window.innerHeight);this.keyboardSeen=false;
  this.savedStyle=this.element.getAttribute('style');this.marker=document.createComment('keyboard-chat-home');this.element.before(this.marker);
  this.moving=true;const focused=document.activeElement===this.input,start=this.input.selectionStart,end=this.input.selectionEnd;
  this.element.classList.add('keyboard-chat-docked');document.body.append(this.element);this.layout();
  if(focused){this.input.focus({preventScroll:true});if(start!==null&&end!==null)this.input.setSelectionRange(start,end);}
  this.moving=false;
 }
 private schedule(){if(!this.marker||this.closed)return;cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.layout());}
 private layout(){
  if(!this.marker||this.closed)return;
  if(this.shrunk())this.keyboardSeen=true;
  else if(this.keyboardSeen){this.reset();return;}
  const bounds=chatDockBounds(this.view());
  this.element.style.left=bounds.left+'px';this.element.style.width=bounds.width+'px';this.element.style.maxHeight=bounds.maxHeight+'px';
  this.element.style.top=Math.max(this.view().offsetTop+8,bounds.bottom-this.element.getBoundingClientRect().height)+'px';
 }
 reset(){
  if(!this.marker)return;this.moving=true;clearTimeout(this.blurTimer);cancelAnimationFrame(this.frame);this.input.blur();
  const marker=this.marker;this.marker=undefined;this.element.classList.remove('keyboard-chat-docked');
  if(this.savedStyle===null)this.element.removeAttribute('style');else this.element.setAttribute('style',this.savedStyle);
  if(marker.isConnected)marker.replaceWith(this.element);else this.element.remove();this.keyboardSeen=false;this.moving=false;
 }
 destroy(){if(this.closed)return;this.reset();this.closed=true;this.abort.abort();clearTimeout(this.blurTimer);cancelAnimationFrame(this.frame);this.input.removeAttribute('data-keyboard-chat');}
}
