import { Assets, Sprite, type Texture } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from './viewport';

export const COURSE_TIMES = ['morning', 'noon', 'sunset', 'night', 'cherry'] as const;
export type CourseTime = typeof COURSE_TIMES[number];
export type CourseBackgrounds = Record<CourseTime, Texture> & { cloud?:Texture };
export async function loadCourseBackgrounds(): Promise<CourseBackgrounds> {
  const entries = await Promise.all([...COURSE_TIMES,'cloud'].map(async time => {
    const texture = await Assets.load<Texture>(import.meta.env.BASE_URL + 'assets/backgrounds/' + time + '.png');
    texture.source.scaleMode = 'nearest';
    return [time, texture] as const;
  }));
  return Object.fromEntries(entries) as CourseBackgrounds;
}
/** Cover the full view so transparent terrain gaps reveal scenery, not the fallback fill. */
export function courseBackdrop(texture: Texture): Sprite {
  const sprite = new Sprite(texture); sprite.label = 'course-background';
  sprite.width = WORLD_WIDTH; sprite.height = WORLD_HEIGHT;
  return sprite;
}
