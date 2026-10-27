import { homeOptions, HOME_MAX_STOCK, homeInitialStock, validHomeItem as validItem, type PlaceableTab, type HomeProductTab } from './HomeCatalog';
export { homeOptions, HOME_STOCK, type PlaceableTab } from './HomeCatalog';
export const HOME_TABS = ['Background', 'Floor', 'Furniture', 'Etc'] as const;
export type HomeTab = typeof HOME_TABS[number];
export type HomeLook = Record<'Background' | 'Floor', number>;
export const HOME_STORAGE_KEY = 'pawhaven.home.v1';
export const SKY_COLORS = ['#edf0df', '#dce8ef', '#f0ded5', '#e4dff0'];
export const FLOOR_COLORS = ['#c4d6a7', '#d5c6a6', '#b8ced0', '#cfc3d8'];
export interface Placement { x: number; y: number }
export interface HomeItem extends Placement { id: number; tab: PlaceableTab; option: number }
export function clampPlacement(x: number, y: number): Placement {
  return { x: Math.max(0.10, Math.min(0.90, x)), y: Math.max(0.62, Math.min(0.87, y)) };
}
/** Convert the CSS-rotated game surface back to normalized map coordinates. */
export function placementPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, rotated: boolean): Placement {
  return rotated ? { x: (clientY - rect.top) / rect.height, y: 1 - (clientX - rect.left) / rect.width }
    : { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
}
export class HomeState {
  private value: HomeLook = { Background: 0, Floor: 0 };
  private objects: HomeItem[] = [];
  private nextId = 1;
  revision = 0;
  get current(): HomeLook { return { ...this.value }; }
  get items(): HomeItem[] {
    const counts = new Map<string, number>();
    return this.objects.filter(item => {
      const key = item.tab + ':' + item.option, count = (counts.get(key) ?? 0) + 1; counts.set(key, count);
      return count <= (this.stock?.(item.tab, item.option) ?? (this.stock ? HOME_MAX_STOCK : homeInitialStock(item.tab, item.option)));
    }).map(item => ({ ...item }));
  }
  owned(tab: PlaceableTab, option: number): number {
    return validItem(tab, option) ? this.stock ? this.stock(tab, option) ?? 0 : homeInitialStock(tab, option) : 0;
  }
  remaining(tab: PlaceableTab, option: number): number {
    return Math.max(0, this.owned(tab, option) - this.objects.filter(item => item.tab === tab && item.option === option).length);
  }
  backgroundAvailable(option: number): boolean { return option === this.value.Background || option === 0 || !this.stock || (this.stock('Background', option) ?? 0) > 0; }
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>, private readonly stock?: (tab: HomeProductTab, option: number) => number | undefined) {
    try {
      const saved = JSON.parse(storage?.getItem(HOME_STORAGE_KEY) ?? 'null');
      for (const tab of ['Background', 'Floor'] as const) {
        if (Number.isInteger(saved?.[tab]) && saved[tab] >= 0 && saved[tab] < homeOptions[tab]) this.value[tab] = saved[tab];
      }
      if (saved?.version === 2) {
        if (Array.isArray(saved.items)) for (const item of saved.items.slice(0, 200)) {
          if (!item || !validItem(item.tab, item.option) || this.objects.filter(existing => existing.tab === item.tab && existing.option === item.option).length >= (stock ? HOME_MAX_STOCK : homeInitialStock(item.tab, item.option)) ||
              !Number.isSafeInteger(item.id) || item.id <= 0 || item.id > 1000000000 || this.objects.some(existing => existing.id === item.id) ||
              !Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
          this.objects.push({ id: item.id, tab: item.tab, option: item.option, ...clampPlacement(item.x, item.y) });
          this.nextId = Math.max(this.nextId, item.id + 1);
        }
      } else {
        // Migrate the previous single-object look without losing its saved positions.
        for (const tab of ['Furniture', 'Etc'] as const) if (validItem(tab, saved?.[tab])) {
          const position = saved?.placements?.[tab];
          const point = position && Number.isFinite(position.x) && Number.isFinite(position.y)
            ? clampPlacement(position.x, position.y) : { x: tab === 'Furniture' ? 0.21 : 0.47, y: 0.7 };
          this.objects.push({ id: this.nextId++, tab, option: saved[tab], ...point });
        }
      }
    } catch { /* Defaults work without storage. */ }
  }
  select(tab: 'Background' | 'Floor', option: number): boolean {
    if (!['Background', 'Floor'].includes(tab) || !Number.isInteger(option) || option < 0 || option >= homeOptions[tab]) return false;
    if (tab === 'Background' && !this.backgroundAvailable(option)) return false;
    this.value[tab] = option; this.save(); return true;
  }
  place(tab: PlaceableTab, option: number): number | undefined {
    if (!validItem(tab, option) || this.remaining(tab, option) === 0) return;
    const slot = this.objects.length, id = this.nextId++;
    this.objects.push({ id, tab, option, x: 0.15 + slot % 4 * 0.13, y: 0.67 + Math.floor(slot / 4) % 3 * 0.08 });
    this.save(); return id;
  }
  move(id: number, x: number, y: number): boolean {
    const item = this.objects.find(item => item.id === id);
    if (!item || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    Object.assign(item, clampPlacement(x, y)); this.save(); return true;
  }
  remove(id: number): boolean {
    const index = this.objects.findIndex(item => item.id === id);
    if (index < 0) return false;
    this.objects.splice(index, 1); this.save(); return true;
  }
  private save(): void {
    this.revision++;
    try { this.storage?.setItem(HOME_STORAGE_KEY, JSON.stringify({ version: 2, ...this.value, items: this.objects })); } catch { /* Keep session changes. */ }
  }
}
