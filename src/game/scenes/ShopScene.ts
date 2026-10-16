import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import { OUTFIT_TABS, type OutfitTab } from '../../animals/OutfitState';
import { bindText, t } from '../../settings/i18n';
import { itemPrice, ShopState } from '../../shop/ShopState';
import { itemIcon } from '../../ui/itemIcon';
import { passPanel } from '../../ui/PassPanel';
import { Scene } from './Scene';

export class ShopScene extends Scene {
  private readonly preview = new Container();
  private readonly animation: AnimalAnimationController;
  private readonly platform = new Graphics().ellipse(235, 395, 150, 28).fill('#d5ddc8');
  private readonly panel = document.createElement('section');
  private readonly balance = document.createElement('p');
  private readonly content = document.createElement('div');
  private readonly tabs = document.createElement('nav');
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;
  private category: OutfitTab = 'Hat';
  private selected = 1;
  private elapsed = 0;
  private reaction = 0;
  private tab: 'Style' | 'Pass';
  constructor(config: AnimalConfig, private readonly state: ShopState, onClose: () => void, private readonly onQuest: () => void, initial: 'Style' | 'Pass' = 'Style') {
    super(); this.tab = initial;
    this.animation = new AnimalAnimationController(config);
    this.addChild(new Graphics().rect(0, 0, 960, 540).fill('#edf0df'), this.platform, this.preview);
    this.preview.position.set(235, 385); this.preview.scale.set(1.45);
    this.preview.addChild(this.animation.sprite, this.animation.welcomeMark);
    this.panel.className = 'shop-screen';
    const title = document.createElement('h2'); title.className = 'shop-title'; bindText(title, 'shop');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'character-close'; bindText(close, 'close');
    close.addEventListener('click', onClose, { once: true, signal: this.abort.signal });
    this.balance.className = 'shop-balance';
    this.tabs.className = 'outfit-tabs shop-tabs';
    for (const tab of ['Style', 'Pass'] as const) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, tab);
      button.addEventListener('click', () => { this.tab = tab; this.render(); }, { signal: this.abort.signal }); this.tabs.append(button);
    }
    this.panel.append(title, close, this.balance, this.tabs, this.content);
    document.querySelector('#app')?.append(this.panel);
    this.unsubscribe = state.subscribe(() => this.render()); this.render(); this.update(0);
  }
  private render(): void {
    this.balance.textContent = `${t('testCoins')}: ${this.state.coins}`;
    this.preview.visible = this.platform.visible = this.tab === 'Style';
    Array.from(this.tabs.children).forEach((button, index) => button.setAttribute('aria-pressed', String((index === 0 ? 'Style' : 'Pass') === this.tab)));
    this.content.replaceChildren(); this.content.className = this.tab === 'Pass' ? 'shop-pass' : 'shop-style';
    if (this.tab === 'Pass') {
      this.content.append(passPanel(this.state, 'shop', this.onQuest));
      const quest = document.createElement('button'); quest.type = 'button'; quest.className = 'commerce-primary'; bindText(quest, 'viewPass');
      quest.addEventListener('click', this.onQuest); this.content.append(quest); return;
    }
    const categories = document.createElement('nav'); categories.className = 'outfit-tabs shop-categories';
    for (const category of OUTFIT_TABS) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, category); button.setAttribute('aria-pressed', String(this.category === category));
      button.addEventListener('click', () => { this.category = category; this.selected = 1; this.render(); }); categories.append(button);
    }
    const grid = document.createElement('div'); grid.className = 'outfit-inventory shop-grid';
    for (let index = 1; index <= 20; index++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-slot shop-slot';
      button.append(itemIcon(this.category, index)); button.setAttribute('aria-label', `${t(this.category)} ${index}`);
      button.setAttribute('aria-pressed', String(this.selected === index));
      const price = document.createElement('span'); price.className = 'shop-price'; price.textContent = this.state.owns(this.category, index) ? t('owned') : String(itemPrice(index)); button.append(price);
      button.addEventListener('click', () => { const scroll = grid.scrollTop; this.selected = index; this.reaction = 1.5; this.render(); const next = this.content.querySelector<HTMLElement>('.shop-grid'); if (next) next.scrollTop = scroll; }); grid.append(button);
    }
    const footer = document.createElement('div'); footer.className = 'shop-purchase';
    const detail = document.createElement('span'); detail.textContent = `${t(this.category)} ${String(this.selected).padStart(2, '0')} · ${itemPrice(this.selected)} ${t('coins')}`;
    const buy = document.createElement('button'); buy.type = 'button'; buy.className = 'commerce-primary';
    const owned = this.state.owns(this.category, this.selected), enough = this.state.coins >= itemPrice(this.selected);
    buy.textContent = t(owned ? 'owned' : enough ? 'buy' : 'notEnoughCoins'); buy.disabled = owned || !enough;
    buy.addEventListener('click', () => { if (this.state.buy(this.category, this.selected) === 'purchased') this.reaction = 1.5; });
    footer.append(detail, buy); this.content.append(categories, grid, footer);
  }
  resize(_width: number, _height: number): void {}
  override update(seconds: number): void {
    this.elapsed += seconds; this.reaction = Math.max(0, this.reaction - seconds);
    this.animation.update(this.reaction > 0 ? 'EMOTE' : 'IDLE', this.elapsed, 1, 0, 0, seconds);
  }
  override destroy(options?: DestroyOptions): void {
    this.unsubscribe(); this.abort.abort(); this.panel.remove(); super.destroy(options); this.animation.sleepMark.destroy();
  }
}