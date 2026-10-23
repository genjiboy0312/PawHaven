import type { AnimalConfig } from '../animals/AnimalConfig';
import type { Room } from '../multiplayer/RoomClient';
import { t } from '../settings/i18n';
import { paintPetPortrait } from './PetPortrait';

/** Shared by the race and room popup; only server-accepted times receive places. */
export function raceResults(racers:Room['racers'],members:Room['members'],owner:string,pets:AnimalConfig[],ended:boolean):HTMLElement {
  const list=document.createElement('div');list.className='race-results-list';list.setAttribute('role','list');list.setAttribute('aria-label',t('raceResults'));
  const sorted=[...racers].sort((a,b)=>(a.time??Infinity)-(b.time??Infinity));
  let place=0,lastTime:number|null=null;
  for(const [index,racer]of sorted.entries()){
    if(racer.time!==null){if(racer.time!==lastTime)place=index+1;lastTime=racer.time;}
    const row=document.createElement('div');row.className='race-result-row';row.setAttribute('role','listitem');row.setAttribute('data-self',String(racer.id===owner));
    const rank=document.createElement('span');rank.className='race-place';rank.textContent=racer.time===null?'—':String(place);
    const art=document.createElement('span');art.className='race-result-pet';
    const member=members.find(member=>member.id===racer.id),pet=pets.find(pet=>pet.id===member?.look.petId);
    if(pet&&['corgi','myeongrang'].includes(pet.id)){
      const portrait=document.createElement('span');portrait.className='room-pet';portrait.setAttribute('aria-hidden','true');
      paintPetPortrait(portrait,pet,pet.id==='corgi'?'./assets/characters/corgi/corgi-idle-walk.png':'./assets/characters/myeongrang/idle.png',7,0,member?.look.outfit);art.append(portrait);
    }
    const name=document.createElement('strong');name.className='race-result-name';name.textContent=racer.name+(racer.id===owner?' · '+t('raceYou'):'');
    const time=document.createElement('span');time.className='race-result-time';
    time.textContent=racer.time===null?t(ended||racer.left?'didNotFinish':'raceRunning'):(racer.time/1000).toFixed(2)+'s';
    row.append(rank,art,name,time);list.append(row);
  }
  return list;
}
