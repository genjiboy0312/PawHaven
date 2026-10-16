import { Assets, type Texture } from 'pixi.js';
import type { HomeTextures } from './LobbyMap';
export async function loadHome(): Promise<HomeTextures> {
  const base = import.meta.env.BASE_URL + 'assets/home/';
  const [background, floor, cushion] = await Promise.all(['garden-background.png', 'garden-floor.png', 'cushion.png'].map(name => Assets.load<Texture>(base + name)));
  for (const texture of [background, floor, cushion]) texture.source.scaleMode = 'nearest';
  return { background, floor, cushion };
}