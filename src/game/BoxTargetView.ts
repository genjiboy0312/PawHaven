import { Container, Sprite, type Texture } from 'pixi.js';
import { ImpactBurst } from '../animals/ImpactBurst';

/** Observes the existing broken flag; never changes attack rules or shared art. */
export class BoxTargetView extends Container {
  readonly body:Sprite;
  private readonly burst:ImpactBurst;
  private age=-1;
  private readonly baseScale:number;
  constructor(private readonly target:{broken:boolean},texture:Texture,attackFrames?:readonly Texture[]){
    super();this.label='box-target';this.body=new Sprite(texture);this.body.anchor.set(.5,1);
    this.baseScale=48/texture.height;this.body.scale.set(this.baseScale);
    this.burst=new ImpactBurst(attackFrames,70,.6);this.burst.y=-24;
    this.addChild(this.body,this.burst);
  }
  update(seconds:number,effects=true):void {
    if(!this.target.broken)this.age=-1;
    else this.age=this.age<0?0:this.age+(Number.isFinite(seconds)?Math.max(0,seconds):0);
    const fade=this.age<0?0:Math.max(0,Math.min(1,(this.age-.08)/.22));
    this.visible=this.age<.3;this.body.alpha=1-fade;
    this.body.x=effects&&this.age>=0&&this.age<.08?Math.sin(this.age*110)*3*(1-this.age/.08):0;
    this.body.scale.set(this.baseScale*(effects?1-fade*.55:1));
    this.burst.update(this.age,effects);
  }
}
