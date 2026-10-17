import type { CourseSolid } from './TrainingCourse';

export const ADVENTURE_FINISH = 6500;
export const ADVENTURE_CHECKPOINT = 2900;
/** Roughly 21 seconds at normal speed, plus jumps and exploration. */
export const ADVENTURE_COURSE: readonly CourseSolid[] = [
  { x: 0, width: 2300, top: 0, bottom: -300 },
  { x: 2440, width: 2060, top: 0, bottom: -300 },
  { x: 4640, width: 2160, top: 0, bottom: -300 },
  { x: 650, width: 80, top: 40, bottom: 0 },
  { x: 1350, width: 100, top: 60, bottom: 0 },
  { x: 3300, width: 90, top: 44, bottom: 0 },
  { x: 3850, width: 180, top: 65, bottom: 0 },
  { x: 5500, width: 100, top: 48, bottom: 0 },
];
export const ADVENTURE_TARGETS = [1850, 5150] as const;
