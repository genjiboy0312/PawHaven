/** Keep the reader's visible message anchored while bounded history receives new rows. */
export class ChatHistory {
 private readonly abort=new AbortController();private readonly resize?:ResizeObserver;
 private following=true;
 constructor(private readonly log:HTMLElement,private readonly latest:HTMLButtonElement){
  latest.hidden=true;
  log.addEventListener('scroll',()=>{
   this.following=this.atBottom();if(this.following)this.clear();
  },{signal:this.abort.signal});
  latest.addEventListener('click',()=>this.toLatest(),{signal:this.abort.signal});
  // Keep the same five-line history pinned when the keyboard changes the available height.
  if(typeof ResizeObserver!=='undefined'){this.resize=new ResizeObserver(()=>{if(this.following)this.toLatest();});this.resize.observe(log);}
 }
 private atBottom(){return this.log.scrollHeight-this.log.clientHeight-this.log.scrollTop<=8;}
 private clear(){this.latest.hidden=true;}
 toLatest(){this.following=true;this.log.scrollTop=this.log.scrollHeight;this.clear();}
 append(rows:HTMLElement[],initial=false){
  if(!rows.length)return;
  const follow=initial||this.following&&this.atBottom();
  const anchor=Array.from(this.log.children).find((row):row is HTMLElement=>row instanceof HTMLElement&&row.getBoundingClientRect().bottom>this.log.getBoundingClientRect().top);
  const top=anchor?.getBoundingClientRect().top;
  this.log.append(...rows);while(this.log.childElementCount>30)this.log.firstElementChild?.remove();
  if(follow)this.toLatest();
  else{
   this.following=false;
   // The oldest row may be pruned at the 30-message limit; retain the first remaining row.
   if(anchor?.parentElement===this.log&&top!==undefined)this.log.scrollTop+=anchor.getBoundingClientRect().top-top;
   else this.log.scrollTop=0;
   this.latest.hidden=false;
  }
 }
 reset(){this.log.replaceChildren();this.following=true;this.clear();}
 destroy(){this.abort.abort();this.resize?.disconnect();}
}
