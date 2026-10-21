import { SKY_COLORS, FLOOR_COLORS, type HomeTab } from '../home/HomeState';
import { HOME_ITEM_NAMES, type PlaceableTab } from '../home/HomeCatalog';
import { t } from '../settings/i18n';

export function homeItemName(tab: PlaceableTab, index: number): string { return t(HOME_ITEM_NAMES[tab][index]!); }
/** Shared icons for the Home inventory and its shop; the sofa uses the approved original PNG. */
export function homeIcon(tab: HomeTab, index: number): HTMLElement {
  if (tab === 'Furniture' && index === 5) {
    const frame = document.createElement('span'); frame.className = 'outfit-object pet-sofa-icon';
    const image = document.createElement('img'); image.src = './assets/home/pet-sofa-black-white.png'; image.alt = '';
    frame.append(image); return frame;
  }
  const image = document.createElement('img'); image.className = 'outfit-object'; image.alt = '';
  const color = tab === 'Background' ? SKY_COLORS[index] : tab === 'Floor' ? FLOOR_COLORS[index] : ['#a99884', '#ad9478', '#92a382', '#b6a083', '#b8a0ac'][index];
  const shape = tab === 'Background' ? '<rect x="6" y="10" width="52" height="40" rx="8"/><circle cx="43" cy="22" r="6" fill="#fff8df"/>'
    : tab === 'Floor' ? '<ellipse cx="32" cy="37" rx="27" ry="12"/>'
    : tab === 'Furniture' ? '<rect x="11" y="19" width="42" height="17" rx="4"/><path d="M8 40h48M16 40v12m32-12v12"/>'
    : '<path d="M32 47V19m-7 34h14"/><circle cx="32" cy="22" r="13"/>';
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="${color}" stroke="#858d7e" stroke-width="2.5" stroke-linecap="round">${shape}</svg>`);
  const resource = tab === 'Background' && index === 0 ? 'garden-background.png' : tab === 'Floor' && index === 0 ? 'garden-floor.png' : tab === 'Furniture' && index === 4 ? 'cushion.png' : undefined;
  if (resource) { image.src = './assets/home/' + resource; image.classList.add('home-pixel-icon'); }
  return image;
}
