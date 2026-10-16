import type { DestroyOptions } from 'pixi.js';
import { HOME_TABS, homeOptions, SKY_COLORS, FLOOR_COLORS, HomeState, type HomeTab } from '../../home/HomeState';
import { LobbyMap } from '../../home/LobbyMap';
import { bindAria, bindText, t } from '../../settings/i18n';
import { Scene } from './Scene';

export class HomeScene extends Scene {
  private readonly map = new LobbyMap();
  private readonly panel = document.createElement('section');
  private readonly tabs = document.createElement('nav');
  private readonly inventory = document.createElement('div');
  private readonly abort = new AbortController();
  private tab: HomeTab = 'Background';
  private viewWidth = 960;
  private viewHeight = 540;
  constructor(private readonly state: HomeState, onClose: () => void) {
    super(); this.addChild(this.map);
    this.panel.className = 'home-screen'; bindAria(this.panel, 'home');
    const title = document.createElement('h2'); title.className = 'shop-title'; bindText(title, 'home');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'character-close'; bindText(close, 'close');
    close.addEventListener('click', onClose, { once: true, signal: this.abort.signal });
    const drawer = document.createElement('div'); drawer.className = 'home-drawer';
    this.tabs.className = 'outfit-tabs home-tabs';
    for (const tab of HOME_TABS) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, tab);
      button.addEventListener('click', () => { this.tab = tab; this.render(); }, { signal: this.abort.signal }); this.tabs.append(button);
    }
    this.inventory.className = 'outfit-inventory home-inventory'; bindAria(this.inventory, 'items');
    const hint = document.createElement('p'); hint.className = 'home-hint'; bindText(hint, 'homeHint');
    this.panel.append(title, close, drawer, this.tabs, this.inventory, hint);
    document.querySelector('#app')?.append(this.panel); this.render();
  }
  private render(): void {
    const look = this.state.current;
    this.map.draw(this.viewWidth, this.viewHeight, look);
    Array.from(this.tabs.children).forEach((button, index) => button.setAttribute('aria-pressed', String(HOME_TABS[index] === this.tab)));
    this.inventory.replaceChildren(); this.inventory.scrollTop = 0;
    for (let index = 0; index < homeOptions[this.tab]; index++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-slot';
      button.setAttribute('aria-label', t(this.tab) + ' ' + (index + 1)); button.setAttribute('aria-pressed', String(look[this.tab] === index));
      if (index === 0 && (this.tab === 'Furniture' || this.tab === 'Etc')) bindText(button, 'none');
      else {
        const image = document.createElement('img'); image.className = 'outfit-object'; image.alt = '';
        const color = this.tab === 'Background' ? SKY_COLORS[index] : this.tab === 'Floor' ? FLOOR_COLORS[index] : ['#a99884', '#ad9478', '#92a382', '#b6a083', '#b8a0ac'][index];
        const shape = this.tab === 'Background' ? '<rect x="6" y="10" width="52" height="40" rx="8"/><circle cx="43" cy="22" r="6" fill="#fff8df"/>'
          : this.tab === 'Floor' ? '<ellipse cx="32" cy="37" rx="27" ry="12"/>'
          : this.tab === 'Furniture' ? '<rect x="11" y="19" width="42" height="17" rx="4"/><path d="M8 40h48M16 40v12m32-12v12"/>'
          : '<path d="M32 47V19m-7 34h14"/><circle cx="32" cy="22" r="13"/>';
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="${color}" stroke="#858d7e" stroke-width="2.5" stroke-linecap="round">${shape}</svg>`);
        button.append(image);
      }
      button.addEventListener('click', () => { this.state.select(this.tab, index); this.render(); }); this.inventory.append(button);
    }
  }
  resize(width: number, height: number): void { this.viewWidth = width; this.viewHeight = height; this.map.draw(width, height, this.state.current); }
  override destroy(options?: DestroyOptions): void { this.abort.abort(); this.panel.remove(); super.destroy(options); }
}