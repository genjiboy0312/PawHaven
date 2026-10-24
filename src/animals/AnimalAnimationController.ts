import { t } from '../settings/i18n';
import { AnimatedSprite, Sprite, Text, Rectangle } from 'pixi.js';
import { SpeechBubble } from './SpeechBubble';
import type { AnimalAction, AnimalConfig } from './AnimalConfig';
import type { AnimalVisualState } from './AnimalState';
import { wornLayers } from './Wearables';

export class AnimalAnimationController {
  readonly sprite: AnimatedSprite;
  readonly bodyHitArea = new Rectangle(-88, -136, 176, 176);
  restart(): void { this.framePosition = 0; }
  readonly hat: Sprite | undefined;
  readonly accessory: Sprite | undefined;
  readonly sleepMark = new Text({
    text: 'z z',
    style: { fontFamily: 'Georgia, serif', fontSize: 20, fill: '#687b58' },
  });
  readonly welcomeMark = new SpeechBubble();
  private readonly touchBounds: Rectangle;
  private lastAnimation = 'idle';
  private framePosition = 0;

  constructor(private readonly config: AnimalConfig) {
    const idle = config.animations.idle;
    if (!idle?.frames.length) throw new Error('동물에게 idle 애니메이션이 필요합니다.');
    // One full-body rectangle across all clips and both directions; no pixel holes
    // or shrinking target when an animation frame changes.
    const personalPet = config.id === 'myeongrang';
    let halfWidth = (personalPet ? 120 : 80) / 2, top = -(personalPet ? 128 : 96), bottom = 0;
    for (const clip of Object.values(config.animations)) {
      const scale = config.scale * (clip.scale ?? 1);
      clip.frames.forEach((texture, frame) => {
        const rect = texture.trim ?? texture.orig;
        const body = clip.bodyBounds?.[frame] ?? {
          x: rect.x - texture.orig.width * 0.5, y: rect.y - texture.orig.height * (clip.anchorY ?? 1),
          width: rect.width, height: rect.height,
        };
        halfWidth = Math.max(halfWidth, Math.abs(body.x * scale), Math.abs((body.x + body.width) * scale));
        top = Math.min(top, body.y * scale); bottom = Math.max(bottom, (body.y + body.height) * scale);
      });
    }
    const padding = personalPet ? 56 : 40;
    this.touchBounds = new Rectangle(-halfWidth - padding, top - padding, (halfWidth + padding) * 2, bottom - top + padding * 2);
    this.bodyHitArea.copyFrom(this.touchBounds);
    this.sprite = new AnimatedSprite(idle.frames);
    this.sprite.autoUpdate = false;
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(config.scale);
    if (config.wardrobe) {
      this.hat = new Sprite(config.wardrobe.santaHat);
      // The full generated canvas is preserved; anchor is the centre of the brim.
      this.hat.visible = false;
      this.hat.label = 'santa-hat';
      this.sprite.addChild(this.hat);
      this.accessory=new Sprite(config.wardrobe.bowTie??config.wardrobe.santaHat);
      this.accessory.visible=false;this.accessory.label='bow-tie';this.sprite.addChild(this.accessory);
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
    if(this.hat)this.hat.visible=false;
    if(this.accessory)this.accessory.visible=false;
    if(this.config.wardrobe)for(const {item,texture,pose}of wornLayers(this.config,this.config.wardrobe.outfit,animation,frame)){
      const layer=item.category==='Hat'?this.hat:this.accessory;if(!layer)continue;
      layer.visible=true;layer.texture=texture;layer.label=item.texture;
      layer.anchor.set(item.anchorX,item.anchorY);layer.position.set(pose.x,pose.y);layer.scale.set(pose.scale);layer.rotation=pose.rotation;
    }
    this.sprite.anchor.set(0.5, animation.anchorY ?? 1);
    const breath = state === 'SLEEP' || state === 'REST' ? 1 + Math.sin(elapsed * 2) * 0.012 : 1;
    const nativeScale = this.config.scale * (animation.scale ?? 1);
    const landing = state === 'LAND' ? 1 - Math.sin(progress * Math.PI) * 0.08 : 1;
    this.sprite.scale.set(direction * nativeScale, nativeScale * breath * landing);
    this.sprite.y = state === 'JUMP' ? -jumpHeight : 0;
    this.sprite.rotation = state === 'NOTICE' ? Math.sin(elapsed * 5) * 0.04 : 0;
    this.sprite.pivot.y = state === 'GREET' ? Math.abs(Math.sin(elapsed * 6)) * 8 : 0;
    this.bodyHitArea.copyFrom(this.touchBounds);
    this.bodyHitArea.y += this.sprite.y;
    this.sleepMark.visible = state === 'SLEEP';
    this.sleepMark.position.set(32 * direction, -145 - Math.sin(elapsed * 1.5) * 5);
    this.sleepMark.alpha = 0.6 + Math.sin(elapsed * 1.5) * 0.2;
    const message = speech?.message ?? (state === 'NOTICE' ? '!' : state === 'GREET' ? t('greet') : state === 'EMOTE' ? ['♡', '♪', '?'][Math.floor(elapsed * 0.9) % 3] : '');
    this.welcomeMark.present(message, seconds, state === 'GREET', 1.1, speech?.remaining, speech?.reaction);
    const headTop = head ? (head.y - head.width * 0.8) * nativeScale : -125;
    this.welcomeMark.position.set(0, this.sprite.y + headTop - this.welcomeMark.halfHeight - 18 - (state === 'GREET' ? Math.sin(elapsed * 3) * 3 : 0));
  }
}
