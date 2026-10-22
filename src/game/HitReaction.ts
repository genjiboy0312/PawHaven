/** A hit already validated by the future competitive match authority. */
export interface PlayerHit { sequence: number; direction: -1 | 1 }
export const HIT_RULES = Object.freeze({ protection: 1.2, flash: 0.12, effect: 0.22, pushTime: 0.32, distance: 64, decay: 12 });

/** Optional component; no timers, input lock, renderer or network dependency. */
export class HitReaction {
  private remaining = 0;
  private pushRemaining = 0;
  private speed = 0;
  private lastSequence = -1;
  constructor(readonly enabled = false) {}
  get protected(): boolean { return this.remaining > 0; }
  get protectionRemaining(): number { return this.remaining; }
  get age(): number { return this.protected ? HIT_RULES.protection - this.remaining : Infinity; }
  get flash(): number { return Math.max(0, 1 - this.age / HIT_RULES.flash); }
  get velocity(): number { return this.speed; }
  receive(hit: PlayerHit): boolean {
    if (!this.enabled || !Number.isSafeInteger(hit.sequence) || hit.sequence < 0 || hit.sequence <= this.lastSequence || (hit.direction !== -1 && hit.direction !== 1)) return false;
    this.lastSequence = hit.sequence;
    if (this.protected) return false;
    this.remaining = HIT_RULES.protection;
    this.pushRemaining = HIT_RULES.pushTime;
    this.speed = hit.direction * HIT_RULES.distance * HIT_RULES.decay;
    return true;
  }
  advance(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    this.remaining = Math.max(0, this.remaining - seconds);
    const time = Math.min(seconds, this.pushRemaining), decay = Math.exp(-HIT_RULES.decay * time);
    const distance = this.speed * (1 - decay) / HIT_RULES.decay;
    this.pushRemaining = Math.max(0, this.pushRemaining - seconds);
    this.speed = this.pushRemaining > 0 ? this.speed * decay : 0;
    return distance;
  }
  stopPush(): void { this.speed = this.pushRemaining = 0; }
  /** Respawn clears the reaction but keeps the fence against delayed old hits. */
  reset(): void { this.remaining = 0; this.stopPush(); }
}
