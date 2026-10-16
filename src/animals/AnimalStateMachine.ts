import { CORGI_BEHAVIOR } from './AnimalState';
import type { AnimalState, BehaviorMode, BehaviorProfile } from './AnimalState';

/** Renderer-independent daily behavior. One instance owns one animal's timers and target. */
export class AnimalStateMachine {
  state: AnimalState = 'IDLE';
  mode: BehaviorMode = 'auto';
  x = 0;
  direction = 1;
  elapsed = 0;
  private left = 0;
  private right = 0;
  private target = 0;
  private duration = 0;
  get progress(): number { return this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 0; }
  get jumpHeight(): number { return this.state === 'JUMP' ? 4 * 48 * this.progress * (1 - this.progress) : 0; }
  private positioned = false;
  private observeDirection = 1;
  private petted = false;

  get canPet(): boolean { return this.mode === 'auto' && !this.petted && this.state !== 'JUMP' && this.state !== 'LAND'; }

  pet(duration = 1.5): boolean {
    if (!this.canPet) return false;
    this.enter('EMOTE');
    this.petted = true;
    this.duration = duration;
    return true;
  }

  constructor(
    private readonly speed: number,
    private readonly profile: BehaviorProfile = CORGI_BEHAVIOR,
    private readonly random: () => number = Math.random,
  ) {
    if (!Number.isFinite(speed) || speed <= 0) throw new Error('이동 속도는 양수여야 합니다.');
    this.enter('IDLE');
  }

  private sample(): number { return Math.max(0, Math.min(0.999999, this.random())); }
  private clamp(value: number): number { return Math.max(this.left, Math.min(this.right, value)); }

  setBounds(left: number, right: number): void {
    if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) {
      throw new Error('이동 영역이 올바르지 않습니다.');
    }
    this.left = left;
    this.right = right;
    this.x = this.positioned ? this.clamp(this.x) : (left + right) / 2;
    this.positioned = true;
    this.target = this.mode === 'walk'
      ? (this.direction > 0 ? right : left) : this.clamp(this.target);
  }

  setPosition(x: number, direction: number): void {
    this.x = this.clamp(x);
    this.direction = direction < 0 ? -1 : 1;
  }

  setMode(mode: BehaviorMode): void {
    this.mode = mode;
    this.enter(mode === 'walk' ? 'WANDER' : 'IDLE');
    if (mode === 'walk') this.target = this.direction > 0 ? this.right : this.left;
  }

  private enter(state: AnimalState): void {
    this.petted = false;
    this.state = state;
    this.elapsed = 0;
    if (state === 'WANDER') {
      const [minimum, maximum] = this.profile.wanderDistance;
      const distance = minimum + this.sample() * (maximum - minimum);
      const sign = this.sample() < 0.5 ? -1 : 1;
      this.target = this.clamp(this.x + sign * distance);
      // At an edge, choose the opposite side instead of walking in place.
      if (Math.abs(this.target - this.x) < Math.min(minimum, (this.right - this.left) / 2)) {
        this.target = this.clamp(this.x - sign * distance);
      }
    } else {
      const [minimum, maximum] = this.profile.durations[state] ?? CORGI_BEHAVIOR.durations[state] ?? [2, 3];
      this.duration = minimum + this.sample() * (maximum - minimum);
      if (state === 'OBSERVE') this.observeDirection = this.direction;
    }
  }

  private next(): void {
    if (this.state === 'JUMP') { this.enter('LAND'); return; }
    if (this.state !== 'IDLE') { this.enter('IDLE'); return; }
    const choices = Object.entries(this.profile.weights) as [Exclude<AnimalState, 'IDLE'>, number][];
    const total = choices.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
    let pick = this.sample() * total;
    for (const [state, weight] of choices) {
      if (weight <= 0) continue;
      pick -= weight;
      if (pick < 0) { this.enter(state); return; }
    }
    this.enter('IDLE');
  }

  update(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.elapsed += seconds;
    if (this.state === 'WANDER') {
      const remaining = this.target - this.x;
      if (Math.abs(remaining) > 0.001) {
        this.direction = Math.sign(remaining);
        const step = Math.min(Math.abs(remaining), this.speed * seconds);
        this.x = this.clamp(this.x + this.direction * step);
      }
      if (Math.abs(this.target - this.x) <= 0.001) {
        if (this.mode === 'walk') {
          this.direction *= -1;
          this.target = this.direction > 0 ? this.right : this.left;
        } else this.enter('IDLE');
      }
    } else if (this.mode === 'auto') {
      if (this.state === 'OBSERVE') {
        this.direction = this.observeDirection * (Math.floor(this.elapsed / 1.4) % 2 === 0 ? 1 : -1);
      }
      if (this.elapsed >= this.duration) this.next();
    }
  }
}
