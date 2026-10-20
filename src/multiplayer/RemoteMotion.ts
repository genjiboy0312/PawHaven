import type { Pose } from './RoomClient';

/** Short snapshot buffer, bounded prediction, and continuous correction (no distance snap). */
export class RemoteMotion {
  private samples:{pose:Pose;at:number}[]=[];
  private signature='';
  x=120;height=0;
  push(pose:Pose,at:number){
    const signature=JSON.stringify(pose);if(signature===this.signature)return;
    this.signature=signature;
    if(!this.samples.length){this.x=pose.x;this.height=pose.height;}
    this.samples.push({pose:{...pose},at});this.samples=this.samples.slice(-6);
  }
  update(now:number,seconds:number,predict=true){
    const samples=this.samples,last=samples.at(-1);if(!last)return;
    const time=now-60;
    let x=last.pose.x,height=last.pose.height;
    const upper=samples.findIndex(sample=>sample.at>=time);
    if(upper>0){
      const a=samples[upper-1]!,b=samples[upper]!,mix=Math.max(0,Math.min(1,(time-a.at)/Math.max(1,b.at-a.at)));
      x=a.pose.x+(b.pose.x-a.pose.x)*mix;height=a.pose.height+(b.pose.height-a.pose.height)*mix;
    }else if(upper===0){x=samples[0]!.pose.x;height=samples[0]!.pose.height;}
    else if(predict)x+=last.pose.vx*Math.min(0.08,Math.max(0,(time-last.at)/1000));
    const mix=1-Math.exp(-30*Math.max(0,seconds));
    // Bound each correction so a delayed packet cannot teleport the sprite.
    const limit=Math.max(0,seconds)*2200;
    this.x+=Math.max(-limit,Math.min(limit,(x-this.x)*mix));
    const verticalLimit=Math.max(0,seconds)*900;
    this.height+=Math.max(-verticalLimit,Math.min(verticalLimit,(height-this.height)*mix));
  }
}
