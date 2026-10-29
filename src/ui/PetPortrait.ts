import type { AnimalConfig } from '../animals/AnimalConfig';
import type { OutfitState } from '../animals/OutfitState';
import { wornLayers } from '../animals/Wearables';

/** Crop the existing Idle atlas without allocating another image. */
export function paintPetFrame(element:HTMLElement,config:AnimalConfig,thumbnail:string,size=10,index=0):void {
  const idle=config.animations.idle;if(!idle?.frames.length)return;
  const texture=idle.frames[index%idle.frames.length]!,frame=texture.frame;
  const height=Math.max(...idle.frames.map(item=>item.frame.height));
  element.style.backgroundImage='url("'+thumbnail+'")';
  element.style.width=frame.width/height*size+'cqh';element.style.height=frame.height/height*size+'cqh';
  element.style.backgroundSize=`${texture.source.width/height*size}cqh ${texture.source.height/height*size}cqh`;
  element.style.backgroundPosition=`${-frame.x/height*size}cqh ${-frame.y/height*size}cqh`;
}

/** Preview the same frame with optional worn layers. */
export function paintPetPortrait(element:HTMLElement,config:AnimalConfig,thumbnail:string,size=10,index=0,outfit?:OutfitState):void {
  const idle=config.animations.idle;if(!idle?.frames.length)return;
  const texture=idle.frames[index%idle.frames.length]!,height=Math.max(...idle.frames.map(item=>item.frame.height));
  paintPetFrame(element,config,thumbnail,size,index);
  // Use this member's server look; the shared config may reference the local player's outfit.
  const layers=outfit?wornLayers(config,outfit,idle,index%idle.frames.length):[];
  for(const category of ['Hat','Acc']){
    const className=category==='Hat'?'pet-portrait-hat':'pet-portrait-acc';
    let layer=element.querySelector<HTMLElement>('.'+className);
    const equipped=layers.find(layer=>layer.item.category===category);
    if(!equipped){layer?.remove();continue;}
    if(!layer){layer=document.createElement('span');layer.className=className;layer.setAttribute('aria-hidden','true');element.append(layer);}
    const {item,pose}=equipped,trim=texture.trim??texture.orig,unit=size/height;
    const x=pose.x+texture.orig.width*.5-trim.x,y=pose.y+texture.orig.height*(idle.anchorY??1)-trim.y;
    layer.style.backgroundImage='url("./assets/items/'+item.file+'")';
    layer.style.width=item.width*pose.scale*unit+'cqh';layer.style.height=item.height*pose.scale*unit+'cqh';
    layer.style.left=(x-item.width*pose.anchorX*pose.scale)*unit+'cqh';
    layer.style.top=(y-item.height*pose.anchorY*pose.scale)*unit+'cqh';
    layer.style.transformOrigin=`${pose.anchorX*100}% ${pose.anchorY*100}%`;layer.style.transform=`rotate(${pose.rotation}rad)`;
  }
}
