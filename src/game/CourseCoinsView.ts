import { Container, Sprite, type Texture } from 'pixi.js';
import type { CoinCollection } from './CourseCoins';
import { COURSE_GROUND } from './TrainingCourse';

/** Shares the approved coin texture; rendering never changes collection state. */
export class CourseCoinsView extends Container {
 constructor(private readonly coins:CoinCollection,texture:Texture){
  super();this.label='course-coins';this.eventMode='none';
  for(const _coin of coins.items){const sprite=new Sprite(texture);sprite.anchor.set(.5);sprite.width=36;sprite.scale.y=sprite.scale.x;this.addChild(sprite);}
  this.update();
 }
 update():void {this.children.forEach((sprite,index)=>{const coin=this.coins.items[index]!;sprite.visible=!coin.collected;sprite.position.set(coin.x,COURSE_GROUND-coin.height);});}
}
