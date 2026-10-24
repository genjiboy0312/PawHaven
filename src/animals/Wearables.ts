import type { AnimalConfig, AnimationSet, HeadAnchor } from './AnimalConfig';
import type { OutfitState, OutfitTab } from './OutfitState';
import { SANTA_HAT } from './HatPlacement';

/** Equipment art and attachment geometry shared by Pixi, inventory and DOM previews. */
export const WEARABLES = [
  {category:'Hat',index:1,texture:'santaHat',name:'santaHat',file:'santa-hat.png',width:1536,height:1024,anchorX:SANTA_HAT.anchorX,anchorY:SANTA_HAT.anchorY,fitWidth:550,attachment:'head',offsetY:5},
  {category:'Hat',index:2,texture:'topHat',name:'blackTopHat',file:'black-top-hat.png',width:1536,height:1024,anchorX:768/1536,anchorY:738/1024,fitWidth:700,attachment:'head',offsetY:5},
  {category:'Acc',index:2,texture:'bowTie',name:'redBowTie',file:'red-bow-tie.png',width:1536,height:1024,anchorX:768/1536,anchorY:535/1024,fitWidth:995,attachment:'neck',offsetY:0},
] as const;
export type Wearable=typeof WEARABLES[number];
export const wearableItem=(category:OutfitTab,index:number)=>WEARABLES.find(item=>item.category===category&&item.index===index);
/** A per-frame neck attachment follows the head; clips can supply a measured override. */
export function neckAnchor(head:HeadAnchor,petId:string,moving=false):HeadAnchor{
  const rotation=head.rotation??0,dx=head.width*(moving?(petId==='myeongrang'?-.28:-.15):(petId==='myeongrang'?.12:.2)),dy=head.width*(moving?1.18:.95);
  return {x:head.x+dx*Math.cos(rotation)-dy*Math.sin(rotation),y:head.y+dx*Math.sin(rotation)+dy*Math.cos(rotation),width:head.width*.52,rotation};
}
export function fitNeckAnchors(config:AnimalConfig):void{
  for(const [action,clip]of Object.entries(config.animations))if(clip.head&&!clip.neck)clip.neck=clip.head.map(head=>neckAnchor(head,config.id,!['idle','emote'].includes(action)));
}
export function wearablePose(item:Wearable,target:HeadAnchor,bodyScale:number){
  return {x:target.x,y:target.y+item.offsetY/bodyScale,scale:target.width/item.fitWidth,rotation:target.rotation??0};
}
export function wornLayers(config:AnimalConfig,outfit:OutfitState,clip:NonNullable<AnimationSet['idle']>,frame:number){
  const head=clip.head?.[frame];
  if(!config.wardrobe||!head)return [];
  return WEARABLES.flatMap(item=>{
    const texture=config.wardrobe?.[item.texture];
    if(outfit[item.category]!==item.index||!texture)return [];
    const target=item.attachment==='neck'?(clip.neck?.[frame]??neckAnchor(head,config.id)):head;
    return [{item,texture,pose:wearablePose(item,target,config.scale*(clip.scale??1))}];
  });
}
