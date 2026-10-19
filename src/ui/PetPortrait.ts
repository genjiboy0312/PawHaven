import type { AnimalConfig } from '../animals/AnimalConfig';

/** Crop the existing Idle atlas for lightweight DOM previews. */
export function paintPetPortrait(element:HTMLElement,config:AnimalConfig,thumbnail:string,size=10,index=0):void {
  const idle=config.animations.idle;if(!idle?.frames.length)return;
  const texture=idle.frames[index%idle.frames.length]!,frame=texture.frame;
  const height=Math.max(...idle.frames.map(item=>item.frame.height));
  element.style.backgroundImage='url("'+thumbnail+'")';
  element.style.width=frame.width/height*size+'cqh';element.style.height=frame.height/height*size+'cqh';
  element.style.backgroundSize=`${texture.source.width/height*size}cqh ${texture.source.height/height*size}cqh`;
  element.style.backgroundPosition=`${-frame.x/height*size}cqh ${-frame.y/height*size}cqh`;
}
