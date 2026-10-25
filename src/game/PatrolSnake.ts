import type {CourseId} from './CourseCatalog';
export interface SnakePatrol {left:number;right:number}
export const SINGLE_SNAKES:Record<CourseId,readonly SnakePatrol[]>={
 garden:[{left:300,right:540}],practice:[{left:220,right:430}],forest:[{left:300,right:500}]
};
/** Local enemy component; its state belongs to one run, never the shared course definition. */
export class PatrolSnake {
 x:number;direction:1|-1=1;waiting=0;defeated=false;defeatAge=0;
 readonly speed=34;
 get halfWidth(){return this.height*.55;}
 constructor(readonly patrol:SnakePatrol,readonly height=60){this.x=(patrol.left+patrol.right)/2;}
 defeat(){if(this.defeated)return;this.defeated=true;this.defeatAge=0;}
 update(seconds:number){
  if(!Number.isFinite(seconds)||seconds<=0)return;
  if(this.defeated){this.defeatAge+=seconds;return;}
  if(this.waiting>0){this.waiting=Math.max(0,this.waiting-seconds);return;}
  this.x=Math.max(this.patrol.left,Math.min(this.patrol.right,this.x+this.direction*this.speed*seconds));
  if(this.x===this.patrol.right||this.x===this.patrol.left){this.direction=this.x===this.patrol.right?-1:1;this.waiting=.5;}
 }
}
