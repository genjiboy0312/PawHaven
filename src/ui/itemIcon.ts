import { outfitColor, type OutfitTab } from '../animals/OutfitState';
import { wearableItem } from '../animals/Wearables';
import { speechSkinItem } from '../animals/SpeechSkins';

const ITEM_ICONS: Record<OutfitTab, string> = {
  Hat: '<path d="M16 37h32L43 25H23z"/><path d="M9 39q23-9 46 0v5H9z"/>',
  Body: '<path d="m20 16-11 12 9 8 4-5v22h20V31l4 5 9-8-11-12-7 6H27z"/>',
  Acc: '<path d="M19 16q-7 22 13 35 20-13 13-35" fill="none" stroke="currentColor" stroke-width="4"/><path d="m32 35 8 8-8 9-8-9z"/>',
  Etc: '<path d="m32 32-22-13v26zm0 0 22-13v26z"/><circle cx="32" cy="32" r="6"/>',
};

export function itemIcon(category: OutfitTab, index: number): HTMLImageElement {
  const image = document.createElement('img'); image.className = 'outfit-object'; image.alt = '';
  const skin = speechSkinItem(category, index);
  if (skin) { image.src = './assets/items/' + skin.file; image.className += ' bubble-skin-icon'; return image; }
  const item=wearableItem(category,index);
  if (item) {
    image.src = './assets/items/'+item.file;
    image.classList.add(item.texture==='santaHat'?'santa-hat-icon':item.texture==='topHat'?'top-hat-icon':'bow-tie-icon');
    return image;
  }
  const color = '#' + outfitColor(index).toString(16).padStart(6, '0');
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="${color}" color="${color}" stroke="#727970" stroke-width="1.5" stroke-linejoin="round">${ITEM_ICONS[category]}</svg>`);
  return image;
}
