import type { AnimalAction } from '../animals/AnimalConfig';
import { TRAINING_COURSE, type CourseSolid } from './TrainingCourse';
/** About ten seconds of running distance, plus jumps and any retries. */
export class DummyRun {
  readonly speed = 240;
  readonly start = 120;
  readonly finish = 2520;
  readonly halfWidth = 24;
  readonly bodyHeight = 90;
  x = this.start;
  height = 0;
  direction = 1;
  velocity = 0;
  horizontalVelocity = 0;
  dash = 0;
  dashCooldown = 0;
  attack = 0;
  land = 0;
  respawns = 0;
  readonly attackDuration = 0.48;
  readonly dashDuration = 0.32;
  victoryTime = -1;
  constructor(readonly course: readonly CourseSolid[] = TRAINING_COURSE) {}
  private overlaps(solid: CourseSolid, x = this.x): boolean {
    return x + this.halfWidth > solid.x + 0.000001 && x - this.halfWidth < solid.x + solid.width - 0.000001;
  }
  get grounded(): boolean {
    return this.velocity <= 0 && this.course.some(solid => this.overlaps(solid) && Math.abs(this.height - solid.top) < 0.000001);
  }
  get won(): boolean { return this.victoryTime >= 0; }
  get returnReady(): boolean { return this.victoryTime >= 1.9; }
  get fade(): number { return Math.max(0, Math.min(1, (this.victoryTime - 1.5) / 0.4)); }
  jump(): void { if (!this.won && this.grounded && this.dash === 0) this.velocity = 440; }
  startDash(): void {
    if (!this.won && this.grounded && this.attack === 0 && this.dashCooldown <= 0) { this.horizontalVelocity = this.direction * 1100; this.dash = this.dashDuration; this.dashCooldown = 0.8; }
  }
  startAttack(): void { if (!this.won && this.dash === 0 && this.attack === 0) this.attack = this.attackDuration; }
  action(axis: number): AnimalAction {
    if (this.won) return 'idle';
    if (this.attack > 0) return 'attack';
    if (this.dash > 0) return 'skill';
    if (!this.grounded) return this.velocity > 0 ? 'jump' : 'fall';
    if (this.land > 0) return 'land';
    return axis ? 'run' : 'idle';
  }
  private respawn(): void {
    this.respawns++;
    this.x = this.start; this.height = 0; this.direction = 1;
    this.velocity = this.horizontalVelocity = this.dash = this.dashCooldown = this.attack = this.land = 0;
    this.victoryTime = -1;
  }
  update(seconds: number, axis: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const input = Number.isFinite(axis) ? Math.max(-1, Math.min(1, axis)) : 0;
    // Small physics steps prevent dash tunnelling and keep collisions stable at low FPS.
    let remaining = seconds;
    while (remaining > 0.0000001) {
      const step = Math.min(remaining, 1 / 120);
      remaining -= step;
      if (this.won) { this.victoryTime += step; continue; }
      if (this.step(step, input)) return;
    }
  }
  private step(seconds: number, input: number): boolean {
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
    let nextX = Math.max(this.start, Math.min(this.finish, this.x + distance));
    for (const solid of this.course) {
      if (this.height >= solid.top - 0.000001 || this.height + this.bodyHeight <= solid.bottom + 0.000001) continue;
      if (distance > 0 && this.x + this.halfWidth <= solid.x + 0.000001 && nextX + this.halfWidth > solid.x) nextX = Math.min(nextX, solid.x - this.halfWidth);
      if (distance < 0 && this.x - this.halfWidth >= solid.x + solid.width - 0.000001 && nextX - this.halfWidth < solid.x + solid.width) nextX = Math.max(nextX, solid.x + solid.width + this.halfWidth);
    }
    if (Math.abs(nextX - this.x) < 0.000001 && distance !== 0) this.horizontalVelocity = 0;
    this.x = nextX;
    this.dash = Math.max(0, this.dash - seconds);
    this.dashCooldown = Math.max(0, this.dashCooldown - seconds);
    this.attack = Math.max(0, this.attack - seconds);
    this.land = Math.max(0, this.land - seconds);
    if (!this.grounded) {
      const oldHeight = this.height;
      let nextHeight = oldHeight + this.velocity * seconds - 490 * seconds * seconds;
      this.velocity -= 980 * seconds;
      for (const solid of this.course) {
        if (!this.overlaps(solid)) continue;
        if (this.velocity <= 0 && oldHeight >= solid.top - 0.000001 && nextHeight <= solid.top) {
          nextHeight = Math.max(nextHeight, solid.top); this.velocity = 0; this.land = 0.16;
        } else if (this.velocity > 0 && oldHeight + this.bodyHeight <= solid.bottom && nextHeight + this.bodyHeight >= solid.bottom) {
          nextHeight = solid.bottom - this.bodyHeight; this.velocity = 0;
        }
      }
      this.height = nextHeight;
    }
    // A dash that leaves a ledge becomes a fall; air dashing remains disabled.
    if (!this.grounded && this.dash > 0) this.dash = 0;
    if (this.height < -190) { this.respawn(); return true; }
    if (this.x >= this.finish - 0.000001 && this.grounded) {
      this.x = this.finish; this.victoryTime = 0; this.velocity = 0; this.horizontalVelocity = 0;
    }
    return false;
  }
}
