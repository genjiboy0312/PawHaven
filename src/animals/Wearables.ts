import type { AnimalAction, AnimalConfig, AnimationSet, HeadAnchor } from './AnimalConfig';
import type { OutfitState, OutfitTab } from './OutfitState';
import { SANTA_HAT } from './HatPlacement';

/** Equipment art and attachment geometry shared by Pixi, inventory and DOM previews. */
export const WEARABLES = [
  {category:'Hat',index:1,texture:'santaHat',name:'santaHat',file:'santa-hat.png',width:1536,height:1024,anchorX:SANTA_HAT.anchorX,anchorY:SANTA_HAT.anchorY,fitWidth:550,attachment:'head',offsetY:5},
  {category:'Hat',index:2,texture:'topHat',name:'blackTopHat',file:'black-top-hat.png',width:1536,height:1024,anchorX:768/1536,anchorY:738/1024,fitWidth:850,attachment:'head',offsetY:5},
  {category:'Acc',index:2,texture:'bowTie',name:'redBowTie',file:'red-bow-tie.png',width:1536,height:1024,anchorX:768/1536,anchorY:535/1024,fitWidth:995,attachment:'neck',offsetY:0},
] as const;
export type Wearable=typeof WEARABLES[number];
export const wearableItem=(category:OutfitTab,index:number)=>WEARABLES.find(item=>item.category===category&&item.index===index);
export type NeckAnchorMap=Partial<Record<AnimalAction,HeadAnchor[]>>;
/** Frame-specific chest landmarks; never infer accessory positions from a hat/head offset. */
export function applyNeckAnchors(config:AnimalConfig,anchors:NeckAnchorMap):void{
  for(const [action,points]of Object.entries(anchors)){
    const clip=config.animations[action as AnimalAction];
    if(!clip||points.length!==clip.frames.length||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.width)||p.width<=0||!Number.isFinite(p.rotation??0)))throw Error('Invalid neck attachment frames: '+config.id+'/'+action);
    clip.neck=points.map(point=>({...point}));
  }
}
export function wearablePose(item:Wearable,target:HeadAnchor,bodyScale:number){
  return {x:target.x,y:target.y+item.offsetY/bodyScale,scale:target.width/item.fitWidth,rotation:target.rotation??0};
}
export function wornLayers(config:AnimalConfig,outfit:OutfitState,clip:NonNullable<AnimationSet['idle']>,frame:number){
  const head=clip.head?.[frame];
  if(!config.wardrobe)return [];
  return WEARABLES.flatMap(item=>{
    const texture=config.wardrobe?.[item.texture];
    if(outfit[item.category]!==item.index||!texture)return [];
    const target=item.attachment==='neck'?clip.neck?.[frame]:head;
    if(!target)return [];
    return [{item,texture,pose:wearablePose(item,target,config.scale*(clip.scale??1))}];
  });
}
