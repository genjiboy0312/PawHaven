import { Assets, type Texture } from 'pixi.js';
import type { AnimalConfig } from './AnimalConfig';
import { createMyeongrang, type MyeongrangMap } from './createMyeongrang';
export async function loadMyeongrang(shared: AnimalConfig): Promise<AnimalConfig> {
  const base = import.meta.env.BASE_URL + 'assets/characters/myeongrang/';
  const map = await Assets.load<MyeongrangMap>(base + 'frames.json?v=20261017-size1');
  const entries = await Promise.all(Object.entries(map.sources).map(async ([key, source]) => {
    const atlas = await Assets.load<Texture>(base + source.file); atlas.source.scaleMode = 'nearest';
    return [key, atlas] as const;
  }));
  return createMyeongrang(Object.fromEntries(entries), map, shared);
}