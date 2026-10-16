import { bindAria, bindText, t } from '../../settings/i18n';
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { OUTFIT_TABS, outfitColor, type OutfitState, type OutfitTab } from '../../animals/OutfitState';
import { Scene } from './Scene';

const ITEM_ICONS: Record<OutfitTab, string> = {
  Hat: '<path d="M16 37h32L43 25H23z"/><path d="M9 39q23-9 46 0v5H9z"/>',
  Body: '<path d="m20 16-11 12 9 8 4-5v22h20V31l4 5 9-8-11-12-7 6H27z"/>',
  Acc: '<path d="M19 16q-7 22 13 35 20-13 13-35" fill="none" stroke="currentColor" stroke-width="4"/><path d="m32 35 8 8-8 9-8-9z"/>',
  Etc: '<path d="m32 32-22-13v26zm0 0 22-13v26z"/><circle cx="32" cy="32" r="6"/>',
};

export class CharacterScene extends Scene {
  private readonly preview = new Container();
  private readonly animation: AnimalAnimationController;
  private readonly panel = document.createElement('section');
  private readonly tabs = document.createElement('nav');
  private readonly inventory = document.createElement('div');
  private readonly abort = new AbortController();
  private tab: OutfitTab = 'Hat';
  private elapsed = 0;
  private reaction = 0;

  constructor(config: AnimalConfig, private readonly outfit: OutfitState, onClose: () => void) {
    super();
    this.animation = new AnimalAnimationController(config);
    this.addChild(new Graphics().rect(0, 0, 960, 540).fill('#edf0df')
      .ellipse(235, 395, 150, 28).fill('#d5ddc8'), this.preview);
    this.preview.position.set(235, 385);
    this.preview.scale.set(1.45);
    this.preview.addChild(this.animation.sprite, this.animation.welcomeMark);
    this.panel.className = 'character-screen';
    bindAria(this.panel, 'customize');
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'character-close'; bindText(close, 'close');
    close.addEventListener('click', onClose, { once: true, signal: this.abort.signal });
    this.tabs.className = 'outfit-tabs'; bindAria(this.tabs, 'categories');
    for (const tab of OUTFIT_TABS) {
      const button = document.createElement('button');
      button.type = 'button'; bindText(button, tab);
      button.addEventListener('click', () => { this.tab = tab; this.refresh(); }, { signal: this.abort.signal });
      this.tabs.append(button);
    }
    this.inventory.className = 'outfit-inventory';
    bindAria(this.inventory, 'items');
    this.panel.append(close, this.tabs, this.inventory);
    document.querySelector('#app')?.append(this.panel);
    this.refresh(); this.update(0);
  }
  private refresh(): void {
    for (const [index, button] of Array.from(this.tabs.children).entries()) {
      button.setAttribute('aria-pressed', String(OUTFIT_TABS[index] === this.tab));
    }
    this.inventory.replaceChildren(); this.inventory.scrollTop = 0;
    for (let index = 0; index <= 20; index++) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'outfit-slot';
      if (index === 0) bindText(button, 'none');
      else {
        const image = document.createElement('img');
        image.className = 'outfit-object'; image.alt = '';
        const color = '#' + outfitColor(index).toString(16).padStart(6, '0');
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="${color}" color="${color}" stroke="#727970" stroke-width="1.5" stroke-linejoin="round">${ITEM_ICONS[this.tab]}</svg>`);
        button.append(image);
      }
      button.setAttribute('aria-label', index === 0 ? t('none') : t(this.tab) + ' ' + index);
      button.setAttribute('aria-pressed', String(this.outfit[this.tab] === index));
      // The handler lives on its short-lived slot; discarding the slot releases it.
      button.addEventListener('click', () => {
        this.outfit[this.tab] = index; this.reaction = 1.5;
        for (const [item, slot] of Array.from(this.inventory.children).entries()) {
          slot.setAttribute('aria-pressed', String(item === index));
        }
      });
      this.inventory.append(button);
    }
  }
  resize(_width: number, _height: number): void {}
  override update(seconds: number): void {
    this.elapsed += seconds; this.reaction = Math.max(0, this.reaction - seconds);
    const emote = this.reaction > 0 || this.elapsed % 10 >= 8;
    this.animation.update(emote ? 'EMOTE' : 'IDLE', this.elapsed, 1, 0, 0, seconds);
  }
  override destroy(options?: DestroyOptions): void {
    this.abort.abort(); this.panel.remove(); super.destroy(options);
    this.animation.sleepMark.destroy();
  }
}