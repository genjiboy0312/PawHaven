import {Assets,Rectangle,Sprite,Texture} from 'pixi.js';
import type {AnimalConfig} from '../animals/AnimalConfig';
import type {PatrolSnake} from './PatrolSnake';
import {COURSE_GROUND} from './TrainingCourse';
export async function loadSnakeTexture():Promise<Texture>{
 const source=await Assets.load<Texture>(import.meta.env.BASE_URL+'assets/enemies/leaf-snake.png');
 // Alpha bounds measured from the approved original, plus two pixels of transparent padding.
 source.source.scaleMode='linear';
 return new Texture({source:source.source,frame:new Rectangle(94,207,1069,904)});
}
export function snakeHeight(config:AnimalConfig){
 const clip=config.animations.idle,frame=clip?.frames[0];
 const body=clip?.bodyBounds?.[0]??frame?.trim??frame?.orig;
 return Math.max(1,(body?.height??180)*config.scale*(clip?.scale??1)*.5);
}
/** Prototype motion uses the approved PNG, without generating another animation sheet. */
export class SnakeView extends Sprite {
 constructor(texture:Texture,private readonly snake:PatrolSnake){super(texture);this.anchor.set(.5,1);this.label='leaf-snake';}
 update(elapsed:number,effects=true){
  const s=this.snake,death=Math.min(1,s.defeatAge/.3),base=s.height/this.texture.height;
  this.visible=!s.defeated||death<1;this.position.set(s.x,COURSE_GROUND);
  const breathe=effects?Math.sin(elapsed*(s.waiting?3:8))*(s.waiting ? .012 : .025):0;
  this.scale.set(s.direction*base*(s.defeated?1+death*.25:1-breathe*.3),base*(s.defeated?1-death*.8:1+breathe));
  this.alpha=s.defeated?1-death:1;
 }
}
