import { t } from '../settings/i18n';
import { AnimatedSprite, Sprite, Text, Rectangle } from 'pixi.js';
import { SpeechBubble } from './SpeechBubble';
import type { AnimalAction, AnimalConfig } from './AnimalConfig';
import type { AnimalVisualState } from './AnimalState';

export class AnimalAnimationController {
  readonly sprite: AnimatedSprite;
  readonly bodyHitArea = new Rectangle(-52, -92, 104, 120);
  restart(): void { this.framePosition = 0; }
  readonly hat: Sprite | undefined;
  readonly sleepMark = new Text({
    text: 'z z',
    style: { fontFamily: 'Georgia, serif', fontSize: 20, fill: '#687b58' },
  });
  readonly welcomeMark = new SpeechBubble();
  private lastAnimation = 'idle';
  private framePosition = 0;

  constructor(private readonly config: AnimalConfig) {
    const idle = config.animations.idle;
    if (!idle?.frames.length) throw new Error('동물에게 idle 애니메이션이 필요합니다.');
    this.sprite = new AnimatedSprite(idle.frames);
    this.sprite.autoUpdate = false;
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(config.scale);
    if (config.wardrobe) {
      this.hat = new Sprite(config.wardrobe.santaHat);
      // The full generated canvas is preserved; anchor is the centre of the brim.
      this.hat.anchor.set(865 / 1536, 730 / 1024);
      this.hat.visible = false;
      this.hat.label = 'santa-hat';
      this.sprite.addChild(this.hat);
    }
    this.sleepMark.anchor.set(0.5);
    this.sleepMark.visible = false;
    this.welcomeMark.visible = false;
  }

  update(state: AnimalVisualState, elapsed: number, direction: number, progress = 0, jumpHeight = 0, seconds = 0, action?: AnimalAction, actionProgress?: number, speech?: { message: string; remaining: number; reaction?: string }): void {
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
    const head = animation.head?.[frame];
    if (this.hat) {
      this.hat.visible = this.config.wardrobe?.outfit.Hat === 1 && !!head;
      if (head) {
        this.hat.position.set(head.x, head.y + 5 / (this.config.scale * (animation.scale ?? 1)));
        this.hat.scale.set(head.width / 550);
        this.hat.rotation = head.rotation ?? 0;
      }
    }
    this.sprite.anchor.set(0.5, animation.anchorY ?? 1);
    const breath = state === 'SLEEP' || state === 'REST' ? 1 + Math.sin(elapsed * 2) * 0.012 : 1;
    const nativeScale = this.config.scale * (animation.scale ?? 1);
    const landing = state === 'LAND' ? 1 - Math.sin(progress * Math.PI) * 0.08 : 1;
    this.sprite.scale.set(direction * nativeScale, nativeScale * breath * landing);
    this.sprite.y = state === 'JUMP' ? -jumpHeight : 0;
    this.sprite.rotation = state === 'NOTICE' ? Math.sin(elapsed * 5) * 0.04 : 0;
    this.sprite.pivot.y = state === 'GREET' ? Math.abs(Math.sin(elapsed * 6)) * 8 : 0;
    // Use opaque body metadata or the tightly trimmed art, never the padded canvas or bubble.
    const texture = this.sprite.texture, rect = texture.trim ?? texture.orig;
    const bounds = animation.bodyBounds?.[frame] ?? {
      x: rect.x - texture.orig.width * this.sprite.anchor.x,
      y: rect.y - texture.orig.height * this.sprite.anchor.y,
      width: rect.width, height: rect.height,
    };
    const cos = Math.cos(this.sprite.rotation), sin = Math.sin(this.sprite.rotation);
    const corners = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
      [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height]]
      .map(([x, y]) => {
        const sx = (x! - this.sprite.pivot.x) * this.sprite.scale.x;
        const sy = (y! - this.sprite.pivot.y) * this.sprite.scale.y;
        return { x: this.sprite.x + sx * cos - sy * sin, y: this.sprite.y + sx * sin + sy * cos };
      });
    const left = Math.min(...corners.map(p => p.x)), right = Math.max(...corners.map(p => p.x));
    const top = Math.min(...corners.map(p => p.y)), bottom = Math.max(...corners.map(p => p.y));
    const width = Math.max(48, right - left), height = Math.max(64, bottom - top);
    this.bodyHitArea.x = (left + right - width) / 2 - 28;
    this.bodyHitArea.y = bottom - height - 28;
    this.bodyHitArea.width = width + 56; this.bodyHitArea.height = height + 56;
    this.sleepMark.visible = state === 'SLEEP';
    this.sleepMark.position.set(32 * direction, -145 - Math.sin(elapsed * 1.5) * 5);
    this.sleepMark.alpha = 0.6 + Math.sin(elapsed * 1.5) * 0.2;
    const message = speech?.message ?? (state === 'NOTICE' ? '!' : state === 'GREET' ? t('greet') : state === 'EMOTE' ? ['♡', '♪', '?'][Math.floor(elapsed * 0.9) % 3] : '');
    this.welcomeMark.present(message, seconds, state === 'GREET', 1.1, speech?.remaining, speech?.reaction);
    const headTop = head ? (head.y - head.width * 0.8) * nativeScale : -125;
    this.welcomeMark.position.set(0, this.sprite.y + headTop - this.welcomeMark.halfHeight - 18 - (state === 'GREET' ? Math.sin(elapsed * 3) * 3 : 0));
  }
}
