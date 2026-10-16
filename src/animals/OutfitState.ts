export const OUTFIT_TABS = ['Hat', 'Body', 'Acc', 'Etc'] as const;
export type OutfitTab = typeof OUTFIT_TABS[number];
export type OutfitState = Record<OutfitTab, number>;
export const createOutfit = (): OutfitState => ({ Hat: 0, Body: 0, Acc: 0, Etc: 0 });
export const outfitColor = (index: number): number => [0xc68e8e, 0x95adbf, 0xb2a0bd, 0xc2b17f, 0x8eaf9a][(index - 1) % 5] ?? 0x999999;