import type { CourseSolid } from './TrainingCourse';
export const SURVIVAL_SINGLE_SECONDS = 30;
export const SURVIVAL_MULTI_SECONDS = 60;
export const SURVIVAL_COURSE: readonly CourseSolid[] = Array.from({ length: 6 }, (_, index) => ({ x: 84 + index * 172, width: 168, top: 0, bottom: -38, oneWay: true }));
/** Alternating low/high platforms remain within the existing jump's reach. */
export const SURVIVAL_STEPS_COURSE: readonly CourseSolid[] = SURVIVAL_COURSE.map((solid, index) => {
  const top = index % 2 === 0 ? 0 : 64; return { ...solid, top, bottom: top - 38 };
});
export type PlatformPhase = 'safe' | 'warning' | 'gone';
export type SurvivalPattern = 'standard' | 'alternating-height' | 'sweep';
/** Absolute round time gives every client the same warning/drop pattern. */
export function survivalPlatformPhase(index: number, time: number, pattern: SurvivalPattern = 'standard'): PlatformPhase {
  if (!Number.isFinite(time) || time < 3) return 'safe';
  const cycle = Math.floor((time - 3) / 5.2), age = (time - 3) - cycle * 5.2;
  if (age < 2.4) return 'safe';

  let danger: boolean;
  if (pattern === 'sweep') {
    // Move the adjacent pair right by one tile per cycle, stopping at the last pair.
    const first = Math.min(cycle, SURVIVAL_COURSE.length - 2);
    danger = index === first || index === first + 1;
  } else {
    const shifted = (index + cycle) % SURVIVAL_COURSE.length;
    // Terrace indices alternate low/high, so each threatened platform borders a safe height.
    danger = pattern === 'alternating-height'
      ? shifted % 2 === 0
      : cycle < 2 ? shifted % 3 === 0 : cycle < 4 ? shifted % 2 === 0 : shifted % 3 !== 0;
  }
  if (!danger) return 'safe';
  return age < 4 ? 'warning' : 'gone';
}
export class SurvivalRound {
  elapsed = 0;
  eliminated = false;
  succeeded = false;
  constructor(
    readonly duration: number,
    private readonly solids: readonly CourseSolid[],
    private readonly pattern: SurvivalPattern = 'standard',
  ) {}
  sync(time: number): void {
    this.elapsed = Math.max(0, Math.min(this.duration, time));
    this.syncPlatforms(time);
  }
  syncPlatforms(time: number): void {
    this.solids.forEach((solid, index) => {
      const phase = survivalPlatformPhase(index, time, this.pattern);
      solid.disabled = phase === 'gone'; solid.warning = phase === 'warning';
    });
  }
}
