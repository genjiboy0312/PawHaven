import { CORGI_BEHAVIOR } from './AnimalState';
import type { AnimalState, BehaviorMode, BehaviorProfile } from './AnimalState';

export interface CushionSpot { id: number; x: number; y: number; depth: number; wakeEmote?: boolean }
/** Renderer-independent daily behavior. One instance owns one animal's timers and target. */
export class AnimalStateMachine {
  state: AnimalState = 'IDLE';
  mode: BehaviorMode = 'auto';
  x = 0;
  y = 0;
  private floor?: { width: number; height: number; top: number; bottom: number };
  private targetY = 0;
  private cushions: CushionSpot[] = [];
  private cushion?: CushionSpot;
  private cushionPhase?: 'approach' | 'rest' | 'sleep' | 'wake';
  private cushionCooldown = 0;
  private sinceCushion = 0;
  get restingCushion(): number | undefined { return this.cushion?.id; }
  get cushionActivity(): string | undefined { return this.cushionPhase; }
  get depth(): number { return this.cushion && this.cushionPhase !== 'approach' ? this.cushion.depth + 0.5 : this.y; }

  setFloor(width: number, height: number, initialY: number): void {
    if (this.floor?.width === width && this.floor.height === height) return;
    this.y = this.floor ? this.y * height / this.floor.height : initialY;
    this.floor = { width, height, top: height * 0.62, bottom: height * 0.86 };
    const point = this.floorPoint(this.x, this.y); this.x = point.x; this.y = point.y;
    this.targetY = this.y;
    if (this.state === 'WANDER' && !this.cushion) this.targetY = height * (0.62 + this.sample() * 0.24);
  }

  setCushions(spots: readonly CushionSpot[]): void {
    this.cushions = spots.filter(spot => {
      if (![spot.x, spot.y, spot.depth].every(Number.isFinite)) return false;
      const point = this.floorPoint(spot.x, spot.y);
      return Math.hypot(point.x - spot.x, point.y - spot.y) <= 16;
    }).map(spot => ({ ...spot, ...this.floorPoint(spot.x, spot.y) }));
    if (!this.cushion) return;
    const target = this.cushions.find(spot => spot.id === this.cushion!.id);
    if (!target) { this.leaveCushion(); this.enter('IDLE'); return; }
    const moved = Math.hypot(target.x - this.cushion.x, target.y - this.cushion.y) > 0.1;
    if (moved && this.cushionPhase !== 'approach') { this.leaveCushion(); this.enter('IDLE'); return; }
    this.cushion = target;
    if (this.cushionPhase === 'approach') {
      this.target = target.x; this.targetY = target.y;
      if (moved) this.elapsed = 0;
    }
  }

  private floorPoint(x: number, y: number): { x: number; y: number } {
    x = this.clamp(x);
    if (!this.floor) return { x, y };
    y = Math.max(this.floor.top, Math.min(this.floor.bottom, y));
    // Keep the bottom corner controls clear.
    if (x > this.floor.width * 0.8 && y > this.floor.height * 0.7) x = this.floor.width * 0.8;
    if (x < this.floor.width * 0.28 && y > this.floor.height * 0.7) x = this.floor.width * 0.28;
    return { x, y };
  }
  private leaveCushion(): void {
    if (this.cushion) { this.cushionCooldown = 20; this.sinceCushion = 0; }
    this.cushion = undefined; this.cushionPhase = undefined;
  }
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

  get canPet(): boolean { return this.mode === 'auto'; }

  pet(duration = 1.5): boolean {
    if (!this.canPet) return false;
    this.leaveCushion(); this.enter('EMOTE');
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
    this.leaveCushion(); this.mode = mode;
    this.enter(mode === 'walk' ? 'WANDER' : 'IDLE');
    if (mode === 'walk') this.target = this.direction > 0 ? this.right : this.left;
  }

  private enter(state: AnimalState): void {
    if (this.floor && !this.cushion && this.cushionCooldown <= 0 && this.cushions.length &&
        this.mode === 'auto' && (state === 'REST' || state === 'SLEEP')) {
      const ordered = [...this.cushions].sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
      this.cushion = ordered[0]!;
      this.cushionPhase = 'approach'; this.state = 'WANDER'; this.elapsed = 0;
      this.target = this.cushion.x; this.targetY = this.cushion.y;
      return;
    }
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
      if (this.floor) {
        const point = this.floorPoint(this.target, this.floor.top + this.sample() * (this.floor.bottom - this.floor.top));
        this.target = point.x; this.targetY = point.y;
      }
    } else {
      const [minimum, maximum] = this.profile.durations[state] ?? CORGI_BEHAVIOR.durations[state] ?? [2, 3];
      this.duration = minimum + this.sample() * (maximum - minimum);
      if (state === 'OBSERVE') this.observeDirection = this.direction;
    }
  }

  private next(): void {
    if (this.cushionPhase === 'wake') { this.leaveCushion(); this.enter('WANDER'); return; }
    if (this.cushionPhase === 'sleep' && this.cushion?.wakeEmote) { this.cushionPhase = 'wake'; this.enter('EMOTE'); return; }
    if (this.cushionPhase === 'rest') { this.cushionPhase = 'sleep'; this.enter('SLEEP'); return; }
    if (this.cushionPhase === 'sleep') this.leaveCushion();
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
    this.cushionCooldown = Math.max(0, this.cushionCooldown - seconds);
    this.sinceCushion += seconds;
    if (this.floor && this.mode === 'auto' && this.state === 'IDLE' && !this.cushion &&
        this.cushions.length && this.cushionCooldown <= 0 && this.sinceCushion >= 14) {
      this.enter('REST'); return;
    }
    if (this.state === 'WANDER') {
      let waypointX = this.target, waypointY = this.targetY;
      if (this.floor) {
        const edgeX = this.floor.width * 0.8, leftEdge = this.floor.width * 0.28, edgeY = this.floor.height * 0.7;
        if (this.x > edgeX + 0.001 && this.targetY > edgeY) { waypointX = edgeX; waypointY = this.y; }
        else if (this.y > edgeY + 0.001 && this.target > edgeX) { waypointX = this.x; waypointY = edgeY; }
        else if(this.x < leftEdge - 0.001 && this.targetY > edgeY){waypointX=leftEdge;waypointY=this.y;}
        else if(this.y > edgeY + 0.001 && this.target < leftEdge){waypointX=this.x;waypointY=edgeY;}
      }
      const remaining = waypointX - this.x;
      const dy = this.floor ? waypointY - this.y : 0;
      const distance = Math.hypot(remaining, dy / 0.65);
      if (distance > 0.001) {
        if (Math.abs(remaining) > 0.1) this.direction = Math.sign(remaining);
        const amount = Math.min(1, this.speed * seconds / distance);
        const point = this.floorPoint(this.x + remaining * amount, this.y + dy * amount);
        this.x = point.x; this.y = point.y;
      }
      if (this.cushionPhase === 'approach' && this.elapsed > 25) { this.leaveCushion(); this.enter('IDLE'); return; }
      if (Math.hypot(this.target - this.x, this.floor ? this.targetY - this.y : 0) <= 0.001) {
        if (this.cushionPhase === 'approach') { this.cushionPhase = 'rest'; this.enter('REST'); return; }
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
