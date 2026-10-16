import { t } from '../settings/i18n';
import { AnimatedSprite, Text } from 'pixi.js';
import type { AnimalAction, AnimalConfig } from './AnimalConfig';
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
  private lastAnimation = 'idle';
  private framePosition = 0;

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

  update(state: AnimalVisualState, elapsed: number, direction: number, progress = 0, jumpHeight = 0, seconds = 0, action?: AnimalAction, actionProgress?: number): void {
    const moving = state === 'WANDER' || state === 'APPROACH';
    const key = action ?? (state === 'JUMP' || state === 'LAND' ? 'jump' : state === 'EMOTE' ? 'emote' : moving ? 'walk' : 'idle');
    const animation = this.config.animations[key] ?? this.config.animations.idle;
    if (!animation) return;
    if (key !== this.lastAnimation) {
      this.sprite.textures = animation.frames;
      this.lastAnimation = key;
      this.framePosition = 0;
    }
    // Dedicated rest, sleep and greeting art can replace these prototype expressions.
    const pace = state === 'SLEEP' ? 0.35 : state === 'REST' ? 0.6
      : state === 'OBSERVE' ? 0.8 : state === 'APPROACH' ? 1.25 : state === 'GREET' ? 1.6 : 1;
    // Behavior timers reset on every state change; clip playback owns a separate clock.
    if (Number.isFinite(seconds) && seconds > 0) {
      this.framePosition = (this.framePosition + seconds * animation.fps * pace) % animation.frames.length;
    }
    const airborneFrames = animation.frames.length >= 8 ? 6 : Math.max(1, animation.frames.length - 1);
    const frame = actionProgress !== undefined ? Math.min(animation.frames.length - 1, Math.floor(Math.max(0, actionProgress) * animation.frames.length))
      : action ? Math.floor(this.framePosition)
      : state === 'JUMP' ? Math.min(Math.floor(progress * airborneFrames), airborneFrames - 1)
      : state === 'LAND' ? Math.min(airborneFrames + Math.floor(progress * (animation.frames.length - airborneFrames)), animation.frames.length - 1)
      : Math.floor(this.framePosition);
    this.sprite.gotoAndStop(frame);
    this.sprite.anchor.set(0.5, animation.anchorY ?? 1);
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
    this.welcomeMark.text = state === 'NOTICE' ? '!' : state === 'GREET' ? t('greet') : state === 'EMOTE' ? ['♡', '♪', '?'][Math.floor(elapsed * 0.9) % 3] : '';
    this.welcomeMark.position.set(0, -155 - (state === 'GREET' ? Math.sin(elapsed * 3) * 3 : 0));
  }
}
