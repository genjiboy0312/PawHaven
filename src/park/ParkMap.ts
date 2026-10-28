import { LobbyMap } from '../home/LobbyMap';
import type { HomeItem } from '../home/HomeState';
import { PARK_CHANNELS, PARK_WORLD } from './ParkModel';

const THEMES = [
  { background: 0, name: 'homeMorning' },
  { background: 1, name: 'homeNoon' },
  { background: 2, name: 'homeSunset' },
  { background: 3, name: 'homeNight' },
] as const;
export const parkTheme = (channel: number) => THEMES[Math.max(0, PARK_CHANNELS.findIndex(id => id === channel))]!;

// Shared public scenery, independent of a player's purchased home inventory.
// Two small gardens frame an open centre; all coordinates are ground positions.
const placements: readonly [HomeItem['tab'], number, number, number][] = [
  ['Etc', 5, 180, 635], ['Etc', 5, 455, 630], ['Etc', 6, 635, 620],
  ['Etc', 4, 360, 660], ['Etc', 4, 520, 660],
  ['Furniture', 5, 500, 785], ['Etc', 7, 325, 810],
  ['Etc', 6, 1180, 625], ['Etc', 5, 1390, 630], ['Etc', 5, 1610, 640],
  ['Etc', 4, 1250, 665], ['Etc', 4, 1410, 665],
  ['Furniture', 5, 1320, 790], ['Etc', 7, 1490, 815],
  ['Etc', 5, 105, 850], ['Etc', 6, 1695, 850],
];
export const PARK_SCENERY: readonly HomeItem[] = Object.freeze(placements.map(([tab, option, x, y], i) =>
  Object.freeze({ id: -2000 - i, tab, option, x: x / PARK_WORLD.width, y: y / PARK_WORLD.height })));

/** Reuse the home renderer and art; actors share its depth-sorted object layer. */
export class ParkMap extends LobbyMap {
  drawChannel(channel: number): void {
    this.draw(PARK_WORLD.width, PARK_WORLD.height, { Background: parkTheme(channel).background, Floor: 0 }, PARK_SCENERY);
    // Lobby items sort by normalized y; park actors use world-space ground y.
    for (const child of this.objects.children) child.zIndex = child.y;
    this.objects.sortChildren();
  }
}
