import { Sprite, Texture } from 'pixi.js';
import { HIT_RULES } from '../game/HitReaction';

/** Shared attack-frame burst for body hits and enemy defeats; textures remain owned by Game. */
export class ImpactBurst extends Sprite {
  constructor(private readonly frames: readonly Texture[] | undefined, private readonly size = 125, private readonly opacity = .55) {
    super(Texture.EMPTY); this.anchor.set(.5); this.visible = false;
  }
  update(age: number, effects = true): void {
    this.visible = effects && Number.isFinite(age) && age >= 0 && age < HIT_RULES.effect && !!this.frames?.length;
    if (!this.visible || !this.frames) return;
    this.texture = this.frames[Math.min(this.frames.length - 1, Math.floor(age / HIT_RULES.effect * this.frames.length))]!;
    this.scale.set(this.size / Math.max(1, this.texture.orig.width));
    this.alpha = this.opacity * (1 - age / HIT_RULES.effect);
  }
}
