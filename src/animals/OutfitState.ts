import { wearableItem } from './Wearables';
import { speechSkinItem } from './SpeechSkins';
export const OUTFIT_TABS = ['Hat', 'Body', 'Acc', 'Etc'] as const;
/** Visible cosmetic tabs; Body remains a legacy save field. Effects appear with actual items. */
export const OUTFIT_MENU_TABS = ['Hat','Acc','Etc'] as const;
export type OutfitTab = typeof OUTFIT_TABS[number];
export type OutfitState = Record<OutfitTab, number>;
/** Items with character art connected across Character, Lobby and Play. */
export const outfitReady = (category: OutfitTab, index: number): boolean => !!wearableItem(category,index) || !!speechSkinItem(category,index);
export const outfitItems=(category:OutfitTab):number[]=>Array.from({length:20},(_,i)=>i+1).filter(index=>outfitReady(category,index));
export const createOutfit = (): OutfitState => ({ Hat: 0, Body: 0, Acc: 0, Etc: 0 });
export const outfitColor = (index: number): number => [0xc68e8e, 0x95adbf, 0xb2a0bd, 0xc2b17f, 0x8eaf9a][(index - 1) % 5] ?? 0x999999;
