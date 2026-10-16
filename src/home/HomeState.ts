export const HOME_TABS = ['Background', 'Floor', 'Furniture', 'Etc'] as const;
export type HomeTab = typeof HOME_TABS[number];
export type HomeLook = Record<HomeTab, number>;
export const HOME_STORAGE_KEY = 'pawhaven.home.v1';
export const homeOptions: Record<HomeTab, number> = { Background: 4, Floor: 4, Furniture: 5, Etc: 5 };
export const SKY_COLORS = ['#edf0df', '#dce8ef', '#f0ded5', '#e4dff0'];
export const FLOOR_COLORS = ['#c4d6a7', '#d5c6a6', '#b8ced0', '#cfc3d8'];
export class HomeState {
  private value: HomeLook = { Background: 0, Floor: 0, Furniture: 0, Etc: 0 };
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const saved = JSON.parse(storage?.getItem(HOME_STORAGE_KEY) ?? 'null');
      if (saved && typeof saved === 'object') for (const tab of HOME_TABS) {
        if (Number.isInteger(saved[tab]) && saved[tab] >= 0 && saved[tab] < homeOptions[tab]) this.value[tab] = saved[tab];
      }
    } catch { /* The default map works without browser storage. */ }
  }
  get current(): HomeLook { return { ...this.value }; }
  select(tab: HomeTab, option: number): boolean {
    if (!HOME_TABS.includes(tab) || !Number.isInteger(option) || option < 0 || option >= homeOptions[tab]) return false;
    this.value[tab] = option;
    try { this.storage?.setItem(HOME_STORAGE_KEY, JSON.stringify(this.value)); } catch { /* Keep session changes. */ }
    return true;
  }
}