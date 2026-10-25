import type { AnimalConfig } from '../animals/AnimalConfig';
import { createOutfit } from '../animals/OutfitState';
import type { ParkMember } from '../park/ParkModel';
import type { FriendsClient } from '../friends/FriendsClient';
import { bindAria,onLanguageChange,t,type TextKey } from '../settings/i18n';
import { paintPetPortrait } from './PetPortrait';

/** Public park appearance + the existing account-owned friend observer/RPC. */
export class ParkProfilePopup {
 private overlay?:HTMLElement;private panel?:HTMLElement;private member?:ParkMember;
 private action?:HTMLButtonElement;private status?:HTMLElement;private label?:HTMLElement;
 private abort?:AbortController;private off?:()=>void;private previousFocus?:HTMLElement;
 private blocked:{element:HTMLElement;inert:boolean}[]=[];
 private readonly localeOff=onLanguageChange(()=>this.render());
 constructor(private readonly owner:string,private readonly pets:AnimalConfig[],private readonly friends?:FriendsClient){}
 get isOpen(){return !!this.overlay;}
 get memberId(){return this.member?.id;}
 open(member:ParkMember){
  if(this.overlay)return;
  const host=document.querySelector<HTMLElement>('#app');if(!host)return;
  this.member=member;this.abort=new AbortController();const {signal}=this.abort;
  this.previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:undefined;
  this.blocked=Array.from(host.children).filter((el):el is HTMLElement=>el instanceof HTMLElement).map(element=>({element,inert:element.inert}));
  this.blocked.forEach(item=>{item.element.inert=true;});
  const overlay=document.createElement('div');overlay.className='settings-overlay park-profile-overlay';this.overlay=overlay;
  const panel=document.createElement('section');panel.className='settings-panel park-profile-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');bindAria(panel,'parkProfile');this.panel=panel;
  const title=document.createElement('h2');title.textContent=t('parkProfile');title.dataset.profileTitle='true';
  const close=document.createElement('button');close.type='button';close.className='settings-close';close.textContent='×';bindAria(close,'close');close.addEventListener('click',()=>this.close(),{signal});
  const stage=document.createElement('div');stage.className='room-pet-stage park-profile-pet';const portrait=document.createElement('span');portrait.className='room-pet';portrait.setAttribute('aria-hidden','true');stage.append(portrait);
  const pet=this.pets.find(p=>p.id===member.look?.petId)??this.pets[0];
  if(pet)paintPetPortrait(portrait,pet,pet.id==='corgi'?'./assets/characters/corgi/corgi-idle-walk.png':'./assets/characters/myeongrang/idle.png',19,0,{...createOutfit(),...member.look?.outfit});
  const name=document.createElement('strong');name.className='park-profile-name';name.textContent=member.name;
  this.label=document.createElement('p');this.label.className='park-profile-relation';
  this.status=document.createElement('p');this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');
  const actions=document.createElement('div');actions.className='settings-content park-profile-actions';
  this.action=document.createElement('button');this.action.type='button';this.action.className='commerce-primary';
  this.action.addEventListener('click',()=>{
   const client=this.friends;if(!client||client.busy||member.id===this.owner)return;
   if(client.error||!client.loaded){void client.refresh();return;}
   const relation=this.relation();if(relation==='none'||relation==='incoming')void client.command(relation==='incoming'?'accept':'send',member.id);
  },{signal});actions.append(this.action);
  panel.append(title,close,stage,name,this.label,this.status,actions);overlay.append(panel);host.append(overlay);
  let backdrop=false;
  overlay.addEventListener('pointerdown',event=>{backdrop=event.target===overlay;},{signal});
  overlay.addEventListener('pointerup',event=>{if(backdrop&&event.target===overlay)this.close();backdrop=false;},{signal});
  overlay.addEventListener('pointercancel',()=>{backdrop=false;},{signal});
  overlay.addEventListener('keydown',event=>{
   event.stopPropagation();if(event.key==='Escape'){event.preventDefault();this.close();return;}
   if(event.key!=='Tab')return;const buttons=Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([hidden])'));
   if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1)?.focus();}
   else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0]?.focus();}
  },{signal});
  this.off=this.friends?.subscribe(()=>this.render());this.render();
  if(member.id!==this.owner)this.friends?.start();close.focus();
 }
 private relation(){
  const id=this.member?.id,s=this.friends?.snapshot;
  return s?.friends.some(f=>f.id===id)?'friend':s?.incoming.some(f=>f.id===id)?'incoming':s?.outgoing.some(f=>f.id===id)?'outgoing':'none';
 }
 private render(){
  if(!this.member||!this.action||!this.status||!this.label)return;
  const title=this.panel?.querySelector<HTMLElement>('[data-profile-title]');if(title)title.textContent=t('parkProfile');
  const own=this.member.id===this.owner,c=this.friends,relation=this.relation();
  this.action.hidden=own;this.label.textContent=own?t('parkYou'):relation==='friend'?t('parkFriend'):relation==='outgoing'?t('friendsPending'):relation==='incoming'?t('parkRequestReceived'):'';
  const errors:Record<string,TextKey>={setup:'friendsSetup',offline:'friendsOffline',auth:'friendsLogin',query:'friendsQuery',nickname:'friendsNickname',limit:'friendsLimit',incoming:'friendsIncoming',notFound:'friendsNotFound'};
  this.status.textContent=own?'':!c?t('friendsLogin'):c.error?t(errors[c.error]!):c.busy?t('friendsLoading'):'';
  this.action.textContent=t(c?.error||!c?.loaded?'friendsRefresh':relation==='friend'?'parkFriend':relation==='outgoing'?'friendsPending':relation==='incoming'?'friendsAccept':'friendsSend');
  this.action.disabled=own||!c||c.busy||(!c.error&&(relation==='friend'||relation==='outgoing'));
 }
 close(){
  if(!this.overlay)return;const own=this.member?.id===this.owner;
  this.off?.();this.off=undefined;if(!own)this.friends?.stop();this.abort?.abort();this.overlay.remove();this.overlay=this.panel=undefined;
  this.blocked.forEach(item=>{item.element.inert=item.inert;});this.blocked=[];
  if(this.previousFocus?.isConnected)this.previousFocus.focus();this.previousFocus=undefined;
  this.member=undefined;this.action=this.status=this.label=undefined;
 }
 destroy(){this.close();this.localeOff();}
}
