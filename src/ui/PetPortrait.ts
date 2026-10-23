import type { AnimalConfig } from '../animals/AnimalConfig';
import type { OutfitState } from '../animals/OutfitState';
import { SANTA_HAT, santaHatPose } from '../animals/HatPlacement';

/** Crop the existing Idle atlas for lightweight DOM previews. */
export function paintPetPortrait(element:HTMLElement,config:AnimalConfig,thumbnail:string,size=10,index=0,outfit?:OutfitState):void {
  const idle=config.animations.idle;if(!idle?.frames.length)return;
  const texture=idle.frames[index%idle.frames.length]!,frame=texture.frame;
  const height=Math.max(...idle.frames.map(item=>item.frame.height));
  element.style.backgroundImage='url("'+thumbnail+'")';
  element.style.width=frame.width/height*size+'cqh';element.style.height=frame.height/height*size+'cqh';
  element.style.backgroundSize=`${texture.source.width/height*size}cqh ${texture.source.height/height*size}cqh`;
  element.style.backgroundPosition=`${-frame.x/height*size}cqh ${-frame.y/height*size}cqh`;
  let hat=element.querySelector<HTMLElement>('.pet-portrait-hat');
  const head=idle.head?.[index%idle.frames.length];
  // Use this member's server look; the shared config may reference the local player's outfit.
  if(outfit?.Hat!==1||!config.wardrobe||!head){hat?.remove();return;}
  if(!hat){hat=document.createElement('span');hat.className='pet-portrait-hat';hat.setAttribute('aria-hidden','true');element.append(hat);}
  const pose=santaHatPose(head,config.scale*(idle.scale??1)),trim=texture.trim??texture.orig,unit=size/height;
  const x=pose.x+texture.orig.width*.5-trim.x,y=pose.y+texture.orig.height*(idle.anchorY??1)-trim.y;
  hat.style.width=SANTA_HAT.width*pose.scale*unit+'cqh';hat.style.height=SANTA_HAT.height*pose.scale*unit+'cqh';
  hat.style.left=(x-SANTA_HAT.width*SANTA_HAT.anchorX*pose.scale)*unit+'cqh';
  hat.style.top=(y-SANTA_HAT.height*SANTA_HAT.anchorY*pose.scale)*unit+'cqh';
  hat.style.transformOrigin=`${SANTA_HAT.anchorX*100}% ${SANTA_HAT.anchorY*100}%`;hat.style.transform=`rotate(${pose.rotation}rad)`;
}
