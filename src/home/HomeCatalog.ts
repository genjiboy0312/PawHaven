export type PlaceableTab = 'Furniture' | 'Etc';
export type HomeProductTab = PlaceableTab | 'Background';
export const HOME_STOCK = 3;
export const HOME_MAX_STOCK = 20;
export const homeOptions = { Background: 5, Floor: 4, Furniture: 6, Etc: 8 };
export const HOME_BACKGROUNDS = [
  {time:'morning',name:'homeMorning'}, {time:'noon',name:'homeNoon'},
  {time:'sunset',name:'homeSunset'}, {time:'night',name:'homeNight'}, {time:'cherry',name:'homeCherrySky'},
] as const;
export const validHomeItem = (tab: unknown, index: unknown): tab is PlaceableTab =>
  (tab === 'Furniture' || tab === 'Etc') && Number.isInteger(index) && Number(index) > 0 && Number(index) < homeOptions[tab];
export const validHomeProduct = (tab: unknown, index: unknown): tab is HomeProductTab => validHomeItem(tab,index) || tab === 'Background' && Number.isInteger(index) && Number(index) >= 0 && Number(index) < homeOptions.Background;
export const homeKey = (tab: HomeProductTab, index: number): string => tab + ':' + index;
export const homeStockLimit = (tab: HomeProductTab): number => tab === 'Background' ? 1 : HOME_MAX_STOCK;
export const homeInitialStock = (tab: HomeProductTab, index: number): number => tab === 'Background' ? Number(index === 0) :
  validHomeItem(tab, index) && !(tab === 'Furniture' && index === 5) && !(tab === 'Etc' && index >= 5) ? HOME_STOCK : 0;
export const homePrice = (tab: HomeProductTab, index: number): number => tab === 'Background' ? 200 : tab === 'Furniture' && index === 5 ? 250 : 100 + index * 25;
export const HOME_ITEM_NAMES = {
  Furniture: ['none', 'homeBench', 'homePlant', 'homeTable', 'homeCushion', 'petSofa'],
  Etc: ['none', 'homeFlowers', 'homeStones', 'homeLamp', 'homeFence', 'homeGreenTree', 'homeCherryTree', 'homeCrate'],
} as const;
