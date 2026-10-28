import type { OutfitTab } from './OutfitState';

/** Cosmetic entitlement shares the existing Etc slot, save and preset format. */
export const SKY_CLOUD = {
  category: 'Etc', index: 2, name: 'skyCloudBubble',
  file: 'speech-cloud-sky.png', price: 150,
  // Runtime crop only: retain the approved PNG unchanged, including its thought dots.
  frame: [248, 40, 1186, 888],
  // Body centre excludes the two thought dots below its central vertical axis.
  body: { centerX: 594, centerY: 340, width: 1170, height: 666 },
} as const;
export const speechSkinItem = (category: OutfitTab, index: number) =>
  category === SKY_CLOUD.category && index === SKY_CLOUD.index ? SKY_CLOUD : undefined;
