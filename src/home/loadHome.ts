import { Assets, Rectangle, Texture } from 'pixi.js';
import type { HomeTextures } from './LobbyMap';
export async function loadHome(): Promise<HomeTextures> {
  const base = import.meta.env.BASE_URL + 'assets/home/';
  const [background, floor, cushion, sofaImage] = await Promise.all(['garden-background.png', 'garden-floor.png', 'cushion.png', 'pet-sofa-black-white.png'].map(name => Assets.load<Texture>(base + name)));
  for (const texture of [background, floor, cushion, sofaImage]) texture.source.scaleMode = 'nearest';
  // Measured alpha bounds, with two pixels of padding. Keep the source PNG unchanged.
  const sofa = new Texture({ source: sofaImage.source, frame: new Rectangle(107, 459, 1042, 407) });
  return { background, floor, cushion, sofa };
}
