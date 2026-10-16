import { Assets, Rectangle, Texture } from 'pixi.js';
import type { AnimalConfig } from './AnimalConfig';

interface FrameRect { x: number; y: number; width: number; height: number }
interface CleanFrame extends FrameRect { center: number; baseline: number }
interface CleanMap { actions: Record<'run' | 'attack' | 'skill' | 'jump', CleanFrame[]> }
interface FrameMap { idle: FrameRect[]; walk: FrameRect[] }
interface PlayfulMap { width: number; height: number; jump: FrameRect[]; emote: FrameRect[] }
const base = import.meta.env.BASE_URL + 'assets/characters/corgi/';

function textures(atlas: Texture, items: FrameRect[], logicalHeight: number): Texture[] {
  if (items.length !== 8) throw new Error('코기 프레임 수가 올바르지 않습니다.');
  return items.map(({ x, y, width, height }) => {
    if (x < 0 || y < 0 || width <= 0 || height <= 0 ||
        x + width > atlas.width || y + height > atlas.height ||
        width > 256 || height > logicalHeight) throw new Error('코기 프레임 범위가 올바르지 않습니다.');
    return new Texture({
      source: atlas.source, frame: new Rectangle(x, y, width, height),
      orig: new Rectangle(0, 0, 256, logicalHeight),
      trim: new Rectangle((256 - width) / 2, logicalHeight - height, width, height),
    });
  });
}

function paddedTextures(atlas: Texture, frames: CleanFrame[]): Texture[] {
  return frames.map(({ x, y, width, height, center, baseline }) => {
    if (width !== 384 || height !== 256 || x < 0 || y < 0 || x + width > atlas.width || y + height > atlas.height) {
      throw new Error('코기 패딩 프레임 범위가 올바르지 않습니다.');
    }
    return new Texture({ source: atlas.source,
      frame: new Rectangle(x, y, width, height), orig: new Rectangle(0, 0, 512, 512),
      trim: new Rectangle(256 - center, 400 - baseline, width, height),
    });
  });
}
export async function loadCorgi(onProgress: (progress: number) => void): Promise<AnimalConfig> {
  const atlas = await Assets.load<Texture>(base + 'corgi-idle-walk.png');
  onProgress(0.35);
  const map = await Assets.load<FrameMap>(base + 'frames.json');
  const playfulAtlas = await Assets.load<Texture>(base + 'corgi-jump-emote.png');
  onProgress(0.8);
  const playful = await Assets.load<PlayfulMap>(base + 'playful-frames.json');
  const cleanAtlas = await Assets.load<Texture>(base + 'corgi-actions-clean.png');
  const clean = await Assets.load<CleanMap>(base + 'clean-frames.json');
  const cleanJump = paddedTextures(cleanAtlas, clean.actions.jump);
  const padded = { scale: 212 / 164, anchorY: 400 / 512 };
  const config: AnimalConfig = {
    id: 'corgi', speed: 90, scale: 0.62,
    animations: {
      run: { frames: paddedTextures(cleanAtlas, clean.actions.run), fps: 8, ...padded },
      attack: { frames: paddedTextures(cleanAtlas, clean.actions.attack), fps: 8, ...padded },
      skill: { frames: paddedTextures(cleanAtlas, clean.actions.skill), fps: 12, ...padded },
      fall: { frames: cleanJump.slice(2, 3), fps: 8, ...padded },
      land: { frames: cleanJump.slice(3), fps: 12, ...padded },
      idle: { frames: textures(atlas, map.idle, 240), fps: 3 },
      walk: { frames: textures(atlas, map.walk, 240), fps: 8 },
      jump: { frames: cleanJump, fps: 8, ...padded },
      emote: { frames: textures(playfulAtlas, playful.emote, 256), fps: 4, scale: 212 / 223 },
    },
  };
  onProgress(1);
  return config;
}
