export type PlaceableTab = 'Furniture' | 'Etc';
export type HomeProductTab = PlaceableTab | 'Background' | 'Floor';
export const HOME_STOCK = 3;
export const HOME_MAX_STOCK = 20;
export const homeOptions = { Background: 5, Floor: 5, Furniture: 7, Etc: 8 };
export const HOME_BACKGROUNDS = [
  {time:'morning',name:'homeMorning'}, {time:'noon',name:'homeNoon'},
  {time:'sunset',name:'homeSunset'}, {time:'night',name:'homeNight'}, {time:'cherry',name:'homeCherrySky'},
] as const;
export const HOME_FLOORS=['homeGrassFloor','homeSandFloor','homeStoneFloor','homeLavenderFloor','homeSpringFloor'] as const;
export const validHomeItem = (tab: unknown, index: unknown): tab is PlaceableTab =>
  (tab === 'Furniture' || tab === 'Etc') && Number.isInteger(index) && Number(index) > 0 && Number(index) < homeOptions[tab];
export const validHomeProduct = (tab: unknown, index: unknown): tab is HomeProductTab => validHomeItem(tab,index) || (tab === 'Background'||tab === 'Floor') && Number.isInteger(index) && Number(index) >= 0 && Number(index) < homeOptions[tab];
export const homeKey = (tab: HomeProductTab, index: number): string => tab + ':' + index;
export const homeStockLimit = (tab: HomeProductTab): number => (tab === 'Background'||tab === 'Floor') ? 1 : HOME_MAX_STOCK;
export const homeInitialStock = (tab: HomeProductTab, index: number): number => (tab === 'Background'||tab === 'Floor') ? Number(index === 0) :
  validHomeItem(tab, index) && !(tab === 'Furniture' && index >= 5) && !(tab === 'Etc' && index >= 5) ? HOME_STOCK : 0;
export const homePrice = (tab: HomeProductTab, index: number): number => (tab === 'Background'||tab === 'Floor') ? 200 : tab === 'Furniture' && index >= 5 ? 250 : 100 + index * 25;
export const HOME_ITEM_NAMES = {
  Furniture: ['none', 'homeBench', 'homePlant', 'homeTable', 'homeCushion', 'petSofa', 'petHouse'],
  Etc: ['none', 'homeFlowers', 'homeStones', 'homeLamp', 'homeFence', 'homeGreenTree', 'homeCherryTree', 'homeCrate'],
} as const;
