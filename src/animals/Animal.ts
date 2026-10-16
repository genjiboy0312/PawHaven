import { AnimatedSprite, Container } from 'pixi.js';
import type { AnimalAction, AnimalConfig } from './AnimalConfig';

export class Animal extends Container {
  private readonly sprite: AnimatedSprite;
  private action: AnimalAction = 'idle';
  private elapsed = 0;
  private direction = 1;
  private left = 0;
  private right = 0;
  constructor(private readonly config: AnimalConfig) {
    super();
    const idle = config.animations.idle;
    if (!idle) throw new Error('동물에게 idle 애니메이션이 필요합니다.');
    this.sprite = new AnimatedSprite(idle.frames);
    this.sprite.autoUpdate = false;
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(config.scale);
    this.addChild(this.sprite);
    this.label = config.id;
  }
  play(action: AnimalAction): boolean {
    const animation = this.config.animations[action];
    if (!animation) return false;
    if (action === this.action) return true;
    this.action = action;
    this.elapsed = 0;
    this.sprite.textures = animation.frames;
    this.sprite.gotoAndStop(0);
    return true;
  }
  setBounds(width: number, ground: number): void {
    const margin = Math.min(100, width * 0.24);
    this.left = margin;
    this.right = Math.max(margin, width - margin);
    this.x = Math.max(this.left, Math.min(this.right, this.x || width / 2));
    this.y = ground;
  }
  update(seconds: number): void {
    const animation = this.config.animations[this.action];
    if (!animation) return;
    this.elapsed += seconds;
    this.sprite.gotoAndStop(Math.floor(this.elapsed * animation.fps) % animation.frames.length);
    if (this.action === 'walk') {
      this.x += this.direction * this.config.speed * seconds;
      if (this.x >= this.right) { this.x = this.right; this.direction = -1; }
      else if (this.x <= this.left) { this.x = this.left; this.direction = 1; }
      this.sprite.scale.x = this.direction * this.config.scale;
    }
  }
}
