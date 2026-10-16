import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { AnimalOutfit } from '../../animals/AnimalOutfit';
import { OUTFIT_TABS, outfitColor, type OutfitState, type OutfitTab } from '../../animals/OutfitState';
import { Scene } from './Scene';

export class CharacterScene extends Scene {
  private readonly preview = new Container();
  private readonly animation: AnimalAnimationController;
  private readonly outfitView = new AnimalOutfit();
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
    this.preview.addChild(this.animation.sprite, this.outfitView, this.animation.welcomeMark);
    this.outfitView.apply(outfit);
    this.panel.className = 'character-screen';
    this.panel.setAttribute('aria-label', 'Character customization');
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'character-close'; close.textContent = 'Close';
    close.addEventListener('click', onClose, { once: true, signal: this.abort.signal });
    this.tabs.className = 'outfit-tabs'; this.tabs.setAttribute('aria-label', 'Item categories');
    for (const tab of OUTFIT_TABS) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = tab;
      button.addEventListener('click', () => { this.tab = tab; this.refresh(); }, { signal: this.abort.signal });
      this.tabs.append(button);
    }
    this.inventory.className = 'outfit-inventory';
    this.inventory.setAttribute('aria-label', 'Items');
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
      button.textContent = index === 0 ? 'None' : String(index).padStart(2, '0');
      button.setAttribute('aria-label', index === 0 ? `Remove ${this.tab}` : `${this.tab} ${index}`);
      button.setAttribute('aria-pressed', String(this.outfit[this.tab] === index));
      if (index) button.style.setProperty('--item-color', '#' + outfitColor(index).toString(16).padStart(6, '0'));
      // The handler lives on its short-lived slot; discarding the slot releases it.
      button.addEventListener('click', () => {
        this.outfit[this.tab] = index; this.outfitView.apply(this.outfit); this.reaction = 1.5;
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