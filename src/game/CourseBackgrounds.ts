import { Assets, Sprite, type Texture } from 'pixi.js';
import { PLAY_GROUND_Y } from './PlayCamera';

export const COURSE_TIMES = ['morning', 'noon', 'sunset', 'night'] as const;
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
/** Background light never tints the pets, equipment, UI or collision terrain. */
export function courseBackdrop(texture: Texture): Sprite {
  const sprite = new Sprite(texture); sprite.label = 'course-background';
  sprite.width = 960; sprite.height = PLAY_GROUND_Y;
  return sprite;
}
