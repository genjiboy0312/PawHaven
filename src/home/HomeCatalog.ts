export type PlaceableTab = 'Furniture' | 'Etc';
export const HOME_STOCK = 3;
export const HOME_MAX_STOCK = 20;
export const homeOptions = { Background: 4, Floor: 4, Furniture: 6, Etc: 5 };
export const HOME_BACKGROUNDS = [
  {time:'morning',name:'homeMorning'}, {time:'noon',name:'homeNoon'},
  {time:'sunset',name:'homeSunset'}, {time:'night',name:'homeNight'},
] as const;
export const validHomeItem = (tab: unknown, index: unknown): tab is PlaceableTab =>
  (tab === 'Furniture' || tab === 'Etc') && Number.isInteger(index) && Number(index) > 0 && Number(index) < homeOptions[tab];
export const homeKey = (tab: PlaceableTab, index: number): string => tab + ':' + index;
export const homeInitialStock = (tab: PlaceableTab, index: number): number =>
  validHomeItem(tab, index) && !(tab === 'Furniture' && index === 5) ? HOME_STOCK : 0;
export const homePrice = (tab: PlaceableTab, index: number): number => tab === 'Furniture' && index === 5 ? 250 : 100 + index * 25;
export const HOME_ITEM_NAMES = {
  Furniture: ['none', 'homeBench', 'homePlant', 'homeTable', 'homeCushion', 'petSofa'],
  Etc: ['none', 'homeFlowers', 'homeStones', 'homeLamp', 'homeFence'],
} as const;
