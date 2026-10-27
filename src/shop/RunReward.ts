import { COURSE_COINS } from '../game/CourseCoins';
import type { CourseId } from '../game/CourseCatalog';

export interface RunReward { status: 'pending' | 'confirmed' | 'rejected' | 'unavailable'; collected: number; coins?: number }
export interface RunRewardReceipt { collected: number; bonus: number; coins: number }
export const RUN_FINISH_BONUS = 10;
export function validRunCoins(map: CourseId, count: number): boolean {
  return Number.isInteger(count) && count >= 0 && count <= COURSE_COINS[map].length;
}
