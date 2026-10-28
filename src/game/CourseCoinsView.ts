import { Container, Sprite, type Texture } from 'pixi.js';
import type { CoinCollection } from './CourseCoins';
import { COURSE_GROUND } from './TrainingCourse';

/** Shares the approved coin texture; rendering never changes collection state. */
export class CourseCoinsView extends Container {
 private readonly ages:number[];
 private readonly baseScale:number;
 constructor(private readonly coins:CoinCollection,texture:Texture,private readonly onCollect?:()=>void){
  super();this.label='course-coins';this.eventMode='none';
  this.ages=coins.items.map(coin=>coin.collected?.5:-1);this.baseScale=36/texture.width;
  for(const _coin of coins.items){const sprite=new Sprite(texture);sprite.anchor.set(.5);sprite.width=36;sprite.scale.y=sprite.scale.x;this.addChild(sprite);}
  this.update();
 }
 update(seconds=0,effects=true,player?:{x:number;height:number}):void {
  const delta=Number.isFinite(seconds)?Math.max(0,seconds):0;let picked=false;
  this.children.forEach((child,index)=>{
   const sprite=child as Sprite,coin=this.coins.items[index]!;sprite.position.set(coin.x,COURSE_GROUND-coin.height);sprite.alpha=1;sprite.scale.set(this.baseScale);
   if(!coin.collected){this.ages[index]=-1;sprite.visible=!coin.box;return;}
   if(this.ages[index]!<0){this.ages[index]=0;picked=true;}else this.ages[index]=this.ages[index]!+delta;
   const age=this.ages[index]!;sprite.visible=!!coin.box&&effects&&age<.5;
   if(sprite.visible){
    const pop=Math.min(1,age/.18),pull=Math.max(0,Math.min(1,(age-.18)/.32)),ease=pull*pull;
    const top=COURSE_GROUND-coin.height-Math.sin(pop*Math.PI/2)*44;
    sprite.x=coin.x+((player?.x??coin.x)-coin.x)*ease;sprite.y=top+((COURSE_GROUND-(player?.height??0)-45)-top)*ease;
    sprite.alpha=1-pull;sprite.scale.set(this.baseScale*(1-.45*pull));
   }
  });
  if(picked)this.onCollect?.();
 }
}
