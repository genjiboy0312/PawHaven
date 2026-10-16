import { AnimatedSprite, Text } from 'pixi.js';
import type { AnimalConfig } from './AnimalConfig';
import type { AnimalVisualState } from './AnimalState';

export class AnimalAnimationController {
  readonly sprite: AnimatedSprite;
  readonly sleepMark = new Text({
    text: 'z z',
    style: { fontFamily: 'Georgia, serif', fontSize: 20, fill: '#687b58' },
  });
  readonly welcomeMark = new Text({
    text: '',
    style: { fontFamily: 'system-ui, sans-serif', fontSize: 18, fontWeight: '600', fill: '#765536' },
  });
  private lastState: AnimalVisualState = 'IDLE';

  constructor(private readonly config: AnimalConfig) {
    const idle = config.animations.idle;
    if (!idle?.frames.length) throw new Error('동물에게 idle 애니메이션이 필요합니다.');
    this.sprite = new AnimatedSprite(idle.frames);
    this.sprite.autoUpdate = false;
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(config.scale);
    this.sleepMark.anchor.set(0.5);
    this.sleepMark.visible = false;
    this.welcomeMark.anchor.set(0.5);
    this.welcomeMark.visible = false;
  }

  update(state: AnimalVisualState, elapsed: number, direction: number, progress = 0, jumpHeight = 0): void {
    const moving = state === 'WANDER' || state === 'APPROACH';
    const key = state === 'JUMP' || state === 'LAND' ? 'jump' : state === 'EMOTE' ? 'emote' : moving ? 'walk' : 'idle';
    const animation = this.config.animations[key] ?? this.config.animations.idle;
    if (!animation) return;
    if (state !== this.lastState) {
      this.sprite.textures = animation.frames;
      this.lastState = state;
    }
    // Dedicated rest, sleep and greeting art can replace these prototype expressions.
    const fps = animation.fps * (state === 'APPROACH' ? 1.25 : state === 'GREET' ? 1.6 : 1);
    const frame = state === 'JUMP' ? Math.min(Math.floor(progress * 6), Math.min(5, animation.frames.length - 1))
      : state === 'LAND' ? Math.min(6 + Math.floor(progress * 2), animation.frames.length - 1)
      : state === 'SLEEP' ? Math.min(5, animation.frames.length - 1)
      : state === 'REST' ? Math.min(3, animation.frames.length - 1)
      : state === 'OBSERVE' ? 0
      : Math.floor(elapsed * fps) % animation.frames.length;
    this.sprite.gotoAndStop(frame);
    const breath = state === 'SLEEP' || state === 'REST' ? 1 + Math.sin(elapsed * 2) * 0.012 : 1;
    const nativeScale = this.config.scale * (animation.scale ?? 1);
    const landing = state === 'LAND' ? 1 - Math.sin(progress * Math.PI) * 0.08 : 1;
    this.sprite.scale.set(direction * nativeScale, nativeScale * breath * landing);
    this.sprite.y = state === 'JUMP' ? -jumpHeight : 0;
    this.sprite.rotation = state === 'NOTICE' ? Math.sin(elapsed * 5) * 0.04 : 0;
    this.sprite.pivot.y = state === 'GREET' ? Math.abs(Math.sin(elapsed * 6)) * 8 : 0;
    this.sleepMark.visible = state === 'SLEEP';
    this.sleepMark.position.set(32 * direction, -145 - Math.sin(elapsed * 1.5) * 5);
    this.sleepMark.alpha = 0.6 + Math.sin(elapsed * 1.5) * 0.2;
    this.welcomeMark.visible = state === 'NOTICE' || state === 'GREET' || state === 'EMOTE';
    this.welcomeMark.text = state === 'NOTICE' ? '!' : state === 'GREET' ? '반가워! ♡' : state === 'EMOTE' ? ['♡', '♪', '?'][Math.floor(elapsed * 0.9) % 3] : '';
    this.welcomeMark.position.set(0, -155 - (state === 'GREET' ? Math.sin(elapsed * 3) * 3 : 0));
  }
}
