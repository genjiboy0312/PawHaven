import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { CourseTime } from './CourseBackgrounds';
import { PLAY_ZOOM } from './PlayCamera';

/** Decoration in the upper sky only; no physics, player-relative positioning or network state. */
export class SkyClouds extends Container {
  readonly clouds: readonly Sprite[];
  private readonly placements = [
    { x:90, y:4, width:280, parallax:.18 },
    { x:490, y:52, width:230, parallax:.24 },
    { x:900, y:22, width:300, parallax:.30 },
  ] as const;
  constructor(texture: Texture, time: CourseTime) {
    super(); this.label = 'sky-clouds'; this.eventMode = 'none';
    const clip = new Graphics().rect(0,0,960,132).fill(0xffffff);
    this.addChild(clip); this.mask = clip;
    const tint = {morning:0xffeedc,noon:0xffffff,sunset:0xf4bbab,night:0x9aaed4,cherry:0xffe2ed}[time];
    this.clouds = this.placements.map(p => {
      const cloud = new Sprite(texture); cloud.width = p.width; cloud.scale.y = cloud.scale.x;
      cloud.y = p.y; cloud.tint = tint; cloud.alpha = time==='night'?.4:.58;
      this.addChild(cloud); return cloud;
    });
    this.update(0);
  }
  update(cameraX: number): void {
    const camera = Number.isFinite(cameraX) ? Math.max(0,cameraX) : 0;
    this.clouds.forEach((cloud,index) => {
      const p = this.placements[index]!, span = 960 + p.width + 80;
      const x = p.x - camera * PLAY_ZOOM * p.parallax;
      cloud.x = ((x + p.width) % span + span) % span - p.width;
    });
  }
}
