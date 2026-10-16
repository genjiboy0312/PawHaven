import { Rectangle, Texture } from 'pixi.js';
import type { AnimalAction, AnimalConfig, HeadAnchor } from './AnimalConfig';
export interface PetAtlasFrame { source: string; x: number; y: number; width: number; height: number; center: number; baseline: number; head: HeadAnchor }
export interface MyeongrangMap {
  sources: Record<string, { file: string; width: number; height: number }>;
  actions: Partial<Record<AnimalAction, { fps: number; scale: number; frames: PetAtlasFrame[] }>>;
}
/** Keep complete source cells; independent foot anchors normalize the approved art. */
export function createMyeongrang(atlases: Record<string, Texture>, map: MyeongrangMap, shared: Pick<AnimalConfig, 'effects' | 'wardrobe'>): AnimalConfig {
  const config: AnimalConfig = { id: 'myeongrang', speed: 90, scale: 0.62, animations: {}, effects: shared.effects, wardrobe: shared.wardrobe };
  for (const [key, clip] of Object.entries(map.actions)) {
    if (!clip.frames.length || !Number.isFinite(clip.scale) || clip.scale <= 0 || !Number.isFinite(clip.fps) || clip.fps <= 0) throw new Error('Invalid Myeongrang animation.');
    config.animations[key as AnimalAction] = {
      fps: clip.fps, scale: clip.scale, anchorY: 870 / 1024, head: clip.frames.map(frame => frame.head),
      frames: clip.frames.map(frame => {
        const atlas = atlases[frame.source];
        const tx = 512 - frame.center, ty = 870 - frame.baseline;
        if (!atlas || frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0 || frame.x + frame.width > atlas.width || frame.y + frame.height > atlas.height ||
            !Number.isFinite(tx) || !Number.isFinite(ty) || tx < 0 || ty < 0 || tx + frame.width > 1024 || ty + frame.height > 1024) throw new Error('Invalid Myeongrang atlas cell.');
        return new Texture({ source: atlas.source, frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
          orig: new Rectangle(0, 0, 1024, 1024), trim: new Rectangle(tx, ty, frame.width, frame.height) });
      }),
    };
  }
  const jump = config.animations.jump;
  if (!config.animations.idle || !jump) throw new Error('Myeongrang idle/jump clips are missing.');
  config.animations.fall = { ...jump, frames: jump.frames.slice(2, 3), head: jump.head?.slice(2, 3) };
  config.animations.land = { ...jump, frames: jump.frames.slice(3, 4), head: jump.head?.slice(3, 4) };
  return config;
}