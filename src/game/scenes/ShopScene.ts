import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import { OUTFIT_TABS, type OutfitTab } from '../../animals/OutfitState';
import { bindAria, bindText, onLanguageChange, t } from '../../settings/i18n';
import { itemPrice } from '../../shop/ShopState';
import type { CommerceState } from '../../shop/CommerceState';
import { commerceStatus } from '../../ui/CommerceStatus';
import { itemIcon } from '../../ui/itemIcon';
import { passPanel } from '../../ui/PassPanel';
import { Scene } from './Scene';

const PURCHASE_LABELS = { owned: 'owned', purchased: 'shopPurchased', processing: 'economyWorking', loading: 'shopChecking', unavailable: 'shopUnavailable', available: 'buy', insufficient: 'notEnoughCoins' } as const;

export class ShopScene extends Scene {
  private readonly preview = new Container();
  private readonly animation: AnimalAnimationController;
  private readonly platform = new Graphics().ellipse(235, 395, 150, 28).fill('#d5ddc8');
  private readonly panel = document.createElement('section');
  private readonly balance = document.createElement('p');
  private readonly connection = document.createElement('div');
  private readonly content = document.createElement('div');
  private readonly tabs = document.createElement('nav');
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;
  private readonly localeOff: () => void;
  private grid?: HTMLDivElement;
  private lastPurchase?: { category: OutfitTab; index: number };
  private category: OutfitTab = 'Hat';
  private selected = 1;
  private elapsed = 0;
  private reaction = 0;
  private tab: 'Style' | 'Pass';
  constructor(config: AnimalConfig, private readonly state: CommerceState, onClose: () => void, private readonly onQuest: () => void, initial: 'Style' | 'Pass' = 'Style') {
    super(); this.tab = initial;
    this.animation = new AnimalAnimationController(config);
    this.addChild(new Graphics().rect(0, 0, 960, 540).fill('#edf0df'), this.platform, this.preview);
    this.preview.position.set(235, 385); this.preview.scale.set(1.45);
    this.preview.addChild(this.animation.sprite, this.animation.welcomeMark);
    this.panel.className = 'shop-screen';
    bindAria(this.panel, 'shop');
    const title = document.createElement('h2'); title.className = 'shop-title'; bindText(title, 'shop');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'character-close'; close.textContent = '×'; bindAria(close, 'close');
    close.addEventListener('click', onClose, { once: true, signal: this.abort.signal });
    this.balance.className = 'shop-balance';
    this.tabs.className = 'outfit-tabs shop-tabs';
    bindAria(this.tabs, 'shop');
    for (const tab of ['Style', 'Pass'] as const) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, tab);
      button.addEventListener('click', () => { this.tab = tab; this.grid = undefined; this.render(); }, { signal: this.abort.signal }); this.tabs.append(button);
    }
    this.connection.className = 'shop-connection';
    this.panel.append(title, close, this.balance, this.tabs, this.content, this.connection);
    document.querySelector('#app')?.append(this.panel);
    this.unsubscribe = state.subscribe(() => this.render());
    this.localeOff = onLanguageChange(() => this.render()); this.render(); this.update(0);
  }
  private render(): void {
    const scroll = this.grid?.scrollTop ?? 0; this.grid = undefined;
    this.balance.textContent = `${t('coins')}: ${this.state.entitlementsKnown ? this.state.coins : '—'}`;
    this.balance.setAttribute('data-loading', String(!this.state.entitlementsKnown));
    this.connection.replaceChildren(); const connection = commerceStatus(this.state); if (connection) this.connection.append(connection);
    this.preview.visible = this.platform.visible = this.tab === 'Style';
    Array.from(this.tabs.children).forEach((button, index) => button.setAttribute('aria-pressed', String((index === 0 ? 'Style' : 'Pass') === this.tab)));
    this.content.replaceChildren(); this.content.className = this.tab === 'Pass' ? 'shop-pass' : 'shop-style';
    if (this.tab === 'Pass') {
      this.content.append(passPanel(this.state, 'shop', this.onQuest));
      const quest = document.createElement('button'); quest.type = 'button'; quest.className = 'commerce-primary'; bindText(quest, 'viewPass');
      quest.addEventListener('click', this.onQuest); this.content.append(quest); return;
    }
    const categories = document.createElement('nav'); categories.className = 'outfit-tabs shop-categories';
    bindAria(categories, 'categories');
    for (const category of OUTFIT_TABS) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, category); button.setAttribute('aria-pressed', String(this.category === category));
      button.addEventListener('click', () => { this.category = category; this.selected = 1; this.grid = undefined; this.render(); }); categories.append(button);
    }
    const grid = document.createElement('div'); grid.className = 'outfit-inventory shop-grid';
    this.grid = grid; bindAria(grid, 'items');
    for (let index = 1; index <= 20; index++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-slot shop-slot';
      const owned = this.state.entitlementsKnown && this.state.owns(this.category, index);
      button.append(itemIcon(this.category, index));
      button.setAttribute('aria-label', `${this.itemName(this.category, index)} · ${owned ? t('owned') : `${itemPrice(index)} ${t('coins')}`}`);
      button.setAttribute('data-owned', String(owned));
      button.setAttribute('aria-pressed', String(this.selected === index));
      const price = document.createElement('span'); price.className = 'shop-price'; price.textContent = owned ? t('owned') : `${itemPrice(index)} ${t('coins')}`; button.append(price);
      button.addEventListener('click', () => { this.selected = index; this.reaction = 1.5; this.render(); }); grid.append(button);
    }
    const footer = document.createElement('div'); footer.className = 'shop-purchase';
    const detail = document.createElement('span'); detail.className = 'shop-detail';
    const name = document.createElement('strong'); name.textContent = this.itemName(this.category, this.selected);
    const cost = document.createElement('span'); cost.className = 'shop-cost'; cost.textContent = `${itemPrice(this.selected)} ${t('coins')}`;
    detail.append(name, cost);
    const buy = document.createElement('button'); buy.type = 'button'; buy.className = 'commerce-primary';
    const owned = this.state.entitlementsKnown && this.state.owns(this.category, this.selected), enough = this.state.coins >= itemPrice(this.selected);
    const purchased = owned && this.lastPurchase?.category === this.category && this.lastPurchase.index === this.selected;
    const status = !this.state.entitlementsKnown ? this.state.connection === 'loading' ? 'loading' : 'unavailable'
      : owned ? purchased ? 'purchased' : 'owned' : this.state.busy || this.state.connection === 'loading' ? 'processing'
      : !this.state.ready ? 'unavailable' : enough ? 'available' : 'insufficient';
    buy.setAttribute('data-purchase-state', status);
    footer.setAttribute('data-purchase-state', status);
    buy.textContent = t(PURCHASE_LABELS[status]);
    buy.disabled = owned || !enough || !this.state.ready;
    buy.addEventListener('click', () => {
      const category = this.category, index = this.selected;
      if (this.destroyed || buy.disabled || !this.state.ready || this.state.owns(category, index)) return;
      const result = this.state.buy(category, index);
      if (result instanceof Promise) void result.then(value => this.purchased(category, index, value));
      else this.purchased(category, index, result);
    });
    footer.append(detail, buy); this.content.append(categories, grid, footer);
    grid.scrollTop = scroll;
  }
  private itemName(category: OutfitTab, index: number): string {
    return category === 'Hat' && index === 1 ? t('santaHat') : `${t(category)} ${String(index).padStart(2, '0')}`;
  }
  private purchased(category: OutfitTab, index: number, result: string): void {
    if (this.destroyed || result !== 'purchased') return;
    this.lastPurchase = { category, index }; this.reaction = 1.5; this.render();
  }
  resize(_width: number, _height: number): void {}
  override update(seconds: number): void {
    this.elapsed += seconds; this.reaction = Math.max(0, this.reaction - seconds);
    this.animation.update(this.reaction > 0 ? 'EMOTE' : 'IDLE', this.elapsed, 1, 0, 0, seconds);
  }
  override destroy(options?: DestroyOptions): void {
    this.unsubscribe(); this.localeOff(); this.abort.abort(); this.panel.remove(); super.destroy(options); this.animation.sleepMark.destroy();
  }
}
