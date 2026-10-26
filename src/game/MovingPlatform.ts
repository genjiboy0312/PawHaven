import type { CourseSolid } from './TrainingCourse';

/** Per-run geometry; absolute race time avoids accumulated drift or position broadcasts. */
export class MovingPlatform {
  readonly solid: Omit<CourseSolid,'x'> & {x:number};
  delta = 0;
  constructor(private readonly source: CourseSolid) {
    const motion=source.motion;
    if(!motion||!Number.isFinite(motion.distance)||motion.distance<0||!Number.isFinite(motion.period)||motion.period<=0)throw Error('invalid_platform_motion');
    this.solid={...source};
  }
  update(time:number):void {
    const {distance,period}=this.source.motion!;
    const seconds=Number.isFinite(time)?Math.max(0,time):0;
    const next=this.source.x+Math.sin((seconds%period)/period*Math.PI*2)*distance;
    this.delta=next-this.solid.x;this.solid.x=next;
  }
}
