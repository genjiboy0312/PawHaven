import {Assets,Rectangle,Sprite,Texture} from 'pixi.js';
import type {AnimalConfig} from '../animals/AnimalConfig';
import type {PatrolSnake} from './PatrolSnake';
import {COURSE_GROUND} from './TrainingCourse';
interface SnakeFrame {x:number;y:number;width:number;height:number;center:number;baseline:number}
export interface SnakeManifest {version:1;imageWidth:number;imageHeight:number;logicalWidth:number;logicalHeight:number;foot:number;visibleHeight:number;move:SnakeFrame[];tongue:SnakeFrame[]}
export interface SnakeArt {move:Texture[];tongue:Texture[];visibleHeight:number;anchorY:number}
export function createSnakeArt(source:Texture,map:SnakeManifest):SnakeArt{
 if(map.version!==1||source.width!==map.imageWidth||source.height!==map.imageHeight||map.logicalWidth!==512||map.logicalHeight!==384||map.foot!==360||!Number.isFinite(map.visibleHeight)||map.visibleHeight<=0||map.visibleHeight>map.foot||map.move?.length!==4||map.tongue?.length!==4)throw Error('invalid_snake_atlas');
 const all=[...map.move,...map.tongue];
 for(const f of all){const x=map.logicalWidth/2-(f.center-f.x),y=map.foot-(f.baseline-f.y);
  if(![f.x,f.y,f.width,f.height,f.center,f.baseline].every(Number.isFinite)||f.x<0||f.y<0||f.width<=0||f.height<=0||f.height>map.visibleHeight||f.x+f.width>source.width||f.y+f.height>source.height||f.baseline!==f.y+f.height||x<0||y<0||x+f.width>map.logicalWidth||y+f.height>map.logicalHeight)throw Error('invalid_snake_frame');
 }
 source.source.scaleMode='linear';
 const frames=(items:SnakeFrame[])=>items.map(f=>new Texture({source:source.source,frame:new Rectangle(f.x,f.y,f.width,f.height),orig:new Rectangle(0,0,map.logicalWidth,map.logicalHeight),trim:new Rectangle(map.logicalWidth/2-(f.center-f.x),map.foot-(f.baseline-f.y),f.width,f.height)}));
 return {move:frames(map.move),tongue:frames(map.tongue),visibleHeight:map.visibleHeight,anchorY:map.foot/map.logicalHeight};
}
export async function loadSnakeArt():Promise<SnakeArt>{
 const base=import.meta.env.BASE_URL+'assets/enemies/';
 const [source,map]=await Promise.all([Assets.load<Texture>(base+'leaf-snake-animation.png'),Assets.load<SnakeManifest>(base+'leaf-snake-frames.json')]);
 return createSnakeArt(source,map);
}
export function snakeFrame(elapsed:number,waiting=false,defeated=false):{clip:'move'|'tongue';index:number}{
 const time=Number.isFinite(elapsed)?Math.max(0,elapsed):0,cycle=time%3.6;
 if(defeated)return {clip:'tongue',index:0};
 if(cycle>=2.8&&cycle<3.4)return {clip:'tongue',index:[0,1,2,3,1,0][Math.min(5,Math.floor((cycle-2.8)*10))]!};
 return waiting?{clip:'tongue',index:0}:{clip:'move',index:Math.floor(time*6)%4};
}
export function snakeHeight(config:AnimalConfig){
 const clip=config.animations.idle,frame=clip?.frames[0];
 const body=clip?.bodyBounds?.[0]??frame?.trim??frame?.orig;
 return Math.max(1,(body?.height??180)*config.scale*(clip?.scale??1)*.5);
}
/** Shared atlas, stable logical canvas/foot and scale across wriggle and tongue clips. */
export class SnakeView extends Sprite {
 constructor(private readonly art:SnakeArt,private readonly snake:PatrolSnake){super(art.move[0]!);this.anchor.set(.5,art.anchorY);this.label='leaf-snake';}
 update(elapsed:number,effects=true){
  const s=this.snake,death=Math.min(1,s.defeatAge/.3),base=s.height/this.art.visibleHeight;
  const frame=snakeFrame(elapsed,s.waiting>0,s.defeated);this.texture=this.art[frame.clip][frame.index]!;
  this.visible=!s.defeated||death<1;this.position.set(s.x,COURSE_GROUND);
  this.scale.set(s.direction*base*(s.defeated&&effects?1+death*.25:1),base*(s.defeated&&effects?1-death*.8:1));
  this.alpha=s.defeated?1-death:1;
 }
}
