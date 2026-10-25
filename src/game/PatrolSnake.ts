import type {CourseId} from './CourseCatalog';
export interface SnakePatrol {left:number;right:number}
export const COURSE_SNAKES:Record<CourseId,readonly SnakePatrol[]>={
 garden:[{left:300,right:540}],practice:[{left:220,right:430}],
 forest:[{left:300,right:500},{left:830,right:1030},{left:1510,right:1710}]
};
/** Local enemy component; its state belongs to one run, never the shared course definition. */
export class PatrolSnake {
 x:number;direction:1|-1=1;waiting=0;defeated=false;defeatAge=0;
 readonly speed=34;
 private elapsed=0;
 get halfWidth(){return this.height*.55;}
 constructor(readonly patrol:SnakePatrol,readonly height=60){this.x=(patrol.left+patrol.right)/2;}
 defeat(){if(this.defeated)return;this.defeated=true;this.defeatAge=0;}
 update(seconds:number,elapsed?:number){
  if(!Number.isFinite(seconds)||seconds<=0)return;
  if(this.defeated){this.defeatAge+=seconds;return;}
  this.elapsed=Number.isFinite(elapsed)?Math.max(0,elapsed!):this.elapsed+seconds;
  // Absolute race time gives every client the same patrol, including after recovery.
  const travel=(this.patrol.right-this.patrol.left)/this.speed,pause=.5;
  const phase=(this.elapsed+travel/2)%(2*(travel+pause));
  if(phase<travel){this.x=this.patrol.left+phase*this.speed;this.direction=1;this.waiting=0;}
  else if(phase<travel+pause){this.x=this.patrol.right;this.direction=-1;this.waiting=travel+pause-phase;}
  else if(phase<2*travel+pause){this.x=this.patrol.right-(phase-travel-pause)*this.speed;this.direction=-1;this.waiting=0;}
  else{this.x=this.patrol.left;this.direction=1;this.waiting=2*(travel+pause)-phase;}
 }
}
