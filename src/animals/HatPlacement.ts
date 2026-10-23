import type { HeadAnchor } from './AnimalConfig';

/** Shared attachment geometry for the existing full-canvas Santa hat resource. */
export const SANTA_HAT = { width:1536, height:1024, brimWidth:550, anchorX:865/1536, anchorY:730/1024 } as const;
export function santaHatPose(head:HeadAnchor,bodyScale:number){
  return { x:head.x, y:head.y+5/bodyScale, scale:head.width/SANTA_HAT.brimWidth, rotation:head.rotation??0 };
}
