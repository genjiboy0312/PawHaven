import { Container, Graphics } from 'pixi.js';
import { LobbyMap, type HomeTextures } from './LobbyMap';
import type { HomeState, HomeTab } from './HomeState';

/** A separate view of the saved room. Selection never calls HomeState's writers. */
export class HomeShopPreview extends Container {
  readonly map: LobbyMap;
  constructor(textures?: HomeTextures) {
    super(); this.label = 'shop-lobby-preview'; this.eventMode = 'none';
    this.map = new LobbyMap(textures); this.map.scale.set(420 / 960);
    const clip = new Graphics().roundRect(0, 0, 420, 236.25, 12).fill('#ffffff');
    const frame = new Graphics().roundRect(0, 0, 420, 236.25, 12).stroke({ color: '#dcc599', width: 1.5 });
    this.addChild(this.map, clip, frame); this.map.mask = clip; this.position.set(24, 150);
  }
  showSelection(state: HomeState | undefined, tab: HomeTab, index: number): void {
    const look = { ...(state?.current ?? { Background: 0, Floor: 0 }) };
    const items = [...(state?.items ?? [])];
    if (tab === 'Background' || tab === 'Floor') look[tab] = index;
    else items.push({ id: -(1000 + (tab === 'Etc' ? 100 : 0) + index), tab, option: index, x: .5, y: .75 });
    // Persistent IDs are positive. A distinct temporary ID per product also lets
    // LobbyMap release the previous view when the selected artwork changes.
    this.map.draw(960, 540, look, items);
  }
}
