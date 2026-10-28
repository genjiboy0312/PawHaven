import { Assets, Rectangle, Texture } from 'pixi.js';
import type { HomeTextures } from './LobbyMap';
import type { CourseBackgrounds } from '../game/CourseBackgrounds';
import {loadGardenProps} from './GardenProps';
export async function loadHome(backgrounds?:CourseBackgrounds): Promise<HomeTextures> {
  const base = import.meta.env.BASE_URL + 'assets/home/';
  const [background, floor, cushion, sofaImage] = await Promise.all([backgrounds?Promise.resolve(backgrounds.morning):Assets.load<Texture>(base+'garden-background.png'),...['garden-floor.png', 'cushion.png', 'pet-sofa-black-white.png'].map(name => Assets.load<Texture>(base + name))]);
  for (const texture of [background, floor, cushion, sofaImage]) texture.source.scaleMode = 'nearest';
  // Measured alpha bounds, with two pixels of padding. Keep the source PNG unchanged.
  const sofa = new Texture({ source: sofaImage.source, frame: new Rectangle(107, 459, 1042, 407) });
  const cherryFloor=await Assets.load<Texture>(import.meta.env.BASE_URL+'assets/course/cherry-soil.png');cherryFloor.source.scaleMode='nearest';
  return { background, floor, cushion, sofa, cherryFloor, ...await loadGardenProps(), ...(backgrounds?{noon:backgrounds.noon,sunset:backgrounds.sunset,night:backgrounds.night,cherry:backgrounds.cherry}:{}) };
}
