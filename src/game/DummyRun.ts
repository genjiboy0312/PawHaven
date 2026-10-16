import type { AnimalAction } from '../animals/AnimalConfig';
/** Ten seconds from start to finish at normal speed. */
export class DummyRun {
  readonly speed = 240;
  readonly start = 120;
  readonly finish = 2520;
  x = this.start;
  height = 0;
  direction = 1;
  velocity = 0;
  horizontalVelocity = 0;
  dash = 0;
  dashCooldown = 0;
  attack = 0;
  land = 0;
  readonly attackDuration = 0.48;
  readonly dashDuration = 0.32;
  victoryTime = -1;
  get won(): boolean { return this.victoryTime >= 0; }
  get returnReady(): boolean { return this.victoryTime >= 1.9; }
  get fade(): number { return Math.max(0, Math.min(1, (this.victoryTime - 1.5) / 0.4)); }
  jump(): void { if (!this.won && this.height === 0 && this.velocity === 0 && this.dash === 0) this.velocity = 440; }
  startDash(): void {
    if (!this.won && this.height === 0 && this.velocity === 0 && this.attack === 0 && this.dashCooldown <= 0) { this.horizontalVelocity = this.direction * 1100; this.dash = this.dashDuration; this.dashCooldown = 0.8; }
  }
  startAttack(): void { if (!this.won && this.dash === 0 && this.attack === 0) this.attack = this.attackDuration; }
  action(axis: number): AnimalAction {
    if (this.won) return 'idle';
    if (this.attack > 0) return 'attack';
    if (this.dash > 0) return 'skill';
    if (this.height > 0 || this.velocity > 0) return this.velocity > 0 ? 'jump' : 'fall';
    if (this.land > 0) return 'land';
    return axis ? 'run' : 'idle';
  }
  update(seconds: number, axis: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    if (this.won) { this.victoryTime += seconds; return; }
    const input = Math.max(-1, Math.min(1, axis));
    if (input && this.dash === 0 && this.attack === 0) this.direction = Math.sign(input);
    let distance: number;
    if (this.dash > 0) {
      const burstTime = Math.min(seconds, this.dash);
      const decay = Math.exp(-3.8 * burstTime);
      distance = this.horizontalVelocity * (1 - decay) / 3.8 + input * this.speed * (seconds - burstTime);
      this.horizontalVelocity *= decay;
    } else {
      this.horizontalVelocity = input * this.speed;
      distance = this.horizontalVelocity * seconds;
    }
    this.x = Math.max(this.start, Math.min(this.finish, this.x + distance));
    this.dash = Math.max(0, this.dash - seconds);
    this.dashCooldown = Math.max(0, this.dashCooldown - seconds);
    this.attack = Math.max(0, this.attack - seconds);
    this.land = Math.max(0, this.land - seconds);
    if (this.height > 0 || this.velocity > 0) {
      this.height = Math.max(0, this.height + this.velocity * seconds - 490 * seconds * seconds);
      this.velocity -= 980 * seconds;
      if (this.height === 0) { this.velocity = 0; this.land = 0.16; }
    }
    if (this.x >= this.finish) { this.victoryTime = 0; this.height = 0; this.velocity = 0; this.horizontalVelocity = 0; }
  }
}