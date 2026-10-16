import { Assets, Rectangle, Texture } from 'pixi.js';
import type { AnimalConfig } from './AnimalConfig';

interface FrameRect { x: number; y: number; width: number; height: number }
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

export async function loadCorgi(onProgress: (progress: number) => void): Promise<AnimalConfig> {
  const atlas = await Assets.load<Texture>(base + 'corgi-idle-walk.png');
  onProgress(0.35);
  const map = await Assets.load<FrameMap>(base + 'frames.json');
  const playfulAtlas = await Assets.load<Texture>(base + 'corgi-jump-emote.png');
  onProgress(0.8);
  const playful = await Assets.load<PlayfulMap>(base + 'playful-frames.json');
  const combatAtlas = await Assets.load<Texture>(base + 'corgi-run-attack-skill.png');
  const combat = await Assets.load<Record<'run' | 'attack' | 'skill', FrameRect[]>>(base + 'combat-frames.json');
  const config: AnimalConfig = {
    id: 'corgi', speed: 90, scale: 0.62,
    animations: {
      run: { frames: textures(combatAtlas, combat.run, 256), fps: 12, scale: 212 / 188 },
      attack: { frames: textures(combatAtlas, combat.attack, 256), fps: 16, scale: 212 / 188 },
      skill: { frames: textures(combatAtlas, combat.skill, 256), fps: 24, scale: 212 / 188 },
      fall: { frames: textures(playfulAtlas, playful.jump, 256).slice(4, 6), fps: 8, scale: 212 / 223 },
      land: { frames: textures(playfulAtlas, playful.jump, 256).slice(6), fps: 12, scale: 212 / 223 },
      idle: { frames: textures(atlas, map.idle, 240), fps: 3 },
      walk: { frames: textures(atlas, map.walk, 240), fps: 8 },
      jump: { frames: textures(playfulAtlas, playful.jump, 256), fps: 8, scale: 212 / 223 },
      emote: { frames: textures(playfulAtlas, playful.emote, 256), fps: 4, scale: 212 / 223 },
    },
  };
  onProgress(1);
  return config;
}
