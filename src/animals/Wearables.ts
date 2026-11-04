import type { AnimalAction, AnimalConfig, AnimationSet, HeadAnchor } from './AnimalConfig';
import type { OutfitState, OutfitTab } from './OutfitState';
import type { TextKey } from '../settings/i18n';
import { SANTA_HAT } from './HatPlacement';
import { KARAKUSA_SCARF_ART } from './CollarFits';
import { attachmentPose, attachmentTarget, type AttachmentArt, type AttachmentPoint, type AttachmentTarget } from './AttachmentFit';

/** Equipment art and attachment geometry shared by Pixi, inventory and DOM previews. */
export const WEARABLES = [
  {category:'Hat',index:1,texture:'santaHat',iconClass:'santa-hat-icon',name:'santaHat',file:'santa-hat.png',width:1536,height:1024,anchorX:SANTA_HAT.anchorX,anchorY:SANTA_HAT.anchorY,fitWidth:550,attachment:'head',offsetY:5},
  {category:'Hat',index:2,texture:'topHat',iconClass:'top-hat-icon',name:'blackTopHat',file:'black-top-hat.png',width:1536,height:1024,anchorX:768/1536,anchorY:738/1024,fitWidth:850/0.6,attachment:'head',offsetY:5},
  {category:'Acc',index:2,texture:'bowTie',iconClass:'bow-tie-icon',name:'redBowTie',file:'red-bow-tie.png',width:1536,height:1024,anchorX:768/1536,anchorY:535/1024,fitWidth:995,attachment:'neck',offsetY:0},
  {category:'Acc',index:3,texture:'karakusaScarf',iconClass:'scarf-icon',name:'karakusaScarf',file:'karakusa-scarf.png',...KARAKUSA_SCARF_ART,anchorX:752.5/1536,anchorY:347.5/1024,fitWidth:Math.hypot(1015,95),attachment:'collar',offsetY:0},
] as const satisfies readonly Wearable[];
export type WearableTexture = (typeof WEARABLES)[number]['texture'];
export interface Wearable {
  category: OutfitTab; index: number; texture: string; iconClass: string; name: TextKey; file: string;
  width: number; height: number; anchorX: number; anchorY: number; fitWidth: number;
  attachment: AttachmentPoint; offsetY: number; mount?: AttachmentArt['mount']; depth?: number;
}
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
export function wearablePose(item:Wearable,target:AttachmentTarget,bodyScale:number){
  const x=item.width*item.anchorX,y=item.height*item.anchorY;
  return attachmentPose({width:item.width,height:item.height,depth:item.depth,mount:item.mount??{back:{x:x-item.fitWidth/2,y},front:{x:x+item.fitWidth/2,y}}},
    {...target,y:target.y+item.offsetY/bodyScale});
}
export function wornLayers(config:AnimalConfig,outfit:OutfitState,clip:NonNullable<AnimationSet['idle']>,frame:number){
  if(!config.wardrobe)return [];
  return WEARABLES.flatMap(item=>{
    const texture=config.wardrobe?.textures[item.texture];
    if(outfit[item.category]!==item.index||!texture)return [];
    const target=attachmentTarget(config,clip,frame,item.attachment);
    if(!target)return [];
    return [{item,texture,pose:wearablePose(item,target,config.scale*(clip.scale??1))}];
  });
}
