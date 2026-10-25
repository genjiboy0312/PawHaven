import { ColorMatrixFilter, Container, type DestroyOptions, type Filter } from 'pixi.js';
import type { AnimalConfig } from './AnimalConfig';
import type { HitReaction } from '../game/HitReaction';
import { ImpactBurst } from './ImpactBurst';

/** Reuses attack frames; never changes body size, animation or equipment. */
export class HitReactionEffect extends Container {
  private readonly burst: ImpactBurst;
  private readonly bright = new ColorMatrixFilter();
  private readonly baseAlpha: number;
  private readonly baseFilters: Filter[] | null;
  private flashing = false;
  constructor(private readonly target: Container, frames: AnimalConfig['effects']) {
    super(); this.baseAlpha = target.alpha; this.baseFilters = target.filters ? [...target.filters] : null;
    this.burst = new ImpactBurst(frames?.attack); this.burst.position.set(0, -60);
    this.addChild(this.burst);
  }
  update(reaction: HitReaction, effects = true): void {
    const age = reaction.age, flash = effects ? reaction.flash : 0;
    this.target.alpha = this.baseAlpha * (reaction.protected ? effects ? 0.87 + 0.13 * Math.cos(age * Math.PI * 2 / 0.22) : 0.87 : 1);
    if (flash > 0) {
      const white = flash * 0.9, original = 1 - white;
      this.bright.matrix = [original,0,0,0,white, 0,original,0,0,white, 0,0,original,0,white, 0,0,0,1,0];
      if (!this.flashing) { this.target.filters = [...(this.baseFilters ?? []), this.bright]; this.flashing = true; }
    } else if (this.flashing) { this.target.filters = this.baseFilters; this.flashing = false; }
    this.burst.update(age, effects);
  }
  override destroy(options?: DestroyOptions): void {
    if (!this.target.destroyed) { this.target.alpha = this.baseAlpha; this.target.filters = this.baseFilters; }
    this.bright.destroy(); super.destroy(options);
  }
}
