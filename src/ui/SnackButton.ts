import type { CommerceState } from '../shop/CommerceState';
import { t } from '../settings/i18n';
/** The economy snapshot, not this pet-side component, owns treat stock. */
export class SnackButton {
  readonly element=document.createElement('button');
  private readonly label=document.createElement('span');private readonly abort=new AbortController();
  private remaining=0;private cooldown=0;private pending=false;private disposed=false;private serial:number;
  private signature='';
  constructor(private readonly source:CommerceState,private readonly petId:string,private readonly onFed:()=>void,private readonly quest:()=>void){
    this.serial=source.feedSerial;this.element.type='button';this.element.className='snack-action';this.element.hidden=true;
    const art=document.createElement('span');art.className='snack-art';const image=document.createElement('img');image.src='./assets/items/pet-treat.png';image.alt='';art.append(image);this.element.append(art,this.label);
    this.element.addEventListener('click',()=>{void this.give();},{signal:this.abort.signal});
  }
  reveal(){this.remaining=7;this.render();}
  private async give(){
    if(this.pending||this.disposed||this.source.busy||this.cooldown>0||!this.source.snacksReady)return;
    if(!this.source.ready){this.source.retry();return;}
    if(this.source.snacks===0){this.remaining=0;this.render();this.quest();return;}
    this.pending=true;this.render();
    try{await this.source.feed(this.petId);}finally{if(!this.disposed){this.pending=false;this.render();}}
  }
  update(seconds:number,x:number,y:number,width:number,height:number){
    if(this.disposed)return;
    if(this.source.feedSerial!==this.serial){this.serial=this.source.feedSerial;if(this.source.fedPet===this.petId){this.cooldown=4;this.remaining=4.5;this.onFed();}}
    if(Number.isFinite(seconds)&&seconds>0){if(!this.pending)this.remaining=Math.max(0,this.remaining-seconds);this.cooldown=Math.max(0,this.cooldown-seconds);}
    this.element.style.left=Math.max(100,Math.min(width-100,x))/width*100+'%';this.element.style.top=Math.max(90,Math.min(height-70,y))/height*100+'%';this.render();
  }
  private render(){
    const key=!this.source.snacksReady?'snackSetup':!this.source.ready&&!this.source.busy?'economyRetry':this.source.snacks?'snackGive':'snackGet';
    const text=t(key)+(this.source.snacksReady?' · '+this.source.snacks:''),hidden=this.remaining<=0&&!this.pending,disabled=this.pending||this.source.busy||this.cooldown>0||!this.source.snacksReady;
    const signature=JSON.stringify([text,hidden,disabled]);if(signature===this.signature)return;this.signature=signature;
    this.element.hidden=hidden;this.label.textContent=text;this.element.setAttribute('aria-label',text);this.element.disabled=disabled;
  }
  destroy(){this.disposed=true;this.abort.abort();this.element.remove();}
}
