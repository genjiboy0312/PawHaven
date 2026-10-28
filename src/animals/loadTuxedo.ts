import { Assets, type Texture } from 'pixi.js';
import { createAtlasAnimal, type MyeongrangMap } from './createMyeongrang';
import type { AnimalConfig } from './AnimalConfig';
import type { NeckAnchorMap } from './Wearables';
export async function loadTuxedo(shared:AnimalConfig):Promise<AnimalConfig>{
  const base=import.meta.env.BASE_URL+'assets/characters/tuxedo/';
  const [atlas,map,necks]=await Promise.all([Assets.load<Texture>(base+'atlas.png'),Assets.load<MyeongrangMap>(base+'frames.json'),Assets.load<NeckAnchorMap>(base+'neck-anchors.json')]);
  atlas.source.scaleMode='nearest';
  const config=createAtlasAnimal({atlas},map,shared,necks,'tuxedo');
  const jump=config.animations.jump!;
  for(const [key,start,end]of [['fall',4,5],['land',6,8]] as const)config.animations[key]={...jump,frames:jump.frames.slice(start,end),head:jump.head?.slice(start,end),neck:jump.neck?.slice(start,end),bodyBounds:jump.bodyBounds?.slice(start,end)};
  return config;
}
