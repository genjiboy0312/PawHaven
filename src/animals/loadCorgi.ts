import { Assets, Rectangle, Texture } from 'pixi.js';
import type { AnimalConfig } from './AnimalConfig';

interface FrameRect { x: number; y: number; width: number; height: number }
interface FrameMap { idle: FrameRect[]; walk: FrameRect[] }
const base = import.meta.env.BASE_URL + 'assets/characters/corgi/';

export async function loadCorgi(onProgress: (progress: number) => void): Promise<AnimalConfig> {
  const atlas = await Assets.load<Texture>(base + 'corgi-idle-walk.png');
  onProgress(0.7);
  const map = await Assets.load<FrameMap>(base + 'frames.json');
  const frames = (items: FrameRect[]): Texture[] => {
    if (items.length !== 8) throw new Error('코기 프레임 수가 올바르지 않습니다.');
    return items.map(({ x, y, width, height }) => {
      if (x < 0 || y < 0 || width <= 0 || height <= 0 ||
          x + width > atlas.width || y + height > atlas.height ||
          width > 256 || height > 240) throw new Error('코기 프레임 범위가 올바르지 않습니다.');
      return new Texture({
        source: atlas.source,
        frame: new Rectangle(x, y, width, height),
        orig: new Rectangle(0, 0, 256, 240),
        trim: new Rectangle((256 - width) / 2, 240 - height, width, height),
      });
    });
  };
  const config: AnimalConfig = {
    id: 'corgi', speed: 90, scale: 0.62,
    animations: {
      idle: { frames: frames(map.idle), fps: 3 },
      walk: { frames: frames(map.walk), fps: 8 },
    },
  };
  onProgress(1);
  return config;
}
