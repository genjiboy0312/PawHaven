import { AnimatedSprite, Text } from 'pixi.js';
import type { AnimalConfig } from './AnimalConfig';
import type { AnimalState } from './AnimalState';

export class AnimalAnimationController {
  readonly sprite: AnimatedSprite;
  readonly sleepMark = new Text({
    text: 'z z',
    style: { fontFamily: 'Georgia, serif', fontSize: 20, fill: '#687b58' },
  });
  private lastState: AnimalState = 'IDLE';

  constructor(private readonly config: AnimalConfig) {
    const idle = config.animations.idle;
    if (!idle?.frames.length) throw new Error('동물에게 idle 애니메이션이 필요합니다.');
    this.sprite = new AnimatedSprite(idle.frames);
    this.sprite.autoUpdate = false;
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(config.scale);
    this.sleepMark.anchor.set(0.5);
    this.sleepMark.visible = false;
  }

  update(state: AnimalState, elapsed: number, direction: number): void {
    const animation = this.config.animations[state === 'WANDER' ? 'walk' : 'idle'];
    if (!animation) return;
    if (state !== this.lastState) {
      this.sprite.textures = animation.frames;
      this.lastState = state;
    }
    // Dedicated rest/sleep/observe art will replace these explicit prototype expressions.
    const frame = state === 'SLEEP' ? Math.min(5, animation.frames.length - 1)
      : state === 'REST' ? Math.min(3, animation.frames.length - 1)
      : state === 'OBSERVE' ? 0
      : Math.floor(elapsed * animation.fps) % animation.frames.length;
    this.sprite.gotoAndStop(frame);
    const breath = state === 'SLEEP' || state === 'REST' ? 1 + Math.sin(elapsed * 2) * 0.012 : 1;
    this.sprite.scale.set(direction * this.config.scale, this.config.scale * breath);
    this.sleepMark.visible = state === 'SLEEP';
    this.sleepMark.position.set(32 * direction, -145 - Math.sin(elapsed * 1.5) * 5);
    this.sleepMark.alpha = 0.6 + Math.sin(elapsed * 1.5) * 0.2;
  }
}
