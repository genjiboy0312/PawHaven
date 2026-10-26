import type { AnimalAction } from '../animals/AnimalConfig';
import { TRAINING_COURSE, type CourseSolid } from './TrainingCourse';
import { HitReaction, type PlayerHit } from './HitReaction';
import {PatrolSnake,type SnakePatrol} from './PatrolSnake';
export interface RunOptions { finish?: number; checkpoint?: number; targets?: readonly number[]; manualReturn?: boolean; playerCombat?: boolean; snakes?:readonly SnakePatrol[];snakeHeight?:number }
/** Renderer-independent movement, collisions and course progress. */
export class DummyRun {
  get speed(): number { return 240 * this.movementScale; }
  readonly start = 120;
  readonly finish: number;
  readonly hitReaction: HitReaction;
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
  checkpoint = this.start;
  elapsed = 0;
  enemyTime = 0;
  readonly targets: { x: number; broken: boolean }[];
  readonly snakes:PatrolSnake[];private snakeHitSequence=0;
  private exitTime = -1;
  readonly attackDuration = 0.48;
  readonly dashDuration = 0.32;
  readonly dashCooldownDuration = 0.8;
  victoryTime = -1;
  constructor(readonly course: readonly CourseSolid[] = TRAINING_COURSE, private readonly movementScale = 1, private readonly options: RunOptions = {}) {
    this.finish = options.finish ?? 2520;
    this.snakes=(options.snakes??[]).map(patrol=>new PatrolSnake(patrol,options.snakeHeight));
    this.hitReaction = new HitReaction(options.playerCombat === true||this.snakes.length>0);
    this.targets = (options.targets ?? []).map(x => ({ x, broken: false }));
  }
  private overlaps(solid: CourseSolid, x = this.x): boolean {
    return x + this.halfWidth > solid.x + 0.000001 && x - this.halfWidth < solid.x + solid.width - 0.000001;
  }
  get grounded(): boolean {
    return this.velocity <= 0 && this.course.some(solid => this.overlaps(solid) && Math.abs(this.height - solid.top) < 0.000001);
  }
  get won(): boolean { return this.victoryTime >= 0; }
  get motionVelocity(): number { return this.horizontalVelocity + this.hitReaction.velocity * this.movementScale; }
  receivePlayerHit(hit: PlayerHit): boolean {
    return this.options.playerCombat===true && this.receiveHit(hit);
  }
  private receiveHit(hit: PlayerHit): boolean {
    if (this.won || !this.hitReaction.receive(hit)) return false;
    // Cancel an existing burst, without imposing a stun or changing vertical motion.
    if (this.dash > 0) this.horizontalVelocity = 0;
    this.dash = 0;
    return true;
  }
  get returnReady(): boolean { return this.options.manualReturn ? this.exitTime >= 0.4 : this.victoryTime >= 1.9; }
  get fade(): number { return Math.max(0, Math.min(1, this.options.manualReturn ? this.exitTime / 0.4 : (this.victoryTime - 1.5) / 0.4)); }
  leave(): void { if (this.won && this.exitTime < 0) this.exitTime = 0; }
  cancelLeave(): void { this.exitTime = -1; }
  get canJump():boolean{return !this.won&&this.grounded&&this.dash===0;}
  get canDash():boolean{return !this.won&&this.grounded&&this.attack===0&&this.dashCooldown<=0;}
  get canAttack():boolean{return !this.won&&this.dash===0&&this.attack===0;}
  jump(): void { if (this.canJump) this.velocity = 440; }
  startDash(): void {
    if (this.canDash) { this.horizontalVelocity = this.direction * 1100 * this.movementScale; this.dash = this.dashDuration; this.dashCooldown = this.dashCooldownDuration; }
  }
  startAttack(): void { if (this.canAttack) this.attack = this.attackDuration; }
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
    this.hitReaction.reset();
    this.x = this.checkpoint; this.height = 0; this.direction = 1;
    this.velocity = this.horizontalVelocity = this.dash = this.dashCooldown = this.attack = this.land = 0;
    this.victoryTime = -1;
  }
  update(seconds: number, axis: number, enemyTime?:number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const input = Number.isFinite(axis) ? Math.max(-1, Math.min(1, axis)) : 0;
    // Small physics steps prevent dash tunnelling and keep collisions stable at low FPS.
    let remaining = seconds;
    const enemyStart=this.enemyTime;
    while (remaining > 0.0000001) {
      const step = Math.min(remaining, 1 / 120);
      remaining -= step;
      if (this.won) { this.victoryTime += step; if (this.exitTime >= 0) this.exitTime += step; continue; }
      this.elapsed += step;
      this.enemyTime=Number.isFinite(enemyTime)?Math.max(0,enemyTime!-remaining):enemyStart+seconds-remaining;
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
    distance += this.hitReaction.advance(seconds) * this.movementScale;
    let nextX = Math.max(this.start, Math.min(this.finish, this.x + distance));
    for (const solid of this.course) {
      if (solid.oneWay) continue;
      if (this.height >= solid.top - 0.000001 || this.height + this.bodyHeight <= solid.bottom + 0.000001) continue;
      if (distance > 0 && this.x + this.halfWidth <= solid.x + 0.000001 && nextX + this.halfWidth > solid.x) nextX = Math.min(nextX, solid.x - this.halfWidth);
      if (distance < 0 && this.x - this.halfWidth >= solid.x + solid.width - 0.000001 && nextX - this.halfWidth < solid.x + solid.width) nextX = Math.max(nextX, solid.x + solid.width + this.halfWidth);
    }
    if (Math.abs(nextX - this.x) < 0.000001 && distance !== 0) this.horizontalVelocity = 0;
    if (Math.abs(nextX - this.x - distance) > 0.000001) this.hitReaction.stopPush();
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
        } else if (!solid.oneWay && this.velocity > 0 && oldHeight + this.bodyHeight <= solid.bottom && nextHeight + this.bodyHeight >= solid.bottom) {
          nextHeight = solid.bottom - this.bodyHeight; this.velocity = 0;
        }
      }
      this.height = nextHeight;
    }
    // A dash that leaves a ledge becomes a fall; air dashing remains disabled.
    if (!this.grounded && this.dash > 0) this.dash = 0;
    if (this.height < -190) { this.respawn(); return true; }
    if (this.options.checkpoint && this.x >= this.options.checkpoint && this.grounded) this.checkpoint = this.options.checkpoint;
    if (this.attack > 0 && this.height < 72 && this.height + this.bodyHeight > 0) {
      for (const target of this.targets) {
        const distance = (target.x - this.x) * this.direction;
        if (distance >= -this.halfWidth && distance <= 125) target.broken = true;
      }
    }
    for(const snake of this.snakes){
      snake.update(seconds,this.enemyTime);if(snake.defeated||this.height>=snake.height||this.height+this.bodyHeight<=0)continue;
      const distance=(snake.x-this.x)*this.direction;
      // Reuse the existing attack's forward reach. Resolve attack before body contact.
      if(this.attack>0&&distance>=-this.halfWidth&&distance<=125+snake.halfWidth){snake.defeat();continue;}
      if(Math.abs(snake.x-this.x)<snake.halfWidth+this.halfWidth)
        this.receiveHit({sequence:++this.snakeHitSequence,direction:this.x<snake.x?-1:1});
    }
    if (this.x >= this.finish - 0.000001 && this.grounded) {
      this.hitReaction.reset();
      this.x = this.finish; this.victoryTime = 0; this.velocity = 0; this.horizontalVelocity = 0;
    }
    return false;
  }
}
