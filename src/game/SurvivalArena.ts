import type { CourseSolid } from './TrainingCourse';
export const SURVIVAL_SINGLE_SECONDS = 30;
export const SURVIVAL_MULTI_SECONDS = 60;
export const SURVIVAL_COURSE: readonly CourseSolid[] = Array.from({ length: 6 }, (_, index) => ({ x: 84 + index * 172, width: 168, top: 0, bottom: -38, oneWay: true }));
export type PlatformPhase = 'safe' | 'warning' | 'gone';
/** Absolute round time gives every client the same warning/drop pattern. */
export function survivalPlatformPhase(index: number, time: number): PlatformPhase {
  if (!Number.isFinite(time) || time < 3) return 'safe';
  const cycle = Math.floor((time - 3) / 5.2), age = (time - 3) - cycle * 5.2;
  const shifted = (index + cycle) % 6;
  const danger = cycle < 2 ? shifted % 3 === 0 : cycle < 4 ? shifted % 2 === 0 : shifted % 3 !== 0;
  return !danger || age < 2.4 ? 'safe' : age < 4 ? 'warning' : 'gone';
}
export class SurvivalRound {
  elapsed = 0;
  eliminated = false;
  succeeded = false;
  constructor(readonly duration: number, private readonly solids: readonly CourseSolid[]) {}
  sync(time: number): void {
    this.elapsed = Math.max(0, Math.min(this.duration, time));
    this.syncPlatforms(time);
  }
  syncPlatforms(time: number): void {
    this.solids.forEach((solid, index) => {
      const phase = survivalPlatformPhase(index, time);
      solid.disabled = phase === 'gone'; solid.warning = phase === 'warning';
    });
  }
}
