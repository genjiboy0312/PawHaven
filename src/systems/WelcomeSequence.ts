export type WelcomeState = 'NOTICE' | 'APPROACH' | 'GREET';
export interface WelcomeConfig {
  noticeSeconds: number;
  greetSeconds: number;
  speedMultiplier: number;
  spawnRatio: number;
  pointRatio: number;
}
export const CORGI_WELCOME: WelcomeConfig = {
  noticeSeconds: 0.85, greetSeconds: 2.4, speedMultiplier: 1.25,
  spawnRatio: 0.16, pointRatio: 0.5,
};

/** One entrance sequence per lobby instance; no timers or renderer dependency. */
export class WelcomeSequence {
  state: WelcomeState | undefined;
  elapsed = 0;
  x = 0;
  direction = 1;
  private started = false;
  private left = 0;
  private right = 0;
  private target = 0;
  get active(): boolean { return this.state !== undefined; }

  constructor(private readonly speed: number, private readonly config: WelcomeConfig = CORGI_WELCOME) {}

  setBounds(left: number, right: number): void {
    this.left = left;
    this.right = right;
    this.target = left + (right - left) * this.config.pointRatio;
    this.x = this.clamp(this.x);
  }
  private clamp(value: number): number { return Math.max(this.left, Math.min(this.right, value)); }
  start(): boolean {
    if (this.started) return false;
    this.started = true;
    this.x = this.left + (this.right - this.left) * this.config.spawnRatio;
    this.enter('NOTICE');
    return true;
  }
  private enter(state: WelcomeState | undefined): void { this.state = state; this.elapsed = 0; }

  update(seconds: number): void {
    if (!this.active || !Number.isFinite(seconds) || seconds <= 0) return;
    this.elapsed += seconds;
    if (this.state === 'NOTICE' && this.elapsed >= this.config.noticeSeconds) this.enter('APPROACH');
    else if (this.state === 'APPROACH') {
      const distance = this.target - this.x;
      if (Math.abs(distance) > 0.001) {
        this.direction = Math.sign(distance);
        this.x = this.clamp(this.x + this.direction * Math.min(Math.abs(distance), this.speed * this.config.speedMultiplier * seconds));
      }
      if (Math.abs(this.target - this.x) <= 0.001) this.enter('GREET');
    } else if (this.state === 'GREET' && this.elapsed >= this.config.greetSeconds) this.enter(undefined);
  }
}
