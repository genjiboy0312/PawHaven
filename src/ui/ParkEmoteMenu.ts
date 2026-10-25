import {PARK_EMOTES,type ParkEmoteKind} from '../park/ParkModel';
import {bindAria,bindText,type TextKey} from '../settings/i18n';

export const PARK_EMOTE_LABELS:Record<ParkEmoteKind,TextKey>={wave:'parkEmoteWave',heart:'parkEmoteHeart',music:'parkEmoteMusic'};
export const PARK_EMOTE_MESSAGES:Record<ParkEmoteKind,TextKey>={wave:'parkEmoteHello',heart:'parkEmoteLike',music:'parkEmoteHappy'};
export const PARK_EMOTE_MARKS:Record<ParkEmoteKind,string>={wave:'!',heart:'♡',music:'♪'};
/** Small local menu; the account-bound park client owns cooldowns and networking. */
export class ParkEmoteMenu {
 readonly toggle=document.createElement('button');readonly element=document.createElement('section');
 private readonly abort=new AbortController();private enabled=false;private ready=false;
 private readonly choices:HTMLButtonElement[]=[];
 constructor(select:(kind:ParkEmoteKind)=>boolean){
  const {signal}=this.abort;
  this.toggle.type='button';this.toggle.className='commerce-primary park-emote-toggle';this.toggle.textContent='♡';this.toggle.disabled=true;
  bindAria(this.toggle,'parkEmotes');this.toggle.setAttribute('aria-expanded','false');
  this.element.className='settings-panel park-emote-menu';this.element.hidden=true;this.element.setAttribute('role','group');bindAria(this.element,'parkEmotes');
  this.toggle.addEventListener('click',()=>{if(!this.enabled)return;this.setOpen(this.element.hidden!==false);},{signal});
  for(const kind of PARK_EMOTES){
   const button=document.createElement('button');button.type='button';button.className='commerce-primary';button.dataset.emote=kind;bindText(button,PARK_EMOTE_LABELS[kind]);
   button.addEventListener('click',()=>{if(this.enabled&&this.ready&&select(kind)){this.close();this.toggle.focus();}},{signal});
   this.choices.push(button);this.element.append(button);
  }
  const note=document.createElement('p');bindText(note,'parkEmoteHint');this.element.append(note);
  document.addEventListener('pointerdown',event=>{if(!this.element.hidden&&!this.element.contains(event.target as Node)&&!this.toggle.contains(event.target as Node))this.close();},{signal});
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();this.toggle.focus();}};
  this.element.addEventListener('keydown',escape,{signal});this.toggle.addEventListener('keydown',escape,{signal});
 }
 private setOpen(open:boolean){this.element.hidden=!open;this.toggle.setAttribute('aria-expanded',String(open));if(open)this.choices.find(button=>!button.disabled)?.focus();}
 close(){this.setOpen(false);}
 update(enabled:boolean,ready:boolean){this.enabled=enabled;this.ready=ready;this.toggle.disabled=!enabled;for(const choice of this.choices)choice.disabled=!enabled||!ready;if(!enabled)this.close();}
 destroy(){this.abort.abort();this.element.remove();this.toggle.remove();}
}
