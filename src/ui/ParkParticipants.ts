import type {AnimalConfig} from '../animals/AnimalConfig';
import {createOutfit} from '../animals/OutfitState';
import type {ParkMember} from '../park/ParkModel';
import {bindAria,bindText,onLanguageChange,t} from '../settings/i18n';
import {paintPetPortrait} from './PetPortrait';

/** A view of the existing park snapshot; no extra requests or participant store. */
export class ParkParticipants {
 readonly toggle=document.createElement('button');readonly element=document.createElement('section');
 private readonly list=document.createElement('div');private readonly abort=new AbortController();
 private readonly rows=new Map<string,{button:HTMLButtonElement;portrait:HTMLElement;name:HTMLElement;note:HTMLElement;signature:string}>();
 private enabled=false;private channel=0;private members:ParkMember[]=[];private blocked:ReadonlySet<string>=new Set();
 private readonly localeOff=onLanguageChange(()=>this.render());
 constructor(private readonly pets:AnimalConfig[],private readonly owner:string,select:(id:string)=>void){
  const {signal}=this.abort;this.toggle.type='button';this.toggle.className='park-people-toggle';this.toggle.disabled=true;this.toggle.setAttribute('aria-expanded','false');bindAria(this.toggle,'parkParticipants');
  this.element.className='settings-panel park-participants';this.element.hidden=true;this.element.setAttribute('role','group');bindAria(this.element,'parkParticipants');
  const heading=document.createElement('h2');bindText(heading,'parkParticipants');const close=document.createElement('button');close.type='button';close.className='settings-close';close.textContent='×';bindAria(close,'close');
  close.addEventListener('click',()=>{this.close();this.toggle.focus();},{signal});this.list.className='park-participant-list';this.element.append(heading,close,this.list);
  this.toggle.addEventListener('click',()=>{if(!this.enabled)return;const open=this.element.hidden!==false;this.element.hidden=!open;this.toggle.setAttribute('aria-expanded',String(open));if(open)this.rows.values().next().value?.button.focus();},{signal});
  this.list.addEventListener('click',event=>{
   const row=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-park-member]');if(!row||!this.list.contains(row)||!this.enabled)return;
   this.close();this.toggle.focus();select(row.dataset.parkMember!);
  },{signal});
  document.addEventListener('pointerdown',event=>{if(!this.element.hidden&&!this.element.contains(event.target as Node)&&!this.toggle.contains(event.target as Node))this.close();},{signal});
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();this.toggle.focus();}};
  this.element.addEventListener('keydown',escape,{signal});this.toggle.addEventListener('keydown',escape,{signal});
 }
 update(channel:number,members:ParkMember[],enabled:boolean,blocked:ReadonlySet<string>){
  this.channel=channel;this.members=members;this.blocked=blocked;this.setEnabled(enabled);this.render();
 }
 setEnabled(enabled:boolean){this.enabled=enabled&&this.channel>0;this.toggle.disabled=!this.enabled;if(!this.enabled)this.close();}
 private render(){
  this.toggle.textContent=t('park')+(this.channel?` ${this.channel} · ${this.members.length}/8 ▾`:'');
  const ids=new Set(this.members.map(m=>m.id));let restore=false;
  for(const[id,row]of this.rows)if(!ids.has(id)){restore=restore||row.button.contains(document.activeElement);row.button.remove();this.rows.delete(id);}
  for(const member of this.members){
   let row=this.rows.get(member.id);
   if(!row){
    const button=document.createElement('button');button.type='button';button.className='commerce-primary park-participant';button.dataset.parkMember=member.id;
    const stage=document.createElement('span');stage.className='room-pet-stage';stage.setAttribute('aria-hidden','true');const portrait=document.createElement('span');portrait.className='room-pet';stage.append(portrait);
    const info=document.createElement('span');info.className='park-participant-info';const name=document.createElement('strong'),note=document.createElement('span');info.append(name,note);button.append(stage,info);this.list.append(button);
    row={button,portrait,name,note,signature:''};this.rows.set(member.id,row);
   }
   row.name.textContent=member.name;row.note.textContent=member.id===this.owner?t('parkYou'):this.blocked.has(member.id)?t('friendsBlockState'):'';
   const signature=JSON.stringify(member.look??{});if(row.signature!==signature){
    row.signature=signature;const pet=this.pets.find(p=>p.id===member.look?.petId)??this.pets[0];
    if(pet)paintPetPortrait(row.portrait,pet,pet.id==='corgi'?'./assets/characters/corgi/corgi-idle-walk.png':'./assets/characters/myeongrang/idle.png',7,0,{...createOutfit(),...member.look?.outfit});
   }
  }
  if(restore&&!this.element.hidden)this.rows.values().next().value?.button.focus();
 }
 close(){this.element.hidden=true;this.toggle.setAttribute('aria-expanded','false');}
 destroy(){this.abort.abort();this.localeOff();this.rows.clear();this.element.remove();this.toggle.remove();}
}
