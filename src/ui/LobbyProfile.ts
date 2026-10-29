import type {AccountLevelUp} from '../account/AccountProgress';
import type {AnimalConfig} from '../animals/AnimalConfig';
import type {CommerceState} from '../shop/CommerceState';
import {petThumbnail} from '../animals/PetCatalog';
import {t,onLanguageChange} from '../settings/i18n';
import {paintPetFrame} from './PetPortrait';
export interface LobbyProfileOptions {config:AnimalConfig;nickname? :()=>string|null|undefined;state:CommerceState}
/** One shared commerce subscription; the portrait reuses the current pet's atlas. */
export class LobbyProfile {
 readonly element=document.createElement('section');
 private name=document.createElement('span');private level=document.createElement('span');
 private bar=document.createElement('div');private fill=document.createElement('span');private xp=document.createElement('span');
 private activeNotice?:AccountLevelUp;
 private notice=document.createElement('span');private off:()=>void;private offLanguage:()=>void;
 constructor(private options:LobbyProfileOptions){
  this.element.className='lobby-profile';
  const avatar=document.createElement('div'),pet=document.createElement('span'),info=document.createElement('div'),heading=document.createElement('div');
  avatar.className='lobby-profile-avatar';pet.className='lobby-profile-pet';pet.setAttribute('aria-hidden','true');
  paintPetFrame(pet,options.config,petThumbnail(options.config.id),10);avatar.append(pet);
  info.className='lobby-profile-info';heading.className='lobby-profile-heading';this.name.className='lobby-profile-name';this.level.className='lobby-profile-level';
  this.bar.className='lobby-profile-bar';this.bar.setAttribute('role','progressbar');this.fill.className='lobby-profile-fill';this.bar.append(this.fill);
  this.xp.className='lobby-profile-xp';this.notice.className='lobby-profile-notice';this.notice.setAttribute('role','status');
  heading.append(this.name,this.level);info.append(heading,this.bar,this.xp,this.notice);this.element.append(avatar,info);
  this.off=options.state.subscribe(()=>this.update());this.offLanguage=onLanguageChange(()=>this.update());this.update();
 }
 updateName(){const name=this.options.nickname?.()||t('profileGuest');if(this.name.textContent!==name)this.name.textContent=name;}
 private update(){
  this.updateName();const state=this.options.state,p=state.accountProgress,ready=state.accountProgressReady;
  this.level.textContent=ready?'Lv. '+p.level:'Lv. —';this.level.setAttribute('aria-label',t('accountLevel')+' '+(ready?p.level:'—'));
  this.fill.style.width=(ready?p.percent:0)+'%';this.xp.textContent=!ready?'EXP —':p.max?'MAX':`${p.current} / ${p.required} EXP`;
  this.bar.setAttribute('aria-label',t('accountXP'));this.bar.setAttribute('aria-valuemin','0');this.bar.setAttribute('aria-valuemax',String(p.required));this.bar.setAttribute('aria-valuenow',String(ready?p.current:0));
  this.activeNotice=state.takeAccountLevelUp()??this.activeNotice;const notice=this.activeNotice;
  if(notice)this.notice.textContent=t('accountLevelUp')+'  '+t('profileReward').replace('{coins}',String(notice.coins)).replace('{snacks}',String(notice.snacks));
 }
 destroy(){this.off();this.offLanguage();this.element.remove();}
}
