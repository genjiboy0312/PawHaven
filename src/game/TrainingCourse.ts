/** Heights are measured upward from the course baseline. Shared by physics and drawing. */
export interface CourseSolid { readonly x: number; readonly width: number; readonly top: number; readonly bottom: number; readonly oneWay?: boolean; readonly motion?: { readonly distance:number; readonly period:number } }
export const COURSE_GROUND = 390;
export const TRAINING_COURSE: readonly CourseSolid[] = [
  { x: 0, width: 1200, top: 0, bottom: -300 },
  { x: 1320, width: 1530, top: 0, bottom: -300 },
  { x: 480, width: 70, top: 36, bottom: 0 },
  { x: 800, width: 100, top: 58, bottom: 0 },
  { x: 1820, width: 80, top: 44, bottom: 0 },
];
