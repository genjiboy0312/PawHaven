import { COURSES, type CourseId } from './CourseCatalog';
import type { CourseSolid } from './TrainingCourse';

export interface CoinPlacement {readonly x:number;readonly height:number;readonly solid?:number}
/** World centres; solid-bound coordinates are offsets from that platform. */
export const COURSE_COINS:Record<CourseId,readonly CoinPlacement[]>={
 practice:[{x:280,height:110},{x:620,height:110},{x:1000,height:36},{x:1250,height:115},{x:1530,height:36},{x:1920,height:120},{x:2310,height:36}],
 garden:[{x:260,height:36},{x:500,height:115},{x:1000,height:36},{x:1550,height:130},{x:2140,height:36},{x:2730,height:36},{x:3500,height:120},{x:4300,height:36},{x:5000,height:115},{x:6100,height:36}],
 forest:[{x:420,height:115},{x:850,height:120},{x:1530,height:115},{x:2100,height:36},{x:2750,height:36},{x:4410,height:65},{x:4720,height:90},{x:5300,height:36},{x:6800,height:36},{x:8500,height:36},{x:9850,height:36}],
 crossroads:[{x:300,height:36},{x:700,height:102},{x:990,height:162},{x:1420,height:192},{x:150,height:42,solid:4},{x:2460,height:192},{x:1600,height:36},{x:2200,height:36},{x:3200,height:36},{x:3870,height:162},{x:4360,height:192},{x:4840,height:192},{x:5350,height:36}],
};
export const courseCoinLimit = (map: CourseId): number => COURSE_COINS[map].length + COURSES[map].targets.length;
export const MAX_COURSE_COINS = Math.max(...Object.keys(COURSE_COINS).map(map => courseCoinLimit(map as CourseId)));
export class CourseCoin {
 collected=false;
 constructor(private readonly placement:CoinPlacement,private readonly course:readonly CourseSolid[],readonly box?:{x:number;broken:boolean}){}
 get x():number{return this.placement.x+(this.placement.solid===undefined?0:this.course[this.placement.solid]!.x);}
 get height():number{return this.placement.height+(this.placement.solid===undefined?0:this.course[this.placement.solid]!.top);}
}
/** Local run progress only; has no wallet, persistence or reward dependency. */
export class CoinCollection {
 readonly items:CourseCoin[];
 private count=0;
 constructor(placements:readonly CoinPlacement[],course:readonly CourseSolid[],boxes:readonly {x:number;broken:boolean}[]=[]){this.items=[...placements.map(p=>new CourseCoin(p,course)),...boxes.map(box=>new CourseCoin({x:box.x,height:58},course,box))];}
 get collected():number{return this.count;}
 collect(x:number,height:number,halfWidth:number,bodyHeight:number):void {
  for(const coin of this.items)if(!coin.collected&&(coin.box?coin.box.broken:Math.abs(coin.x-x)<=halfWidth+14&&height<=coin.height+14&&height+bodyHeight>=coin.height-14)){coin.collected=true;this.count++;}
 }
}
