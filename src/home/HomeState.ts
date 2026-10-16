export const HOME_TABS = ['Background', 'Floor', 'Furniture', 'Etc'] as const;
export type HomeTab = typeof HOME_TABS[number];
export type HomeLook = Record<HomeTab, number>;
export const HOME_STORAGE_KEY = 'pawhaven.home.v1';
export const homeOptions: Record<HomeTab, number> = { Background: 4, Floor: 4, Furniture: 5, Etc: 5 };
export const SKY_COLORS = ['#edf0df', '#dce8ef', '#f0ded5', '#e4dff0'];
export const FLOOR_COLORS = ['#c4d6a7', '#d5c6a6', '#b8ced0', '#cfc3d8'];
export type PlaceableTab = 'Furniture' | 'Etc';
export interface Placement { x: number; y: number }
export type HomePlacements = Record<PlaceableTab, Placement>;
export const defaultPlacements = (): HomePlacements => ({ Furniture: { x: 0.21, y: 0.7 }, Etc: { x: 0.47, y: 0.7 } });
export function clampPlacement(x: number, y: number): Placement {
  return { x: Math.max(0.10, Math.min(0.56, x)), y: Math.max(0.62, Math.min(0.87, y)) };
}
/** Convert the CSS-rotated game surface back to normalized map coordinates. */
export function placementPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, rotated: boolean): Placement {
  return rotated ? { x: (clientY - rect.top) / rect.height, y: 1 - (clientX - rect.left) / rect.width }
    : { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
}
export class HomeState {
  private positions = defaultPlacements();
  get placements(): HomePlacements { return { Furniture: { ...this.positions.Furniture }, Etc: { ...this.positions.Etc } }; }
  move(tab: PlaceableTab, x: number, y: number): boolean {
    if (!['Furniture', 'Etc'].includes(tab) || !this.value[tab] || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    this.positions[tab] = clampPlacement(x, y); this.save(); return true;
  }
  private save(): void {
    try { this.storage?.setItem(HOME_STORAGE_KEY, JSON.stringify({ ...this.value, placements: this.positions })); } catch { /* Keep session changes. */ }
  }
  private value: HomeLook = { Background: 0, Floor: 0, Furniture: 0, Etc: 0 };
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const saved = JSON.parse(storage?.getItem(HOME_STORAGE_KEY) ?? 'null');
      if (saved && typeof saved === 'object') for (const tab of HOME_TABS) {
        if (Number.isInteger(saved[tab]) && saved[tab] >= 0 && saved[tab] < homeOptions[tab]) this.value[tab] = saved[tab];
      }
      for (const tab of ['Furniture', 'Etc'] as const) {
        const position = saved?.placements?.[tab];
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) this.positions[tab] = clampPlacement(position.x, position.y);
      }
    } catch { /* The default map works without browser storage. */ }
  }
  get current(): HomeLook { return { ...this.value }; }
  select(tab: HomeTab, option: number): boolean {
    if (!HOME_TABS.includes(tab) || !Number.isInteger(option) || option < 0 || option >= homeOptions[tab]) return false;
    this.value[tab] = option;
    this.save();
    return true;
  }
}